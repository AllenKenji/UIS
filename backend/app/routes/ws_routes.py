# backend/app/routes/ws_routes.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Header, HTTPException, status
from starlette.websockets import WebSocketState
from backend.app.core.websocket_manager import manager
from backend.app.core.auth import _verify_token, get_db, require_permission
from backend.app.services.notification_service import NotificationService
from fastapi import Depends
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
import asyncio
import logging
import json
import os

router = APIRouter(tags=["websocket"])
logger = logging.getLogger("uvicorn.error")
OFFICER_ROLES = {"staff", "secretary", "treasurer", "sk", "dilg"}
OFFLINE_LOGOUT_GRACE_SECONDS = 3
SURVEY_SYNC_ROLES = {"surveyor", "supervisor"}
SURVEY_PRESENCE_TTL_SECONDS = 90
survey_presence_sessions: dict[str, dict] = {}


class SurveyPresencePayload(BaseModel):
    uid: str | None = None
    email: str | None = None
    name: str | None = None
    role: str
    sessionId: str
    online: bool = True


def _normalize_role(value: str | None) -> str:
    return str(value or "").strip().lower()


def _has_active_connection(uid: str, role: str) -> bool:
    normalized_uid = str(uid or "")
    normalized_role = _normalize_role(role)
    for info in manager.active_connections.values():
        if str(info.get("uid") or "") == normalized_uid and _normalize_role(info.get("role")) == normalized_role:
            return True
    return False


def _resolve_actor_name(uid: str, fallback: str = "Officer") -> str:
    try:
        db = get_db()
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            data = user_doc.to_dict() or {}
            return str(
                data.get("fullName")
                or data.get("full_name")
                or data.get("name")
                or data.get("email")
                or fallback
            )

        resident_doc = db.collection("residents").document(uid).get()
        if resident_doc.exists:
            data = resident_doc.to_dict() or {}
            return str(
                data.get("fullName")
                or data.get("full_name")
                or data.get("name")
                or data.get("email")
                or fallback
            )
    except Exception as err:
        logger.warning("⚠️ Failed to resolve actor name uid=%s: %s", uid, err)

    return fallback


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _prune_survey_presence_sessions():
    now = _utc_now()
    expired_session_ids = [
        session_id
        for session_id, payload in survey_presence_sessions.items()
        if payload.get("expires_at") is None or payload.get("expires_at") <= now
    ]

    for session_id in expired_session_ids:
        survey_presence_sessions.pop(session_id, None)


def _upsert_survey_presence_session(session_id: str, uid: str, role: str):
    survey_presence_sessions[session_id] = {
        "uid": str(uid or "").strip(),
        "role": _normalize_role(role),
        "expires_at": _utc_now() + timedelta(seconds=SURVEY_PRESENCE_TTL_SECONDS),
    }


def _clear_survey_presence_session(session_id: str):
    survey_presence_sessions.pop(str(session_id or "").strip(), None)


def _count_survey_presence_sessions_for_uid(uid: str) -> int:
    normalized_uid = str(uid or "").strip()
    if not normalized_uid:
        return 0

    _prune_survey_presence_sessions()
    return sum(
        1
        for payload in survey_presence_sessions.values()
        if str(payload.get("uid") or "").strip() == normalized_uid
    )


def _resolve_uid_from_email(email: str | None, role: str) -> str | None:
    normalized_email = str(email or "").strip().lower()
    normalized_role = _normalize_role(role)
    if not normalized_email:
        return None

    try:
        docs = get_db().collection("users").where("email", "==", normalized_email).stream()
        for doc in docs:
            data = doc.to_dict() or {}
            doc_role = _normalize_role(data.get("role"))
            if not doc_role or doc_role == normalized_role:
                return str(doc.id)
    except Exception as err:
        logger.warning("⚠️ Failed resolving uid by email=%s role=%s: %s", normalized_email, normalized_role, err)

    return None


def _get_survey_presence_users() -> dict[str, dict]:
    _prune_survey_presence_sessions()

    users: dict[str, dict] = {}
    for payload in survey_presence_sessions.values():
        uid = str(payload.get("uid") or "").strip()
        role = _normalize_role(payload.get("role"))
        if not uid:
            continue

        existing = users.get(uid, {"online": False, "count": 0, "role": role, "source": "survey"})
        existing["online"] = True
        existing["count"] = int(existing.get("count", 0)) + 1
        existing["role"] = role or existing.get("role")
        existing["source"] = "survey"
        users[uid] = existing

    return users


def _merge_presence_users(base_users: dict[str, dict], overlay_users: dict[str, dict]) -> dict[str, dict]:
    merged = dict(base_users)

    for uid, payload in overlay_users.items():
        existing = merged.get(uid, {"online": False, "count": 0, "role": payload.get("role")})
        existing["online"] = bool(existing.get("online")) or bool(payload.get("online"))
        existing["count"] = int(existing.get("count", 0)) + int(payload.get("count", 0))
        if payload.get("role"):
            existing["role"] = payload.get("role")
        if payload.get("source"):
            existing["source"] = payload.get("source")
        merged[uid] = existing

    return merged


def _is_valid_internal_presence_key(provided_key: str | None) -> bool:
    expected_key = os.environ.get("FDP_TO_BIS_PROVISION_API_KEY", "").strip()
    return bool(expected_key) and (provided_key or "").strip() == expected_key


def _recent_officer_logout_exists(uid: str, window_seconds: int = 30) -> bool:
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        docs = (
            get_db()
            .collection("notifications")
            .where("role", "==", "admin")
            .where("type", "==", "logout")
            .where("scope", "==", "officer")
            .where("user_id", "==", uid)
            .stream()
        )
        for doc in docs:
            payload = doc.to_dict() or {}
            ts = payload.get("timestamp")
            dt = None
            if hasattr(ts, "to_datetime"):
                dt = ts.to_datetime()
            elif isinstance(ts, datetime):
                dt = ts
            elif isinstance(ts, str):
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except Exception:
                    dt = None

            if dt and dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)

            if dt and dt >= cutoff:
                return True
    except Exception as err:
        logger.warning("⚠️ Failed checking recent officer logout uid=%s: %s", uid, err)

    return False


async def _emit_disconnect_logout_if_still_offline(uid: str, role: str):
    normalized_role = _normalize_role(role)
    if normalized_role not in OFFICER_ROLES:
        return

    await asyncio.sleep(OFFLINE_LOGOUT_GRACE_SECONDS)

    if _has_active_connection(uid, normalized_role):
        return

    if _recent_officer_logout_exists(uid, window_seconds=45):
        return

    actor_name = _resolve_actor_name(uid)
    officer_role = normalized_role.replace("_", " ").title()

    try:
        await NotificationService.notify(
            role="admin",
            type="logout",
            message=f"{officer_role} {actor_name} logged out",
            scope="officer",
            user=actor_name,
            user_id=uid,
        )
        logger.info(
            "WebSocket-disconnect logout notify uid=%s resolved_role=%s name=%s",
            uid,
            normalized_role,
            actor_name,
        )
    except Exception as err:
        logger.warning("⚠️ Failed websocket-disconnect logout notify uid=%s: %s", uid, err)


@router.post("/api/internal/fdp/presence")
async def sync_fdp_presence(
    payload: SurveyPresencePayload,
    x_fdp_provision_key: str | None = Header(default=None),
):
    if not _is_valid_internal_presence_key(x_fdp_provision_key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    normalized_role = _normalize_role(payload.role)
    if normalized_role not in SURVEY_SYNC_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only surveyor or supervisor roles are allowed")

    session_id = str(payload.sessionId or "").strip()
    uid = str(payload.uid or "").strip()
    if not uid:
        uid = str(_resolve_uid_from_email(payload.email, normalized_role) or "").strip()

    if not session_id or not uid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sessionId and either uid or resolvable email are required")

    _prune_survey_presence_sessions()
    before_count = _count_survey_presence_sessions_for_uid(uid)

    if payload.online:
        _upsert_survey_presence_session(session_id, uid, normalized_role)
    else:
        _clear_survey_presence_session(session_id)

    after_count = _count_survey_presence_sessions_for_uid(uid)

    actor_name = str(payload.name or "").strip() or _resolve_actor_name(uid)
    officer_role = normalized_role.replace("_", " ").title()

    if before_count == 0 and after_count > 0:
        try:
            await NotificationService.notify(
                role="admin",
                type="login",
                message=f"{officer_role} {actor_name} logged in",
                scope="officer",
                user=actor_name,
                user_id=uid,
            )
        except Exception as err:
            logger.warning("⚠️ Failed FDP login notify uid=%s: %s", uid, err)

    if before_count > 0 and after_count == 0:
        try:
            await NotificationService.notify(
                role="admin",
                type="logout",
                message=f"{officer_role} {actor_name} logged out",
                scope="officer",
                user=actor_name,
                user_id=uid,
            )
        except Exception as err:
            logger.warning("⚠️ Failed FDP logout notify uid=%s: %s", uid, err)

    return {"success": True}


@router.get("/api/ws/presence/roles")
async def get_role_presence(_uid: str = Depends(require_permission("manageUsers"))):
    role_counts = {}
    for info in manager.active_connections.values():
        role = str(info.get("role") or "resident").strip().lower()
        role_counts[role] = role_counts.get(role, 0) + 1

    for payload in _get_survey_presence_users().values():
        role = str(payload.get("role") or "resident").strip().lower()
        role_counts[role] = role_counts.get(role, 0) + int(payload.get("count", 0) or 0)

    tracked_roles = ["admin", "secretary", "staff", "treasurer", "sk", "dilg", "resident", "surveyor", "supervisor"]
    roles = {
        role: {
            "online": role_counts.get(role, 0) > 0,
            "count": role_counts.get(role, 0),
        }
        for role in tracked_roles
    }

    for role, count in role_counts.items():
        if role not in roles:
            roles[role] = {"online": count > 0, "count": count}

    return {
        "roles": roles,
        "total_active_connections": len(manager.active_connections) + len(survey_presence_sessions),
    }


@router.get("/api/ws/presence/users")
async def get_user_presence(_uid: str = Depends(require_permission("manageUsers"))):
    users = {}

    for info in manager.active_connections.values():
        uid = str(info.get("uid") or "").strip()
        if not uid:
            continue

        role = str(info.get("role") or "resident").strip().lower()
        existing = users.get(uid, {"online": False, "count": 0, "role": role})
        existing["online"] = True
        existing["count"] = int(existing.get("count", 0)) + 1
        existing["role"] = role
        users[uid] = existing

    users = _merge_presence_users(users, _get_survey_presence_users())

    return {
        "users": users,
        "total_active_connections": len(manager.active_connections) + len(survey_presence_sessions),
    }

@router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket, token: str = Query(None)):
    user_info = None
    try:
        await websocket.accept()

        token_value = None
        auth_method = None

        # First, check query string
        if token:
            token_value = token
            auth_method = "query"
        else:
            # Otherwise, expect the client to send token as first message
            try:
                initial_msg = await websocket.receive_text()
                payload = json.loads(initial_msg)
                token_value = payload.get("token")
                auth_method = "message"
            except Exception:
                await websocket.close(code=4001, reason="Missing authentication token")
                return

        if not token_value:
            await websocket.close(code=4001, reason="Missing authentication token")
            return

        logger.info("🔑 Auth method=%s", auth_method)

        # Verify token
        try:
            decoded = _verify_token(f"Bearer {token_value}")
        except Exception as e:
            logger.error("❌ Token verification failed: %s", e)
            await websocket.close(code=4001, reason="Invalid token")
            return

        uid = decoded.get("uid")
        role = decoded.get("role")
        roles = decoded.get("roles")

        if not role and uid:
            db = get_db()
            user_doc = db.collection("users").document(uid).get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                role = user_data.get("role")
                roles = user_data.get("roles")
            elif db.collection("residents").document(uid).get().exists:
                role = "resident"

        role = (str(role or "resident").strip().lower())
        # A multi-role account (e.g. staff+secretary) should keep receiving live
        # notifications for every one of its roles, not just whichever one is
        # currently active in the session — matches the REST fetch in
        # notification_routes.get_notifications.
        normalized_roles = [str(r).strip().lower() for r in (roles or [role]) if r] or [role]
        user_info = {"uid": uid, "role": role, "roles": normalized_roles, "user_id": uid, "auth_method": auth_method}

        await manager.connect(websocket, user_info)
        logger.info("✅ WebSocket connected for uid=%s role=%s via %s", uid, role, auth_method)

        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("❌ WebSocket disconnected")

    except Exception as e:
        logger.error("❌ WebSocket error uid=%s: %s", user_info.get("user_id") if user_info else "unknown", e)
        if websocket.client_state != WebSocketState.CLOSED:
            await websocket.close(code=1011)
        manager.disconnect(websocket)

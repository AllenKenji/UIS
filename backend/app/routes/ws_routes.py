# backend/app/routes/ws_routes.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState
from backend.app.core.websocket_manager import manager
from backend.app.core.auth import _verify_token, get_db, require_permission
from backend.app.services.notification_service import NotificationService
from fastapi import Depends
from datetime import datetime, timedelta, timezone
import asyncio
import logging
import json

router = APIRouter(tags=["websocket"])
logger = logging.getLogger("uvicorn.error")
OFFICER_ROLES = {"staff", "secretary", "treasurer", "sk", "dilg"}


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

    await asyncio.sleep(8)

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


@router.get("/api/ws/presence/roles")
async def get_role_presence(_uid: str = Depends(require_permission("manageUsers"))):
    role_counts = {}
    for info in manager.active_connections.values():
        role = str(info.get("role") or "resident").strip().lower()
        role_counts[role] = role_counts.get(role, 0) + 1

    tracked_roles = ["admin", "secretary", "staff", "treasurer", "sk", "dilg", "resident"]
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
        "total_active_connections": len(manager.active_connections),
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

        if not role and uid:
            db = get_db()
            user_doc = db.collection("users").document(uid).get()
            if user_doc.exists:
                role = user_doc.to_dict().get("role")
            elif db.collection("residents").document(uid).get().exists:
                role = "resident"

        role = (str(role or "resident").strip().lower())
        user_info = {"uid": uid, "role": role, "user_id": uid, "auth_method": auth_method}

        await manager.connect(websocket, user_info)
        logger.info("✅ WebSocket connected for uid=%s role=%s via %s", uid, role, auth_method)

        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("❌ WebSocket disconnected")
        if user_info and user_info.get("uid"):
            asyncio.create_task(_emit_disconnect_logout_if_still_offline(str(user_info.get("uid")), str(user_info.get("role"))))

    except Exception as e:
        logger.error("❌ WebSocket error uid=%s: %s", user_info.get("user_id") if user_info else "unknown", e)
        if websocket.client_state != WebSocketState.CLOSED:
            await websocket.close(code=1011)
        manager.disconnect(websocket)
        if user_info and user_info.get("uid"):
            asyncio.create_task(_emit_disconnect_logout_if_still_offline(str(user_info.get("uid")), str(user_info.get("role"))))

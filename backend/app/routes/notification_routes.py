# backend/app/routes/notification_routes.py

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from typing import List, Set, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
import logging
from backend.app.services.notification_service import NotificationService
from backend.app.models.notification import Notification
from backend.app.core.auth import get_current_user
from backend.app.core.websocket_manager import manager
from backend.app.utils.firestore_utils import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = logging.getLogger("uvicorn.error")

class ResidentLoginPayload(BaseModel):
    count: int

class OfficerLoginPayload(BaseModel):
    name: str = "Officer"
    role: str = "officer"


class LogoutSelfPayload(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    count: Optional[int] = 1


class BusinessSubmittedPayload(BaseModel):
    resident_name: str
    business_name: str | None = None


class BusinessStatusUpdatePayload(BaseModel):
    status: str
    resident_uid: str | None = None
    business_id: str | None = None
    firestore_id: str | None = None
    business_name: str | None = None


class SkExpenseNotificationPayload(BaseModel):
    activity_type: str
    title: str
    category: str | None = None
    amount: float | int


def _resident_message(event_type: str, count: int) -> str:
    if event_type == "login":
        return f"{count} resident logged in" if count == 1 else f"{count} residents logged in"
    return f"{count} resident logged out" if count == 1 else f"{count} residents logged out"


def _format_currency(value: float | int) -> str:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        amount = 0.0
    return f"Php {amount:,.2f}"


def _record_login_event(
    *,
    event_type: str = "login",
    scope: str,
    actor_role: str,
    actor_uid: Optional[str],
    actor_name: Optional[str],
    count: int = 1,
):
    try:
        now = datetime.now(timezone.utc)
        payload = {
            "type": "logout" if str(event_type).strip().lower() == "logout" else "login",
            "scope": scope,
            "role": actor_role,
            "user_id": actor_uid,
            "user": actor_name,
            "count": max(1, int(count or 1)),
            "timestamp": now,
            "createdAt": now,
        }
        get_db().collection("logins").add(payload)
    except Exception as err:
        logger.warning("⚠️ Failed to record login event: %s", err)


def _first_or_none(stream):
    for item in stream:
        return item
    return None


def _normalize_role(value: str | None) -> str:
    return str(value or "").strip().lower()


def _effective_roles(user: dict) -> List[str]:
    """
    All roles a multi-role account should see notifications for — not just
    whichever one is currently active in the session. Switching the active
    role (POST /auth/switch-role) only changes what the UI acts as; it
    shouldn't hide notifications addressed to the account's other roles.
    """
    roles = user.get("roles") or [user.get("role")]
    normalized = [_normalize_role(r) for r in roles if r]
    return normalized or [_normalize_role(user.get("role")) or "resident"]


def _notification_docs_for_roles(roles: List[str]):
    """Merge per-role notification queries (the query layer has no "in" operator)."""
    seen_ids = set()
    for role in roles:
        for doc in get_db().collection("notifications").where("role", "==", role).stream():
            if doc.id in seen_ids:
                continue
            seen_ids.add(doc.id)
            yield doc


def _resolve_actor_identity(user: dict, fallback_name: str = "Officer", fallback_role: str = "officer") -> tuple[str, str]:
    uid = user.get("uid")
    if not uid:
        return fallback_name, fallback_role

    try:
        db = get_db()
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            data = user_doc.to_dict() or {}
            name = (
                data.get("fullName")
                or data.get("full_name")
                or data.get("name")
                or data.get("email")
                or fallback_name
            )
            role = _normalize_role(data.get("role")) or fallback_role
            return str(name), str(role)

        resident_doc = db.collection("residents").document(uid).get()
        if resident_doc.exists:
            data = resident_doc.to_dict() or {}
            name = (
                data.get("fullName")
                or data.get("full_name")
                or data.get("name")
                or data.get("email")
                or fallback_name
            )
            # If caller already provided a non-resident role (e.g. secretary/treasurer/sk/dilg),
            # keep that role so officer logout/login notifications are not downgraded to resident.
            normalized_fallback = _normalize_role(fallback_role)
            resolved_role = "resident" if normalized_fallback in {"", "resident"} else normalized_fallback
            return str(name), resolved_role
    except Exception as err:
        logger.warning("⚠️ Failed to resolve actor identity for %s: %s", uid, err)

    return fallback_name, fallback_role


def _resolve_audience_user_ids(data: dict) -> Set[str]:
    """
    Resolve intended recipient UIDs for a notification document.
    - user_id present => single-recipient notification
    - role-targeted => all users with that role in users collection
    """
    explicit_uid = data.get("user_id")
    if explicit_uid:
        return {str(explicit_uid)}

    target_role = _normalize_role(data.get("role"))
    if not target_role:
        return set()

    if target_role == "resident":
        return set()

    audience: Set[str] = set()
    try:
        users = get_db().collection("users").where("role", "==", target_role).stream()
        for doc in users:
            audience.add(doc.id)
    except Exception:
        return set()

    return audience


def _is_notification_visible_to_user(data: dict, roles: List[str], uid: str) -> bool:
    target_role = _normalize_role(data.get("role"))
    if "admin" in roles:
        return target_role == "admin"
    if "resident" in roles:
        return str(data.get("user_id") or "") == str(uid)
    return target_role in roles


def _iter_scoped_notification_docs(roles: List[str], uid: str):
    if "admin" in roles:
        return get_db().collection("notifications").where("role", "==", "admin").stream()
    if "resident" in roles:
        return get_db().collection("notifications").where("user_id", "==", uid).stream()
    return _notification_docs_for_roles(roles)


def _resolve_business_owner_uid(payload: BusinessStatusUpdatePayload) -> Optional[str]:
    if payload.resident_uid:
        return str(payload.resident_uid)

    db = get_db()
    business_data = None

    try:
        if payload.firestore_id:
            doc = db.collection("businesses").document(payload.firestore_id).get()
            if doc.exists:
                business_data = doc.to_dict() or {}
        elif payload.business_id:
            docs = db.collection("businesses").where("businessId", "==", payload.business_id).limit(1).stream()
            first = _first_or_none(docs)
            if first:
                business_data = first.to_dict() or {}
    except Exception:
        business_data = None

    if not business_data:
        return None

    owner_uid = business_data.get("ownerUid")
    if owner_uid:
        return str(owner_uid)

    email = business_data.get("email")
    if not email:
        return None

    try:
        users = db.collection("users").where("email", "==", email).limit(1).stream()
        user_doc = _first_or_none(users)
        if user_doc:
            return str(user_doc.id)
    except Exception:
        pass

    try:
        residents = db.collection("residents").where("email", "==", email).limit(1).stream()
        resident_doc = _first_or_none(residents)
        if resident_doc:
            return str(resident_doc.id)
    except Exception:
        pass

    return None


def _delete_for_user_or_globally(doc, uid: str):
    data = doc.to_dict() or {}
    deleted_by = {str(item) for item in (data.get("deleted_by") or [])}

    if str(uid) in deleted_by:
        return {"status": "already_deleted_for_user", "notification_id": doc.id}

    deleted_by.add(str(uid))
    audience_user_ids = _resolve_audience_user_ids(data)

    if audience_user_ids and audience_user_ids.issubset(deleted_by):
        doc.reference.delete()
        return {
            "status": "deleted_globally",
            "notification_id": doc.id,
            "deleted_by_count": len(deleted_by),
        }

    doc.reference.update({"deleted_by": sorted(deleted_by)})
    return {
        "status": "deleted_for_user",
        "notification_id": doc.id,
        "deleted_by_count": len(deleted_by),
    }


async def _broadcast_admin_notification(data: dict):
    payload = dict(data)
    await manager.broadcast(payload, role="admin")


async def _upsert_unread_resident_aggregate(event_type: str, delta: int) -> dict:
    collection = get_db().collection("notifications")
    existing = _first_or_none(
        collection
        .where("role", "==", "admin")
        .where("scope", "==", "resident")
        .where("type", "==", event_type)
        .where("read", "==", False)
        .limit(1)
        .stream()
    )

    if existing:
        current = existing.to_dict() or {}
        next_count = max(0, int(current.get("count") or 0) + int(delta))
        updates = {
            "count": next_count,
            "message": _resident_message(event_type, next_count),
            "timestamp": datetime.now(timezone.utc),
            "read": False,
        }
        existing.reference.update(updates)
        updated = {**current, **updates, "id": existing.id}
        await _broadcast_admin_notification(updated)
        return updated

    if delta <= 0:
        return {"count": 0}

    notif = await NotificationService.notify(
        role="admin",
        type=event_type,
        message=_resident_message(event_type, delta),
        scope="resident",
        count=delta,
    )
    return notif.model_dump()


async def _decrement_unread_resident_logins(delta: int):
    collection = get_db().collection("notifications")
    login_doc = _first_or_none(
        collection
        .where("role", "==", "admin")
        .where("scope", "==", "resident")
        .where("type", "==", "login")
        .where("read", "==", False)
        .limit(1)
        .stream()
    )

    if not login_doc:
        return

    current = login_doc.to_dict() or {}
    current_count = int(current.get("count") or 0)
    next_count = max(0, current_count - int(delta))

    updates = {
        "count": next_count,
        "message": _resident_message("login", next_count),
        "timestamp": datetime.now(timezone.utc),
        "read": next_count == 0,
    }
    login_doc.reference.update(updates)
    updated = {**current, **updates, "id": login_doc.id}
    await _broadcast_admin_notification(updated)


async def _notify_multiple(notifications: List[dict]) -> List[Notification]:
    """
    Helper to notify multiple roles/types in one call.
    Returns the list of Notification objects created.
    """
    results = []
    for n in notifications:
        notif = await NotificationService.notify(**n)
        results.append(notif)
    return results

@router.get("/", response_model=List[Notification])
async def get_notifications(user: dict = Depends(get_current_user)):
    """
    Fetch notifications for the current user.
    - Admin: see all notifications.
    - Resident: only own notifications (user_id filter).
    - Other roles: notifications addressed to any of the account's roles, not
      just whichever one is currently active in the session.
    """
    roles = _effective_roles(user)
    uid = user.get("uid")

    try:
        query = get_db().collection("notifications")

        if "admin" in roles:
            docs = query.where("role", "==", "admin").stream()
        elif "resident" in roles:
            docs = query.where("user_id", "==", uid).stream()
        else:
            docs = _notification_docs_for_roles(roles)

        notifications = []
        for doc in docs:
            data = doc.to_dict()
            deleted_by = {str(item) for item in (data.get("deleted_by") or [])}
            if uid and str(uid) in deleted_by:
                continue
            try:
                notifications.append(Notification(**data))
            except Exception as e:
                # Skip malformed documents
                import logging
                logging.getLogger("uvicorn.error").warning("⚠️ Skipping invalid notification doc: %s", e)

        notifications.sort(key=lambda n: n.timestamp, reverse=True)

        return notifications

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch notifications: {str(e)}")
    
@router.patch("/{notification_id}/read", response_model=Notification)
async def mark_notification_read(
    notification_id: str = Path(..., description="Notification ID"),
    user: dict = Depends(get_current_user)
):
    """
    Mark a notification as read.
    - Residents can only mark their own notifications.
    - Admin/staff/secretary can mark any notification.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        doc_ref = get_db().collection("notifications").document(notification_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Notification not found")

        data = doc.to_dict()

        # Residents can only mark their own notifications
        if role == "resident" and data.get("user_id") != uid:
            raise HTTPException(status_code=403, detail="Not authorized to modify this notification")

        # Update read status
        doc_ref.update({"read": True})
        data["read"] = True

        return Notification(**data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update notification: {str(e)}")

@router.post("/resident-login", response_model=Notification)
async def resident_login(payload: ResidentLoginPayload, user: dict = Depends(get_current_user)):
    """Admin unread resident-login aggregate increments until read."""
    step = max(1, int(payload.count or 1))
    _record_login_event(
        event_type="login",
        scope="resident",
        actor_role="resident",
        actor_uid=user.get("uid"),
        actor_name=user.get("fullName") or user.get("name") or user.get("email"),
        count=step,
    )
    updated = await _upsert_unread_resident_aggregate("login", step)
    return Notification(**updated)

@router.post("/resident-logout", response_model=Notification)
async def resident_logout(payload: ResidentLoginPayload, user: dict = Depends(get_current_user)):
    """Admin unread resident-logout aggregate increments and unread login aggregate decrements."""
    step = max(1, int(payload.count or 1))
    await _decrement_unread_resident_logins(step)
    updated = await _upsert_unread_resident_aggregate("logout", step)
    return Notification(**updated)

@router.post("/officer-login", response_model=Notification)
async def officer_login(payload: OfficerLoginPayload, user: dict = Depends(get_current_user)):
    """Admin receives officer login notifications with names."""
    fallback_role = _normalize_role(payload.role or user.get("role") or "officer") or "officer"
    fallback_name = payload.name or user.get("fullName") or user.get("name") or user.get("email") or "Officer"
    resolved_name, resolved_role = _resolve_actor_identity(user, fallback_name, fallback_role)
    officer_role = resolved_role.replace("_", " ").title()
    _record_login_event(
        event_type="login",
        scope="officer",
        actor_role=resolved_role,
        actor_uid=user.get("uid"),
        actor_name=resolved_name,
        count=1,
    )
    logger.info(
        "Officer login notify uid=%s payload_role=%s resolved_role=%s name=%s",
        user.get("uid"),
        _normalize_role(payload.role),
        resolved_role,
        resolved_name,
    )
    return await NotificationService.notify(
        role="admin",
        type="login",
        message=f"{officer_role} {resolved_name} logged in",
        scope="officer",
        user=resolved_name,
        user_id=user.get("uid"),
    )

@router.post("/officer-logout", response_model=Notification)
async def officer_logout(payload: OfficerLoginPayload, user: dict = Depends(get_current_user)):
    """Admin receives officer logout notifications with names."""
    fallback_role = _normalize_role(payload.role or user.get("role") or "officer") or "officer"
    fallback_name = payload.name or user.get("fullName") or user.get("name") or user.get("email") or "Officer"
    resolved_name, resolved_role = _resolve_actor_identity(user, fallback_name, fallback_role)
    officer_role = resolved_role.replace("_", " ").title()
    _record_login_event(
        event_type="logout",
        scope="officer",
        actor_role=resolved_role,
        actor_uid=user.get("uid"),
        actor_name=resolved_name,
        count=1,
    )
    logger.info(
        "Officer logout notify uid=%s payload_role=%s resolved_role=%s name=%s",
        user.get("uid"),
        _normalize_role(payload.role),
        resolved_role,
        resolved_name,
    )
    return await NotificationService.notify(
        role="admin",
        type="logout",
        message=f"{officer_role} {resolved_name} logged out",
        scope="officer",
        user=resolved_name,
        user_id=user.get("uid"),
    )


@router.post("/logout-self", response_model=Notification)
async def logout_self(payload: LogoutSelfPayload = None, user: dict = Depends(get_current_user)):
    """Create logout notification based on the authenticated user role."""
    requested_name = (payload.name if payload else None) or None
    requested_role = _normalize_role(payload.role if payload else None) or None
    fallback_name = requested_name or user.get("fullName") or user.get("name") or user.get("email") or "Officer"
    fallback_role = requested_role or _normalize_role(user.get("role")) or "officer"
    resolved_name, resolved_role = _resolve_actor_identity(user, fallback_name, fallback_role)

    if requested_name:
        resolved_name = requested_name
    if requested_role:
        resolved_role = requested_role

    if resolved_role == "resident":
        step = max(1, int((payload.count if payload else 1) or 1))
        await _decrement_unread_resident_logins(step)
        updated = await _upsert_unread_resident_aggregate("logout", step)
        return Notification(**updated)

    officer_role = resolved_role.replace("_", " ").title()

    _record_login_event(
        event_type="logout",
        scope="officer",
        actor_role=resolved_role,
        actor_uid=user.get("uid"),
        actor_name=resolved_name,
        count=1,
    )

    return await NotificationService.notify(
        role="admin",
        type="logout",
        message=f"{officer_role} {resolved_name} logged out",
        scope="officer",
        user=resolved_name,
        user_id=user.get("uid"),
    )


@router.post("/incident", response_model=List[Notification])
async def incident_submitted(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + staff receive incident submission notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "incident", "message": f"Incident submitted by {resident_name}"},
        {"role": "staff", "type": "incident", "message": "New incident submitted"},
    ])

@router.post("/complaint", response_model=List[Notification])
async def complaint_submitted(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + staff receive complaint submission notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "complaint", "message": f"Complaint submitted by {resident_name}"},
        {"role": "staff", "type": "complaint", "message": "New complaint submitted"},
    ])

@router.post("/business", response_model=List[Notification])
async def business_registration(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + staff receive business registration notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "business", "message": f"Business registration submitted by {resident_name}"},
        {"role": "staff", "type": "business", "message": "New business registration submitted"},
    ])


@router.post("/business-submitted", response_model=List[Notification])
async def business_submitted(payload: BusinessSubmittedPayload, user: dict = Depends(get_current_user)):
    """Admin + staff receive business submission notifications."""
    business_suffix = f" ({payload.business_name})" if payload.business_name else ""
    return await _notify_multiple([
        {
            "role": "admin",
            "type": "business",
            "message": f"Business registration submitted by {payload.resident_name}{business_suffix}",
        },
        {
            "role": "staff",
            "type": "business",
            "message": f"New business registration submitted{business_suffix}",
        },
    ])


@router.post("/business-status-update", response_model=List[Notification])
async def business_status_update(payload: BusinessStatusUpdatePayload, user: dict = Depends(get_current_user)):
    """Admin + staff + owner resident receive business status update notifications."""
    status_label = payload.status.replace("_", " ")
    business_suffix = f" ({payload.business_name})" if payload.business_name else ""
    resolved_resident_uid = _resolve_business_owner_uid(payload)
    notifications = [
        {
            "role": "admin",
            "type": "business_update",
            "message": f"Business status updated to {status_label}{business_suffix}",
        },
        {
            "role": "staff",
            "type": "business_update",
            "message": f"Business status updated to {status_label}{business_suffix}",
        },
    ]

    if resolved_resident_uid:
        notifications.append({
            "role": "resident",
            "type": "business_update",
            "message": f"Your business status was updated to {status_label}{business_suffix}",
            "user_id": resolved_resident_uid,
        })

    return await _notify_multiple(notifications)

@router.post("/document", response_model=List[Notification])
async def document_request(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + secretary receive document request notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "document", "message": f"Document request submitted by {resident_name}"},
        {"role": "secretary", "type": "document", "message": "New document request submitted"},
    ])


@router.post("/sk-expense", response_model=Notification)
async def sk_expense_notification(payload: SkExpenseNotificationPayload, user: dict = Depends(get_current_user)):
    activity_label = "event" if str(payload.activity_type or "").strip().lower() == "event" else "program"
    category_suffix = f" under {payload.category}" if payload.category else ""
    message = (
        f"New SK {activity_label} expense added: {payload.title}{category_suffix} "
        f"with a budget of {_format_currency(payload.amount)}"
    )

    return await NotificationService.notify(
        role="treasurer",
        type="sk_expense",
        message=message,
    )

@router.delete("/actions/bulk-delete", response_model=dict)
async def bulk_delete_notifications_actions(
    only_read: bool = Query(False, description="Delete only read notifications"),
    user: dict = Depends(get_current_user)
):
    """
    Bulk delete notifications for current user scope.
    - Applies per-user hide (`deleted_by`) for this account.
    - Permanently deletes only when all intended recipients have deleted.
    - Optionally restrict to only read notifications.
    """
    roles = _effective_roles(user)
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(roles, uid)
        deleted_ids = []
        globally_deleted_ids = []
        for doc in docs:
            data = doc.to_dict() or {}
            if only_read and not bool(data.get("read")):
                continue
            result = _delete_for_user_or_globally(doc, str(uid))
            if result.get("status") in {"deleted_for_user", "deleted_globally"}:
                deleted_ids.append(doc.id)
            if result.get("status") == "deleted_globally":
                globally_deleted_ids.append(doc.id)

        return {
            "status": "bulk_deleted_for_user",
            "count": len(deleted_ids),
            "deleted_ids": deleted_ids,
            "globally_deleted_ids": globally_deleted_ids,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk delete notifications: {str(e)}")

@router.delete("/actions/delete-all", response_model=dict)
async def delete_all_notifications_actions(
    user: dict = Depends(get_current_user)
):
    """
    Delete all notifications for current user scope.
    - Applies per-user hide (`deleted_by`) for this account.
    - Permanently deletes only when all intended recipients have deleted.
    """
    roles = _effective_roles(user)
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(roles, uid)
        deleted_ids = []
        globally_deleted_ids = []
        for doc in docs:
            result = _delete_for_user_or_globally(doc, str(uid))
            if result.get("status") in {"deleted_for_user", "deleted_globally"}:
                deleted_ids.append(doc.id)
            if result.get("status") == "deleted_globally":
                globally_deleted_ids.append(doc.id)

        return {
            "status": "all_deleted_for_user",
            "count": len(deleted_ids),
            "deleted_ids": deleted_ids,
            "globally_deleted_ids": globally_deleted_ids,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete all notifications: {str(e)}")

@router.patch("/actions/mark-all-read", response_model=dict)
async def mark_all_notifications_read_actions(
    user: dict = Depends(get_current_user)
):
    """
    Mark all unread notifications as read for the caller scope.
    - Admin: mark admin-targeted notifications.
    - Resident: mark only own notifications.
    - Other roles: mark notifications addressed to any of the account's roles.
    """
    roles = _effective_roles(user)
    uid = user.get("uid")

    try:
        if "admin" in roles:
            docs = get_db().collection("notifications").where("read", "==", False).where("role", "==", "admin").stream()
        elif "resident" in roles:
            docs = get_db().collection("notifications").where("read", "==", False).where("user_id", "==", uid).stream()
        else:
            docs = (doc for doc in _notification_docs_for_roles(roles) if not (doc.to_dict() or {}).get("read"))

        updated_ids = []
        now = datetime.now(timezone.utc)
        for doc in docs:
            ref = get_db().collection("notifications").document(doc.id)
            ref.update({"read": True, "timestamp": now})
            updated_ids.append(doc.id)

        return {"status": "marked_read", "count": len(updated_ids), "updated_ids": updated_ids}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark all as read: {str(e)}")

@router.delete("/{notification_id}", response_model=dict)
async def delete_notification(
    notification_id: str = Path(..., description="Notification ID"),
    user: dict = Depends(get_current_user)
):
    """
    Delete a notification for the current user account.
    - Marks notification hidden for this user using `deleted_by`.
    - Permanently deletes from Firestore only when all intended recipients deleted it.
    """
    roles = _effective_roles(user)
    uid = user.get("uid")

    try:
        doc_ref = get_db().collection("notifications").document(notification_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Notification not found")

        data = doc.to_dict()

        # Role scoping guard
        if not _is_notification_visible_to_user(data, roles, uid):
            raise HTTPException(status_code=403, detail="Not authorized to delete this notification")

        return _delete_for_user_or_globally(doc, str(uid))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete notification: {str(e)}")
    
 

@router.delete("/bulk", response_model=dict)
async def bulk_delete_notifications(
    only_read: bool = Query(False, description="Delete only read notifications"),
    user: dict = Depends(get_current_user)
):
    """
    Legacy bulk delete endpoint.
    Uses same per-user delete semantics as /actions/bulk-delete.
    """
    roles = _effective_roles(user)
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(roles, uid)
        deleted_ids = []
        globally_deleted_ids = []
        for doc in docs:
            data = doc.to_dict() or {}
            if only_read and not bool(data.get("read")):
                continue
            result = _delete_for_user_or_globally(doc, str(uid))
            if result.get("status") in {"deleted_for_user", "deleted_globally"}:
                deleted_ids.append(doc.id)
            if result.get("status") == "deleted_globally":
                globally_deleted_ids.append(doc.id)

        return {
            "status": "bulk_deleted_for_user",
            "count": len(deleted_ids),
            "deleted_ids": deleted_ids,
            "globally_deleted_ids": globally_deleted_ids,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk delete notifications: {str(e)}")


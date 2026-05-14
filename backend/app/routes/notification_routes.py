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
    name: str
    role: str


class BusinessSubmittedPayload(BaseModel):
    resident_name: str
    business_name: str | None = None


class BusinessStatusUpdatePayload(BaseModel):
    status: str
    resident_uid: str | None = None
    business_id: str | None = None
    firestore_id: str | None = None
    business_name: str | None = None


def _resident_message(event_type: str, count: int) -> str:
    if event_type == "login":
        return f"{count} resident logged in" if count == 1 else f"{count} residents logged in"
    return f"{count} resident logged out" if count == 1 else f"{count} residents logged out"


def _record_login_event(
    *,
    scope: str,
    actor_role: str,
    actor_uid: Optional[str],
    actor_name: Optional[str],
    count: int = 1,
):
    try:
        now = datetime.now(timezone.utc)
        payload = {
            "type": "login",
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


def _is_notification_visible_to_user(data: dict, role: str, uid: str) -> bool:
    target_role = _normalize_role(data.get("role"))
    if role == "admin":
        return target_role == "admin"
    if role == "resident":
        return str(data.get("user_id") or "") == str(uid)
    return target_role == _normalize_role(role)


def _iter_scoped_notification_docs(role: str, uid: str):
    query = get_db().collection("notifications")
    if role == "admin":
        return query.where("role", "==", "admin").stream()
    if role == "resident":
        return query.where("user_id", "==", uid).stream()
    return query.where("role", "==", role).stream()


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
    - Other roles: only notifications addressed to their role.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        query = get_db().collection("notifications")

        if role == "admin":
            docs = query.where("role", "==", "admin").stream()
        elif role == "resident":
            docs = query.where("user_id", "==", uid).stream()
        else:
            docs = query.where("role", "==", role).stream()

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
    officer_role = (payload.role or "officer").replace("_", " ").title()
    _record_login_event(
        scope="officer",
        actor_role=(payload.role or user.get("role") or "officer"),
        actor_uid=user.get("uid"),
        actor_name=payload.name,
        count=1,
    )
    return await NotificationService.notify(
        role="admin",
        type="login",
        message=f"{officer_role} {payload.name} logged in",
        scope="officer",
        user=payload.name,
    )

@router.post("/officer-logout", response_model=Notification)
async def officer_logout(payload: OfficerLoginPayload, user: dict = Depends(get_current_user)):
    """Admin receives officer logout notifications with names."""
    officer_role = (payload.role or "officer").replace("_", " ").title()
    return await NotificationService.notify(
        role="admin",
        type="logout",
        message=f"{officer_role} {payload.name} logged out",
        scope="officer",
        user=payload.name,
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
    role = user.get("role")
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(role, uid)
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
    role = user.get("role")
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(role, uid)
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
    - Other roles: mark notifications addressed to their role.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        query = get_db().collection("notifications").where("read", "==", False)

        if role == "admin":
            query = query.where("role", "==", "admin")
        elif role == "resident":
            query = query.where("user_id", "==", uid)
        else:
            query = query.where("role", "==", role)

        docs = query.stream()
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
    role = user.get("role")
    uid = user.get("uid")

    try:
        doc_ref = get_db().collection("notifications").document(notification_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Notification not found")

        data = doc.to_dict()

        # Role scoping guard
        if not _is_notification_visible_to_user(data, role, uid):
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
    role = user.get("role")
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(role, uid)
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


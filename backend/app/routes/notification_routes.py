# backend/app/routes/notification_routes.py

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from typing import List
from pydantic import BaseModel
from backend.app.services.notification_service import NotificationService
from backend.app.models.notification import Notification
from backend.app.core.auth import get_current_user
from backend.app.utils.firestore_utils import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])

class ResidentLoginPayload(BaseModel):
    count: int

class OfficerLoginPayload(BaseModel):
    name: str


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
    - Admin/staff/secretary: see all notifications.
    - Resident: only see their own notifications (user_id filter).
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        query = get_db().collection("notifications")

        if role == "resident":
            # Residents only see their own notifications
            docs = query.where("user_id", "==", uid).order_by("timestamp", direction="DESCENDING").stream()
        else:
            # Admin/staff/secretary see all notifications
            docs = query.order_by("timestamp", direction="DESCENDING").stream()

        notifications = []
        for doc in docs:
            data = doc.to_dict()
            try:
                notifications.append(Notification(**data))
            except Exception as e:
                # Skip malformed documents
                import logging
                logging.getLogger("uvicorn.error").warning("⚠️ Skipping invalid notification doc: %s", e)

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
    """Admin receives aggregated resident login notifications."""
    return await NotificationService.notify(
        role="admin",
        type="login",
        message=f"{payload.count} residents logged in",
        scope="resident",
        count=payload.count,
    )

@router.post("/resident-logout", response_model=Notification)
async def resident_logout(payload: ResidentLoginPayload, user: dict = Depends(get_current_user)):
    """Admin receives aggregated resident logout notifications."""
    return await NotificationService.notify(
        role="admin",
        type="logout",
        message=f"{payload.count} residents logged out",
        scope="resident",
        count=payload.count,
    )

@router.post("/officer-login", response_model=Notification)
async def officer_login(payload: OfficerLoginPayload, user: dict = Depends(get_current_user)):
    """Admin receives officer login notifications with names."""
    return await NotificationService.notify(
        role="admin",
        type="login",
        message=f"Officer {payload.name} logged in",
        scope="officer",
        user=payload.name,
    )

@router.post("/officer-logout", response_model=Notification)
async def officer_logout(payload: OfficerLoginPayload, user: dict = Depends(get_current_user)):
    """Admin receives officer logout notifications with names."""
    return await NotificationService.notify(
        role="admin",
        type="logout",
        message=f"Officer {payload.name} logged out",
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

@router.post("/document", response_model=List[Notification])
async def document_request(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + secretary receive document request notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "document", "message": f"Document request submitted by {resident_name}"},
        {"role": "secretary", "type": "document", "message": "New document request submitted"},
    ])

@router.delete("/{notification_id}", response_model=dict)
async def delete_notification(
    notification_id: str = Path(..., description="Notification ID"),
    user: dict = Depends(get_current_user)
):
    """
    Delete a notification by ID.
    - Residents can only delete their own notifications.
    - Admin/staff/secretary can delete any notification.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        doc_ref = get_db().collection("notifications").document(notification_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Notification not found")

        data = doc.to_dict()

        # Residents can only delete their own notifications
        if role == "resident" and data.get("user_id") != uid:
            raise HTTPException(status_code=403, detail="Not authorized to delete this notification")

        # Perform deletion
        doc_ref.delete()

        return {"status": "deleted", "notification_id": notification_id}

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
    Bulk delete notifications.
    - Residents can only delete their own notifications.
    - Admin/staff/secretary can delete any notifications.
    - Optionally restrict to only read notifications.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        query = get_db().collection("notifications")

        if role == "resident":
            query = query.where("user_id", "==", uid)
        # If only_read flag is set, filter by read status
        if only_read:
            query = query.where("read", "==", True)

        docs = query.stream()
        deleted_ids = []
        for doc in docs:
            doc_ref = get_db().collection("notifications").document(doc.id)
            doc_ref.delete()
            deleted_ids.append(doc.id)

        return {"status": "bulk_deleted", "count": len(deleted_ids), "deleted_ids": deleted_ids}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk delete notifications: {str(e)}")


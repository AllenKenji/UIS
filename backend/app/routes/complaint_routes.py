import logging
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel

from backend.app.models.complaint import (
    ComplaintCreate,
    Complaint,
    ComplaintWithResident,
    ComplaintStatus,
)
from backend.app.services.complaint_service import (
    file_complaint,
    get_complaint_by_id,
    list_complaints_with_residents,
    list_complaints_by_resident_id,
    update_complaint_status,
    delete_complaint,
)
from backend.app.core.auth import require_permission
from backend.app.services.notification_service import NotificationService

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Complaints"])


# ---------------------------------------------------------
# ✅ Shared Models
# ---------------------------------------------------------

class ActionResponse(BaseModel):
    message: str


class StatusUpdateRequest(BaseModel):
    status: ComplaintStatus
    notes: Optional[str] = None
    resolution_notes: Optional[str] = None


# ---------------------------------------------------------
# ✅ 1. Resident submits a complaint
# ---------------------------------------------------------

@router.post(
    "/",
    response_model=Complaint,
    status_code=status.HTTP_201_CREATED,
    summary="File a new complaint (resident or staff on behalf of resident)",
)
async def submit_complaint(
    complaint: ComplaintCreate,
    current_user=Depends(require_permission(["fileComplaints", "fileComplaintsForResidents"])),
):
    """
    Submit a complaint.
    - Residents: filed_by == filed_for (self-filing)
    - Staff/Admin: filed_by = staff/admin UID, filed_for = resident UID
    """
    try:
        # Ensure filed_for is set: if not provided, default to self-filing
        if not complaint.filed_for:
            complaint.filed_for = complaint.filed_by

        created = file_complaint(complaint)
        if not created:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to file complaint",
            )

        logger.info(
            "📝 Complaint submitted: %s (filed_by=%s, filed_for=%s)",
            created.id,
            complaint.filed_by,
            complaint.filed_for,
        )

        try:
            await NotificationService.notify(
                role="admin",
                type="complaint",
                message=f"New complaint filed ({created.category.value})",
            )
            await NotificationService.notify(
                role="staff",
                type="complaint",
                message=f"New complaint filed ({created.category.value})",
            )
        except Exception as notify_err:
            logger.warning("⚠️ Complaint submit notification failed: %s", notify_err)

        return created

    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Failed to file complaint: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error while filing complaint",
        )


# ---------------------------------------------------------
# ✅ 2. Resident lists their own complaints
# ---------------------------------------------------------

@router.get(
    "/mine",
    response_model=List[Complaint],
    summary="Resident lists their own complaints",
)
def get_my_complaints(
    resident_uid: str = Depends(require_permission("viewOwnComplaints")),
    limit: Optional[int] = Query(None, ge=0, le=100),
):
    return list_complaints_by_resident_id(resident_uid, limit)

# ---------------------------------------------------------
# ✅ 3. Admin/staff lists ALL complaints
#    (STATIC ROUTE — must come BEFORE /{complaint_id})
# ---------------------------------------------------------

@router.get(
    "/all",
    response_model=List[ComplaintWithResident],
    summary="Admin/staff lists all complaints with resident + filer info",
)
def get_all_complaints(
    _: None = Depends(require_permission("viewAllComplaints")),
    limit: Optional[int] = Query(None, ge=0, le=100),
    status: Optional[ComplaintStatus] = Query(None),
):
    return list_complaints_with_residents(limit, status)

# ---------------------------------------------------------
# ✅ 4. Get a specific complaint by ID
# ---------------------------------------------------------

@router.get(
    "/{complaint_id}",
    summary="Get a specific complaint by ID",
)
def get_complaint(
    complaint_id: str,
    current_user=Depends(require_permission(["viewOwnComplaints", "viewAllComplaints"])),
):
    complaint = get_complaint_by_id(complaint_id)
    if complaint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found",
        )

    # Residents → plain Complaint
    if getattr(current_user, "role", None) == "resident":
        return Complaint(**complaint.dict())

    # Staff/Admin → enriched ComplaintWithResident
    return complaint

# ---------------------------------------------------------
# ✅ 5. Update complaint status (admin/staff)
# ---------------------------------------------------------

@router.patch(
    "/{complaint_id}/status",
    response_model=ComplaintWithResident,
    summary="Admin updates complaint status",
)
async def update_status(
    complaint_id: str,
    payload: StatusUpdateRequest,
    _: None = Depends(require_permission("manageComplaints")),
):
    effective_notes = payload.notes
    if effective_notes is None:
        effective_notes = payload.resolution_notes

    updated = update_complaint_status(complaint_id, payload.status, effective_notes)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found",
        )

    try:
        status_label = payload.status.value.replace("_", " ")
        await NotificationService.notify(
            role="admin",
            type="complaint_update",
            message=f"Complaint status updated to {status_label}",
        )
        await NotificationService.notify(
            role="staff",
            type="complaint_update",
            message=f"Complaint status updated to {status_label}",
        )

        resident_uid = getattr(updated, "filed_for", None) or getattr(updated, "filed_by", None)
        if resident_uid:
            await NotificationService.notify(
                role="resident",
                type="complaint_update",
                message=f"Your complaint status was updated to {status_label}",
                user_id=resident_uid,
            )
    except Exception as notify_err:
        logger.warning("⚠️ Complaint status notification failed: %s", notify_err)

    return updated

# ---------------------------------------------------------
# ✅ 6. Delete a complaint (admin only)
# ---------------------------------------------------------

@router.delete(
    "/{complaint_id}",
    response_model=ActionResponse,
    summary="Admin deletes a complaint",
    status_code=status.HTTP_200_OK,
)
def delete_complaint_route(
    complaint_id: str,
    _: None = Depends(require_permission("manageComplaints")),
):
    deleted = delete_complaint(complaint_id)
    if deleted is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found",
        )
    return ActionResponse(message=f"Complaint {complaint_id} deleted successfully")

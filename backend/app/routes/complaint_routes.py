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
)
from backend.app.core.auth import require_permission

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


# ---------------------------------------------------------
# ✅ 1. Resident submits a complaint
# ---------------------------------------------------------

@router.post(
    "/",
    response_model=Complaint,
    status_code=status.HTTP_201_CREATED,
    summary="Resident files a new complaint",
)
def submit_complaint(
    complaint: ComplaintCreate,
    _: None = Depends(require_permission("fileComplaints")),
):
    try:
        created = file_complaint(complaint)
        logger.info("📝 Complaint submitted: %s", created.id)
        return created
    except Exception as e:
        logger.error("❌ Failed to file complaint: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to file complaint",
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
    current_user=Depends(require_permission("viewOwnComplaints")),
    limit: Optional[int] = Query(None, ge=0, le=100),
):
    try:
        resident_id = getattr(current_user, "id", None)
        if not resident_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid user session",
            )

        complaints = list_complaints_by_resident_id(resident_id, limit)
        return complaints
    except Exception as e:
        logger.error("❌ Failed to list resident complaints: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch complaints",
        )


# ---------------------------------------------------------
# ✅ 3. Admin/staff lists ALL complaints
#    (STATIC ROUTE — must come BEFORE /{complaint_id})
# ---------------------------------------------------------

@router.get(
    "/all",
    response_model=List[ComplaintWithResident],
    summary="Admin lists all complaints with resident info",
)
def get_all_complaints(
    _: None = Depends(require_permission("viewAllComplaints")),
    limit: Optional[int] = Query(None, ge=0, le=100),
):
    try:
        complaints = list_complaints_with_residents(limit)
        return complaints
    except Exception as e:
        logger.error("❌ Failed to list all complaints: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch complaints",
        )


# ---------------------------------------------------------
# ✅ 4. Get a specific complaint by ID
# ---------------------------------------------------------

@router.get(
    "/{complaint_id}",
    response_model=Complaint,
    summary="Get a specific complaint by ID",
)
def get_complaint(
    complaint_id: str,
    _: None = Depends(require_permission("viewAllComplaints")),
):
    complaint = get_complaint_by_id(complaint_id)
    if complaint is None:
        logger.warning("❌ Complaint not found: %s", complaint_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found",
        )
    return complaint


# ---------------------------------------------------------
# ✅ 5. Update complaint status (admin/staff)
# ---------------------------------------------------------

@router.patch(
    "/{complaint_id}/status",
    response_model=ActionResponse,
    summary="Admin updates complaint status",
)
def update_status(
    complaint_id: str,
    payload: StatusUpdateRequest,
    _: None = Depends(require_permission("manageComplaints")),
):
    updated = update_complaint_status(
        complaint_id,
        payload.status,
        payload.notes,
    )

    if updated is None:
        logger.warning("❌ Complaint not found for status update: %s", complaint_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found",
        )

    return ActionResponse(message="Status updated")

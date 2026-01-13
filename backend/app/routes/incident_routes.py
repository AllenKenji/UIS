import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from backend.app.models.incident import (
    IncidentCreate,
    Incident,
    IncidentWithResident,
    IncidentStatus,
)
from backend.app.services.incident_service import (
    create_incident,
    get_incident_by_id,
    list_incidents_with_residents,
    update_incident_status,
    delete_incident,
)

logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Incidents"])

# 📦 Response models
class ActionResponse(BaseModel):
    message: str

# 🔧 Request models
class AdminStatusUpdateRequest(BaseModel):
    status: IncidentStatus
    assigned_to: Optional[str] = None

class StaffStatusUpdateRequest(BaseModel):
    status: IncidentStatus


# 📝 Report a new incident
@router.post("/", response_model=Incident, status_code=status.HTTP_201_CREATED)
def report_incident(incident: IncidentCreate):
    created = create_incident(incident)
    if not created:
        logger.error("❌ Failed to create incident for resident %s", incident.authUid)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create incident",
        )
    logger.info("📝 Incident reported with ID: %s by resident %s", created.id, incident.authUid)
    return created


# 🔍 Get a specific incident
@router.get("/{incident_id}", response_model=Incident)
def get_incident(incident_id: str):
    incident = get_incident_by_id(incident_id)
    if not incident:
        logger.warning("❌ Incident not found: %s", incident_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )
    logger.info("🔍 Incident retrieved: %s", incident_id)
    return incident


# 📋 List all incidents with resident info
@router.get("/", response_model=List[IncidentWithResident])
def get_all_incidents():
    incidents = list_incidents_with_residents()
    logger.info("📋 Retrieved %d incidents", len(incidents))
    return incidents


# 🔧 Admin: update incident status + assignment
@router.patch("/{incident_id}/status", response_model=ActionResponse)
def admin_update_status(incident_id: str, payload: AdminStatusUpdateRequest):
    success = update_incident_status(
        incident_id,
        payload.status.value,
        assigned_to=payload.assigned_to,
    )
    if not success:
        logger.warning("❌ Incident not found for admin update: %s", incident_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )
    logger.info(
        "🔧 Incident %s updated by admin: status=%s, assigned_to=%s",
        incident_id,
        payload.status.value,
        payload.assigned_to,
    )
    return ActionResponse(message="Incident updated successfully")


# 🔧 Staff: update incident status only
@router.patch("/staffIncidents/{incident_id}/status", response_model=ActionResponse)
def staff_update_status(incident_id: str, payload: StaffStatusUpdateRequest):
    success = update_incident_status(incident_id, payload.status.value)
    if not success:
        logger.warning("❌ Incident not found for staff update: %s", incident_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )
    logger.info("🔧 Incident %s updated by staff: status=%s", incident_id, payload.status.value)
    return ActionResponse(message="Incident updated successfully")


# 🗑️ Delete an incident
@router.delete("/{incident_id}", response_model=ActionResponse)
def delete_incident_route(incident_id: str):
    success = delete_incident(incident_id)
    if not success:
        logger.warning("❌ Incident not found for deletion: %s", incident_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )
    logger.info("🗑️ Incident deleted: %s", incident_id)
    return ActionResponse(message="Incident deleted successfully")

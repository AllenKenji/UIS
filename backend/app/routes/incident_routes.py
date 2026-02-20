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


# 📝 Report a new incident
@router.post("", response_model=Incident, status_code=status.HTTP_201_CREATED)
def report_incident(incident: IncidentCreate):
    try:
        created = create_incident(incident)
        logger.info("📝 Incident reported with ID: %s by resident %s", created.id, incident.authUid)
        return created
    except Exception as e:
        logger.error("❌ Failed to create incident: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create incident")


# 🔍 Get a specific incident
@router.get("/{incident_id}", response_model=Incident)
def get_incident(incident_id: str):
    try:
        incident = get_incident_by_id(incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        logger.info("🔍 Incident retrieved: %s", incident_id)
        return incident
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error retrieving incident %s: %s", incident_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# 📋 List all incidents with resident info
@router.get("", response_model=List[IncidentWithResident])
def get_all_incidents(status: Optional[str] = None):
    try:
        incidents = list_incidents_with_residents(status=status)
        logger.info("📋 Retrieved %d incidents (status=%s)", len(incidents), status)
        return incidents
    except Exception as e:
        logger.error("❌ Error listing incidents: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# 🔧 Admin: update incident status + assignment
@router.patch("/{incident_id}/status", response_model=ActionResponse)
def admin_update_status(incident_id: str, payload: AdminStatusUpdateRequest):
    try:
        success = update_incident_status(
            incident_id,
            payload.status.value,
            assigned_to=payload.assigned_to,
        )
        if not success:
            raise HTTPException(status_code=404, detail="Incident not found")
        logger.info(
            "🔧 Incident %s updated: status=%s, assigned_to=%s",
            incident_id,
            payload.status.value,
            payload.assigned_to,
        )
        return ActionResponse(message="Incident updated successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error updating incident %s: %s", incident_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# 🗑️ Delete an incident
@router.delete("/{incident_id}", response_model=ActionResponse)
def delete_incident_route(incident_id: str):
    try:
        success = delete_incident(incident_id)
        if not success:
            raise HTTPException(status_code=404, detail="Incident not found")
        logger.info("🗑️ Incident deleted: %s", incident_id)
        return ActionResponse(message="Incident deleted successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error deleting incident %s: %s", incident_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

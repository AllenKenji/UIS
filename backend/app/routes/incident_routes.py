import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from backend.app.core.auth import get_current_user, require_permission, resolve_tenant_scope

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
from backend.app.services.notification_service import NotificationService
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Incidents"])

# 📦 Response models
class ActionResponse(BaseModel):
    message: str

# 🔧 Request models
class AdminStatusUpdateRequest(BaseModel):
    status: IncidentStatus
    assigned_to: Optional[str] = None
    remarks: Optional[str] = None


def _resolve_incident_owner_resident_uid(incident_obj: Incident) -> Optional[str]:
    resident_uid = getattr(incident_obj, "residentId", None)
    if resident_uid:
        return resident_uid

    auth_uid = getattr(incident_obj, "authUid", None)
    if not auth_uid:
        return None

    try:
        if get_db().collection("residents").document(auth_uid).get().exists:
            return auth_uid
    except Exception:
        return None

    return None


# 📝 Report a new incident
@router.post("", response_model=Incident, status_code=status.HTTP_201_CREATED)
async def report_incident(incident: IncidentCreate):
    try:
        created = create_incident(incident)
        logger.info("📝 Incident reported with ID: %s by resident %s", created.id, incident.authUid)

        try:
            await NotificationService.notify(
                role="admin",
                type="incident",
                message=f"New incident filed ({created.type.value})",
            )
            await NotificationService.notify(
                role="staff",
                type="incident",
                message=f"New incident filed ({created.type.value})",
            )
        except Exception as notify_err:
            logger.warning("⚠️ Incident submit notification failed: %s", notify_err)

        return created
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Failed to create incident: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create incident")


# 👤 Public resident (no login) lists their own incidents
@router.get("/my", response_model=List[IncidentWithResident])
def get_my_incidents(resident_id: str):
    """No auth on purpose — mirrors /documents/my, /businesses/my, and
    /complaints/my: public residents who report incidents via the barangay
    portal never log in, so they're identified by resident_id directly."""
    all_incidents = list_incidents_with_residents()
    return [i for i in all_incidents if i.residentId == resident_id]


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
def get_all_incidents(
    status: Optional[str] = None,
    barangayId: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission(["viewIncidents", "viewOwnIncidents"])),
):
    try:
        if current_user.get("role") not in ("admin", "staff", "super_admin"):
            # Residents (and any other non-staff role) only ever see their own incidents.
            all_incidents = list_incidents_with_residents(status=status)
            incidents = [i for i in all_incidents if i.residentId == current_user.get("uid")]
        else:
            scope = resolve_tenant_scope(current_user, barangayId)
            incidents = list_incidents_with_residents(status=status, barangay_id=scope)
        logger.info("📋 Retrieved %d incidents (status=%s)", len(incidents), status)
        return incidents
    except Exception as e:
        logger.error("❌ Error listing incidents: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# 🔧 Admin: update incident status + assignment
@router.patch("/{incident_id}/status", response_model=ActionResponse)
async def admin_update_status(incident_id: str, payload: AdminStatusUpdateRequest):
    try:
        existing = get_incident_by_id(incident_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Incident not found")

        success = update_incident_status(
            incident_id,
            payload.status.value,
            assigned_to=payload.assigned_to,
            remarks=payload.remarks,
        )
        if not success:
            raise HTTPException(status_code=404, detail="Incident not found")
        logger.info(
            "🔧 Incident %s updated: status=%s, assigned_to=%s, remarks=%s",
            incident_id,
            payload.status.value,
            payload.assigned_to,
            payload.remarks,
        )

        try:
            status_label = payload.status.value.replace("_", " ")
            await NotificationService.notify(
                role="admin",
                type="incident_update",
                message=f"Incident status updated to {status_label}",
            )
            await NotificationService.notify(
                role="staff",
                type="incident_update",
                message=f"Incident status updated to {status_label}",
            )

            resident_uid = _resolve_incident_owner_resident_uid(existing)
            if resident_uid:
                await NotificationService.notify(
                    role="resident",
                    type="incident_update",
                    message=f"Your incident status was updated to {status_label}",
                    user_id=resident_uid,
                )
        except Exception as notify_err:
            logger.warning("⚠️ Incident status notification failed: %s", notify_err)

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

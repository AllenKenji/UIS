import logging
from typing import Optional, List
from google.cloud import firestore

from backend.app.core.firebase import get_firestore
from backend.app.models.incident import (
    IncidentCreate,
    Incident,
    IncidentWithResident,
    IncidentStatus,
)

logger = logging.getLogger("uvicorn.error")

INCIDENT_COLLECTION = "incidents"

def _convert_timestamps(data: dict) -> dict:
    for field in ["createdAt", "updatedAt"]:
        if field in data and hasattr(data[field], "to_datetime"):
            data[field] = data[field].to_datetime()
    return data

# 📝 Create an incident
def create_incident(data: IncidentCreate) -> Incident:
    db = get_firestore()
    doc_ref = db.collection(INCIDENT_COLLECTION).document()
    payload = data.dict()
    payload["id"] = doc_ref.id
    payload["status"] = IncidentStatus.pending.value
    payload["createdAt"] = firestore.SERVER_TIMESTAMP
    payload["updatedAt"] = firestore.SERVER_TIMESTAMP
    doc_ref.set(payload)

    snapshot = doc_ref.get()
    data = _convert_timestamps(snapshot.to_dict())
    data["id"] = doc_ref.id
    return Incident(**data)

# 🔍 Get a specific incident
def get_incident_by_id(incident_id: str) -> Optional[Incident]:
    db = get_firestore()
    doc = db.collection(INCIDENT_COLLECTION).document(incident_id).get()
    if doc.exists:
        data = doc.to_dict()
        data["id"] = doc.id
        return Incident(**data)
    return None


# 🔧 Helper: enrich with resident info
def _enrich_with_resident(data: dict) -> IncidentWithResident:
    db = get_firestore()

    # Ensure residentId is present
    resident_id = data.get("residentId")
    if not resident_id and "authUid" in data:
        # fallback: if missing, assume residentId = authUid for self-reports
        resident_id = data["authUid"]
    data["residentId"] = resident_id

    # Resident name (always the "Reported By")
    reported_by_name = "Unknown"
    if resident_id:
        try:
            resident_doc = db.collection("residents").document(resident_id).get()
            if resident_doc.exists:
                reported_by_name = resident_doc.to_dict().get("fullName", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to enrich resident info: %s", e)

    # Officer who logged it
    logged_by_officer = "Unknown"
    auth_uid = data.get("authUid")
    if auth_uid:
        try:
            staff_doc = db.collection("users").document(auth_uid).get()
            if staff_doc.exists:
                logged_by_officer = staff_doc.to_dict().get("full_name", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to enrich staff info: %s", e)

    # Assigned to (staff UID or free-form string like "PNP")
    assigned_to_name = data.get("assigned_to_name", "—")
    if assigned_to_name and assigned_to_name != "—":
        try:
            staff_doc = db.collection("users").document(assigned_to_name).get()
            if staff_doc.exists:
                assigned_to_name = staff_doc.to_dict().get("full_name", assigned_to_name)
        except Exception:
            # If not a staff UID, just keep the literal string
            logger.info("ℹ️ Assigned_to is external or free-form: %s", assigned_to_name)

    # ✅ Ensure required fields exist
    data.setdefault("reported_by_name", reported_by_name)
    data.setdefault("logged_by_officer", logged_by_officer)
    data.setdefault("assigned_to_name", assigned_to_name)

    return IncidentWithResident(**data)

# 📋 List all incidents with resident info (admin view)
def list_incidents_with_residents(
    limit: int = 50, start_after_id: Optional[str] = None
) -> List[IncidentWithResident]:
    db = get_firestore()
    query = db.collection(INCIDENT_COLLECTION).order_by("createdAt").limit(limit)

    if start_after_id:
        last_doc = db.collection(INCIDENT_COLLECTION).document(start_after_id).get()
        if last_doc.exists:
            query = query.start_after(last_doc)

    docs = query.stream()
    incidents: List[IncidentWithResident] = []

    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        incidents.append(_enrich_with_resident(data))

    logger.info("📋 Listed %d incidents", len(incidents))
    return incidents


# 📋 List incidents assigned to a specific staff (staff view)
def list_staff_incidents(staff_name: str, limit: int = 50) -> List[IncidentWithResident]:
    db = get_firestore()
    query = (
        db.collection(INCIDENT_COLLECTION)
        .where("assigned_to_name", "==", staff_name)
        .order_by("createdAt")
        .limit(limit)
    )

    docs = query.stream()
    incidents: List[IncidentWithResident] = []

    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        incidents.append(_enrich_with_resident(data))

    logger.info("📋 Listed %d incidents for staff %s", len(incidents), staff_name)
    return incidents


# 🔧 Update incident status (admin can assign staff)
def update_incident_status(
    incident_id: str, status: str, assigned_to: Optional[str] = None
) -> bool:
    db = get_firestore()
    doc_ref = db.collection(INCIDENT_COLLECTION).document(incident_id)
    try:
        if doc_ref.get().exists:
            update_data = {
                "status": status,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
            if assigned_to:
                update_data["assigned_to_name"] = assigned_to
            doc_ref.update(update_data)
            logger.info(
                "🔧 Incident %s updated: status=%s, assigned_to=%s",
                incident_id,
                status,
                assigned_to,
            )
            return True
        return False
    except Exception as e:
        logger.error("🔥 Failed to update incident %s: %s", incident_id, str(e))
        return False


# 🗑️ Delete an incident
def delete_incident(incident_id: str) -> bool:
    db = get_firestore()
    doc_ref = db.collection(INCIDENT_COLLECTION).document(incident_id)
    if doc_ref.get().exists:
        doc_ref.delete()
        logger.info("🗑️ Incident deleted with ID: %s", incident_id)
        return True
    return False

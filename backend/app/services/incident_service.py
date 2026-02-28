import logging
from typing import Optional, List
from google.cloud import firestore
from backend.app.utils.firestore_utils import get_db
from backend.app.models.incident import (
    IncidentCreate,
    Incident,
    IncidentWithResident,
    IncidentStatus,
)

logger = logging.getLogger("uvicorn.error")

INCIDENT_COLLECTION = "incidents"


def _convert_timestamps(data: dict) -> dict:
    """Convert Firestore Timestamp objects to Python datetime."""
    for field in ["createdAt", "updatedAt"]:
        if field in data and hasattr(data[field], "to_datetime"):
            data[field] = data[field].to_datetime()
    return data

def _normalize_incident(doc) -> dict:
    data = doc.to_dict() or {}
    data = _convert_timestamps(data)
    return {
        "id": doc.id,
        "type": data.get("type"),  # IncidentType enum
        "description": data.get("description"),
        "location": data.get("location"),
        "status": data.get("status"),
        # 🔄 Align with model field names
        "timestamp": data.get("createdAt"),
        "updated_at": data.get("updatedAt"),
        "authUid": data.get("authUid"),
        "residentId": data.get("residentId") or data.get("filed_for"),
        "assigned_to_name": data.get("assigned_to_name"),
    }


# 📝 Create an incident
def create_incident(data: IncidentCreate) -> Incident:
    doc_ref = get_db().collection(INCIDENT_COLLECTION).document()

    payload = data.dict()
    payload.update({
        "id": doc_ref.id,
        "status": IncidentStatus.pending.value,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    doc_ref.set(payload)
    snapshot = doc_ref.get()

    data = _convert_timestamps(snapshot.to_dict())
    data["id"] = doc_ref.id
    return Incident(**data)


# 🔍 Get a specific incident
def get_incident_by_id(incident_id: str) -> Optional[Incident]:
    doc = get_db().collection(INCIDENT_COLLECTION).document(incident_id).get()
    if not doc.exists:
        return None
    return Incident(**_normalize_incident(doc))


# 🔧 Helper: enrich with resident info
def _enrich_with_resident(data: dict) -> IncidentWithResident:

    resident_id = data.get("residentId") or data.get("authUid")
    data["residentId"] = resident_id

    reported_by_name = "Unknown"
    if resident_id:
        try:
            resident_doc = get_db().collection("residents").document(resident_id).get()
            if resident_doc.exists:
                reported_by_name = resident_doc.to_dict().get("fullName", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to enrich resident info: %s", e)

    logged_by_officer = "Unknown"
    auth_uid = data.get("authUid")
    if auth_uid:
        try:
            staff_doc = get_db().collection("users").document(auth_uid).get()
            if staff_doc.exists:
                logged_by_officer = staff_doc.to_dict().get("full_name", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to enrich staff info: %s", e)

    assigned_to_name = data.get("assigned_to_name") or "—"
    if assigned_to_name not in (None, "—"):
        try:
            staff_doc = get_db().collection("users").document(assigned_to_name).get()
            if staff_doc.exists:
                assigned_to_name = staff_doc.to_dict().get("full_name", assigned_to_name)
        except Exception:
            logger.info("ℹ️ Assigned_to is external or free-form: %s", assigned_to_name)

    data.update({
        "reported_by_name": reported_by_name,
        "logged_by_officer": logged_by_officer,
        "assigned_to_name": assigned_to_name,
    })

    return IncidentWithResident(**_convert_timestamps(data))

# 📋 List all incidents with resident info (admin view)
def list_incidents_with_residents(
    status: Optional[str] = None, limit: int = 50, start_after_id: Optional[str] = None
) -> List[IncidentWithResident]:

    query = get_db().collection(INCIDENT_COLLECTION)

    if status:
        query = query.where("status", "==", status)

    query = query.order_by("createdAt").limit(limit)

    if start_after_id:
        last_doc = get_db().collection(INCIDENT_COLLECTION).document(start_after_id).get()
        if last_doc.exists:
            query = query.start_after(last_doc)

    incidents: List[IncidentWithResident] = []
    try:
        for doc in query.stream():
            normalized = _normalize_incident(doc)
            incidents.append(_enrich_with_resident(normalized))
        logger.info("📋 Listed %d incidents (status=%s)", len(incidents), status)
    except Exception as e:
        logger.error("🔥 Error listing incidents: %s", e, exc_info=True)
        raise

    return incidents

# 📋 List incidents assigned to a specific staff (staff view)
def list_staff_incidents(staff_name: str, limit: int = 50) -> List[IncidentWithResident]:
    query = (
        get_db().collection(INCIDENT_COLLECTION)
        .where("assigned_to_name", "==", staff_name)
        .order_by("createdAt")
        .limit(limit)
    )

    incidents: List[IncidentWithResident] = []
    for doc in query.stream():
        normalized = _normalize_incident(doc)
        incidents.append(_enrich_with_resident(normalized))

    logger.info("📋 Listed %d incidents for staff %s", len(incidents), staff_name)
    return incidents


# 🔧 Update incident status
def update_incident_status(
    incident_id: str, status: str, assigned_to: Optional[str] = None
) -> bool:
    doc_ref = get_db().collection(INCIDENT_COLLECTION).document(incident_id)
    try:
        if not doc_ref.get().exists:
            return False

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
    except Exception as e:
        logger.error("🔥 Failed to update incident %s: %s", incident_id, e, exc_info=True)
        return False


# 🗑️ Delete an incident
def delete_incident(incident_id: str) -> bool:
    doc_ref = get_db().collection(INCIDENT_COLLECTION).document(incident_id)
    if not doc_ref.get().exists:
        return False

    doc_ref.delete()
    logger.info("🗑️ Incident deleted with ID: %s", incident_id)
    return True

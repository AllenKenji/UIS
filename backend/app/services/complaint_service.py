import logging
from typing import Optional, List
from backend.app.core.postgres_store import SERVER_TIMESTAMP
from backend.app.utils.firestore_utils import get_db
from backend.app.models.complaint import (
    ComplaintCreate,
    Complaint,
    ComplaintWithResident,
    ComplaintStatus,
)
from backend.app.services.resident_service import require_verified_resident

logger = logging.getLogger("uvicorn.error")

COMPLAINT_COLLECTION = "complaints"
RESIDENT_COLLECTION = "residents"


# ✅ Timestamp normalization helper
def _to_datetime(value):
    try:
        return value.to_datetime() if hasattr(value, "to_datetime") else value
    except Exception as e:
        logger.warning("⚠️ Failed to convert timestamp: %s", e)
        return value


# ✅ Shared Firestore → Complaint dict normalization
def _normalize_complaint(doc) -> dict:
    data = doc.to_dict()
    data["id"] = doc.id

    if "timestamp" in data:
        data["timestamp"] = _to_datetime(data["timestamp"])
    if "updated_at" in data:
        data["updated_at"] = _to_datetime(data["updated_at"])

    return data


# ✅ Enrich complaint with resident info (admin/staff view)
def _enrich_with_resident(data: dict) -> ComplaintWithResident:

    # Resident info (complaint subject)
    resident_id = data.get("filed_for") or data.get("filed_by")
    filed_for_name = "Unknown"
    if resident_id:
        try:
            doc = get_db().collection(RESIDENT_COLLECTION).document(resident_id).get()
            if doc.exists:
                filed_for_name = doc.to_dict().get("fullName", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to fetch resident %s: %s", resident_id, e)

    # Filer info (always resolve, even if same as filed_for)
    filed_by_name = "Unknown"
    filer_id = data.get("filed_by")
    if filer_id:
        try:
            doc = get_db().collection(RESIDENT_COLLECTION).document(filer_id).get()
            if doc.exists:
                filed_by_name = doc.to_dict().get("fullName", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to fetch filer %s: %s", filer_id, e)

    return ComplaintWithResident(
        **{
            **data,
            "filed_for_name": filed_for_name,
            "filed_by_name": filed_by_name,
            "residentName": filed_for_name,
        }
    )

# 📝 File a complaint (resident or staff on behalf of resident)
def file_complaint(data: ComplaintCreate) -> Optional[Complaint]:
    """
    Create a complaint record.
    - filed_by: the ID of the user who entered the complaint (resident or staff/admin)
    - filed_for: the resident ID the complaint is about (required if staff/admin files)
    """
    doc_ref = get_db().collection(COMPLAINT_COLLECTION).document()

    # Ensure filed_for is set: if not provided, default to filed_by (resident self-filing)
    filed_for = data.filed_for or data.filed_by

    if filed_for:
        subject_doc = get_db().collection(RESIDENT_COLLECTION).document(filed_for).get()
        if subject_doc.exists:
            require_verified_resident(subject_doc.to_dict() or {})

    payload = {
        **data.model_dump(),
        "filed_by": data.filed_by,       # who entered the complaint
        "filed_for": filed_for,          # resident the complaint is about
        "timestamp": SERVER_TIMESTAMP(),
        "updated_at": None,
        "status": ComplaintStatus.open.value,
    }

    try:
        doc_ref.set(payload)
        snapshot = doc_ref.get()
        logger.info(
            "✅ Complaint filed with ID: %s (filed_by=%s, filed_for=%s)",
            doc_ref.id,
            data.filed_by,
            filed_for,
        )
        return Complaint.from_firestore(snapshot)
    except Exception as e:
        logger.error("❌ Failed to file complaint: %s", e)
        return None

# 🔍 Get a specific complaint (enriched with resident + filer info)
def get_complaint_by_id(complaint_id: str) -> Optional[ComplaintWithResident]:
    try:
        doc = get_db().collection(COMPLAINT_COLLECTION).document(complaint_id).get()
        if doc.exists:
            normalized = _normalize_complaint(doc)
            enriched = _enrich_with_resident(normalized)  # ✅ add resident + filer names
            return enriched
        logger.warning("⚠️ Complaint %s not found", complaint_id)
    except Exception as e:
        logger.error("❌ Failed to fetch complaint %s: %s", complaint_id, e)
    return None

# 👤 Resident: list complaints filed for them (self or by staff)
def list_complaints_by_resident_id(auth_uid: str, limit: Optional[int] = None):
    results: List[Complaint] = []

    try:
        query = get_db().collection(COMPLAINT_COLLECTION).where("filed_for", "==", auth_uid)
        if limit:
            query = query.limit(limit)

        for doc in query.stream():
            results.append(Complaint(**_normalize_complaint(doc)))

        logger.info("👤 Resident %s retrieved %d complaints", auth_uid, len(results))
    except Exception as e:
        logger.error("❌ Failed to list complaints for resident %s: %s", auth_uid, e)

    return results

# 🗂️ Admin/Staff: list all complaints with resident + filer info
def list_complaints_with_residents(
    limit: Optional[int] = None,
    status: Optional[ComplaintStatus] = None,
    barangay_id: Optional[str] = None,
) -> List[ComplaintWithResident]:
    results: List[ComplaintWithResident] = []

    try:
        query = get_db().collection(COMPLAINT_COLLECTION).order_by(
            "timestamp", direction=firestore.Query.DESCENDING
        )

        if status:
            query = query.where("status", "==", status.value)
        if barangay_id:
            query = query.where("barangayId", "==", barangay_id)
        if limit:
            query = query.limit(limit)

        for doc in query.stream():
            normalized = _normalize_complaint(doc)
            enriched = _enrich_with_resident(normalized)  # ✅ directly enrich
            results.append(enriched)

        logger.info("📋 Admin listed %d complaints", len(results))
    except Exception as e:
        logger.error("❌ Failed to list complaints: %s", e)

    return results

# 🔧 Update complaint status (admin)
def update_complaint_status(
    complaint_id: str,
    status: ComplaintStatus,
    notes: Optional[str] = None,
) -> Optional[Complaint]:
    doc_ref = get_db().collection(COMPLAINT_COLLECTION).document(complaint_id)

    try:
        snapshot = doc_ref.get()
        if not snapshot.exists:
            logger.warning("⚠️ Complaint %s not found for update", complaint_id)
            return None

        update_data = {
            "status": status.value,
            "updated_at": SERVER_TIMESTAMP(),
        }

        if notes:
            update_data["resolution_notes"] = notes

        doc_ref.update(update_data)

        logger.info(
            "🔧 Complaint %s status updated to %s (notes=%s)",
            complaint_id,
            status.value,
            notes,
        )

        return get_complaint_by_id(complaint_id)

    except Exception as e:
        logger.error("❌ Failed to update complaint %s: %s", complaint_id, e)
        return None

# 🗑️ Delete complaint (admin only)
def delete_complaint(complaint_id: str) -> Optional[Complaint]:
    doc_ref = get_db().collection(COMPLAINT_COLLECTION).document(complaint_id)

    try:
        snapshot = doc_ref.get()
        if not snapshot.exists:
            logger.warning("⚠️ Complaint %s not found for deletion", complaint_id)
            return None

        doc_ref.delete()
        logger.info("🗑️ Complaint %s deleted successfully", complaint_id)

        # Optionally return the deleted complaint data for confirmation
        normalized = _normalize_complaint(snapshot)
        return Complaint(**normalized)

    except Exception as e:
        logger.error("❌ Failed to delete complaint %s: %s", complaint_id, e)
        return None

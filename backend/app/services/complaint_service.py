import logging
from typing import Optional, List
from google.cloud import firestore

from backend.app.core.firebase import get_firestore
from backend.app.models.complaint import (
    ComplaintCreate,
    Complaint,
    ComplaintWithResident,
    ComplaintStatus,
)

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


# ✅ Enrich complaint with resident info (admin view)
def _enrich_with_resident(data: dict) -> ComplaintWithResident:
    db = get_firestore()
    resident_id = data.get("filed_by")
    filed_by_name = "Unknown"

    if resident_id:
        try:
            resident_doc = db.collection(RESIDENT_COLLECTION).document(resident_id).get()
            if resident_doc.exists:
                filed_by_name = resident_doc.to_dict().get("fullName", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to fetch resident %s: %s", resident_id, e)

    return ComplaintWithResident(**{**data, "filed_by_name": filed_by_name})


# 📝 File a complaint (resident)
def file_complaint(data: ComplaintCreate) -> Optional[Complaint]:
    db = get_firestore()
    doc_ref = db.collection(COMPLAINT_COLLECTION).document()

    payload = {
        **data.dict(),
        "filed_by": data.filed_by,
        "timestamp": firestore.SERVER_TIMESTAMP,
        "updated_at": None,
        "status": ComplaintStatus.open.value,
    }

    try:
        doc_ref.set(payload)
        snapshot = doc_ref.get()
        logger.info("✅ Complaint filed with ID: %s", doc_ref.id)
        return Complaint.from_firestore(snapshot)
    except Exception as e:
        logger.error("❌ Failed to file complaint: %s", e)
        return None


# 🔍 Get a specific complaint
def get_complaint_by_id(complaint_id: str) -> Optional[Complaint]:
    db = get_firestore()
    try:
        doc = db.collection(COMPLAINT_COLLECTION).document(complaint_id).get()
        if doc.exists:
            return Complaint.from_firestore(doc)
        logger.warning("⚠️ Complaint %s not found", complaint_id)
    except Exception as e:
        logger.error("❌ Failed to fetch complaint %s: %s", complaint_id, e)
    return None


# 👤 Resident: list only their own complaints
def list_complaints_by_resident_id(
    resident_id: str,
    limit: Optional[int] = None,
) -> List[Complaint]:
    db = get_firestore()
    results: List[Complaint] = []

    try:
        query = (
            db.collection(COMPLAINT_COLLECTION)
            .where("filed_by", "==", resident_id)
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
        )

        if limit:
            query = query.limit(limit)

        for doc in query.stream():
            normalized = _normalize_complaint(doc)
            results.append(Complaint(**normalized))

        logger.info("👤 Resident %s retrieved %d complaints", resident_id, len(results))
    except Exception as e:
        logger.error("❌ Failed to list complaints for resident %s: %s", resident_id, e)

    return results


# 🗂️ Admin: list all complaints with resident info
def list_complaints_with_residents(
    limit: Optional[int] = None,
    status: Optional[ComplaintStatus] = None,
) -> List[ComplaintWithResident]:
    db = get_firestore()
    results: List[ComplaintWithResident] = []

    try:
        query = db.collection(COMPLAINT_COLLECTION).order_by(
            "timestamp", direction=firestore.Query.DESCENDING
        )

        if status:
            query = query.where("status", "==", status.value)
        if limit:
            query = query.limit(limit)

        for doc in query.stream():
            normalized = _normalize_complaint(doc)
            enriched = _enrich_with_resident(normalized)
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
    db = get_firestore()
    doc_ref = db.collection(COMPLAINT_COLLECTION).document(complaint_id)

    try:
        snapshot = doc_ref.get()
        if not snapshot.exists:
            logger.warning("⚠️ Complaint %s not found for update", complaint_id)
            return None

        update_data = {
            "status": status.value,
            "updated_at": firestore.SERVER_TIMESTAMP,
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

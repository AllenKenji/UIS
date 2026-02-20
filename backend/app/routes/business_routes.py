from fastapi import APIRouter
from backend.app.core.firebase import get_firestore, delete_file
from backend.app.models.business import BusinessApplication
from backend.app.services.business_service import create_business_application
import logging

db = get_firestore()
logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/businesses", tags=["Business"])

@router.post("/applications")
def create_application(payload: BusinessApplication):
    return create_business_application(payload)

@router.get("")
def list_businesses(ownerUid: str = None, ownerName: str = None):
    ref = db.collection("businesses")
    if ownerUid:
        docs = ref.where("ownerUid", "==", ownerUid).stream()
    elif ownerName:
        docs = ref.where("ownerName", "==", ownerName).stream()
    else:
        docs = ref.stream()
    return [doc.to_dict() for doc in docs]

@router.delete("/{business_id}")
def delete_business(business_id: str):
    """Delete a business, related payments/receipts, and attachments in Storage."""
    business_docs = db.collection("businesses").where("businessId", "==", business_id).get()
    if not business_docs:
        return {"success": False, "message": "Business not found"}

    business_doc = business_docs[0]
    business_data = business_doc.to_dict()

    # --- Delete attachments from Storage using stored paths ---
    if business_data.get("documents"):
        for key, doc in business_data["documents"].items():
            # Expecting each doc to be a dict with {"url": ..., "path": ...}
            path = None
            if isinstance(doc, dict):
                path = doc.get("path")
            elif isinstance(doc, str):
                # Fallback for legacy records that only stored URL
                logger.warning("⚠️ Document %s has only URL, no path. Skipping storage deletion.", key)

            if path:
                try:
                    delete_file(path)
                except Exception as e:
                    logger.warning("⚠️ Failed to delete storage file %s: %s", path, e)

    # --- Delete business doc ---
    business_doc.reference.delete()
    logger.info("🗑️ Deleted business %s", business_id)

    # --- Delete related payments ---
    payments = db.collection("payments").where("businessId", "==", business_id).get()
    for pay in payments:
        pay.reference.delete()
        logger.info("🗑️ Deleted payment %s for business %s", pay.id, business_id)

    # --- Delete related receipts ---
    receipts = db.collection("receipts").where("businessId", "==", business_id).get()
    for rec in receipts:
        rec.reference.delete()
        logger.info("🗑️ Deleted receipt %s for business %s", rec.id, business_id)

    return {"success": True, "message": f"Business {business_id}, related records, and attachments deleted"}

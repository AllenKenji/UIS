from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from backend.app.core.auth import get_current_user, resolve_tenant_scope
from backend.app.core.local_storage import delete_file
from backend.app.models.business import BusinessApplication
from backend.app.services.business_service import create_business_application
import logging
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/businesses", tags=["Business"])

@router.post("/applications")
def create_application(payload: BusinessApplication):
    return create_business_application(payload)


def _require_business_manager(user: dict) -> None:
    if user.get("role") not in {"admin", "staff"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff or admin access required")


def _get_business_or_404(document_id: str):
    db = get_db()
    snapshot = db.collection("businesses").document(document_id).get()
    if snapshot.exists:
        return snapshot
    matches = db.collection("businesses").where("businessId", "==", document_id).limit(1).get()
    if matches:
        return matches[0]
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_staff_business(payload: dict, user: dict = Depends(get_current_user)):
    _require_business_manager(user)
    data = {
        **payload,
        "createdAt": payload.get("createdAt") or datetime.now(timezone.utc).isoformat(),
    }
    reference = get_db().collection("businesses").add(data)
    return {"id": reference.id, **data}

@router.get("")
def list_businesses(ownerUid: str = None, ownerName: str = None, barangayId: str = None, user: dict = Depends(get_current_user)):
    scope = resolve_tenant_scope(user, barangayId)
    ref = get_db().collection("businesses")
    if ownerUid:
        docs = ref.where("ownerUid", "==", ownerUid).stream()
    elif ownerName:
        docs = ref.where("ownerName", "==", ownerName).stream()
    elif scope:
        docs = ref.where("barangayId", "==", scope).stream()
    else:
        docs = ref.stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


@router.put("/{business_id}")
def update_business(business_id: str, payload: dict, user: dict = Depends(get_current_user)):
    _require_business_manager(user)
    business = _get_business_or_404(business_id)
    data = {**payload, "updatedAt": datetime.now(timezone.utc).isoformat()}
    business.reference.update(data)
    return {"id": business.id, **business.to_dict(), **data}

@router.delete("/{business_id}")
def delete_business(business_id: str, user: dict = Depends(get_current_user)):
    """Delete a business, related payments/receipts, and attachments in Storage."""
    _require_business_manager(user)
    business_doc = _get_business_or_404(business_id)
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
    payments = get_db().collection("payments").where("businessId", "==", business_id).get()
    for pay in payments:
        pay.reference.delete()
        logger.info("🗑️ Deleted payment %s for business %s", pay.id, business_id)

    # --- Delete related receipts ---
    receipts = get_db().collection("receipts").where("businessId", "==", business_id).get()
    for rec in receipts:
        rec.reference.delete()
        logger.info("🗑️ Deleted receipt %s for business %s", rec.id, business_id)

    return {"success": True, "message": f"Business {business_id}, related records, and attachments deleted"}

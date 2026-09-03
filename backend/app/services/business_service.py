import uuid
from datetime import datetime, timezone
import logging
from backend.app.core.local_storage import delete_file
from backend.app.services.fee_service import resolve_business_fee, determine_business_fee_type
from backend.app.services.resident_service import require_verified_resident
from backend.app.utils.firestore_utils import get_db
from fastapi import HTTPException, status

logger = logging.getLogger("uvicorn.error")


def is_business_name_taken(barangay_id: str, business_name: str, exclude_id: str | None = None) -> bool:
    """Case/whitespace-insensitive check within a barangay. Rejected
    applications don't hold the name — a resident can reuse it — so those
    are excluded."""
    normalized = (business_name or "").strip().lower()
    if not normalized or not barangay_id:
        return False

    query = get_db().collection("businesses").where("barangayId", "==", barangay_id)
    for doc in query.stream():
        if exclude_id and doc.id == exclude_id:
            continue
        existing = doc.to_dict() or {}
        if str(existing.get("status", "")).lower() == "rejected":
            continue
        if str(existing.get("businessName", "")).strip().lower() == normalized:
            return True
    return False


def create_business_application(data):
    business = data.business
    documents = data.documents

    # Businesses belong to their owning resident's barangay, not a client-supplied value.
    owner_doc = get_db().collection("residents").document(data.owner_uid).get()
    if not owner_doc.exists:
        raise HTTPException(status_code=404, detail="Resident not found")
    owner_data = owner_doc.to_dict() or {}
    require_verified_resident(owner_data)
    barangay_id = owner_data.get("barangayId")

    # Franchise branches legitimately share a name within the same barangay
    # (e.g. two branches of the same chain) — only block true duplicates.
    if not business.is_franchise and is_business_name_taken(barangay_id, business.name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'A business named "{business.name}" is already registered in this barangay. '
                   'If this is a franchise branch, mark it as a franchise to continue.',
        )

    # Decide fee type (registration vs annual)
    fee_type = determine_business_fee_type(business.dict())
    fee_breakdown = resolve_business_fee(business.type, fee_type, barangay_id)
    amount = fee_breakdown["totalFee"]

    doc_ref = get_db().collection("businesses").document()
    year = datetime.now().year
    business_id = f"BIZ-{business.barangay.upper()}-{year}-{uuid.uuid4().hex[:4]}"

    biz_data = business.dict()

    # Store documents with both URL and path
    documents_data = {}
    for key, doc in documents.dict().items():
        if isinstance(doc, dict):
            # Already has url/path structure
            documents_data[key] = doc
        else:
            # Fallback if only URL was provided
            documents_data[key] = {"url": doc, "path": None}

    doc_ref.set({
        "ownerUid": data.owner_uid,
        "ownerName": data.owner_name,
        "barangayId": barangay_id,
        "contactNumber": data.contact_number,
        "email": data.email,
        "businessId": business_id,
        "businessName": biz_data.get("name"),
        "businessType": biz_data.get("type"),
        "barangay": biz_data.get("barangay"),
        "street": biz_data.get("street"),
        "city": biz_data.get("city"),
        "province": biz_data.get("province"),
        "address": f"{biz_data.get('street', '')}, Brgy. {biz_data.get('barangay', '')}, {biz_data.get('city', '')}, {biz_data.get('province', '')}",
        "isFranchise": biz_data.get("is_franchise", False),
        "documents": documents_data,
        "amount": amount,
        "feeType": fee_type,
        # Staff must verify the submitted documents before this moves to
        # "for_payment" (via BusinessEvaluationModal) — no payment link is
        # created yet. ResidentBusinessPayment requests one on demand once
        # the resident can actually pay, so nothing here goes unused either.
        "status": "pending_evaluation",
        "paymentStatus": "unpaid",
    })

    return {
        "business_id": business_id,
        "fee_breakdown": fee_breakdown
    }


def update_businesses_for_annual_renewal():
    """Scan businesses and move those past their anniversary into for_payment with annual fee."""
    now = datetime.now(timezone.utc)
    businesses = get_db().collection("businesses").stream()

    for biz in businesses:
        data = biz.to_dict()
        fee_type = determine_business_fee_type(data)

        # If the fee type is annual, update status and amount
        if fee_type == "annualFee":
            fee_breakdown = resolve_business_fee(data["businessType"], fee_type, data.get("barangayId"))
            amount = fee_breakdown["totalFee"]

            biz.reference.update({
                "status": "for_payment",
                "paymentStatus": "unpaid",
                "feeType": fee_type,
                "amount": amount,
                "updatedAt": now
            })


def delete_business_and_related(business_id: str):
    """Delete a business and all related payments, receipts, and storage attachments."""
    business_docs = get_db().collection("businesses").where("businessId", "==", business_id).limit(1).get()
    if not business_docs:
        logger.warning("⚠️ No business found for businessId=%s", business_id)
        return {"success": False, "message": "Business not found"}

    business_doc = business_docs[0]
    business_data = business_doc.to_dict()

    # --- Delete attachments from Storage using stored paths ---
    if business_data.get("documents"):
        for key, doc in business_data["documents"].items():
            path = doc.get("path")
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

    return {"success": True, "message": f"Business {business_id} and related records + attachments deleted"}

import uuid
from datetime import datetime, timezone
import logging
from backend.app.core.firebase import get_firestore, delete_file
from backend.app.services.paymongo_service import create_payment_link
from backend.app.services.fee_service import resolve_business_fee, determine_business_fee_type

db = get_firestore()
logger = logging.getLogger("uvicorn.error")

def create_business_application(data):
    business = data.business
    documents = data.documents

    # Decide fee type (registration vs annual)
    fee_type = determine_business_fee_type(business.dict())
    fee_breakdown = resolve_business_fee(business.type, fee_type)
    amount = fee_breakdown["totalFee"]

    doc_ref = db.collection("businesses").document()
    year = datetime.now().year
    business_id = f"BIZ-{business.barangay.upper()}-{year}-{uuid.uuid4().hex[:4]}"

    # Create PayMongo link
    paymongo = create_payment_link(
        amount=amount,
        description=f"{fee_type} for {business.name}",
        remarks=f"business_id:{business_id}"
    )

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
        "documents": documents_data,
        "amount": amount,
        "feeType": fee_type,
        "status": "awaiting_payment",
        "paymentStatus": "unpaid",
        "paymongoLinkId": paymongo["paymongoLinkId"],
        "checkoutUrl": paymongo["checkoutUrl"],
        "referenceNumber": paymongo["referenceNumber"]
    })

    return {
        "business_id": business_id,
        "checkout_url": paymongo["checkoutUrl"],
        "fee_breakdown": fee_breakdown
    }


def update_businesses_for_annual_renewal():
    """Scan businesses and move those past their anniversary into for_payment with annual fee."""
    now = datetime.now(timezone.utc)
    businesses = db.collection("businesses").stream()

    for biz in businesses:
        data = biz.to_dict()
        fee_type = determine_business_fee_type(data)

        # If the fee type is annual, update status and amount
        if fee_type == "annualFee":
            fee_breakdown = resolve_business_fee(data["businessType"], fee_type)
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
    business_docs = db.collection("businesses").where("businessId", "==", business_id).limit(1).get()
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
    payments = db.collection("payments").where("businessId", "==", business_id).get()
    for pay in payments:
        pay.reference.delete()
        logger.info("🗑️ Deleted payment %s for business %s", pay.id, business_id)

    # --- Delete related receipts ---
    receipts = db.collection("receipts").where("businessId", "==", business_id).get()
    for rec in receipts:
        rec.reference.delete()
        logger.info("🗑️ Deleted receipt %s for business %s", rec.id, business_id)

    return {"success": True, "message": f"Business {business_id} and related records + attachments deleted"}

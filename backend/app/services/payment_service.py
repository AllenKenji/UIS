import logging
from google.cloud import firestore
from backend.app.core.firebase import get_firestore

db = get_firestore()

logger = logging.getLogger("uvicorn.error")

def _get_business_doc(business_id: str):
    docs = db.collection("businesses").where("businessId", "==", business_id).limit(1).get()
    return docs[0] if docs else None

def update_payment_status(business_id: str, event_type: str, status: str,
                          transaction_id: str, payment_intent_id: str = None, paid_at=None):
    doc = _get_business_doc(business_id)
    if not doc:
        logger.warning("⚠️ No business found for businessId=%s", business_id)
        return {"success": False, "message": "Business not found"}

    # Map PayMongo statuses to internal statuses
    status_map = {
        "chargeable": "payment_submitted",
        "consumed": "payment_submitted",   # add this
        "unpaid": "for_payment",
        "paid": "payment_submitted",       # staff will verify before final "paid"
        "failed": "payment_failed",
        "cancelled": "payment_cancelled",
        "refunded": "payment_refunded"
    }
    new_status = status_map.get(status, status)

    update_data = {
        "paymentStatus": status,
        "status": new_status,
        "transactionId": transaction_id,
        "eventType": event_type,
        "paymentDate": paid_at or firestore.SERVER_TIMESTAMP
    }
    if payment_intent_id:
        update_data["paymentIntentId"] = payment_intent_id

    doc.reference.update(update_data)
    logger.info("✅ Updated business %s with status=%s event=%s intent=%s",
                business_id, status, event_type, payment_intent_id)
    return {"success": True, "status": new_status}

def update_document_payment_status(event_type: str,
                                   status: str,
                                   transaction_id: str,
                                   paymongo_link_id: str = None,
                                   payment_intent_id: str = None,
                                   source_id: str = None,
                                   paid_at=None):
    """
    Unified document payment status updater.
    Handles PayMongo Link, Intent, and Source events.
    Ensures 'paid' maps to 'payment_submitted' (secretary must verify).
    """
    # --- Find matching document ---
    docs = []
    if paymongo_link_id:
        docs = db.collection("documents").where("paymongoLinkId", "==", paymongo_link_id).get()
    elif payment_intent_id:
        docs = db.collection("documents").where("paymongoIntentId", "==", payment_intent_id).get()
    elif source_id:
        docs = db.collection("documents").where("paymongoSourceId", "==", source_id).get()

    if not docs:
        logger.warning("⚠️ No document found for link=%s intent=%s source=%s",
                       paymongo_link_id, payment_intent_id, source_id)
        return {"success": False, "message": "Document not found"}

    # --- Map PayMongo status to internal status ---
    status_map = {
        "chargeable": "awaiting_payment",
        "consumed": "awaiting_payment",
        "unpaid": "awaiting_payment",
        "paid": "payment_submitted",   # secretary must verify before final 'paid'
        "failed": "payment_failed",
        "cancelled": "payment_cancelled",
        "refunded": "payment_refunded"
    }
    new_status = status_map.get(status, status)

    # --- Build update payload ---
    update_data = {
        "paymentStatus": status,
        "status": new_status,
        "transactionId": transaction_id,
        "eventType": event_type,
        "paymentDate": paid_at or firestore.SERVER_TIMESTAMP
    }
    if payment_intent_id:
        update_data["paymentIntentId"] = payment_intent_id
    if source_id:
        update_data["paymongoSourceId"] = source_id

    # --- Update all matching docs ---
    for doc in docs:
        doc.reference.update(update_data)
        logger.info("✅ Updated document %s with status=%s event=%s intent=%s source=%s",
                    doc.id, status, event_type, payment_intent_id, source_id)

    return {"success": True, "status": new_status}

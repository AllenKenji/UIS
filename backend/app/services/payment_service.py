import logging
from datetime import datetime, timezone
from backend.app.utils.firestore_utils import get_db
from backend.app.core.postgres_store import SERVER_TIMESTAMP


logger = logging.getLogger("uvicorn.error")

def _get_business_doc(business_id: str):
    docs = get_db().collection("businesses").where("businessId", "==", business_id).limit(1).get()
    return docs[0] if docs else None

def _next_receipt_number():
    current_year = datetime.now(timezone.utc).year
    counter_ref = get_db().collection("counters").document(f"receipts_{current_year}")
    transaction = get_db().transaction()

    def increment_counter(transaction):
        snapshot = counter_ref.get(transaction=transaction)

        current = snapshot.get("value") if snapshot.exists else 0

        new_value = current + 1
        transaction.set(counter_ref, {"value": new_value})
        return new_value

    new_number = transaction.run(increment_counter)
    return f"RCPT-{current_year}-{new_number:05d}"



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
        "paymentDate": paid_at or SERVER_TIMESTAMP()
    }
    if payment_intent_id:
        update_data["paymentIntentId"] = payment_intent_id

    doc.reference.update(update_data)

    # ✅ Extract businessName from the document 
    business_data = doc.to_dict() 
    business_name = business_data.get("businessName") 
    owner_name = business_data.get("ownerName") 
    amount = business_data.get("amount") or business_data.get("amountDue")
    
    # ✅ Log payment with businessName 
    log_payment_record( 
        reference_number=business_data.get("referenceNumber") or business_id, 
        transaction_id=transaction_id, 
        amount=amount,
        status=status, 
        fee_type="business_fee", 
        business_id=business_id, 
        business_name=business_name, 
        owner_name=owner_name, 
        business_type=business_data.get("businessType"),
        event_type=event_type,
        paid_at=paid_at,
        method="paymongo",
        barangay_id=business_data.get("barangayId"),
    )

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
        docs = get_db().collection("documents").where("paymongoLinkId", "==", paymongo_link_id).get()
    elif payment_intent_id:
        docs = get_db().collection("documents").where("paymongoIntentId", "==", payment_intent_id).get()
    elif source_id:
        docs = get_db().collection("documents").where("paymongoSourceId", "==", source_id).get()

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
        "paymentDate": paid_at or SERVER_TIMESTAMP()
    }
    if payment_intent_id:
        update_data["paymentIntentId"] = payment_intent_id
    if source_id:
        update_data["paymongoSourceId"] = source_id

    # --- Update all matching docs ---
    for doc in docs:
        doc.reference.update(update_data)
        doc_data = doc.to_dict()
        owner_name = doc_data.get("ownerName")
        business_name = doc_data.get("businessName")
        amount = doc_data.get("amount") or doc_data.get("amountDue")

        log_payment_record(
            reference_number=doc_data.get("referenceNumber") or transaction_id,
            transaction_id=transaction_id,
            amount=amount,
            status=status,
            fee_type="document_fee",
            document_id=doc_data.get("documentId"),
            owner_name=owner_name,
            business_name=business_name,
            document_type=doc_data.get("documentType"),
            event_type=event_type,
            paid_at=paid_at,
            method="paymongo",
            barangay_id=doc_data.get("barangayId"),
        )

        logger.info("✅ Updated document %s with status=%s event=%s intent=%s source=%s",
                    doc.id, status, event_type, payment_intent_id, source_id)

    return {"success": True, "status": new_status}

def log_payment_record(reference_number, transaction_id, amount, status, fee_type,
                       business_id=None, document_id=None, owner_name=None, business_name=None,
                       business_type=None, document_type=None, receipt_number=None,
                       event_type=None, paid_at=None, method=None, barangay_id=None):
    """Log payment into payments and receipts collections."""
    # Decide entity type
    entity_type = "business" if business_id else "document"
    entity_category = business_type if business_id else document_type

    payment_data = {
        "referenceNumber": reference_number,
        "transactionId": transaction_id,
        "amount": amount,
        "status": status,
        "feeType": fee_type,
        "businessId": business_id,
        "documentId": document_id,
        "ownerName": owner_name,
        "businessName": business_name,
        "entityType": entity_type,
        "entityCategory": entity_category,
        "datePaid": paid_at or SERVER_TIMESTAMP(),
        "eventType": event_type,
        "method": method,
        "barangayId": barangay_id,
    }
    get_db().collection("payments").add(payment_data)

    receipt_data = {
        "receiptNumber": receipt_number or _next_receipt_number(),
        **payment_data,
        "issuedBy": "system-webhook"
    }
    get_db().collection("receipts").add(receipt_data)

    logger.info("✅ Logged payment and receipt for reference=%s type=%s", reference_number, entity_category)
    return receipt_data["receiptNumber"]


def list_payments(barangay_id: str = None, status: str = None, limit: int = 200, offset: int = 0):
    """List payment records, most recent first, optionally scoped to a barangay/status."""
    query = get_db().collection("payments").order_by("datePaid", direction="DESCENDING")
    if barangay_id:
        query = query.where("barangayId", "==", barangay_id)
    if status:
        query = query.where("status", "==", status)
    docs = query.limit(limit).offset(offset).get()
    return [doc.to_dict() | {"id": doc.id} for doc in docs]


def payments_summary(barangay_ids: list[str] = None):
    """Aggregate paid-collections totals grouped by barangayId."""
    docs = get_db().collection("payments").where("status", "==", "paid").get()
    totals: dict = {}
    for doc in docs:
        data = doc.to_dict()
        bid = data.get("barangayId")
        if barangay_ids is not None and bid not in barangay_ids:
            continue
        entry = totals.setdefault(bid, {"barangayId": bid, "totalCollected": 0, "count": 0})
        entry["totalCollected"] += float(data.get("amount") or 0)
        entry["count"] += 1
    return list(totals.values())

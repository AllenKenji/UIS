import logging
import hmac
import hashlib
import os
from backend.app.services.payment_service import log_payment_record, _next_receipt_number, _get_business_doc
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from google.cloud import firestore
from backend.app.core.firebase import get_firestore
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/paymongo", tags=["Payments"])
db = get_firestore()

PAYMONGO_WEBHOOK_SECRET = os.getenv("PAYMONGO_WEBHOOK_SECRET", "")

def verify_signature(raw_body: bytes, header_signature: str) -> bool:
    if not PAYMONGO_WEBHOOK_SECRET:
        logger.error("❌ PAYMONGO_WEBHOOK_SECRET not set")
        return False

    parts = {}
    for item in header_signature.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            parts[k.strip()] = v.strip()

    timestamp = parts.get("t")
    provided = parts.get("s") or parts.get("te") or parts.get("li")

    if not timestamp or not provided:
        logger.error("❌ Missing timestamp or signature field in header: %s", header_signature)
        return False

    signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
    computed = hmac.new(
        PAYMONGO_WEBHOOK_SECRET.encode("utf-8"),
        signed_payload,
        hashlib.sha256
    ).hexdigest()

    valid = hmac.compare_digest(computed, provided)
    if not valid:
        logger.warning("⚠️ Signature mismatch. computed=%s provided=%s", computed, provided)
    return valid

def _next_transaction_id():
    counter_ref = db.collection("counters").document("transactions")
    transaction = db.transaction()

    @firestore.transactional
    def increment_counter(transaction):
        snapshot = counter_ref.get(transaction=transaction)
        current = snapshot.get("value") if snapshot.exists else 0
        new_value = current + 1
        transaction.set(counter_ref, {"value": new_value})
        return new_value

    new_number = increment_counter(transaction)
    return f"TXN-{new_number:05d}"

@router.post("/webhook")
async def paymongo_webhook(request: Request):
    try:
        raw_body = await request.body()
        header_signature = request.headers.get("Paymongo-Signature", "")

        logger.debug("📥 Raw webhook body=%s", raw_body.decode("utf-8"))
        logger.debug("📥 Signature header=%s", header_signature)

        if not header_signature or not verify_signature(raw_body, header_signature):
            return JSONResponse(status_code=400, content={"success": False, "message": "Invalid signature"})

        payload = await request.json()
        attributes = payload.get("data", {}).get("attributes", {})
        event_type = attributes.get("type")
        inner_data = attributes.get("data", {})
        inner_attrs = inner_data.get("attributes", {})

        status = inner_attrs.get("status")
        metadata = inner_attrs.get("metadata", {}) or {}
        reference_number = (
            inner_attrs.get("reference_number")
            or inner_attrs.get("externalReferenceNumber")
            or metadata.get("pmReferenceNumber")
        )
        paid_at = inner_attrs.get("paidAt")

        transaction_id = inner_data.get("id")
        intent_id = inner_attrs.get("paymentIntentId")

        # logger.info("📦 Webhook event=%s status=%s metadata=%s ref=%s",
        #             event_type, status, metadata, reference_number)

        allowed_events = {
            "link.payment.paid",
            "payment.paid",
            "payment.failed",
            "payment.cancelled",
            "payment.refunded",
            "source.chargeable",
            "source.consumed"
        }
        if event_type not in allowed_events:
            return JSONResponse(status_code=200, content={"success": True, "message": f"Ignored event {event_type}"})

        if not status:
            return JSONResponse(status_code=400, content={"success": False, "message": "Invalid payload"})

        workflow_map = {
            "paid": "payment_submitted",
            "failed": "payment_failed",
            "cancelled": "payment_cancelled",
            "refunded": "payment_refunded"
        }
        workflow_status = workflow_map.get(status, status)

        update_data = {
            "paymentStatus": status,
            "status": workflow_status,
            "transactionId": transaction_id,
            "paymentIntentId": intent_id,
            "paymentDate": paid_at or firestore.SERVER_TIMESTAMP,
            "eventType": event_type
        }

        # --- Business update ---
        if "businessId" in metadata:
            docs = db.collection("businesses").where("businessId", "==", metadata["businessId"]).limit(1).get()
            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated business=%s status=%s", metadata["businessId"], status)

                business_data = docs[0].to_dict()
                log_payment_record( 
                    reference_number=reference_number or transaction_id,
                    transaction_id=transaction_id, 
                    amount=(inner_attrs.get("amount") or 0) / 100,
                    status=status, 
                    fee_type=metadata.get("feeType"),
                    business_id=metadata.get("businessId"), 
                    owner_name=business_data.get("ownerName"),
                    business_name=business_data.get("businessName"),
                    business_type=business_data.get("businessType"),
                    event_type=event_type, 
                    paid_at=paid_at,
                    method="paymongo"
                )

        # --- Document update via Firestore ID ---
        elif "documentId" in metadata:
            docs = db.collection("documents").where("documentId", "==", metadata["documentId"]).limit(1).get()
            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated document via documentId=%s status=%s", metadata["documentId"], status)
                
                doc_data = docs[0].to_dict()
                # 👉 Log payment + receipt here 
                log_payment_record( 
                    reference_number=reference_number or transaction_id,
                    transaction_id=transaction_id, 
                    amount=(inner_attrs.get("amount") or 0) / 100, 
                    status=status, 
                    fee_type=metadata.get("feeType"),
                    document_id=metadata.get("documentId"),
                    owner_name=doc_data.get("ownerName"),
                    business_name=doc_data.get("businessName"),
                    document_type=doc_data.get("documentType"),
                    event_type=event_type, 
                    paid_at=paid_at,
                    method="paymongo"
                )
            else:
                logger.warning("⚠️ No document found for documentId=%s", metadata["documentId"])

        # --- Fallback: referenceNumber ---
        elif reference_number:
            # Try businesses first
            docs = db.collection("businesses").where("referenceNumber", "==", reference_number).limit(1).get()
            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated business via referenceNumber=%s status=%s", reference_number, status)

                business_data = docs[0].to_dict() 
                log_payment_record( 
                    reference_number=reference_number or transaction_id, 
                    transaction_id=transaction_id, 
                    amount=(inner_attrs.get("amount") or 0) / 100, 
                    status=status, 
                    fee_type=metadata.get("feeType"), 
                    business_id=business_data.get("businessId"), 
                    owner_name=business_data.get("ownerName"), 
                    business_name=business_data.get("businessName"), 
                    business_type=business_data.get("businessType"),
                    event_type=event_type, 
                    paid_at=paid_at,
                    method="paymongo" 
                )
            else:
                # Then try documents
                docs = db.collection("documents").where("referenceNumber", "==", reference_number).limit(1).get()
                if docs:
                    await run_in_threadpool(docs[0].reference.update, update_data)
                    logger.info("✅ Updated document via referenceNumber=%s status=%s", reference_number, status)

                    doc_data = docs[0].to_dict() 
                    log_payment_record( 
                        reference_number=reference_number or transaction_id, 
                        transaction_id=transaction_id, 
                        amount=(inner_attrs.get("amount") or 0) / 100, 
                        status=status, 
                        fee_type=metadata.get("feeType"), 
                        document_id=doc_data.get("documentId"), 
                        owner_name=doc_data.get("ownerName"), 
                        business_name=doc_data.get("businessName"), 
                        document_type=doc_data.get("documentType"),
                        event_type=event_type, 
                        paid_at=paid_at,
                        method="paymongo"
                    )
                else:
                    logger.warning("⚠️ No record found for referenceNumber=%s", reference_number)
                    return JSONResponse(status_code=200, content={"success": False, "message": "Unmatched webhook"})

        else:
            logger.warning("⚠️ No identifiers in webhook payload: %s", payload)
            return JSONResponse(status_code=200, content={"success": False, "message": "Unmatched webhook"})

        return {"success": True}

    except Exception as e:
        logger.exception("❌ Webhook processing failed: %s", e)
        return JSONResponse(status_code=500, content={"success": False, "message": "Webhook error"})
    
@router.post("/payments/business")
def record_business_payment(payload: dict):
    business_id = payload["businessId"]
    amount = payload["amount"]
    method = payload.get("method")

    # fetch business doc
    doc = _get_business_doc(business_id)
    if not doc:
        return {"success": False, "message": "Business not found"}

    business_data = doc.to_dict()

    transaction_id = payload.get("transactionId") or _next_transaction_id()
    receipt_number = _next_receipt_number()

    log_payment_record(
        reference_number=business_data.get("referenceNumber") or business_id,
        transaction_id=transaction_id,
        amount=amount,
        status="paid",
        fee_type="business_fee",
        business_id=business_id,
        business_name=business_data.get("businessName"),
        owner_name=business_data.get("ownerName"),
        business_type=business_data.get("businessType"),
        event_type="staff.payment",
        paid_at=firestore.SERVER_TIMESTAMP,
        method=method,
        receipt_number=receipt_number   # pass explicitly
    )

    response = { 
        "success": True, 
        "receiptNumber": receipt_number, 
        "transactionId": transaction_id,
        "businessId": business_id, 
        "businessName": business_data.get("businessName"), 
        "ownerName": business_data.get("ownerName"), 
        "businessType": business_data.get("businessType"), 
        "barangay": business_data.get("barangay"), 
        "method": method
    } 
    
    return response

@router.post("/payments/document")
def record_document_payment(payload: dict):
    try:
        document_id = payload["documentId"]
        amount = payload["amount"]
        method = payload.get("method")

        # fetch document doc
        doc_ref = db.collection("documents").document(document_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            return {"success": False, "message": "Document not found"}

        doc_data = snapshot.to_dict()

        transaction_id = payload.get("transactionId") or _next_transaction_id()
        receipt_number = _next_receipt_number()

        # 🔑 Update document payment status immediately 
        update_data = { 
            "paymentStatus": "paid", 
            "status": "paid", # secretary payments can be final 
            "transactionId": transaction_id, 
            "paymentDate": firestore.SERVER_TIMESTAMP, 
            "method": method, 
            "eventType": "staff.payment" 
        } 
        doc_ref.update(update_data)

        # log payment + receipt
        log_payment_record(
            reference_number=doc_data.get("referenceNumber") or document_id,
            transaction_id=transaction_id,
            amount=amount,
            status="paid",
            fee_type="document_fee",
            document_id=document_id,
            owner_name=doc_data.get("ownerName"),
            business_name=doc_data.get("businessName"),
            document_type=doc_data.get("documentType"),
            event_type="staff.payment",
            paid_at=firestore.SERVER_TIMESTAMP,
            method=method,
            receipt_number=receipt_number
        )

        response = {
            "success": True,
            "receiptNumber": receipt_number,
            "transactionId": transaction_id,
            "documentId": document_id,
            "documentType": doc_data.get("documentType"),
            "ownerName": doc_data.get("ownerName"),
            "businessName": doc_data.get("businessName"),
            "method": method
        }
        return response

    except Exception as e:
        logger.exception("❌ Document payment failed: %s", e)
        return JSONResponse(status_code=500, content={"success": False, "message": "Payment error", "details": str(e)})

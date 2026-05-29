import logging
import hmac
import hashlib
import os
from backend.app.services.payment_service import log_payment_record, _next_receipt_number, _get_business_doc
from backend.app.services.notification_service import NotificationService
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from google.cloud import firestore
from fastapi.concurrency import run_in_threadpool
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/paymongo", tags=["Payments"])


PAYMONGO_WEBHOOK_SECRET = os.getenv("PAYMONGO_WEBHOOK_SECRET", "")


async def _notify_payment_roles(message: str, event_type: str = "payment_update"):
    for target_role in ("admin", "treasurer", "staff"):
        try:
            await NotificationService.notify(
                role=target_role,
                type=event_type,
                message=message,
            )
        except Exception as notify_err:
            logger.warning("⚠️ Payment notification failed for role=%s: %s", target_role, notify_err)

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
    counter_ref = get_db().collection("counters").document("transactions")
    transaction = get_db().transaction()

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
            or (inner_attrs.get("link") or {}).get("reference_number")
            or metadata.get("pmReferenceNumber")
        )
        link_id_candidates = {
            str(value).strip()
            for value in (
                inner_attrs.get("link_id"),
                inner_attrs.get("payment_link_id"),
                inner_attrs.get("linkId"),
                inner_attrs.get("paymongoLinkId"),
                (inner_attrs.get("link") or {}).get("id"),
                metadata.get("paymongoLinkId"),
            )
            if value
        }

        # Some link events expose the link id in data.id (e.g., link_xxx).
        inner_data_id = str(inner_data.get("id") or "").strip()
        if inner_data_id.startswith("link_"):
            link_id_candidates.add(inner_data_id)
        paid_at = inner_attrs.get("paidAt")

        transaction_id = inner_data.get("id")
        intent_id = (
            inner_attrs.get("paymentIntentId")
            or inner_attrs.get("payment_intent_id")
            or (inner_attrs.get("payment_intent") or {}).get("id")
        )

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

        # Some PayMongo events (notably link events) can omit status in inner attributes.
        # Fall back to event-type-derived status to keep webhook updates reliable.
        if not status:
            event_status_map = {
                "link.payment.paid": "paid",
                "payment.paid": "paid",
                "payment.failed": "failed",
                "payment.cancelled": "cancelled",
                "payment.refunded": "refunded",
            }
            status = event_status_map.get(event_type)

        if not status:
            logger.warning("⚠️ Webhook status missing and could not be derived. event=%s payload=%s", event_type, payload)
            return JSONResponse(status_code=400, content={"success": False, "message": "Invalid payload"})

        # Normalize provider variants to internal workflow values.
        if str(status).strip().lower() == "succeeded":
            status = "paid"

        workflow_map = {
            "paid": "paid",
            "succeeded": "paid",
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
            docs = get_db().collection("businesses").where("businessId", "==", metadata["businessId"]).limit(1).get()
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

                await _notify_payment_roles(
                    f"Business payment {status} ({metadata.get('businessId')})",
                    "payment_update",
                )

        # --- Document update via Firestore ID ---
        elif "documentId" in metadata:
            docs = get_db().collection("documents").where("documentId", "==", metadata["documentId"]).limit(1).get()
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
                await _notify_payment_roles(
                    f"Document payment {status} ({metadata.get('documentId')})",
                    "payment_update",
                )
            else:
                logger.warning("⚠️ No document found for documentId=%s", metadata["documentId"])

        # --- Fallback: referenceNumber ---
        elif reference_number:
            # Try businesses first
            docs = get_db().collection("businesses").where("referenceNumber", "==", reference_number).limit(1).get()
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
                await _notify_payment_roles(
                    f"Business payment {status} ({business_data.get('businessId') or reference_number})",
                    "payment_update",
                )
            else:
                # Then try documents
                docs = get_db().collection("documents").where("referenceNumber", "==", reference_number).limit(1).get()
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
                    await _notify_payment_roles(
                        f"Document payment {status} ({doc_data.get('documentId') or reference_number})",
                        "payment_update",
                    )
                else:
                    logger.warning("⚠️ No record found for referenceNumber=%s", reference_number)
                    return JSONResponse(status_code=200, content={"success": False, "message": "Unmatched webhook"})

        # --- Fallback: paymongoLinkId (common for link.payment.* events) ---
        elif link_id_candidates:
            docs = []
            matched_link_id = None
            for candidate in link_id_candidates:
                docs = get_db().collection("businesses").where("paymongoLinkId", "==", candidate).limit(1).get()
                if docs:
                    matched_link_id = candidate
                    break

            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated business via paymongoLinkId=%s status=%s", matched_link_id, status)

                business_data = docs[0].to_dict()
                log_payment_record(
                    reference_number=reference_number or business_data.get("referenceNumber") or transaction_id,
                    transaction_id=transaction_id,
                    amount=(inner_attrs.get("amount") or 0) / 100,
                    status=status,
                    fee_type=metadata.get("feeType") or business_data.get("feeType"),
                    business_id=business_data.get("businessId"),
                    owner_name=business_data.get("ownerName"),
                    business_name=business_data.get("businessName"),
                    business_type=business_data.get("businessType"),
                    event_type=event_type,
                    paid_at=paid_at,
                    method="paymongo"
                )

                await _notify_payment_roles(
                    f"Business payment {status} ({business_data.get('businessId') or matched_link_id})",
                    "payment_update",
                )
            else:
                logger.warning("⚠️ No business found for paymongoLinkId candidates=%s", sorted(link_id_candidates))
                return JSONResponse(status_code=200, content={"success": False, "message": "Unmatched webhook"})

        else:
            logger.warning("⚠️ No identifiers in webhook payload: %s", payload)
            return JSONResponse(status_code=200, content={"success": False, "message": "Unmatched webhook"})

        return {"success": True}

    except Exception as e:
        logger.exception("❌ Webhook processing failed: %s", e)
        return JSONResponse(status_code=500, content={"success": False, "message": "Webhook error"})
    
@router.post("/payments/business")
async def record_business_payment(payload: dict):
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
    await _notify_payment_roles(
        f"Business payment paid ({business_id})",
        "payment",
    )
    
    return response

@router.post("/payments/document")
async def record_document_payment(payload: dict):
    try:
        document_id = payload.get("documentId")
        amount = payload.get("amount")
        method = payload.get("method")

        if not document_id:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Missing documentId"},
            )

        if amount is None:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Missing amount"},
            )

        # fetch document doc
        doc_ref = get_db().collection("documents").document(document_id)
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
            owner_name=doc_data.get("ownerName") or doc_data.get("residentName"),
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
            "ownerName": doc_data.get("ownerName") or doc_data.get("residentName"),
            "businessName": doc_data.get("businessName"),
            "method": method
        }
        await _notify_payment_roles(
            f"Document payment paid ({document_id})",
            "payment",
        )
        return response

    except Exception as e:
        logger.exception("❌ Document payment failed: %s", e)
        return JSONResponse(status_code=500, content={"success": False, "message": "Payment error", "details": str(e)})

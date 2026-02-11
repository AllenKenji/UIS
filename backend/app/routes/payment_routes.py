import logging
import hmac
import hashlib
import os
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

        logger.info("📦 Webhook event=%s status=%s metadata=%s ref=%s",
                    event_type, status, metadata, reference_number)

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

        # --- Document update via Firestore ID ---
        elif "documentId" in metadata:
            docs = db.collection("documents").where("documentId", "==", metadata["documentId"]).limit(1).get()
            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated document via documentId=%s status=%s", metadata["documentId"], status)
            else:
                logger.warning("⚠️ No document found for documentId=%s", metadata["documentId"])

        # --- Fallback: referenceNumber ---
        elif reference_number:
            # Try businesses first
            docs = db.collection("businesses").where("referenceNumber", "==", reference_number).limit(1).get()
            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated business via referenceNumber=%s status=%s", reference_number, status)
            else:
                # Then try documents
                docs = db.collection("documents").where("referenceNumber", "==", reference_number).limit(1).get()
                if docs:
                    await run_in_threadpool(docs[0].reference.update, update_data)
                    logger.info("✅ Updated document via referenceNumber=%s status=%s", reference_number, status)
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

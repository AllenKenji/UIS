import logging
import hmac
import hashlib
import os
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from backend.app.services.payment_service import (
    update_payment_status,             # business updater
    update_document_payment_status     # document updater
)

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/paymongo", tags=["Payments"])

PAYMONGO_WEBHOOK_SECRET = os.getenv("PAYMONGO_WEBHOOK_SECRET", "")


def verify_signature(raw_body: bytes, header_signature: str, test_mode: bool = True) -> bool:
    """Verify PayMongo webhook signature using HMAC SHA256."""
    if not PAYMONGO_WEBHOOK_SECRET:
        logger.error("❌ PAYMONGO_WEBHOOK_SECRET not set")
        return False

    parts = {}
    for item in header_signature.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            parts[k.strip()] = v.strip()

    timestamp = parts.get("t")
    provided = parts.get("te") if test_mode else parts.get("li")

    if not timestamp or not provided:
        logger.error("❌ Missing timestamp or signature field in header")
        return False

    signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
    computed = hmac.new(
        PAYMONGO_WEBHOOK_SECRET.encode("utf-8"),
        signed_payload,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(computed, provided)


@router.post("/webhook")
async def paymongo_webhook(request: Request):
    try:
        raw_body = await request.body()
        header_signature = request.headers.get("Paymongo-Signature", "")

        if not header_signature or not verify_signature(raw_body, header_signature, test_mode=True):
            logger.warning("⚠️ Invalid webhook signature")
            return JSONResponse(status_code=400, content={"success": False, "message": "Invalid signature"})

        payload = await request.json()
        logger.info("📦 Verified webhook payload: %s", payload)

        attributes = payload.get("data", {}).get("attributes", {})
        event_type = attributes.get("type")

        allowed_events = {"link.payment.paid", "payment.failed", "payment.cancelled", "payment.refunded"}
        if event_type not in allowed_events:
            logger.info("ℹ️ Ignoring event type %s", event_type)
            return JSONResponse(status_code=200, content={"success": True, "message": f"Ignored event {event_type}"})

        inner_data = attributes.get("data", {})
        inner_attrs = inner_data.get("attributes", {})

        status = inner_attrs.get("status")
        transaction_id = inner_data.get("id")  # PayMongo link id
        payment_intent_id = inner_attrs.get("payment_intent_id")
        metadata = inner_attrs.get("metadata", {})

        if not status or not transaction_id:
            logger.error("❌ Missing status or transaction_id in webhook payload")
            return JSONResponse(status_code=400, content={"success": False, "message": "Invalid payload"})

        # 🔎 Route based on metadata
        if "businessId" in metadata:
            result = update_payment_status(
                business_id=metadata["businessId"],
                event_type=event_type,
                status=status,
                transaction_id=transaction_id,
                payment_intent_id=payment_intent_id,
                paid_at=inner_attrs.get("paid_at")
            )
            logger.info("🏢 Business payment updated: businessId=%s feeType=%s status=%s",
                        metadata.get("businessId"), metadata.get("feeType"), status)

        elif "documentId" in metadata:
            result = update_document_payment_status(
                paymongo_link_id=transaction_id,
                event_type=event_type,
                status=status,
                transaction_id=transaction_id,
                payment_intent_id=payment_intent_id,
                paid_at=inner_attrs.get("paid_at")
            )
            logger.info("📄 Document payment updated: documentId=%s documentType=%s status=%s",
                        metadata.get("documentId"), metadata.get("documentType"), status)

        else:
            logger.warning("⚠️ No businessId or documentId in metadata")
            return JSONResponse(status_code=400, content={"success": False, "message": "Missing metadata"})

        return {"success": True, "result": result}

    except Exception:
        logger.exception("❌ Webhook processing failed")
        return JSONResponse(status_code=500, content={"success": False, "message": "Webhook error"})

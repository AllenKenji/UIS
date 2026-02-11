import base64
import logging
import os
import requests
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from backend.app.services.paymongo_service import create_payment_link, create_payment_intent
from backend.app.models.paymongo import DocumentPaymentRequest, BusinessPaymentRequest, AttachPaymentRequest
from backend.app.core.firebase import get_firestore
from backend.app.routes.fee_routes import (
    compute_document_fee,
    compute_business_registration_fee,
    compute_business_annual_fee,
)

db = get_firestore()
logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Payments"])

# -----------------------------
# Firestore helpers
# -----------------------------
def _get_document_doc(document_id: str):
    docs = db.collection("documents").where("documentId", "==", document_id).limit(1).get()
    return docs[0] if docs else None

def _get_business_doc(business_id: str):
    docs = db.collection("businesses").where("businessId", "==", business_id).limit(1).get()
    return docs[0] if docs else None

# -----------------------------
# Shared payment creation logic
# -----------------------------
def _create_payment(fee: int, description: str, remarks: str, metadata: dict,
                    success_url: str, cancel_url: str):
    """Create either a Payment Intent (< ₱100) or Payment Link (≥ ₱100)."""
    if fee < 100:
        result = create_payment_intent(
            amount=fee, description=description, remarks=remarks,
            metadata=metadata
        )
        return {
            "checkoutUrl": result.get("checkoutUrl"),
            "referenceNumber": result.get("referenceNumber"),
            "paymentStatus": result.get("paymentStatus") or "awaiting_payment",
            "paymentIntentId": result.get("paymentIntentId"),
            "paymongoClientKey": result.get("paymongoClientKey"),
            "type": "intent"
        }
    else:
        result = create_payment_link(
            amount=fee, description=description, remarks=remarks,
            metadata=metadata, success_url=success_url, cancel_url=cancel_url
        )
        return {
            "checkoutUrl": result.get("checkoutUrl"),
            "referenceNumber": result.get("referenceNumber"),
            "paymentStatus": result.get("paymentStatus") or "awaiting_payment",
            "paymongoLinkId": result.get("paymongoLinkId"),
            "type": "link"
        }

# -----------------------------
# Document Payment Route
# -----------------------------
@router.post("/create-document-link")
async def create_document_payment_link(payload: DocumentPaymentRequest) -> dict:
    try:
        fee = compute_document_fee(payload.documentType)
        if fee <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid fee for document type: {payload.documentType}")

        description = f"{payload.documentType} Request {payload.documentId}"
        metadata = {"documentId": payload.documentId, "documentType": payload.documentType}

        result = _create_payment(
            fee, description, payload.remarks, metadata,
            success_url="http://localhost:3000/payment-success?type=document",
            cancel_url="http://localhost:3000/documents/payment-cancel"
        )

        doc = _get_document_doc(payload.documentId)
        if doc:
            update_data = {
                "checkoutUrl": result["checkoutUrl"],
                "paymentStatus": result["paymentStatus"],
                "status": "awaiting_payment",
                "fee": fee,
                "referenceNumber": result.get("referenceNumber"),
                "paymentIntentId": result.get("paymentIntentId"),
                "paymongoClientKey": result.get("paymongoClientKey"),
                "paymongoLinkId": result.get("paymongoLinkId")
            }
            await run_in_threadpool(doc.reference.update, update_data)
        else:
            logger.warning("⚠️ No Firestore document found for %s", payload.documentId)

        return {"success": True, "fee": fee, **result}

    except Exception as e:
        logger.exception("❌ Failed to create document payment: %s", e)
        raise HTTPException(status_code=500, detail="Document payment creation failed")

# -----------------------------
# Business Payment Route
# -----------------------------
@router.post("/create-business-link")
async def create_business_payment_link(payload: BusinessPaymentRequest) -> dict:
    try:
        fee = compute_business_annual_fee(payload.businessType) if payload.feeType == "annual" \
              else compute_business_registration_fee(payload.businessType)
        if fee <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid fee for {payload.feeType} of {payload.businessType}")

        description = f"{payload.feeType} for {payload.businessType} ({payload.businessId})"
        metadata = {"businessId": payload.businessId, "businessType": payload.businessType, "feeType": payload.feeType}

        result = _create_payment(
            fee, description, payload.remarks, metadata,
            success_url="http://localhost:3000/payment-success?type=business",
            cancel_url="http://localhost:3000/business/payment-cancel"
        )

        doc = _get_business_doc(payload.businessId)
        if doc:
            update_data = {
                "fee": fee,
                "feeType": payload.feeType,
                "status": "awaiting_payment",
                "paymentStatus": result["paymentStatus"],
                "checkoutUrl": result["checkoutUrl"],
                "referenceNumber": result.get("referenceNumber"),
                "paymentIntentId": result.get("paymentIntentId"),
                "paymongoClientKey": result.get("paymongoClientKey"),
                "paymongoLinkId": result.get("paymongoLinkId")
            }
            await run_in_threadpool(doc.reference.update, update_data)
        else:
            logger.warning("⚠️ No Firestore business found for %s", payload.businessId)

        return {"success": True, "fee": fee, **result}

    except Exception as e:
        logger.exception("❌ Failed to create business payment: %s", e)
        raise HTTPException(status_code=500, detail="Business payment creation failed")

# -----------------------------
# Attach Payment Method Route
# -----------------------------
@router.post("/attach-payment-method")
async def attach_payment_method(payload: AttachPaymentRequest) -> dict:
    try:
        PAYMONGO_SECRET_KEY = os.getenv("PAYMONGO_SECRET_KEY")
        if not PAYMONGO_SECRET_KEY:
            raise HTTPException(status_code=500, detail="PayMongo secret key not configured")

        headers = {
            "Authorization": f"Basic {base64.b64encode(PAYMONGO_SECRET_KEY.encode()).decode()}",
            "Content-Type": "application/json"
        }

        # Step 1: Create payment method
        pm_payload = {
            "data": {
                "attributes": {
                    "type": payload.method, 
                    "billing": payload.billing.dict()
                }
            }
        }
        pm_res = requests.post("https://api.paymongo.com/v1/payment_methods", json=pm_payload, headers=headers)
        pm_data = pm_res.json()
        if "errors" in pm_data:
            logger.error("❌ Payment method creation failed: %s", pm_data)
            raise HTTPException(status_code=400, detail="Payment method creation failed")

        payment_method_id = pm_data["data"]["id"]

        # Step 2: Attach to intent
        return_url = payload.return_url or "http://localhost:3000/payment-success?type=document"
        attach_payload = {"data": {"attributes": {"payment_method": payment_method_id, "client_key": payload.paymongoClientKey, "return_url": return_url}}}
        intent_res = requests.post(
            f"https://api.paymongo.com/v1/payment_intents/{payload.paymentIntentId}/attach",
            json=attach_payload, headers=headers
        )
        intent_data = intent_res.json()
        if "errors" in intent_data:
            logger.error("❌ Payment intent attach failed: %s", intent_data)
            raise HTTPException(status_code=400, detail="Payment intent attach failed")

        redirect_url = intent_data["data"]["attributes"].get("next_action", {}).get("redirect", {}).get("url")
        if not redirect_url:
            logger.error("⚠️ No redirect URL in intent attach response: %s", intent_data)
            raise HTTPException(status_code=500, detail="No redirect URL returned from PayMongo")

        return {"redirectUrl": redirect_url}

    except Exception as e:
        logger.exception("❌ Failed to attach payment method: %s", e)
        raise HTTPException(status_code=500, detail="Attach payment method failed")

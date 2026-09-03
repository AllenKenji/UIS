import base64
import logging
import os
import requests
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from backend.app.utils.firestore_utils import get_db
from backend.app.services.paymongo_service import (
    create_payment_link,
    create_payment_intent,
    get_payment_link,
    get_payment_intent,
    get_payment_link_payments,
)
from backend.app.services.payment_service import log_payment_record, build_business_renewal_update
from backend.app.models.paymongo import DocumentPaymentRequest, BusinessPaymentRequest, AttachPaymentRequest
from backend.app.routes.fee_routes import (
    compute_document_fee,
    compute_business_registration_fee,
    compute_business_annual_fee,
)


logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Payments"])
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "https://uis.lits.com.ph").rstrip("/")

# -----------------------------
# Firestore helpers
# -----------------------------
def _get_document_doc(document_id: str):
    docs = get_db().collection("documents").where("documentId", "==", document_id).limit(1).get()
    return docs[0] if docs else None

def _get_business_doc(business_id: str):
    docs = get_db().collection("businesses").where("businessId", "==", business_id).limit(1).get()
    return docs[0] if docs else None

def _is_paid_status(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"paid", "succeeded"}

def _link_has_paid_payment(link_state: dict) -> bool:
    raw = (link_state or {}).get("raw") or {}
    attrs = (raw.get("data") or {}).get("attributes") or {}
    payments = attrs.get("payments") or []

    for payment in payments:
        if not isinstance(payment, dict):
            continue
        payment_attrs = payment.get("attributes") or {}
        status = str(payment_attrs.get("status") or payment.get("status") or "").strip().lower()
        if status in {"paid", "succeeded"}:
            return True

    return False

def _link_payments_has_paid(link_id: str) -> bool:
    try:
        payments_state = get_payment_link_payments(link_id)
        statuses = payments_state.get("statuses") or []
        return any(status in {"paid", "succeeded"} for status in statuses)
    except Exception as err:
        logger.warning("⚠️ Failed to fetch link payments for %s: %s", link_id, err)
        return False


def _receipt_exists_for_entity(*, business_id: str | None = None, document_id: str | None = None) -> bool:
    try:
        if business_id:
            existing = get_db().collection("receipts").where("businessId", "==", business_id).limit(1).get()
            if existing:
                return True
        if document_id:
            existing = get_db().collection("receipts").where("documentId", "==", document_id).limit(1).get()
            if existing:
                return True
        return False
    except Exception as err:
        logger.warning("⚠️ Failed checking receipt existence business=%s document=%s: %s", business_id, document_id, err)
        return False


def _ensure_reconciled_receipt(*, kind: str, doc_data: dict, status: str, event_type: str, method: str = "paymongo"):
    if kind == "business":
        business_id = doc_data.get("businessId")
        if not business_id or _receipt_exists_for_entity(business_id=business_id):
            return
        log_payment_record(
            reference_number=doc_data.get("referenceNumber") or business_id,
            transaction_id=doc_data.get("transactionId") or doc_data.get("paymentIntentId") or doc_data.get("paymongoLinkId") or business_id,
            amount=doc_data.get("amount") or doc_data.get("amountDue") or doc_data.get("fee") or 0,
            status=status,
            fee_type=doc_data.get("feeType") or "business_fee",
            business_id=business_id,
            owner_name=doc_data.get("ownerName"),
            business_name=doc_data.get("businessName"),
            business_type=doc_data.get("businessType"),
            event_type=event_type,
            method=method,
        )
        return

    document_id = doc_data.get("documentId")
    if not document_id or _receipt_exists_for_entity(document_id=document_id):
        return
    log_payment_record(
        reference_number=doc_data.get("referenceNumber") or document_id,
        transaction_id=doc_data.get("transactionId") or doc_data.get("paymentIntentId") or doc_data.get("paymongoLinkId") or document_id,
        amount=doc_data.get("amount") or doc_data.get("amountDue") or doc_data.get("fee") or 0,
        status=status,
        fee_type="document_fee",
        document_id=document_id,
        owner_name=doc_data.get("ownerName") or doc_data.get("residentName"),
        business_name=doc_data.get("businessName"),
        document_type=doc_data.get("documentType"),
        event_type=event_type,
        method=method,
    )

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
            "paymentStatus": result.get("paymentStatus") or "awaiting_payment" or "for_payment",
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
            "paymentStatus": result.get("paymentStatus") or "awaiting_payment" or "for_payment",
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
            success_url=f"{FRONTEND_BASE_URL}/payment-success?type=document&documentId={payload.documentId}",
            cancel_url=f"{FRONTEND_BASE_URL}/documents/payment-cancel"
        )

        doc = _get_document_doc(payload.documentId)
        if doc:
            update_data = {
                "checkoutUrl": result["checkoutUrl"],
                "paymentStatus": result["paymentStatus"],
                "status": "for_payment",
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
            success_url=f"{FRONTEND_BASE_URL}/payment-success?type=business&businessId={payload.businessId}",
            cancel_url=f"{FRONTEND_BASE_URL}/business/payment-cancel"
        )

        doc = _get_business_doc(payload.businessId)
        if doc:
            update_data = {
                "fee": fee,
                "feeType": payload.feeType,
                "paymentStatus": result["paymentStatus"],
                "checkoutUrl": result["checkoutUrl"],
                "referenceNumber": result.get("referenceNumber"),
                "paymentIntentId": result.get("paymentIntentId"),
                "paymongoClientKey": result.get("paymongoClientKey"),
                "paymongoLinkId": result.get("paymongoLinkId")
            }
            # Annual renewal payments happen on an already-approved,
            # operating business (or one that just expired) — don't bump it
            # into "awaiting_payment" (that status means "new application
            # pending its first payment") while the link is open. It stays
            # "approved"/"expired" until the payment actually completes; see
            # build_business_renewal_update below.
            if payload.feeType != "annual":
                update_data["status"] = "awaiting_payment"
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
    """
    Attach a payment method (GCash/GrabPay) to a PayMongo Payment Intent.
    Supports both business and document flows by setting the correct return_url.
    """
    try:
        PAYMONGO_SECRET_KEY = os.getenv("PAYMONGO_SECRET_KEY")
        if not PAYMONGO_SECRET_KEY:
            raise HTTPException(status_code=500, detail="PayMongo secret key not configured")

        headers = {
            "Authorization": f"Basic {base64.b64encode(f'{PAYMONGO_SECRET_KEY}:'.encode()).decode()}",
            "Content-Type": "application/json"
        }

        # Step 1: Create payment method
        pm_payload = {
            "data": {
                "attributes": {
                    "type": payload.method,  # "gcash" or "grab_pay"
                    "billing": payload.billing.model_dump()
                }
            }
        }
        pm_res = requests.post("https://api.paymongo.com/v1/payment_methods", json=pm_payload, headers=headers)
        pm_data = pm_res.json()
        # logger.info("📥 Payment method response: %s", pm_data)

        if "errors" in pm_data:
            logger.error("❌ Payment method creation failed: %s", pm_data)
            raise HTTPException(status_code=400, detail="Payment method creation failed")

        payment_method_id = pm_data["data"]["id"]

        # Step 2: Attach to intent
        if payload.return_url:
            return_url = payload.return_url
        elif payload.type == "business":
            return_url = f"{FRONTEND_BASE_URL}/payment-success?type=business"
        else:
            return_url = f"{FRONTEND_BASE_URL}/payment-success?type=document"

        attach_payload = {
            "data": {
                "attributes": {
                    "payment_method": payment_method_id,
                    "client_key": payload.paymongoClientKey,
                    "return_url": return_url
                }
            }
        }
        intent_res = requests.post(
            f"https://api.paymongo.com/v1/payment_intents/{payload.paymentIntentId}/attach",
            json=attach_payload, headers=headers
        )
        intent_data = intent_res.json()
        # logger.info("📥 Attach response: %s", intent_data)

        if "errors" in intent_data:
            logger.error("❌ Payment intent attach failed: %s", intent_data)
            raise HTTPException(status_code=400, detail="Payment intent attach failed")

        attrs = intent_data["data"]["attributes"]
        redirect_url = attrs.get("next_action", {}).get("redirect", {}).get("url")
        if not redirect_url:
            logger.error("⚠️ No redirect URL in intent attach response: %s", intent_data)
            raise HTTPException(status_code=500, detail="No redirect URL returned from PayMongo")

        return {
            "redirectUrl": redirect_url,
            "status": attrs.get("status"),
            "referenceNumber": attrs.get("reference_number"),
            "paymentIntentId": payload.paymentIntentId
        }

    except Exception as e:
        logger.exception("❌ Failed to attach payment method: %s", e)
        raise HTTPException(status_code=500, detail="Attach payment method failed")


@router.post("/reconcile-return")
async def reconcile_return(payload: dict) -> dict:
    """Fallback sync when user returns from PayMongo but webhook is delayed/missed."""
    try:
        kind = str(payload.get("type") or "").strip().lower()
        if kind not in {"business", "document"}:
            raise HTTPException(status_code=400, detail="type must be 'business' or 'document'")

        if kind == "business":
            business_id = str(payload.get("businessId") or "").strip()
            if not business_id:
                raise HTTPException(status_code=400, detail="businessId is required")

            doc = _get_business_doc(business_id)
            if not doc:
                raise HTTPException(status_code=404, detail="Business not found")

            data = doc.to_dict() or {}
            current_status = str(data.get("paymentStatus") or "").strip().lower()
            if _is_paid_status(current_status):
                doc_status = str(data.get("status") or "").strip().lower()
                if doc_status != "paid":
                    await run_in_threadpool(doc.reference.update, {"status": "paid"})
                return {"success": True, "updated": False, "paymentStatus": current_status, "status": data.get("status")}

            link_id = data.get("paymongoLinkId")
            intent_id = data.get("paymentIntentId")

            provider_status = None
            reference_number = None
            is_paid = False
            if link_id:
                link_state = get_payment_link(link_id)
                provider_status = link_state.get("paymentStatus")
                reference_number = link_state.get("referenceNumber")
                is_paid = (
                    _is_paid_status(provider_status)
                    or _link_has_paid_payment(link_state)
                    or _link_payments_has_paid(link_id)
                )
            elif intent_id:
                intent_state = get_payment_intent(intent_id)
                provider_status = intent_state.get("paymentStatus")
                reference_number = intent_state.get("referenceNumber")
                is_paid = _is_paid_status(provider_status)

            if not is_paid:
                return {
                    "success": True,
                    "updated": False,
                    "paymentStatus": provider_status or current_status or "unpaid",
                    "status": data.get("status"),
                }

            is_renewal = str(data.get("feeType") or "").strip().lower() == "annual"
            renewal_update = build_business_renewal_update(data) if is_renewal else None
            update_payload = renewal_update or {"paymentStatus": "paid", "status": "paid"}
            update_payload["referenceNumber"] = reference_number or data.get("referenceNumber")

            await run_in_threadpool(doc.reference.update, update_payload)

            refreshed = doc.to_dict() or {}
            _ensure_reconciled_receipt(
                kind="business",
                doc_data=refreshed,
                status="paid",
                event_type="paymongo.reconcile_return",
            )
            return {
                "success": True,
                "updated": True,
                "paymentStatus": "paid",
                "status": update_payload["status"],
            }

        document_id = str(payload.get("documentId") or "").strip()
        if not document_id:
            raise HTTPException(status_code=400, detail="documentId is required")

        doc = _get_document_doc(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        data = doc.to_dict() or {}
        current_status = str(data.get("paymentStatus") or "").strip().lower()
        if _is_paid_status(current_status):
            doc_status = str(data.get("status") or "").strip().lower()
            if doc_status != "paid":
                await run_in_threadpool(doc.reference.update, {"status": "paid"})
            return {"success": True, "updated": False, "paymentStatus": current_status, "status": data.get("status")}

        link_id = data.get("paymongoLinkId")
        intent_id = data.get("paymentIntentId")

        provider_status = None
        reference_number = None
        is_paid = False
        if link_id:
            link_state = get_payment_link(link_id)
            provider_status = link_state.get("paymentStatus")
            reference_number = link_state.get("referenceNumber")
            is_paid = (
                _is_paid_status(provider_status)
                or _link_has_paid_payment(link_state)
                or _link_payments_has_paid(link_id)
            )
        elif intent_id:
            intent_state = get_payment_intent(intent_id)
            provider_status = intent_state.get("paymentStatus")
            reference_number = intent_state.get("referenceNumber")
            is_paid = _is_paid_status(provider_status)

        if not is_paid:
            return {
                "success": True,
                "updated": False,
                "paymentStatus": provider_status or current_status or "unpaid",
                "status": data.get("status"),
            }

        await run_in_threadpool(
            doc.reference.update,
            {
                "paymentStatus": "paid",
                "status": "paid",
                "referenceNumber": reference_number or data.get("referenceNumber"),
            },
        )

        refreshed = doc.to_dict() or {}
        _ensure_reconciled_receipt(
            kind="document",
            doc_data=refreshed,
            status="paid",
            event_type="paymongo.reconcile_return",
        )
        return {"success": True, "updated": True, "paymentStatus": "paid", "status": "paid"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("❌ Failed to reconcile return status: %s", e)
        raise HTTPException(status_code=500, detail="Failed to reconcile payment status")

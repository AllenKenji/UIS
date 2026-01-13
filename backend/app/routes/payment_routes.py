from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging
from backend.app.services.paymongo_service import create_payment_link, get_payment_link
from backend.app.core.firebase import get_firestore

db = get_firestore()
logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/paymongo", tags=["Payments"])


class DocumentPaymentRequest(BaseModel):
    documentId: str
    documentType: str   # 🔎 Resident specifies type (e.g. "Barangay Clearance")
    remarks: str = ""


class BusinessPaymentRequest(BaseModel):
    businessId: str
    businessType: str   # 🔎 e.g. "Retail Store"
    feeType: str        # 🔎 "registrationFee" or "annualFee"
    remarks: str = ""


def _get_document_doc(document_id: str):
    docs = db.collection("documents").where("id", "==", document_id).limit(1).get()
    return docs[0] if docs else None


def _get_document_fee(document_type: str) -> int:
    docs = db.collection("document_types").where("documentType", "==", document_type).limit(1).get()
    if not docs:
        raise ValueError(f"No fee configured for document type: {document_type}")
    return docs[0].to_dict().get("fee", 0)


def _get_business_doc(business_id: str):
    docs = db.collection("businesses").where("businessId", "==", business_id).limit(1).get()
    return docs[0] if docs else None


def _get_business_fee(business_type: str, fee_type: str) -> int:
    docs = db.collection("business_types").where("businessType", "==", business_type).limit(1).get()
    if not docs:
        raise ValueError(f"No fee configured for business type: {business_type}")
    data = docs[0].to_dict()
    fee = data.get(fee_type)
    if fee is None:
        raise ValueError(f"No {fee_type} configured for business type: {business_type}")
    return fee


@router.post("/create-document-link")
async def create_document_payment_link(payload: DocumentPaymentRequest) -> dict:
    try:
        # 🔎 Lookup fee from document_types collection
        fee = _get_document_fee(payload.documentType)
        if fee <= 0:
            raise ValueError(f"Invalid fee for document type: {payload.documentType}")

        doc = _get_document_doc(payload.documentId)
        if doc:
            existing = doc.to_dict()
            link_id = existing.get("paymongoLinkId")
            checkout_url = existing.get("checkoutUrl")

            if link_id:
                try:
                    link_info = get_payment_link(link_id)
                    if link_info.get("status") == "active":
                        return {"success": True, "checkout_url": checkout_url, "link_id": link_id}
                except Exception as e:
                    logger.warning("⚠️ Could not verify existing document link %s: %s", link_id, e)

        # 📝 Create new PayMongo link
        description = f"{payload.documentType} Request {payload.documentId}"
        result = create_payment_link(
            amount=fee,
            description=description,
            remarks=payload.remarks,
            metadata={"documentId": payload.documentId, "documentType": payload.documentType},
            success_url="https://your-app.com/documents/payment-success",
            cancel_url="https://your-app.com/documents/payment-cancel"
        )

        link_id = result.get("link_id")
        checkout_url = result.get("checkout_url")
        if not link_id or not checkout_url:
            raise ValueError("Missing link_id or checkout_url from PayMongo response")

        doc.reference.update({
            "paymongoLinkId": link_id,
            "checkoutUrl": checkout_url,
            "paymentStatus": "awaiting_payment",
            "status": "awaiting_payment",
            "fee": fee
        })

        return {"success": True, "checkout_url": checkout_url, "link_id": link_id, "fee": fee}

    except Exception as e:
        logger.exception("❌ Failed to create document payment link")
        raise HTTPException(status_code=500, detail=f"Failed to create document payment link: {str(e)}")


@router.post("/create-business-link")
async def create_business_payment_link(payload: BusinessPaymentRequest) -> dict:
    try:
        # 🔎 Lookup fee from business_types collection
        fee = _get_business_fee(payload.businessType, payload.feeType)
        if fee <= 0:
            raise ValueError(f"Invalid fee for {payload.feeType} of {payload.businessType}")

        doc = _get_business_doc(payload.businessId)
        if doc:
            existing = doc.to_dict()
            link_id = existing.get("paymongoLinkId")
            checkout_url = existing.get("checkoutUrl")

            if link_id:
                try:
                    link_info = get_payment_link(link_id)
                    if link_info.get("status") == "active":
                        return {"success": True, "checkout_url": checkout_url, "link_id": link_id}
                except Exception as e:
                    logger.warning("⚠️ Could not verify existing business link %s: %s", link_id, e)

        # 📝 Create new PayMongo link
        description = f"{payload.feeType} for {payload.businessType} ({payload.businessId})"
        result = create_payment_link(
            amount=fee,
            description=description,
            remarks=payload.remarks,
            metadata={"businessId": payload.businessId, "businessType": payload.businessType, "feeType": payload.feeType},
            success_url="https://your-app.com/business/payment-success",
            cancel_url="https://your-app.com/business/payment-cancel"
        )

        link_id = result.get("link_id")
        checkout_url = result.get("checkout_url")
        if not link_id or not checkout_url:
            raise ValueError("Missing link_id or checkout_url from PayMongo response")

        doc.reference.update({
            "paymongoLinkId": link_id,
            "checkoutUrl": checkout_url,
            "paymentStatus": "for_payment",
            "status": "for_payment",
            "fee": fee,
            "feeType": payload.feeType
        })

        return {"success": True, "checkout_url": checkout_url, "link_id": link_id, "fee": fee}

    except Exception as e:
        logger.exception("❌ Failed to create business payment link")
        raise HTTPException(status_code=500, detail=f"Failed to create business payment link: {str(e)}")

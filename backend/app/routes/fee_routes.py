from fastapi import APIRouter, Depends, HTTPException, Body
import os
from backend.app.core.auth import get_admin_uid
from backend.app.services.paymongo_service import ( 
    create_payment_link, 
    create_payment_intent # ✅ new helper for e-wallets 
)
from backend.app.models.fee import (
    DocumentFee, BusinessFee, MiscFee,
    NewDocumentFee, NewBusinessFee, NewMiscFee
)
from backend.app.utils.firestore_utils import (
    create_document,
    update_document,
    delete_document,
    get_db
)
import re
import logging
from typing import List, Dict, Optional, Type
from pydantic import BaseModel


router = APIRouter(prefix="/fees", tags=["Fees"])
logger = logging.getLogger("uvicorn.error")
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "https://uis.lits.com.ph").rstrip("/")



# -----------------------------
# 🔧 Utility: Normalize IDs
# -----------------------------
def normalize_id(value: str) -> str:
    return re.sub(r"[^a-z0-9_]", "_", value.strip().lower())

def calculate_misc_fee(misc: dict, base_amount: int | float) -> int:
    value = misc.get("fee", 0) or 0
    if misc.get("feeType", "fixed") == "percentage":
        return round(float(base_amount or 0) * float(value) / 100)
    return round(float(value))

def get_misc_configuration(misc: dict, usage: str) -> tuple[bool, str, float]:
    if usage == "document" and "useForDocuments" in misc:
        return (
            bool(misc.get("useForDocuments")),
            misc.get("documentFeeType", "fixed"),
            misc.get("documentFee", 0),
        )
    if usage == "business" and "useForBusinesses" in misc:
        return (
            bool(misc.get("useForBusinesses")),
            misc.get("businessFeeType", "fixed"),
            misc.get("businessFee", 0),
        )
    return True, misc.get("feeType", "fixed"), misc.get("fee", 0)

def find_misc_entry(entries: list[dict], usage: str, target_name: str) -> dict | None:
    target_type = "business" if usage == "business" else "document"
    normalized_target = normalize_id(target_name)
    exact = next(
        (
            entry for entry in entries
            if entry.get("targetType") == target_type
            and normalize_id(entry.get("targetName", "")) == normalized_target
        ),
        None,
    )
    if exact:
        return exact
    return next((entry for entry in entries if not entry.get("targetType")), None)

# -----------------------------
# 🔧 Shared Firestore Helpers
# -----------------------------
def list_collection(collection: str) -> List[Dict]:
    docs = get_db().collection(collection).get()
    return [doc.to_dict() | {"id": doc.id} for doc in docs]

def list_with_misc(collection: str) -> List[Dict]:
    docs = get_db().collection(collection).get()
    misc_map = {}
    for misc_doc in get_db().collection("misc_fees").get():
        misc_map.setdefault(normalize_id(misc_doc.to_dict().get("miscType", misc_doc.id)), []).append(
            misc_doc.to_dict()
        )
    result = []
    for doc in docs:
        data = doc.to_dict()
        misc_type_raw = data.get("miscType")
        if misc_type_raw:
            misc_type_key = normalize_id(misc_type_raw)
            usage = "business" if collection == "business_types" else "document"
            target_name = data.get("businessType") if usage == "business" else data.get("documentType")
            misc_entry = find_misc_entry(misc_map.get(misc_type_key, []), usage, target_name or "")
            if misc_entry and misc_entry.get("enabled") and data.get("enabled"):
                use_fee, fee_type, fee_value = get_misc_configuration(misc_entry, usage)
                data["miscFeeType"] = fee_type
                data["miscFeeRate"] = fee_value
                misc_config = {"fee": fee_value, "feeType": fee_type}
                if use_fee and collection == "business_types":
                    registration_base = data.get("fee", 0) + data.get("registrationFee", 0)
                    annual_base = data.get("fee", 0) + data.get("annualFee", 0)
                    data["registrationMiscFeeResolved"] = calculate_misc_fee(misc_config, registration_base)
                    data["annualMiscFeeResolved"] = calculate_misc_fee(misc_config, annual_base)
                    data["miscFeeResolved"] = data["registrationMiscFeeResolved"]
                else:
                    data["miscFeeResolved"] = calculate_misc_fee(
                        misc_config, data.get("fee", 0)
                    ) if use_fee else None
            else:
                data["miscFeeResolved"] = None
        else:
            data["miscFeeResolved"] = None
        result.append(data | {"id": doc.id})
    return result

def get_business_ref(identifier: str):
    # Try Firestore doc ID
    ref = get_db().collection("businesses").document(identifier)
    if ref.get().exists:
        return ref
    # Try custom businessId field
    docs = get_db().collection("businesses").where("businessId", "==", identifier).limit(1).get()
    if docs:
        return docs[0].reference
    raise HTTPException(status_code=404, detail=f"Business {identifier} not found")

def get_document_ref(identifier: str):
    ref = get_db().collection("documents").document(identifier)
    if ref.get().exists:
        return ref
    docs = get_db().collection("documents").where("documentId", "==", identifier).limit(1).get()
    if docs:
        return docs[0].reference
    raise HTTPException(status_code=404, detail=f"Document {identifier} not found")

# -----------------------------
# 🔨 Router Factory
# -----------------------------
def make_fee_routes(
    collection: str,
    prefix: str,
    new_model: Type[BaseModel],
    update_model: Type[BaseModel],
    id_field: str,
    extra_fields: Optional[List[str]] = None,
    resolve_misc: bool = False,
):
    if extra_fields is None:
        extra_fields = []

    @router.get(f"/{prefix}")
    def list_fees(admin=Depends(get_admin_uid)):
        return list_with_misc(collection) if resolve_misc else list_collection(collection)

    @router.post(f"/{prefix}")
    def create_fee(payload: new_model = Body(...), admin=Depends(get_admin_uid)):  # type: ignore
        """
        Create a new fee entry in Firestore.
        FastAPI will validate `payload` against the `new_model` schema.
        """
        logger.info("Creating fee with payload=%s", payload.dict())

        fee_id = normalize_id(getattr(payload, id_field))
        if collection == "misc_fees" and getattr(payload, "targetType", None) and getattr(payload, "targetName", None):
            fee_id = normalize_id(
                f"{getattr(payload, id_field)}_{payload.targetType}_{payload.targetName}"
            )
        data = {id_field: getattr(payload, id_field).strip(), "fee": payload.fee}
        for field in extra_fields:
            data[field] = getattr(payload, field, None)
        return create_document(collection, fee_id, data)

    @router.put(f"/{prefix}/{{fee_id}}")
    def update_fee(fee_id: str, payload: update_model = Body(...), admin=Depends(get_admin_uid)):  # type: ignore
        """
        Update an existing fee entry in Firestore.
        FastAPI will validate `payload` against the `update_model` schema.
        """
        update_data = {"fee": payload.fee}
        for field in extra_fields:
            value = getattr(payload, field, None)
            if value is not None:
                update_data[field] = value
        return update_document(collection, normalize_id(fee_id), update_data)

    @router.delete(f"/{prefix}/{{fee_id}}")
    def delete_fee(fee_id: str, admin=Depends(get_admin_uid)):
        """
        Delete a fee entry from Firestore.
        """
        return delete_document(collection, normalize_id(fee_id))

# -----------------------------
# 📄 Document Fee Routes
# -----------------------------
make_fee_routes(
    collection="document_types",
    prefix="documents",
    new_model=NewDocumentFee,
    update_model=DocumentFee,
    id_field="documentType",
    extra_fields=["miscType", "enabled"],
    resolve_misc=True,
)

# -----------------------------
# 🏢 Business Fee Routes
# -----------------------------
make_fee_routes(
    collection="business_types",
    prefix="businesses",
    new_model=NewBusinessFee,
    update_model=BusinessFee,
    id_field="businessType",
    extra_fields=["registrationFee", "annualFee", "miscType", "enabled"],
    resolve_misc=True,
)

# -----------------------------
# 🆕 Miscellaneous Fee Routes
# -----------------------------
make_fee_routes(
    collection="misc_fees",
    prefix="misc",
    new_model=NewMiscFee,
    update_model=MiscFee,
    id_field="miscType",
    extra_fields=[
        "enabled", "feeType", "targetType", "targetName", "useForDocuments", "documentFeeType", "documentFee",
        "useForBusinesses", "businessFeeType", "businessFee",
    ],
)

# -----------------------------
# 🌐 Public Business Fee View
# -----------------------------
@router.get("/public/businesses")
def list_public_business_types():
    all_types = list_with_misc("business_types")
    result = []
    for bt in all_types:
            subtotal = bt.get("fee", 0) + bt.get("registrationFee", 0)
            misc = bt.get("miscFeeResolved") or 0
            total = subtotal + misc
            bt["totalFee"] = total
            result.append(bt)
    return result

# 🌐 Public Document Fee View
@router.get("/public/documents")
def list_public_document_types():
    all_docs = list_with_misc("document_types")
    result = []
    for doc in all_docs:
            total = (doc.get("fee", 0) +
                     (doc.get("miscFeeResolved") or 0))
            doc["totalFee"] = total
            result.append(doc)
    return result


# -----------------------------
# 💰 Fee Computation Helpers
# -----------------------------
def resolve_misc_fee(
    bt: dict,
    base_amount: int | float | None = None,
    usage: str = "business",
) -> int:
    misc_type_raw = bt.get("miscType") 
    if misc_type_raw: 
        misc_type_key = normalize_id(misc_type_raw) 
        misc_entry = get_db().collection("misc_fees").document(misc_type_key).get() 
        if misc_entry.exists: 
            misc = misc_entry.to_dict() 
            if misc.get("enabled") and bt.get("enabled"): 
                misc["feeType"] = bt.get("miscFeeType") or misc.get("feeType", "fixed")
                use_fee, fee_type, fee_value = get_misc_configuration(misc, usage)
                return calculate_misc_fee(
                    {"fee": fee_value, "feeType": fee_type},
                    bt.get("fee", 0) if base_amount is None else base_amount,
                ) if use_fee else 0
    return 0

def compute_document_fee(document_type: str) -> int:
    docs = get_db().collection("document_types").where("documentType", "==", document_type).limit(1).get()
    if not docs:
        raise HTTPException(status_code=404, detail=f"No fee configured for document type: {document_type}")
    doc = docs[0].to_dict()

    # ✅ Align with frontend: base + misc if enabled
    total = doc.get("fee", 0)
    total += resolve_misc_fee(doc, usage="document")
    return total


def compute_business_registration_fee(business_type: str) -> int:
    docs = get_db().collection("business_types").where("businessType", "==", business_type).limit(1).get()
    if not docs:
        raise HTTPException(status_code=404, detail=f"No fee configured for business type: {business_type}")
    bt = docs[0].to_dict()

    # ✅ Align with frontend: base + registration + misc if enabled
    total = (bt.get("fee", 0) + bt.get("registrationFee", 0))
    total += resolve_misc_fee(bt, total)
    return total


def compute_business_annual_fee(business_type: str) -> int:
    docs = get_db().collection("business_types").where("businessType", "==", business_type).limit(1).get()
    if not docs:
        raise HTTPException(status_code=404, detail=f"No fee configured for business type: {business_type}")
    bt = docs[0].to_dict()

    # ✅ Align with frontend: base + annual + misc if enabled
    total = (bt.get("fee", 0) + bt.get("annualFee", 0))
    total += resolve_misc_fee(bt, total)
    return total


@router.post("/businesses/{business_id}/payment")
def create_business_payment(business_id: str, payload: dict = Body(...)):
    """
    Create a PayMongo payment for a business.
    Decides between registration vs annual renewal based on payload["paymentType"].
    """
    payment_type = payload.get("paymentType", "registration")  # default to registration
    remarks = payload.get("remarks", f"Business {payment_type} fee")
    ref = get_business_ref(business_id)
    business = ref.get().to_dict()

    # ✅ Decide which fee to compute
    if payment_type == "annual":
        fee = compute_business_annual_fee(business.get("businessType"))
        description = f"Annual Business Fee for {business_id}"
    else:
        fee = compute_business_registration_fee(business.get("businessType"))
        description = f"Registration Business Fee for {business_id}"

    if fee <= 0:
        raise HTTPException(status_code=400, detail="Invalid fee amount")

    # ✅ Decide API based on fee amount
    if fee < 100:
        result = create_payment_intent(
            amount=fee,
            description=description,
            remarks=remarks,
            metadata={
                "businessId": business_id,
                "businessType": business.get("businessType"),
                "paymentType": payment_type,
            }
        )
    else:
        result = create_payment_link(
            amount=fee,
            description=description,
            remarks=remarks,
            metadata={
                "businessId": business_id,
                "businessType": business.get("businessType"),
                "paymentType": payment_type,
            },
            success_url=f"{FRONTEND_BASE_URL}/payment-success?type=business&businessId={business_id}",
            cancel_url=f"{FRONTEND_BASE_URL}/business/payment-cancel"
        )

    # ✅ Update Firestore with checkout details
    ref.update({
        "checkoutUrl": result.get("checkoutUrl"),
        "paymongoLinkId": result.get("paymongoLinkId"),
        "paymentIntentId": result.get("paymentIntentId"),
        "paymongoClientKey": result.get("paymongoClientKey"),
        "paymentStatus": result.get("paymentStatus") or "awaiting_payment",
        "status": "for_payment",
        "fee": fee,
        "paymentType": payment_type,  # store type for audit clarity
    })

    return result


@router.post("/documents/{document_id}/payment")
def create_document_payment(document_id: str, payload: dict = Body(...)):
    remarks = payload.get("remarks", "Document fee")
    ref = get_document_ref(document_id)
    document = ref.get().to_dict()

    doc_type = document.get("documentType")
    fee = compute_document_fee(doc_type)
    if fee < 0:
        raise HTTPException(status_code=400, detail="Invalid fee amount")
    
    if fee == 0:
        ref.update({
            "status": "paid",
            "fee": 0,
            "paymentType": "free"
        })
        return {"message": f"{doc_type} is free, no payment required"}


    description = f"{doc_type} Request {document_id}"

    # ✅ Decide API based on fee
    if fee < 100:
        result = create_payment_intent(
            amount=fee,
            description=description,
            remarks=remarks,
            metadata={"documentId": document_id, "documentType": doc_type}
        )
    else:
        result = create_payment_link(
            amount=fee,
            description=description,
            remarks=remarks,
            metadata={"documentId": document_id, "documentType": doc_type},
            success_url=f"{FRONTEND_BASE_URL}/payment-success?type=document&documentId={document_id}",
            cancel_url=f"{FRONTEND_BASE_URL}/documents/payment-cancel"
        )

    ref.update({
        "checkoutUrl": result.get("checkoutUrl"),
        "paymongoLinkId": result.get("paymongoLinkId"),
        "paymentIntentId": result.get("paymentIntentId"),
        "paymongoClientKey": result.get("paymongoClientKey"),
        "paymentStatus": result.get("paymentStatus") or "awaiting_payment",
        "status": "awaiting_payment",
        "fee": fee
    })

    logger.info("Updated Firestore with new checkoutUrl=%s fee=%s", result.get("checkoutUrl"), fee)

    return result

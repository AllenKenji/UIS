import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from backend.app.core.auth import get_current_user, resolve_tenant_scope
from backend.app.core.local_storage import delete_file, upload_file
from backend.app.models.business import BusinessApplication, BusinessDetails, BusinessDocuments
from backend.app.services.business_service import create_business_application, is_business_name_taken
import logging
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/businesses", tags=["Business"])

PERMIT_VALIDITY_DAYS = 365


def _assign_permit_fields(data: dict, existing: dict) -> None:
    """When a business becomes/is approved and has no permit yet, mint a
    permit number and a 1-year validity window (validUntil), and clear the
    expiry-notice flag so the new cycle can warn again next year. Shared by
    update_business (public-application approvals) and create_staff_business
    (staff walk-in registrations, which are approved immediately)."""
    if data.get("status") != "approved":
        return
    if not existing.get("permitNumber") and not data.get("permitNumber"):
        year = datetime.now().year
        barangay = (existing.get("barangay") or data.get("barangay") or "").upper()
        data["permitNumber"] = f"PERMIT-{year}-{barangay}-{random.randint(1000, 9999)}"
    if not existing.get("validUntil") and not data.get("validUntil"):
        data["validUntil"] = (datetime.now(timezone.utc) + timedelta(days=PERMIT_VALIDITY_DAYS)).isoformat()
        data["permitExpiryNoticeSent"] = False


# Business applications are submitted by public residents who never log in
# (per the barangay portal's "no account needed" flow), so — like
# /public/registrations — this endpoint accepts the documents directly as
# multipart uploads instead of requiring a prior authenticated upload call.
@router.post("/applications")
async def create_application(
    owner_uid: str = Form(...),
    owner_name: str = Form(...),
    contact_number: str = Form(...),
    email: str = Form(...),
    business_name: str = Form(...),
    business_type: str = Form(...),
    barangay: str = Form(...),
    street: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    province: Optional[str] = Form(None),
    address: str = Form(""),
    registration_date: str = Form(...),
    is_franchise: bool = Form(False),
    valid_id: UploadFile = File(...),
    proof_of_address: UploadFile = File(...),
    dti_cert: Optional[UploadFile] = File(None),
    business_logo: Optional[UploadFile] = File(None),
):
    upload_prefix = f"businesses/{owner_uid}/{uuid.uuid4().hex}"

    valid_id_result = await run_in_threadpool(
        upload_file, valid_id, f"{upload_prefix}/valid_id_{valid_id.filename}"
    )
    proof_result = await run_in_threadpool(
        upload_file, proof_of_address, f"{upload_prefix}/proof_of_address_{proof_of_address.filename}"
    )
    dti_result = (
        await run_in_threadpool(upload_file, dti_cert, f"{upload_prefix}/dti_cert_{dti_cert.filename}")
        if dti_cert
        else None
    )
    logo_result = (
        await run_in_threadpool(upload_file, business_logo, f"{upload_prefix}/logo_{business_logo.filename}")
        if business_logo
        else None
    )

    payload = BusinessApplication(
        owner_uid=owner_uid,
        owner_name=owner_name,
        contact_number=contact_number,
        email=email,
        business=BusinessDetails(
            name=business_name,
            type=business_type,
            barangay=barangay,
            street=street,
            city=city,
            province=province,
            address=address,
            registration_date=registration_date,
            is_franchise=is_franchise,
        ),
        documents=BusinessDocuments(
            valid_id=valid_id_result["url"],
            proof_of_address=proof_result["url"],
            dti_cert=dti_result["url"] if dti_result else None,
            business_logo=logo_result["url"] if logo_result else None,
        ),
    )
    return create_business_application(payload)


def _require_business_manager(user: dict) -> None:
    if user.get("role") not in {"admin", "staff"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff or admin access required")


def _get_business_or_404(document_id: str):
    db = get_db()
    snapshot = db.collection("businesses").document(document_id).get()
    if snapshot.exists:
        return snapshot
    matches = db.collection("businesses").where("businessId", "==", document_id).limit(1).get()
    if matches:
        return matches[0]
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_staff_business(payload: dict, user: dict = Depends(get_current_user)):
    _require_business_manager(user)
    barangay_id = resolve_tenant_scope(user)
    is_franchise = bool(payload.get("isFranchise") or payload.get("is_franchise"))
    business_name = payload.get("businessName") or payload.get("business_name")

    if not is_franchise and is_business_name_taken(barangay_id, business_name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'A business named "{business_name}" is already registered in this barangay. '
                   'If this is a franchise branch, mark it as a franchise to continue.',
        )

    data = {
        **payload,
        "barangayId": barangay_id,
        "isFranchise": is_franchise,
        "createdAt": payload.get("createdAt") or datetime.now(timezone.utc).isoformat(),
    }
    _assign_permit_fields(data, {})
    reference = get_db().collection("businesses").add(data)
    return {"id": reference.id, **data}

@router.get("/my")
def list_my_businesses(owner_uid: str):
    """No auth on purpose — matches the public self-service pattern used by
    /documents/my: identifies the resident by owner_uid rather than a login,
    since public business applicants never authenticate. Scoped strictly to
    that owner_uid, unlike the staff/admin-facing listing below."""
    docs = get_db().collection("businesses").where("ownerUid", "==", owner_uid).stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


@router.get("")
def list_businesses(ownerUid: str = None, ownerName: str = None, barangayId: str = None, user: dict = Depends(get_current_user)):
    scope = resolve_tenant_scope(user, barangayId)
    ref = get_db().collection("businesses")
    if ownerUid:
        docs = ref.where("ownerUid", "==", ownerUid).stream()
    elif ownerName:
        docs = ref.where("ownerName", "==", ownerName).stream()
    elif scope:
        docs = ref.where("barangayId", "==", scope).stream()
    else:
        docs = ref.stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


@router.post("/{business_id}/resubmit")
async def resubmit_business_application(
    business_id: str,
    owner_uid: str = Form(...),
    valid_id: Optional[UploadFile] = File(None),
    proof_of_address: Optional[UploadFile] = File(None),
    dti_cert: Optional[UploadFile] = File(None),
    business_logo: Optional[UploadFile] = File(None),
):
    """Public/unauthenticated resubmission for a rejected business
    application — matches the public no-login flow of /businesses/applications.
    Only the documents provided are re-uploaded; anything omitted keeps its
    previously submitted file. The same record is updated in place (no
    duplicate application, rejection notes stay attached as history) and its
    status resets to pending_evaluation so staff re-reviews it."""
    business = _get_business_or_404(business_id)
    data = business.to_dict() or {}

    if data.get("ownerUid") != owner_uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only resubmit your own application")
    if data.get("status") != "rejected":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only rejected applications can be resubmitted")

    upload_prefix = f"businesses/{owner_uid}/{uuid.uuid4().hex}"
    documents = dict(data.get("documents") or {})

    async def _maybe_upload(field: str, file: Optional[UploadFile]):
        if not file:
            return
        result = await run_in_threadpool(upload_file, file, f"{upload_prefix}/{field}_{file.filename}")
        documents[field] = result

    await _maybe_upload("valid_id", valid_id)
    await _maybe_upload("proof_of_address", proof_of_address)
    await _maybe_upload("dti_cert", dti_cert)
    await _maybe_upload("business_logo", business_logo)

    update_data = {
        "documents": documents,
        "status": "pending_evaluation",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    business.reference.update(update_data)
    return {"id": business.id, **data, **update_data}


@router.put("/{business_id}")
def update_business(business_id: str, payload: dict, user: dict = Depends(get_current_user)):
    _require_business_manager(user)
    business = _get_business_or_404(business_id)
    existing = business.to_dict() or {}
    data = {**payload, "updatedAt": datetime.now(timezone.utc).isoformat()}

    # Businesses registered directly by staff (POST /businesses) already get
    # a permit number at creation. Ones that went through the public
    # self-service application flow start without one (no permit exists
    # until staff actually approves them) — so when an evaluation approves
    # one here and it still has none, assign it now, along with the permit's
    # 1-year validity window.
    _assign_permit_fields(data, existing)

    business.reference.update(data)
    return {"id": business.id, **existing, **data}

@router.delete("/{business_id}")
def delete_business(business_id: str, user: dict = Depends(get_current_user)):
    """Delete a business, related payments/receipts, and attachments in Storage."""
    _require_business_manager(user)
    business_doc = _get_business_or_404(business_id)
    business_data = business_doc.to_dict()

    # --- Delete attachments from Storage using stored paths ---
    if business_data.get("documents"):
        for key, doc in business_data["documents"].items():
            # Expecting each doc to be a dict with {"url": ..., "path": ...}
            path = None
            if isinstance(doc, dict):
                path = doc.get("path")
            elif isinstance(doc, str):
                # Fallback for legacy records that only stored URL
                logger.warning("⚠️ Document %s has only URL, no path. Skipping storage deletion.", key)

            if path:
                try:
                    delete_file(path)
                except Exception as e:
                    logger.warning("⚠️ Failed to delete storage file %s: %s", path, e)

    # --- Delete business doc ---
    business_doc.reference.delete()
    logger.info("🗑️ Deleted business %s", business_id)

    # --- Delete related payments ---
    payments = get_db().collection("payments").where("businessId", "==", business_id).get()
    for pay in payments:
        pay.reference.delete()
        logger.info("🗑️ Deleted payment %s for business %s", pay.id, business_id)

    # --- Delete related receipts ---
    receipts = get_db().collection("receipts").where("businessId", "==", business_id).get()
    for rec in receipts:
        rec.reference.delete()
        logger.info("🗑️ Deleted receipt %s for business %s", rec.id, business_id)

    return {"success": True, "message": f"Business {business_id}, related records, and attachments deleted"}

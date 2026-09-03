import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from pydantic import ValidationError

from backend.app.models.complaint import Complaint, ComplaintCreate
from backend.app.models.public_access import PublicAccessLookupRequest, PublicResidentRegistration
from backend.app.services.complaint_service import file_complaint
from backend.app.services.notification_service import NotificationService
from backend.app.services.public_access_service import register_public_resident, resolve_public_access, request_resident_update
from backend.app.services.tenant_service import list_tenants, get_tenant
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/public", tags=["Public Services"])

# Public-safe fields only — internal fields like budget/status are left out of this view.
_PROGRAM_FIELDS = ("title", "date", "category", "description", "imageUrl")
_EVENT_FIELDS = ("title", "date", "location", "category", "description", "imageUrl")


def _public_view(snapshot, fields: tuple[str, ...]) -> dict:
    data = snapshot.to_dict() or {}
    return {"id": snapshot.id, **{field: data.get(field) for field in fields}}


@router.post("/registrations", status_code=201)
async def register(
    barangayId: str = Form(...),
    fullName: str = Form(...),
    birthDate: str = Form(...),
    gender: str = Form(...),
    civilStatus: str = Form(...),
    email: str = Form(...),
    contactNumber: Optional[str] = Form(None),
    houseNumber: str = Form(...),
    street: str = Form(...),
    purok: Optional[str] = Form(None),
    barangay: str = Form(...),
    city: str = Form(...),
    province: str = Form(...),
    zipCode: Optional[str] = Form(None),
    isHeadOfFamily: bool = Form(False),
    voterStatus: str = Form("unknown"),
    occupation: Optional[str] = Form(None),
    photo: UploadFile = File(...),
    governmentId: UploadFile = File(...),
    signature: UploadFile = File(...),
):
    try:
        payload = PublicResidentRegistration(
            barangayId=barangayId,
            fullName=fullName,
            birthDate=birthDate,
            gender=gender,
            civilStatus=civilStatus,
            email=email,
            contactNumber=contactNumber or None,
            address={
                "houseNumber": houseNumber,
                "street": street,
                "purok": purok or None,
                "barangay": barangay,
                "city": city,
                "province": province,
                "zipCode": zipCode or None,
            },
            isHeadOfFamily=isHeadOfFamily,
            voterStatus=voterStatus,
            occupation=occupation,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors())

    resident = await register_public_resident(payload, photo=photo, government_id=governmentId, signature=signature)
    return {"residentId": resident["id"], "message": "Registration completed"}


@router.post("/access/resolve")
def resolve(payload: PublicAccessLookupRequest, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return resolve_public_access(payload.identifier, payload.birthDate, payload.barangayId)


@router.post("/access/request-update")
async def request_update(
    residentId: str = Form(...),
    barangayId: str = Form(...),
    remarks: str = Form(..., min_length=5),
    document: Optional[UploadFile] = File(None),
):
    """A verified resident (resolved via /public/access/resolve) asking staff to
    review/apply a change to their profile — no login required."""
    return await request_resident_update(residentId, barangayId, remarks, document)


@router.post("/complaints", response_model=Complaint, status_code=status.HTTP_201_CREATED)
async def submit_public_complaint(complaint: ComplaintCreate):
    """File a complaint without a login session, for a resident resolved via /public/access/resolve."""
    if not complaint.filed_for:
        complaint.filed_for = complaint.filed_by

    # Complaints belong to the resident's own barangay, not a client-supplied value.
    resident_doc = get_db().collection("residents").document(complaint.filed_for).get()
    complaint.barangayId = (resident_doc.to_dict() or {}).get("barangayId") if resident_doc.exists else None

    created = file_complaint(complaint)
    if not created:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to file complaint")

    # Public residents never log in, so this path skipped the notification
    # the authenticated POST /complaints/ route already sends — staff/admin
    # were never told a complaint came in through the barangay portal.
    try:
        await NotificationService.notify(
            role="admin",
            type="complaint",
            message=f"New complaint filed ({created.category.value})",
        )
        await NotificationService.notify(
            role="staff",
            type="complaint",
            message=f"New complaint filed ({created.category.value})",
        )
    except Exception as notify_err:
        logger.warning("⚠️ Public complaint submit notification failed: %s", notify_err)

    return created


@router.get("/announcements")
def list_public_announcements(barangayId: str):
    """Public, read-only view of one barangay's SK programs and events (no login required)."""
    programs = [
        _public_view(doc, _PROGRAM_FIELDS)
        for doc in get_db().collection("sk_programs").where("barangayId", "==", barangayId).stream()
    ]
    events = [
        _public_view(doc, _EVENT_FIELDS)
        for doc in get_db().collection("sk_events").where("barangayId", "==", barangayId).stream()
    ]
    return {"programs": programs, "events": events}


@router.get("/tenants")
def list_tenants_public():
    """Public list of registered barangays (for the City/Barangay picker)."""
    return list_tenants()


@router.get("/tenants/{tenant_id}")
def get_tenant_public(tenant_id: str):
    return get_tenant(tenant_id)


# ---------------------------------------------------------------------
# QR verification — the business permit and receipt QR codes encode links
# to these, so scanning one opens a page confirming the record is real
# instead of just displaying a bare ID/JSON blob with nothing to check it
# against. Deliberately narrow, public-safe field sets: no documents, no
# contact info, no resident-account details.
# ---------------------------------------------------------------------

@router.get("/verify/business/{business_id}")
def verify_business_public(business_id: str):
    docs = get_db().collection("businesses").where("businessId", "==", business_id).limit(1).get()
    if not docs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No business found for this ID")
    data = docs[0].to_dict() or {}
    if str(data.get("status", "")).lower() != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This business has no approved permit")
    return {
        "businessId": data.get("businessId"),
        "businessName": data.get("businessName"),
        "businessType": data.get("businessType"),
        "ownerName": data.get("ownerName"),
        "barangay": data.get("barangay"),
        "permitNumber": data.get("permitNumber"),
        "approvedAt": data.get("evaluatedAt") or data.get("updatedAt") or data.get("submittedAt"),
    }


@router.get("/verify/receipt/{receipt_number}")
def verify_receipt_public(receipt_number: str):
    docs = get_db().collection("receipts").where("receiptNumber", "==", receipt_number).limit(1).get()
    if not docs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No receipt found for this number")
    data = docs[0].to_dict() or {}

    barangay_name = None
    barangay_id = data.get("barangayId")
    if barangay_id:
        try:
            barangay_name = get_tenant(barangay_id).barangay
        except Exception:
            barangay_name = None

    return {
        "receiptNumber": data.get("receiptNumber"),
        "amount": data.get("amount"),
        "method": data.get("method"),
        "datePaid": data.get("datePaid"),
        "entityType": data.get("entityType"),
        "entityCategory": data.get("entityCategory"),
        "ownerName": data.get("ownerName"),
        "businessName": data.get("businessName"),
        "barangay": barangay_name,
        "issuedBy": data.get("issuedBy"),
    }
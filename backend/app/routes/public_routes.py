from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from pydantic import ValidationError

from backend.app.models.complaint import Complaint, ComplaintCreate
from backend.app.models.public_access import PublicAccessLookupRequest, PublicResidentRegistration
from backend.app.services.complaint_service import file_complaint
from backend.app.services.public_access_service import register_public_resident, resolve_public_access, request_resident_update
from backend.app.services.tenant_service import list_tenants, get_tenant
from backend.app.utils.firestore_utils import get_db

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
def submit_public_complaint(complaint: ComplaintCreate):
    """File a complaint without a login session, for a resident resolved via /public/access/resolve."""
    if not complaint.filed_for:
        complaint.filed_for = complaint.filed_by

    # Complaints belong to the resident's own barangay, not a client-supplied value.
    resident_doc = get_db().collection("residents").document(complaint.filed_for).get()
    complaint.barangayId = (resident_doc.to_dict() or {}).get("barangayId") if resident_doc.exists else None

    created = file_complaint(complaint)
    if not created:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to file complaint")
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
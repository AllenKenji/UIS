import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from backend.app.core.local_storage import upload_file
from backend.app.models.public_access import PublicResidentRegistration
from backend.app.services.resident_service import add_resident
from backend.app.services.tenant_service import require_tenant_exists
from backend.app.services.notification_service import NotificationService
from backend.app.utils.firestore_utils import get_db

import logging

logger = logging.getLogger("uvicorn.error")

async def register_public_resident(
    payload: PublicResidentRegistration,
    photo: UploadFile,
    government_id: UploadFile,
    signature: UploadFile,
) -> dict:
    require_tenant_exists(payload.barangayId)
    resident_id = uuid.uuid4().hex

    photo_result = await run_in_threadpool(
        upload_file, photo, f"residents/{resident_id}/photo_{photo.filename}"
    )
    id_result = await run_in_threadpool(
        upload_file, government_id, f"residents/{resident_id}/gov_id_{government_id.filename}"
    )
    signature_result = await run_in_threadpool(
        upload_file, signature, f"residents/{resident_id}/signature_{signature.filename}"
    )

    # by_alias=True is required: the nested Address model's Python attributes
    # are snake_case (house_number, zip_code) with camelCase aliases — without
    # it, this dumps snake_case keys that the rest of the app (and the address
    # display everywhere else) doesn't recognize, silently dropping those
    # fields from anything that reads address.houseNumber/zipCode.
    data = payload.model_dump(exclude={"barangayId"}, by_alias=True)
    data["photoUrl"] = photo_result["url"]
    data["idDocumentUrl"] = id_result["url"]
    data["signatureUrl"] = signature_result["url"]

    resident = add_resident(
        data,
        create_login_account=False,
        barangay_id=payload.barangayId,
        resident_id=resident_id,
    )

    try:
        message = f"New resident registration pending verification: {payload.fullName}"
        await NotificationService.notify(role="admin", type="resident_verification", message=message)
        await NotificationService.notify(role="staff", type="resident_verification", message=message)
    except Exception as notify_err:
        logger.warning("⚠️ Resident registration notification failed: %s", notify_err)

    return resident.model_dump(by_alias=True)


def resolve_public_access(identifier: str, birth_date, barangay_id: str) -> dict:
    require_tenant_exists(barangay_id)
    clean_identifier = identifier.strip().lower()
    field = "email" if "@" in clean_identifier else "contactNumber"
    matches = (
        get_db()
        .collection("residents")
        .where(field, "==", clean_identifier)
        .where("barangayId", "==", barangay_id)
        .limit(1)
        .get()
    )
    not_found = HTTPException(status_code=404, detail="No resident profile found for that email or mobile number")
    if not matches:
        raise not_found
    resident = matches[0]
    data = resident.to_dict() or {}
    if str(data.get("birthDate")) != str(birth_date):
        raise not_found

    verification_status = data.get("verificationStatus") or "verified"
    is_verified = verification_status != "pending" and verification_status != "rejected"
    return {
        "residentId": resident.id,
        "fullName": data.get("fullName"),
        "birthDate": data.get("birthDate"),
        "gender": data.get("gender"),
        "civilStatus": data.get("civilStatus"),
        "email": data.get("email"),
        "contactNumber": data.get("contactNumber"),
        "occupation": data.get("occupation"),
        "voterStatus": data.get("voterStatus"),
        "isHeadOfFamily": data.get("isHeadOfFamily"),
        "address": data.get("address"),
        "photoUrl": data.get("photoUrl"),
        "barangayId": barangay_id,
        "verificationStatus": verification_status,
        "verificationNotes": data.get("verificationNotes"),
        "updateRequestRemarks": data.get("updateRequestRemarks"),
        "updateRequestedAt": data.get("updateRequestedAt"),
        "services": ["document-request", "business-registration", "complaint-filing", "incident-report"] if is_verified else [],
    }


async def request_resident_update(resident_id: str, barangay_id: str, remarks: str, document: UploadFile | None = None) -> dict:
    """
    A verified resident asking staff to review/apply a change to their profile
    (e.g. moved address, new contact number). Nothing on the profile changes
    yet — this stages the request and puts the account back into the same
    "pending" gate as a fresh registration, blocking barangay services until
    staff clears it, same as require_verified_resident already enforces.
    """
    doc_ref = get_db().collection("residents").document(resident_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Resident not found")

    data = snapshot.to_dict() or {}
    if data.get("barangayId") != barangay_id:
        raise HTTPException(status_code=404, detail="Resident not found")

    document_url = None
    if document is not None and getattr(document, "filename", None):
        result = await run_in_threadpool(
            upload_file, document, f"residents/{resident_id}/update_request_{document.filename}"
        )
        document_url = result["url"]

    update_data = {
        "verificationStatus": "pending",
        "updateRequestRemarks": remarks,
        "updateRequestDocumentUrl": document_url,
        "updateRequestedAt": datetime.now(timezone.utc),
        # Clear any earlier verify/reject decision so it doesn't read as stale context.
        "verifiedBy": None,
        "verifiedAt": None,
        "verificationNotes": None,
    }
    doc_ref.update(update_data)

    try:
        message = f"Information update requested by {data.get('fullName', 'a resident')}"
        await NotificationService.notify(role="admin", type="resident_verification", message=message)
        await NotificationService.notify(role="staff", type="resident_verification", message=message)
    except Exception as notify_err:
        logger.warning("⚠️ Resident update-request notification failed: %s", notify_err)

    updated = doc_ref.get().to_dict() or {}
    return {"residentId": resident_id, "verificationStatus": updated.get("verificationStatus")}

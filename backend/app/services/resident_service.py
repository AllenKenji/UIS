import logging, random
import os
from datetime import date, datetime
from typing import List, Dict, Optional, Any
from uuid import uuid4
from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from backend.app.utils.firestore_utils import get_db
from backend.app.models import ResidentOut
from backend.app.core.roles import ROLE_PERMISSIONS   # ✅ import role permissions
from backend.app.core.local_auth import create_user, delete_user
from backend.app.core.postgres_store import SERVER_TIMESTAMP

VERIFICATION_STATUSES = ("pending", "verified", "rejected")

logger = logging.getLogger("uvicorn.error")
RESIDENT_INITIAL_PASSWORD = os.environ.get("RESIDENT_INITIAL_PASSWORD", "12345678")

# 🔑 Household ID generator
def generate_household_id(barangay: str = "GEN") -> str:
    year = datetime.utcnow().year
    random_seq = str(random.randint(0, 999999)).zfill(6)
    return f"HH-{year}-{barangay.upper()}-{random_seq}"

# 🧹 Payload sanitizer for writes
def sanitize_resident_payload(data: dict, is_update: bool = False) -> dict:
    if isinstance(data.get("birthDate"), date):
        data["birthDate"] = data["birthDate"].isoformat()

    for key in ["fullName", "middleName", "suffix"]:
        if key in data and isinstance(data[key], str):
            data[key] = data[key].strip().title() or None

    for key in ["email", "remarks", "occupation"]:
        if key in data:
            val = data[key].strip() if isinstance(data[key], str) else data[key]
            data[key] = val or None

    if not is_update:
        data["createdAt"] = SERVER_TIMESTAMP()
    else:
        data.pop("createdAt", None)

    data["updatedAt"] = SERVER_TIMESTAMP()

    if not is_update and not data.get("householdId"):
        barangay = data.get("address", {}).get("barangay", "GEN")
        data["householdId"] = generate_household_id(barangay)

    return data

def encode_for_firestore(data: dict) -> dict:
    encoded = {}
    for k, v in data.items():
        if isinstance(v, datetime):
            encoded[k] = v
        else:
            encoded[k] = jsonable_encoder(v)
    return encoded

class ResidentError(Exception):
    pass

def _get_resident_doc(id: str):
    snapshot = get_db().collection("residents").document(id).get()
    if not snapshot.exists:
        raise ResidentError(f"Resident {id} not found")
    return snapshot

def to_resident_out(doc: Dict[str, Any], id: Optional[str] = None) -> ResidentOut:
    data = {**doc}
    if id:
        data["id"] = id
    for key in ["createdAt", "updatedAt", "verifiedAt", "updateRequestedAt"]:
        if key in data and not isinstance(data[key], datetime):
            data.pop(key)
    for key in ["email", "remarks", "occupation"]:
        if key in data and data[key] == "":
            data[key] = None
    return ResidentOut(**data)


def require_verified_resident(resident_data: dict) -> None:
    """
    Block a resident from availing barangay services (documents, business
    registration, complaints, incidents) until admin/staff have verified their
    self-registration. Residents with no verificationStatus at all (registered
    before this feature, or created directly by staff) are treated as verified.
    """
    verification_status = resident_data.get("verificationStatus")
    if verification_status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your registration is still pending verification by barangay staff. Please visit or contact the barangay office to complete verification.",
        )
    if verification_status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your registration was not verified. Please contact the barangay office.",
        )

# ➕ Create (optionally with a login-capable account)
def add_resident(data: dict, initial_password: str | None = None, create_login_account: bool = True, barangay_id: str | None = None, resident_id: str | None = None) -> ResidentOut:
    payload = sanitize_resident_payload(data)
    payload = encode_for_firestore(payload)
    payload["barangayId"] = barangay_id

    # Staff/admin-entered residents are vetted in person and considered verified
    # immediately; residents who self-register through the public, no-login flow
    # start "pending" until barangay staff verify their submitted photo/ID.
    payload.setdefault("verificationStatus", "verified" if create_login_account else "pending")

    login_identifier = (data.get("email") or data.get("contactNumber") or "").strip()
    if not login_identifier:
        raise ResidentError("Resident must provide either an email address or contact number")

    if create_login_account:
        try:
            uid = create_user(login_identifier, initial_password or RESIDENT_INITIAL_PASSWORD, {"full_name": data.get("fullName"), "role": "resident", "contactNumber": data.get("contactNumber")})
            payload["authUid"] = uid
            payload["id"] = uid
            payload["passwordResetRequired"] = True
            logger.info("Local auth user created for %s", login_identifier)

        except Exception as e:
            logger.error("❌ Failed to create login account for %s: %s", login_identifier, str(e))
            raise ResidentError("Failed to create login account")
    else:
        uid = resident_id or uuid4().hex
        payload["id"] = uid

    doc_ref = get_db().collection("residents").document(uid)
    doc_ref.set({
        **payload,
        "role": "resident",
        "permissions": ROLE_PERMISSIONS["resident"]  # safe in Firestore
    })

    snapshot = doc_ref.get()
    logger.info("✅ Resident added with ID: %s (Barangay: %s)", doc_ref.id, payload.get("address", {}).get("barangay"))
    return to_resident_out(snapshot.to_dict(), id=doc_ref.id)

# ➕ Bulk Create (with Firebase Auth integration + claims)
def add_residents_bulk(residents: List[dict], householdId: Optional[str] = None, barangay_id: str | None = None) -> Dict[str, Any]:
    if not residents:
        raise ResidentError("No residents provided for bulk add")

    if not householdId:
        barangay = residents[0].get("address", {}).get("barangay", "GEN")
        householdId = generate_household_id(barangay)

    batch = get_db().batch()
    created = []

    for data in residents:
        login_identifier = (data.get("email") or data.get("contactNumber") or "").strip()
        if not login_identifier:
            logger.warning("Skipping resident without email or contact number: %s", data.get("fullName"))
            continue

        data["householdId"] = householdId
        payload = sanitize_resident_payload(data)
        payload = encode_for_firestore(payload)
        payload["barangayId"] = barangay_id

        try:
            # ✅ Create Firebase Auth user
            uid = create_user(login_identifier, RESIDENT_INITIAL_PASSWORD, {"full_name": data.get("fullName"), "role": "resident", "contactNumber": data.get("contactNumber")})
            payload["authUid"] = uid
            payload["id"] = uid
            payload["passwordResetRequired"] = True
            logger.info("Local auth user created for %s", login_identifier)

        except Exception as e:
            logger.error("❌ Failed to create login account for %s: %s", login_identifier, str(e))
            continue

        # ✅ Store full profile + permissions in Firestore
        doc_ref = get_db().collection("residents").document(uid)
        batch.set(doc_ref, {
            **payload,
            "role": "resident",
            "permissions": ROLE_PERMISSIONS["resident"]  # safe in Firestore
        })
        created.append(to_resident_out(payload, id=uid))

    if not created:
        raise ResidentError("No residents were successfully created")

    batch.commit()
    logger.info("✅ Bulk added %d residents to household %s", len(created), householdId)
    return {"householdId": householdId, "count": len(created), "items": created}

# 📤 Read single resident by ID
def get_resident_by_id(id: str) -> ResidentOut:
    snapshot = _get_resident_doc(id)
    return to_resident_out(snapshot.to_dict(), id=id)

# 📤 Read all residents
def get_all_residents(limit: int = 50, start_after_id: Optional[str] = None, barangay_id: str | None = None, verification_status: str | None = None) -> List[ResidentOut]:
    query = get_db().collection("residents")
    if barangay_id:
        query = query.where("barangayId", "==", barangay_id)
    if verification_status:
        query = query.where("verificationStatus", "==", verification_status)
    query = query.order_by("createdAt").limit(limit)
    if start_after_id:
        last_doc = get_db().collection("residents").document(start_after_id).get()
        if last_doc.exists:
            query = query.start_after(last_doc)
        else:
            logger.warning("⚠️ start_after_id not found: %s", start_after_id)

    docs = query.get()
    return [to_resident_out(doc.to_dict(), id=doc.id) for doc in docs]

# 🔄 Update (PUT)
def update_resident(id: str, data: dict) -> ResidentOut:
    doc_ref = get_db().collection("residents").document(id)
    snapshot = _get_resident_doc(id)  # returns snapshot

    payload = sanitize_resident_payload(data, is_update=True)
    payload = encode_for_firestore(payload)

    doc_ref.update(payload)
    snapshot = doc_ref.get()
    return to_resident_out(snapshot.to_dict(), id=id)

# ✂️ Patch (PATCH)
def patch_resident(id: str, data: dict) -> ResidentOut:
    doc_ref = get_db().collection("residents").document(id)
    snapshot = _get_resident_doc(id)

    payload = sanitize_resident_payload(
        {k: v for k, v in data.items() if v is not None},
        is_update=True
    )
    payload = encode_for_firestore(payload)

    doc_ref.update(payload)
    snapshot = doc_ref.get()
    return to_resident_out(snapshot.to_dict(), id=id)

# 🗑️ Delete single resident
def delete_resident(id: str) -> Dict[str, str]:
    doc_ref = get_db().collection("residents").document(id)
    snapshot = _get_resident_doc(id)

    logger.info("Deleting resident: %s", snapshot.to_dict())

    # Delete Firestore document
    doc_ref.delete()

    # Delete Firebase Auth user
    try:
        delete_user(id)
        logger.info("✅ Deleted Firebase Auth user with UID: %s", id)
    except Exception as e:
        logger.warning("⚠️ Failed to delete Firebase Auth user %s: %s", id, str(e))

    return {"id": id, "message": "Resident deleted successfully"}

# 🔎 Duplicate check
def find_duplicates(fullName: str, birthDate: str, middleName: Optional[str] = None, suffix: Optional[str] = None, barangay_id: str | None = None) -> List[ResidentOut]:
    query = get_db().collection("residents").where("fullName", "==", fullName.strip()).where("birthDate", "==", birthDate)
    if middleName:
        query = query.where("middleName", "==", middleName.strip())
    if suffix:
        query = query.where("suffix", "==", suffix.strip())
    if barangay_id:
        query = query.where("barangayId", "==", barangay_id)

    docs = query.stream()
    return [to_resident_out(doc.to_dict(), id=doc.id) for doc in docs]

# 🗑️ Bulk Delete by household
def delete_by_household(householdId: str) -> Dict[str, Any]:
    docs = get_db().collection("residents").where("householdId", "==", householdId).stream()

    deleted_count = 0
    for doc in docs:
        doc.reference.delete()
        deleted_count += 1

    if deleted_count == 0:
        raise ResidentError(f"No residents found for householdId {householdId}")

    return {"householdId": householdId, "deletedCount": deleted_count, "message": f"Deleted {deleted_count} resident(s)"}

# 📤 Bulk Fetch by household
def get_residents_by_household(householdId: str, barangay_id: str | None = None) -> List[ResidentOut]:
    query = get_db().collection("residents").where("householdId", "==", householdId)
    if barangay_id:
        query = query.where("barangayId", "==", barangay_id)
    docs = query.stream()
    residents = [to_resident_out(doc.to_dict(), id=doc.id) for doc in docs]

    if not residents:
        raise ResidentError(f"No residents found for householdId {householdId}")

    return residents

# ✅ Admin/staff verification of a self-registered resident
def verify_resident(id: str, verification_status: str, verified_by: str, notes: Optional[str] = None) -> ResidentOut:
    if verification_status not in VERIFICATION_STATUSES:
        raise ResidentError(f"Invalid verification status: {verification_status}")

    doc_ref = get_db().collection("residents").document(id)
    _get_resident_doc(id)

    doc_ref.update({
        "verificationStatus": verification_status,
        "verifiedBy": verified_by,
        "verifiedAt": SERVER_TIMESTAMP(),
        "verificationNotes": notes,
        "updatedAt": SERVER_TIMESTAMP(),
        # Clear a resolved info-update request so it doesn't linger as stale
        # context on the next lookup (covers both new-registration approvals,
        # where these were never set, and update-request reviews).
        "updateRequestRemarks": None,
        "updateRequestDocumentUrl": None,
        "updateRequestedAt": None,
    })
    snapshot = doc_ref.get()
    return to_resident_out(snapshot.to_dict(), id=id)


def find_by_email(email: str, barangay_id: str | None = None) -> Optional[ResidentOut]:
    clean_email = email.strip().lower()
    query = get_db().collection("residents").where("email", "==", clean_email)
    if barangay_id:
        query = query.where("barangayId", "==", barangay_id)
    docs = query.stream()

    for doc in docs:
        return to_resident_out(doc.to_dict(), id=doc.id)

    return None

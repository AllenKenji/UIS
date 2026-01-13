import logging, random
from datetime import date, datetime
from typing import List, Dict, Optional, Any
from google.cloud import firestore
from fastapi.encoders import jsonable_encoder
from firebase_admin import auth

from backend.app.core.firebase import get_firestore
from backend.app.models import ResidentOut
from backend.app.core.roles import ROLE_PERMISSIONS   # ✅ import role permissions

logger = logging.getLogger("uvicorn.error")

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
        data["createdAt"] = firestore.SERVER_TIMESTAMP
    else:
        data.pop("createdAt", None)

    data["updatedAt"] = firestore.SERVER_TIMESTAMP

    if not is_update and not data.get("householdId"):
        barangay = data.get("address", {}).get("barangay", "GEN")
        data["householdId"] = generate_household_id(barangay)

    return data

def encode_for_firestore(data: dict) -> dict:
    encoded = {}
    for k, v in data.items():
        if v is firestore.SERVER_TIMESTAMP:
            encoded[k] = v
        else:
            encoded[k] = jsonable_encoder(v)
    return encoded

class ResidentError(Exception):
    pass

def _get_resident_doc(id: str):
    db = get_firestore()
    doc_ref = db.collection("residents").document(id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise ResidentError(f"Resident {id} not found")
    return doc_ref, snapshot

def to_resident_out(doc: Dict[str, Any], id: Optional[str] = None) -> ResidentOut:
    data = {**doc}
    if id:
        data["id"] = id
    for key in ["createdAt", "updatedAt"]:
        if key in data and not isinstance(data[key], datetime):
            data.pop(key)
    for key in ["email", "remarks", "occupation"]:
        if key in data and data[key] == "":
            data[key] = None
    return ResidentOut(**data)

# ➕ Create (with Firebase Auth integration + claims)
def add_resident(data: dict) -> ResidentOut:
    db = get_firestore()
    payload = sanitize_resident_payload(data)
    payload = encode_for_firestore(payload)

    if not data.get("email"):
        raise ResidentError("Resident must have an email to create an Auth account")

    clean_email = data["email"].strip().lower()

    try:
        user = auth.create_user(
            email=clean_email,
            password="123456",
            display_name=data.get("fullName")
        )
        payload["authUid"] = user.uid
        payload["id"] = user.uid
        payload["passwordResetRequired"] = True
        logger.info("✅ Firebase Auth user created for %s", clean_email)

        # 🔑 Assign resident claims immediately
        auth.set_custom_user_claims(user.uid, {
            "role": "resident",
            "permissions": ROLE_PERMISSIONS["resident"]
        })
        logger.info("🔑 Claims set for resident UID %s", user.uid)

    except Exception as e:
        logger.error("❌ Failed to create Firebase Auth user for %s: %s", clean_email, str(e))
        raise ResidentError("Failed to create Firebase Auth user")

    doc_ref = db.collection("residents").document(user.uid)
    doc_ref.set(payload)

    snapshot = doc_ref.get()
    logger.info("✅ Resident added with ID: %s (Barangay: %s)", doc_ref.id, payload.get("address", {}).get("barangay"))
    return to_resident_out(snapshot.to_dict(), id=doc_ref.id)

# ➕ Bulk Create (with Firebase Auth integration + claims)
def add_residents_bulk(residents: List[dict], householdId: Optional[str] = None) -> Dict[str, Any]:
    if not residents:
        raise ResidentError("No residents provided for bulk add")

    db = get_firestore()
    if not householdId:
        barangay = residents[0].get("address", {}).get("barangay", "GEN")
        householdId = generate_household_id(barangay)

    batch = db.batch()
    created = []

    for data in residents:
        if not data.get("email"):
            logger.warning("⚠️ Skipping resident without email: %s", data.get("fullName"))
            continue

        data["householdId"] = householdId
        payload = sanitize_resident_payload(data)
        payload = encode_for_firestore(payload)

        clean_email = data["email"].strip().lower()

        try:
            user = auth.create_user(
                email=clean_email,
                password="123456",
                display_name=data.get("fullName")
            )
            payload["authUid"] = user.uid
            payload["id"] = user.uid
            payload["passwordResetRequired"] = True
            logger.info("✅ Firebase Auth user created for %s", clean_email)

            # 🔑 Assign resident claims immediately
            auth.set_custom_user_claims(user.uid, {
                "role": "resident",
                "permissions": ROLE_PERMISSIONS["resident"]
            })
            logger.info("🔑 Claims set for resident UID %s", user.uid)

        except Exception as e:
            logger.error("❌ Failed to create Firebase Auth user for %s: %s", clean_email, str(e))
            continue

        doc_ref = db.collection("residents").document(user.uid)
        batch.set(doc_ref, payload)
        created.append(to_resident_out(payload, id=user.uid))

    if not created:
        raise ResidentError("No residents were successfully created")

    batch.commit()
    logger.info("✅ Bulk added %d residents to household %s", len(created), householdId)
    return {"householdId": householdId, "count": len(created), "items": created}


# 📤 Read single resident by ID
def get_resident_by_id(id: str) -> ResidentOut:
    doc_ref, snapshot = _get_resident_doc(id)
    return to_resident_out(snapshot.to_dict(), id=id)

# 📤 Read all residents
def get_all_residents(limit: int = 50, start_after_id: Optional[str] = None) -> List[ResidentOut]:
    db = get_firestore()
    query = db.collection("residents").order_by("createdAt").limit(limit)
    if start_after_id:
        last_doc = db.collection("residents").document(start_after_id).get()
        if last_doc.exists:
            query = query.start_after(last_doc)
        else:
            logger.warning("⚠️ start_after_id not found: %s", start_after_id)

    docs = query.get()
    return [to_resident_out(doc.to_dict(), id=doc.id) for doc in docs]

# 🔄 Update (PUT)
def update_resident(id: str, data: dict) -> ResidentOut:
    doc_ref, _ = _get_resident_doc(id)
    payload = sanitize_resident_payload(data, is_update=True)
    payload = encode_for_firestore(payload)
    doc_ref.update(payload)
    snapshot = doc_ref.get()
    return to_resident_out(snapshot.to_dict(), id=id)

# ✂️ Patch (PATCH)
def patch_resident(id: str, data: dict) -> ResidentOut:
    doc_ref, _ = _get_resident_doc(id)
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
    doc_ref, _ = _get_resident_doc(id)
    doc_ref.delete()
    return {"id": id, "message": "Resident deleted successfully"}

# 🔎 Duplicate check
def find_duplicates(fullName: str, birthDate: str, middleName: Optional[str] = None, suffix: Optional[str] = None) -> List[ResidentOut]:
    db = get_firestore()
    query = db.collection("residents").where("fullName", "==", fullName.strip()).where("birthDate", "==", birthDate)
    if middleName:
        query = query.where("middleName", "==", middleName.strip())
    if suffix:
        query = query.where("suffix", "==", suffix.strip())

    docs = query.stream()
    return [to_resident_out(doc.to_dict(), id=doc.id) for doc in docs]

# 🗑️ Bulk Delete by household
def delete_by_household(householdId: str) -> Dict[str, Any]:
    db = get_firestore()
    docs = db.collection("residents").where("householdId", "==", householdId).stream()

    deleted_count = 0
    for doc in docs:
        doc.reference.delete()
        deleted_count += 1

    if deleted_count == 0:
        raise ResidentError(f"No residents found for householdId {householdId}")

    return {"householdId": householdId, "deletedCount": deleted_count, "message": f"Deleted {deleted_count} resident(s)"}

# 📤 Bulk Fetch by household
def get_residents_by_household(householdId: str) -> List[ResidentOut]:
    db = get_firestore()
    docs = db.collection("residents").where("householdId", "==", householdId).stream()
    residents = [to_resident_out(doc.to_dict(), id=doc.id) for doc in docs]

    if not residents:
        raise ResidentError(f"No residents found for householdId {householdId}")

    return residents

import logging
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from typing import Optional
from firebase_admin import auth as firebase_auth
from backend.app.models.document import Document, DocumentStatus
import json
from backend.app.services.resident_service import get_resident_by_id
from backend.app.services.fee_service import resolve_document_fee
from backend.app.core.firebase import upload_file, get_storage_bucket
from backend.app.utils.firestore_utils import get_db
from backend.app.utils.barangay_documents import (
    generate_barangay_clearance_pdf,
    generate_residency_certificate_pdf,
    generate_indigency_certificate_pdf,
    generate_good_moral_certificate_pdf,
    generate_business_clearance_pdf,
    generate_activity_permit_pdf,
    generate_blotter_report_pdf,
    generate_health_certificate_pdf,
    generate_barangay_id_pdf,
)

logger = logging.getLogger("uvicorn.error")


# 📦 Document type dispatch
DOCUMENT_GENERATORS = {
    "Barangay Clearance": lambda data, issued_by, issued_at, doc_id: 
        generate_barangay_clearance_pdf(data, issued_by, issued_at, doc_id),

    "Resident Certificate": lambda data, issued_by, issued_at, doc_id: 
        generate_residency_certificate_pdf(data, issued_by, issued_at, doc_id),

    "Indigency Certificate": lambda data, issued_by, issued_at, doc_id: 
        generate_indigency_certificate_pdf(data, issued_by, issued_at, doc_id),

    "Good Moral Certificate": lambda data, issued_by, issued_at, doc_id: 
        generate_good_moral_certificate_pdf(data, issued_by, issued_at, doc_id),

    "Business Clearance": lambda data, issued_by, issued_at, doc_id: 
        generate_business_clearance_pdf(data, issued_by, issued_at, doc_id),

    "Activity Permit": lambda data, issued_by, issued_at, doc_id: 
        generate_activity_permit_pdf(data, issued_by, issued_at, doc_id),

    "Blotter Report": lambda data, issued_by, issued_at, doc_id: 
        generate_blotter_report_pdf(data, issued_by, issued_at, doc_id),

    "Health Certificate": lambda data, issued_by, issued_at, doc_id: 
        generate_health_certificate_pdf(data, issued_by, issued_at, doc_id),

    "Barangay ID": lambda data, issued_by, issued_at, doc_id: 
        generate_barangay_id_pdf(data, issued_by, issued_at, doc_id),
}

def prepare_generator_data(doc: Document) -> dict:
    resident = {}
    if getattr(doc, "residentId", None):
        try:
            resident_out = get_resident_by_id(doc.residentId)
            resident = resident_out.model_dump(by_alias=True)
            logger.info("Fetched resident from Firestore: %s", resident_out.full_name)
        except Exception as e:
            logger.warning("Failed to fetch resident %s: %s", doc.residentId, e)

    # fallback if resident already embedded
    if not resident:
        resident = getattr(doc, "resident", {}) or {}
        logger.info("Using embedded resident: %s", resident)


    address = resident.get("address", {}) or {}
    normalized_address = {} 
    key_map = { 
        "houseNumber": "house_number", 
        "street": "street", 
        "purok": "purok", 
        "barangay": "barangay", 
        "city": "city", 
        "province": "province", 
        "zipCode": "zip_code", 
    } 
    for k, v in address.items(): 
        if v: 
            normalized_address[key_map.get(k, k.lower())] = v

    def safe_field(resident_dict, key, default="N/A"): 
        val = resident_dict.get(key) 
        return val if val not in (None, "", "null") else default
    
    def clean_enum(val, default="N/A"):
        if val is None or val in ("null", ""):
            return default
        val_str = str(val)  # force string conversion
        # Strip enum prefixes like "CivilStatus.", "Gender.", "VoterStatus."
        if "." in val_str:
            return val_str.split(".")[-1]
        return val_str


    def format_address(addr: dict) -> str: 
        if not addr: 
            return "N/A" 
        line1 = " ".join([addr.get("houseNumber", ""), addr.get("street", "")]).strip() 
        line2_parts = [] 
        if addr.get("barangay"): 
            line2_parts.append(f"Brgy. {addr['barangay']}") 
        if addr.get("city"): 
            line2_parts.append(addr["city"]) 
        if addr.get("province"): 
            line2_parts.append(addr["province"]) 
        if addr.get("zipCode"): 
            line2_parts.append(addr["zipCode"]) 
        line2 = ", ".join(line2_parts) 
        return f"{line1}\n{line2}" if line2 else line1

    data = {
        "resident": { 
            "fullName": safe_field(resident, "fullName", "Unnamed") or resident.get("full_name", "Unnamed"), 
            "address": normalized_address, # ✅ keep dict for generator 
            "address_str": format_address(resident.get("address", {})),
            "birthDate": safe_field(resident, "birthDate"), 
            "gender": clean_enum(safe_field(resident, "gender")), 
            "civilStatus": clean_enum(safe_field(resident, "civilStatus")), 
            # "occupation": safe_field(resident, "occupation"),
            "contactNumber": safe_field(resident, "contactNumber", ""), 
            # "voterStatus": clean_enum(safe_field(resident, "voterStatus")),
            "photoUrl": None, 
            "signatureUrl": None,
        },
        "purpose": getattr(doc, "purpose", None),
        "remarks": getattr(doc, "remarks", None),
        "occupation": getattr(doc, "occupation", None),
        "voterStatus": getattr(doc, "voterStatus", None),
        "attachments": getattr(doc, "attachments", {}),
    }
    
    # ✅ Prioritize photoAttachment over photoUrl 
    photo = doc.attachments.get("photoAttachment")
    if photo:
        if isinstance(photo, str):
            data["resident"]["photoUrl"] = photo
        elif isinstance(photo, dict) and "url" in photo:
            data["resident"]["photoUrl"] = photo["url"]
        elif hasattr(photo, "url"):
            data["resident"]["photoUrl"] = photo.url
    elif resident.get("photoUrl"):
        data["resident"]["photoUrl"] = resident["photoUrl"]
    elif getattr(doc, "extraFields", {}).get("photoUrl"):
        data["resident"]["photoUrl"] = doc.extraFields["photoUrl"]

    # ✅ SignatureUrl directly from resident or extraFields 
    if resident.get("signatureUrl"): 
        data["resident"]["signatureUrl"] = resident["signatureUrl"] 
    elif getattr(doc, "extraFields", {}).get("signatureUrl"): 
        data["resident"]["signatureUrl"] = doc.extraFields["signatureUrl"]

    # Merge extraFields if present
    if getattr(doc, "extraFields", None):
        logger.info("Merging extraFields: %s", doc.extraFields)
        data.update(doc.extraFields)

    # Normalize keys (map camelCase → snake_case)
    key_map = {
        "businessName": "business_name",
        "activityName": "activity_name",
        "activityDate": "activity_date",
        "dateReported": "date_reported",
        "yearsOfStay": "years_of_stay",
        "medicalAttachment": "medical_attachment",
    }
    for old_key, new_key in key_map.items():
        if old_key in data:
            data[new_key] = data[old_key]
            logger.info("Normalized key %s → %s: %s", old_key, new_key, data[new_key])

    # ✅ Normalize location
    loc = data.get("location", None) or normalized_address

    if isinstance(loc, str):
        try:
            loc = json.loads(loc)
            logger.info("Parsed location string into dict: %s", loc)
        except Exception:
            logger.warning("Failed to parse location string: %s", loc)
            loc = {}
    elif not isinstance(loc, dict):
        logger.warning("Location is unexpected type: %s", type(loc))
        loc = {}

    data["location"] = {k.lower(): v for k, v in loc.items() if v}
    logger.info("Normalized location: %s", data["location"])

    # Health certificate specific
    data["health_purpose"] = getattr(doc, "purpose", None)

    return data

# ===============================
# 🔧 Serialization Helpers
# ===============================
def _serialize(snapshot) -> Document:
    if not snapshot or not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found")

    data = snapshot.to_dict() or {}
    data.pop("id", None)

    # Convert status string → Enum
    if "status" in data and isinstance(data["status"], str):
        try:
            data["status"] = DocumentStatus(data["status"])
        except ValueError:
            pass

    # Normalize extraFields
    extra_fields = data.get("extraFields", {}) or {}

    # Promote common extraFields to top-level
    for key in ["complainant", "respondent", "incident", "location", "dateReported"]:
        if key in extra_fields and key not in data:
            data[key] = extra_fields[key]

    # ✅ Ensure resident object is preserved
    if "resident" in data and isinstance(data["resident"], dict):
        # Promote fullName to residentName
        data["residentName"] = data["resident"].get("fullName", "Unnamed")

        # Normalize address keys inside resident
        address = data["resident"].get("address", {}) or {}
        normalized_address = {}
        key_map = {
            "houseNumber": "house_number",
            "street": "street",
            "purok": "purok",
            "barangay": "barangay",
            "city": "city",
            "province": "province",
            "zipCode": "zip_code",
        }
        for k, v in address.items():
            if v:
                normalized_address[key_map.get(k, k.lower())] = v
        data["resident"]["address"] = normalized_address

        # Provide safe defaults for missing fields
        for field, default in {
            "fullName": "Unnamed",
            "birthDate": "N/A",
            "civilStatus": "N/A",
            "gender": "N/A",
            "occupation": "N/A",
            "voterStatus": "N/A",
            "photoUrl": "",
        }.items():
            if not data["resident"].get(field):
                data["resident"][field] = default

    # Ensure extraFields is always present
    data["extraFields"] = extra_fields

    return Document(id=snapshot.id, **data)


def _serialize_many(snapshots) -> list[Document]:
    docs: list[Document] = []
    for snapshot in snapshots:
        try:
            docs.append(_serialize(snapshot))
        except Exception as err:
            logger.warning("⚠️ Skipping malformed document id=%s: %s", getattr(snapshot, "id", "unknown"), err)
    return docs

def get_and_serialize(doc_id: str) -> Document:
    snapshot = get_db().collection("documents").document(doc_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found")
    return _serialize(snapshot)

async def update_document(doc_id: str, update_data: dict) -> Document:
    update_data["updatedAt"] = datetime.now(timezone.utc)
    await run_in_threadpool(
        get_db().collection("documents").document(doc_id).update,
        update_data
    )
    return get_and_serialize(doc_id)

# ===============================
# 📤 List Documents
# ===============================
def list_documents(
    uid: str,
    residentId: Optional[str] = None,
    documentType: Optional[str] = None,
    issuedBy: Optional[str] = None,
    fromDate: Optional[datetime] = None,
    toDate: Optional[datetime] = None,
) -> list[Document]:
    db = get_db()
    role = None

    user_doc = db.collection("users").document(uid).get()
    if user_doc.exists:
        role = user_doc.to_dict().get("role")

    # Fallback to Firebase custom claims for legacy/offline-synced accounts.
    if not role:
        try:
            claims = firebase_auth.get_user(uid).custom_claims or {}
            role = claims.get("role")
        except Exception as err:
            logger.warning("⚠️ Failed to resolve role from claims for uid=%s: %s", uid, err)

    if not role and db.collection("residents").document(uid).get().exists:
        role = "resident"

    role = str(role or "resident").strip().lower()

    query = db.collection("documents")

    # Role-based filtering
    if role in ("admin", "secretary") and residentId:
        query = query.where("residentId", "==", residentId)
    elif role not in ("admin", "secretary"):
        query = query.where("residentId", "==", uid)

    # Apply filters
    if documentType:
        query = query.where("documentType", "==", documentType)
    if issuedBy:
        query = query.where("issuedBy", "==", issuedBy)
    if fromDate:
        query = query.where("issuedAt", ">=", fromDate)
    if toDate:
        query = query.where("issuedAt", "<=", toDate)

    return _serialize_many(query.stream())

def list_my_documents(resident_id: str) -> list[Document]:
    return _serialize_many(
        get_db().collection("documents").where("residentId", "==", resident_id).stream()
    )

def list_active_documents(resident_id: str) -> list[Document]:
    active_statuses = {DocumentStatus.pending, DocumentStatus.for_payment, DocumentStatus.paid}
    return [
        doc for doc in _serialize_many(
            get_db().collection("documents").where("residentId", "==", resident_id).stream()
        )
        if doc.status in active_statuses
    ]

def list_history_documents(resident_id: str) -> list[Document]:
    return [
        doc for doc in _serialize_many(
            get_db().collection("documents").where("residentId", "==", resident_id).stream()
        )
        if doc.status == DocumentStatus.approved
        or (doc.status == DocumentStatus.rejected and doc.resubmitted)
    ]

def get_document(doc_id: str) -> Document:
    return get_and_serialize(doc_id)

def count_issued_documents(document_type: Optional[str] = None) -> int:
    """
    Count how many documents have been issued (status = approved).
    If document_type is provided, filter by that type.
    """
    query = get_db().collection("documents").where("status", "==", DocumentStatus.approved.value)

    if document_type:
        query = query.where("documentType", "==", document_type)

    return len([s for s in query.stream()])


# ===============================
# 📝 Create Document with Type-Based Counter
# ===============================
async def create_document(
    resident_id: str,
    resident_name: Optional[str],
    document_type: str,
    purpose: Optional[str] = None,
    remarks: Optional[str] = None,
    idAttachment: UploadFile = None,
    residencyAttachment: UploadFile = None,
    complainant: Optional[str] = None,
    respondent: Optional[str] = None,
    incident: Optional[str] = None,
    locationBarangay: Optional[str] = None,
    locationStreet: Optional[str] = None,
    locationCity: Optional[str] = None,
    locationProvince: Optional[str] = None,
    businessName: Optional[str] = None,
    activityName: Optional[str] = None,
    activityDate: Optional[str] = None,
    occupation: Optional[str] = None,
    voterStatus: Optional[str] = None,
    yearsOfStay: Optional[int] = None,              # NEW
    medicalAttachment: UploadFile = None,           # NEW
    photoAttachment: UploadFile = None,
    activityPlan: UploadFile = None,              # NEW
    businessPermit: UploadFile = None,            # NEW
) -> Document:
    try:
        doc_ref = get_db().collection("documents").document()
        now = datetime.now(timezone.utc)

        # Upload attachments if provided
        id_url, residency_url, medical_url, photo_url, activity_plan_url, business_permit_url = None, None, None, None, None, None
        if idAttachment: 
            id_url = await run_in_threadpool( 
                upload_file, idAttachment, f"documents/{doc_ref.id}/id_{idAttachment.filename}" 
            ) 
        if residencyAttachment: 
            residency_url = await run_in_threadpool( 
                upload_file, residencyAttachment, f"documents/{doc_ref.id}/residency_{residencyAttachment.filename}" 
            ) 
        if medicalAttachment: 
            medical_url = await run_in_threadpool( 
                upload_file, medicalAttachment, f"documents/{doc_ref.id}/medical_{medicalAttachment.filename}" 
            ) 
        if photoAttachment: 
            photo_url = await run_in_threadpool( 
                upload_file, photoAttachment, f"documents/{doc_ref.id}/photo_{photoAttachment.filename}" 
            )
        if activityPlan:
            activity_plan_url = await run_in_threadpool(
                upload_file, activityPlan, f"documents/{doc_ref.id}/activity_plan_{activityPlan.filename}"
            )
        if businessPermit:
            business_permit_url = await run_in_threadpool(
                upload_file, businessPermit, f"documents/{doc_ref.id}/business_permit_{businessPermit.filename}"
            )

        # 🔎 Fetch resident details
        resident_snapshot = get_db().collection("residents").document(resident_id).get()
        if not resident_snapshot.exists:
            raise HTTPException(status_code=404, detail="Resident not found")
        resident_data = resident_snapshot.to_dict()

        # Counter for sequential IDs
        counter_ref = get_db().collection("counters").document(document_type)
        counter_snapshot = counter_ref.get()

        # Check if there are any existing documents of this type
        docs_exist = get_db().collection("documents").where("documentType", "==", document_type).limit(1).get()

        if not docs_exist:
            # Reset counter if no documents of this type exist
            last_number = 0
        else:
            last_number = counter_snapshot.to_dict().get("last_number", 0) if counter_snapshot.exists else 0

        new_number = last_number + 1
        await run_in_threadpool(counter_ref.set, {"last_number": new_number})

        safe_type = document_type.replace(" ", "_")
        document_id = f"{safe_type}-{new_number:04d}"

        fee_info = resolve_document_fee(document_type)
        amount = fee_info["totalFee"]

        # Build attachments dynamically (only include non-None values) 
        attachments = {} 
        if id_url: 
            attachments["idAttachment"] = id_url 
        if residency_url: 
            attachments["residencyAttachment"] = residency_url 
        if medical_url: 
            attachments["medicalAttachment"] = medical_url 
        if photo_url: 
            attachments["photoAttachment"] = photo_url
        if activity_plan_url:
            attachments["activityPlan"] = activity_plan_url
        if business_permit_url:
            attachments["businessPermit"] = business_permit_url

        def safe_field(data: dict, key: str, default="N/A"): 
            val = data.get(key) 
            return val if val not in (None, "", "null") else default

        # 📝 Base document data with embedded resident
        document_data = {
            "documentId": document_id,
            "residentId": resident_id,
            "residentName": resident_name or safe_field(resident_data, "fullName", "Unnamed"),
            "resident": { 
                "fullName": safe_field(resident_data, "fullName", "Unnamed"), 
                "address": resident_data.get("address") or {}, 
                "birthDate": safe_field(resident_data, "birthDate"), 
                "gender": safe_field(resident_data, "gender"), 
                "civilStatus": safe_field(resident_data, "civilStatus"), 
                "contactNumber": safe_field(resident_data, "contactNumber", ""), 
                "photoUrl": photo_url or resident_data.get("photoUrl") or "", 
            },
            "documentType": document_type,
            "purpose": purpose,
            "remarks": remarks,
            "status": DocumentStatus.paid.value if amount == 0 else DocumentStatus.pending.value,
            "occupation": occupation,
            "voterStatus": voterStatus,
            "createdAt": now,
            "updatedAt": now,
            "attachments": attachments,
            "amount": amount,
        }

        # Type-specific handling
        if document_type == "Blotter Report":
            if not all([complainant, respondent, incident]):
                raise HTTPException(
                    status_code=422,
                    detail="Complainant, respondent, and incident are required for blotter reports"
                )

            # ✅ Rebuild location dict
            location_dict = {
                "barangay": locationBarangay,
                "street": locationStreet,
                "city": locationCity,
                "province": locationProvince,
            }
            location_dict = {k: v for k, v in location_dict.items() if v}

            if not location_dict:
                raise HTTPException(
                    status_code=422,
                    detail="Location is required for blotter reports"
                )

            document_data["extraFields"] = {
                "complainant": complainant,
                "respondent": respondent,
                "incident": incident,
                "location": location_dict,
                "dateReported": datetime.now().strftime("%Y-%m-%d"),
            }


        elif document_type == "Business Clearance":
            if not businessName:
                raise HTTPException(
                    status_code=422,
                    detail="Business name is required for business clearance"
                )

            # ✅ Rebuild location dict
            location_dict = {
                "barangay": locationBarangay,
                "street": locationStreet,
                "city": locationCity,
                "province": locationProvince,
            }
            location_dict = {k: v for k, v in location_dict.items() if v}

            if not location_dict:
                raise HTTPException(
                    status_code=422,
                    detail="Business address/location is required for business clearance"
                )

            document_data["extraFields"] = {
                "businessName": businessName,
                "location": location_dict,
            }


        elif document_type == "Activity Permit":
            if not all([activityName, activityDate]):
                raise HTTPException(
                    status_code=422,
                    detail="Activity name and date are required for activity permits"
                )

            location_dict = {
                "barangay": locationBarangay,
                "street": locationStreet,
                "city": locationCity,
                "province": locationProvince,
            }
            location_dict = {k: v for k, v in location_dict.items() if v}

            if not location_dict:
                raise HTTPException(
                    status_code=422,
                    detail="Location is required for activity permits"
                )

            document_data["extraFields"] = {
                "activityName": activityName,
                "activityDate": activityDate,
                "location": location_dict,
            }

        elif document_type == "Resident Certificate": 
            if not yearsOfStay: 
                raise HTTPException(status_code=422, detail="Years of residency required") 
            document_data["extraFields"] = {"yearsOfStay": yearsOfStay} 
        
        elif document_type == "Health Certificate": 
            if not medical_url: 
                raise HTTPException(status_code=422, detail="Medical result attachment required") 
            document_data["extraFields"] = {"medicalAttachment": medical_url} 
        
        elif document_type == "Barangay ID": 
            if not photo_url: 
                raise HTTPException(status_code=422, detail="Resident photo required") 
            # Embed photo into resident snapshot 
            document_data["resident"]["photoUrl"] = photo_url

        elif document_type == "Barangay Clearance":
            # ✅ Always embed resident address into extraFields.location
            address = resident_data.get("address", {}) or {}
            # Normalize keys to lowercase
            location_dict = {k.lower(): v for k, v in address.items() if v}
            document_data["extraFields"] = {"location": dict(location_dict)}

        await run_in_threadpool(doc_ref.set, document_data)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            raise HTTPException(status_code=500, detail="Document not saved")
        return _serialize(snapshot)

    except Exception as e:
        logger.exception("❌ Error creating document: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create document")

# ===============================
# 🔄 Workflow Functions
# ===============================
async def mark_resubmitted(doc_id: str) -> Document:
    doc = get_and_serialize(doc_id)
    if doc.status != DocumentStatus.rejected:
        raise HTTPException(status_code=400, detail="Only rejected documents can be resubmitted")
    return await update_document(doc_id, {"resubmitted": True})

async def update_status(doc_id: str, new_status: DocumentStatus, remarks: Optional[str]) -> Document:
    doc = get_and_serialize(doc_id)
    if doc.amount == 0 and new_status in [DocumentStatus.for_payment, DocumentStatus.payment_submitted]:
        raise HTTPException(status_code=400, detail="Free documents do not require payment")
    valid_transitions = {
        DocumentStatus.pending: [DocumentStatus.for_payment, DocumentStatus.rejected],
        DocumentStatus.for_payment: [DocumentStatus.paid, DocumentStatus.rejected],
        DocumentStatus.payment_submitted: [DocumentStatus.paid, DocumentStatus.rejected],
        DocumentStatus.paid: [DocumentStatus.approved],
    }
    if new_status not in valid_transitions.get(doc.status, []):
        raise HTTPException(status_code=400, detail=f"Invalid transition {doc.status.value} → {new_status.value}")
    if new_status == DocumentStatus.rejected and not remarks:
        raise HTTPException(status_code=422, detail="Rejection reason required")
    return await update_document(doc_id, {"status": new_status.value, "remarks": remarks})

async def confirm_payment(doc_id: str) -> Document:
    doc = get_and_serialize(doc_id)
    if doc.status not in (DocumentStatus.for_payment, DocumentStatus.payment_submitted):
        raise HTTPException(status_code=400, detail="Payment can only be confirmed from for_payment or payment_submitted")
    return await update_document(doc_id, {"status": DocumentStatus.paid.value, "paymentStatus": "paid"})

async def issue_document(doc_id: str, issued_by: str, file_url: Optional[str] = None, remarks: Optional[str] = None) -> Document:
    doc = get_and_serialize(doc_id)

    if doc.amount > 0 and doc.paymentStatus != "paid":
        raise HTTPException(status_code=400, detail="Payment must be confirmed before issuance")

    issued_at = datetime.now(timezone.utc)

    if not file_url:
        generator = DOCUMENT_GENERATORS.get(doc.documentType)
        if not generator:
            raise HTTPException(status_code=400, detail=f"Unsupported document type: {doc.documentType}")

        try:
            data = prepare_generator_data(doc)
            pdf_bytes = generator(data, issued_by, issued_at, doc.documentId)

            bucket = get_storage_bucket()
            blob = bucket.blob(f"documents/{doc_id}.pdf")
            await run_in_threadpool(blob.upload_from_string, pdf_bytes, content_type="application/pdf")
            file_url = await run_in_threadpool(
                blob.generate_signed_url, expiration=issued_at + timedelta(days=365*50)
            )
        except Exception as e:
            logger.exception("❌ PDF generation/upload failed: %s", e)
            raise HTTPException(status_code=500, detail="Failed to generate or upload PDF")

    def _clean_text(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if text.lower() in {"undefined", "null", "none", "nan"}:
            return None
        return text

    normalized_remarks = _clean_text(remarks)
    existing_remarks = _clean_text(getattr(doc, "remarks", None))
    final_remarks = normalized_remarks or existing_remarks or f"Issued by {issued_by}"

    update_data = {
        "status": DocumentStatus.approved.value,
        "issuedBy": issued_by,
        "issuedAt": issued_at,
        "fileUrl": file_url,
        "remarks": final_remarks,
    }
    if doc.referenceNumber:
        update_data["referenceNumber"] = doc.referenceNumber

    return await update_document(doc_id, update_data)

async def delete_document(doc_id: str, uid: str):
    """Hard delete a document by ID, along with related payments and receipts."""
    doc_ref = get_db().collection("documents").document(doc_id)
    snapshot = doc_ref.get()

    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found")

    # Serialize before deleting so we can return the deleted record
    from backend.app.services.document_service import _serialize
    deleted_doc = _serialize(snapshot)

    # Perform deletion
    doc_ref.delete()

    # --- Delete related payments ---
    payments = get_db().collection("payments").where("documentId", "==", doc_id).get()
    for pay in payments:
        pay.reference.delete()

    # --- Delete related receipts ---
    receipts = get_db().collection("receipts").where("documentId", "==", doc_id).get()
    for rec in receipts:
        rec.reference.delete()

    return deleted_doc

from email import generator
from fastapi import HTTPException
from datetime import timedelta, datetime
import uuid
import logging

from backend.app.models.document import Document
from backend.app.core.firebase import get_firestore, get_storage_bucket
from backend.app.utils.barangay_documents import (
    generate_barangay_clearance_pdf,
    generate_residency_certificate_pdf,
    generate_indigency_certificate_pdf,
    generate_good_moral_certificate_pdf,
    generate_business_clearance_pdf,
    generate_activity_permit_pdf,
    generate_blotter_report_pdf,
    generate_health_certificate_pdf,
    generate_barangay_id_pdf
)

logger = logging.getLogger("uvicorn.error")

# 🧠 Document type aliases
DOC_TYPE_ALIASES = {
    "Residency": "Certificate of Residency",
    "Clearance": "Barangay Clearance",
    "Indigency": "Certificate of Indigency",
    "Good Moral": "Certificate of Good Moral Character",
    "Business": "Barangay Business Clearance",
    "Activity": "Permit to Conduct Activities",
    "Blotter": "Blotter Report",
    "Health": "Health Certificate",
    "ID": "Barangay ID"
}

# 📦 Document type dispatch
DOCUMENT_GENERATORS = {
    "Barangay Clearance": lambda data, doc_id, issued_by, issued_at: generate_barangay_clearance_pdf(data, issued_by, issued_at, doc_id),
    "Certificate of Residency": lambda data, doc_id, issued_by, issued_at: generate_residency_certificate_pdf(data, issued_by, issued_at, doc_id),
    "Certificate of Indigency": lambda data, doc_id, issued_by, issued_at: generate_indigency_certificate_pdf(data, issued_by, issued_at, doc_id),
    "Certificate of Good Moral Character": lambda data, doc_id, issued_by, issued_at: generate_good_moral_certificate_pdf(data, issued_by, issued_at, doc_id),
    "Barangay Business Clearance": lambda data, doc_id, issued_by, issued_at: generate_business_clearance_pdf(
        data.get("business_name", "Unnamed Business"),
        data.get("fullName", "Unnamed"),
        data.get("address", {}),
        issued_by,
        issued_at,
        doc_id
    ),
    "Permit to Conduct Activities": lambda data, doc_id, issued_by, issued_at: generate_activity_permit_pdf(
        data.get("fullName", "Organizer"),
        data.get("activity_name", "Unnamed Activity"),
        data.get("location", data.get("address", {})),
        parse_date(data.get("activity_date"), issued_at),
        issued_by,
        issued_at,
        doc_id
    ),
    "Blotter Report": lambda data, doc_id, issued_by, issued_at: generate_blotter_report_pdf(
        data.get("complainant", "N/A"),
        data.get("respondent", "N/A"),
        data.get("incident", "N/A"),
        data.get("location", data.get("address", {})),
        parse_date(data.get("date_reported"), issued_at),
        issued_by,
        issued_at,
        doc_id
    ),
    "Health Certificate": lambda data, doc_id, issued_by, issued_at: generate_health_certificate_pdf(
        data, data.get("purpose", "unspecified"), issued_by, issued_at, doc_id
    ),
    "Barangay ID": lambda data, doc_id, issued_by, issued_at: generate_barangay_id_pdf(data, issued_by, issued_at, doc_id)
}

def parse_date(date_str, fallback=None):
    if isinstance(date_str, str):
        try:
            return datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            pass
    return fallback or datetime.utcnow()

# ===============================
# 📝 Phase 1: Resident Submission
# ===============================
def create_document_request(data: dict) -> Document:
    """
    Resident submits a document request.
    Stores metadata only, status = pending.
    """
    db = get_firestore()

    resident_id = data.get("resident_id")
    if not resident_id:
        raise HTTPException(status_code=400, detail="Missing resident_id")

    # Validate resident exists
    resident_ref = db.collection("residents").document(resident_id)
    resident_doc = resident_ref.get()
    if not resident_doc.exists:
        raise HTTPException(status_code=404, detail="Resident not found")

    doc_id = str(uuid.uuid4())
    created_at = datetime.utcnow()
    doc_type = DOC_TYPE_ALIASES.get(data.get("document_type", ""), data.get("document_type", "Certificate of Residency"))
    document_code = f"{doc_type[:2].upper()}-{created_at.strftime('%Y%m%d')}-{doc_id[:8].upper()}"

    resident_data = resident_doc.to_dict()
    full_name = f"{resident_data.get('first_name','')} {resident_data.get('last_name','')}".strip()

    doc_data = {
        "id": doc_id,
        "resident_id": resident_id,
        "resident_name": full_name,
        "document_type": doc_type,
        "purpose": data.get("purpose", "unspecified"),
        "remarks": data.get("remarks", ""),
        "status": DocumentStatus.pending.value,
        "document_code": document_code,
        "issued_by": None,
        "issued_at": None,
        "file_url": None,
        "qr_code_url": None,
        "verified": False,
        "created_at": created_at,
        "updated_at": created_at,
    }

    db.collection("documents").document(doc_id).set(doc_data)
    logger.info("📥 Document request created: %s", doc_id)

    return Document(**doc_data)

# ===============================
# 🔍 Phase 2: Secretary Validation
# ===============================
def validate_document_request(doc_id: str, handled_by: str, remarks: Optional[str] = None) -> Document:
    """
    Secretary validates a pending document request.
    Moves status from 'pending' → 'awaiting_payment'.
    """
    db = get_firestore()
    doc_ref = db.collection("documents").document(doc_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found")

    data = snapshot.to_dict()
    if data.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be validated")

    now = datetime.utcnow()
    data.update({
        "status": "awaiting_payment",
        "handled_by": handled_by,
        "remarks": remarks,
        "updated_at": now,
    })
    doc_ref.update(data)

    logger.info("🔍 Document %s validated by %s", doc_id, handled_by)
    return Document(id=doc_id, **data)

# ===============================
# 💳 Phase 3: Payment Confirmation
# ===============================
def confirm_document_payment(doc_id: str) -> Document:
    """
    Treasurer/Webhook confirms payment for a document request.
    Updates Firestore status to 'paid'.
    """
    db = get_firestore()

    doc_ref = db.collection("documents").document(doc_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found")

    data = snapshot.to_dict()
    current_status = data.get("status")

    # ✅ Guard: only allow payment confirmation from 'awaiting_payment'
    if current_status != "awaiting_payment":
        raise HTTPException(
            status_code=400,
            detail=f"Payment can only be confirmed from 'awaiting_payment' status (current: {current_status})"
        )

    now = datetime.utcnow()
    data.update({
        "status": "paid",
        "updated_at": now,
    })
    doc_ref.update(data)

    logger.info("💳 Payment confirmed for document %s", doc_id)
    return Document(id=doc_id, **data)

# ===============================
# 📜 Phase 4: Secretary Issuance
# ===============================
def issue_document(doc_id: str, issued_by: str) -> Document:
    db = get_firestore()
    bucket = get_storage_bucket()

    doc_ref = db.collection("documents").document(doc_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found")

    data = snapshot.to_dict()

    # ✅ Status guard
    if data.get("status") != DocumentStatus.paid.value:
        raise HTTPException(status_code=400, detail="Document must be paid before issuance")

    resident_id = data.get("resident_id")
    resident_ref = db.collection("residents").document(resident_id)
    resident_doc = resident_ref.get()
    if not resident_doc.exists:
        raise HTTPException(status_code=404, detail="Resident not found")

    resident_data = resident_doc.to_dict()
    issued_at = datetime.utcnow()

    generator = DOCUMENT_GENERATORS.get(data["document_type"])
    if not generator:
        raise HTTPException(status_code=400, detail=f"Unsupported document type: {data['document_type']}")

    try:
        pdf_bytes = generator(resident_data, doc_id, issued_by, issued_at)
    except Exception as e:
        logger.error("❌ PDF generation failed: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate PDF")

    try:
        blob = bucket.blob(f"documents/{doc_id}.pdf")
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
        file_url = blob.generate_signed_url(expiration=issued_at + timedelta(days=365*50))
    except Exception as e:
        logger.error("❌ Firebase upload failed: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to upload document")

    data.update({
        "handled_by": issued_by,
        "issued_by": issued_by,
        "issued_at": issued_at,
        "file_url": file_url,
        "status": DocumentStatus.approved.value,
        "updated_at": issued_at,
    })
    doc_ref.update(data)

    logger.info("📜 Document %s issued by %s", doc_id, issued_by)
    return Document(id=doc_id, **data)

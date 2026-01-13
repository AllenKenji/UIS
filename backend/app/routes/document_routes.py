from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form, Depends
from typing import List, Optional
from backend.app.models.document import Document, DocumentStatus
from backend.app.core.firebase import get_firestore, upload_file
from backend.app.services.paymongo_service import create_payment_link
from backend.app.core.auth import require_permission
import logging
from datetime import datetime
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ValidationError

router = APIRouter(tags=["Documents"])
logger = logging.getLogger("uvicorn.error")

# ===============================
# 🔧 Helper: Serialize Firestore doc → Pydantic Document
# ===============================
def serialize_document(doc_snapshot, db):
    data = doc_snapshot.to_dict()
    if not data:
        raise HTTPException(status_code=404, detail="Document not found")
    data.pop("id", None)

    # 🔎 Enrich with resident name
    resident_ref = db.collection("residents").document(data["resident_id"])
    resident_snapshot = resident_ref.get()
    if resident_snapshot.exists:
        resident_data = resident_snapshot.to_dict()
        full_name = (
            resident_data.get("fullName")
            or f"{resident_data.get('first_name','')} {resident_data.get('last_name','')}".strip()
        )
        data["resident_name"] = full_name or resident_data.get("authUid")

    try:
        return Document(id=doc_snapshot.id, **data)
    except ValidationError as e:
        # ⚠️ Gracefully handle invalid Firestore records
        logger.warning("Invalid document %s: %s", doc_snapshot.id, e)
        # Option A: skip invalid docs
        return None
        # Option B: return a safe fallback instead of None:
        # return {"id": doc_snapshot.id, **data, "error": str(e)}


# ===============================
# 📤 List Documents
# ===============================
@router.get("/", response_model=List[Document])
async def list_documents(
    resident_id: Optional[str] = Query(None),
    uid: str = Depends(require_permission("viewDocuments"))
) -> List[Document]:
    db = get_firestore()

    def _query():
        query = db.collection("documents")
        user_doc = db.collection("users").document(uid).get()
        role = user_doc.to_dict().get("role") if user_doc.exists else "resident"

        if role == "resident":
            query = query.where("resident_id", "==", uid)
        elif role in ("admin", "secretary"):
            if resident_id:
                query = query.where("resident_id", "==", resident_id)
        else:
            raise HTTPException(status_code=403, detail=f"Access denied for role {role}")

        docs = [serialize_document(doc, db) for doc in query.stream()]
        return [doc for doc in docs if doc is not None]  # ✅ filter invalid

    return await run_in_threadpool(_query)


@router.get("/my", response_model=List[Document])
async def list_my_documents(resident_id: str) -> List[Document]:
    db = get_firestore()

    def _query():
        query = db.collection("documents").where("resident_id", "==", resident_id)
        docs = [serialize_document(doc, db) for doc in query.stream()]
        return [doc for doc in docs if doc is not None]

    return await run_in_threadpool(_query)


@router.get("/my/active", response_model=List[Document])
async def list_active_documents(resident_id: str) -> List[Document]:
    db = get_firestore()

    def _query():
        query = db.collection("documents").where("resident_id", "==", resident_id)
        docs = [
            serialize_document(doc, db)
            for doc in query.stream()
            if doc.to_dict()["status"] in ["pending", "awaiting_payment", "paid"]
        ]
        return [doc for doc in docs if doc is not None]

    return await run_in_threadpool(_query)


@router.get("/my/history", response_model=List[Document])
async def list_history_documents(resident_id: str) -> List[Document]:
    db = get_firestore()

    def _query():
        query = db.collection("documents").where("resident_id", "==", resident_id)
        docs = [
            serialize_document(doc, db)
            for doc in query.stream()
            if doc.to_dict()["status"] == "approved"
            or (doc.to_dict()["status"] == "rejected" and doc.to_dict().get("resubmitted") is True)
        ]
        return [doc for doc in docs if doc is not None]

    return await run_in_threadpool(_query)


@router.get("/{doc_id}", response_model=Document)
async def get_document(doc_id: str) -> Document:
    db = get_firestore()
    snapshot = db.collection("documents").document(doc_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found")
    return serialize_document(snapshot, db)

# ===============================
# 🔄 Mark Document as Resubmitted (Resident)
# ===============================
class ResubmissionPayload(BaseModel):
    resubmitted: bool = True

@router.patch("/{doc_id}/resubmission", response_model=Document)
async def mark_document_resubmitted(doc_id: str, payload: ResubmissionPayload) -> Document:
    """
    Mark a rejected document as resubmitted so it moves to history.
    """
    db = get_firestore()
    def _mark():
        doc_ref = db.collection("documents").document(doc_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            return None

        data = snapshot.to_dict()
        if DocumentStatus(data["status"]) != DocumentStatus.rejected:
            raise HTTPException(status_code=400, detail="Only rejected documents can be marked as resubmitted")

        doc_ref.update({
            "resubmitted": payload.resubmitted,
            "updated_at": datetime.utcnow()
        })
        return doc_ref.get()

    snapshot = await run_in_threadpool(_mark)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Document not found")
    return serialize_document(snapshot, db)

# ===============================
# 📝 Create Document (Resident)
# ===============================
@router.post("/", response_model=Document, status_code=201)
async def create_document(
    resident_id: str = Form(...),
    document_type: str = Form(...),
    purpose: Optional[str] = Form(None),
    remarks: Optional[str] = Form(None),
    idAttachment: UploadFile = File(...),
    residencyAttachment: UploadFile = File(...),
    amount: Optional[int] = Form(None)  # 💳 Payment amount if required
) -> Document:
    db = get_firestore()
    try:
        doc_ref = db.collection("documents").document()
        now = datetime.utcnow()

        # 📤 Upload files
        id_url = await run_in_threadpool(
            upload_file, idAttachment, f"documents/{doc_ref.id}/id_{idAttachment.filename}"
        )
        residency_url = await run_in_threadpool(
            upload_file, residencyAttachment, f"documents/{doc_ref.id}/residency_{residencyAttachment.filename}"
        )

        # 🔎 Fetch resident name
        resident_ref = db.collection("residents").document(resident_id)
        resident_snapshot = resident_ref.get()
        resident_name = None
        if resident_snapshot.exists:
            resident_data = resident_snapshot.to_dict()
            resident_name = resident_data.get("fullName") or resident_data.get("authUid")

        # 💳 Create PayMongo payment link if amount provided
        paymongo_link_id = None
        checkout_url = None
        if amount and amount > 0:
            description = f"{document_type} request for resident {resident_id}"
            result = create_payment_link(
                amount=amount,
                description=description,
                remarks=remarks or "",
                metadata={"documentId": doc_ref.id, "residentId": resident_id},
            )
            paymongo_link_id = result.get("link_id")
            checkout_url = result.get("checkout_url")

        # 📝 Build document
        document = Document(
            id=doc_ref.id,
            resident_id=resident_id,
            resident_name=resident_name,
            auth_uid=None,
            document_type=document_type,
            purpose=purpose,
            remarks=remarks,
            status=DocumentStatus.awaiting_payment if paymongo_link_id else DocumentStatus.pending,
            created_at=now,
            updated_at=now,
            attachments={
                "idAttachment": id_url,
                "residencyAttachment": residency_url,
            },
            # New payment fields
            paymongoLinkId=paymongo_link_id,
            checkoutUrl=checkout_url,
        )

        await run_in_threadpool(doc_ref.set, document.dict())
        logger.info("📥 Document created: %s (status=%s)", document.id, document.status.value)
        return document

    except Exception as e:
        logger.exception("❌ Error creating document: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create document")


# ===============================
# 🔄 Update Status (Secretary/Admin)
# ===============================
class StatusUpdatePayload(BaseModel):
    new_status: DocumentStatus
    remarks: Optional[str] = None

@router.patch("/{doc_id}/status", response_model=Document)
async def update_document_status(doc_id: str, payload: StatusUpdatePayload) -> Document:
    db = get_firestore()
    try:
        def _update():
            doc_ref = db.collection("documents").document(doc_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None

            data = snapshot.to_dict()
            current_status = DocumentStatus(data["status"])

            valid_transitions = {
                DocumentStatus.pending: [DocumentStatus.awaiting_payment, DocumentStatus.rejected],
                DocumentStatus.awaiting_payment: [DocumentStatus.paid, DocumentStatus.rejected],
                DocumentStatus.paid: [DocumentStatus.approved],
            }

            if payload.new_status not in valid_transitions.get(current_status, []):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status transition: {current_status.value} → {payload.new_status.value}"
                )

            if payload.new_status == DocumentStatus.rejected and not payload.remarks:
                raise HTTPException(status_code=422, detail="Rejection reason is required.")

            # ✅ Only update necessary fields
            doc_ref.update({
                "status": payload.new_status.value,
                "remarks": payload.remarks,
                "updated_at": datetime.utcnow()
            })

            return doc_ref.get()

        snapshot = await run_in_threadpool(_update)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Document not found")
        return serialize_document(snapshot, db)
    except Exception as e:
        logger.exception("❌ Error updating document status: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update document status")

# ===============================
# 💳 Confirm Payment
# ===============================
@router.patch("/{doc_id}/payment", response_model=Document)
async def confirm_payment(doc_id: str) -> Document:
    db = get_firestore()
    try:
        def _confirm():
            doc_ref = db.collection("documents").document(doc_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None

            data = snapshot.to_dict()
            if DocumentStatus(data["status"]) != DocumentStatus.awaiting_payment:
                raise HTTPException(status_code=400, detail="Payment can only be confirmed from 'awaiting_payment' status")

            data["status"] = DocumentStatus.paid.value
            data["updated_at"] = datetime.utcnow()
            doc_ref.update(data)

            return doc_ref.get()

        snapshot = await run_in_threadpool(_confirm)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Document not found")
        return serialize_document(snapshot, db)
    except Exception as e:
        logger.exception("❌ Error confirming payment: %s", e)
        raise HTTPException(status_code=500, detail="Failed to confirm payment")


# ===============================
# 📜 Issue Document
# ===============================
class IssuePayload(BaseModel):
    issued_by: str
    file_url: Optional[str] = None

@router.patch("/{doc_id}/issue", response_model=Document)
async def issue_document(doc_id: str, payload: IssuePayload) -> Document:
    db = get_firestore()
    try:
        def _issue():
            doc_ref = db.collection("documents").document(doc_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None

            data = snapshot.to_dict()
            if DocumentStatus(data["status"]) != DocumentStatus.paid:
                raise HTTPException(status_code=400, detail="Document must be 'paid' before issuance")

            data["status"] = DocumentStatus.approved.value
            data["issued_by"] = payload.issued_by
            data["issued_at"] = datetime.utcnow()
            if payload.file_url:
                data["file_url"] = payload.file_url
            data["updated_at"] = datetime.utcnow()
            doc_ref.update(data)

            return doc_ref.get()

        snapshot = await run_in_threadpool(_issue)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Document not found")
        return serialize_document(snapshot, db)
    except Exception as e:
        logger.exception("❌ Error issuing document: %s", e)
        raise HTTPException(status_code=500, detail="Failed to issue document")

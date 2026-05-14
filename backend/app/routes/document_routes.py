from fastapi import APIRouter, Query, UploadFile, File, Form, Depends
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from backend.app.models.document import Document, DocumentStatus
from backend.app.core.auth import require_permission
from backend.app.services import document_service
from backend.app.services.notification_service import NotificationService
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Documents"])


async def _notify_document_submitted(doc: Document):
    try:
        suffix = f" ({doc.documentType})" if doc.documentType else ""
        await NotificationService.notify(
            role="admin",
            type="document",
            message=f"New document request submitted{suffix}",
        )
        await NotificationService.notify(
            role="secretary",
            type="document",
            message=f"New document request submitted{suffix}",
        )
    except Exception as notify_err:
        logger.warning("⚠️ Document submit notification failed: %s", notify_err)


async def _notify_document_status_change(doc: Document):
    try:
        status_value = doc.status.value if hasattr(doc.status, "value") else str(doc.status)
        status_label = str(status_value).replace("_", " ")
        suffix = f" ({doc.documentType})" if doc.documentType else ""

        await NotificationService.notify(
            role="admin",
            type="document_update",
            message=f"Document status updated to {status_label}{suffix}",
        )
        await NotificationService.notify(
            role="secretary",
            type="document_update",
            message=f"Document status updated to {status_label}{suffix}",
        )

        if doc.residentId:
            await NotificationService.notify(
                role="resident",
                type="document_update",
                message=f"Your document status was updated to {status_label}{suffix}",
                user_id=doc.residentId,
            )
    except Exception as notify_err:
        logger.warning("⚠️ Document status notification failed: %s", notify_err)

# ===============================
# 📤 List Documents
# ===============================
@router.get("", response_model=List[Document])
async def list_documents(
    residentId: Optional[str] = Query(None),
    documentType: Optional[str] = Query(None),
    issuedBy: Optional[str] = Query(None),
    fromDate: Optional[datetime] = Query(None),
    toDate: Optional[datetime] = Query(None),
    uid: str = Depends(require_permission("viewDocuments"))
) -> List[Document]:
    return document_service.list_documents(
        uid=uid,
        residentId=residentId,
        documentType=documentType,
        issuedBy=issuedBy,
        fromDate=fromDate,
        toDate=toDate,
    )

@router.get("/my", response_model=List[Document])
async def list_my_documents(resident_id: str) -> List[Document]:
    return document_service.list_my_documents(resident_id)

@router.get("/my/active", response_model=List[Document])
async def list_active_documents(resident_id: str) -> List[Document]:
    return document_service.list_active_documents(resident_id)

@router.get("/my/history", response_model=List[Document])
async def list_history_documents(resident_id: str) -> List[Document]:
    return document_service.list_history_documents(resident_id)

@router.get("/{doc_id}", response_model=Document)
async def get_document(doc_id: str) -> Document:
    return document_service.get_document(doc_id)

# ===============================
# 🔄 Mark Document as Resubmitted
# ===============================
class ResubmissionPayload(BaseModel):
    resubmitted: bool = True

@router.patch("/{doc_id}/resubmission", response_model=Document)
async def mark_document_resubmitted(doc_id: str, payload: ResubmissionPayload) -> Document:
    return await document_service.mark_resubmitted(doc_id)

# ===============================
# 📝 Create Document (Resident)
# ===============================
@router.post("", response_model=Document, status_code=201)
async def create_document(
    resident_id: str = Form(...),
    document_type: str = Form(...),
    purpose: Optional[str] = Form(None),
    remarks: Optional[str] = Form(None),

    # Attachments
    idAttachment: UploadFile = File(None),
    residencyAttachment: UploadFile = File(None),
    medicalAttachment: UploadFile = File(None),   
    photoAttachment: UploadFile = File(None),  
    activityPlan: UploadFile = File(None),
    businessPermit: UploadFile = File(None),


    # Extra fields
    complainant: Optional[str] = Form(None),
    respondent: Optional[str] = Form(None),
    incident: Optional[str] = Form(None),
    businessName: Optional[str] = Form(None),
    activityName: Optional[str] = Form(None),
    activityDate: Optional[str] = Form(None),
    occupation: Optional[str] = Form(None),
    voterStatus: Optional[str] = Form(None),
    yearsOfStay: Optional[int] = Form(None),

    # ✅ Location fields
    locationBarangay: Optional[str] = Form(None),
    locationStreet: Optional[str] = Form(None),
    locationCity: Optional[str] = Form(None),
    locationProvince: Optional[str] = Form(None),
) -> Document:
    created = await document_service.create_document(
        resident_id=resident_id,
        resident_name=None,  # Will be populated in service layer based on residentId
        document_type=document_type,
        purpose=purpose,
        remarks=remarks,
        idAttachment=idAttachment,
        residencyAttachment=residencyAttachment,
        medicalAttachment=medicalAttachment, 
        photoAttachment=photoAttachment,
        activityPlan=activityPlan,
        businessPermit=businessPermit,
        complainant=complainant,
        respondent=respondent,
        incident=incident,
        businessName=businessName,
        activityName=activityName,
        activityDate=activityDate,
        occupation=occupation,
        voterStatus=voterStatus,
        yearsOfStay=yearsOfStay,
        locationBarangay=locationBarangay,
        locationStreet=locationStreet,
        locationCity=locationCity,
        locationProvince=locationProvince,
    )
    await _notify_document_submitted(created)
    return created

# ===============================
# 🔄 Update Status
# ===============================
class StatusUpdatePayload(BaseModel): 
    newStatus: DocumentStatus 
    remarks: Optional[str] = None

@router.patch("/{doc_id}/status", response_model=Document)
async def update_document_status(doc_id: str, payload: StatusUpdatePayload) -> Document:
    updated = await document_service.update_status(doc_id, payload.newStatus, payload.remarks)
    await _notify_document_status_change(updated)
    return updated

# ===============================
# 💳 Confirm Payment
# ===============================
@router.patch("/{doc_id}/payment", response_model=Document)
async def confirm_payment(doc_id: str) -> Document:
    updated = await document_service.confirm_payment(doc_id)
    await _notify_document_status_change(updated)
    return updated

# ===============================
# 📜 Issue Document
# ===============================
class IssuePayload(BaseModel): 
    issued_by: str 
    file_url: Optional[str] = None
    remarks: Optional[str] = None

@router.patch("/{doc_id}/issue", response_model=Document)
async def issue_document(doc_id: str, payload: IssuePayload) -> Document:
    updated = await document_service.issue_document(
        doc_id, 
        payload.issued_by, 
        payload.file_url, 
        payload.remarks
    )
    await _notify_document_status_change(updated)
    return updated

@router.delete("/{doc_id}", response_model=Document)
async def delete_document(doc_id: str, uid: str = Depends(require_permission("manageDocuments"))) -> Document:
    return await document_service.delete_document(doc_id, uid)

@router.get("/count/issued")
async def get_issued_count(documentType: Optional[str] = Query(None)) -> dict:
    count = document_service.count_issued_documents(documentType)
    return {"documentType": documentType, "issuedCount": count}


from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum

class DocumentStatus(str, Enum):
    pending = "pending"
    for_payment = "for_payment"
    awaiting_payment = "awaiting_payment"
    payment_submitted = "payment_submitted"
    paid = "paid"
    payment_failed = "payment_failed"
    payment_cancelled = "payment_cancelled"
    payment_refunded = "payment_refunded"
    approved = "approved"
    rejected = "rejected"

class Attachment(BaseModel):
    url: Optional[str] = Field(None, description="Public or signed URL to the uploaded file")
    path: Optional[str] = Field(None, description="Storage path inside Firebase bucket")

class Document(BaseModel):
    # 🔑 Firestore document ID
    id: str = Field(..., description="Firestore auto-generated document ID")

    # 🆔 Human-readable sequential ID
    documentId: str = Field(..., description="Type-based sequential identifier, e.g. Barangay_Clearance-0001")

    # 👤 Resident info
    residentId: str = Field(..., description="Resident ID who requested the document")
    residentName: Optional[str] = Field(None, description="Full name of the resident")
    authUid: Optional[str] = Field(None, description="Auth UID if available")

    # 📄 Document details
    documentType: str = Field(..., description="Type of document requested")
    purpose: Optional[str] = Field(None, description="Purpose of the document")
    remarks: Optional[str] = Field(None, description="Remarks from secretary/admin")

    # 🔄 Status lifecycle
    status: DocumentStatus = Field(..., description="Current status of the document")
    resubmitted: Optional[bool] = Field(False, description="Whether a rejected document was resubmitted")

    # 🕒 Timestamps
    createdAt: datetime = Field(..., description="When the document was created")
    updatedAt: datetime = Field(..., description="When the document was last updated")
    issuedAt: Optional[datetime] = Field(None, description="When the document was issued")

    # 📎 Attachments (now objects with url + path)
    attachments: Optional[Dict[str, Union[Attachment, str]]] = Field(
        None,
        description="Uploaded file metadata including URL and storage path"
    )

    # 💳 Payment info
    amount: Optional[int] = Field(None, description="Payment amount if required")
    paymentStatus: Optional[str] = Field(None, description="Payment status string")
    referenceNumber: Optional[str] = Field(None, description="Payment reference number")
    paymentIntentId: Optional[str] = Field(None, description="PayMongo Payment Intent ID")
    transactionId: Optional[str] = Field(None, description="PayMongo Transaction ID")

    # 📜 Issuance info
    issuedBy: Optional[str] = Field(None, description="Secretary/Admin who issued the document")
    fileUrl: Optional[str] = Field(None, description="URL to the issued document file")

    # 🧩 Flexible extra fields for type-specific data
    extraFields: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional fields depending on document type"
    )
    
    # Common extras
    occupation: Optional[str] = Field(None, description="Resident occupation")
    voterStatus: Optional[str] = Field(None, description="Resident voter status")

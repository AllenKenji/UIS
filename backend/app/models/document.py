from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class DocumentStatus(str, Enum):
    pending = "pending"
    awaiting_payment = "awaiting_payment"
    payment_submitted = "payment_submitted"
    paid = "paid"
    approved = "approved"
    rejected = "rejected"

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

    # 📎 Attachments
    attachments: Optional[Dict[str, str]] = Field(None, description="Uploaded file URLs")

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
    
    # Common extras (still explicit for convenience)
    occupation: Optional[str] = Field(None, description="Resident occupation")
    voterStatus: Optional[str] = Field(None, description="Resident voter status")

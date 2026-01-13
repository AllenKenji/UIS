from pydantic import BaseModel, Field, model_validator
from typing import Optional, Dict
from datetime import datetime
from enum import Enum


class DocumentStatus(str, Enum):
    pending = "pending"
    awaiting_payment = "awaiting_payment"
    paid = "paid"
    approved = "approved"
    rejected = "rejected"


class Document(BaseModel):
    id: Optional[str] = None
    resident_id: str = Field(..., min_length=1)
    resident_name: Optional[str] = Field(None, alias="residentName")
    auth_uid: Optional[str] = None

    document_type: str = Field(..., min_length=1)
    purpose: Optional[str] = None
    remarks: Optional[str] = None
    attachments: Dict[str, str] = Field(default_factory=dict)

    status: DocumentStatus = Field(default=DocumentStatus.pending)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    handled_by: Optional[str] = None
    issued_by: Optional[str] = None
    issued_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    resubmitted: bool = Field(default=False)

    paymongoLinkId: Optional[str] = None
    checkoutUrl: Optional[str] = None
    paymentStatus: Optional[str] = None

    file_url: Optional[str] = None
    document_code: Optional[str] = None
    qr_code_url: Optional[str] = None
    verified: bool = False

    @model_validator(mode="after") 
    def check_rejection_reason(self) -> "Document": 
        # ✅ self is the model instance here 
        if self.status == DocumentStatus.rejected and not self.rejection_reason: 
            raise ValueError("Rejection reason is required when status is 'rejected'") 
        return self
    
    class Config:
        from_attributes = True
        json_encoders = {datetime: lambda v: v.isoformat()}

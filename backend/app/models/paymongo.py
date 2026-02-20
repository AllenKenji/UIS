from pydantic import BaseModel, Field
from typing import Optional, Dict

# ----------------------------- 
# Request Models 
# ----------------------------- 

class DocumentPaymentRequest(BaseModel): 
    documentId: str 
    documentType: str                       # e.g. "Barangay Clearance" 
    remarks: str = "" 
    
class BusinessPaymentRequest(BaseModel): 
    businessId: str 
    businessType: str                       # e.g. "Retail Store" 
    feeType: str                            # "registrationFee" or "annualFee" 
    remarks: str = "" 
    
class BillingInfo(BaseModel):
    name: str = Field(..., description="Resident's full name")
    email: str = Field(..., description="Resident's email address")

class AttachPaymentRequest(BaseModel):
    paymentIntentId: str = Field(..., description="Payment Intent ID from PayMongo")
    paymongoClientKey: str = Field(..., description="Client key from PayMongo intent creation")
    method: str = Field(..., description="Payment method type (e.g., 'gcash', 'grab_pay')")
    billing: BillingInfo = Field(..., description="Billing information for the resident")
    type: str = Field(..., description="business or document")
    return_url: Optional[str] = Field(
        None,
        description="URL to redirect after payment success/failure"
    )

from pydantic import BaseModel, Field
from typing import Optional, Dict

class BusinessDetails(BaseModel):
    name: str
    type: str
    barangay: str
    address: str
    registration_date: str

class BusinessDocuments(BaseModel):
    valid_id: str
    proof_of_address: str
    dti_cert: Optional[str] = None
    business_logo: Optional[str] = None

class BusinessApplication(BaseModel):
    owner_uid: str
    owner_name: str
    contact_number: str
    email: str
    business: BusinessDetails
    documents: BusinessDocuments

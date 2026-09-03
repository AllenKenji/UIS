from pydantic import BaseModel, Field
from typing import Optional, Dict

class BusinessDetails(BaseModel):
    name: str
    type: str
    barangay: str
    street: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    address: str
    registration_date: str
    # Franchise branches legitimately share the same business name within a
    # barangay (e.g. multiple branches of the same chain) — skips the
    # duplicate-name check in create_business_application when true.
    is_franchise: bool = False

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

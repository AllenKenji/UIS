from pydantic import BaseModel, Field, condecimal
from typing import Dict
from typing import Annotated

# Define a reusable constrained type
FeeAmount = Annotated[condecimal(gt=0, lt=10000), Field(...)]


class RolePermission(BaseModel):
    role: str = Field(
        ..., 
        example="staff", 
        description="Role name to assign permissions to (e.g., admin, staff, resident)"
    )
    permissions: Dict[str, bool] = Field(
        ..., 
        example={
            "viewDashboard": True,
            "fileComplaints": True,
            "manageResidents": False
        },
        description="Full permission map for the role. Keys must match known permission identifiers."
    )

class DocumentFee(BaseModel):
    document_type: str = Field(
        ..., 
        example="barangay_clearance", 
        description="Type of document (e.g., barangay_clearance, certificate_of_indigency)"
    )
    fee: FeeAmount = Field(
        ..., 
        example="50.0",  # Pydantic prefers Decimal-compatible strings here
        description="Fee amount in PHP (must be greater than 0 and less than 10,000)"
    )

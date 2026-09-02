from pydantic import BaseModel, Field, StringConstraints
from typing import Optional, Annotated
from datetime import datetime
from enum import Enum

# 🎯 Controlled vocabularies
class ComplaintCategory(str, Enum):
    noise = "Noise"
    service = "Service"
    neighbor = "Neighbor"
    other = "Other"

class ComplaintStatus(str, Enum):
    open = "open"
    in_review = "in_review"   # ✅ underscore for consistency
    resolved = "resolved"

# 📥 Base complaint schema
class ComplaintBase(BaseModel):
    category: ComplaintCategory
    description: Annotated[str, StringConstraints(min_length=5, max_length=500)]
    location: str
    filed_by: Annotated[str, StringConstraints(min_length=1, max_length=64)] = Field(
        ..., description="UID of user who entered the complaint (resident self-filing or staff/admin proxy)"
    )
    filed_for: Optional[Annotated[str, StringConstraints(min_length=1, max_length=64)]] = Field(
        None, description="Resident UID the complaint is about (defaults to filed_by if resident self-filing)"
    )
    barangayId: Optional[str] = Field(None, description="Tenant this complaint belongs to")

# 🆕 Complaint creation schema
class ComplaintCreate(ComplaintBase):
    """
    Used when a complaint is filed.
    - filed_by: who entered the complaint (resident or staff/admin)
    - filed_for: resident the complaint is about (optional if resident self-filing)
    Timestamp is set by backend (Firestore SERVER_TIMESTAMP).
    """
    pass

# 📤 Complaint response schema
class Complaint(BaseModel):
    id: str
    category: ComplaintCategory
    description: str
    location: str
    filed_by: str
    filed_for: Optional[str] = None
    barangayId: Optional[str] = None
    timestamp: datetime
    status: ComplaintStatus = ComplaintStatus.open
    resolution_notes: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        validate_by_name = True
        from_attributes = True  # ✅ allows dict/ORM integration

    @classmethod
    def from_firestore(cls, snapshot) -> "Complaint":
        """
        Helper to instantiate from Firestore DocumentSnapshot.
        Ensures Firestore timestamps are converted to Python datetime.
        """
        data = snapshot.to_dict() or {}
        if "timestamp" in data and hasattr(data["timestamp"], "to_datetime"):
            data["timestamp"] = data["timestamp"].to_datetime()
        if "updated_at" in data and hasattr(data["updated_at"], "to_datetime"):
            data["updated_at"] = data["updated_at"].to_datetime()
        return cls(id=snapshot.id, **data)

    def to_dict(self) -> dict:
        """
        Convert to dict for Firestore writes, excluding None values.
        """
        return self.dict(exclude_none=True)

# 📤 Complaint with resident + filer details
class ComplaintWithResident(Complaint):
    filed_for_name: str = Field(..., description="Resident full name for display")
    filed_by_name: Optional[str] = Field(None, description="Name of user who filed (staff/admin or resident)")

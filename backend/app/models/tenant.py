from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TenantCreate(BaseModel):
    city: str = Field(..., min_length=1, max_length=100)
    province: str = Field(..., min_length=1, max_length=100)
    barangay: str = Field(..., min_length=1, max_length=100)
    zipCode: Optional[str] = Field(None, max_length=10)


class TenantUpdate(BaseModel):
    province: Optional[str] = Field(None, min_length=1, max_length=100)
    zipCode: Optional[str] = Field(None, max_length=10)
    contactNumber: Optional[str] = None
    email: Optional[str] = None
    emergencyHotline: Optional[str] = None
    officeHours: Optional[str] = None


class Tenant(TenantCreate):
    id: str
    logoUrl: Optional[str] = None
    contactNumber: Optional[str] = None
    email: Optional[str] = None
    emergencyHotline: Optional[str] = None
    officeHours: Optional[str] = None
    createdAt: Optional[datetime] = None


class City(BaseModel):
    id: str
    name: str
    logoUrl: Optional[str] = None
    createdAt: Optional[datetime] = None

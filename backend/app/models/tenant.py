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


class ProvinceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class ProvinceUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class Province(BaseModel):
    id: str
    name: str
    createdAt: Optional[datetime] = None


class CityCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    province: str = Field(..., min_length=1, max_length=100)


class CityUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    # Optional — omit to just rename. Lets an existing city (registered
    # before provinces existed as their own entity) be assigned one, or
    # reassigned to a different registered province.
    province: Optional[str] = Field(None, min_length=1, max_length=100)


class City(BaseModel):
    id: str
    name: str
    # Optional for backward compatibility — cities created before provinces
    # existed as their own entity have none on record.
    province: Optional[str] = None
    logoUrl: Optional[str] = None
    createdAt: Optional[datetime] = None

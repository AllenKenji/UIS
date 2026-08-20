from pydantic import BaseModel, Field
from typing import Literal, Optional

# -----------------------------
# 🔑 Base Models
# -----------------------------
class BaseFee(BaseModel):
    """Common fields shared by all fee types."""
    fee: int = Field(..., ge=0, description="Base/base fee amount")
    enabled: bool = Field(default=True, description="Enable/disable this fee")
    miscType: Optional[str] = Field(
        default=None,
        description="Reference to a miscellaneous fee type (from misc_fees)"
    )
    miscFeeType: Optional[Literal["fixed", "percentage"]] = Field(
        default=None,
        description="Optional per-document or per-business override for the miscellaneous fee calculation"
    )
    miscFeeRate: Optional[float] = Field(
        default=None,
        ge=0,
        description="Per-document or per-business miscellaneous fee amount or percentage"
    )

# -----------------------------
# 📄 Document Fee Models
# -----------------------------
class DocumentFee(BaseFee):
    """Update model for existing document fees."""
    documentType: Optional[str] = Field(None, min_length=1, description="Type of document")

class NewDocumentFee(BaseFee):
    """Creation model for new document fees."""
    documentType: str = Field(..., min_length=1, description="Type of document")

# -----------------------------
# 🏢 Business Fee Models
# -----------------------------
class BusinessFee(BaseFee):
    """Update model for existing business fees."""
    registrationFee: Optional[int] = Field(default=None, ge=0, description="Registration fee")
    annualFee: Optional[int] = Field(default=None, ge=0, description="Annual fee")
    businessType: Optional[str] = Field(None, min_length=1, description="Type of business")

class NewBusinessFee(BusinessFee):
    """Creation model for new business fees."""
    businessType: str = Field(..., min_length=1, description="Type of business")

# -----------------------------
# 🆕 Miscellaneous Fee Models
# -----------------------------
class MiscFee(BaseModel):
    """Update model for miscellaneous fees."""
    targetType: Optional[Literal["document", "business"]] = Field(
        default=None, description="Specific fee target category; omitted means legacy global configuration"
    )
    targetName: Optional[str] = Field(default=None, min_length=1, description="Specific document or business type")
    useForDocuments: bool = Field(default=False, description="Apply this fee to documents")
    documentFeeType: Literal["fixed", "percentage"] = Field(default="fixed")
    documentFee: float = Field(default=0, ge=0, description="Document fixed amount or percentage")
    useForBusinesses: bool = Field(default=False, description="Apply this fee to businesses")
    businessFeeType: Literal["fixed", "percentage"] = Field(default="fixed")
    businessFee: float = Field(default=0, ge=0, description="Business fixed amount or percentage")
    feeType: Literal["fixed", "percentage"] = Field(
        default="fixed", description="Whether fee is a fixed amount or a percentage"
    )
    fee: float = Field(default=0, ge=0, description="Legacy miscellaneous fee amount or percentage rate")
    enabled: bool = Field(default=True, description="Enable/disable this fee")

    def model_post_init(self, __context):
        if self.feeType == "percentage" and self.fee > 100:
            raise ValueError("Percentage miscellaneous fees must be between 0 and 100")
        if self.documentFeeType == "percentage" and self.documentFee > 100:
            raise ValueError("Document percentage fees must be between 0 and 100")
        if self.businessFeeType == "percentage" and self.businessFee > 100:
            raise ValueError("Business percentage fees must be between 0 and 100")

class NewMiscFee(MiscFee):
    """Creation model for new miscellaneous fees."""
    miscType: str = Field(..., min_length=1, description="Type of miscellaneous fee")

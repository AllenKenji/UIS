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
    feeType: Literal["fixed", "percentage"] = Field(
        default="fixed", description="Whether fee is a fixed amount or a percentage"
    )
    fee: float = Field(..., ge=0, description="Miscellaneous fee amount or percentage rate")
    enabled: bool = Field(default=True, description="Enable/disable this fee")

    def model_post_init(self, __context):
        if self.feeType == "percentage" and self.fee > 100:
            raise ValueError("Percentage miscellaneous fees must be between 0 and 100")

class NewMiscFee(MiscFee):
    """Creation model for new miscellaneous fees."""
    miscType: str = Field(..., min_length=1, description="Type of miscellaneous fee")

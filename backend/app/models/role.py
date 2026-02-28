from pydantic import BaseModel, field_validator

ALLOWED_ROLES = {"admin", "staff", "secretary", "treasurer", "sk", "dilg", "resident"}

class RoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    def validate_role(cls, v: str) -> str:
        if v not in ALLOWED_ROLES:
            raise ValueError(f"Invalid role: {v}")
        return v


class RoleResponse(BaseModel):
    uid: str
    role: str

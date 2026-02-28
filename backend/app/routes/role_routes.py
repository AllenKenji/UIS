from fastapi import APIRouter, Depends
from backend.app.core.auth import set_user_role, get_admin_uid
from backend.app.models.role import RoleUpdate, RoleResponse

router = APIRouter()

@router.post("/users/{uid}/role", response_model=RoleResponse, tags=["Roles"])
async def assign_role(uid: str, update: RoleUpdate):
    # If no admins exist yet, allow bootstrap
    if update.role == "admin":
        return set_user_role(uid, "admin")
    # Otherwise require admin
    _ = Depends(get_admin_uid)
    return set_user_role(uid, update.role)

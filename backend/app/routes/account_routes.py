import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.app.models.account import AccountCreate, AccountResponse, RoleEnum
from backend.app.services.account_service import (
    create_barangay_account,
    delete_barangay_account,
    update_user_role,
)
from backend.app.core.auth import get_admin_uid, require_permission

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Accounts"])


# ===============================
# 📦 Response Models
# ===============================
class ActionResponse(BaseModel):
    detail: str


class RoleUpdatePayload(BaseModel):
    role: RoleEnum


# ===============================
# 🔧 Helper: wrap service calls
# ===============================
async def safe_service_call(service_func, *args, **kwargs):
    try:
        return await service_func(*args, **kwargs)
    except ValueError as ve:
        logger.warning("⚠️ Conflict: %s", str(ve))
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(ve))
    except PermissionError as pe:
        logger.warning("🚫 Permission denied: %s", str(pe))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except HTTPException as he:
        logger.error("❌ HTTP error: %s", he.detail)
        raise he
    except Exception as e:
        logger.exception("❌ Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Operation failed: {str(e)}",
        )


# ===============================
# 🚀 Routes
# ===============================
@router.post(
    "/admin/create-account",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new barangay account",
    description="Accessible only to admins. Creates a new account with role-based access."
)
async def create_account_handler(
    payload: AccountCreate,
    admin_uid: str = Depends(get_admin_uid),
) -> AccountResponse:
    logger.info("📥 Account creation requested by admin: %s", admin_uid)
    account = await safe_service_call(create_barangay_account, payload, created_by=admin_uid)
    logger.info("✅ Account created successfully: %s", account.uid)
    return account


@router.delete(
    "/admin/delete-account/{uid}",
    response_model=ActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete a barangay account",
    description="Accessible only to admins. Deletes both Firestore and Firebase Auth user."
)
async def delete_account_handler(
    uid: str,
    admin_uid: str = Depends(get_admin_uid),
) -> ActionResponse:
    logger.info("🗑️ Account deletion requested by admin: %s for user: %s", admin_uid, uid)
    await safe_service_call(delete_barangay_account, uid, deleted_by=admin_uid)
    logger.info("✅ Account deleted successfully: %s", uid)
    return ActionResponse(detail=f"Account {uid} deleted successfully")


@router.put(
    "/admin/update-role/{uid}",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a user's role",
    description="Accessible only to admins. Updates role in Firestore, Firebase Auth claims, and logs the change."
)
async def update_role_handler(
    uid: str,
    payload: RoleUpdatePayload,
    admin_uid: str = Depends(get_admin_uid),
) -> AccountResponse:
    logger.info("🔄 Role update requested by admin: %s for user: %s", admin_uid, uid)
    account = await safe_service_call(update_user_role, uid, payload.role, changed_by=admin_uid)
    logger.info("✅ Role updated to %s for UID: %s", payload.role, uid)
    return account

import logging
import os
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from backend.app.models.account import AccountCreate, AccountResponse, RoleEnum
from backend.app.services.account_service import (
    create_barangay_account,
    delete_barangay_account,
    update_user_role,
    list_barangay_accounts,
)
from backend.app.core.auth import get_admin_uid, get_current_user, require_permission

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Accounts"])


# ===============================
# 📦 Response Models
# ===============================
class ActionResponse(BaseModel):
    detail: str


class RoleUpdatePayload(BaseModel):
    role: RoleEnum


class CfdpProvisionPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: RoleEnum
    requestedBy: str | None = None


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
        msg = str(e)
        if isinstance(msg, (dict, list)):
            msg = "; ".join(map(str, msg))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Operation failed: {msg}",
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
    _: None = Depends(require_permission("createAccount")),
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
    _: None = Depends(require_permission("deleteAccount")),
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
    _: None = Depends(require_permission("updateRole")),
) -> AccountResponse:
    logger.info("🔄 Role update requested by admin: %s for user: %s", admin_uid, uid)
    account = await safe_service_call(update_user_role, uid, payload.role, changed_by=admin_uid)
    logger.info("✅ Role updated to %s for UID: %s", payload.role, uid)
    return account

@router.get(
    "/admin/accounts",
    response_model=list[AccountResponse],
    status_code=status.HTTP_200_OK,
    summary="List all barangay accounts",
    description="Accessible to admins and treasurers."
)
async def list_accounts_handler(
    user_uid: str = Depends(get_current_user),
    _: None = Depends(require_permission("manageUsers")),
    role: RoleEnum | None = None,
    limit: int = 20,
    offset: int = 0,
):
    logger.info("📋 Account list requested by user: %s", user_uid)
    # You’d implement a service function to query Firestore
    accounts = await safe_service_call(list_barangay_accounts, role=role, limit=limit, offset=offset) 
    return accounts


@router.post(
    "/internal/cfdp/provision-account",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision BIS account from CFDP",
    description="Internal endpoint used by CFDP to create surveyor/supervisor BIS accounts.",
)
async def provision_account_from_cfdp(
    payload: CfdpProvisionPayload,
    x_cfdp_provision_key: str | None = Header(default=None),
) -> AccountResponse:
    expected_key = os.environ.get("CFDP_TO_BIS_PROVISION_API_KEY", "").strip()
    provided_key = (x_cfdp_provision_key or "").strip()

    if not expected_key or provided_key != expected_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if payload.role not in {RoleEnum.surveyor, RoleEnum.supervisor}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only surveyor or supervisor roles are allowed",
        )

    created_by = f"cfdp:{(payload.requestedBy or 'system').strip() or 'system'}"
    create_payload = AccountCreate(
        full_name=payload.name,
        email=payload.email,
        password=payload.password,
        role=payload.role,
    )

    return await safe_service_call(
        create_barangay_account,
        create_payload,
        created_by=created_by,
        skip_cfdp_provision=True,
    )

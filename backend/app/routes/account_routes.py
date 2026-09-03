import logging
import os
import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit, urlunsplit
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from backend.app.models.account import AccountCreate, AccountResponse, RoleEnum
from backend.app.services.account_service import (
    create_barangay_account,
    delete_barangay_account,
    update_user_role,
    list_barangay_accounts,
)
from backend.app.core.auth import get_admin_uid, get_current_user, require_permission, resolve_tenant_scope, get_db
from backend.app.core.local_auth import authenticate, issue_token
from backend.app.services.email_service import send_email
from backend.app.services.tenant_service import get_tenant, require_tenant_exists

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Accounts"])


# ===============================
# 📦 Response Models
# ===============================
class ActionResponse(BaseModel):
    detail: str


class RoleUpdatePayload(BaseModel):
    role: RoleEnum


class FdpProvisionPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: RoleEnum
    requestedBy: str | None = None


class SurveyHandoffResponse(BaseModel):
    redirectUrl: str


class LoginPayload(BaseModel):
    email: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)


class LoginResponse(BaseModel):
    accessToken: str
    user: dict


class AccountPhotoPayload(BaseModel):
    photoUrl: str = Field(..., min_length=1, max_length=2048)


class SelfSignaturePayload(BaseModel):
    signatureUrl: str = Field(..., min_length=1, max_length=2048)


class AccountProfilePayload(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr


class AccountRolesPayload(BaseModel):
    roles: list[RoleEnum] = Field(..., min_length=1)


class SwitchRolePayload(BaseModel):
    role: RoleEnum


@router.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginPayload) -> LoginResponse:
    user = authenticate(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    safe_user = {key: value for key, value in user.items() if key != "passwordHash"}
    return LoginResponse(accessToken=issue_token(user), user=safe_user)


@router.post("/auth/switch-role", response_model=LoginResponse)
async def switch_role(payload: SwitchRolePayload, user: dict = Depends(get_current_user)) -> LoginResponse:
    snapshot = get_db().collection("users").document(user["uid"]).get()
    profile = snapshot.to_dict() if snapshot.exists else None
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    roles = [str(role).lower() for role in profile.get("roles") or [profile.get("role", "resident")]]
    if payload.role.value not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role is not assigned to this account")
    updated_user = {"uid": user["uid"], **profile, "role": payload.role.value, "roles": roles}
    safe_user = {key: value for key, value in updated_user.items() if key != "passwordHash"}
    return LoginResponse(accessToken=issue_token(updated_user), user=safe_user)


def _get_survey_handoff_secret() -> str:
    return os.environ.get("FDP_SURVEY_HANDOFF_SECRET", "fdp-survey-handoff-dev-secret").strip()


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _sign_handoff_payload(payload: dict) -> str:
    encoded_payload = _base64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = hmac.new(
        _get_survey_handoff_secret().encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"{encoded_payload}.{_base64url_encode(signature)}"


def _derive_survey_base_url() -> str:
    explicit = os.environ.get("FDP_SURVEY_BASE_URL", "").strip().rstrip("/")
    if explicit:
        return explicit

    provision_url = os.environ.get("FDP_PROVISION_URL", "").strip()
    if not provision_url:
        return ""

    parsed = urlsplit(provision_url)
    path = parsed.path.rstrip("/")

    for suffix in (
        "/api/internal/bis/provision-user",
        "/internal/bis/provision-user",
    ):
        if path.endswith(suffix):
            path = path[: -len(suffix)] or "/"
            break

    normalized_path = path.rstrip("/")
    return urlunsplit((parsed.scheme, parsed.netloc, normalized_path, "", "")).rstrip("/")


# ===============================
# 🔧 Helper: wrap service calls
# ===============================
def _ensure_same_tenant(current_user: dict, target_uid: str) -> None:
    """Block a barangay admin from mutating an account outside their own tenant."""
    if current_user.get("role") == "super_admin":
        return
    target = get_db().collection("users").document(target_uid).get()
    if target.exists and (target.to_dict() or {}).get("barangayId") != current_user.get("barangayId"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account belongs to a different barangay")


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
    current_user: dict = Depends(get_current_user),
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("createAccount")),
) -> AccountResponse:
    logger.info("📥 Account creation requested by admin: %s", admin_uid)

    if payload.role == RoleEnum.super_admin:
        if current_user.get("role") != "super_admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a super admin can create another super admin account")
        payload = payload.model_copy(update={"barangayId": None})
    elif current_user.get("role") == "super_admin":
        if not payload.barangayId:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="barangayId is required")
        require_tenant_exists(payload.barangayId)
    else:
        payload = payload.model_copy(update={"barangayId": current_user.get("barangayId")})

    account = await safe_service_call(create_barangay_account, payload, created_by=admin_uid)
    try:
        send_email("welcome", account.email, account.full_name)
    except Exception as error:
        logger.warning("Welcome email could not be sent to %s: %s", account.email, error)
    logger.info("✅ Account created successfully: %s", account.uid)
    return account


@router.patch("/account/my-signature")
async def update_my_signature_handler(
    payload: SelfSignaturePayload,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Self-service e-signature upload for barangay staff accounts (admin, staff,
    secretary, treasurer, sk, dilg) — every barangay's own staff manage their
    own signature, attached automatically when they issue a document.
    """
    role = str(current_user.get("role") or "").strip().lower()
    if role in ("", "resident"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only barangay staff accounts can set a signature")

    uid = current_user["uid"]
    user_ref = get_db().collection("users").document(uid)
    if not user_ref.get().exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    user_ref.update({"signatureUrl": payload.signatureUrl})
    return {"uid": uid, "signatureUrl": payload.signatureUrl}


@router.patch("/admin/accounts/{uid}/photo")
async def update_account_photo_handler(
    uid: str,
    payload: AccountPhotoPayload,
    current_user: dict = Depends(get_current_user),
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("createAccount")),
) -> dict:
    _ensure_same_tenant(current_user, uid)
    user_ref = get_db().collection("users").document(uid)
    snapshot = user_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    user_ref.update({"photoUrl": payload.photoUrl})
    return {"uid": uid, "photoUrl": payload.photoUrl}


@router.patch("/admin/accounts/{uid}/signature")
async def update_account_signature_handler(
    uid: str,
    payload: SelfSignaturePayload,
    current_user: dict = Depends(get_current_user),
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("createAccount")),
) -> dict:
    """Admin-set signature for a barangay staff account, e.g. at account creation time."""
    _ensure_same_tenant(current_user, uid)
    user_ref = get_db().collection("users").document(uid)
    snapshot = user_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    user_ref.update({"signatureUrl": payload.signatureUrl})
    return {"uid": uid, "signatureUrl": payload.signatureUrl}


@router.patch("/admin/accounts/{uid}/profile")
async def update_account_profile_handler(
    uid: str,
    payload: AccountProfilePayload,
    current_user: dict = Depends(get_current_user),
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("manageUsers")),
) -> dict:
    _ensure_same_tenant(current_user, uid)
    user_ref = get_db().collection("users").document(uid)
    snapshot = user_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    clean_email = str(payload.email).strip().lower()
    duplicate = get_db().collection("users").where("email", "==", clean_email).limit(1).get()
    if duplicate and duplicate[0].id != uid:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    user_ref.update({"full_name": payload.full_name.strip(), "email": clean_email, "updatedAt": datetime.now(timezone.utc)})
    return {"uid": uid, "full_name": payload.full_name.strip(), "email": clean_email}


@router.patch("/admin/accounts/{uid}/roles")
async def update_account_roles_handler(
    uid: str,
    payload: AccountRolesPayload,
    current_user: dict = Depends(get_current_user),
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("manageUsers")),
) -> dict:
    _ensure_same_tenant(current_user, uid)
    user_ref = get_db().collection("users").document(uid)
    snapshot = user_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    roles = list(dict.fromkeys(role.value for role in payload.roles))
    current = snapshot.to_dict() or {}
    active_role = current.get("role") if current.get("role") in roles else roles[0]
    user_ref.update({"roles": roles, "role": active_role, "updatedAt": datetime.now(timezone.utc)})
    return {"uid": uid, "roles": roles, "role": active_role}


@router.delete(
    "/admin/delete-account/{uid}",
    response_model=ActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete a barangay account",
    description="Accessible only to admins. Deletes the local PostgreSQL account."
)
async def delete_account_handler(
    uid: str,
    current_user: dict = Depends(get_current_user),
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("deleteAccount")),
) -> ActionResponse:
    _ensure_same_tenant(current_user, uid)
    logger.info("🗑️ Account deletion requested by admin: %s for user: %s", admin_uid, uid)
    await safe_service_call(delete_barangay_account, uid, deleted_by=admin_uid)
    logger.info("✅ Account deleted successfully: %s", uid)
    return ActionResponse(detail=f"Account {uid} deleted successfully")


@router.put(
    "/admin/update-role/{uid}",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a user's role",
    description="Accessible only to admins. Updates the PostgreSQL role and logs the change."
)
async def update_role_handler(
    uid: str,
    payload: RoleUpdatePayload,
    current_user: dict = Depends(get_current_user),
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("updateRole")),
) -> AccountResponse:
    _ensure_same_tenant(current_user, uid)
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
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageUsers")),
    role: RoleEnum | None = None,
    limit: int = 20,
    offset: int = 0,
    barangayId: str | None = None,
):
    logger.info("📋 Account list requested by user: %s", current_user.get("uid"))
    scope = resolve_tenant_scope(current_user, barangayId)
    accounts = await safe_service_call(list_barangay_accounts, role=role, limit=limit, offset=offset, barangay_id=scope)
    return accounts


@router.post(
    "/internal/fdp/provision-account",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision BIS account from FDP",
    description="Internal endpoint used by FDP to create surveyor/supervisor BIS accounts.",
)
async def provision_account_from_fdp(
    payload: FdpProvisionPayload,
    x_fdp_provision_key: str | None = Header(default=None),
) -> AccountResponse:
    expected_key = os.environ.get("FDP_TO_BIS_PROVISION_API_KEY", "").strip()
    provided_key = (x_fdp_provision_key or "").strip()

    if not expected_key or provided_key != expected_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if payload.role not in {RoleEnum.surveyor, RoleEnum.supervisor}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only surveyor or supervisor roles are allowed",
        )

    created_by = f"fdp:{(payload.requestedBy or 'system').strip() or 'system'}"
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
        skip_fdp_provision=True,
    )


@router.post(
    "/internal/fdp/survey-handoff",
    response_model=SurveyHandoffResponse,
    status_code=status.HTTP_200_OK,
    summary="Create a survey login handoff",
    description="Creates a short-lived signed URL that logs an admin, surveyor, or supervisor into FDP.",
)
async def create_survey_handoff(user: dict = Depends(get_current_user)) -> SurveyHandoffResponse:
    uid = str(user.get("uid") or "").strip()
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user session")

    db = get_db()
    user_doc = db.collection("users").document(uid).get()
    profile = user_doc.to_dict() if user_doc.exists else {}

    role = str(profile.get("role") or user.get("role") or "").strip().lower()
    if role not in {"admin", "surveyor", "supervisor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Survey handoff is only available for admin, surveyor, and supervisor accounts")

    email = str(profile.get("email") or user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User email is required for survey handoff")

    display_name = str(
        profile.get("full_name")
        or profile.get("fullName")
        or profile.get("name")
        or user.get("name")
        or email
    ).strip()

    # Carry over this account's own registered barangay/city so FDP can
    # auto-fill Section A's location instead of asking the person to set it
    # again in its own Settings — BIS is the authoritative source for this
    # assignment. super_admin accounts have no barangayId, so they still
    # fall back to setting it manually on the FDP side.
    barangay_id = str(profile.get("barangayId") or user.get("barangayId") or "").strip()
    municipality = None
    barangay = None
    if barangay_id:
        try:
            tenant = get_tenant(barangay_id)
            municipality = tenant.city
            barangay = tenant.barangay
        except HTTPException:
            logger.warning("⚠️ Survey handoff: barangayId %s not found for UID %s", barangay_id, uid)

    issued_at = int(time.time())
    payload = {
        "uid": uid,
        "email": email,
        "name": display_name,
        "role": role,
        "iat": issued_at,
        "exp": issued_at + 300,
    }
    if municipality and barangay:
        payload["municipality"] = municipality
        payload["barangay"] = barangay
    token = _sign_handoff_payload(payload)

    survey_base_url = _derive_survey_base_url()
    if not survey_base_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="FDP survey base URL is not configured. Set FDP_SURVEY_BASE_URL or FDP_PROVISION_URL.",
        )

    redirect_url = f"{survey_base_url}/api/internal/auth/handoff?token={quote(token, safe='')}"
    return SurveyHandoffResponse(redirectUrl=redirect_url)

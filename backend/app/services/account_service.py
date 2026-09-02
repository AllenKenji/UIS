import logging
import json
import os
from typing import Optional
from datetime import datetime, timezone
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError
from fastapi import HTTPException, status
from datetime import datetime, timezone
from backend.app.utils.firestore_utils import get_db
from backend.app.models.account import AccountCreate, AccountResponse, RoleEnum
from backend.app.core.roles import ROLE_PERMISSIONS
from backend.app.core.local_auth import create_user, delete_user

logger: logging.Logger = logging.getLogger("uvicorn.error")
CFDP_SYNC_ROLES = {"surveyor", "supervisor"}


# ===============================
# 🔧 Helpers
# ===============================
def sanitize_account_payload(data: AccountCreate, created_by: str) -> dict:
    """Prepare Firestore payload with consistent metadata."""
    return {
        "full_name": data.full_name,
        "email": data.email,
        "role": data.role.value,
        "roles": [data.role.value],
        "barangayId": data.barangayId,
        "createdBy": created_by,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }


def create_local_user(data: AccountCreate) -> str:
    """Create a local PostgreSQL user and return its UID."""
    try:
        uid = create_user(data.email, data.password, {"full_name": data.full_name, "role": data.role.value, "roles": [data.role.value], "barangayId": data.barangayId})
        logger.info("Local auth user created: %s", uid)
        return uid
    except ValueError as e:
        if "Email already" in str(e):
            logger.warning("⚠️ Email already in use: %s", data.email)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already in use. Please choose a different one.",
            )
        logger.error("Local auth creation failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create local user: {str(e)}",
        )


def set_user_claims(uid: str, role: RoleEnum):
    """Persist role and permissions in the local user profile."""
    get_db().collection("users").document(uid).update({
        "role": role.value,
        "permissions": ROLE_PERMISSIONS.get(role.value, {}),
    })


def delete_local_user(uid: str, email: Optional[str] = None):
    """Delete a local PostgreSQL user."""
    delete_user(uid)


def rollback_account_creation(uid: str):
    """Best-effort rollback when downstream provisioning fails."""
    try:
        get_db().collection("users").document(uid).delete()
    except Exception as err:
        logger.warning("⚠️ Rollback Firestore delete failed for UID %s: %s", uid, err)

    try:
        delete_user(uid)
    except Exception as err:
        logger.warning("Local auth rollback failed for UID %s: %s", uid, err)


def provision_cfdp_local_user(uid: str, data: AccountCreate):
    """Provision surveyor/supervisor credentials in CFDP local-auth system."""
    role = str(data.role.value).strip().lower()
    if role not in CFDP_SYNC_ROLES:
        return

    provision_url = os.environ.get("CFDP_PROVISION_URL", "").strip()
    provision_key = os.environ.get("CFDP_PROVISION_API_KEY", "").strip()
    strict_sync = os.environ.get("CFDP_PROVISION_REQUIRED", "false").strip().lower() in {"1", "true", "yes", "on"}

    if not provision_url or not provision_key:
        detail = "CFDP provisioning is not configured. Set CFDP_PROVISION_URL and CFDP_PROVISION_API_KEY."
        if strict_sync:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=detail,
            )

        logger.warning(
            "⚠️ %s Skipping CFDP sync for UID=%s role=%s (set CFDP_PROVISION_REQUIRED=true to enforce).",
            detail,
            uid,
            role,
        )
        return

    payload = {
        "externalId": uid,
        "name": data.full_name,
        "email": data.email,
        "password": data.password,
        "role": role,
    }

    req = urllib_request.Request(
        provision_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-BIS-Provision-Key": provision_key,
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=10) as res:
            if int(getattr(res, "status", 0)) >= 400:
                detail = f"CFDP provisioning failed with status {res.status}"
                if strict_sync:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=detail,
                    )
                logger.warning("⚠️ %s; continuing because CFDP_PROVISION_REQUIRED=false", detail)
                return
    except HTTPError as err:
        error_detail = err.read().decode("utf-8", errors="ignore") if hasattr(err, "read") else str(err)
        detail = f"CFDP provisioning failed ({err.code}): {error_detail}"
        if strict_sync:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            )
        logger.warning("⚠️ %s; continuing because CFDP_PROVISION_REQUIRED=false", detail)
        return
    except URLError as err:
        detail = f"CFDP provisioning unreachable: {err}"
        if strict_sync:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            )
        logger.warning("⚠️ %s; continuing because CFDP_PROVISION_REQUIRED=false", detail)
        return


def write_firestore_profile(uid: str, payload: dict):
    """Write user profile to PostgreSQL."""
    try:
        get_db().collection("users").document(uid).set(payload, merge=True)
        logger.info("Local profile created for UID: %s", uid)
    except Exception as e:
        logger.error("❌ Firestore write failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write user profile: {str(e)}",
        )


def delete_firestore_profile(uid: str, deleted_by: str):
    """Delete user profile from PostgreSQL and log the audit trail."""
    try:
        get_db().collection("users").document(uid).delete()
        logger.info("Local profile deleted for UID: %s", uid)

        get_db().collection("role_changes").add({
            "action": "delete",
            "target_user": uid,
            "changed_by": deleted_by,
            "timestamp": datetime.now(timezone.utc),
        })
    except Exception as e:
        logger.error("❌ Firestore deletion failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete Firestore profile: {str(e)}",
        )


def update_user_role(uid: str, new_role: RoleEnum, changed_by: str) -> AccountResponse:
    """Update a user's role in Firestore and Firebase Auth, log the change."""
    try:
        user_ref = get_db().collection("users").document(uid)
        snapshot = user_ref.get()

        if not snapshot.exists:
            logger.warning("⚠️ Tried to update role for non-existent user: %s", uid)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {uid} not found"
            )

        data = snapshot.to_dict()

        # 🔄 Update Firestore role
        user_ref.update({
            "role": new_role.value,
            "roles": list(dict.fromkeys([*(data.get("roles") or []), new_role.value])),
            "updatedAt": datetime.now(timezone.utc),
        })
        logger.info("✅ Role updated to %s for UID: %s", new_role, uid)

        # 🔐 Update Firebase Auth custom claims
        set_user_claims(uid, new_role)

        # 📝 Log role change
        get_db().collection("role_changes").add({
            "action": "update_role",
            "target_user": uid,
            "new_role": new_role.value,
            "changed_by": changed_by,
            "timestamp": datetime.now(timezone.utc),
        })

        return AccountResponse(
            uid=uid,
            email=data.get("email"),
            full_name=data.get("full_name"),
            role=new_role,
            barangayId=data.get("barangayId"),
            created_by=data.get("createdBy", changed_by),
            created_at=data.get("createdAt", datetime.now(timezone.utc)),
            updated_at=datetime.now(timezone.utc),
        )

    except Exception as e:
        logger.error("❌ Failed to update role for UID %s: %s", uid, str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update role: {str(e)}"
        )


# ===============================
# 🚀 Public Service Functions
# ===============================
async def create_barangay_account(
    data: AccountCreate,
    created_by: str,
    skip_cfdp_provision: bool = False,
) -> AccountResponse:
    """Create a Firebase Auth user, Firestore profile, and set claims."""
    uid = create_local_user(data)
    payload = sanitize_account_payload(data, created_by)

    try:
        write_firestore_profile(uid, payload)
        set_user_claims(uid, data.role)
        if not skip_cfdp_provision:
            provision_cfdp_local_user(uid, data)
    except Exception:
        rollback_account_creation(uid)
        raise

    # 📝 Log account creation in audit trail
    try:
        get_db().collection("role_changes").add({
            "action": "create",
            "target_user": uid,
            "new_role": data.role.value,
            "changed_by": created_by,
            "timestamp": datetime.now(timezone.utc),
        })
        logger.info("📝 Audit trail logged for account creation: %s", uid)
    except Exception as e:
        logger.error("❌ Failed to log account creation audit trail: %s", str(e), exc_info=True)

    return AccountResponse(
        uid=uid,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        barangayId=data.barangayId,
        created_by=created_by,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
            photo_url=None,
            roles=[data.role],
    )


async def delete_barangay_account(uid: str, deleted_by: str):
    """Delete a Firebase Auth user and Firestore profile."""
    user_doc = get_db().collection("users").document(uid).get()
    user_email = None
    if user_doc.exists:
        user_email = user_doc.to_dict().get("email")

    delete_local_user(uid, user_email)
    delete_firestore_profile(uid, deleted_by)
    return {"detail": f"Account {uid} deleted successfully"}

async def list_barangay_accounts(
        role: RoleEnum | None = None,
        limit: int = 20,
        offset: int = 0,
        order_by: str = "createdAt",
        barangay_id: str | None = None,
    ) -> list[AccountResponse]:
        """List all barangay accounts, optionally filtered by role and/or barangay."""
        try:
            query = get_db().collection("users").order_by(order_by)
            if role:
                query = query.where("role", "==", role.value)
            if barangay_id:
                query = query.where("barangayId", "==", barangay_id)
            snapshots = query.limit(limit).offset(offset).stream()

            accounts = []
            for snap in snapshots:
                data = snap.to_dict()
                try:
                    accounts.append(AccountResponse(
                        uid=snap.id,
                        email=data.get("email"),
                        full_name=data.get("full_name"),
                        role=RoleEnum(data.get("role")),
                        barangayId=data.get("barangayId"),
                        created_by=data.get("createdBy"),
                        created_at=data.get("createdAt", datetime.now(timezone.utc)),
                        updated_at=data.get("updatedAt", datetime.now(timezone.utc)),
                        photo_url=data.get("photoUrl"),
                        signature_url=data.get("signatureUrl"),
                        roles=[RoleEnum(r) for r in data.get("roles") or [data.get("role")] if r in RoleEnum._value2member_map_],
                    ))
                except ValueError:
                    # Skip legacy/non-staff accounts (e.g. resident logins) that don't fit RoleEnum
                    # rather than failing the whole listing.
                    logger.warning("⚠️ Skipping account %s with unrecognized role=%s", snap.id, data.get("role"))
            return accounts
        except Exception as e:
            logger.error("❌ Failed to list accounts: %s", str(e), exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list accounts: {str(e)}"
            )

def find_account_by_email(email: str) -> Optional[dict]:
    clean_email = email.strip().lower()
    docs = get_db().collection("users").where("email", "==", clean_email).stream()

    for doc in docs:
        return {**doc.to_dict(), "uid": doc.id}

    return None

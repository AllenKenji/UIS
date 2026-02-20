import logging
from datetime import datetime, timezone
from fastapi import HTTPException, status
from firebase_admin import auth
from firebase_admin.exceptions import FirebaseError
from firebase_admin._auth_utils import UserNotFoundError
from google.cloud import firestore

from backend.app.models.account import AccountCreate, AccountResponse, RoleEnum
from backend.app.core.roles import ROLE_PERMISSIONS
from backend.app.core.firebase import get_firestore

logger: logging.Logger = logging.getLogger("uvicorn.error")


# ===============================
# 🔧 Helpers
# ===============================
def sanitize_account_payload(data: AccountCreate, created_by: str) -> dict:
    """Prepare Firestore payload with consistent metadata."""
    return {
        "full_name": data.full_name,
        "email": data.email,
        "role": data.role.value,
        "createdBy": created_by,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }


def create_firebase_user(data: AccountCreate) -> str:
    """Create a Firebase Auth user and return UID."""
    try:
        user = auth.create_user(email=data.email, password=data.password)
        logger.info("🔐 Firebase Auth user created: %s", user.uid)
        return user.uid
    except FirebaseError as e:
        if "EMAIL_EXISTS" in str(e).upper():
            logger.warning("⚠️ Email already in use: %s", data.email)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already in use. Please choose a different one.",
            )
        logger.error("❌ Firebase Auth creation failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create Firebase user: {str(e)}",
        )


def set_user_claims(uid: str, role: RoleEnum):
    """Assign custom claims for Firestore rules enforcement."""
    try:
        permissions = ROLE_PERMISSIONS.get(str(role), {})
        auth.set_custom_user_claims(uid, {
            "role": role.value,
            "permissions": permissions
        })
        logger.info("🔐 Custom claims set for UID %s → role=%s, permissions=%s", uid, role, permissions)
    except Exception as e:
        logger.error("❌ Failed to set custom claims for UID %s: %s", uid, str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set custom claims: {str(e)}"
        )


def delete_firebase_user(uid: str):
    """Delete a Firebase Auth user by UID."""
    try:
        auth.delete_user(uid)
        logger.info("🗑️ Firebase Auth user deleted: %s", uid)
    except UserNotFoundError:
        logger.warning("⚠️ Tried to delete non-existent Firebase Auth user: %s", uid)
    except FirebaseError as e:
        logger.error("❌ Firebase Auth deletion failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete Firebase Auth user: {str(e)}",
        )


def write_firestore_profile(uid: str, payload: dict):
    """Write user profile to Firestore."""
    db = get_firestore()
    try:
        db.collection("users").document(uid).set(payload, merge=True)
        logger.info("✅ Firestore profile created for UID: %s", uid)
    except Exception as e:
        logger.error("❌ Firestore write failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write user profile: {str(e)}",
        )


def delete_firestore_profile(uid: str, deleted_by: str):
    """Delete user profile from Firestore and log audit trail."""
    db = get_firestore()
    try:
        db.collection("users").document(uid).delete()
        logger.info("🗑️ Firestore profile deleted for UID: %s", uid)

        db.collection("role_changes").add({
            "action": "delete",
            "target_user": uid,
            "changed_by": deleted_by,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
    except Exception as e:
        logger.error("❌ Firestore deletion failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete Firestore profile: {str(e)}",
        )


def update_user_role(uid: str, new_role: RoleEnum, changed_by: str) -> AccountResponse:
    """Update a user's role in Firestore and Firebase Auth, log the change."""
    db = get_firestore()
    try:
        user_ref = db.collection("users").document(uid)
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
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        logger.info("✅ Role updated to %s for UID: %s", new_role, uid)

        # 🔐 Update Firebase Auth custom claims
        set_user_claims(uid, new_role)

        # 📝 Log role change
        db.collection("role_changes").add({
            "action": "update_role",
            "target_user": uid,
            "new_role": new_role.value,
            "changed_by": changed_by,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return AccountResponse(
            uid=uid,
            email=data.get("email"),
            full_name=data.get("full_name"),
            role=new_role,
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
async def create_barangay_account(data: AccountCreate, created_by: str) -> AccountResponse:
    """Create a Firebase Auth user, Firestore profile, and set claims."""
    uid = create_firebase_user(data)
    payload = sanitize_account_payload(data, created_by)
    write_firestore_profile(uid, payload)
    set_user_claims(uid, data.role)

    # 📝 Log account creation in audit trail
    db = get_firestore()
    try:
        db.collection("role_changes").add({
            "action": "create",
            "target_user": uid,
            "new_role": data.role.value,
            "changed_by": created_by,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
        logger.info("📝 Audit trail logged for account creation: %s", uid)
    except Exception as e:
        logger.error("❌ Failed to log account creation audit trail: %s", str(e), exc_info=True)

    return AccountResponse(
        uid=uid,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        created_by=created_by,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


async def delete_barangay_account(uid: str, deleted_by: str):
    """Delete a Firebase Auth user and Firestore profile."""
    delete_firebase_user(uid)
    delete_firestore_profile(uid, deleted_by)
    return {"detail": f"Account {uid} deleted successfully"}

async def list_barangay_accounts( 
        role: RoleEnum | None = None, 
        limit: int = 20, 
        offset: int = 0, 
        order_by: str = "createdAt"
    ) -> list[AccountResponse]:
        """List all barangay accounts, optionally filtered by role."""
        db = get_firestore()
        try:
            query = db.collection("users").order_by(order_by)
            if role:
                query = query.where("role", "==", role.value)
            snapshots = query.limit(limit).offset(offset).stream()

            accounts = []
            for snap in snapshots:
                data = snap.to_dict()
                accounts.append(AccountResponse(
                    uid=snap.id,
                    email=data.get("email"),
                    full_name=data.get("full_name"),
                    role=RoleEnum(data.get("role")),
                    created_by=data.get("createdBy"),
                    created_at=data.get("createdAt", datetime.now(timezone.utc)),
                    updated_at=data.get("updatedAt", datetime.now(timezone.utc)),
                ))
            return accounts
        except Exception as e:
            logger.error("❌ Failed to list accounts: %s", str(e), exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list accounts: {str(e)}"
            )


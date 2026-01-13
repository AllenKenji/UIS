# backend/app/core/auth.py
import firebase_admin
from firebase_admin import auth, firestore
from fastapi import Depends, HTTPException, Header, status


from backend.app.core.roles import get_permissions  # 🔗 role-based fallback

# Ensure Firebase Admin is initialized once
try:
    firebase_admin.get_app()
except ValueError:
    firebase_admin.initialize_app()

# Firestore client
db = firestore.client()


def _verify_token(authorization: str) -> dict:
    """Decode and validate Firebase ID token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Bearer token"
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        return auth.verify_id_token(token)
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid ID token")
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


async def get_current_user(authorization: str = Header(...)) -> dict:
    """Return decoded token payload for the current user, resolving role from Firestore if missing."""
    decoded = _verify_token(authorization)
    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload: UID missing")

    role = decoded.get("role")

    # 🔎 Derive role if not present in claims
    if not role:
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            role = user_doc.to_dict().get("role")
        elif db.collection("residents").document(uid).get().exists:
            role = "resident"

    decoded["role"] = role
    return decoded


async def get_admin_uid(user: dict = Depends(get_current_user)) -> str:
    """Require that the user has role=admin and return UID."""
    uid = user.get("uid")
    role = user.get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return uid


def require_permission(permission: str):
    """
    Factory that returns a dependency requiring a specific permission.
    Checks explicit token claims first, then falls back to role-based permissions.
    """
    async def dependency(user: dict = Depends(get_current_user)) -> str:
        uid = user.get("uid")
        role = user.get("role")

        # Prefer explicit claims if present
        permissions = user.get("permissions")

        # ✅ Force admin/staff to always use JSON permissions
        if role in ("admin", "staff"):
            permissions = get_permissions(role)

        # ✅ Residents fallback to JSON if token has no permissions
        elif permissions is None:
            permissions = get_permissions(role)


        if not permissions.get(permission, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' required"
            )
        return uid

    return dependency

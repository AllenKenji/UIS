# backend/app/core/auth.py
import firebase_admin
from firebase_admin import auth, firestore
from fastapi import Depends, HTTPException, Header, status
from backend.app.core.roles import get_permissions
from backend.app.core.firebase import ensure_firebase_initialized  # ✅ centralized init

def get_db() -> firestore.Client:
    """Return Firestore client, ensuring Firebase is initialized."""
    ensure_firebase_initialized()
    return firestore.client()


def _verify_token(authorization: str) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Bearer token"
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        decoded = auth.verify_id_token(token)
        # Debug: log claims
        import logging
        logging.getLogger("uvicorn.error").info("✅ Token verified: %s", decoded)
        return decoded
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid ID token")
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").error("❌ Token verification failed: %s", e)
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
        db = get_db()  # ✅ ensure Firebase is initialized before using Firestore
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


def require_permission(permission: str | list[str]):
    """
    Factory that returns a dependency requiring one or more permissions.
    Accepts either a single permission string or a list of permission strings.
    """
    async def dependency(user: dict = Depends(get_current_user)) -> str:
        uid = user.get("uid")
        role = user.get("role")

        # Prefer explicit claims if present
        permissions = user.get("permissions")

        # Force certain staff roles to always use JSON permissions
        if role in ("admin", "staff", "secretary", "treasurer", "sk", "dilg"):
            permissions = get_permissions(role)

        # Residents fallback to JSON if token has no permissions
        elif permissions is None:
            permissions = get_permissions(role)

        # Handle single vs. multiple permissions
        if isinstance(permission, list):
            if not any(permissions.get(p, False) for p in permission):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"One of {permission} required"
                )
        else:
            if not permissions.get(permission, False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission '{permission}' required"
                )

        return uid

    return dependency

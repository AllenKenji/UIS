# backend/app/core/auth.py
from firebase_admin import auth, firestore
from fastapi import Depends, HTTPException, Header, status
from backend.app.core.roles import get_permissions
from backend.app.core.firebase import ensure_firebase_initialized  # ✅ centralized init
import logging

logger = logging.getLogger("uvicorn.error")

def get_db() -> firestore.Client:
    """Return Firestore client, ensuring Firebase is initialized."""
    ensure_firebase_initialized()
    return firestore.client()

def _verify_token(authorization: str) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        decoded = auth.verify_id_token(token)
        logger.info("✅ Token verified: uid=%s, role=%s, aud=%s, iss=%s",
                    decoded.get("uid"), decoded.get("role"), decoded.get("aud"), decoded.get("iss"))
        return decoded
    except Exception as e:
        # Log unverified claims for debugging
        try:
            import jwt
            unverified = jwt.decode(token, options={"verify_signature": False})
            logger.error("❌ Token verification failed: %s | Claims=%s", e, unverified)
        except Exception:
            logger.error("❌ Token verification failed: %s | Could not decode claims", e)
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

async def get_current_user(authorization: str = Header(...)) -> dict:
    """Return decoded token payload for the current user, resolving role from Firestore if missing."""
    decoded = _verify_token(authorization)
    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload: UID missing")

    role = decoded.get("role")

    logger.debug("🔍 Resolving role for uid=%s: token role=%s", uid, role)

    # 🔎 Derive role if not present in claims
    if not role:
        logger.warning("⚠️ No role claim in token for uid=%s. Falling back to Firestore.", uid)
        db = get_db()  
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            role = user_doc.to_dict().get("role")
        elif db.collection("residents").document(uid).get().exists:
            role = "resident"

    decoded["role"] = str(role or "resident").strip().lower()
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

def set_user_role(uid: str, role: str):
    auth.set_custom_user_claims(uid, {"role": role})
    return {"uid": uid, "role": role}

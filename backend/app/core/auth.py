# backend/app/core/auth.py
from fastapi import Depends, HTTPException, Header, status
from backend.app.core.roles import get_permissions
from backend.app.core.local_auth import decode_token
from backend.app.utils.firestore_utils import get_db
import logging

logger = logging.getLogger("uvicorn.error")

def _verify_token(authorization: str) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        decoded = decode_token(token)
        logger.info("Token verified: uid=%s, role=%s", decoded.get("uid"), decoded.get("role"))
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")

async def get_current_user(authorization: str = Header(...)) -> dict:
    """Return the signed local JWT payload and resolve its profile from PostgreSQL."""
    decoded = _verify_token(authorization)
    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload: UID missing")

    role = decoded.get("role")

    logger.debug("🔍 Resolving role for uid=%s: token role=%s", uid, role)

    # 🔎 Derive role if not present in claims
    if not role:
        logger.warning("No role claim in token for uid=%s. Falling back to PostgreSQL.", uid)
        db = get_db()  
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            role = user_doc.to_dict().get("role")
        elif db.collection("residents").document(uid).get().exists:
            role = "resident"

    decoded["role"] = str(role or "resident").strip().lower()
    decoded.setdefault("barangayId", None)
    return decoded


async def get_admin_uid(user: dict = Depends(get_current_user)) -> str:
    """Require that the user has role=admin or super_admin, and return UID."""
    uid = user.get("uid")
    role = user.get("role")
    if role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return uid


async def get_super_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require that the user has role=super_admin."""
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


def resolve_tenant_scope(user: dict, explicit_barangay_id: str | None = None) -> str | None:
    """
    Returns the barangayId a request should be scoped to.
    - super_admin: `explicit_barangay_id` (to drill into one tenant) or None (see all).
    - everyone else: always their own barangayId, regardless of any client-supplied value.
    """
    if user.get("role") == "super_admin":
        return explicit_barangay_id or None

    barangay_id = user.get("barangayId")
    if not barangay_id:
        raise HTTPException(status_code=403, detail="Account is not assigned to a barangay")
    return barangay_id


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
        if role in ("admin", "staff", "secretary", "treasurer", "sk", "dilg", "super_admin"):
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
    get_db().collection("users").document(uid).update({"role": role})
    return {"uid": uid, "role": role}

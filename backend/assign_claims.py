import logging
import os
import sys
import argparse
from firebase_admin import auth
from backend.app.core.roles import ROLE_PERMISSIONS
from backend.app.core.firebase import ensure_firebase_initialized, get_firestore  # ✅ centralized helpers

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)
logger = logging.getLogger("uvicorn.error")


def assign_role_claims(dry_run: bool = False,
                       filter_role: str = None,
                       filter_uid: str = None):
    """Assign custom claims to users based on their role."""
    ensure_firebase_initialized()
    db = get_firestore()

    users_ref = db.collection("users")
    docs = users_ref.stream()

    updated, skipped, failed = 0, 0, 0
    role_counts = {}

    for doc in docs:
        uid = doc.id
        data = doc.to_dict()
        role = (data.get("role") or "").strip().lower()

        logger.debug("📄 Firestore doc for UID %s: %s", uid, data)

        if not role:
            logger.warning("⚠️ No role found for UID: %s", uid)
            skipped += 1
            continue

        if filter_role and role != filter_role.lower():
            skipped += 1
            continue

        if filter_uid and uid != filter_uid:
            skipped += 1
            continue

        permissions = ROLE_PERMISSIONS.get(role)
        if not permissions:
            logger.warning("⚠️ Unknown role '%s' for UID: %s", role, uid)
            skipped += 1
            continue

        role_counts[role] = role_counts.get(role, 0) + 1

        try:
            current_claims = auth.get_user(uid).custom_claims or {}
            desired_claims = {"role": role, "permissions": permissions}

            if (current_claims.get("role") == role and
                    current_claims.get("permissions") == permissions):
                logger.info("⏩ Claims already correct for UID: %s", uid)
                skipped += 1
                continue

            if dry_run:
                logger.info("🔍 Dry run: would set claims for UID: %s", uid)
            else:
                auth.set_custom_user_claims(uid, desired_claims)
                logger.info("✅ Claims set for UID: %s (role=%s)", uid, role)

            updated += 1

        except Exception as e:
            logger.error("❌ Failed to set claims for UID %s: %s", uid, str(e))
            failed += 1

    logger.info("📊 Roles processed: %s", role_counts)
    logger.info("🔄 Sync complete: %s updated, %s skipped, %s failed.",
                updated, skipped, failed)

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync Firebase custom claims with Firestore roles")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")
    parser.add_argument("--filter-role", type=str, help="Only process users with this role")
    parser.add_argument("--filter-uid", type=str, help="Only process this specific UID")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    if args.debug:
        logger.setLevel(logging.DEBUG)

    assign_role_claims(
        dry_run=args.dry_run,
        filter_role=args.filter_role,
        filter_uid=args.filter_uid
    )

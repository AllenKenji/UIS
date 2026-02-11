import logging
import sys
from firebase_admin import auth
from backend.app.core.roles import ROLE_PERMISSIONS
from backend.app.core.firebase import ensure_firebase_initialized, get_firestore  # ✅ centralized helpers

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("uvicorn.error")


def backfill_resident_claims():
    """Assign resident claims to all existing residents in Firestore."""
    ensure_firebase_initialized()
    db = get_firestore()

    residents_ref = db.collection("residents")
    docs = residents_ref.stream()

    updated, failed = 0, 0
    for doc in docs:
        data = doc.to_dict()
        uid = doc.id  # resident doc ID is the auth UID

        try:
            auth.set_custom_user_claims(uid, {
                "role": "resident",
                "permissions": ROLE_PERMISSIONS["resident"]
            })
            logger.info("✅ Claims set for resident UID %s (%s)", uid, data.get("fullName"))
            updated += 1
        except Exception as e:
            logger.error("❌ Failed to set claims for UID %s: %s", uid, str(e))
            failed += 1

    logger.info("🔄 Backfill complete: %s updated, %s failed", updated, failed)
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    backfill_resident_claims()

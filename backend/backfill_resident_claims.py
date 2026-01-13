import logging
import os
import sys
import firebase_admin
from firebase_admin import auth, credentials
from google.cloud import firestore

from backend.app.core.roles import ROLE_PERMISSIONS

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("uvicorn.error")

def ensure_firebase_initialized():
    """Initialize Firebase app if not already initialized."""
    try:
        firebase_admin.get_app()
    except ValueError:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not cred_path or not os.path.exists(cred_path):
            logger.error("❌ Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path")
            sys.exit(2)
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        logger.info("✅ Firebase initialized with %s", cred_path)

def backfill_resident_claims():
    """Assign resident claims to all existing residents in Firestore."""
    ensure_firebase_initialized()
    db = firestore.Client()

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

if __name__ == "__main__":
    backfill_resident_claims()

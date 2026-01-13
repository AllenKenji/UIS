import firebase_admin
from firebase_admin import credentials, firestore, storage
import os
import logging

logger = logging.getLogger("uvicorn.error")

def ensure_firebase_initialized():
    """
    Ensure Firebase Admin SDK is initialized once.
    Uses GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_STORAGE_BUCKET env vars.
    """
    try:
        firebase_admin.get_app()
    except ValueError:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "serviceAccountKey.json")
        if not os.path.exists(cred_path):
            raise FileNotFoundError(f"❌ Firebase service account not found at: {cred_path}")

        logger.info("🔍 Firebase key path: %s", cred_path)
        cred = credentials.Certificate(cred_path)

        bucket = os.environ.get("FIREBASE_STORAGE_BUCKET")
        if not bucket:
            raise RuntimeError("❌ FIREBASE_STORAGE_BUCKET environment variable is not set")

        firebase_admin.initialize_app(cred, {"storageBucket": bucket})
        logger.info("✅ Firebase initialized successfully with bucket: %s", bucket)


def get_firestore():
    """Return Firestore client, ensuring Firebase is initialized."""
    ensure_firebase_initialized()
    return firestore.client()


def get_storage_bucket():
    """Return Storage bucket, ensuring Firebase is initialized."""
    ensure_firebase_initialized()
    return storage.bucket()


def upload_file(file_obj, path: str) -> str:
    """
    Upload a FastAPI UploadFile to Firebase Storage and return its public URL.
    Note: Firestore/Storage clients are synchronous, so wrap calls in run_in_threadpool if used in async routes.
    """
    try:
        bucket = get_storage_bucket()
        blob = bucket.blob(path)

        # Reset file pointer before upload
        file_obj.file.seek(0)

        # Use UploadFile.content_type if available, fallback to generic binary
        content_type = getattr(file_obj, "content_type", "application/octet-stream")

        blob.upload_from_file(file_obj.file, content_type=content_type)
        blob.make_public()

        logger.info("📤 Uploaded file %s to %s", file_obj.filename, blob.public_url)
        return blob.public_url
    except Exception as e:
        logger.exception("❌ Failed to upload file %s: %s", getattr(file_obj, "filename", "unknown"), e)
        raise

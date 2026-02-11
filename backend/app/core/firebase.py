import os
import logging
import firebase_admin
from firebase_admin import credentials, firestore, storage

logger = logging.getLogger("uvicorn.error")


def ensure_firebase_initialized() -> firebase_admin.App:
    """
    Ensure Firebase Admin SDK is initialized once.
    Uses GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_STORAGE_BUCKET env vars.
    Returns the Firebase app instance.
    """
    try:
        app = firebase_admin.get_app()
        logger.debug("ℹ️ Firebase already initialized. Options: %s", app.options.__dict__)
        return app
    except ValueError:
        # First-time initialization
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "serviceAccountKey.json")
        if not os.path.exists(cred_path):
            raise FileNotFoundError(f"❌ Firebase service account not found at: {cred_path}")

        bucket = os.environ.get("FIREBASE_STORAGE_BUCKET")
        if not bucket:
            raise RuntimeError("❌ FIREBASE_STORAGE_BUCKET environment variable is not set")

        logger.info("🔍 Firebase key path: %s", cred_path)
        logger.info("🔥 FIREBASE_STORAGE_BUCKET value: %s", bucket)

        cred = credentials.Certificate(cred_path)
        app = firebase_admin.initialize_app(cred, {"storageBucket": bucket})

        logger.info("✅ Firebase initialized successfully with bucket: %s", bucket)
        logger.debug("🔧 Firebase options: %s", app.options.__dict__)
        return app


def get_firestore() -> firestore.Client:
    """Return Firestore client, ensuring Firebase is initialized."""
    ensure_firebase_initialized()
    return firestore.client()


def get_storage_bucket() -> storage.bucket.Bucket:
    """Return Storage bucket, ensuring Firebase is initialized."""
    app = ensure_firebase_initialized()
    bucket_name = app.options.get("storageBucket")
    if not bucket_name:
        raise RuntimeError("❌ Firebase app has no storageBucket configured")
    return storage.bucket(bucket_name)


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

        logger.info("📤 Uploaded file %s → %s", getattr(file_obj, "filename", "<unknown>"), blob.public_url)
        return blob.public_url
    except Exception as e:
        logger.exception("❌ Failed to upload file %s: %s", getattr(file_obj, "filename", "<unknown>"), e)
        raise

import os, logging, json, firebase_admin
from firebase_admin import credentials, firestore, storage
from google.cloud.storage.bucket import Bucket
from google.cloud import exceptions
from datetime import timedelta

logger = logging.getLogger("uvicorn.error")


def ensure_firebase_initialized() -> firebase_admin.App:
    try:
        app = firebase_admin.get_app()
        logger.debug("ℹ️ Firebase already initialized. Options: %s", app.options.__dict__)
        return app
    except ValueError:
        bucket = os.environ.get("FIREBASE_STORAGE_BUCKET")
        if not bucket:
            raise RuntimeError("❌ FIREBASE_STORAGE_BUCKET environment variable is not set")

        # Case 1: Service account JSON injected directly into env var
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if service_account_json:
            logger.info("🔑 Using service account JSON from FIREBASE_SERVICE_ACCOUNT env var")
            cred = credentials.Certificate(json.loads(service_account_json))
            app = firebase_admin.initialize_app(cred, {"storageBucket": bucket})
        else:
            # Case 2: Fallback to GOOGLE_APPLICATION_CREDENTIALS file path (local dev)
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                logger.info("🔍 Using service account key at: %s", cred_path)
                cred = credentials.Certificate(cred_path)
                app = firebase_admin.initialize_app(cred, {"storageBucket": bucket})
            else:
                logger.info("🔑 Using default application credentials")
                app = firebase_admin.initialize_app(options={"storageBucket": bucket})

        logger.info("✅ Firebase initialized successfully with bucket: %s", bucket)
        return app


def get_firestore() -> firestore.Client:
    ensure_firebase_initialized()
    return firestore.client()


def get_storage_bucket() -> Bucket:
    app = ensure_firebase_initialized()
    bucket_name = app.options.get("storageBucket")
    logger.info("🔍 Firebase app storageBucket option = %s", bucket_name)
    logger.info("🔍 Bucket repr = %r", bucket_name)
    if not bucket_name:
        raise RuntimeError("❌ Firebase app has no storageBucket configured")
    return storage.bucket(bucket_name)


def upload_file(file_obj, path: str, public: bool = True) -> dict:
    bucket = get_storage_bucket()
    blob = bucket.blob(path)

    try:
        file_obj.file.seek(0)
        content_type = getattr(file_obj, "content_type", "application/octet-stream")
        blob.upload_from_file(file_obj.file, content_type=content_type)

        if public:
            blob.make_public()
            url = blob.public_url
        else:
            url = blob.generate_signed_url(expiration=timedelta(hours=24))

        logger.info("📤 Uploaded file %s → %s", getattr(file_obj, "filename", "<unknown>"), url)
        return {"url": url, "path": path}

    except exceptions.GoogleCloudError as gce:
        logger.error("❌ Google Cloud error uploading file %s: %s", getattr(file_obj, "filename", "<unknown>"), gce)
        raise RuntimeError("File upload failed") from gce
    except Exception as e:
        logger.exception("❌ Unexpected error uploading file %s: %s", getattr(file_obj, "filename", "<unknown>"), e)
        raise RuntimeError("File upload failed") from e


def delete_file(path: str) -> None:
    bucket = get_storage_bucket()
    blob = bucket.blob(path)

    try:
        blob.delete()
        logger.info("🗑️ Deleted file at path=%s", path)
    except exceptions.NotFound:
        logger.warning("⚠️ File not found in storage: %s", path)
    except exceptions.GoogleCloudError as gce:
        logger.error("❌ Google Cloud error deleting file %s: %s", path, gce)
        raise RuntimeError("File deletion failed") from gce
    except Exception as e:
        logger.exception("❌ Unexpected error deleting file %s: %s", path, e)
        raise RuntimeError("File deletion failed") from e

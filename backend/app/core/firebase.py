import os, logging, json, firebase_admin
from pathlib import Path
from firebase_admin import credentials, firestore, storage
from google.cloud.storage.bucket import Bucket
from google.cloud import exceptions
from datetime import timedelta
from urllib.parse import quote
from uuid import uuid4

logger = logging.getLogger("uvicorn.error")


def _infer_project_id(bucket: str, service_account_data: dict | None = None) -> str | None:
    """Resolve Firebase project ID from env, service account JSON, or bucket name."""
    env_project_id = (
        os.environ.get("FIREBASE_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
    )
    if env_project_id:
        return env_project_id.strip()

    if service_account_data and service_account_data.get("project_id"):
        return str(service_account_data["project_id"]).strip()

    # Common Firebase buckets: <project-id>.appspot.com or <project-id>.firebasestorage.app
    if bucket and "." in bucket:
        return bucket.split(".", 1)[0].strip()

    return None


def ensure_firebase_initialized() -> firebase_admin.App:
    try:
        app = firebase_admin.get_app()
        logger.debug("ℹ️ Firebase already initialized. Options: %s", app.options.__dict__)
        return app
    except ValueError:
        bucket = os.environ.get("FIREBASE_STORAGE_BUCKET")
        if not bucket:
            raise RuntimeError("❌ FIREBASE_STORAGE_BUCKET environment variable is not set")

        service_account_data = None
        project_id = None

        # Case 1: Service account JSON injected directly into env var
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if service_account_json:
            logger.info("🔑 Using service account JSON from FIREBASE_SERVICE_ACCOUNT env var")
            service_account_data = json.loads(service_account_json)
            project_id = _infer_project_id(bucket=bucket, service_account_data=service_account_data)
            cred = credentials.Certificate(service_account_data)
            init_options = {"storageBucket": bucket}
            if project_id:
                init_options["projectId"] = project_id
            app = firebase_admin.initialize_app(cred, init_options)
        else:
            # Case 2: GOOGLE_APPLICATION_CREDENTIALS path (or local fallback in backend folder)
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            local_fallback_path = Path(__file__).resolve().parents[2] / "serviceAccountKey.json"

            if cred_path and not os.path.exists(cred_path):
                logger.warning(
                    "⚠️ GOOGLE_APPLICATION_CREDENTIALS points to a missing file: %s. Falling back.",
                    cred_path,
                )
                # Prevent ADC from reusing invalid path.
                os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
                cred_path = None

            if not cred_path and local_fallback_path.exists():
                cred_path = str(local_fallback_path)
                logger.info("🔍 Using local fallback service account key at: %s", cred_path)

            if cred_path and os.path.exists(cred_path):
                logger.info("🔍 Using service account key at: %s", cred_path)
                with open(cred_path, "r", encoding="utf-8") as f:
                    service_account_data = json.load(f)
                project_id = _infer_project_id(bucket=bucket, service_account_data=service_account_data)
                cred = credentials.Certificate(service_account_data)
                init_options = {"storageBucket": bucket}
                if project_id:
                    init_options["projectId"] = project_id
                app = firebase_admin.initialize_app(cred, init_options)
            else:
                logger.info("🔑 Using default application credentials")
                project_id = _infer_project_id(bucket=bucket)
                init_options = {"storageBucket": bucket}
                if project_id:
                    init_options["projectId"] = project_id
                app = firebase_admin.initialize_app(options=init_options)

        if project_id and not os.environ.get("GOOGLE_CLOUD_PROJECT"):
            os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
            logger.info("ℹ️ Set GOOGLE_CLOUD_PROJECT=%s for Firebase Admin token verification", project_id)

        logger.info("✅ Firebase initialized successfully with bucket=%s project_id=%s", bucket, project_id)
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

        download_token = None
        if public:
            download_token = str(uuid4())
            blob.metadata = {
                "firebaseStorageDownloadTokens": download_token,
            }

        blob.upload_from_file(file_obj.file, content_type=content_type)

        if public:
            encoded_path = quote(path, safe="")
            url = (
                f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/"
                f"{encoded_path}?alt=media&token={download_token}"
            )
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

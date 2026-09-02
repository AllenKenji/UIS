"""Local filesystem storage for uploaded BIS documents."""
from backend.app.core.postgres_store import LocalStorage, get_database, initialize_database


def upload_file(file_obj, path: str, public: bool = True) -> dict:
    blob = LocalStorage().blob(path)
    file_obj.file.seek(0)
    blob.upload_from_file(file_obj.file, content_type=getattr(file_obj, "content_type", None))
    return {"url": blob.generate_signed_url(), "path": path}


def delete_file(path: str) -> None:
    LocalStorage().blob(path).delete()
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.app.core.auth import get_current_user
from backend.app.core.local_storage import LocalStorage

router = APIRouter(prefix="/storage", tags=["Storage"])


def _safe_path(value: str) -> str:
    path = PurePosixPath(value.replace("\\", "/"))
    if not value or path.is_absolute() or ".." in path.parts:
        raise HTTPException(status_code=400, detail="Invalid storage path")
    return str(path)


@router.post("/upload")
async def upload_storage_file(
    uid: str = Form(...),
    path: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if user.get("uid") != uid and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="You may only upload files for your account")

    safe_path = _safe_path(path)
    filename = PurePosixPath(file.filename or "upload").name
    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid file name")

    storage_path = f"{safe_path}/{filename}"
    blob = LocalStorage().blob(storage_path)
    blob.upload_from_file(file.file, content_type=file.content_type)
    return {"url": blob.generate_signed_url(), "path": storage_path}

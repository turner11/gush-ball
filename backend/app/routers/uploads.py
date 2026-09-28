from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.deps import require_admin
from app.storage import upload_file

router = APIRouter(tags=["uploads"])

RequireAdmin = Annotated[int, Depends(require_admin)]

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


class UploadOut(BaseModel):
    url: str


@router.post("/uploads", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
async def create_upload(_admin_id: RequireAdmin, file: Annotated[UploadFile, File()]) -> UploadOut:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported content type: {file.content_type}",
        )

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File exceeds maximum upload size of 10 MB",
        )

    url = upload_file(data, file.filename or "", file.content_type)
    return UploadOut(url=url)

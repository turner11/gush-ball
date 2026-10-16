from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.deps import DbSession, RequireUploader, is_admin
from app.models import AdminUser
from app.routers.auth import _reserve_attempt
from app.storage import EXTENSION_BY_CONTENT_TYPE, upload_file

router = APIRouter(tags=["uploads"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


class UploadOut(BaseModel):
    url: str


def _throttled_uploader(user: RequireUploader, db: DbSession) -> AdminUser:
    if not is_admin(db, user):  # admins upload whole galleries
        _reserve_attempt([f"upload:{user.id}"])
    return user


@router.post("/uploads", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
async def create_upload(_user: Annotated[AdminUser, Depends(_throttled_uploader)], file: Annotated[UploadFile, File()]) -> UploadOut:
    if file.content_type not in EXTENSION_BY_CONTENT_TYPE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported content type: {file.content_type}",
        )

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File exceeds maximum upload size of 10 MB",
        )

    url = upload_file(data, file.content_type)
    return UploadOut(url=url)

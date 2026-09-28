from pathlib import PurePosixPath
from uuid import uuid4

import boto3
from fastapi import HTTPException, status

from app.config import settings


def upload_file(data: bytes, filename: str, content_type: str) -> str:
    """Upload bytes to object storage under a random key, return the public URL."""
    extension = PurePosixPath(filename).suffix
    key = f"{uuid4().hex}{extension}"

    try:
        client = boto3.client(
            "s3",
            endpoint_url=settings.object_storage_endpoint_url,
            aws_access_key_id=settings.object_storage_access_key_id,
            aws_secret_access_key=settings.object_storage_secret_access_key,
            region_name=settings.object_storage_region,
        )
        client.put_object(
            Bucket=settings.object_storage_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except Exception as exc:
        # ponytail: catches any boto3/config failure (e.g. empty-string local-dev defaults
        # raising ValueError on an invalid endpoint) so /uploads returns a clean 5xx instead of
        # a raw stack trace. Narrow to specific boto3 exceptions if that ever matters.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Object storage is not configured correctly; upload failed.",
        ) from exc

    return f"{settings.object_storage_public_url}/{key}"

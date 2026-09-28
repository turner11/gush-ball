from pathlib import PurePosixPath
from uuid import uuid4

import boto3

from app.config import settings


def upload_file(data: bytes, filename: str, content_type: str) -> str:
    """Upload bytes to object storage under a random key, return the public URL."""
    extension = PurePosixPath(filename).suffix
    key = f"{uuid4().hex}{extension}"

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
    return f"{settings.object_storage_public_url}/{key}"

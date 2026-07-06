"""S3-compatible attachment storage (MinIO in prod; any S3 endpoint works).

Attachments are uploaded during sync keyed by their Attachment.id and
streamed back through the download endpoint — the bucket is never public.
When S3_ENDPOINT is unset the app runs without a storage layer and the
download endpoint falls back to on-demand IMAP fetches.
"""

import logging
from functools import lru_cache

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from ..config import settings

logger = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(settings.s3_endpoint and settings.s3_access_key)


@lru_cache(maxsize=1)
def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=BotoConfig(signature_version="s3v4",
                          s3={"addressing_style": "path"}),
    )


def ensure_bucket() -> None:
    if not enabled():
        logger.info("Attachment storage disabled (S3_ENDPOINT not set)")
        return
    try:
        _client().head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        _client().create_bucket(Bucket=settings.s3_bucket)
        logger.info("Created attachment bucket %s", settings.s3_bucket)


def put(key: str, data: bytes, content_type: str | None) -> None:
    _client().put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type or "application/octet-stream",
    )


def get(key: str):
    """Return (botocore StreamingBody, size) for a stored object."""
    obj = _client().get_object(Bucket=settings.s3_bucket, Key=key)
    return obj["Body"], obj["ContentLength"]


def delete_many(keys: list[str]) -> None:
    client = _client()
    for i in range(0, len(keys), 1000):
        client.delete_objects(
            Bucket=settings.s3_bucket,
            Delete={"Objects": [{"Key": k} for k in keys[i:i + 1000]],
                    "Quiet": True},
        )

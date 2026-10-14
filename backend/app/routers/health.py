from fastapi import APIRouter

from app.deps import RequireAdmin

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/sentry-test")
def sentry_test(_: RequireAdmin) -> None:
    """Full-admin-only trigger to verify Sentry setup (#331)."""
    raise RuntimeError("Sentry backend test error")

"""Manual "sync now" trigger for the two scrapers. See GitHub issue #17.

Both scrapers sleep CRAWL_DELAY (10s) per HTTP request, so a full sync can take minutes --
too long for a synchronous request. The endpoint returns immediately and runs the scrape in
a FastAPI BackgroundTask, guarded by a module-level boolean against overlapping runs. The
backend runs a single uvicorn worker (see backend/Dockerfile), and `sync_now` below is
`async def` with no `await` before it sets `_running = True` -- so the check-then-set runs
as one atomic step on the single event loop. That's what makes the module-level boolean a
correct overlap guard rather than just a lazy one: a plain `def` endpoint would run in
Starlette's threadpool executor, where two near-simultaneous requests could both pass the
`if _running` check before either sets it. See the issue #17 plan for the full rationale.
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel

from app.db import SessionLocal
from app.deps import RequireAdmin
from app.scrape import sync_all

router = APIRouter(prefix="/sync", tags=["sync"])

_running = False


class SyncOut(BaseModel):
    status: str


def _run_sync() -> None:
    global _running
    try:
        # Background tasks run after the request's own `Depends(get_db)` session may already
        # be closed, so open a fresh one here -- same pattern as the scrapers' own __main__ blocks.
        with SessionLocal() as db:
            sync_all(db)
    finally:
        _running = False


@router.post("/now", response_model=SyncOut, status_code=status.HTTP_202_ACCEPTED)
async def sync_now(_admin_id: RequireAdmin, background_tasks: BackgroundTasks) -> SyncOut:
    global _running
    if _running:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync already running")

    _running = True
    background_tasks.add_task(_run_sync)
    return SyncOut(status="started")

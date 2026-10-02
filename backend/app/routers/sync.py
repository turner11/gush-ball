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

import logging
import time
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field

from app.db import SessionLocal
from app.deps import RequireAnyAdmin, check_team_scope
from app.scrape import KINDS, sync_all

log = logging.getLogger(__name__)
router = APIRouter(prefix="/sync", tags=["sync"])

_running = False
# ponytail: in-memory last-run result, lost on restart; persist if history is ever wanted.
_last: dict[str, Any] | None = None


class SyncIn(BaseModel):
    team_ids: list[int] | None = Field(None, min_length=1)  # None = all teams
    kinds: set[Literal["standings", "games", "players"]] = Field(default_factory=lambda: set(KINDS), min_length=1)
    auto_accept: bool = True


class SyncOut(BaseModel):
    status: str


class SyncStatusOut(BaseModel):
    running: bool
    finished_at: datetime | None = None
    elapsed_seconds: int | None = None
    standings: int | None = None
    games: int | None = None
    players: int | None = None
    errors: list[str] = []
    failed: bool = False


def _run_sync(team_ids: list[int] | None, kinds: set[str], auto_accept: bool) -> None:
    global _running, _last
    log.info("Sync started")
    started = time.monotonic()
    try:
        # Background tasks run after the request's own `Depends(get_db)` session may already
        # be closed, so open a fresh one here -- same pattern as the scrapers' own __main__ blocks.
        with SessionLocal() as db:
            result = {**sync_all(db, team_ids, kinds, auto_accept), "failed": False}
        _last = {**result, "finished_at": datetime.now(UTC), "elapsed_seconds": round(time.monotonic() - started)}
    except Exception as exc:
        log.exception("Sync crashed")
        _last = {
            "errors": [str(exc)],
            "failed": True,
            "finished_at": datetime.now(UTC),
            "elapsed_seconds": round(time.monotonic() - started),
        }
    finally:
        _running = False


@router.post("/now", response_model=SyncOut, status_code=status.HTTP_202_ACCEPTED)
# ponytail: the overlap guard and last-run status stay global across teams; make them per-team if that hurts.
async def sync_now(
    admin: RequireAnyAdmin, background_tasks: BackgroundTasks, payload: SyncIn | None = None
) -> SyncOut:
    global _running
    payload = payload or SyncIn()
    team_ids = payload.team_ids
    if admin.team_id is not None:
        team_ids = team_ids or [admin.team_id]
        for team_id in team_ids:
            check_team_scope(admin, team_id)
    if _running:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync already running")

    _running = True
    background_tasks.add_task(_run_sync, team_ids, payload.kinds, payload.auto_accept)
    return SyncOut(status="started")


@router.get("/status", response_model=SyncStatusOut)
async def sync_status(_admin: RequireAnyAdmin) -> SyncStatusOut:
    return SyncStatusOut(running=_running, **(_last or {}))

"""Manual "sync now" trigger for the two scrapers. See GitHub issue #17.

Both scrapers sleep CRAWL_DELAY (10s) per HTTP request, so a full sync can take minutes --
too long for a synchronous request. The endpoint returns immediately and runs the scrape in
a FastAPI BackgroundTask, guarded by a module-level boolean against overlapping runs. The
backend runs a single uvicorn worker (see backend/Dockerfile), and `sync_now` below is
`async def` with no `await` before it sets `_running = True` -- so the check-then-set runs
as one atomic step on the single event loop. That's what makes the module-level boolean a
correct overlap guard rather than just a lazy one: a plain `def` endpoint would run in
Starlette's threadpool executor, where two near-simultaneous requests could both pass the
`if _running` check before either sets it. See the issue #17 plan for the full rationale. `start_sync` is also
called from plain `def` endpoints (an approved team request, #351), so its check-and-set takes a lock.
"""

import logging
import threading
import time
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update

from app.db import SessionLocal
from app.deps import DbSession, RequireAnyAdmin, admin_team_ids, check_team_scope
from app.models import League, Team
from app.scrape import KINDS, THIN_KINDS, league_team_ids, sync_all

log = logging.getLogger(__name__)
router = APIRouter(prefix="/sync", tags=["sync"])

_running = False
_start_lock = threading.Lock()
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


class SyncFailureOut(BaseModel):
    team_id: int
    team_name: str
    message: str
    failed_at: datetime


def _run_sync(team_ids: list[int] | None, kinds: set[str], auto_accept: bool) -> None:
    global _running, _last
    log.info("Sync started")
    started = time.monotonic()
    try:
        # Background tasks run after the request's own `Depends(get_db)` session may already
        # be closed, so open a fresh one here -- same pattern as the scrapers' own __main__ blocks.
        with SessionLocal() as db:
            result = {**sync_all(db, team_ids, kinds, auto_accept), "failed": False}
        _last = {
            **result,
            "team_ids": team_ids,
            "finished_at": datetime.now(UTC),
            "elapsed_seconds": round(time.monotonic() - started),
        }
    except Exception as exc:
        log.exception("Sync crashed")
        _last = {
            "team_ids": team_ids,
            "errors": [str(exc)],
            "failed": True,
            "finished_at": datetime.now(UTC),
            "elapsed_seconds": round(time.monotonic() - started),
        }
    finally:
        _running = False


def start_sync(
    background_tasks: BackgroundTasks, team_ids: list[int] | None, kinds: Iterable[str] = KINDS, auto_accept: bool = True
) -> bool:
    """Queues a background sync; False (nothing queued) when a run is already going."""
    global _running
    with _start_lock:
        if _running:
            return False
        _running = True
    background_tasks.add_task(_run_sync, team_ids, set(kinds), auto_accept)
    return True


@router.post("/now", response_model=SyncOut, status_code=status.HTTP_202_ACCEPTED)
# ponytail: the overlap guard and last-run status stay global across teams (status is hidden from
# admins whose scope doesn't cover the run); make them per-team if that hurts.
async def sync_now(
    admin: RequireAnyAdmin, db: DbSession, background_tasks: BackgroundTasks, payload: SyncIn | None = None
) -> SyncOut:
    payload = payload or SyncIn()
    team_ids = payload.team_ids
    scope = admin_team_ids(db, admin)
    if scope is not None:
        team_ids = team_ids or scope
        denied = sorted(set(team_ids) - set(scope))
        if denied:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"Not allowed for team(s) {denied}")
    if not start_sync(background_tasks, team_ids, payload.kinds, payload.auto_accept):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync already running")
    return SyncOut(status="started")


@router.post("/league/{league_id}", response_model=SyncOut, status_code=status.HTTP_202_ACCEPTED)
async def sync_league(
    league_id: int, admin: RequireAnyAdmin, db: DbSession, background_tasks: BackgroundTasks
) -> SyncOut:
    """Thin run (games + standings) for one league's teams, narrowed to the admin's scope."""
    league = db.scalar(select(League).where(League.ibasketball_id == league_id))
    if league is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"League {league_id} not found")
    team_ids = league_team_ids(db, league.url)
    scope = admin_team_ids(db, admin)
    if scope is not None:
        team_ids = [t for t in team_ids if t in scope]
    if not team_ids and scope is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"Not allowed for league {league_id}")
    if not team_ids:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"League {league_id} has no teams with an ibasketball team url"
        )
    if not start_sync(background_tasks, team_ids, THIN_KINDS, auto_accept=True):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync already running")
    return SyncOut(status="started")


@router.get("/status", response_model=SyncStatusOut)
async def sync_status(admin: RequireAnyAdmin, db: DbSession) -> SyncStatusOut:
    scope = admin_team_ids(db, admin)
    # Fail closed: a scoped admin only sees a run whose teams are all inside their scope (None = all teams).
    if (
        scope is not None
        and _last
        and (_last["team_ids"] is None or not set(_last["team_ids"]) <= set(scope))
    ):
        return SyncStatusOut(running=_running)
    return SyncStatusOut(running=_running, **(_last or {}))


@router.get("/failures", response_model=list[SyncFailureOut])
def list_failures(admin: RequireAnyAdmin, db: DbSession) -> list[SyncFailureOut]:
    """Teams whose latest scrape failed and was not yet dismissed, narrowed to the admin's scope."""
    query = select(Team).where(Team.sync_error.is_not(None)).order_by(Team.sync_error_at.desc())
    scope = admin_team_ids(db, admin)
    if scope is not None:
        query = query.where(Team.id.in_(scope))
    return [
        SyncFailureOut(team_id=t.id, team_name=t.name, message=t.sync_error, failed_at=t.sync_error_at)
        for t in db.scalars(query)
    ]


@router.delete("/failures/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_failure(team_id: int, admin: RequireAnyAdmin, db: DbSession) -> None:
    """Shared dismissal: clears the note for every admin. Idempotent. Core update keeps it out of the audit log."""
    check_team_scope(db, admin, team_id)
    db.execute(update(Team).where(Team.id == team_id).values(sync_error=None, sync_error_at=None))
    db.commit()

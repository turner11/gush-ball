import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.monitoring import init_sentry
from app.routers import (
    audit,
    auth,
    calendar,
    clubs,
    content,
    favorites,
    games,
    health,
    leagues,
    lineups,
    memberships,
    players,
    practices,
    seo,
    standings,
    sync,
    team_requests,
    teams,
    uploads,
    users,
)

# uvicorn does not configure the root logger; without this app.* INFO records are dropped.
logging.basicConfig(level=logging.INFO)
init_sentry()

app = FastAPI(title="Gush Ball API", openapi_url="/openapi.json" if settings.enable_docs else None)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    max_age=12 * 60 * 60,
    https_only=settings.public_url.startswith("https://"),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(calendar.router)
app.include_router(clubs.router)
app.include_router(content.router)
app.include_router(audit.router)
app.include_router(favorites.router)
app.include_router(games.router)
app.include_router(games.club_router)
app.include_router(leagues.router)
app.include_router(lineups.router)
app.include_router(memberships.router)
app.include_router(players.router)
app.include_router(practices.router)
app.include_router(seo.router)
app.include_router(standings.router)
app.include_router(sync.router)
app.include_router(team_requests.router)
app.include_router(teams.router)
app.include_router(uploads.router)
app.include_router(users.router)

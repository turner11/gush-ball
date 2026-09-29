from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routers import auth, content, games, health, players, standings, sync, teams, uploads

app = FastAPI(title="Gush Ball API", openapi_url="/openapi.json" if settings.enable_docs else None)

app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(content.router)
app.include_router(games.router)
app.include_router(players.router)
app.include_router(standings.router)
app.include_router(sync.router)
app.include_router(teams.router)
app.include_router(uploads.router)

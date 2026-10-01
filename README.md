# Gush Ball

Website for the club: team pages, schedule/standings, scores, and (later) stats — scraped from
[ibasketball.co.il](https://ibasketball.co.il) with admin review, plus manual admin management.

## Stack

- **Backend**: Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL
- **Frontend**: Vue 3 (JS, not TS), Vite, Tailwind CSS v4, Vue Router
- **Auth**: full admin or single-team admin (`team_id` scope), session cookie (no fan/player accounts)

## Local setup

Clone with `git clone --recursive` (or run `git submodule update --init` in an existing clone) —
the statistics base, BBStats, is a submodule at `stats/` and must be initialized before the backend's `uv sync`.

### 1. Database

```
docker compose up -d
```

### 2. Backend

```
cd backend
cp .env.example .env
uv run alembic upgrade head
uv run python scripts/create_admin.py <username> <password> [team-slug] [--email EMAIL]
uv run uvicorn app.main:app --reload
```

Google sign-in and reset email are optional (see `.env.example`). The local Google redirect URI is
`http://localhost:5173/api/auth/google/callback`. Without `SMTP_HOST`, the reset link is logged to the backend console.

Runs on http://localhost:8000. Tests: `uv run pytest`.

### 3. Frontend

```
cd frontend
npm install
npm run dev
```

Runs on http://localhost:5173, proxying `/api/*` to the backend. Tests: `npm run test`.

### Full stack locally (optional)

```bash
docker compose --profile full up -d --build   # db + backend + Caddy
docker compose exec backend uv run python scripts/create_admin.py <user> <password> [team-slug] [--email EMAIL]
```

Open http://localhost:8081. Uploads fail until object-storage vars are set.

To debug the BBStats Streamlit app (`stats/` submodule): `docker compose --profile stats up stats`,
then open http://localhost:8501.

To explore the local db: `docker compose --profile pgadmin up -d pgadmin`, then open
http://localhost:5050 (db password: `gush_ball`).

To run `npm run dev` against another backend, set `API_TARGET` (includes `/api`):

```bash
API_TARGET=http://localhost:8081/api npm run dev
# PowerShell: $env:API_TARGET='http://localhost:8081/api'; npm run dev
```

For prod, use `API_TARGET=https://<prod-domain>/api`. This is **live prod data**: every admin edit is real.
Don't run vite with `--host` while pointed at prod.

## Deployment

Step-by-step guide (R2 storage, domain, Coolify, env vars, scrape task, backups): [DEPLOYMENT.md](DEPLOYMENT.md).

### Manual dump / import (dev <-> prod)

Prod → dev in one step (any OS, from the repo root; wipes the local db):
`uv run pull_prod_db.py root@<server-ip>`. Add `--dump <file>` to restore an existing dump instead of downloading.

`dbsync.sh` dumps the DB to a file and imports it (wipes the target). It targets dev by default; prefix
`DB_CONTAINER=gush-ball-db` for prod (run on the server). Run from Git Bash/WSL (PowerShell redirection corrupts binary dumps).

```
DB_CONTAINER=gush-ball-db ./dbsync.sh dump prod.dump   # on the server; scp it down
./dbsync.sh import prod.dump                                       # into dev
./dbsync.sh dump dev.dump                                          # scp it up, then on the server:
DB_CONTAINER=gush-ball-db ./dbsync.sh import dev.dump
```

Stop `backend` first on prod (open connections block `--clean`), start it after. Dumps include admin password
hashes (prod->dev copies prod logins, dev->prod replaces prod admins). If migration heads differ, run
`alembic upgrade head` afterwards. `*.dump` is gitignored; never commit one.

## Project phases

1. **Phase 1**: manually-populated public site (teams, players, schedule, standings,
   scores) + basic admin CRUD. Hebrew/RTL only. Dark/light toggle.
2. **Phase 2**: scraper (standings + schedule/results + opponent logos from ibasketball.co.il)
   into a pending-review admin queue, with manual-override protection against re-scrape clobber.
3. **Phase 3**: statistics (design TBD), social media embeds, dynamic per-team color theming.

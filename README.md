# Gush Ball

Website for the club: team pages, schedule/standings, scores, and (later) stats — scraped from
[ibasketball.co.il](https://ibasketball.co.il) with admin review, plus manual admin management.

## Stack

- **Backend**: Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL
- **Frontend**: Vue 3 (JS, not TS), Vite, Tailwind CSS v4, Vue Router
- **Auth**: single admin role, session cookie (no fan/player accounts)

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
uv run python scripts/create_admin.py <username> <password>
uv run uvicorn app.main:app --reload
```

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
docker compose exec backend uv run python scripts/create_admin.py <user> <password>
```

Open http://localhost:8081. Uploads fail until object-storage vars are set.

To debug the BBStats Streamlit app (`stats/` submodule): `docker compose --profile stats up stats`,
then open http://localhost:8501.

To run `npm run dev` against another backend, set `API_TARGET` (includes `/api`):

```bash
API_TARGET=http://localhost:8081/api npm run dev
# PowerShell: $env:API_TARGET='http://localhost:8081/api'; npm run dev
```

For prod, open the SSH tunnel from [DEPLOYMENT.md](DEPLOYMENT.md) step 6 (`ssh -L 8080:localhost:80 <deploy-user>@<server-ip>`)
and use `API_TARGET=http://localhost:8080/api`. This is **live prod data**: every admin edit is real.
Don't run vite with `--host` while pointed at prod.

## Deployment

Step-by-step guide (R2 storage, Hetzner box, env vars, GitHub secrets, cron, HTTPS): [DEPLOYMENT.md](DEPLOYMENT.md).

### Manual dump / import (dev <-> prod)

`dbsync.sh` dumps the DB to a file and imports it (wipes the target). It targets dev by default; prefix
`COMPOSE_FILE=docker-compose.prod.yml` for prod. Run from Git Bash/WSL (PowerShell redirection corrupts binary dumps).

```
COMPOSE_FILE=docker-compose.prod.yml ./dbsync.sh dump prod.dump   # on the server; scp it down
./dbsync.sh import prod.dump                                       # into dev
./dbsync.sh dump dev.dump                                          # scp it up, then on the server:
COMPOSE_FILE=docker-compose.prod.yml ./dbsync.sh import dev.dump
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

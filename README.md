# Gush Ball

Website for the club: team pages, schedule/standings, scores, and (later) stats — scraped from
[ibasketball.co.il](https://ibasketball.co.il) with admin review, plus manual admin management.

## Stack

- **Backend**: Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL
- **Frontend**: Vue 3 (JS, not TS), Vite, Tailwind CSS v4, Vue Router
- **Auth**: single admin role, session cookie (no fan/player accounts)

## Local setup

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

To run `npm run dev` against another backend, set `API_TARGET` (includes `/api`):

```bash
API_TARGET=http://localhost:8081/api npm run dev
# PowerShell: $env:API_TARGET='http://localhost:8081/api'; npm run dev
```

For prod, open the SSH tunnel from Deployment step 4 (`ssh -L 8080:localhost:80 <deploy-user>@<server-ip>`)
and use `API_TARGET=http://localhost:8080/api`. This is **live prod data**: every admin edit is real.
Don't run vite with `--host` while pointed at prod.

## Deployment

Host: a self-managed **Hetzner** machine running the whole stack (Postgres, backend, Caddy serving
the frontend) via Docker Compose, deployed by CI over SSH on every push to `master`.

### 1. One-time machine setup

- Install Docker (with the Compose plugin) on the box.
- Create a deploy user, add the CI's public key to its `~/.ssh/authorized_keys`, and add the user
  to the `docker` group.
- `git clone` this repo into `~/gush-ball` (that exact path — CI's deploy step assumes it).
- Create `~/gush-ball/.env` with:
  - `POSTGRES_PASSWORD`
  - `DATABASE_URL=postgresql+psycopg://gush_ball:<same password>@db:5432/gush_ball`
  - `SESSION_SECRET` (required, 32+ chars; the app refuses to start otherwise)
  - `CORS_ORIGINS=["http://<server-ip>"]`
  - `OBJECT_STORAGE_ENDPOINT_URL`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`,
    `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_PUBLIC_URL`, `OBJECT_STORAGE_REGION`.
    The `OBJECT_STORAGE_*` key is an R2 API token scoped to `OBJECT_STORAGE_BUCKET` only (Object
    Read & Write); this file is passed whole to the backend container, so it must not reach backups.
  - `ENABLE_DOCS`: leave unset in prod (keeps `/api/docs` and `/api/openapi.json` off).
  - `BACKUP_BUCKET` — a **separate, private** R2 bucket for `pg_dump` output. It must not be the same bucket as `OBJECT_STORAGE_BUCKET`, because that
    one needs R2 public access for media, which would make dated backup files public too.
  - `~/gush-ball/.env.backup` (`chmod 600`; **not** `.env`, which the backend container receives):
    `BACKUP_ACCESS_KEY_ID` / `BACKUP_SECRET_ACCESS_KEY`, a second R2 token scoped to
    `BACKUP_BUCKET` only. Optional: if absent, `backup.sh` falls back to the `OBJECT_STORAGE_*` key.

  All values must be shell-safe (no spaces, `$`, or quotes) — `backup.sh` sources this file.
- Bring the stack up: `docker compose -f docker-compose.prod.yml up -d --build`.

### 2. GitHub secrets

Set on the repo:

- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (the private key matching the public key added to
  the deploy user above).
- `DEPLOY_KNOWN_HOSTS` — the box's SSH host key, so CI verifies it instead of trusting whatever
  answers on first connect. Generate it with `ssh-keyscan -t ed25519 <server-ip>` and paste the
  output as-is.

### 3. First admin

```
docker compose -f docker-compose.prod.yml exec backend uv run python scripts/create_admin.py <username> <password>
```

### 4. Admin access before HTTPS

No domain yet, so the site is plain HTTP on the server's IP. Avoid logging in over an untrusted
network; tunnel instead:

```
ssh -L 8080:localhost:80 <deploy-user>@<server-ip>
```

then browse to `http://localhost:8080/`.

### 5. Backups

`backup.sh` (repo root) pipes a `pg_dump` of the `db` container straight to the private
`BACKUP_BUCKET` via a throwaway `amazon/aws-cli` container — no AWS CLI install needed on the host.
Add it to the deploy user's crontab:

```
0 3 * * * ~/gush-ball/backup.sh
```

Dumps rely on R2 server-side encryption at rest plus the private bucket and scoped token; there is
no client-side encryption.

### 6. Nightly scraper sync

Standings + schedule/results/opponent logos (issues #13/#14) also run unattended via cron, in
addition to the admin's manual "סנכרון עכשיו" button (issue #17). Add this to the **same** deploy
user's crontab as step 5's `backup.sh`:

```
0 4 * * * cd ~/gush-ball && docker compose -f docker-compose.prod.yml exec -T backend uv run python -m app.scrape
```

`app.scrape` runs standings then games sequentially (never overlapping, respecting
ibasketball.co.il's `Crawl-Delay: 10`); a failing team's standings are logged and skipped, not fatal.

### 7. Restore (into a scratch DB, to verify a backup)

The `AWS_*` values below are the backup token.

```
docker compose -f docker-compose.prod.yml exec db createdb -U gush_ball scratch
docker run --rm \
  -e AWS_ACCESS_KEY_ID=... -e AWS_SECRET_ACCESS_KEY=... -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli s3 cp s3://<BACKUP_BUCKET>/<file>.dump - --endpoint-url <OBJECT_STORAGE_ENDPOINT_URL> \
  | docker compose -f docker-compose.prod.yml exec -T db pg_restore -U gush_ball -d scratch --no-owner
```

### 8. HTTPS later

Once a domain points at the box: replace `:80` with the domain in `frontend/Caddyfile`, publish
`443:443` on the `web` service, and add a `caddy_data` volume so Caddy's ACME state survives
restarts.

## Project phases

1. **Phase 1**: manually-populated public site (teams, players, schedule, standings,
   scores) + basic admin CRUD. Hebrew/RTL only. Dark/light toggle.
2. **Phase 2**: scraper (standings + schedule/results + opponent logos from ibasketball.co.il)
   into a pending-review admin queue, with manual-override protection against re-scrape clobber.
3. **Phase 3**: statistics (design TBD), social media embeds, dynamic per-team color theming.

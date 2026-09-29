# Deployment

The whole stack (Postgres, backend, Caddy serving the frontend and proxying `/api/*`) runs on one
**Hetzner** machine via `docker-compose.prod.yml`. CI (`.github/workflows/ci.yml`) deploys over SSH
on every push to `master`, after the backend and frontend jobs pass.

Order matters: storage first (you need its values for `.env`), then the machine, then CI.

## 0. What you'll end up with

| Where | What |
|---|---|
| Cloudflare R2 | `gush-ball-media` (public) + `gush-ball-backups` (private), one API token each |
| Hetzner box | `~/gush-ball` clone, `~/gush-ball/.env`, `~/gush-ball/.env.backup`, crontab |
| GitHub repo secrets | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` |

## 1. Object storage (Cloudflare R2)

Media uploads go through the backend (`backend/app/storage.py`), which `put_object`s to the bucket
and stores the returned public URL. Browsers only *read* from the bucket, so no bucket CORS rule is
needed.

1. Cloudflare dashboard → **R2** → enable R2 (needs a payment method; the free tier covers this site).
2. **Account ID**: shown on the R2 overview page. The S3 endpoint is
   `https://<account-id>.r2.cloudflarestorage.com` → `OBJECT_STORAGE_ENDPOINT_URL`.
3. **Media bucket**: *Create bucket* → `gush-ball-media` → `OBJECT_STORAGE_BUCKET`.
   - Bucket → *Settings* → *Public access* → enable the **r2.dev subdomain** (or connect a custom
     domain once one exists). The resulting URL (e.g. `https://pub-xxxx.r2.dev`, no trailing
     slash) → `OBJECT_STORAGE_PUBLIC_URL`.
4. **Backup bucket**: *Create bucket* → `gush-ball-backups` → `BACKUP_BUCKET`. Leave public access
   **off**. It must be a different bucket from the media one, or dated DB dumps would be public.
   - Optional: *Settings* → *Object lifecycle rules* → delete objects after e.g. 30 days, so
     nightly dumps don't pile up forever.
5. **Media token**: R2 → *Manage R2 API Tokens* → *Create API token*:
   permission **Object Read & Write**, *Specify bucket* → `gush-ball-media` only.
   Copy the **Access Key ID** → `OBJECT_STORAGE_ACCESS_KEY_ID` and **Secret Access Key** →
   `OBJECT_STORAGE_SECRET_ACCESS_KEY`. The secret is shown once.
6. **Backup token**: same again, scoped to `gush-ball-backups` only →
   `BACKUP_ACCESS_KEY_ID` / `BACKUP_SECRET_ACCESS_KEY`.
7. `OBJECT_STORAGE_REGION=auto` (R2 ignores regions, but boto3 wants one).

## 2. Hetzner machine

1. Hetzner Cloud console → create a server (Ubuntu LTS), add your personal SSH key.
2. Firewall: allow inbound **22** and **80** (add **443** when HTTPS arrives, step 9).
3. SSH in as root and install Docker with the Compose plugin:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. Create the deploy user and give it Docker:
   ```bash
   adduser --disabled-password --gecos "" deploy
   usermod -aG docker deploy
   ```
5. Generate the **CI deploy key** (on your laptop, no passphrase — CI can't type one):
   ```bash
   ssh-keygen -t ed25519 -N "" -C gush-ball-ci -f gush_ball_deploy
   ```
   Append `gush_ball_deploy.pub` to `/home/deploy/.ssh/authorized_keys` on the server
   (`mkdir -p` the dir, `chmod 700 ~/.ssh`, `chmod 600 authorized_keys`, owned by `deploy`).
   The private half `gush_ball_deploy` goes into GitHub in step 5.
6. As `deploy`, clone into **exactly** `~/gush-ball` (CI's deploy command assumes that path). The
   repo and the `stats/` submodule are public, so HTTPS needs no credentials:
   ```bash
   git clone --recursive https://github.com/turner11/gush-ball.git ~/gush-ball
   ```

## 3. Environment files

### `~/gush-ball/.env`

Passed **whole** to the backend container (`env_file: .env`) and also sourced by `backup.sh`, so
every value must be shell-safe: no spaces, `$`, or quotes. `chmod 600 .env`.

| Variable | Value / how to get it |
|---|---|
| `POSTGRES_PASSWORD` | Generate: `openssl rand -hex 24` (hex = shell- and URL-safe). Used by the `db` container on first boot only — changing it later requires `ALTER USER` inside Postgres too. |
| `DATABASE_URL` | `postgresql+psycopg://gush_ball:<POSTGRES_PASSWORD>@db:5432/gush_ball` (`db` is the compose service name). |
| `SESSION_SECRET` | Generate: `openssl rand -hex 32`. Required, 32+ chars — the app refuses to start without it. Rotating it logs the admin out. |
| `CORS_ORIGINS` | `["http://<server-ip>"]` — JSON list. Switch to `https://<domain>` in step 9. |
| `OBJECT_STORAGE_ENDPOINT_URL` | Step 1.2 |
| `OBJECT_STORAGE_BUCKET` | Step 1.3 |
| `OBJECT_STORAGE_PUBLIC_URL` | Step 1.3 |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | Step 1.5 |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Step 1.5 |
| `OBJECT_STORAGE_REGION` | `auto` |
| `BACKUP_BUCKET` | Step 1.4 — read only by `backup.sh`. |
| `ENABLE_DOCS` | **Leave unset** in prod (keeps `/api/docs` and `/api/openapi.json` off). |

Template:

```bash
POSTGRES_PASSWORD=
DATABASE_URL=postgresql+psycopg://gush_ball:<POSTGRES_PASSWORD>@db:5432/gush_ball
SESSION_SECRET=
CORS_ORIGINS=["http://<server-ip>"]
OBJECT_STORAGE_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
OBJECT_STORAGE_BUCKET=gush-ball-media
OBJECT_STORAGE_PUBLIC_URL=https://pub-<id>.r2.dev
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_REGION=auto
BACKUP_BUCKET=gush-ball-backups
```

`backend/.env.example` is the **local-dev** template (localhost DB, docs on) — don't copy it to prod
as-is.

### `~/gush-ball/.env.backup`

Kept out of `.env` so the backend container never sees the backup credentials. `chmod 600`.

```bash
BACKUP_ACCESS_KEY_ID=       # step 1.6
BACKUP_SECRET_ACCESS_KEY=   # step 1.6
```

Optional: if missing, `backup.sh` falls back to the media token — which works only if that token
can also write the backup bucket, so create this file.

## 4. First boot

```bash
cd ~/gush-ball
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # all three services "running"
docker compose -f docker-compose.prod.yml logs backend # migrations ran, uvicorn started
```

The backend runs `alembic upgrade head` on every start, so migrations need no manual step.

Create the first admin:

```bash
docker compose -f docker-compose.prod.yml exec backend uv run python scripts/create_admin.py <username> <password>
```

Check `http://<server-ip>/` loads.

## 5. GitHub secrets (CI deploy)

Repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Server IP |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | Full contents of the private key `gush_ball_deploy` from step 2.5 (including the `BEGIN`/`END` lines) |
| `DEPLOY_KNOWN_HOSTS` | Output of `ssh-keyscan -t ed25519 <server-ip>`, pasted as-is — CI verifies the host instead of trusting first connect |

Then delete the local private key copy, or keep it only in a password manager.

Each push to `master` now runs, on the server:
`git pull --ff-only && git submodule update --init && docker compose -f docker-compose.prod.yml up -d --build && docker image prune -f`.
`--ff-only` means local edits to tracked files on the server will break deploys — change things in
git, not on the box. `.env` / `.env.backup` are gitignored, so they're safe.

## 6. Admin access before HTTPS

No domain yet → plain HTTP on the IP. Don't log in over an untrusted network; tunnel instead:

```bash
ssh -L 8080:localhost:80 deploy@<server-ip>
```

then browse to `http://localhost:8080/`.

## 7. Cron: backups + nightly scrape

As `deploy`, `crontab -e`:

```
0 3 * * * ~/gush-ball/backup.sh
0 4 * * * cd ~/gush-ball && docker compose -f docker-compose.prod.yml exec -T backend uv run python -m app.scrape
```

- `backup.sh` pipes a `pg_dump` to `BACKUP_BUCKET` through a throwaway `amazon/aws-cli` container
  (no AWS CLI on the host). Run it once by hand now and confirm a `gush_ball-<date>.dump` appears in
  the R2 bucket. Encryption is R2's server-side at-rest encryption; there is no client-side
  encryption.
- `app.scrape` runs standings then games sequentially, respecting ibasketball.co.il's
  `Crawl-Delay: 10`; a failing team is logged and skipped. The admin's "סנכרון עכשיו" button does
  the same on demand.

## 8. Verify a backup (restore into a scratch DB)

```bash
docker compose -f docker-compose.prod.yml exec db createdb -U gush_ball scratch
docker run --rm \
  -e AWS_ACCESS_KEY_ID=<BACKUP_ACCESS_KEY_ID> -e AWS_SECRET_ACCESS_KEY=<BACKUP_SECRET_ACCESS_KEY> -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli s3 cp s3://gush-ball-backups/<file>.dump - --endpoint-url <OBJECT_STORAGE_ENDPOINT_URL> \
  | docker compose -f docker-compose.prod.yml exec -T db pg_restore -U gush_ball -d scratch --no-owner
docker compose -f docker-compose.prod.yml exec db dropdb -U gush_ball scratch
```

For a real restore into `gush_ball`, or copying data dev ↔ prod, use `dbsync.sh` (see README,
"Manual dump / import").

## 9. HTTPS (once a domain exists)

1. Point the domain's A record at the server IP.
2. `frontend/Caddyfile`: replace `:80` with the domain — Caddy then gets a Let's Encrypt cert itself.
3. `docker-compose.prod.yml`, `web` service: publish `443:443` and add a `caddy_data:/data` volume
   (plus the top-level `caddy_data:` volume) so certificates survive rebuilds.
4. Open port 443 in the Hetzner firewall.
5. `.env`: `CORS_ORIGINS=["https://<domain>"]`, then
   `docker compose -f docker-compose.prod.yml up -d backend`.
6. Optional: connect a custom domain to the media bucket (R2 → bucket → *Custom domains*) and update
   `OBJECT_STORAGE_PUBLIC_URL`. Already-uploaded images keep their old r2.dev URLs in the DB, so
   leave r2.dev access on.

The SSH tunnel from step 6 is no longer needed after this.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Backend exits on start, `session_secret` validation error | `SESSION_SECRET` missing or under 32 chars |
| Backend can't connect to DB | `DATABASE_URL` password ≠ `POSTGRES_PASSWORD`, or host isn't `db` |
| Upload returns 502 "Object storage is not configured correctly" | Wrong `OBJECT_STORAGE_*` value or token not scoped to that bucket |
| Upload works but image is broken | `OBJECT_STORAGE_PUBLIC_URL` wrong, or bucket public access off |
| CI deploy: `Host key verification failed` | `DEPLOY_KNOWN_HOSTS` missing/stale (server rebuilt → re-run `ssh-keyscan`) |
| CI deploy: `Not possible to fast-forward` | Someone edited tracked files on the server; `git status` there and reset them |
| `backup.sh` fails with `AccessDenied` | `.env.backup` missing/wrong, or token not scoped to `BACKUP_BUCKET` |

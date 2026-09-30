# Deployment

The whole stack (Postgres, backend, [Caddy](https://caddyserver.com/docs/) serving the frontend and proxying `/api/*`) runs on the
existing **[Hetzner](https://console.hetzner.cloud/)** machine, deployed by **[Coolify](https://coolify.io/docs/)** (which already
runs another site there) from `docker-compose.prod.yml`. Coolify's proxy owns ports 80/443, routes the domain to the `web`
container and issues the TLS certificate; the compose file publishes no ports.

Order matters: storage first (you need its values for the env vars), then the domain, then Coolify.

## 0. What you'll end up with

| Where | What |
|---|---|
| Cloudflare R2 | `gush-ball-media` (public) + `gush-ball-backups` (private), one API token each |
| Coolify | one Docker Compose resource: env vars, domain, scheduled scrape task |
| Hetzner box | `~/gush-ball-backup.env`, `~/backup.sh`, one crontab line (nightly backup) |

## 1. Object storage (Cloudflare R2)

Docs: [R2 get started](https://developers.cloudflare.com/r2/get-started/) ·
[pricing / free tier](https://developers.cloudflare.com/r2/pricing/).

Media uploads go through the backend (`backend/app/storage.py`), which `put_object`s to the bucket
and stores the returned public URL. Browsers only *read* from the bucket, so no bucket CORS rule is
needed.

1. [Cloudflare dashboard](https://dash.cloudflare.com/) → **R2** → enable R2 (needs a payment method; the free tier covers this site).
2. **Account ID**: shown on the R2 overview page. The S3 endpoint is
   `https://<account-id>.r2.cloudflarestorage.com` → `OBJECT_STORAGE_ENDPOINT_URL`
   ([S3 API docs](https://developers.cloudflare.com/r2/api/s3/api/)).
3. **Media bucket**: [*Create bucket*](https://developers.cloudflare.com/r2/buckets/create-buckets/) → `gush-ball-media` → `OBJECT_STORAGE_BUCKET`.
   - Bucket → *Settings* → *Public access* → enable the **r2.dev subdomain** (or connect a custom
     domain once one exists) — [public buckets docs](https://developers.cloudflare.com/r2/buckets/public-buckets/). The resulting URL (e.g. `https://pub-xxxx.r2.dev`, no trailing
     slash) → `OBJECT_STORAGE_PUBLIC_URL`.
4. **Backup bucket**: *Create bucket* → `gush-ball-backups` → `BACKUP_BUCKET`. Leave public access
   **off**. It must be a different bucket from the media one, or dated DB dumps would be public.
   - Optional: *Settings* → [*Object lifecycle rules*](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) → delete objects after e.g. 30 days, so
     nightly dumps don't pile up forever.
5. **Media token**: R2 → *Manage R2 API Tokens* → *Create API token*
   ([API tokens docs](https://developers.cloudflare.com/r2/api/tokens/)):
   permission **Object Read & Write**, *Specify bucket* → `gush-ball-media` only.
   Copy the **Access Key ID** → `OBJECT_STORAGE_ACCESS_KEY_ID` and **Secret Access Key** →
   `OBJECT_STORAGE_SECRET_ACCESS_KEY`. The secret is shown once.
6. **Backup token**: same again, scoped to `gush-ball-backups` only →
   `BACKUP_ACCESS_KEY_ID` / `BACKUP_SECRET_ACCESS_KEY`.
7. `OBJECT_STORAGE_REGION=auto` (R2 ignores regions, but boto3 wants one).

## 2. Domain

Point the domain's A record at the Hetzner server IP (the same IP as your other site; Coolify's proxy tells them apart by
hostname). Ports 80/443 are already open for the other site, so the firewall needs no change.

## 3. Coolify resource

1. Coolify → your project → *New resource* → *Public Repository* (or *Private Repository (GitHub App)*):
   `https://github.com/turner11/gush-ball`, branch `master`, build pack **Docker Compose**, compose file
   `/docker-compose.prod.yml`.
2. Enable **submodules** for the repo (advanced settings): the backend build needs `stats/`.
3. On the `web` service set the domain to `https://<domain>` (Coolify maps it to port 80 and requests the certificate).
   The `backend` and `db` services get no domain.
4. *Environment Variables* (the compose file refuses to start if a required one is missing; every value must be free of
   spaces, `$` and quotes):

| Variable | Value / how to get it |
|---|---|
| `POSTGRES_PASSWORD` | Generate: `openssl rand -hex 24`. Used by the `db` container on first boot only, so changing it later requires `ALTER USER` inside Postgres too. `DATABASE_URL` is built from it in the compose file. |
| `SESSION_SECRET` | Generate: `openssl rand -hex 32`. Required, 32+ chars; the app refuses to start without it. Rotating it logs the admin out. |
| `CORS_ORIGINS` | `["https://<domain>"]`, a JSON list. |
| `OBJECT_STORAGE_ENDPOINT_URL` | Step 1.2 |
| `OBJECT_STORAGE_BUCKET` | Step 1.3 |
| `OBJECT_STORAGE_PUBLIC_URL` | Step 1.3 |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | Step 1.5 |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Step 1.5 |
| `OBJECT_STORAGE_REGION` | Optional, defaults to `auto` |
| `STATS_URL` | Optional, the BBStats Streamlit app link |
| `ENABLE_DOCS` | **Leave unset** in prod (keeps `/api/docs` and `/api/openapi.json` off). |

`backend/.env.example` is the **local-dev** template; don't use it for prod.

## 4. First boot

*Deploy* in Coolify. The backend runs `alembic upgrade head` on every start, so migrations need no manual step. Check the
deployment logs show all three services healthy and `https://<domain>/` loads.

Create the first admin: Coolify → the `backend` service → *Terminal*:

```bash
uv run python scripts/create_admin.py <username> <password>
```

**Auto-deploy:** enable *Automatic Deployment* (GitHub App, or the webhook from the resource page) so pushes to `master`
deploy. CI no longer deploys anything and Coolify does not wait for it, so keep `master` green via PR checks.

## 5. Nightly scrape

Coolify → the `backend` service → *Scheduled Tasks* → add, frequency `0 4 * * *`:

```bash
uv run python -m app.scrape
```

`app.scrape` runs standings then games sequentially, respecting ibasketball.co.il's `Crawl-Delay: 10`; a failing team is
logged and skipped. The admin's "סנכרון עכשיו" button does the same on demand.

## 6. Nightly backup

`backup.sh` runs `pg_dump` in the `gush-ball-db` container (a fixed `container_name` in the compose file) and pipes it to
`BACKUP_BUCKET` through a throwaway `amazon/aws-cli` container. It runs on the host, outside Coolify, because the dump
tool and the R2 upload don't share a container.

1. On the server, create `~/gush-ball-backup.env` (`chmod 600`):

   ```bash
   BACKUP_BUCKET=gush-ball-backups
   BACKUP_ACCESS_KEY_ID=       # step 1.6
   BACKUP_SECRET_ACCESS_KEY=   # step 1.6
   OBJECT_STORAGE_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
   ```

2. Copy the script to the host and make it executable (re-copy it if it changes in the repo):

   ```bash
   curl -fsSL https://raw.githubusercontent.com/turner11/gush-ball/master/backup.sh -o ~/backup.sh && chmod +x ~/backup.sh
   ```

3. Run it once by hand and confirm a `gush_ball-<date>.dump` appears in the R2 bucket, then `crontab -e`
   ([crontab.guru](https://crontab.guru/)):

   ```
   0 3 * * * ~/backup.sh
   ```

Encryption is R2's server-side at-rest encryption; there is no client-side encryption.

## 7. Verify a backup (restore into a scratch DB)

```bash
docker exec gush-ball-db createdb -U gush_ball scratch
docker run --rm \
  -e AWS_ACCESS_KEY_ID=<BACKUP_ACCESS_KEY_ID> -e AWS_SECRET_ACCESS_KEY=<BACKUP_SECRET_ACCESS_KEY> -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli s3 cp s3://gush-ball-backups/<file>.dump - --endpoint-url <OBJECT_STORAGE_ENDPOINT_URL> \
  | docker exec -i gush-ball-db pg_restore -U gush_ball -d scratch --no-owner
docker exec gush-ball-db dropdb -U gush_ball scratch
```

For a real restore into `gush_ball`, or copying data dev ↔ prod, use `dbsync.sh` with `DB_CONTAINER=gush-ball-db` (see
README, "Manual dump / import").

## 8. Media bucket custom domain (optional)

Connect a custom domain to the media bucket (R2 → bucket → [*Custom domains*](https://developers.cloudflare.com/r2/buckets/public-buckets/#custom-domains))
and update `OBJECT_STORAGE_PUBLIC_URL`. Already-uploaded images keep their old r2.dev URLs in the DB, so leave r2.dev access on.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Deploy fails: `required variable ... is missing` | An env var from step 3.4 isn't set in Coolify |
| Backend exits on start, `session_secret` validation error | `SESSION_SECRET` missing or under 32 chars |
| Backend can't connect to DB | `POSTGRES_PASSWORD` changed after the first boot (the DB keeps the old one) |
| Domain returns 502 / "no available server" | Domain set on the wrong service (must be `web`), or `web` failed to start |
| Admin login fails / CORS errors | `CORS_ORIGINS` doesn't match `https://<domain>` exactly |
| Build fails at the `stats` context | Submodules not enabled on the Coolify resource |
| Upload returns 502 "Object storage is not configured correctly" | Wrong `OBJECT_STORAGE_*` value or token not scoped to that bucket |
| Upload works but image is broken | `OBJECT_STORAGE_PUBLIC_URL` wrong, or bucket public access off |
| `backup.sh`: `No such container: gush-ball-db` | Stack not deployed, or Coolify renamed the container; check `docker ps` |
| `backup.sh` fails with `AccessDenied` | `~/gush-ball-backup.env` wrong, or token not scoped to `BACKUP_BUCKET` |

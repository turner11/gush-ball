# Backups

How to back up the production database, check a backup, and restore one. Production Postgres runs in a container on
the Hetzner machine that Coolify names `db-uk44s8kc08ggkoksoo80skcw-<deploy-timestamp>`, for example
`db-uk44s8kc08ggkoksoo80skcw-20261013T104907`. The timestamp changes on every deploy, so never type the full name:
look the container up by its stable prefix (`uk44s8kc08ggkoksoo80skcw` is the Coolify resource id):

```bash
docker ps -qf name=db-uk44s8kc08ggkoksoo80skcw     # prints the container id; must print exactly one line
```

If the Coolify resource is ever recreated, the id changes. Find the new one with
`docker ps --format '{{.Names}}' | grep '^db-'` and update it in `dbsync.sh`, `pull_prod_db.py` and this
file. (The nightly backup is unaffected: it runs inside the compose stack and reaches the DB as `db`.) `coolify-db` is Coolify's own database: never touch it.

*Why this matters:* the database lives on that one machine. If its disk dies, or a bad migration damages data, the only
way back is a copy kept somewhere else.

Run the local commands in **Git Bash** from the repo root. PowerShell's `>` redirection corrupts binary dumps.
`*.dump` is gitignored; never commit one. A dump holds admin password hashes, so don't share it.

| Section | When |
|---|---|
| [1. Take a backup to your machine](#1-take-a-backup-to-your-machine) | Before any risky deploy, especially an irreversible migration |
| [2. Check a dump](#2-check-a-dump) | Right after taking one |
| [3. The nightly backup to R2](#3-the-nightly-backup-to-r2) | Set up once; then download a dump from R2 |
| [4. Verify an R2 backup](#4-verify-an-r2-backup) | By hand; the *Backup check* Action does it daily |
| [5. Restore production from a dump](#5-restore-production-from-a-dump) | Only when production data must go back |

## 1. Take a backup to your machine

**What:** `pg_dump` runs inside the production DB container and streams over SSH straight into a local file. Nothing is
left on the server.

1. Find the server's IP: [Hetzner Console](https://console.hetzner.cloud/) → your project → *Servers* → the IPv4
   address.
2. Run:

   ```bash
   ssh root@<server-ip> 'docker exec $(docker ps -qf name=db-uk44s8kc08ggkoksoo80skcw) pg_dump -U gush_ball -Fc gush_ball' > prod-$(date +%F-%H%M).dump
   ```

3. **Verify:** the file is not empty (`ls -lh prod-*.dump`, expect at least tens of KB), then do [section 2](#2-check-a-dump).

Run this on **your PC**, not on the server: the quotes send the command through `ssh`. Already logged in on the
server? Drop the `ssh` and the quotes, write to `~/prod-<timestamp>.dump`, then copy it down from your PC with
`scp root@<server-ip>:/root/prod-<timestamp>.dump .` (note the `:` after the host and the `.` destination).

If `ssh` asks for a password, your SSH key isn't loaded. Use the key you added in Hetzner.

## 2. Check a dump

**What:** read the dump's table of contents with `pg_restore --list`, through your local dev Postgres container.
**Why:** a truncated or corrupt dump looks fine until the day you need it.

```bash
docker exec -i gush-ball-db-1 pg_restore --list < prod-<timestamp>.dump | head -20
```

**Verify:** you see a header (`; Archive created at ...`) and `TABLE` / `TABLE DATA` lines for `admin_users`, `teams`,
`games` and so on. An error or empty output means the dump is bad: take it again before you deploy anything.

The local container must be running (`docker compose up -d db`). Its name is `gush-ball-db-1`; check with `docker ps`
if that fails.

## 3. The nightly backup to R2

**What:** the `backup` service in `docker-compose.prod.yml` (`backup/backup.sh`) runs `pg_dump` against the `db`
service and uploads the dump to the private R2 bucket `gush-ball-backups` as `gush_ball-<UTC date>T<HHMM>.dump`. It
runs once on every deploy and then every night at 03:00 UTC, and retries every 5 minutes after a failure. Coolify
deploys it with the rest of the stack, so there is no server crontab and nothing to SSH for.

Every morning at 06:00 UTC the [*Backup check*](.github/workflows/backup-check.yml) GitHub Action downloads the newest
dump, restores it into a throwaway Postgres and counts teams and games. If no dump is newer than 26 hours, or the
restore fails, the run fails and GitHub emails you.

### 3.1 Set it up (once)

1. **Bucket and tokens:** [DEPLOYMENT.md §1](DEPLOYMENT.md#1-object-storage-cloudflare-r2) steps 4 and 6: the
   private `gush-ball-backups` bucket, a **Read & Write** token for the server, and a **Read only** token for the
   GitHub check. Both are scoped to that bucket only. Optional: a lifecycle rule (step 4) that deletes dumps after 30
   days.
2. **Coolify env vars:** the resource → *Environment Variables* → add the following, then *Save*:

   | Variable | Value |
   |---|---|
   | `BACKUP_BUCKET` | `gush-ball-backups` |
   | `BACKUP_ACCESS_KEY_ID` | The Read & Write token's Access Key ID |
   | `BACKUP_SECRET_ACCESS_KEY` | The Read & Write token's Secret Access Key |

   The service also uses `POSTGRES_PASSWORD` and `OBJECT_STORAGE_ENDPOINT_URL`, which are already set. *Why before
   the deploy:* the compose file refuses to deploy while one of them is missing.
3. **GitHub secrets:** the repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*, three
   times:

   | Secret | Value |
   |---|---|
   | `BACKUP_READ_ACCESS_KEY_ID` | The Read only token's Access Key ID |
   | `BACKUP_READ_SECRET_ACCESS_KEY` | The Read only token's Secret Access Key |
   | `OBJECT_STORAGE_ENDPOINT_URL` | Same value as in Coolify: `https://<account-id>.r2.cloudflarestorage.com` |

4. **Deploy:** redeploy in Coolify, or merge anything to `master`.

### 3.2 Verify it

1. Coolify → the resource → *Logs* → the `backup` service. Within a minute of the deploy you see
   `backup: uploaded gush_ball-<date>T<time>.dump (<n> bytes)`. A `backup: FAILED` line has the reason just above it.
2. Cloudflare → *R2* → `gush-ball-backups` → *Objects*: the same file is listed.
3. GitHub → *Actions* → *Backup check* → *Run workflow*. A green run means the newest dump was downloaded and
   restored. The log shows `restored: <n> teams, <m> games`.
4. From then on, nothing to do. If a backup stops landing, the next morning's *Backup check* fails and GitHub emails
   you.

### 3.3 Download a dump to your PC

**Easiest:** Cloudflare → *R2* → `gush-ball-backups` → *Objects* → the file → *Download*.

**Command line** (Git Bash, Docker running). Create `~/r2-backups.env` once, outside the repo, with the **Read only**
token. Use no quotes, because Docker reads the file literally:

```
AWS_ACCESS_KEY_ID=<Read only Access Key ID>
AWS_SECRET_ACCESS_KEY=<Read only Secret Access Key>
AWS_DEFAULT_REGION=auto
AWS_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
```

Then, from the repo root:

```bash
R2="docker run --rm --env-file $HOME/r2-backups.env amazon/aws-cli:2.38.1"
$R2 s3 ls s3://gush-ball-backups/                                # list the dumps
F=gush_ball-2026-10-23T0300.dump                                 # pick one from the list
$R2 s3 cp s3://gush-ball-backups/$F - > $F                       # download it (Git Bash, not PowerShell)
```

Check it with [section 2](#2-check-a-dump). To load it into your local dev DB (this wipes the local DB):
`uv run pull_prod_db.py --dump $F`.

## 4. Verify an R2 backup

**What:** restore a dump from R2 into a throwaway `scratch` database on the server, then drop it. Production data is not
touched. **Why:** a backup you've never restored is a guess. The *Backup check* Action (section 3) does this daily on
GitHub's machines; this is the by-hand version.

On the server, with the Read & Write token from section 3.1:

```bash
DB=$(docker ps -qf name=db-uk44s8kc08ggkoksoo80skcw)
docker exec $DB createdb -U gush_ball scratch
docker run --rm \
  -e AWS_ACCESS_KEY_ID=<BACKUP_ACCESS_KEY_ID> -e AWS_SECRET_ACCESS_KEY=<BACKUP_SECRET_ACCESS_KEY> -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli s3 cp s3://gush-ball-backups/<file>.dump - --endpoint-url <OBJECT_STORAGE_ENDPOINT_URL> \
  | docker exec -i $DB pg_restore -U gush_ball -d scratch --no-owner
docker exec $DB psql -U gush_ball -d scratch -c 'select count(*) from teams'
docker exec $DB dropdb -U gush_ball scratch
```

**Verify:** the `count(*)` matches roughly what the site shows.

## 5. Restore production from a dump

**This replaces all production data with the dump.** Every edit made after the dump was taken is lost.

The backend runs `alembic upgrade head` every time it starts (`backend/Dockerfile`). So if you are rolling back a deploy
that changed the schema, **revert the code first**. Otherwise the backend re-runs the new migration over the restored
data as soon as it starts.

1. **Roll back the code** (only if a deploy caused this): on GitHub, open the merged PR → *Revert* → merge the revert PR.
   Coolify redeploys the old code. Wait until the deploy finishes in Coolify.
2. **Copy the dump to the server** (skip if it's already there):

   ```bash
   scp prod-<timestamp>.dump root@<server-ip>:~/
   ```

3. **Stop the backend.** Open connections block the restore. On the server:

   ```bash
   BACKEND=$(docker ps -qf name=backend-uk44s8kc08ggkoksoo80skcw)   # same naming as the DB container
   docker stop $BACKEND
   ```

4. **Restore:**

   ```bash
   DB=$(docker ps -qf name=db-uk44s8kc08ggkoksoo80skcw)
   docker exec -i $DB pg_restore -U gush_ball -d gush_ball --clean --if-exists --no-owner < ~/prod-<timestamp>.dump
   ```

   This is what `DB_CONTAINER=db-uk44s8kc08ggkoksoo80skcw ./dbsync.sh import <file>` runs, if you have the repo on the
   server.
5. **Start the backend:** `docker start $BACKEND`, or *Restart* the resource in Coolify.
6. **Verify:** open the site, check that teams and games are there, and log in as admin.

To copy production data into your **local dev** database instead, use `uv run pull_prod_db.py root@<server-ip>`
(add `--dump <file>` to use a dump you already have). It wipes the local database.

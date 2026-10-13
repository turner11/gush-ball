# Backups

How to back up the production database, check a backup, and restore one. Production Postgres runs in a container on
the Hetzner machine that Coolify names `db-uk44s8kc08ggkoksoo80skcw-<deploy-timestamp>`, for example
`db-uk44s8kc08ggkoksoo80skcw-20261013T104907`. The timestamp changes on every deploy, so never type the full name:
look the container up by its stable prefix (`uk44s8kc08ggkoksoo80skcw` is the Coolify resource id):

```bash
docker ps -qf name=db-uk44s8kc08ggkoksoo80skcw     # prints the container id; must print exactly one line
```

If the Coolify resource is ever recreated, the id changes. Find the new one with
`docker ps --format '{{.Names}}' | grep '^db-'` and update it in `backup.sh`, `dbsync.sh`, `pull_prod_db.py` and this
file. `coolify-db` is Coolify's own database: never touch it.

*Why this matters:* the database lives on that one machine. If its disk dies, or a bad migration damages data, the only
way back is a copy kept somewhere else.

Run the local commands in **Git Bash** from the repo root. PowerShell's `>` redirection corrupts binary dumps.
`*.dump` is gitignored; never commit one. A dump holds admin password hashes, so don't share it.

| Section | When |
|---|---|
| [1. Take a backup to your machine](#1-take-a-backup-to-your-machine) | Before any risky deploy, especially an irreversible migration |
| [2. Check a dump](#2-check-a-dump) | Right after taking one |
| [3. Set up the nightly backup to R2](#3-set-up-the-nightly-backup-to-r2) | Once per server |
| [4. Verify an R2 backup](#4-verify-an-r2-backup) | After setup, then every few months |
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

## 3. Set up the nightly backup to R2

**What:** every night, `backup.sh` finds the DB container by its prefix, runs `pg_dump` in it, and uploads the dump to a private Cloudflare R2
bucket through a throwaway `amazon/aws-cli` container. It runs from the server's crontab, outside Coolify, because the
dump tool and the upload don't share a container.

### 3.1 Create the bucket and token (Cloudflare)

1. [Cloudflare dashboard](https://dash.cloudflare.com/) → *R2 Object Storage* → *Create bucket* → name
   `gush-ball-backups` → *Create bucket*. Leave *Public access* **off**. It must not be the media bucket, or the dated
   dumps would be public.
2. Optional: the bucket → *Settings* →
   [*Object lifecycle rules*](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) → *Add rule* → delete
   objects after 30 days, so dumps don't pile up forever.
3. *R2 Object Storage* → *Manage R2 API Tokens* (or *API* → *Manage API tokens*) → *Create API token*
   ([docs](https://developers.cloudflare.com/r2/api/tokens/)):
   - *Permissions:* **Object Read & Write**
   - *Specify bucket(s):* `gush-ball-backups` only
   - *Create API Token*, then copy the **Access Key ID** and **Secret Access Key**. The secret is shown once.
4. Note the S3 endpoint, `https://<account-id>.r2.cloudflarestorage.com`. It is the same value as
   `OBJECT_STORAGE_ENDPOINT_URL` in the Coolify env vars, and it is also shown on the token page.

### 3.2 Configure the server

1. SSH in: `ssh root@<server-ip>`.
2. Create the env file. It lives outside the repo because it holds secrets:

   ```bash
   cat > ~/gush-ball-backup.env <<'EOF'
   BACKUP_BUCKET=gush-ball-backups
   BACKUP_ACCESS_KEY_ID=<Access Key ID from 3.1>
   BACKUP_SECRET_ACCESS_KEY=<Secret Access Key from 3.1>
   OBJECT_STORAGE_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
   EOF
   chmod 600 ~/gush-ball-backup.env
   ```

   `chmod 600` makes it readable by root only.
3. Install the script. Re-run this whenever `backup.sh` changes in the repo:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/turner11/gush-ball/master/backup.sh -o ~/backup.sh && chmod +x ~/backup.sh
   ```

### 3.3 Test it, then schedule it

1. Run it once by hand: `~/backup.sh`. No output means success. `expected 1 running container matching ...` means the
   prefix found no DB container (or two, mid-redeploy): see the container note at the top of this file.
2. **Verify:** Cloudflare → *R2* → `gush-ball-backups` → a `gush_ball-<today>.dump` object exists and isn't tiny.
   *Why now:* find a wrong key or endpoint today, not on the day you need a restore.
3. Schedule it: `crontab -e`, then add this line to run it every night at 03:00
   ([crontab.guru](https://crontab.guru/) explains the syntax):

   ```
   0 3 * * * ~/backup.sh
   ```

4. **Verify** the next morning: a new dated dump is in the bucket.

Encryption is R2's server-side at-rest encryption; there is no client-side encryption.

## 4. Verify an R2 backup

**What:** restore a dump from R2 into a throwaway `scratch` database on the server, then drop it. Production data is not
touched. **Why:** a backup you've never restored is a guess.

On the server, with the values from `~/gush-ball-backup.env`:

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

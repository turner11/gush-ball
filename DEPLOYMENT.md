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
| Coolify | one Docker Compose resource: env vars, domain, scheduled scrape task, auto-deploy on push to `master` |
| GitHub | `master` ruleset requiring CI, push webhook to Coolify (Public Repository source only) |
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

**Goal:** make `https://<domain>` reach the Hetzner machine. DNS is the internet's phone book: it maps a name
(`gushball.example`) to an IP address. An **A record** is one entry in that book: "this name → this IPv4 address".
Your other site already lives on this machine, so your new domain gets the **same IP**. Coolify's proxy looks at which
hostname the browser asked for and forwards the request to the right site. Ports 80/443 are already open for the other
site, so the firewall needs no change.

### 2.1 Have a domain

*Why:* the TLS certificate (HTTPS) and Coolify's routing are both issued per domain name; an IP alone won't work.

If you don't own one yet, buy it from any registrar (Namecheap, Cloudflare Registrar, GoDaddy, Israeli registrars, ...).
If you do, note where its **DNS is managed**. That is usually the registrar, but it's Cloudflare (or similar) if you
changed the domain's nameservers there. You add the record in *that* place.

### 2.2 Find the server's IP

*Why:* the A record needs the exact address to point at.

1. Open the [Hetzner Cloud console](https://console.hetzner.cloud/) and log in.
2. Select your project → **Servers**.
3. Find the server that runs Coolify and your other site. Its **IPv4** address (like `203.0.113.10`) is shown in the list
   and at the top of the server page. Copy it.

Alternative: the other site's IP is the same one. Run `nslookup <other-site-domain>` in a terminal and take the
`Address` from the answer.

### 2.3 Add the A record

*Why:* this is the actual "phone book" entry. Until it exists, nobody (including Coolify's certificate request) can
find your server by name.

1. Log in to wherever DNS is managed (see 2.1) and open the domain's **DNS settings** ("DNS records", "Advanced DNS",
   "Manage DNS", depending on the provider).
2. Click **Add record** and fill in:

   | Field | Value | Meaning |
   |---|---|---|
   | Type | `A` | IPv4 address record |
   | Name / Host | `@` for the bare domain (`gushball.example`), or e.g. `www` / `app` for a subdomain | `@` means "the domain itself". Use whichever hostname you'll put in Coolify in step 3.3 |
   | Value / IPv4 / Points to | the IP from 2.2 | where the name leads |
   | TTL | `Auto` or 300 | how long resolvers cache the answer; low is handy while setting up |

3. If the provider is **Cloudflare**, set the proxy status to **DNS only** (grey cloud). Coolify requests its own
   certificate straight from the server; Cloudflare's orange-cloud proxy sits in the middle and can break that.
4. Optional: to also serve `www.<domain>`, add a second A record with Name `www` and the same IP.
5. Don't add an `AAAA` (IPv6) record unless the server is set up for IPv6, or some visitors will hit a dead address.
6. Delete any pre-existing `A` record for the same name (registrars often add a "parked page" one), or visitors will
   randomly get the wrong server.
7. Save.

### 2.4 Check that it works

*Why:* DNS changes take from seconds to a few hours to spread ("propagation"). If Coolify asks for a certificate before
the world can see your record, it fails; checking first saves a confusing debugging session.

In a terminal (PowerShell, Windows):

```
nslookup <domain>
```

The `Address` line under the answer must be your server IP. Or use a website like
[dnschecker.org](https://dnschecker.org/) → enter the domain → type `A`. If it still shows the old/no address, wait a few
minutes and retry. Move on to step 3 only once it shows the right IP.

## 3. Coolify resource

A Coolify "resource" is one deployable app. This one tells Coolify where the code is and how to run it.

1. Coolify → your project → *New resource* → *Public Repository* (or *Private Repository (GitHub App)*):
   `https://github.com/turner11/gush-ball`, branch `master`, build pack **Docker Compose**, compose file
   `/docker-compose.prod.yml`. *Why:* this is what Coolify clones and builds; Docker Compose is how the three services
   (db, backend, web) are described.
2. Enable **submodules** for the repo (advanced settings). *Why:* the backend build needs the `stats/` folder, which
   is a git submodule and is skipped by a plain clone.
3. On the `web` service set the domain to `https://<domain>` (the one from step 2). *Why:* Coolify's proxy then routes that
   hostname to `web` (port 80) and automatically requests a free Let's Encrypt HTTPS certificate. It can only do
   that if the A record from step 2 already points here. The `backend` and `db` services get no domain: they must
   not be reachable from the internet (`web` proxies `/api/*` to `backend` internally).
4. *Environment Variables* (the compose file refuses to start if a required one is missing; every value must be free of
   spaces, `$` and quotes). *Why:* secrets and per-environment settings live here, not in git:

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
| `PUBLIC_URL` | `https://<domain>`. Required: password-reset links and the Google redirect URI are built from it. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional, enable "Sign in with Google" (see 4.1). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional, password-reset email (STARTTLS, port defaults to 587). Without `SMTP_HOST` the reset link is only written to the backend logs. |
| `ENABLE_DOCS` | **Leave unset** in prod (keeps `/api/docs` and `/api/openapi.json` off). |

`backend/.env.example` is the **local-dev** template; don't use it for prod.

## 4. First boot

1. Click **Deploy** in Coolify. *What/why:* Coolify clones the repo, builds the images and starts the three services.
   The backend runs `alembic upgrade head` on every start, so the database tables are created without a manual step.
2. Watch the deployment logs until all three services are healthy, then open `https://<domain>/` in a browser. If you
   see the site with a padlock, DNS, routing and the certificate all work. (Certificate can take a minute; see
   Troubleshooting if it doesn't load.)
3. Create the first admin. *Why:* there is no sign-up page; the admin login has to be created by hand once.
   Coolify → the `backend` service → *Terminal* (a shell inside the running backend container):

```bash
uv run python scripts/create_admin.py <username> <password> [team-slug] [--email EMAIL]
```

An email is needed for password reset and Google sign-in. Team admins get theirs in the "מנהלי הקבוצה" section of the
team edit page. For a full admin use `create_admin.py --email`, or this SQL for an existing one:
`UPDATE admin_users SET email = lower('me@example.com') WHERE username = 'admin';`

### 4.1 Google sign-in (optional)

Only an existing admin whose `email` matches the (verified) Google account can sign in.

1. Open the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) in Google Cloud Console.
   Choose **External**, add the scopes `openid` and `email`, and click **Publish app**. *Why:* without publishing, only
   listed test users can sign in. *Verify:* the status reads "In production".
2. Open [Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials → OAuth client ID** →
   type **Web application**. Under **Authorized redirect URIs** add `https://<domain>/api/auth/google/callback`.
   *Why:* the server-side redirect flow needs the redirect URI (not an "authorized JavaScript origin"); a mismatch gives
   `redirect_uri_mismatch`. Copy the client ID and secret.
3. In Coolify open the resource (as in §3 step 4) → **Environment Variables**, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`,
   then click **Redeploy**. *Why:* the backend reads them at start; the login button appears only when both are set.
4. Give each admin an email (see above). *Why:* the email is the allowlist.
5. Verify: open `https://<domain>/admin/login` and click **כניסה עם Google**. A Google window opens; after you pick a
   listed account the window closes and the login page moves to `/admin`. An unlisted account closes the window and
   shows the red error. With popups blocked it falls back to a full-page redirect.

### 4.2 Auto-deploy on merge

Coolify deploys every push to `master`. CI deploys nothing and Coolify does not wait for it, so "merged" has to mean
"CI passed": GitHub enforces that, Coolify just follows `master`. Pushes to other branches (PR branches) are ignored.

1. **Protect `master` (GitHub).** Repo *Settings → Rules → Rulesets → New branch ruleset*, target `master`:
   require a pull request, require status checks **`backend`** and **`frontend`** (the job names in
   `.github/workflows/ci.yml`), require branches to be up to date, block force pushes. *Why:* only green PRs can land,
   so every deploy is a commit that passed CI.
2. **Tell Coolify about pushes.** Coolify → the resource → *Advanced* → keep **Auto Deploy** on (default). Then:
   - *Private Repository (GitHub App)* source: nothing else to do; the GitHub App delivers push events.
   - *Public Repository* source: GitHub doesn't know about Coolify yet, so add a webhook by hand.
     1. Coolify → the resource → *Webhooks* → *Manual Git Webhooks → GitHub*: set a secret (`openssl rand -hex 32`),
        save, and copy the URL (`http(s)://<coolify-host>/webhooks/source/github/events/manual`).
     2. GitHub repo *Settings → Webhooks → Add webhook*: Payload URL = that URL, Content type `application/json`,
        Secret = the same secret, *Just the push event*.
3. **Check it.** GitHub → the webhook → *Recent Deliveries*: the ping should show a green ✓. A timeout means GitHub
   can't reach Coolify: if the URL is `http://<ip>:8000/...`, port 8000 must be open to the internet (Hetzner firewall /
   `ufw`). Merge a PR and watch Coolify's *Deployments* tab start a build.

The secret only signs payloads (it's never sent), so an `http://<ip>:8000` URL works, but payloads and the Coolify login
travel unencrypted. Better: add an A record like `coolify.<domain>` → the same IP and set it in Coolify *Settings →
Instance's Domain*; Coolify then serves itself over HTTPS and the webhook URL switches to that host (update it in GitHub).

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

*Why backups:* the database lives on a single machine; if the disk dies, everything is lost unless a copy exists elsewhere
(the R2 bucket).

1. On the server (SSH in: `ssh root@<server-ip>`, using the SSH key you set up in Hetzner), create
   `~/gush-ball-backup.env` (`chmod 600`, so only your user can read the secrets in it):

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

3. Run it once by hand (`~/backup.sh`) and confirm a `gush_ball-<date>.dump` appears in the R2 bucket (*why:* find
   errors now, not on the day you need a restore). Then schedule it: `crontab -e` opens the list of timed jobs;
   add this line to run the script every night at 03:00 ([crontab.guru](https://crontab.guru/) explains the syntax):

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

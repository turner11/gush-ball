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
| Coolify | one Docker Compose resource: env vars, domain, scheduled scrape tasks, auto-deploy on push to `master` |
| GitHub | `master` ruleset requiring CI, push webhook to Coolify (Public Repository source only), three secrets for the daily backup check |
| Sentry | two projects (backend, frontend) + new-issue alert email |

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
6. **Backup tokens**: same again, scoped to `gush-ball-backups` only →
   `BACKUP_ACCESS_KEY_ID` / `BACKUP_SECRET_ACCESS_KEY`. Then a second one with **Object Read only** on the same bucket,
   for the GitHub backup check ([BACKUP.md §3](BACKUP.md#3-the-nightly-backup-to-r2)).
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
   `/docker-compose.prod.yml`. *Why:* this is what Coolify clones and builds; Docker Compose is how the four services
   (db, backend, web, backup) are described.
2. Enable **submodules** for the repo (advanced settings). *Why:* the backend build needs the `stats/` folder, which
   is a git submodule and is skipped by a plain clone.
3. On the `web` service set the domain to `https://<domain>` (the one from step 2). *Why:* Coolify's proxy then routes that
   hostname to `web` (port 80) and automatically requests a free Let's Encrypt HTTPS certificate. It can only do
   that if the A record from step 2 already points here. The `backend`, `db` and `backup` services get no domain: they must
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
| `BACKUP_BUCKET` | Step 1.4 |
| `BACKUP_ACCESS_KEY_ID` | Step 1.6 |
| `BACKUP_SECRET_ACCESS_KEY` | Step 1.6 |
| `STATS_URL` | Optional, the Streamlit Community Cloud app URL (`https://<app>.streamlit.app`) |
| `STATS_TEMPLATE_URL` | Optional, URL or sheet ID of the headers-only template Google Sheet (see §4.3) |
| `PUBLIC_URL` | `https://<domain>`. Required: password-reset links and the Google redirect URI are built from it. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional, enable "Sign in with Google" (see 4.1). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Required for password reset and password sign-up (STARTTLS, port defaults to 587). Without `SMTP_HOST` both return 503; links are never logged in prod. Setup: see [4.4](#44-email-smtp). |
| `SENTRY_DSN` | Optional, backend error reporting (see §10). Runtime. |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional, share of public read requests traced (default 1.0, all). Writes and scrapes are always traced. Lower it if Sentry's span usage nears the plan quota. |
| `VITE_SENTRY_DSN` | Optional, frontend error reporting (see §10). Must be available at **build** time. |
| `VITE_HOME_SLIDE_MS` | Optional, milliseconds between home-page image swaps (default 3000, minimum 1000). Must be available at **build** time (Coolify *Build time*), and a change needs a redeploy. |
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
uv run python scripts/create_admin.py <username> [team-slug] [--email EMAIL]
```

The script prompts for the password. An email is needed for password reset and Google sign-in. Team admins get theirs in the "מנהלי הקבוצה" section of the
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

### 4.3 Live stats (optional)

Lets admins open the BBStats Streamlit app from a game and start each game's sheet from a template.

1. Create a Google Sheet whose row 1 is exactly `#1,#2,#3,#4,#5,Points,Points Against,Quarter,Time Left` (one header
   per cell) and has no data rows. *Why:* BBStats reads these column names. *Verify:* the sheet has one filled row.
2. Click **Share → General access → Anyone with the link → Viewer**. *Why:* the site and the Streamlit app fetch the
   sheet without signing in, and copies made from it start with the same sharing. *Verify:* open the link in a private window.
3. In Coolify open the resource (as in §3 step 4) → **Environment Variables**, set `STATS_TEMPLATE_URL` to the
   sheet's URL (or just the sheet ID). Paste only that into *Value*, not `STATS_TEMPLATE_URL=…`; otherwise the link opens a
   broken `/admin/STATS_TEMPLATE_URL=…` page. *Why:* the admin form builds its "make a copy" link from it.
4. Set `STATS_URL` to the Community Cloud app URL (`https://<app>.streamlit.app`). *Why:* the live link opens it.
5. Click **Redeploy**. *Why:* the backend reads both at start.
6. Verify: log in, edit a game and click **גיליון חדש מתבנית**. Google's "Make a copy" page opens. Paste the copy's URL
   and click **טען סטטיסטיקה**. You see "הקישור נשמר — הגיליון עדיין ריק" and the schedule card shows
   **סטטיסטיקה חיה**.

### 4.4 Email (SMTP)

Password sign-up, the verify link and "forgot password" all send email. Without it they return 503.

1. Get SMTP credentials from any STARTTLS/587 provider. Example, Gmail: open
   [App passwords](https://myaccount.google.com/apppasswords) (needs 2-Step Verification), create one named
   "gush-ball", and copy the 16 characters without spaces. *Why:* Gmail rejects the normal password for SMTP.
   Hetzner blocks ports 25 and 465, so use 587.
2. In Coolify open the resource (as in §3 step 4) → **Environment Variables**, set `SMTP_HOST` (`smtp.gmail.com`),
   `SMTP_PORT` (`587`), `SMTP_USER` (your address), `SMTP_PASSWORD` (the app password; no spaces, `$` or quotes, per §3 step 4)
   and `SMTP_FROM` (the same address; Gmail rewrites any other From).
3. Click **Save**, then **Redeploy**. *Why:* the backend reads them at start.
4. Verify: sign up at `https://<domain>/admin/signup` with a real inbox. The page says "נרשמת! שלחנו קישור לאימות…" and
   the "אימות כתובת אימייל" email arrives (check spam). Also try "שכחתי סיסמה" on the login page.
5. If nothing arrives: Coolify → the backend service → **Logs**, search `SMTP`. An authentication error means a wrong
   password; a timeout means a wrong host or port. *Why:* sending is a background task, so failures never reach the page.

## 5. Nightly scrape

Coolify → the `backend` service → *Scheduled Tasks* → add, frequency `0 4 * * *`:

```bash
uv run python -m app.scrape
```

`app.scrape` runs standings, games, players, then leagues sequentially, respecting ibasketball.co.il's `Crawl-Delay: 10`; a failing team is
logged and skipped. The admin's "סנכרון עכשיו" button does the same on demand.

### 5.1 Evening scores and tables

A second, thin task refreshes only scores and tables on game nights (otherwise results wait for the 04:00 run).

1. Coolify → *Servers* → the server → *General* → read **Server Timezone**. *Why:* Coolify runs scheduled tasks in the
   server's timezone and has no per-task timezone ([docs](https://coolify.io/docs/core/automation/scheduled-tasks/overview)).
   *Verify:* it reads `Asia/Jerusalem`. If it reads UTC, don't change it: the server is shared with another site and the
   04:00 job would move too. Use the UTC form in step 3. (Not confirmed against the live server: write down here which one it is.)
2. Open the resource → `backend` service → *Scheduled Tasks* → *Add*. *Why:* the task runs inside the backend container.
   Name `evening-thin-scrape`, command `uv run python -m app.scrape --thin`, container `backend`.
3. Frequency: `0 21,22,23,0 * * *` on an Asia/Jerusalem server. On a UTC server use `0 18,19,20,21 * * *` in summer
   time (IDT, UTC+3, late March to late October) and `0 19,20,21,22 * * *` in winter (IST, UTC+2); re-edit it at each
   clock change. *Why:* repeated runs retry games that were still unfinished.
4. Click *Execute now*. *Verify:* the task log shows `Thin sync: no unscored games on YYYY-MM-DD, nothing to do`, or
   `Thin sync: N team(s) with unscored games on …` followed by `Sync finished: …`.
5. The admin equivalent for one league: Manage Leagues → **סנכרן תוצאות וטבלה**.

## 6. Nightly backup

The `backup` service in `docker-compose.prod.yml` dumps the DB to the private R2 backup bucket on every deploy and
nightly; a GitHub Action restores the newest dump every morning: [BACKUP.md, section 3](BACKUP.md#3-the-nightly-backup-to-r2).
*Why:* the database lives on this one machine; without an off-machine copy, a dead disk loses everything.

## 7. Verify a backup

The *Backup check* GitHub Action does this every morning. To do it by hand: [BACKUP.md, section 4](BACKUP.md#4-verify-an-r2-backup).
Taking a manual backup before a risky deploy and restoring production are in the same file.

## 8. Media bucket custom domain (optional)

Connect a custom domain to the media bucket (R2 → bucket → [*Custom domains*](https://developers.cloudflare.com/r2/buckets/public-buckets/#custom-domains))
and update `OBJECT_STORAGE_PUBLIC_URL`. Already-uploaded images keep their old r2.dev URLs in the DB, so leave r2.dev access on.

## 9. Search engines (SEO)

The site publishes `robots.txt`, a generated `/sitemap.xml`, social-preview tags and an admin `noindex` header. Absolute
URLs in them come from `PUBLIC_URL`.

1. In Coolify, confirm `PUBLIC_URL` (for example `https://example.com`, no trailing slash) is set for the whole app. The
   `web` service now reads it too, and the deploy fails with `required variable` if it is missing.
2. After the deploy, open `https://<domain>/robots.txt` and `https://<domain>/sitemap.xml`. The first must end with an
   absolute `Sitemap:` line with no `{{` in it; the second lists the team, player and page URLs.
3. View source on the home page and check that `og:image` is an absolute URL.
4. Open `view-source:https://<domain>/<team slug>` and `view-source:https://<domain>/players/<id>`. `og:title` must be
   the team or player name and `og:image` that logo or photo, with no `{{`. *Why:* WhatsApp and Facebook read only these
   tags, and they come from a per-page lookup (`/api/og`). Then paste both URLs into the
   [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) (press **Scrape Again**) and into a
   WhatsApp chat. If a page returns 500 or shows the default title everywhere, the lookup is failing: roll back the
   `{{with httpInclude ...}}` block in `frontend/index.html`.
5. Optional: add the site in [Google Search Console](https://search.google.com/search-console) and submit
   `/sitemap.xml`. It shows which pages are indexed and any rendering problems.

## 10. Error monitoring (Sentry)

Docs: [Sentry pricing](https://sentry.io/pricing/) · [FastAPI](https://docs.sentry.io/platforms/python/integrations/fastapi/) ·
[Vue](https://docs.sentry.io/platforms/javascript/guides/vue/). Without the DSNs the site runs normally and sends nothing.
The code sends no request bodies, cookies, component props or local variables, and no log breadcrumbs. Traces carry the user id only (no name or email) and no incoming query strings.

1. Sign up at [sentry.io/signup](https://sentry.io/signup/) and pick the **Developer** (free) plan. *Why:* it covers a
   small site. *Verify:* [pricing](https://sentry.io/pricing/) shows the current event quota.
2. Projects → *Create Project* → platform **FastAPI** → name `gush-ball-backend`. Copy the DSN from Settings → Projects →
   `gush-ball-backend` → *Client Keys (DSN)*. *Why:* this is the backend's address in Sentry. *Verify:* it looks like
   `https://<key>@o<id>.ingest.<region>.sentry.io/<n>`.
3. Create a second project the same way with platform **Vue**, named `gush-ball-frontend`, and copy its DSN.
4. In each project open *Alerts → Rules* and check that the default "new issue" rule emails you. *Why:* otherwise nobody
   hears about errors. *Verify:* your address is listed as the recipient.
5. In each project open *Settings → Security & Privacy*. Keep *Data Scrubber* and *Use Default Scrubbers* on and turn on
   *Prevent Storing of IP Addresses*. Then open *Advanced Data Scrubbing* → *Add Rule* → method **Mask**, data type
   **Email addresses**, source `**`. *Why:* a second privacy layer behind the SDK settings; the rule also catches an
   email inside an error message. See [Advanced Data Scrubbing](https://docs.sentry.io/security-legal-pii/scrubbing/advanced-datascrubbing/).
   *Verify:* the project's *Settings → Security & Privacy* page lists the rule, and *Prevent Storing of IP Addresses* shows as on.
6. In Coolify open the resource → **Environment Variables** and add `SENTRY_DSN` (backend DSN, runtime) and
   `VITE_SENTRY_DSN` (frontend DSN). Make `VITE_SENTRY_DSN` **available during build** (*Build time* dropdown, or the
   *Build Variable* checkbox on older Coolify). *Why:* Vite inlines it into the JavaScript at build time.
   *Verify:* both variables are listed on the page, and `VITE_SENTRY_DSN` is marked as a build variable
   ([Coolify docs](https://coolify.io/docs/knowledge-base/environment-variables)).
7. In Coolify open *Advanced → Build* and set **Source commit availability → Available during build**. *Why:* this passes
   the git sha as `SOURCE_COMMIT`, which becomes the Sentry release. Coolify keeps it off by default to preserve the
   build cache. *Verify:* the setting shows as enabled after saving
   ([Coolify docs](https://coolify.io/docs/knowledge-base/environment-variables)).
8. Click **Redeploy**. *Why:* both DSNs are read at start/build. *Verify:* the deployment log ends with a healthy
   container and the site loads.
9. Verify the backend: log in as a full admin and open `https://<domain>/api/health/sentry-test`. Expect an error
   response. *Verify:* within a minute the error appears under `gush-ball-backend` → Issues, its **Release** equals the
   deployed commit sha, and the alert email arrives.
10. Verify the frontend: log in as an admin and open `https://<domain>/admin/sentry-test`. You see the "משהו השתבש" page.
    *Verify:* the error appears under `gush-ball-frontend`. If not, look for a CSP error in DevTools → Console.
11. Verify tracing: as an admin press "סנכרון עכשיו". *Why:* every scrape kind is its own trace (each gets Sentry's
    1,000-span limit, which one whole run would exceed), so this proves tracing and the user id work end to end.
    *Verify:* in `gush-ball-backend` → *Explore → Traces* three `scrape` transactions appear, named `standings`, `games`
    and `players`, each with its SQL spans and httpx spans to ibasketball.co.il, and `user.id` set. Watch usage under
    [Stats → Usage](https://sentry.io/orgredirect/organizations/:orgslug/stats/).
12. Verify privacy: open one event. *Verify:* it has no email address, `Cookie` header or request body.

The nightly scrape (§5) needs no extra step: Coolify scheduled tasks run in the backend container and inherit
`SENTRY_DSN`; a failing team is reported as an error event, and each run is also three `scrape` traces (one per kind; a thin run gives two, games and standings).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Deploy fails: `required variable ... is missing` | An env var from step 3.4 isn't set in Coolify |
| Backend exits on start, `session_secret` validation error | `SESSION_SECRET` missing or under 32 chars |
| Backend can't connect to DB | `POSTGRES_PASSWORD` changed after the first boot (the DB keeps the old one) |
| Domain returns 502 / "no available server" | Domain set on the wrong service (must be `web`), or `web` failed to start |
| Admin login fails / CORS errors | `CORS_ORIGINS` doesn't match `https://<domain>` exactly |
| No events in Sentry | `SENTRY_DSN` unset or not redeployed; `VITE_SENTRY_DSN` not available at build time (§10 step 6) |
| Browser console: CSP `connect-src` blocks sentry.io | `connect-src` in `frontend/Caddyfile` lost `https://*.sentry.io` |
| Build fails at the `stats` context | Submodules not enabled on the Coolify resource |
| Upload returns 502 "Object storage is not configured correctly" | Wrong `OBJECT_STORAGE_*` value or token not scoped to that bucket |
| Upload works but image is broken | `OBJECT_STORAGE_PUBLIC_URL` wrong, or bucket public access off |
| Every `login ...` log line shows the same `ip=10.x`/`172.x` address, and logins return 429 for everyone | Caddy isn't trusting the Coolify proxy (`trusted_proxies` in `frontend/Caddyfile`), or the proxy topology changed |
| `backup` service log: `backup: FAILED, retrying in 5 minutes` | The line above it says why: `AccessDenied` = `BACKUP_*` wrong or token not scoped to `BACKUP_BUCKET`; `could not connect` = DB still starting (the retry fixes it) |
| *Backup check* Action fails | Its log says why: no dump in 26h (the `backup` service is down or failing), a broken dump, or a missing GitHub secret |

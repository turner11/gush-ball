# Gush Ball — project spec

Club basketball website: scraped external league data, curated by a single admin, served to
anonymous fans. Read this before picking up any GitHub issue — it carries the decisions and
rationale that aren't visible from the code alone. Setup/run commands live in README.md, not here.

## Phasing

Three deliberate phases, tracked as GitHub milestones with 20 filed issues. **Don't build ahead of
the current phase** — later-phase features were deferred for the reasons below, not forgotten.

- **Phase 1 — Core site** (issues #1–#12, plus #37 go-live on Hetzner): manually-populated public site + admin CRUD. No scraper.
- **Phase 2 — Scraper** (issues #13–#17): pulls standings/schedule/results/opponent logos from
  ibasketball.co.il into the *same tables* Phase 1 built, behind an admin review queue.
- **Phase 3 — Polish** (issues #18–#20): statistics, social embeds, dynamic team-color theming.

Most issues reference sibling issues in their own milestone — read the milestone, not just the one
issue, before starting.

## Domain model (the shape and the why — read the code for exact columns)

- `Team`: one of the club's *own* teams. Rich: colors, logo, socials, home court, content.
- `Opponent`: **not** a `Team`. Thin: name + logo + source URL, scraped or entered ad hoc. This
  split is deliberate — never fold opponents into the `Team` model to "save a table."
- `Player`: belongs to a `Team`; jersey number; images.
- `Game`: one `Team`'s schedule entry against an `Opponent`. Phase 2 adds scrape-bookkeeping
  columns (`source_event_id`, `is_scraped`, `needs_review`, `is_manually_overridden`) — Phase 1
  work should not add these early.
- `TeamLink` / `TeamVideo` / `TeamImage` / `TeamPost`: four separate small tables, deliberately not
  one polymorphic content table — the four types share no behavior beyond "belongs to a team."
- `StandingRow` (Phase 1 issue #4): designed so Phase 2's scraper upserts into the *same* table
  Phase 1's manual entry uses, keyed by league + team name.
- `AdminUser`: the only authenticated role anywhere in the system.

## Key decisions

- **Scrape source**: ibasketball.co.il is confirmed scrapable — robots.txt only blocks
  `/wp-admin/`, and the ToS has no anti-scraping clause. Standings come from a plain static HTML
  table (BeautifulSoup, no JS). Schedule/results/opponent logos come from the site's SportsPress
  plugin JSON REST API (`wp-json/sportspress/v2/events`, `.../teams`) rather than HTML parsing —
  it's cleaner and far more stable than scraping the DataTables markup. No headless browser is
  needed anywhere in this project.
- **Override protection**: a scraped update to a game the admin has manually edited never
  auto-applies. It lands as a diff suggestion in the review queue for the admin to accept or
  reject. Re-scraping must never silently clobber an admin edit.
- **Auth**: one `is_admin` flag, session cookie, no roles/OAuth/SSO. This is deliberately minimal
  for a club with one or a few admins — don't add a role hierarchy speculatively.
- **No fan/player accounts**: every public story (schedule, standings, scores, stats, "remembered
  team") is anonymous. "Remembered team" is a `localStorage` value, not a user profile.
- **i18n**: Hebrew + RTL only for v1 UI. Translatable fields (team/player names, post/link/video
  titles) carry an optional `_en` column so bilingual can switch on later without a schema
  rewrite — but no English UI, toggle, or translation workflow exists yet. Don't build the English
  UI ahead of it being asked for.
- **Hosting**: a single self-managed Hetzner machine running Postgres + backend + Caddy (static
  frontend, `/api/*` reverse proxy) via Docker Compose; CI deploys over SSH. Chosen over Render
  (whose free Postgres is deleted after ~44 days) because the machine already exists. Self-hosting
  the DB means nightly `pg_dump` backups to object storage are required, not optional. No domain
  yet → HTTP on the IP; HTTPS arrives with the domain via Caddy.
- **Media storage**: object storage (S3-compatible/R2), not local disk — keeps media off the single
  machine (survives rebuilds/loss) and the same bucket holds the DB backups.
- **Statistics are intentionally undesigned.** Real per-lineup +/- needs live substitution
  tracking that the scraped source can never provide (box scores only, no play-by-play) — this is
  a permanent limitation of the data source, not something a better scraper fixes. The user has an
  existing small app that tracks this; integration is still to be discussed. Don't design a stats
  data model beyond the existing "coming soon" empty state until that discussion happens.
- **No live scores.** Refresh-on-load is sufficient; no websockets/polling.
- **Design bar**: "professional" is anchored to four reference sites — maccabi.co.il, paobc.gr,
  nba.com/knicks, nba.com/heat — plus Tailwind and a headless Vue component kit (e.g. Reka UI).
  Treat these as the concrete bar for any UI work, not a vague adjective.

## Non-goals right now

Don't build these ahead of their phase, even if a related task makes them tempting:

- Stats UI/entry beyond the empty state (Phase 3, undesigned)
- Dynamic per-team color theming (Phase 3) — dark/light mode is a *different*, already-shipped
  feature; don't conflate the two
- Social media embeds (Phase 3)
- Live/real-time score updates
- English UI (schema is ready; UI is not)
- Admin roles/permissions beyond the single admin flag

## Where things live

- Setup/run commands: `README.md`
- Full backlog + per-issue rationale: GitHub milestones "Phase 1 — Core site",
  "Phase 2 — Scraper", "Phase 3 — Polish" on this repo
- Local Postgres: `docker-compose.yml`
- Backend models: `backend/app/models/`
- Bootstrap the first admin login: `backend/scripts/create_admin.py`

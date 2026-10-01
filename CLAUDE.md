# Gush Ball — project spec

Club basketball website: scraped external league data, curated by a club admin (and optional per-team admins), served to
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
- `LineupSnapshot`: raw per-snapshot lineup rows (5 jersey numbers, elapsed minutes, points for/against)
  belonging to a `Game`. `Game.stats_url` is the admin-set sheet they were loaded from; it is not a
  scrape field, so setting it never flags an override.
- `AdminUser`: the only authenticated role. Nullable unique `email` (lowercase). Nullable `team_id`: NULL = full admin, set = team admin who can write only that team's data (#129).

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
- **Auth**: one admin table plus a nullable `AdminUser.team_id` scope (NULL = full admin; set = team admin limited to that team's content/players/games plus sync), session cookie. Login is username or email + password, or "Sign in with Google" allowlisted to an existing `AdminUser.email` (verified email required, no auto-signup, disabled when `GOOGLE_CLIENT_ID` is unset), plus an emailed 1h single-use password-reset link. No roles. The server enforces the scope on every write (`RequireTeamAdmin` / `check_team_scope` in `app/deps.py`); `RequireAdmin` means full admin. Don't grow this into a role hierarchy speculatively.
- **No fan/player accounts**: every public story (schedule, standings, scores, stats, "remembered
  team") is anonymous. "Remembered team" is a `localStorage` value, not a user profile.
- **i18n**: Hebrew + RTL only for v1 UI. Translatable fields (team/player names, post/link/video
  titles) carry an optional `_en` column so bilingual can switch on later without a schema
  rewrite — but no English UI, toggle, or translation workflow exists yet. Don't build the English
  UI ahead of it being asked for.
- **Hosting**: a single self-managed Hetzner machine, shared with another site and managed by Coolify,
  running Postgres + backend + Caddy (static frontend, `/api/*` reverse proxy) via Docker Compose;
  Coolify's proxy owns 80/443 and TLS and deploys on push (CI only tests). Chosen over Render
  (whose free Postgres is deleted after ~44 days) because the machine already exists. Self-hosting
  the DB means nightly `pg_dump` backups to object storage are required, not optional. Served on its own
  domain (HTTPS via Coolify).
- **Media storage**: object storage (S3-compatible/R2), not local disk — keeps media off the single
  machine (survives rebuilds/loss) and the same bucket holds the DB backups.
- **Statistics (lineup +/-)**: real per-lineup +/- needs live substitution tracking that the scraped
  source can never provide (box scores only, no play-by-play) — a permanent limitation of the data
  source. BBStats (`stats/` git submodule, installed into the backend as the `bbstats` package) is the
  stats engine. The admin sets a Google Sheet/CSV URL per `Game` and loads it; the raw snapshots are
  stored in `LineupSnapshot`. Lineup stats for group size 1–5 and sort top/offense/defense are
  computed on read with `get_stats_from_raw_data`, with no precomputed aggregates. The public view is
  the lineups section on the roster page.
- **No live scores.** Refresh-on-load is sufficient; no websockets/polling.
- **Design bar**: "professional" is anchored to four reference sites — maccabi.co.il, paobc.gr,
  nba.com/knicks, nba.com/heat — plus Tailwind and a headless Vue component kit (e.g. Reka UI).
  Treat these as the concrete bar for any UI work, not a vague adjective.

## Quality bar

Every plan, change, and review is judged against this bar. The skills in `.claude/skills/` point here.

**Code**

1. **Debuggable and readable.** Names say what a thing is. Functions are short with early returns. Errors fail loud with
   the offending id or value in the message. A reader can follow the flow without jumping across files.
2. **KISS and YAGNI first, SOLID where it pays.** Build the smallest change that solves the issue. Give each function or
   module a single responsibility. Add an abstraction only when two real callers need it today.
3. **High cohesion, low coupling.** Behaviour lives in the module that owns its data: routers stay thin, scraping stays
   in `app/scrape*.py`, and Vue views compose components instead of copying them. A change to one feature touches one
   area. If a diff spreads across unrelated modules, find the missing seam before you continue.

**UX** (public site and admin alike; the reference sites above set the bar)

- **Beautiful and professional:** polished like a commercial sports site. Every UI change has deliberate loading,
  empty, and error states.
- **Intuitive and efficient:** the main action on each screen is obvious and takes the fewest clicks. No dead ends.
- **Fast to understand:** strong visual hierarchy. Score, opponent, and date read at a glance. Information is dense
  without clutter.
- **Consistent:** use the design system in `frontend/src/style.css`. That means the semantic color tokens (`surface`,
  `ink`, `muted`, `team`, …) and the component classes (`.card`, `.btn-primary`, `.page-header`, `.badge-*`,
  `.data-table`, …). Use a new token or class only after checking the existing ones; `design-tokens.spec.js` enforces
  part of this.
- **Responsive:** check at phone width (390px) and desktop width (1280px). There is no horizontal scroll. Tap targets
  are at least 44px.
- **Accessible:** AA contrast in both light and dark mode. Use semantic elements and labelled controls, and every
  interaction must work with the keyboard. Keep RTL correct by using logical `start`/`end` utilities, not
  `left`/`right`.

**Done** means every command in `.github/workflows/ci.yml` passes for each side you touched (backend: ruff + pytest;
frontend: test + build). A UI change also needs a visual check at both widths.

## Non-goals right now

Don't build these ahead of their phase, even if a related task makes them tempting:

- Stats beyond per-lineup +/- from admin-loaded BBStats sheets: no box-score stats, no in-site stat
  entry, no precomputed/stored aggregates
- Dynamic per-team color theming (Phase 3) — dark/light mode is a *different*, already-shipped
  feature; don't conflate the two
- Social media embeds (Phase 3)
- Live/real-time score updates
- English UI (schema is ready; UI is not)
- Admin roles/permissions beyond full admin + single-team admin

## Where things live

- Setup/run commands: `README.md`
- Full backlog + per-issue rationale: GitHub milestones "Phase 1 — Core site",
  "Phase 2 — Scraper", "Phase 3 — Polish" on this repo
- Local Postgres: `docker-compose.yml`
- Backend models: `backend/app/models/`
- Bootstrap the first admin login: `backend/scripts/create_admin.py`
- Statistics engine (BBStats, git submodule): `stats/`. It is installed into the backend as a uv path
  dependency (`bbstats`), so the submodule is required to build and test the backend.

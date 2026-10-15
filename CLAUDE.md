# Gush Ball — project spec

Basketball platform for any ibasketball team (GushBall is the first club on it; the brand is "GushBall"): scraped external
league data, curated by a club admin (and optional per-team admins), served to anonymous fans. Read this before picking up any GitHub issue — it carries the decisions and
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

- `Team`: a team on the site (any ibasketball team; GushBall's teams were the first). Rich: colors, logo, socials, home court, content, and an optional `club`, the name of a `Club` (id, name, ibasketball url; scraped fill-only, full-admin editable). `Team.club` and `Membership.club` are FKs to the unique `clubs.name` with ON UPDATE CASCADE, so a rename keeps club-admin scope.
- `Opponent`: **not** a `Team`. Thin: name + logo + source URL, scraped or entered ad hoc. This
  split is deliberate — never fold opponents into the `Team` model to "save a table."
- `League`: thin: ibasketball id, name, page URL, season start year. Current-season, non-empty leagues only, refilled nightly from `wp-json/sportspress/v2/leagues` (`sync_leagues`, unscoped syncs only). Teams link by `Team.ibasketball_league_url == League.url`, with no FK. Users can request a missing team (#351); follow-ups are #350 (picker), #351, #352.
- `Player`: belongs to a `Team`; jersey number; images; optional `user_id` link to an account (#329).
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
- `AdminUser`: every login account (the table keeps its historic name). Nullable unique `email` (lowercase). `is_full_admin` (set only by the migration and `scripts/create_admin.py`, never by an API) = full admin. Any other rights come from `Membership` rows.
- `Membership`: one user's grant on one `Team` **or** one club (the `Team.club` string, exactly one of the two), with `role` `pending | member | admin`. A user may hold many (#249): admin of several teams or clubs, across clubs.

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
- **Auth**: `AdminUser.is_full_admin` for full admins, plus `Membership` rows with `role='admin'` (team admin = that team's content/players/games plus sync; club admin = the same on every team of that club, plus assigning team admins inside it). Only a full admin creates accounts or assigns club admins. Session cookie. Login is username or email + password, or "Sign in with Google" (verified email required, disabled when `GOOGLE_CLIENT_ID` is unset; an unknown verified email creates a rights-less player account whose username is the Google display name, never the email (#249)), plus an emailed 1h single-use password-reset link, or self-signup with username + email + password (#259): the email is stored only once its emailed 1h link is used, so an unverified address is never a Google/reset key. No roles beyond full / club / team admin; `pending`/`member` memberships carry no admin rights. The server enforces scope on every write (`RequireAnyAdmin` requires an admin grant; `RequireTeamAdmin` / `check_team_scope` / `check_admin_grant` in `app/deps.py`); `RequireAdmin` means full admin. `RequireStatsViewer` gates stats reads (any `member`/`admin` row or full admin). A user linked to a `Player` (`Player.user_id`, set by that team's admins) may edit that row's `name`/`name_en` and photos only (`check_player_self_or_team_admin` in `app/deps.py`); this is a per-row self-edit right, not a role (#329), and `user_id` is returned only to admins of that team. Don't grow this into a role hierarchy speculatively.
- **Player accounts, no fan accounts**: a player signs up with Google or a password and asks to join a team (approved by that team's admin, its club admin, or a full admin) or a club (approved by a full admin only) from `/join`; admins approve or reject on the admin home. Approval makes a `member`, never an admin. An approved membership (or any admin grant) unlocks the `/stats` page for every team; everything else (schedule, standings, scores, "remembered team") stays anonymous. "Remembered team" is a `localStorage` value, not a user profile.
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
  computed on read with `get_stats_from_raw_data`, with no precomputed aggregates. The `/stats` page (per game or all games) and its API
  are for approved members and admins only (`RequireStatsViewer` in `app/deps.py`, #249): anonymous visitors get a
  sign-in/join prompt, the page is `noindex` and out of the sitemap, and the raw sheet URL (`Game.stats_url`) is sent
  only to admins who can write that team.
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
- Admin roles/permissions beyond full admin + club admin + team admin (one user may hold several team/club grants); a linked player's self-edit of their own row is not a role

## Where things live

- Setup/run commands: `README.md`
- Full backlog + per-issue rationale: GitHub milestones "Phase 1 — Core site",
  "Phase 2 — Scraper", "Phase 3 — Polish" on this repo
- Local Postgres: `docker-compose.yml`
- Backend models: `backend/app/models/`
- Bootstrap the first admin login: `backend/scripts/create_admin.py`
- Statistics engine (BBStats, git submodule): `stats/`. It is installed into the backend as a uv path
  dependency (`bbstats`), so the submodule is required to build and test the backend.

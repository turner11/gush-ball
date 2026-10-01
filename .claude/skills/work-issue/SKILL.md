---
name: work-issue
description: >-
  Works on a GitHub issue using TDD (Red→Green→Refactor) with a clean branch and
  draft PR. Use when the user wants to pick up, fix, implement, or start work on
  a GitHub issue — e.g. "work on issue", "fix bug #N", "pick up an issue", or
  "start a new task". Usage: /work-issue [issue-number]
argument-hint: "[issue-number]"
allowed-tools: Bash, PowerShell, Read, Write, Edit, Glob, Grep, Agent, Skill
---

Work on a GitHub issue using TDD. Argument: `$ARGUMENTS`. The **quality bar** in `CLAUDE.md` (code, UX, "Done") is the
standard for every step.

## Step 1 — Parse Arguments

A positive integer (with or without `#`) → the issue number; go to **Step 3**. Empty → Step 2. Anything else → say it's
invalid and ask for an issue number, or blank to browse.

## Step 2 — Rank Open Issues

```bash
gh issue list --state open --limit 100 --json number,title,labels,createdAt,reactionGroups
```

Rank: `bug` first → severity `critical` > `high` > `medium` > `low` > none → reactions desc → oldest first. Show a
numbered table and ask which one to work on.

## Step 3 — Read the Issue & Explore

Fetch it fresh, even if you read it earlier in the session. The user edits issue bodies to answer questions:

```bash
gh issue view <number> --comments
```

Closed issue → ask before proceeding. `Depends on #N` still open → say it's blocked and ask.

Trace the real flow end to end before planning: grep for the names in the issue, read the code and its tests, and find
the helpers, components, and `style.css` classes you will reuse. Backend tests live in `backend/tests/` (pytest).
Frontend specs sit next to their component as `*.spec.js` (vitest).

Print: issue title, affected layer(s), files found, and your plan.

## Step 4 — Clean State & Branch

**Already in a worktree on a feature branch** (fan-out did this) → skip this step.

Otherwise: `git status --porcelain` must be empty. If it isn't, ask whether to stash (restore with `git stash apply`),
commit, or abort. Then:

```bash
git fetch origin
git checkout -b <branch> origin/master        # bug → fix/issue-<N>-<slug>, else feat/issue-<N>-<slug>
git submodule update --init                    # stats/ is required for backend tests
```

Slug = title lowercased, non-alphanumerics → `-`, ≤40 chars at a word boundary. If the branch already exists, ask
whether to continue it or start fresh.

**Before every commit in the steps below**, `git branch --show-current` must not be `master`. The user may merge or
switch branches between turns.

## Step 5 — 🔴 Red: Failing Tests

Write tests that pin down the exact behaviour in the issue's "Definition of done". Extend existing tests rather than
duplicating them. Run them and watch them fail for the right reason.

Report `🔴 Red: <N> test(s) failing as expected`. Commit `test: add failing tests for #<N> — <what>`.

## Step 6 — 🟢 Green: Minimal Implementation

Write the smallest change that turns the tests green. Reuse existing helpers and components. Leave unrelated code
alone.

If you add a migration, generate it with `uv run alembic revision -m "<what>"`. That gives it a random revision id, and
`test_single_alembic_head` guards it. Delete unused `op`/`sa` imports and `pass` bodies from the generated file so ruff
passes.

**UI changes** must meet the UX bar: compose the existing `style.css` tokens and component classes, handle the
loading / empty / error states, keep RTL correct, and keep everything keyboard-reachable.

Report `🟢 Green: <N> test(s) passing`. Commit `fix:` (bug label) or `feat:` + `Closes #<N>`.

## Step 7 — ✅ Refactor

Re-read the diff against the code bar in `CLAUDE.md`. Is it debuggable? Does each function have one job? Is new code
placed in the module that owns the behaviour? Is it duplicated with an existing helper? Fix whatever fails and re-run
the tests. Report `✅ Refactor: <what changed>` or `✅ Refactor: no changes needed`. Commit `refactor: <what>` if code
changed.

## Step 8 — CI Gate (+ visual check for UI)

Run **every** command from `.github/workflows/ci.yml` for each side you touched, exactly as CI runs them:

```bash
(cd backend  && uv run ruff check . && uv run pytest -q)
(cd frontend && npm run test && npm run build)
```

All of them must pass. pytest alone is not the gate: ruff fails CI on its own.

**Visual check (any `frontend/` change).** Run the app on ports unique to this issue, because parallel worktrees
otherwise collide on 8000/5173. Copy `backend/.env` from the main checkout if the worktree has none:

```bash
# backend port = 9000 + issue number, frontend port = 7000 + issue number (e.g. #42 → 9042 / 7042)
(cd backend  && uv run uvicorn app.main:app --port 9042)
(cd frontend && API_TARGET=http://localhost:9042 npm run dev -- --port 7042 --strictPort)
```

If a browser tool is available, open each changed page at 390px and 1280px wide, in light and dark mode. Check it
against the UX bar: hierarchy, spacing, overflow, tap targets, contrast, RTL. Fix what looks off before the PR. With no
browser tool, write "visual check not done" in the PR's test plan so the reviewer and user know.

Report `✅ CI: <commands> all green` (+ `✅ Visual: checked at 390/1280, light/dark`).

## Step 9 — Rebase, Push, Draft PR

Rebase onto current master so the PR merges cleanly. Then re-run Step 8 if anything changed. If
`test_single_alembic_head` goes red, master gained a migration: re-point yours with `down_revision`.

```bash
git fetch origin && git rebase origin/master
git push -u origin <branch>   # --force-with-lease after a rebase of an already-pushed branch
```

Fill `assets/pr-template.md`, write it to a temp file, and open the PR:

```bash
gh pr create --draft --base master --title "<issue title>" --body-file <file>
```

If a PR already exists for the branch, `gh pr view <branch>` instead.

**Verify before you report:** `git log origin/<branch> -1` shows your last commit, and `gh pr checks <pr>` is pending
or green. Then return the PR URL.

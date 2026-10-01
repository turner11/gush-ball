---
name: fan-out-issues
description: "Work several GitHub issues in parallel, each in its own git worktree: plan → execute → adversary review ↔ fix. Usage: /fan-out-issues [concurrency] [#N ...]"
argument-hint: "[concurrency] [#N ...]"
allowed-tools: Bash, PowerShell, Read, Grep, Glob, Agent, Skill
disable-model-invocation: true
---

Work a wave of issues **in parallel**, one git worktree each. You are the orchestrator. You make every workflow decision
(ranking, wave, branch names, prompts, retries, gates). Subagents run the per-issue skills. Run `gh` and `git` directly.

Every subagent works to the **quality bar** in `CLAUDE.md` (code + UX + "Done"). Name it in every prompt.

## Models

Set `model` on every Agent call:

| Phase                        | Model    | Why                                                       |
|------------------------------|----------|-----------------------------------------------------------|
| Plan (5b), Review (7a)       | `opus`   | Low volume and high leverage: over-engineering starts here |
| Execute (5c), Fix pass (7c)  | `sonnet` | High volume and mechanical, guarded by the CI gate         |
| Escalation (stalled fix)     | `opus`   | Only that one retry, never the whole wave                  |

On a rate-limit / session-limit error (HTTP 429), stop launching agents. Report what finished and what is pending, and
end the run. The user re-runs after the reset.

## Step 1 — Parse Arguments

`$ARGUMENTS` = `[concurrency] [#N ...] [free-text note]`, in any combination:

- A leading positive integer → concurrency (default **3**).
- `#N` or a bare `N` after it → **explicit issues**. The wave is exactly these: skip ranking (Step 3), but still apply
  Step 3's exclusions and Step 4's overlap check, and say why for any you defer.
- Free text (e.g. "I think #18 might be already implemented") → a hint for the planner. Pass it on verbatim.

## Step 2 — Fetch Issues (always fresh)

Re-fetch on every run, including re-runs after an interrupt. The user often answers questions by editing the issue body.

```bash
gh issue list --state open --limit 100 --json number,title,body,labels,createdAt,reactionGroups
```

Dependencies are prose: a `Depends on #43` line, or a line naming another issue's title. An issue `is_blocked_by` every
named dependency that is still open (`gh issue view <N> --json state` if it wasn't fetched). `blocks` is the reverse
count.

## Step 3 — Rank & Filter

**Exclude:** blocked by an open issue; already has an open PR or a live `fix|feat/issue-<N>-*` branch
(`gh pr list --state open --search "<N> in:title,body"`, `git ls-remote --heads origin`); labeled `later`.

**Sort:** `bug` first → severity `critical` > `high` > `medium` > `low` > none → blocks-count desc → reactions desc →
oldest first.

## Step 4 — Assemble a Non-Conflicting Wave

Predict each candidate's touched files (title + body, confirmed with `grep`/`glob`). Walk the ranked list. Add an issue
only if its file set is disjoint from the issues already picked. Stop at `concurrency`.

**Shared hotspots** are files that every feature edits a line of. Overlap on these alone does not defer an issue.
Instead, Step 6 rebases them:
`backend/app/main.py` (router registration), `backend/alembic/versions/` (new migration files),
`frontend/src/router/`.

Print the plan before spawning:

```text
Wave (concurrency 3):
 1. #42 [bug][high] Crash on empty game list  → app/routers/games.py, GamesView.vue   [UI]
 2. #37 [bug, blocks 2] Standings sync fails  → app/scrape_standings.py
Deferred: #40 (overlaps #42), #33 (blocked by #37)
```

Tag `[UI]` on any issue that touches `frontend/`. Those issues get the visual check.

## Step 5 — Fan Out: Plan → Execute

**a. Worktree** on a fresh branch off `origin/master` (`bug` → `fix/`, else `feat/`; slug = title lowercased,
non-alphanumerics → `-`, ≤40 chars at a word boundary):

```bash
git fetch origin
git worktree add -b <branch> ../issue-<N> origin/master
git -C ../issue-<N> submodule update --init     # stats/ (bbstats) is required for backend tests
```

**b. Plan** (`opus`, foreground: the executor needs the plan):

> Working directory: `../issue-<N>`. Run the **plan-issue** skill for issue **#<N>** and write the plan to
> `../issue-<N>-plan.md`. User hint: <hint or "none">. Return the plan path and a 2–3 sentence summary.

**c. Execute** (`sonnet`, `run_in_background: true`). Launch all executors concurrently:

> Working directory: `../issue-<N>`. Follow the plan at `../issue-<N>-plan.md` using the **work-issue** skill for
> **#<N>**, starting at Step 5 (🔴 Red); the worktree and branch already exist. Meet the quality bar in `CLAUDE.md`.
> Stay inside the plan's "Out of scope". If you add a migration, generate it with `alembic revision` (never hand-type a
> revision id). **Fail gate:** if any CI command (work-issue Step 8) is red, do NOT open a PR; report what failed.
> On success, report the PR URL and the CI commands you ran with their results.

## Step 6 — Collect Results & Enforce the Gate

When each executor finishes:

- **Success** → before review, rebase onto the latest master. The other PRs in the wave may have merged in the meantime:
  `git -C ../issue-<N> fetch origin && git -C ../issue-<N> rebase origin/master`. Resolve conflicts on the shared
  hotspots by keeping both sides. If the branch has a migration, `uv run alembic heads` must print exactly one head;
  otherwise re-point its `down_revision` at master's head. Compare revision ids across the wave's PRs. Re-run the CI
  commands, then `git push --force-with-lease`.
- **Failure** → record the reason and keep the worktree. No review.

## Step 7 — Adversary Review ↔ Fix Loop (max 3 rounds)

**a. Review** (`opus`, background):

> Run the **adversary-review** skill on PR **#<pr>**. Post your notes to the PR and return the bottom-line verdict plus
> every open 🔴 and 🟡 item verbatim.

**b. Branch on the verdict:**

- **READY TO MERGE** → done. Clean up only after `git -C ../issue-<N> status --short` is empty and
  `git -C ../issue-<N> log origin/<branch>..HEAD` is empty. Then run `git worktree remove --force ../issue-<N>`
  (`--force` is needed because of the submodule) and delete the plan.
- **NEEDS CHANGES** → fix pass (c), then back to (a).
- **BLOCK** → stop. Keep the worktree and hand it back to the user (d).

**c. Fix pass** (`sonnet`; `opus` if the previous pass on this PR stalled):

> Working directory: `../issue-<N>`. Fix these open items: 🔴 <verbatim>; 🟡 <verbatim>. Make the smallest correct
> change inside the plan at `../issue-<N>-plan.md` and the quality bar in `CLAUDE.md`. Re-run every CI command
> (work-issue Step 8). **Fail gate:** red → do NOT push; report what failed. Green → commit, push, and report done.

**d. Hand back to the user** on: BLOCK; the same 🔴 surviving two reviews after the escalation; a fix pass that can't
go green on `opus`; or the 3-round cap.

## Step 8 — Report

One line per issue. Show a severity icon only for a category that still has open items:

```text
✅ #42  fix/issue-42-crash-empty-games   → PR #210 — READY ✅ after 2 rounds (worktree removed)
🛑 #37  fix/issue-37-standings-sync      → PR #211 — BLOCK (2 🔴), worktree kept at ../issue-37
🔧 #51  feat/issue-51-language-filter    → PR #212 — stalled at cap (1 🟡 open), worktree kept at ../issue-51
❌ #60  feat/issue-60-add-export         → CI red (ruff LOG015), worktree left at ../issue-60
⏭  Deferred: #40, #33
```

Then list which PRs need a human decision and why, and every `[UI]` PR whose visual check was not done. Re-running
`/fan-out-issues` picks up deferred and newly-unblocked issues.

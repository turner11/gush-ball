---
name: plan-issue
description: "Produce a minimal, YAGNI/ponytail-aligned implementation plan for a GitHub issue: root cause, exact files and functions to change, the failing tests to write, the smallest fix, reuse notes, and what to leave alone. Runs at higher effort and hands the plan to a cheaper worker to execute. Use as the planning step in fan-out-issues, or before implementing any issue. Usage: /plan-issue <issue-number>"
argument-hint: "<issue-number>"
allowed-tools: Bash, PowerShell, Read, Grep, Glob, Write
---

Plan the smallest correct change for a GitHub issue so a cheaper model can execute it without re-deriving anything.
Write **only the plan**: no implementation or test code. Argument: `$ARGUMENTS` = issue number. The **quality bar** in
`CLAUDE.md` is what the plan must deliver.

## Step 1 — Read the Issue (fresh)

```bash
gh issue view <number> --comments
```

Always re-fetch it. The user edits issue bodies to answer questions. Issues use `Goal` / `Scope` /
`Definition of done` / `Out of scope`: treat these verbatim as the acceptance criteria and the scope boundary. If there's
a `Depends on` line, confirm that issue is closed. If the caller passed a user hint (e.g. "might already be
implemented"), verify it against the code first. An already-done issue gets a one-line plan that says so.

## Step 2 — Explore Before You Plan

The step is done when you can name every file the change touches and what reads or writes that data.

- Grep the names from the issue and trace the real flow end to end: router → model → scraper, or view → component →
  API.
- Read the affected code **and** its tests (`backend/tests/` pytest; `frontend/src/**/*.spec.js` vitest) to learn
  their fixtures and style.
- Hunt for reuse: backend helpers in `app/deps.py`, `app/storage.py`, `app/scrape.py`; frontend components in
  `frontend/src/components/`, `composables/`, `lib/` (api, format, games), and the `style.css` tokens and classes.
- For a bug, grep **every caller** of the function you'd touch. Fix the shared function once.

## Step 3 — Pick the Smallest Correct Change

Stop at the first rung that holds, and record it:

1. Does this need building at all? (YAGNI)
2. Does it already exist in this codebase? Reuse it.
3. Does the stdlib, an installed dependency, or a native platform feature do it?
4. Can it be one line?
5. Only then: the minimum code that works.

Then place it for **cohesion**: which module owns this behaviour? The change goes there, and callers stay thin.

## Step 4 — Write the Plan

Write it to the path the caller gave (fan-out uses `../issue-<N>-plan.md`, outside the worktree):

```markdown
# Plan: #<N> <title>

## Root cause / goal
<2-4 sentences. For bugs: the actual cause, not the symptom.>

## Ladder rung
<e.g. "Rung 2 — reuse `check_team_scope` in app/deps.py">

## Files to change
- `backend/app/…` — <function/class and what changes>
<Each behaviour lives in its owning module; say which and why if not obvious.>

## Reuse (do not reinvent)
- <existing helper / component / style.css class, with path>

## UX design  (only if the issue touches frontend/)
- Layout at 390px and 1280px: <what goes where, what collapses or stacks>
- Hierarchy: <the one thing the eye lands on first>
- States: loading <…>, empty <…>, error <…>
- Building blocks: <existing components + style.css classes/tokens; any new class justified>
- A11y: <keyboard path, labels, contrast-sensitive bits, RTL notes>

## 🔴 Red — tests to add
- `<path>::<test name>` — <behaviour asserted, tied to Definition of done>

## 🟢 Green — minimal implementation
<approach in words, no code. Migrations: `uv run alembic revision`, never a hand-typed id.>

## The one runnable check
<the single check that fails if this logic breaks (trivial one-liners exempt)>

## Out of scope — do NOT touch
<copy the issue's Out of scope + anything tempting nearby>

## Open risks
<edge cases, shared hotspots (main.py, alembic, router) likely to conflict, unknowns>
```

## Step 5 — Hand Off

Return the plan path and a 2–3 sentence summary: the root cause, the rung, and the number of tests planned. Mark it
`[UI]` if it has a UX design section.

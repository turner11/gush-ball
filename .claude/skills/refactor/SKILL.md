---
name: refactor
description: >-
  Performs surgical code refactoring to improve maintainability without changing
  behavior. Use when code is hard to understand, functions are too large, code
  smells need addressing, adding features is difficult, or the user asks to
  clean up or refactor code.
license: MIT
---

# Refactor

Change how the code works, never what it does, so that it moves closer to the code bar in `CLAUDE.md`: debuggable,
small, cohesive, loosely coupled. A good refactor here usually makes the code **shorter**.

`$ARGUMENTS` = a file or folder to scope to. If it's empty, ask the user for a scope. Whole-repo refactors produce
unreviewable diffs.

## Workflow

1. Work on a branch, never `master`: `git checkout -b refactor/<scope> origin/master`.
2. Make sure tests cover the target behaviour. Add the missing ones first, and commit them green.
3. Find the worst smell in scope (see [reference.md](reference.md)) and apply **one** transformation.
4. Run the CI commands for that side (`.github/workflows/ci.yml`). Commit `refactor: <what>` when green.
5. Repeat until the scope reads cleanly. Then open a PR that lists each transformation.

Keep feature changes and refactoring in separate commits: a behaviour change found mid-refactor is a new issue.

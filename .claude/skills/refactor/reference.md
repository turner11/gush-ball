# Refactor reference

Smells to look for in this repo (FastAPI + SQLAlchemy backend, Vue 3 + Tailwind frontend). Each fix should leave the
code closer to the quality bar in `CLAUDE.md`, and smaller. If a fix adds a class, interface, or layer, it is the wrong
fix.

## Readability / debuggability

| Smell | Fix |
|---|---|
| Function > ~40 lines or doing two jobs | Extract the second job into a named function in the same module |
| Nested `if` pyramid | Guard clauses and early returns |
| `except Exception: pass`, or logging without the id | Let it raise, or log with `logger.exception("… %r", team_id)` |
| Magic number/string used twice | Module-level constant next to its use |
| Name that needs a comment | Rename; delete the comment |
| Dead code, commented-out code, unused import | Delete it (git has it) |

## Cohesion / coupling

| Smell | Fix |
|---|---|
| Query or business logic inside a router | Move it to the model or service function that owns the data; router stays thin |
| Same helper in two modules | Keep one, import it (check `app/deps.py`, `frontend/src/lib/` first) |
| Feature envy: function mostly reads another module's data | Move it into that module |
| Long parameter list passed through layers | Pass the model or a dict the callee already understands |
| Vue view duplicating markup from another view | Extract a component into `frontend/src/components/` |
| Raw Tailwind colors / repeated utility soup | Use the `style.css` semantic tokens and component classes |
| Fetch logic copied across views | A composable in `frontend/src/composables/` |

## Inline (the most common good refactor here)

- An interface, base class, or factory with one implementation → inline it.
- A wrapper that only forwards its arguments → call the target directly.
- Config or a parameter that only ever takes one value → hard-code it.

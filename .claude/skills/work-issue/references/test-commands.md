# Test Commands

This file is a reference for common test runner patterns. The skill should auto-detect the correct commands by inspecting project config files during Step 3.

## Auto-Detection Strategy

Look for these files at the project root (or in the affected module) to determine the test framework and commands:

| Config file | Framework | Targeted command | Full suite command |
|---|---|---|---|
| `pytest.ini` / `pyproject.toml` / `setup.cfg` (with pytest section) | pytest | `pytest -v -k "<test name>"` | `pytest -v` |
| `tox.ini` | tox + pytest | `tox -e py -- -k "<test name>"` | `tox` |
| `package.json` (with `test` script) | jest / vitest / mocha | `npm run test -- <test file>` | `npm run test` |
| `build.gradle` / `build.gradle.kts` | JUnit (Gradle) | `./gradlew test --tests "<TestClass>"` | `./gradlew test` |
| `pom.xml` | JUnit (Maven) | `mvn test -Dtest=<TestClass>` | `mvn test` |
| `Makefile` (with `test` target) | varies | `make test` | `make test` |
| `.csproj` (with test references) | nUnit / xUnit | `dotnet test --filter "<TestName>"` | `dotnet test` |

## Notes

- This project uses **pytest** (see `smart-home-hub-spec.md` §15). Full suite: `pytest -v` (or
  `PYTHONPATH=src pytest -v` once code lives under `src/`). Targeted: `pytest -v -k "<test name>"`.
- Test layout isn't established yet (no code exists). Check for an existing `tests/` tree before creating a new
  test file, and follow whatever convention is already there.
- When in doubt, check `.github/workflows/` for the CI job — it shows exactly how CI runs the suite.

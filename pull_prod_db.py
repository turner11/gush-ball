# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Copy the prod DB into the local dev DB (wipes local).

    uv run pull_prod_db.py root@<server-ip>     # or set PROD_SSH=root@<server-ip>

Needs `ssh` (key auth to the server) and Docker with the local compose stack.
The dump is kept as gush_ball-prod-<date>.dump (gitignored) next to this script.
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROD_CONTAINER = "gush-ball-db"  # fixed container_name in docker-compose.prod.yml


def run(cmd: list[str], **kwargs) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, cwd=ROOT, **kwargs)


def dump_prod(ssh_target: str, out: Path) -> None:
    # Write to .tmp first so a failed/partial dump never looks like a good one.
    tmp = out.with_suffix(".tmp")
    try:
        with tmp.open("wb") as f:
            run(
                [
                    "ssh",
                    ssh_target,
                    f"docker exec {PROD_CONTAINER} pg_dump -U gush_ball -Fc gush_ball",
                ],
                stdout=f,
            )
        tmp.replace(out)
    finally:
        tmp.unlink(missing_ok=True)
    print(f"wrote {out.name} ({out.stat().st_size:,} bytes)")


def restore_local(dump: Path) -> None:
    run(["docker", "compose", "up", "-d", "--wait", "db"])
    with dump.open("rb") as f:
        run(
            [
                "docker",
                "compose",
                "exec",
                "-T",
                "db",
                "pg_restore",
                "-U",
                "gush_ball",
                "-d",
                "gush_ball",
                "--clean",
                "--if-exists",
                "--no-owner",
            ],
            stdin=f,
        )
    print("local db now matches prod")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "ssh_target",
        nargs="?",
        default=os.environ.get("PROD_SSH"),
        help="e.g. root@1.2.3.4",
    )
    parser.add_argument(
        "--dump",
        type=Path,
        help="skip the download and restore this existing dump file",
    )
    parser.add_argument(
        "-y", "--yes", action="store_true", help="don't ask before wiping the local db"
    )
    args = parser.parse_args()

    if args.dump is None and not args.ssh_target:
        parser.error("give the ssh target (root@<server-ip>) or set PROD_SSH")
    if args.dump is not None and not args.dump.is_file():
        parser.error(f"dump file not found: {args.dump}")

    if not args.yes and input("This WIPES the local dev db. Type yes: ") != "yes":
        sys.exit("aborted")

    dump = args.dump
    if dump is None:
        dump = ROOT / f"gush_ball-prod-{time.strftime('%Y-%m-%d')}.dump"
        dump_prod(args.ssh_target, dump)
    restore_local(dump.resolve())


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.exit(f"failed (exit {e.returncode}): {' '.join(e.cmd)}")

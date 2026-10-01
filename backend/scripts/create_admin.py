"""One-off CLI to bootstrap an admin login. Usage:

    uv run python scripts/create_admin.py <username> <password> [team-slug] [--email EMAIL]
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.db import SessionLocal
from app.models import AdminUser, Team
from app.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("username")
    parser.add_argument("password")
    parser.add_argument("team_slug", nargs="?")
    parser.add_argument("--email")
    args = parser.parse_args()

    if "@" in args.username:
        print("Username must not contain '@' (login treats it as an email).")
        raise SystemExit(1)

    email = args.email.strip().lower() if args.email else None
    if email is not None and "@" not in email:
        print(f"Invalid email '{args.email}'.")
        raise SystemExit(1)

    with SessionLocal() as db:
        team_id = None
        if args.team_slug:
            team = db.scalar(select(Team).where(Team.slug == args.team_slug))
            if team is None:
                print(f"No team with slug '{args.team_slug}'.")
                raise SystemExit(1)
            team_id = team.id
        db.add(
            AdminUser(username=args.username, email=email, password_hash=hash_password(args.password), team_id=team_id)
        )
        db.commit()

    print(f"Created admin user '{args.username}'.")


if __name__ == "__main__":
    main()

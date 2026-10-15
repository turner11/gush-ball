"""One-off CLI to bootstrap an admin login. No team slug = full admin (the only way to make one besides the
migration); with a slug = admin of that team only. Usage:

    uv run python scripts/create_admin.py <username> [team-slug] [--email EMAIL]

The password is prompted for, so it never lands in argv or shell history.
"""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.db import SessionLocal
from app.models import AdminUser, Membership, Team
from app.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("username")
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

    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Repeat password: "):
        print("Passwords do not match.")
        raise SystemExit(1)
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        raise SystemExit(1)

    with SessionLocal() as db:
        team = None
        if args.team_slug:
            team = db.scalar(select(Team).where(Team.slug == args.team_slug))
            if team is None:
                print(f"No team with slug '{args.team_slug}'.")
                raise SystemExit(1)
        user = AdminUser(
            username=args.username, email=email, password_hash=hash_password(password), is_full_admin=team is None
        )
        if team is not None:
            user.memberships.append(Membership(team_id=team.id, role="admin"))
        db.add(user)
        db.commit()

    print(f"Created admin user '{args.username}'.")


if __name__ == "__main__":
    main()

"""One-off CLI to bootstrap the first admin login. Usage:

    uv run python scripts/create_admin.py <username> <password> [team-slug]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.db import SessionLocal
from app.models import AdminUser, Team
from app.security import hash_password


def main() -> None:
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        raise SystemExit(1)

    username, password = sys.argv[1], sys.argv[2]

    with SessionLocal() as db:
        team_id = None
        if len(sys.argv) == 4:
            team = db.scalar(select(Team).where(Team.slug == sys.argv[3]))
            if team is None:
                print(f"No team with slug '{sys.argv[3]}'.")
                raise SystemExit(1)
            team_id = team.id
        db.add(AdminUser(username=username, password_hash=hash_password(password), team_id=team_id))
        db.commit()

    print(f"Created admin user '{username}'.")


if __name__ == "__main__":
    main()

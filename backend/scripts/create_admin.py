"""One-off CLI to bootstrap the first admin login. Usage:

    uv run python scripts/create_admin.py <username> <password>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models import AdminUser
from app.security import hash_password


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(1)

    username, password = sys.argv[1], sys.argv[2]

    with SessionLocal() as db:
        db.add(AdminUser(username=username, password_hash=hash_password(password)))
        db.commit()

    print(f"Created admin user '{username}'.")


if __name__ == "__main__":
    main()

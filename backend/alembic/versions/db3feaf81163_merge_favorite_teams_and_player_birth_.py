"""merge favorite_teams and player_birth_date heads

#398 and #399 were both generated off 31a6a2099d04 and merged in turn, leaving two heads, so the
container's `alembic upgrade head` failed and the backend never started (#400). A merge revision
(not a re-pointed down_revision) upgrades a DB sitting at either head.

Revision ID: db3feaf81163
Revises: 170a5b0740be, c22bc8381ffd
Create Date: 2026-10-16 11:58:30.130075

"""

revision: str = "db3feaf81163"
down_revision: tuple[str, str] = ("170a5b0740be", "c22bc8381ffd")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

"""games source_event_id unique per team

Derby events belong to two club teams, so uniqueness is per team. Downgrade fails once derby pairs exist.

Revision ID: 06b7cec9b2c5
Revises: a5bfd3c0a188
Create Date: 2026-10-14 12:10:00.343386

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "06b7cec9b2c5"
down_revision: str | Sequence[str] | None = "a5bfd3c0a188"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_games_source_event_id", "games", type_="unique")
    op.create_unique_constraint(
        "uq_games_team_source_event", "games", ["team_id", "source_event_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_games_team_source_event", "games", type_="unique")
    op.create_unique_constraint("uq_games_source_event_id", "games", ["source_event_id"])

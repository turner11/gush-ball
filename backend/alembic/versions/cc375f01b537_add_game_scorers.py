"""add game scorers

Revision ID: cc375f01b537
Revises: 9f3c3bb33cde
Create Date: 2026-10-21 12:58:48.891225

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cc375f01b537"
down_revision: str | Sequence[str] | None = "9f3c3bb33cde"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "game_scorers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "game_id", sa.Integer(), sa.ForeignKey("games.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "player_id",
            sa.Integer(),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.UniqueConstraint("game_id", "player_id", name="uq_game_scorers_game_player"),
    )


def downgrade() -> None:
    op.drop_table("game_scorers")

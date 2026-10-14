"""widen team background

Revision ID: a5bfd3c0a188
Revises: bbbd8196241a
Create Date: 2026-10-14 11:20:41.872821

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a5bfd3c0a188'
down_revision: str | Sequence[str] | None = 'bbbd8196241a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "teams",
        "background",
        existing_type=sa.String(20),
        type_=sa.String(500),
        existing_nullable=False,
        existing_server_default="hoop-1",
    )


def downgrade() -> None:
    op.execute("UPDATE teams SET background = 'hoop-1' WHERE length(background) > 20")
    op.alter_column(
        "teams",
        "background",
        existing_type=sa.String(500),
        type_=sa.String(20),
        existing_nullable=False,
        existing_server_default="hoop-1",
    )

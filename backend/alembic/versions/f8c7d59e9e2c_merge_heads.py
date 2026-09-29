"""merge heads

Revision ID: f8c7d59e9e2c
Revises: c3d5e7f9a1b2, d3e5f7a9b1c2
Create Date: 2026-09-29 14:13:29.200535

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8c7d59e9e2c'
down_revision: Union[str, Sequence[str], None] = ('c3d5e7f9a1b2', 'd3e5f7a9b1c2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

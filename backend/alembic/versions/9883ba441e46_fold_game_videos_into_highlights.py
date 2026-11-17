"""fold game videos into highlights

Revision ID: 9883ba441e46
Revises: 2ed7a4c8c991
Create Date: 2026-11-17 13:00:43.637669

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9883ba441e46'
down_revision: Union[str, Sequence[str], None] = '2ed7a4c8c991'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

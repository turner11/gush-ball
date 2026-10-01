"""add email to admin_users

Revision ID: 4853fc3fed75
Revises: e40ec526b6b0
Create Date: 2026-10-01 09:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4853fc3fed75'
down_revision: str | Sequence[str] | None = 'e40ec526b6b0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('admin_users', sa.Column('email', sa.String(length=254), nullable=True))
    op.create_index(op.f('ix_admin_users_email'), 'admin_users', ['email'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_admin_users_email'), table_name='admin_users')
    op.drop_column('admin_users', 'email')

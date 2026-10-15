"""add team_id to admin_users (NULL = full admin)

Revision ID: e4a9115138c6
Revises: a1b2c3d4e5f6
Create Date: 2026-09-30 13:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e4a9115138c6'
down_revision: str | Sequence[str] | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('admin_users', sa.Column('team_id', sa.Integer(), nullable=True))
    # CASCADE, never SET NULL: SET NULL would promote a deleted team's admins to full admins.
    op.create_foreign_key(
        'fk_admin_users_team_id_teams', 'admin_users', 'teams', ['team_id'], ['id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_admin_users_team_id_teams', 'admin_users', type_='foreignkey')
    op.drop_column('admin_users', 'team_id')

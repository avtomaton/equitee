"""Add property groups tables

Revision ID: b2c3d4e5f6a7
Revises: 9a7b3c2d1e4f
Create Date: 2026-04-15 08:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = '9a7b3c2d1e4f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'property_groups',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('is_default', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        'property_group_members',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('group_id', sa.Integer, sa.ForeignKey('property_groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('property_id', sa.Integer, sa.ForeignKey('properties.id', ondelete='CASCADE'), nullable=False),
    )

    op.create_index('idx_group_members_group', 'property_group_members', ['group_id'])
    op.create_index('idx_group_members_property', 'property_group_members', ['property_id'])


def downgrade() -> None:
    op.drop_index('idx_group_members_property', table_name='property_group_members')
    op.drop_index('idx_group_members_group', table_name='property_group_members')
    op.drop_table('property_group_members')
    op.drop_table('property_groups')

"""add public schema tables: tenants, users

Revision ID: a1b2c3d4e5f6
Revises: add_missing_indexes
Create Date: 2025-04-09 00:00:00.000000

This migration creates the shared public schema tables used in SaaS mode.
In single mode (SQLite), this migration is skipped (see migrations/env.py).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'add_missing_indexes'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'tenants',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('schema_name', sa.String(100), unique=True, nullable=False),
        sa.Column('plan', sa.String(50), server_default='free', nullable=False),
        sa.Column('is_active', sa.Boolean, server_default='true', nullable=False),
        sa.Column('stripe_customer_id', sa.String(200)),
        sa.Column('max_properties', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False),
        schema='public',
    )
    op.create_table(
        'users',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('public.tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), server_default='owner', nullable=False),
        sa.Column('is_active', sa.Boolean, server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False),
        schema='public',
    )


def downgrade():
    op.drop_table('users', schema='public')
    op.drop_table('tenants', schema='public')

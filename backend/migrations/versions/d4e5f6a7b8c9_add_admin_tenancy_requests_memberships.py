"""add admin, tenancy requests, tenant memberships

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2025-01-20 12:00:00.000000

This migration adds:
  - is_admin column to users (admin panel access)
  - active_tenant_id column to users (current working tenant)
  - Makes users.tenant_id nullable (users can exist without a tenant)
  - tenancy_requests table (users request tenancy, admin approves)
  - tenant_memberships table (multi-tenant access control)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Make users.tenant_id nullable + change FK ondelete to SET NULL ──
    # Users can now exist without a tenant (before admin approves their request).
    # The original FK had ON DELETE CASCADE — we must replace it with SET NULL
    # to avoid cascade-deleting users when a tenant is removed.
    op.drop_constraint('users_tenant_id_fkey', 'users', schema='public', type_='foreignkey')
    op.alter_column('users', 'tenant_id',
                    existing_type=sa.String(36),
                    nullable=True,
                    schema='public')
    op.create_foreign_key(
        'users_tenant_id_fkey', 'users', 'tenants',
        ['tenant_id'], ['id'],
        source_schema='public', referent_schema='public',
        ondelete='SET NULL',
    )

    # ── Add is_admin to users ──────────────────────────────────────
    op.add_column('users', sa.Column(
        'is_admin', sa.Boolean(),
        nullable=False,
        server_default='false',
    ), schema='public')

    # ── Add active_tenant_id to users ──────────────────────────────
    # Tracks which tenant the user is currently working in.
    # Can be different from tenant_id (their "own" tenant).
    op.add_column('users', sa.Column(
        'active_tenant_id', sa.String(36),
        sa.ForeignKey('public.tenants.id', ondelete='SET NULL'),
        nullable=True,
    ), schema='public')

    # ── Copy tenant_id to active_tenant_id for existing users ──────
    op.execute("UPDATE public.users SET active_tenant_id = tenant_id WHERE tenant_id IS NOT NULL")

    # ── Create tenancy_requests table ──────────────────────────────
    op.create_table(
        'tenancy_requests',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer,
                  sa.ForeignKey('public.users.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('tenant_name', sa.String(200), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        # pending | approved | rejected
        sa.Column('admin_notes', sa.Text, nullable=True),
        sa.Column('resolved_by', sa.Integer,
                  sa.ForeignKey('public.users.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False),
        sa.Column('resolved_at', sa.DateTime, nullable=True),
        schema='public',
    )
    op.create_index('ix_tenancy_requests_user_id', 'tenancy_requests',
                    ['user_id'], schema='public')
    op.create_index('ix_tenancy_requests_status', 'tenancy_requests',
                    ['status'], schema='public')

    # ── Create tenant_memberships table ────────────────────────────
    op.create_table(
        'tenant_memberships',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer,
                  sa.ForeignKey('public.users.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('tenant_id', sa.String(36),
                  sa.ForeignKey('public.tenants.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('role', sa.String(50), nullable=False, server_default='member'),
        # owner | member
        sa.Column('invited_by', sa.Integer,
                  sa.ForeignKey('public.users.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime, nullable=False),
        schema='public',
    )
    op.create_index(
        'ix_tenant_memberships_user_tenant', 'tenant_memberships',
        ['user_id', 'tenant_id'], unique=True, schema='public',
    )
    op.create_index('ix_tenant_memberships_tenant_id', 'tenant_memberships',
                    ['tenant_id'], schema='public')

    # ── Create memberships for existing owner users ────────────────
    # Every existing user who has a tenant_id gets an 'owner' membership
    op.execute("""
        INSERT INTO public.tenant_memberships (user_id, tenant_id, role, is_active, created_at)
        SELECT u.id, u.tenant_id, 'owner', true, u.created_at
        FROM public.users u
        WHERE u.tenant_id IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_table('tenant_memberships', schema='public')
    op.drop_table('tenancy_requests', schema='public')

    op.drop_column('users', 'active_tenant_id', schema='public')
    op.drop_column('users', 'is_admin', schema='public')

    # Restore NOT NULL constraint and CASCADE FK on tenant_id
    # First, update any NULL tenant_id to a valid tenant to avoid constraint violation
    op.execute("""
        UPDATE public.users
        SET tenant_id = COALESCE(
            active_tenant_id,
            (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1)
        )
        WHERE tenant_id IS NULL
    """)

    # If there are still NULL tenant_id values (no tenants exist), delete those users
    op.execute("""
        DELETE FROM public.users WHERE tenant_id IS NULL
    """)

    op.drop_constraint('users_tenant_id_fkey', 'users', schema='public', type_='foreignkey')
    op.alter_column('users', 'tenant_id',
                    existing_type=sa.String(36),
                    nullable=False,
                    schema='public')
    op.create_foreign_key(
        'users_tenant_id_fkey', 'users', 'tenants',
        ['tenant_id'], ['id'],
        source_schema='public', referent_schema='public',
        ondelete='CASCADE',
    )

"""add email verification and google oauth fields to users

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2024-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add email verification columns
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'), schema='public')
    op.add_column('users', sa.Column('email_verification_token', sa.String(255), nullable=True), schema='public')
    op.add_column('users', sa.Column('email_verification_sent_at', sa.DateTime(), nullable=True), schema='public')

    # Add Google OAuth column
    op.add_column('users', sa.Column('google_id', sa.String(255), nullable=True), schema='public')

    # Make password_hash nullable (Google OAuth users don't have passwords)
    op.alter_column('users', 'password_hash',
                    existing_type=sa.String(255),
                    nullable=True,
                    schema='public')

    # Create unique index on google_id
    op.create_index('ix_users_google_id', 'users', ['google_id'],
                    unique=True, schema='public')

    # Create index on email_verification_token for fast lookups
    op.create_index('ix_users_email_verification_token', 'users',
                    ['email_verification_token'], schema='public')

    # Mark all existing users as email_verified (they registered before verification existed)
    op.execute("UPDATE public.users SET email_verified = true")


def downgrade() -> None:
    op.drop_index('ix_users_email_verification_token', table_name='users', schema='public')
    op.drop_index('ix_users_google_id', table_name='users', schema='public')

    op.alter_column('users', 'password_hash',
                    existing_type=sa.String(255),
                    nullable=False,
                    schema='public')

    op.drop_column('users', 'google_id', schema='public')
    op.drop_column('users', 'email_verification_sent_at', schema='public')
    op.drop_column('users', 'email_verification_token', schema='public')
    op.drop_column('users', 'email_verified', schema='public')

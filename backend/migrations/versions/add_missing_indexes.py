"""Add missing database indexes for performance

Revision ID: 9a7b3c2d1e4f
Revises: 8900ecfb1c5b
Create Date: 2026-04-06 15:43:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9a7b3c2d1e4f'
down_revision: Union[str, Sequence[str], None] = '8900ecfb1c5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add indexes to improve query performance."""
    # Tenant lease expiry queries
    op.create_index('idx_tenants_lease_end', 'tenants', ['lease_end'])
    # Tenant active filtering
    op.create_index('idx_tenants_archived', 'tenants', ['is_archived'])
    # Event column lookups (rate history extraction)
    op.create_index('idx_events_column', 'events', ['column_name'])
    # Composite indexes for date-range queries
    op.create_index('idx_expenses_prop_date', 'expenses', ['property_id', 'expense_date'])
    op.create_index('idx_income_prop_date', 'income', ['property_id', 'income_date'])
    # Document queries
    op.create_index('idx_documents_property', 'documents', ['property_id'])


def downgrade() -> None:
    """Remove added indexes."""
    op.drop_index('idx_documents_property', 'documents')
    op.drop_index('idx_income_prop_date', 'income')
    op.drop_index('idx_expenses_prop_date', 'expenses')
    op.drop_index('idx_events_column', 'events')
    op.drop_index('idx_tenants_archived', 'tenants')
    op.drop_index('idx_tenants_lease_end', 'tenants')

"""Initial tenant schema — properties, expenses, income, tenants, events, documents

Revision ID: 0001_initial_tenant_schema
Revises: (none — first tenant migration)
Create Date: 2025-04-09 00:00:00.000000

This migration creates the application tables inside each tenant's PostgreSQL schema.
The schema is identical to the single-mode schema, but isolated per tenant.
NO tenant_id columns — the schema boundary provides data isolation.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ── Properties ──────────────────────────────────────────────────
    op.create_table(
        'properties',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('type', sa.String, nullable=False, server_default='Condo'),
        sa.Column('province', sa.String, nullable=False),
        sa.Column('city', sa.String, nullable=False),
        sa.Column('address', sa.String, nullable=False),
        sa.Column('postal_code', sa.String, nullable=False),
        sa.Column('parking', sa.String),
        sa.Column('purchase_price', sa.Float, nullable=False, server_default='0'),
        sa.Column('market_price', sa.Float, nullable=False, server_default='0'),
        sa.Column('loan_amount', sa.Float, nullable=False, server_default='0'),
        sa.Column('monthly_rent', sa.Float, nullable=False, server_default='0'),
        sa.Column('poss_date', sa.String, nullable=False),
        sa.Column('status', sa.String, nullable=False, server_default='Rented'),
        sa.Column('expected_condo_fees', sa.Float, server_default='0'),
        sa.Column('expected_insurance', sa.Float, server_default='0'),
        sa.Column('expected_utilities', sa.Float, server_default='0'),
        sa.Column('expected_misc_expenses', sa.Float, server_default='0'),
        sa.Column('expected_appreciation_pct', sa.Float, server_default='0'),
        sa.Column('annual_property_tax', sa.Float, server_default='0'),
        sa.Column('mortgage_rate', sa.Float, server_default='0'),
        sa.Column('mortgage_payment', sa.Float, server_default='0'),
        sa.Column('mortgage_frequency', sa.String, server_default='monthly'),
        sa.Column('notes', sa.Text),
        sa.Column('is_archived', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── Expenses ────────────────────────────────────────────────────
    op.create_table(
        'expenses',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('property_id', sa.Integer, sa.ForeignKey('properties.id', ondelete='CASCADE'), nullable=False),
        sa.Column('expense_date', sa.String, nullable=False),
        sa.Column('amount', sa.Float, nullable=False, server_default='0'),
        sa.Column('expense_type', sa.String, nullable=False),
        sa.Column('expense_category', sa.String, nullable=False),
        sa.Column('notes', sa.Text),
        sa.Column('tax_deductible', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── Income ──────────────────────────────────────────────────────
    op.create_table(
        'income',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('property_id', sa.Integer, sa.ForeignKey('properties.id', ondelete='CASCADE'), nullable=False),
        sa.Column('income_date', sa.String, nullable=False),
        sa.Column('amount', sa.Float, nullable=False, server_default='0'),
        sa.Column('income_type', sa.String, nullable=False),
        sa.Column('notes', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── Tenants (renamed from 'tenants' to 'tenant_records' to avoid
    #     naming conflict with public.tenants) ──────────────────────
    # NOTE: We keep the table name 'tenants' here because schema_translate_map
    # routes unqualified references. Since public.tenants is in 'public' schema
    # and this tenants is in the tenant schema (e.g. tenant_abc123), there is
    # no actual conflict.
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('property_id', sa.Integer, sa.ForeignKey('properties.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('phone', sa.String),
        sa.Column('email', sa.String),
        sa.Column('notes', sa.Text),
        sa.Column('lease_start', sa.String, nullable=False),
        sa.Column('lease_end', sa.String),
        sa.Column('deposit', sa.Float, server_default='0'),
        sa.Column('rent_amount', sa.Float, server_default='0'),
        sa.Column('is_archived', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── Events (audit log) ──────────────────────────────────────────
    op.create_table(
        'events',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('property_id', sa.Integer, sa.ForeignKey('properties.id', ondelete='CASCADE'), nullable=False),
        sa.Column('column_name', sa.String, nullable=False),
        sa.Column('old_value', sa.Text),
        sa.Column('new_value', sa.Text),
        sa.Column('description', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── Documents ───────────────────────────────────────────────────
    op.create_table(
        'documents',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('property_id', sa.Integer, sa.ForeignKey('properties.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String, nullable=False),
        sa.Column('original_filename', sa.String, nullable=False),
        sa.Column('mime_type', sa.String, nullable=False),
        sa.Column('size_bytes', sa.Integer, nullable=False),
        sa.Column('doc_type', sa.String, nullable=False),
        sa.Column('notes', sa.Text),
        sa.Column('uploaded_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── Indexes (matching single-mode schema) ──────────────────────
    op.create_index('idx_expenses_property', 'expenses', ['property_id'])
    op.create_index('idx_income_property', 'income', ['property_id'])
    op.create_index('idx_events_property', 'events', ['property_id'])
    op.create_index('idx_tenants_property', 'tenants', ['property_id'])
    op.create_index('idx_expenses_date', 'expenses', ['expense_date'])
    op.create_index('idx_income_date', 'income', ['income_date'])
    op.create_index('idx_properties_archived', 'properties', ['is_archived'])

    # Performance indexes (matching add_missing_indexes migration)
    op.create_index('idx_tenants_lease_end', 'tenants', ['lease_end'])
    op.create_index('idx_tenants_archived', 'tenants', ['is_archived'])
    op.create_index('idx_events_column', 'events', ['column_name'])
    op.create_index('idx_expenses_prop_date', 'expenses', ['property_id', 'expense_date'])
    op.create_index('idx_income_prop_date', 'income', ['property_id', 'income_date'])
    op.create_index('idx_documents_property', 'documents', ['property_id'])


def downgrade():
    op.drop_index('idx_documents_property')
    op.drop_index('idx_income_prop_date')
    op.drop_index('idx_expenses_prop_date')
    op.drop_index('idx_events_column')
    op.drop_index('idx_tenants_archived')
    op.drop_index('idx_tenants_lease_end')

    op.drop_index('idx_properties_archived')
    op.drop_index('idx_income_date')
    op.drop_index('idx_expenses_date')
    op.drop_index('idx_tenants_property')
    op.drop_index('idx_events_property')
    op.drop_index('idx_income_property')
    op.drop_index('idx_expenses_property')

    op.drop_table('documents')
    op.drop_table('events')
    op.drop_table('tenants')
    op.drop_table('income')
    op.drop_table('expenses')
    op.drop_table('properties')

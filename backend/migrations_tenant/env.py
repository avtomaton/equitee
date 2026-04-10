"""
Alembic environment for tenant schema migrations.

Reads TENANT_SCHEMA from the environment and routes all migration
operations to that schema via schema_translate_map.

Usage:
    TENANT_SCHEMA=tenant_abc123 alembic -c migrations_tenant/alembic.ini upgrade head
"""

import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from alembic import context

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata — import the tenant schema models.
# These are the same models used in single mode (properties, expenses, etc.)
from models.schema import Base
target_metadata = Base.metadata

# Required: TENANT_SCHEMA must be set
target_schema = os.environ.get('TENANT_SCHEMA')
if not target_schema:
    raise RuntimeError(
        "TENANT_SCHEMA environment variable is required for tenant migrations.\n"
        "Example: TENANT_SCHEMA=tenant_abc123 alembic -c migrations_tenant/alembic.ini upgrade head"
    )


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — not supported for tenant schemas."""
    raise RuntimeError(
        "Offline mode is not supported for tenant schema migrations. "
        "Run with a live database connection."
    )


def run_migrations_online() -> None:
    """Run migrations in 'online' mode, scoped to the tenant schema."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Route ALL unqualified table references to the tenant schema
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            schema_translate_map={None: target_schema},
            version_table='alembic_version',
            version_table_schema=target_schema,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

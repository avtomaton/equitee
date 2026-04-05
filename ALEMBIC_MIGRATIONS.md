# Alembic Database Migration Guide

## Setup Complete!
✅ Alembic installed and configured
✅ Initial migration created: `migrations/versions/8900ecfb1c5b_initial_schema.py`
✅ Database stamped as up to date
✅ All existing data preserved

## Usage:

### 1. After making schema changes (add/remove columns, tables, indexes):
```bash
cd backend
source ../venv/bin/activate

# Generate migration automatically
alembic revision --autogenerate -m "Add user authentication table"

# Review generated migration file in migrations/versions/

# Apply migration
alembic upgrade head
```

### 2. Rollback migration:
```bash
# Rollback 1 step
alembic downgrade -1

# Rollback to specific version
alembic downgrade <revision-id>
```

### 3. Check status:
```bash
alembic current
alembic history
```

### 4. Switching databases:
Just change `sqlalchemy.url` in `alembic.ini` and run:
```bash
alembic upgrade head
```

## Best Practices:
1. **Always review auto-generated migrations** before applying
2. Write data migrations manually for complex changes
3. Test migrations on a copy of your production database first
4. Keep migrations small and focused
5. Commit migration files to version control

## Workflow:
```
Modify models/schema.py → Generate migration → Review → Apply → Commit
```

## Example: Adding a new column
```python
# In models/schema.py
class Property(Base):
    # ... existing fields
    purchase_date = Column(String, nullable=True)  # Add new field
```

```bash
alembic revision --autogenerate -m "Add purchase_date to properties"
alembic upgrade head
```

All migrations are fully database-agnostic and will work with SQLite, PostgreSQL, MySQL, etc.

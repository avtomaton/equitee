# Migrating from Self-Hosted to SaaS Mode

This guide is for existing self-hosted Equitee users who want to migrate their SQLite database to the SaaS multi-tenant setup with PostgreSQL.

---

## Overview

The migration process:
1. Export your current SQLite data as JSON
2. Set up PostgreSQL
3. Deploy the SaaS backend
4. Register a new account (creates your tenant schema)
5. Import your data into the new tenant schema
6. Verify everything works

---

## Step 1: Export Current Data

Make sure your self-hosted Flask server is running on `localhost:5000`, then:

```bash
# Export all portfolio data
curl http://localhost:5000/api/export > portfolio_backup.json

# Verify the export
cat portfolio_backup.json | python3 -m json.tool | head -50
```

---

## Step 2: Set Up PostgreSQL

### Option A: Local PostgreSQL

```bash
# Install (Ubuntu/Debian)
sudo apt install postgresql-16

# Create database
sudo -u postgres psql -c "CREATE USER equitee WITH PASSWORD 'secure_password';"
sudo -u postgres psql -c "CREATE DATABASE equitee OWNER equitee;"
```

### Option B: Managed PostgreSQL

Use any managed PostgreSQL provider (Render, Railway, Supabase, Neon, etc.). Copy the connection string.

---

## Step 3: Deploy SaaS Backend

```bash
cd backend

# Set environment variables
export TENANCY_MODE=saas
export DATABASE_URL="postgresql://equitee:secure_password@localhost:5432/equitee"
export JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

# Install dependencies
pip install -r requirements.txt

# Run public schema migrations
alembic upgrade head

# Start the server
python app.py
```

---

## Step 4: Register Your Account

```bash
# Register via API
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-secure-password",
    "tenantName": "My Real Estate Portfolio"
  }'
```

Save the `access_token` from the response:

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Step 5: Import Your Data

```bash
# Import your exported data into your new tenant schema
curl -X POST http://localhost:5000/api/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d @portfolio_backup.json
```

Expected response:
```json
{
  "message": "Import successful",
  "imported": 15
}
```

---

## Step 6: Verify

```bash
# Check properties
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/properties

# Check statistics
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/statistics

# Check expenses
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/expenses

# Check income
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/income
```

---

## Step 7: Build and Deploy Frontend

```bash
cd frontend

# Set SaaS mode
echo "VITE_TENANCY_MODE=saas" > .env

# Build
npm install
npm run build

# Serve with nginx or any static file server
```

---

## Important Notes

### What Gets Migrated
- ✅ All properties
- ✅ All expenses
- ✅ All income records
- ✅ All tenant records
- ✅ All events (audit log)
- ✅ All documents (metadata only — files need to be re-uploaded)

### What Does NOT Get Migrated
- ❌ Document files (stored in `backend/uploads/`) — you'll need to re-upload these
- ❌ Database configuration (switches from SQLite to PostgreSQL)

### Self-Hosted Mode Still Works
Your original SQLite database is untouched. The SaaS deployment is a separate instance. You can keep running the self-hosted version as a backup.

---

## Troubleshooting

### "Import failed: relation does not exist"

Your tenant schema migrations may not have run correctly. Check:

```bash
# Verify tenant schema exists
psql -d equitee -c "SELECT schema_name FROM public.tenants WHERE email = 'your-email@example.com'"
```

### Token expires during import

Increase the JWT expiration:

```bash
export JWT_EXPIRATION_HOURS=24
```

### Data import fails on validation

The import endpoint validates all data. Check the error message — it may be due to invalid dates, missing fields, or type mismatches in your exported JSON.

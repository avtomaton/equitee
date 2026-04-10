# SaaS Deployment Guide

This guide covers deploying Equitee in **SaaS multi-tenant mode** with PostgreSQL, schema-per-tenant isolation, and JWT authentication.

For self-hosted mode, see the main `README.md` — no changes needed there.

---

## Prerequisites

- **PostgreSQL 15+** (managed or self-hosted)
- **Python 3.10+**
- **Node.js 18+** (for frontend build)
- A random **JWT_SECRET** (generate below)

---

## 1. Generate JWT Secret

```bash
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

Copy the output — you'll need it below.

---

## 2. Database Setup

### Option A: Managed PostgreSQL (Render, Railway, Supabase, etc.)

Create a database and copy the connection string. It will look like:
```
postgresql://user:password@host:5432/equitee
```

### Option B: Self-hosted PostgreSQL

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt install postgresql-16

# Create database and user
sudo -u postgres psql
```

```sql
CREATE USER equitee WITH PASSWORD 'your_secure_password';
CREATE DATABASE equitee OWNER equitee;
GRANT ALL PRIVILEGES ON DATABASE equitee TO equitee;
```

---

## 3. Backend Setup

### Environment Variables

Create `backend/.env`:

```bash
TENANCY_MODE=saas
DATABASE_URL=postgresql://user:password@host:5432/equitee
JWT_SECRET=your-64-character-hex-secret-from-step-1
FLASK_DEBUG=false
```

### Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Run Public Schema Migrations

```bash
cd backend
alembic upgrade head
```

This creates the `public.tenants` and `public.users` tables.

### Verify

```bash
cd backend
python app.py
```

You should see:
```
✅ Public schema tables initialized!
✅ Auth routes registered (SaaS mode)
 * Running on http://0.0.0.0:5000
```

### Test Registration

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123","tenantName":"Test Portfolio"}'
```

Expected response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "email": "test@example.com",
    "tenant_id": "abc123..."
  }
}
```

---

## 4. Frontend Setup

### Environment Variables

Create `frontend/.env`:

```bash
VITE_TENANCY_MODE=saas
```

### Build

```bash
cd frontend
npm install
npm run build
```

### Development Server

```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api` to `localhost:5000` automatically.

---

## 5. Production Deployment

### Using Gunicorn (Backend)

```bash
cd backend
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Using Nginx (Frontend + Backend Proxy)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend static files
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Managing Tenant Schemas

### Run Migrations on All Existing Tenants

```bash
cd backend

# Get all active tenant schemas
psql -d equitee -t -c "SELECT schema_name FROM public.tenants WHERE is_active = true" | while read schema; do
  schema=$(echo "$schema" | xargs)  # trim whitespace
  if [ -n "$schema" ]; then
    echo "Migrating $schema..."
    TENANT_SCHEMA=$schema alembic -c migrations_tenant/alembic.ini upgrade head
  fi
done
```

### Create a New Tenant Manually

```bash
cd backend
python3 -c "
from services.tenant_service import TenantService
result = TenantService.create_tenant('user@example.com', 'password123', 'My Portfolio')
print(result)
"
```

### Delete a Tenant

```bash
cd backend
python3 -c "
from utils.db import drop_tenant_schema
from sqlalchemy import text
from utils.db import engine

tenant_id = 'abc123'
# Drop the schema
drop_tenant_schema(tenant_id)
# Remove from public.tenants (CASCADE will remove users too)
with engine.begin() as conn:
    conn.execute(text('DELETE FROM public.tenants WHERE id = :id'), {'id': tenant_id})
print(f'Tenant {tenant_id} deleted')
"
```

---

## 7. Docker Compose (Optional)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: equitee
      POSTGRES_USER: equitee
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      TENANCY_MODE: saas
      DATABASE_URL: postgresql://equitee:${DB_PASSWORD}@postgres:5432/equitee
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "5000:5000"
    depends_on:
      - postgres

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  pgdata:
```

### Backend Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

### Frontend Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 8. Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TENANCY_MODE` | Yes | `single` | `single` or `saas` |
| `DATABASE_URL` | Yes | `sqlite:///real_estate.db` | SQLite (single) or PostgreSQL (saas) |
| `JWT_SECRET` | SaaS only | _(empty)_ | 64-char hex secret for signing JWTs |
| `JWT_EXPIRATION_HOURS` | No | `1` | Access token lifetime |
| `JWT_REFRESH_EXPIRATION_DAYS` | No | `30` | Refresh token lifetime |
| `DEFAULT_PLAN` | No | `free` | Default subscription plan for new tenants |
| `FLASK_DEBUG` | No | `false` | Flask debug mode |
| `VITE_TENANCY_MODE` | Frontend | `single` | Must match backend `TENANCY_MODE` |

---

## 9. Monitoring

### Health Check

```bash
curl http://localhost:5000/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-04-09T12:00:00.000000"
}
```

### List All Tenants

```bash
psql -d equitee -c "SELECT id, name, schema_name, plan, is_active, created_at FROM public.tenants ORDER BY created_at DESC"
```

### Check Tenant Schema Sizes

```sql
SELECT
  t.name,
  t.schema_name,
  pg_size_pretty(pg_total_relation_size(format('%I.properties', t.schema_name))) AS properties_size,
  pg_size_pretty(pg_total_relation_size(format('%I.expenses', t.schema_name))) AS expenses_size,
  (SELECT COUNT(*) FROM format('%I.properties', t.schema_name)) AS property_count
FROM public.tenants t
WHERE t.is_active = true;
```

---

## 10. Troubleshooting

### "TENANT_SCHEMA environment variable is required"

This error occurs when running tenant Alembic migrations without setting the `TENANT_SCHEMA` env var. Always set it:

```bash
TENANT_SCHEMA=tenant_abc123 alembic -c migrations_tenant/alembic.ini upgrade head
```

### "JWT_SECRET must be set" in SaaS mode

The app validates this on startup. Generate a secret:

```bash
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

### Tenant schema creation fails mid-flight

The `create_tenant_schema()` function automatically rolls back the public.tenants and public.users records if Alembic fails. Check the error message and fix the migration issue, then retry registration.

### Self-hosted mode still shows auth routes

Make sure `TENANCY_MODE` is not set (defaults to `single`) or explicitly set it:

```bash
export TENANCY_MODE=single
```

Auth routes return 404 in single mode and are not registered at all.

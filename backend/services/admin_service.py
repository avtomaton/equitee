"""
Admin service — handles admin panel operations.

Only used in SaaS mode. Admin users can manage users, tenants,
tenancy requests, and view analytics.
"""

import datetime
import logging
import uuid

from sqlalchemy import text

from config import Config
from utils.db import engine, create_tenant_schema
from utils.timeutils import utcnow

logger = logging.getLogger(__name__)


class AdminService:
    """Service class for admin operations."""

    # ── Dashboard Analytics ────────────────────────────────────────

    @staticmethod
    def get_analytics():
        """Get platform-wide analytics for the admin dashboard."""
        with engine.connect() as conn:
            # Total users
            total_users = conn.execute(
                text("SELECT COUNT(*) FROM public.users")
            ).scalar()

            # Verified users
            verified_users = conn.execute(
                text("SELECT COUNT(*) FROM public.users WHERE email_verified = true")
            ).scalar()

            # Total tenants
            total_tenants = conn.execute(
                text("SELECT COUNT(*) FROM public.tenants")
            ).scalar()

            # Active tenants
            active_tenants = conn.execute(
                text("SELECT COUNT(*) FROM public.tenants WHERE is_active = true")
            ).scalar()

            # Pending tenancy requests
            pending_requests = conn.execute(
                text("SELECT COUNT(*) FROM public.tenancy_requests WHERE status = 'pending'")
            ).scalar()

            # New users in last 30 days
            new_users_30d = conn.execute(
                text("""
                    SELECT COUNT(*) FROM public.users
                    WHERE created_at >= :cutoff
                """),
                {'cutoff': utcnow() - datetime.timedelta(days=30)},
            ).scalar()

            # New tenants in last 30 days
            new_tenants_30d = conn.execute(
                text("""
                    SELECT COUNT(*) FROM public.tenants
                    WHERE created_at >= :cutoff
                """),
                {'cutoff': utcnow() - datetime.timedelta(days=30)},
            ).scalar()

            # Users by plan
            plan_counts = conn.execute(
                text("""
                    SELECT t.plan, COUNT(DISTINCT u.id) as user_count
                    FROM public.tenants t
                    LEFT JOIN public.tenant_memberships tm ON tm.tenant_id = t.id AND tm.is_active = true
                    LEFT JOIN public.users u ON u.id = tm.user_id
                    GROUP BY t.plan
                    ORDER BY user_count DESC
                """)
            ).fetchall()

            # Recent registrations (last 10)
            recent_users = conn.execute(
                text("""
                    SELECT u.id, u.email, u.email_verified, u.is_active,
                    u.created_at, u.tenant_id, u.active_tenant_id,
                    t.name as tenant_name
                    FROM public.users u
                    LEFT JOIN public.tenants t ON t.id = COALESCE(u.active_tenant_id, u.tenant_id)
                    ORDER BY u.created_at DESC
                    LIMIT 10
                """)
            ).fetchall()

            return {
                'totals': {
                    'users': total_users,
                    'verified_users': verified_users,
                    'tenants': total_tenants,
                    'active_tenants': active_tenants,
                    'pending_requests': pending_requests,
                    'new_users_30d': new_users_30d,
                    'new_tenants_30d': new_tenants_30d,
                },
                'plans': [
                    {'plan': row.plan, 'user_count': row.user_count}
                    for row in plan_counts
                ],
                'recent_users': [
                    {
                        'id': r.id,
                        'email': r.email,
                        'email_verified': r.email_verified,
                        'is_active': r.is_active,
                        'created_at': r.created_at.isoformat() if r.created_at else None,
                        'tenant_name': r.tenant_name,
                    }
                    for r in recent_users
                ],
            }

    # ── User Management ────────────────────────────────────────────

    @staticmethod
    def list_users(page=1, per_page=20, search=None):
        """List all users with pagination and optional search."""
        offset = (page - 1) * per_page
        params = {'limit': per_page, 'offset': offset}

        where = ""
        if search:
            where = "WHERE u.email ILIKE :search"
            params['search'] = f'%{search}%'

        with engine.connect() as conn:
            total = conn.execute(
                text(f"SELECT COUNT(*) FROM public.users u {where}"),
                {k: v for k, v in params.items() if k != 'limit' and k != 'offset'},
            ).scalar()

            rows = conn.execute(
                text(f"""
                    SELECT u.id, u.email, u.role, u.is_active, u.is_admin,
                    u.email_verified, u.created_at, u.tenant_id,
                    u.active_tenant_id,
                    t.name as tenant_name
                    FROM public.users u
                    LEFT JOIN public.tenants t ON t.id = COALESCE(u.active_tenant_id, u.tenant_id)
                    {where}
                    ORDER BY u.created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
            params,
            ).fetchall()

            return {
                'users': [
                    {
                        'id': r.id,
                        'email': r.email,
                        'role': r.role,
                        'is_active': r.is_active,
                        'is_admin': r.is_admin,
                        'email_verified': r.email_verified,
                        'created_at': r.created_at.isoformat() if r.created_at else None,
                        'tenant_id': r.tenant_id,
                        'tenant_name': r.tenant_name,
                    }
                    for r in rows
                ],
                'total': total,
                'page': page,
                'per_page': per_page,
                'pages': (total + per_page - 1) // per_page,
            }

    @staticmethod
    def get_user(user_id):
        """Get detailed user info including memberships."""
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT u.id, u.email, u.role, u.is_active, u.is_admin,
                           u.email_verified, u.created_at, u.tenant_id,
                           u.active_tenant_id, u.google_id
                    FROM public.users u
                    WHERE u.id = :user_id
                """),
                {'user_id': user_id},
            ).fetchone()

            if not row:
                return None

            # Get memberships
            memberships = conn.execute(
                text("""
                    SELECT tm.id, tm.tenant_id, tm.role, tm.is_active,
                           tm.created_at, t.name as tenant_name
                    FROM public.tenant_memberships tm
                    JOIN public.tenants t ON t.id = tm.tenant_id
                    WHERE tm.user_id = :user_id
                    ORDER BY tm.created_at
                """),
                {'user_id': user_id},
            ).fetchall()

            # Get tenancy requests
            requests = conn.execute(
                text("""
                    SELECT tr.id, tr.tenant_name, tr.status, tr.admin_notes,
                           tr.created_at, tr.resolved_at
                    FROM public.tenancy_requests tr
                    WHERE tr.user_id = :user_id
                    ORDER BY tr.created_at DESC
                """),
                {'user_id': user_id},
            ).fetchall()

            return {
                'id': row.id,
                'email': row.email,
                'role': row.role,
                'is_active': row.is_active,
                'is_admin': row.is_admin,
                'email_verified': row.email_verified,
                'created_at': row.created_at.isoformat() if row.created_at else None,
                'tenant_id': row.tenant_id,
                'active_tenant_id': row.active_tenant_id,
                'has_google': row.google_id is not None,
                'memberships': [
                    {
                        'id': m.id,
                        'tenant_id': m.tenant_id,
                        'tenant_name': m.tenant_name,
                        'role': m.role,
                        'is_active': m.is_active,
                        'created_at': m.created_at.isoformat() if m.created_at else None,
                    }
                    for m in memberships
                ],
                'tenancy_requests': [
                    {
                        'id': r.id,
                        'tenant_name': r.tenant_name,
                        'status': r.status,
                        'admin_notes': r.admin_notes,
                        'created_at': r.created_at.isoformat() if r.created_at else None,
                        'resolved_at': r.resolved_at.isoformat() if r.resolved_at else None,
                    }
                    for r in requests
                ],
            }

    @staticmethod
    def toggle_user_active(user_id):
        """Toggle a user's is_active status."""
        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT is_active FROM public.users WHERE id = :id"),
                {'id': user_id},
            ).fetchone()
            if not row:
                return None
            new_status = not row.is_active
            conn.execute(
                text("UPDATE public.users SET is_active = :active WHERE id = :id"),
                {'active': new_status, 'id': user_id},
            )
            return new_status

    @staticmethod
    def set_user_admin(user_id, is_admin):
        """Set or remove admin status for a user."""
        with engine.begin() as conn:
            result = conn.execute(
                text("UPDATE public.users SET is_admin = :is_admin WHERE id = :id RETURNING id"),
                {'is_admin': is_admin, 'id': user_id},
            ).fetchone()
            return result is not None

    # ── Tenant Management ──────────────────────────────────────────

    @staticmethod
    def list_tenants(page=1, per_page=20, search=None):
        """List all tenants with pagination."""
        offset = (page - 1) * per_page
        params = {'limit': per_page, 'offset': offset}

        where = ""
        if search:
            where = "WHERE t.name ILIKE :search"
            params['search'] = f'%{search}%'

        with engine.connect() as conn:
            total = conn.execute(
                text(f"SELECT COUNT(*) FROM public.tenants t {where}"),
                {k: v for k, v in params.items() if k != 'limit' and k != 'offset'},
            ).scalar()

            rows = conn.execute(
                text(f"""
                    SELECT t.id, t.name, t.schema_name, t.plan, t.is_active,
                           t.max_properties, t.created_at,
                           (SELECT COUNT(*) FROM public.tenant_memberships tm
                            WHERE tm.tenant_id = t.id AND tm.is_active = true) as member_count
                    FROM public.tenants t
                    {where}
                    ORDER BY t.created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
                params,
            ).fetchall()

            return {
                'tenants': [
                    {
                        'id': r.id,
                        'name': r.name,
                        'schema_name': r.schema_name,
                        'plan': r.plan,
                        'is_active': r.is_active,
                        'max_properties': r.max_properties,
                        'member_count': r.member_count,
                        'created_at': r.created_at.isoformat() if r.created_at else None,
                    }
                    for r in rows
                ],
                'total': total,
                'page': page,
                'per_page': per_page,
                'pages': (total + per_page - 1) // per_page,
            }

    @staticmethod
    def toggle_tenant_active(tenant_id):
        """Toggle a tenant's is_active status."""
        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT is_active FROM public.tenants WHERE id = :id"),
                {'id': tenant_id},
            ).fetchone()
            if not row:
                return None
            new_status = not row.is_active
            conn.execute(
                text("UPDATE public.tenants SET is_active = :active WHERE id = :id"),
                {'active': new_status, 'id': tenant_id},
            )
            return new_status

    @staticmethod
    def update_tenant_plan(tenant_id, plan):
        """Update a tenant's plan."""
        with engine.begin() as conn:
            result = conn.execute(
                text("UPDATE public.tenants SET plan = :plan WHERE id = :id RETURNING id"),
                {'plan': plan, 'id': tenant_id},
            ).fetchone()
            return result is not None

    # ── Tenancy Requests ───────────────────────────────────────────

    @staticmethod
    def list_tenancy_requests(page=1, per_page=20, status=None):
        """List tenancy requests with optional status filter."""
        offset = (page - 1) * per_page
        params = {'limit': per_page, 'offset': offset}

        where = ""
        if status:
            where = "WHERE tr.status = :status"
            params['status'] = status

        with engine.connect() as conn:
            total = conn.execute(
                text(f"SELECT COUNT(*) FROM public.tenancy_requests tr {where}"),
                {k: v for k, v in params.items() if k != 'limit' and k != 'offset'},
            ).scalar()

            rows = conn.execute(
                text(f"""
                    SELECT tr.id, tr.tenant_name, tr.status, tr.admin_notes,
                           tr.created_at, tr.resolved_at,
                           u.id as user_id, u.email as user_email,
                           r.email as resolver_email
                    FROM public.tenancy_requests tr
                    JOIN public.users u ON u.id = tr.user_id
                    LEFT JOIN public.users r ON r.id = tr.resolved_by
                    {where}
                    ORDER BY
                        CASE WHEN tr.status = 'pending' THEN 0 ELSE 1 END,
                        tr.created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
                params,
            ).fetchall()

            return {
                'requests': [
                    {
                        'id': r.id,
                        'tenant_name': r.tenant_name,
                        'status': r.status,
                        'admin_notes': r.admin_notes,
                        'created_at': r.created_at.isoformat() if r.created_at else None,
                        'resolved_at': r.resolved_at.isoformat() if r.resolved_at else None,
                        'user': {
                            'id': r.user_id,
                            'email': r.user_email,
                        },
                        'resolver_email': r.resolver_email,
                    }
                    for r in rows
                ],
                'total': total,
                'page': page,
                'per_page': per_page,
                'pages': (total + per_page - 1) // per_page,
            }

    @staticmethod
    def approve_tenancy_request(request_id, admin_user_id):
        """
        Approve a tenancy request.

        Creates the tenant, schema, membership, and links the user.
        """
        now = utcnow()

        with engine.begin() as conn:
            # Get the request
            req = conn.execute(
                text("""
                    SELECT tr.id, tr.user_id, tr.tenant_name, tr.status, u.email
                    FROM public.tenancy_requests tr
                    JOIN public.users u ON u.id = tr.user_id
                    WHERE tr.id = :id
                """),
                {'id': request_id},
            ).fetchone()

            if not req:
                raise ValueError("Tenancy request not found")
            if req.status != 'pending':
                raise ValueError(f"Request is already {req.status}")
           
            # Check for duplicate tenant name
            existing = conn.execute(
            text("SELECT id FROM public.tenants WHERE name = :name"),
            {'name': req.tenant_name},
            ).fetchone()
            if existing:
                raise ValueError(f"A tenant named '{req.tenant_name}' already exists")
           
            # Create tenant
            tenant_id = str(uuid.uuid4())
            schema_name = f"tenant_{tenant_id}"

            conn.execute(
                text("""
                    INSERT INTO public.tenants
                        (id, name, schema_name, plan, is_active, created_at)
                    VALUES
                        (:id, :name, :schema_name, :plan, true, :now)
                """),
                {
                    'id': tenant_id,
                    'name': req.tenant_name,
                    'schema_name': schema_name,
                    'plan': Config.DEFAULT_PLAN,
                    'now': now,
                },
            )

            # Create owner membership
            conn.execute(
                text("""
                    INSERT INTO public.tenant_memberships
                        (user_id, tenant_id, role, is_active, created_at)
                    VALUES (:user_id, :tenant_id, 'owner', true, :now)
                """),
                {'user_id': req.user_id, 'tenant_id': tenant_id, 'now': now},
            )

            # Update user's tenant_id and active_tenant_id
            conn.execute(
                text("""
                    UPDATE public.users
                    SET tenant_id = :tenant_id,
                        active_tenant_id = :tenant_id,
                        role = 'owner'
                    WHERE id = :user_id
                """),
                {'tenant_id': tenant_id, 'user_id': req.user_id},
            )

            # Mark request as approved
            conn.execute(
                text("""
                    UPDATE public.tenancy_requests
                    SET status = 'approved',
                        resolved_by = :admin_id,
                        resolved_at = :now
                    WHERE id = :id
                """),
                {'admin_id': admin_user_id, 'now': now, 'id': request_id},
            )

            # Create tenant schema inside transaction (PostgreSQL DDL is transactional)
            try:
                create_tenant_schema(tenant_id)
            except Exception as e:
                logger.error("Failed to create tenant schema for approved request %s: %s", request_id, e)
                raise  # Rolls back entire transaction automatically

        return {
            'tenant_id': tenant_id,
            'tenant_name': req.tenant_name,
            'user_email': req.email,
        }

    @staticmethod
    def reject_tenancy_request(request_id, admin_user_id, notes=None):
        """Reject a tenancy request."""
        now = utcnow()

        with engine.begin() as conn:
            req = conn.execute(
                text("SELECT id, status FROM public.tenancy_requests WHERE id = :id"),
                {'id': request_id},
            ).fetchone()

            if not req:
                raise ValueError("Tenancy request not found")
            if req.status != 'pending':
                raise ValueError(f"Request is already {req.status}")

            conn.execute(
                text("""
                    UPDATE public.tenancy_requests
                    SET status = 'rejected',
                        resolved_by = :admin_id,
                        resolved_at = :now,
                        admin_notes = :notes
                    WHERE id = :id
                """),
                {
                    'admin_id': admin_user_id,
                    'now': now,
                    'notes': notes,
                    'id': request_id,
                },
            )

        return True

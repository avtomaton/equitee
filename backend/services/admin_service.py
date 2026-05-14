"""
Admin service — handles admin panel operations.

Only used in SaaS mode. Admin users can manage users, tenants,
tenancy requests, and view analytics.

Uses SQLAlchemy ORM (select/insert/update) instead of raw SQL.
"""

import datetime
import logging
import uuid

from sqlalchemy import select, func, case, and_, or_, update as sa_update, insert as sa_insert
from sqlalchemy.orm import Session

from config import Config
from models.public_schema import User, Tenant, TenantMembership, TenancyRequest
from utils.db import engine, create_tenant_schema
from utils.timeutils import utcnow

logger = logging.getLogger(__name__)


class AdminService:
    """Service class for admin operations."""

    # ── Helpers ────────────────────────────────────────────────────

    @staticmethod
    def _orm_session() -> Session:
        """Create a new ORM session bound to the global engine."""
        return Session(engine, expire_on_commit=False)

    @staticmethod
    def _iso(dt):
        """Safely convert a datetime to ISO string."""
        return dt.isoformat() if dt else None

    # ── Dashboard Analytics ────────────────────────────────────────

    @staticmethod
    def get_analytics():
        """Get platform-wide analytics for the admin dashboard."""
        cutoff = utcnow() - datetime.timedelta(days=30)

        with AdminService._orm_session() as session:
            stmt_users = select(
                func.count(User.id),
                func.count(func.nullif(User.email_verified, False)),
                func.count(func.nullif(User.created_at >= cutoff, False)),
            )
            total_users, verified_users, new_users_30d = session.execute(stmt_users).one()

            stmt_tenants = select(
                func.count(Tenant.id),
                func.count(func.nullif(Tenant.is_active, False)),
                func.count(func.nullif(Tenant.created_at >= cutoff, False)),
            )
            total_tenants, active_tenants, new_tenants_30d = session.execute(stmt_tenants).one()

            pending_requests = session.execute(
                select(func.count(TenancyRequest.id))
                .where(TenancyRequest.status == 'pending')
            ).scalar()

            # Users by plan
            plan_rows = session.execute(
                select(
                    Tenant.plan,
                    func.count(func.distinct(User.id)).label('user_count'),
                )
                .select_from(Tenant)
                .outerjoin(TenantMembership, and_(
                    TenantMembership.tenant_id == Tenant.id,
                    TenantMembership.is_active == True,
                ))
                .outerjoin(User, User.id == TenantMembership.user_id)
                .group_by(Tenant.plan)
                .order_by(func.count(func.distinct(User.id)).desc())
            ).fetchall()

            # Recent registrations (last 10)
            recent_users = session.execute(
                select(
                    User.id,
                    User.email,
                    User.email_verified,
                    User.is_active,
                    User.created_at,
                    User.tenant_id,
                    User.active_tenant_id,
                    Tenant.name.label('tenant_name'),
                )
                .outerjoin(Tenant, Tenant.id == func.coalesce(User.active_tenant_id, User.tenant_id))
                .order_by(User.created_at.desc())
                .limit(10)
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
                    for row in plan_rows
                ],
                'recent_users': [
                    {
                        'id': r.id,
                        'email': r.email,
                        'email_verified': r.email_verified,
                        'is_active': r.is_active,
                        'created_at': AdminService._iso(r.created_at),
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

        with AdminService._orm_session() as session:
            # Build base query
            base = (
                select(User, Tenant.name.label('tenant_name'))
                .outerjoin(Tenant, Tenant.id == func.coalesce(User.active_tenant_id, User.tenant_id))
            )

            if search:
                base = base.where(User.email.ilike(f'%{search}%'))

            # Total count
            count_stmt = select(func.count()).select_from(base.subquery())
            total = session.execute(count_stmt).scalar()

            # Paginated rows
            rows_stmt = base.order_by(User.created_at.desc()).offset(offset).limit(per_page)
            rows = session.execute(rows_stmt).fetchall()

            return {
                'users': [
                    {
                        'id': r.User.id,
                        'email': r.User.email,
                        'role': r.User.role,
                        'is_active': r.User.is_active,
                        'is_admin': r.User.is_admin,
                        'email_verified': r.User.email_verified,
                        'created_at': AdminService._iso(r.User.created_at),
                        'tenant_id': r.User.tenant_id,
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
        """Get detailed user info including memberships and tenancy requests."""
        with AdminService._orm_session() as session:
            user = session.execute(
                select(User).where(User.id == user_id)
            ).scalar_one_or_none()

            if not user:
                return None

            memberships = session.execute(
                select(TenantMembership, Tenant.name.label('tenant_name'))
                .join(Tenant, Tenant.id == TenantMembership.tenant_id)
                .where(TenantMembership.user_id == user_id)
                .order_by(TenantMembership.created_at)
            ).fetchall()

            requests = session.execute(
                select(TenancyRequest)
                .where(TenancyRequest.user_id == user_id)
                .order_by(TenancyRequest.created_at.desc())
            ).scalars().all()

            return {
                'id': user.id,
                'email': user.email,
                'role': user.role,
                'is_active': user.is_active,
                'is_admin': user.is_admin,
                'email_verified': user.email_verified,
                'created_at': AdminService._iso(user.created_at),
                'tenant_id': user.tenant_id,
                'active_tenant_id': user.active_tenant_id,
                'has_google': user.google_id is not None,
                'memberships': [
                    {
                        'id': m.TenantMembership.id,
                        'tenant_id': m.TenantMembership.tenant_id,
                        'tenant_name': m.tenant_name,
                        'role': m.TenantMembership.role,
                        'is_active': m.TenantMembership.is_active,
                        'created_at': AdminService._iso(m.TenantMembership.created_at),
                    }
                    for m in memberships
                ],
                'tenancy_requests': [
                    {
                        'id': r.id,
                        'tenant_name': r.tenant_name,
                        'status': r.status,
                        'admin_notes': r.admin_notes,
                        'created_at': AdminService._iso(r.created_at),
                        'resolved_at': AdminService._iso(r.resolved_at),
                    }
                    for r in requests
                ],
            }

    @staticmethod
    def toggle_user_active(user_id):
        """Toggle a user's is_active status. Returns new status or None if not found."""
        with AdminService._orm_session() as session:
            with session.begin():
                user = session.execute(
                    select(User).where(User.id == user_id)
                ).scalar_one_or_none()
                if not user:
                    return None
                new_status = not user.is_active
                session.execute(
                    sa_update(User)
                    .where(User.id == user_id)
                    .values(is_active=new_status)
                )
                return new_status

    @staticmethod
    def set_user_admin(user_id, is_admin):
        """Set or remove admin status for a user."""
        with AdminService._orm_session() as session:
            with session.begin():
                result = session.execute(
                    sa_update(User)
                    .where(User.id == user_id)
                    .values(is_admin=is_admin)
                )
                return result.rowcount > 0

    # ── Tenant Management ──────────────────────────────────────────

    @staticmethod
    def list_tenants(page=1, per_page=20, search=None):
        """List all tenants with pagination and optional search."""
        offset = (page - 1) * per_page

        with AdminService._orm_session() as session:
            # Subquery for member count
            member_count_subq = (
                select(func.count(TenantMembership.id))
                .where(
                    and_(
                        TenantMembership.tenant_id == Tenant.id,
                        TenantMembership.is_active == True,
                    )
                )
                .correlate(Tenant)
                .scalar_subquery()
                .label('member_count')
            )

            base = select(
                Tenant.id,
                Tenant.name,
                Tenant.schema_name,
                Tenant.plan,
                Tenant.is_active,
                Tenant.max_properties,
                Tenant.created_at,
                member_count_subq,
            )

            if search:
                base = base.where(Tenant.name.ilike(f'%{search}%'))

            # Total count
            count_stmt = select(func.count()).select_from(base.subquery())
            total = session.execute(count_stmt).scalar()

            # Paginated rows
            rows_stmt = base.order_by(Tenant.created_at.desc()).offset(offset).limit(per_page)
            rows = session.execute(rows_stmt).fetchall()

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
                        'created_at': AdminService._iso(r.created_at),
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
        with AdminService._orm_session() as session:
            with session.begin():
                tenant = session.execute(
                    select(Tenant).where(Tenant.id == tenant_id)
                ).scalar_one_or_none()
                if not tenant:
                    return None
                new_status = not tenant.is_active
                session.execute(
                    sa_update(Tenant)
                    .where(Tenant.id == tenant_id)
                    .values(is_active=new_status)
                )
                return new_status

    @staticmethod
    def update_tenant_plan(tenant_id, plan):
        """Update a tenant's plan."""
        with AdminService._orm_session() as session:
            with session.begin():
                result = session.execute(
                    sa_update(Tenant)
                    .where(Tenant.id == tenant_id)
                    .values(plan=plan)
                )
                return result.rowcount > 0

    # ── Tenancy Requests ───────────────────────────────────────────

    @staticmethod
    def list_tenancy_requests(page=1, per_page=20, status=None):
        """List tenancy requests with optional status filter."""
        offset = (page - 1) * per_page

        with AdminService._orm_session() as session:
            # Join with users for requester and resolver info
            UserAlias = User  # Requester
            ResolverAlias = User  # Resolver (same table, different role)

            base = (
                select(
                    TenancyRequest.id,
                    TenancyRequest.tenant_name,
                    TenancyRequest.status,
                    TenancyRequest.admin_notes,
                    TenancyRequest.created_at,
                    TenancyRequest.resolved_at,
                    UserAlias.id.label('user_id'),
                    UserAlias.email.label('user_email'),
                    ResolverAlias.email.label('resolver_email'),
                )
                .join(UserAlias, UserAlias.id == TenancyRequest.user_id)
                .outerjoin(ResolverAlias, ResolverAlias.id == TenancyRequest.resolved_by)
            )

            if status:
                base = base.where(TenancyRequest.status == status)

            # Total count
            count_stmt = select(func.count()).select_from(base.subquery())
            total = session.execute(count_stmt).scalar()

            # Paginated rows with pending-first ordering
            rows_stmt = (
                base
                .order_by(
                    case((TenancyRequest.status == 'pending', 0), else_=1),
                    TenancyRequest.created_at.desc(),
                )
                .offset(offset)
                .limit(per_page)
            )
            rows = session.execute(rows_stmt).fetchall()

            return {
                'requests': [
                    {
                        'id': r.id,
                        'tenant_name': r.tenant_name,
                        'status': r.status,
                        'admin_notes': r.admin_notes,
                        'created_at': AdminService._iso(r.created_at),
                        'resolved_at': AdminService._iso(r.resolved_at),
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
        Uses ORM with a nested transaction for schema creation.
        """
        now = utcnow()

        with AdminService._orm_session() as session:
            with session.begin():
                # Get the request with user info
                req_result = session.execute(
                    select(TenancyRequest, User.email)
                    .join(User, User.id == TenancyRequest.user_id)
                    .where(TenancyRequest.id == request_id)
                ).one_or_none()

                if not req_result:
                    raise ValueError("Tenancy request not found")
                req = req_result.TenancyRequest
                user_email = req_result.email

                if req.status != 'pending':
                    raise ValueError(f"Request is already {req.status}")

                # Check for duplicate tenant name
                existing = session.execute(
                    select(Tenant.id).where(Tenant.name == req.tenant_name)
                ).scalar_one_or_none()
                if existing:
                    raise ValueError(f"A tenant named '{req.tenant_name}' already exists")

                # Create tenant
                tenant_id = str(uuid.uuid4())
                schema_name = f"tenant_{tenant_id}"

                session.execute(
                    sa_insert(Tenant).values(
                        id=tenant_id,
                        name=req.tenant_name,
                        schema_name=schema_name,
                        plan=Config.DEFAULT_PLAN,
                        is_active=True,
                        created_at=now,
                    )
                )

                # Create owner membership
                session.execute(
                    sa_insert(TenantMembership).values(
                        user_id=req.user_id,
                        tenant_id=tenant_id,
                        role='owner',
                        is_active=True,
                        created_at=now,
                    )
                )

                # Update user's tenant_id and role
                session.execute(
                    sa_update(User)
                    .where(User.id == req.user_id)
                    .values(tenant_id=tenant_id, active_tenant_id=tenant_id, role='owner')
                )

                # Mark request as approved
                session.execute(
                    sa_update(TenancyRequest)
                    .where(TenancyRequest.id == request_id)
                    .values(
                        status='approved',
                        resolved_by=admin_user_id,
                        resolved_at=now,
                    )
                )

                # Create tenant schema (DDL — transactional in PostgreSQL)
                try:
                    create_tenant_schema(tenant_id)
                except Exception as e:
                    logger.error(
                        "Failed to create tenant schema for approved request %s: %s",
                        request_id, e,
                    )
                    raise  # Rolls back entire transaction

        return {
            'tenant_id': tenant_id,
            'tenant_name': req.tenant_name,
            'user_email': user_email,
        }

    @staticmethod
    def reject_tenancy_request(request_id, admin_user_id, notes=None):
        """Reject a tenancy request."""
        now = utcnow()

        with AdminService._orm_session() as session:
            with session.begin():
                req = session.execute(
                    select(TenancyRequest).where(TenancyRequest.id == request_id)
                ).scalar_one_or_none()

                if not req:
                    raise ValueError("Tenancy request not found")
                if req.status != 'pending':
                    raise ValueError(f"Request is already {req.status}")

                session.execute(
                    sa_update(TenancyRequest)
                    .where(TenancyRequest.id == request_id)
                    .values(
                        status='rejected',
                        resolved_by=admin_user_id,
                        resolved_at=now,
                        admin_notes=notes,
                    )
                )

        return True

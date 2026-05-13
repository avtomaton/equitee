"""
Tenancy management service — handles tenancy requests, invitations, and switching.

Only used in SaaS mode.
"""

import datetime
import logging

from sqlalchemy import text

from config import Config
from utils.db import engine
from utils.timeutils import utcnow
from services.auth_service import AuthService

logger = logging.getLogger(__name__)


class TenancyService:
    """Service class for tenancy management operations."""

    # ── Tenancy Requests (user-facing) ─────────────────────────────

    @staticmethod
    def create_tenancy_request(user_id, tenant_name):
        """
        User requests a new tenancy. Admin must approve.

        Returns the request dict.
        """
        now = utcnow()

        with engine.begin() as conn:
            # Check if user already owns a tenant
            user = conn.execute(
                text("SELECT tenant_id FROM public.users WHERE id = :id"),
                {'id': user_id},
            ).fetchone()

            if user and user.tenant_id:
                raise ValueError("You already have a tenant. Use invitations to add members instead.")

            # Atomic insert — only succeeds if no pending request already exists
            result = conn.execute(
                text("""
                    INSERT INTO public.tenancy_requests
                        (user_id, tenant_name, status, created_at)
                    SELECT :user_id, :tenant_name, 'pending', :now
                    WHERE NOT EXISTS (
                        SELECT 1 FROM public.tenancy_requests
                        WHERE user_id = :user_id AND status = 'pending'
                    )
                """),
                {
                    'user_id': user_id,
                    'tenant_name': tenant_name.strip(),
                    'now': now,
                },
            )

            if result.rowcount == 0:
                raise ValueError("You already have a pending tenancy request")

            # Get the created request
            row = conn.execute(
                text("""
                    SELECT id, tenant_name, status, created_at
                    FROM public.tenancy_requests
                    WHERE user_id = :user_id AND status = 'pending'
                    ORDER BY created_at DESC LIMIT 1
                """),
                {'user_id': user_id},
            ).fetchone()

            return {
                'id': row.id,
                'tenant_name': row.tenant_name,
                'status': row.status,
                'created_at': row.created_at.isoformat() if row.created_at else None,
            }

    @staticmethod
    def get_my_tenancy_requests(user_id):
        """Get all tenancy requests for a user."""
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT id, tenant_name, status, admin_notes,
                           created_at, resolved_at
                    FROM public.tenancy_requests
                    WHERE user_id = :user_id
                    ORDER BY created_at DESC
                """),
                {'user_id': user_id},
            ).fetchall()

            return [
                {
                    'id': r.id,
                    'tenant_name': r.tenant_name,
                    'status': r.status,
                    'admin_notes': r.admin_notes,
                    'created_at': r.created_at.isoformat() if r.created_at else None,
                    'resolved_at': r.resolved_at.isoformat() if r.resolved_at else None,
                }
                for r in rows
            ]

    # ── Tenant Switching ───────────────────────────────────────────

    @staticmethod
    def get_user_tenants(user_id):
        """
        Get all tenants the user has access to.

        Returns list of tenant dicts with membership info.
        """
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT
                        t.id, t.name, t.plan, t.is_active,
                        tm.role, tm.is_active AS membership_active,
                        tm.created_at AS joined_at
                    FROM public.tenant_memberships tm
                    JOIN public.tenants t ON t.id = tm.tenant_id
                    WHERE tm.user_id = :user_id
                    ORDER BY tm.created_at
                """),
                {'user_id': user_id},
            ).fetchall()

            # Get current active tenant
            user_row = conn.execute(
                text("SELECT active_tenant_id FROM public.users WHERE id = :id"),
                {'id': user_id},
            ).fetchone()

            active_tenant_id = user_row.active_tenant_id if user_row else None

            return {
                'tenants': [
                    {
                        'id': r.id,
                        'name': r.name,
                        'plan': r.plan,
                        'is_active': r.is_active,
                        'role': r.role,
                        'membership_active': r.membership_active,
                        'joined_at': r.joined_at.isoformat() if r.joined_at else None,
                        'is_current': r.id == active_tenant_id,
                    }
                    for r in rows
                ],
                'active_tenant_id': active_tenant_id,
            }

    @staticmethod
    def switch_tenant(user_id, tenant_id):
        """
        Switch the user's active tenant context.

        The user must have an active membership in the target tenant.
        Returns new tokens for the switched tenant.
        """
        with engine.begin() as conn:
            # Verify membership
            membership = conn.execute(
                text("""
                    SELECT tm.role, tm.is_active
                    FROM public.tenant_memberships tm
                    WHERE tm.user_id = :user_id
                      AND tm.tenant_id = :tenant_id
                """),
                {'user_id': user_id, 'tenant_id': tenant_id},
            ).fetchone()

            if not membership:
                raise ValueError("You do not have access to this tenant")
            if not membership.is_active:
                raise ValueError("Your membership in this tenant is inactive")

            # Verify tenant is active
            tenant = conn.execute(
                text("SELECT is_active, name FROM public.tenants WHERE id = :id"),
                {'id': tenant_id},
            ).fetchone()

            if not tenant or not tenant.is_active:
                raise ValueError("This tenant is inactive")

            # Update active tenant
            conn.execute(
                text("""
                    UPDATE public.users
                    SET active_tenant_id = :tenant_id
                    WHERE id = :user_id
                """),
                {'tenant_id': tenant_id, 'user_id': user_id},
            )

            # Get user email for token generation
            user = conn.execute(
                text("SELECT email FROM public.users WHERE id = :id"),
                {'id': user_id},
            ).fetchone()

        # Generate new tokens for the switched tenant
        tokens = {
            'access_token': AuthService._create_access_token(tenant_id, user.email, user_id),
            'refresh_token': AuthService._create_refresh_token(tenant_id, user.email, user_id),
        }
        tokens['tenant_name'] = tenant.name
        tokens['role'] = membership.role
        return tokens

    # ── Tenant Invitations ─────────────────────────────────────────

    @staticmethod
    def invite_member(owner_user_id, tenant_id, email, role='member'):
        """
        Invite a user to a tenant by email.

        The inviter must be an 'owner' of the tenant.
        If the user doesn't exist yet, they can still be added after they register.
        """
        email = email.lower().strip()

        with engine.begin() as conn:
            # Verify inviter is owner of this tenant
            owner_membership = conn.execute(
                text("""
                    SELECT role FROM public.tenant_memberships
                    WHERE user_id = :user_id AND tenant_id = :tenant_id AND is_active = true
                """),
                {'user_id': owner_user_id, 'tenant_id': tenant_id},
            ).fetchone()

            if not owner_membership or owner_membership.role != 'owner':
                raise ValueError("Only the tenant owner can invite members")

            if role not in ('member', 'owner'):
                raise ValueError("Role must be 'member' or 'owner'")

            # Find the user by email
            target_user = conn.execute(
                text("SELECT id, email_verified FROM public.users WHERE email = :email"),
                {'email': email},
            ).fetchone()

            if not target_user:
                raise ValueError(f"No account found with email '{email}'. The user must register first.")

            # Check if already a member
            existing = conn.execute(
                text("""
                    SELECT id, is_active FROM public.tenant_memberships
                    WHERE user_id = :user_id AND tenant_id = :tenant_id
                """),
                {'user_id': target_user.id, 'tenant_id': tenant_id},
            ).fetchone()

            if existing:
                if existing.is_active:
                    raise ValueError(f"User '{email}' is already a member of this tenant")
                else:
                    # Reactivate
                    conn.execute(
                        text("""
                            UPDATE public.tenant_memberships
                            SET is_active = true, role = :role
                            WHERE id = :id
                        """),
                        {'role': role, 'id': existing.id},
                    )
                    return {'message': f"Re-invited '{email}' to tenant", 'reactivated': True}

            # Create membership
            now = utcnow()
            conn.execute(
                text("""
                    INSERT INTO public.tenant_memberships
                        (user_id, tenant_id, role, invited_by, is_active, created_at)
                    VALUES (:user_id, :tenant_id, :role, :invited_by, true, :now)
                """),
                {
                    'user_id': target_user.id,
                    'tenant_id': tenant_id,
                    'role': role,
                    'invited_by': owner_user_id,
                    'now': now,
                },
            )

            # If the invited user has no active_tenant_id, set it
            conn.execute(
                text("""
                    UPDATE public.users
                    SET active_tenant_id = :tenant_id
                    WHERE id = :user_id AND active_tenant_id IS NULL
                """),
                {'tenant_id': tenant_id, 'user_id': target_user.id},
            )

        return {'message': f"Invited '{email}' to tenant as {role}"}

    @staticmethod
    def revoke_member(owner_user_id, tenant_id, target_user_id):
        """
        Revoke a user's access to a tenant.

        The revoker must be the owner. Owners cannot revoke themselves.
        """
        with engine.begin() as conn:
            # Verify owner
            owner_membership = conn.execute(
                text("""
                    SELECT role FROM public.tenant_memberships
                    WHERE user_id = :user_id AND tenant_id = :tenant_id AND is_active = true
                """),
                {'user_id': owner_user_id, 'tenant_id': tenant_id},
            ).fetchone()

            if not owner_membership or owner_membership.role != 'owner':
                raise ValueError("Only the tenant owner can revoke members")

            # Can't revoke yourself
            if owner_user_id == target_user_id:
                raise ValueError("You cannot revoke your own access. Transfer ownership first.")

            # Deactivate membership
            result = conn.execute(
                text("""
                    UPDATE public.tenant_memberships
                    SET is_active = false
                    WHERE user_id = :user_id AND tenant_id = :tenant_id AND is_active = true
                """),
                {'user_id': target_user_id, 'tenant_id': tenant_id},
            )

            if result.rowcount == 0:
                raise ValueError("User is not an active member of this tenant")

            # If the revoked user's active_tenant was this one, clear it
            conn.execute(
                text("""
                    UPDATE public.users
                    SET active_tenant_id = NULL
                    WHERE id = :user_id AND active_tenant_id = :tenant_id
                """),
                {'user_id': target_user_id, 'tenant_id': tenant_id},
            )

        return {'message': 'Member access revoked'}

    @staticmethod
    def list_members(user_id, tenant_id):
        """List all members of a tenant. User must be a member."""
        with engine.connect() as conn:
            # Verify membership
            membership = conn.execute(
                text("""
                    SELECT role FROM public.tenant_memberships
                    WHERE user_id = :user_id AND tenant_id = :tenant_id AND is_active = true
                """),
                {'user_id': user_id, 'tenant_id': tenant_id},
            ).fetchone()

            if not membership:
                raise ValueError("You are not a member of this tenant")

            rows = conn.execute(
                text("""
                    SELECT u.id, u.email, tm.role, tm.is_active, tm.created_at,
                           tm.invited_by
                    FROM public.tenant_memberships tm
                    JOIN public.users u ON u.id = tm.user_id
                    WHERE tm.tenant_id = :tenant_id
                    ORDER BY tm.role = 'owner' DESC, tm.created_at
                """),
                {'tenant_id': tenant_id},
            ).fetchall()

            return [
                {
                    'id': r.id,
                    'email': r.email,
                    'role': r.role,
                    'is_active': r.is_active,
                    'joined_at': r.created_at.isoformat() if r.created_at else None,
                    'invited_by': r.invited_by,
                }
                for r in rows
            ]

"""
Tenancy management routes — tenancy requests, invitations, and switching.

These routes are ONLY registered when TENANCY_MODE=saas.
All routes require authentication.
"""

import logging

from flask import request, jsonify, g

from middleware.tenant_router import tenant_required
from services.tenancy_service import TenancyService
from utils.errors import handle_errors

logger = logging.getLogger(__name__)


def register_tenancy_routes(app, limiter=None):
    """Register tenancy management routes on the Flask app. Call only in SaaS mode."""

    def _limit(limit_string):
        if limiter is not None:
            return limiter.limit(limit_string)
        def _noop(f):
            return f
        return _noop

    # ── Tenancy Requests (user-facing) ─────────────────────────────

    @app.route('/api/tenancy/request', methods=['POST'])
    @_limit("3/minute")
    @handle_errors
    @tenant_required
    def create_tenancy_request():
        """Request a new tenancy (admin must approve)."""
        user_id = g.current_user['id']
        data = request.get_json()
        tenant_name = data.get('tenantName', '').strip()

        if not tenant_name:
            return jsonify({'error': 'Tenant name is required'}), 400
        if len(tenant_name) > 200:
            return jsonify({'error': 'Tenant name must be 200 characters or less'}), 400

        try:
            result = TenancyService.create_tenancy_request(user_id, tenant_name)
            return jsonify(result), 201
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

    @app.route('/api/tenancy/requests', methods=['GET'])
    @_limit("30/minute")
    @handle_errors
    @tenant_required
    def get_my_tenancy_requests():
        """Get current user's tenancy requests."""
        user_id = g.current_user['id']
        data = TenancyService.get_my_tenancy_requests(user_id)
        return jsonify(data), 200

    # ── Tenant Switching ───────────────────────────────────────────

    @app.route('/api/tenancy/tenants', methods=['GET'])
    @_limit("30/minute")
    @handle_errors
    @tenant_required
    def get_my_tenants():
        """Get all tenants the current user has access to."""
        user_id = g.current_user['id']
        data = TenancyService.get_user_tenants(user_id)
        return jsonify(data), 200

    @app.route('/api/tenancy/switch', methods=['POST'])
    @_limit("10/minute")
    @handle_errors
    @tenant_required
    def switch_tenant():
        """Switch the current user's active tenant."""
        user_id = g.current_user['id']
        data = request.get_json()
        tenant_id = data.get('tenant_id', '').strip()

        if not tenant_id:
            return jsonify({'error': 'Tenant ID is required'}), 400

        try:
            result = TenancyService.switch_tenant(user_id, tenant_id)
            return jsonify(result), 200
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

    # ── Tenant Members ─────────────────────────────────────────────

    @app.route('/api/tenancy/members', methods=['GET'])
    @_limit("30/minute")
    @handle_errors
    @tenant_required
    def list_members():
        """List all members of the current tenant."""
        user_id = g.current_user['id']
        tenant_id = g.current_user.get('tenant_id')
        if not tenant_id:
            return jsonify({'error': 'No active tenant'}), 400

        try:
            data = TenancyService.list_members(user_id, tenant_id)
            return jsonify(data), 200
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

    @app.route('/api/tenancy/invite', methods=['POST'])
    @_limit("5/minute")
    @handle_errors
    @tenant_required
    def invite_member():
        """Invite a user to the current tenant by email."""
        owner_user_id = g.current_user['id']
        tenant_id = g.current_user.get('tenant_id')
        if not tenant_id:
            return jsonify({'error': 'No active tenant'}), 400
        data = request.get_json()
        email = data.get('email', '').strip()
        role = data.get('role', 'member').strip()

        if not email:
            return jsonify({'error': 'Email is required'}), 400

        try:
            result = TenancyService.invite_member(owner_user_id, tenant_id, email, role)
            return jsonify(result), 200
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

    @app.route('/api/tenancy/members/<int:target_user_id>/revoke', methods=['POST'])
    @_limit("10/minute")
    @handle_errors
    @tenant_required
    def revoke_member(target_user_id):
        """Revoke a user's access to the current tenant."""
        owner_user_id = g.current_user['id']
        tenant_id = g.current_user.get('tenant_id')
        if not tenant_id:
            return jsonify({'error': 'No active tenant'}), 400

        try:
            result = TenancyService.revoke_member(owner_user_id, tenant_id, target_user_id)
            return jsonify(result), 200
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

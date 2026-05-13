"""
Admin routes — admin panel for managing users, tenants, and tenancy requests.

These routes are ONLY registered when TENANCY_MODE=saas.
All routes require is_admin=True on the authenticated user.
"""

import logging

from flask import request, jsonify, g

from middleware.tenant_router import tenant_required
from services.admin_service import AdminService
from utils.errors import handle_errors

logger = logging.getLogger(__name__)


def _admin_required(f):
    """Decorator that checks the current user is an admin."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(g, 'current_user') or not g.current_user:
            return jsonify({'error': 'Authentication required'}), 401
        if not g.current_user.get('is_admin'):
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


def register_admin_routes(app, limiter=None):
    """Register admin routes on the Flask app. Call only in SaaS mode."""

    def _limit(limit_string):
        if limiter is not None:
            return limiter.limit(limit_string)
        def _noop(f):
            return f
        return _noop

    # ── Admin Dashboard ────────────────────────────────────────────

    @app.route('/api/admin/analytics', methods=['GET'])
    @_limit("30/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_analytics():
        """Get platform-wide analytics."""
        data = AdminService.get_analytics()
        return jsonify(data), 200

    # ── User Management ────────────────────────────────────────────

    @app.route('/api/admin/users', methods=['GET'])
    @_limit("30/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_list_users():
        """List all users with pagination."""
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '').strip() or None
        per_page = max(1, min(per_page, 100))  # Clamp to [1, 100]

        data = AdminService.list_users(page=page, per_page=per_page, search=search)
        return jsonify(data), 200

    @app.route('/api/admin/users/<int:user_id>', methods=['GET'])
    @_limit("30/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_get_user(user_id):
        """Get detailed user info."""
        data = AdminService.get_user(user_id)
        if data is None:
            return jsonify({'error': 'User not found'}), 404
        return jsonify(data), 200

    @app.route('/api/admin/users/<int:user_id>/toggle-active', methods=['POST'])
    @_limit("10/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_toggle_user_active(user_id):
        """Toggle a user's active status."""
        if user_id == g.current_user['id']:
            return jsonify({'error': 'Cannot deactivate your own account'}), 400
        new_status = AdminService.toggle_user_active(user_id)
        if new_status is None:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({'is_active': new_status}), 200

    @app.route('/api/admin/users/<int:user_id>/set-admin', methods=['POST'])
    @_limit("10/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_set_user_admin(user_id):
        """Set or remove admin status for a user."""
        data = request.get_json()
        is_admin = data.get('is_admin', False)
        if user_id == g.current_user['id'] and not is_admin:
            return jsonify({'error': 'Cannot remove your own admin status'}), 400
        success = AdminService.set_user_admin(user_id, is_admin)
        if not success:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({'is_admin': is_admin}), 200

    # ── Tenant Management ──────────────────────────────────────────

    @app.route('/api/admin/tenants', methods=['GET'])
    @_limit("30/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_list_tenants():
        """List all tenants with pagination."""
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '').strip() or None
        per_page = max(1, min(per_page, 100))  # Clamp to [1, 100]

        data = AdminService.list_tenants(page=page, per_page=per_page, search=search)
        return jsonify(data), 200

    @app.route('/api/admin/tenants/<tenant_id>/toggle-active', methods=['POST'])
    @_limit("10/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_toggle_tenant_active(tenant_id):
        """Toggle a tenant's active status."""
        new_status = AdminService.toggle_tenant_active(tenant_id)
        if new_status is None:
            return jsonify({'error': 'Tenant not found'}), 404
        return jsonify({'is_active': new_status}), 200

    @app.route('/api/admin/tenants/<tenant_id>/plan', methods=['PUT'])
    @_limit("10/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_update_tenant_plan(tenant_id):
        """Update a tenant's plan."""
        data = request.get_json()
        plan = data.get('plan', '').strip()
        if not plan:
            return jsonify({'error': 'Plan is required'}), 400
        success = AdminService.update_tenant_plan(tenant_id, plan)
        if not success:
            return jsonify({'error': 'Tenant not found'}), 404
        return jsonify({'plan': plan}), 200

    # ── Tenancy Requests ───────────────────────────────────────────

    @app.route('/api/admin/tenancy-requests', methods=['GET'])
    @_limit("30/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_list_tenancy_requests():
        """List tenancy requests."""
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status = request.args.get('status', '').strip() or None
        per_page = max(1, min(per_page, 100))  # Clamp to [1, 100]

        data = AdminService.list_tenancy_requests(
            page=page, per_page=per_page, status=status
        )
        return jsonify(data), 200

    @app.route('/api/admin/tenancy-requests/<int:request_id>/approve', methods=['POST'])
    @_limit("10/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_approve_tenancy_request(request_id):
        """Approve a tenancy request."""
        admin_user_id = g.current_user['id']
        try:
            result = AdminService.approve_tenancy_request(request_id, admin_user_id)
            return jsonify(result), 200
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        except RuntimeError as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/admin/tenancy-requests/<int:request_id>/reject', methods=['POST'])
    @_limit("10/minute")
    @handle_errors
    @tenant_required
    @_admin_required
    def admin_reject_tenancy_request(request_id):
        """Reject a tenancy request."""
        admin_user_id = g.current_user['id']
        data = request.get_json() or {}
        notes = data.get('notes', '').strip() or None

        try:
            AdminService.reject_tenancy_request(request_id, admin_user_id, notes)
            return jsonify({'message': 'Request rejected'}), 200
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

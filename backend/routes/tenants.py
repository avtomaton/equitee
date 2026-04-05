from flask import request, jsonify
from utils.database import db_cursor, require_exists
from utils.errors import handle_errors
from validation import validate_required


TENANT_JOIN = 'SELECT t.*, p.name as property_name FROM tenants t LEFT JOIN properties p ON t.property_id = p.id WHERE t.id = ?'


def register_routes(app):
    @app.route('/api/tenants', methods=['GET'])
    @handle_errors
    def get_tenants():
        """Get tenants with proper parameterization (no string formatting)."""
        with db_cursor() as (_, cursor):
            property_id = request.args.get('property_id')
            is_archived = request.args.get('archived') == '1'

            # Build query with parameterization, not f-strings
            if property_id:
                cursor.execute('''
                    SELECT t.*, p.name as property_name
                    FROM tenants t LEFT JOIN properties p ON t.property_id = p.id
                    WHERE t.property_id = ? AND t.is_archived = ?
                    ORDER BY t.lease_start DESC
                ''', (property_id, 1 if is_archived else 0))
            else:
                cursor.execute('''
                    SELECT t.*, p.name as property_name
                    FROM tenants t LEFT JOIN properties p ON t.property_id = p.id
                    WHERE t.is_archived = ?
                    ORDER BY t.lease_start DESC
                ''', (1 if is_archived else 0,))

            return jsonify([dict(r) for r in cursor.fetchall()]), 200

    @app.route('/api/tenants', methods=['POST'])
    @handle_errors
    def create_tenant():
        data = request.get_json()
        validate_required(data, ['propertyId', 'name', 'leaseStart'])
        with db_cursor() as (_, cursor):
            cursor.execute(
                'INSERT INTO tenants (property_id, name, phone, email, notes, lease_start, lease_end, deposit, rent_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (data['propertyId'], data['name'],
                 data.get('phone', ''), data.get('email', ''), data.get('notes', ''),
                 data['leaseStart'], data.get('leaseEnd') or None,
                 data.get('deposit', 0), data.get('rentAmount', 0)))
            new_id = cursor.lastrowid
            cursor.execute(TENANT_JOIN, (new_id,))
            return jsonify(dict(cursor.fetchone())), 201

    @app.route('/api/tenants/<int:tenant_id>', methods=['PUT'])
    @handle_errors
    def update_tenant(tenant_id):
        data = request.get_json()
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'tenants', tenant_id, 'Tenant')
            cursor.execute('''
                UPDATE tenants
                SET property_id=?, name=?, phone=?, email=?, notes=?,
                    lease_start=?, lease_end=?, deposit=?, rent_amount=?,
                    updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            ''', (data['propertyId'], data['name'],
                  data.get('phone', ''), data.get('email', ''), data.get('notes', ''),
                  data['leaseStart'], data.get('leaseEnd') or None,
                  data.get('deposit', 0), data.get('rentAmount', 0),
                  tenant_id))
            cursor.execute(TENANT_JOIN, (tenant_id,))
            return jsonify(dict(cursor.fetchone())), 200

    @app.route('/api/tenants/<int:tenant_id>', methods=['DELETE'])
    @handle_errors
    def archive_tenant(tenant_id):
        """Soft-delete (archive) a tenant."""
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'tenants', tenant_id, 'Tenant')
            cursor.execute('UPDATE tenants SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (tenant_id,))
            return jsonify({'message': 'Tenant archived'}), 200

    @app.route('/api/tenants/<int:tenant_id>/restore', methods=['POST'])
    @handle_errors
    def restore_tenant(tenant_id):
        with db_cursor() as (_, cursor):
            cursor.execute('UPDATE tenants SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (tenant_id,))
            return jsonify({'message': 'Tenant restored'}), 200

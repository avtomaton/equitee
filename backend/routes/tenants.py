from flask import request, jsonify
from utils.db import tenant_session, require_exists
from utils.errors import handle_errors
from middleware.tenant_router import tenant_required
from models.schema import Tenant, Property
from validation import validate_required, validate_email, validate_phone, validate_currency, validate_string_length, validate_date, sanitize_html


def register_routes(app):
    @app.route('/api/tenants', methods=['GET'])
    @tenant_required
    @handle_errors
    def get_tenants():
        """Get tenants with property names."""
        property_id = request.args.get('property_id')
        is_archived = request.args.get('archived') == '1'

        with tenant_session() as session:
            query = session.query(Tenant)
            if property_id:
                query = query.filter(Tenant.property_id == property_id)
            query = query.filter(Tenant.is_archived == is_archived)
            tenants = query.order_by(Tenant.lease_start.desc()).all()

            # Add property_name for backward compatibility
            result = []
            for t in tenants:
                tenant_dict = t.to_dict()
                tenant_dict['property_name'] = t.property.name if t.property else None
                result.append(tenant_dict)

            return jsonify(result), 200

    @app.route('/api/tenants', methods=['POST'])
    @tenant_required
    @handle_errors
    def create_tenant():
        data = request.get_json()
        validate_required(data, ['propertyId', 'name', 'leaseStart'])
        name = sanitize_html(validate_string_length(data['name'], 'name', 200))
        lease_start = validate_date(data['leaseStart'], 'leaseStart').isoformat()
        lease_end = validate_date(data['leaseEnd'], 'leaseEnd').isoformat() if data.get('leaseEnd') else None
        deposit = validate_currency(data.get('deposit', 0), 'deposit')
        rent_amount = validate_currency(data.get('rentAmount', 0), 'rentAmount')
        email = validate_email(data.get('email', '')) if data.get('email') else ''
        phone = validate_phone(data.get('phone', '')) if data.get('phone') else ''
        notes = sanitize_html(validate_string_length(data.get('notes', ''), 'notes', 1000))

        with tenant_session() as session:
            # Verify property exists
            require_exists(session, Property, data['propertyId'], 'Property')

            tenant = Tenant(
                property_id=data['propertyId'],
                name=name,
                phone=phone,
                email=email,
                notes=notes,
                lease_start=lease_start,
                lease_end=lease_end,
                deposit=deposit,
                rent_amount=rent_amount
            )
            session.add(tenant)
            session.flush()

            tenant_dict = tenant.to_dict()
            tenant_dict['property_name'] = tenant.property.name
            return jsonify(tenant_dict), 201

    @app.route('/api/tenants/<int:tenant_id>', methods=['PUT'])
    @tenant_required
    @handle_errors
    def update_tenant(tenant_id):
        data = request.get_json()
        validate_required(data, ['propertyId', 'name', 'leaseStart'])
        name = sanitize_html(validate_string_length(data['name'], 'name', 200))
        lease_start = validate_date(data['leaseStart'], 'leaseStart').isoformat()
        lease_end = validate_date(data['leaseEnd'], 'leaseEnd').isoformat() if data.get('leaseEnd') else None
        deposit = validate_currency(data.get('deposit', 0), 'deposit')
        rent_amount = validate_currency(data.get('rentAmount', 0), 'rentAmount')
        email = validate_email(data.get('email', '')) if data.get('email') else ''
        phone = validate_phone(data.get('phone', '')) if data.get('phone') else ''
        notes = sanitize_html(validate_string_length(data.get('notes', ''), 'notes', 1000))

        with tenant_session() as session:
            tenant = require_exists(session, Tenant, tenant_id, 'Tenant')

            tenant.property_id = data['propertyId']
            tenant.name = name
            tenant.phone = phone
            tenant.email = email
            tenant.notes = notes
            tenant.lease_start = lease_start
            tenant.lease_end = lease_end
            tenant.deposit = deposit
            tenant.rent_amount = rent_amount

            tenant_dict = tenant.to_dict()
            tenant_dict['property_name'] = tenant.property.name
            return jsonify(tenant_dict), 200

    @app.route('/api/tenants/<int:tenant_id>', methods=['DELETE'])
    @tenant_required
    @handle_errors
    def archive_tenant(tenant_id):
        """Soft-delete (archive) a tenant."""
        with tenant_session() as session:
            tenant = require_exists(session, Tenant, tenant_id, 'Tenant')
            tenant.is_archived = True
            return jsonify({'message': 'Tenant archived'}), 200

    @app.route('/api/tenants/<int:tenant_id>/restore', methods=['POST'])
    @tenant_required
    @handle_errors
    def restore_tenant(tenant_id):
        with tenant_session() as session:
            tenant = require_exists(session, Tenant, tenant_id, 'Tenant')
            tenant.is_archived = False
            return jsonify({'message': 'Tenant restored'}), 200

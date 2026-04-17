"""Property groups — CRUD routes for grouping properties."""

from flask import request, jsonify
from utils.db import tenant_session, NotFoundError, require_exists
from utils.errors import handle_errors
from models.schema import PropertyGroup, PropertyGroupMember, Property
from middleware.tenant_router import tenant_required


def register_routes(app):

    @app.route('/api/groups', methods=['GET'])
    @tenant_required
    @handle_errors
    def list_groups():
        with tenant_session() as session:
            groups = session.query(PropertyGroup).order_by(PropertyGroup.name).all()
            return jsonify([g.to_dict(include_properties=True) for g in groups]), 200

    @app.route('/api/groups/<int:group_id>', methods=['GET'])
    @tenant_required
    @handle_errors
    def get_group(group_id):
        with tenant_session() as session:
            group = require_exists(session, PropertyGroup, group_id, 'Group')
            return jsonify(group.to_dict(include_properties=True)), 200

    @app.route('/api/groups', methods=['POST'])
    @tenant_required
    @handle_errors
    def create_group():
        data = request.get_json()
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Name is required'}), 400

        property_ids = data.get('property_ids', [])
        is_default = data.get('is_default', False)

        with tenant_session() as session:
            # If this group is set as default, unset any existing default
            if is_default:
                session.query(PropertyGroup).filter(PropertyGroup.is_default == True).update({'is_default': False})

            group = PropertyGroup(name=name, is_default=is_default)
            session.add(group)
            session.flush()

            # Validate property IDs and add members
            for pid in property_ids:
                prop = session.get(Property, pid)
                if prop:
                    session.add(PropertyGroupMember(group_id=group.id, property_id=pid))

            return jsonify(group.to_dict(include_properties=True)), 201

    @app.route('/api/groups/<int:group_id>', methods=['PUT'])
    @tenant_required
    @handle_errors
    def update_group(group_id):
        data = request.get_json()
        name = data.get('name')
        property_ids = data.get('property_ids')
        is_default = data.get('is_default')

        with tenant_session() as session:
            group = require_exists(session, PropertyGroup, group_id, 'Group')

            if name is not None:
                name = name.strip()
                if not name:
                    return jsonify({'error': 'Name cannot be empty'}), 400
                group.name = name

            if is_default is True:
                session.query(PropertyGroup).filter(PropertyGroup.is_default == True).update({'is_default': False})
                group.is_default = True
            elif is_default is False:
                group.is_default = False

            if property_ids is not None:
                # Replace all members
                session.query(PropertyGroupMember).filter(PropertyGroupMember.group_id == group_id).delete()
                for pid in property_ids:
                    prop = session.get(Property, pid)
                    if prop:
                        session.add(PropertyGroupMember(group_id=group.id, property_id=pid))

            return jsonify(group.to_dict(include_properties=True)), 200

    @app.route('/api/groups/<int:group_id>', methods=['DELETE'])
    @tenant_required
    @handle_errors
    def delete_group(group_id):
        with tenant_session() as session:
            group = require_exists(session, PropertyGroup, group_id, 'Group')
            session.delete(group)
            return jsonify({'message': 'Group deleted'}), 200

    @app.route('/api/groups/default', methods=['GET'])
    @tenant_required
    @handle_errors
    def get_default_group():
        """Return the default group (or null if none set)."""
        with tenant_session() as session:
            group = session.query(PropertyGroup).filter(PropertyGroup.is_default == True).first()
            if group:
                return jsonify(group.to_dict(include_properties=True)), 200
            return jsonify(None), 200

    @app.route('/api/groups/clear-default', methods=['POST'])
    @tenant_required
    @handle_errors
    def clear_default_group():
        """Clear the default group (revert to showing all properties)."""
        with tenant_session() as session:
            session.query(PropertyGroup).filter(PropertyGroup.is_default == True).update({'is_default': False})
            return jsonify({'message': 'Default group cleared'}), 200

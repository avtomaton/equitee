from flask import request, jsonify
from utils.db import tenant_session, require_exists
from utils.errors import handle_errors
from middleware.tenant_router import tenant_required
from models.schema import Event
from sqlalchemy import func


def register_routes(app):
    @app.route('/api/events', methods=['GET'])
    @tenant_required
    @handle_errors
    def get_events():
        with tenant_session() as session:
            property_id = request.args.get('property_id')
            query = session.query(Event)
            if property_id:
                query = query.filter(Event.property_id == property_id)
            events = query.order_by(Event.created_at.desc()).all()

            # Add property_name for backward compatibility
            result = []
            for e in events:
                event_dict = e.to_dict()
                event_dict['property_name'] = e.property.name if e.property else None
                result.append(event_dict)

            return jsonify(result), 200

    @app.route('/api/events/bulk', methods=['POST'])
    @tenant_required
    @handle_errors
    def get_events_bulk():
        """Fetch events for multiple property IDs in a single request."""
        data = request.get_json()
        property_ids = data.get('property_ids', [])
        if not property_ids:
            return jsonify([]), 200

        with tenant_session() as session:
            events = session.query(Event)\
                .filter(Event.property_id.in_(property_ids))\
                .order_by(Event.created_at.desc())\
                .all()

            # Add property_name for backward compatibility
            result = []
            for e in events:
                event_dict = e.to_dict()
                event_dict['property_name'] = e.property.name if e.property else None
                result.append(event_dict)

            return jsonify(result), 200

    @app.route('/api/events/<int:event_id>', methods=['PUT'])
    @tenant_required
    @handle_errors
    def update_event(event_id):
        data = request.get_json()
        with tenant_session() as session:
            event = require_exists(session, Event, event_id, 'Event')

            if 'description' in data:
                event.description = data['description']
            if 'eventDate' in data:
                # Handle date string input
                from datetime import datetime
                event.created_at = datetime.fromisoformat(data['eventDate'])

            return jsonify(event.to_dict()), 200

    @app.route('/api/events/<int:event_id>', methods=['DELETE'])
    @tenant_required
    @handle_errors
    def delete_event(event_id):
        with tenant_session() as session:
            event = require_exists(session, Event, event_id, 'Event')
            session.delete(event)
            return jsonify({'message': 'Event deleted successfully'}), 200

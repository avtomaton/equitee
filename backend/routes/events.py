from flask import request, jsonify
from utils.database import db_cursor, require_exists
from utils.errors import handle_errors


def register_routes(app):
    @app.route('/api/events', methods=['GET'])
    @handle_errors
    def get_events():
        with db_cursor() as (_, cursor):
            property_id = request.args.get('property_id')
            if property_id:
                cursor.execute('''
                    SELECT e.*, p.name as property_name
                    FROM events e LEFT JOIN properties p ON e.property_id = p.id
                    WHERE e.property_id = ? ORDER BY e.created_at DESC
                ''', (property_id,))
            else:
                cursor.execute('''
                    SELECT e.*, p.name as property_name
                    FROM events e LEFT JOIN properties p ON e.property_id = p.id
                    ORDER BY e.created_at DESC
                ''')
            return jsonify([dict(r) for r in cursor.fetchall()]), 200

    @app.route('/api/events/<int:event_id>', methods=['PUT'])
    @handle_errors
    def update_event(event_id):
        data = request.get_json()
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'events', event_id, 'Event')
            cursor.execute(
                'UPDATE events SET description=?, created_at=? WHERE id=?',
                (data.get('description', ''), data.get('eventDate'), event_id)
            )
            cursor.execute('SELECT * FROM events WHERE id = ?', (event_id,))
            return jsonify(dict(cursor.fetchone())), 200

    @app.route('/api/events/<int:event_id>', methods=['DELETE'])
    @handle_errors
    def delete_event(event_id):
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'events', event_id, 'Event')
            cursor.execute('DELETE FROM events WHERE id = ?', (event_id,))
            return jsonify({'message': 'Event deleted successfully'}), 200

from flask import request, jsonify
from utils.database import db_cursor, require_exists
from utils.errors import handle_errors
from validation import validate_required


def register_routes(app):
    @app.route('/api/income', methods=['GET'])
    @handle_errors
    def get_income():
        with db_cursor() as (_, cursor):
            property_id = request.args.get('property_id')
            if property_id:
                cursor.execute('SELECT * FROM income WHERE property_id = ? ORDER BY income_date DESC', (property_id,))
            else:
                cursor.execute('SELECT * FROM income ORDER BY income_date DESC')
            return jsonify([dict(r) for r in cursor.fetchall()]), 200

    @app.route('/api/income', methods=['POST'])
    @handle_errors
    def create_income():
        data = request.get_json()
        validate_required(data, ['propertyId', 'incomeDate', 'amount', 'incomeType'])
        with db_cursor() as (_, cursor):
            cursor.execute(
                'INSERT INTO income (property_id, income_date, amount, income_type, notes) VALUES (?, ?, ?, ?, ?)',
                (data['propertyId'], data['incomeDate'], data['amount'],
                 data['incomeType'], data.get('notes', '')))
            new_id = cursor.lastrowid
            cursor.execute('SELECT * FROM income WHERE id = ?', (new_id,))
            return jsonify(dict(cursor.fetchone())), 201

    @app.route('/api/income/<int:income_id>', methods=['PUT'])
    @handle_errors
    def update_income(income_id):
        data = request.get_json()
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'income', income_id, 'Income')
            cursor.execute('''
                UPDATE income
                SET property_id=?, income_date=?, amount=?, income_type=?,
                    notes=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            ''', (data['propertyId'], data['incomeDate'], data['amount'],
                  data['incomeType'], data.get('notes', ''), income_id))
            cursor.execute('SELECT * FROM income WHERE id = ?', (income_id,))
            return jsonify(dict(cursor.fetchone())), 200

    @app.route('/api/income/<int:income_id>', methods=['DELETE'])
    @handle_errors
    def delete_income(income_id):
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'income', income_id, 'Income')
            cursor.execute('DELETE FROM income WHERE id = ?', (income_id,))
            return jsonify({'message': 'Income deleted successfully'}), 200

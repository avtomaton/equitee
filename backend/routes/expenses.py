from flask import request, jsonify
from utils.database import db_cursor, require_exists, row_to_dict
from utils.errors import handle_errors
from validation import validate_required


def register_routes(app):
    @app.route('/api/expenses', methods=['GET'])
    @handle_errors
    def get_expenses():
        with db_cursor() as (_, cursor):
            property_id = request.args.get('property_id')
            if property_id:
                cursor.execute('SELECT * FROM expenses WHERE property_id = ? ORDER BY expense_date DESC', (property_id,))
            else:
                cursor.execute('SELECT * FROM expenses ORDER BY expense_date DESC')
            return jsonify([dict(r) for r in cursor.fetchall()]), 200

    @app.route('/api/expenses', methods=['POST'])
    @handle_errors
    def create_expense():
        data = request.get_json()
        validate_required(data, ['propertyId', 'expenseDate', 'amount', 'expenseType', 'expenseCategory'])
        with db_cursor() as (_, cursor):
            cursor.execute(
                'INSERT INTO expenses (property_id, expense_date, amount, expense_type, expense_category, notes, tax_deductible) VALUES (?, ?, ?, ?, ?, ?, ?)',
                (data['propertyId'], data['expenseDate'], data['amount'],
                 data['expenseType'], data['expenseCategory'], data.get('notes', ''),
                 1 if data.get('taxDeductible', True) else 0))
            new_id = cursor.lastrowid
            cursor.execute('SELECT * FROM expenses WHERE id = ?', (new_id,))
            return jsonify(dict(cursor.fetchone())), 201

    @app.route('/api/expenses/<int:expense_id>', methods=['PUT'])
    @handle_errors
    def update_expense(expense_id):
        data = request.get_json()
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'expenses', expense_id, 'Expense')
            cursor.execute('''
                UPDATE expenses
                SET property_id=?, expense_date=?, amount=?, expense_type=?,
                    expense_category=?, notes=?, tax_deductible=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            ''', (data['propertyId'], data['expenseDate'], data['amount'],
                  data['expenseType'], data['expenseCategory'],
                  data.get('notes', ''), 1 if data.get('taxDeductible', True) else 0,
                  expense_id))
            cursor.execute('SELECT * FROM expenses WHERE id = ?', (expense_id,))
            return jsonify(dict(cursor.fetchone())), 200

    @app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
    @handle_errors
    def delete_expense(expense_id):
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'expenses', expense_id, 'Expense')
            cursor.execute('DELETE FROM expenses WHERE id = ?', (expense_id,))
            return jsonify({'message': 'Expense deleted successfully'}), 200

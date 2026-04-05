from flask import request, jsonify
from utils.db import db_session_scope, require_exists, NotFoundError
from utils.errors import handle_errors
from models.schema import Expense, Property
from validation import validate_required, validate_currency, validate_date, validate_string_length, sanitize_html


def register_routes(app):
    @app.route('/api/expenses', methods=['GET'])
    @handle_errors
    def get_expenses():
        with db_session_scope() as session:
            query = session.query(Expense)
            property_id = request.args.get('property_id')
            if property_id:
                query = query.filter(Expense.property_id == property_id)
            expenses = query.order_by(Expense.expense_date.desc()).all()
            return jsonify([e.to_dict() for e in expenses]), 200

    @app.route('/api/expenses', methods=['POST'])
    @handle_errors
    def create_expense():
        data = request.get_json()
        validate_required(data, ['propertyId', 'expenseDate', 'amount', 'expenseType', 'expenseCategory'])
        amount = validate_currency(data['amount'], 'amount')
        expense_date = validate_date(data['expenseDate'], 'expenseDate').isoformat()
        notes = sanitize_html(validate_string_length(data.get('notes', ''), 'notes', 1000))

        with db_session_scope() as session:
            # Verify property exists
            require_exists(session, Property, data['propertyId'], 'Property')

            expense = Expense(
                property_id=data['propertyId'],
                expense_date=expense_date,
                amount=amount,
                expense_type=data['expenseType'],
                expense_category=data['expenseCategory'],
                notes=notes,
                tax_deductible=data.get('taxDeductible', True)
            )
            session.add(expense)
            session.flush()
            return jsonify(expense.to_dict()), 201

    @app.route('/api/expenses/<int:expense_id>', methods=['PUT'])
    @handle_errors
    def update_expense(expense_id):
        data = request.get_json()
        validate_required(data, ['propertyId', 'expenseDate', 'amount', 'expenseType', 'expenseCategory'])
        amount = validate_currency(data['amount'], 'amount')
        expense_date = validate_date(data['expenseDate'], 'expenseDate').isoformat()
        notes = sanitize_html(validate_string_length(data.get('notes', ''), 'notes', 1000))

        with db_session_scope() as session:
            expense = require_exists(session, Expense, expense_id, 'Expense')

            expense.property_id = data['propertyId']
            expense.expense_date = expense_date
            expense.amount = amount
            expense.expense_type = data['expenseType']
            expense.expense_category = data['expenseCategory']
            expense.notes = notes
            expense.tax_deductible = data.get('taxDeductible', True)

            return jsonify(expense.to_dict()), 200

    @app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
    @handle_errors
    def delete_expense(expense_id):
        with db_session_scope() as session:
            expense = require_exists(session, Expense, expense_id, 'Expense')
            session.delete(expense)
            return jsonify({'message': 'Expense deleted successfully'}), 200

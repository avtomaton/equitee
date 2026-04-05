from flask import request, jsonify
from utils.db import db_session_scope, require_exists
from utils.errors import handle_errors
from models.schema import Income, Property
from validation import validate_required, validate_currency, validate_date, validate_string_length, sanitize_html


def register_routes(app):
    @app.route('/api/income', methods=['GET'])
    @handle_errors
    def get_income():
        with db_session_scope() as session:
            query = session.query(Income)
            property_id = request.args.get('property_id')
            if property_id:
                query = query.filter(Income.property_id == property_id)
            income_records = query.order_by(Income.income_date.desc()).all()
            return jsonify([i.to_dict() for i in income_records]), 200

    @app.route('/api/income', methods=['POST'])
    @handle_errors
    def create_income():
        data = request.get_json()
        validate_required(data, ['propertyId', 'incomeDate', 'amount', 'incomeType'])
        amount = validate_currency(data['amount'], 'amount')
        income_date = validate_date(data['incomeDate'], 'incomeDate').isoformat()
        notes = sanitize_html(validate_string_length(data.get('notes', ''), 'notes', 1000))

        with db_session_scope() as session:
            # Verify property exists
            require_exists(session, Property, data['propertyId'], 'Property')

            income = Income(
                property_id=data['propertyId'],
                income_date=income_date,
                amount=amount,
                income_type=data['incomeType'],
                notes=notes
            )
            session.add(income)
            session.flush()
            return jsonify(income.to_dict()), 201

    @app.route('/api/income/<int:income_id>', methods=['PUT'])
    @handle_errors
    def update_income(income_id):
        data = request.get_json()
        validate_required(data, ['propertyId', 'incomeDate', 'amount', 'incomeType'])
        amount = validate_currency(data['amount'], 'amount')
        income_date = validate_date(data['incomeDate'], 'incomeDate').isoformat()
        notes = sanitize_html(validate_string_length(data.get('notes', ''), 'notes', 1000))

        with db_session_scope() as session:
            income = require_exists(session, Income, income_id, 'Income')

            income.property_id = data['propertyId']
            income.income_date = income_date
            income.amount = amount
            income.income_type = data['incomeType']
            income.notes = notes

            return jsonify(income.to_dict()), 200

    @app.route('/api/income/<int:income_id>', methods=['DELETE'])
    @handle_errors
    def delete_income(income_id):
        with db_session_scope() as session:
            income = require_exists(session, Income, income_id, 'Income')
            session.delete(income)
            return jsonify({'message': 'Income deleted successfully'}), 200

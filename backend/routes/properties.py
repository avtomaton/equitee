from flask import request, jsonify
from sqlalchemy import func
from utils.db import db_session_scope, require_exists, NotFoundError
from utils.errors import handle_errors
from utils.transform import transform_property_create, transform_property_update
from models.schema import Property, Expense, Income, Event
from models.property import check_property_params


def register_routes(app):
    @app.route('/api/properties', methods=['GET'])
    @handle_errors
    def get_properties():
        with db_session_scope() as session:
            base = session.query(Property)
            if request.args.get('archived') != '1':
                base = base.filter(Property.is_archived == False)

            # Single query with JOIN aggregates — avoids N+1 from to_dict()
            rows = (
                base.outerjoin(Income, Income.property_id == Property.id)
                    .outerjoin(Expense, Expense.property_id == Property.id)
                    .group_by(Property.id)
                    .order_by(Property.created_at.desc())
                    .with_entities(
                        Property,
                        func.coalesce(func.sum(Income.amount), 0).label('total_income'),
                        func.coalesce(func.sum(Expense.amount), 0).label('total_expenses'),
                    )
                    .all()
            )

            result = []
            for prop, total_income, total_expenses in rows:
                d = prop.to_dict()
                d['total_income'] = total_income
                d['total_expenses'] = total_expenses
                result.append(d)
            return jsonify(result), 200

    @app.route('/api/properties/<int:property_id>', methods=['GET'])
    @handle_errors
    def get_property(property_id):
        with db_session_scope() as session:
            prop = require_exists(session, Property, property_id, 'Property')
            # Single aggregate query instead of iterating relationships
            total_income = session.query(func.coalesce(func.sum(Income.amount), 0)).filter(
                Income.property_id == property_id).scalar()
            total_expenses = session.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
                Expense.property_id == property_id).scalar()
            d = prop.to_dict()
            d['total_income'] = total_income
            d['total_expenses'] = total_expenses
            return jsonify(d), 200

    @app.route('/api/properties', methods=['POST'])
    @handle_errors
    def create_property():
        data = request.get_json()
        check_property_params(data)

        with db_session_scope() as session:
            kwargs = transform_property_create(data)
            prop = Property(**kwargs)
            session.add(prop)
            session.flush()
            d = prop.to_dict()
            d['total_income'] = 0
            d['total_expenses'] = 0
            return jsonify(d), 201

    @app.route('/api/properties/<int:property_id>', methods=['PUT'])
    @handle_errors
    def update_property(property_id):
        data = request.get_json()
        check_property_params(data)

        with db_session_scope() as session:
            prop = require_exists(session, Property, property_id, 'Property')
            changes = transform_property_update(data)

            # Track changes and create events
            for column, new_value in changes.items():
                old_value = getattr(prop, column)

                # Normalize values for comparison
                if isinstance(new_value, (int, float)):
                    old_value = float(old_value) if old_value else 0.0
                    new_value = float(new_value) if new_value else 0.0
                else:
                    old_value = str(old_value) if old_value is not None else ''
                    new_value = str(new_value) if new_value is not None else ''

                if old_value != new_value:
                    event = Event(
                        property_id=property_id,
                        column_name=column,
                        old_value=str(old_value),
                        new_value=str(new_value),
                        description=''
                    )
                    session.add(event)
                    setattr(prop, column, new_value)

            session.flush()
            d = prop.to_dict()
            total_income = session.query(func.coalesce(func.sum(Income.amount), 0)).filter(
                Income.property_id == property_id).scalar()
            total_expenses = session.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
                Expense.property_id == property_id).scalar()
            d['total_income'] = total_income
            d['total_expenses'] = total_expenses
            return jsonify(d), 200

    @app.route('/api/properties/<int:property_id>', methods=['DELETE'])
    @handle_errors
    def archive_property(property_id):
        """Soft-delete (archive) a property."""
        with db_session_scope() as session:
            prop = require_exists(session, Property, property_id, 'Property')
            prop.is_archived = True
            return jsonify({'message': 'Property archived'}), 200

    @app.route('/api/properties/<int:property_id>/restore', methods=['POST'])
    @handle_errors
    def restore_property(property_id):
        with db_session_scope() as session:
            prop = require_exists(session, Property, property_id, 'Property')
            prop.is_archived = False
            return jsonify({'message': 'Property restored'}), 200

    @app.route('/api/properties/<int:property_id>/loan', methods=['POST'])
    @handle_errors
    def update_property_loan(property_id):
        """Update loan_amount after a mortgage/principal payment and record the change as an event."""
        data = request.get_json()
        new_amount = float(data.get('loanAmount', 0))
        description = data.get('description', 'Loan balance updated after payment')

        with db_session_scope() as session:
            prop = require_exists(session, Property, property_id, 'Property')
            old_amount = float(prop.loan_amount or 0)

            event = Event(
                property_id=property_id,
                column_name='loan_amount',
                old_value=str(old_amount),
                new_value=str(new_amount),
                description=description
            )
            session.add(event)

            prop.loan_amount = new_amount
            return jsonify(prop.to_dict()), 200

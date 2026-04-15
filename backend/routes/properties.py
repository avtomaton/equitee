from flask import request, jsonify
from sqlalchemy import func
from utils.db import tenant_session, require_exists, NotFoundError
from utils.errors import handle_errors
from utils.transform import transform_property_create, transform_property_update
from models.schema import Property, Expense, Income, Event
from models.property import check_property_params
from middleware.tenant_router import tenant_required
from config import Config


def register_routes(app):
    @app.route('/api/properties', methods=['GET'])
    @tenant_required
    @handle_errors
    def get_properties():
        with tenant_session() as session:
            base = session.query(Property)
            if request.args.get('archived') != '1':
                base = base.filter(Property.is_archived == False)

            # Use correlated subqueries to avoid Cartesian product from JOINs.
            # A property with 3 income and 4 expense rows would produce 12 rows
            # with a JOIN, inflating both sums by the other table's row count.
            income_subq = (
                session.query(
                    Income.property_id,
                    func.coalesce(func.sum(Income.amount), 0).label('total_income'),
                )
                .group_by(Income.property_id)
                .subquery()
            )
            expense_subq = (
                session.query(
                    Expense.property_id,
                    func.coalesce(func.sum(Expense.amount), 0).label('total_expenses'),
                )
                .group_by(Expense.property_id)
                .subquery()
            )

            rows = (
                base.outerjoin(income_subq, income_subq.c.property_id == Property.id)
                    .outerjoin(expense_subq, expense_subq.c.property_id == Property.id)
                    .order_by(Property.created_at.desc())
                    .with_entities(
                        Property,
                        func.coalesce(income_subq.c.total_income, 0).label('total_income'),
                        func.coalesce(expense_subq.c.total_expenses, 0).label('total_expenses'),
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
    @tenant_required
    @handle_errors
    def get_property(property_id):
        with tenant_session() as session:
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
    @tenant_required
    @handle_errors
    def create_property():
        data = request.get_json()
        check_property_params(data)

        with tenant_session() as session:
            # SaaS mode: check property limit
            if Config.TENANCY_MODE == 'saas':
                from flask import g
                if g.current_user:
                    plan = g.current_user.get('plan', 'free')
                    max_props = Config.MAX_PROPERTIES_PER_PLAN.get(plan)
                    if max_props is not None:
                        current_count = session.query(Property).filter_by(is_archived=False).count()
                        if current_count >= max_props:
                            return jsonify({'error': f'Property limit reached for {plan} plan'}), 403

            kwargs = transform_property_create(data)
            prop = Property(**kwargs)
            session.add(prop)
            session.flush()
            d = prop.to_dict()
            d['total_income'] = 0
            d['total_expenses'] = 0
            return jsonify(d), 201

    @app.route('/api/properties/<int:property_id>', methods=['PUT'])
    @tenant_required
    @handle_errors
    def update_property(property_id):
        data = request.get_json()
        check_property_params(data)

        with tenant_session() as session:
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
    @tenant_required
    @handle_errors
    def archive_property(property_id):
        """Soft-delete (archive) a property."""
        with tenant_session() as session:
            prop = require_exists(session, Property, property_id, 'Property')
            prop.is_archived = True
            return jsonify({'message': 'Property archived'}), 200

    @app.route('/api/properties/<int:property_id>/restore', methods=['POST'])
    @tenant_required
    @handle_errors
    def restore_property(property_id):
        with tenant_session() as session:
            prop = require_exists(session, Property, property_id, 'Property')
            prop.is_archived = False
            return jsonify({'message': 'Property restored'}), 200

    @app.route('/api/properties/<int:property_id>/loan', methods=['POST'])
    @tenant_required
    @handle_errors
    def update_property_loan(property_id):
        """Update loan_amount after a mortgage/principal payment and record the change as an event."""
        data = request.get_json()
        new_amount = float(data.get('loanAmount', 0))
        description = data.get('description', 'Loan balance updated after payment')

        with tenant_session() as session:
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

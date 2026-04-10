from flask import request, jsonify
from datetime import datetime
from utils.db import tenant_session
from utils.errors import handle_errors
from utils.transform import transform_property_create
from models.schema import Property, Expense, Income
from models.property import check_property_params
from middleware.tenant_router import tenant_required
from sqlalchemy import func


def register_routes(app):
    @app.route('/api/statistics', methods=['GET'])
    @tenant_required
    @handle_errors
    def get_statistics():
        with tenant_session() as session:
            # Use subqueries to avoid Cartesian product from JOINs.
            total_income_result = session.query(
                func.coalesce(func.sum(Income.amount), 0)
            ).join(Property, Property.id == Income.property_id).filter(
                Property.is_archived == False
            ).scalar()

            total_expenses_result = session.query(
                func.coalesce(func.sum(Expense.amount), 0)
            ).join(Property, Property.id == Expense.property_id).filter(
                Property.is_archived == False
            ).scalar()

            prop_count = session.query(func.count(Property.id)).filter(
                Property.is_archived == False
            ).scalar()

            total_value = session.query(
                func.coalesce(func.sum(Property.market_price), 0)
            ).filter(Property.is_archived == False).scalar()

            total_income = total_income_result
            total_expenses = total_expenses_result
            net_profit = total_income - total_expenses

            return jsonify({
                'propertyCount':  prop_count,
                'totalRevenue':   total_income,
                'totalExpenses':  total_expenses,
                'netProfit':      net_profit,
                'totalValue':     total_value,
                'avgROI': (net_profit * 12 / total_value * 100) if total_value > 0 else 0
            }), 200

    @app.route('/api/import', methods=['POST'])
    @tenant_required
    @handle_errors
    def import_data():
        """Bulk import with validation and transaction rollback protection."""
        data = request.get_json()
        if not isinstance(data, list):
            return jsonify({'error': 'Data must be an array of properties'}), 400

        with tenant_session() as session:
            session.query(Expense).delete()
            session.query(Income).delete()
            session.query(Property).delete()

            imported_count = 0
            for prop_data in data:
                expenses_data = prop_data.pop('expenses', [])
                income_data = prop_data.pop('income', [])

                check_property_params(prop_data)
                kwargs = transform_property_create(prop_data)

                prop = Property(**kwargs)
                session.add(prop)
                session.flush()

                for e_data in expenses_data:
                    e_data['property_id'] = prop.id
                    session.add(Expense(**e_data))

                for i_data in income_data:
                    i_data['property_id'] = prop.id
                    session.add(Income(**i_data))

                imported_count += 1

            return jsonify({'message': 'Import successful', 'imported': imported_count}), 200

    @app.route('/api/export', methods=['GET'])
    @tenant_required
    @handle_errors
    def export_data():
        with tenant_session() as session:
            properties = session.query(Property).all()
            result = []

            for prop in properties:
                prop_dict = prop.to_dict()
                prop_dict['expenses'] = [e.to_dict() for e in prop.expenses]
                prop_dict['income'] = [i.to_dict() for i in prop.income_records]
                result.append(prop_dict)

            return jsonify(result), 200

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200

    @app.route('/', methods=['GET'])
    def index():
        return jsonify({'name': 'Real Estate Analytics API', 'version': '2.0.0'}), 200

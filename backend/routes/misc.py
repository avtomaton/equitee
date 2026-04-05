from flask import request, jsonify
from datetime import datetime
from utils.db import db_session_scope
from utils.errors import handle_errors
from models.schema import Property, Expense, Income
from sqlalchemy import func


def register_routes(app):
    @app.route('/api/statistics', methods=['GET'])
    @handle_errors
    def get_statistics():
        with db_session_scope() as session:
            properties = session.query(Property).filter(Property.is_archived == False).all()
            total_income = sum(p.total_income for p in properties)
            total_expenses = sum(p.total_expenses for p in properties)
            net_profit = total_income - total_expenses
            total_value = sum(p.market_price for p in properties)

            return jsonify({
                'propertyCount':  len(properties),
                'totalRevenue':   total_income,
                'totalExpenses':  total_expenses,
                'netProfit':      net_profit,
                'totalValue':     total_value,
                'avgROI': (net_profit * 12 / total_value * 100) if total_value > 0 else 0
            }), 200

    @app.route('/api/import', methods=['POST'])
    @handle_errors
    def import_data():
        """Bulk import with transaction rollback protection."""
        data = request.get_json()
        if not isinstance(data, list):
            return jsonify({'error': 'Data must be an array of properties'}), 400

        with db_session_scope() as session:
            try:
                # Clear existing data
                session.query(Expense).delete()
                session.query(Income).delete()
                session.query(Property).delete()

                imported_count = 0
                for prop_data in data:
                    # Extract nested records
                    expenses_data = prop_data.pop("expenses", [])
                    income_data = prop_data.pop("income", [])

                    # Create property
                    property = Property(**prop_data)
                    session.add(property)
                    session.flush()  # Get property ID

                    # Create expenses
                    for e_data in expenses_data:
                        e_data['property_id'] = property.id
                        expense = Expense(**e_data)
                        session.add(expense)

                    # Create income
                    for i_data in income_data:
                        i_data['property_id'] = property.id
                        income = Income(**i_data)
                        session.add(income)

                    imported_count += 1

                return jsonify({'message': 'Import successful', 'imported': imported_count}), 200

            except Exception:
                session.rollback()
                raise

    @app.route('/api/export', methods=['GET'])
    @handle_errors
    def export_data():
        with db_session_scope() as session:
            properties = session.query(Property).all()
            result = []

            for prop in properties:
                prop_dict = prop.to_dict()
                prop_dict["expenses"] = [e.to_dict() for e in prop.expenses]
                prop_dict["income"] = [i.to_dict() for i in prop.income_records]
                result.append(prop_dict)

            return jsonify(result), 200

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200

    @app.route('/', methods=['GET'])
    def index():
        return jsonify({'name': 'Real Estate Analytics API', 'version': '2.0.0'}), 200

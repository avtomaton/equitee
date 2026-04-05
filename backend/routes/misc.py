from flask import request, jsonify
from datetime import datetime
from utils.database import db_cursor, row_to_dict
from utils.errors import handle_errors
from models.property import select_from_properties
from validation import validate_table_name, validate_column_name, validate_column_name


def register_routes(app):
    @app.route('/api/statistics', methods=['GET'])
    @handle_errors
    def get_statistics():
        with db_cursor() as (_, cursor):
            cursor.execute(select_from_properties())
            properties     = [row_to_dict(r) for r in cursor.fetchall()]
            total_income   = sum(p['total_income']   for p in properties)
            total_expenses = sum(p['total_expenses'] for p in properties)
            net_profit     = total_income - total_expenses
            total_value    = sum(p['market_price']   for p in properties)
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
        """Bulk import with whitelist validation.

        All mutations run inside a SAVEPOINT so that any error during the import
        (bad data, constraint violation, etc.) automatically rolls back to the
        pre-import state — the existing data is never lost on partial failure.
        """
        data = request.get_json()
        if not isinstance(data, list):
            return jsonify({'error': 'Data must be an array of properties'}), 400

        with db_cursor() as (conn, cursor):
            cursor.execute('SAVEPOINT import_savepoint')
            try:
                cursor.execute('DELETE FROM expenses')
                cursor.execute('DELETE FROM income')
                cursor.execute('DELETE FROM properties')

                def insert_dynamic(table_name, row_data):
                    validate_table_name(table_name)
                    cursor.execute(f"PRAGMA table_info({table_name})")
                    columns = [col["name"] for col in cursor.fetchall()]
                    filtered = {}
                    for k in row_data:
                        if k in columns:
                            validate_column_name(table_name, k)
                            filtered[k] = row_data[k]
                    if not filtered:
                        return
                    cursor.execute(
                        f"INSERT INTO {table_name} ({', '.join(filtered)}) VALUES ({', '.join('?' for _ in filtered)})",
                        tuple(filtered.values()))

                imported_count = 0
                for prop in data:
                    expenses = prop.pop("expenses", [])
                    income   = prop.pop("income",   [])
                    insert_dynamic("properties", prop)
                    for e in expenses:
                        insert_dynamic("expenses", e)
                    for i in income:
                        insert_dynamic("income", i)
                    imported_count += 1

                cursor.execute('RELEASE import_savepoint')
                return jsonify({'message': 'Import successful', 'imported': imported_count}), 200

            except Exception:
                cursor.execute('ROLLBACK TO import_savepoint')
                raise  # re-raise so @handle_errors returns a 500

    @app.route('/api/export', methods=['GET'])
    @handle_errors
    def export_data():
        with db_cursor() as (_, cursor):
            cursor.execute("SELECT * FROM properties")
            properties = cursor.fetchall()

            cursor.execute("SELECT * FROM expenses")
            all_expenses = [dict(r) for r in cursor.fetchall()]
            expenses_by_prop = {}
            for e in all_expenses:
                expenses_by_prop.setdefault(e['property_id'], []).append(e)

            cursor.execute("SELECT * FROM income")
            all_income = [dict(r) for r in cursor.fetchall()]
            income_by_prop = {}
            for i in all_income:
                income_by_prop.setdefault(i['property_id'], []).append(i)

            result = []
            for p in properties:
                prop_dict = dict(p)
                prop_dict["expenses"] = expenses_by_prop.get(p["id"], [])
                prop_dict["income"] = income_by_prop.get(p["id"], [])
                result.append(prop_dict)
            return jsonify(result), 200

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200

    @app.route('/', methods=['GET'])
    def index():
        return jsonify({'name': 'Real Estate Analytics API', 'version': '2.0.0'}), 200

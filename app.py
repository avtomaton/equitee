from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)

DATABASE = 'real_estate.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Properties
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            province TEXT NOT NULL,
            city TEXT NOT NULL,
            address TEXT NOT NULL,
            postal_code TEXT NOT NULL,
            parking TEXT,
            purchase_price REAL NOT NULL,
            market_price REAL NOT NULL,
            loan_amount REAL NOT NULL,
            monthly_rent REAL NOT NULL,
            poss_date TEXT NOT NULL,
            status TEXT NOT NULL,
            type TEXT DEFAULT 'Condo',
            notes TEXT DEFAULT '',
            is_archived INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Expenses
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            expense_date TEXT NOT NULL,
            amount REAL NOT NULL,
            expense_type TEXT NOT NULL,
            expense_category TEXT NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
    ''')

    # Income
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS income (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            income_date TEXT NOT NULL,
            amount REAL NOT NULL,
            income_type TEXT NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
    ''')

    # Events
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            column_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
    ''')

    # Tenants
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            notes TEXT,
            lease_start TEXT NOT NULL,
            lease_end TEXT,
            deposit REAL DEFAULT 0,
            rent_amount REAL DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
    ''')

    conn.commit()
    conn.close()
    print("Database initialized successfully!")

init_db()

def row_to_dict(row):
    return dict(row)

def select_from_properties():
    return '''SELECT
                  p.id,
                  p.name,
                  p.province,
                  p.city,
                  p.address,
                  p.postal_code,
                  p.parking,
                  p.purchase_price,
                  p.market_price,
                  p.loan_amount,
                  p.poss_date,
                  p.status,
                  p.type,
                  p.monthly_rent,
                  p.notes,
                  p.is_archived,
                  IFNULL((SELECT SUM(amount) FROM expenses WHERE property_id = p.id), 0) AS total_expenses,
                  IFNULL((SELECT SUM(amount) FROM income WHERE property_id = p.id), 0) AS total_income
               FROM properties p
            '''

# ── Properties ────────────────────────────────────────────────────────────────

@app.route('/api/properties', methods=['GET'])
def get_properties():
    try:
        conn = get_db()
        cursor = conn.cursor()
        include_archived = request.args.get('archived') == '1'
        where = '' if include_archived else ' WHERE p.is_archived = 0'
        cursor.execute(select_from_properties() + where + ' ORDER BY p.created_at DESC')
        properties = [row_to_dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(properties), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties/<int:property_id>', methods=['GET'])
def get_property(property_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(select_from_properties() + ' WHERE p.id = ?', (property_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return jsonify(row_to_dict(row)), 200
        return jsonify({'error': 'Property not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties', methods=['POST'])
def create_property():
    try:
        data = request.get_json()
        required_fields = ['name', 'province', 'city', 'address', 'postalCode',
                           'purchasePrice', 'marketPrice', 'loanAmount', 'possDate',
                           'monthlyRent', 'status']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO properties (name, province, city, address, postal_code,
                                    parking, purchase_price, market_price,
                                    loan_amount, poss_date, monthly_rent, status, type, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['name'], data['province'], data['city'], data['address'],
            data['postalCode'], data.get('parking', ''),
            data['purchasePrice'], data['marketPrice'], data['loanAmount'],
            data['possDate'], data['monthlyRent'], data['status'],
            data.get('type', 'Condo'), data.get('notes', '')
        ))
        property_id = cursor.lastrowid
        conn.commit()
        cursor.execute(select_from_properties() + ' WHERE p.id = ?', (property_id,))
        new_property = row_to_dict(cursor.fetchone())
        conn.close()
        return jsonify(new_property), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties/<int:property_id>', methods=['PUT'])
def update_property(property_id):
    try:
        data = request.get_json()
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM properties WHERE id = ?', (property_id,))
        old_property = cursor.fetchone()
        if not old_property:
            conn.close()
            return jsonify({'error': 'Property not found'}), 404
        old_property = dict(old_property)

        field_mapping = {
            'name':           data['name'],
            'province':       data['province'],
            'city':           data['city'],
            'address':        data['address'],
            'postal_code':    data['postalCode'],
            'parking':        data.get('parking', ''),
            'purchase_price': data['purchasePrice'],
            'market_price':   data['marketPrice'],
            'loan_amount':    data['loanAmount'],
            'poss_date':      data['possDate'],
            'monthly_rent':   data['monthlyRent'],
            'status':         data['status'],
            'type':           data.get('type', 'Condo'),
        }

        for column, new_value in field_mapping.items():
            old_value = old_property.get(column)
            if isinstance(new_value, (int, float)):
                old_value = float(old_value) if old_value else 0
                new_value = float(new_value) if new_value else 0
            else:
                old_value = str(old_value) if old_value else ''
                new_value = str(new_value) if new_value else ''
            if old_value != new_value:
                cursor.execute('''
                    INSERT INTO events (property_id, column_name, old_value, new_value, description)
                    VALUES (?, ?, ?, ?, ?)
                ''', (property_id, column, str(old_value), str(new_value), ''))

        cursor.execute('''
            UPDATE properties
            SET name=?, province=?, city=?, address=?, postal_code=?, parking=?,
                purchase_price=?, market_price=?, loan_amount=?, poss_date=?,
                monthly_rent=?, status=?, type=?, notes=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (
            data['name'], data['province'], data['city'], data['address'],
            data['postalCode'], data.get('parking', ''),
            data['purchasePrice'], data['marketPrice'], data['loanAmount'],
            data['possDate'], data['monthlyRent'], data['status'],
            data.get('type', 'Condo'), data.get('notes', ''), property_id
        ))
        conn.commit()
        cursor.execute(select_from_properties() + ' WHERE p.id = ?', (property_id,))
        updated = row_to_dict(cursor.fetchone())
        conn.close()
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties/<int:property_id>', methods=['DELETE'])
def archive_property(property_id):
    """Soft-delete (archive) a property"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM properties WHERE id = ?', (property_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Property not found'}), 404
        cursor.execute('UPDATE properties SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (property_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Property archived'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties/<int:property_id>/restore', methods=['POST'])
def restore_property(property_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('UPDATE properties SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (property_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Property restored'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Expenses ──────────────────────────────────────────────────────────────────

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    try:
        property_id = request.args.get('property_id')
        conn = get_db()
        cursor = conn.cursor()
        if property_id:
            cursor.execute('SELECT * FROM expenses WHERE property_id = ? ORDER BY expense_date DESC', (property_id,))
        else:
            cursor.execute('SELECT * FROM expenses ORDER BY expense_date DESC')
        expenses = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(expenses), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/expenses', methods=['POST'])
def create_expense():
    try:
        data = request.get_json()
        required_fields = ['propertyId', 'expenseDate', 'amount', 'expenseType', 'expenseCategory']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO expenses (property_id, expense_date, amount, expense_type, expense_category, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (data['propertyId'], data['expenseDate'], data['amount'],
              data['expenseType'], data['expenseCategory'], data.get('notes', '')))
        expense_id = cursor.lastrowid
        conn.commit()
        cursor.execute('SELECT * FROM expenses WHERE id = ?', (expense_id,))
        new_expense = dict(cursor.fetchone())
        conn.close()
        return jsonify(new_expense), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/expenses/<int:expense_id>', methods=['PUT'])
def update_expense(expense_id):
    try:
        data = request.get_json()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM expenses WHERE id = ?', (expense_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Expense not found'}), 404
        cursor.execute('''
            UPDATE expenses
            SET property_id=?, expense_date=?, amount=?, expense_type=?,
                expense_category=?, notes=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (data['propertyId'], data['expenseDate'], data['amount'],
              data['expenseType'], data['expenseCategory'],
              data.get('notes', ''), expense_id))
        conn.commit()
        cursor.execute('SELECT * FROM expenses WHERE id = ?', (expense_id,))
        updated = dict(cursor.fetchone())
        conn.close()
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
def delete_expense(expense_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM expenses WHERE id = ?', (expense_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Expense not found'}), 404
        cursor.execute('DELETE FROM expenses WHERE id = ?', (expense_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Expense deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Income ────────────────────────────────────────────────────────────────────

@app.route('/api/income', methods=['GET'])
def get_income():
    try:
        property_id = request.args.get('property_id')
        conn = get_db()
        cursor = conn.cursor()
        if property_id:
            cursor.execute('SELECT * FROM income WHERE property_id = ? ORDER BY income_date DESC', (property_id,))
        else:
            cursor.execute('SELECT * FROM income ORDER BY income_date DESC')
        income = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(income), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/income', methods=['POST'])
def create_income():
    try:
        data = request.get_json()
        required_fields = ['propertyId', 'incomeDate', 'amount', 'incomeType']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO income (property_id, income_date, amount, income_type, notes)
            VALUES (?, ?, ?, ?, ?)
        ''', (data['propertyId'], data['incomeDate'], data['amount'],
              data['incomeType'], data.get('notes', '')))
        income_id = cursor.lastrowid
        conn.commit()
        cursor.execute('SELECT * FROM income WHERE id = ?', (income_id,))
        new_income = dict(cursor.fetchone())
        conn.close()
        return jsonify(new_income), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/income/<int:income_id>', methods=['PUT'])
def update_income(income_id):
    try:
        data = request.get_json()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM income WHERE id = ?', (income_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Income not found'}), 404
        cursor.execute('''
            UPDATE income
            SET property_id=?, income_date=?, amount=?, income_type=?,
                notes=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (data['propertyId'], data['incomeDate'], data['amount'],
              data['incomeType'], data.get('notes', ''), income_id))
        conn.commit()
        cursor.execute('SELECT * FROM income WHERE id = ?', (income_id,))
        updated = dict(cursor.fetchone())
        conn.close()
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/income/<int:income_id>', methods=['DELETE'])
def delete_income(income_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM income WHERE id = ?', (income_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Income not found'}), 404
        cursor.execute('DELETE FROM income WHERE id = ?', (income_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Income deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Tenants ───────────────────────────────────────────────────────────────────

@app.route('/api/tenants', methods=['GET'])
def get_tenants():
    try:
        property_id = request.args.get('property_id')
        conn = get_db()
        cursor = conn.cursor()
        include_archived = request.args.get('archived') == '1'
        arch_clause = '' if include_archived else 'AND t.is_archived = 0'
        if property_id:
            cursor.execute(f'''
                SELECT t.*, p.name as property_name
                FROM tenants t
                LEFT JOIN properties p ON t.property_id = p.id
                WHERE t.property_id = ? {arch_clause}
                ORDER BY t.lease_start DESC
            ''', (property_id,))
        else:
            cursor.execute(f'''
                SELECT t.*, p.name as property_name
                FROM tenants t
                LEFT JOIN properties p ON t.property_id = p.id
                WHERE 1=1 {arch_clause}
                ORDER BY t.lease_start DESC
            ''')
        tenants = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(tenants), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tenants', methods=['POST'])
def create_tenant():
    try:
        data = request.get_json()
        required_fields = ['propertyId', 'name', 'leaseStart']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO tenants (property_id, name, phone, email, notes,
                                 lease_start, lease_end, deposit, rent_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['propertyId'], data['name'],
            data.get('phone', ''), data.get('email', ''), data.get('notes', ''),
            data['leaseStart'], data.get('leaseEnd') or None,
            data.get('deposit', 0), data.get('rentAmount', 0)
        ))
        tenant_id = cursor.lastrowid
        conn.commit()
        cursor.execute('''
            SELECT t.*, p.name as property_name FROM tenants t
            LEFT JOIN properties p ON t.property_id = p.id
            WHERE t.id = ?
        ''', (tenant_id,))
        new_tenant = dict(cursor.fetchone())
        conn.close()
        return jsonify(new_tenant), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tenants/<int:tenant_id>', methods=['PUT'])
def update_tenant(tenant_id):
    try:
        data = request.get_json()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM tenants WHERE id = ?', (tenant_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Tenant not found'}), 404
        cursor.execute('''
            UPDATE tenants
            SET property_id=?, name=?, phone=?, email=?, notes=?,
                lease_start=?, lease_end=?, deposit=?, rent_amount=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (
            data['propertyId'], data['name'],
            data.get('phone', ''), data.get('email', ''), data.get('notes', ''),
            data['leaseStart'], data.get('leaseEnd') or None,
            data.get('deposit', 0), data.get('rentAmount', 0),
            tenant_id
        ))
        conn.commit()
        cursor.execute('''
            SELECT t.*, p.name as property_name FROM tenants t
            LEFT JOIN properties p ON t.property_id = p.id
            WHERE t.id = ?
        ''', (tenant_id,))
        updated = dict(cursor.fetchone())
        conn.close()
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tenants/<int:tenant_id>', methods=['DELETE'])
def archive_tenant(tenant_id):
    """Soft-delete (archive) a tenant"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM tenants WHERE id = ?', (tenant_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Tenant not found'}), 404
        cursor.execute('UPDATE tenants SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (tenant_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Tenant archived'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tenants/<int:tenant_id>/restore', methods=['POST'])
def restore_tenant(tenant_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('UPDATE tenants SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (tenant_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Tenant restored'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Events ────────────────────────────────────────────────────────────────────

@app.route('/api/events', methods=['GET'])
def get_events():
    try:
        property_id = request.args.get('property_id')
        conn = get_db()
        cursor = conn.cursor()
        if property_id:
            cursor.execute('''
                SELECT e.*, p.name as property_name
                FROM events e
                LEFT JOIN properties p ON e.property_id = p.id
                WHERE e.property_id = ?
                ORDER BY e.created_at DESC
            ''', (property_id,))
        else:
            cursor.execute('''
                SELECT e.*, p.name as property_name
                FROM events e
                LEFT JOIN properties p ON e.property_id = p.id
                ORDER BY e.created_at DESC
            ''')
        events = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(events), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    try:
        data = request.get_json()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM events WHERE id = ?', (event_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Event not found'}), 404
        cursor.execute('UPDATE events SET description=? WHERE id=?',
                       (data.get('description', ''), event_id))
        conn.commit()
        cursor.execute('SELECT * FROM events WHERE id = ?', (event_id,))
        updated = dict(cursor.fetchone())
        conn.close()
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM events WHERE id = ?', (event_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Event not found'}), 404
        cursor.execute('DELETE FROM events WHERE id = ?', (event_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Event deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Misc ──────────────────────────────────────────────────────────────────────

@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(select_from_properties())
        properties = [row_to_dict(row) for row in cursor.fetchall()]
        conn.close()
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
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/import', methods=['POST'])
def import_data():
    try:
        data = request.get_json()
        if not isinstance(data, list):
            return jsonify({'error': 'Data must be an array of properties'}), 400
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM expenses')
        cursor.execute('DELETE FROM income')
        cursor.execute('DELETE FROM properties')
        conn.commit()

        def insert_dynamic(table_name, row_data):
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [col["name"] for col in cursor.fetchall()]
            filtered_data = {k: row_data[k] for k in row_data if k in columns}
            col_names = ", ".join(filtered_data.keys())
            placeholders = ", ".join("?" for _ in filtered_data)
            cursor.execute(
                f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})",
                tuple(filtered_data.values())
            )

        imported_count = 0
        for prop in data:
            expenses = prop.pop("expenses", [])
            income   = prop.pop("income",   [])
            insert_dynamic("properties", prop)
            for e in expenses: insert_dynamic("expenses", e)
            for i in income:   insert_dynamic("income",   i)
            imported_count += 1

        conn.commit()
        conn.close()
        return jsonify({'message': 'Import successful', 'imported': imported_count}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export', methods=['GET'])
def export_data():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM properties")
        properties = cursor.fetchall()
        result = []
        for p in properties:
            prop_dict = dict(p)
            cursor.execute("SELECT * FROM expenses WHERE property_id = ?", (p["id"],))
            prop_dict["expenses"] = [dict(r) for r in cursor.fetchall()]
            cursor.execute("SELECT * FROM income WHERE property_id = ?", (p["id"],))
            prop_dict["income"] = [dict(r) for r in cursor.fetchall()]
            result.append(prop_dict)
        conn.close()
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200

@app.route('/', methods=['GET'])
def index():
    return jsonify({'name': 'Real Estate Analytics API', 'version': '2.0.0'}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

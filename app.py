from flask import Flask, request, jsonify
from flask_cors import CORS
from contextlib import contextmanager
from functools import wraps
import sqlite3
from datetime import datetime

app = Flask(__name__)
CORS(app)

DATABASE = 'real_estate.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

# ── Shared helpers ────────────────────────────────────────────────────────────

@contextmanager
def db_cursor():
    """Open a connection, yield (conn, cursor), commit on success, always close."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        yield conn, cursor
        conn.commit()
    finally:
        conn.close()


class NotFoundError(Exception):
    """Raised when a requested resource doesn't exist."""
    pass


def handle_errors(f):
    """Decorator: catch NotFoundError → 404, any other Exception → 500."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except NotFoundError as e:
            return jsonify({'error': str(e)}), 404
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return wrapper


def validate_required(data, fields):
    """Return a 400 response if any field is missing from data, else None."""
    for field in fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    return None


def require_exists(cursor, table, resource_id, label):
    """Raise NotFoundError if the row doesn't exist."""
    cursor.execute(f'SELECT id FROM {table} WHERE id = ?', (resource_id,))
    if not cursor.fetchone():
        raise NotFoundError(f'{label} not found')


def property_params(data):
    """Return the ordered tuple of property field values from a request payload."""
    return (
        data['name'], data['province'], data['city'], data['address'],
        data['postalCode'], data.get('parking', ''),
        data['purchasePrice'], data['marketPrice'], data['loanAmount'],
        data.get('mortgageRate', 0),
        data['possDate'], data['monthlyRent'], data['status'],
        data.get('type', 'Condo'), data.get('notes', ''),
        data.get('expectedCondoFees', 0),
        data.get('expectedInsurance', 0),
        data.get('expectedUtilities', 0),
        data.get('expectedMiscExpenses', 0),
        data.get('expectedAppreciationPct', 0),
        data.get('annualPropertyTax', 0),
        data.get('mortgagePayment', 0),
        data.get('mortgageFrequency', 'monthly'),
    )

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Properties
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
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
            expected_condo_fees REAL DEFAULT 0,
            expected_insurance REAL DEFAULT 0,
            expected_utilities REAL DEFAULT 0,
            expected_misc_expenses REAL DEFAULT 0,
            expected_appreciation_pct REAL DEFAULT 0,
            annual_property_tax REAL DEFAULT 0,
            mortgage_rate REAL DEFAULT 0,
            mortgage_payment REAL DEFAULT 0,
            mortgage_frequency TEXT DEFAULT 'monthly',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_archived INTEGER DEFAULT 0
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
            tax_deductible INTEGER NOT NULL DEFAULT 1,
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
                  p.mortgage_rate,
                  p.poss_date,
                  p.status,
                  p.type,
                  p.monthly_rent,
                  p.notes,
                  p.is_archived,
                  p.expected_condo_fees,
                  p.expected_insurance,
                  p.expected_utilities,
                  p.expected_misc_expenses,
                  p.expected_appreciation_pct,
                  p.annual_property_tax,
                  p.mortgage_payment,
                  p.mortgage_frequency,
                  IFNULL((SELECT SUM(amount) FROM expenses WHERE property_id = p.id), 0) AS total_expenses,
                  IFNULL((SELECT SUM(amount) FROM income WHERE property_id = p.id), 0) AS total_income
               FROM properties p
            '''

# ── Properties ────────────────────────────────────────────────────────────────

@app.route('/api/properties', methods=['GET'])
@handle_errors
def get_properties():
    with db_cursor() as (_, cursor):
        where = '' if request.args.get('archived') == '1' else ' WHERE p.is_archived = 0'
        cursor.execute(select_from_properties() + where + ' ORDER BY p.created_at DESC')
        return jsonify([row_to_dict(r) for r in cursor.fetchall()]), 200

@app.route('/api/properties/<int:property_id>', methods=['GET'])
@handle_errors
def get_property(property_id):
    with db_cursor() as (_, cursor):
        cursor.execute(select_from_properties() + ' WHERE p.id = ?', (property_id,))
        row = cursor.fetchone()
        if not row:
            raise NotFoundError('Property not found')
        return jsonify(row_to_dict(row)), 200

@app.route('/api/properties', methods=['POST'])
@handle_errors
def create_property():
    data = request.get_json()
    err = validate_required(data, ['name', 'province', 'city', 'address', 'postalCode',
                                   'purchasePrice', 'marketPrice', 'loanAmount', 'possDate',
                                   'monthlyRent', 'status'])
    if err:
        return err
    with db_cursor() as (_, cursor):
        cursor.execute('''
            INSERT INTO properties (name, province, city, address, postal_code,
                                    parking, purchase_price, market_price,
                                    loan_amount, mortgage_rate, poss_date, monthly_rent, status, type, notes,
                                    expected_condo_fees, expected_insurance, expected_utilities, expected_misc_expenses,
                                    expected_appreciation_pct, annual_property_tax,
                                    mortgage_payment, mortgage_frequency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', property_params(data))
        new_id = cursor.lastrowid
        cursor.execute(select_from_properties() + ' WHERE p.id = ?', (new_id,))
        return jsonify(row_to_dict(cursor.fetchone())), 201

@app.route('/api/properties/<int:property_id>', methods=['PUT'])
@handle_errors
def update_property(property_id):
    data = request.get_json()
    with db_cursor() as (_, cursor):
        cursor.execute('SELECT * FROM properties WHERE id = ?', (property_id,))
        old = cursor.fetchone()
        if not old:
            raise NotFoundError('Property not found')
        old = dict(old)

        field_mapping = {
            'name':                      data['name'],
            'province':                  data['province'],
            'city':                      data['city'],
            'address':                   data['address'],
            'postal_code':               data['postalCode'],
            'parking':                   data.get('parking', ''),
            'purchase_price':            data['purchasePrice'],
            'market_price':              data['marketPrice'],
            'loan_amount':               data['loanAmount'],
            'mortgage_rate':             data.get('mortgageRate', 0),
            'poss_date':                 data['possDate'],
            'monthly_rent':              data['monthlyRent'],
            'status':                    data['status'],
            'type':                      data.get('type', 'Condo'),
            'expected_condo_fees':       data.get('expectedCondoFees', 0),
            'expected_insurance':        data.get('expectedInsurance', 0),
            'expected_utilities':        data.get('expectedUtilities', 0),
            'expected_misc_expenses':    data.get('expectedMiscExpenses', 0),
            'expected_appreciation_pct': data.get('expectedAppreciationPct', 0),
            'annual_property_tax':       data.get('annualPropertyTax', 0),
            'mortgage_payment':          data.get('mortgagePayment', 0),
            'mortgage_frequency':        data.get('mortgageFrequency', 'monthly'),
        }

        for column, new_value in field_mapping.items():
            old_value = old.get(column)
            if isinstance(new_value, (int, float)):
                old_value = float(old_value) if old_value else 0
                new_value = float(new_value) if new_value else 0
            else:
                old_value = str(old_value) if old_value else ''
                new_value = str(new_value) if new_value else ''
            if old_value != new_value:
                cursor.execute(
                    'INSERT INTO events (property_id, column_name, old_value, new_value, description) VALUES (?, ?, ?, ?, ?)',
                    (property_id, column, str(old_value), str(new_value), ''))

        cursor.execute('''
            UPDATE properties
            SET name=?, province=?, city=?, address=?, postal_code=?, parking=?,
                purchase_price=?, market_price=?, loan_amount=?, mortgage_rate=?, poss_date=?,
                monthly_rent=?, status=?, type=?, notes=?,
                expected_condo_fees=?, expected_insurance=?, expected_utilities=?, expected_misc_expenses=?,
                expected_appreciation_pct=?, annual_property_tax=?,
                mortgage_payment=?, mortgage_frequency=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', property_params(data) + (property_id,))
        cursor.execute(select_from_properties() + ' WHERE p.id = ?', (property_id,))
        return jsonify(row_to_dict(cursor.fetchone())), 200

@app.route('/api/properties/<int:property_id>', methods=['DELETE'])
@handle_errors
def archive_property(property_id):
    """Soft-delete (archive) a property."""
    with db_cursor() as (_, cursor):
        require_exists(cursor, 'properties', property_id, 'Property')
        cursor.execute('UPDATE properties SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (property_id,))
        return jsonify({'message': 'Property archived'}), 200

@app.route('/api/properties/<int:property_id>/restore', methods=['POST'])
@handle_errors
def restore_property(property_id):
    with db_cursor() as (_, cursor):
        cursor.execute('UPDATE properties SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (property_id,))
        return jsonify({'message': 'Property restored'}), 200

# ── Expenses ──────────────────────────────────────────────────────────────────

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
    err = validate_required(data, ['propertyId', 'expenseDate', 'amount', 'expenseType', 'expenseCategory'])
    if err:
        return err
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

# ── Income ────────────────────────────────────────────────────────────────────

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
    err = validate_required(data, ['propertyId', 'incomeDate', 'amount', 'incomeType'])
    if err:
        return err
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

# ── Tenants ───────────────────────────────────────────────────────────────────

@app.route('/api/tenants', methods=['GET'])
@handle_errors
def get_tenants():
    with db_cursor() as (_, cursor):
        property_id  = request.args.get('property_id')
        arch_clause  = '' if request.args.get('archived') == '1' else 'AND t.is_archived = 0'
        if property_id:
            cursor.execute(f'''
                SELECT t.*, p.name as property_name
                FROM tenants t LEFT JOIN properties p ON t.property_id = p.id
                WHERE t.property_id = ? {arch_clause}
                ORDER BY t.lease_start DESC
            ''', (property_id,))
        else:
            cursor.execute(f'''
                SELECT t.*, p.name as property_name
                FROM tenants t LEFT JOIN properties p ON t.property_id = p.id
                WHERE 1=1 {arch_clause}
                ORDER BY t.lease_start DESC
            ''')
        return jsonify([dict(r) for r in cursor.fetchall()]), 200

TENANT_JOIN = 'SELECT t.*, p.name as property_name FROM tenants t LEFT JOIN properties p ON t.property_id = p.id WHERE t.id = ?'

@app.route('/api/tenants', methods=['POST'])
@handle_errors
def create_tenant():
    data = request.get_json()
    err = validate_required(data, ['propertyId', 'name', 'leaseStart'])
    if err:
        return err
    with db_cursor() as (_, cursor):
        cursor.execute(
            'INSERT INTO tenants (property_id, name, phone, email, notes, lease_start, lease_end, deposit, rent_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (data['propertyId'], data['name'],
             data.get('phone', ''), data.get('email', ''), data.get('notes', ''),
             data['leaseStart'], data.get('leaseEnd') or None,
             data.get('deposit', 0), data.get('rentAmount', 0)))
        new_id = cursor.lastrowid
        cursor.execute(TENANT_JOIN, (new_id,))
        return jsonify(dict(cursor.fetchone())), 201

@app.route('/api/tenants/<int:tenant_id>', methods=['PUT'])
@handle_errors
def update_tenant(tenant_id):
    data = request.get_json()
    with db_cursor() as (_, cursor):
        require_exists(cursor, 'tenants', tenant_id, 'Tenant')
        cursor.execute('''
            UPDATE tenants
            SET property_id=?, name=?, phone=?, email=?, notes=?,
                lease_start=?, lease_end=?, deposit=?, rent_amount=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (data['propertyId'], data['name'],
              data.get('phone', ''), data.get('email', ''), data.get('notes', ''),
              data['leaseStart'], data.get('leaseEnd') or None,
              data.get('deposit', 0), data.get('rentAmount', 0),
              tenant_id))
        cursor.execute(TENANT_JOIN, (tenant_id,))
        return jsonify(dict(cursor.fetchone())), 200

@app.route('/api/tenants/<int:tenant_id>', methods=['DELETE'])
@handle_errors
def archive_tenant(tenant_id):
    """Soft-delete (archive) a tenant."""
    with db_cursor() as (_, cursor):
        require_exists(cursor, 'tenants', tenant_id, 'Tenant')
        cursor.execute('UPDATE tenants SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (tenant_id,))
        return jsonify({'message': 'Tenant archived'}), 200

@app.route('/api/tenants/<int:tenant_id>/restore', methods=['POST'])
@handle_errors
def restore_tenant(tenant_id):
    with db_cursor() as (_, cursor):
        cursor.execute('UPDATE tenants SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (tenant_id,))
        return jsonify({'message': 'Tenant restored'}), 200

# ── Events ────────────────────────────────────────────────────────────────────

@app.route('/api/events', methods=['GET'])
@handle_errors
def get_events():
    with db_cursor() as (_, cursor):
        property_id = request.args.get('property_id')
        if property_id:
            cursor.execute('''
                SELECT e.*, p.name as property_name
                FROM events e LEFT JOIN properties p ON e.property_id = p.id
                WHERE e.property_id = ? ORDER BY e.created_at DESC
            ''', (property_id,))
        else:
            cursor.execute('''
                SELECT e.*, p.name as property_name
                FROM events e LEFT JOIN properties p ON e.property_id = p.id
                ORDER BY e.created_at DESC
            ''')
        return jsonify([dict(r) for r in cursor.fetchall()]), 200

@app.route('/api/events/<int:event_id>', methods=['PUT'])
@handle_errors
def update_event(event_id):
    data = request.get_json()
    with db_cursor() as (_, cursor):
        require_exists(cursor, 'events', event_id, 'Event')
        cursor.execute('UPDATE events SET description=? WHERE id=?',
                       (data.get('description', ''), event_id))
        cursor.execute('SELECT * FROM events WHERE id = ?', (event_id,))
        return jsonify(dict(cursor.fetchone())), 200

@app.route('/api/events/<int:event_id>', methods=['DELETE'])
@handle_errors
def delete_event(event_id):
    with db_cursor() as (_, cursor):
        require_exists(cursor, 'events', event_id, 'Event')
        cursor.execute('DELETE FROM events WHERE id = ?', (event_id,))
        return jsonify({'message': 'Event deleted successfully'}), 200

# ── Misc ──────────────────────────────────────────────────────────────────────

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
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({'error': 'Data must be an array of properties'}), 400
    with db_cursor() as (_, cursor):
        cursor.execute('DELETE FROM expenses')
        cursor.execute('DELETE FROM income')
        cursor.execute('DELETE FROM properties')

        def insert_dynamic(table_name, row_data):
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [col["name"] for col in cursor.fetchall()]
            filtered = {k: row_data[k] for k in row_data if k in columns}
            cursor.execute(
                f"INSERT INTO {table_name} ({', '.join(filtered)}) VALUES ({', '.join('?' for _ in filtered)})",
                tuple(filtered.values()))

        imported_count = 0
        for prop in data:
            expenses = prop.pop("expenses", [])
            income   = prop.pop("income",   [])
            insert_dynamic("properties", prop)
            for e in expenses: insert_dynamic("expenses", e)
            for i in income:   insert_dynamic("income",   i)
            imported_count += 1

        return jsonify({'message': 'Import successful', 'imported': imported_count}), 200

@app.route('/api/export', methods=['GET'])
@handle_errors
def export_data():
    with db_cursor() as (_, cursor):
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
        return jsonify(result), 200

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200

@app.route('/', methods=['GET'])
def index():
    return jsonify({'name': 'Real Estate Analytics API', 'version': '2.0.0'}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

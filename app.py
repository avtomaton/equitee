from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend connection

# Database configuration
DATABASE = 'real_estate.db'

def get_db():
    """Create a database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row  # Return rows as dictionaries
    return conn

def init_db():
    """Initialize the database with tables"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Create properties table
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Create table for expenses
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS expenses (
                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                       property_id INTEGER NOT NULL,
                       expense_date TEXT NOT NULL,
                       amount REAL NOT NULL,
                       expense_type TEXT NOT NULL,
                       expense_category TEXT NOT NULL,
                       description TEXT,
                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                       FOREIGN KEY (property_id) REFERENCES properties(id)
                       ON DELETE CASCADE
                       )
                   ''')

    # Create table for expenses
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS income (
                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                       property_id INTEGER NOT NULL,
                       income_date TEXT NOT NULL,
                       amount REAL NOT NULL,
                       income_type TEXT NOT NULL,
                       description TEXT,
                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                       FOREIGN KEY (property_id) REFERENCES properties(id)
                       ON DELETE CASCADE
                       )
                   ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully!")

# Initialize database on startup
init_db()

# Helper function to convert Row to dict
def row_to_dict(row):
    """Convert SQLite Row to dictionary"""
    d = dict(row)
    # d['expenses'] = json.loads(d['expenses'])
    return d

# helper for get SQL request for all property fields
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
                  p.monthly_rent,
                  IFNULL((SELECT SUM(amount) FROM expenses WHERE property_id = p.id), 0) AS total_expenses,
                  IFNULL((SELECT SUM(amount) FROM income WHERE property_id = p.id), 0) AS total_income
               FROM
                  properties p
            '''

# API Routes

@app.route('/api/properties', methods=['GET'])
def get_properties():
    """Get all properties"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(select_from_properties() + ' ORDER BY created_at DESC')
        properties = [row_to_dict(row) for row in cursor.fetchall()]
        app.logger.info(properties)
        conn.close()
        return jsonify(properties), 200
    except Exception as e:
        app.logger.info("we are here")
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties/<int:property_id>', methods=['GET'])
def get_property(property_id):
    """Get a single property by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(select_from_properties() + ' WHERE p.id = ?',
                       (property_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return jsonify(row_to_dict(row)), 200
        else:
            return jsonify({'error': 'Property not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties', methods=['POST'])
def create_property():
    """Create a new property"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name',
                           'province',
                           'city',
                           'address',
                           'postalCode',
                           'parking',
                           'purchasePrice',
                           'marketPrice',
                           'loanAmount',
                           'possDate',
                           'monthlyRent',
                           'status']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO properties (name, province, city, address, postal_code,
                                    parking, purchase_price, market_price,
                                    loan_amount, poss_date, monthly_rent,
                                    status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['name'],
            data['province'],
            data['city'],
            data['address'],
            data['postalCode'],
            data['parking'],
            data['purchasePrice'],
            data['marketPrice'],
            data['loanAmount'],
            data['possDate'],
            data['monthlyRent'],
            data['status']
        ))
        
        property_id = cursor.lastrowid
        conn.commit()
        
        # Fetch the newly created property
        cursor.execute('SELECT * FROM properties WHERE id = ?', (property_id,))
        new_property = row_to_dict(cursor.fetchone())
        new_property['total_expenses'] = 0
        new_property['total_income'] = 0
        conn.close()
        
        return jsonify(new_property), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties/<int:property_id>', methods=['PUT'])
def update_property(property_id):
    """Update an existing property"""
    try:
        data = request.get_json()
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if property exists
        cursor.execute('SELECT * FROM properties WHERE id = ?', (property_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Property not found'}), 404
        
        # Update property
        cursor.execute('''
            UPDATE properties 
            SET name = ?, province = ?, city = ?, address = ?,
                postal_code = ?, parking = ?, purchase_price = ?,
                market_price = ?, loan_amount = ?, poss_date = ?,
                monthly_rent = ?, status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            data['name'],
            data['province'],
            data['city'],
            data['address'],
            data['postalCode'],
            data['parking'],
            data['purchasePrice'],
            data['marketPrice'],
            data['loanAmount'],
            data['possDate'],
            data['monthlyRent'],
            data['status'],
            property_id
        ))
        
        conn.commit()
        
        # Fetch the updated property
        cursor.execute(select_from_properties() + ' WHERE id = ?',
                       (property_id,))
        updated_property = row_to_dict(cursor.fetchone())
        conn.close()
        
        return jsonify(updated_property), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties/<int:property_id>', methods=['DELETE'])
def delete_property(property_id):
    """Delete a property"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if property exists
        cursor.execute('SELECT * FROM properties WHERE id = ?', (property_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Property not found'}), 404
        
        # Delete property
        cursor.execute('DELETE FROM properties WHERE id = ?', (property_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Property deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    """Get portfolio statistics"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(select_from_properties())
        properties = [row_to_dict(row) for row in cursor.fetchall()]
        conn.close()
        
        # Calculate statistics
        total_revenue = sum(p['total_income'] for p in properties)
        total_expenses = sum(p['total_expenses'] for p in properties)
        net_profit = total_revenue - total_expenses
        total_value = sum(p['market_price'] for p in properties)
        
        stats = {
            'propertyCount': len(properties),
            'totalRevenue': total_revenue,
            'totalExpenses': total_expenses,
            'netProfit': net_profit,
            'totalValue': total_value,
            'avgROI': (net_profit * 12 / total_value * 100) if total_value > 0 else 0
        }
        
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/import', methods=['POST'])
def import_data():
    """Import properties from JSON"""
    try:
        data = request.get_json()
        
        if not isinstance(data, list):
            return jsonify({'error': 'Data must be an array of properties'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Clear existing data (optional - remove if you want to append)
        cursor.execute('DELETE FROM expenses')
        cursor.execute('DELETE FROM income')
        cursor.execute('DELETE FROM properties')
        conn.commit()

        # Helper to insert dynamically
        def insert_dynamic(table_name, row_data):
            # Get columns from the database table
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [col["name"] for col in cursor.fetchall()]

            # Keep only keys that exist in the table
            filtered_data = {k: row_data[k] for k in row_data if k in columns}

            # Build query dynamically
            col_names = ", ".join(filtered_data.keys())
            placeholders = ", ".join("?" for _ in filtered_data)
            values = tuple(filtered_data.values())

            cursor.execute(f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})", values)

            # Insert properties and nested records

        imported_count = 0
        for prop in data:
            # Extract nested lists if present
            expenses = prop.pop("expenses", [])
            income = prop.pop("income", [])

            # Insert property
            insert_dynamic("properties", prop)
            property_id = prop.get("id")  # preserve original ID

            # Insert expenses
            for e in expenses:
                insert_dynamic("expenses", e)

            # Insert income
            for i in income:
                insert_dynamic("income", i)

            imported_count += 1

        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Import successful',
            'imported': imported_count
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export', methods=['GET'])
def export_data():
    """Export all properties as JSON"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM properties")
        properties = cursor.fetchall()

        result = []

        for p in properties:
            prop_dict = dict(p)  # automatically maps column names to values

            # Fetch expenses for this property
            cursor.execute("SELECT * FROM expenses WHERE property_id = ?", (p["id"],))
            expenses = [dict(row) for row in cursor.fetchall()]

            # Fetch income for this property
            cursor.execute("SELECT * FROM income WHERE property_id = ?", (p["id"],))
            income = [dict(row) for row in cursor.fetchall()]

            # Add nested lists
            prop_dict["expenses"] = expenses
            prop_dict["income"] = income

            result.append(prop_dict)

        conn.close()
        
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    }), 200

@app.route('/', methods=['GET'])
def index():
    """API documentation"""
    return jsonify({
        'name': 'Real Estate Analytics API',
        'version': '1.0.0',
        'endpoints': {
            'GET /api/properties': 'Get all properties',
            'GET /api/properties/<id>': 'Get single property',
            'POST /api/properties': 'Create new property',
            'PUT /api/properties/<id>': 'Update property',
            'DELETE /api/properties/<id>': 'Delete property',
            'GET /api/statistics': 'Get portfolio statistics',
            'POST /api/import': 'Import properties from JSON',
            'GET /api/export': 'Export all properties',
            'GET /api/health': 'Health check'
        }
    }), 200

if __name__ == '__main__':
    # Run the Flask app
    # Use debug=True for development, debug=False for production
    app.run(host='0.0.0.0', port=5000, debug=True)

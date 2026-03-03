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
            address TEXT NOT NULL,
            purchase_price REAL NOT NULL,
            monthly_rent REAL NOT NULL,
            expenses TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    d['expenses'] = json.loads(d['expenses'])
    return d

# API Routes

@app.route('/api/properties', methods=['GET'])
def get_properties():
    """Get all properties"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM properties ORDER BY created_at DESC')
        properties = [row_to_dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(properties), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/properties/<int:property_id>', methods=['GET'])
def get_property(property_id):
    """Get a single property by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM properties WHERE id = ?', (property_id,))
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
        required_fields = ['name', 'address', 'purchasePrice', 'monthlyRent', 'expenses']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO properties (name, address, purchase_price, monthly_rent, expenses)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            data['name'],
            data['address'],
            data['purchasePrice'],
            data['monthlyRent'],
            json.dumps(data['expenses'])
        ))
        
        property_id = cursor.lastrowid
        conn.commit()
        
        # Fetch the newly created property
        cursor.execute('SELECT * FROM properties WHERE id = ?', (property_id,))
        new_property = row_to_dict(cursor.fetchone())
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
            SET name = ?, address = ?, purchase_price = ?, monthly_rent = ?, 
                expenses = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            data['name'],
            data['address'],
            data['purchasePrice'],
            data['monthlyRent'],
            json.dumps(data['expenses']),
            property_id
        ))
        
        conn.commit()
        
        # Fetch the updated property
        cursor.execute('SELECT * FROM properties WHERE id = ?', (property_id,))
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
        cursor.execute('SELECT * FROM properties')
        properties = [row_to_dict(row) for row in cursor.fetchall()]
        conn.close()
        
        # Calculate statistics
        total_revenue = sum(p['monthly_rent'] for p in properties)
        total_expenses = sum(
            sum(e['amount'] for e in p['expenses']) 
            for p in properties
        )
        net_profit = total_revenue - total_expenses
        total_value = sum(p['purchase_price'] for p in properties)
        
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
        cursor.execute('DELETE FROM properties')
        
        # Insert new data
        imported_count = 0
        for property_data in data:
            cursor.execute('''
                INSERT INTO properties (name, address, purchase_price, monthly_rent, expenses)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                property_data.get('name', ''),
                property_data.get('address', ''),
                property_data.get('purchasePrice', 0),
                property_data.get('monthlyRent', 0),
                json.dumps(property_data.get('expenses', []))
            ))
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
        cursor.execute('SELECT * FROM properties')
        properties = [row_to_dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return jsonify(properties), 200
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

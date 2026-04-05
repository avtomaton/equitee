from flask import request, jsonify
from utils.database import db_cursor, require_exists, row_to_dict, NotFoundError
from utils.errors import handle_errors
from models.property import check_property_params, property_params, select_from_properties


def register_routes(app):
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
        check_property_params(data)

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
        check_property_params(data)
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

    @app.route('/api/properties/<int:property_id>/loan', methods=['POST'])
    @handle_errors
    def update_property_loan(property_id):
        """Update loan_amount after a mortgage/principal payment and record the change as an event."""
        data = request.get_json()
        new_amount = float(data.get('loanAmount', 0))
        description = data.get('description', 'Loan balance updated after payment')
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'properties', property_id, 'Property')
            cursor.execute('SELECT loan_amount FROM properties WHERE id = ?', (property_id,))
            row = cursor.fetchone()
            old_amount = float(row['loan_amount'] or 0)
            cursor.execute(
                'INSERT INTO events (property_id, column_name, old_value, new_value, description) VALUES (?, ?, ?, ?, ?)',
                (property_id, 'loan_amount', str(old_amount), str(new_amount), description)
            )
            cursor.execute(
                'UPDATE properties SET loan_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                (new_amount, property_id)
            )
            cursor.execute(select_from_properties() + ' WHERE p.id = ?', (property_id,))
            return jsonify(row_to_dict(cursor.fetchone())), 200

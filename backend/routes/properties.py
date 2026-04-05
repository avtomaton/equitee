from flask import request, jsonify
from utils.db import db_session_scope, require_exists, NotFoundError
from utils.errors import handle_errors
from models.schema import Property, Event
from models.property import check_property_params, property_params


def register_routes(app):
    @app.route('/api/properties', methods=['GET'])
    @handle_errors
    def get_properties():
        with db_session_scope() as session:
            # Query with aggregated totals for backward compatibility
            from sqlalchemy import func
            query = session.query(Property)
            if request.args.get('archived') != '1':
                query = query.filter(Property.is_archived == False)
            properties = query.order_by(Property.created_at.desc()).all()
            return jsonify([p.to_dict() for p in properties]), 200

    @app.route('/api/properties/<int:property_id>', methods=['GET'])
    @handle_errors
    def get_property(property_id):
        with db_session_scope() as session:
            property = require_exists(session, Property, property_id, 'Property')
            return jsonify(property.to_dict()), 200

    @app.route('/api/properties', methods=['POST'])
    @handle_errors
    def create_property():
        data = request.get_json()
        check_property_params(data)

        with db_session_scope() as session:
            property = Property(
                name=data['name'],
                province=data['province'],
                city=data['city'],
                address=data['address'],
                postal_code=data['postalCode'],
                parking=data.get('parking', ''),
                purchase_price=data['purchasePrice'],
                market_price=data['marketPrice'],
                loan_amount=data['loanAmount'],
                mortgage_rate=data.get('mortgageRate', 0),
                poss_date=data['possDate'],
                monthly_rent=data['monthlyRent'],
                status=data['status'],
                type=data.get('type', 'Condo'),
                notes=data.get('notes', ''),
                expected_condo_fees=data.get('expectedCondoFees', 0),
                expected_insurance=data.get('expectedInsurance', 0),
                expected_utilities=data.get('expectedUtilities', 0),
                expected_misc_expenses=data.get('expectedMiscExpenses', 0),
                expected_appreciation_pct=data.get('expectedAppreciationPct', 0),
                annual_property_tax=data.get('annualPropertyTax', 0),
                mortgage_payment=data.get('mortgagePayment', 0),
                mortgage_frequency=data.get('mortgageFrequency', 'monthly')
            )
            session.add(property)
            session.flush()
            return jsonify(property.to_dict()), 201

    @app.route('/api/properties/<int:property_id>', methods=['PUT'])
    @handle_errors
    def update_property(property_id):
        data = request.get_json()
        check_property_params(data)

        with db_session_scope() as session:
            property = require_exists(session, Property, property_id, 'Property')

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

            # Track changes and create events
            for column, new_value in field_mapping.items():
                old_value = getattr(property, column)

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
                    setattr(property, column, new_value)

            return jsonify(property.to_dict()), 200

    @app.route('/api/properties/<int:property_id>', methods=['DELETE'])
    @handle_errors
    def archive_property(property_id):
        """Soft-delete (archive) a property."""
        with db_session_scope() as session:
            property = require_exists(session, Property, property_id, 'Property')
            property.is_archived = True
            return jsonify({'message': 'Property archived'}), 200

    @app.route('/api/properties/<int:property_id>/restore', methods=['POST'])
    @handle_errors
    def restore_property(property_id):
        with db_session_scope() as session:
            property = require_exists(session, Property, property_id, 'Property')
            property.is_archived = False
            return jsonify({'message': 'Property restored'}), 200

    @app.route('/api/properties/<int:property_id>/loan', methods=['POST'])
    @handle_errors
    def update_property_loan(property_id):
        """Update loan_amount after a mortgage/principal payment and record the change as an event."""
        data = request.get_json()
        new_amount = float(data.get('loanAmount', 0))
        description = data.get('description', 'Loan balance updated after payment')

        with db_session_scope() as session:
            property = require_exists(session, Property, property_id, 'Property')
            old_amount = float(property.loan_amount or 0)

            event = Event(
                property_id=property_id,
                column_name='loan_amount',
                old_value=str(old_amount),
                new_value=str(new_amount),
                description=description
            )
            session.add(event)

            property.loan_amount = new_amount
            return jsonify(property.to_dict()), 200

from validation import (
    validate_currency, validate_percentage,
    validate_required, validate_enum, validate_string_length,
    sanitize_html
)


def check_property_params(data):
    # Validate required fields
    validate_required(data, [
        'name', 'province', 'city', 'address', 'postalCode',
        'purchasePrice', 'marketPrice', 'loanAmount', 'possDate',
        'monthlyRent', 'status'
    ])

    # Validate numeric fields
    validate_currency(data['purchasePrice'], 'purchasePrice')
    validate_currency(data['marketPrice'], 'marketPrice')
    validate_currency(data['loanAmount'], 'loanAmount')
    validate_percentage(data.get('mortgageRate', 0), 'mortgageRate')
    validate_currency(data['monthlyRent'], 'monthlyRent')

    # Validate enum fields
    validate_enum(
        data['status'], 'status',
        ['Rented', 'Vacant', 'Primary']
    )

    # Validate string length and sanitize
    data['name'] = sanitize_html(validate_string_length(data['name'], 'name', 200))
    data['address'] = sanitize_html(validate_string_length(data['address'], 'address', 500))
    if data.get('notes'):
        data['notes'] = sanitize_html(validate_string_length(data['notes'], 'notes', 2000))


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




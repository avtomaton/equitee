from validation import (
    validate_currency, validate_percentage,
    validate_required, validate_enum, validate_string_length,
    sanitize_html
)


def check_property_params(data):
    """Validate property fields and normalise values in-place."""
    validate_required(data, [
        'name', 'province', 'city', 'address', 'postalCode',
        'purchasePrice', 'marketPrice', 'loanAmount', 'possDate',
        'monthlyRent', 'status'
    ])

    validate_currency(data['purchasePrice'], 'purchasePrice')
    validate_currency(data['marketPrice'], 'marketPrice')
    validate_currency(data['loanAmount'], 'loanAmount')
    validate_percentage(data.get('mortgageRate', 0), 'mortgageRate')
    validate_currency(data['monthlyRent'], 'monthlyRent')

    validate_enum(
        data['status'], 'status',
        ['Rented', 'Vacant', 'Primary']
    )

    data['name'] = sanitize_html(validate_string_length(data['name'], 'name', 200))
    data['address'] = sanitize_html(validate_string_length(data['address'], 'address', 500))
    if data.get('notes'):
        data['notes'] = sanitize_html(validate_string_length(data['notes'], 'notes', 2000))

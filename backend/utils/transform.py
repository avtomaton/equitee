"""
CamelCase <-> snake_case field mapping and transformation utilities.

Centralises the API<->DB naming convention so routes don't repeat
25-line mapping dicts.  Adding a new column only requires updating
PROPERTY_FIELD_MAP in one place.
"""

import re


def snake_to_camel(name):
    """Convert snake_case to camelCase:  purchase_price -> purchasePrice"""
    parts = name.split('_')
    return parts[0] + ''.join(word.capitalize() for word in parts[1:])


def camel_to_snake(name):
    """Convert camelCase to snake_case:  purchasePrice -> purchase_price"""
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


# ── Property field map ────────────────────────────────────────────────────────

PROPERTY_FIELD_MAP = {
    'name':                      'name',
    'province':                  'province',
    'city':                      'city',
    'address':                   'address',
    'postalCode':                'postal_code',
    'parking':                   'parking',
    'purchasePrice':             'purchase_price',
    'marketPrice':               'market_price',
    'loanAmount':                'loan_amount',
    'mortgageRate':              'mortgage_rate',
    'possDate':                  'poss_date',
    'monthlyRent':               'monthly_rent',
    'status':                    'status',
    'type':                      'type',
    'notes':                     'notes',
    'expectedCondoFees':         'expected_condo_fees',
    'expectedInsurance':         'expected_insurance',
    'expectedUtilities':         'expected_utilities',
    'expectedMiscExpenses':      'expected_misc_expenses',
    'expectedAppreciationPct':   'expected_appreciation_pct',
    'annualPropertyTax':         'annual_property_tax',
    'mortgagePayment':           'mortgage_payment',
    'mortgageFrequency':         'mortgage_frequency',
}


def transform_property_create(data):
    """Convert camelCase API payload to snake_case model kwargs for Property creation."""
    result = {}
    for camel, snake in PROPERTY_FIELD_MAP.items():
        if camel in data:
            result[snake] = data[camel]
    # Defaults for optional fields
    result.setdefault('type', 'Condo')
    result.setdefault('parking', '')
    result.setdefault('notes', '')
    result.setdefault('mortgage_rate', 0)
    result.setdefault('mortgage_payment', 0)
    result.setdefault('mortgage_frequency', 'monthly')
    result.setdefault('expected_condo_fees', 0)
    result.setdefault('expected_insurance', 0)
    result.setdefault('expected_utilities', 0)
    result.setdefault('expected_misc_expenses', 0)
    result.setdefault('expected_appreciation_pct', 0)
    result.setdefault('annual_property_tax', 0)
    return result


def transform_property_update(data):
    """Return a dict of {snake_case_col: value} for only the fields present in data."""
    changes = {}
    for camel, snake in PROPERTY_FIELD_MAP.items():
        if camel in data:
            changes[snake] = data[camel]
    return changes

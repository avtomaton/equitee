"""
Validation helpers for real estate application.
Ensures data integrity and prevents injection attacks.
"""
import re
import datetime

class ValidationError(Exception):
    pass

def validate_number_range(value, field_name, min_val=None, max_val=None):
    """Validate numeric field is within acceptable range."""
    try:
        if value is None:
            return 0
        num = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be numeric")

    if min_val is not None and num < min_val:
        raise ValueError(f"{field_name} cannot be less than {min_val}")
    if max_val is not None and num > max_val:
        raise ValueError(f"{field_name} cannot exceed {max_val}")

    return num

def validate_currency(value, field_name):
    """Validate currency field (0 to 999,999,999)."""
    return validate_number_range(value, field_name, 0, 999999999)

def validate_percentage(value, field_name):
    """Validate percentage field (0-100)."""
    return validate_number_range(value, field_name, 0, 100)

def validate_enum(value, field_name, allowed_values):
    """Validate value is in allowed list"""
    if value not in allowed_values:
        raise ValidationError(f"{field_name} must be one of: {', '.join(allowed_values)}")
    return value

def validate_date(date_str, field_name):
    """Validate date format (YYYY-MM-DD)"""
    try:
        return datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError(f"{field_name} must be YYYY-MM-DD format")

def validate_required(data, fields):
    """Check all required fields are present"""
    missing = [f for f in fields if f not in data or data[f] is None or data[f] == ""]
    if missing:
        raise ValidationError(f"Missing required fields: {', '.join(missing)}")

def validate_string_length(value, field_name, max_length=500):
    """Validate string length"""
    if len(str(value)) > max_length:
        raise ValidationError(f"{field_name} exceeds {max_length} characters")
    return str(value)

def validate_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if email and not re.match(pattern, email):
        raise ValidationError("Invalid email format")
    return email

def validate_phone(phone):
    """Validate phone format"""
    if phone and not re.match(r'^[\d\s\-\+\(\)]{10,}$', phone):
        raise ValidationError("Invalid phone format")
    return phone

def sanitize_html(value):
    """Basic HTML sanitization to prevent XSS attacks."""
    if not value:
        return value
    value = str(value)
    return value.replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;').replace("'", '&#x27;')


def validate_table_name(table_name):
    """Whitelist allowed table names to prevent SQL injection."""
    allowed_tables = {'properties', 'expenses', 'income', 'events', 'tenants'}
    if table_name not in allowed_tables:
        raise ValueError(f"Invalid table: {table_name}")
    return table_name


ALLOWED_COLUMNS = {
    'properties': {
        'id', 'name', 'type', 'province', 'city', 'address', 'postal_code',
        'parking', 'purchase_price', 'market_price', 'loan_amount',
        'monthly_rent', 'poss_date', 'status', 'expected_condo_fees',
        'expected_insurance', 'expected_utilities', 'expected_misc_expenses',
        'expected_appreciation_pct', 'annual_property_tax', 'mortgage_rate',
        'mortgage_payment', 'mortgage_frequency', 'notes', 'created_at',
        'updated_at', 'is_archived',
    },
    'expenses': {
        'id', 'property_id', 'expense_date', 'amount', 'expense_type',
        'expense_category', 'notes', 'tax_deductible', 'created_at', 'updated_at',
    },
    'income': {
        'id', 'property_id', 'income_date', 'amount', 'income_type',
        'notes', 'created_at', 'updated_at',
    },
    'events': {
        'id', 'property_id', 'column_name', 'old_value', 'new_value',
        'description', 'created_at',
    },
    'tenants': {
        'id', 'property_id', 'name', 'phone', 'email', 'notes',
        'lease_start', 'lease_end', 'deposit', 'rent_amount',
        'is_archived', 'created_at', 'updated_at',
    },
}


def validate_column_name(table_name, column_name):
    """Whitelist allowed column names to prevent SQL injection via crafted JSON keys."""
    if table_name not in ALLOWED_COLUMNS:
        raise ValueError(f"Invalid table for column validation: {table_name}")
    if column_name not in ALLOWED_COLUMNS[table_name]:
        raise ValueError(f"Invalid column '{column_name}' for table '{table_name}'")
    return column_name

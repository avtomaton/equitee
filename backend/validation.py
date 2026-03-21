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
        num = float(value) if value is not None else 0
        if min_val is not None and num < min_val:
            raise ValueError(f"{field_name} cannot be less than {min_val}")
        if max_val is not None and num > max_val:
            raise ValueError(f"{field_name} cannot exceed {max_val}")
        return num
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be numeric")

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

def validate_table_name(table_name):
    """Whitelist allowed table names to prevent SQL injection."""
    allowed_tables = {'properties', 'expenses', 'income', 'events', 'tenants'}
    if table_name not in allowed_tables:
        raise ValueError(f"Invalid table: {table_name}")
    return table_name

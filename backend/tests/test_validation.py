"""Tests for validation helpers."""
import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from validation import (
    validate_number_range, validate_currency, validate_percentage,
    validate_enum, validate_date, validate_required, validate_string_length,
    validate_email, validate_phone, sanitize_html, validate_table_name,
    validate_column_name, ValidationError
)


class TestValidateNumberRange:
    def test_valid_number(self):
        assert validate_number_range(100, 'test') == 100.0

    def test_none_value(self):
        assert validate_number_range(None, 'test') == 0

    def test_below_min(self):
        with pytest.raises(ValueError, match="cannot be less than"):
            validate_number_range(-1, 'test', min_val=0)

    def test_above_max(self):
        with pytest.raises(ValueError, match="cannot exceed"):
            validate_number_range(101, 'test', max_val=100)

    def test_non_numeric(self):
        with pytest.raises(ValueError, match="must be numeric"):
            validate_number_range("abc", 'test')


class TestValidateCurrency:
    def test_valid_currency(self):
        assert validate_currency(1000, 'price') == 1000.0

    def test_zero_currency(self):
        assert validate_currency(0, 'price') == 0.0

    def test_max_currency(self):
        assert validate_currency(999999999, 'price') == 999999999.0

    def test_negative_currency(self):
        with pytest.raises(ValueError):
            validate_currency(-1, 'price')

    def test_exceeds_max_currency(self):
        with pytest.raises(ValueError):
            validate_currency(1000000000, 'price')


class TestValidatePercentage:
    def test_valid_percentage(self):
        assert validate_percentage(50, 'rate') == 50.0

    def test_zero_percentage(self):
        assert validate_percentage(0, 'rate') == 0.0

    def test_max_percentage(self):
        assert validate_percentage(100, 'rate') == 100.0

    def test_negative_percentage(self):
        with pytest.raises(ValueError):
            validate_percentage(-1, 'rate')

    def test_exceeds_max_percentage(self):
        with pytest.raises(ValueError):
            validate_percentage(101, 'rate')


class TestValidateEnum:
    def test_valid_enum(self):
        assert validate_enum('Rented', 'status', ['Rented', 'Vacant']) == 'Rented'

    def test_invalid_enum(self):
        with pytest.raises(ValidationError, match="must be one of"):
            validate_enum('Sold', 'status', ['Rented', 'Vacant'])


class TestValidateDate:
    def test_valid_date(self):
        result = validate_date('2024-01-15', 'date')
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15

    def test_invalid_date_format(self):
        with pytest.raises(ValidationError, match="must be YYYY-MM-DD"):
            validate_date('01/15/2024', 'date')

    def test_invalid_date_value(self):
        with pytest.raises(ValidationError):
            validate_date('2024-13-45', 'date')


class TestValidateRequired:
    def test_all_present(self):
        validate_required({'a': 1, 'b': 2}, ['a', 'b'])

    def test_missing_field(self):
        with pytest.raises(ValidationError, match="Missing required"):
            validate_required({'a': 1}, ['a', 'b'])

    def test_none_value(self):
        with pytest.raises(ValidationError):
            validate_required({'a': None}, ['a'])

    def test_empty_string(self):
        with pytest.raises(ValidationError):
            validate_required({'a': ''}, ['a'])


class TestValidateStringLength:
    def test_within_limit(self):
        assert validate_string_length('hello', 'name', 100) == 'hello'

    def test_exceeds_limit(self):
        with pytest.raises(ValidationError, match="exceeds"):
            validate_string_length('a' * 101, 'name', 100)


class TestValidateEmail:
    def test_valid_email(self):
        assert validate_email('test@example.com') == 'test@example.com'

    def test_invalid_email(self):
        with pytest.raises(ValidationError, match="Invalid email"):
            validate_email('not-an-email')

    def test_empty_email(self):
        assert validate_email(None) is None


class TestValidatePhone:
    def test_valid_phone(self):
        assert validate_phone('+1-555-123-4567') == '+1-555-123-4567'

    def test_invalid_phone(self):
        with pytest.raises(ValidationError, match="Invalid phone"):
            validate_phone('abc')

    def test_empty_phone(self):
        assert validate_phone(None) is None


class TestSanitizeHtml:
    def test_no_html(self):
        assert sanitize_html('hello') == 'hello'

    def test_script_tag(self):
        result = sanitize_html('<script>alert(1)</script>')
        assert '<' not in result
        assert '&lt;' in result

    def test_quotes(self):
        result = sanitize_html('"hello"')
        assert '&quot;' in result


class TestValidateTableName:
    def test_valid_table(self):
        assert validate_table_name('properties') == 'properties'

    def test_invalid_table(self):
        with pytest.raises(ValueError, match="Invalid table"):
            validate_table_name('users; DROP TABLE properties')


class TestValidateColumnName:
    def test_valid_column(self):
        assert validate_column_name('properties', 'name') == 'name'

    def test_invalid_column(self):
        with pytest.raises(ValueError, match="Invalid column"):
            validate_column_name('properties', 'id; DROP TABLE')

    def test_invalid_table(self):
        with pytest.raises(ValueError, match="Invalid table"):
            validate_column_name('users', 'name')

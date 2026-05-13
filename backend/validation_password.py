"""
Shared password validation rules — single source of truth.

Used by both routes/auth.py (for request-level validation)
and services/auth_service.py (for service-level validation).
"""

import re

# ── Password strength requirements ────────────────────────────────────────────

PASSWORD_MIN_LENGTH = 12
PASSWORD_RE_UPPERCASE = re.compile(r'[A-Z]')
PASSWORD_RE_DIGIT = re.compile(r'[0-9]')
PASSWORD_RE_SPECIAL = re.compile(r'[!@#$%^&*()\-_=+\[\]{}|;:\'",.<>?/\\`~]')


def validate_password_strength(password):
    """
    Validate password against strength requirements.
    
    Raises ValueError with a user-friendly message on failure.
    """
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
    if not PASSWORD_RE_UPPERCASE.search(password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not PASSWORD_RE_DIGIT.search(password):
        raise ValueError("Password must contain at least one number")
    if not PASSWORD_RE_SPECIAL.search(password):
        raise ValueError("Password must contain at least one special character")

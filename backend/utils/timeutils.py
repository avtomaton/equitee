"""
Shared time utilities — single source of truth for timezone-aware UTC datetime.
"""

import datetime


def utcnow():
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.datetime.now(datetime.timezone.utc)

\"
Security utilities — CSRF protection and httpOnly cookie helpers.

Only used in SaaS mode. In single mode, these are not needed.
"""

import hashlib
import hmac
import logging
import secrets

from flask import request, jsonify, g

from config import Config

logger = logging.getLogger(__name__)

# Cookie names
ACCESS_TOKEN_COOKIE = "equitee_access_token"
REFRESH_TOKEN_COOKIE = "equitee_refresh_token"
CSRF_TOKEN_COOKIE = "equitee_csrf_token"
CSRF_HEADER = "X-CSRF-Token"


def generate_csrf_token():
    """Generate a random CSRF token."""
    return secrets.token_hex(32)


def set_auth_cookies(response, access_token, refresh_token):
    """
    Set httpOnly cookies for access and refresh tokens.
    
    - access_token: short-lived, httpOnly, same-site strict
    - refresh_token: long-lived, httpOnly, same-site strict, path=/api/auth
    """
    secure = Config.APP_BASE_URL.startswith("https")
    
    response.set_cookie(
        ACCESS_TOKEN_COOKIE,
        access_token,
        httponly=True,
        secure=secure,
        samesite="Strict",
        max_age=Config.JWT_EXPIRATION_HOURS * 3600,
        path="/",
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE,
        refresh_token,
        httponly=True,
        secure=secure,
        samesite="Strict",
        max_age=Config.JWT_REFRESH_EXPIRATION_DAYS * 86400,
        path="/api/auth",
    )


def clear_auth_cookies(response):
    """Clear all auth cookies (used on logout)."""
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path="/api/auth")
    response.delete_cookie(CSRF_TOKEN_COOKIE, path="/")


def get_access_token_from_cookie():
    """Extract access token from httpOnly cookie."""
    return request.cookies.get(ACCESS_TOKEN_COOKIE)


def get_refresh_token_from_cookie():
    """Extract refresh token from httpOnly cookie."""
    return request.cookies.get(REFRESH_TOKEN_COOKIE)


def set_csrf_cookie(response):
    """
    Set a CSRF token cookie (readable by JS) that the frontend reads
    and sends back in the X-CSRF-Token header.
    
    This is the double-submit cookie pattern:
    - Server sets a cookie with the CSRF token (not httpOnly)
    - Client reads it and sends it back in a header
    - Server compares the header value with the cookie value
    """
    token = generate_csrf_token()
    secure = Config.APP_BASE_URL.startswith("https")
    response.set_cookie(
        CSRF_TOKEN_COOKIE,
        token,
        httponly=False,  # Must be readable by JS
        secure=secure,
        samesite="Strict",
        path="/",
    )
    # Also store in g for the response
    g.csrf_token = token


def validate_csrf():
    """
    Validate the CSRF token for state-changing requests.
    
    Uses the double-submit cookie pattern:
    Compares the X-CSRF-Token header with the CSRF token cookie.
    
    Returns (True, None) on success, (False, error_response) on failure.
    """
    # Only validate for state-changing methods
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return True, None
    
    cookie_token = request.cookies.get(CSRF_TOKEN_COOKIE)
    header_token = request.headers.get(CSRF_HEADER)
    
    if not cookie_token or not header_token:
        return False, jsonify({"error": "CSRF token missing"}), 403
    
    if not hmac.compare_digest(cookie_token, header_token):
        return False, jsonify({"error": "CSRF token mismatch"}), 403
    
    return True, None

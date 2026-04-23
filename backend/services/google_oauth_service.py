"""
Google OAuth2 service — handles the OAuth2 flow for Google Sign-In.

Uses authlib for the OAuth2 client. When Google credentials are not configured,
all methods return None / raise errors gracefully.
"""

import logging

from config import Config

try:
    import requests
except ImportError:
    requests = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


class GoogleOAuthService:
    """Service for Google OAuth2 authentication flow."""

    # Google OAuth2 endpoints
    AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
    TOKEN_URL = 'https://oauth2.googleapis.com/token'
    USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

    @staticmethod
    def is_configured():
        """Check if Google OAuth is configured."""
        return bool(Config.GOOGLE_CLIENT_ID and Config.GOOGLE_CLIENT_SECRET)

    @staticmethod
    def get_authorization_url(state):
        """
        Build the Google OAuth2 authorization URL.

        Args:
            state: Anti-CSRF state token (random string).

        Returns:
            str: The full authorization URL to redirect the user to.
        """
        if not GoogleOAuthService.is_configured():
            raise RuntimeError("Google OAuth is not configured")

        params = {
            'client_id': Config.GOOGLE_CLIENT_ID,
            'redirect_uri': Config.GOOGLE_REDIRECT_URI,
            'response_type': 'code',
            'scope': 'openid email profile',
            'state': state,
            'access_type': 'offline',
            'prompt': 'consent',
        }
        query = '&'.join(f'{k}={v}' for k, v in params.items())
        return f'{GoogleOAuthService.AUTH_URL}?{query}'

    @staticmethod
    def handle_callback(code):
        """
        Exchange an authorization code for user info.

        Args:
            code: The authorization code from the OAuth callback.

        Returns:
            dict with 'email', 'name', 'google_id' keys, or None on failure.
        """
        if not GoogleOAuthService.is_configured():
            return None

        # Exchange code for tokens
        token_data = {
            'client_id': Config.GOOGLE_CLIENT_ID,
            'client_secret': Config.GOOGLE_CLIENT_SECRET,
            'code': code,
            'redirect_uri': Config.GOOGLE_REDIRECT_URI,
            'grant_type': 'authorization_code',
        }

        try:
            if requests is None:
                raise ImportError("requests library not installed")

            token_resp = requests.post(
                GoogleOAuthService.TOKEN_URL,
                data=token_data,
                timeout=10,
            )
            token_resp.raise_for_status()
            tokens = token_resp.json()
        except Exception:
            logger.exception("Failed to exchange Google OAuth code for tokens")
            return None

        # Get user info from the ID token or userinfo endpoint
        access_token = tokens.get('access_token')
        if not access_token:
            logger.error("No access_token in Google OAuth response")
            return None

        try:
            userinfo_resp = requests.get(
                GoogleOAuthService.USERINFO_URL,
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=10,
            )
            userinfo_resp.raise_for_status()
            userinfo = userinfo_resp.json()
        except Exception:
            logger.exception("Failed to fetch Google user info")
            return None

        email = userinfo.get('email')
        if not email:
            logger.error("No email in Google user info")
            return None

        return {
            'email': email.lower().strip(),
            'name': userinfo.get('name', ''),
            'google_id': userinfo.get('sub', ''),
            'email_verified': userinfo.get('email_verified', False),
        }

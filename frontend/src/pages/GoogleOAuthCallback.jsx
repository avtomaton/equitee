/**
 * GoogleOAuthCallback page — handles the OAuth redirect from Google.
 *
 * This page is opened in a popup window during Google Sign-In.
 * It extracts the authorization code and state from the URL query params
 * and sends them back to the opener window via postMessage.
 */

import { useEffect } from 'react';

export default function GoogleOAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    // Send the data back to the opener window
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'google-oauth-callback',
          code: code || '',
          state: state || '',
          error: error || '',
        },
        '*' // In production, restrict to your origin
      );
    }

    // Close this popup window
    window.close();
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontFamily: 'Arial, sans-serif',
    }}>
      <p>Completing Google Sign-In…</p>
    </div>
  );
}

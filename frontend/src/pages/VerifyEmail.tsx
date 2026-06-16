/**
 * VerifyEmail page — handles email verification token from the verification link.
 *
 * Reads the token from the URL hash query params and calls the verify endpoint.
 * Shows success or error state accordingly.
 */

import { useState, useEffect } from 'react';
import { auth } from '../api';

export default function VerifyEmailPage({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token found in the link.');
      return;
    }

    auth.verifyEmail(token)
      .then((data) => {
        setStatus('success');
        setEmail(data.user?.email || '');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err.message || 'Email verification failed.');
      });
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>Equitee</h1>
          <p>Real Estate Portfolio Analytics</p>
        </div>

        {status === 'verifying' && (
          <div className="auth-form">
            <h2>Verifying your email…</h2>
            <p>Please wait while we verify your email address.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="auth-success">
            <div className="auth-success-icon">✅</div>
            <h2>Email Verified!</h2>
            {email && <p>Your email <strong>{email}</strong> has been verified.</p>}
            <p>You can now sign in to your account.</p>
            <button
              className="auth-submit"
              onClick={() => onNavigate('login')}
            >
              Sign In
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="auth-form">
            <div className="auth-error" style={{ display: 'block' }}>
              {errorMessage}
            </div>
            <h2>Verification Failed</h2>
            <p>
              The verification link may have expired or is invalid.
              Please request a new verification email from the login page.
            </p>
            <button
              className="auth-submit"
              onClick={() => onNavigate('login')}
            >
              Go to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

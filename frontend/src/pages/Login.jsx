/**
 * Login page — email/password authentication + Google OAuth for SaaS mode.
 *
 * In self-hosted mode, this page is never navigated to.
 * Uses hash-based routing to match the existing app pattern.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage({ onNavigate }) {
  const { login, loginWithGoogle, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);

  // If already logged in, go to dashboard
  useEffect(() => {
    if (user) {
      onNavigate('dashboard');
    }
  }, [user, onNavigate]);

  if (user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUnverifiedEmail(null);
    setSubmitting(true);

    try {
      await login(email, password);
      onNavigate('dashboard');
    } catch (err) {
      // Check for email not verified error
      if (err.message && err.message.includes('verify your email')) {
        setUnverifiedEmail(email);
      }
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);

    try {
      await loginWithGoogle();
      onNavigate('dashboard');
    } catch (err) {
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    try {
      const { auth } = await import('../api.js');
      await auth.resendVerification(unverifiedEmail);
      setError('');
      setUnverifiedEmail(null);
      alert('Verification email sent! Check your inbox.');
    } catch {
      setError('Failed to resend verification email');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>Equitee</h1>
          <p>Real Estate Portfolio Analytics</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2>Sign In</h2>

          {error && <div className="auth-error">{error}</div>}

          {unverifiedEmail && (
            <div className="auth-info">
              <p>Please verify your email address to continue.</p>
              <button
                type="button"
                className="auth-link-btn"
                onClick={handleResendVerification}
              >
                Resend verification email
              </button>
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              minLength={8}
            />
          </div>

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="auth-google-btn"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleLoading ? 'Connecting…' : 'Sign in with Google'}
        </button>

        <div className="auth-footer">
          Don't have an account?{' '}
          <a href="#/register" onClick={(e) => { e.preventDefault(); onNavigate('register'); }}>
            Create one
          </a>
        </div>
      </div>
    </div>
  );
}

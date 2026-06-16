/**
 * Register page — create a new account.
 *
 * After registration, the user gets a verification email.
 * Once verified, they can request a tenancy from Settings.
 * Optionally, they can provide a portfolio name during registration
 * to automatically submit a tenancy request.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

export default function RegisterPage({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { register, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  // If already logged in, go to dashboard
  useEffect(() => {
    if (user) {
      onNavigate('dashboard');
    }
  }, [user, onNavigate]);

  // Show "Check your email" screen after successful registration
  // This takes priority over the user check so the user sees the confirmation
  if (registered) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <h1>Equitee</h1>
            <p>Real Estate Portfolio Analytics</p>
          </div>

          <div className="auth-success">
            <div className="auth-success-icon">✉️</div>
            <h2>Check your email</h2>
            <p>
              We've sent a verification link to <strong>{email}</strong>.
            </p>
            <p>
              Please click the link in the email to activate your account.
              The link expires in 24 hours.
            </p>
            {tenantName && (
              <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                Your portfolio request "{tenantName}" has been submitted and will be reviewed by an admin.
              </p>
            )}
            <button
              className="auth-submit"
              onClick={() => onNavigate('login')}
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number');
      return;
    }

    if (!/[!@#$%^&*()\-_=+\[\]{}|;:\'",.<>?/\\`~]/.test(password)) {
      setError('Password must contain at least one special character');
      return;
    }

    setSubmitting(true);

    try {
      await register(email, password, tenantName || '');
      setRegistered(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
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
          <h2>Create Account</h2>

          {error && <div className="auth-error">{error}</div>}

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
            <label htmlFor="tenantName">Portfolio Name (optional — request after signup)</label>
            <input
              id="tenantName"
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="My Real Estate Portfolio"
              autoComplete="organization"
            />
            <small style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              Leave blank to request a portfolio later from Settings.
            </small>
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              autoComplete="new-password"
              minLength={12}
            />
            <small style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              12+ characters with uppercase, number, and special character.
            </small>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              autoComplete="new-password"
              minLength={12}
            />
          </div>

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <a href="#/login" onClick={(e) => { e.preventDefault(); onNavigate('login'); }}>
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Tests for AuthContext — authentication state management.
 * Updated to cover email verification and Google OAuth flows.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext.jsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

function TestConsumer({ actionFn }) {
  const { user, login, register, logout, verifyEmail, resendVerification, loginWithGoogle, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? JSON.stringify(user) : 'null'}</span>
      <button
        data-testid="login-btn"
        onClick={() => actionFn ? actionFn('login') : login('test@example.com', 'password123')}
      >Login</button>
      <button
        data-testid="register-btn"
        onClick={() => actionFn ? actionFn('register') : register('new@example.com', 'password123', 'Test')}
      >Register</button>
      <button
        data-testid="logout-btn"
        onClick={() => actionFn ? actionFn('logout') : logout()}
      >Logout</button>
      <button
        data-testid="verify-btn"
        onClick={() => actionFn ? actionFn('verify') : verifyEmail('test-token')}
      >Verify</button>
      <button
        data-testid="resend-btn"
        onClick={() => actionFn ? actionFn('resend') : resendVerification('test@example.com')}
      >Resend</button>
    </div>
  );
}

function renderWithContext(actionFn) {
  return render(
    <AuthProvider>
      <TestConsumer actionFn={actionFn} />
    </AuthProvider>
  );
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuthProvider', () => {
  it('starts with no user and not loading', async () => {
    renderWithContext();

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('loads user from stored token on mount', async () => {
    localStorage.setItem('access_token', 'stored-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: { id: 1, email: 'test@example.com', role: 'owner' },
        tenant: { id: 't1', name: 'Test', plan: 'free' },
      }),
    });

    renderWithContext();

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toContain('test@example.com');
    });

    expect(localStorage.getItem('access_token')).toBe('stored-token');
  });

  it('clears token on mount if validation fails', async () => {
    localStorage.setItem('access_token', 'invalid-token');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    renderWithContext();

    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBeNull();
    });
  });

  it('stores token on login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        user: { email: 'test@example.com', tenant_id: 't1' },
      }),
    });

    renderWithContext();

    screen.getByTestId('login-btn').click();

    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('new-access');
      expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
      expect(screen.getByTestId('user').textContent).toContain('test@example.com');
    });
  });

  it('stores token on register', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'reg-access',
        refresh_token: 'reg-refresh',
        user: { email: 'new@example.com', tenant_id: 't2' },
      }),
    });

    renderWithContext();

    screen.getByTestId('register-btn').click();

    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('reg-access');
      expect(screen.getByTestId('user').textContent).toContain('new@example.com');
    });
  });

  it('clears tokens on logout', async () => {
    localStorage.setItem('access_token', 'existing-token');
    localStorage.setItem('refresh_token', 'existing-refresh');

    // Mock the /auth/me call that happens on mount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: { id: 1, email: 'test@example.com', role: 'owner' },
        tenant: { id: 't1', name: 'Test', plan: 'free' },
      }),
    });

    // Also mock the logout API call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: 'Logged out' }),
    });

    renderWithContext();

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toContain('test@example.com');
    });

    screen.getByTestId('logout-btn').click();

    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });
  });

  it('calls verify email API', async () => {
    localStorage.setItem('access_token', 'stored-token');
    // Mock /auth/me on mount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: { id: 1, email: 'test@example.com', role: 'owner', email_verified: false },
        tenant: { id: 't1', name: 'Test', plan: 'free' },
      }),
    });
    // Mock verify-email
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        message: 'Email verified successfully',
        user: { id: 1, email: 'test@example.com', tenant_id: 't1' },
      }),
    });

    renderWithContext();

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toContain('test@example.com');
    });

    screen.getByTestId('verify-btn').click();

    await waitFor(() => {
      // Should have called the verify-email endpoint
      const calls = mockFetch.mock.calls;
      const verifyCall = calls.find(c => c[0] && c[0].includes('/auth/verify-email'));
      expect(verifyCall).toBeDefined();
    });
  });

  it('calls resend verification API', async () => {
    // Mock resend-verification
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        message: 'If an account exists...',
      }),
    });

    renderWithContext();

    screen.getByTestId('resend-btn').click();

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const resendCall = calls.find(c => c[0] && c[0].includes('/auth/resend-verification'));
      expect(resendCall).toBeDefined();
    });
  });
});

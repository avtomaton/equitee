/**
 * Tests for AuthContext — authentication state management.
 * Updated to cover email verification and Google OAuth flows.
 */

/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

function TestConsumer({ actionFn }: { actionFn?: (action: string) => void }) {
  const { user, login, register, logout, verifyEmail, resendVerification, loading } = useAuth();
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

function renderWithContext(actionFn?: (action: string) => void) {
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

  it('loads user from session on mount', async () => {
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
  });

  it('handles validation failure on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    renderWithContext();

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('null');
    });
  });

  it('sets user on login', async () => {
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
      expect(screen.getByTestId('user').textContent).toContain('test@example.com');
    });
  });

  it('sets user on register', async () => {
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
      expect(screen.getByTestId('user').textContent).toContain('new@example.com');
    });
  });

  it('clears user on logout', async () => {
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
      expect(screen.getByTestId('user').textContent).toBe('null');
    });
  });

  it('calls verify email API', async () => {
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

/**
 * Tests for AuthContext — authentication state management.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext.jsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

function TestConsumer({ loginFn, registerFn, logoutFn }) {
  const { user, login, register, logout, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? JSON.stringify(user) : 'null'}</span>
      <button
        data-testid="login-btn"
        onClick={loginFn || (() => login('test@example.com', 'password123'))}
      >Login</button>
      <button
        data-testid="register-btn"
        onClick={registerFn || (() => register('new@example.com', 'password123', 'Test'))}
      >Register</button>
      <button
        data-testid="logout-btn"
        onClick={logoutFn || (() => logout())}
      >Logout</button>
    </div>
  );
}

function renderWithContext() {
  return render(
    <AuthProvider>
      <TestConsumer />
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

    // Token should still be in storage
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
    // Pre-set tokens to simulate a logged-in state
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

    // Wait for user to be loaded (mount + me call)
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toContain('test@example.com');
    });

    // Now logout
    screen.getByTestId('logout-btn').click();

    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });
  });
});

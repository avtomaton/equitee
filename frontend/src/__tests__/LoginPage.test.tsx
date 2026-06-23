/// <reference types="vitest/globals" />
/**
 * Tests for LoginPage component.
 * Updated to cover Google OAuth button and email verification error handling.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext.tsx';
import LoginPage from '../pages/Login.tsx';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.open for Google OAuth tests
const mockOpen = vi.fn();
const originalWindowOpen = window.open;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.open = mockOpen;
});

afterAll(() => {
  window.open = originalWindowOpen;
});

function renderLogin(overrides = {}) {
  const onNavigate = vi.fn();
  const utils = render(
    <AuthProvider>
      <LoginPage onNavigate={onNavigate} {...overrides} />
    </AuthProvider>
  );
  return { ...utils, onNavigate };
}

describe('LoginPage', () => {
  // Helper: get the form submit button (not the Google button)
  const getSubmitBtn = () => screen.getByRole('button', { name: /^sign in$/i });
  const getGoogleBtn = () => screen.getByRole('button', { name: /sign in with google/i });

  it('renders email and password fields', async () => {
    // Mock the initial /auth/me call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: null, tenant: null }),
    });

    renderLogin();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(getSubmitBtn()).toBeInTheDocument();
    });
  });

  it('renders Google Sign-In button', async () => {
    // Mock the initial /auth/me call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: null, tenant: null }),
    });

    renderLogin();

    await waitFor(() => {
      expect(getGoogleBtn()).toBeInTheDocument();
    });
  });

  it('navigates to register page when clicking create account link', async () => {
    // Mock the initial /auth/me call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: null, tenant: null }),
    });

    const { onNavigate } = renderLogin();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /create one/i })).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /create one/i });
    fireEvent.click(link);

    expect(onNavigate).toHaveBeenCalledWith('register');
  });

  it('shows error when login fails', async () => {
    // Mock the initial /auth/me call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: null, tenant: null }),
    });
    // Mock the failed login (401)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: 'Invalid email or password' })),
    });
    // Mock the token refresh attempt (also fails)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    const { onNavigate } = renderLogin();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(getSubmitBtn());

    await waitFor(() => {
      // When login fails with 401 and token refresh also fails, the error is "Session expired"
      expect(screen.getByText(/Session expired|Invalid email or password/)).toBeInTheDocument();
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows email verification prompt when login returns 403 with email_not_verified', async () => {
    // Mock the initial /auth/me call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: null, tenant: null }),
    });
    // Mock the 403 response (no token refresh for 403)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({
        error: 'Please verify your email address before logging in.',
        code: 'email_not_verified',
        email: 'unverified@example.com',
      })),
    });
    // Mock the resend-verification call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: 'Verification email sent' }),
    });

    renderLogin();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'unverified@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitBtn());

    await waitFor(() => {
      expect(screen.getByText(/verify your email address to continue/i)).toBeInTheDocument();
    });

    // Should show resend verification button
    expect(screen.getByText('Resend verification email')).toBeInTheDocument();
  });

  it('submits correct payload on login', async () => {
    // Use mockImplementation to handle different endpoints
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: null, tenant: null }),
        });
      }
      if (url.includes('/auth/login')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'jwt-token',
            refresh_token: 'refresh-token',
            user: {
              email: 'test@example.com',
              tenant_id: 't1',
              is_admin: false,
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });

    const { onNavigate } = renderLogin();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitBtn());

    await waitFor(() => {
      // Check that the login endpoint was called with the correct payload
      const loginCalls = mockFetch.mock.calls.filter(c => c[0] && c[0].includes('/api/auth/login'));
      expect(loginCalls).toHaveLength(1);
      expect(loginCalls[0][1]).toMatchObject({
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });
    });

    // Wait for navigation to dashboard (happens via useEffect when user changes)
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith('dashboard');
    });
  });

  it('disables submit button while submitting', async () => {
    // First, set up the mock for /auth/me to resolve
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: null, tenant: null }),
    });
    // Then, make the login fetch hang so we can see the loading state
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    renderLogin();

    // Wait for the initial auth check to complete and the form to render
    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitBtn());

    // Wait for the submit button to show loading state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in…/i })).toBeDisabled();
    });
  });

  it('disables Google button while loading', async () => {
    // Mock the initial /auth/me call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: null, tenant: null }),
    });
    // Mock the google OAuth init to hang
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    renderLogin();

    await waitFor(() => {
      expect(getGoogleBtn()).toBeInTheDocument();
    });

    fireEvent.click(getGoogleBtn());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connecting/i })).toBeDisabled();
    });
  });
});

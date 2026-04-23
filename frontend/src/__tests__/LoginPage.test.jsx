/**
 * Tests for LoginPage component.
 * Updated to cover Google OAuth button and email verification error handling.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext.jsx';
import LoginPage from '../pages/Login.jsx';

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

  it('renders email and password fields', () => {
    renderLogin();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(getSubmitBtn()).toBeInTheDocument();
  });

  it('renders Google Sign-In button', () => {
    renderLogin();

    expect(getGoogleBtn()).toBeInTheDocument();
  });

  it('navigates to register page when clicking create account link', () => {
    const { onNavigate } = renderLogin();

    const link = screen.getByRole('link', { name: /create one/i });
    fireEvent.click(link);

    expect(onNavigate).toHaveBeenCalledWith('register');
  });

  it('shows error when login fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: 'Invalid email or password' })),
    });

    const { onNavigate } = renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(getSubmitBtn());

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows email verification prompt when login returns 403 with email_not_verified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({
        error: 'Please verify your email address before logging in.',
        code: 'email_not_verified',
        email: 'unverified@example.com',
      })),
    });

    renderLogin();

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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-token',
        refresh_token: 'refresh-token',
        user: { email: 'test@example.com', tenant_id: 't1' },
      }),
    });

    const { onNavigate } = renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitBtn());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });
    });

    expect(onNavigate).toHaveBeenCalledWith('dashboard');
    expect(localStorage.getItem('access_token')).toBe('jwt-token');
  });

  it('disables submit button while submitting', async () => {
    // Make the fetch hang so we can see the loading state
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitBtn());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in…/i })).toBeDisabled();
    });
  });

  it('disables Google button while loading', async () => {
    // Mock the google OAuth init to hang
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    renderLogin();

    fireEvent.click(getGoogleBtn());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connecting/i })).toBeDisabled();
    });
  });
});

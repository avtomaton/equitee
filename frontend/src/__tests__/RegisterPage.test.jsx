/**
 * Tests for RegisterPage component.
 * Updated to cover email confirmation flow ("Check your email" screen).
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext.jsx';
import RegisterPage from '../pages/Register.jsx';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderRegister(overrides = {}) {
  const onNavigate = vi.fn();
  const utils = render(
    <AuthProvider>
      <RegisterPage onNavigate={onNavigate} {...overrides} />
    </AuthProvider>
  );
  return { ...utils, onNavigate };
}

describe('RegisterPage', () => {
  it('renders all form fields', () => {
    renderRegister();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText(/Portfolio Name/)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('navigates to login page when clicking sign in link', () => {
    const { onNavigate } = renderRegister();

    fireEvent.click(screen.getByRole('link', { name: /sign in/i }));
    expect(onNavigate).toHaveBeenCalledWith('login');
  });

  it('shows error when passwords do not match', async () => {
    renderRegister();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows error when password is too short', async () => {
    const { onNavigate } = renderRegister();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/Password must be at least 12 characters/)).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows "Check your email" screen after successful registration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-token',
        refresh_token: 'refresh-token',
        user: { email: 'new@example.com', tenant_id: null, user_id: 1, is_admin: false },
      }),
    });

    const { onNavigate } = renderRegister();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Portfolio Name/), {
      target: { value: 'My Portfolio' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    // Should show "Check your email" screen
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });

    // Should show the email address
    expect(screen.getByText(/new@example\.com/)).toBeInTheDocument();

    // Should have a "Go to Sign In" button
    expect(screen.getByRole('button', { name: /go to sign in/i })).toBeInTheDocument();

    // Clicking it should navigate to login
    fireEvent.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(onNavigate).toHaveBeenCalledWith('login');
  });

  it('shows server error on registration failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: 'Email already registered' })),
    });

    const { onNavigate } = renderRegister();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument();
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('stores tokens after successful registration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-token',
        refresh_token: 'refresh-token',
        user: { email: 'new@example.com', tenant_id: null, user_id: 1, is_admin: false },
      }),
    });

    renderRegister();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('jwt-token');
      expect(localStorage.getItem('refresh_token')).toBe('refresh-token');
    });
  });
});


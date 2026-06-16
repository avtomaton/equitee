/// <reference types="vitest/globals" />
/**
 * Tests for VerifyEmailPage component.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import VerifyEmailPage from '../pages/VerifyEmail.jsx';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderVerifyEmail(overrides = {}) {
  const onNavigate = vi.fn();
  const utils = render(
    <VerifyEmailPage onNavigate={onNavigate} {...overrides} />
  );
  return { ...utils, onNavigate };
}

describe('VerifyEmailPage', () => {
  it('shows verifying state initially', () => {
    // Make fetch hang so we stay in verifying state
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    // Set a token in the URL hash
    window.location.hash = '#/verify-email?token=test-token-123';

    renderVerifyEmail();

    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument();
  });

  it('shows success state after successful verification', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        message: 'Email verified successfully',
        user: { id: 1, email: 'test@example.com', tenant_id: 't1' },
      }),
    });

    window.location.hash = '#/verify-email?token=valid-token';

    const { onNavigate } = renderVerifyEmail();

    await waitFor(() => {
      expect(screen.getByText('Email Verified!')).toBeInTheDocument();
    });

    expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

    // Click sign in should navigate
    screen.getByRole('button', { name: /sign in/i }).click();
    expect(onNavigate).toHaveBeenCalledWith('login');
  });

  it('shows error state when verification fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({
        error: 'Invalid or expired verification token.',
      })),
    });

    window.location.hash = '#/verify-email?token=invalid-token';

    renderVerifyEmail();

    await waitFor(() => {
      expect(screen.getByText('Verification Failed')).toBeInTheDocument();
    });

    expect(screen.getByText(/expired or is invalid/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to sign in/i })).toBeInTheDocument();
  });

  it('shows error when no token in URL', async () => {
    window.location.hash = '#/verify-email';

    renderVerifyEmail();

    await waitFor(() => {
      expect(screen.getByText('Verification Failed')).toBeInTheDocument();
    });
  });
});

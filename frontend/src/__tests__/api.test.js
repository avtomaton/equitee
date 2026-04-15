/**
 * Tests for api.js — HTTP request helpers and auth integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the config before importing api.js
vi.mock('../config.js', () => ({
  API_URL: '/api',
}));

// Mock window.location.hash so we can inspect redirects
let mockHash = '#/dashboard';
Object.defineProperty(window, 'location', {
  value: {
    get hash() { return mockHash; },
    set hash(val) { mockHash = val; },
  },
  writable: true,
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockHash = '#/dashboard';
});

describe('req helper (via auth calls)', () => {
  it('attaches Authorization header when token exists', async () => {
    localStorage.setItem('access_token', 'my-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const { auth } = await import('../api.js');
    await auth.me();

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/me', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer my-token',
      },
    });
  });

  it('does not attach Authorization header when no token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    // Re-import to get fresh module state (localStorage is cleared)
    vi.resetModules();
    vi.mock('../config.js', () => ({ API_URL: '/api' }));
    const { auth } = await import('../api.js');
    await auth.me();

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders['Authorization']).toBeUndefined();
  });
});

describe('auth API', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.mock('../config.js', () => ({ API_URL: '/api' }));
  });

  it('register sends correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', user: {} }),
    });

    const { auth } = await import('../api.js');
    await auth.register('test@example.com', 'password123', 'My Portfolio');

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        tenantName: 'My Portfolio',
      }),
    });
  });

  it('login sends correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', user: {} }),
    });

    const { auth } = await import('../api.js');
    await auth.login('test@example.com', 'password123');

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
      }),
    });
  });

  it('refresh sends correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-token' }),
    });

    const { auth } = await import('../api.js');
    await auth.refresh('old-refresh-token');

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ refresh_token: 'old-refresh-token' }),
    });
  });

  it('logout calls API but does not throw on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    const { auth } = await import('../api.js');
    // Should not throw — logout is best-effort
    await auth.logout();
  });

  it('me fetches user info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: { id: 1, email: 'test@example.com' },
        tenant: { id: 't1', name: 'Test' },
      }),
    });

    localStorage.setItem('access_token', 'token');
    const { auth } = await import('../api.js');
    const result = await auth.me();

    expect(result.user.email).toBe('test@example.com');
  });
});

describe('401 handling', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.mock('../config.js', () => ({ API_URL: '/api' }));
  });

  it('clears tokens and redirects to login on 401', async () => {
    localStorage.setItem('access_token', 'expired-token');
    localStorage.setItem('refresh_token', 'expired-refresh');
    mockHash = '#/dashboard';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: 'Token expired' })),
    });

    const { auth } = await import('../api.js');

    await expect(auth.me()).rejects.toThrow('Session expired');

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(mockHash).toBe('#/login');
  });

  it('does not redirect if already on login page', async () => {
    localStorage.setItem('access_token', 'expired-token');
    localStorage.setItem('refresh_token', 'expired-refresh');
    mockHash = '#/login';

    // First call: the actual request returns 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: 'Token expired' })),
    });
    // Second call: tryRefresh() hits /auth/refresh and also fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: 'Invalid refresh token' })),
    });

    const { auth } = await import('../api.js');

    // Tokens are cleared and session-expired error is thrown (refresh failed),
    // but hash is NOT changed because we are already on #/login
    await expect(auth.me()).rejects.toThrow('Session expired');

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    // Hash should remain unchanged — no redirect when already on login
    expect(mockHash).toBe('#/login');
  });
});

describe('error message extraction', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.mock('../config.js', () => ({ API_URL: '/api' }));
  });

  it('extracts error message from JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: 'Email is required' })),
    });

    const { auth } = await import('../api.js');

    await expect(auth.login('', '')).rejects.toThrow('Email is required');
  });

  it('falls back to raw text if response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const { auth } = await import('../api.js');

    await expect(auth.login('a@b.com', 'pass')).rejects.toThrow('Internal Server Error');
  });
});

/**
 * api.ts — All HTTP calls to the backend in one place.
 *
 * Supports both self-hosted (no auth) and SaaS (JWT via httpOnly cookies) modes.
 * In SaaS mode, httpOnly cookies are sent automatically via credentials: 'include'.
 *
 * Adding auth headers, a base-URL swap, or global error toasts only
 * needs to happen here.
 */

import { API_URL } from './config.js';
import type { AuthResponse, Property, Income, Expense, Event, Group, Renter } from './types.ts';

// ── CSRF token helper ───────────────────────────────────────────────────────

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)equitee_csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Silent token refresh ────────────────────────────────────────────────────

let _refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // Coalesce concurrent refresh attempts into a single call
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ── Core helper ───────────────────────────────────────────────────────────────

async function req(path: string, options: RequestInit = {}): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Attach CSRF token for state-changing requests
  const method = options.method ?? 'GET';
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isMutation) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  // Also support Authorization header for backward compatibility
  const token = localStorage.getItem('access_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_URL}${path}`, {
    headers,
    credentials: 'include',  // Send httpOnly cookies
    ...options,
  });

  // Handle 401 — try silent refresh once before kicking the user out
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Update CSRF token if it changed
      if (isMutation) {
        const csrf = getCsrfToken();
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }
      res = await fetch(`${API_URL}${path}`, {
        headers,
        credentials: 'include',
        ...options,
      });
    } else {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let errorMessage = text;
    try {
      const json = JSON.parse(text) as { error?: string };
      errorMessage = json.error || text;
    } catch {
      // text is not valid JSON — use it as-is
    }
    throw new Error(errorMessage || `Request failed: ${res.status}`);
  }
  return res.json();
}

const get  = (path: string) => req(path);
const post = (path: string, body: unknown) => req(path, { method: 'POST', body: JSON.stringify(body) });
const put  = (path: string, body: unknown) => req(path, { method: 'PUT', body: JSON.stringify(body) });
const del  = (path: string) => req(path, { method: 'DELETE' });

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  register: (email: string, password: string, tenantName: string): Promise<AuthResponse> =>
    post('/auth/register', { email, password, tenantName }) as Promise<AuthResponse>,

  login: (email: string, password: string): Promise<AuthResponse> =>
    post('/auth/login', { email, password }) as Promise<AuthResponse>,

  refresh: (refreshToken: string): Promise<AuthResponse> =>
    post('/auth/refresh', { refresh_token: refreshToken }) as Promise<AuthResponse>,

  logout: (): Promise<void> =>
    post('/auth/logout', {}).then(() => { return; }), // Best-effort; cookies are cleared by server

  me: (): Promise<{ user: { email: string; tenant_id: string; is_admin?: boolean; id?: number; role?: string; email_verified?: boolean }; tenant?: { id: string; name: string; plan?: string } }> =>
    get('/auth/me') as Promise<{ user: { email: string; tenant_id: string; is_admin?: boolean; id?: number; role?: string; email_verified?: boolean }; tenant?: { id: string; name: string; plan?: string } }>,

  verifyEmail: (token: string): Promise<{ message: string; user: { email: string; tenant_id: string; is_admin?: boolean; id?: number; role?: string; email_verified?: boolean } }> =>
    post('/auth/verify-email', { token }) as Promise<{ message: string; user: { email: string; tenant_id: string; is_admin?: boolean; id?: number; role?: string; email_verified?: boolean } }>,

  resendVerification: (email: string): Promise<{ message: string }> =>
    post('/auth/resend-verification', { email }) as Promise<{ message: string }>,

  forgotPassword: (email: string): Promise<{ message: string }> =>
    post('/auth/forgot-password', { email }) as Promise<{ message: string }>,

  resetPassword: (token: string, password: string): Promise<{ message: string }> =>
    post('/auth/reset-password', { token, password }) as Promise<{ message: string }>,

  googleOAuthInit: (): Promise<{ authorization_url: string; state: string }> =>
    post('/auth/google', {}) as Promise<{ authorization_url: string; state: string }>,

  googleOAuthCallback: (code: string, state: string): Promise<AuthResponse> =>
    post('/auth/google/callback', { code, state }) as Promise<AuthResponse>,
};

// ── Tenancy ───────────────────────────────────────────────────────────────────

export const tenancy = {
  requestTenancy: (tenantName: string): Promise<unknown> =>
    post('/tenancy/request', { tenantName }),

  getMyRequests: (): Promise<unknown[]> =>
    get('/tenancy/requests') as Promise<unknown[]>,

  getMyTenants: (): Promise<unknown[]> =>
    get('/tenancy/tenants') as Promise<unknown[]>,

  switchTenant: (tenantId: string): Promise<unknown> =>
    post('/tenancy/switch', { tenant_id: tenantId }),

  getMembers: (): Promise<unknown[]> =>
    get('/tenancy/members') as Promise<unknown[]>,

  inviteMember: (email: string, role: string = 'member'): Promise<unknown> =>
    post('/tenancy/invite', { email, role }),

  revokeMember: (userId: string): Promise<unknown> =>
    post(`/tenancy/members/${userId}/revoke`, {}),
};

// ── Admin ─────────────────────────────────────────────────────────────────────

export const admin = {
  getAnalytics: (): Promise<unknown> =>
    get('/admin/analytics'),

  listUsers: (page: number = 1, search: string = ''): Promise<unknown> =>
    get(`/admin/users?page=${page}&search=${encodeURIComponent(search)}`),

  getUser: (userId: string): Promise<unknown> =>
    get(`/admin/users/${userId}`),

  toggleUserActive: (userId: string): Promise<unknown> =>
    post(`/admin/users/${userId}/toggle-active`, {}),

  setUserAdmin: (userId: string, isAdmin: boolean): Promise<unknown> =>
    post(`/admin/users/${userId}/set-admin`, { is_admin: isAdmin }),

  listTenants: (page: number = 1, search: string = ''): Promise<unknown> =>
    get(`/admin/tenants?page=${page}&search=${encodeURIComponent(search)}`),

  toggleTenantActive: (tenantId: string): Promise<unknown> =>
    post(`/admin/tenants/${tenantId}/toggle-active`, {}),

  updateTenantPlan: (tenantId: string, plan: string): Promise<unknown> =>
    put(`/admin/tenants/${tenantId}/plan`, { plan }),

  listTenancyRequests: (page: number = 1, status: string = ''): Promise<unknown> =>
    get(`/admin/tenancy-requests?page=${page}${status ? `&status=${status}` : ''}`),

  approveTenancyRequest: (requestId: string): Promise<unknown> =>
    post(`/admin/tenancy-requests/${requestId}/approve`, {}),

  rejectTenancyRequest: (requestId: string, notes: string = ''): Promise<unknown> =>
    post(`/admin/tenancy-requests/${requestId}/reject`, { notes }),
};

// ── Properties ────────────────────────────────────────────────────────────────

export const getProperties         = (archived: boolean = false): Promise<Property[]> => get(`/properties${archived ? '?archived=1' : ''}`) as Promise<Property[]>;
export const getProperty           = (id: number): Promise<Property> => get(`/properties/${id}`) as Promise<Property>;
export const createProperty        = (data: Record<string, unknown>): Promise<Property> => post('/properties', data) as Promise<Property>;
export const updateProperty        = (id: number, data: Record<string, unknown>): Promise<Property> => put(`/properties/${id}`, data) as Promise<Property>;
export const archiveProperty       = (id: number): Promise<unknown> => del(`/properties/${id}`);
export const restoreProperty       = (id: number): Promise<unknown> => post(`/properties/${id}/restore`, {});
export const updatePropertyLoan    = (id: number, data: Record<string, unknown>): Promise<unknown> => post(`/properties/${id}/loan`, data);

// ── Expenses ──────────────────────────────────────────────────────────────────

export const getExpenses           = (propertyId?: number): Promise<Expense[]> => get(`/expenses${propertyId ? `?property_id=${propertyId}` : ''}`) as Promise<Expense[]>;
export const createExpense         = (data: Record<string, unknown>): Promise<Expense> => post('/expenses', data) as Promise<Expense>;
export const updateExpense         = (id: number, data: Record<string, unknown>): Promise<Expense> => put(`/expenses/${id}`, data) as Promise<Expense>;
export const deleteExpense         = (id: number): Promise<unknown> => del(`/expenses/${id}`);

// ── Income ────────────────────────────────────────────────────────────────────

export const getIncome             = (propertyId?: number): Promise<Income[]> => get(`/income${propertyId ? `?property_id=${propertyId}` : ''}`) as Promise<Income[]>;
export const createIncome          = (data: Record<string, unknown>): Promise<Income> => post('/income', data) as Promise<Income>;
export const updateIncome          = (id: number, data: Record<string, unknown>): Promise<Income> => put(`/income/${id}`, data) as Promise<Income>;
export const deleteIncome          = (id: number): Promise<unknown> => del(`/income/${id}`);

// ── Tenants (Renters) ─────────────────────────────────────────────────────────

export const getTenants            = (opts: Record<string, unknown> = {}): Promise<Renter[]> => get(`/tenants${buildQuery(opts)}`) as Promise<Renter[]>;
export const createTenant          = (data: Record<string, unknown>): Promise<Renter> => post('/tenants', data) as Promise<Renter>;
export const updateTenant          = (id: number, data: Record<string, unknown>): Promise<Renter> => put(`/tenants/${id}`, data) as Promise<Renter>;
export const archiveTenant         = (id: number): Promise<unknown> => del(`/tenants/${id}`);
export const restoreTenant         = (id: number): Promise<unknown> => post(`/tenants/${id}/restore`, {});

// ── Events ────────────────────────────────────────────────────────────────────

export const getEvents             = (propertyId?: number): Promise<Event[]> => get(`/events${propertyId ? `?property_id=${propertyId}` : ''}`) as Promise<Event[]>;
export const updateEvent           = (id: number, data: Record<string, unknown>): Promise<unknown> => put(`/events/${id}`, data);
export const deleteEvent           = (id: number): Promise<unknown> => del(`/events/${id}`);

// ── Property Groups ───────────────────────────────────────────────────────────

export const getGroups             = (): Promise<Group[]> => get('/groups') as Promise<Group[]>;
export const getGroup              = (id: number): Promise<Group> => get(`/groups/${id}`) as Promise<Group>;
export const createGroup           = (data: Record<string, unknown>): Promise<Group> => post('/groups', data) as Promise<Group>;
export const updateGroup           = (id: number, data: Record<string, unknown>): Promise<Group> => put(`/groups/${id}`, data) as Promise<Group>;
export const deleteGroup           = (id: number): Promise<unknown> => del(`/groups/${id}`);
export const getDefaultGroup       = (): Promise<Group> => get('/groups/default') as Promise<Group>;
export const clearDefaultGroup     = (): Promise<unknown> => post('/groups/clear-default', {});

// ── Misc ──────────────────────────────────────────────────────────────────────

export const getStatistics         = (): Promise<unknown> => get('/statistics');
export const exportData            = (): Promise<unknown> => get('/export');
export const importData            = (data: Record<string, unknown>): Promise<unknown> => post('/import', data);
export const getMode               = (): Promise<{ mode: string }> => get('/mode') as Promise<{ mode: string }>;

// ── Documents ─────────────────────────────────────────────────────────────────

export const getDocuments          = (propertyId?: number): Promise<unknown[]> => get(`/documents${propertyId ? `?property_id=${propertyId}` : ''}`) as Promise<unknown[]>;
export const getDocumentTypes      = (): Promise<unknown[]> => get('/documents/types') as Promise<unknown[]>;
export const uploadDocument        = (formData: FormData): Promise<unknown> => req('/documents', { method: 'POST', body: formData, headers: {} });
export const deleteDocument        = (id: number): Promise<unknown> => del(`/documents/${id}`);
export const getDocumentUrl        = (id: number): string => `${API_URL}/documents/${id}`;

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== false);
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

/**
 * api.js — All HTTP calls to the backend in one place.
 *
 * Supports both self-hosted (no auth) and SaaS (JWT via httpOnly cookies) modes.
 * In SaaS mode, httpOnly cookies are sent automatically via credentials: 'include'.
 *
 * Adding auth headers, a base-URL swap, or global error toasts only
 * needs to happen here.
 */

import { API_URL } from './config.js';

// ── CSRF token helper ───────────────────────────────────────────────────────

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)equitee_csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Silent token refresh ────────────────────────────────────────────────────

let _refreshPromise = null;

async function tryRefresh() {
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

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };

  // Attach CSRF token for state-changing requests
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method);
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
      const json = JSON.parse(text);
      errorMessage = json.error || text;
    } catch {
      // text is not valid JSON — use it as-is
    }
    throw new Error(errorMessage || `Request failed: ${res.status}`);
  }
  return res.json();
}

const get  = (path)        => req(path);
const post = (path, body)  => req(path, { method: 'POST',   body: JSON.stringify(body) });
const put  = (path, body)  => req(path, { method: 'PUT',    body: JSON.stringify(body) });
const del  = (path)        => req(path, { method: 'DELETE' });

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  register: (email, password, tenantName) =>
    post('/auth/register', { email, password, tenantName }),

  login: (email, password) =>
    post('/auth/login', { email, password }),

  refresh: (refreshToken) =>
    post('/auth/refresh', { refresh_token: refreshToken }),

  logout: () =>
    post('/auth/logout').catch(() => {}), // Best-effort; cookies are cleared by server

  me: () =>
    get('/auth/me'),

  // Email verification
  verifyEmail: (token) =>
    post('/auth/verify-email', { token }),

  resendVerification: (email) =>
    post('/auth/resend-verification', { email }),

  // Password reset
  forgotPassword: (email) =>
    post('/auth/forgot-password', { email }),

  resetPassword: (token, password) =>
    post('/auth/reset-password', { token, password }),

  // Google OAuth
  googleOAuthInit: () =>
    post('/auth/google', {}),

  googleOAuthCallback: (code, state) =>
    post('/auth/google/callback', { code, state }),
};

// ── Tenancy ───────────────────────────────────────────────────────────────────

export const tenancy = {
  requestTenancy: (tenantName) =>
    post('/tenancy/request', { tenantName }),

  getMyRequests: () =>
    get('/tenancy/requests'),

  getMyTenants: () =>
    get('/tenancy/tenants'),

  switchTenant: (tenantId) =>
    post('/tenancy/switch', { tenant_id: tenantId }),

  getMembers: () =>
    get('/tenancy/members'),

  inviteMember: (email, role = 'member') =>
    post('/tenancy/invite', { email, role }),

  revokeMember: (userId) =>
    post(`/tenancy/members/${userId}/revoke`),
};

// ── Admin ─────────────────────────────────────────────────────────────────────

export const admin = {
  getAnalytics: () =>
    get('/admin/analytics'),

  listUsers: (page = 1, search = '') =>
    get(`/admin/users?page=${page}&search=${encodeURIComponent(search)}`),

  getUser: (userId) =>
    get(`/admin/users/${userId}`),

  toggleUserActive: (userId) =>
    post(`/admin/users/${userId}/toggle-active`),

  setUserAdmin: (userId, isAdmin) =>
    post(`/admin/users/${userId}/set-admin`, { is_admin: isAdmin }),

  listTenants: (page = 1, search = '') =>
    get(`/admin/tenants?page=${page}&search=${encodeURIComponent(search)}`),

  toggleTenantActive: (tenantId) =>
    post(`/admin/tenants/${tenantId}/toggle-active`),

  updateTenantPlan: (tenantId, plan) =>
    put(`/admin/tenants/${tenantId}/plan`, { plan }),

  listTenancyRequests: (page = 1, status = '') =>
    get(`/admin/tenancy-requests?page=${page}${status ? `&status=${status}` : ''}`),

  approveTenancyRequest: (requestId) =>
    post(`/admin/tenancy-requests/${requestId}/approve`),

  rejectTenancyRequest: (requestId, notes = '') =>
    post(`/admin/tenancy-requests/${requestId}/reject`, { notes }),
};

// ── Properties ────────────────────────────────────────────────────────────────

export const getProperties         = (archived = false) => get(`/properties${archived ? '?archived=1' : ''}`);
export const getProperty           = (id)               => get(`/properties/${id}`);
export const createProperty        = (data)             => post('/properties', data);
export const updateProperty        = (id, data)         => put(`/properties/${id}`, data);
export const archiveProperty       = (id)               => del(`/properties/${id}`);
export const restoreProperty       = (id)               => post(`/properties/${id}/restore`);
export const updatePropertyLoan    = (id, data)         => post(`/properties/${id}/loan`, data);

// ── Expenses ──────────────────────────────────────────────────────────────────

export const getExpenses           = (propertyId)       => get(`/expenses${propertyId ? `?property_id=${propertyId}` : ''}`);
export const createExpense         = (data)             => post('/expenses', data);
export const updateExpense         = (id, data)         => put(`/expenses/${id}`, data);
export const deleteExpense         = (id)               => del(`/expenses/${id}`);

// ── Income ────────────────────────────────────────────────────────────────────

export const getIncome             = (propertyId)       => get(`/income${propertyId ? `?property_id=${propertyId}` : ''}`);
export const createIncome          = (data)             => post('/income', data);
export const updateIncome          = (id, data)         => put(`/income/${id}`, data);
export const deleteIncome          = (id)               => del(`/income/${id}`);

// ── Tenants ───────────────────────────────────────────────────────────────────

export const getTenants            = (opts = {})        => get(`/tenants${buildQuery(opts)}`);
export const createTenant          = (data)             => post('/tenants', data);
export const updateTenant          = (id, data)         => put(`/tenants/${id}`, data);
export const archiveTenant         = (id)               => del(`/tenants/${id}`);
export const restoreTenant         = (id)               => post(`/tenants/${id}/restore`);

// ── Events ────────────────────────────────────────────────────────────────────

export const getEvents             = (propertyId)       => get(`/events${propertyId ? `?property_id=${propertyId}` : ''}`);
export const updateEvent           = (id, data)         => put(`/events/${id}`, data);
export const deleteEvent           = (id)               => del(`/events/${id}`);

// ── Property Groups ───────────────────────────────────────────────────────────

export const getGroups             = ()                 => get('/groups');
export const getGroup              = (id)               => get(`/groups/${id}`);
export const createGroup           = (data)             => post('/groups', data);
export const updateGroup           = (id, data)         => put(`/groups/${id}`, data);
export const deleteGroup           = (id)               => del(`/groups/${id}`);
export const getDefaultGroup       = ()                 => get('/groups/default');
export const clearDefaultGroup     = ()                 => post('/groups/clear-default', {});

// ── Misc ──────────────────────────────────────────────────────────────────────

export const getStatistics         = ()                 => get('/statistics');
export const exportData            = ()                 => get('/export');
export const importData            = (data)             => post('/import', data);
export const getMode               = ()                 => get('/mode');

// ── Documents ─────────────────────────────────────────────────────────────────

export const getDocuments          = (propertyId)       => get(`/documents${propertyId ? `?property_id=${propertyId}` : ''}`);
export const getDocumentTypes      = ()                 => get('/documents/types');
export const uploadDocument        = (formData)         => req('/documents', { method: 'POST', body: formData });
export const deleteDocument        = (id)               => del(`/documents/${id}`);
export const getDocumentUrl        = (id)               => `${API_URL}/documents/${id}`;

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildQuery(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== false);
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

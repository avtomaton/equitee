/**
 * api.js — All HTTP calls to the backend in one place.
 *
 * Supports both self-hosted (no auth) and SaaS (JWT auth) modes.
 * In SaaS mode, the access token is automatically attached to every request.
 *
 * Adding auth headers, a base-URL swap, or global error toasts only
 * needs to happen here.
 */

import { API_URL } from './config.js';

// ── Core helper ───────────────────────────────────────────────────────────────

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };

  // Attach JWT token if available
  const token = localStorage.getItem('access_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    ...options,
  });

  if (!res.ok) {
    // Handle 401 (token expired) — redirect to login in SaaS mode
    if (res.status === 401 && token && window.location.hash !== '#/login') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.hash = '#/login';
      throw new Error('Session expired. Please log in again.');
    }

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
    post('/auth/logout', {}).catch(() => {}), // Best-effort

  me: () =>
    get('/auth/me'),
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

// ── Misc ──────────────────────────────────────────────────────────────────────

export const getStatistics         = ()                 => get('/statistics');
export const exportData            = ()                 => get('/export');
export const importData            = (data)             => post('/import', data);

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

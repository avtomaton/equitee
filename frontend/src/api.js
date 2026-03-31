/**
 * api.js — All HTTP calls to the backend in one place.
 *
 * Every function returns a parsed JSON value (or throws on non-OK responses),
 * so callers never deal with raw fetch() or status checks.
 *
 * Adding auth headers, a base-URL swap, or global error toasts only
 * needs to happen here.
 */

import { API_URL } from './config.js';

// ── Core helper ───────────────────────────────────────────────────────────────

async function req(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

const get  = (path)        => req(path);
const post = (path, body)  => req(path, { method: 'POST',   body: JSON.stringify(body) });
const put  = (path, body)  => req(path, { method: 'PUT',    body: JSON.stringify(body) });
const del  = (path)        => req(path, { method: 'DELETE' });

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

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildQuery(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== false);
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

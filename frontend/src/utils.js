/**
 * utils.js — Pure helper functions (no React, no API calls, no constants).
 *
 * Extracted from config.js so that config.js carries only true constants.
 */

// ── Option helpers ────────────────────────────────────────────────────────────

/**
 * Merge a seed list with values found in data, deduplicating and preserving seed order.
 * New values from data are appended after the seed entries.
 */
export const mergeOptions = (seed, dataValues) =>
  [...new Set([...seed, ...dataValues.filter(Boolean)])];

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string as a local date (avoids UTC midnight offset issues). */
export const parseLocalDate = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Return true if a YYYY-MM-DD date string falls within [start, end] (Date objects). */
export const isDateInRange = (date, start, end) => {
  const d = parseLocalDate(date);
  return d !== null && d >= start && d <= end;
};

/** Pre-built named date ranges for filter dropdowns. */
export const getDateRanges = () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  return {
    ytd:          { start: (() => { const s = new Date(now); s.setFullYear(s.getFullYear() - 1); s.setHours(0, 0, 0, 0); return s; })(), end: now },
    currentMonth: { start: new Date(year, month, 1),  end: now },
    currentYear:  { start: new Date(year, 0, 1),      end: new Date(year, 11, 31) },
    lastYear:     { start: new Date(year - 1, 0, 1),  end: new Date(year - 1, 11, 31) },
  };
};

// ── Tenant helpers ────────────────────────────────────────────────────────────

/** Return true if the tenant has an active lease (started and not yet ended). */
export const isCurrentTenant = (tenant) => {
  if (!tenant.lease_start) return false;
  const start = parseLocalDate(tenant.lease_start);
  const now   = new Date();
  if (!start || start > now) return false;
  if (!tenant.lease_end)    return true;
  const end = parseLocalDate(tenant.lease_end);
  return end === null || end >= now;
};

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Format a postal code as "A1A 1A1". */
export const formatPostalCode = (raw) => {
  const clean = (raw || '').replace(/\s+/g, '').toUpperCase();
  return clean.length === 6 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
};

// ── Number / period formatters ─────────────────────────────────────────────────

/** Format a dollar amount: $1,234 */
export const fmt = n => `$${Math.round(n).toLocaleString()}`;

/**
 * Format a number of months as a human-readable period.
 *   0  →  'Recovered'  (use for payback)
 *   <12 →  '3 mo'
 *   ≥12 →  '1.2 yr'
 */
export const fmtPeriod = months => {
  if (months <= 0) return 'Recovered';
  return months < 12 ? `${Math.round(months)} mo` : `${(months / 12).toFixed(1)} yr`;
};

// ── Date range helpers ────────────────────────────────────────────────────────

/**
 * Return { start, end } for a trailing-12-month window ending now.
 * start is normalized to midnight so same-day-last-year transactions are included.
 */
export const trailingYear = () => {
  const end   = new Date();
  const start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate()); // midnight by default
  return { start, end };
};

/**
 * Return true if a YYYY-MM-DD date string falls within the trailing 12-month window.
 * Pre-computes the window once and returns a tester function.
 *
 * Usage:
 *   const inYTD = makeInTrailingYear();
 *   records.filter(r => inYTD(r.income_date))
 */
export const makeInTrailingYear = () => {
  const { start, end } = trailingYear();
  return (dateStr) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt >= start && dt <= end;
  };
};

/** Clamp a number between lo and hi (inclusive). */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

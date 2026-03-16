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
    ytd:          { start: new Date(year, 0, 1),      end: now },
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

export const COLORS = ['#3b82f6', '#60a5fa', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const API_URL = '/api';

// ── Initial options ───────────────────────────────────────────────────────────

export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

export const INITIAL_OPTIONS = {
  expenseTypes:      ['One-off', 'Recurrent'],
  expenseCategories: ['Advertisement', 'Legal', 'Maintenance', 'Management', 'Mortgage', 'Principal', 'Tax', 'Utilities'],
  incomeTypes:       ['Rent', 'Compensation', 'Rent (net)'],
  propertyTypes:     ['Condo', 'Townhouse', 'House'],
  propertyStatuses:  ['Rented', 'Vacant', 'Primary', 'Sold'],
};

/** Merge fixed seed options with data-derived values, deduped and sorted */
export const mergeOptions = (seed, dataValues) =>
  [...new Set([...seed, ...dataValues])].sort();

// ── Date utilities ────────────────────────────────────────────────────────────

export const getDateRanges = () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  return {
    ytd:          { start: new Date(year, 0, 1),     end: now },
    currentMonth: { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) },
    currentYear:  { start: new Date(year, 0, 1),     end: new Date(year, 11, 31) },
    lastYear:     { start: new Date(year - 1, 0, 1), end: new Date(year - 1, 11, 31) },
  };
};

export const isDateInRange = (date, start, end) => {
  const d = new Date(date);
  return d >= start && d <= end;
};

export const isCurrentTenant = (tenant) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(tenant.lease_start);
  if (start > today) return false;
  if (!tenant.lease_end) return true;
  return new Date(tenant.lease_end) >= today;
};

// ── Input formatting ──────────────────────────────────────────────────────────

export const formatPostalCode = (raw) => {
  const clean = raw.replace(/\s/g, '').toUpperCase().slice(0, 6);
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
};

/**
 * Parse a date-only string (YYYY-MM-DD) as LOCAL midnight, not UTC.
 * new Date('2024-01-15') treats the string as UTC and can show Jan 14
 * in negative-offset timezones. This avoids that.
 */
export const parseLocalDate = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Format a date-only string for display, treating it as local date */
export const fmtDate = (str) => {
  const d = parseLocalDate(str);
  return d ? d.toLocaleDateString() : '—';
};

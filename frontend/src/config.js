export const COLORS = ['#3b82f6', '#60a5fa', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const API_URL = '/api';

// ── Initial options ───────────────────────────────────────────────────────────

export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

export const INITIAL_OPTIONS = {
  expenseTypes:      ['One-off', 'Recurrent'],
  expenseCategories: ['Advertisement', 'Legal', 'Maintenance', 'Management', 'Mortgage', 'Principal', 'Tax', 'Utilities'],
  incomeTypes:       ['Rent', 'Compensation'],
  propertyTypes:     ['Condo', 'Townhouse', 'House'],
  propertyStatuses:  ['Rented', 'Vacant', 'Primary'],
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

// ── Column definitions ────────────────────────────────────────────────────────
// default:true = shown by default; false = hidden but user can enable

export const COLUMN_DEFS = {
  properties: [
    { key: 'score',         label: 'Score',        default: false },
    { key: 'name',          label: 'Name',         default: true  },
    { key: 'status',        label: 'Status',       default: true  },
    { key: 'type',          label: 'Type',         default: true  },
    { key: 'location',      label: 'Location',     default: true  },
    { key: 'market_price',  label: 'Mkt Value',    default: true  },
    { key: 'monthly_rent',  label: 'Rent/mo',      default: true  },
    { key: 'total_income',  label: 'Income',       default: false },
    { key: 'net_expenses',  label: 'Net Expenses', default: false },
    { key: 'net',           label: 'Net Profit',   default: true  },
    { key: 'roi',           label: 'ROI',          default: true  },
    { key: 'equity',        label: 'Equity',       default: false },
    { key: 'loan',          label: 'Loan',         default: false },
    { key: 'poss_date',     label: 'Possession',   default: false },
    { key: 'notes',         label: 'Notes',        default: false },
  ],
  expenses: [
    { key: 'date',     label: 'Date',     default: true  },
    { key: 'property', label: 'Property', default: true  },
    { key: 'amount',   label: 'Amount',   default: true  },
    { key: 'category', label: 'Category', default: true  },
    { key: 'type',     label: 'Type',     default: true  },
    { key: 'notes',    label: 'Notes',    default: true  },
  ],
  income: [
    { key: 'date',     label: 'Date',     default: true  },
    { key: 'property', label: 'Property', default: true  },
    { key: 'amount',   label: 'Amount',   default: true  },
    { key: 'type',     label: 'Type',     default: true  },
    { key: 'notes',    label: 'Notes',    default: true  },
  ],
  tenants: [
    { key: 'name',        label: 'Name',        default: true  },
    { key: 'property',    label: 'Property',    default: true  },
    { key: 'status',      label: 'Status',      default: true  },
    { key: 'phone',       label: 'Phone',       default: true  },
    { key: 'email',       label: 'Email',       default: true  },
    { key: 'lease_start', label: 'Lease Start', default: true  },
    { key: 'lease_end',   label: 'Lease End',   default: true  },
    { key: 'rent',        label: 'Rent/mo',     default: true  },
    { key: 'deposit',     label: 'Deposit',     default: false },
    { key: 'notes',       label: 'Notes',       default: true  },
  ],
  events: [
    { key: 'date',      label: 'Date',     default: true  },
    { key: 'property',  label: 'Property', default: true  },
    { key: 'field',     label: 'Field',    default: true  },
    { key: 'old_value', label: 'Old',      default: true  },
    { key: 'new_value', label: 'New',      default: true  },
    { key: 'notes',     label: 'Notes',    default: true  },
  ],
};

// ── Cookie helpers ────────────────────────────────────────────────────────────
export const getCookie = (name) => {
  const m = document.cookie.match('(?:^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m[1]) : null;
};
export const setCookie = (name, value, days = 730) => {
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${days * 86400};path=/`;
};

// ── Metric helpers — imported from metrics.js ─────────────────────────────────
// Re-exported here so existing imports of the form
//   import { yearsHeld, calcSimpleHealth, … } from '../config.js'
// continue to work without changes.
export {
  yearsHeld,
  calcMetrics,
  avgMonthly,
  computeMortgagePrincipal,
  principalInRange,
  calcMortgagePayment,
  monthlyMortgageEquiv,
  calcIRR,
  buildPropertyIRRCashFlows,
  calcExpected,
  expGapCls,
  calcSimpleHealth,
  calcInvestmentScore,
} from './metrics.js';


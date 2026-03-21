/**
 * constants.js — Centralized application constants
 * Use these throughout the app to maintain consistency
 */

export const EXPENSE_CATEGORIES = [
  'Mortgage',
  'Principal',
  'Management',
  'Maintenance',
  'Insurance',
  'Utilities',
  'Tax',
  'Capital',
  'Other'
];

export const PROPERTY_STATUSES = ['Rented', 'Vacant', 'Primary'];

export const PROPERTY_TYPES = [
  'Condo',
  'House',
  'Townhouse',
  'Duplex',
  'Commercial',
  'Land'
];

export const INCOME_TYPES = ['Rent', 'Deposit', 'Parking', 'Laundry', 'Other'];

export const EXPENSE_TYPES = ['Recurrent', 'One-time'];

export const API_ENDPOINTS = {
  PROPERTIES: '/api/properties',
  EXPENSES: '/api/expenses',
  INCOME: '/api/income',
  TENANTS: '/api/tenants',
  EVENTS: '/api/events',
  STATISTICS: '/api/statistics',
  EXPORT: '/api/export',
  IMPORT: '/api/import',
  HEALTH: '/api/health',
};

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  PER_PAGE: 50,
  MAX_PER_PAGE: 500,
};

export const QUICK_DATE_RANGES = {
  LAST_30_DAYS: {
    label: 'Last 30 Days',
    getDates: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
    }
  },
  YTD: {
    label: 'Year-to-Date',
    getDates: () => {
      const end = new Date();
      const start = new Date(new Date().getFullYear(), 0, 1);
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
    }
  },
  LAST_YEAR: {
    label: 'Last 12 Months',
    getDates: () => {
      const end = new Date();
      const start = new Date();
      start.setFullYear(start.getFullYear() - 1);
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
    }
  },
  ALL_TIME: {
    label: 'All Time',
    getDates: () => ({ start: null, end: null })
  }
};

export const VALIDATION_RULES = {
  CURRENCY_MIN: 0,
  CURRENCY_MAX: 999999999,
  PERCENTAGE_MIN: 0,
  PERCENTAGE_MAX: 100,
  NAME_MAX_LENGTH: 200,
  ADDRESS_MAX_LENGTH: 500,
  NOTES_MAX_LENGTH: 2000,
  EMAIL_PATTERN: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE_PATTERN: /^[\d\s\-\+\(\)]{10,}$/,
};

export const METRIC_DEFINITIONS = {
  CAP_RATE: 'Annual NOI ÷ market value — yield on the asset',
  DSCR: 'Monthly NOI ÷ monthly mortgage — can income service the debt?',
  ICR: 'Annual NOI ÷ annual interest — interest coverage',
  OER: 'Operating expenses ÷ gross income — cost efficiency',
  CASH_ON_CASH: 'Annual cash flow ÷ equity — return on invested capital',
  IRR: 'Internal rate of return — annualised return across all cash flows',
  ECONOMIC_VACANCY: 'Lost rent from vacancy periods ÷ potential rent',
  PAYBACK_PERIOD: 'Time for cumulative cash flow to recover total expenses',
  BREAK_EVEN: 'Time for net position to reach zero',
};
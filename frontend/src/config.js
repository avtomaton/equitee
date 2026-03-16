/**
 * config.js — Application-wide constants only.
 *
 * Pure computation lives in metrics.js.
 * Small utility functions live in utils.js.
 */

export const COLORS = ['#3b82f6', '#60a5fa', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const API_URL = '/api';

export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

export const INITIAL_OPTIONS = {
  propertyStatuses:  ['Rented', 'Vacant', 'Primary'],
  propertyTypes:     ['Condo', 'House', 'Townhouse', 'Duplex', 'Commercial', 'Land'],
  expenseCategories: ['Mortgage', 'Principal', 'Management', 'Maintenance', 'Insurance',
                      'Utilities', 'Tax', 'Capital', 'Other'],
  expenseTypes:      ['Recurrent', 'One-off'],
  incomeTypes:       ['Rent', 'Deposit', 'Parking', 'Laundry', 'Other'],
};

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
    { key: 'date',           label: 'Date',       default: true  },
    { key: 'property',       label: 'Property',   default: true  },
    { key: 'amount',         label: 'Amount',     default: true  },
    { key: 'category',       label: 'Category',   default: true  },
    { key: 'type',           label: 'Type',       default: true  },
    { key: 'tax_deductible', label: 'Tax Ded.',   default: true  },
    { key: 'notes',          label: 'Notes',      default: true  },
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
};

// ── Cookie helpers ────────────────────────────────────────────────────────────

export const getCookie = (name) => {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
};

export const setCookie = (name, value, days = 730) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/`;
};

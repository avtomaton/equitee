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
    { key: 'name',          label: 'Name',         default: true  },
    { key: 'status',        label: 'Status',       default: true  },
    { key: 'type',          label: 'Type',         default: true  },
    { key: 'location',      label: 'Location',     default: true  },
    { key: 'market_price',  label: 'Mkt Value',    default: true  },
    { key: 'monthly_rent',  label: 'Rent/mo',      default: true  },
    { key: 'total_income',  label: 'Income',       default: true  },
    { key: 'net_expenses',  label: 'Net Expenses', default: true  },
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

// ── Metric computation helpers ────────────────────────────────────────────────

/** Years a property has been held (fractional). null if no poss_date. */
export const yearsHeld = (p) => {
  if (!p.poss_date) return null;
  const [y, m, d] = p.poss_date.split('-').map(Number);
  const diff = (Date.now() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return diff > 0 ? diff : null;
};

/**
 * All derived metrics for a single property.
 * income/expenses arrays are optional (needed for YTD / averages).
 */
export const calcMetrics = (p, incomeRecs = [], expenseRecs = []) => {
  const downPmt      = p.purchase_price - p.loan_amount;
  const equity       = p.market_price   - p.loan_amount;
  const equityPct    = p.market_price   > 0 ? equity / p.market_price * 100 : null;
  const loanPct      = p.market_price   > 0 ? p.loan_amount / p.market_price * 100 : null;
  const appreciation = p.market_price   - p.purchase_price;
  const apprPct      = p.purchase_price > 0 ? appreciation / p.purchase_price * 100 : null;
  const yrs          = yearsHeld(p);
  const yearlyAppr   = yrs ? appreciation / yrs : null;
  const yearlyApprPct = (yrs && p.purchase_price > 0) ? yearlyAppr / p.purchase_price * 100 : null;

  // Projected year-end market value (linear extrapolation)
  const now = new Date();
  const yearFrac = (now - new Date(now.getFullYear(), 0, 1)) / (365.25 * 86400000);
  const remainingYearFrac = 1 - yearFrac;
  const projectedYearEnd = yearlyAppr !== null
    ? p.market_price + yearlyAppr * remainingYearFrac
    : null;

  const totalNetExp  = p.total_expenses - downPmt;
  const totalNetProfit = p.total_income - totalNetExp;
  const totalBalance = p.total_income - p.total_expenses;
  const roi          = p.market_price > 0 ? totalNetProfit / p.market_price * 100 : null;

  // YTD helpers (trailing 12 months to today)
  const ytdEnd   = new Date();
  const ytdStart = new Date(ytdEnd);
  ytdStart.setFullYear(ytdStart.getFullYear() - 1);

  const inPeriod = (dateStr, start, end) => {
    if (!dateStr) return false;
    const [yr, mo, dy] = dateStr.split('-').map(Number);
    const d = new Date(yr, mo - 1, dy);
    return d >= start && d <= end;
  };

  const ytdIncome   = incomeRecs.filter(r => inPeriod(r.income_date,   ytdStart, ytdEnd)).reduce((s, r) => s + r.amount, 0);
  const ytdExpenses = expenseRecs.filter(r => inPeriod(r.expense_date, ytdStart, ytdEnd)).reduce((s, r) => s + r.amount, 0);
  const ytdBalance  = ytdIncome - ytdExpenses;

  // YTD principal: use 'Principal' expense category records first, else estimate from mortgage_rate
  const ytdPrincipalRecs = expenseRecs.filter(r =>
    r.expense_category === 'Principal' && inPeriod(r.expense_date, ytdStart, ytdEnd)
  );
  let ytdPrincipal;
  if (ytdPrincipalRecs.length > 0) {
    ytdPrincipal = ytdPrincipalRecs.reduce((s, r) => s + r.amount, 0);
  } else if (p.mortgage_rate > 0) {
    // Estimate: work backwards month by month from current loan balance
    // For each month in YTD, interest = balance * rate/12; principal = payment - interest
    // We need monthly_payment. Approximate it as constant from current amortization.
    // Without term, we use interest-only as a lower bound and note it's estimated.
    const monthlyRate = p.mortgage_rate / 100 / 12;
    // Months in YTD period (approximate)
    const ytdMonths = Math.round((ytdEnd - ytdStart) / (30.44 * 86400000));
    // Interest-only estimate: avg balance over period ≈ loan_amount + ytdMonths/2 * (principal/mo)
    // Simplified: just use current balance for all months (conservative — slightly overestimates interest → underestimates principal)
    const estMonthlyInterest = p.loan_amount * monthlyRate;
    // Without payment amount, we can only return the interest component; set principal to 0
    // and flag it as unavailable
    ytdPrincipal = null; // cannot compute without monthly_payment
    void estMonthlyInterest; // suppress unused warning
  } else {
    ytdPrincipal = null;
  }

  const ytdNetExp     = ytdPrincipal !== null ? ytdExpenses - ytdPrincipal : null;
  const ytdNetProfit  = ytdNetExp    !== null ? ytdIncome   - ytdNetExp    : null;

  return {
    equity, equityPct, loanPct,
    appreciation, apprPct, yearlyAppr, yearlyApprPct, projectedYearEnd,
    downPmt, totalNetExp, totalNetProfit, totalBalance, roi,
    ytdIncome, ytdExpenses, ytdBalance, ytdPrincipal, ytdNetExp, ytdNetProfit,
  };
};

/**
 * Average monthly income/expenses/cashflow over a trailing window.
 * windowMonths: how many complete months back to look (ignores current partial month).
 * Returns { income, expenses, cashflow } per month.
 */
export const avgMonthly = (incomeRecs, expenseRecs, windowMonths = 3) => {
  const now   = new Date();
  const end   = new Date(now.getFullYear(), now.getMonth(), 1); // start of current month (excluded)
  const start = new Date(end);
  start.setMonth(start.getMonth() - windowMonths);

  const inWindow = (dateStr, field) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt >= start && dt < end;
  };

  const income   = incomeRecs.filter(r  => inWindow(r.income_date)).reduce((s, r) => s + r.amount, 0);
  const expenses = expenseRecs.filter(r => inWindow(r.expense_date)).reduce((s, r) => s + r.amount, 0);
  return {
    income:   windowMonths > 0 ? income   / windowMonths : 0,
    expenses: windowMonths > 0 ? expenses / windowMonths : 0,
    cashflow: windowMonths > 0 ? (income - expenses) / windowMonths : 0,
  };
};

/**
 * Compute the principal portion of each Mortgage expense, working backwards
 * from the current loan balance.
 *
 * Algorithm:
 *   - Sort mortgage payments ascending by date
 *   - Start: balance = property.loan_amount (current balance, after all payments)
 *   - Walk backwards (reverse):
 *       principal[i] = payment[i] - balance * (rate/100/12)
 *       balance_before[i] = balance + principal[i]
 *   - Return array of { expense_id, date, amount (full payment), principal }
 *
 * @param {Array}  mortgageExpenses  expenses filtered to category === 'Mortgage'
 * @param {number} currentLoanBalance  property.loan_amount
 * @param {number} annualRatePct       property.mortgage_rate (e.g. 5.25 for 5.25%)
 * @returns {Array} same expenses enriched with a `principal` field
 */
export const computeMortgagePrincipal = (mortgageExpenses, currentLoanBalance, annualRatePct) => {
  if (!annualRatePct || mortgageExpenses.length === 0) return [];

  const monthlyRate = annualRatePct / 100 / 12;

  // Sort ascending by date so we can walk backwards
  const sorted = [...mortgageExpenses].sort((a, b) =>
    new Date(a.expense_date) - new Date(b.expense_date)
  );

  // Walk backwards: we know the balance AFTER the last payment
  let balance = currentLoanBalance;
  const result = new Array(sorted.length);

  for (let i = sorted.length - 1; i >= 0; i--) {
    const payment   = sorted[i].amount;
    const interest  = balance * monthlyRate;
    const principal = Math.max(0, payment - interest);
    result[i] = { ...sorted[i], principal, interest: Math.min(payment, interest) };
    balance   = balance + principal; // restore balance to before this payment
  }

  return result;
};

/**
 * Compute total principal paid within a date range.
 * Combines explicit 'Principal' expense records + principal portion of 'Mortgage' expenses.
 *
 * @param {Array}  expenseRecs        all expense records for the property/portfolio
 * @param {number} currentLoanBalance property.loan_amount
 * @param {number} annualRatePct      property.mortgage_rate
 * @param {Date}   startDate
 * @param {Date}   endDate
 */
export const principalInRange = (expenseRecs, currentLoanBalance, annualRatePct, startDate, endDate) => {
  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt >= startDate && dt <= endDate;
  };

  // 1. Explicit Principal records
  const explicitPrincipal = expenseRecs
    .filter(r => r.expense_category === 'Principal' && inRange(r.expense_date))
    .reduce((s, r) => s + r.amount, 0);

  // 2. Principal portion of Mortgage records
  const mortgageRecs = expenseRecs.filter(r => r.expense_category === 'Mortgage');
  const withPrincipal = computeMortgagePrincipal(mortgageRecs, currentLoanBalance, annualRatePct);
  const mortgagePrincipal = withPrincipal
    .filter(r => inRange(r.expense_date))
    .reduce((s, r) => s + r.principal, 0);

  return explicitPrincipal + mortgagePrincipal;
};

/**
 * Monthly mortgage payment using the standard amortization formula.
 * Returns 0 if any required param is missing or rate is zero.
 *
 * @param {number} principal     Loan amount
 * @param {number} annualRatePct Annual interest rate, e.g. 5.25 for 5.25%
 * @param {number} amortYears    Amortization period in years
 */
export const calcMortgagePayment = (principal, annualRatePct, amortYears) => {
  if (!principal || !annualRatePct || !amortYears) return 0;
  const r = annualRatePct / 100 / 12;
  const n = amortYears * 12;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
};

/**
 * Compute investment score from key ratios.
 * Returns { score, stars, label, cls }
 *
 * @param {object} p
 *   avgCashFlow    — monthly net cash flow ($)
 *   capRate        — cap rate ratio (0.05 = 5%)
 *   cashOnCash     — cash-on-cash return ratio
 *   expenseRatio   — expenses / rent ratio
 *   ltvRatio       — loan-to-value ratio
 *   yearlyApprRatio — yearly appreciation as fraction of purchase price
 */
export const calcInvestmentScore = ({ avgCashFlow, capRate, cashOnCash, expenseRatio, ltvRatio, yearlyApprRatio }) => {
  let score = 0;

  // CASH FLOW (30 pts)
  if      (avgCashFlow > 1000) score += 30;
  else if (avgCashFlow >  500) score += 24;
  else if (avgCashFlow >  200) score += 18;
  else if (avgCashFlow >    0) score += 12;
  else if (avgCashFlow > -200) score +=  6;

  // CAP RATE (20 pts)
  if      (capRate > 0.08) score += 20;
  else if (capRate > 0.06) score += 16;
  else if (capRate > 0.05) score += 12;
  else if (capRate > 0.04) score +=  8;
  else if (capRate > 0.03) score +=  4;

  // CASH ON CASH (20 pts)
  if      (cashOnCash > 0.12) score += 20;
  else if (cashOnCash > 0.08) score += 16;
  else if (cashOnCash > 0.06) score += 12;
  else if (cashOnCash > 0.04) score +=  8;
  else if (cashOnCash > 0.02) score +=  4;

  // EXPENSE RATIO (15 pts) — lower is better
  if      (expenseRatio < 0.30) score += 15;
  else if (expenseRatio < 0.40) score += 12;
  else if (expenseRatio < 0.50) score +=  8;
  else if (expenseRatio < 0.60) score +=  4;

  // LTV (10 pts) — lower is safer
  if      (ltvRatio < 0.50) score += 10;
  else if (ltvRatio < 0.65) score +=  8;
  else if (ltvRatio < 0.75) score +=  6;
  else if (ltvRatio < 0.85) score +=  3;

  // APPRECIATION (5 pts)
  if      (yearlyApprRatio > 0.10) score += 5;
  else if (yearlyApprRatio > 0.05) score += 3;
  else if (yearlyApprRatio > 0.02) score += 1;

  score = Math.min(100, Math.round(score));

  const fullStars = Math.floor(score / 20);
  const halfStar  = (score % 20) >= 10;
  const stars = '\u2605'.repeat(fullStars)
    + (halfStar ? '\u00bd' : '')
    + '\u2606'.repeat(5 - fullStars - (halfStar ? 1 : 0));

  let label, cls;
  if      (score >= 85) { label = 'Excellent investment';  cls = 'text-success'; }
  else if (score >= 70) { label = 'Healthy property';      cls = 'text-success'; }
  else if (score >= 55) { label = 'Solid property';        cls = 'text-success'; }
  else if (score >= 40) { label = 'Average performance';   cls = 'text-warning'; }
  else if (score >= 25) { label = 'Underperforming';       cls = 'text-warning'; }
  else                  { label = 'Needs attention';       cls = 'text-danger';  }

  return { score, stars, label, cls };
};

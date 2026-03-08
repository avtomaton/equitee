/**
 * metrics.js — All real-estate investment math helpers.
 *
 * Extracted from config.js for clarity. Pure functions only — no React, no API calls.
 * Import from here instead of config.js for all computation-related utilities.
 */

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Years a property has been held (fractional). null if no poss_date. */
export const yearsHeld = (p) => {
  if (!p.poss_date) return null;
  const [y, m, d] = p.poss_date.split('-').map(Number);
  const diff = (Date.now() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return diff > 0 ? diff : null;
};

// ── Window averages ───────────────────────────────────────────────────────────

/**
 * Average monthly income / expenses / cashflow / NOI over a trailing window.
 * windowMonths: how many complete months back to look (ignores current partial month).
 * Returns { income, expenses, cashflow, noi, noiExpenses, mortgage } per month.
 *
 * NOI = income − all operating expenses (excludes Mortgage & Principal).
 * Financing-agnostic: captures what the asset earns before debt service.
 */
export const avgMonthly = (incomeRecs, expenseRecs, windowMonths = 3) => {
  const now   = new Date();
  const end   = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(end);
  start.setMonth(start.getMonth() - windowMonths);

  const inWindow = (dateStr) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt >= start && dt < end;
  };

  const income         = incomeRecs.filter(r => inWindow(r.income_date)).reduce((s, r) => s + r.amount, 0);
  const expenses       = expenseRecs.filter(r => inWindow(r.expense_date)).reduce((s, r) => s + r.amount, 0);
  const noiExpenses    = expenseRecs
    .filter(r => inWindow(r.expense_date) && !['Mortgage', 'Principal'].includes(r.expense_category))
    .reduce((s, r) => s + r.amount, 0);
  const mortgageTotal  = expenseRecs
    .filter(r => inWindow(r.expense_date) && r.expense_category === 'Mortgage')
    .reduce((s, r) => s + r.amount, 0);

  const w = windowMonths > 0 ? windowMonths : 1;
  return {
    income:      income      / w,
    expenses:    expenses    / w,
    cashflow:    (income - expenses)    / w,
    noi:         (income - noiExpenses) / w,
    noiExpenses: noiExpenses / w,
    mortgage:    mortgageTotal / w,
  };
};

// ── Mortgage math ─────────────────────────────────────────────────────────────

/**
 * Monthly mortgage payment using the standard amortization formula.
 * Returns 0 if any required param is missing or rate is zero.
 */
export const calcMortgagePayment = (principal, annualRatePct, amortYears) => {
  if (!principal || !annualRatePct || !amortYears) return 0;
  const r = annualRatePct / 100 / 12;
  const n = amortYears * 12;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
};

/**
 * Compute the principal portion of each Mortgage expense record, walking
 * backwards from the current loan balance.
 */
export const computeMortgagePrincipal = (mortgageExpenses, currentLoanBalance, annualRatePct) => {
  if (!annualRatePct || mortgageExpenses.length === 0) return [];
  const monthlyRate = annualRatePct / 100 / 12;
  const sorted = [...mortgageExpenses].sort((a, b) => new Date(a.expense_date) - new Date(b.expense_date));
  let balance = currentLoanBalance;
  const result = new Array(sorted.length);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const payment   = sorted[i].amount;
    const interest  = balance * monthlyRate;
    const principal = Math.max(0, payment - interest);
    result[i] = { ...sorted[i], principal, interest: Math.min(payment, interest) };
    balance   = balance + principal;
  }
  return result;
};

/**
 * Total principal paid within a date range (explicit Principal records +
 * principal portion of Mortgage records).
 */
export const principalInRange = (expenseRecs, currentLoanBalance, annualRatePct, startDate, endDate) => {
  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt >= startDate && dt <= endDate;
  };
  const explicitPrincipal = expenseRecs
    .filter(r => r.expense_category === 'Principal' && inRange(r.expense_date))
    .reduce((s, r) => s + r.amount, 0);
  const mortgageRecs = expenseRecs.filter(r => r.expense_category === 'Mortgage');
  const withPrincipal = computeMortgagePrincipal(mortgageRecs, currentLoanBalance, annualRatePct);
  const mortgagePrincipal = withPrincipal
    .filter(r => inRange(r.expense_date))
    .reduce((s, r) => s + r.principal, 0);
  return explicitPrincipal + mortgagePrincipal;
};

// ── IRR ───────────────────────────────────────────────────────────────────────

/**
 * Internal Rate of Return using Newton-Raphson iteration.
 *
 * cashFlows[0] is the initial outflow (negative).
 * cashFlows[1..n] are subsequent monthly cash flows.
 *
 * Returns annualised IRR as a decimal (0.12 = 12%), or null on failure.
 * Annualisation: IRR_annual = (1 + r_monthly)^12 − 1.
 *
 * Tolerance is relative to the scale of the largest cash flow, so the
 * function works correctly for both small and large property values.
 */
export const calcIRR = (cashFlows) => {
  if (!cashFlows || cashFlows.length < 2) return null;
  const pos = cashFlows.some(c => c > 0);
  const neg = cashFlows.some(c => c < 0);
  if (!pos || !neg) return null;

  const scale = Math.max(...cashFlows.map(Math.abs)) || 1;

  const npv  = (r) => cashFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  const dnpv = (r) => cashFlows.reduce((s, cf, t) => s - t * cf / Math.pow(1 + r, t + 1), 0);

  let r = 0.01; // 1% monthly ≈ 12%/yr starting guess
  for (let i = 0; i < 500; i++) {
    const f  = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-14) break;
    const rNew = r - f / df;
    if (!isFinite(rNew) || isNaN(rNew)) break;
    if (Math.abs(rNew - r) < 1e-10) { r = rNew; break; }
    r = Math.max(-0.9999, rNew);
  }

  // Relative tolerance: residual NPV must be < 0.5% of the scale of the problem
  if (!isFinite(r) || Math.abs(npv(r)) / scale > 0.005) return null;
  // Reject unrealistic results (< -99% or > 1000%/yr)
  const annual = Math.pow(1 + r, 12) - 1;
  if (annual < -0.99 || annual > 10) return null;
  return annual;
};

/**
 * Build the monthly cash-flow array for IRR computation from historical records.
 *
 *   [0]    = −downPayment  (initial equity outlay at possession date)
 *   [1..n] = monthly net cash flow
 *   [n]   += current equity (terminal value at end of analysis)
 *
 * Returns null if no possession date or fewer than 2 months of history.
 */
export const buildPropertyIRRCashFlows = (property, incomeRecs, expenseRecs) => {
  if (!property.poss_date) return null;
  const [py, pm] = property.poss_date.split('-').map(Number);
  const possDate = new Date(py, pm - 1, 1);
  const now      = new Date();

  const totalMonths =
    (now.getFullYear() - possDate.getFullYear()) * 12 +
    (now.getMonth()    - possDate.getMonth());

  if (totalMonths < 2) return null;

  const monthlyCFs = new Array(totalMonths).fill(0);

  const monthOffset = (dateStr) => {
    if (!dateStr) return -1;
    const [y, m] = dateStr.split('-').map(Number);
    return (y - py) * 12 + (m - 1 - (pm - 1));
  };

  incomeRecs.forEach(r => {
    const off = monthOffset(r.income_date);
    if (off >= 0 && off < totalMonths) monthlyCFs[off] += r.amount;
  });
  expenseRecs.forEach(r => {
    const off = monthOffset(r.expense_date);
    if (off >= 0 && off < totalMonths) monthlyCFs[off] -= r.amount;
  });

  // Add terminal equity to last complete month
  monthlyCFs[totalMonths - 1] += property.market_price - property.loan_amount;

  const downPmt = property.purchase_price - property.loan_amount;
  return [-downPmt, ...monthlyCFs];
};

// ── Mortgage frequency helpers ───────────────────────────────────────────────

/**
 * Convert a property's mortgage_payment + mortgage_frequency to a monthly equivalent.
 *
 * Frequencies:
 *   monthly      → × 1          (12 payments/yr)
 *   semi-monthly → × 2          (24 payments/yr)
 *   bi-weekly    → × 26 / 12    (26 payments/yr)
 *   weekly       → × 52 / 12    (52 payments/yr)
 *
 * Returns 0 if payment or frequency is missing.
 */
export const monthlyMortgageEquiv = (payment, frequency) => {
  if (!payment) return 0;
  const freq = (frequency || 'monthly').toLowerCase().replace(/[^a-z]/g, '');
  switch (freq) {
    case 'semimonthly':  return payment * 2;
    case 'biweekly':     return payment * 26 / 12;
    case 'weekly':       return payment * 52 / 12;
    default:             return payment; // monthly
  }
};

// ── Expected metrics ──────────────────────────────────────────────────────────

/**
 * Compute expected (budgeted) metrics from property cost fields.
 *
 * Uses: expected_condo_fees, expected_insurance, expected_utilities, expected_misc_expenses (all monthly),
 *       annual_property_tax (yearly → /12), expected_appreciation_pct (yearly %),
 *       mortgage_payment + mortgage_frequency → monthly equiv.
 *
 * @param {object} property   — property record from API
 * @param {number} avgMortgage — avg monthly mortgage from actual expense records
 *                               (used when no mortgage_payment field is set)
 * @returns object of expected metrics, or null if no expected cost data is entered
 */
export const calcExpected = (property, avgMortgage = 0) => {
  if (!property.monthly_rent) return null;

  const condo = property.expected_condo_fees    || 0;
  const ins   = property.expected_insurance     || 0;
  const utils = property.expected_utilities     || 0;
  const misc  = property.expected_misc_expenses || 0;
  const tax   = property.annual_property_tax    || 0;

  if (condo + ins + utils + misc + tax === 0) return null;   // no cost data entered yet

  const monthlyOpEx = condo + ins + utils + misc + tax / 12;

  // Use explicit mortgage_payment if entered, else fall back to recorded avg
  const mtg = property.mortgage_payment
    ? monthlyMortgageEquiv(property.mortgage_payment, property.mortgage_frequency)
    : avgMortgage;

  const monthlyNOI      = property.monthly_rent - monthlyOpEx;
  const monthlyCF       = monthlyNOI - mtg;
  const monthlyExpenses = monthlyOpEx + mtg;
  const equity          = property.market_price - property.loan_amount;

  // Expected yearly appreciation (in dollars)
  const apprPct  = property.expected_appreciation_pct || 0;
  const yearlyApprExp   = apprPct > 0 ? property.purchase_price * apprPct / 100 : null;
  const monthlyApprExp  = yearlyApprExp !== null ? yearlyApprExp / 12 : null;
  const monthlyGainExp  = monthlyApprExp !== null ? monthlyCF + monthlyApprExp : null;

  return {
    monthlyOpEx,
    monthlyExpenses,
    monthlyNOI,
    monthlyCF,
    monthlyAppr:  monthlyApprExp,
    monthlyGain:  monthlyGainExp,
    yearlyAppr:   yearlyApprExp,
    apprPct,
    capRate:      property.purchase_price > 0 ? monthlyNOI * 12 / property.purchase_price : null,
    cashOnCash:   equity > 0               ? monthlyCF * 12 / equity : null,
    oer:          property.monthly_rent > 0 ? monthlyOpEx / property.monthly_rent : null,
    dscr:         mtg > 0                  ? monthlyNOI / mtg : null,
    expenseRatio: property.monthly_rent > 0 ? monthlyExpenses / property.monthly_rent : null,
    mortgage:     mtg,
  };
};

// ── Gap coloring helper ───────────────────────────────────────────────────────

/**
 * Determine CSS class and gap description for an actual-vs-expected comparison.
 *
 * Handles edge cases:
 *   - Both values near zero → neutral (no meaningful comparison)
 *   - Sign change (one positive, one negative) → always significant
 *   - Uses relative % for large values, absolute threshold for small values
 *
 * @param {number} actual           — recorded/computed value
 * @param {number} exp              — expected/budgeted value
 * @param {boolean} higherIsBetter  — true for income/NOI/capRate/CoC/DSCR; false for expenses/OER/ratio
 * @param {number} absThreshold     — below this absolute value, differences are negligible (default 25)
 * @param {number} closeRelPct      — within this % = "close" band (default 0.10 = 10%)
 *
 * Returns { cls, gapStr } where cls ∈ ['text-success','text-danger','text-warning','']
 *   text-success = better than expected
 *   text-danger  = worse than expected
 *   text-warning = close (≤ closeRelPct away) — visually neutral-ish
 *   ''           = negligible / both near zero
 */
export const expGapCls = (actual, exp, higherIsBetter = true, absThreshold = 25, closeRelPct = 0.10) => {
  if (exp == null || actual == null) return { cls: '', gapStr: null };

  const scale = Math.max(Math.abs(actual), Math.abs(exp));

  // Both near zero — not meaningful
  if (scale < absThreshold) return { cls: '', gapStr: null };

  // Relative difference (signed: positive = actual > expected)
  const relDiff = (actual - exp) / scale;
  const absDiff = Math.abs(relDiff);

  // Within close band
  if (absDiff <= closeRelPct) return {
    cls: '',
    gapStr: null,
  };

  // Significant gap
  const actualBetter = higherIsBetter ? actual > exp : actual < exp;
  const pctStr = `${(absDiff * 100).toFixed(0)}%`;

  if (actualBetter) return {
    cls: 'text-success',
    gapStr: `▲ ${pctStr} better than expected`,
  };
  return {
    cls: 'text-danger',
    gapStr: `▼ ${pctStr} worse than expected`,
  };
};

/**
 * Build MetricCard {secondary, secondaryCls, tertiary, tertiaryCls} for an expected-vs-actual
 * comparison.  Returns {} when exp is null/undefined so callers can spread safely.
 *
 * colorFn(v) → CSS class for the expected value itself (independent of gap direction)
 * fmtFn(v)   → display string for the expected value
 * hiIsGood   → true when a higher actual is better than expected (income, NOI, cap rate…)
 * absThresh  → absolute scale below which any gap is negligible
 */
export function expGap(actual, exp, colorFn, fmtFn, label = 'Exp:', hiIsGood = true, absThresh = 25) {
  if (exp == null) return {};
  const expCls = colorFn(exp);
  const { cls: gapCls, gapStr } = expGapCls(actual, exp, hiIsGood, absThresh);
  return {
    secondary:    `${label} ${fmtFn(exp)}`,
    secondaryCls: expCls,
    ...(gapStr ? { tertiary: gapStr, tertiaryCls: gapCls } : {}),
  };
}

/** Whole months remaining in the current calendar year (inclusive of current month) */
export const monthsLeftInYear = () => 12 - new Date().getMonth();

/** Fraction of the current calendar year that hasn't elapsed yet (0–1) */
export const yearFracRemaining = () => {
  const now = new Date();
  return (new Date(now.getFullYear() + 1, 0, 1) - now) / (365.25 * 86400000);
};

// ── Investment scoring ────────────────────────────────────────────────────────

/**
 * Compute investment score from key ratios.
 * Returns { score, starsData, label, cls }
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
  const starsData = {
    full:  fullStars,
    half:  halfStar,
    empty: 5 - fullStars - (halfStar ? 1 : 0),
  };

  let label, cls;
  if      (score >= 85) { label = 'Excellent investment';  cls = 'text-success'; }
  else if (score >= 70) { label = 'Healthy property';      cls = 'text-success'; }
  else if (score >= 55) { label = 'Solid property';        cls = 'text-success'; }
  else if (score >= 40) { label = 'Average performance';   cls = 'text-warning'; }
  else if (score >= 25) { label = 'Underperforming';       cls = 'text-warning'; }
  else                  { label = 'Needs attention';       cls = 'text-danger';  }

  return { score, starsData, label, cls };
};

/**
 * Quick health score using only property-record-level data (no separate
 * income/expense records needed). Used everywhere for a consistent score.
 *
 * Uses all-time totals to estimate monthly averages, so the score is
 * identical whether shown on a card, a list row, or a detail page.
 */
export const calcSimpleHealth = (p) => {
  const yrs        = yearsHeld(p);
  const downPmt    = p.purchase_price - p.loan_amount;
  const netExp     = p.total_expenses - downPmt;
  const netProfit  = p.total_income   - netExp;
  const annualCF   = yrs && yrs > 0 ? netProfit / yrs : 0;
  const avgCashFlow = annualCF / 12;

  // Monthly expense estimate — use all-time average vs monthly rent
  const monthlyExpEst    = yrs && yrs > 0 ? p.total_expenses / (yrs * 12) : 0;
  const capRate          = p.purchase_price > 0 ? annualCF / p.purchase_price : 0;
  const equity           = p.market_price - p.loan_amount;
  const cashOnCash       = equity > 0    ? annualCF / equity : 0;
  const ltvRatio         = p.purchase_price > 0 ? p.loan_amount / p.purchase_price : 0;
  const expenseRatio     = p.monthly_rent > 0 ? monthlyExpEst / p.monthly_rent : 0;
  const appr             = p.market_price - p.purchase_price;
  const yearlyApprRatio  = yrs && p.purchase_price > 0 ? (appr / yrs) / p.purchase_price : 0;

  return calcInvestmentScore({ avgCashFlow, capRate, cashOnCash, expenseRatio, ltvRatio, yearlyApprRatio });
};

/**
 * Full metrics computed from property record + optional income/expense arrays.
 * Used in PropertyDetail for the detailed ratio analysis (separate from the score).
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

  const now = new Date();
  const yearFrac = (now - new Date(now.getFullYear(), 0, 1)) / (365.25 * 86400000);
  const projectedYearEnd = yearlyAppr !== null
    ? p.market_price + yearlyAppr * (1 - yearFrac) : null;

  const totalNetExp    = p.total_expenses - downPmt;
  const totalNetProfit = p.total_income - totalNetExp;
  const totalBalance   = p.total_income - p.total_expenses;
  const roi            = p.market_price > 0 ? totalNetProfit / p.market_price * 100 : null;

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

  const ytdPrincipalRecs = expenseRecs.filter(r =>
    r.expense_category === 'Principal' && inPeriod(r.expense_date, ytdStart, ytdEnd)
  );
  let ytdPrincipal;
  if (ytdPrincipalRecs.length > 0) {
    ytdPrincipal = ytdPrincipalRecs.reduce((s, r) => s + r.amount, 0);
  } else {
    ytdPrincipal = null;
  }

  const ytdNetExp    = ytdPrincipal !== null ? ytdExpenses - ytdPrincipal : null;
  const ytdNetProfit = ytdNetExp    !== null ? ytdIncome   - ytdNetExp    : null;

  return {
    equity, equityPct, loanPct,
    appreciation, apprPct, yearlyAppr, yearlyApprPct, projectedYearEnd,
    downPmt, totalNetExp, totalNetProfit, totalBalance, roi,
    ytdIncome, ytdExpenses, ytdBalance, ytdPrincipal, ytdNetExp, ytdNetProfit,
  };
};

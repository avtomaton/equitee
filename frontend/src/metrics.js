import { fmt, fmtPeriod } from './utils.js';

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
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);

  // windowMonths === 0 means all-time
  const allTime = windowMonths === 0;
  const start = allTime ? null : (() => {
    const s = new Date(end); s.setMonth(s.getMonth() - windowMonths); return s;
  })();

  const inWindow = (dateStr) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return (allTime || dt >= start) && dt < end;
  };

  const income        = incomeRecs.filter(r => inWindow(r.income_date)).reduce((s, r) => s + r.amount, 0);
  const expenses      = expenseRecs.filter(r => inWindow(r.expense_date)).reduce((s, r) => s + r.amount, 0);
  const noiExpenses   = expenseRecs
    .filter(r => inWindow(r.expense_date) && !['Mortgage', 'Principal'].includes(r.expense_category))
    .reduce((s, r) => s + r.amount, 0);
  const mortgageTotal = expenseRecs
    .filter(r => inWindow(r.expense_date) && r.expense_category === 'Mortgage')
    .reduce((s, r) => s + r.amount, 0);

  // Divisor: window months, or span from earliest record to now for all-time
  let w = windowMonths > 0 ? windowMonths : 1;
  if (allTime) {
    const dates = [
      ...incomeRecs.map(r => r.income_date),
      ...expenseRecs.map(r => r.expense_date),
    ].filter(Boolean).sort();
    if (dates.length) {
      const [y, m] = dates[0].split('-').map(Number);
      const earliest = new Date(y, m - 1, 1);
      w = Math.max(1, Math.round((end - earliest) / (1000 * 60 * 60 * 24 * 30.44)));
    }
  }

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
 * Handles 0% interest rate case (simple division).
 */
export const calcMortgagePayment = (principal, annualRatePct, amortYears) => {
  if (!principal || !amortYears) return 0;
  const n = amortYears * 12;
  if (!annualRatePct || annualRatePct === 0) return principal / n;
  const r = annualRatePct / 100 / 12;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
};

/**
 * Extract mortgage rate change history from events, returning a sorted array of
 * { date: 'YYYY-MM-DD', rate: number } objects for use in rate-aware calculations.
 * Uses created_at as the event date (editable by the user in EventsView).
 */
export const extractRateHistory = (events = []) =>
  events
    .filter(e => e.column_name === 'mortgage_rate' && e.new_value)
    .map(e => {
      const raw     = (e.created_at ?? '').split('T')[0].split(' ')[0];
      const rate    = parseFloat(e.new_value);
      const oldRate = parseFloat(e.old_value || '0');
      return { date: raw, rate, oldRate };
    })
    .filter(e => e.date && e.rate > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

/**
 * Return the mortgage rate (%) that was in effect on dateStr, given a sorted
 * rateHistory array and the current (latest) fallback rate.
 * The most recent history entry whose date <= dateStr wins; if none, returns fallbackRate.
 */
const rateAtDate = (dateStr, rateHistory, fallbackRate) => {
  if (!rateHistory || rateHistory.length === 0) return fallbackRate;
  let rate = fallbackRate;
  for (const ev of rateHistory) {
    if (ev.date <= dateStr) rate = ev.rate;
    else break;
  }
  return rate;
};

export const computeMortgagePrincipal = (
  mortgageExpenses,
  currentLoanBalance,
  annualRatePct,
  rateHistory = []
) => {
  if (!annualRatePct || mortgageExpenses.length === 0) return [];

  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  // Sort ascending (oldest → newest)
  const sorted = [...mortgageExpenses].sort(
    (a, b) => new Date(a.expense_date) - new Date(b.expense_date)
  );

  // Pre-history rate: what was in effect before any recorded rate-change event.
  // The earliest event's old_value is the original rate; fall back to the
  // current annualRatePct only if no history exists (rate never changed).
  const preHistoryRate =
    rateHistory.length > 0 && rateHistory[0].oldRate > 0
      ? rateHistory[0].oldRate
      : annualRatePct;

  // Walk backwards. balanceAfter starts as currentLoanBalance (balance
  // after the last payment we have on record).
  let balanceAfter = currentLoanBalance;
  const results = new Array(sorted.length);

  for (let i = sorted.length - 1; i >= 0; i--) {
    const payment = sorted[i].amount;
    const days =
      i === 0
        ? 30 // no prior payment date available; assume ~1 month
        : Math.max(
            1,
            Math.floor(
              (new Date(sorted[i].expense_date) - new Date(sorted[i - 1].expense_date)) /
                MS_PER_DAY
            )
          );

    // Interest accrues during the period BEFORE this payment, so look up
    // the rate that was in effect at the START of that period, not at the
    // payment date.  For i=0 we pass '0000-01-01' which will always be
    // before any event → returns preHistoryRate correctly.
    const periodStart = i > 0 ? sorted[i - 1].expense_date : '0000-01-01';
    const ratePct     = rateAtDate(periodStart, rateHistory, preHistoryRate);
    const dailyRate   = ratePct / 100 / 365;
    const balanceBefore = (balanceAfter + payment) / (1 + dailyRate * days);
    const interest      = balanceBefore * dailyRate * days;
    const principal     = Math.max(0, payment - interest);

    results[i] = {
      ...sorted[i],
      days,
      interest,
      principal,
      balance_before: balanceBefore,
      balance_after:  balanceAfter,
    };

    // Move one step further back
    balanceAfter = balanceBefore;
  }

  return results;
};

/**
 * Total principal paid within a date range (explicit Principal records +
 * principal portion of Mortgage records).
 */
export const principalInRange = (expenseRecs, currentLoanBalance, annualRatePct, startDate, endDate, rateHistory = []) => {
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
  const withPrincipal = computeMortgagePrincipal(mortgageRecs, currentLoanBalance, annualRatePct, rateHistory);
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

// ── Payback & break-even ──────────────────────────────────────────────────────

/**
 * How long until all recorded expenses are recovered by cash flow.
 *
 * outstanding = total_expenses − total_income (amount still to recover)
 * avgCashflow = avg monthly cash flow
 *
 * Returns { label, cls } — ready to spread into a MetricCard.
 */
export const calcPayback = (outstanding, avgCashflow) => {
  if (avgCashflow <= 0) return { primary: '∞ (no CF)', primaryCls: 'text-danger' };
  if (outstanding <= 0) return { primary: 'Recovered', primaryCls: 'text-success' };
  const months = outstanding / avgCashflow;
  return {
    primary:    fmtPeriod(months),
    primaryCls: months < 36 ? 'text-success' : months < 84 ? '' : 'text-danger',
  };
};

/**
 * How long until net position (market + income − expenses − loan) reaches zero.
 *
 * netPos       = current net position (negative means still in the hole)
 * monthlyGain  = avg cash flow + monthly appreciation
 *
 * Returns { label, cls } — ready to spread into a MetricCard.
 */
export const calcBreakEven = (netPos, monthlyGain) => {
  if (netPos >= 0)      return { primary: 'Reached',       primaryCls: 'text-success' };
  if (monthlyGain <= 0) return { primary: '∞ (no growth)', primaryCls: 'text-danger'  };
  const months = -netPos / monthlyGain;
  return {
    primary:    fmtPeriod(months),
    primaryCls: months < 36 ? 'text-success' : months < 84 ? '' : 'text-danger',
  };
};

// ── Property analysis ─────────────────────────────────────────────────────────

/**
 * Generate a ranked list of insight items for a single property.
 *
 * @param {object}   property    — full property record
 * @param {object[]} incomeRecs  — income records (for last-income-date check)
 * @param {object}   m           — pre-computed metrics from PropertyDetail
 * @returns {Array<{isPrimary?, icon, cls, label, detail}>}
 */
export const analyzeProperty = (property, incomeRecs, m) => {
  const {
    avgCashflow, yearlyAppr, monthlyAppr, monthlyGain, sellingProfit,
    monthlyRent, capRate, expenseRatio, ltvRatio, equity, cashOnCash, yearlyApprRatio,
  } = m;

  const items  = [];
  const isRnt  = (property.status || '').toLowerCase() === 'rented';
  const noData = property.total_income === 0 && property.total_expenses === 0;

  // ── Primary status ────────────────────────────────────────────────────────
  if (noData) {
    items.push({ isPrimary: true, icon: '🆕', cls: 'text-secondary', label: 'No data yet',
      detail: 'No income or expenses have been recorded. Add transactions to start tracking performance.' });

  } else if (!isRnt) {
    const lastInc   = [...incomeRecs].sort((a, b) => new Date(b.income_date) - new Date(a.income_date))[0];
    const daysSince = lastInc ? (Date.now() - new Date(lastInc.income_date)) / 86400000 : Infinity;
    if (!isFinite(daysSince)) {
      items.push({ isPrimary: true, icon: '🏠', cls: 'text-danger', label: 'Vacant — no income recorded',
        detail: 'Property is vacant and no income has ever been recorded.' });
    } else if (daysSince > 30) {
      items.push({ isPrimary: true, icon: '⚠️', cls: 'text-danger', label: `Vacant ${Math.round(daysSince)} days`,
        detail: `Last income was ${Math.round(daysSince)} days ago. Extended vacancy is eroding your returns.` });
    } else {
      items.push({ isPrimary: true, icon: '🔄', cls: 'text-warning', label: 'Recently vacated',
        detail: `Property became vacant ${Math.round(daysSince)} days ago. Short vacancies are normal between tenants.` });
    }

  } else if (avgCashflow < 0 && yearlyAppr !== null && yearlyAppr < 0) {
    items.push({ isPrimary: true, icon: '🚨', cls: 'text-danger', label: 'Losing on all fronts',
      detail: `Cash flow is ${fmt(avgCashflow)}/mo and the property is depreciating ${fmt(yearlyAppr)}/yr. Strong case to sell.` });

  } else if (avgCashflow < 0 && yearlyAppr !== null && yearlyAppr > 0) {
    items.push({ isPrimary: true, icon: '⚖️', cls: monthlyGain >= 0 ? 'text-warning' : 'text-danger',
      label: monthlyGain >= 0 ? 'Appreciation covers the gap' : 'Negative cash flow, appreciation insufficient',
      detail: monthlyGain >= 0
        ? `Cash is consumed at ${fmt(Math.abs(avgCashflow))}/mo but appreciation (${fmt(yearlyAppr)}/yr) more than compensates. Monthly gain: ${fmt(monthlyGain)}/mo.`
        : `Cash is consumed at ${fmt(Math.abs(avgCashflow))}/mo. Appreciation only partially offsets this. Net monthly loss: ${fmt(monthlyGain)}/mo.` });

  } else if (avgCashflow < 0) {
    items.push({ isPrimary: true, icon: '📉', cls: 'text-danger', label: 'Negative cash flow',
      detail: `Expenses exceed income by ${fmt(Math.abs(avgCashflow))}/mo.` });

  } else if (avgCashflow === 0 && monthlyGain > 0) {
    items.push({ isPrimary: true, icon: '📈', cls: 'text-success', label: 'Breakeven — appreciation-led',
      detail: `Cash flow is exactly neutral, but appreciation adds ${fmt(monthlyGain)}/mo in total gain.` });

  } else if (sellingProfit >= 0 && avgCashflow > 0 && sellingProfit / avgCashflow < 12) {
    items.push({ isPrimary: true, icon: '⭐', cls: 'text-success', label: 'Exceptional yield',
      detail: `Cash flow of ${fmt(avgCashflow)}/mo recovers the entire Net Position in ${Math.round(sellingProfit / avgCashflow)} months.` });

  } else if (monthlyRent > 0 && avgCashflow > 0 && sellingProfit < property.market_price * 0.05) {
    items.push({ isPrimary: true, icon: '🐄', cls: 'text-success', label: 'Golden cow — keep',
      detail: `Strong cash flow (${fmt(avgCashflow)}/mo) but selling today nets only ${fmt(sellingProfit)}.` });

  } else if (sellingProfit > property.market_price * 0.15 && monthlyGain < property.market_price * 0.003) {
    items.push({ isPrimary: true, icon: '💡', cls: 'text-warning', label: 'Consider selling',
      detail: `Unrealized gain of ${fmt(sellingProfit)} is significant, but monthly gain is only ${fmt(monthlyGain)}/mo.` });

  } else if (yearlyAppr !== null && yearlyAppr > 0 && avgCashflow > 0) {
    items.push({ isPrimary: true, icon: '🚀', cls: 'text-success', label: 'Strong performer',
      detail: `Cash flow ${fmt(avgCashflow)}/mo, appreciation ${fmt(yearlyAppr)}/yr, monthly gain ${fmt(monthlyGain)}/mo.` });

  } else if (avgCashflow > 0) {
    items.push({ isPrimary: true, icon: '✅', cls: 'text-success', label: 'Positive cash flow',
      detail: `Generating ${fmt(avgCashflow)}/mo.${yearlyAppr !== null ? ` Appreciation ${fmt(yearlyAppr)}/yr adds ${fmt(monthlyAppr)}/mo.` : ' Set a possession date to compute appreciation.'}` });

  } else {
    items.push({ isPrimary: true, icon: '➖', cls: 'text-warning', label: 'Breakeven — flat',
      detail: 'Cash flow is zero and no meaningful appreciation. Property is treading water.' });
  }

  // ── Secondary advisories ──────────────────────────────────────────────────
  if (monthlyRent > 0 && capRate < 0.05) {
    const delta = Math.round(property.market_price * 0.06 / 12) - monthlyRent;
    if (delta > 0) items.push({ icon: '📈', cls: 'text-warning', label: 'Low cap rate',
      detail: `Cap rate of ${(capRate * 100).toFixed(1)}% is below 5%. Raising rent by ~$${delta}/mo would push it toward 6%.` });
  }
  if (monthlyRent > 0 && expenseRatio > 0.45) {
    items.push({ icon: '💸', cls: 'text-danger', label: 'High expense ratio',
      detail: `Expenses are ${(expenseRatio * 100).toFixed(0)}% of rent. Healthy properties typically sit below 40%.` });
  }
  if (ltvRatio > 0.80 && property.loan_amount > 0) {
    items.push({ icon: '⚡', cls: 'text-danger', label: 'High leverage risk',
      detail: `LTV of ${(ltvRatio * 100).toFixed(0)}% means only ${(100 - ltvRatio * 100).toFixed(0)}% equity cushion.` });
  }
  if (ltvRatio > 0 && ltvRatio < 0.55 && equity > 50000) {
    items.push({ icon: '🏦', cls: 'text-success', label: 'Refinancing opportunity',
      detail: `LTV of ${(ltvRatio * 100).toFixed(0)}% — ${fmt(equity)} in equity. A cash-out refinance could fund another investment.` });
  }
  if (yearlyAppr !== null && yearlyApprRatio > 0.08) {
    items.push({ icon: '💎', cls: 'text-success', label: 'Strong appreciation',
      detail: `Appreciating at ${(yearlyApprRatio * 100).toFixed(1)}%/yr (${fmt(yearlyAppr)}/yr).` });
  }
  if (yearlyAppr !== null && yearlyApprRatio < 0.02 && capRate < 0.04 && property.total_income > 0) {
    items.push({ icon: '🔻', cls: 'text-danger', label: 'Low yield & low growth',
      detail: `Cap rate ${(capRate * 100).toFixed(1)}% and appreciation ${(yearlyApprRatio * 100).toFixed(1)}%/yr are both weak.` });
  }
  if (cashOnCash > 0 && cashOnCash < 0.03 && avgCashflow > 0) {
    items.push({ icon: '🔑', cls: 'text-warning', label: 'Low capital efficiency',
      detail: `Cash-on-cash return of ${(cashOnCash * 100).toFixed(1)}% means your equity is barely working. Target is typically 6–8%+.` });
  }

  return items;
};

// ── Economic vacancy ───────────────────────────────────────────────────────────

/**
 * Calculate event-based economic vacancy for a property.
 *
 * Uses status-change events to find real vacancy periods, and
 * monthly_rent-change events to determine the rent in effect at each point.
 *
 * Returns the vacancy percentage (0–100), or null if it cannot be computed.
 *
 * @param {object}   property    – property record (needs .status, .monthly_rent)
 * @param {object[]} allEvents   – all events for this property (column_name, old_value, new_value, created_at)
 * @param {Date}     windowStart – start of measurement window (default: trailing 12 months)
 * @param {Date}     windowEnd   – end of measurement window   (default: now)
 */
export function calcEconVacancy(property, allEvents, windowStart, windowEnd) {
  if (!property) return null;

  // ── Rent timeline ───────────────────────────────────────────────────────────
  // Build a sorted list of rent-change events so we can answer "what was the
  // monthly rent on date D?" without relying on actual income records.
  const rentChanges = allEvents
    .filter(e => e.column_name === 'monthly_rent')
    .map(e => ({
      date:     new Date(e.created_at),
      oldRent:  parseFloat(e.old_value) || 0,
      newRent:  parseFloat(e.new_value) || 0,
    }))
    .sort((a, b) => a.date - b.date);

  /** Monthly rent in effect at (or just before) the given Date. */
  const getRentAt = (date) => {
    if (rentChanges.length === 0) return property.monthly_rent;
    // Before the first recorded change → use old_value of that first event
    if (date < rentChanges[0].date) return rentChanges[0].oldRent || property.monthly_rent;
    // Walk backwards to find the most recent change at or before `date`
    for (let i = rentChanges.length - 1; i >= 0; i--) {
      if (date >= rentChanges[i].date) return rentChanges[i].newRent || property.monthly_rent;
    }
    return property.monthly_rent;
  };

  // ── Effective window start ─────────────────────────────────────────────────
  // Potential rent should only be counted from when we owned the property.
  // If possession date falls inside the measurement window, use it as the
  // start; otherwise the whole window applies.
  const possDate = property.poss_date ? new Date(property.poss_date) : null;
  const effectiveStart = (possDate && possDate > windowStart) ? possDate : windowStart;
  // vacancyOrigin: earliest date the property could have been vacant (same anchor)
  const vacancyOrigin  = effectiveStart;

  // ── Potential rent for the window ──────────────────────────────────────────
  // Split from effectiveStart at every rent-change breakpoint to honour
  // time-varying rent. Segments before possession are excluded.
  const breakpoints = [
    effectiveStart,
    ...rentChanges.map(r => r.date).filter(d => d > effectiveStart && d < windowEnd),
    windowEnd,
  ];
  let potentialRent = 0;
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const segDays = (breakpoints[i + 1] - breakpoints[i]) / 86_400_000;
    potentialRent += (segDays / 30.4375) * getRentAt(breakpoints[i]);
  }
  if (potentialRent <= 0) return null;

  // ── Vacancy periods ─────────────────────────────────────────────────────────
  const statusChanges = allEvents
    .filter(e => e.column_name === 'status')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // vacancyOrigin is already defined above (= effectiveStart = max(possDate, windowStart))

  const periods = [];
  let vacStart = null;

  for (const e of statusChanges) {
    const d = new Date(e.created_at);
    if (e.new_value === 'Vacant') {
      // Explicit transition into vacancy — record the start.
      vacStart = d;
    } else if (e.old_value === 'Vacant') {
      // Transition out of vacancy. If vacStart is null we never saw the preceding
      // →Vacant event, which means the property was vacant from before our event
      // history began (e.g. vacant from purchase date).
      periods.push({ start: vacStart ?? vacancyOrigin, end: d });
      vacStart = null;
    }
  }

  // Open-ended period if the property is currently vacant.
  if (property.status === 'Vacant') {
    periods.push({ start: vacStart ?? vacancyOrigin, end: windowEnd });
  }

  // No status events at all and not currently vacant → assume fully occupied.
  if (periods.length === 0) return 0;

  // ── Lost rent ──────────────────────────────────────────────────────────────
  let lostRent = 0;
  for (const vp of periods) {
    const start = new Date(Math.max(vp.start.getTime(), effectiveStart.getTime()));
    const end   = new Date(Math.min(vp.end.getTime(),   windowEnd.getTime()));
    if (end <= start) continue;
    const vacDays = (end - start) / 86_400_000;
    const rent    = getRentAt(start);
    if (rent > 0) lostRent += (vacDays / 30.4375) * rent;
  }

  return Math.min((lostRent / potentialRent) * 100, 100);
}

/**
 * Sum of annual interest charges across a list of properties.
 * Returns 0 if no property has both a loan balance and a mortgage rate.
 */
export const calcPortfolioInterest = (properties) =>
  properties.reduce((sum, p) =>
    p.loan_amount > 0 && p.mortgage_rate > 0
      ? sum + p.loan_amount * p.mortgage_rate / 100
      : sum, 0);

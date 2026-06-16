import { fmt, fmtPeriod } from './utils';

/**
 * metrics.ts — All real-estate investment math helpers.
 *
 * Extracted from config.js for clarity. Pure functions only — no React, no API calls.
 * Import from here instead of config.js for all computation-related utilities.
 */

// ── Type helpers ──────────────────────────────────────────────────────────────

export interface AvgMonthlyResult {
  income: number;
  expenses: number;
  cashflow: number;
  noi: number;
  noiExpenses: number;
  mortgage: number;
}

interface RateHistoryEntry {
  date: string;
  rate: number;
  oldRate: number;
}

interface ExpectedMetrics {
  monthlyOpEx: number;
  monthlyExpenses: number;
  monthlyNOI: number;
  monthlyCF: number;
  monthlyAppr: number | null;
  monthlyGain: number | null;
  yearlyAppr: number | null;
  apprPct: number;
  capRate: number | null;
  cashOnCash: number | null;
  oer: number | null;
  dscr: number | null;
  expenseRatio: number | null;
  mortgage: number;
}

interface ExpGapResult {
  cls: string;
  gapStr: string | null;
}

interface ExpGapCardResult {
  secondary?: string;
  secondaryCls?: string;
  tertiary?: string;
  tertiaryCls?: string;
}

interface InvestmentScore {
  score: number;
  starsData: { full: number; half: boolean; empty: number };
  label: string;
  cls: string;
}

interface PaybackResult {
  primary: string;
  primaryCls: string;
}

interface PropertyMetrics {
  avgCashflow: number;
  yearlyAppr: number | null;
  monthlyAppr: number | null;
  monthlyGain: number | null;
  sellingProfit: number;
  monthlyRent: number;
  capRate: number | null;
  expenseRatio: number | null;
  ltvRatio: number;
  equity: number;
  cashOnCash: number | null;
  yearlyApprRatio: number;
}

interface AnalysisItem {
  isPrimary?: boolean;
  icon: string;
  cls: string;
  label: string;
  detail: string;
}

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Years a property has been held (fractional). null if no poss_date. */
export const yearsHeld = (p: { poss_date?: string }): number | null => {
  if (!p.poss_date) return null;
  const [y, m, d] = p.poss_date.split('-').map(Number);
  const diff = (Date.now() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return diff > 0 ? diff : null;
};

// ── Window averages ───────────────────────────────────────────────────────────

/**
 * Average monthly income / expenses / cashflow / NOI over a trailing window.
 */
export const avgMonthly = (
  incomeRecs: Array<{ income_date: string; amount: number }>,
  expenseRecs: Array<{ expense_date: string; amount: number; expense_category?: string }>,
  windowMonths: number = 3,
): AvgMonthlyResult => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);

  const allTime = windowMonths === 0;
  const start: Date | null = allTime ? null : (() => {
    const s = new Date(end); s.setMonth(s.getMonth() - windowMonths); return s;
  })();

  const inWindow = (dateStr: string | undefined): boolean => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return (allTime || (start !== null && dt >= start)) && dt < end;
  };

  const income        = incomeRecs.filter(r => inWindow(r.income_date)).reduce((s, r) => s + r.amount, 0);
  const expenses      = expenseRecs.filter(r => inWindow(r.expense_date)).reduce((s, r) => s + r.amount, 0);
  const noiExpenses   = expenseRecs
    .filter(r => inWindow(r.expense_date) && !['Mortgage', 'Principal'].includes(r.expense_category ?? ''))
    .reduce((s, r) => s + r.amount, 0);
  const mortgageTotal = expenseRecs
    .filter(r => inWindow(r.expense_date) && r.expense_category === 'Mortgage')
    .reduce((s, r) => s + r.amount, 0);

  let w = windowMonths > 0 ? windowMonths : 1;
  if (allTime) {
    const dates = [
      ...incomeRecs.map(r => r.income_date),
      ...expenseRecs.map(r => r.expense_date),
    ].filter(Boolean).sort();
    if (dates.length) {
      const [y, m] = dates[0].split('-').map(Number);
      const earliest = new Date(y, m - 1, 1);
      w = Math.max(1, Math.round((end.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
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

/** Monthly mortgage payment using the standard amortization formula. */
export const calcMortgagePayment = (principal: number, annualRatePct: number, amortYears: number): number => {
  if (!principal || !amortYears) return 0;
  const n = amortYears * 12;
  if (!annualRatePct || annualRatePct === 0) return principal / n;
  const r = annualRatePct / 100 / 12;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
};

/** Extract mortgage rate change history from events. */
export const extractRateHistory = (events: Array<{ column_name?: string; new_value?: string | number | null; old_value?: string | number | null; created_at?: string }> = []): RateHistoryEntry[] =>
  events
    .filter(e => e.column_name === 'mortgage_rate' && e.new_value)
    .map(e => {
      const raw     = (e.created_at ?? '').split('T')[0].split(' ')[0];
      const rate    = parseFloat(String(e.new_value));
      const oldRate = parseFloat(String(e.old_value || '0'));
      return { date: raw, rate, oldRate };
    })
    .filter(e => e.date && e.rate > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

/** Return the mortgage rate (%) that was in effect on dateStr. */
const rateAtDate = (dateStr: string, rateHistory: RateHistoryEntry[], fallbackRate: number): number => {
  if (!rateHistory || rateHistory.length === 0) return fallbackRate;
  let rate = fallbackRate;
  for (const ev of rateHistory) {
    if (ev.date <= dateStr) rate = ev.rate;
    else break;
  }
  return rate;
};

export const computeMortgagePrincipal = (
  mortgageExpenses: Array<{ amount: number; expense_date: string; [key: string]: unknown }>,
  currentLoanBalance: number,
  annualRatePct: number,
  rateHistory: RateHistoryEntry[] = [],
): Array<{ amount: number; expense_date: string; [key: string]: unknown } & { days: number; interest: number; principal: number; balance_before: number; balance_after: number }> => {
  if (!annualRatePct || mortgageExpenses.length === 0) return [];

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const AVG_DAYS_PER_MONTH = 365.25 / 12;

  const sorted = [...mortgageExpenses].sort(
    (a, b) => new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime()
  );

  const preHistoryRate =
    rateHistory.length > 0 && rateHistory[0].oldRate > 0
      ? rateHistory[0].oldRate
      : annualRatePct;

  let balanceAfter = currentLoanBalance;
  const results: Array<{ amount: number; expense_date: string; [key: string]: unknown } & { days: number; interest: number; principal: number; balance_before: number; balance_after: number }> = new Array(sorted.length);

  for (let i = sorted.length - 1; i >= 0; i--) {
    const payment = sorted[i].amount;
    const days =
      i === 0
        ? AVG_DAYS_PER_MONTH
        : Math.max(
            1,
            Math.round(
              (new Date(sorted[i].expense_date).getTime() - new Date(sorted[i - 1].expense_date).getTime()) /
                MS_PER_DAY
            )
          );

    const periodStart = i > 0 ? sorted[i - 1].expense_date : '0000-01-01';
    const ratePct     = rateAtDate(periodStart, rateHistory, preHistoryRate);
    const dailyRate   = ratePct / 100 / 365.25;
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

    balanceAfter = balanceBefore;
  }

  return results;
};

/** Total principal paid within a date range. */
export const principalInRange = (
  expenseRecs: Array<{ expense_category?: string; expense_date: string; amount: number }>,
  currentLoanBalance: number,
  annualRatePct: number,
  startDate: Date,
  endDate: Date,
  rateHistory: RateHistoryEntry[] = [],
): number => {
  const inRange = (dateStr: string | undefined): boolean => {
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

/** Internal Rate of Return using Newton-Raphson iteration. */
export const calcIRR = (cashFlows: number[]): number | null => {
  if (!cashFlows || cashFlows.length < 2) return null;
  const pos = cashFlows.some(c => c > 0);
  const neg = cashFlows.some(c => c < 0);
  if (!pos || !neg) return null;

  const scale = Math.max(...cashFlows.map(Math.abs)) || 1;

  const npv  = (r: number) => cashFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  const dnpv = (r: number) => cashFlows.reduce((s, cf, t) => s - t * cf / Math.pow(1 + r, t + 1), 0);

  let r = 0.01;
  for (let i = 0; i < 500; i++) {
    const f  = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-14) break;
    const rNew = r - f / df;
    if (!isFinite(rNew) || isNaN(rNew)) break;
    if (Math.abs(rNew - r) < 1e-10) { r = rNew; break; }
    r = Math.max(-0.9999, rNew);
  }

  if (!isFinite(r) || Math.abs(npv(r)) / scale > 0.005) return null;
  const annual = Math.pow(1 + r, 12) - 1;
  if (annual < -0.99 || annual > 10) return null;
  return annual;
};

/** Build the monthly cash-flow array for IRR computation from historical records. */
export const buildPropertyIRRCashFlows = (
  property: { poss_date?: string; monthly_rent: number; market_price: number; loan_amount: number; purchase_price: number },
  incomeRecs: Array<{ income_date: string; amount: number }>,
  expenseRecs: Array<{ expense_date: string; amount: number }>,
): number[] | null => {
  if (!property.poss_date) return null;
  const [py, pm] = property.poss_date.split('-').map(Number);
  const possDate = new Date(py, pm - 1, 1);
  const now      = new Date();

  const totalMonths =
    (now.getFullYear() - possDate.getFullYear()) * 12 +
    (now.getMonth()    - possDate.getMonth());

  if (totalMonths < 2) return null;

  const monthlyCFs = new Array(totalMonths).fill(0);

  const monthOffset = (dateStr: string | undefined): number => {
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

  monthlyCFs[totalMonths - 1] += property.market_price - property.loan_amount;

  const downPmt = property.purchase_price - property.loan_amount;
  return [-downPmt, ...monthlyCFs];
};

// ── Mortgage frequency helpers ───────────────────────────────────────────────

/** Convert a property's mortgage_payment + mortgage_frequency to a monthly equivalent. */
export const monthlyMortgageEquiv = (payment: number | null, frequency?: string): number => {
  if (!payment) return 0;
  const freq = (frequency || 'monthly').toLowerCase().replace(/[^a-z]/g, '');
  switch (freq) {
    case 'semimonthly':  return payment * 2;
    case 'biweekly':     return payment * 26 / 12;
    case 'weekly':       return payment * 52 / 12;
    default:             return payment;
  }
};

// ── Expected metrics ──────────────────────────────────────────────────────────

/** Compute expected (budgeted) metrics from property cost fields. */
export const calcExpected = (property: Record<string, unknown>, avgMortgage: number = 0): ExpectedMetrics | null => {
  const monthlyRent = property.monthly_rent as number;
  if (!monthlyRent) return null;

  const condo = (property.expected_condo_fees as number)    || 0;
  const ins   = (property.expected_insurance as number)     || 0;
  const utils = (property.expected_utilities as number)     || 0;
  const misc  = (property.expected_misc_expenses as number) || 0;
  const tax   = (property.annual_property_tax as number)    || 0;

  if (condo + ins + utils + misc + tax === 0) return null;

  const monthlyOpEx = condo + ins + utils + misc + tax / 12;

  const mortgagePayment = property.mortgage_payment as number | undefined;
  const mortgageFreq = property.mortgage_frequency as string | undefined;
  const mtg = mortgagePayment
    ? monthlyMortgageEquiv(mortgagePayment, mortgageFreq)
    : avgMortgage;

  const monthlyNOI      = monthlyRent - monthlyOpEx;
  const monthlyCF       = monthlyNOI - mtg;
  const monthlyExpenses = monthlyOpEx + mtg;
  const equity          = (property.market_price as number) - (property.loan_amount as number);

  const apprPct  = (property.expected_appreciation_pct as number) || 0;
  const purchasePrice = property.purchase_price as number;
  const yearlyApprExp   = apprPct > 0 ? purchasePrice * apprPct / 100 : null;
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
    capRate:      purchasePrice > 0 ? monthlyNOI * 12 / purchasePrice : null,
    cashOnCash:   equity > 0               ? monthlyCF * 12 / equity : null,
    oer:          monthlyRent > 0 ? monthlyOpEx / monthlyRent : null,
    dscr:         mtg > 0                  ? monthlyNOI / mtg : null,
    expenseRatio: monthlyRent > 0 ? monthlyExpenses / monthlyRent : null,
    mortgage:     mtg,
  };
};

// ── Gap coloring helper ───────────────────────────────────────────────────────

/** Determine CSS class and gap description for an actual-vs-expected comparison. */
export const expGapCls = (
  actual: number,
  exp: number,
  higherIsBetter: boolean = true,
  absThreshold: number = 25,
  closeRelPct: number = 0.10,
): ExpGapResult => {
  if (exp == null || actual == null) return { cls: '', gapStr: null };

  const scale = Math.max(Math.abs(actual), Math.abs(exp));

  if (scale < absThreshold) return { cls: '', gapStr: null };

  const relDiff = (actual - exp) / scale;
  const absDiff = Math.abs(relDiff);

  if (absDiff <= closeRelPct) return { cls: '', gapStr: null };

  const actualBetter = higherIsBetter ? actual > exp : actual < exp;
  const pctStr = `${(absDiff * 100).toFixed(0)}%`;

  if (actualBetter) return { cls: 'text-success', gapStr: `▲ ${pctStr} better than expected` };
  return { cls: 'text-danger', gapStr: `▼ ${pctStr} worse than expected` };
};

/** Build MetricCard props for an expected-vs-actual comparison. */
export function expGap(
  actual: number,
  exp: number | null,
  colorFn: (v: number) => string,
  fmtFn: (v: number) => string,
  label: string = 'Exp:',
  hiIsGood: boolean = true,
  absThresh: number = 25,
): ExpGapCardResult {
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
export const monthsLeftInYear = (): number => 12 - new Date().getMonth();

/** Fraction of the current calendar year that hasn't elapsed yet (0–1) */
export const yearFracRemaining = (): number => {
  const now = new Date();
  return (new Date(now.getFullYear() + 1, 0, 1).getTime() - now.getTime()) / (365.25 * 86400000);
};

// ── Investment scoring ────────────────────────────────────────────────────────

/** Compute investment score from key ratios. */
export const calcInvestmentScore = ({ avgCashFlow, capRate, cashOnCash, expenseRatio, ltvRatio, yearlyApprRatio }: {
  avgCashFlow: number;
  capRate: number;
  cashOnCash: number;
  expenseRatio: number;
  ltvRatio: number;
  yearlyApprRatio: number;
}): InvestmentScore => {
  let score = 0;

  if      (avgCashFlow > 1000) score += 30;
  else if (avgCashFlow >  500) score += 24;
  else if (avgCashFlow >  200) score += 18;
  else if (avgCashFlow >    0) score += 12;
  else if (avgCashFlow > -200) score +=  6;

  if      (capRate > 0.08) score += 20;
  else if (capRate > 0.06) score += 16;
  else if (capRate > 0.05) score += 12;
  else if (capRate > 0.04) score +=  8;
  else if (capRate > 0.03) score +=  4;

  if      (cashOnCash > 0.12) score += 20;
  else if (cashOnCash > 0.08) score += 16;
  else if (cashOnCash > 0.06) score += 12;
  else if (cashOnCash > 0.04) score +=  8;
  else if (cashOnCash > 0.02) score +=  4;

  if      (expenseRatio < 0.30) score += 15;
  else if (expenseRatio < 0.40) score += 12;
  else if (expenseRatio < 0.50) score +=  8;
  else if (expenseRatio < 0.60) score +=  4;

  if      (ltvRatio < 0.50) score += 10;
  else if (ltvRatio < 0.65) score +=  8;
  else if (ltvRatio < 0.75) score +=  6;
  else if (ltvRatio < 0.85) score +=  3;

  if      (yearlyApprRatio > 0.10) score += 5;
  else if (yearlyApprRatio > 0.05) score += 3;
  else if (yearlyApprRatio > 0.02) score += 1;

  score = Math.min(100, Math.round(score));

  const fullStars = Math.floor(score / 20);
  const halfStar  = (score % 20) >= 10;
  const starsData = { full: fullStars, half: halfStar, empty: 5 - fullStars - (halfStar ? 1 : 0) };

  let label: string, cls: string;
  if      (score >= 85) { label = 'Excellent investment';  cls = 'text-success'; }
  else if (score >= 70) { label = 'Healthy property';      cls = 'text-success'; }
  else if (score >= 55) { label = 'Solid property';        cls = 'text-success'; }
  else if (score >= 40) { label = 'Average performance';   cls = 'text-warning'; }
  else if (score >= 25) { label = 'Underperforming';       cls = 'text-warning'; }
  else                  { label = 'Needs attention';       cls = 'text-danger';  }

  return { score, starsData, label, cls };
};

/** Quick health score using only property-record-level data. */
export const calcSimpleHealth = (p: {
  poss_date?: string;
  purchase_price: number;
  loan_amount: number;
  total_income: number;
  total_expenses: number;
  market_price: number;
  monthly_rent: number;
}): InvestmentScore => {
  const yrs        = yearsHeld(p);
  const downPmt    = p.purchase_price - p.loan_amount;
  const netExp     = p.total_expenses - downPmt;
  const netProfit  = p.total_income   - netExp;
  const annualCF   = yrs && yrs > 0 ? netProfit / yrs : 0;
  const avgCashFlow = annualCF / 12;

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

/** How long until all recorded expenses are recovered by cash flow. */
export const calcPayback = (outstanding: number, avgCashflow: number): PaybackResult => {
  if (avgCashflow <= 0) return { primary: '∞ (no CF)', primaryCls: 'text-danger' };
  if (outstanding <= 0) return { primary: 'Recovered', primaryCls: 'text-success' };
  const months = outstanding / avgCashflow;
  return {
    primary:    fmtPeriod(months),
    primaryCls: months < 36 ? 'text-success' : months < 84 ? '' : 'text-danger',
  };
};

/** How long until net position reaches zero. */
export const calcBreakEven = (netPos: number, monthlyGain: number): PaybackResult => {
  if (netPos >= 0)      return { primary: 'Reached',       primaryCls: 'text-success' };
  if (monthlyGain <= 0) return { primary: '∞ (no growth)', primaryCls: 'text-danger'  };
  const months = -netPos / monthlyGain;
  return {
    primary:    fmtPeriod(months),
    primaryCls: months < 36 ? 'text-success' : months < 84 ? '' : 'text-danger',
  };
};

// ── Property analysis ─────────────────────────────────────────────────────────

/** Generate a ranked list of insight items for a single property. */
export const analyzeProperty = (
  property: Record<string, unknown>,
  incomeRecs: Array<{ income_date: string }>,
  m: PropertyMetrics,
): AnalysisItem[] => {
  const {
    avgCashflow, yearlyAppr, monthlyAppr, monthlyGain, sellingProfit,
    monthlyRent, capRate, expenseRatio, ltvRatio, equity, cashOnCash, yearlyApprRatio,
  } = m;

  const items: AnalysisItem[] = [];
  const isRnt  = (property.status as string || '').toLowerCase() === 'rented';
  const noData = (property.total_income as number) === 0 && (property.total_expenses as number) === 0;

  if (noData) {
    items.push({ isPrimary: true, icon: '🆕', cls: 'text-secondary', label: 'No data yet',
      detail: 'No income or expenses have been recorded. Add transactions to start tracking performance.' });
  } else if (!isRnt) {
    const lastInc   = [...incomeRecs].sort((a, b) => new Date(b.income_date).getTime() - new Date(a.income_date).getTime())[0];
    const daysSince = lastInc ? (Date.now() - new Date(lastInc.income_date).getTime()) / 86400000 : Infinity;
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
    const mg = monthlyGain ?? 0;
    items.push({ isPrimary: true, icon: '⚖️', cls: mg >= 0 ? 'text-warning' : 'text-danger',
      label: mg >= 0 ? 'Appreciation covers the gap' : 'Negative cash flow, appreciation insufficient',
      detail: mg >= 0
        ? `Cash is consumed at ${fmt(Math.abs(avgCashflow))}/mo but appreciation (${fmt(yearlyAppr)}/yr) more than compensates. Monthly gain: ${fmt(mg)}/mo.`
        : `Cash is consumed at ${fmt(Math.abs(avgCashflow))}/mo. Appreciation only partially offsets this. Net monthly loss: ${fmt(mg)}/mo.` });
  } else if (avgCashflow < 0) {
    items.push({ isPrimary: true, icon: '📉', cls: 'text-danger', label: 'Negative cash flow',
      detail: `Expenses exceed income by ${fmt(Math.abs(avgCashflow))}/mo.` });
  } else if (avgCashflow === 0 && (monthlyGain ?? 0) > 0) {
    items.push({ isPrimary: true, icon: '📈', cls: 'text-success', label: 'Breakeven — appreciation-led',
      detail: `Cash flow is exactly neutral, but appreciation adds ${fmt(monthlyGain!)}/mo in total gain.` });
  } else if (sellingProfit >= 0 && avgCashflow > 0 && sellingProfit / avgCashflow < 12) {
    items.push({ isPrimary: true, icon: '⭐', cls: 'text-success', label: 'Exceptional yield',
      detail: `Cash flow of ${fmt(avgCashflow)}/mo recovers the entire Net Position in ${Math.round(sellingProfit / avgCashflow)} months.` });
  } else if (monthlyRent > 0 && avgCashflow > 0 && sellingProfit < (property.market_price as number) * 0.05) {
    items.push({ isPrimary: true, icon: '🐄', cls: 'text-success', label: 'Golden cow — keep',
      detail: `Strong cash flow (${fmt(avgCashflow)}/mo) but selling today nets only ${fmt(sellingProfit)}.` });
  } else if (sellingProfit > (property.market_price as number) * 0.15 && (monthlyGain ?? 0) < (property.market_price as number) * 0.003) {
    items.push({ isPrimary: true, icon: '💡', cls: 'text-warning', label: 'Consider selling',
      detail: `Unrealized gain of ${fmt(sellingProfit)} is significant, but monthly gain is only ${fmt(monthlyGain!)}/mo.` });
  } else if (yearlyAppr !== null && yearlyAppr > 0 && avgCashflow > 0) {
    items.push({ isPrimary: true, icon: '🚀', cls: 'text-success', label: 'Strong performer',
      detail: `Cash flow ${fmt(avgCashflow)}/mo, appreciation ${fmt(yearlyAppr)}/yr, monthly gain ${fmt(monthlyGain!)}/mo.` });
  } else if (avgCashflow > 0) {
    items.push({ isPrimary: true, icon: '✅', cls: 'text-success', label: 'Positive cash flow',
      detail: `Generating ${fmt(avgCashflow)}/mo.${yearlyAppr !== null ? ` Appreciation ${fmt(yearlyAppr)}/yr adds ${fmt(monthlyAppr ?? 0)}/mo.` : ' Set a possession date to compute appreciation.'}` });
  } else {
    items.push({ isPrimary: true, icon: '➖', cls: 'text-warning', label: 'Breakeven — flat',
      detail: 'Cash flow is zero and no meaningful appreciation. Property is treading water.' });
  }

  // Secondary advisories
  if (monthlyRent > 0 && (capRate ?? 0) < 0.05) {
    const delta = Math.round((property.market_price as number) * 0.06 / 12) - monthlyRent;
    if (delta > 0) items.push({ icon: '📈', cls: 'text-warning', label: 'Low cap rate',
      detail: `Cap rate of ${((capRate ?? 0) * 100).toFixed(1)}% is below 5%. Raising rent by ~$${delta}/mo would push it toward 6%.` });
  }
  if (monthlyRent > 0 && (expenseRatio ?? 0) > 0.45) {
    items.push({ icon: '💸', cls: 'text-danger', label: 'High expense ratio',
      detail: `Expenses are ${((expenseRatio ?? 0) * 100).toFixed(0)}% of rent. Healthy properties typically sit below 40%.` });
  }
  if (ltvRatio > 0.80 && (property.loan_amount as number) > 0) {
    items.push({ icon: '⚡', cls: 'text-danger', label: 'High leverage risk',
      detail: `LTV of ${(ltvRatio * 100).toFixed(0)}% means only ${(100 - ltvRatio * 100).toFixed(0)}% equity cushion.` });
  }
  if (ltvRatio > 0 && ltvRatio < 0.55 && (equity as number) > 50000) {
    items.push({ icon: '🏦', cls: 'text-success', label: 'Refinancing opportunity',
      detail: `LTV of ${(ltvRatio * 100).toFixed(0)}% — ${fmt(equity as number)} in equity. A cash-out refinance could fund another investment.` });
  }
  if (yearlyAppr !== null && yearlyApprRatio > 0.08) {
    items.push({ icon: '💎', cls: 'text-success', label: 'Strong appreciation',
      detail: `Appreciating at ${(yearlyApprRatio * 100).toFixed(1)}%/yr (${fmt(yearlyAppr)}/yr).` });
  }
  if (yearlyAppr !== null && yearlyApprRatio < 0.02 && (capRate ?? 0) < 0.04 && (property.total_income as number) > 0) {
    items.push({ icon: '🔻', cls: 'text-danger', label: 'Low yield & low growth',
      detail: `Cap rate ${((capRate ?? 0) * 100).toFixed(1)}% and appreciation ${(yearlyApprRatio * 100).toFixed(1)}%/yr are both weak.` });
  }
  if ((cashOnCash ?? 0) > 0 && (cashOnCash ?? 0) < 0.03 && avgCashflow > 0) {
    items.push({ icon: '🔑', cls: 'text-warning', label: 'Low capital efficiency',
      detail: `Cash-on-cash return of ${((cashOnCash ?? 0) * 100).toFixed(1)}% means your equity is barely working. Target is typically 6–8%+.` });
  }

  return items;
};

// ── Economic vacancy ───────────────────────────────────────────────────────────

/** Calculate event-based economic vacancy for a property. */
export function calcEconVacancy(
  property: { status?: string; monthly_rent: number; poss_date?: string } | null,
  allEvents: Array<{ column_name?: string; old_value?: string | number | null; new_value?: string | number | null; created_at?: string }>,
  windowStart?: Date,
  windowEnd?: Date,
): number | null {
  if (!property) return null;

  const end = windowEnd ?? new Date();
  const start = windowStart ?? (() => { const s = new Date(end); s.setFullYear(s.getFullYear() - 1); return s; })();

  const rentChanges = allEvents
    .filter(e => e.column_name === 'monthly_rent')
    .map(e => ({
      date:     new Date(e.created_at ?? ''),
      oldRent:  parseFloat(String(e.old_value)) || 0,
      newRent:  parseFloat(String(e.new_value)) || 0,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const getRentAt = (date: Date): number => {
    if (rentChanges.length === 0) return property.monthly_rent;
    if (date < rentChanges[0].date) return rentChanges[0].oldRent || property.monthly_rent;
    for (let i = rentChanges.length - 1; i >= 0; i--) {
      if (date >= rentChanges[i].date) return rentChanges[i].newRent || property.monthly_rent;
    }
    return property.monthly_rent;
  };

  const possDate = property.poss_date ? new Date(property.poss_date) : null;
  const effectiveStart = (possDate && possDate > start) ? possDate : start;
  const vacancyOrigin  = effectiveStart;

  const breakpoints = [
    effectiveStart,
    ...rentChanges.map(r => r.date).filter(d => d > effectiveStart && d < end),
    end,
  ];
  let potentialRent = 0;
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const segDays = (breakpoints[i + 1].getTime() - breakpoints[i].getTime()) / 86_400_000;
    potentialRent += (segDays / 30.4375) * getRentAt(breakpoints[i]);
  }
  if (potentialRent <= 0) return null;

  const statusChanges = allEvents
    .filter(e => e.column_name === 'status')
    .sort((a, b) => new Date(a.created_at ?? '').getTime() - new Date(b.created_at ?? '').getTime());

  const periods: Array<{ start: Date; end: Date }> = [];
  let vacStart: Date | null = null;

  for (const e of statusChanges) {
    const d = new Date(e.created_at ?? '');
    if (e.new_value === 'Vacant') {
      vacStart = d;
    } else if (e.old_value === 'Vacant') {
      periods.push({ start: vacStart ?? vacancyOrigin, end: d });
      vacStart = null;
    }
  }

  if (property.status === 'Vacant') {
    periods.push({ start: vacStart ?? vacancyOrigin, end });
  }

  if (periods.length === 0) return 0;

  let lostRent = 0;
  for (const vp of periods) {
    const segStart = new Date(Math.max(vp.start.getTime(), effectiveStart.getTime()));
    const segEnd   = new Date(Math.min(vp.end.getTime(),   end.getTime()));
    if (segEnd <= segStart) continue;
    const vacDays = (segEnd.getTime() - segStart.getTime()) / 86_400_000;
    const rent    = getRentAt(segStart);
    if (rent > 0) lostRent += (vacDays / 30.4375) * rent;
  }

  return Math.min((lostRent / potentialRent) * 100, 100);
}

/**
 * Sum of annual interest charges across a list of properties.
 */
export const calcPortfolioInterest = (properties: Array<{ loan_amount?: number; mortgage_rate?: number }>): number =>
  properties.reduce((sum: number, p) =>
    (p.loan_amount ?? 0) > 0 && (p.mortgage_rate ?? 0) > 0
      ? sum + (p.loan_amount as number) * (p.mortgage_rate as number) / 100
      : sum, 0);

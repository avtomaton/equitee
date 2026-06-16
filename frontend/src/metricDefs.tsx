/**
 * metricDefs.tsx — Single source of truth for every metric card's
 * label, tooltip, colour logic, and format.
 */

import MetricCard from './components/MetricCard';
import { expGap } from './metrics';
import { fmt, fPct, fp, fmtPeriod } from './components/uiHelpers';

const CARD_STYLE = { flex: '1 1 150px', minWidth: 140 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const card = (props: any) => <MetricCard {...props} style={CARD_STYLE} />;

// ── Helpers ───────────────────────────────────────────────────────────────────

const posCls  = (v: number) => v >= 0 ? 'text-success' : 'text-danger';
const xCls    = (v: number) => v.toFixed(2) + 'x';
const capCls  = (v: number) => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger';
const oerCls  = (v: number) => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger';
const dscrCls = (v: number) => v >= 1.25 ? 'text-success' : v >= 1.0 ? 'text-warning' : 'text-danger';
const icrCls  = (v: number) => v >= 2 ? 'text-success' : v >= 1.25 ? '' : 'text-danger';
const lbl     = (w: number) => w ? (w >= 24 ? `${w / 12}Y` : `${w}M`) : 'All';

// ── Average / rolling metrics ─────────────────────────────────────────────────

export const cardAvgIncome = (actual: number, expVal: number, window: number) => card({
  label: `Avg Income (${lbl(window)})`,
  primary: fmt(actual),
  primaryCls: 'text-success',
  ...expGap(actual, expVal, () => 'text-success', fmt, 'Exp:', true, 50),
  tooltip: `Average monthly income over the last ${window} complete months.\nExp = sum of all current monthly rents at 100% occupancy.`,
});

export const cardAvgExpenses = (actual: number, expVal: number, window: number, cardMonthlyRent: number = 0) => card({
  label: `Avg Expenses (${lbl(window)})`,
  primary: fmt(actual),
  primaryCls: 'text-danger',
  ...expGap(actual, expVal,
    (v: number) => v < cardMonthlyRent * 0.65 ? '' : v < cardMonthlyRent * 0.85 ? 'text-warning' : 'text-danger',
    fmt, 'Exp:', false, 50),
  tooltip: `Average monthly expenses over the last ${window} complete months (all categories including mortgage).\nExp = budgeted op-ex + expected mortgage.`,
});

export const cardAvgCashFlow = (actual: number, expVal: number, window: number) => card({
  label: `Avg Cash Flow (${lbl(window)})`,
  primary: fmt(actual),
  primaryCls: posCls(actual),
  ...expGap(actual, expVal, posCls, fmt, 'Exp:', true, 50),
  tooltip: `Average monthly (Income − Expenses) over the last ${window} complete months.\nExp = budgeted NOI minus expected mortgage payment.`,
});

export const cardAvgNOI = (actual: number, expVal: number, window: number) => card({
  label: `Avg NOI (${lbl(window)})`,
  primary: fmt(actual),
  primaryCls: posCls(actual),
  ...expGap(actual, expVal, posCls, fmt, 'Exp:', true, 50),
  tooltip: 'Net Operating Income: avg monthly income minus all op-ex, excluding mortgage and principal.\nExp = total monthly rent minus budgeted operating expenses.',
});

// ── Ratio metrics ─────────────────────────────────────────────────────────────

export const cardCapRate = (actual: number | null, expVal: number | null, window: number) => card({
  label: `Cap Rate${window ? ` (${lbl(window)})` : ''}`,
  primary: actual != null ? fPct(actual) : '—',
  primaryCls: actual != null ? capCls(actual) : 'text-secondary',
  ...(actual != null ? expGap(actual, expVal, capCls, fPct, 'Exp:', true, 0.005) : {}),
  tertiary: actual != null
    ? (actual > 0.07 ? 'Strong yield' : actual > 0.04 ? 'Moderate yield' : 'Weak yield')
    : undefined,
  tooltip: 'Annual NOI ÷ Market Value (portfolio) or Purchase Price (property).\n> 7%: strong. 4–7%: moderate. < 4%: weak.',
});

export const cardOER = (actual: number | null, expVal: number | null, window: number) => card({
  label: `OER${window ? ` (${lbl(window)})` : ''}`,
  primary: actual != null ? fPct(actual) : '—',
  primaryCls: actual != null ? oerCls(actual) : 'text-secondary',
  ...(actual != null ? expGap(actual, expVal, oerCls, fPct, 'Exp:', false, 0.02) : {}),
  tertiary: actual != null
    ? (actual < 0.35 ? 'Efficient' : actual < 0.50 ? 'Normal' : 'High costs')
    : 'No income in window',
  tooltip: 'Operating Expense Ratio = op-ex ÷ gross income. Excludes mortgage and principal.\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.',
});

export const cardDSCR = (actual: number | null, expVal: number | null, window: number, noMortgageLabel?: string) => {
  if (actual == null) return card({
    label: `DSCR${window ? ` (${lbl(window)})` : ''}`,
    primary: '—',
    primaryCls: 'text-secondary',
    tertiary: noMortgageLabel ?? 'No mortgage expenses recorded',
    tooltip: 'Debt Service Coverage = monthly NOI ÷ mortgage payment.\n≥ 1.25x: comfortable. 1.0–1.25x: marginal. < 1.0x: income doesn\'t cover the mortgage.',
  });
  return card({
    label: `DSCR${window ? ` (${lbl(window)})` : ''}`,
    primary: actual.toFixed(2) + 'x',
    primaryCls: dscrCls(actual),
    ...expGap(actual, expVal, dscrCls, xCls, 'Exp:', true, 0.05),
    tertiary: actual >= 1.25 ? 'Healthy coverage' : actual >= 1.0 ? 'Marginal' : 'Below 1x',
    tooltip: 'Debt Service Coverage = monthly NOI ÷ mortgage payment.\n≥ 1.25x: comfortable. 1.0–1.25x: marginal. < 1.0x: income doesn\'t cover the mortgage.',
  });
};

export const cardICR = (actual: number | null, expVal: number | null, window: number) => {
  if (actual == null) return null;
  return card({
    label: `ICR${window ? ` (${lbl(window)})` : ''}`,
    primary: actual.toFixed(2) + 'x',
    primaryCls: icrCls(actual),
    ...expGap(actual, expVal, icrCls, xCls, 'Exp:', true, 0.05),
    tertiary: actual >= 2 ? 'Strong' : actual >= 1.25 ? 'Adequate' : 'Weak',
    tooltip: 'Interest Coverage Ratio = annualised NOI ÷ total annual interest (loan × rate).\n≥ 2.0x: strong. 1.25–2.0x: adequate. < 1.25x: tight.\nExp uses budgeted operating costs.',
  });
};

export const cardLTV = (ratio: number) => card({
  label: 'Loan-to-Value',
  primary: fPct(ratio),
  primaryCls: ratio > 0.80 ? 'text-danger' : ratio > 0.65 ? '' : 'text-success',
  tertiary: ratio > 0.80 ? 'High leverage' : ratio < 0.55 ? 'Low leverage' : 'Moderate leverage',
  tooltip: 'Loan ÷ Market Value. Below 65%: conservative. 65–80%: normal. Above 80%: high risk.',
});

export const cardCashOnCash = (actual: number, expVal: number) => card({
  label: 'Cash-on-Cash',
  primary: fPct(actual),
  primaryCls: actual > 0.08 ? 'text-success' : actual > 0.04 ? '' : actual < 0 ? 'text-danger' : 'text-warning',
  ...expGap(actual, expVal,
    (v: number) => v > 0.08 ? 'text-success' : v > 0.04 ? '' : v < 0 ? 'text-danger' : 'text-warning',
    fPct, 'Exp:', true, 0.005),
  tooltip: 'Annual Cash Flow ÷ Equity. Measures how hard your invested equity is working.\nTarget: 6–10%+.',
});

export const cardExpenseRatio = (actual: number, expVal: number) => card({
  label: 'Expense Ratio',
  primary: fPct(actual),
  primaryCls: actual < 0.35 ? 'text-success' : actual < 0.50 ? '' : 'text-danger',
  ...expGap(actual, expVal,
    (v: number) => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger',
    fPct, 'Exp:', false),
  tooltip: 'Avg Monthly Expenses ÷ Monthly Rent (all costs including mortgage).\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.',
});

export const cardRentToValue = (ratio: number) => card({
  label: 'Rent-to-Value',
  primary: fPct(ratio),
  primaryCls: ratio > 0.01 ? 'text-success' : ratio > 0.007 ? '' : 'text-danger',
  tertiary: ratio > 0.01 ? 'Passes 1% rule' : ratio > 0.007 ? 'Near 1% rule' : 'Below 1% rule',
  tooltip: 'Monthly Rent ÷ Purchase Price. The 1% rule: monthly rent ≥ 1% of purchase price signals healthy cash flow potential.',
});

// ── Gain / position metrics ───────────────────────────────────────────────────

export const cardMonthlyGain = (actual: number, expVal: number) => card({
  label: 'Monthly Gain',
  primary: fmt(actual),
  primaryCls: posCls(actual),
  ...expGap(actual, expVal, posCls, fmt, 'Exp:', true, 50),
  tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly ÷ 12).\nExp uses budgeted operating costs + expected appreciation %.',
});

export const cardNetPosition = (actual: number, pctOfSpend: number | null = null) => card({
  label: 'Net Position',
  primary: fmt(actual),
  primaryCls: posCls(actual),
  secondary: pctOfSpend != null ? pctOfSpend.toFixed(1) + '% of net spending' : null,
  secondaryCls: pctOfSpend != null ? posCls(pctOfSpend) : '',
  tooltip: 'Market Value + Total Income − Total Expenses − Loans.\nWhat you would walk away with after selling and clearing all mortgages.',
});

export const cardPaybackPeriod = (paybackProps: Record<string, unknown>, expLabel: string | null, outstanding: number | null, income: number | null, expenses: number | null) => card({
  label: 'Payback Period',
  ...paybackProps,
  secondary: expLabel ?? null,
  secondaryCls: expLabel ? 'text-success' : '',
  tooltip: `Time until all recorded expenses are recovered by cumulative cash flow.${
    outstanding != null && income != null && expenses != null
      ? `\nNumerator = Total Expenses − Total Income (${fmt(expenses)} − ${fmt(income)}).`
      : ''
  }\nExp uses budgeted cash flow.`,
});

export const cardBreakEven = (breakEvenProps: Record<string, unknown>, expLabel: string | null) => card({
  label: 'Break-even',
  ...breakEvenProps,
  secondary: expLabel ?? null,
  secondaryCls: expLabel ? 'text-success' : '',
  tooltip: 'Time until Net Position reaches zero or better.\nUses monthly gain (cash flow + appreciation) to close the gap.\nExp uses budgeted monthly gain.',
});

// ── Appreciation metrics ──────────────────────────────────────────────────────

export const cardTotalAppreciation = (appr: number, apprPct: number | null, purchase: number) => card({
  label: 'Total Appreciation',
  primary: fmt(appr),
  primaryCls: posCls(appr),
  secondary: apprPct != null && purchase > 0
    ? apprPct.toFixed(1) + '% from ' + fmt(purchase) : null,
  secondaryCls: posCls(appr),
  tooltip: 'Total unrealised gain: current Market Value minus original Purchase Price.',
});

export const cardYearlyAppreciation = (actual: number, expVal: number | null, expPct: number | null, apprPct: number | null) => card({
  label: 'Yearly Appreciation',
  primary: fmt(actual),
  primaryCls: posCls(actual),
  secondary: apprPct != null ? fp(apprPct) + ' per year' : null,
  secondaryCls: posCls(actual),
  ...expGap(actual, expVal ?? null, posCls,
    (v: number) => fmt(v) + (expPct ? ` (${fp(expPct)}/yr)` : ''),
    'Exp:', true, 500),
  tooltip: 'Annualised appreciation per property, summed.\nExp = sum of (purchase price × expected appreciation %) for properties where that is set.',
});

export const cardProjectedYearEnd = (value: number) => card({
  label: 'Projected Year-End Value',
  primary: fmt(value),
  tertiary: 'At current appreciation rate',
  tooltip: 'Current market value plus the remaining fraction of the year times the current annual appreciation rate.',
});

export const cardYearEndBalance = (actual: number, budgeted: number | null, ml: number) => card({
  label: 'Year-End Balance',
  primary: fmt(actual),
  primaryCls: posCls(actual),
  ...expGap(actual, budgeted, posCls, fmt, 'Budget:', true, 1000),
  tooltip: `Projected Net Position at December 31st.\nRun-rate: current Net Position + avg monthly cash flow × ${ml} months + avg monthly appreciation × ${ml} months.\nBudget: same but using expected monthly cash flow and appreciation.`,
});

// ── Property-specific metrics ─────────────────────────────────────────────────

export const cardEconVacancy = (actual: number | null) => card({
  label: 'Economic Vacancy',
  primary: actual != null ? `${Math.min(actual, 100).toFixed(1)}%` : '—',
  primaryCls: actual != null
    ? (actual > 10 ? 'text-danger' : actual > 4 ? 'text-warning' : 'text-success')
    : 'text-secondary',
  tertiary: actual != null
    ? (actual > 10 ? 'High loss' : actual > 4 ? 'Moderate' : 'Low')
    : 'No status events recorded',
  tooltip: 'Lost rent due to vacancy ÷ Potential rent (trailing 12 months).\n\nMeasured from Vacant→Rented status changes in the Events log.\nRent value at the time of each vacancy is used for lost-rent calculation.\nTarget: < 5%.',
});

export const cardIRR = (actual: number | null, hasPossDate: boolean) => card({
  label: 'IRR',
  primary: actual != null ? fPct(actual) : '—',
  primaryCls: actual != null
    ? (actual > 0.15 ? 'text-success' : actual > 0.08 ? '' : actual < 0 ? 'text-danger' : 'text-warning')
    : 'text-secondary',
  tertiary: actual != null
    ? (actual > 0.15 ? 'Excellent' : actual > 0.08 ? 'Good' : actual < 0 ? 'Loss' : 'Below target')
    : (!hasPossDate ? 'No possession date set' : 'Need ≥ 2 months of records'),
  tooltip: 'Internal Rate of Return — the annualised rate that makes NPV of all cash flows zero.\nTarget: 10–15%+ for real estate.',
});

export const cardMaintCapEx = (actual: number | null) => card({
  label: 'Maint+CapEx Ratio',
  primary: actual != null ? fPct(actual) : '—',
  primaryCls: actual != null
    ? (actual < 0.05 ? 'text-success' : actual < 0.12 ? '' : 'text-danger')
    : 'text-secondary',
  tertiary: actual != null
    ? (actual < 0.05 ? 'Low' : actual < 0.12 ? 'Normal' : 'High')
    : 'Set monthly rent to compute',
  tooltip: 'YTD Maintenance + Capital Expenditure ÷ Annual gross rental income.\nNorm: 5–10% of gross rent.',
});

// ── Property summary cards ────────────────────────────────────────────────────

export const cardMarketValue = (marketPrice: number, appr: number, apprPct: number | null, purchasePrice: number) => card({
  label: 'Market Value',
  primary: fmt(marketPrice),
  secondary: appr !== 0
    ? (appr >= 0 ? '+' : '') + fmt(appr) + (apprPct !== null ? ' (' + apprPct.toFixed(1) + '%)' : '')
    : null,
  secondaryCls: appr >= 0 ? 'text-success' : 'text-danger',
  tertiary: `purchased ${fmt(purchasePrice)}`,
  tooltip: `Current estimated market value.\nAppreciation: ${fmt(appr)} (${apprPct !== null ? apprPct.toFixed(1) + '%' : 'n/a'} over purchase price of ${fmt(purchasePrice)}).`,
});

export const cardEquity = (cardEquity: number, equityPct: number | null, loanToValue: number, ltvCls: string) => card({
  label: 'Equity',
  primary: fmt(cardEquity),
  primaryCls: cardEquity >= 0 ? 'text-success' : 'text-danger',
  secondary: equityPct !== null ? fp(equityPct) + ' of value' : null,
  secondaryCls: equityPct !== null && equityPct >= 50 ? 'text-success' : '',
  tertiary: loanToValue > 0 ? `LTV ${fPct(loanToValue)}` : null,
  tertiaryCls: ltvCls,
  tooltip: 'Market Value − Loan Amount.\nLTV shown — below 65%: conservative. 65–80%: normal. Above 80%: high risk.',
});

export const cardAvailEquity = (availableEquity: number, equityTotal: number | null = null) => card({
  label: 'Avail. Equity',
  primary: availableEquity > 0 ? fmt(availableEquity) : '—',
  primaryCls: availableEquity > 0 ? 'text-success' : 'text-secondary',
  secondary: equityTotal !== null && availableEquity > 0
    ? (availableEquity / equityTotal * 100).toFixed(1) + '% of ' + fmt(equityTotal) : null,
  secondaryCls: availableEquity > 0 ? 'text-success' : '',
  tertiary: availableEquity > 0 ? 'Above 20% LTV threshold' : 'LTV too high',
  tooltip: 'Equity accessible via refinancing while staying at ≤80% LTV.\nFormula: max(0, 80% × Market Value − Loan Amount).',
});

export const cardMonthlyRent = (cardMonthlyRent: number | null) => card({
  label: 'Monthly Rent',
  primary: cardMonthlyRent ? fmt(cardMonthlyRent) : '—',
  tooltip: 'Configured monthly rent. Used for Cap Rate and OER calculations.',
});

export const cardYtdOpProfit = (value: number, cardMarketValue: number | null = null, label: string = 'YTD Op. Profit') => card({
  label,
  primary: fmt(value),
  primaryCls: value >= 0 ? 'text-success' : 'text-danger',
  secondary: cardMarketValue != null && value !== 0
    ? fp(value / cardMarketValue * 100) + ' YTD ROI' : null,
  secondaryCls: value >= 0 ? 'text-success' : 'text-danger',
  tertiary: cardMarketValue == null ? 'Trailing 12 months' : null,
  tooltip: 'Income minus operating expenses (principal excluded) over the trailing 12 months.\nYTD ROI = YTD Operating Profit ÷ Portfolio Value.',
});

export const cardLoanAmount = (cardLoanAmount: number, loanPct: number | null) => card({
  label: 'Loan Amount',
  primary: fmt(cardLoanAmount),
  primaryCls: 'text-danger',
  secondary: loanPct !== null ? fp(loanPct) + ' of value' : null,
  tooltip: 'Outstanding mortgage or loan balance. Update this when you pay it down to keep LTV accurate.',
});

export const cardMortgageRate = (rate: number, annualInterest: number | null) => card({
  label: 'Mortgage Rate',
  primary: `${rate}%`,
  tertiary: annualInterest ? `~${fmt(annualInterest)}/yr in interest` : null,
  tooltip: 'Annual mortgage interest rate. Used to compute interest cost and interest coverage ratio.',
});

// ── Portfolio Analytics cards ─────────────────────────────────────────────────

export const cardAvailEquityPortfolio = (availEq: number, availEqPct: number | null, cardEquity: number) => card({
  label: 'Avail. Equity',
  primary: fmt(availEq),
  primaryCls: availEq > 0 ? 'text-success' : 'text-secondary',
  secondary: availEqPct !== null ? availEqPct.toFixed(1) + '% of ' + fmt(cardEquity) : null,
  secondaryCls: availEq > 0 ? 'text-success' : '',
  tertiary: 'Borrowable at ≤80% LTV',
  tooltip: 'Equity you can access via HELOC or refinance without exceeding 80% LTV.\nFormula: max(0, 80% × Market Value − Loan Balance).',
});

export const cardMortgagePerMonth = (totalMortgage: number, monthlyInterest: number, mortgagePrincipal: number | null) => card({
  label: 'Mortgage / mo',
  primary: totalMortgage > 0 ? fmt(totalMortgage) : '—',
  secondary: monthlyInterest > 0 ? 'Interest: ' + fmt(Math.round(monthlyInterest)) : null,
  secondaryCls: 'text-danger',
  tertiary: mortgagePrincipal != null && mortgagePrincipal > 0
    ? 'Principal: ' + fmt(Math.round(mortgagePrincipal)) : null,
  tooltip: 'Average monthly mortgage payments across all filtered properties (from recorded expense data).\nInterest estimate = loan × rate ÷ 12.',
});

// ── Period section cards ─────────────────────────────────────────────────────

export const cardPeriodIncome = (income: number, prefix: string, scopeStr: string) => card({
  label: `${prefix}Income`,
  primary: fmt(income),
  primaryCls: 'text-success',
  tooltip: prefix.trim()
    ? `All income recorded ${scopeStr} in the trailing 12-month window.`
    : `All income ever recorded ${scopeStr} since the first entry.`,
});

export const cardPeriodExpenses = (expenses: number, principal: number, prefix: string, scopeStr: string, isYTD: boolean) => card({
  label: `${prefix}Expenses`,
  primary: fmt(expenses),
  primaryCls: 'text-danger',
  secondary: principal > 0 ? `excl. ${fmt(principal)} principal` : null,
  secondaryCls: 'text-success',
  tooltip: isYTD
    ? `All expenses ${scopeStr} in the trailing 12-month window.\n${principal > 0
        ? `Includes ${fmt(principal)} of principal repayment — equity-building, not a true cost.`
        : 'Principal repayments are equity-building payments, not true operating costs.'}`
    : `All expenses ever recorded ${scopeStr}.\nIncludes the initial down payment and all principal repayments paid to date — both are equity-building, not operating costs.`,
});

export const cardPeriodNetExpenses = (netExpenses: number, prefix: string, isYTD: boolean) => card({
  label: `${prefix}Net Expenses`,
  primary: fmt(netExpenses),
  primaryCls: netExpenses >= 0 ? 'text-danger' : 'text-success',
  tooltip: isYTD
    ? 'YTD Expenses minus principal repayment in the same period.\nShows the true operating cost burden for the trailing 12 months, excluding equity-building payments.'
    : 'Total Expenses minus all principal payments (down payment + mortgage principal repaid to date).\nPrincipal payments build equity — they are not a true operating cost.\nFormula: Total Expenses − Total Principal Paid.',
});

export const cardPeriodBalance = (balance: number, prefix: string) => card({
  label: `${prefix}Balance`,
  primary: fmt(balance),
  primaryCls: balance >= 0 ? 'text-success' : 'text-danger',
  tooltip: `${prefix || 'All-time '}Income minus ${prefix || 'all-time '}Expenses. Raw cash in/out with no adjustments for equity-building payments.`,
});

export const cardPeriodOperatingProfit = (operatingProfit: number, roi: number | null, prefix: string, scope: string, isYTD: boolean) => card({
  label: `${prefix}Operating Profit`,
  primary: fmt(operatingProfit),
  primaryCls: operatingProfit >= 0 ? 'text-success' : 'text-danger',
  secondary: roi !== null ? roi.toFixed(1) + '% ROI' : null,
  secondaryCls: roi !== null && roi >= 0 ? 'text-success' : 'text-danger',
  tooltip: `${isYTD ? 'YTD' : 'All-time'} Income minus Net Expenses (down payment & principal excluded).\nThe true operating profit — money earned beyond your equity-building capital.${roi !== null ? `\nROI = Operating Profit ÷ ${scope === 'property' ? 'Market Value' : 'Portfolio Value'}.` : ''}`,
});

// ── Evaluator cards ───────────────────────────────────────────────────────────

export const cardEvalLTV = (ltvRatio: number) => card({
  label: 'Loan-to-Value',
  primary: fPct(ltvRatio),
  primaryCls: ltvRatio > 0.80 ? 'text-danger' : ltvRatio > 0.65 ? 'text-warning' : 'text-success',
  tertiary: ltvRatio > 0.80 ? 'High leverage' : ltvRatio < 0.55 ? 'Conservative' : 'Moderate leverage',
  tooltip: 'Loan ÷ Purchase Price.\nHigher LTV = more risk. Lenders typically require ≤80%. Below 65% is conservative.',
});

export const cardEvalCapRate = (cardCapRate: number) => card({
  label: 'Cap Rate',
  primary: fPct(cardCapRate),
  primaryCls: cardCapRate > 0.07 ? 'text-success' : cardCapRate > 0.04 ? '' : 'text-danger',
  tertiary: cardCapRate > 0.07 ? 'Strong yield' : cardCapRate > 0.04 ? 'Moderate yield' : 'Weak yield',
  tooltip: 'Net Operating Income ÷ Purchase Price.\nIgnores financing — useful for comparing properties. Target: 5–7%+ residential.',
});

export const cardEvalCashOnCash = (cardCashOnCash: number) => card({
  label: 'Cash-on-Cash',
  primary: fPct(cardCashOnCash),
  primaryCls: cardCashOnCash > 0.08 ? 'text-success' : cardCashOnCash > 0.04 ? '' : cardCashOnCash < 0 ? 'text-danger' : 'text-warning',
  tertiary: cardCashOnCash > 0.08 ? 'Strong' : cardCashOnCash > 0.04 ? 'Moderate' : 'Weak',
  tooltip: 'Annual Cash Flow ÷ Cash Invested (down payment + one-off costs).\nMeasures how efficiently your capital works. Target: 6–10%+.',
});

export const cardEvalExpenseRatio = (cardExpenseRatio: number) => card({
  label: 'Expense Ratio',
  primary: fPct(cardExpenseRatio),
  primaryCls: cardExpenseRatio < 0.35 ? 'text-success' : cardExpenseRatio < 0.50 ? '' : 'text-danger',
  tertiary: cardExpenseRatio < 0.35 ? 'Lean' : cardExpenseRatio < 0.50 ? 'Normal' : 'High costs',
  tooltip: 'Total Monthly Expenses ÷ Effective Monthly Rent.\nIncludes mortgage, tax, operating costs, repair reserve. Below 40% is healthy.',
});

export const cardEvalRentToValue = (cardRentToValue: number) => card({
  label: 'Rent-to-Value',
  primary: fPct(cardRentToValue),
  primaryCls: cardRentToValue > 0.01 ? 'text-success' : cardRentToValue > 0.007 ? '' : 'text-danger',
  tertiary: cardRentToValue > 0.01 ? 'Meets 1% rule' : cardRentToValue > 0.007 ? 'Near threshold' : 'Below 1% rule',
  tooltip: 'Annual Gross Rent ÷ Purchase Price.\nThe "1% rule": monthly rent ≥1% of price for cash-flow-positive property.',
});


export const cardEvalAnnualNOI = (annualNOI: number) => card({
  label: 'Monthly NOI',
  primary: fmt(annualNOI / 12),
  primaryCls: annualNOI >= 0 ? 'text-success' : 'text-danger',
  secondary: `${fmt(annualNOI)}/yr`,
  secondaryCls: 'text-secondary',
  tooltip: 'Net Operating Income = Gross Rent − (operating expenses + property tax).\nExcludes mortgage so it is financing-agnostic. Useful to compare against monthly mortgage and cash flow.',
});

export const cardEvalGRM = (grm: number) => card({
  label: 'GRM',
  primary: grm.toFixed(1) + 'x',
  primaryCls: grm < 10 ? 'text-success' : grm < 15 ? '' : 'text-danger',
  tertiary: grm < 10 ? 'Attractive' : grm < 15 ? 'Moderate' : 'Expensive',
  tooltip: 'Gross Rent Multiplier = Purchase Price ÷ Annual Gross Rent.\nLower is better. Typical range: 8–12x for good cash-flow markets.',
});

export const cardEvalIRR10 = (irr10: number) => card({
  label: 'IRR (10-yr)',
  primary: fp(irr10 * 100),
  primaryCls: irr10 > 0.15 ? 'text-success' : irr10 > 0.08 ? '' : irr10 < 0 ? 'text-danger' : 'text-warning',
  tertiary: irr10 > 0.15 ? 'Excellent' : irr10 > 0.08 ? 'Good' : irr10 < 0 ? 'Loss' : 'Below target',
  tooltip: 'Internal Rate of Return over a 10-year horizon.\nAccounts for time-value of money. Target: 10–15%+ for real estate.',
});

export const cardEvalMonthlyMortgage = (monthlyMortgage: number, effectiveRate: number, amortization: number) => card({
  label: 'Monthly Mortgage',
  primary: fmt(monthlyMortgage),
  primaryCls: 'text-danger',
  tooltip: `Standard amortization payment at ${fp(effectiveRate)}% over ${amortization} years.`,
});

export const cardEvalTotalMonthlyCosts = (total: number, mortgage: number, opEx: number, tax: number, reserve: number) => card({
  label: 'Total Monthly Costs',
  primary: fmt(total),
  primaryCls: 'text-danger',
  secondary: `Mtg ${fmt(mortgage)}  ·  OpEx ${fmt(opEx)}`,
  secondaryCls: 'text-secondary',
  tertiary: `Tax ${fmt(tax)}  ·  Reserve ${fmt(reserve)}`,
  tooltip: 'Sum of all monthly costs.\nMortgage + Operating expenses + Property tax + Repair reserve.',
});

export const cardEvalAvgCashFlow = (cashFlow: number, vacancyRate: number) => card({
  label: 'Avg Cash Flow',
  primary: fmt(cashFlow),
  primaryCls: posCls(cashFlow),
  tooltip: `Average monthly cash flow at ${fp(vacancyRate * 100)}% vacancy rate.`,
});

export const cardEvalPayback = (paybackMonths: number | null) => card({
  label: 'Payback Period',
  primary: paybackMonths != null ? (paybackMonths <= 0 ? 'Recovered' : fmtPeriod(paybackMonths)) : '—',
  primaryCls: paybackMonths != null ? (paybackMonths <= 0 ? 'text-success' : paybackMonths < 36 ? 'text-success' : paybackMonths < 84 ? '' : 'text-danger') : 'text-secondary',
  tooltip: 'Months until all recorded expenses are recovered by cumulative cash flow.\nFormula: outstanding expenses ÷ avg monthly cash flow.',
});

export const cardEvalBreakEven = (beMonths: number | null) => card({
  label: 'Break-even',
  primary: beMonths != null ? (beMonths <= 0 ? 'Reached' : fmtPeriod(beMonths)) : '—',
  primaryCls: beMonths != null ? (beMonths <= 0 ? 'text-success' : beMonths < 36 ? 'text-success' : beMonths < 84 ? '' : 'text-danger') : 'text-secondary',
  tooltip: 'Months until Net Position reaches zero.\nFormula: −net position ÷ monthly gain.',
});

export const cardEvalDSCR = (dscr: number | null) => card({
  label: 'DSCR',
  primary: dscr != null ? dscr.toFixed(2) + 'x' : '—',
  primaryCls: dscr != null ? dscrCls(dscr) : 'text-secondary',
  tertiary: dscr != null ? (dscr >= 1.25 ? 'Healthy' : dscr >= 1.0 ? 'Marginal' : 'Below 1x') : 'No mortgage',
  tooltip: 'Debt Service Coverage = monthly NOI ÷ mortgage payment.\n≥ 1.25x: comfortable. 1.0–1.25x: marginal. < 1.0x: income doesn\'t cover the mortgage.',
});

export const cardEvalDebtYield = (dy: number | null) => card({
  label: 'Debt Yield',
  primary: dy != null ? fPct(dy) : '—',
  primaryCls: dy != null ? (dy > 0.08 ? 'text-success' : dy > 0.05 ? '' : 'text-danger') : 'text-secondary',
  tertiary: dy != null ? (dy > 0.08 ? 'Strong' : dy > 0.05 ? 'Adequate' : 'Weak') : 'No loan data',
  tooltip: 'Annual NOI ÷ Loan Amount.\nLenders prefer ≥ 8%. Measures income relative to debt regardless of interest rate.',
});

export const cardEvalMaxVacancy = (maxVac: number | null, cashFlow: number) => card({
  label: 'Max Vacancy',
  primary: maxVac != null ? `${maxVac.toFixed(1)}%` : '—',
  primaryCls: maxVac != null ? (maxVac > 15 ? 'text-success' : maxVac > 8 ? '' : 'text-danger') : 'text-secondary',
  tertiary: maxVac != null ? (maxVac > 15 ? 'Resilient' : maxVac > 8 ? 'Moderate' : 'Fragile') : 'Need rent & expenses',
  tooltip: `Maximum vacancy rate before cash flow turns negative.\nCurrent cash flow: ${fmt(cashFlow)}/mo.`,
});

export const cardEvalEquityMultiple = (em: number | null) => card({
  label: 'Equity Multiple',
  primary: em != null ? em.toFixed(2) + 'x' : '—',
  primaryCls: em != null ? (em > 2 ? 'text-success' : em > 1.5 ? '' : 'text-danger') : 'text-secondary',
  tertiary: em != null ? (em > 2 ? 'Excellent' : em > 1.5 ? 'Good' : 'Below target') : 'Need 10yr projection',
  tooltip: 'Total cash returned ÷ total cash invested over 10 years.\nTarget: 2.0x+ (doubling your money).',
});

export const cardEvalMinRent = (minRent: number | null) => card({
  label: 'Min. Rent (Break-even)',
  primary: minRent != null ? fmt(minRent) : '—',
  primaryCls: 'text-secondary',
  tooltip: 'Monthly rent needed to break even (zero cash flow).\nIncludes all expenses: mortgage, tax, operating costs, and repair reserve.',
});

/**
 * metricDefs.jsx — Single source of truth for every metric card's
 * label, tooltip, colour logic, and format.
 *
 * Each export is a function that accepts numeric values and returns
 * a ready-to-render <MetricCard> element. Call sites just do:
 *
 *   import { cardAvgCashFlow, cardCapRate } from '../metricDefs.jsx';
 *   {cardAvgCashFlow(avg.cashflow, expMonthlyCF, avgWindow)}
 *
 * Rules:
 *   - Tooltips live here; views never re-declare them
 *   - Colour thresholds live here; views never re-declare them
 *   - expGap calls live here so the "Exp:" secondary is consistent everywhere
 *   - Defs that have no meaningful value to show return null (React-safe)
 */

import MetricCard from './components/MetricCard.jsx';
import { expGap } from './metrics.js';
import { fmt, fPct, fp } from './components/uiHelpers.jsx';

const CARD_STYLE = { flex: '1 1 150px', minWidth: 140 };
const card = props => <MetricCard {...props} style={CARD_STYLE} />;

// ── Helpers ───────────────────────────────────────────────────────────────────

const posCls  = v => v >= 0 ? 'text-success' : 'text-danger';
const xCls    = v => v.toFixed(2) + 'x';
const capCls  = v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger';
const oerCls  = v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger';
const dscrCls = v => v >= 1.25 ? 'text-success' : v >= 1.0 ? 'text-warning' : 'text-danger';
const icrCls  = v => v >= 2 ? 'text-success' : v >= 1.25 ? '' : 'text-danger';
const lbl     = (w) => w ? (w >= 24 ? `${w / 12}Y` : `${w}M`) : 'All';

// ── Average / rolling metrics ─────────────────────────────────────────────────

export const cardAvgIncome = (actual, expVal, window) => card({
  label: `Avg Income (${lbl(window)})`,
  primary: fmt(actual),
  primaryCls: 'text-success',
  ...expGap(actual, expVal, () => 'text-success', fmt, 'Exp:', true, 50),
  tooltip: `Average monthly income over the last ${window} complete months.\nExp = sum of all current monthly rents at 100% occupancy.`,
});

export const cardAvgExpenses = (actual, expVal, window, cardMonthlyRent = 0) => card({
  label: `Avg Expenses (${lbl(window)})`,
  primary: fmt(actual),
  primaryCls: 'text-danger',
  ...expGap(actual, expVal,
    v => v < cardMonthlyRent * 0.65 ? '' : v < cardMonthlyRent * 0.85 ? 'text-warning' : 'text-danger',
    fmt, 'Exp:', false, 50),
  tooltip: `Average monthly expenses over the last ${window} complete months (all categories including mortgage).\nExp = budgeted op-ex + expected mortgage.`,
});

export const cardAvgCashFlow = (actual, expVal, window) => card({
  label: `Avg Cash Flow (${lbl(window)})`,
  primary: fmt(actual),
  primaryCls: posCls(actual),
  ...expGap(actual, expVal, posCls, fmt, 'Exp:', true, 50),
  tooltip: `Average monthly (Income − Expenses) over the last ${window} complete months.\nExp = budgeted NOI minus expected mortgage payment.`,
});

export const cardAvgNOI = (actual, expVal, window) => card({
  label: `Avg NOI (${lbl(window)})`,
  primary: fmt(actual),
  primaryCls: posCls(actual),
  ...expGap(actual, expVal, posCls, fmt, 'Exp:', true, 50),
  tooltip: 'Net Operating Income: avg monthly income minus all op-ex, excluding mortgage and principal.\nExp = total monthly rent minus budgeted operating expenses.',
});

// ── Ratio metrics ─────────────────────────────────────────────────────────────

export const cardCapRate = (actual, expVal, window) => card({
  label: `Cap Rate${window ? ` (${lbl(window)})` : ''}`,
  primary: actual != null ? fPct(actual) : '—',
  primaryCls: actual != null ? capCls(actual) : 'text-secondary',
  ...(actual != null ? expGap(actual, expVal, capCls, fPct, 'Exp:', true, 0.005) : {}),
  tertiary: actual != null
    ? (actual > 0.07 ? 'Strong yield' : actual > 0.04 ? 'Moderate yield' : 'Weak yield')
    : undefined,
  tooltip: 'Annual NOI ÷ Market Value (portfolio) or Purchase Price (property).\n> 7%: strong. 4–7%: moderate. < 4%: weak.',
});

export const cardOER = (actual, expVal, window) => card({
  label: `OER${window ? ` (${lbl(window)})` : ''}`,
  primary: actual != null ? fPct(actual) : '—',
  primaryCls: actual != null ? oerCls(actual) : 'text-secondary',
  ...(actual != null ? expGap(actual, expVal, oerCls, fPct, 'Exp:', false, 0.02) : {}),
  tertiary: actual != null
    ? (actual < 0.35 ? 'Efficient' : actual < 0.50 ? 'Normal' : 'High costs')
    : 'No income in window',
  tooltip: 'Operating Expense Ratio = op-ex ÷ gross income. Excludes mortgage and principal.\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.',
});

export const cardDSCR = (actual, expVal, window, noMortgageLabel) => {
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

export const cardICR = (actual, expVal, window) => {
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

export const cardLTV = (ratio) => card({
  label: 'Loan-to-Value',
  primary: fPct(ratio),
  primaryCls: ratio > 0.80 ? 'text-danger' : ratio > 0.65 ? '' : 'text-success',
  tertiary: ratio > 0.80 ? 'High leverage' : ratio < 0.55 ? 'Low leverage' : 'Moderate leverage',
  tooltip: 'Loan ÷ Market Value. Below 65%: conservative. 65–80%: normal. Above 80%: high risk.',
});

export const cardCashOnCash = (actual, expVal) => card({
  label: 'Cash-on-Cash',
  primary: fPct(actual),
  primaryCls: actual > 0.08 ? 'text-success' : actual > 0.04 ? '' : actual < 0 ? 'text-danger' : 'text-warning',
  ...expGap(actual, expVal,
    v => v > 0.08 ? 'text-success' : v > 0.04 ? '' : v < 0 ? 'text-danger' : 'text-warning',
    fPct, 'Exp:', true, 0.005),
  tooltip: 'Annual Cash Flow ÷ Equity. Measures how hard your invested cardEquity is working.\nTarget: 6–10%+.',
});

export const cardExpenseRatio = (actual, expVal) => card({
  label: 'Expense Ratio',
  primary: fPct(actual),
  primaryCls: actual < 0.35 ? 'text-success' : actual < 0.50 ? '' : 'text-danger',
  ...expGap(actual, expVal,
    v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger',
    fPct, 'Exp:', false),
  tooltip: 'Avg Monthly Expenses ÷ Monthly Rent (all costs including mortgage).\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.',
});

export const cardRentToValue = (ratio) => card({
  label: 'Rent-to-Value',
  primary: fPct(ratio),
  primaryCls: ratio > 0.01 ? 'text-success' : ratio > 0.007 ? '' : 'text-danger',
  tertiary: ratio > 0.01 ? 'Passes 1% rule' : ratio > 0.007 ? 'Near 1% rule' : 'Below 1% rule',
  tooltip: 'Monthly Rent ÷ Purchase Price. The 1% rule: monthly rent ≥ 1% of purchase price signals healthy cash flow potential.',
});

// ── Gain / position metrics ───────────────────────────────────────────────────

export const cardMonthlyGain = (actual, expVal) => card({
  label: 'Monthly Gain',
  primary: fmt(actual),
  primaryCls: posCls(actual),
  ...expGap(actual, expVal, posCls, fmt, 'Exp:', true, 50),
  tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly ÷ 12).\nExp uses budgeted operating costs + expected appreciation %.',
});

export const cardNetPosition = (actual, pctOfSpend = null) => card({
  label: 'Net Position',
  primary: fmt(actual),
  primaryCls: posCls(actual),
  secondary: pctOfSpend != null ? pctOfSpend.toFixed(1) + '% of net spending' : null,
  secondaryCls: pctOfSpend != null ? posCls(pctOfSpend) : '',
  tooltip: 'Market Value + Total Income − Total Expenses − Loans.\nWhat you would walk away with after selling and clearing all mortgages.',
});

export const cardPaybackPeriod = (paybackProps, expLabel, outstanding, income, expenses) => card({
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

export const cardBreakEven = (breakEvenProps, expLabel) => card({
  label: 'Break-even',
  ...breakEvenProps,
  secondary: expLabel ?? null,
  secondaryCls: expLabel ? 'text-success' : '',
  tooltip: 'Time until Net Position reaches zero or better.\nUses monthly gain (cash flow + appreciation) to close the gap.\nExp uses budgeted monthly gain.',
});

// ── Appreciation metrics ──────────────────────────────────────────────────────

export const cardTotalAppreciation = (appr, apprPct, purchase) => card({
  label: 'Total Appreciation',
  primary: fmt(appr),
  primaryCls: posCls(appr),
  secondary: apprPct != null && purchase > 0
    ? apprPct.toFixed(1) + '% from ' + fmt(purchase) : null,
  secondaryCls: posCls(appr),
  tooltip: 'Total unrealised gain: current Market Value minus original Purchase Price.',
});

export const cardYearlyAppreciation = (actual, expVal, expPct, apprPct) => card({
  label: 'Yearly Appreciation',
  primary: fmt(actual),
  primaryCls: posCls(actual),
  secondary: apprPct != null ? fp(apprPct) + ' per year' : null,
  secondaryCls: posCls(actual),
  ...expGap(actual, expVal ?? null, posCls,
    v => fmt(v) + (expPct ? ` (${fp(expPct)}/yr)` : ''),
    'Exp:', true, 500),
  tooltip: 'Annualised appreciation per property, summed.\nExp = sum of (purchase price × expected appreciation %) for properties where that is set.',
});

export const cardProjectedYearEnd = (value) => card({
  label: 'Projected Year-End Value',
  primary: fmt(value),
  tertiary: 'At current appreciation rate',
  tooltip: 'Current market value plus the remaining fraction of the year times the current annual appreciation rate.',
});

export const cardYearEndBalance = (actual, budgeted, ml) => card({
  label: 'Year-End Balance',
  primary: fmt(actual),
  primaryCls: posCls(actual),
  ...expGap(actual, budgeted, posCls, fmt, 'Budget:', true, 1000),
  tooltip: `Projected Net Position at December 31st.\nRun-rate: current Net Position + avg monthly cash flow × ${ml} months + avg monthly appreciation × ${ml} months.\nBudget: same but using expected monthly cash flow and appreciation.`,
});

// ── Property-specific metrics ─────────────────────────────────────────────────

export const cardEconVacancy = (actual) => card({
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

export const cardIRR = (actual, hasPossDate) => card({
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

export const cardMaintCapEx = (actual) => card({
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

export const cardMarketValue = (marketPrice, appr, apprPct, purchasePrice) => card({
  label: 'Market Value',
  primary: fmt(marketPrice),
  secondary: appr !== 0
    ? (appr >= 0 ? '+' : '') + fmt(appr) + (apprPct !== null ? ' (' + apprPct.toFixed(1) + '%)' : '')
    : null,
  secondaryCls: appr >= 0 ? 'text-success' : 'text-danger',
  tertiary: `purchased ${fmt(purchasePrice)}`,
  tooltip: `Current estimated market value.\nAppreciation: ${fmt(appr)} (${apprPct !== null ? apprPct.toFixed(1) + '%' : 'n/a'} over purchase price of ${fmt(purchasePrice)}).`,
});

export const cardEquity = (cardEquity, equityPct, loanToValue, ltvCls) => card({
  label: 'Equity',
  primary: fmt(cardEquity),
  primaryCls: cardEquity >= 0 ? 'text-success' : 'text-danger',
  secondary: equityPct !== null ? fp(equityPct) + ' of value' : null,
  secondaryCls: equityPct !== null && equityPct >= 50 ? 'text-success' : '',
  tertiary: loanToValue > 0 ? `LTV ${fPct(loanToValue)}` : null,
  tertiaryCls: ltvCls,
  tooltip: 'Market Value − Loan Amount.\nLTV shown — below 65%: conservative. 65–80%: normal. Above 80%: high risk.',
});

export const cardAvailEquity = (availableEquity, equityTotal = null) => card({
  label: 'Avail. Equity',
  primary: availableEquity > 0 ? fmt(availableEquity) : '—',
  primaryCls: availableEquity > 0 ? 'text-success' : 'text-secondary',
  secondary: equityTotal !== null && availableEquity > 0
    ? (availableEquity / equityTotal * 100).toFixed(1) + '% of ' + fmt(equityTotal) : null,
  secondaryCls: availableEquity > 0 ? 'text-success' : '',
  tertiary: availableEquity > 0 ? 'Above 20% LTV threshold' : 'LTV too high',
  tooltip: 'Equity accessible via refinancing while staying at ≤80% LTV.\nFormula: max(0, 80% × Market Value − Loan Amount).',
});

export const cardMonthlyRent = (cardMonthlyRent) => card({
  label: 'Monthly Rent',
  primary: cardMonthlyRent ? fmt(cardMonthlyRent) : '—',
  tooltip: 'Configured monthly rent. Used for Cap Rate and OER calculations.',
});

export const cardYtdOpProfit = (value, cardMarketValue = null, label = 'YTD Op. Profit') => card({
  label,
  primary: fmt(value),
  primaryCls: value >= 0 ? 'text-success' : 'text-danger',
  secondary: cardMarketValue != null && value !== 0
    ? fp(value / cardMarketValue * 100) + ' YTD ROI' : null,
  secondaryCls: value >= 0 ? 'text-success' : 'text-danger',
  tertiary: cardMarketValue == null ? 'Trailing 12 months' : null,
  tooltip: 'Income minus operating expenses (principal excluded) over the trailing 12 months.\nYTD ROI = YTD Operating Profit ÷ Portfolio Value.',
});

export const cardLoanAmount = (cardLoanAmount, loanPct) => card({
  label: 'Loan Amount',
  primary: fmt(cardLoanAmount),
  primaryCls: 'text-danger',
  secondary: loanPct !== null ? fp(loanPct) + ' of value' : null,
  tooltip: 'Outstanding mortgage or loan balance. Update this when you pay it down to keep LTV accurate.',
});

export const cardMortgageRate = (rate, annualInterest) => card({
  label: 'Mortgage Rate',
  primary: `${rate}%`,
  tertiary: annualInterest ? `~${fmt(annualInterest)}/yr in interest` : null,
  tooltip: 'Annual mortgage interest rate. Used to compute interest cost and interest coverage ratio.',
});

// ── Portfolio Analytics cards ─────────────────────────────────────────────────

export const cardAvailEquityPortfolio = (availEq, availEqPct, cardEquity) => card({
  label: 'Avail. Equity',
  primary: fmt(availEq),
  primaryCls: availEq > 0 ? 'text-success' : 'text-secondary',
  secondary: availEqPct !== null ? availEqPct.toFixed(1) + '% of ' + fmt(cardEquity) : null,
  secondaryCls: availEq > 0 ? 'text-success' : '',
  tertiary: 'Borrowable at ≤80% LTV',
  tooltip: 'Equity you can access via HELOC or refinance without exceeding 80% LTV.\nFormula: max(0, 80% × Market Value − Loan Balance).',
});

export const cardMortgagePerMonth = (totalMortgage, monthlyInterest, mortgagePrincipal) => card({
  label: 'Mortgage / mo',
  primary: totalMortgage > 0 ? fmt(totalMortgage) : '—',
  secondary: monthlyInterest > 0 ? 'Interest: ' + fmt(Math.round(monthlyInterest)) : null,
  secondaryCls: 'text-danger',
  tertiary: mortgagePrincipal != null && mortgagePrincipal > 0
    ? 'Principal: ' + fmt(Math.round(mortgagePrincipal)) : null,
  tooltip: 'Average monthly mortgage payments across all filtered properties (from recorded expense data).\nInterest estimate = loan × rate ÷ 12.',
});

// ── Period section cards (FinancialPeriodSection / YtdSection) ────────────────

export const cardPeriodIncome = (income, prefix, scopeStr) => card({
  label: `${prefix}Income`,
  primary: fmt(income),
  primaryCls: 'text-success',
  tooltip: prefix.trim()
    ? `All income recorded ${scopeStr} in the trailing 12-month window.`
    : `All income ever recorded ${scopeStr} since the first entry.`,
});

export const cardPeriodExpenses = (expenses, principal, prefix, scopeStr, isYTD) => card({
  label: `${prefix}Expenses`,
  primary: fmt(expenses),
  primaryCls: 'text-danger',
  secondary: principal > 0 ? `excl. ${fmt(principal)} principal` : null,
  secondaryCls: 'text-success',
  tooltip: isYTD
    ? `All expenses ${scopeStr} in the trailing 12-month window.\n${principal > 0
        ? `Includes ${fmt(principal)} of principal repayment — cardEquity-building, not a true cost.`
        : 'Principal repayments are cardEquity-building payments, not true operating costs.'}`
    : `All expenses ever recorded ${scopeStr}.\nIncludes the initial down payment and all principal repayments paid to date — both are cardEquity-building, not operating costs.`,
});

export const cardPeriodNetExpenses = (netExpenses, prefix, isYTD) => card({
  label: `${prefix}Net Expenses`,
  primary: fmt(netExpenses),
  primaryCls: netExpenses >= 0 ? 'text-danger' : 'text-success',
  tooltip: isYTD
    ? 'YTD Expenses minus principal repayment in the same period.\nShows the true operating cost burden for the trailing 12 months, excluding cardEquity-building payments.'
    : 'Total Expenses minus all principal payments (down payment + mortgage principal repaid to date).\nPrincipal payments build cardEquity — they are not a true operating cost.\nFormula: Total Expenses − Total Principal Paid.',
});

export const cardPeriodBalance = (balance, prefix) => card({
  label: `${prefix}Balance`,
  primary: fmt(balance),
  primaryCls: balance >= 0 ? 'text-success' : 'text-danger',
  tooltip: `${prefix || 'All-time '}Income minus ${prefix || 'all-time '}Expenses. Raw cash in/out with no adjustments for cardEquity-building payments.`,
});

export const cardPeriodOperatingProfit = (operatingProfit, roi, prefix, scope, isYTD) => card({
  label: `${prefix}Operating Profit`,
  primary: fmt(operatingProfit),
  primaryCls: operatingProfit >= 0 ? 'text-success' : 'text-danger',
  secondary: roi !== null ? roi.toFixed(1) + '% ROI' : null,
  secondaryCls: roi !== null && roi >= 0 ? 'text-success' : 'text-danger',
  tooltip: `${isYTD ? 'YTD' : 'All-time'} Income minus Net Expenses (down payment & principal excluded).\nThe true operating profit — money earned beyond your cardEquity-building capital.${roi !== null ? `\nROI = Operating Profit ÷ ${scope === 'property' ? 'Market Value' : 'Portfolio Value'}.` : ''}`,
});

// ── Evaluator cards ───────────────────────────────────────────────────────────

export const cardEvalLTV = (ltvRatio) => card({
  label: 'Loan-to-Value',
  primary: fPct(ltvRatio),
  primaryCls: ltvRatio > 0.80 ? 'text-danger' : ltvRatio > 0.65 ? 'text-warning' : 'text-success',
  tertiary: ltvRatio > 0.80 ? 'High leverage' : ltvRatio < 0.55 ? 'Conservative' : 'Moderate leverage',
  tooltip: 'Loan ÷ Purchase Price.\nHigher LTV = more risk. Lenders typically require ≤80%. Below 65% is conservative.',
});

export const cardEvalCapRate = (cardCapRate) => card({
  label: 'Cap Rate',
  primary: fPct(cardCapRate),
  primaryCls: cardCapRate > 0.07 ? 'text-success' : cardCapRate > 0.04 ? '' : 'text-danger',
  tertiary: cardCapRate > 0.07 ? 'Strong yield' : cardCapRate > 0.04 ? 'Moderate yield' : 'Weak yield',
  tooltip: 'Net Operating Income ÷ Purchase Price.\nIgnores financing — useful for comparing properties. Target: 5–7%+ residential.',
});

export const cardEvalCashOnCash = (cardCashOnCash) => card({
  label: 'Cash-on-Cash',
  primary: fPct(cardCashOnCash),
  primaryCls: cardCashOnCash > 0.08 ? 'text-success' : cardCashOnCash > 0.04 ? '' : cardCashOnCash < 0 ? 'text-danger' : 'text-warning',
  tertiary: cardCashOnCash > 0.08 ? 'Strong' : cardCashOnCash > 0.04 ? 'Moderate' : 'Weak',
  tooltip: 'Annual Cash Flow ÷ Cash Invested (down payment + one-off costs).\nMeasures how efficiently your capital works. Target: 6–10%+.',
});

export const cardEvalExpenseRatio = (cardExpenseRatio) => card({
  label: 'Expense Ratio',
  primary: fPct(cardExpenseRatio),
  primaryCls: cardExpenseRatio < 0.35 ? 'text-success' : cardExpenseRatio < 0.50 ? '' : 'text-danger',
  tertiary: cardExpenseRatio < 0.35 ? 'Lean' : cardExpenseRatio < 0.50 ? 'Normal' : 'High costs',
  tooltip: 'Total Monthly Expenses ÷ Effective Monthly Rent.\nIncludes mortgage, tax, operating costs, repair reserve. Below 40% is healthy.',
});

export const cardEvalRentToValue = (cardRentToValue) => card({
  label: 'Rent-to-Value',
  primary: fPct(cardRentToValue),
  primaryCls: cardRentToValue > 0.01 ? 'text-success' : cardRentToValue > 0.007 ? '' : 'text-danger',
  tertiary: cardRentToValue > 0.01 ? 'Meets 1% rule' : cardRentToValue > 0.007 ? 'Near threshold' : 'Below 1% rule',
  tooltip: 'Annual Gross Rent ÷ Purchase Price.\nThe "1% rule": monthly rent ≥1% of price for cash-flow-positive property.',
});

export const cardEvalNoiToValue = (noiToValue) => card({
  label: 'NOI-to-Value',
  primary: fPct(noiToValue),
  primaryCls: noiToValue > 0.06 ? 'text-success' : noiToValue > 0.04 ? '' : 'text-danger',
  tertiary: noiToValue > 0.06 ? 'Strong yield' : noiToValue > 0.04 ? 'Moderate' : 'Weak yield',
  tooltip: 'Annual NOI ÷ Purchase Price.\nSame as cap rate but uses full NOI (before mortgage). Especially useful for condos with high fees — shows true operating yield stripping out financing. Target: 4–6%+ residential.',
});

export const cardEvalAnnualNOI = (annualNOI) => card({
  label: 'Monthly NOI',
  primary: fmt(annualNOI / 12),
  primaryCls: annualNOI >= 0 ? 'text-success' : 'text-danger',
  secondary: `${fmt(annualNOI)}/yr`,
  secondaryCls: 'text-secondary',
  tooltip: 'Net Operating Income = Gross Rent − (operating expenses + property tax).\nExcludes mortgage so it is financing-agnostic. Useful to compare against monthly mortgage and cash flow.',
});

export const cardEvalGRM = (grm) => card({
  label: 'GRM',
  primary: grm.toFixed(1) + 'x',
  primaryCls: grm < 10 ? 'text-success' : grm < 15 ? '' : 'text-danger',
  tertiary: grm < 10 ? 'Attractive' : grm < 15 ? 'Moderate' : 'Expensive',
  tooltip: 'Gross Rent Multiplier = Purchase Price ÷ Annual Gross Rent.\nLower is better. Typical range: 8–12x for good cash-flow markets.',
});

export const cardEvalIRR10 = (irr10) => card({
  label: 'IRR (10-yr)',
  primary: fp(irr10 * 100),
  primaryCls: irr10 > 0.15 ? 'text-success' : irr10 > 0.08 ? '' : irr10 < 0 ? 'text-danger' : 'text-warning',
  tertiary: irr10 > 0.15 ? 'Excellent' : irr10 > 0.08 ? 'Good' : irr10 < 0 ? 'Loss' : 'Below target',
  tooltip: 'Internal Rate of Return over a 10-year horizon.\nAccounts for time-value of money. Target: 10–15%+ for real estate.',
});

export const cardEvalMonthlyMortgage = (monthlyMortgage, effectiveRate, amortization) => card({
  label: 'Monthly Mortgage',
  primary: fmt(monthlyMortgage),
  primaryCls: 'text-danger',
  tooltip: `Standard amortization payment at ${fp(effectiveRate)}% over ${amortization} years.`,
});

export const cardEvalTotalMonthlyCosts = (total, mortgage, opEx, tax, reserve) => card({
  label: 'Total Monthly Costs',
  primary: fmt(total),
  primaryCls: 'text-danger',
  secondary: `Mtg ${fmt(mortgage)}  ·  OpEx ${fmt(opEx)}`,
  secondaryCls: 'text-secondary',
  tertiary: `Tax ${fmt(tax)}  ·  Reserve ${fmt(reserve)}`,
  tooltip: 'Sum of all monthly costs.\nMortgage + Operating expenses + Property tax + Repair reserve.',
});

export const cardEvalAvgCashFlow = (cashFlow, vacancyRate) => card({
  label: 'Avg Cash Flow',
  primary: fmt(cashFlow),
  primaryCls: cashFlow >= 0 ? 'text-success' : 'text-danger',
  secondary: vacancyRate > 0 ? `After ${vacancyRate}% vacancy` : null,
  secondaryCls: 'text-secondary',
  tooltip: 'Effective rent (after vacancy) minus total monthly costs.',
});

export const cardEvalMonthlyGain = (cardMonthlyGain, cashFlow, monthlyAppr) => card({
  label: 'Monthly Gain',
  primary: fmt(cardMonthlyGain),
  primaryCls: cardMonthlyGain >= 0 ? 'text-success' : 'text-danger',
  secondary: `CF ${fmt(cashFlow)} + Appr ${fmt(monthlyAppr)}`,
  secondaryCls: 'text-secondary',
  tooltip: 'Cash Flow + Monthly Appreciation.\nCaptures income and value growth together.',
});

export const cardEvalPayback = (paybackProps) => card({
  label: 'Payback Period',
  ...paybackProps,
  tooltip: 'Time for cumulative cash flow to recover all cash invested (down payment + one-off costs).\nUses cash flow only — does not include appreciation.',
});

export const cardEvalBreakEven = (breakEvenProps) => card({
  label: 'Break-even',
  ...breakEvenProps,
  tooltip: 'Time until net position reaches zero — cash invested recovered via monthly gain (cash flow + appreciation).\nAlways ≤ Payback Period since gain ≥ cash flow.',
});

export const cardEvalDSCR = (dscr) => card({
  label: 'DSCR',
  primary: dscr != null ? dscr.toFixed(2) + 'x' : '—',
  primaryCls: dscr == null ? '' : dscr >= 1.25 ? 'text-success' : dscr >= 1.0 ? 'text-warning' : 'text-danger',
  tertiary: dscr == null ? null : dscr >= 1.25 ? 'Lender-safe' : dscr >= 1.0 ? 'Marginal' : 'Cash flow negative',
  tooltip: 'Debt Service Coverage Ratio = Monthly NOI ÷ Monthly Mortgage.\nLenders typically require ≥1.20–1.25x. Below 1.0 means rent cannot cover the mortgage.',
});

export const cardEvalDebtYield = (debtYield) => card({
  label: 'Debt Yield',
  primary: fPct(debtYield),
  primaryCls: debtYield > 0.10 ? 'text-success' : debtYield > 0.07 ? '' : 'text-danger',
  tertiary: debtYield > 0.10 ? 'Strong' : debtYield > 0.07 ? 'Acceptable' : 'Weak',
  tooltip: 'Annual NOI ÷ Loan Amount.\nLender metric — independent of interest rate. Measures how well the asset income covers the debt. Institutional lenders typically require ≥8–10%.',
});

export const cardEvalMaxVacancy = (maxVacancyCF, maxVacancyGain, currentVacancy) => card({
  label: 'Max Vacancy',
  primary: maxVacancyCF != null && maxVacancyCF > 0 ? fPct(maxVacancyCF) : maxVacancyCF === 0 ? '0%' : '—',
  primaryCls: maxVacancyCF == null ? ''
    : currentVacancy / 100 < maxVacancyCF * 0.5 ? 'text-success'
    : currentVacancy / 100 < maxVacancyCF * 0.85 ? 'text-warning'
    : 'text-danger',
  secondary: maxVacancyGain != null && maxVacancyGain > 0 ? `Gain≥0: ${fPct(maxVacancyGain)}` : null,
  secondaryCls: 'text-secondary',
  tooltip: 'Maximum vacancy before cash flow hits zero (primary) / before total monthly gain (CF + appreciation) hits zero (secondary).\nHigher = more resilience to empty periods.',
});

export const cardEvalEquityMultiple = (em, years) => card({
  label: `${years}yr Total Return`,
  primary: em != null ? em.toFixed(2) + 'x' : '—',
  primaryCls: em == null ? '' : em >= 2.0 ? 'text-success' : em >= 1.5 ? '' : em < 1.0 ? 'text-danger' : 'text-warning',
  tertiary: em == null ? null : em >= 2.0 ? 'Excellent' : em >= 1.5 ? 'Good' : em < 1.0 ? 'Capital loss' : 'Below target',
  tooltip: `Total return multiple over ${years} years.\n= (Equity at exit + Cumulative Cash P&L) ÷ Initial Cash Invested.\n2x = doubled your money. Target: ≥1.5–2x for real estate.`,
});

export const cardEvalMinRent = (minRentCF, minRentGain, currentRent) => card({
  label: 'Min Rent',
  primary: minRentCF != null ? fmt(minRentCF) : '—',
  primaryCls: minRentCF == null ? '' : currentRent >= minRentCF * 1.15 ? 'text-success' : currentRent >= minRentCF ? 'text-warning' : 'text-danger',
  secondary: minRentGain != null ? `Gain≥0: ${fmt(minRentGain)}` : null,
  secondaryCls: 'text-secondary',
  tooltip: 'Minimum monthly rent to break even on cash flow (primary) / on total monthly gain including appreciation (secondary).\nShows how far rent can drop before you start losing money.',
});

import { mc, fmt } from './uiHelpers.jsx';

/**
 * Unified income/expenses breakdown for any period — all-time or YTD.
 *
 * Props:
 *   income, expenses, netExpenses, balance, operatingProfit
 *   principal    — principal repaid in this period; shown as note on Expenses card
 *   roi          — shown as secondary on Operating Profit (percent number, e.g. 12.3)
 *   prefix       — label prefix, e.g. "YTD " (default "" = all-time)
 *   scope        — "portfolio" | "filtered" | "property"
 */
export default function FinancialPeriodSection({
  income, expenses, netExpenses, balance, operatingProfit,
  principal = null, roi = null,
  prefix = '', scope = 'portfolio',
}) {
  const isYTD    = prefix.trim().length > 0;
  const scopeStr = scope === 'property'
    ? 'for this property'
    : scope === 'filtered'
      ? 'for filtered properties'
      : 'across all properties';

  // Expenses card tooltip
  const expTooltip = isYTD
    ? `All expenses ${scopeStr} in the trailing 12-month window.\n${
        principal > 0
          ? `Includes ${fmt(principal)} of principal repayment — equity-building, not a true cost.`
          : 'Principal repayments are equity-building payments, not true operating costs.'
      }`
    : `All expenses ever recorded ${scopeStr}.\nIncludes the initial down payment and all principal repayments paid to date — both are equity-building, not operating costs.\n${
        principal > 0
          ? `Total principal (down payment + repayments) excluded in Net Expenses: ${fmt(principal)}.`
          : ''
      }`;

  // Net Expenses tooltip — correct for both periods
  const netExpTooltip = isYTD
    ? 'YTD Expenses minus principal repayment in the same period.\nShows the true operating cost burden for the trailing 12 months, excluding equity-building payments.'
    : `Total Expenses minus your down payment and all principal repayments to date.\nShows the real operating burden — what you have spent that doesn't come back as equity.\nFormula: Expenses − (Down Payment + All Principal Paid).`;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {mc({ label: `${prefix}Income`, primary: fmt(income), primaryCls: 'text-success',
        tooltip: isYTD
          ? `All income recorded ${scopeStr} in the trailing 12-month window.`
          : `All income ever recorded ${scopeStr} since the first entry.` })}

      {mc({ label: `${prefix}Expenses`, primary: fmt(expenses), primaryCls: 'text-danger',
        secondary: principal > 0 ? `incl. ${fmt(principal)} principal` : null,
        secondaryCls: 'text-success',
        tooltip: expTooltip })}

      {mc({ label: `${prefix}Net Expenses`, primary: fmt(netExpenses),
        primaryCls: netExpenses >= 0 ? 'text-danger' : 'text-success',
        tooltip: netExpTooltip })}

      {mc({ label: `${prefix}Balance`, primary: fmt(balance),
        primaryCls: balance >= 0 ? 'text-success' : 'text-danger',
        tooltip: `${prefix || 'All-time '}Income minus ${prefix || 'all-time '}Expenses. Raw cash in/out with no adjustments for equity-building payments.` })}

      {mc({ label: `${prefix}Operating Profit`, primary: fmt(operatingProfit),
        primaryCls: operatingProfit >= 0 ? 'text-success' : 'text-danger',
        secondary: roi !== null ? roi.toFixed(1) + '% ROI' : null,
        secondaryCls: roi !== null && roi >= 0 ? 'text-success' : 'text-danger',
        tooltip: `${isYTD ? 'YTD' : 'All-time'} Income minus Net Expenses (down payment & principal excluded).\nThe true operating profit — money earned beyond your equity-building capital.\n${roi !== null ? `ROI = Operating Profit ÷ ${scope === 'property' ? 'Market Value' : 'Portfolio Value'}.` : ''}` })}
    </div>
  );
}

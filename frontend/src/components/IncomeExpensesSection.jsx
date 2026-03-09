import MetricCard from './MetricCard.jsx';

const f = n => `$${Math.round(n).toLocaleString()}`;

/**
 * All-time Income & Expenses breakdown, shared across Dashboard,
 * portfolio Analytics, and single-property detail.
 *
 * Required props:
 *   income, expenses, netExpenses, balance, operatingProfit
 *
 * Optional props:
 *   roi           — shown as secondary on Operating Profit card (decimal, e.g. 0.12)
 *   netPosition   — if provided, adds a Net Position card at the end
 *   scope         — "portfolio" | "filtered" | "property" (affects tooltip wording)
 */
export default function IncomeExpensesSection({
  income, expenses, netExpenses, balance, operatingProfit,
  roi = null, netPosition = null, scope = 'portfolio',
}) {
  const mc = props => <MetricCard {...props} style={{ flex: '1 1 150px', minWidth: 140 }} />;

  const scopeStr = scope === 'property'
    ? 'for this property'
    : scope === 'filtered'
      ? 'for filtered properties'
      : 'across all properties';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {mc({ label: 'Total Income', primary: f(income), primaryCls: 'text-success',
        tooltip: `All recorded income ${scopeStr} since inception.` })}

      {mc({ label: 'Total Expenses', primary: f(expenses), primaryCls: 'text-danger',
        tooltip: `All recorded expenses ${scopeStr}, including the initial down payment and principal repayments.` })}

      {mc({ label: 'Net Expenses', primary: f(netExpenses),
        primaryCls: netExpenses >= 0 ? 'text-danger' : 'text-success',
        tooltip: `Total Expenses minus the initial down payment${scope !== 'property' ? 's' : ''}. The operating cost burden above the capital deployed.` })}

      {mc({ label: 'Total Balance', primary: f(balance),
        primaryCls: balance >= 0 ? 'text-success' : 'text-danger',
        tooltip: 'Total Income − Total Expenses. Raw cash in/out with no adjustments.' })}

      {mc({ label: 'Operating Profit', primary: f(operatingProfit),
        primaryCls: operatingProfit >= 0 ? 'text-success' : 'text-danger',
        secondary: roi !== null ? roi.toFixed(1) + '% ROI' : null,
        secondaryCls: roi !== null && roi >= 0 ? 'text-success' : 'text-danger',
        tooltip: `Total Income minus Net Expenses (principal & down payments excluded).\nThe true all-time operating profit.\nROI = Operating Profit ÷ ${scope === 'property' ? 'Market Value' : 'Portfolio Value'}.` })}

      {netPosition !== null && mc({ label: 'Net Position', primary: f(netPosition),
        primaryCls: netPosition >= 0 ? 'text-success' : 'text-danger',
        tooltip: `Market Value + Income − Expenses − Loan${scope !== 'property' ? 's' : ''}.\nWhat you would walk away with ${scopeStr} if you sold everything today and cleared all mortgages.` })}
    </div>
  );
}

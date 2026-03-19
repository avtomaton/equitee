import {
  defPeriodIncome, defPeriodExpenses, defPeriodNetExpenses,
  defPeriodBalance, defPeriodOperatingProfit,
} from '../metricDefs.jsx';

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

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {defPeriodIncome(income, prefix, scopeStr)}
      {defPeriodExpenses(expenses, principal ?? 0, prefix, scopeStr, isYTD)}
      {defPeriodNetExpenses(netExpenses, prefix, isYTD)}
      {defPeriodBalance(balance, prefix)}
      {defPeriodOperatingProfit(operatingProfit, roi, prefix, scope, isYTD)}
    </div>
  );
}

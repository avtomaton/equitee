import {
  cardPeriodIncome, cardPeriodExpenses, cardPeriodNetExpenses,
  cardPeriodBalance, cardPeriodOperatingProfit,
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
      {cardPeriodIncome(income, prefix, scopeStr)}
      {cardPeriodExpenses(expenses, principal ?? 0, prefix, scopeStr, isYTD)}
      {cardPeriodNetExpenses(netExpenses, prefix, isYTD)}
      {cardPeriodBalance(balance, prefix)}
      {cardPeriodOperatingProfit(operatingProfit, roi, prefix, scope, isYTD)}
    </div>
  );
}

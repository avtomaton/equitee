import {
  defPeriodIncome, defPeriodExpenses, defPeriodNetExpenses,
  defPeriodBalance, defPeriodOperatingProfit,
} from '../metricDefs.jsx';

export default function YtdSection({ ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdOpProfit }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {defPeriodIncome(ytdInc, 'YTD ', 'for this property')}
      {defPeriodExpenses(ytdExp, ytdPrin ?? 0, 'YTD ', 'for this property', true)}
      {defPeriodNetExpenses(ytdNetExp, 'YTD ', true)}
      {defPeriodBalance(ytdBal, 'YTD ')}
      {defPeriodOperatingProfit(ytdOpProfit, null, 'YTD ', 'property', true)}
    </div>
  );
}

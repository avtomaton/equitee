import {
  cardPeriodIncome, cardPeriodExpenses, cardPeriodNetExpenses,
  cardPeriodBalance, cardPeriodOperatingProfit,
} from '../metricDefs.jsx';

export default function YtdSection({ ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdOpProfit }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {cardPeriodIncome(ytdInc, 'YTD ', 'for this property')}
      {cardPeriodExpenses(ytdExp, ytdPrin ?? 0, 'YTD ', 'for this property', true)}
      {cardPeriodNetExpenses(ytdNetExp, 'YTD ', true)}
      {cardPeriodBalance(ytdBal, 'YTD ')}
      {cardPeriodOperatingProfit(ytdOpProfit, null, 'YTD ', 'property', true)}
    </div>
  );
}

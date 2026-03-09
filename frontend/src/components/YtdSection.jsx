import { mc, fmt } from './uiHelpers.jsx';

/**
 * Shared trailing-12-month YTD breakdown.
 * Card order: Income → Expenses → Net Expenses → Balance → Operating Profit
 *
 * Props: ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdOpProfit
 */
export default function YtdSection({ ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdOpProfit }) {
  const prinNote = ytdPrin > 0
    ? `${fmt(ytdPrin)} of this is principal repayment — loan body reduction that builds equity, not a true operating cost.`
    : 'No principal repayments detected in this window.';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {mc({ label: 'YTD Income', primary: fmt(ytdInc), primaryCls: 'text-success',
        tooltip: 'All income recorded in the trailing 12-month window.' })}

      {mc({ label: 'YTD Expenses', primary: fmt(ytdExp), primaryCls: 'text-danger',
        secondary: ytdPrin > 0 ? `incl. ${fmt(ytdPrin)} principal` : null,
        secondaryCls: 'text-success',
        tooltip: `All expenses in the trailing 12 months, including mortgage payments.\n${prinNote}` })}

      {mc({ label: 'YTD Net Expenses', primary: fmt(ytdNetExp),
        primaryCls: ytdNetExp >= 0 ? 'text-danger' : 'text-success',
        tooltip: 'YTD Expenses minus principal repayment. Pure operating cost — what you actually spent running the property this year.' })}

      {mc({ label: 'YTD Balance', primary: fmt(ytdBal),
        primaryCls: ytdBal >= 0 ? 'text-success' : 'text-danger',
        tooltip: 'YTD Income − YTD Expenses (raw, including principal payments).' })}

      {mc({ label: 'YTD Operating Profit', primary: fmt(ytdOpProfit),
        primaryCls: ytdOpProfit >= 0 ? 'text-success' : 'text-danger',
        tooltip: 'YTD Income minus YTD Net Expenses (principal excluded).\nThe true operating profit over the trailing 12 months.' })}
    </div>
  );
}

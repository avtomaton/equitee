/**
 * DateRangeFilter — date range selector shared by ExpensesView and IncomeView.
 *
 * Props:
 *   value            – current preset key ('all' | 'ytd' | 'currentMonth' | 'currentYear' | 'lastYear' | 'custom')
 *   onChange         – (value: string) => void
 *   customStart      – YYYY-MM-DD string for custom range start
 *   customEnd        – YYYY-MM-DD string for custom range end
 *   onCustomStart    – (value: string) => void
 *   onCustomEnd      – (value: string) => void
 */
export default function DateRangeFilter({ value, onChange, customStart, customEnd, onCustomStart, onCustomEnd }) {
  return (
    <>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="all">All Time</option>
        <option value="ytd">YTD</option>
        <option value="currentMonth">This Month</option>
        <option value="currentYear">This Year</option>
        <option value="lastYear">Last Year</option>
        <option value="custom">Custom…</option>
      </select>
      {value === 'custom' && <>
        <input type="date" value={customStart} onChange={e => onCustomStart(e.target.value)} />
        <input type="date" value={customEnd}   onChange={e => onCustomEnd(e.target.value)} />
      </>}
    </>
  );
}

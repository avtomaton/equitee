interface DateRangeFilterProps {
  value: string;
  onChange: (value: string) => void;
  customStart?: string;
  customEnd?: string;
  onCustomStart?: (value: string) => void;
  onCustomEnd?: (value: string) => void;
}

/**
 * DateRangeFilter — date range selector shared by ExpensesView and IncomeView.
 */
export default function DateRangeFilter({ value, onChange, customStart, customEnd, onCustomStart, onCustomEnd }: DateRangeFilterProps) {
  return (
    <>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={value !== 'all' ? 'filter-active' : ''}
      >
        <option value="all">All Time</option>
        <option value="ytd">YTD</option>
        <option value="currentMonth">This Month</option>
        <option value="currentYear">This Year</option>
        <option value="lastYear">Last Year</option>
        <option value="custom">Custom…</option>
      </select>
      {value === 'custom' && <>
        <input type="date" value={customStart} onChange={e => onCustomStart?.(e.target.value)} />
        <input type="date" value={customEnd}   onChange={e => onCustomEnd?.(e.target.value)} />
      </>}
    </>
  );
}

import { useState, useEffect, useMemo } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import StatCard from './StatCard.jsx';
import { API_URL, INITIAL_OPTIONS, COLUMN_DEFS } from '../config.js';
import { mergeOptions, getDateRanges, isDateInRange } from '../utils.js';
import { fmtDate } from './uiHelpers.jsx';
import { useColumnVisibility } from '../hooks.js';

export default function IncomeView({ properties, onAddIncome, onEditIncome, initialPropertyId }) {
  const [income,          setIncome]          = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [sortBy,          setSortBy]          = useState('income_date');
  const [sortOrder,       setSortOrder]       = useState('desc');
  const [filterProperty,  setFilterProperty]  = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [dateFilter,      setDateFilter]      = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd,   setCustomDateEnd]   = useState('');

  const { visible, update: setVisible, col, isCustom, reset } = useColumnVisibility('income');
  const allColKeys   = COLUMN_DEFS.income.map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS.income.map(d => [d.key, d.label]));

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  const allTypes = useMemo(() =>
    mergeOptions(INITIAL_OPTIONS.incomeTypes, income.map(i => i.income_type)), [income]);

  const [filterTypes, setFilterTypes] = useState(INITIAL_OPTIONS.incomeTypes);
  useEffect(() => { setFilterTypes(t => mergeOptions(t, allTypes)); }, [allTypes]);

  useEffect(() => { if (properties.length > 0) loadIncome(); }, [properties]);

  const loadIncome = async () => {
    try {
      setLoading(true);
      const responses = await Promise.all(
        properties.map(p =>
          fetch(`${API_URL}/income?property_id=${p.id}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => data.map(i => ({ ...i, property_name: p.name })))
        )
      );
      setIncome(responses.flat());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this income record?')) return;
    const res = await fetch(`${API_URL}/income/${id}`, { method: 'DELETE' });
    if (res.ok) loadIncome();
  };

  // Base: property-filtered only (unfiltered reference)
  const baseIncome = useMemo(() =>
    filterProperty === 'all'
      ? income
      : income.filter(i => i.property_id === parseInt(filterProperty)),
    [income, filterProperty]
  );

  const filtered = useMemo(() => {
    let list = baseIncome.filter(i => {
      if (!filterTypes.includes(i.income_type)) return false;
      if (dateFilter !== 'all' && dateFilter !== 'custom') {
        const range = getDateRanges()[dateFilter];
        if (range && !isDateInRange(i.income_date, range.start, range.end)) return false;
      }
      if (dateFilter === 'custom' && customDateStart && customDateEnd) {
        if (!isDateInRange(i.income_date, new Date(customDateStart), new Date(customDateEnd))) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'income_date') return dir * (new Date(a.income_date) - new Date(b.income_date));
      if (sortBy === 'amount')      return dir * (a.amount - b.amount);
      return 0;
    });
    return list;
  }, [baseIncome, filterTypes, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder]);

  const baseTotal     = baseIncome.reduce((s, i) => s + i.amount, 0);
  const filteredTotal = filtered.reduce((s, i) => s + i.amount, 0);
  const isFiltered    = filteredTotal !== baseTotal;
  const pct           = baseTotal > 0 ? ((filteredTotal / baseTotal) * 100).toFixed(1) : '100';

  const propName = filterProperty !== 'all'
    ? properties.find(p => String(p.id) === filterProperty)?.name
    : null;

  const amountSub = isFiltered ? `$${baseTotal.toLocaleString()} unfiltered · ${pct}% shown` : null;
  const txSub     = isFiltered ? `${baseIncome.length} unfiltered` : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Income</h1>
          <p className="page-subtitle">Track property income and revenue</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onAddIncome}>+ Add Income</button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <StatCard
          label={propName ? `Total Income — ${propName}` : 'Total Income'}
          value={`$${filteredTotal.toLocaleString()}`}
          cls="text-success"
          sub={amountSub}
        />
        <StatCard
          label={propName ? `Transactions — ${propName}` : 'Transactions'}
          value={filtered.length}
          sub={txSub}
        />
      </div>

      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Income</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}>
                <option value="all">All Properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <MultiSelect label="Type" options={allTypes} selected={filterTypes} onChange={setFilterTypes} />
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                <option value="all">All Time</option>
                <option value="ytd">YTD</option>
                <option value="currentMonth">This Month</option>
                <option value="currentYear">This Year</option>
                <option value="lastYear">Last Year</option>
                <option value="custom">Custom…</option>
              </select>
              {dateFilter === 'custom' && <>
                <input type="date" value={customDateStart} onChange={e => setCustomDateStart(e.target.value)} />
                <input type="date" value={customDateEnd}   onChange={e => setCustomDateEnd(e.target.value)} />
              </>}
              <MultiSelect
                label="Columns"
                options={allColKeys}
                selected={visible}
                onChange={setVisible}
                labelMap={allColLabels}
              />
              {isCustom && (
                <button type="button" onClick={reset}
                  style={{ background: 'none', border: 'none', fontSize: '0.75rem',
                    color: 'var(--accent-primary)', cursor: 'pointer', padding: '0 2px',
                    textDecoration: 'underline', opacity: 0.8, whiteSpace: 'nowrap' }}>
                  ↺ reset cols
                </button>
              )}
            </div>
            <div className="sort-group">
              <span className="sort-label">Sort:</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="income_date">Date</option>
                <option value="amount">Amount</option>
              </select>
              <button className="btn btn-secondary btn-small"
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {loading ? <div className="loading"><div className="spinner" /></div>
        : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">💰</div>
            <div className="empty-state-text">No income found</div></div>
        ) : (
          <div className="table-scroll-wrap">
            <table>
              <thead><tr>
                {col('date')     && <th className="col-shrink">Date</th>}
                {col('property') && <th className="col-fill">Property</th>}
                {col('amount')   && <th className="col-shrink">Amount</th>}
                {col('type')     && <th className="col-shrink">Type</th>}
                {col('notes')    && <th className="col-fill">Notes</th>}
                <th style={{ width: 52 }}></th>
              </tr></thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id}>
                    {col('date')     && <td className="col-shrink">{fmtDate(i.income_date)}</td>}
                    {col('property') && <td className="col-fill"><TruncatedCell text={i.property_name} /></td>}
                    {col('amount')   && <td className="col-shrink text-success">${i.amount.toLocaleString()}</td>}
                    {col('type')     && <td className="col-shrink">{i.income_type}</td>}
                    {col('notes')    && <td className="col-fill"><TruncatedCell text={i.notes} /></td>}
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-icon" title="Edit"   onClick={() => onEditIncome(i)}>✏️</button>
                        <button className="btn btn-danger    btn-icon" title="Delete" onClick={() => handleDelete(i.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

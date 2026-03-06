import { useState, useEffect, useMemo, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import { API_URL, INITIAL_OPTIONS, mergeOptions, getDateRanges, isDateInRange, fmtDate } from '../config.js';

export default function IncomeView({ properties, onAddIncome, onEditIncome, initialPropertyId }) {
  const [income, setIncome]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sortBy, setSortBy]       = useState('income_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterProperty, setFilterProperty] = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [dateFilter, setDateFilter]         = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd]     = useState('');

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  const allTypes = useMemo(() =>
    mergeOptions(INITIAL_OPTIONS.incomeTypes, income.map(i => i.income_type)), [income]);

  const [filterTypes, setFilterTypes] = useState(INITIAL_OPTIONS.incomeTypes);
  const typInit = useRef(false);

  useEffect(() => {
    if (!typInit.current && allTypes.length) { setFilterTypes(allTypes); typInit.current = true; }
    else setFilterTypes(t => mergeOptions(t, allTypes));
  }, [allTypes]);

  useEffect(() => {
    if (properties.length > 0) loadIncome();
  }, [properties]);

  const loadIncome = async () => {
    try {
      setLoading(true);
      const responses = await Promise.all(
        properties.map(prop =>
          fetch(`${API_URL}/income?property_id=${prop.id}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => data.map(i => ({ ...i, property_name: prop.name })))
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
    else alert('Failed to delete income');
  };

  const filtered = useMemo(() => {
    let list = income.filter(i => {
      if (filterProperty !== 'all' && i.property_id !== parseInt(filterProperty)) return false;
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
  }, [income, filterProperty, filterTypes, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder]);

  const total = filtered.reduce((s, i) => s + i.amount, 0);

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
        <div className="stat-card"><div className="stat-label">Total Income</div>
          <div className="stat-value text-success">${total.toLocaleString()}</div></div>
        <div className="stat-card"><div className="stat-label">Transactions</div>
          <div className="stat-value">{filtered.length}</div></div>
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
              <MultiSelect label="Types" options={allTypes} selected={filterTypes} onChange={setFilterTypes} />
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                <option value="all">All Time</option>
                <option value="ytd">YTD</option>
                <option value="currentMonth">Current Month</option>
                <option value="currentYear">Current Year</option>
                <option value="lastYear">Last Year</option>
                <option value="custom">Custom Range</option>
              </select>
              {dateFilter === 'custom' && <>
                <input type="date" value={customDateStart} onChange={e => setCustomDateStart(e.target.value)} />
                <input type="date" value={customDateEnd}   onChange={e => setCustomDateEnd(e.target.value)} />
              </>}
            </div>
            <div className="sort-group">
              <span className="sort-label">Sort:</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="income_date">Date</option>
                <option value="amount">Amount</option>
              </select>
              <button className="btn btn-secondary btn-small"
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
                {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          </div>
        </div>

        {loading ? <div className="loading"><div className="spinner" /></div>
        : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">💰</div>
            <div className="empty-state-text">No income found</div></div>
        ) : (
          <table>
            <thead><tr>
              <th>Date</th><th>Property</th><th>Type</th><th>Notes</th><th>Amount</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id}>
                  <td>{fmtDate(i.income_date)}</td>
                  <td>{i.property_name}</td>
                  <td>{i.income_type}</td>
                  <td>
                    <TruncatedCell text={i.notes} />
                  </td>
                  <td className="text-success">${i.amount.toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-small" onClick={() => onEditIncome(i)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-small"    onClick={() => handleDelete(i.id)}>🗑 Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

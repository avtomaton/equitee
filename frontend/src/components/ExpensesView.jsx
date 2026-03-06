import { useState, useEffect, useMemo, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import StatCard from './StatCard.jsx';
import { API_URL, INITIAL_OPTIONS, COLUMN_DEFS, mergeOptions, getDateRanges, isDateInRange, fmtDate } from '../config.js';
import { useColumnVisibility } from '../hooks.js';

export default function ExpensesView({ properties, onAddExpense, onEditExpense, initialPropertyId }) {
  const [expenses,        setExpenses]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [sortBy,          setSortBy]          = useState('expense_date');
  const [sortOrder,       setSortOrder]       = useState('desc');
  const [filterProperty,  setFilterProperty]  = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [dateFilter,      setDateFilter]      = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd,   setCustomDateEnd]   = useState('');

  const { visible, update: setVisible, col, isCustom, reset } = useColumnVisibility('expenses');
  const allColKeys   = COLUMN_DEFS.expenses.map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS.expenses.map(d => [d.key, d.label]));

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  const allCategories = useMemo(() =>
    mergeOptions(INITIAL_OPTIONS.expenseCategories, expenses.map(e => e.expense_category)), [expenses]);
  const allTypes = useMemo(() =>
    mergeOptions(INITIAL_OPTIONS.expenseTypes, expenses.map(e => e.expense_type)), [expenses]);

  const [filterCategories, setFilterCategories] = useState(INITIAL_OPTIONS.expenseCategories);
  const [filterTypes,      setFilterTypes]      = useState(INITIAL_OPTIONS.expenseTypes);
  const catInit = useRef(false), typInit = useRef(false);

  useEffect(() => {
    if (!catInit.current && allCategories.length) { setFilterCategories(allCategories); catInit.current = true; }
    else setFilterCategories(c => mergeOptions(c, allCategories));
  }, [allCategories]);

  useEffect(() => {
    if (!typInit.current && allTypes.length) { setFilterTypes(allTypes); typInit.current = true; }
    else setFilterTypes(t => mergeOptions(t, allTypes));
  }, [allTypes]);

  useEffect(() => { if (properties.length > 0) loadExpenses(); }, [properties]);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const responses = await Promise.all(
        properties.map(p =>
          fetch(`${API_URL}/expenses?property_id=${p.id}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => data.map(e => ({ ...e, property_name: p.name })))
        )
      );
      setExpenses(responses.flat());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    const res = await fetch(`${API_URL}/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) loadExpenses();
  };

  // Base: property-filtered only (for unfiltered reference total)
  const baseExpenses = useMemo(() =>
    filterProperty === 'all'
      ? expenses
      : expenses.filter(e => e.property_id === parseInt(filterProperty)),
    [expenses, filterProperty]
  );

  const filtered = useMemo(() => {
    let list = baseExpenses.filter(e => {
      if (!filterCategories.includes(e.expense_category)) return false;
      if (!filterTypes.includes(e.expense_type)) return false;
      if (dateFilter !== 'all' && dateFilter !== 'custom') {
        const range = getDateRanges()[dateFilter];
        if (range && !isDateInRange(e.expense_date, range.start, range.end)) return false;
      }
      if (dateFilter === 'custom' && customDateStart && customDateEnd) {
        if (!isDateInRange(e.expense_date, new Date(customDateStart), new Date(customDateEnd))) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'expense_date') return dir * (new Date(a.expense_date) - new Date(b.expense_date));
      if (sortBy === 'amount')       return dir * (a.amount - b.amount);
      return 0;
    });
    return list;
  }, [baseExpenses, filterCategories, filterTypes, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder]);

  const baseTotal     = baseExpenses.reduce((s, e) => s + e.amount, 0);
  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);
  const isFiltered    = filteredTotal !== baseTotal;
  const pct           = baseTotal > 0 ? ((filteredTotal / baseTotal) * 100).toFixed(1) : '100';

  const propName = filterProperty !== 'all'
    ? properties.find(p => String(p.id) === filterProperty)?.name
    : null;

  const amountSub = isFiltered
    ? `$${baseTotal.toLocaleString()} unfiltered · ${pct}% shown`
    : null;
  const txSub = isFiltered
    ? `${baseExpenses.length} unfiltered`
    : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Track and manage property expenses</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onAddExpense}>+ Add Expense</button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <StatCard
          label={propName ? `Total Expenses — ${propName}` : 'Total Expenses'}
          value={`$${filteredTotal.toLocaleString()}`}
          cls="text-danger"
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
          <div className="table-title">All Expenses</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}>
                <option value="all">All Properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <MultiSelect label="Category" options={allCategories} selected={filterCategories} onChange={setFilterCategories} />
              <MultiSelect label="Type"     options={allTypes}      selected={filterTypes}      onChange={setFilterTypes} />
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
                <option value="expense_date">Date</option>
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
          <div className="empty-state"><div className="empty-state-icon">💳</div>
            <div className="empty-state-text">No expenses found</div></div>
        ) : (
          <div className="table-scroll-wrap">
            <table>
              <thead><tr>
                {col('date')     && <th>Date</th>}
                {col('property') && <th>Property</th>}
                {col('amount')   && <th>Amount</th>}
                {col('category') && <th>Category</th>}
                {col('type')     && <th>Type</th>}
                {col('notes')    && <th>Notes</th>}
                <th style={{ width: 52 }}></th>
              </tr></thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}>
                    {col('date')     && <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.expense_date)}</td>}
                    {col('property') && <td><TruncatedCell text={e.property_name} maxWidth={120} /></td>}
                    {col('amount')   && <td className="text-danger" style={{ whiteSpace: 'nowrap' }}>${e.amount.toLocaleString()}</td>}
                    {col('category') && <td>{e.expense_category}</td>}
                    {col('type')     && <td>{e.expense_type}</td>}
                    {col('notes')    && <td><TruncatedCell text={e.notes} /></td>}
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-icon" title="Edit"   onClick={() => onEditExpense(e)}>✏️</button>
                        <button className="btn btn-danger    btn-icon" title="Delete" onClick={() => handleDelete(e.id)}>🗑</button>
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

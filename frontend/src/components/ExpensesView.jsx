import { useState, useEffect, useMemo, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import { API_URL, INITIAL_OPTIONS, mergeOptions, getDateRanges, isDateInRange, fmtDate } from '../config.js';
import TruncatedCell from './Tooltip.jsx';

export default function ExpensesView({ properties, onAddExpense, onEditExpense, initialPropertyId }) {
  const [expenses, setExpenses]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sortBy, setSortBy]       = useState('expense_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterProperty, setFilterProperty] = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [dateFilter, setDateFilter]         = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd]     = useState('');

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  const allCategories = useMemo(() =>
    mergeOptions(INITIAL_OPTIONS.expenseCategories, expenses.map(e => e.expense_category)), [expenses]);
  const allTypes = useMemo(() =>
    mergeOptions(INITIAL_OPTIONS.expenseTypes, expenses.map(e => e.expense_type)), [expenses]);

  const [filterCategories, setFilterCategories] = useState(INITIAL_OPTIONS.expenseCategories);
  const [filterTypes,      setFilterTypes]      = useState(INITIAL_OPTIONS.expenseTypes);
  const catInit = useRef(false);
  const typInit = useRef(false);

  useEffect(() => {
    if (!catInit.current && allCategories.length) { setFilterCategories(allCategories); catInit.current = true; }
    else setFilterCategories(c => mergeOptions(c, allCategories));
  }, [allCategories]);

  useEffect(() => {
    if (!typInit.current && allTypes.length) { setFilterTypes(allTypes); typInit.current = true; }
    else setFilterTypes(t => mergeOptions(t, allTypes));
  }, [allTypes]);

  useEffect(() => {
    if (properties.length > 0) loadExpenses();
  }, [properties]);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const responses = await Promise.all(
        properties.map(prop =>
          fetch(`${API_URL}/expenses?property_id=${prop.id}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => data.map(e => ({ ...e, property_name: prop.name })))
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
    else alert('Failed to delete expense');
  };

  const filtered = useMemo(() => {
    let list = expenses.filter(e => {
      if (filterProperty !== 'all' && e.property_id !== parseInt(filterProperty)) return false;
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
  }, [expenses, filterProperty, filterCategories, filterTypes, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

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
        <div className="stat-card"><div className="stat-label">Total Expenses</div>
          <div className="stat-value text-danger">${total.toLocaleString()}</div></div>
        <div className="stat-card"><div className="stat-label">Transactions</div>
          <div className="stat-value">{filtered.length}</div></div>
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
              <MultiSelect label="Categories" options={allCategories} selected={filterCategories} onChange={setFilterCategories} />
              <MultiSelect label="Types"      options={allTypes}      selected={filterTypes}      onChange={setFilterTypes} />
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
                <option value="expense_date">Date</option>
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
          <div className="empty-state"><div className="empty-state-icon">💳</div>
            <div className="empty-state-text">No expenses found</div></div>
        ) : (
          <table>
            <thead><tr>
              <th>Date</th><th>Property</th><th>Category</th>
              <th>Type</th><th>Notes</th><th>Amount</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td>{fmtDate(e.expense_date)}</td>
                  <td>{e.property_name}</td>
                  <td>{e.expense_category}</td>
                  <td>{e.expense_type}</td>
                  <td>
                    <TruncatedCell text={e.notes} />
                  </td>
                  <td className="text-danger">${e.amount.toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-small" onClick={() => onEditExpense(e)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-small"    onClick={() => handleDelete(e.id)}>🗑 Delete</button>
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

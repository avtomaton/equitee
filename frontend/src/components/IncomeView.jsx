import { useState, useEffect, useMemo, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import { API_URL, getDateRanges, isDateInRange } from '../config.js';

export default function IncomeView({ properties, onAddIncome, onEditIncome }) {
  const [income, setIncome] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('income_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterProperty, setFilterProperty] = useState('all');
  const [filterTypes, setFilterTypes] = useState([]);
  const filterTypesInitialized = useRef(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');

  const allTypes = useMemo(
    () => [...new Set(income.map((i) => i.income_type))].sort(),
    [income]
  );

  useEffect(() => {
    if (properties.length > 0) loadIncome(properties);
  }, [properties]);

  useEffect(() => {
    if (!filterTypesInitialized.current && allTypes.length > 0) {
      setFilterTypes(allTypes);
      filterTypesInitialized.current = true;
    }
  }, [allTypes]);

  const loadIncome = async (props) => {
    try {
      setLoading(true);
      const responses = await Promise.all(
        props.map((prop) =>
          fetch(`${API_URL}/income?property_id=${prop.id}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => data.map((i) => ({ ...i, property_name: prop.name })))
        )
      );
      setIncome(responses.flat());
    } catch (error) {
      console.error('Error loading income:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIncome = async (incomeId) => {
    if (!confirm('Are you sure you want to delete this income record?')) return;
    try {
      const res = await fetch(`${API_URL}/income/${incomeId}`, { method: 'DELETE' });
      if (res.ok) loadIncome(properties);
      else alert('Failed to delete income record');
    } catch (error) {
      console.error('Error deleting income:', error);
    }
  };

  const filteredIncome = useMemo(() => {
    let filtered = income.filter((i) => {
      if (filterProperty !== 'all' && i.property_id !== parseInt(filterProperty)) return false;
      if (!filterTypes.includes(i.income_type)) return false;
      if (dateFilter !== 'all' && dateFilter !== 'custom') {
        const range = getDateRanges()[dateFilter];
        if (range && !isDateInRange(i.income_date, range.start, range.end)) return false;
      }
      if (dateFilter === 'custom' && customDateStart && customDateEnd) {
        if (!isDateInRange(i.income_date, new Date(customDateStart), new Date(customDateEnd)))
          return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const order = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'income_date') return order * (new Date(a.income_date) - new Date(b.income_date));
      if (sortBy === 'amount')      return order * (a.amount - b.amount);
      return 0;
    });

    return filtered;
  }, [income, filterProperty, filterTypes, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder]);

  const total = filteredIncome.reduce((sum, i) => sum + i.amount, 0);

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

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">Total Income</div>
          <div className="stat-value text-success">${total.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Transactions</div>
          <div className="stat-value">{filteredIncome.length}</div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Income</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)}>
                <option value="all">All Properties</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <MultiSelect label="Types" options={allTypes} selected={filterTypes} onChange={setFilterTypes} />
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                <option value="all">All Time</option>
                <option value="ytd">YTD</option>
                <option value="currentMonth">Current Month</option>
                <option value="currentYear">Current Year</option>
                <option value="lastYear">Last Year</option>
                <option value="custom">Custom Range</option>
              </select>
              {dateFilter === 'custom' && (
                <>
                  <input type="date" value={customDateStart} onChange={(e) => setCustomDateStart(e.target.value)} />
                  <input type="date" value={customDateEnd}   onChange={(e) => setCustomDateEnd(e.target.value)} />
                </>
              )}
            </div>
            <div className="sort-group">
              <span className="sort-label">Sort:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="income_date">Date</option>
                <option value="amount">Amount</option>
              </select>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filteredIncome.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-text">No income found</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Property</th><th>Type</th>
                <th>Description</th><th>Amount</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncome.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.income_date).toLocaleDateString()}</td>
                  <td>{item.property_name}</td>
                  <td>{item.income_type}</td>
                  <td>{item.description || '-'}</td>
                  <td className="text-success">${item.amount.toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-small" onClick={() => onEditIncome(item)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-small"    onClick={() => handleDeleteIncome(item.id)}>🗑 Delete</button>
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

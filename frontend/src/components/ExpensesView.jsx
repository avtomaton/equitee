import { useState, useEffect, useMemo, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import { API_URL, getDateRanges, isDateInRange } from '../config.js';

export default function ExpensesView({ properties, onAddExpense, onEditExpense }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('expense_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterProperty, setFilterProperty] = useState('all');
  const [filterCategories, setFilterCategories] = useState([]);
  const filterCategoriesInitialized = useRef(false);
  const [filterTypes, setFilterTypes] = useState([]);
  const filterTypesInitialized = useRef(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');

  const allTypes = useMemo(
    () => [...new Set(expenses.map((e) => e.expense_type))].sort(),
    [expenses]
  );
  const allCategories = useMemo(
    () => [...new Set(expenses.map((e) => e.expense_category))].sort(),
    [expenses]
  );

  useEffect(() => {
    if (properties.length > 0) loadExpenses(properties);
  }, [properties]);

  useEffect(() => {
    if (!filterTypesInitialized.current && allTypes.length > 0) {
      setFilterTypes(allTypes);
      filterTypesInitialized.current = true;
    }
    if (!filterCategoriesInitialized.current && allCategories.length > 0) {
      setFilterCategories(allCategories);
      filterCategoriesInitialized.current = true;
    }
  }, [allTypes, allCategories]);

  const loadExpenses = async (props) => {
    try {
      setLoading(true);
      const responses = await Promise.all(
        props.map((prop) =>
          fetch(`${API_URL}/expenses?property_id=${prop.id}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => data.map((i) => ({ ...i, property_name: prop.name })))
        )
      );
      setExpenses(responses.flat());
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      const res = await fetch(`${API_URL}/expenses/${expenseId}`, { method: 'DELETE' });
      if (res.ok) loadExpenses(properties);
      else alert('Failed to delete expense');
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  };

  const filteredExpenses = useMemo(() => {
    let filtered = expenses.filter((e) => {
      if (filterProperty !== 'all' && e.property_id !== parseInt(filterProperty)) return false;
      if (!filterCategories.includes(e.expense_category)) return false;
      if (!filterTypes.includes(e.expense_type)) return false;
      if (dateFilter !== 'all' && dateFilter !== 'custom') {
        const range = getDateRanges()[dateFilter];
        if (range && !isDateInRange(e.expense_date, range.start, range.end)) return false;
      }
      if (dateFilter === 'custom' && customDateStart && customDateEnd) {
        if (!isDateInRange(e.expense_date, new Date(customDateStart), new Date(customDateEnd)))
          return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const order = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'expense_date') return order * (new Date(a.expense_date) - new Date(b.expense_date));
      if (sortBy === 'amount')       return order * (a.amount - b.amount);
      return 0;
    });

    return filtered;
  }, [expenses, filterProperty, filterCategories, filterTypes, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder]);

  const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

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

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">Total Expenses</div>
          <div className="stat-value text-danger">${total.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Transactions</div>
          <div className="stat-value">{filteredExpenses.length}</div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Expenses</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)}>
                <option value="all">All Properties</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <MultiSelect label="Categories" options={allCategories} selected={filterCategories} onChange={setFilterCategories} />
              <MultiSelect label="Types"      options={allTypes}      selected={filterTypes}      onChange={setFilterTypes} />
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
                <option value="expense_date">Date</option>
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
        ) : filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💳</div>
            <div className="empty-state-text">No expenses found</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Property</th><th>Category</th>
                <th>Type</th><th>Description</th><th>Amount</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{new Date(expense.expense_date).toLocaleDateString()}</td>
                  <td>{expense.property_name}</td>
                  <td>{expense.expense_category}</td>
                  <td>{expense.expense_type}</td>
                  <td>{expense.description || '-'}</td>
                  <td className="text-danger">${expense.amount.toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-small" onClick={() => onEditExpense(expense)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-small"    onClick={() => handleDeleteExpense(expense.id)}>🗑 Delete</button>
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

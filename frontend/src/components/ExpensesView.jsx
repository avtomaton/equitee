import { useState } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import StatCard from './StatCard.jsx';
import DateRangeFilter from './DateRangeFilter.jsx';
import ResetColumnsButton from './ResetColumnsButton.jsx';
import { INITIAL_OPTIONS } from '../config.js';
import { fmtDate } from './uiHelpers.jsx';
import { PropertyOptions } from '../modals/ModalBase.jsx';
import useTransactionView from '../hooks/useTransactionView.js';

const TAX_OPTIONS = ['Deductible', 'Non-deductible'];
const isTaxDeductible = e => !(e.tax_deductible === 0 || e.tax_deductible === false);

export default function ExpensesView({ properties, onAddExpense, onEditExpense, initialPropertyId }) {
  const tx = useTransactionView({
    viewName: 'expenses', endpoint: 'expenses',
    dateField: 'expense_date', defaultSortBy: 'expense_date',
    properties, initialPropertyId,
    seedTypeOptions:     INITIAL_OPTIONS.expenseTypes,      typeField: 'expense_type',
    seedCategoryOptions: INITIAL_OPTIONS.expenseCategories, categoryField: 'expense_category',
  });

  // Tax filter is expenses-only, managed locally
  const [taxFilter, setTaxFilter] = useState(TAX_OPTIONS);

  const { colVis, allColKeys, allColLabels, propName } = tx;
  const { visible, update: setVisible, col, isCustom, reset } = colVis;

  // Apply tax filter on top of the hook's filtered list
  const filtered = tx.filtered.filter(e => {
    const label = isTaxDeductible(e) ? 'Deductible' : 'Non-deductible';
    return taxFilter.includes(label);
  });

  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);
  const isFiltered    = filteredTotal !== tx.baseTotal;
  const pct           = tx.baseTotal > 0 ? ((filteredTotal / tx.baseTotal) * 100).toFixed(1) : '100';
  const amountSub     = isFiltered ? `$${tx.baseTotal.toLocaleString()} unfiltered · ${pct}% shown` : null;
  const txSub         = isFiltered ? `${tx.baseRecords.length} unfiltered` : null;

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
              <select value={tx.filterProperty} onChange={e => tx.setFilterProperty(e.target.value)}>
                <PropertyOptions properties={properties} placeholder="All Properties" />
              </select>
              <MultiSelect label="Category" options={tx.allCategories} selected={tx.filterCategories} onChange={tx.setFilterCategories} />
              <MultiSelect label="Type"     options={tx.allTypes}      selected={tx.filterTypes}      onChange={tx.setFilterTypes} />
              <MultiSelect label="Tax" options={TAX_OPTIONS} selected={taxFilter} onChange={setTaxFilter} />
              <DateRangeFilter
                value={tx.dateFilter}      onChange={tx.setDateFilter}
                customStart={tx.customDateStart} onCustomStart={tx.setCustomDateStart}
                customEnd={tx.customDateEnd}     onCustomEnd={tx.setCustomDateEnd}
              />
              <MultiSelect label="Columns" options={allColKeys} selected={visible} onChange={setVisible} labelMap={allColLabels} />
              {isCustom && <ResetColumnsButton onClick={reset} />}
            </div>
            <div className="sort-group">
              <span className="sort-label">Sort:</span>
              <select value={tx.sortBy} onChange={e => tx.setSortBy(e.target.value)}>
                <option value="expense_date">Date</option>
                <option value="amount">Amount</option>
              </select>
              <button className="btn btn-secondary btn-small"
                onClick={() => tx.setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
                {tx.sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {tx.loading ? <div className="loading"><div className="spinner" /></div>
        : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">💳</div>
            <div className="empty-state-text">No expenses found</div></div>
        ) : (
          <div className="table-scroll-wrap">
            <table>
              <thead><tr>
                {col('date')           && <th className="col-shrink">Date</th>}
                {col('property')       && <th className="col-fill">Property</th>}
                {col('amount')         && <th className="col-shrink">Amount</th>}
                {col('category')       && <th className="col-shrink">Category</th>}
                {col('type')           && <th className="col-shrink">Type</th>}
                {col('tax_deductible') && <th className="col-shrink" title="Tax Deductible">Tax Ded.</th>}
                {col('notes')          && <th className="col-fill">Notes</th>}
                <th style={{ width: 52 }}></th>
              </tr></thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}>
                    {col('date')           && <td className="col-shrink">{fmtDate(e.expense_date)}</td>}
                    {col('property')       && <td className="col-fill"><TruncatedCell text={e.property_name} /></td>}
                    {col('amount')         && <td className="col-shrink text-danger">${e.amount.toLocaleString()}</td>}
                    {col('category')       && <td className="col-shrink">{e.expense_category}</td>}
                    {col('type')           && <td className="col-shrink">{e.expense_type}</td>}
                    {col('tax_deductible') && (
                      <td className="col-shrink" style={{ textAlign: 'center' }}>
                        {isTaxDeductible(e)
                          ? <span title="Tax deductible"     style={{ color: 'var(--color-success, #22c55e)' }}>✓</span>
                          : <span title="Not tax deductible" style={{ color: 'var(--text-tertiary)' }}>✗</span>}
                      </td>
                    )}
                    {col('notes')          && <td className="col-fill"><TruncatedCell text={e.notes} /></td>}
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-icon" title="Edit"   onClick={() => onEditExpense(e)}>✏️</button>
                        <button className="btn btn-danger    btn-icon" title="Delete" onClick={() => tx.handleDelete(e.id)}>🗑</button>
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

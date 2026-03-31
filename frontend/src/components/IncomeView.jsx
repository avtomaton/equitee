import { useEffect, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import StatCard from './StatCard.jsx';
import DateRangeFilter from './DateRangeFilter.jsx';
import ResetColumnsButton from './ResetColumnsButton.jsx';
import { INITIAL_OPTIONS } from '../config.js';
import { fmtDate } from './uiHelpers.jsx';
import { PropertyOptions } from '../modals/ModalBase.jsx';
import useTransactionView from '../hooks/useTransactionView.js';

export default function IncomeView({ properties, onAddIncome, onEditIncome, initialPropertyId, onRegisterReload }) {
  const tx = useTransactionView({
    viewName: 'income', endpoint: 'income',
    dateField: 'income_date', defaultSortBy: 'income_date',
    properties, initialPropertyId,
    seedTypeOptions: INITIAL_OPTIONS.incomeTypes, typeField: 'income_type',
  });

  // Register tx.load with App so handleSave can await it before restoring scroll
  const loadRef = useRef(tx.load);
  loadRef.current = tx.load;
  useEffect(() => {
    onRegisterReload?.(() => loadRef.current());
    return () => onRegisterReload?.(null);
  }, [onRegisterReload]);

  const { colVis, allColKeys, allColLabels, propName } = tx;
  const { visible, update: setVisible, col, isCustom, reset } = colVis;

  const amountSub = tx.isFiltered ? `$${tx.baseTotal.toLocaleString()} unfiltered · ${tx.pct}% shown` : null;
  const txSub     = tx.isFiltered ? `${tx.baseRecords.length} unfiltered` : null;

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
          value={`$${tx.filteredTotal.toLocaleString()}`}
          cls="text-success"
          sub={amountSub}
        />
        <StatCard
          label={propName ? `Transactions — ${propName}` : 'Transactions'}
          value={tx.filtered.length}
          sub={txSub}
        />
      </div>

      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Income</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={tx.filterProperty} onChange={e => tx.setFilterProperty(e.target.value)}
                className={tx.filterProperty !== 'all' ? 'filter-active' : ''}>
                <PropertyOptions properties={properties} placeholder="All Properties" placeholderValue="all" />
              </select>
              <MultiSelect label="Type" options={tx.allTypes} selected={tx.filterTypes} onChange={tx.setFilterTypes} />
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
                <option value="income_date">Date</option>
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
        : tx.filtered.length === 0 ? (
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
                {tx.filtered.map(i => (
                  <tr key={i.id}>
                    {col('date')     && <td className="col-shrink">{fmtDate(i.income_date)}</td>}
                    {col('property') && <td className="col-fill"><TruncatedCell text={i.property_name} /></td>}
                    {col('amount')   && <td className="col-shrink text-success">${i.amount.toLocaleString()}</td>}
                    {col('type')     && <td className="col-shrink">{i.income_type}</td>}
                    {col('notes')    && <td className="col-fill"><TruncatedCell text={i.notes} /></td>}
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-icon" title="Edit"   onClick={() => onEditIncome(i)}>✏️</button>
                        <button className="btn btn-danger    btn-icon" title="Delete" onClick={() => tx.handleDelete(i.id)}>🗑</button>
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

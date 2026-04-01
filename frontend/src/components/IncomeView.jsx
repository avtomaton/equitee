import { useState, useEffect, useRef, useMemo } from 'react';
import { useChartJs } from '../hooks/useChartJs.js';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import StatCard from './StatCard.jsx';
import DateRangeFilter from './DateRangeFilter.jsx';
import ResetColumnsButton from './ResetColumnsButton.jsx';
import { INITIAL_OPTIONS } from '../config.js';
import { fmtDate } from './uiHelpers.jsx';
import { PropertyOptions } from '../modals/ModalBase.jsx';
import useTransactionView from '../hooks/useTransactionView.js';


const INCOME_TYPE_COLORS = {
  Rent:     '#10b981',
  Deposit:  '#3b82f6',
  Parking:  '#f59e0b',
  Laundry:  '#8b5cf6',
  Other:    '#888780',
};
const incomeColorFor = t => INCOME_TYPE_COLORS[t] ?? '#888780';

function IncomePieChart({ filtered }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const { ready: chartReady } = useChartJs();

  const slices = useMemo(() => {
    const totals = {};
    for (const r of filtered) totals[r.income_type] = (totals[r.income_type] || 0) + r.amount;
    return Object.entries(totals).map(([t, amount]) => ({ t, amount })).sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  useEffect(() => {
    if (!chartReady || !canvasRef.current || !slices.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const total = slices.reduce((s, x) => s + x.amount, 0);
    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: slices.map(x => x.t),
        datasets: [{ data: slices.map(x => x.amount), backgroundColor: slices.map(x => incomeColorFor(x.t)), borderColor: 'rgba(0,0,0,0)', borderWidth: 0, hoverOffset: 6 }],
      },
      options: {
        cutout: '62%', animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` $${Math.round(ctx.parsed).toLocaleString()} (${(ctx.parsed / total * 100).toFixed(1)}%)` } },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [slices, chartReady]);

  if (!slices.length) return null;
  const total = slices.reduce((s, x) => s + x.amount, 0);
  return (
    <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '1rem 0' }}>
      <div style={{ position: 'relative', width: 200, height: 200, flexShrink: 0 }}>
        <canvas ref={canvasRef} width={200} height={200} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: 2 }}>Total</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>${Math.round(total).toLocaleString()}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minWidth: 160 }}>
        {slices.map(({ t, amount }) => {
          const pct = total > 0 ? (amount / total * 100).toFixed(1) : 0;
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: incomeColorFor(t) }} />
              <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, minWidth: 72, textAlign: 'right' }}>${Math.round(amount).toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  const [breakdownOpen, setBreakdownOpen] = useState(false);

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

      {/* ── Breakdown chart ─────────────────────────────────────────────────── */}
      <div className="table-container" style={{ marginBottom: '1rem' }}>
        <div className="table-header" onClick={() => setBreakdownOpen(o => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <div className="table-title">📊 Breakdown by Type</div>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>{breakdownOpen ? '▲ collapse' : '▼ expand'}</span>
        </div>
        {breakdownOpen && (
          tx.loading
            ? <div className="loading"><div className="spinner" /></div>
            : tx.filtered.length === 0
              ? <div className="empty-state" style={{ padding: '1.5rem' }}><div className="empty-state-text">No income in this period</div></div>
              : <div style={{ padding: '0 1.5rem' }}><IncomePieChart filtered={tx.filtered} /></div>
        )}
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

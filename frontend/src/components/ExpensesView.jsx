import { useState, useEffect, useRef, useMemo } from 'react';
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

// Colour palette for category slices (matches FinancialSummaryPanel where possible)
const CAT_COLORS = {
  Mortgage:    '#378ADD',
  Principal:   '#B5D4F4',
  Management:  '#1D9E75',
  Insurance:   '#5DCAA5',
  Tax:         '#EF9F27',
  Utilities:   '#F0997B',
  Maintenance: '#7F77DD',
  Renovation:  '#E06B9A',
  Capital:     '#9B6FD4',
  Travel:      '#60C4D6',
  Other:       '#888780',
};
const colorFor = cat => CAT_COLORS[cat] ?? '#888780';

// ── Chart.js loader (singleton, same pattern as FinancialSummaryPanel) ────────
let chartJsLoaded = false;
function loadChartJs(cb) {
  if (window.Chart) { cb(); return; }
  if (chartJsLoaded) { const t = setInterval(() => { if (window.Chart) { clearInterval(t); cb(); } }, 50); return; }
  chartJsLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
  s.onload = cb;
  document.head.appendChild(s);
}

// ── Pie chart component ───────────────────────────────────────────────────────
function ExpensesPieChart({ filtered }) {
  const canvasRef   = useRef(null);
  const chartRef    = useRef(null);

  const slices = useMemo(() => {
    const totals = {};
    for (const e of filtered) {
      totals[e.expense_category] = (totals[e.expense_category] || 0) + e.amount;
    }
    return Object.entries(totals)
      .map(([cat, amount]) => ({ cat, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  useEffect(() => {
    loadChartJs(() => {
      if (!canvasRef.current || !slices.length) return;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

      const total = slices.reduce((s, x) => s + x.amount, 0);
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'doughnut',
        data: {
          labels: slices.map(x => x.cat),
          datasets: [{
            data:            slices.map(x => x.amount),
            backgroundColor: slices.map(x => colorFor(x.cat)),
            borderColor:     'rgba(0,0,0,0)',
            borderWidth:     0,
            hoverOffset:     6,
          }],
        },
        options: {
          cutout: '62%',
          animation: { duration: 300 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
                  return ` $${Math.round(ctx.parsed).toLocaleString()} (${pct}%)`;
                },
              },
            },
          },
        },
      });
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [slices]);

  if (!slices.length) return null;

  const total = slices.reduce((s, x) => s + x.amount, 0);

  return (
    <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '1rem 0' }}>
      {/* Doughnut */}
      <div style={{ position: 'relative', width: 200, height: 200, flexShrink: 0 }}>
        <canvas ref={canvasRef} width={200} height={200} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: 2 }}>Total</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ${Math.round(total).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minWidth: 180 }}>
        {slices.map(({ cat, amount }) => {
          const pct = total > 0 ? (amount / total * 100).toFixed(1) : 0;
          return (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span style={{
                width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                background: colorFor(cat),
              }} />
              <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{cat}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, minWidth: 72, textAlign: 'right' }}>
                ${Math.round(amount).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function ExpensesView({ properties, onAddExpense, onEditExpense, initialPropertyId, onRegisterReload }) {
  const tx = useTransactionView({
    viewName: 'expenses', endpoint: 'expenses',
    dateField: 'expense_date', defaultSortBy: 'expense_date',
    properties, initialPropertyId,
    seedTypeOptions:     INITIAL_OPTIONS.expenseTypes,      typeField: 'expense_type',
    seedCategoryOptions: INITIAL_OPTIONS.expenseCategories, categoryField: 'expense_category',
  });

  // Register tx.load with App so handleSave can await it before restoring scroll
  const loadRef = useRef(tx.load);
  loadRef.current = tx.load;
  useEffect(() => {
    onRegisterReload?.(() => loadRef.current());
    return () => onRegisterReload?.(null);
  }, [onRegisterReload]);

  // Tax filter is expenses-only, managed locally
  const [taxFilter,      setTaxFilter]      = useState(TAX_OPTIONS);
  const [breakdownOpen,  setBreakdownOpen]  = useState(false);

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

      {/* ── Breakdown chart ─────────────────────────────────────────────────── */}
      <div className="table-container" style={{ marginBottom: '1rem' }}>
        <div
          className="table-header"
          onClick={() => setBreakdownOpen(o => !o)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <div className="table-title">📊 Breakdown by Category</div>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
            {breakdownOpen ? '▲ collapse' : '▼ expand'}
          </span>
        </div>
        {breakdownOpen && (
          tx.loading
            ? <div className="loading"><div className="spinner" /></div>
            : filtered.length === 0
              ? <div className="empty-state" style={{ padding: '1.5rem' }}><div className="empty-state-text">No expenses in this period</div></div>
              : <div style={{ padding: '0 1.5rem' }}>
                  <ExpensesPieChart filtered={filtered} />
                </div>
        )}
      </div>

      {/* ── Transactions table ──────────────────────────────────────────────── */}
      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Expenses</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={tx.filterProperty} onChange={e => tx.setFilterProperty(e.target.value)}
                className={tx.filterProperty !== 'all' ? 'filter-active' : ''}>
                <PropertyOptions properties={properties} placeholder="All Properties" placeholderValue="all" />
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

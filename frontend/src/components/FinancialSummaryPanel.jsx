import { useState, useMemo, useRef, useEffect } from 'react';
import { principalInRange, computeMortgagePrincipal, monthlyMortgageEquiv } from '../metrics.js';
import { parseLocalDate } from '../utils.js';

// ── Category definitions ──────────────────────────────────────────────────────

const FLAT_CATS = [
  { key: 'interest',   label: 'Mortgage interest', color: '#378ADD' },
  { key: 'principal',  label: 'Principal',          color: '#B5D4F4' },
  { key: 'management', label: 'Condo / mgmt',       color: '#1D9E75' },
  { key: 'insurance',  label: 'Insurance',           color: '#5DCAA5' },
  { key: 'tax',        label: 'Property tax',        color: '#EF9F27' },
  { key: 'utilities',  label: 'Utilities',           color: '#F0997B' },
  { key: 'maint',      label: 'Maintenance',         color: '#7F77DD' },
  { key: 'other',      label: 'Other',               color: '#888780' },
];

const BREAKDOWN = [
  {
    key: 'mortgage', label: 'Mortgage', color: '#378ADD', isGroup: true,
    children: [
      { key: 'interest',  label: 'Interest',  color: '#378ADD' },
      { key: 'principal', label: 'Principal', color: '#B5D4F4' },
    ],
  },
  { key: 'management', label: 'Condo / mgmt', color: '#1D9E75' },
  { key: 'insurance',  label: 'Insurance',    color: '#5DCAA5' },
  { key: 'tax',        label: 'Property tax', color: '#EF9F27' },
  { key: 'utilities',  label: 'Utilities',    color: '#F0997B' },
  { key: 'maint',      label: 'Maintenance',  color: '#7F77DD' },
  { key: 'other',      label: 'Other',        color: '#888780' },
];

const TABS = [
  { id: 'monthly',   label: 'Monthly avg' },
  { id: 'curMonth',  label: 'This month'  },
  { id: 'prevMonth', label: 'Last month'  },
  { id: 'thisYear',  label: 'This year'   },
  { id: 'ytd',       label: 'YTD'         },
  { id: 'lastYear',  label: 'Last year'   },
  { id: 'total',     label: 'All time'    },
];

const PIE_TABS = new Set(['monthly', 'curMonth', 'prevMonth', 'total']);

const fmt = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();

const CELL_TOOLTIPS = [
  'All income recorded in this period.',
  'All expenses including principal repayments and down payments.',
  'Total principal repaid — equity built through mortgage payments.',
  'Income minus total expenses — net cash position after all payments.',
  'Income minus expenses excluding principal — true operating profitability.',
];

// ── Date windows ──────────────────────────────────────────────────────────────

function getWindows() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth();
  const mo3End   = new Date(y, m, 0, 23, 59, 59);
  const mo3Start = new Date(mo3End.getFullYear(), mo3End.getMonth() - 2, 1);
  return {
    monthly:   { start: mo3Start,               end: mo3End,                                divisor: 3 },
    curMonth:  { start: new Date(y, m, 1),       end: now                                              },
    prevMonth: { start: new Date(y, m - 1, 1),   end: new Date(y, m, 0, 23, 59, 59)                   },
    thisYear:  { start: new Date(y, 0, 1),        end: now                                              },
    ytd:       { start: new Date(y - 1, m, now.getDate()), end: now                                    },
    lastYear:  { start: new Date(y - 1, 0, 1),   end: new Date(y - 1, 11, 31, 23, 59, 59)             },
    total:     { start: new Date(0),              end: now                                              },
  };
}

// ── Core computation ──────────────────────────────────────────────────────────

function computeWindow(properties, allIncome, allExpenses, start, end, divisor = 1) {
  const inRange = dateStr => {
    if (!dateStr) return false;
    const d = parseLocalDate(dateStr);
    return d && d >= start && d <= end;
  };

  const income       = allIncome.filter(r => inRange(r.income_date)).reduce((s, r) => s + r.amount, 0) / divisor;
  const filteredExp  = allExpenses.filter(r => inRange(r.expense_date));
  const totalExpenses = filteredExp.reduce((s, r) => s + r.amount, 0) / divisor;

  let principal = 0, interest = 0;
  for (const p of properties) {
    const propExp      = allExpenses.filter(r => r.property_id === p.id);
    principal         += principalInRange(propExp, p.loan_amount, p.mortgage_rate || 0, start, end);
    const mortRecs     = propExp.filter(r => r.expense_category === 'Mortgage');
    const annotated    = computeMortgagePrincipal(mortRecs, p.loan_amount, p.mortgage_rate || 0);
    const prinInWin    = annotated.filter(r => inRange(r.expense_date)).reduce((s, r) => s + r.principal, 0);
    const mortInWin    = propExp.filter(r => r.expense_category === 'Mortgage' && inRange(r.expense_date)).reduce((s, r) => s + r.amount, 0);
    interest          += Math.max(0, mortInWin - prinInWin);
  }
  principal /= divisor;
  interest  /= divisor;

  const byCategory = cat => filteredExp.filter(r => r.expense_category === cat).reduce((s, r) => s + r.amount, 0) / divisor;
  const cats = {
    interest, principal,
    mortgage:    interest + principal,
    management:  byCategory('Management'),
    insurance:   byCategory('Insurance'),
    tax:         byCategory('Tax'),
    utilities:   byCategory('Utilities'),
    maint:       byCategory('Maintenance') + byCategory('Capital'),
    other:       byCategory('Other'),
  };

  const balance  = income - totalExpenses;
  const opProfit = balance + principal;
  return { income, totalExpenses, principal, balance, opProfit, cats };
}

// ── Expected computation ──────────────────────────────────────────────────────

function computeExpected(properties, allExpenses) {
  let expIncome = 0, expManagement = 0, expInsurance = 0, expTax = 0;
  let expUtilities = 0, expMaint = 0, expMortgage = 0;
  let hasData = false;

  for (const p of properties) {
    expIncome += p.monthly_rent || 0;
    const opex = (p.expected_condo_fees || 0) + (p.expected_insurance || 0)
               + (p.expected_utilities || 0) + (p.expected_misc_expenses || 0)
               + (p.annual_property_tax || 0);
    const hasMtgPayment = (p.mortgage_payment || 0) > 0;
    const propExp       = allExpenses.filter(r => r.property_id === p.id);
    const recordedMtg   = propExp.filter(r => r.expense_category === 'Mortgage');
    if (opex === 0 && !hasMtgPayment && recordedMtg.length === 0) continue;

    hasData = true;
    expManagement += p.expected_condo_fees    || 0;
    expInsurance  += p.expected_insurance     || 0;
    expTax        += (p.annual_property_tax   || 0) / 12;
    expUtilities  += p.expected_utilities     || 0;
    expMaint      += p.expected_misc_expenses || 0;

    if (hasMtgPayment) {
      expMortgage += monthlyMortgageEquiv(p.mortgage_payment, p.mortgage_frequency);
    } else if (recordedMtg.length > 0) {
      const recent = [...recordedMtg].sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)).slice(0, 3);
      expMortgage += recent.reduce((s, r) => s + r.amount, 0) / recent.length;
    }
  }

  if (!hasData && expIncome === 0) return null;
  const expTotalExp = expManagement + expInsurance + expTax + expUtilities + expMaint + expMortgage;
  return {
    income: expIncome, totalExp: expTotalExp, balance: expIncome - expTotalExp,
    mortgage: expMortgage,
    cats: { management: expManagement, insurance: expInsurance, tax: expTax, utilities: expUtilities, maint: expMaint },
  };
}

// ── Bar chart data ────────────────────────────────────────────────────────────

function buildBarData(properties, allIncome, allExpenses, tabId) {
  const now = new Date(), y = now.getFullYear();
  const months = [], labels = [];
  if (tabId === 'lastYear') {
    for (let mo = 0; mo < 12; mo++) {
      labels.push(new Date(y - 1, mo, 1).toLocaleString('default', { month: 'short' }));
      months.push({ start: new Date(y - 1, mo, 1), end: new Date(y - 1, mo + 1, 0, 23, 59, 59) });
    }
  } else if (tabId === 'thisYear') {
    for (let mo = 0; mo <= now.getMonth(); mo++) {
      labels.push(new Date(y, mo, 1).toLocaleString('default', { month: 'short' }));
      months.push({ start: new Date(y, mo, 1), end: new Date(y, mo + 1, 0, 23, 59, 59) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(y, now.getMonth() - i, 1);
      labels.push(d.toLocaleString('default', { month: 'short' }));
      months.push({ start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) });
    }
  }
  return { labels, data: months.map(({ start, end }) => computeWindow(properties, allIncome, allExpenses, start, end).cats) };
}

// ── Chart.js ─────────────────────────────────────────────────────────────────

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

let chartInstance = null;
function destroyChart() { if (chartInstance) { chartInstance.destroy(); chartInstance = null; } }

function buildBarChart(canvas, labels, data) {
  destroyChart();
  chartInstance = new window.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: FLAT_CATS.map(c => ({ label: c.label, data: data.map(d => Math.round(d[c.key] || 0)), backgroundColor: c.color, stack: 'exp', borderWidth: 0 })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: $${ctx.raw.toLocaleString()}` } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, color: '#888780', autoSkip: false, maxRotation: 0 } },
        y: { stacked: true, grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 11 }, color: '#888780', callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } },
      },
    },
  });
}

function buildPieChart(canvas, cats) {
  destroyChart();
  const items = FLAT_CATS.map(c => ({ label: c.label, value: Math.round(cats[c.key] || 0), color: c.color })).filter(i => i.value > 0);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  chartInstance = new window.Chart(canvas, {
    type: 'doughnut',
    data: { labels: items.map(i => i.label), datasets: [{ data: items.map(i => i.value), backgroundColor: items.map(i => i.color), borderWidth: 1, borderColor: 'rgba(128,128,128,0.2)' }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: $${ctx.raw.toLocaleString()} (${Math.round(ctx.raw / total * 100)}%)` } },
      },
    },
  });
}

// ── Sub-component ─────────────────────────────────────────────────────────────

const ExpBadge = ({ val }) => (
  <span style={{
    fontSize: '0.66rem', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0,
    background: 'var(--bg-tertiary, var(--color-background-secondary))',
    border: '1px solid var(--border, var(--color-border-tertiary))',
    color: 'var(--text-secondary)',
  }}>exp {fmt(val)}</span>
);

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinancialSummaryPanel({ properties, allIncome, allExpenses }) {
  const [tab,       setTab]       = useState('monthly');
  const [chartOpen, setChartOpen] = useState(false);
  const canvasRef = useRef(null);

  const { periods, expected } = useMemo(() => {
    if (!properties.length) return { periods: null, expected: null };
    const wins = getWindows();
    const computed = {};
    for (const [id, { start, end, divisor = 1 }] of Object.entries(wins)) {
      computed[id] = computeWindow(properties, allIncome, allExpenses, start, end, divisor);
    }
    return { periods: computed, expected: computeExpected(properties, allExpenses) };
  }, [properties, allIncome, allExpenses]);

  const barData = useMemo(() => {
    if (!periods || PIE_TABS.has(tab)) return null;
    return buildBarData(properties, allIncome, allExpenses, tab);
  }, [periods, tab, properties, allIncome, allExpenses]);

  useEffect(() => {
    if (!chartOpen || !canvasRef.current || !periods) return;
    const d = periods[tab];
    loadChartJs(() => {
      if (!canvasRef.current) return;
      if (PIE_TABS.has(tab)) { buildPieChart(canvasRef.current, d.cats); }
      else if (barData)       { buildBarChart(canvasRef.current, barData.labels, barData.data); }
    });
    return destroyChart;
  }, [chartOpen, tab, periods, barData]);

  if (!periods) return null;

  const d        = periods[tab];
  const showExp  = tab === 'monthly' && !!expected;
  const isPie    = PIE_TABS.has(tab);
  const catTotal = FLAT_CATS.reduce((s, c) => s + (d.cats[c.key] || 0), 0) || 1;
  const expOpProfit = showExp ? expected.balance + d.principal : null;

  // ── Flatten breakdown rows ──────────────────────────────────────────────────
  const breakdownRows = [];
  for (const item of BREAKDOWN) {
    if (item.isGroup) {
      const parentVal = item.children.reduce((s, ch) => s + (d.cats[ch.key] || 0), 0);
      if (!parentVal) continue;
      breakdownRows.push({ key: item.key, label: item.label, color: item.color, val: parentVal, isParent: true });
      for (const ch of item.children) {
        if (d.cats[ch.key] > 0) breakdownRows.push({ key: ch.key, label: ch.label, color: ch.color, val: d.cats[ch.key], isChild: true });
      }
    } else {
      const val    = d.cats[item.key] || 0;
      const expVal = showExp ? (expected.cats[item.key] ?? null) : null;
      if (val > 0 || (expVal && expVal > 0)) breakdownRows.push({ key: item.key, label: item.label, color: item.color, val, expVal });
    }
  }

  // simple balanced partition with grouped items
  const breakdownBlocks = [];
  let breakdownBlockCount = 0;

  while (breakdownBlockCount < breakdownRows.length) {
    const row = breakdownRows[breakdownBlockCount];

    if (row.isParent) {
      const block = [row];
      breakdownBlockCount++;

      while (breakdownBlockCount < breakdownRows.length && breakdownRows[breakdownBlockCount].isChild) {
        block.push(breakdownRows[breakdownBlockCount]);
        breakdownBlockCount++;
      }

      breakdownBlocks.push(block);
    } else {
      breakdownBlocks.push([row]);
      breakdownBlockCount++;
    }
  }

  const leftRows = [];
  const rightRows = [];

  let leftCount = 0;
  let rightCount = 0;

  for (const block of breakdownBlocks) {
    if (leftCount <= rightCount) {
      leftRows.push(...block);
      leftCount += block.length;
    } else {
      rightRows.push(...block);
      rightCount += block.length;
    }
  }

  const renderRow = (row, isLast) => {
    const pct = Math.round((row.val || 0) / catTotal * 100);
    return (
      <div key={row.key} style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: row.isChild ? '2px 0 2px 12px' : '4px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--border, var(--color-border-tertiary))',
        minHeight: '26px',
      }}>
        {row.isChild
          ? <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: 1, flexShrink: 0 }}>↳</span>
          : <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: row.color, flexShrink: 0 }} />
        }
        <span style={{ fontSize: row.isChild ? '0.71rem' : '0.75rem', color: 'var(--text-secondary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.label}
        </span>
        {row.expVal != null && row.expVal > 0 && <ExpBadge val={row.expVal} />}
        <span style={{ fontSize: row.isChild ? '0.71rem' : '0.75rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {fmt(row.val)}
        </span>

        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', width: '27px', textAlign: 'right', flexShrink: 0 }}>
          {pct}%
        </span>
      </div>
    );
  };

  const summaryCells = [
    { label: 'Income',         val: d.income,        pos: true,    expVal: showExp ? expected.income   : null },
    { label: 'Total expenses', val: d.totalExpenses,  neg: true,   expVal: showExp ? expected.totalExp : null },
    { label: 'Principal paid', val: d.principal,     neutral: true, expVal: null },
    { label: 'Balance',        val: d.balance,       signed: true,  expVal: showExp ? expected.balance  : null },
    { label: 'Op. profit',     val: d.opProfit,      signed: true,  expVal: showExp ? expOpProfit       : null },
  ];

  return (
    <div style={{ background: 'var(--bg-secondary, var(--color-background-primary))', border: '1px solid var(--border, var(--color-border-tertiary))', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.25rem' }}>

      {/* Header + tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', gap: '12px', borderBottom: '1px solid var(--border, var(--color-border-tertiary))', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          Financial summary
        </span>
        <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-tertiary, var(--color-background-tertiary))', borderRadius: '8px', padding: '2px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontSize: '0.71rem', padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              border: tab === t.id ? '1px solid var(--border, var(--color-border-tertiary))' : 'none',
              background: tab === t.id ? 'var(--bg-secondary, var(--color-background-primary))' : 'transparent',
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: tab === t.id ? 600 : 400,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Summary cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', borderBottom: '1px solid var(--border, var(--color-border-tertiary))' }}>
        {summaryCells.map((cell, i) => {
          const color = cell.signed
            ? (cell.val >= 0 ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)')
            : cell.pos ? 'var(--success, #10b981)' : cell.neg ? 'var(--danger, #ef4444)' : 'var(--text-primary)';
          return (
            <div key={i} title={CELL_TOOLTIPS[i]} style={{ padding: '12px 14px', cursor: 'default', borderLeft: i > 0 ? '1px solid var(--border, var(--color-border-tertiary))' : 'none' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {cell.label}
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color, lineHeight: 1.2 }}>
                {fmt(cell.val)}
              </div>
              {cell.expVal !== null && <div style={{ marginTop: '4px' }}><ExpBadge val={cell.expVal} /></div>}
            </div>
          );
        })}
      </div>

      {/* Expense breakdown */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expenses breakdown</span>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(d.totalExpenses)}</span>
        </div>

        {/* Stacked bar */}
        <div style={{ height: '7px', borderRadius: '4px', display: 'flex', overflow: 'hidden', gap: '1px', marginBottom: '10px', background: 'var(--bg-tertiary, var(--color-background-tertiary))' }}>
          {FLAT_CATS.map(c => {
            const pct = (d.cats[c.key] || 0) / catTotal * 100;
            return pct > 0 ? <div key={c.key} title={`${c.label}: ${fmt(d.cats[c.key])}`} style={{ width: pct + '%', background: c.color, height: '100%', transition: 'width 0.3s ease' }} /> : null;
          })}
        </div>

        {/* Two-column grid with separator */}
        <div style={{ display: 'flex', gap: 0 }}>
          <div style={{ flex: 1, paddingRight: '10px', borderRight: '1px solid var(--border, var(--color-border-tertiary))' }}>
            {leftRows.map((row, idx) => renderRow(row, idx === leftRows.length - 1))}
          </div>
          <div style={{ flex: 1, paddingLeft: '10px' }}>
            {rightRows.map((row, idx) => renderRow(row, idx === rightRows.length - 1))}
          </div>
        </div>
      </div>

      {/* Chart toggle */}
      <div onClick={() => setChartOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 16px', cursor: 'pointer', userSelect: 'none', borderTop: '1px solid var(--border, var(--color-border-tertiary))', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
        <span>{isPie ? 'Expense breakdown chart' : 'Monthly expenses chart'}</span>
        <span style={{ fontSize: '0.65rem', transition: 'transform 0.2s', transform: chartOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>

      {/* Chart (collapsible) */}
      {chartOpen && (
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border, var(--color-border-tertiary))' }}>
          <div style={{ position: 'relative', height: isPie ? '200px' : '160px' }}>
            <canvas key={isPie ? 'pie' : 'bar'} ref={canvasRef} />
          </div>
          {!isPie && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
              {FLAT_CATS.map(c => (
                <span key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: c.color, display: 'inline-block' }} />
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

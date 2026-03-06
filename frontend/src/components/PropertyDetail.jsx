import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_URL, isCurrentTenant, fmtDate, yearsHeld, avgMonthly, principalInRange } from '../config.js';
import StatCard from './StatCard.jsx';
import MetricCard from './MetricCard.jsx';

const DETAIL_TOOLTIP_STYLE = {
  background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6',
};

export default function PropertyDetail({ property, properties = [], onSelectProperty, onBack, onAddExpense, onAddIncome, onAddTenant, onEdit, onJump }) {
  const [tenants,  setTenants]  = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [events,   setEvents]   = useState([]);

  const [income,    setIncome]    = useState([]);
  const [avgWindow, setAvgWindow] = useState(3);

  useEffect(() => {
    if (!property) return;
    fetch(`${API_URL}/tenants?property_id=${property.id}`)
      .then(r => r.ok ? r.json() : []).then(setTenants).catch(() => {});
    fetch(`${API_URL}/expenses?property_id=${property.id}`)
      .then(r => r.ok ? r.json() : []).then(setExpenses).catch(() => {});
    fetch(`${API_URL}/events?property_id=${property.id}`)
      .then(r => r.ok ? r.json() : []).then(setEvents).catch(() => {});
    fetch(`${API_URL}/income?property_id=${property.id}`)
      .then(r => r.ok ? r.json() : []).then(setIncome).catch(() => {});
  }, [property?.id]);

  if (!property) return null;

  const netIncome   = property.total_income - property.total_expenses; // kept for chart compat
  const currTenants = tenants.filter(isCurrentTenant);
  const recentExp   = [...expenses].sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)).slice(0, 5);

  // Last meaningful rent change: monthly_rent field, both old and new must be > 0
  const lastRentChange = useMemo(() => {
    const rentEvents = events
      .filter(e =>
        e.column_name === 'monthly_rent' &&
        parseFloat(e.old_value) > 0 &&
        parseFloat(e.new_value) > 0
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return rentEvents[0] ?? null;
  }, [events]);

  const downPmt   = property.purchase_price - property.loan_amount;
  const netExp    = property.total_expenses - downPmt;
  const netProfit = property.total_income - netExp;

  const chartData = [
    { name: 'Income',     value: property.total_income },
    { name: 'Net Exp',    value: Math.max(0, netExp) },
    { name: 'Net Profit', value: netProfit },
  ];

  const isVacant = property.status === 'Vacant';

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          {properties.length > 1 && (
            <select
              value={property.id}
              onChange={e => {
                const p = properties.find(x => x.id === Number(e.target.value));
                if (p) onSelectProperty?.(p);
              }}
              style={{
                padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.82rem',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', cursor: 'pointer', maxWidth: 220,
              }}
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={onEdit}>✏️ Edit</button>
          <button className="btn btn-secondary" onClick={onAddTenant}>+ Tenant</button>
          <button className="btn btn-secondary" onClick={onAddExpense}>+ Expense</button>
          <button className="btn btn-primary"   onClick={onAddIncome}>+ Income</button>
        </div>
      </div>

      {/* Title panel */}
      <div className="detail-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>{property.name}</h1>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>
              {property.address}, {property.city}, {property.province} {property.postal_code}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`property-badge ${property.status?.toLowerCase()}`}>{property.status}</span>
              {property.type && (
                <span className="property-badge" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                  {property.type}
                </span>
              )}
              {/* Last rent change indicator */}
              {lastRentChange ? (
                <span style={{
                  fontSize: '0.8rem', color: 'var(--text-secondary)',
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '0.2rem 0.6rem'
                }}>
                  Last rent change: <strong style={{ color: 'var(--text-primary)' }}>
                    {new Date(lastRentChange.created_at).toLocaleDateString()}
                  </strong>
                  {' '}(was ${parseFloat(lastRentChange.old_value).toLocaleString()}/mo)
                </span>
              ) : !isVacant && (
                <span style={{
                  fontSize: '0.8rem', color: 'var(--text-tertiary)',
                  fontStyle: 'italic'
                }}>
                  No rent changes recorded
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Jump buttons */}
      <div className="jump-buttons">
        {[
          { label: '💳 Expenses', view: 'expenses' },
          { label: '💰 Income',   view: 'income'   },
          { label: '👤 Tenants',  view: 'tenants'  },
          { label: '📝 Events',   view: 'events'   },
        ].map(({ label, view }) => (
          <button key={view} className="btn btn-secondary" onClick={() => onJump(view, property.id)}>
            {label} →
          </button>
        ))}
      </div>

      {/* Stats */}
      {(() => {
        const equity    = property.market_price - property.loan_amount;
        const equityPct = property.market_price > 0 ? equity / property.market_price * 100 : null;
        const loanPct   = property.market_price > 0 ? property.loan_amount / property.market_price * 100 : null;
        const downPmt   = property.purchase_price - property.loan_amount;
        const appr      = property.market_price - property.purchase_price;
        const apprPct   = property.purchase_price > 0 ? appr / property.purchase_price * 100 : null;
        const yrs       = yearsHeld(property);
        const yearlyAppr    = yrs ? appr / yrs : null;
        const yearlyApprPct = (yrs && property.purchase_price > 0) ? yearlyAppr / property.purchase_price * 100 : null;
        const now = new Date();
        const yearFrac = (now - new Date(now.getFullYear(), 0, 1)) / (365.25 * 86400000);
        const projectedYE = property.market_price + appr * (1 - yearFrac);

        const totalNetExp  = property.total_expenses - downPmt;
        const totalNetProfit = property.total_income - totalNetExp;
        const balance      = property.total_income - property.total_expenses;
        const sellingProfit = property.market_price + property.total_income
                              - property.total_expenses - property.loan_amount;
        const sellingPct    = property.total_expenses > 0
          ? (sellingProfit / property.total_expenses * 100).toFixed(1) : null;
        const roi          = property.market_price > 0 ? totalNetProfit / property.market_price * 100 : null;

        // YTD (trailing 12 months)
        const ytdEnd   = new Date();
        const ytdStart = new Date(ytdEnd); ytdStart.setFullYear(ytdStart.getFullYear() - 1);
        const inYTD = (dateStr) => {
          if (!dateStr) return false;
          const [y, m, d] = dateStr.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          return dt >= ytdStart && dt <= ytdEnd;
        };
        const ytdInc  = income.filter(r   => inYTD(r.income_date)).reduce((s, r) => s + r.amount, 0);
        const ytdExp  = expenses.filter(r => inYTD(r.expense_date)).reduce((s, r) => s + r.amount, 0);
        const ytdBal  = ytdInc - ytdExp;
        const ytdPrin = principalInRange(
          expenses, property.loan_amount, property.mortgage_rate || 0, ytdStart, ytdEnd
        );
        const ytdNetExp    = ytdExp  - ytdPrin;
        const ytdNetProfit = ytdInc  - ytdNetExp;

        const avg = avgMonthly(income, expenses, avgWindow);

        const f  = n => `$${Math.round(n).toLocaleString()}`;
        const fp = n => `${Number(n).toFixed(1)}%`;
        const WOPT = [1, 2, 3, 6, 12];
        const mc = (props) => <MetricCard {...props} style={{ flex: '1 1 150px', minWidth: 140 }} />;

        return (<>
          {/* Value & Equity */}
          <p className="stat-section-label">Value &amp; Equity</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Purchase Price', primary: f(property.purchase_price),
              tooltip: 'Original purchase price of the property.' })}
            {mc({ label: 'Market Value', primary: f(property.market_price),
              tooltip: 'Current estimated market value.' })}
            {mc({ label: 'Equity', primary: f(equity),
              primaryCls: equity >= 0 ? 'text-success' : 'text-danger',
              secondary: equityPct !== null ? fp(equityPct) + ' of value' : null,
              secondaryCls: equityPct !== null && equityPct >= 50 ? 'text-success' : '',
              tooltip: 'Market Value \u2212 Loan Amount.' })}
            {mc({ label: 'Loan Amount', primary: f(property.loan_amount), primaryCls: 'text-danger',
              secondary: loanPct !== null ? fp(loanPct) + ' of value' : null,
              tooltip: 'Outstanding mortgage or loan balance.' })}
            {property.mortgage_rate > 0 && mc({ label: 'Mortgage Rate', primary: `${property.mortgage_rate}%`,
              tooltip: 'Annual mortgage interest rate.' })}
          </div>

          {/* Appreciation */}
          <p className="stat-section-label">Appreciation</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Appreciation', primary: f(appr),
              primaryCls: appr >= 0 ? 'text-success' : 'text-danger',
              secondary: apprPct !== null ? fp(apprPct) + ' of purchase' : null,
              secondaryCls: appr >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Market Value \u2212 Purchase Price.' })}
            {mc({ label: 'Yearly Appr.', primary: yearlyAppr !== null ? f(yearlyAppr) + '/yr' : '\u2014',
              primaryCls: yearlyAppr !== null ? (yearlyAppr >= 0 ? 'text-success' : 'text-danger') : '',
              secondary: yearlyApprPct !== null ? fp(yearlyApprPct) + '/yr of purchase' : null,
              secondaryCls: yearlyAppr !== null && yearlyAppr >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Appreciation \u00f7 years held since possession date.' })}
            {mc({ label: 'Projected Year-End', primary: f(projectedYE),
              tertiary: 'Linear extrapolation via yearly appreciation',
              tooltip: 'Current value + remaining year fraction \u00d7 yearly appreciation.' })}
          </div>

          {/* Income & Expenses */}
          <p className="stat-section-label">Income &amp; Expenses (all-time)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Total Income',   primary: f(property.total_income), primaryCls: 'text-success' })}
            {mc({ label: 'Total Expenses', primary: f(property.total_expenses), primaryCls: 'text-danger' })}
            {mc({ label: 'Total Balance',  primary: f(balance),
              primaryCls: balance >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Total Income \u2212 Total Expenses (raw balance).' })}
            {mc({ label: 'Net Expenses',   primary: f(totalNetExp),
              primaryCls: totalNetExp >= 0 ? 'text-danger' : 'text-success',
              tooltip: 'Total Expenses \u2212 Down Payment.' })}
            {mc({ label: 'Net Profit', primary: f(totalNetProfit),
              primaryCls: totalNetProfit >= 0 ? 'text-success' : 'text-danger',
              secondary: roi !== null ? fp(roi) + ' ROI' : null,
              secondaryCls: roi !== null && roi >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Total Income \u2212 Net Expenses.' })}
            {mc({ label: 'Selling Profit', primary: f(sellingProfit),
              primaryCls: sellingProfit >= 0 ? 'text-success' : 'text-danger',
              secondary: sellingPct !== null ? fp(parseFloat(sellingPct)) + ' of expenses' : null,
              secondaryCls: sellingProfit >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Market Value + Total Income \u2212 Total Expenses \u2212 Loan Amount.\nWhat you would net if you sold today.' })}
            {!isVacant && mc({ label: 'Monthly Rent', primary: f(property.monthly_rent),
              tooltip: 'Current monthly rent charged.' })}
          </div>

          {/* YTD */}
          <p className="stat-section-label">YTD — trailing 12 months</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'YTD Income',     primary: f(ytdInc), primaryCls: 'text-success' })}
            {mc({ label: 'YTD Expenses',   primary: f(ytdExp), primaryCls: 'text-danger' })}
            {mc({ label: 'YTD Balance',    primary: f(ytdBal),
              primaryCls: ytdBal >= 0 ? 'text-success' : 'text-danger' })}
            {mc({ label: 'YTD Principal',  primary: ytdPrin > 0 ? f(ytdPrin) : '\u2014',
              tertiary: 'From Principal expense records',
              tooltip: 'Sum of Principal expenses in the trailing 12 months.' })}
            {mc({ label: 'YTD Net Exp',    primary: f(ytdNetExp),
              primaryCls: ytdNetExp >= 0 ? 'text-danger' : 'text-success' })}
            {mc({ label: 'YTD Net Profit', primary: f(ytdNetProfit),
              primaryCls: ytdNetProfit >= 0 ? 'text-success' : 'text-danger' })}
          </div>

          {/* Monthly averages */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
            <p className="stat-section-label" style={{ margin: 0 }}>Monthly Averages</p>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>window:</span>
            {WOPT.map(w => (
              <button key={w} type="button" onClick={() => setAvgWindow(w)}
                style={{
                  padding: '0.2rem 0.5rem', borderRadius: '5px', fontSize: '0.78rem', cursor: 'pointer',
                  background: avgWindow === w ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: avgWindow === w ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${avgWindow === w ? 'var(--accent-primary)' : 'var(--border)'}`,
                }}>{w}M</button>
            ))}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>(excludes current month)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {mc({ label: `Avg Income (${avgWindow}M)`,   primary: f(avg.income),   primaryCls: 'text-success' })}
            {mc({ label: `Avg Expenses (${avgWindow}M)`, primary: f(avg.expenses), primaryCls: 'text-danger' })}
            {mc({ label: `Avg Cash Flow (${avgWindow}M)`,primary: f(avg.cashflow),
              primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger' })}
          </div>
        </>);
      })()}

      {/* Chart */}
      <div className="chart-container">
        <div className="chart-header"><h2 className="chart-title">Financial Overview</h2></div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={DETAIL_TOOLTIP_STYLE} />
            <Bar dataKey="value" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Current Tenants panel */}
        <div className="detail-panel">
          <div className="detail-panel-title">
            <span>👤 Current Tenants</span>
            <button className="btn btn-secondary" onClick={onAddTenant}>+ Add</button>
          </div>
          {currTenants.length === 0 ? (
            <div className="tenant-vacant">🏠 Vacant — no active leases</div>
          ) : (
            currTenants.map(t => (
              <div key={t.id} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {t.phone && <span style={{ marginRight: '0.75rem' }}>📞 {t.phone}</span>}
                  {t.email && <span>✉️ {t.email}</span>}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                  Lease: {fmtDate(t.lease_start)} — {t.lease_end ? fmtDate(t.lease_end) : 'Ongoing'}
                  &nbsp;·&nbsp; Rent: ${(t.rent_amount || 0).toLocaleString()}/mo
                </div>
                {t.notes && (
                  <div style={{
                    fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.3rem',
                    fontStyle: 'italic', whiteSpace: 'pre-wrap'
                  }}>
                    {t.notes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Recent Expenses panel */}
        <div className="detail-panel">
          <div className="detail-panel-title">
            <span>💳 Recent Expenses</span>
            <button className="btn btn-secondary" onClick={onAddExpense}>+ Add</button>
          </div>
          {recentExp.length === 0 ? (
            <div className="tenant-vacant">No expenses recorded yet</div>
          ) : (
            recentExp.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.85rem' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{e.expense_category}</span>
                  <span style={{ color: 'var(--text-tertiary)', marginLeft: '0.5rem' }}>{fmtDate(e.expense_date)}</span>
                  {e.description && (
                    <div className="cell-truncate" data-tooltip={e.description}
                      style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '0.1rem', maxWidth: '200px' }}>
                      {e.description}
                    </div>
                  )}
                </div>
                <span className="text-danger" style={{ fontWeight: 600, marginLeft: '0.5rem', flexShrink: 0 }}>
                  ${e.amount.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

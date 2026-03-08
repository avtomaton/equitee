import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_URL, isCurrentTenant, fmtDate } from '../config.js';
import { yearsHeld, avgMonthly, principalInRange, calcSimpleHealth, calcExpected, expGapCls, expGap, monthsLeftInYear, yearFracRemaining, calcIRR, buildPropertyIRRCashFlows } from '../metrics.js';
import StatCard from './StatCard.jsx';
import MetricCard from './MetricCard.jsx';
import StarRating from './StarRating.jsx';

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
        const projectedYE   = property.market_price + (yearlyAppr ?? 0) * yearFracRemaining();

        const totalNetExp    = property.total_expenses - downPmt;
        const totalNetBalance = property.total_income - totalNetExp;
        const balance        = property.total_income - property.total_expenses;
        const sellingProfit  = property.market_price + property.total_income
                               - property.total_expenses - property.loan_amount;
        const sellingPct     = property.total_expenses > 0
          ? (sellingProfit / property.total_expenses * 100).toFixed(1) : null;
        const roi            = property.market_price > 0 ? totalNetBalance / property.market_price * 100 : null;

        // Available equity = what can be pulled out while staying at ≤ 80% LTV
        const availableEquity = Math.max(0, 0.80 * property.market_price - property.loan_amount);

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
        const ytdPrin = principalInRange(expenses, property.loan_amount, property.mortgage_rate || 0, ytdStart, ytdEnd);
        const ytdNetExp     = ytdExp  - ytdPrin;
        const ytdNetBalance = ytdInc  - ytdNetExp;

        const avg = avgMonthly(income, expenses, avgWindow);

        const annualNOI   = avg.noi * 12;
        const annualCashFlow = avg.cashflow * 12;
        const monthlyRent = property.monthly_rent;
        const annualRent  = monthlyRent * 12;

        const capRate      = property.purchase_price > 0 ? annualNOI  / property.purchase_price : 0;
        const cashOnCash   = equity > 0 ? annualCashFlow / equity : 0;
        const loanToValue  = property.purchase_price > 0 ? property.loan_amount / property.purchase_price : 0;
        const expenseRatio = monthlyRent > 0 ? avg.expenses / monthlyRent : 0;
        const rentToValue  = property.purchase_price > 0 ? annualRent / property.purchase_price : 0;
        const oer          = avg.income > 0 ? avg.noiExpenses / avg.income : 0;

        // Interest Coverage Ratio = annual NOI / annual interest expense
        // Interest expense = loan × rate / 100
        const annualInterest = property.loan_amount > 0 && property.mortgage_rate > 0
          ? property.loan_amount * property.mortgage_rate / 100 : null;
        const icr = annualInterest > 0 ? annualNOI / annualInterest : null;

        const econVacancy = (() => {
          if (!monthlyRent) return null;
          const lost = Math.max(0, annualRent - ytdInc);
          return annualRent > 0 ? lost / annualRent * 100 : null;
        })();

        const maintCapexRatio = (() => {
          if (!monthlyRent) return null;
          const maintExp = expenses
            .filter(r => {
              if (!r.expense_date) return false;
              const [y, m, d] = r.expense_date.split('-').map(Number);
              const dt = new Date(y, m - 1, d);
              return dt >= ytdStart && dt <= ytdEnd &&
                ['Maintenance', 'Capital'].includes(r.expense_category);
            })
            .reduce((s, r) => s + r.amount, 0);
          return annualRent > 0 ? maintExp / annualRent : null;
        })();

        const irr = (() => {
          const cfs = buildPropertyIRRCashFlows(property, income, expenses);
          if (!cfs) return null;
          return calcIRR(cfs);
        })();

        const expected       = calcExpected(property, avg.mortgage);
        const monthlyAppr    = yearlyAppr !== null ? yearlyAppr / 12 : 0;
        const monthlyGain    = avg.cashflow + monthlyAppr;

        const expApprPct     = property.expected_appreciation_pct || 0;
        const expYearlyAppr  = expApprPct > 0 ? property.purchase_price * expApprPct / 100 : null;
        const expMonthlyAppr = expYearlyAppr !== null ? expYearlyAppr / 12 : null;
        const expMonthlyCF   = expected?.monthlyCF ?? null;
        const expMonthlyGain = (expMonthlyCF !== null && expMonthlyAppr !== null)
          ? expMonthlyCF + expMonthlyAppr
          : expMonthlyCF !== null ? expMonthlyCF : null;

        const timeToProfit = (() => {
          if (sellingProfit <= 0) return { label: '\u2014', cls: 'text-secondary', tip: 'No selling profit yet \u2014 nothing to reach.' };
          if (avg.cashflow <= 0) return { label: avg.cashflow === 0 ? '\u2014' : '\u221e (losing)', cls: 'text-danger', tip: 'Avg cash flow is negative \u2014 the property is consuming cash.' };
          const months = sellingProfit / avg.cashflow;
          const label  = months < 12 ? `${Math.round(months)} mo` : `${(months / 12).toFixed(1)} yr`;
          return { label, cls: months < 24 ? 'text-success' : months < 60 ? '' : 'text-danger', tip: null };
        })();

        const avgCashFlow       = avg.cashflow;
        const ltvRatio          = loanToValue;
        const yearlyApprRatio   = (yearlyAppr !== null && property.purchase_price > 0)
          ? yearlyAppr / property.purchase_price : 0;
        const investmentScore   = calcSimpleHealth(property);

        const f    = n => `$${Math.round(n).toLocaleString()}`;
        const fp   = n => `${Number(n).toFixed(1)}%`;
        const fPct = n => `${(n * 100).toFixed(1)}%`;
        const fmtM = n => n === 0 ? '\u2014' : f(n) + '/mo';
        const WOPT = [1, 2, 3, 6, 12];
        const mc = (props) => <MetricCard {...props} style={{ flex: '1 1 150px', minWidth: 140 }} />;

        // expProps: build {secondary, secondaryCls, tertiary, tertiaryCls} using expGap
        const expProps = (actual, exp, colorFn, fmtFn, label = 'Exp:', hiIsGood = true, absThresh = 25) =>
          expGap(actual, exp, colorFn, fmtFn, label, hiIsGood, absThresh);

        // ── Smart analysis ────────────────────────────────────────────────────
        const analysis = (() => {
          const items = [];
          const isRnt = (property.status || '').toLowerCase() === 'rented';
          const noData = property.total_income === 0 && property.total_expenses === 0;

          if (noData) {
            items.push({ isPrimary: true, icon: '🆕', cls: 'text-secondary', label: 'No data yet',
              detail: 'No income or expenses have been recorded. Add transactions to start tracking performance.' });
          } else if (!isRnt) {
            const lastInc = [...income].sort((a,b) => new Date(b.income_date)-new Date(a.income_date))[0];
            const daysSince = lastInc ? (Date.now() - new Date(lastInc.income_date)) / 86400000 : Infinity;
            if (!isFinite(daysSince)) {
              items.push({ isPrimary: true, icon: '🏠', cls: 'text-danger', label: 'Vacant — no income recorded',
                detail: 'Property is vacant and no income has ever been recorded. Property is generating zero return.' });
            } else if (daysSince > 30) {
              items.push({ isPrimary: true, icon: '⚠️', cls: 'text-danger', label: `Vacant ${Math.round(daysSince)} days`,
                detail: `Last income was ${Math.round(daysSince)} days ago. Extended vacancy is eroding your returns. Consider adjusting rent or marketing strategy.` });
            } else {
              items.push({ isPrimary: true, icon: '🔄', cls: 'text-warning', label: 'Recently vacated',
                detail: `Property became vacant ${Math.round(daysSince)} days ago. Short vacancies are normal between tenants — monitor closely.` });
            }
          } else if (avgCashFlow < 0 && yearlyAppr !== null && yearlyAppr < 0) {
            items.push({ isPrimary: true, icon: '🚨', cls: 'text-danger', label: 'Losing on all fronts',
              detail: `Cash flow is ${f(avgCashFlow)}/mo and the property is depreciating ${f(yearlyAppr)}/yr. Every month deepens the loss. Strong case to sell.` });
          } else if (avgCashFlow < 0 && yearlyAppr !== null && yearlyAppr > 0) {
            items.push({ isPrimary: true, icon: '⚖️', cls: monthlyGain >= 0 ? 'text-warning' : 'text-danger',
              label: monthlyGain >= 0 ? 'Appreciation covers the gap' : 'Negative cash flow, appreciation insufficient',
              detail: monthlyGain >= 0
                ? `Cash is consumed at ${f(Math.abs(avgCashFlow))}/mo but appreciation (${f(yearlyAppr)}/yr = ${f(monthlyAppr)}/mo) more than compensates. Monthly gain: ${f(monthlyGain)}/mo.`
                : `Cash is consumed at ${f(Math.abs(avgCashFlow))}/mo. Appreciation (${f(yearlyAppr)}/yr) only partially offsets this. Net monthly loss: ${f(monthlyGain)}/mo.` });
          } else if (avgCashFlow < 0) {
            items.push({ isPrimary: true, icon: '📉', cls: 'text-danger', label: 'Negative cash flow',
              detail: `Expenses exceed income by ${f(Math.abs(avgCashFlow))}/mo. ${yearlyAppr === 0 ? 'No appreciation to compensate.' : 'No possession date set — appreciation unknown.'}` });
          } else if (avgCashFlow === 0 && monthlyGain > 0) {
            items.push({ isPrimary: true, icon: '📈', cls: 'text-success', label: 'Breakeven — appreciation-led',
              detail: `Cash flow is exactly neutral, but appreciation of ${yearlyAppr !== null ? f(yearlyAppr) + '/yr ' : ''}adds ${f(monthlyGain)}/mo in total gain.` });
          } else if (sellingProfit >= 0 && avgCashFlow > 0 && sellingProfit / avgCashFlow < 12) {
            items.push({ isPrimary: true, icon: '⭐', cls: 'text-success', label: 'Exceptional yield',
              detail: `Cash flow of ${f(avgCashFlow)}/mo recovers the entire selling profit in ${Math.round(sellingProfit/avgCashFlow)} months. Rare performance — keep holding.` });
          } else if (monthlyRent > 0 && avgCashFlow > 0 && sellingProfit < property.market_price * 0.05) {
            items.push({ isPrimary: true, icon: '🐄', cls: 'text-success', label: 'Golden cow — keep',
              detail: `Strong cash flow (${f(avgCashFlow)}/mo) but selling today nets only ${f(sellingProfit)}. Earns far more by holding than by selling.` });
          } else if (sellingProfit > property.market_price * 0.15 && monthlyGain < property.market_price * 0.003) {
            items.push({ isPrimary: true, icon: '💡', cls: 'text-warning', label: 'Consider selling',
              detail: `Unrealized gain of ${f(sellingProfit)} is significant, but monthly gain is only ${f(monthlyGain)}/mo. Capital may work harder elsewhere.` });
          } else if (yearlyAppr !== null && yearlyAppr > 0 && avgCashFlow > 0) {
            items.push({ isPrimary: true, icon: '🚀', cls: 'text-success', label: 'Strong performer',
              detail: `All metrics positive: cash flow ${f(avgCashFlow)}/mo, appreciation ${f(yearlyAppr)}/yr, monthly gain ${f(monthlyGain)}/mo.` });
          } else if (avgCashFlow > 0) {
            items.push({ isPrimary: true, icon: '✅', cls: 'text-success', label: 'Positive cash flow',
              detail: `Generating ${f(avgCashFlow)}/mo.${yearlyAppr !== null ? ` Appreciation ${f(yearlyAppr)}/yr adds ${f(monthlyAppr)}/mo.` : ' Set a possession date to compute appreciation.'}` });
          } else {
            items.push({ isPrimary: true, icon: '➖', cls: 'text-warning', label: 'Breakeven — flat',
              detail: 'Cash flow is zero and no meaningful appreciation. Property is treading water.' });
          }

          if (monthlyRent > 0 && capRate < 0.05) {
            const targetRent = Math.round(property.market_price * 0.06 / 12);
            const delta = targetRent - monthlyRent;
            if (delta > 0) items.push({ icon: '📈', cls: 'text-warning', label: 'Low cap rate',
              detail: `Cap rate of ${(capRate*100).toFixed(1)}% is below 5%. Raising rent by ~$${delta}/mo would push it toward 6%.` });
          }
          if (monthlyRent > 0 && expenseRatio > 0.45) {
            items.push({ icon: '💸', cls: 'text-danger', label: 'High expense ratio',
              detail: `Expenses are ${(expenseRatio*100).toFixed(0)}% of rent. Healthy properties typically sit below 40%. Review recurring maintenance, management, or insurance costs.` });
          }
          if (ltvRatio > 0.80 && property.loan_amount > 0) {
            items.push({ icon: '⚡', cls: 'text-danger', label: 'High leverage risk',
              detail: `LTV of ${(ltvRatio*100).toFixed(0)}% means only ${(100-ltvRatio*100).toFixed(0)}% equity cushion. A market dip could put the property underwater.` });
          }
          if (ltvRatio > 0 && ltvRatio < 0.55 && equity > 50000) {
            items.push({ icon: '🏦', cls: 'text-success', label: 'Refinancing opportunity',
              detail: `LTV of ${(ltvRatio*100).toFixed(0)}% — ${f(equity)} in equity. A cash-out refinance could fund another investment without selling.` });
          }
          if (yearlyAppr !== null && yearlyApprRatio > 0.08) {
            items.push({ icon: '💎', cls: 'text-success', label: 'Strong appreciation',
              detail: `Appreciating at ${(yearlyApprRatio*100).toFixed(1)}%/yr (${f(yearlyAppr)}/yr). Consider leveraging this equity growth for portfolio expansion.` });
          }
          if (yearlyAppr !== null && yearlyApprRatio < 0.02 && capRate < 0.04 && property.total_income > 0) {
            items.push({ icon: '🔻', cls: 'text-danger', label: 'Low yield & low growth',
              detail: `Cap rate ${(capRate*100).toFixed(1)}% and appreciation ${(yearlyApprRatio*100).toFixed(1)}%/yr are both weak. Capital may perform better elsewhere.` });
          }
          if (cashOnCash > 0 && cashOnCash < 0.03 && avgCashFlow > 0) {
            items.push({ icon: '🔑', cls: 'text-warning', label: 'Low capital efficiency',
              detail: `Cash-on-cash return of ${(cashOnCash*100).toFixed(1)}% means your equity is barely working. Target is typically 6–8%+.` });
          }
          return items;
        })();

        const [primary, ...secondary] = analysis;

        return (<>

          {/* ══ Summary & Insights ══════════════════════════════════════════ */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1rem',
            marginBottom: '1.25rem', alignItems: 'start',
          }}>
            {/* Left: KPI strip */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '0.6rem',
              padding: '1rem 1.1rem', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg-secondary)',
              minWidth: 300,
            }}>
              {[
                { label: 'Market Value',       val: f(property.market_price),   cls: '' },
                { label: 'Equity',             val: f(equity),                   cls: equity >= 0 ? 'text-success' : 'text-danger',
                  sub: equityPct !== null ? fp(equityPct) + ' of value' : null },
                { label: 'Avail. Equity',      val: availableEquity > 0 ? f(availableEquity) : '—', cls: 'text-success',
                  sub: 'above 20% LTV' },
                { label: 'Monthly Rent',       val: monthlyRent ? f(monthlyRent) : '—', cls: '' },
                { label: `Avg CF (${avgWindow}M)`, val: fmtM(avgCashFlow),           cls: avgCashFlow >= 0 ? 'text-success' : 'text-danger' },
                { label: 'Selling Profit',     val: f(sellingProfit),            cls: sellingProfit >= 0 ? 'text-success' : 'text-danger' },
              ].map(({ label, val, cls = '', sub }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 130px', minWidth: 115 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.15rem' }}>{label}</span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.2 }} className={cls}>{val}</span>
                  {sub && <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>{sub}</span>}
                </div>
              ))}
            </div>

            {/* Right: Analysis tips + score */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {/* Score badge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.6rem 0.9rem', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
              }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}
                  className={investmentScore.cls}>
                  {investmentScore.score}
                  <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-tertiary)' }}>/100</span>
                </span>
                <div>
                  <StarRating starsData={investmentScore.starsData} />
                  <span style={{ fontWeight: 600, fontSize: '0.82rem' }} className={investmentScore.cls}>
                    {investmentScore.label}
                  </span>
                </div>
              </div>

              {/* Primary status */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                padding: '0.75rem 0.9rem', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
              }}>
                <span style={{ fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}>{primary.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }} className={primary.cls}>{primary.label}</div>
                  <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.5 }}>
                    {primary.detail}
                  </div>
                </div>
              </div>

              {/* Secondary suggestions */}
              {secondary.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.55rem',
                  padding: '0.5rem 0.8rem', borderRadius: '7px',
                  border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{s.icon}</span>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.79rem' }} className={s.cls}>{s.label} </span>
                    <span style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{s.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ══ Value & Equity ═════════════════════════════════════════════ */}
          <p className="stat-section-label">Value &amp; Equity</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Purchase Price', primary: f(property.purchase_price),
              tooltip: 'Original purchase price. Used as the denominator for Cap Rate and appreciation calculations.' })}
            {mc({ label: 'Market Value', primary: f(property.market_price),
              tooltip: 'Current estimated market value. Update this as the market changes to keep ratios accurate.' })}
            {mc({ label: 'Equity', primary: f(equity),
              primaryCls: equity >= 0 ? 'text-success' : 'text-danger',
              secondary: equityPct !== null ? fp(equityPct) + ' of value' : null,
              secondaryCls: equityPct !== null && equityPct >= 50 ? 'text-success' : '',
              tooltip: 'Market Value \u2212 Loan Amount. Represents your real ownership stake in the property.' })}
            {mc({ label: 'Available Equity', primary: availableEquity > 0 ? f(availableEquity) : '\u2014',
              primaryCls: availableEquity > 0 ? 'text-success' : 'text-secondary',
              tertiary: availableEquity > 0 ? 'Above 20% LTV threshold' : 'LTV too high to extract',
              tooltip: 'Equity you can access via refinancing while staying at \u226480% LTV.\nFormula: (0.80 \u00d7 Market Value) \u2212 Loan Amount.\nUseful for calculating HELOC potential or cash-out refinance room.' })}
            {mc({ label: 'Total Appreciation', primary: f(appr),
              primaryCls: appr >= 0 ? 'text-success' : 'text-danger',
              secondary: apprPct !== null ? fp(apprPct) + ' of purchase' : null,
              secondaryCls: appr >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Market Value \u2212 Purchase Price. Total unrealised gain since you bought the property.' })}
          </div>

          {/* ══ Financing Efficiency ═══════════════════════════════════════ */}
          <p className="stat-section-label">Financing Efficiency</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Loan Amount', primary: f(property.loan_amount), primaryCls: 'text-danger',
              secondary: loanPct !== null ? fp(loanPct) + ' of value' : null,
              tooltip: 'Outstanding mortgage or loan balance. Update this when you pay it down to keep LTV accurate.' })}
            {property.mortgage_rate > 0 && mc({ label: 'Mortgage Rate', primary: `${property.mortgage_rate}%`,
              tertiary: annualInterest ? `~${f(annualInterest)}/yr in interest` : null,
              tooltip: 'Annual mortgage interest rate. Used to compute interest cost and interest coverage ratio.' })}
            {mc({ label: 'Loan-to-Value', primary: fPct(ltvRatio),
              primaryCls: ltvRatio > 0.80 ? 'text-danger' : ltvRatio > 0.65 ? '' : 'text-success',
              tertiary: ltvRatio > 0.80 ? 'High leverage' : ltvRatio < 0.55 ? 'Low leverage' : 'Moderate leverage',
              tooltip: 'Loan \u00f7 Market Value. Below 65%: conservative. 65\u201380%: normal. Above 80%: high risk — lenders may require mortgage insurance.' })}
            {mc({
              label: `DSCR (${avgWindow}M)`,
              primary: avg.mortgage > 0 ? (avg.noi / avg.mortgage).toFixed(2) + 'x' : '\u2014',
              primaryCls: avg.mortgage > 0
                ? (avg.noi / avg.mortgage >= 1.25 ? 'text-success' : avg.noi / avg.mortgage >= 1.0 ? 'text-warning' : 'text-danger')
                : 'text-secondary',
              ...(avg.mortgage > 0 ? expProps(avg.noi / avg.mortgage, expected?.dscr,
                v => v >= 1.25 ? 'text-success' : v >= 1.0 ? 'text-warning' : 'text-danger',
                v => v.toFixed(2) + 'x', 'Exp:', true, 0.05) : {}),
              tertiary: avg.mortgage <= 0
                ? (expected?.dscr != null ? `Exp: ${expected.dscr.toFixed(2)}x \u2014 no mortgage recorded` : 'No mortgage expenses recorded')
                : undefined,
              tooltip: 'Debt Service Coverage = monthly NOI \u00f7 mortgage payment.\n\u2265 1.25x: income comfortably covers debt. 1.0\u20131.25x: marginal. < 1.0x: income doesn\u2019t cover the mortgage.\nRequires Mortgage expense records in the selected window.' })}
            {icr !== null && mc({ label: 'Interest Coverage', primary: icr.toFixed(2) + 'x',
              primaryCls: icr >= 2 ? 'text-success' : icr >= 1.25 ? '' : 'text-danger',
              tertiary: icr >= 2 ? 'Strong' : icr >= 1.25 ? 'Adequate' : 'Weak',
              tooltip: 'Annual NOI \u00f7 Annual Interest Expense (loan \u00d7 rate).\nMeasures how comfortably NOI covers the interest component of your mortgage, ignoring principal.\n\u2265 2.0x: strong. 1.25\u20132.0x: adequate. < 1.25x: tight.' })}
          </div>

          {/* ══ Investment Ratios ══════════════════════════════════════════ */}
          <p className="stat-section-label">Investment Ratios</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({
              label: 'Cap Rate',
              primary: fPct(capRate),
              primaryCls: capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger',
              ...expProps(capRate, expected?.capRate,
                v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger', fPct),
              tertiary: capRate > 0.07 ? 'Strong yield' : capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
              tooltip: 'Annual NOI \u00f7 Purchase Price. Financing-agnostic measure of a property\u2019s income yield.\nResidential target: 4\u20136%. Commercial: 6\u20138%+.\nExp uses budgeted operating costs as op-ex, full monthly rent as income.' })}
            {mc({
              label: 'Cash-on-Cash',
              primary: fPct(cashOnCash),
              primaryCls: cashOnCash > 0.08 ? 'text-success' : cashOnCash > 0.04 ? '' : cashOnCash < 0 ? 'text-danger' : 'text-warning',
              ...expProps(cashOnCash, expected?.cashOnCash,
                v => v > 0.08 ? 'text-success' : v > 0.04 ? '' : v < 0 ? 'text-danger' : 'text-warning', fPct),
              tooltip: 'Annual Cash Flow \u00f7 Equity. Measures how hard your invested equity is working for you.\nTarget: 6\u201310%+. Low CoC with high LTV means equity is not being deployed efficiently.' })}
            {monthlyRent > 0 && mc({
              label: 'Expense Ratio',
              primary: fPct(expenseRatio),
              primaryCls: expenseRatio < 0.35 ? 'text-success' : expenseRatio < 0.50 ? '' : 'text-danger',
              ...expProps(expenseRatio, expected?.expenseRatio,
                v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false),
              tooltip: 'Avg Monthly Expenses \u00f7 Monthly Rent. All costs including mortgage.\nBelow 35%: efficient. 35\u201350%: normal. Above 50%: review costs.' })}
            {monthlyRent > 0 && mc({ label: 'Rent-to-Value', primary: fPct(rentToValue),
              primaryCls: rentToValue > 0.01 ? 'text-success' : rentToValue > 0.007 ? '' : 'text-danger',
              tertiary: rentToValue > 0.01 ? 'Passes 1% rule' : rentToValue > 0.007 ? 'Near 1% rule' : 'Below 1% rule',
              tooltip: 'Monthly Rent \u00f7 Purchase Price. The 1% rule: monthly rent \u2265 1% of purchase price signals healthy cash flow potential.\nNote: the 1% rule is a screening heuristic, not a guarantee.' })}
          </div>

          {/* ══ Operating Metrics & Gain ════════════════════════════════════ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <p className="stat-section-label" style={{ margin: 0 }}>Operating Metrics &amp; Gain</p>
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

          {/* Row 1: Cash flow & gain */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {mc({ label: `Avg Income (${avgWindow}M)`,   primary: fmtM(avg.income),   primaryCls: 'text-success',
              tooltip: `Average monthly income over the last ${avgWindow} complete months.` })}
            {mc({ label: `Avg Cash Flow (${avgWindow}M)`, primary: fmtM(avgCashFlow),
              primaryCls: avgCashFlow >= 0 ? 'text-success' : 'text-danger',
              ...expProps(avgCashFlow, expMonthlyCF,
                v => v >= 0 ? 'text-success' : 'text-danger', v => fmtM(v)),
              tooltip: `Average monthly (income \u2212 all expenses incl. mortgage) over the last ${avgWindow} months.\nExp = budgeted NOI minus expected mortgage.` })}
            {mc({ label: 'Monthly Gain', primary: fmtM(monthlyGain),
              primaryCls: monthlyGain >= 0 ? 'text-success' : 'text-danger',
              secondary: yearlyAppr !== null && expMonthlyGain == null
                ? `CF ${f(avgCashFlow)} + Appr ${f(monthlyAppr)}/mo` : null,
              secondaryCls: 'text-secondary',
              ...(() => {
                if (expMonthlyGain == null) return {};
                const { cls: gapCls, gapStr } = expGapCls(monthlyGain, expMonthlyGain, true, 50);
                return {
                  secondary:    `Exp: ${fmtM(expMonthlyGain)}`,
                  secondaryCls: expMonthlyGain >= 0 ? 'text-success' : 'text-danger',
                  ...(gapStr ? { tertiary: gapStr, tertiaryCls: gapCls } : {}),
                };
              })(),
              tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly \u00f7 12). Combines income and value growth in one number.\nExp uses budgeted operating costs, expected mortgage, and expected appreciation %.' })}
            {mc({ label: 'Selling Profit', primary: f(sellingProfit),
              primaryCls: sellingProfit >= 0 ? 'text-success' : 'text-danger',
              secondary: sellingPct !== null ? fp(parseFloat(sellingPct)) + ' of expenses' : null,
              secondaryCls: sellingProfit >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Market Value + Total Income \u2212 Total Expenses \u2212 Loan Amount.\nThe net amount you would pocket if you sold today and cleared the mortgage.' })}
            {(() => {
              const expLabel = (() => {
                if (expMonthlyGain == null || expMonthlyGain <= 0 || sellingProfit <= 0) return null;
                const mo = sellingProfit / expMonthlyGain;
                return mo < 12 ? `Exp: ${Math.round(mo)} mo` : `Exp: ${(mo / 12).toFixed(1)} yr`;
              })();
              return mc({ label: 'Time to Sell Profit', primary: timeToProfit.label,
                primaryCls: timeToProfit.cls,
                secondary: expLabel, secondaryCls: expLabel ? 'text-success' : '',
                tooltip: (timeToProfit.tip || 'How many months of avg cash flow to equal the current selling profit.') +
                  '\nExp uses budgeted monthly gain (cash flow + appreciation).' });
            })()}
          </div>

          {/* Row 2: NOI, expenses, cap rate, DSCR */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {mc({
              label: `Avg NOI (${avgWindow}M)`,
              primary: fmtM(avg.noi),
              primaryCls: avg.noi >= 0 ? 'text-success' : 'text-danger',
              ...expProps(avg.noi, expected?.monthlyNOI,
                v => v >= 0 ? 'text-success' : 'text-danger', v => fmtM(v)),
              tooltip: 'Net Operating Income = avg monthly income \u2212 op-ex (excl. mortgage & principal).\nShows a property\u2019s income-generating ability independent of financing.\nExp uses budgeted fixed costs + utilities + tax/12.' })}
            {mc({
              label: `Avg Expenses (${avgWindow}M)`,
              primary: fmtM(avg.expenses),
              primaryCls: avg.expenses > avg.income * 0.85 ? 'text-danger' : avg.expenses > avg.income * 0.65 ? 'text-warning' : '',
              ...expProps(avg.expenses, expected?.monthlyExpenses,
                v => v < (monthlyRent * 0.65) ? '' : v < (monthlyRent * 0.85) ? 'text-warning' : 'text-danger',
                v => fmtM(v), 'Exp:', false),
              tooltip: 'Avg total monthly expenses (all categories including mortgage).\nExp = budgeted op-ex + actual avg mortgage payment. Lower than expected is better.' })}
            {mc({
              label: 'Cap Rate',
              primary: fPct(capRate),
              primaryCls: capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger',
              ...expProps(capRate, expected?.capRate,
                v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger', fPct),
              tertiary: capRate > 0.07 ? 'Strong yield' : capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
              tooltip: 'Annual NOI \u00f7 Purchase Price. Same as in Investment Ratios — shown here in context with actual operating averages.' })}
          </div>

          {/* Row 3: OER, IRR, vacancy, maint */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({
              label: 'OER',
              primary: avg.income > 0 ? fPct(oer) : '\u2014',
              primaryCls: avg.income > 0 ? (oer < 0.35 ? 'text-success' : oer < 0.50 ? '' : 'text-danger') : 'text-secondary',
              ...(avg.income > 0 ? expProps(oer, expected?.oer,
                v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false) : {}),
              tertiary: avg.income <= 0 ? 'No income in selected window' : (oer < 0.35 ? 'Efficient' : oer < 0.50 ? 'Normal' : 'High'),
              tooltip: 'Operating Expense Ratio = op-ex \u00f7 gross income. Excludes mortgage and principal.\nBelow 35%: efficient. 35\u201350%: normal. Above 50%: review costs.' })}
            {mc({
              label: 'IRR',
              primary: irr !== null ? fPct(irr) : '\u2014',
              primaryCls: irr !== null
                ? (irr > 0.15 ? 'text-success' : irr > 0.08 ? '' : irr < 0 ? 'text-danger' : 'text-warning')
                : 'text-secondary',
              tertiary: irr !== null
                ? (irr > 0.15 ? 'Excellent' : irr > 0.08 ? 'Good' : irr < 0 ? 'Loss' : 'Below target')
                : (!property.poss_date ? 'No possession date set' : 'Need \u2265 2 months of records'),
              tooltip: 'Internal Rate of Return \u2014 the annualised rate that makes NPV of all cash flows zero.\nCalculated from possession date: initial outlay (down payment), monthly net cash flows, and current equity as terminal value.\nTarget: 10\u201315%+ for real estate.' })}
            {mc({
              label: 'Economic Vacancy',
              primary: econVacancy !== null ? `${Math.min(econVacancy, 100).toFixed(1)}%` : '\u2014',
              primaryCls: econVacancy !== null
                ? (econVacancy > 10 ? 'text-danger' : econVacancy > 4 ? 'text-warning' : 'text-success')
                : 'text-secondary',
              tertiary: econVacancy !== null
                ? (econVacancy > 10 ? 'High loss' : econVacancy > 4 ? 'Moderate' : 'Low')
                : 'Set monthly rent to compute',
              tooltip: 'Lost rent YTD \u00f7 Annual potential rent. Measures how much rental income was lost to vacancy or underperformance.\nCapped at 100%. Target: < 5%.' })}
            {mc({
              label: 'Maint+CapEx Ratio',
              primary: maintCapexRatio !== null ? fPct(maintCapexRatio) : '\u2014',
              primaryCls: maintCapexRatio !== null
                ? (maintCapexRatio < 0.05 ? 'text-success' : maintCapexRatio < 0.12 ? '' : 'text-danger')
                : 'text-secondary',
              tertiary: maintCapexRatio !== null
                ? (maintCapexRatio < 0.05 ? 'Low' : maintCapexRatio < 0.12 ? 'Normal' : 'High')
                : 'Set monthly rent to compute',
              tooltip: 'YTD Maintenance + Capital Expenditure \u00f7 Annual gross rental income.\nNorm: 5\u201310% of gross rent. Above 15% may signal deferred maintenance or a major renovation year.' })}
          </div>

          {/* ══ Income & Expenses (all-time) ══════════════════════════════ */}
          <p className="stat-section-label">Income &amp; Expenses (all-time)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Total Income',   primary: f(property.total_income), primaryCls: 'text-success',
              tooltip: 'All recorded income since the property was added.' })}
            {mc({ label: 'Total Expenses', primary: f(property.total_expenses), primaryCls: 'text-danger',
              tooltip: 'All recorded expenses, including the initial down payment and principal repayments.' })}
            {mc({ label: 'Total Balance',  primary: f(balance),
              primaryCls: balance >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Total Income \u2212 Total Expenses (raw cash in/out, no adjustments).' })}
            {mc({ label: 'Net Expenses',   primary: f(totalNetExp),
              primaryCls: totalNetExp >= 0 ? 'text-danger' : 'text-success',
              tooltip: 'Total Expenses \u2212 Down Payment. The ongoing operating cost burden above the initial capital deployed.' })}
            {mc({ label: 'Net Balance',    primary: f(totalNetBalance),
              primaryCls: totalNetBalance >= 0 ? 'text-success' : 'text-danger',
              secondary: roi !== null ? fp(roi) + ' ROI' : null,
              secondaryCls: roi !== null && roi >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Total Income \u2212 Net Expenses. The true operating profit, excluding equity-building payments.\nROI = Net Balance \u00f7 Market Value.' })}
          </div>

          {/* ══ YTD ════════════════════════════════════════════════════════ */}
          <p className="stat-section-label">YTD — trailing 12 months</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'YTD Income',      primary: f(ytdInc), primaryCls: 'text-success',
              tooltip: 'Income recorded in the trailing 12-month window.' })}
            {mc({ label: 'YTD Expenses',    primary: f(ytdExp), primaryCls: 'text-danger',
              tooltip: 'All expenses in the trailing 12-month window, including mortgage and principal.' })}
            {mc({ label: 'YTD Balance',     primary: f(ytdBal),
              primaryCls: ytdBal >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'YTD Income \u2212 YTD Expenses.' })}
            {mc({ label: 'YTD Principal',   primary: ytdPrin > 0 ? f(ytdPrin) : '\u2014',
              tertiary: 'Equity-building payments',
              tooltip: 'Principal repayments in the trailing 12 months — this is equity you own, not a true cost.' })}
            {mc({ label: 'YTD Net Exp',     primary: f(ytdNetExp),
              primaryCls: ytdNetExp >= 0 ? 'text-danger' : 'text-success',
              tooltip: 'YTD Expenses \u2212 YTD Principal. Operating costs net of equity-building payments.' })}
            {mc({ label: 'YTD Net Balance', primary: f(ytdNetBalance),
              primaryCls: ytdNetBalance >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'YTD Income \u2212 YTD Net Expenses. The true operating profit in the trailing 12 months.' })}
          </div>

          {/* ══ Appreciation ═══════════════════════════════════════════════ */}
          <p className="stat-section-label">Appreciation</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Total Appreciation', primary: f(appr),
              primaryCls: appr >= 0 ? 'text-success' : 'text-danger',
              secondary: apprPct !== null ? fp(apprPct) + ' of purchase' : null,
              secondaryCls: appr >= 0 ? 'text-success' : 'text-danger',
              tooltip: 'Market Value \u2212 Purchase Price. Total unrealised gain since acquisition.' })}
            {mc({
              label: 'Yearly Appreciation',
              primary: yearlyAppr !== null ? f(yearlyAppr) : '\u2014',
              primaryCls: yearlyAppr !== null ? (yearlyAppr >= 0 ? 'text-success' : 'text-danger') : 'text-secondary',
              secondary: yearlyApprPct !== null ? fp(yearlyApprPct) + ' per year' : null,
              secondaryCls: yearlyAppr !== null && yearlyAppr >= 0 ? 'text-success' : 'text-danger',
              ...(() => {
                if (expYearlyAppr == null) return {};
                const { cls: gapCls, gapStr } = expGapCls(yearlyAppr ?? 0, expYearlyAppr, true, 200);
                return {
                  secondary:    `Exp: ${f(expYearlyAppr)} (${expApprPct}% per year)`,
                  secondaryCls: expYearlyAppr >= 0 ? 'text-success' : 'text-danger',
                  ...(gapStr ? { tertiary: gapStr, tertiaryCls: gapCls }
                    : yearlyAppr === null ? { tertiary: 'No possession date \u2014 cannot compute actual' } : {}),
                };
              })(),
              tooltip: 'Appreciation \u00f7 years held since possession date.\nExp uses your expected appreciation % of purchase price set in the property details.' })}
            {mc({ label: 'Projected Year-End', primary: f(projectedYE),
              tertiary: yearlyAppr !== null ? 'At current appreciation rate' : 'No possession date',
              tooltip: 'Current value + remaining year fraction \u00d7 annual appreciation rate. Linear extrapolation — actual appreciation depends on market conditions.' })}
            {(() => {
              const ml    = monthsLeftInYear();
              const runRate  = sellingProfit + avg.cashflow * ml + monthlyAppr * ml;
              const expMG = expMonthlyGain;
              const budgeted = expMG != null ? sellingProfit + expMG * ml : null;
              return mc({
                label: 'Year-End Balance',
                primary: f(runRate),
                primaryCls: runRate >= 0 ? 'text-success' : 'text-danger',
                ...(budgeted != null ? (() => {
                  const { cls: gapCls, gapStr } = expGapCls(runRate, budgeted, true, 1000);
                  return {
                    secondary: `Budget: ${f(budgeted)}`,
                    secondaryCls: budgeted >= 0 ? 'text-success' : 'text-danger',
                    ...(gapStr ? { tertiary: gapStr, tertiaryCls: gapCls } : {}),
                  };
                })() : {}),
                tooltip: `Projected selling profit at December 31st.\n\nRun-rate: current selling profit + avg CF \u00d7 ${ml} months + avg monthly appreciation \u00d7 ${ml} months.\nBudget: same using your budgeted cash flow and expected appreciation %.\n\nShows what you would net selling today, extrapolated to year-end.` });
            })()}
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

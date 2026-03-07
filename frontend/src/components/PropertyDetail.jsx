import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_URL, isCurrentTenant, fmtDate, yearsHeld, avgMonthly, principalInRange, calcInvestmentScore } from '../config.js';
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

        // Monthly gain = avg cash flow + monthly appreciation (computed after avg)
        // timeToProfit and monthlyGain computed below after avg is available

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

        const annualCashFlow = avg.cashflow * 12;
        const monthlyRent = property.monthly_rent;
        const annualRent = monthlyRent * 12;
        const rentToValue = annualRent / property.purchase_price;

        const capRate = property.purchase_price > 0 ? annualCashFlow / property.purchase_price : 0;
        const cashOnCash = equity > 0 ? annualCashFlow / equity : 0;
        const loanToValue = property.purchase_price > 0 ? property.loan_amount / property.purchase_price : 0;
        const expenseRatio = monthlyRent > 0 ? avg.expenses / monthlyRent : 0;

        const monthlyAppr = yearlyAppr !== null ? yearlyAppr / 12 : 0;
        const monthlyGain = avg.cashflow + monthlyAppr;

        // Time to reach selling profit via cash flow
        // Returns { months, label, cls }
        const timeToProfit = (() => {
          if (sellingProfit <= 0) return { label: '\u2014', cls: 'text-secondary',
            tip: 'No selling profit yet \u2014 nothing to reach.' };
          if (avg.cashflow <= 0) return { label: avg.cashflow === 0 ? '\u2014' : '\u221e (losing)',
            cls: 'text-danger',
            tip: 'Avg cash flow is negative \u2014 the property is consuming cash.' };
          const months = sellingProfit / avg.cashflow;
          const label  = months < 12
            ? `${Math.round(months)} mo`
            : `${(months / 12).toFixed(1)} yr`;
          return { label, cls: months < 24 ? 'text-success' : months < 60 ? '' : 'text-danger', tip: null };
        })();

        // Shared aliases used in both investmentScore and tips
        const avgCashFlow  = avg.cashflow;
        const ltvRatio     = loanToValue;
        // yearlyAppr is in dollars — convert to ratio for score thresholds
        const yearlyApprRatio = (yearlyAppr !== null && property.purchase_price > 0)
          ? yearlyAppr / property.purchase_price : 0;

        // ── Investment score ─────────────────────────────────────────────────
        const investmentScore = calcInvestmentScore({ avgCashFlow, capRate, cashOnCash, expenseRatio, ltvRatio, yearlyApprRatio });

        const f    = n => `$${Math.round(n).toLocaleString()}`;
        const fp   = n => `${Number(n).toFixed(1)}%`;
        const fPct = n => `${(n * 100).toFixed(1)}%`;
        const WOPT = [1, 2, 3, 6, 12];
        const mc = (props) => <MetricCard {...props} style={{ flex: '1 1 150px', minWidth: 140 }} />;

        // ── Smart analysis — always returns array, never null ────────────────
        // Each item: { icon, label, cls, detail, isPrimary? }
        const analysis = (() => {
          const items = [];
          const isRnt = (property.status || '').toLowerCase() === 'rented';
          const noData = property.total_income === 0 && property.total_expenses === 0;

          // ── Primary status (exactly one, always present) ──────────────────
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
                detail: `Last income was ${Math.round(daysSince)} days ago. Extended vacancy is eroding your returns. Consider adjusting rent price or marketing strategy.` });
            } else {
              items.push({ isPrimary: true, icon: '🔄', cls: 'text-warning', label: 'Recently vacated',
                detail: `Property became vacant ${Math.round(daysSince)} days ago. Monitor closely — short vacancies are normal between tenants.` });
            }
          } else if (avgCashFlow < 0 && yearlyAppr !== null && yearlyAppr < 0) {
            // Worst case: losing on both dimensions
            items.push({ isPrimary: true, icon: '🚨', cls: 'text-danger', label: 'Losing on all fronts',
              detail: `Cash flow is ${f(avgCashFlow)}/mo and the property is depreciating ${f(yearlyAppr)}/yr. Every month of holding deepens the loss. Strong case to sell.` });
          } else if (avgCashFlow < 0 && yearlyAppr !== null && yearlyAppr > 0) {
            // Negative CF but appreciating — appreciation may or may not compensate
            items.push({ isPrimary: true, icon: '⚖️', cls: monthlyGain >= 0 ? 'text-warning' : 'text-danger',
              label: monthlyGain >= 0 ? 'Appreciation covers the gap' : 'Negative cash flow, appreciation insufficient',
              detail: monthlyGain >= 0
                ? `Cash is consumed at ${f(Math.abs(avgCashFlow))}/mo but appreciation (${f(yearlyAppr)}/yr = ${f(monthlyAppr)}/mo) more than compensates. Monthly gain: ${f(monthlyGain)}/mo. Watch cash reserves.`
                : `Cash is consumed at ${f(Math.abs(avgCashFlow))}/mo. Appreciation (${f(yearlyAppr)}/yr = ${f(monthlyAppr)}/mo) only partially offsets this. Net monthly loss: ${f(monthlyGain)}/mo.` });
          } else if (avgCashFlow < 0 && (yearlyAppr === null || yearlyAppr === 0)) {
            // Negative CF, no appreciation to help
            items.push({ isPrimary: true, icon: '📉', cls: 'text-danger', label: 'Negative cash flow',
              detail: `Expenses exceed income by ${f(Math.abs(avgCashFlow))}/mo with ${yearlyAppr === 0 ? 'no appreciation to compensate' : 'no possession date set to compute appreciation'}. This property is consuming cash.` });
          } else if (avgCashFlow === 0 && monthlyGain > 0) {
            // CF exactly breaks even, appreciation carries the gain
            items.push({ isPrimary: true, icon: '📈', cls: 'text-success', label: 'Breakeven — appreciation-led',
              detail: `Cash flow is exactly neutral, but appreciation of ${yearlyAppr !== null ? f(yearlyAppr) + '/yr ' : ''}adds ${f(monthlyGain)}/mo in total monthly gain. Self-financing with value growth.` });
          } else if (avgCashFlow === 0 && monthlyGain <= 0) {
            // CF zero, no meaningful gain
            items.push({ isPrimary: true, icon: '➖', cls: 'text-warning', label: 'Breakeven — flat',
              detail: `Cash flow is zero and ${yearlyAppr !== null && yearlyAppr < 0 ? `depreciation (${f(yearlyAppr)}/yr) is reducing total wealth by ${f(Math.abs(monthlyGain))}/mo` : 'no appreciation. The property is treading water.'}.` });
          } else {
            // avgCashFlow > 0 — ordered by specificity
            if (sellingProfit >= 0 && sellingProfit / avgCashFlow < 12) {
              items.push({ isPrimary: true, icon: '⭐', cls: 'text-success', label: 'Exceptional yield',
                detail: `Cash flow of ${f(avgCashFlow)}/mo recovers the entire selling profit in ${Math.round(sellingProfit/avgCashFlow)} months. Rare performance — keep holding.` });
            } else if (monthlyRent > 0 && sellingProfit < property.market_price * 0.05) {
              items.push({ isPrimary: true, icon: '🐄', cls: 'text-success', label: 'Golden cow — keep',
                detail: `Strong cash flow (${f(avgCashFlow)}/mo) but selling today nets only ${f(sellingProfit)}. The property earns far more by holding than by selling.` });
            } else if (sellingProfit > property.market_price * 0.15 && monthlyGain < property.market_price * 0.003) {
              items.push({ isPrimary: true, icon: '💡', cls: 'text-warning', label: 'Consider selling',
                detail: `Unrealized gain of ${f(sellingProfit)} is significant, but monthly gain is only ${f(monthlyGain)}/mo. Capital may work harder elsewhere.` });
            } else if (monthlyGain < 0) {
              // avgCashFlow > 0 but severe depreciation overwhelms it
              items.push({ isPrimary: true, icon: '📊', cls: 'text-warning', label: 'Depreciation eroding gains',
                detail: `Cash flow is positive (${f(avgCashFlow)}/mo) but depreciation (${yearlyAppr !== null ? f(yearlyAppr)+'/yr' : 'unknown'}) results in a negative monthly gain of ${f(monthlyGain)}/mo.` });
            } else if (yearlyAppr !== null && yearlyAppr > 0) {
              // avgCashFlow > 0, yearlyAppr > 0, monthlyGain > 0 — all green
              items.push({ isPrimary: true, icon: '🚀', cls: 'text-success', label: 'Strong performer',
                detail: `All metrics positive: cash flow ${f(avgCashFlow)}/mo, appreciation ${f(yearlyAppr)}/yr, monthly gain ${f(monthlyGain)}/mo.` });
            } else if (yearlyAppr === 0) {
              // avgCashFlow > 0, flat appreciation
              items.push({ isPrimary: true, icon: '✅', cls: 'text-success', label: 'Positive cash flow — flat appreciation',
                detail: `Generating ${f(avgCashFlow)}/mo in cash flow. Market value has not changed since purchase — monthly gain equals cash flow (${f(monthlyGain)}/mo).` });
            } else if (yearlyAppr === null) {
              // avgCashFlow > 0, no possession date so appreciation unknown
              items.push({ isPrimary: true, icon: '✅', cls: 'text-success', label: 'Positive cash flow',
                detail: `Generating ${f(avgCashFlow)}/mo in cash flow. Set a possession date to also compute appreciation and monthly gain.` });
            } else {
              // avgCashFlow > 0, yearlyAppr < 0 but monthlyGain >= 0 (avgCashFlow offsets depreciation and then some)
              items.push({ isPrimary: true, icon: '⚖️', cls: 'text-success', label: 'Cash flow covers depreciation',
                detail: `Despite depreciation of ${f(yearlyAppr)}/yr, cash flow (${f(avgCashFlow)}/mo) more than compensates. Net monthly gain: ${f(monthlyGain)}/mo.` });
            }
          }

          // ── Secondary suggestions (appended after primary) ────────────────

          // Low cap rate: suggest rent increase
          if (monthlyRent > 0 && capRate < 0.05) {
            const targetRent = Math.round(property.market_price * 0.06 / 12);
            const delta = targetRent - monthlyRent;
            if (delta > 0) {
              items.push({ icon: '📈', cls: 'text-warning', label: 'Low cap rate',
                detail: `Cap rate of ${(capRate*100).toFixed(1)}% is below the 5% threshold. Raising rent by ~$${delta}/mo would push it toward 6%.` });
            }
          }

          // High expense ratio
          if (monthlyRent > 0 && expenseRatio > 0.45) {
            items.push({ icon: '💸', cls: 'text-danger', label: 'High expense ratio',
              detail: `Expenses are ${(expenseRatio*100).toFixed(0)}% of rent income. Healthy properties typically sit below 40%. Review recurring maintenance, management, or insurance costs.` });
          }

          // High LTV — risk flag
          if (ltvRatio > 0.80 && property.loan_amount > 0) {
            items.push({ icon: '⚡', cls: 'text-danger', label: 'High leverage risk',
              detail: `LTV of ${(ltvRatio*100).toFixed(0)}% means only ${(100-ltvRatio*100).toFixed(0)}% equity cushion. A market dip could put the property underwater.` });
          }

          // Low LTV — refinancing opportunity
          if (ltvRatio > 0 && ltvRatio < 0.55 && equity > 50000) {
            items.push({ icon: '🏦', cls: 'text-success', label: 'Refinancing opportunity',
              detail: `LTV of ${(ltvRatio*100).toFixed(0)}% represents ${f(equity)} in accessible equity. A cash-out refinance could fund another investment without selling.` });
          }

          // Strong appreciation — equity extraction
          if (yearlyAppr !== null && yearlyApprRatio > 0.08) {
            items.push({ icon: '💎', cls: 'text-success', label: 'Strong appreciation',
              detail: `Property is appreciating at ${(yearlyApprRatio*100).toFixed(1)}%/yr (${f(yearlyAppr)}/yr). Consider leveraging this equity growth for portfolio expansion.` });
          }

          // Low appreciation + low yield — consider selling
          if (yearlyAppr !== null && yearlyApprRatio < 0.02 && capRate < 0.04 && property.total_income > 0) {
            items.push({ icon: '🔻', cls: 'text-danger', label: 'Low yield & low growth',
              detail: `Cap rate ${(capRate*100).toFixed(1)}% and appreciation ${(yearlyApprRatio*100).toFixed(1)}%/yr are both weak. Capital may perform better in a higher-yielding asset.` });
          }

          // Cash-on-cash too low
          if (cashOnCash > 0 && cashOnCash < 0.03 && avgCashFlow > 0) {
            items.push({ icon: '🔑', cls: 'text-warning', label: 'Low capital efficiency',
              detail: `Cash-on-cash return of ${(cashOnCash*100).toFixed(1)}% means your equity is barely working. Target is typically 6–8%+.` });
          }

          return items;
        })();


        const [primary, ...secondary] = analysis;

        return (<>
          {/* ── Value & Equity ── */}
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
            {property.monthly_rent > 0 && mc({ label: 'Monthly Rent', primary: f(property.monthly_rent),
              tooltip: 'Current monthly rent charged to tenants.' })}
          </div>

          {/* ── Investment Ratios ── */}
          <p className="stat-section-label">Investment Ratios</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Loan-to-Value', primary: fPct(ltvRatio),
              primaryCls: ltvRatio > 0.80 ? 'text-danger' : ltvRatio > 0.65 ? 'text-warning' : 'text-success',
              tertiary: ltvRatio > 0.80 ? 'High leverage' : ltvRatio < 0.55 ? 'Low leverage' : 'Moderate leverage',
              tooltip: 'Loan \u00f7 Market Value.\nMeasures financial risk \u2014 higher LTV = more leverage = more risk.\nLenders typically require LTV \u2264 80%. Below 65% is considered conservative.\nHigh LTV limits refinancing options and increases exposure to market downturns.' })}
            {mc({ label: 'Cap Rate', primary: fPct(capRate),
              primaryCls: capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger',
              tertiary: capRate > 0.07 ? 'Strong yield' : capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
              tooltip: 'Annual Cash Flow \u00f7 Purchase Price.\nMeasures yield efficiency \u2014 how much return the asset generates relative to its cost, ignoring financing.\nTypical targets: 4\u20136% residential, 6\u20138%+ commercial.\nUseful for comparing properties regardless of how they were financed.' })}
            {mc({ label: 'Cash-on-Cash', primary: fPct(cashOnCash),
              primaryCls: cashOnCash > 0.08 ? 'text-success' : cashOnCash > 0.04 ? '' : cashOnCash < 0 ? 'text-danger' : 'text-warning',
              tertiary: cashOnCash > 0.08 ? 'Strong' : cashOnCash > 0.04 ? 'Moderate' : 'Weak',
              tooltip: 'Annual Cash Flow \u00f7 Equity.\nMeasures capital efficiency \u2014 how hard your invested equity is working.\nTarget: 6\u201310%+ for most investors.\nUnlike cap rate, this accounts for financing: a heavily mortgaged property can show high CoC even with modest income.' })}
            {monthlyRent > 0 && mc({ label: 'Expense Ratio', primary: fPct(expenseRatio),
              primaryCls: expenseRatio < 0.35 ? 'text-success' : expenseRatio < 0.50 ? '' : 'text-danger',
              tertiary: expenseRatio < 0.35 ? 'Lean operations' : expenseRatio < 0.50 ? 'Normal' : 'High costs',
              tooltip: 'Avg Monthly Expenses \u00f7 Monthly Rent.\nMeasures operational health \u2014 what fraction of rent is consumed by costs.\nBelow 35%: efficient. 35\u201350%: normal range. Above 50%: review costs.\nHigh ratios often signal management inefficiency, deferred maintenance, or underpriced rent.' })}
            {monthlyRent > 0 && mc({ label: 'Rent-to-Value', primary: fPct(rentToValue),
              primaryCls: rentToValue > 0.01 ? 'text-success' : rentToValue > 0.007 ? '' : 'text-danger',
              tertiary: rentToValue > 0.01 ? 'Strong RTV' : rentToValue > 0.007 ? 'Moderate' : 'Weak RTV',
              tooltip: 'Annual Rent \u00f7 Purchase Price (the "1% rule" benchmark).\nThe classic 1% rule: monthly rent should be \u22651% of purchase price for a cash-flow-positive property.\n1%+/mo = strong. 0.7\u20131%/mo = moderate. Below 0.7%/mo = challenging to cash flow.\nHigher RTV generally means better income relative to asset cost.' })}
          </div>

          {/* ── Investment Score ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap',
            padding: '0.85rem 1.1rem', marginBottom: '1.25rem',
            borderRadius: '10px', border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 130 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: 'var(--text-tertiary)' }}>Investment Score</span>
              <span style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}
                className={investmentScore.cls}>{investmentScore.score}<span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-tertiary)' }}>/100</span></span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '1.35rem', letterSpacing: '0.05em', color: '#f59e0b' }}>
                {investmentScore.stars}
              </span>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}
                className={investmentScore.cls}>{investmentScore.label}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                Weighted: Cash Flow 30 · Cap Rate 20 · CoC 20 · Expense 15 · LTV 10 · Appreciation 5
              </span>
            </div>
          </div>

          {/* ── Property Analysis (multi-tip) ── */}
          {/* Primary status */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.9rem 1rem', marginBottom: secondary.length > 0 ? '0.5rem' : '1.25rem',
            borderRadius: '10px', border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
          }}>
            <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0 }}>{primary.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }} className={primary.cls}>{primary.label}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: 1.55 }}>
                {primary.detail}
              </div>
            </div>
          </div>
          {/* Secondary suggestions */}
          {secondary.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
              {secondary.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                  padding: '0.6rem 0.9rem',
                  borderRadius: '8px', border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                }}>
                  <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>{s.icon}</span>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.82rem' }} className={s.cls}>{s.label} </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Cash Flow & Gain ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <p className="stat-section-label" style={{ margin: 0 }}>Cash Flow &amp; Gain</p>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: `Avg Income (${avgWindow}M)`,   primary: f(avg.income),   primaryCls: 'text-success',
              tooltip: `Average monthly income over the last ${avgWindow} complete months.` })}
            {mc({ label: `Avg Expenses (${avgWindow}M)`, primary: f(avg.expenses), primaryCls: 'text-danger',
              tooltip: `Average monthly expenses over the last ${avgWindow} complete months.` })}
            {mc({ label: `Avg Cash Flow (${avgWindow}M)`, primary: f(avgCashFlow),
              primaryCls: avgCashFlow >= 0 ? 'text-success' : 'text-danger',
              tooltip: `Average monthly (income \u2212 expenses) over the last ${avgWindow} complete months.` })}
            {mc({ label: 'Monthly Gain', primary: f(monthlyGain) + '/mo',
              primaryCls: monthlyGain >= 0 ? 'text-success' : 'text-danger',
              secondary: yearlyAppr !== null ? `CF ${f(avgCashFlow)} + Appr ${f(monthlyAppr)}/mo` : null,
              secondaryCls: 'text-secondary',
              tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly \u00f7 12).\nCaptures both income and value growth in one number.\nPositive monthly gain means total wealth is increasing even if cash flow alone is low.' })}
            {mc({ label: 'Time to Sell Profit', primary: timeToProfit.label,
              primaryCls: timeToProfit.cls,
              tooltip: timeToProfit.tip || 'How many months of avg cash flow needed to equal the current selling profit.\nShorter = better return on holding. Over 5 years may indicate better value in selling.' })}
          </div>

          {/* ── Income & Expenses (all-time) ── */}
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
              tooltip: 'Market Value + Total Income \u2212 Total Expenses \u2212 Loan Amount.\nWhat you would net if you sold today and paid off the mortgage.' })}
          </div>

          {/* ── YTD ── */}
          <p className="stat-section-label">YTD — trailing 12 months</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'YTD Income',     primary: f(ytdInc), primaryCls: 'text-success' })}
            {mc({ label: 'YTD Expenses',   primary: f(ytdExp), primaryCls: 'text-danger' })}
            {mc({ label: 'YTD Balance',    primary: f(ytdBal),
              primaryCls: ytdBal >= 0 ? 'text-success' : 'text-danger' })}
            {mc({ label: 'YTD Principal',  primary: ytdPrin > 0 ? f(ytdPrin) : '\u2014',
              tertiary: 'From Principal + Mortgage records',
              tooltip: 'Principal paid in the trailing 12 months.\nIncludes explicit Principal expense records plus the principal portion of Mortgage payments (computed from your mortgage rate).' })}
            {mc({ label: 'YTD Net Exp',    primary: f(ytdNetExp),
              primaryCls: ytdNetExp >= 0 ? 'text-danger' : 'text-success' })}
            {mc({ label: 'YTD Net Profit', primary: f(ytdNetProfit),
              primaryCls: ytdNetProfit >= 0 ? 'text-success' : 'text-danger' })}
          </div>

          {/* ── Appreciation ── */}
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

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { getIncome, getExpenses, getTenants, getEvents } from '../api.js';
import { isCurrentTenant, trailingYear, makeInTrailingYear } from '../utils.js';
import { yearsHeld, avgMonthly, principalInRange, calcSimpleHealth, calcExpected,
         monthsLeftInYear, yearFracRemaining,
         calcIRR, buildPropertyIRRCashFlows,
         calcPayback, calcBreakEven, analyzeProperty, calcEconVacancy } from '../metrics.js';
import StatCard from './StatCard.jsx';
import MetricCard from './MetricCard.jsx';
import StarRating from './StarRating.jsx';
import FinancialSummaryPanel from './FinancialSummaryPanel.jsx';
import { fmtDate, WindowPicker, ltvColor, fmtPeriod } from './uiHelpers.jsx';
import { PropertyOptions } from '../modals/ModalBase.jsx';
import { cardAvgIncome, cardAvgExpenses, cardAvgCashFlow, cardAvgNOI, cardCapRate, cardOER, cardDSCR, cardICR, cardLTV, cardCashOnCash, cardExpenseRatio, cardRentToValue, cardMonthlyGain, cardNetPosition, cardPaybackPeriod, cardBreakEven, cardTotalAppreciation, cardYearlyAppreciation, cardProjectedYearEnd, cardYearEndBalance, cardEconVacancy, cardIRR, cardMaintCapEx, cardMarketValue, cardEquity, cardAvailEquity, cardMonthlyRent, cardYtdOpProfit, cardLoanAmount, cardMortgageRate } from '../metricDefs.jsx';

const DETAIL_TOOLTIP_STYLE = {
  background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6',
};

export default function PropertyDetail({ property, properties = [], onSelectProperty, onBack,
                                         onAddExpense, onAddIncome, onAddTenant, onEdit, onJump }) {
  const [tenants,    setTenants]    = useState([]);
  const [expenses,   setExpenses]   = useState([]);
  const [events,     setEvents]     = useState([]);
  const [income,     setIncome]     = useState([]);
  const [avgWindow,  setAvgWindow]  = useState(3);

  useEffect(() => {
    if (!property) return;

    // Income and expenses are fetched atomically so YTD metrics never render
    // with one loaded and the other still empty (race condition → wrong YTD values).
    Promise.all([
      getIncome(property.id),
      getExpenses(property.id),
    ]).then(([inc, exp]) => {
      setIncome(inc);
      setExpenses(exp);
    }).catch(() => {});

    // Tenants and events don't affect financial metrics — load independently.
    getTenants({ property_id: property.id }).then(setTenants).catch(() => {});
    getEvents(property.id).then(setEvents).catch(() => {});
  }, [property?.id, property?.total_income, property?.total_expenses]);

  if (!property) return null;

  // ── Derived view helpers ──────────────────────────────────────────────────
  const currTenants = tenants.filter(isCurrentTenant);
  const recentExp   = [...expenses].sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)).slice(0, 5);
  const isVacant    = property.status === 'Vacant';

  // Tag records with property_id so FinancialSummaryPanel can key per-property amortisation
  const taggedIncome   = useMemo(() => income.map(r   => ({ ...r, property_id: property.id })), [income,   property.id]);
  const taggedExpenses = useMemo(() => expenses.map(r => ({ ...r, property_id: property.id })), [expenses, property.id]);

  const lastRentChange = useMemo(() => {
    const rentEvents = events
      .filter(e => e.column_name === 'monthly_rent' && parseFloat(e.old_value) > 0 && parseFloat(e.new_value) > 0)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return rentEvents[0] ?? null;
  }, [events]);

  // ── Financial fundamentals ────────────────────────────────────────────────
  const downPmt  = property.purchase_price - property.loan_amount;
  const equity   = property.market_price   - property.loan_amount;
  const equityPct = property.market_price > 0 ? equity / property.market_price * 100 : null;
  const loanPct   = property.market_price > 0 ? property.loan_amount / property.market_price * 100 : null;
  const appr      = property.market_price - property.purchase_price;
  const apprPct   = property.purchase_price > 0 ? appr / property.purchase_price * 100 : null;
  const yrs       = yearsHeld(property);
  const yearlyAppr    = yrs ? appr / yrs : null;
  const yearlyApprPct = (yrs && property.purchase_price > 0) ? yearlyAppr / property.purchase_price * 100 : null;
  const projectedYE   = property.market_price + (yearlyAppr ?? 0) * yearFracRemaining();
  const balance         = property.total_income   - property.total_expenses;
  const sellingProfit   = property.market_price + property.total_income - property.total_expenses - property.loan_amount;
  const availableEquity = Math.max(0, 0.80 * property.market_price - property.loan_amount);

  // ── YTD window (trailing 12 months) ──────────────────────────────────────
  const { start: ytdStart, end: ytdEnd } = trailingYear();
  const inYTD = makeInTrailingYear();
  const ytdInc        = income.filter(r   => inYTD(r.income_date)).reduce((s, r) => s + r.amount, 0);
  const ytdExp        = expenses.filter(r => inYTD(r.expense_date)).reduce((s, r) => s + r.amount, 0);
  const ytdBal        = ytdInc - ytdExp;
  const ytdPrin       = principalInRange(expenses, property.loan_amount, property.mortgage_rate || 0, ytdStart, ytdEnd);
  const allTimePrin   = principalInRange(expenses, property.loan_amount, property.mortgage_rate || 0, new Date(0), new Date());

  // Net Expenses = Total Expenses − allTimePrin (down payment + all mortgage principal repayments)
  const totalNetExp     = property.total_expenses - allTimePrin;
  const totalNetBalance = property.total_income   - totalNetExp;
  const roi             = property.market_price > 0 ? totalNetBalance / property.market_price * 100 : null;
  const ytdNetExp     = ytdExp     - ytdPrin;
  const ytdNetBalance = ytdInc     - ytdNetExp;

  // ── Monthly averages & ratios ─────────────────────────────────────────────
  const avg          = avgMonthly(income, expenses, avgWindow);
  const monthlyRent  = property.monthly_rent;
  const annualRent   = monthlyRent * 12;
  const annualNOI    = avg.noi * 12;
  const annualCashFlow = avg.cashflow * 12;
  const capRate      = property.purchase_price > 0 ? annualNOI  / property.purchase_price : 0;
  const cashOnCash   = equity > 0 ? annualCashFlow / equity : 0;
  const loanToValue  = property.market_price > 0 ? property.loan_amount / property.market_price : 0;
  const expenseRatio = monthlyRent > 0 ? avg.expenses / monthlyRent : 0;
  const rentToValue  = property.purchase_price > 0 ? annualRent / property.purchase_price : 0;
  const oer          = avg.income > 0 ? avg.noiExpenses / avg.income : 0;

  const annualInterest = property.loan_amount > 0 && property.mortgage_rate > 0
    ? property.loan_amount * property.mortgage_rate / 100 : null;

  // ── Derived metrics that were previously inline IIFEs ─────────────────────
  // Economic vacancy: uses status-change and rent-change events to measure real
  // vacancy windows, rather than comparing income against potential rent.
  const econVacancy = useMemo(
    () => calcEconVacancy(property, events, ytdStart, ytdEnd),
    [property, events, ytdStart, ytdEnd]
  );

  const maintCapexRatio = (() => {
    if (!monthlyRent) return null;
    const maintExp = expenses
      .filter(r => inYTD(r.expense_date) && ['Maintenance', 'Capital'].includes(r.expense_category))
      .reduce((s, r) => s + r.amount, 0);
    return annualRent > 0 ? maintExp / annualRent : null;
  })();

  const irr = (() => {
    const cfs = buildPropertyIRRCashFlows(property, income, expenses);
    if (!cfs) return null;
    return calcIRR(cfs);
  })();

  // ── Expected / budgeted values ────────────────────────────────────────────
  const expected       = calcExpected(property, avg.mortgage);
  const icr    = annualInterest > 0 ? annualNOI / annualInterest : null;
  const expICR = (annualInterest > 0 && expected?.monthlyNOI != null)
    ? expected.monthlyNOI * 12 / annualInterest : null;
  const monthlyAppr    = yearlyAppr !== null ? yearlyAppr / 12 : 0;
  const monthlyGain    = avg.cashflow + monthlyAppr;

  const expApprPct     = property.expected_appreciation_pct || 0;
  const expYearlyAppr  = expApprPct > 0 ? property.purchase_price * expApprPct / 100 : null;
  const expMonthlyAppr = expYearlyAppr !== null ? expYearlyAppr / 12 : null;
  const expMonthlyCF   = expected?.monthlyCF ?? null;
  const expMonthlyGain = (expMonthlyCF !== null && expMonthlyAppr !== null)
    ? expMonthlyCF + expMonthlyAppr
    : expMonthlyCF !== null ? expMonthlyCF : null;

  // ── Payback & Break-even via shared pure functions ──────────────────────
  const pbOutstanding = property.total_expenses - property.total_income;
  const paybackPeriod = calcPayback(pbOutstanding, avg.cashflow);
  const expPayback    = (() => {
    if (expMonthlyCF == null || expMonthlyCF <= 0) return null;
    if (pbOutstanding <= 0) return 'Exp: Recovered';
    return 'Exp: ' + fmtPeriod(pbOutstanding / expMonthlyCF);
  })();

  const breakEven    = calcBreakEven(sellingProfit, monthlyGain);
  const expBreakEven = (() => {
    if (expMonthlyGain == null || expMonthlyGain <= 0) return null;
    if (sellingProfit >= 0) return 'Exp: Reached';
    return 'Exp: ' + fmtPeriod(-sellingProfit / expMonthlyGain);
  })();

  // ── Investment score & analysis ───────────────────────────────────────────
  const investmentScore = calcSimpleHealth(property);
  const ltvRatio        = loanToValue;
  const yearlyApprRatio = (yearlyAppr !== null && property.purchase_price > 0)
    ? yearlyAppr / property.purchase_price : 0;

  // ── Net Position card secondary ───────────────────────────────────────────
  const npPct = balance !== 0 ? (sellingProfit / Math.abs(balance) * 100) : null;

  // ── Year-End Balance ──────────────────────────────────────────────────────
  const ml          = monthsLeftInYear();
  const yearEndRate = sellingProfit + avg.cashflow * ml + monthlyAppr * ml;
  const yearEndBudg = expMonthlyGain != null ? sellingProfit + expMonthlyGain * ml : null;

  // ── Property analysis ────────────────────────────────────────────────────
  const analysis = analyzeProperty(property, income, {
    avgCashflow: avg.cashflow, yearlyAppr, monthlyAppr, monthlyGain, sellingProfit,
    monthlyRent, capRate, expenseRatio, ltvRatio, equity, cashOnCash, yearlyApprRatio,
  });
  const [primary, ...secondary] = analysis;

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = [
    { name: 'Total Income',     value: property.total_income,  fill: '#10b981' },
    { name: 'Net Expenses',     value: Math.max(0, totalNetExp), fill: '#ef4444' },
    { name: 'Operating Profit', value: totalNetBalance,         fill: totalNetBalance >= 0 ? '#3b82f6' : '#f59e0b' },
    { name: 'Net Position',     value: sellingProfit,           fill: sellingProfit >= 0 ? '#8b5cf6' : '#ef4444' },
  ];

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
              <PropertyOptions properties={properties} />
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
              {lastRentChange ? (
                <span style={{
                  fontSize: '0.8rem', color: 'var(--text-secondary)',
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '0.2rem 0.6rem',
                }}>
                  Last rent change: <strong style={{ color: 'var(--text-primary)' }}>
                    {new Date(lastRentChange.created_at).toLocaleDateString()}
                  </strong>
                  {' '}(was ${parseFloat(lastRentChange.old_value).toLocaleString()}/mo)
                </span>
              ) : !isVacant && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
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

      {/* ══ Summary & Insights ══════════════════════════════════════════════ */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '0.85rem' }}>
          {cardMarketValue(property.market_price, appr, apprPct, property.purchase_price)}
          {cardEquity(equity, equityPct, loanToValue, ltvColor(loanToValue).cls)}
          {cardAvailEquity(availableEquity)}
          {cardNetPosition(sellingProfit, npPct)}
          {cardMonthlyRent(monthlyRent)}
          {cardAvgCashFlow(avg.cashflow, expMonthlyCF, avgWindow)}
          {cardOER(avg.income > 0 ? avg.noiExpenses / avg.income : null, expected?.oer)}
          {cardYtdOpProfit(ytdNetBalance)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.6rem 0.9rem', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
          }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }} className={investmentScore.cls}>
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

      {/* ══ Financing Efficiency ══════════════════════════════════════════════ */}
      <p className="stat-section-label">Financing Efficiency</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardLoanAmount(property.loan_amount, loanPct)}
        {property.mortgage_rate > 0 && cardMortgageRate(property.mortgage_rate, annualInterest)}
        {cardLTV(ltvRatio)}
        {cardDSCR(
          avg.mortgage > 0 ? avg.noi / avg.mortgage : null,
          expected?.dscr,
          avgWindow,
          expected?.dscr != null ? `Exp: ${expected.dscr.toFixed(2)}x — no mortgage recorded` : 'No mortgage expenses recorded',
        )}
        {cardICR(icr, expICR, null)}
      </div>

      {/* ══ Investment Ratios ════════════════════════════════════════════════ */}
      <p className="stat-section-label">Investment Ratios</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardCapRate(capRate, expected?.capRate, null)}
        {cardCashOnCash(cashOnCash, expected?.cashOnCash)}
        {monthlyRent > 0 && cardExpenseRatio(expenseRatio, expected?.expenseRatio)}
        {monthlyRent > 0 && cardRentToValue(rentToValue)}
      </div>

      {/* ══ Operating Metrics & Gain ══════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <p className="stat-section-label" style={{ margin: 0 }}>Operating Metrics &amp; Gain</p>
        <WindowPicker value={avgWindow} onChange={setAvgWindow} />
      </div>

      {/* Row 1: Cash flow & gain */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {cardAvgIncome(avg.income, null, avgWindow)}
        {cardAvgCashFlow(avg.cashflow, expMonthlyCF, avgWindow)}
        {cardMonthlyGain(monthlyGain, expMonthlyGain)}
        {cardPaybackPeriod(paybackPeriod, expPayback, pbOutstanding, property.total_income, property.total_expenses)}
        {cardBreakEven(breakEven, expBreakEven)}
      </div>

      {/* Row 2: NOI, expenses, cap rate */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {cardAvgNOI(avg.noi, expected?.monthlyNOI, avgWindow)}
        {cardAvgExpenses(avg.expenses, expected?.monthlyExpenses, avgWindow, monthlyRent)}
        {cardCapRate(capRate, expected?.capRate, avgWindow)}
      </div>

      {/* Row 3: OER, IRR, vacancy, maint */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardOER(avg.income > 0 ? oer : null, expected?.oer)}
        {cardIRR(irr, !!property.poss_date)}
        {cardEconVacancy(econVacancy)}
        {cardMaintCapEx(maintCapexRatio)}
      </div>

      {/* ══ Income & Expenses ═════════════════════════════════════════════════ */}
      <FinancialSummaryPanel
        properties={[property]}
        allIncome={taggedIncome}
        allExpenses={taggedExpenses}
        scope="property"
      />

      {/* ══ Appreciation ══════════════════════════════════════════════════════ */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardTotalAppreciation(appr, apprPct, property.purchase_price)}
        {cardYearlyAppreciation(yearlyAppr, expYearlyAppr, expApprPct, yearlyApprPct)}
        {cardProjectedYearEnd(projectedYE)}
        {cardYearEndBalance(yearEndRate, yearEndBudg, ml)}
      </div>

      {/* Chart */}
      <div className="chart-container">
        <div className="chart-header"><h2 className="chart-title">Financial Overview</h2></div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 80, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
            <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }}
              tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} width={115} />
            <Tooltip
              contentStyle={DETAIL_TOOLTIP_STYLE}
              formatter={v => [`$${Number(v).toLocaleString()}`, '']}
              labelFormatter={l => l}
            />
            <Bar dataKey="value" radius={[0,4,4,0]}>
              {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              <LabelList dataKey="value" position="right"
                formatter={v => `$${Number(v).toLocaleString()}`}
                style={{ fill: '#9ca3af', fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Current Tenants */}
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
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.3rem', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                    {t.notes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Recent Expenses */}
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

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_URL } from '../config.js';
import { isCurrentTenant, trailingYear, makeInTrailingYear } from '../utils.js';
import { yearsHeld, avgMonthly, principalInRange, calcSimpleHealth, calcExpected,
         expGap, monthsLeftInYear, yearFracRemaining,
         calcIRR, buildPropertyIRRCashFlows,
         calcPayback, calcBreakEven, analyzeProperty, calcEconVacancy } from '../metrics.js';
import StatCard from './StatCard.jsx';
import MetricCard from './MetricCard.jsx';
import StarRating from './StarRating.jsx';
import FinancialPeriodSection from './FinancialPeriodSection.jsx';
import { fmt, fmtDate, fp, fPct, mc, WindowPicker, wLabel, ltvColor, fmtPeriod } from './uiHelpers.jsx';
import { PropertyOptions } from '../modals/ModalBase.jsx';

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
      fetch(`${API_URL}/income?property_id=${property.id}`).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/expenses?property_id=${property.id}`).then(r => r.ok ? r.json() : []),
    ]).then(([inc, exp]) => {
      setIncome(inc);
      setExpenses(exp);
    }).catch(() => {});

    // Tenants and events don't affect financial metrics — load independently.
    fetch(`${API_URL}/tenants?property_id=${property.id}`)
      .then(r => r.ok ? r.json() : []).then(setTenants).catch(() => {});
    fetch(`${API_URL}/events?property_id=${property.id}`)
      .then(r => r.ok ? r.json() : []).then(setEvents).catch(() => {});
  }, [property?.id, property?.total_income, property?.total_expenses]);

  if (!property) return null;

  // ── Derived view helpers ──────────────────────────────────────────────────
  const currTenants = tenants.filter(isCurrentTenant);
  const recentExp   = [...expenses].sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)).slice(0, 5);
  const isVacant    = property.status === 'Vacant';

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

  const expProps = (actual, exp, colorFn, fmtFn, label = 'Exp:', hiIsGood = true, absThresh = 25) =>
    expGap(actual, exp, colorFn, fmtFn, label, hiIsGood, absThresh);

  // ── Net Position card secondary ───────────────────────────────────────────
  const npPct = balance !== 0 ? (sellingProfit / Math.abs(balance) * 100) : null;

  const monthlyGainExpProps = expGap(monthlyGain, expMonthlyGain, v => v >= 0 ? 'text-success' : 'text-danger', fmt, 'Exp:', true, 50);

  // yearlyApprExpProps: custom label + special tertiary when no possession date
  const yearlyApprExpProps = expYearlyAppr == null ? {} : yearlyAppr === null
    ? { secondary: `Exp: ${fmt(expYearlyAppr)} (${expApprPct}% per year)`,
        secondaryCls: 'text-success',
        tertiary: 'No possession date \u2014 cannot compute actual' }
    : expGap(yearlyAppr, expYearlyAppr, v => v >= 0 ? 'text-success' : 'text-danger',
        v => `${fmt(v)} (${expApprPct}% per year)`, 'Exp:', true, 200);

  // ── Year-End Balance ──────────────────────────────────────────────────────
  const ml          = monthsLeftInYear();
  const yearEndRate = sellingProfit + avg.cashflow * ml + monthlyAppr * ml;
  const yearEndBudg = expMonthlyGain != null ? sellingProfit + expMonthlyGain * ml : null;
  const yearEndExpProps = expGap(yearEndRate, yearEndBudg, v => v >= 0 ? 'text-success' : 'text-danger', fmt, 'Budget:', true, 1000);

  // ── Property analysis ────────────────────────────────────────────────────
  const analysis = analyzeProperty(property, income, {
    avgCashflow: avg.cashflow, yearlyAppr, monthlyAppr, monthlyGain, sellingProfit,
    monthlyRent, capRate, expenseRatio, ltvRatio, equity, cashOnCash, yearlyApprRatio,
  });
  const [primary, ...secondary] = analysis;

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = [
    { name: 'Income',           value: property.total_income },
    { name: 'Net Exp',          value: Math.max(0, totalNetExp) },
    { name: 'Operating Profit', value: totalNetBalance },
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
          {mc({ label: 'Market Value', primary: fmt(property.market_price),
            secondary: appr !== 0 ? (appr >= 0 ? '+' : '') + fmt(appr) + (apprPct !== null ? ' (' + apprPct.toFixed(1) + '%)' : '') : null,
            secondaryCls: appr >= 0 ? 'text-success' : 'text-danger',
            tertiary: `purchased ${fmt(property.purchase_price)}`,
            tooltip: `Current estimated market value.\nAppreciation: ${fmt(appr)} (${apprPct !== null ? apprPct.toFixed(1) + '%' : 'n/a'} over purchase price of ${fmt(property.purchase_price)}).` })}
          {mc({ label: 'Equity', primary: fmt(equity),
            primaryCls: equity >= 0 ? 'text-success' : 'text-danger',
            secondary: equityPct !== null ? fp(equityPct) + ' of value' : null,
            secondaryCls: equityPct !== null && equityPct >= 50 ? 'text-success' : '',
            tertiary: loanToValue > 0 ? `LTV ${fPct(loanToValue)}` : null,
            tertiaryCls: ltvColor(loanToValue).cls,
            tooltip: 'Market Value − Loan Amount.\nLTV shown — below 65%: conservative. 65–80%: normal. Above 80%: high risk.' })}
          {mc({ label: 'Avail. Equity', primary: availableEquity > 0 ? fmt(availableEquity) : '—',
            primaryCls: availableEquity > 0 ? 'text-success' : 'text-secondary',
            tertiary: availableEquity > 0 ? 'Above 20% LTV threshold' : 'LTV too high',
            tooltip: 'Equity accessible via refinancing while staying at ≤80% LTV.\nFormula: (0.80 × Market Value) − Loan Amount.' })}
          {mc({ label: 'Net Position', primary: fmt(sellingProfit),
            primaryCls: sellingProfit >= 0 ? 'text-success' : 'text-danger',
            secondary: npPct !== null ? npPct.toFixed(1) + '% of net spending' : null,
            secondaryCls: npPct !== null ? (npPct >= 0 ? 'text-success' : 'text-danger') : '',
            tooltip: `What you would net if you sold this property today and cleared the mortgage.\nFormula: Market Value + All Income − All Expenses − Loan Balance.` })}
          {mc({ label: 'Monthly Rent', primary: monthlyRent ? fmt(monthlyRent) : '—',
            tooltip: 'Configured monthly rent. Used for Cap Rate and OER calculations.' })}
          {mc({ label: `Avg CF (${wLabel(avgWindow)})`, primary: fmt(avg.cashflow),
            primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
            tooltip: `Average monthly (Income − Expenses) over the last ${wLabel(avgWindow)} of complete months.` })}
          {mc({ label: `OER (${wLabel(avgWindow)})`, primary: avg.income > 0 ? fPct(avg.noiExpenses / avg.income) : '—',
            primaryCls: avg.income > 0 ? (avg.noiExpenses / avg.income < 0.35 ? 'text-success' : avg.noiExpenses / avg.income < 0.5 ? '' : 'text-danger') : '',
            tooltip: 'Operating Expense Ratio = op-ex ÷ income. Below 35%: efficient. 35–50%: normal. Above 50%: high.' })}
          {mc({ label: 'YTD Op. Profit', primary: fmt(ytdNetBalance),
            primaryCls: ytdNetBalance >= 0 ? 'text-success' : 'text-danger',
            tertiary: 'Trailing 12 months',
            tooltip: 'Income minus operating expenses (principal excluded) over the trailing 12 months.' })}
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
        {mc({ label: 'Loan Amount', primary: fmt(property.loan_amount), primaryCls: 'text-danger',
          secondary: loanPct !== null ? fp(loanPct) + ' of value' : null,
          tooltip: 'Outstanding mortgage or loan balance. Update this when you pay it down to keep LTV accurate.' })}
        {property.mortgage_rate > 0 && mc({ label: 'Mortgage Rate', primary: `${property.mortgage_rate}%`,
          tertiary: annualInterest ? `~${fmt(annualInterest)}/yr in interest` : null,
          tooltip: 'Annual mortgage interest rate. Used to compute interest cost and interest coverage ratio.' })}
        {mc({ label: 'Loan-to-Value', primary: fPct(ltvRatio),
          primaryCls: ltvColor(ltvRatio).cls,
          tertiary: ltvRatio > 0.80 ? 'High leverage' : ltvRatio < 0.55 ? 'Low leverage' : 'Moderate leverage',
          tooltip: 'Loan \u00f7 Market Value. Below 65%: conservative. 65\u201380%: normal. Above 80%: high risk.' })}
        {mc({
          label: `DSCR (${wLabel(avgWindow)})`,
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
          tooltip: 'Debt Service Coverage = monthly NOI \u00f7 mortgage payment.\n\u2265 1.25x: comfortable. 1.0\u20131.25x: marginal. < 1.0x: income doesn\u2019t cover the mortgage.' })}
        {icr !== null && mc({ label: 'Interest Coverage', primary: icr.toFixed(2) + 'x',
          primaryCls: icr >= 2 ? 'text-success' : icr >= 1.25 ? '' : 'text-danger',
          ...expProps(icr, expICR,
            v => v >= 2 ? 'text-success' : v >= 1.25 ? '' : 'text-danger',
            v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
          tertiary: icr >= 2 ? 'Strong' : icr >= 1.25 ? 'Adequate' : 'Weak',
          tooltip: 'Annual NOI \u00f7 Annual Interest Expense (loan \u00d7 rate).\n\u2265 2.0x: strong. 1.25\u20132.0x: adequate. < 1.25x: tight.\nExp uses budgeted operating costs.' })}
      </div>

      {/* ══ Investment Ratios ════════════════════════════════════════════════ */}
      <p className="stat-section-label">Investment Ratios</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({
          label: 'Cap Rate', primary: fPct(capRate),
          primaryCls: capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger',
          ...expProps(capRate, expected?.capRate,
            v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger', fPct),
          tertiary: capRate > 0.07 ? 'Strong yield' : capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
          tooltip: 'Annual NOI \u00f7 Purchase Price. Financing-agnostic measure of a property\u2019s income yield.\nResidential target: 4\u20136%. Commercial: 6\u20138%+.' })}
        {mc({
          label: 'Cash-on-Cash', primary: fPct(cashOnCash),
          primaryCls: cashOnCash > 0.08 ? 'text-success' : cashOnCash > 0.04 ? '' : cashOnCash < 0 ? 'text-danger' : 'text-warning',
          ...expProps(cashOnCash, expected?.cashOnCash,
            v => v > 0.08 ? 'text-success' : v > 0.04 ? '' : v < 0 ? 'text-danger' : 'text-warning', fPct),
          tooltip: 'Annual Cash Flow \u00f7 Equity. Measures how hard your invested equity is working.\nTarget: 6\u201310%+.' })}
        {monthlyRent > 0 && mc({
          label: 'Expense Ratio', primary: fPct(expenseRatio),
          primaryCls: expenseRatio < 0.35 ? 'text-success' : expenseRatio < 0.50 ? '' : 'text-danger',
          ...expProps(expenseRatio, expected?.expenseRatio,
            v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false),
          tooltip: 'Avg Monthly Expenses \u00f7 Monthly Rent. All costs including mortgage.\nBelow 35%: efficient. 35\u201350%: normal. Above 50%: review costs.' })}
        {monthlyRent > 0 && mc({ label: 'Rent-to-Value', primary: fPct(rentToValue),
          primaryCls: rentToValue > 0.01 ? 'text-success' : rentToValue > 0.007 ? '' : 'text-danger',
          tertiary: rentToValue > 0.01 ? 'Passes 1% rule' : rentToValue > 0.007 ? 'Near 1% rule' : 'Below 1% rule',
          tooltip: 'Monthly Rent \u00f7 Purchase Price. The 1% rule: monthly rent \u2265 1% of purchase price signals healthy cash flow potential.' })}
      </div>

      {/* ══ Operating Metrics & Gain ══════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <p className="stat-section-label" style={{ margin: 0 }}>Operating Metrics &amp; Gain</p>
        <WindowPicker value={avgWindow} onChange={setAvgWindow} />
      </div>

      {/* Row 1: Cash flow & gain */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {mc({ label: `Avg Income (${wLabel(avgWindow)})`, primary: fmt(avg.income), primaryCls: 'text-success',
          tooltip: `Average monthly income over the last ${avgWindow} complete months.` })}
        {mc({ label: `Avg Cash Flow (${wLabel(avgWindow)})`, primary: fmt(avg.cashflow),
          primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
          ...expProps(avg.cashflow, expMonthlyCF,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v)),
          tooltip: `Average monthly (income \u2212 all expenses incl. mortgage) over the last ${avgWindow} months.\nExp = budgeted NOI minus expected mortgage.` })}
        {mc({ label: 'Monthly Gain', primary: fmt(monthlyGain),
          primaryCls: monthlyGain >= 0 ? 'text-success' : 'text-danger',
          secondary: yearlyAppr !== null && expMonthlyGain == null
            ? `CF ${fmt(avg.cashflow)} + Appr ${fmt(monthlyAppr)}/mo` : null,
          secondaryCls: 'text-secondary',
          ...monthlyGainExpProps,
          tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly \u00f7 12). Combines income and value growth in one number.\nExp uses budgeted operating costs, expected mortgage, and expected appreciation %.' })}
        {mc({ label: 'Payback Period',
          ...paybackPeriod,
          secondary: expPayback, secondaryCls: expPayback ? 'text-success' : '',
          tooltip: `Time until all recorded expenses are fully recovered by cumulative cash flow.\nNumerator = Total Expenses − Total Income (${fmt(property.total_expenses)} − ${fmt(property.total_income)}).\nExp uses budgeted cash flow.` })}
        {mc({ label: 'Break-even',
          ...breakEven,
          secondary: expBreakEven, secondaryCls: expBreakEven ? 'text-success' : '',
          tooltip: 'Time until Net Position reaches zero or better.\nUses monthly gain (cash flow + appreciation) to close the gap.\nExp uses budgeted monthly gain.' })}
      </div>

      {/* Row 2: NOI, expenses, cap rate */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {mc({
          label: `Avg NOI (${wLabel(avgWindow)})`, primary: fmt(avg.noi),
          primaryCls: avg.noi >= 0 ? 'text-success' : 'text-danger',
          ...expProps(avg.noi, expected?.monthlyNOI,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v)),
          tooltip: 'Net Operating Income = avg monthly income \u2212 op-ex (excl. mortgage & principal).\nExp uses budgeted fixed costs + utilities + tax/12.' })}
        {mc({
          label: `Avg Expenses (${wLabel(avgWindow)})`, primary: fmt(avg.expenses),
          primaryCls: avg.expenses > avg.income * 0.85 ? 'text-danger' : avg.expenses > avg.income * 0.65 ? 'text-warning' : '',
          ...expProps(avg.expenses, expected?.monthlyExpenses,
            v => v < (monthlyRent * 0.65) ? '' : v < (monthlyRent * 0.85) ? 'text-warning' : 'text-danger',
            v => fmt(v), 'Exp:', false),
          tooltip: 'Avg total monthly expenses (all categories including mortgage).\nExp = budgeted op-ex + actual avg mortgage payment.' })}
        {mc({
          label: 'Cap Rate', primary: fPct(capRate),
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
          tooltip: 'Operating Expense Ratio = op-ex \u00f7 gross income. Excludes mortgage and principal.' })}
        {mc({
          label: 'IRR',
          primary: irr !== null ? fPct(irr) : '\u2014',
          primaryCls: irr !== null
            ? (irr > 0.15 ? 'text-success' : irr > 0.08 ? '' : irr < 0 ? 'text-danger' : 'text-warning')
            : 'text-secondary',
          tertiary: irr !== null
            ? (irr > 0.15 ? 'Excellent' : irr > 0.08 ? 'Good' : irr < 0 ? 'Loss' : 'Below target')
            : (!property.poss_date ? 'No possession date set' : 'Need \u2265 2 months of records'),
          tooltip: 'Internal Rate of Return \u2014 the annualised rate that makes NPV of all cash flows zero.\nTarget: 10\u201315%+ for real estate.' })}
        {mc({
          label: 'Economic Vacancy',
          primary: econVacancy !== null ? `${Math.min(econVacancy, 100).toFixed(1)}%` : '\u2014',
          primaryCls: econVacancy !== null ? (econVacancy > 10 ? 'text-danger' : econVacancy > 4 ? 'text-warning' : 'text-success') : 'text-secondary',
          tertiary: econVacancy !== null ? (econVacancy > 10 ? 'High loss' : econVacancy > 4 ? 'Moderate' : 'Low') : 'No status events recorded',
          tooltip: 'Lost rent due to vacancy \u00f7 Potential rent (trailing 12 months).\n\nMeasured from Vacant\u2192Rented status changes in the Events log.\nRent value at the time of each vacancy is used for lost-rent calculation.\nTarget: < 5%.' })}
        {mc({
          label: 'Maint+CapEx Ratio',
          primary: maintCapexRatio !== null ? fPct(maintCapexRatio) : '\u2014',
          primaryCls: maintCapexRatio !== null ? (maintCapexRatio < 0.05 ? 'text-success' : maintCapexRatio < 0.12 ? '' : 'text-danger') : 'text-secondary',
          tertiary: maintCapexRatio !== null ? (maintCapexRatio < 0.05 ? 'Low' : maintCapexRatio < 0.12 ? 'Normal' : 'High') : 'Set monthly rent to compute',
          tooltip: 'YTD Maintenance + Capital Expenditure \u00f7 Annual gross rental income.\nNorm: 5\u201310% of gross rent.' })}
      </div>

      {/* ══ Income & Expenses (all-time) ══════════════════════════════════════ */}
      <p className="stat-section-label">Income &amp; Expenses (all-time)</p>
      <FinancialPeriodSection
        income={property.total_income} expenses={property.total_expenses}
        netExpenses={totalNetExp} balance={balance}
        operatingProfit={totalNetBalance} roi={roi}
        principal={allTimePrin} scope="property" />

      {/* ══ YTD ═══════════════════════════════════════════════════════════════ */}
      <p className="stat-section-label">YTD — trailing 12 months</p>
      <FinancialPeriodSection prefix="YTD "
        income={ytdInc} expenses={ytdExp} netExpenses={ytdNetExp}
        balance={ytdBal} operatingProfit={ytdNetBalance}
        principal={ytdPrin} scope="property" />

      {/* ══ Appreciation ══════════════════════════════════════════════════════ */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Appreciation', primary: fmt(appr),
          primaryCls: appr >= 0 ? 'text-success' : 'text-danger',
          secondary: apprPct !== null && property.purchase_price > 0 ? apprPct.toFixed(1) + '% from ' + fmt(property.purchase_price) : null,
          secondaryCls: appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value \u2212 Purchase Price. Total unrealised gain since acquisition.' })}
        {mc({
          label: 'Yearly Appreciation',
          primary: yearlyAppr !== null ? fmt(yearlyAppr) : '\u2014',
          primaryCls: yearlyAppr !== null ? (yearlyAppr >= 0 ? 'text-success' : 'text-danger') : 'text-secondary',
          secondary: yearlyApprPct !== null ? fp(yearlyApprPct) + ' per year' : null,
          secondaryCls: yearlyAppr !== null && yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          ...yearlyApprExpProps,
          tooltip: 'Appreciation \u00f7 years held since possession date.\nExp uses your expected appreciation % of purchase price.' })}
        {mc({ label: 'Projected Year-End', primary: fmt(projectedYE),
          tertiary: yearlyAppr !== null ? 'At current appreciation rate' : 'No possession date',
          tooltip: 'Current value + remaining year fraction \u00d7 annual appreciation rate.' })}
        {mc({
          label: 'Year-End Balance',
          primary: fmt(yearEndRate),
          primaryCls: yearEndRate >= 0 ? 'text-success' : 'text-danger',
          ...yearEndExpProps,
          tooltip: `Projected Net Position at December 31st.\n\nRun-rate: current Net Position + avg CF \u00d7 ${ml} months + avg monthly appreciation \u00d7 ${ml} months.\nBudget: same using your budgeted cash flow and expected appreciation %.` })}
      </div>

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

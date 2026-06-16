import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { getIncome, getExpenses, getTenants, getEvents, getDocuments, getDocumentUrl } from '../api';
import { isCurrentTenant, trailingYear, makeInTrailingYear } from '../utils';
import { yearsHeld, avgMonthly, principalInRange, calcSimpleHealth, calcExpected, extractRateHistory, computeMortgagePrincipal,
         monthsLeftInYear, yearFracRemaining,
         calcIRR, buildPropertyIRRCashFlows,
         calcPayback, calcBreakEven, analyzeProperty, calcEconVacancy } from '../metrics';
import StarRating from './StarRating';
import FinancialSummaryPanel from './FinancialSummaryPanel';
import { fmtDate, WindowPicker, ltvColor, fmtPeriod } from './uiHelpers';
import { PropertyOptions } from '../modals/ModalBase';
import type { Property, Income, Expense, Event, Renter } from '../types';
import { cardAvgIncome, cardAvgExpenses, cardAvgCashFlow, cardAvgNOI, cardCapRate, cardOER, cardDSCR, cardICR, cardLTV, cardCashOnCash, cardExpenseRatio, cardRentToValue, cardMonthlyGain, cardNetPosition, cardPaybackPeriod, cardBreakEven, cardTotalAppreciation, cardYearlyAppreciation, cardProjectedYearEnd, cardYearEndBalance, cardEconVacancy, cardIRR, cardMaintCapEx, cardMarketValue, cardEquity, cardAvailEquity, cardMonthlyRent, cardYtdOpProfit, cardLoanAmount, cardMortgageRate } from '../metricDefs.tsx';

// Safe accessors for optional Property fields
const mp = (p: Property) => p.market_price ?? 0;
const la = (p: Property) => p.loan_amount ?? 0;
const pp = (p: Property) => p.purchase_price ?? 0;
const ti = (p: Property) => p.total_income ?? 0;
const te = (p: Property) => p.total_expenses ?? 0;
const mr = (p: Property) => p.monthly_rent ?? 0;

const DETAIL_TOOLTIP_STYLE = {
  background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6',
};

interface PropertyDetailProps {
  property: Property;
  properties: Property[];
  onSelectProperty: (property: Property) => void;
  onBack: () => void;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onAddTenant: () => void;
  onEdit: () => void;
  onJump: (view: string, propertyId: number) => void;
}

export default function PropertyDetail({ property, properties = [], onSelectProperty, onBack,
                                         onAddExpense, onAddIncome, onAddTenant, onEdit, onJump }: PropertyDetailProps) {
  const [tenants,    setTenants]    = useState<Renter[]>([]);
  const [expenses,   setExpenses]   = useState<Expense[]>([]);
  const [events,     setEvents]     = useState<Event[]>([]);
  const [income,     setIncome]     = useState<Income[]>([]);
  const [documents,  setDocuments]  = useState<any[]>([]);
  const [avgWindow,  setAvgWindow]  = useState(3);
  const [amortOpen,  setAmortOpen]  = useState(false);

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
    getDocuments(property.id).then(setDocuments).catch(() => {});
  }, [property?.id, property?.total_income, property?.total_expenses]);

  // ── Derived view helpers ──────────────────────────────────────────────────
  const currTenants = tenants.filter(isCurrentTenant);
  const recentExp   = [...expenses].sort((a, b) => new Date(b.expense_date ?? '') .getTime() - new Date(a.expense_date ?? '').getTime()).slice(0, 5);
  const isVacant    = property.status === 'Vacant';

  // Tag records with property_id so FinancialSummaryPanel can key per-property amortisation
  const taggedIncome   = useMemo(() => income.map(r   => ({ ...r, property_id: property.id })), [income,   property.id]);
  const taggedExpenses = useMemo(() => expenses.map(r => ({ ...r, property_id: property.id })), [expenses, property.id]);

  const lastRentChange = useMemo(() => {
    const rentEvents = events
      .filter((e) => e.column_name === 'monthly_rent' && parseFloat(String(e.old_value ?? '0')) > 0 && parseFloat(String(e.new_value ?? '0')) > 0)
      .sort((a, b) => new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime());
    return rentEvents[0] ?? null;
  }, [events]);

  // Rate history from mortgage_rate change events, used for accurate amortisation
  const rateHistory = useMemo(() => extractRateHistory(events), [events]);

  // ── Amortization schedule from recorded mortgage payments ───────────────────
  const amortSchedule = useMemo(() => {
    if (!property.mortgage_rate || !la(property)) return [];
    const mortRecs = expenses.filter(r => r.expense_category === 'Mortgage');
    return computeMortgagePrincipal(mortRecs as unknown as Array<{ amount: number; expense_date: string; [key: string]: unknown }>, la(property), property.mortgage_rate ?? 0, rateHistory);
  }, [expenses, la(property), property.mortgage_rate, rateHistory]);

  // Loan balance timeline — one point per mortgage payment
  const loanTimeline = useMemo(() =>
    amortSchedule
      .filter(r => r.balance_after != null)
      .map(r => ({ date: r.expense_date, Balance: Math.round(r.balance_after) })),
  [amortSchedule]);

  // Rent growth from events
  const rentTimeline = useMemo(() => {
    const rentEvts = events
      .filter(e => e.column_name === 'monthly_rent')
      .map(e => ({
        date: (e.created_at ?? '').split('T')[0].split(' ')[0],
        Rent: parseFloat(String(e.new_value ?? '0')) || 0,
      }))
      .filter(e => e.date && e.Rent > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    // Add current rent as the last point if not already there
    if ((property.monthly_rent ?? 0) > 0) {
      const today = new Date().toISOString().split('T')[0];
      if (!rentEvts.length || rentEvts[rentEvts.length-1].Rent !== property.monthly_rent) {
        rentEvts.push({ date: today, Rent: property.monthly_rent ?? 0 });
      }
    }
    return rentEvts;
  }, [events, property.monthly_rent]);

  // ── Financial fundamentals ────────────────────────────────────────────────
  const equity   = mp(property)   - la(property);
  const equityPct = mp(property) > 0 ? equity / mp(property) * 100 : null;
  const loanPct   = mp(property) > 0 ? la(property) / mp(property) * 100 : null;
  const appr      = mp(property) - pp(property);
  const apprPct   = pp(property) > 0 ? appr / pp(property) * 100 : null;
  const yrs       = yearsHeld(property);
  const yearlyAppr    = yrs ? appr / yrs : null;
  const yearlyApprPct = (yrs && pp(property) > 0 && yearlyAppr !== null) ? yearlyAppr / pp(property) * 100 : null;
  const projectedYE   = mp(property) + (yearlyAppr ?? 0) * yearFracRemaining();
  const balance         = ti(property)   - te(property);
  const sellingProfit   = mp(property) + ti(property) - te(property) - la(property);
  const availableEquity = Math.max(0, 0.80 * mp(property) - la(property));

  // ── YTD window (trailing 12 months) ──────────────────────────────────────
  const { start: ytdStart, end: ytdEnd } = trailingYear();
  const inYTD = makeInTrailingYear();
  const ytdInc        = income.filter((r: any) => inYTD(r.income_date ?? null)).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
  const ytdExp        = expenses.filter((r: any) => inYTD(r.expense_date ?? null)).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
  const ytdPrin       = principalInRange(expenses as any, la(property), property.mortgage_rate ?? 0, ytdStart, ytdEnd, rateHistory);
  const allTimePrin   = principalInRange(expenses as any, la(property), property.mortgage_rate ?? 0, new Date(0), new Date(), rateHistory);

  // Net Expenses = Total Expenses − allTimePrin (down payment + all mortgage principal repayments)
  const totalNetExp     = te(property) - allTimePrin;
  const totalNetBalance = ti(property)   - totalNetExp;
  const ytdNetExp     = ytdExp     - ytdPrin;
  const ytdNetBalance = ytdInc     - ytdNetExp;

  // ── Monthly averages & ratios ─────────────────────────────────────────────
  const avg          = avgMonthly(income as unknown as Array<{ income_date: string; amount: number }>, expenses as unknown as Array<{ expense_date: string; amount: number; expense_category?: string }>, avgWindow);
  const annualRent   = mr(property) * 12;
  const annualNOI    = avg.noi * 12;
  const annualCashFlow = avg.cashflow * 12;
  const capRate      = pp(property) > 0 ? annualNOI  / pp(property) : 0;
  const cashOnCash   = equity > 0 ? annualCashFlow / equity : 0;
  const loanToValue  = mp(property) > 0 ? la(property) / mp(property) : 0;
  const expenseRatio = mr(property) > 0 ? avg.expenses / mr(property) : 0;
  const rentToValue  = pp(property) > 0 ? annualRent / pp(property) : 0;
  const oer          = avg.income > 0 ? avg.noiExpenses / avg.income : 0;

  const annualInterest = la(property) > 0 && (property.mortgage_rate ?? 0) > 0
    ? la(property) * (property.mortgage_rate ?? 0) / 100 : null;

  // ── Derived metrics that were previously inline IIFEs ─────────────────────
  // Economic vacancy: uses status-change and rent-change events to measure real
  // vacancy windows, rather than comparing income against potential rent.
  const econVacancy = useMemo(
     () => calcEconVacancy(property as any, events, ytdStart, ytdEnd),
    [property, events, ytdStart, ytdEnd]
  );

  const maintCapexRatio = useMemo(() => {
    if (!mr(property)) return null;
    const maintExp = expenses
      .filter((r: any) => inYTD(r.expense_date ?? null) && ['Maintenance', 'Capital'].includes(r.expense_category ?? ''))
      .reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
    return annualRent > 0 ? maintExp / annualRent : null;
  }, [expenses, mr(property), annualRent]);

  const irr = useMemo(() => {
    const cfs = buildPropertyIRRCashFlows(property as unknown as { poss_date?: string; monthly_rent: number; market_price: number; loan_amount: number; purchase_price: number }, income as unknown as Array<{ income_date: string; amount: number }>, expenses as unknown as Array<{ expense_date: string; amount: number }>);
    return cfs ? calcIRR(cfs) : null;
  }, [property, income, expenses]);

  // ── Expected / budgeted values ────────────────────────────────────────────
  const expected       = calcExpected(property as unknown as Record<string, unknown>, avg.mortgage);
  const icr    = (annualInterest ?? 0) > 0 ? annualNOI / (annualInterest ?? 1) : null;
  const expICR = ((annualInterest ?? 0) > 0 && expected?.monthlyNOI != null)
    ? expected.monthlyNOI * 12 / (annualInterest ?? 1) : null;
  const monthlyAppr    = yearlyAppr !== null ? yearlyAppr / 12 : 0;
  const monthlyGain    = avg.cashflow + monthlyAppr;

  const expApprPct     = property.expected_appreciation_pct ?? 0;
  const expYearlyAppr  = expApprPct > 0 ? pp(property) * expApprPct / 100 : null;
  const expMonthlyAppr = expYearlyAppr !== null ? expYearlyAppr / 12 : null;
  const expMonthlyCF   = expected?.monthlyCF ?? null;
  const expMonthlyGain = (expMonthlyCF !== null && expMonthlyAppr !== null)
    ? expMonthlyCF + expMonthlyAppr
    : expMonthlyCF !== null ? expMonthlyCF : null;

  // ── Payback & Break-even via shared pure functions ──────────────────────
  const pbOutstanding = te(property) - ti(property);
  const paybackPeriod = calcPayback(pbOutstanding, avg.cashflow);
  const expPayback = useMemo(() => {
    if (expMonthlyCF == null || expMonthlyCF <= 0) return null;
    if (pbOutstanding <= 0) return 'Exp: Recovered';
    return 'Exp: ' + fmtPeriod(pbOutstanding / expMonthlyCF);
  }, [expMonthlyCF, pbOutstanding]);

  const breakEven    = calcBreakEven(sellingProfit, monthlyGain);
  const expBreakEven = useMemo(() => {
    if (expMonthlyGain == null || expMonthlyGain <= 0) return null;
    if (sellingProfit >= 0) return 'Exp: Reached';
    return 'Exp: ' + fmtPeriod(-sellingProfit / expMonthlyGain);
  }, [expMonthlyGain, sellingProfit]);

  // ── Investment score & analysis ───────────────────────────────────────────
  const investmentScore = calcSimpleHealth(property as unknown as { poss_date?: string; purchase_price: number; loan_amount: number; total_income: number; total_expenses: number; market_price: number; monthly_rent: number });
  const ltvRatio        = loanToValue;
  const yearlyApprRatio = (yearlyAppr !== null && pp(property) > 0)
    ? yearlyAppr / pp(property) : 0;

  // ── Net Position card secondary ───────────────────────────────────────────
  const npPct = balance !== 0 ? (sellingProfit / Math.abs(balance) * 100) : null;

  // ── Year-End Balance ──────────────────────────────────────────────────────
  const ml          = monthsLeftInYear();
  const yearEndRate = sellingProfit + avg.cashflow * ml + monthlyAppr * ml;
  const yearEndBudg = expMonthlyGain != null ? sellingProfit + expMonthlyGain * ml : null;

  // ── Property analysis ────────────────────────────────────────────────────
  const analysis = analyzeProperty(property as unknown as Record<string, unknown>, income as unknown as Array<{ income_date: string }>, {
    avgCashflow: avg.cashflow, yearlyAppr, monthlyAppr, monthlyGain, sellingProfit,
    monthlyRent: mr(property), capRate, expenseRatio, ltvRatio, equity, cashOnCash, yearlyApprRatio,
  });
  const [primary, ...secondary] = analysis;

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = [
    { name: 'Total Income',     value: ti(property),  fill: '#10b981' },
    { name: 'Net Expenses',     value: Math.max(0, totalNetExp), fill: '#ef4444' },
    { name: 'Operating Profit', value: totalNetBalance,         fill: totalNetBalance >= 0 ? '#3b82f6' : '#f59e0b' },
    { name: 'Net Position',     value: sellingProfit,           fill: sellingProfit >= 0 ? '#8b5cf6' : '#ef4444' },
  ];

  if (!property) return null;

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
              {[property.address, property.city, property.province].filter(Boolean).join(', ')}{property.postal_code ? ` ${property.postal_code}` : ''}
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
                    {new Date((lastRentChange as any).created_at ?? '').toLocaleDateString()}
                  </strong>
                  {' '}(was ${parseFloat(String((lastRentChange as any).old_value ?? '0')).toLocaleString()}/mo)
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
          { label: '📎 Documents', view: 'documents' },
        ].map(({ label, view }) => (
          <button key={view} className="btn btn-secondary" onClick={() => onJump(view, property.id)}>
            {label} →
          </button>
        ))}
      </div>

      {/* ══ Summary & Insights ══════════════════════════════════════════════ */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '0.85rem' }}>
          {cardMarketValue(mp(property), appr, apprPct, pp(property))}
          {cardEquity(equity, equityPct, loanToValue, ltvColor(loanToValue).cls)}
          {cardAvailEquity(availableEquity)}
          {cardNetPosition(sellingProfit, npPct)}
          {cardMonthlyRent(mr(property))}
          {cardAvgCashFlow(avg.cashflow, expMonthlyCF ?? 0, avgWindow)}
          {cardOER(avg.income > 0 ? avg.noiExpenses / avg.income : null, expected?.oer ?? null, avgWindow)}
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
        {cardLoanAmount(la(property), loanPct)}
        {(property.mortgage_rate ?? 0) > 0 && cardMortgageRate(property.mortgage_rate ?? 0, annualInterest)}
        {cardLTV(ltvRatio)}
        {cardDSCR(
          avg.mortgage > 0 ? avg.noi / avg.mortgage : null,
          expected?.dscr ?? null,
          avgWindow,
          expected?.dscr != null ? `Exp: ${expected.dscr!.toFixed(2)}x — no mortgage recorded` : 'No mortgage expenses recorded',
        )}
        {cardICR(icr ?? null, expICR ?? null, avgWindow)}
      </div>

      {/* ══ Investment Ratios ════════════════════════════════════════════════ */}
      <p className="stat-section-label">Investment Ratios</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardCapRate(capRate, expected?.capRate ?? null, avgWindow)}
        {cardCashOnCash(cashOnCash, expected?.cashOnCash ?? 0)}
        {mr(property) > 0 && cardExpenseRatio(expenseRatio, expected?.expenseRatio ?? 0)}
        {mr(property) > 0 && cardRentToValue(rentToValue)}
      </div>

      {/* ══ Operating Metrics & Gain ══════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <p className="stat-section-label" style={{ margin: 0 }}>Operating Metrics &amp; Gain</p>
        <WindowPicker value={avgWindow} onChange={setAvgWindow} />
      </div>

      {/* Row 1: Cash flow & gain */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {cardAvgIncome(avg.income, 0, avgWindow)}
        {cardAvgCashFlow(avg.cashflow, expMonthlyCF ?? 0, avgWindow)}
        {cardMonthlyGain(monthlyGain, expMonthlyGain ?? 0)}
        {cardPaybackPeriod(paybackPeriod as unknown as Record<string, unknown>, expPayback, pbOutstanding, ti(property), te(property))}
        {cardBreakEven(breakEven as unknown as Record<string, unknown>, expBreakEven)}
      </div>

      {/* Row 2: NOI, expenses, cap rate */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {cardAvgNOI(avg.noi, expected?.monthlyNOI ?? 0, avgWindow)}
        {cardAvgExpenses(avg.expenses, expected?.monthlyExpenses ?? 0, avgWindow, mr(property))}
        {cardCapRate(capRate, expected?.capRate ?? null, avgWindow)}
      </div>

      {/* Row 3: OER, IRR, vacancy, maint */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardOER(avg.income > 0 ? oer : null, expected?.oer ?? null, avgWindow)}
        {cardIRR(irr, !!property.poss_date)}
        {cardEconVacancy(econVacancy)}
        {cardMaintCapEx(maintCapexRatio)}
      </div>

      {/* ══ Income & Expenses ═════════════════════════════════════════════════ */}
      <FinancialSummaryPanel
        properties={[property]}
        allIncome={taggedIncome as any}
        allExpenses={taggedExpenses as any}
        allEvents={events.reduce((acc: Record<string, unknown>, e) => { acc[String(e.property_id)] = e; return acc }, {})}
        scope="property"
      />

      {/* ══ Appreciation ══════════════════════════════════════════════════════ */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardTotalAppreciation(appr, apprPct, pp(property))}
        {cardYearlyAppreciation(yearlyAppr ?? 0, expYearlyAppr, expApprPct, yearlyApprPct)}
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
              formatter={(v: number) => [`$${v.toLocaleString()}`, '']}
              labelFormatter={(l: string) => l}
            />
            <Bar dataKey="value" radius={[0,4,4,0]}>
              {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              <LabelList dataKey="value" position="right"
                formatter={(v: number) => `$${v.toLocaleString()}`}
                style={{ fill: '#9ca3af', fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Loan Balance Timeline */}
      {loanTimeline.length >= 2 && (
        <div className="chart-container">
          <div className="chart-header"><h2 className="chart-title">Loan Balance Over Time</h2></div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={loanTimeline} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(0,7)} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={DETAIL_TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Balance']} />
              <Line type="monotone" dataKey="Balance" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Rent Growth */}
      {rentTimeline.length >= 2 && (
        <div className="chart-container">
          <div className="chart-header"><h2 className="chart-title">Rent History</h2></div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={rentTimeline} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(0,7)} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
              <Tooltip contentStyle={DETAIL_TOOLTIP_STYLE} formatter={v => [`$${Number(v).toLocaleString()}/mo`, 'Rent']} />
              <Line type="stepAfter" dataKey="Rent" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Amortization Schedule */}
      {amortSchedule.length > 0 && (
        <div className="table-container" style={{ marginBottom: '1rem' }}>
          <div className="table-header" onClick={() => setAmortOpen(o => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
            <div className="table-title">🏦 Amortization Schedule</div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>{amortOpen ? '▲ collapse' : '▼ expand'}</span>
          </div>
          {amortOpen && (
            <div className="table-scroll-wrap">
              <table>
                <thead><tr>
                  <th className="col-shrink">Date</th>
                  <th className="col-shrink">Payment</th>
                  <th className="col-shrink">Interest</th>
                  <th className="col-shrink">Principal</th>
                  <th className="col-shrink">Balance After</th>
                </tr></thead>
                <tbody>
                  {[...amortSchedule].reverse().map((r, i) => (
                    <tr key={i}>
                      <td className="col-shrink" style={{ fontSize: '0.82rem' }}>{r.expense_date}</td>
                      <td className="col-shrink">${r.amount.toLocaleString()}</td>
                      <td className="col-shrink text-danger">${Math.round(r.interest).toLocaleString()}</td>
                      <td className="col-shrink text-success">${Math.round(r.principal).toLocaleString()}</td>
                      <td className="col-shrink">${Math.round(r.balance_after).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
                  Lease: {fmtDate(t.lease_start ?? null)} — {t.lease_end ? fmtDate(t.lease_end ?? null) : 'Ongoing'}
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
                  <span style={{ color: 'var(--text-tertiary)', marginLeft: '0.5rem' }}>{fmtDate(e.expense_date ?? null)}</span>
                </div>
                <span className="text-danger" style={{ fontWeight: 600, marginLeft: '0.5rem', flexShrink: 0 }}>
                  ${(e.amount ?? 0).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      {/* Documents */}
      <div className="detail-panel" style={{ marginTop: '1.5rem' }}>
        <div className="detail-panel-title">
          <span>📎 Documents</span>
          <button className="btn btn-secondary" onClick={() => onJump('documents', property.id)}>View All</button>
        </div>
        {documents.length === 0 ? (
          <div className="tenant-vacant">No documents attached</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {documents.slice(0, 8).map(d => (
              <a key={d.id} href={getDocumentUrl(d.id)} download={d.original_filename}
                 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.6rem', background: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.8rem', maxWidth: '200px' }}>
                <span style={{ color: 'var(--accent-secondary)', flexShrink: 0 }}>📄</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.original_filename}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', flexShrink: 0 }}>{d.size_bytes < 1024 ? d.size_bytes + ' B' : d.size_bytes < 1048576 ? (d.size_bytes/1024).toFixed(1) + ' KB' : (d.size_bytes/1048576).toFixed(1) + ' MB'}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

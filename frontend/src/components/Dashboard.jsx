import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import PropertyCard from './PropertyCard.jsx';
import KPICard from './KPICard.jsx';
import { fmt, fp, sn, SectionLabel, WindowPicker, ltvColor, CHART_TOOLTIP_STYLE } from './uiHelpers.jsx';
import FinancialPeriodSection from './FinancialPeriodSection.jsx';
import { API_URL } from '../config.js';
import { avgMonthly, monthsLeftInYear } from '../metrics.js';
import { usePortfolioAggregates } from '../hooks.js';
import usePortfolioMetrics from '../hooks/usePortfolioMetrics.js';
import { cardAvgIncome, cardAvgExpenses, cardAvgCashFlow, cardAvgNOI, cardCapRate, cardOER, cardDSCR, cardICR, cardMonthlyGain, cardNetPosition, cardPaybackPeriod, cardBreakEven, cardTotalAppreciation, cardYearlyAppreciation, cardProjectedYearEnd, cardYearEndBalance } from '../metricDefs.jsx';

export default function Dashboard({ properties, onPropertyClick }) {
  const [allIncome,   setAllIncome]   = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [allEvents,   setAllEvents]   = useState({});   // keyed by property id
  const [avgWindow,   setAvgWindow]   = useState(3);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    if (!properties.length) return;
    setLoading(true);
    Promise.all(
      properties.map(p =>
        fetch(`${API_URL}/income?property_id=${p.id}`).then(r => r.ok ? r.json() : [])
          .then(d => d.map(i => ({ ...i, property_id: p.id })))
      )
    ).then(results => setAllIncome(results.flat())).catch(() => {});
    Promise.all(
      properties.map(p =>
        fetch(`${API_URL}/expenses?property_id=${p.id}`).then(r => r.ok ? r.json() : [])
          .then(d => d.map(e => ({ ...e, property_id: p.id })))
      )
    ).then(results => { setAllExpenses(results.flat()); setLoading(false); })
      .catch(() => setLoading(false));
    // Events are fetched per-property and stored in a map so PropertyCard
    // can call calcEconVacancy with the correct event history.
    Promise.all(
      properties.map(p =>
        fetch(`${API_URL}/events?property_id=${p.id}`).then(r => r.ok ? r.json() : [])
          .then(evs => [p.id, evs])
      )
    ).then(pairs => setAllEvents(Object.fromEntries(pairs))).catch(() => {});
  }, [properties.map(p => p.id).join(',')]);

  const agg = usePortfolioAggregates(properties, allIncome, allExpenses);

  const avg = useMemo(() =>
    avgMonthly(allIncome, allExpenses, avgWindow),
  [allIncome, allExpenses, avgWindow]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const incExpData  = properties.map(p => ({
    name: sn(p.name), Income: p.total_income, Expenses: p.total_expenses,
  }));
  const apprData   = properties.map(p => ({ name: sn(p.name), Appreciation: p.market_price - p.purchase_price }));
  const equityData = properties.map(p => ({ name: sn(p.name), Equity: p.market_price - p.loan_amount, Loan: p.loan_amount }));

  // ── Pre-computed values ───────────────────────────────────────────────────

  // KPI panel
  const ltvColors = ltvColor(agg.loanPct ?? 0);
  const netPos    = agg.sellingProfit;
  const npPct     = agg.balance !== 0 ? (netPos / Math.abs(agg.balance) * 100) : null;

  const ml = monthsLeftInYear();
  const m  = usePortfolioMetrics(properties, avg, agg, ml);

  // Expected expenses for the avg-expenses card
  const expExpensesVal = agg.expNOI != null ? agg.totalExpectedOpEx + avg.mortgage : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Portfolio overview and performance</p>
        </div>
      </div>

      {/* ── Portfolio KPIs ── */}
      <SectionLabel>Portfolio Snapshot</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <KPICard label="Portfolio Value" primary={fmt(agg.market)}
          secondary={agg.appr !== 0 ? (agg.appr >= 0 ? '+' : '') + fmt(agg.appr) + (agg.apprPct !== null ? ' (' + agg.apprPct.toFixed(1) + '%)' : '') : null}
          secondaryCls={agg.appr >= 0 ? 'text-success' : 'text-danger'}
          accentColor="#3b82f6"
          tooltip={`Sum of current market values across all properties.\nTotal appreciation: ${fmt(agg.appr)} (${agg.apprPct !== null ? agg.apprPct.toFixed(1) + '%' : 'n/a'} over purchase price of ${fmt(agg.purchase)}.`} />
        <KPICard label="Total Equity" primary={fmt(agg.equity)}
          primaryCls={agg.equity >= 0 ? 'text-success' : 'text-danger'}
          secondary={agg.equityPct !== null ? fp(agg.equityPct) + ' of value' : null}
          accentColor="#10b981"
          tooltip="Your ownership stake across all properties.\nFormula: Total Market Value − Total Outstanding Loans." />
        <KPICard label="Total Loan" primary={fmt(agg.loan)}
          primaryCls="text-danger"
          secondary={agg.loanPct !== null ? fp(agg.loanPct) + ' LTV' : null}
          secondaryCls={agg.loanPct !== null ? ltvColors.cls : ''}
          accentColor="#ef4444"
          tooltip="Total outstanding mortgage balances across all properties.\nLTV = Total Loans ÷ Portfolio Value." />
        <KPICard label="Occupancy"
          primary={agg.occupancyPct !== null ? fp(agg.occupancyPct) : '—'}
          primaryCls={agg.occupancyPct >= 90 ? 'text-success' : agg.occupancyPct >= 70 ? '' : 'text-danger'}
          secondary={`${agg.occupied} of ${properties.length} properties`}
          accentColor={agg.occupancyPct >= 90 ? '#10b981' : agg.occupancyPct >= 70 ? '#f59e0b' : '#ef4444'}
          tooltip="Share of properties currently occupied (not marked Vacant)." />
        <KPICard label="Operating Profit" primary={fmt(agg.netBalance)}
          primaryCls={agg.netBalance >= 0 ? 'text-success' : 'text-danger'}
          secondary={agg.roi !== null ? fp(agg.roi) + ' ROI' : null}
          secondaryCls={agg.roi !== null && agg.roi >= 0 ? 'text-success' : 'text-danger'}
          accentColor={agg.netBalance >= 0 ? '#10b981' : '#ef4444'}
          tooltip="All-time income minus all operating expenses (excluding equity-building capital).\nROI = Operating Profit ÷ Portfolio Value." />
        <KPICard label="Net Position" primary={fmt(netPos)}
          primaryCls={netPos >= 0 ? 'text-success' : 'text-danger'}
          secondary={npPct !== null ? npPct.toFixed(1) + '% of net spending' : null}
          secondaryCls={npPct !== null ? (npPct >= 0 ? 'text-success' : 'text-danger') : ''}
          accentColor={netPos >= 0 ? '#10b981' : '#ef4444'}
          tooltip={`What you would walk away with after selling all properties and clearing all mortgages today.\nFormula: Portfolio Value + All Income − All Expenses − All Loans.`} />
      </div>

      {/* ── Appreciation ── */}
      <SectionLabel>Appreciation</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardTotalAppreciation(agg.appr, agg.apprPct, agg.purchase)}
        {cardYearlyAppreciation(agg.yearlyAppr, agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr : null, agg.expYearlyApprPct, agg.yearlyApprPct)}
        {cardProjectedYearEnd(agg.projectedYE)}
        {cardYearEndBalance(m.runRate, m.budgeted, ml)}
      </div>

      {/* ── Income & Expenses (all-time) ── */}
      <SectionLabel>Income &amp; Expenses (all-time)</SectionLabel>
      <FinancialPeriodSection
        income={agg.income} expenses={agg.expenses} netExpenses={agg.totalNetExp}
        balance={agg.balance} operatingProfit={agg.netBalance} roi={agg.roi}
        principal={agg.allTimePrin} scope="portfolio" />

      {/* ── YTD ── */}
      <SectionLabel>YTD — trailing 12 months</SectionLabel>
      <FinancialPeriodSection prefix="YTD "
        income={agg.ytdInc} expenses={agg.ytdExp} netExpenses={agg.ytdNetExp}
        balance={agg.ytdBal} operatingProfit={agg.ytdNetBalance}
        principal={agg.ytdPrin} scope="portfolio" />

      {/* ── Monthly Averages & Key Ratios ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        <SectionLabel style={{ margin: 0 }}>Monthly Averages &amp; Key Ratios</SectionLabel>
        <WindowPicker value={avgWindow} onChange={setAvgWindow} />
      </div>

      {/* Row 1 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {cardAvgIncome(avg.income, agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent : null, avgWindow)}
        {cardAvgExpenses(avg.expenses, expExpensesVal, avgWindow, agg.totalMonthlyRent)}
        {cardAvgCashFlow(avg.cashflow, m.expCF, avgWindow)}
        {cardAvgNOI(avg.noi, agg.expNOI, avgWindow)}
      </div>

      {/* Row 2 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {m.capRate !== null && cardCapRate(m.capRate, m.expCap, avgWindow)}
        {m.oer !== null && cardOER(m.oer, m.expOER, avgWindow)}
        {m.dscr !== null && cardDSCR(m.dscr, m.expDSCR, avgWindow)}
        {cardICR(m.icr, m.expICR, avgWindow)}
      </div>

      {/* Row 3: Monthly gain + net position + payback / break-even */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {cardMonthlyGain(m.mg, m.expMG)}
        {cardNetPosition(agg.sellingProfit)}
        {cardPaybackPeriod(m.payback, m.expPPLabel, m.outstanding, agg.income, agg.expenses)}
        {cardBreakEven(m.breakEven, m.expBELabel)}
      </div>

      {/* ── Charts ── */}
      {properties.length > 0 && (<>
        <div className="chart-container">
          <div className="chart-header"><h2 className="chart-title">Income vs Expenses by Property</h2></div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incExpData} barGap={4} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Income"   fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="chart-container" style={{ margin: 0 }}>
            <div className="chart-header"><h2 className="chart-title">Appreciation by Property</h2></div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={apprData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 2" />
                <Bar dataKey="Appreciation" radius={[4,4,0,0]}>
                  {apprData.map((e, i) => <Cell key={i} fill={e.Appreciation >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-container" style={{ margin: 0 }}>
            <div className="chart-header"><h2 className="chart-title">Equity vs Loan by Property</h2></div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={equityData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="Equity" stackId="a" fill="#10b981" radius={[4,4,0,0]} />
                <Bar dataKey="Loan"   stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>)}

      <div className="page-header" style={{ marginTop: '1.5rem' }}>
        <h2 className="chart-title">Recent Properties</h2>
      </div>
      {properties.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏢</div>
          <div className="empty-state-text">No properties yet</div>
        </div>
      ) : (
        <div className="property-grid">
          {properties.slice(0, 6).map(p => (
            <PropertyCard
              key={p.id} property={p}
              avgCashFlow={agg.perPropAvg[p.id]?.cashflow}
              cardAvgNOI={agg.perPropAvg[p.id]?.noi}
              events={allEvents[p.id] ?? []}
              onClick={() => onPropertyClick(p)}
            />
          ))}
        </div>
      )}
    </>
  );
}

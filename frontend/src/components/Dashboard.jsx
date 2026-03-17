import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import PropertyCard from './PropertyCard.jsx';
import KPICard from './KPICard.jsx';
import { fmt, fp, fPct, mc, sn, SectionLabel, WindowPicker, wLabel, ltvColor, fmtPeriod, CHART_TOOLTIP_STYLE } from './uiHelpers.jsx';
import FinancialPeriodSection from './FinancialPeriodSection.jsx';
import { API_URL } from '../config.js';
import { avgMonthly, expGap, monthsLeftInYear } from '../metrics.js';
import { usePortfolioAggregates } from '../hooks.js';
import usePortfolioMetrics from '../hooks/usePortfolioMetrics.js';

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
  const incExpData = properties.map(p => ({
    name: sn(p.name), Income: p.total_income, Expenses: p.total_expenses,
    Net: p.total_income - p.total_expenses,
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
        {mc({ label: 'Total Appreciation', primary: fmt(agg.appr),
          primaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.apprPct !== null && agg.purchase > 0 ? agg.apprPct.toFixed(1) + '% from ' + fmt(agg.purchase) : null,
          secondaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total unrealised gain: current Market Value minus original Purchase Price across all properties.' })}
        {mc({ label: 'Yearly Appreciation',
          primary: fmt(agg.yearlyAppr),
          primaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.yearlyApprPct !== null ? fp(agg.yearlyApprPct) + ' per year' : null,
          secondaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          ...expGap(agg.yearlyAppr, agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr : null,
            v => v >= 0 ? 'text-success' : 'text-danger',
            v => fmt(v) + (agg.expYearlyApprPct ? ' (' + fp(agg.expYearlyApprPct) + '/yr)' : ''),
            'Exp:', true, 500),
          tooltip: 'Annualised appreciation per property, summed.\nExp = sum of (purchase price × expected appreciation %) across properties where that is set.' })}
        {mc({ label: 'Projected Year-End Value', primary: fmt(agg.projectedYE),
          tertiary: 'At current appreciation rate',
          tooltip: 'Current market value plus the remaining fraction of the year times the current annual appreciation rate.' })}
        {mc({ label: 'Year-End Balance',
          primary: fmt(m.runRate),
          primaryCls: m.runRate >= 0 ? 'text-success' : 'text-danger',
          ...(m.budgeted != null ? expGap(m.runRate, m.budgeted, v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Budget:', true, 1000) : {}),
          tooltip: `Projected Net Position at December 31st.\nRun-rate: current Net Position + avg monthly cash flow × ${ml} months + avg monthly appreciation × ${ml} months.\nBudget: same but using expected monthly cash flow and appreciation.` })}
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
        {mc({ label: `Avg Income (${avgWindow}M)`,
          primary: fmt(avg.income), primaryCls: 'text-success',
          ...expGap(avg.income, agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent : null, () => 'text-success', fmt, 'Exp:', true, 50),
          tooltip: `Average monthly income over the last ${avgWindow} complete months.\nExp = sum of all current monthly rents at 100% occupancy.` })}
        {mc({ label: `Avg Expenses (${avgWindow}M)`,
          primary: fmt(avg.expenses), primaryCls: 'text-danger',
          ...expGap(avg.expenses, expExpensesVal,
            v => v < agg.totalMonthlyRent * 0.65 ? '' : v < agg.totalMonthlyRent * 0.85 ? 'text-warning' : 'text-danger',
            fmt, 'Exp:', false, 50),
          tooltip: `Average monthly expenses over the last ${avgWindow} complete months.\nExp = budgeted op-ex (${agg.propertiesWithExpected} of ${properties.length} props) + avg mortgage.` })}
        {mc({ label: `Avg Cash Flow (${avgWindow}M)`,
          primary: fmt(avg.cashflow),
          primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
          ...expGap(avg.cashflow, m.expCF, v => v >= 0 ? 'text-success' : 'text-danger', fmt, 'Exp:', true, 50),
          tooltip: `Average monthly (Income − Expenses) over the last ${avgWindow} complete months.\nExp = budgeted NOI minus average mortgage payment.` })}
        {mc({ label: `Avg NOI (${avgWindow}M)`,
          primary: fmt(avg.noi),
          primaryCls: avg.noi >= 0 ? 'text-success' : 'text-danger',
          ...expGap(avg.noi, agg.expNOI, v => v >= 0 ? 'text-success' : 'text-danger', fmt, 'Exp:', true, 50),
          tooltip: 'Net Operating Income: avg monthly income minus all op-ex, excluding mortgage and principal.\nExp = total monthly rent minus budgeted operating expenses.' })}
      </div>

      {/* Row 2 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {m.capRate !== null && mc({ label: `Cap Rate (${avgWindow}M)`,
          primary: fPct(m.capRate),
          primaryCls: m.capRate > 0.07 ? 'text-success' : m.capRate > 0.04 ? '' : 'text-danger',
          ...expGap(m.capRate, m.expCap, v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger', fPct, 'Exp:', true, 0.005),
          tertiary: m.capRate > 0.07 ? 'Strong yield' : m.capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
          tooltip: 'Portfolio Cap Rate = annualised NOI ÷ total market value.\n> 7%: strong. 4–7%: moderate. < 4%: weak.' })}
        {m.oer !== null && mc({ label: `OER (${avgWindow}M)`,
          primary: fPct(m.oer),
          primaryCls: m.oer < 0.35 ? 'text-success' : m.oer < 0.50 ? '' : 'text-danger',
          ...expGap(m.oer, m.expOER, v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false, 0.02),
          tertiary: m.oer < 0.35 ? 'Efficient' : m.oer < 0.50 ? 'Normal' : 'High costs',
          tooltip: 'Operating Expense Ratio = avg op-ex ÷ avg gross income.\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.' })}
        {m.dscr !== null && mc({ label: `DSCR (${avgWindow}M)`,
          primary: m.dscr.toFixed(2) + 'x',
          primaryCls: m.dscr >= 1.25 ? 'text-success' : m.dscr >= 1.0 ? 'text-warning' : 'text-danger',
          ...expGap(m.dscr, m.expDSCR, v => v >= 1.25 ? 'text-success' : v >= 1.0 ? 'text-warning' : 'text-danger', v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
          tertiary: m.dscr >= 1.25 ? 'Healthy coverage' : m.dscr >= 1.0 ? 'Marginal' : 'Below 1x',
          tooltip: 'Debt Service Coverage Ratio = avg monthly NOI ÷ avg mortgage payment.' })}
        {m.icr !== null && mc({ label: `ICR (${avgWindow}M)`,
          primary: m.icr.toFixed(2) + 'x',
          primaryCls: m.icr >= 2 ? 'text-success' : m.icr >= 1.25 ? '' : 'text-danger',
          ...expGap(m.icr, m.expICR, v => v >= 2 ? 'text-success' : v >= 1.25 ? '' : 'text-danger', v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
          tertiary: m.icr >= 2 ? 'Strong' : m.icr >= 1.25 ? 'Adequate' : 'Weak',
          tooltip: 'Interest Coverage Ratio = annualised NOI ÷ total annual interest (loan \u00d7 rate) across all properties.\n\u2265 2.0x: strong. 1.25\u20132.0x: adequate. < 1.25x: tight.\nExp uses budgeted operating costs.' })}
      </div>

      {/* Row 3: Monthly gain + net position + payback / break-even */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {mc({ label: 'Monthly Gain', primary: fmt(m.mg),
          primaryCls: m.mg >= 0 ? 'text-success' : 'text-danger',
          ...expGap(m.mg, m.expMG, v => v >= 0 ? 'text-success' : 'text-danger', fmt, 'Exp:', true, 50),
          tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly ÷ 12).\nExp uses budgeted operating costs + expected appreciation %.' })}
        {mc({ label: 'Net Position', primary: fmt(agg.sellingProfit),
          primaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value + Total Income − Total Expenses − Loans.' })}
        {mc({ label: 'Payback Period', ...m.payback,
          secondary: m.expPPLabel, secondaryCls: m.expPPLabel ? 'text-success' : '',
          tooltip: `Time until all recorded expenses are recovered by cumulative cash flow.\nNumerator = Total Expenses − Total Income (${fmt(agg.expenses)} − ${fmt(agg.income)}).\nExp uses budgeted cash flow.` })}
        {mc({ label: 'Break-even', ...m.breakEven,
          secondary: m.expBELabel, secondaryCls: m.expBELabel ? 'text-success' : '',
          tooltip: 'Time until Net Position reaches zero or better.\nUses monthly gain (cash flow + appreciation) to close the gap.\nExp uses budgeted monthly gain.' })}
      </div>

      {/* ── Charts ── */}
      {properties.length > 0 && (<>
        <div className="chart-container">
          <div className="chart-header"><h2 className="chart-title">Income vs Expenses by Property</h2></div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={incExpData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Income"   fill="#10b981" name="Income" />
              <Bar dataKey="Expenses" fill="#ef4444" name="Expenses" />
              <Bar dataKey="Net"      fill="#3b82f6" name="Net" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="chart-container" style={{ margin: 0 }}>
            <div className="chart-header"><h2 className="chart-title">Appreciation by Property</h2></div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={apprData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
                <Bar dataKey="Appreciation">
                  {apprData.map((e, i) => <Cell key={i} fill={e.Appreciation >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-container" style={{ margin: 0 }}>
            <div className="chart-header"><h2 className="chart-title">Equity vs Loan by Property</h2></div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={equityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="Equity" stackId="a" fill="#10b981" />
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
              avgNOI={agg.perPropAvg[p.id]?.noi}
              events={allEvents[p.id] ?? []}
              onClick={() => onPropertyClick(p)}
            />
          ))}
        </div>
      )}
    </>
  );
}

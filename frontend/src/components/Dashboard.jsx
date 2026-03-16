import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import PropertyCard from './PropertyCard.jsx';
import MetricCard from './MetricCard.jsx';
import KPICard from './KPICard.jsx';
import { fmt, fp, fPct, mc, SectionLabel, WindowPicker, wLabel, ltvColor, CHART_TOOLTIP_STYLE } from './uiHelpers.jsx';
import FinancialPeriodSection from './FinancialPeriodSection.jsx';
import { API_URL } from '../config.js';
import { avgMonthly, calcExpected, expGap, monthsLeftInYear, yearFracRemaining } from '../metrics.js';
import { usePortfolioAggregates } from '../hooks.js';

const sn = s => s.length > 14 ? s.slice(0, 14) + '\u2026' : s;

export default function Dashboard({ properties, onPropertyClick }) {
  const [allIncome,   setAllIncome]   = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
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
  }, [properties.map(p => p.id).join(',')]);

  const agg = usePortfolioAggregates(properties, allIncome, allExpenses);

  const avg = useMemo(() =>
    avgMonthly(allIncome, allExpenses, avgWindow),
  [allIncome, allExpenses, avgWindow]);

  const perPropAvg = useMemo(() => {
    const map = {};
    for (const p of properties) {
      const inc = allIncome.filter(r   => r.property_id === p.id);
      const exp = allExpenses.filter(r => r.property_id === p.id);
      map[p.id] = avgMonthly(inc, exp, 3);
    }
    return map;
  }, [properties, allIncome, allExpenses]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const incExpData = properties.map(p => ({
    name: sn(p.name), Income: p.total_income, Expenses: p.total_expenses,
    Net: p.total_income - p.total_expenses,
  }));
  const apprData   = properties.map(p => ({ name: sn(p.name), Appreciation: p.market_price - p.purchase_price }));
  const equityData = properties.map(p => ({ name: sn(p.name), Equity: p.market_price - p.loan_amount, Loan: p.loan_amount }));

  // ── Pre-computed values (replaces inline IIFEs) ───────────────────────────

  // Portfolio KPIs
  const apprCls   = agg.appr >= 0 ? 'text-success' : 'text-danger';
  const apprSign  = agg.appr >= 0 ? '+' : '';
  const ltvColors = ltvColor(agg.loanPct ?? 0);
  const netPos    = agg.sellingProfit;
  const npPct     = agg.balance !== 0 ? (netPos / Math.abs(agg.balance) * 100) : null;

  // Yearly appreciation expected
  const expYearlyAppr = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr : null;

  // Year-End Balance
  const ml       = monthsLeftInYear();
  const runRate  = agg.sellingProfit + avg.cashflow * ml + agg.monthlyApprAgg * ml;
  const expOpEx  = agg.totalExpectedOpEx;
  const expNOI   = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
  const expCF    = expNOI != null ? expNOI - avg.mortgage : null;
  const expApprMo = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr / 12 : null;
  const expMG    = expCF != null ? expCF + (expApprMo ?? 0) : null;
  const budgeted = expMG != null ? agg.sellingProfit + expMG * ml : null;

  // Monthly Averages rows
  const expIncomeExp  = agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent : null;
  const expExpensesVal = expOpEx > 0 ? expOpEx + avg.mortgage : null;
  const expCashFlow   = expNOI != null ? expNOI - avg.mortgage : null;

  // Row 2 ratios
  const annualNOI = avg.noi * 12;
  const capRate   = agg.market > 0 ? annualNOI / agg.market : null;
  const expCap    = expOpEx > 0 && agg.market > 0 ? (agg.totalMonthlyRent - expOpEx) * 12 / agg.market : null;
  const oer       = avg.income > 0 ? avg.noiExpenses / avg.income : null;
  const expOER    = expOpEx > 0 && agg.totalMonthlyRent > 0 ? expOpEx / agg.totalMonthlyRent : null;
  const dscr      = avg.mortgage > 0 ? avg.noi / avg.mortgage : null;
  const expDSCR   = expNOI != null && avg.mortgage > 0 ? expNOI / avg.mortgage : null;

  // Monthly Gain
  const mg = avg.cashflow + agg.monthlyApprAgg;

  // Payback: (total expenses − total income) ÷ avg cash flow
  const outstanding  = agg.expenses - agg.income;
  const ppMonths     = avg.cashflow > 0 ? (outstanding <= 0 ? 0 : outstanding / avg.cashflow) : null;
  const ppLabel      = ppMonths === null ? (avg.cashflow <= 0 ? '∞ (no CF)' : '—')
    : ppMonths === 0 ? 'Recovered'
    : ppMonths < 12 ? `${Math.round(ppMonths)} mo` : `${(ppMonths / 12).toFixed(1)} yr`;
  const ppCls = ppMonths === null ? 'text-danger'
    : ppMonths === 0 ? 'text-success'
    : ppMonths < 36 ? 'text-success' : ppMonths < 84 ? '' : 'text-danger';
  const totalExpCF = properties.reduce((s, p) => {
    const e = calcExpected(p, perPropAvg[p.id]?.mortgage ?? 0);
    return e ? s + e.monthlyCF : s;
  }, 0);
  const expPPMonths  = totalExpCF > 0 ? (outstanding <= 0 ? 0 : outstanding / totalExpCF) : null;
  const expPPLabel   = expPPMonths != null
    ? (expPPMonths === 0 ? 'Exp: Recovered'
       : expPPMonths < 12 ? `Exp: ${Math.round(expPPMonths)} mo`
       : `Exp: ${(expPPMonths / 12).toFixed(1)} yr`)
    : null;

  // Break-even: −net position ÷ monthly gain
  const beTotalExpCF = totalExpCF; // same calc
  const beExpMG      = beTotalExpCF > 0 ? beTotalExpCF + (expApprMo ?? 0) : null;
  let beLabel, beCls;
  if (netPos >= 0) { beLabel = 'Reached'; beCls = 'text-success'; }
  else if (mg <= 0) { beLabel = '∞ (no growth)'; beCls = 'text-danger'; }
  else {
    const mo = -netPos / mg;
    beLabel = mo < 12 ? `${Math.round(mo)} mo` : `${(mo / 12).toFixed(1)} yr`;
    beCls   = mo < 36 ? 'text-success' : mo < 84 ? '' : 'text-danger';
  }
  const expBE = beExpMG != null && beExpMG > 0 && netPos < 0
    ? (() => { const mo = -netPos / beExpMG; return mo < 12 ? `Exp: ${Math.round(mo)} mo` : `Exp: ${(mo / 12).toFixed(1)} yr`; })()
    : netPos >= 0 ? 'Exp: Reached' : null;

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
          secondary={agg.appr !== 0 ? apprSign + fmt(agg.appr) + (agg.apprPct !== null ? ' (' + agg.apprPct.toFixed(1) + '%)' : '') : null}
          secondaryCls={apprCls}
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
          tooltip="Total outstanding mortgage balances across all properties.\nLTV = Total Loans ÷ Portfolio Value.\nBelow 65%: conservative leverage. 65–80%: normal. Above 80%: high risk." />

        <KPICard label="Occupancy"
          primary={agg.occupancyPct !== null ? fp(agg.occupancyPct) : '—'}
          primaryCls={agg.occupancyPct !== null && agg.occupancyPct >= 90 ? 'text-success' : agg.occupancyPct >= 70 ? '' : 'text-danger'}
          secondary={`${agg.occupied} of ${properties.length} properties`}
          accentColor={agg.occupancyPct >= 90 ? '#10b981' : agg.occupancyPct >= 70 ? '#f59e0b' : '#ef4444'}
          tooltip="Share of properties currently occupied (not marked Vacant).\nTarget 90%+ for healthy cash flow." />

        <KPICard label="Operating Profit" primary={fmt(agg.netBalance)}
          primaryCls={agg.netBalance >= 0 ? 'text-success' : 'text-danger'}
          secondary={agg.roi !== null ? fp(agg.roi) + ' ROI' : null}
          secondaryCls={agg.roi !== null && agg.roi >= 0 ? 'text-success' : 'text-danger'}
          accentColor={agg.netBalance >= 0 ? '#10b981' : '#ef4444'}
          tooltip="All-time income minus all operating expenses (excluding equity-building capital like down payments and principal).\nROI = Operating Profit ÷ Portfolio Value." />

        <KPICard label="Net Position" primary={fmt(netPos)}
          primaryCls={netPos >= 0 ? 'text-success' : 'text-danger'}
          secondary={npPct !== null ? npPct.toFixed(1) + '% of net spending' : null}
          secondaryCls={npPct !== null ? (npPct >= 0 ? 'text-success' : 'text-danger') : ''}
          accentColor={netPos >= 0 ? '#10b981' : '#ef4444'}
          tooltip={`What you would walk away with after selling all properties and clearing all mortgages today.\nFormula: Portfolio Value + All Income − All Expenses − All Loans.\n${npPct !== null ? `% = Net Position ÷ |all-time spending balance|.` : ''}`} />
      </div>

      {/* ── Appreciation ── */}
      <SectionLabel>Appreciation</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({
          label: 'Total Appreciation', primary: fmt(agg.appr),
          primaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.apprPct !== null && agg.purchase > 0
            ? agg.apprPct.toFixed(1) + '% from ' + fmt(agg.purchase) : null,
          secondaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total unrealised gain: current Market Value minus original Purchase Price across all properties.',
        })}
        {mc({
          label: 'Yearly Appreciation',
          primary: fmt(agg.yearlyAppr),
          primaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.yearlyApprPct !== null ? fp(agg.yearlyApprPct) + ' per year' : null,
          secondaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          ...expGap(agg.yearlyAppr, expYearlyAppr,
            v => v >= 0 ? 'text-success' : 'text-danger',
            v => fmt(v) + (agg.expYearlyApprPct ? ' (' + fp(agg.expYearlyApprPct) + '/yr)' : ''),
            'Exp:', true, 500),
          tooltip: 'Annualised appreciation per property, summed.\nExp = sum of (purchase price × expected appreciation %) across properties where that is set.',
        })}
        {mc({
          label: 'Projected Year-End Value', primary: fmt(agg.projectedYE),
          tertiary: 'At current appreciation rate',
          tooltip: 'Current market value plus the remaining fraction of the year times the current annual appreciation rate.',
        })}
        {mc({
          label: 'Year-End Balance',
          primary: fmt(runRate),
          primaryCls: runRate >= 0 ? 'text-success' : 'text-danger',
          ...(budgeted != null ? expGap(runRate, budgeted,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Budget:', true, 1000) : {}),
          tooltip: `Projected Net Position at December 31st.\n\nRun-rate: current Net Position + avg monthly cash flow × ${ml} months left + avg monthly appreciation × ${ml} months.\nBudget: same but using expected (budgeted) monthly cash flow and appreciation.`,
        })}
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

      {/* Row 1: Core monthly metrics */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {mc({
          label: `Avg Income (${avgWindow}M)`,
          primary: fmt(avg.income), primaryCls: 'text-success',
          ...expGap(avg.income, expIncomeExp, () => 'text-success', v => fmt(v), 'Exp:', true, 50),
          tooltip: `Average monthly income over the last ${avgWindow} complete months.\nExp = sum of all current monthly rents at 100% occupancy.`,
        })}
        {mc({
          label: `Avg Expenses (${avgWindow}M)`,
          primary: fmt(avg.expenses), primaryCls: 'text-danger',
          ...expGap(avg.expenses, expExpensesVal,
            v => v < agg.totalMonthlyRent * 0.65 ? '' : v < agg.totalMonthlyRent * 0.85 ? 'text-warning' : 'text-danger',
            v => fmt(v), 'Exp:', false, 50),
          tooltip: `Average monthly expenses over the last ${avgWindow} complete months.\nExp = budgeted op-ex (${agg.propertiesWithExpected} of ${properties.length} props) + avg mortgage.`,
        })}
        {mc({
          label: `Avg Cash Flow (${avgWindow}M)`,
          primary: fmt(avg.cashflow),
          primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
          ...expGap(avg.cashflow, expCashFlow,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
          tooltip: `Average monthly (Income − Expenses) over the last ${avgWindow} complete months.\nExp = budgeted NOI minus average mortgage payment.`,
        })}
        {mc({
          label: `Avg NOI (${avgWindow}M)`,
          primary: fmt(avg.noi),
          primaryCls: avg.noi >= 0 ? 'text-success' : 'text-danger',
          ...expGap(avg.noi, expNOI,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
          tooltip: 'Net Operating Income: avg monthly income minus all op-ex, excluding mortgage and principal.\nExp = total monthly rent minus budgeted operating expenses at full occupancy.',
        })}
      </div>

      {/* Row 2: Key investment ratios */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {capRate !== null && mc({
          label: `Cap Rate (${avgWindow}M)`,
          primary: fPct(capRate),
          primaryCls: capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger',
          ...expGap(capRate, expCap,
            v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger', fPct, 'Exp:', true, 0.005),
          tertiary: capRate > 0.07 ? 'Strong yield' : capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
          tooltip: `Portfolio Cap Rate = annualised NOI ÷ total market value.\n> 7%: strong. 4–7%: moderate. < 4%: weak.`,
        })}
        {oer !== null && mc({
          label: `OER (${avgWindow}M)`,
          primary: fPct(oer),
          primaryCls: oer < 0.35 ? 'text-success' : oer < 0.50 ? '' : 'text-danger',
          ...expGap(oer, expOER,
            v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false, 0.02),
          tertiary: oer < 0.35 ? 'Efficient' : oer < 0.50 ? 'Normal' : 'High costs',
          tooltip: 'Operating Expense Ratio = avg op-ex ÷ avg gross income.\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.',
        })}
        {dscr !== null && mc({
          label: `DSCR (${avgWindow}M)`,
          primary: dscr.toFixed(2) + 'x',
          primaryCls: dscr >= 1.25 ? 'text-success' : dscr >= 1.0 ? 'text-warning' : 'text-danger',
          ...expGap(dscr, expDSCR,
            v => v >= 1.25 ? 'text-success' : v >= 1.0 ? 'text-warning' : 'text-danger',
            v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
          tertiary: dscr >= 1.25 ? 'Healthy coverage' : dscr >= 1.0 ? 'Marginal' : 'Below 1x',
          tooltip: 'Debt Service Coverage Ratio = avg monthly NOI ÷ avg mortgage payment.\n≥ 1.25x: healthy. 1.0–1.25x: marginal. < 1.0x: income doesn\'t cover the mortgage.',
        })}
      </div>

      {/* Row 3: Monthly gain + net position + payback / break-even */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {mc({
          label: 'Monthly Gain', primary: fmt(mg),
          primaryCls: mg >= 0 ? 'text-success' : 'text-danger',
          ...expGap(mg, expMG,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
          tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly ÷ 12). Combines income and value growth in one number.\nExp uses budgeted operating costs + expected appreciation %.',
        })}
        {mc({
          label: 'Net Position', primary: fmt(agg.sellingProfit),
          primaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value + Total Income − Total Expenses − Loans. Net proceeds if you sold everything today and cleared all mortgages.',
        })}
        {mc({
          label: 'Payback Period', primary: ppLabel, primaryCls: ppCls,
          secondary: expPPLabel, secondaryCls: expPPLabel ? 'text-success' : '',
          tooltip: `Time until all recorded expenses are recovered by cumulative cash flow.\nNumerator = Total Expenses − Total Income (${fmt(agg.expenses)} − ${fmt(agg.income)}).\nExp uses budgeted cash flow.`,
        })}
        {mc({
          label: 'Break-even', primary: beLabel, primaryCls: beCls,
          secondary: expBE, secondaryCls: expBE ? 'text-success' : '',
          tooltip: 'Time until Net Position (Market Value + Income − Expenses − Loans) reaches zero or better.\nUses monthly gain (cash flow + appreciation) to close the gap.\nExp uses budgeted monthly gain.',
        })}
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
              avgCashFlow={perPropAvg[p.id]?.cashflow}
              avgNOI={perPropAvg[p.id]?.noi}
              ytdIncome={agg.ytdIncomeByProp[p.id]}
              onClick={() => onPropertyClick(p)}
            />
          ))}
        </div>
      )}
    </>
  );
}

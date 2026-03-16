import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import PropertyCard from './PropertyCard.jsx';
import MetricCard from './MetricCard.jsx';
import KPICard from './KPICard.jsx';
import { fmt, fmtM, fp, fPct, mc, SectionLabel, WindowPicker, WINDOW_OPTIONS, wLabel, ltvColor } from './uiHelpers.jsx';
import FinancialPeriodSection from './FinancialPeriodSection.jsx';
import { API_URL, calcMetrics, avgMonthly, yearsHeld, principalInRange } from '../config.js';
import { calcExpected, expGap, monthsLeftInYear, yearFracRemaining } from '../metrics.js';

const TT   = { background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' };
const sn   = s => s.length > 14 ? s.slice(0, 14) + '\u2026' : s;




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

  const agg = useMemo(() => {
    const market    = properties.reduce((s, p) => s + p.market_price,   0);
    const purchase  = properties.reduce((s, p) => s + p.purchase_price, 0);
    const loan      = properties.reduce((s, p) => s + p.loan_amount,    0);
    const income    = properties.reduce((s, p) => s + p.total_income,   0);
    const expenses  = properties.reduce((s, p) => s + p.total_expenses, 0);
    const equity    = market - loan;
    const equityPct = market > 0 ? equity / market * 100 : null;
    const loanPct   = market > 0 ? loan   / market * 100 : null;
    const appr      = market - purchase;
    const apprPct   = purchase > 0 ? appr / purchase * 100 : null;

    const yearlyAppr = properties.reduce((s, p) => {
      const yrs = yearsHeld(p);
      return yrs ? s + (p.market_price - p.purchase_price) / yrs : s;
    }, 0);
    const yearlyApprPct = purchase > 0 ? yearlyAppr / purchase * 100 : null;
    const monthlyApprAgg = yearlyAppr / 12;

    const now = new Date();
    const yearFrac = (now - new Date(now.getFullYear(), 0, 1)) / (365.25 * 86400000);
    const projectedYE = market + yearlyAppr * (1 - yearFrac);

    const totalNetExp  = properties.reduce((s, p) =>
      s + (p.total_expenses - (p.purchase_price - p.loan_amount)), 0);
    const netBalance   = income - totalNetExp;
    const balance      = income - expenses;
    const roi          = market > 0 ? netBalance / market * 100 : null;
    const sellingProfit = properties.reduce((s, p) =>
      s + p.market_price + p.total_income - p.total_expenses - p.loan_amount, 0);

    const ytdEnd   = new Date();
    const ytdStart = new Date(ytdEnd); ytdStart.setFullYear(ytdStart.getFullYear() - 1);
    const inYTD = (d) => {
      if (!d) return false;
      const [y, m, day] = d.split('-').map(Number);
      const dt = new Date(y, m - 1, day);
      return dt >= ytdStart && dt <= ytdEnd;
    };
    const allTimePrin = properties.reduce((sum, p) => {
      const pe = allExpenses.filter(r => r.property_id === p.id);
      return sum + principalInRange(pe, p.loan_amount, p.mortgage_rate || 0, new Date(0), new Date());
    }, 0);

    const ytdInc  = allIncome.filter(r   => inYTD(r.income_date)).reduce((s, r) => s + r.amount, 0);
    const ytdExp  = allExpenses.filter(r => inYTD(r.expense_date)).reduce((s, r) => s + r.amount, 0);
    const ytdBal  = ytdInc - ytdExp;
    const ytdPrin = properties.reduce((sum, p) => {
      const pe = allExpenses.filter(r => r.property_id === p.id);
      return sum + principalInRange(pe, p.loan_amount, p.mortgage_rate || 0, ytdStart, ytdEnd);
    }, 0);
    const ytdNetExp    = ytdExp  - ytdPrin;
    const ytdNetBalance = ytdInc - ytdNetExp;

    const occupied     = properties.filter(p => p.status !== 'Vacant').length;
    const occupancyPct = properties.length > 0 ? occupied / properties.length * 100 : null;

    const ytdIncomeByProp = {};
    properties.forEach(p => {
      ytdIncomeByProp[p.id] = allIncome
        .filter(r => r.property_id === p.id && inYTD(r.income_date))
        .reduce((s, r) => s + r.amount, 0);
    });

    const totalMonthlyRent = properties.reduce((s, p) => s + (p.monthly_rent || 0), 0);
    const totalExpectedOpEx = properties.reduce((s, p) => {
      const v = (p.expected_condo_fees || 0) + (p.expected_insurance || 0) +
                (p.expected_utilities || 0) + (p.expected_misc_expenses || 0) +
                (p.annual_property_tax || 0) / 12;
      return v > 0 ? s + v : s;
    }, 0);
    const propertiesWithExpected = properties.filter(p =>
      (p.expected_condo_fees || 0) + (p.expected_insurance || 0) + (p.expected_utilities || 0) +
      (p.expected_misc_expenses || 0) + (p.annual_property_tax || 0) > 0
    ).length;
    const totalExpectedYearlyAppr = properties.reduce((s, p) =>
      p.expected_appreciation_pct > 0 ? s + p.purchase_price * p.expected_appreciation_pct / 100 : s, 0);
    const expYearlyApprPct = purchase > 0 && totalExpectedYearlyAppr > 0
      ? totalExpectedYearlyAppr / purchase * 100 : null;

    return {
      market, purchase, loan, income, expenses, equity, equityPct, loanPct,
      appr, apprPct, yearlyAppr, yearlyApprPct, monthlyApprAgg, projectedYE,
      totalNetExp, netBalance, balance, roi, sellingProfit,
      allTimePrin,
      ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdNetBalance,
      occupied, occupancyPct, ytdIncomeByProp, totalMonthlyRent,
      totalExpectedOpEx, propertiesWithExpected, totalExpectedYearlyAppr, expYearlyApprPct,
    };
  }, [properties, allIncome, allExpenses]);

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

  const incExpData = properties.map(p => ({
    name: sn(p.name),
    Income: p.total_income, Expenses: p.total_expenses,
    Net: p.total_income - p.total_expenses,
  }));
  const apprData = properties.map(p => ({
    name: sn(p.name), Appreciation: p.market_price - p.purchase_price,
  }));
  const equityData = properties.map(p => ({
    name: sn(p.name), Equity: p.market_price - p.loan_amount, Loan: p.loan_amount,
  }));


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
        {(() => {
          const apprCls = agg.appr >= 0 ? 'text-success' : 'text-danger';
          const apprSign = agg.appr >= 0 ? '+' : '';
          return <KPICard label="Portfolio Value" primary={fmt(agg.market)}
            secondary={agg.appr !== 0 ? apprSign + fmt(agg.appr) + (agg.apprPct !== null ? ' (' + agg.apprPct.toFixed(1) + '%)' : '') : null}
            secondaryCls={apprCls}
            accentColor="#3b82f6"
            tooltip={`Sum of current market values across all properties.\nTotal appreciation: ${fmt(agg.appr)} (${agg.apprPct !== null ? agg.apprPct.toFixed(1) + '%' : 'n/a'} over purchase price of ${fmt(agg.purchase)}.`} />;
        })()}
        <KPICard label="Total Equity" primary={fmt(agg.equity)}
          primaryCls={agg.equity >= 0 ? 'text-success' : 'text-danger'}
          secondary={agg.equityPct !== null ? fp(agg.equityPct) + ' of value' : null}
          accentColor="#10b981"
          tooltip="Your ownership stake across all properties.\nFormula: Total Market Value − Total Outstanding Loans.\nGrows as properties appreciate and mortgages are paid down." />
        {(() => {
          const ltv = ltvColor(agg.loanPct ?? 0);
          return <KPICard label="Total Loan" primary={fmt(agg.loan)}
            primaryCls="text-danger"
            secondary={agg.loanPct !== null ? fp(agg.loanPct) + ' LTV' : null}
            secondaryCls={agg.loanPct !== null ? ltv.cls : ''}
            accentColor="#ef4444"
            tooltip="Total outstanding mortgage balances across all properties.\nLTV = Total Loans ÷ Portfolio Value.\nBelow 65%: conservative leverage. 65–80%: normal. Above 80%: high risk — may require mortgage insurance." />;
        })()}
        <KPICard label="Occupancy"
          primary={agg.occupancyPct !== null ? fp(agg.occupancyPct) : '—'}
          primaryCls={agg.occupancyPct !== null && agg.occupancyPct >= 90 ? 'text-success' : agg.occupancyPct >= 70 ? '' : 'text-danger'}
          secondary={`${agg.occupied} of ${properties.length} properties`}
          accentColor={agg.occupancyPct >= 90 ? '#10b981' : agg.occupancyPct >= 70 ? '#f59e0b' : '#ef4444'}
          tooltip="Share of properties currently occupied (not marked Vacant).\nTarget 90%+ for healthy cash flow. Each vacant unit reduces income while fixed costs continue." />
        <KPICard label="Operating Profit" primary={fmt(agg.netBalance)}
          primaryCls={agg.netBalance >= 0 ? 'text-success' : 'text-danger'}
          secondary={agg.roi !== null ? fp(agg.roi) + ' ROI' : null}
          secondaryCls={agg.roi !== null && agg.roi >= 0 ? 'text-success' : 'text-danger'}
          accentColor={agg.netBalance >= 0 ? '#10b981' : '#ef4444'}
          tooltip="All-time income minus all operating expenses (excluding equity-building capital like down payments and principal).\nThis is the true profit from running the portfolio, ignoring financing structure.\nROI = Operating Profit ÷ Portfolio Value." />
        {(() => {
          const np = agg.sellingProfit;
          const npPct = agg.balance !== 0 ? (np / Math.abs(agg.balance) * 100) : null;
          return <KPICard label="Net Position" primary={fmt(np)}
            primaryCls={np >= 0 ? 'text-success' : 'text-danger'}
            secondary={npPct !== null ? npPct.toFixed(1) + '% of net spending' : null}
            secondaryCls={npPct !== null ? (npPct >= 0 ? 'text-success' : 'text-danger') : ''}
            accentColor={np >= 0 ? '#10b981' : '#ef4444'}
            tooltip={`What you would walk away with after selling all properties and clearing all mortgages today.\nFormula: Portfolio Value + All Income − All Expenses − All Loans.\n${npPct !== null ? `% = Net Position ÷ |all-time spending balance| (|Income − Expenses|).` : ''}\nPositive = you're ahead overall; negative = still in the hole.`} />;
        })()}
      </div>

      {/* ── Appreciation ── */}
      <SectionLabel>Appreciation</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Appreciation', primary: fmt(agg.appr),
          primaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.apprPct !== null && agg.purchase > 0 ? agg.apprPct.toFixed(1) + '% from ' + fmt(agg.purchase) : null,
          secondaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total unrealised gain: current Market Value minus original Purchase Price across all properties.' })}
        {(() => {
          const actual = agg.yearlyAppr;
          const exp    = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr : null;
          return mc({
            label: 'Yearly Appreciation',
            primary: fmt(actual),
            primaryCls: actual >= 0 ? 'text-success' : 'text-danger',
            secondary: agg.yearlyApprPct !== null ? fp(agg.yearlyApprPct) + ' per year' : null,
            secondaryCls: actual >= 0 ? 'text-success' : 'text-danger',
            ...expGap(actual, exp,
              v => v >= 0 ? 'text-success' : 'text-danger',
              v => fmt(v) + (agg.expYearlyApprPct ? ' (' + fp(agg.expYearlyApprPct) + '/yr)' : ''),
              'Exp:', true, 500),
            tooltip: 'Annualised appreciation per property, summed. Computed as (Market − Purchase) ÷ years since possession.\nExp = sum of (purchase price × expected appreciation %) across properties where that is set.' });
        })()}
        {mc({ label: 'Projected Year-End Value', primary: fmt(agg.projectedYE),
          tertiary: 'At current appreciation rate',
          tooltip: 'Current market value plus the remaining fraction of the year times the current annual appreciation rate. A rough linear forecast — not accounting for market shifts.' })}
        {(() => {
          const ml  = monthsLeftInYear();
          const yfr = yearFracRemaining();
          // Run-rate: current Net Position + avg cash flow × months left + appr × year frac left
          const runRate = agg.sellingProfit + avg.cashflow * ml + agg.monthlyApprAgg * ml;
          // Budgeted: current Net Position + expected CF × months left + expected appr × year frac left
          const expOpEx   = agg.totalExpectedOpEx;
          const expNOI    = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          const expCF     = expNOI != null ? expNOI - avg.mortgage : null;
          const expApprMo = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr / 12 : null;
          const expMG     = expCF != null ? expCF + (expApprMo ?? 0) : null;
          const budgeted  = expMG != null ? agg.sellingProfit + expMG * ml : null;
          return mc({
            label: 'Year-End Balance',
            primary: fmt(runRate),
            primaryCls: runRate >= 0 ? 'text-success' : 'text-danger',
            ...(budgeted != null ? expGap(runRate, budgeted,
              v => v >= 0 ? 'text-success' : 'text-danger',
              v => fmt(v),
              'Budget:', true, 1000) : {}),
            tooltip: `Projected Net Position at December 31st.\n\nRun-rate: current Net Position + avg monthly cash flow × ${ml} months left + avg monthly appreciation × ${ml} months.\nBudget: same but using expected (budgeted) monthly cash flow and appreciation.\n\nThis is what you would net if you sold everything at year-end, assuming current rates hold.` });
        })()}
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
        {(() => {
          const expInc = agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent : null;
          return mc({ label: `Avg Income (${avgWindow}M)`,
            primary: fmt(avg.income), primaryCls: 'text-success',
            ...expGap(avg.income, expInc,
              () => 'text-success', v => fmt(v), 'Exp:', true, 50),
            tooltip: `Average monthly income over the last ${avgWindow} complete months.\nExp = sum of all current monthly rents at 100% occupancy. Gap indicates how far below potential rent income sits.` });
        })()}
        {(() => {
          const expOpEx = agg.totalExpectedOpEx;
          const expExp  = expOpEx > 0 ? expOpEx + avg.mortgage : null;
          return mc({ label: `Avg Expenses (${avgWindow}M)`,
            primary: fmt(avg.expenses), primaryCls: 'text-danger',
            ...expGap(avg.expenses, expExp,
              v => v < agg.totalMonthlyRent * 0.65 ? '' : v < agg.totalMonthlyRent * 0.85 ? 'text-warning' : 'text-danger',
              v => fmt(v), 'Exp:', false, 50),
            tooltip: `Average monthly expenses over the last ${avgWindow} complete months.\nExp = budgeted op-ex (${agg.propertiesWithExpected} of ${properties.length} props) + avg mortgage. Lower than expected is better.` });
        })()}
        {(() => {
          const expOpEx = agg.totalExpectedOpEx;
          const expNOI  = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          const expCF   = expNOI != null ? expNOI - avg.mortgage : null;
          return mc({ label: `Avg Cash Flow (${avgWindow}M)`,
            primary: fmt(avg.cashflow),
            primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
            ...expGap(avg.cashflow, expCF,
              v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
            tooltip: `Average monthly (Income − Expenses) over the last ${avgWindow} complete months.\nExp = budgeted NOI minus average mortgage payment. Higher than expected is better.` });
        })()}
        {(() => {
          const expOpEx   = agg.totalExpectedOpEx;
          const expNOI    = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          return mc({ label: `Avg NOI (${avgWindow}M)`,
            primary: fmt(avg.noi),
            primaryCls: avg.noi >= 0 ? 'text-success' : 'text-danger',
            ...expGap(avg.noi, expNOI,
              v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
            tooltip: `Net Operating Income: avg monthly income minus all op-ex, excluding mortgage and principal.\nExp = total monthly rent minus budgeted operating expenses at full occupancy.` });
        })()}
      </div>

      {/* Row 2: Key investment ratios */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {(() => {
          const annualNOI = avg.noi * 12;
          const capRate   = agg.market > 0 ? annualNOI / agg.market : null;
          const expOpEx   = agg.totalExpectedOpEx;
          const expCap    = expOpEx > 0 && agg.market > 0
            ? (agg.totalMonthlyRent - expOpEx) * 12 / agg.market : null;
          const oer      = avg.income > 0 ? avg.noiExpenses / avg.income : null;
          const expOER   = expOpEx > 0 && agg.totalMonthlyRent > 0 ? expOpEx / agg.totalMonthlyRent : null;
          const dscr     = avg.mortgage > 0 ? avg.noi / avg.mortgage : null;
          const expNOI   = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          const expDSCR  = expNOI != null && avg.mortgage > 0 ? expNOI / avg.mortgage : null;
          return (<>
            {capRate !== null && mc({
              label: `Cap Rate (${avgWindow}M)`,
              primary: fPct(capRate),
              primaryCls: capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger',
              ...expGap(capRate, expCap,
                v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger', fPct, 'Exp:', true, 0.005),
              tertiary: capRate > 0.07 ? 'Strong yield' : capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
              tooltip: `Portfolio Cap Rate = annualised NOI ÷ total market value.\n> 7%: strong. 4–7%: moderate. < 4%: weak.\nExp uses budgeted operating costs at full occupancy.` })}
            {oer !== null && mc({
              label: `OER (${avgWindow}M)`,
              primary: fPct(oer),
              primaryCls: oer < 0.35 ? 'text-success' : oer < 0.50 ? '' : 'text-danger',
              ...expGap(oer, expOER,
                v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false, 0.02),
              tertiary: oer < 0.35 ? 'Efficient' : oer < 0.50 ? 'Normal' : 'High costs',
              tooltip: `Operating Expense Ratio = avg op-ex ÷ avg gross income.\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.\nExp uses budgeted op-ex ÷ total monthly rent. Lower than expected is better.` })}
            {dscr !== null && mc({
              label: `DSCR (${avgWindow}M)`,
              primary: dscr.toFixed(2) + 'x',
              primaryCls: dscr >= 1.25 ? 'text-success' : dscr >= 1.0 ? 'text-warning' : 'text-danger',
              ...expGap(dscr, expDSCR,
                v => v >= 1.25 ? 'text-success' : v >= 1.0 ? 'text-warning' : 'text-danger',
                v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
              tertiary: dscr >= 1.25 ? 'Healthy coverage' : dscr >= 1.0 ? 'Marginal' : 'Below 1x',
              tooltip: `Debt Service Coverage Ratio = avg monthly NOI ÷ avg mortgage payment.\n≥ 1.25x: healthy — income well covers debt. 1.0–1.25x: marginal. < 1.0x: income doesn't cover the mortgage.\nExp uses budgeted NOI divided by actual average mortgage.` })}
          </>);
        })()}
      </div>

      {/* Row 3: Monthly gain + net position + payback/break-even */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {(() => {
          const mg      = avg.cashflow + agg.monthlyApprAgg;
          const expOpEx = agg.totalExpectedOpEx;
          const expNOI  = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          const expCF   = expNOI != null ? expNOI - avg.mortgage : null;
          const expApprMo = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr / 12 : null;
          const expMG   = expCF != null ? expCF + (expApprMo ?? 0) : null;
          return mc({ label: 'Monthly Gain', primary: fmt(mg),
            primaryCls: mg >= 0 ? 'text-success' : 'text-danger',
            ...expGap(mg, expMG,
              v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
            tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly ÷ 12). Combines income and value growth in one number.\nExp uses budgeted operating costs + expected appreciation %.' });
        })()}
        {mc({ label: 'Net Position', primary: fmt(agg.sellingProfit),
          primaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value + Total Income − Total Expenses − Loans. Net proceeds if you sold everything today and cleared all mortgages.' })}
        {(() => {
          // Payback period: (total expenses − total income) ÷ avg cash flow
          // i.e. how long until every dollar spent (including principal) is recovered
          const outstanding = agg.expenses - agg.income;
          const pp = avg.cashflow > 0
            ? (outstanding <= 0 ? 0 : outstanding / avg.cashflow)
            : null;
          const ppLabel = pp === null ? (avg.cashflow <= 0 ? '∞ (no CF)' : '—')
            : pp === 0 ? 'Recovered'
            : pp < 12 ? `${Math.round(pp)} mo` : `${(pp/12).toFixed(1)} yr`;
          const ppCls = pp === null ? 'text-danger' : pp === 0 ? 'text-success' : pp < 36 ? 'text-success' : pp < 84 ? '' : 'text-danger';
          const totalExpCF = properties.reduce((s, p) => {
            const e = calcExpected(p, perPropAvg[p.id]?.mortgage ?? 0);
            return e ? s + e.monthlyCF : s;
          }, 0);
          const expPP     = totalExpCF > 0 ? (outstanding <= 0 ? 0 : outstanding / totalExpCF) : null;
          const expPPLabel = expPP != null
            ? (expPP === 0 ? 'Exp: Recovered' : expPP < 12 ? `Exp: ${Math.round(expPP)} mo` : `Exp: ${(expPP/12).toFixed(1)} yr`) : null;
          return mc({ label: 'Payback Period', primary: ppLabel, primaryCls: ppCls,
            secondary: expPPLabel, secondaryCls: expPPLabel ? 'text-success' : '',
            tooltip: `Time until all recorded expenses are recovered by cumulative cash flow.\nNumerator = Total Expenses − Total Income (${fmt(agg.expenses)} − ${fmt(agg.income)}).\nExp uses budgeted cash flow.` });
        })()}
        {(() => {
          // Break-even: time until net position (sellingProfit) reaches 0 via monthly gain
          const np = agg.sellingProfit;
          const mg = avg.cashflow + agg.monthlyApprAgg;
          const totalExpCF3 = properties.reduce((s, p) => {
            const e = calcExpected(p, perPropAvg[p.id]?.mortgage ?? 0);
            return e ? s + e.monthlyCF : s;
          }, 0);
          const expApprMo = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr / 12 : null;
          const expMG     = totalExpCF3 > 0 ? totalExpCF3 + (expApprMo ?? 0) : null;
          let beLabel, beCls;
          if (np >= 0) { beLabel = 'Reached'; beCls = 'text-success'; }
          else if (mg <= 0) { beLabel = '∞ (no growth)'; beCls = 'text-danger'; }
          else { const mo = -np / mg; beLabel = mo < 12 ? `${Math.round(mo)} mo` : `${(mo/12).toFixed(1)} yr`; beCls = mo < 36 ? 'text-success' : mo < 84 ? '' : 'text-danger'; }
          const expBE = (expMG != null && expMG > 0 && np < 0)
            ? (() => { const mo = -np / expMG; return mo < 12 ? `Exp: ${Math.round(mo)} mo` : `Exp: ${(mo/12).toFixed(1)} yr`; })()
            : (np >= 0 ? 'Exp: Reached' : null);
          return mc({ label: 'Break-even', primary: beLabel, primaryCls: beCls,
            secondary: expBE, secondaryCls: expBE ? 'text-success' : '',
            tooltip: `Time until Net Position (Market Value + Income − Expenses − Loans) reaches zero or better.\nUses monthly gain (cash flow + appreciation) to close the gap.\nExp uses budgeted monthly gain.` });
        })()}
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
              <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
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
                <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
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
                <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
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

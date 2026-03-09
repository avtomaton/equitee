import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import { INITIAL_OPTIONS, PROVINCES, mergeOptions, COLORS, API_URL, COLUMN_DEFS, principalInRange } from '../config.js';
import { yearsHeld, calcSimpleHealth, avgMonthly, calcExpected, expGap, monthsLeftInYear, yearFracRemaining } from '../metrics.js';
import { useColumnVisibility } from '../hooks.js';
import StatCard from './StatCard.jsx';
import MetricCard from './MetricCard.jsx';
import KPICard from './KPICard.jsx';
import FinancialPeriodSection from './FinancialPeriodSection.jsx';
import { fmt, fmtM, fp, fPct, mc, SectionLabel, WindowPicker, WINDOW_OPTIONS, wLabel, ltvColor } from './uiHelpers.jsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

const TT   = { background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' };
const pct  = (n, d) => d ? `${((n / d) * 100).toFixed(1)}%` : '—';
const shortName = (name) => name.length > 14 ? name.slice(0, 14) + '…' : name;

// ── Collapsible wrapper ────────────────────────────────────────────────────────
function Collapsible({ title, defaultOpen = false, children, headerRight }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="table-container" style={{ marginBottom: '1.25rem' }}>
      <div className="table-header" onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', userSelect: 'none' }}>
        <div className="table-title">{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {headerRight}
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
            {open ? '▲ collapse' : '▼ expand'}
          </span>
        </div>
      </div>
      {open && children}
    </div>
  );
}



// ── Analytics ─────────────────────────────────────────────────────────────────


function Analytics({ filtered }) {
  const [chartData,  setChartData]  = useState(null);
  const [allIncome,  setAllIncome]  = useState([]);
  const [allExpenses,setAllExpenses]= useState([]);
  const [avgWindow,  setAvgWindow]  = useState(3);

  // Fetch raw income + expense records for all filtered properties
  useEffect(() => {
    if (!filtered.length) { setAllIncome([]); setAllExpenses([]); return; }
    Promise.all(filtered.map(p =>
      fetch(`${API_URL}/income?property_id=${p.id}`).then(r => r.ok ? r.json() : [])
        .then(d => d.map(i => ({ ...i, _pid: p.id })))
    )).then(r => setAllIncome(r.flat())).catch(() => {});
    Promise.all(filtered.map(p =>
      fetch(`${API_URL}/expenses?property_id=${p.id}`).then(r => r.ok ? r.json() : [])
        .then(d => d.map(e => ({ ...e, _pid: p.id })))
    )).then(r => setAllExpenses(r.flat())).catch(() => {});
  }, [filtered.map(p => p.id).join(',')]);

  const buildChartData = useCallback((list) => {
    const yrsHeld = (p) => {
      if (!p.poss_date) return null;
      const [y, m, d] = p.poss_date.split('-').map(Number);
      const diff = (Date.now() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return diff > 0 ? diff : null;
    };
    const incExp = list.map(p => ({
      name: shortName(p.name),
      Income: p.total_income, Expenses: p.total_expenses,
      Net: p.total_income - p.total_expenses,
    }));
    const value = list.map(p => ({ name: shortName(p.name), Value: p.market_price }));
    const roi   = list.map(p => {
      const net = p.total_income - (p.total_expenses - (p.purchase_price - p.loan_amount));
      return { name: shortName(p.name), ROI: p.market_price ? parseFloat((net / p.market_price * 100).toFixed(2)) : 0 };
    });
    const statusCount = list.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
    const status = Object.entries(statusCount).map(([name, value]) => ({ name, value }));
    const equity = list.map(p => ({ name: shortName(p.name), Equity: p.market_price - p.loan_amount, Loan: p.loan_amount }));
    const equityPct = list.map(p => ({
      name: shortName(p.name),
      EquityPct: p.market_price ? parseFloat(((p.market_price - p.loan_amount) / p.market_price * 100).toFixed(1)) : 0,
    }));
    const appreciation = list.map(p => {
      const appr  = p.market_price - p.purchase_price;
      const yrs   = yrsHeld(p);
      return { name: shortName(p.name), Appreciation: appr, YearlyAppr: yrs ? parseFloat((appr / yrs).toFixed(0)) : null };
    });
    return { incExp, value, roi, status, equity, equityPct, appreciation };
  }, []);

  useEffect(() => { setChartData(buildChartData(filtered)); }, []); // eslint-disable-line

  const refresh = (e) => { e.stopPropagation(); setChartData(buildChartData(filtered)); };

  // Live aggregate metrics — always current with filter
  const agg = useMemo(() => {
    const market   = filtered.reduce((s, p) => s + p.market_price,   0);
    const purchase = filtered.reduce((s, p) => s + p.purchase_price, 0);
    const loan     = filtered.reduce((s, p) => s + p.loan_amount,    0);
    const income   = filtered.reduce((s, p) => s + p.total_income,   0);
    const expenses = filtered.reduce((s, p) => s + p.total_expenses, 0);
    const equity   = market - loan;
    const equityPct= market > 0 ? equity / market * 100 : null;
    const loanPct  = market > 0 ? loan   / market * 100 : null;
    const appr     = market - purchase;
    const apprPct  = purchase > 0 ? appr / purchase * 100 : null;
    const allTimePrin = filtered.reduce((sum, p) => {
      const pe = allExpenses.filter(r => r.property_id === p.id);
      return sum + principalInRange(pe, p.loan_amount, p.mortgage_rate || 0, new Date(0), new Date());
    }, 0);

    const yearlyAppr = filtered.reduce((s, p) => {
      if (!p.poss_date) return s;
      const [y, m, d] = p.poss_date.split('-').map(Number);
      const yrs = (Date.now() - new Date(y, m - 1, d).getTime()) / (1000*60*60*24*365.25);
      return yrs > 0 ? s + (p.market_price - p.purchase_price) / yrs : s;
    }, 0);
    const yearlyApprPct = purchase > 0 ? yearlyAppr / purchase * 100 : null;
    const now = new Date();
    const yearFrac = (now - new Date(now.getFullYear(), 0, 1)) / (365.25 * 86400000);
    const projectedYE = market + appr * (1 - yearFrac);
    const totalNetExp  = filtered.reduce((s, p) => s + (p.total_expenses - (p.purchase_price - p.loan_amount)), 0);
    const netBalance   = income - totalNetExp;
    const balance      = income - expenses;
    const roi          = market > 0 ? netBalance / market * 100 : null;
    const sellingProfit = filtered.reduce((s, p) =>
      s + p.market_price + p.total_income - p.total_expenses - p.loan_amount, 0);
    const sellingPct    = filtered.reduce((s, p) => s + p.total_expenses, 0) > 0
      ? (sellingProfit / filtered.reduce((s, p) => s + p.total_expenses, 0) * 100).toFixed(1) : null;

    // YTD (trailing 12 months)
    const ytdEnd   = new Date();
    const ytdStart = new Date(ytdEnd); ytdStart.setFullYear(ytdStart.getFullYear() - 1);
    const inYTD = (dateStr) => {
      if (!dateStr) return false;
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt >= ytdStart && dt <= ytdEnd;
    };
    const ytdInc  = allIncome.filter(r   => inYTD(r.income_date)).reduce((s, r) => s + r.amount, 0);
    const ytdExp  = allExpenses.filter(r => inYTD(r.expense_date)).reduce((s, r) => s + r.amount, 0);
    const ytdBal  = ytdInc - ytdExp;
    const ytdPrin = filtered.reduce((sum, p) => {
      const propExp = allExpenses.filter(r => r._pid === p.id);
      return sum + principalInRange(propExp, p.loan_amount, p.mortgage_rate || 0, ytdStart, ytdEnd);
    }, 0);
    const ytdNetExp    = ytdExp  - ytdPrin;
    const ytdNetProfit = ytdInc  - ytdNetExp;

    // Monthly gain = (avg cash flow across all filtered) + monthly appreciation
    // avgCashFlow for agg is computed from allIncome/allExpenses avg window
    // We approximate here using YTD / 12 as a proxy; the actual avg window calc is below
    const approxMonthlyCF  = (agg => agg)(0); // placeholder — overwritten below
    const monthlyApprAgg   = yearlyAppr / 12;
    // Portfolio-level expected operating costs (properties with cost data entered)
    const totalExpectedOpEx = filtered.reduce((s, p) => {
      const fixed = p.expected_condo_fees || 0;
      const utils = (p.expected_insurance || 0) + (p.expected_utilities || 0) + (p.expected_misc_expenses || 0);
      const tax   = p.annual_property_tax  || 0;
      return (fixed + utils + tax > 0) ? s + fixed + utils + tax / 12 : s;
    }, 0);
    const propertiesWithExpected = filtered.filter(p =>
      (p.expected_condo_fees || 0) + (p.expected_insurance || 0) + (p.expected_utilities || 0) + (p.expected_misc_expenses || 0) + (p.annual_property_tax || 0) > 0
    ).length;
    // Expected yearly appreciation sum across filtered properties
    const totalExpectedYearlyAppr = filtered.reduce((s, p) =>
      p.expected_appreciation_pct > 0 ? s + p.purchase_price * p.expected_appreciation_pct / 100 : s
    , 0);

    // Monthly rent potential
    const totalMonthlyRent = filtered.reduce((s, p) => s + (p.monthly_rent || 0), 0);

    const expYearlyApprPct = purchase > 0 && totalExpectedYearlyAppr > 0
      ? totalExpectedYearlyAppr / purchase * 100 : null;

    const occupied     = filtered.filter(p => p.status !== 'Vacant').length;
    const occupancyPct = filtered.length > 0 ? occupied / filtered.length * 100 : null;

    return { market, purchase, loan, equity, equityPct, loanPct, appr, apprPct,
             yearlyAppr, yearlyApprPct, projectedYE, monthlyApprAgg,
             income, expenses, balance, totalNetExp, netBalance, roi, sellingProfit, sellingPct, allTimePrin,
             ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdNetProfit,
             totalMonthlyRent, totalExpectedOpEx, propertiesWithExpected, totalExpectedYearlyAppr, expYearlyApprPct,
             occupied, occupancyPct };
  }, [filtered, allIncome, allExpenses]);

  // Monthly averages — mirrors Dashboard/config avgMonthly with NOI split
  const avg = useMemo(() => {
    const now   = new Date();
    const end   = new Date(now.getFullYear(), now.getMonth(), 1);
    const allTime = avgWindow === 0;
    const start = allTime ? null : (() => { const s = new Date(end); s.setMonth(s.getMonth() - avgWindow); return s; })();
    const inW   = (dateStr) => {
      if (!dateStr) return false;
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return (allTime || dt >= start) && dt < end;
    };
    const inc  = allIncome.filter(r   => inW(r.income_date)).reduce((s, r) => s + r.amount, 0);
    const exp  = allExpenses.filter(r => inW(r.expense_date)).reduce((s, r) => s + r.amount, 0);
    const noiExp = allExpenses
      .filter(r => inW(r.expense_date) && !['Mortgage', 'Principal'].includes(r.expense_category))
      .reduce((s, r) => s + r.amount, 0);
    const mortgage = allExpenses
      .filter(r => inW(r.expense_date) && r.expense_category === 'Mortgage')
      .reduce((s, r) => s + r.amount, 0);
    let w = avgWindow > 0 ? avgWindow : 1;
    if (allTime) {
      const dates = [
        ...allIncome.map(r => r.income_date),
        ...allExpenses.map(r => r.expense_date),
      ].filter(Boolean).sort();
      if (dates.length) {
        const [y, m] = dates[0].split('-').map(Number);
        w = Math.max(1, Math.round((end - new Date(y, m - 1, 1)) / (1000 * 60 * 60 * 24 * 30.44)));
      }
    }
    return {
      income:      inc    / w,
      expenses:    exp    / w,
      cashflow:    (inc - exp) / w,
      noi:         (inc - noiExp) / w,
      noiExpenses: noiExp / w,
      mortgage:    mortgage / w,
    };
  }, [allIncome, allExpenses, avgWindow]);


  const statusColors = { Rented: '#10b981', Vacant: '#ef4444', Primary: '#3b82f6' };

  const G2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' };

  return (
    <div style={{ padding: '1.25rem 1.5rem' }}>

      {/* ── Portfolio Summary ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', paddingTop: '0.25rem' }}>

        {/* Avail Equity */}
        {(() => {
          const availEq  = Math.max(0, 0.80 * agg.market - agg.loan);
          const availPct = agg.equity > 0 ? availEq / agg.equity * 100 : null;
          const ltvAfter = agg.market > 0 ? ((agg.loan + availEq) / agg.market * 100) : null;
          return mc({
            label: 'Avail. Equity',
            primary: fmt(availEq),
            primaryCls: availEq > 0 ? 'text-success' : 'text-secondary',
            secondary: availPct !== null ? availPct.toFixed(1) + '% of ' + fmt(agg.equity) : null,
            secondaryCls: availEq > 0 ? 'text-success' : '',
            tertiary: 'Borrowable at ≤80% LTV',
            tooltip: 'Equity you can access via HELOC or refinance without exceeding 80% LTV.\nFormula: max(0, 80% × Market Value − Loan Balance).\nDrawing this amount would bring your LTV to exactly 80%.\nLeave buffer — drawing all available equity maximises leverage risk.'
          });
        })()}

        {/* Monthly Mortgage */}
        {(() => {
          const totalMortgage = avg.mortgage;
          const monthlyInterest = filtered.reduce((s, p) =>
            p.loan_amount > 0 && p.mortgage_rate > 0 ? s + p.loan_amount * p.mortgage_rate / 100 / 12 : s, 0);
          const principal = totalMortgage > monthlyInterest ? totalMortgage - monthlyInterest : null;
          return mc({
            label: 'Mortgage / mo',
            primary: totalMortgage > 0 ? fmt(totalMortgage) : '—',
            secondary: monthlyInterest > 0 ? 'Interest: ' + fmt(Math.round(monthlyInterest)) : null,
            secondaryCls: 'text-danger',
            tertiary: principal != null && principal > 0 ? 'Principal: ' + fmt(Math.round(principal)) : null,
            tooltip: 'Average monthly mortgage payments across all filtered properties (from recorded expense data).\nInterest estimate = loan × rate ÷ 12.\nPrincipal = total payment minus estimated interest (equity-building portion).\nNote: interest is approximate — it assumes current loan balance and does not amortize.'
          });
        })()}

        {/* DSCR */}
        {(() => {
          const dscrRow = avg.mortgage > 0 ? avg.noi / avg.mortgage : null;
          const expOpEx_d = agg.totalExpectedOpEx;
          const expNOI_d  = expOpEx_d > 0 ? agg.totalMonthlyRent - expOpEx_d : null;
          const expDSCR_d = expNOI_d != null && avg.mortgage > 0 ? expNOI_d / avg.mortgage : null;
          if (dscrRow === null) return mc({ label: 'DSCR', primary: '—', primaryCls: 'text-secondary',
            tertiary: 'No mortgage data',
            tooltip: 'Debt Service Coverage requires mortgage expense records.' });
          return mc({
            label: `DSCR (${wLabel(avgWindow)})`,
            primary: dscrRow.toFixed(2) + 'x',
            primaryCls: dscrRow >= 1.25 ? 'text-success' : dscrRow >= 1.0 ? '' : 'text-danger',
            ...expGap(dscrRow, expDSCR_d,
              v => v >= 1.25 ? 'text-success' : v >= 1.0 ? '' : 'text-danger',
              v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
            tertiary: dscrRow >= 1.25 ? 'Healthy' : dscrRow >= 1.0 ? 'Marginal' : 'Below 1x',
            tooltip: `Debt Service Coverage = avg NOI ÷ avg mortgage.\n≥ 1.25x: lenders are comfortable. 1.0–1.25x: marginal — one vacancy could cause a shortfall. < 1.0x: income doesn't cover debt payments.\nExp = budgeted NOI ÷ avg mortgage.`
          });
        })()}

        {/* Avg Cash Flow */}
        {(() => {
          const expCF = agg.totalExpectedOpEx > 0
            ? (agg.totalMonthlyRent - agg.totalExpectedOpEx) - avg.mortgage : null;
          return mc({ label: `Avg Cash Flow (${wLabel(avgWindow)})`,
            primary: fmt(avg.cashflow),
            primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
            ...expGap(avg.cashflow, expCF,
              v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
            tooltip: `Average monthly (Income − Expenses) over the last ${avgWindow} complete months.\nExp = budgeted NOI minus avg mortgage. Positive = cash positive, negative = cash drain.` });
        })()}

        {/* OER */}
        {(() => {
          const oer    = avg.income > 0 ? avg.noiExpenses / avg.income : null;
          const expOER = agg.totalExpectedOpEx > 0 && agg.totalMonthlyRent > 0
            ? agg.totalExpectedOpEx / agg.totalMonthlyRent : null;
          if (oer === null) return mc({ label: 'OER', primary: '—', primaryCls: 'text-secondary',
            tertiary: 'No income in window',
            tooltip: 'Operating Expense Ratio requires income records in the selected window.' });
          return mc({ label: `OER (${wLabel(avgWindow)})`,
            primary: fPct(oer),
            primaryCls: oer < 0.35 ? 'text-success' : oer < 0.50 ? '' : 'text-danger',
            ...expGap(oer, expOER, v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false, 0.02),
            tertiary: oer < 0.35 ? 'Efficient' : oer < 0.50 ? 'Normal' : 'High costs',
            tooltip: `Operating Expense Ratio = avg op-ex ÷ avg gross income.\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.\nExp = budgeted op-ex ÷ total monthly rent.` });
        })()}

        {/* YTD Operating Profit */}
        {mc({ label: 'YTD Operating Profit', primary: fmt(agg.ytdNetProfit),
          primaryCls: agg.ytdNetProfit >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.market > 0 ? agg.ytdNetProfit !== 0 ? fp(agg.ytdNetProfit / agg.market * 100) + ' YTD ROI' : null : null,
          secondaryCls: agg.ytdNetProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'YTD Income minus YTD Net Expenses (excluding equity-building payments like principal).\nThe true operating profit in the trailing 12 months.\nYTD ROI = YTD Operating Profit ÷ Portfolio Value.' })}
      </div>

      {/* ── Appreciation ── */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Appreciation', primary: fmt(agg.appr),
          primaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.apprPct !== null && agg.purchase > 0 ? agg.apprPct.toFixed(1) + '% from ' + fmt(agg.purchase) : null,
          secondaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total unrealised gain: current market value minus original purchase price across all filtered properties.' })}
        {(() => {
          const actual = agg.yearlyAppr;
          const exp    = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr : null;
          const expPct = agg.expYearlyApprPct;
          return mc({
            label: 'Yearly Appreciation',
            primary: fmt(actual),
            primaryCls: actual >= 0 ? 'text-success' : 'text-danger',
            secondary: agg.yearlyApprPct !== null ? pct(agg.yearlyAppr, agg.purchase) + ' per year' : null,
            secondaryCls: actual >= 0 ? 'text-success' : 'text-danger',
            ...expGap(actual, exp,
              v => v >= 0 ? 'text-success' : 'text-danger',
              v => fmt(v) + (expPct ? ' (' + expPct.toFixed(1) + '%/yr)' : ''),
              'Exp:', true, 500),
            tooltip: 'Annualised appreciation per property, summed across filtered properties.\nRequires possession date per property.\nExp = sum of (purchase price × expected appreciation %) for properties where that budget is set.' });
        })()}
        {mc({ label: 'Projected Year-End Value', primary: fmt(agg.projectedYE),
          tertiary: 'At current appreciation rate',
          tooltip: 'Current market value plus the remaining fraction of this year times the current annual appreciation rate.' })}
        {(() => {
          const ml  = monthsLeftInYear();
          const expOpEx   = agg.totalExpectedOpEx;
          const expNOI    = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          const expCF     = expNOI != null ? expNOI - avg.mortgage : null;
          const expApprMo = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr / 12 : null;
          const expMG     = expCF != null ? expCF + (expApprMo ?? 0) : null;
          const runRate   = agg.sellingProfit + avg.cashflow * ml + agg.monthlyApprAgg * ml;
          const budgeted  = expMG != null ? agg.sellingProfit + expMG * ml : null;
          return mc({
            label: 'Year-End Balance',
            primary: fmt(runRate),
            primaryCls: runRate >= 0 ? 'text-success' : 'text-danger',
            ...(budgeted != null ? expGap(runRate, budgeted,
              v => v >= 0 ? 'text-success' : 'text-danger',
              v => fmt(v), 'Budget:', true, 1000) : {}),
            tooltip: `Projected net position at December 31st if current rates hold.\nRun-rate: current Net Position + avg monthly cash flow × ${ml} months + avg monthly appreciation × ${ml} months.\nBudget: same calculation using expected (budgeted) monthly cash flow and appreciation.\nShows what you would walk away with at year-end if you sold everything.` });
        })()}
      </div>

      {/* ── Income & Expenses ── */}
      <p className="stat-section-label">Income &amp; Expenses (all-time)</p>
      <FinancialPeriodSection
        income={agg.income} expenses={agg.expenses} netExpenses={agg.totalNetExp}
        balance={agg.balance} operatingProfit={agg.netBalance} roi={agg.roi}
        principal={agg.allTimePrin} scope="filtered" />

      {/* ── YTD ── */}
      <p className="stat-section-label">YTD — trailing 12 months</p>
      <FinancialPeriodSection prefix="YTD "
        income={agg.ytdInc} expenses={agg.ytdExp} netExpenses={agg.ytdNetExp}
        balance={agg.ytdBal} operatingProfit={agg.ytdNetProfit}
        principal={agg.ytdPrin} scope="filtered" />

      {/* ── Monthly averages ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        <p className="stat-section-label" style={{ margin: 0 }}>Monthly Averages &amp; Key Ratios</p>
        <WindowPicker value={avgWindow} onChange={setAvgWindow} />
      </div>

            {/* Row 1: Core income / NOI */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {(() => {
          const expInc = agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent : null;
          return mc({ label: `Avg Income (${wLabel(avgWindow)})`,
            primary: fmt(avg.income), primaryCls: 'text-success',
            ...expGap(avg.income, expInc,
              () => 'text-success', v => fmt(v), 'Exp:', true, 50),
            tooltip: `Average monthly income over the last ${avgWindow} complete months.\nExp = sum of all current monthly rents at 100% occupancy.` });
        })()}
        {(() => {
          const expOpEx = agg.totalExpectedOpEx;
          const expExp  = expOpEx > 0 ? expOpEx + avg.mortgage : null;
          return mc({ label: `Avg Expenses (${wLabel(avgWindow)})`,
            primary: fmt(avg.expenses), primaryCls: 'text-danger',
            ...expGap(avg.expenses, expExp,
              v => v < agg.totalMonthlyRent * 0.65 ? '' : v < agg.totalMonthlyRent * 0.85 ? 'text-warning' : 'text-danger',
              v => fmt(v), 'Exp:', false, 50),
            tooltip: `Average monthly expenses over the last ${avgWindow} complete months.\nExp = budgeted op-ex (${agg.propertiesWithExpected} of ${filtered.length} props) + avg mortgage. Lower is better.` });
        })()}
        {(() => {
          const expOpEx = agg.totalExpectedOpEx;
          const expNOI  = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          const expCF   = expNOI != null ? expNOI - avg.mortgage : null;
          return mc({ label: `Avg Cash Flow (${wLabel(avgWindow)})`,
            primary: fmt(avg.cashflow),
            primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
            ...expGap(avg.cashflow, expCF,
              v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
            tooltip: `Average monthly (Income − Expenses) over the last ${avgWindow} complete months.\nExp = budgeted NOI minus average mortgage.` });
        })()}
        {(() => {
          const expOpEx = agg.totalExpectedOpEx;
          const expNOI  = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          return mc({ label: `Avg NOI (${wLabel(avgWindow)})`,
            primary: fmt(avg.noi),
            primaryCls: avg.noi >= 0 ? 'text-success' : 'text-danger',
            ...expGap(avg.noi, expNOI,
              v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
            tooltip: `Net Operating Income: income minus op-ex, excluding mortgage and principal.\nExp = total monthly rent minus budgeted op-ex at full occupancy.` });
        })()}
      </div>

      {/* Row 2: Key investment ratios */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {(() => {
          const annualNOI = avg.noi * 12;
          const capRate   = agg.market > 0 ? annualNOI / agg.market : null;
          const expOpEx   = agg.totalExpectedOpEx;
          const expCap    = expOpEx > 0 && agg.market > 0 ? (agg.totalMonthlyRent - expOpEx) * 12 / agg.market : null;
          const oer       = avg.income > 0 ? avg.noiExpenses / avg.income : null;
          const expOER    = expOpEx > 0 && agg.totalMonthlyRent > 0 ? expOpEx / agg.totalMonthlyRent : null;
          const dscr      = avg.mortgage > 0 ? avg.noi / avg.mortgage : null;
          const expNOI    = expOpEx > 0 ? agg.totalMonthlyRent - expOpEx : null;
          const expDSCR   = expNOI != null && avg.mortgage > 0 ? expNOI / avg.mortgage : null;
          return (<>
            {capRate !== null && mc({
              label: `Cap Rate (${wLabel(avgWindow)})`,
              primary: fPct(capRate),
              primaryCls: capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger',
              ...expGap(capRate, expCap,
                v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger', fPct, 'Exp:', true, 0.005),
              tertiary: capRate > 0.07 ? 'Strong yield' : capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
              tooltip: `Portfolio Cap Rate = annualised NOI ÷ total market value.\n> 7%: strong. 4–7%: moderate. < 4%: weak.\nExp = budgeted NOI at full occupancy.` })}
            {oer !== null && mc({
              label: `OER (${wLabel(avgWindow)})`,
              primary: fPct(oer),
              primaryCls: oer < 0.35 ? 'text-success' : oer < 0.50 ? '' : 'text-danger',
              ...expGap(oer, expOER,
                v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false, 0.02),
              tertiary: oer < 0.35 ? 'Efficient' : oer < 0.50 ? 'Normal' : 'High costs',
              tooltip: `Operating Expense Ratio = avg op-ex ÷ avg gross income.\nBelow 35%: efficient. 35–50%: normal. Above 50%: high.\nExp = budgeted op-ex ÷ total monthly rent.` })}
            {dscr !== null && mc({
              label: `DSCR (${wLabel(avgWindow)})`,
              primary: dscr.toFixed(2) + 'x',
              primaryCls: dscr >= 1.25 ? 'text-success' : dscr >= 1.0 ? 'text-warning' : 'text-danger',
              ...expGap(dscr, expDSCR,
                v => v >= 1.25 ? 'text-success' : v >= 1.0 ? 'text-warning' : 'text-danger',
                v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
              tertiary: dscr >= 1.25 ? 'Healthy coverage' : dscr >= 1.0 ? 'Marginal' : 'Below 1x',
              tooltip: `Debt Service Coverage = avg monthly NOI ÷ avg mortgage.\n≥ 1.25x: healthy. 1.0–1.25x: marginal. < 1.0x: income doesn’t cover debt.` })}
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
            tooltip: `Avg Cash Flow + Monthly Appreciation (yearly ÷ 12).\nCaptures income and value growth together.\nExp uses budgeted costs + expected appreciation %.` });
        })()}
        {(() => {
          const npPctA = agg.balance !== 0 ? (agg.sellingProfit / Math.abs(agg.balance) * 100) : null;
          return mc({ label: 'Net Position', primary: fmt(agg.sellingProfit),
            primaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
            secondary: npPctA !== null ? npPctA.toFixed(1) + '% of net spending' : null,
            secondaryCls: npPctA !== null ? (npPctA >= 0 ? 'text-success' : 'text-danger') : '',
            tooltip: 'Market Value + Income − Expenses − Loans. Net proceeds if you sold all filtered properties today and cleared all mortgages.' });
        })()}
        {(() => {
          const downPmt = agg.purchase - agg.loan;
          const pp      = avg.cashflow > 0 ? downPmt / avg.cashflow : null;
          const ppLabel = pp == null ? (avg.cashflow <= 0 ? '\u221e (no CF)' : '\u2014')
            : pp < 12 ? `${Math.round(pp)} mo` : `${(pp/12).toFixed(1)} yr`;
          const ppCls   = pp == null ? 'text-danger' : pp < 36 ? 'text-success' : pp < 84 ? '' : 'text-danger';
          const filtExpCF = filtered.reduce((s, p) => {
            const pMtg = allExpenses.filter(r => r._pid === p.id && r.expense_category === 'Mortgage')
              .reduce((a, r) => a + r.amount, 0) / Math.max(1, avgWindow);
            const e = calcExpected(p, pMtg);
            return e ? s + e.monthlyCF : s;
          }, 0);
          const expPP   = filtExpCF > 0 ? downPmt / filtExpCF : null;
          const expPPLbl = expPP != null
            ? (expPP < 12 ? `Exp: ${Math.round(expPP)} mo` : `Exp: ${(expPP/12).toFixed(1)} yr`) : null;
          return mc({ label: 'Payback Period', primary: ppLabel, primaryCls: ppCls,
            secondary: expPPLbl, secondaryCls: expPPLbl ? 'text-success' : '',
            tooltip: `Time to recover the total down payment (${fmt(downPmt)}) via average monthly cash flow.\nMeasures how long your initial capital is at risk.\nExp uses budgeted cash flow.` });
        })()}
        {(() => {
          const downPmt = agg.purchase - agg.loan;
          const mg  = avg.cashflow + agg.monthlyApprAgg;
          const filtExpCF_be = filtered.reduce((s, p) => {
            const pMtg = allExpenses.filter(r => r._pid === p.id && r.expense_category === 'Mortgage')
              .reduce((a, r) => a + r.amount, 0) / Math.max(1, avgWindow);
            const e = calcExpected(p, pMtg);
            return e ? s + e.monthlyCF : s;
          }, 0);
          const expApprb = agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr / 12 : null;
          const expMGb   = filtExpCF_be > 0 ? filtExpCF_be + (expApprb ?? 0) : null;
          let beLabel, beCls;
          if (mg <= 0) { beLabel = '\u221e (no growth)'; beCls = 'text-danger'; }
          else { const mo = downPmt / mg; beLabel = mo < 12 ? `${Math.round(mo)} mo` : `${(mo/12).toFixed(1)} yr`; beCls = mo < 36 ? 'text-success' : mo < 84 ? '' : 'text-danger'; }
          const expBE = (expMGb != null && expMGb > 0)
            ? (() => { const mo = downPmt / expMGb; return mo < 12 ? `Exp: ${Math.round(mo)} mo` : `Exp: ${(mo/12).toFixed(1)} yr`; })()
            : null;
          return mc({ label: 'Break-even', primary: beLabel, primaryCls: beCls,
            secondary: expBE, secondaryCls: expBE ? 'text-success' : '',
            tooltip: `Time to recoup the down payment (${fmt(downPmt)}) via monthly gain (cash flow + appreciation).\nAlways ≤ Payback Period since gain ≥ cash flow.\nExp uses budgeted monthly gain.` });
        })()}
      </div>

      {/* ── Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Income vs Expenses by Property</h2></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData?.incExp}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Income"   fill="#10b981" />
              <Bar dataKey="Expenses" fill="#ef4444" />
              <Bar dataKey="Net"      fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Status Breakdown</h2></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={chartData?.status} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={75}
                label={({ name, value }) => `${name}: ${value}`}>
                {(chartData?.status || []).map((entry, i) => (
                  <Cell key={entry.name} fill={statusColors[entry.name] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TT} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={G2}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Market Value by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData?.value}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Bar dataKey="Value" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">ROI by Property (%)</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData?.roi}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TT} formatter={v => `${v}%`} />
              <Bar dataKey="ROI">
                {(chartData?.roi || []).map((e, i) => <Cell key={i} fill={e.ROI >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={G2}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Equity vs Loan by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData?.equity}>
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
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Equity % by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData?.equityPct}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={TT} formatter={v => `${v}%`} />
              <Bar dataKey="EquityPct">
                {(chartData?.equityPct || []).map((e, i) => (
                  <Cell key={i} fill={e.EquityPct >= 50 ? '#10b981' : e.EquityPct >= 25 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...G2, marginBottom: 0 }}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Total Appreciation by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData?.appreciation}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Bar dataKey="Appreciation">
                {(chartData?.appreciation || []).map((e, i) => <Cell key={i} fill={e.Appreciation >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Yearly Appreciation by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={(chartData?.appreciation || []).filter(d => d.YearlyAppr !== null)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}/yr`} />
              <Bar dataKey="YearlyAppr">
                {(chartData?.appreciation || []).filter(d => d.YearlyAppr !== null).map((e, i) => (
                  <Cell key={i} fill={e.YearlyAppr >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-small" onClick={refresh}>
          ↻ Refresh charts from current filters
        </button>
      </div>
    </div>
  );
}

// ── Archive section ───────────────────────────────────────────────────────────
function ArchivedPropertiesSection({ archivedProps, onRestore }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="table-container" style={{ marginTop: '1.25rem' }}>
      <div className="table-header" onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', userSelect: 'none' }}>
        <div className="table-title" style={{ color: 'var(--text-tertiary)' }}>
          🗄 Archived Properties ({archivedProps.length})
        </div>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
          {open ? '▲ collapse' : '▼ expand'}
        </span>
      </div>
      {open && (
        archivedProps.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <div className="empty-state-text">No archived properties</div>
          </div>
        ) : (
          <div className="table-scroll-wrap"><table>
            <thead>
              <tr>
                <th className="col-fill">Name</th><th>Type</th><th>Location</th><th>Status</th>
                <th>Market Value</th><th>Rent/mo</th><th>Notes</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {archivedProps.map(p => (
                <tr key={p.id} style={{ opacity: 0.65 }}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.type || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.city}, {p.province}</td>
                  <td><span className={`property-badge ${p.status?.toLowerCase()}`}>{p.status}</span></td>
                  <td>{fmt(p.market_price)}</td>
                  <td>{p.monthly_rent ? fmt(p.monthly_rent) : '—'}</td>
                  <td><TruncatedCell text={p.notes} /></td>
                  <td>
                    <button className="btn btn-secondary btn-small" onClick={() => onRestore(p.id)}>
                      ↩ Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function PropertiesView({ properties, onPropertyClick, onAddProperty, onEditProperty, onReloadProperties }) {
  const { visible, update: setVisible, col, isCustom, reset } = useColumnVisibility('properties');
  const allColKeys   = COLUMN_DEFS.properties.map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS.properties.map(d => [d.key, d.label]));
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy,       setSortBy]       = useState('name');
  const [sortOrder,    setSortOrder]    = useState('asc');
  const [showArchive,  setShowArchive]  = useState(false);
  const [archivedProps, setArchivedProps] = useState([]);

  // Derive available options from data, merged with seeds
  const allStatuses  = useMemo(() => mergeOptions(INITIAL_OPTIONS.propertyStatuses, properties.map(p => p.status)), [properties]);
  const allTypes     = useMemo(() => mergeOptions(INITIAL_OPTIONS.propertyTypes, properties.map(p => p.type).filter(Boolean)), [properties]);
  const allProvinces = useMemo(() => mergeOptions(PROVINCES, properties.map(p => p.province)), [properties]);
  const allCities    = useMemo(() => [...new Set(properties.map(p => p.city))].sort(), [properties]);

  // Filter selections — initialised to "all selected"; kept in sync when new options appear
  const [filterStatuses,  setFilterStatuses]  = useState(() => allStatuses);
  const [filterTypes,     setFilterTypes]     = useState(() => allTypes);
  const [filterProvinces, setFilterProvinces] = useState(() => allProvinces);
  const [filterCities,    setFilterCities]    = useState(() => allCities);

  useEffect(() => {
    setFilterStatuses(prev => mergeOptions(prev, allStatuses));
  }, [allStatuses]);
  useEffect(() => {
    setFilterTypes(prev => mergeOptions(prev, allTypes));
  }, [allTypes]);
  useEffect(() => {
    setFilterProvinces(prev => mergeOptions(prev, allProvinces));
  }, [allProvinces]);
  useEffect(() => {
    setFilterCities(prev => [...new Set([...prev, ...allCities])].sort());
  }, [allCities]);

  // Load archived properties separately (not in main App state)
  const loadArchived = useCallback(() => {
    fetch(`${API_URL}/properties?archived=1`)
      .then(r => r.ok ? r.json() : [])
      .then(all => setArchivedProps(all.filter(p => p.is_archived)))
      .catch(() => {});
  }, []);

  useEffect(() => { loadArchived(); }, [loadArchived]);

  const handleArchive = async (id) => {
    if (!confirm('Archive this property? It will be hidden from all views but can be restored.')) return;
    const res = await fetch(`${API_URL}/properties/${id}`, { method: 'DELETE' });
    if (res.ok) { onReloadProperties(); loadArchived(); }
    else alert('Failed to archive property');
  };

  const handleRestore = async (id) => {
    const res = await fetch(`${API_URL}/properties/${id}/restore`, { method: 'POST' });
    if (res.ok) { onReloadProperties(); loadArchived(); }
    else alert('Failed to restore property');
  };

  const filtered = useMemo(() => {
    let list = properties.filter(p => {
      const q = searchTerm.toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) &&
               !p.city.toLowerCase().includes(q) &&
               !p.address.toLowerCase().includes(q)) return false;
      if (!filterStatuses.includes(p.status))                   return false;
      if (p.type && !filterTypes.includes(p.type))              return false;
      if (!filterProvinces.includes(p.province))                return false;
      if (allCities.length && !filterCities.includes(p.city))   return false;
      return true;
    });
    list.sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'name':           return dir * a.name.localeCompare(b.name);
        case 'score': {
          const sA = calcSimpleHealth(a).score;
          const sB = calcSimpleHealth(b).score;
          return dir * (sA - sB);
        }
        case 'market_price':   return dir * (a.market_price   - b.market_price);
        case 'monthly_rent':   return dir * (a.monthly_rent   - b.monthly_rent);
        case 'total_income':   return dir * (a.total_income   - b.total_income);
        case 'total_expenses': return dir * (a.total_expenses - b.total_expenses);
        case 'net': return dir * ((a.total_income - a.total_expenses) - (b.total_income - b.total_expenses));
        case 'roi': {
          const rA = a.market_price ? (a.total_income - a.total_expenses) / a.market_price : 0;
          const rB = b.market_price ? (b.total_income - b.total_expenses) / b.market_price : 0;
          return dir * (rA - rB);
        }
        default: return 0;
      }
    });
    return list;
  }, [properties, searchTerm, filterStatuses, filterTypes, filterProvinces, filterCities, sortBy, sortOrder]);

  // Summary bar data: YTD op profit + 3M avg CF + 3M OER (after filtered)
  const [summaryData, setSummaryData] = useState(null);
  useEffect(() => {
    if (!filtered.length) { setSummaryData(null); return; }
    const now      = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ytdEnd   = now;
    const ytdStart = new Date(ytdEnd); ytdStart.setFullYear(ytdStart.getFullYear() - 1);
    const win3Start = new Date(monthStart); win3Start.setMonth(win3Start.getMonth() - 3);
    const inYTD = d => { if (!d) return false; const [y,m,dd] = d.split('-').map(Number); const dt = new Date(y,m-1,dd); return dt >= ytdStart && dt <= ytdEnd; };
    const in3M  = d => { if (!d) return false; const [y,m,dd] = d.split('-').map(Number); const dt = new Date(y,m-1,dd); return dt >= win3Start && dt < monthStart; };

    Promise.all([
      Promise.all(filtered.map(p => fetch(`${API_URL}/income?property_id=${p.id}`).then(r => r.ok ? r.json() : []))),
      Promise.all(filtered.map(p => fetch(`${API_URL}/expenses?property_id=${p.id}`).then(r => r.ok ? r.json() : []))),
    ]).then(([incArrs, expArrs]) => {
      // YTD
      const allInc = incArrs.flat();
      const allExp = expArrs.flat();
      const ytdInc  = allInc.filter(r => inYTD(r.income_date)).reduce((s, r) => s + r.amount, 0);
      const ytdExp  = allExp.filter(r => inYTD(r.expense_date)).reduce((s, r) => s + r.amount, 0);
      const ytdPrin = filtered.reduce((sum, p, i) =>
        sum + principalInRange(expArrs[i], p.loan_amount, p.mortgage_rate || 0, ytdStart, ytdEnd), 0);
      const ytdOpProfit = ytdInc - (ytdExp - ytdPrin);

      // 3M avg CF and OER
      const inc3  = allInc.filter(r => in3M(r.income_date)).reduce((s, r) => s + r.amount, 0);
      const exp3  = allExp.filter(r => in3M(r.expense_date)).reduce((s, r) => s + r.amount, 0);
      const noi3  = allExp.filter(r => in3M(r.expense_date) && !['Mortgage','Principal'].includes(r.expense_category)).reduce((s, r) => s + r.amount, 0);
      const avgCF = (inc3 - exp3) / 3;
      const oer   = inc3 > 0 ? noi3 / inc3 : null;

      setSummaryData({ ytdOpProfit, avgCF, oer });
    }).catch(() => {});
  }, [filtered.map(p => p.id).join(',')]); // eslint-disable-line

  // Summary stats — computed from FILTERED set so they update with filters
  const totalValue    = filtered.reduce((s, p) => s + p.market_price,   0);
  const totalIncome   = filtered.reduce((s, p) => s + p.total_income,   0);
  const totalExpenses = filtered.reduce((s, p) => s + p.total_expenses, 0);
  const netBalance_table = totalIncome - totalExpenses;

  // Smart tips: portfolio-level insights from property records
  const smartTips = useMemo(() => {
    const tips = [];
    if (!filtered.length) return tips;

    const vacant     = filtered.filter(p => p.status === 'Vacant');
    const negative   = filtered.filter(p => {
      const dp = p.purchase_price - p.loan_amount;
      return p.total_income > 0 && (p.total_income - (p.total_expenses - dp)) < 0;
    });
    const highLTV    = filtered.filter(p => p.purchase_price > 0 && p.loan_amount / p.purchase_price > 0.80);
    const noRent     = filtered.filter(p => !p.monthly_rent && p.status === 'Rented');
    const scores     = filtered.map(p => ({ p, s: calcSimpleHealth(p) }));
    const bottomTwo  = [...scores].sort((a, b) => a.s.score - b.s.score).slice(0, 2);
    const strongOnes = scores.filter(x => x.s.score >= 70);

    // Properties with significant positive net position but negative or weak cash flow
    const highNPLowCF = filtered.filter(p => {
      const np = p.market_price + p.total_income - p.total_expenses - p.loan_amount;
      return np > p.market_price * 0.10 && p.total_income > 0;
      // We flag these in tips if avg CF (not available here) is not checkable, so use total balance as proxy
    }).filter(p => (p.total_income - p.total_expenses) < 0);

    const occupancyPct = filtered.filter(p => p.status !== 'Vacant').length / filtered.length * 100;

    if (vacant.length > 0) {
      const lostRent = vacant.reduce((s, p) => s + (p.monthly_rent || 0), 0);
      tips.push({ icon: '🏠', cls: 'text-danger', label: `${vacant.length} vacant propert${vacant.length > 1 ? 'ies' : 'y'}`,
        detail: lostRent > 0
          ? `Losing up to ${fmt(lostRent)}/mo in potential rent. Prioritise filling vacancies to improve cash flow.`
          : `${vacant.length} propert${vacant.length > 1 ? 'ies' : 'y'} with no rental income. Consider marketing or lease incentives.` });
    }

    if (highNPLowCF.length > 0) {
      const names = highNPLowCF.map(p => p.name).join(', ');
      const totalNP = highNPLowCF.reduce((s, p) => s + p.market_price + p.total_income - p.total_expenses - p.loan_amount, 0);
      tips.push({ icon: '💡', cls: 'text-warning', label: `Strong net position, weak cash flow`,
        detail: `${names} ${highNPLowCF.length > 1 ? 'have' : 'has'} a combined net position of ${fmt(totalNP)} but ${highNPLowCF.length > 1 ? 'are' : 'is'} cash-flow-negative. These properties may be worth more sold than held — or rent increases could flip them positive.` });
    }

    if (negative.length > 0) {
      tips.push({ icon: '📉', cls: 'text-danger', label: `${negative.length} cash-flow-negative propert${negative.length > 1 ? 'ies' : 'y'}`,
        detail: `${negative.map(p => p.name).join(', ')} ${negative.length > 1 ? 'are' : 'is'} generating more expenses than income. Review rent pricing and operating costs.` });
    }

    if (highLTV.length > 0) {
      tips.push({ icon: '⚡', cls: 'text-warning', label: `${highLTV.length} high-leverage propert${highLTV.length > 1 ? 'ies' : 'y'}`,
        detail: `${highLTV.map(p => p.name).join(', ')} ${highLTV.length > 1 ? 'have' : 'has'} LTV above 80%. A market correction could erode equity quickly. Consider accelerating principal payments.` });
    }

    if (occupancyPct < 80 && filtered.length > 1) {
      tips.push({ icon: '📊', cls: 'text-warning', label: `Occupancy at ${occupancyPct.toFixed(0)}%`,
        detail: `Only ${filtered.filter(p => p.status !== 'Vacant').length} of ${filtered.length} properties are occupied. Industry target is 90%+. Sustained low occupancy signals a market fit or pricing issue.` });
    }

    if (noRent.length > 0) {
      tips.push({ icon: '⚠️', cls: 'text-warning', label: `${noRent.length} rented propert${noRent.length > 1 ? 'ies' : 'y'} missing rent amount`,
        detail: `Set monthly rent on ${noRent.map(p => p.name).join(', ')} to enable cap rate and vacancy calculations.` });
    }

    if (bottomTwo.length > 0 && filtered.length > 2) {
      const names = bottomTwo.map(x => `${x.p.name} (${x.s.score}/100)`).join(', ');
      tips.push({ icon: '🔻', cls: 'text-warning', label: 'Lowest-scoring properties',
        detail: `${names}. Click on these to see detailed insights and improvement suggestions.` });
    }

    if (strongOnes.length > 0) {
      tips.push({ icon: '🚀', cls: 'text-success', label: `${strongOnes.length} healthy propert${strongOnes.length > 1 ? 'ies' : 'y'}`,
        detail: `${strongOnes.map(x => x.p.name).join(', ')} score 70+ — strong performers across cash flow, yield, and leverage metrics.` });
    }

    if (!tips.length) {
      tips.push({ icon: '✅', cls: 'text-success', label: 'Portfolio looks healthy',
        detail: 'No major issues detected across the filtered properties.' });
    }

    return tips;
  }, [filtered]);



  const totalPurchase  = filtered.reduce((s, p) => s + p.purchase_price, 0);
  const totalBalance   = totalIncome - totalExpenses;
  const totalLoan      = filtered.reduce((s, p) => s + p.loan_amount, 0);
  const totalEquity    = totalValue - totalLoan;
  const totalAppr      = totalValue - totalPurchase;
  const totalApprPct   = totalPurchase > 0 ? totalAppr / totalPurchase * 100 : null;
  const ltvPct         = totalValue > 0 ? totalLoan / totalValue * 100 : null;
  const netPosition    = totalValue + totalIncome - totalExpenses - totalLoan;
  const occupiedCount  = filtered.filter(p => p.status !== 'Vacant').length;
  const occupancyPct   = filtered.length > 0 ? occupiedCount / filtered.length * 100 : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Properties
            {filtered.length < properties.length && (
              <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: '0.6rem' }}>
                ({filtered.length}/{properties.length})
              </span>
            )}
          </h1>
          <p className="page-subtitle">Manage your real estate portfolio</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onAddProperty}>+ Add Property</button>
        </div>
      </div>

      {/* ── Summary bar (always visible) ─────────────────────────────────── */}
      {(() => {
        const sd    = summaryData;
        const ltv   = ltvPct;
        const ltvCls = ltv === null ? '' : ltv < 65 ? 'text-success' : ltv < 80 ? '' : 'text-danger';
        const ltvAcc = ltv === null ? '#6b7280' : ltv < 65 ? '#10b981' : ltv < 80 ? '#f59e0b' : '#ef4444';
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {(() => {
              const apprCls = totalAppr >= 0 ? 'text-success' : 'text-danger';
              const apprSign = totalAppr >= 0 ? '+' : '';
              return <KPICard label="Portfolio Value" primary={fmt(totalValue)}
                secondary={totalAppr !== 0 ? apprSign + fmt(totalAppr) + (totalApprPct !== null ? ' (' + totalApprPct.toFixed(1) + '%)' : '') : null}
                secondaryCls={apprCls}
                accentColor="#3b82f6"
                tooltip={`Sum of current market values across all filtered properties.\nTotal appreciation: ${fmt(totalAppr)} (${totalApprPct !== null ? totalApprPct.toFixed(1) + '%' : 'n/a'} over purchase price of ${fmt(totalPurchase)}.`} />;
            })()}
            <KPICard label="Equity" primary={fmt(totalEquity)}
              primaryCls={totalEquity >= 0 ? 'text-success' : 'text-danger'}
              secondary={ltv !== null ? `LTV ${ltv.toFixed(0)}%` : null}
              secondaryCls={ltvCls}
              accentColor={totalEquity >= 0 ? '#10b981' : '#ef4444'}
              tooltip="Your ownership stake across filtered properties.\nFormula: Total Market Value − Total Loans.\nLTV = Total Loans ÷ Market Value. Below 65%: conservative. 65–80%: normal. Above 80%: high risk — equity is thin." />
            {(() => {
              const npPct = totalBalance !== 0 ? (netPosition / Math.abs(totalBalance) * 100) : null;
              return <KPICard label="Net Position" primary={fmt(netPosition)}
                primaryCls={netPosition >= 0 ? 'text-success' : 'text-danger'}
                secondary={npPct !== null ? npPct.toFixed(1) + '% of net spending' : null}
                secondaryCls={npPct !== null ? (npPct >= 0 ? 'text-success' : 'text-danger') : ''}
                accentColor={netPosition >= 0 ? '#10b981' : '#ef4444'}
                tooltip={`What you'd walk away with selling all filtered properties and clearing their mortgages today.\nFormula: Portfolio Value + All Income − All Expenses − All Loans.\n${npPct !== null ? `% of net spending = Net Position ÷ |Income − Expenses|.` : ''}`} />;
            })()}
            <KPICard label="Occupancy"
              primary={filtered.length ? `${occupancyPct.toFixed(0)}%` : '—'}
              primaryCls={occupancyPct >= 90 ? 'text-success' : occupancyPct >= 70 ? '' : 'text-danger'}
              secondary={`${occupiedCount}/${filtered.length} properties`}
              accentColor={occupancyPct >= 90 ? '#10b981' : occupancyPct >= 70 ? '#f59e0b' : '#ef4444'}
              tooltip="Share of filtered properties currently occupied (not marked Vacant).\nTarget 90%+ for healthy cash flow. Each vacant unit means fixed costs with no income." />
            <KPICard label="Avg Cash Flow" primary={sd ? fmt(sd.avgCF) : '…'}
              primaryCls={!sd ? '' : sd.avgCF >= 0 ? 'text-success' : 'text-danger'}
              tertiary="3-month avg"
              accentColor={!sd ? '#6b7280' : sd.avgCF >= 0 ? '#10b981' : '#ef4444'}
              tooltip="Average monthly profit per property: income minus all expenses (including mortgage) over the last 3 months.\nPositive = cash flowing. Negative = you're topping up from other income." />
            <KPICard label="OER" primary={sd && sd.oer !== null ? `${(sd.oer*100).toFixed(1)}%` : '…'}
              primaryCls={!sd || sd.oer === null ? '' : sd.oer < 0.35 ? 'text-success' : sd.oer < 0.5 ? '' : 'text-danger'}
              tertiary="3-month avg"
              accentColor={!sd || sd.oer === null ? '#6b7280' : sd.oer < 0.35 ? '#10b981' : sd.oer < 0.5 ? '#f59e0b' : '#ef4444'}
              tooltip="Operating Expense Ratio: what fraction of income is consumed by operating costs (excl. mortgage).\n3-month average. Below 35%: efficient. 35–50%: normal. Above 50%: costs are eating your income — review." />
            <KPICard label="Op. Profit"
              primary={sd ? fmt(sd.ytdOpProfit) : '…'}
              primaryCls={!sd ? '' : sd.ytdOpProfit >= 0 ? 'text-success' : 'text-danger'}
              tertiary="YTD"
              accentColor={!sd ? '#6b7280' : sd.ytdOpProfit >= 0 ? '#10b981' : '#ef4444'}
              tooltip="Trailing 12-month income minus operating expenses (principal excluded).\nA good annual snapshot of property profitability — less volatile than shorter windows." />
          </div>
        );
      })()}

      {/* ── Insights (collapsed by default) ───────────────────────────────── */}
      {smartTips.length > 0 && (
        <Collapsible title="💡 Portfolio Insights" defaultOpen={false}>
          <div style={{ padding: '0.5rem 1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {smartTips.map((tip, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                padding: '0.55rem 0.85rem', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
              }}>
                <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0, marginTop: '0.1rem' }}>{tip.icon}</span>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem' }} className={tip.cls}>{tip.label} </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tip.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* ── 2. Analytics (closed by default) ──────────────────────────────── */}
      {properties.length > 0 && (
        <Collapsible title="📈 Analytics" defaultOpen={false}>
          <Analytics filtered={filtered} />
        </Collapsible>
      )}

      {/* ── 3. Properties table with filters + sort ──────────────────────── */}
      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Properties ({filtered.length})</div>
        </div>

        {/* Filters + sort — single row */}
        <div style={{
          padding: '0.6rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center',
        }}>
          <input type="text" placeholder="Search…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 150, fontSize: '0.82rem', padding: '0.38rem 0.6rem' }} />
          <MultiSelect label="Status"   options={allStatuses}  selected={filterStatuses}  onChange={setFilterStatuses} />
          <MultiSelect label="Type"     options={allTypes}     selected={filterTypes}     onChange={setFilterTypes} />
          <MultiSelect label="Province" options={allProvinces} selected={filterProvinces} onChange={setFilterProvinces} />
          {allCities.length > 0 && (
            <MultiSelect label="City" options={allCities} selected={filterCities} onChange={setFilterCities} />
          )}
          <MultiSelect label="Columns" options={allColKeys} selected={visible} onChange={setVisible} labelMap={allColLabels} />
              {isCustom && (
                <button type="button" onClick={reset}
                  style={{ background: 'none', border: 'none', fontSize: '0.75rem',
                    color: 'var(--accent-primary)', cursor: 'pointer', padding: '0 2px',
                    textDecoration: 'underline', opacity: 0.8, whiteSpace: 'nowrap' }}>
                  ↺ reset cols
                </button>
              )}
          {/* Sort pushed to the right */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '0.38rem 0.5rem' }}>
              <option value="name">Name</option>
              <option value="score">Score</option>
              <option value="market_price">Market Value</option>
              <option value="monthly_rent">Rent</option>
              <option value="total_income">Income</option>
              <option value="total_expenses">Expenses</option>
              <option value="net">Net Position</option>
              <option value="roi">ROI</option>
            </select>
            <button className="btn btn-secondary btn-small"
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏢</div>
            <div className="empty-state-text">No properties match the current filters</div>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table>
              <thead>
                <tr>
                  {col('name')         && <th className="col-fill">Name</th>}
                  <th className="col-shrink" title="Investment health score (0–100). Hover each score for details.">Score</th>
                  {col('status')       && <th className="col-shrink">Status</th>}
                  {col('type')         && <th className="col-shrink">Type</th>}
                  {col('location')     && <th className="col-shrink">Location</th>}
                  {col('market_price') && <th className="col-shrink">Mkt Value</th>}
                  {col('monthly_rent') && <th className="col-shrink">Rent/mo</th>}
                  {col('total_income') && <th className="col-shrink">Income</th>}
                  {col('net_expenses') && <th className="col-shrink">Net Exp</th>}
                  {col('net')          && <th className="col-shrink">Net Position</th>}
                  {col('roi')          && <th className="col-shrink">ROI</th>}
                  {col('equity')       && <th className="col-shrink">Equity</th>}
                  {col('loan')         && <th className="col-shrink">Loan</th>}
                  {col('poss_date')    && <th className="col-shrink">Possession</th>}
                  {col('notes')        && <th className="col-fill">Notes</th>}
                  <th style={{ width: 52 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const downPmt = p.purchase_price - p.loan_amount;
                  const netExp  = p.total_expenses - downPmt;
                  const net     = p.total_income - netExp;
                  const roi     = p.market_price ? ((net / p.market_price) * 100).toFixed(1) : null;
                  const equity  = p.market_price - p.loan_amount;
                  const health  = calcSimpleHealth(p);
                  const healthColor = health.score >= 70 ? '#10b981' : health.score >= 40 ? '#f59e0b' : '#ef4444';
                  const healthLabel = health.score >= 70 ? 'Healthy' : health.score >= 40 ? 'Average' : 'Needs Attention';
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onPropertyClick(p)}>
                      {col('name')         && <td className="col-fill"><strong>{p.name}</strong></td>}
                      <td className="col-shrink">
                        <span title={`${health.label} — ${health.score}/100`} style={{
                          display: 'inline-block',
                          width: '2.1rem', textAlign: 'center',
                          fontSize: '0.78rem', fontWeight: 700,
                          padding: '0.15rem 0.3rem', borderRadius: '6px',
                          background: `${healthColor}22`, color: healthColor,
                          cursor: 'default',
                        }}>{health.score}</span>
                      </td>
                      {col('status')       && <td className="col-shrink"><span className={`property-badge ${p.status?.toLowerCase()}`}>{p.status}</span></td>}
                      {col('type')         && <td className="col-shrink">{p.type || '—'}</td>}
                      {col('location')     && <td className="col-shrink"><TruncatedCell text={`${p.city}, ${p.province}`} /></td>}
                      {col('market_price') && <td className="col-shrink">{fmt(p.market_price)}</td>}
                      {col('monthly_rent') && <td className="col-shrink">{p.monthly_rent ? fmt(p.monthly_rent) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>}
                      {col('total_income') && <td className="col-shrink text-success">{fmt(p.total_income)}</td>}
                      {col('net_expenses') && <td className={`col-shrink ${netExp >= 0 ? 'text-danger' : 'text-success'}`}>{fmt(netExp)}</td>}
                      {col('net')          && <td className={`col-shrink ${net >= 0 ? 'text-success' : 'text-danger'}`}>{fmt(net)}</td>}
                      {col('roi')          && <td className={roi !== null && parseFloat(roi) >= 0 ? 'text-success' : 'text-danger'}>{roi !== null ? `${roi}%` : '—'}</td>}
                      {col('equity')       && <td className="col-shrink">{fmt(equity)}</td>}
                      {col('loan')         && <td className="col-shrink">{fmt(p.loan_amount)}</td>}
                      {col('poss_date')    && <td style={{ whiteSpace: 'nowrap' }}>{p.poss_date || '—'}</td>}
                      {col('notes')        && <td className="col-fill" onClick={e => e.stopPropagation()}><TruncatedCell text={p.notes} /></td>}
                      <td onClick={e => e.stopPropagation()}>
                        <div className="row-actions">
                          <button className="btn btn-secondary btn-icon" title="Edit"    onClick={() => onEditProperty(p)}>✏️</button>
                          <button className="btn btn-danger    btn-icon" title="Archive" onClick={() => handleArchive(p.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ArchivedPropertiesSection archivedProps={archivedProps} onRestore={handleRestore} />
    </>
  );
}

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import MetricCard from './MetricCard.jsx';
import FinancialPeriodSection from './FinancialPeriodSection.jsx';
import { fmt, fPct, fp, mc, sn, WindowPicker, wLabel, fmtPeriod, CHART_TOOLTIP_STYLE } from './uiHelpers.jsx';
import { COLORS, API_URL } from '../config.js';
import { avgMonthly, yearsHeld, expGap, monthsLeftInYear } from '../metrics.js';
import { usePortfolioAggregates } from '../hooks.js';
import usePortfolioMetrics from '../hooks/usePortfolioMetrics.js';
const STATUS_COLORS = { Rented: '#10b981', Vacant: '#ef4444', Primary: '#3b82f6' };
const G2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' };

/** Build static chart datasets from property records (no async data needed). */
function buildChartData(list) {
  const incExp = list.map(p => ({
    name: sn(p.name),
    Income: p.total_income, Expenses: p.total_expenses,
    Net: p.total_income - p.total_expenses,
  }));
  const value = list.map(p => ({ name: sn(p.name), Value: p.market_price }));
  const roi   = list.map(p => {
    const net = p.total_income - (p.total_expenses - (p.purchase_price - p.loan_amount));
    return { name: sn(p.name), ROI: p.market_price ? parseFloat((net / p.market_price * 100).toFixed(2)) : 0 };
  });
  const statusCount = list.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
  const status = Object.entries(statusCount).map(([name, value]) => ({ name, value }));
  const equity = list.map(p => ({ name: sn(p.name), Equity: p.market_price - p.loan_amount, Loan: p.loan_amount }));
  const equityPct = list.map(p => ({
    name: sn(p.name),
    EquityPct: p.market_price ? parseFloat(((p.market_price - p.loan_amount) / p.market_price * 100).toFixed(1)) : 0,
  }));
  const appreciation = list.map(p => {
    const appr = p.market_price - p.purchase_price;
    const yrs  = yearsHeld(p);
    return { name: sn(p.name), Appreciation: appr, YearlyAppr: yrs ? parseFloat((appr / yrs).toFixed(0)) : null };
  });
  return { incExp, value, roi, status, equity, equityPct, appreciation };
}

/**
 * Analytics panel — shown inside a Collapsible in PropertiesView.
 *
 * Props:
 *   filtered    — filtered property array
 *   allIncome   — pre-fetched income records (flat, tagged with property_id)
 *   allExpenses — pre-fetched expense records (flat, tagged with property_id)
 */
export default function Analytics({ filtered, allIncome, allExpenses }) {
  const [avgWindow, setAvgWindow] = useState(3);

  // Chart data is derived from property records alone — no async needed.
  // Recomputes whenever the filtered list changes.
  const chartData = useMemo(() => buildChartData(filtered), [filtered]);

  // Aggregated portfolio metrics via shared hook
  const agg = usePortfolioAggregates(filtered, allIncome, allExpenses);

  // Monthly averages via the shared avgMonthly helper
  const avg = useMemo(
    () => avgMonthly(allIncome, allExpenses, avgWindow),
    [allIncome, allExpenses, avgWindow],
  );

  const ml = monthsLeftInYear();
  const m  = usePortfolioMetrics(filtered, avg, agg, ml);

  // ── Analytics-only derived values ─────────────────────────────────────────
  const availEq    = Math.max(0, 0.80 * agg.market - agg.loan);
  const availEqPct = agg.equity > 0 ? availEq / agg.equity * 100 : null;

  const totalMortgage   = avg.mortgage;
  const monthlyInterest = filtered.reduce((s, p) =>
    p.loan_amount > 0 && p.mortgage_rate > 0 ? s + p.loan_amount * p.mortgage_rate / 100 / 12 : s, 0);
  const mortgagePrincipal = totalMortgage > monthlyInterest ? totalMortgage - monthlyInterest : null;

  const npPctA = agg.balance !== 0 ? (agg.sellingProfit / Math.abs(agg.balance) * 100) : null;

  return (
    <div style={{ padding: '1.25rem 1.5rem' }}>

      {/* ── Portfolio Summary ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', paddingTop: '0.25rem' }}>

        {mc({
          label: 'Avail. Equity',
          primary: fmt(availEq),
          primaryCls: availEq > 0 ? 'text-success' : 'text-secondary',
          secondary: availEqPct !== null ? availEqPct.toFixed(1) + '% of ' + fmt(agg.equity) : null,
          secondaryCls: availEq > 0 ? 'text-success' : '',
          tertiary: 'Borrowable at ≤80% LTV',
          tooltip: 'Equity you can access via HELOC or refinance without exceeding 80% LTV.\nFormula: max(0, 80% × Market Value − Loan Balance).',
        })}

        {mc({
          label: 'Mortgage / mo',
          primary: totalMortgage > 0 ? fmt(totalMortgage) : '—',
          secondary: monthlyInterest > 0 ? 'Interest: ' + fmt(Math.round(monthlyInterest)) : null,
          secondaryCls: 'text-danger',
          tertiary: mortgagePrincipal != null && mortgagePrincipal > 0 ? 'Principal: ' + fmt(Math.round(mortgagePrincipal)) : null,
          tooltip: 'Average monthly mortgage payments across all filtered properties (from recorded expense data).\nInterest estimate = loan × rate ÷ 12.',
        })}

        {m.dscr === null
          ? mc({ label: 'DSCR', primary: '—', primaryCls: 'text-secondary', tertiary: 'No mortgage data',
              tooltip: 'Debt Service Coverage requires mortgage expense records.' })
          : mc({
              label: `DSCR (${wLabel(avgWindow)})`,
              primary: m.dscr.toFixed(2) + 'x',
              primaryCls: m.dscr >= 1.25 ? 'text-success' : m.dscr >= 1.0 ? '' : 'text-danger',
              ...expGap(m.dscr, m.expDSCR,
                v => v >= 1.25 ? 'text-success' : v >= 1.0 ? '' : 'text-danger',
                v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
              tertiary: m.dscr >= 1.25 ? 'Healthy' : m.dscr >= 1.0 ? 'Marginal' : 'Below 1x',
              tooltip: 'Debt Service Coverage = avg NOI ÷ avg mortgage.\n≥ 1.25x: comfortable. 1.0–1.25x: marginal. < 1.0x: income doesn\'t cover debt.',
            })}

        {m.icr !== null && mc({
          label: `ICR (${wLabel(avgWindow)})`,
          primary: m.icr.toFixed(2) + 'x',
          primaryCls: m.icr >= 2 ? 'text-success' : m.icr >= 1.25 ? '' : 'text-danger',
          ...expGap(m.icr, m.expICR,
            v => v >= 2 ? 'text-success' : v >= 1.25 ? '' : 'text-danger',
            v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
          tertiary: m.icr >= 2 ? 'Strong' : m.icr >= 1.25 ? 'Adequate' : 'Weak',
          tooltip: 'Interest Coverage Ratio = annualised NOI ÷ total annual interest (loan × rate).\n≥ 2.0x: strong. 1.25–2.0x: adequate. < 1.25x: tight.\nExp uses budgeted operating costs.',
        })}

        {mc({
          label: `Avg Cash Flow (${wLabel(avgWindow)})`,
          primary: fmt(avg.cashflow),
          primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
          ...expGap(avg.cashflow, m.expCF,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
          tooltip: `Average monthly (Income − Expenses) over the last ${avgWindow} complete months.\nExp = budgeted NOI minus avg mortgage.`,
        })}

        {m.oer === null
          ? mc({ label: 'OER', primary: '—', primaryCls: 'text-secondary', tertiary: 'No income in window',
              tooltip: 'Operating Expense Ratio requires income records in the selected window.' })
          : mc({
              label: `OER (${wLabel(avgWindow)})`,
              primary: fPct(m.oer),
              primaryCls: m.oer < 0.35 ? 'text-success' : m.oer < 0.50 ? '' : 'text-danger',
              ...expGap(m.oer, m.expOER, v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false, 0.02),
              tertiary: m.oer < 0.35 ? 'Efficient' : m.oer < 0.50 ? 'Normal' : 'High costs',
              tooltip: 'Operating Expense Ratio = avg op-ex ÷ avg gross income.\nBelow 35%: efficient. 35–50%: normal. Above 50%: review costs.',
            })}

        {mc({
          label: 'YTD Operating Profit',
          primary: fmt(agg.ytdNetBalance),
          primaryCls: agg.ytdNetBalance >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.market > 0 && agg.ytdNetBalance !== 0
            ? fp(agg.ytdNetBalance / agg.market * 100) + ' YTD ROI' : null,
          secondaryCls: agg.ytdNetBalance >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'YTD Income minus YTD Net Expenses (excluding equity-building payments).\nYTD ROI = YTD Operating Profit ÷ Portfolio Value.',
        })}
      </div>

      {/* ── Appreciation ── */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({
          label: 'Total Appreciation', primary: fmt(agg.appr),
          primaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.apprPct !== null && agg.purchase > 0
            ? agg.apprPct.toFixed(1) + '% from ' + fmt(agg.purchase) : null,
          secondaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total unrealised gain: current market value minus original purchase price across all filtered properties.',
        })}

        {mc({
          label: 'Yearly Appreciation',
          primary: fmt(agg.yearlyAppr),
          primaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.yearlyApprPct !== null
            ? (agg.yearlyAppr / agg.purchase * 100).toFixed(1) + '% per year' : null,
          secondaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          ...expGap(agg.yearlyAppr, agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr : null,
            v => v >= 0 ? 'text-success' : 'text-danger',
            v => fmt(v) + (agg.expYearlyApprPct ? ' (' + agg.expYearlyApprPct.toFixed(1) + '%/yr)' : ''),
            'Exp:', true, 500),
          tooltip: 'Annualised appreciation per property, summed.\nExp = sum of (purchase price × expected appreciation %) for properties where that is set.',
        })}

        {mc({
          label: 'Projected Year-End Value', primary: fmt(agg.projectedYE),
          tertiary: 'At current appreciation rate',
          tooltip: 'Current market value plus the remaining fraction of this year times the current annual appreciation rate.',
        })}

        {mc({
          label: 'Year-End Balance',
          primary: fmt(m.runRate),
          primaryCls: m.runRate >= 0 ? 'text-success' : 'text-danger',
          ...(m.budgeted != null ? expGap(m.runRate, m.budgeted,
            v => v >= 0 ? 'text-success' : 'text-danger',
            v => fmt(v), 'Budget:', true, 1000) : {}),
          tooltip: `Projected net position at December 31st if current rates hold.\nRun-rate: current Net Position + avg monthly cash flow × ${ml} months + avg monthly appreciation × ${ml} months.`,
        })}
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
        balance={agg.ytdBal} operatingProfit={agg.ytdNetBalance}
        principal={agg.ytdPrin} scope="filtered" />

      {/* ── Monthly Averages & Key Ratios ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        <p className="stat-section-label" style={{ margin: 0 }}>Monthly Averages &amp; Key Ratios</p>
        <WindowPicker value={avgWindow} onChange={setAvgWindow} />
      </div>

      {/* Row 1: Core income / NOI */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {mc({
          label: `Avg Income (${wLabel(avgWindow)})`,
          primary: fmt(avg.income), primaryCls: 'text-success',
          ...expGap(avg.income, agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent : null,
            () => 'text-success', v => fmt(v), 'Exp:', true, 50),
          tooltip: `Average monthly income over the last ${avgWindow} complete months.\nExp = sum of all current monthly rents at 100% occupancy.`,
        })}
        {mc({
          label: `Avg Expenses (${wLabel(avgWindow)})`,
          primary: fmt(avg.expenses), primaryCls: 'text-danger',
          ...expGap(avg.expenses, agg.totalExpectedOpEx > 0 ? agg.totalExpectedOpEx + avg.mortgage : null,
            v => v < agg.totalMonthlyRent * 0.65 ? '' : v < agg.totalMonthlyRent * 0.85 ? 'text-warning' : 'text-danger',
            v => fmt(v), 'Exp:', false, 50),
          tooltip: `Average monthly expenses over the last ${avgWindow} complete months.\nExp = budgeted op-ex (${agg.propertiesWithExpected} of ${filtered.length} props) + avg mortgage.`,
        })}
        {mc({
          label: `Avg Cash Flow (${wLabel(avgWindow)})`,
          primary: fmt(avg.cashflow),
          primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
          ...expGap(avg.cashflow, m.expCF,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
          tooltip: `Average monthly (Income − Expenses) over the last ${avgWindow} complete months.\nExp = budgeted NOI minus average mortgage.`,
        })}
        {mc({
          label: `Avg NOI (${wLabel(avgWindow)})`,
          primary: fmt(avg.noi),
          primaryCls: avg.noi >= 0 ? 'text-success' : 'text-danger',
          ...expGap(avg.noi, agg.expNOI,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
          tooltip: 'Net Operating Income: income minus op-ex, excluding mortgage and principal.\nExp = total monthly rent minus budgeted op-ex at full occupancy.',
        })}
      </div>

      {/* Row 2: Key investment ratios */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {m.capRate !== null && mc({
          label: `Cap Rate (${wLabel(avgWindow)})`,
          primary: fPct(m.capRate),
          primaryCls: m.capRate > 0.07 ? 'text-success' : m.capRate > 0.04 ? '' : 'text-danger',
          ...expGap(m.capRate, m.expCap,
            v => v > 0.07 ? 'text-success' : v > 0.04 ? '' : 'text-danger', fPct, 'Exp:', true, 0.005),
          tertiary: m.capRate > 0.07 ? 'Strong yield' : m.capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
          tooltip: 'Portfolio Cap Rate = annualised NOI ÷ total market value.\n> 7%: strong. 4–7%: moderate. < 4%: weak.',
        })}
        {m.oer !== null && mc({
          label: `OER (${wLabel(avgWindow)})`,
          primary: fPct(m.oer),
          primaryCls: m.oer < 0.35 ? 'text-success' : m.oer < 0.50 ? '' : 'text-danger',
          ...expGap(m.oer, m.expOER,
            v => v < 0.35 ? 'text-success' : v < 0.50 ? '' : 'text-danger', fPct, 'Exp:', false, 0.02),
          tertiary: m.oer < 0.35 ? 'Efficient' : m.oer < 0.50 ? 'Normal' : 'High costs',
          tooltip: 'Operating Expense Ratio = avg op-ex ÷ avg gross income.\nBelow 35%: efficient. 35–50%: normal. Above 50%: high.',
        })}
        {m.dscr !== null && mc({
          label: `DSCR (${wLabel(avgWindow)})`,
          primary: m.dscr.toFixed(2) + 'x',
          primaryCls: m.dscr >= 1.25 ? 'text-success' : m.dscr >= 1.0 ? 'text-warning' : 'text-danger',
          ...expGap(m.dscr, m.expDSCR,
            v => v >= 1.25 ? 'text-success' : v >= 1.0 ? 'text-warning' : 'text-danger',
            v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
          tertiary: m.dscr >= 1.25 ? 'Healthy coverage' : m.dscr >= 1.0 ? 'Marginal' : 'Below 1x',
          tooltip: 'Debt Service Coverage = avg monthly NOI ÷ avg mortgage.\n≥ 1.25x: healthy. 1.0–1.25x: marginal. < 1.0x: income doesn\'t cover debt.',
        })}
        {m.icr !== null && mc({
          label: `ICR (${wLabel(avgWindow)})`,
          primary: m.icr.toFixed(2) + 'x',
          primaryCls: m.icr >= 2 ? 'text-success' : m.icr >= 1.25 ? '' : 'text-danger',
          ...expGap(m.icr, m.expICR,
            v => v >= 2 ? 'text-success' : v >= 1.25 ? '' : 'text-danger',
            v => v.toFixed(2) + 'x', 'Exp:', true, 0.05),
          tertiary: m.icr >= 2 ? 'Strong' : m.icr >= 1.25 ? 'Adequate' : 'Weak',
          tooltip: 'Interest Coverage Ratio = annualised NOI ÷ total annual interest (loan × rate).\n≥ 2.0x: strong. 1.25–2.0x: adequate. < 1.25x: tight.\nExp uses budgeted operating costs.',
        })}
      </div>

      {/* Row 3: Monthly gain + net position + payback / break-even */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {mc({
          label: 'Monthly Gain', primary: fmt(m.mg),
          primaryCls: m.mg >= 0 ? 'text-success' : 'text-danger',
          ...expGap(m.mg, m.expMG,
            v => v >= 0 ? 'text-success' : 'text-danger', v => fmt(v), 'Exp:', true, 50),
          tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly ÷ 12).\nCaptures income and value growth together.',
        })}
        {mc({
          label: 'Net Position', primary: fmt(agg.sellingProfit),
          primaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
          secondary: npPctA !== null ? npPctA.toFixed(1) + '% of net spending' : null,
          secondaryCls: npPctA !== null ? (npPctA >= 0 ? 'text-success' : 'text-danger') : '',
          tooltip: 'Market Value + Income − Expenses − Loans. Net proceeds if you sold all filtered properties today and cleared all mortgages.',
        })}
        {mc({
          label: 'Payback Period', ...m.payback,
          secondary: m.expPPLabel, secondaryCls: m.expPPLabel ? 'text-success' : '',
          tooltip: `Time until all recorded expenses are recovered by cumulative cash flow.\nNumerator = Total Expenses − Total Income (${fmt(agg.expenses)} − ${fmt(agg.income)}).\nExp uses budgeted cash flow.`,
        })}
        {mc({
          label: 'Break-even', ...m.breakEven,
          secondary: m.expBELabel, secondaryCls: m.expBELabel ? 'text-success' : '',
          tooltip: 'Time until Net Position reaches zero or better.\nUses monthly gain (cash flow + appreciation) to close the gap.\nExp uses budgeted monthly gain.',
        })}
      </div>

      {/* ── Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Income vs Expenses by Property</h2></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.incExp}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
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
              <Pie data={chartData.status} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={75}
                label={({ name, value }) => `${name}: ${value}`}>
                {chartData.status.map((entry, i) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={G2}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Market Value by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData.value}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Bar dataKey="Value" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">ROI by Property (%)</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData.roi}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `${v}%`} />
              <Bar dataKey="ROI">
                {chartData.roi.map((e, i) => <Cell key={i} fill={e.ROI >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={G2}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Equity vs Loan by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData.equity}>
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
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Equity % by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData.equityPct}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `${v}%`} />
              <Bar dataKey="EquityPct">
                {chartData.equityPct.map((e, i) => (
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
            <BarChart data={chartData.appreciation}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Bar dataKey="Appreciation">
                {chartData.appreciation.map((e, i) => (
                  <Cell key={i} fill={e.Appreciation >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Yearly Appreciation by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData.appreciation.filter(d => d.YearlyAppr !== null)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}/yr`} />
              <Bar dataKey="YearlyAppr">
                {chartData.appreciation.filter(d => d.YearlyAppr !== null).map((e, i) => (
                  <Cell key={i} fill={e.YearlyAppr >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

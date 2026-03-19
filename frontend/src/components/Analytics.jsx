import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import MetricCard from './MetricCard.jsx';
import FinancialPeriodSection from './FinancialPeriodSection.jsx';
import { fmt, fPct, fp, sn, WindowPicker, wLabel, fmtPeriod, CHART_TOOLTIP_STYLE } from './uiHelpers.jsx';
import { COLORS, API_URL } from '../config.js';
import { avgMonthly, yearsHeld, expGap, monthsLeftInYear } from '../metrics.js';
import { usePortfolioAggregates } from '../hooks.js';
import usePortfolioMetrics from '../hooks/usePortfolioMetrics.js';
import {
  defAvgIncome, defAvgExpenses, defAvgCashFlow, defAvgNOI,
  defCapRate, defOER, defDSCR, defICR,
  defMonthlyGain, defNetPosition, defPaybackPeriod, defBreakEven,
  defTotalAppreciation, defYearlyAppreciation, defProjectedYearEnd, defYearEndBalance,
  defAvailEquityPortfolio, defMortgagePerMonth, defYtdOpProfit,
} from '../metricDefs.jsx';
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

        {defAvailEquityPortfolio(availEq, availEqPct, agg.equity)}

        {defMortgagePerMonth(totalMortgage, monthlyInterest, mortgagePrincipal)}

        {defDSCR(m.dscr, m.expDSCR, avgWindow)}

        {defICR(m.icr, m.expICR, avgWindow)}

        {defAvgCashFlow(avg.cashflow, m.expCF, avgWindow)}

        {defOER(m.oer, m.expOER, avgWindow)}

        {defYtdOpProfit(agg.ytdNetBalance, agg.market, 'YTD Operating Profit')}
      </div>

      {/* ── Appreciation ── */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {defTotalAppreciation(agg.appr, agg.apprPct, agg.purchase)}
        {defYearlyAppreciation(agg.yearlyAppr, agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr : null, agg.expYearlyApprPct, agg.yearlyApprPct)}
        {defProjectedYearEnd(agg.projectedYE)}
        {defYearEndBalance(m.runRate, m.budgeted, ml)}
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
        {defAvgIncome(avg.income, agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent : null, avgWindow)}
        {defAvgExpenses(avg.expenses, agg.totalExpectedOpEx > 0 ? agg.totalExpectedOpEx + avg.mortgage : null, avgWindow, agg.totalMonthlyRent)}
        {defAvgCashFlow(avg.cashflow, m.expCF, avgWindow)}
        {defAvgNOI(avg.noi, agg.expNOI, avgWindow)}
      </div>

      {/* Row 2: Key investment ratios */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {m.capRate !== null && defCapRate(m.capRate, m.expCap, avgWindow)}
        {defOER(m.oer, m.expOER, avgWindow)}
        {defDSCR(m.dscr, m.expDSCR, avgWindow)}
        {defICR(m.icr, m.expICR, avgWindow)}
      </div>

      {/* Row 3: Monthly gain + net position + payback / break-even */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {defMonthlyGain(m.mg, m.expMG)}
        {defNetPosition(agg.sellingProfit, npPctA)}
        {defPaybackPeriod(m.payback, m.expPPLabel, m.outstanding, agg.income, agg.expenses)}
        {defBreakEven(m.breakEven, m.expBELabel)}
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

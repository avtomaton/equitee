import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
         PieChart, Pie, Cell, LineChart, Line, ReferenceLine, LabelList } from 'recharts';
import FinancialSummaryPanel from './FinancialSummaryPanel.jsx';
import { sn, WindowPicker, CHART_TOOLTIP_STYLE } from './uiHelpers.jsx';
import { COLORS } from '../config.js';
import { avgMonthly, yearsHeld, monthsLeftInYear } from '../metrics.js';
import { usePortfolioAggregates } from '../hooks/usePortfolioAggregates.js';
import usePortfolioMetrics from '../hooks/usePortfolioMetrics.js';
import { cardAvgIncome, cardAvgExpenses, cardAvgCashFlow, cardAvgNOI, cardCapRate, cardOER, cardDSCR, cardICR, cardMonthlyGain, cardNetPosition, cardPaybackPeriod, cardBreakEven, cardTotalAppreciation, cardYearlyAppreciation, cardProjectedYearEnd, cardYearEndBalance, cardAvailEquityPortfolio, cardMortgagePerMonth, cardYtdOpProfit } from '../metricDefs.jsx';
const STATUS_COLORS = { Rented: '#10b981', Vacant: '#ef4444', Primary: '#3b82f6' };
const G2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' };

/** Build static chart datasets from property records (no async data needed). */
function buildChartData(list) {
  const incExp = list.map(p => ({
    name: sn(p.name),
    Income: p.total_income,
    Expenses: p.total_expenses,
  }));
  const value = list.map(p => ({
    name: sn(p.name),
    'Market Value': p.market_price,
    'Purchase Price': p.purchase_price,
  }));
  const roi = list.map(p => {
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
  const capRates = list
    .filter(p => p.purchase_price > 0 && p.monthly_rent > 0)
    .map(p => ({
      name: sn(p.name),
      'Cap Rate': parseFloat(((p.monthly_rent * 12) / p.purchase_price * 100).toFixed(2)),
    }))
    .sort((a, b) => b['Cap Rate'] - a['Cap Rate']);
  const ltv = list
    .filter(p => p.loan_amount > 0 && p.market_price > 0)
    .map(p => ({
      name: sn(p.name),
      LTV: parseFloat((p.loan_amount / p.market_price * 100).toFixed(1)),
    }))
    .sort((a, b) => b.LTV - a.LTV);
  return { incExp, value, roi, status, equity, equityPct, appreciation, capRates, ltv };
}

function buildCashFlowTrend(allIncome, allExpenses, months = 12) {
  const now = new Date();
  const buckets = {};
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    buckets[key] = { month: label, Income: 0, Expenses: 0 };
  }
  allIncome.forEach(r => {
    const key = r.income_date?.slice(0, 7);
    if (buckets[key]) buckets[key].Income += r.amount;
  });
  allExpenses.forEach(r => {
    const key = r.expense_date?.slice(0, 7);
    if (buckets[key]) buckets[key].Expenses += r.amount;
  });
  return Object.values(buckets).map(b => ({
    ...b,
    'Cash Flow': b.Income - b.Expenses,
  }));
}

/**
 * Analytics panel — shown inside a Collapsible in PropertiesView.
 *
 * Props:
 *   filtered    — filtered property array
 *   allIncome   — pre-fetched income records (flat, tagged with property_id)
 *   allExpenses — pre-fetched expense records (flat, tagged with property_id)
 */
export default function Analytics({ filtered, allIncome, allExpenses, allEvents = {} }) {
  const [avgWindow, setAvgWindow] = useState(3);

  // Chart data is derived from property records alone — no async needed.
  // Recomputes whenever the filtered list changes.
  const chartData = useMemo(() => buildChartData(filtered), [filtered]);
  const cashFlowTrend = useMemo(() => buildCashFlowTrend(allIncome, allExpenses, 12), [allIncome, allExpenses]);

  // Aggregated portfolio metrics via shared hook
  const agg = usePortfolioAggregates(filtered, allIncome, allExpenses, allEvents);

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

        {cardAvailEquityPortfolio(availEq, availEqPct, agg.equity)}

        {cardMortgagePerMonth(totalMortgage, monthlyInterest, mortgagePrincipal)}

        {cardDSCR(m.dscr, m.expDSCR, avgWindow)}

        {cardICR(m.icr, m.expICR, avgWindow)}

        {cardAvgCashFlow(avg.cashflow, m.expCF, avgWindow)}

        {cardOER(m.oer, m.expOER, avgWindow)}

        {cardYtdOpProfit(agg.ytdNetBalance, agg.market, 'YTD Operating Profit')}
      </div>

      {/* ── Appreciation ── */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {cardTotalAppreciation(agg.appr, agg.apprPct, agg.purchase)}
        {cardYearlyAppreciation(agg.yearlyAppr, agg.totalExpectedYearlyAppr > 0 ? agg.totalExpectedYearlyAppr : null, agg.expYearlyApprPct, agg.yearlyApprPct)}
        {cardProjectedYearEnd(agg.projectedYE)}
        {cardYearEndBalance(m.runRate, m.budgeted, ml)}
      </div>

      {/* ── Income & Expenses ── */}
      <FinancialSummaryPanel properties={filtered} allIncome={allIncome} allExpenses={allExpenses} allEvents={allEvents} scope="filtered" />

      {/* ── Monthly Averages & Key Ratios ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        <p className="stat-section-label" style={{ margin: 0 }}>Monthly Averages &amp; Key Ratios</p>
        <WindowPicker value={avgWindow} onChange={setAvgWindow} />
      </div>

      {/* Row 1: Core income / NOI */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {cardAvgIncome(avg.income, agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent : null, avgWindow)}
        {cardAvgExpenses(avg.expenses, agg.totalExpectedOpEx > 0 ? agg.totalExpectedOpEx + avg.mortgage : null, avgWindow, agg.totalMonthlyRent)}
        {cardAvgCashFlow(avg.cashflow, m.expCF, avgWindow)}
        {cardAvgNOI(avg.noi, agg.expNOI, avgWindow)}
      </div>

      {/* Row 2: Key investment ratios */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {m.capRate !== null && cardCapRate(m.capRate, m.expCap, avgWindow)}
        {cardOER(m.oer, m.expOER, avgWindow)}
        {cardDSCR(m.dscr, m.expDSCR, avgWindow)}
        {cardICR(m.icr, m.expICR, avgWindow)}
      </div>

      {/* Row 3: Monthly gain + net position + payback / break-even */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {cardMonthlyGain(m.mg, m.expMG)}
        {cardNetPosition(agg.sellingProfit, npPctA)}
        {cardPaybackPeriod(m.payback, m.expPPLabel, m.outstanding, agg.income, agg.expenses)}
        {cardBreakEven(m.breakEven, m.expBELabel)}
      </div>

      {/* ── Charts ── */}

      {/* Row 1: Cash flow trend (full width) + Status donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Monthly Cash Flow — Trailing 12 Months</h2></div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cashFlowTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" tick={{ fontSize: 10 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
              <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 2" />
              <Legend />
              <Line type="monotone" dataKey="Income" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Cash Flow" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Portfolio Status</h2></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={chartData.status} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={52} outerRadius={80}
                  paddingAngle={3}
                  label={false}
                  labelLine={false}>
                  {chartData.status.map((entry, i) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, name) => [v + ' properties', name]} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                  fill="#f3f4f6" fontSize={22} fontWeight={700}>
                  {filtered.length}
                </text>
                <text x="50%" y="50%" dy={18} textAnchor="middle" dominantBaseline="middle"
                  fill="#9ca3af" fontSize={10}>
                  total
                </text>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
              {chartData.status.sort((a, b) => b.value - a.value).map((entry, i) => {
                const total = chartData.status.reduce((s, x) => s + x.value, 0) || 1;
                const color = STATUS_COLORS[entry.name] || COLORS[i % COLORS.length];
                return (
                  <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: color }} />
                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{entry.name}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', minWidth: 32, textAlign: 'right' }}>
                      {(entry.value / total * 100).toFixed(0)}%
                    </span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, minWidth: 20, textAlign: 'right' }}>
                      {entry.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Income vs Expenses | Cap Rate */}
      <div style={G2}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Income vs Expenses by Property</h2></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.incExp} barGap={4} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Income"   fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Cap Rate by Property (%)</h2></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.capRates} layout="vertical" margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
              <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
              <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} width={70} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => [`${v}%`, 'Cap Rate']} />
              <ReferenceLine x={7} stroke="#10b981" strokeDasharray="4 2" label={{ value:'7% target', fill:'#10b981', fontSize:10, position:'insideTopRight' }} />
              <Bar dataKey="Cap Rate" radius={[0,4,4,0]}>
                {chartData.capRates.map((e, i) => (
                  <Cell key={i} fill={e['Cap Rate'] >= 7 ? '#10b981' : e['Cap Rate'] >= 4 ? '#f59e0b' : '#ef4444'} />
                ))}
                <LabelList dataKey="Cap Rate" position="right" formatter={v => `${v}%`} style={{ fill: '#9ca3af', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: Market Value with Purchase Price | ROI */}
      <div style={G2}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Market Value vs Purchase Price</h2></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.value} barGap={4} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Market Value"   fill="#8b5cf6" radius={[4,4,0,0]} />
              <Bar dataKey="Purchase Price" fill="#374151" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">ROI by Property (%)</h2></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.roi} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => [`${v}%`, 'ROI']} />
              <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 2" />
              <ReferenceLine y={8} stroke="#10b981" strokeDasharray="4 2" label={{ value:'8% target', fill:'#10b981', fontSize:10, position:'insideTopRight' }} />
              <Bar dataKey="ROI" radius={[4,4,0,0]}>
                {chartData.roi.map((e, i) => (
                  <Cell key={i} fill={e.ROI >= 8 ? '#10b981' : e.ROI >= 0 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 4: Equity vs Loan | Equity % */}
      <div style={G2}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Equity vs Loan by Property</h2></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.equity} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Equity" stackId="a" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="Loan"   stackId="a" fill="#ef4444" radius={[0,0,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Equity % by Property</h2></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.equityPct} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => [`${v}%`, 'Equity']} />
              <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 2" label={{ value:'50%', fill:'#6b7280', fontSize:10, position:'insideTopRight' }} />
              <ReferenceLine y={80} stroke="#10b981" strokeDasharray="4 2" label={{ value:'80% refi', fill:'#10b981', fontSize:10, position:'insideTopRight' }} />
              <Bar dataKey="EquityPct" radius={[4,4,0,0]}>
                {chartData.equityPct.map((e, i) => (
                  <Cell key={i} fill={e.EquityPct >= 80 ? '#10b981' : e.EquityPct >= 50 ? '#f59e0b' : '#ef4444'} />
                ))}
                <LabelList dataKey="EquityPct" position="top" formatter={v => `${v}%`} style={{ fill: '#9ca3af', fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 5: Appreciation | LTV comparison */}
      <div style={{ ...G2, marginBottom: 0 }}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Appreciation by Property</h2></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.appreciation} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [`$${Number(v).toLocaleString()}`, n]} />
              <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 2" />
              <Legend />
              <Bar dataKey="Appreciation" name="Total" radius={[4,4,0,0]}>
                {chartData.appreciation.map((e, i) => (
                  <Cell key={i} fill={e.Appreciation >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
              <Bar dataKey="YearlyAppr" name="Per Year" radius={[4,4,0,0]}>
                {chartData.appreciation.map((e, i) => (
                  <Cell key={i} fill={e.YearlyAppr != null ? (e.YearlyAppr >= 0 ? '#3b82f6' : '#f59e0b') : 'transparent'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Loan-to-Value by Property (%)</h2></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.ltv} layout="vertical" margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
              <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} width={70} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => [`${v}%`, 'LTV']} />
              <ReferenceLine x={65} stroke="#10b981" strokeDasharray="4 2" label={{ value:'65%', fill:'#10b981', fontSize:10, position:'insideTopRight' }} />
              <ReferenceLine x={80} stroke="#ef4444" strokeDasharray="4 2" label={{ value:'80%', fill:'#ef4444', fontSize:10, position:'insideTopRight' }} />
              <Bar dataKey="LTV" radius={[0,4,4,0]}>
                {chartData.ltv.map((e, i) => (
                  <Cell key={i} fill={e.LTV <= 65 ? '#10b981' : e.LTV <= 80 ? '#f59e0b' : '#ef4444'} />
                ))}
                <LabelList dataKey="LTV" position="right" formatter={v => `${v}%`} style={{ fill: '#9ca3af', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

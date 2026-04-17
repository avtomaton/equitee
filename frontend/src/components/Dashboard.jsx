import { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import PropertyCard from './PropertyCard.jsx';
import KPICard from './KPICard.jsx';
import { fmt, fp, sn, fmtDate, SectionLabel, WindowPicker, ltvColor, CHART_TOOLTIP_STYLE } from './uiHelpers.jsx';
import FinancialSummaryPanel from './FinancialSummaryPanel.jsx';
import { avgMonthly, monthsLeftInYear } from '../metrics.js';
import { getTenants } from '../api.js';
import { isCurrentTenant, parseLocalDate } from '../utils.js';
import { usePortfolioAggregates } from '../hooks/usePortfolioAggregates.js';
import usePortfolioMetrics from '../hooks/usePortfolioMetrics.js';
import usePropertyTransactions from '../hooks/usePropertyTransactions.js';
import { cardAvgIncome, cardAvgExpenses, cardAvgCashFlow, cardAvgNOI, cardCapRate, cardOER, cardDSCR, cardICR, cardMonthlyGain, cardNetPosition, cardPaybackPeriod, cardBreakEven, cardTotalAppreciation, cardYearlyAppreciation, cardProjectedYearEnd, cardYearEndBalance } from '../metricDefs.jsx';
import GroupSelector from './GroupSelector.jsx';

export default function Dashboard({ properties, onPropertyClick, activeGroupId, onGroupChange }) {
  const { allIncome, allExpenses, allEvents } = usePropertyTransactions(properties);
  const [avgWindow,       setAvgWindow]       = useState(3);
  const [expiringLeases,  setExpiringLeases]  = useState([]);

  // Fetch leases expiring within 90 days
  useEffect(() => {
    getTenants().then(tenants => {
      const today = new Date();
      const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 90);
      const expiring = tenants.filter(t => {
        if (!t.lease_end || !isCurrentTenant(t)) return false;
        const end = parseLocalDate(t.lease_end);
        return end && end >= today && end <= cutoff;
      }).sort((a, b) => parseLocalDate(a.lease_end) - parseLocalDate(b.lease_end));
      setExpiringLeases(expiring);
    }).catch(() => {});
  }, [properties]);

  const agg = usePortfolioAggregates(properties, allIncome, allExpenses, allEvents);

  const avg = useMemo(() =>
    avgMonthly(allIncome, allExpenses, avgWindow),
  [allIncome, allExpenses, avgWindow]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const cashFlowTrend = useMemo(() => {
    const now = new Date(), buckets = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      buckets[key] = { month: d.toLocaleString('default', { month: 'short', year: '2-digit' }), Income: 0, Expenses: 0 };
    }
    allIncome.forEach(r => { const k = r.income_date?.slice(0,7); if (buckets[k]) buckets[k].Income += r.amount; });
    allExpenses.forEach(r => { const k = r.expense_date?.slice(0,7); if (buckets[k]) buckets[k].Expenses += r.amount; });
    return Object.values(buckets).map(b => ({ ...b, 'Cash Flow': b.Income - b.Expenses }));
  }, [allIncome, allExpenses]);
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
        <GroupSelector value={activeGroupId} onChange={onGroupChange} />
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

      {/* ── Income & Expenses ── */}
      <FinancialSummaryPanel properties={properties} allIncome={allIncome} allExpenses={allExpenses} allEvents={allEvents} scope="portfolio" />

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

      {/* ── Lease Expiry Alerts ── */}
      {expiringLeases.length > 0 && (
        <div className="table-container" style={{ marginBottom: '1.5rem' }}>
          <div className="table-header">
            <div className="table-title" style={{ color: 'var(--color-warning, #f59e0b)' }}>
              ⚠️ Leases Expiring Soon ({expiringLeases.length})
            </div>
          </div>
          <div style={{ padding: '0.5rem 1.25rem 1rem' }}>
            {expiringLeases.map(t => {
              const end = parseLocalDate(t.lease_end);
              const days = Math.round((end - new Date()) / 86400000);
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>{t.name}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t.property_name}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Expires {fmtDate(t.lease_end)}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: days <= 30 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                    color: days <= 30 ? 'var(--danger)' : '#f59e0b' }}>
                    {days}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Charts ── */}
      {properties.length > 0 && (<>
        <div className="chart-container">
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

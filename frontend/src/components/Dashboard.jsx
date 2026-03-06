import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import PropertyCard from './PropertyCard.jsx';
import MetricCard from './MetricCard.jsx';
import { API_URL, calcMetrics, avgMonthly, yearsHeld, principalInRange } from '../config.js';

const TT  = { background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' };
const fmt  = n  => `$${Math.round(n).toLocaleString()}`;
const fmtP = n  => `${Number(n).toFixed(1)}%`;
const sn   = s  => s.length > 14 ? s.slice(0, 14) + '\u2026' : s;

const WINDOW_OPTIONS = [1, 2, 3, 6, 12];

export default function Dashboard({ properties, onPropertyClick }) {
  const [allIncome,   setAllIncome]   = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [avgWindow,   setAvgWindow]   = useState(3);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    if (!properties.length) return;
    setLoading(true);
    Promise.all([
      ...properties.map(p =>
        fetch(`${API_URL}/income?property_id=${p.id}`).then(r => r.ok ? r.json() : [])
          .then(d => d.map(i => ({ ...i, property_id: p.id })))
      ),
    ]).then(results => setAllIncome(results.flat()))
      .catch(() => {});
    Promise.all([
      ...properties.map(p =>
        fetch(`${API_URL}/expenses?property_id=${p.id}`).then(r => r.ok ? r.json() : [])
          .then(d => d.map(e => ({ ...e, property_id: p.id })))
      ),
    ]).then(results => { setAllExpenses(results.flat()); setLoading(false); })
      .catch(() => setLoading(false));
  }, [properties.map(p => p.id).join(',')]);

  // Portfolio-wide metrics
  const agg = useMemo(() => {
    const market      = properties.reduce((s, p) => s + p.market_price,   0);
    const purchase    = properties.reduce((s, p) => s + p.purchase_price, 0);
    const loan        = properties.reduce((s, p) => s + p.loan_amount,    0);
    const income      = properties.reduce((s, p) => s + p.total_income,   0);
    const expenses    = properties.reduce((s, p) => s + p.total_expenses, 0);
    const equity      = market - loan;
    const equityPct   = market > 0 ? equity / market * 100 : null;
    const loanPct     = market > 0 ? loan   / market * 100 : null;
    const appr        = market - purchase;
    const apprPct     = purchase > 0 ? appr / purchase * 100 : null;
    const yearlyAppr  = properties.reduce((s, p) => {
      const yrs = yearsHeld(p);
      return yrs ? s + (p.market_price - p.purchase_price) / yrs : s;
    }, 0);
    const yearlyApprPct = purchase > 0 ? yearlyAppr / purchase * 100 : null;

    const now = new Date();
    const yearFrac = (now - new Date(now.getFullYear(), 0, 1)) / (365.25 * 86400000);
    const projectedYE = market + appr * (1 - yearFrac);

    const totalNetExp  = properties.reduce((s, p) => {
      return s + (p.total_expenses - (p.purchase_price - p.loan_amount));
    }, 0);
    const netProfit    = income - totalNetExp;
    const balance      = income - expenses;
    const roi           = market > 0 ? netProfit / market * 100 : null;
    const sellingProfit = properties.reduce((s, p) =>
      s + p.market_price + p.total_income - p.total_expenses - p.loan_amount, 0);
    const sellingPct    = expenses > 0
      ? (sellingProfit / expenses * 100).toFixed(1) : null;

    // YTD (trailing 12mo)
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
    const ytdPrin = properties.reduce((sum, p) => {
      const propExp = allExpenses.filter(r => r.property_id === p.id);
      return sum + principalInRange(propExp, p.loan_amount, p.mortgage_rate || 0, ytdStart, ytdEnd);
    }, 0);
    const ytdNetExp    = ytdExp  - ytdPrin;
    const ytdNetProfit = ytdInc  - ytdNetExp;

    return {
      market, purchase, loan, income, expenses, equity, equityPct, loanPct,
      appr, apprPct, yearlyAppr, yearlyApprPct, projectedYE,
      totalNetExp, netProfit, balance, roi, sellingProfit, sellingPct,
      ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdNetProfit,
    };
  }, [properties, allIncome, allExpenses]);

  // Monthly averages
  const avg = useMemo(() =>
    avgMonthly(allIncome, allExpenses, avgWindow),
  [allIncome, allExpenses, avgWindow]);

  // Per-property avg cash flow for PropertyCard (use 3-month window)
  const perPropAvg = useMemo(() => {
    const map = {};
    for (const p of properties) {
      const inc = allIncome.filter(r   => r.property_id === p.id);
      const exp = allExpenses.filter(r => r.property_id === p.id);
      map[p.id] = avgMonthly(inc, exp, 3);
    }
    return map;
  }, [properties, allIncome, allExpenses]);

  // Chart data
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

  const mc = (props) => <MetricCard {...props} style={{ flex: '1 1 150px', minWidth: 140 }} />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Portfolio overview and performance</p>
        </div>
      </div>

      {/* ── Value & Equity ── */}
      <p className="stat-section-label">Value &amp; Equity</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Portfolio Value', primary: fmt(agg.market),
          tooltip: 'Sum of current market values.' })}
        {mc({ label: 'Equity', primary: fmt(agg.equity),
          primaryCls: agg.equity >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.equityPct !== null ? fmtP(agg.equityPct) + ' of value' : null,
          secondaryCls: agg.equityPct !== null && agg.equityPct >= 50 ? 'text-success' : '',
          tooltip: 'Market Value \u2212 Loan.\nPercentage shows equity as share of market value.' })}
        {mc({ label: 'Total Loan', primary: fmt(agg.loan),
          primaryCls: 'text-danger',
          secondary: agg.loanPct !== null ? fmtP(agg.loanPct) + ' of value' : null,
          tooltip: 'Outstanding loan balances. Percentage of portfolio value.' })}
      </div>

      {/* ── Appreciation ── */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Appreciation', primary: fmt(agg.appr),
          primaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.apprPct !== null ? fmtP(agg.apprPct) + ' of purchase' : null,
          secondaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value \u2212 Purchase Price.' })}
        {mc({ label: 'Yearly Appreciation', primary: fmt(agg.yearlyAppr) + '/yr',
          primaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.yearlyApprPct !== null ? fmtP(agg.yearlyApprPct) + '/yr of purchase' : null,
          secondaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Annualized appreciation per property, summed.\nProperties without possession date excluded.' })}
        {mc({ label: 'Projected Year-End', primary: fmt(agg.projectedYE),
          tertiary: 'Based on current yearly appreciation rate',
          tooltip: 'Current market value + remaining year fraction \u00d7 yearly appreciation.' })}
      </div>

      {/* ── Income & Expenses (all-time) ── */}
      <p className="stat-section-label">Income &amp; Expenses (all-time)</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Income',   primary: fmt(agg.income),   primaryCls: 'text-success',
          tooltip: 'All recorded income.' })}
        {mc({ label: 'Total Expenses', primary: fmt(agg.expenses), primaryCls: 'text-danger',
          tooltip: 'All recorded expenses including principal payments.' })}
        {mc({ label: 'Total Balance',  primary: fmt(agg.balance),
          primaryCls: agg.balance >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total Income \u2212 Total Expenses (raw balance, no adjustments).' })}
        {mc({ label: 'Net Expenses',   primary: fmt(agg.totalNetExp),
          primaryCls: agg.totalNetExp >= 0 ? 'text-danger' : 'text-success',
          tooltip: 'Total Expenses \u2212 Down Payments.\nOperating costs above initial capital.' })}
        {mc({ label: 'Net Profit',     primary: fmt(agg.netProfit),
          primaryCls: agg.netProfit >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.roi !== null ? fmtP(agg.roi) + ' ROI' : null,
          secondaryCls: agg.roi !== null && agg.roi >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total Income \u2212 Net Expenses.\nROI = Net Profit \u00f7 Portfolio Value.' })}
        {mc({ label: 'Selling Profit', primary: fmt(agg.sellingProfit),
          primaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.sellingPct !== null ? fmtP(parseFloat(agg.sellingPct)) + ' of exp' : null,
          secondaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value + Income \u2212 Expenses \u2212 Loan.\nNet proceeds if you sold today.' })}
      </div>

      {/* ── YTD (trailing 12 months) ── */}
      <p className="stat-section-label">YTD — trailing 12 months</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'YTD Income',      primary: fmt(agg.ytdInc),  primaryCls: 'text-success',
          tooltip: 'Income recorded in the last 12 months.' })}
        {mc({ label: 'YTD Expenses',    primary: fmt(agg.ytdExp),  primaryCls: 'text-danger',
          tooltip: 'Expenses recorded in the last 12 months.' })}
        {mc({ label: 'YTD Balance',     primary: fmt(agg.ytdBal),
          primaryCls: agg.ytdBal >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'YTD Income \u2212 YTD Expenses.' })}
        {mc({ label: 'YTD Principal',   primary: agg.ytdPrin > 0 ? fmt(agg.ytdPrin) : '\u2014',
          tertiary: 'From Principal expense records',
          tooltip: 'Principal payments recorded in the last 12 months.\nAdd expenses with category "Principal" to track this.' })}
        {mc({ label: 'YTD Net Expenses',primary: fmt(agg.ytdNetExp),
          primaryCls: agg.ytdNetExp >= 0 ? 'text-danger' : 'text-success',
          tooltip: 'YTD Expenses \u2212 YTD Principal paid.' })}
        {mc({ label: 'YTD Net Profit',  primary: fmt(agg.ytdNetProfit),
          primaryCls: agg.ytdNetProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'YTD Income \u2212 YTD Net Expenses.' })}
      </div>

      {/* ── Monthly averages ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        <p className="stat-section-label" style={{ margin: 0 }}>Monthly Averages</p>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>window:</span>
        {WINDOW_OPTIONS.map(w => (
          <button key={w} type="button"
            onClick={() => setAvgWindow(w)}
            style={{
              padding: '0.2rem 0.5rem', borderRadius: '5px', fontSize: '0.78rem', cursor: 'pointer',
              background: avgWindow === w ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: avgWindow === w ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${avgWindow === w ? 'var(--accent-primary)' : 'var(--border)'}`,
            }}>{w}M</button>
        ))}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          (excludes current month)
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {mc({ label: `Avg Monthly Income (${avgWindow}M)`,   primary: fmt(avg.income),   primaryCls: 'text-success',
          tooltip: `Average monthly income over the last ${avgWindow} complete months.` })}
        {mc({ label: `Avg Monthly Expenses (${avgWindow}M)`, primary: fmt(avg.expenses), primaryCls: 'text-danger',
          tooltip: `Average monthly expenses over the last ${avgWindow} complete months.` })}
        {mc({ label: `Avg Cash Flow (${avgWindow}M)`,        primary: fmt(avg.cashflow),
          primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
          tooltip: `Average monthly (Income \u2212 Expenses) over the last ${avgWindow} complete months.` })}
        {(() => {
          const monthlyAppr = agg.yearlyAppr / 12;
          const mg = avg.cashflow + monthlyAppr;
          return mc({ label: 'Monthly Gain', primary: fmt(mg) + '/mo',
            primaryCls: mg >= 0 ? 'text-success' : 'text-danger',
            tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly / 12).\nCaptures income and value growth in one number.' });
        })()}
        {(() => {
          const sp = agg.sellingProfit; const cf = avg.cashflow;
          let label, cls;
          if (sp <= 0)      { label = '—'; cls = ''; }
          else if (cf <= 0) { label = cf < 0 ? '∞ (losing)' : '—'; cls = 'text-danger'; }
          else { const mo = sp / cf; label = mo < 12 ? `${Math.round(mo)} mo` : `${(mo/12).toFixed(1)} yr`; cls = mo < 24 ? 'text-success' : mo < 60 ? '' : 'text-danger'; }
          return mc({ label: 'Time to Sell Profit', primary: label, primaryCls: cls,
            tooltip: 'Months of avg cash flow to equal portfolio selling profit.' });
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
            <PropertyCard key={p.id} property={p} avgCashFlow={perPropAvg[p.id]?.cashflow} onClick={() => onPropertyClick(p)} />
          ))}
        </div>
      )}
    </>
  );
}

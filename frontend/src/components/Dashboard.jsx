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

// Section-header separator
const SectionLabel = ({ children, style }) => (
  <p className="stat-section-label" style={style}>{children}</p>
);

// Highlight card — larger, for top-level KPIs
function KPICard({ label, primary, primaryCls = '', secondary, secondaryCls = '', tertiary, tooltip, accentColor }) {
  const border = accentColor ? `2px solid ${accentColor}` : '1px solid var(--border)';
  return (
    <div className="metric-card" style={{ flex: '1 1 170px', minWidth: 155, borderTop: border }}>
      <div className="metric-label">{label}</div>
      <div className={`metric-primary ${primaryCls}`}>{primary}</div>
      {secondary && <div className={`metric-secondary ${secondaryCls}`}>{secondary}</div>}
      {tertiary  && <div className="metric-tertiary">{tertiary}</div>}
    </div>
  );
}

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

  // Portfolio-wide aggregate metrics
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
    const roi          = market > 0 ? netProfit / market * 100 : null;
    const sellingProfit = properties.reduce((s, p) =>
      s + p.market_price + p.total_income - p.total_expenses - p.loan_amount, 0);

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

    // Occupancy: properties not vacant
    const occupied = properties.filter(p => p.status !== 'Vacant').length;
    const occupancyPct = properties.length > 0 ? occupied / properties.length * 100 : null;

    // Per-property YTD income map (for economic vacancy on cards)
    const ytdIncomeByProp = {};
    properties.forEach(p => {
      ytdIncomeByProp[p.id] = allIncome
        .filter(r => r.property_id === p.id && inYTD(r.income_date))
        .reduce((s, r) => s + r.amount, 0);
    });

    // Potential (rent-based) portfolio monthly rent
    const totalMonthlyRent = properties.reduce((s, p) => s + (p.monthly_rent || 0), 0);

    return {
      market, purchase, loan, income, expenses, equity, equityPct, loanPct,
      appr, apprPct, yearlyAppr, yearlyApprPct, projectedYE,
      totalNetExp, netProfit, balance, roi, sellingProfit,
      ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdNetProfit,
      occupied, occupancyPct, ytdIncomeByProp, totalMonthlyRent,
    };
  }, [properties, allIncome, allExpenses]);

  // Monthly averages (portfolio-wide)
  const avg = useMemo(() =>
    avgMonthly(allIncome, allExpenses, avgWindow),
  [allIncome, allExpenses, avgWindow]);



  // Per-property avg (3-month window) for PropertyCard
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

      {/* ── Portfolio KPIs ─────────────────────────────────────────────────── */}
      <SectionLabel>Portfolio Snapshot</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <KPICard label="Portfolio Value" primary={fmt(agg.market)}
          accentColor="#3b82f6"
          tooltip="Sum of current market values." />
        <KPICard label="Total Equity" primary={fmt(agg.equity)}
          primaryCls={agg.equity >= 0 ? 'text-success' : 'text-danger'}
          secondary={agg.equityPct !== null ? fmtP(agg.equityPct) + ' of value' : null}
          accentColor="#10b981"
          tooltip="Market Value − Loan. Percentage shows equity share of portfolio value." />
        <KPICard label="Total Loan" primary={fmt(agg.loan)}
          primaryCls="text-danger"
          secondary={agg.loanPct !== null ? fmtP(agg.loanPct) + ' LTV' : null}
          accentColor="#ef4444"
          tooltip="Outstanding loan balances. LTV = loan share of portfolio value." />
        <KPICard label="Occupancy Rate"
          primary={agg.occupancyPct !== null ? fmtP(agg.occupancyPct) : '—'}
          primaryCls={agg.occupancyPct !== null && agg.occupancyPct >= 90 ? 'text-success' : agg.occupancyPct >= 70 ? '' : 'text-danger'}
          secondary={`${agg.occupied} of ${properties.length} properties`}
          accentColor={agg.occupancyPct >= 90 ? '#10b981' : agg.occupancyPct >= 70 ? '#f59e0b' : '#ef4444'}
          tooltip={'Occupied units / total properties.\nCounts any status other than Vacant as occupied.\nTarget: 90%+ for a healthy portfolio.'} />
        <KPICard label="Net Profit" primary={fmt(agg.netProfit)}
          primaryCls={agg.netProfit >= 0 ? 'text-success' : 'text-danger'}
          secondary={agg.roi !== null ? fmtP(agg.roi) + ' ROI' : null}
          secondaryCls={agg.roi !== null && agg.roi >= 0 ? 'text-success' : 'text-danger'}
          accentColor={agg.netProfit >= 0 ? '#10b981' : '#ef4444'}
          tooltip="Total Income − Net Expenses. ROI = Net Profit ÷ Portfolio Value." />
        <KPICard label="Selling Profit" primary={fmt(agg.sellingProfit)}
          primaryCls={agg.sellingProfit >= 0 ? 'text-success' : 'text-danger'}
          accentColor={agg.sellingProfit >= 0 ? '#10b981' : '#ef4444'}
          tooltip="Market Value + Income − Expenses − Loan. Net proceeds if you sold everything today." />
      </div>

      {/* ── Appreciation ─────────────────────────────────────────────────────── */}
      <SectionLabel>Appreciation</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Appreciation', primary: fmt(agg.appr),
          primaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.apprPct !== null ? fmtP(agg.apprPct) + ' of purchase' : null,
          secondaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value − Purchase Price.' })}
        {mc({ label: 'Yearly Appreciation', primary: fmt(agg.yearlyAppr) + '/yr',
          primaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.yearlyApprPct !== null ? fmtP(agg.yearlyApprPct) + '/yr of purchase' : null,
          secondaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Annualized appreciation per property, summed. Requires possession date.' })}
        {mc({ label: 'Projected Year-End', primary: fmt(agg.projectedYE),
          tertiary: 'Based on current yearly appreciation rate',
          tooltip: 'Current market value + remaining year fraction × yearly appreciation.' })}
      </div>

      {/* ── Income & Expenses (all-time) ────────────────────────────────────── */}
      <SectionLabel>Income &amp; Expenses (all-time)</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Income',   primary: fmt(agg.income),   primaryCls: 'text-success',
          tooltip: 'All recorded income.' })}
        {mc({ label: 'Total Expenses', primary: fmt(agg.expenses), primaryCls: 'text-danger',
          tooltip: 'All recorded expenses including principal payments.' })}
        {mc({ label: 'Total Balance',  primary: fmt(agg.balance),
          primaryCls: agg.balance >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total Income − Total Expenses (raw balance).' })}
        {mc({ label: 'Net Expenses',   primary: fmt(agg.totalNetExp),
          primaryCls: agg.totalNetExp >= 0 ? 'text-danger' : 'text-success',
          tooltip: 'Total Expenses − Down Payments. Operating costs above initial capital.' })}
        {mc({ label: 'Net Profit',     primary: fmt(agg.netProfit),
          primaryCls: agg.netProfit >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.roi !== null ? fmtP(agg.roi) + ' ROI' : null,
          secondaryCls: agg.roi !== null && agg.roi >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total Income − Net Expenses. ROI = Net Profit ÷ Portfolio Value.' })}
      </div>

      {/* ── YTD (trailing 12 months) ─────────────────────────────────────────── */}
      <SectionLabel>YTD — trailing 12 months</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'YTD Income',      primary: fmt(agg.ytdInc),  primaryCls: 'text-success',
          tooltip: 'Income recorded in the last 12 months.' })}
        {mc({ label: 'YTD Expenses',    primary: fmt(agg.ytdExp),  primaryCls: 'text-danger',
          tooltip: 'Expenses recorded in the last 12 months.' })}
        {mc({ label: 'YTD Balance',     primary: fmt(agg.ytdBal),
          primaryCls: agg.ytdBal >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'YTD Income − YTD Expenses.' })}
        {mc({ label: 'YTD Principal',   primary: agg.ytdPrin > 0 ? fmt(agg.ytdPrin) : '\u2014',
          tertiary: 'From Principal expense records',
          tooltip: 'Principal payments recorded in the last 12 months.' })}
        {mc({ label: 'YTD Net Expenses',primary: fmt(agg.ytdNetExp),
          primaryCls: agg.ytdNetExp >= 0 ? 'text-danger' : 'text-success',
          tooltip: 'YTD Expenses − YTD Principal paid.' })}
        {mc({ label: 'YTD Net Profit',  primary: fmt(agg.ytdNetProfit),
          primaryCls: agg.ytdNetProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'YTD Income − YTD Net Expenses.' })}
      </div>

      {/* ── Monthly Averages ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        <SectionLabel style={{ margin: 0 }}>Monthly Averages &amp; Key Ratios</SectionLabel>
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

      {/* Row 1: Core monthly metrics */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {mc({ label: `Avg Income (${avgWindow}M)`,   primary: fmt(avg.income),   primaryCls: 'text-success',
          secondary: agg.totalMonthlyRent > 0 ? `Potential: ${fmt(agg.totalMonthlyRent)}/mo` : null,
          secondaryCls: agg.totalMonthlyRent > 0
            ? (avg.income >= agg.totalMonthlyRent * 0.92 ? 'text-success' : avg.income >= agg.totalMonthlyRent * 0.75 ? 'text-warning' : 'text-danger')
            : '',
          tooltip: `Average monthly income over the last ${avgWindow} complete months.\n"Potential" is sum of all monthly rents — shows the income gap if any vacancy exists.` })}
        {mc({ label: `Avg Expenses (${avgWindow}M)`, primary: fmt(avg.expenses), primaryCls: 'text-danger',
          tooltip: `Average monthly expenses over the last ${avgWindow} complete months.` })}
        {mc({ label: `Avg Cash Flow (${avgWindow}M)`, primary: fmt(avg.cashflow),
          primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
          tooltip: `Average monthly (Income − Expenses) over the last ${avgWindow} complete months.` })}
        {(() => {
          const potentialNOI = agg.totalMonthlyRent > 0 ? agg.totalMonthlyRent - avg.noiExpenses : null;
          return mc({ label: `Avg NOI (${avgWindow}M)`, primary: fmt(avg.noi),
            primaryCls: avg.noi >= 0 ? 'text-success' : 'text-danger',
            secondary: potentialNOI !== null ? `Potential: ${fmt(potentialNOI)}/mo` : 'Excl. mortgage & principal',
            secondaryCls: potentialNOI !== null
              ? (avg.noi >= potentialNOI * 0.92 ? 'text-success' : avg.noi >= potentialNOI * 0.75 ? 'text-warning' : 'text-danger')
              : '',
            tooltip: `Net Operating Income: avg monthly income minus all operating expenses, excluding mortgage and principal.\nFinancing-agnostic — useful for comparing asset performance regardless of how the property is financed.\n"Potential" = total monthly rent minus avg operating expenses (100% occupancy benchmark).\nAverage over the last ${avgWindow} complete months.` });
        })()}
      </div>

      {/* Row 2: Key investment ratios */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
        {(() => {
          const annualNOI      = avg.noi * 12;
          const capRate        = agg.market > 0 ? annualNOI / agg.market : null;
          const potentialNOI   = agg.totalMonthlyRent > 0 ? (agg.totalMonthlyRent - avg.noiExpenses) * 12 : null;
          const potentialCap   = (potentialNOI !== null && agg.market > 0) ? potentialNOI / agg.market : null;
          const oer            = avg.income > 0 ? avg.noiExpenses / avg.income : null;
          const potentialOER   = agg.totalMonthlyRent > 0 ? avg.noiExpenses / agg.totalMonthlyRent : null;
          const dscr           = avg.mortgage > 0 ? avg.noi / avg.mortgage : null;
          return (<>
            {capRate !== null && mc({
              label: `Cap Rate (${avgWindow}M)`,
              primary: `${(capRate * 100).toFixed(1)}%`,
              primaryCls: capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger',
              secondary: potentialCap !== null ? `Potential: ${(potentialCap * 100).toFixed(1)}%` : null,
              secondaryCls: potentialCap !== null
                ? (capRate >= potentialCap * 0.92 ? 'text-success' : capRate >= potentialCap * 0.75 ? 'text-warning' : 'text-danger')
                : '',
              tertiary: capRate > 0.07 ? 'Strong' : capRate > 0.04 ? 'Moderate' : 'Weak',
              tooltip: `Portfolio Cap Rate = annualised NOI ÷ total market value.\nActual uses recorded income. "Potential" uses total monthly rent at 100% occupancy.\nGap reveals revenue lost to vacancy or non-payment across the portfolio.` })}
            {oer !== null && mc({
              label: `OER (${avgWindow}M)`,
              primary: `${(oer * 100).toFixed(1)}%`,
              primaryCls: oer < 0.35 ? 'text-success' : oer < 0.50 ? '' : 'text-danger',
              secondary: potentialOER !== null ? `On rent: ${(potentialOER * 100).toFixed(1)}%` : null,
              secondaryCls: potentialOER !== null
                ? (potentialOER < 0.35 ? 'text-success' : potentialOER < 0.50 ? '' : 'text-danger')
                : '',
              tertiary: oer < 0.35 ? 'Efficient' : oer < 0.50 ? 'Normal' : 'High costs',
              tooltip: `Operating Expense Ratio = avg monthly operating costs ÷ avg monthly income.\n"On rent" uses total monthly rent as denominator for a vacancy-neutral view.\nBelow 35%: lean. 35–50%: normal. Above 50%: review costs.` })}
            {dscr !== null && mc({
              label: `DSCR (${avgWindow}M)`,
              primary: dscr.toFixed(2) + 'x',
              primaryCls: dscr >= 1.25 ? 'text-success' : dscr >= 1.0 ? 'text-warning' : 'text-danger',
              tertiary: dscr >= 1.25 ? 'Healthy coverage' : dscr >= 1.0 ? 'Marginal' : 'Below 1x',
              tooltip: `Debt Service Coverage Ratio = avg monthly NOI ÷ avg monthly mortgage payments.\n≥ 1.25x: healthy. 1.0–1.25x: marginal. < 1.0x: income doesn't cover debt service.` })}
          </>);
        })()}
      </div>

      {/* Row 3: Gain + Time to Profit */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {(() => {
          const monthlyAppr = agg.yearlyAppr / 12;
          const mg = avg.cashflow + monthlyAppr;
          return mc({ label: 'Monthly Gain', primary: fmt(mg) + '/mo',
            primaryCls: mg >= 0 ? 'text-success' : 'text-danger',
            tooltip: 'Avg Cash Flow + Monthly Appreciation (yearly / 12). Captures income and value growth in one number.' });
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

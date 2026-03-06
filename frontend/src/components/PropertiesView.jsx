import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import { INITIAL_OPTIONS, PROVINCES, mergeOptions, COLORS, API_URL, COLUMN_DEFS, yearsHeld, principalInRange } from '../config.js';
import { useColumnVisibility } from '../hooks.js';
import StatCard from './StatCard.jsx';
import MetricCard from './MetricCard.jsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

const TT  = { background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' };
const fmt = (n) => `$${Number(n).toLocaleString()}`;
const pct = (n, d) => d ? `${((n / d) * 100).toFixed(1)}%` : '—';
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
const WINDOW_OPTIONS = [1, 2, 3, 6, 12];

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
    const netProfit    = income - totalNetExp;
    const balance      = income - expenses;
    const roi          = market > 0 ? netProfit / market * 100 : null;
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
    return { market, loan, equity, equityPct, loanPct, appr, apprPct,
             yearlyAppr, yearlyApprPct, projectedYE, monthlyApprAgg,
             income, expenses, balance, totalNetExp, netProfit, roi, sellingProfit, sellingPct,
             ytdInc, ytdExp, ytdBal, ytdPrin, ytdNetExp, ytdNetProfit };
  }, [filtered, allIncome, allExpenses]);

  // Monthly averages
  const avg = useMemo(() => {
    const now   = new Date();
    const end   = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(end); start.setMonth(start.getMonth() - avgWindow);
    const inW   = (dateStr) => {
      if (!dateStr) return false;
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt >= start && dt < end;
    };
    const inc  = allIncome.filter(r   => inW(r.income_date)).reduce((s, r) => s + r.amount, 0);
    const exp  = allExpenses.filter(r => inW(r.expense_date)).reduce((s, r) => s + r.amount, 0);
    return { income: inc / avgWindow, expenses: exp / avgWindow, cashflow: (inc - exp) / avgWindow };
  }, [allIncome, allExpenses, avgWindow]);

  const f   = n => `$${Math.round(n).toLocaleString()}`;
  const fp  = n => `${Number(n).toFixed(1)}%`;
  const mc  = (props) => <MetricCard {...props} style={{ flex: '1 1 150px', minWidth: 140 }} />;

  const statusColors = { Rented: '#10b981', Vacant: '#ef4444', Primary: '#3b82f6' };

  const G2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' };

  return (
    <div style={{ padding: '1.25rem 1.5rem' }}>

      {/* ── Value & Equity ── */}
      <p className="stat-section-label">Value &amp; Equity</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Portfolio Value', primary: f(agg.market),
          tooltip: 'Sum of market values of filtered properties.' })}
        {mc({ label: 'Equity', primary: f(agg.equity),
          primaryCls: agg.equity >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.equityPct !== null ? fp(agg.equityPct) + ' of value' : null,
          secondaryCls: agg.equityPct !== null && agg.equityPct >= 50 ? 'text-success' : '',
          tooltip: 'Market Value \u2212 Loan.\nPercentage = equity share of portfolio value.' })}
        {mc({ label: 'Total Loan', primary: f(agg.loan), primaryCls: 'text-danger',
          secondary: agg.loanPct !== null ? fp(agg.loanPct) + ' of value' : null,
          tooltip: 'Outstanding loan balances. Percentage of portfolio value.' })}
      </div>

      {/* ── Appreciation ── */}
      <p className="stat-section-label">Appreciation</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Appreciation', primary: f(agg.appr),
          primaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.apprPct !== null ? fp(agg.apprPct) + ' of purchase' : null,
          secondaryCls: agg.appr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value \u2212 Purchase Price.' })}
        {mc({ label: 'Yearly Appreciation', primary: f(agg.yearlyAppr) + '/yr',
          primaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.yearlyApprPct !== null ? fp(agg.yearlyApprPct) + '/yr of purchase' : null,
          secondaryCls: agg.yearlyAppr >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Annualized appreciation, summed across filtered properties.\nRequires possession date.' })}
        {mc({ label: 'Projected Year-End', primary: f(agg.projectedYE),
          tertiary: 'Linear extrapolation via yearly appreciation',
          tooltip: 'Market value + remaining year fraction \u00d7 yearly appreciation.' })}
      </div>

      {/* ── Income & Expenses ── */}
      <p className="stat-section-label">Income &amp; Expenses (all-time)</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'Total Income',   primary: f(agg.income),    primaryCls: 'text-success',
          tooltip: 'All recorded income for filtered properties.' })}
        {mc({ label: 'Total Expenses', primary: f(agg.expenses),  primaryCls: 'text-danger',
          tooltip: 'All recorded expenses including principal payments.' })}
        {mc({ label: 'Total Balance',  primary: f(agg.balance),
          primaryCls: agg.balance >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total Income \u2212 Total Expenses (raw, no adjustments).' })}
        {mc({ label: 'Net Expenses',   primary: f(agg.totalNetExp),
          primaryCls: agg.totalNetExp >= 0 ? 'text-danger' : 'text-success',
          tooltip: 'Total Expenses \u2212 Down Payments.\nOperating costs above initial capital.' })}
        {mc({ label: 'Net Profit', primary: f(agg.netProfit),
          primaryCls: agg.netProfit >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.roi !== null ? fp(agg.roi) + ' ROI' : null,
          secondaryCls: agg.roi !== null && agg.roi >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Total Income \u2212 Net Expenses.\nROI = Net Profit \u00f7 Portfolio Value.' })}
        {mc({ label: 'Selling Profit', primary: f(agg.sellingProfit),
          primaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
          secondary: agg.sellingPct !== null ? fp(parseFloat(agg.sellingPct)) + ' of exp' : null,
          secondaryCls: agg.sellingProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'Market Value + Income \u2212 Expenses \u2212 Loan.' })}
      </div>

      {/* ── YTD ── */}
      <p className="stat-section-label">YTD — trailing 12 months</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {mc({ label: 'YTD Income',      primary: f(agg.ytdInc),  primaryCls: 'text-success' })}
        {mc({ label: 'YTD Expenses',    primary: f(agg.ytdExp),  primaryCls: 'text-danger' })}
        {mc({ label: 'YTD Balance',     primary: f(agg.ytdBal),
          primaryCls: agg.ytdBal >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'YTD Income \u2212 YTD Expenses.' })}
        {mc({ label: 'YTD Principal',   primary: agg.ytdPrin > 0 ? f(agg.ytdPrin) : '\u2014',
          tertiary: 'From Principal expense records',
          tooltip: 'Sum of expenses categorised as Principal in the YTD period.' })}
        {mc({ label: 'YTD Net Exp',     primary: f(agg.ytdNetExp),
          primaryCls: agg.ytdNetExp >= 0 ? 'text-danger' : 'text-success',
          tooltip: 'YTD Expenses \u2212 YTD Principal.' })}
        {mc({ label: 'YTD Net Profit',  primary: f(agg.ytdNetProfit),
          primaryCls: agg.ytdNetProfit >= 0 ? 'text-success' : 'text-danger',
          tooltip: 'YTD Income \u2212 YTD Net Expenses.' })}
      </div>

      {/* ── Monthly averages ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        <p className="stat-section-label" style={{ margin: 0 }}>Monthly Averages</p>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>window:</span>
        {WINDOW_OPTIONS.map(w => (
          <button key={w} type="button" onClick={() => setAvgWindow(w)}
            style={{
              padding: '0.2rem 0.5rem', borderRadius: '5px', fontSize: '0.78rem', cursor: 'pointer',
              background: avgWindow === w ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: avgWindow === w ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${avgWindow === w ? 'var(--accent-primary)' : 'var(--border)'}`,
            }}>{w}M</button>
        ))}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>(excludes current month)</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {mc({ label: `Avg Income (${avgWindow}M)`,   primary: f(avg.income),   primaryCls: 'text-success',
          tooltip: `Average monthly income over the last ${avgWindow} complete months.` })}
        {mc({ label: `Avg Expenses (${avgWindow}M)`, primary: f(avg.expenses), primaryCls: 'text-danger',
          tooltip: `Average monthly expenses over the last ${avgWindow} complete months.` })}
        {mc({ label: `Avg Cash Flow (${avgWindow}M)`,primary: f(avg.cashflow),
          primaryCls: avg.cashflow >= 0 ? 'text-success' : 'text-danger',
          tooltip: `Average monthly net cash flow over the last ${avgWindow} complete months.` })}
        {(() => {
          const mg = avg.cashflow + agg.monthlyApprAgg;
          return mc({ label: 'Monthly Gain', primary: f(mg) + '/mo',
            primaryCls: mg >= 0 ? 'text-success' : 'text-danger',
            tooltip: `Avg Cash Flow + Monthly Appreciation (yearly / 12).\nCaptures income and value growth together.` });
        })()}
        {(() => {
          const sp = agg.sellingProfit;
          const cf = avg.cashflow;
          let label, cls;
          if (sp <= 0)        { label = '—'; cls = ''; }
          else if (cf <= 0)   { label = cf < 0 ? '∞ (losing)' : '—'; cls = 'text-danger'; }
          else { const mo = sp / cf; label = mo < 12 ? `${Math.round(mo)} mo` : `${(mo/12).toFixed(1)} yr`; cls = mo < 24 ? 'text-success' : mo < 60 ? '' : 'text-danger'; }
          return mc({ label: 'Time to Sell Profit', primary: label, primaryCls: cls,
            tooltip: 'Months of avg cash flow needed to equal the total selling profit of filtered properties.' });
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
          \u21bb Refresh charts from current filters
        </button>
      </div>
    </div>
  );
}

// ── Archive section ───────────────────────────────────────────────────────────
function ArchivedPropertiesSection({ archivedProps, onRestore }) {
  const [open, setOpen] = useState(false);
  const fmt = (n) => `$${Number(n).toLocaleString()}`;

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

  // Summary stats — computed from FILTERED set so they update with filters
  const totalValue    = filtered.reduce((s, p) => s + p.market_price,   0);
  const totalIncome   = filtered.reduce((s, p) => s + p.total_income,   0);
  const totalExpenses = filtered.reduce((s, p) => s + p.total_expenses, 0);
  const netProfit     = totalIncome - totalExpenses;

  const summaryCards = [
    { label: 'Shown / Total', value: `${filtered.length} / ${properties.length}` },
    { label: 'Portfolio Value', value: fmt(totalValue) },
    { label: 'Total Income',   value: fmt(totalIncome),   cls: 'text-success' },
    { label: 'Total Expenses', value: fmt(totalExpenses), cls: 'text-danger' },
    { label: 'Net Profit',     value: fmt(netProfit), cls: netProfit >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Overall ROI',    value: totalValue ? pct(netProfit, totalValue) : '—',
      cls: netProfit >= 0 ? 'text-success' : 'text-danger' },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Properties</h1>
          <p className="page-subtitle">Manage your real estate portfolio</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onAddProperty}>+ Add Property</button>
        </div>
      </div>

      {/* ── 1. Summary cards (open by default) ──────────────────────────── */}
      <Collapsible title="📊 Summary" defaultOpen={true}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '1rem',
          padding: '1rem 1.5rem 1.25rem',
        }}>
          {summaryCards.map(({ label, value, cls }) => (
            <div key={label} className="stat-card" style={{ flex: '1 1 140px', minWidth: 130, margin: 0 }}>
              <div className="stat-label">{label}</div>
              <div className={`stat-value ${cls || ''}`} style={{ fontSize: '1.2rem' }}>{value}</div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* ── 2. Analytics (closed by default, refresh button in header) ──── */}
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
              <option value="market_price">Market Value</option>
              <option value="monthly_rent">Rent</option>
              <option value="total_income">Income</option>
              <option value="total_expenses">Expenses</option>
              <option value="net">Net Profit</option>
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
                  {col('status')       && <th className="col-shrink">Status</th>}
                  {col('type')         && <th className="col-shrink">Type</th>}
                  {col('location')     && <th className="col-shrink">Location</th>}
                  {col('market_price') && <th className="col-shrink">Mkt Value</th>}
                  {col('monthly_rent') && <th className="col-shrink">Rent/mo</th>}
                  {col('total_income') && <th className="col-shrink">Income</th>}
                  {col('net_expenses') && <th className="col-shrink">Net Exp</th>}
                  {col('net')          && <th className="col-shrink">Net Profit</th>}
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
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onPropertyClick(p)}>
                      {col('name')         && <td className="col-fill"><strong>{p.name}</strong></td>}
                      {col('status')       && <td className="col-shrink"><span className={`property-badge ${p.status?.toLowerCase()}`}>{p.status}</span></td>}
                      {col('type')         && <td className="col-shrink">{p.type || '—'}</td>}
                      {col('location')     && <td className="col-shrink"><TruncatedCell text={`${p.city}, ${p.province}`} maxWidth={110} /></td>}
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

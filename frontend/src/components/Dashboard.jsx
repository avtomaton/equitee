import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import PropertyCard from './PropertyCard.jsx';
import StatCard from './StatCard.jsx';

const TT = { background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' };

export default function Dashboard({ properties, stats, onPropertyClick }) {
  // Compute portfolio-wide derived metrics
  const totalPurchase     = properties.reduce((s, p) => s + p.purchase_price,  0);
  const totalMarket       = properties.reduce((s, p) => s + p.market_price,    0);
  const totalLoan         = properties.reduce((s, p) => s + p.loan_amount,     0);
  const totalEquity       = totalMarket - totalLoan;
  const totalIncome       = properties.reduce((s, p) => s + p.total_income,    0);
  const totalNetExp       = properties.reduce((s, p) => {
    const downPmt = p.purchase_price - p.loan_amount;
    return s + (p.total_expenses - downPmt);
  }, 0);
  const totalNetProfit    = totalIncome - totalNetExp;
  const totalAppreciation = totalMarket - totalPurchase;

  // Yearly appreciation: weighted by years each property has been held
  const totalYearlyAppr = properties.reduce((s, p) => {
    if (!p.poss_date) return s;
    const [y, m, d] = p.poss_date.split('-').map(Number);
    const yrs = (Date.now() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (yrs <= 0) return s;
    return s + (p.market_price - p.purchase_price) / yrs;
  }, 0);

  const equityPct = totalMarket > 0 ? (totalEquity / totalMarket * 100).toFixed(1) : '—';
  const roi       = totalMarket > 0 ? (totalNetProfit / totalMarket * 100).toFixed(2) : '—';

  const fmt  = n  => `$${Math.round(n).toLocaleString()}`;
  const fmtP = n  => `${Number(n).toFixed(1)}%`;
  const sn   = name => name.length > 14 ? name.slice(0, 14) + '…' : name;

  // Chart data
  const incExpData = properties.map(p => ({
    name:     sn(p.name),
    Income:   p.total_income,
    Expenses: p.total_expenses,
    Net:      p.total_income - p.total_expenses,
  }));

  const appreciationData = properties.map(p => ({
    name:        sn(p.name),
    Appreciation: p.market_price - p.purchase_price,
  }));

  const equityData = properties.map(p => ({
    name:   sn(p.name),
    Equity: p.market_price - p.loan_amount,
    Loan:   p.loan_amount,
  }));

  const summaryCards = [
    { label: 'Properties',      value: properties.length,
      tooltip: 'Total active properties in portfolio.' },
    { label: 'Portfolio Value',  value: fmt(totalMarket),
      tooltip: 'Sum of current market values.' },
    { label: 'Total Equity',     value: fmt(totalEquity),   cls: 'text-success',
      tooltip: 'Market Value \u2212 Loan Amount across all properties.' },
    { label: 'Equity %',         value: `${equityPct}%`,    cls: totalEquity >= 0 ? 'text-success' : 'text-danger',
      tooltip: 'Total Equity \u00f7 Portfolio Value \u00d7 100.' },
    { label: 'Total Loan',       value: fmt(totalLoan),     cls: 'text-danger',
      tooltip: 'Sum of outstanding loan balances.' },
    { label: 'Appreciation',     value: fmt(totalAppreciation), cls: totalAppreciation >= 0 ? 'text-success' : 'text-danger',
      tooltip: 'Market Value \u2212 Purchase Price across all properties.' },
    { label: 'Yearly Appr.',     value: fmt(totalYearlyAppr),   cls: totalYearlyAppr >= 0 ? 'text-success' : 'text-danger',
      tooltip: 'Sum of per-property (Market \u2212 Purchase) \u00f7 Years held.\nProperties without a possession date are excluded.' },
    { label: 'Total Income',     value: fmt(totalIncome),   cls: 'text-success',
      tooltip: 'All recorded income across active properties.' },
    { label: 'Net Expenses',     value: fmt(totalNetExp),   cls: totalNetExp >= 0 ? 'text-danger' : 'text-success',
      tooltip: 'Total Expenses \u2212 Down Payments.\nOperating costs above initial capital deployed.' },
    { label: 'Net Profit',       value: fmt(totalNetProfit), cls: totalNetProfit >= 0 ? 'text-success' : 'text-danger',
      tooltip: 'Total Income \u2212 Net Expenses.' },
    { label: 'ROI',              value: `${roi}%`, cls: parseFloat(roi) >= 0 ? 'text-success' : 'text-danger',
      tooltip: 'Net Profit \u00f7 Portfolio Value \u00d7 100.' },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Portfolio overview and performance</p>
        </div>
      </div>

      <div className="stats-grid">
        {summaryCards.map(({ label, value, cls, tooltip }) => (
          <StatCard key={label} label={label} value={value} cls={cls} tooltip={tooltip} />
        ))}
      </div>

      {properties.length > 0 && (<>
        <div className="chart-container">
          <div className="chart-header"><h2 className="chart-title">Income vs Expenses by Property</h2></div>
          <ResponsiveContainer width="100%" height={280}>
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
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={appreciationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
                <Bar dataKey="Appreciation">
                  {appreciationData.map((e, i) => (
                    <Cell key={i} fill={e.Appreciation >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container" style={{ margin: 0 }}>
            <div className="chart-header"><h2 className="chart-title">Equity vs Loan by Property</h2></div>
            <ResponsiveContainer width="100%" height={220}>
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
          <p className="text-secondary">Add your first property to get started</p>
        </div>
      ) : (
        <div className="property-grid">
          {properties.slice(0, 6).map(p => (
            <PropertyCard key={p.id} property={p} onClick={() => onPropertyClick(p)} />
          ))}
        </div>
      )}
    </>
  );
}

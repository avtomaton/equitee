import StarRating from './StarRating.jsx';
import { yearsHeld, calcSimpleHealth, calcExpected, calcEconVacancy } from '../metrics.js';
import { trailingYear } from '../utils.js';

// Health badge derived from investment score
function HealthBadge({ score }) {
  if (score == null) return null;
  let bg, color, label;
  if      (score >= 70) { bg = 'rgba(16,185,129,0.15)'; color = '#10b981'; label = '● Healthy'; }
  else if (score >= 40) { bg = 'rgba(245,158,11,0.15)'; color = '#f59e0b'; label = '● Average'; }
  else                  { bg = 'rgba(239,68,68,0.15)';  color = '#ef4444'; label = '● Needs Attention'; }
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '0.18rem 0.55rem',
      borderRadius: '20px', background: bg, color, letterSpacing: '0.03em',
    }}>{label}</span>
  );
}

export default function PropertyCard({ property, onClick, onEdit, avgCashFlow, avgNOI, events = [] }) {
  const equity       = property.market_price - property.loan_amount;
  const equityPct    = property.market_price > 0
    ? (equity / property.market_price * 100).toFixed(1) : null;
  const appreciation = property.market_price - property.purchase_price;
  const apprPct      = property.purchase_price > 0
    ? (appreciation / property.purchase_price * 100).toFixed(1) : null;
  const sellingProfit = property.market_price + property.total_income
                        - property.total_expenses - property.loan_amount;
  const sellingPct   = property.total_expenses > 0
    ? (sellingProfit / property.total_expenses * 100).toFixed(1) : null;
  const balance      = property.total_income - property.total_expenses;

  const yrs           = yearsHeld(property);
  const yearlyAppr    = yrs ? appreciation / yrs : null;
  const yearlyApprPct = (yrs && property.purchase_price > 0)
    ? (yearlyAppr / property.purchase_price * 100).toFixed(1) : null;

  const monthlyAppr = yearlyAppr !== null ? yearlyAppr / 12 : 0;
  const monthlyGain = avgCashFlow != null ? avgCashFlow + monthlyAppr : null;

  // Event-based economic vacancy — matches PropertyDetail methodology exactly.
  const { start: ytdStart, end: ytdEnd } = trailingYear();
  const econVacancy = calcEconVacancy(property, events, ytdStart, ytdEnd);

  // Time to reach selling profit
  const timeToProfit = (() => {
    if (sellingProfit <= 0) return { label: '\u2014', cls: '' };
    if (avgCashFlow == null || avgCashFlow <= 0)
      return { label: avgCashFlow < 0 ? '\u221e' : '\u2014', cls: 'text-danger' };
    const mo = sellingProfit / avgCashFlow;
    return {
      label: mo < 12 ? `${Math.round(mo)} mo` : `${(mo / 12).toFixed(1)} yr`,
      cls: mo < 24 ? 'text-success' : mo < 60 ? '' : 'text-danger',
    };
  })();

  // Investment score — uses calcSimpleHealth for consistency with the Properties table view
  const investmentScore = calcSimpleHealth(property);

  // Expected (budgeted) metrics — null if no cost fields entered
  // Pass 0 for avgMortgage since we don't have per-property window avg here
  const expected = calcExpected(property, 0);

  const eqCls = equityPct !== null
    ? (parseFloat(equityPct) >= 50 ? 'text-success'
    : parseFloat(equityPct) >= 25 ? 'text-warning' : 'text-danger') : '';

  const fmt = n => `$${Math.round(n).toLocaleString()}`;
  const handleEdit = (e) => { e.stopPropagation(); onEdit?.(property); };

  const Row = ({ label, value, valueCls = '', pct = null, pctCls = '' }) => (
    <div className="pc-row">
      <span className="pc-label">{label}</span>
      <span className="pc-right">
        <span className={`pc-value ${valueCls}`}>{value}</span>
        {pct != null && pct !== '' && <span className={`pc-pct ${pctCls}`}>{pct}</span>}
      </span>
    </div>
  );
  const Div = () => <div className="pc-divider" />;

  return (
    <div className="property-card" onClick={onClick}>
      {onEdit && (
        <div className="card-actions">
          <button className="btn btn-secondary btn-icon btn-small" onClick={handleEdit} title="Edit">✏️</button>
        </div>
      )}
      <div className="property-card-header">
        <div>
          <div className="property-name">{property.name}</div>
          <div className="property-address">{property.city}, {property.province}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
          <div className={`property-badge ${property.status.toLowerCase()}`}>{property.status}</div>
          {investmentScore && <HealthBadge score={investmentScore.score} />}
        </div>
      </div>

      {/* Investment score stars */}
      {investmentScore && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0 0.1rem', borderBottom: '1px solid var(--border)', marginBottom: '0.4rem' }}>
          <StarRating starsData={investmentScore.starsData} size="1.1rem" />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
            {investmentScore.score}/100
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 600 }} className={investmentScore.cls}>
            {investmentScore.label}
          </span>
        </div>
      )}

      <div className="pc-body">
        {/* 1. Market value & equity */}
        <Row label="Market Value" value={fmt(property.market_price)} />
        <Row label="Equity"
          value={fmt(equity)} valueCls={equity >= 0 ? 'text-success' : 'text-danger'}
          pct={equityPct !== null ? `${equityPct}%` : null} pctCls={eqCls} />

        <Div />
        {/* 2. Rent, NOI actual vs potential, vacancy & cash flow */}
        {property.monthly_rent > 0 && (
          <Row label="Rent/mo" value={fmt(property.monthly_rent)} />
        )}
        {avgNOI != null && (() => {
          const cls = avgNOI >= 0 ? 'text-success' : 'text-danger';
          const expNOI = expected?.monthlyNOI;
          const expCls = expNOI != null ? (expNOI >= 0 ? 'text-success' : 'text-danger') : null;
          const pctLabel = expNOI != null
            ? <span className={expCls} style={{ fontSize: '0.72rem' }}>exp {fmt(expNOI)}</span>
            : (property.monthly_rent > 0
              ? <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>of {fmt(property.monthly_rent)} rent</span>
              : null);
          return (
            <div className="pc-row">
              <span className="pc-label">Avg NOI/mo</span>
              <span className="pc-right">
                <span className={`pc-value ${cls}`}>{fmt(avgNOI)}</span>
                {pctLabel && <span className="pc-pct">{pctLabel}</span>}
              </span>
            </div>
          );
        })()}
        {econVacancy !== null && (
          <Row label="Econ. Vacancy"
            value={`${econVacancy.toFixed(1)}%`}
            valueCls={econVacancy > 10 ? 'text-danger' : econVacancy > 4 ? 'text-warning' : 'text-success'} />
        )}
        {avgCashFlow != null && (
          <Row label="Avg Cash Flow"
            value={fmt(avgCashFlow) + '/mo'}
            valueCls={avgCashFlow >= 0 ? 'text-success' : 'text-danger'} />
        )}
        {monthlyGain !== null && (
          <Row label="Monthly Gain"
            value={fmt(monthlyGain) + '/mo'}
            valueCls={monthlyGain >= 0 ? 'text-success' : 'text-danger'} />
        )}

        <Div />
        {/* 3. Selling profit */}
        <Row label="Sell Profit"
          value={fmt(sellingProfit)}
          valueCls={sellingProfit >= 0 ? 'text-success' : 'text-danger'}
          pct={sellingPct !== null ? `${sellingPct}%` : null}
          pctCls={sellingProfit >= 0 ? 'text-success' : 'text-danger'} />
        <Row label="Time to Profit"
          value={timeToProfit.label}
          valueCls={timeToProfit.cls} />
        {/* Cap rate: actual vs expected */}
        {avgNOI != null && property.purchase_price > 0 && (() => {
          const capRate = avgNOI * 12 / property.purchase_price;
          const capCls  = capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger';
          const expCap  = expected?.capRate;
          const expCls  = expCap != null ? (expCap > 0.07 ? 'text-success' : expCap > 0.04 ? '' : 'text-danger') : null;
          return (
            <Row label="Cap Rate"
              value={`${(capRate * 100).toFixed(1)}%`}
              valueCls={capCls}
              pct={expCap != null ? `exp ${(expCap * 100).toFixed(1)}%` : null}
              pctCls={expCls || ''} />
          );
        })()}

        <Div />
        {/* 4. Income / expenses / balance */}
        <Row label="Income"   value={fmt(property.total_income)}   valueCls="text-success" />
        <Row label="Expenses" value={fmt(property.total_expenses)} valueCls="text-danger" />
        <Row label="Balance"  value={fmt(balance)}
          valueCls={balance >= 0 ? 'text-success' : 'text-danger'} />

        <Div />
        {/* 5. Appreciation */}
        <Row label="Appreciation"
          value={fmt(appreciation)}
          valueCls={appreciation >= 0 ? 'text-success' : 'text-danger'}
          pct={apprPct !== null ? `${apprPct}%` : null}
          pctCls={appreciation >= 0 ? 'text-success' : 'text-danger'} />
        {yearlyAppr !== null && (
          <Row label="Yearly Appr."
            value={fmt(yearlyAppr) + '/yr'}
            valueCls={yearlyAppr >= 0 ? 'text-success' : 'text-danger'}
            pct={yearlyApprPct !== null ? `${yearlyApprPct}%/yr` : null}
            pctCls={yearlyAppr >= 0 ? 'text-success' : 'text-danger'} />
        )}
      </div>
    </div>
  );
}

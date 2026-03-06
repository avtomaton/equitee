export default function PropertyCard({ property, onClick, onEdit, avgCashFlow }) {
  const downPmt      = property.purchase_price - property.loan_amount;
  const equity       = property.market_price   - property.loan_amount;
  const equityPct    = property.market_price > 0
    ? (equity / property.market_price * 100).toFixed(1) : null;
  const appreciation = property.market_price   - property.purchase_price;
  const apprPct      = property.purchase_price > 0
    ? (appreciation / property.purchase_price * 100).toFixed(1) : null;

  // Selling profit = market value + all income − all expenses − current loan
  const sellingProfit = property.market_price + property.total_income
                        - property.total_expenses - property.loan_amount;
  const sellingPct   = property.total_expenses > 0
    ? (sellingProfit / property.total_expenses * 100).toFixed(1) : null;

  const yearsHeld = (() => {
    if (!property.poss_date) return null;
    const [y, m, d] = property.poss_date.split('-').map(Number);
    const diff = (Date.now() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return diff > 0 ? diff : null;
  })();
  const yearlyAppr    = yearsHeld ? appreciation / yearsHeld : null;
  const yearlyApprPct = (yearsHeld && property.purchase_price > 0)
    ? (yearlyAppr / property.purchase_price * 100).toFixed(1) : null;

  const balance = property.total_income - property.total_expenses;

  const fmt    = n  => `$${Math.round(n).toLocaleString()}`;
  const fmtPct = n  => n !== null ? `${n}%` : null;
  const eqCls  = equityPct !== null
    ? (parseFloat(equityPct) >= 50 ? 'text-success'
    : parseFloat(equityPct) >= 25 ? 'text-warning' : 'text-danger') : '';

  const handleEdit = (e) => { e.stopPropagation(); onEdit?.(property); };

  // A row: label | value [pct]
  // value and pct are inline; pct is smaller and muted unless given a color class
  const Row = ({ label, value, valueCls = '', pct = null, pctCls = '' }) => (
    <div className="pc-row">
      <span className="pc-label">{label}</span>
      <span className="pc-right">
        <span className={`pc-value ${valueCls}`}>{value}</span>
        {pct && <span className={`pc-pct ${pctCls}`}>{pct}</span>}
      </span>
    </div>
  );

  const Divider = () => <div className="pc-divider" />;

  return (
    <div className="property-card" onClick={onClick}>
      {onEdit && (
        <div className="card-actions">
          <button className="btn btn-secondary btn-icon btn-small" onClick={handleEdit} title="Edit">✏️</button>
        </div>
      )}

      {/* Header */}
      <div className="property-card-header">
        <div>
          <div className="property-name">{property.name}</div>
          <div className="property-address">{property.city}, {property.province}</div>
        </div>
        <div className={`property-badge ${property.status.toLowerCase()}`}>{property.status}</div>
      </div>

      <div className="pc-body">

        {/* Value & Equity */}
        <Row label="Market Value"  value={fmt(property.market_price)} />
        <Row label="Equity"
          value={fmt(equity)}    valueCls={equity >= 0 ? 'text-success' : 'text-danger'}
          pct={fmtPct(equityPct)} pctCls={eqCls} />

        {/* Selling profit */}
        <Divider />
        <Row label="Sell Profit"
          value={fmt(sellingProfit)}
          valueCls={sellingProfit >= 0 ? 'text-success' : 'text-danger'}
          pct={fmtPct(sellingPct)}
          pctCls={sellingProfit >= 0 ? 'text-success' : 'text-danger'} />

        {/* Appreciation */}
        <Divider />
        <Row label="Appreciation"
          value={fmt(appreciation)}
          valueCls={appreciation >= 0 ? 'text-success' : 'text-danger'}
          pct={fmtPct(apprPct)}
          pctCls={appreciation >= 0 ? 'text-success' : 'text-danger'} />
        {yearlyAppr !== null && (
          <Row label="Yearly Appr."
            value={fmt(yearlyAppr) + '/yr'}
            valueCls={yearlyAppr >= 0 ? 'text-success' : 'text-danger'}
            pct={yearlyApprPct !== null ? yearlyApprPct + '%/yr' : null}
            pctCls={yearlyAppr >= 0 ? 'text-success' : 'text-danger'} />
        )}

        {/* Cash flow */}
        <Divider />
        {property.monthly_rent > 0 && (
          <Row label="Rent/mo"      value={fmt(property.monthly_rent)} />
        )}
        {avgCashFlow !== undefined && avgCashFlow !== null && (
          <Row label="Avg Cash Flow"
            value={fmt(avgCashFlow) + '/mo'}
            valueCls={avgCashFlow >= 0 ? 'text-success' : 'text-danger'} />
        )}

        {/* Income / Expenses / Balance */}
        <Divider />
        <Row label="Income"   value={fmt(property.total_income)}   valueCls="text-success" />
        <Row label="Expenses" value={fmt(property.total_expenses)} valueCls="text-danger" />
        <Row label="Balance"  value={fmt(balance)}
          valueCls={balance >= 0 ? 'text-success' : 'text-danger'} />

      </div>
    </div>
  );
}

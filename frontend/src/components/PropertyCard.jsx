export default function PropertyCard({ property, onClick, onEdit }) {
  const downPmt    = property.purchase_price - property.loan_amount;
  const netExp     = property.total_expenses - downPmt;
  const netProfit  = property.total_income - netExp;
  const equity     = property.market_price - property.loan_amount;
  const equityPct  = property.market_price > 0
    ? (equity / property.market_price * 100).toFixed(1) : null;
  const appreciation = property.market_price - property.purchase_price;

  const yearsHeld = (() => {
    if (!property.poss_date) return null;
    const [y, m, d] = property.poss_date.split('-').map(Number);
    const diff = (Date.now() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return diff > 0 ? diff : null;
  })();
  const yearlyAppr = yearsHeld ? appreciation / yearsHeld : null;

  const fmt = n => `$${Math.round(n).toLocaleString()}`;

  const handleEdit = (e) => { e.stopPropagation(); onEdit?.(property); };

  const stat = (label, value, cls = '') => (
    <div className="property-stat">
      <div className="property-stat-label">{label}</div>
      <div className={`property-stat-value ${cls}`}>{value}</div>
    </div>
  );

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
        <div className={`property-badge ${property.status.toLowerCase()}`}>{property.status}</div>
      </div>

      <div className="property-stats">
        {stat('Market Value',  fmt(property.market_price))}
        {stat('Monthly Rent',  property.monthly_rent > 0 ? fmt(property.monthly_rent) : '—')}
        {stat('Equity',        fmt(equity),      equity     >= 0 ? 'text-success' : 'text-danger')}
        {stat('Equity %',      equityPct !== null ? `${equityPct}%` : '—',
                               equityPct !== null && parseFloat(equityPct) >= 50 ? 'text-success'
                             : equityPct !== null && parseFloat(equityPct) >= 25 ? 'text-warning' : 'text-danger')}
        {stat('Appreciation',  fmt(appreciation), appreciation >= 0 ? 'text-success' : 'text-danger')}
        {stat('Yearly Appr.',  yearlyAppr !== null ? fmt(yearlyAppr) + '/yr' : '—',
                               yearlyAppr !== null ? (yearlyAppr >= 0 ? 'text-success' : 'text-danger') : '')}
        {stat('Net Profit',    fmt(netProfit),    netProfit  >= 0 ? 'text-success' : 'text-danger')}
        {stat('Total Income',  fmt(property.total_income), 'text-success')}
      </div>
    </div>
  );
}

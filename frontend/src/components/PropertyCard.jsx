export default function PropertyCard({ property, onClick, onEdit }) {
  const netIncome = property.total_income - property.total_expenses;

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(property);
  };

  return (
    <div className="property-card" onClick={onClick}>
      {onEdit && (
        <div className="card-actions">
          <button className="btn btn-secondary btn-icon btn-small" onClick={handleEdit} title="Edit">
            ✏️
          </button>
        </div>
      )}
      <div className="property-card-header">
        <div>
          <div className="property-name">{property.name}</div>
          <div className="property-address">{property.city}, {property.province}</div>
        </div>
        <div className={`property-badge ${property.status.toLowerCase()}`}>
          {property.status}
        </div>
      </div>
      <div className="property-stats">
        <div className="property-stat">
          <div className="property-stat-label">Market Value</div>
          <div className="property-stat-value">${property.market_price.toLocaleString()}</div>
        </div>
        <div className="property-stat">
          <div className="property-stat-label">Monthly Rent</div>
          <div className="property-stat-value">${property.monthly_rent.toLocaleString()}</div>
        </div>
        <div className="property-stat">
          <div className="property-stat-label">Net Income</div>
          <div className={`property-stat-value ${netIncome >= 0 ? 'text-success' : 'text-danger'}`}>
            ${netIncome.toLocaleString()}
          </div>
        </div>
        <div className="property-stat">
          <div className="property-stat-label">Total Expenses</div>
          <div className="property-stat-value">${property.total_expenses.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

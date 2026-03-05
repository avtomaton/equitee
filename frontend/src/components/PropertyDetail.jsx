import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

const DETAIL_TOOLTIP_STYLE = {
  background: '#1a1f2e',
  border: '1px solid #374151',
  borderRadius: '8px',
};

export default function PropertyDetail({ property, onBack, onAddExpense, onAddIncome, onEdit }) {
  if (!property) return null;

  const netIncome = property.total_income - property.total_expenses;
  const roi = property.market_price > 0
    ? ((netIncome / property.market_price) * 100).toFixed(2)
    : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={onEdit}>✏️ Edit Property</button>
          <button className="btn btn-secondary" onClick={onAddExpense}>+ Add Expense</button>
          <button className="btn btn-primary"   onClick={onAddIncome}>+ Add Income</button>
        </div>
      </div>

      <div className="chart-container mb-3">
        <h1 className="page-title">{property.name}</h1>
        <p className="page-subtitle mb-2">
          {property.address}, {property.city}, {property.province} {property.postal_code}
        </p>
        <div className={`property-badge ${property.status.toLowerCase()}`} style={{ display: 'inline-block' }}>
          {property.status}
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: 'Purchase Price', value: `$${property.purchase_price.toLocaleString()}` },
          { label: 'Market Value',   value: `$${property.market_price.toLocaleString()}` },
          { label: 'Loan Amount',    value: `$${property.loan_amount.toLocaleString()}` },
          { label: 'Monthly Rent',   value: `$${property.monthly_rent.toLocaleString()}` },
          { label: 'Total Income',   value: `$${property.total_income.toLocaleString()}`,  cls: 'text-success' },
          { label: 'Total Expenses', value: `$${property.total_expenses.toLocaleString()}`, cls: 'text-danger' },
          { label: 'Net Income',     value: `$${netIncome.toLocaleString()}`, cls: netIncome >= 0 ? 'text-success' : 'text-danger' },
          { label: 'ROI',            value: `${roi}%`, cls: roi >= 0 ? 'text-success' : 'text-danger' },
        ].map(({ label, value, cls }) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${cls || ''}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="chart-container">
        <div className="chart-header">
          <h2 className="chart-title">Financial Overview</h2>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={[
            { name: 'Income',   value: property.total_income },
            { name: 'Expenses', value: property.total_expenses },
            { name: 'Net',      value: netIncome },
          ]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={DETAIL_TOOLTIP_STYLE} />
            <Bar dataKey="value" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

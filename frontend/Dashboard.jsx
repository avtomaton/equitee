import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import PropertyCard from './PropertyCard.jsx';

const TOOLTIP_STYLE = {
  background: '#1a1f2e',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#f3f4f6',
};

export default function Dashboard({ properties, stats, onPropertyClick }) {
  const chartData = properties.map((p) => ({
    name: p.name.length > 15 ? p.name.substring(0, 15) + '…' : p.name,
    income:   p.total_income,
    expenses: p.total_expenses,
    profit:   p.total_income - p.total_expenses,
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Portfolio overview and performance</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Properties</div>
          <div className="stat-value">{stats.propertyCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value">${stats.totalValue.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Income</div>
          <div className="stat-value text-success">${stats.totalIncome.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Expenses</div>
          <div className="stat-value text-danger">${stats.totalExpenses.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net Profit</div>
          <div className={`stat-value ${stats.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            ${stats.netProfit.toLocaleString()}
          </div>
        </div>
      </div>

      {properties.length > 0 && (
        <div className="chart-container">
          <div className="chart-header">
            <h2 className="chart-title">Income vs Expenses by Property</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
              <Bar dataKey="income"   fill="#10b981" name="Income" />
              <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
              <Bar dataKey="profit"   fill="#3b82f6" name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="page-header">
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
          {properties.slice(0, 6).map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              onClick={() => onPropertyClick(property)}
            />
          ))}
        </div>
      )}
    </>
  );
}

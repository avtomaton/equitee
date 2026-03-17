export default function Sidebar({ currentView, onNavigate }) {
  const navItem = (view, icon, label) => (
    <div
      className={`nav-item ${currentView === view ? 'active' : ''}`}
      onClick={() => onNavigate(view)}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Portfolio</div>
        <div className="sidebar-subtitle">Real Estate Manager</div>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Overview</div>
        {navItem('dashboard',  '📊', 'Dashboard')}
        {navItem('properties', '🏢', 'Properties')}
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Financials</div>
        {navItem('income',   '💰', 'Income')}
        {navItem('expenses', '💳', 'Expenses')}
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Tools</div>
        {navItem('evaluator',   '🧮', 'Evaluator')}
        {navItem('renovation',  '🔨', 'Renovation')}
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Management</div>
        {navItem('tenants', '👤', 'Tenants')}
        {navItem('events',  '📝', 'Events Log')}
      </div>
    </div>
  );
}

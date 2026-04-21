import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSaasMode } from './AuthGuard.jsx';

export default function Sidebar({ currentView, onNavigate, collapsed, onToggleCollapse }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on navigation (skip initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    setMobileOpen(false);
  }, [currentView]);

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const navItem = (view, icon, label) => (
    <div
      className={`nav-item ${currentView === view ? 'active' : ''}`}
      onClick={() => onNavigate(view)}
      title={collapsed ? label : undefined}
    >
      <span className="nav-icon">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </div>
  );

  const sidebarContent = (
    <>
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          {!collapsed && <div className="sidebar-title">Equitee</div>}
          <button
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="panel-icon" />
          </button>
        </div>
        {!collapsed && <div className="sidebar-subtitle">Real Estate Manager</div>}
      </div>

      <div className="nav-section">
        {!collapsed && <div className="nav-section-title">Overview</div>}
        {navItem('dashboard',  '📊', 'Dashboard')}
        {navItem('properties', '🏢', 'Properties')}
      </div>

      <div className="nav-section">
        {!collapsed && <div className="nav-section-title">Financials</div>}
        {navItem('income',   '💰', 'Income')}
        {navItem('expenses', '💳', 'Expenses')}
      </div>

      <div className="nav-section">
        {!collapsed && <div className="nav-section-title">Tools</div>}
        {navItem('evaluator',   '🧮', 'Evaluator')}
        {navItem('renovation',  '🔨', 'Renovation')}
        {navItem('comparison',  '⚖️', 'Compare')}
      </div>

      <div className="nav-section">
        {!collapsed && <div className="nav-section-title">Management</div>}
        {navItem('tenants', '👤', 'Tenants')}
        {navItem('events',  '📝', 'Events Log')}
        {navItem('documents', '📎', 'Documents')}
      </div>

      <div className="nav-section">
        {!collapsed && <div className="nav-section-title">System</div>}
        {navItem('settings', '⚙️', 'Settings')}
      </div>

      {isSaasMode && user && (
        <div className="nav-section sidebar-user">
          {!collapsed && <div className="sidebar-user-email">{user.email}</div>}
          <div
            className="nav-item logout-item"
            onClick={() => { logout(); onNavigate('login'); }}
            title={collapsed ? 'Sign Out' : undefined}
          >
            <span className="nav-icon">🚪</span>
            {!collapsed && <span>Sign Out</span>}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Hamburger button for mobile */}
      <button
        className="hamburger"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation menu"
        aria-expanded={mobileOpen}
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`sidebar ${mobileOpen ? 'mobile-open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-nav">
          {sidebarContent}
        </div>
      </div>
    </>
  );
}

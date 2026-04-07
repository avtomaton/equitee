import { useState, useEffect, useRef } from 'react';

export default function Sidebar({ currentView, onNavigate }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    // Check localStorage first, then system preference
    const stored = localStorage.getItem('theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const navItem = (view, icon, label) => (
    <div
      className={`nav-item ${currentView === view ? 'active' : ''}`}
      onClick={() => onNavigate(view)}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );

  const sidebarContent = (
    <>
      <div className="sidebar-header">
        <div className="sidebar-title">Equitee</div>
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
        {navItem('comparison',  '⚖️', 'Compare')}
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Management</div>
        {navItem('tenants', '👤', 'Tenants')}
        {navItem('events',  '📝', 'Events Log')}
        {navItem('documents', '📎', 'Documents')}
      </div>
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

      {/* Theme toggle — top right corner */}
      <button
        className="theme-toggle-global"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {sidebarContent}
      </div>
    </>
  );
}

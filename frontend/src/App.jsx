import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { getProperty } from './api.js';

import ErrorBoundary  from './components/ErrorBoundary.jsx';
import Sidebar        from './components/Sidebar.jsx';
import GlobalSearch   from './components/GlobalSearch.jsx';
import GroupSelector  from './components/GroupSelector.jsx';
import Dashboard      from './components/Dashboard.jsx';
import PropertiesView from './components/PropertiesView.jsx';
import ExpensesView   from './components/ExpensesView.jsx';
import IncomeView     from './components/IncomeView.jsx';
import TenantsView    from './components/TenantsView.jsx';
import EventsView     from './components/EventsView.jsx';
import PropertyDetail from './components/PropertyDetail.jsx';
import DocumentsView  from './components/DocumentsView.jsx';
import PropertyGroupsView from './components/PropertyGroupsView.jsx';
import { isAuthenticated, isSaasMode } from './components/AuthGuard.jsx';

// Lazy loaded views - loaded only when needed
const EvaluatorView  = lazy(() => import('./components/EvaluatorView.jsx'));
const RenovationView = lazy(() => import('./components/RenovationView.jsx'));
const ComparisonView = lazy(() => import('./components/ComparisonView.jsx'));
const LoginPage      = lazy(() => import('./pages/Login.jsx'));
const RegisterPage   = lazy(() => import('./pages/Register.jsx'));

import PropertyModal  from './modals/PropertyModal.jsx';
import ExpenseModal   from './modals/ExpenseModal.jsx';
import IncomeModal    from './modals/IncomeModal.jsx';
import TenantModal    from './modals/TenantModal.jsx';

import { ToastProvider, ToastContainer, useToast } from './components/Toast.jsx';
import { PortfolioDataProvider, usePortfolioData } from './context/PortfolioDataContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';

// ── URL routing helpers ───────────────────────────────────────────────────────

const VALID_VIEWS = [
  'dashboard', 'properties', 'expenses', 'income', 'tenants', 'events',
  'property-detail', 'evaluator', 'renovation', 'comparison', 'documents',
  'settings', 'login', 'register',
];

// Views where the GroupSelector should be hidden (tools + settings + auth)
const GROUP_HIDDEN_VIEWS = new Set([
  'evaluator', 'renovation', 'comparison', 'settings', 'login', 'register',
]);

const getViewFromHash = () => {
  const hash = window.location.hash.replace('#', '').replace('/', '');
  return VALID_VIEWS.includes(hash) ? hash : 'dashboard';
};

const setHash = (view) => {
  window.history.replaceState(null, '', `#/${view}`);
};

// ─────────────────────────────────────────────────────────────────────────────

function AppInner() {
  const { success, error: toastError } = useToast();
  const {
    properties, allIncome, allExpenses,
    groups, defaultGroupProperties,
    loading, refresh: loadData
  } = usePortfolioData();

  const { user } = useAuth();

  const [currentView, setCurrentView]   = useState(getViewFromHash);
  const [selectedProperty, setSelectedProperty] = useState(null);

  // Active group override — null means use default group, '__all__' means all properties
  const [activeGroupId, setActiveGroupId] = useState(null);

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Theme state (lifted from Sidebar so we can render toggle in top bar)
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Resolve properties for the active group (or default if no override)
  const viewProperties = useMemo(() => {
    if (activeGroupId === null) return defaultGroupProperties;
    if (activeGroupId === '__all__') return properties;
    const g = groups.find(g => g.id === activeGroupId);
    if (!g || !g.property_ids?.length) return properties;
    const ids = new Set(g.property_ids);
    return properties.filter(p => ids.has(p.id));
  }, [activeGroupId, groups, defaultGroupProperties, properties]);

  // modal state: { type: 'property'|'expense'|'income'|'tenant', data: obj|null, context: obj|null }
  const [modal, setModal] = useState(null);

  // Scroll-preservation: save scroll position when modal opens, restore after save
  const savedScroll = useRef(0);

  // View reload registration — the mounted view registers its async reload fn here
  // so handleSave can await it before restoring scroll (fully event-based, no timeouts)
  const viewReloadRef = useRef(null);
  const registerViewReload = (fn) => { viewReloadRef.current = fn; };

  // filter pre-selection when jumping from property detail
  const [jumpPropertyId, setJumpPropertyId] = useState(null);

  // Sync hash on view change
  const navigate = (view) => {
    setCurrentView(view);
    setHash(view);
    setJumpPropertyId(null);
  };

  // Handle browser back/forward
  useEffect(() => {
    const onHash = () => setCurrentView(getViewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Auth guard: redirect based on mode and authentication state
  useEffect(() => {
    const view = getViewFromHash();
    const authViews = ['login', 'register'];

    // In single mode, auth pages don't exist — redirect to dashboard
    if (!isSaasMode && authViews.includes(view)) {
      navigate('dashboard');
      return;
    }

    if (!isSaasMode) return;

    if (!isAuthenticated(user) && !authViews.includes(view)) {
      window.location.hash = '/login';
    }

    // If logged in and on auth page, go to dashboard
    if (user && authViews.includes(view)) {
      navigate('dashboard');
    }
  }, [user]);

  // Handle login/register navigation from auth pages
  const handleAuthNavigate = (view) => {
    navigate(view);
  };

  const showAlert = useCallback((message, type = 'info') => {
    if (type === 'success') success(message);
    else if (type === 'error') toastError(message);
    else success(message);
  }, [success, toastError]);

  const openModal  = (type, data = null, context = null) => {
    savedScroll.current = window.scrollY;
    setModal({ type, data, context });
  };
  const closeModal = () => setModal(null);
  const handleSave = async () => {
    const scrollPos = savedScroll.current;
    closeModal();
    showAlert('Saved successfully', 'success');
    await Promise.all([
      viewReloadRef.current?.() ?? Promise.resolve(),
      loadData({ silent: true }),
    ]);
    // Keep selectedProperty in sync so PropertyDetail shows updated values
    setSelectedProperty(prev => {
      if (!prev) return null;
      const fresh = properties.find(p => p.id === prev.id);
      return fresh ?? prev;
    });
    window.scrollTo({ top: scrollPos, behavior: 'instant' });
  };

  const handlePropertyClick = async (property) => {
    try {
      const data = await getProperty(property.id);
      setSelectedProperty(data);
      setCurrentView('property-detail');
      setHash('property-detail');
    } catch {
      showAlert('Failed to load property details', 'error');
    }
  };

  // Jump from PropertyDetail to a filtered view
  const handleJump = (view, propertyId) => {
    setJumpPropertyId(propertyId);
    setCurrentView(view);
    setHash(view);
  };

  const renderView = () => {
    // Auth pages (only shown in SaaS mode)
    if (currentView === 'login') {
      return (
        <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
          <LoginPage onNavigate={handleAuthNavigate} />
        </Suspense>
      );
    }
    if (currentView === 'register') {
      return (
        <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
          <RegisterPage onNavigate={handleAuthNavigate} />
        </Suspense>
      );
    }

    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            properties={viewProperties}
            onPropertyClick={handlePropertyClick}
          />
        );

      case 'properties':
        return (
          <PropertiesView
            properties={viewProperties}
            onPropertyClick={handlePropertyClick}
            onAddProperty={() => openModal('property')}
            onEditProperty={(p) => openModal('property', p)}
            onReloadProperties={() => loadData({ silent: true })}
            onError={(msg) => showAlert(msg, 'error')}
          />
        );

      case 'expenses':
        return <ExpensesView
          properties={viewProperties}
          onAddExpense={() => openModal('expense')}
          onEditExpense={(e) => openModal('expense', e)}
          initialPropertyId={jumpPropertyId}
          onRegisterReload={registerViewReload}
        />;

      case 'income':
        return <IncomeView
          properties={viewProperties}
          onAddIncome={() => openModal('income')}
          onEditIncome={(i) => openModal('income', i)}
          initialPropertyId={jumpPropertyId}
          onRegisterReload={registerViewReload}
        />;

      case 'tenants':
        return <TenantsView
          properties={viewProperties}
          onAddTenant={() => openModal('tenant')}
          onEditTenant={(t) => openModal('tenant', t)}
          initialPropertyId={jumpPropertyId}
          onRegisterReload={registerViewReload}
        />;

      case 'events':
        return <EventsView properties={viewProperties} initialPropertyId={jumpPropertyId} />;

      case 'evaluator':
        return (
          <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
            <EvaluatorView />
          </Suspense>
        );

      case 'comparison':
        return (
          <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
            <ComparisonView properties={properties} onBack={() => navigate('dashboard')} />
          </Suspense>
        );

      case 'renovation':
        return (
          <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
            <RenovationView />
          </Suspense>
        );

      case 'documents':
        return <DocumentsView properties={viewProperties} initialPropertyId={jumpPropertyId} />;

      case 'settings':
        return <PropertyGroupsView />;

      case 'property-detail':
        if (!selectedProperty) return <Dashboard properties={viewProperties} onPropertyClick={handlePropertyClick} />;
        return <PropertyDetail
          property={selectedProperty}
          properties={properties}
          onSelectProperty={(p) => { setSelectedProperty(p); }}
          onBack={() => navigate('properties')}
          onEdit={() => openModal('property', selectedProperty)}
          onAddExpense={() => openModal('expense', null, selectedProperty)}
          onAddIncome={() => openModal('income',  null, selectedProperty)}
          onAddTenant={() => openModal('tenant',  null, selectedProperty)}
          onJump={handleJump}
        />;

      default:
        return <Dashboard properties={viewProperties} onPropertyClick={handlePropertyClick} />;
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p style={{ marginTop:'1rem', color:'var(--text-secondary)' }}>Loading your portfolio…</p>
      </div>
    );
  }

  // Resolve the property context for expense/income/tenant modals opened from detail view
  const contextProperty = modal?.context
    ? properties.find(p => p.id === modal.context.id) ?? modal.context
    : null;

  return (
    <ErrorBoundary>
    <div className="app">
      <Sidebar
        currentView={currentView}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
      />

      <main className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* ── Top bar: search, group selector, theme toggle ── */}
        <div className="top-bar">
          {/* Hide group selector on tool pages and settings */}
          {!GROUP_HIDDEN_VIEWS.has(currentView) && (
            <GroupSelector value={activeGroupId} onChange={setActiveGroupId} />
          )}
          <div className="top-bar-right">
            <GlobalSearch
              properties={properties}
              allIncome={allIncome}
              allExpenses={allExpenses}
              onNavigate={(view, propertyId) => { setJumpPropertyId(propertyId ?? null); navigate(view); }}
              onPropertyDetail={handlePropertyClick}
            />
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <ToastContainer />
        <ErrorBoundary>
          {renderView()}
        </ErrorBoundary>
      </main>

      {modal?.type === 'property' && (
        <PropertyModal property={modal.data} onClose={closeModal} onSave={handleSave} onError={(msg) => showAlert(msg, 'error')} />
      )}
      {modal?.type === 'expense' && (
        <ExpenseModal
          expense={modal.data}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === modal.data.property_id) : null)}
          onClose={closeModal}
          onSave={handleSave}
          onError={(msg) => showAlert(msg, 'error')}
        />
      )}
      {modal?.type === 'income' && (
        <IncomeModal
          income={modal.data}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === modal.data.property_id) : null)}
          onClose={closeModal}
          onSave={handleSave}
          onError={(msg) => showAlert(msg, 'error')}
        />
      )}
      {modal?.type === 'tenant' && (
        <TenantModal
          tenant={modal.data}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === modal.data.property_id) : null)}
          onClose={closeModal}
          onSave={handleSave}
          onError={(msg) => showAlert(msg, 'error')}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <PortfolioDataProvider>
          <AppInner />
        </PortfolioDataProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

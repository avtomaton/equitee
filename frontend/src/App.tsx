import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { getProperty } from './api';
import type { Property, Expense, Income, Renter } from './types';

import ErrorBoundary  from './components/ErrorBoundary';
import Sidebar        from './components/Sidebar';
import GlobalSearch   from './components/GlobalSearch';
import GroupSelector  from './components/GroupSelector';
import Dashboard      from './components/Dashboard';
import PropertiesView from './components/PropertiesView';
import ExpensesView   from './components/ExpensesView';
import IncomeView     from './components/IncomeView';
import TenantsView    from './components/TenantsView';
import EventsView     from './components/EventsView';
import PropertyDetail from './components/PropertyDetail';
import DocumentsView  from './components/DocumentsView';
import PropertyGroupsView from './components/PropertyGroupsView';
import { isAuthenticated, isSaasMode } from './components/AuthGuard';

// Lazy loaded views - loaded only when needed
const EvaluatorView  = lazy(() => import('./components/EvaluatorView'));
const RenovationView = lazy(() => import('./components/RenovationView'));
const ComparisonView = lazy(() => import('./components/ComparisonView'));
const LoginPage      = lazy(() => import('./pages/Login'));
const RegisterPage   = lazy(() => import('./pages/Register'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail'));
const AdminPanel     = lazy(() => import('./components/AdminPanel'));
const SettingsPage   = lazy(() => import('./pages/Settings'));

import PropertyModal  from './modals/PropertyModal';
import ExpenseModal   from './modals/ExpenseModal';
import IncomeModal    from './modals/IncomeModal';
import TenantModal    from './modals/TenantModal';

import { ToastProvider, ToastContainer, useToast } from './components/Toast';
import { PortfolioDataProvider, usePortfolioData } from './context/PortfolioDataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { ModalState, ModalType } from './types';

// ── URL routing helpers ───────────────────────────────────────────────────────

const VALID_VIEWS = [
  'dashboard', 'properties', 'expenses', 'income', 'tenants', 'events',
  'property-detail', 'evaluator', 'renovation', 'comparison', 'documents',
  'settings', 'admin', 'login', 'register', 'verify-email',
];

// Views where the GroupSelector should be hidden (tools + settings + auth)
const GROUP_HIDDEN_VIEWS = new Set([
  'evaluator', 'renovation', 'comparison', 'settings', 'admin',
  'login', 'register', 'verify-email',
]);

const getViewFromHash = () => {
  const hash = window.location.hash.replace('#', '').replace('/', '');
  return VALID_VIEWS.includes(hash) ? hash : 'dashboard';
};

const setHash = (view: string) => {
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

  const [currentView, setCurrentView]   = useState<string>(getViewFromHash());
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Active group override — null means use default group, '__all__' means all properties
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Theme state (lifted from Sidebar so we can render toggle in top bar)
  const [theme, setTheme] = useState<string>(() => {
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
    const g = groups.find(g => g.id === Number(activeGroupId));
    if (!g || !g.property_ids?.length) return properties;
    const ids = new Set(g.property_ids);
    return properties.filter(p => ids.has(p.id));
  }, [activeGroupId, groups, defaultGroupProperties, properties]);

  // modal state for property/expense/income/tenant modals
  const [modal, setModal] = useState<ModalState | null>(null);

  // Scroll-preservation: save scroll position when modal opens, restore after save
  const savedScroll = useRef<number>(0);

  // View reload registration
  const viewReloadRef = useRef<(() => Promise<void>) | null>(null);
  const registerViewReload = (fn: () => Promise<void>) => { viewReloadRef.current = fn; };

  // filter pre-selection when jumping from property detail
  const [jumpPropertyId, setJumpPropertyId] = useState<number | null>(null);

  // Sync hash on view change
  const navigate = (view: string) => {
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

  // Auth guard
  useEffect(() => {
    const view = getViewFromHash();
    const authViews = ['login', 'register', 'verify-email'];

    if (!isSaasMode && authViews.includes(view)) {
      navigate('dashboard');
      return;
    }

    if (!isSaasMode) return;

    if (!isAuthenticated(user) && !authViews.includes(view)) {
      window.location.hash = '/login';
    }

    if (user && authViews.includes(view) && view !== 'verify-email') {
      navigate('dashboard');
    }
  }, [user]);

  const handleAuthNavigate = (view: string) => {
    navigate(view);
  };

  const showAlert = useCallback((message: string, type: 'info' | 'success' | 'error') => {
    if (type === 'success') success(message);
    else if (type === 'error') toastError(message);
    else success(message);
  }, [success, toastError]);

  const openModal = (type: ModalType, data: unknown = null, context: unknown = null) => {
    savedScroll.current = window.scrollY;
    setModal({ type, data, context });
  };

  const closeModal = () => setModal(null);

  const handleSave = async () => {
    const scrollPos = savedScroll.current;
    closeModal();
    showAlert('Saved successfully', 'success');
    await (viewReloadRef.current?.() ?? Promise.resolve());
    setSelectedProperty(prev => {
      if (!prev) return null;
      const fresh = properties.find(p => p.id === prev.id);
      return fresh ?? prev;
    });
    window.scrollTo({ top: scrollPos, behavior: 'instant' });
  };

  const handlePropertyClick = async (property: Property) => {
    try {
      const data = await getProperty(property.id);
      setSelectedProperty(data as Property);
      setCurrentView('property-detail');
      setHash('property-detail');
    } catch {
      showAlert('Failed to load property details', 'error');
    }
  };

  const handleJump = (view: string, propertyId: number) => {
    setJumpPropertyId(propertyId);
    setCurrentView(view);
    setHash(view);
  };

  const renderView = () => {
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
    if (currentView === 'verify-email') {
      return (
        <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
          <VerifyEmailPage onNavigate={handleAuthNavigate} />
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
            onEditProperty={(p: Property) => openModal('property', p)}
            onReloadProperties={() => loadData({ silent: true })}
            onError={(msg: string) => showAlert(msg, 'error')}
          />
        );

      case 'expenses':
        return <ExpensesView
          properties={viewProperties}
          onAddExpense={() => openModal('expense')}
          onEditExpense={(e: Record<string, unknown>) => openModal('expense', e)}
          initialPropertyId={jumpPropertyId ?? undefined}
          onRegisterReload={registerViewReload as never}
        />;

      case 'income':
        return <IncomeView
          properties={viewProperties}
          onAddIncome={() => openModal('income')}
          onEditIncome={(i: Record<string, unknown>) => openModal('income', i)}
          initialPropertyId={jumpPropertyId ?? undefined}
          onRegisterReload={registerViewReload as never}
        />;

      case 'tenants':
        return <TenantsView
          properties={viewProperties}
          onAddTenant={() => openModal('tenant')}
          onEditTenant={(t: Record<string, unknown>) => openModal('tenant', t)}
          initialPropertyId={jumpPropertyId ?? undefined}
          onRegisterReload={registerViewReload as never}
        />;

      case 'events':
        return <EventsView properties={viewProperties} initialPropertyId={jumpPropertyId ?? undefined} />;

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
        return <DocumentsView properties={viewProperties} initialPropertyId={jumpPropertyId ?? undefined} />;

      case 'settings':
        return (
          <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
            <SettingsPage onNavigate={navigate} />
          </Suspense>
        );

      case 'admin':
        return (
          <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
            <AdminPanel onNavigate={navigate} />
          </Suspense>
        );

      case 'groups':
        return <PropertyGroupsView />;

      case 'property-detail':
        if (!selectedProperty) return <Dashboard properties={viewProperties} onPropertyClick={handlePropertyClick} />;
        return <PropertyDetail
          property={selectedProperty}
          properties={properties}
          onSelectProperty={(p: Property) => { setSelectedProperty(p); }}
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
    ? properties.find(p => p.id === (modal.context as Property)?.id) ?? (modal.context as Property)
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
        <div className="top-bar">
          {!GROUP_HIDDEN_VIEWS.has(currentView) && (
            <GroupSelector value={activeGroupId} onChange={(v: string | number | null) => setActiveGroupId(v !== null ? String(v) : null)} />
          )}
          <div className="top-bar-right">
            <GlobalSearch
              properties={properties}
              allIncome={allIncome}
              allExpenses={allExpenses}
              onNavigate={(view: string, propertyId?: number | null) => { setJumpPropertyId(propertyId ?? null); navigate(view); }}
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
        <PropertyModal property={modal.data as Property} onClose={closeModal} onSave={handleSave} onError={(msg: string) => showAlert(msg, 'error')} />
      )}
      {modal?.type === 'expense' && (
        <ExpenseModal
          expense={modal.data as Expense}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === (modal.data as Expense).property_id) : null) ?? null}
          onClose={closeModal}
          onSave={handleSave}
          onError={(msg: string) => showAlert(msg, 'error')}
        />
      )}
      {modal?.type === 'income' && (
        <IncomeModal
          income={modal.data as any}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === (modal.data as Income).property_id) : null) ?? null}
          onClose={closeModal}
          onSave={handleSave}
          onError={(msg: string) => showAlert(msg, 'error')}
        />
      )}
      {modal?.type === 'tenant' && (
        <TenantModal
          tenant={modal.data as Renter}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === (modal.data as Renter).property_id) : null) ?? null}
          onClose={closeModal}
          onSave={handleSave}
          onError={(msg: string) => showAlert(msg, 'error')}
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

import { useState, useEffect } from 'react';
import { getProperties, getProperty } from './api.js';

import ErrorBoundary  from './components/ErrorBoundary.jsx';
import Sidebar        from './components/Sidebar.jsx';
import Dashboard      from './components/Dashboard.jsx';
import PropertiesView from './components/PropertiesView.jsx';
import ExpensesView   from './components/ExpensesView.jsx';
import IncomeView     from './components/IncomeView.jsx';
import TenantsView    from './components/TenantsView.jsx';
import EventsView     from './components/EventsView.jsx';
import PropertyDetail from './components/PropertyDetail.jsx';
import EvaluatorView  from './components/EvaluatorView.jsx';
import RenovationView from './components/RenovationView.jsx';

import PropertyModal  from './modals/PropertyModal.jsx';
import ExpenseModal   from './modals/ExpenseModal.jsx';
import IncomeModal    from './modals/IncomeModal.jsx';
import TenantModal    from './modals/TenantModal.jsx';

// ── URL routing helpers ───────────────────────────────────────────────────────

const VALID_VIEWS = ['dashboard', 'properties', 'expenses', 'income', 'tenants', 'events', 'property-detail', 'evaluator', 'renovation'];

const getViewFromHash = () => {
  const hash = window.location.hash.replace('#', '');
  return VALID_VIEWS.includes(hash) ? hash : 'dashboard';
};

const setHash = (view) => {
  window.history.replaceState(null, '', `#${view}`);
};

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [currentView, setCurrentView]   = useState(getViewFromHash);
  const [properties, setProperties]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [alert, setAlert]               = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);

  // modal state: { type: 'property'|'expense'|'income'|'tenant', data: obj|null, context: obj|null }
  const [modal, setModal] = useState(null);

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

  useEffect(() => { loadData(); }, []);

  const showAlert = (message, type = 'info') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const fresh = await getProperties();
      setProperties(fresh);
      // Keep selectedProperty in sync so PropertyDetail shows updated values
      setSelectedProperty(prev => prev ? (fresh.find(p => p.id === prev.id) ?? prev) : null);
    } catch (err) {
      console.error(err);
      showAlert('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openModal  = (type, data = null, context = null) => setModal({ type, data, context });
  const closeModal = () => setModal(null);
  const handleSave = async () => { await loadData(); closeModal(); showAlert('Saved successfully', 'success'); };

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
    switch (currentView) {
      case 'dashboard':
        return <Dashboard properties={properties} onPropertyClick={handlePropertyClick} />;

      case 'properties':
        return <PropertiesView
          properties={properties}
          onPropertyClick={handlePropertyClick}
          onAddProperty={() => openModal('property')}
          onEditProperty={(p) => openModal('property', p)}
          onReloadProperties={loadData}
        />;

      case 'expenses':
        return <ExpensesView
          properties={properties}
          onAddExpense={() => openModal('expense')}
          onEditExpense={(e) => openModal('expense', e)}
          initialPropertyId={jumpPropertyId}
        />;

      case 'income':
        return <IncomeView
          properties={properties}
          onAddIncome={() => openModal('income')}
          onEditIncome={(i) => openModal('income', i)}
          initialPropertyId={jumpPropertyId}
        />;

      case 'tenants':
        return <TenantsView
          properties={properties}
          onAddTenant={() => openModal('tenant')}
          onEditTenant={(t) => openModal('tenant', t)}
          initialPropertyId={jumpPropertyId}
        />;

      case 'events':
        return <EventsView properties={properties} initialPropertyId={jumpPropertyId} />;

      case 'evaluator':
        return <EvaluatorView />;

      case 'renovation':
        return <RenovationView />;

      case 'property-detail':
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
        return <Dashboard properties={properties} onPropertyClick={handlePropertyClick} />;
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
      <Sidebar currentView={currentView} onNavigate={navigate} />

      <main className="main-content">
        {alert && (
          <div className={`alert alert-${alert.type}`}>
            <span>{alert.type === 'success' ? '✓' : alert.type === 'error' ? '✗' : 'ℹ'}</span>
            <span>{alert.message}</span>
          </div>
        )}
        <ErrorBoundary>
          {renderView()}
        </ErrorBoundary>
      </main>

      {modal?.type === 'property' && (
        <PropertyModal property={modal.data} onClose={closeModal} onSave={handleSave} />
      )}
      {modal?.type === 'expense' && (
        <ExpenseModal
          expense={modal.data}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === modal.data.property_id) : null)}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
      {modal?.type === 'income' && (
        <IncomeModal
          income={modal.data}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === modal.data.property_id) : null)}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
      {modal?.type === 'tenant' && (
        <TenantModal
          tenant={modal.data}
          properties={properties}
          property={contextProperty ?? (modal.data ? properties.find(p => p.id === modal.data.property_id) : null)}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}

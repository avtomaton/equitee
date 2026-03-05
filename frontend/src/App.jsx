import { useState, useEffect, useMemo } from 'react';
import { API_URL } from './config.js';

import Sidebar         from './components/Sidebar.jsx';
import Dashboard       from './components/Dashboard.jsx';
import PropertiesView  from './components/PropertiesView.jsx';
import ExpensesView    from './components/ExpensesView.jsx';
import IncomeView      from './components/IncomeView.jsx';
import EventsView      from './components/EventsView.jsx';
import PropertyDetail  from './components/PropertyDetail.jsx';

import PropertyModal   from './modals/PropertyModal.jsx';
import ExpenseModal    from './modals/ExpenseModal.jsx';
import IncomeModal     from './modals/IncomeModal.jsx';

export default function App() {
  const [currentView, setCurrentView]         = useState('dashboard');
  const [properties, setProperties]           = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [alert, setAlert]                     = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [showModal, setShowModal]             = useState(null);
  const [modalData, setModalData]             = useState(null);

  useEffect(() => { loadData(); }, []);

  const showAlert = (message, type = 'info') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/properties`);
      if (!res.ok) throw new Error('Failed to fetch data');
      setProperties(await res.json());
    } catch (error) {
      console.error('Error loading data:', error);
      showAlert('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalValue    = properties.reduce((sum, p) => sum + p.market_price,    0);
    const totalIncome   = properties.reduce((sum, p) => sum + p.total_income,    0);
    const totalExpenses = properties.reduce((sum, p) => sum + p.total_expenses,  0);
    const netProfit     = totalIncome - totalExpenses;
    return {
      propertyCount: properties.length,
      totalValue,
      totalIncome,
      totalExpenses,
      netProfit,
      avgROI: totalValue > 0 ? ((netProfit / totalValue) * 100).toFixed(2) : 0,
    };
  }, [properties]);

  const handlePropertyClick = async (property) => {
    try {
      const res  = await fetch(`${API_URL}/properties/${property.id}`);
      const data = await res.json();
      setSelectedProperty(data);
      setCurrentView('property-detail');
    } catch {
      showAlert('Failed to load property details', 'error');
    }
  };

  const openModal  = (type, data) => { setShowModal(type); setModalData(data); };
  const closeModal = () => { setShowModal(null); setModalData(null); };

  const handleSave = async () => {
    await loadData();
    closeModal();
    showAlert('Saved successfully', 'success');
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard properties={properties} stats={stats} onPropertyClick={handlePropertyClick} />;
      case 'properties':
        return (
          <PropertiesView
            properties={properties}
            onPropertyClick={handlePropertyClick}
            onAddProperty={() => openModal('property', null)}
            onEditProperty={(p) => openModal('property', p)}
            onReload={loadData}
          />
        );
      case 'expenses':
        return (
          <ExpensesView
            properties={properties}
            onAddExpense={() => openModal('expense', null)}
            onEditExpense={(e) => openModal('expense', e)}
          />
        );
      case 'income':
        return (
          <IncomeView
            properties={properties}
            onAddIncome={() => openModal('income', null)}
            onEditIncome={(i) => openModal('income', i)}
          />
        );
      case 'events':
        return <EventsView properties={properties} />;
      case 'property-detail':
        return (
          <PropertyDetail
            property={selectedProperty}
            onBack={() => setCurrentView('properties')}
            onAddExpense={() => openModal('expense', selectedProperty)}
            onAddIncome={() => openModal('income', selectedProperty)}
            onEdit={() => openModal('property', selectedProperty)}
          />
        );
      default:
        return <Dashboard properties={properties} stats={stats} onPropertyClick={handlePropertyClick} />;
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p className="mt-2">Loading your portfolio…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />

      <main className="main-content">
        {alert && (
          <div className={`alert alert-${alert.type}`}>
            <span>{alert.type === 'success' ? '✓' : alert.type === 'error' ? '✗' : 'ℹ'}</span>
            <span>{alert.message}</span>
          </div>
        )}
        {renderView()}
      </main>

      {showModal === 'property' && (
        <PropertyModal property={modalData} onClose={closeModal} onSave={handleSave} />
      )}
      {showModal === 'expense' && (
        <ExpenseModal
          expense={modalData}
          properties={properties}
          property={modalData?.property_id ? properties.find((p) => p.id === modalData.property_id) : null}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
      {showModal === 'income' && (
        <IncomeModal
          income={modalData}
          properties={properties}
          property={modalData?.property_id ? properties.find((p) => p.id === modalData.property_id) : null}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

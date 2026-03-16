import { useState, useMemo } from 'react';
import { API_URL, INITIAL_OPTIONS } from '../config.js';
import { monthlyMortgageEquiv } from '../metrics.js';
import { ModalOverlay, DateInput, selectOnFocus } from './ModalBase.jsx';

const toFormState = (expense, property) => expense ? {
  property_id:      expense.property_id ?? '',
  expense_date:     expense.expense_date ?? new Date().toISOString().split('T')[0],
  amount:           expense.amount ?? 0,
  expense_type:     expense.expense_type ?? '',
  expense_category: expense.expense_category ?? '',
  notes:            expense.notes ?? '',
  tax_deductible:   expense.tax_deductible === undefined ? true : Boolean(expense.tax_deductible),
} : {
  property_id:      property?.id ?? '',
  expense_date:     new Date().toISOString().split('T')[0],
  amount: 0, expense_type: '', expense_category: '', notes: '',
  tax_deductible: true,
};

const NON_DEDUCTIBLE_CATEGORIES = ['Mortgage', 'Principal'];

const QUICK_BTN_STYLE = {
  padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.78rem',
  cursor: 'pointer', fontWeight: 600, border: '1px solid var(--accent-primary)',
  background: 'rgba(59,130,246,0.1)', color: 'var(--accent-primary)',
  transition: 'background 0.15s',
};

export default function ExpenseModal({ expense, properties, property, onClose, onSave }) {
  const [formData, setFormData] = useState(() => toFormState(expense, property));

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  // When category changes, auto-derive tax_deductible
  const setCategory = (category) => setFormData(prev => ({
    ...prev,
    expense_category: category,
    tax_deductible: category === '' ? prev.tax_deductible : !NON_DEDUCTIBLE_CATEGORIES.includes(category),
  }));

  const selectedProp = useMemo(() =>
    properties.find(p => String(p.id) === String(formData.property_id)) ?? null,
  [properties, formData.property_id]);

  // Quick-fill also derives tax_deductible from category
  const quickFill = (patch) => setFormData(prev => {
    const merged = { ...prev, ...patch };
    if ('expense_category' in patch && patch.expense_category !== '')
      merged.tax_deductible = !NON_DEDUCTIBLE_CATEGORIES.includes(patch.expense_category);
    return merged;
  });

  const fillCondoFees = () => {
    if (!selectedProp?.expected_condo_fees) return;
    quickFill({ amount: selectedProp.expected_condo_fees, expense_category: 'Management', expense_type: 'Recurrent', notes: 'Condo fees' });
  };
  const fillMortgage = () => {
    if (!selectedProp?.mortgage_payment) return;
    const monthly = monthlyMortgageEquiv(selectedProp.mortgage_payment, selectedProp.mortgage_frequency);
    quickFill({ amount: parseFloat(monthly.toFixed(2)), expense_category: 'Mortgage', expense_type: 'Recurrent',
      notes: `Mortgage payment (${selectedProp.mortgage_frequency || 'monthly'})` });
  };

  const hasCondoFees  = selectedProp?.expected_condo_fees > 0;
  const hasMortgage   = selectedProp?.mortgage_payment > 0;
  const showQuickFill = !expense && (hasCondoFees || hasMortgage);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url    = expense ? `${API_URL}/expenses/${expense.id}` : `${API_URL}/expenses`;
      const method = expense ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: formData.property_id, expenseDate: formData.expense_date,
          amount: formData.amount, expenseType: formData.expense_type,
          expenseCategory: formData.expense_category, notes: formData.notes,
          taxDeductible: formData.tax_deductible,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSave();
    } catch (err) { console.error(err); alert('Failed to save expense'); }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{expense ? 'Edit Expense' : 'Add New Expense'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Property *</label>
              <select value={formData.property_id} onChange={e => set('property_id', e.target.value)} required>
                <option value="">Select Property</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Date *</label>
              <DateInput value={formData.expense_date} onChange={e => set('expense_date', e.target.value)} required />
            </div>

            {showQuickFill && (
              <div className="form-group full-width" style={{ marginBottom: '0.25rem' }}>
                <label style={{ marginBottom: '0.4rem', display: 'block' }}>
                  Quick-fill
                  <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '0.4rem', fontSize: '0.72rem' }}>
                    — pre-fills amount, category &amp; type from property settings
                  </span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {hasCondoFees && (
                    <button type="button" style={QUICK_BTN_STYLE} onClick={fillCondoFees}>
                      🏢 Condo Fees &nbsp;<span style={{ opacity: 0.7, fontWeight: 400 }}>${selectedProp.expected_condo_fees}/mo</span>
                    </button>
                  )}
                  {hasMortgage && (
                    <button type="button" style={QUICK_BTN_STYLE} onClick={fillMortgage}>
                      🏦 Mortgage Payment &nbsp;<span style={{ opacity: 0.7, fontWeight: 400 }}>
                        ${selectedProp.mortgage_payment}/{selectedProp.mortgage_frequency || 'mo'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Amount *</label>
              <input type="number" step="0.01" min="0" value={formData.amount}
                onChange={e => set('amount', parseFloat(e.target.value) || 0)}
                onFocus={selectOnFocus} required />
            </div>

            <div className="form-group">
              <label>Category *</label>
              <select value={formData.expense_category} onChange={e => setCategory(e.target.value)} required>
                <option value="">Select Category</option>
                {INITIAL_OPTIONS.expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Type *</label>
              <select value={formData.expense_type} onChange={e => set('expense_type', e.target.value)} required>
                <option value="">Select Type</option>
                {INITIAL_OPTIONS.expenseTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group full-width">
              <label>Notes</label>
              <textarea rows="3" value={formData.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            <div className="form-group full-width">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={formData.tax_deductible}
                  onChange={e => set('tax_deductible', e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: 'var(--accent-primary)', cursor: 'pointer' }} />
                Tax deductible
                <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                  — uncheck if this expense cannot be claimed as a tax deduction
                </span>
              </label>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{expense ? 'Update' : 'Add'} Expense</button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

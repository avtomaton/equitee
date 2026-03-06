import { useState } from 'react';
import { API_URL, INITIAL_OPTIONS } from '../config.js';

const toFormState = (expense, property) => expense ? {
  property_id:      expense.property_id ?? '',
  expense_date:     expense.expense_date ?? new Date().toISOString().split('T')[0],
  amount:           expense.amount ?? 0,
  expense_type:     expense.expense_type ?? '',
  expense_category: expense.expense_category ?? '',
  notes: expense.notes ?? '',
} : {
  property_id:      property?.id ?? '',
  expense_date:     new Date().toISOString().split('T')[0],
  amount: 0, expense_type: '', expense_category: '', notes: '',
};

export default function ExpenseModal({ expense, properties, property, onClose, onSave }) {
  const [formData, setFormData] = useState(() => toFormState(expense, property));

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url    = expense ? `${API_URL}/expenses/${expense.id}` : `${API_URL}/expenses`;
      const method = expense ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId:      formData.property_id,
          expenseDate:     formData.expense_date,
          amount:          formData.amount,
          expenseType:     formData.expense_type,
          expenseCategory: formData.expense_category,
          notes: formData.notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSave();
    } catch (err) {
      console.error(err);
      alert('Failed to save expense');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{expense ? 'Edit Expense' : 'Add New Expense'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Property *</label>
              <select value={formData.property_id} onChange={(e) => set('property_id', e.target.value)} required>
                <option value="">Select Property</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Date *</label>
              <input type="date" value={formData.expense_date} onChange={(e) => set('expense_date', e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Amount *</label>
              <input type="number" step="0.01" min="0" value={formData.amount}
                onChange={(e) => set('amount', parseFloat(e.target.value) || 0)} required />
            </div>

            <div className="form-group">
              <label>Category *</label>
              <select value={formData.expense_category} onChange={(e) => set('expense_category', e.target.value)} required>
                <option value="">Select Category</option>
                {INITIAL_OPTIONS.expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Type *</label>
              <select value={formData.expense_type} onChange={(e) => set('expense_type', e.target.value)} required>
                <option value="">Select Type</option>
                {INITIAL_OPTIONS.expenseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group full-width">
              <label>Notes</label>
              <textarea rows="3" value={formData.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{expense ? 'Update' : 'Add'} Expense</button>
          </div>
        </form>
      </div>
    </div>
  );
}

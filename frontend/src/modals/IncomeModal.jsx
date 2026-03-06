import { useState } from 'react';
import { API_URL, INITIAL_OPTIONS } from '../config.js';

const toFormState = (income, property) => income ? {
  property_id: income.property_id ?? '',
  income_date: income.income_date ?? new Date().toISOString().split('T')[0],
  amount:      income.amount ?? 0,
  income_type: income.income_type ?? '',
  notes: income.notes ?? '',
} : {
  property_id: property?.id ?? '',
  income_date: new Date().toISOString().split('T')[0],
  amount: 0, income_type: '', notes: '',
};

export default function IncomeModal({ income, properties, property, onClose, onSave }) {
  const [formData, setFormData] = useState(() => toFormState(income, property));

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url    = income ? `${API_URL}/income/${income.id}` : `${API_URL}/income`;
      const method = income ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId:  formData.property_id,
          incomeDate:  formData.income_date,
          amount:      formData.amount,
          incomeType:  formData.income_type,
          notes: formData.notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSave();
    } catch (err) {
      console.error(err);
      alert('Failed to save income');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{income ? 'Edit Income' : 'Add New Income'}</h2>
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
              <input type="date" value={formData.income_date} onChange={(e) => set('income_date', e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Amount *</label>
              <input type="number" step="0.01" min="0" value={formData.amount}
                onChange={(e) => set('amount', parseFloat(e.target.value) || 0)} required />
            </div>

            <div className="form-group">
              <label>Type *</label>
              <select value={formData.income_type} onChange={(e) => set('income_type', e.target.value)} required>
                <option value="">Select Type</option>
                {INITIAL_OPTIONS.incomeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group full-width">
              <label>Notes</label>
              <textarea rows="3" value={formData.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{income ? 'Update' : 'Add'} Income</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { API_URL } from '../config.js';

export default function IncomeModal({ income, properties, property, onClose, onSave }) {
  const [formData, setFormData] = useState(income || {
    property_id: property?.id || '',
    income_date: new Date().toISOString().split('T')[0],
    amount: 0, income_type: '', description: '',
  });

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
          description: formData.description,
        }),
      });
      if (!res.ok) throw new Error('Failed to save income');
      onSave();
    } catch (error) {
      console.error(error);
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
              <input type="number" step="0.01" value={formData.amount} onChange={(e) => set('amount', parseFloat(e.target.value) || 0)} required />
            </div>
            <div className="form-group">
              <label>Type *</label>
              <select value={formData.income_type} onChange={(e) => set('income_type', e.target.value)} required>
                <option value="">Select Type</option>
                <option value="Rent">Rent</option>
                <option value="Security Deposit">Security Deposit</option>
                <option value="Late Fee">Late Fee</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group full-width">
              <label>Description</label>
              <textarea rows="3" value={formData.description} onChange={(e) => set('description', e.target.value)} />
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

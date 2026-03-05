import { useState } from 'react';
import { API_URL } from '../config.js';

export default function PropertyModal({ property, onClose, onSave }) {
  const [formData, setFormData] = useState(property || {
    name: '', province: '', city: '', address: '',
    postalCode: '', parking: '', purchasePrice: 0,
    marketPrice: 0, loanAmount: 0, monthlyRent: 0,
    possDate: '', status: 'active',
  });

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url    = property ? `${API_URL}/properties/${property.id}` : `${API_URL}/properties`;
      const method = property ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to save property');
      onSave();
    } catch (error) {
      console.error(error);
      alert('Failed to save property');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{property ? 'Edit Property' : 'Add New Property'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Property Name *</label>
              <input type="text" value={formData.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Province *</label>
              <input type="text" value={formData.province} onChange={(e) => set('province', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>City *</label>
              <input type="text" value={formData.city} onChange={(e) => set('city', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Address *</label>
              <input type="text" value={formData.address} onChange={(e) => set('address', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Postal Code *</label>
              <input type="text" value={formData.postalCode} onChange={(e) => set('postalCode', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Parking</label>
              <input type="text" value={formData.parking} onChange={(e) => set('parking', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Purchase Price *</label>
              <input type="number" value={formData.purchasePrice} onChange={(e) => set('purchasePrice', parseFloat(e.target.value) || 0)} required />
            </div>
            <div className="form-group">
              <label>Market Price *</label>
              <input type="number" value={formData.marketPrice} onChange={(e) => set('marketPrice', parseFloat(e.target.value) || 0)} required />
            </div>
            <div className="form-group">
              <label>Loan Amount *</label>
              <input type="number" value={formData.loanAmount} onChange={(e) => set('loanAmount', parseFloat(e.target.value) || 0)} required />
            </div>
            <div className="form-group">
              <label>Monthly Rent *</label>
              <input type="number" value={formData.monthlyRent} onChange={(e) => set('monthlyRent', parseFloat(e.target.value) || 0)} required />
            </div>
            <div className="form-group">
              <label>Possession Date *</label>
              <input type="date" value={formData.possDate} onChange={(e) => set('possDate', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Status *</label>
              <select value={formData.status} onChange={(e) => set('status', e.target.value)} required>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{property ? 'Update' : 'Add'} Property</button>
          </div>
        </form>
      </div>
    </div>
  );
}

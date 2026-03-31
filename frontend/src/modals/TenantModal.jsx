import { useState } from 'react';
import { createTenant, updateTenant } from '../api.js';
import { ModalOverlay, DateInput, selectOnFocus, today, PropertyOptions } from './ModalBase.jsx';

const toFormState_Tenant = (tenant, property) => tenant ? {
  property_id: tenant.property_id ?? '',
  name:        tenant.name        ?? '',
  phone:       tenant.phone       ?? '',
  email:       tenant.email       ?? '',
  notes:       tenant.notes       ?? '',
  lease_start: tenant.lease_start ?? '',
  lease_end:   tenant.lease_end   ?? '',
  deposit:     tenant.deposit     ?? 0,
  rent_amount: tenant.rent_amount ?? 0,
} : {
  property_id: property?.id ?? '',
  name: '', phone: '', email: '', notes: '',
  lease_start: today(),
  lease_end: '', deposit: 0, rent_amount: 0,
};

export default function TenantModal({ tenant, properties, property, onClose, onSave }) {
  const [formData, setFormData] = useState(() => toFormState_Tenant(tenant, property ?? properties[0]));

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        propertyId: formData.property_id, name: formData.name,
        phone: formData.phone, email: formData.email, notes: formData.notes,
        leaseStart: formData.lease_start, leaseEnd: formData.lease_end || null,
        deposit: formData.deposit, rentAmount: formData.rent_amount,
      };
      if (tenant) {
        await updateTenant(tenant.id, payload);
      } else {
        await createTenant(payload);
      }
      onSave();
    } catch (err) { console.error(err); alert('Failed to save tenant'); }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{tenant ? 'Edit Tenant' : 'Add New Tenant'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Property *</label>
              <select value={formData.property_id} onChange={e => set('property_id', e.target.value)} required>
                <PropertyOptions properties={properties} />
              </select>
            </div>

            <div className="form-group">
              <label>Full Name *</label>
              <input type="text" value={formData.name} onChange={e => set('name', e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Phone</label>
              <input type="tel" value={formData.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 555-5555" />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input type="email" value={formData.email} onChange={e => set('email', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Lease Start *</label>
              <DateInput value={formData.lease_start} onChange={e => set('lease_start', e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Lease End <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(leave empty if current)</span></label>
              <DateInput value={formData.lease_end} onChange={e => set('lease_end', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Deposit ($)</label>
              <input type="number" step="0.01" min="0" value={formData.deposit}
                onChange={e => set('deposit', parseFloat(e.target.value) || 0)}
                onFocus={selectOnFocus} />
            </div>

            <div className="form-group">
              <label>Rent Amount ($/month)</label>
              <input type="number" step="0.01" min="0" value={formData.rent_amount}
                onChange={e => set('rent_amount', parseFloat(e.target.value) || 0)}
                onFocus={selectOnFocus} />
            </div>

            <div className="form-group full-width">
              <label>Notes</label>
              <textarea rows="3" value={formData.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{tenant ? 'Update' : 'Add'} Tenant</button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

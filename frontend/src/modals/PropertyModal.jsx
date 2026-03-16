import { useState } from 'react';
import { ModalOverlay, DateInput, selectOnFocus } from './ModalBase.jsx';
import { API_URL, PROVINCES, INITIAL_OPTIONS } from '../config.js';
import { formatPostalCode } from '../utils.js';

const toFormState = (p) => p ? {
  name:                 p.name                 ?? '',
  province:             p.province             ?? '',
  city:                 p.city                 ?? '',
  address:              p.address              ?? '',
  postalCode:           p.postal_code          ?? p.postalCode          ?? '',
  parking:              p.parking              ?? '',
  purchasePrice:        p.purchase_price       ?? p.purchasePrice       ?? 0,
  marketPrice:          p.market_price         ?? p.marketPrice         ?? 0,
  loanAmount:           p.loan_amount          ?? p.loanAmount          ?? 0,
  mortgageRate:         p.mortgage_rate        ?? p.mortgageRate        ?? 0,
  monthlyRent:          p.monthly_rent         ?? p.monthlyRent         ?? 0,
  possDate:             p.poss_date            ?? p.possDate            ?? '',
  status:               p.status               ?? 'Rented',
  type:                 p.type                 ?? 'Condo',
  notes:                p.notes                ?? '',
  expectedCondoFees:    p.expected_condo_fees        ?? p.expectedCondoFees      ?? 0,
  expectedInsurance:    p.expected_insurance         ?? p.expectedInsurance      ?? 0,
  expectedUtilities:    p.expected_utilities         ?? p.expectedUtilities      ?? 0,
  expectedMiscExpenses: p.expected_misc_expenses     ?? p.expectedMiscExpenses   ?? 0,
  expectedAppreciationPct: p.expected_appreciation_pct ?? p.expectedAppreciationPct ?? 0,
  annualPropertyTax:    p.annual_property_tax      ?? p.annualPropertyTax    ?? 0,
  mortgagePayment:      p.mortgage_payment         ?? p.mortgagePayment      ?? 0,
  mortgageFrequency:    p.mortgage_frequency       ?? p.mortgageFrequency    ?? 'monthly',
} : {
  name: '', province: '', city: '', address: '', postalCode: '',
  parking: '', purchasePrice: 0, marketPrice: 0, loanAmount: 0, mortgageRate: 0,
  monthlyRent: 0, possDate: '', status: 'Rented', type: 'Condo', notes: '',
  expectedCondoFees: 0, expectedInsurance: 0, expectedUtilities: 0, expectedMiscExpenses: 0,
  expectedAppreciationPct: 0, annualPropertyTax: 0,
  mortgagePayment: 0, mortgageFrequency: 'monthly',
};

export default function PropertyModal({ property, onClose, onSave }) {
  const [formData, setFormData] = useState(() => toFormState(property));
  const [errors,   setErrors]   = useState({});

  const prevStatus = property?.status ?? null;

  const isVacant  = formData.status === 'Vacant';
  const isRented  = formData.status === 'Rented';
  // Warn when switching TO Rented and rent is still 0
  const rentWarn  = isRented && formData.monthlyRent === 0;
  // Rent field is locked to 0 when Vacant
  const rentLocked = isVacant;

  const set = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }));
  };

  const handleStatusChange = (newStatus) => {
    if (newStatus === 'Vacant') {
      // Force rent to 0 immediately
      setFormData(prev => ({ ...prev, status: newStatus, monthlyRent: 0 }));
    } else {
      setFormData(prev => ({ ...prev, status: newStatus }));
    }
    if (errors.status) setErrors(e => ({ ...e, status: null }));
  };

  const validate = () => {
    const e = {};
    if (!formData.name.trim())    e.name     = 'Required';
    if (!formData.province)       e.province = 'Required';
    if (!formData.city.trim())    e.city     = 'Required';
    if (!formData.address.trim()) e.address  = 'Required';
    if (!formData.possDate)       e.possDate = 'Required';
    const pc = formData.postalCode.replace(/\s/g, '');
    if (pc && !/^[A-Za-z]\d[A-Za-z]\d[A-Za-z]\d$/.test(pc))
      e.postalCode = 'Format: A1A 1A1';
    if (isVacant && formData.monthlyRent !== 0)
      e.monthlyRent = 'Must be 0 when Vacant';
    if (isRented && formData.monthlyRent === 0)
      e.monthlyRent = 'Please enter the rent amount';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      const url    = property ? `${API_URL}/properties/${property.id}` : `${API_URL}/properties`;
      const method = property ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error(await res.text());
      onSave();
    } catch (err) {
      console.error(err);
      alert('Failed to save property');
    }
  };

  const err = (key) => errors[key]
    ? <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{errors[key]}</span>
    : null;

  const rentBorderColor = rentLocked
    ? 'var(--text-tertiary)'
    : rentWarn
      ? 'var(--warning, #f59e0b)'
      : errors.monthlyRent
        ? 'var(--danger)'
        : undefined;

  const rentBg = rentLocked
    ? 'rgba(255,255,255,0.03)'
    : rentWarn
      ? 'rgba(245,158,11,0.08)'
      : undefined;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{property ? 'Edit Property' : 'Add New Property'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {/* Name */}
            <div className="form-group full-width">
              <label>Property Name *</label>
              <input type="text" value={formData.name} onChange={e => set('name', e.target.value)} />
              {err('name')}
            </div>

            {/* Type */}
            <div className="form-group">
              <label>Type *</label>
              <select value={formData.type} onChange={e => set('type', e.target.value)}>
                {INITIAL_OPTIONS.propertyTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Status */}
            <div className="form-group">
              <label>Status *</label>
              <select value={formData.status} onChange={e => handleStatusChange(e.target.value)}>
                {INITIAL_OPTIONS.propertyStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Province */}
            <div className="form-group">
              <label>Province *</label>
              <select value={formData.province} onChange={e => set('province', e.target.value)}>
                <option value="">Select Province</option>
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {err('province')}
            </div>

            {/* City */}
            <div className="form-group">
              <label>City *</label>
              <input type="text" value={formData.city} onChange={e => set('city', e.target.value)} />
              {err('city')}
            </div>

            {/* Address */}
            <div className="form-group full-width">
              <label>Address *</label>
              <input type="text" value={formData.address} onChange={e => set('address', e.target.value)} />
              {err('address')}
            </div>

            {/* Postal code */}
            <div className="form-group">
              <label>Postal Code</label>
              <input type="text" value={formData.postalCode} placeholder="A1A 1A1"
                onChange={e => set('postalCode', formatPostalCode(e.target.value))} maxLength={7} />
              {err('postalCode')}
            </div>

            {/* Parking */}
            <div className="form-group">
              <label>Parking</label>
              <input type="text" value={formData.parking} onChange={e => set('parking', e.target.value)} />
            </div>

            {/* Purchase price */}
            <div className="form-group">
              <label>Purchase Price *</label>
              <input type="number" min="0" step="0.01" value={formData.purchasePrice}
                onChange={e => set('purchasePrice', parseFloat(e.target.value) || 0)}
                onFocus={selectOnFocus} />
            </div>

            {/* Market price */}
            <div className="form-group">
              <label>Market Price *</label>
              <input type="number" min="0" step="0.01" value={formData.marketPrice}
                onChange={e => set('marketPrice', parseFloat(e.target.value) || 0)}
                onFocus={selectOnFocus} />
            </div>

            {/* Loan amount */}
            <div className="form-group">
              <label>Loan Amount *</label>
              <input type="number" min="0" step="0.01" value={formData.loanAmount}
                onChange={e => set('loanAmount', parseFloat(e.target.value) || 0)}
                onFocus={selectOnFocus} />
            </div>

            {/* Mortgage rate */}
            <div className="form-group">
              <label>Mortgage Rate (% annual)</label>
              <input type="number" min="0" max="30" step="0.01"
                value={formData.mortgageRate}
                placeholder="e.g. 5.25"
                onChange={e => set('mortgageRate', parseFloat(e.target.value) || 0)}
                onFocus={selectOnFocus} />
            </div>

            {/* Monthly rent — with vacancy/rented highlighting */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Monthly Rent *
                {isVacant && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    (locked — property is Vacant)
                  </span>
                )}
                {rentWarn && !isVacant && (
                  <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>
                    ⚠ Enter rent amount
                  </span>
                )}
              </label>
              <input
                type="number" min="0" step="0.01" value={formData.monthlyRent}
                disabled={rentLocked}
                style={{
                  borderColor: rentBorderColor,
                  background:  rentBg,
                  opacity: rentLocked ? 0.5 : 1,
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onChange={e => {
                  if (!rentLocked) set('monthlyRent', parseFloat(e.target.value) || 0);
                }}
              />
              {err('monthlyRent')}
            </div>

            {/* Possession date */}
            <div className="form-group">
              <label>Possession Date *</label>
              <DateInput value={formData.possDate} onChange={e => set('possDate', e.target.value)} />
              {err('possDate')}
            </div>

            <div className="form-group full-width">
              <label>Notes</label>
              <textarea rows="3" value={formData.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Any additional notes about this property…" />
            </div>

            {/* ── Mortgage payment details ── */}
            <div className="form-group full-width" style={{ gridColumn: '1 / -1' }}>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.9rem', marginTop: '0.25rem' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--text-tertiary)', margin: '0 0 0.65rem' }}>
                  Mortgage Payment
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '0.5rem' }}>
                    — enables expected cash flow, DSCR, and quick-fill in expense entry
                  </span>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Payment Amount ($)</label>
                    <input type="number" min="0" step="0.01" value={formData.mortgagePayment}
                      onChange={e => set('mortgagePayment', parseFloat(e.target.value) || 0)}
                      onFocus={selectOnFocus} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Frequency</label>
                    <select value={formData.mortgageFrequency} onChange={e => set('mortgageFrequency', e.target.value)}>
                      <option value="monthly">Monthly</option>
                      <option value="semi-monthly">Semi-monthly (24/yr)</option>
                      <option value="bi-weekly">Bi-weekly (26/yr)</option>
                      <option value="weekly">Weekly (52/yr)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Expected monthly costs ── */}
            <div className="form-group full-width" style={{ gridColumn: '1 / -1' }}>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.9rem', marginTop: '0.25rem' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--text-tertiary)', margin: '0 0 0.65rem' }}>
                  Expected Monthly Costs &amp; Growth
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '0.5rem' }}>
                    — used to compute target NOI, cap rate, DSCR, CoC, and appreciation benchmarks
                  </span>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Condo Fees/mo ($)
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '0.3rem', fontSize: '0.72rem' }}>HOA / strata</span>
                    </label>
                    <input type="number" min="0" step="0.01" value={formData.expectedCondoFees}
                      onChange={e => set('expectedCondoFees', parseFloat(e.target.value) || 0)}
                      onFocus={selectOnFocus} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Insurance/mo ($)</label>
                    <input type="number" min="0" step="0.01" value={formData.expectedInsurance}
                      onChange={e => set('expectedInsurance', parseFloat(e.target.value) || 0)}
                      onFocus={selectOnFocus} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Utilities/mo ($)
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '0.3rem', fontSize: '0.72rem' }}>hydro, gas, water…</span>
                    </label>
                    <input type="number" min="0" step="0.01" value={formData.expectedUtilities}
                      onChange={e => set('expectedUtilities', parseFloat(e.target.value) || 0)}
                      onFocus={selectOnFocus} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Misc Expenses/mo ($)
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '0.3rem', fontSize: '0.72rem' }}>contingency, other</span>
                    </label>
                    <input type="number" min="0" step="0.01" value={formData.expectedMiscExpenses}
                      onChange={e => set('expectedMiscExpenses', parseFloat(e.target.value) || 0)}
                      onFocus={selectOnFocus} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Annual Property Tax ($)</label>
                    <input type="number" min="0" step="0.01" value={formData.annualPropertyTax}
                      onChange={e => set('annualPropertyTax', parseFloat(e.target.value) || 0)}
                      onFocus={selectOnFocus} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Expected Yearly Appreciation (%)
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '0.3rem', fontSize: '0.72rem' }}>of purchase price</span>
                    </label>
                    <input type="number" min="0" max="50" step="0.1"
                      value={formData.expectedAppreciationPct}
                      placeholder="e.g. 3.5"
                      onChange={e => set('expectedAppreciationPct', parseFloat(e.target.value) || 0)}
                      onFocus={selectOnFocus} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{property ? 'Update' : 'Add'} Property</button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

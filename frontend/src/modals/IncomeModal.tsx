import { useState, useMemo, type FormEvent } from 'react';
import { INITIAL_OPTIONS } from '../config';
import { usePortfolioData } from '../context/PortfolioDataContext';
import { ModalOverlay, DateInput, selectOnFocus, today, QUICK_BTN_STYLE, PropertyOptions } from './ModalBase';
import type { Property } from '../types';

interface Income {
  id: number;
  property_id: number;
  income_date: string;
  amount: number;
  income_type: string;
  notes: string;
}

interface IncomeFormData {
  property_id: string;
  income_date: string;
  amount: number;
  income_type: string;
  notes: string;
}

interface IncomeModalProps {
  income: Income | null;
  properties: Property[];
  property: Property | null;
  onClose: () => void;
  onSave: () => void;
  onError?: (message: string) => void;
}

const toFormState = (income: Income | null, property: Property | null): IncomeFormData => income ? {
  property_id: String(income.property_id),
  income_date: income.income_date ?? today(),
  amount:      income.amount ?? 0,
  income_type: income.income_type ?? '',
  notes:       income.notes ?? '',
} : {
  property_id: property?.id ? String(property.id) : '',
  income_date: today(),
  amount: 0, income_type: '', notes: '',
};

export default function IncomeModal({ income, properties, property, onClose, onSave, onError }: IncomeModalProps) {
  const [formData, setFormData] = useState<IncomeFormData>(() => toFormState(income, property ?? properties[0]));
  const { addIncome, editIncome } = usePortfolioData();

   
  const set = (field: keyof IncomeFormData, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const selectedProp = useMemo(() =>
    properties.find(p => String(p.id) === String(formData.property_id)) ?? null,
  [properties, formData.property_id]);

  const fillRent = () => {
    if (!selectedProp?.monthly_rent) return;
    setFormData(prev => ({ ...prev, amount: selectedProp.monthly_rent ?? 0, income_type: 'Rent', notes: 'Monthly rent' }));
  };

  const hasRent       = (selectedProp?.monthly_rent ?? 0) > 0;
  const showQuickFill = !income && hasRent;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        propertyId: formData.property_id,
        incomeDate: formData.income_date,
        amount: formData.amount,
        incomeType: formData.income_type,
        notes: formData.notes,
      };
      if (income) {
        await editIncome(income.id, payload);
      } else {
        await addIncome(payload);
      }
      onSave();
    } catch (err) {
      console.error(err);
      (onError || alert)('Failed to save income');
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{income ? 'Edit Income' : 'Add New Income'}</h2>
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
              <label>Date *</label>
              <DateInput value={formData.income_date} onChange={e => set('income_date', e.target.value)} required />
            </div>

            {showQuickFill && (
              <div className="form-group full-width" style={{ marginBottom: '0.25rem' }}>
                <label style={{ marginBottom: '0.4rem', display: 'block' }}>
                  Quick-fill
                  <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '0.4rem', fontSize: '0.72rem' }}>
                    — pre-fills amount and type from property settings
                  </span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {hasRent && selectedProp && (
                    <button type="button" style={QUICK_BTN_STYLE} onClick={fillRent}>
                      🏠 Rent &nbsp;<span style={{ opacity: 0.7, fontWeight: 400 }}>${selectedProp.monthly_rent ?? 0}/mo</span>
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
              <label>Type *</label>
              <select value={formData.income_type} onChange={e => set('income_type', e.target.value)} required>
                <option value="">Select Type</option>
                {INITIAL_OPTIONS.incomeTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group full-width">
              <label>Notes</label>
              <textarea rows={3} value={formData.notes as string} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{income ? 'Update' : 'Add'} Income</button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { INITIAL_OPTIONS } from '../config';
import { usePortfolioData } from '../context/PortfolioDataContext';
import { updatePropertyLoan } from '../api';
import { ModalOverlay, DateInput, selectOnFocus, today, QUICK_BTN_STYLE, PropertyOptions } from './ModalBase';
import type { Property } from '../types';

interface ExpenseFormData {
  property_id: string;
  expense_date: string;
  amount: number;
  expense_type: string;
  expense_category: string;
  notes: string;
  tax_deductible: boolean;
}

interface ExpenseModalProps {
  expense: Record<string, unknown> | null;
  properties: Property[];
  property: Property | null;
  onClose: () => void;
  onSave: () => void;
  onError?: (message: string) => void;
}

const toFormState = (expense: Record<string, unknown> | null, property: Property | null): ExpenseFormData => expense ? {
  property_id: String(expense.property_id ?? ''),
  expense_date: String(expense.expense_date ?? today()),
  amount: Number(expense.amount ?? 0),
  expense_type: String(expense.expense_type ?? ''),
  expense_category: String(expense.expense_category ?? ''),
  notes: String(expense.notes ?? ''),
  tax_deductible: expense.tax_deductible === undefined ? true : Boolean(expense.tax_deductible),
} : {
  property_id: property?.id ? String(property.id) : '',
  expense_date: today(),
  amount: 0, expense_type: '', expense_category: '', notes: '',
  tax_deductible: true,
};

const NON_DEDUCTIBLE_CATEGORIES = ['Mortgage', 'Principal'];
const AVG_DAYS_PER_MONTH = 365.25 / 12;

const freqToDays = (freq: string): number => {
  if (freq === 'bi-weekly') return 14;
  if (freq === 'semi-monthly') return 15;
  if (freq === 'weekly') return 7;
  return AVG_DAYS_PER_MONTH;
};

export default function ExpenseModal({ expense, properties, property, onClose, onSave, onError }: ExpenseModalProps) {
  const [formData, setFormData] = useState<ExpenseFormData>(() => toFormState(expense, property ?? properties[0]));
  const { addExpense, editExpense } = usePortfolioData();
  const [loanAmountAfter, setLoanAmountAfter] = useState<number | ''>('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (field: keyof ExpenseFormData, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const setCategory = (category: string) => setFormData(prev => ({
    ...prev, expense_category: category,
    tax_deductible: category === '' ? prev.tax_deductible : !NON_DEDUCTIBLE_CATEGORIES.includes(category),
  }));

  const selectedProp = useMemo(() =>
    properties.find(p => String(p.id) === String(formData.property_id)) ?? null,
    [properties, formData.property_id]
  );

  const quickFill = (patch: Partial<ExpenseFormData>) => setFormData(prev => {
    const merged = { ...prev, ...patch };
    if ('expense_category' in patch && patch.expense_category !== '')
      merged.tax_deductible = !NON_DEDUCTIBLE_CATEGORIES.includes(patch.expense_category as string);
    return merged;
  });

  const fillCondoFees = () => {
    if (!selectedProp?.expected_condo_fees) return;
    quickFill({ amount: selectedProp.expected_condo_fees, expense_category: 'Management', expense_type: 'Recurrent', notes: 'Condo fees' });
  };
  const fillMortgage = () => {
    if (!selectedProp?.mortgage_payment) return;
    quickFill({ amount: selectedProp.mortgage_payment, expense_category: 'Mortgage', expense_type: 'Recurrent',
      notes: `Mortgage payment (${selectedProp.mortgage_frequency || 'monthly'})` });
  };
  const fillInsurance = () => {
    if (!selectedProp?.expected_insurance) return;
    quickFill({ amount: selectedProp.expected_insurance, expense_category: 'Insurance', expense_type: 'Recurrent', notes: 'Insurance' });
  };

  const hasCondoFees = (selectedProp?.expected_condo_fees ?? 0) > 0;
  const hasMortgage = (selectedProp?.mortgage_payment ?? 0) > 0;
  const hasInsurance = (selectedProp?.expected_insurance ?? 0) > 0;
  const showQuickFill = !expense && (hasCondoFees || hasMortgage || hasInsurance);

  const isMortgageLike = formData.expense_category === 'Mortgage' || formData.expense_category === 'Principal';
  const showLoanField = !expense && isMortgageLike;

  useEffect(() => {
    if (!showLoanField || !selectedProp?.loan_amount) { setLoanAmountAfter(''); return; }
    const loanNow = selectedProp.loan_amount;
    let principal = formData.amount;
    if (formData.expense_category === 'Mortgage' && (selectedProp.mortgage_rate ?? 0) > 0) {
      const dailyRate = (selectedProp.mortgage_rate ?? 0) / 100 / 365.25;
      const days = freqToDays(selectedProp.mortgage_frequency ?? 'monthly');
      const interest = loanNow * dailyRate * days;
      principal = Math.max(0, formData.amount - interest);
    }
    setLoanAmountAfter(+(Math.max(0, loanNow - principal).toFixed(2)));
  }, [showLoanField, selectedProp, formData.amount, formData.expense_category]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        propertyId: formData.property_id, expenseDate: formData.expense_date,
        amount: formData.amount, expenseType: formData.expense_type,
        expenseCategory: formData.expense_category, notes: formData.notes,
        taxDeductible: formData.tax_deductible,
      };
      if (expense) {
        await editExpense(Number(expense.id), payload);
      } else {
        await addExpense(payload);
        if (isMortgageLike && loanAmountAfter !== '' && formData.property_id) {
          const desc = `Loan balance updated after ${formData.expense_category} payment of $${formData.amount} on ${formData.expense_date}`;
          await updatePropertyLoan(Number(formData.property_id), { loanAmount: loanAmountAfter, description: desc });
        }
      }
      onSave();
    } catch (err) { console.error(err); (onError || alert)('Failed to save expense'); }
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
                <PropertyOptions properties={properties} />
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
                    — pre-fills amount, category & type from property settings
                  </span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {hasCondoFees && (
                    <button type="button" style={QUICK_BTN_STYLE} onClick={fillCondoFees}>
                      🏢 Condo Fees &nbsp;<span style={{ opacity: 0.7, fontWeight: 400 }}>${selectedProp?.expected_condo_fees ?? 0}/mo</span>
                    </button>
                  )}
                  {hasMortgage && (
                    <button type="button" style={QUICK_BTN_STYLE} onClick={fillMortgage}>
                      🏦 Mortgage Payment &nbsp;<span style={{ opacity: 0.7, fontWeight: 400 }}>
                        ${selectedProp?.mortgage_payment ?? 0}/{selectedProp?.mortgage_frequency || 'mo'}
                      </span>
                    </button>
                  )}
                  {hasInsurance && (
                    <button type="button" style={QUICK_BTN_STYLE} onClick={fillInsurance}>
                      🛡️ Insurance &nbsp;<span style={{ opacity: 0.7, fontWeight: 400 }}>${selectedProp?.expected_insurance ?? 0}/mo</span>
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
            {showLoanField && (
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  Loan Balance After
                  <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>— estimated · editable</span>
                </label>
                <input type="number" step="0.01" min="0" value={loanAmountAfter}
                  onChange={e => setLoanAmountAfter(parseFloat(e.target.value) || 0)}
                  onFocus={selectOnFocus}
                  style={{ background: 'rgba(234,179,8,0.12)', borderColor: 'rgba(234,179,8,0.55)', outline: 'none' }}
                  title="Estimated loan balance after this payment. Will be saved to the property record." />
              </div>
            )}
            <div className="form-group">
              <label>Type *</label>
              <select value={formData.expense_type} onChange={e => set('expense_type', e.target.value)} required>
                <option value="">Select Type</option>
                {INITIAL_OPTIONS.expenseTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea rows={3} value={formData.notes as string} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} />
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

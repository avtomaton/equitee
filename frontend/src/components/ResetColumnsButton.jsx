/**
 * ResetColumnsButton — small inline link shown when column visibility differs from defaults.
 * Extracted from ExpensesView, IncomeView, TenantsView, EventsView to avoid duplication.
 */
export default function ResetColumnsButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', fontSize: '0.75rem',
        color: 'var(--accent-primary)', cursor: 'pointer', padding: '0 2px',
        textDecoration: 'underline', opacity: 0.8, whiteSpace: 'nowrap',
      }}
    >
      ↺ reset cols
    </button>
  );
}

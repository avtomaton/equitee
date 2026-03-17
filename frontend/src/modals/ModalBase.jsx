import { useRef } from 'react';

// ── Shared modal utilities ────────────────────────────────────────────────────

/** Today's date as a YYYY-MM-DD string (for form default values). */
export const today = () => new Date().toISOString().split('T')[0];

/** Shared style for quick-fill buttons across modals. */
export const QUICK_BTN_STYLE = {
  padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.78rem',
  cursor: 'pointer', fontWeight: 600, border: '1px solid var(--accent-primary)',
  background: 'rgba(59,130,246,0.1)', color: 'var(--accent-primary)',
  transition: 'background 0.15s',
};

/**
 * PropertyOptions — reusable <option> list for property selects.
 * Usage: <select ...><PropertyOptions properties={properties} /></select>
 * Omit `placeholder` to skip the leading blank option (e.g. navigation selectors).
 */
export function PropertyOptions({ properties, placeholder }) {
  return (
    <>
      {placeholder != null && <option value="">{placeholder}</option>}
      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </>
  );
}

/**
 * ModalOverlay — backdrop that only closes when the user clicks directly on it.
 *
 * Problem with `onClick={onClose}`: if the user presses the mouse button inside
 * the modal, drags outside, and releases on the backdrop, the browser fires a
 * click event on the overlay (nearest common ancestor of mousedown + mouseup
 * targets), which unintentionally closes the modal.
 *
 * Fix: close only when BOTH mousedown AND mouseup happen on the backdrop itself.
 */
export function ModalOverlay({ onClose, children }) {
  const downOnBackdrop = useRef(false);

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={e => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose();
        downOnBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}

/**
 * DateInput — native date input with an explicit calendar-picker button.
 *
 * Supports both keyboard typing (full YYYY-MM-DD entry) and clicking 📅 to
 * open the browser's native date picker via `showPicker()`.
 * The picker button is excluded from Tab order (tabIndex={-1}).
 */
export function DateInput({ value, onChange, required, id, style, ...rest }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    inputRef.current?.focus();
    try { inputRef.current?.showPicker(); } catch { /* not supported in all browsers */ }
  };

  return (
    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'stretch', ...style }}>
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value}
        onChange={onChange}
        required={required}
        style={{ flex: 1, minWidth: 0 }}
        {...rest}
      />
      <button
        type="button"
        onClick={openPicker}
        tabIndex={-1}
        title="Open calendar"
        style={{
          padding: '0 0.6rem', borderRadius: '6px',
          border: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: '0.95rem',
          lineHeight: 1, flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        📅
      </button>
    </div>
  );
}

/**
 * selectOnFocus — onFocus handler that selects all text in a number/text input.
 * Use: <input type="number" onFocus={selectOnFocus} ... />
 *
 * The setTimeout defers the select() call until after the browser's own focus
 * handling, which is required for reliable cross-browser behaviour.
 */
export const selectOnFocus = e => {
  const target = e.target;
  setTimeout(() => target.select(), 0);
};

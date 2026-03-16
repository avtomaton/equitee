import { useState } from 'react';

/**
 * Generic collapsible panel with a labelled header.
 *
 * Props:
 *   title        — header text
 *   defaultOpen  — start expanded (default false)
 *   headerRight  — optional React node rendered to the right of the title
 *   children     — panel body
 */
export default function Collapsible({ title, defaultOpen = false, children, headerRight }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="table-container" style={{ marginBottom: '1.25rem' }}>
      <div
        className="table-header"
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <div className="table-title">{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {headerRight}
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
            {open ? '▲ collapse' : '▼ expand'}
          </span>
        </div>
      </div>
      {open && children}
    </div>
  );
}

import { useState, ReactNode } from 'react';

interface CollapsibleProps {
  title: string;
  defaultOpen?: boolean;
  children?: ReactNode;
  headerRight?: ReactNode;
}

/**
 * Generic collapsible panel with a labelled header.
 */
export default function Collapsible({ title, defaultOpen = false, children, headerRight }: CollapsibleProps) {
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

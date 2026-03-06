import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Stat card with optional ℹ tooltip and optional sub-line.
 * sub can be a string like "filtered / base (pct%)" for the income/expenses views.
 */
export default function StatCard({ label, value, cls, tooltip, sub, style }) {
  const [tip, setTip] = useState(null);
  const iconRef = useRef(null);

  const showTip = () => {
    if (!iconRef.current) return;
    const r = iconRef.current.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top });
  };

  return (
    <div className="stat-card" style={style}>
      <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span>{label}</span>
        {tooltip && (
          <span
            ref={iconRef}
            onMouseEnter={showTip}
            onMouseLeave={() => setTip(null)}
            style={{ cursor: 'help', opacity: 0.45, fontSize: '0.7rem', lineHeight: 1, userSelect: 'none' }}
          >ℹ️</span>
        )}
      </div>
      <div className={`stat-value ${cls || ''}`}>{value}</div>
      {sub && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.3rem', lineHeight: 1.3 }}>
          {sub}
        </div>
      )}
      {tip && createPortal(
        <div style={{
          position: 'fixed',
          top: tip.y,
          left: tip.x,
          transform: 'translate(-50%, calc(-100% - 8px))',
          background: '#1a1f2e',
          border: '1px solid #374151',
          borderRadius: '8px',
          padding: '0.6rem 0.9rem',
          fontSize: '0.8rem',
          maxWidth: 300,
          zIndex: 9999,
          color: '#f3f4f6',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          lineHeight: 1.55,
          pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
        }}>
          {tooltip}
        </div>,
        document.body
      )}
    </div>
  );
}

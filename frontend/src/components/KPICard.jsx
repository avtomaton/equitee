import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Large accent-bordered KPI card used in top-of-page portfolio snapshots.
 * accentColor drives the top border colour.
 * tooltip is shown via hover portal (same mechanism as MetricCard).
 */
export default function KPICard({
  label, primary, primaryCls = '',
  secondary, secondaryCls = '',
  tertiary, tooltip, accentColor,
}) {
  const [tip, setTip] = useState(null);
  const iconRef = useRef(null);

  const showTip = () => {
    if (!iconRef.current) return;
    const r = iconRef.current.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top });
  };

  const border = accentColor ? `2px solid ${accentColor}` : '1px solid var(--border)';
  return (
    <div className="metric-card"
      style={{ flex: '1 1 170px', minWidth: 155, borderTop: border }}>
      <div className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span>{label}</span>
        {tooltip && (
          <span ref={iconRef} onMouseEnter={showTip} onMouseLeave={() => setTip(null)}
            style={{ cursor: 'help', opacity: 0.45, fontSize: '0.7rem', userSelect: 'none' }}>ℹ️</span>
        )}
      </div>
      <div className={`metric-primary ${primaryCls}`}>{primary}</div>
      {secondary && <div className={`metric-secondary ${secondaryCls}`}>{secondary}</div>}
      {tertiary  && <div className="metric-tertiary">{tertiary}</div>}

      {tip && createPortal(
        <div style={{
          position: 'fixed', top: tip.y, left: tip.x,
          transform: 'translate(-50%, calc(-100% - 8px))',
          background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px',
          padding: '0.6rem 0.9rem', fontSize: '0.8rem', maxWidth: 320,
          zIndex: 9999, color: '#f3f4f6', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          lineHeight: 1.55, pointerEvents: 'none', whiteSpace: 'pre-wrap',
        }}>
          {tooltip}
        </div>,
        document.body
      )}
    </div>
  );
}

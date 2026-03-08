import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * A richer stat card that supports:
 *   primary   — main large value (string)
 *   primaryCls — color class for primary
 *   secondary  — second value shown slightly smaller below primary (string)
 *   secondaryCls
 *   tertiary   — small muted line at the bottom
 *   label      — card title
 *   tooltip    — hover tooltip text (\n for newlines)
 */
export default function MetricCard({ label, primary, primaryCls, secondary, secondaryCls, tertiary, tertiaryCls, tooltip, style }) {
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
          <span ref={iconRef} onMouseEnter={showTip} onMouseLeave={() => setTip(null)}
            style={{ cursor: 'help', opacity: 0.45, fontSize: '0.7rem', userSelect: 'none' }}>ℹ️</span>
        )}
      </div>

      <div className={`stat-value ${primaryCls || ''}`} style={{ fontSize: '1.6rem', lineHeight: 1.15 }}>
        {primary}
      </div>

      {secondary && (
        <div className={secondaryCls || ''} style={{ fontSize: '1rem', fontWeight: 600, marginTop: '0.15rem' }}>
          {secondary}
        </div>
      )}

      {tertiary && (
        <div className={tertiaryCls || ''} style={{ fontSize: '0.72rem', color: tertiaryCls ? undefined : 'var(--text-tertiary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
          {tertiary}
        </div>
      )}

      {tip && createPortal(
        <div style={{
          position: 'fixed', top: tip.y, left: tip.x,
          transform: 'translate(-50%, calc(-100% - 8px))',
          background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px',
          padding: '0.6rem 0.9rem', fontSize: '0.8rem', maxWidth: 300,
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

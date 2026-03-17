import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const PORTAL_STYLE = {
  position: 'fixed',
  transform: 'translate(-50%, calc(-100% - 8px))',
  background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px',
  padding: '0.6rem 0.9rem', fontSize: '0.8rem', maxWidth: 320,
  zIndex: 9999, color: '#f3f4f6', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
  lineHeight: 1.55, pointerEvents: 'none', whiteSpace: 'pre-wrap',
};

const ICON_STYLE = {
  cursor: 'help', opacity: 0.45, fontSize: '0.7rem', lineHeight: 1, userSelect: 'none',
};

/**
 * useTooltipPortal — shared tooltip logic for StatCard, MetricCard, KPICard.
 *
 * Returns:
 *   iconProps  – spread onto the ℹ️ <span> to wire up show/hide
 *   portal     – ReactPortal (or null) — render this anywhere in the component tree
 */
export default function useTooltipPortal(tooltip) {
  const [tip, setTip]  = useState(null);
  const iconRef        = useRef(null);

  if (!tooltip) return { iconProps: null, portal: null };

  const showTip = () => {
    if (!iconRef.current) return;
    const r = iconRef.current.getBoundingClientRect();
    setTip({ top: r.top, left: r.left + r.width / 2 });
  };

  const iconProps = {
    ref: iconRef,
    onMouseEnter: showTip,
    onMouseLeave: () => setTip(null),
    style: ICON_STYLE,
  };

  const portal = tip
    ? createPortal(
        <div style={{ ...PORTAL_STYLE, top: tip.top, left: tip.left }}>{tooltip}</div>,
        document.body
      )
    : null;

  return { iconProps, portal };
}

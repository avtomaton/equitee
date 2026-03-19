import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const BASE_STYLE = {
  position: 'fixed',
  background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px',
  padding: '0.6rem 0.9rem', fontSize: '0.8rem', maxWidth: 320,
  zIndex: 9999, color: '#f3f4f6', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
  lineHeight: 1.55, pointerEvents: 'none', whiteSpace: 'pre-wrap',
};

const ICON_STYLE = {
  cursor: 'help', opacity: 0.45, fontSize: '0.7rem', lineHeight: 1, userSelect: 'none',
};

const TOOLTIP_WIDTH = 320;
const EDGE_MARGIN   = 12; // px from viewport edge before we flip

export default function useTooltipPortal(tooltip) {
  const [tip, setTip]  = useState(null);
  const iconRef        = useRef(null);

  if (!tooltip) return { iconProps: null, portal: null };

  const showTip = () => {
    if (!iconRef.current) return;
    const r         = iconRef.current.getBoundingClientRect();
    const iconCx    = r.left + r.width / 2;
    const vpWidth   = window.innerWidth;

    // Would centering overflow the right edge?
    const wouldOverflowRight = iconCx + TOOLTIP_WIDTH / 2 + EDGE_MARGIN > vpWidth;
    // Would centering overflow the left edge?
    const wouldOverflowLeft  = iconCx - TOOLTIP_WIDTH / 2 - EDGE_MARGIN < 0;

    let style;
    if (wouldOverflowRight) {
      // Anchor right edge of tooltip to icon center + margin
      style = { ...BASE_STYLE, top: r.top, right: vpWidth - iconCx - EDGE_MARGIN,
                transform: 'translateY(calc(-100% - 8px))' };
    } else if (wouldOverflowLeft) {
      // Anchor left edge of tooltip to icon center - margin
      style = { ...BASE_STYLE, top: r.top, left: iconCx - EDGE_MARGIN,
                transform: 'translateY(calc(-100% - 8px))' };
    } else {
      // Centered (default)
      style = { ...BASE_STYLE, top: r.top, left: iconCx,
                transform: 'translate(-50%, calc(-100% - 8px))' };
    }
    setTip(style);
  };

  const iconProps = {
    ref: iconRef,
    onMouseEnter: showTip,
    onMouseLeave: () => setTip(null),
    style: ICON_STYLE,
  };

  const portal = tip
    ? createPortal(<div style={tip}>{tooltip}</div>, document.body)
    : null;

  return { iconProps, portal };
}

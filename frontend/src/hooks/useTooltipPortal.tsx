import { useState, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

const BASE_STYLE: CSSProperties = {
  position: 'fixed',
  background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px',
  padding: '0.6rem 0.9rem', fontSize: '0.8rem', maxWidth: 320,
  zIndex: 9999, color: '#f3f4f6', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
  lineHeight: 1.55, pointerEvents: 'none', whiteSpace: 'pre-wrap',
};

const ICON_STYLE: CSSProperties = {
  cursor: 'help', opacity: 0.45, fontSize: '0.7rem', lineHeight: 1, userSelect: 'none',
};

const TOOLTIP_WIDTH = 320;
const EDGE_MARGIN   = 12;

interface UseTooltipPortalResult {
  iconProps: {
    ref: React.RefObject<HTMLSpanElement | null>;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    style: CSSProperties;
  } | null;
  portal: ReactNode | null;
}

/**
 * Custom hook to create a tooltip portal.
 */
export default function useTooltipPortal(tooltip: string | ReactNode): UseTooltipPortalResult {
  const [tip, setTip]  = useState<CSSProperties | null>(null);
  const iconRef        = useRef<HTMLSpanElement | null>(null);

  if (!tooltip) return { iconProps: null, portal: null };

  const showTip = () => {
    if (!iconRef.current) return;
    const r         = iconRef.current.getBoundingClientRect();
    const iconCx    = r.left + r.width / 2;
    const vpWidth   = window.innerWidth;

    const wouldOverflowRight = iconCx + TOOLTIP_WIDTH / 2 + EDGE_MARGIN > vpWidth;
    const wouldOverflowLeft  = iconCx - TOOLTIP_WIDTH / 2 - EDGE_MARGIN < 0;

    let style: CSSProperties;
    if (wouldOverflowRight) {
      style = { ...BASE_STYLE, top: r.top, right: vpWidth - iconCx - EDGE_MARGIN,
                transform: 'translateY(calc(-100% - 8px))' };
    } else if (wouldOverflowLeft) {
      style = { ...BASE_STYLE, top: r.top, left: iconCx - EDGE_MARGIN,
                transform: 'translateY(calc(-100% - 8px))' };
    } else {
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

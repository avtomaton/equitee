import { useState, useRef } from 'react';

/**
 * TruncatedCell — shows truncated text with a real floating tooltip on hover.
 * Uses a fixed-position div rendered into a portal-like approach via state,
 * so it escapes any overflow:hidden parents (like table cells).
 */
export default function TruncatedCell({ text, maxWidth = 180 }) {
  const [tip, setTip] = useState(null);
  const ref           = useRef(null);

  if (!text) return <span>—</span>;

  const showTip = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setTip({ x: rect.left, y: rect.top });
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={showTip}
        onMouseLeave={() => setTip(null)}
        style={{
          maxWidth,
          display: 'inline-block',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          verticalAlign: 'middle',
          cursor: 'default',
        }}
      >
        {text}
      </span>
      {tip && (
        <div style={{
          position: 'fixed',
          top:  tip.y,
          left: tip.x,
          transform: 'translateY(-110%)',
          background: '#1a1f2e',
          border: '1px solid #374151',
          borderRadius: '8px',
          padding: '0.6rem 0.9rem',
          fontSize: '0.82rem',
          whiteSpace: 'pre-wrap',
          maxWidth: 360,
          zIndex: 9999,
          color: '#f3f4f6',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          lineHeight: 1.5,
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </>
  );
}

import { useState, useRef, useEffect } from 'react';

/**
 * TruncatedCell — shows text truncated to its container width, with a
 * floating tooltip only when the text is actually clipped.
 *
 * maxWidth defaults to '100%' so the span fills whatever space the td gives it.
 * Pass a px number only when you need a hard cap (e.g. a note inside a narrow column).
 */
export default function TruncatedCell({ text, maxWidth = '100%' }) {
  const [tip, setTip]           = useState(null);
  const [overflows, setOverflows] = useState(false);
  const ref                     = useRef(null);

  // Detect overflow after render / on resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  if (!text) return <span>—</span>;

  const showTip = () => {
    if (!overflows) return;
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
          display:      'block',
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          cursor:       overflows ? 'default' : 'inherit',
        }}
      >
        {text}
      </span>
      {tip && (
        <div style={{
          position:     'fixed',
          top:          tip.y,
          left:         tip.x,
          transform:    'translateY(-110%)',
          background:   '#1a1f2e',
          border:       '1px solid #374151',
          borderRadius: '8px',
          padding:      '0.6rem 0.9rem',
          fontSize:     '0.82rem',
          whiteSpace:   'pre-wrap',
          maxWidth:     360,
          zIndex:       9999,
          color:        '#f3f4f6',
          boxShadow:    '0 8px 24px rgba(0,0,0,0.6)',
          lineHeight:   1.5,
          pointerEvents:'none',
        }}>
          {text}
        </div>
      )}
    </>
  );
}

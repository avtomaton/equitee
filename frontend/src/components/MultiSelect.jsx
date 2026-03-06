import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function MultiSelect({ label, options, selected, onChange }) {
  const [isOpen,  setIsOpen]  = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, flip: false });
  const triggerRef  = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const onMouseDown = (e) => {
      // Close only when the click is outside BOTH the trigger and the dropdown
      if (
        triggerRef.current  && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const onScroll = (e) => {
      // Close only when the scroll originates outside the dropdown
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      setIsOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onScroll, true); // capture
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen]);

  const openDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const dropHeight = Math.min(options.length * 40 + 48, 280);
    const spaceBelow = window.innerHeight - r.bottom;
    const flip = spaceBelow < dropHeight && r.top > dropHeight;
    setDropPos({ top: flip ? r.top : r.bottom + 4, left: r.left, width: r.width, flip });
    setIsOpen(o => !o);
  }, [options.length]);

  const allSelected  = selected.length === options.length;
  const noneSelected = selected.length === 0;

  const toggle    = (v) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  const selectAll = () => onChange([...options]);
  const clearAll  = () => onChange([]);
  const only      = (v) => onChange([v]);

  const triggerLabel =
    allSelected        ? label :
    noneSelected       ? `${label}: None` :
    selected.length === 1 ? `${label}: ${selected[0]}` :
                          `${label}: ${selected.length}`;

  const isFiltered = !allSelected;

  const dropdown = isOpen && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position:  'fixed',
        top:       dropPos.flip ? undefined : dropPos.top,
        bottom:    dropPos.flip ? window.innerHeight - dropPos.top : undefined,
        left:      dropPos.left,
        minWidth:  Math.max(dropPos.width, 160),
        width:     'max-content',
        maxWidth:  280,
        maxHeight: 280,
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        border:     '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow:  '0 8px 24px rgba(0,0,0,0.55)',
        zIndex:     9999,
      }}
    >
      {/* Select-all / clear row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '0.45rem 0.75rem', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)', position: 'sticky', top: 0,
      }}>
        <button type="button" onClick={selectAll} disabled={allSelected}
          style={{ background:'none', border:'none', color:'var(--accent-primary)', cursor:'pointer',
            fontSize:'0.78rem', padding:'2px 4px', opacity: allSelected ? 0.4 : 1 }}>
          All
        </button>
        <span style={{ color:'var(--text-tertiary)', fontSize:'0.78rem', alignSelf:'center' }}>{label}</span>
        <button type="button" onClick={clearAll} disabled={noneSelected}
          style={{ background:'none', border:'none', color:'var(--accent-primary)', cursor:'pointer',
            fontSize:'0.78rem', padding:'2px 4px', opacity: noneSelected ? 0.4 : 1 }}>
          None
        </button>
      </div>

      {options.map(opt => {
        const checked = selected.includes(opt);
        return (
          <div key={opt}
            style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'0.45rem 0.75rem', cursor:'pointer',
              background: checked ? 'rgba(59,130,246,0.06)' : 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
            onMouseLeave={e => e.currentTarget.style.background = checked ? 'rgba(59,130,246,0.06)' : 'transparent'}
          >
            <label style={{ display:'flex', alignItems:'center', gap:'0.5rem',
              cursor:'pointer', flex:1, fontSize:'0.85rem' }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(opt)}
                style={{ width:14, height:14, cursor:'pointer', accentColor:'var(--accent-primary)' }} />
              <span style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{opt}</span>
            </label>
            {!(checked && selected.length === 1) && (
              <button type="button" onClick={e => { e.stopPropagation(); only(opt); }}
                style={{ background:'none', border:'none', fontSize:'0.68rem',
                  color:'var(--text-tertiary)', cursor:'pointer', padding:'1px 4px',
                  opacity:0.6, marginLeft:'0.4rem' }}
                onMouseEnter={e => { e.currentTarget.style.opacity=1; e.currentTarget.style.color='var(--accent-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity=0.6; e.currentTarget.style.color='var(--text-tertiary)'; }}
              >only</button>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );

  return (
    <div ref={triggerRef} style={{ position:'relative', display:'inline-block' }}>
      <button
        type="button"
        onClick={openDropdown}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.4rem 0.6rem',
          background: isFiltered ? 'rgba(59,130,246,0.12)' : 'var(--bg-primary)',
          border: `1px solid ${isFiltered ? 'var(--accent-primary)' : 'var(--border)'}`,
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '0.82rem',
          color: isFiltered ? 'var(--accent-secondary, #93c5fd)' : 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <span>{triggerLabel}</span>
        <span style={{ fontSize:'0.6rem', opacity:0.7 }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {dropdown}
    </div>
  );
}

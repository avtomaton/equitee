import { useState, useEffect, useRef, useMemo } from 'react';

/**
 * GlobalSearch — a Cmd+K / Ctrl+K search overlay that searches across
 * properties, tenants, expenses, and income records in memory.
 *
 * Props:
 *   properties  — full property list
 *   allIncome   — flat income records
 *   allExpenses — flat expense records
 *   onNavigate  — (view, propertyId?) => void — navigate to a view/property
 *   onPropertyDetail — (property) => void
 */
export default function GlobalSearch({ properties, allIncome, allExpenses, onNavigate, onPropertyDetail }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const [sel,   setSel]   = useState(0);
  const inputRef = useRef(null);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => { if (!o) { setQuery(''); setSel(0); } return !o; });
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = [];

    // Properties
    properties.forEach(p => {
      if (
        p.name.toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q) ||
        (p.city  || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q)
      ) {
        hits.push({ type: 'property', icon: '🏢', label: p.name, sub: `${p.city}, ${p.province}`, data: p });
      }
    });

    // Income
    allIncome.forEach(r => {
      if ((r.notes || '').toLowerCase().includes(q) || r.income_type.toLowerCase().includes(q)) {
        const prop = properties.find(p => p.id === r.property_id);
        hits.push({ type: 'income', icon: '💰', label: `${r.income_type} — $${r.amount.toLocaleString()}`, sub: `${prop?.name ?? '?'} · ${r.income_date}`, data: r });
      }
    });

    // Expenses
    allExpenses.forEach(r => {
      if ((r.notes || '').toLowerCase().includes(q) || r.expense_category.toLowerCase().includes(q)) {
        const prop = properties.find(p => p.id === r.property_id);
        hits.push({ type: 'expense', icon: '💳', label: `${r.expense_category} — $${r.amount.toLocaleString()}`, sub: `${prop?.name ?? '?'} · ${r.expense_date}`, data: r });
      }
    });

    return hits.slice(0, 12);
  }, [query, properties, allIncome, allExpenses]);

  useEffect(() => { setSel(0); }, [results.length]);

  const go = (hit) => {
    setOpen(false);
    if (hit.type === 'property') { onPropertyDetail(hit.data); return; }
    if (hit.type === 'income')   { onNavigate('income',   hit.data.property_id); return; }
    if (hit.type === 'expense')  { onNavigate('expenses', hit.data.property_id); return; }
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[sel]) go(results[sel]);
  };

  if (!open) return (
    <button
      title="Search (⌘K)"
      onClick={() => { setOpen(true); setQuery(''); setSel(0); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.35rem 0.65rem', borderRadius: '7px',
        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
        color: 'var(--text-tertiary)', fontSize: '0.8rem', cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <span>🔍</span>
      <span>Search</span>
      <kbd style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: 3, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>⌘K</kbd>
    </button>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh' }}
      onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{ width: '100%', maxWidth: 560, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search properties, income, expenses…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.95rem', color: 'var(--text-primary)' }}
          />
          <kbd onClick={() => setOpen(false)} style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-tertiary)' }}>Esc</kbd>
        </div>

        {results.length === 0 && query.trim() && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No results for "{query}"</div>
        )}

        {results.length === 0 && !query.trim() && (
          <div style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            Search properties by name or address · income &amp; expenses by notes or category
          </div>
        )}

        {results.length > 0 && (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {results.map((hit, i) => (
              <div
                key={i}
                onClick={() => go(hit)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.65rem 1rem', cursor: 'pointer',
                  background: i === sel ? 'var(--bg-tertiary)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                }}
                onMouseEnter={() => setSel(i)}
              >
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{hit.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 1 }}>{hit.sub}</div>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'capitalize', flexShrink: 0 }}>{hit.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

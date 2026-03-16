import MetricCard from './MetricCard.jsx';

// ── Formatters ────────────────────────────────────────────────────────────────
export const fmt    = n => `$${Math.round(n).toLocaleString()}`;
export const fmtM   = n => n === 0 ? '—' : fmt(n) + '/mo';
export const fp     = n => `${Number(n).toFixed(1)}%`;
export const fPct   = v => `${(v * 100).toFixed(1)}%`;
export const fmtDate = (str) => {
  if (!str) return '—';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
};

// ── Chart tooltip style (shared across Dashboard, PropertiesView, etc.) ───────
export const CHART_TOOLTIP_STYLE = {
  background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6',
};

// ── LTV helpers ───────────────────────────────────────────────────────────────
/** Returns {cls, accent} color tokens for an LTV ratio (0–1) or percentage (0–100). */
export const ltvColor = (ltv) => {
  const pct = ltv > 1 ? ltv : ltv * 100;
  if (pct < 65) return { cls: 'text-success', accent: '#10b981' };
  if (pct < 80) return { cls: '',             accent: '#f59e0b' };
  return           { cls: 'text-danger',   accent: '#ef4444' };
};

// ── Window helpers ────────────────────────────────────────────────────────────
export const WINDOW_OPTIONS = [1, 2, 3, 6, 12, 24, 60, 0];
export const wLabel = w => !w ? 'All' : w >= 24 ? `${w / 12}Y` : `${w}M`;

// ── MetricCard shorthand ──────────────────────────────────────────────────────
/** Drop-in <MetricCard> with standard flex sizing. */
export const mc = props => <MetricCard {...props} style={{ flex: '1 1 150px', minWidth: 140 }} />;

// ── SectionLabel ──────────────────────────────────────────────────────────────
export const SectionLabel = ({ children, style }) => (
  <p className="stat-section-label" style={style}>{children}</p>
);

// ── WindowPicker ──────────────────────────────────────────────────────────────
export function WindowPicker({ value, onChange, options = WINDOW_OPTIONS }) {
  return (
    <>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>window:</span>
      {options.map(w => (
        <button key={w} type="button" onClick={() => onChange(w)}
          style={{
            padding: '0.2rem 0.5rem', borderRadius: '5px', fontSize: '0.78rem', cursor: 'pointer',
            background: value === w ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            color:      value === w ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${value === w ? 'var(--accent-primary)' : 'var(--border)'}`,
          }}>
          {wLabel(w)}
        </button>
      ))}
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
        (excludes current month)
      </span>
    </>
  );
}

export { fmt, fmtPeriod } from '../utils';
import { fmt } from '../utils';
import type { CSSProperties, ReactNode } from 'react';

// ── Formatters ────────────────────────────────────────────────────────────────
export const fmtM   = (n: number) => n === 0 ? '—' : fmt(n) + '/mo';
export const fp     = (n: number) => `${Number(n).toFixed(1)}%`;
export const fPct   = (v: number) => `${(v * 100).toFixed(1)}%`;
export const fmtDate = (str: string | null) => {
  if (!str) return '—';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
};

/** Truncate a property name to 14 chars for chart labels. */
export const sn = (s: string) => s.length > 14 ? s.slice(0, 14) + '\u2026' : s;

// ── Chart tooltip style ───────────────────────────────────────────────────────
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6',
};

// ── LTV helpers ───────────────────────────────────────────────────────────────
/** Returns {cls, accent} color tokens for an LTV ratio (0–1) or percentage (0–100). */
export const ltvColor = (ltv: number) => {
  const pct = ltv > 1 ? ltv : ltv * 100;
  if (pct < 65) return { cls: 'text-success', accent: '#10b981' };
  if (pct < 80) return { cls: '',             accent: '#f59e0b' };
  return           { cls: 'text-danger',   accent: '#ef4444' };
};

// ── Window helpers ────────────────────────────────────────────────────────────
export const WINDOW_OPTIONS = [1, 2, 3, 6, 12, 24, 60, 0];
export const wLabel = (w: number) => !w ? 'All' : w >= 24 ? `${w / 12}Y` : `${w}M`;

// ── Evaluator input components ────────────────────────────────────────────────

interface NumInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  compact?: boolean;
}

export function NumInput({ label, value, onChange, prefix = '', suffix = '', min = 0, max, step = 1, help, compact = false }: NumInputProps) {
  return (
    <div className="eval-field" style={compact ? { marginBottom: '0.25rem' } : undefined}>
      <label className="eval-label" style={compact ? { fontSize: '0.72rem', marginBottom: 1 } : undefined}>{label}</label>
      {help && !compact && <span className="eval-help">{help}</span>}
      <div className="eval-input-wrap">
        {prefix && <span className="eval-affix">{prefix}</span>}
        <input
          type="number" className="eval-input"
          value={value} min={min} max={max} step={step}
          style={compact ? { padding: '0.3rem 0.5rem', fontSize: '0.82rem' } : undefined}
          onChange={e => onChange(e.target.valueAsNumber || 0)}
          onFocus={e => { const t = e.target; setTimeout(() => t.select(), 0); }}
        />
        {suffix && <span className="eval-affix eval-affix-right">{suffix}</span>}
      </div>
    </div>
  );
}

interface SliderInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  help?: string;
  cls?: string;
}

export function SliderInput({ label, value, onChange, min, max, step = 1, format, help, cls = '' }: SliderInputProps) {
  const display = format ? format(value) : String(value);
  return (
    <div className="eval-slider-row">
      <div className="eval-slider-header">
        <span className="eval-slider-label">{label}</span>
        <span className={`eval-slider-val ${cls}`}>{display}</span>
      </div>
      {help && <span className="eval-help">{help}</span>}
      <input
        type="range" className="eval-slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <div className="eval-slider-range">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

export const SectionLabel = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <p className="stat-section-label" style={style}>{children}</p>
);

// ── WindowPicker ──────────────────────────────────────────────────────────────
export function WindowPicker({ value, onChange, options = WINDOW_OPTIONS }: {
  value: number;
  onChange: (v: number) => void;
  options?: number[];
}) {
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

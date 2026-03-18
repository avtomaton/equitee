import useTooltipPortal from '../hooks/useTooltipPortal.jsx';

/**
 * Stat card with optional ℹ tooltip and optional sub-line.
 */
export default function StatCard({ label, value, cls, tooltip, sub, style }) {
  const { iconProps, portal } = useTooltipPortal(tooltip);

  return (
    <div className="stat-card" style={style}>
      <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span>{label}</span>
        {iconProps && <span {...iconProps}>ℹ️</span>}
      </div>
      <div className={`stat-value ${cls || ''}`}>{value}</div>
      {sub && (
        <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.35 }}>
          {sub}
        </div>
      )}
      {portal}
    </div>
  );
}

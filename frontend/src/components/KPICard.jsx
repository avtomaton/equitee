import useTooltipPortal from '../hooks/useTooltipPortal.jsx';

/**
 * Large accent-bordered KPI card used in top-of-page portfolio snapshots.
 * accentColor drives the top border colour.
 */
export default function KPICard({
  label, primary, primaryCls = '',
  secondary, secondaryCls = '',
  tertiary, tooltip, accentColor,
}) {
  const { iconProps, portal } = useTooltipPortal(tooltip);

  const border = accentColor ? `2px solid ${accentColor}` : '1px solid var(--border)';
  return (
    <div className="metric-card" style={{ flex: '1 1 170px', minWidth: 155, borderTop: border }}>
      <div className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span>{label}</span>
        {iconProps && <span {...iconProps}>ℹ️</span>}
      </div>
      <div className={`metric-primary ${primaryCls}`}>{primary}</div>
      {secondary && <div className={`metric-secondary ${secondaryCls}`}>{secondary}</div>}
      {tertiary  && <div className="metric-tertiary">{tertiary}</div>}
      {portal}
    </div>
  );
}

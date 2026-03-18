import useTooltipPortal from '../hooks/useTooltipPortal.jsx';

/**
 * A richer stat card that supports:
 *   primary   — main large value (string)
 *   primaryCls — color class for primary
 *   secondary  — second value shown slightly smaller below primary (string)
 *   secondaryCls
 *   tertiary   — small muted line at the bottom
 *   label      — card title
 *   tooltip    — hover tooltip text (\n for newlines)
 */
export default function MetricCard({ label, primary, primaryCls, secondary, secondaryCls, tertiary, tertiaryCls, tooltip, style }) {
  const { iconProps, portal } = useTooltipPortal(tooltip);

  return (
    <div className="stat-card" style={style}>
      <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span>{label}</span>
        {iconProps && <span {...iconProps}>ℹ️</span>}
      </div>

      <div className={`stat-value ${primaryCls || ''}`} style={{ fontSize: '1.6rem', lineHeight: 1.15 }}>
        {primary}
      </div>

      {secondary && (
        <div className={secondaryCls || ''} style={{ fontSize: '1rem', fontWeight: 600, marginTop: '0.15rem' }}>
          {secondary}
        </div>
      )}

      {tertiary && (
        <div className={tertiaryCls || ''} style={{ fontSize: '0.72rem', color: tertiaryCls ? undefined : 'var(--text-tertiary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
          {tertiary}
        </div>
      )}

      {portal}
    </div>
  );
}

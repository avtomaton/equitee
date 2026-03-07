/**
 * StarRating — renders 1–5 stars with proper half-star support.
 * Accepts starsData = { full, half, empty } from calcInvestmentScore.
 */
export default function StarRating({ starsData, size = '1.35rem' }) {
  const full  = starsData?.full  ?? 0;
  const half  = starsData?.half  ?? false;
  const empty = starsData?.empty ?? (5 - full - (half ? 1 : 0));

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', letterSpacing: '0.05em' }}>
      {Array.from({ length: full }, (_, i) => (
        <span key={`f${i}`} style={{ color: '#f59e0b', fontSize: size }}>★</span>
      ))}
      {half && (
        <span key="h" style={{ position: 'relative', display: 'inline-block', fontSize: size, width: '0.65em' }}>
          {/* empty star underneath */}
          <span style={{ color: '#374151' }}>★</span>
          {/* filled left half on top */}
          <span style={{
            position: 'absolute', left: 0, top: 0,
            width: '50%', overflow: 'hidden',
            color: '#f59e0b',
          }}>★</span>
        </span>
      )}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} style={{ color: '#374151', fontSize: size }}>★</span>
      ))}
    </span>
  );
}

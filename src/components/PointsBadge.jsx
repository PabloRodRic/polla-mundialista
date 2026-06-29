// The single, canonical way to show how many points a prediction earned.
// Used on every match/result surface (Partidos, Pronóstico, Predicciones, Tabla)
// so the wording, threshold and colors never drift between pages.
//
// `points` is prediction.pointsEarned. Renders nothing until points are known
// (null/undefined) — i.e. before the match has been scored.
export default function PointsBadge({ points, className = '' }) {
  if (points == null) return null;
  const earned = points > 0;
  return (
    <span
      className={`font-semibold ${className}`}
      style={{ color: earned ? 'var(--color-gold)' : 'var(--color-text-muted)' }}
    >
      {earned ? `+${points} pts` : 'sin puntos'}
    </span>
  );
}

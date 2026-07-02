import { tlaLabel } from '../utils/teamLabels';

// Renders a prediction scoreline "a – b" and, when it's a draw with a tiebreaker pick,
// adds a small asterisk on the side that prediction chose to win on penalties.
export default function PredictionScore({ scoreA, scoreB, tlaA, tlaB, pick, className = '' }) {
  const drawn = scoreA != null && scoreB != null && scoreA === scoreB;
  const side = drawn && pick ? (pick === tlaA ? 'home' : pick === tlaB ? 'away' : null) : null;
  const star = (forSide) =>
    side === forSide ? <sup title={`Eligió a ${tlaLabel(pick) || pick} por penales`}>*</sup> : null;
  return (
    <span className={`font-bold ${className}`} style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
      {scoreA ?? '–'}
      {star('home')} – {scoreB ?? '–'}
      {star('away')}
    </span>
  );
}

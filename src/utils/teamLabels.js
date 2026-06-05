// Display-only TLA overrides. The stored TLA stays as-is (bracket/standings logic
// keys off it, e.g. 'URY'); this only changes what the user sees on screen.
const TLA_LABEL = {
  URY: 'URU', // football-data uses ISO 'URY' for Uruguay; show the familiar FIFA code
};

export function tlaLabel(tla) {
  return TLA_LABEL[tla] || tla || '';
}

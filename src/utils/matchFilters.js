// Shared time-based match filters, used by both the Partidos page and the Admin panel
// so the two stay in sync. "Hoy" is the default everywhere.

export const TIME_FILTERS = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'proximos', label: 'Próximos' },
  { value: 'finalizados', label: 'Finalizados' },
  { value: 'todos', label: 'Todos' },
];

export const DEFAULT_TIME_FILTER = 'hoy';

// Whether a single match passes the given filter. `now` is injectable for testing.
export function passesTimeFilter(match, filter, now = new Date()) {
  if (filter === 'todos') return true;
  if (filter === 'finalizados') return match.status === 'finished';

  const d = match.date?.toDate?.();
  if (!d) return false;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (filter === 'hoy') return d >= startOfToday && d < startOfTomorrow;
  if (filter === 'proximos') return d >= startOfTomorrow; // future days only — today lives under "Hoy"
  return true;
}

export function filterMatchesByTime(matches, filter, now = new Date()) {
  return matches.filter((m) => passesTimeFilter(m, filter, now));
}

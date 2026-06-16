// Shared leaderboard ordering + tie-aware ranking.
//
// Single source of truth for "what place is a player in", used by both the live
// scoring engine (matchSync, for the position-movement arrows) and the UI
// (TournamentDataContext / LeaderboardPage). Keeping the tie rule in one place
// means a player's rank is computed identically everywhere — no drift.

// Sort order: most points first, then most exact scorelines (tiebreaker), then name.
export function compareLeaderboard(a, b) {
  return (
    (b.totalPoints || 0) - (a.totalPoints || 0) ||
    (b.exactScores || 0) - (a.exactScores || 0) ||
    (a.name || '').localeCompare(b.name || '')
  );
}

// Two players tie when they share points AND exact-score count. Names never break a
// tie — genuinely-tied players share a rank.
export function isTied(a, b) {
  return (a.totalPoints || 0) === (b.totalPoints || 0) && (a.exactScores || 0) === (b.exactScores || 0);
}

// Standard competition ranking ("1-2-2-2-5"): tied players share the lowest rank in
// their group, and the next distinct player skips ahead by the group size.
// `players` must already be sorted with compareLeaderboard. Returns a parallel array.
export function rankPlayers(players) {
  const ranks = [];
  players.forEach((p, i) => {
    ranks.push(i > 0 && isTied(p, players[i - 1]) ? ranks[i - 1] : i + 1);
  });
  return ranks;
}

// Same ranking, keyed by player id. Sorts a copy internally, so input order doesn't
// matter. Returns { [playerId]: rank }.
export function rankPlayersMap(players) {
  const sorted = [...players].sort(compareLeaderboard);
  const ranks = rankPlayers(sorted);
  const map = {};
  sorted.forEach((p, i) => {
    map[p.id] = ranks[i];
  });
  return map;
}

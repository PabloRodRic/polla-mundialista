/**
 * 2026 World Cup bracket structure.
 * NOTE: This is the provisional bracket based on the December 2024 draw.
 * Verify against official FIFA bracket before tournament starts.
 *
 * Slot notation:
 *   '1A' = 1st place Group A,  '2B' = 2nd place Group B
 *   'bp1'..'bp8' = 8 best 3rd-place teams, ranked by pts→gd→gf
 */

export const BRACKET_R32 = [
  // Section 1 (→ QF-1)
  { id: 'r32_01', home: '1A', away: 'bp1' },
  { id: 'r32_02', home: '2B', away: '2C' },
  { id: 'r32_03', home: '1B', away: 'bp2' },
  { id: 'r32_04', home: '1C', away: '2A' },
  // Section 2 (→ QF-2)
  { id: 'r32_05', home: '1D', away: 'bp3' },
  { id: 'r32_06', home: '2E', away: '2F' },
  { id: 'r32_07', home: '1E', away: 'bp4' },
  { id: 'r32_08', home: '1F', away: '2D' },
  // Section 3 (→ QF-3)
  { id: 'r32_09', home: '1G', away: 'bp5' },
  { id: 'r32_10', home: '2H', away: '2I' },
  { id: 'r32_11', home: '1H', away: 'bp6' },
  { id: 'r32_12', home: '1I', away: '2G' },
  // Section 4 (→ QF-4)
  { id: 'r32_13', home: '1J', away: 'bp7' },
  { id: 'r32_14', home: '2K', away: '2L' },
  { id: 'r32_15', home: '1K', away: 'bp8' },
  { id: 'r32_16', home: '1L', away: '2J' },
]

export const BRACKET_R16 = [
  { id: 'r16_01', homeFrom: 'r32_01', awayFrom: 'r32_02' },
  { id: 'r16_02', homeFrom: 'r32_03', awayFrom: 'r32_04' },
  { id: 'r16_03', homeFrom: 'r32_05', awayFrom: 'r32_06' },
  { id: 'r16_04', homeFrom: 'r32_07', awayFrom: 'r32_08' },
  { id: 'r16_05', homeFrom: 'r32_09', awayFrom: 'r32_10' },
  { id: 'r16_06', homeFrom: 'r32_11', awayFrom: 'r32_12' },
  { id: 'r16_07', homeFrom: 'r32_13', awayFrom: 'r32_14' },
  { id: 'r16_08', homeFrom: 'r32_15', awayFrom: 'r32_16' },
]

export const BRACKET_QF = [
  { id: 'qf_1', homeFrom: 'r16_01', awayFrom: 'r16_02' },
  { id: 'qf_2', homeFrom: 'r16_03', awayFrom: 'r16_04' },
  { id: 'qf_3', homeFrom: 'r16_05', awayFrom: 'r16_06' },
  { id: 'qf_4', homeFrom: 'r16_07', awayFrom: 'r16_08' },
]

export const BRACKET_SF = [
  { id: 'sf_1', homeFrom: 'qf_1', awayFrom: 'qf_2' },
  { id: 'sf_2', homeFrom: 'qf_3', awayFrom: 'qf_4' },
]

export const BRACKET_FINAL = { id: 'final', homeFrom: 'sf_1', awayFrom: 'sf_2' }
export const BRACKET_3RD   = { id: '3rd',   homeLoserOf: 'sf_1', awayLoserOf: 'sf_2' }

export const SLOT_LABEL = {
  '1A': '1° Grupo A', '1B': '1° Grupo B', '1C': '1° Grupo C',
  '1D': '1° Grupo D', '1E': '1° Grupo E', '1F': '1° Grupo F',
  '1G': '1° Grupo G', '1H': '1° Grupo H', '1I': '1° Grupo I',
  '1J': '1° Grupo J', '1K': '1° Grupo K', '1L': '1° Grupo L',
  '2A': '2° Grupo A', '2B': '2° Grupo B', '2C': '2° Grupo C',
  '2D': '2° Grupo D', '2E': '2° Grupo E', '2F': '2° Grupo F',
  '2G': '2° Grupo G', '2H': '2° Grupo H', '2I': '2° Grupo I',
  '2J': '2° Grupo J', '2K': '2° Grupo K', '2L': '2° Grupo L',
  'bp1': 'Mejor 3° #1', 'bp2': 'Mejor 3° #2', 'bp3': 'Mejor 3° #3',
  'bp4': 'Mejor 3° #4', 'bp5': 'Mejor 3° #5', 'bp6': 'Mejor 3° #6',
  'bp7': 'Mejor 3° #7', 'bp8': 'Mejor 3° #8',
}

/**
 * Resolve a slot label to an actual team TLA given computed standings and best-3rd teams.
 * Returns null if not yet determined.
 */
export function resolveSlot(slot, groupStandings, best3rdTeams) {
  if (!slot) return null
  if (slot.startsWith('bp')) {
    const idx = parseInt(slot.slice(2)) - 1
    return best3rdTeams[idx] || null
  }
  const pos   = parseInt(slot[0]) - 1  // 0-indexed
  const group = slot[1]
  const standings = groupStandings[group]
  return standings?.[pos] || null
}

/**
 * Get both teams for a given match in the bracket.
 * Returns { home: teamObj|null, away: teamObj|null }
 * teamObj has at minimum: tla, name, flag
 *
 * For knockout rounds, teams come from bracket picks.
 * picks: { [matchId]: winnerTla }
 * teamsByTla: lookup map tla → team object
 */
export function getR32Teams(matchDef, groupStandings, best3rdTeams) {
  return {
    home: resolveSlot(matchDef.home, groupStandings, best3rdTeams),
    away: resolveSlot(matchDef.away, groupStandings, best3rdTeams),
  }
}

export function getKnockoutMatchTeams(matchDef, picks, teamsByTla) {
  const homeTla = picks[matchDef.homeFrom] || null
  const awayTla = picks[matchDef.awayFrom] || null
  return {
    home: homeTla ? (teamsByTla[homeTla] || { tla: homeTla, name: homeTla, flag: null }) : null,
    away: awayTla ? (teamsByTla[awayTla] || { tla: awayTla, name: awayTla, flag: null }) : null,
  }
}

export function get3rdPlaceTeams(picks, teamsByTla) {
  // Loser of SF-1
  const sf1Winner = picks['sf_1']
  const sf1Home   = picks['qf_1']
  const sf1Away   = picks['qf_2']
  const sf1Loser  = sf1Winner && sf1Home && sf1Away
    ? (sf1Winner === sf1Home ? sf1Away : sf1Home)
    : null

  // Loser of SF-2
  const sf2Winner = picks['sf_2']
  const sf2Home   = picks['qf_3']
  const sf2Away   = picks['qf_4']
  const sf2Loser  = sf2Winner && sf2Home && sf2Away
    ? (sf2Winner === sf2Home ? sf2Away : sf2Home)
    : null

  return {
    home: sf1Loser ? (teamsByTla[sf1Loser] || { tla: sf1Loser, name: sf1Loser, flag: null }) : null,
    away: sf2Loser ? (teamsByTla[sf2Loser] || { tla: sf2Loser, name: sf2Loser, flag: null }) : null,
  }
}

/**
 * Check if all picks for a given round are complete.
 */
export function isRoundComplete(matches, picks) {
  return matches.every(m => !!picks[m.id])
}

/**
 * Build a flat lookup: tla → team object (from all group stage matches).
 */
export function buildTeamLookup(matches) {
  const map = {}
  for (const m of matches) {
    if (m.tlaA && m.flagA !== undefined) map[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA }
    if (m.tlaB && m.flagB !== undefined) map[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB }
  }
  return map
}

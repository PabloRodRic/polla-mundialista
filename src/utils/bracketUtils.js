/**
 * 2026 World Cup bracket structure — OFFICIAL FIFA bracket.
 *
 * Source: FIFA Competition Regulations Annex C / 2026 FIFA World Cup knockout
 * stage. The 48-team format has 12 groups (A–L). The Round of 32 is fed by the
 * 12 group winners, 12 runners-up and the 8 best third-placed teams.
 *
 * Match numbers below refer to the official FIFA fixture numbers (73–104) so
 * this can be cross-checked against any other bracket. Internal slot IDs are
 * kept as r32_01..r32_16 / r16_01..r16_08 / qf_1..qf_4 / sf_1..sf_2 (ordered by
 * official match number) so previously stored picks/scores keep their keys.
 *
 * Slot notation:
 *   '1A' = winner Group A,  '2B' = runner-up Group B
 *   '3>1A' = the best-third-placed team that Annex C assigns to face winner A.
 *            Which group's third that is depends on WHICH 8 thirds qualify
 *            (see thirdAssignment / annexC.json — 495 combinations).
 */

import annexC from '../config/annexC.json'

export const BRACKET_R32 = [
  // id, official match #, pairing
  { id: 'r32_01', match: 73, home: '2A',   away: '2B'   },
  { id: 'r32_02', match: 74, home: '1E',   away: '3>1E' },
  { id: 'r32_03', match: 75, home: '1F',   away: '2C'   },
  { id: 'r32_04', match: 76, home: '1C',   away: '2F'   },
  { id: 'r32_05', match: 77, home: '1I',   away: '3>1I' },
  { id: 'r32_06', match: 78, home: '2E',   away: '2I'   },
  { id: 'r32_07', match: 79, home: '1A',   away: '3>1A' },
  { id: 'r32_08', match: 80, home: '1L',   away: '3>1L' },
  { id: 'r32_09', match: 81, home: '1D',   away: '3>1D' },
  { id: 'r32_10', match: 82, home: '1G',   away: '3>1G' },
  { id: 'r32_11', match: 83, home: '2K',   away: '2L'   },
  { id: 'r32_12', match: 84, home: '1H',   away: '2J'   },
  { id: 'r32_13', match: 85, home: '1B',   away: '3>1B' },
  { id: 'r32_14', match: 86, home: '1J',   away: '2H'   },
  { id: 'r32_15', match: 87, home: '1K',   away: '3>1K' },
  { id: 'r32_16', match: 88, home: '2D',   away: '2G'   },
]

export const BRACKET_R16 = [
  { id: 'r16_01', match: 89, homeFrom: 'r32_02', awayFrom: 'r32_05' }, // W74 v W77
  { id: 'r16_02', match: 90, homeFrom: 'r32_01', awayFrom: 'r32_03' }, // W73 v W75
  { id: 'r16_03', match: 91, homeFrom: 'r32_04', awayFrom: 'r32_06' }, // W76 v W78
  { id: 'r16_04', match: 92, homeFrom: 'r32_07', awayFrom: 'r32_08' }, // W79 v W80
  { id: 'r16_05', match: 93, homeFrom: 'r32_11', awayFrom: 'r32_12' }, // W83 v W84
  { id: 'r16_06', match: 94, homeFrom: 'r32_09', awayFrom: 'r32_10' }, // W81 v W82
  { id: 'r16_07', match: 95, homeFrom: 'r32_14', awayFrom: 'r32_16' }, // W86 v W88
  { id: 'r16_08', match: 96, homeFrom: 'r32_13', awayFrom: 'r32_15' }, // W85 v W87
]

export const BRACKET_QF = [
  { id: 'qf_1', match: 97,  homeFrom: 'r16_01', awayFrom: 'r16_02' }, // W89 v W90
  { id: 'qf_2', match: 98,  homeFrom: 'r16_05', awayFrom: 'r16_06' }, // W93 v W94
  { id: 'qf_3', match: 99,  homeFrom: 'r16_03', awayFrom: 'r16_04' }, // W91 v W92
  { id: 'qf_4', match: 100, homeFrom: 'r16_07', awayFrom: 'r16_08' }, // W95 v W96
]

export const BRACKET_SF = [
  { id: 'sf_1', match: 101, homeFrom: 'qf_1', awayFrom: 'qf_2' }, // W97 v W98
  { id: 'sf_2', match: 102, homeFrom: 'qf_3', awayFrom: 'qf_4' }, // W99 v W100
]

export const BRACKET_FINAL = { id: 'final', match: 104, homeFrom: 'sf_1', awayFrom: 'sf_2' }
export const BRACKET_3RD   = { id: '3rd',   match: 103, homeLoserOf: 'sf_1', awayLoserOf: 'sf_2' }

// Candidate groups whose third-placed team may fill each "3>1X" slot
// (derived from Annex C; shown as a hint before the 8 thirds are known).
const THIRD_CANDIDATES = {
  '1A': 'C/E/F/H/I',
  '1B': 'E/F/G/I/J',
  '1D': 'B/E/F/I/J',
  '1E': 'A/B/C/D/F',
  '1G': 'A/E/H/I/J',
  '1I': 'C/D/F/G/H',
  '1K': 'D/E/I/J/L',
  '1L': 'E/H/I/J/K',
}

export const SLOT_LABEL = {
  '1A': '1° Grupo A', '1B': '1° Grupo B', '1C': '1° Grupo C',
  '1D': '1° Grupo D', '1E': '1° Grupo E', '1F': '1° Grupo F',
  '1G': '1° Grupo G', '1H': '1° Grupo H', '1I': '1° Grupo I',
  '1J': '1° Grupo J', '1K': '1° Grupo K', '1L': '1° Grupo L',
  '2A': '2° Grupo A', '2B': '2° Grupo B', '2C': '2° Grupo C',
  '2D': '2° Grupo D', '2E': '2° Grupo E', '2F': '2° Grupo F',
  '2G': '2° Grupo G', '2H': '2° Grupo H', '2I': '2° Grupo I',
  '2J': '2° Grupo J', '2K': '2° Grupo K', '2L': '2° Grupo L',
  // best-third slots: show the candidate groups until the 8 thirds are known
  ...Object.fromEntries(
    Object.entries(THIRD_CANDIDATES).map(([w, groups]) => [`3>${w}`, `3° (${groups})`]),
  ),
}

/**
 * Given the 8 best third-placed teams (each with a `fromGroup` letter), return
 * the Annex C assignment: { '1A': 'C', '1B': 'J', ... } mapping each winner slot
 * to the GROUP whose third faces it. Returns null until exactly 8 thirds known.
 */
export function thirdAssignment(best3rdTeams) {
  if (!best3rdTeams || best3rdTeams.length !== 8) return null
  const key = best3rdTeams.map(t => t.fromGroup).sort().join('')
  return annexC[key] || null
}

/**
 * Resolve a slot label to an actual team given computed standings and the
 * Annex C third-place assignment. Returns null if not yet determined.
 */
export function resolveSlot(slot, groupStandings, thirdAssign) {
  if (!slot) return null
  if (slot.startsWith('3>')) {
    const winnerSlot = slot.slice(2)          // e.g. '1A'
    const group = thirdAssign?.[winnerSlot]   // group letter, e.g. 'C'
    if (!group) return null
    return groupStandings[group]?.[2] || null // that group's 3rd-placed team
  }
  const pos   = parseInt(slot[0]) - 1  // 0-indexed (1→winner, 2→runner-up)
  const group = slot[1]
  return groupStandings[group]?.[pos] || null
}

/**
 * Get both teams for a given Round-of-32 match.
 * Returns { home: teamObj|null, away: teamObj|null }
 */
export function getR32Teams(matchDef, groupStandings, best3rdTeams) {
  const thirdAssign = thirdAssignment(best3rdTeams)
  return {
    home: resolveSlot(matchDef.home, groupStandings, thirdAssign),
    away: resolveSlot(matchDef.away, groupStandings, thirdAssign),
  }
}

/**
 * Get both teams for a knockout match fed by earlier-round winners.
 * picks: { [matchId]: winnerTla }   teamsByTla: tla → team object
 */
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

/**
 * Compute group standings from match scores (real or predicted).
 *
 * Tiebreaker order per FIFA World Cup 2026 regulations:
 *   1. Head-to-head points (among tied teams only)
 *   2. Head-to-head goal difference
 *   3. Head-to-head goals scored
 *   4. Overall goal difference
 *   5. Overall goals scored
 *   6. Alphabetical by TLA (stand-in for conduct score / FIFA ranking)
 */
export function computeGroupStandings(teams, matches, predictions) {
  const table = {}
  for (const team of teams) {
    table[team.tla] = {
      tla: team.tla, name: team.name, flag: team.flag,
      p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0,
    }
  }

  // Build the list of matches that have scores, storing the numeric scores directly
  const scoredMatches = []
  for (const match of matches) {
    const pred = predictions[match.id]
    if (!pred || pred.predictedScoreA == null || pred.predictedScoreB == null) continue
    const sA = Number(pred.predictedScoreA)
    const sB = Number(pred.predictedScoreB)
    if (isNaN(sA) || isNaN(sB)) continue

    const tA = match.tlaA
    const tB = match.tlaB
    if (!table[tA] || !table[tB]) continue

    scoredMatches.push({ tlaA: tA, tlaB: tB, sA, sB })

    table[tA].p++; table[tB].p++
    table[tA].gf += sA; table[tA].ga += sB
    table[tB].gf += sB; table[tB].ga += sA
    table[tA].gd = table[tA].gf - table[tA].ga
    table[tB].gd = table[tB].gf - table[tB].ga

    if (sA > sB) {
      table[tA].w++; table[tA].pts += 3
      table[tB].l++
    } else if (sA < sB) {
      table[tB].w++; table[tB].pts += 3
      table[tA].l++
    } else {
      table[tA].d++; table[tA].pts++
      table[tB].d++; table[tB].pts++
    }
  }

  // Compute head-to-head stats restricted to matches between a given set of TLAs
  function h2hStats(tlas) {
    const tlaSet = new Set(tlas)
    const h2h = {}
    for (const tla of tlas) h2h[tla] = { pts: 0, gd: 0, gf: 0 }

    for (const m of scoredMatches) {
      if (!tlaSet.has(m.tlaA) || !tlaSet.has(m.tlaB)) continue
      h2h[m.tlaA].gf += m.sA; h2h[m.tlaA].gd += m.sA - m.sB
      h2h[m.tlaB].gf += m.sB; h2h[m.tlaB].gd += m.sB - m.sA
      if (m.sA > m.sB)      { h2h[m.tlaA].pts += 3 }
      else if (m.sB > m.sA) { h2h[m.tlaB].pts += 3 }
      else                   { h2h[m.tlaA].pts++; h2h[m.tlaB].pts++ }
    }
    return h2h
  }

  // Sort a slice of equally-pointed teams using h2h → overall → alpha
  function sortTied(tlas) {
    if (tlas.length <= 1) return tlas
    const h2h = h2hStats(tlas)
    return [...tlas].sort((a, b) => {
      if (h2h[b].pts !== h2h[a].pts) return h2h[b].pts - h2h[a].pts
      if (h2h[b].gd  !== h2h[a].gd)  return h2h[b].gd  - h2h[a].gd
      if (h2h[b].gf  !== h2h[a].gf)  return h2h[b].gf  - h2h[a].gf
      if (table[b].gd !== table[a].gd) return table[b].gd - table[a].gd
      if (table[b].gf !== table[a].gf) return table[b].gf - table[a].gf
      return a.localeCompare(b)
    })
  }

  // First sort by points, then apply h2h tiebreakers within each equal-points group
  const byPoints = Object.values(table).sort((a, b) => b.pts - a.pts)
  const result = []
  let i = 0
  while (i < byPoints.length) {
    let j = i + 1
    while (j < byPoints.length && byPoints[j].pts === byPoints[i].pts) j++
    const tiedTlas = byPoints.slice(i, j).map(t => t.tla)
    for (const tla of sortTied(tiedTlas)) result.push(table[tla])
    i = j
  }
  return result
}

/**
 * Given standings for all 12 groups, return the top 8 third-place teams.
 * Uses the same tiebreaker order as group standings.
 */
export function getBest3rdPlaceTeams(groupStandings) {
  const thirds = []
  for (const [group, standings] of Object.entries(groupStandings)) {
    if (standings.length >= 3) {
      thirds.push({ ...standings[2], fromGroup: group })
    }
  }
  return thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.gd  !== a.gd)  return b.gd  - a.gd
    if (b.gf  !== a.gf)  return b.gf  - a.gf
    return a.tla.localeCompare(b.tla)
  }).slice(0, 8)
}

/**
 * Count how many group matches have a full prediction (both scores entered).
 */
export function countPredictedMatches(matches, predictions) {
  return matches.filter(m => {
    const p = predictions[m.id]
    return p && p.predictedScoreA !== null && p.predictedScoreA !== undefined &&
               p.predictedScoreB !== null && p.predictedScoreB !== undefined
  }).length
}

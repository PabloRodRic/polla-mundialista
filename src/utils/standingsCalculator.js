/**
 * Compute group standings from pre-tournament predicted match scores.
 * Returns teams sorted by: pts → gd → gf → alphabetical (TLA)
 */
export function computeGroupStandings(teams, matches, predictions) {
  const table = {}
  for (const team of teams) {
    table[team.tla] = {
      tla: team.tla, name: team.name, flag: team.flag,
      p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0,
    }
  }

  for (const match of matches) {
    const pred = predictions[match.id]
    if (
      !pred ||
      pred.predictedScoreA === null || pred.predictedScoreA === undefined ||
      pred.predictedScoreB === null || pred.predictedScoreB === undefined
    ) continue

    const sA = Number(pred.predictedScoreA)
    const sB = Number(pred.predictedScoreB)
    const tA = match.tlaA
    const tB = match.tlaB

    if (!table[tA] || !table[tB]) continue

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

  return Object.values(table).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
    return a.tla.localeCompare(b.tla)
  })
}

/**
 * Given standings for all 12 groups, return the top 8 third-place teams.
 * groupStandings: { A: [t1, t2, t3, t4], B: [...], ... }
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
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
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

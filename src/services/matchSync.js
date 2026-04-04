import {
  collection, doc, getDoc, getDocs, writeBatch,
  query, where, orderBy, Timestamp, updateDoc, setDoc,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { fetchAllMatches } from './footballApi'
import teamFlags from '../config/teamFlags.json'
import scoring from '../config/scoring.json'
import { computeGroupStandings, getBest3rdPlaceTeams } from '../utils/standingsCalculator'
import { BRACKET_R32, BRACKET_R16, BRACKET_QF, BRACKET_SF } from '../utils/bracketUtils'

// ─── Stage / status normalization ───────────────────────────────────────────

const STAGE_MAP = {
  GROUP_STAGE:    'group',
  LAST_32:        'roundOf32',
  LAST_16:        'roundOf16',
  QUARTER_FINALS: 'quarterfinals',
  SEMI_FINALS:    'semifinals',
  THIRD_PLACE:    'thirdPlace',
  FINAL:          'final',
}

const STATUS_MAP = {
  SCHEDULED: 'upcoming',
  TIMED:     'upcoming',
  IN_PLAY:   'live',
  PAUSED:    'live',
  FINISHED:  'finished',
  POSTPONED: 'upcoming',
  CANCELLED: 'cancelled',
  SUSPENDED: 'live',
}

// Bracket slot IDs grouped by knockout stage, used for team advancement scoring
const STAGE_BRACKET_SLOTS = {
  roundOf32:     BRACKET_R32.map(m => m.id),
  roundOf16:     BRACKET_R16.map(m => m.id),
  quarterfinals: BRACKET_QF.map(m => m.id),
  semifinals:    BRACKET_SF.map(m => m.id),
  final:         ['final'],
}

// ─── Status tracking ─────────────────────────────────────────────────────────

let syncStatus = { syncing: false, lastSync: null, matchCount: 0, error: null }
let syncTimeout = null
const statusListeners = new Set()

function notifyListeners() {
  statusListeners.forEach(fn => fn({ ...syncStatus }))
}

export function onSyncStatusChange(fn) {
  statusListeners.add(fn)
  fn({ ...syncStatus })
  return () => statusListeners.delete(fn)
}

export function getSyncStatus() {
  return { ...syncStatus }
}

// ─── Match normalization ──────────────────────────────────────────────────────

function normalizeMatch(apiMatch) {
  const tlaA = apiMatch.homeTeam?.tla || ''
  const tlaB = apiMatch.awayTeam?.tla || ''
  const stage = STAGE_MAP[apiMatch.stage] || 'group'
  const group = apiMatch.group ? apiMatch.group.replace('GROUP_', '') : null

  return {
    apiId:      apiMatch.id,
    matchday:   apiMatch.matchday ?? null,
    stage,
    group,
    teamA:      apiMatch.homeTeam?.name || '',
    teamB:      apiMatch.awayTeam?.name || '',
    tlaA,
    tlaB,
    flagA:      teamFlags[tlaA] || null,
    flagB:      teamFlags[tlaB] || null,
    crestA:     apiMatch.homeTeam?.crest || null,
    crestB:     apiMatch.awayTeam?.crest || null,
    date:       Timestamp.fromDate(new Date(apiMatch.utcDate)),
    venue:      apiMatch.venue || null,
    scoreA:     apiMatch.score?.fullTime?.home ?? null,
    scoreB:     apiMatch.score?.fullTime?.away ?? null,
    // 'home' or 'away' — set by API when match goes to penalties; null for normal outcomes
    winner:     apiMatch.score?.winner === 'HOME_TEAM' ? 'home'
              : apiMatch.score?.winner === 'AWAY_TEAM' ? 'away'
              : null,
    status:     STATUS_MAP[apiMatch.status] || 'upcoming',
    lastSyncedAt: Timestamp.now(),
  }
}

// Returns the winning team TLA, handling penalty shootout results where fullTime is a draw
function getMatchWinnerTla(match) {
  if (match.scoreA > match.scoreB) return match.tlaA
  if (match.scoreB > match.scoreA) return match.tlaB
  if (match.winner === 'home') return match.tlaA
  if (match.winner === 'away') return match.tlaB
  return null
}

// ─── Core sync ───────────────────────────────────────────────────────────────

export async function syncMatchesFromAPI() {
  syncStatus = { ...syncStatus, syncing: true, error: null }
  notifyListeners()

  try {
    const apiMatches = await fetchAllMatches()

    // Fetch existing Firestore matches to detect status changes
    const existingSnap = await getDocs(collection(db, 'matches'))
    const existing = {}
    existingSnap.forEach(d => { existing[d.id] = d.data() })

    const newlyFinished = []
    const currentlyLive = []
    const batch = writeBatch(db)

    for (const apiMatch of apiMatches) {
      const normalized = normalizeMatch(apiMatch)
      const docId = String(apiMatch.id)
      const matchRef = doc(db, 'matches', docId)
      const prev = existing[docId]

      if (
        normalized.status === 'finished' &&
        prev?.status !== 'finished' &&
        !prev?.pointsCalculated &&
        !prev?.adminOverride
      ) {
        newlyFinished.push({ docId, ...normalized })
      }

      if (
        normalized.status === 'live' &&
        normalized.scoreA !== null &&
        normalized.scoreB !== null &&
        !prev?.adminOverride
      ) {
        currentlyLive.push({ docId, ...normalized })
      }

      // If admin has manually overridden this match, don't clobber their scores/status/winner
      if (prev?.adminOverride) {
        const { scoreA, scoreB, status, winner, ...safeNormalized } = normalized
        batch.set(matchRef, safeNormalized, { merge: true })
      } else {
        batch.set(matchRef, normalized, { merge: true })
      }
    }

    await batch.commit()

    syncStatus = {
      syncing:    false,
      lastSync:   new Date().toISOString(),
      matchCount: apiMatches.length,
      error:      null,
    }
    notifyListeners()

    // Calculate points for matches that just finished (final, locked)
    for (const match of newlyFinished) {
      await calculatePointsForMatch(match.docId, match.scoreA, match.scoreB, match.stage)
    }

    // Update live points on every sync cycle
    for (const match of currentlyLive) {
      await calculateLivePoints(match.docId, match.scoreA, match.scoreB, match.stage)
    }

    return apiMatches.length
  } catch (err) {
    syncStatus = { ...syncStatus, syncing: false, error: err.message }
    notifyListeners()
    throw err
  }
}

// ─── Auto-polling ────────────────────────────────────────────────────────────

export function startAutoSync(isAdmin) {
  if (!isAdmin) return
  stopAutoSync()

  async function runCycle() {
    try {
      await syncMatchesFromAPI()
    } catch (e) {
      console.error('[matchSync] Auto-sync error:', e)
    }
    const minutes = scoring.scoreSync.pollIntervalMatchDayMinutes
    syncTimeout = setTimeout(runCycle, minutes * 60 * 1000)
  }

  runCycle()
}

export function stopAutoSync() {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
    syncTimeout = null
  }
}

// ─── Point calculation ────────────────────────────────────────────────────────

// isPreTournament=true uses scaled per-round scoring from preTournamentMatchResult
export function computeMatchPoints(predicted, real, stage, isPreTournament = false) {
  const pA = Number(predicted.scoreA)
  const pB = Number(predicted.scoreB)
  const rA = Number(real.scoreA)
  const rB = Number(real.scoreB)

  if (isNaN(pA) || isNaN(pB) || isNaN(rA) || isNaN(rB)) return 0

  let cfg
  if (stage === 'group') {
    cfg = scoring.groupStage.matchResult
  } else if (isPreTournament) {
    cfg = scoring.knockout.preTournamentMatchResult[stage] || scoring.knockout.liveMatchResult
  } else {
    cfg = scoring.knockout.liveMatchResult
  }

  // Tier 3: exact score
  if (pA === rA && pB === rB) return cfg.exactScore

  const pResult = Math.sign(pA - pB)
  const rResult = Math.sign(rA - rB)
  const pDiff   = Math.abs(pA - pB)
  const rDiff   = Math.abs(rA - rB)

  // Tier 2: correct outcome + goal difference
  if (pResult === rResult && pDiff === rDiff) return cfg.correctOutcomeAndGoalDifference

  // Tier 1: correct outcome
  if (pResult === rResult) return cfg.correctOutcome

  return 0
}

// Shared: write points to all prediction collections for a match, return affected user IDs
async function _writePredictionPoints(matchId, scoreA, scoreB, stage) {
  const affectedUserIds = new Set()
  const batch = writeBatch(db)

  // 1. Live knockout predictions (PredictionsPage → 'predictions' collection)
  const predsSnap = await getDocs(
    query(collection(db, 'predictions'), where('matchId', '==', String(matchId)))
  )
  predsSnap.forEach(predDoc => {
    const pred = predDoc.data()
    const points = computeMatchPoints(
      { scoreA: pred.predictedScoreA, scoreB: pred.predictedScoreB },
      { scoreA, scoreB },
      stage
    )
    batch.update(predDoc.ref, { pointsEarned: points, calculatedAt: Timestamp.now() })
    affectedUserIds.add(pred.userId)
  })

  // 2. Group stage predictions (FixturePage → 'preTournamentGroupPredictions' collection)
  const groupPredsSnap = await getDocs(
    query(collection(db, 'preTournamentGroupPredictions'), where('matchId', '==', String(matchId)))
  )
  groupPredsSnap.forEach(predDoc => {
    const pred = predDoc.data()
    const points = computeMatchPoints(
      { scoreA: pred.predictedScoreA, scoreB: pred.predictedScoreB },
      { scoreA, scoreB },
      stage
    )
    batch.update(predDoc.ref, { pointsEarned: points, calculatedAt: Timestamp.now() })
    affectedUserIds.add(pred.userId)
  })

  // 3. Bracket knockout score predictions (FixturePage → 'preTournamentBracket' flat fields ks_{matchId}_A/B)
  //    Uses scaled per-round scoring (isPreTournament=true)
  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'))
  bracketSnap.forEach(bracketDoc => {
    const data = bracketDoc.data()
    const predA = data[`ks_${matchId}_A`]
    const predB = data[`ks_${matchId}_B`]
    if (predA !== undefined && predB !== undefined && predA !== null && predB !== null) {
      const points = computeMatchPoints(
        { scoreA: predA, scoreB: predB },
        { scoreA, scoreB },
        stage,
        true  // isPreTournament: use scaled scoring per round
      )
      batch.update(bracketDoc.ref, { [`ksp_${matchId}`]: points })
      if (data.userId) affectedUserIds.add(data.userId)
    }
  })

  await batch.commit()
  return affectedUserIds
}

// Group final standings scoring — called after all 6 matches in a group finish
async function calculateGroupStandingsPoints(group) {
  // Guard against double-run
  const scoreStateRef = doc(db, 'config', 'scoringState')
  const scoreStateSnap = await getDoc(scoreStateRef)
  if (scoreStateSnap.data()?.[`gsp_${group}_done`]) return

  // Fetch all matches in this group
  const matchesSnap = await getDocs(
    query(
      collection(db, 'matches'),
      where('stage', '==', 'group'),
      where('group', '==', group)
    )
  )
  const groupMatches = []
  matchesSnap.forEach(d => groupMatches.push({ id: d.id, ...d.data() }))

  // Only proceed if all 6 matches are finished
  if (groupMatches.length < 6 || !groupMatches.every(m => m.status === 'finished')) return

  // Build team list for this group
  const teamMap = {}
  for (const m of groupMatches) {
    teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA }
    teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB }
  }
  const teams = Object.values(teamMap)

  // Compute actual standings from real scores
  const actualPreds = {}
  for (const m of groupMatches) {
    actualPreds[m.id] = { predictedScoreA: m.scoreA, predictedScoreB: m.scoreB }
  }
  const actualStandings = computeGroupStandings(teams, groupMatches, actualPreds)

  // Fetch all users' group predictions for these matches in one query
  const matchIds = groupMatches.map(m => m.id)
  const allGroupPredsSnap = await getDocs(
    query(
      collection(db, 'preTournamentGroupPredictions'),
      where('matchId', 'in', matchIds)
    )
  )
  const predsByUser = {}
  allGroupPredsSnap.forEach(d => {
    const pd = d.data()
    if (!predsByUser[pd.userId]) predsByUser[pd.userId] = {}
    predsByUser[pd.userId][pd.matchId] = pd
  })

  // For each user, compute predicted standings, award standing points + R32 advancement for top 2
  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'))
  const batch = writeBatch(db)
  const affectedUserIds = new Set()

  const advR32Pts = scoring.knockout.teamAdvancement.roundOf32
  const actualQualifiers = [actualStandings[0]?.tla, actualStandings[1]?.tla].filter(Boolean)

  bracketSnap.forEach(bracketDoc => {
    const userId = bracketDoc.data().userId
    if (!userId) return

    const userPreds = predsByUser[userId] || {}
    const predictedStandings = computeGroupStandings(teams, groupMatches, userPreds)
    const predictedQualifiers = new Set(
      [predictedStandings[0]?.tla, predictedStandings[1]?.tla].filter(Boolean)
    )

    const fs = scoring.groupStage.finalStandings
    let standingPoints = 0
    if (predictedStandings[0]?.tla === actualStandings[0]?.tla) standingPoints += fs.correct1stPlace
    if (predictedStandings[1]?.tla === actualStandings[1]?.tla) standingPoints += fs.correct2ndPlace
    if (predictedStandings[2]?.tla === actualStandings[2]?.tla) standingPoints += fs.correct3rdPlace
    if (predictedStandings[3]?.tla === actualStandings[3]?.tla) standingPoints += fs.correct4thPlace

    const updates = { [`gsp_${group}`]: standingPoints }
    // R32 advancement: award pts for each actual qualifier the user predicted in top 2
    for (const tla of actualQualifiers) {
      updates[`adv_roundOf32_${tla}`] = predictedQualifiers.has(tla) ? advR32Pts : 0
    }

    batch.update(bracketDoc.ref, updates)
    affectedUserIds.add(userId)
  })

  // Mark this group's standings as calculated
  await setDoc(scoreStateRef, { [`gsp_${group}_done`]: true }, { merge: true })
  await batch.commit()

  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }

  // Once all 12 groups are done, score best-3rd place R32 advancement
  await calculateBest3rdAdvancementIfReady()
}

// R32 advancement for best 3rd-place qualifiers — runs only after all 12 groups are finished
async function calculateBest3rdAdvancementIfReady() {
  const scoreStateRef = doc(db, 'config', 'scoringState')
  const scoreStateSnap = await getDoc(scoreStateRef)
  const scoreState = scoreStateSnap.data() || {}

  const allGroups = 'ABCDEFGHIJKL'.split('')
  if (!allGroups.every(g => scoreState[`gsp_${g}_done`])) return
  if (scoreState['best3rd_done']) return

  // Fetch all group matches to compute actual standings per group
  const allGroupMatchesSnap = await getDocs(
    query(collection(db, 'matches'), where('stage', '==', 'group'))
  )
  const matchesByGroup = {}
  allGroupMatchesSnap.forEach(d => {
    const data = d.data()
    if (!matchesByGroup[data.group]) matchesByGroup[data.group] = []
    matchesByGroup[data.group].push({ id: d.id, ...data })
  })

  const allActualStandings = {}
  for (const [g, gMatches] of Object.entries(matchesByGroup)) {
    const teamMap = {}
    for (const m of gMatches) {
      teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA }
      teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB }
    }
    const actualPreds = {}
    for (const m of gMatches) {
      actualPreds[m.id] = { predictedScoreA: m.scoreA, predictedScoreB: m.scoreB }
    }
    allActualStandings[g] = computeGroupStandings(Object.values(teamMap), gMatches, actualPreds)
  }

  const actualBest3rd = getBest3rdPlaceTeams(allActualStandings)
  const actualBest3rdSet = new Set(actualBest3rd.map(t => t.tla))

  // Fetch all group predictions to compute each user's predicted best-3rd
  const allGroupPredsSnap = await getDocs(collection(db, 'preTournamentGroupPredictions'))
  const allPredsByUser = {}
  allGroupPredsSnap.forEach(d => {
    const pd = d.data()
    if (!allPredsByUser[pd.userId]) allPredsByUser[pd.userId] = {}
    allPredsByUser[pd.userId][pd.matchId] = pd
  })

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'))
  const batch = writeBatch(db)
  const affectedUserIds = new Set()
  const advR32Pts = scoring.knockout.teamAdvancement.roundOf32

  bracketSnap.forEach(bracketDoc => {
    const userId = bracketDoc.data().userId
    if (!userId) return

    const userPreds = allPredsByUser[userId] || {}

    // Compute predicted 3rd-place teams from each group
    const predictedThirdCandidates = []
    for (const [g, gMatches] of Object.entries(matchesByGroup)) {
      const teamMap = {}
      for (const m of gMatches) {
        teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA }
        teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB }
      }
      const standings = computeGroupStandings(Object.values(teamMap), gMatches, userPreds)
      if (standings[2]) predictedThirdCandidates.push({ ...standings[2], fromGroup: g })
    }

    // Rank predicted 3rd-place teams the same way getBest3rdPlaceTeams does
    const predictedBest3rdSet = new Set(
      predictedThirdCandidates.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts
        if (b.gd !== a.gd) return b.gd - a.gd
        if (b.gf !== a.gf) return b.gf - a.gf
        return a.tla.localeCompare(b.tla)
      }).slice(0, 8).map(t => t.tla)
    )

    const updates = {}
    for (const tla of actualBest3rdSet) {
      updates[`adv_roundOf32_${tla}`] = predictedBest3rdSet.has(tla) ? advR32Pts : 0
    }
    if (Object.keys(updates).length > 0) {
      batch.update(bracketDoc.ref, updates)
      affectedUserIds.add(userId)
    }
  })

  await setDoc(scoreStateRef, { best3rd_done: true }, { merge: true })
  await batch.commit()

  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }
}

// Team advancement scoring — called when a knockout match finishes
async function calculateAdvancementPoints(winnerTla, stage) {
  const slots = STAGE_BRACKET_SLOTS[stage]
  if (!slots || !winnerTla) return

  const advPoints = scoring.knockout.teamAdvancement[stage] || 0
  if (advPoints === 0) return

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'))
  const batch = writeBatch(db)
  const affectedUserIds = new Set()

  bracketSnap.forEach(bracketDoc => {
    const data = bracketDoc.data()
    const userId = data.userId
    if (!userId) return

    // Award points if user picked this winner in any slot of this stage
    const predicted = slots.some(slot => data[`pick_${slot}`] === winnerTla)
    batch.update(bracketDoc.ref, { [`adv_${stage}_${winnerTla}`]: predicted ? advPoints : 0 })
    affectedUserIds.add(userId)
  })

  await batch.commit()

  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }
}

// Tournament outcome scoring — called after final or 3rd place finishes
// Requires both matches to be finished before awarding points
async function calculateTournamentOutcomePoints() {
  // Fetch actual final match
  const finalSnap = await getDocs(
    query(collection(db, 'matches'), where('stage', '==', 'final'), where('status', '==', 'finished'))
  )
  if (finalSnap.empty) return

  const finalMatch = finalSnap.docs[0].data()
  const actualChampion = getMatchWinnerTla(finalMatch)
  if (!actualChampion) return  // winner not yet determinable (e.g. penalties not recorded)
  const actualRunnerUp = actualChampion === finalMatch.tlaA ? finalMatch.tlaB : finalMatch.tlaA

  // Fetch actual 3rd place match
  const thirdSnap = await getDocs(
    query(collection(db, 'matches'), where('stage', '==', 'thirdPlace'), where('status', '==', 'finished'))
  )
  if (thirdSnap.empty) return

  const thirdMatch = thirdSnap.docs[0].data()
  const actual3rd = getMatchWinnerTla(thirdMatch)
  if (!actual3rd) return

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'))
  const batch = writeBatch(db)
  const affectedUserIds = new Set()

  bracketSnap.forEach(bracketDoc => {
    const data = bracketDoc.data()
    const userId = data.userId
    if (!userId) return

    let points = 0
    const tc = scoring.tournamentOutcome

    if (data['pick_final'] === actualChampion) points += tc.correctChampion

    // Runner-up is the SF winner who lost the final
    const userChampion = data['pick_final']
    const sf1Pick = data['pick_sf_1']
    const sf2Pick = data['pick_sf_2']
    let userRunnerUp = null
    if (userChampion && sf1Pick && sf2Pick) {
      userRunnerUp = userChampion === sf1Pick ? sf2Pick : sf1Pick
    }
    if (userRunnerUp && userRunnerUp === actualRunnerUp) points += tc.correctRunnerUp

    if (data['pick_3rd'] === actual3rd) points += tc.correct3rdPlace

    batch.update(bracketDoc.ref, { tournamentOutcomePoints: points })
    affectedUserIds.add(userId)
  })

  await batch.commit()

  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }
}

// Final scoring when a match finishes — guards against double-run, snapshots ranks
export async function calculatePointsForMatch(matchId, scoreA, scoreB, stage) {
  const matchRef = doc(db, 'matches', String(matchId))
  const matchSnap = await getDoc(matchRef)
  if (matchSnap.data()?.pointsCalculated) return

  const matchData = matchSnap.data()
  const affectedUserIds = await _writePredictionPoints(matchId, scoreA, scoreB, stage)

  await updateDoc(matchRef, { pointsCalculated: true })

  // Snapshot ranks before recalculating so UI can show position movement
  const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('totalPoints', 'desc')))
  const rankSnapshot = {}
  let rank = 1
  usersSnap.forEach(d => { rankSnapshot[d.id] = rank++ })
  await setDoc(doc(db, 'leaderboard', 'rankSnapshot'), rankSnapshot)

  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }

  // Group final standings scoring — triggers when all 6 matches in a group finish
  if (stage === 'group' && matchData?.group) {
    await calculateGroupStandingsPoints(matchData.group)
  }

  // Knockout advancement scoring
  if (stage !== 'group' && stage !== 'thirdPlace') {
    const winnerTla = getMatchWinnerTla(matchData)
    if (winnerTla) {
      await calculateAdvancementPoints(winnerTla, stage)
    }
  }

  // Tournament outcome scoring — requires both final and 3rd place to be finished
  if (stage === 'final' || stage === 'thirdPlace') {
    await calculateTournamentOutcomePoints()
  }
}

// Live scoring — recalculates every sync, no guard, no rank snapshot, no flag
export async function calculateLivePoints(matchId, scoreA, scoreB, stage) {
  const affectedUserIds = await _writePredictionPoints(matchId, scoreA, scoreB, stage)
  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }
}

export async function resetPointsForMatch(matchId) {
  const matchRef = doc(db, 'matches', String(matchId))
  const affectedUserIds = new Set()

  // 1. Reset match state
  await updateDoc(matchRef, {
    scoreA: null,
    scoreB: null,
    winner: null,
    status: 'upcoming',
    pointsCalculated: false,
  })

  // 2. Zero out predictions — each collection updated independently so one failure doesn't block others
  const predsSnap = await getDocs(
    query(collection(db, 'predictions'), where('matchId', '==', String(matchId)))
  )
  for (const predDoc of predsSnap.docs) {
    await updateDoc(predDoc.ref, { pointsEarned: 0 })
    affectedUserIds.add(predDoc.data().userId)
  }

  const groupPredsSnap = await getDocs(
    query(collection(db, 'preTournamentGroupPredictions'), where('matchId', '==', String(matchId)))
  )
  for (const predDoc of groupPredsSnap.docs) {
    await updateDoc(predDoc.ref, { pointsEarned: 0 })
    affectedUserIds.add(predDoc.data().userId)
  }

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'))
  for (const bracketDoc of bracketSnap.docs) {
    const data = bracketDoc.data()
    if (`ksp_${matchId}` in data) {
      await updateDoc(bracketDoc.ref, { [`ksp_${matchId}`]: 0 })
      if (data.userId) affectedUserIds.add(data.userId)
    }
  }

  // 3. Recalculate totals for every affected user
  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }
}

async function recalculateTotalPoints(userId) {
  let total = 0

  // Live knockout predictions
  const predsSnap = await getDocs(
    query(collection(db, 'predictions'), where('userId', '==', userId))
  )
  predsSnap.forEach(d => { total += d.data().pointsEarned || 0 })

  // Group stage predictions
  const groupPredsSnap = await getDocs(
    query(collection(db, 'preTournamentGroupPredictions'), where('userId', '==', userId))
  )
  groupPredsSnap.forEach(d => { total += d.data().pointsEarned || 0 })

  // Bracket doc: all scored fields
  const bracketSnap = await getDoc(doc(db, 'preTournamentBracket', userId))
  if (bracketSnap.exists()) {
    const data = bracketSnap.data()
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('ksp_')) total += val || 0  // bracket knockout scores (scaled)
      if (key.startsWith('gsp_')) total += val || 0  // group final standings
      if (key.startsWith('adv_')) total += val || 0  // team advancement
    }
    total += data.tournamentOutcomePoints || 0  // champion / runner-up / 3rd place
    total += data.awardPoints || 0              // golden boot / golden ball
  }

  await updateDoc(doc(db, 'users', userId), { totalPoints: total })
}

// Normalizes player names for comparison: lowercase, trimmed, accents stripped
function normalizePlayerName(name) {
  if (!name) return ''
  return name.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Award points for correctly predicting Golden Boot / Golden Ball winners.
// Called by admin after FIFA announces the awards.
// Saves actual winners to config/tournamentResults and scores all users.
// Comparison is accent-insensitive and case-insensitive.
export async function calculateAwardPoints(goldenBoot, goldenBall) {
  await setDoc(
    doc(db, 'config', 'tournamentResults'),
    { goldenBoot, goldenBall, updatedAt: Timestamp.now() },
    { merge: true }
  )

  const normBoot = normalizePlayerName(goldenBoot)
  const normBall = normalizePlayerName(goldenBall)

  const bracketSnap = await getDocs(collection(db, 'preTournamentBracket'))
  const batch = writeBatch(db)
  const affectedUserIds = new Set()

  bracketSnap.forEach(bracketDoc => {
    const data = bracketDoc.data()
    const userId = data.userId
    if (!userId) return

    let points = 0
    if (normBoot && normalizePlayerName(data.goldenBoot) === normBoot) {
      points += scoring.individualAwards.goldenBoot
    }
    if (normBall && normalizePlayerName(data.goldenBall) === normBall) {
      points += scoring.individualAwards.goldenBall
    }

    batch.update(bracketDoc.ref, { awardPoints: points })
    affectedUserIds.add(userId)
  })

  await batch.commit()

  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }
}

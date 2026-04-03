import {
  collection, doc, getDoc, getDocs, writeBatch,
  query, where, orderBy, Timestamp, updateDoc, setDoc,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { fetchAllMatches } from './footballApi'
import teamFlags from '../config/teamFlags.json'
import scoring from '../config/scoring.json'

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
    status:     STATUS_MAP[apiMatch.status] || 'upcoming',
    lastSyncedAt: Timestamp.now(),
  }
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
    const batch = writeBatch(db)

    for (const apiMatch of apiMatches) {
      const normalized = normalizeMatch(apiMatch)
      const docId = String(apiMatch.id)
      const matchRef = doc(db, 'matches', docId)
      const prev = existing[docId]

      if (
        normalized.status === 'finished' &&
        prev?.status !== 'finished' &&
        !prev?.pointsCalculated
      ) {
        newlyFinished.push({ docId, ...normalized })
      }

      batch.set(matchRef, normalized, { merge: true })
    }

    await batch.commit()

    syncStatus = {
      syncing:    false,
      lastSync:   new Date().toISOString(),
      matchCount: apiMatches.length,
      error:      null,
    }
    notifyListeners()

    // Calculate points for matches that just finished
    for (const match of newlyFinished) {
      await calculatePointsForMatch(match.docId, match.scoreA, match.scoreB, match.stage)
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

export function computeMatchPoints(predicted, real, stage) {
  const pA = Number(predicted.scoreA)
  const pB = Number(predicted.scoreB)
  const rA = Number(real.scoreA)
  const rB = Number(real.scoreB)

  if (isNaN(pA) || isNaN(pB) || isNaN(rA) || isNaN(rB)) return 0

  let cfg
  if (stage === 'group') {
    cfg = scoring.groupStage.matchResult
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

export async function calculatePointsForMatch(matchId, scoreA, scoreB, stage) {
  const matchRef = doc(db, 'matches', String(matchId))
  const matchSnap = await getDoc(matchRef)

  if (matchSnap.data()?.pointsCalculated) return

  const predsSnap = await getDocs(
    query(collection(db, 'predictions'), where('matchId', '==', String(matchId)))
  )

  if (predsSnap.empty) {
    await updateDoc(matchRef, { pointsCalculated: true })
    return
  }

  const affectedUserIds = new Set()
  const batch = writeBatch(db)

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

  batch.update(matchRef, { pointsCalculated: true })
  await batch.commit()

  // Snapshot current leaderboard ranks before recalculating so the UI can show movement
  const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('totalPoints', 'desc')))
  const rankSnapshot = {}
  let rank = 1
  usersSnap.forEach(d => { rankSnapshot[d.id] = rank++ })
  await setDoc(doc(db, 'leaderboard', 'rankSnapshot'), rankSnapshot)

  for (const userId of affectedUserIds) {
    await recalculateTotalPoints(userId)
  }
}

async function recalculateTotalPoints(userId) {
  const predsSnap = await getDocs(
    query(collection(db, 'predictions'), where('userId', '==', userId))
  )
  let total = 0
  predsSnap.forEach(d => { total += d.data().pointsEarned || 0 })
  await updateDoc(doc(db, 'users', userId), { totalPoints: total })
}

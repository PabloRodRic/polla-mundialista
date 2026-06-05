import {
  collection, doc, setDoc, getDocs, onSnapshot,
  query, where, Timestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { computeGroupStandings, getBest3rdPlaceTeams } from '../utils/standingsCalculator'
import { buildTeamLookup, resolveFullBracket } from '../utils/bracketUtils'

const GROUP_PREDS_COLLECTION = 'preTournamentGroupPredictions'
const BRACKET_COLLECTION     = 'preTournamentBracket'

// ─── Other users' bets (for the "ver pronósticos" popup) ──────────────────────

// Load all users keyed by id → { name, photoURL } for joining onto predictions.
async function fetchUsersMap() {
  const snap = await getDocs(collection(db, 'users'))
  const map = {}
  snap.forEach(d => { map[d.id] = d.data() })
  return map
}

// Reads a score-prediction collection (docs with userId/matchId/predictedScoreA/B)
// for one match and joins display names.
async function fetchScoreBets(collectionName, matchId, usersMap) {
  const bets = []
  const snap = await getDocs(
    query(collection(db, collectionName), where('matchId', '==', String(matchId)))
  )
  snap.forEach(d => {
    const data = d.data()
    if (data.predictedScoreA == null || data.predictedScoreB == null) return
    const u = usersMap[data.userId] || {}
    bets.push({
      userId: data.userId,
      name: u.name || 'Anónimo',
      photoURL: u.photoURL || null,
      scoreA: data.predictedScoreA,
      scoreB: data.predictedScoreB,
      pick: null,
    })
  })
  return bets
}

/**
 * Fetch every user's bet for a single match, joined with their display name.
 * type: 'group'    → matchId is the real fixture id (preTournamentGroupPredictions)
 *       'live'     → matchId is the real fixture id (predictions — in-tournament tab)
 *       'knockout' → matchId is a bracket slot id, e.g. 'r32_01' (preTournamentBracket
 *                    flat fields ks_{matchId}_A/B and pick_{matchId})
 * Returns: [{ userId, name, photoURL, scoreA, scoreB, pick }] (scoreA/B/pick may be null)
 */
export async function fetchOthersBets(matchId, type) {
  const usersMap = await fetchUsersMap()
  let bets = []

  if (type === 'group') {
    bets = await fetchScoreBets(GROUP_PREDS_COLLECTION, matchId, usersMap)
  } else if (type === 'live') {
    bets = await fetchScoreBets('predictions', matchId, usersMap)
  } else {
    const snap = await getDocs(collection(db, BRACKET_COLLECTION))
    snap.forEach(d => {
      const data = d.data()
      const scoreA = data[`ks_${matchId}_A`] ?? null
      const scoreB = data[`ks_${matchId}_B`] ?? null
      const pick   = data[`pick_${matchId}`] ?? null
      if (scoreA == null && scoreB == null && !pick) return
      const userId = data.userId || d.id
      const u = usersMap[userId] || {}
      bets.push({
        userId,
        name: u.name || 'Anónimo',
        photoURL: u.photoURL || null,
        scoreA,
        scoreB,
        pick,
      })
    })
  }

  // Stable order: by name so the list doesn't jump between opens
  bets.sort((a, b) => a.name.localeCompare(b.name))
  return bets
}

/**
 * Resolve every participant's full knockout bracket. Heavy: reads the group
 * fixtures, all group predictions and all bracket docs, then resolves each
 * user's bracket cascade. Only users who entered group predictions are included
 * (otherwise their resolved teams can't be trusted).
 * Returns [{ userId, name, photoURL, resolved }] where resolved is the
 * slot → { home, away, scoreA, scoreB, winner } map from resolveFullBracket.
 * usersMap is optional (only used to attach display names).
 */
export async function resolveAllUsersBrackets(usersMap = {}) {
  // Group fixtures (shared across all users) → team lookup + per-group match lists
  const matchesSnap = await getDocs(
    query(collection(db, 'matches'), where('stage', '==', 'group'))
  )
  const groupMatches = []
  matchesSnap.forEach(d => groupMatches.push({ id: d.id, ...d.data() }))
  const teamsByTla = buildTeamLookup(groupMatches)

  const matchesByGroup = {}
  for (const m of groupMatches) {
    if (!m.group) continue
    ;(matchesByGroup[m.group] ||= []).push(m)
  }
  const groupTeams = {}
  for (const [g, gms] of Object.entries(matchesByGroup)) {
    const map = {}
    for (const m of gms) {
      if (m.tlaA) map[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA }
      if (m.tlaB) map[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB }
    }
    groupTeams[g] = Object.values(map)
  }

  // Every user's group-stage predictions, keyed userId → { matchId: pred }
  const groupPredsSnap = await getDocs(collection(db, GROUP_PREDS_COLLECTION))
  const groupPredsByUser = {}
  groupPredsSnap.forEach(d => {
    const p = d.data()
    ;(groupPredsByUser[p.userId] ||= {})[p.matchId] = p
  })

  const bracketSnap = await getDocs(collection(db, BRACKET_COLLECTION))
  const users = []
  bracketSnap.forEach(d => {
    const data = d.data()
    const userId = data.userId || d.id
    const userPreds = groupPredsByUser[userId]
    if (!userPreds) return // no group predictions → can't trust resolved teams

    const standings = {}
    for (const [g, teams] of Object.entries(groupTeams)) {
      standings[g] = computeGroupStandings(teams, matchesByGroup[g], userPreds)
    }
    const best3rd = getBest3rdPlaceTeams(standings)
    const resolved = resolveFullBracket(standings, best3rd, data, teamsByTla)
    const u = usersMap[userId] || {}
    users.push({ userId, name: u.name || 'Anónimo', photoURL: u.photoURL || null, resolved })
  })
  return users
}

/**
 * Fetch every user's resolved knockout pick for one bracket slot.
 * matchId: a bracket slot id, e.g. 'r32_01', 'qf_1', 'final', '3rd'.
 * Returns: [{ userId, name, photoURL, homeTla, homeFlag, awayTla, awayFlag, scoreA, scoreB }]
 */
export async function fetchOthersKnockout(matchId) {
  const usersMap = await fetchUsersMap()
  const users = await resolveAllUsersBrackets(usersMap)
  const bets = []
  for (const { userId, name, photoURL, resolved } of users) {
    const slot = resolved[matchId]
    if (!slot) continue
    const { home, away, scoreA, scoreB } = slot
    if (!home && !away && scoreA == null && scoreB == null) continue
    bets.push({
      userId, name, photoURL,
      homeTla: home?.tla || null,
      homeFlag: home?.flag || null,
      awayTla: away?.tla || null,
      awayFlag: away?.flag || null,
      scoreA: scoreA ?? null,
      scoreB: scoreB ?? null,
    })
  }
  bets.sort((a, b) => a.name.localeCompare(b.name))
  return bets
}

// Human-readable values for award fields whose stored value isn't display-ready.
const BABY_GENDER_LABEL = { boy: 'Niño', girl: 'Niña' }

/**
 * Fetch every user's pick for a single award field (one flat field on their
 * bracket doc): 'goldenBoot' | 'goldenBall' | 'babyGender'.
 * Returns: [{ userId, name, photoURL, value }] for users who set that field.
 */
export async function fetchOthersAwards(field) {
  const usersMap = await fetchUsersMap()
  const bets = []
  const snap = await getDocs(collection(db, BRACKET_COLLECTION))
  snap.forEach(d => {
    const data = d.data()
    const raw = data[field]
    if (raw == null || raw === '') return
    const userId = data.userId || d.id
    const u = usersMap[userId] || {}
    bets.push({
      userId,
      name: u.name || 'Anónimo',
      photoURL: u.photoURL || null,
      value: field === 'babyGender' ? (BABY_GENDER_LABEL[raw] || raw) : raw,
    })
  })
  bets.sort((a, b) => a.name.localeCompare(b.name))
  return bets
}

// Pick the winning (or losing) team object from a resolved final/3rd-place entry.
function teamOfOutcome(entry, which) {
  if (!entry || !entry.winner) return null
  const { home, away, winner } = entry
  const winTeam = winner === home?.tla ? home : winner === away?.tla ? away : null
  if (which === 'winner') return winTeam
  if (!winTeam) return null
  return winner === home?.tla ? away : home
}

/**
 * Fetch every user's predicted final standing for one position:
 * 'champion' | 'runnerUp' | 'thirdPlace'. Derived from each user's resolved
 * bracket (score-based), so it includes everyone who completed their final —
 * not only those whose final happened to end in a tie.
 * Returns: [{ userId, name, photoURL, value (TLA), flag }] for users with a pick.
 */
export async function fetchOthersOutcome(slot) {
  const usersMap = await fetchUsersMap()
  const users = await resolveAllUsersBrackets(usersMap)
  const bets = []
  for (const { userId, name, photoURL, resolved } of users) {
    const team =
      slot === 'champion'
        ? teamOfOutcome(resolved['final'], 'winner')
        : slot === 'runnerUp'
          ? teamOfOutcome(resolved['final'], 'loser')
          : slot === 'thirdPlace'
            ? teamOfOutcome(resolved['3rd'], 'winner')
            : null
    if (!team) continue
    bets.push({ userId, name, photoURL, value: team.tla, flag: team.flag || null })
  }
  bets.sort((a, b) => a.name.localeCompare(b.name))
  return bets
}

// ─── Group stage predictions ──────────────────────────────────────────────────

/**
 * Subscribe to all pre-tournament group stage predictions for a user.
 * callback receives: { [matchId]: { predictedScoreA, predictedScoreB } }
 */
export function subscribeToGroupPredictions(userId, callback) {
  const q = query(
    collection(db, GROUP_PREDS_COLLECTION),
    where('userId', '==', userId)
  )
  return onSnapshot(q, snap => {
    const preds = {}
    snap.forEach(d => {
      const data = d.data()
      preds[data.matchId] = data
    })
    callback(preds)
  })
}

/**
 * Save a single group stage prediction.
 */
export async function saveGroupPrediction(userId, matchId, scoreA, scoreB) {
  await setDoc(
    doc(db, GROUP_PREDS_COLLECTION, `${userId}_${matchId}`),
    {
      userId,
      matchId: String(matchId),
      predictedScoreA: scoreA,
      predictedScoreB: scoreB,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  )
}

// ─── Bracket & awards ─────────────────────────────────────────────────────────

/**
 * Subscribe to the user's bracket document.
 * callback receives: { picks: {}, goldenBoot: '', goldenBall: '' } or null
 */
export function subscribeToBracket(userId, callback) {
  return onSnapshot(doc(db, BRACKET_COLLECTION, userId), snap => {
    callback(snap.exists() ? snap.data() : null)
  })
}

/**
 * Save a single bracket pick (one knockout match winner).
 * Stored flat to avoid Firestore merge issues with nested maps.
 * Field pattern: pick_{matchId}
 */
export async function saveBracketPick(userId, matchId, winnerTla) {
  const ref = doc(db, BRACKET_COLLECTION, userId)
  await setDoc(ref, {
    userId,
    [`pick_${matchId}`]: winnerTla,
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

/**
 * Save a knockout match score prediction (one side at a time).
 * Stored flat to avoid Firestore merge issues with nested objects.
 * Field pattern: ks_{matchId}_{A|B}
 */
export async function saveKnockoutScore(userId, matchId, side, value) {
  const ref = doc(db, BRACKET_COLLECTION, userId)
  await setDoc(ref, {
    userId,
    [`ks_${matchId}_${side}`]: value,
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

/**
 * Save individual awards (golden boot / golden ball) and the baby-gender pick.
 * babyGender is 'boy' | 'girl' | '' (unset).
 */
export async function saveAwards(userId, goldenBoot, goldenBall, babyGender = '') {
  await setDoc(
    doc(db, BRACKET_COLLECTION, userId),
    { userId, goldenBoot, goldenBall, babyGender, updatedAt: Timestamp.now() },
    { merge: true }
  )
}

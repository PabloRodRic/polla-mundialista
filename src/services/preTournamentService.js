import {
  collection, doc, setDoc, onSnapshot,
  query, where, Timestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'

const GROUP_PREDS_COLLECTION = 'preTournamentGroupPredictions'
const BRACKET_COLLECTION     = 'preTournamentBracket'

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
 * Save individual awards.
 */
export async function saveAwards(userId, goldenBoot, goldenBall) {
  await setDoc(
    doc(db, BRACKET_COLLECTION, userId),
    { userId, goldenBoot, goldenBall, updatedAt: Timestamp.now() },
    { merge: true }
  )
}

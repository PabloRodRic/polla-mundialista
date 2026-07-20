/**
 * Admin override: write a live-knockout prediction (the `predictions` collection)
 * for one user + one match, bypassing the app's lock rules.
 *
 *   SA_KEY=<path/to/serviceAccount.json> node scripts/admin-set-prediction.mjs \
 *     --user <uid> --match <matchId> --a <scoreA> --b <scoreB> [--commit]
 *
 * Dry-run by default. Pass --commit to actually write.
 * Doc shape mirrors PredictionsPage.jsx: id = `${userId}_${matchId}`.
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    match: { type: 'string' },
    a: { type: 'string' },
    b: { type: 'string' },
    commit: { type: 'boolean', default: false },
  },
})

const keyPath = process.env.SA_KEY
if (!keyPath) throw new Error('set SA_KEY=<path to service account json>')
for (const k of ['user', 'match', 'a', 'b']) {
  if (values[k] == null) throw new Error(`missing --${k}`)
}

const userId = values.user
const matchId = String(values.match)
const scoreA = Number(values.a)
const scoreB = Number(values.b)
if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) throw new Error('scores must be integers')

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
const db = getFirestore()

const userSnap = await db.doc(`users/${userId}`).get()
const matchSnap = await db.doc(`matches/${matchId}`).get()
if (!userSnap.exists) throw new Error(`no user ${userId}`)
if (!matchSnap.exists) throw new Error(`no match ${matchId}`)
const m = matchSnap.data()

console.log(`user   : ${userSnap.data().name} (${userId})`)
console.log(`match  : ${m.teamA} vs ${m.teamB} [${m.stage}] status=${m.status} pointsCalculated=${m.pointsCalculated ?? false}`)
console.log(`writing: ${m.teamA} ${scoreA} - ${scoreB} ${m.teamB}`)

const ref = db.doc(`predictions/${userId}_${matchId}`)
const existing = await ref.get()
console.log(`\nBEFORE : ${existing.exists ? JSON.stringify(existing.data()) : '(no document)'}`)

if (!values.commit) {
  console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.')
  process.exit(0)
}

await ref.set(
  {
    userId,
    matchId,
    predictedScoreA: scoreA,
    predictedScoreB: scoreB,
    updatedAt: Timestamp.now(),
  },
  { merge: true },
)

const after = await ref.get()
console.log(`AFTER  : ${JSON.stringify(after.data())}`)
console.log('\n✅ written to predictions/' + `${userId}_${matchId}`)

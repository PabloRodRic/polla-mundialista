import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const keyPath = process.env.SA_KEY
if (!keyPath) throw new Error('set SA_KEY=<path to service account json>')

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
const db = getFirestore()

console.log('=== USERS ===')
const users = await db.collection('users').get()
users.forEach(d => {
  const u = d.data()
  console.log(`${d.id}  | name=${JSON.stringify(u.name)} | email=${u.email ?? '-'} | totalPoints=${u.totalPoints ?? 0}`)
})

console.log('\n=== MATCHES (knockout / non-group) ===')
const matches = await db.collection('matches').get()
matches.forEach(d => {
  const m = d.data()
  const teams = `${m.teamA ?? m.homeTeam ?? '?'} vs ${m.teamB ?? m.awayTeam ?? '?'}`
  const t = /fra|esp|spa/i.test(JSON.stringify(m))
  if (m.stage !== 'group' || t) {
    console.log(
      `${d.id} | stage=${m.stage} | ${teams} | status=${m.status} | score=${m.scoreA ?? '-'}-${m.scoreB ?? '-'} | date=${m.date?.toDate?.().toISOString?.() ?? m.date} | pointsCalculated=${m.pointsCalculated ?? false}`
    )
  }
})

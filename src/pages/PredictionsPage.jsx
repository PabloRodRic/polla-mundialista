import { useEffect, useState, useRef } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  doc, setDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'

function formatDate(timestamp) {
  if (!timestamp?.toDate) return ''
  return new Intl.DateTimeFormat('es', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(timestamp.toDate())
}

function isLocked(match) {
  if (!match.date?.toDate) return false
  return match.date.toDate() <= new Date()
}

function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="0"
      max="99"
      value={value === null || value === undefined ? '' : value}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      disabled={disabled}
      className="w-12 h-12 text-center text-xl font-bold rounded-lg border outline-none transition-colors"
      style={{
        background: disabled ? 'var(--color-surface)' : 'var(--color-surface-card)',
        border: `2px solid ${disabled ? 'var(--color-border)' : 'var(--color-pitch)'}`,
        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
        fontFamily: 'var(--font-display)',
        MozAppearance: 'textfield',
      }}
    />
  )
}

function PredictionResult({ points, predictedA, predictedB, realA, realB }) {
  if (points === null || points === undefined) return null

  let label = 'Sin puntos'
  if (predictedA === realA && predictedB === realB) label = 'Resultado exacto ✨'
  else if (points > 0) {
    const pResult = Math.sign(predictedA - predictedB)
    const rResult = Math.sign(realA - realB)
    const pDiff   = Math.abs(predictedA - predictedB)
    const rDiff   = Math.abs(realA - realB)
    if (pResult === rResult && pDiff === rDiff) label = 'Resultado + diferencia de gol'
    else if (pResult === rResult) label = 'Resultado correcto'
  }

  return (
    <div
      className="mt-3 rounded-lg px-3 py-2 flex items-center justify-between"
      style={{ background: points > 0 ? 'rgba(212,168,67,0.1)' : 'rgba(90,97,112,0.15)' }}
    >
      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: points > 0 ? 'var(--color-gold)' : 'var(--color-text-muted)' }}
      >
        {points > 0 ? `+${points} pts` : '0 pts'}
      </span>
    </div>
  )
}

function TeamSlot({ match, side }) {
  const flag  = side === 'A' ? match.flagA  : match.flagB
  const tla   = side === 'A' ? match.tlaA   : match.tlaB
  const name  = side === 'A' ? match.teamA  : match.teamB
  const crest = side === 'A' ? match.crestA : match.crestB

  const tbd = !tla && !name

  const imgSrc = flag
    ? `https://flagcdn.com/w80/${flag}.png`
    : crest || null

  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      {tbd ? (
        <div
          className="w-8 h-6 rounded flex items-center justify-center text-sm"
          style={{
            background: 'var(--color-surface)',
            border: '1px dashed var(--color-border)',
          }}
        >
          ⚽
        </div>
      ) : imgSrc ? (
        <img src={imgSrc} alt={name} loading="lazy" className="w-8 h-6 object-cover rounded shadow" />
      ) : (
        <div
          className="w-8 h-6 rounded flex items-center justify-center text-xs font-bold"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          {tla?.slice(0, 3) || '?'}
        </div>
      )}
      <span
        className="text-xs font-medium text-center"
        style={{ color: tbd ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
      >
        {tbd ? 'POR DEF.' : (tla || name)}
      </span>
    </div>
  )
}

function PredictionCard({ match, prediction, onSave, saving }) {
  const locked = isLocked(match)
  const finished = match.status === 'finished'

  const [scoreA, setScoreA] = useState(prediction?.predictedScoreA ?? null)
  const [scoreB, setScoreB] = useState(prediction?.predictedScoreB ?? null)
  const [prevPredA, setPrevPredA] = useState(prediction?.predictedScoreA)
  const [prevPredB, setPrevPredB] = useState(prediction?.predictedScoreB)

  // Sync with Firestore updates during render (avoids setState-in-effect)
  if (prediction?.predictedScoreA !== prevPredA) {
    setPrevPredA(prediction?.predictedScoreA)
    setScoreA(prediction?.predictedScoreA ?? null)
  }
  if (prediction?.predictedScoreB !== prevPredB) {
    setPrevPredB(prediction?.predictedScoreB)
    setScoreB(prediction?.predictedScoreB ?? null)
  }

  function handleChange(side, val) {
    const newA = side === 'A' ? val : scoreA
    const newB = side === 'B' ? val : scoreB
    if (side === 'A') setScoreA(val)
    else setScoreB(val)
    onSave(match.id, newA, newB)
  }

  return (
    <div
      className="rounded-xl p-4 mb-3"
      style={{
        background: 'var(--color-surface-card)',
        border: `1px solid ${locked ? 'var(--color-border)' : 'var(--color-pitch)'}`,
        opacity: match.status === 'cancelled' ? 0.5 : 1,
      }}
    >
      {/* Date + lock */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {match.stage === 'group' ? `Grupo ${match.group} · ` : ''}
          {formatDate(match.date)}
        </span>
        {locked && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            🔒 Cerrado
          </span>
        )}
        {saving && (
          <span className="text-xs" style={{ color: 'var(--color-gold)' }}>
            Guardando...
          </span>
        )}
      </div>

      {/* Teams + inputs */}
      <div className="flex items-center gap-3">
        <TeamSlot match={match} side="A" />

        {/* Score inputs */}
        <div className="flex items-center gap-2">
          <ScoreInput value={scoreA} onChange={v => handleChange('A', v)} disabled={locked} />
          <span style={{ color: 'var(--color-text-muted)' }}>–</span>
          <ScoreInput value={scoreB} onChange={v => handleChange('B', v)} disabled={locked} />
        </div>

        <TeamSlot match={match} side="B" />
      </div>

      {/* Real score (if finished) */}
      {finished && match.scoreA !== null && (
        <div className="mt-3 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Resultado: <strong style={{ color: 'var(--color-text-primary)' }}>
            {match.scoreA} – {match.scoreB}
          </strong>
        </div>
      )}

      {/* Points result */}
      {finished && prediction?.pointsEarned !== undefined && (
        <PredictionResult
          points={prediction.pointsEarned}
          predictedA={prediction.predictedScoreA}
          predictedB={prediction.predictedScoreB}
          realA={match.scoreA}
          realB={match.scoreB}
        />
      )}

      {/* Prompt if no prediction yet and not locked */}
      {!locked && prediction === null && (
        <p className="text-xs text-center mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Ingresa tu predicción antes del partido
        </p>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-4 mb-3 animate-pulse"
      style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex justify-between mb-3">
        <div className="h-3 w-32 rounded" style={{ background: 'var(--color-border)' }} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 h-10 rounded" style={{ background: 'var(--color-border)' }} />
        <div className="flex gap-2">
          <div className="w-12 h-12 rounded-lg" style={{ background: 'var(--color-border)' }} />
          <div className="w-12 h-12 rounded-lg" style={{ background: 'var(--color-border)' }} />
        </div>
        <div className="flex-1 h-10 rounded" style={{ background: 'var(--color-border)' }} />
      </div>
    </div>
  )
}

export default function PredictionsPage() {
  const { user } = useAuth()
  const [matches, setMatches] = useState([])
  const [predictions, setPredictions] = useState({}) // matchId → prediction doc
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})           // matchId → bool (per-card indicator)
  const [globalSaving, setGlobalSaving] = useState(false)
  const [saved, setSaved] = useState(false)          // brief "guardado" flash
  const [filter, setFilter] = useState('upcoming')
  const debounceRef = useRef({})
  const pendingRef = useRef({})                      // matchId → { scoreA, scoreB }
  const [dirtyCount, setDirtyCount] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('date', 'asc'))
    const unsub = onSnapshot(q, snap => {
      const data = []
      snap.forEach(d => data.push({ id: d.id, ...d.data() }))
      setMatches(data)
      setLoading(false)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'predictions'), orderBy('matchId'))
    const unsub = onSnapshot(q, snap => {
      const preds = {}
      snap.forEach(d => {
        const data = d.data()
        if (data.userId === user.uid) preds[data.matchId] = { id: d.id, ...data }
      })
      setPredictions(preds)
    })
    return unsub
  }, [user])

  async function writePrediction(matchId, scoreA, scoreB) {
    setSaving(s => ({ ...s, [matchId]: true }))
    try {
      await setDoc(
        doc(db, 'predictions', `${user.uid}_${matchId}`),
        {
          userId:          user.uid,
          matchId:         String(matchId),
          predictedScoreA: scoreA,
          predictedScoreB: scoreB,
          updatedAt:       Timestamp.now(),
        },
        { merge: true }
      )
    } catch (err) {
      console.error('Error saving prediction:', err)
    } finally {
      setSaving(s => ({ ...s, [matchId]: false }))
    }
  }

  function markDirty(matchId, scoreA, scoreB) {
    pendingRef.current[matchId] = { scoreA, scoreB }
    setDirtyCount(Object.keys(pendingRef.current).length)
  }

  function markClean(matchId) {
    delete pendingRef.current[matchId]
    setDirtyCount(Object.keys(pendingRef.current).length)
  }

  function savePrediction(matchId, scoreA, scoreB) {
    if (scoreA === null && scoreB === null) return
    markDirty(matchId, scoreA, scoreB)

    if (debounceRef.current[matchId]) clearTimeout(debounceRef.current[matchId])
    debounceRef.current[matchId] = setTimeout(async () => {
      await writePrediction(matchId, scoreA, scoreB)
      markClean(matchId)
    }, 800)
  }

  async function saveAllNow() {
    // Cancel all pending debounces
    Object.keys(debounceRef.current).forEach(id => {
      clearTimeout(debounceRef.current[id])
      delete debounceRef.current[id]
    })

    const entries = Object.entries(pendingRef.current)
    if (entries.length === 0) return

    setGlobalSaving(true)
    for (const [matchId, { scoreA, scoreB }] of entries) {
      await writePrediction(matchId, scoreA, scoreB)
      markClean(matchId)
    }
    setGlobalSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const now = new Date()

  const upcomingAll = matches.filter(
    m => m.date?.toDate && m.date.toDate() > now && m.status !== 'finished' && m.status !== 'cancelled'
  )

  // "Próximos" = the first 3 distinct calendar days that have upcoming matches.
  // Works correctly whether the next match is tomorrow or in 3 months.
  const nextMatchDays = [...new Set(
    upcomingAll.map(m => m.date.toDate().toDateString())
  )].slice(0, 3)
  const upcomingNext3 = upcomingAll.filter(
    m => nextMatchDays.includes(m.date.toDate().toDateString())
  )

  // Next match — used for the empty-state hint (shouldn't happen but just in case)
  const nextMatch = upcomingAll[0]

  const filtered = filter === 'all'
    ? matches
    : filter === 'upcoming'
      ? upcomingNext3
      : matches.filter(m => m.status === 'finished')

  const pendingCount = upcomingAll.filter(m => !predictions[m.id]).length

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-24">
      <div className="flex items-baseline justify-between mb-4">
        <h1
          className="text-xl font-bold"
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
        >
          Predicciones
        </h1>
        {pendingCount > 0 && (
          <span
            className="text-xs px-2 py-1 rounded-full font-semibold"
            style={{ background: 'var(--color-accent-red)', color: '#fff' }}
          >
            {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {[
          { value: 'upcoming', label: 'Próximos' },
          { value: 'finished', label: 'Finalizados' },
          { value: 'all',      label: 'Todos' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="flex-1 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: filter === f.value ? 'var(--color-gold)' : 'var(--color-surface-card)',
              color: filter === f.value ? '#111318' : 'var(--color-text-secondary)',
              border: filter === f.value ? 'none' : '1px solid var(--color-border)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
      ) : filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-4xl mb-2">📝</p>
          {filter === 'upcoming' && nextMatch ? (
            <>
              <p>No hay partidos próximamente.</p>
              <p className="text-sm mt-2">
                Próximo partido:{' '}
                <strong style={{ color: 'var(--color-text-secondary)' }}>
                  {formatDate(nextMatch.date)}
                </strong>
              </p>
            </>
          ) : (
            <p>No hay partidos para mostrar.</p>
          )}
        </div>
      ) : (
        filtered.map(m => (
          <PredictionCard
            key={m.id}
            match={m}
            prediction={predictions[m.id] ?? null}
            onSave={savePrediction}
            saving={saving[m.id] ?? false}
          />
        ))
      )}

      {/* Sticky save button — always visible above the tab bar */}
      <div
        className="fixed left-0 right-0 z-20 px-4 py-3"
        style={{
          bottom: '64px',
          background: 'linear-gradient(to top, var(--color-surface) 60%, transparent)',
        }}
      >
        <button
          onClick={saveAllNow}
          disabled={globalSaving}
          className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm shadow-xl transition-all"
          style={{
            display: 'flex',
            background: dirtyCount > 0
              ? 'var(--color-gold)'
              : saved
                ? 'var(--color-pitch)'
                : 'var(--color-surface-card)',
            color: dirtyCount > 0
              ? '#111318'
              : saved
                ? 'var(--color-text-primary)'
                : 'var(--color-text-muted)',
            border: dirtyCount > 0 || saved ? 'none' : '1px solid var(--color-border)',
            opacity: globalSaving ? 0.7 : 1,
          }}
        >
          {globalSaving
            ? '⏳ Guardando...'
            : saved
              ? '✓ Guardado'
              : dirtyCount > 0
                ? `Guardar ${dirtyCount} predicción${dirtyCount !== 1 ? 'es' : ''}`
                : '✓ Todo guardado'}
        </button>
      </div>
    </div>
  )
}

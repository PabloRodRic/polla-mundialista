import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'

const STAGE_LABELS = {
  group:          'Fase de Grupos',
  roundOf32:      'Ronda de 32',
  roundOf16:      'Octavos de Final',
  quarterfinals:  'Cuartos de Final',
  semifinals:     'Semifinales',
  thirdPlace:     'Tercer Puesto',
  final:          'Final',
}

function flagSrc(match, side) {
  const flag = side === 'A' ? match.flagA : match.flagB
  const crest = side === 'A' ? match.crestA : match.crestB
  if (flag) return `https://flagcdn.com/w80/${flag}.png`
  if (crest) return crest
  return null
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return ''
  return new Intl.DateTimeFormat('es', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(timestamp.toDate())
}

function StatusBadge({ status }) {
  if (status === 'live') {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--color-accent-red)' }}>
        <span className="w-2 h-2 rounded-full bg-[var(--color-accent-red)] animate-pulse" />
        EN VIVO
      </span>
    )
  }
  if (status === 'finished') {
    return (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        ✓ Finalizado
      </span>
    )
  }
  return (
    <span className="text-xs" style={{ color: 'var(--color-accent-blue)' }}>
      Próximo
    </span>
  )
}

function TeamFlag({ match, side }) {
  const src = flagSrc(match, side)
  const name = side === 'A' ? match.teamA : match.teamB
  if (!src) {
    return (
      <div
        className="w-8 h-6 rounded text-xs flex items-center justify-center font-bold"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
      >
        {(side === 'A' ? match.tlaA : match.tlaB) || '?'}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      className="w-8 h-6 object-cover rounded shadow"
    />
  )
}

function MatchCard({ match }) {
  return (
    <div
      className="rounded-xl p-4 mb-3"
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {match.stage === 'group' ? `Grupo ${match.group} · ` : ''}
          {formatDate(match.date)}
        </span>
        <StatusBadge status={match.status} />
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between gap-2">
        {/* Team A */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <TeamFlag match={match} side="A" />
          <span className="text-xs text-center font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {match.tlaA || match.teamA}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-2 px-2">
          {match.status === 'finished' || match.status === 'live' ? (
            <>
              <span
                className="text-2xl font-bold w-8 text-center"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
              >
                {match.scoreA ?? '–'}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>–</span>
              <span
                className="text-2xl font-bold w-8 text-center"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
              >
                {match.scoreB ?? '–'}
              </span>
            </>
          ) : (
            <span className="text-lg px-2" style={{ color: 'var(--color-text-muted)' }}>
              vs
            </span>
          )}
        </div>

        {/* Team B */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <TeamFlag match={match} side="B" />
          <span className="text-xs text-center font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {match.tlaB || match.teamB}
          </span>
        </div>
      </div>

      {/* Venue */}
      {match.venue && (
        <p className="text-center text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
          📍 {match.venue}
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
        <div className="h-3 w-16 rounded" style={{ background: 'var(--color-border)' }} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 flex flex-col items-center gap-2">
          <div className="w-8 h-6 rounded" style={{ background: 'var(--color-border)' }} />
          <div className="h-3 w-10 rounded" style={{ background: 'var(--color-border)' }} />
        </div>
        <div className="h-8 w-16 rounded" style={{ background: 'var(--color-border)' }} />
        <div className="flex-1 flex flex-col items-center gap-2">
          <div className="w-8 h-6 rounded" style={{ background: 'var(--color-border)' }} />
          <div className="h-3 w-10 rounded" style={{ background: 'var(--color-border)' }} />
        </div>
      </div>
    </div>
  )
}

export default function MatchesPage() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('date', 'asc'))
    const unsub = onSnapshot(q, snap => {
      const data = []
      snap.forEach(d => data.push({ id: d.id, ...d.data() }))
      setMatches(data)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  // Collect available groups
  const groups = [...new Set(
    matches.filter(m => m.group).map(m => m.group)
  )].sort()

  // Filter matches
  const filtered = filter === 'all'
    ? matches
    : filter === 'knockout'
      ? matches.filter(m => m.stage !== 'group')
      : matches.filter(m => m.group === filter)

  // Group by stage/matchday section
  const sections = []
  const seen = new Set()
  for (const m of filtered) {
    const key = m.stage === 'group'
      ? `Jornada ${m.matchday}`
      : STAGE_LABELS[m.stage] || m.stage
    if (!seen.has(key)) {
      seen.add(key)
      sections.push({ key, matches: [] })
    }
    sections[sections.length - 1].matches.push(m)
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4">
      <h1
        className="text-xl font-bold mb-4"
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
      >
        Partidos
      </h1>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
        <FilterTab label="Todos" value="all" current={filter} onClick={setFilter} />
        {groups.map(g => (
          <FilterTab key={g} label={`Grupo ${g}`} value={g} current={filter} onClick={setFilter} />
        ))}
        {matches.some(m => m.stage !== 'group') && (
          <FilterTab label="Eliminatorias" value="knockout" current={filter} onClick={setFilter} />
        )}
      </div>

      {loading ? (
        Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
      ) : filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-4xl mb-2">⚽</p>
          <p>No hay partidos disponibles.</p>
          <p className="text-sm mt-1">Un admin debe sincronizar los datos.</p>
        </div>
      ) : (
        sections.map(section => (
          <div key={section.key}>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3 mt-2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {section.key}
            </h2>
            {section.matches.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        ))
      )}
    </div>
  )
}

function FilterTab({ label, value, current, onClick }) {
  const active = current === value
  return (
    <button
      onClick={() => onClick(value)}
      className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
      style={{
        background: active ? 'var(--color-gold)' : 'var(--color-surface-card)',
        color: active ? '#111318' : 'var(--color-text-secondary)',
        border: active ? 'none' : '1px solid var(--color-border)',
      }}
    >
      {label}
    </button>
  )
}

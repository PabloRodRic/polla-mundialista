import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'

const MEDALS = ['🥇', '🥈', '🥉']

function RankBadge({ rank }) {
  if (rank <= 3) {
    return <span className="text-xl w-8 text-center">{MEDALS[rank - 1]}</span>
  }
  return (
    <span
      className="w-8 text-center text-sm font-bold"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {rank}
    </span>
  )
}

function PlayerRow({ entry, rank, isCurrentUser }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-colors"
      style={{
        background: isCurrentUser
          ? 'rgba(212,168,67,0.08)'
          : rank <= 3
            ? 'var(--color-surface-card)'
            : 'var(--color-surface-card)',
        border: isCurrentUser
          ? '1px solid rgba(212,168,67,0.3)'
          : '1px solid var(--color-border)',
      }}
    >
      <RankBadge rank={rank} />

      {/* Avatar */}
      {entry.photoURL ? (
        <img
          src={entry.photoURL}
          alt={entry.name}
          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          style={{ border: '2px solid var(--color-border)' }}
        />
      ) : (
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: 'var(--color-pitch)', color: 'var(--color-gold)' }}
        >
          {entry.name?.[0] || '?'}
        </div>
      )}

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold text-sm truncate"
          style={{ color: isCurrentUser ? 'var(--color-gold)' : 'var(--color-text-primary)' }}
        >
          {entry.name || entry.email || 'Jugador'}
          {isCurrentUser && (
            <span className="ml-1 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>
              (tú)
            </span>
          )}
        </p>
      </div>

      {/* Points */}
      <div className="text-right">
        <span
          className="text-lg font-bold"
          style={{
            color: rank === 1
              ? 'var(--color-gold)'
              : isCurrentUser
                ? 'var(--color-gold)'
                : 'var(--color-text-primary)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {entry.totalPoints ?? 0}
        </span>
        <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>pts</span>
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl mb-2 animate-pulse"
      style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
    >
      <div className="w-8 h-5 rounded" style={{ background: 'var(--color-border)' }} />
      <div className="w-9 h-9 rounded-full" style={{ background: 'var(--color-border)' }} />
      <div className="flex-1 h-4 rounded" style={{ background: 'var(--color-border)' }} />
      <div className="w-12 h-5 rounded" style={{ background: 'var(--color-border)' }} />
    </div>
  )
}

export default function LeaderboardPage() {
  const { user } = useAuth()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('totalPoints', 'desc'))
    const unsub = onSnapshot(q, snap => {
      const data = []
      snap.forEach(d => data.push({ id: d.id, ...d.data() }))
      setPlayers(data)
      setLoading(false)
    })
    return unsub
  }, [])

  const currentUserRank = players.findIndex(p => p.id === user?.uid) + 1

  return (
    <div className="max-w-lg mx-auto px-4 pt-4">
      <h1
        className="text-xl font-bold mb-2"
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
      >
        🏆 Tabla de Posiciones
      </h1>

      {!loading && currentUserRank > 0 && (
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Estás en el puesto <strong style={{ color: 'var(--color-gold)' }}>#{currentUserRank}</strong>
          {' '}de {players.length} jugadores
        </p>
      )}

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
      ) : players.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-4xl mb-2">🏆</p>
          <p>Todavía no hay jugadores en la tabla.</p>
        </div>
      ) : (
        players.map((player, i) => (
          <PlayerRow
            key={player.id}
            entry={player}
            rank={i + 1}
            isCurrentUser={player.id === user?.uid}
          />
        ))
      )}
    </div>
  )
}

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { compareLeaderboard } from '../services/matchSync';

// Only the top 2 win prize money, so only they get a medal.
const MEDALS = ['🥇', '🥈'];

// Two players are tied when they have the same points AND the same number of exact
// scorelines (the tiebreaker). Names don't break a tie — genuinely-tied players share a rank.
function isTied(a, b) {
  return (a.totalPoints || 0) === (b.totalPoints || 0) && (a.exactScores || 0) === (b.exactScores || 0);
}

// Standard competition ranking ("1-2-2-2-5"): tied players share the lowest rank in
// their group, and the next distinct player skips ahead by the group size.
// `players` must already be sorted with compareLeaderboard.
function computeRanks(players) {
  return players.map((p, i) => (i > 0 && isTied(p, players[i - 1]) ? null : i + 1)).reduce((ranks, r, i) => {
    ranks.push(r ?? ranks[i - 1]);
    return ranks;
  }, []);
}

function RankBadge({ rank }) {
  if (rank <= MEDALS.length) {
    return <span className='text-xl w-8 text-center'>{MEDALS[rank - 1]}</span>;
  }
  return (
    <span className='w-8 text-center text-sm font-bold' style={{ color: 'var(--color-text-muted)' }}>
      {rank}
    </span>
  );
}

function ChangeIndicator({ change }) {
  if (!change) return null;
  if (change > 0) return (
    <span className='flex items-center text-xs font-semibold' style={{ color: '#4caf72', minWidth: '2rem' }}>
      ▲{change}
    </span>
  );
  if (change < 0) return (
    <span className='flex items-center text-xs font-semibold' style={{ color: 'var(--color-accent-red)', minWidth: '2rem' }}>
      ▼{Math.abs(change)}
    </span>
  );
  return <span className='text-xs' style={{ color: 'var(--color-text-muted)', minWidth: '2rem' }}>—</span>;
}

function PlayerRow({ entry, rank, isCurrentUser, change }) {
  return (
    <div
      className='flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-colors'
      style={{
        background: isCurrentUser
          ? 'rgba(212,168,67,0.08)'
          : rank <= 3
            ? 'var(--color-surface-card)'
            : 'var(--color-surface-card)',
        border: isCurrentUser ? '1px solid rgba(212,168,67,0.3)' : '1px solid var(--color-border)',
      }}
    >
      <RankBadge rank={rank} />

      {/* Avatar */}
      {entry.photoURL ? (
        <img
          src={entry.photoURL}
          alt={entry.name}
          className='w-9 h-9 rounded-full object-cover shrink-0'
          style={{ border: '2px solid var(--color-border)' }}
        />
      ) : (
        <div
          className='w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0'
          style={{ background: 'var(--color-pitch)', color: 'var(--color-gold)' }}
        >
          {entry.name?.[0] || '?'}
        </div>
      )}

      {/* Name + hit breakdown */}
      <div className='flex-1 min-w-0'>
        <p
          className='font-semibold text-sm truncate'
          style={{ color: isCurrentUser ? 'var(--color-gold)' : 'var(--color-text-primary)' }}
        >
          {entry.name || entry.email || 'Jugador'}
          {isCurrentUser && (
            <span className='ml-1 text-xs font-normal' style={{ color: 'var(--color-text-muted)' }}>
              (tú)
            </span>
          )}
        </p>
        <p className='text-xs mt-0.5 flex items-center gap-1.5' style={{ color: 'var(--color-text-muted)' }}>
          <span>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{entry.correctScores ?? 0}</span>{' '}
            correctos
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{entry.goalDiffScores ?? 0}</span> DG
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>
            <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>{entry.exactScores ?? 0}</span> exactos
          </span>
        </p>
      </div>

      {/* Position change */}
      <ChangeIndicator change={change} />

      {/* Points */}
      <div className='text-right'>
        <span
          className='text-lg font-bold'
          style={{
            color: rank === 1 ? 'var(--color-gold)' : isCurrentUser ? 'var(--color-gold)' : 'var(--color-text-primary)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {entry.totalPoints ?? 0}
        </span>
        <span className='text-xs ml-1' style={{ color: 'var(--color-text-muted)' }}>
          pts
        </span>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      className='flex items-center gap-3 px-4 py-3 rounded-xl mb-2 animate-pulse'
      style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
    >
      <div className='w-8 h-5 rounded' style={{ background: 'var(--color-border)' }} />
      <div className='w-9 h-9 rounded-full' style={{ background: 'var(--color-border)' }} />
      <div className='flex-1 h-4 rounded' style={{ background: 'var(--color-border)' }} />
      <div className='w-12 h-5 rounded' style={{ background: 'var(--color-border)' }} />
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [rankSnapshot, setRankSnapshot] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      // Sort by points, then exact-score count (tiebreaker), then name
      data.sort(compareLeaderboard);
      setPlayers(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'leaderboard', 'rankSnapshot'), (snap) => {
      if (snap.exists()) setRankSnapshot(snap.data());
    });
    return unsub;
  }, []);

  const ranks = computeRanks(players);
  const currentUserIndex = players.findIndex((p) => p.id === user?.uid);
  const currentUserRank = currentUserIndex >= 0 ? ranks[currentUserIndex] : 0;

  return (
    <div className='max-w-lg mx-auto px-4 pt-4'>
      <h1
        className='text-xl font-bold mb-2'
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
      >
        🏆 Tabla de Posiciones
      </h1>

      {!loading && currentUserRank > 0 && (
        <p className='text-sm mb-4' style={{ color: 'var(--color-text-muted)' }}>
          Estás en el puesto <strong style={{ color: 'var(--color-gold)' }}>#{currentUserRank}</strong> de{' '}
          {players.length} jugadores
        </p>
      )}

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
      ) : players.length === 0 ? (
        <div className='text-center py-16' style={{ color: 'var(--color-text-muted)' }}>
          <p className='text-4xl mb-2'>🏆</p>
          <p>Todavía no hay jugadores en la tabla.</p>
        </div>
      ) : (
        players.map((player, i) => {
          const currentRank = ranks[i];
          const prevRank = rankSnapshot[player.id];
          const change = prevRank != null ? prevRank - currentRank : null;
          return (
            <PlayerRow
              key={player.id}
              entry={player}
              rank={currentRank}
              isCurrentUser={player.id === user?.uid}
              change={change}
            />
          );
        })
      )}
    </div>
  );
}

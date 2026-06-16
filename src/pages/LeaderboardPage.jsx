import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTournamentData } from '../contexts/TournamentDataContext';
import { tlaLabel } from '../utils/teamLabels';

const STAGE_LABELS = {
  roundOf32: 'Ronda de 32',
  roundOf16: 'Octavos de Final',
  quarterfinals: 'Cuartos de Final',
  semifinals: 'Semifinales',
  thirdPlace: 'Tercer Puesto',
  final: 'Final',
};

function flagSrc(match, side) {
  const flag = side === 'A' ? match.flagA : match.flagB;
  const crest = side === 'A' ? match.crestA : match.crestB;
  if (flag) return `https://flagcdn.com/w80/${flag}.png`;
  if (crest) return crest;
  return null;
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return '';
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp.toDate());
}

// Only the top 2 win prize money, so only they get a medal.
const MEDALS = ['🥇', '🥈'];

function RankBadge({ rank }) {
  if (rank <= MEDALS.length) {
    return <span className='text-xl w-6 text-center shrink-0'>{MEDALS[rank - 1]}</span>;
  }
  return (
    <span className='w-6 text-center text-sm font-bold shrink-0' style={{ color: 'var(--color-text-muted)' }}>
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
      className='flex items-center gap-2 px-3 py-3 rounded-xl mb-2 transition-colors'
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
          className='w-8 h-8 rounded-full object-cover shrink-0'
          style={{ border: '2px solid var(--color-border)' }}
        />
      ) : (
        <div
          className='w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0'
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
        <p
          className='text-[11px] mt-0.5 flex items-center gap-1 whitespace-nowrap'
          style={{ color: 'var(--color-text-muted)' }}
        >
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
      <div className='text-right shrink-0'>
        <span
          className='text-lg font-bold'
          style={{
            color: rank === 1 ? 'var(--color-gold)' : isCurrentUser ? 'var(--color-gold)' : 'var(--color-text-primary)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {entry.totalPoints ?? 0}
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

// One team's flag + TLA, used on both sides of a result row.
function TeamCell({ match, side, align }) {
  const src = flagSrc(match, side);
  const tla = tlaLabel(side === 'A' ? match.tlaA : match.tlaB) || (side === 'A' ? match.teamA : match.teamB) || '?';
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {src ? (
        <img src={src} alt='' loading='lazy' className='w-6 h-4 object-cover rounded shrink-0' />
      ) : (
        <div className='w-6 h-4 rounded shrink-0' style={{ background: 'var(--color-surface)' }} />
      )}
      <span className='text-sm font-medium truncate' style={{ color: 'var(--color-text-primary)' }}>
        {tla}
      </span>
    </div>
  );
}

// A single finished match: the real result, the user's prediction and points earned.
// The points sit at the right of the result line as a plain number (0 when none).
function ResultRow({ match, prediction }) {
  const pA = prediction?.predictedScoreA;
  const pB = prediction?.predictedScoreB;
  const hasPrediction = pA != null && pB != null;
  const pts = prediction?.pointsEarned ?? 0;

  return (
    <div
      className='rounded-xl px-3 py-2.5 mb-2'
      style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
    >
      <div className='flex items-center justify-between mb-2'>
        <span className='text-[11px]' style={{ color: 'var(--color-text-muted)' }}>
          {match.stage === 'group' ? `Grupo ${match.group}` : STAGE_LABELS[match.stage] || match.stage} ·{' '}
          {formatDate(match.date)}
        </span>
      </div>

      {/* Real result + points (right) — left spacer keeps the matchup centered */}
      <div className='flex items-center gap-2'>
        <div className='w-12 shrink-0' />
        <div className='flex-1 flex items-center justify-center gap-2 min-w-0'>
          <div className='flex-1 min-w-0'>
            <TeamCell match={match} side='A' align='right' />
          </div>
          <span
            className='text-base font-bold tabular-nums shrink-0 px-1'
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
          >
            {match.scoreA ?? '–'} – {match.scoreB ?? '–'}
          </span>
          <div className='flex-1 min-w-0'>
            <TeamCell match={match} side='B' align='left' />
          </div>
        </div>
        <div className='w-12 shrink-0 flex flex-col items-end leading-none'>
          <span
            className='text-lg font-bold tabular-nums'
            style={{ color: pts > 0 ? 'var(--color-gold)' : 'var(--color-text-muted)', fontFamily: 'var(--font-display)' }}
          >
            {pts}
          </span>
          <span className='text-[10px] mt-0.5' style={{ color: 'var(--color-text-muted)' }}>
            pts
          </span>
        </div>
      </div>

      {/* User prediction */}
      <div
        className='mt-2 pt-2 flex items-center justify-center gap-2 text-xs'
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        {hasPrediction ? (
          <>
            <span style={{ color: 'var(--color-text-muted)' }}>Tu pronóstico:</span>
            <span
              className='font-bold tabular-nums'
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
            >
              {pA} – {pB}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>No pronosticaste este partido</span>
        )}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [view, setView] = useState('ranking'); // 'ranking' | 'resultados'

  // All shared data (leaderboard, ranks, matches, the user's predictions) comes from
  // the single TournamentData subscription so it can't drift from the other pages.
  const {
    matches,
    matchesLoading,
    userPreds,
    players,
    playersLoading,
    ranks,
    rankChange,
    currentUserRank,
    me,
  } = useTournamentData();

  const loading = playersLoading;

  // Past matches, most recent first
  const pastMatches = matches
    .filter((m) => m.status === 'finished')
    .sort((a, b) => (b.date?.toDate?.() || 0) - (a.date?.toDate?.() || 0));

  const TABS = [
    { key: 'ranking', label: 'Tabla' },
    { key: 'resultados', label: 'Mis Resultados' },
  ];

  return (
    <div className='max-w-lg mx-auto px-4 pt-4'>
      <h1
        className='text-xl font-bold mb-4'
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
      >
        🏆 Tabla de Posiciones
      </h1>

      {/* Sub-tabs */}
      <div className='flex justify-center gap-2 mb-5'>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className='flex-1 md:flex-none md:px-10 py-1.5 md:py-3 rounded-full text-xs font-medium transition-colors'
            style={{
              background: view === t.key ? 'var(--color-gold)' : 'var(--color-surface-card)',
              color: view === t.key ? '#111318' : 'var(--color-text-secondary)',
              border: view === t.key ? 'none' : '1px solid var(--color-border)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TABLA (ranking) ── */}
      {view === 'ranking' && (
        <>
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
            players.map((player, i) => (
              <PlayerRow
                key={player.id}
                entry={player}
                rank={ranks[i]}
                isCurrentUser={player.id === user?.uid}
                change={rankChange[player.id] ?? null}
              />
            ))
          )}
        </>
      )}

      {/* ── MIS RESULTADOS ── */}
      {view === 'resultados' && (
        <>
          {/* Summary: total points + current place */}
          <div
            className='flex items-center justify-around rounded-2xl px-4 py-3 mb-4'
            style={{ background: 'var(--color-surface-card)', border: '1px solid rgba(212,168,67,0.3)' }}
          >
            <div className='text-center'>
              <p
                className='text-2xl font-bold'
                style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
              >
                {me?.totalPoints ?? 0}
              </p>
              <p className='text-[11px]' style={{ color: 'var(--color-text-muted)' }}>
                Puntos totales
              </p>
            </div>
            <div className='w-px h-10' style={{ background: 'var(--color-border)' }} />
            <div className='text-center'>
              <p
                className='text-2xl font-bold'
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
              >
                {currentUserRank > 0 ? `#${currentUserRank}` : '–'}
              </p>
              <p className='text-[11px]' style={{ color: 'var(--color-text-muted)' }}>
                de {players.length} jugadores
              </p>
            </div>
          </div>

          {matchesLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          ) : pastMatches.length === 0 ? (
            <div className='text-center py-16' style={{ color: 'var(--color-text-muted)' }}>
              <p className='text-4xl mb-2'>⚽</p>
              <p>Todavía no hay partidos finalizados.</p>
            </div>
          ) : (
            pastMatches.map((m) => <ResultRow key={m.id} match={m} prediction={userPreds[m.id]} />)
          )}
        </>
      )}
    </div>
  );
}

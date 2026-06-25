import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTournamentData } from '../contexts/TournamentDataContext';
import { subscribeToAllBrackets } from '../services/preTournamentService';
import { tlaLabel } from '../utils/teamLabels';

// Compute bonus breakdown from a preTournamentBracket doc
function computeBonus(bracket) {
  const adv = { roundOf32: 0, roundOf16: 0, quarterfinals: 0, semifinals: 0, final: 0 };
  let gsp = 0, ksp = 0, other = 0;
  if (!bracket) return { gsp, adv, totalAdv: 0, ksp, other };
  for (const [key, val] of Object.entries(bracket)) {
    if (key.startsWith('gsp_') && !key.includes('_done')) gsp += val || 0;
    else if (key.startsWith('ksp_')) ksp += val || 0;
    else if (key.startsWith('adv_')) {
      for (const stage of Object.keys(adv)) {
        if (key.startsWith(`adv_${stage}_`)) { adv[stage] += val || 0; break; }
      }
    }
  }
  other += bracket.tournamentOutcomePoints || 0;
  other += bracket.awardPoints || 0;
  const totalAdv = Object.values(adv).reduce((s, v) => s + v, 0);
  return { gsp, adv, totalAdv, ksp, other };
}

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

function PlayerRow({ entry, rank, isCurrentUser, change, onClick }) {
  return (
    <button
      onClick={onClick}
      className='w-full flex items-center gap-2 px-3 py-3 rounded-xl mb-2 transition-colors text-left'
      style={{
        background: isCurrentUser ? 'rgba(212,168,67,0.08)' : 'var(--color-surface-card)',
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

      {/* Name + bonus breakdown */}
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
        <p className='text-[11px] mt-0.5 flex items-center gap-1 whitespace-nowrap' style={{ color: 'var(--color-text-muted)' }}>
          <span><span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>{entry.exactScores ?? 0}</span> exactos</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span><span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{entry.goalDiffScores ?? 0}</span> DG</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span><span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{entry.correctScores ?? 0}</span> correctos</span>
        </p>
      </div>

      {/* Position change */}
      <ChangeIndicator change={change} />

      {/* Points */}
      <div className='text-right shrink-0'>
        <span
          className='text-lg font-bold'
          style={{
            color: rank === 1 || isCurrentUser ? 'var(--color-gold)' : 'var(--color-text-primary)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {entry.totalPoints ?? 0}
        </span>
      </div>
    </button>
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

const ADV_STAGES = [
  { stage: 'roundOf32',     label: 'Clasificados 16vos', trigger: 'group' },
  { stage: 'roundOf16',     label: 'Clasificados 8vos',  trigger: 'roundOf32' },
  { stage: 'quarterfinals', label: 'Clasificados 4tos',  trigger: 'roundOf16' },
  { stage: 'semifinals',    label: 'Clasificados SF',     trigger: 'quarterfinals' },
  { stage: 'final',         label: 'Clasificados Final',  trigger: 'semifinals' },
];

function PlayerDetailModal({ entry, bracketData, rank, totalPlayers, finishedStages, matchPts, onClose }) {
  const bonus = computeBonus(bracketData);
  const anyGroupBonus = bonus.gsp > 0 || bonus.totalAdv > 0;

  return (
    <div
      className='fixed inset-0 z-50 flex items-end sm:items-center justify-center'
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className='w-full max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden'
        style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', maxHeight: '85dvh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className='flex items-center gap-3 px-4 pt-4 pb-3' style={{ borderBottom: '1px solid var(--color-border)' }}>
          {entry.photoURL ? (
            <img src={entry.photoURL} alt='' className='w-10 h-10 rounded-full object-cover shrink-0' style={{ border: '2px solid var(--color-border)' }} />
          ) : (
            <div className='w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0' style={{ background: 'var(--color-pitch)', color: 'var(--color-gold)' }}>
              {entry.name?.[0] || '?'}
            </div>
          )}
          <div className='flex-1 min-w-0'>
            <p className='font-semibold truncate' style={{ color: 'var(--color-text-primary)' }}>{entry.name || 'Jugador'}</p>
            <p className='text-xs' style={{ color: 'var(--color-text-muted)' }}>#{rank} de {totalPlayers}</p>
          </div>
          <div className='text-right shrink-0'>
            <p className='text-2xl font-bold' style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>{entry.totalPoints ?? 0}</p>
            <p className='text-[10px]' style={{ color: 'var(--color-text-muted)' }}>pts totales</p>
          </div>
        </div>

        {/* Breakdown */}
        <div className='px-4 py-3 flex flex-col gap-0'>
          {/* Match predictions */}
          <p className='text-[10px] font-semibold uppercase tracking-wide mb-2 mt-1' style={{ color: 'var(--color-text-muted)' }}>Partidos</p>
          <Row label='Partidos en grupos' pts={matchPts} />
          {/* Future knockout match rows — shown when those stages have matches */}
          {['roundOf32','roundOf16','quarterfinals','semifinals','thirdPlace','final'].map(stage =>
            finishedStages.has(stage) ? (
              <Row key={stage} label={STAGE_LABELS[stage]} pts={bonus.ksp} />
            ) : null
          )}

          {/* Bonus */}
          {anyGroupBonus && (
            <>
              <p className='text-[10px] font-semibold uppercase tracking-wide mb-2 mt-4' style={{ color: 'var(--color-text-muted)' }}>Adicionales</p>
              {bonus.gsp > 0 && <Row label='Posiciones en grupos' pts={bonus.gsp} gold />}
              {ADV_STAGES.map(({ stage, label, trigger }) =>
                finishedStages.has(trigger) && bonus.adv[stage] !== undefined ? (
                  <Row key={stage} label={label} pts={bonus.adv[stage]} gold />
                ) : null
              )}
            </>
          )}
        </div>

        <div className='px-4 pb-4'>
          <button
            onClick={onClose}
            className='w-full mt-2 py-2.5 rounded-xl text-sm font-semibold'
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, pts, gold }) {
  return (
    <div className='flex items-center justify-between py-2' style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span className='text-sm' style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className='text-sm font-bold tabular-nums' style={{ color: gold ? 'var(--color-gold)' : 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
        {pts ?? 0}
      </span>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [view, setView] = useState('ranking'); // 'ranking' | 'resultados'
  const [allBrackets, setAllBrackets] = useState({});
  const [selectedPlayer, setSelectedPlayer] = useState(null); // { entry, rank }

  // All shared data (leaderboard, ranks, matches, the user's predictions) comes from
  // the single TournamentData subscription so it can't drift from the other pages.
  const {
    matches,
    matchesLoading,
    userPreds,
    myBracket,
    players,
    playersLoading,
    ranks,
    rankChange,
    currentUserRank,
    me,
  } = useTournamentData();

  useEffect(() => subscribeToAllBrackets(setAllBrackets), []);

  // Which stages have at least one finished match (controls which adv rows are visible)
  const finishedStages = useMemo(() => {
    const s = new Set();
    for (const m of matches) {
      if (m.status === 'finished' && m.stage) s.add(m.stage);
    }
    return s;
  }, [matches]);

  // Bonus points breakdown derived from the bracket document
  const bonusPoints = useMemo(() => {
    if (!myBracket) return null;
    const groups = {};
    const adv = { roundOf32: 0, roundOf16: 0, quarterfinals: 0, semifinals: 0, final: 0 };
    for (const [key, val] of Object.entries(myBracket)) {
      if (key.startsWith('gsp_') && key.length === 5) {
        groups[key[4]] = (groups[key[4]] || 0) + (val || 0);
      }
      for (const stage of Object.keys(adv)) {
        if (key.startsWith(`adv_${stage}_`)) adv[stage] += val || 0;
      }
    }
    const scoredGroups = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    const totalGsp = scoredGroups.reduce((s, [, pts]) => s + pts, 0);
    const totalAdv = Object.values(adv).reduce((s, v) => s + v, 0);
    return { scoredGroups, totalGsp, adv, totalAdv };
  }, [myBracket]);

  const loading = playersLoading;

  // Past matches, most recent first
  const pastMatches = matches
    .filter((m) => m.status === 'finished')
    .sort((a, b) => (b.date?.toDate?.() || 0) - (a.date?.toDate?.() || 0));



  // Group finished matches by stage section, in display order
  const STAGE_SECTIONS = [
    { key: 'group',         label: 'Partidos en Grupos' },
    { key: 'roundOf32',     label: '16vos de Final' },
    { key: 'roundOf16',     label: '8vos de Final' },
    { key: 'quarterfinals', label: 'Cuartos de Final' },
    { key: 'semifinals',    label: 'Semifinales' },
    { key: 'thirdPlace',    label: 'Tercer Puesto' },
    { key: 'final',         label: 'Final' },
  ];

  const matchesByStage = useMemo(() => {
    const map = {};
    for (const { key } of STAGE_SECTIONS) map[key] = [];
    for (const m of pastMatches) {
      if (map[m.stage]) map[m.stage].push(m);
    }
    return map;
  }, [pastMatches]);

  // Most recent stage that has finished matches — drives sort order and default open state
  const activeStage = useMemo(() => {
    for (const { key } of [...STAGE_SECTIONS].reverse()) {
      if (matchesByStage[key]?.length > 0) return key;
    }
    return 'group';
  }, [matchesByStage]);

  // Sections that have matches, most recent first
  const sortedSections = useMemo(() =>
    STAGE_SECTIONS.filter(s => matchesByStage[s.key]?.length > 0).reverse(),
  [matchesByStage]);

  const [openSections, setOpenSections] = useState(() => ({
    group: true, roundOf32: true, roundOf16: true, quarterfinals: true, semifinals: true, thirdPlace: true, final: true,
  }));

  // When a new round becomes active, open it and collapse all earlier rounds
  useEffect(() => {
    setOpenSections(prev => {
      const next = { ...prev };
      for (const { key } of STAGE_SECTIONS) {
        next[key] = key === activeStage;
      }
      return next;
    });
  }, [activeStage]);

  const toggleSection = useCallback((key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const TABS = [
    { key: 'ranking', label: 'Tabla' },
    { key: 'resultados', label: 'Mis Resultados' },
    { key: 'estadisticas', label: 'Estadísticas' },
  ];

  const leaderOf = (key) => players.reduce((best, p) => ((p[key] ?? 0) > (best[key] ?? 0) ? p : best), players[0] ?? null);
  const exactLeader = leaderOf('exactScores');
  const diffLeader = leaderOf('goalDiffScores');
  const correctLeader = leaderOf('correctScores');

  const additionalLeader = useMemo(() => {
    if (players.length === 0) return null;
    return players.reduce((best, p) => {
      const b = computeBonus(allBrackets[p.id]);
      const bestB = computeBonus(allBrackets[best?.id]);
      return (b.gsp + b.totalAdv) > (bestB.gsp + bestB.totalAdv) ? p : best;
    }, players[0]);
  }, [players, allBrackets]);

  const additionalLeaderTotal = useMemo(() => {
    if (!additionalLeader) return 0;
    const b = computeBonus(allBrackets[additionalLeader.id]);
    return b.gsp + b.totalAdv;
  }, [additionalLeader, allBrackets]);

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
                onClick={() => setSelectedPlayer({ entry: player, rank: ranks[i] })}
              />
            ))
          )}
        </>
      )}

      {/* ── ESTADÍSTICAS ── */}
      {view === 'estadisticas' && (
        <>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
          ) : players.length === 0 ? (
            <div className='text-center py-16' style={{ color: 'var(--color-text-muted)' }}>
              <p className='text-4xl mb-2'>📊</p>
              <p>Todavía no hay datos.</p>
            </div>
          ) : (
            <div className='flex flex-col gap-3 mb-6'>
              {[
                { label: 'Marcador Exacto', sublabel: 'exactos', icon: '🎯', key: 'exactScores', leader: exactLeader, color: 'var(--color-gold)' },
                { label: 'Diferencia de Goles', sublabel: 'DG', icon: '📐', key: 'goalDiffScores', leader: diffLeader, color: 'var(--color-text-primary)' },
                { label: 'Resultado Correcto', sublabel: 'correctos', icon: '✅', key: 'correctScores', leader: correctLeader, color: '#4caf72' },
                ...(additionalLeaderTotal > 0 ? [{ label: 'Puntos Adicionales', sublabel: 'adicionales', icon: '⭐', key: '_adicionales', leader: additionalLeader, color: 'var(--color-gold)', overrideVal: additionalLeaderTotal }] : []),
              ].map(({ label, sublabel, icon, key, leader, color, overrideVal }) => (
                <div
                  key={key}
                  className='flex items-center gap-3 rounded-2xl px-4 py-3'
                  style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
                >
                  <span className='text-2xl shrink-0'>{icon}</span>
                  <div className='flex-1 min-w-0'>
                    <p className='text-xs font-medium' style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                    <div className='flex items-center gap-2 mt-0.5'>
                      {leader?.photoURL ? (
                        <img src={leader.photoURL} alt='' className='w-5 h-5 rounded-full object-cover shrink-0' />
                      ) : (
                        <div
                          className='w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0'
                          style={{ background: 'var(--color-pitch)', color: 'var(--color-gold)' }}
                        >
                          {leader?.name?.[0] || '?'}
                        </div>
                      )}
                      <p className='text-sm font-semibold truncate' style={{ color: 'var(--color-text-primary)' }}>
                        {leader?.name || '–'}
                      </p>
                    </div>
                  </div>
                  <div className='text-right shrink-0'>
                    <p className='text-2xl font-bold' style={{ color, fontFamily: 'var(--font-display)' }}>
                      {overrideVal ?? (leader?.[key] ?? 0)}
                    </p>
                    <p className='text-[10px]' style={{ color: 'var(--color-text-muted)' }}>{sublabel}</p>
                  </div>
                </div>
              ))}

              {/* Full breakdown table */}
              <div
                className='rounded-2xl overflow-hidden'
                style={{ border: '1px solid var(--color-border)' }}
              >
                <div
                  className='grid grid-cols-4 px-3 py-2 text-[11px] font-semibold'
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', gridTemplateColumns: '1fr auto auto auto' }}
                >
                  <span>Jugador</span>
                  <span className='text-center w-12'>🎯</span>
                  <span className='text-center w-12'>📐</span>
                  <span className='text-center w-12'>✅</span>
                </div>
                {players.map((p) => (
                  <div
                    key={p.id}
                    className='grid px-3 py-2.5 text-sm'
                    style={{
                      gridTemplateColumns: '1fr auto auto auto',
                      borderTop: '1px solid var(--color-border)',
                      background: p.id === user?.uid ? 'rgba(212,168,67,0.06)' : 'transparent',
                    }}
                  >
                    <span
                      className='truncate font-medium'
                      style={{ color: p.id === user?.uid ? 'var(--color-gold)' : 'var(--color-text-primary)' }}
                    >
                      {p.name || p.email || 'Jugador'}
                    </span>
                    <span className='text-center w-12 font-bold tabular-nums' style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
                      {p.exactScores ?? 0}
                    </span>
                    <span className='text-center w-12 tabular-nums' style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-display)' }}>
                      {p.goalDiffScores ?? 0}
                    </span>
                    <span className='text-center w-12 tabular-nums' style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-display)' }}>
                      {p.correctScores ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
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

          {/* Bonus points: group standings + advancement per round */}
          {bonusPoints && bonusPoints.scoredGroups.length > 0 && (
            <div
              className='rounded-2xl px-4 py-3 mb-4'
              style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
            >
              <p className='text-xs font-semibold mb-2' style={{ color: 'var(--color-text-muted)' }}>
                Puntos adicionales
              </p>

              {/* Group standings */}
              <div className='flex items-center justify-between mb-1'>
                <span className='text-sm' style={{ color: 'var(--color-text-secondary)' }}>Posiciones en grupos</span>
                <span className='text-sm font-bold' style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
                  {bonusPoints.totalGsp}
                </span>
              </div>
              <div className='flex flex-wrap gap-1.5 mb-3'>
                {bonusPoints.scoredGroups.map(([group, pts]) => (
                  <span
                    key={group}
                    className='text-[11px] px-2 py-0.5 rounded-full'
                    style={{
                      background: pts > 0 ? 'rgba(212,168,67,0.12)' : 'var(--color-surface)',
                      color: pts > 0 ? 'var(--color-gold)' : 'var(--color-text-muted)',
                      border: `1px solid ${pts > 0 ? 'rgba(212,168,67,0.3)' : 'var(--color-border)'}`,
                    }}
                  >
                    {group}: {pts}
                  </span>
                ))}
              </div>

              {/* Advancement rows — one per round, only shown when that round has started */}
              {[
                { stage: 'roundOf32',     label: 'Clasificados a 16vos', trigger: 'group' },
                { stage: 'roundOf16',     label: 'Clasificados a 8vos',  trigger: 'roundOf32' },
                { stage: 'quarterfinals', label: 'Clasificados a 4tos',  trigger: 'roundOf16' },
                { stage: 'semifinals',    label: 'Clasificados a SF',     trigger: 'quarterfinals' },
                { stage: 'final',         label: 'Clasificados a Final',  trigger: 'semifinals' },
              ].map(({ stage, label, trigger }) =>
                finishedStages.has(trigger) ? (
                  <div
                    key={stage}
                    className='flex items-center justify-between pt-2'
                    style={{ borderTop: '1px solid var(--color-border)' }}
                  >
                    <span className='text-sm' style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                    <span className='text-sm font-bold' style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
                      {bonusPoints.adv[stage]}
                    </span>
                  </div>
                ) : null
              )}

              {/* Grand total */}
              <div className='flex items-center justify-between pt-2 mt-1' style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className='text-sm font-semibold' style={{ color: 'var(--color-gold)' }}>Total adicionales</span>
                <div className='flex flex-col items-end leading-none'>
                  <span className='text-lg font-bold tabular-nums' style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
                    {bonusPoints.totalGsp + bonusPoints.totalAdv}
                  </span>
                  <span className='text-[10px] mt-0.5' style={{ color: 'var(--color-text-muted)' }}>pts</span>
                </div>
              </div>
            </div>
          )}

          {matchesLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          ) : pastMatches.length === 0 ? (
            <div className='text-center py-16' style={{ color: 'var(--color-text-muted)' }}>
              <p className='text-4xl mb-2'>⚽</p>
              <p>Todavía no hay partidos finalizados.</p>
            </div>
          ) : (
            <>
              {sortedSections.map(({ key, label }) => {
                const sectionMatches = matchesByStage[key];
                const sectionPts = sectionMatches.reduce((s, m) => s + (userPreds[m.id]?.pointsEarned ?? 0), 0);
                const exact = sectionMatches.filter(m => userPreds[m.id]?.isExact).length;
                const gd = sectionMatches.filter(m => {
                  const p = userPreds[m.id];
                  return p && !p.isExact && p.resultTier === 2;
                }).length;
                const correct = sectionMatches.filter(m => {
                  const p = userPreds[m.id];
                  return p && !p.isExact && p.resultTier >= 1;
                }).length;
                const isOpen = openSections[key];
                return (
                  <div key={key} className='mb-4'>
                    <button
                      onClick={() => toggleSection(key)}
                      className='w-full flex items-center justify-between mb-2 pr-4'
                    >
                      <div className='flex items-center gap-2 min-w-0'>
                        <svg
                          className='w-4 h-4 transition-transform shrink-0'
                          style={{ color: 'var(--color-text-muted)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                          viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'
                        >
                          <path d='M6 9l6 6 6-6' />
                        </svg>
                        <span className='text-xs font-semibold uppercase tracking-wide shrink-0' style={{ color: 'var(--color-text-muted)' }}>
                          {label}
                        </span>
                        <span className='flex items-center gap-1 text-[11px] whitespace-nowrap' style={{ color: 'var(--color-text-muted)' }}>
                          {correct > 0 && <span style={{ color: 'var(--color-text-secondary)' }}>{correct}✓</span>}
                          {gd > 0 && <span style={{ color: 'var(--color-text-secondary)' }}>{gd}DG</span>}
                          {exact > 0 && <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>{exact}🎯</span>}
                        </span>
                      </div>
                      <div className='flex flex-col items-end leading-none shrink-0'>
                        <span className='text-lg font-bold tabular-nums' style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
                          {sectionPts}
                        </span>
                        <span className='text-[10px] mt-0.5' style={{ color: 'var(--color-text-muted)' }}>pts</span>
                      </div>
                    </button>
                    {isOpen && sectionMatches.map((m) => (
                      <ResultRow key={m.id} match={m} prediction={userPreds[m.id]} />
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {/* Player detail modal */}
      {selectedPlayer && (() => {
        const { entry, rank } = selectedPlayer;
        const bracket = allBrackets[entry.id];
        const bonus = computeBonus(bracket);
        const bonusTotal = bonus.gsp + bonus.totalAdv + bonus.ksp + bonus.other;
        const mPts = (entry.totalPoints ?? 0) - bonusTotal;
        return (
          <PlayerDetailModal
            entry={entry}
            bracketData={bracket}
            rank={rank}
            totalPlayers={players.length}
            finishedStages={finishedStages}
            matchPts={mPts}
            onClose={() => setSelectedPlayer(null)}
          />
        );
      })()}
    </div>
  );
}

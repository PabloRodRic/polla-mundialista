import { useState, useRef } from 'react';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTournamentData } from '../contexts/TournamentDataContext';
import { tlaLabel } from '../utils/teamLabels';
import { fetchOthersBets, fetchMatchPredictionStatus } from '../services/preTournamentService';
import OthersBetsModal from '../components/OthersBetsModal';
import PredictionStatusModal from '../components/PredictionStatusModal';
import BetsIconButton from '../components/BetsIconButton';
import PointsBadge from '../components/PointsBadge';

const KNOCKOUT_STAGES = ['roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'thirdPlace', 'final'];

const STAGE_LABEL = {
  roundOf32: 'Ronda de 32',
  roundOf16: 'Octavos de final',
  quarterfinals: 'Cuartos de final',
  semifinals: 'Semifinal',
  thirdPlace: 'Tercer puesto',
  final: 'Final',
};

// First official FIFA fixture number of each knockout stage. The API doesn't
// carry these, so we assign them by date order within each stage (FIFA numbers
// follow the schedule): R32 73–88, R16 89–96, QF 97–100, SF 101–102, 3rd 103, F 104.
const STAGE_START_NUMBER = {
  roundOf32: 73,
  roundOf16: 89,
  quarterfinals: 97,
  semifinals: 101,
  thirdPlace: 103,
  final: 104,
};

// Opens when both teams are known
function isLiveAvailable(match) {
  return !!(match.tlaA || match.teamA) && !!(match.tlaB || match.teamB);
}

// Locks 1 hour before kickoff
function isLiveLocked(match) {
  if (!match.date?.toDate) return false;
  const kickoff = match.date.toDate();
  return new Date() >= new Date(kickoff.getTime() - 1 * 60 * 60 * 1000);
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return '';
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp.toDate());
}

function formatFullDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type='number'
      min='0'
      max='99'
      value={value === null || value === undefined ? '' : value}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      disabled={disabled}
      className='w-12 h-12 text-center text-xl font-bold rounded-lg border outline-none transition-colors'
      style={{
        background: disabled ? 'var(--color-surface)' : 'var(--color-surface-card)',
        border: `2px solid ${disabled ? 'var(--color-border)' : 'var(--color-pitch)'}`,
        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
        fontFamily: 'var(--font-display)',
        MozAppearance: 'textfield',
      }}
    />
  );
}

function TeamSlot({ match, side }) {
  const flag = side === 'A' ? match.flagA : match.flagB;
  const tla = side === 'A' ? match.tlaA : match.tlaB;
  const name = side === 'A' ? match.teamA : match.teamB;
  const crest = side === 'A' ? match.crestA : match.crestB;

  const tbd = !tla && !name;

  const imgSrc = flag ? `https://flagcdn.com/w80/${flag}.png` : crest || null;

  return (
    <div className='flex-1 flex flex-col items-center gap-1'>
      {tbd ? (
        <div
          className='w-8 h-6 rounded flex items-center justify-center text-sm'
          style={{
            background: 'var(--color-surface)',
            border: '1px dashed var(--color-border)',
          }}
        >
          ⚽
        </div>
      ) : imgSrc ? (
        <img src={imgSrc} alt={name} loading='lazy' className='w-8 h-6 object-cover rounded shadow' />
      ) : (
        <div
          className='w-8 h-6 rounded flex items-center justify-center text-xs font-bold'
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          {tlaLabel(tla)?.slice(0, 3) || '?'}
        </div>
      )}
      <span
        className='text-xs font-medium text-center'
        style={{ color: tbd ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
      >
        {tbd ? 'POR DEF.' : tlaLabel(tla) || name}
      </span>
    </div>
  );
}

function PredictionCard({ match, prediction, onSave, saving, onShowBets, onShowStatus, matchNumber, isAdmin }) {
  const locked = isLiveLocked(match);
  const available = isLiveAvailable(match);
  const finished = match.status === 'finished';

  const [scoreA, setScoreA] = useState(prediction?.predictedScoreA ?? null);
  const [scoreB, setScoreB] = useState(prediction?.predictedScoreB ?? null);
  const [penaltyWinner, setPenaltyWinner] = useState(prediction?.predictedPenaltyWinner ?? null);
  const [prevPredA, setPrevPredA] = useState(prediction?.predictedScoreA);
  const [prevPredB, setPrevPredB] = useState(prediction?.predictedScoreB);
  const [prevPredW, setPrevPredW] = useState(prediction?.predictedPenaltyWinner);

  if (prediction?.predictedScoreA !== prevPredA) {
    setPrevPredA(prediction?.predictedScoreA);
    setScoreA(prediction?.predictedScoreA ?? null);
  }
  if (prediction?.predictedScoreB !== prevPredB) {
    setPrevPredB(prediction?.predictedScoreB);
    setScoreB(prediction?.predictedScoreB ?? null);
  }
  if (prediction?.predictedPenaltyWinner !== prevPredW) {
    setPrevPredW(prediction?.predictedPenaltyWinner);
    setPenaltyWinner(prediction?.predictedPenaltyWinner ?? null);
  }

  const isTie = scoreA !== null && scoreB !== null && scoreA === scoreB;

  function handleChange(side, val) {
    const newA = side === 'A' ? val : scoreA;
    const newB = side === 'B' ? val : scoreB;
    if (side === 'A') setScoreA(val);
    else setScoreB(val);
    const stillTie = newA !== null && newB !== null && newA === newB;
    const winner = stillTie ? penaltyWinner : null;
    if (!stillTie) setPenaltyWinner(null);
    onSave(match.id, newA, newB, winner);
  }

  function handleWinnerPick(tla) {
    setPenaltyWinner(tla);
    onSave(match.id, scoreA, scoreB, tla);
  }

  return (
    <div
      className='rounded-xl p-4 mb-3'
      style={{
        background: 'var(--color-surface-card)',
        border: `1px solid ${locked ? 'var(--color-border)' : available ? 'var(--color-pitch)' : 'var(--color-border)'}`,
        opacity: match.status === 'cancelled' ? 0.5 : 1,
      }}
    >
      {/* Stage + date + lock */}
      <div className='flex items-center justify-between mb-3'>
        <span className='text-xs truncate min-w-0' style={{ color: 'var(--color-text-muted)' }}>
          {matchNumber ? `Partido ${matchNumber} · ` : ''}
          {STAGE_LABEL[match.stage] ? `${STAGE_LABEL[match.stage]} · ` : ''}
          {formatDate(match.date)}
        </span>
        <div className='flex items-center gap-1.5 shrink-0 ml-2'>
          {locked && (
            <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
              🔒 Cerrado
            </span>
          )}
          {saving && (
            <span className='text-xs' style={{ color: 'var(--color-gold)' }}>
              Guardando...
            </span>
          )}
          <BetsIconButton
            disabled={!locked && !isAdmin}
            onClick={() => {
              const title = `${tlaLabel(match.tlaA) || match.teamA || '?'} vs ${tlaLabel(match.tlaB) || match.teamB || '?'}`;
              if (isAdmin && !locked) {
                onShowStatus({ matchId: match.id, title });
              } else {
                onShowBets({ matchId: match.id, type: 'live', title });
              }
            }}
          />
        </div>
      </div>

      {/* Teams + inputs */}
      <div className='flex items-center gap-3'>
        <TeamSlot match={match} side='A' />

        <div className='flex items-center gap-2'>
          <ScoreInput value={scoreA} onChange={(v) => handleChange('A', v)} disabled={locked || !available} />
          <span style={{ color: 'var(--color-text-muted)' }}>–</span>
          <ScoreInput value={scoreB} onChange={(v) => handleChange('B', v)} disabled={locked || !available} />
        </div>

        <TeamSlot match={match} side='B' />
      </div>

      {/* Penalty winner picker — appears when scores are tied and match is still open */}
      {isTie && available && !locked && (
        <div className='mt-3 pt-3' style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className='text-xs text-center mb-2' style={{ color: 'var(--color-text-muted)' }}>
            Empate — ¿quién gana por penales?
          </p>
          <div className='flex gap-2 justify-center'>
            {[{ tla: match.tlaA, flag: match.flagA, name: match.teamA }, { tla: match.tlaB, flag: match.flagB, name: match.teamB }].map((team) => (
              <button
                key={team.tla}
                onClick={() => handleWinnerPick(team.tla)}
                className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors'
                style={{
                  background: penaltyWinner === team.tla ? 'var(--color-pitch)' : 'var(--color-surface)',
                  color: penaltyWinner === team.tla ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${penaltyWinner === team.tla ? 'var(--color-pitch)' : 'var(--color-border)'}`,
                }}
              >
                {team.flag && <img src={`https://flagcdn.com/w20/${team.flag}.png`} className='w-4 h-3 object-cover rounded' alt='' />}
                {tlaLabel(team.tla) || team.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Show chosen penalty winner when locked */}
      {isTie && (locked || finished) && penaltyWinner && (
        <p className='text-xs text-center mt-2' style={{ color: 'var(--color-text-muted)' }}>
          Penales: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{tlaLabel(penaltyWinner)}</span>
        </p>
      )}

      {/* Not yet available message */}
      {!available && !finished && (
        <p className='text-xs text-center mt-3' style={{ color: 'var(--color-text-muted)' }}>
          Disponible cuando se definan los equipos
        </p>
      )}

      {/* Real result (if finished or live) */}
      {(finished || match.status === 'live') && match.scoreA !== null && (
        <div
          className='mt-3 pt-3 flex items-center justify-center gap-2 text-xs'
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span style={{ color: 'var(--color-text-muted)' }}>
            {match.status === 'live' ? '🔴 En vivo:' : 'Resultado final:'}
          </span>
          <span className='font-bold' style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
            {match.scoreA} – {match.scoreB}
          </span>
          <PointsBadge points={prediction?.pointsEarned} />
        </div>
      )}

      {/* Prompt if available but no prediction yet */}
      {available && !locked && prediction === null && (
        <p className='text-xs text-center mt-2' style={{ color: 'var(--color-text-muted)' }}>
          Ingresa tu predicción antes del partido
        </p>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className='rounded-xl p-4 mb-3 animate-pulse'
      style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
    >
      <div className='flex justify-between mb-3'>
        <div className='h-3 w-32 rounded' style={{ background: 'var(--color-border)' }} />
      </div>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex-1 h-10 rounded' style={{ background: 'var(--color-border)' }} />
        <div className='flex gap-2'>
          <div className='w-12 h-12 rounded-lg' style={{ background: 'var(--color-border)' }} />
          <div className='w-12 h-12 rounded-lg' style={{ background: 'var(--color-border)' }} />
        </div>
        <div className='flex-1 h-10 rounded' style={{ background: 'var(--color-border)' }} />
      </div>
    </div>
  );
}

export default function PredictionsPage() {
  const { user, profile } = useAuth();
  const isAdmin = !!profile?.isAdmin;
  // Shared subscription: all matches, the user's knockout predictions, and the
  // tournament-start date all live in TournamentData so they match the other pages.
  const {
    matches: allMatches,
    matchesLoading: loading,
    livePreds: predictions,
    firstGroupMatchDate: tournamentStart,
    tournamentStarted,
  } = useTournamentData();
  const [saving, setSaving] = useState({});
  const [filter, setFilter] = useState('upcoming');
  const debounceRef = useRef({});

  // "Ver pronósticos de otros" popup (post-lock, all users)
  const [betsModal, setBetsModal] = useState({ open: false, title: '', type: 'live' });
  const [betsData, setBetsData] = useState([]);
  const [betsLoading, setBetsLoading] = useState(false);

  function openBets({ matchId, type, title }) {
    setBetsModal({ open: true, title, type });
    setBetsData([]);
    setBetsLoading(true);
    fetchOthersBets(matchId, type)
      .then(setBetsData)
      .catch(() => setBetsData([]))
      .finally(() => setBetsLoading(false));
  }

  // Admin-only "who's missing" popup (pre-lock)
  const [statusModal, setStatusModal] = useState({ open: false, title: '' });
  const [statusRows, setStatusRows] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);

  function openStatus({ matchId, title }) {
    setStatusModal({ open: true, title });
    setStatusRows([]);
    setStatusLoading(true);
    fetchMatchPredictionStatus(matchId)
      .then(setStatusRows)
      .catch(() => setStatusRows([]))
      .finally(() => setStatusLoading(false));
  }

  // This tab only predicts knockout fixtures.
  const matches = allMatches.filter((m) => KNOCKOUT_STAGES.includes(m.stage));

  async function writePrediction(matchId, scoreA, scoreB, penaltyWinner = null) {
    setSaving((s) => ({ ...s, [matchId]: true }));
    try {
      await setDoc(
        doc(db, 'predictions', `${user.uid}_${matchId}`),
        {
          userId: user.uid,
          matchId: String(matchId),
          predictedScoreA: scoreA,
          predictedScoreB: scoreB,
          predictedPenaltyWinner: penaltyWinner,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    } catch (err) {
      console.error('Error saving prediction:', err);
    } finally {
      setSaving((s) => ({ ...s, [matchId]: false }));
    }
  }

  function savePrediction(matchId, scoreA, scoreB, penaltyWinner = null) {
    if (debounceRef.current[matchId]) clearTimeout(debounceRef.current[matchId]);
    if (scoreA === null || scoreB === null) {
      // Only clear Firestore when the user explicitly empties both fields
      if (scoreA === null && scoreB === null) {
        debounceRef.current[matchId] = setTimeout(() => {
          writePrediction(matchId, null, null, null);
        }, 800);
      }
      // One field still being filled — don't touch Firestore yet
      return;
    }
    debounceRef.current[matchId] = setTimeout(() => {
      writePrediction(matchId, scoreA, scoreB, penaltyWinner);
    }, 800);
  }

  const availableMatches = matches.filter(
    (m) => isLiveAvailable(m) && !isLiveLocked(m) && m.status !== 'finished' && m.status !== 'cancelled',
  );
  const finishedMatches = matches.filter((m) => m.status === 'finished');

  // "Próximos" = only the current/next knockout stage (first stage with non-finished matches)
  const nextStage = KNOCKOUT_STAGES.find((stage) =>
    matches.some((m) => m.stage === stage && m.status !== 'finished' && m.status !== 'cancelled'),
  );
  const upcomingMatches = nextStage ? matches.filter((m) => m.stage === nextStage) : [];

  const filtered = filter === 'all' ? matches : filter === 'upcoming' ? upcomingMatches : finishedMatches;

  const pendingCount = availableMatches.filter((m) => !predictions[m.id]).length;

  // Derive each knockout match's official FIFA number from its stage + date order
  const matchNumberById = {};
  for (const stage of KNOCKOUT_STAGES) {
    const start = STAGE_START_NUMBER[stage];
    if (!start) continue;
    matches
      .filter((m) => m.stage === stage)
      .slice()
      .sort((a, b) => (a.date?.toDate?.() || 0) - (b.date?.toDate?.() || 0))
      .forEach((m, i) => {
        matchNumberById[m.id] = start + i;
      });
  }

  // The whole tab stays locked until the World Cup kicks off (first group match);
  // `tournamentStarted` comes from the shared TournamentData context.
  return (
    <div className='max-w-5xl mx-auto px-4 pt-4 pb-6'>
      <div className='flex items-baseline justify-between mb-1'>
        <h1
          className='text-xl font-bold'
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
        >
          Llaves
        </h1>
        {tournamentStarted && pendingCount > 0 && (
          <span
            className='text-xs px-2 py-1 rounded-full font-semibold'
            style={{ background: 'var(--color-accent-red)', color: '#fff' }}
          >
            {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className='mt-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : !tournamentStarted ? (
        /* Locked until the tournament starts */
        <div
          className='mt-4 rounded-xl p-6 text-center max-w-lg mx-auto'
          style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
        >
          <p className='text-4xl mb-3'>🔒</p>
          <h2
            className='text-base font-bold mb-2'
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
          >
            Disponible cuando arranque el Mundial
          </h2>
          <p className='text-sm leading-relaxed mb-3' style={{ color: 'var(--color-text-secondary)' }}>
            Acá vas a marcar el resultado de cada partido de eliminatoria en vivo, hasta una hora antes de que empiece.
          </p>
          <p className='text-sm leading-relaxed' style={{ color: 'var(--color-text-secondary)' }}>
            Por ahora, completa <strong>todos</strong> tus pronósticos de grupos, llaves y premios en el tab de{' '}
            <strong style={{ color: 'var(--color-gold)' }}>Pronóstico</strong>.
          </p>
          {tournamentStart && (
            <p className='text-xs mt-4' style={{ color: 'var(--color-text-muted)' }}>
              Se habilita el {formatFullDate(tournamentStart)}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Instruction */}
          <p className='text-sm mt-1 mb-4' style={{ color: 'var(--color-text-muted)' }}>
            Marcá tus pronósticos en cada partido hasta una hora antes del inicio del mismo.
          </p>

          {/* Filter tabs — centered on desktop */}
          <div className='flex justify-center gap-2 mb-4'>
            {[
              { value: 'upcoming', label: 'Próximos' },
              { value: 'finished', label: 'Finalizados' },
              { value: 'all', label: 'Todos' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className='flex-1 md:flex-none md:px-10 py-1.5 md:py-3 rounded-full text-xs font-medium transition-colors'
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

          {filtered.length === 0 ? (
            <div className='text-center py-16' style={{ color: 'var(--color-text-muted)' }}>
              <p className='text-4xl mb-3'>{filter === 'upcoming' ? '📅' : filter === 'finished' ? '✅' : '📝'}</p>
              <p>
                {filter === 'upcoming'
                  ? 'No hay partidos próximos pendientes.'
                  : filter === 'finished'
                    ? 'Aún no hay partidos finalizados.'
                    : 'No hay partidos de fase eliminatoria.'}
              </p>
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4 items-start'>
              {filtered.map((m) => (
                <PredictionCard
                  key={m.id}
                  match={m}
                  prediction={predictions[m.id] ?? null}
                  onSave={savePrediction}
                  saving={saving[m.id] ?? false}
                  onShowBets={openBets}
                  onShowStatus={openStatus}
                  matchNumber={matchNumberById[m.id]}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </>
      )}

      <OthersBetsModal
        open={betsModal.open}
        onClose={() => setBetsModal((m) => ({ ...m, open: false }))}
        title={betsModal.title}
        type={betsModal.type}
        bets={betsData}
        loading={betsLoading}
        currentUserId={user?.uid}
      />
      <PredictionStatusModal
        open={statusModal.open}
        onClose={() => setStatusModal((m) => ({ ...m, open: false }))}
        title={statusModal.title}
        rows={statusRows}
        loading={statusLoading}
      />
    </div>
  );
}

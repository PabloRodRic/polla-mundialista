import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTournamentData } from '../contexts/TournamentDataContext';
import { tlaLabel } from '../utils/teamLabels';
import { TIME_FILTERS, DEFAULT_TIME_FILTER, filterMatchesByTime } from '../utils/matchFilters';
import { fetchOthersBets, fetchOthersLiveBets, fetchMatchPredictionStatus } from '../services/preTournamentService';
import OthersBetsModal from '../components/OthersBetsModal';
import PredictionStatusModal from '../components/PredictionStatusModal';
import BetsIconButton from '../components/BetsIconButton';
import PointsBadge from '../components/PointsBadge';
import PredictionScore from '../components/PredictionScore';

// Bright green ring on the flag of a knockout team that won on penalties.
const WIN_RING = { boxShadow: '0 0 0 2px #22e06b' };

// Live (knockout) predictions lock at that specific match's kickoff.
// Mirrors PredictionsPage so the two screens agree on when a pick locks — and, since this
// same gate reveals everyone's bets, so that others' picks only become visible once locked.
function isLiveLocked(match) {
  if (!match.date?.toDate) return false;
  const kickoff = match.date.toDate();
  return new Date() >= kickoff;
}

const STAGE_LABELS = {
  group: 'Fase de Grupos',
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
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp.toDate());
}

function StatusBadge({ status }) {
  if (status === 'live') {
    return (
      <span className='flex items-center gap-1 text-xs font-semibold' style={{ color: 'var(--color-accent-red)' }}>
        <span className='w-2 h-2 rounded-full bg-accent-red animate-pulse' />
        EN VIVO
      </span>
    );
  }
  if (status === 'finished') {
    return (
      <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
        ✓ Finalizado
      </span>
    );
  }
  return (
    <span className='text-xs' style={{ color: 'var(--color-accent-blue)' }}>
      Próximo
    </span>
  );
}

function TeamFlag({ match, side, won }) {
  const src = flagSrc(match, side);
  const name = side === 'A' ? match.teamA : match.teamB;
  if (!src) {
    return (
      <div
        className='w-8 h-6 rounded text-xs flex items-center justify-center font-bold'
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', ...(won ? WIN_RING : null) }}
      >
        {(side === 'A' ? match.tlaA : match.tlaB) || '?'}
      </div>
    );
  }
  return <img src={src} alt={name} loading='lazy' className='w-8 h-6 object-cover rounded shadow' style={won ? WIN_RING : undefined} />;
}

function MatchCard({ match, onShowBets, onShowStatus, tournamentStarted, isAdmin, prediction, bracketMatchup, bracketPred }) {
  const pA = prediction?.predictedScoreA;
  const pB = prediction?.predictedScoreB;
  const hasPrediction = pA != null && pB != null;
  const scored = match.status === 'finished' || match.status === 'live';
  // Knockout decided on penalties (level score + a stored tiebreaker winner) → mark the winner.
  const penSide =
    scored && match.stage !== 'group' && match.scoreA != null && match.scoreA === match.scoreB && (match.winner === 'home' || match.winner === 'away')
      ? match.winner
      : null;

  // When are this match's bets locked (and therefore safe to reveal to everyone)?
  //   group    → all group bets lock together when the tournament kicks off.
  //   knockout → live bets lock one hour before this specific match.
  const isGroup = match.stage === 'group';
  const locked = isGroup ? tournamentStarted : isLiveLocked(match);
  // Non-admins can only open after lock. The admin can peek early, but only for
  // knockout matches and only at the "who has / hasn't bet" status — never the
  // actual predictions — until the match locks.
  const adminCanPreview = isAdmin && !isGroup;
  return (
    <div
      className='rounded-xl p-4 mb-3'
      style={{
        background: 'var(--color-surface-card)',
        border: `1px solid ${bracketMatchup ? 'rgba(212,168,67,0.5)' : 'var(--color-border)'}`,
      }}
    >
      {/* Header */}
      <div className='flex items-center justify-between mb-3'>
        <div className='flex items-center gap-2 min-w-0'>
          <span className='text-xs truncate' style={{ color: 'var(--color-text-muted)' }}>
            {match.stage === 'group' ? `Grupo ${match.group} · ` : ''}
            {formatDate(match.date)}
          </span>
          {bracketMatchup && (
            <span
              className='text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0'
              style={{ background: 'rgba(212,168,67,0.15)', color: 'var(--color-gold)' }}
            >
              ✦ Acierto
            </span>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <StatusBadge status={match.status} />
          <BetsIconButton
            disabled={!locked && !adminCanPreview}
            onClick={() => (adminCanPreview && !locked ? onShowStatus(match) : onShowBets(match))}
          />
        </div>
      </div>

      {/* Teams */}
      <div className='flex items-center justify-between gap-2'>
        {/* Team A */}
        <div className='flex-1 flex flex-col items-center gap-1'>
          <TeamFlag match={match} side='A' won={penSide === 'home'} />
          <span className='text-xs text-center font-medium' style={{ color: 'var(--color-text-primary)' }}>
            {tlaLabel(match.tlaA) || match.teamA}
          </span>
        </div>

        {/* Score */}
        <div className='flex items-center gap-2 px-2'>
          {match.status === 'finished' || match.status === 'live' ? (
            <>
              <span
                className='text-2xl font-bold w-8 text-center'
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
              >
                {match.scoreA ?? '–'}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>–</span>
              <span
                className='text-2xl font-bold w-8 text-center'
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
              >
                {match.scoreB ?? '–'}
              </span>
            </>
          ) : (
            <span className='text-lg px-2' style={{ color: 'var(--color-text-muted)' }}>
              vs
            </span>
          )}
        </div>

        {/* Team B */}
        <div className='flex-1 flex flex-col items-center gap-1'>
          <TeamFlag match={match} side='B' won={penSide === 'away'} />
          <span className='text-xs text-center font-medium' style={{ color: 'var(--color-text-primary)' }}>
            {tlaLabel(match.tlaB) || match.teamB}
          </span>
        </div>
      </div>

      {/* Venue */}
      {match.venue && (
        <p className='text-center text-xs mt-3' style={{ color: 'var(--color-text-muted)' }}>
          📍 {match.venue}
        </p>
      )}

      {/* Predictions footer */}
      {(hasPrediction || bracketPred) && (
        <div
          className='mt-3 pt-2 text-xs'
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <div className='flex items-center justify-center gap-4 flex-wrap'>
            {hasPrediction && (
              <div className='flex items-center gap-1.5'>
                <span style={{ color: 'var(--color-text-muted)' }}>Predicciones:</span>
                <PredictionScore scoreA={pA} scoreB={pB} tlaA={match.tlaA} tlaB={match.tlaB} pick={prediction?.predictedPenaltyWinner} />
                {scored && <PointsBadge points={prediction.pointsEarned} />}
              </div>
            )}
            {bracketPred && (
              <div className='flex items-center gap-1.5'>
                <span style={{ color: 'var(--color-gold)', opacity: 0.8 }}>Pronóstico:</span>
                <PredictionScore scoreA={bracketPred.scoreA} scoreB={bracketPred.scoreB} tlaA={match.tlaA} tlaB={match.tlaB} pick={bracketPred.pick} />
                {scored && <PointsBadge points={bracketPred.points} />}
              </div>
            )}
          </div>
        </div>
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
        <div className='h-3 w-16 rounded' style={{ background: 'var(--color-border)' }} />
      </div>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex-1 flex flex-col items-center gap-2'>
          <div className='w-8 h-6 rounded' style={{ background: 'var(--color-border)' }} />
          <div className='h-3 w-10 rounded' style={{ background: 'var(--color-border)' }} />
        </div>
        <div className='h-8 w-16 rounded' style={{ background: 'var(--color-border)' }} />
        <div className='flex-1 flex flex-col items-center gap-2'>
          <div className='w-8 h-6 rounded' style={{ background: 'var(--color-border)' }} />
          <div className='h-3 w-10 rounded' style={{ background: 'var(--color-border)' }} />
        </div>
      </div>
    </div>
  );
}

export default function MatchesPage() {
  const { user, profile } = useAuth();
  const isAdmin = !!profile?.isAdmin;
  // Matches, the user's merged predictions and the tournament-lock state all come
  // from the shared TournamentData subscription (no per-page re-fetch / re-derive).
  const { matches, matchesLoading: loading, userPreds, bracketMatchupIds, bracketPredByMatchId, tournamentStarted } = useTournamentData();
  const [filter, setFilter] = useState(DEFAULT_TIME_FILTER);

  // "Ver pronósticos de otros" popup (post-lock, all users)
  const [betsModal, setBetsModal] = useState({ open: false, title: '', type: 'group' });
  const [betsData, setBetsData] = useState([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const [betsMatch, setBetsMatch] = useState(null);

  function openBets(match) {
    const type = match.stage === 'group' ? 'group' : 'live';
    const title = `${tlaLabel(match.tlaA) || match.teamA || '?'} vs ${tlaLabel(match.tlaB) || match.teamB || '?'}`;
    setBetsModal({ open: true, title, type });
    setBetsMatch(match);
    setBetsData([]);
    setBetsLoading(true);
    // Live (knockout) bets also carry each user's bracket prediction for the matchup.
    const load = type === 'live' ? fetchOthersLiveBets(match) : fetchOthersBets(match.id, type);
    load
      .then(setBetsData)
      .catch(() => setBetsData([]))
      .finally(() => setBetsLoading(false));
  }

  // Admin-only "who's missing" popup (pre-lock, knockout matches only)
  const [statusModal, setStatusModal] = useState({ open: false, title: '' });
  const [statusRows, setStatusRows] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);

  function openStatus(match) {
    const title = `${tlaLabel(match.tlaA) || match.teamA || '?'} vs ${tlaLabel(match.tlaB) || match.teamB || '?'}`;
    setStatusModal({ open: true, title });
    setStatusRows([]);
    setStatusLoading(true);
    fetchMatchPredictionStatus(match.id)
      .then(setStatusRows)
      .catch(() => setStatusRows([]))
      .finally(() => setStatusLoading(false));
  }

  // Filter matches by the shared time-based filter (Hoy / Próximos / Finalizados / Todos)
  const filtered = filterMatchesByTime(matches, filter);

  // Group by stage/matchday section
  const sections = [];
  const seen = new Set();
  for (const m of filtered) {
    const key = m.stage === 'group' ? `Jornada ${m.matchday}` : STAGE_LABELS[m.stage] || m.stage;
    if (!seen.has(key)) {
      seen.add(key);
      sections.push({ key, matches: [] });
    }
    sections[sections.length - 1].matches.push(m);
  }

  return (
    <div className='max-w-lg mx-auto px-4 pt-4'>
      <h1
        className='text-xl font-bold mb-4'
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
      >
        Partidos
      </h1>

      {/* Filter tabs */}
      <div className='flex justify-center gap-2 mb-4'>
        {TIME_FILTERS.map((f) => (
          <FilterTab key={f.value} label={f.label} value={f.value} current={filter} onClick={setFilter} />
        ))}
      </div>

      {loading ? (
        Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
      ) : filtered.length === 0 ? (
        <div className='text-center py-16' style={{ color: 'var(--color-text-muted)' }}>
          <p className='text-4xl mb-2'>⚽</p>
          {matches.length === 0 ? (
            <>
              <p>No hay partidos disponibles.</p>
              <p className='text-sm mt-1'>Un admin debe sincronizar los datos.</p>
            </>
          ) : (
            <p>No hay partidos en este filtro.</p>
          )}
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.key}>
            <h2
              className='text-xs font-semibold uppercase tracking-wider mb-3 mt-2'
              style={{ color: 'var(--color-text-muted)' }}
            >
              {section.key}
            </h2>
            {section.matches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onShowBets={openBets}
                onShowStatus={openStatus}
                tournamentStarted={tournamentStarted}
                isAdmin={isAdmin}
                prediction={userPreds[m.id]}
                bracketMatchup={bracketMatchupIds.has(m.id)}
                bracketPred={bracketPredByMatchId[m.id] ?? null}
              />
            ))}
          </div>
        ))
      )}

      <OthersBetsModal
        open={betsModal.open}
        onClose={() => setBetsModal((s) => ({ ...s, open: false }))}
        title={betsModal.title}
        type={betsModal.type}
        bets={betsData}
        loading={betsLoading}
        currentUserId={user?.uid}
        homeFlag={betsMatch?.flagA}
        awayFlag={betsMatch?.flagB}
        homeTla={betsMatch?.tlaA}
        awayTla={betsMatch?.tlaB}
        showPoints={betsMatch?.status === 'finished' || betsMatch?.status === 'live'}
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

function FilterTab({ label, value, current, onClick }) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className='flex-1 md:flex-none md:px-10 py-1.5 md:py-3 rounded-full text-xs font-medium transition-colors'
      style={{
        background: active ? 'var(--color-gold)' : 'var(--color-surface-card)',
        color: active ? '#111318' : 'var(--color-text-secondary)',
        border: active ? 'none' : '1px solid var(--color-border)',
      }}
    >
      {label}
    </button>
  );
}

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { tlaLabel } from '../utils/teamLabels';
import { TIME_FILTERS, DEFAULT_TIME_FILTER, filterMatchesByTime } from '../utils/matchFilters';
import { fetchOthersBets } from '../services/preTournamentService';
import OthersBetsModal from '../components/OthersBetsModal';
import BetsIconButton from '../components/BetsIconButton';

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

function TeamFlag({ match, side }) {
  const src = flagSrc(match, side);
  const name = side === 'A' ? match.teamA : match.teamB;
  if (!src) {
    return (
      <div
        className='w-8 h-6 rounded text-xs flex items-center justify-center font-bold'
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
      >
        {(side === 'A' ? match.tlaA : match.tlaB) || '?'}
      </div>
    );
  }
  return <img src={src} alt={name} loading='lazy' className='w-8 h-6 object-cover rounded shadow' />;
}

function MatchCard({ match, onShowBets, betsLocked }) {
  return (
    <div
      className='rounded-xl p-4 mb-3'
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div className='flex items-center justify-between mb-3'>
        <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
          {match.stage === 'group' ? `Grupo ${match.group} · ` : ''}
          {formatDate(match.date)}
        </span>
        <div className='flex items-center gap-2'>
          <StatusBadge status={match.status} />
          <BetsIconButton disabled={!betsLocked} onClick={() => onShowBets(match)} />
        </div>
      </div>

      {/* Teams */}
      <div className='flex items-center justify-between gap-2'>
        {/* Team A */}
        <div className='flex-1 flex flex-col items-center gap-1'>
          <TeamFlag match={match} side='A' />
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
          <TeamFlag match={match} side='B' />
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
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(DEFAULT_TIME_FILTER);

  // "Ver pronósticos de otros" popup
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
    fetchOthersBets(match.id, type)
      .then(setBetsData)
      .catch(() => setBetsData([]))
      .finally(() => setBetsLoading(false));
  }

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('date', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
        setMatches(data);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  // Predictions (and therefore others' bets) unlock once the tournament starts —
  // i.e. the earliest group-stage match has kicked off.
  const firstGroupMatchDate = matches.reduce((earliest, m) => {
    if (m.stage !== 'group') return earliest;
    const d = m.date?.toDate?.();
    if (!d) return earliest;
    return !earliest || d < earliest ? d : earliest;
  }, null);
  const betsLocked = firstGroupMatchDate ? new Date() >= firstGroupMatchDate : false;

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
      <div className='flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none'>
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
              <MatchCard key={m.id} match={m} onShowBets={openBets} betsLocked={betsLocked} />
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
      />
    </div>
  );
}

function FilterTab({ label, value, current, onClick }) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className='shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors'
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

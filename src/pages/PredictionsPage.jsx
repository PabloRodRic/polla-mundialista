import { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

const KNOCKOUT_STAGES = ['roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'thirdPlace', 'final'];

const STAGE_LABEL = {
  roundOf32: 'Ronda de 32',
  roundOf16: 'Octavos de final',
  quarterfinals: 'Cuartos de final',
  semifinals: 'Semifinal',
  thirdPlace: 'Tercer puesto',
  final: 'Final',
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
          {tla?.slice(0, 3) || '?'}
        </div>
      )}
      <span
        className='text-xs font-medium text-center'
        style={{ color: tbd ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
      >
        {tbd ? 'POR DEF.' : tla || name}
      </span>
    </div>
  );
}

function PredictionCard({ match, prediction, onSave, saving }) {
  const locked = isLiveLocked(match);
  const available = isLiveAvailable(match);
  const finished = match.status === 'finished';

  const [scoreA, setScoreA] = useState(prediction?.predictedScoreA ?? null);
  const [scoreB, setScoreB] = useState(prediction?.predictedScoreB ?? null);
  const [prevPredA, setPrevPredA] = useState(prediction?.predictedScoreA);
  const [prevPredB, setPrevPredB] = useState(prediction?.predictedScoreB);

  if (prediction?.predictedScoreA !== prevPredA) {
    setPrevPredA(prediction?.predictedScoreA);
    setScoreA(prediction?.predictedScoreA ?? null);
  }
  if (prediction?.predictedScoreB !== prevPredB) {
    setPrevPredB(prediction?.predictedScoreB);
    setScoreB(prediction?.predictedScoreB ?? null);
  }

  function handleChange(side, val) {
    const newA = side === 'A' ? val : scoreA;
    const newB = side === 'B' ? val : scoreB;
    if (side === 'A') setScoreA(val);
    else setScoreB(val);
    onSave(match.id, newA, newB);
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
        <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
          {STAGE_LABEL[match.stage] ? `${STAGE_LABEL[match.stage]} · ` : ''}
          {formatDate(match.date)}
        </span>
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
          {prediction?.pointsEarned !== undefined && (
            <span
              className='font-semibold'
              style={{ color: prediction.pointsEarned > 0 ? 'var(--color-gold)' : 'var(--color-text-muted)' }}
            >
              {prediction.pointsEarned > 0 ? `+${prediction.pointsEarned} pts` : '· sin puntos'}
            </span>
          )}
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
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [filter, setFilter] = useState('upcoming');
  const debounceRef = useRef({});

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = [];
      snap.forEach((d) => {
        const m = { id: d.id, ...d.data() };
        if (KNOCKOUT_STAGES.includes(m.stage)) data.push(m);
      });
      setMatches(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'predictions'), orderBy('matchId'));
    const unsub = onSnapshot(q, (snap) => {
      const preds = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.userId === user.uid) preds[data.matchId] = { id: d.id, ...data };
      });
      setPredictions(preds);
    });
    return unsub;
  }, [user]);

  async function writePrediction(matchId, scoreA, scoreB) {
    setSaving((s) => ({ ...s, [matchId]: true }));
    try {
      await setDoc(
        doc(db, 'predictions', `${user.uid}_${matchId}`),
        {
          userId: user.uid,
          matchId: String(matchId),
          predictedScoreA: scoreA,
          predictedScoreB: scoreB,
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

  function savePrediction(matchId, scoreA, scoreB) {
    if (scoreA === null && scoreB === null) return;
    if (debounceRef.current[matchId]) clearTimeout(debounceRef.current[matchId]);
    debounceRef.current[matchId] = setTimeout(() => {
      writePrediction(matchId, scoreA, scoreB);
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

  const filtered =
    filter === 'all'
      ? matches
      : filter === 'upcoming'
        ? upcomingMatches
        : finishedMatches;

  const pendingCount = availableMatches.filter((m) => !predictions[m.id]).length;

  return (
    <div className='max-w-lg mx-auto px-4 pt-4 pb-6'>
      <div className='flex items-baseline justify-between mb-4'>
        <h1
          className='text-xl font-bold'
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
        >
          Predicciones
        </h1>
        {pendingCount > 0 && (
          <span
            className='text-xs px-2 py-1 rounded-full font-semibold'
            style={{ background: 'var(--color-accent-red)', color: '#fff' }}
          >
            {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className='flex gap-2 mb-4'>
        {[
          { value: 'upcoming', label: 'Próximos' },
          { value: 'finished', label: 'Finalizados' },
          { value: 'all', label: 'Todos' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className='flex-1 py-1.5 rounded-full text-xs font-medium transition-colors'
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
        Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
      ) : filtered.length === 0 ? (
        <div className='text-center py-16' style={{ color: 'var(--color-text-muted)' }}>
          <p className='text-4xl mb-3'>
            {filter === 'upcoming' ? '📅' : filter === 'finished' ? '✅' : '📝'}
          </p>
          <p>
            {filter === 'upcoming'
              ? 'No hay partidos próximos pendientes.'
              : filter === 'finished'
                ? 'Aún no hay partidos finalizados.'
                : 'No hay partidos de fase eliminatoria.'}
          </p>
        </div>
      ) : (
        filtered.map((m) => (
          <PredictionCard
            key={m.id}
            match={m}
            prediction={predictions[m.id] ?? null}
            onSave={savePrediction}
            saving={saving[m.id] ?? false}
          />
        ))
      )}

    </div>
  );
}

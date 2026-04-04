import { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeToGroupPredictions,
  saveGroupPrediction,
  subscribeToBracket,
  saveBracketPick,
  saveKnockoutScore,
  saveAwards,
} from '../services/preTournamentService';
import { computeGroupStandings, getBest3rdPlaceTeams, countPredictedMatches } from '../utils/standingsCalculator';
import {
  BRACKET_R32,
  BRACKET_R16,
  BRACKET_QF,
  BRACKET_SF,
  SLOT_LABEL,
  getR32Teams,
  buildTeamLookup,
  isRoundComplete,
} from '../utils/bracketUtils';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

const KNOCKOUT_ROUNDS = [
  { key: 'roundOf32', label: '16avos' },
  { key: 'roundOf16', label: 'Octavos' },
  { key: 'quarterfinals', label: 'Cuartos' },
  { key: 'semifinals', label: 'Semifinales' },
  { key: 'thirdPlace', label: 'Tercer Puesto' },
  { key: 'final', label: 'Final' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const externalText = value === null || value === undefined ? '' : String(value);
  const [text, setText] = useState(externalText);
  const lastExternal = useRef(value);

  // Sync only when parent value changes externally (e.g. Firestore update)
  if (value !== lastExternal.current) {
    lastExternal.current = value;
    if (externalText !== text) setText(externalText);
  }

  function handleChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setText(raw);
    onChange(raw === '' ? null : Number(raw));
  }

  return (
    <input
      type='text'
      inputMode='numeric'
      pattern='[0-9]*'
      maxLength={2}
      value={text}
      onChange={handleChange}
      disabled={disabled}
      className='w-11 h-11 text-center text-lg font-bold rounded-lg border outline-none transition-colors'
      style={{
        background: disabled ? 'var(--color-surface)' : 'var(--color-surface-card)',
        border: `2px solid ${disabled ? 'var(--color-border)' : 'var(--color-pitch)'}`,
        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
        fontFamily: 'var(--font-display)',
      }}
    />
  );
}

// ─── Group stage match card ────────────────────────────────────────────────────

function GroupMatchCard({ match, prediction, onSave, saving, locked }) {
  const [scoreA, setScoreA] = useState(prediction?.predictedScoreA ?? null);
  const [scoreB, setScoreB] = useState(prediction?.predictedScoreB ?? null);
  const [prevPredA, setPrevPredA] = useState(prediction?.predictedScoreA);
  const [prevPredB, setPrevPredB] = useState(prediction?.predictedScoreB);

  // Sync with Firestore updates during render (avoids setState-in-effect)
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

  const isCancelled = match.status === 'cancelled';
  const isDisabled = locked || isCancelled;

  const sA = scoreA !== null && scoreA !== undefined ? Number(scoreA) : null;
  const sB = scoreB !== null && scoreB !== undefined ? Number(scoreB) : null;
  const hasResult = sA !== null && sB !== null;
  const homeWins = hasResult && sA > sB;
  const awayWins = hasResult && sA < sB;
  const isDraw = hasResult && sA === sB;

  function sideStyle(isWinner, isDraw) {
    if (isWinner) return { background: 'rgba(212,168,67,0.12)', borderRadius: '8px' };
    if (isDraw) return { background: 'rgba(100,120,160,0.08)', borderRadius: '8px' };
    return {};
  }

  return (
    <div
      className='rounded-xl p-3 mb-2'
      style={{
        background: 'var(--color-surface-card)',
        border: `1px solid ${isCancelled ? 'var(--color-border)' : hasResult ? 'var(--color-pitch)' : 'var(--color-border)'}`,
        opacity: isCancelled ? 0.5 : 1,
      }}
    >
      {/* Date + saving */}
      <div className='flex items-center justify-between mb-2'>
        <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
          Jornada {match.matchday} · {formatDate(match.date)}
        </span>
        {isCancelled
          ? <span className='text-xs' style={{ color: 'var(--color-accent-red)' }}>Cancelado</span>
          : saving && <span className='text-xs' style={{ color: 'var(--color-gold)' }}>Guardando...</span>
        }
      </div>

      <div className='flex items-center gap-2'>
        {/* Team A */}
        <div
          className='flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all'
          style={sideStyle(homeWins, isDraw)}
        >
          {match.flagA ? (
            <img
              src={`https://flagcdn.com/w80/${match.flagA}.png`}
              alt={match.teamA}
              loading='lazy'
              className='w-10 h-7 object-cover rounded shadow'
            />
          ) : (
            <div className='w-10 h-7 rounded' style={{ background: 'var(--color-border)' }} />
          )}
          <span
            className='text-xs font-bold'
            style={{ color: homeWins ? 'var(--color-gold)' : 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
          >
            {match.tlaA}
          </span>
        </div>

        {/* Score inputs */}
        <div className='flex items-center gap-1.5'>
          <ScoreInput value={scoreA} onChange={(v) => handleChange('A', v)} disabled={isDisabled} />
          <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>–</span>
          <ScoreInput value={scoreB} onChange={(v) => handleChange('B', v)} disabled={isDisabled} />
        </div>

        {/* Team B */}
        <div
          className='flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all'
          style={sideStyle(awayWins, isDraw)}
        >
          {match.flagB ? (
            <img
              src={`https://flagcdn.com/w80/${match.flagB}.png`}
              alt={match.teamB}
              loading='lazy'
              className='w-10 h-7 object-cover rounded shadow'
            />
          ) : (
            <div className='w-10 h-7 rounded' style={{ background: 'var(--color-border)' }} />
          )}
          <span
            className='text-xs font-bold'
            style={{ color: awayWins ? 'var(--color-gold)' : 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
          >
            {match.tlaB}
          </span>
        </div>
      </div>

      {/* Real result (if finished or live) */}
      {(match.status === 'finished' || match.status === 'live') && match.scoreA !== null && (
        <div
          className='mt-2 pt-2 flex items-center justify-center gap-2 text-xs'
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

    </div>
  );
}

// ─── Group standings table ─────────────────────────────────────────────────────

function StandingsTable({ standings, best3rdTlas }) {
  if (!standings || standings.length === 0) return null;

  function rowStyle(idx) {
    if (idx === 0) return 'rgba(212,168,67,0.15)'; // 1st – gold
    if (idx === 1) return 'rgba(100,180,100,0.12)'; // 2nd – green
    if (idx === 2 && best3rdTlas.includes(standings[idx]?.tla)) return 'rgba(59,130,246,0.12)'; // best 3rd
    return 'transparent';
  }

  function badge(idx) {
    if (idx === 0)
      return (
        <span title='Clasifica directo' style={{ color: 'var(--color-gold)' }}>
          🥇
        </span>
      );
    if (idx === 1)
      return (
        <span title='Clasifica directo' style={{ color: '#6dbf6d' }}>
          🥈
        </span>
      );
    if (idx === 2 && best3rdTlas.includes(standings[idx]?.tla))
      return (
        <span title='Mejor tercero' style={{ color: '#60a5fa' }}>
          ✦
        </span>
      );
    return null;
  }

  return (
    <div className='rounded-xl overflow-hidden mt-2' style={{ border: '1px solid var(--color-border)' }}>
      <table className='w-full text-xs'>
        <thead>
          <tr style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
            <th className='py-2 pl-3 text-left font-medium'>Equipo</th>
            <th className='py-2 px-1 text-center font-medium'>PJ</th>
            <th className='py-2 px-1 text-center font-medium'>G</th>
            <th className='py-2 px-1 text-center font-medium'>E</th>
            <th className='py-2 px-1 text-center font-medium'>P</th>
            <th className='py-2 px-1 text-center font-medium'>GD</th>
            <th className='py-2 pr-3 text-center font-medium'>Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team, idx) => (
            <tr key={team.tla} style={{ background: rowStyle(idx), borderTop: '1px solid var(--color-border)' }}>
              <td className='py-2 pl-3'>
                <div className='flex items-center gap-1.5'>
                  {badge(idx)}
                  {team.flag && (
                    <img
                      src={`https://flagcdn.com/w80/${team.flag}.png`}
                      alt={team.name}
                      className='w-5 h-3.5 object-cover rounded'
                    />
                  )}
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{team.tla}</span>
                </div>
              </td>
              <td className='py-2 px-1 text-center' style={{ color: 'var(--color-text-secondary)' }}>
                {team.p}
              </td>
              <td className='py-2 px-1 text-center' style={{ color: 'var(--color-text-secondary)' }}>
                {team.w}
              </td>
              <td className='py-2 px-1 text-center' style={{ color: 'var(--color-text-secondary)' }}>
                {team.d}
              </td>
              <td className='py-2 px-1 text-center' style={{ color: 'var(--color-text-secondary)' }}>
                {team.l}
              </td>
              <td
                className='py-2 px-1 text-center'
                style={{
                  color:
                    team.gd > 0 ? '#6dbf6d' : team.gd < 0 ? 'var(--color-accent-red)' : 'var(--color-text-secondary)',
                }}
              >
                {team.gd > 0 ? '+' : ''}
                {team.gd}
              </td>
              <td
                className='py-2 pr-3 text-center font-bold'
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
              >
                {team.pts}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Knockout match card ───────────────────────────────────────────────────────
// Score-first design: winner is auto-determined from score.
// Tiebreaker (penalties) only appears when scores are equal.

function KnockoutMatchCard({
  matchId,
  home,
  away,
  homeSlot,
  awaySlot,
  scoreA: propScoreA,
  scoreB: propScoreB,
  effectiveWinner,
  tiebreakerPick,
  onPick,
  onScoreChange,
  locked,
  matchDate,
  saving,
}) {
  const [scoreA, setScoreA] = useState(propScoreA ?? null);
  const [scoreB, setScoreB] = useState(propScoreB ?? null);
  const prevARef = useRef(propScoreA);
  const prevBRef = useRef(propScoreB);
  const prevHomeTla = useRef(home?.tla ?? null);
  const prevAwayTla = useRef(away?.tla ?? null);

  // When teams change, reset scores — stale scores from a previous lineup shouldn't persist
  const teamChanged = home?.tla !== prevHomeTla.current || away?.tla !== prevAwayTla.current;
  if (teamChanged) {
    prevHomeTla.current = home?.tla ?? null;
    prevAwayTla.current = away?.tla ?? null;
    prevARef.current = propScoreA ?? null;
    prevBRef.current = propScoreB ?? null;
    setScoreA(null);
    setScoreB(null);
  } else {
    // Sync from Firestore updates (only when teams haven't changed)
    if (propScoreA !== prevARef.current) { prevARef.current = propScoreA; setScoreA(propScoreA ?? null); }
    if (propScoreB !== prevBRef.current) { prevBRef.current = propScoreB; setScoreB(propScoreB ?? null); }
  }

  function handleScoreChange(side, val) {
    if (side === 'A') setScoreA(val);
    else setScoreB(val);
    onScoreChange(matchId, side, val);
  }

  const bothKnown = !!(home && away);
  const sA = scoreA !== null && scoreA !== undefined ? Number(scoreA) : null;
  const sB = scoreB !== null && scoreB !== undefined ? Number(scoreB) : null;
  const hasScores = sA !== null && sB !== null;
  const isTie = hasScores && sA === sB;

  // Compute winner locally for immediate UI feedback — no scores means no winner
  const localWinner = hasScores
    ? sA > sB ? home?.tla : sA < sB ? away?.tla : tiebreakerPick
    : null;
  const homeWins = localWinner === home?.tla;
  const awayWins = localWinner === away?.tla;

  function teamPanel(team, slotKey, isWinner) {
    if (!team) {
      return (
        <div
          className='flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg'
          style={{ border: '1px dashed var(--color-border)', opacity: 0.5 }}
        >
          <div className='text-base'>⚽</div>
          <span className='text-xs text-center px-1 leading-tight' style={{ color: 'var(--color-text-muted)' }}>
            {SLOT_LABEL[slotKey] || 'Por definir'}
          </span>
        </div>
      );
    }
    return (
      <div
        className='flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all'
        style={{
          background: isWinner ? 'rgba(212,168,67,0.12)' : 'transparent',
          border: isWinner ? '1px solid rgba(212,168,67,0.5)' : '1px solid transparent',
        }}
      >
        {team.flag ? (
          <img
            src={`https://flagcdn.com/w80/${team.flag}.png`}
            alt={team.name}
            className='w-10 h-7 object-cover rounded shadow'
          />
        ) : (
          <div
            className='w-10 h-7 rounded flex items-center justify-center text-xs font-bold'
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            {team.tla}
          </div>
        )}
        <span
          className='text-xs font-bold'
          style={{
            color: isWinner ? 'var(--color-gold)' : 'var(--color-text-primary)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {team.tla}
        </span>
      </div>
    );
  }

  return (
    <div
      className='rounded-xl p-3 mb-3'
      style={{
        background: 'var(--color-surface-card)',
        border: `1px solid ${effectiveWinner ? 'var(--color-pitch)' : 'var(--color-border)'}`,
      }}
    >
      {/* Date + saving */}
      {(matchDate || saving) && (
        <div className='flex items-center justify-between mb-2'>
          <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
            {formatDate(matchDate)}
          </span>
          {saving && <span className='text-xs' style={{ color: 'var(--color-gold)' }}>Guardando...</span>}
        </div>
      )}

      {/* Teams + score row */}
      <div className='flex items-center gap-2'>
        {teamPanel(home, homeSlot, homeWins)}

        <div className='flex flex-col items-center gap-1'>
          {bothKnown ? (
            <div className='flex items-center gap-1.5'>
              <ScoreInput value={scoreA} onChange={(v) => handleScoreChange('A', v)} disabled={locked} />
              <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>–</span>
              <ScoreInput value={scoreB} onChange={(v) => handleScoreChange('B', v)} disabled={locked} />
            </div>
          ) : (
            <span className='text-xs font-semibold' style={{ color: 'var(--color-text-muted)' }}>
              VS
            </span>
          )}
          {locked && (
            <span className='text-xs mt-0.5' style={{ color: 'var(--color-text-muted)' }}>
              🔒
            </span>
          )}
        </div>

        {teamPanel(away, awaySlot, awayWins)}
      </div>

      {/* Tiebreaker — only shown when scores are tied */}
      {isTie && bothKnown && (
        <div className='mt-3 pt-3' style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className='text-xs text-center mb-2' style={{ color: 'var(--color-text-secondary)' }}>
            Empate — ¿Quién avanza en penales?
          </p>
          <div className='flex gap-2'>
            {[{ team: home }, { team: away }].map(({ team }) => {
              const isPicked = tiebreakerPick === team.tla;
              return (
                <button
                  key={team.tla}
                  onClick={() => !locked && onPick(matchId, team.tla)}
                  disabled={locked}
                  className='flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all'
                  style={{
                    background: isPicked ? 'rgba(212,168,67,0.15)' : 'var(--color-surface)',
                    border: isPicked ? '2px solid var(--color-gold)' : '1px solid var(--color-border)',
                    cursor: locked ? 'default' : 'pointer',
                  }}
                >
                  {team.flag && (
                    <img src={`https://flagcdn.com/w80/${team.flag}.png`} className='w-6 h-4 object-cover rounded' />
                  )}
                  <span
                    className='text-xs font-bold'
                    style={{
                      color: isPicked ? 'var(--color-gold)' : 'var(--color-text-primary)',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {team.tla}
                  </span>
                  {isPicked && <span style={{ color: 'var(--color-gold)' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Awards section ────────────────────────────────────────────────────────────

function AwardsSection({ bracketData, champion, runnerUp, thirdPlace, onSave, locked }) {
  const [goldenBoot, setGoldenBoot] = useState(bracketData?.goldenBoot || '');
  const [goldenBall, setGoldenBall] = useState(bracketData?.goldenBall || '');
  const [prevBoot, setPrevBoot] = useState(bracketData?.goldenBoot);
  const [prevBall, setPrevBall] = useState(bracketData?.goldenBall);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync with Firestore updates during render (avoids setState-in-effect)
  if (bracketData?.goldenBoot !== prevBoot) {
    setPrevBoot(bracketData?.goldenBoot);
    setGoldenBoot(bracketData?.goldenBoot || '');
  }
  if (bracketData?.goldenBall !== prevBall) {
    setPrevBall(bracketData?.goldenBall);
    setGoldenBall(bracketData?.goldenBall || '');
  }

  async function handleSave() {
    setSaving(true);
    await onSave(goldenBoot.trim(), goldenBall.trim());
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className='space-y-4'>
      {/* Tournament outcome - auto-derived from bracket */}
      <div
        className='rounded-xl p-4'
        style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
      >
        <h3
          className='text-sm font-semibold mb-3'
          style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-display)' }}
        >
          Resultado del Torneo
        </h3>
        <div className='space-y-2'>
          {[
            { label: '🏆 Campeón', team: champion },
            { label: '🥈 Subcampeón', team: runnerUp },
            { label: '🥉 Tercer Puesto', team: thirdPlace },
          ].map(({ label, team }) => (
            <div
              key={label}
              className='flex items-center justify-between py-2 px-3 rounded-lg'
              style={{ background: 'var(--color-surface)' }}
            >
              <span className='text-sm' style={{ color: 'var(--color-text-secondary)' }}>
                {label}
              </span>
              {team ? (
                <div className='flex items-center gap-2'>
                  {team.flag && (
                    <img src={`https://flagcdn.com/w80/${team.flag}.png`} className='w-6 h-4 object-cover rounded' />
                  )}
                  <span
                    className='text-sm font-bold'
                    style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
                  >
                    {team.tla}
                  </span>
                </div>
              ) : (
                <span className='text-sm' style={{ color: 'var(--color-text-muted)' }}>
                  Por definir
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Individual awards */}
      <div
        className='rounded-xl p-4'
        style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
      >
        <div className='flex items-center gap-2 mb-3'>
          <h3
            className='text-sm font-semibold'
            style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-display)' }}
          >
            Premios Individuales
          </h3>
          {locked && <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>🔒</span>}
        </div>
        <div className='space-y-3'>
          {[
            { label: '⚽ Bota de Oro', key: 'boot', value: goldenBoot, setter: setGoldenBoot },
            { label: '⭐ Balón de Oro', key: 'ball', value: goldenBall, setter: setGoldenBall },
          ].map(({ label, key, value, setter }) => (
            <div key={key}>
              <label className='block text-xs mb-1' style={{ color: 'var(--color-text-secondary)' }}>
                {label}
              </label>
              <input
                type='text'
                value={value}
                onChange={(e) => setter(e.target.value)}
                disabled={locked}
                placeholder='Nombre del jugador'
                className='w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors'
                style={{
                  background: locked ? 'var(--color-surface)' : 'var(--color-surface)',
                  border: `1px solid ${locked ? 'var(--color-border)' : 'var(--color-pitch)'}`,
                  color: locked ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                }}
              />
            </div>
          ))}
        </div>

        {!locked && (
          <button
            onClick={handleSave}
            disabled={saving}
            className='w-full mt-4 py-2.5 rounded-xl text-sm font-semibold transition-all'
            style={{
              background: saved ? 'var(--color-pitch)' : 'var(--color-gold)',
              color: saved ? 'var(--color-text-primary)' : '#111318',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar Premios'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TournamentPage() {
  const { user } = useAuth();

  // Data
  const [matches, setMatches] = useState([]);
  const [groupPredictions, setGroupPredictions] = useState({});
  const [bracketData, setBracketData] = useState(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [section, setSection] = useState('grupos'); // 'grupos' | 'eliminatorias' | 'premios'
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [knockoutRound, setKnockoutRound] = useState('roundOf32');

  // Saving
  const debounceRef = useRef({});
  const [savingMatch, setSavingMatch] = useState({});

  // ─── Load matches ───────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('date', 'asc'));
    return onSnapshot(q, (snap) => {
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setMatches(data);
      setLoading(false);
    });
  }, []);

  // ─── Load group predictions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return subscribeToGroupPredictions(user.uid, setGroupPredictions);
  }, [user]);

  // ─── Load bracket data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return subscribeToBracket(user.uid, setBracketData);
  }, [user]);

  // ─── Derived data ───────────────────────────────────────────────────────────

  const groupMatches = matches.filter((m) => m.stage === 'group');

  // Tournament lock: locked if first group match has kicked off
  const firstMatchDate = groupMatches.reduce((earliest, m) => {
    const d = m.date?.toDate?.();
    if (!d) return earliest;
    return !earliest || d < earliest ? d : earliest;
  }, null);
  const tournamentLocked = firstMatchDate ? new Date() >= firstMatchDate : false;

  // Build team lookup (tla → team object)
  const teamsByTla = buildTeamLookup(groupMatches);

  // Knockout matches sorted by date per stage (for date display in bracket cards)
  const koByStage = {};
  for (const stage of ['roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'thirdPlace', 'final']) {
    koByStage[stage] = matches
      .filter((m) => m.stage === stage)
      .sort((a, b) => (a.date?.toDate?.() || 0) - (b.date?.toDate?.() || 0));
  }

  // Group standings (computed from predictions)
  const groupStandings = {};
  for (const group of GROUPS) {
    const gMatches = groupMatches.filter((m) => m.group === group);
    const teams = [
      ...new Map(
        gMatches.flatMap((m) => [
          [m.tlaA, { tla: m.tlaA, name: m.teamA, flag: m.flagA }],
          [m.tlaB, { tla: m.tlaB, name: m.teamB, flag: m.flagB }],
        ]),
      ).values(),
    ].filter((t) => t.tla);
    groupStandings[group] = computeGroupStandings(teams, gMatches, groupPredictions);
  }

  // Best 3rd place
  const best3rdTeams = getBest3rdPlaceTeams(groupStandings);
  const best3rdTlas = best3rdTeams.map((t) => t.tla);

  // Bracket picks — reconstruct from flat fields (pick_{matchId})
  const picks = {};
  if (bracketData) {
    for (const [key, val] of Object.entries(bracketData)) {
      if (key.startsWith('pick_')) picks[key.slice(5)] = val;
    }
  }

  // Knockout score predictions — flat field pattern: ks_{matchId}_{A|B}
  function ksScore(matchId, side) {
    return bracketData?.[`ks_${matchId}_${side}`] ?? null;
  }

  // ─── Effective picks ────────────────────────────────────────────────────────
  // Winner is auto-determined from score. Only ties need a manual tiebreaker.
  // Computed round-by-round so later rounds cascade correctly.

  function getEffectiveWinner(matchId, homeTla, awayTla) {
    const sA = ksScore(matchId, 'A');
    const sB = ksScore(matchId, 'B');
    if (sA !== null && sB !== null) {
      const nA = Number(sA),
        nB = Number(sB);
      if (nA > nB) return homeTla || null;
      if (nA < nB) return awayTla || null;
      return picks[matchId] || null; // tie → use stored tiebreaker
    }
    return null; // no score → no winner, don't cascade stale pick
  }

  const effectivePicks = {};

  // R32: teams from group standings
  for (const def of BRACKET_R32) {
    const teams = getR32Teams(def, groupStandings, best3rdTeams);
    effectivePicks[def.id] = getEffectiveWinner(def.id, teams.home?.tla, teams.away?.tla);
  }
  // R16
  for (const def of BRACKET_R16) {
    effectivePicks[def.id] = getEffectiveWinner(def.id, effectivePicks[def.homeFrom], effectivePicks[def.awayFrom]);
  }
  // QF
  for (const def of BRACKET_QF) {
    effectivePicks[def.id] = getEffectiveWinner(def.id, effectivePicks[def.homeFrom], effectivePicks[def.awayFrom]);
  }
  // SF
  for (const def of BRACKET_SF) {
    effectivePicks[def.id] = getEffectiveWinner(def.id, effectivePicks[def.homeFrom], effectivePicks[def.awayFrom]);
  }
  // Final
  effectivePicks['final'] = getEffectiveWinner('final', effectivePicks['sf_1'], effectivePicks['sf_2']);
  // 3rd place — losers of each SF
  {
    const sf1Home = effectivePicks[BRACKET_SF[0].homeFrom];
    const sf1Away = effectivePicks[BRACKET_SF[0].awayFrom];
    const sf1Win = effectivePicks['sf_1'];
    const sf1Lose = sf1Win === sf1Home ? sf1Away : sf1Win === sf1Away ? sf1Home : null;

    const sf2Home = effectivePicks[BRACKET_SF[1].homeFrom];
    const sf2Away = effectivePicks[BRACKET_SF[1].awayFrom];
    const sf2Win = effectivePicks['sf_2'];
    const sf2Lose = sf2Win === sf2Home ? sf2Away : sf2Win === sf2Away ? sf2Home : null;

    effectivePicks['3rd'] = getEffectiveWinner('3rd', sf1Lose, sf2Lose);
  }

  // Helper: get team object from effectivePicks
  function teamFromEP(matchId) {
    const tla = effectivePicks[matchId];
    return tla ? teamsByTla[tla] || { tla, name: tla, flag: null } : null;
  }

  // Progress counters
  const totalGroupMatches = groupMatches.length;
  const predictedGroupMatches = countPredictedMatches(groupMatches, groupPredictions);

  // ─── Save handlers ──────────────────────────────────────────────────────────

  function saveGroupMatchPrediction(matchId, scoreA, scoreB) {
    if (debounceRef.current[matchId]) clearTimeout(debounceRef.current[matchId]);
    // Require both scores before saving — don't write to Firestore with incomplete data
    // (writing null/null causes the Firestore listener to reset local state mid-edit)
    if (scoreA === null || scoreB === null) {
      return;
    }
    setSavingMatch((s) => ({ ...s, [matchId]: true }));
    debounceRef.current[matchId] = setTimeout(async () => {
      await saveGroupPrediction(user.uid, matchId, scoreA, scoreB);
      setSavingMatch((s) => ({ ...s, [matchId]: false }));
    }, 700);
  }

  async function handleBracketPick(matchId, winnerTla) {
    await saveBracketPick(user.uid, matchId, winnerTla);
  }

  function handleKnockoutScoreChange(matchId, side, val) {
    const key = `kscore_${matchId}_${side}`;
    if (debounceRef.current[key]) clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(async () => {
      setSavingMatch((s) => ({ ...s, [matchId]: true }));
      await saveKnockoutScore(user.uid, matchId, side, val);
      setSavingMatch((s) => ({ ...s, [matchId]: false }));
    }, 700);
  }

  async function handleSaveAwards(goldenBoot, goldenBall) {
    await saveAwards(user.uid, goldenBoot, goldenBall);
  }

  // ─── Computed bracket teams (using effectivePicks for cascade) ──────────────

  function getKOTeams(def) {
    return {
      home: teamFromEP(def.homeFrom),
      away: teamFromEP(def.awayFrom),
    };
  }

  // 3rd place: losers of SF
  function get3rdTeams() {
    const sf1Home = effectivePicks[BRACKET_SF[0].homeFrom];
    const sf1Away = effectivePicks[BRACKET_SF[0].awayFrom];
    const sf1Win = effectivePicks['sf_1'];
    const sf1Lose = sf1Win === sf1Home ? sf1Away : sf1Win === sf1Away ? sf1Home : null;

    const sf2Home = effectivePicks[BRACKET_SF[1].homeFrom];
    const sf2Away = effectivePicks[BRACKET_SF[1].awayFrom];
    const sf2Win = effectivePicks['sf_2'];
    const sf2Lose = sf2Win === sf2Home ? sf2Away : sf2Win === sf2Away ? sf2Home : null;

    return {
      home: sf1Lose ? teamsByTla[sf1Lose] || { tla: sf1Lose, name: sf1Lose, flag: null } : null,
      away: sf2Lose ? teamsByTla[sf2Lose] || { tla: sf2Lose, name: sf2Lose, flag: null } : null,
    };
  }

  // Tournament outcome
  const championTla = effectivePicks['final'];
  const finalHomeTla = effectivePicks['sf_1'];
  const finalAwayTla = effectivePicks['sf_2'];
  const runnerUpTla = championTla ? (championTla === finalHomeTla ? finalAwayTla : finalHomeTla) : null;
  const thirdTla = effectivePicks['3rd'];

  // ─── Sections ───────────────────────────────────────────────────────────────

  const SECTIONS = [
    { key: 'grupos', label: 'Grupos' },
    { key: 'eliminatorias', label: 'Eliminatorias' },
    { key: 'premios', label: 'Premios' },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className='max-w-lg mx-auto px-4 pt-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className='rounded-xl p-4 mb-3 animate-pulse'
            style={{ background: 'var(--color-surface-card)', height: '80px' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className='max-w-lg mx-auto px-4 pt-4 pb-28'>
      {/* Header */}
      <div className='flex items-baseline justify-between mb-4'>
        <h1
          className='text-xl font-bold'
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
        >
          Pronóstico
        </h1>
        <div className='flex items-center gap-2'>
          {tournamentLocked && (
            <span
              className='text-xs px-2 py-1 rounded-full'
              style={{ background: 'rgba(231,76,60,0.15)', color: 'var(--color-accent-red)' }}
            >
              🔒 Cerrado
            </span>
          )}
          <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
            {predictedGroupMatches}/{totalGroupMatches} partidos
          </span>
        </div>
      </div>

      {/* Section tabs */}
      <div className='flex gap-2 mb-5'>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className='flex-1 py-1.5 rounded-full text-xs font-medium transition-colors'
            style={{
              background: section === s.key ? 'var(--color-gold)' : 'var(--color-surface-card)',
              color: section === s.key ? '#111318' : 'var(--color-text-secondary)',
              border: section === s.key ? 'none' : '1px solid var(--color-border)',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── GRUPOS section ── */}
      {section === 'grupos' && (
        <div>
          {/* Group selector */}
          <div className='flex gap-2 mb-4 flex-wrap'>
            {GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                className='w-8 h-8 rounded-lg text-xs font-bold transition-colors'
                style={{
                  background: selectedGroup === g ? 'var(--color-gold)' : 'var(--color-surface-card)',
                  color: selectedGroup === g ? '#111318' : 'var(--color-text-secondary)',
                  border: selectedGroup === g ? 'none' : '1px solid var(--color-border)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Matches for selected group */}
          <h2
            className='text-xs font-semibold mb-2 uppercase tracking-wider'
            style={{ color: 'var(--color-text-muted)' }}
          >
            Grupo {selectedGroup} — Partidos
          </h2>
          {groupMatches
            .filter((m) => m.group === selectedGroup)
            .map((m) => (
              <GroupMatchCard
                key={m.id}
                match={m}
                prediction={groupPredictions[m.id] || null}
                onSave={saveGroupMatchPrediction}
                saving={savingMatch[m.id] || false}
                locked={tournamentLocked}
              />
            ))}

          {/* Standings */}
          <h2
            className='text-xs font-semibold mt-4 mb-2 uppercase tracking-wider'
            style={{ color: 'var(--color-text-muted)' }}
          >
            Posiciones Grupo {selectedGroup}
          </h2>
          <StandingsTable standings={groupStandings[selectedGroup] || []} best3rdTlas={best3rdTlas} />

          {/* Legend */}
          <div className='mt-3 flex gap-4 text-xs' style={{ color: 'var(--color-text-muted)' }}>
            <span>🥇 Clasifica (1°)</span>
            <span>🥈 Clasifica (2°)</span>
            <span style={{ color: '#60a5fa' }}>✦ Mejor 3°</span>
          </div>

          {/* Best 3rd summary */}
          {best3rdTeams.length > 0 && (
            <div
              className='mt-4 rounded-xl p-3'
              style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
            >
              <h3 className='text-xs font-semibold mb-2' style={{ color: 'var(--color-text-muted)' }}>
                Mejores Terceros ({best3rdTeams.length}/8 clasificados)
              </h3>
              <div className='space-y-1'>
                {best3rdTeams.map((t, i) => (
                  <div key={t.tla} className='flex items-center gap-2 text-xs'>
                    <span style={{ color: 'var(--color-text-muted)', width: '16px' }}>{i + 1}.</span>
                    {t.flag && (
                      <img src={`https://flagcdn.com/w80/${t.flag}.png`} className='w-5 h-3.5 object-cover rounded' />
                    )}
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{t.tla}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>(Grupo {t.fromGroup})</span>
                    <span
                      className='ml-auto font-bold'
                      style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
                    >
                      {t.pts} pts
                    </span>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 8 - best3rdTeams.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
                    {best3rdTeams.length + i + 1}. — (ingresa más resultados)
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ELIMINATORIAS section ── */}
      {section === 'eliminatorias' && (
        <div>
          {/* Round selector */}
          <div className='flex gap-2 mb-4 flex-wrap'>
            {KNOCKOUT_ROUNDS.map((r) => (
              <button
                key={r.key}
                onClick={() => setKnockoutRound(r.key)}
                className='py-0.75 px-3 rounded-full text-xs font-medium transition-colors'
                style={{
                  background: knockoutRound === r.key ? 'var(--color-gold)' : 'var(--color-surface-card)',
                  color: knockoutRound === r.key ? '#111318' : 'var(--color-text-secondary)',
                  border: knockoutRound === r.key ? 'none' : '1px solid var(--color-border)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* R32 */}
          {knockoutRound === 'roundOf32' && (
            <>
              {predictedGroupMatches < totalGroupMatches && (
                <div
                  className='mb-3 rounded-lg p-3 text-xs text-center'
                  style={{
                    background: 'rgba(212,168,67,0.08)',
                    border: '1px solid rgba(212,168,67,0.3)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Completa todos los partidos de grupos para ver los equipos clasificados. ({predictedGroupMatches}/
                  {totalGroupMatches} predichos)
                </div>
              )}
              {BRACKET_R32.map((def, idx) => {
                const teams = getR32Teams(def, groupStandings, best3rdTeams);
                return (
                  <KnockoutMatchCard
                    key={def.id}
                    matchId={def.id}
                    home={teams.home}
                    homeSlot={def.home}
                    away={teams.away}
                    awaySlot={def.away}
                    scoreA={ksScore(def.id, 'A')}
                    scoreB={ksScore(def.id, 'B')}
                    effectiveWinner={effectivePicks[def.id]}
                    tiebreakerPick={picks[def.id]}
                    onPick={handleBracketPick}
                    onScoreChange={handleKnockoutScoreChange}
                    locked={tournamentLocked}
                    matchDate={koByStage.roundOf32[idx]?.date}
                    saving={savingMatch[def.id] || false}
                  />
                );
              })}
            </>
          )}

          {/* R16 */}
          {knockoutRound === 'roundOf16' && (
            <>
              {!isRoundComplete(BRACKET_R32, effectivePicks) && (
                <div
                  className='mb-3 rounded-lg p-3 text-xs text-center'
                  style={{
                    background: 'rgba(212,168,67,0.08)',
                    border: '1px solid rgba(212,168,67,0.3)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Completa la Ronda de 32 para ver los equipos en Octavos.
                </div>
              )}
              {BRACKET_R16.map((def, idx) => {
                const { home, away } = getKOTeams(def);
                return (
                  <KnockoutMatchCard
                    key={def.id}
                    matchId={def.id}
                    home={home}
                    homeSlot={null}
                    away={away}
                    awaySlot={null}
                    scoreA={ksScore(def.id, 'A')}
                    scoreB={ksScore(def.id, 'B')}
                    effectiveWinner={effectivePicks[def.id]}
                    tiebreakerPick={picks[def.id]}
                    onPick={handleBracketPick}
                    onScoreChange={handleKnockoutScoreChange}
                    locked={tournamentLocked}
                    matchDate={koByStage.roundOf16[idx]?.date}
                    saving={savingMatch[def.id] || false}
                  />
                );
              })}
            </>
          )}

          {/* Quarterfinals */}
          {knockoutRound === 'quarterfinals' && (
            <>
              {!isRoundComplete(BRACKET_R16, effectivePicks) && (
                <div
                  className='mb-3 rounded-lg p-3 text-xs text-center'
                  style={{
                    background: 'rgba(212,168,67,0.08)',
                    border: '1px solid rgba(212,168,67,0.3)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Completa Octavos para ver los Cuartos de Final.
                </div>
              )}
              {BRACKET_QF.map((def, idx) => {
                const { home, away } = getKOTeams(def);
                return (
                  <KnockoutMatchCard
                    key={def.id}
                    matchId={def.id}
                    home={home}
                    homeSlot={null}
                    away={away}
                    awaySlot={null}
                    scoreA={ksScore(def.id, 'A')}
                    scoreB={ksScore(def.id, 'B')}
                    effectiveWinner={effectivePicks[def.id]}
                    tiebreakerPick={picks[def.id]}
                    onPick={handleBracketPick}
                    onScoreChange={handleKnockoutScoreChange}
                    locked={tournamentLocked}
                    matchDate={koByStage.quarterfinals[idx]?.date}
                    saving={savingMatch[def.id] || false}
                  />
                );
              })}
            </>
          )}

          {/* Semifinals */}
          {knockoutRound === 'semifinals' && (
            <>
              {!isRoundComplete(BRACKET_QF, effectivePicks) && (
                <div
                  className='mb-3 rounded-lg p-3 text-xs text-center'
                  style={{
                    background: 'rgba(212,168,67,0.08)',
                    border: '1px solid rgba(212,168,67,0.3)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Completa Cuartos para ver las Semifinales.
                </div>
              )}
              {BRACKET_SF.map((def, idx) => {
                const { home, away } = getKOTeams(def);
                return (
                  <KnockoutMatchCard
                    key={def.id}
                    matchId={def.id}
                    home={home}
                    homeSlot={null}
                    away={away}
                    awaySlot={null}
                    scoreA={ksScore(def.id, 'A')}
                    scoreB={ksScore(def.id, 'B')}
                    effectiveWinner={effectivePicks[def.id]}
                    tiebreakerPick={picks[def.id]}
                    onPick={handleBracketPick}
                    onScoreChange={handleKnockoutScoreChange}
                    locked={tournamentLocked}
                    matchDate={koByStage.semifinals[idx]?.date}
                    saving={savingMatch[def.id] || false}
                  />
                );
              })}
            </>
          )}

          {/* 3rd place */}
          {knockoutRound === 'thirdPlace' &&
            (() => {
              const { home, away } = get3rdTeams();
              return (
                <>
                  {!isRoundComplete(BRACKET_SF, effectivePicks) && (
                    <div
                      className='mb-3 rounded-lg p-3 text-xs text-center'
                      style={{
                        background: 'rgba(212,168,67,0.08)',
                        border: '1px solid rgba(212,168,67,0.3)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Completa las Semifinales para ver el Tercer Puesto.
                    </div>
                  )}
                  <KnockoutMatchCard
                    matchId='3rd'
                    home={home}
                    homeSlot={null}
                    away={away}
                    awaySlot={null}
                    scoreA={ksScore('3rd', 'A')}
                    scoreB={ksScore('3rd', 'B')}
                    effectiveWinner={effectivePicks['3rd']}
                    tiebreakerPick={picks['3rd']}
                    onPick={handleBracketPick}
                    onScoreChange={handleKnockoutScoreChange}
                    locked={tournamentLocked}
                    matchDate={koByStage.thirdPlace[0]?.date}
                    saving={savingMatch['3rd'] || false}
                  />
                </>
              );
            })()}

          {/* Final */}
          {knockoutRound === 'final' &&
            (() => {
              const homeTla = effectivePicks['sf_1'];
              const awayTla = effectivePicks['sf_2'];
              const home = homeTla ? teamsByTla[homeTla] || { tla: homeTla, name: homeTla, flag: null } : null;
              const away = awayTla ? teamsByTla[awayTla] || { tla: awayTla, name: awayTla, flag: null } : null;
              return (
                <>
                  {!isRoundComplete(BRACKET_SF, effectivePicks) && (
                    <div
                      className='mb-3 rounded-lg p-3 text-xs text-center'
                      style={{
                        background: 'rgba(212,168,67,0.08)',
                        border: '1px solid rgba(212,168,67,0.3)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Completa las Semifinales para ver la Final.
                    </div>
                  )}
                  <KnockoutMatchCard
                    matchId='final'
                    home={home}
                    homeSlot={null}
                    away={away}
                    awaySlot={null}
                    scoreA={ksScore('final', 'A')}
                    scoreB={ksScore('final', 'B')}
                    effectiveWinner={effectivePicks['final']}
                    tiebreakerPick={picks['final']}
                    onPick={handleBracketPick}
                    onScoreChange={handleKnockoutScoreChange}
                    locked={tournamentLocked}
                    matchDate={koByStage.final[0]?.date}
                    saving={savingMatch['final'] || false}
                  />
                </>
              );
            })()}
        </div>
      )}

      {/* ── PREMIOS section ── */}
      {section === 'premios' && (
        <AwardsSection
          bracketData={bracketData}
          champion={championTla ? teamsByTla[championTla] || { tla: championTla, flag: null } : null}
          runnerUp={runnerUpTla ? teamsByTla[runnerUpTla] || { tla: runnerUpTla, flag: null } : null}
          thirdPlace={thirdTla ? teamsByTla[thirdTla] || { tla: thirdTla, flag: null } : null}
          onSave={handleSaveAwards}
          locked={tournamentLocked}
        />
      )}
    </div>
  );
}

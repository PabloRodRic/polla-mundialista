import { useEffect, useState, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  getDocs,
  // where,
  deleteField,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  syncMatchesFromAPI,
  onSyncStatusChange,
  stopAutoSync,
  startAutoSync,
  calculatePointsForMatch,
  calculateLivePoints,
  resetPointsForMatch,
  calculateAwardPoints,
  recalculateAllUsers,
  getSyncStatus,
} from '../services/matchSync';
import { hasApiKey } from '../services/footballApi';
import { computeGroupStandings, getBest3rdPlaceTeams } from '../utils/standingsCalculator';
import { BRACKET_R32, getR32Teams, SLOT_LABEL } from '../utils/bracketUtils';
import { tlaLabel } from '../utils/teamLabels';
import { TIME_FILTERS, DEFAULT_TIME_FILTER, filterMatchesByTime } from '../utils/matchFilters';
import { fetchMatchPredictionStatus } from '../services/preTournamentService';
import PredictionStatusModal from '../components/PredictionStatusModal';

// Collapsible card wrapper — keeps the admin top section compact. Collapsed by default.
function Accordion({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className='rounded-xl mb-4'
      style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
    >
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='w-full flex items-center justify-between px-4 py-3'
      >
        <h2 className='text-xs font-bold uppercase tracking-wider' style={{ color: 'var(--color-gold)' }}>
          {title}
        </h2>
        <svg
          className='w-4 h-4 transition-transform shrink-0'
          style={{ color: 'var(--color-text-muted)', transform: open ? 'rotate(180deg)' : 'none' }}
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
        >
          <path d='M6 9l6 6 6-6' strokeLinecap='round' strokeLinejoin='round' />
        </svg>
      </button>
      {open && <div className='px-4 pb-4'>{children}</div>}
    </div>
  );
}

function StatusCard({ syncStatus, autoPaused, onToggleAuto }) {
  return (
    <Accordion title='Estado del Sync'>
      <div className='space-y-2 text-sm mb-4'>
        <div className='flex justify-between'>
          <span style={{ color: 'var(--color-text-muted)' }}>API Key</span>
          <span style={{ color: hasApiKey() ? '#4ade80' : 'var(--color-accent-red)' }}>
            {hasApiKey() ? '✓ Configurada' : '✗ No configurada'}
          </span>
        </div>
        <div className='flex justify-between'>
          <span style={{ color: 'var(--color-text-muted)' }}>Último sync</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleTimeString('es') : 'Nunca'}
          </span>
        </div>
        <div className='flex justify-between'>
          <span style={{ color: 'var(--color-text-muted)' }}>Partidos sincronizados</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>{syncStatus.matchCount || 0}</span>
        </div>
        <div className='flex justify-between'>
          <span style={{ color: 'var(--color-text-muted)' }}>Auto-sync</span>
          <span style={{ color: autoPaused ? 'var(--color-accent-red)' : '#4ade80' }}>
            {autoPaused ? 'Pausado' : 'Activo'}
          </span>
        </div>
        {syncStatus.error && (
          <p
            className='text-xs mt-2 p-2 rounded'
            style={{ background: 'rgba(231,76,60,0.1)', color: 'var(--color-accent-red)' }}
          >
            Error: {syncStatus.error}
          </p>
        )}
      </div>

      <div className='flex gap-2'>
        <button
          onClick={onToggleAuto}
          className='flex-1 py-2 rounded-lg text-xs font-medium transition-colors'
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          {autoPaused ? '▶ Reanudar Auto-sync' : '⏸ Pausar Auto-sync'}
        </button>
      </div>
    </Accordion>
  );
}

// People icon — opens the per-match prediction status (who has/hasn't submitted).
function StatusIconButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label='Ver estado de predicciones'
      title='Ver estado de predicciones'
      className='flex items-center justify-center w-7 h-7 rounded-full transition-colors shrink-0'
      style={{ color: 'var(--color-text-muted)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <path
          d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    </button>
  );
}

function MatchOverrideCard({ match, onSave, onShowStatus }) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? '');
  const [scoreB, setScoreB] = useState(match.scoreB ?? '');
  const [status, setStatus] = useState(match.status);
  const [winner, setWinner] = useState(match.winner ?? 'auto');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Sync local state when Firestore updates the match (e.g. after clearing an override)
  useEffect(() => {
    setScoreA(match.scoreA ?? '');
    setScoreB(match.scoreB ?? '');
    setStatus(match.status);
    setWinner(match.winner ?? 'auto');
  }, [match.scoreA, match.scoreB, match.status, match.winner]);

  // Auto-switch to finished when both scores are entered
  function handleScoreChange(side, val) {
    if (side === 'A') setScoreA(val);
    else setScoreB(val);
    const otherVal = side === 'A' ? scoreB : scoreA;
    if (val !== '' && otherVal !== '' && status !== 'live' && status !== 'finished') {
      setStatus('finished');
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const matchRef = doc(db, 'matches', match.id);
      const updates = {
        status,
        lastSyncedAt: Timestamp.now(),
        pointsCalculated: false,
        adminOverride: true,
        adminOverriddenAt: Timestamp.now(),
      };
      if (scoreA !== '' && scoreB !== '') {
        updates.scoreA = Number(scoreA);
        updates.scoreB = Number(scoreB);
      }
      // Store penalty winner when scores are level; 'auto' means derive from score
      updates.winner = winner !== 'auto' ? winner : null;
      await updateDoc(matchRef, updates);

      if (status === 'finished' && scoreA !== '' && scoreB !== '') {
        await calculatePointsForMatch(match.id, Number(scoreA), Number(scoreB), match.stage);
      } else if (status === 'live' && scoreA !== '' && scoreB !== '') {
        await calculateLivePoints(
          match.id,
          Number(scoreA),
          Number(scoreB),
          match.stage,
          match.tlaA,
          match.tlaB,
          winner !== 'auto' ? winner : null,
        );
      }
      onSave?.();
    } catch (err) {
      console.error('Error saving override:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearOverride() {
    setClearing(true);
    try {
      // First reset points across all prediction collections and zero out the match scores
      await resetPointsForMatch(match.id);
      // Then remove the override flags
      const matchRef = doc(db, 'matches', match.id);
      await updateDoc(matchRef, {
        adminOverride: deleteField(),
        adminOverriddenAt: deleteField(),
      });
      onSave?.('Ajuste manual borrado');
    } catch (err) {
      console.error('Error clearing override:', err);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div
      className='rounded-xl p-4 mb-3'
      style={{
        background: 'var(--color-surface-card)',
        border: `1px solid ${match.adminOverride ? 'var(--color-gold)' : 'var(--color-border)'}`,
      }}
    >
      <div className='flex items-start justify-between mb-3 gap-2'>
        <div>
          <div className='flex items-center gap-2'>
            <p
              className='text-sm font-semibold flex items-center gap-1.5'
              style={{ color: 'var(--color-text-primary)' }}
            >
              {match.flagA && (
                <img src={`https://flagcdn.com/w40/${match.flagA}.png`} className='w-5 h-3.5 object-cover rounded' />
              )}
              {tlaLabel(match.tlaA) || match.teamA}
              <span style={{ color: 'var(--color-text-muted)' }}>vs</span>
              {match.flagB && (
                <img src={`https://flagcdn.com/w40/${match.flagB}.png`} className='w-5 h-3.5 object-cover rounded' />
              )}
              {tlaLabel(match.tlaB) || match.teamB}
            </p>
            {match.adminOverride && (
              <span
                className='text-xs px-1.5 py-0.5 rounded font-medium'
                style={{ background: 'rgba(212,168,67,0.15)', color: 'var(--color-gold)' }}
              >
                ajuste manual
              </span>
            )}
          </div>
          <p className='text-xs mt-0.5' style={{ color: 'var(--color-text-muted)' }}>
            {match.stage === 'group' ? `Grupo ${match.group} · J${match.matchday}` : match.stage}
          </p>
        </div>
        <div className='flex items-center gap-1.5 shrink-0'>
          {/* Match-by-match prediction status — only the in-tournament "Predicciones"
              tab (knockout matches) uses per-match predictions. */}
          {match.stage !== 'group' && <StatusIconButton onClick={() => onShowStatus(match)} />}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className='text-xs rounded-lg px-2 py-1 border-0 outline-none'
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <option value='upcoming'>Próximo</option>
            <option value='live'>En Vivo</option>
            <option value='finished'>Finalizado</option>
            <option value='cancelled'>Cancelado</option>
          </select>
        </div>
      </div>

      <div className='flex items-center gap-3 mb-3'>
        <input
          type='number'
          min='0'
          max='99'
          placeholder='0'
          value={scoreA}
          onChange={(e) => handleScoreChange('A', e.target.value)}
          className='w-16 h-10 text-center text-lg font-bold rounded-lg border-0 outline-none'
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <span style={{ color: 'var(--color-text-muted)' }}>–</span>
        <input
          type='number'
          min='0'
          max='99'
          placeholder='0'
          value={scoreB}
          onChange={(e) => handleScoreChange('B', e.target.value)}
          className='w-16 h-10 text-center text-lg font-bold rounded-lg border-0 outline-none'
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
      </div>

      {/* Penalty winner — only shown when knockout match ends tied (scores equal) */}
      {status === 'finished' && match.stage !== 'group' && scoreA !== '' && scoreB !== '' && Number(scoreA) === Number(scoreB) && (
        <div className='flex items-center gap-2 mb-3'>
          <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
            Ganador (penales):
          </span>
          <select
            value={winner}
            onChange={(e) => setWinner(e.target.value)}
            className='text-xs rounded-lg px-2 py-1 border-0 outline-none'
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <option value='auto'>Auto (por marcador)</option>
            <option value='home'>{tlaLabel(match.tlaA) || match.teamA} gana</option>
            <option value='away'>{tlaLabel(match.tlaB) || match.teamB} gana</option>
          </select>
        </div>
      )}

      <div className='flex gap-2'>
        <button
          onClick={handleSave}
          disabled={saving || clearing}
          className='flex-1 py-2 rounded-lg text-sm font-semibold transition-opacity'
          style={{
            background: 'var(--color-pitch)',
            color: '#ffffff',
            opacity: saving || clearing ? 0.6 : 1,
          }}
        >
          {saving ? 'Guardando...' : 'Guardar resultado'}
        </button>
        {match.adminOverride && (
          <button
            onClick={handleClearOverride}
            disabled={saving || clearing}
            className='px-3 py-2 rounded-lg text-xs font-medium transition-opacity'
            style={{
              background: 'rgba(231,76,60,0.12)',
              color: 'var(--color-accent-red)',
              border: '1px solid var(--color-accent-red)',
              opacity: saving || clearing ? 0.6 : 1,
            }}
          >
            {clearing ? '...' : 'Borrar ajuste'}
          </button>
        )}
      </div>
    </div>
  );
}

function AwardsCard({ onSave }) {
  const [goldenBoot, setGoldenBoot] = useState('');
  const [goldenBall, setGoldenBall] = useState('');
  const [babyGender, setBabyGender] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [hasStored, setHasStored] = useState(false);

  // Prefill with the current official results so a partial save doesn't wipe the rest
  useEffect(() => {
    getDoc(doc(db, 'config', 'tournamentResults')).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setGoldenBoot(data.goldenBoot || '');
      setGoldenBall(data.goldenBall || '');
      setBabyGender(data.babyGender || '');
      setHasStored(!!(data.goldenBoot || data.goldenBall || data.babyGender));
    });
  }, []);

  const nothingSet = !goldenBoot.trim() && !goldenBall.trim() && !babyGender;

  async function handleSave() {
    if (nothingSet) return;
    setSaving(true);
    try {
      await calculateAwardPoints(goldenBoot.trim(), goldenBall.trim(), babyGender);
      setHasStored(true);
      onSave?.('Premios individuales guardados');
    } catch (err) {
      console.error('Error saving awards:', err);
      onSave?.('Error al guardar premios', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Clears the official awards (boot/ball/baby) and zeroes out their points for everyone.
  async function handleClear() {
    setClearing(true);
    try {
      await calculateAwardPoints('', '', '');
      setGoldenBoot('');
      setGoldenBall('');
      setBabyGender('');
      setHasStored(false);
      onSave?.('Premios borrados');
    } catch (err) {
      console.error('Error clearing awards:', err);
      onSave?.('Error al borrar premios', 'error');
    } finally {
      setClearing(false);
    }
  }

  return (
    <Accordion title='Premios Individuales'>
      <p className='text-xs mb-3' style={{ color: 'var(--color-text-muted)' }}>
        Ingresar ganadores reales para calcular puntos. Ejecutar una vez que FIFA los anuncie.
      </p>
      <div className='space-y-3 mb-4'>
        <div>
          <label className='block text-xs mb-2' style={{ color: 'var(--color-text-secondary)' }}>
            👶🏻 El bebé es (Rodríguez Terán)
          </label>
          <div className='grid grid-cols-2 gap-2'>
            {[
              { value: 'girl', label: '👧🏻 Niña', color: '#e84393' },
              { value: 'boy', label: '👦🏻 Niño', color: 'var(--color-accent-blue)' },
            ].map(({ value, label, color }) => {
              const active = babyGender === value;
              return (
                <button
                  key={value}
                  type='button'
                  onClick={() => setBabyGender(active ? '' : value)}
                  className='py-2.5 rounded-lg text-sm font-semibold transition-all'
                  style={{
                    background: active ? color : 'var(--color-surface)',
                    border: `1px solid ${active ? color : 'var(--color-border)'}`,
                    color: active ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className='block text-xs mb-1' style={{ color: 'var(--color-text-secondary)' }}>
            Bota de Oro (nombre del jugador)
          </label>
          <input
            type='text'
            placeholder='Ej: Lionel Messi'
            value={goldenBoot}
            onChange={(e) => setGoldenBoot(e.target.value)}
            className='w-full px-3 py-2 rounded-lg text-sm border-0 outline-none'
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
        <div>
          <label className='block text-xs mb-1' style={{ color: 'var(--color-text-secondary)' }}>
            Balón de Oro (nombre del jugador)
          </label>
          <input
            type='text'
            placeholder='Ej: Kylian Mbappé'
            value={goldenBall}
            onChange={(e) => setGoldenBall(e.target.value)}
            className='w-full px-3 py-2 rounded-lg text-sm border-0 outline-none'
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving || clearing || nothingSet}
        className='w-full py-2 rounded-lg text-sm font-semibold transition-opacity'
        style={{
          background: 'var(--color-gold)',
          color: '#111318',
          opacity: saving || clearing || nothingSet ? 0.5 : 1,
        }}
      >
        {saving ? 'Guardando...' : 'Guardar y calcular puntos'}
      </button>
      {(hasStored || !nothingSet) && (
        <button
          onClick={handleClear}
          disabled={saving || clearing}
          className='w-full mt-2 py-2 rounded-lg text-xs font-medium transition-opacity'
          style={{
            background: 'transparent',
            color: 'var(--color-accent-red)',
            border: '1px solid var(--color-border)',
            opacity: saving || clearing ? 0.5 : 1,
          }}
        >
          {clearing ? 'Borrando...' : 'Borrar premios (Bota, Balón y bebé)'}
        </button>
      )}
    </Accordion>
  );
}


function TeamChip({ tla, flag, label = 'TBD' }) {
  if (!tla) return <span className='text-xs' style={{ color: 'var(--color-text-muted)' }}>{label}</span>;
  return (
    <span className='flex items-center gap-1'>
      {flag && <img src={`https://flagcdn.com/w20/${flag}.png`} className='w-4 h-3 object-cover rounded-xs shrink-0' alt='' />}
      <span className='text-xs font-bold' style={{ color: 'var(--color-text-primary)' }}>{tla}</span>
    </span>
  );
}

function BracketTeamsCard({ matches, onSave }) {
  const [applying, setApplying] = useState({});
  const [clearing, setClearing] = useState({});

  // Compute actual standings from real match scores
  const { groupStandings, best3rd } = useMemo(() => {
    const GROUPS = 'ABCDEFGHIJKL'.split('');
    const byGroup = {};
    for (const g of GROUPS) byGroup[g] = [];
    for (const m of matches) {
      if (m.stage === 'group' && m.group) byGroup[m.group].push(m);
    }
    const gs = {};
    for (const g of GROUPS) {
      const gm = byGroup[g];
      if (!gm.length) continue;
      const teamMap = {};
      for (const m of gm) {
        teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA, crest: m.crestA };
        teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB, crest: m.crestB };
      }
      const rp = {};
      for (const m of gm) {
        if (m.scoreA != null && m.scoreB != null)
          rp[m.id] = { predictedScoreA: m.scoreA, predictedScoreB: m.scoreB };
      }
      gs[g] = computeGroupStandings(Object.values(teamMap), gm, rp);
    }
    return { groupStandings: gs, best3rd: getBest3rdPlaceTeams(gs) };
  }, [matches]);

  // R32 Firestore docs sorted by date
  const r32Docs = useMemo(() =>
    matches
      .filter(m => m.stage === 'roundOf32')
      .sort((a, b) => (a.date?.toDate?.() || 0) - (b.date?.toDate?.() || 0)),
    [matches]);

  // Map each bracket slot ID → its Firestore doc.
  // First match by computed home team TLA (reliable for slots where API already has a team),
  // then fall back to date-sort position for TBD slots.
  const slotToDoc = useMemo(() => {
    const result = {};
    const usedIds = new Set();

    // Pass 1: anchor by known home TLA
    for (const slotDef of BRACKET_R32) {
      const { home } = getR32Teams(slotDef, groupStandings, best3rd);
      if (!home?.tla) continue;
      const found = r32Docs.find(d => !usedIds.has(d.id) && (d.tlaA === home.tla || d.tlaB === home.tla));
      if (found) { result[slotDef.id] = found; usedIds.add(found.id); }
    }

    // Pass 2: date-order fallback for remaining TBD slots
    const unmatched = r32Docs.filter(d => !usedIds.has(d.id));
    let ui = 0;
    for (const slotDef of BRACKET_R32) {
      if (!result[slotDef.id]) result[slotDef.id] = unmatched[ui++];
    }
    return result;
  }, [r32Docs, groupStandings, best3rd]);

  async function handleApply(slotDef) {
    const { home, away } = getR32Teams(slotDef, groupStandings, best3rd);
    if (!home || !away) return;
    const matchDoc = slotToDoc[slotDef.id];
    if (!matchDoc) return;
    setApplying(p => ({ ...p, [slotDef.id]: true }));
    try {
      await updateDoc(doc(db, 'matches', matchDoc.id), {
        // Snapshot the current API values so the admin card can still show them
        apiSnapshotTlaA: matchDoc.tlaA || null,
        apiSnapshotFlagA: matchDoc.flagA || null,
        apiSnapshotTlaB: matchDoc.tlaB || null,
        apiSnapshotFlagB: matchDoc.flagB || null,
        // Override the live fields used by the bracket/llaves tab
        teamA: home.name || '', tlaA: home.tla || '',
        flagA: home.flag || null, crestA: home.crest || null,
        teamB: away.name || '', tlaB: away.tla || '',
        flagB: away.flag || null, crestB: away.crest || null,
        adminTeamOverride: true,
      });
      onSave?.('Equipos aplicados');
    } catch (e) {
      onSave?.('Error: ' + e.message, 'error');
    } finally {
      setApplying(p => ({ ...p, [slotDef.id]: false }));
    }
  }

  async function handleClear(slotDef) {
    const matchDoc = slotToDoc[slotDef.id];
    if (!matchDoc) return;
    setClearing(p => ({ ...p, [slotDef.id]: true }));
    try {
      await updateDoc(doc(db, 'matches', matchDoc.id), {
        teamA: deleteField(), tlaA: deleteField(),
        flagA: deleteField(), crestA: deleteField(),
        teamB: deleteField(), tlaB: deleteField(),
        flagB: deleteField(), crestB: deleteField(),
        adminTeamOverride: deleteField(),
        apiSnapshotTlaA: deleteField(), apiSnapshotFlagA: deleteField(),
        apiSnapshotTlaB: deleteField(), apiSnapshotFlagB: deleteField(),
      });
      onSave?.('Override borrado — la API llenará los datos en el próximo sync');
    } catch (e) {
      onSave?.('Error: ' + e.message, 'error');
    } finally {
      setClearing(p => ({ ...p, [slotDef.id]: false }));
    }
  }

  if (r32Docs.length === 0) return (
    <Accordion title='Equipos en Llaves (R32)'>
      <p className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
        Sin datos. Sincroniza primero para cargar los partidos de R32.
      </p>
    </Accordion>
  );

  return (
    <Accordion title='Equipos en Llaves (R32)'>
      <p className='text-xs mb-3' style={{ color: 'var(--color-text-muted)' }}>
        <strong>Grupos</strong> = calculado desde resultados reales · <strong>API</strong> = almacenado actualmente.
        Usa <em>Aplicar</em> para llenar TBD; <em>Quitar</em> para devolver el control a la API.
      </p>
      <div className='space-y-2'>
        {BRACKET_R32.map(slotDef => {
          const { home, away } = getR32Teams(slotDef, groupStandings, best3rd);
          const matchDoc = slotToDoc[slotDef.id];
          const hasOverride = !!matchDoc?.adminTeamOverride;
          const computedComplete = !!home && !!away;
          const apiComplete = !!(matchDoc?.tlaA && matchDoc?.tlaB);
          const alreadyMatch = computedComplete && apiComplete
            && matchDoc.tlaA === home.tla && matchDoc.tlaB === away.tla;

          return (
            <div
              key={slotDef.id}
              className='rounded-lg px-3 pt-2 pb-2.5'
              style={{
                background: 'var(--color-surface)',
                border: `1px solid ${hasOverride ? 'rgba(212,168,67,0.4)' : 'var(--color-border)'}`,
              }}
            >
              {/* Row 1: match number + slot description + badge */}
              <div className='flex items-center gap-2 mb-1.5'>
                <span
                  className='text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0'
                  style={{ background: 'var(--color-surface-card)', color: 'var(--color-text-muted)' }}
                >
                  M{slotDef.match}
                </span>
                <span className='text-[10px] truncate' style={{ color: 'var(--color-text-muted)' }}>
                  {SLOT_LABEL[slotDef.home]} vs {SLOT_LABEL[slotDef.away]}
                </span>
                {hasOverride && (
                  <span className='text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-auto'
                    style={{ background: 'rgba(212,168,67,0.15)', color: 'var(--color-gold)' }}>
                    manual
                  </span>
                )}
                {alreadyMatch && !hasOverride && (
                  <span className='text-xs font-semibold shrink-0 ml-auto' style={{ color: '#4caf72' }}>✓</span>
                )}
              </div>

              {/* Row 2: computed vs api + action */}
              <div className='flex items-center gap-2'>
                <div className='flex items-center gap-1.5 flex-1 min-w-0'>
                  <span className='text-[9px] font-semibold shrink-0' style={{ color: 'var(--color-text-muted)' }}>GR</span>
                  <TeamChip tla={home?.tla} flag={home?.flag} label='—' />
                  <span className='text-[10px] shrink-0' style={{ color: 'var(--color-text-muted)' }}>vs</span>
                  <TeamChip tla={away?.tla} flag={away?.flag} label='—' />
                </div>

                <span className='text-[10px] shrink-0' style={{ color: 'var(--color-text-muted)' }}>→</span>

                <div className='flex items-center gap-1.5 flex-1 min-w-0'>
                  <span className='text-[9px] font-semibold shrink-0' style={{ color: 'var(--color-text-muted)' }}>API</span>
                  <TeamChip tla={hasOverride ? matchDoc?.apiSnapshotTlaA : matchDoc?.tlaA} flag={hasOverride ? matchDoc?.apiSnapshotFlagA : matchDoc?.flagA} label='TBD' />
                  <span className='text-[10px] shrink-0' style={{ color: 'var(--color-text-muted)' }}>vs</span>
                  <TeamChip tla={hasOverride ? matchDoc?.apiSnapshotTlaB : matchDoc?.tlaB} flag={hasOverride ? matchDoc?.apiSnapshotFlagB : matchDoc?.flagB} label='TBD' />
                </div>

                <div className='shrink-0'>
                  {hasOverride && (
                    <button
                      onClick={() => handleClear(slotDef)}
                      disabled={clearing[slotDef.id]}
                      className='text-xs px-2 py-1 rounded-lg'
                      style={{
                        background: 'rgba(231,76,60,0.1)',
                        color: 'var(--color-accent-red)',
                        border: '1px solid var(--color-accent-red)',
                        opacity: clearing[slotDef.id] ? 0.6 : 1,
                      }}
                    >
                      {clearing[slotDef.id] ? '...' : 'Quitar'}
                    </button>
                  )}
                  {!hasOverride && !alreadyMatch && computedComplete && !apiComplete && (
                    <button
                      onClick={() => handleApply(slotDef)}
                      disabled={applying[slotDef.id]}
                      className='text-xs px-2.5 py-1 rounded-lg font-semibold'
                      style={{ background: 'var(--color-pitch)', color: '#fff', opacity: applying[slotDef.id] ? 0.6 : 1 }}
                    >
                      {applying[slotDef.id] ? '...' : 'Aplicar'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Accordion>
  );
}

export default function AdminPage() {
  const { profile } = useAuth();
  const [matches, setMatches] = useState([]);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [syncing, setSyncing] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [matchFilter, setMatchFilter] = useState(DEFAULT_TIME_FILTER);
  const [toast, setToast] = useState(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Per-match "who has/hasn't submitted their prediction" popup
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

  useEffect(() => {
    const unsub = onSyncStatusChange(setSyncStatus);
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setMatches(data);
    });
    return unsub;
  }, []);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleManualSync() {
    if (!hasApiKey()) {
      showToast('Falta VITE_FOOTBALL_DATA_API_KEY en .env', 'error');
      return;
    }
    setSyncing(true);
    try {
      const count = await syncMatchesFromAPI();
      showToast(`Sync exitoso: ${count} partidos actualizados`);
    } catch (err) {
      showToast(`Error de sync: ${err.message}`, 'error');
    } finally {
      setSyncing(false);
    }
  }

  // async function handleClearAllOverrides() {
  //   const snap = await getDocs(query(collection(db, 'matches'), where('adminOverride', '==', true)));
  //   if (snap.empty) {
  //     showToast('No hay ajustes manuales activos', 'error');
  //     return;
  //   }
  //   const matchIds = [];
  //   snap.forEach((d) => matchIds.push(d.id));
  //   for (const matchId of matchIds) {
  //     await resetPointsForMatch(matchId);
  //     await updateDoc(doc(db, 'matches', matchId), {
  //       adminOverride: deleteField(),
  //       adminOverriddenAt: deleteField(),
  //     });
  //   }
  //   showToast(`${matchIds.length} ajuste(s) manual(es) borrado(s)`);
  // }

  async function handleResetAllPoints() {
    setResetting(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const updates = [];
      usersSnap.forEach((d) => updates.push(updateDoc(doc(db, 'users', d.id), { totalPoints: 0 })));
      await Promise.all(updates);
      showToast(`Puntos reseteados (${updates.length} usuarios)`);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setResetting(false);
      setShowResetDialog(false);
    }
  }

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const count = await recalculateAllUsers();
      showToast(`Puntajes recalculados (${count} usuarios)`);
    } catch (err) {
      showToast(`Error al recalcular: ${err.message}`, 'error');
    } finally {
      setRecalculating(false);
    }
  }

  function handleToggleAuto() {
    if (autoPaused) {
      startAutoSync(true);
      setAutoPaused(false);
    } else {
      stopAutoSync();
      setAutoPaused(true);
    }
  }

  if (!profile?.isAdmin) {
    return (
      <div
        className='flex flex-col items-center justify-center min-h-[60vh]'
        style={{ color: 'var(--color-text-muted)' }}
      >
        <p className='text-4xl mb-3'>🔒</p>
        <p className='font-semibold' style={{ color: 'var(--color-text-secondary)' }}>
          Acceso denegado
        </p>
        <p className='text-sm mt-1'>Solo administradores pueden acceder a este panel.</p>
      </div>
    );
  }

  const filtered = filterMatchesByTime(matches, matchFilter);

  return (
    <div className='max-w-lg mx-auto px-4 pt-4'>
      <h1
        className='text-xl font-bold mb-4'
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
      >
        ⚙️ Panel Admin
      </h1>

      {/* Toast */}
      {toast && (
        <div
          className='fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-xl'
          style={{
            background: toast.type === 'error' ? 'var(--color-accent-red)' : 'var(--color-pitch)',
            color: '#fff',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* API Key warning */}
      {!hasApiKey() && (
        <div
          className='rounded-xl p-4 mb-4 text-sm'
          style={{
            background: 'rgba(231,76,60,0.1)',
            border: '1px solid var(--color-accent-red)',
            color: 'var(--color-accent-red)',
          }}
        >
          <strong>API Key no configurada.</strong> Agrega <code className='text-xs'>VITE_FOOTBALL_DATA_API_KEY</code> a
          tu archivo <code className='text-xs'>.env</code> para habilitar la sincronización.
        </div>
      )}

      {/* Sync button */}
      <button
        onClick={handleManualSync}
        disabled={syncing || syncStatus.syncing}
        className='w-full py-3 rounded-xl font-semibold mb-4 transition-opacity'
        style={{
          background: 'var(--color-gold)',
          color: '#111318',
          opacity: syncing || syncStatus.syncing ? 0.7 : 1,
          fontFamily: 'var(--font-display)',
        }}
      >
        {syncing || syncStatus.syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar Partidos Ahora'}
      </button>

      {/* Recalculate all users' points & breakdown */}
      <button
        onClick={handleRecalculate}
        disabled={recalculating}
        className='w-full py-2.5 rounded-xl font-medium mb-4 text-sm transition-opacity'
        style={{
          background: 'var(--color-surface-card)',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border)',
          opacity: recalculating ? 0.7 : 1,
        }}
      >
        {recalculating ? '⏳ Recalculando...' : '🧮 Recalcular Puntajes'}
      </button>

      {/* [TEMP] Clear all overrides */}
      {/* <button
        onClick={handleClearAllOverrides}
        className='w-full py-2 rounded-xl text-xs font-medium mb-2 transition-opacity'
        style={{
          background: 'rgba(231,76,60,0.1)',
          color: 'var(--color-accent-red)',
          border: '1px solid var(--color-accent-red)',
        }}
      >
        [TEST] Borrar todos los ajustes manuales
      </button> */}

      {/* [TEMP] Reset all points */}
      {/* <button
        onClick={() => setShowResetDialog(true)}
        className='w-full py-2 rounded-xl text-xs font-medium mb-4 transition-opacity'
        style={{
          background: 'rgba(231,76,60,0.1)',
          color: 'var(--color-accent-red)',
          border: '1px solid var(--color-accent-red)',
        }}
      >
        [TEST] Resetear puntos de todos los usuarios
      </button> */}

      {/* Reset points confirmation dialog */}
      {showResetDialog && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center px-4'
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div
            className='w-full max-w-sm rounded-2xl p-6'
            style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-accent-red)' }}
          >
            <p className='text-base font-bold mb-2' style={{ color: 'var(--color-text-primary)' }}>
              ¿Resetear todos los puntos?
            </p>
            <p className='text-sm mb-5' style={{ color: 'var(--color-text-muted)' }}>
              Esto pondrá <strong>totalPoints = 0</strong> en todos los usuarios. Esta acción no se puede deshacer.
            </p>
            <div className='flex gap-3'>
              <button
                onClick={() => setShowResetDialog(false)}
                disabled={resetting}
                className='flex-1 py-2 rounded-xl text-sm font-medium'
                style={{
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleResetAllPoints}
                disabled={resetting}
                className='flex-1 py-2 rounded-xl text-sm font-semibold transition-opacity'
                style={{
                  background: 'var(--color-accent-red)',
                  color: '#fff',
                  opacity: resetting ? 0.6 : 1,
                }}
              >
                {resetting ? 'Reseteando...' : 'Sí, resetear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status card */}
      <StatusCard syncStatus={syncStatus} autoPaused={autoPaused} onToggleAuto={handleToggleAuto} />

      {/* Individual awards */}
      <AwardsCard onSave={(msg, type) => showToast(msg, type)} />

      {/* Bracket team overrides */}
      <BracketTeamsCard matches={matches} onSave={(msg, type) => showToast(msg, type || 'success')} />

      {/* Manual overrides */}
      <h2 className='text-sm font-bold uppercase tracking-wider mb-3' style={{ color: 'var(--color-text-muted)' }}>
        Ajuste Manual de Resultados
      </h2>

      <div className='flex justify-center gap-2 mb-4'>
        {TIME_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setMatchFilter(f.value)}
            className='flex-1 md:flex-none md:px-10 py-1.5 md:py-3 rounded-full text-xs font-medium transition-colors'
            style={{
              background: matchFilter === f.value ? 'var(--color-gold)' : 'var(--color-surface-card)',
              color: matchFilter === f.value ? '#111318' : 'var(--color-text-secondary)',
              border: matchFilter === f.value ? 'none' : '1px solid var(--color-border)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {matches.length === 0 ? (
        <div className='text-center py-8' style={{ color: 'var(--color-text-muted)' }}>
          <p>Sin partidos. Sincroniza primero.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className='text-center py-8' style={{ color: 'var(--color-text-muted)' }}>
          <p>Sin partidos con este filtro.</p>
        </div>
      ) : (
        filtered.map((m) => (
          <MatchOverrideCard
            key={m.id}
            match={m}
            onSave={(msg) => showToast(msg || 'Resultado guardado')}
            onShowStatus={openStatus}
          />
        ))
      )}

      <PredictionStatusModal
        open={statusModal.open}
        onClose={() => setStatusModal((s) => ({ ...s, open: false }))}
        title={statusModal.title}
        rows={statusRows}
        loading={statusLoading}
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDocs, where, deleteField, Timestamp } from 'firebase/firestore';
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
  getSyncStatus,
} from '../services/matchSync';
import { hasApiKey } from '../services/footballApi';

function StatusCard({ syncStatus, autoPaused, onToggleAuto }) {
  return (
    <div
      className='rounded-xl p-4 mb-4'
      style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
    >
      <h2 className='text-xs font-bold uppercase tracking-wider mb-3' style={{ color: 'var(--color-gold)' }}>
        Estado del Sync
      </h2>

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
    </div>
  );
}

function MatchOverrideCard({ match, onSave }) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? '');
  const [scoreB, setScoreB] = useState(match.scoreB ?? '');
  const [status, setStatus] = useState(match.status);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Sync local state when Firestore updates the match (e.g. after clearing an override)
  useEffect(() => {
    setScoreA(match.scoreA ?? '');
    setScoreB(match.scoreB ?? '');
    setStatus(match.status);
  }, [match.scoreA, match.scoreB, match.status]);

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
      await updateDoc(matchRef, updates);

      if (status === 'finished' && scoreA !== '' && scoreB !== '') {
        await calculatePointsForMatch(match.id, Number(scoreA), Number(scoreB), match.stage);
      } else if (status === 'live' && scoreA !== '' && scoreB !== '') {
        await calculateLivePoints(match.id, Number(scoreA), Number(scoreB), match.stage);
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
            <p className='text-sm font-semibold' style={{ color: 'var(--color-text-primary)' }}>
              {match.tlaA || match.teamA} vs {match.tlaB || match.teamB}
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

      <div className='flex gap-2'>
        <button
          onClick={handleSave}
          disabled={saving || clearing}
          className='flex-1 py-2 rounded-lg text-sm font-semibold transition-opacity'
          style={{
            background: 'var(--color-pitch)',
            color: 'var(--color-text-primary)',
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

export default function AdminPage() {
  const { profile } = useAuth();
  const [matches, setMatches] = useState([]);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [syncing, setSyncing] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [matchFilter, setMatchFilter] = useState('all');
  const [toast, setToast] = useState(null);

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

  async function handleClearAllOverrides() {
    const snap = await getDocs(query(collection(db, 'matches'), where('adminOverride', '==', true)));
    if (snap.empty) {
      showToast('No hay ajustes manuales activos', 'error');
      return;
    }
    const promises = [];
    snap.forEach((d) => {
      promises.push(updateDoc(d.ref, { adminOverride: deleteField(), adminOverriddenAt: deleteField() }));
    });
    await Promise.all(promises);
    showToast(`${promises.length} ajuste(s) manual(es) borrado(s)`);
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

  const filtered = matchFilter === 'all' ? matches : matches.filter((m) => m.status === matchFilter);

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

      {/* [TEMP] Clear all overrides */}
      <button
        onClick={handleClearAllOverrides}
        className='w-full py-2 rounded-xl text-xs font-medium mb-4 transition-opacity'
        style={{
          background: 'rgba(231,76,60,0.1)',
          color: 'var(--color-accent-red)',
          border: '1px solid var(--color-accent-red)',
        }}
      >
        [TEST] Borrar todos los ajustes manuales
      </button>

      {/* Status card */}
      <StatusCard syncStatus={syncStatus} autoPaused={autoPaused} onToggleAuto={handleToggleAuto} />

      {/* Manual overrides */}
      <h2 className='text-sm font-bold uppercase tracking-wider mb-3' style={{ color: 'var(--color-text-muted)' }}>
        Ajuste Manual de Resultados
      </h2>

      <div className='flex gap-2 mb-4 overflow-x-auto pb-1'>
        {[
          { value: 'all', label: 'Todos' },
          { value: 'live', label: 'En Vivo' },
          { value: 'upcoming', label: 'Próximos' },
          { value: 'finished', label: 'Finalizados' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setMatchFilter(f.value)}
            className='shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors'
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
        filtered.map((m) => <MatchOverrideCard key={m.id} match={m} onSave={(msg) => showToast(msg || 'Resultado guardado')} />)
      )}
    </div>
  );
}

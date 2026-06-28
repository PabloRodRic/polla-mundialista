import { useMemo, useState } from 'react';
import { useTournamentData } from '../contexts/TournamentDataContext';
import { computeGroupStandings } from '../utils/standingsCalculator';
import scoring from '../config/scoring.json';

const ALL_GROUPS = 'ABCDEFGHIJKL'.split('');
const FS = scoring.groupStage.finalStandings;
const STANDING_PTS = [FS.correct1stPlace, FS.correct2ndPlace, FS.correct3rdPlace, FS.correct4thPlace];
const ADV_PTS = scoring.knockout.teamAdvancement.roundOf32;

function flagUrl(flag, crest) {
  if (flag) return `https://flagcdn.com/w40/${flag}.png`;
  if (crest) return crest;
  return null;
}

function StatusBadge({ done }) {
  return (
    <span
      className='text-[10px] font-semibold px-2 py-0.5 rounded-full'
      style={{
        background: done ? 'rgba(76,175,114,0.15)' : 'rgba(212,168,67,0.12)',
        color: done ? '#4caf72' : 'var(--color-gold)',
      }}
    >
      {done ? 'Finalizado' : 'En juego'}
    </span>
  );
}

function TeamFlag({ flag, crest, size = 'sm' }) {
  const src = flagUrl(flag, crest);
  const cls = size === 'sm' ? 'w-5 h-3.5' : 'w-4 h-3';
  return src
    ? <img src={src} alt='' className={`${cls} object-cover rounded-xs shrink-0`} />
    : <div className={`${cls} rounded-xs shrink-0`} style={{ background: 'var(--color-border)' }} />;
}

function GroupCard({ group, matches, groupPreds, myBracket }) {
  const teams = useMemo(() => {
    const map = {};
    for (const m of matches) {
      map[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA, crest: m.crestA };
      map[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB, crest: m.crestB };
    }
    return Object.values(map);
  }, [matches]);

  const actualStandings = useMemo(() => {
    const realPreds = {};
    for (const m of matches) {
      if (m.scoreA != null && m.scoreB != null)
        realPreds[m.id] = { predictedScoreA: m.scoreA, predictedScoreB: m.scoreB };
    }
    return computeGroupStandings(teams, matches, realPreds);
  }, [teams, matches]);

  const predictedStandings = useMemo(() => {
    return computeGroupStandings(teams, matches, groupPreds);
  }, [teams, matches, groupPreds]);

  const predictedRankMap = useMemo(() => {
    const map = {};
    predictedStandings.forEach((t, i) => { map[t.tla] = i + 1; });
    return map;
  }, [predictedStandings]);

  // Teams the user predicted to advance to R32 — top 2 (direct) or 3rd (best-3rd route)
  const userPredictedQualifiers = useMemo(() => {
    return new Set([predictedStandings[0]?.tla, predictedStandings[1]?.tla, predictedStandings[2]?.tla].filter(Boolean));
  }, [predictedStandings]);

  const allDone = matches.length === 6 && matches.every(m => m.status === 'finished');
  const played = matches.filter(m => m.status === 'finished').length;
  const gspPoints = myBracket?.[`gsp_${group}`];
  const gspScored = gspPoints !== undefined;

  // Actual qualifying teams (1st and 2nd)
  const qualifiers = actualStandings.slice(0, 2);

  return (
    <div className='rounded-2xl overflow-hidden mb-4' style={{ border: '1px solid var(--color-border)' }}>
      {/* Header */}
      <div className='flex items-center justify-between px-4 py-3' style={{ background: 'var(--color-surface-card)' }}>
        <div className='flex items-center gap-2'>
          <span className='text-base font-bold' style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
            Grupo {group}
          </span>
          <StatusBadge done={allDone} />
        </div>
        <div className='flex items-center gap-2'>
          {!allDone && played > 0 && (
            <span className='text-[11px]' style={{ color: 'var(--color-text-muted)' }}>{played}/6 jugados</span>
          )}
          {gspScored && (
            <span
              className='text-xs font-bold px-2.5 py-1 rounded-full'
              style={{
                background: gspPoints > 0 ? 'rgba(212,168,67,0.15)' : 'var(--color-surface)',
                color: gspPoints > 0 ? 'var(--color-gold)' : 'var(--color-text-muted)',
                border: `1px solid ${gspPoints > 0 ? 'rgba(212,168,67,0.3)' : 'var(--color-border)'}`,
              }}
            >
              {gspPoints > 0 ? `+${gspPoints}` : '0'} pos
            </span>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div
        className='grid px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide'
        style={{
          gridTemplateColumns: 'auto 1fr 2rem 2rem 2rem 2rem',
          gap: '0 8px',
          background: 'var(--color-surface)',
          color: 'var(--color-text-muted)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span className='w-4 text-center'>#</span>
        <span>Equipo</span>
        <span className='w-8 text-center'>GJ</span>
        <span className='w-8 text-center'>DG</span>
        <span className='w-8 text-center'>Pts</span>
        <span className='w-8 text-center' style={{ color: 'var(--color-gold)' }}>
          {gspScored ? 'Pts' : 'Tú'}
        </span>
      </div>

      {/* Team rows */}
      {actualStandings.map((team, i) => {
        const rank = i + 1;
        const qualifies = rank <= 2;
        const predictedRank = predictedRankMap[team.tla];
        const rankMatch = predictedRank === rank;
        const ptsEarned = gspScored ? (rankMatch ? STANDING_PTS[i] ?? 0 : 0) : null;

        return (
          <div
            key={team.tla}
            className='grid items-center px-4 py-2'
            style={{
              gridTemplateColumns: 'auto 1fr 2rem 2rem 2rem 2rem',
              gap: '0 8px',
              borderTop: '1px solid var(--color-border)',
              background: qualifies ? 'rgba(76,175,114,0.05)' : 'transparent',
            }}
          >
            <span className='w-4 text-center text-xs font-bold' style={{ color: qualifies ? '#4caf72' : 'var(--color-text-muted)' }}>
              {rank}
            </span>
            <div className='flex items-center gap-1.5 min-w-0'>
              <TeamFlag flag={team.flag} crest={team.crest} />
              <span className='text-sm font-medium truncate' style={{ color: 'var(--color-text-primary)' }}>{team.tla}</span>
            </div>
            <span className='w-8 text-center text-xs tabular-nums' style={{ color: 'var(--color-text-muted)' }}>{team.p}</span>
            <span
              className='w-8 text-center text-xs tabular-nums font-medium'
              style={{ color: team.gd > 0 ? '#4caf72' : team.gd < 0 ? 'var(--color-accent-red)' : 'var(--color-text-muted)' }}
            >
              {team.gd > 0 ? `+${team.gd}` : team.gd}
            </span>
            <span className='w-8 text-center text-sm font-bold tabular-nums' style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
              {team.pts}
            </span>
            <div className='w-8 flex justify-center'>
              {ptsEarned !== null ? (
                <span
                  className='text-[11px] font-bold px-1.5 py-0.5 rounded-full'
                  style={{
                    background: ptsEarned > 0 ? 'rgba(212,168,67,0.2)' : 'var(--color-surface)',
                    color: ptsEarned > 0 ? 'var(--color-gold)' : 'var(--color-text-muted)',
                    border: `1px solid ${ptsEarned > 0 ? 'rgba(212,168,67,0.4)' : 'var(--color-border)'}`,
                  }}
                >
                  {ptsEarned > 0 ? `+${ptsEarned}` : '0'}
                </span>
              ) : predictedRank ? (
                <span
                  className='text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center'
                  style={{
                    background: rankMatch ? 'rgba(212,168,67,0.15)' : 'var(--color-surface)',
                    color: rankMatch ? 'var(--color-gold)' : 'var(--color-text-muted)',
                    border: `1px solid ${rankMatch ? 'rgba(212,168,67,0.3)' : 'var(--color-border)'}`,
                  }}
                >
                  {predictedRank}
                </span>
              ) : (
                <span className='text-[11px]' style={{ color: 'var(--color-text-muted)' }}>–</span>
              )}
            </div>
          </div>
        );
      })}

      {actualStandings.length === 0 && (
        <div className='px-4 py-6 text-center text-sm' style={{ color: 'var(--color-text-muted)' }}>
          Sin partidos jugados aún
        </div>
      )}

      {/* Clasificados R32 — shown once any matches are played */}
      {qualifiers.length > 0 && (
        <div
          className='px-4 py-2.5 flex items-center gap-3'
          style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          <span className='text-[10px] font-semibold uppercase tracking-wide shrink-0' style={{ color: '#4caf72' }}>
            R32 →
          </span>
          <div className='flex items-center gap-2 flex-wrap flex-1'>
            {qualifiers.map((team) => {
              const userPredicted = userPredictedQualifiers.has(team.tla);
              const advPts = myBracket?.[`adv_roundOf32_${team.tla}`];
              const advScored = advPts !== undefined;

              return (
                <div key={team.tla} className='flex items-center gap-1'>
                  <TeamFlag flag={team.flag} crest={team.crest} size='xs' />
                  <span className='text-xs font-medium' style={{ color: 'var(--color-text-primary)' }}>{team.tla}</span>
                  {advScored ? (
                    <span
                      className='text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5'
                      style={{
                        background: advPts > 0 ? 'rgba(76,175,114,0.15)' : 'var(--color-surface-card)',
                        color: advPts > 0 ? '#4caf72' : 'var(--color-text-muted)',
                        border: `1px solid ${advPts > 0 ? 'rgba(76,175,114,0.3)' : 'var(--color-border)'}`,
                      }}
                    >
                      {advPts > 0 ? `+${advPts}` : '0'}
                    </span>
                  ) : (
                    <span
                      className='text-[10px] px-1.5 py-0.5 rounded-full ml-0.5'
                      style={{
                        background: userPredicted ? 'rgba(76,175,114,0.1)' : 'var(--color-surface-card)',
                        color: userPredicted ? '#4caf72' : 'var(--color-text-muted)',
                        border: `1px solid ${userPredicted ? 'rgba(76,175,114,0.2)' : 'var(--color-border)'}`,
                      }}
                    >
                      {userPredicted ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {!gspScored && allDone && (
            <span className='text-[10px]' style={{ color: 'var(--color-text-muted)' }}>calculando…</span>
          )}
        </div>
      )}
    </div>
  );
}

function Best3rdCard({ matchesByGroup, groupPreds, myBracket }) {
  // A group is finished once all 6 of its matches are finished. Derive this from the
  // actual match data — there is no persisted per-group "done" flag.
  const allGroupsDone = ALL_GROUPS.every(g => {
    const ms = matchesByGroup[g] || [];
    return ms.length === 6 && ms.every(m => m.status === 'finished');
  });

  // Compute actual 3rd place team per group from real scores
  const allActualStandings = useMemo(() => {
    const result = {};
    for (const g of ALL_GROUPS) {
      const gMatches = matchesByGroup[g] || [];
      if (gMatches.length === 0) continue;
      const teamMap = {};
      for (const m of gMatches) {
        teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA, crest: m.crestA };
        teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB, crest: m.crestB };
      }
      const realPreds = {};
      for (const m of gMatches) {
        if (m.scoreA != null && m.scoreB != null)
          realPreds[m.id] = { predictedScoreA: m.scoreA, predictedScoreB: m.scoreB };
      }
      result[g] = computeGroupStandings(Object.values(teamMap), gMatches, realPreds);
    }
    return result;
  }, [matchesByGroup]);

  const thirds = useMemo(() => {
    const candidates = [];
    for (const [g, standings] of Object.entries(allActualStandings)) {
      if (standings.length >= 3) candidates.push({ ...standings[2], fromGroup: g });
    }
    return candidates.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.tla.localeCompare(b.tla);
    });
  }, [allActualStandings]);

  // Predicted 3rd-place teams per group (user's perspective)
  const userPredictedR32Qualifiers = useMemo(() => {
    const thirdCandidates = [];
    const top2Set = new Set();
    for (const g of ALL_GROUPS) {
      const gMatches = matchesByGroup[g] || [];
      if (gMatches.length === 0) continue;
      const teamMap = {};
      for (const m of gMatches) {
        teamMap[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA, crest: m.crestA };
        teamMap[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB, crest: m.crestB };
      }
      const standings = computeGroupStandings(Object.values(teamMap), gMatches, groupPreds);
      if (standings[0]) top2Set.add(standings[0].tla);
      if (standings[1]) top2Set.add(standings[1].tla);
      if (standings[2]) thirdCandidates.push({ ...standings[2], fromGroup: g });
    }
    const best3rdSet = new Set(
      thirdCandidates
        .sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.gd !== a.gd) return b.gd - a.gd;
          if (b.gf !== a.gf) return b.gf - a.gf;
          return a.tla.localeCompare(b.tla);
        })
        .slice(0, 8)
        .map(t => t.tla)
    );
    // A user "predicted" a best-3rd to advance if they had them in top 2 OR among their best 8 thirds
    return { best3rdSet, top2Set };
  }, [matchesByGroup, groupPreds]);

  if (thirds.length === 0) return null;

  return (
    <div className='rounded-2xl overflow-hidden mb-4' style={{ border: '1px solid var(--color-border)' }}>
      <div className='flex items-center justify-between px-4 py-3' style={{ background: 'var(--color-surface-card)' }}>
        <div className='flex items-center gap-2'>
          <span className='text-base font-bold' style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
            Mejores 3eros
          </span>
          <span
            className='text-[10px] font-semibold px-2 py-0.5 rounded-full'
            style={{
              background: allGroupsDone ? 'rgba(76,175,114,0.15)' : 'rgba(212,168,67,0.12)',
              color: allGroupsDone ? '#4caf72' : 'var(--color-gold)',
            }}
          >
            {allGroupsDone ? 'Finalizado' : 'Pendiente'}
          </span>
        </div>
        {!allGroupsDone && (
          <span className='text-[10px]' style={{ color: 'var(--color-text-muted)' }}>
            Puntos al terminar todos los grupos
          </span>
        )}
      </div>

      <div
        className='grid px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide'
        style={{
          gridTemplateColumns: 'auto auto 1fr 2rem 2rem 2rem 2rem',
          gap: '0 8px',
          background: 'var(--color-surface)',
          color: 'var(--color-text-muted)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span className='w-4 text-center'>#</span>
        <span className='w-6 text-center'>Gr</span>
        <span>Equipo</span>
        <span className='w-8 text-center'>DG</span>
        <span className='w-8 text-center'>GF</span>
        <span className='w-8 text-center'>Pts</span>
        <span className='w-8 text-center' style={{ color: 'var(--color-gold)' }}>
          {allGroupsDone ? 'R32' : 'Tú'}
        </span>
      </div>

      {thirds.map((team, i) => {
        const qualifies = i < 8;
        const userPicked = userPredictedR32Qualifiers.best3rdSet.has(team.tla) || userPredictedR32Qualifiers.top2Set.has(team.tla);
        const advPts = myBracket?.[`adv_roundOf32_${team.tla}`];
        // Best-3rd R32 advancement is only awarded once every group is finished.
        // Until then show the pending pick indicator, never an (possibly stale) score.
        const advScored = allGroupsDone && advPts !== undefined;

        return (
          <div
            key={team.tla}
            className='grid items-center px-4 py-2'
            style={{
              gridTemplateColumns: 'auto auto 1fr 2rem 2rem 2rem 2rem',
              gap: '0 8px',
              borderTop: '1px solid var(--color-border)',
              background: qualifies ? 'rgba(76,175,114,0.05)' : 'transparent',
            }}
          >
            <span className='w-4 text-center text-xs font-bold' style={{ color: qualifies ? '#4caf72' : 'var(--color-text-muted)' }}>
              {i + 1}
            </span>
            <span
              className='w-6 text-center text-[10px] font-bold rounded'
              style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface-card)', padding: '1px 4px' }}
            >
              {team.fromGroup}
            </span>
            <div className='flex items-center gap-1.5 min-w-0'>
              <TeamFlag flag={team.flag} crest={team.crest} />
              <span className='text-sm font-medium truncate' style={{ color: 'var(--color-text-primary)' }}>{team.tla}</span>
            </div>
            <span
              className='w-8 text-center text-xs tabular-nums font-medium'
              style={{ color: team.gd > 0 ? '#4caf72' : team.gd < 0 ? 'var(--color-accent-red)' : 'var(--color-text-muted)' }}
            >
              {team.gd > 0 ? `+${team.gd}` : team.gd}
            </span>
            <span className='w-8 text-center text-xs tabular-nums' style={{ color: 'var(--color-text-muted)' }}>
              {team.gf}
            </span>
            <span className='w-8 text-center text-sm font-bold tabular-nums' style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
              {team.pts}
            </span>
            <div className='w-8 flex justify-center'>
              {advScored ? (
                <span
                  className='text-[11px] font-bold px-1.5 py-0.5 rounded-full'
                  style={{
                    background: advPts > 0 ? 'rgba(76,175,114,0.15)' : 'var(--color-surface)',
                    color: advPts > 0 ? '#4caf72' : 'var(--color-text-muted)',
                    border: `1px solid ${advPts > 0 ? 'rgba(76,175,114,0.3)' : 'var(--color-border)'}`,
                  }}
                >
                  {advPts > 0 ? `+${advPts}` : '0'}
                </span>
              ) : qualifies && userPicked ? (
                // Currently a qualifying best-3rd the user predicted — preview the points
                // they'd earn if standings hold (not yet awarded until all groups finish).
                <span
                  className='text-[11px] font-bold px-1.5 py-0.5 rounded-full'
                  style={{
                    background: 'rgba(76,175,114,0.15)',
                    color: '#4caf72',
                    border: '1px solid rgba(76,175,114,0.3)',
                  }}
                >
                  +{ADV_PTS}
                </span>
              ) : (
                <span
                  className='text-[10px] px-1.5 py-0.5 rounded-full'
                  style={{
                    background: userPicked ? 'rgba(76,175,114,0.1)' : 'var(--color-surface-card)',
                    color: userPicked ? '#4caf72' : 'var(--color-text-muted)',
                    border: `1px solid ${userPicked ? 'rgba(76,175,114,0.2)' : 'var(--color-border)'}`,
                  }}
                >
                  {userPicked ? '✓' : '✗'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoringInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div
      className='rounded-2xl mb-5 overflow-hidden'
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-card)' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className='w-full flex items-center justify-between px-4 py-3'
      >
        <div className='flex items-center gap-2'>
          <svg
            className='w-4 h-4 shrink-0 transition-transform'
            style={{ color: 'var(--color-text-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'
          >
            <path d='M6 9l6 6 6-6' />
          </svg>
          <span className='text-xs font-semibold uppercase tracking-wide' style={{ color: 'var(--color-gold)' }}>
            ¿Cómo se otorgan los puntos?
          </span>
        </div>
      </button>

      {open && (
        <div className='px-4 pb-4 text-sm' style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className='text-xs mt-3 mb-2' style={{ color: 'var(--color-text-muted)' }}>
            Por adivinar la posición final de cada equipo en su grupo (otorgados al terminar los 6 partidos):
          </p>
          {[
            { label: '1° lugar del grupo', pts: FS.correct1stPlace },
            { label: '2° lugar del grupo', pts: FS.correct2ndPlace },
            { label: '3° lugar del grupo', pts: FS.correct3rdPlace },
            { label: '4° lugar del grupo', pts: FS.correct4thPlace },
          ].map(({ label, pts }) => (
            <div key={label} className='flex justify-between py-1.5' style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
              <span className='font-bold' style={{ color: 'var(--color-text-primary)' }}>+{pts} pts</span>
            </div>
          ))}

          <p className='text-xs mt-3 mb-2' style={{ color: 'var(--color-text-muted)' }}>
            Por cada equipo que avanza a 16vos y tú lo tenías en tu top 2 del grupo:
          </p>
          {[
            { label: 'Clasificado a 16vos (1° o 2°)', pts: ADV_PTS },
            { label: 'Mejor 3ero clasificado a 16vos', pts: ADV_PTS },
          ].map(({ label, pts }) => (
            <div key={label} className='flex justify-between py-1.5' style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
              <span className='font-bold' style={{ color: 'var(--color-text-primary)' }}>+{pts} pts</span>
            </div>
          ))}

          <p className='text-xs mt-3' style={{ color: 'var(--color-text-muted)' }}>
            La columna <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>Tú</span> muestra tu pronóstico antes de que el grupo termine, y los puntos ganados una vez finalizado.
          </p>
        </div>
      )}
    </div>
  );
}

export default function GroupsPage() {
  const { matches, groupPreds, myBracket } = useTournamentData();

  const matchesByGroup = useMemo(() => {
    const map = {};
    for (const g of ALL_GROUPS) map[g] = [];
    for (const m of matches) {
      if (m.stage === 'group' && m.group && map[m.group]) map[m.group].push(m);
    }
    return map;
  }, [matches]);

  const totalGsp = useMemo(() => {
    if (!myBracket) return 0;
    return ALL_GROUPS.reduce((sum, g) => sum + (myBracket[`gsp_${g}`] ?? 0), 0);
  }, [myBracket]);

  const totalAdv = useMemo(() => {
    if (!myBracket) return 0;
    return Object.entries(myBracket)
      .filter(([k]) => k.startsWith('adv_roundOf32_'))
      .reduce((sum, [, v]) => sum + (v || 0), 0);
  }, [myBracket]);

  const anyGroupScored = myBracket && ALL_GROUPS.some(g => myBracket[`gsp_${g}`] !== undefined);

  return (
    <div className='max-w-lg mx-auto px-4 pt-4'>
      <h1 className='text-xl font-bold mb-3' style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
        Grupos
      </h1>

      <ScoringInfo />

      {anyGroupScored && (
        <div
          className='rounded-2xl px-4 py-3 mb-5'
          style={{ background: 'var(--color-surface-card)', border: '1px solid rgba(212,168,67,0.3)' }}
        >
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-xs mb-1' style={{ color: 'var(--color-text-muted)' }}>Posiciones en grupos</p>
              <div className='flex gap-1.5 flex-wrap'>
                {ALL_GROUPS.filter(g => myBracket?.[`gsp_${g}`] !== undefined).map(g => (
                  <span
                    key={g}
                    className='text-[11px] px-2 py-0.5 rounded-full'
                    style={{
                      background: (myBracket[`gsp_${g}`] ?? 0) > 0 ? 'rgba(212,168,67,0.12)' : 'var(--color-surface)',
                      color: (myBracket[`gsp_${g}`] ?? 0) > 0 ? 'var(--color-gold)' : 'var(--color-text-muted)',
                      border: `1px solid ${(myBracket[`gsp_${g}`] ?? 0) > 0 ? 'rgba(212,168,67,0.3)' : 'var(--color-border)'}`,
                    }}
                  >
                    {g}: {myBracket[`gsp_${g}`] ?? 0}
                  </span>
                ))}
              </div>
            </div>
            <div className='text-right shrink-0 ml-4'>
              <p className='text-2xl font-bold' style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
                {totalGsp + totalAdv}
              </p>
              <p className='text-[10px]' style={{ color: 'var(--color-text-muted)' }}>pts grupos</p>
            </div>
          </div>
          {totalAdv > 0 && (
            <p className='text-[11px] mt-2 pt-2' style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
              Incluye <span style={{ color: '#4caf72', fontWeight: 600 }}>{totalAdv} pts</span> por equipos clasificados a R32
            </p>
          )}
        </div>
      )}

      {ALL_GROUPS.map(g => (
        <GroupCard
          key={g}
          group={g}
          matches={matchesByGroup[g]}
          groupPreds={groupPreds}
          myBracket={myBracket}
        />
      ))}

      <Best3rdCard matchesByGroup={matchesByGroup} groupPreds={groupPreds} myBracket={myBracket} />
    </div>
  );
}

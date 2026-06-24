import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTournamentData } from '../contexts/TournamentDataContext';
import { computeGroupStandings } from '../utils/standingsCalculator';
import scoring from '../config/scoring.json';

const FS = scoring.groupStage.finalStandings;
const STANDING_PTS = [FS.correct1stPlace, FS.correct2ndPlace, FS.correct3rdPlace, FS.correct4thPlace];

const ALL_GROUPS = 'ABCDEFGHIJKL'.split('');

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

function GroupCard({ group, matches, groupPreds, myBracket }) {
  // Build team map from matches
  const teams = useMemo(() => {
    const map = {};
    for (const m of matches) {
      map[m.tlaA] = { tla: m.tlaA, name: m.teamA, flag: m.flagA, crest: m.crestA };
      map[m.tlaB] = { tla: m.tlaB, name: m.teamB, flag: m.flagB, crest: m.crestB };
    }
    return Object.values(map);
  }, [matches]);

  // Actual standings from real scores
  const actualStandings = useMemo(() => {
    const realPreds = {};
    for (const m of matches) {
      if (m.scoreA != null && m.scoreB != null) {
        realPreds[m.id] = { predictedScoreA: m.scoreA, predictedScoreB: m.scoreB };
      }
    }
    return computeGroupStandings(teams, matches, realPreds);
  }, [teams, matches]);

  // User's predicted standings
  const predictedStandings = useMemo(() => {
    return computeGroupStandings(teams, matches, groupPreds);
  }, [teams, matches, groupPreds]);

  const predictedRankMap = useMemo(() => {
    const map = {};
    predictedStandings.forEach((t, i) => { map[t.tla] = i + 1; });
    return map;
  }, [predictedStandings]);

  const allDone = matches.length === 6 && matches.every(m => m.status === 'finished');
  const gspPoints = myBracket?.[`gsp_${group}`];
  const gspScored = gspPoints !== undefined;

  // Count how many matches have been played
  const played = matches.filter(m => m.status === 'finished').length;

  return (
    <div
      className='rounded-2xl overflow-hidden mb-4'
      style={{ border: '1px solid var(--color-border)' }}
    >
      {/* Header */}
      <div
        className='flex items-center justify-between px-4 py-3'
        style={{ background: 'var(--color-surface-card)' }}
      >
        <div className='flex items-center gap-2'>
          <span
            className='text-base font-bold'
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
          >
            Grupo {group}
          </span>
          <StatusBadge done={allDone} />
        </div>
        <div className='flex items-center gap-2'>
          {!allDone && played > 0 && (
            <span className='text-[11px]' style={{ color: 'var(--color-text-muted)' }}>
              {played}/6 jugados
            </span>
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
              {gspPoints > 0 ? `+${gspPoints} pts` : '0 pts'}
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

      {/* Rows */}
      {actualStandings.map((team, i) => {
        const rank = i + 1;
        const qualifies = rank <= 2;
        const predictedRank = predictedRankMap[team.tla];
        const rankMatch = predictedRank === rank;
        const ptsEarned = gspScored ? (rankMatch ? STANDING_PTS[i] ?? 0 : 0) : null;
        const flagSrc = flagUrl(team.flag, team.crest);

        return (
          <div
            key={team.tla}
            className='grid items-center px-4 py-2'
            style={{
              gridTemplateColumns: 'auto 1fr 2rem 2rem 2rem 2rem',
              gap: '0 8px',
              borderTop: '1px solid var(--color-border)',
              background: qualifies
                ? 'rgba(76,175,114,0.05)'
                : 'transparent',
            }}
          >
            {/* Rank */}
            <span
              className='w-4 text-center text-xs font-bold'
              style={{ color: qualifies ? '#4caf72' : 'var(--color-text-muted)' }}
            >
              {rank}
            </span>

            {/* Team */}
            <div className='flex items-center gap-1.5 min-w-0'>
              {flagSrc ? (
                <img src={flagSrc} alt='' className='w-5 h-3.5 object-cover rounded-[2px] shrink-0' />
              ) : (
                <div className='w-5 h-3.5 rounded-[2px] shrink-0' style={{ background: 'var(--color-border)' }} />
              )}
              <span className='text-sm font-medium truncate' style={{ color: 'var(--color-text-primary)' }}>
                {team.tla}
              </span>
            </div>

            {/* Played */}
            <span className='w-8 text-center text-xs tabular-nums' style={{ color: 'var(--color-text-muted)' }}>
              {team.p}
            </span>

            {/* Goal diff */}
            <span
              className='w-8 text-center text-xs tabular-nums font-medium'
              style={{ color: team.gd > 0 ? '#4caf72' : team.gd < 0 ? 'var(--color-accent-red)' : 'var(--color-text-muted)' }}
            >
              {team.gd > 0 ? `+${team.gd}` : team.gd}
            </span>

            {/* Points */}
            <span
              className='w-8 text-center text-sm font-bold tabular-nums'
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
            >
              {team.pts}
            </span>

            {/* Points earned per position (when scored) or predicted rank (when pending) */}
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

      {/* Empty state: no matches played yet */}
      {actualStandings.length === 0 && (
        <div className='px-4 py-6 text-center text-sm' style={{ color: 'var(--color-text-muted)' }}>
          Sin partidos jugados aún
        </div>
      )}
    </div>
  );
}

export default function GroupsPage() {
  const { user } = useAuth();
  const { matches, groupPreds, myBracket } = useTournamentData();

  // Group matches by group letter, only group-stage matches
  const matchesByGroup = useMemo(() => {
    const map = {};
    for (const g of ALL_GROUPS) map[g] = [];
    for (const m of matches) {
      if (m.stage === 'group' && m.group && map[m.group]) {
        map[m.group].push(m);
      }
    }
    return map;
  }, [matches]);

  // Total gsp points across all groups
  const totalGsp = useMemo(() => {
    if (!myBracket) return 0;
    return ALL_GROUPS.reduce((sum, g) => sum + (myBracket[`gsp_${g}`] ?? 0), 0);
  }, [myBracket]);

  const anyGroupScored = myBracket && ALL_GROUPS.some(g => myBracket[`gsp_${g}`] !== undefined);

  return (
    <div className='max-w-lg mx-auto px-4 pt-4'>
      <h1
        className='text-xl font-bold mb-1'
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
      >
        Grupos
      </h1>
      <p className='text-xs mb-4' style={{ color: 'var(--color-text-muted)' }}>
        Posiciones en tiempo real · Puntos de grupo se otorgan al terminar los 6 partidos de cada grupo ·{' '}
        <span style={{ color: 'var(--color-gold)' }}>Tu</span> = posición que pronosticaste
      </p>

      {/* Summary card: only once at least one group is scored */}
      {anyGroupScored && (
        <div
          className='flex items-center justify-between rounded-2xl px-4 py-3 mb-5'
          style={{ background: 'var(--color-surface-card)', border: '1px solid rgba(212,168,67,0.3)' }}
        >
          <div>
            <p className='text-xs' style={{ color: 'var(--color-text-muted)' }}>
              Puntos por posiciones en grupos
            </p>
            <div className='flex gap-1.5 flex-wrap mt-1'>
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
              {totalGsp}
            </p>
            <p className='text-[10px]' style={{ color: 'var(--color-text-muted)' }}>pts totales</p>
          </div>
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
    </div>
  );
}

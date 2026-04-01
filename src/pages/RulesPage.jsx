import scoring from '../config/scoring.json';

function Section({ title, children }) {
  return (
    <div
      className='rounded-xl p-4 mb-4'
      style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
    >
      <h2
        className='text-sm font-bold uppercase tracking-wider mb-3'
        style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function PointRow({ label, points, highlight }) {
  return (
    <div className='flex items-center justify-between py-2' style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span className='text-sm' style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span
        className='font-bold text-sm'
        style={{ color: highlight ? 'var(--color-gold)' : 'var(--color-text-primary)' }}
      >
        +{points} pts
      </span>
    </div>
  );
}

function TierTable({ config, title }) {
  return (
    <div className='mb-3'>
      {title && (
        <p className='text-xs font-semibold mb-2' style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </p>
      )}
      <PointRow label='Resultado correcto (1X2)' points={config.correctOutcome} />
      <PointRow label='Resultado + diferencia de gol' points={config.correctOutcomeAndGoalDifference} />
      <PointRow label='Resultado exacto' points={config.exactScore} highlight />
    </div>
  );
}

export default function RulesPage() {
  const { groupStage, knockout, tournamentOutcome, individualAwards, liveMatchTiming } = scoring;

  return (
    <div className='max-w-lg mx-auto px-4 pt-4 pb-8'>
      <h1
        className='text-xl font-bold mb-1'
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
      >
        📜 Reglas
      </h1>
      <p className='text-sm mb-5' style={{ color: 'var(--color-text-muted)' }}>
        Sistema de puntuación para la Polla Mundial 2026.
      </p>

      {/* Group stage */}
      <Section title='Fase de Grupos — Partidos'>
        <TierTable config={groupStage.matchResult} />
      </Section>

      {/* Group standings */}
      <Section title='Fase de Grupos — Posiciones Finales'>
        <p className='text-sm mb-3' style={{ color: 'var(--color-text-secondary)' }}>
          Por adivinar la posición final de cada equipo en su grupo:
        </p>
        <PointRow label='1° lugar del grupo' points={groupStage.finalStandings.correct1stPlace} />
        <PointRow label='2° lugar del grupo' points={groupStage.finalStandings.correct2ndPlace} />
        <PointRow label='3° lugar del grupo' points={groupStage.finalStandings.correct3rdPlace} />
        <PointRow label='4° lugar del grupo' points={groupStage.finalStandings.correct4thPlace} />
      </Section>

      {/* Knockout — team advancement */}
      <Section title='Eliminatorias — Clasificación de Equipos'>
        <p className='text-sm mb-3' style={{ color: 'var(--color-text-secondary)' }}>
          Puntos por predecir qué equipos avanzan a cada ronda:
        </p>
        <PointRow label='Ronda de 32' points={knockout.teamAdvancement.roundOf32} />
        <PointRow label='Octavos de Final' points={knockout.teamAdvancement.roundOf16} />
        <PointRow label='Cuartos de Final' points={knockout.teamAdvancement.quarterfinals} />
        <PointRow label='Semifinales' points={knockout.teamAdvancement.semifinals} />
        <PointRow label='Final' points={knockout.teamAdvancement.final} highlight />
      </Section>

      {/* Pre-tournament knockout match results */}
      <Section title='Eliminatorias — Resultados Pre-torneo'>
        <p className='text-sm mb-3' style={{ color: 'var(--color-text-secondary)' }}>
          Predicciones del bracket completo (antes del torneo). Puntos aumentan por ronda:
        </p>
        {[
          ['Ronda de 32', knockout.preTournamentMatchResult.roundOf32],
          ['Octavos de Final', knockout.preTournamentMatchResult.roundOf16],
          ['Cuartos de Final', knockout.preTournamentMatchResult.quarterfinals],
          ['Semifinales', knockout.preTournamentMatchResult.semifinals],
          ['Tercer Puesto', knockout.preTournamentMatchResult.thirdPlace],
          ['Final', knockout.preTournamentMatchResult.final],
        ].map(([label, cfg]) => (
          <div key={label} className='mb-4'>
            <TierTable config={cfg} title={label} />
          </div>
        ))}
      </Section>

      {/* Live knockout predictions */}
      <Section title='Predicciones en Vivo (Eliminatorias)'>
        <p className='text-sm mb-3' style={{ color: 'var(--color-text-secondary)' }}>
          Para cada partido eliminatorio, se habilita una predicción individual:
        </p>
        <div
          className='rounded-lg p-3 mb-3 text-xs'
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
        >
          <p>
            ⏰ Abre: <strong>{liveMatchTiming.opensBeforeKickoffHours}h</strong> antes del partido
          </p>
          <p className='mt-1'>
            🔒 Cierra: <strong>{liveMatchTiming.locksBeforeKickoffHours}h</strong> antes del partido
          </p>
        </div>
        <TierTable config={knockout.liveMatchResult} />
        <p className='text-xs mt-2' style={{ color: 'var(--color-text-muted)' }}>
          Puntaje fijo en todas las rondas. Se acumula con las predicciones pre-torneo.
        </p>
      </Section>

      {/* Tournament outcomes */}
      <Section title='Resultado del Torneo'>
        <PointRow label='Campeón correcto' points={tournamentOutcome.correctChampion} highlight />
        <PointRow label='Subcampeón correcto' points={tournamentOutcome.correctRunnerUp} />
        <PointRow label='Tercer puesto correcto' points={tournamentOutcome.correct3rdPlace} />
      </Section>

      {/* Individual awards */}
      <Section title='Premios Individuales'>
        <PointRow label='Bota de Oro (goleador)' points={individualAwards.goldenBoot} />
        <PointRow label='Balón de Oro (mejor jugador)' points={individualAwards.goldenBall} />
      </Section>

      {/* 90-minute rule */}
      <Section title='Regla de los 90 Minutos'>
        <p className='text-sm' style={{ color: 'var(--color-text-secondary)' }}>
          En partidos eliminatorios, solo cuenta el resultado al finalizar los 90 minutos reglamentarios. El tiempo
          extra y los penales <strong>no afectan</strong> las predicciones. Si hay empate a los 90 minutos, se considera
          un resultado de empate.
        </p>
      </Section>

      {/* Lock rule */}
      <Section title='Cierre de Predicciones'>
        <p className='text-sm' style={{ color: 'var(--color-text-secondary)' }}>
          Las predicciones de fase de grupos y del bracket pre-torneo se cierran automáticamente cuando comienza el
          primer partido del torneo. Las predicciones en vivo de eliminatorias se cierran{' '}
          <strong>{liveMatchTiming.locksBeforeKickoffHours} hora</strong> antes de cada partido.
        </p>
      </Section>
    </div>
  );
}

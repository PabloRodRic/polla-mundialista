import { tlaLabel } from '../utils/teamLabels';

// Popup listing every other participant's prediction for a single match/award.
// type 'group' | 'live' → rows show the scoreline against the fixed teams.
// type 'knockout'       → rows show the scoreline plus the picked winner (each
//                         user's teams differ, so the pick is the clear part).
// type 'award'          → rows show a free-text value (golden boot/ball/gender).
// type 'outcome'        → rows show a team (flag + TLA) for champion/2nd/3rd.
export default function OthersBetsModal({ open, onClose, title, type, bets, loading, currentUserId }) {
  if (!open) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4'
      style={{ background: 'rgba(6, 14, 9, 0.7)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease' }}
      onClick={onClose}
    >
      <div
        className='relative w-full max-w-sm rounded-3xl p-6 pt-7 max-h-[80vh] flex flex-col'
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
          animation: 'slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label='Cerrar'
          className='absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full transition-colors'
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <svg className='w-5 h-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
            <path d='M6 6l12 12M18 6L6 18' strokeLinecap='round' />
          </svg>
        </button>

        {/* Header */}
        <div className='mb-4 pr-8'>
          <h2
            className='text-base font-black leading-tight uppercase'
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}
          >
            Pronósticos
          </h2>
          <p className='text-xs mt-0.5' style={{ color: 'var(--color-text-muted)' }}>
            {title}
          </p>
        </div>

        {/* Body */}
        <div className='overflow-y-auto -mr-2 pr-2'>
          {loading ? (
            <p className='text-sm text-center py-8' style={{ color: 'var(--color-text-muted)' }}>
              Cargando...
            </p>
          ) : bets.length === 0 ? (
            <p className='text-sm text-center py-8' style={{ color: 'var(--color-text-muted)' }}>
              Nadie ha pronosticado esto todavía.
            </p>
          ) : (
            <ul className='flex flex-col gap-1.5'>
              {bets.map((b) => {
                const isMe = b.userId === currentUserId;
                const hasScore = b.scoreA != null && b.scoreB != null;

                const avatar = b.photoURL ? (
                  <img src={b.photoURL} alt={b.name} className='w-7 h-7 rounded-full object-cover shrink-0' />
                ) : (
                  <div
                    className='w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0'
                    style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}
                  >
                    {(b.name?.[0] || '?').toUpperCase()}
                  </div>
                );
                const nameEl = (
                  <span className='text-sm font-medium truncate' style={{ color: 'var(--color-text-primary)' }}>
                    {b.name}
                    {isMe && <span style={{ color: 'var(--color-gold)' }}> (tú)</span>}
                  </span>
                );
                const rowStyle = {
                  background: isMe ? 'rgba(212,168,67,0.10)' : 'var(--color-surface)',
                  border: `1px solid ${isMe ? 'rgba(212,168,67,0.45)' : 'var(--color-border)'}`,
                };

                // Knockout: two-line row — name on top, resolved matchup below.
                if (type === 'knockout') {
                  return (
                    <li key={b.userId} className='flex flex-col gap-2 rounded-xl px-2.5 py-2' style={rowStyle}>
                      <div className='flex items-center gap-2.5'>
                        {avatar}
                        {nameEl}
                      </div>
                      <div className='flex items-center justify-center gap-2 text-sm'>
                        <span className='flex items-center gap-1.5 justify-end flex-1 min-w-0'>
                          <span className='font-bold truncate' style={{ color: 'var(--color-text-primary)' }}>
                            {b.homeTla ? tlaLabel(b.homeTla) : '—'}
                          </span>
                          {b.homeFlag && (
                            <img
                              src={`https://flagcdn.com/w40/${b.homeFlag}.png`}
                              alt=''
                              className='w-5 h-3.5 object-cover rounded shrink-0'
                            />
                          )}
                        </span>
                        <span
                          className='font-bold tabular-nums shrink-0'
                          style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
                        >
                          {hasScore ? `${b.scoreA} – ${b.scoreB}` : 'vs'}
                        </span>
                        <span className='flex items-center gap-1.5 flex-1 min-w-0'>
                          {b.awayFlag && (
                            <img
                              src={`https://flagcdn.com/w40/${b.awayFlag}.png`}
                              alt=''
                              className='w-5 h-3.5 object-cover rounded shrink-0'
                            />
                          )}
                          <span className='font-bold truncate' style={{ color: 'var(--color-text-primary)' }}>
                            {b.awayTla ? tlaLabel(b.awayTla) : '—'}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={b.userId} className='flex items-center gap-2.5 rounded-xl px-2.5 py-2' style={rowStyle}>
                    {avatar}
                    {nameEl}

                    <div className='ml-auto flex items-center gap-2 shrink-0'>
                      {hasScore && (
                        <span
                          className='text-sm font-bold tabular-nums'
                          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
                        >
                          {b.scoreA} – {b.scoreB}
                        </span>
                      )}
                      {b.value != null && (
                        <span className='flex items-center gap-1.5'>
                          {b.flag && (
                            <img
                              src={`https://flagcdn.com/w40/${b.flag}.png`}
                              alt=''
                              className='w-5 h-3.5 object-cover rounded'
                            />
                          )}
                          <span
                            className='text-sm font-bold text-right'
                            style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
                          >
                            {b.flag ? tlaLabel(b.value) : b.value}
                          </span>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

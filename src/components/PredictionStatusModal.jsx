// Admin popup: who has / hasn't submitted their prediction for one match.
// rows: [{ userId, name, photoURL, done }] — pending users shown first, then done.
export default function PredictionStatusModal({ open, onClose, title, rows, loading }) {
  if (!open) return null;

  const pending = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done);

  function avatar(r) {
    return r.photoURL ? (
      <img src={r.photoURL} alt={r.name} className='w-7 h-7 rounded-full object-cover shrink-0' />
    ) : (
      <div
        className='w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0'
        style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}
      >
        {(r.name?.[0] || '?').toUpperCase()}
      </div>
    );
  }

  function section(label, list, color) {
    if (list.length === 0) return null;
    return (
      <div className='mb-3 last:mb-0'>
        <p className='text-xs font-bold uppercase tracking-wider mb-1.5' style={{ color }}>
          {label} ({list.length})
        </p>
        <ul className='flex flex-col gap-1.5'>
          {list.map((r) => (
            <li
              key={r.userId}
              className='flex items-center gap-2.5 rounded-xl px-2.5 py-2'
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              {avatar(r)}
              <span className='text-sm font-medium truncate' style={{ color: 'var(--color-text-primary)' }}>
                {r.name}
              </span>
              <span className='ml-auto text-sm shrink-0' style={{ color }}>
                {r.done ? '✓' : '•'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

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
            Estado de predicciones
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
          ) : rows.length === 0 ? (
            <p className='text-sm text-center py-8' style={{ color: 'var(--color-text-muted)' }}>
              No hay usuarios.
            </p>
          ) : (
            <>
              {section('Pendientes', pending, 'var(--color-accent-red)')}
              {section('Completado', done, 'var(--color-pitch-light)')}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

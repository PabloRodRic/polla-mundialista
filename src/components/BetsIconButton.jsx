// Small "see others' predictions" button — shown on match/award cards.
// Disabled until the World Cup starts (predictions locked); a tooltip explains why.
export default function BetsIconButton({ onClick, disabled = false }) {
  const title = disabled ? 'Disponible cuando arranque el Mundial' : 'Ver pronósticos de otros';
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      className='flex items-center justify-center w-7 h-7 rounded-full transition-colors shrink-0'
      style={{
        color: 'var(--color-text-muted)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--color-surface-hover)';
      }}
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

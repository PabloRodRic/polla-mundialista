import { useState } from 'react';
import logo from '../assets/logo-no-bg.png';

const IOS_STEPS = [
  <>
    Tocá el botón <ShareIcon /> <strong>Compartir</strong> en la barra inferior de Safari.
  </>,
  <>
    Deslizá hacia abajo y elegí <strong>Añadir a pantalla de inicio</strong> <PlusIcon />.
  </>,
  <>
    Tocá <strong>Añadir</strong> arriba a la derecha. ¡Listo!
  </>,
];

const ANDROID_STEPS = [
  <>
    Tocá el menú <DotsIcon /> arriba a la derecha de Chrome.
  </>,
  <>
    Elegí <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.
  </>,
  <>
    Confirmá tocando <strong>Instalar</strong>. ¡Listo!
  </>,
];

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'ios';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  return 'ios';
}

export default function InstallInstructions({ onClose }) {
  const [platform, setPlatform] = useState(detectPlatform);
  const steps = platform === 'android' ? ANDROID_STEPS : IOS_STEPS;
  const title = platform === 'android' ? 'Instalar en Android' : 'Instalar en iPhone o iPad';

  return (
    <div
      className='fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4'
      style={{ background: 'rgba(6, 14, 9, 0.7)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease' }}
      onClick={onClose}
    >
      <div
        className='relative w-full max-w-sm rounded-3xl p-6 pt-7'
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
        <div className='flex items-center gap-3 mb-5 pr-8'>
          <div
            className='flex items-center justify-center w-12 h-12 rounded-2xl shrink-0'
            style={{ background: 'var(--color-pitch-dark)', border: '1px solid var(--color-border)' }}
          >
            <img src={logo} alt='RodGames' className='w-9 h-9 object-contain' />
          </div>
          <h2
            className='text-lg font-black leading-tight uppercase'
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}
          >
            {title}
          </h2>
        </div>

        {/* Platform toggle */}
        <div
          className='flex p-1 rounded-xl mb-5'
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {[
            { key: 'ios', label: 'iPhone / iPad' },
            { key: 'android', label: 'Android' },
          ].map(({ key, label }) => {
            const active = platform === key;
            return (
              <button
                key={key}
                onClick={() => setPlatform(key)}
                className='flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-150'
                style={{
                  fontFamily: 'var(--font-display)',
                  background: active ? 'var(--color-gold)' : 'transparent',
                  color: active ? '#1a1d24' : 'var(--color-text-secondary)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Steps */}
        <ol className='flex flex-col gap-4 mb-6'>
          {steps.map((step, i) => (
            <li key={i} className='flex items-start gap-3'>
              <span
                className='flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold shrink-0'
                style={{
                  fontFamily: 'var(--font-display)',
                  background: 'var(--color-gold)',
                  color: '#1a1d24',
                }}
              >
                {i + 1}
              </span>
              <span className='text-sm leading-relaxed pt-0.5' style={{ color: 'var(--color-text-secondary)' }}>
                {step}
              </span>
            </li>
          ))}
        </ol>

        {/* Confirm */}
        <button
          onClick={onClose}
          className='w-full rounded-xl py-3.5 font-bold text-sm uppercase tracking-wide transition-transform duration-150 active:scale-95'
          style={{
            fontFamily: 'var(--font-display)',
            background: 'var(--color-pitch-light)',
            color: 'var(--color-text-primary)',
          }}
        >
          Entendido
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg className='inline-block w-4 h-4 -mt-0.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M12 16V4M12 4l-4 4M12 4l4 4' strokeLinecap='round' strokeLinejoin='round' />
      <path d='M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className='inline-block w-4 h-4 -mt-0.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M12 5v14M5 12h14' strokeLinecap='round' />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg className='inline-block w-4 h-4 -mt-0.5' viewBox='0 0 24 24' fill='currentColor'>
      <circle cx='12' cy='5' r='1.6' />
      <circle cx='12' cy='12' r='1.6' />
      <circle cx='12' cy='19' r='1.6' />
    </svg>
  );
}

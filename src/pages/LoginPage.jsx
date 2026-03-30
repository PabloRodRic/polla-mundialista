import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import trionda from '../assets/trionda.png';

const FLAGS = [
  { code: 'ar', top: '8%', left: '5%', delay: '0s' },
  { code: 'br', top: '15%', left: '88%', delay: '0.8s' },
  { code: 'fr', top: '70%', left: '3%', delay: '1.4s' },
  { code: 'de', top: '75%', left: '85%', delay: '0.4s' },
  { code: 'ca', top: '40%', left: '92%', delay: '1.1s' },
  { code: 'mx', top: '55%', left: '6%', delay: '0.6s' },
  { code: 'ec', top: '30%', left: '2%', delay: '1.8s' },
  { code: 'us', top: '85%', left: '50%', delay: '0.9s' },
];

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError('No se pudo iniciar sesión. Intentá de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className='relative min-h-dvh flex flex-col items-center justify-center overflow-hidden px-4'
      style={{ background: 'linear-gradient(160deg, #062e1b 0%, #111318 55%, #111318 100%)' }}
    >
      {/* Radial gradient accents */}
      <div className='pointer-events-none absolute inset-0'>
        <div
          className='absolute top-0 left-0 w-96 h-96 rounded-full opacity-20'
          style={{
            background: 'radial-gradient(circle, #0d6b3f 0%, transparent 70%)',
            transform: 'translate(-30%, -30%)',
          }}
        />
        <div
          className='absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-15'
          style={{
            background: 'radial-gradient(circle, #d4a843 0%, transparent 70%)',
            transform: 'translate(30%, 30%)',
          }}
        />
      </div>

      {/* Concentric pitch circles */}
      <div className='pointer-events-none absolute inset-0 flex items-center justify-center opacity-5'>
        {[300, 500, 700, 900].map((size) => (
          <div key={size} className='absolute rounded-full border border-white' style={{ width: size, height: size }} />
        ))}
        <div className='absolute w-0.5 h-full bg-white opacity-50' />
        <div className='absolute w-full h-0.5 bg-white opacity-50' />
      </div>

      {/* Floating flags */}
      {FLAGS.map(({ code, top, left, delay }) => (
        <img
          key={code}
          src={`https://flagcdn.com/w80/${code}.png`}
          alt=''
          className='pointer-events-none absolute w-12 rounded opacity-10'
          style={{
            top,
            left,
            animationDelay: delay,
            animation: 'floatFlag 6s ease-in-out infinite',
          }}
        />
      ))}

      {/* Main card */}
      <div className='relative z-10 w-full max-w-sm flex flex-col items-center gap-6 -mt-50'>
        {/* Spinning trionda */}
        <img
          src={trionda}
          alt='Trionda'
          className='w-16 h-16 object-contain'
          style={{ animation: 'spinSlow 12s linear infinite' }}
        />

        {/* Titles */}
        <div className='text-center'>
          <p
            className='text-xs font-semibold tracking-[0.3em] uppercase mb-1'
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}
          >
            Mundial 2026
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)' }}>
            <span className='block text-3xl font-black' style={{ color: 'var(--color-text-primary)' }}>
              Polla Mundialista
            </span>
            <span className='block text-2xl font-black' style={{ color: 'var(--color-gold)' }}>
              Familia Rodriguez
            </span>
          </h1>
          <p className='mt-3 text-sm leading-relaxed' style={{ color: 'var(--color-text-secondary)' }}>
            Predice los resultados del Mundial 2026
          </p>
        </div>

        {/* Google login button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className='w-full flex items-center justify-center gap-3 rounded-xl px-5 py-3.5 font-semibold text-sm transition-all duration-150 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed'
          style={{
            background: '#ffffff',
            color: '#1a1d24',
            transform: loading ? 'scale(0.98)' : undefined,
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
          onMouseEnter={(e) => !loading && (e.currentTarget.style.transform = 'scale(1.02)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {loading ? (
            <svg className='w-5 h-5 animate-spin' viewBox='0 0 24 24' fill='none'>
              <circle cx='12' cy='12' r='10' stroke='#d4a843' strokeWidth='3' strokeDasharray='30 60' />
            </svg>
          ) : (
            <svg className='w-5 h-5' viewBox='0 0 24 24'>
              <path
                d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
                fill='#4285F4'
              />
              <path
                d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                fill='#34A853'
              />
              <path
                d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z'
                fill='#FBBC05'
              />
              <path
                d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
                fill='#EA4335'
              />
            </svg>
          )}
          {loading ? 'Iniciando sesión...' : 'Continuar con Google'}
        </button>

        {/* Error message */}
        {error && (
          <p
            className='text-sm text-center px-3 py-2 rounded-lg w-full'
            style={{
              color: 'var(--color-accent-red)',
              background: 'rgba(231,76,60,0.1)',
              border: '1px solid rgba(231,76,60,0.3)',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Footer */}
      <p
        className='relative z-10 mt-8 text-xs tracking-widest uppercase'
        style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)', fontSize: '0.6rem' }}
      >
        USA · México · Canadá 2026
      </p>

      <style>{`
        @keyframes floatFlag {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50% { transform: translateY(-12px) rotate(3deg); }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

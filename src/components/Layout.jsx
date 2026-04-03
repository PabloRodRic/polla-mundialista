import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { startAutoSync, stopAutoSync } from '../services/matchSync';
import LeaderboardIcon from '../assets/leaderboard.svg?react';
import FixtureIcon from '../assets/tournament.svg?react';
import RulesIcon from '../assets/rules.svg?react';
import AdminIcon from '../assets/admin.svg?react';
import PredictionIcon from '../assets/prediction.svg?react';

const NAV_TABS = [
  { path: '/pronostico', icon: FixtureIcon, label: 'Pronóstico' },
  { path: '/predictions', icon: PredictionIcon, label: 'Predicciones' },
  { path: '/leaderboard', icon: LeaderboardIcon, label: 'Tabla' },
  { path: '/rules', icon: RulesIcon, label: 'Reglas' },
];

export default function Layout() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Start auto-sync for admin users
  useEffect(() => {
    if (profile?.isAdmin) {
      startAutoSync(true);
      return () => stopAutoSync();
    }
  }, [profile?.isAdmin]);

  const tabs = profile?.isAdmin ? [...NAV_TABS, { path: '/admin', icon: AdminIcon, label: 'Admin' }] : NAV_TABS;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className='min-h-dvh flex flex-col' style={{ background: 'var(--color-surface)' }}>
      {/* Top bar */}
      <header
        className='flex items-center justify-between px-4 py-3 sticky top-0 z-10 backdrop-blur-sm'
        style={{
          background: 'rgba(17,19,24,0.9)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span
          className='text-sm font-semibold tracking-widest uppercase'
          style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
        >
          Polla 2026
        </span>

        <div className='relative'>
          <button onClick={() => setMenuOpen((o) => !o)} className='flex items-center gap-2'>
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className='w-8 h-8 rounded-full object-cover'
                style={{ border: '2px solid var(--color-border)' }}
              />
            ) : (
              <div
                className='w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold'
                style={{ background: 'var(--color-pitch)', color: 'var(--color-gold)' }}
              >
                {user?.displayName?.[0] || '?'}
              </div>
            )}
          </button>

          {menuOpen && (
            <>
              <div className='fixed inset-0 z-10' onClick={() => setMenuOpen(false)} />
              <div
                className='absolute right-0 top-10 z-20 rounded-xl shadow-xl w-44 py-1 text-sm'
                style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
              >
                <div className='px-4 py-2 text-xs truncate' style={{ color: 'var(--color-text-muted)' }}>
                  {user?.displayName}
                </div>
                <div style={{ borderTop: '1px solid var(--color-border)' }} />
                <button
                  onClick={handleLogout}
                  className='w-full text-left px-4 py-2 transition-colors hover:bg-surface-hover'
                  style={{ color: 'var(--color-accent-red)' }}
                >
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Page content */}
      <main className='flex-1 overflow-y-auto' style={{ paddingBottom: '72px' }}>
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav
        className='fixed bottom-0 left-0 right-0 z-10 flex'
        style={{
          background: 'rgba(17,19,24,0.97)',
          borderTop: '1px solid var(--color-border)',
          height: '64px',
          backdropFilter: 'blur(12px)',
        }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className='flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors'
            style={({ isActive }) => ({
              color: isActive ? '#111318' : 'var(--color-text-muted)',
              backgroundColor: isActive ? 'var(--color-gold)' : 'transparent',
            })}
          >
            <tab.icon className='w-5 h-5' style={{ color: 'currentColor' }} />
            <span className='text-[12px] font-medium' style={{ color: 'currentColor' }}>
              {tab.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

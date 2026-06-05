import { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { startAutoSync, stopAutoSync } from '../services/matchSync';
import LeaderboardIcon from '../assets/leaderboard.svg?react';
import FixtureIcon from '../assets/tournament.svg?react';
import RulesIcon from '../assets/rules.svg?react';
import AdminIcon from '../assets/admin.svg?react';
import PredictionIcon from '../assets/prediction.svg?react';
import logo from '../assets/logo-2.png';
import { APP_VERSION } from '../version';

const NAV_TABS = [
  { path: '/pronostico', icon: FixtureIcon, label: 'Pronóstico' },
  { path: '/predicciones', icon: PredictionIcon, label: 'Predicciones' },
  { path: '/tabla', icon: LeaderboardIcon, label: 'Tabla' },
  { path: '/reglas', icon: RulesIcon, label: 'Reglas' },
];

export default function Layout() {
  const { user, profile, logout, updateDisplayName } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const nameInputRef = useRef(null);
  const menuRef = useRef(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Close the profile menu when clicking/tapping anywhere outside it
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

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

  function openEditName() {
    setNameInput(profile?.name || '');
    setEditingName(true);
    setMenuOpen(false);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  async function handleSaveName(e) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== profile?.name) await updateDisplayName(trimmed);
    setEditingName(false);
  }

  return (
    <div className='min-h-dvh flex flex-col' style={{ background: 'var(--color-surface)' }}>
      {/* Top bar */}
      <header
        className='flex items-center justify-between px-4 py-2 sticky top-0 z-10 backdrop-blur-sm'
        style={{
          background: 'var(--color-surface-glass)',
          borderBottom: '1px solid var(--color-border)',
          paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)',
        }}
      >
        <div className='flex items-center gap-1'>
          {/* Logo */}
          <img src={logo} alt='Logo' className='w-8 h-8 object-contain' />
          <span
            className='text-sm font-semibold tracking-widest uppercase'
            style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
          >
            Mundial 2026
          </span>
        </div>
        <div className='flex items-center gap-3'>
          <button
            onClick={toggleTheme}
            className='w-8 h-8 flex items-center justify-center rounded-full transition-colors'
            style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface-hover)' }}
            aria-label='Toggle theme'
          >
            {theme === 'dark' ? (
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='16'
                height='16'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                <circle cx='12' cy='12' r='4' />
                <path d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' />
              </svg>
            ) : (
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='16'
                height='16'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
              </svg>
            )}
          </button>

          <div className='relative' ref={menuRef}>
            <button onClick={() => setMenuOpen((o) => !o)} className='flex items-center gap-2'>
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={profile?.name}
                  className='w-8 h-8 rounded-full object-cover'
                  style={{ border: '2px solid var(--color-border)' }}
                />
              ) : (
                <div
                  className='w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold'
                  style={{ background: 'var(--color-pitch)', color: 'var(--color-gold)' }}
                >
                  {profile?.name?.[0] || '?'}
                </div>
              )}
            </button>

            {menuOpen && (
              <div
                className='absolute right-0 top-11 z-30 w-64 rounded-2xl overflow-hidden text-sm'
                style={{
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                }}
              >
                {/* Profile header */}
                <div className='flex items-center gap-3 px-4 py-3'>
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={profile?.name}
                      className='w-10 h-10 rounded-full object-cover shrink-0'
                      style={{ border: '2px solid var(--color-border)' }}
                    />
                  ) : (
                    <div
                      className='w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0'
                      style={{ background: 'var(--color-pitch)', color: 'var(--color-gold)' }}
                    >
                      {profile?.name?.[0] || '?'}
                    </div>
                  )}
                  <div className='min-w-0'>
                    <p
                      className='font-semibold truncate'
                      style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
                    >
                      {profile?.name || 'Jugador'}
                    </p>
                    {user?.email && (
                      <p className='text-xs truncate' style={{ color: 'var(--color-text-muted)' }}>
                        {user.email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className='py-1' style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button
                    onClick={openEditName}
                    className='w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover'
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <svg
                      className='w-4 h-4 shrink-0'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    >
                      <path d='M12 20h9' />
                      <path d='M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z' />
                    </svg>
                    Cambiar nombre
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className='w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover'
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <svg
                      className='w-4 h-4 shrink-0'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    >
                      <path d='M21 12a9 9 0 1 1-2.64-6.36' />
                      <path d='M21 3v6h-6' />
                    </svg>
                    Actualizar app
                  </button>
                </div>

                {/* Sign out */}
                <div className='py-1' style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button
                    onClick={handleLogout}
                    className='w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover'
                    style={{ color: 'var(--color-accent-red)' }}
                  >
                    <svg
                      className='w-4 h-4 shrink-0'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    >
                      <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
                      <path d='M16 17l5-5-5-5' />
                      <path d='M21 12H9' />
                    </svg>
                    Cerrar sesión
                  </button>
                </div>

                {/* Footer */}
                <div
                  className='flex items-center justify-between px-4 py-2'
                  style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                >
                  <span
                    className='text-[10px] uppercase tracking-widest'
                    style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)' }}
                  >
                    RodGames
                  </span>
                  <span className='text-[10px]' style={{ color: 'var(--color-text-muted)' }}>
                    v{APP_VERSION}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main
        className='flex-1 overflow-y-auto'
        style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom) * 0.5)' }}
      >
        <Outlet />
      </main>

      {/* Edit name modal */}
      {editingName && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center'
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setEditingName(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveName}
            className='rounded-2xl p-6 w-72 flex flex-col gap-4'
            style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
          >
            <p className='text-sm font-semibold' style={{ color: 'var(--color-text)' }}>
              Cambiar nombre
            </p>
            <input
              ref={nameInputRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={40}
              className='rounded-lg px-3 py-2 text-sm outline-none w-full'
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <div className='flex gap-2 justify-end'>
              <button
                type='button'
                onClick={() => setEditingName(false)}
                className='px-4 py-1.5 rounded-lg text-sm'
                style={{ color: 'var(--color-text-muted)' }}
              >
                Cancelar
              </button>
              <button
                type='submit'
                className='px-4 py-1.5 rounded-lg text-sm font-semibold'
                style={{ background: 'var(--color-gold)', color: '#111318' }}
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav
        className='fixed bottom-0 left-0 right-0 z-10 flex'
        style={{
          background: 'var(--color-surface-glass)',
          borderTop: '1px solid var(--color-border)',
          height: 'calc(64px + env(safe-area-inset-bottom) * 0.5)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) * 0.5)',
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

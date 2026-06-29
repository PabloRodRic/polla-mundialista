import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';

// Routes are code-split so each page loads on demand — keeps the initial bundle small
// (the heavy admin panel and bracket page no longer ship to everyone up front).
const MatchesPage = lazy(() => import('./pages/MatchesPage'));
const PredictionsPage = lazy(() => import('./pages/PredictionsPage'));
const FixturePage = lazy(() => import('./pages/FixturePage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
const RulesPage = lazy(() => import('./pages/RulesPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function LoadingScreen() {
  return (
    <div className='min-h-dvh flex items-center justify-center' style={{ background: 'var(--color-surface)' }}>
      <svg className='w-10 h-10 animate-spin' viewBox='0 0 24 24' fill='none'>
        <circle cx='12' cy='12' r='10' stroke='#d4a843' strokeWidth='3' strokeDasharray='30 60' />
      </svg>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginPage />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to='/partidos' replace />} />
          <Route path='/partidos' element={<MatchesPage />} />
          <Route path='/pronostico' element={<FixturePage />} />
          <Route path='/predicciones' element={<PredictionsPage />} />
          <Route path='/tabla' element={<LeaderboardPage />} />
          <Route path='/grupos' element={<GroupsPage />} />
          <Route path='/reglas' element={<RulesPage />} />
          <Route path='/admin' element={<AdminPage />} />
          <Route path='*' element={<Navigate to='/partidos' replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

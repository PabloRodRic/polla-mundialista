import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import MatchesPage from './pages/MatchesPage';
import PredictionsPage from './pages/PredictionsPage';
import FixturePage from './pages/FixturePage';
import LeaderboardPage from './pages/LeaderboardPage';
import RulesPage from './pages/RulesPage';
import AdminPage from './pages/AdminPage';

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
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to='/pronostico' replace />} />
        <Route path='/partidos' element={<MatchesPage />} />
        <Route path='/pronostico' element={<FixturePage />} />
        <Route path='/predicciones' element={<PredictionsPage />} />
        <Route path='/tabla' element={<LeaderboardPage />} />
        <Route path='/reglas' element={<RulesPage />} />
        <Route path='/admin' element={<AdminPage />} />
        <Route path='*' element={<Navigate to='/pronostico' replace />} />
      </Route>
    </Routes>
  );
}

import './index.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import { ShepherdsList, ShepherdDetail } from './pages/Shepherds';
import { SheepList, SheepDetail } from './pages/Sheep';
import { BacentasList, BacentaDetail } from './pages/Bacentas';
import { BasonstasList, BasontaDetail } from './pages/Basontas';
import FirstTimers from './pages/FirstTimers';
import Chat from './pages/Chat';
import { CampaignsList, CampaignDetail } from './pages/Campaigns';
import { Settings } from './pages/Misc';
import CalendarPage from './pages/Calendar';
import DuplicateManager from './pages/DuplicateManager';

// ─── Protected layout — only renders if user is logged in ────────────────────
function ProtectedApp() {
  const { user } = useAuth();

  // Still loading session
  if (user === undefined) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)',
      }}>
        <div style={{
          width: 36, height: 36, border: '3px solid var(--border)',
          borderTopColor: 'var(--gold)', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Not logged in — show login page
  if (!user) return <Login />;

  // Logged in — show the full app
  return (
    <>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/shepherds" element={<ShepherdsList />} />
          <Route path="/shepherds/:id" element={<ShepherdDetail />} />
          <Route path="/sheep" element={<SheepList />} />
          <Route path="/sheep/:id" element={<SheepDetail />} />
          <Route path="/bacentas" element={<BacentasList />} />
          <Route path="/bacentas/:id" element={<BacentaDetail />} />
          <Route path="/basontas" element={<BasonstasList />} />
          <Route path="/basontas/:name" element={<BasontaDetail />} />
          <Route path="/first-timers" element={<FirstTimers />} />
          <Route path="/campaigns" element={<CampaignsList />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/duplicates" element={<DuplicateManager />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

// ─── Root — wraps everything in Auth + Router ─────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedApp />
      </AuthProvider>
    </BrowserRouter>
  );
}

import './index.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

export default function App() {
  return (
    <BrowserRouter>
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
        </Routes>
      </div>
    </BrowserRouter>
  );
}

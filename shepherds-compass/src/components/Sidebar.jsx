import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Users, BookOpen, Music, MessageSquare, LayoutDashboard, UserPlus, Megaphone, Settings, Calendar } from 'lucide-react';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/shepherds', icon: Users, label: 'Shepherds' },
  { to: '/sheep', icon: BookOpen, label: 'Sheep (Members)' },
  { to: '/bacentas', icon: BookOpen, label: 'Bacentas' },
  { to: '/basontas', icon: Music, label: 'Basontas' },
  { to: '/first-timers', icon: UserPlus, label: 'First Timers' },
  { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
  { to: '/calendar', icon: Calendar, label: 'Calendar & Tasks' },
  { to: '/chat', icon: MessageSquare, label: 'AI Assistant' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const mobileLinks = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/shepherds', icon: Users, label: 'Shepherds' },
  { to: '/sheep', icon: BookOpen, label: 'Sheep' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/chat', icon: MessageSquare, label: 'AI' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return isMobile;
}

export default function Sidebar() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <nav style={{
          display: 'flex', position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--bg2)', borderTop: '1px solid var(--border)',
          zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {mobileLinks.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 4px',
              color: isActive ? 'var(--gold)' : 'var(--text3)',
              fontSize: 10, fontWeight: isActive ? 600 : 400,
              flex: 1, transition: 'color 0.15s', textDecoration: 'none',
            })}>
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
      </>
    );
  }

  return (
    <aside style={{
      width: 'var(--sidebar-w)', background: 'var(--bg2)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
    }}>
      <div style={{ padding: '28px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 4 }}>Chief Shepherd</div>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
          Shepherd's<br />Compass
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8, marginBottom: 2,
            color: isActive ? 'var(--gold)' : 'var(--text2)',
            background: isActive ? 'var(--gold-dim)' : 'transparent',
            fontSize: 13, fontWeight: isActive ? 500 : 400,
            transition: 'all 0.15s', textDecoration: 'none',
          })}>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', color: 'var(--text3)', fontSize: 11 }}>
        Shepherd's Compass v1.1
      </div>
    </aside>
  );
}

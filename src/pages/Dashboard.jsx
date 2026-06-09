import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { Users, BookOpen, Music, UserPlus, CheckCircle, Clock } from 'lucide-react';
import { Card, StatBox, PageHeader, Badge, Loader } from '../components/ui';
import { format, parseISO } from 'date-fns';

export default function Dashboard() {
  const [stats, setStats] = useState({});
  const [recentTasks, setRecentTasks] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [
        { count: shepherdCount },
        { count: sheepCount },
        { count: bacentaCount },
        { count: firstTimerCount },
        { data: tasks },
        { count: doneTasks },
        { count: pendingTasks },
        { data: allSheep },
      ] = await Promise.all([
        supabase.from('shepherds').select('*', { count: 'exact', head: true }),
        // Members = active sheep who are NOT shepherds (shepherds shown separately)
        supabase.from('sheep').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('is_shepherd', false),
        supabase.from('bacentas').select('*', { count: 'exact', head: true }),
        supabase.from('sheep').select('*', { count: 'exact', head: true }).eq('first_timer', true),
        supabase.from('shepherd_tasks').select('*, shepherds(name)').order('created_at', { ascending: false }).limit(6),
        supabase.from('shepherd_tasks').select('*', { count: 'exact', head: true }).eq('status', 'done'),
        supabase.from('shepherd_tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('sheep').select('id, name, date_of_birth, shepherd_id').eq('is_active', true).eq('is_shepherd', false),
      ]);

      // Total congregation:
      //   - All active sheep (includes those marked is_shepherd=true who were promoted from members)
      //   - Plus shepherds who were added directly (they have no sheep record)
      const { count: allSheepCount } = await supabase.from('sheep').select('*', { count: 'exact', head: true }).eq('is_active', true);
      const { data: shepherdIds } = await supabase.from('sheep').select('shepherd_id').eq('is_shepherd', true).not('shepherd_id', 'is', null);
      const promotedIds = new Set((shepherdIds || []).map(r => r.shepherd_id));
      const directShepherds = (shepherdCount || 0) - promotedIds.size;
      const totalAttendance = (allSheepCount || 0) + Math.max(0, directShepherds);

      setStats({ shepherdCount, sheepCount, bacentaCount, firstTimerCount, doneTasks, pendingTasks, totalAttendance });
      setRecentTasks(tasks || []);

      // Birthday check
      const today = new Date();
      const bdays = (allSheep || []).filter(m => {
        if (!m.date_of_birth) return false;
        try {
          const d = parseISO(m.date_of_birth);
          return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
        } catch { return false; }
      });
      setBirthdays(bdays);

      // Unassigned sheep
      setUnassigned((allSheep || []).filter(m => !m.shepherd_id));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader /></div>;

  const statusColor = { pending: 'var(--amber)', in_progress: 'var(--blue)', done: 'var(--green)' };

  return (
    <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
      <PageHeader
        title="Good Shepherd's Overview"
        subtitle={`Welcome back, Chief Shepherd. Here's what's happening today.`}
      />

      {/* Birthday banner */}
      {birthdays.length > 0 && (
        <div style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid var(--gold)', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🎂</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>
              {birthdays.length === 1 ? 'Birthday Today!' : `${birthdays.length} Birthdays Today!`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
              {birthdays.map(m => m.name).join(' · ')}
            </div>
          </div>
          <button onClick={() => navigate('/sheep?filter=birthday_today')} style={{ background: 'none', color: 'var(--gold)', fontSize: 12, cursor: 'pointer', border: '1px solid var(--gold)', borderRadius: 6, padding: '6px 14px' }}>
            View Members
          </button>
        </div>
      )}

      {/* Unassigned banner */}
      {unassigned.length > 0 && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, color: 'var(--red)' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>
              {unassigned.length} member{unassigned.length > 1 ? 's' : ''} without a shepherd
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {unassigned.slice(0, 5).map(m => m.name).join(', ')}{unassigned.length > 5 ? ` +${unassigned.length - 5} more` : ''}
            </div>
          </div>
          <button onClick={() => navigate('/sheep')} style={{ background: 'none', color: 'var(--red)', fontSize: 12, cursor: 'pointer', border: '1px solid var(--red)', borderRadius: 6, padding: '6px 14px' }}>
            Assign Shepherds
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatBox label="Total Congregation" value={stats.totalAttendance || 0} icon={<Users size={20} />} color="var(--gold)" />
        <StatBox label="Active Members" value={stats.sheepCount || 0} icon={<BookOpen size={20} />} color="var(--blue)" />
        <StatBox label="Shepherds" value={stats.shepherdCount || 0} icon={<Users size={20} />} color="var(--green)" />
        <StatBox label="First Timers" value={stats.firstTimerCount || 0} icon={<UserPlus size={20} />} color="var(--amber)" />
        <StatBox label="Tasks Done" value={stats.doneTasks || 0} icon={<CheckCircle size={20} />} color="var(--green)" />
        <StatBox label="Tasks Pending" value={stats.pendingTasks || 0} icon={<Clock size={20} />} color="var(--red)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Recent Tasks</h3>
          {recentTasks.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>No tasks yet.</p>
          ) : recentTasks.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.shepherds?.name}</div>
              </div>
              <Badge color={statusColor[t.status]}>{t.status}</Badge>
            </div>
          ))}
        </Card>

        <Card>
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Quick Navigation</h3>
          {[
            { label: '+ Add Shepherd', path: '/shepherds', color: 'var(--gold)' },
            { label: '+ Add Member (Sheep)', path: '/sheep', color: 'var(--blue)' },
            { label: '+ Add First Timer', path: '/first-timers', color: 'var(--amber)' },
            { label: '+ Add Bacenta', path: '/bacentas', color: 'var(--green)' },
            { label: '📣 View Campaigns', path: '/campaigns', color: 'var(--text2)' },
            { label: '💬 Open AI Chat', path: '/chat', color: 'var(--text2)' },
          ].map(item => (
            <button key={item.path} onClick={() => navigate(item.path)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 0', background: 'none',
              color: item.color, fontSize: 13, borderBottom: '1px solid var(--border)',
              fontWeight: 500, cursor: 'pointer',
            }}>
              {item.label}
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}
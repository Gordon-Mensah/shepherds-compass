import { useState, useEffect } from 'react';
import { useDbRefresh } from '../useDbRefresh';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { Users, BookOpen, Music, UserPlus, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Card, StatBox, PageHeader, Badge, Loader } from '../components/ui';

export default function Dashboard() {
  const [stats, setStats] = useState({});
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useDbRefresh(load);

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
      ] = await Promise.all([
        supabase.from('shepherds').select('*', { count: 'exact', head: true }),
        supabase.from('sheep').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('bacentas').select('*', { count: 'exact', head: true }),
        supabase.from('sheep').select('*', { count: 'exact', head: true }).eq('first_timer', true),
        supabase.from('shepherd_tasks').select('*, shepherds(name)').order('created_at', { ascending: false }).limit(6),
        supabase.from('shepherd_tasks').select('*', { count: 'exact', head: true }).eq('status', 'done'),
        supabase.from('shepherd_tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      setStats({ shepherdCount, sheepCount, bacentaCount, firstTimerCount, doneTasks, pendingTasks });
      setRecentTasks(tasks || []);
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatBox label="Active Shepherds" value={stats.shepherdCount || 0} icon={<Users size={20} />} color="var(--gold)" />
        <StatBox label="Church Members" value={stats.sheepCount || 0} icon={<BookOpen size={20} />} color="var(--blue)" />
        <StatBox label="Bacentas" value={stats.bacentaCount || 0} icon={<Music size={20} />} color="var(--green)" />
        <StatBox label="First Timers" value={stats.firstTimerCount || 0} icon={<UserPlus size={20} />} color="var(--amber)" />
        <StatBox label="Tasks Done" value={stats.doneTasks || 0} icon={<CheckCircle size={20} />} color="var(--green)" />
        <StatBox label="Tasks Pending" value={stats.pendingTasks || 0} icon={<Clock size={20} />} color="var(--red)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Recent Tasks</h3>
          {recentTasks.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>No tasks yet. Start by assigning tasks to shepherds.</p>
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
            { label: 'Open AI Chat', path: '/chat', color: 'var(--text2)' },
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
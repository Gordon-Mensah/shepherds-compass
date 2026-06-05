import SectionChat from '../components/SectionChat';
import { useState, useEffect } from 'react';
import { useDbRefresh } from '../useDbRefresh';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { generateShepherdSummary } from '../groq';
import { BASONTAS, TASK_TYPES, STATUS_COLORS } from '../constants';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader, GoodBadBetter } from '../components/ui';
import { Plus, ArrowLeft, CheckCircle, Clock, User, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

// ─── List ─────────────────────────────────────────────────────────
export function ShepherdsList() {
  const [shepherds, setShepherds] = useState([]);
  const [bacentas, setBacentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useDbRefresh(load, 'shepherds');

  async function load() {
    setLoading(true);
    const [{ data: sh }, { data: bac }] = await Promise.all([
      supabase.from('shepherds').select('*, bacentas(name)').order('name'),
      supabase.from('bacentas').select('id, name').order('name'),
    ]);
    setShepherds(sh || []);
    setBacentas(bac || []);
    setLoading(false);
  }

  async function addShepherd(data) {
    await supabase.from('shepherds').insert(data);
    setShowModal(false);
    load();
  }

  if (loading) return <Loader />;

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <PageHeader title="Shepherds" subtitle={`${shepherds.length} shepherd${shepherds.length !== 1 ? 's' : ''} registered`}
        actions={<Btn onClick={() => setShowModal(true)}><Plus size={14} /> Add Shepherd</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {shepherds.map(s => (
          <Card key={s.id} onClick={() => navigate(`/shepherds/${s.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>{s.bacentas?.name || 'No bacenta'}</p>
              </div>
              <Badge color={s.role === 'leader' ? 'var(--gold)' : 'var(--blue)'}>{s.role}</Badge>
            </div>
            {s.phone && <p style={{ fontSize: 12, color: 'var(--text3)' }}>📞 {s.phone}</p>}
            {s.basonta && (
              <div style={{ marginTop: 8 }}>
                <Badge color={s.basonta_role === 'basonta_shepherd' ? 'var(--gold)' : 'var(--text2)'}>
                  {s.basonta_role === 'basonta_shepherd' ? '⭐ ' : ''}{s.basonta}
                </Badge>
              </div>
            )}
          </Card>
        ))}
        {shepherds.length === 0 && <EmptyState message="No shepherds yet. Add your first shepherd." icon="🐑" />}
      </div>

      {showModal && (
        <ShepherdModal bacentas={bacentas} onSave={addShepherd} onClose={() => setShowModal(false)} />
      )}
      <SectionChat section="shepherds" />
    </div>
  );
}

// ─── Detail ───────────────────────────────────────────────────────
export function ShepherdDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shepherd, setShepherd] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [sheep, setSheep] = useState([]);
  const [visits, setVisits] = useState([]);
  const [outreach, setOutreach] = useState([]);
  const [aiSummary, setAiSummary] = useState('');
  const [tab, setTab] = useState('tasks');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [bacentas, setBacentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const groqKey = localStorage.getItem('groq_key') || '';

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: sh }, { data: tk }, { data: sp }, { data: vi }, { data: or }, { data: bac }] = await Promise.all([
      supabase.from('shepherds').select('*, bacentas(name)').eq('id', id).single(),
      supabase.from('shepherd_tasks').select('*').eq('shepherd_id', id).order('created_at', { ascending: false }),
      supabase.from('sheep').select('*').eq('shepherd_id', id).order('name'),
      supabase.from('sheep_visits').select('*, sheep(name)').eq('shepherd_id', id).order('created_at', { ascending: false }),
      supabase.from('outreach_reports').select('*').eq('shepherd_id', id).order('date', { ascending: false }),
      supabase.from('bacentas').select('id, name').order('name'),
    ]);
    setShepherd(sh);
    setTasks(tk || []);
    setSheep(sp || []);
    setVisits(vi || []);
    setOutreach(or || []);
    setBacentas(bac || []);
    setLoading(false);
  }

  async function getAISummary() {
    setAiSummary('Loading...');
    const summary = await generateShepherdSummary(shepherd, tasks, visits, groqKey);
    setAiSummary(summary);
  }

  async function addTask(data) {
    await supabase.from('shepherd_tasks').insert({ ...data, shepherd_id: id });
    setShowTaskModal(false);
    load();
  }

  async function updateTaskStatus(taskId, status) {
    await supabase.from('shepherd_tasks').update({ status, completed_at: status === 'done' ? new Date().toISOString() : null }).eq('id', taskId);
    load();
  }

  async function addOutreach(data) {
    await supabase.from('outreach_reports').insert({ ...data, shepherd_id: id });
    setShowOutreachModal(false);
    load();
  }

  if (loading) return <Loader />;
  if (!shepherd) return <p style={{ padding: 32, color: 'var(--text2)' }}>Shepherd not found.</p>;

  const done = tasks.filter(t => t.status === 'done').length;
  const pending = tasks.filter(t => t.status === 'pending').length;

  const tabs = [
    { key: 'tasks', label: `Tasks (${tasks.length})` },
    { key: 'sheep', label: `Sheep (${sheep.length})` },
    { key: 'visits', label: `Visit Reports (${visits.length})` },
    { key: 'outreach', label: `Outreach (${outreach.length})` },
  ];

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <button onClick={() => navigate('/shepherds')} style={{ background: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
        <ArrowLeft size={14} /> Back to Shepherds
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontFamily: 'Cormorant Garamond, serif' }}>{shepherd.name}</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Badge color={shepherd.role === 'leader' ? 'var(--gold)' : 'var(--blue)'}>{shepherd.role}</Badge>
            {shepherd.bacentas && <Badge color="var(--text2)">{shepherd.bacentas.name}</Badge>}
            {shepherd.basonta && (
              <Badge color={shepherd.basonta_role === 'basonta_shepherd' ? 'var(--gold)' : 'var(--blue)'}>
                {shepherd.basonta_role === 'basonta_shepherd' ? '⭐ Basonta Shepherd — ' : ''}{shepherd.basonta}
              </Badge>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ textAlign: 'center', background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 18px' }}>
            <div style={{ fontSize: 22, color: 'var(--green)', fontFamily: 'Cormorant Garamond, serif', fontWeight: 700 }}>{done}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>Done</div>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 18px' }}>
            <div style={{ fontSize: 22, color: 'var(--amber)', fontFamily: 'Cormorant Garamond, serif', fontWeight: 700 }}>{pending}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>Pending</div>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      <Card style={{ marginBottom: 20, borderColor: aiSummary ? 'var(--gold)' : 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} color="var(--gold)" /> AI Performance Summary</h4>
          <Btn size="sm" variant="ghost" onClick={getAISummary}>Generate</Btn>
        </div>
        {aiSummary && <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{aiSummary}</p>}
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', background: 'none', fontSize: 13,
            color: tab === t.key ? 'var(--gold)' : 'var(--text2)',
            borderBottom: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
            cursor: 'pointer', fontWeight: tab === t.key ? 500 : 400, marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" onClick={() => setShowTaskModal(true)}><Plus size={12} /> Assign Task</Btn>
          </div>
          {tasks.map(task => (
            <Card key={task.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{task.title}</span>
                    <Badge color={TASK_TYPES[task.task_type]?.color || 'var(--text2)'}>{TASK_TYPES[task.task_type]?.label}</Badge>
                  </div>
                  {task.description && <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{task.description}</p>}
                  {task.due_date && <p style={{ fontSize: 11, color: 'var(--text3)' }}>Due: {format(new Date(task.due_date), 'dd MMM yyyy')}</p>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {task.status !== 'done' && (
                    <Btn size="sm" variant="ghost" onClick={() => updateTaskStatus(task.id, task.status === 'pending' ? 'in_progress' : 'done')}>
                      {task.status === 'pending' ? 'Start' : 'Done'}
                    </Btn>
                  )}
                  <Badge color={STATUS_COLORS[task.status]}>{task.status}</Badge>
                </div>
              </div>
            </Card>
          ))}
          {tasks.length === 0 && <EmptyState message="No tasks assigned yet." icon="✅" />}
        </div>
      )}

      {/* Sheep tab */}
      {tab === 'sheep' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {sheep.map(s => (
            <Card key={s.id} onClick={() => navigate(`/sheep/${s.id}`)}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{s.phone}</div>
              {s.basonta && <Badge color="var(--blue)" style={{ marginTop: 6 }}>{s.basonta}</Badge>}
            </Card>
          ))}
          {sheep.length === 0 && <EmptyState message="No sheep assigned to this shepherd." icon="🐑" />}
        </div>
      )}

      {/* Visits tab */}
      {tab === 'visits' && (
        <div>
          {visits.map(v => (
            <Card key={v.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>{v.sheep?.name}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Badge color={v.visit_type === 'tele_pastor' ? 'var(--gold)' : 'var(--green)'}>{v.visit_type === 'tele_pastor' ? 'Tele-Pastor' : 'Visit'}</Badge>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{format(new Date(v.visited_at), 'dd MMM yyyy')}</span>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>{v.report}</p>
            </Card>
          ))}
          {visits.length === 0 && <EmptyState message="No visit reports yet." icon="🏠" />}
        </div>
      )}

      {/* Outreach tab */}
      {tab === 'outreach' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" onClick={() => setShowOutreachModal(true)}><Plus size={12} /> Add Report</Btn>
          </div>
          {outreach.map(o => (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>{o.location || 'Outreach'}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{format(new Date(o.date), 'dd MMM yyyy')}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>👥 Reached: {o.people_reached}</span>
                <span style={{ fontSize: 12, color: 'var(--amber)' }}>✨ First timers: {o.first_timers_gained}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>{o.report}</p>
            </Card>
          ))}
          {outreach.length === 0 && <EmptyState message="No outreach reports yet." icon="🌍" />}
        </div>
      )}

      {showTaskModal && <TaskModal onSave={addTask} onClose={() => setShowTaskModal(false)} />}
      {showOutreachModal && <OutreachModal onSave={addOutreach} onClose={() => setShowOutreachModal(false)} />}
      <SectionChat section="shepherds" pageContext={{ currentId: id }} />
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────
function ShepherdModal({ onSave, onClose, bacentas }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '', email: '', role: 'shepherd', bacenta_id: '', basonta: '', basonta_role: 'member' });
  const s = k => v => setForm(f => ({ ...f, [k]: v.target.value }));
  return (
    <Modal title="Add Shepherd" onClose={onClose}>
      <FormField label="Full Name *"><input value={form.name} onChange={s('name')} /></FormField>
      <FormField label="Phone"><input value={form.phone} onChange={s('phone')} /></FormField>
      <FormField label="Address"><input value={form.address} onChange={s('address')} placeholder="Can be added later" /></FormField>
      <FormField label="Email"><input value={form.email} onChange={s('email')} /></FormField>
      <FormField label="Role">
        <select value={form.role} onChange={s('role')}>
          <option value="shepherd">Shepherd</option>
          <option value="leader">Leader</option>
        </select>
      </FormField>
      <FormField label="Bacenta">
        <select value={form.bacenta_id} onChange={s('bacenta_id')}>
          <option value="">None</option>
          {bacentas.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </FormField>
      <FormField label="Basonta (Activity Group)">
        <select value={form.basonta} onChange={s('basonta')}>
          <option value="">None</option>
          {BASONTAS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </FormField>
      {form.basonta && (
        <FormField label="Role in Basonta">
          <select value={form.basonta_role} onChange={s('basonta_role')}>
            <option value="member">Member</option>
            <option value="basonta_shepherd">Basonta Shepherd (Leader)</option>
          </select>
        </FormField>
      )}
      <Btn onClick={() => form.name && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Save Shepherd</Btn>
    </Modal>
  );
}

function TaskModal({ onSave, onClose }) {
  const [form, setForm] = useState({ title: '', description: '', task_type: 'general', due_date: '' });
  const s = k => v => setForm(f => ({ ...f, [k]: v.target.value }));
  return (
    <Modal title="Assign Task" onClose={onClose}>
      <FormField label="Task Title *"><input value={form.title} onChange={s('title')} /></FormField>
      <FormField label="Description"><textarea value={form.description} onChange={s('description')} /></FormField>
      <FormField label="Task Type">
        <select value={form.task_type} onChange={s('task_type')}>
          {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </FormField>
      <FormField label="Due Date"><input type="date" value={form.due_date} onChange={s('due_date')} /></FormField>
      <Btn onClick={() => form.title && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Assign Task</Btn>
    </Modal>
  );
}

function OutreachModal({ onSave, onClose }) {
  const [form, setForm] = useState({ location: '', date: new Date().toISOString().slice(0, 10), people_reached: 0, first_timers_gained: 0, report: '' });
  const s = k => v => setForm(f => ({ ...f, [k]: v.target.value }));
  return (
    <Modal title="Add Outreach Report" onClose={onClose}>
      <FormField label="Location"><input value={form.location} onChange={s('location')} /></FormField>
      <FormField label="Date"><input type="date" value={form.date} onChange={s('date')} /></FormField>
      <FormField label="People Reached"><input type="number" value={form.people_reached} onChange={s('people_reached')} /></FormField>
      <FormField label="First Timers Gained"><input type="number" value={form.first_timers_gained} onChange={s('first_timers_gained')} /></FormField>
      <FormField label="Report *"><textarea value={form.report} onChange={s('report')} placeholder="Describe the outreach..." /></FormField>
      <Btn onClick={() => form.report && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Save Report</Btn>
    </Modal>
  );
}
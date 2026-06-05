import SectionChat from '../components/SectionChat';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader, GoodBadBetter } from '../components/ui';
import { Plus, ArrowLeft, Users, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_COLOR = { planning: 'var(--text2)', active: 'var(--green)', completed: 'var(--blue)' };
const TASK_STATUS_COLOR = { pending: 'var(--amber)', in_progress: 'var(--blue)', done: 'var(--green)' };

// ─── Campaigns List ────────────────────────────────────────────────
export function CampaignsList() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('campaigns').select('*').order('name');
    setCampaigns(data || []);
    setLoading(false);
  }

  async function add(form) {
    await supabase.from('campaigns').insert(form);
    setShowModal(false);
    load();
  }

  const filtered = campaigns.filter(c => filter === 'all' || c.status === filter);

  if (loading) return <Loader />;

  return (
    <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
      <PageHeader
        title="Campaigns"
        subtitle={`${campaigns.length} campaigns from Dag Heward-Mills' Double Mega Missionary Church`}
        actions={<Btn onClick={() => setShowModal(true)}><Plus size={14} /> New Campaign</Btn>}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {['all', 'planning', 'active', 'completed'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            background: filter === s ? 'var(--gold)' : 'var(--surface)',
            color: filter === s ? '#0b0f14' : 'var(--text2)',
            border: '1px solid var(--border)',
          }}>
            {s === 'all' ? `All (${campaigns.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${campaigns.filter(c => c.status === s).length})`}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {filtered.map(c => (
          <Card key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, flex: 1, paddingRight: 10 }}>{c.name}</h3>
              <Badge color={STATUS_COLOR[c.status]}>{c.status}</Badge>
            </div>
            {c.description && (
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
                {c.description.length > 100 ? c.description.slice(0, 100) + '…' : c.description}
              </p>
            )}
            {(c.start_date || c.end_date) && (
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                {c.start_date && format(new Date(c.start_date), 'dd MMM yyyy')}
                {c.end_date && ` → ${format(new Date(c.end_date), 'dd MMM yyyy')}`}
              </p>
            )}
          </Card>
        ))}
        {filtered.length === 0 && <EmptyState message="No campaigns match this filter." icon="📣" />}
      </div>

      {showModal && (
        <Modal title="New Campaign" onClose={() => setShowModal(false)}>
          <CampaignForm onSave={add} onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </div>
  );
}

// ─── Campaign Detail ───────────────────────────────────────────────
export function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [managers, setManagers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [allShepherds, setAllShepherds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: camp }, { data: mgrs }, { data: tks }, { data: sh }] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).single(),
      supabase.from('campaign_managers').select('*, shepherds(id, name, role)').eq('campaign_id', id),
      supabase.from('campaign_tasks').select('*, shepherds(name)').eq('campaign_id', id).order('created_at', { ascending: false }),
      supabase.from('shepherds').select('id, name, role').order('name'),
    ]);
    setCampaign(camp);
    setManagers(mgrs || []);
    setTasks(tks || []);
    setAllShepherds(sh || []);
    setLoading(false);
  }

  async function addManager({ shepherd_id, role }) {
    await supabase.from('campaign_managers').insert({ campaign_id: id, shepherd_id, role });
    setShowManagerModal(false);
    load();
  }

  async function removeManager(managerId) {
    await supabase.from('campaign_managers').delete().eq('id', managerId);
    load();
  }

  async function addTask(data) {
    await supabase.from('campaign_tasks').insert({ ...data, campaign_id: id });
    setShowTaskModal(false);
    load();
  }

  async function updateTaskStatus(taskId, status) {
    await supabase.from('campaign_tasks').update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', taskId);
    load();
  }

  async function updateCampaign(form) {
    await supabase.from('campaigns').update(form).eq('id', id);
    setShowEditModal(false);
    load();
  }

  if (loading) return <Loader />;
  if (!campaign) return <p style={{ padding: 32, color: 'var(--text2)' }}>Campaign not found.</p>;

  const done = tasks.filter(t => t.status === 'done').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'managers', label: `Managers (${managers.length})` },
    { key: 'tasks', label: `Tasks (${tasks.length})` },
  ];

  const assignedShepherdIds = new Set(managers.map(m => m.shepherd_id));

  return (
    <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
      <button onClick={() => navigate('/campaigns')} style={{ background: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
        <ArrowLeft size={14} /> Back to Campaigns
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 26, fontFamily: 'Cormorant Garamond, serif' }}>{campaign.name}</h1>
            <Badge color={STATUS_COLOR[campaign.status]}>{campaign.status}</Badge>
          </div>
          {campaign.description && <p style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 600, lineHeight: 1.7 }}>{campaign.description}</p>}
          {(campaign.start_date || campaign.end_date) && (
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
              📅 {campaign.start_date ? format(new Date(campaign.start_date), 'dd MMM yyyy') : 'TBD'}
              {campaign.end_date && ` → ${format(new Date(campaign.end_date), 'dd MMM yyyy')}`}
            </p>
          )}
        </div>
        <Btn size="sm" variant="ghost" onClick={() => setShowEditModal(true)}>Edit</Btn>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Managers', value: managers.length, color: 'var(--gold)' },
          { label: 'Tasks Done', value: done, color: 'var(--green)' },
          { label: 'In Progress', value: inProgress, color: 'var(--blue)' },
          { label: 'Pending', value: pending, color: 'var(--amber)' },
        ].map(s => (
          <Card key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontFamily: 'Cormorant Garamond, serif', color: s.color, fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text2)' }}>
            <span>Campaign Progress</span>
            <span style={{ color: 'var(--gold)' }}>{progress}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--gold)', borderRadius: 10, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', background: 'none', fontSize: 13,
            color: tab === t.key ? 'var(--gold)' : 'var(--text2)',
            borderBottom: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
            cursor: 'pointer', fontWeight: tab === t.key ? 500 : 400, marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <Card>
          <h4 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>About this Campaign</h4>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8 }}>{campaign.description || 'No description set.'}</p>
          {campaign.notes && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>{campaign.notes}</p>
            </div>
          )}
        </Card>
      )}

      {/* Managers tab */}
      {tab === 'managers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" onClick={() => setShowManagerModal(true)}><Plus size={12} /> Assign Manager</Btn>
          </div>
          {managers.length === 0 && <EmptyState message="No campaign managers assigned yet." icon="👤" />}
          {managers.map(m => (
            <Card key={m.id} style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', fontFamily: 'Cormorant Garamond, serif', fontSize: 18, fontWeight: 700 }}>
                  {m.shepherds?.name?.[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, cursor: 'pointer', color: 'var(--text)' }}
                    onClick={() => navigate(`/shepherds/${m.shepherds?.id}`)}>
                    {m.shepherds?.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.shepherds?.role}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge color={m.role === 'manager' ? 'var(--gold)' : 'var(--blue)'}>{m.role}</Badge>
                <Btn size="sm" variant="danger" onClick={() => removeManager(m.id)}>Remove</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" onClick={() => setShowTaskModal(true)}><Plus size={12} /> Add Task</Btn>
          </div>
          {tasks.length === 0 && <EmptyState message="No tasks yet for this campaign." icon="✅" />}
          {tasks.map(task => (
            <Card key={task.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{task.title}</div>
                  {task.description && <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{task.description}</p>}
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text3)' }}>
                    {task.shepherds && <span>👤 {task.shepherds.name}</span>}
                    {task.due_date && <span>📅 Due: {format(new Date(task.due_date), 'dd MMM yyyy')}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {task.status !== 'done' && (
                    <Btn size="sm" variant="ghost" onClick={() => updateTaskStatus(task.id, task.status === 'pending' ? 'in_progress' : 'done')}>
                      {task.status === 'pending' ? 'Start' : 'Done'}
                    </Btn>
                  )}
                  <Badge color={TASK_STATUS_COLOR[task.status]}>{task.status}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modals */}
      {showManagerModal && (
        <Modal title="Assign Campaign Manager" onClose={() => setShowManagerModal(false)}>
          <ManagerForm shepherds={allShepherds.filter(s => !assignedShepherdIds.has(s.id))} onSave={addManager} />
        </Modal>
      )}
      {showTaskModal && (
        <Modal title="Add Campaign Task" onClose={() => setShowTaskModal(false)}>
          <TaskForm managers={managers} onSave={addTask} />
        </Modal>
      )}
      {showEditModal && (
        <Modal title="Edit Campaign" onClose={() => setShowEditModal(false)}>
          <CampaignForm initial={campaign} onSave={updateCampaign} onClose={() => setShowEditModal(false)} />
        </Modal>
      )}
      <SectionChat section="campaigns" pageContext={{ currentId: id }} />
    </div>
  );
}

// ─── Forms ─────────────────────────────────────────────────────────
function CampaignForm({ onSave, onClose, initial }) {
  const [form, setForm] = useState(initial || { name: '', description: '', start_date: '', end_date: '', status: 'planning', notes: '' });
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <FormField label="Campaign Name *"><input value={form.name} onChange={s('name')} /></FormField>
      <FormField label="Description"><textarea value={form.description || ''} onChange={s('description')} /></FormField>
      <FormField label="Notes / Goals"><textarea value={form.notes || ''} onChange={s('notes')} placeholder="What is the goal of this campaign?" /></FormField>
      <FormField label="Status">
        <select value={form.status} onChange={s('status')}>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Start Date"><input type="date" value={form.start_date || ''} onChange={s('start_date')} /></FormField>
        <FormField label="End Date"><input type="date" value={form.end_date || ''} onChange={s('end_date')} /></FormField>
      </div>
      <Btn onClick={() => form.name && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>
        {initial ? 'Update Campaign' : 'Create Campaign'}
      </Btn>
    </>
  );
}

function ManagerForm({ shepherds, onSave }) {
  const [form, setForm] = useState({ shepherd_id: '', role: 'manager' });
  return (
    <>
      <FormField label="Select Shepherd *">
        <select value={form.shepherd_id} onChange={e => setForm(f => ({ ...f, shepherd_id: e.target.value }))}>
          <option value="">Choose a shepherd...</option>
          {shepherds.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
        </select>
      </FormField>
      <FormField label="Role">
        <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
          <option value="manager">Campaign Manager</option>
          <option value="co-manager">Co-Manager</option>
        </select>
      </FormField>
      <Btn onClick={() => form.shepherd_id && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Assign Manager</Btn>
    </>
  );
}

function TaskForm({ managers, onSave }) {
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', due_date: '', status: 'pending' });
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <FormField label="Task Title *"><input value={form.title} onChange={s('title')} /></FormField>
      <FormField label="Description"><textarea value={form.description} onChange={s('description')} /></FormField>
      <FormField label="Assign To">
        <select value={form.assigned_to} onChange={s('assigned_to')}>
          <option value="">No specific assignee</option>
          {managers.map(m => <option key={m.shepherd_id} value={m.shepherd_id}>{m.shepherds?.name} ({m.role})</option>)}
        </select>
      </FormField>
      <FormField label="Due Date"><input type="date" value={form.due_date} onChange={s('due_date')} /></FormField>
      <Btn onClick={() => form.title && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Add Task</Btn>
    </>
  );
}

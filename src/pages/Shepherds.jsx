import SectionChat from '../components/SectionChat';
import { useState, useEffect } from 'react';
import { useDbRefresh } from '../useDbRefresh';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import DuplicateNameField from '../components/DuplicateNameField';
import { generateShepherdSummary } from '../groq';
import { BASONTAS, TASK_TYPES, STATUS_COLORS } from '../constants';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader, GoodBadBetter } from '../components/ui';
import {
  Plus, ArrowLeft, Sparkles, Search, Edit2, Trash2,
  Phone, Mail, MapPin, CheckCircle, Clock, AlertCircle,
  Users, Target, FileText, Map, ChevronRight, X, Save,
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────
const SHEPHERD_ROLES = [
  { value: 'shepherd', label: 'Shepherd' },
  { value: 'leader', label: 'Leader' },
];

// ─── List ─────────────────────────────────────────────────────────
export function ShepherdsList() {
  const [shepherds, setShepherds] = useState([]);
  const [bacentas, setBacentas] = useState([]);
  const [allSheep, setAllSheep] = useState([]); // for "promote from member"
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useDbRefresh(load, 'shepherds');

  async function load() {
    setLoading(true);
    const [{ data: sh }, { data: bac }, { data: sp }] = await Promise.all([
      supabase.from('shepherds').select('*, bacentas(name)').order('name'),
      supabase.from('bacentas').select('id, name').order('name'),
      supabase.from('sheep').select('id, name, phone, email, address, bacenta_id, basonta, notes, date_of_birth')
        .eq('is_active', true).order('name'),
    ]);
    setShepherds(sh || []);
    setBacentas(bac || []);
    setAllSheep(sp || []);
    setLoading(false);
  }

  // Add a brand-new shepherd (not from members)
  async function addShepherd(data) {
    await supabase.from('shepherds').insert(data);
    setShowModal(false);
    load();
  }

  // Promote an existing sheep/member to shepherd
  async function promoteToShepherd(sheepId, extraData) {
    const member = allSheep.find(s => s.id === sheepId);
    if (!member) return;

    // 1. Create shepherd record with member's details + extra fields
    const { data: newShepherd, error } = await supabase.from('shepherds').insert({
      name: member.name,
      phone: member.phone || '',
      email: member.email || '',
      address: member.address || '',
      notes: member.notes || '',
      bacenta_id: extraData.bacenta_id || member.bacenta_id || null,
      basonta: extraData.basonta || member.basonta || '',
      basonta_role: extraData.basonta_role || 'member',
      role: extraData.role || 'shepherd',
    }).select().single();

    if (error) { console.error(error); return; }

    // 2. Mark the sheep record: is_shepherd=true hides them from the Members list
    //    but they still count toward total congregation in the Dashboard
    await supabase.from('sheep').update({ shepherd_id: newShepherd.id, is_shepherd: true }).eq('id', sheepId);

    setShowPromoteModal(false);
    load();
  }

  const filtered = shepherds.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Loader />;

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <PageHeader
        title="Shepherds"
        subtitle={`${shepherds.length} shepherd${shepherds.length !== 1 ? 's' : ''} registered`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setShowPromoteModal(true)}>
              <Users size={14} /> From Members
            </Btn>
            <Btn onClick={() => setShowModal(true)}>
              <Plus size={14} /> Add Shepherd
            </Btn>
          </div>
        }
      />

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search shepherds..."
          style={{ paddingLeft: 36, width: '100%' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
        {filtered.map(s => (
          <Card key={s.id} onClick={() => navigate(`/shepherds/${s.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{s.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>{s.bacentas?.name || 'No bacenta'}</p>
              </div>
              <Badge color={s.role === 'leader' ? 'var(--gold)' : 'var(--blue)'}>{s.role}</Badge>
            </div>
            {s.phone && (
              <p style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Phone size={11} /> {s.phone}
              </p>
            )}
            {s.basonta && (
              <div style={{ marginTop: 8 }}>
                <Badge color={s.basonta_role === 'basonta_shepherd' ? 'var(--gold)' : 'var(--text2)'}>
                  {s.basonta_role === 'basonta_shepherd' ? '⭐ ' : ''}{s.basonta}
                </Badge>
              </div>
            )}
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                View profile <ChevronRight size={12} />
              </span>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <EmptyState message={search ? 'No shepherds match your search.' : 'No shepherds yet. Add your first shepherd.'} icon="🐑" />
        )}
      </div>

      {showModal && (
        <ShepherdModal
          bacentas={bacentas}
          onSave={addShepherd}
          onClose={() => setShowModal(false)}
        />
      )}

      {showPromoteModal && (
        <PromoteModal
          members={allSheep}
          bacentas={bacentas}
          onSave={promoteToShepherd}
          onClose={() => setShowPromoteModal(false)}
        />
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
  const [bacentas, setBacentas] = useState([]);
  const [aiSummary, setAiSummary] = useState('');
  const [tab, setTab] = useState('tasks');
  const [loading, setLoading] = useState(true);

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(null); // task object
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [showEditOutreachModal, setShowEditOutreachModal] = useState(null);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: sh }, { data: tk }, { data: sp }, { data: vi }, { data: or }, { data: bac }] = await Promise.all([
      supabase.from('shepherds').select('*, bacentas(id, name)').eq('id', id).single(),
      supabase.from('shepherd_tasks').select('*').eq('shepherd_id', id).order('created_at', { ascending: false }),
      supabase.from('sheep').select('id, name, phone, basonta, is_active').eq('shepherd_id', id).order('name'),
      supabase.from('sheep_visits').select('*, sheep(name)').eq('shepherd_id', id).order('visited_at', { ascending: false }),
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

  // ── Edit shepherd — syncs across ALL related tables ──────────────
  async function saveShepherdEdits(updates) {
    // 1. Update shepherds table
    await supabase.from('shepherds').update(updates).eq('id', id);

    // 2. If name changed, update sheep records that reference this shepherd
    //    (the sheep table stores shepherd_id as FK, but sheep also have their own name
    //     — we only need to propagate name/phone/email if the sheep IS the same person)
    //    Find sheep where their name matches old shepherd name (promoted member)
    if (updates.name && shepherd.name !== updates.name) {
      // Update any sheep record that was linked as the shepherd's "self" record
      // We identify this by: sheep.shepherd_id = this shepherd's id AND sheep.name = old name
      await supabase
        .from('sheep')
        .update({ name: updates.name, phone: updates.phone, email: updates.email, address: updates.address })
        .eq('shepherd_id', id)
        .eq('name', shepherd.name);
    }

    setShowEditModal(false);
    load();
  }

  async function deleteShepherd() {
    // Restore the shepherd's sheep record to normal member status
    await supabase.from('sheep').update({ shepherd_id: null, is_shepherd: false }).eq('shepherd_id', id);
    await supabase.from('shepherd_tasks').delete().eq('shepherd_id', id);
    await supabase.from('outreach_reports').delete().eq('shepherd_id', id);
    await supabase.from('shepherds').delete().eq('id', id);
    navigate('/shepherds');
  }

  // ── Tasks ────────────────────────────────────────────────────────
  async function addTask(data) {
    await supabase.from('shepherd_tasks').insert({ ...data, shepherd_id: id });

    // Auto-add deadline to calendar if a due_date was set
    if (data.due_date) {
      await supabase.from('calendar_events').insert({
        title: `⏰ ${shepherd.name}: ${data.title}`,
        event_date: data.due_date,
        event_type: 'deadline',
        description: data.description || `Task assigned to ${shepherd.name}`,
      });
    }

    setShowTaskModal(false);
    load();
  }

  async function updateTask(taskId, data) {
    await supabase.from('shepherd_tasks').update(data).eq('id', taskId);

    // Sync calendar: update or insert the deadline event
    if (data.due_date) {
      const eventTitle = `⏰ ${shepherd.name}: ${data.title}`;
      const { data: existing } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('event_type', 'deadline')
        .ilike('title', `%${data.title}%`)
        .limit(1);
      if (existing && existing.length > 0) {
        await supabase.from('calendar_events').update({ event_date: data.due_date, title: eventTitle }).eq('id', existing[0].id);
      } else {
        await supabase.from('calendar_events').insert({ title: eventTitle, event_date: data.due_date, event_type: 'deadline', description: `Task assigned to ${shepherd.name}` });
      }
    }

    setShowEditTaskModal(null);
    load();
  }

  async function updateTaskStatus(taskId, status) {
    await supabase.from('shepherd_tasks').update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', taskId);
    load();
  }

  async function deleteTask(taskId) {
    await supabase.from('shepherd_tasks').delete().eq('id', taskId);
    load();
  }

  // ── Outreach ─────────────────────────────────────────────────────
  async function addOutreach(data) {
    await supabase.from('outreach_reports').insert({ ...data, shepherd_id: id });
    setShowOutreachModal(false);
    load();
  }

  async function updateOutreach(reportId, data) {
    await supabase.from('outreach_reports').update(data).eq('id', reportId);
    setShowEditOutreachModal(null);
    load();
  }

  async function deleteOutreach(reportId) {
    await supabase.from('outreach_reports').delete().eq('id', reportId);
    load();
  }

  // ── Visit reports ────────────────────────────────────────────────
  async function addVisit(data) {
    await supabase.from('sheep_visits').insert({ ...data, shepherd_id: id });
    setShowVisitModal(false);
    load();
  }

  async function deleteVisit(visitId) {
    await supabase.from('sheep_visits').delete().eq('id', visitId);
    load();
  }

  // ── AI Summary ───────────────────────────────────────────────────
  async function getAISummary() {
    setAiSummary('Generating...');
    const summary = await generateShepherdSummary(shepherd, tasks, visits);
    setAiSummary(summary || 'Unable to generate summary.');
  }

  if (loading) return <Loader />;
  if (!shepherd) return <p style={{ padding: 32, color: 'var(--text2)' }}>Shepherd not found.</p>;

  const done = tasks.filter(t => t.status === 'done').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;

  const tabs = [
    { key: 'tasks', label: 'Tasks', count: tasks.length, icon: <Target size={13} /> },
    { key: 'sheep', label: 'Sheep', count: sheep.length, icon: <Users size={13} /> },
    { key: 'visits', label: 'Visit Reports', count: visits.length, icon: <Map size={13} /> },
    { key: 'outreach', label: 'Outreach', count: outreach.length, icon: <FileText size={13} /> },
  ];

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/shepherds')}
        style={{ background: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}
      >
        <ArrowLeft size={14} /> Back to Shepherds
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontFamily: 'Cormorant Garamond, serif', fontWeight: 700 }}>{shepherd.name}</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Badge color={shepherd.role === 'leader' ? 'var(--gold)' : 'var(--blue)'}>{shepherd.role}</Badge>
            {shepherd.bacentas && <Badge color="var(--text2)">{shepherd.bacentas.name}</Badge>}
            {shepherd.basonta && (
              <Badge color={shepherd.basonta_role === 'basonta_shepherd' ? 'var(--gold)' : 'var(--blue)'}>
                {shepherd.basonta_role === 'basonta_shepherd' ? '⭐ Basonta Leader — ' : ''}{shepherd.basonta}
              </Badge>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            {shepherd.phone && (
              <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Phone size={11} /> {shepherd.phone}
              </span>
            )}
            {shepherd.email && (
              <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Mail size={11} /> {shepherd.email}
              </span>
            )}
            {shepherd.address && (
              <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={11} /> {shepherd.address}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Stats */}
          {[
            { label: 'Done', val: done, color: 'var(--green)' },
            { label: 'In Progress', val: inProgress, color: 'var(--blue)' },
            { label: 'Pending', val: pending, color: 'var(--amber)' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: 'center', background: color + '18', border: `1px solid ${color}`, borderRadius: 8, padding: '8px 14px', minWidth: 60 }}>
              <div style={{ fontSize: 22, color, fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={() => setShowEditModal(true)}>
              <Edit2 size={13} /> Edit
            </Btn>
            <Btn variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 size={13} />
            </Btn>
          </div>
        </div>
      </div>

      {/* AI Summary card */}
      <Card style={{ marginBottom: 20, borderColor: aiSummary && aiSummary !== 'Generating...' ? 'var(--gold)' : 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color="var(--gold)" /> AI Performance Summary
          </h4>
          <Btn size="sm" variant="ghost" onClick={getAISummary}>Generate</Btn>
        </div>
        {aiSummary && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, fontStyle: aiSummary === 'Generating...' ? 'italic' : 'normal' }}>
            {aiSummary}
          </p>
        )}
      </Card>

      {/* Notes */}
      {shepherd.notes && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--text2)' }}>
          📝 {shepherd.notes}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '9px 16px', background: 'none', fontSize: 13, whiteSpace: 'nowrap',
            color: tab === t.key ? 'var(--gold)' : 'var(--text2)',
            borderBottom: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
            cursor: 'pointer', fontWeight: tab === t.key ? 500 : 400, marginBottom: -1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.icon} {t.label}
            <span style={{ background: tab === t.key ? 'var(--gold)' : 'var(--border)', color: tab === t.key ? '#0b0f14' : 'var(--text3)', borderRadius: 20, padding: '1px 7px', fontSize: 10 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Tasks tab ── */}
      {tab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" onClick={() => setShowTaskModal(true)}><Plus size={12} /> Assign Task</Btn>
          </div>
          {tasks.map(task => (
            <Card key={task.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{task.title}</span>
                    <Badge color={TASK_TYPES[task.task_type]?.color || 'var(--text2)'}>{TASK_TYPES[task.task_type]?.label}</Badge>
                    <Badge color={STATUS_COLORS[task.status]}>{task.status.replace('_', ' ')}</Badge>
                  </div>
                  {task.description && <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{task.description}</p>}
                  {task.due_date && (
                    <p style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} /> Due: {format(new Date(task.due_date), 'dd MMM yyyy')}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  {task.status !== 'done' && (
                    <Btn size="sm" variant="ghost" onClick={() => updateTaskStatus(task.id, task.status === 'pending' ? 'in_progress' : 'done')}>
                      {task.status === 'pending' ? 'Start' : <><CheckCircle size={12} /> Done</>}
                    </Btn>
                  )}
                  <Btn size="sm" variant="ghost" onClick={() => setShowEditTaskModal(task)}><Edit2 size={12} /></Btn>
                  <Btn size="sm" variant="danger" onClick={() => deleteTask(task.id)}><Trash2 size={12} /></Btn>
                </div>
              </div>
            </Card>
          ))}
          {tasks.length === 0 && <EmptyState message="No tasks assigned yet." icon="✅" />}
        </div>
      )}

      {/* ── Sheep tab ── */}
      {tab === 'sheep' && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>
              These are the members assigned to {shepherd.name}.
              To reassign sheep, go to the <strong>Sheep</strong> page.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {sheep.map(s => (
              <Card key={s.id} onClick={() => navigate(`/sheep/${s.id}`)}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{s.name}</div>
                {s.phone && <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={10} /> {s.phone}</div>}
                {s.basonta && <Badge color="var(--blue)" style={{ marginTop: 6 }}>{s.basonta}</Badge>}
                {!s.is_active && <Badge color="var(--red)" style={{ marginTop: 4 }}>Inactive</Badge>}
              </Card>
            ))}
            {sheep.length === 0 && <EmptyState message="No sheep assigned to this shepherd." icon="🐑" />}
          </div>
        </div>
      )}

      {/* ── Visit Reports tab ── */}
      {tab === 'visits' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" onClick={() => setShowVisitModal(true)}><Plus size={12} /> Add Visit Report</Btn>
          </div>
          {visits.map(v => (
            <Card key={v.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500 }}>{v.sheep?.name || 'Unknown'}</span>
                    <Badge color={v.visit_type === 'tele_pastor' ? 'var(--gold)' : 'var(--green)'}>
                      {v.visit_type === 'tele_pastor' ? 'Tele-Pastor' : 'Visit'}
                    </Badge>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {format(new Date(v.visited_at || v.created_at), 'dd MMM yyyy')}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{v.report}</p>
                </div>
                <Btn size="sm" variant="danger" onClick={() => deleteVisit(v.id)}><Trash2 size={12} /></Btn>
              </div>
            </Card>
          ))}
          {visits.length === 0 && <EmptyState message="No visit reports yet." icon="🏠" />}
        </div>
      )}

      {/* ── Outreach tab ── */}
      {tab === 'outreach' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" onClick={() => setShowOutreachModal(true)}><Plus size={12} /> Add Report</Btn>
          </div>
          {outreach.map(o => (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{o.location || 'Outreach'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{format(new Date(o.date), 'dd MMM yyyy')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>👥 Reached: <strong>{o.people_reached}</strong></span>
                    <span style={{ fontSize: 12, color: 'var(--amber)' }}>✨ First timers: <strong>{o.first_timers_gained}</strong></span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{o.report}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Btn size="sm" variant="ghost" onClick={() => setShowEditOutreachModal(o)}><Edit2 size={12} /></Btn>
                  <Btn size="sm" variant="danger" onClick={() => deleteOutreach(o.id)}><Trash2 size={12} /></Btn>
                </div>
              </div>
            </Card>
          ))}
          {outreach.length === 0 && <EmptyState message="No outreach reports yet." icon="🌍" />}
        </div>
      )}

      {/* ── Modals ── */}
      {showEditModal && (
        <ShepherdModal
          shepherd={shepherd}
          bacentas={bacentas}
          onSave={saveShepherdEdits}
          onClose={() => setShowEditModal(false)}
          editMode
        />
      )}
      {showTaskModal && <TaskModal onSave={addTask} onClose={() => setShowTaskModal(false)} />}
      {showEditTaskModal && (
        <TaskModal
          task={showEditTaskModal}
          onSave={data => updateTask(showEditTaskModal.id, data)}
          onClose={() => setShowEditTaskModal(null)}
          editMode
        />
      )}
      {showOutreachModal && <OutreachModal onSave={addOutreach} onClose={() => setShowOutreachModal(false)} />}
      {showEditOutreachModal && (
        <OutreachModal
          report={showEditOutreachModal}
          onSave={data => updateOutreach(showEditOutreachModal.id, data)}
          onClose={() => setShowEditOutreachModal(null)}
          editMode
        />
      )}
      {showVisitModal && (
        <VisitModal shepherdId={id} sheep={sheep} onSave={addVisit} onClose={() => setShowVisitModal(false)} />
      )}
      {showDeleteConfirm && (
        <Modal title="Delete Shepherd?" onClose={() => setShowDeleteConfirm(false)}>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
            This will delete <strong>{shepherd.name}</strong> as a shepherd and unassign all their sheep.
            Their member (sheep) record will remain. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="secondary" onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
            <Btn variant="danger" onClick={deleteShepherd} style={{ flex: 1, justifyContent: 'center' }}><Trash2 size={13} /> Delete</Btn>
          </div>
        </Modal>
      )}

      <SectionChat section="shepherds" pageContext={{ currentId: id }} />
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────

function ShepherdModal({ onSave, onClose, bacentas, shepherd, editMode }) {
  const [form, setForm] = useState(
    shepherd
      ? {
          name: shepherd.name || '',
          phone: shepherd.phone || '',
          address: shepherd.address || '',
          email: shepherd.email || '',
          role: shepherd.role || 'shepherd',
          bacenta_id: shepherd.bacenta_id || shepherd.bacentas?.id || '',
          basonta: shepherd.basonta || '',
          basonta_role: shepherd.basonta_role || 'member',
          notes: shepherd.notes || '',
        }
      : { name: '', phone: '', address: '', email: '', role: 'shepherd', bacenta_id: '', basonta: '', basonta_role: 'member', notes: '' }
  );

  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title={editMode ? `Edit — ${shepherd?.name}` : 'Add New Shepherd'} onClose={onClose}>
      <DuplicateNameField
        value={form.name}
        onChange={v => setForm(f => ({ ...f, name: v }))}
        excludeId={shepherd?.id}
        autoFocus
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Phone">
          <input value={form.phone} onChange={s('phone')} placeholder="+233..." />
        </FormField>
        <FormField label="Email">
          <input value={form.email} onChange={s('email')} type="email" />
        </FormField>
      </div>
      <FormField label="Address">
        <input value={form.address} onChange={s('address')} placeholder="Residential address" />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Role">
          <select value={form.role} onChange={s('role')}>
            {SHEPHERD_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </FormField>
        <FormField label="Bacenta">
          <select value={form.bacenta_id} onChange={s('bacenta_id')}>
            <option value="">No bacenta</option>
            {bacentas.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </FormField>
      </div>
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
            <option value="basonta_shepherd">Basonta Leader</option>
          </select>
        </FormField>
      )}
      <FormField label="Notes">
        <textarea value={form.notes} onChange={s('notes')} rows={3} placeholder="Any additional notes..." />
      </FormField>
      <Btn
        onClick={() => form.name.trim() && onSave(form)}
        disabled={!form.name.trim()}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        <Save size={13} /> {editMode ? 'Save Changes' : 'Add Shepherd'}
      </Btn>
    </Modal>
  );
}

// Promote a member to shepherd
function PromoteModal({ members, bacentas, onSave, onClose }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [extras, setExtras] = useState({ role: 'shepherd', bacenta_id: '', basonta: '', basonta_role: 'member' });

  const s = k => e => setExtras(f => ({ ...f, [k]: e.target.value }));

  const filtered = members.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  );

  if (selected) {
    return (
      <Modal title={`Promote — ${selected.name}`} onClose={onClose}>
        <div style={{ background: 'var(--gold-dim)', border: '1px solid var(--gold)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
          ℹ️ {selected.name} will become a shepherd. Their member record is kept. You can configure their shepherd details below.
        </div>
        <FormField label="Shepherd Role">
          <select value={extras.role} onChange={s('role')}>
            {SHEPHERD_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </FormField>
        <FormField label="Assign to Bacenta">
          <select value={extras.bacenta_id} onChange={s('bacenta_id')}>
            <option value="">No bacenta</option>
            {bacentas.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </FormField>
        <FormField label="Basonta (Activity Group)">
          <select value={extras.basonta} onChange={s('basonta')}>
            <option value="">None</option>
            {BASONTAS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </FormField>
        {extras.basonta && (
          <FormField label="Role in Basonta">
            <select value={extras.basonta_role} onChange={s('basonta_role')}>
              <option value="member">Member</option>
              <option value="basonta_shepherd">Basonta Leader</option>
            </select>
          </FormField>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Btn variant="secondary" onClick={() => setSelected(null)} style={{ flex: 1, justifyContent: 'center' }}>← Back</Btn>
          <Btn onClick={() => onSave(selected.id, extras)} style={{ flex: 1, justifyContent: 'center' }}>
            Promote to Shepherd
          </Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Promote Member to Shepherd" onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
        Search for an existing church member to elevate to shepherd.
      </p>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name..."
          style={{ paddingLeft: 32 }}
          autoFocus
        />
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.slice(0, 40).map(m => (
          <button
            key={m.id}
            onClick={() => setSelected(m)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
              {m.phone && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.phone}</div>}
            </div>
            <ChevronRight size={14} color="var(--text3)" />
          </button>
        ))}
        {filtered.length === 0 && <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>No members found.</p>}
      </div>
    </Modal>
  );
}

function TaskModal({ onSave, onClose, task, editMode }) {
  const [form, setForm] = useState(
    task
      ? { title: task.title || '', description: task.description || '', task_type: task.task_type || 'general', due_date: task.due_date?.slice(0, 10) || '', status: task.status || 'pending' }
      : { title: '', description: '', task_type: 'general', due_date: '', status: 'pending' }
  );
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title={editMode ? 'Edit Task' : 'Assign Task'} onClose={onClose}>
      <FormField label="Task Title *">
        <input value={form.title} onChange={s('title')} placeholder="e.g. Visit Brother Kwame" autoFocus />
      </FormField>
      <FormField label="Description">
        <textarea value={form.description} onChange={s('description')} rows={3} placeholder="Details about this task..." />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Task Type">
          <select value={form.task_type} onChange={s('task_type')}>
            {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </FormField>
        <FormField label="Due Date">
          <input type="date" value={form.due_date} onChange={s('due_date')} />
        </FormField>
      </div>
      {editMode && (
        <FormField label="Status">
          <select value={form.status} onChange={s('status')}>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </FormField>
      )}
      <Btn
        onClick={() => form.title.trim() && onSave(form)}
        disabled={!form.title.trim()}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        <Save size={13} /> {editMode ? 'Save Changes' : 'Assign Task'}
      </Btn>
    </Modal>
  );
}

function OutreachModal({ onSave, onClose, report, editMode }) {
  const [form, setForm] = useState(
    report
      ? { location: report.location || '', date: report.date?.slice(0, 10) || new Date().toISOString().slice(0, 10), people_reached: report.people_reached || 0, first_timers_gained: report.first_timers_gained || 0, report: report.report || '' }
      : { location: '', date: new Date().toISOString().slice(0, 10), people_reached: 0, first_timers_gained: 0, report: '' }
  );
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title={editMode ? 'Edit Outreach Report' : 'Add Outreach Report'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Location">
          <input value={form.location} onChange={s('location')} placeholder="e.g. Spintex Road" />
        </FormField>
        <FormField label="Date">
          <input type="date" value={form.date} onChange={s('date')} />
        </FormField>
        <FormField label="People Reached">
          <input type="number" min="0" value={form.people_reached} onChange={s('people_reached')} />
        </FormField>
        <FormField label="First Timers Gained">
          <input type="number" min="0" value={form.first_timers_gained} onChange={s('first_timers_gained')} />
        </FormField>
      </div>
      <FormField label="Report *">
        <textarea value={form.report} onChange={s('report')} rows={4} placeholder="Describe the outreach — what happened, who was reached, challenges..." />
      </FormField>
      <Btn
        onClick={() => form.report.trim() && onSave(form)}
        disabled={!form.report.trim()}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        <Save size={13} /> {editMode ? 'Save Changes' : 'Save Report'}
      </Btn>
    </Modal>
  );
}

function VisitModal({ shepherdId, sheep, onSave, onClose }) {
  const [form, setForm] = useState({
    sheep_id: sheep[0]?.id || '',
    visit_type: 'visit',
    visited_at: new Date().toISOString().slice(0, 10),
    report: '',
  });
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title="Add Visit / Tele-Pastor Report" onClose={onClose}>
      <FormField label="Member Visited">
        <select value={form.sheep_id} onChange={s('sheep_id')}>
          <option value="">Select member...</option>
          {sheep.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Visit Type">
          <select value={form.visit_type} onChange={s('visit_type')}>
            <option value="visit">Physical Visit</option>
            <option value="tele_pastor">Tele-Pastor (Call)</option>
          </select>
        </FormField>
        <FormField label="Date">
          <input type="date" value={form.visited_at} onChange={s('visited_at')} />
        </FormField>
      </div>
      <FormField label="Report *">
        <textarea value={form.report} onChange={s('report')} rows={4} placeholder="How did the visit go? What was discussed? Any prayer points?" />
      </FormField>
      <Btn
        onClick={() => form.sheep_id && form.report.trim() && onSave(form)}
        disabled={!form.sheep_id || !form.report.trim()}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        <Save size={13} /> Save Report
      </Btn>
    </Modal>
  );
}
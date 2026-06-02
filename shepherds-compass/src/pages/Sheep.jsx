import { useState, useEffect } from 'react';
import { useDbRefresh } from '../useDbRefresh';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { BASONTAS } from '../constants';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader } from '../components/ui';
import { Plus, ArrowLeft, Search } from 'lucide-react';
import { format } from 'date-fns';

// ─── List ─────────────────────────────────────────────────────────
export function SheepList() {
  const [sheep, setSheep] = useState([]);
  const [shepherds, setShepherds] = useState([]);
  const [bacentas, setBacentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useDbRefresh(load, 'sheep');

  async function load() {
    setLoading(true);
    const [{ data: sp }, { data: sh }, { data: bac }] = await Promise.all([
      supabase.from('sheep').select('*, shepherds(name), bacentas(name)').order('name'),
      supabase.from('shepherds').select('id, name').order('name'),
      supabase.from('bacentas').select('id, name').order('name'),
    ]);
    setSheep(sp || []);
    setShepherds(sh || []);
    setBacentas(bac || []);
    setLoading(false);
  }

  async function addSheep(data) {
    await supabase.from('sheep').insert(data);
    setShowModal(false);
    load();
  }

  const filtered = sheep.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search);
    const matchFilter = filter === 'all' || (filter === 'first_timer' && s.first_timer) || s.basonta === filter;
    return matchSearch && matchFilter;
  });

  if (loading) return <Loader />;

  return (
    <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
      <PageHeader title="Sheep (Members)" subtitle={`${sheep.length} registered members`}
        actions={<Btn onClick={() => setShowModal(true)}><Plus size={14} /> Add Member</Btn>}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." style={{ paddingLeft: 36 }} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 180 }}>
          <option value="all">All Members</option>
          <option value="first_timer">First Timers</option>
          {BASONTAS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {filtered.map(s => (
          <Card key={s.id} onClick={() => navigate(`/sheep/${s.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</h3>
              {s.first_timer && <Badge color="var(--amber)">First Timer</Badge>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {s.phone && <span>📞 {s.phone}</span>}
              {s.shepherds && <span>🐑 {s.shepherds.name}</span>}
              {s.bacentas && <span>🏠 {s.bacentas.name}</span>}
            </div>
            {s.basonta && <div style={{ marginTop: 8 }}><Badge color="var(--blue)">{s.basonta}</Badge></div>}
          </Card>
        ))}
        {filtered.length === 0 && <EmptyState message="No members found." icon="🐑" />}
      </div>

      {showModal && <SheepModal shepherds={shepherds} bacentas={bacentas} onSave={addSheep} onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ─── Detail ───────────────────────────────────────────────────────
export function SheepDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [visits, setVisits] = useState([]);
  const [shepherds, setShepherds] = useState([]);
  const [bacentas, setBacentas] = useState([]);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: m }, { data: v }, { data: sh }, { data: bac }] = await Promise.all([
      supabase.from('sheep').select('*, shepherds(id, name), bacentas(name)').eq('id', id).single(),
      supabase.from('sheep_visits').select('*, shepherds(name)').eq('sheep_id', id).order('visited_at', { ascending: false }),
      supabase.from('shepherds').select('id, name').order('name'),
      supabase.from('bacentas').select('id, name').order('name'),
    ]);
    setMember(m);
    setVisits(v || []);
    setShepherds(sh || []);
    setBacentas(bac || []);
    setLoading(false);
  }

  async function addVisit(data) {
    await supabase.from('sheep_visits').insert({ ...data, sheep_id: id, shepherd_id: member?.shepherd_id });
    setShowVisitModal(false);
    load();
  }

  async function updateMember(data) {
    await supabase.from('sheep').update(data).eq('id', id);
    load();
  }

  if (loading) return <Loader />;
  if (!member) return <p style={{ padding: 32, color: 'var(--text2)' }}>Member not found.</p>;

  return (
    <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
      <button onClick={() => navigate('/sheep')} style={{ background: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
        <ArrowLeft size={14} /> Back to Members
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontFamily: 'Cormorant Garamond, serif' }}>{member.name}</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {member.first_timer && <Badge color="var(--amber)">First Timer</Badge>}
            {member.basonta && <Badge color="var(--blue)">{member.basonta}</Badge>}
            {!member.is_active && <Badge color="var(--red)">Inactive</Badge>}
          </div>
        </div>
        <Btn size="sm" variant="ghost" onClick={() => setShowVisitModal(true)}><Plus size={12} /> Add Visit Report</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <Card>
          <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text2)' }}>Member Info</h4>
          {[
            ['📞 Phone', member.phone],
            ['📧 Email', member.email],
            ['🏠 Address', member.address],
            ['🐑 Shepherd', member.shepherds?.name],
            ['🏘 Bacenta', member.bacentas?.name],
            ['🎵 Basonta', member.basonta],
          ].map(([label, value]) => value ? (
            <div key={label} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text2)', minWidth: 100 }}>{label}</span>
              <span>{value}</span>
            </div>
          ) : null)}
        </Card>

        {member.first_timer && member.first_timer_data && (
          <Card>
            <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--amber)' }}>First Timer Details</h4>
            {Object.entries(member.first_timer_data).map(([k, v]) => (
              <div key={k} style={{ marginBottom: 8, fontSize: 13 }}>
                <div style={{ color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{k.replace(/_/g, ' ')}</div>
                <div>{v || '—'}</div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <h3 style={{ fontSize: 16, marginBottom: 14 }}>Visit & Tele-Pastor Reports ({visits.length})</h3>
      {visits.map(v => (
        <Card key={v.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge color={v.visit_type === 'tele_pastor' ? 'var(--gold)' : 'var(--green)'}>{v.visit_type === 'tele_pastor' ? 'Tele-Pastor' : 'Visit'}</Badge>
              {v.shepherds && <span style={{ fontSize: 12, color: 'var(--text2)' }}>by {v.shepherds.name}</span>}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{format(new Date(v.visited_at), 'dd MMM yyyy')}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text)' }}>{v.report}</p>
        </Card>
      ))}
      {visits.length === 0 && <EmptyState message="No visit reports for this member yet." icon="📋" />}

      {showVisitModal && (
        <VisitModal shepherds={shepherds} defaultShepherd={member.shepherd_id} onSave={addVisit} onClose={() => setShowVisitModal(false)} />
      )}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────
function SheepModal({ onSave, onClose, shepherds, bacentas }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', shepherd_id: '', bacenta_id: '', basonta: '', first_timer: false });
  const s = k => v => setForm(f => ({ ...f, [k]: v.target ? v.target.value : v }));
  return (
    <Modal title="Add Church Member" onClose={onClose}>
      <FormField label="Full Name *"><input value={form.name} onChange={s('name')} /></FormField>
      <FormField label="Phone"><input value={form.phone} onChange={s('phone')} /></FormField>
      <FormField label="Email"><input value={form.email} onChange={s('email')} /></FormField>
      <FormField label="Address"><input value={form.address} onChange={s('address')} /></FormField>
      <FormField label="Shepherd">
        <select value={form.shepherd_id} onChange={s('shepherd_id')}>
          <option value="">None</option>
          {shepherds.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
        </select>
      </FormField>
      <FormField label="Bacenta">
        <select value={form.bacenta_id} onChange={s('bacenta_id')}>
          <option value="">None</option>
          {bacentas.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </FormField>
      <FormField label="Basonta (Group)">
        <select value={form.basonta} onChange={s('basonta')}>
          <option value="">None</option>
          {BASONTAS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </FormField>
      <FormField label="">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.first_timer} onChange={e => setForm(f => ({ ...f, first_timer: e.target.checked }))} style={{ width: 'auto' }} />
          Mark as First Timer
        </label>
      </FormField>
      <Btn onClick={() => form.name && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Save Member</Btn>
    </Modal>
  );
}

function VisitModal({ onSave, onClose, shepherds, defaultShepherd }) {
  const [form, setForm] = useState({ shepherd_id: defaultShepherd || '', visit_type: 'visit', report: '', visited_at: new Date().toISOString().slice(0, 10) });
  const s = k => v => setForm(f => ({ ...f, [k]: v.target.value }));
  return (
    <Modal title="Add Visit Report" onClose={onClose}>
      <FormField label="Shepherd">
        <select value={form.shepherd_id} onChange={s('shepherd_id')}>
          <option value="">Select shepherd</option>
          {shepherds.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
        </select>
      </FormField>
      <FormField label="Type">
        <select value={form.visit_type} onChange={s('visit_type')}>
          <option value="visit">Visit (In-Person)</option>
          <option value="tele_pastor">Tele-Pastor (Phone)</option>
        </select>
      </FormField>
      <FormField label="Date"><input type="date" value={form.visited_at} onChange={s('visited_at')} /></FormField>
      <FormField label="Report *"><textarea value={form.report} onChange={s('report')} placeholder="What happened during this visit..." /></FormField>
      <Btn onClick={() => form.report && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Save Report</Btn>
    </Modal>
  );
}
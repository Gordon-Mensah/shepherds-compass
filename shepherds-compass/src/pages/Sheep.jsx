import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { BASONTAS } from '../constants';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader } from '../components/ui';
import { Plus, ArrowLeft, Search, Upload, AlertCircle } from 'lucide-react';
import { format, isToday, parseISO } from 'date-fns';

// ─── CSV parser (no library needed) ───────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

// Map CSV column → DB field
const CSV_MAP = {
  name: 'name', full_name: 'name',
  phone: 'phone', phone_number: 'phone',
  email: 'email', email_address: 'email',
  address: 'address',
  date_of_birth: 'date_of_birth', dob: 'date_of_birth', birthday: 'date_of_birth',
  basonta: 'basonta', group: 'basonta',
  notes: 'notes',
};

function mapRow(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    if (CSV_MAP[k] && v) out[CSV_MAP[k]] = v;
  });
  return out;
}

// ─── List ─────────────────────────────────────────────────────────
export function SheepList() {
  const [sheep, setSheep] = useState([]);
  const [shepherds, setShepherds] = useState([]);
  const [bacentas, setBacentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

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

  // Birthday today check
  function isBirthdayToday(dob) {
    if (!dob) return false;
    try {
      const d = parseISO(dob);
      const today = new Date();
      return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    } catch { return false; }
  }

  const noShepherd = sheep.filter(s => !s.shepherd_id);
  const birthdaysToday = sheep.filter(s => isBirthdayToday(s.date_of_birth));

  const filtered = sheep.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone || '').includes(search);
    if (filter === 'no_shepherd') return matchSearch && !s.shepherd_id;
    if (filter === 'first_timer') return matchSearch && s.first_timer;
    if (filter === 'birthday_today') return matchSearch && isBirthdayToday(s.date_of_birth);
    if (BASONTAS.includes(filter)) return matchSearch && s.basonta === filter;
    return matchSearch;
  });

  if (loading) return <Loader />;

  return (
    <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
      <PageHeader title="Sheep (Members)" subtitle={`${sheep.length} registered members`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setShowImportModal(true)}><Upload size={14} /> Import CSV</Btn>
            <Btn onClick={() => setShowModal(true)}><Plus size={14} /> Add Member</Btn>
          </div>
        }
      />

      {/* Notification banners */}
      {birthdaysToday.length > 0 && (
        <div style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid var(--gold)', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎂</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>
              Birthday{birthdaysToday.length > 1 ? 's' : ''} Today!
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {birthdaysToday.map(m => m.name).join(', ')}
            </div>
          </div>
          <button onClick={() => setFilter('birthday_today')} style={{ marginLeft: 'auto', background: 'none', color: 'var(--gold)', fontSize: 12, cursor: 'pointer', border: '1px solid var(--gold)', borderRadius: 6, padding: '4px 12px' }}>
            View
          </button>
        </div>
      )}

      {noShepherd.length > 0 && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={18} color="var(--red)" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>
              {noShepherd.length} member{noShepherd.length > 1 ? 's' : ''} without a shepherd
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {noShepherd.slice(0, 4).map(m => m.name).join(', ')}{noShepherd.length > 4 ? ` and ${noShepherd.length - 4} more` : ''}
            </div>
          </div>
          <button onClick={() => setFilter('no_shepherd')} style={{ marginLeft: 'auto', background: 'none', color: 'var(--red)', fontSize: 12, cursor: 'pointer', border: '1px solid var(--red)', borderRadius: 6, padding: '4px 12px' }}>
            View All
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or phone..." style={{ paddingLeft: 36 }} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 200 }}>
          <option value="all">All Members ({sheep.length})</option>
          <option value="no_shepherd">⚠️ No Shepherd ({noShepherd.length})</option>
          <option value="first_timer">First Timers</option>
          {birthdaysToday.length > 0 && <option value="birthday_today">🎂 Birthday Today ({birthdaysToday.length})</option>}
          {BASONTAS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {filtered.map(s => (
          <Card key={s.id} onClick={() => navigate(`/sheep/${s.id}`)}
            style={{ borderLeft: !s.shepherd_id ? '3px solid var(--red)' : isBirthdayToday(s.date_of_birth) ? '3px solid var(--gold)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</h3>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {isBirthdayToday(s.date_of_birth) && <Badge color="var(--gold)">🎂</Badge>}
                {s.first_timer && <Badge color="var(--amber)">First Timer</Badge>}
                {!s.shepherd_id && <Badge color="var(--red)">No shepherd</Badge>}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {s.phone && <span>📞 {s.phone}</span>}
              {s.shepherds ? <span>🐑 {s.shepherds.name}</span> : <span style={{ color: 'var(--red)' }}>🐑 Unassigned</span>}
              {s.bacentas && <span>🏠 {s.bacentas.name}</span>}
            </div>
            {s.basonta && <div style={{ marginTop: 8 }}><Badge color="var(--blue)">{s.basonta}</Badge></div>}
          </Card>
        ))}
        {filtered.length === 0 && <EmptyState message="No members found." icon="🐑" />}
      </div>

      {showModal && <SheepModal shepherds={shepherds} bacentas={bacentas} onSave={addSheep} onClose={() => setShowModal(false)} />}
      {showImportModal && <ImportModal shepherds={shepherds} bacentas={bacentas} onDone={() => { setShowImportModal(false); load(); }} onClose={() => setShowImportModal(false)} />}
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
  const [showEditModal, setShowEditModal] = useState(false);
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
    await supabase.from('sheep_visits').insert({ ...data, sheep_id: id, shepherd_id: data.shepherd_id || member?.shepherd_id });
    setShowVisitModal(false);
    load();
  }

  async function updateMember(data) {
    await supabase.from('sheep').update(data).eq('id', id);
    setShowEditModal(false);
    load();
  }

  if (loading) return <Loader />;
  if (!member) return <p style={{ padding: 32, color: 'var(--text2)' }}>Member not found.</p>;

  function isBirthdayToday(dob) {
    if (!dob) return false;
    try {
      const d = parseISO(dob);
      const today = new Date();
      return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    } catch { return false; }
  }

  const birthdayToday = isBirthdayToday(member.date_of_birth);

  return (
    <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
      <button onClick={() => navigate('/sheep')} style={{ background: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
        <ArrowLeft size={14} /> Back to Members
      </button>

      {birthdayToday && (
        <div style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid var(--gold)', borderRadius: 10, padding: '12px 18px', marginBottom: 20, fontSize: 13, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 10 }}>
          🎂 <strong>{member.name}</strong> is celebrating their birthday today! Don't forget to reach out.
        </div>
      )}

      {!member.shepherd_id && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 10, padding: '12px 18px', marginBottom: 20, fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={16} /> This member has no shepherd assigned. Consider assigning one.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontFamily: 'Cormorant Garamond, serif' }}>{member.name}</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {birthdayToday && <Badge color="var(--gold)">🎂 Birthday Today</Badge>}
            {member.first_timer && <Badge color="var(--amber)">First Timer</Badge>}
            {member.basonta && <Badge color="var(--blue)">{member.basonta}</Badge>}
            {!member.is_active && <Badge color="var(--red)">Inactive</Badge>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" variant="ghost" onClick={() => setShowEditModal(true)}>Edit</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setShowVisitModal(true)}><Plus size={12} /> Add Visit</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <Card>
          <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text2)' }}>Member Info</h4>
          {[
            ['📞 Phone', member.phone],
            ['📧 Email', member.email],
            ['🏠 Address', member.address],
            ['🎂 Birthday', member.date_of_birth ? format(parseISO(member.date_of_birth), 'dd MMMM') : null],
            ['🐑 Shepherd', member.shepherds?.name || <span style={{ color: 'var(--red)' }}>Not assigned</span>],
            ['🏘 Bacenta', member.bacentas?.name],
            ['🎵 Basonta', member.basonta],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text2)', minWidth: 110 }}>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </Card>

        {member.first_timer && member.first_timer_data && Object.keys(member.first_timer_data).length > 0 && (
          <Card>
            <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--amber)' }}>First Timer Details</h4>
            {Object.entries(member.first_timer_data).map(([k, v]) => v ? (
              <div key={k} style={{ marginBottom: 8, fontSize: 13 }}>
                <div style={{ color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{k.replace(/_/g, ' ')}</div>
                <div>{v}</div>
              </div>
            ) : null)}
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
      {showEditModal && (
        <SheepModal initial={member} shepherds={shepherds} bacentas={bacentas} onSave={updateMember} onClose={() => setShowEditModal(false)} />
      )}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────
function SheepModal({ onSave, onClose, shepherds, bacentas, initial }) {
  const [form, setForm] = useState(initial ? {
    name: initial.name || '',
    phone: initial.phone || '',
    email: initial.email || '',
    address: initial.address || '',
    date_of_birth: initial.date_of_birth || '',
    shepherd_id: initial.shepherd_id || '',
    bacenta_id: initial.bacenta_id || '',
    basonta: initial.basonta || '',
    first_timer: initial.first_timer || false,
  } : { name: '', phone: '', email: '', address: '', date_of_birth: '', shepherd_id: '', bacenta_id: '', basonta: '', first_timer: false });
  const s = k => v => setForm(f => ({ ...f, [k]: v.target ? v.target.value : v }));
  return (
    <Modal title={initial ? 'Edit Member' : 'Add Church Member'} onClose={onClose}>
      <FormField label="Full Name *"><input value={form.name} onChange={s('name')} /></FormField>
      <FormField label="Phone"><input value={form.phone} onChange={s('phone')} /></FormField>
      <FormField label="Email"><input value={form.email} onChange={s('email')} /></FormField>
      <FormField label="Address"><input value={form.address} onChange={s('address')} /></FormField>
      <FormField label="Date of Birth" hint="Used for birthday notifications">
        <input type="date" value={form.date_of_birth} onChange={s('date_of_birth')} />
      </FormField>
      <FormField label="Shepherd">
        <select value={form.shepherd_id} onChange={s('shepherd_id')}>
          <option value="">None (unassigned)</option>
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
      <Btn onClick={() => form.name && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>
        {initial ? 'Update Member' : 'Save Member'}
      </Btn>
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

// ─── CSV Import Modal ──────────────────────────────────────────────
function ImportModal({ onDone, onClose, shepherds, bacentas }) {
  const [step, setStep] = useState('upload'); // upload | preview | importing | done
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [progress, setProgress] = useState(0);
  const [defaultShepherd, setDefaultShepherd] = useState('');
  const [defaultBacenta, setDefaultBacenta] = useState('');
  const fileRef = useRef();

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target.result);
      const mapped = parsed.map(mapRow).filter(r => r.name);
      setRows(mapped);
      setStep('preview');
    };
    reader.readAsText(file);
  }

  async function importAll() {
    setStep('importing');
    let done = 0;
    const errs = [];
    for (const row of rows) {
      try {
        const record = {
          ...row,
          is_active: true,
          shepherd_id: defaultShepherd || null,
          bacenta_id: defaultBacenta || null,
        };
        const { error } = await supabase.from('sheep').insert(record);
        if (error) errs.push(`${row.name}: ${error.message}`);
      } catch (e) {
        errs.push(`${row.name}: ${e.message}`);
      }
      done++;
      setProgress(Math.round((done / rows.length) * 100));
    }
    setErrors(errs);
    setStep('done');
  }

  return (
    <Modal title="Import Members from CSV" onClose={onClose}>
      {step === 'upload' && (
        <>
          <div style={{ background: 'var(--bg3)', border: '2px dashed var(--border)', borderRadius: 10, padding: '32px 20px', textAlign: 'center', marginBottom: 16 }}>
            <Upload size={28} color="var(--text3)" style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>Upload a CSV or spreadsheet exported as CSV</p>
            <Btn onClick={() => fileRef.current.click()}>Choose File</Btn>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
          </div>
          <div style={{ background: 'var(--gold-glow)', border: '1px solid var(--gold-dim)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'var(--text2)' }}>
            <strong style={{ color: 'var(--gold)' }}>Supported columns:</strong><br />
            name, phone, email, address, date_of_birth (or dob / birthday), basonta, notes<br />
            <span style={{ color: 'var(--text3)' }}>Names must be in the first column or a column labelled "name"</span>
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Found <strong style={{ color: 'var(--gold)' }}>{rows.length}</strong> valid members. Assign defaults for unspecified fields:
          </p>
          <FormField label="Default Shepherd (optional)">
            <select value={defaultShepherd} onChange={e => setDefaultShepherd(e.target.value)}>
              <option value="">None — leave unassigned</option>
              {shepherds.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>
          <FormField label="Default Bacenta (optional)">
            <select value={defaultBacenta} onChange={e => setDefaultBacenta(e.target.value)}>
              <option value="">None</option>
              {bacentas.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FormField>
          <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--bg3)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12 }}>
            {rows.slice(0, 20).map((r, i) => (
              <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
                <strong style={{ color: 'var(--text)' }}>{r.name}</strong>
                {r.phone && ` · ${r.phone}`}
                {r.date_of_birth && ` · 🎂 ${r.date_of_birth}`}
                {r.basonta && ` · ${r.basonta}`}
              </div>
            ))}
            {rows.length > 20 && <div style={{ color: 'var(--text3)', paddingTop: 6 }}>...and {rows.length - 20} more</div>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setStep('upload')}>Back</Btn>
            <Btn onClick={importAll} style={{ flex: 1, justifyContent: 'center' }}>Import {rows.length} Members</Btn>
          </div>
        </>
      )}

      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Importing members... {progress}%</div>
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--gold)', transition: 'width 0.2s', borderRadius: 10 }} />
          </div>
        </div>
      )}

      {step === 'done' && (
        <>
          <div style={{ textAlign: 'center', padding: '20px 0', marginBottom: 16 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>Import complete!</p>
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>{rows.length - errors.length} of {rows.length} members imported successfully.</p>
          </div>
          {errors.length > 0 && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
              <strong>Errors:</strong>
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <Btn onClick={onDone} style={{ width: '100%', justifyContent: 'center' }}>Done</Btn>
        </>
      )}
    </Modal>
  );
}

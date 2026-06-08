import SectionChat from '../components/SectionChat';
import { useState, useEffect, useRef } from 'react';
import { useDbRefresh } from '../useDbRefresh';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { FIRST_TIMER_QUESTIONS } from '../constants';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader } from '../components/ui';
import {
  Plus, Upload, Search, Edit2, Trash2, UserCheck, Phone,
  Calendar, ChevronRight, AlertCircle, CheckCircle, Save,
  FileSpreadsheet, HelpCircle, Users,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { checkDuplicateName, getExistingNames } from '../checkDuplicate';
import DuplicateNameField from '../components/DuplicateNameField';
import * as XLSX from 'xlsx';

// ─── CSV/XLSX flexible column matching ───────────────────────────────────────
const COL_MAP = {
  name:             ['name', 'full name', 'fullname', 'full_name'],
  phone:            ['phone', 'phone number', 'mobile', 'tel', 'telephone', 'contact'],
  email:            ['email', 'e-mail', 'email address'],
  address:          ['address', 'home address', 'location', 'residence'],
  visit_date:       ['date', 'visit date', 'date visited', 'visit_date', 'visited', 'first_timer_date'],
  notes:            ['notes', 'note', 'comments', 'comment', 'remarks'],
  how_did_you_hear: ['how did you hear', 'how_did_you_hear', 'referral', 'source'],
  is_born_again:    ['born again', 'is_born_again', 'born_again', 'saved'],
  prayer_request:   ['prayer request', 'prayer_request', 'prayer'],
  occupation:       ['occupation', 'job', 'work', 'profession'],
};

function mapColumns(headers) {
  const result = {};
  headers.forEach((raw, idx) => {
    const h = (raw || '').toLowerCase().replace(/[^a-z0-9 _]/g, '').trim();
    for (const [field, aliases] of Object.entries(COL_MAP)) {
      if (!result[field] && aliases.some(a => h === a || h.includes(a))) {
        result[field] = idx;
      }
    }
  });
  return result;
}

function parseSpreadsheet(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h || ''));
  const colMap = mapColumns(headers);
  const today = new Date().toISOString().slice(0, 10);

  return rows.slice(1).filter(r => r.some(c => c !== '')).map(row => {
    const get = field => {
      const idx = colMap[field];
      if (idx === undefined) return '';
      const val = row[idx];
      return val === null || val === undefined ? '' : String(val).trim();
    };

    const dateVal = get('visit_date');
    let dateStr = today;
    if (dateVal) {
      try {
        const asNum = Number(dateVal.replace ? dateVal.replace(/[^0-9]/g, '') : dateVal);
        if (!isNaN(asNum) && asNum > 40000 && asNum < 60000) {
          const d = XLSX.SSF.parse_date_code(asNum);
          dateStr = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        } else {
          const parsed = new Date(dateVal);
          if (!isNaN(parsed)) dateStr = parsed.toISOString().slice(0, 10);
        }
      } catch {}
    }

    return {
      name: get('name'),
      phone: get('phone'),
      email: get('email'),
      address: get('address'),
      visit_date: dateStr,
      notes: get('notes'),
      how_did_you_hear: get('how_did_you_hear'),
      is_born_again: get('is_born_again'),
      prayer_request: get('prayer_request'),
      occupation: get('occupation'),
    };
  }).filter(r => r.name);
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FirstTimers() {
  const [firstTimers, setFirstTimers] = useState([]);
  const [shepherds, setShepherds] = useState([]);
  const [bacentas, setBacentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showLookupModal, setShowLookupModal] = useState(false);

  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useDbRefresh(load, 'first_timers');

  async function load() {
    setLoading(true);
    const [{ data: ft }, { data: sh }, { data: bac }] = await Promise.all([
      supabase
        .from('first_timers')
        .select('*, shepherds(id, name), bacentas(id, name)')
        .order('visit_date', { ascending: false }),
      supabase.from('shepherds').select('id, name').order('name'),
      supabase.from('bacentas').select('id, name').order('name'),
    ]);
    setFirstTimers(ft || []);
    setShepherds(sh || []);
    setBacentas(bac || []);
    setLoading(false);
  }

  async function addFirstTimer(data) {
    await supabase.from('first_timers').insert(data);
    setShowAddModal(false);
    load();
  }

  async function bulkImport(records, shepherdId) {
    const rows = records.map(r => ({ ...r, shepherd_id: shepherdId || null }));
    const { error } = await supabase.from('first_timers').insert(rows);
    return error;
  }

  async function saveEdit(id, data) {
    await supabase.from('first_timers').update(data).eq('id', id);
    setShowEditModal(null);
    load();
  }

  async function deleteFirstTimer(id) {
    await supabase.from('first_timers').delete().eq('id', id);
    setShowDeleteConfirm(null);
    load();
  }

  async function assignShepherd(ftId, shepherdId) {
    await supabase.from('first_timers').update({ shepherd_id: shepherdId || null }).eq('id', ftId);
    load();
  }

  const displayed = firstTimers.filter(ft => {
    const matchSearch = !search ||
      ft.name.toLowerCase().includes(search.toLowerCase()) ||
      (ft.phone || '').includes(search);
    if (filter === 'unassigned') return matchSearch && !ft.shepherd_id;
    if (filter === 'assigned')   return matchSearch && !!ft.shepherd_id;
    return matchSearch;
  });

  const unassignedCount = firstTimers.filter(f => !f.shepherd_id).length;

  if (loading) return <Loader />;

  return (
    <>
      <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
        <PageHeader
          title="First Timers"
          subtitle={`${firstTimers.length} recorded · ${unassignedCount} unassigned`}
          actions={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="ghost" onClick={() => setShowLookupModal(true)}>
                <HelpCircle size={14} /> Do you know this person?
              </Btn>
              <Btn variant="secondary" onClick={() => setShowImportModal(true)}>
                <FileSpreadsheet size={14} /> Import CSV / Excel
              </Btn>
              <Btn onClick={() => setShowAddModal(true)}>
                <Plus size={14} /> Add First Timer
              </Btn>
            </div>
          }
        />

        {unassignedCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
            background: 'rgba(230,160,50,0.10)', border: '1px solid var(--amber, #e6a032)',
            borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--text2)',
          }}>
            <AlertCircle size={15} color="var(--amber)" style={{ flexShrink: 0 }} />
            <span>
              <strong>{unassignedCount}</strong> first timer{unassignedCount !== 1 ? 's have' : ' has'} no shepherd assigned.{' '}
              <button onClick={() => setFilter('unassigned')} style={{ background: 'none', color: 'var(--gold)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>
                View them
              </button>
            </span>
          </div>
        )}

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." style={{ paddingLeft: 34, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['all','All'], ['unassigned','⚠️ Unassigned'], ['assigned','✅ Assigned']].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                background: filter === val ? 'var(--gold)' : 'var(--surface)',
                color: filter === val ? '#0b0f14' : 'var(--text2)',
                border: `1px solid ${filter === val ? 'var(--gold)' : 'var(--border)'}`,
                fontWeight: filter === val ? 600 : 400,
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
          {displayed.map(ft => (
            <FirstTimerCard
              key={ft.id}
              ft={ft}
              shepherds={shepherds}
              onEdit={() => setShowEditModal(ft)}
              onDelete={() => setShowDeleteConfirm(ft)}
              onAssign={shId => assignShepherd(ft.id, shId)}
            />
          ))}
          {displayed.length === 0 && (
            <EmptyState message={search || filter !== 'all' ? 'No first timers match your search.' : 'No first timers recorded yet.'} icon="✨" />
          )}
        </div>
      </div>

      {showAddModal && (
        <FirstTimerModal shepherds={shepherds} bacentas={bacentas} onSave={addFirstTimer} onClose={() => setShowAddModal(false)} />
      )}
      {showImportModal && (
        <ImportModal shepherds={shepherds} onImport={bulkImport} onClose={() => { setShowImportModal(false); load(); }} />
      )}
      {showEditModal && (
        <FirstTimerModal ft={showEditModal} shepherds={shepherds} bacentas={bacentas} onSave={data => saveEdit(showEditModal.id, data)} onClose={() => setShowEditModal(null)} editMode />
      )}
      {showDeleteConfirm && (
        <Modal title="Remove First Timer?" onClose={() => setShowDeleteConfirm(null)}>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
            This will permanently remove <strong>{showDeleteConfirm.name}</strong> from the first timers list.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="secondary" onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
            <Btn variant="danger" onClick={() => deleteFirstTimer(showDeleteConfirm.id)} style={{ flex: 1, justifyContent: 'center' }}>
              <Trash2 size={13} /> Remove
            </Btn>
          </div>
        </Modal>
      )}
      {showLookupModal && (
        <LookupModal onClose={() => setShowLookupModal(false)} navigate={navigate} />
      )}

      <SectionChat section="firstTimers" />
    </>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function FirstTimerCard({ ft, shepherds, onEdit, onDelete, onAssign }) {
  const [assignOpen, setAssignOpen] = useState(false);

  return (
    <Card style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, flex: 1, marginRight: 8 }}>{ft.name}</h3>
        <Badge color={ft.shepherd_id ? 'var(--green)' : 'var(--amber)'}>
          {ft.shepherd_id ? '✓ Assigned' : 'Unassigned'}
        </Badge>
      </div>

      {ft.visit_date && (
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Calendar size={10} /> {format(parseISO(ft.visit_date), 'dd MMM yyyy')}
        </p>
      )}
      {ft.phone && (
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Phone size={10} /> {ft.phone}
        </p>
      )}
      {ft.shepherds && (
        <p style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Users size={10} /> {ft.shepherds.name}
        </p>
      )}
      {ft.prayer_request && (
        <div style={{ marginTop: 8, padding: '7px 10px', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, fontSize: 11, color: 'var(--text2)' }}>
          🙏 {ft.prayer_request}
        </div>
      )}

      {/* Action row */}
      <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        {/* Inline shepherd assign */}
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            onClick={() => setAssignOpen(!assignOpen)}
            style={{
              width: '100%', padding: '5px 10px', borderRadius: 7, fontSize: 11,
              background: 'var(--surface)', border: '1px solid var(--border)',
              cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <UserCheck size={11} />
            {ft.shepherds ? ft.shepherds.name : 'Assign shepherd'}
          </button>
          {assignOpen && (
            <div style={{
              position: 'absolute', bottom: '110%', left: 0, right: 0,
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
              maxHeight: 200, overflowY: 'auto', zIndex: 99, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}>
              <button onClick={() => { onAssign(null); setAssignOpen(false); }} style={{ width: '100%', padding: '8px 12px', background: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
                — Remove assignment
              </button>
              {shepherds.map(s => (
                <button key={s.id} onClick={() => { onAssign(s.id); setAssignOpen(false); }} style={{
                  width: '100%', padding: '8px 12px',
                  background: s.id === ft.shepherd_id ? 'rgba(201,168,76,0.1)' : 'none',
                  cursor: 'pointer', fontSize: 12, textAlign: 'left', color: 'var(--text2)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  {s.id === ft.shepherd_id ? '✓ ' : ''}{s.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <Btn size="sm" variant="ghost" onClick={onEdit}><Edit2 size={12} /></Btn>
        <Btn size="sm" variant="danger" onClick={onDelete}><Trash2 size={12} /></Btn>
      </div>
    </Card>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function FirstTimerModal({ onSave, onClose, shepherds, bacentas, ft, editMode }) {
  const blank = { name: '', phone: '', email: '', address: '', shepherd_id: '', bacenta_id: '', visit_date: new Date().toISOString().slice(0, 10), notes: '', how_did_you_hear: '', is_born_again: '', has_home_church: '', home_church_name: '', interested_in_joining: '', prayer_request: '', occupation: '' };
  const [form, setForm] = useState(ft ? {
    name: ft.name || '', phone: ft.phone || '', email: ft.email || '',
    address: ft.address || '', shepherd_id: ft.shepherd_id || '',
    bacenta_id: ft.bacenta_id || '',
    visit_date: ft.visit_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    notes: ft.notes || '',
    how_did_you_hear: ft.how_did_you_hear || '',
    is_born_again: ft.is_born_again || '',
    has_home_church: ft.has_home_church || '',
    home_church_name: ft.home_church_name || '',
    interested_in_joining: ft.interested_in_joining || '',
    prayer_request: ft.prayer_request || '',
    occupation: ft.occupation || '',
  } : blank);

  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function submit() {
    if (!form.name.trim()) return;
    onSave({
      ...form,
      shepherd_id: form.shepherd_id || null,
      bacenta_id: form.bacenta_id || null,
    });
  }

  return (
    <Modal title={editMode ? `Edit — ${ft?.name}` : 'Register First Timer'} onClose={onClose}>
      <p style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, marginBottom: 12, letterSpacing: '0.05em' }}>BASIC INFORMATION</p>
          <DuplicateNameField
        value={form.name}
        onChange={v => setForm(f => ({ ...f, name: v }))}
        excludeId={ft?.id}
        autoFocus
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Phone"><input value={form.phone} onChange={s('phone')} /></FormField>
        <FormField label="Email"><input value={form.email} onChange={s('email')} type="email" /></FormField>
      </div>
      <FormField label="Address"><input value={form.address} onChange={s('address')} /></FormField>
      <FormField label="Date First Visited"><input type="date" value={form.visit_date} onChange={s('visit_date')} /></FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Assign Shepherd">
          <select value={form.shepherd_id} onChange={s('shepherd_id')}>
            <option value="">None</option>
            {shepherds.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
          </select>
        </FormField>
        <FormField label="Assign Bacenta">
          <select value={form.bacenta_id} onChange={s('bacenta_id')}>
            <option value="">None</option>
            {bacentas.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Notes"><textarea value={form.notes} onChange={s('notes')} rows={2} /></FormField>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
        <p style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, marginBottom: 12, letterSpacing: '0.05em' }}>QUESTIONNAIRE</p>
        {FIRST_TIMER_QUESTIONS.map(q => (
          <FormField key={q.key} label={q.label}>
            <input value={form[q.key] || ''} onChange={s(q.key)} />
          </FormField>
        ))}
      </div>

      <Btn onClick={submit} disabled={!form.name.trim()} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
        <Save size={13} /> {editMode ? 'Save Changes' : 'Register First Timer'}
      </Btn>
    </Modal>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ shepherds, onImport, onClose }) {
  const [step, setStep] = useState('upload');
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState('');
  const [shepherdId, setShepherdId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef();

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = parseSpreadsheet(e.target.result);
        if (parsed.length === 0) {
          setErrors(['No valid rows found. Make sure the file has a header row with at least a "Name" column.']);
          return;
        }
        setRows(parsed);
        setErrors([]);
        setStep('preview');
      } catch (err) {
        setErrors([`Could not read file: ${err.message}`]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function runImport() {
    setImporting(true);
    const existingNames = await getExistingNames();
    const dupes = rows.filter(r => existingNames.has(r.name.trim().toLowerCase())).map(r => r.name);
    const error = await onImport(rows, shepherdId || null);
    setImporting(false);
    if (error) {
      setErrors([error.message || 'Import failed. Please check your data.']);
    } else {
      setImportResult(rows.length);
      if (dupes.length > 0) {
        setErrors([`⚠️ Possible duplicates: ${dupes.join(', ')}`]);
      }
      setStep('done');
    }
  }

  return (
    <Modal title="Import First Timers" onClose={onClose}>
      {step === 'upload' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
            Upload a <strong>CSV</strong> or <strong>Excel (.xlsx)</strong> file with a header row.
            Recognised columns: <em>Name, Phone, Email, Address, Date, Notes, How did you hear, Prayer Request, Occupation, Born Again.</em>{' '}
            Only <strong>Name</strong> is required.
          </p>
          <div
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current.click()}
            style={{ border: '2px dashed var(--gold)', borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16, background: 'rgba(201,168,76,0.05)' }}
          >
            <FileSpreadsheet size={32} color="var(--gold)" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Drop file here or click to browse</p>
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>CSV, XLSX, XLS accepted</p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </div>
          {errors.map((err, i) => (
            <div key={i} style={{ padding: '10px 14px', background: 'rgba(224,85,85,0.1)', border: '1px solid #e05555', borderRadius: 8, fontSize: 13, color: '#e05555', marginBottom: 8 }}>⚠️ {err}</div>
          ))}
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
            Need a template?{' '}
            <button onClick={() => {
              const ws = XLSX.utils.aoa_to_sheet([
                ['Name','Phone','Email','Address','Date','Notes','How did you hear','Born Again','Prayer Request','Occupation'],
                ['John Doe','+233240000000','john@example.com','Accra','2025-01-15','','Friend','Yes','','Teacher'],
              ]);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'First Timers');
              XLSX.writeFile(wb, 'first_timers_template.xlsx');
            }} style={{ background: 'none', color: 'var(--gold)', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>
              Download template
            </button>
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CheckCircle size={16} color="var(--green)" />
            <span style={{ fontSize: 14, fontWeight: 500 }}>{rows.length} row{rows.length !== 1 ? 's' : ''} ready from <em>{fileName}</em></span>
          </div>
          <FormField label="Assign a shepherd to all (optional)">
            <select value={shepherdId} onChange={e => setShepherdId(e.target.value)}>
              <option value="">No shepherd yet</option>
              {shepherds.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>
          <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', position: 'sticky', top: 0 }}>
                  {['Name','Phone','Email','Date'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text3)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text2)' }}>{r.phone || '—'}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text2)' }}>{r.email || '—'}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text2)' }}>{r.visit_date}</td>
                  </tr>
                ))}
                {rows.length > 50 && (
                  <tr><td colSpan={4} style={{ padding: '8px 10px', color: 'var(--text3)', textAlign: 'center', fontStyle: 'italic' }}>… and {rows.length - 50} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {errors.map((err, i) => (
            <div key={i} style={{ padding: '10px 14px', background: 'rgba(224,85,85,0.1)', border: '1px solid #e05555', borderRadius: 8, fontSize: 13, color: '#e05555', marginBottom: 8 }}>⚠️ {err}</div>
          ))}
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="secondary" onClick={() => setStep('upload')} style={{ flex: 1, justifyContent: 'center' }}>← Back</Btn>
            <Btn onClick={runImport} disabled={importing} style={{ flex: 2, justifyContent: 'center' }}>
              <Upload size={13} /> {importing ? 'Importing…' : `Import ${rows.length} Records`}
            </Btn>
          </div>
        </>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <CheckCircle size={44} color="var(--green)" style={{ margin: '0 auto 14px' }} />
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Import complete!</h3>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>{importResult} first timer{importResult !== 1 ? 's' : ''} added successfully.</p>
          <Btn onClick={onClose} style={{ justifyContent: 'center', minWidth: 140 }}>Done</Btn>
        </div>
      )}
    </Modal>
  );
}

// ─── "Do you know this person?" Lookup ───────────────────────────────────────
function LookupModal({ onClose, navigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setResults(null);
    const q = query.trim();
    const [{ data: ftRows }, { data: sheepRows }, { data: shepherdRows }] = await Promise.all([
      supabase.from('first_timers').select('id, name, phone, shepherd_id, shepherds(name)').ilike('name', `%${q}%`).limit(10),
      supabase.from('sheep').select('id, name, phone, shepherd_id, shepherds(name)').ilike('name', `%${q}%`).limit(10),
      supabase.from('shepherds').select('id, name, phone, role').ilike('name', `%${q}%`).limit(10),
    ]);
    setResults({ firstTimers: ftRows || [], sheep: sheepRows || [], shepherds: shepherdRows || [] });
    setLoading(false);
  }

  const total = results ? results.firstTimers.length + results.sheep.length + results.shepherds.length : 0;

  return (
    <Modal title="Do you know this person?" onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
        Search by name across first timers, members, and shepherds.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="e.g. Kwame, Sarah, Mensah..." autoFocus style={{ flex: 1 }} />
        <Btn onClick={search} disabled={loading || !query.trim()}>{loading ? '…' : <><Search size={13} /> Search</>}</Btn>
      </div>

      {results && (
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {total === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 14 }}>No one found with that name.</p>
          ) : (
            <>
              {results.firstTimers.map(p => (
                <ResultRow key={p.id} person={p} type="First Timer" typeColor="var(--amber)" onClose={onClose} navigate={() => { onClose(); /* no detail page for ft yet, could add */ }} />
              ))}
              {results.sheep.map(p => (
                <ResultRow key={p.id} person={p} type="Member" typeColor="var(--blue)" onClose={onClose} navigate={() => { onClose(); navigate(`/sheep/${p.id}`); }} />
              ))}
              {results.shepherds.map(p => (
                <ResultRow key={p.id} person={p} type="Shepherd" typeColor="var(--gold)" onClose={onClose} navigate={() => { onClose(); navigate(`/shepherds/${p.id}`); }} />
              ))}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function ResultRow({ person, type, typeColor, navigate }) {
  return (
    <button onClick={navigate} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>{person.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 10 }}>
          {person.phone && <span>📞 {person.phone}</span>}
          <span style={{ color: typeColor }}>● {type}</span>
          {person.shepherds && <span>🐑 {person.shepherds.name}</span>}
        </div>
      </div>
      <ChevronRight size={14} color="var(--text3)" />
    </button>
  );
}

// expose a named export too so routing works either way
export { FirstTimers };

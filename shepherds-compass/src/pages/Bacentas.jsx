import SectionChat from '../components/SectionChat';
import { useState, useEffect } from 'react';
import { useDbRefresh } from '../useDbRefresh';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { parseMonthlyReport } from '../groq';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader, GoodBadBetter } from '../components/ui';
import { Plus, ArrowLeft } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';

export function BacentasList() {
  const [bacentas, setBacentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useDbRefresh(load, 'bacentas');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('bacentas').select('*, sheep(count), shepherds(count)').order('name');
    setBacentas(data || []);
    setLoading(false);
  }

  async function add(form) {
    await supabase.from('bacentas').insert(form);
    setShowModal(false);
    load();
  }

  if (loading) return <Loader />;

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <PageHeader title="Bacentas" subtitle="Home Bible study groups"
        actions={<Btn onClick={() => setShowModal(true)}><Plus size={14} /> Add Bacenta</Btn>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {bacentas.map(b => (
          <Card key={b.id} onClick={() => navigate(`/bacentas/${b.id}`)}>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>{b.name}</h3>
            {b.location && <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>📍 {b.location}</p>}
          </Card>
        ))}
        {bacentas.length === 0 && <EmptyState message="No bacentas yet." icon="🏠" />}
      </div>
      {showModal && (
        <Modal title="Add Bacenta" onClose={() => setShowModal(false)}>
          <BacentaForm onSave={add} onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </div>
  );
}

export function BacentaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bacenta, setBacenta] = useState(null);
  const [members, setMembers] = useState([]);
  const [shepherds, setShepherds] = useState([]);
  const [reports, setReports] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const groqKey = localStorage.getItem('groq_key') || '';

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: bac }, { data: mem }, { data: sh }, { data: rep }] = await Promise.all([
      supabase.from('bacentas').select('*').eq('id', id).single(),
      supabase.from('sheep').select('*, shepherds(name)').eq('bacenta_id', id).order('name'),
      supabase.from('shepherds').select('*').eq('bacenta_id', id).order('name'),
      supabase.from('bacenta_reports').select('*').eq('bacenta_id', id).order('month', { ascending: false }),
    ]);
    setBacenta(bac);
    setMembers(mem || []);
    setShepherds(sh || []);
    setReports(rep || []);
    setLoading(false);
  }

  async function addReport({ rawInput }) {
    const parsed = await parseMonthlyReport(rawInput, groqKey);
    await supabase.from('bacenta_reports').insert({
      bacenta_id: id,
      month: startOfMonth(new Date()).toISOString().slice(0, 10),
      raw_input: rawInput,
      good: parsed?.good || '',
      can_be_better: parsed?.can_be_better || '',
      bad: parsed?.bad || '',
    });
    setShowReportModal(false);
    load();
  }

  if (loading) return <Loader />;
  if (!bacenta) return <p style={{ padding: 32 }}>Bacenta not found.</p>;

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <button onClick={() => navigate('/bacentas')} style={{ background: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
        <ArrowLeft size={14} /> Back to Bacentas
      </button>
      <PageHeader title={bacenta.name} subtitle={bacenta.location || 'Home Bible Study Group'}
        actions={<Btn size="sm" onClick={() => setShowReportModal(true)}><Plus size={12} /> Add Monthly Report</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 24 }}>
        <Card>
          <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text2)' }}>Shepherds ({shepherds.length})</h4>
          {shepherds.map(s => (
            <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
              onClick={() => navigate(`/shepherds/${s.id}`)}>
              {s.name} <Badge color={s.role === 'leader' ? 'var(--gold)' : 'var(--blue)'}>{s.role}</Badge>
            </div>
          ))}
          {shepherds.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>No shepherds assigned.</p>}
        </Card>

        <Card>
          <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text2)' }}>Members ({members.length})</h4>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {members.map(m => (
              <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' }}
                onClick={() => navigate(`/sheep/${m.id}`)}>
                <span>{m.name}</span>
                {m.shepherds && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>→ {m.shepherds.name}</span>}
              </div>
            ))}
            {members.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>No members yet.</p>}
          </div>
        </Card>
      </div>

      <h3 style={{ fontSize: 16, marginBottom: 14 }}>Monthly Reports</h3>
      {reports.map(r => (
        <Card key={r.id} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
            {format(new Date(r.month), 'MMMM yyyy')}
          </div>
          <GoodBadBetter good={r.good} bad={r.bad} better={r.can_be_better} />
        </Card>
      ))}
      {reports.length === 0 && <EmptyState message="No monthly reports yet." icon="📊" />}

      {showReportModal && (
        <Modal title="Add Monthly Report" onClose={() => setShowReportModal(false)}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Type the report freely — the AI will organise it into Good / Can Be Better / Bad sections.
          </p>
          <ReportForm onSave={addReport} onClose={() => setShowReportModal(false)} />
        </Modal>
      )}
      <SectionChat section="bacentas" pageContext={{ currentId: id }} />
    </div>
  );
}

function BacentaForm({ onSave, onClose }) {
  const [form, setForm] = useState({ name: '', location: '' });
  return (
    <>
      <FormField label="Bacenta Name *"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FormField>
      <FormField label="Location"><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></FormField>
      <Btn onClick={() => form.name && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Save Bacenta</Btn>
    </>
  );
}

function ReportForm({ onSave, onClose }) {
  const [text, setText] = useState('');
  return (
    <>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Write the full report here... e.g. 'The attendance was great this month. We need better preparation for Bible study. Some members stopped coming.'" style={{ minHeight: 140 }} />
      <Btn onClick={() => text && onSave({ rawInput: text })} style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>Submit Report</Btn>
    </>
  );
}
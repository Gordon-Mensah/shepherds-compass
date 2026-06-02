import { useState, useEffect } from 'react';
import { useDbRefresh } from '../useDbRefresh';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { FIRST_TIMER_QUESTIONS, BASONTAS } from '../constants';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader } from '../components/ui';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function FirstTimers() {
  const [firstTimers, setFirstTimers] = useState([]);
  const [shepherds, setShepherds] = useState([]);
  const [bacentas, setBacentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useDbRefresh(load, 'sheep');

  async function load() {
    setLoading(true);
    const [{ data: ft }, { data: sh }, { data: bac }] = await Promise.all([
      supabase.from('sheep').select('*, shepherds(name), bacentas(name)').eq('first_timer', true).order('first_timer_date', { ascending: false }),
      supabase.from('shepherds').select('id, name').order('name'),
      supabase.from('bacentas').select('id, name').order('name'),
    ]);
    setFirstTimers(ft || []);
    setShepherds(sh || []);
    setBacentas(bac || []);
    setLoading(false);
  }

  async function addFirstTimer(data) {
    await supabase.from('sheep').insert(data);
    setShowModal(false);
    load();
  }

  if (loading) return <Loader />;

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <PageHeader
        title="First Timers"
        subtitle={`${firstTimers.length} first timer${firstTimers.length !== 1 ? 's' : ''} recorded`}
        actions={<Btn onClick={() => setShowModal(true)}><Plus size={14} /> Add First Timer</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {firstTimers.map(ft => (
          <Card key={ft.id} onClick={() => navigate(`/sheep/${ft.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>{ft.name}</h3>
              <Badge color="var(--amber)">First Timer</Badge>
            </div>
            {ft.first_timer_date && (
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                📅 {format(new Date(ft.first_timer_date), 'dd MMM yyyy')}
              </p>
            )}
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {ft.phone && <div>📞 {ft.phone}</div>}
              {ft.shepherds && <div>🐑 {ft.shepherds.name}</div>}
            </div>
            {ft.first_timer_data?.prayer_request && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--gold-glow)', border: '1px solid var(--gold-dim)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                🙏 {ft.first_timer_data.prayer_request}
              </div>
            )}
          </Card>
        ))}
        {firstTimers.length === 0 && <EmptyState message="No first timers recorded yet." icon="✨" />}
      </div>

      {showModal && (
        <FirstTimerModal shepherds={shepherds} bacentas={bacentas} onSave={addFirstTimer} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}

function FirstTimerModal({ onSave, onClose, shepherds, bacentas }) {
  const [basic, setBasic] = useState({ name: '', phone: '', email: '', address: '', shepherd_id: '', bacenta_id: '', basonta: '', first_timer_date: new Date().toISOString().slice(0, 10) });
  const [answers, setAnswers] = useState({});

  const setB = k => e => setBasic(f => ({ ...f, [k]: e.target.value }));
  const setA = k => e => setAnswers(f => ({ ...f, [k]: e.target.value }));

  function submit() {
    if (!basic.name) return;
    onSave({
      ...basic,
      first_timer: true,
      first_timer_data: answers,
      bacenta_id: basic.bacenta_id || null,
      shepherd_id: basic.shepherd_id || null,
    });
  }

  return (
    <Modal title="Register First Timer" onClose={onClose}>
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 500, marginBottom: 12 }}>BASIC INFORMATION</p>
        <FormField label="Full Name *"><input value={basic.name} onChange={setB('name')} /></FormField>
        <FormField label="Phone"><input value={basic.phone} onChange={setB('phone')} /></FormField>
        <FormField label="Email"><input value={basic.email} onChange={setB('email')} /></FormField>
        <FormField label="Address"><input value={basic.address} onChange={setB('address')} /></FormField>
        <FormField label="Date First Visited"><input type="date" value={basic.first_timer_date} onChange={setB('first_timer_date')} /></FormField>
        <FormField label="Assign Shepherd">
          <select value={basic.shepherd_id} onChange={setB('shepherd_id')}>
            <option value="">None</option>
            {shepherds.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormField>
        <FormField label="Assign Bacenta">
          <select value={basic.bacenta_id} onChange={setB('bacenta_id')}>
            <option value="">None</option>
            {bacentas.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </FormField>
      </div>

      <p style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 500, marginBottom: 12 }}>QUESTIONNAIRE</p>
      {FIRST_TIMER_QUESTIONS.map(q => (
        <FormField key={q.key} label={q.label}>
          <input value={answers[q.key] || ''} onChange={setA(q.key)} />
        </FormField>
      ))}

      <Btn onClick={submit} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>Register First Timer</Btn>
    </Modal>
  );
}
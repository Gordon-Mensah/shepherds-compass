import { useState, useEffect } from 'react';
import { useDbRefresh } from '../useDbRefresh';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { parseMonthlyReport } from '../groq';
import { BASONTAS } from '../constants';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader, GoodBadBetter } from '../components/ui';
import { Plus, ArrowLeft } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';

export function BasonstasList() {
  const [memberCounts, setMemberCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useDbRefresh(load, 'basonta_reports');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('sheep').select('basonta').not('basonta', 'is', null);
    const counts = {};
    (data || []).forEach(m => { if (m.basonta) counts[m.basonta] = (counts[m.basonta] || 0) + 1; });
    setMemberCounts(counts);
    setLoading(false);
  }

  if (loading) return <Loader />;

  const colors = ['var(--gold)', 'var(--blue)', 'var(--green)', 'var(--amber)', 'var(--red)', 'var(--text2)', 'var(--gold2)'];

  return (
    <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
      <PageHeader title="Basontas" subtitle="Church activity groups and ministries" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {BASONTAS.map((b, i) => (
          <Card key={b} onClick={() => navigate(`/basontas/${encodeURIComponent(b)}`)}
            style={{ borderTop: `3px solid ${colors[i % colors.length]}` }}>
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>{b}</h3>
            <p style={{ fontSize: 24, fontFamily: 'Cormorant Garamond, serif', color: colors[i % colors.length], fontWeight: 700 }}>
              {memberCounts[b] || 0}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>members</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function BasontaDetail() {
  const { name } = useParams();
  const basontaName = decodeURIComponent(name);
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [reports, setReports] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const groqKey = localStorage.getItem('groq_key') || '';

  useEffect(() => { load(); }, [basontaName]);

  async function load() {
    setLoading(true);
    const [{ data: mem }, { data: rep }] = await Promise.all([
      supabase.from('sheep').select('*, shepherds(name), bacentas(name)').eq('basonta', basontaName).order('name'),
      supabase.from('basonta_reports').select('*').eq('basonta', basontaName).order('month', { ascending: false }),
    ]);
    setMembers(mem || []);
    setReports(rep || []);
    setLoading(false);
  }

  async function addReport({ rawInput }) {
    const parsed = await parseMonthlyReport(rawInput, groqKey);
    await supabase.from('basonta_reports').insert({
      basonta: basontaName,
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

  return (
    <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
      <button onClick={() => navigate('/basontas')} style={{ background: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
        <ArrowLeft size={14} /> Back to Basontas
      </button>
      <PageHeader title={basontaName}
        subtitle={`${members.length} member${members.length !== 1 ? 's' : ''}`}
        actions={<Btn size="sm" onClick={() => setShowReportModal(true)}><Plus size={12} /> Add Monthly Report</Btn>}
      />

      <Card style={{ marginBottom: 24 }}>
        <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text2)' }}>Members</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {members.map(m => (
            <div key={m.id} onClick={() => navigate(`/sheep/${m.id}`)}
              style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {m.shepherds?.name || 'No shepherd'} · {m.bacentas?.name || 'No bacenta'}
              </div>
            </div>
          ))}
        </div>
        {members.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>No members in this basonta yet. Assign members from the Sheep section.</p>}
      </Card>

      <h3 style={{ fontSize: 16, marginBottom: 14 }}>Monthly Reports</h3>
      {reports.map(r => (
        <Card key={r.id} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{format(new Date(r.month), 'MMMM yyyy')}</div>
          <GoodBadBetter good={r.good} bad={r.bad} better={r.can_be_better} />
        </Card>
      ))}
      {reports.length === 0 && <EmptyState message="No monthly reports yet." icon="📊" />}

      {showReportModal && (
        <Modal title={`Monthly Report — ${basontaName}`} onClose={() => setShowReportModal(false)}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Write the report freely. The AI will organise it.
          </p>
          <ReportForm onSave={addReport} />
        </Modal>
      )}
    </div>
  );
}

function ReportForm({ onSave }) {
  const [text, setText] = useState('');
  return (
    <>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Write the full group report..." style={{ minHeight: 140 }} />
      <Btn onClick={() => text && onSave({ rawInput: text })} style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>Submit Report</Btn>
    </>
  );
}
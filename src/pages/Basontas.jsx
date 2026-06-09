import SectionChat from '../components/SectionChat';
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
    // Count both regular members (sheep) AND shepherds in each basonta
    const [{ data: sheepData }, { data: shepherdData }] = await Promise.all([
      supabase.from('sheep').select('basonta').not('basonta', 'is', null),
      supabase.from('shepherds').select('basonta').not('basonta', 'is', null),
    ]);
    const counts = {};
    (sheepData || []).forEach(m => { if (m.basonta) counts[m.basonta] = (counts[m.basonta] || 0) + 1; });
    (shepherdData || []).forEach(s => { if (s.basonta) counts[s.basonta] = (counts[s.basonta] || 0) + 1; });
    setMemberCounts(counts);
    setLoading(false);
  }

  if (loading) return <Loader />;

  const colors = ['var(--gold)', 'var(--blue)', 'var(--green)', 'var(--amber)', 'var(--red)', 'var(--text2)', 'var(--gold2)'];

  return (
    <>
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
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
    <SectionChat section="basontas" pageContext={{ currentName: name }} />
  </>
  );
}

export function BasontaDetail() {
  const { name } = useParams();
  const basontaName = decodeURIComponent(name);
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [shepherdMembers, setShepherdMembers] = useState([]);
  const [reports, setReports] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const groqKey = localStorage.getItem('groq_key') || '';

  useEffect(() => { load(); }, [basontaName]);

  async function load() {
    setLoading(true);
    const [{ data: mem }, { data: sheps }, { data: rep }] = await Promise.all([
      supabase.from('sheep').select('*, shepherds(name), bacentas(name)').eq('basonta', basontaName).order('name'),
      supabase.from('shepherds').select('*, bacentas(name)').eq('basonta', basontaName).order('name'),
      supabase.from('basonta_reports').select('*').eq('basonta', basontaName).order('month', { ascending: false }),
    ]);
    setMembers(mem || []);
    setShepherdMembers(sheps || []);
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

  const basontaShepherd = shepherdMembers.find(s => s.basonta_role === 'basonta_shepherd');
  const totalCount = members.length + shepherdMembers.length;

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <button onClick={() => navigate('/basontas')} style={{ background: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
        <ArrowLeft size={14} /> Back to Basontas
      </button>
      <PageHeader title={basontaName}
        subtitle={`${totalCount} member${totalCount !== 1 ? 's' : ''} total`}
        actions={<Btn size="sm" onClick={() => setShowReportModal(true)}><Plus size={12} /> Add Monthly Report</Btn>}
      />

      {/* Basonta Shepherd (leader) highlight */}
      {basontaShepherd && (
        <Card style={{ marginBottom: 16, borderColor: 'var(--gold)', borderWidth: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⭐</span>
            <div>
              <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Basonta Shepherd</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{basontaShepherd.name}</div>
              {basontaShepherd.bacentas && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{basontaShepherd.bacentas.name}</div>}
            </div>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 24 }}>
        <h4 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text2)' }}>All Members</h4>

        {/* Shepherd members */}
        {shepherdMembers.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Shepherds in this Basonta</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 16 }}>
              {shepherdMembers.map(s => (
                <div key={s.id} onClick={() => navigate(`/shepherds/${s.id}`)}
                  style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, cursor: 'pointer', border: `1px solid ${s.basonta_role === 'basonta_shepherd' ? 'var(--gold)' : 'var(--border)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</div>
                    <Badge color={s.basonta_role === 'basonta_shepherd' ? 'var(--gold)' : 'var(--blue)'}>
                      {s.basonta_role === 'basonta_shepherd' ? 'Leader' : 'Shepherd'}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.bacentas?.name || 'No bacenta'}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Regular members */}
        {members.length > 0 && (
          <>
            {shepherdMembers.length > 0 && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Regular Members</div>}
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
          </>
        )}

        {totalCount === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>No members in this basonta yet. Assign members from the Sheep section, or assign shepherds from the Shepherds section.</p>}
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
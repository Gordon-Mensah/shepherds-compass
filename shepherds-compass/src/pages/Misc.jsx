import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Card, Badge, Btn, PageHeader, Modal, FormField, EmptyState, Loader } from '../components/ui';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';

export function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    setCampaigns(data || []);
    setLoading(false);
  }

  async function add(form) {
    await supabase.from('campaigns').insert(form);
    setShowModal(false);
    load();
  }

  const statusColor = { planning: 'var(--text2)', active: 'var(--green)', completed: 'var(--blue)' };

  if (loading) return <Loader />;

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <PageHeader title="Campaigns" subtitle="Church evangelism and outreach campaigns"
        actions={<Btn onClick={() => setShowModal(true)}><Plus size={14} /> New Campaign</Btn>}
      />
      <div style={{ background: 'var(--gold-dim)', border: '1px solid var(--gold)', borderRadius: 10, padding: '14px 18px', marginBottom: 24, fontSize: 13, color: 'var(--text2)' }}>
        💡 Campaign management is being built. You can create and track campaigns here. More detailed campaign features are coming soon.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {campaigns.map(c => (
          <Card key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3 style={{ fontSize: 16 }}>{c.name}</h3>
              <Badge color={statusColor[c.status]}>{c.status}</Badge>
            </div>
            {c.description && <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{c.description}</p>}
            {(c.start_date || c.end_date) && (
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                {c.start_date && format(new Date(c.start_date), 'dd MMM yyyy')}
                {c.end_date && ` → ${format(new Date(c.end_date), 'dd MMM yyyy')}`}
              </p>
            )}
          </Card>
        ))}
        {campaigns.length === 0 && <EmptyState message="No campaigns yet." icon="📣" />}
      </div>

      {showModal && (
        <Modal title="New Campaign" onClose={() => setShowModal(false)}>
          <CampaignForm onSave={add} onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </div>
  );
}

function CampaignForm({ onSave, onClose }) {
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '', status: 'planning' });
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <FormField label="Campaign Name *"><input value={form.name} onChange={s('name')} /></FormField>
      <FormField label="Description"><textarea value={form.description} onChange={s('description')} /></FormField>
      <FormField label="Status">
        <select value={form.status} onChange={s('status')}>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <FormField label="Start Date"><input type="date" value={form.start_date} onChange={s('start_date')} /></FormField>
        <FormField label="End Date"><input type="date" value={form.end_date} onChange={s('end_date')} /></FormField>
      </div>
      <Btn onClick={() => form.name && onSave(form)} style={{ width: '100%', justifyContent: 'center' }}>Create Campaign</Btn>
    </>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────
export function Settings() {
  const [key, setKey] = useState(localStorage.getItem('groq_key') || '');
  const [saved, setSaved] = useState(false);

  function save() {
    localStorage.setItem('groq_key', key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowY: 'auto' }}>
      <PageHeader title="Settings" subtitle="Configure your system" />

      <div style={{ maxWidth: 520 }}>
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>Groq API Key</h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Required for the AI assistant and smart report parsing. Get your key at{' '}
            <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>console.groq.com</a>
          </p>
          <FormField label="API Key (stored locally in your browser)">
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="gsk_..."
            />
          </FormField>
          <Btn onClick={save} variant={saved ? 'secondary' : 'primary'}>
            {saved ? '✓ Saved' : 'Save Key'}
          </Btn>
        </Card>

        <Card>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>Database Setup</h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            Connected to Supabase. If you haven't run the schema yet, open <strong>SCHEMA.sql</strong> in your Supabase SQL Editor and run it once.
          </p>
          <div style={{ padding: '10px 14px', background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 8, fontSize: 12, color: 'var(--green)' }}>
            ✓ Supabase project: mwyzssnzbjhdqoowmtcw
          </div>
        </Card>
      </div>
    </div>
  );
}
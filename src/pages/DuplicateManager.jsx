import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Btn, Badge, Modal, Loader } from '../components/ui';
import {
  GitMerge, Trash2, Eye, RefreshCw, CheckCircle,
  AlertTriangle, Users, UserPlus, ChevronRight, X, Search,
} from 'lucide-react';

// ─── Similarity score (0-1) based on name matching ───────────────────────────
function similarity(a, b) {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  // Check word overlap
  const wa = new Set(a.split(/\s+/));
  const wb = new Set(b.split(/\s+/));
  const shared = [...wa].filter(w => wb.has(w) && w.length > 1).length;
  const total = Math.max(wa.size, wb.size);
  return total > 0 ? shared / total : 0;
}

function typeLabel(source) {
  if (source === 'sheep') return { label: 'Member', color: 'var(--blue)' };
  if (source === 'first_timers') return { label: 'First Timer', color: 'var(--amber)' };
  if (source === 'shepherds') return { label: 'Shepherd', color: 'var(--gold)' };
  return { label: source, color: 'var(--text3)' };
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DuplicateManager() {
  const [groups, setGroups] = useState([]);       // array of duplicate groups
  const [dismissed, setDismissed] = useState([]); // group keys user has dismissed
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null); // { group, keepId }
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState(null);
  const navigate = useNavigate();

  async function scan() {
    setLoading(true);
    setGroups([]);
    setDismissed([]);
    setScanned(false);

    // Load all people from all three tables
    const [{ data: sheep }, { data: ft }, { data: shepherds }] = await Promise.all([
      supabase.from('sheep').select('id, name, phone, email, address, shepherd_id, is_shepherd, created_at').eq('is_active', true),
      supabase.from('first_timers').select('id, name, phone, email, address, shepherd_id, visit_date, created_at'),
      supabase.from('shepherds').select('id, name, phone, email, address, role, created_at'),
    ]);

    const all = [
      ...(sheep || []).map(p => ({ ...p, _source: 'sheep' })),
      ...(ft || []).map(p => ({ ...p, _source: 'first_timers' })),
      ...(shepherds || []).map(p => ({ ...p, _source: 'shepherds' })),
    ];

    // Find groups of likely duplicates
    const used = new Set();
    const found = [];

    for (let i = 0; i < all.length; i++) {
      if (used.has(i)) continue;
      const group = [all[i]];
      for (let j = i + 1; j < all.length; j++) {
        if (used.has(j)) continue;
        const score = similarity(all[i].name, all[j].name);
        // Also boost match if phone numbers match
        const phoneMatch = all[i].phone && all[j].phone &&
          all[i].phone.replace(/\D/g, '') === all[j].phone.replace(/\D/g, '');
        if (score >= 0.75 || phoneMatch) {
          group.push(all[j]);
          used.add(j);
        }
      }
      if (group.length > 1) {
        used.add(i);
        found.push(group);
      }
    }

    setGroups(found);
    setScanned(true);
    setLoading(false);
  }

  // ── Merge: keep one record, reroute all FK references, delete the rest ──────
  async function merge(group, keepId) {
    setMerging(true);
    const keeper = group.find(p => p.id === keepId);
    const toDelete = group.filter(p => p.id !== keepId);

    for (const dup of toDelete) {
      // Reroute FK references based on the duplicate's source table
      if (dup._source === 'sheep') {
        // Reroute sheep_visits that pointed to this sheep
        await supabase.from('sheep_visits').update({ sheep_id: keeper._source === 'sheep' ? keepId : null }).eq('sheep_id', dup.id);
        // Reroute sheep that were assigned to this shepherd (if sheep was also a shepherd)
        if (dup.is_shepherd) {
          await supabase.from('sheep').update({ shepherd_id: keeper._source === 'shepherds' ? keepId : null }).eq('shepherd_id', dup.id);
        }
        await supabase.from('sheep').delete().eq('id', dup.id);
      }

      if (dup._source === 'first_timers') {
        await supabase.from('first_timers').delete().eq('id', dup.id);
      }

      if (dup._source === 'shepherds') {
        // Reroute shepherd_tasks
        await supabase.from('shepherd_tasks').update({ shepherd_id: keeper._source === 'shepherds' ? keepId : null }).eq('shepherd_id', dup.id);
        // Reroute outreach_reports
        await supabase.from('outreach_reports').update({ shepherd_id: keeper._source === 'shepherds' ? keepId : null }).eq('shepherd_id', dup.id);
        // Reroute sheep_visits (shepherd side)
        await supabase.from('sheep_visits').update({ shepherd_id: keeper._source === 'shepherds' ? keepId : null }).eq('shepherd_id', dup.id);
        // Reroute sheep assigned to this shepherd
        await supabase.from('sheep').update({ shepherd_id: keeper._source === 'shepherds' ? keepId : null }).eq('shepherd_id', dup.id);
        await supabase.from('shepherds').delete().eq('id', dup.id);
      }
    }

    setMergeResult({ keeper, deleted: toDelete });
    setMerging(false);
    setMergeTarget(null);
    // Remove this group from the list
    setGroups(g => g.filter(gr => !gr.some(p => p.id === keepId)));
  }

  function dismiss(group) {
    const key = group.map(p => p.id).sort().join('-');
    setDismissed(d => [...d, key]);
  }

  const visibleGroups = groups.filter(group => {
    const key = group.map(p => p.id).sort().join('-');
    return !dismissed.includes(key);
  });

  return (
    <div style={{ flex: 1, padding: 'clamp(16px,4vw,32px)', overflowY: 'auto' }}>
      <PageHeader
        title="Duplicate Manager"
        subtitle="Scan your database for people who may have been added more than once"
        actions={
          <Btn onClick={scan} disabled={loading}>
            {loading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Scanning…</> : <><Search size={14} /> Scan for Duplicates</>}
          </Btn>
        }
      />

      {/* Merge success banner */}
      {mergeResult && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, background: 'rgba(74,222,128,0.1)', border: '1px solid #4ade80', borderRadius: 10, padding: '12px 16px' }}>
          <CheckCircle size={16} color="#4ade80" />
          <div style={{ flex: 1, fontSize: 13 }}>
            <strong>{mergeResult.keeper.name}</strong> kept as the main record.{' '}
            Deleted: {mergeResult.deleted.map(d => d.name).join(', ')}.
            All linked data has been re-routed.
          </div>
          <button onClick={() => setMergeResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={14} /></button>
        </div>
      )}

      {/* Not yet scanned */}
      {!scanned && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
          <GitMerge size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
          <h3 style={{ fontSize: 18, marginBottom: 8, color: 'var(--text2)' }}>Ready to scan</h3>
          <p style={{ fontSize: 14, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Click "Scan for Duplicates" to search across all members, first timers,
            and shepherds for similar or matching names and phone numbers.
          </p>
          <Btn onClick={scan}><Search size={14} /> Scan Now</Btn>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader />
          <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12 }}>Scanning all records…</p>
        </div>
      )}

      {/* Scanned — no duplicates */}
      {scanned && !loading && groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <CheckCircle size={48} color="#4ade80" style={{ marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>No duplicates found</h3>
          <p style={{ fontSize: 14, color: 'var(--text3)' }}>Your database looks clean.</p>
        </div>
      )}

      {/* All dismissed */}
      {scanned && !loading && groups.length > 0 && visibleGroups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <CheckCircle size={48} color="#4ade80" style={{ marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>All reviewed</h3>
          <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 16 }}>You've dismissed all flagged groups. Re-scan to check again.</p>
          <Btn variant="secondary" onClick={scan}><RefreshCw size={14} /> Re-scan</Btn>
        </div>
      )}

      {/* Duplicate groups */}
      {visibleGroups.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(230,160,50,0.1)', border: '1px solid var(--amber)', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--amber)' }}>
              <AlertTriangle size={14} />
              {visibleGroups.length} duplicate group{visibleGroups.length !== 1 ? 's' : ''} found
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>
              Review each group and either merge them into one record or dismiss if they're different people.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {visibleGroups.map((group, gi) => (
              <DuplicateGroup
                key={gi}
                group={group}
                onMerge={(keepId) => setMergeTarget({ group, keepId })}
                onDismiss={() => dismiss(group)}
                navigate={navigate}
              />
            ))}
          </div>
        </>
      )}

      {/* Merge confirmation modal */}
      {mergeTarget && (
        <MergeConfirmModal
          group={mergeTarget.group}
          keepId={mergeTarget.keepId}
          onConfirm={() => merge(mergeTarget.group, mergeTarget.keepId)}
          onClose={() => setMergeTarget(null)}
          merging={merging}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Duplicate Group Card ─────────────────────────────────────────────────────
function DuplicateGroup({ group, onMerge, onDismiss, navigate }) {
  const [selectedKeep, setSelectedKeep] = useState(group[0].id);

  // Sort: shepherd first, then member, then first timer — most "established" record should be default keeper
  const sorted = [...group].sort((a, b) => {
    const order = { shepherds: 0, sheep: 1, first_timers: 2 };
    return (order[a._source] ?? 3) - (order[b._source] ?? 3);
  });

  // Set default keep to most established
  useEffect(() => { setSelectedKeep(sorted[0].id); }, []);

  const phoneMatch = group.every(p => p.phone && p.phone.replace(/\D/g, '') === group[0].phone.replace(/\D/g, ''));

  return (
    <Card style={{ borderColor: 'rgba(230,160,50,0.3)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color="var(--amber)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            "{group[0].name}" — {group.length} records
          </span>
          {phoneMatch && (
            <Badge color="var(--amber)" style={{ fontSize: 10 }}>Same phone</Badge>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" variant="secondary" onClick={onDismiss}>
            <X size={12} /> Not a duplicate
          </Btn>
          <Btn size="sm" onClick={() => onMerge(selectedKeep)}>
            <GitMerge size={12} /> Merge
          </Btn>
        </div>
      </div>

      {/* Records */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {sorted.map(p => {
          const { label, color } = typeLabel(p._source);
          const isKeep = p.id === selectedKeep;
          return (
            <div
              key={p.id}
              onClick={() => setSelectedKeep(p.id)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                borderRadius: 8, cursor: 'pointer',
                border: `2px solid ${isKeep ? 'var(--gold)' : 'var(--border)'}`,
                background: isKeep ? 'rgba(201,168,76,0.06)' : 'var(--surface)',
                transition: 'all 0.15s',
              }}
            >
              {/* Keep selector */}
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                border: `2px solid ${isKeep ? 'var(--gold)' : 'var(--border)'}`,
                background: isKeep ? 'var(--gold)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isKeep && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0b0f14' }} />}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                  <Badge color={color}>{label}</Badge>
                  {isKeep && <Badge color="var(--gold)">Keep this one</Badge>}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text3)', flexWrap: 'wrap' }}>
                  {p.phone && <span>📞 {p.phone}</span>}
                  {p.email && <span>✉️ {p.email}</span>}
                  {p.address && <span>📍 {p.address}</span>}
                  {p.visit_date && <span>📅 Visited {p.visit_date}</span>}
                  {p.created_at && <span>Added {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                </div>
              </div>

              {/* View profile link */}
              {(p._source === 'sheep' || p._source === 'shepherds') && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    navigate(p._source === 'sheep' ? `/sheep/${p.id}` : `/shepherds/${p.id}`);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, flexShrink: 0 }}
                  title="View profile"
                >
                  <Eye size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
        Click a record to select which one to <strong>keep</strong>. The others will be deleted and all their linked data (tasks, visits, reports) will be moved to the kept record.
      </p>
    </Card>
  );
}

// ─── Merge Confirm Modal ──────────────────────────────────────────────────────
function MergeConfirmModal({ group, keepId, onConfirm, onClose, merging }) {
  const keeper = group.find(p => p.id === keepId);
  const toDelete = group.filter(p => p.id !== keepId);

  return (
    <Modal title="Confirm Merge" onClose={onClose}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          You are about to merge <strong>{group.length} records</strong> into one.
          This <strong>cannot be undone</strong>.
        </p>

        {/* Keeper */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Record to keep</p>
          <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid var(--gold)', borderRadius: 8, padding: '10px 14px' }}>
            <span style={{ fontWeight: 600 }}>{keeper.name}</span>
            <Badge color={typeLabel(keeper._source).color} style={{ marginLeft: 8 }}>{typeLabel(keeper._source).label}</Badge>
            {keeper.phone && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 10 }}>{keeper.phone}</span>}
          </div>
        </div>

        {/* To delete */}
        <div>
          <p style={{ fontSize: 11, color: '#f87171', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Records to delete</p>
          {toDelete.map(p => (
            <div key={p.id} style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <Badge color={typeLabel(p._source).color} style={{ marginLeft: 8 }}>{typeLabel(p._source).label}</Badge>
              {p.phone && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 10 }}>{p.phone}</span>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          ℹ️ All tasks, visit reports, outreach reports, and sheep assignments linked to the deleted records will be re-routed to <strong>{keeper.name}</strong>.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }} disabled={merging}>
          Cancel
        </Btn>
        <Btn
          onClick={onConfirm}
          disabled={merging}
          style={{ flex: 1, justifyContent: 'center', background: '#f87171', color: '#fff', borderColor: '#f87171' }}
        >
          {merging ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Merging…</> : <><GitMerge size={13} /> Confirm Merge</>}
        </Btn>
      </div>
    </Modal>
  );
}

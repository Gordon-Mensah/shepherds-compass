import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { askGroq } from '../groq';
import { runAgent } from '../groqTools';
import { extractFileText, isSupported, SUPPORTED_EXTENSIONS } from '../fileExtractor';
import { Send, Sparkles, Paperclip, X, FileText, AlertCircle, Database, MessageSquare, CheckCircle2, AlertTriangle, Brain, Trash2, Plus, ChevronLeft, Clock } from 'lucide-react';
import { getAllMemory, deleteMemory, clearAllMemory, MEMORY_TABLE_SQL } from '../memory';
import { Loader } from '../components/ui';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sessionTitle(messages) {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'New chat';
  return first.content.slice(0, 48) + (first.content.length > 48 ? '…' : '');
}

// ── Action summary card ───────────────────────────────────────────────────────
function ActionSummary({ actions }) {
  if (!actions || actions.length === 0) return null;
  const writeOps = actions.filter(a => ['insert_record','bulk_insert','update_record','delete_record'].includes(a.tool));
  if (writeOps.length === 0) return null;

  const deduped = writeOps.filter((a, i) => {
    if (a.result?.error) {
      return !writeOps.slice(i + 1).some(b => b.tool === a.tool && b.args?.table === a.args?.table && !b.result?.error);
    }
    return true;
  });

  return (
    <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Database size={12} /> Database actions
      </div>
      {deduped.map((a, i) => {
        const ok = !a.result?.error;
        const label = { insert_record: `Inserted 1 record into ${a.args.table}`, bulk_insert: `Inserted ${a.result?.inserted_count ?? '?'} records into ${a.args.table}`, update_record: `Updated record in ${a.args.table}`, delete_record: `Deleted record from ${a.args.table}` }[a.tool] || a.tool;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', color: ok ? 'var(--green, #4caf87)' : 'var(--red, #e05555)' }}>
            {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {ok ? label : `Failed: ${a.result.error}`}
          </div>
        );
      })}
    </div>
  );
}

// ── Memory panel ──────────────────────────────────────────────────────────────
function MemoryPanel({ onClose }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); setMemories(await getAllMemory()); setLoading(false); }
  async function remove(id) { await deleteMemory(id); setMemories(m => m.filter(x => x.id !== id)); }
  async function clearAll() {
    if (!confirm('Clear all memory? The AI will start fresh next conversation.')) return;
    setClearing(true); await clearAllMemory(); setMemories([]); setClearing(false);
  }

  const categories = ['decisions','tasks','people','structure','context'];
  const grouped = {};
  for (const m of memories) { if (!grouped[m.category]) grouped[m.category] = []; grouped[m.category].push(m); }
  const catColors = { decisions: 'var(--gold)', tasks: '#6c8ebf', people: '#4caf87', structure: '#e6a817', context: 'var(--text2)' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, width: '90%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain size={18} color="var(--gold)" />
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>AI Memory</h3>
            <p style={{ fontSize: 11, color: 'var(--text2)' }}>{memories.length} facts stored · persists across sessions</p>
          </div>
          <button onClick={clearAll} disabled={clearing || memories.length === 0} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Trash2 size={11} /> Clear all
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4 }}><X size={18} /></button>
        </div>
        {!loading && memories.length === 0 && (
          <div style={{ padding: '10px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
            ⚠️ Requires a <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>chat_memory</code> table in Supabase.
            {' '}<button onClick={() => navigator.clipboard?.writeText(MEMORY_TABLE_SQL)} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Copy SQL to create it</button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>Loading…</div>}
          {!loading && memories.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 30, color: 'var(--text2)', fontSize: 13 }}>
              <Brain size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
              <p>No memories yet.</p>
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>Memory builds up as you have conversations.</p>
            </div>
          )}
          {categories.map(cat => {
            if (!grouped[cat]?.length) return null;
            return (
              <div key={cat}>
                <div style={{ fontSize: 11, fontWeight: 600, color: catColors[cat], textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{cat}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grouped[cat].map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5 }}>{m.value}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>★{m.importance}</span>
                        <button onClick={() => remove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }}><X size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Sessions sidebar ──────────────────────────────────────────────────────────
function SessionsSidebar({ sessions, activeId, onSelect, onNew, onDelete }) {
  return (
    <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg2)', flexShrink: 0, height: '100%' }}>
      <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onNew} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--gold)', border: 'none', color: '#0b0f14', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Plus size={15} /> New Chat
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {sessions.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text3)', fontSize: 12, textAlign: 'center' }}>No chats yet</div>
        )}
        {sessions.map(s => (
          <div key={s.id} onClick={() => onSelect(s.id)} style={{
            padding: '9px 10px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
            background: activeId === s.id ? 'var(--gold-dim)' : 'transparent',
            border: `1px solid ${activeId === s.id ? 'var(--gold)' : 'transparent'}`,
            display: 'flex', alignItems: 'flex-start', gap: 6, transition: 'all 0.1s',
            position: 'relative',
          }}>
            <MessageSquare size={13} color={activeId === s.id ? 'var(--gold)' : 'var(--text3)'} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: activeId === s.id ? 600 : 400, color: activeId === s.id ? 'var(--gold)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={9} /> {timeAgo(s.updated_at)}
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); onDelete(s.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, opacity: 0, position: 'absolute', right: 6, top: 8 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Chat component ───────────────────────────────────────────────────────
export default function Chat() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [mode, setMode] = useState('chat');
  const [showMemory, setShowMemory] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  const [attachedFile, setAttachedFile] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [actionMap, setActionMap] = useState({});

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load sessions list on mount
  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadSessions() {
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50);
    if (data && data.length > 0) {
      setSessions(data);
      // Auto-open the most recent session
      if (!activeSessionId) openSession(data[0].id);
    }
  }

  async function openSession(id) {
    setActiveSessionId(id);
    setLoadingMsgs(true);
    setMessages([]);
    setActionMap({});
    const { data } = await supabase
      .from('chat_history')
      .select('*')
      .eq('session_id', id)
      .order('created_at');
    const msgs = data || [];
    setMessages(msgs);
    const restored = {};
    msgs.forEach((m, i) => { if (m.meta) { try { restored[i] = JSON.parse(m.meta); } catch {} } });
    setActionMap(restored);
    setLoadingMsgs(false);
  }

  async function newChat() {
    const { data } = await supabase
      .from('chat_sessions')
      .insert({ title: 'New chat', updated_at: new Date().toISOString() })
      .select()
      .single();
    if (data) {
      setSessions(prev => [data, ...prev]);
      setActiveSessionId(data.id);
      setMessages([]);
      setActionMap({});
    }
  }

  async function deleteSession(id) {
    await supabase.from('chat_history').delete().eq('session_id', id);
    await supabase.from('chat_sessions').delete().eq('id', id);
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (activeSessionId === id) {
        if (next.length > 0) openSession(next[0].id);
        else { setActiveSessionId(null); setMessages([]); }
      }
      return next;
    });
  }

  async function updateSessionTitle(sessionId, msgs) {
    const title = sessionTitle(msgs);
    await supabase.from('chat_sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', sessionId);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title, updated_at: new Date().toISOString() } : s));
  }

  // File handling
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!isSupported(file.name)) { setFileError(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`); return; }
    setFileError(''); setFileLoading(true);
    try { const text = await extractFileText(file); setAttachedFile({ name: file.name, text }); setMode('agent'); }
    catch (err) { setFileError(err.message); }
    finally { setFileLoading(false); }
  }
  function removeFile() { setAttachedFile(null); setFileError(''); }

  // Send message
  async function send() {
    if ((!input.trim() && !attachedFile) || loading) return;

    // Create a session if none active
    let sessionId = activeSessionId;
    if (!sessionId) {
      const { data } = await supabase.from('chat_sessions').insert({ title: 'New chat', updated_at: new Date().toISOString() }).select().single();
      if (!data) return;
      sessionId = data.id;
      setActiveSessionId(sessionId);
      setSessions(prev => [data, ...prev]);
    }

    const userText = input.trim() || `Please analyse and import the attached document: ${attachedFile?.name}`;
    const docContext = attachedFile ? `File: ${attachedFile.name}\n\n${attachedFile.text}` : null;
    const displayContent = attachedFile ? `${userText}\n\n📎 ${attachedFile.name}` : userText;

    setInput(''); setAttachedFile(null);

    const newMsg = { role: 'user', content: displayContent, created_at: new Date().toISOString(), session_id: sessionId };
    setMessages(prev => [...prev, newMsg]);
    await supabase.from('chat_history').insert({ role: 'user', content: displayContent, session_id: sessionId });

    setLoading(true);
    let assistantContent = '', actions = [];

    if (mode === 'agent') {
      const result = await runAgent(userText, messages, docContext);
      assistantContent = result.success ? result.reply : `⚠️ ${result.reply}`;
      actions = result.actions || [];
    } else {
      const result = await askGroq(userText, messages, docContext);
      assistantContent = result.success ? result.reply : `⚠️ Error: ${result.error}`;
    }

    setLoading(false);

    const assistantMsg = { role: 'assistant', content: assistantContent, created_at: new Date().toISOString(), session_id: sessionId };
    setMessages(prev => {
      const next = [...prev, assistantMsg];
      if (actions.length > 0) setActionMap(m => ({ ...m, [next.length - 1]: actions }));
      // Update session title from first user message
      if (next.filter(m => m.role === 'user').length === 1) updateSessionTitle(sessionId, next);
      return next;
    });
    await supabase.from('chat_history').insert({ role: 'assistant', content: assistantContent, session_id: sessionId, ...(actions.length > 0 ? { meta: JSON.stringify(actions) } : {}) });
    await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at)));
  }

  const SUGGESTIONS_CHAT = ["How are my shepherds performing this month?", "Which shepherd has the most pending tasks?", "What should I focus on this week?"];
  const SUGGESTIONS_AGENT = ["Show me all sheep with no shepherd assigned", "List all shepherds and their bacentas", "How many sheep are in each bacenta?"];
  const suggestions = mode === 'agent' ? SUGGESTIONS_AGENT : SUGGESTIONS_CHAT;
  const canSend = (input.trim() || attachedFile) && !loading && !fileLoading;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0, overflow: 'hidden' }}>

      {/* Sessions sidebar — hidden on mobile */}
      <div className="chat-sessions-sidebar" style={{ display: showSidebar ? 'flex' : 'none' }}>
        <SessionsSidebar
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={openSession}
          onNew={newChat}
          onDelete={deleteSession}
        />
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>

        {/* Header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Toggle sidebar */}
          <button onClick={() => setShowSidebar(v => !v)} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ChevronLeft size={15} color="var(--text2)" style={{ transform: showSidebar ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
          </button>

          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={16} color="var(--gold)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>AI Assistant</h2>
            <p style={{ fontSize: 11, color: 'var(--text2)' }}>{mode === 'agent' ? 'Data Agent · Can read & write your database' : 'Chat · Advice & insights only'}</p>
          </div>

          <button onClick={() => setShowMemory(true)} title="View AI memory" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={15} color="var(--text2)" />
          </button>

          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
            {[{ id: 'chat', icon: <MessageSquare size={12} />, label: 'Chat' }, { id: 'agent', icon: <Database size={12} />, label: 'Agent' }].map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 5, fontSize: 12, fontWeight: 500, background: mode === m.id ? 'var(--gold)' : 'transparent', color: mode === m.id ? '#0b0f14' : 'var(--text2)', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Agent banner */}
        {mode === 'agent' && (
          <div style={{ padding: '7px 20px', background: 'var(--gold-dim)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Database size={12} />
            <span><strong>Data Agent active</strong> — I can query, add, update, and import records. Attach a spreadsheet or PDF to bulk-import members.</span>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loadingMsgs ? <Loader /> : (
            <>
              {messages.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🙏</div>
                  <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, marginBottom: 6 }}>Peace be with you, Chief Shepherd</h3>
                  <p style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 380, marginBottom: 6 }}>
                    {mode === 'agent' ? 'I can read and update your database. Ask me to list, add, move, or import members.' : 'Ask me anything about your shepherds, members, or church activities.'}
                  </p>
                  <p style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 380, marginBottom: 20 }}>📎 Attach a member list (CSV, Excel, PDF) to bulk-import</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {suggestions.map(s => (
                      <button key={s} onClick={() => setInput(s)} style={{ padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '72%', padding: '11px 15px', borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: msg.role === 'user' ? 'var(--gold)' : 'var(--surface)', color: msg.role === 'user' ? '#0b0f14' : 'var(--text)', border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </div>
                  </div>
                  {msg.role === 'assistant' && actionMap[i] && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
                      <div style={{ maxWidth: '72%', width: '100%' }}><ActionSummary actions={actionMap[i]} /></div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '12px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px 18px 18px 4px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: `bounce 1.2s ${i*0.2}s infinite` }} />)}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* File attachment preview */}
        {(attachedFile || fileLoading || fileError) && (
          <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {fileLoading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text2)' }}><div style={{ width: 12, height: 12, border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Reading file…</div>}
            {fileError && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#2a1a1a', border: '1px solid #e05', borderRadius: 10, fontSize: 12, color: '#e05' }}><AlertCircle size={12} />{fileError}<button onClick={() => setFileError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 4 }}><X size={11} /></button></div>}
            {attachedFile && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--gold-dim)', border: '1px solid var(--gold)', borderRadius: 10, fontSize: 12, color: 'var(--gold)' }}><FileText size={12} /><span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span><button onClick={removeFile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}><X size={11} /></button></div>}
          </div>
        )}

        {/* Input bar */}
        <div style={{ padding: '10px 20px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.ods,.docx,.txt,.json,.md" onChange={handleFileChange} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={fileLoading} style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: attachedFile ? 'var(--gold-dim)' : 'var(--surface)', border: `1px solid ${attachedFile ? 'var(--gold)' : 'var(--border)'}`, cursor: fileLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Paperclip size={15} color={attachedFile ? 'var(--gold)' : 'var(--text3)'} />
          </button>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={attachedFile ? `Ask about ${attachedFile.name} or hit send to import…` : mode === 'agent' ? 'Tell me what to do with your data…' : 'Type a message…'}
            style={{ flex: 1, borderRadius: 24, padding: '10px 16px' }} />
          <button onClick={send} disabled={!canSend} style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: canSend ? 'var(--gold)' : 'var(--surface)', border: '1px solid var(--border)', cursor: canSend ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={15} color={canSend ? '#0b0f14' : 'var(--text3)'} />
          </button>
        </div>
      </div>

      {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}

      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .chat-sessions-sidebar { height: 100%; }
        @media (max-width: 768px) { .chat-sessions-sidebar { display: none !important; } }
      `}</style>
    </div>
  );
}
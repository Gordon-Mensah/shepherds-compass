import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { askGroq } from '../groq';
import { runAgent } from '../groqTools';
import { extractFileText, isSupported, SUPPORTED_EXTENSIONS } from '../fileExtractor';
import { Send, Sparkles, Paperclip, X, FileText, AlertCircle, Database, MessageSquare, CheckCircle2, AlertTriangle, Brain, Trash2 } from 'lucide-react';
import { getAllMemory, deleteMemory, clearAllMemory, MEMORY_TABLE_SQL } from '../memory';
import { Loader } from '../components/ui';

// ── Action summary card shown after agent runs ────────────────────────────────
function ActionSummary({ actions }) {
  if (!actions || actions.length === 0) return null;

  const writeOps = actions.filter(a => ['insert_record','bulk_insert','update_record','delete_record'].includes(a.tool));
  if (writeOps.length === 0) return null;

  // If the same operation eventually succeeded after a failed attempt, hide the failed attempt
  // e.g. delete failed with fake UUID, then succeeded with real UUID — only show the success
  const deduped = writeOps.filter((a, i) => {
    if (a.result?.error) {
      // Check if a later action of the same tool+table succeeded
      const laterSuccess = writeOps.slice(i + 1).some(
        b => b.tool === a.tool && b.args?.table === a.args?.table && !b.result?.error
      );
      return !laterSuccess; // hide this failure if it was retried successfully
    }
    return true;
  });

  return (
    <div style={{
      marginTop: 8, padding: '10px 14px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Database size={12} /> Database actions
      </div>
      {deduped.map((a, i) => {
        const ok = !a.result?.error;
        const label = {
          insert_record: `Inserted 1 record into ${a.args.table}`,
          bulk_insert: `Inserted ${a.result?.inserted_count ?? '?'} records into ${a.args.table}`,
          update_record: `Updated record in ${a.args.table}`,
          delete_record: `Deleted record from ${a.args.table}`,
        }[a.tool] || a.tool;

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


// ── Memory panel ─────────────────────────────────────────────────────────────
function MemoryPanel({ onClose }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setMemories(await getAllMemory());
    setLoading(false);
  }

  async function remove(id) {
    await deleteMemory(id);
    setMemories(m => m.filter(x => x.id !== id));
  }

  async function clearAll() {
    if (!confirm('Clear all memory? The AI will start fresh next conversation.')) return;
    setClearing(true);
    await clearAllMemory();
    setMemories([]);
    setClearing(false);
  }

  const categories = ['decisions','tasks','people','structure','context'];
  const grouped = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  const catColors = {
    decisions: 'var(--gold)',
    tasks: 'var(--blue)',
    people: 'var(--green, #4caf87)',
    structure: 'var(--amber)',
    context: 'var(--text2)',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16,
        width: '90%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Panel header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain size={18} color="var(--gold)" />
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>AI Memory</h3>
            <p style={{ fontSize: 11, color: 'var(--text2)' }}>{memories.length} facts stored · persists across sessions</p>
          </div>
          <button onClick={clearAll} disabled={clearing || memories.length === 0} style={{
            padding: '5px 12px', borderRadius: 8, fontSize: 12,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Trash2 size={11} /> Clear all
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Setup note — only shown when table is missing/empty */}
        {!loading && memories.length === 0 && (
          <div style={{ padding: '10px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
            ⚠️ Requires a <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>chat_memory</code> table in Supabase.
            {' '}<button onClick={() => navigator.clipboard?.writeText(MEMORY_TABLE_SQL)} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Copy SQL to create it</button>
          </div>
        )}

        {/* Memory list */}
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
                <div style={{ fontSize: 11, fontWeight: 600, color: catColors[cat], textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  {cat}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grouped[cat].map(m => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 12px', background: 'var(--surface)',
                      border: '1px solid var(--border)', borderRadius: 8,
                    }}>
                      <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5, color: 'var(--text)' }}>{m.value}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>★{m.importance}</span>
                        <button onClick={() => remove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }}>
                          <X size={12} />
                        </button>
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

// ── Main Chat component ───────────────────────────────────────────────────────
export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [mode, setMode] = useState('chat'); // 'chat' | 'agent'
  const [showMemory, setShowMemory] = useState(false);

  // file attachment
  const [attachedFile, setAttachedFile] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');

  // per-message action summaries keyed by message index
  const [actionMap, setActionMap] = useState({});

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadHistory() {
    const { data } = await supabase.from('chat_history').select('*').order('created_at').limit(100);
    const msgs = data || [];
    setMessages(msgs);
    // Restore action summaries from saved meta
    const restored = {};
    msgs.forEach((m, i) => {
      if (m.meta) {
        try { restored[i] = JSON.parse(m.meta); } catch {}
      }
    });
    setActionMap(restored);
    setLoadingHistory(false);
  }

  // ── File handling ──────────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!isSupported(file.name)) {
      setFileError(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return;
    }
    setFileError('');
    setFileLoading(true);
    try {
      const text = await extractFileText(file);
      setAttachedFile({ name: file.name, text, size: file.size });
      // auto-switch to agent mode when a file is attached
      setMode('agent');
    } catch (err) {
      setFileError(err.message);
    } finally {
      setFileLoading(false);
    }
  }

  function removeFile() { setAttachedFile(null); setFileError(''); }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function send() {
    if ((!input.trim() && !attachedFile) || loading) return;

    const userText = input.trim() || `Please analyse and import the attached document: ${attachedFile?.name}`;
    const docContext = attachedFile ? `File: ${attachedFile.name}\n\n${attachedFile.text}` : null;
    const displayContent = attachedFile ? `${userText}\n\n📎 ${attachedFile.name}` : userText;

    setInput('');
    setAttachedFile(null);

    const newMsg = { role: 'user', content: displayContent, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, newMsg]);
    await supabase.from('chat_history').insert({ role: 'user', content: displayContent });

    setLoading(true);
    let assistantContent = '';
    let actions = [];

    if (mode === 'agent') {
      const result = await runAgent(userText, messages, docContext);
      assistantContent = result.success ? result.reply : `⚠️ ${result.reply}`;
      actions = result.actions || [];
    } else {
      const result = await askGroq(userText, messages, docContext);
      assistantContent = result.success ? result.reply : `⚠️ Error: ${result.error}`;
    }

    setLoading(false);

    const assistantMsg = { role: 'assistant', content: assistantContent, created_at: new Date().toISOString() };
    setMessages(prev => {
      const next = [...prev, assistantMsg];
      if (actions.length > 0) {
        setActionMap(m => ({ ...m, [next.length - 1]: actions }));
      }
      return next;
    });
    await supabase.from('chat_history').insert({
      role: 'assistant',
      content: assistantContent,
      ...(actions.length > 0 ? { meta: JSON.stringify(actions) } : {}),
    });
  }

  const SUGGESTIONS_CHAT = [
    "How are my shepherds performing this month?",
    "Which shepherd has the most pending tasks?",
    "What should I focus on this week as Chief Shepherd?",
  ];

  const SUGGESTIONS_AGENT = [
    "Show me all sheep with no shepherd assigned",
    "List all shepherds and their bacentas",
    "How many sheep are in each bacenta?",
    "Mark all pending tasks for Shepherd Grace as done",
  ];

  const suggestions = mode === 'agent' ? SUGGESTIONS_AGENT : SUGGESTIONS_CHAT;
  const canSend = (input.trim() || attachedFile) && !loading && !fileLoading;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={18} color="var(--gold)" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>AI Assistant</h2>
          <p style={{ fontSize: 11, color: 'var(--text2)' }}>
            {mode === 'agent' ? 'Data Agent · Can read & write your database' : 'Chat · Advice & insights only'}
          </p>
        </div>

        {/* Memory button */}
        <button onClick={() => setShowMemory(true)} title="View AI memory" style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Brain size={16} color="var(--text2)" />
        </button>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 3 }}>
          {[
            { id: 'chat', icon: <MessageSquare size={13} />, label: 'Chat' },
            { id: 'agent', icon: <Database size={13} />, label: 'Data Agent' },
          ].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
              background: mode === m.id ? 'var(--gold)' : 'transparent',
              color: mode === m.id ? '#0b0f14' : 'var(--text2)',
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode hint banner */}
      {mode === 'agent' && (
        <div style={{ padding: '8px 28px', background: 'var(--gold-dim)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={13} />
          <span><strong>Data Agent active</strong> — I can query, add, update, and import records. Attach a spreadsheet or PDF to bulk-import members.</span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loadingHistory ? <Loader /> : (
          <>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🙏</div>
                <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, marginBottom: 8 }}>Peace be with you, Chief Shepherd</h3>
                <p style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 420, margin: '0 auto 8px' }}>
                  {mode === 'agent'
                    ? 'I can read and update your database. Ask me to list, add, move, or import members and shepherds.'
                    : 'Ask me anything about your shepherds, members, or church activities.'}
                </p>
                <p style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 420, margin: '0 auto 28px' }}>
                  📎 Attach a member list (CSV, Excel, PDF) and say "add these as sheep" or "add these as shepherds"
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => setInput(s)} style={{
                      padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 20, fontSize: 12, color: 'var(--text2)', cursor: 'pointer',
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '72%',
                    padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: msg.role === 'user' ? 'var(--gold)' : 'var(--surface)',
                    color: msg.role === 'user' ? '#0b0f14' : 'var(--text)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                    fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                </div>
                {msg.role === 'assistant' && actionMap[i] && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
                    <div style={{ maxWidth: '72%', width: '100%' }}>
                      <ActionSummary actions={actionMap[i]} />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px 18px 18px 4px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                    ))}
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
        <div style={{ padding: '10px 28px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          {fileLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text2)' }}>
              <div style={{ width: 14, height: 14, border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Reading file…
            </div>
          )}
          {fileError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--red-dim, #2a1a1a)', border: '1px solid var(--red, #e05)', borderRadius: 10, fontSize: 12, color: 'var(--red, #e05)' }}>
              <AlertCircle size={14} /> {fileError}
              <button onClick={() => setFileError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 4 }}><X size={12} /></button>
            </div>
          )}
          {attachedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--gold-dim)', border: '1px solid var(--gold)', borderRadius: 10, fontSize: 12, color: 'var(--gold)' }}>
              <FileText size={14} />
              <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>· {mode === 'agent' ? 'ready to import' : 'ready'}</span>
              <button onClick={removeFile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 4 }}><X size={12} /></button>
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding: '12px 28px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <input ref={fileInputRef} type="file"
          accept=".pdf,.xlsx,.xls,.csv,.ods,.docx,.txt,.json,.md"
          onChange={handleFileChange} style={{ display: 'none' }} />

        <button onClick={() => fileInputRef.current?.click()} disabled={fileLoading}
          title={`Attach a document (${SUPPORTED_EXTENSIONS.join(', ')})`}
          style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: attachedFile ? 'var(--gold-dim)' : 'var(--surface)',
            border: `1px solid ${attachedFile ? 'var(--gold)' : 'var(--border)'}`,
            cursor: fileLoading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
          }}>
          <Paperclip size={16} color={attachedFile ? 'var(--gold)' : 'var(--text3)'} />
        </button>

        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={
            attachedFile
              ? `Ask something about ${attachedFile.name} or just hit send to import…`
              : mode === 'agent'
                ? 'Tell me what to do with your data…'
                : 'Type a message to your AI assistant…'
          }
          style={{ flex: 1, borderRadius: 24, padding: '12px 18px' }}
        />

        <button onClick={send} disabled={!canSend} style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: canSend ? 'var(--gold)' : 'var(--surface)',
          border: '1px solid var(--border)', cursor: canSend ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
        }}>
          <Send size={16} color={canSend ? '#0b0f14' : 'var(--text3)'} />
        </button>
      </div>

      {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}

      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
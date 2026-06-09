/**
 * SectionChat.jsx
 *
 * A collapsible mini-chat panel that embeds in any page.
 * Each section gets its own scoped AI assistant that:
 *  - can READ all Supabase tables
 *  - can only WRITE to its own section's tables
 *
 * Usage:
 *   <SectionChat section="shepherds" pageContext={{ currentId: id, currentName: name }} />
 */

import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, ChevronDown, ChevronUp, Database, CheckCircle2, AlertTriangle } from 'lucide-react';
import { runSectionAgent, SECTION_CONFIG } from '../sectionAgent';

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '10px 14px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--gold, #c9a84c)',
          animation: `sectionChatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Action badge ──────────────────────────────────────────────────────────────
function ActionBadge({ actions }) {
  if (!actions?.length) return null;
  const writes = actions.filter(a => ['insert_record', 'bulk_insert', 'update_record', 'delete_record'].includes(a.tool));
  if (!writes.length) return null;
  return (
    <div style={{ marginTop: 6, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {writes.map((a, i) => {
        const ok = !a.result?.error;
        const label = {
          insert_record: `Added to ${a.args.table}`,
          bulk_insert: `Added ${a.result?.inserted_count ?? '?'} to ${a.args.table}`,
          update_record: `Updated ${a.args.table}`,
          delete_record: `Deleted from ${a.args.table}`,
        }[a.tool] || a.tool;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, color: ok ? 'var(--green, #4caf87)' : 'var(--red, #e05555)' }}>
            {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
            <span>{ok ? label : `Failed: ${a.result.error}`}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 8,
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '9px 13px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? 'var(--gold, #c9a84c)' : 'var(--surface2, var(--surface))',
        color: isUser ? '#1a1200' : 'var(--text)',
        fontSize: 13,
        lineHeight: 1.55,
        border: isUser ? 'none' : '1px solid var(--border)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
        {msg.actions && <ActionBadge actions={msg.actions} />}
      </div>
    </div>
  );
}

// ── Main SectionChat component ────────────────────────────────────────────────
export default function SectionChat({ section, pageContext = {} }) {
  const config = SECTION_CONFIG[section];
  if (!config) return null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
    const { reply, actions } = await runSectionAgent(text, history.slice(0, -1), section, pageContext);

    setMessages(prev => [...prev, { role: 'assistant', content: reply, actions }]);
    setLoading(false);
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const writeScope = config.writableTables.join(', ');

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes sectionChatDot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes sectionChatSlide {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Floating container pinned to bottom-right of page content */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
        fontFamily: 'inherit',
      }}>

        {/* ── Expanded chat panel ── */}
        {open && (
          <div style={{
            width: 340,
            maxHeight: 480,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'sectionChatSlide 0.18s ease-out',
          }}>

            {/* Header */}
            <div style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--surface)',
            }}>
              <Sparkles size={15} color="var(--gold, #c9a84c)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                  {config.label} Assistant
                </div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1 }}>
                  Reads all · Writes: {writeScope}
                </div>
              </div>
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} title="Clear chat" style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text2)', padding: 2, borderRadius: 6,
                  fontSize: 11,
                }}>
                  Clear
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text2)', padding: 2, borderRadius: 6,
                display: 'flex', alignItems: 'center',
              }}>
                <X size={15} />
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 12px 4px',
              minHeight: 60,
            }}>
              {messages.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  color: 'var(--text2)',
                  fontSize: 12,
                  marginTop: 20,
                  lineHeight: 1.6,
                  padding: '0 8px',
                }}>
                  <Sparkles size={20} color="var(--gold, #c9a84c)" style={{ marginBottom: 8 }} />
                  <div>Ask me anything about <strong>{config.label}</strong>.</div>
                  <div style={{ marginTop: 4, opacity: 0.7 }}>I can read all data but only edit {writeScope}.</div>
                </div>
              )}
              {messages.map((m, i) => <Bubble key={i} msg={m} />)}
              {loading && <TypingDots />}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 8,
              background: 'var(--surface)',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={`Ask about ${config.label.toLowerCase()}…`}
                rows={1}
                disabled={loading}
                style={{
                  flex: 1,
                  resize: 'none',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 13,
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  outline: 'none',
                  lineHeight: 1.4,
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                style={{
                  background: input.trim() && !loading ? 'var(--gold, #c9a84c)' : 'var(--surface2, var(--border))',
                  border: 'none',
                  borderRadius: 10,
                  padding: '0 12px',
                  cursor: input.trim() && !loading ? 'pointer' : 'default',
                  color: input.trim() && !loading ? '#1a1200' : 'var(--text2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── Toggle button ── */}
        <button
          onClick={() => setOpen(o => !o)}
          title={`${config.label} AI Assistant`}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: open ? 'var(--surface)' : 'var(--gold, #c9a84c)',
            border: open ? '1px solid var(--border)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            transition: 'background 0.2s, transform 0.15s',
            color: open ? 'var(--text2)' : '#1a1200',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {open
            ? <ChevronDown size={20} />
            : <Sparkles size={20} />
          }
        </button>
      </div>
    </>
  );
}

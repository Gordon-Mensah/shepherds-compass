import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Plus, X, Bell, CheckSquare, Square, Calendar, ChevronLeft, ChevronRight, Trash2, Edit2, Check, Clock, AlertCircle } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function today() { return new Date().toISOString().split('T')[0]; }
function fmtDate(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtTime(t) { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; }
function isOverdue(date, time) {
  const now = new Date();
  const dt = new Date(`${date}T${time || '23:59'}:00`);
  return dt < now;
}
function daysUntil(date) {
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(date + 'T00:00:00');
  return Math.round((d - now) / 86400000);
}

const EVENT_COLORS = [
  { id: 'gold', label: 'Gold', bg: 'rgba(201,168,76,0.15)', border: '#c9a84c', text: '#c9a84c' },
  { id: 'blue', label: 'Blue', bg: 'rgba(96,165,250,0.15)', border: '#60a5fa', text: '#60a5fa' },
  { id: 'green', label: 'Green', bg: 'rgba(74,222,128,0.15)', border: '#4ade80', text: '#4ade80' },
  { id: 'purple', label: 'Purple', bg: 'rgba(167,139,250,0.15)', border: '#a78bfa', text: '#a78bfa' },
  { id: 'coral', label: 'Coral', bg: 'rgba(251,146,60,0.15)', border: '#fb923c', text: '#fb923c' },
  { id: 'teal', label: 'Teal', bg: 'rgba(45,212,191,0.15)', border: '#2dd4bf', text: '#2dd4bf' },
];
function colorForId(id) { return EVENT_COLORS.find(c => c.id === id) || EVENT_COLORS[0]; }

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return isMobile;
}

// ── Calendar grid ─────────────────────────────────────────────────────────────
function CalendarGrid({ year, month, events, onDayClick, selectedDate }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', padding: '4px 0', fontWeight: 500 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const dayEvents = events.filter(e => e.event_date === dateStr);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          return (
            <div key={i} onClick={() => onDayClick(dateStr)}
              style={{ minHeight: 'clamp(36px, 10vw, 56px)', padding: '3px 4px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${isSelected ? 'var(--gold)' : isToday ? 'rgba(201,168,76,0.4)' : 'transparent'}`, background: isSelected ? 'rgba(201,168,76,0.12)' : isToday ? 'rgba(201,168,76,0.06)' : 'var(--bg2)', transition: 'all 0.1s' }}>
              <div style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--gold)' : 'var(--text)', marginBottom: 2 }}>{day}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {dayEvents.slice(0, 3).map(e => {
                  const col = colorForId(e.color);
                  return (
                    <div key={e.id} style={{ fontSize: 'clamp(8px, 2vw, 10px)', padding: '1px 3px', borderRadius: 3, background: col.bg, color: col.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.time ? fmtTime(e.time) + ' ' : ''}{e.title}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{dayEvents.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Event form modal ──────────────────────────────────────────────────────────
function EventModal({ event, onSave, onClose, defaultDate }) {
  const [form, setForm] = useState(event || { title: '', event_date: defaultDate || today(), time: '', end_time: '', color: 'gold', description: '', reminder: false, reminder_min: 30 });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.title.trim() || !form.event_date) return;
    setSaving(true);
    const row = { title: form.title.trim(), event_date: form.event_date, time: form.time || null, end_time: form.end_time || null, color: form.color, description: form.description || null, reminder: form.reminder, reminder_min: form.reminder ? (parseInt(form.reminder_min) || 30) : null };
    if (event?.id) {
      await supabase.from('calendar_events').update(row).eq('id', event.id);
    } else {
      await supabase.from('calendar_events').insert(row);
    }
    setSaving(false);
    onSave();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 440, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{event?.id ? 'Edit Event' : 'New Event'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Sunday Service, Bacenta Meeting..." style={inputStyle} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Date *</label>
              <input type="date" value={form.event_date} onChange={e => set('event_date', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>End Time</label>
            <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {EVENT_COLORS.map(c => (
                <div key={c.id} onClick={() => set('color', c.id)} style={{ width: 24, height: 24, borderRadius: '50%', background: c.border, cursor: 'pointer', outline: form.color === c.id ? `3px solid var(--text)` : '3px solid transparent', outlineOffset: 2, transition: 'outline 0.1s' }} title={c.label} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="reminder" checked={form.reminder} onChange={e => set('reminder', e.target.checked)} style={{ accentColor: 'var(--gold)', width: 15, height: 15 }} />
            <label htmlFor="reminder" style={{ fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>Set reminder</label>
            {form.reminder && (
              <>
                <select value={form.reminder_min} onChange={e => set('reminder_min', e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '5px 10px' }}>
                  {[5,10,15,30,60,120,1440].map(v => <option key={v} value={v}>{v < 60 ? v + ' min' : v === 1440 ? '1 day' : (v/60) + ' hrs'} before</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={submit} disabled={saving || !form.title.trim()} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : event?.id ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Todo form ─────────────────────────────────────────────────────────────────
function TodoForm({ onAdd }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('normal');
  const [expanded, setExpanded] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    await supabase.from('todos').insert({ title: text.trim(), due_date: due || null, priority, done: false });
    setText(''); setDue(''); setPriority('normal'); setExpanded(false);
    onAdd();
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={text} onChange={e => setText(e.target.value)} onFocus={() => setExpanded(true)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Add a to-do..." style={{ ...inputStyle, flex: 1, padding: '7px 12px' }} />
        <button onClick={submit} disabled={!text.trim()} style={{ ...primaryBtn, padding: '7px 14px', opacity: text.trim() ? 1 : 0.5 }}>Add</button>
      </div>
      {expanded && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
          <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...inputStyle, padding: '5px 10px', fontSize: 12 }} />
          <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, padding: '5px 10px', fontSize: 12 }}>
            <option value="low">Low priority</option>
            <option value="normal">Normal</option>
            <option value="high">High priority</option>
          </select>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text3)', marginBottom: 5 };
const primaryBtn = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--gold)', color: '#0b0f14', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' };
const ghostBtn = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
const priorityColor = { high: '#f87171', normal: 'var(--text3)', low: 'var(--text3)' };
const priorityLabel = { high: 'High', normal: 'Normal', low: 'Low' };

// ── Main Calendar page ────────────────────────────────────────────────────────
export default function CalendarPage() {
  const [view, setView] = useState('calendar'); // 'calendar' | 'todos' | 'reminders'
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(today());
  const isMobile = useIsMobile();
  const [showDayPanel, setShowDayPanel] = useState(false);
  const [events, setEvents] = useState([]);
  const [todos, setTodos] = useState([]);
  const [modal, setModal] = useState(null); // null | { event } | 'new'
  const [editTodo, setEditTodo] = useState(null);
  const [editTodoText, setEditTodoText] = useState('');

  useEffect(() => { loadEvents(); loadTodos(); }, []);

  // Browser notification reminders check
  useEffect(() => {
    const check = () => {
      const now = new Date();
      events.forEach(e => {
        if (!e.reminder || !e.time) return;
        const eventDt = new Date(`${e.event_date}T${e.time}:00`);
        const diff = (eventDt - now) / 60000;
        if (diff > 0 && diff <= (e.reminder_min || 30) && diff > (e.reminder_min || 30) - 1) {
          if (Notification.permission === 'granted') {
            new Notification(`📅 ${e.title}`, { body: `Starting in ${Math.round(diff)} minutes`, icon: '/favicon.svg' });
          }
        }
      });
    };
    const interval = setInterval(check, 60000);
    if (Notification.permission === 'default') Notification.requestPermission();
    return () => clearInterval(interval);
  }, [events]);

  async function loadEvents() {
    const { data } = await supabase.from('calendar_events').select('*').order('event_date').order('time');
    setEvents(data || []);
  }
  async function loadTodos() {
    const { data } = await supabase.from('todos').select('*').order('done').order('priority', { ascending: false }).order('due_date');
    setTodos(data || []);
  }

  async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    await supabase.from('calendar_events').delete().eq('id', id);
    loadEvents();
  }
  async function toggleTodo(id, done) {
    await supabase.from('todos').update({ done: !done, completed_at: !done ? new Date().toISOString() : null }).eq('id', id);
    loadTodos();
  }
  async function deleteTodo(id) {
    await supabase.from('todos').delete().eq('id', id);
    loadTodos();
  }
  async function saveEditTodo(id) {
    if (!editTodoText.trim()) return;
    await supabase.from('todos').update({ title: editTodoText.trim() }).eq('id', id);
    setEditTodo(null); setEditTodoText('');
    loadTodos();
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const selectedEvents = events.filter(e => e.event_date === selectedDate);
  const upcomingEvents = events.filter(e => e.event_date >= today()).slice(0, 8);
  const overdueReminders = events.filter(e => e.reminder && isOverdue(e.event_date, e.time) && e.event_date >= today());
  const pendingTodos = todos.filter(t => !t.done);
  const doneTodos = todos.filter(t => t.done);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontFamily: 'Cormorant Garamond, serif', fontWeight: 700 }}>Calendar & Tasks</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{pendingTodos.length} pending to-dos · {upcomingEvents.length} upcoming events</p>
        </div>
        <div style={{ display: 'flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
          {[['calendar', 'Calendar'], ['todos', 'To-Do'], ['reminders', 'Upcoming']].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: view === id ? 'var(--gold)' : 'transparent', color: view === id ? '#0b0f14' : 'var(--text2)', border: 'none', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}>{label}</button>
          ))}
        </div>
        <button onClick={() => setModal({ event: null })} style={primaryBtn}><Plus size={14} /> Add Event</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(12px,3vw,20px) clamp(14px,4vw,28px)' }}>

        {/* ── CALENDAR VIEW ── */}
        {view === 'calendar' && (
          <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
            {/* Left: calendar grid */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={prevMonth} style={{ ...ghostBtn, padding: '6px 10px' }}><ChevronLeft size={15} /></button>
                <h2 style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>{MONTHS[month]} {year}</h2>
                <button onClick={nextMonth} style={{ ...ghostBtn, padding: '6px 10px' }}><ChevronRight size={15} /></button>
                <button onClick={() => { setMonth(new Date().getMonth()); setYear(new Date().getFullYear()); setSelectedDate(today()); }} style={{ ...ghostBtn, fontSize: 12, padding: '6px 12px' }}>Today</button>
              </div>
              <CalendarGrid year={year} month={month} events={events} onDayClick={(d) => { setSelectedDate(d); if (isMobile) setShowDayPanel(true); }} selectedDate={selectedDate} />
            </div>

            {/* Right: day panel — inline desktop, bottom sheet mobile */}
            {(!isMobile || showDayPanel) && (
              <div style={isMobile ? {
                position: 'fixed', bottom: 60, left: 0, right: 0, zIndex: 300,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '16px 16px 0 0', maxHeight: '65vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
              } : { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(selectedDate)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {selectedDate === today() ? 'Today' : (() => { const d = daysUntil(selectedDate); return d > 0 ? `In ${d} day${d>1?'s':''}` : d < 0 ? `${Math.abs(d)} day${Math.abs(d)>1?'s':''} ago` : 'Today'; })()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {isMobile && <button onClick={() => setShowDayPanel(false)} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 12 }}><X size={12} /></button>}
                    <button onClick={() => setModal({ event: { event_date: selectedDate } })} style={{ ...primaryBtn, padding: '5px 10px', fontSize: 12 }}><Plus size={12} /> Event</button>
                  </div>
                </div>
                <div style={{ padding: '10px 14px', maxHeight: 420, overflowY: 'auto' }}>
                  {selectedEvents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 12 }}>
                      <Calendar size={24} style={{ marginBottom: 8, opacity: 0.3 }} />
                      <p>No events this day</p>
                    </div>
                  ) : selectedEvents.map(e => {
                    const col = colorForId(e.color);
                    return (
                      <div key={e.id} style={{ padding: '10px 12px', borderRadius: 8, background: col.bg, border: `1px solid ${col.border}30`, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: col.text }}>{e.title}</div>
                            {(e.time || e.end_time) && (
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={10} />{e.time ? fmtTime(e.time) : ''}{e.end_time ? ` – ${fmtTime(e.end_time)}` : ''}
                              </div>
                            )}
                            {e.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, lineHeight: 1.4 }}>{e.description}</div>}
                            {e.reminder && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}><Bell size={9} /> Reminder: {e.reminder_min} min before</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => setModal({ event: e })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 3 }}><Edit2 size={12} /></button>
                            <button onClick={() => deleteEvent(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 3 }}><Trash2 size={12} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TO-DO VIEW ── */}
        {view === 'todos' && (
          <div style={{ maxWidth: 640 }}>
            <TodoForm onAdd={loadTodos} />

            {pendingTodos.length === 0 && doneTodos.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
                <CheckSquare size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
                <p>No to-dos yet. Add your first one above.</p>
              </div>
            )}

            {pendingTodos.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text3)', marginBottom: 10 }}>Pending · {pendingTodos.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pendingTodos.map(t => (
                    <TodoItem key={t.id} t={t} onToggle={toggleTodo} onDelete={deleteTodo}
                      editing={editTodo === t.id} editText={editTodoText}
                      onEditStart={() => { setEditTodo(t.id); setEditTodoText(t.title); }}
                      onEditChange={setEditTodoText}
                      onEditSave={() => saveEditTodo(t.id)}
                      onEditCancel={() => { setEditTodo(null); setEditTodoText(''); }} />
                  ))}
                </div>
              </div>
            )}

            {doneTodos.length > 0 && (
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text3)', marginBottom: 10 }}>Completed · {doneTodos.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {doneTodos.slice(0, 10).map(t => (
                    <TodoItem key={t.id} t={t} onToggle={toggleTodo} onDelete={deleteTodo}
                      editing={editTodo === t.id} editText={editTodoText}
                      onEditStart={() => { setEditTodo(t.id); setEditTodoText(t.title); }}
                      onEditChange={setEditTodoText}
                      onEditSave={() => saveEditTodo(t.id)}
                      onEditCancel={() => { setEditTodo(null); setEditTodoText(''); }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── UPCOMING / REMINDERS VIEW ── */}
        {view === 'reminders' && (
          <div style={{ maxWidth: 680 }}>
            {overdueReminders.length > 0 && (
              <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AlertCircle size={14} color="#f87171" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f87171' }}>Overdue events with reminders</span>
                </div>
                {overdueReminders.map(e => (
                  <div key={e.id} style={{ fontSize: 12, color: '#f87171', padding: '4px 0', borderBottom: '1px solid rgba(248,113,113,0.1)' }}>
                    {e.title} · {fmtDate(e.event_date)}{e.time ? ' at ' + fmtTime(e.time) : ''}
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text3)', marginBottom: 12 }}>Upcoming Events</div>
            {upcomingEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
                <Bell size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
                <p>No upcoming events. Add some on the calendar.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingEvents.map(e => {
                  const col = colorForId(e.color);
                  const d = daysUntil(e.event_date);
                  return (
                    <div key={e.id} style={{ display: 'flex', gap: 14, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 4, borderRadius: 2, background: col.border, alignSelf: 'stretch', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 10 }}>
                          <span>{fmtDate(e.event_date)}{e.time ? ' · ' + fmtTime(e.time) : ''}</span>
                          {e.description && <span style={{ color: 'var(--text3)' }}>— {e.description.slice(0, 60)}</span>}
                        </div>
                        {e.reminder && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}><Bell size={9} /> Reminder set</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: d === 0 ? 'var(--gold)' : d <= 2 ? '#f87171' : 'var(--text2)' }}>
                          {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d}d`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Event modal */}
      {isMobile && showDayPanel && (
        <div onClick={() => setShowDayPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 299 }} />
      )}
      {modal && (
        <EventModal
          event={modal.event}
          defaultDate={selectedDate}
          onSave={() => { setModal(null); loadEvents(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Todo item component ───────────────────────────────────────────────────────
function TodoItem({ t, onToggle, onDelete, editing, editText, onEditStart, onEditChange, onEditSave, onEditCancel }) {
  const overdue = t.due_date && !t.done && t.due_date < today();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--bg2)', border: `1px solid ${overdue ? 'rgba(248,113,113,0.3)' : 'var(--border)'}`, borderRadius: 8, opacity: t.done ? 0.55 : 1 }}>
      <button onClick={() => onToggle(t.id, t.done)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.done ? 'var(--gold)' : 'var(--text3)', padding: 0, marginTop: 1, flexShrink: 0 }}>
        {t.done ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={editText} onChange={e => onEditChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onEditSave(); if (e.key === 'Escape') onEditCancel(); }} autoFocus style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: 13 }} />
            <button onClick={onEditSave} style={{ ...primaryBtn, padding: '4px 10px' }}><Check size={13} /></button>
            <button onClick={onEditCancel} style={{ ...ghostBtn, padding: '4px 10px' }}><X size={13} /></button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--text3)' : 'var(--text)' }}>{t.title}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
              {t.due_date && <span style={{ fontSize: 11, color: overdue ? '#f87171' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>{overdue && <AlertCircle size={9} />}{fmtDate(t.due_date)}</span>}
              {t.priority && t.priority !== 'normal' && <span style={{ fontSize: 10, color: priorityColor[t.priority] }}>{priorityLabel[t.priority]}</span>}
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button onClick={onEditStart} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}><Edit2 size={12} /></button>
          <button onClick={() => onDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  );
}
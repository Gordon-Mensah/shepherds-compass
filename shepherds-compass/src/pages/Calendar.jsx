import SectionChat from '../components/SectionChat';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { format, parseISO, isToday, isSameMonth, startOfMonth, getDay, getDaysInMonth, differenceInCalendarDays } from 'date-fns';
import {
  Plus, ChevronLeft, ChevronRight, X, Edit2, Trash2, Bell,
  Users, Target, Calendar, Church, CheckSquare, Square,
  Clock, AlertCircle, Check, BarChart2, Save,
} from 'lucide-react';
import { Btn, Modal, FormField } from '../components/ui';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const EVENT_TYPES = {
  event:     { label: 'Church Event',   color: '#c9a84c', bg: 'rgba(201,168,76,0.15)'   },
  deadline:  { label: 'Task Deadline',  color: '#f87171', bg: 'rgba(248,113,113,0.15)'  },
  birthday:  { label: 'Birthday',       color: '#a78bfa', bg: 'rgba(167,139,250,0.15)'  },
  service:   { label: 'Sunday Service', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'   },
  outreach:  { label: 'Outreach',       color: '#4ade80', bg: 'rgba(74,222,128,0.15)'   },
  meeting:   { label: 'Meeting',        color: '#2dd4bf', bg: 'rgba(45,212,191,0.15)'   },
};

function typeStyle(type) { return EVENT_TYPES[type] || EVENT_TYPES.event; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) { if (!d) return ''; try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; } }
function fmtTime(t) { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; }
function daysUntil(d) { try { return differenceInCalendarDays(parseISO(d), new Date()); } catch { return 0; } }

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [view, setView] = useState('calendar'); // calendar | attendance | upcoming
  const [events, setEvents] = useState([]);
  const [todos, setTodos] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [modal, setModal] = useState(null); // null | 'event' | 'attendance' | 'todo'
  const [editEvent, setEditEvent] = useState(null);
  const [editAttendance, setEditAttendance] = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: ev }, { data: td }, { data: att }] = await Promise.all([
      supabase.from('calendar_events').select('*').order('event_date').order('time'),
      supabase.from('todos').select('*').order('done').order('due_date'),
      supabase.from('sunday_attendance').select('*').order('service_date', { ascending: false }),
    ]);
    // Also pull birthdays from sheep + first_timers
    const [{ data: sheepDOB }, { data: ftDOB }] = await Promise.all([
      supabase.from('sheep').select('name, date_of_birth').not('date_of_birth', 'is', null),
      supabase.from('first_timers').select('name, date_of_birth').not('date_of_birth', 'is', null),
    ]);

    // Synthesize birthday events for current year
    const currentYear = new Date().getFullYear();
    const birthdayEvents = [...(sheepDOB || []), ...(ftDOB || [])].map(p => {
      if (!p.date_of_birth) return null;
      try {
        const dob = parseISO(p.date_of_birth);
        const thisYearBday = `${currentYear}-${String(dob.getMonth() + 1).padStart(2,'0')}-${String(dob.getDate()).padStart(2,'0')}`;
        return {
          id: `birthday-${p.name}`,
          title: `🎂 ${p.name}'s Birthday`,
          event_date: thisYearBday,
          event_type: 'birthday',
          color: 'purple',
          _synthetic: true,
        };
      } catch { return null; }
    }).filter(Boolean);

    setEvents([...(ev || []), ...birthdayEvents]);
    setTodos(td || []);
    setAttendance(att || []);
  }

  async function saveEvent(data) {
    if (editEvent?.id && !editEvent._synthetic) {
      await supabase.from('calendar_events').update(data).eq('id', editEvent.id);
    } else {
      await supabase.from('calendar_events').insert(data);
    }
    setModal(null); setEditEvent(null); loadAll();
  }

  async function deleteEvent(id) {
    await supabase.from('calendar_events').delete().eq('id', id);
    loadAll();
  }

  async function saveAttendance(data) {
    if (editAttendance?.id) {
      await supabase.from('sunday_attendance').update(data).eq('id', editAttendance.id);
    } else {
      await supabase.from('sunday_attendance').insert(data);
    }
    setModal(null); setEditAttendance(null); loadAll();
  }

  async function deleteAttendance(id) {
    await supabase.from('sunday_attendance').delete().eq('id', id);
    loadAll();
  }

  async function toggleTodo(id, done) {
    await supabase.from('todos').update({ done: !done, completed_at: !done ? new Date().toISOString() : null }).eq('id', id);
    loadAll();
  }
  async function deleteTodo(id) {
    await supabase.from('todos').delete().eq('id', id);
    loadAll();
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const selectedEvents = events.filter(e => e.event_date === selectedDate);
  const upcoming = events.filter(e => e.event_date >= todayStr()).sort((a,b) => a.event_date.localeCompare(b.event_date)).slice(0, 20);
  const pendingTodos = todos.filter(t => !t.done);
  const doneTodos = todos.filter(t => t.done);

  // Attendance stats
  const avgAttendance = attendance.length > 0
    ? Math.round(attendance.reduce((s, a) => s + (a.total || 0), 0) / attendance.length)
    : 0;
  const lastService = attendance[0];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontFamily: 'Cormorant Garamond, serif', fontWeight: 700 }}>Calendar</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {pendingTodos.length} pending · {upcoming.length} upcoming · avg attendance {avgAttendance}
          </p>
        </div>
        {/* View switcher */}
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
          {[['calendar','📅 Calendar'], ['attendance','⛪ Attendance'], ['upcoming','🔔 Upcoming']].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: view === id ? 'var(--gold)' : 'transparent',
              color: view === id ? '#0b0f14' : 'var(--text2)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {view === 'attendance' && (
            <Btn onClick={() => { setEditAttendance(null); setModal('attendance'); }}>
              <Plus size={13} /> Record Service
            </Btn>
          )}
          {view !== 'attendance' && (
            <Btn onClick={() => { setEditEvent({ event_date: selectedDate }); setModal('event'); }}>
              <Plus size={13} /> Add Event
            </Btn>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(12px,3vw,24px) clamp(14px,4vw,28px)' }}>

        {/* ── CALENDAR VIEW ── */}
        {view === 'calendar' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20 }}>
            {/* Grid */}
            <div>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button onClick={prevMonth} style={navBtn}><ChevronLeft size={15} /></button>
                <h2 style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>{MONTHS[month]} {year}</h2>
                <button onClick={nextMonth} style={navBtn}><ChevronRight size={15} /></button>
                <button onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); setSelectedDate(todayStr()); }} style={ghostBtnStyle}>Today</button>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                {Object.entries(EVENT_TYPES).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text3)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: val.color }} />
                    {val.label}
                  </div>
                ))}
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', padding: '4px 0', fontWeight: 500 }}>{d}</div>
                ))}
              </div>

              {/* Cells */}
              <CalendarGrid
                year={year} month={month} events={events}
                selectedDate={selectedDate}
                onDayClick={d => setSelectedDate(d)}
              />
            </div>

            {/* Day panel */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', alignSelf: 'start' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(selectedDate)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {selectedDate === todayStr() ? 'Today' : (() => { const d = daysUntil(selectedDate); return d > 0 ? `In ${d} day${d>1?'s':''}` : d < 0 ? `${Math.abs(d)} day${Math.abs(d)>1?'s':''} ago` : 'Today'; })()}
                  </div>
                </div>
                <Btn size="sm" onClick={() => { setEditEvent({ event_date: selectedDate }); setModal('event'); }}>
                  <Plus size={12} /> Event
                </Btn>
              </div>
              <div style={{ padding: '10px 14px', minHeight: 100 }}>
                {selectedEvents.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>No events this day</p>
                ) : selectedEvents.map(e => {
                  const ts = typeStyle(e.event_type || 'event');
                  return (
                    <div key={e.id} style={{ padding: '9px 12px', borderRadius: 8, background: ts.bg, border: `1px solid ${ts.color}30`, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: ts.color }}>{e.title}</div>
                          {e.time && (
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={10} /> {fmtTime(e.time)}{e.end_time ? ` – ${fmtTime(e.end_time)}` : ''}
                            </div>
                          )}
                          {e.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, lineHeight: 1.4 }}>{e.description}</div>}
                        </div>
                        {!e._synthetic && (
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button onClick={() => { setEditEvent(e); setModal('event'); }} style={iconBtn}><Edit2 size={11} /></button>
                            <button onClick={() => deleteEvent(e.id)} style={iconBtn}><Trash2 size={11} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pending todos */}
              {pendingTodos.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Pending To-Dos ({pendingTodos.length})
                  </div>
                  {pendingTodos.slice(0, 5).map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <button onClick={() => toggleTodo(t.id, t.done)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0, flexShrink: 0 }}>
                        <Square size={13} />
                      </button>
                      <span style={{ fontSize: 12, flex: 1, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      {t.due_date && <span style={{ fontSize: 10, color: t.due_date < todayStr() ? '#f87171' : 'var(--text3)', flexShrink: 0 }}>{fmtDate(t.due_date)}</span>}
                    </div>
                  ))}
                  {pendingTodos.length > 5 && <p style={{ fontSize: 11, color: 'var(--text3)' }}>+ {pendingTodos.length - 5} more</p>}
                  <Btn size="sm" variant="ghost" style={{ marginTop: 6, width: '100%', justifyContent: 'center', fontSize: 11 }}
                    onClick={() => { setEditEvent(null); setModal('todo'); }}>
                    <Plus size={11} /> Add To-Do
                  </Btn>
                </div>
              )}
              {pendingTodos.length === 0 && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
                  <Btn size="sm" variant="ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
                    onClick={() => { setEditEvent(null); setModal('todo'); }}>
                    <Plus size={11} /> Add To-Do
                  </Btn>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ATTENDANCE VIEW ── */}
        {view === 'attendance' && (
          <div style={{ maxWidth: 800 }}>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Services Recorded', val: attendance.length, icon: <Church size={18} />, color: 'var(--blue)' },
                { label: 'Average Attendance', val: avgAttendance, icon: <Users size={18} />, color: 'var(--gold)' },
                { label: 'Last Service', val: lastService ? lastService.total : '—', icon: <BarChart2 size={18} />, color: 'var(--green)' },
                { label: 'Best Sunday', val: attendance.length > 0 ? Math.max(...attendance.map(a => a.total || 0)) : '—', icon: <Target size={18} />, color: 'var(--amber)' },
              ].map(({ label, val, icon, color }) => (
                <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ color, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontSize: 26, fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Attendance list */}
            {attendance.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
                <Church size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
                <p>No services recorded yet. Click "Record Service" to start.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {attendance.map(a => (
                  <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Date bar */}
                    <div style={{ minWidth: 80, textAlign: 'center', background: 'rgba(201,168,76,0.1)', border: '1px solid var(--gold)', borderRadius: 8, padding: '8px 6px' }}>
                      <div style={{ fontSize: 18, fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>
                        {format(parseISO(a.service_date), 'd')}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{format(parseISO(a.service_date), 'MMM yyyy')}</div>
                      <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{format(parseISO(a.service_date), 'EEEE')}</div>
                    </div>

                    {/* Stats */}
                    <div style={{ flex: 1, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      <Stat label="Total" val={a.total} color="var(--gold)" />
                      {a.members !== null && a.members !== undefined && <Stat label="Members" val={a.members} color="var(--blue)" />}
                      {a.first_timers !== null && a.first_timers !== undefined && <Stat label="First Timers" val={a.first_timers} color="var(--amber)" />}
                      {a.children !== null && a.children !== undefined && <Stat label="Children" val={a.children} color="var(--green)" />}
                      {a.online !== null && a.online !== undefined && <Stat label="Online" val={a.online} color="var(--text2)" />}
                    </div>

                    {/* Notes */}
                    {a.notes && <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 180, lineHeight: 1.4 }}>{a.notes}</div>}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setEditAttendance(a); setModal('attendance'); }} style={iconBtn}><Edit2 size={13} /></button>
                      <button onClick={() => deleteAttendance(a.id)} style={iconBtn}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── UPCOMING VIEW ── */}
        {view === 'upcoming' && (
          <div style={{ maxWidth: 680 }}>
            {/* Overdue tasks */}
            {(() => {
              const overdue = todos.filter(t => !t.done && t.due_date && t.due_date < todayStr());
              if (!overdue.length) return null;
              return (
                <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <AlertCircle size={14} color="#f87171" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#f87171' }}>Overdue ({overdue.length})</span>
                  </div>
                  {overdue.map(t => (
                    <div key={t.id} style={{ fontSize: 12, color: '#f87171', padding: '4px 0', borderBottom: '1px solid rgba(248,113,113,0.1)' }}>
                      {t.title} · due {fmtDate(t.due_date)}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Upcoming events */}
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text3)', marginBottom: 12 }}>Upcoming Events</div>
            {upcoming.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)' }}>
                <Bell size={32} style={{ marginBottom: 10, opacity: 0.3 }} /><p>No upcoming events.</p>
              </div>
            ) : upcoming.map(e => {
              const ts = typeStyle(e.event_type || 'event');
              const d = daysUntil(e.event_date);
              return (
                <div key={e.id} style={{ display: 'flex', gap: 14, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ width: 4, borderRadius: 2, background: ts.color, alignSelf: 'stretch', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                      {fmtDate(e.event_date)}{e.time ? ' · ' + fmtTime(e.time) : ''}
                    </div>
                    {e.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{e.description}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: d === 0 ? 'var(--gold)' : d <= 3 ? '#f87171' : 'var(--text2)' }}>
                      {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d}d`}
                    </div>
                    <div style={{ fontSize: 10, color: ts.color, marginTop: 3 }}>{ts.label}</div>
                  </div>
                </div>
              );
            })}

            {/* Pending to-dos */}
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text3)', margin: '24px 0 12px' }}>
              To-Do ({pendingTodos.length})
            </div>
            <Btn size="sm" onClick={() => setModal('todo')} style={{ marginBottom: 12 }}><Plus size={12} /> Add To-Do</Btn>
            {pendingTodos.map(t => (
              <TodoRow key={t.id} todo={t} onToggle={() => toggleTodo(t.id, t.done)} onDelete={() => deleteTodo(t.id)} />
            ))}
            {doneTodos.length > 0 && (
              <>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text3)', margin: '20px 0 10px' }}>Completed</div>
                {doneTodos.slice(0, 8).map(t => (
                  <TodoRow key={t.id} todo={t} onToggle={() => toggleTodo(t.id, t.done)} onDelete={() => deleteTodo(t.id)} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal === 'event' && (
        <EventModal
          event={editEvent}
          onSave={saveEvent}
          onClose={() => { setModal(null); setEditEvent(null); }}
        />
      )}
      {modal === 'attendance' && (
        <AttendanceModal
          record={editAttendance}
          onSave={saveAttendance}
          onClose={() => { setModal(null); setEditAttendance(null); }}
        />
      )}
      {modal === 'todo' && (
        <TodoModal onSave={async data => { await supabase.from('todos').insert(data); setModal(null); loadAll(); }} onClose={() => setModal(null)} />
      )}

      <SectionChat section="calendar" />
    </div>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────
function CalendarGrid({ year, month, events, selectedDate, onDayClick }) {
  const firstDay = getDay(startOfMonth(new Date(year, month, 1)));
  const daysCount = getDaysInMonth(new Date(year, month, 1));
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysCount; d++) cells.push(d);

  const tStr = todayStr();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
      {cells.map((day, i) => {
        if (!day) return <div key={i} />;
        const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayEvts = events.filter(e => e.event_date === dateStr);
        const isTd = dateStr === tStr;
        const isSel = dateStr === selectedDate;

        return (
          <div key={i} onClick={() => onDayClick(dateStr)} style={{
            minHeight: 'clamp(44px, 10vw, 64px)', padding: '4px 5px', borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${isSel ? 'var(--gold)' : isTd ? 'rgba(201,168,76,0.35)' : 'transparent'}`,
            background: isSel ? 'rgba(201,168,76,0.12)' : isTd ? 'rgba(201,168,76,0.05)' : 'var(--surface)',
            transition: 'all 0.1s',
          }}>
            <div style={{ fontSize: 12, fontWeight: isTd ? 700 : 400, color: isTd ? 'var(--gold)' : 'var(--text)', marginBottom: 3 }}>{day}</div>
            {dayEvts.slice(0, 3).map(e => {
              const ts = typeStyle(e.event_type || 'event');
              return (
                <div key={e.id} style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: ts.bg, color: ts.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                  {e.title}
                </div>
              );
            })}
            {dayEvts.length > 3 && <div style={{ fontSize: 9, color: 'var(--text3)' }}>+{dayEvts.length - 3}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Event Modal ──────────────────────────────────────────────────────────────
function EventModal({ event, onSave, onClose }) {
  const [form, setForm] = useState({
    title: event?.title || '',
    event_date: event?.event_date || todayStr(),
    time: event?.time || '',
    end_time: event?.end_time || '',
    event_type: event?.event_type || 'event',
    description: event?.description || '',
  });
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title={event?.id ? 'Edit Event' : 'New Event'} onClose={onClose}>
      <FormField label="Title *"><input value={form.title} onChange={s('title')} autoFocus placeholder="e.g. Sunday Service, Youth Night..." /></FormField>
      <FormField label="Event Type">
        <select value={form.event_type} onChange={s('event_type')}>
          {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Date *"><input type="date" value={form.event_date} onChange={s('event_date')} /></FormField>
        <FormField label="Time"><input type="time" value={form.time} onChange={s('time')} /></FormField>
      </div>
      <FormField label="End Time"><input type="time" value={form.end_time} onChange={s('end_time')} /></FormField>
      <FormField label="Description"><textarea value={form.description} onChange={s('description')} rows={3} /></FormField>
      <Btn onClick={() => form.title.trim() && onSave(form)} disabled={!form.title.trim()} style={{ width: '100%', justifyContent: 'center' }}>
        <Save size={13} /> {event?.id ? 'Save Changes' : 'Add Event'}
      </Btn>
    </Modal>
  );
}

// ─── Attendance Modal ─────────────────────────────────────────────────────────
function AttendanceModal({ record, onSave, onClose }) {
  const [form, setForm] = useState({
    service_date: record?.service_date || todayStr(),
    total: record?.total || '',
    members: record?.members ?? '',
    first_timers: record?.first_timers ?? '',
    children: record?.children ?? '',
    online: record?.online ?? '',
    notes: record?.notes || '',
    service_name: record?.service_name || 'Sunday Service',
  });
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Auto-calc total if breakdown is filled
  function calcTotal() {
    const m = parseInt(form.members) || 0;
    const ft = parseInt(form.first_timers) || 0;
    const ch = parseInt(form.children) || 0;
    if (m || ft || ch) setForm(f => ({ ...f, total: m + ft + ch }));
  }

  function submit() {
    if (!form.service_date || !form.total) return;
    onSave({
      ...form,
      total: parseInt(form.total) || 0,
      members: form.members !== '' ? parseInt(form.members) : null,
      first_timers: form.first_timers !== '' ? parseInt(form.first_timers) : null,
      children: form.children !== '' ? parseInt(form.children) : null,
      online: form.online !== '' ? parseInt(form.online) : null,
    });
  }

  return (
    <Modal title={record?.id ? 'Edit Service Record' : 'Record Sunday Service'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Date *"><input type="date" value={form.service_date} onChange={s('service_date')} /></FormField>
        <FormField label="Service Name">
          <select value={form.service_name} onChange={s('service_name')}>
            <option>Sunday Service</option>
            <option>Midweek Service</option>
            <option>Prayer Meeting</option>
            <option>Special Service</option>
            <option>Outreach</option>
          </select>
        </FormField>
      </div>

      <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: 14, marginBottom: 4 }}>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>BREAKDOWN (optional — fills total automatically)</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Members"><input type="number" min="0" value={form.members} onChange={s('members')} onBlur={calcTotal} /></FormField>
          <FormField label="First Timers"><input type="number" min="0" value={form.first_timers} onChange={s('first_timers')} onBlur={calcTotal} /></FormField>
          <FormField label="Children"><input type="number" min="0" value={form.children} onChange={s('children')} onBlur={calcTotal} /></FormField>
          <FormField label="Online"><input type="number" min="0" value={form.online} onChange={s('online')} /></FormField>
        </div>
      </div>

      <FormField label="Total Attendance *">
        <input type="number" min="0" value={form.total} onChange={s('total')} placeholder="Or enter total directly" />
      </FormField>
      <FormField label="Notes"><textarea value={form.notes} onChange={s('notes')} rows={2} placeholder="Any notes about this service..." /></FormField>

      <Btn onClick={submit} disabled={!form.service_date || !form.total} style={{ width: '100%', justifyContent: 'center' }}>
        <Save size={13} /> {record?.id ? 'Save Changes' : 'Record Service'}
      </Btn>
    </Modal>
  );
}

// ─── Todo Modal ───────────────────────────────────────────────────────────────
function TodoModal({ onSave, onClose }) {
  const [form, setForm] = useState({ title: '', due_date: '', priority: 'normal', done: false });
  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <Modal title="Add To-Do" onClose={onClose}>
      <FormField label="Task *"><input value={form.title} onChange={s('title')} autoFocus placeholder="What needs to be done?" /></FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Due Date"><input type="date" value={form.due_date} onChange={s('due_date')} /></FormField>
        <FormField label="Priority">
          <select value={form.priority} onChange={s('priority')}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </FormField>
      </div>
      <Btn onClick={() => form.title.trim() && onSave(form)} disabled={!form.title.trim()} style={{ width: '100%', justifyContent: 'center' }}>
        <Save size={13} /> Add To-Do
      </Btn>
    </Modal>
  );
}

// ─── Stat mini ────────────────────────────────────────────────────────────────
function Stat({ label, val, color }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─── Todo row ─────────────────────────────────────────────────────────────────
function TodoRow({ todo: t, onToggle, onDelete }) {
  const overdue = t.due_date && !t.done && t.due_date < todayStr();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: 'var(--surface)', border: `1px solid ${overdue ? 'rgba(248,113,113,0.3)' : 'var(--border)'}`, borderRadius: 8, marginBottom: 6, opacity: t.done ? 0.55 : 1 }}>
      <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.done ? 'var(--gold)' : 'var(--text3)', padding: 0, marginTop: 1, flexShrink: 0 }}>
        {t.done ? <CheckSquare size={15} /> : <Square size={15} />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--text3)' : 'var(--text)' }}>{t.title}</div>
        {t.due_date && <div style={{ fontSize: 11, color: overdue ? '#f87171' : 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>{overdue && <AlertCircle size={9} />}{fmtDate(t.due_date)}</div>}
      </div>
      <button onClick={onDelete} style={iconBtn}><Trash2 size={12} /></button>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const navBtn = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center' };
const ghostBtnStyle = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', color: 'var(--text2)', fontSize: 12, fontFamily: 'inherit' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 };

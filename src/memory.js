/**
 * memory.js
 * Persistent AI memory stored in Supabase.
 *
 * How it works:
 *  - `chat_memory` table holds key-value memory entries with a category and importance score
 *  - loadMemory()  → reads all entries and formats them for the system prompt
 *  - updateMemory() → after each AI reply, asks the AI to extract new/changed facts and upsert them
 *
 * Memory categories:
 *  - people      : facts about shepherds, sheep, leaders
 *  - structure   : bacentas, basontas, org structure
 *  - decisions   : things the Chief Shepherd decided or instructed
 *  - context     : general church context and patterns
 *  - tasks       : ongoing priorities and focus areas
 */

import { supabase } from './supabase';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile';

// ── Key rotation (same pool) ──────────────────────────────────────────────────
const _rawKeys = [
  import.meta.env.VITE_GROQ_API_KEY_1,
  import.meta.env.VITE_GROQ_API_KEY_2,
  import.meta.env.VITE_GROQ_API_KEY_3,
  import.meta.env.VITE_GROQ_API_KEY_4,
  import.meta.env.VITE_GROQ_API_KEY_5,
  import.meta.env.VITE_GROQ_API_KEY_6,
  import.meta.env.VITE_GROQ_API_KEY,
];
const GROQ_KEYS = _rawKeys.filter(k => k && k.trim() && k !== 'gsk_placeholder').map(k => k.trim());
let _ki = 0;
function _nextKey() { const k = GROQ_KEYS[_ki % GROQ_KEYS.length]; _ki++; return k; }

async function groqCall(messages) {
  for (let i = 0; i < Math.max(GROQ_KEYS.length, 1); i++) {
    const key = _nextKey();
    if (!key) return null;
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, max_tokens: 1024, temperature: 0.2 }),
      });
      if (res.status === 429) continue;
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    } catch { continue; }
  }
  return null;
}

// ── SQL to create the table (run once in Supabase SQL editor) ─────────────────
export const MEMORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS chat_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,        -- short slug, e.g. "shepherd_grace_role"
  value TEXT NOT NULL,             -- the fact itself
  category TEXT DEFAULT 'context', -- people | structure | decisions | context | tasks
  importance INTEGER DEFAULT 5,    -- 1 (low) to 10 (critical)
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

// ── Load all memory entries and format as a string for the system prompt ───────
export async function loadMemory() {
  try {
    const { data, error } = await supabase
      .from('chat_memory')
      .select('key, value, category, importance')
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(80);

    if (error || !data || data.length === 0) return '';

    const grouped = {};
    for (const row of data) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.value);
    }

    const lines = ['--- MEMORY (facts from previous conversations) ---'];
    const order = ['decisions', 'tasks', 'people', 'structure', 'context'];
    for (const cat of order) {
      if (grouped[cat]?.length) {
        lines.push(`[${cat.toUpperCase()}]`);
        grouped[cat].forEach(v => lines.push(`• ${v}`));
      }
    }
    lines.push('--- END MEMORY ---');
    return lines.join('\n');
  } catch {
    return '';
  }
}

// ── After each exchange, extract and save new/updated facts ──────────────────
export async function updateMemory(userMessage, assistantReply) {
  const extractPrompt = `You are a memory manager for a church management AI assistant.

Given this conversation exchange, extract any NEW or UPDATED facts worth remembering for future conversations.
Focus on: people (shepherds/sheep), decisions made, ongoing tasks, org structure changes, Chief Shepherd's preferences.

User said: "${userMessage}"
Assistant replied: "${assistantReply}"

Return ONLY a JSON array (no markdown, no explanation). Each item must have:
- "key": short unique slug (snake_case, e.g. "shepherd_grace_bacenta")
- "value": the fact as a complete sentence
- "category": one of "people" | "structure" | "decisions" | "context" | "tasks"
- "importance": integer 1-10

If nothing new or important was said, return an empty array: []

Examples of good memory entries:
{"key":"shepherd_grace_leads_bacenta3","value":"Shepherd Grace leads Bacenta 3 and oversees 12 sheep.","category":"people","importance":7}
{"key":"chief_shepherd_focus_june","value":"Chief Shepherd wants to focus on outreach in June 2025.","category":"decisions","importance":8}
{"key":"bacenta3_location","value":"Bacenta 3 meets in the East Wing on Thursdays.","category":"structure","importance":5}`;

  const raw = await groqCall([{ role: 'user', content: extractPrompt }]);
  if (!raw) return;

  let entries;
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    entries = JSON.parse(cleaned);
    if (!Array.isArray(entries) || entries.length === 0) return;
  } catch { return; }

  // Upsert each entry by key
  for (const entry of entries) {
    if (!entry.key || !entry.value) continue;
    try {
      await supabase.from('chat_memory').upsert(
        {
          key: entry.key.toLowerCase().replace(/\s+/g, '_').slice(0, 100),
          value: entry.value.slice(0, 500),
          category: ['people','structure','decisions','context','tasks'].includes(entry.category)
            ? entry.category : 'context',
          importance: Math.min(10, Math.max(1, parseInt(entry.importance) || 5)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    } catch { /* non-fatal */ }
  }
}

// ── View all memories (for a debug/settings panel) ────────────────────────────
export async function getAllMemory() {
  const { data } = await supabase
    .from('chat_memory')
    .select('*')
    .order('importance', { ascending: false });
  return data || [];
}

// ── Delete a single memory entry ──────────────────────────────────────────────
export async function deleteMemory(id) {
  await supabase.from('chat_memory').delete().eq('id', id);
}

// ── Clear all memory ──────────────────────────────────────────────────────────
export async function clearAllMemory() {
  await supabase.from('chat_memory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}
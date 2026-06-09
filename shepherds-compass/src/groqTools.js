import { loadMemory, updateMemory } from './memory';

/**
 * groqTools.js
 * Gives the AI the ability to read and write Supabase data.
 * Tools: query_table, insert_record, bulk_insert, update_record, delete_record
 *
 * Flow:
 *  1. We send the user message + tool definitions to Groq
 *  2. Groq responds with tool_calls
 *  3. We execute each call against Supabase
 *  4. We send the results back to Groq for a final natural-language reply
 */

import { supabase } from './supabase';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Key rotation (same pool as groq.js) ─────────────────────────────────────
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
let _keyIndex = 0;
function _nextKey() { const k = GROQ_KEYS[_keyIndex % GROQ_KEYS.length]; _keyIndex++; return k; }

async function groqFetch(body) {
  for (let i = 0; i < Math.max(GROQ_KEYS.length, 1); i++) {
    const key = _nextKey();
    if (!key) return { ok: false, error: 'No Groq API keys configured.' };
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) continue;
    if (!res.ok) { const e = await res.json().catch(() => ({})); return { ok: false, error: e.error?.message || `HTTP ${res.status}` }; }
    return { ok: true, data: await res.json() };
  }
  return { ok: false, error: 'All Groq API keys are rate-limited. Try again in a moment.' };
}

// ── Allowed tables & their writable columns ───────────────────────────────────
const TABLE_COLUMNS = {
  first_timers: ['name', 'phone', 'email', 'address', 'visit_date', 'shepherd_id', 'bacenta_id', 'notes', 'how_did_you_hear', 'is_born_again', 'has_home_church', 'home_church_name', 'interested_in_joining', 'prayer_request', 'occupation'],
  sheep: ['name', 'phone', 'email', 'address', 'bacenta_id', 'shepherd_id', 'basonta', 'first_timer', 'first_timer_date', 'is_active', 'notes'],
  shepherds: ['name', 'phone', 'address', 'email', 'bacenta_id', 'role', 'basonta', 'basonta_role', 'notes'],
  bacentas: ['name', 'location', 'notes'],
  shepherd_tasks: ['shepherd_id', 'title', 'description', 'task_type', 'status', 'due_date'],
  sheep_visits: ['sheep_id', 'shepherd_id', 'visit_type', 'report', 'visited_at'],
  basonta_reports: ['basonta', 'month', 'good', 'can_be_better', 'bad', 'raw_input'],
  bacenta_reports: ['bacenta_id', 'month', 'good', 'can_be_better', 'bad', 'raw_input'],
  outreach_reports: ['shepherd_id', 'location', 'date', 'people_reached', 'first_timers_gained', 'report'],
};

const ALLOWED_TABLES = Object.keys(TABLE_COLUMNS);

// ── Tool definitions (sent to Groq) ──────────────────────────────────────────
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_table',
      description: 'Read rows from a Supabase table. Use before any write/delete to get real UUIDs. Use search_name to find by name, filter_col+filter_val for exact column match.',
      parameters: {
        type: 'object',
        properties: {
          table:       { type: 'string', enum: ALLOWED_TABLES },
          search_name: { type: 'string', description: 'Partial case-insensitive name search' },
          filter_col:  { type: 'string', description: 'Column to filter by exactly, e.g. shepherd_id' },
          filter_val:  { type: 'string', description: 'Value for filter_col' },
          select:      { type: 'string', description: 'Columns to return e.g. id,name,phone. Default: all' },
          limit:       { type: 'integer', description: 'Max rows, default 200' },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_record',
      description: 'Insert one new record. For sheep: fields are name,phone,email,address,shepherd_id,basonta,notes. For shepherds: name,phone,email,address,role,notes.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: ALLOWED_TABLES },
          name:    { type: 'string' },
          phone:   { type: 'string' },
          email:   { type: 'string' },
          address: { type: 'string' },
          notes:   { type: 'string' },
          basonta: { type: 'string', description: 'Ministry group e.g. Media Team, Ushers, Film Stars' },
          role:    { type: 'string', description: 'For shepherds: shepherd or leader' },
          shepherd_id:      { type: 'string', description: 'UUID of assigned shepherd' },
          bacenta_id:       { type: 'string', description: 'UUID of bacenta' },
          first_timer:      { type: 'boolean' },
          first_timer_date: { type: 'string' },
          status:           { type: 'string' },
          title:            { type: 'string' },
          description:      { type: 'string' },
          task_type:        { type: 'string' },
          due_date:         { type: 'string' },
          shepherd_id_task: { type: 'string' },
        },
        required: ['table', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bulk_insert',
      description: 'Insert multiple records at once from a file or list.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: ALLOWED_TABLES },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:    { type: 'string' },
                phone:   { type: 'string' },
                email:   { type: 'string' },
                address: { type: 'string' },
                notes:   { type: 'string' },
                basonta: { type: 'string' },
                role:    { type: 'string' },
                shepherd_id: { type: 'string' },
                bacenta_id:  { type: 'string' },
              },
            },
          },
        },
        required: ['table', 'rows'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_record',
      description: 'Update fields on one record by UUID. Always call query_table first to get the id.',
      parameters: {
        type: 'object',
        properties: {
          table:   { type: 'string', enum: ALLOWED_TABLES },
          id:      { type: 'string', description: 'UUID of record to update' },
          name:    { type: 'string' },
          phone:   { type: 'string' },
          email:   { type: 'string' },
          address: { type: 'string' },
          notes:   { type: 'string' },
          basonta: { type: 'string', description: 'Ministry group name' },
          role:    { type: 'string' },
          status:  { type: 'string' },
          shepherd_id: { type: 'string' },
          bacenta_id:  { type: 'string' },
          title:       { type: 'string' },
          due_date:    { type: 'string' },
        },
        required: ['table', 'id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_record',
      description: 'Delete one record by UUID. Always call query_table first to find the UUID. Never guess.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: ALLOWED_TABLES },
          id:    { type: 'string', description: 'UUID of record to delete' },
        },
        required: ['table', 'id'],
      },
    },
  },
];

// ── UUID format check ────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Execute a single tool call against Supabase ───────────────────────────────
async function executeTool(name, args) {
  if (!ALLOWED_TABLES.includes(args.table)) {
    return { error: `Table "${args.table}" is not allowed.` };
  }

  // Reject placeholder/fake UUIDs before hitting Supabase
  if ((name === 'delete_record' || name === 'update_record') && args.id) {
    if (!UUID_RE.test(args.id)) {
      return { error: `Invalid UUID "${args.id}". You must query_table first to get the real UUID, then use that.` };
    }
  }

  try {
    if (name === 'query_table') {
      let q = supabase.from(args.table).select(args.select || '*').limit(args.limit || 200);
      if (args.search_name) q = q.ilike('name', `%${args.search_name}%`);
      if (args.filter_col && args.filter_val !== undefined) q = q.eq(args.filter_col, args.filter_val);
      if (args.filters && typeof args.filters === 'object') {
        for (const [col, val] of Object.entries(args.filters)) q = q.eq(col, val);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { rows: data, count: data?.length ?? 0 };
    }

    if (name === 'insert_record') {
      // Support both flat fields (new schema) and args.data (legacy)
      const flat = { ...args };
      delete flat.table;
      const raw = (args.data && typeof args.data === 'object') ? args.data : flat;
      const clean = sanitize(args.table, raw);
      const { data, error } = await supabase.from(args.table).insert(clean).select();
      if (error) return { error: error.message };
      notifyChange(args.table);
      return { inserted: data?.[0], success: true };
    }

    if (name === 'bulk_insert') {
      const rows = Array.isArray(args.rows) ? args.rows : [];
      const clean = rows.map(r => sanitize(args.table, r));
      const { data, error } = await supabase.from(args.table).insert(clean).select();
      if (error) return { error: error.message };
      notifyChange(args.table);
      return { inserted_count: data?.length ?? 0, success: true };
    }

    if (name === 'update_record') {
      // Support both flat fields (new schema) and args.data (legacy)
      const flat = { ...args };
      delete flat.table;
      delete flat.id;
      const raw = (args.data && typeof args.data === 'object') ? args.data : flat;
      const clean = sanitize(args.table, raw);
      const { data, error } = await supabase.from(args.table).update(clean).eq('id', args.id).select();
      if (error) return { error: error.message };
      notifyChange(args.table);
      return { updated: data?.[0], success: true };
    }

    if (name === 'delete_record') {
      const { error } = await supabase.from(args.table).delete().eq('id', args.id);
      if (error) return { error: error.message };
      notifyChange(args.table);
      return { deleted_id: args.id, success: true };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (e) {
    return { error: e.message };
  }
}


// Notify other parts of the app that data changed so they can refresh
function notifyChange(table) {
  window.dispatchEvent(new CustomEvent('db-change', { detail: { table } }));
}

// Only pass columns that actually exist for that table
function sanitize(table, data) {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) return data;
  return Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
}

// ── System prompt for the data agent ─────────────────────────────────────────
const AGENT_SYSTEM = `You are the Chief Shepherd's AI data assistant for a church management system.
You have tools to read and write the database. Use them to fulfil the Chief Shepherd's requests.

Database tables:
- first_timers: first-time visitors (separate table from members — fields: name, phone, email, address, visit_date, shepherd_id, bacenta_id, notes, how_did_you_hear, is_born_again, has_home_church, home_church_name, interested_in_joining, prayer_request, occupation)
- sheep: church members (fields: name, phone, email, address, bacenta_id, shepherd_id, basonta, first_timer, is_active, notes)
- shepherds: church leaders (fields: name, phone, address, email, bacenta_id, role ['shepherd'|'leader'], basonta [activity group name], basonta_role ['member'|'basonta_shepherd'], notes). A shepherd is also a church member — they can belong to a bacenta and a basonta. When updating a shepherd's name/phone/email, also update the matching sheep record.
- bacentas: home Bible study groups (fields: name, location, notes)
- shepherd_tasks: tasks for shepherds (fields: shepherd_id, title, description, task_type, status ['pending'|'in_progress'|'done'], due_date)
- sheep_visits: visit records (fields: sheep_id, shepherd_id, visit_type, report, visited_at)
- basonta_reports / bacenta_reports: monthly reports (fields: month [YYYY-MM-01 format], good, can_be_better, bad)
- outreach_reports: outreach logs (fields: shepherd_id, location, date, people_reached, first_timers_gained, report)

Rules:
- For shepherds and sheep, we collect: name, phone, and address. Email is optional. Address can be added later.
- If the user wants to add a shepherd or sheep but has not provided a phone number, DO NOT guess or fabricate one. Instead, reply asking: "What is [name]'s phone number? (You can skip this if you don't have it yet.)" Wait for the answer before inserting.
- NEVER invent or fabricate any data (fake phone numbers like "+1234567890", fake addresses like "123 Main St", fake emails, etc.). If a field is missing and it is not required, omit it. If it is needed, ask the user for it.
- To delete or update a record: ALWAYS call query_table first to get the record's UUID id, then call delete_record or update_record with that UUID. Do this as two separate tool calls in sequence.
- When importing from a file, map columns intelligently (e.g. "full name" → name, "mobile" → phone).
- For bulk imports, use bulk_insert not repeated insert_record calls.
- When a CSV is attached, parse the rows from the document context directly. Each line after the header is one record. Map columns intelligently (name/full name → name, mobile/phone/tel → phone, etc).
- If the document context is truncated, import only the rows you can see and tell the Chief Shepherd how many were imported.
- If a bacenta or shepherd name is given but you need their UUID, query for it first.
- Confirm what you did clearly and concisely at the end. Mention counts for bulk operations.
- Be pastoral and respectful in tone. Address the user as "Chief Shepherd" when appropriate.`;

// ── Main agentic call ─────────────────────────────────────────────────────────
/**
 * Run an agentic loop: send message → get tool calls → execute → send results → get final reply.
 * @param {string} userMessage
 * @param {Array} conversationHistory
 * @param {string|null} documentContext  extracted text from an attached file
 * @returns {Promise<{success: boolean, reply: string, actions: Array}>}
 */
export async function runAgent(userMessage, conversationHistory = [], documentContext = null) {
  const memory = await loadMemory();

  // Truncate and clean document context for tool-calling mode
  // Shorter limit prevents 'failed_generation' errors from Groq
  let safeDoc = null;
  if (documentContext) {
    safeDoc = documentContext
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') // remove control chars
      .replace(/\s+/g, ' ')                              // collapse whitespace
      .trim()
      .slice(0, 4000);
    if (documentContext.length > 4000) safeDoc += '\n[truncated — showing first 4000 chars]';
  }

  const systemParts = [AGENT_SYSTEM];
  if (memory) systemParts.push(memory);
  if (safeDoc) systemParts.push(`---\nAttached document from Chief Shepherd:\n\n${safeDoc}\n---`);
  const systemContent = systemParts.join('\n\n');

  const messages = [
    { role: 'system', content: systemContent },
    ...conversationHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const actions = []; // track what was actually done for the confirmation UI

  // ── Agentic loop: up to 5 rounds of tool calls (handles chained ops like query→delete) ──
  const MAX_ROUNDS = 5;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resp = await groqFetch({
      model: import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      max_tokens: 2048,
    });

    if (!resp.ok) return { success: false, reply: `⚠️ ${resp.error}`, actions };

    const assistantMsg = resp.data.choices[0]?.message;
    if (!assistantMsg) return { success: false, reply: '⚠️ No response from AI.', actions };

    messages.push(assistantMsg);

    // No tool calls — this is the final natural-language reply
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      const finalReply = assistantMsg.content || '';
      updateMemory(userMessage, finalReply).catch(() => {});
      return { success: true, reply: finalReply, actions };
    }

    // Execute each tool call and feed results back
    const toolResults = [];
    for (const tc of assistantMsg.tool_calls) {
      // Groq occasionally jams arguments into the tool name like:
      //   query_table={"table":"sheep"} or query_table {"table":"sheep"}
      // Detect and split on either = or space-before-{
      let rawName = tc.function?.name || '';
      let rawArgs = tc.function?.arguments || '{}';
      const sepIdx = rawName.search(/[= ]\s*\{/);
      if (sepIdx !== -1) {
        const jsonPart = rawName.slice(sepIdx).replace(/^[= ]+/, '').trim();
        rawName = rawName.slice(0, sepIdx).trim();
        if (jsonPart.startsWith('{')) rawArgs = jsonPart;
      }
      const name = rawName;
      let args;
      try { args = JSON.parse(rawArgs); } catch { args = {}; }

      // Guard: refuse bulk delete (no id = would delete all rows)
      if (name === 'delete_record' && !args.id) {
        const result = { error: 'Bulk delete is not permitted. A specific record id is required.' };
        actions.push({ tool: name, args, result });
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        continue;
      }

      const result = await executeTool(name, args);
      actions.push({ tool: name, args, result });

      toolResults.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
    messages.push(...toolResults);
  }

  // Fallback if max rounds hit without a plain reply
  return { success: false, reply: '⚠️ The agent took too many steps. Please try a simpler request.', actions };
}
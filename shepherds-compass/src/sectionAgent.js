/**
 * sectionAgent.js
 *
 * A lightweight version of runAgent that is scoped to a specific section.
 *  - READ  access  → all tables (query_table only)
 *  - WRITE access  → only the tables defined in SECTION_CONFIG[section].writableTables
 *
 * Usage:
 *   import { runSectionAgent } from '../sectionAgent';
 *   const result = await runSectionAgent(message, history, 'shepherds', { shepherdId: '...' });
 */

import { supabase } from './supabase';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Key rotation (shared pool) ────────────────────────────────────────────────
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

// ── Writable columns per table ────────────────────────────────────────────────
const TABLE_COLUMNS = {
  sheep:            ['name', 'phone', 'email', 'address', 'bacenta_id', 'shepherd_id', 'basonta', 'first_timer', 'first_timer_date', 'is_active', 'notes'],
  shepherds:        ['name', 'phone', 'address', 'email', 'bacenta_id', 'role', 'basonta', 'basonta_role', 'sheep_id', 'notes'],
  bacentas:         ['name', 'location', 'notes'],
  shepherd_tasks:   ['shepherd_id', 'title', 'description', 'task_type', 'status', 'due_date'],
  sheep_visits:     ['sheep_id', 'shepherd_id', 'visit_type', 'report', 'visited_at'],
  basonta_reports:  ['basonta', 'month', 'good', 'can_be_better', 'bad', 'raw_input'],
  bacenta_reports:  ['bacenta_id', 'month', 'good', 'can_be_better', 'bad', 'raw_input'],
  outreach_reports: ['shepherd_id', 'location', 'date', 'people_reached', 'first_timers_gained', 'report'],
  campaigns:        ['name', 'description', 'status', 'start_date', 'end_date', 'notes'],
  campaign_reports: ['campaign_id', 'shepherd_id', 'date', 'report', 'people_reached'],
};
const ALL_TABLES = Object.keys(TABLE_COLUMNS);

// ── Section configs ───────────────────────────────────────────────────────────
// Each section defines: which tables it can write to, and a focused system prompt.
export const SECTION_CONFIG = {
  shepherds: {
    label: 'Shepherds',
    writableTables: ['shepherds', 'shepherd_tasks', 'sheep'],
    systemPrompt: `You are the Shepherds section assistant in Shepherd's Compass.
You can READ from all tables, but you may only WRITE to: shepherds, shepherd_tasks, sheep.

CRITICAL MEMBERSHIP RULE:
When a person becomes a shepherd, they DO NOT leave the members (sheep) list. Shepherds are also counted as members of the congregation.
- To promote a member to shepherd: insert_record into shepherds with their details. DO NOT delete or deactivate their sheep record.
- Shepherds remain in the sheep table. Never remove someone from sheep just because they became a shepherd.

BASONTA RULE — Basontas are ministry/activity groups. Shepherds CAN be members of a basonta.
- shepherds.basonta = group name (e.g. 'Media Team')
- shepherds.basonta_role = 'member' (regular member) OR 'basonta_shepherd' (LEADER of that basonta)
- A "Basonta Shepherd" is the leader of a basonta group. Only one per basonta.
- To add a shepherd to a basonta: update_record on shepherds, set { basonta: "<name>", basonta_role: "member" }
- To make a shepherd the basonta leader: update_record on shepherds, set { basonta: "<name>", basonta_role: "basonta_shepherd" }
- To add a regular sheep member to a basonta: update_record on sheep, set { basonta: "<name>" }
- When asked to add someone to a basonta, query_table first to check if they are in sheep or shepherds, then update the correct table.

Focus: adding/editing shepherd profiles, assigning tasks, updating task status, viewing shepherd performance.
When asked about sheep or bacentas, you may read that data to give context, but do NOT modify those tables.`,
  },

  sheep: {
    label: 'Members (Sheep)',
    writableTables: ['sheep', 'sheep_visits', 'shepherds'],
    systemPrompt: `You are the Members section assistant in Shepherd's Compass.
You can READ from all tables, but you may only WRITE to: sheep, sheep_visits, shepherds.

CRITICAL MEMBERSHIP RULE:
Shepherds are also members of the congregation. When someone is made a shepherd, their sheep record STAYS — never delete it.
The sheep table holds ALL church members including shepherds. Total congregation = sheep + shepherds.

BASONTA RULE:
- For regular members: update sheep.basonta to the group name.
- For shepherds in a basonta: update shepherds.basonta + shepherds.basonta_role.
- 'basonta_shepherd' = LEADER of that basonta. 'member' = regular basonta member.
- When asked to add someone to a basonta, check if they are in sheep or shepherds first.

Focus: adding/editing member records, assigning shepherds, logging visits and tele-pastor calls, updating member notes.
Do NOT modify shepherd tasks, basonta reports, or campaign data.`,
  },

  bacentas: {
    label: 'Bacentas',
    writableTables: ['bacentas', 'bacenta_reports', 'sheep', 'shepherds'],
    systemPrompt: `You are the Bacentas section assistant in Shepherd's Compass.
You can READ from all tables, but you may only WRITE to: bacentas, bacenta_reports, sheep, shepherds.
CROSS-SECTION: You can also move a person from sheep (members) to shepherds and vice versa.
  To promote a member to shepherd: insert_record into shepherds with their details, then optionally update or remove them from sheep.
  To demote a shepherd back to member: insert_record into sheep, then delete_record from shepherds.
  Always query_table first to get their current record and UUID.
Focus: creating/editing bacenta groups, logging monthly reports (good/can_be_better/bad), viewing bacenta membership.
BACENTAS are home Bible study groups — do NOT confuse with basontas (ministry groups).`,
  },

  basontas: {
    label: 'Basontas',
    writableTables: ['sheep', 'basonta_reports', 'shepherds'],
    systemPrompt: `You are the Basontas section assistant in Shepherd's Compass.
You can READ from all tables, but you may only WRITE to: sheep, basonta_reports, and shepherds.

The 7 basontas are: "Film Stars", "Dancing Stars", "The Olives", "Praise & Worship Team", "Media Team", "Ushers", "Airport Stars".
BASONTAS are ministry/activity groups — NOT a separate table.

BASONTA MEMBERSHIP RULES (CRITICAL):
- Regular members (sheep) join via: update_record on sheep table, set { basonta: "<group name>" }
- Shepherds also join basontas via: update_record on shepherds table, set { basonta: "<group name>", basonta_role: "member" }
- A "Basonta Shepherd" is the LEADER of a basonta — NOT the same as a church shepherd.
  Set by: update_record on shepherds table, set { basonta: "<group name>", basonta_role: "basonta_shepherd" }
  Each basonta can have only ONE basonta_shepherd, but multiple shepherd members.
- When asked to "add X to a basonta", ALWAYS query_table first to check whether X is in sheep or shepherds, then update the correct table.
- When listing who is in a basonta, query BOTH sheep (sheep.basonta = name) AND shepherds (shepherds.basonta = name).

CONGREGATION RULE: Shepherds are also congregation members. Never remove from sheep when making someone a shepherd.

Focus: assigning members/shepherds to basontas, logging monthly basonta reports, viewing who is in each group.`,
  },

  firstTimers: {
    label: 'First Timers',
    writableTables: ['sheep', 'shepherds'],
    systemPrompt: `You are the First Timers section assistant in Shepherd's Compass.
You can READ from all tables, but you may only WRITE to: sheep, shepherds.
CROSS-SECTION: You can also move a person from sheep (members) to shepherds and vice versa.
  To promote a member to shepherd: insert_record into shepherds with their details, then optionally update or remove them from sheep.
  To demote a shepherd back to member: insert_record into sheep, then delete_record from shepherds.
  Always query_table first to get their current record and UUID.
Focus: adding new first-timer records, assigning shepherds to first timers, viewing follow-up status.
When inserting a first timer, always set first_timer: true and first_timer_date to today's date.`,
  },

  campaigns: {
    label: 'Campaigns',
    writableTables: ['campaigns', 'campaign_reports', 'outreach_reports', 'sheep', 'shepherds'],
    systemPrompt: `You are the Campaigns section assistant in Shepherd's Compass.
You can READ from all tables, but you may only WRITE to: campaigns, campaign_reports, outreach_reports.
Focus: creating campaigns, logging outreach activity, tracking shepherd participation, reporting outcomes.`,
  },

  outreach: {
    label: 'Outreach',
    writableTables: ['outreach_reports', 'sheep', 'shepherds'],
    systemPrompt: `You are the Outreach Reports section assistant in Shepherd's Compass.
You can READ from all tables, but you may only WRITE to: outreach_reports.
Focus: logging outreach events, recording how many people were reached, tracking first timers gained per shepherd.`,
  },
};

// ── Tool builder — write tools are restricted to the section's tables ─────────
function buildTools(writableTables) {
  const writeEnum = writableTables.filter(t => ALL_TABLES.includes(t));

  return [
    {
      type: 'function',
      function: {
        name: 'query_table',
        description: 'Read rows from any table. Use this to search for members, shepherds, tasks etc. Always call this before modifying or deleting data to get the real UUID. To search by name, set search_name. To filter by a column value, set filter_col and filter_val.',
        parameters: {
          type: 'object',
          properties: {
            table:      { type: 'string', enum: ALL_TABLES, description: 'The table to query' },
            search_name:{ type: 'string', description: 'Search by name (case-insensitive partial match on the name column)' },
            filter_col: { type: 'string', description: 'Column name to filter by (exact match), e.g. "shepherd_id"' },
            filter_val: { type: 'string', description: 'Value for filter_col' },
            select:     { type: 'string', description: 'Columns to return, e.g. "id,name,phone". Default is all columns.' },
            limit:      { type: 'integer', description: 'Max rows to return. Default 200.' },
          },
          required: ['table'],
        },
      },
    },
    ...(writeEnum.length > 0 ? [
      {
        type: 'function',
        function: {
          name: 'insert_record',
          description: 'Insert one new record. Fields: name, phone, email, address, notes, basonta (ministry group), role (shepherd/leader), shepherd_id, bacenta_id, first_timer, status, title, description, task_type, due_date.',
          parameters: {
            type: 'object',
            properties: {
              table:            { type: 'string', enum: writeEnum },
              name:             { type: 'string' },
              phone:            { type: 'string' },
              email:            { type: 'string' },
              address:          { type: 'string' },
              notes:            { type: 'string' },
              basonta:          { type: 'string', description: 'Ministry group e.g. Media Team, Ushers' },
              role:             { type: 'string', description: 'shepherd or leader' },
              shepherd_id:      { type: 'string' },
              bacenta_id:       { type: 'string' },
              first_timer:      { type: 'boolean' },
              first_timer_date: { type: 'string' },
              status:           { type: 'string' },
              title:            { type: 'string' },
              description:      { type: 'string' },
              task_type:        { type: 'string' },
              due_date:         { type: 'string' },
            },
            required: ['table', 'name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'bulk_insert',
          description: 'Insert multiple records at once.',
          parameters: {
            type: 'object',
            properties: {
              table: { type: 'string', enum: writeEnum },
              rows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name:        { type: 'string' },
                    phone:       { type: 'string' },
                    email:       { type: 'string' },
                    address:     { type: 'string' },
                    notes:       { type: 'string' },
                    basonta:     { type: 'string' },
                    role:        { type: 'string' },
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
              table:       { type: 'string', enum: writeEnum },
              id:          { type: 'string', description: 'UUID of record to update' },
              name:        { type: 'string' },
              phone:       { type: 'string' },
              email:       { type: 'string' },
              address:     { type: 'string' },
              notes:       { type: 'string' },
              basonta:     { type: 'string' },
              role:        { type: 'string' },
              status:      { type: 'string' },
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
          description: 'Delete one record by UUID. Always query_table first. Never guess a UUID.',
          parameters: {
            type: 'object',
            properties: {
              table: { type: 'string', enum: writeEnum },
              id:    { type: 'string' },
            },
            required: ['table', 'id'],
          },
        },
      },
    ] : []),
  ];
}

// ── Execute tool ──────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitize(table, data) {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) return data;
  return Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
}

function notifyChange(table) {
  window.dispatchEvent(new CustomEvent('db-change', { detail: { table } }));
}

async function executeTool(name, args, writableTables) {
  if (args.limit !== undefined) args.limit = parseInt(args.limit, 10) || 200;

  // Write operations only allowed on section tables
  if (['insert_record', 'bulk_insert', 'update_record', 'delete_record'].includes(name)) {
    if (!writableTables.includes(args.table)) {
      return { error: `Write access denied. This section can only modify: ${writableTables.join(', ')}. Use the main Chat for cross-section changes.` };
    }
  }

  if ((name === 'delete_record' || name === 'update_record') && args.id) {
    if (!UUID_RE.test(args.id)) {
      return { error: `"${args.id}" is not a valid UUID. Call query_table first.` };
    }
  }

  try {
    if (name === 'query_table') {
      let q = supabase.from(args.table).select(args.select || '*').limit(args.limit || 200);
      // search_name: case-insensitive partial match on the name column
      if (args.search_name) q = q.ilike('name', `%${args.search_name}%`);
      // filter_col / filter_val: exact match on a single column
      if (args.filter_col && args.filter_val !== undefined) q = q.eq(args.filter_col, args.filter_val);
      // legacy filters object support (just in case)
      if (args.filters && typeof args.filters === 'object') {
        for (const [col, val] of Object.entries(args.filters)) q = q.eq(col, val);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { rows: data, count: data?.length ?? 0 };
    }

    if (name === 'insert_record') {
      const flat = { ...args }; delete flat.table;
      const raw = (args.data && typeof args.data === 'object') ? args.data : flat;
      const clean = sanitize(args.table, raw);
      const { data, error } = await supabase.from(args.table).insert(clean).select();
      if (error) return { error: error.message };
      notifyChange(args.table);
      return { inserted: data?.[0], success: true };
    }

    if (name === 'bulk_insert') {
      const clean = args.rows.map(r => sanitize(args.table, r));
      const { data, error } = await supabase.from(args.table).insert(clean).select();
      if (error) return { error: error.message };
      notifyChange(args.table);
      return { inserted_count: data?.length ?? 0, success: true };
    }

    if (name === 'update_record') {
      const flat = { ...args }; delete flat.table; delete flat.id;
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

// ── Main section agent ────────────────────────────────────────────────────────
/**
 * @param {string} userMessage
 * @param {Array}  conversationHistory  - [{role, content}]
 * @param {string} section             - key from SECTION_CONFIG
 * @param {object} pageContext         - optional: { currentId, currentName, ... } for context
 */
export async function runSectionAgent(userMessage, conversationHistory = [], section, pageContext = {}) {
  const config = SECTION_CONFIG[section];
  if (!config) return { success: false, reply: `Unknown section: ${section}`, actions: [] };

  const { writableTables, systemPrompt, label } = config;
  const tools = buildTools(writableTables);

  // Build context note about the current page (e.g. "You are on the Shepherds page. Current shepherd: John Smith (id: xxx)")
  const contextNote = Object.keys(pageContext).length > 0
    ? `\nCURRENT PAGE CONTEXT:\n${Object.entries(pageContext).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
    : '';

  const BASE_SYSTEM = `${systemPrompt}${contextNote}

RULES:
1. ALWAYS call query_table before any update or delete to get the real UUID.
2. NEVER invent UUIDs or data. If unsure, ask.
3. READ access spans all tables — use it freely for context and lookups.
4. WRITE access is restricted to: ${writableTables.join(', ')}.
   If the user asks you to modify data outside your write scope, explain that they should use the main Chat assistant for that.
5. Be concise and pastoral in tone. Confirm what you did after each action.
6. NEVER answer ANY question from memory — always call query_table first, every single time, no exceptions.
   This includes: "how many", "who is", "is there a", "find", "check", "search", "which member" — all require a live query.
7. The primary key column is always called "id", never "uuid". Use select="id,name" not "name,uuid".
8. To search by name use filters: {"name": "Daniel"} — but names may be partial, so prefer fetching all and filtering, or use limit:200 select:"id,name".
9. NEVER say "there is no record" without first calling query_table. If a query returns 0 rows, say "I searched and found no match" not "there is no such person".`;

  const historyTurns = conversationHistory.slice(-6).map(m => ({ role: m.role, content: m.content }));
  const messages = [
    { role: 'system', content: BASE_SYSTEM },
    ...historyTurns,
    { role: 'user', content: userMessage },
  ];

  const actions = [];
  const MAX_ROUNDS = 5;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resp = await groqFetch({
      model: import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      max_tokens: 1024,
      temperature: 0.1,
    });

    if (!resp.ok) return { success: false, reply: `⚠️ ${resp.error}`, actions };

    const assistantMsg = resp.data.choices[0]?.message;
    if (!assistantMsg) return { success: false, reply: '⚠️ No response from AI.', actions };

    messages.push(assistantMsg);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return { success: true, reply: assistantMsg.content || '', actions };
    }

    const toolResults = [];
    for (const tc of assistantMsg.tool_calls) {
      let rawName = tc.function?.name || '';
      let rawArgs = tc.function?.arguments || '{}';

      // Handle Groq's occasional malformed tool names:
      // Case 1a: "query_table={...}" — = with JSON embedded
      // Case 1b: "query_table {...}" — space with JSON embedded
      const sepIdx = rawName.search(/[= ]\s*\{/);
      if (sepIdx !== -1) {
        const jsonPart = rawName.slice(sepIdx).replace(/^[= ]+/, '').trim();
        rawName = rawName.slice(0, sepIdx).trim();
        if (jsonPart.startsWith('{')) rawArgs = jsonPart;
      }
      // Case 2: entire call is JSON in the name field
      if (rawName.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawName);
          rawName = parsed.name || 'unknown';
          if (!rawArgs || rawArgs === '{}') rawArgs = JSON.stringify(parsed.arguments || {});
        } catch { /* ignore */ }
      }
      // Case 3: rawArgs is empty/invalid but name had the args embedded — re-check
      if (!rawArgs || rawArgs === '{}' || rawArgs === '') {
        // try to extract from tc.function directly as fallback
        rawArgs = tc.function?.arguments || '{}';
      }
      // Validate rawArgs is parseable; reset to {} if not
      try { JSON.parse(rawArgs); } catch { rawArgs = '{}'; }

      let args;
      try { args = JSON.parse(rawArgs); } catch { args = {}; }

      if (rawName === 'delete_record' && !args.id) {
        const result = { error: 'Bulk delete refused. Provide a specific record id.' };
        actions.push({ tool: rawName, args, result });
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        continue;
      }

      const result = await executeTool(rawName, args, writableTables);
      actions.push({ tool: rawName, args, result });
      toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
    messages.push(...toolResults);
  }

  return { success: false, reply: '⚠️ Too many steps. Try rephrasing your request.', actions };
}

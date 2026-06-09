import { loadMemory, updateMemory } from './memory';

// ---------------------------------------------------------------------------
// Groq key rotator — mirrors the Python pattern in main.py
// Keys are read from VITE_GROQ_API_KEY_1 … VITE_GROQ_API_KEY_6 plus
// the legacy VITE_GROQ_API_KEY, all loaded from .env at build time.
// ---------------------------------------------------------------------------

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile';

const _rawKeys = [
  import.meta.env.VITE_GROQ_API_KEY_1,
  import.meta.env.VITE_GROQ_API_KEY_2,
  import.meta.env.VITE_GROQ_API_KEY_3,
  import.meta.env.VITE_GROQ_API_KEY_4,
  import.meta.env.VITE_GROQ_API_KEY_5,
  import.meta.env.VITE_GROQ_API_KEY_6,
  import.meta.env.VITE_GROQ_API_KEY, // legacy / single-key fallback
];
const GROQ_KEYS = _rawKeys.filter(k => k && k.trim() && k !== 'gsk_placeholder').map(k => k.trim());

if (GROQ_KEYS.length === 0) {
  console.warn('[groq] No Groq API keys found. Set VITE_GROQ_API_KEY_1 … _6 (or VITE_GROQ_API_KEY) in .env');
}

let _keyIndex = 0;

function _nextKey() {
  const key = GROQ_KEYS[_keyIndex % GROQ_KEYS.length];
  _keyIndex++;
  return key;
}

/** Low-level fetch with automatic key rotation on 429 / rate-limit errors. */
async function groqFetch(body) {
  if (GROQ_KEYS.length === 0) {
    return { success: false, error: 'No Groq API keys configured. Add VITE_GROQ_API_KEY_1 (or VITE_GROQ_API_KEY) to your .env file.' };
  }

  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const key = _nextKey();
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) continue; // rate-limited — try next key

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error?.message || `HTTP ${res.status}`;
        if (msg.toLowerCase().includes('rate_limit') || msg.toLowerCase().includes('rate limit')) {
          continue; // rotate
        }
        return { success: false, error: msg };
      }

      const data = await res.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return {
    success: false,
    error: 'All Groq API keys are currently rate-limited. Please try again in a few minutes.',
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the Chief Shepherd's AI assistant for a church management system. 
Your role is to help the Chief Shepherd manage:
- Shepherds (church leaders who care for members)
- Sheep (church members assigned to shepherds)
- Bacentas (home Bible study groups)
- Basontas (church activity groups: Film Stars, Dancing Stars, The Olives, Praise & Worship Team, Media Team, Ushers, Airport Stars)
- Tasks assigned to shepherds
- Monthly reports for basontas and bacentas
- Outreach reports
- First-timer tracking

When the Chief Shepherd tells you about updates, actions, or reports, you:
1. Acknowledge what was done clearly
2. Format any report data cleanly (identifying "good", "can be better", "bad" sections)
3. Provide a brief performance insight if relevant
4. Always be respectful and pastoral in tone

You speak with warmth, wisdom, and clarity. You address the user as "Chief Shepherd" or "Pastor" when appropriate.
Keep responses focused and practical. When analysing shepherd performance, be fair but honest.

IMPORTANT: You are in Chat (advice-only) mode and cannot access the live database. If the Chief Shepherd asks about current counts, lists, or specific records ("how many members", "who are the shepherds"), tell them: "I can't query the database in Chat mode — please switch to Data Agent mode to get live data." Never guess or make up numbers.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function askGroq(userMessage, conversationHistory = [], documentContext = null) {
  const memory = await loadMemory();

  const systemParts = [SYSTEM_PROMPT];
  if (memory) systemParts.push(memory);
  if (documentContext) systemParts.push(`---\nThe Chief Shepherd has shared the following document for context:\n\n${documentContext}\n---`);
  const systemContent = systemParts.join('\n\n');

  const messages = [
    { role: 'system', content: systemContent },
    ...conversationHistory.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const result = await groqFetch({ model: MODEL, messages, max_tokens: 1024, temperature: 0.7 });
  if (!result.success) return { success: false, error: result.error };

  const reply = result.data.choices[0]?.message?.content || '';

  // Fire-and-forget memory update (don't block the reply)
  updateMemory(userMessage, reply).catch(() => {});

  return { success: true, reply };
}

export async function parseMonthlyReport(rawText) {
  const prompt = `Parse this monthly report and extract three sections. Return ONLY valid JSON with keys "good", "can_be_better", "bad". Each value is a string summarising that aspect. If a section is not mentioned, use an empty string.

Report: "${rawText}"

Return only JSON, no markdown, no explanation.`;

  const result = await groqFetch({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.3,
  });

  if (!result.success) return { good: '', can_be_better: '', bad: rawText };

  try {
    const text = result.data.choices[0]?.message?.content || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return { good: '', can_be_better: '', bad: rawText };
  }
}

export async function generateShepherdSummary(shepherd, tasks, visits) {
  const done = tasks.filter(t => t.status === 'done').length;
  const pending = tasks.filter(t => t.status === 'pending').length;

  const prompt = `Briefly assess this shepherd's performance (2-3 sentences, pastoral tone):
Shepherd: ${shepherd.name}
Tasks: ${done} completed, ${pending} pending out of ${tasks.length} total
Recent visits/tele-pastoring: ${visits.length}
Role: ${shepherd.role}`;

  const result = await groqFetch({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.6,
  });

  if (!result.success) return '';
  return result.data.choices[0]?.message?.content || '';
}

/** Returns how many keys are loaded (useful for a settings/status page). */
export function groqKeyCount() {
  return GROQ_KEYS.length;
}
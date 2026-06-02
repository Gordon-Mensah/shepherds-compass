export const BASONTAS = [
  'Film Stars',
  'Dancing Stars',
  'The Olives',
  'Praise & Worship Team',
  'Media Team',
  'Ushers',
  'Airport Stars',
];

export const FIRST_TIMER_QUESTIONS = [
  { key: 'how_did_you_hear', label: 'How did you hear about us?' },
  { key: 'is_born_again', label: 'Are you born again?' },
  { key: 'has_home_church', label: 'Do you have a home church?' },
  { key: 'home_church_name', label: 'If yes, what is the name of your home church?' },
  { key: 'interested_in_joining', label: 'Are you interested in joining us?' },
  { key: 'prayer_request', label: 'Do you have any prayer requests?' },
  { key: 'occupation', label: 'What is your occupation?' },
];

export const TASK_TYPES = {
  general: { label: 'General Task', color: 'var(--blue)' },
  visit: { label: 'Visit', color: 'var(--green)' },
  tele_pastor: { label: 'Tele-Pastor', color: 'var(--gold)' },
  outreach: { label: 'Outreach', color: 'var(--amber)' },
  bacenta: { label: 'Bacenta', color: 'var(--text2)' },
};

export const STATUS_COLORS = {
  pending: 'var(--amber)',
  in_progress: 'var(--blue)',
  done: 'var(--green)',
};

// Groq API keys are loaded in src/groq.js from .env (VITE_GROQ_API_KEY_1 … _6 or VITE_GROQ_API_KEY)

/**
 * fileExtractor.js
 * Extracts plain text from uploaded files so the AI can read them.
 * Supported: PDF, XLSX/XLS/CSV, DOCX, TXT, JSON, and plain text formats.
 */

const MAX_CHARS = 12000; // keep context within token limits

function truncate(text) {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS) + `\n\n[... document truncated at ${MAX_CHARS} characters ...]`;
}

// ── PDF ──────────────────────────────────────────────────────────────────────
async function extractPdf(file) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return truncate(pages.join('\n\n'));
}

// ── XLSX / XLS / CSV ─────────────────────────────────────────────────────────
async function extractSpreadsheet(file) {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  const lines = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(ws);
    if (csv.trim()) {
      lines.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    }
  }
  return truncate(lines.join('\n\n'));
}

// ── DOCX ─────────────────────────────────────────────────────────────────────
async function extractDocx(file) {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return truncate(result.value);
}

// ── Plain text / JSON / CSV (no lib needed) ───────────────────────────────────
async function extractText(file) {
  const text = await file.text();
  return truncate(text);
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function extractFileText(file) {
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop();

  try {
    if (ext === 'pdf') return await extractPdf(file);
    if (['xlsx', 'xls', 'ods'].includes(ext)) return await extractSpreadsheet(file);
    if (ext === 'csv') return await extractSpreadsheet(file);
    if (ext === 'docx') return await extractDocx(file);
    // Everything else: try reading as plain text (txt, json, md, etc.)
    return await extractText(file);
  } catch (err) {
    throw new Error(`Could not read "${file.name}": ${err.message}`);
  }
}

export const SUPPORTED_EXTENSIONS = [
  'pdf', 'xlsx', 'xls', 'csv', 'ods', 'docx', 'txt', 'json', 'md',
];

export function isSupported(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  return SUPPORTED_EXTENSIONS.includes(ext);
}
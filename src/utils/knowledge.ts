import type { Business, WidgetPosition } from '../types/aicare';

export function chunkKnowledgeText(
  rawText: string,
  maxChunkChars = 900,
  overlapChars = 120
): string[] {
  const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunkChars) return [cleaned];

  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChunkChars) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      let start = 0;
      const step = Math.max(100, maxChunkChars - overlapChars);
      while (start < trimmed.length) {
        chunks.push(trimmed.slice(start, start + maxChunkChars).trim());
        if (start + maxChunkChars >= trimmed.length) break;
        start += step;
      }
      continue;
    }

    if ((current + '\n\n' + trimmed).trim().length > maxChunkChars) {
      if (current) chunks.push(current.trim());
      const tail = current.slice(-overlapChars).trim();
      current = tail ? `${tail}\n\n${trimmed}` : trimmed;
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export function parseCsvToReadableText(csvText: string): string {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const parseRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  if (lines.length === 1) return headers.join(' | ');

  const rows: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    const pairs = cols
      .map((val, idx) => {
        const key = headers[idx] || `Column ${idx + 1}`;
        return val ? `${key}: ${val}` : '';
      })
      .filter(Boolean);
    if (pairs.length > 0) {
      rows.push(pairs.join('; '));
    }
  }
  return rows.join('\n');
}

export function retrieveRelevantChunks(
  query: string,
  items: { title: string; content: string }[],
  maxChunks = 8
): string[] {
  if (!items || items.length === 0) return [];

  const allChunks: { label: string; text: string }[] = [];
  for (const item of items) {
    const chunks = chunkKnowledgeText(item.content, 900, 100);
    for (const chunk of chunks) {
      allChunks.push({ label: item.title, text: chunk });
    }
  }

  if (allChunks.length <= maxChunks) {
    return allChunks.map((c) => `[${c.label}]\n${c.text}`);
  }

  const tokens = query
    .toLowerCase()
    .split(/[\s,.?!;:'"()\[\]{}]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const scored = allChunks.map((chunk, idx) => {
    const hay = `${chunk.label} ${chunk.text}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (hay.includes(tok)) {
        score += tok.length >= 5 ? 3 : 1.5;
      }
    }
    // Slight recency/order tiebreaker so foundational items remain accessible
    return { chunk, score, idx };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, maxChunks).map((s) => `[${s.chunk.label}]\n${s.chunk.text}`);
}

export function validateBusinessForPublish(
  business: Partial<Business>,
  knowledgeCount: number
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!business.name?.trim()) missing.push('Business name');
  if (!business.category?.trim()) missing.push('Business category');
  if (!business.contactEmail?.trim() || !business.contactEmail.includes('@')) {
    missing.push('Valid contact email');
  }
  if (!business.operatingHours?.trim()) missing.push('Operating hours');
  if (!business.assistantName?.trim()) missing.push('Assistant name');
  if (!business.welcomeMessage?.trim()) missing.push('Welcome message');
  if (knowledgeCount < 1) missing.push('At least 1 knowledge base item');

  return {
    valid: missing.length === 0,
    missing,
  };
}

export function buildWidgetEmbedSnippet(
  appOrigin: string,
  businessId: string,
  position: WidgetPosition,
  launcherText: string,
  brandColor: string
): string {
  const cleanOrigin = appOrigin.replace(/\/+$/, '');
  const safeId = businessId.replace(/[^a-zA-Z0-9_\-]/g, '');
  const safeText = launcherText.replace(/["<>]/g, '');
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#2563EB';
  const side = position === 'bottom-left' ? 'left:20px;' : 'right:20px;';

  return `<!-- AICare Multilingual Support Widget -->
<div id="aicare-widget-root"></div>
<script>
(function() {
  var open = false;
  var btn = document.createElement("button");
  btn.textContent = "${safeText}";
  btn.setAttribute("aria-label", "Open customer support chat");
  btn.style.cssText = "position:fixed;bottom:20px;${side}z-index:99999;background:${safeColor};color:#fff;border:none;border-radius:9999px;padding:12px 20px;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 10px 25px rgba(15,23,42,0.18);";
  var frame = document.createElement("iframe");
  frame.src = "${cleanOrigin}/widget/${safeId}";
  frame.title = "AICare Customer Support";
  frame.allow = "microphone";
  frame.style.cssText = "display:none;position:fixed;bottom:76px;${side}width:390px;max-width:calc(100vw - 24px);height:580px;max-height:calc(100vh - 100px);border:1px solid #e2e8f0;border-radius:16px;z-index:99999;background:#fff;box-shadow:0 20px 45px rgba(15,23,42,0.2);";
  btn.onclick = function() {
    open = !open;
    frame.style.display = open ? "block" : "none";
  };
  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
</script>`;
}

export function formatUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function clampString(value: string | undefined | null, maxLen: number): string {
  return (value ?? '').trim().slice(0, maxLen);
}

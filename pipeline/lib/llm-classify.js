import { spawnSync } from 'node:child_process';

export function parseLLMVerdicts(stdout) {
  const m = stdout.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

const PROMPT = `You judge OCR'd iPhone screenshots. Each item has an id and OCR text.
Return a JSON array. For each id, output {"id","keep":boolean,"title":string,"type":one of movie|show|game|project|book|music|other}.
KEEP iff the screenshot is plausibly a media recommendation (a show/movie/game/project/book/music) the user might want to check out.
SKIP texts, receipts, OTPs, memes, screenshots-of-UI without a recommendation.
Only output the JSON array, nothing else.`;

export function llmClassify(items, { cliPath = 'claude', timeoutMs = 60_000 } = {}) {
  if (!items.length) return [];
  const payload = PROMPT + '\n\nITEMS:\n' + JSON.stringify(items, null, 2);
  const res = spawnSync(cliPath, ['-p', payload], { encoding: 'utf8', timeout: timeoutMs });
  if (res.error || res.status !== 0) return [];
  return parseLLMVerdicts(res.stdout || '');
}

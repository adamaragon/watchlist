import { writeFile } from 'node:fs/promises';

export function wikiSummaryUrl(title) {
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title).replace(/%2F/g,'/')}`;
}

export function ddgImagesUrl(q) {
  const params = new URLSearchParams({ q, o: 'json' });
  return `https://duckduckgo.com/i.js?${params.toString()}`;
}

export function wikiSearchUrl(q) {
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: q,
    format: 'json', origin: '*', srlimit: '3',
  });
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`;
}

export async function fetchJSON(url, { timeoutMs = 8000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'watchlist-pipeline/0.1 (+local)' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

export async function downloadTo(url, path, { timeoutMs = 15000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'watchlist-pipeline/0.1 (+local)' } });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile(path, buf);
    return true;
  } catch { return false; } finally { clearTimeout(t); }
}

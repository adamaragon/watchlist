import { join } from 'node:path';
import {
  wikiSummaryUrl, wikiSearchUrl,
  fetchJSON as realFetchJSON, downloadTo as realDownloadTo,
} from './lib/web.js';

const YEAR_RX = /\b(19|20)\d{2}\b/;

/**
 * Fuzzy match: does the returned Wikipedia page title correspond to the
 * query title we asked for?
 *
 * Strategy: strip Wikipedia disambiguation parentheticals from pageTitle,
 * then check if one string is a case-insensitive prefix/substring of the
 * other, allowing for minor differences. This catches:
 *   - "Severance (TV series)" for query "Severance"  → ACCEPT
 *   - "Sinners (2025 film)"   for query "Sinners"    → ACCEPT
 *   - "Severance (TV series)" for query "Reddit"     → REJECT
 */
function wikiTitleMatchesQuery(pageTitle, queryTitle) {
  // Strip disambiguation: "Foo (bar baz)" → "Foo"
  const stripped = pageTitle.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const a = stripped.toLowerCase();
  const b = queryTitle.toLowerCase().trim();

  if (!a || !b) return false;

  // Exact match after stripping
  if (a === b) return true;

  // One is a substring of the other (handles "The Lair of…" in "Ken Russell's…")
  if (a.includes(b) || b.includes(a)) return true;

  // Prefix match for short queries (e.g. "Sinners" matches "sinners")
  const shorter = a.length < b.length ? a : b;
  const longer  = a.length < b.length ? b : a;
  if (longer.startsWith(shorter) && shorter.length >= 4) return true;

  // Normalise articles (the, a, an) for comparison
  const norm = s => s.replace(/^(the|a|an)\s+/i, '');
  if (norm(a) === norm(b)) return true;

  return false;
}

// Type → Wikipedia search-hint that disambiguates short titles.
// e.g., "Sinners" alone hits a disambig page; "Sinners film" lands on
// the canonical movie article.
const TYPE_HINT = {
  movie:    'film',
  show:     'TV series',
  game:     'video game',
  book:     'novel',
  music:    'album',
  recipe:   '',
  venue:    '',
  purchase: '',
  project:  '',
  other:    '',
};

// Resolve a candidate to a canonical Wikipedia page title via search,
// preferring articles whose snippet matches the type hint.
async function resolveWikiTitle(cand, fetchJSON) {
  const hint = TYPE_HINT[cand.type] || '';
  const query = hint ? `${cand.title} ${hint}` : cand.title;
  const search = await fetchJSON(wikiSearchUrl(query));
  const hits = search?.query?.search ?? [];
  if (!hits.length) return cand.title; // fall back to raw title
  if (hint) {
    const hintRx = new RegExp(hint.replace(/\s+/g, '\\s+'), 'i');
    const typed = hits.find(h => hintRx.test(h.snippet) || hintRx.test(h.title));
    if (typed) return typed.title;
  }
  return hits[0].title;
}

export async function enrichOne(cand, opts) {
  const { postersDir, fetchJSON = realFetchJSON, downloadTo = realDownloadTo } = opts;
  const out = { ...cand, blurb: '', year: null, link: '', poster: '' };

  // Two-step: search to resolve canonical title, then fetch the summary.
  const canonical = await resolveWikiTitle(cand, fetchJSON);
  const wiki = await fetchJSON(wikiSummaryUrl(canonical));
  if (wiki) {
    // Verify the Wikipedia page actually corresponds to our query. A wrong
    // blurb (e.g. "Reddit" → Severance) is worse than no blurb.
    const pageTitle = wiki.title || '';
    if (!wikiTitleMatchesQuery(pageTitle, cand.title)) {
      return out; // reject — leave blurb/link/year/poster empty
    }

    if (wiki.extract) out.blurb = wiki.extract.split('. ').slice(0, 1).join('. ').trim();
    const yearSource = wiki.description || wiki.extract || '';
    const m = yearSource.match(YEAR_RX);
    if (m) out.year = Number(m[0]);
    if (wiki.content_urls?.desktop?.page) out.link = wiki.content_urls.desktop.page;

    const imgUrl = wiki.originalimage?.source || wiki.thumbnail?.source;
    if (imgUrl) {
      const path = join(postersDir, `${cand.id}.jpg`);
      const ok = await downloadTo(imgUrl, path);
      if (ok) out.poster = `posters/${cand.id}.jpg`;
    }
  }
  return out;
}

export async function enrichAll(candidates, opts) {
  const results = [];
  for (const c of candidates) results.push(await enrichOne(c, opts));
  return results;
}

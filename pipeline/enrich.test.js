import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enrichOne } from './enrich.js';

const FAKE_WIKI = {
  title: 'Severance (TV series)',
  extract: 'Severance is an American science fiction psychological thriller.',
  content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Severance_(TV_series)' } },
  originalimage: { source: 'https://example.com/poster.jpg' },
  description: '2022 American TV series',
};

test('enrichOne fills blurb/year/link/poster from wiki', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const fakeFetchJSON = async (url) => url.includes('wikipedia.org') ? FAKE_WIKI : null;
  const fakeDownload  = async (_url, _path) => true;
  const out = await enrichOne(
    { id: 'severance', title: 'Severance', type: 'show' },
    { postersDir: root, fetchJSON: fakeFetchJSON, downloadTo: fakeDownload }
  );
  assert.match(out.blurb, /science fiction/);
  assert.equal(out.year, 2022);
  assert.equal(out.link, 'https://en.wikipedia.org/wiki/Severance_(TV_series)');
  assert.equal(out.poster, 'posters/severance.jpg');
});

test('enrichOne uses type-hinted search to resolve disambiguation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const SEARCH = { query: { search: [
    { title: 'Sinners (disambiguation)', snippet: 'may refer to' },
    { title: 'Sinners (2025 film)',      snippet: 'horror film directed by' },
  ]}};
  const SUMMARY = {
    title: 'Sinners (2025 film)',
    extract: 'Sinners is a 2025 American horror film.',
    description: '2025 American horror film',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Sinners_(2025_film)' } },
    originalimage: { source: 'https://example.com/sinners.jpg' },
  };
  const calls = [];
  const fakeFetchJSON = async (url) => {
    calls.push(url);
    if (url.includes('list=search')) return SEARCH;
    if (url.includes('/page/summary/')) return SUMMARY;
    return null;
  };
  const out = await enrichOne(
    { id: 'sinners', title: 'Sinners', type: 'movie' },
    { postersDir: root, fetchJSON: fakeFetchJSON, downloadTo: async () => true }
  );
  assert.equal(out.year, 2025);
  assert.match(out.blurb, /2025 American horror film/);
  assert.equal(out.poster, 'posters/sinners.jpg');
  // Confirm search step ran with the type hint ("film").
  assert.ok(calls[0].includes('Sinners') && calls[0].includes('film'));
});

test('enrichOne survives total fetch failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const out = await enrichOne(
    { id: 'unknownia', title: 'Unknownia', type: 'movie' },
    { postersDir: root, fetchJSON: async () => null, downloadTo: async () => false }
  );
  assert.equal(out.id, 'unknownia');
  assert.equal(out.poster, '');
});

// ---- New: reject mismatched Wikipedia hits ----

test('enrichOne rejects Wikipedia page whose title does not match query', async () => {
  // "Reddit" should NOT get the Severance Wikipedia page
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const SEARCH = { query: { search: [
    { title: 'Severance (TV series)', snippet: 'American science fiction series' },
  ]}};
  const SUMMARY = {
    title: 'Severance (TV series)',
    extract: 'Severance is an American science fiction psychological thriller.',
    description: '2022 American TV series',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Severance_(TV_series)' } },
    originalimage: { source: 'https://example.com/poster.jpg' },
  };
  const fakeFetchJSON = async (url) => {
    if (url.includes('list=search')) return SEARCH;
    if (url.includes('/page/summary/')) return SUMMARY;
    return null;
  };
  const out = await enrichOne(
    { id: 'reddit', title: 'Reddit', type: 'show' },
    { postersDir: root, fetchJSON: fakeFetchJSON, downloadTo: async () => true }
  );
  // Should have rejected the mismatch — blurb/link/poster left empty
  assert.equal(out.blurb, '', `blurb should be empty, got: ${out.blurb}`);
  assert.equal(out.link, '');
  assert.equal(out.poster, '');
});

test('enrichOne rejects Wikipedia page whose title is only loosely related', async () => {
  // "Tue Mar 7" should get nothing (date string)
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const SEARCH = { query: { search: [
    { title: 'Pinulot Ka Lang sa Lupa', snippet: 'Philippine TV drama' },
  ]}};
  const SUMMARY = {
    title: 'Pinulot Ka Lang sa Lupa',
    extract: 'Pinulot Ka Lang sa Lupa is a 2017 Philippine television drama.',
    description: '2017 Philippine TV series',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Pinulot_Ka_Lang_sa_Lupa' } },
  };
  const fakeFetchJSON = async (url) => {
    if (url.includes('list=search')) return SEARCH;
    if (url.includes('/page/summary/')) return SUMMARY;
    return null;
  };
  const out = await enrichOne(
    { id: 'tue-mar-7', title: 'Tue Mar 7', type: 'book' },
    { postersDir: root, fetchJSON: fakeFetchJSON, downloadTo: async () => true }
  );
  assert.equal(out.blurb, '');
  assert.equal(out.link, '');
});

test('enrichOne accepts Wikipedia page whose title matches query closely', async () => {
  // "Sinners" → "Sinners" wiki page should be accepted
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const SEARCH = { query: { search: [
    { title: 'Sinners (2025 film)', snippet: 'horror film' },
  ]}};
  const SUMMARY = {
    title: 'Sinners',
    extract: 'Sinners is a 2025 American horror film.',
    description: '2025 American horror film',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Sinners_(2025_film)' } },
  };
  const fakeFetchJSON = async (url) => {
    if (url.includes('list=search')) return SEARCH;
    if (url.includes('/page/summary/')) return SUMMARY;
    return null;
  };
  const out = await enrichOne(
    { id: 'sinners', title: 'Sinners', type: 'movie' },
    { postersDir: root, fetchJSON: fakeFetchJSON, downloadTo: async () => false }
  );
  assert.match(out.blurb, /2025 American horror film/);
  assert.ok(out.link.includes('Sinners'));
});

test('enrichOne accepts Wikipedia page with parenthetical disambiguation', async () => {
  // "Severance" → "Severance (TV series)" should be accepted (prefix match)
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const SEARCH = { query: { search: [
    { title: 'Severance (TV series)', snippet: 'American sci-fi series' },
  ]}};
  const SUMMARY = {
    title: 'Severance (TV series)',
    extract: 'Severance is an American science fiction psychological thriller.',
    description: '2022 American TV series',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Severance_(TV_series)' } },
    originalimage: { source: 'https://example.com/poster.jpg' },
  };
  const fakeFetchJSON = async (url) => {
    if (url.includes('list=search')) return SEARCH;
    if (url.includes('/page/summary/')) return SUMMARY;
    return null;
  };
  const out = await enrichOne(
    { id: 'severance', title: 'Severance', type: 'show' },
    { postersDir: root, fetchJSON: fakeFetchJSON, downloadTo: async () => true }
  );
  assert.match(out.blurb, /science fiction/);
  assert.ok(out.link.includes('Severance'));
});

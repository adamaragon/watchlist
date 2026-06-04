import test from 'node:test';
import assert from 'node:assert/strict';
import { wikiSummaryUrl, ddgImagesUrl } from './web.js';

test('wikiSummaryUrl encodes title', () => {
  assert.equal(
    wikiSummaryUrl('Severance (TV series)'),
    'https://en.wikipedia.org/api/rest_v1/page/summary/Severance%20(TV%20series)'
  );
});

test('ddgImagesUrl builds search', () => {
  const u = ddgImagesUrl('Severance show poster');
  assert.match(u, /^https:\/\/duckduckgo\.com\/i\.js\?/);
  assert.match(u, /q=Severance\+show\+poster/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupCandidates } from './dedup.js';

test('collapses duplicate titles, keeps highest confidence', () => {
  const out = dedupCandidates([
    { id: 'severance', title: 'Severance', type: 'show', confidence: 1 },
    { id: 'severance', title: 'Severance', type: 'show', confidence: 3 },
    { id: 'hades-ii', title: 'Hades II', type: 'game', confidence: 2 },
  ]);
  assert.equal(out.length, 2);
  const sev = out.find(x => x.id === 'severance');
  assert.equal(sev.confidence, 3);
});

test('treats fuzzy near-dupes as same id when slug matches', () => {
  const out = dedupCandidates([
    { id: 'severance', title: 'Severance', type: 'show', confidence: 1 },
    { id: 'severance', title: '  severance  ', type: 'show', confidence: 2 },
  ]);
  assert.equal(out.length, 1);
});

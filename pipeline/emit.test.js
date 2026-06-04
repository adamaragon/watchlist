import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeIntoData } from './emit.js';

test('adds new items and preserves user fields on existing', () => {
  const existing = [
    { id: 'severance', title: 'Severance', type: 'show', status: 'done', notes: 'great', rating: 5, blurb: 'old' }
  ];
  const incoming = [
    { id: 'severance', title: 'Severance', type: 'show', blurb: 'new from wiki', year: 2022, poster: 'posters/severance.jpg', link: 'x' },
    { id: 'hades-ii',  title: 'Hades II',  type: 'game', blurb: '...', year: 2024, poster: '', link: '' }
  ];
  const merged = mergeIntoData(existing, incoming);
  const sev = merged.find(x => x.id === 'severance');
  assert.equal(sev.status, 'done');
  assert.equal(sev.notes, 'great');
  assert.equal(sev.rating, 5);
  assert.equal(sev.blurb, 'new from wiki');
  assert.equal(sev.year, 2022);
  assert.equal(merged.length, 2);
  const h = merged.find(x => x.id === 'hades-ii');
  assert.equal(h.status, 'todo');
});

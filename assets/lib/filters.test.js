import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters } from './filters.js';

const ITEMS = [
  { id:'a', title:'Severance', type:'show',  status:'todo', blurb:'office split memory', tags:[] },
  { id:'b', title:'Hades II',  type:'game',  status:'done', blurb:'roguelite',          tags:['indie'] },
  { id:'c', title:'Dune Pt 2', type:'movie', status:'todo', blurb:'sand worms',         tags:[] },
];

test('search matches title or blurb', () => {
  assert.deepEqual(applyFilters(ITEMS, { q:'worm' }).map(x=>x.id), ['c']);
  assert.deepEqual(applyFilters(ITEMS, { q:'sever' }).map(x=>x.id), ['a']);
});

test('type filter', () => {
  assert.deepEqual(applyFilters(ITEMS, { type:'game' }).map(x=>x.id), ['b']);
});

test('status filter', () => {
  assert.deepEqual(applyFilters(ITEMS, { status:'todo' }).map(x=>x.id), ['a','c']);
});

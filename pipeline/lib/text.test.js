import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, idFor, guessType, cleanTitle } from './text.js';

test('slugify lowercases and dashes', () => {
  assert.equal(slugify('The Last of Us: Part II'), 'the-last-of-us-part-ii');
});

test('idFor is stable for same title', () => {
  assert.equal(idFor('Severance'), idFor('  severance '));
});

test('guessType from OCR cues', () => {
  assert.equal(guessType('Watch on Apple TV+\nSeason 2'), 'show');
  assert.equal(guessType('In theaters Friday'), 'movie');
  assert.equal(guessType('Available on Steam'), 'game');
  assert.equal(guessType('by Brandon Sanderson — Hardcover'), 'book');
  assert.equal(guessType('open source on GitHub'), 'project');
  assert.equal(guessType('random words with no cues'), 'other');
});

test('cleanTitle strips platform chrome', () => {
  assert.equal(cleanTitle('Severance — Apple TV+'), 'Severance');
  assert.equal(cleanTitle('Severance | Netflix'), 'Severance');
  assert.equal(cleanTitle('  Severance  '), 'Severance');
});

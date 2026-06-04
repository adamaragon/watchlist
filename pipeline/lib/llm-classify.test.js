import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLLMVerdicts } from './llm-classify.js';

test('parseLLMVerdicts reads JSON array verdicts', () => {
  const raw = `noise\n[{"id":"a","keep":true,"title":"Severance","type":"show"},{"id":"b","keep":false}]\nmore noise`;
  const v = parseLLMVerdicts(raw);
  assert.equal(v.length, 2);
  assert.equal(v[0].title, 'Severance');
  assert.equal(v[1].keep, false);
});

test('parseLLMVerdicts returns [] on unparseable output', () => {
  assert.deepEqual(parseLLMVerdicts('totally not json'), []);
});

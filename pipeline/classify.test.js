import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyDir } from './classify.js';

test('classifyDir partitions keepers vs skipped', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const inbox = join(root, 'inbox');
  const ocr = join(root, 'ocr');
  mkdirSync(inbox); mkdirSync(ocr);
  writeFileSync(join(inbox, 'a.png'), '');
  writeFileSync(join(inbox, 'b.png'), '');
  writeFileSync(join(ocr,   'a.txt'), 'Severance\nApple TV+\nSeason 2');
  writeFileSync(join(ocr,   'b.txt'), 'Total $13.48\nVisa ****4242');

  const out = await classifyDir({ inboxDir: inbox, ocrDir: ocr, outDir: root, useLLM: false });

  assert.equal(out.candidates.length, 1);
  assert.equal(out.candidates[0].title, 'Severance');
  assert.equal(out.candidates[0].type, 'show');
  assert.equal(out.skipped.length, 1);

  const cands = JSON.parse(readFileSync(join(root, 'candidates.json'), 'utf8'));
  assert.equal(cands.length, 1);
});

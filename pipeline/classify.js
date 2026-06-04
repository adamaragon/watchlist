import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { idFor } from './lib/text.js';
import { scoreOcrText } from './lib/classifier-rules.js';
import { llmClassify } from './lib/llm-classify.js';

export async function classifyDir({ inboxDir, ocrDir, outDir, useLLM = false }) {
  const images = readdirSync(inboxDir).filter(f => !f.startsWith('.'));
  const rows = [];
  for (const img of images) {
    const stem = parse(img).name;
    let text = '';
    try { text = readFileSync(join(ocrDir, `${stem}.txt`), 'utf8'); } catch {}
    rows.push({ img, text, r: scoreOcrText(text) });
  }

  if (useLLM) {
    const borderline = rows
      .filter(({ r }) => r.score === 0 || (r.keep && r.score < 2))
      .map(({ img, text }, i) => ({ id: img, ocr: text.slice(0, 600) }));
    const verdicts = llmClassify(borderline);
    const byId = new Map(verdicts.map(v => [v.id, v]));
    for (const row of rows) {
      const v = byId.get(row.img);
      if (!v) continue;
      row.r.keep = !!v.keep;
      if (v.title) row.r.title = v.title;
      if (v.type)  row.r.type  = v.type;
    }
  }

  const candidates = [], skipped = [];
  for (const { img, text, r } of rows) {
    if (r.keep && r.title && r.title.length >= 2) {
      candidates.push({
        id: idFor(r.title),
        title: r.title,
        type: r.type,
        confidence: r.score,
        source_screenshot: img,
        ocr_excerpt: text.slice(0, 280),
      });
    } else {
      skipped.push({ source_screenshot: img, reason: `score=${r.score}`, ocr_excerpt: text.slice(0, 160) });
    }
  }

  writeFileSync(join(outDir, 'candidates.json'), JSON.stringify(candidates, null, 2));
  writeFileSync(join(outDir, 'skipped.json'),    JSON.stringify(skipped,    null, 2));
  return { candidates, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const useLLM = process.argv.includes('--use-llm');
  const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const [inboxDir, ocrDir, outDir] = positional;
  classifyDir({ inboxDir, ocrDir, outDir, useLLM })
    .then(r => console.log(`kept=${r.candidates.length} skipped=${r.skipped.length}`));
}

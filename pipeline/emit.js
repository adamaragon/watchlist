import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const USER_FIELDS = new Set(['status', 'notes', 'rating', 'tags']);
const SYSTEM_FIELDS = ['title','type','blurb','year','poster','link','source_screenshot','ocr_excerpt','confidence'];

export function mergeIntoData(existing, incoming) {
  const byId = new Map(existing.map(x => [x.id, { ...x }]));
  const today = new Date().toISOString().slice(0, 10);
  for (const item of incoming) {
    const prev = byId.get(item.id);
    if (prev) {
      for (const k of SYSTEM_FIELDS) if (item[k] !== undefined && item[k] !== '' && item[k] !== null) prev[k] = item[k];
      for (const k of USER_FIELDS) if (prev[k] === undefined) prev[k] = defaultFor(k);
    } else {
      byId.set(item.id, {
        ...item,
        status: 'todo',
        tags: [],
        rating: null,
        notes: '',
        added: today,
      });
    }
  }
  return [...byId.values()];
}

function defaultFor(k) {
  return ({ status: 'todo', notes: '', rating: null, tags: [] })[k];
}

export function emitDataFile({ dataPath, incoming }) {
  const existing = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8')) : [];
  const merged = mergeIntoData(existing, incoming);
  writeFileSync(dataPath, JSON.stringify(merged, null, 2));
  return merged;
}

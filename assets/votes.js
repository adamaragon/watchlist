/* Guest voting via Airtable REST (no backend/proxy).
 * One vote per browser per item (tracked in localStorage with the record id,
 * so a change PATCHes and a retract DELETEs — keeps tallies clean). */
import { AIRTABLE } from './airtable-config.js';

const LSV = 'watchlist.votes';
const enabled = () => !!(AIRTABLE.PAT && AIRTABLE.BASE);
const apiBase = () => `https://api.airtable.com/v0/${AIRTABLE.BASE}/${encodeURIComponent(AIRTABLE.VOTES_TABLE)}`;
const hdr = () => ({ 'Authorization': `Bearer ${AIRTABLE.PAT}`, 'Content-Type': 'application/json' });

function localVotes() { try { return JSON.parse(localStorage.getItem(LSV) || '{}'); } catch { return {}; } }
function saveLocal(v) { localStorage.setItem(LSV, JSON.stringify(v)); }

export function isVotingEnabled() { return enabled(); }
export function myVote(id) { return (localVotes()[id] || {}).vote || null; }

/* vote: 'up' | 'down' | null (retract). Returns the new vote state. */
export async function castVote(item, vote) {
  if (!enabled()) return null;
  const lv = localVotes();
  const cur = lv[item.id];
  try {
    if (cur && cur.recordId) {
      if (vote === null || vote === cur.vote) {        // same click -> retract
        await fetch(`${apiBase()}/${cur.recordId}`, { method: 'DELETE', headers: hdr() });
        delete lv[item.id]; saveLocal(lv); return null;
      }
      await fetch(`${apiBase()}/${cur.recordId}`, { method: 'PATCH', headers: hdr(),
        body: JSON.stringify({ fields: { Vote: vote } }) });
      lv[item.id] = { vote, recordId: cur.recordId }; saveLocal(lv); return vote;
    }
    if (vote) {
      const r = await fetch(apiBase(), { method: 'POST', headers: hdr(),
        body: JSON.stringify({ fields: { item_id: item.id, Title: item.title, Vote: vote } }) });
      const j = await r.json();
      if (j && j.id) { lv[item.id] = { vote, recordId: j.id }; saveLocal(lv); return vote; }
    }
  } catch (e) { /* network — leave local state as-is */ }
  return myVote(item.id);
}

/* Returns { item_id: {up, down, net} } across all vote records. */
export async function fetchTallies() {
  if (!enabled()) return {};
  const tally = {};
  let offset = '';
  try {
    do {
      const url = `${apiBase()}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${AIRTABLE.PAT}` } });
      if (!r.ok) break;
      const j = await r.json();
      for (const rec of j.records || []) {
        const f = rec.fields || {};
        const id = f.item_id; if (!id) continue;
        (tally[id] = tally[id] || { up: 0, down: 0 });
        if (f.Vote === 'up') tally[id].up++;
        else if (f.Vote === 'down') tally[id].down++;
      }
      offset = j.offset || '';
    } while (offset);
  } catch (e) { /* offline -> empty */ }
  for (const k in tally) tally[k].net = tally[k].up - tally[k].down;
  return tally;
}

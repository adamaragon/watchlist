export function dedupCandidates(cands) {
  const best = new Map();
  for (const c of cands) {
    const prev = best.get(c.id);
    if (!prev || (c.confidence ?? 0) > (prev.confidence ?? 0)) best.set(c.id, c);
  }
  return [...best.values()];
}

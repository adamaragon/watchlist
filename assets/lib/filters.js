export function applyFilters(items, { q = '', type = '', status = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return items.filter(it => {
    if (type && it.type !== type) return false;
    if (status && it.status !== status) return false;
    if (needle) {
      const hay = `${it.title} ${it.blurb} ${(it.notes||'')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

import { applyFilters } from './lib/filters.js';

const LS_KEY      = 'watchlist.v3';   /* bumped: sectioned view + 875 items + backfilled posters; ignore stale cache */
const LS_SORT_KEY = 'watchlist.sort';
const $ = (s, r=document) => r.querySelector(s);
const grid    = $('#grid');
const tpl     = $('#card-tpl');
const countEl = $('#count');
const sortEl  = $('#sort');

let items = [];

/* section order + plural labels for the grouped view */
const TYPE_ORDER = ['movie','show','game','book','music','recipe','venue','purchase','project','other'];
const TYPE_LABEL = {
  movie:'Movies', show:'Shows', game:'Games', book:'Books', music:'Music',
  recipe:'Recipes', venue:'Venues', purchase:'Purchases', project:'Projects', other:'Other',
};

/* ---------- TYPE METADATA ---------- */
const TYPE_META = {
  movie:    { glyph: '🎬', grad: ['#2a1f5e','#4a2d8c'] },
  show:     { glyph: '📺', grad: ['#0f3040','#1b6b7a'] },
  game:     { glyph: '🎮', grad: ['#3d1608','#7a3518'] },
  book:     { glyph: '📖', grad: ['#2d2010','#5c4020'] },
  music:    { glyph: '🎵', grad: ['#3a0a25','#7a1850'] },
  recipe:   { glyph: '🍽️', grad: ['#0f2d14','#1f5e2a'] },
  venue:    { glyph: '📍', grad: ['#0a1e35','#14406e'] },
  purchase: { glyph: '🛍️', grad: ['#28103d','#562080'] },
  project:  { glyph: '⚙️', grad: ['#1e1a08','#4a3e10'] },
  other:    { glyph: '◈',  grad: ['#1a1520','#302540'] },
};

/* ---------- LOAD / PERSIST ---------- */
async function load() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) { items = JSON.parse(saved); return; }
  try {
    const r = await fetch('data.json', { cache: 'no-store' });
    items = r.ok ? await r.json() : [];
  } catch { items = []; }
}

function persist() { localStorage.setItem(LS_KEY, JSON.stringify(items)); }

/* ---------- SORT ---------- */
function getSortKey() {
  return localStorage.getItem(LS_SORT_KEY) || 'added-desc';
}

function applySort(arr) {
  const key = getSortKey();
  const copy = [...arr];
  switch (key) {
    case 'added-asc':  return copy.sort((a,b) => (a.added||'') < (b.added||'') ? -1 : 1);
    case 'added-desc': return copy.sort((a,b) => (a.added||'') > (b.added||'') ? -1 : 1);
    case 'title-asc':  return copy.sort((a,b) => (a.title||'').localeCompare(b.title||''));
    case 'title-desc': return copy.sort((a,b) => (b.title||'').localeCompare(a.title||''));
    case 'year-asc':   return copy.sort((a,b) => (a.year||0) - (b.year||0));
    case 'year-desc':  return copy.sort((a,b) => (b.year||0) - (a.year||0));
    case 'type':       return copy.sort((a,b) => (a.type||'other').localeCompare(b.type||'other') || (a.title||'').localeCompare(b.title||''));
    default:           return copy;
  }
}

/* ---------- RENDER ---------- */
function render() {
  const q = { q: $('#q').value, type: $('#type').value, status: $('#status').value };
  const filtered = applyFilters(items, q);
  const view = applySort(filtered);
  grid.replaceChildren();

  if (view.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const isFiltered = q.q || q.type || q.status;
    empty.innerHTML = `
      <div class="empty-glyph">${isFiltered ? '🔍' : '🎞️'}</div>
      <p class="empty-msg">${isFiltered ? 'Nothing matches that filter.' : 'Your list is empty.'}</p>
      <p class="empty-hint">${isFiltered ? 'Try clearing the search or filters.' : 'Hit + Add to get started.'}</p>
    `;
    grid.appendChild(empty);
  } else {
    /* group into per-type sections; only non-empty sections render, so
       filtering by type collapses to a single relevant section */
    const groups = new Map();
    for (const it of view) {
      const t = it.type || 'other';
      (groups.get(t) || groups.set(t, []).get(t)).push(it);
    }
    const order = [...TYPE_ORDER, ...[...groups.keys()].filter(t => !TYPE_ORDER.includes(t))];
    for (const t of order) {
      const list = groups.get(t);
      if (!list || !list.length) continue;
      const section = document.createElement('section');
      section.className = 'type-section';
      section.dataset.type = t;
      const head = document.createElement('h2');
      head.className = 'section-head';
      head.innerHTML = `<span class="section-name">${TYPE_LABEL[t] || t}</span><span class="section-count">${list.length}</span>`;
      const sgrid = document.createElement('div');
      sgrid.className = 'section-grid';
      for (const it of list) sgrid.appendChild(card(it));
      section.append(head, sgrid);
      grid.appendChild(section);
    }
  }

  if (countEl) {
    const total = items.length;
    if (view.length === total) {
      countEl.textContent = `${total} item${total !== 1 ? 's' : ''}`;
    } else {
      countEl.textContent = `${view.length} of ${total} item${total !== 1 ? 's' : ''}`;
    }
  }
}

/* ---------- CARD ---------- */
function card(it) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const type = it.type || 'other';
  const hasPoster = !!(it.poster);
  const hasLink   = !!(it.link);

  node.dataset.id       = it.id;
  node.dataset.status   = it.status || 'todo';
  node.dataset.type     = type;
  node.dataset.hasPoster = hasPoster ? 'true' : 'false';
  node.dataset.hasLink  = hasLink ? 'true' : 'false';

  /* poster or placeholder */
  const img = $('.poster img', node);
  if (hasPoster) {
    img.src = it.poster;
    img.alt = it.title;
  } else {
    img.removeAttribute('src');
    img.alt = '';
    applyPlaceholder($('.poster', node), $('.poster-placeholder', node), it);
  }

  /* type badge */
  $('.type', node).textContent = type;

  /* year + title + blurb */
  $('.year',  node).textContent = it.year || '';
  $('.title', node).textContent = it.title;
  $('.blurb', node).textContent = it.blurb || '';

  /* genre chips (from tags) — click to filter */
  const genresEl = $('.genres', node);
  const tags = Array.isArray(it.tags) ? it.tags : [];
  if (tags.length) {
    for (const g of tags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = g;
      chip.title = `Filter by “${g}”`;
      chip.addEventListener('click', () => { $('#q').value = g; render(); });
      genresEl.appendChild(chip);
    }
  } else {
    genresEl.remove();
  }

  /* summary unfold */
  const summaryEl = $('.summary', node);
  if (it.summary) {
    $('.summary-text', summaryEl).textContent = it.summary;
  } else {
    summaryEl.remove();
  }

  /* status select */
  const sel = $('.status', node);
  sel.value = it.status || 'todo';
  sel.addEventListener('change', () => {
    it.status = sel.value;
    node.dataset.status = sel.value;
    persist();
  });

  /* link */
  const linkEl = $('.meta-link', node);
  if (hasLink) {
    linkEl.href = it.link;
  }

  /* inline-edit */
  $('.title', node).addEventListener('input', e => { it.title = e.target.textContent.trim(); persist(); });
  $('.blurb', node).addEventListener('input', e => { it.blurb = e.target.textContent.trim(); persist(); });

  /* delete */
  $('.del', node).addEventListener('click', () => {
    items = items.filter(x => x.id !== it.id); persist(); render();
  });

  /* keyboard: Enter on title moves focus to blurb */
  $('.title', node).addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('.blurb', node).focus(); }
  });

  enableDrag(node);
  return node;
}

/* ---------- PLACEHOLDER ---------- */
function applyPlaceholder(posterEl, placeholderEl, it) {
  const type = it.type || 'other';
  const meta = TYPE_META[type] || TYPE_META.other;
  const [c1, c2] = meta.grad;

  /* gradient background on the poster element itself */
  posterEl.style.background = `linear-gradient(160deg, ${c1} 0%, ${c2} 100%)`;

  /* subtle noise texture overlay via a repeating pattern on top */
  const glyphEl = $('.placeholder-glyph', placeholderEl);
  const titleEl = $('.placeholder-title', placeholderEl);

  glyphEl.textContent  = meta.glyph;
  titleEl.textContent  = it.title || '';
}

/* ---------- DRAG-TO-REORDER ---------- */
function enableDrag(node) {
  node.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', node.dataset.id);
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => node.classList.remove('dragging'));
  node.addEventListener('dragover', e => { e.preventDefault(); node.classList.add('drag-over'); });
  node.addEventListener('dragleave', () => node.classList.remove('drag-over'));
  node.addEventListener('drop', e => {
    e.preventDefault();
    node.classList.remove('drag-over');
    const from = e.dataTransfer.getData('text/plain');
    const to   = node.dataset.id;
    if (from === to) return;
    const i = items.findIndex(x => x.id === from);
    const j = items.findIndex(x => x.id === to);
    if (i < 0 || j < 0) return;
    const [moved] = items.splice(i, 1);
    items.splice(j, 0, moved);
    persist(); render();
  });
}

/* ---------- ADD ---------- */
function addManual() {
  const title = prompt('Title?'); if (!title) return;
  items.unshift({
    id: 'm-' + Date.now().toString(36),
    title, type: 'other', status: 'todo',
    blurb: '', year: null, poster: '', link: '', tags: [], notes: '', rating: null,
    added: new Date().toISOString().slice(0,10),
  });
  persist(); render();
}

/* ---------- EXPORT / IMPORT ---------- */
function exportJson() {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'data.json'; a.click();
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  const txt = await file.text();
  try { items = JSON.parse(txt); persist(); populateTypeFilter(); render(); }
  catch { alert('Import failed: not valid JSON'); }
}

/* ---------- DYNAMIC TYPE FILTER (only types present in data) ---------- */
function populateTypeFilter() {
  const sel = $('#type');
  const present = new Set(items.map(i => i.type || 'other'));
  const ordered = [...TYPE_ORDER.filter(t => present.has(t)),
                   ...[...present].filter(t => !TYPE_ORDER.includes(t))];
  const current = sel.value;
  sel.replaceChildren();
  const all = document.createElement('option');
  all.value = ''; all.textContent = 'all';
  sel.appendChild(all);
  for (const t of ordered) {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    sel.appendChild(o);
  }
  if (present.has(current)) sel.value = current; else sel.value = '';
}

/* ---------- WIRE UP ---------- */
['#q','#type','#status'].forEach(s => $(s).addEventListener('input', render));

sortEl.value = getSortKey();
sortEl.addEventListener('change', () => {
  localStorage.setItem(LS_SORT_KEY, sortEl.value);
  render();
});

$('#add').addEventListener('click', addManual);
$('#export').addEventListener('click', exportJson);
$('#import').addEventListener('change', e => e.target.files[0] && importJson(e.target.files[0]));

await load(); populateTypeFilter(); render();

import { applyFilters } from './lib/filters.js';

const LS_KEY      = 'watchlist.v9';   /* bumped: 100% posters, rating/verdict system, owner gate */
const LS_SORT_KEY = 'watchlist.sort';
const LS_OWNER    = 'watchlist.owner';
const $ = (s, r=document) => r.querySelector(s);
const grid    = $('#grid');
const tpl     = $('#card-tpl');
const countEl = $('#count');
const sortEl  = $('#sort');

let items = [];

/* ---------- OWNER GATE ----------
   Light client-side gate: rating is owner-only; guests browse/filter/suggest.
   This is a deterrent, not real security (the hash is public) — but on a
   static site the canonical data is read-only to guests anyway. Change the
   passphrase by replacing OWNER_HASH with: printf '%s' 'newphrase' | shasum -a 256 */
const OWNER_HASH = '73ed39e720cb63bd270d9610e8617f8f2fef3ef1ab5deb62832feb9b7ce929b5'; /* set by owner */
let isOwner = localStorage.getItem(LS_OWNER) === '1';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function applyOwnerMode() {
  document.body.dataset.owner = isOwner ? 'true' : 'false';
  const lock = $('#lock');
  if (lock) {
    lock.textContent = isOwner ? '🔓 Owner' : '🔒 Guest';
    lock.title = isOwner ? 'Owner mode — click to lock' : 'Guest mode — click to unlock rating';
  }
  const addBtn = $('#add');
  if (addBtn) addBtn.querySelector('.add-label').textContent = isOwner ? 'Add' : 'Suggest';
  const note = $('.footer-note');
  if (note) note.textContent = isOwner
    ? 'drag to reorder · click title or blurb to edit · 👍/👎 to rate'
    : 'browse · filter · suggest a title';
}
async function toggleOwner() {
  if (isOwner) { isOwner = false; localStorage.removeItem(LS_OWNER); applyOwnerMode(); render(); return; }
  const phrase = prompt('Enter owner passphrase to enable rating:');
  if (phrase == null) return;
  if (await sha256(phrase) === OWNER_HASH) {
    isOwner = true; localStorage.setItem(LS_OWNER, '1'); applyOwnerMode(); render();
  } else {
    alert('Incorrect passphrase.');
  }
}

/* ---------- VERDICTS (non-destructive ratings) ---------- */
const VERDICTS = { love: 'loved', up: 'liked', down: 'disliked', skip: 'not interested' };

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
    const r = await fetch(window.WL_DATA || 'data.json', { cache: 'no-store' });
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

  /* partition by verdict */
  const watch = [], loved = [], liked = [], disliked = [], skipped = [];
  for (const it of view) {
    if (it.verdict === 'love') loved.push(it);
    else if (it.verdict === 'up') liked.push(it);
    else if (it.verdict === 'down') disliked.push(it);
    else if (it.verdict === 'skip') skipped.push(it);
    else watch.push(it);
  }

  const visibleCount = watch.length + loved.length + liked.length + disliked.length + (isOwner ? skipped.length : 0);
  if (visibleCount === 0) {
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
    /* 1) Watchlist proper — grouped into per-type sections */
    const groups = new Map();
    for (const it of watch) {
      const t = it.type || 'other';
      (groups.get(t) || groups.set(t, []).get(t)).push(it);
    }
    const order = [...TYPE_ORDER, ...[...groups.keys()].filter(t => !TYPE_ORDER.includes(t))];
    for (const t of order) {
      const list = groups.get(t);
      if (list && list.length) grid.appendChild(buildSection(TYPE_LABEL[t] || t, list, { type: t }));
    }
    /* 2) Seen it — Loved it */
    if (loved.length) grid.appendChild(buildSection('Seen It · Loved It', loved, { seen: 'loved', glyph: '⭐' }));
    /* 3) Seen it — Liked it */
    if (liked.length) grid.appendChild(buildSection('Seen It · Liked It', liked, { seen: 'liked', glyph: '👍' }));
    /* 3) Seen it — Did Not Like (collapsed by default) */
    if (disliked.length) grid.appendChild(buildSection('Seen It · Did Not Like', disliked, { seen: 'disliked', glyph: '👎', collapsed: true }));
    /* 4) Not Interested — owner only, collapsed (kept in db, hidden from guests) */
    if (isOwner && skipped.length) grid.appendChild(buildSection('Not Interested', skipped, { seen: 'skip', glyph: '🚫', collapsed: true }));
  }

  if (countEl) {
    const total = items.length;
    countEl.textContent = visibleCount === total
      ? `${total} item${total !== 1 ? 's' : ''}`
      : `${visibleCount} of ${total} item${total !== 1 ? 's' : ''}`;
  }
}

/* build one section (a <section> with header + grid). Collapsed sections use <details>. */
function buildSection(label, list, opts = {}) {
  const cards = document.createDocumentFragment();
  for (const it of list) cards.appendChild(card(it));
  const headInner = `<span class="section-name">${opts.glyph ? opts.glyph + ' ' : ''}${label}</span><span class="section-count">${list.length}</span>`;

  if (opts.collapsed) {
    const det = document.createElement('details');
    det.className = 'type-section seen-section';
    if (opts.seen) det.dataset.seen = opts.seen;
    const sum = document.createElement('summary');
    sum.className = 'section-head';
    sum.innerHTML = headInner + '<span class="section-caret" aria-hidden="true">▾</span>';
    const sgrid = document.createElement('div');
    sgrid.className = 'section-grid';
    sgrid.appendChild(cards);
    det.append(sum, sgrid);
    return det;
  }

  const section = document.createElement('section');
  section.className = 'type-section';
  if (opts.type) section.dataset.type = opts.type;
  if (opts.seen) section.dataset.seen = opts.seen;
  const head = document.createElement('h2');
  head.className = 'section-head';
  head.innerHTML = headInner;
  const sgrid = document.createElement('div');
  sgrid.className = 'section-grid';
  sgrid.appendChild(cards);
  section.append(head, sgrid);
  return section;
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
  node.dataset.verdict  = it.verdict || '';

  /* poster or placeholder */
  const img = $('.poster img', node);
  if (hasPoster) {
    img.src = (window.WL_BASE || '') + it.poster;
    img.alt = it.title;
  } else {
    img.removeAttribute('src');
    img.alt = '';
    applyPlaceholder($('.poster', node), $('.poster-placeholder', node), it);
  }

  /* type badge */
  $('.type', node).textContent = type;

  /* 3D spine label */
  const spineT = $('.spine-title', node);
  if (spineT) spineT.textContent = it.title;

  /* year + title + blurb (inline-edit is owner-only) */
  $('.year',  node).textContent = it.year || '';
  $('.title', node).textContent = it.title;
  $('.blurb', node).textContent = it.blurb || '';
  $('.title', node).contentEditable = isOwner ? 'true' : 'false';
  $('.blurb', node).contentEditable = isOwner ? 'true' : 'false';
  $('.status', node).disabled = !isOwner;

  /* byline (author) */
  const bylineEl = $('.byline', node);
  if (it.author) bylineEl.textContent = it.author;
  else bylineEl.remove();

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

  /* verdict (non-destructive rating) — owner only, wired via CSS visibility */
  const setVerdict = v => {
    it.verdict = (it.verdict === v) ? null : v;  /* click active again -> back to watchlist */
    persist();
    render();
  };
  $('.v-love', node).addEventListener('click', () => setVerdict('love'));
  $('.v-up',   node).addEventListener('click', () => setVerdict('up'));
  $('.v-down', node).addEventListener('click', () => setVerdict('down'));
  $('.v-skip', node).addEventListener('click', () => setVerdict('skip'));

  /* keyboard: Enter on title moves focus to blurb */
  $('.title', node).addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('.blurb', node).focus(); }
  });

  /* drag-to-reorder is owner-only */
  if (isOwner) {
    enableDrag(node);
  } else {
    node.draggable = false;
  }
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

/* ---------- ADD (owner) / SUGGEST (guest) ---------- */
/* Formsubmit.co — no account/key. On the FIRST submission it emails a
   one-time activation link to this address; click it once and suggestions
   flow thereafter. To hide the address from page source, swap this for the
   random alias Formsubmit gives you after activation. */
const SUGGEST_ENDPOINT = 'https://formsubmit.co/ajax/adam@threesided.com';

function addManual() {
  if (isOwner) {
    const title = prompt('Title to add?'); if (!title) return;
    items.unshift({
      id: 'm-' + Date.now().toString(36),
      title, type: 'other', status: 'todo',
      blurb: '', year: null, poster: '', link: '', tags: [], notes: '', rating: null,
      verdict: null, added: new Date().toISOString().slice(0,10),
    });
    persist(); populateTypeFilter(); render();
  } else {
    openSuggest();
  }
}

/* ---------- SUGGESTION MODAL (guests) ---------- */
const suggestModal = $('#suggest-modal');
function openSuggest() {
  $('#suggest-title').value = '';
  $('#suggest-note').value = '';
  $('#suggest-msg').textContent = '';
  $('#suggest-send').disabled = false;
  suggestModal.hidden = false;
  $('#suggest-title').focus();
}
function closeSuggest() { suggestModal.hidden = true; }
async function sendSuggest() {
  const title = $('#suggest-title').value.trim();
  const note  = $('#suggest-note').value.trim();
  const msg   = $('#suggest-msg');
  if (!title) { msg.textContent = 'Please enter a title.'; return; }
  $('#suggest-send').disabled = true;
  msg.textContent = 'Sending…';
  try {
    const r = await fetch(SUGGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: 'Watchlist suggestion: ' + title,
        title, note: note || '(none)', _captcha: 'false',
      }),
    });
    if (r.ok) {
      msg.textContent = '✓ Sent — thanks!';
      setTimeout(closeSuggest, 1200);
    } else {
      msg.textContent = 'Could not send (try again later).';
      $('#suggest-send').disabled = false;
    }
  } catch {
    msg.textContent = 'Network error — try again later.';
    $('#suggest-send').disabled = false;
  }
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
$('#lock').addEventListener('click', toggleOwner);
$('#suggest-send').addEventListener('click', sendSuggest);
$('#suggest-cancel').addEventListener('click', closeSuggest);
suggestModal.addEventListener('click', e => { if (e.target === suggestModal) closeSuggest(); });
$('#suggest-title').addEventListener('keydown', e => { if (e.key === 'Enter') sendSuggest(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !suggestModal.hidden) closeSuggest(); });

/* ---------- TYPE SUBPAGE (e.g. /books/) ---------- */
function applyForcedType() {
  const t = window.WL_TYPE;
  if (!t) return;
  const sel = $('#type');
  if (sel) {
    sel.value = t;
    const field = sel.closest('.field');
    if (field) field.style.display = 'none';   // lock + hide the type control
  }
  const label = TYPE_LABEL[t] || t;
  document.title = `Watchlist — ${label}`;
  const sub = $('.brand-sub');
  if (sub) sub.textContent = label;
}

await load(); populateTypeFilter(); applyForcedType(); applyOwnerMode(); render();

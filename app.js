/* ===================== Match Log ===================== */
'use strict';

const STORE_KEY = 'matchlog.v1';

const CAUSES = {
  board: 'Board development',
  life: 'Life pressure',
  resources: 'Resource / hand management',
  sequencing: 'Sequencing / info leak',
  don: 'DON!! efficiency',
  rules: 'Rules / timing mistake',
  variance: 'Variance / bad luck',
  opp_misplay: 'Opponent misplay in my favor',
  other: 'Other'
};

/* ---------- State ---------- */
let matches = load();
let scope = 'losses';          // 'losses' | 'all' for cause bars
let editingId = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(matches));
}

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* Sorted newest first: by date, then by createdAt */
function sorted() {
  return [...matches].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)
  );
}

/* ---------- DOM refs ---------- */
const $ = (id) => document.getElementById(id);
const dialog = $('matchDialog');
const form = $('matchForm');

/* ---------- Rendering ---------- */
function pct(w, n) { return n ? Math.round((w / n) * 100) + '%' : '–'; }

function renderSummary() {
  const n = matches.length;
  const wins = matches.filter((m) => m.result === 'win').length;

  $('loggedCount').textContent = n + (n === 1 ? ' match logged' : ' matches logged');
  $('winRate').textContent = pct(wins, n);
  $('record').textContent = n ? `${wins}W – ${n - wins}L` : '';

  // Streak
  const s = sorted();
  const streakEl = $('streak');
  streakEl.classList.remove('streak-w', 'streak-l');
  if (!n) {
    streakEl.textContent = '–';
    $('streakSub').textContent = '';
  } else {
    const first = s[0].result;
    let count = 0;
    for (const m of s) { if (m.result === first) count++; else break; }
    streakEl.textContent = count + (first === 'win' ? 'W' : 'L');
    streakEl.classList.add(first === 'win' ? 'streak-w' : 'streak-l');
    $('streakSub').textContent = first === 'win' ? 'winning' : 'losing';
  }

  // Key card hit rate
  const tracked = matches.filter((m) => m.keySeen === 'yes' || m.keySeen === 'no');
  const seen = tracked.filter((m) => m.keySeen === 'yes').length;
  $('keyRate').textContent = pct(seen, tracked.length);
  $('keyRateSub').textContent = tracked.length ? `${seen}/${tracked.length} games` : 'no data';

  // Last 10 vs all-time
  const strip = $('compareStrip');
  if (n >= 11) {
    strip.hidden = false;
    const last10 = s.slice(0, 10);
    const w10 = last10.filter((m) => m.result === 'win').length;
    const wrAll = wins / n;
    const wr10 = w10 / 10;
    $('last10').textContent = pct(w10, 10);
    $('allTime').textContent = pct(wins, n);
    const trend = $('trend');
    const diff = Math.round((wr10 - wrAll) * 100);
    trend.classList.remove('up', 'down');
    if (diff > 2) { trend.textContent = '▲ ' + diff + 'pts'; trend.classList.add('up'); }
    else if (diff < -2) { trend.textContent = '▼ ' + Math.abs(diff) + 'pts'; trend.classList.add('down'); }
    else { trend.textContent = '≈ steady'; }
  } else {
    strip.hidden = true;
  }
}

function renderMatchups() {
  const rows = $('matchupRows');
  rows.innerHTML = '';
  const byOpp = new Map();
  for (const m of matches) {
    const key = (m.oppLeader || '').trim() || '(unknown)';
    if (!byOpp.has(key)) byOpp.set(key, { n: 0, w: 0 });
    const o = byOpp.get(key);
    o.n++;
    if (m.result === 'win') o.w++;
  }
  const list = [...byOpp.entries()].sort((a, b) => b[1].n - a[1].n);
  $('matchupEmpty').hidden = list.length > 0;
  for (const [opp, o] of list) {
    const wr = Math.round((o.w / o.n) * 100);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(opp)}</td>
      <td class="num">${o.n}</td>
      <td class="num">${o.w}–${o.n - o.w}</td>
      <td class="num ${wr >= 50 ? 'wr-good' : 'wr-bad'}">${wr}%</td>`;
    rows.appendChild(tr);
  }
}

function renderCauses() {
  const pool = scope === 'losses' ? matches.filter((m) => m.result === 'loss') : matches;
  const counts = Object.fromEntries(Object.keys(CAUSES).map((k) => [k, 0]));
  for (const m of pool) if (counts[m.cause] !== undefined) counts[m.cause]++;
  const total = pool.length;
  const wrap = $('causeBars');
  wrap.innerHTML = '';
  $('causeEmpty').hidden = total > 0;
  if (!total) return;
  const entries = Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  for (const [key, c] of entries) {
    const row = document.createElement('div');
    row.className = 'cause-row';
    row.innerHTML = `
      <span class="cause-label">${esc(CAUSES[key])}</span>
      <span class="cause-count">${c} · ${Math.round((c / total) * 100)}%</span>
      <div class="cause-track"><div class="cause-fill" style="width:${(c / max) * 100}%"></div></div>`;
    wrap.appendChild(row);
  }
}

function renderFilters() {
  const opps = [...new Set(matches.map((m) => (m.oppLeader || '').trim()).filter(Boolean))].sort();
  const fo = $('filterOpponent');
  const prevO = fo.value;
  fo.innerHTML = '<option value="">All opponents</option>' +
    opps.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  if ([...fo.options].some((op) => op.value === prevO)) fo.value = prevO;

  const usedCauses = [...new Set(matches.map((m) => m.cause).filter((c) => CAUSES[c]))];
  const fc = $('filterCause');
  const prevC = fc.value;
  fc.innerHTML = '<option value="">All causes</option>' +
    usedCauses.map((c) => `<option value="${c}">${esc(CAUSES[c])}</option>`).join('');
  if ([...fc.options].some((op) => op.value === prevC)) fc.value = prevC;

  // Datalist suggestions for the form
  const mine = [...new Set(matches.map((m) => (m.myLeader || '').trim()).filter(Boolean))].sort();
  $('myLeaderList').innerHTML = mine.map((v) => `<option value="${esc(v)}">`).join('');
  $('oppLeaderList').innerHTML = opps.map((v) => `<option value="${esc(v)}">`).join('');
}

function renderList() {
  const fo = $('filterOpponent').value;
  const fc = $('filterCause').value;
  const ul = $('matchList');
  ul.innerHTML = '';
  const list = sorted().filter((m) =>
    (!fo || (m.oppLeader || '').trim() === fo) && (!fc || m.cause === fc)
  );
  $('listEmpty').hidden = list.length > 0 || matches.length === 0;

  for (const m of list) {
    const li = document.createElement('li');
    li.className = `match-item ${m.result}`;
    li.dataset.id = m.id;
    const dateStr = m.date ? m.date.slice(5).replace('-', '/') : '';
    li.innerHTML = `
      <button type="button" class="match-summary" aria-expanded="false">
        <span class="result-badge">${m.result === 'win' ? 'W' : 'L'}</span>
        <span class="match-main">
          <span class="match-vs">${esc(m.myLeader)} vs ${esc(m.oppLeader)}</span>
          ${m.note ? `<span class="match-note">${esc(m.note)}</span>` : ''}
        </span>
        <span class="match-date">${dateStr}</span>
      </button>
      <div class="match-detail">
        <dl class="detail-grid">
          <div><dt>Date</dt><dd class="mono">${esc(m.date || '–')}</dd></div>
          <div><dt>Went</dt><dd>${m.order === 'first' ? 'First' : 'Second'} · ${m.mull === 'kept' ? 'Kept' : 'Mulliganed'}</dd></div>
          <div><dt>Opening hand</dt><dd class="mono">${m.hand ?? '–'}/10</dd></div>
          <div><dt>Turns</dt><dd class="mono">${m.turns || '–'}${m.turningPoint ? ` · flipped T${m.turningPoint}` : ''}</dd></div>
          <div><dt>Key card</dt><dd>${keyText(m)}</dd></div>
          <div class="full"><dt>Root cause</dt><dd>${esc(CAUSES[m.cause] || m.cause || '–')}</dd></div>
          ${m.note ? `<div class="full"><dt>Note</dt><dd>${esc(m.note)}</dd></div>` : ''}
        </dl>
        <div class="detail-actions">
          <button type="button" class="btn small" data-act="edit">Edit</button>
          <button type="button" class="btn small danger" data-act="delete">Delete</button>
        </div>
      </div>`;
    ul.appendChild(li);
  }
}

function keyText(m) {
  if (m.keySeen === 'yes') return 'Seen' + (m.keyName ? ` · ${esc(m.keyName)}` : '');
  if (m.keySeen === 'no') return 'Not seen' + (m.keyName ? ` · ${esc(m.keyName)}` : '');
  return 'N/A';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function renderAll() {
  renderSummary();
  renderMatchups();
  renderCauses();
  renderFilters();
  renderList();
}

/* ---------- Form ---------- */
function populateCauseSelect() {
  const sel = $('fCause');
  sel.innerHTML = '<option value="" disabled selected>Pick the honest answer…</option>' +
    Object.entries(CAUSES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
}

function openForm(match = null) {
  editingId = match ? match.id : null;
  $('dialogTitle').textContent = match ? 'Edit match' : 'Log a match';
  $('saveBtn').textContent = match ? 'Save changes' : 'Save match';
  form.reset();
  $('fDate').value = match?.date || todayISO();
  setRadio('result', match?.result || '');
  setRadio('order', match?.order || '');
  setRadio('mull', match?.mull || '');
  $('fMyLeader').value = match?.myLeader || lastMyLeader() || '';
  $('fOppLeader').value = match?.oppLeader || '';
  $('fHand').value = match?.hand ?? 5;
  $('handValue').textContent = $('fHand').value;
  $('fTurns').value = match?.turns || '';
  $('fTurningPoint').value = match?.turningPoint || '';
  $('fKeySeen').value = match?.keySeen || 'na';
  $('fKeyName').value = match?.keyName || '';
  $('fCause').value = match?.cause || '';
  $('fNote').value = match?.note || '';
  dialog.showModal();
}

function lastMyLeader() {
  const s = sorted();
  return s.length ? s[0].myLeader : '';
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setRadio(name, value) {
  for (const r of form.elements[name] || []) r.checked = r.value === value;
}

function getRadio(name) {
  const el = form.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const required = {
    date: $('fDate').value,
    result: getRadio('result'),
    myLeader: $('fMyLeader').value.trim(),
    oppLeader: $('fOppLeader').value.trim(),
    order: getRadio('order'),
    mull: getRadio('mull'),
    cause: $('fCause').value
  };
  if (Object.values(required).some((v) => !v)) {
    form.reportValidity();
    return;
  }
  const record = {
    id: editingId || uid(),
    createdAt: editingId
      ? (matches.find((m) => m.id === editingId)?.createdAt ?? Date.now())
      : Date.now(),
    ...required,
    hand: Number($('fHand').value),
    turns: $('fTurns').value ? Number($('fTurns').value) : null,
    turningPoint: $('fTurningPoint').value ? Number($('fTurningPoint').value) : null,
    keySeen: $('fKeySeen').value,
    keyName: $('fKeyName').value.trim() || null,
    note: $('fNote').value.trim() || null
  };
  if (editingId) {
    matches = matches.map((m) => (m.id === editingId ? record : m));
  } else {
    matches.push(record);
  }
  save();
  dialog.close();
  renderAll();
});

$('fHand').addEventListener('input', () => { $('handValue').textContent = $('fHand').value; });
$('fabAdd').addEventListener('click', () => openForm());
$('cancelBtn').addEventListener('click', () => dialog.close());
$('dialogClose').addEventListener('click', () => dialog.close());

/* ---------- List interactions ---------- */
$('matchList').addEventListener('click', (e) => {
  const item = e.target.closest('.match-item');
  if (!item) return;
  const id = item.dataset.id;
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'edit') {
    const m = matches.find((x) => x.id === id);
    if (m) openForm(m);
    return;
  }
  if (act === 'delete') {
    const m = matches.find((x) => x.id === id);
    if (m && confirm(`Delete this match (${m.myLeader} vs ${m.oppLeader})? This can't be undone.`)) {
      matches = matches.filter((x) => x.id !== id);
      save();
      renderAll();
    }
    return;
  }
  if (e.target.closest('.match-summary')) {
    const open = item.classList.toggle('open');
    item.querySelector('.match-summary').setAttribute('aria-expanded', open);
  }
});

$('filterOpponent').addEventListener('change', renderList);
$('filterCause').addEventListener('change', renderList);

/* ---------- Scope toggle ---------- */
$('scopeLosses').addEventListener('click', () => setScope('losses'));
$('scopeAll').addEventListener('click', () => setScope('all'));
function setScope(s) {
  scope = s;
  $('scopeLosses').classList.toggle('active', s === 'losses');
  $('scopeAll').classList.toggle('active', s === 'all');
  renderCauses();
}

/* ---------- Backup ---------- */
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ app: 'match-log', version: 1, exportedAt: new Date().toISOString(), matches }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `matchlog-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  note(`Exported ${matches.length} matches.`);
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.matches;
    if (!Array.isArray(incoming)) throw new Error('bad format');
    const existing = new Set(matches.map((m) => m.id));
    let added = 0, skipped = 0;
    for (const m of incoming) {
      if (!m || typeof m !== 'object' || !m.id || !m.result || !m.date) { skipped++; continue; }
      if (existing.has(m.id)) { skipped++; continue; }
      matches.push(m);
      existing.add(m.id);
      added++;
    }
    save();
    renderAll();
    note(`Import done: ${added} added, ${skipped} skipped.`);
  } catch {
    note('Import failed: that file is not a valid Match Log backup.');
  }
});

$('clearBtn').addEventListener('click', () => {
  if (!matches.length) { note('Nothing to clear.'); return; }
  const ok = confirm(
    `This wipes all ${matches.length} logged matches from this device.\n\nExport a backup first if you haven't. Continue?`
  );
  if (!ok) return;
  matches = [];
  save();
  renderAll();
  note('All data cleared.');
});

function note(msg) {
  const el = $('backupNote');
  el.textContent = msg;
  clearTimeout(note._t);
  note._t = setTimeout(() => { el.textContent = ''; }, 6000);
}

/* ---------- Boot ---------- */
populateCauseSelect();
renderAll();

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

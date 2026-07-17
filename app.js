/* ===================== Match Log v2 ===================== */
'use strict';

const STORE_KEY = 'matchlog.v2';
const OLD_KEY = 'matchlog.v1';

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

/* ---------- Store ---------- */
let db = load();
let causeScope = 'losses';
let deckCauseScope = 'losses';
let currentDeckId = null;
let currentReportId = null;
let editingMatchId = null;

function blankDb() { return { decks: [], reports: [], matches: [] }; }

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.decks)) return { ...blankDb(), ...d };
    }
  } catch {}
  // Migrate v1 (flat match list) if present
  const d = blankDb();
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]');
    if (Array.isArray(old) && old.length) {
      const byLeader = new Map();
      for (const m of old) {
        const name = (m.myLeader || 'My deck').trim() || 'My deck';
        if (!byLeader.has(name)) {
          const deck = { id: uid(), leaderId: null, leaderName: name, colors: [], createdAt: Date.now() };
          d.decks.push(deck);
          byLeader.set(name, deck.id);
        }
        d.matches.push({
          id: m.id || uid(), deckId: byLeader.get(name), createdAt: m.createdAt || Date.now(),
          date: m.date, result: m.result, opp: m.oppLeader || '', dice: null,
          order: m.order, mull: m.mull, hand: m.hand ?? null,
          turns: m.turns ?? null, turningPoint: m.turningPoint ?? null,
          keySeen: m.keySeen || 'na', keyName: m.keyName || null,
          cause: m.cause || null, note: m.note || null
        });
      }
      save(d);
    }
  } catch {}
  return d;
}

function save(data = db) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'x-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Leader helpers ---------- */
function leaderById(id) { return LEADERS.find((l) => l.id === id) || null; }

const COLOR_HEX = {
  red: '#c0392b', green: '#2e8b57', blue: '#2e6da4',
  purple: '#7d4fa8', black: '#2b2b33', yellow: '#d4ac0d'
};

/* One circle per leader: solid if mono, split halves if multi-color */
function leaderDot(colors, extra = '') {
  const cs = (colors || []).map((c) => COLOR_HEX[c.toLowerCase()]).filter(Boolean);
  if (!cs.length) return '';
  let bg;
  if (cs.length === 1) bg = cs[0];
  else {
    const step = 100 / cs.length;
    bg = 'linear-gradient(90deg,' +
      cs.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(',') + ')';
  }
  return `<span class="leader-dot ${extra}" style="background:${bg}" title="${esc((colors || []).join('/'))}"></span>`;
}

/* Colors for an opponent string like "Shanks (OP09-001)" via the card ID */
function oppColors(oppStr, oppLeaderId) {
  if (oppLeaderId) return leaderById(oppLeaderId)?.c || [];
  const m = /\(([A-Za-z]+\d*-\d+[^)]*)\)\s*$/.exec(oppStr || '');
  return m ? (leaderById(m[1])?.c || []) : [];
}

/* Searchable leader combobox. getValue/setValue work on {name, leaderId} */
function initCombo(comboEl, onPick) {
  const input = comboEl.querySelector('input');
  const list = comboEl.querySelector('.combo-list');
  let hlIndex = -1;
  let items = [];

  function close() { list.hidden = true; hlIndex = -1; }
  function open() { render(); list.hidden = false; }

  function render() {
    const q = input.value.trim().toLowerCase();
    // Multi-token search: every word must match name OR id ("ace op16" works)
    const tokens = q.split(/\s+/).filter(Boolean);
    items = !tokens.length ? LEADERS.slice(0, 40)
      : LEADERS.filter((l) => {
          const name = l.n.toLowerCase();
          const id = l.id.toLowerCase();
          return tokens.every((t) => name.includes(t) || id.includes(t));
        }).slice(0, 40);
    list.innerHTML = items.length
      ? items.map((l, i) =>
          `<button type="button" class="combo-opt" data-i="${i}">
             ${leaderDot(l.c)}<span>${esc(l.n)}</span><span class="combo-id">${esc(l.id)}</span>
           </button>`).join('')
      : '<div class="combo-empty">No leader found — free text is fine.</div>';
  }

  function pick(l) {
    input.value = `${l.n} (${l.id})`;
    input.dataset.leaderId = l.id;
    close();
    if (onPick) onPick();
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', () => {
    delete input.dataset.leaderId; // typing invalidates a previous pick
    open();
    if (onPick) onPick();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hlIndex = Math.max(0, Math.min(items.length - 1, hlIndex + (e.key === 'ArrowDown' ? 1 : -1)));
      list.querySelectorAll('.combo-opt').forEach((el, i) => el.classList.toggle('hl', i === hlIndex));
      list.querySelectorAll('.combo-opt')[hlIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (hlIndex >= 0 && items[hlIndex]) { e.preventDefault(); pick(items[hlIndex]); }
      else close();
    } else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.combo-opt');
    if (btn) { e.preventDefault(); pick(items[Number(btn.dataset.i)]); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));

  return {
    get() {
      return { name: input.value.trim(), leaderId: input.dataset.leaderId || null };
    },
    set(name, leaderId) {
      input.value = name || '';
      if (leaderId) input.dataset.leaderId = leaderId; else delete input.dataset.leaderId;
    }
  };
}

/* ---------- Auto-grow textareas ---------- */
function autogrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
document.addEventListener('input', (e) => {
  if (e.target.matches('textarea.autogrow')) autogrow(e.target);
});

/* ---------- Flatten data into "match units" for stats ---------- */
/* Every unit: {deckId, date, createdAt, result: 'win'|'loss'|'draw', opp, isBye, games:[{result,order,cause,...}], note} */
function allUnits() {
  const units = [];
  for (const m of db.matches) {
    units.push({
      kind: 'casual', deckId: m.deckId, date: m.date, createdAt: m.createdAt,
      result: m.result, opp: m.opp, isBye: false, dice: m.dice || null,
      games: [{ result: m.result === 'win' ? 'W' : 'L', order: m.order, cause: m.cause }]
    });
  }
  for (const r of db.reports) {
    for (const rd of r.rounds || []) {
      const bo = roundBo(rd, r);
      const games = (rd.games || []).slice(0, bo).filter((g) => g && g.result);
      let result = null;
      if (rd.outcome === 'bye') result = 'win';
      else if (rd.outcome === 'id') result = 'draw';
      else if (games.length) {
        const w = games.filter((g) => g.result === 'W').length;
        const l = games.filter((g) => g.result === 'L').length;
        result = w > l ? 'win' : l > w ? 'loss' : 'draw';
      }
      if (!result) continue; // nothing filled in yet
      units.push({
        kind: 'round', deckId: r.deckId, date: r.date || todayISO(), createdAt: rd.createdAt || r.createdAt,
        result, opp: rd.opp || '', isBye: rd.outcome === 'bye',
        dice: rd.outcome === 'play' || !rd.outcome ? rd.dice || null : null,
        games: rd.outcome === 'play' || !rd.outcome ? games.map((g) => ({
          result: g.result, order: g.order, cause: g.cause || null
        })) : []
      });
    }
  }
  return units;
}

/* Dice + turn-order stats. Order win rates are game-level, draws excluded. */
function tempoStats(units) {
  const t = { diceW: 0, diceN: 0, fw: 0, fn: 0, sw: 0, sn: 0 };
  for (const u of units) {
    if (u.dice) { t.diceN++; if (u.dice === 'won') t.diceW++; }
    for (const g of u.games) {
      if (g.result === 'D') continue;
      if (g.order === 'first') { t.fn++; if (g.result === 'W') t.fw++; }
      else if (g.order === 'second') { t.sn++; if (g.result === 'W') t.sw++; }
    }
  }
  return t;
}

function fillTempo(prefix, units) {
  const t = tempoStats(units);
  $(prefix + 'Dice').textContent = winPct(t.diceW, t.diceN);
  $(prefix + 'DiceSub').textContent = t.diceN ? `${t.diceW}/${t.diceN} rolls` : 'no data';
  $(prefix + 'First').textContent = winPct(t.fw, t.fn);
  $(prefix + 'FirstSub').textContent = t.fn ? `${t.fw}–${t.fn - t.fw} games` : 'no data';
  $(prefix + 'Second').textContent = winPct(t.sw, t.sn);
  $(prefix + 'SecondSub').textContent = t.sn ? `${t.sw}–${t.sn - t.sw} games` : 'no data';
}

function sortedUnits(units) {
  return [...units].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

function tally(units) {
  const t = { w: 0, l: 0, d: 0, gw: 0, gl: 0, gd: 0 };
  for (const u of units) {
    if (u.result === 'win') t.w++; else if (u.result === 'loss') t.l++; else t.d++;
    for (const g of u.games) {
      if (g.result === 'W') t.gw++; else if (g.result === 'L') t.gl++; else t.gd++;
    }
  }
  t.n = t.w + t.l + t.d;
  t.gn = t.gw + t.gl + t.gd;
  return t;
}

function winPct(w, n) { return n ? Math.round((w / n) * 100) + '%' : '–'; }
function recStr(t) { return `${t.w}–${t.l}` + (t.d ? `–${t.d}` : ''); }

/* ---------- Router ---------- */
const views = ['view-home', 'view-stats', 'view-deck', 'view-report'];
function show(id) {
  for (const v of views) {
    const el = $(v);
    const active = v === id;
    el.hidden = !active;
    el.style.display = active ? 'flex' : 'none'; // belt and suspenders vs stale CSS
  }
  window.scrollTo(0, 0);
}

function route() {
  const h = location.hash || '#/';
  if (h.startsWith('#/deck/')) {
    currentDeckId = h.slice(7);
    if (!db.decks.find((d) => d.id === currentDeckId)) { location.hash = '#/'; return; }
    renderDeck(); show('view-deck');
  } else if (h.startsWith('#/report/')) {
    currentReportId = h.slice(9);
    const r = db.reports.find((x) => x.id === currentReportId);
    if (!r) { location.hash = '#/'; return; }
    currentDeckId = r.deckId;
    renderReport(); show('view-report');
  } else if (h === '#/stats') {
    renderStats(); show('view-stats');
  } else {
    renderHome(); show('view-home');
  }
}
window.addEventListener('hashchange', route);
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) location.hash = nav.dataset.nav;
});

/* ---------- HOME ---------- */
function renderHome() {
  const grid = $('deckGrid');
  const units = allUnits();
  grid.innerHTML = db.decks.map((d) => {
    const t = tally(units.filter((u) => u.deckId === d.id));
    return `<button type="button" class="deck-card" data-deck="${d.id}">
      ${leaderDot(d.colors, 'lg')}
      <span class="deck-card-name">${esc(d.leaderName)}</span>
      ${d.leaderId ? `<span class="deck-card-id mono">${esc(d.leaderId)}</span>` : ''}
      <span class="deck-card-rec mono">${t.n ? `${recStr(t)} · ${winPct(t.w, t.n)}` : 'No matches yet'}</span>
    </button>`;
  }).join('') +
  `<button type="button" class="deck-card new" id="newDeckBtn">
     <span class="plus">+</span><span>Create new deck</span>
   </button>`;

  grid.querySelectorAll('[data-deck]').forEach((el) =>
    el.addEventListener('click', () => { location.hash = '#/deck/' + el.dataset.deck; }));
  $('newDeckBtn').addEventListener('click', openDeckDialog);
}

$('allStatsBtn').addEventListener('click', () => { location.hash = '#/stats'; });

/* ---------- New deck dialog ---------- */
const deckDialog = $('deckDialog');
const deckCombo = initCombo($('deckLeaderCombo'));

function openDeckDialog() {
  deckCombo.set('', null);
  deckDialog.showModal();
  setTimeout(() => $('deckLeaderInput').focus(), 50);
}

$('deckForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const { name, leaderId } = deckCombo.get();
  if (!name) return;
  const known = leaderId ? leaderById(leaderId) : null;
  const deck = {
    id: uid(),
    leaderId: known ? known.id : null,
    leaderName: known ? known.n : name,
    colors: known ? known.c : [],
    createdAt: Date.now()
  };
  db.decks.push(deck);
  save();
  deckDialog.close();
  location.hash = '#/deck/' + deck.id;
});

/* ---------- ALL STATS ---------- */
function renderStats() {
  const units = allUnits();
  const t = tally(units);

  $('sWinRate').textContent = winPct(t.w, t.n);
  $('sRecord').textContent = t.n ? recStr(t) : '';
  $('sGameRate').textContent = winPct(t.gw, t.gn);
  $('sGameRecord').textContent = t.gn ? `${t.gw}–${t.gl}` + (t.gd ? `–${t.gd}` : '') : '';

  // Streak (match-level, draws skipped)
  const s = sortedUnits(units).filter((u) => u.result !== 'draw');
  const streakEl = $('sStreak');
  streakEl.classList.remove('streak-w', 'streak-l');
  if (!s.length) { streakEl.textContent = '–'; $('sStreakSub').textContent = ''; }
  else {
    const first = s[0].result;
    let count = 0;
    for (const u of s) { if (u.result === first) count++; else break; }
    streakEl.textContent = count + (first === 'win' ? 'W' : 'L');
    streakEl.classList.add(first === 'win' ? 'streak-w' : 'streak-l');
    $('sStreakSub').textContent = first === 'win' ? 'winning' : 'losing';
  }

  fillTempo('s', units);

  // Per-deck table
  const dRows = $('deckStatsRows');
  const deckStats = db.decks.map((d) => ({ d, t: tally(units.filter((u) => u.deckId === d.id)) }))
    .filter((x) => x.t.n > 0)
    .sort((a, b) => b.t.n - a.t.n);
  $('deckStatsEmpty').hidden = deckStats.length > 0;
  dRows.innerHTML = deckStats.map(({ d, t }) => {
    const wr = Math.round((t.w / t.n) * 100);
    return `<tr><td>${leaderDot(d.colors)}${esc(d.leaderName)}</td><td class="num">${t.n}</td>
      <td class="num">${recStr(t)}</td>
      <td class="num ${wr >= 50 ? 'wr-good' : 'wr-bad'}">${wr}%</td></tr>`;
  }).join('');

  // Matchups (opponent, byes excluded)
  const byOpp = new Map();
  for (const u of units) {
    if (u.isBye) continue;
    const key = (u.opp || '').trim() || '(unknown)';
    if (!byOpp.has(key)) byOpp.set(key, []);
    byOpp.get(key).push(u);
  }
  const mu = [...byOpp.entries()].map(([opp, us]) => ({ opp, t: tally(us) }))
    .sort((a, b) => b.t.n - a.t.n);
  $('matchupEmpty').hidden = mu.length > 0;
  $('matchupRows').innerHTML = mu.map(({ opp, t }) => {
    const wr = Math.round((t.w / t.n) * 100);
    return `<tr><td>${leaderDot(oppColors(opp))}${esc(opp)}</td><td class="num">${t.n}</td>
      <td class="num">${recStr(t)}</td>
      <td class="num ${wr >= 50 ? 'wr-good' : 'wr-bad'}">${wr}%</td></tr>`;
  }).join('');

  renderCauseBars($('causeBars'), $('causeEmpty'), units, causeScope);
}

function renderCauseBars(wrap, emptyEl, units, scope) {
  const games = [];
  for (const u of units) {
    for (const g of u.games) {
      if (!g.cause) continue;
      if (scope === 'losses' && g.result !== 'L') continue;
      games.push(g);
    }
  }
  emptyEl.hidden = games.length > 0;
  if (!games.length) { wrap.innerHTML = ''; return; }
  const counts = {};
  for (const g of games) counts[g.cause] = (counts[g.cause] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = entries[0][1];
  wrap.innerHTML = entries.map(([key, c]) =>
    `<div class="cause-row">
       <span class="cause-label">${esc(CAUSES[key] || key)}</span>
       <span class="cause-count">${c} · ${Math.round((c / games.length) * 100)}%</span>
       <div class="cause-track"><div class="cause-fill" style="width:${(c / max) * 100}%"></div></div>
     </div>`).join('');
}

$('scopeLosses').addEventListener('click', () => { causeScope = 'losses'; syncScopeBtns(); renderStats(); });
$('scopeAll').addEventListener('click', () => { causeScope = 'all'; syncScopeBtns(); renderStats(); });
function syncScopeBtns() {
  $('scopeLosses').classList.toggle('active', causeScope === 'losses');
  $('scopeAll').classList.toggle('active', causeScope === 'all');
}
$('dScopeLosses').addEventListener('click', () => { deckCauseScope = 'losses'; syncDeckScopeBtns(); renderDeck(); });
$('dScopeAll').addEventListener('click', () => { deckCauseScope = 'all'; syncDeckScopeBtns(); renderDeck(); });
function syncDeckScopeBtns() {
  $('dScopeLosses').classList.toggle('active', deckCauseScope === 'losses');
  $('dScopeAll').classList.toggle('active', deckCauseScope === 'all');
}

/* ---------- DECK VIEW ---------- */
function deck() { return db.decks.find((d) => d.id === currentDeckId); }

function renderDeck() {
  const d = deck();
  if (!d) return;
  const units = allUnits().filter((u) => u.deckId === d.id);
  const t = tally(units);

  $('deckColors').innerHTML = leaderDot(d.colors, 'lg');
  $('deckName').textContent = d.leaderName + (d.leaderId ? ` (${d.leaderId})` : '');
  $('deckRecord').textContent = t.n ? `${recStr(t)} · ${winPct(t.w, t.n)} match win rate` : 'No matches logged yet';

  // Per-deck summary + tempo
  $('dMatch').textContent = winPct(t.w, t.n);
  $('dMatchSub').textContent = t.n ? recStr(t) : 'no data';
  $('dGame').textContent = winPct(t.gw, t.gn);
  $('dGameSub').textContent = t.gn ? `${t.gw}–${t.gl}` + (t.gd ? `–${t.gd}` : '') : 'no data';
  fillTempo('d', units);

  // Per-deck matchups (byes excluded)
  const byOpp = new Map();
  for (const u of units) {
    if (u.isBye) continue;
    const key = (u.opp || '').trim() || '(unknown)';
    if (!byOpp.has(key)) byOpp.set(key, []);
    byOpp.get(key).push(u);
  }
  const mu = [...byOpp.entries()].map(([opp, us]) => ({ opp, t: tally(us) }))
    .sort((a, b) => b.t.n - a.t.n);
  $('deckMatchupEmpty').hidden = mu.length > 0;
  $('deckMatchupRows').innerHTML = mu.map(({ opp, t }) => {
    const wr = Math.round((t.w / t.n) * 100);
    return `<tr><td>${leaderDot(oppColors(opp))}${esc(opp)}</td><td class="num">${t.n}</td>
      <td class="num">${recStr(t)}</td>
      <td class="num ${wr >= 50 ? 'wr-good' : 'wr-bad'}">${wr}%</td></tr>`;
  }).join('');

  // Reports
  const reports = db.reports.filter((r) => r.deckId === d.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  $('reportEmpty').hidden = reports.length > 0;
  $('reportList').innerHTML = reports.map((r) => {
    const rec = reportRecord(r);
    return `<li><button type="button" class="report-item" data-report="${r.id}">
      <span class="rep-main">
        <span class="rep-name">${esc(r.eventName || 'Untitled event')}</span><br>
        <span class="rep-meta mono">${esc(r.date || '')}${r.format ? ' · ' + esc(r.format) : ''}${r.placement ? ' · ' + esc(r.placement) : ''}${r.players ? ' · ' + esc(r.players) + ' players' : ''}</span>
      </span>
      <span class="rep-rec">${rec}</span>
    </button></li>`;
  }).join('');
  $('reportList').querySelectorAll('[data-report]').forEach((el) =>
    el.addEventListener('click', () => { location.hash = '#/report/' + el.dataset.report; }));

  // Casual matches
  const casual = db.matches.filter((m) => m.deckId === d.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  $('casualEmpty').hidden = casual.length > 0;
  $('casualList').innerHTML = casual.map((m) => {
    const dateStr = m.date ? m.date.slice(5).replace('-', '/') : '';
    return `<li class="match-item ${m.result}" data-id="${m.id}">
      <button type="button" class="match-summary">
        <span class="result-badge">${m.result === 'win' ? 'W' : 'L'}</span>
        <span class="match-main">
          <span class="match-vs">${leaderDot(oppColors(m.opp, m.oppLeaderId))}vs ${esc(m.opp)}</span>
          ${m.note ? `<span class="match-note">${esc(m.note)}</span>` : ''}
        </span>
        <span class="match-date">${dateStr}</span>
      </button>
      <div class="match-detail">
        <dl class="detail-grid">
          <div><dt>Date</dt><dd class="mono">${esc(m.date || '–')}</dd></div>
          <div><dt>Dice / went</dt><dd>${m.dice ? (m.dice === 'won' ? 'Won dice' : 'Lost dice') + ' · ' : ''}${m.order === 'first' ? 'First' : 'Second'} · ${m.mull === 'kept' ? 'Kept' : 'Mulliganed'}</dd></div>
          <div><dt>Hand</dt><dd class="mono">${m.hand ?? '–'}/10</dd></div>
          <div><dt>Turns</dt><dd class="mono">${m.turns || '–'}${m.turningPoint ? ` · flipped T${m.turningPoint}` : ''}</dd></div>
          <div class="full"><dt>Key card</dt><dd>${m.keySeen === 'yes' ? 'Seen' : m.keySeen === 'no' ? 'Not seen' : 'N/A'}${m.keyName ? ' · ' + esc(m.keyName) : ''}</dd></div>
          <div class="full"><dt>Root cause</dt><dd>${esc(CAUSES[m.cause] || '–')}</dd></div>
          ${m.note ? `<div class="full"><dt>Notes</dt><dd>${esc(m.note)}</dd></div>` : ''}
        </dl>
        <div class="detail-actions">
          <button type="button" class="btn small" data-act="edit">Edit</button>
          <button type="button" class="btn small danger" data-act="delete">Delete</button>
        </div>
      </div>
    </li>`;
  }).join('');

  renderCauseBars($('deckCauseBars'), $('deckCauseEmpty'), units, deckCauseScope);
}

function reportRecord(r) {
  let w = 0, l = 0, dr = 0;
  for (const rd of r.rounds || []) {
    const bo = roundBo(rd, r);
    const games = (rd.games || []).slice(0, bo).filter((g) => g && g.result);
    if (rd.outcome === 'bye') { w++; continue; }
    if (rd.outcome === 'id') { dr++; continue; }
    if (!games.length) continue;
    const gw = games.filter((g) => g.result === 'W').length;
    const gl = games.filter((g) => g.result === 'L').length;
    if (gw > gl) w++; else if (gl > gw) l++; else dr++;
  }
  return `${w}–${l}` + (dr ? `–${dr}` : '');
}

$('deleteDeckBtn').addEventListener('click', () => {
  const d = deck();
  if (!d) return;
  const nRep = db.reports.filter((r) => r.deckId === d.id).length;
  const nMat = db.matches.filter((m) => m.deckId === d.id).length;
  if (!confirm(`Delete "${d.leaderName}" and its ${nRep} report(s) + ${nMat} match(es)? This can't be undone.`)) return;
  db.decks = db.decks.filter((x) => x.id !== d.id);
  db.reports = db.reports.filter((r) => r.deckId !== d.id);
  db.matches = db.matches.filter((m) => m.deckId !== d.id);
  save();
  location.hash = '#/';
});

/* Casual list interactions */
$('casualList').addEventListener('click', (e) => {
  const item = e.target.closest('.match-item');
  if (!item) return;
  const id = item.dataset.id;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'edit') {
    const m = db.matches.find((x) => x.id === id);
    if (m) openMatchDialog(m);
  } else if (act === 'delete') {
    const m = db.matches.find((x) => x.id === id);
    if (m && confirm(`Delete this match vs ${m.opp}?`)) {
      db.matches = db.matches.filter((x) => x.id !== id);
      save(); renderDeck();
    }
  } else if (e.target.closest('.match-summary')) {
    item.classList.toggle('open');
  }
});

/* ---------- CASUAL MATCH DIALOG ---------- */
const matchDialog = $('matchDialog');
const matchForm = $('matchForm');
const oppCombo = initCombo($('oppLeaderCombo'));

(function populateCauses() {
  $('fCause').innerHTML = '<option value="" disabled selected>Pick the honest answer…</option>' +
    Object.entries(CAUSES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
})();

$('newCasualBtn').addEventListener('click', () => openMatchDialog());

function setRadio(name, value) {
  for (const r of matchForm.elements[name] || []) r.checked = r.value === value;
}
function getRadio(name) {
  const el = matchForm.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

function openMatchDialog(m = null) {
  editingMatchId = m ? m.id : null;
  $('matchDialogTitle').textContent = m ? 'Edit match' : 'Log a match';
  $('matchSaveBtn').textContent = m ? 'Save changes' : 'Save match';
  matchForm.reset();
  $('fDate').value = m?.date || todayISO();
  setRadio('result', m?.result || '');
  setRadio('dice', m?.dice || '');
  setRadio('order', m?.order || '');
  setRadio('mull', m?.mull || '');
  oppCombo.set(m?.opp || '', m?.oppLeaderId || null);
  $('fHand').value = m?.hand ?? 5;
  $('handValue').textContent = $('fHand').value;
  $('fTurns').value = m?.turns || '';
  $('fTurningPoint').value = m?.turningPoint || '';
  $('fKeySeen').value = m?.keySeen || 'na';
  $('fKeyName').value = m?.keyName || '';
  $('fCause').value = m?.cause || '';
  $('fNote').value = m?.note || '';
  matchDialog.showModal();
  autogrow($('fNote'));
}

$('fHand').addEventListener('input', () => { $('handValue').textContent = $('fHand').value; });

matchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const opp = oppCombo.get();
  const required = {
    date: $('fDate').value,
    result: getRadio('result'),
    order: getRadio('order'),
    mull: getRadio('mull'),
    cause: $('fCause').value
  };
  if (!opp.name || Object.values(required).some((v) => !v)) {
    matchForm.reportValidity();
    return;
  }
  const rec = {
    id: editingMatchId || uid(),
    deckId: currentDeckId,
    createdAt: editingMatchId
      ? (db.matches.find((x) => x.id === editingMatchId)?.createdAt ?? Date.now())
      : Date.now(),
    ...required,
    opp: opp.name,
    oppLeaderId: opp.leaderId,
    dice: getRadio('dice') || null,
    hand: Number($('fHand').value),
    turns: $('fTurns').value ? Number($('fTurns').value) : null,
    turningPoint: $('fTurningPoint').value ? Number($('fTurningPoint').value) : null,
    keySeen: $('fKeySeen').value,
    keyName: $('fKeyName').value.trim() || null,
    note: $('fNote').value.trim() || null
  };
  if (editingMatchId) db.matches = db.matches.map((x) => (x.id === editingMatchId ? rec : x));
  else db.matches.push(rec);
  save();
  matchDialog.close();
  renderDeck();
});

/* ---------- REPORTS ---------- */
$('newReportBtn').addEventListener('click', () => {
  const r = {
    id: uid(), deckId: currentDeckId, createdAt: Date.now(),
    eventName: '', date: todayISO(), players: null, placement: '', format: '',
    bestOf: 3,
    rounds: [newRound()]
  };
  db.reports.push(r);
  save();
  location.hash = '#/report/' + r.id;
});

function newRound(bestOf = 3) {
  return {
    id: uid(), createdAt: Date.now(),
    opp: '', oppLeaderId: null,
    dice: null,            // 'won' | 'lost' | null
    outcome: 'play',       // 'play' | 'id' | 'bye'
    topCut: false,
    bestOf,                // 1 | 3, per round (Bo1 swiss + Bo3 top cut is a thing)
    games: [null, null, null],  // each: {result, order, mull, hand, cause, keySeen, keyName, turningPoint}
    note: ''
  };
}

function report() { return db.reports.find((r) => r.id === currentReportId); }

$('reportBack').addEventListener('click', () => {
  const r = report();
  location.hash = r ? '#/deck/' + r.deckId : '#/';
});

$('deleteReportBtn').addEventListener('click', () => {
  const r = report();
  if (!r) return;
  if (!confirm(`Delete report "${r.eventName || 'Untitled event'}"?`)) return;
  const deckId = r.deckId;
  db.reports = db.reports.filter((x) => x.id !== r.id);
  save();
  location.hash = '#/deck/' + deckId;
});

/* Event info fields: live save */
const eventFields = [
  ['rEventName', 'eventName', (v) => v],
  ['rDate', 'date', (v) => v],
  ['rPlayers', 'players', (v) => (v ? Number(v) : null)],
  ['rPlacement', 'placement', (v) => v],
  ['rFormat', 'format', (v) => v]
];
for (const [elId, key, cast] of eventFields) {
  $(elId).addEventListener('input', () => {
    const r = report();
    if (!r) return;
    r[key] = cast($(elId).value.trim ? $(elId).value.trim() : $(elId).value);
    save();
    $('reportTitle').textContent = r.eventName || 'Report';
  });
}

function renderReport() {
  const r = report();
  if (!r) return;
  $('reportTitle').textContent = r.eventName || 'Report';
  $('reportRecord').textContent = reportRecord(r);
  $('rEventName').value = r.eventName || '';
  $('rDate').value = r.date || '';
  $('rPlayers').value = r.players ?? '';
  $('rPlacement').value = r.placement || '';
  $('rFormat').value = r.format || '';
  renderRounds();
}

/* Per-round best-of: round's own setting, falling back to a legacy report-level one, then Bo3 */
function roundBo(rd, r) {
  const bo = rd.bestOf ?? r.bestOf ?? 3;
  return bo === 1 ? 1 : 3;
}

function renderRounds() {
  const r = report();
  $('reportRecord').textContent = reportRecord(r);
  const wrap = $('roundsWrap');
  wrap.innerHTML = '';
  r.rounds.forEach((rd, idx) => wrap.appendChild(roundCard(rd, idx)));
}

function roundResultChip(rd, bo = 3) {
  if (rd.outcome === 'bye') return `<span class="round-result-chip w">BYE</span>`;
  if (rd.outcome === 'id') return `<span class="round-result-chip d">ID</span>`;
  const games = (rd.games || []).slice(0, bo).filter((g) => g && g.result);
  if (!games.length) return `<span class="round-result-chip">–</span>`;
  const w = games.filter((g) => g.result === 'W').length;
  const l = games.filter((g) => g.result === 'L').length;
  const cls = w > l ? 'w' : l > w ? 'l' : 'd';
  const label = (w > l ? 'WIN ' : l > w ? 'LOSS ' : 'DRAW ') + w + '–' + l;
  return `<span class="round-result-chip ${cls}">${label}</span>`;
}

function gameHasDetail(g) {
  return !!(g && (g.mull || g.hand != null || g.cause || g.keySeen && g.keySeen !== 'na' || g.keyName || g.turningPoint));
}

function roundCard(rd, idx) {
  const el = document.createElement('section');
  el.className = 'round-card';
  const isPlay = rd.outcome === 'play' || !rd.outcome;
  const bo = roundBo(rd, report());
  const gameIdxs = bo === 1 ? [0] : [0, 1, 2];

  el.innerHTML = `
    <div class="round-head">
      <h2 class="round-title">Round ${idx + 1}</h2>
      ${roundResultChip(rd, bo)}
      <div class="mini-seg" data-r="bo">
        <button type="button" data-v="1" class="${bo === 1 ? 'on' : ''}">Bo1</button>
        <button type="button" data-v="3" class="${bo === 3 ? 'on' : ''}">Bo3</button>
      </div>
      <button type="button" class="chip-toggle ${rd.topCut ? 'active' : ''}" data-r="topcut">Top Cut</button>
      <button type="button" class="icon-btn" data-r="del" title="Delete round">🗑</button>
    </div>

    <div class="round-row">
      <div class="field">
        <label>Opponent's leader</label>
        <div class="combo" data-combo>
          <input type="text" placeholder="Search leaders…" autocomplete="off" value="${esc(rd.opp)}" ${rd.oppLeaderId ? `data-leader-id="${esc(rd.oppLeaderId)}"` : ''} />
          <div class="combo-list" hidden></div>
        </div>
      </div>
      <div class="field narrow">
        <span class="field-label">Dice roll</span>
        <div class="mini-seg" data-r="dice">
          <button type="button" data-v="won" class="${rd.dice === 'won' ? 'on' : ''}">Won</button>
          <button type="button" data-v="lost" class="${rd.dice === 'lost' ? 'on' : ''}">Lost</button>
        </div>
      </div>
      <div class="field narrow">
        <span class="field-label">Other outcome</span>
        <div class="mini-seg" data-r="outcome">
          <button type="button" data-v="id" class="${rd.outcome === 'id' ? 'on d' : ''}">ID</button>
          <button type="button" data-v="bye" class="${rd.outcome === 'bye' ? 'on w' : ''}">Bye</button>
        </div>
      </div>
    </div>

    <div class="games-block" ${isPlay ? '' : 'style="display:none"'}>
      <span class="field-label">${bo === 1 ? 'Game' : 'Match games'}</span>
      ${gameIdxs.map((gi) => gameRow(rd, gi)).join('')}
    </div>

    <div class="round-foot">
      <div class="field">
        <label>Notes</label>
        <textarea class="autogrow" rows="1" data-r="note" placeholder="e.g. Mull to 5, brick G2, opponent misplayed…">${esc(rd.note || '')}</textarea>
      </div>
    </div>`;

  // Opponent combo
  const combo = initCombo(el.querySelector('[data-combo]'), () => {
    const v = el.querySelector('[data-combo] input');
    rd.opp = v.value.trim();
    rd.oppLeaderId = v.dataset.leaderId || null;
    save();
  });

  // Dice + outcome + topcut + best-of + delete
  el.querySelector('[data-r="bo"]').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    rd.bestOf = Number(b.dataset.v);
    save(); renderRounds();
  });
  el.querySelector('[data-r="dice"]').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    rd.dice = rd.dice === b.dataset.v ? null : b.dataset.v;
    save(); renderRounds();
  });
  el.querySelector('[data-r="outcome"]').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    rd.outcome = rd.outcome === b.dataset.v ? 'play' : b.dataset.v;
    save(); renderRounds();
  });
  el.querySelector('[data-r="topcut"]').addEventListener('click', () => {
    rd.topCut = !rd.topCut;
    save(); renderRounds();
  });
  el.querySelector('[data-r="del"]').addEventListener('click', () => {
    const r = report();
    if (r.rounds.length === 1 && !confirm('Delete the only round?')) return;
    if (r.rounds.length > 1 && !confirm(`Delete round ${idx + 1}?`)) return;
    r.rounds.splice(idx, 1);
    save(); renderReport();
  });

  // Notes autosave
  const noteEl = el.querySelector('[data-r="note"]');
  noteEl.addEventListener('input', () => { rd.note = noteEl.value; save(); });
  requestAnimationFrame(() => autogrow(noteEl));

  // Game rows
  el.querySelectorAll('[data-game]').forEach((row) => {
    const gi = Number(row.dataset.game);
    row.querySelector('[data-g="order"]').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const g = ensureGame(rd, gi);
      g.order = g.order === b.dataset.v ? null : b.dataset.v;
      save(); renderRounds();
    });
    row.querySelector('[data-g="result"]').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const g = ensureGame(rd, gi);
      g.result = g.result === b.dataset.v ? null : b.dataset.v;
      save(); renderRounds();
    });
    row.querySelector('.game-detail-btn').addEventListener('click', () => {
      const panel = el.querySelector(`.game-detail[data-detail="${gi}"]`);
      panel.classList.toggle('open');
    });
  });

  // Game detail panels
  el.querySelectorAll('.game-detail').forEach((panel) => {
    const gi = Number(panel.dataset.detail);
    panel.querySelector('[data-gd="mull"]').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const g = ensureGame(rd, gi);
      g.mull = g.mull === b.dataset.v ? null : b.dataset.v;
      save();
      panel.querySelectorAll('[data-gd="mull"] button').forEach((x) =>
        x.classList.toggle('on', x.dataset.v === g.mull));
      syncDetailBtn(el, rd, gi);
    });
    const handEl = panel.querySelector('[data-gd="hand"]');
    handEl.addEventListener('input', () => {
      const g = ensureGame(rd, gi);
      g.hand = Number(handEl.value);
      panel.querySelector('[data-gd="handval"]').textContent = handEl.value;
      save(); syncDetailBtn(el, rd, gi);
    });
    const causeEl = panel.querySelector('[data-gd="cause"]');
    causeEl.addEventListener('change', () => {
      const g = ensureGame(rd, gi);
      g.cause = causeEl.value || null;
      save(); syncDetailBtn(el, rd, gi);
    });
    const keySeenEl = panel.querySelector('[data-gd="keySeen"]');
    keySeenEl.addEventListener('change', () => {
      const g = ensureGame(rd, gi);
      g.keySeen = keySeenEl.value;
      save(); syncDetailBtn(el, rd, gi);
    });
    const keyNameEl = panel.querySelector('[data-gd="keyName"]');
    keyNameEl.addEventListener('input', () => {
      const g = ensureGame(rd, gi);
      g.keyName = keyNameEl.value.trim() || null;
      save(); syncDetailBtn(el, rd, gi);
    });
    const tpEl = panel.querySelector('[data-gd="tp"]');
    tpEl.addEventListener('input', () => {
      const g = ensureGame(rd, gi);
      g.turningPoint = tpEl.value ? Number(tpEl.value) : null;
      save(); syncDetailBtn(el, rd, gi);
    });
  });

  return el;
}

function syncDetailBtn(cardEl, rd, gi) {
  const btn = cardEl.querySelector(`[data-game="${gi}"] .game-detail-btn`);
  if (btn) btn.classList.toggle('has-data', gameHasDetail(rd.games[gi]));
}

function ensureGame(rd, gi) {
  if (!rd.games[gi]) rd.games[gi] = { result: null, order: null, mull: null, hand: null, cause: null, keySeen: 'na', keyName: null, turningPoint: null };
  return rd.games[gi];
}

function gameRow(rd, gi) {
  const g = rd.games[gi];
  const causeOpts = '<option value="">—</option>' +
    Object.entries(CAUSES).map(([k, v]) =>
      `<option value="${k}" ${g?.cause === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
  return `
    <div class="game-row" data-game="${gi}">
      <span class="game-label">G${gi + 1}</span>
      <div class="mini-seg" data-g="order">
        <button type="button" data-v="first" class="${g?.order === 'first' ? 'on' : ''}">1st</button>
        <button type="button" data-v="second" class="${g?.order === 'second' ? 'on' : ''}">2nd</button>
      </div>
      <div class="mini-seg" data-g="result">
        <button type="button" data-v="W" class="${g?.result === 'W' ? 'on w' : ''}">W</button>
        <button type="button" data-v="L" class="${g?.result === 'L' ? 'on l' : ''}">L</button>
        <button type="button" data-v="D" class="${g?.result === 'D' ? 'on d' : ''}">D</button>
      </div>
      <button type="button" class="game-detail-btn ${gameHasDetail(g) ? 'has-data' : ''}">details</button>
    </div>
    <div class="game-detail" data-detail="${gi}">
      <div class="field">
        <span class="field-label">Mulligan</span>
        <div class="mini-seg" data-gd="mull">
          <button type="button" data-v="kept" class="${g?.mull === 'kept' ? 'on' : ''}">Kept</button>
          <button type="button" data-v="mulliganed" class="${g?.mull === 'mulliganed' ? 'on' : ''}">Mull</button>
        </div>
      </div>
      <div class="field">
        <label>Hand <span class="mono" data-gd="handval">${g?.hand ?? 5}</span>/10</label>
        <input type="range" min="0" max="10" step="1" value="${g?.hand ?? 5}" data-gd="hand" />
      </div>
      <div class="field">
        <label>Key card seen?</label>
        <select data-gd="keySeen">
          <option value="na" ${!g || g.keySeen === 'na' ? 'selected' : ''}>N/A</option>
          <option value="yes" ${g?.keySeen === 'yes' ? 'selected' : ''}>Yes</option>
          <option value="no" ${g?.keySeen === 'no' ? 'selected' : ''}>No</option>
        </select>
      </div>
      <div class="field">
        <label>Key card name</label>
        <input type="text" data-gd="keyName" value="${esc(g?.keyName || '')}" placeholder="e.g. Soul Solid" />
      </div>
      <div class="field">
        <label>Turning point turn</label>
        <input type="number" min="1" max="99" inputmode="numeric" data-gd="tp" value="${g?.turningPoint || ''}" />
      </div>
      <div class="field">
        <label>Root cause</label>
        <select data-gd="cause">${causeOpts}</select>
      </div>
    </div>`;
}

$('addRoundBtn').addEventListener('click', () => {
  const r = report();
  const last = r.rounds[r.rounds.length - 1];
  r.rounds.push(newRound(last ? roundBo(last, r) : 3));
  save();
  renderRounds();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

/* ---------- Dialog close buttons ---------- */
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c) $(c.dataset.close).close();
});

/* ---------- Backup ---------- */
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ app: 'match-log', version: 2, exportedAt: new Date().toISOString(), ...db }, null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `matchlog-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  note(`Exported ${db.decks.length} decks, ${db.reports.length} reports, ${db.matches.length} matches.`);
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    let added = 0, skipped = 0;
    const mergeList = (target, incoming) => {
      const ids = new Set(target.map((x) => x.id));
      for (const item of incoming || []) {
        if (!item || !item.id) { skipped++; continue; }
        if (ids.has(item.id)) { skipped++; continue; }
        target.push(item); ids.add(item.id); added++;
      }
    };
    if (Array.isArray(data)) {
      // Old v1 backup: run it through the v1 migration path
      localStorage.setItem(OLD_KEY, JSON.stringify(data));
      const migrated = load();
      mergeList(db.decks, migrated.decks);
      mergeList(db.matches, migrated.matches);
    } else {
      mergeList(db.decks, data.decks);
      mergeList(db.reports, data.reports);
      mergeList(db.matches, data.matches ?? data.matches);
    }
    save();
    route();
    note(`Import done: ${added} added, ${skipped} skipped.`);
  } catch {
    note('Import failed: not a valid Match Log backup.');
  }
});

$('clearBtn').addEventListener('click', () => {
  const total = db.decks.length + db.reports.length + db.matches.length;
  if (!total) { note('Nothing to clear.'); return; }
  if (!confirm(`This wipes everything on this device (${db.decks.length} decks, ${db.reports.length} reports, ${db.matches.length} matches).\n\nExport a backup first if you haven't. Continue?`)) return;
  db = blankDb();
  save();
  route();
  note('All data cleared.');
});

function note(msg) {
  const el = $('backupNote');
  el.textContent = msg;
  clearTimeout(note._t);
  note._t = setTimeout(() => { el.textContent = ''; }, 6000);
}

/* ---------- Themes ---------- */
const THEMES = [
  { id: 'ships-log', name: "Ship's Log", sw: ['#10141f', '#1a2336', '#c9a227', '#5f9e85'] },
  { id: 'nightfall', name: 'Nightfall', sw: ['#0b0b12', '#14141d', '#8b5cf6', '#55c789'] },
  { id: 'soul-king', name: 'Soul King', sw: ['#0b0a10', '#2b2540', '#d9b64a', '#a89ce0'] },
  { id: 'sunny', name: 'Thousand Sunny', sw: ['#f4eddd', '#fdf8ec', '#c96f1e', '#2e8b57'] },
  { id: 'emperor', name: 'Emperor', sw: ['#120c0e', '#1d1317', '#d64545', '#5aa878'] }
];

function currentTheme() {
  try { return localStorage.getItem('matchlog.theme') || 'ships-log'; } catch { return 'ships-log'; }
}

function applyTheme(id) {
  if (id === 'ships-log') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  try { localStorage.setItem('matchlog.theme', id); } catch {}
  // Keep the phone status bar in sync with the background
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t.sw[0]);
  renderThemeGrid();
}

function renderThemeGrid() {
  const cur = currentTheme();
  $('themeGrid').innerHTML = THEMES.map((t) =>
    `<button type="button" class="theme-opt ${t.id === cur ? 'active' : ''}" data-theme-id="${t.id}">
       <span class="theme-swatches">${t.sw.map((c) => `<span class="theme-swatch" style="background:${c}"></span>`).join('')}</span>
       <span class="theme-name">${esc(t.name)}</span>
       ${t.id === cur ? '<span class="mono" style="color:var(--brass);font-size:0.75rem">active</span>' : ''}
     </button>`).join('');
}

$('themeBtn').addEventListener('click', () => {
  renderThemeGrid();
  $('themeDialog').showModal();
});
$('themeGrid').addEventListener('click', (e) => {
  const opt = e.target.closest('[data-theme-id]');
  if (opt) applyTheme(opt.dataset.themeId);
});
applyTheme(currentTheme());

/* ---------- Boot ---------- */
route();

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

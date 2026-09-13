// ============================================================
// ВКЛАДКА «🖥 Stage Display» (stagedisplay) — окреме вікно для сцени:
// поточний/наступний слайд, нотатки, вибір фізичного монітора.
//
// Винесено з src/extras-1.js — продовження модуляризації (typo.js →
// animations.js/fonts.js → playlist.js/powerpoint.js → ця пара). Мусить
// завантажуватись ДО extras-4.js — pv2Init() звертається до renderStageTab
// одразу при старті застосунку (масив TABS).
// ============================================================

function renderStageTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">🖥 Stage Display</div><div class="card-sub">Окремий екран для сцени: поточний/наступний слайд, нотатки і таймер проповіді (запускається на вкладці «🎬 Керування») — не плутати з «Накласти таймер проповіді» у вкладці «Виходи», яка кладе той самий таймер ПОВЕРХ проектора/трансляції, а не сюди.</div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-primary btn-sm" onclick="openStageDisplay()">📺 Відкрити</button><button class="btn btn-ghost btn-sm" onclick="closeStageDisplay()">✕</button><button class="btn btn-ghost btn-sm" onclick="updateStageDisplay()">🔄</button></div> <div id="stageStatus" class="text-muted mt8"></div></div> <div class="card"><div class="card-title">🖥 Монітор сцени</div><div class="card-sub">Окреме вікно (не проектор і не трансляція) — вибери фізичний монітор, на якому воно з'явиться.</div><select id="stageMonitorSelect" onchange="setStageMonitor()" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:3px 4px;color:var(--text);font-size:12px;outline:none;margin-top:4px"><option value="">Авто (перший вільний монітор)</option></select></div> <div class="card"><div class="card-title">📝 Нотатки</div><textarea id="stageNotes" placeholder="Нотатки..." style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:12px;outline:none;min-height:24px;resize:vertical;font-family:inherit"></textarea><div class="flex" style="margin-top:2px"><button class="btn btn-ghost btn-sm" onclick="saveStageNotes()">💾</button><button class="btn btn-ghost btn-sm" onclick="loadStageNotes()">📂</button></div></div> </div><div> <div class="card"><div class="card-title">👁 Прев\'ю</div> <div id="stagePreview" style="aspect-ratio:16/9;background:linear-gradient(135deg,#0a0a1a,#1a1a3e);border-radius:2px;border:1px solid var(--border);padding:6px;display:flex;flex-direction:column;justify-content:space-between;position:relative"> <div style="display:flex;justify-content:space-between"><div style="color:#c8a84b;font-size:12px;font-weight:700">⛪</div><div style="color:rgba(255,255,255,0.15);font-size:12px;font-family:monospace" id="stagePreviewClock">12:00</div></div> <div style="text-align:center;padding:2px 0"><div style="color:rgba(255,255,255,0.15);font-size:11px">Поточний</div><div style="color:#fff;font-size:12px;font-family:Georgia,serif" id="stagePreviewCurrent">Бо так возлюбив Бог...</div></div> <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:2px"><div style="color:rgba(255,255,255,0.15);font-size:11px">▶ Наступний</div><div style="color:rgba(255,255,255,0.3);font-size:12px;font-family:Georgia,serif" id="stagePreviewNext">Великий Бог...</div></div> <div style="position:absolute;bottom:3px;right:6px;color:rgba(255,255,255,0.08);font-size:11px" id="stagePreviewTimer">⏱ 10:00</div></div></div> </div></div>`;
}

async function openStageDisplay() {
if(!window.electronAPI || !window.electronAPI.openStageWindow) { notify('Stage Display недоступний'); return; }
if(state.stageDisplayOpen) {
  updateStageDisplay();
  return;
}
await window.electronAPI.openStageWindow();
state.stageDisplayOpen = true;
const status = $('#stageStatus');
if(status) status.textContent = '✓ Stage Display відкрито';
updateStageDisplay();
}

async function closeStageDisplay() {
if(window.electronAPI && window.electronAPI.closeStageWindow) await window.electronAPI.closeStageWindow();
state.stageDisplayOpen = false;
const status = $('#stageStatus');
if(status) status.textContent = '✕ Stage Display закрито';
}

function updateStageDisplay() {
  // ПОТОЧНИЙ і НАСТУПНИЙ слайд для сцени.
  // (Раніше читалося state.selectedSong / state.currentBibleBook / getVerse(...) —
  //  усе неправильні посилання; справжні — глобальні selectedSong / currentBibleBook
  //  / getVerseText, тому «наступний» і таймер на сцені не працювали.)
  let cur = '', next = '';
  const songLive = (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'song');
  if (songLive && typeof selectedSong !== 'undefined' && selectedSong) {
    cur = selectedSong.verses[selectedVerseIdx] || '';
    next = selectedSong.verses[selectedVerseIdx + 1] || '';
  } else if (typeof currentBibleBook !== 'undefined' && currentBibleBook && currentBibleChapter && currentBibleVerseNum) {
    const r = (typeof verseRange === 'function') ? verseRange() : { from: currentBibleVerseNum, to: currentBibleVerseNum };
    const rangeFn = (typeof getVerseRangeText === 'function');
    cur = rangeFn ? getVerseRangeText(null, currentBibleBook, currentBibleChapter, r.from, r.to)
                  : (getVerseText(currentBibleBook, currentBibleChapter, currentBibleVerseNum) || '');
    const size = r.to - r.from + 1, nf = r.to + 1;   // наступний блок такого ж розміру
    next = rangeFn ? getVerseRangeText(null, currentBibleBook, currentBibleChapter, nf, nf + size - 1)
                   : (getVerseText(currentBibleBook, currentBibleChapter, nf) || '');
  } else if (typeof selectedSong !== 'undefined' && selectedSong) {
    cur = selectedSong.verses[selectedVerseIdx] || '';
    next = selectedSong.verses[selectedVerseIdx + 1] || '';
  }
  if (!cur) cur = '—';
  if (!next) next = '—';
  // Таймер: якщо йде «Таймер проповіді» (вкладка «🎬 Керування») — саме він
  // тут потрібен, це і є головне призначення екрана сцени. Раніше сюди йшов
  // лише загальний презентаційний timerState, а сам таймер проповіді
  // накладався ЛИШЕ на один із 4 звичайних виходів (напр. трансляцію) —
  // тобто монітор, на який дивиться промовець, його не показував узагалі.
  // Коли проповідь не йде — лишається старий загальний таймер.
  let timer = '--:--', timerWarn = null;
  if (state.sermon && state.sermon.running) {
    const elapsed = Math.floor((Date.now() - state.sermon.startedAt) / 1000);
    const left = state.sermon.planned - elapsed;
    timer = (left >= 0 ? fmtMMSS(left) : '+' + fmtMMSS(-left));
    timerWarn = left <= 0 ? 'over' : (left <= 300 ? 'soon' : 'ok');
  } else if (typeof timerState !== 'undefined' && timerState) {
    timer = timerFmt(timerState.remaining);
  }
  const notes = $('#stageNotes')?.value || '';
  if (state.stageDisplayOpen && window.electronAPI && window.electronAPI.updateStageWindow) {
    window.electronAPI.updateStageWindow({ current: cur.substring(0, 200), next: next.substring(0, 200), timer, timerWarn, notes: notes.substring(0, 60) });
  }
  const curEl = $('#stagePreviewCurrent');
  const nextEl = $('#stagePreviewNext');
  const timerEl = $('#stagePreviewTimer');
  const clockEl = $('#stagePreviewClock');
  if (curEl) curEl.textContent = cur.substring(0, 40);
  if (nextEl) nextEl.textContent = next.substring(0, 40);
  if (timerEl) timerEl.textContent = '⏱ ' + timer;
  if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('uk-UA');
}

function setStageMonitor() {
  const sel = $('#stageMonitorSelect');
  if (!sel) return;
  const id = sel.value ? parseInt(sel.value, 10) : null;
  const d = (state.displays || []).find(x => x.id === id);
  state.stageMonitorId = id;
  state.stageMonitorFingerprint = d ? d.fingerprint : null;
  saveJSON(STORAGE_KEYS.stageMonitor, state.stageMonitorFingerprint);
  if (window.electronAPI && window.electronAPI.setStageMonitor) window.electronAPI.setStageMonitor(id);
  notify(id ? '🖥 Монітор сцени встановлено' : 'Монітор сцени: авто');
}

function saveStageNotes() {
const notes = $('#stageNotes')?.value || '';
saveJSON(STORAGE_KEYS.stageNotes, notes);
notify('✓ Нотатки збережено');
updateStageDisplay();
}

function loadStageNotes() {
const notes = loadJSON(STORAGE_KEYS.stageNotes) || '';
const el = $('#stageNotes');
if(el) el.value = notes;
updateStageDisplay();
}

function renderStageMonitorOptions() {
  const sel = $('#stageMonitorSelect');
  if (!sel) return;
  const displays = state.displays || [];
  if (!displays.length) { sel.innerHTML = '<option value="">Монітори не знайдені — відкрий «Прив\'язка екранів»</option>'; return; }
  sel.innerHTML = '<option value="">Авто (перший вільний монітор)</option>' + displays.map(d =>
    `<option value="${d.id}">${d.num}. ${d.width}×${d.height}${d.isPrimary ? ' (основний)' : ''}${d.isOperator ? ' (оператор)' : ''}</option>`
  ).join('');
  if (state.stageMonitorId) sel.value = String(state.stageMonitorId);
}

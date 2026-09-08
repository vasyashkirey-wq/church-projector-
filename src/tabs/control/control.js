// ============================================================
// ВКЛАДКА «🎬 Керування» (control) — blackout, гучність/duck, таймер
// проповіді (старт/стоп), закладки (bookmarks) для швидкого повернення
// до місця в службі, блокування панелі.
//
// Винесено з src/extras-4.js — продовження модуляризації (typo.js →
// ... → stream.js/multiview.js → captions.js → ця). Мусить
// завантажуватись ДО extras-4.js — renderControlTab викликається з
// dispatch-таблиці renderTabInto (extras-1.js).
// ============================================================

function renderControlTab() {
  const bm = (state.bookmarks || []).map((b, i) =>
    `<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--border)">
       <span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.label)}</span>
       <button class="btn btn-success btn-sm" onclick="showBookmark(${i})">▶</button>
       <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="removeBookmark(${i})">✕</button>
     </div>`).join('') || '<div style="font-size:11px;color:var(--text2)">Закладок немає. Виведи щось у зал і тисни «⭐».</div>';

  const mv = Math.round((state.masterVolume != null ? state.masterVolume : 1) * 100);
  const s = state.sermon || {};

  return `
  <div id="preflightBox">${renderPreflight()}</div>

  <div class="card" style="border-color:${state.blackout ? 'var(--red)' : 'var(--accent)'}">
    <div class="card-title">${state.blackout ? '<span style="color:var(--red)">⬛ ЧОРНИЙ ЕКРАН</span>' : '🎬 Швидке керування'}</div>
    <div class="card-sub">Зараз у залі: <b>${esc(livePreviewText())}</b></div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="btn ${state.blackout ? 'btn-primary' : 'btn-ghost'}" style="flex:1;font-weight:700" onclick="toggleBlackout()">
        ⬛ ${state.blackout ? 'ПОВЕРНУТИ ЕКРАН' : 'Чорний екран (B)'}
      </button>
      <button class="btn btn-ghost" style="flex:1" onclick="addBookmark()">⭐ У закладки</button>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">🔊 Гучність (усе разом)</div>
      <div style="font-size:12px;color:var(--text2)">Відео-фон + фонова музика: <b id="masterVolLabel">${mv}%</b></div>
      <input id="masterVol" type="range" min="0" max="100" value="${mv}" oninput="setMasterVolume(parseInt(this.value,10))" style="width:100%">
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:4px" onclick="duckAll()">🔉 Приглушити для молитви</button>
    </div>

    <div class="card">
      <div class="card-title">📣 Таймер проповіді (на екран сцени)</div>
      ${s.running
        ? `<div style="font-size:13px;color:var(--green)" id="sermonElapsed">—</div>
           <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="sermonStop()">⏹ Зупинити</button>`
        : `<div style="display:flex;gap:4px;flex-wrap:wrap">
             <button class="btn btn-primary btn-sm" onclick="sermonStart(20)">20 хв</button>
             <button class="btn btn-primary btn-sm" onclick="sermonStart(30)">30 хв</button>
             <button class="btn btn-primary btn-sm" onclick="sermonStart(45)">45 хв</button>
           </div>
           <div class="card-sub" style="margin-top:4px">Бачить лише проповідник на моніторі сцени. За 5 хв до кінця — жовте попередження.</div>`}
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">⭐ Закладки</div>
      <div style="max-height:200px;overflow-y:auto">${bm}</div>
    </div>
    <div class="card">
      <div class="card-title">🔒 Захист панелі</div>
      <div class="card-sub">Заблокуй екран PIN-ом, якщо до ПК можуть підійти під час служби.</div>
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="lockPanel()">🔒 Заблокувати панель</button>
    </div>
    ${renderMacrosCard()}
  </div>`;
}

function showBookmark(i) {
  const b = (state.bookmarks || [])[i];
  if (!b) return;
  if (b.kind === 'htmlraw') { setGoingLive(true); try { doSendHTML(b.html, b.label); } finally { setGoingLive(false); } }
  else { setGoingLive(true); try { doSend(b.rawText, b.ref); } finally { setGoingLive(false); } }
  notify('▶ ' + b.label);
}

function removeBookmark(i) {
  if (!state.bookmarks) return;
  state.bookmarks.splice(i, 1);
  saveJSON(STORAGE_KEYS.live + '_bookmarks', state.bookmarks);
  markDirty('control');
}

function toggleBlackout() {
  if (state.blackout) {
    // Повертаємо збережений вміст
    state.blackout = false;
    if (isClientStation()) stationSend('blackout', { on: false });
    else if (window.electronAPI && window.electronAPI.blackout) window.electronAPI.blackout(false);
    if (_blackoutSaved && !isClientStation()) {
      if (_blackoutSaved.kind === 'text') { setGoingLive(true); try { doSend(_blackoutSaved.rawText, _blackoutSaved.ref); } finally { setGoingLive(false); } }
      else if (_blackoutSaved.kind === 'htmlraw') { setGoingLive(true); try { doSendHTML(_blackoutSaved.html, _blackoutSaved.label); } finally { setGoingLive(false); } }
    }
    updateLivePanels();
    notify('▶ Екран повернуто');
  } else {
    _blackoutSaved = state.onAir ? Object.assign({}, state.onAir) : null;
    state.blackout = true;
    if (isClientStation()) stationSend('blackout', { on: true });
    else if (window.electronAPI && window.electronAPI.blackout) window.electronAPI.blackout(true);
    updateLivePanels();
    notify('⬛ Чорний екран (натисни ще раз — повернеться те саме)');
  }
}

function addBookmark() {
  const c = state.onAir;
  if (!c) { notify('⚠️ Немає що додати — спершу виведи щось у зал'); return; }
  const label = c.ref || c.label || (c.rawText ? String(c.rawText).slice(0, 30) : 'Слайд');
  state.bookmarks = state.bookmarks || [];
  state.bookmarks.unshift({ kind: c.kind, rawText: c.rawText, html: c.html, ref: c.ref, label: label, at: Date.now() });
  if (state.bookmarks.length > 30) state.bookmarks.pop();
  saveJSON(STORAGE_KEYS.live + '_bookmarks', state.bookmarks);
  markDirty('control');
  notify('⭐ У закладки: ' + label);
}

function setMasterVolume(v) {
  state.masterVolume = v / 100;
  // фонова музика
  if (typeof _bgAudioEl !== 'undefined' && _bgAudioEl && state.bgAudio && state.bgAudio.playing) {
    _bgAudioEl.volume = state.bgAudio.volume * state.masterVolume;
  }
  // відео-фон на виходах
  if (window.electronAPI && window.electronAPI.setMasterVolume) window.electronAPI.setMasterVolume(state.masterVolume);
  saveJSON(STORAGE_KEYS.live + '_master', { v: state.masterVolume });
  const lbl = $('#masterVolLabel'); if (lbl) lbl.textContent = v + '%';
}

function duckAll() {
  // Швидко приглушити все перед молитвою (до 15%)
  setMasterVolume(15);
  const sl = $('#masterVol'); if (sl) sl.value = 15;
  notify('🔉 Приглушено (молитва)');
}

function sermonStop() {
  state.sermon = { running: false };
  clearInterval(_sermonTick); _sermonTick = null;
  if (window.electronAPI && window.electronAPI.sendStageTimer) window.electronAPI.sendStageTimer(null);
  markDirty('control');
  if (typeof updateStageDisplay === 'function') updateStageDisplay();
  notify('⏹ Таймер проповіді зупинено');
}

function sermonStart(minutes) {
  state.sermon = { running: true, startedAt: Date.now(), planned: (minutes || 30) * 60 };
  saveJSON(STORAGE_KEYS.live + '_sermon', state.sermon);
  if (!_sermonTick) _sermonTick = setInterval(sermonUpdate, 1000);
  markDirty('control');
  // Монітор сцени теж показує цей таймер (головне його призначення) —
  // оновлюємо одразу, не чекаючи першого тіку.
  if (typeof updateStageDisplay === 'function') updateStageDisplay();
  notify('📣 Таймер проповіді запущено: ' + (minutes || 30) + ' хв');
}

function lockPanel() {
  const pin = loadJSON('church_panel_pin');
  if (!pin) {
    pv2Prompt('Задай PIN для блокування панелі (4 цифри):', '', function(set){
      if (!set || !/^\d{4}$/.test(set)) { notify('PIN має бути 4 цифри'); return; }
      saveJSON('church_panel_pin', set);
      state.panelLocked = true;
      showLockScreen();
      notify('🔒 Панель заблоковано');
    });
    return;
  }
  state.panelLocked = true;
  showLockScreen();
  notify('🔒 Панель заблоковано');
}

// ============================================================
// НАЛАШТУВАННЯ: резервна копія, профілі, підтвердження, вигляд
// ============================================================

// ---- 1. Повна резервна копія (ВСІ дані одним файлом) ----
// Збираємо кожен ключ localStorage із префіксом church_ — нічого не губиться,
// навіть якщо додамо нові розділи згодом.
function collectAllData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.indexOf('church_') !== 0) continue;
    // Великі дані лежать у файлі, а в сховищі — позначка. У копію треба самі дані,
    // інакше резервна копія була б порожньою для перекладів, фонів і фото.
    data[k] = (typeof bigStoreGet === 'function') ? bigStoreGet(k) : localStorage.getItem(k);
  }
  return data;
}
// ---- 2. Профілі налаштувань (ранкова / вечірня / молодіжна) ----
function loadProfiles() {
  state.profiles = loadJSON('church_profiles') || { list: [], active: null };
}
function saveProfilesMeta() { saveJSON('church_profiles', state.profiles); }

// У профіль входять налаштування виводу й оформлення (не пісні й не Біблія — вони спільні)
const PROFILE_KEYS = ['church_output_routes','church_output_chroma','church_named_themes',
  'church_live_config','church_output_bg','church_graphics_presets','church_h2r_templates'];

// ---- 3. Підтвердження небезпечних дій ----
function loadUiPrefs() {
  state.ui = Object.assign({ confirmDanger: true, scale: 100, sound: false, light: false, highContrast: false, boldText: false },
                           loadJSON('church_ui_prefs') || {});
  applyUiScale();
  applyUiTheme();
}
function saveUiPrefs() { saveJSON('church_ui_prefs', state.ui); }
// ---- 4. Розмір інтерфейсу ----
function applyUiScale() {
  const s = (state.ui && state.ui.scale) || 100;
  const de = document.documentElement;
  if (de && de.style) de.style.fontSize = (s / 100 * 16) + 'px';
}

// ---- 5. Звуковий сигнал ----
// ---- 6. Світла тема панелі ----
function applyUiTheme() {
  const light = state.ui && state.ui.light;
  document.body.classList.toggle('pv2-light', !!light);
  document.body.classList.toggle('pv2-contrast', !!(state.ui && state.ui.highContrast));
  document.body.classList.toggle('pv2-bold', !!(state.ui && state.ui.boldText));
}

// ---- 7. Автозапуск разом з Windows ----
// Скільки місця займають дані програми (щоб переповнення не застало зненацька)
function storageUsage() {
  let total = 0;
  const parts = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || '';
      const kb = Math.round(v.length / 1024);
      total += kb;
      if (kb > 50) parts.push({ key: k, kb: kb });
    }
  } catch (e) {}
  parts.sort((a, b) => b.kb - a.kb);
  return { totalKb: total, big: parts.slice(0, 5) };
}
function renderStorageCard() {
  const u = storageUsage();
  const limitKb = 5120;                                  // типовий ліміт ~5 МБ
  const pct = Math.min(100, Math.round(u.totalKb / limitKb * 100));
  const color = pct > 85 ? 'var(--red)' : pct > 60 ? '#e0a54a' : 'var(--green)';
  const names = { church_bible_translations: 'Переклади Біблії', church_backgrounds: 'Фони',
                  church_html_overlays: 'HTML-графіки', church_gdd_params: 'Фото у графіках',
                  church_songs: 'Пісні', church_custom_slides: 'Слайди' };
  const rows = u.big.map(p =>
    `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)">
       <span>${esc(names[p.key] || p.key)}</span><span>${p.kb} КБ</span></div>`).join('');
  return `
  <div class="card">
    <div class="card-title">💾 Місце у сховищі</div>
    <div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden;margin:6px 0">
      <div style="width:${pct}%;height:100%;background:${color}"></div>
    </div>
    <div style="font-size:12px;color:var(--text2)">Зайнято ${Math.round(u.totalKb / 1024 * 10) / 10} МБ із ~5 МБ (${pct}%)</div>
    ${rows ? '<div style="margin-top:6px">' + rows + '</div>' : ''}
    ${pct > 85 ? '<div style="font-size:11px;color:var(--red);margin-top:6px">Майже повне. Прибери зайві фони або переклади, які не використовуєш.</div>' : ''}
  </div>`;
}

// ============================================================
// КЕРУВАННЯ ПІД ЧАС СЛУЖБИ
// ============================================================

// ---- 1. BLACKOUT — миттєвий чорний екран, з поверненням того самого ----
// Відрізняється від «Очистити»: запам'ятовує, що було, і повертає одним натисканням.
let _blackoutSaved = null;
// ---- 2. Центральна гучність (відео-фон + фонова музика разом) ----
function loadMasterVolume() {
  const m = loadJSON(STORAGE_KEYS.live + '_master');
  if (m && typeof m.v === 'number') state.masterVolume = m.v;
}
// ---- 3. Таймер проповіді (тільки для сцени/музикантів) ----
let _sermonTick = null;
function sermonUpdate() {
  if (!state.sermon || !state.sermon.running) return;
  const elapsed = Math.floor((Date.now() - state.sermon.startedAt) / 1000);
  const left = state.sermon.planned - elapsed;
  // На екран сцени: скільки минуло, скільки лишилось, попередження
  const warn = left <= 0 ? 'over' : (left <= 300 ? 'soon' : 'ok');
  if (window.electronAPI && window.electronAPI.sendStageTimer) {
    window.electronAPI.sendStageTimer({ elapsed: elapsed, left: left, warn: warn });
  }
  if (typeof updateStageDisplay === 'function') updateStageDisplay();
  const lbl = $('#sermonElapsed');
  if (lbl) lbl.textContent = fmtMMSS(elapsed) + (left >= 0 ? ' / лишилось ' + fmtMMSS(left) : ' / +' + fmtMMSS(-left));
}
function fmtMMSS(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), ss = s % 60;
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}

// ---- 4. Швидкі закладки ----
function loadBookmarks() { state.bookmarks = loadJSON(STORAGE_KEYS.live + '_bookmarks') || []; }
// ---- 5. Прев'ю «що в залі» (для пульта/іншого ПК) ----
// Хост уже розсилає стан; тут просто показуємо його як текст-прев'ю
function livePreviewText() {
  const c = state.onAir;
  if (state.blackout) return '⬛ Чорний екран';
  if (!c) return '— порожньо —';
  if (c.kind === 'text') return (c.ref ? '[' + c.ref + '] ' : '') + String(c.rawText || '').replace(/<[^>]+>/g, ' ').slice(0, 120);
  return c.label || 'HTML-графіка';
}

// ---- 6. Блокування панелі оператора ----
function showLockScreen() {
  let el = document.getElementById('panelLock');
  if (!el) {
    el = document.createElement('div');
    el.id = 'panelLock';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,10,26,.97);display:flex;' +
      'flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:sans-serif';
    el.innerHTML = '<div style="font-size:48px;margin-bottom:16px">🔒</div>' +
      '<div style="font-size:18px;margin-bottom:16px">Панель заблоковано</div>' +
      '<input id="unlockPin" type="password" inputmode="numeric" maxlength="4" placeholder="PIN" ' +
      'style="font-size:24px;text-align:center;width:120px;padding:8px;border-radius:8px;border:2px solid #c8a84b;background:#1a1a2e;color:#fff;outline:none">' +
      '<button style="margin-top:14px;padding:8px 24px;font-size:15px;border-radius:8px;border:none;background:#c8a84b;color:#1a1a2e;font-weight:700;cursor:pointer" ' +
      'onclick="tryUnlock()">Розблокувати</button>' +
      '<div id="unlockErr" style="color:#f56565;font-size:12px;margin-top:8px;height:22px"></div>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  const inp = document.getElementById('unlockPin');
  if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 50);
    inp.onkeydown = e => { if (e.key === 'Enter') tryUnlock(); }; }
}
function tryUnlock() {
  const pin = loadJSON('church_panel_pin');
  const inp = document.getElementById('unlockPin');
  const err = document.getElementById('unlockErr');
  if (inp && inp.value === pin) {
    state.panelLocked = false;
    const el = document.getElementById('panelLock'); if (el) el.style.display = 'none';
    notify('🔓 Розблоковано');
  } else if (err) { err.textContent = 'Невірний PIN'; if (inp) inp.value = ''; }
}

// ---- Вкладка «Керування» ----

// ============================================================
// ПЕРЕВІРКА ПЕРЕД СЛУЖІННЯМ
// Один клік — і видно, чи все готове: екрани, переклади, місце, графіки.
// ============================================================
function preflightCheck() {
  const r = [];
  const add = (ok, name, hint) => r.push({ ok: ok, name: name, hint: hint || '' });

  // 1. Виходи
  const open = [1, 2, 3, 4].filter(i => state.outputStates[i] && state.outputStates[i].open);
  add(open.length > 0, 'Екрани виводу: ' + (open.length ? open.map(i => OUT_NAME[i]).join(', ') : 'жодного'),
      open.length ? '' : 'Відкрий проектор і трансляцію (F1 / F2)');

  // 2. Синхронізація
  add(state.sendTarget === 'all', 'Синхронізація екранів',
      state.sendTarget === 'all' ? '' : 'Надсилання лише на ' + (OUT_NAME[state.sendTarget] || '?') + ' — натисни «Синхронізувати всі екрани»');

  // 3. Переклади Біблії
  const tr = (typeof bibleTranslations !== 'undefined') ? Object.keys(bibleTranslations || {}) : [];
  add(tr.length > 0, 'Переклади Біблії: ' + (tr.length || 'немає'),
      tr.length ? '' : 'Імпортуй переклад у вкладці «Імпорт даних»');

  // 4. Додаткові мови
  const langs = [state.secondLang, state.thirdLang].filter(Boolean).length;
  add(true, 'Додаткових мов на екрані: ' + langs, langs ? '' : 'Якщо потрібна чеська/англійська — увімкни у «Мова/OBS»');

  // 5. Пісні
  const songs = (typeof currentSongs !== 'undefined' && currentSongs) ? currentSongs.length : 0;
  add(songs > 0, 'Пісні: ' + songs, songs ? '' : 'Додай або імпортуй пісні');

  // 6. Графіки (HTML-оверлеї)
  const ov = (typeof htmlOverlays !== 'undefined' && htmlOverlays) ? htmlOverlays.length : 0;
  add(true, 'HTML-графіки: ' + ov, ov ? '' : 'Якщо плануєш таймер/титри — завантаж файли у «HTML Графіка»');

  // 7. Місце у сховищі
  const u = (typeof storageUsage === 'function') ? storageUsage() : { totalKb: 0 };
  const pct = Math.round(u.totalKb / 5120 * 100);
  add(pct < 85, 'Місце у сховищі: ' + pct + '%', pct < 85 ? '' : 'Майже повне — великі дані тепер ідуть у файли, але прибери зайве');

  // 8. QR офлайн
  const qrReady = (typeof QR_LOADED !== 'undefined' && QR_LOADED);
  add(true, 'QR-генератор: ' + (qrReady ? 'готовий' : 'ще не завантажений'),
      qrReady ? '' : 'Відкрий вкладку QR раз при інтернеті — далі працюватиме без мережі');

  // 9. План служби
  const plan = (state.service && state.service.items) ? state.service.items.length : 0;
  add(true, 'Пунктів у плані служби: ' + plan, plan ? '' : 'Не обов\'язково, але зручно вести службу за планом');

  return r;
}

function renderPreflight() {
  const r = preflightCheck();
  const bad = r.filter(x => !x.ok).length;
  return `
  <div class="card" style="border-color:${bad ? 'var(--red)' : 'var(--green)'}">
    <div class="card-title">${bad ? '⚠️ Перевірка: є ' + bad + ' зауваж.' : '✅ Усе готове до служіння'}</div>
    ${r.map(x => `<div style="display:flex;gap:6px;align-items:flex-start;padding:3px 0;font-size:12px">
        <span>${x.ok ? '✓' : '⚠️'}</span>
        <div style="flex:1">
          <div style="color:${x.ok ? 'var(--text)' : 'var(--red)'}">${esc(x.name)}</div>
          ${x.hint ? `<div style="font-size:11px;color:var(--text2)">${esc(x.hint)}</div>` : ''}
        </div>
      </div>`).join('')}
    <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="runPreflight()">↻ Перевірити ще раз</button>
  </div>`;
}

function runPreflight() {
  const host = $('#preflightBox');
  if (host) host.innerHTML = renderPreflight();
  const bad = preflightCheck().filter(x => !x.ok).length;
  notify(bad ? '⚠️ Перевірка: ' + bad + ' зауваж.' : '✅ Усе готове до служіння');
}

// ---- Макроси / тригери: одна кнопка = кілька дій поспіль ------------------
function loadMacros() {
  const d = loadJSON('church_macros');
  state.macros = Array.isArray(d) ? d : [];
  state.macroDraft = { name: '', steps: [] };
}
function saveMacros() { saveJSON('church_macros', state.macros); }

const MACRO_ACTIONS = {
  clearAll:   'Очистити все',
  clearSlide: 'Очистити слайд',
  logoOn:     'Показати логотип',
  logoOff:    'Сховати логотип',
  countdown:  'Відлік',
  look:       'Look',
  blackout:   'Чорний екран'
};

function macroDraftName(v) { state.macroDraft = state.macroDraft || { name: '', steps: [] }; state.macroDraft.name = v; }
function macroAddStep(a) {
  state.macroDraft = state.macroDraft || { name: '', steps: [] };
  if (a === 'countdown') {
    pv2Prompt('Скільки хвилин відлік?', '5', function(mins) {
      if (mins === null) return;
      state.macroDraft.steps.push({ a: a, v: Math.max(1, parseInt(mins, 10) || 5) });
      markDirty('control');
    });
    return;
  }
  if (a === 'look') {
    const list = (state.looks && state.looks.list) || [];
    if (!list.length) { notify('Спершу збережи хоч один Look (вкладка «Виходи»)'); return; }
    pv2Prompt('Номер Look (' + list.map((l, i) => (i + 1) + '=' + l.name).join(', ') + '):', '1', function(pick) {
      if (pick === null) return;
      state.macroDraft.steps.push({ a: a, v: Math.max(0, (parseInt(pick, 10) || 1) - 1) });
      markDirty('control');
    });
    return;
  }
  state.macroDraft.steps.push({ a: a, v: null });
  markDirty('control');
}
function macroDraftRemove(pos) {
  if (!state.macroDraft) return;
  state.macroDraft.steps.splice(pos, 1);
  markDirty('control');
}
function saveMacroDraft() {
  const d = state.macroDraft;
  if (!d || !d.steps.length) { notify('Додай хоч одну дію'); return; }
  const name = (d.name || '').trim() || ('Макрос ' + (state.macros.length + 1));
  state.macros.push({ name: name, steps: d.steps.slice() });
  saveMacros();
  state.macroDraft = { name: '', steps: [] };
  markDirty('control');
  notify('⚡ Макрос «' + name + '» збережено');
}
function deleteMacro(i) {
  if (!state.macros[i]) return;
  if (!confirm('Видалити макрос «' + state.macros[i].name + '»?')) return;
  state.macros.splice(i, 1);
  saveMacros();
  markDirty('control');
}
function runMacroStep(st) {
  switch (st.a) {
    case 'clearAll':
      if (typeof clearSlideOnly === 'function') clearSlideOnly();
      if (typeof clearPropsLayer === 'function') clearPropsLayer();
      if (typeof clearLogoLayer === 'function') clearLogoLayer();
      break;
    case 'clearSlide': if (typeof clearSlideOnly === 'function') clearSlideOnly(); break;
    case 'logoOn':  if (typeof showLogo === 'function') showLogo(true); break;
    case 'logoOff': if (typeof showLogo === 'function') showLogo(false); break;
    case 'countdown':
      var mins = parseInt(st.v, 10) || 5;
      if (typeof timerState !== 'undefined' && timerState) { timerState.setSeconds = mins * 60; timerState.remaining = mins * 60; timerState.running = false; timerState.paused = false; }
      if (typeof sendTimerToProjector === 'function') sendTimerToProjector();
      break;
    case 'look': if (typeof applyLook === 'function') applyLook(parseInt(st.v, 10) || 0); break;
    case 'blackout': if (typeof toggleBlackout === 'function') toggleBlackout(); break;
  }
}
function runMacro(i) {
  const m = state.macros[i]; if (!m) return;
  let delay = 0;
  (m.steps || []).forEach(function(st) {
    setTimeout(function() { try { runMacroStep(st); } catch (e) {} }, delay);
    delay += 250;   // проміжок між діями, щоб UI/IPC встигали
  });
  notify('⚡ «' + m.name + '» запущено');
}
function renderMacrosCard() {
  const macros = state.macros || [];
  const draft = state.macroDraft || { name: '', steps: [] };
  const stepLabel = (st) => (MACRO_ACTIONS[st.a] || st.a) + (st.v != null ? ' ' + (st.a === 'countdown' ? st.v + 'хв' : st.a === 'look' ? '#' + (st.v + 1) : st.v) : '');
  const draftChips = draft.steps.length
    ? draft.steps.map((st, pos) => `<span style="display:inline-flex;align-items:center;gap:3px;margin:2px;padding:2px 5px;border:1px solid var(--border);border-radius:6px;font-size:11px">${esc(stepLabel(st))}<span onclick="macroDraftRemove(${pos})" style="cursor:pointer;color:var(--red)">✕</span></span>`).join('')
    : '<span class="text-muted" style="font-size:11px">Додай дії кнопками нижче</span>';
  const actionBtns = Object.keys(MACRO_ACTIONS).map(a => `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="macroAddStep('${a}')">+ ${esc(MACRO_ACTIONS[a])}</button>`).join(' ');
  const saved = macros.length
    ? macros.map((m, i) => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <button class="btn btn-success btn-sm" style="flex:1;text-align:left" onclick="runMacro(${i})">⚡ ${esc(m.name)} <span style="opacity:.6;font-size:10px">(${(m.steps || []).length})</span></button>
        <button class="btn btn-ghost btn-sm" onclick="deleteMacro(${i})">✕</button></div>`).join('')
    : '<div class="text-muted" style="font-size:11px">Немає збережених макросів</div>';
  return `<div class="card" style="border-color:var(--accent)">
    <div class="card-title">⚡ Макроси / тригери</div>
    <div class="card-sub">Одна кнопка = кілька дій поспіль (напр. «Початок служби» = очистити + логотип + відлік).</div>
    <div style="margin-top:6px">${saved}</div>
    <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px">
      <input type="text" placeholder="Назва нового макросу" value="${esc(draft.name)}" oninput="macroDraftName(this.value)" style="width:100%;margin-bottom:6px">
      <div style="margin-bottom:6px">${draftChips}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${actionBtns}</div>
      <button class="btn btn-primary btn-sm btn-block" onclick="saveMacroDraft()">💾 Зберегти макрос</button>
    </div>
  </div>`;
}

// ============================================================
// МУЛЬТИВʼЮ — чотири вихідні екрани в мініатюрах 2x2
// ============================================================
// ============================================================
// НАДІЙНІСТЬ ТА ІНТЕГРАЦІЇ
// ============================================================

// ---- Лог помилок з боку панелі ----
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('error', e => {
    if (window.electronAPI && window.electronAPI.logError)
      window.electronAPI.logError('renderer', (e.error && e.error.stack) || e.message);
  });
  window.addEventListener('unhandledrejection', e => {
    if (window.electronAPI && window.electronAPI.logError)
      window.electronAPI.logError('promise', String(e.reason));
  });
}

// ---- Планувальник: автозапуск профілю за розкладом ----
function loadScheduler() {
  state.scheduler = loadJSON('church_scheduler') || { items: [] };
  // items: [{ weekday:0-6, time:'09:30', profile:'Ранкова', on:true }]
}
function saveScheduler() { saveJSON('church_scheduler', state.scheduler); }
let _schedulerLast = '';
function schedulerTick() {
  if (!state.scheduler || !state.scheduler.items.length) return;
  const now = new Date();
  const key = now.getDay() + '_' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  if (key === _schedulerLast) return;
  state.scheduler.items.forEach(it => {
    if (!it.on || !it.profile) return;
    const itKey = it.weekday + '_' + it.time;
    if (itKey === key) {
      _schedulerLast = key;
      const idx = (state.profiles.list || []).findIndex(p => p.name === it.profile);
      if (idx >= 0) { notify('📅 Розклад: профіль «' + it.profile + '»'); uiBeep(); applyProfileSilent(idx); }
    }
  });
}
// Тихе застосування профілю (без confirm) — для автозапуску за розкладом
function applyProfileSilent(i) {
  const p = state.profiles.list[i];
  if (!p) return;
  Object.keys(p.snap).forEach(k => {
    if (typeof bigStoreSet === 'function') bigStoreSet(k, p.snap[k]);
    else localStorage.setItem(k, p.snap[k]);
  });
  state.profiles.active = p.name;
  saveProfilesMeta();
  setTimeout(() => location.reload(), 800);
}

// ---- Автобекап за розкладом ----
function loadAutoBackup() {
  state.autoBackup = loadJSON('church_autobackup') || { on: false, everyDays: 7, last: 0 };
  maybeAutoBackup();
}
function maybeAutoBackup(force) {
  if (!state.autoBackup || !state.autoBackup.on) return;
  const days = state.autoBackup.everyDays || 7;
  const due = Date.now() - (state.autoBackup.last || 0) > days * 86400000;
  if (!force && !due) return;
  if (!window.electronAPI || !window.electronAPI.writeAutoBackup) return;
  const payload = JSON.stringify({ app: 'church-presentation', version: 3, date: new Date().toISOString(), data: collectAllData() });
  window.electronAPI.writeAutoBackup(payload).then(r => {
    if (r && r.ok) {
      state.autoBackup.last = Date.now();
      saveJSON('church_autobackup', state.autoBackup);
    }
  }).catch(() => {});
}

// ---- Кошик видалених пісень (undo видалення) ----
function loadSongTrash() { state.songTrash = loadJSON('church_song_trash') || []; }
function trashSong(song) {
  state.songTrash = state.songTrash || [];
  state.songTrash.unshift({ song: song, at: Date.now() });
  if (state.songTrash.length > 50) state.songTrash.pop();   // тримаємо останні 50
  saveJSON('church_song_trash', state.songTrash);
}
// ---- Мова інтерфейсу (UA / CZ / EN) ----
// Перекладає меню навігації (назви розділів і всіх 38 вкладок нагорі —
// те, що видно на екрані завжди, незалежно від того, яка вкладка відкрита).
// Вміст усередині самих вкладок (картки, кнопки, підказки) лишається
// українською — перекласти геть усе це окрема набагато більша робота.
const I18N = {
  ua: { name: 'Українська' },
  cz: { name: 'Čeština', nav: {
    g_service: '🔴 Bohoslužba', g_content: '📖 Obsah', g_media: '🖼 Média',
    g_design: '🎨 Vzhled', g_outputs: '🖥 Výstupy', g_settings: '⚙️ Nastavení',
    live: '🔴 Živě', control: '🎬 Ovládání', layers: '🎬 Vrstvy', timer: '⏱ Časovač',
    songs: '🎵 Písně', addsong: '➕ Přidat píseň', song: '🎵 Píseň', bible: '📖 Bible', announce: '📢 Oznámení',
    present: '📽 PDF', slidebuilder: '🖼 Editor snímků', powerpoint: '🖨 PowerPoint',
    playlist: '📋 Playlist', media: '🎬 Média', qrscreen: '📲 QR obrazovka', htmlgfx: '💻 HTML', h2r: '🎞 H2R titulky',
    theme: '🎨 Motiv', graphics: '🖋 Grafika', backgrounds: '🖼 Pozadí', fonts: '🔤 Písma',
    animations: '✨ Animace', textcontrol: '📝 Text (obrazovky)', typo: '🔠 Čitelnost',
    router: '🔀 Výstupy', monitors: '🖥 Monitory', monitors2: '🔗 Přiřazení obrazovek',
    stream: '📡 Vysílání', stagedisplay: '🖥 Stage', ptz: '🎥 Kamery', atem: '🎬 ATEM',
    settings: '⚙️ Obecné', automation: '🔌 Automatizace', stations: '👥 Stanice',
    hotkeys: '⌨️ Klávesy', statistics: '📊 Statistika', extras: '🌐 Jazyk/OBS', importdata: '📥 Import dat'
  } },
  en: { name: 'English', nav: {
    g_service: '🔴 Service', g_content: '📖 Content', g_media: '🖼 Media',
    g_design: '🎨 Design', g_outputs: '🖥 Outputs', g_settings: '⚙️ Settings',
    live: '🔴 Live', control: '🎬 Control', layers: '🎬 Layers', timer: '⏱ Timer',
    songs: '🎵 Songs', addsong: '➕ Add Song', song: '🎵 Song', bible: '📖 Bible', announce: '📢 Announcements',
    present: '📽 PDF', slidebuilder: '🖼 Slide Editor', powerpoint: '🖨 PowerPoint',
    playlist: '📋 Playlist', media: '🎬 Media', qrscreen: '📲 QR Screen', htmlgfx: '💻 HTML', h2r: '🎞 H2R Captions',
    theme: '🎨 Theme', graphics: '🖋 Graphics', backgrounds: '🖼 Backgrounds', fonts: '🔤 Fonts',
    animations: '✨ Animations', textcontrol: '📝 Text (Screens)', typo: '🔠 Readability',
    router: '🔀 Outputs', monitors: '🖥 Monitors', monitors2: '🔗 Screen Binding',
    stream: '📡 Stream', stagedisplay: '🖥 Stage', ptz: '🎥 Cameras', atem: '🎬 ATEM',
    settings: '⚙️ General', automation: '🔌 Automation', stations: '👥 Stations',
    hotkeys: '⌨️ Hotkeys', statistics: '📊 Statistics', extras: '🌐 Language/OBS', importdata: '📥 Import Data'
  } }
};
function loadLang() { state.lang = (loadJSON('church_lang') || {}).code || 'ua'; }
// Переклад підпису вкладки/розділу навігації за id. Для решти тексту в
// програмі (усередині самих вкладок) перекладів поки нема — залишається
// українською, тут просто повертається fallback (сама українська мітка).
function navLabel(id, fallback) {
  const L = I18N[state.lang || 'ua'];
  return (L && L.nav && L.nav[id]) || fallback;
}
function t(key) {
  const L = I18N[state.lang || 'ua'] || I18N.ua;
  return L[key] || I18N.ua[key] || key;
}

// ---- Вкладка «Автоматизація» ----
// ---- Вкладка «Станції» ----

// ---- Пульт з телефону (перенесено зі старої вкладки «📱 Пульт») ----
function loadPultCfg() {
  state.pult = loadJSON('church_pult_cfg') || { on: false, url: '', pin: '' };
  state.pult.on = false;   // після перезапуску сервер не працює, поки не запустиш
}
function renderPultCard() {
  const p = state.pult || { on: false, url: '', pin: '' };
  return `
  <div class="card">
    <div class="card-title">📱 Пульт з телефону</div>
    <div class="card-sub">Телефон стає пультом: наступний/попередній слайд, очистити екран. Той самий Wi-Fi.</div>
    ${p.on
      ? `<div style="margin-top:6px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px">
           <div style="font-size:12px;color:var(--text2)">Відкрий на телефоні:</div>
           <div style="font-size:15px;font-weight:700;color:var(--accent);word-break:break-all">${esc(p.url)}</div>
           ${p.pin ? `<div style="font-size:12px;color:var(--text2);margin-top:4px">PIN: <b>${esc(p.pin)}</b></div>` : ''}
         </div>
         <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px;color:var(--red)" onclick="stationsStopPult()">Зупинити пульт</button>
         <div style="margin-top:10px;padding:8px;background:var(--bg);border:1px solid var(--accent);border-radius:6px">
           <div style="font-size:12px;color:var(--text2)">📋 Бюлетень служби для прихожан — БЕЗ паролю, лише перегляд плану (не пульт, нічим керувати не можна):</div>
           <div style="font-size:15px;font-weight:700;color:var(--gold);word-break:break-all;margin-top:2px">${esc(p.url)}/bulletin</div>
         </div>`
      : `<div style="display:flex;gap:5px;align-items:center;margin-top:6px;flex-wrap:wrap">
           <input id="stationsPultPin" type="text" maxlength="6" placeholder="Твій PIN (необов'язково)"
                  style="flex:1;min-width:120px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">
           <button class="btn btn-primary btn-sm" onclick="stationsStartPult()">▶ Запустити пульт</button>
         </div>
         <div class="card-sub" style="margin-top:4px">Цей PIN — повний контроль. Для інших людей — окремі паролі з обмеженими правами нижче.</div>`}
  </div>
  <div class="card">
    <div class="card-title">👥 Користувачі — свій пароль і права для кожного</div>
    <p class="text-muted" style="margin-bottom:10px;line-height:1.6">
      Додай людину, дай їй пароль, і сам обери, що саме їй можна. Можна змінити будь-коли — навіть поки пульт уже працює, не треба нікому нічого перевидавати.
    </p>
    <div id="remoteUsersList"></div>
    <button class="btn btn-primary btn-sm btn-block" style="margin-top:8px" onclick="addRemoteUser()">➕ Додати користувача</button>
  </div>`;
}

// ---- Вкладка «Виходи»: маршрут + фон для кожного з 4 екранів ----

// ============================================================
// КІЛЬКА ПЕРЕКЛАДІВ — ОКРЕМО НА КОЖЕН ВИХІД
// Проектор може показувати одні переклади, трансляція — інші.
// ============================================================
function loadMultiTrans() {
  const c = loadJSON('church_multi_trans');
  state.multiTrans = (c && c.byOutput) || { 1: [], 2: [], 3: [], 4: [] };
  state.multiLive = [];
}
function saveMultiTrans() { saveJSON('church_multi_trans', { byOutput: state.multiTrans }); }

// ── Стиль слайда кількох перекладів: окремо для кожного виходу ────────────
// Проектор (1) і Трансляція (2) можуть мати свій розмір шрифту й розташування.
// band: той самий принцип «смуга внизу», що вже є в GDD-шаблоні вірша
// (templates/gdd/verse.html) — для мульти-перекладу раніше такого вигляду
// не було взагалі, лише один фіксований «на весь екран», тож на
// трансляції з відкритим кадром спікера кілька перекладів одразу
// перекривали половину картинки.
const MT_STYLE_DEFAULT = { fontScale: 100, vAlign: 'center', hAlign: 'center', band: false };
function mtStyle(n) {
  return Object.assign({}, MT_STYLE_DEFAULT, (state.multiTransStyle && state.multiTransStyle[n]) || {});
}
function loadMultiTransStyle() {
  const c = loadJSON('church_multi_trans_style');
  state.multiTransStyle = (c && c.byOutput) || {};
}
function saveMultiTransStyle() { saveJSON('church_multi_trans_style', { byOutput: state.multiTransStyle }); }
function setMultiTransStyle(n, key, val) {
  state.multiTransStyle = state.multiTransStyle || {};
  state.multiTransStyle[n] = Object.assign({}, MT_STYLE_DEFAULT, state.multiTransStyle[n] || {});
  if (key === 'fontScale') val = Math.max(50, Math.min(200, parseInt(val, 10) || 100));
  state.multiTransStyle[n][key] = val;
  saveMultiTransStyle();
  refreshMultiTransCard();
  // Якщо цей вихід прямо зараз показує переклади — одразу перемальовуємо його наживо.
  if ((state.multiLive || []).indexOf(n) >= 0) { try { sendMultiToOutput(n, true); } catch (e) {} }
}

function setMultiTrans(n, slot, id) {
  state.multiTrans[n] = state.multiTrans[n] || [];
  state.multiTrans[n][slot] = id || '';
  saveMultiTrans();
  refreshMultiTransCard();
}

// Збираємо блоки для конкретного виходу. failed (якщо передано масив) отримує
// назви обраних перекладів, у яких не знайшлось саме цього вірша — щоб було
// видно ПРИЧИНУ, а не загальне «нічого не обрано».
function multiBlocksFor(n, failed) {
  const out = [];
  const r = (typeof verseRange === 'function')
    ? verseRange()
    : { from: currentBibleVerseNum, to: currentBibleVerseNum };
  (state.multiTrans[n] || []).forEach(id => {
    if (!id) return;
    try {
      const text = getVerseRangeText(id, currentBibleBook, currentBibleChapter, r.from, r.to);
      if (text) out.push({ name: getTranslationName(id), text: text, language: (bibleTranslations[id] && bibleTranslations[id].language) || '' });
      else if (failed) failed.push(getTranslationName(id) || id);
    } catch (e) { if (failed) failed.push(getTranslationName(id) || id); }
  });
  return out;
}

// «Показати на обох» — раніше просто викликала sendMultiToOutput(1) і (2)
// поспіль, а прев'ю (state.preview) одне спільне на всю програму, тож другий
// виклик мовчки стирав перший: реально в ефір ішла лише трансляція, а
// проектор лишався порожнім, поки не натиснути на нього окремо.
function sendMultiToBoth() {
  if (typeof currentBibleBook === 'undefined' || !currentBibleBook) { notify('⚠️ Спочатку обери вірш'); return; }
  const chosen1 = (state.multiTrans[1] || []).filter(Boolean);
  const chosen2 = (state.multiTrans[2] || []).filter(Boolean);
  if (!chosen1.length && !chosen2.length) { notify('⚠️ Не обрано жодного перекладу для жодного виходу'); return; }

  if (!state.goingLive && state.liveMode === 'staged') {
    const ref = currentBibleRef();
    const blocks1 = chosen1.length ? multiBlocksFor(1, []) : [];
    const blocks2 = chosen2.length ? multiBlocksFor(2, []) : [];
    const previewBlocks = blocks1.length ? blocks1 : blocks2;   // для самого вигляду прев'ю
    stageContent({
      kind: 'htmlraw',
      html: getMultiTransHTML(ref, previewBlocks, chosen1.length ? 1 : 2),
      label: ref + ' — переклади на «Проектор» + «Трансляція»',
      ref: ref,
      multiOutputTarget: [1, 2]   // масив — goLive() відправить на обидва
    });
    notify('📋 У прев\'ю (обидва виходи) — натисни «В ЕФІР»');
    return;
  }
  sendMultiToOutput(1, true);
  sendMultiToOutput(2, true);
}

// Те саме, що «Показати на обох», але для всіх чотирьох виводів одразу —
// той самий захист прев'ю (multiOutputTarget-масив), щоб перший вихід не
// стирався наступним при відправці.
function sendMultiToAll4() {
  if (typeof currentBibleBook === 'undefined' || !currentBibleBook) { notify('⚠️ Спочатку обери вірш'); return; }
  const outputs = [1, 2, 3, 4];
  const chosenByOutput = outputs.map(n => (state.multiTrans[n] || []).filter(Boolean));
  if (!chosenByOutput.some(c => c.length)) { notify('⚠️ Не обрано жодного перекладу для жодного виходу'); return; }

  if (!state.goingLive && state.liveMode === 'staged') {
    const ref = currentBibleRef();
    let previewBlocks = [], previewN = 1;
    for (let i = 0; i < outputs.length; i++) {
      if (chosenByOutput[i].length) { previewBlocks = multiBlocksFor(outputs[i], []); previewN = outputs[i]; break; }
    }
    stageContent({
      kind: 'htmlraw',
      html: getMultiTransHTML(ref, previewBlocks, previewN),
      label: ref + ' — переклади на всі 4 виводи',
      ref: ref,
      multiOutputTarget: outputs.slice()
    });
    notify('📋 У прев\'ю (усі 4 виводи) — натисни «В ЕФІР»');
    return;
  }
  outputs.forEach(n => sendMultiToOutput(n, true));
}

// Подвійний клік лівою кнопкою — швидкий шлях «на Проектор+Трансляцію» без
// пошуку потрібної кнопки. Один обробник на два різні місця (текст вірша в
// «Біблії», куплети в «Пісні») — визначаємо звідки прийшов клік за id
// елемента й викликаємо відповідну дію. preventDefault, щоб браузер не
// намагався виділити слово подвійним кліком (відволікає, нічого не дає тут).
function dblClickSendBoth(e) {
  if (e && e.preventDefault) e.preventDefault();
  var id = e && e.currentTarget && e.currentTarget.id;
  if (id === 'bibleDisplay') {
    // ФІКС (той самий клас, що й для пісень нижче): sendMultiToBoth() сама
    // по собі лише повторно шле ПОТОЧНО вибраний вірш — не просуваючи його.
    // Якщо оператор щойно вивів цей вірш звичайною кнопкою, повторний
    // подвійний клік слав би ТОЙ САМИЙ текст, екран не змінювався б
    // візуально, і виглядало б, ніби «нічого не відбувається».
    if (typeof nextBibleVerse === 'function') nextBibleVerse();
    if (typeof sendMultiToBoth === 'function') sendMultiToBoth();
  } else if (id === 'songVerses') {
    // ФІКС: songSendFirst() лише надсилає ПОТОЧНИЙ куплет (selectedVerseIdx),
    // не просуваючи його — тож повторний подвійний клік просто повторно
    // слав ТОЙ САМИЙ текст, екран візуально не змінювався, і виглядало,
    // ніби «нічого не відбувається». Правильна дія для куплетів пісні —
    // спершу ПРОСУНУТИ вибір (nextVerse — сам лише оновлює прев'ю, не шле),
    // тоді надіслати НОВИЙ поточний куплет.
    if (typeof nextVerse === 'function') nextVerse();
    if (typeof sendToProjector === 'function') sendToProjector();
  }
}

function sendMultiToOutput(n, fromGoLive) {
  if (typeof currentBibleBook === 'undefined' || !currentBibleBook) { notify('⚠️ Спочатку обери вірш'); return; }
  const chosen = (state.multiTrans[n] || []).filter(Boolean);
  if (!chosen.length) { notify('⚠️ Для «' + OUT_NAME[n] + '» не обрано жодного перекладу'); return; }
  const failed = [];
  const blocks = multiBlocksFor(n, failed);
  if (!blocks.length) {
    // Усі обрані переклади не мають саме цього вірша — показуємо, які саме,
    // щоб було видно причину (наприклад, невідповідність книги при імпорті).
    notify('⚠️ У перекладах немає ' + currentBibleRef() + ': ' + failed.join(', '));
    return;
  }

  // ФІКС: якщо маршрут цього виходу досі «Дзеркало» — будь-яка наступна
  // звичайна відправка «на всі» (пісня, звичайний вірш, прийнята підказка
  // з живих субтитрів) мовчки перезапише кілька перекладів тут, бо
  // broadcastDisplay() у main.js шле саме на всі «дзеркальні» виходи,
  // не знаючи про цей прямий адресний запис. Перемикаємо маршрут ОДИН
  // РАЗ (лише поки він ще «mirror»), щоб вихід перестав ловити чужий
  // broadcast — і не смикати його повторно на кожен наступний вірш.
  if ((state.outputRoutes[n] || 'mirror') === 'mirror' && typeof setOutputRoute === 'function') {
    setOutputRoute(n, 'text');
  }

  const ref = currentBibleRef();
  const html = getMultiTransHTML(ref, blocks, n);

  // Ця функція раніше ЗАВЖДИ надсилала напряму, навіть у режимі «Спершу прев'ю» —
  // на відміну від звичайного виводу вірша. Один переклад працював правильно,
  // бо для нього використовується інший шлях (bibleGraphicsTo), а саме ця функція
  // (для кількох перекладів на конкретний вихід) прев'ю оминала завжди.
  if (!fromGoLive && state.liveMode === 'staged' && !state.goingLive) {
    stageContent({
      kind: 'htmlraw',
      html: html,
      label: (ref || 'Вірш') + ' — ' + blocks.length + ' переклад(и) на «' + OUT_NAME[n] + '»',
      ref: ref,
      multiOutputTarget: n
    });
    notify('📋 У прев\'ю — натисни «В ЕФІР»');
    return;
  }

  sendHTMLToOutputN(n, html, ref);
  // запамʼятовуємо, щоб стрілки оновлювали цей екран
  state.multiLive = state.multiLive || [];
  if (state.multiLive.indexOf(n) < 0) state.multiLive.push(n);
  if (typeof lastLiveSource !== 'undefined') {
    lastLiveSource = 'bible';
    lastLiveMulti = true;
    // Цей екран більше не показує «графіку» — але ІНШІ екрани не чіпаємо,
    // інакше вони застрягли б на старому вірші при гортанні.
    try {
      if (Array.isArray(lastLiveGraphicsTargets)) {
        lastLiveGraphicsTargets = lastLiveGraphicsTargets.filter(t => t !== n && t !== 0);
        lastLiveGraphics = lastLiveGraphicsTargets.length > 0;
      }
    } catch (e) {}
  }
  if (typeof exitServicePlan === 'function') exitServicePlan();
  // Сторож узгодженості: цей вихід щойно перейшов у мульти-режим —
  // якщо він лишився й в одиночному списку, приберемо звідти.
  if (typeof assertOutputConsistency === 'function') assertOutputConsistency(n, 'multi');
  refreshMultiTransCard();
  if (typeof renderBibleOutputRow === 'function') renderBibleOutputRow();
  notify(failed.length
    ? '⚠️ ' + OUT_NAME[n] + ': ' + blocks.length + ' з ' + chosen.length + ' (без вірша в: ' + failed.join(', ') + ')'
    : '📖 ' + OUT_NAME[n] + ': ' + blocks.length + ' переклад(и)');
}

// Повторний вивід під час гортання — на всі екрани, де показано переклади
function multiReplay() {
  const list = (state.multiLive || []).slice();
  if (!list.length) return false;
  list.forEach(n => {
    const blocks = multiBlocksFor(n);
    if (!blocks.length) return;
    const ref = currentBibleRef();
    sendHTMLToOutputN(n, getMultiTransHTML(ref, blocks, n), ref);
  });
  return true;
}

// Картка вибору перекладів у вкладці «Виходи»

// Картка перекладів живе у вкладці «Біблія» (щоб була під рукою під час служби)
function refreshMultiTransCard() {
  // Картка живе у ДВОХ місцях: у вкладці Біблія (#multiTransBox) і у
  // вкладці Оформлення → Графіка (#multiTransBoxGfx). Друга додана, щоб
  // оператор міг налаштувати переклади й вивести їх, не перемикаючись
  // на Біблію під час служби.
  //
  // Свідомо той САМИЙ renderMultiTransCard() в обидва контейнери, а не
  // копія розмітки: інакше два списки перекладів жили б окремо й з
  // часом розійшлись би — рівно той клас проблем, який ми вже ловили
  // з двома паралельними списками виходів.
  let found = false;
  ['multiTransBox', 'multiTransBoxGfx'].forEach(function (id) {
    const box = document.getElementById(id);
    if (box) { box.innerHTML = renderMultiTransCard(); found = true; }
  });
  return found;
}

function renderMultiTransCard() {
  let langs = [];
  try { langs = bibleTranslationsList(); } catch (e) {}
  const opts = (sel) => ['<option value="">— немає —</option>']
    .concat(langs.map(t => `<option value="${t.id}"${sel === t.id ? ' selected' : ''}>${esc(t.name)}</option>`)).join('');
  const rows = [1, 2, 3, 4].map(n => {
    const sel = state.multiTrans[n] || [];
    const live = (state.multiLive || []).indexOf(n) >= 0;
    const st = (typeof mtStyle === 'function') ? mtStyle(n) : { fontScale: 100, vAlign: 'center', hAlign: 'center' };
    const selStyle = 'background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:2px 4px;color:var(--text);font-size:11px';
    return `<div style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">${esc(OUT_NAME[n])} ${live ? '<span style="color:var(--green)">● в ефірі</span>' : ''}</div>
      ${[0, 1, 2].map(s => `<select onchange="setMultiTrans(${n},${s},this.value)"
          style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px;margin-bottom:3px">${opts(sel[s] || '')}</select>`).join('')}
      <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:5px 0;font-size:11px;color:var(--text2)">
        <span>Шрифт</span>
        <button class="btn btn-ghost btn-sm" style="padding:1px 7px" onclick="setMultiTransStyle(${n},'fontScale',${st.fontScale - 10})">−</button>
        <span style="min-width:34px;text-align:center">${st.fontScale}%</span>
        <button class="btn btn-ghost btn-sm" style="padding:1px 7px" onclick="setMultiTransStyle(${n},'fontScale',${st.fontScale + 10})">+</button>
        <select onchange="setMultiTransStyle(${n},'vAlign',this.value)" title="Розташування по вертикалі (ігнорується в режимі «Смуга внизу»)" ${st.band ? 'disabled' : ''} style="${selStyle}${st.band ? ';opacity:.5' : ''}">
          <option value="top"${st.vAlign === 'top' ? ' selected' : ''}>↑ Зверху</option>
          <option value="center"${st.vAlign === 'center' ? ' selected' : ''}>↕ Центр</option>
          <option value="bottom"${st.vAlign === 'bottom' ? ' selected' : ''}>↓ Знизу</option>
        </select>
        <select onchange="setMultiTransStyle(${n},'hAlign',this.value)" title="Вирівнювання тексту" style="${selStyle}">
          <option value="left"${st.hAlign === 'left' ? ' selected' : ''}>⇤ Ліво</option>
          <option value="center"${st.hAlign === 'center' ? ' selected' : ''}>↔ Центр</option>
          <option value="right"${st.hAlign === 'right' ? ' selected' : ''}>⇥ Право</option>
        </select>
      </div>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2);cursor:pointer;margin-bottom:4px">
        <input type="checkbox" ${st.band ? 'checked' : ''} onchange="setMultiTransStyle(${n},'band',this.checked)">
        <span>📽 Смуга внизу (для трансляції з відкритим кадром)</span>
      </label>
      <button class="btn btn-success btn-sm btn-block" style="margin-top:4px" onclick="sendMultiToOutput(${n})">${live ? '🔴 ' : ''}📖 Показати на «${esc(OUT_NAME[n])}»</button>
      ${live ? `<button class="btn btn-ghost btn-sm btn-block" style="margin-top:3px;color:var(--red)" onclick="clearBibleFrom(${n})">✕ Прибрати з «${esc(OUT_NAME[n])}»</button>` : ''}
    </div>`;
  }).join('');
  return `
  <div class="card">
    <div class="card-title">📖 Кілька перекладів — окремо на кожен екран</div>
    <div class="card-sub">Проектор і трансляція можуть показувати різні переклади того самого вірша, з окремим розміром шрифту й розташуванням для кожного. Вірш береться з вкладки «Біблія», стрілки гортають обидва екрани.</div>
    <div style="margin-top:8px">${rows}</div>
  </div>`;
}

// Профілі кімнат/виходів: швидко перемкнути вихід між заздалегідь
// налаштованими «режимами» (маршрут+хромакей) — наприклад «дитяча кімната»
// і «переливний зал» для того самого фізичного виходу. Колір фону («Фон (код)»)
// свідомо не входить у профіль — те поле ніде не зберігається в стані,
// лише застосовується напряму, тож захопити його «поточне» значення нема звідки.
function saveRoomProfile(n) {
  state.roomProfiles = state.roomProfiles || [];
  pv2Prompt('Назва профілю (напр. «Дитяча кімната»):', '', function(name) {
    if (!name) return;
    const p = {
      id: 'room_' + Date.now(),
      name: name,
      route: state.outputRoutes[n] || 'mirror',
      chroma: (state.outputChroma && state.outputChroma[n]) || 'none'
    };
    state.roomProfiles.push(p);
    saveJSON(STORAGE_KEYS.live + '_rooms', state.roomProfiles);
    markDirty('router');
    notify('🏠 Профіль «' + name + '» збережено для ' + OUT_NAME[n]);
  });
}
function applyRoomProfile(n, id) {
  const p = (state.roomProfiles || []).find(x => x.id === id);
  if (!p) return;
  setOutputRoute(n, p.route);
  if (typeof pv2SetChroma === 'function') pv2SetChroma(n, p.chroma);
  notify('🏠 ' + OUT_NAME[n] + ' → профіль «' + p.name + '»');
}
function deleteRoomProfile(id) {
  const p = (state.roomProfiles || []).find(x => x.id === id);
  if (!p || !confirm('Видалити профіль «' + p.name + '»?')) return;
  state.roomProfiles = state.roomProfiles.filter(x => x.id !== id);
  saveJSON(STORAGE_KEYS.live + '_rooms', state.roomProfiles);
  markDirty('router');
  notify('🗑 Профіль видалено');
}

// ---- Пресети сцени: на відміну від «Профілю» (один вихід за раз),
// зберігає й застосовує режим+хромакей+фон одразу для ВСІХ 4 виходів
// одним кліком — напр. «Служба з графікою» перемикає весь набір екранів
// разом, а не по одному. ----
function saveScenePreset() {
  state.scenePresets = state.scenePresets || [];
  pv2Prompt('Назва пресету сцени (напр. «Служба з графікою»):', '', function(name) {
    if (!name) return;
    const outputs = {};
    for (let n = 1; n <= 4; n++) {
      outputs[n] = {
        route: state.outputRoutes[n] || 'mirror',
        chroma: (state.outputChroma && state.outputChroma[n]) || 'none',
        bg: (state.outputBg && state.outputBg[n]) || null,
        opacity: (state.graphicsSettings && state.graphicsSettings.outputOpacity && state.graphicsSettings.outputOpacity[n]) || 62,
        // Прив'язку монітора зберігаємо як fingerprint (state.outputBind), а
        // не старий displayId-індекс — так само, як уже робить
        // bindOutputToDisplay() у вкладці «Прив'язка екранів». displayId
        // Windows перевидає заново після кожного перезавантаження, тож
        // збережена сцена «забула» б, який монітор мала на увазі.
        fingerprint: (state.outputBind && state.outputBind[OUT_KIND[n]]) || null
      };
    }
    state.scenePresets.push({ id: 'scene_' + Date.now(), name: name, outputs: outputs });
    saveJSON(STORAGE_KEYS.scenePresets, state.scenePresets);
    markDirty('router');
    notify('🎬 Сцену «' + name + '» збережено (усі 4 виходи)');
  });
}
function applyScenePreset(id) {
  const p = (state.scenePresets || []).find(x => x.id === id);
  if (!p) return;
  for (let n = 1; n <= 4; n++) {
    const o = p.outputs[n];
    if (!o) continue;
    setOutputRoute(n, o.route);
    if (typeof pv2SetChroma === 'function') pv2SetChroma(n, o.chroma);
    if (typeof setOutputOpacity === 'function' && o.opacity != null) setOutputOpacity(n, o.opacity);
    // Фон застосовуємо напряму (не через pv2ApplyOutputBg) — та функція
    // читає значення з DOM-поля вкладки «Виходи», якого може не бути в
    // DOM, якщо оператор зараз на іншій вкладці.
    if (window.electronAPI && window.electronAPI.setOutputBg) {
      window.electronAPI.setOutputBg(OUT_KIND[n], o.bg || null);
    }
    state.outputBg[n] = o.bg || null;
    const swatchEl = $('#pv2BgSwatchR' + n);
    if (swatchEl) swatchEl.style.background = o.bg || '#000';
    const bgInputEl = $('#pv2BgCode' + n);
    if (bgInputEl) bgInputEl.value = o.bg || '';
    // Монітор — застосовуємо лише якщо пресет його явно задає (старі, збережені
    // до цього фіксу сцени не мають fingerprint — не чіпаємо вже вибраний монітор).
    if (o.fingerprint !== undefined && typeof bindOutputToDisplay === 'function') {
      bindOutputToDisplay(n, o.fingerprint || null);
    }
  }
  saveJSON(STORAGE_KEYS.bg, state.outputBg);
  markDirty('router');
  notify('🎬 Сцена «' + p.name + '» застосована на всі 4 виходи');
}
function deleteScenePreset(id) {
  const p = (state.scenePresets || []).find(x => x.id === id);
  if (!p || !confirm('Видалити сцену «' + p.name + '»?')) return;
  state.scenePresets = state.scenePresets.filter(x => x.id !== id);
  saveJSON(STORAGE_KEYS.scenePresets, state.scenePresets);
  markDirty('router');
  notify('🗑 Сцену видалено');
}
function loadRoomProfiles() {
  const r = loadJSON(STORAGE_KEYS.live + '_rooms');
  if (Array.isArray(r)) state.roomProfiles = r;
}
function loadScenePresets() {
  const r = loadJSON(STORAGE_KEYS.scenePresets);
  if (Array.isArray(r)) state.scenePresets = r;
}

// Який вихід позначено «екраном сцени» — таймер проповіді накладається саме
// на нього. Лише один одночасно: обираєш інший — попередній автоматично звільняється.
function setStageOutputNum(n) {
  if (!window.electronAPI || !window.electronAPI.setStageOutput) return;
  const turningOff = state.stageOutputNum === n;
  const kind = turningOff ? null : OUT_KIND[n];
  return window.electronAPI.setStageOutput(kind).then(() => {
    state.stageOutputNum = turningOff ? null : n;
    saveJSON(STORAGE_KEYS.live + '_stageout', state.stageOutputNum);
    markDirty('router');
    notify(turningOff ? '🎤 Знято позначку сцени з ' + OUT_NAME[n] : '🎤 ' + OUT_NAME[n] + ' тепер екран сцени — таймер проповіді покажеться там');
  });
}
function loadStageOutputNum() {
  const n = loadJSON(STORAGE_KEYS.live + '_stageout');
  // Головний процес не пам'ятає вибір після перезапуску — нагадуємо йому,
  // щойно відновили вихід (аналогічно до маршрутів і хромакею).
  if (n && window.electronAPI && window.electronAPI.setStageOutput) {
    state.stageOutputNum = n;
    window.electronAPI.setStageOutput(OUT_KIND[n]);
  }
}

// Іменовані користувачі пульта/HTTP API — кожен ЗІ СВОЇМ паролем і власним
// набором дозволених дій, який можна змінювати будь-коли, не перевидаючи
// пароль і не чіпаючи інших користувачів.
const REMOTE_ACTIONS = [
  { id: 'next', label: 'Далі' }, { id: 'prev', label: 'Назад' },
  { id: 'next-verse', label: 'Куплет далі' }, { id: 'prev-verse', label: 'Куплет назад' },
  { id: 'select-verse', label: 'Обрати куплет' }, { id: 'go-live', label: 'В ефір' },
  { id: 'bookmark', label: 'Закладки' }, { id: 'plan-item', label: 'План служби' },
  { id: 'announce', label: 'Оголошення' },
  { id: 'clear', label: 'Очистити ефір' }, { id: 'blackout', label: 'Блекаут' },
  { id: 'undo', label: 'Скасувати' }, { id: 'freeze', label: 'Заморозити кадр' },
  { id: 'lower', label: 'Титр (нижня третина)' }
];
// Розумний набір за замовчуванням для нового користувача — гортати й
// виводити вміст можна, речі, що зачіпають ВЕСЬ ефір одразу — ні.
const REMOTE_DEFAULT_ACTIONS = ['next', 'prev', 'next-verse', 'prev-verse', 'select-verse', 'go-live', 'bookmark', 'plan-item', 'announce'];

function addRemoteUser() {
  state.remoteUsers = state.remoteUsers || [];
  pv2Prompt("Ім'я користувача:", '', function(name) {
    if (!name) return;
    state.remoteUsers.push({ id: 'u_' + Date.now(), name: name, pin: '', actions: REMOTE_DEFAULT_ACTIONS.slice() });
    syncRemoteUsers();
    renderRemoteUsersList();
    notify('👤 «' + name + '» додано — впиши пароль і обери права');
  });
}
function renameRemoteUser(id, name) {
  const u = (state.remoteUsers || []).find(x => x.id === id);
  if (!u || !name) return;
  u.name = name;
  syncRemoteUsers();
}
function setRemoteUserPin(id, pin) {
  const u = (state.remoteUsers || []).find(x => x.id === id);
  if (!u) return;
  u.pin = (pin || '').trim();
  syncRemoteUsers();
}
function toggleRemoteUserAction(id, actionId, on) {
  const u = (state.remoteUsers || []).find(x => x.id === id);
  if (!u) return;
  u.actions = u.actions || [];
  const i = u.actions.indexOf(actionId);
  if (on && i < 0) u.actions.push(actionId);
  else if (!on && i >= 0) u.actions.splice(i, 1);
  syncRemoteUsers();
}
function deleteRemoteUser(id) {
  const u = (state.remoteUsers || []).find(x => x.id === id);
  if (!u || !confirm('Видалити користувача «' + u.name + '»?')) return;
  state.remoteUsers = state.remoteUsers.filter(x => x.id !== id);
  syncRemoteUsers();
  renderRemoteUsersList();
  notify('🗑 «' + u.name + '» видалено');
}
// Зберігаємо локально І одразу штовхаємо в main.js, якщо сервер уже працює —
// саме це і є «змінювати з часом», без перезапуску пульта.
function syncRemoteUsers() {
  saveJSON(STORAGE_KEYS.station + '_users', state.remoteUsers || []);
  if (window.electronAPI && window.electronAPI.setRemoteUsers) {
    window.electronAPI.setRemoteUsers(state.remoteUsers || []);
  }
}
function loadRemoteUsers() {
  const u = loadJSON(STORAGE_KEYS.station + '_users');
  if (Array.isArray(u)) state.remoteUsers = u;
}
function renderRemoteUsersList() {
  const host = document.getElementById('remoteUsersList');
  if (!host) return;
  const users = state.remoteUsers || [];
  if (!users.length) { host.innerHTML = '<div class="card-sub">Ще нікого не додано.</div>'; return; }
  host.innerHTML = users.map(u => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input value="${esc(u.name)}" onblur="renameRemoteUser('${u.id}', this.value)"
               style="flex:1;min-width:100px;background:transparent;border:1px solid transparent;border-radius:4px;padding:3px 5px;color:var(--text);font-size:13px;font-weight:700;outline:none"
               onfocus="this.style.borderColor='var(--border)'">
        <input value="${esc(u.pin || '')}" placeholder="пароль" oninput="setRemoteUserPin('${u.id}', this.value)"
               style="width:80px;background:var(--panel2);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:12px;outline:none">
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteRemoteUser('${u.id}')">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px">
        ${REMOTE_ACTIONS.map(a => `
          <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer">
            <input type="checkbox" ${(u.actions || []).includes(a.id) ? 'checked' : ''}
                   onchange="toggleRemoteUserAction('${u.id}', '${a.id}', this.checked)">
            ${a.label}
          </label>`).join('')}
      </div>
      ${!u.pin ? '<div class="card-sub" style="margin-top:6px;color:var(--gold)">⚠️ Без пароля цей користувач не зможе увійти.</div>' : ''}
    </div>`).join('');
}

// Режим тренування — тут, а не в index.html, щоб автономні тести extras.js
// (без завантаження index.html) не падали на списку ініціалізації нижче.
// syncSendTargetBanner живе в index.html — викликаємо безпечно, як і скрізь
// у цьому файлі, коли функція з іншого файлу могла ще не завантажитись.
function loadTrainingMode() {
  // За замовчуванням ВИМКНЕНО, незалежно від того, що збережено — не хочемо,
  // щоб служба випадково стартувала в режимі тренування після перезапуску.
  state.trainingMode = false;
}

// Швидкі профілі служіння: на відміну від «Теми служіння» (лише вигляд —
// кольори/шрифти/фон) і профілів кімнати (маршрут ОДНОГО виходу) — це
// маршрути ВСІХ 4 виходів разом, і опційно яку тему до них застосувати.
// «Недільний ранок» / «Молодіжне» / «Особлива подія» — одним кліком.
function saveServiceProfile() {
  state.serviceProfiles = state.serviceProfiles || [];
  pv2Prompt('Назва профілю служіння (напр. «Молодіжне»):', '', function(name) {
    if (!name) return;
    const p = {
      id: 'svc_' + Date.now(),
      name: name,
      routes: { 1: state.outputRoutes[1] || 'mirror', 2: state.outputRoutes[2] || 'mirror',
                3: state.outputRoutes[3] || 'mirror', 4: state.outputRoutes[4] || 'mirror' },
      themeId: state.activeThemeId || null
    };
    state.serviceProfiles.push(p);
    saveJSON(STORAGE_KEYS.live + '_serviceprofiles', state.serviceProfiles);
    markDirty('live');
    if (typeof logChange === 'function') logChange('Профіль служіння', 'збережено «' + name + '»');
    notify('⚡ Профіль служіння «' + name + '» збережено');
  });
}
function applyServiceProfile(id) {
  const p = (state.serviceProfiles || []).find(x => x.id === id);
  if (!p) return;
  for (let n = 1; n <= 4; n++) setOutputRoute(n, p.routes[n] || 'mirror');
  if (p.themeId && typeof applyNamedTheme === 'function' && state.themes.find(t => t.id === p.themeId)) {
    applyNamedTheme(p.themeId);
  }
  if (typeof logChange === 'function') logChange('Профіль служіння', 'застосовано «' + p.name + '»');
  notify('⚡ Профіль служіння «' + p.name + '» застосовано');
}
function deleteServiceProfile(id) {
  const p = (state.serviceProfiles || []).find(x => x.id === id);
  if (!p || !confirm('Видалити профіль «' + p.name + '»?')) return;
  state.serviceProfiles = state.serviceProfiles.filter(x => x.id !== id);
  saveJSON(STORAGE_KEYS.live + '_serviceprofiles', state.serviceProfiles);
  markDirty('live');
  notify('🗑 Профіль видалено');
}
function loadServiceProfiles() {
  const p = loadJSON(STORAGE_KEYS.live + '_serviceprofiles');
  if (Array.isArray(p)) state.serviceProfiles = p;
}

// Журнал змін налаштувань — не хто саме (акаунтів нема), а ЩО і КОЛИ —
// щоб було видно, що «саме зламалось», а насправді хтось торкнувся налаштування.
function logChange(what, detail) {
  state.changeLog = state.changeLog || [];
  state.changeLog.unshift({ t: Date.now(), what: what, detail: detail || '' });
  if (state.changeLog.length > 200) state.changeLog = state.changeLog.slice(0, 200);
  saveJSON(STORAGE_KEYS.live + '_changelog', state.changeLog);
}
function loadChangeLog() {
  const l = loadJSON(STORAGE_KEYS.live + '_changelog');
  if (Array.isArray(l)) state.changeLog = l;
}
// ============================================================
// LOOKS — пресети конфігурації виходів
// Зберігає маршрут + хромакей + фон + переклади на кожен вихід і перемикає
// цілу конфігурацію ОДНИМ кліком БЕЗ перезавантаження (на відміну від профілів,
// що роблять location.reload, і тем, що чіпають лише візуальне оформлення).
// ============================================================
function loadLooks() {
  const d = loadJSON('church_looks');
  state.looks = (d && d.list) ? { list: d.list, active: d.active || null } : { list: [], active: null };
}
function saveLooks() { saveJSON('church_looks', state.looks); }

function currentLookCfg() {
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  return {
    routes: clone(state.outputRoutes),
    chroma: clone(state.outputChroma),
    bg: clone(state.outputBg),
    multiTrans: clone(state.multiTrans)
  };
}

function saveLookAs() {
  pv2Prompt('Назва пресета виходів (напр. «Звичайна», «3 переклади», «Оголошення»):', '', function(name){
    if (!name || !name.trim()) return;
    name = name.trim();
    state.looks.list = state.looks.list.filter(l => l.name !== name);
    state.looks.list.push({ name: name, date: new Date().toISOString().slice(0, 10), cfg: currentLookCfg() });
    state.looks.active = name;
    saveLooks();
    markDirty('router');
    notify('🎬 Пресет «' + name + '» збережено');
  });
}

function applyLook(i) {
  const lk = state.looks.list[i];
  if (!lk || !lk.cfg) return;
  const cfg = lk.cfg;
  for (let n = 1; n <= 4; n++) {
    if (cfg.routes && cfg.routes[n] != null) state.outputRoutes[n] = cfg.routes[n];
    if (cfg.chroma && cfg.chroma[n] != null) {
      state.outputChroma[n] = cfg.chroma[n];
      if (window.electronAPI && window.electronAPI.setOutputChroma) window.electronAPI.setOutputChroma(OUT_KIND[n], cfg.chroma[n]);
    }
    if (cfg.bg && typeof cfg.bg[n] !== 'undefined') {
      state.outputBg[n] = cfg.bg[n];
      if (window.electronAPI && window.electronAPI.setOutputBg) window.electronAPI.setOutputBg(OUT_KIND[n], cfg.bg[n] || null);
    }
  }
  if (cfg.multiTrans) { state.multiTrans = JSON.parse(JSON.stringify(cfg.multiTrans)); if (typeof saveMultiTrans === 'function') saveMultiTrans(); }
  if (typeof saveRoutes === 'function') saveRoutes();
  if (typeof saveChroma === 'function') saveChroma();
  if (typeof saveJSON === 'function') saveJSON(STORAGE_KEYS.bg, state.outputBg);
  // перенаправити поточний контент згідно з новими маршрутами (щоб застосувалось одразу)
  if (typeof pv2SyncMirrorKinds === 'function') pv2SyncMirrorKinds();
  for (let n = 1; n <= 4; n++) { if (typeof pv2PushToOutput === 'function') { try { pv2PushToOutput(n, pv2LastContent); } catch (e) {} } }
  state.looks.active = lk.name;
  saveLooks();
  markDirty('router');
  notify('🎬 Пресет «' + lk.name + '» застосовано');
}

function deleteLook(i) {
  const lk = state.looks.list[i];
  if (!lk || !confirm('Видалити пресет «' + lk.name + '»?')) return;
  state.looks.list.splice(i, 1);
  saveLooks();
  markDirty('router');
}

function renderLooksCard() {
  const looks = (state.looks && state.looks.list) || [];
  const items = looks.length
    ? looks.map((l, i) => {
        const act = state.looks.active === l.name;
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <button class="btn ${act ? 'btn-success' : 'btn-primary'} btn-sm" style="flex:1;text-align:left" onclick="applyLook(${i})">${act ? '✓ ' : '▶ '}${esc(l.name)}</button>
          <span style="font-size:10px;color:var(--text2)">${l.date || ''}</span>
          <button class="btn btn-ghost btn-sm" onclick="deleteLook(${i})" title="Видалити">✕</button>
        </div>`;
      }).join('')
    : '<div class="card-sub">Ще немає пресетів. Налаштуй виходи (що показує кожен, хромакей, фон, переклади) — і збережи як пресет, щоб перемикати одним кліком.</div>';
  return `<div class="card" style="margin-bottom:10px;border-color:var(--accent)">
    <div class="card-title">🎬 Пресети виходів (Looks)</div>
    <div class="card-sub" style="margin-bottom:6px">Запам'ятовує конфігурацію всіх екранів і перемикає її цілком одним кліком — без перезапуску.</div>
    ${items}
    <button class="btn btn-primary btn-sm btn-block" style="margin-top:6px" onclick="saveLookAs()">💾 Зберегти поточні виходи як пресет</button>
  </div>`;
}

// Призначення фізичного монітора для будь-якого з 4 виходів. Раніше таке
// було можливе тільки для Проектора й Трансляції (стара вкладка «Монітори»),
// хоча сам механізм (setOutputDisplay) уже й так підтримував будь-який вихід —
// просто для Виходу 3/4 не було випадаючого списку в інтерфейсі.
function onOutputDisplayChange(n) {
  if (!window.electronAPI || !window.electronAPI.setOutputDisplay) return;
  const sel = document.getElementById('pv2DisplaySel' + n);
  if (!sel) return;
  const val = sel.value;
  const id = val ? parseInt(val, 10) : null;
  window.electronAPI.setOutputDisplay(OUT_KIND[n], id).then(function(cfg) {
    if (cfg && cfg.error) { notify('⚠️ ' + (cfg.message || 'Не можна вивести на цей монітор')); return; }
    if (cfg) outputConfig = cfg;
    // Тримаємо «Прив'язку екранів» (state.outputBind, за відбитком, переживає
    // перезапуск) у синхроні з вибором тут — інакше та вкладка й далі
    // показувала б старе закріплення, а після перезапуску воно б тихо
    // повернулось назад (див. коментар у main.js set-output-display).
    state.outputBind = state.outputBind || {};
    state.outputBind[OUT_KIND[n]] = (cfg && cfg[OUT_KIND[n] + 'Fingerprint']) || null;
    if (typeof saveJSON === 'function') saveJSON(STORAGE_KEYS.live + '_bind', state.outputBind);
    if (typeof isActive === 'function' && isActive('monitors2')) markDirty('monitors2');
    notify('🖥 ' + OUT_NAME[n] + ' → ' + (id ? 'монітор призначено' : 'авто'));
  });
}

// ---- Глобальні гарячі клавіші ----
document.addEventListener('keydown', function(e) {
  const tag = document.activeElement ? document.activeElement.tagName : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (state._hotkeyCapture) captureHotkey(e);
    return;
  }
  if (state._hotkeyCapture) { captureHotkey(e); return; }
  const keyMap = {' ':'Space','ArrowLeft':'ArrowLeft','ArrowRight':'ArrowRight','ArrowUp':'ArrowUp','ArrowDown':'ArrowDown','Enter':'Enter','Escape':'Escape'};
  const dk = keyMap[e.key] || e.key;
  let action = null;
  Object.keys(state.hotkeys).forEach(a => { if (state.hotkeys[a] === dk) action = a; });
  if (!action) return;
  e.preventDefault();
  const staged = state.liveMode === 'staged';
  switch(action) {
    // У режимі прев'ю стрілки гортають ПРЕВ'Ю, зал не змінюється,
    // доки не натиснеш «В ЕФІР» (пробіл).
    case 'next-verse':
      // Пріоритет: служба за планом → PDF/слайд в ефірі → Біблія в ефірі → пісня
      // PDF-гілка МАЄ стояти перед фолбеком на state.selectedSong нижче —
      // інакше стара вибрана пісня (навіть якщо вона вже не в ефірі) тихо
      // перехоплювала б Пробіл/Стрілку, і замість наступної сторінки PDF
      // в ефір летіла пісня поверх щойно показаного PDF.
      if (state.service.idx >= 0) { svcNext(); if (staged) goLive(); }
      else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf' && typeof nextSlide === 'function') { nextSlide(); }
      else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible' && typeof nextBibleVerse === 'function') { nextBibleVerse(); }
      else if (liveSongAdvance(1)) { /* аранжування/розбиття: songStep показав слайд — і в ефірі, і в прев'ю */ }
      else if (staged) { previewStep(1); }
      else if (state.selectedSong) { nextVerse(); if (typeof sendToProjector === 'function') sendToProjector(); }
      break;
    case 'prev-verse':
      if (state.service.idx >= 0) { svcPrev(); if (staged) goLive(); }
      else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf' && typeof prevSlide === 'function') { prevSlide(); }
      else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible' && typeof prevBibleVerse === 'function') { prevBibleVerse(); }
      else if (liveSongAdvance(-1)) { /* аранжування/розбиття: songStep показав слайд — і в ефірі, і в прев'ю */ }
      else if (staged) { previewStep(-1); }
      else if (state.selectedSong) { prevVerse(); if (typeof sendToProjector === 'function') sendToProjector(); }
      break;
    case 'send':
      if (staged) goLive();
      else if (typeof sendToProjector === 'function') sendToProjector();
      break;
    case 'clear': clearLive(); break;
    case 'undo': undoLast(); break;
    case 'lower': lowerToggle(); break;
    case 'freeze': if (typeof toggleFreeze === 'function') toggleFreeze(); break;
    case 'blackout': toggleBlackout(); break;
    // QR/Медіа/Презентація — надсилають те, що вже підготовлено у своїй
    // вкладці. QR має ВЛАСНИЙ запам'ятований вихід (кнопки в самій
    // «QR-екран», qrState().target) — тут просто повторюємо той самий
    // виклик, що й кнопка «📲 ПОКАЗАТИ НА ЕКРАНІ». Медіа й Презентація
    // такого власного запам'ятовування не мають — для них клавіша бере
    // ціль із «🎯 Куди надсилати» (state.sendTarget), тієї самої, що вже
    // керує звичайним надсиланням пісень/віршів.
    case 'qr-send': if (typeof sendQrScreen === 'function') sendQrScreen(); break;
    case 'media-send': {
      const mt = (state.sendTarget && state.sendTarget !== 'all') ? state.sendTarget : 0;
      if (typeof sendMediaToProjector === 'function') sendMediaToProjector(mt || undefined);
      break;
    }
    case 'present-send': {
      const pt = (state.sendTarget && state.sendTarget !== 'all') ? state.sendTarget : null;
      if (pt && typeof sendSlideToOutputs === 'function') sendSlideToOutputs([pt]);
      else if (typeof sendSlideToProjector === 'function') sendSlideToProjector();
      break;
    }
    // Відкрити/закрити конкретний вихід — раніше захардкоджено на F1-F5
    // (index.html), не через це меню; перенесено сюди, бо на macOS ці
    // клавіші за замовчуванням перехоплює сама система (яскравість/Mission
    // Control/Launchpad), і оператору не було як призначити щось інше.
    case 'toggle-projector': if (typeof toggleProjector === 'function') toggleProjector(); break;
    case 'toggle-stream': if (typeof toggleStream === 'function') toggleStream(); break;
    case 'toggle-out3': if (typeof toggleOutputN === 'function') toggleOutputN(3); break;
    case 'toggle-out4': if (typeof toggleOutputN === 'function') toggleOutputN(4); break;
    case 'toggle-both': if (typeof toggleBothOutputs === 'function') toggleBothOutputs(); break;
  }
});

// ---- Ініціалізація: додаємо вкладки в інтерфейс додатку ----

function initOutputWarningListener() {
  if (window.electronAPI && window.electronAPI.onOutputWarning) {
    window.electronAPI.onOutputWarning(d => notify((d && d.intentional ? 'ℹ️ ' : '⚠️ ') + (d && d.message ? d.message : 'Проблема з виводом')));
  }
}

// ============================================================
// ДВОРІВНЕВА НАВІГАЦІЯ: 5 розділів → підвкладки
// Замінює три старі панелі (бічне меню + вкладки верхньої панелі + плоский
// другий рядок вкладок). Кожна наявна вкладка приписана до одного з розділів;
// зміст вкладок не чіпаємо — лише впорядковуємо доступ до них.
// ============================================================
const TAB_GROUPS = [
  { id: 'g_service', label: '🔴 Служба', tabs: [
    ['live', '🔴 Ефір'], ['control', '🎬 Керування'],
    ['layers', '🎬 Шари'], ['captions', '🎤 Субтитри'], ['timer', '⏱ Таймер']
  ] },
  { id: 'g_content', label: '📖 Контент', tabs: [
    ['songs', '🎵 Пісні'], ['addsong', '➕ Додати пісню'], ['song', '🎵 Пісня'],
    ['bible', '📖 Біблія'], ['announce', '📢 Оголошення']
  ] },
  { id: 'g_media', label: '🖼 Медіа', tabs: [
    ['present', '📽 PDF'], ['slidebuilder', '🖼 Редактор слайдів'], ['powerpoint', '🖨 PowerPoint'],
    ['playlist', '📋 Плейлист'], ['media', '🎬 Медіа'], ['qrscreen', '📲 QR-екран'],
    ['htmlgfx', '💻 HTML'], ['h2r', '🎞 H2R-титри']
  ] },
  { id: 'g_design', label: '🎨 Оформлення', tabs: [
    ['theme', '🎨 Тема'], ['graphics', '🖋 Графіка'], ['backgrounds', '🖼 Фони'],
    ['fonts', '🔤 Шрифти'], ['animations', '✨ Анімації'],
    ['textcontrol', '📝 Текст (екрани)'], ['typo', '🔠 Читабельність']
  ] },
  { id: 'g_outputs', label: '🖥 Виходи', tabs: [
    ['router', '🔀 Виходи'], ['monitors', '🖥 Монітори'], ['monitors2', '🔗 Прив\'язка екранів'],
    ['stream', '📡 Трансляція'], ['stagedisplay', '🖥 Stage'],
    ['ptz', '🎥 Камери'], ['atem', '🎬 ATEM']
  ] },
  { id: 'g_settings', label: '⚙️ Налаштування', tabs: [
    ['settings', '⚙️ Загальні'], ['automation', '🔌 Автоматизація'], ['stations', '👥 Станції'],
    ['hotkeys', '⌨️ Клавіші'], ['statistics', '📊 Статистика'], ['extras', '🌐 Мова/OBS'],
    ['importdata', '📥 Імпорт даних']
  ] }
];
let pv2ActiveGroup = null;
const pv2LastTabInGroup = {};

function pv2GroupOf(name) {
  for (const g of TAB_GROUPS) { if (g.tabs.some(t => t[0] === name)) return g; }
  return null;
}

function buildGroupedNav(content) {
  if (document.querySelector('.pv2-groupbar')) return;  // вже побудовано
  const st = document.createElement('style');
  st.textContent = [
    '.sidebar{display:none!important;}',
    '.topbar>.tab-btn{display:none!important;}',
    '.pv2-groupbar{display:flex;align-items:center;gap:6px;padding:6px 16px;background:var(--panel2);border-bottom:1px solid var(--border);overflow-x:auto;white-space:nowrap;flex:0 0 auto;}',
    '.pv2-groupbar .grp-btn{flex:0 0 auto;font-size:13px;font-weight:600;padding:7px 14px;border:none;border-radius:8px;background:transparent;color:var(--text2);cursor:pointer;transition:all .15s;}',
    '.pv2-groupbar .grp-btn.active{background:var(--accent);color:#fff;}',
    '.pv2-subbar{display:flex;align-items:center;gap:5px;padding:5px 16px;background:var(--panel);border-bottom:1px solid var(--border);overflow-x:auto;white-space:nowrap;flex:0 0 auto;}',
    '.pv2-subbar .sub-btn{flex:0 0 auto;font-size:12px;padding:5px 11px;border:none;border-radius:6px;background:transparent;color:var(--text2);cursor:pointer;transition:all .15s;}',
    '.pv2-subbar .sub-btn.active{background:var(--panel2);color:var(--text);box-shadow:inset 0 0 0 1px var(--border);}',
    '.pv2-groupbar::-webkit-scrollbar,.pv2-subbar::-webkit-scrollbar{height:6px}',
    '.pv2-groupbar::-webkit-scrollbar-thumb,.pv2-subbar::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}'
  ].join('');
  document.head.appendChild(st);

  const groupbar = document.createElement('div');
  groupbar.className = 'pv2-groupbar';
  const subbar = document.createElement('div');
  subbar.className = 'pv2-subbar';
  if (content.parentNode) {
    content.parentNode.insertBefore(groupbar, content);
    content.parentNode.insertBefore(subbar, content);
  }

  TAB_GROUPS.forEach(g => {
    const b = document.createElement('button');
    b.className = 'grp-btn';
    b.id = 'grp-' + g.id;
    b.textContent = (typeof navLabel === 'function') ? navLabel(g.id, g.label) : g.label;
    b.onclick = () => showGroup(g.id);
    groupbar.appendChild(b);
  });

  const cur = (typeof currentTabName !== 'undefined' && currentTabName) ? currentTabName : 'songs';
  const g0 = pv2GroupOf(cur) || TAB_GROUPS[0];
  pv2ActiveGroup = g0.id;
  renderSubbar(g0.id);
  syncGroupedNav(cur);
}

function renderSubbar(groupId) {
  const subbar = document.querySelector('.pv2-subbar');
  if (!subbar) return;
  const g = TAB_GROUPS.find(x => x.id === groupId);
  if (!g) return;
  subbar.innerHTML = '';
  g.tabs.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.className = 'sub-btn';
    b.id = 'sub-' + id;
    b.textContent = (typeof navLabel === 'function') ? navLabel(id, label) : label;
    b.onclick = () => showTab(id);
    subbar.appendChild(b);
  });
}

// Перемальовує підписи вже побудованого меню (групи + підвкладки поточного
// розділу) на мову з state.lang — викликається з setLang(), щоб перемикач
// діяв одразу, без перезапуску програми.
function refreshNavLabels() {
  TAB_GROUPS.forEach(g => {
    const b = document.getElementById('grp-' + g.id);
    if (b) b.textContent = navLabel(g.id, g.label);
  });
  if (pv2ActiveGroup) renderSubbar(pv2ActiveGroup);
  const cur = (typeof currentTabName !== 'undefined' && currentTabName) ? currentTabName : null;
  if (cur) syncGroupedNav(cur);
}

function showGroup(groupId) {
  const g = TAB_GROUPS.find(x => x.id === groupId);
  if (!g) return;
  pv2ActiveGroup = groupId;
  renderSubbar(groupId);
  const target = pv2LastTabInGroup[groupId] || g.tabs[0][0];
  showTab(target);
}

// Синхронізує підсвітку розділів і підвкладок з активною вкладкою.
// Викликається з showTab (index.html).
function syncGroupedNav(name) {
  const g = pv2GroupOf(name);
  if (g) {
    pv2ActiveGroup = g.id;
    pv2LastTabInGroup[g.id] = name;
    const subbar = document.querySelector('.pv2-subbar');
    if (subbar && !document.getElementById('sub-' + name)) renderSubbar(g.id);
  }
  document.querySelectorAll('.pv2-groupbar .grp-btn').forEach(b => b.classList.remove('active'));
  if (g) { const gb = document.getElementById('grp-' + g.id); if (gb) gb.classList.add('active'); }
  document.querySelectorAll('.pv2-subbar .sub-btn').forEach(b => b.classList.remove('active'));
  const sb = document.getElementById('sub-' + name); if (sb) sb.classList.add('active');
}

function pv2Init() {
  initOutputWarningListener();
  const topbar = document.querySelector('.topbar');
  const content = document.querySelector('.content');
  if (!topbar || !content) { console.warn('extras: не знайдено .topbar/.content'); return; }

  const TABS = [
    ['live',        '🔴 Ефір',       renderLiveTab],
    ['multiview',   '🔳 Мультивʼю',  renderMultiviewTab],
    ['control',     '🎬 Керування',  renderControlTab],
    ['router',      '🔀 Виходи',     renderRouterTab],
    ['monitors2',   '🔗 Прив\'язка екранів', renderMonitorsTab],
    ['stations',    '👥 Станції',    renderStationsTab],
    ['service',     '📅 План служби', renderServiceTab],
    ['song',        '🎵 Пісня',      renderSongTab],
    ['stream',      '📡 Трансляція', renderStreamTab],
    ['qrscreen',    '📲 QR-екран',   renderQrScreenTab],
    ['settings',    '⚙️ Налаштування', renderSettingsTab],
    ['automation',  '🔌 Автоматизація', renderAutomationTab],
    ['layers',      '🎬 Шари',       renderLayersTab],
    ['captions',    '🎤 Субтитри',   renderCaptionsTab],
    ['typo',        '🔠 Текст',      renderTypoTab],
    ['extras',      '🌐 Мова/OBS',   renderExtrasTab],
    ['playlist',    '📋 Плейлист',   renderPlaylistTab],
    ['media',       '🎬 Медіа',      renderMediaTab],
    ['textcontrol', '📝 Текст',      renderTextControlTab],
    ['graphics',    '🖋 Графіка',    renderGraphicsTab],
    ['h2r',         '🎞 H2R-титри',  renderH2RTab],
    ['hotkeys',     '⌨️ Клавіші',    renderHotkeysTab],
    ['animations',  '✨ Анімації',   renderAnimationsTab],
    ['stagedisplay','🖥 Stage',      renderStageTab],
    ['fonts',       '🔤 Шрифти',     renderFontsTab],
    ['statistics',  '📊 Статистика', renderStatisticsTab],
    ['powerpoint',  '🖨 Слайди/PPT', renderPowerPointTab]
  ];

  // Створюємо контент-діви всіх динамічних вкладок (кнопки будує групова навігація).
  TABS.forEach(([id, label, renderFn]) => {
    if (!document.getElementById('tab-content-' + id)) {
      const div = document.createElement('div');
      div.className = 'tab-content pv2';
      div.id = 'tab-content-' + id;
      try { div.innerHTML = renderFn(); } catch (e) { console.error('extras render ' + id, e); }
      content.appendChild(div);
    }
  });

  // Дворівнева навігація (5 розділів → підвкладки) замість трьох старих панелей.
  buildGroupedNav(content);

  // Індикатор «В ЕФІРІ»: миттєво оновлюється через updateLivePanels, а таймер —
  // страхує на випадок шляхів, що не проходять через updateLivePanels (мультипереклади).
  if (typeof refreshLiveIndicator === 'function') {
    refreshLiveIndicator();
    setInterval(refreshLiveIndicator, 800);
  }

  // Завантаження збережених даних та первинний рендер
  // Відновлення збереженого вибору шрифтів (у прототипі не було — виправлено)
  function restoreFontChoice() {
    const saved = loadJSON(STORAGE_KEYS.fonts);
    if (!saved) return;
    if ($('#fontSongs')) $('#fontSongs').value = saved.songs || 'Georgia, serif';
    if ($('#fontBible')) $('#fontBible').value = saved.bible || 'Georgia, serif';
    if ($('#fontHeaders')) $('#fontHeaders').value = saved.headers || 'Georgia, serif';
  }
  const steps = [loadUiPrefs, loadProfiles, loadMasterVolume, loadBookmarks,
                 loadScheduler, loadAutoBackup, loadSongTrash, loadLang, loadPultCfg, loadMultiTrans, loadMultiTransStyle, loadOutputNames, startAutomationWatcher, loadLower, loadOutputBindings, loadOutputFailover, loadRoomProfiles, loadScenePresets, loadServiceProfiles, loadChangeLog, loadTrainingMode, loadRemoteUsers, loadStageOutputNum, refreshMonitors, loadStationCfg, loadLiveConfig, loadNamedThemes, loadSecondLang, loadAutoTimer, loadAutoFit,
                 loadSplitCfg, loadOrders, loadArrangeGlobal, loadSongSize, syncSongFontSizeDisplay, loadSongTags, loadService, loadLayers, applyTypo, initObsListener, loadRoutes, loadOutputBg, loadOutputChroma, loadLooks, loadProps, loadMacros, loadPartLabels, loadArrangeSets, loadMsgTemplates, loadSoundBin, loadGraphicsSettings, pv2SyncOutputStates, pv2RenderOutputsCard, loadPlaylistData, loadHotkeys, loadMidiMap, initMidi, loadOscMap, getCloudSyncFolder, loadStatistics, restoreFontChoice, loadStageNotes, loadStageMonitorBinding, initWatchFolder, loadAnnounceSettings, renderServicePlanEmbed,
                 renderPlaylist, renderHotkeys, renderFontsList,
                 renderMediaList, updateH2RPreview, updateGraphicsPreview, updateTextPreview,
                 renderMediaOutBtns, renderGraphicsOutBtns, renderH2RLowerOutBtns,
                 renderCreditsOutBtns, renderConfettiOutBtns, renderTickerOutBtns, renderQrOutputRow,
                 loadOverlayChannel, renderGddTemplatePicker,
                 () => setPPTtemplate('classic'), updateStatistics,
                 updateLivePanels, applyDisplayCfg, initDisplayControlListener, initRemoteListener, initLogoListener, initDisplaysListener, initStageWindowListener, initUpdateListener];
  steps.forEach(fn => { try { fn(); } catch(e) { console.error('extras init', e); } });

  // buildGroupedNav() вище будує групову панель ДО того, як loadLang() (у
  // steps) встигає прочитати збережену мову з диска — тож при холодному
  // старті з мовою, відмінною від української, шапка меню спершу малювалась
  // українською. Перемальовуємо мітки ще раз тепер, коли мова вже завантажена.
  if (typeof refreshNavLabels === 'function') refreshNavLabels();
  // Той самий порядок-баг стосується й вмісту вкладок, відмальованого вище
  // (TABS.forEach) ДО того, як мова завантажилась — перекладаємо все одразу.
  if (typeof uiTranslateAll === 'function') uiTranslateAll();

  // Автозбереження кожні 30 с
  setInterval(() => {
    try {
      saveHotkeys(); saveStatistics(); savePlaylistData();
    } catch(e) {}
  }, 30000);

  // Оновлюємо статуси, коли вікно виходу закривають вручну
  if (window.electronAPI && window.electronAPI.onOutputClosed) {
    window.electronAPI.onOutputClosed(() => pv2SyncOutputStates());
  }

  console.log('✅ Завантажено: 19 вкладок — типографіка, шари, ефір, станції, OBS');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pv2Init);
else pv2Init();

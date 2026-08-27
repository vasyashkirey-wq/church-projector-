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
function backupAll() {
  const payload = {
    app: 'church-presentation',
    version: 3,
    date: new Date().toISOString(),
    data: collectAllData()
  };
  const n = Object.keys(payload.data).length;
  downloadFile(JSON.stringify(payload, null, 2),
    'церква-резервна-копія-' + new Date().toISOString().slice(0, 10) + '.json',
    'application/json');
  notify('💾 Резервна копія: ' + n + ' розділів збережено');
}
function restoreAll(input) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    let payload;
    try { payload = JSON.parse(e.target.result); } catch (err) { notify('✗ Файл пошкоджено'); return; }
    if (!payload.data || typeof payload.data !== 'object') { notify('✗ Це не файл резервної копії'); return; }
    if (!confirm('Відновити з копії? Поточні дані буде замінено на дані з файлу від ' +
                 (payload.date ? payload.date.slice(0, 10) : '?') + '.')) return;
    let n = 0;
    Object.keys(payload.data).forEach(k => {
      if (k.indexOf('church_') === 0) {
        if (typeof bigStoreSet === 'function') bigStoreSet(k, payload.data[k]);
        else localStorage.setItem(k, payload.data[k]);
        n++;
      }
    });
    notify('✓ Відновлено ' + n + ' розділів. Перезапусти програму.');
    setTimeout(() => { if (confirm('Перезавантажити зараз, щоб застосувати?')) location.reload(); }, 500);
  };
  r.readAsText(f);
  input.value = '';
}

// ---- 2. Профілі налаштувань (ранкова / вечірня / молодіжна) ----
function loadProfiles() {
  state.profiles = loadJSON('church_profiles') || { list: [], active: null };
}
function saveProfilesMeta() { saveJSON('church_profiles', state.profiles); }

// У профіль входять налаштування виводу й оформлення (не пісні й не Біблія — вони спільні)
const PROFILE_KEYS = ['church_output_routes','church_output_chroma','church_named_themes',
  'church_live_config','church_output_bg','church_graphics_presets','church_h2r_templates'];

function saveProfile() {
  pv2Prompt('Назва профілю (напр. «Ранкова», «Молодіжна»):', '', function(name){
  if (!name) return;
  const snap = {};
  PROFILE_KEYS.forEach(k => {
    const v = (typeof bigStoreGet === 'function') ? bigStoreGet(k) : localStorage.getItem(k);
    if (v != null) snap[k] = v;
  });
  // збираємо й усі ключі, що починаються з church_live_config (там підрозділи через _)
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf('church_live_config') === 0) snap[k] = (typeof bigStoreGet === 'function') ? bigStoreGet(k) : localStorage.getItem(k);
  }
  state.profiles.list = state.profiles.list.filter(p => p.name !== name);
  state.profiles.list.push({ name: name, date: new Date().toISOString().slice(0, 10), snap: snap });
  state.profiles.active = name;
  saveProfilesMeta();
  renderTabInto('settings');
  notify('👤 Профіль «' + name + '» збережено');
  });
}
function applyProfile(i) {
  const p = state.profiles.list[i];
  if (!p) return;
  if (!confirm('Застосувати профіль «' + p.name + '»? Поточне оформлення й виходи буде замінено.')) return;
  Object.keys(p.snap).forEach(k => {
    if (typeof bigStoreSet === 'function') bigStoreSet(k, p.snap[k]);
    else localStorage.setItem(k, p.snap[k]);
  });
  state.profiles.active = p.name;
  saveProfilesMeta();
  notify('👤 Профіль «' + p.name + '» — перезавантаження...');
  setTimeout(() => location.reload(), 600);
}
function deleteProfile(i) {
  const p = state.profiles.list[i];
  if (!p || !confirm('Видалити профіль «' + p.name + '»?')) return;
  state.profiles.list.splice(i, 1);
  saveProfilesMeta();
  renderTabInto('settings');
}

// ---- 3. Підтвердження небезпечних дій ----
function loadUiPrefs() {
  state.ui = Object.assign({ confirmDanger: true, scale: 100, sound: false, light: false, highContrast: false, boldText: false },
                           loadJSON('church_ui_prefs') || {});
  applyUiScale();
  applyUiTheme();
}
function saveUiPrefs() { saveJSON('church_ui_prefs', state.ui); }
function setUi(key, val) {
  state.ui[key] = val;
  saveUiPrefs();
  if (key === 'scale') applyUiScale();
  if (key === 'light' || key === 'highContrast' || key === 'boldText') applyUiTheme();
  if (key !== 'scale') renderTabInto('settings');
}

// ---- 4. Розмір інтерфейсу ----
function applyUiScale() {
  const s = (state.ui && state.ui.scale) || 100;
  const de = document.documentElement;
  if (de && de.style) de.style.fontSize = (s / 100 * 16) + 'px';
}

// ---- 5. Звуковий сигнал ----
function uiBeep() {
  if (!state.ui || !state.ui.sound) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

// ---- 6. Світла тема панелі ----
function applyUiTheme() {
  const light = state.ui && state.ui.light;
  document.body.classList.toggle('pv2-light', !!light);
  document.body.classList.toggle('pv2-contrast', !!(state.ui && state.ui.highContrast));
  document.body.classList.toggle('pv2-bold', !!(state.ui && state.ui.boldText));
}

// ---- 7. Автозапуск разом з Windows ----
function setAutoLaunch(on) {
  state.ui.autoLaunch = on;
  saveUiPrefs();
  if (window.electronAPI && window.electronAPI.setAutoLaunch) {
    window.electronAPI.setAutoLaunch(on).then(() => {
      notify(on ? '✓ Запускатиметься разом з Windows' : 'Автозапуск вимкнено');
    }).catch(() => notify('⚠️ Не вдалось змінити автозапуск'));
  }
  renderTabInto('settings');
}


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

function renderSettingsTab() {
  const ui = state.ui || {};
  const profiles = (state.profiles && state.profiles.list) || [];
  const profList = profiles.map((p, i) =>
    `<div style="display:flex;align-items:center;gap:4px;padding:4px 0;border-bottom:1px solid var(--border)">
       <span style="flex:1;font-size:12px">${state.profiles.active === p.name ? '● ' : ''}${esc(p.name)}
         <span style="color:var(--text2);font-size:12px">${p.date}</span></span>
       <button class="btn btn-primary btn-sm" onclick="applyProfile(${i})">Застосувати</button>
       <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteProfile(${i})">✕</button>
     </div>`).join('') || '<div style="font-size:11px;color:var(--text2)">Профілів ще немає</div>';

  return `
  <div class="grid2">
    <div class="card" style="border-color:var(--accent)">
      <div class="card-title">💾 Резервна копія всіх даних</div>
      <div class="card-sub">Один файл із усім: пісні, плани, теми, налаштування, PIN-и, прив'язки моніторів. Збережи його на флешку — якщо ПК зламається, відновиш усе за хвилину.</div>
      <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-success btn-sm" onclick="backupAll()">💾 Зберегти все у файл</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('restoreInput').click()">📥 Відновити з файлу</button>
        <input type="file" id="restoreInput" accept=".json" style="display:none" onchange="restoreAll(this)">
      </div>
    </div>

    <div class="card">
      <div class="card-title">👤 Профілі служб</div>
      <div class="card-sub">Ранкова, вечірня, молодіжна — у кожної свої теми, виходи, стилі. Перемкнув одним кліком.</div>
      <button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="saveProfile()">➕ Зберегти поточні як профіль</button>
      <div style="margin-top:8px">${profList}</div>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">🛡 Захист від помилок</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" ${ui.confirmDanger !== false ? 'checked' : ''} onchange="setUi('confirmDanger', this.checked)">
        Питати підтвердження перед очищенням ефіру й видаленням
      </label>
      <div class="card-sub" style="margin-top:4px">Радимо тримати увімкненим — щоб випадкове натискання посеред служби не зіпсувало вивід.</div>
    </div>

    <div class="card">
      <div class="card-title">🖥 Автозапуск</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" ${ui.autoLaunch ? 'checked' : ''} onchange="setAutoLaunch(this.checked)">
        Запускати разом з Windows
      </label>
      <div class="card-sub" style="margin-top:4px">Увімкнув ПК — програма вже відкрита й готова.</div>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">🔍 Вигляд панелі</div>
      <div style="font-size:12px;color:var(--text2)">Розмір інтерфейсу: <b id="uiScaleLabel">${ui.scale || 100}%</b></div>
      <input type="range" min="80" max="140" step="5" value="${ui.scale || 100}"
             oninput="document.getElementById('uiScaleLabel').textContent=this.value+'%'; setUi('scale', parseInt(this.value,10))" style="width:100%">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-top:8px">
        <input type="checkbox" ${ui.light ? 'checked' : ''} onchange="setUi('light', this.checked)">
        Світла тема панелі (для роботи вдень)
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-top:6px">
        <input type="checkbox" ${ui.highContrast ? 'checked' : ''} onchange="setUi('highContrast', this.checked)">
        <b>Високий контраст</b> (яскравіший текст — якщо погано видно)
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-top:6px">
        <input type="checkbox" ${ui.boldText ? 'checked' : ''} onchange="setUi('boldText', this.checked)">
        <b>Жирний шрифт</b> (товщий текст панелі)
      </label>
    </div>

    <div class="card">
      <div class="card-title">🔔 Звук</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" ${ui.sound ? 'checked' : ''} onchange="setUi('sound', this.checked)">
        Звуковий сигнал (пульт підключився, автостарт таймера)
      </label>
      <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="uiBeep()">🔔 Перевірити звук</button>
    </div>

    <div class="card" style="border-color:${state.trainingMode ? 'var(--red)' : 'var(--border)'}">
      <div class="card-title">🎓 Режим тренування</div>
      <div class="card-sub">Новий волонтер може практикуватись із усіма кнопками — прев'ю й «В ЕФІР» працюють як завжди, але <b>нічого не йде на реальний екран</b>. Вимикається завжди при перезапуску програми — не забудеш увімкненим.</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-top:8px">
        <input type="checkbox" ${state.trainingMode ? 'checked' : ''} onchange="setTrainingMode(this.checked)">
        <b>${state.trainingMode ? '🎓 Увімкнено — нічого не в ефірі' : 'Вимкнено — усе працює насправді'}</b>
      </label>
    </div>

    <div class="card">
      <div class="card-title">📜 Журнал змін налаштувань</div>
      <div class="card-sub">Що і коли змінилось — маршрути, хромакей, прив'язка моніторів, теми служіння. Корисно, коли щось «саме зламалось», а насправді хтось торкнувся.</div>
      <div style="max-height:220px;overflow-y:auto;margin-top:6px">
        ${(state.changeLog || []).length
          ? state.changeLog.slice(0, 50).map(e => `
            <div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:11px">
              <span style="color:var(--text2)">${new Date(e.t).toLocaleString('uk-UA')}</span> —
              <b>${esc(e.what)}</b>${e.detail ? ': ' + esc(e.detail) : ''}
            </div>`).join('')
          : '<div class="card-sub">Поки що порожньо.</div>'}
      </div>
      ${(state.changeLog || []).length ? '<button class="btn btn-ghost btn-sm" style="margin-top:6px;color:var(--red)" onclick="clearChangeLog()">🗑 Очистити журнал</button>' : ''}
    </div>

    <div class="card" style="border-color:var(--blue)">
      <div class="card-title">☁️ Хмарна синхронізація</div>
      <div class="card-sub">Папка Dropbox/Google Drive/OneDrive → пісні, теми, скорочення синхронізуються між ПК. Без інтернету — працює офлайн, при підключенні синхронізує автоматично.</div>
      <div style="font-size:11px;color:var(--text2);margin:6px 0">
        Папка: ${state.cloudSync.folder ? '<span style="color:var(--green)">✓ ' + esc(state.cloudSync.folder) + '</span>' : 'не вибрана'}
      </div>
      <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="pickCloudSyncFolder()">📁 Вибрати папку…</button>
        ${state.cloudSync.folder ? `
          <button class="btn btn-success btn-sm" onclick="syncLibraryToCloud()">⬆️ Синхронізувати в хмару</button>
          <button class="btn btn-ghost btn-sm" onclick="syncLibraryFromCloud()">⬇️ Завантажити з хмари</button>
        ` : ''}
      </div>
      ${state.cloudSync.lastSync ? `
        <div style="font-size:11px;color:var(--text2)">Остання синхронізація: ${state.cloudSync.lastSync}</div>
      ` : ''}
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-top:6px">
        <input type="checkbox" ${state.cloudSync.autoSync ? 'checked' : ''} onchange="setAutoCloudSync(this.checked)">
        Автоматична синхронізація (при відкритті програми)
      </label>
    </div>
  </div>`;
}


// ============================================================
// КЕРУВАННЯ ПІД ЧАС СЛУЖБИ
// ============================================================

// ---- 1. BLACKOUT — миттєвий чорний екран, з поверненням того самого ----
// Відрізняється від «Очистити»: запам'ятовує, що було, і повертає одним натисканням.
let _blackoutSaved = null;
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

// ---- 2. Центральна гучність (відео-фон + фонова музика разом) ----
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
function loadMasterVolume() {
  const m = loadJSON(STORAGE_KEYS.live + '_master');
  if (m && typeof m.v === 'number') state.masterVolume = m.v;
}
function duckAll() {
  // Швидко приглушити все перед молитвою (до 15%)
  setMasterVolume(15);
  const sl = $('#masterVol'); if (sl) sl.value = 15;
  notify('🔉 Приглушено (молитва)');
}

// ---- 3. Таймер проповіді (тільки для сцени/музикантів) ----
function sermonStart(minutes) {
  state.sermon = { running: true, startedAt: Date.now(), planned: (minutes || 30) * 60 };
  saveJSON(STORAGE_KEYS.live + '_sermon', state.sermon);
  if (!_sermonTick) _sermonTick = setInterval(sermonUpdate, 1000);
  renderTabInto('control');
  notify('📣 Таймер проповіді запущено: ' + (minutes || 30) + ' хв');
}
function sermonStop() {
  state.sermon = { running: false };
  clearInterval(_sermonTick); _sermonTick = null;
  if (window.electronAPI && window.electronAPI.sendStageTimer) window.electronAPI.sendStageTimer(null);
  renderTabInto('control');
  notify('⏹ Таймер проповіді зупинено');
}
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
function addBookmark() {
  const c = state.onAir;
  if (!c) { notify('⚠️ Немає що додати — спершу виведи щось у зал'); return; }
  const label = c.ref || c.label || (c.rawText ? String(c.rawText).slice(0, 30) : 'Слайд');
  state.bookmarks = state.bookmarks || [];
  state.bookmarks.unshift({ kind: c.kind, rawText: c.rawText, html: c.html, ref: c.ref, label: label, at: Date.now() });
  if (state.bookmarks.length > 30) state.bookmarks.pop();
  saveJSON(STORAGE_KEYS.live + '_bookmarks', state.bookmarks);
  renderTabInto('control');
  notify('⭐ У закладки: ' + label);
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
  renderTabInto('control');
}

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
      renderTabInto('control');
    });
    return;
  }
  if (a === 'look') {
    const list = (state.looks && state.looks.list) || [];
    if (!list.length) { notify('Спершу збережи хоч один Look (вкладка «Виходи»)'); return; }
    pv2Prompt('Номер Look (' + list.map((l, i) => (i + 1) + '=' + l.name).join(', ') + '):', '1', function(pick) {
      if (pick === null) return;
      state.macroDraft.steps.push({ a: a, v: Math.max(0, (parseInt(pick, 10) || 1) - 1) });
      renderTabInto('control');
    });
    return;
  }
  state.macroDraft.steps.push({ a: a, v: null });
  renderTabInto('control');
}
function macroDraftRemove(pos) {
  if (!state.macroDraft) return;
  state.macroDraft.steps.splice(pos, 1);
  renderTabInto('control');
}
function saveMacroDraft() {
  const d = state.macroDraft;
  if (!d || !d.steps.length) { notify('Додай хоч одну дію'); return; }
  const name = (d.name || '').trim() || ('Макрос ' + (state.macros.length + 1));
  state.macros.push({ name: name, steps: d.steps.slice() });
  saveMacros();
  state.macroDraft = { name: '', steps: [] };
  renderTabInto('control');
  notify('⚡ Макрос «' + name + '» збережено');
}
function deleteMacro(i) {
  if (!state.macros[i]) return;
  if (!confirm('Видалити макрос «' + state.macros[i].name + '»?')) return;
  state.macros.splice(i, 1);
  saveMacros();
  renderTabInto('control');
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
function renderMultiviewTab() {
  const outputs = [
    { num: 1, kind: 'projector', label: 'Проектор (Вихід 1)', bg: '#1a1a2e' },
    { num: 2, kind: 'stream', label: 'Трансляція (Вихід 2)', bg: '#0d1b2e' },
    { num: 3, kind: 'out3', label: 'Вихід 3', bg: '#1a2e2e' },
    { num: 4, kind: 'out4', label: 'Вихід 4', bg: '#2e1a1a' }
  ];

  const cards = outputs.map(o => {
    const win = state.outputStatus && state.outputStatus[o.kind];
    const status = win ? (win.content ? '✓ ' + win.content.slice(0, 30) : '⚫ Чорний екран') : '❌ Не відкрито';
    const color = !win ? 'var(--red)' : (win.content ? 'var(--green)' : 'var(--orange)');
    return `
      <div style="display:flex;flex-direction:column;height:100%;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:${o.bg}">
        <div style="padding:6px;border-bottom:1px solid var(--border);background:var(--panel2)">
          <div style="font-size:12px;color:var(--text);font-weight:bold">${o.label}</div>
          <div style="font-size:10px;color:${color};margin-top:2px">${status}</div>
        </div>
        <div style="flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center">
          <iframe id="mv-frame-${o.num}" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;background:${o.bg}" 
                  onload="updateMultiviewFrame(${o.num})"></iframe>
          <div style="position:absolute;z-index:1;text-align:center;opacity:0.7">
            <div style="font-size:48px">🎬</div>
            <div style="font-size:11px;color:var(--text2)">завантаження…</div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;height:calc(100vh - 140px);padding:8px">
    ${cards}
  </div>
  
  <div style="position:fixed;bottom:12px;right:12px;font-size:11px;color:var(--text2)">
    Оновлюється в реальному часі • F5 для повного оновлення
  </div>`;
}

let _multiviewUpdateTimer = null;
function updateMultiviewFrame(num) {
  const kinds = ['projector', 'stream', 'out3', 'out4'];
  const kind = kinds[num - 1];
  const f = document.getElementById('mv-frame-' + num);
  if (!f) return;
  
  // Генеруємо простий HTML для кожного виходу — показуємо тільки то, що зараз у ефірі
  const c = state.onAir || {};
  const content = c.label || '';
  const ref = c.ref || '';
  const html = c.html || '';
  
  const previewHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin:0; padding:20px; background:#111; color:#fff; font-family:Arial,sans-serif; overflow:hidden; }
    .preview { text-align:center; font-size:20px; }
    .label { color:#aaa; margin:10px 0; }
    .ref { color:#888; font-size:14px; }
  </style>
</head>
<body>
  <div class="preview">
    <div style="font-size:24px;margin:20px 0">${content ? esc(content) : '(порожньо)'}</div>
    ${ref ? '<div class="ref">' + esc(ref) + '</div>' : ''}
    ${html ? '<div style="margin-top:20px;border:1px solid #333;padding:10px;border-radius:4px;background:#1a1a1a">' + html.slice(0, 200) + '…</div>' : ''}
  </div>
</body>
</html>`;
  f.srcdoc = previewHtml;
}
function updateMultiviewFrames() {
  // Оновлюємо всі 4 фрейми в режимі реального часу
  for (let i = 1; i <= 4; i++) {
    if (typeof updateMultiviewFrame === 'function') updateMultiviewFrame(i);
  }
}

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
function addSchedule() {
  state.scheduler.items.push({ weekday: 0, time: '09:30', profile: '', on: true });
  saveScheduler(); renderTabInto('automation');
}
function setSchedule(i, key, val) {
  if (!state.scheduler.items[i]) return;
  state.scheduler.items[i][key] = val;
  saveScheduler();
  if (key !== 'time' && key !== 'weekday') renderTabInto('automation');
}
function removeSchedule(i) { state.scheduler.items.splice(i, 1); saveScheduler(); renderTabInto('automation'); }

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
function setAutoBackup(key, val) {
  state.autoBackup[key] = val;
  saveJSON('church_autobackup', state.autoBackup);
  renderTabInto('automation');
  if (key === 'on' && val) maybeAutoBackup(true);
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
function restoreSong(i) {
  const t = (state.songTrash || [])[i];
  if (!t) return;
  if (typeof currentSongs !== 'undefined' && Array.isArray(currentSongs)) {
    currentSongs.push(t.song);
    // БУВ виклик saveSongs() без аргументу: saveSongs(songs) робить
    // JSON.stringify(songs), а bigStoreSet трактує undefined як '' —
    // церковна база пісень (church_songs_db) записувалась ПОРОЖНЬОЮ.
    // Сама сесія працювала б далі нормально (currentSongs у пам'яті вже
    // мав пісню), але наступний запуск програми (loadSongs) бачив би
    // порожній рядок, вважав би, що збереженого нема, і тихо скидав усю
    // базу до кількох вбудованих пісень за замовчуванням — щойно
    // оператор відновив пісню з кошика й закрив програму без жодної
    // іншої зміни.
    if (typeof saveSongs === 'function') saveSongs(currentSongs);
    if (typeof renderAllSongs === 'function') renderAllSongs();
  }
  state.songTrash.splice(i, 1);
  saveJSON('church_song_trash', state.songTrash);
  renderTabInto('automation');
  notify('↩ Пісню «' + (t.song.title || '') + '» відновлено');
}
function emptyTrash() {
  if (!confirm('Очистити кошик остаточно?')) return;
  state.songTrash = [];
  saveJSON('church_song_trash', state.songTrash);
  renderTabInto('automation');
}

// ---- Мова інтерфейсу (UA / CZ / EN) ----
const I18N = {
  ua: { name: 'Українська', settings: 'Налаштування', control: 'Керування', clear: 'Очистити', blackout: 'Чорний екран' },
  cz: { name: 'Čeština', settings: 'Nastavení', control: 'Ovládání', clear: 'Vymazat', blackout: 'Černá obrazovka' },
  en: { name: 'English', settings: 'Settings', control: 'Control', clear: 'Clear', blackout: 'Blackout' }
};
function loadLang() { state.lang = (loadJSON('church_lang') || {}).code || 'ua'; }
function setLang(code) {
  state.lang = code;
  saveJSON('church_lang', { code: code });
  notify(I18N[code] ? I18N[code].name : code);
  renderTabInto('automation');
  // повний переклад усіх вкладок — після перезапуску (щоб перебудувати мітки)
  if (confirm('Мову змінено. Перезапустити зараз?')) location.reload();
}
function t(key) {
  const L = I18N[state.lang || 'ua'] || I18N.ua;
  return L[key] || I18N.ua[key] || key;
}

// ---- Вкладка «Автоматизація» ----
function renderAutomationTab() {
  const days = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
  const profiles = (state.profiles && state.profiles.list) || [];
  const sched = (state.scheduler && state.scheduler.items) || [];
  const ab = state.autoBackup || {};
  const trash = state.songTrash || [];

  const schedRows = sched.map((it, i) => {
    const profOpts = ['<option value="">— профіль —</option>'].concat(
      profiles.map(p => `<option value="${esc(p.name)}" ${it.profile === p.name ? 'selected' : ''}>${esc(p.name)}</option>`)).join('');
    const dayOpts = days.map((d, di) => `<option value="${di}" ${it.weekday === di ? 'selected' : ''}>${d}</option>`).join('');
    return `<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
      <input type="checkbox" ${it.on ? 'checked' : ''} onchange="setSchedule(${i},'on',this.checked)">
      <select onchange="setSchedule(${i},'weekday',parseInt(this.value,10))" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px">${dayOpts}</select>
      <input type="time" value="${it.time}" onchange="setSchedule(${i},'time',this.value)" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px">
      <select onchange="setSchedule(${i},'profile',this.value)" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px">${profOpts}</select>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="removeSchedule(${i})">✕</button>
    </div>`;
  }).join('') || '<div style="font-size:11px;color:var(--text2)">Розкладів немає</div>';

  const trashRows = trash.map((tr, i) =>
    `<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--border)">
       <span style="flex:1;font-size:11px">${esc(tr.song.title || 'Без назви')}</span>
       <button class="btn btn-success btn-sm" onclick="restoreSong(${i})">↩ Відновити</button>
     </div>`).join('') || '<div style="font-size:11px;color:var(--text2)">Кошик порожній</div>';

  const langBtn = (c) => `<button class="btn ${(state.lang||'ua')===c?'btn-primary':'btn-ghost'} btn-sm" onclick="setLang('${c}')">${I18N[c].name}</button>`;

  return `
  <div class="card" style="border-color:var(--accent)">
    <div class="card-title">📅 Автозапуск профілю за розкладом</div>
    <div class="card-sub">Напр.: щонеділі о 9:30 — профіль «Ранкова». Профілі створюються у вкладці «Налаштування».</div>
    <div style="margin-top:8px">${schedRows}</div>
    <button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="addSchedule()">➕ Додати розклад</button>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">💾 Автобекап за розкладом</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" ${ab.on ? 'checked' : ''} onchange="setAutoBackup('on',this.checked)">
        Автоматично зберігати копію
      </label>
      <div style="font-size:12px;color:var(--text2);margin-top:6px">Кожні <b>${ab.everyDays || 7}</b> днів</div>
      <input type="range" min="1" max="30" value="${ab.everyDays || 7}" onchange="setAutoBackup('everyDays',parseInt(this.value,10))" style="width:100%">
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:4px" onclick="window.electronAPI&&window.electronAPI.openBackupFolder&&window.electronAPI.openBackupFolder()">📂 Відкрити теку бекапів</button>
      ${ab.last ? `<div style="font-size:12px;color:var(--text2);margin-top:4px">Останній: ${new Date(ab.last).toLocaleDateString('uk-UA')}</div>` : ''}
    </div>

    <div class="card">
      <div class="card-title">🌐 Мова панелі</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${langBtn('ua')} ${langBtn('cz')} ${langBtn('en')}</div>
      <div class="card-sub" style="margin-top:4px">Вивід у зал лишається двомовним окремо. Це — мова самої панелі керування.</div>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">🗑 Кошик пісень (${trash.length})</div>
      <div class="card-sub">Видалені пісні зберігаються тут — можна відновити.</div>
      <div style="max-height:180px;overflow-y:auto;margin-top:6px">${trashRows}</div>
      ${trash.length ? '<button class="btn btn-ghost btn-sm btn-block" style="margin-top:4px;color:var(--red)" onclick="emptyTrash()">Очистити кошик</button>' : ''}
    </div>

    <div class="card">
      <div class="card-title">🔌 Stream Deck / Companion</div>
      <div class="card-sub">Увімкни «Пульт» у вкладці «Станції» — і HTTP-команди стануть доступні:</div>
      <div style="font-family:monospace;font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;margin-top:6px;color:var(--text2)">
        http://[IP]:3939/api/next<br>
        http://[IP]:3939/api/blackout<br>
        http://[IP]:3939/api/go-live<br>
        <span style="color:var(--text2)">…prev, clear, undo, lower, freeze</span>
      </div>
      <div class="card-sub" style="margin-top:6px"><b>Конкретна кнопка на конкретну дію</b> — не «далі», а саме ЦЯ закладка/пункт/оголошення:</div>
      <div style="font-family:monospace;font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;margin-top:4px;color:var(--text2)">
        …/api/bookmark?idx=0 <span style="opacity:.7">— перша закладка (номер із вкладки «Ефір»)</span><br>
        …/api/plan-item?idx=2 <span style="opacity:.7">— третій пункт плану служби</span><br>
        …/api/announce?id=169... <span style="opacity:.7">— конкретне оголошення (натисни 📋 біля нього у вкладці «Оголошення», щоб скопіювати готове посилання)</span>
      </div>
      <div class="card-sub" style="margin-top:4px">У Bitfocus Companion додай Generic HTTP і встав ці адреси на кнопки.</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">📋 Лог помилок</div>
    <div class="card-sub">Якщо щось піде не так на церковному ПК — тут технічні деталі для діагностики.</div>
    <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="window.electronAPI&&window.electronAPI.openLogFolder&&window.electronAPI.openLogFolder()">📂 Відкрити лог</button>
      <button class="btn btn-ghost btn-sm" onclick="if(window.electronAPI&&window.electronAPI.clearLog){window.electronAPI.clearLog();notify('Лог очищено')}">Очистити лог</button>
    </div>
  </div>`;
}

// ---- Вкладка «Станції» ----

// ---- Пульт з телефону (перенесено зі старої вкладки «📱 Пульт») ----
function stationsStartPult() {
  if (!window.electronAPI || !window.electronAPI.startRemote) return;
  const pin = ($('#stationsPultPin') && $('#stationsPultPin').value.trim()) || '';
  window.electronAPI.startRemote(pin, state.remoteUsers || []).then(res => {
    state.pult = { on: true, url: 'http://' + res.ip + ':' + res.port, pin: pin };
    saveJSON('church_pult_cfg', state.pult);
    renderTabInto('stations');
    notify('📱 Пульт запущено: ' + state.pult.url + (pin ? ' (PIN ' + pin + ')' : ''));
  }).catch(() => notify('⚠️ Не вдалось запустити пульт'));
}
function stationsStopPult() {
  if (!window.electronAPI || !window.electronAPI.stopRemote) return;
  window.electronAPI.stopRemote().then(() => {
    state.pult = { on: false, url: '', pin: '' };
    saveJSON('church_pult_cfg', state.pult);
    renderTabInto('stations');
    notify('Пульт зупинено');
  }).catch(() => {});
}
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
         <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px;color:var(--red)" onclick="stationsStopPult()">Зупинити пульт</button>`
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

function renderStationsTab() {
  const s = state.station;
  const isHost = s.mode === 'host';
  const isClient = s.mode === 'client';

  return `
  <div class="card">
    <div class="card-title">👥 Робота командою</div>
    <div class="card-sub">
      <b>Хост</b> — ПК біля проектора, лише він виводить на екрани.
      <b>Клієнт</b> — другий ПК: повна панель, але його відправки йдуть на хост.
      Телефони й планшети підключаються як <b>пульт</b> — налаштування нижче.
    </div>
    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      <button class="btn ${isHost ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="startHost()">🖥 Я — хост (біля проектора)</button>
      <button class="btn ${isClient ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setStationMode('client')">💻 Я — друга панель</button>
      ${isHost ? '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="stopHost()">Зупинити хост</button>' : ''}
      ${isClient ? '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="disconnectStation()">Відключитись</button>' : ''}
    </div>
  </div>

  ${isHost ? `
  <div class="grid2">
    <div class="card">
      <div class="card-title">📡 Адреса для інших</div>
      <div style="font-size:18px;font-weight:700;color:var(--accent);font-family:monospace">${esc(s.ip || '...')}</div>
      <div class="card-sub">Порт ${STATION_PORT}. Введи цю адресу на другому ПК.</div>
      <div style="font-size:12px;color:var(--text2);margin-top:8px">Пароль (необов'язково)</div>
      <div style="display:flex;gap:4px">
        <input id="stationPin" type="text" value="${esc(s.pin || '')}" placeholder="напр. 1234"
               style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">
        <button class="btn btn-primary btn-sm" onclick="startHost()">Застосувати</button>
      </div>
      <div class="card-sub">Без пароля підключиться будь-хто з церковного Wi-Fi.</div>
    </div>
    <div class="card">
      <div class="card-title">🟢 Підключені станції</div>
      <div id="stationClientsList"><div style="font-size:11px;color:var(--text2)">Ніхто ще не підключився</div></div>
    </div>
  </div>` : ''}

  ${isClient ? `
  <div class="card">
    <div class="card-title">💻 Підключення до хоста</div>
    <div style="font-size:12px;color:var(--text2)">IP хоста</div>
    <input id="stationIp" type="text" value="${esc(s.ip || '')}" placeholder="192.168.1.5"
           style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none;margin-bottom:6px">
    <div style="display:flex;gap:6px">
      <div style="flex:1">
        <div style="font-size:12px;color:var(--text2)">Пароль (якщо є)</div>
        <input id="stationPinClient" type="text" value="${esc(s.pin || '')}"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">
      </div>
      <div style="flex:1">
        <div style="font-size:12px;color:var(--text2)">Назва станції</div>
        <input id="stationName" type="text" value="${esc(s.name || 'Панель 2')}"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">
      </div>
    </div>
    <button class="btn btn-success btn-block btn-sm" style="margin-top:8px" onclick="connectStation()">🔗 Підключитись</button>
    <div style="margin-top:8px;font-size:11px;color:${s.connected ? 'var(--green)' : 'var(--red)'}">
      ${s.connected ? '✓ Підключено — усі твої відправки йдуть на хост' : '✗ Не підключено'}
    </div>
    <div id="stationHostState" style="font-size:11px;color:var(--text2);margin-top:4px"></div>
  </div>` : ''}

  <div class="card">
    <div class="card-title">📱 Телефони й планшети</div>
    <div class="card-sub">Вмикаються у вкладці «Пульт» — там адреса і QR-код. Кількість не обмежена: усі бачать спільний стан і можуть гортати куплети.</div>
  </div>
  ${renderPultCard()}
  `;
}

function setStationMode(mode) {
  state.station.mode = mode;
  saveStationCfg();
  renderTabInto('stations');
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
const MT_STYLE_DEFAULT = { fontScale: 100, vAlign: 'center', hAlign: 'center' };
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
      if (text) out.push({ name: getTranslationName(id), text: text });
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
  refreshMultiTransCard();
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
  const box = document.getElementById('multiTransBox');
  if (box) { box.innerHTML = renderMultiTransCard(); return true; }
  return false;
}

function renderMultiTransCard() {
  let langs = [];
  try { langs = bibleTranslationsList(); } catch (e) {}
  const opts = (sel) => ['<option value="">— немає —</option>']
    .concat(langs.map(t => `<option value="${t.id}"${sel === t.id ? ' selected' : ''}>${esc(t.name)}</option>`)).join('');
  const rows = [1, 2].map(n => {
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
        <select onchange="setMultiTransStyle(${n},'vAlign',this.value)" title="Розташування по вертикалі" style="${selStyle}">
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
      <button class="btn btn-success btn-sm btn-block" style="margin-top:4px" onclick="sendMultiToOutput(${n})">📖 Показати на «${esc(OUT_NAME[n])}»</button>
    </div>`;
  }).join('');
  return `
  <div class="card">
    <div class="card-title">📖 Кілька перекладів — окремо на кожен екран</div>
    <div class="card-sub">Проектор і трансляція можуть показувати різні переклади того самого вірша, з окремим розміром шрифту й розташуванням для кожного. Вірш береться з вкладки «Біблія», стрілки гортають обидва екрани.</div>
    <div style="margin-top:8px">${rows}</div>
    <button class="btn btn-primary btn-sm btn-block" onclick="sendMultiToBoth()">📖 Показати на обох</button>
    <button class="btn btn-ghost btn-sm btn-block" onclick="sendMultiToAll4()">📖 Показати на всіх 4</button>
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
    renderTabInto('router');
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
  renderTabInto('router');
  notify('🗑 Профіль видалено');
}
function loadRoomProfiles() {
  const r = loadJSON(STORAGE_KEYS.live + '_rooms');
  if (Array.isArray(r)) state.roomProfiles = r;
}

// ---- Пресети сцени: на відміну від «Профілю» (один вихід за раз),
// зберігає й застосовує режим+хромакей+фон одразу для ВСІХ 4 виходів
// одним кліком — напр. «Служба з графікою» перемикає весь набір екранів
// разом, а не по одному. Прив'язку монітора зберігаємо як fingerprint
// (state.outputBind), а не старий displayId-індекс — так само, як уже
// робить bindOutputToDisplay() у вкладці «Прив'язка екранів».
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
        fingerprint: (state.outputBind && state.outputBind[OUT_KIND[n]]) || null
      };
    }
    state.scenePresets.push({ id: 'scene_' + Date.now(), name: name, outputs: outputs });
    saveJSON(STORAGE_KEYS.scenePresets, state.scenePresets);
    renderTabInto('router');
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
  renderTabInto('router');
  notify('🎬 Сцена «' + p.name + '» застосована на всі 4 виходи');
}
function deleteScenePreset(id) {
  const p = (state.scenePresets || []).find(x => x.id === id);
  if (!p || !confirm('Видалити сцену «' + p.name + '»?')) return;
  state.scenePresets = state.scenePresets.filter(x => x.id !== id);
  saveJSON(STORAGE_KEYS.scenePresets, state.scenePresets);
  renderTabInto('router');
  notify('🗑 Сцену видалено');
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
    renderTabInto('router');
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
function setTrainingMode(on) {
  state.trainingMode = !!on;
  saveJSON(STORAGE_KEYS.live + '_training', state.trainingMode);
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();
  notify(on ? '🎓 Режим тренування увімкнено — нічого не піде на екран' : '✓ Режим тренування вимкнено — вивід знову справжній');
}
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
    renderTabInto('live');
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
  renderTabInto('live');
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
function clearChangeLog() {
  if (!confirm('Очистити весь журнал змін?')) return;
  state.changeLog = [];
  saveJSON(STORAGE_KEYS.live + '_changelog', []);
  renderTabInto('settings');
  notify('🗑 Журнал очищено');
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
    renderTabInto('router');
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
  renderTabInto('router');
  notify('🎬 Пресет «' + lk.name + '» застосовано');
}

function deleteLook(i) {
  const lk = state.looks.list[i];
  if (!lk || !confirm('Видалити пресет «' + lk.name + '»?')) return;
  state.looks.list.splice(i, 1);
  saveLooks();
  renderTabInto('router');
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

function renderRouterTab() {
  let rows = '';
  for (let i = 1; i <= 4; i++) {
    const route = state.outputRoutes[i] || 'mirror';
    const opts = Object.keys(ROUTE_LABELS).map(k =>
      `<option value="${k}"${k === route ? ' selected' : ''}>${ROUTE_LABELS[k]}</option>`).join('');
    const liveNow = (route === 'mirror')
      ? (state.onAir ? (state.onAir.label || state.onAir.ref || 'Щось в ефірі') : '⬛ Порожньо')
      : (state.outputLive && state.outputLive[i]) || ROUTE_LABELS[route] || '—';
    rows += `<div class="card" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span id="pv2Dot${i}" style="color:var(--text2)">●</span>
        <input id="pv2Name${i}" value="${esc(OUT_NAME[i])}" maxlength="24"
               onkeydown="if(event.key==='Enter'){setOutputName(${i},this.value);this.blur();}"
               onblur="setOutputName(${i},this.value)"
               style="font-size:13px;font-weight:700;background:transparent;border:1px solid transparent;border-radius:4px;padding:2px 4px;color:var(--text);width:130px;outline:none"
               onfocus="this.style.borderColor='var(--border)'" title="Клікни, щоб перейменувати">
        <button class="btn btn-success btn-sm" onclick="pv2OpenOutput(${i})">Відкрити</button>
        <button class="btn btn-ghost btn-sm" onclick="pv2CloseOutput(${i})">Закрити</button>
        <button class="btn btn-ghost btn-sm" onclick="pv2ClearOutput(${i})">🚫 Очистити</button>
        <button class="btn btn-primary btn-sm" onclick="pv2ForceRefresh(${i})">▶ Оновити зараз</button>
      </div>
      <div style="font-size:11px;color:var(--text2);margin:-4px 0 6px 2px">Зараз: <span id="pv2Live${i}">${esc(liveNow)}</span></div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text2);min-width:56px">Показує:</span>
        <select onchange="setOutputRoute(${i}, this.value)"
                style="flex:1;min-width:200px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:11px;outline:none">${opts}</select>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">Хромакей:</span>
        <span id="pv2ChromaSw${i}" style="width:16px;height:16px;border-radius:3px;border:1px solid var(--border);display:inline-block;background:${state.outputChroma[i] === 'none' ? 'transparent' : state.outputChroma[i]}"></span>
        <input id="pv2Chroma${i}" type="text" placeholder="вимкнено" maxlength="7" value="${state.outputChroma[i] === 'none' ? '' : state.outputChroma[i]}"
               style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text);font-size:11px;font-family:monospace;outline:none"
               onkeydown="if(event.key==='Enter')pv2ApplyChromaInput(${i})">
        <button class="btn btn-primary btn-sm" onclick="pv2ApplyChromaInput(${i})">Застосувати</button>
        <button class="preset-btn" onclick="pv2SetChroma(${i},'#00ff00')">🟩 Зелений</button>
        <button class="preset-btn" onclick="pv2SetChroma(${i},'#0000ff')">🟦 Синій</button>
        <button class="preset-btn" onclick="pv2SetChroma(${i},'#ff00ff')">🟪 Мадж.</button>
        <button class="preset-btn" style="color:var(--red)" onclick="pv2SetChroma(${i},'none')">Вимкнути</button>
      </div>
      ${state.outputChroma[i] && state.outputChroma[i] !== 'none' ? `
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">Прозорість:</span>
        <span style="font-size:11px;color:var(--text2)" id="pv2OpacityLbl${i}">${(state.graphicsSettings && state.graphicsSettings.outputOpacity && state.graphicsSettings.outputOpacity[i]) || 62}%</span>
        <input type="range" min="0" max="100" value="${(state.graphicsSettings && state.graphicsSettings.outputOpacity && state.graphicsSettings.outputOpacity[i]) || 62}"
               oninput="document.getElementById('pv2OpacityLbl${i}').textContent=this.value+'%'"
               onchange="setOutputOpacity(${i}, this.value)" style="flex:1;min-width:120px">
      </div>` : ''}
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">🏠 Профіль:</span>
        <select id="pv2RoomSel${i}" style="flex:1;min-width:140px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:11px;outline:none">
          <option value="">— обрати —</option>
          ${(state.roomProfiles || []).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="var v=document.getElementById('pv2RoomSel${i}').value; if(v) applyRoomProfile(${i}, v)">Застосувати</button>
        <button class="btn btn-ghost btn-sm" onclick="saveRoomProfile(${i})">💾 Зберегти поточний</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="var v=document.getElementById('pv2RoomSel${i}').value; if(v) deleteRoomProfile(v)">🗑</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <button class="btn ${state.stageOutputNum === i ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setStageOutputNum(${i})">
          🎤 ${state.stageOutputNum === i ? 'Це екран сцени — таймер тут' : 'Позначити екраном сцени'}
        </button>
        <span style="font-size:11px;color:var(--text2)">Таймер проповіді накладається поверх того, що вихід і так показує.</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">Фон (код):</span>
        <span id="pv2BgSwatchR${i}" style="width:16px;height:16px;border-radius:3px;border:1px solid var(--border);display:inline-block;background:#000"></span>
        <input id="pv2BgCode${i}" type="text" placeholder="#00ff00" maxlength="7"
               style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text);font-size:11px;font-family:monospace;outline:none"
               onkeydown="if(event.key==='Enter')pv2ApplyOutputBg(${i})">
        <button class="btn btn-primary btn-sm" onclick="pv2ApplyOutputBg(${i})">Застосувати</button>
        <button class="preset-btn" onclick="pv2SetBgCode(${i},'#000000')">Чорний</button>
        <button class="preset-btn" onclick="pv2SetBgCode(${i},'#00ff00')">Хромакей</button>
        <button class="preset-btn" onclick="pv2SetBgCode(${i},'#0000ff')">Синій</button>
        <button class="preset-btn" style="color:var(--red)" onclick="pv2SetBgCode(${i},'')">Скинути</button>
      </div>
    </div>`;
  }
  const targets = ['all', 1, 2, 3, 4].map(t => {
    const active = state.sendTarget === t;
    const label = t === 'all' ? 'Усі' : OUT_NAME[t];
    return `
<button id="pv2Target${t}" class="btn ${active ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setSendTarget(${t === 'all' ? "'all'" : t})">${label}</button>`;
  }).join(' ');

  return `<div class="card-title">🔀 Чотири виходи — різний контент на кожен екран</div>
    ${renderLooksCard()}
    <div class="card" style="margin-bottom:10px">
      <div class="card-title">🎬 Пресети сцени</div>
      <div class="card-sub">Один клік — і режим показу, хромакей та фон застосовуються одразу на всі 4 виходи. Зручно перемикатись між типами зібрань (напр. «Служба з графікою» ↔ «Репетиція»).</div>
      ${(state.scenePresets || []).length
        ? '<div style="margin-top:6px">' + state.scenePresets.map(p =>
            `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
              <span style="flex:1;font-size:13px">${esc(p.name)}</span>
              <button class="btn btn-primary btn-sm" onclick="applyScenePreset('${p.id}')">▶ Застосувати</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteScenePreset('${p.id}')">✕</button>
            </div>`).join('') + '</div>'
        : '<div style="font-size:11px;color:var(--text2);margin-top:6px">Збережених сцен ще немає — нижче зафіксуй поточне налаштування всіх 4 виходів як сцену.</div>'}
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:8px" onclick="saveScenePreset()">💾 Зберегти поточну сцену (усі 4 виходи)</button>
    </div>
    <div class="card" style="margin-bottom:10px;border-color:var(--accent)">
      <div class="card-title">🎯 Куди надсилати: <span id="pv2TargetBadge" style="color:var(--accent)">${state.sendTarget === 'all' ? 'усі екрани' : OUT_NAME[state.sendTarget]}</span></div>
      <div class="card-sub">Обери один екран — і кнопки «Надіслати» з вкладок Пісні / Біблія / Оголошення підуть <b>лише туди</b>. Інші екрани залишать те, що на них зараз. Повернись на «Усі», щоб знову вести всі разом.</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${targets}</div>
    </div>
    <div class="card-sub" style="margin-bottom:10px">Приклад: <b>Проектор</b> — дзеркало для залу, <b>Трансляція</b> — графіка з хромакеєм <code>#00ff00</code>, <b>Вихід 3</b> — наступний куплет для співаків, <b>Вихід 4</b> — таймер для проповідника.</div>
    ${rows}
    <div class="card" style="${state.sendTarget === 'all' ? '' : 'border-color:var(--red)'}">
      <div class="card-title">🔗 Синхронізація екранів</div>
      ${state.sendTarget === 'all'
        ? '<div style="font-size:12px;color:var(--green)">✓ Увімкнена — усе, що надсилаєш, іде на <b>всі відкриті екрани</b>, і гортання оновлює їх разом.</div>'
        : '<div style="font-size:12px;color:var(--red)"><b>⚠️ Вимкнена!</b> Зараз надсилання йде лише на <b>' + esc(OUT_NAME[state.sendTarget] || '') + '</b> — інші екрани не оновлюються.</div>'}
      <button class="btn ${state.sendTarget === 'all' ? 'btn-ghost' : 'btn-primary'} btn-sm btn-block" style="margin-top:6px"
              onclick="syncAllOutputs()">🔗 Синхронізувати всі екрани</button>
    </div>

    <div class="card"><div class="card-title">Швидкі дії</div>
      <button class="btn btn-primary btn-sm" onclick="pv2OpenOutput(1);pv2OpenOutput(2)">⚡ Відкрити проектор + трансляцію</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) setOutputRoute(i,'mirror')">Усі → дзеркало</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) pv2ClearOutput(i)">🚫 Очистити всі</button>
      <button class="btn btn-ghost btn-sm" onclick="pv2SyncOutputStates()">↻ Оновити статуси</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) pv2SetChroma(i,'#00ff00')">🟩 Хромакей на всі</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) pv2SetChroma(i,'none')">Вимкнути хромакей скрізь</button>
    </div>`;
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
  }
});

// ---- Ініціалізація: додаємо вкладки в інтерфейс додатку ----

function initOutputWarningListener() {
  if (window.electronAPI && window.electronAPI.onOutputWarning) {
    window.electronAPI.onOutputWarning(d => notify('⚠️ ' + (d && d.message ? d.message : 'Проблема з виводом')));
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
    ['live', '🔴 Ефір'], ['control', '🎬 Керування'], ['service', '📅 План служби'],
    ['layers', '🎬 Шари'], ['timer', '⏱ Таймер']
  ] },
  { id: 'g_content', label: '📖 Контент', tabs: [
    ['songs', '🎵 Пісні'], ['addsong', '➕ Додати пісню'], ['song', '🎵 Пісня'],
    ['bible', '📖 Біблія'], ['announce', '📢 Оголошення'], ['present', '📽 PDF'],
    ['slidebuilder', '🖼 Редактор слайдів'], ['powerpoint', '🖨 PowerPoint'],
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
    ['stream', '📡 Трансляція'], ['stagedisplay', '🖥 Stage'], ['ptz', '🎥 Камери']
  ] },
  { id: 'g_settings', label: '⚙️ Налаштування', tabs: [
    ['settings', '⚙️ Загальні'], ['automation', '🔌 Автоматизація'], ['stations', '👥 Станції'],
    ['hotkeys', '⌨️ Клавіші'], ['statistics', '📊 Статистика'], ['extras', '🌐 Мова/OBS'],
    ['atem', '🎬 ATEM'], ['importdata', '📥 Імпорт даних']
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
    b.textContent = g.label;
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
    b.textContent = label;
    b.onclick = () => showTab(id);
    subbar.appendChild(b);
  });
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
                 loadSplitCfg, loadOrders, loadArrangeGlobal, loadSongSize, loadSongTags, loadService, loadLayers, applyTypo, initObsListener, loadRoutes, loadOutputBg, loadOutputChroma, loadLooks, loadProps, loadMacros, loadPartLabels, loadArrangeSets, loadMsgTemplates, loadSoundBin, loadGraphicsSettings, loadAnnounceSettings, renderServicePlanEmbed, pv2SyncOutputStates, pv2RenderOutputsCard, loadPlaylistData, loadHotkeys, loadMidiMap, initMidi, loadOscMap, getCloudSyncFolder, loadStatistics, restoreFontChoice, loadStageNotes,
                 renderPlaylist, renderHotkeys, renderFontsList,
                 renderMediaList, updateH2RPreview, updateGraphicsPreview, updateTextPreview,
                 () => setPPTtemplate('classic'), updateStatistics,
                 updateLivePanels, applyDisplayCfg, initDisplayControlListener, initRemoteListener, initLogoListener, initDisplaysListener, initUpdateListener];
  steps.forEach(fn => { try { fn(); } catch(e) { console.error('extras init', e); } });

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

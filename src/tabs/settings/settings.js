// ============================================================
// ВКЛАДКА «⚙️ Налаштування» (settings) — профілі налаштувань (застосувати/
// зберегти/видалити), бекап/відновлення всього, перевірка оновлень,
// preflight-перевірка, показ назви пісні/перекладу, автозапуск, звуковий
// сигнал, режим тренування, журнал змін, синхронізація бібліотеки з
// хмарною папкою.
//
// Зібрано з ТРЬОХ файлів: показ назви/хмарна синхронізація —
// з src/extras-1.js; перевірка оновлень/preflight — з src/extras-2.js;
// решта (профілі/бекап/сама вкладка) — з src/extras-4.js. Об'єднано тут,
// бо це одна вкладка (той самий підхід, що вже був для text_control.js/
// captions.js/extras_lang_obs.js).
//
// Продовження модуляризації (typo.js → ... → service_planner.js/
// layers.js → ця). Мусить завантажуватись ДО extras-4.js —
// renderSettingsTab викликається з dispatch-таблиці renderTabInto
// (extras-1.js).
// ============================================================

function setShowSongTitle(val) {
  state.showSongTitle = !!val;
  saveJSON(STORAGE_KEYS.live + '_showsongtitle', state.showSongTitle);
  markDirty('settings');
}

function setShowTransName(val) {
  state.showTransName = !!val;
  saveJSON(STORAGE_KEYS.live + '_showtransname', state.showTransName);
  markDirty('settings');
}

function pickCloudSyncFolder() {
  if (!window.electronAPI || !window.electronAPI.pickCloudSyncFolder) return;
  window.electronAPI.pickCloudSyncFolder().then(folder => {
    if (folder) {
      state.cloudSync.folder = folder;
      markDirty('settings');
      notify('☁️ Папка синхронізації: ' + folder);
    }
  });
}

function syncLibraryToCloud() {
  if (!window.electronAPI || !state.cloudSync.folder) {
    notify('⚠️ Вкажи папку синхронізації спочатку');
    return;
  }
  const libraryData = {
    songs: state.songs || [],
    translations: state.multiTrans || {},
    shortcuts: state.aliases || {},
    themes: (state.looks || []).filter(t => !t._system),
    exportedAt: new Date().toISOString()
  };
  window.electronAPI.syncToCloud(libraryData).then(result => {
    if (result.status === 'ok') {
      state.cloudSync.lastSync = new Date().toLocaleString('uk-UA');
      notify('☁️ Синхронізовано в ' + result.path);
    } else {
      notify('⚠️ Помилка синхронізації: ' + (result.message || result.status));
    }
  });
}

function syncLibraryFromCloud() {
  if (!window.electronAPI || !state.cloudSync.folder) {
    notify('⚠️ Вкажи папку синхронізації спочатку');
    return;
  }
  window.electronAPI.syncFromCloud().then(result => {
    if (result.status === 'ok') {
      const data = result.data;
      if (data.songs && Array.isArray(data.songs)) {
        state.songs = data.songs;
        renderPlaylist();
      }
      if (data.translations) state.multiTrans = Object.assign(state.multiTrans || {}, data.translations);
      if (data.themes && Array.isArray(data.themes)) {
        state.looks = (state.looks || []).filter(t => t._system);
        state.looks.push(...data.themes);
      }
      state.cloudSync.lastSync = new Date().toLocaleString('uk-UA');
      notify('☁️ Завантажено з хмари (' + (data.songs ? data.songs.length : 0) + ' пісень)');
    } else if (result.status === 'not-found') {
      notify('⚠️ Файл синхронізації не знайдено в папці');
    } else {
      notify('⚠️ Помилка: ' + (result.message || result.status));
    }
  });
}

function setAutoCloudSync(on) {
  state.cloudSync.autoSync = on;
  markDirty('settings');
}

function manualCheckUpdates() {
  if (!window.electronAPI || !window.electronAPI.checkUpdates) { notify('⚠️ Автооновлення недоступне в цій збірці'); return; }
  if (!navigator.onLine) { notify('🔴 Немає інтернету — перевірку оновлень відкладено'); return; }
  window.electronAPI.checkUpdates();
  notify('🔄 Перевіряю оновлення…');
}

function runPreflightCheck() {
  const rows = [];
  const openOutputs = [1, 2, 3, 4].filter(n => state.outputStates && state.outputStates[n] && state.outputStates[n].open);
  rows.push({
    level: openOutputs.length ? 'ok' : 'bad',
    label: 'Виходи',
    detail: openOutputs.length + '/4 відкрито' + (openOutputs.length ? ' (' + openOutputs.map(n => OUT_NAME[n] || ('Вихід ' + n)).join(', ') + ')' : ' — служба без екрана неможлива')
  });
  rows.push({
    level: navigator.onLine ? 'ok' : 'warn',
    label: 'Інтернет',
    detail: navigator.onLine ? 'є' : 'немає — автооновлення й пошук камер ONVIF не працюватимуть'
  });
  rows.push({
    level: (typeof atemConnected !== 'undefined' && atemConnected) ? 'ok' : 'info',
    label: 'ATEM',
    detail: (typeof atemConnected !== 'undefined' && atemConnected) ? 'підключено' : 'не підключено (гаразд, якщо не використовуєш)'
  });
  rows.push({
    level: (state.obs && state.obs.connected) ? 'ok' : 'info',
    label: 'OBS',
    detail: (state.obs && state.obs.connected) ? 'підключено' : 'не підключено (гаразд, якщо не використовуєш)'
  });
  const configuredCams = (typeof ptzCams !== 'undefined' ? ptzCams : []).filter(c => c && c.ip).length;
  rows.push({
    level: configuredCams ? 'ok' : 'info',
    label: 'PTZ-камери',
    detail: configuredCams ? configuredCams + ' налаштовано' : 'жодної не налаштовано (гаразд, якщо не використовуєш)'
  });
  rows.push({
    level: (state.mediaFiles && state.mediaFiles.length) ? 'ok' : 'info',
    label: 'Медіафайли',
    detail: (state.mediaFiles ? state.mediaFiles.length : 0) + ' завантажено на цю сесію'
  });
  renderPreflightResults(rows);
  // Stage Display — окремо, асинхронно (IPC-запит до головного процесу),
  // додається в підсумок, коли відповідь прийде.
  if (window.electronAPI && window.electronAPI.stageWindowStatus) {
    window.electronAPI.stageWindowStatus().then(function(st) {
      rows.push({ level: st.open ? 'ok' : 'info', label: 'Stage Display', detail: st.open ? 'відкрито' : 'закрито (гаразд, якщо не використовуєш)' });
      renderPreflightResults(rows);
    }).catch(function() {});
  }
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

    <div class="card">
      <div class="card-title">🔄 Оновлення</div>
      <div class="card-sub">Застосунок сам перевіряє оновлення при старті. Тут можна перевірити вручну, не чекаючи перезапуску.</div>
      <div id="appVersionLabel" style="font-size:12px;color:var(--text2);margin:6px 0">Версія: …</div>
      <button class="btn btn-ghost btn-sm" onclick="manualCheckUpdates()">🔄 Перевірити зараз</button>
    </div>
    <div class="card">
      <div class="card-title">🚀 Перевірка перед службою</div>
      <div class="card-sub">Один погляд на все — виходи, з'єднання, обладнання — перш ніж почати. Нічого не вмикає само, лише показує поточний стан.</div>
      <button class="btn btn-primary btn-sm" onclick="runPreflightCheck()">🚀 Перевірити зараз</button>
      <div id="preflightResults" style="margin-top:8px"></div>
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
      <div class="card-title">🏷 Назви на екрані</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-bottom:8px">
        <input type="checkbox" ${state.showSongTitle !== false ? 'checked' : ''} onchange="setShowSongTitle(this.checked)">
        Показувати назву пісні над куплетами
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" ${state.showTransName !== false ? 'checked' : ''} onchange="setShowTransName(this.checked)">
        Показувати назву перекладу на екрані кількох перекладів
      </label>
      <div class="card-sub" style="margin-top:4px">Посилання на вірш (напр. «Об'явлення 3:2») лишається завжди — вимикається лише назва самої пісні чи перекладу.</div>
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

    <div class="card" style="border-color:${state.useAppProtocol ? 'var(--gold)' : 'var(--border)'}">
      <div class="card-title">🔬 Канал доставки графіки</div>
      <div class="card-sub">Технічне налаштування. Живе тестування (H2R-титри, GDD-графіка, фони, слайди PDF/PowerPoint на реальному проекторі) підтвердило: канал app:// працює без помилок, і вікна виводу тепер завжди мають повний захист (contextIsolation/webSecurity увімкнено незалежно від цього перемикача). Старий канал (file://) лишається як швидкий відкат — вмикай його, якщо на конкретній машині щось не так із app://; зміни діють одразу.</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-top:8px">
        <input type="checkbox" ${state.useAppProtocol ? 'checked' : ''} onchange="setOverlayChannel(this.checked)">
        <b>${state.useAppProtocol ? '🔬 Новий канал (app://) — увімкнено' : 'Старий канал (file://) — типовий, відкат за потреби'}</b>
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
  markDirty('settings');
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
  markDirty('settings');
  notify('👤 Профіль «' + name + '» збережено');
  });
}

function setUi(key, val) {
  state.ui[key] = val;
  saveUiPrefs();
  if (key === 'scale') applyUiScale();
  if (key === 'light' || key === 'highContrast' || key === 'boldText') applyUiTheme();
  if (key !== 'scale') markDirty('settings');
}

function setAutoLaunch(on) {
  state.ui.autoLaunch = on;
  saveUiPrefs();
  if (window.electronAPI && window.electronAPI.setAutoLaunch) {
    window.electronAPI.setAutoLaunch(on).then(() => {
      notify(on ? '✓ Запускатиметься разом з Windows' : 'Автозапуск вимкнено');
    }).catch(() => notify('⚠️ Не вдалось змінити автозапуск'));
  }
  markDirty('settings');
}

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

function setTrainingMode(on) {
  state.trainingMode = !!on;
  saveJSON(STORAGE_KEYS.live + '_training', state.trainingMode);
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();
  notify(on ? '🎓 Режим тренування увімкнено — нічого не піде на екран' : '✓ Режим тренування вимкнено — вивід знову справжній');
}

function clearChangeLog() {
  if (!confirm('Очистити весь журнал змін?')) return;
  state.changeLog = [];
  saveJSON(STORAGE_KEYS.live + '_changelog', []);
  markDirty('settings');
  notify('🗑 Журнал очищено');
}

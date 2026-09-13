// ============================================================
// ВКЛАДКА «🧩 Додатково» (extras) — друга/третя мова перекладу поверх
// основного тексту, транспонування акордів, автотаймер, інтеграція з OBS
// (підключення/відключення, перемикання сцен, довільні дії).
//
// Зібрано з ДВОХ файлів: друга/третя мова + транспонування + автотаймер —
// з src/extras-2.js; OBS-інтеграція і сама вкладка (renderExtrasTab) —
// з src/extras-3.js. Об'єднано тут, бо це одна вкладка (той самий підхід,
// що вже був для text_control.js/captions.js).
//
// Продовження модуляризації (typo.js → ... → automation.js → ця).
// Мусить завантажуватись ДО extras-4.js — renderExtrasTab викликається
// з dispatch-таблиці renderTabInto (extras-1.js).
// ============================================================

function setSecondLang(id) {
  state.secondLang = id || null;
  saveJSON(STORAGE_KEYS.station + '_lang', { id: state.secondLang, mode: state.secondLangMode });
  notify(id ? '🌐 Друга мова увімкнена' : 'Другу мову вимкнено');
  updateLivePanels();
}

function setThirdLang(id) {
  state.thirdLang = id || null;
  saveJSON(STORAGE_KEYS.station + '_lang3', { id: state.thirdLang });
  notify(id ? '🌐 Третя мова увімкнена' : 'Третю мову вимкнено');
  updateLivePanels();
  markDirty('extras');
}

function setSecondLangMode(mode) {
  state.secondLangMode = mode; // 'under' = під основним текстом | 'output' = на окремий вихід
  saveJSON(STORAGE_KEYS.station + '_lang', { id: state.secondLang, mode: mode });
  markDirty('extras');   // вкладка з цим перемикачем називається 'extras' (як і в setThirdLang нижче)
}

function setTranspose(n) {
  state.transpose = Math.max(-11, Math.min(11, n));
  const lbl = $('#transposeLabel');
  if (lbl) lbl.textContent = (state.transpose > 0 ? '+' : '') + state.transpose;
  updateStageDisplay();
  notify('🎸 Транспонування: ' + (state.transpose > 0 ? '+' : '') + state.transpose);
}

function setAutoTimer(key, val) {
  state.autoTimer[key] = val;
  saveAutoTimer();
  startAutoTimerWatcher();
  markDirty('live');
}

function obsConnect() {
  let url = ($('#obsUrl') && $('#obsUrl').value.trim()) || 'ws://127.0.0.1:4455';
  const pass = ($('#obsPass') && $('#obsPass').value) || '';

  // Типова плутанина: OBS у «WebSocket Server Settings» показує ОКРЕМО
  // короткий порт (4455) і окремо довгий випадковий «Server Password» —
  // легко випадково вставити довгий пароль у поле адреси. Перевіряємо
  // ФОРМАТ адреси заздалегідь і даємо конкретну підказку, а не загальну
  // помилку з'єднання (яку в такому разі OBS взагалі не побачить).
  if (!/^wss?:\/\//i.test(url)) {
    if (/^[\w.-]+:\d+$/.test(url)) {
      // Просто забули префікс "ws://" — дрібниця, виправляємо самі.
      url = 'ws://' + url;
    } else {
      notify('⚠️ Це не схоже на адресу OBS — вона коротка й виглядає так: ws://127.0.0.1:4455. Схоже, у поле «Адреса» вставлено щось інше (можливо, «Server Password» з OBS?) — перевір, чи не переплутані поля.');
      return;
    }
  }

  state.obs = Object.assign({}, state.obs, { url: url, password: pass });
  saveJSON(STORAGE_KEYS.live + '_obs', { url: url, password: pass });
  if (!window.electronAPI || !window.electronAPI.obsConnect) return;
  window.electronAPI.obsConnect(url, pass).then(r => {
    if (r.ok) {
      state.obs = Object.assign({}, state.obs, { connected: true, scenes: r.scenes || [], current: r.current || '' });
      notify('🎥 OBS підключено' + (r.scenes && r.scenes.length ? ' — сцен: ' + r.scenes.length : ''));
    } else {
      state.obs = Object.assign({}, state.obs, { connected: false });
      notify('✗ ' + (r.error || 'OBS не підключився'));
    }
    markDirty('extras');
  }).catch(() => notify('✗ OBS недоступний'));
}

function obsDisconnect() {
  if (window.electronAPI && window.electronAPI.obsDisconnect) window.electronAPI.obsDisconnect();
  state.obs = Object.assign({}, state.obs, { connected: false });
  markDirty('extras');
}

function obsSceneIdx(i) {
  const s = (state.obs && state.obs.scenes) ? state.obs.scenes[i] : null;
  if (s) obsScene(s);
}

function obsAct(action, value) {
  if (!window.electronAPI || !window.electronAPI.obsAction) return;
  window.electronAPI.obsAction(action, value).then(r => {
    if (!r.ok) notify('✗ OBS: ' + (r.error || 'помилка'));
    else if (action === 'scene') { state.obs.current = value; markDirty('extras'); notify('🎥 Сцена: ' + value); }
    else notify('🎥 ' + action);
  }).catch(() => {});
}

function renderExtrasTab() {
  const langs = bibleTranslationsList();
  const langOpts = ['<option value="">— вимкнено —</option>']
    .concat(langs.map(t => `<option value="${t.id}"${state.secondLang === t.id ? ' selected' : ''}>${esc(t.name)}</option>`))
    .join('');
  const langOpts3 = ['<option value="">— вимкнено —</option>']
    .concat(langs.map(t => `<option value="${t.id}"${state.thirdLang === t.id ? ' selected' : ''}>${esc(t.name)}</option>`))
    .join('');
  const days = ['Неділя','Понеділок','Вівторок','Середа','Четвер','П\'ятниця','Субота']
    .map((d, i) => `<option value="${i}"${Number(state.autoTimer.weekday) === i ? ' selected' : ''}>${d}</option>`).join('');
  const o = state.obs || {};
  const sceneBtns = (o.scenes || []).map((s, si) =>
    `<button class="btn ${s === o.current ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="obsSceneIdx(${si})">${esc(s)}</button>`).join(' ');
  const song = state.selectedSong;

  return `
  ${renderStorageCard()}
  <div class="grid2">
    <div class="card">
      <div class="card-title">🌐 Кілька мов на екрані</div>
      <div class="card-sub">Той самий вірш іншими мовами — під основним текстом (до трьох разом) або на окремий екран.</div>
      <div style="font-size:11px;color:var(--text2);margin-top:6px">Друга мова</div>
      <select onchange="setSecondLang(this.value)" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">${langOpts}</select>
      <div style="font-size:11px;color:var(--text2);margin-top:6px">Третя мова (необов'язково)</div>
      <select onchange="setThirdLang(this.value)" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">${langOpts3}</select>
      <div style="display:flex;gap:4px;margin-top:6px">
        <button class="btn ${state.secondLangMode === 'under' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setSecondLangMode('under')">Під основним текстом</button>
        <button class="btn ${state.secondLangMode === 'output' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setSecondLangMode('output')">На окремий екран</button>
      </div>
      ${state.secondLangMode === 'output' ? '<div class="card-sub" style="margin-top:4px">У вкладці «Виходи» постав потрібному екрану маршрут <b>«Друга мова»</b>.</div>' : ''}
      ${!langs.length ? '<div class="card-sub" style="color:var(--red);margin-top:4px">Спершу імпортуй другий переклад у вкладці «Імпорт даних».</div>' : ''}
    </div>

    <div class="card">
      <div class="card-title">🎸 Акорди для музикантів</div>
      <div class="card-sub">${song ? (songHasChords(song) ? '✓ У пісні «' + esc(song.title) + '» є акорди' : 'У поточній пісні акорди не знайдені (формат ChordPro: [Am])') : 'Обери пісню'}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
        <button class="btn btn-ghost btn-sm" onclick="setTranspose((state.transpose||0)-1)">−1</button>
        <span id="transposeLabel" style="min-width:36px;text-align:center;font-size:14px;font-weight:700;color:var(--gold)">${state.transpose > 0 ? '+' : ''}${state.transpose || 0}</span>
        <button class="btn btn-ghost btn-sm" onclick="setTranspose((state.transpose||0)+1)">+1</button>
        <button class="btn btn-ghost btn-sm" onclick="setTranspose(0)">Скинути</button>
      </div>
      <div class="card-sub" style="margin-top:6px">У залі акорди <b>не показуються</b> — лише на екрані музикантів (маршрут «Акорди» у вкладці «Виходи»).</div>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">⏱ Автостарт відліку до служби</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
        <input type="checkbox" ${state.autoTimer.on ? 'checked' : ''} onchange="setAutoTimer('on', this.checked)">
        Вмикати таймер автоматично
      </label>
      <div style="display:flex;gap:6px;margin-top:6px">
        <select onchange="setAutoTimer('weekday', this.value)" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">${days}</select>
        <input type="time" value="${state.autoTimer.time}" onchange="setAutoTimer('time', this.value)"
               style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px">
      </div>
      <div style="font-size:12px;color:var(--text2);margin-top:6px">Вмикати за <b>${state.autoTimer.minsBefore}</b> хв до початку</div>
      <input type="range" min="1" max="30" value="${state.autoTimer.minsBefore}" oninput="setAutoTimer('minsBefore', parseInt(this.value,10))" style="width:100%">
    </div>

    <div class="card">
      <div class="card-title">🎥 OBS Studio ${o.connected ? '<span style="color:var(--green)">● підключено</span>' : '<span style="color:var(--text2)">● офлайн</span>'}</div>
      <div class="card-sub">Увімкни в OBS: Інструменти → WebSocket Server Settings. Там буде окремо «Server Port» (число, напр. 4455) і окремо «Server Password» (довгий випадковий рядок) — це <b>два різні</b> поля, не плутай їх місцями нижче.</div>
      <div style="font-size:10px;color:var(--text2);margin-top:6px">Адреса (коротка, ws://…):</div>
      <div style="display:flex;gap:4px">
        <input id="obsUrl" type="text" value="${esc((o.url) || 'ws://127.0.0.1:4455')}" placeholder="ws://127.0.0.1:4455"
               style="flex:2;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;font-family:monospace">
        <input id="obsPass" type="password" value="${esc(o.password || '')}" placeholder="Server Password з OBS"
               style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">
      </div>
      <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="obsConnect()">🔗 Підключити</button>
        ${o.connected ? '<button class="btn btn-ghost btn-sm" onclick="obsDisconnect()">Відключити</button>' : ''}
        ${o.connected ? '<button class="btn btn-ghost btn-sm" onclick="obsAct(\'record-start\')">⏺ Запис</button><button class="btn btn-ghost btn-sm" onclick="obsAct(\'record-stop\')">⏹ Стоп</button>' : ''}
        ${o.connected ? '<button class="btn btn-ghost btn-sm" onclick="obsAct(\'stream-start\')">📡 Ефір</button><button class="btn btn-ghost btn-sm" onclick="obsAct(\'stream-stop\')">⏹ Стоп ефіру</button>' : ''}
      </div>
      ${sceneBtns ? '<div style="margin-top:8px"><div style="font-size:12px;color:var(--text2);margin-bottom:4px">Сцени</div><div style="display:flex;gap:4px;flex-wrap:wrap">' + sceneBtns + '</div></div>' : ''}
    </div>

    <div class="card">
      <div class="card-title">📡 NDI (передача по мережі в vMix/інший комп'ютер)</div>
      <div class="card-sub">
        Прямої підтримки NDI в самому застосунку немає — єдина Node.js-бібліотека для цього (grandiose) не компілюється на сучасних системах (застаріла, покинута розробником). Але той самий результат отримуєш через OBS, який уже підключений вище:
      </div>
      <ol style="font-size:12px;color:var(--text2);margin:8px 0 0 18px;padding:0;line-height:1.7">
        <li>В OBS постав плагін <b>obs-ndi</b> (безкоштовний, окремо з obsproject.com/forum або distroav.org)</li>
        <li>Додай вихід («Трансляція» чи будь-який з 4) в OBS як джерело <b>Window Capture</b> — обери відповідне вікно «Церква Проектор»</li>
        <li>В OBS: Інструменти → <b>NDI Output settings</b> → увімкни «Main Output»</li>
        <li>Тепер цей вихід видно по мережі в vMix / іншому NDI-приймачі як звичайне NDI-джерело</li>
      </ol>
    </div>
  </div>`;
}

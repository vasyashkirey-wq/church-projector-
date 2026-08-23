// ============================================================
// СТАНЦІЇ: 2 ПК + планшети/телефони
// Хост тримає вікна виводу. Клієнт — повноцінна панель, але свої
// відправки він НЕ виводить локально, а надсилає хосту.
// ============================================================
const STATION_PORT = 4242;
let stationWs = null;

function saveStationCfg() {
  saveJSON(STORAGE_KEYS.station, {
    mode: state.station.mode, ip: state.station.ip,
    pin: state.station.pin, name: state.station.name
  });
}
function loadStationCfg() {
  const c = loadJSON(STORAGE_KEYS.station);
  if (c) Object.assign(state.station, c, { connected: false, clients: [] });
}

function isClientStation() { return state.station.mode === 'client' && state.station.connected; }

// ---- ХОСТ ----
function startHost() {
  if (!window.electronAPI || !window.electronAPI.startSyncServer) return;
  const pin = ($('#stationPin') && $('#stationPin').value.trim()) || '';
  state.station.pin = pin;
  state.station.mode = 'host';
  saveStationCfg();
  window.electronAPI.startSyncServer(pin).then(res => {
    state.station.ip = res.ip;
    renderTabInto('stations');
    notify('🖥 Хост запущено: ' + res.ip + ':' + res.port + (pin ? ' (пароль увімкнено)' : ''));
  }).catch(err => {
    state.station.mode = 'solo';
    renderTabInto('stations');
    notify('✗ Хост не стартував: ' + (err && err.message ? err.message : 'помилка'));
  });
  // Помилки сервера (зайнятий порт тощо) приходять окремою подією
  if (window.electronAPI.onStationError) {
    window.electronAPI.onStationError(err => {
      state.station.mode = 'solo';
      renderTabInto('stations');
      notify('✗ ' + (err.message || 'Сервер не запустився'));
    });
  }
  // Хост слухає команди від клієнтів і виконує їх у себе
  if (window.electronAPI.onStationCommand) {
    window.electronAPI.onStationCommand(cmd => applyStationCommand(cmd));
  }
  if (window.electronAPI.onStationClients) {
    window.electronAPI.onStationClients(list => {
      state.station.clients = list || [];
      renderStationClients();
    });
  }
}
function stopHost() {
  if (window.electronAPI && window.electronAPI.stopSyncServer) window.electronAPI.stopSyncServer();
  state.station.mode = 'solo';
  state.station.clients = [];
  saveStationCfg();
  renderTabInto('stations');
  notify('Хост зупинено');
}

// Команда з іншої станції — виконуємо як свою
function applyStationCommand(cmd) {
  if (!cmd || !cmd.action) return;
  const p = cmd.payload || {};
  const from = cmd.from || 'станція';
  switch (cmd.action) {
    case 'send-text': setGoingLive(true); try { doSend(p.text, p.ref); } finally { setGoingLive(false); } break;
    case 'send-html': setGoingLive(true); try { doSendHTML(p.html, p.label); } finally { setGoingLive(false); } break;
    case 'stage':     stageContent(p.content); break;
    case 'go-live':   goLive(); break;
    case 'clear':     clearLive(); break;
    case 'blackout':  toggleBlackout(); break;
    case 'next':      previewStep(1);  if (state.liveMode !== 'staged') goLive(); break;
    case 'prev':      previewStep(-1); if (state.liveMode !== 'staged') goLive(); break;
    // Конкретна закладка/пункт плану/оголошення — для Stream Deck, де кожна
    // кнопка має викликати ЗАЗДАЛЕГІДЬ ЗАДАНУ дію, а не просто «далі/назад».
    case 'bookmark':  if (typeof showBookmark === 'function') showBookmark(parseInt(p.idx, 10) || 0); break;
    case 'plan-item': if (typeof svcGoTo === 'function') svcGoTo(parseInt(p.idx, 10) || 0); break;
    case 'announce':  if (typeof sendSavedAnnounce === 'function') sendSavedAnnounce(parseInt(p.id, 10)); break;
    case 'gdd':       if (window.electronAPI.gddCommand) window.electronAPI.gddCommand(null, p.action, p.data); break;
    case 'alert':     if (window.electronAPI.sendAlert) window.electronAPI.sendAlert(p.cfg || null, null); break;
    case 'freeze':    if (typeof toggleFreeze === 'function') toggleFreeze(); break;
    default: return;
  }
  notify('📡 ' + from + ': ' + cmd.action);
  hostBroadcastState();
}

// Хост розсилає свій стан станціям і пультам
const hostBroadcastState = rafDebounce(function() {
  if (state.station.mode !== 'host' || !window.electronAPI || !window.electronAPI.stationBroadcast) return;
  window.electronAPI.stationBroadcast({
    type: 'state',
    data: {
      onAir: state.onAir ? { label: state.onAir.label, ref: state.onAir.ref, html: state.onAir.html } : null,
      preview: state.preview ? { label: state.preview.label, ref: state.preview.ref } : null,
      liveMode: state.liveMode,
      song: state.selectedSong ? state.selectedSong.title : null,
      verseIdx: state.selectedVerseIdx
    }
  });
});

// ---- КЛІЄНТ ----
function connectStation() {
  const ip = ($('#stationIp') && $('#stationIp').value.trim()) || state.station.ip;
  const pin = ($('#stationPinClient') && $('#stationPinClient').value.trim()) || '';
  const name = ($('#stationName') && $('#stationName').value.trim()) || 'Панель 2';
  if (!ip) { notify('⚠️ Вкажи IP хоста'); return; }

  state.station.ip = ip; state.station.pin = pin; state.station.name = name; state.station.mode = 'client';
  state.station._manualDisconnect = false;
  saveStationCfg();

  if (stationWs) { try { stationWs.close(); } catch(e) {} }
  try {
    stationWs = new WebSocket('ws://' + ip + ':' + STATION_PORT);
  } catch (e) { notify('✗ Не вдалось підключитись'); return; }

  stationWs.onopen = () => {
    stationWs.send(JSON.stringify({ type: 'hello', pin: pin, name: name, role: 'panel' }));
  };
  stationWs.onmessage = e => {
    let msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.type === 'welcome') {
      state.station.connected = true;
      _stationRetry = 0;
      uiBeep();
      renderTabInto('stations');
      notify('✓ Підключено до хоста ' + ip);
    } else if (msg.type === 'denied') {
      state.station.connected = false;
      renderTabInto('stations');
      notify('✗ ' + (msg.reason || 'Відмовлено'));
    } else if (msg.type === 'state' && msg.data) {
      // Показуємо, що зараз у залі — навіть якщо ти за другим ПК
      const d = msg.data;
      state.onAir = d.onAir ? { kind: 'text', html: d.onAir.html || '', ref: d.onAir.ref, label: d.onAir.label } : null;
      _updateLivePanels();
      const lbl = $('#stationHostState');
      if (lbl) lbl.textContent = d.onAir ? ('В ефірі: ' + (d.onAir.label || '')) : 'Ефір порожній';
    }
  };
  stationWs.onclose = () => {
    state.station.connected = false;
    renderTabInto('stations');
    // Автоперепідключення: хост міг перезапуститись або мережа моргнути.
    // Без цього друга панель мовчки «вмирала» посеред служіння.
    if (state.station.mode === 'client' && !state.station._manualDisconnect) {
      _stationRetry = Math.min((_stationRetry || 0) + 1, 10);
      const wait = Math.min(1000 * _stationRetry, 8000);
      notify('↻ Зв\'язок втрачено — перепідключення через ' + Math.round(wait / 1000) + ' с');
      clearTimeout(_stationRetryTimer);
      _stationRetryTimer = setTimeout(() => connectStation(), wait);
    }
  };
  stationWs.onerror = () => { /* onclose спрацює слідом */ };
}
let _stationRetry = 0, _stationRetryTimer = null;
function disconnectStation() {
  state.station._manualDisconnect = true;
  clearTimeout(_stationRetryTimer);
  if (stationWs) { try { stationWs.close(); } catch(e) {} stationWs = null; }
  state.station.connected = false;
  state.station.mode = 'solo';
  saveStationCfg();
  renderTabInto('stations');
}
// Клієнт шле команду хосту замість локального виводу
function stationSend(action, payload) {
  if (!stationWs || stationWs.readyState !== 1) { notify('⚠️ Немає зв\'язку з хостом'); return false; }
  stationWs.send(JSON.stringify({ type: 'cmd', action: action, payload: payload || {} }));
  return true;
}

function renderStationClients() {
  const el = $('#stationClientsList');
  if (!el) return;
  const list = state.station.clients || [];
  el.innerHTML = list.length
    ? list.map(c => `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--green)">●</span> ${esc(c.name)} <span style="color:var(--text2)">(${esc(c.role)})</span></div>`).join('')
    : '<div style="font-size:11px;color:var(--text2)">Ніхто ще не підключився</div>';
}


// ---- Пульти на телефонах ----
// ВАДА, яку це виправляє: після появи режиму «спершу прев'ю» команди з пульта
// потрапляли в прев'ю, і на екрані в залі нічого не змінювалось. Помічник тисне —
// нічого не відбувається. Тепер пульт завжди діє на ЕФІР.
function initRemoteListener() {
  if (!window.electronAPI || !window.electronAPI.onRemoteCommand) return;
  window.electronAPI.onRemoteCommand(cmd => {
    if (!cmd || !cmd.action) return;
    // Клієнтська станція не має власного виводу — пересилаємо хосту
    if (isClientStation()) { stationSend(cmd.action, cmd.payload || {}); return; }

    const staged = state.liveMode === 'staged';
    switch (cmd.action) {
      case 'next-verse': case 'next':
        // PDF/слайд в ефірі МАЄ мати пріоритет над фолбеком на selectedSong
        // нижче — інакше стара вибрана пісня перехоплює команду з пульта, і
        // замість наступної сторінки PDF в ефір летить пісня поверх нього.
        if (state.service.idx >= 0) { svcNext(); if (staged) goLive(); }   // служба за планом
        else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf' && typeof nextSlide === 'function') { nextSlide(); }
        else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible' && typeof nextBibleVerse === 'function') { nextBibleVerse(); }  // Біблія в ефірі → наступний вірш Біблії
        else if (state.selectedSong && (state.splitCfg.on || state.orders[songKey(state.selectedSong)])) { songStep(1); if (staged) goLive(); }
        else if (staged) { previewStep(1); goLive(); }
        else if (typeof nextVerse === 'function') { nextVerse(); if (typeof sendToProjector === 'function') sendToProjector(); }
        break;
      case 'prev-verse': case 'prev':
        if (state.service.idx >= 0) { svcPrev(); if (staged) goLive(); }
        else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf' && typeof prevSlide === 'function') { prevSlide(); }
        else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible' && typeof prevBibleVerse === 'function') { prevBibleVerse(); }
        else if (state.selectedSong && (state.splitCfg.on || state.orders[songKey(state.selectedSong)])) { songStep(-1); if (staged) goLive(); }
        else if (staged) { previewStep(-1); goLive(); }
        else if (typeof prevVerse === 'function') { prevVerse(); if (typeof sendToProjector === 'function') sendToProjector(); }
        break;
      case 'go-live':
        goLive();
        break;
      case 'undo':
        undoLast();
        break;
      case 'lower':
        lowerToggle();
        break;
      case 'clear':
        clearLive();
        break;
      // 'blackout' і 'freeze' були у білому списку HTTP API (main.js), але тут
      // не оброблялись — Stream Deck отримував «успіх», а на екрані нічого
      // не змінювалось.
      case 'blackout':
        toggleBlackout();
        break;
      case 'freeze':
        if (typeof toggleFreeze === 'function') toggleFreeze();
        break;
      case 'select-verse':
        if (staged && cmd.idx !== undefined && state.selectedSong) {
          const v = state.selectedSong.verses[cmd.idx];
          if (v != null) {
            stageContent({ kind:'text', rawText:v, html:hallText(v).replace(/\n/g,'<br>'),
                           ref:state.selectedSong.title || '', label:(state.selectedSong.title||'')+' — куплет '+(cmd.idx+1), verseIdx:cmd.idx });
            goLive();
          }
        }
        break;
      // Конкретна закладка/пункт плану/оголошення — для Stream Deck, де кожна
      // кнопка має викликати ЗАЗДАЛЕГІДЬ ЗАДАНУ дію, а не просто «далі/назад».
      // /api/bookmark?idx=0  /api/plan-item?idx=2  /api/announce?id=169...
      case 'bookmark':
        if (typeof showBookmark === 'function') showBookmark(parseInt((cmd.payload && cmd.payload.idx) || 0, 10));
        break;
      case 'plan-item':
        if (typeof svcGoTo === 'function') svcGoTo(parseInt((cmd.payload && cmd.payload.idx) || 0, 10));
        break;
      case 'announce':
        if (typeof sendSavedAnnounce === 'function' && cmd.payload && cmd.payload.id) sendSavedAnnounce(parseInt(cmd.payload.id, 10));
        break;
      default: return; // решту (bible, projector) обробляє сам додаток
    }
    hostBroadcastState();
  });
}


// ---- Вкладка «Мова / Музиканти / OBS» ----
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
      <div class="card-sub">Увімкни в OBS: Інструменти → WebSocket Server Settings.</div>
      <div style="display:flex;gap:4px;margin-top:6px">
        <input id="obsUrl" type="text" value="${esc((o.url) || 'ws://127.0.0.1:4455')}" placeholder="ws://127.0.0.1:4455"
               style="flex:2;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;font-family:monospace">
        <input id="obsPass" type="password" value="${esc(o.password || '')}" placeholder="пароль"
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
  </div>`;
}

// ---- OBS ----
function obsConnect() {
  const url = ($('#obsUrl') && $('#obsUrl').value.trim()) || 'ws://127.0.0.1:4455';
  const pass = ($('#obsPass') && $('#obsPass').value) || '';
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
    renderTabInto('extras');
  }).catch(() => notify('✗ OBS недоступний'));
}
function obsDisconnect() {
  if (window.electronAPI && window.electronAPI.obsDisconnect) window.electronAPI.obsDisconnect();
  state.obs = Object.assign({}, state.obs, { connected: false });
  renderTabInto('extras');
}
function obsScene(name) { obsAct('scene', name); }
// За індексом — щоб апостроф у назві сцени не розривав onclick
function obsSceneIdx(i) {
  const s = (state.obs && state.obs.scenes) ? state.obs.scenes[i] : null;
  if (s) obsScene(s);
}
function obsAct(action, value) {
  if (!window.electronAPI || !window.electronAPI.obsAction) return;
  window.electronAPI.obsAction(action, value).then(r => {
    if (!r.ok) notify('✗ OBS: ' + (r.error || 'помилка'));
    else if (action === 'scene') { state.obs.current = value; renderTabInto('extras'); notify('🎥 Сцена: ' + value); }
    else notify('🎥 ' + action);
  }).catch(() => {});
}
function initObsListener() {
  const saved = loadJSON(STORAGE_KEYS.live + '_obs');
  state.obs = Object.assign({ connected: false, scenes: [], current: '' }, saved || {});
  if (window.electronAPI && window.electronAPI.onObsState) {
    window.electronAPI.onObsState(s => {
      state.obs = Object.assign({}, state.obs, s);
      if (isActive('extras')) renderTabInto('extras');
    });
  }
}


// ============================================================
// ШАРИ ЕКРАНА (керування з панелі)
// ============================================================
function loadLayers() {
  const c = loadJSON(STORAGE_KEYS.live + '_layers');
  if (!c) return;
  state.logo = c.logo || null;
  state.bgVideo = c.bgVideo || null;
  state.bgQueue = c.bgQueue || [];
  state.bgQueueInterval = c.bgQueueInterval || 30;
  state.bgQueueIdx = c.bgQueueIdx || 0;
  if (state.bgAudio && c.volume != null) state.bgAudio.volume = c.volume;
  // Відновлюємо фон і логотип на вже відкритих виходах
  if (state.bgVideo && window.electronAPI && window.electronAPI.setBgVideo) {
    window.electronAPI.setBgVideo({ src: state.bgVideo.src, loop: true, speed: state.bgVideo.speed || 1 });
  }
}
function saveLayers() {
  // Сесійні blob-посилання після перезапуску мертві — не зберігаємо їх
  const v = (state.bgVideo && !state.bgVideo.session) ? state.bgVideo : null;
  saveJSON(STORAGE_KEYS.live + '_layers', {
    logo: state.logo,          // логотип — картинка, невелика, можна тримати як dataURL
    bgVideo: v,                // лише шлях до файлу
    bgQueue: (state.bgQueue || []).filter(x => !x.session),
    bgQueueInterval: state.bgQueueInterval || 30,
    bgQueueIdx: state.bgQueueIdx || 0,
    volume: state.bgAudio ? state.bgAudio.volume : 0.5
  });
}

// ---- Відео-фон під текстом ----
function loadBgVideo(input) {
  const f = input.files[0];
  if (!f) return;

  // Беремо ШЛЯХ до файлу, а не base64: відео на 50 МБ у dataURL — це ~67 МБ,
  // що миттєво переповнює localStorage (ліміт ~5 МБ) і з'їдає пам'ять.
  if (f.path) {
    // Непідтримувані формати (MOV/MKV…) спершу конвертуємо у MP4, тоді вантажимо
    ensureSupportedMedia(f.path, function(cpath) {
      const fileUrl = pathToFileUrl(cpath);
      state.bgVideo = { src: fileUrl, name: f.name, speed: 1 };
      saveLayers();
      applyBgVideo();
      renderTabInto('layers');
      notify('🎬 Відео-фон: ' + f.name);
    });
  } else {
    // Поза Electron шляху немає — вантажимо в пам'ять лише на сеанс, без збереження
    state.bgVideo = { src: URL.createObjectURL(f), name: f.name, speed: 1, session: true };
    applyBgVideo();
    renderTabInto('layers');
    notify('🎬 Відео-фон (лише на цей сеанс): ' + f.name);
  }
  input.value = '';
}
function applyBgVideo(kind) {
  if (!window.electronAPI || !window.electronAPI.setBgVideo) return;
  const v = state.bgVideo;
  window.electronAPI.setBgVideo(v ? { src: v.src, loop: true, speed: v.speed || 1 } : null, kind || null);
}
function clearBgVideo() {
  state.bgVideo = null;
  saveLayers();
  applyBgVideo();
  renderTabInto('layers');
  notify('Відео-фон вимкнено');
}

// ---- Черга відео-фонів з авто-перемиканням по таймеру ----
// (кілька роликів по черзі — напр. фон до служби, що сам змінюється)
let _bgQueueTimer = null;
function loadBgQueue(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  state.bgQueue = state.bgQueue || [];
  state.bgQueue.push(...files.filter(f => f.path).map(f => ({ src: pathToFileUrl(f.path), name: f.name })));
  state.bgQueueIdx = state.bgQueueIdx || 0;
  saveLayers();
  renderTabInto('layers');
  notify('🎬 Додано в чергу: ' + files.length);
  input.value = '';
}
function removeBgQueueItem(i) {
  if (!state.bgQueue) return;
  state.bgQueue.splice(i, 1);
  saveLayers();
  renderTabInto('layers');
}
function setBgQueueInterval(sec) {
  state.bgQueueInterval = Math.max(5, parseInt(sec, 10) || 30);
  saveLayers();
  if (_bgQueueTimer) { bgQueueStop(); bgQueueStart(); } // перезапустити з новим інтервалом
}
function bgQueueAdvance() {
  const q = state.bgQueue || [];
  if (!q.length) return;
  state.bgQueueIdx = ((state.bgQueueIdx || 0) + 1) % q.length;
  state.bgVideo = Object.assign({ speed: 1 }, q[state.bgQueueIdx]);
  saveLayers();
  applyBgVideo();
  renderTabInto('layers');
}
function bgQueueStart() {
  const q = state.bgQueue || [];
  if (!q.length) { notify('⚠️ Спочатку додай ролики в чергу'); return; }
  state.bgQueueIdx = 0;
  state.bgVideo = Object.assign({ speed: 1 }, q[0]);
  applyBgVideo();
  state.bgQueueRunning = true;
  _bgQueueTimer = setInterval(bgQueueAdvance, (state.bgQueueInterval || 30) * 1000);
  saveLayers();
  renderTabInto('layers');
  notify('🔁 Ротація фонів увімкнена (кожні ' + (state.bgQueueInterval || 30) + ' с)');
}
function bgQueueStop() {
  if (_bgQueueTimer) { clearInterval(_bgQueueTimer); _bgQueueTimer = null; }
  state.bgQueueRunning = false;
  saveLayers();
  renderTabInto('layers');
  notify('Ротацію фонів зупинено');
}

// ---- Логотип / заморозка ----
function loadLogo(input) {
  const f = input.files[0];
  if (!f) return;
  const ext = (String(f.name).split('.').pop() || '').toLowerCase();
  const isHeic = ['heic', 'heif', 'tif', 'tiff'].indexOf(ext) >= 0;
  // Перевірку 2МБ пропускаємо для HEIC/TIFF — вони сконвертуються у менший JPG
  if (!isHeic && f.size > 2 * 1024 * 1024) {
    notify('⚠️ Логотип завеликий (' + Math.round(f.size / 1048576) + ' МБ). Стисни до 2 МБ — інакше переповниться сховище.');
    input.value = '';
    return;
  }
  loadImageAsDataURL(f, function(dataURL) {
    state.logo = dataURL;
    saveLayers();
    renderTabInto('layers');
    notify('🖼 Логотип збережено');
  });
  input.value = '';
}
function showLogo(on) {
  if (!window.electronAPI || !window.electronAPI.showLogo) return;
  if (on && !state.logo) { notify('⚠️ Спершу завантаж логотип'); return; }
  window.electronAPI.showLogo(on ? state.logo : null);
  state.logoOn = !!on;
  renderTabInto('layers');
  notify(on ? '🖼 Логотип на екрані' : 'Логотип прибрано');
}
function toggleFreeze() {
  if (!window.electronAPI || !window.electronAPI.freezeOutput) return;
  state.frozen = !state.frozen;
  window.electronAPI.freezeOutput(state.frozen);
  renderTabInto('layers');
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();   // банер видно з будь-якої вкладки
  notify(state.frozen ? '❄️ Кадр заморожено — зал бачить застиглу картинку' : '▶ Розморожено');
}

// ---- Оголошення ПОВЕРХ слайда ----
function sendAlert() {
  const cfg = {
    text: ($('#alertText') && $('#alertText').value.trim()) || '',
    position: state.alertCfg.position,
    size: state.alertCfg.size,
    seconds: state.alertCfg.seconds,
    ticker: state.alertCfg.ticker,
    color: '#c8a84b'
  };
  if (!cfg.text) { notify('⚠️ Введи текст оголошення'); return; }
  state.alertCfg.text = cfg.text;
  if (isClientStation()) { stationSend('alert', { cfg: cfg }); notify('📡 Оголошення через хост'); return; }
  if (window.electronAPI && window.electronAPI.sendAlert) window.electronAPI.sendAlert(cfg, null);
  notify('📢 Оголошення поверх слайда (пісня триває)');
}
function hideAlert() {
  if (isClientStation()) { stationSend('alert', { cfg: null }); return; }
  if (window.electronAPI && window.electronAPI.sendAlert) window.electronAPI.sendAlert(null, null);
  notify('Оголошення прибрано');
}
function setAlertCfg(key, val) {
  state.alertCfg[key] = val;
  const lbl = $('#alertSizeLabel');
  if (lbl) lbl.textContent = state.alertCfg.size + 'px';
  const slbl = $('#alertSecLabel');
  if (slbl) slbl.textContent = state.alertCfg.seconds ? state.alertCfg.seconds + ' с' : 'поки не прибрати';
}

// ---- Props: збережені ПОСТІЙНІ накладки (текст поверх слайда, до вимкнення) ----
function loadProps() {
  const d = loadJSON('church_props');
  state.props = Array.isArray(d) ? d : [];
  state.activePropName = null;
}
function saveProps() { saveJSON('church_props', state.props); }

function savePropFromAlert() {
  const text = ($('#alertText') && $('#alertText').value.trim()) || state.alertCfg.text || '';
  if (!text) { notify('⚠️ Спершу введи текст у «Оголошення ПОВЕРХ слайда» вище'); return; }
  pv2Prompt('Назва props (напр. «Прямий ефір», «Вимкніть телефони»):', function(name){
    if (!name || !name.trim()) return;
    name = name.trim();
    state.props = (state.props || []).filter(p => p.name !== name);
    state.props.push({ name: name, text: text, position: state.alertCfg.position, size: state.alertCfg.size, ticker: state.alertCfg.ticker });
    saveProps();
    renderTabInto('layers');
    notify('📌 Props «' + name + '» збережено');
  });
}

function toggleProp(i) {
  const p = state.props[i];
  if (!p) return;
  if (state.propHideTimer) { clearTimeout(state.propHideTimer); state.propHideTimer = null; }
  if (state.activePropName === p.name) {           // вимикаємо
    hideAlert();
    state.activePropName = null;
  } else {                                          // показуємо ПОСТІЙНО (seconds:0)
    const cfg = { text: p.text, position: p.position || 'bottom', size: p.size || 34, seconds: 0, ticker: !!p.ticker, color: '#c8a84b' };
    if (typeof isClientStation === 'function' && isClientStation()) { stationSend('alert', { cfg: cfg }); }
    else if (window.electronAPI && window.electronAPI.sendAlert) { window.electronAPI.sendAlert(cfg, null); }
    state.activePropName = p.name;
    notify('📌 «' + p.name + '» — на екрані' + (p.autoHide > 0 ? ' (сховається за ' + p.autoHide + ' хв)' : ''));
    if (p.autoHide > 0) {
      state.propHideTimer = setTimeout(function() {
        if (state.activePropName === p.name) {
          hideAlert(); state.activePropName = null; state.propHideTimer = null;
          try { renderTabInto('layers'); } catch (e) {}
          notify('⏱ «' + p.name + '» приховано автоматично');
        }
      }, p.autoHide * 60000);
    }
  }
  renderTabInto('layers');
}

function setPropAutoHide(i) {
  const p = state.props[i]; if (!p) return;
  pv2Prompt('Авто-приховати «' + p.name + '» через скільки хвилин? (0 = не ховати)', String(p.autoHide || 0), function(v) {
    if (v === null) return;
    p.autoHide = Math.max(0, parseInt(v, 10) || 0);
    saveProps();
    renderTabInto('layers');
    notify(p.autoHide > 0 ? '⏱ «' + p.name + '» ховатиметься за ' + p.autoHide + ' хв' : '⏱ Авто-приховування вимкнено');
  });
}

function deleteProp(i) {
  const p = state.props[i];
  if (!p || !confirm('Видалити props «' + p.name + '»?')) return;
  if (state.activePropName === p.name) { hideAlert(); state.activePropName = null; }
  state.props.splice(i, 1);
  saveProps();
  renderTabInto('layers');
}

// ---- Шаблони повідомлень із токенами ({дата},{час},{ім'я}…) ---------------
function loadMsgTemplates() { const d = loadJSON('church_msgtemplates'); state.msgTemplates = Array.isArray(d) ? d : []; }
function saveMsgTemplates() { saveJSON('church_msgtemplates', state.msgTemplates); }
function addMsgTemplate() {
  pv2Prompt("Назва шаблону (напр. «День народження»):", "", function(name) {
    if (name === null || !name.trim()) return;
    name = name.trim();
    pv2Prompt("Текст. Токени: {дата} і {час} — автоматично, інші (напр. {імʼя}) спитає при використанні:", "", function(text) {
      if (text === null || !text.trim()) return;
      state.msgTemplates.push({ name: name, text: text.trim() });
      saveMsgTemplates();
      renderTabInto("layers");
      notify("✍️ Шаблон «" + name + "» збережено");
    });
  });
}
function deleteMsgTemplate(i) {
  if (!state.msgTemplates[i]) return;
  if (!confirm("Видалити шаблон «" + state.msgTemplates[i].name + "»?")) return;
  state.msgTemplates.splice(i, 1);
  saveMsgTemplates();
  renderTabInto("layers");
}
function useMsgTemplate(i) {
  const t = state.msgTemplates[i]; if (!t) return;
  const now = new Date();
  let text = t.text
    .replace(/{дата}/gi, now.toLocaleDateString("uk-UA"))
    .replace(/{час}/gi, now.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }));
  const toks = [], seen = {};
  (text.match(/{([^}]+)}/g) || []).forEach(function(tok) { if (!seen[tok]) { seen[tok] = 1; toks.push(tok); } });
  const apply = function() {
    const el = document.getElementById("alertText");
    if (el) el.value = text;
    if (state.alertCfg) state.alertCfg.text = text;
    notify("✍️ Текст готовий — натисни «Показати» в «Оголошення ПОВЕРХ слайда»");
  };
  const ask = function(idx) {
    if (idx >= toks.length) { apply(); return; }
    const tok = toks[idx];
    pv2Prompt(tok.slice(1, -1) + ":", "", function(val) {
      text = text.split(tok).join(val == null ? "" : val);
      ask(idx + 1);
    });
  };
  ask(0);
}

function renderMsgTemplatesCard() {
  const list = state.msgTemplates || [];
  const items = list.length
    ? list.map((t, i) => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <button class="btn btn-ghost btn-sm" style="flex:1;text-align:left" onclick="useMsgTemplate(${i})" title="${esc(t.text)}">✍️ ${esc(t.name)}</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteMsgTemplate(${i})">✕</button></div>`).join('')
    : '<div class="card-sub">Немає шаблонів. Створи типові оголошення з підстановками.</div>';
  return `<div class="card">
    <div class="card-title">✍️ Шаблони повідомлень</div>
    <div class="card-sub">Готові оголошення з токенами: {дата}, {час} — автоматично; інші (напр. {ім'я}) спитає. Заповнене йде в поле «Оголошення» вище — там тиснеш «Показати».</div>
    <div style="margin-top:6px">${items}</div>
    <button class="btn btn-primary btn-sm btn-block" style="margin-top:6px" onclick="addMsgTemplate()">➕ Новий шаблон</button>
  </div>`;
}

function renderPropsCard() {
  const props = state.props || [];
  const items = props.length
    ? props.map((p, i) => {
        const on = state.activePropName === p.name;
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <button class="btn ${on ? 'btn-success' : 'btn-ghost'} btn-sm" style="flex:1;text-align:left" onclick="toggleProp(${i})">${on ? '● ' : '○ '}${esc(p.name)}</button>
          <button class="btn btn-ghost btn-sm" onclick="setPropAutoHide(${i})" title="Авто-приховати через N хв">⏱${p.autoHide > 0 ? p.autoHide + 'хв' : ''}</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteProp(${i})" title="Видалити">✕</button>
        </div>`;
      }).join('')
    : '<div class="card-sub">Немає збережених. Введи текст у «Оголошення ПОВЕРХ слайда» вище і натисни «➕ Зберегти як props».</div>';
  return `<div class="card" style="border-color:var(--accent)">
    <div class="card-title">📌 Props — постійні накладки</div>
    <div class="card-sub">Збережені повідомлення, що висять поверх будь-якого контенту, поки не вимкнеш (напр. «🔴 ПРЯМИЙ ЕФІР»). Клік — увімкнути/вимкнути.</div>
    <div style="margin-top:6px">${items}</div>
    <button class="btn btn-primary btn-sm btn-block" style="margin-top:6px" onclick="savePropFromAlert()">➕ Зберегти поточне оголошення як props</button>
  </div>`;
}

// ---- Аудіо-бін: короткі звуки по кліку (амінь, аплодисменти, дзвіночок…) ---
let _soundBinPlaying = [];
function loadSoundBin() { const d = loadJSON('church_soundbin'); state.soundBin = Array.isArray(d) ? d : []; }
function saveSoundBin() { saveJSON('church_soundbin', (state.soundBin || []).filter(s => !s.session)); }
function loadSoundToBin(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  state.soundBin = state.soundBin || [];
  let pending = files.length;
  files.forEach(function(f) {
    const add = function(src, session) {
      state.soundBin.push({ name: f.name.replace(/\.[^.]+$/, ''), src: src, session: !!session });
      if (--pending === 0) { saveSoundBin(); renderTabInto('layers'); notify('🔊 Додано звуків: ' + files.length); }
    };
    if (f.path && typeof pathToFileUrl === 'function') {
      ensureSupportedMedia(f.path, function(cpath) { add(pathToFileUrl(cpath), false); });
    } else {
      add(URL.createObjectURL(f), true);
    }
  });
  input.value = '';
}
function playSound(i) {
  const s = state.soundBin[i]; if (!s) return;
  try {
    const a = new Audio(s.src);
    a.play().catch(() => notify('⚠️ Не вдалось відтворити'));
    _soundBinPlaying.push(a);
    a.onended = function() { _soundBinPlaying = _soundBinPlaying.filter(x => x !== a); };
  } catch (e) { notify('⚠️ Помилка звуку'); }
}
function stopAllSounds() {
  _soundBinPlaying.forEach(a => { try { a.pause(); } catch (e) {} });
  _soundBinPlaying = [];
  notify('⏹ Звуки зупинено');
}
function removeSound(i) {
  if (!state.soundBin[i]) return;
  state.soundBin.splice(i, 1);
  saveSoundBin();
  renderTabInto('layers');
}
function renderSoundBinCard() {
  const bin = state.soundBin || [];
  const btns = bin.length
    ? bin.map((s, i) => `<div style="display:flex;gap:3px;margin:2px 0">
        <button class="btn btn-ghost btn-sm" style="flex:1;text-align:left" onclick="playSound(${i})">🔊 ${esc(s.name)}</button>
        <button class="btn btn-ghost btn-sm" onclick="removeSound(${i})" title="Прибрати">✕</button></div>`).join('')
    : '<div class="card-sub">Порожньо — додай короткі звуки (амінь, аплодисменти, дзвіночок…).</div>';
  return `<div class="card">
    <div class="card-title">🔊 Звукові кнопки</div>
    <div class="card-sub">Короткі звуки по кліку (можуть накладатись). Довгу фонову музику став у картці вище.</div>
    <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" multiple onchange="loadSoundToBin(this)" style="font-size:11px;width:100%;margin-top:6px">
    <div style="margin-top:6px">${btns}</div>
    ${bin.length ? '<button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="stopAllSounds()">⏹ Зупинити всі</button>' : ''}
  </div>`;
}

// ---- Фонова музика з плавним затуханням ----
let _bgAudioEl = null;
function loadBgAudio(input) {
  const f = input.files[0];
  if (!f) return;
  if (_bgAudioEl) {
    _bgAudioEl.pause();
    clearInterval(_bgAudioEl._fade);
    // Звільняємо попередній blob — інакше кожен новий файл лишав копію в пам'яті
    if (_bgAudioEl._url) URL.revokeObjectURL(_bgAudioEl._url);
  }
  const url = URL.createObjectURL(f);
  _bgAudioEl = new Audio(url);
  _bgAudioEl._url = url;
  _bgAudioEl.loop = true;
  _bgAudioEl.volume = 0;
  state.bgAudio.name = f.name;
  renderTabInto('layers');
  notify('🎵 ' + f.name);
  input.value = '';
}
function fadeAudio(to, ms, cb) {
  if (!_bgAudioEl) return;
  const from = _bgAudioEl.volume;
  const start = Date.now();
  clearInterval(_bgAudioEl._fade);
  _bgAudioEl._fade = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / ms);
    _bgAudioEl.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t >= 1) { clearInterval(_bgAudioEl._fade); if (cb) cb(); }
  }, 40);
}
function playBgAudio() {
  if (!_bgAudioEl) { notify('⚠️ Спершу обери файл'); return; }
  _bgAudioEl.play().catch(() => notify('⚠️ Не вдалось відтворити'));
  fadeAudio(state.bgAudio.volume, 2000);   // плавний вхід за 2 с
  state.bgAudio.playing = true;
  renderTabInto('layers');
  notify('🎵 Фонова музика (плавно)');
}
function stopBgAudio() {
  if (!_bgAudioEl) return;
  fadeAudio(0, 2500, () => { _bgAudioEl.pause(); });   // плавне затухання
  state.bgAudio.playing = false;
  renderTabInto('layers');
  notify('🎵 Затухання...');
}
function setBgVolume(v) {
  state.bgAudio.volume = v / 100;
  if (_bgAudioEl && state.bgAudio.playing) _bgAudioEl.volume = state.bgAudio.volume;
  saveLayers();
  const lbl = $('#bgVolLabel');
  if (lbl) lbl.textContent = v + '%';
}


// ---- Мітки частин пісні (Куплет/Приспів/Міст…) з кольором -----------------
const PART_TYPES = {
  verse:     { label: 'Куплет',       color: '#6b7280' },
  chorus:    { label: 'Приспів',      color: '#16a34a' },
  prechorus: { label: 'Передприспів', color: '#0d9488' },
  bridge:    { label: 'Міст',         color: '#7c3aed' },
  intro:     { label: 'Вступ',        color: '#475569' },
  ending:    { label: 'Кінцівка',     color: '#d4a017' },
  tag:       { label: 'Тег',          color: '#ea580c' }
};
function loadPartLabels() { const d = loadJSON('church_partlabels'); state.partLabels = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; }
function savePartLabels() { saveJSON('church_partlabels', state.partLabels); }
function partKeyOf(song, idx) {
  const m = state.partLabels && state.partLabels[songKey(song)];
  return (m && m[idx]) || 'verse';
}
function setPartLabel(idx, type) {
  if (!state.selectedSong) return;
  const k = songKey(state.selectedSong);
  state.partLabels = state.partLabels || {};
  state.partLabels[k] = state.partLabels[k] || {};
  if (type === 'verse') delete state.partLabels[k][idx]; else state.partLabels[k][idx] = type;
  if (!Object.keys(state.partLabels[k]).length) delete state.partLabels[k];
  savePartLabels();
  renderTabInto('song');
}
function partBadge(song, idx) {
  const key = partKeyOf(song, idx);
  const t = PART_TYPES[key] || PART_TYPES.verse;
  return { key: key, label: t.label + ' ' + (idx + 1), color: t.color };
}

// ---- Кілька збережених аранжувань на пісню (Недільний/Акустика/…) ---------
function loadArrangeSets() { const d = loadJSON('church_arrangesets'); state.arrangeSets = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; }
function saveArrangeSets() { saveJSON('church_arrangesets', state.arrangeSets); }
function saveNamedArrangement() {
  const s = state.selectedSong; if (!s) return;
  pv2Prompt('Назва аранжування (напр. «Недільний», «Акустика», «Скорочений»):', '', function(name) {
    if (name === null) return;
    const nm = name.trim(); if (!nm) return;
    const k = songKey(s);
    state.arrangeSets = state.arrangeSets || {};
    state.arrangeSets[k] = state.arrangeSets[k] || {};
    state.arrangeSets[k][nm] = songOrder(s).slice();
    saveArrangeSets();
    renderTabInto('song');
    notify('💾 Аранжування «' + nm + '» збережено');
  });
}
function loadNamedArrangement(name) {
  const s = state.selectedSong; if (!s) return;
  const set = state.arrangeSets && state.arrangeSets[songKey(s)];
  if (!set || !set[name]) return;
  setSongOrder(s, set[name].slice());   // робить активним + re-render + notify
}
function deleteNamedArrangement(name) {
  const s = state.selectedSong; if (!s) return;
  const k = songKey(s);
  if (!state.arrangeSets || !state.arrangeSets[k]) return;
  if (!confirm('Видалити аранжування «' + name + '»?')) return;
  delete state.arrangeSets[k][name];
  if (!Object.keys(state.arrangeSets[k]).length) delete state.arrangeSets[k];
  saveArrangeSets();
  renderTabInto('song');
}
function renderArrangeSets(s) {
  const set = (state.arrangeSets && state.arrangeSets[songKey(s)]) || {};
  const names = Object.keys(set);
  const esc1 = (x) => String(x).replace(/'/g, "\\'");
  const chips = names.length
    ? names.map(nm => `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px;padding:3px 7px;border:1px solid var(--accent);border-radius:6px;font-size:11px">
        <b onclick="loadNamedArrangement('${esc1(nm)}')" style="cursor:pointer">${esc(nm)}</b>
        <span onclick="deleteNamedArrangement('${esc1(nm)}')" style="cursor:pointer;color:var(--red)">✕</span></span>`).join('')
    : '<span style="font-size:11px;color:var(--text2)">Немає збережених варіантів</span>';
  return `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
    <div style="font-size:11px;color:var(--text2);margin-bottom:4px">📚 Кілька аранжувань — клік завантажує:</div>
    <div>${chips}</div>
    <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="saveNamedArrangement()">💾 Зберегти поточний порядок як…</button>
  </div>`;
}

// ---- Вкладка «Пісня»: порядок частин + розбиття ----
function renderSongTab() {
  const s = state.selectedSong;
  if (!s || !s.verses) {
    return '<div class="card"><div class="card-title">🎵 Пісня</div><div class="card-sub">Обери пісню у вкладці «Пісні».</div></div>';
  }
  const order = songOrder(s);
  const slides = songSlides(s);
  const sc = state.splitCfg;

  const _liveKey = (typeof songKey === 'function') ? songKey(s) : '';
  const orderChips = order.map((idx, pos) => {
    const b = partBadge(s, idx);
    const active = (state._slideSong === _liveKey && state.slideIdx === pos);
    const ring = active ? 'box-shadow:0 0 0 2px #22c55e;' : '';
    return `<span draggable="true" ondragstart="orderDragStart(event,${pos})" ondragover="orderDragOver(event)" ondrop="orderDrop(event,${pos})" title="Перетягни, щоб змінити порядок" style="display:inline-flex;align-items:center;gap:3px;background:${b.color};color:#fff;
                  border-radius:5px;padding:3px 6px;font-size:11px;margin:2px;cursor:grab;${ring}">
       ${active ? '▶ ' : ''}${esc(b.label)}
       <button onclick="orderRemoveAt(${pos})" style="background:none;border:none;color:#fff;cursor:pointer;font-size:12px;padding:0 2px">✕</button>
     </span>`;
  }).join('');

  const addBtns = s.verses.map((v, i) => {
    const b = partBadge(s, i);
    return `<button class="preset-btn" style="border-left:3px solid ${b.color}" onclick="orderAdd(${i})">+ ${esc(b.label)}</button>`;
  }).join(' ');

  const partOpts = (cur) => Object.keys(PART_TYPES).map(k =>
    `<option value="${k}"${k === cur ? ' selected' : ''}>${PART_TYPES[k].label}</option>`).join('');
  const partsEditor = s.verses.map((v, i) => {
    const b = partBadge(s, i);
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
       <span style="width:13px;height:13px;border-radius:3px;background:${b.color};flex:none"></span>
       <span style="width:18px;font-size:11px;color:var(--text2)">${i + 1}</span>
       <select onchange="setPartLabel(${i}, this.value)" style="font-size:11px">${partOpts(partKeyOf(s, i))}</select>
       <span style="flex:1;font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(String(v).split('\n')[0].slice(0, 30))}</span>
     </div>`;
  }).join('');

  const slideList = slides.map((sl, i) =>
    `<div style="padding:4px 6px;border-bottom:1px solid var(--border);font-size:11px;cursor:pointer;
                 background:${i === state.slideIdx ? 'var(--panel2)' : 'transparent'}"
          onclick="state.slideIdx=${i - 1}; songStep(1)">
       <b style="color:var(--accent)">${sl.verseIdx + 1}${sl.parts > 1 ? '.' + sl.part : ''}</b>
       <span style="color:var(--text2)">${esc(String(sl.text).split('\n')[0].slice(0, 40))}…</span>
       ${sl.parts > 1 ? `<span style="color:var(--gold);font-size:12px"> (слайд ${sl.part} з ${sl.parts})</span>` : ''}
     </div>`).join('');

  return `
  <div class="grid2">
    <div class="card">
      <div class="card-title">🎵 Порядок частин — «${esc(s.title)}»</div>
      <div class="card-sub">Домовились співати приспів двічі? Склади порядок один раз — далі просто гортаєш. Чипи можна <b>перетягувати мишкою</b>, щоб змінити порядок. Або увімкни перемикач нижче — приспів сам стане після кожного куплета.</div>
      <div style="margin-top:6px;min-height:30px">${orderChips || '<span style="font-size:11px;color:var(--text2)">Порожньо</span>'}</div>
      <div style="margin-top:6px;display:flex;gap:3px;flex-wrap:wrap">${addBtns}</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;background:linear-gradient(135deg,rgba(124,92,255,.14),rgba(79,155,255,.08));border:1px solid var(--accent);border-radius:7px;font-size:13px;cursor:pointer">
        <input type="checkbox" style="width:16px;height:16px;cursor:pointer" ${state.arrangeGlobal ? 'checked' : ''} onchange="toggleArrangeGlobal(this.checked)">
        <span>🌍 <b>Приспів після кожного — ДЛЯ ВСІХ пісень</b> (увімкни раз — діє скрізь)</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;background:var(--panel2);border:1px solid var(--border);border-radius:7px;font-size:13px;cursor:pointer">
        <input type="checkbox" style="width:16px;height:16px;cursor:pointer" ${state.chorusEach[songKey(s)] ? 'checked' : ''} onchange="toggleChorusEach(this.checked)">
        <span>🔁 <b>Приспів після кожного куплета</b> — увімкни, і порядок збудується сам</span>
      </label>
      <select onchange="applyArrangePreset(this.value); this.value=''" style="width:100%;margin-top:6px;background:var(--panel2);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text);font-size:12px;cursor:pointer">
        <option value="">📋 Інші готові варіанти…</option>
        <option value="end">Приспів лише в кінці</option>
        <option value="frame">Приспів спочатку і в кінці</option>
        <option value="last2">Приспів після кожного + останній куплет двічі</option>
        <option value="verses">Тільки куплети (без приспіву)</option>
        <option value="plain">↺ Усі підряд (скинути порядок)</option>
      </select>
      <details style="margin-top:8px">
        <summary style="font-size:11px;cursor:pointer;color:var(--text2)">🏷 Мітки частин (Куплет / Приспів / Міст…)</summary>
        <div style="margin-top:6px">${partsEditor}</div>
      </details>
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="orderReset()">↺ Скинути (усі підряд)</button>
      ${renderArrangeSets(s)}
    </div>

    <div class="card">
      <div class="card-title">✂️ Розбиття довгих куплетів</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
        <input type="checkbox" ${sc.on ? 'checked' : ''} onchange="setSplit('on', this.checked)">
        Розбивати довгий текст на кілька слайдів
      </label>
      <div style="font-size:12px;color:var(--text2);margin-top:6px">Максимум рядків на слайд: <b>${sc.maxLines}</b></div>
      <input type="range" min="2" max="8" value="${sc.maxLines}" onchange="setSplit('maxLines', parseInt(this.value,10))" style="width:100%">
      <div style="font-size:12px;color:var(--text2)">Максимум символів: <b>${sc.maxChars}</b></div>
      <input type="range" min="80" max="400" step="20" value="${sc.maxChars}" onchange="setSplit('maxChars', parseInt(this.value,10))" style="width:100%">
      <div class="card-sub" style="margin-top:4px">Дрібний шрифт у великому залі не читається — краще два слайди.</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">📃 Слайди пісні (${slides.length})</div>
    <div style="display:flex;gap:4px;margin-bottom:6px;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="songStep(-1)">◀ Назад</button>
      <button class="btn btn-primary btn-sm" onclick="songStep(1)">Далі ▶</button>
      <button class="btn btn-ghost btn-sm" onclick="state.slideIdx=-1; songStep(1)">⏮ Спочатку</button>
      <span style="flex:1"></span>
      <span style="font-size:10px;color:var(--text2)">Розмір:</span>
      <button class="btn btn-ghost btn-sm" onclick="songSizeStep(-4)" title="Менший шрифт пісні">A−</button>
      <span style="font-size:11px;font-weight:700;min-width:38px;text-align:center;color:var(--accent)">${state.songSize ? state.songSize + 'px' : 'авто'}</span>
      <button class="btn btn-ghost btn-sm" onclick="songSizeStep(4)" title="Більший шрифт пісні">A+</button>
      ${state.songSize ? '<button class="btn btn-ghost btn-sm" onclick="songSizeReset()" title="Повернути авто-підгін">↺</button>' : ''}
    </div>
    <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:5px">${slideList}</div>
  </div>`;
}


// ============================================================
// ТИПОГРАФІКА ВИВОДУ
// ============================================================
const TYPO_DEFAULTS = {
  lineHeight: 1.45, letterSpacing: 0, uppercase: false,
  strokeWidth: 0, strokeColor: '#000000',
  scrim: 0, scrimBlur: 0, safeArea: 0, fadeMs: 600
};

function typoGet() {
  return Object.assign({}, TYPO_DEFAULTS, loadJSON(STORAGE_KEYS.live + '_typo') || {});
}
function setTypo(key, val) {
  const t = typoGet();
  t[key] = val;
  saveJSON(STORAGE_KEYS.live + '_typo', t);
  applyTypo();
  const labels = {
    lineHeight: ['#typoLhLabel', v => v],
    letterSpacing: ['#typoLsLabel', v => v + 'px'],
    strokeWidth: ['#typoStrokeLabel', v => v ? v + 'px' : 'вимк'],
    scrim: ['#typoScrimLabel', v => Math.round(v * 100) + '%'],
    safeArea: ['#typoSafeLabel', v => v + '%'],
    fadeMs: ['#typoFadeLabel', v => (v / 1000).toFixed(2) + ' с']
  };
  const L = labels[key];
  if (L && $(L[0])) $(L[0]).textContent = L[1](val);
  if (['uppercase','scrimBlur'].includes(key)) renderTabInto('typo');
}
// Типографіка живе в темі проектора — шлемо її туди
function applyTypo() {
  const t = typoGet();
  if (typeof theme !== 'undefined' && theme) Object.assign(theme, t);
  if (window.electronAPI && window.electronAPI.setTheme) {
    window.electronAPI.setTheme(typeof theme !== 'undefined' ? theme : t);
  }
  updateLivePanels();
}

// Фіксуємо розмір шрифту під найдовший слайд пісні — щоб текст не «стрибав»
function lockSizeForSong() {
  if (!window.electronAPI || !window.electronAPI.setFitGroup) return;
  const s = state.selectedSong;
  if (!s) { window.electronAPI.setFitGroup([], null); return; }
  const slides = songSlides(s).map(sl => hallText(sl.text).replace(/\n/g, '<br>'));
  window.electronAPI.setFitGroup(slides, null);
}

// Розмір шрифту ПІСНІ, який тримається між куплетами і між піснями.
// state.songSize=null → авто-підгін під найдовший слайд (як було раніше).
// Інакше — точний зафіксований розмір, заданий кнопками A− / A+ (не зменшується).
function applySongSize() {
  if (!window.electronAPI) return;
  if (state.songSize && window.electronAPI.setLockedSize) {
    window.electronAPI.setLockedSize(state.songSize, null);
  } else {
    lockSizeForSong();
  }
}
function saveSongSize() { saveJSON(STORAGE_KEYS.live + '_songsize', { size: state.songSize }); }
function loadSongSize() {
  const c = loadJSON(STORAGE_KEYS.live + '_songsize');
  if (c && typeof c.size === 'number') state.songSize = c.size;
}
function songSizeStep(delta) {
  const base = state.songSize || 58;
  state.songSize = Math.max(20, Math.min(140, base + delta));
  saveSongSize();
  applySongSize();
  if (state.selectedSong) songStep(0);           // перемалювати поточний слайд новим розміром
  ['song','typo'].forEach(t => { if (typeof isActive === 'function' && isActive(t)) renderTabInto(t); });
  notify('🔤 Розмір пісні: ' + state.songSize + 'px (тримається і для наступних)');
}
function songSizeReset() {
  state.songSize = null;
  saveSongSize();
  if (window.electronAPI && window.electronAPI.setLockedSize) window.electronAPI.setLockedSize(null, null);
  lockSizeForSong();
  if (state.selectedSong) songStep(0);
  ['song','typo'].forEach(t => { if (typeof isActive === 'function' && isActive(t)) renderTabInto(t); });
  notify('↺ Розмір пісні: авто-підгін');
}

function renderTypoTab() {
  const t = typoGet();
  return `
  <div class="grid2">
    <div class="card">
      <div class="card-title">🔠 Читабельність</div>

      <div style="font-size:12px;color:var(--text2)">Міжрядковий інтервал: <b id="typoLhLabel">${t.lineHeight}</b></div>
      <input type="range" min="10" max="22" value="${Math.round(t.lineHeight*10)}"
             oninput="setTypo('lineHeight', parseInt(this.value,10)/10)" style="width:100%">

      <div style="font-size:12px;color:var(--text2)">Міжлітерний інтервал: <b id="typoLsLabel">${t.letterSpacing}px</b></div>
      <input type="range" min="-2" max="8" value="${t.letterSpacing}"
             oninput="setTypo('letterSpacing', parseInt(this.value,10))" style="width:100%">

      <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;margin-top:6px">
        <input type="checkbox" ${t.uppercase ? 'checked' : ''} onchange="setTypo('uppercase', this.checked)">
        ВЕЛИКИМИ ЛІТЕРАМИ
      </label>

      <div style="font-size:12px;color:var(--text2);margin-top:8px">Швидкість переходу: <b id="typoFadeLabel">${(t.fadeMs/1000).toFixed(2)} с</b></div>
      <input type="range" min="150" max="1500" step="50" value="${t.fadeMs}"
             oninput="setTypo('fadeMs', parseInt(this.value,10))" style="width:100%">
    </div>

    <div class="card">
      <div class="card-title">🎬 Текст поверх відео</div>
      <div class="card-sub">На строкатому відео-фоні самої тіні мало. Контур і підкладка рятують.</div>

      <div style="font-size:12px;color:var(--text2);margin-top:6px">Контур літер: <b id="typoStrokeLabel">${t.strokeWidth ? t.strokeWidth + 'px' : 'вимк'}</b></div>
      <input type="range" min="0" max="6" value="${t.strokeWidth}"
             oninput="setTypo('strokeWidth', parseInt(this.value,10))" style="width:100%">
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
        <span style="font-size:12px;color:var(--text2)">Колір контуру</span>
        <input type="color" value="${t.strokeColor}" oninput="setTypo('strokeColor', this.value)"
               style="width:40px;height:24px;border:none;background:none">
      </div>

      <div style="font-size:12px;color:var(--text2);margin-top:8px">Підкладка під текстом: <b id="typoScrimLabel">${Math.round(t.scrim*100)}%</b></div>
      <input type="range" min="0" max="90" value="${Math.round(t.scrim*100)}"
             oninput="setTypo('scrim', parseInt(this.value,10)/100)" style="width:100%">
      ${t.scrim > 0 ? `<label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
        <input type="checkbox" ${t.scrimBlur ? 'checked' : ''} onchange="setTypo('scrimBlur', this.checked ? 12 : 0)">
        Розмити фон під текстом
      </label>` : ''}

      <div style="font-size:12px;color:var(--text2);margin-top:8px">Безпечні поля (обрізка країв ТВ): <b id="typoSafeLabel">${t.safeArea}%</b></div>
      <input type="range" min="0" max="10" value="${t.safeArea}"
             oninput="setTypo('safeArea', parseInt(this.value,10))" style="width:100%">
    </div>
  </div>

  <div class="card">
    <div class="card-title">📏 Стабільний розмір шрифту</div>
    <div class="card-sub">
      Авто-вміщення підбирає розмір під кожен слайд окремо — і текст «стрибає» між куплетами (58px → 42px → 58px).
      Ця кнопка рахує розмір, що влазить у <b>найдовший</b> слайд, і тримає його на всю пісню.
    </div>
    <button class="btn btn-primary btn-sm btn-block" style="margin-top:6px" onclick="lockSizeForSong()">
      📏 Зафіксувати розмір під поточну пісню
    </button>
    <div class="flex" style="gap:4px;margin-top:8px;align-items:center;justify-content:center">
      <button class="btn btn-ghost btn-sm" onclick="songSizeStep(-4)">A−</button>
      <span style="font-size:12px;font-weight:700;min-width:52px;text-align:center;color:var(--accent)">${state.songSize ? state.songSize + 'px' : 'авто'}</span>
      <button class="btn btn-ghost btn-sm" onclick="songSizeStep(4)">A+</button>
      <button class="btn btn-ghost btn-sm" onclick="songSizeReset()">↺ Авто</button>
    </div>
    <div class="card-sub" style="margin-top:4px">Заданий тут розмір НЕ зменшується на наступних куплетах і <b>переходить на наступну пісню</b> — задав один раз і забув. «↺ Авто» повертає підбір під кожну пісню.</div>
    <button class="btn btn-ghost btn-sm btn-block" style="margin-top:4px" onclick="window.electronAPI && window.electronAPI.setFitGroup([], null); notify('Розмір знову підбирається під кожен слайд')">
      ↺ Скинути (розмір під кожен слайд)
    </button>
  </div>`;
}


// ============================================================
// ПЛАН СЛУЖІННЯ (переписано)
// Було: план зберігав лише НАЗВУ пісні і показував перший куплет —
// провести по ньому службу було неможливо. Тепер елемент плану
// розкривається у всі свої слайди, гортається, і після останнього
// автоматично переходить до наступного пункту.
// ============================================================

function saveService() { saveJSON(STORAGE_KEYS.live + '_service', state.service); }
function loadService() {
  const s = loadJSON(STORAGE_KEYS.live + '_service');
  if (s) state.service = Object.assign({ name: '', date: '', items: [], idx: -1, slideIdx: 0, saved: [] }, s);
}

// ---- Наповнення плану ----
function svcAddSong(songId) {
  const s = state.songs.find(x => String(x.id) === String(songId));
  if (!s) { notify('⚠️ Пісню не знайдено'); return; }
  state.service.items.push({ kind: 'song', id: s.id, title: s.title, note: '' });
  saveService(); renderTabInto('service');
  notify('➕ ' + s.title);
}
function svcAddBible() {
  const ref = ($('#svcBibleRef') && $('#svcBibleRef').value.trim()) || '';
  if (!ref) { notify('⚠️ Введи посилання, напр. Ів 3:16-18'); return; }
  state.service.items.push({ kind: 'bible', ref: ref, title: ref, note: '' });
  saveService(); renderTabInto('service');
}
function svcAddSimple(kind, title) {
  state.service.items.push({ kind: kind, title: title, note: '' });
  saveService(); renderTabInto('service');
}
function svcRemove(i) {
  state.service.items.splice(i, 1);
  // Видалення пункту ПЕРЕД поточним зсуває масив на 1 — покажчик має зсунутись
  // теж, інакше він тихо "перестрибує" й показує сусідній пункт як поточний.
  if (i < state.service.idx) state.service.idx--;
  if (state.service.idx >= state.service.items.length) state.service.idx = state.service.items.length - 1;
  saveService(); renderTabInto('service');
}

// Пункт плану «осиротів»: пісню видалили/перейменували в бібліотеці, і за id,
// і за title нічого не знайшлось. Дає прив'язати пункт до іншої пісні заново,
// не видаляючи його з плану (зберігає позицію, колір, тривалість).
function svcRelink(i, songId) {
  const items = state.service.items;
  const it = items[i];
  if (!it) return;
  const s = state.songs.find(x => String(x.id) === String(songId));
  if (!s) { notify('⚠️ Пісню не знайдено'); return; }
  it.id = s.id; it.title = s.title;
  svcInvalidate();
  saveService(); renderTabInto('service');
  notify('🔗 Прив\'язано: ' + s.title);
}

// Кольорові мітки пунктів плану — просто візуальне групування
// (прославлення / проповідь / технічна пауза тощо), на показ не впливає.
const SVC_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
function svcSetColor(i, color) {
  const items = state.service.items;
  if (!items[i]) return;
  items[i].color = (items[i].color === color) ? null : color; // повторний клік знімає мітку
  saveService(); renderTabInto('service');
}
function svcMove(i, delta) {
  const it = state.service.items;
  const j = i + delta;
  if (j < 0 || j >= it.length) return;
  [it[i], it[j]] = [it[j], it[i]];
  // Пункти помінялись місцями в масиві — якщо серед них був поточний
  // (виділений) пункт, покажчик має піти за ним, інакше "поточним" тихо
  // стає той пункт, що просто зайняв стару позицію.
  if (state.service.idx === i) state.service.idx = j;
  else if (state.service.idx === j) state.service.idx = i;
  saveService(); renderTabInto('service');
}


// parseQuickRef у додатку розуміє лише один вірш («Ів 3:16»).
// Для плану потрібні діапазони — «Ів 3:16-18», «Пс 23» (уся глава).
function svcParseRange(ref) {
  const raw = String(ref || '').trim();
  // Хвіст: -18 або –18 (тире або довге тире)
  const m = raw.match(/^(.*?)[\s]*[-–—][\s]*(\d+)\s*$/);
  const head = m ? m[1] : raw;
  const explicitTo = m ? parseInt(m[2], 10) : null;

  const parsed = (typeof parseQuickRef === 'function') ? parseQuickRef(head) : null;
  if (!parsed || !parsed.length) return null;
  const p = parsed[0];
  if (!p.bookId) return null;

  const chapter = p.chapter || 1;
  // Вірш не вказано → уся глава
  if (!p.verse) {
    let last = 1;
    for (let v = 1; v <= 200; v++) { if (getVerse(p.bookId, chapter, v)) last = v; else if (v > last + 3) break; }
    return { bookId: p.bookId, chapter: chapter, from: 1, to: last };
  }
  return {
    bookId: p.bookId, chapter: chapter,
    from: p.verse,
    to: explicitTo && explicitTo >= p.verse ? explicitTo : p.verse
  };
}

// ---- Розкриття елемента у слайди ----
const _svcCache = new Map();
function svcSlidesCacheKey(item) {
  // currentTranslationId МАЄ бути в ключі: інакше перегляд пункту-вірша,
  // перемикання перекладу Біблії й повернення до того ж пункту показує
  // застарілий (закешований на старому перекладі) текст.
  return JSON.stringify([item.kind, item.id, item.ref, item.title,
                         state.splitCfg.on, state.splitCfg.maxLines, state.splitCfg.maxChars,
                         item.id != null ? state.orders['ord_' + item.id] : null,
                         item.id != null && state.chorusEach ? !!state.chorusEach['ord_' + item.id] : null,
                         !!state.arrangeGlobal,
                         typeof currentTranslationId !== 'undefined' ? currentTranslationId : null]);
}
function svcInvalidate() { _svcCache.clear(); }

function svcSlides(item) {
  if (!item) return [];
  const ck = svcSlidesCacheKey(item);
  const hit = _svcCache.get(ck);
  if (hit) return hit;
  const res = svcSlidesRaw(item);
  if (_svcCache.size > 60) _svcCache.clear();
  _svcCache.set(ck, res);
  return res;
}

function svcSlidesRaw(item) {
  if (!item) return [];
  if (item.kind === 'song') {
    const s = state.songs.find(x => String(x.id) === String(item.id)) ||
              state.songs.find(x => x.title === item.title);
    if (!s) return [{ text: '⚠️ Пісню «' + item.title + '» не знайдено', ref: '' }];
    // Використовуємо порядок частин і розбиття довгих куплетів
    const slides = songSlides(s).map(sl => ({
      text: sl.text,
      ref: s.title + (sl.parts > 1 ? ' (' + sl.part + '/' + sl.parts + ')' : '')
    }));
    return slides.length ? slides : [{ text: '', ref: s.title }];
  }
  if (item.kind === 'bible') {
    const r = svcParseRange(item.ref);
    if (!r) return [{ text: '⚠️ Не розпізнано: ' + item.ref, ref: '' }];

    const out = [];
    for (let v = r.from; v <= r.to; v++) {
      const txt = getVerse(r.bookId, r.chapter, v);
      if (txt) {
        const name = (typeof getBookName === 'function' ? getBookName(r.bookId) : r.bookId);
        out.push({ text: txt, ref: name + ' ' + r.chapter + ':' + v });
      }
    }
    return out.length ? out : [{ text: '⚠️ Вірші не знайдені — переклад Біблії імпортовано?', ref: item.ref }];
  }
  // Порожні пункти (молитва, проповідь, пожертви) — без слайдів, лише позначка в плані
  return [];
}

// ---- Проведення служби ----

// Ручний вивід означає, що оператор більше не веде службу за планом.
// Без цього стрілки продовжували гортати ПЛАН (а наступний пункт міг бути піснею),
// хоча в залі вже стояв вибраний вручну вірш — саме через це «злітало».
function exitServicePlan() {
  try {
    if (state.service && state.service.idx >= 0) {
      state.service.idx = -1;
      if (typeof renderTabInto === 'function') renderTabInto('service');
    }
  } catch (e) {}
}

// Гарячі клавіші плану служби: цифри 1-9 → перейти до пункту N
// (лише коли відкрита вкладка «План служби» і фокус не в полі вводу).
document.addEventListener('keydown', function(e) {
  if (typeof isActive !== 'function' || !isActive('service')) return;
  var tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key >= '1' && e.key <= '9') {
    var idx = parseInt(e.key, 10) - 1;
    if (state.service && state.service.items && idx < state.service.items.length) { e.preventDefault(); svcGoTo(idx); }
  }
});

function svcGoTo(i) {
  const items = state.service.items;
  if (i < 0 || i >= items.length) return;
  state.service.idx = i;
  state.service.slideIdx = 0;
  saveService();
  const slides = svcSlides(items[i]);
  if (!slides.length) {
    renderTabInto('service');
    notify('▶ ' + items[i].title + ' (без слайдів)');
    return;
  }
  svcShowSlide(0);
}

function svcShowSlide(si) {
  const item = state.service.items[state.service.idx];
  if (!item) return;
  const slides = svcSlides(item);
  if (!slides.length) return;
  si = Math.max(0, Math.min(slides.length - 1, si));
  state.service.slideIdx = si;
  saveService();

  const sl = slides[si];
  stageContent({
    kind: 'text', rawText: sl.text, html: hallText(sl.text).replace(/\n/g, '<br>'),
    ref: sl.ref || '', label: item.title + ' — ' + (si + 1) + '/' + slides.length,
    verseIdx: si
  });
  if (state.liveMode !== 'staged') goLive();
  renderTabInto('service');
}

// Далі: наступний слайд, а в кінці елемента — автоматично наступний пункт плану
function svcNext() {
  const item = state.service.items[state.service.idx];
  if (!item) { svcGoTo(0); return; }
  const slides = svcSlides(item);
  if (state.service.slideIdx + 1 < slides.length) {
    svcShowSlide(state.service.slideIdx + 1);
  } else if (state.service.idx + 1 < state.service.items.length) {
    svcGoTo(state.service.idx + 1);
    notify('▶ Далі: ' + state.service.items[state.service.idx].title);
  } else {
    notify('Кінець плану');
  }
}
function svcPrev() {
  if (state.service.slideIdx > 0) {
    svcShowSlide(state.service.slideIdx - 1);
  } else if (state.service.idx > 0) {
    const pi = state.service.idx - 1;
    state.service.idx = pi;
    const slides = svcSlides(state.service.items[pi]);
    svcShowSlide(Math.max(0, slides.length - 1));
  }
}

// ---- Збереження планів (напр. «Неділя 20.07») ----
function svcSaveAs() {
  pv2Prompt('Назва плану:', state.service.name || ('Служіння ' + new Date().toLocaleDateString('uk-UA')), function(name){
  if (!name) return;
  state.service.name = name;
  const copy = { name: name, date: new Date().toISOString().slice(0, 10), items: JSON.parse(JSON.stringify(state.service.items)) };
  state.service.saved = (state.service.saved || []).filter(p => p.name !== name);
  state.service.saved.push(copy);
  saveService(); renderTabInto('service');
  notify('💾 План «' + name + '» збережено');
  });
}
// Приймаємо індекс, а не назву: апостроф в українській назві («П'ятниця»)
// розривав JS-рядок в onclick і кнопка переставала працювати.
function svcLoad(i) {
  const p = (state.service.saved || [])[i];
  if (!p) return;
  state.service.items = JSON.parse(JSON.stringify(p.items));
  state.service.name = p.name;
  state.service.idx = -1;
  saveService(); renderTabInto('service');
  notify('📂 План «' + p.name + '» завантажено');
}
function svcDelete(i) {
  const p = (state.service.saved || [])[i];
  if (!p || !confirm('Видалити план «' + p.name + '»?')) return;
  state.service.saved.splice(i, 1);
  saveService(); renderTabInto('service');
}
// Копіювати збережений план під новою назвою — щоб узяти «як минулого тижня»
// й підправити, не чіпаючи оригінал.
function svcDuplicate(i) {
  const p = (state.service.saved || [])[i];
  if (!p) return;
  pv2Prompt('Назва копії:', 'Копія — ' + p.name, function(name) {
    if (!name) return;
    const copy = { name: name, date: new Date().toISOString().slice(0, 10), items: JSON.parse(JSON.stringify(p.items)) };
    state.service.saved = (state.service.saved || []).filter(x => x.name !== name);
    state.service.saved.push(copy);
    saveService(); renderTabInto('service');
    notify('📄 Копія «' + name + '» створена');
  });
}
function svcClear() {
  if (!confirm('Очистити поточний план?')) return;
  state.service.items = [];
  state.service.idx = -1;
  saveService(); renderTabInto('service');
}
function svcExport() {
  downloadFile(JSON.stringify({ name: state.service.name, items: state.service.items }, null, 2),
    (state.service.name || 'план') + '.json', 'application/json');
}
function svcImport(input) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!Array.isArray(d.items)) throw new Error('Немає списку пунктів');
      state.service.items = d.items;
      state.service.name = d.name || '';
      state.service.idx = -1;
      saveService(); renderTabInto('service');
      notify('📥 План імпортовано: ' + d.items.length + ' пунктів');
    } catch (err) { notify('✗ ' + err.message); }
  };
  r.readAsText(f);
  input.value = '';
}

const SVC_ICONS = { song: '🎵', bible: '📖', announce: '📢', prayer: '🙏', sermon: '📣', offering: '💝', timer: '⏱', media: '🎬' };

// Оцінка часу на пункт — просто число хвилин, яке оператор вписує сам.
function svcSetDuration(i, min) {
  const items = state.service.items;
  if (!items[i]) return;
  const m = parseInt(min, 10);
  items[i].duration = (isFinite(m) && m > 0) ? m : 0;
  saveService();
}

function renderServiceTab() {
  const sv = state.service;
  const songOpts = state.songs.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('');
  const savedList = (sv.saved || []).map((p, pi) =>
    `<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--border)">
       <span style="flex:1;font-size:11px">${esc(p.name)} <span style="color:var(--text2)">(${p.items.length})</span></span>
       <button class="btn btn-ghost btn-sm" onclick="svcLoad(${pi})">📂</button>
       <button class="btn btn-ghost btn-sm" title="Копіювати під новою назвою" onclick="svcDuplicate(${pi})">📄</button>
       <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="svcDelete(${pi})">✕</button>
     </div>`).join('') || '<div style="font-size:11px;color:var(--text2)">Збережених планів немає</div>';

  const items = sv.items.map((it, i) => {
    const active = i === sv.idx;
    const slides = svcSlides(it);
    // Осиротілий пункт-пісня: id і title з бібліотеки нічого не знаходять
    // (пісню видалили/перейменували, або дубль-чекер прибрав збіг).
    const broken = it.kind === 'song' &&
      !state.songs.find(x => String(x.id) === String(it.id)) &&
      !state.songs.find(x => x.title === it.title);
    const borderColor = broken ? 'var(--red)' : (it.color || (active ? 'var(--accent)' : 'transparent'));
    const swatches = SVC_COLORS.map(c =>
      `<span onclick="svcSetColor(${i},'${c}')" title="Мітка"
             style="width:11px;height:11px;border-radius:50%;background:${c};cursor:pointer;
                    display:inline-block;box-shadow:${it.color === c ? '0 0 0 2px var(--text)' : 'none'}"></span>`
    ).join('');
    const relinkBar = broken ? `<div style="display:flex;gap:4px;margin-top:4px;align-items:center">
        <span style="font-size:11px;color:var(--red);white-space:nowrap">⚠️ пісню не знайдено —</span>
        <select id="svcRelink${i}" style="flex:1;min-width:0;background:var(--bg);border:1px solid var(--red);border-radius:3px;padding:2px;color:var(--text);font-size:11px" onclick="event.stopPropagation()">${songOpts}</select>
        <button class="btn btn-primary btn-sm" onclick="svcRelink(${i}, $('#svcRelink${i}').value)">🔗</button>
      </div>` : '';
    return `<div style="display:flex;align-items:center;gap:5px;padding:6px;border-bottom:1px solid var(--border);
                        background:${active ? 'var(--panel2)' : 'transparent'};border-left:3px solid ${borderColor}">
      <span style="font-size:15px">${broken ? '⚠️' : (SVC_ICONS[it.kind] || '•')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:${broken ? 'var(--red)' : 'var(--text)'};overflow:hidden;text-overflow:ellipsis">${esc(it.title)}</div>
        <div style="font-size:12px;color:var(--text2)">${broken ? 'пісню видалено або перейменовано в бібліотеці' : (slides.length ? slides.length + ' слайд(ів)' : 'без слайдів')}${active && !broken ? ' • зараз ' + (sv.slideIdx + 1) + '/' + slides.length : ''}</div>
        <div style="display:flex;gap:3px;margin-top:3px">${swatches}</div>
        ${relinkBar}
      </div>
      <input type="number" min="0" max="180" value="${it.duration || ''}" placeholder="хв" title="Орієнтовний час, хв"
             style="width:38px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:2px;color:var(--text);font-size:11px;text-align:center"
             onchange="svcSetDuration(${i}, this.value)">
      <button class="btn btn-success btn-sm" onclick="svcGoTo(${i})" ${broken ? 'disabled title="Спершу прив\'яжи пісню"' : ''}>▶</button>
      <button class="btn btn-ghost btn-sm" onclick="svcMove(${i},-1)">↑</button>
      <button class="btn btn-ghost btn-sm" onclick="svcMove(${i},1)">↓</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="svcRemove(${i})">✕</button>
    </div>`;
  }).join('') || '<div style="padding:10px;font-size:11px;color:var(--text2)">План порожній — додай пісні й вірші зліва</div>';
  // Орієнтовний загальний час служби — сума того, що оператор проставив по пунктах
  // (пункти без вказаного часу просто не рахуються, а не змушують ставити 0 всюди).
  const totalMin = sv.items.reduce((sum, it) => sum + (it.duration || 0), 0);
  const totalLabel = totalMin > 0
    ? `<div style="font-size:12px;color:var(--text2);margin-bottom:4px">⏱ Орієнтовний час служби: <b style="color:var(--text)">${Math.floor(totalMin / 60) ? Math.floor(totalMin / 60) + ' год ' : ''}${totalMin % 60} хв</b></div>`
    : '';

  return `
  <div class="grid2">
    <div>
      <div class="card">
        <div class="card-title">➕ Додати до плану</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">Пісня (весь текст, з порядком частин)</div>
        <div style="display:flex;gap:4px">
          <select id="svcSongPick" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">${songOpts}</select>
          <button class="btn btn-primary btn-sm" onclick="svcAddSong($('#svcSongPick').value)">➕</button>
        </div>

        <div style="font-size:12px;color:var(--text2);margin-top:8px">Біблія (діапазон — кожен вірш окремим слайдом)</div>
        <div style="display:flex;gap:4px">
          <input id="svcBibleRef" type="text" placeholder="Ів 3:16-18"
                 style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none"
                 onkeydown="if(event.key==='Enter')svcAddBible()">
          <button class="btn btn-primary btn-sm" onclick="svcAddBible()">➕</button>
        </div>

        <div style="font-size:12px;color:var(--text2);margin-top:8px">Пункти без слайдів (для порядку служби)</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          <button class="preset-btn" onclick="svcAddSimple('prayer','Молитва')">🙏 Молитва</button>
          <button class="preset-btn" onclick="svcAddSimple('sermon','Проповідь')">📣 Проповідь</button>
          <button class="preset-btn" onclick="svcAddSimple('offering','Пожертви')">💝 Пожертви</button>
          <button class="preset-btn" onclick="svcAddSimple('announce','Оголошення')">📢 Оголошення</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">💾 Збережені плани</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
          <button class="btn btn-primary btn-sm" onclick="svcSaveAs()">💾 Зберегти як…</button>
          <button class="btn btn-ghost btn-sm" onclick="svcExport()">⬇ Експорт</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('svcImportInput').click()">📥 Імпорт</button>
          <input type="file" id="svcImportInput" accept=".json" style="display:none" onchange="svcImport(this)">
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="svcClear()">🗑 Очистити</button>
        </div>
        ${savedList}
      </div>
    </div>

    <div>
      <div class="card" style="border-color:var(--accent)">
        <div class="card-title">📅 План${sv.name ? ' — ' + esc(sv.name) : ''} (${sv.items.length})</div>
        <div class="card-sub">Тисни ▶ на пункті — і далі просто «Наступний». Після останнього слайда пісні план сам переходить до наступного пункту.</div>
        <div style="display:flex;gap:6px;margin:10px 0;align-items:stretch">
          <button class="btn btn-ghost" style="font-size:15px;padding:14px 16px" onclick="svcPrev()">◀</button>
          <button class="btn btn-primary" style="flex:1;font-size:17px;font-weight:700;padding:14px" onclick="svcNext()">Наступний пункт ▶</button>
        </div>
        <div style="text-align:center;font-size:12px;color:var(--text2);margin:-4px 0 8px">${sv.idx >= 0 && sv.items[sv.idx] ? ('Зараз: <b style=\"color:var(--accent)\">' + esc(sv.items[sv.idx].title || '') + '</b> · пункт ' + (sv.idx + 1) + '/' + sv.items.length) : 'Обери пункт, щоб почати'}</div>
        ${totalLabel}
        <div style="max-height:420px;overflow-y:auto;border:1px solid var(--border);border-radius:5px">${items}</div>
      </div>
    </div>
  </div>`;
}


// ============================================================
// МОНІТОРИ (вдосконалено)
// ============================================================
function identifyDisplays() {
  if (window.electronAPI && window.electronAPI.identifyDisplays) {
    window.electronAPI.identifyDisplays(4);
    notify('🔢 Номери показані на всіх екранах (4 с)');
  }
}
function toggleTestPattern(n) {
  state.testPattern = state.testPattern || {};
  const kind = n ? OUT_KIND[n] : null;
  const key = n || 'all';
  state.testPattern[key] = !state.testPattern[key];
  if (window.electronAPI && window.electronAPI.testPattern) {
    window.electronAPI.testPattern(kind, state.testPattern[key]);
  }
  renderTabInto('monitors');
  notify(state.testPattern[key] ? '🎯 Тестова сітка увімкнена' : 'Сітку прибрано');
}

// Прив'язка виходу до монітора за «відбитком» — переживає перезавантаження
function bindOutputToDisplay(n, fingerprint) {
  if (!window.electronAPI || !window.electronAPI.bindOutputFingerprint) return;
  state.outputBind = state.outputBind || {};
  state.outputBind[OUT_KIND[n]] = fingerprint || null;
  saveJSON(STORAGE_KEYS.live + '_bind', state.outputBind);
  if (typeof logChange === 'function') {
    logChange('Прив\'язка ' + (OUT_NAME[n] || n), fingerprint ? 'закріплено за монітором' : 'прив\'язку знято');
  }
  window.electronAPI.bindOutputFingerprint(OUT_KIND[n], fingerprint).then(() => {
    refreshMonitors();
    notify(fingerprint ? '🔗 ' + OUT_NAME[n] + ' закріплено за монітором' : 'Прив\'язку знято');
  });
}
// Резервне дублювання: якщо закріплений за виходом монітор зникає посеред
// служби, автоматично перекинути вміст на інший, живий вихід — щоб зал не
// лишався без картинки, поки хтось не помітить і не виправить вручну.
function setOutputFailover(n, backupN) {
  state.outputFailover = state.outputFailover || {};
  state.outputFailover[n] = backupN ? parseInt(backupN, 10) : null;
  saveJSON(STORAGE_KEYS.live + '_failover', state.outputFailover);
  renderTabInto('monitors2');
  notify(backupN ? '🛟 ' + OUT_NAME[n] + ' → резерв: ' + OUT_NAME[backupN] : 'Резерв знято для ' + OUT_NAME[n]);
}
function loadOutputFailover() {
  const f = loadJSON(STORAGE_KEYS.live + '_failover');
  if (f) state.outputFailover = f;
}
function loadOutputBindings() {
  const b = loadJSON(STORAGE_KEYS.live + '_bind');
  if (!b) return;
  state.outputBind = b;
  if (window.electronAPI && window.electronAPI.restoreOutputBindings) {
    // Після перезавантаження Windows видає моніторам НОВІ id — відновлюємо за відбитком
    window.electronAPI.restoreOutputBindings(b).then(res => {
      const n = Object.keys(res || {}).length;
      if (n) notify('🔗 Відновлено прив\'язок моніторів: ' + n);
      refreshMonitors();
      if (typeof syncMonitorMissingBanner === 'function') syncMonitorMissingBanner();
    }).catch(() => {});
  }
}

function refreshMonitors() {
  if (!window.electronAPI || !window.electronAPI.getDisplays) return;
  window.electronAPI.getDisplays().then(list => {
    state.displays = list || [];
    // Вкладка зареєстрована під id 'monitors2' (пункт меню «Прив'язка екранів»).
    // 'monitors' — стара назва, яку renderTabInto ще розуміє, але isActive('monitors')
    // ніколи не був істинним після перейменування — оновлені дані мовчки НЕ
    // перемальовувались, поки не вийти з вкладки й не зайти знову.
    if (isActive('monitors2')) renderTabInto('monitors2');
    if (typeof syncMonitorMissingBanner === 'function') syncMonitorMissingBanner();
  }).catch(() => {});
}

function renderMonitorsTab() {
  const ds = state.displays || [];
  const bind = state.outputBind || {};

  const cards = ds.map(d => {
    const boundTo = [1,2,3,4].filter(n => bind[OUT_KIND[n]] === d.fingerprint);
    const openHere = (d.open || []).map(k => Object.keys(OUT_KIND).find(n => OUT_KIND[n] === k));
    const badge = d.isOperator
      ? '<span style="background:var(--red);color:#fff;font-size:12px;padding:2px 6px;border-radius:4px">ЕКРАН ОПЕРАТОРА</span>'
      : (d.isPrimary ? '<span style="background:var(--panel2);color:var(--text2);font-size:12px;padding:2px 6px;border-radius:4px">головний</span>' : '');

    const bindBtns = d.isOperator ? '<span style="font-size:12px;color:var(--text2)">Вивід на цей екран заблоковано</span>'
      : [1,2,3,4].map(n =>
        `<button class="btn ${boundTo.includes(n) ? 'btn-primary' : 'btn-ghost'} btn-sm"
                 onclick="bindOutputToDisplay(${n}, ${boundTo.includes(n) ? 'null' : `'${d.fingerprint}'`})">${OUT_NAME[n]}</button>`).join(' ');

    // Тестова сітка саме на ЦЬОМУ моніторі — раніше можна було перевірити лише
    // всі виходи одразу; тепер окремо для кожного закріпленого сюди виходу.
    const testBtns = !d.isOperator && boundTo.length
      ? '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">' +
        '<span style="font-size:12px;color:var(--text2);min-width:70px">Сітка тут:</span>' +
        boundTo.map(n => `<button class="btn ${(state.testPattern && state.testPattern[n]) ? 'btn-primary' : 'btn-ghost'} btn-sm"
                   onclick="toggleTestPattern(${n})">🎯 ${OUT_NAME[n]}</button>`).join(' ') +
        '</div>'
      : '';

    // Резервне дублювання: якщо саме цей монітор зникне, куди перекинути вміст.
    const failoverBtns = !d.isOperator && boundTo.length
      ? '<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
        boundTo.map(n => {
          const cur = (state.outputFailover && state.outputFailover[n]) || '';
          const opts = [1,2,3,4].filter(k => k !== n).map(k =>
            `<option value="${k}" ${cur == k ? 'selected' : ''}>${OUT_NAME[k]}</option>`).join('');
          return `<span style="font-size:12px;color:var(--text2)">🛟 Резерв для ${OUT_NAME[n]}:</span>
                  <select onchange="setOutputFailover(${n}, this.value)" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:2px;color:var(--text);font-size:11px">
                    <option value="">Немає</option>${opts}
                  </select>`;
        }).join(' ') +
        '</div>'
      : '';

    return `<div class="card" style="margin-bottom:8px;border-color:${d.isOperator ? 'var(--red)' : (boundTo.length ? 'var(--accent)' : 'var(--border)')}">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:22px;font-weight:800;color:var(--accent)">${d.num}</span>
        <div style="flex:1;min-width:120px">
          <div style="font-size:12px;color:var(--text)">${d.width} × ${d.height}${d.scaleFactor !== 1 ? ' <span style="color:var(--gold)">(масштаб ' + Math.round(d.scaleFactor*100) + '%, реально ' + d.realWidth + '×' + d.realHeight + ')</span>' : ''}</div>
          <div style="font-size:12px;color:var(--text2)">позиція ${d.x},${d.y}${d.rotation ? ' • поворот ' + d.rotation + '°' : ''}${openHere.length ? ' • <span style="color:var(--green)">вікно виводу тут</span>' : ''}</div>
        </div>
        ${badge}
      </div>
      <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
        <span style="font-size:12px;color:var(--text2);min-width:70px">Закріпити:</span>
        ${bindBtns}
      </div>
      ${testBtns}
      ${failoverBtns}
    </div>`;
  }).join('') || '<div class="card"><div class="card-sub">Монітори не знайдені — натисни «Оновити».</div></div>';

  const tp = state.testPattern || {};
  return `
  <div class="card">
    <div class="card-title">🖥 Монітори (${ds.length})</div>
    <div class="card-sub">Закріплення тримається за «відбитком» монітора, а не за його ID — тож переживає перезавантаження Windows, де ID змінюються.</div>
    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="identifyDisplays()">🔢 Показати номери на екранах</button>
      <button class="btn ${tp.all ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleTestPattern(null)">🎯 Тестова сітка</button>
      <button class="btn btn-ghost btn-sm" onclick="refreshMonitors()">↻ Оновити</button>
    </div>
    <div class="card-sub" style="margin-top:6px">
      Сітка показує <b style="color:#f0c040">жовту рамку</b> — край екрана (якщо її не видно, проектор зрізає краї)
      і <b style="color:#3ecf8e">зелений пунктир</b> — безпечну зону для тексту.
    </div>
  </div>
  ${cards}`;
}


// ============================================================
// КЕРУВАННЯ ТИТРОМ ДЛЯ ТРАНСЛЯЦІЇ
// ============================================================
let _lowerHideTimer = null;

function saveLower() { saveJSON(STORAGE_KEYS.live + '_lower', state.lower); }
function loadLower() {
  const c = loadJSON(STORAGE_KEYS.live + '_lower');
  if (c) Object.assign(state.lower, c, { visible: false });
}
function setLower(key, val) {
  state.lower[key] = val;
  saveLower();
  renderTabInto('stream');
  if (state.lower.visible) lowerShow();   // якщо титр в ефірі — оновлюємо наживо
}

// Показати титр із поточним віршем/куплетом
function lowerShow() {
  const n = state.lower.target || 2;
  const c = pv2GraphicsContent();
  if (!c.text) { notify('⚠️ Спершу надішли вірш або куплет'); return; }

  const prevLayout = state.graphicsSettings.layout;
  state.graphicsSettings.layout = 'lower';           // тимчасово — щоб не чіпати налаштування залу
  const html = getGraphicsHTML(c.text, c.ref);
  state.graphicsSettings.layout = prevLayout;

  if (isClientStation()) { stationSend('send-html', { html: html, label: 'Титр' }); }
  else sendHTMLToOutputN(n, html, null);

  state.lower.visible = true;
  renderTabInto('stream');
  notify('🎬 Титр в ефірі → ' + OUT_NAME[n]);

  clearTimeout(_lowerHideTimer);
  if (state.lower.autoHide > 0) {
    _lowerHideTimer = setTimeout(() => lowerHide(), state.lower.autoHide * 1000);
  }
}

function lowerHide() {
  clearTimeout(_lowerHideTimer);
  const n = state.lower.target || 2;
  if (isClientStation()) stationSend('clear', {});
  else pv2ClearOutput(n);
  state.lower.visible = false;
  renderTabInto('stream');
  notify('Титр прибрано');
}
function lowerToggle() { state.lower.visible ? lowerHide() : lowerShow(); }

function renderStreamTab() {
  const L = state.lower;
  const styles = Object.keys(LOWER_STYLES).map(k => {
    const st = LOWER_STYLES[k];
    const on = L.style === k;
    return `<button class="btn ${on ? 'btn-primary' : 'btn-ghost'} btn-sm"
              onclick="setLower('style','${k}')"
              style="display:flex;align-items:center;gap:5px">
              <span style="width:10px;height:10px;border-radius:2px;background:${st.accent};display:inline-block"></span>
              ${st.name}</button>`;
  }).join(' ');

  const posBtn = (p, l) => `<button class="btn ${L.position === p ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setLower('position','${p}')">${l}</button>`;
  const animBtn = (a, l) => `<button class="btn ${L.animation === a ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setLower('animation','${a}')">${l}</button>`;
  const outBtn = n => `<button class="btn ${L.target === n ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setLower('target',${n})">${OUT_NAME[n]}</button>`;
  const c = pv2GraphicsContent();

  return `
  <div class="card" style="border-color:${L.visible ? 'var(--red)' : 'var(--accent)'}">
    <div class="card-title">${L.visible ? '<span style="color:var(--red)">● В ЕФІРІ</span>' : '○ Титр прихований'}</div>
    <div class="card-sub">Зараз у титрі: <b>${c.ref ? esc(c.ref) : '—'}</b> ${c.text ? '— ' + esc(String(c.text).replace(/<[^>]+>/g,' ').slice(0, 60)) + '…' : '(нічого не надіслано)'}</div>
    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-success" style="flex:1;font-weight:700" onclick="lowerShow()">🎬 ПОКАЗАТИ ТИТР</button>
      <button class="btn btn-ghost" style="flex:1" onclick="lowerHide()">✕ Прибрати</button>
    </div>
    <div class="card-sub" style="margin-top:4px">Гаряча клавіша: признач «Титр» у вкладці «Клавіші», щоб показувати одним натисканням.</div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">🎨 Стиль титру</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${styles}</div>

      <div style="font-size:12px;color:var(--text2);margin-top:10px">Розташування</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${posBtn('bottom','Внизу')} ${posBtn('top','Вгорі')} ${posBtn('left','Зліва')} ${posBtn('right','Справа')} ${posBtn('center','По центру')}
      </div>

      <div style="font-size:12px;color:var(--text2);margin-top:10px">Поява</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${animBtn('slideUp','Знизу вгору')} ${animBtn('slideLeft','Збоку')} ${animBtn('fade','Проявлення')} ${animBtn('zoom','Наближення')} ${animBtn('none','Без анімації')}
      </div>

      <div style="font-size:12px;color:var(--text2);margin-top:10px">Колір акценту</div>
      <input type="color" value="${L.accent || LOWER_STYLES[L.style].accent}" oninput="setLower('accent', this.value)"
             style="width:50px;height:26px;border:none;background:none">
      <button class="btn btn-ghost btn-sm" onclick="setLower('accent', null)">Стандартний</button>
    </div>

    <div class="card">
      <div class="card-title">⚙️ Керування</div>

      <div style="font-size:12px;color:var(--text2)">На який вихід</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${outBtn(1)} ${outBtn(2)} ${outBtn(3)} ${outBtn(4)}</div>

      <div style="font-size:12px;color:var(--text2);margin-top:10px">Розмір тексту: <b>${Math.round((L.scale || 0.62) * 100)}%</b></div>
      <input type="range" min="35" max="110" value="${Math.round((L.scale || 0.62) * 100)}"
             oninput="setLower('scale', parseInt(this.value,10)/100)" style="width:100%">

      <div style="font-size:12px;color:var(--text2)">Прибирати автоматично: <b>${L.autoHide ? L.autoHide + ' с' : 'ні (тримати)'}</b></div>
      <input type="range" min="0" max="60" step="5" value="${L.autoHide}"
             oninput="setLower('autoHide', parseInt(this.value,10))" style="width:100%">

      <div style="font-size:12px;color:var(--text2);margin-top:8px">Фон сцени (що вирізає OBS)</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn ${(state.graphicsSettings.lowerChroma||'transparent')==='transparent'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('transparent')">Прозорий</button>
        <button class="btn ${state.graphicsSettings.lowerChroma==='#00ff00'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('#00ff00')">🟩 Зелений</button>
        <button class="btn ${state.graphicsSettings.lowerChroma==='#ff00ff'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('#ff00ff')">🟪 Маджента</button>
      </div>
      <div class="card-sub" style="margin-top:4px">Прозорий — якщо OBS бачить альфа-канал. Ні — став зелений і додай фільтр «Chroma Key».</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">👁 Як це виглядатиме поверх камери</div>
    <div style="position:relative;width:100%;aspect-ratio:16/9;border:1px solid var(--border);border-radius:6px;overflow:hidden;
                background:linear-gradient(135deg,#2a1f14,#0d1b2e 60%,#1a1a2e)">
      <iframe id="lowerPreviewFrame" style="position:absolute;top:0;left:0;width:1920px;height:1080px;border:0;
              transform:scale(0.28);transform-origin:top left;pointer-events:none;background:transparent"></iframe>
    </div>
  </div>`;
}

// Прев'ю титру
function updateLowerPreview() {
  const f = $('#lowerPreviewFrame');
  if (!f) return;
  const c = pv2GraphicsContent();
  const prev = state.graphicsSettings.layout;
  const prevChroma = state.graphicsSettings.lowerChroma;
  state.graphicsSettings.layout = 'lower';
  state.graphicsSettings.lowerChroma = 'transparent';   // у прев'ю показуємо як поверх камери
  f.srcdoc = getGraphicsHTML(c.text || 'Блаженні вбогі духом, бо їхнє Царство Небесне.', c.ref || 'Від Матвія 5:3');
  state.graphicsSettings.layout = prev;
  state.graphicsSettings.lowerChroma = prevChroma;
}

// ---- Вкладка «Шари» ----
function renderLayersTab() {
  const a = state.alertCfg;
  const posBtn = (p, l) => `<button class="btn ${a.position === p ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setAlertCfg('position','${p}')">${l}</button>`;
  return `
  <div class="grid2">
    <div class="card">
      <div class="card-title">🎬 Відео-фон під текстом</div>
      <div class="card-sub">Зациклене відео (хвилі, світло) — текст пісні лягає поверх. Звук завжди вимкнено.</div>
      <input type="file" accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.wmv,.flv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.m2v,.vob,.divx,.asf,.mxf,.ogv" onchange="loadBgVideo(this)" style="font-size:11px;width:100%;margin-top:6px">
      ${state.bgVideo ? `<div style="font-size:11px;color:var(--green);margin-top:4px">▶ ${esc(state.bgVideo.name)}</div>
        <button class="btn btn-ghost btn-sm btn-block" style="margin-top:4px;color:var(--red)" onclick="clearBgVideo()">✕ Прибрати відео-фон</button>` : ''}

      <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:8px">
        <div style="font-size:12px;color:var(--text2)">🔁 Черга з авто-ротацією (кілька роликів по черзі)</div>
        <input type="file" accept="video/*,.mp4,.webm,.mov" multiple onchange="loadBgQueue(this)" style="font-size:11px;width:100%;margin-top:4px">
        ${(state.bgQueue || []).map((q, i) => `
          <div style="display:flex;align-items:center;gap:4px;padding:2px 0;font-size:11px;color:${i === (state.bgQueueIdx||0) && state.bgQueueRunning ? 'var(--green)' : 'var(--text2)'}">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${i === (state.bgQueueIdx||0) && state.bgQueueRunning ? '▶ ' : ''}${esc(q.name)}</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="removeBgQueueItem(${i})">✕</button>
          </div>`).join('')}
        <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          <span style="font-size:11px;color:var(--text2)">Інтервал:</span>
          <input type="number" min="5" max="600" value="${state.bgQueueInterval || 30}" onchange="setBgQueueInterval(this.value)"
                 style="width:50px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:2px;color:var(--text);font-size:11px;text-align:center">
          <span style="font-size:11px;color:var(--text2)">с</span>
        </div>
        <div style="display:flex;gap:4px;margin-top:6px">
          <button class="btn ${state.bgQueueRunning ? 'btn-ghost' : 'btn-primary'} btn-sm" style="flex:1" onclick="bgQueueStart()">▶ Пуск ротації</button>
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="bgQueueStop()">⏹ Стоп</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🖼 Логотип і заморозка</div>
      <input type="file" accept="image/*,.heic,.heif,.tif,.tiff,.avif,.jp2,.tga,.pcx" onchange="loadLogo(this)" style="font-size:11px;width:100%">
      <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
        <button class="btn ${state.logoOn ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="showLogo(${state.logoOn ? 'false' : 'true'})">🖼 ${state.logoOn ? 'Прибрати логотип' : 'Показати логотип'}</button>
        <button class="btn ${state.frozen ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleFreeze()">❄️ ${state.frozen ? 'Розморозити' : 'Заморозити кадр'}</button>
      </div>
      <div class="card-sub" style="margin-top:4px">Логотип — замість чорноти на паузі. Заморозка — застигла картинка, поки готуєш наступне.</div>
    </div>
  </div>

  <div class="card" style="border-color:var(--gold)">
    <div class="card-title">📢 Оголошення ПОВЕРХ слайда</div>
    <div class="card-sub">Пісня триває — повідомлення виїжджає знизу. Напр.: «Мама Софійки, підійдіть до дитячої кімнати».</div>
    <input id="alertText" type="text" placeholder="Текст оголошення" value="${esc(a.text || '')}"
           style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:7px;color:var(--text);font-size:12px;outline:none;margin-top:6px">
    <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;align-items:center">
      ${posBtn('bottom','Знизу')} ${posBtn('top','Зверху')}
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;margin-left:6px">
        <input type="checkbox" ${a.ticker ? 'checked' : ''} onchange="setAlertCfg('ticker', this.checked)"> Біжучий рядок
      </label>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-top:6px">Розмір: <b id="alertSizeLabel">${a.size}px</b></div>
    <input type="range" min="20" max="70" value="${a.size}" oninput="setAlertCfg('size', parseInt(this.value,10))" style="width:100%">
    <div style="font-size:12px;color:var(--text2)">Показувати: <b id="alertSecLabel">${a.seconds ? a.seconds + ' с' : 'поки не прибрати'}</b></div>
    <input type="range" min="0" max="60" value="${a.seconds}" oninput="setAlertCfg('seconds', parseInt(this.value,10))" style="width:100%">
    <div style="display:flex;gap:4px;margin-top:6px">
      <button class="btn btn-primary btn-sm" onclick="sendAlert()">📢 Показати поверх</button>
      <button class="btn btn-ghost btn-sm" onclick="hideAlert()">Прибрати</button>
    </div>
  </div>

  ${renderPropsCard()}
  ${renderMsgTemplatesCard()}

  <div class="card">
    <div class="card-title">🎵 Фонова музика</div>
    <div class="card-sub">Плавний вхід (2 с) і затухання (2,5 с) — перед служінням, під час пожертв.</div>
    <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" onchange="loadBgAudio(this)" style="font-size:11px;width:100%;margin-top:6px">
    ${state.bgAudio.name ? `<div style="font-size:11px;color:var(--text2);margin-top:4px">${esc(state.bgAudio.name)}</div>` : ''}
    <div style="display:flex;gap:4px;margin-top:6px">
      <button class="btn btn-success btn-sm" onclick="playBgAudio()">▶ Пуск (плавно)</button>
      <button class="btn btn-ghost btn-sm" onclick="stopBgAudio()">⏹ Стоп (затухання)</button>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-top:6px">Гучність: <b id="bgVolLabel">${Math.round(state.bgAudio.volume*100)}%</b></div>
    <input type="range" min="0" max="100" value="${Math.round(state.bgAudio.volume*100)}" oninput="setBgVolume(parseInt(this.value,10))" style="width:100%">
  </div>

  ${renderSoundBinCard()}

  <div class="card" style="border-color:var(--blue)">
    <div class="card-title">🎤 Живі субтитри (Web Speech API)</div>
    <div class="card-sub">Розпізнавання мови з мікрофона комп'ютера → субтитри в реальному часі у вибраному виході.</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
      Статус: ${state.captions.listening ? '<span style="color:var(--green)">🎤 Слухаємо</span>' : 'готово'}
    </div>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <button class="btn ${state.captions.enabled ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="startCaptions()">▶ Пуск</button>
      <button class="btn btn-ghost btn-sm" onclick="stopCaptions()">⏹ Стоп</button>
      <button class="btn btn-ghost btn-sm" onclick="clearCaptions()">✕ Очистити текст</button>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Мова:</div>
    <select onchange="setCaptionLang(this.value)" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;margin-bottom:6px;outline:none">
      <option value="uk-UA">🇺🇦 Українська</option>
      <option value="ru-RU">🇷🇺 Російська</option>
      <option value="en-US">🇬🇧 Англійська</option>
    </select>
    <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Показувати в виході:</div>
    <div style="display:flex;gap:4px">
      <button class="btn ${state.captions.targetOutput === 1 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setCaptionOutput(1)">1</button>
      <button class="btn ${state.captions.targetOutput === 2 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setCaptionOutput(2)">2</button>
      <button class="btn ${state.captions.targetOutput === 3 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setCaptionOutput(3)">3</button>
      <button class="btn ${state.captions.targetOutput === 4 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setCaptionOutput(4)">4</button>
    </div>
    ${state.captions.text || state.captions.interim ? `
      <div style="margin-top:8px;padding:8px;background:var(--panel2);border-radius:4px;border-left:3px solid var(--blue)">
        <div style="font-size:11px;color:var(--text)">${esc(state.captions.text)}<span style="color:var(--text2);font-style:italic">${state.captions.interim ? ' ' + esc(state.captions.interim) : ''}</span></div>
      </div>
    ` : ''}
  </div>`;
}


// ============================================================
// ЕКРАН З QR + ФОТО (4 режими)
//  logo   — QR із логотипом церкви в центрі
//  banner — фото/банер на весь екран, QR у кутку
//  simple — просто QR із підписом
//  multi  — кілька QR поряд (пожертви + сайт + Instagram)
// Використовує наявний buildQRCanvas() з index.html.
// ============================================================
function qrState() {
  if (!state.qrScreen) {
    state.qrScreen = loadJSON(STORAGE_KEYS.live + '_qrscreen') || {
      mode: 'logo',
      photo: null,            // готове фото QR (показуємо як є, без генерації)
      photoFit: 'contain',    // contain = увесь QR видно | cover = на весь екран
      title: 'Підтримати служіння',
      subtitle: 'Скануй камерою телефона',
      single: { text: '', label: 'Пожертви' },
      banner: null,                 // dataURL фото
      bannerCorner: 'br',           // кут QR: br/bl/tr/tl
      items: [                      // для multi
        { text: '', label: 'Пожертви' },
        { text: '', label: 'Наш сайт' },
        { text: '', label: 'Instagram' }
      ],
      target: 1
    };
  }
  return state.qrScreen;
}
function saveQrScreen() { saveJSON(STORAGE_KEYS.live + '_qrscreen', state.qrScreen); }
function setQr(key, val) {
  const q = qrState();
  q[key] = val;
  saveQrScreen();
  renderTabInto('qrscreen');
  updateQrPreview();
}
function setQrItem(i, key, val) {
  const q = qrState();
  q.items[i][key] = val;
  saveQrScreen();
  updateQrPreview();
}
function loadQrPhoto(input) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) { notify('⚠️ Фото завелике — до 3 МБ'); input.value=''; return; }
  const r = new FileReader();
  r.onload = e => { qrState().photo = e.target.result; saveQrScreen(); renderTabInto('qrscreen'); updateQrPreview(); notify('📷 Фото QR завантажено'); };
  r.readAsDataURL(f);
  input.value = '';
}

function loadQrBanner(input) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) { notify('⚠️ Фото завелике — до 3 МБ'); input.value=''; return; }
  const r = new FileReader();
  r.onload = e => { qrState().banner = e.target.result; saveQrScreen(); renderTabInto('qrscreen'); updateQrPreview(); notify('🖼 Фото додано'); };
  r.readAsDataURL(f);
  input.value = '';
}

// Головне: збираємо весь екран (1920x1080) на одному canvas
function composeQrScreen(cb) {
  const q = qrState();
  if (q.mode !== 'photo' && typeof buildQRCanvas !== 'function') {
    notify('⚠️ Генератор QR ще не завантажився. Потрібен інтернет при першому запуску.');
    return;
  }
  const W = 1920, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');

  function bg(done) {
    if (q.mode === 'banner' && q.banner) {
      const img = new Image();
      img.onload = () => {
        // Фото на весь екран (cover)
        const r = Math.max(W / img.width, H / img.height);
        const w = img.width * r, h = img.height * r;
        g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 0, W, H);
        done();
      };
      img.onerror = () => { g.fillStyle = '#0a0a1a'; g.fillRect(0,0,W,H); done(); };
      img.src = q.banner;
    } else {
      // Темний градієнт
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#0a0a1a'); grad.addColorStop(1, '#161a2e');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      done();
    }
  }

  // Режим готового фото QR — просто малюємо картинку, нічого не генеруємо
  if (q.mode === 'photo') {
    if (!q.photo) { cb(canvas); return; }
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0a0a1a'); grad.addColorStop(1, '#161a2e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const img = new Image();
    img.onload = () => {
      if (q.photoFit === 'cover') {
        const r = Math.max(W / img.width, H / img.height);
        const w = img.width * r, h = img.height * r;
        g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      } else {
        // contain — увесь QR видно, з полями (щоб код точно зчитувався)
        const r = Math.min((W * 0.7) / img.width, (H * 0.8) / img.height);
        const w = img.width * r, h = img.height * r;
        // біла підкладка під QR — камери читають надійніше
        const pad = 40;
        g.fillStyle = '#fff';
        roundRect(g, (W - w) / 2 - pad, (H - h) / 2 - pad + 30, w + pad*2, h + pad*2, 20); g.fill();
        g.drawImage(img, (W - w) / 2, (H - h) / 2 + 30, w, h);
      }
      // Заголовок зверху
      if (q.title) { g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '700 72px Georgia, serif'; g.fillText(q.title, W/2, 110); }
      if (q.subtitle) { g.fillStyle = '#c8a84b'; g.font = '32px Georgia, serif'; g.fillText(q.subtitle, W/2, 165); }
      cb(canvas);
    };
    img.onerror = () => cb(canvas);
    img.src = q.photo;
    return;
  }

  function drawTitle() {
    if (q.mode === 'banner') return;
    g.textAlign = 'center'; g.fillStyle = '#ffffff';
    g.font = '700 76px Georgia, serif';
    if (q.title) g.fillText(q.title, W / 2, 150);
    g.fillStyle = '#c8a84b'; g.font = '34px Georgia, serif';
    if (q.subtitle) g.fillText(q.subtitle, W / 2, 210);
  }

  // Малює один QR (dataURL) із рамкою і підписом у точці x,y (центр QR)
  function placeQR(dataUrl, cx, cy, size, label, labelColor, done) {
    const img = new Image();
    img.onload = () => {
      const pad = 22;
      g.fillStyle = '#ffffff';
      roundRect(g, cx - size/2 - pad, cy - size/2 - pad, size + pad*2, size + pad*2, 18); g.fill();
      g.drawImage(img, cx - size/2, cy - size/2, size, size);
      if (label) {
        g.textAlign = 'center';
        g.fillStyle = labelColor || '#ffffff';
        g.font = '700 40px Georgia, serif';
        g.fillText(label, cx, cy + size/2 + pad + 52);
      }
      done();
    };
    img.onerror = done;
    img.src = dataUrl;
  }

  bg(() => {
    drawTitle();
    if (q.mode === 'multi') {
      const items = q.items.filter(it => it.text.trim());
      if (!items.length) { cb(canvas); return; }
      const n = items.length;
      const size = n >= 3 ? 360 : 440;
      const gap = (W - n * size) / (n + 1);
      let done = 0;
      items.forEach((it, i) => {
        const cx = gap * (i + 1) + size * i + size / 2;
        buildQRCanvas(it.text, size, built => {
          if (built) placeQR(built.toDataURL('image/png'), cx, H / 2 + 20, size, it.label, '#c8a84b', () => { if (++done === n) cb(canvas); });
          else if (++done === n) cb(canvas);
        });
      });
    } else if (q.mode === 'banner') {
      const it = q.single;
      if (!it.text.trim()) { cb(canvas); return; }
      const size = 300;
      buildQRCanvas(it.text, size, built => {
        if (!built) { cb(canvas); return; }
        const m = 70;
        const pos = { br:[W-size/2-m, H-size/2-m], bl:[size/2+m, H-size/2-m],
                      tr:[W-size/2-m, size/2+m], tl:[size/2+m, size/2+m] }[q.bannerCorner || 'br'];
        placeQR(built.toDataURL('image/png'), pos[0], pos[1], size, it.label, '#ffffff', () => cb(canvas));
      });
    } else {
      // logo / simple — великий QR по центру (логотип у центрі бере з вкладки QR, якщо заданий)
      const it = q.single;
      if (!it.text.trim()) { cb(canvas); return; }
      const size = 560;
      buildQRCanvas(it.text, size, built => {
        if (!built) { cb(canvas); return; }
        placeQR(built.toDataURL('image/png'), W / 2, H / 2 + 60, size, it.label, '#c8a84b', () => cb(canvas));
      });
    }
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function updateQrPreview() {
  const cv = $('#qrScreenPreview');
  if (!cv) return;
  composeQrScreen(full => {
    const g = cv.getContext('2d');
    cv.width = 480; cv.height = 270;
    g.fillStyle = '#000'; g.fillRect(0, 0, 480, 270);
    g.drawImage(full, 0, 0, 480, 270);
  });
}

function sendQrScreen() {
  const q = qrState();
  // Готове фото QR генератора не потребує; для решти режимів — потрібен
  if (q.mode !== 'photo' && typeof buildQRCanvas !== 'function') {
    notify('⚠️ Генератор QR недоступний (потрібен інтернет при першому запуску)');
    return;
  }
  const hasContent = q.mode === 'photo' ? !!q.photo
                   : q.mode === 'multi' ? q.items.some(i => i.text.trim())
                   : q.single.text.trim();
  if (!hasContent) { notify(q.mode === 'photo' ? '⚠️ Спершу завантаж фото QR' : '⚠️ Введи хоча б одне посилання'); return; }
  composeQrScreen(full => {
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
      'html,body{margin:0;height:100vh;background:#000;overflow:hidden}' +
      'img{width:100vw;height:100vh;object-fit:contain}</style></head><body>' +
      '<img src="' + full.toDataURL('image/png') + '"></body></html>';
    const n = q.target || 1;
    sendHTMLToOutputN(n, html, 'QR-екран');
    notify('📲 QR-екран → ' + OUT_NAME[n]);
  });
}


// ---- Логотип у центр QR (перенесено зі старої вкладки, дані ті самі) ----
function qrScreenLogo(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    qrLogo = e.target.result;                     // цей же логотип використовує buildQRCanvas
    if (typeof generateQR === 'function') { try { generateQR(); } catch (err) {} }
    renderTabInto('qrscreen');
    updateQrPreview();
    notify('🖼 Логотип додано в центр QR');
  };
  r.onerror = () => notify('❌ Не вдалось прочитати файл');
  r.readAsDataURL(f);
  input.value = '';
}
function qrScreenClearLogo() {
  qrLogo = null;
  if (typeof generateQR === 'function') { try { generateQR(); } catch (err) {} }
  renderTabInto('qrscreen');
  updateQrPreview();
  notify('Логотип прибрано');
}
function qrScreenLogoSize(v) {
  qrLogoScale = Math.max(0.10, Math.min(0.28, v / 100));
  if (typeof generateQR === 'function') { try { generateQR(); } catch (err) {} }
  updateQrPreview();
}

// ---- Збережені QR (той самий список, що й у старій вкладці) ----
function qrList() {
  try {
    const raw = (typeof bigStoreGet === 'function') ? bigStoreGet(QR_KEY) : localStorage.getItem(QR_KEY);
    return JSON.parse(raw || '[]');
  } catch (e) { return []; }
}
function qrScreenSave() {
  const q = qrState();
  const text = q.mode === 'multi'
    ? ((q.items || []).find(i => i.text && i.text.trim()) || {}).text
    : (q.single || {}).text;
  if (!text || !text.trim()) { notify('⚠️ Спершу введи посилання'); return; }
  const label = (q.single && q.single.label) || q.title || text.slice(0, 30);
  const list = qrList();
  list.push({ text: text.trim(), label: label });
  if (typeof safeSet === 'function') safeSet(QR_KEY, JSON.stringify(list));
  else localStorage.setItem(QR_KEY, JSON.stringify(list));
  if (typeof renderQRPresets === 'function') { try { renderQRPresets(); } catch (e) {} }
  renderTabInto('qrscreen');
  notify('⭐ Збережено: ' + label);
}
function qrScreenLoad(i) {
  const p = qrList()[i];
  if (!p) return;
  const q = qrState();
  if (q.mode === 'multi' || q.mode === 'photo') q.mode = 'simple';
  q.single = { text: p.text, label: p.label || '' };
  saveQrScreen();
  renderTabInto('qrscreen');
  updateQrPreview();
  notify('▶ ' + (p.label || p.text.slice(0, 24)));
}
function qrScreenDelete(i) {
  const list = qrList();
  if (!list[i]) return;
  list.splice(i, 1);
  if (typeof safeSet === 'function') safeSet(QR_KEY, JSON.stringify(list));
  else localStorage.setItem(QR_KEY, JSON.stringify(list));
  if (typeof renderQRPresets === 'function') { try { renderQRPresets(); } catch (e) {} }
  renderTabInto('qrscreen');
}

function renderQrScreenTab() {
  const q = qrState();
  const modeBtn = (m, l) => `<button class="btn ${q.mode === m ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setQr('mode','${m}')">${l}</button>`;
  const cornerBtn = (c, l) => `<button class="btn ${q.bannerCorner === c ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setQr('bannerCorner','${c}')">${l}</button>`;
  const outBtn = n => `<button class="btn ${q.target === n ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setQr('target',${n})">${OUT_NAME[n]}</button>`;

  let editor = '';
  if (q.mode === 'multi') {
    editor = q.items.map((it, i) => `
      <div style="display:flex;gap:4px;margin-bottom:4px">
        <input type="text" value="${esc(it.label)}" placeholder="Підпис" oninput="setQrItem(${i},'label',this.value)"
               style="width:110px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">
        <input type="text" value="${esc(it.text)}" placeholder="Посилання / реквізити" oninput="setQrItem(${i},'text',this.value)"
               style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">
      </div>`).join('');
  } else {
    editor = `
      <div style="font-size:12px;color:var(--text2)">Посилання / реквізити</div>
      <input type="text" value="${esc(q.single.text)}" placeholder="https://... або номер картки" oninput="q=qrState();q.single.text=this.value;saveQrScreen();updateQrPreview()"
             style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px;margin-bottom:6px">
      <div style="font-size:12px;color:var(--text2)">Підпис під QR</div>
      <input type="text" value="${esc(q.single.label)}" oninput="q=qrState();q.single.label=this.value;saveQrScreen();updateQrPreview()"
             style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">`;
  }

  return `
  <div class="grid2">
    <div class="card">
      <div class="card-title">📲 Що показати</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${modeBtn('photo','📷 Моє фото QR')}
        ${modeBtn('logo','QR із логотипом')}
        ${modeBtn('banner','Фото + QR у кутку')}
        ${modeBtn('simple','Простий QR')}
        ${modeBtn('multi','Кілька QR')}
      </div>

      ${q.mode === 'photo' ? `
        <div style="font-size:12px;color:var(--text2);margin-top:10px">Фото готового QR (до 3 МБ)</div>
        <input type="file" accept="image/*" onchange="loadQrPhoto(this)" style="font-size:11px;width:100%">
        ${q.photo ? '<div style="font-size:11px;color:var(--green);margin-top:4px">✓ фото завантажено</div>' : '<div style="font-size:11px;color:var(--text2);margin-top:4px">Завантаж скріншот або фото QR — програма покаже його як є, нічого не змінюючи.</div>'}
        <div style="font-size:12px;color:var(--text2);margin-top:8px">Розмір на екрані</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn ${(q.photoFit||'contain')==='contain'?'btn-primary':'btn-ghost'} btn-sm" onclick="setQr('photoFit','contain')">QR повністю видно</button>
          <button class="btn ${q.photoFit==='cover'?'btn-primary':'btn-ghost'} btn-sm" onclick="setQr('photoFit','cover')">На весь екран</button>
        </div>
        <div class="card-sub" style="margin-top:4px">«QR повністю видно» — з білими полями, камери читають надійніше. «На весь екран» — якщо фото вже оформлене.</div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">Заголовок (необов'язково)</div>
        <input type="text" value="${esc(q.title)}" oninput="setQr('title',this.value)"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">
        <input type="text" value="${esc(q.subtitle)}" oninput="setQr('subtitle',this.value)" placeholder="Підзаголовок"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px;margin-top:4px">
      ` : q.mode !== 'banner' ? `
        <div style="font-size:12px;color:var(--text2);margin-top:10px;font-weight:600">Заголовок екрана</div>
        <input type="text" value="${esc(q.title)}" oninput="setQr('title',this.value)"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">
        <div style="font-size:12px;color:var(--text2);margin-top:4px">Підзаголовок</div>
        <input type="text" value="${esc(q.subtitle)}" oninput="setQr('subtitle',this.value)"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">
      ` : `
        <div style="font-size:12px;color:var(--text2);margin-top:10px">Фото / банер (до 3 МБ)</div>
        <input type="file" accept="image/*" onchange="loadQrBanner(this)" style="font-size:11px;width:100%">
        ${q.banner ? '<div style="font-size:11px;color:var(--green);margin-top:4px">✓ фото додано</div>' : ''}
        <div style="font-size:12px;color:var(--text2);margin-top:6px">Кут для QR</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${cornerBtn('br','↘ Правий низ')}${cornerBtn('bl','↙ Лівий низ')}${cornerBtn('tr','↗ Правий верх')}${cornerBtn('tl','↖ Лівий верх')}</div>
      `}

      ${q.mode === 'photo' ? '' : `<div style="margin-top:10px">${editor}</div>`}

      ${q.mode === 'logo' ? `
      <div style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:6px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Логотип у центрі QR</div>
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
          <input type="file" id="qrScreenLogoInput" accept="image/*" style="display:none" onchange="qrScreenLogo(this)">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qrScreenLogoInput').click()">📁 Вибрати файл</button>
          ${(typeof qrLogo !== 'undefined' && qrLogo) ? `<span style="font-size:11px;color:var(--green)">✓ логотип є</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="qrScreenClearLogo()">✕</button>` : '<span style="font-size:11px;color:var(--text2)">не обрано</span>'}
        </div>
        ${(typeof qrLogo !== 'undefined' && qrLogo) ? `<div style="margin-top:6px">
          <div style="font-size:11px;color:var(--text2)">Розмір логотипа: ${Math.round((typeof qrLogoScale !== 'undefined' ? qrLogoScale : 0.22) * 100)}%</div>
          <input type="range" min="10" max="28" value="${Math.round((typeof qrLogoScale !== 'undefined' ? qrLogoScale : 0.22) * 100)}"
                 style="width:100%" onchange="qrScreenLogoSize(this.value)">
        </div>` : ''}
      </div>` : ''}

      <div style="font-size:12px;color:var(--text2);margin-top:10px">На який екран</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${outBtn(1)} ${outBtn(2)} ${outBtn(3)} ${outBtn(4)}</div>

      <div style="display:flex;gap:5px;margin-top:10px">
        <button class="btn btn-success" style="flex:1;font-weight:700" onclick="sendQrScreen()">📲 ПОКАЗАТИ НА ЕКРАНІ</button>
        <button class="btn btn-ghost" onclick="qrScreenSave()">⭐ Зберегти</button>
      </div>
      ${(function(){
        const list = qrList();
        if (!list.length) return '<div style="font-size:11px;color:var(--text2);margin-top:8px">Збережених QR ще немає — введи посилання й тисни «⭐ Зберегти».</div>';
        return `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px">⭐ Збережені QR</div>
          ${list.map((p, i) => `<div style="display:flex;align-items:center;gap:5px;padding:4px 0;border-bottom:1px solid var(--border)">
              <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <b>${esc(p.label || p.text.slice(0, 28))}</b>
                <span style="color:var(--text2);font-size:11px"> ${esc(p.text.slice(0, 34))}</span>
              </span>
              <button class="btn btn-ghost btn-sm" onclick="qrScreenLoad(${i})">▶</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="qrScreenDelete(${i})">✕</button>
            </div>`).join('')}
        </div>`;
      })()}
    </div>

    <div class="card">
      <div class="card-title">👁 Як це виглядатиме</div>
      <canvas id="qrScreenPreview" width="480" height="270"
              style="width:100%;border:1px solid var(--border);border-radius:6px;background:#000"></canvas>
      <div class="card-sub" style="margin-top:6px">Прев'ю оновлюється, щойно вводиш посилання.</div>
    </div>
  </div>`;
}



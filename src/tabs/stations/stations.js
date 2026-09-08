// ============================================================
// ВКЛАДКА «🔗 Станції» (stations) — синхронізація 2 ПК: хост/клієнт,
// підключення/відключення, локальний пульт (start/stop).
//
// isClientStation()/stationSend()/applyStationCommand() НАВМИСНО лишились
// у extras-2.js/extras-3.js — вони глибоко вплетені в основний конвеєр
// показу (goLive), використовуються з багатьох місць поза цією вкладкою,
// не ексклюзивні для неї.
//
// Зібрано з ДВОХ файлів: більшість — з src/extras-3.js, сама вкладка +
// setStationMode/пульт — з src/extras-4.js (винесені окремо, уже
// видалені звідти раніше). Продовження модуляризації (typo.js → ... →
// automation.js/extras_lang_obs.js → ця). Мусить завантажуватись ДО
// extras-4.js — renderStationsTab викликається з dispatch-таблиці
// renderTabInto (extras-1.js).
// ============================================================

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

function startHost() {
  if (!window.electronAPI || !window.electronAPI.startSyncServer) return;
  const pin = ($('#stationPin') && $('#stationPin').value.trim()) || '';
  state.station.pin = pin;
  state.station.mode = 'host';
  saveStationCfg();
  window.electronAPI.startSyncServer(pin).then(res => {
    state.station.ip = res.ip;
    markDirty('stations');
    notify('🖥 Хост запущено: ' + res.ip + ':' + res.port + (pin ? ' (пароль увімкнено)' : ''));
  }).catch(err => {
    state.station.mode = 'solo';
    markDirty('stations');
    notify('✗ Хост не стартував: ' + (err && err.message ? err.message : 'помилка'));
  });
  // Помилки сервера (зайнятий порт тощо) приходять окремою подією
  if (window.electronAPI.onStationError) {
    window.electronAPI.onStationError(err => {
      state.station.mode = 'solo';
      markDirty('stations');
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
  markDirty('stations');
  notify('Хост зупинено');
}

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
      markDirty('stations');
      notify('✓ Підключено до хоста ' + ip);
    } else if (msg.type === 'denied') {
      state.station.connected = false;
      markDirty('stations');
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
    markDirty('stations');
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

function disconnectStation() {
  state.station._manualDisconnect = true;
  clearTimeout(_stationRetryTimer);
  if (stationWs) { try { stationWs.close(); } catch(e) {} stationWs = null; }
  state.station.connected = false;
  state.station.mode = 'solo';
  saveStationCfg();
  markDirty('stations');
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
  markDirty('stations');
}

function stationsStartPult() {
  if (!window.electronAPI || !window.electronAPI.startRemote) return;
  const pin = ($('#stationsPultPin') && $('#stationsPultPin').value.trim()) || '';
  window.electronAPI.startRemote(pin, state.remoteUsers || []).then(res => {
    state.pult = { on: true, url: 'http://' + res.ip + ':' + res.port, pin: pin };
    saveJSON('church_pult_cfg', state.pult);
    markDirty('stations');
    notify('📱 Пульт запущено: ' + state.pult.url + (pin ? ' (PIN ' + pin + ')' : ''));
  }).catch(() => notify('⚠️ Не вдалось запустити пульт'));
}

function stationsStopPult() {
  if (!window.electronAPI || !window.electronAPI.stopRemote) return;
  window.electronAPI.stopRemote().then(() => {
    state.pult = { on: false, url: '', pin: '' };
    saveJSON('church_pult_cfg', state.pult);
    markDirty('stations');
    notify('Пульт зупинено');
  }).catch(() => {});
}

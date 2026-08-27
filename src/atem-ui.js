// ============================================================
// ATEM — керування відеомікшером (винесено з index.html у модуль).
// Завантажується ПІСЛЯ ptz-ui.js; функції глобальні.
// ============================================================
// ============================================================
// 🎬 ATEM INTEGRATION
// ============================================================
var atemConnected = false;
var atemSceneMap = {
  worship:  { input: 1 },
  sermon:   { input: 2 },
  announce: { input: 3 },
  screen:   { input: 6 }  // HDMI
};

// Input labels for ATEM Mini (6 HDMI inputs)
var atemInputLabels = ['Вхід 1','Вхід 2','Вхід 3','Вхід 4','Вхід 5','Вхід 6','Вхід 7','Вхід 8'];
// Назви входів: власні (localStorage) мають пріоритет, далі — задані на ATEM, далі — типові.
var atemCustomLabels = (function(){ try { return (typeof loadJSON === 'function' && loadJSON('church_atem_labels')) || {}; } catch (e) { return {}; } })();
var atemDeviceLabels = {};
function atemLabel(n){ return atemCustomLabels[n] || atemDeviceLabels[n] || atemInputLabels[n-1] || ('Вхід ' + n); }
function atemRenameInput(n){
  if (typeof pv2Prompt !== 'function') return;
  pv2Prompt('Назва входу ' + n + ' (напр. Кафедра / Ноутбук):', atemLabel(n), function(val){
    if (val === null || val === undefined) return;
    if (String(val).trim()) atemCustomLabels[n] = String(val).trim(); else delete atemCustomLabels[n];
    try { if (typeof saveJSON === 'function') saveJSON('church_atem_labels', atemCustomLabels); } catch (e) {}
    renderAtemInputs();
  });
}

function atemConnect() {
  if (!window.electronAPI) return;
  var ip = document.getElementById('atemIP').value.trim();
  if (!ip) return;
  var btn = document.getElementById('atemConnBtn');
  btn.textContent = '⏳ ...';
  btn.disabled = true;
  setAtemStatus(false, 'Підключення до ' + ip + '...');
  window.electronAPI.atemConnect(ip).then(function(result) {
    btn.disabled = false;
    if (result.ok) {
      btn.textContent = '■ Відключити';
      btn.onclick = function() { atemDisconnect(); };
      setAtemStatus(true, 'Підключено до ' + ip);
      showAtemControls(true);
    } else {
      btn.textContent = '▶ Підключити';
      btn.onclick = function() { atemConnect(); };
      setAtemStatus(false, 'Помилка: ' + (result.error || 'невідома'));
    }
  });
}

function atemDisconnect() {
  if (!window.electronAPI) return;
  window.electronAPI.atemDisconnect().then(function() {
    var btn = document.getElementById('atemConnBtn');
    btn.textContent = '▶ Підключити';
    btn.onclick = function() { atemConnect(); };
    setAtemStatus(false, 'Відключено');
    showAtemControls(false);
  });
}

function setAtemStatus(connected, text) {
  atemConnected = connected;
  var dot = document.getElementById('atemDot');
  var txt = document.getElementById('atemStatusTxt');
  if (dot) dot.style.background = connected ? '#3ecf8e' : '#f56565';
  if (txt) txt.textContent = text || (connected ? 'Підключено' : 'Не підключено');
}

function showAtemControls(show) {
  ['atemControlCard','atemRecordCard','atemScenesCard','atemMacrosCard'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = show ? 'block' : 'none';
  });
  if (show) renderAtemInputs();
}

function renderAtemInputs() {
  var container = document.getElementById('atemInputBtns');
  if (!container) return;
  container.innerHTML = '';
  atemInputLabels.forEach(function(_l, i) {
    var inputNum = i + 1;
    var label = atemLabel(inputNum);
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    var pvwBtn = document.createElement('button');
    pvwBtn.className = 'btn btn-ghost btn-sm';
    pvwBtn.id = 'atemPvwBtn-' + inputNum;
    pvwBtn.style.cssText = 'font-size:11px;padding:6px 4px';
    pvwBtn.title = 'Preview';
    pvwBtn.innerHTML = '<span style="color:#3ecf8e;font-size:9px">PVW</span><br>' + label;
    pvwBtn.addEventListener('click', (function(n){ return function(){ atemCmd({type:'preview',input:n}); }; })(inputNum));
    var pgmBtn = document.createElement('button');
    pgmBtn.className = 'btn btn-ghost btn-sm';
    pgmBtn.id = 'atemPgmBtn-' + inputNum;
    pgmBtn.style.cssText = 'font-size:11px;padding:6px 4px;border-color:#f56565';
    pgmBtn.title = 'Program';
    pgmBtn.innerHTML = '<span style="color:#f56565;font-size:9px">PGM</span><br>' + label;
    pgmBtn.addEventListener('click', (function(n){ return function(){ atemCmd({type:'program',input:n}); }; })(inputNum));
    wrap.appendChild(pvwBtn);
    wrap.appendChild(pgmBtn);
    var renameBtn = document.createElement('button');
    renameBtn.className = 'btn btn-ghost btn-sm';
    renameBtn.style.cssText = 'font-size:9px;padding:2px';
    renameBtn.title = 'Перейменувати вхід';
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', (function(n){ return function(){ atemRenameInput(n); }; })(inputNum));
    wrap.appendChild(renameBtn);
    container.appendChild(wrap);
  });
}

function atemCmd(cmd) {
  if (!window.electronAPI) return Promise.resolve({ ok: false });
  // Повертаємо проміс — виклики, яким важливо дочекатись підтвердження
  // команди (напр. atemScene нижче), можуть на нього чекати замість
  // довільного таймера.
  return window.electronAPI.atemCommand(cmd).then(function(result) {
    if (!result.ok) showMsg('ATEM: ' + (result.error || 'помилка'), 'var(--red)');
    return result;
  });
}

// Картинка-в-картинці (DVE): пресети кутів. Розмір ~1/2 екрана, позиція в кут.
function atemPip(corner, keyer) {
  var P = {
    tl:     { sizeX: 0.5, sizeY: 0.5, positionX: -8, positionY: 4.5 },
    tr:     { sizeX: 0.5, sizeY: 0.5, positionX: 8,  positionY: 4.5 },
    bl:     { sizeX: 0.5, sizeY: 0.5, positionX: -8, positionY: -4.5 },
    br:     { sizeX: 0.5, sizeY: 0.5, positionX: 8,  positionY: -4.5 },
    center: { sizeX: 0.7, sizeY: 0.7, positionX: 0,  positionY: 0 }
  };
  if (P[corner]) atemCmd({ type: 'dve-pip', keyer: keyer || 0, dve: P[corner] });
}

function atemScene(scene) {
  var s = atemSceneMap[scene];
  if (!s) return;
  // Чекаємо підтвердження, що preview дійсно змінився на пристрої, перш ніж
  // давати 'auto' — раніше фіксований таймер 200мс на повільному/завантаженому
  // лінку до ATEM міг спрацювати РАНІШЕ за фактичну зміну preview, і в ефір
  // йшло попереднє джерело замість щойно обраного.
  atemCmd({ type: 'preview', input: s.input }).then(function(result) {
    if (result && result.ok === false) return; // команда не пройшла — auto теж не давати
    atemCmd({ type: 'auto' });
  });
}

// Listen for ATEM state updates
if (window.electronAPI && window.electronAPI.onAtemStatus) {
  window.electronAPI.onAtemStatus(function(data) {
    setAtemStatus(data.connected, data.connected ? 'Підключено' : 'Відключено');
    if (data.connected) showAtemControls(true);
  });
  window.electronAPI.onAtemState(function(rawState) {
    window._lastAtemState = rawState;
    window._atemPgmInput = rawState.program || 0;
    // Throttle: перемальовуємо не частіше ~4 разів/сек, і НЕ чіпаємо DOM, поки
    // курсор у полі вводу — щоб набір тексту не «викидувало» (важливо на Windows).
    if (window._atemRenderPending) return;
    window._atemRenderPending = true;
    setTimeout(function() {
      window._atemRenderPending = false;
      // Обмежуємо "не чіпати DOM під час набору" тільки панеллю ATEM —
      // раніше перевірка була глобальною і будь-яке поле вводу деінде в програмі
      // (пошук у Біблії, назва пісні тощо) заморожувало PGM/PVW, тальні індикатори
      // і навіть тали PTZ (через ptzRenderTabs нижче), поки оператор просто друкував.
      var _ae = document.activeElement;
      var _atemPanel = document.getElementById('tab-content-atem');
      if (_ae && (_ae.tagName === 'INPUT' || _ae.tagName === 'TEXTAREA' || _ae.tagName === 'SELECT') &&
          _atemPanel && _atemPanel.contains(_ae)) return;
      var state = window._lastAtemState;
      if (!state) return;
      var pgm = document.getElementById('atemPgm');
      var pvw = document.getElementById('atemPvw');
      if (pgm) pgm.textContent = state.program ? (atemInputLabels[state.program-1] || ('Вхід ' + state.program)) : '–';
      if (pvw) pvw.textContent = state.preview ? (atemInputLabels[state.preview-1] || ('Вхід ' + state.preview)) : '–';
      if (typeof ptzRenderTabs === 'function') ptzRenderTabs();
      if (state.inputs && Object.keys(state.inputs).length) {
        var changed = false;
        for (var k in state.inputs) { if (atemDeviceLabels[k] !== state.inputs[k]) { atemDeviceLabels[k] = state.inputs[k]; changed = true; } }
        if (changed && typeof renderAtemInputs === 'function') renderAtemInputs();
      }
      for (var _i = 1; _i <= atemInputLabels.length; _i++) {
        var _pg = document.getElementById('atemPgmBtn-' + _i);
        if (_pg) { _pg.style.background = (state.program === _i) ? '#f56565' : ''; _pg.style.color = (state.program === _i) ? '#fff' : ''; }
        var _pv = document.getElementById('atemPvwBtn-' + _i);
        if (_pv) { _pv.style.background = (state.preview === _i) ? '#3ecf8e' : ''; _pv.style.color = (state.preview === _i) ? '#0a2a1a' : ''; }
      }
      var recStatus = document.getElementById('atemRecordStatus');
      if (recStatus) recStatus.textContent = state.recording ? '⏺ Запис іде...' : '⏹ Запис зупинено';
      var ftbBtn = document.getElementById('atemFtbBtn');
      if (ftbBtn) ftbBtn.style.background = state.ftb ? '#f56565' : '';
      var uskBtn = document.getElementById('atemUskBtn');
      if (uskBtn) uskBtn.style.background = (state.usks && state.usks[0]) ? '#f56565' : '';
      var dskBtn = document.getElementById('atemDskBtn');
      if (dskBtn) dskBtn.style.background = (state.dsks && state.dsks[0] && state.dsks[0].onAir) ? '#f56565' : '';
      var streamStatus = document.getElementById('atemStreamStatus');
      if (streamStatus) streamStatus.textContent = state.streaming ? '📡 Трансляція йде...' : '';
      var macroBox = document.getElementById('atemMacroList');
      if (macroBox) {
        if (state.macros && state.macros.length) {
          macroBox.innerHTML = state.macros.map(function(mm){
            return '<button class="btn btn-ghost btn-sm" style="margin:2px" onclick="atemCmd({type:\'macro-run\',index:' + mm.index + '})">▶ ' + (mm.name ? mm.name.replace(/[<>&]/g, '') : ('Макрос ' + (mm.index + 1))) + '</button>';
          }).join('');
        } else {
          macroBox.innerHTML = '<span style="font-size:11px;color:var(--text2)">Немає збережених макросів на ATEM</span>';
        }
      }
    }, 250);
  });
}

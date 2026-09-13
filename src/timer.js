// ============================================================
// ⏱ ТАЙМЕР
// Винесено з index.html для кращої організації коду.
//
// Примітка: TIMER_PRESETS/applyTimerPreset фізично стояли в іншому місці
// index.html (після коду синхронізації 2 ПК), не одразу за рештою функцій
// таймера — обидва шматки об'єднано тут в один логічний файл.
// ============================================================

var timerState = {
  running: false,
  paused: false,
  remaining: 600,
  setSeconds: 600,
  endTime: 0,
  interval: null
};


function timerFmt(s) {
  s = Math.max(0, s);
  var m = Math.floor(s / 60);
  var sec = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
}

function timerParseInput(val) {
  val = String(val).trim();
  if (val.indexOf(':') > -1) {
    var p = val.split(':');
    return parseInt(p[0]) * 60 + parseInt(p[1] || 0);
  }
  if (val.indexOf('.') > -1) {
    return Math.round(parseFloat(val) * 60);
  }
  return parseInt(val) * 60;
}

function timerRender() {
  var el = document.getElementById('timerDisplay');
  if (!el) return;
  el.textContent = timerFmt(timerState.remaining);
  el.style.color = timerState.remaining <= 30 && timerState.remaining > 0 ? '#f56565' :
                   timerState.remaining <= 0 ? '#f56565' : '#ffffff';

  var prog = document.getElementById('timerProgress');
  if (prog && timerState.setSeconds > 0) {
    prog.style.width = Math.max(0, timerState.remaining / timerState.setSeconds * 100) + '%';
  }

  // Оновлюємо пульт телефону
  broadcastRemoteState();
}

function timerStart() {
  if (timerState.running || timerState.paused) return;
  timerState.running = true;
  timerState.endTime = Date.now() + timerState.remaining * 1000;
  timerState.interval = setInterval(function() {
    timerState.remaining = Math.max(0, Math.ceil((timerState.endTime - Date.now()) / 1000));
    timerRender();
    if (timerState.remaining <= 0) timerStop();
  }, 200);
  updateTimerButtons();
}

function timerStop() {
  clearInterval(timerState.interval);
  timerState.interval = null;
  timerState.running = false;
  updateTimerButtons();
}

function timerPause() {
  if (!timerState.running) return;
  timerStop();
  timerState.paused = true;
  updateTimerButtons();
}

function timerResume() {
  if (!timerState.paused) return;
  timerState.paused = false;
  timerState.endTime = Date.now() + timerState.remaining * 1000;
  timerStart();
}

function timerReset() {
  timerStop();
  timerState.paused = false;
  timerState.remaining = timerState.setSeconds;
  timerRender();
  updateTimerButtons();
}

// explicitSecs — необов'язково: якщо задано (напр. автостарт перед службою
// рахує точну кількість секунд), беремо його напряму, а не значення поля
// #timerInput. Без аргументу — стара поведінка (кнопки/ручне поле).
function timerSetTime(explicitSecs) {
  var secs = (explicitSecs != null) ? Math.round(explicitSecs) : timerParseInput(document.getElementById('timerInput').value);
  if (!secs || secs <= 0) return;
  timerState.setSeconds = secs;
  timerState.remaining = secs;
  timerStop();
  timerState.paused = false;
  timerRender();
  updateTimerButtons();
}

// Відлік до конкретного часу (напр. служба о 10:00): рахуємо секунди до цілі сьогодні.
function timerToClockTime() {
  var val = (document.getElementById('timerClock').value || '').trim();
  var m = val.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) { if (typeof notify === 'function') notify('Введи час у форматі 10:00'); return; }
  var h = parseInt(m[1], 10), mn = parseInt(m[2], 10);
  if (h > 23 || mn > 59) { if (typeof notify === 'function') notify('Некоректний час'); return; }
  var now = new Date();
  var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mn, 0, 0);
  var secs = Math.round((target - now) / 1000);
  if (secs <= 0) { if (typeof notify === 'function') notify('⚠️ ' + val + ' уже минув сьогодні'); return; }
  timerState.setSeconds = secs;
  timerState.remaining = secs;
  timerStop();
  timerState.paused = false;
  timerRender();
  updateTimerButtons();
  if (typeof notify === 'function') notify('⏰ Відлік до ' + val + ' — ' + Math.floor(secs / 60) + ' хв ' + (secs % 60) + ' с. Тисни «📺 На проектор».');
}

function updateTimerButtons() {
  var btnStart  = document.getElementById('timerBtnStart');
  var btnPause  = document.getElementById('timerBtnPause');
  var btnResume = document.getElementById('timerBtnResume');
  if (!btnStart) return;
  btnStart.style.display  = (!timerState.running && !timerState.paused) ? 'block' : 'none';
  btnPause.style.display  = timerState.running ? 'block' : 'none';
  btnResume.style.display = timerState.paused ? 'block' : 'none';
}

// Які виходи ЗАРАЗ показують таймер — той самий патерн, що вже є в H2R/
// QR-екрані (qrLiveMap): кнопка сама підсвічується 🔴, коли там в ефірі.
var timerLiveMap = { 1: false, 2: false, 3: false, 4: false };

// n=0 (за замовчуванням) — на всі дзеркальні виходи, як і раніше.
// n=1..4 — саме на цей вихід (той самий підхід, що вже є для графіки/
// HTML-оверлеїв/QR-екрана/H2R/Медіа).
function sendTimerToProjector(n) {
  // Якщо відлік ще не запущено — запускаємо, щоб на екрані він одразу цокав
  // (раніше при «На проектор» без «Старт» таймер показувався застиглим).
  if (!timerState.running && !timerState.paused) timerStart();
  var line1 = document.getElementById('timerLine1').value || 'ДО ПОЧАТКУ';
  var line2 = document.getElementById('timerLine2').value || 'СЛУЖІННЯ';
  var subtitle = document.getElementById('timerSubtitle').value || '';
  var timerTheme = document.getElementById('timerTheme').value || 'blue';
  var bgImg = document.getElementById('timerBgImageData') ? document.getElementById('timerBgImageData').value : '';

  var themeColors = {
    blue:   { accent: '#4a8fc8', light: '#70b8f0', bg: 'rgba(74,143,200,0.12)' },
    purple: { accent: '#8a4ac8', light: '#b870f0', bg: 'rgba(138,74,200,0.12)' },
    green:  { accent: '#4ac87a', light: '#70f0a8', bg: 'rgba(74,200,122,0.12)' },
    red:    { accent: '#c84a4a', light: '#f07070', bg: 'rgba(200,74,74,0.12)' },
    gold:   { accent: '#c8a84b', light: '#f0d070', bg: 'rgba(200,168,75,0.12)' }
  };
  var tc = themeColors[timerTheme] || themeColors.blue;

  var bgStyle = bgImg
    ? 'background:url(' + bgImg + ') center/cover no-repeat;'
    : 'background:linear-gradient(135deg,#0a0a1a,#1a1a3e);';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    ':root{--accent:' + tc.accent + ';--accent-light:' + tc.light + ';--accent-bg:' + tc.bg + ';}' +
    'body{margin:0;' + bgStyle + 'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Georgia,serif;overflow:hidden;}' +
    '.dim{position:fixed;inset:0;background:rgba(0,0,0,0.45);}' +
    '.wrap{position:relative;z-index:1;text-align:center;padding:40px;}' +
    '.line1{color:#fff;font-size:90px;font-weight:700;letter-spacing:4px;text-shadow:0 2px 20px rgba(0,0,0,0.8);line-height:1.1;}' +
    '.line2{color:var(--accent-light);font-size:90px;font-weight:700;letter-spacing:4px;text-shadow:0 2px 20px rgba(0,0,0,0.8);line-height:1.1;}' +
    '.subtitle{color:rgba(255,255,255,0.7);font-size:32px;margin-top:16px;letter-spacing:2px;}' +
    '.timer-wrap{margin:32px auto;background:var(--accent-bg);border:2px solid var(--accent);border-radius:16px;padding:16px 48px;display:inline-block;}' +
    '.timer-label{color:rgba(255,255,255,0.6);font-size:22px;letter-spacing:3px;margin-bottom:6px;}' +
    '.timer{font-size:110px;color:var(--accent-light);font-family:monospace;font-weight:700;letter-spacing:4px;text-shadow:0 0 30px var(--accent);}' +
    '.timer.urgent{color:#f07070;text-shadow:0 0 30px rgba(240,112,112,0.7);}' +
    '.progress-wrap{width:300px;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;margin:8px auto 0;overflow:hidden;}' +
    '.progress{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-light));border-radius:3px;transition:width .5s;}' +
    '.clock{position:fixed;bottom:40px;right:60px;color:rgba(255,255,255,0.5);font-size:28px;font-family:monospace;letter-spacing:2px;}' +
    '</style></head><body>' +
    '<div class="dim"></div>' +
    '<div class="wrap">' +
    (line1 ? '<div class="line1">' + line1 + '</div>' : '') +
    (line2 ? '<div class="line2">' + line2 + '</div>' : '') +
    (subtitle ? '<div class="subtitle">' + subtitle + '</div>' : '') +
    '<div class="timer-wrap">' +
    '<div class="timer-label">ЗАЛИШИЛОСЬ</div>' +
    '<div class="timer" id="t">00:00</div>' +
    '<div class="progress-wrap"><div class="progress" id="p" style="width:100%"></div></div>' +
    '</div></div>' +
    '<div class="clock" id="clk"></div>' +
    '<script>' +
    'var rem=' + timerState.remaining + ',tot=' + timerState.setSeconds + ',end=' + (timerState.running ? timerState.endTime : 0) + ';' +
    'var running=' + timerState.running + ';' +
    'function fmt(s){s=Math.max(0,s);var m=Math.floor(s/60),sc=s%60;return(m<10?"0":"")+m+":"+(sc<10?"0":"")+sc;}' +
    'function tick(){if(running){rem=Math.max(0,Math.ceil((end-Date.now())/1000));}' +
    'var el=document.getElementById("t");el.textContent=fmt(rem);' +
    'el.className="timer"+(rem<=30&&rem>0?" urgent":"");' +
    'var p=document.getElementById("p");if(tot>0)p.style.width=Math.max(0,rem/tot*100)+"%";}' +
    'function clk(){var n=new Date(),h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();' +
    'document.getElementById("clk").textContent=(h<10?"0":"")+h+":"+(m<10?"0":"")+m+":"+(s<10?"0":"")+s;}' +
    'tick();clk();setInterval(tick,200);setInterval(clk,1000);' +
    '<\/script></body></html>';

  const label = 'Таймер — ' + timerFmt(timerState.remaining);
  if (!n) sendHTMLToProjector(html, label);
  else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, html, label);
  timerState._lastSentHtml = html;
  if (n) { timerLiveMap[n] = true; renderTimerOutBtns(); }
}

// РАНІШЕ прибрати таймер з виходу можна було, лише вручну надіславши туди
// щось інше — окремої кнопки не було взагалі (той самий пробіл, що вже
// виправили в H2R/QR/Біблії). pv2ClearOutput(n) — канонічний шлях
// очищення виходу (правильно згасає, а не просто обривається).
function clearTimerFrom(n) {
  if (typeof pv2ClearOutput === 'function') pv2ClearOutput(n);
  timerLiveMap[n] = false;
  renderTimerOutBtns();
}

// Рядок кнопок «на вихід 1/2/3/4» під «📺 На проектор» — статична картка в
// index.html не знає імен виходів (їх можна перейменувати), тож малюємо їх
// сюди динамічно, як і решту таких рядків (H2R/Медіа/QR).
function renderTimerOutBtns() {
  const el = document.getElementById('timerOutBtns');
  if (!el || typeof OUT_NAME === 'undefined') return;
  const outBtns = [1, 2, 3, 4].map(n => {
    const isLive = !!timerLiveMap[n];
    return `<button class="btn ${isLive ? 'btn-success' : 'btn-ghost'} btn-sm" style="font-size:10px;padding:3px 6px" onclick="sendTimerToProjector(${n})" title="Показати саме на ${escHtml(OUT_NAME[n] || ('Вихід ' + n))}">${isLive ? '🔴 ' : ''}${escHtml(OUT_NAME[n] || ('В.' + n))}</button>`;
  }).join('');
  const clearBtns = [1, 2, 3, 4].filter(n => timerLiveMap[n]).map(n =>
    `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 6px;color:var(--red)" onclick="clearTimerFrom(${n})" title="Прибрати з ${escHtml(OUT_NAME[n] || ('Вихід ' + n))}">✕ ${escHtml(OUT_NAME[n] || ('В.' + n))}</button>`
  ).join('');
  el.innerHTML = outBtns + (clearBtns ? '<span style="width:100%;height:0"></span>' + clearBtns : '');
}

function loadTimerBgImage(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var hidden = document.getElementById('timerBgImageData');
    if (hidden) hidden.value = e.target.result;
    var preview = document.getElementById('timerBgPreview');
    if (preview) {
      preview.style.backgroundImage = 'url(' + e.target.result + ')';
      preview.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function clearTimerBg() {
  var hidden = document.getElementById('timerBgImageData');
  if (hidden) hidden.value = '';
  var preview = document.getElementById('timerBgPreview');
  if (preview) { preview.style.backgroundImage = ''; preview.style.display = 'none'; }
  document.getElementById('timerBgInput').value = '';
}

var TIMER_PRESETS = {
  sunday:  { line1:'ДО ПОЧАТКУ', line2:'СЛУЖІННЯ',   subtitle:'Ласкаво просимо',      theme:'blue',   mins:10 },
  prayer:  { line1:'МОЛИТОВНЕ',  line2:'ЗІБРАННЯ',   subtitle:'Приєднуйтесь до молитви', theme:'purple', mins:10 },
  kids:    { line1:'ДИТЯЧЕ',     line2:'СЛУЖІННЯ',   subtitle:'Чекаємо на діток!',    theme:'green',  mins:5  },
  sermon:  { line1:'ПРОПОВІДЬ',  line2:'',           subtitle:'',                     theme:'gold',   mins:30 }
};

function applyTimerPreset(name) {
  var p = TIMER_PRESETS[name];
  if (!p) return;
  document.getElementById('timerLine1').value = p.line1;
  document.getElementById('timerLine2').value = p.line2;
  document.getElementById('timerSubtitle').value = p.subtitle;
  document.getElementById('timerTheme').value = p.theme;
  document.getElementById('timerInput').value = String(p.mins);
  timerSetTime();
}

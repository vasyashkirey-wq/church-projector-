
function pv2Prompt(message, defValue, cb) {
  if (typeof defValue === 'function') { cb = defValue; defValue = ''; }
  let ov = document.getElementById('pv2PromptOverlay');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'pv2PromptOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(6,8,18,.72);display:flex;align-items:center;justify-content:center;font-family:sans-serif';
  ov.innerHTML =
    '<div style="background:#1a1d2e;border:1px solid #2a2f45;border-radius:12px;padding:20px;width:min(90vw,420px);box-shadow:0 20px 60px rgba(0,0,0,.6)">' +
      '<div style="color:#e8eaf0;font-size:14px;margin-bottom:12px;white-space:pre-line">' + String(message || '').replace(/</g, '&lt;') + '</div>' +
      '<input id="pv2PromptInput" type="text" style="width:100%;box-sizing:border-box;background:#0f1117;border:1px solid #3a4060;border-radius:6px;padding:10px;color:#fff;font-size:14px;outline:none">' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">' +
        '<button id="pv2PromptCancel" style="padding:8px 16px;border-radius:6px;border:none;background:#2a2f45;color:#cbd0e0;cursor:pointer;font-size:13px">Скасувати</button>' +
        '<button id="pv2PromptOk" style="padding:8px 16px;border-radius:6px;border:none;background:#c8a84b;color:#1a1208;font-weight:700;cursor:pointer;font-size:13px">OK</button>' +
      '</div></div>';
  document.body.appendChild(ov);
  const input = document.getElementById('pv2PromptInput');
  input.value = defValue != null ? defValue : '';
  setTimeout(() => { input.focus(); input.select(); }, 30);
  const done = (val) => { ov.remove(); if (cb) cb(val); };
  document.getElementById('pv2PromptOk').onclick = () => done(input.value);
  document.getElementById('pv2PromptCancel').onclick = () => done(null);
  input.onkeydown = (e) => { if (e.key === 'Enter') done(input.value); else if (e.key === 'Escape') done(null); };
  ov.onclick = (e) => { if (e.target === ov) done(null); };
}

// Індикатор інтернету — стандартний navigator.onLine (перевіряє, чи мережевий
// адаптер ДУМАЄ, що є з'єднання; не гарантує реальний доступ до інтернету,
// але цього достатньо, щоб попередити «зараз офлайн» перед автооновленням чи
// пошуком ONVIF-камер, замість мовчазного очікування, що ніколи не завершиться).
function updateNetIndicator() {
  var el = document.getElementById('netIndicator');
  if (!el) return;
  var online = navigator.onLine;
  el.textContent = online ? '🟢' : '🔴';
  el.title = online ? 'Інтернет є' : 'Немає інтернету — автооновлення й пошук камер ONVIF не працюватимуть';
}
window.addEventListener('online', updateNetIndicator);
window.addEventListener('offline', updateNetIndicator);
safeInit(updateNetIndicator, 'updateNetIndicator');

// ============================================================
// ЦЕРКВА ПРАГА — РОЗШИРЕНІ ФУНКЦІЇ (extras.js)
// Портовано з панелі керування v3: плейлист, план служіння,
// медіа, текст, графіка, H2R-титри, шрифти, гарячі клавіші,
// анімації, stage display, статистика, PPT-експорт.
// Підключається в кінці index.html. Щоб вимкнути — видали
// <script src="extras.js"> та <link href="extras.css"> з index.html.
// ============================================================

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// Назва пісні як "ref" (маленький підпис над текстом на екрані) — можна
// вимкнути в Налаштуваннях (state.showSongTitle=false), якщо оператор не
// хоче, щоб назва показувалась зверху куплетів. За замовчуванням — показує,
// як і раніше (undefined трактуємо як "увімкнено", щоб не ламати вже
// збережені стани без цього поля).
function songRefForDisplay(title) {
  return (state.showSongTitle !== false) ? (title || '') : '';
}
function loadDisplayToggles() {
  var t = loadJSON(STORAGE_KEYS.live + '_showsongtitle');
  if (t !== null && t !== undefined) state.showSongTitle = t;
  var n = loadJSON(STORAGE_KEYS.live + '_showtransname');
  if (n !== null && n !== undefined) state.showTransName = n;
}
// Читаємо через спільний шар: великі дані лежать у файлі, а в сховищі лише позначка.
// Без цього extras.js бачив би позначку замість даних (пісні/оголошення «зникали б»).
const loadJSON = key => {
  try {
    const raw = (typeof bigStoreGet === 'function') ? bigStoreGet(key) : localStorage.getItem(key);
    return JSON.parse(raw);
  } catch (e) { return null; }
};
const saveJSON = (key, data) => {
  try {
    // Той самий шар, що й в index.html: велике — у файл, дрібне — у сховище
    if (typeof bigStoreSet === 'function') return bigStoreSet(key, JSON.stringify(data));
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    // Переповнення сховища: найчастіше через фонові зображення в темах (dataURL — мегабайти).
    // Раніше запис падав тихо і налаштування просто губились.
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      notify('⚠️ Сховище переповнене — прибери важкі фонові зображення з тем');
      console.warn('localStorage quota exceeded on key:', key, storageUsageQuick());
    } else {
      console.warn('Не вдалось зберегти', key, e);
    }
    return false;
  }
};
// safeInit(loadDisplayToggles) було тут раніше — прибрано звідси, бо
// падало через TDZ навіть після першого фіксу (перенесення після const
// loadJSON виявилось недостатнім: далі за текстом іще й const STORAGE_KEYS,
// а ще далі var state — усі потрібні тілу loadDisplayToggles). Виклик
// перенесено в САМИЙ КІНЕЦЬ файлу (нижче за всі top-level const/var), щоб
// більше не ганятись за черговою залежністю, яка опиниться нижче по тексту.
// Скільки місця займають наші дані (для діагностики)
function storageUsageQuick() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    total += ((localStorage.getItem(k) || '').length + k.length) * 2; // UTF-16
  }
  return { bytes: total, mb: (total / 1048576).toFixed(2) + ' МБ' };
}
const fmtTime = s => { const m=Math.floor(s/60), sec=Math.floor(s%60); return (m<10?'0':'')+m+':'+(sec<10?'0':'')+sec; };
// rafDebounce ПЕРЕНЕСЕНО в src/core/reactive.js — він вантажиться раніше
// за всі інші файли. Причина: background.js/html-overlay.js/song-*.js
// підключені ДО extras-1.js, а їхні render-функції обгорнуті в
// rafDebounce і викликаються вже на старті (initBgLibrary). Поки
// визначення жило тут, це падало з «rafDebounce is not defined».
const isActive = tabId => $('#tab-content-'+tabId) ? $('#tab-content-'+tabId).classList.contains('active') : false;
const downloadFile = (content, filename, mime) => {
  const blob = new Blob([content], {type: mime+';charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
// Спливаюче повідомлення внизу екрана
let _lastNotify = { msg: '', t: 0 };
function notify(msg) {
  // Однакове повідомлення підряд (напр. на 4 виходи) показуємо один раз
  const now = Date.now();
  if (msg === _lastNotify.msg && now - _lastNotify.t < 1200) return;
  _lastNotify = { msg: msg, t: now };

  let el = $('#pv2Toast');
  if(!el) {
    el = document.createElement('div');
    el.id = 'pv2Toast';
    el.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:#1e2335;color:#e8eaf0;border:1px solid #2a2f45;border-radius:8px;padding:8px 16px;font-size:13px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.5);transition:opacity .3s;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
// Місток до Біблії додатку: getVerse(книга, розділ, вірш)
const getVerse = (b, c, v) => (typeof getVerseText === 'function') ? getVerseText(b, c, v) : null;

// gddParams оголошено в index.html (var gddParams) — тут НЕ переоголошуємо,
// інакше 'let' поверх 'var' дає SyntaxError і весь extras.js не завантажується.
const STORAGE_KEYS = {
  routes: 'church_output_routes',
  station: 'church_station_cfg',
  chroma: 'church_output_chroma',
  themes: 'church_named_themes',
  live: 'church_live_config',
  bg: 'church_output_bg',
  songs: 'church_songs_db',
  announcements: 'church_announcements',
  hotkeys: 'church_hotkeys',
  midiMap: 'church_midi_map',
  playlist: 'church_playlist',
  playlistSaved: 'church_playlist_saved',
  statistics: 'church_statistics',
  cloud: 'church_cloud_config',
  stageNotes: 'church_stage_notes',
  stageMonitor: 'church_stage_monitor_fingerprint',
  qrPresets: 'church_qr_presets',
  graphicsPresets: 'church_graphics_presets',
  h2rTemplates: 'church_h2r_templates',
  hotkeyProfiles: 'church_hotkey_profiles',
  plugins: 'church_plugins',
  animations: 'church_animations',
  fonts: 'church_fonts',
  announceSettings: 'church_announce_settings',
  scenePresets: 'church_scene_presets'
};

const H2R_STYLES = {
  classic:{fontFamily:'Georgia,serif',bg:'rgba(10,10,26,0.92)',border:'4px solid var(--accent)',borderRadius:'0 12px 12px 0'},
  modern:{fontFamily:'"Segoe UI",Arial,sans-serif',bg:'rgba(20,30,50,0.85)',border:'none',borderRadius:'12px'},
  elegant:{fontFamily:'"Times New Roman",serif',bg:'rgba(10,5,20,0.9)',border:'2px solid var(--accent)',borderRadius:'0 20px 20px 0'},
  neon:{fontFamily:'"Courier New",monospace',bg:'rgba(0,0,0,0.8)',border:'2px solid var(--accent)',borderRadius:'8px'}
};

const PPT_TEMPLATES = {
  classic:{bg:'linear-gradient(135deg,#0a1628,#1e3a5f)',titleColor:'#f0c040',textColor:'#ffffff',fontFamily:'Georgia, serif'},
  modern:{bg:'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)',titleColor:'#5b8df6',textColor:'#f0f4ff',fontFamily:'"Segoe UI", Arial, sans-serif'},
  dark:{bg:'#0a0a0a',titleColor:'#f56565',textColor:'#c8c8c8',fontFamily:'"Helvetica Neue", Arial, sans-serif'}
};


// ============================================================
// АВТО-КОНТРАСТ ТЕКСТУ
// Якщо колір тексту не заданий (або зливається з фоном) — беремо
// чорний на світлому фоні і білий на темному. Раніше порожній колір
// давав невидимий текст.
// ============================================================
function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
// Відносна яскравість (WCAG)
function luminance(hex) {
  const c = hexToRgb(hex);
  if (!c) return 0;
  const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
}
function contrastRatio(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
// Головна функція: повертає безпечний колір тексту для даного фону
function textColorFor(bg, wanted) {
  const auto = state.autoContrast !== false;
  // Колір заданий і достатньо контрастний — лишаємо як є
  if (wanted && hexToRgb(wanted)) {
    if (!auto) return wanted;
    if (contrastRatio(wanted, bg || '#000000') >= 2.5) return wanted;
  }
  // Не заданий або зливається з фоном → чорний на світлому, білий на темному
  return luminance(bg || '#000000') > 0.45 ? '#000000' : '#ffffff';
}
// Фон для розрахунку контрасту: враховує градієнт і хромакей
function effectiveBg(s) {
  if (s.bgType === 'gradient' && s.bgGradient) {
    const m = String(s.bgGradient).match(/#[0-9a-fA-F]{3,6}/);
    return m ? m[0] : (s.bgColor || '#000000');
  }
  if (s.bgType === 'image') return '#000000'; // фото зазвичай темне під затемненням
  return s.bgColor || '#000000';
}


// Скрипт авто-вміщення, який вшивається у згенеровані слайди:
// зменшує шрифт, доки текст не влізе у видиму область.
const AUTOFIT_SCRIPT = `<script>
(function(){
  function fit(){
    var el = document.querySelector('.text');
    if(!el) return;
    var wrap = el.closest('.wrap') || document.body;
    var base = parseFloat(getComputedStyle(el).fontSize) || 58;
    var min = Math.max(20, base * 0.4);
    var availH = window.innerHeight - 40, availW = window.innerWidth - 40;
    var size = base, guard = 0;
    while ((wrap.scrollHeight > availH || wrap.scrollWidth > availW) && size > min && guard < 60) {
      size -= 2; el.style.fontSize = size + 'px'; guard++;
    }
  }
  if (document.readyState === 'complete') fit();
  else window.addEventListener('load', fit);
  window.addEventListener('resize', fit);
})();
<\/script>`;

// ---- 4 реальні виходи (вікна Electron) ----
const OUT_KIND = { 1: 'projector', 2: 'stream', 3: 'out3', 4: 'out4' };
const OUT_NAME_DEFAULT = { 1: 'Проектор', 2: 'Трансляція', 3: 'Вихід 3', 4: 'Вихід 4' };
const OUT_NAME = Object.assign({}, OUT_NAME_DEFAULT);   // мутуємо цей самий об'єкт — усі OUT_NAME[n] бачать зміну

function loadOutputNames() {
  const saved = loadJSON('church_output_names');
  if (saved) Object.keys(OUT_NAME_DEFAULT).forEach(n => { OUT_NAME[n] = saved[n] || OUT_NAME_DEFAULT[n]; });
}
function setOutputName(n, name) {
  name = String(name || '').trim().slice(0, 24);
  OUT_NAME[n] = name || OUT_NAME_DEFAULT[n];
  saveJSON('church_output_names', OUT_NAME);
  markDirty('router');
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();   // банер показує назву — оновити підпис одразу
}

// Відправити HTML на КОНКРЕТНИЙ вихід (а не на всі)
const _overlayCache = new Map(); // html → Promise<filePath|appUrl>
// Кешуємо саме ПРОМІС, а не готовий шлях: маршрути шлють однаковий HTML
// на 4 виходи одночасно, і всі 4 виклики стартують до завершення першого запису.

// ── ДВИГУН, фаза 1: перемикач каналу доставки HTML в output-вікна ──
// false (типово) = старий, перевірений роками канал: тимчасовий файл +
//                  file:// URL. Поведінка 1-в-1 як була.
// true            = нова кастомна схема app:// (src/main/content-protocol.js):
//                  HTML тримається в памʼяті, без тимчасових файлів, і має
//                  нормальне походження — саме це згодом дозволить увімкнути
//                  contextIsolation/webSecurity на output-вікнах (аудит 4.1).
//
// Перемикач НАВМИСНО з типовим значенням «вимкнено» і зберігається в
// налаштуваннях: увімкнути можна на одному ПК, перевірити всі типи
// контенту (H2R, GDD, фони, PDF/PPTX-слайди), і за потреби миттєво
// відкотитись — без перезбірки застосунку й без ризику зірвати службу.
function overlayChannelIsApp() {
  try {
    return !!(state && state.useAppProtocol) && !!(window.electronAPI && window.electronAPI.writeHtmlOverlayApp);
  } catch (e) { return false; }
}
function setOverlayChannel(useApp) {
  state.useAppProtocol = !!useApp;
  saveJSON(STORAGE_KEYS.live + '_useappproto', state.useAppProtocol);
  _overlayCache.clear();   // шляхи зі старого каналу більше не валідні
  notify(state.useAppProtocol
    ? '🔬 Канал доставки: app:// (новий). Перевір усі типи контенту.'
    : '↩️ Канал доставки: file:// (старий, перевірений)');
  if (typeof renderTabInto === 'function') { try { markDirty('settings'); } catch (e) {} }
}
function loadOverlayChannel() {
  const v = loadJSON(STORAGE_KEYS.live + '_useappproto');
  if (v !== null && v !== undefined) state.useAppProtocol = !!v;
}

function overlayPath(html) {
  let p = _overlayCache.get(html);
  if (p) return p;
  p = overlayChannelIsApp()
    ? window.electronAPI.writeHtmlOverlayApp(html)
    : window.electronAPI.writeHtmlOverlay(html);
  if (_overlayCache.size > 40) _overlayCache.clear(); // не тримаємо історію вічно
  _overlayCache.set(html, p);
  p.catch(() => _overlayCache.delete(html));          // невдалий запис не кешуємо
  return p;
}

// Лічильник поколінь відправки НА КОЖЕН ВИХІД.
//
// Проблема, яку це закриває: sendHTMLToOutputN асинхронна —
// overlayPath(html) спершу готує HTML, і лише потім .then() шле його у
// вікно. Якщо між цими двома моментами оператор очистить вихід,
// команда «clear» долетить ПЕРШОЮ (вона синхронна), а підготовлений
// HTML — після неї, і контент повернеться на щойно очищений екран.
// Виглядало як «прибираю, а воно саме вмикається».
//
// Тому очищення виходу підвищує його покоління (див. pv2ClearOutput), а
// кожна відправка перевіряє, чи її покоління ще актуальне. Це лікує ВСІ
// фічі одразу — QR, H2R-титри, медіа, таймер, графіку, вірші — бо всі
// вони йдуть саме через цю функцію.
var _outSendGen = { 1: 0, 2: 0, 3: 0, 4: 0 };

function sendHTMLToOutputN(n, html, label) {
  if (state.trainingMode) {
    if (label) notify('🎓 Тренування: «' + label + '» → ' + OUT_NAME[n] + ' (не на екрані)');
    return;
  }
  if (!window.electronAPI || !window.electronAPI.sendToOutput) { doSendHTML(html, label); return; }
  // doSendHTML (усі виходи, гілка вище) сам пише в журнал через хук у
  // extras-2.js — цей адресний шлях на конкретний вихід той хук не
  // проходить, тож без цього виклику «на вихід N» (H2R/Медіа/Таймер) не
  // потрапляло в «Журнал ефіру». Знайдено рев'ю коду.
  if (typeof recordStat === 'function') recordStat('html', label);
  var myGen = _outSendGen[n];
  overlayPath(html).then(filePath => {
    // Поки готувався HTML, вихід очистили (чи послали туди щось інше) —
    // цей результат застарів, мовчки викидаємо.
    if (myGen !== _outSendGen[n]) return;
    window.electronAPI.sendToOutput(OUT_KIND[n], 'html', { filePath: filePath });
  }).catch(err => {
    console.warn('Не вдалось записати HTML-оверлей', err);
    notify('⚠️ Не вдалось надіслати на ' + OUT_NAME[n]);
  });
  if (label) notify('▶ ' + label + ' → ' + OUT_NAME[n]);
}


function pv2OpenOutput(n) {
  if (!window.electronAPI || !window.electronAPI.openOutput) return;
  window.electronAPI.openOutput(OUT_KIND[n]).then(() => {
    state.outputStates[n].open = true;
    pv2RenderOutputsCard();
  }).catch(err => notify('⚠️ Не вдалось відкрити ' + OUT_NAME[n]));
}
function pv2CloseOutput(n) {
  if (!window.electronAPI || !window.electronAPI.closeOutput) return;
  window.electronAPI.closeOutput(OUT_KIND[n]).then(() => {
    state.outputStates[n].open = false;
    pv2RenderOutputsCard();
  }).catch(() => {});
}
// Тумблер відкрити/закрити для БУДЬ-ЯКОГО виходу за номером — те саме, що
// toggleProjector()/toggleStream() роблять для 1/2 (F1/F2), але для решти.
// Використовується гарячими клавішами F3/F4 (вихід 3/4) — раніше F1/F2/F5
// мали тумблер, а вихід 3/4 доводилось відкривати лише мишкою.
function toggleOutputN(n) {
  if (state.outputStates && state.outputStates[n] && state.outputStates[n].open) pv2CloseOutput(n);
  else pv2OpenOutput(n);
}
// Застосувати колір фону за кодом (hex) до виходу n
function pv2ApplyOutputBg(n) {
  const input = $('#pv2BgCode' + n);
  if (!input) return;
  let code = (input.value || '').trim();
  if (code && !/^#/.test(code)) code = '#' + code;
  if (code && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(code)) {
    notify('⚠️ Невірний код кольору. Приклад: #00ff00');
    input.style.borderColor = 'var(--red)';
    return;
  }
  input.style.borderColor = '';
  if (window.electronAPI && window.electronAPI.setOutputBg) {
    window.electronAPI.setOutputBg(OUT_KIND[n], code || null);
  }
  const sw = $('#pv2BgSwatchR' + n);
  if (sw) sw.style.background = code || '#000';
  state.outputBg[n] = code || null;
  saveJSON(STORAGE_KEYS.bg, state.outputBg);
  notify('🎨 Фон ' + OUT_NAME[n] + ': ' + (code || 'фон теми'));
}
function pv2SetBgCode(n, code) {
  const input = $('#pv2BgCode' + n);
  if (input) input.value = code;
  pv2ApplyOutputBg(n);
}
function pv2SyncOutputStates() {
  if (!window.electronAPI || !window.electronAPI.outputsStatus) return;
  window.electronAPI.outputsStatus().then(st => {
    for (let i = 1; i <= 4; i++) state.outputStates[i].open = st[OUT_KIND[i]] === 'open';
    pv2RenderOutputsCard();
  }).catch(() => {});
}
// Картка «4 виходи + фон за кодом» у вкладці Монітори
// Оновлює індикатори статусу виходів у вкладці «Виходи».
// (раніше тут була друга картка з тими самими id — поля дублювались і не працювали)
function pv2RenderOutputsCard() {
  for (let i = 1; i <= 4; i++) {
    const dot = $('#pv2Dot' + i);
    if (dot) {
      const open = state.outputStates[i] && state.outputStates[i].open;
      dot.style.color = open ? 'var(--green)' : 'var(--red)';
      dot.title = open ? 'Відкрито' : 'Закрито';
    }
  }
}

// ---- Стан розширених функцій. Пісні/оголошення/вибір/таймер ----
// ---- беруться напряму з основного додатку через геттери.     ----
var state = {
  hotkeys: {}, _hotkeyCapture: null,
  midiMap: {}, midiLearn: null, midiInputs: [],   // MIDI-тригери (Web MIDI API, без нативних модулів)
  oscMap: {}, oscLearn: null, oscRunning: false,  // OSC-тригери (UDP, слухаємо адреси)
  outputStates: {1:{open:true},2:{open:true},3:{open:false},4:{open:false}},
  // Що показує кожен вихід: mirror | next | graphics | h2r | text | timer | blank | freeze
  outputRoutes: {1:'mirror', 2:'mirror', 3:'mirror', 4:'mirror'},
  // Колір фону кожного виходу за hex-кодом (null = фон теми)
  outputBg: {1:null, 2:null, 3:null, 4:null},
  // Хромакей для кожного з 4 виходів ('none' або hex)
  outputChroma: {1:'none', 2:'none', 3:'none', 4:'none'},
  outputLive: {1:null, 2:null, 3:null, 4:null},   // «зараз показує» для кожного виходу окремо
  // Пресети сцени — на відміну від «Профілю» (один вихід), зберігає й
  // застосовує режим+хромакей+фон одразу для ВСІХ 4 виходів одним кліком.
  scenePresets: [],
  // Авто-контраст: якщо колір тексту не заданий — беремо чорний на світлому фоні, білий на темному
  autoContrast: true,
  // Куди йде наступна відправка: 'all' або конкретний вихід 1..4
  sendTarget: 'all',
  // Станція: host = ПК біля проектора (керує виводом), client = друга панель
  station: { mode: 'solo', ip: '', pin: '', name: '', connected: false, clients: [] },
  pult: { on: false, url: '', pin: '' },
  multiTrans: { 1: [], 2: [], 3: [], 4: [] }, multiLive: [],
  multiTransStyle: {},       // стиль слайда кількох перекладів окремо на кожен вихід (шрифт, розташування)
  secondLang: null,          // id другого перекладу (напр. чеського)
  thirdLang: null,           // id третього перекладу (напр. англійського)
  secondLangMode: 'under',   // under = під основним текстом | output = окремий вихід
  transpose: 0,              // транспонування акордів для музикантів
  autoTimer: { on: false, weekday: 0, time: '10:00', minsBefore: 10 },
  splitCfg: { on: true, maxLines: 4, maxChars: 180 },  // розбиття довгих куплетів
  orders: {},        // порядок частин для кожної пісні
  songTags: {},      // кольорові мітки-категорії пісень (id → ключ)
  chorusEach: {},    // прапорець «приспів після кожного куплета» для кожної пісні
  slideIdx: 0,
  // Розмір шрифту пісні — ОКРЕМИЙ для кожного з 4 виходів (раніше було одне
  // спільне значення на всі + окреме "перевизначення по виходах" зверху —
  // тепер це одна система: null = авто-підгін під найдовший слайд для ЦЬОГО
  // виходу, число = зафіксований розмір саме для нього. Кнопки A−/A+ у
  // вкладці «Пісні» керують усіма 4 разом; у «Виходах» — точково по одному.
  songSize: {1: null, 2: null, 3: null, 4: null},
  scheduler: { items: [] }, autoBackup: { on: false, everyDays: 7, last: 0 }, songTrash: [], lang: 'ua',
  blackout: false, masterVolume: 1, sermon: { running: false }, bookmarks: [], panelLocked: false,
  // Титр для трансляції
  lower: { style: 'gold', position: 'bottom', animation: 'slideUp', accent: null, scale: 0.62,
           target: 2, autoHide: 0, visible: false },
  captions: { enabled: false, listening: false, text: '', interim: '', targetOutput: 1,
    verseDetect: false, suggestion: null },  // живі субтитри (Web Speech API) + автопропозиція вірша
  cloudSync: { folder: null, lastSync: null, autoSync: true },  // хмарна синхронізація бібліотеки
  service: { name: '', date: '', items: [], idx: -1, slideIdx: 0, saved: [], serviceStartedAt: null },
  bgVideo: null,     // фонове відео
  bgQueue: [], bgQueueInterval: 30, bgQueueIdx: 0, bgQueueRunning: false,  // черга з авто-ротацією
  logo: null,        // сам логотип-картинка — один файл, спільний для всіх виходів
  // Показ логотипа — ОКРЕМИЙ для кожного з 4 виходів (раніше було одне
  // спільне state.logoOn на всі). position: 'center-full' (на весь екран,
  // як заставка паузи) або кутова ('top-left'/'top-right'/'bottom-left'/
  // /'bottom-right' — маленький значок, як водяний знак, не перекриває контент).
  logoSettings: {
    1: { on: false, position: 'center-full', size: 160 },
    2: { on: false, position: 'center-full', size: 160 },
    3: { on: false, position: 'center-full', size: 160 },
    4: { on: false, position: 'center-full', size: 160 }
  },
  _logoEditN: 1,   // який вихід зараз редагується в панелі «Шари» (лише UI, не зберігається)
  // Постійний водяний знак (напр. назва церкви/рік) — ОКРЕМИЙ для кожного
  // з 4 виходів (раніше було одне спільне налаштування на всі).
  watermark: {
    1: { text: '', on: false, position: 'top-left', size: 16, color: '#ffffff' },
    2: { text: '', on: false, position: 'top-left', size: 16, color: '#ffffff' },
    3: { text: '', on: false, position: 'top-left', size: 16, color: '#ffffff' },
    4: { text: '', on: false, position: 'top-left', size: 16, color: '#ffffff' }
  },
  _watermarkEditN: 1,   // який вихід зараз редагується в панелі «Шари» (лише UI, не зберігається)
  // Заморозка — ОКРЕМА для кожного з 4 виходів (раніше було одне спільне
  // булеве значення на всі). Глобальний перемикач toggleFreeze() (гаряча
  // клавіша, швидка кнопка) і далі керує всіма 4 одразу — просто тепер
  // під капотом це той самий об'єкт, що й для точкового toggleFreezeOutput(n).
  frozen: {1: false, 2: false, 3: false, 4: false},
  alertCfg: { text: '', position: 'bottom', size: 34, seconds: 12, ticker: false, targetOutput: null },   // targetOutput: null = на всі виходи
  bgAudio: { playing: false, volume: 0.5, name: '' },
  // Ефір: SoftProjector розділяє Prepare і Live — робимо так само, але з живим прев'ю
  liveMode: 'staged',   // staged = спершу в прев'ю, потім «В ЕФІР» | direct = одразу на екран
  onAir: null,          // що зараз реально в залі
  preview: null,        // що підготовлено, але ще не показано
  goingLive: false,     // внутрішній прапорець, щоб не зациклити перехоплення
  themes: [],           // іменовані теми (як «Add New Theme» у SoftProjector)
  activeThemeId: null,
  displayCfg: { alwaysOnTop: true, singleScreen: false, ctrlSize: 42, ctrlAlign: 'bottom-right', ctrlOpacity: 0.5 },
  playlist: [], playlistIndex: 0, playlistRunning: false, playlistTimer: null,
  mediaFiles: [], currentMediaIndex: -1, mediaPlayer: null,
  animSettings: {entry:'fade', exit:'fade', speed:500},
  statsData: {totalOutputs:0, songUsage:{}, bibleUsage:{}, dailyActivity:{}, log:[]},
  textSettings: {
    1:{size:58,position:'center',align:'center',color:'#ffffff',bgColor:'#000000',fontFamily:'Georgia, serif',styles:{bold:false,italic:false,shadow:true},
       strokeWidth:0,strokeColor:'#000000',scrim:0,safeArea:0,letterSpacing:0,lineHeight:1.4,fadeMs:600,bgType:'color',bgVideo:null,bgImage:null},
    2:{size:58,position:'center',align:'center',color:'#ffffff',bgColor:'#000000',fontFamily:'Georgia, serif',styles:{bold:false,italic:false,shadow:true},
       strokeWidth:0,strokeColor:'#000000',scrim:0,safeArea:0,letterSpacing:0,lineHeight:1.4,fadeMs:600,bgType:'color',bgVideo:null,bgImage:null},
    3:{size:58,position:'center',align:'center',color:'#ffffff',bgColor:'#000000',fontFamily:'Georgia, serif',styles:{bold:false,italic:false,shadow:true},
       strokeWidth:0,strokeColor:'#000000',scrim:0,safeArea:0,letterSpacing:0,lineHeight:1.4,fadeMs:600,bgType:'color',bgVideo:null,bgImage:null},
    4:{size:58,position:'center',align:'center',color:'#ffffff',bgColor:'#000000',fontFamily:'Georgia, serif',styles:{bold:false,italic:false,shadow:true},
       strokeWidth:0,strokeColor:'#000000',scrim:0,safeArea:0,letterSpacing:0,lineHeight:1.4,fadeMs:600,bgType:'color',bgVideo:null,bgImage:null}
  },
  currentTextOutput: 1,
  // Розмір тексту оголошень — ОКРЕМО для кожного з 4 виходів, незалежно від
  // загальних textSettings (щоб зміна розміру пісні не зачіпала оголошення
  // й навпаки).
  announceSettings: {
    1: { titleSize: 64, bodySize: 44, dateSize: 32 },
    2: { titleSize: 64, bodySize: 44, dateSize: 32 },
    3: { titleSize: 64, bodySize: 44, dateSize: 32 },
    4: { titleSize: 64, bodySize: 44, dateSize: 32 }
  },
  graphicsSettings: {
    refColor:'#c8a84b', textColor:'#ffffff', bgColor:'#0a0a1a', decor:'line',
    size: 58,               // розмір тексту в px (раніше було зашито 20px — не читалось на проекторі)
    refSize: 30,            // розмір посилання
    fontFamily: 'Georgia, serif',
    layout: 'full',         // full = слайд на весь екран | lower = титр поверх відео (для трансляції)
    streamOpacity: 62,      // прозорість фону графіки для трансляції, % (100 = суцільний) — застаріле, лишено для сумісності зі старими збереженнями
    // Те саме, але окремо для КОЖНОГО з 4 виходів — раніше було лише ОДНЕ
    // спільне значення (streamOpacity), тож вихід 3/4 з хромакеєм не мав
    // куди поставити свою прозорість, окрім як через трансляцію.
    outputOpacity: {1: 62, 2: 62, 3: 62, 4: 62},
    bgType: 'color',        // color | gradient | image
    bgGradient: 'linear-gradient(135deg,#0a0a1a,#1a1a3e)',
    bgImage: null,          // data:URL зображення
    bgDim: 0.35,            // затемнення поверх зображення (0..1)
    shadow: true,
    align: 'center',        // left | center | right
    bold: false,
    italic: false,
    outline: false,         // контур тексту замість/на додачу до тіні
    outlineColor: '#000000',
    bgVideo: null,          // {src, name, speed} — фон-відео для повноекранного макета
    bgVideoDim: 0.35,       // затемнення поверх відео (той самий сенс, що bgDim для фото)
    template: 'verse',      // verse | title | quote | list — композиція слайда
    extraTitle: ''          // заголовок над текстом — для шаблону «title» (напр. тема проповіді)
  },
  h2rConfig: {line1:'Олександр', line2:'Проповідник', line3:'Церква Прага', style:'classic', accent:'#7c6af7', textColor:'#ffffff', bgColor:'#0a0a1a', animation:'slideLeft', duration:3, scale:2},
  // Титри подяки — прокрутка знизу вгору (як титри фільму), для завершення
  // служби/події. lines — багаторядковий текст, по рядку на пункт.
  creditsConfig: {lines:'Дякуємо всім, хто допоміг!\nЗвук: Іван\nВідео: Марія\nВолонтери', durationSec:30, textColor:'#ffffff', accent:'#c8a84b', bg:'#0a0a1a'},
  // Тікер — горизонтальний біжучий рядок унизу екрана (як новинний канал),
  // на відміну від титрів подяки (вертикальні, одноразові) — цей крутиться
  // ПО КОЛУ, доки не зупинять вручну.
  tickerConfig: {text:'Слідкуйте за оголошеннями у групі церкви', speedSec:18, bg:'#0a0a1a', textColor:'#ffffff', accent:'#c8a84b'},
  customFonts: [],
  pptTemplate: 'classic', pptPreviewIndex: 0
};
Object.defineProperties(state, {
  songs:               { get: () => (typeof currentSongs !== 'undefined' ? currentSongs : []) },
  announcements:       { get: () => (typeof announcements !== 'undefined' ? announcements : []) },
  selectedSong:        { get: () => (typeof selectedSong !== 'undefined' ? selectedSong : null) },
  selectedVerseIdx:    { get: () => (typeof selectedVerseIdx !== 'undefined' ? selectedVerseIdx : 0) },
  currentBibleBook:    { get: () => (typeof currentBibleBook !== 'undefined' ? currentBibleBook : null) },
  currentBibleChapter: { get: () => (typeof currentBibleChapter !== 'undefined' ? currentBibleChapter : null) },
  currentBibleVerseNum:{ get: () => (typeof currentBibleVerseNum !== 'undefined' ? currentBibleVerseNum : null) },
  timerState:          { get: () => (typeof timerState !== 'undefined' ? timerState : {remaining:0, setSeconds:0}) }
});

function applyH2RPreset(name) {
const presets = {
speaker: {line1:'Олександр Коваленко', line2:'Старший пастор', line3:'Церква Прага', accent:'#7c6af7', style:'classic'},
worship: {line1:'Час поклоніння', line2:'Слава Богу', line3:'Церква Прага', accent:'#3ecf8e', style:'modern'},
bible: {line1:'Слово Боже', line2:'Від Матвія 5:3', line3:'Блаженні вбогі духом...', accent:'#c8a84b', style:'elegant'}
};
const p = presets[name];
if(!p) return;
Object.keys(p).forEach(k => state.h2rConfig[k] = p[k]);
const line1 = $('#h2rLine1');
const line2 = $('#h2rLine2');
const line3 = $('#h2rLine3');
const style = $('#h2rStyle');
const accent = $('#h2rAccent');
if(line1) line1.value = state.h2rConfig.line1 || '';
if(line2) line2.value = state.h2rConfig.line2 || '';
if(line3) line3.value = state.h2rConfig.line3 || '';
if(style) style.value = state.h2rConfig.style || 'classic';
if(accent) accent.value = state.h2rConfig.accent || '#7c6af7';
updateH2RPreview();
notify('✓ Пресет "' + name + '"');
}


function captureHotkey(e) {
if(!state._hotkeyCapture) return;
e.preventDefault();
const keyMap = {' ':'Space','ArrowLeft':'ArrowLeft','ArrowRight':'ArrowRight','ArrowUp':'ArrowUp','ArrowDown':'ArrowDown','Enter':'Enter','Escape':'Escape'};
const dk = keyMap[e.key] || e.key;
const action = state._hotkeyCapture.dataset.action;
let dup = false;
Object.keys(state.hotkeys).forEach(a => { if(a !== action && state.hotkeys[a] === dk) dup = true; });
if(dup) {
state._hotkeyCapture.style.borderColor = 'var(--red)';
return;
}
state.hotkeys[action] = dk;
state._hotkeyCapture.value = dk;
state._hotkeyCapture.style.borderColor = '';
state._hotkeyCapture = null;
saveHotkeys();
const status = $('#hotkeyStatus');
if(status) status.textContent = '✓ Клавішу призначено';
}

// РАНІШЕ ця функція міняла лише прев'ю оператора (500мс блимка), а живий
// екран взагалі не чіпала — титри лишались там НАЗАВЖДИ, доки щось інше їх
// випадково не замінило б. Тепер справді прибирає: спершу програє парну
// анімацію ВИХОДУ (той самий рух, що й вхід, у зворотному напрямку), тоді,
// коли вона завершиться, надсилає порожню сторінку, щоб остаточно очистити.
function clearH2R(n) {
  if (state.h2rConfig.line1 || state.h2rConfig.line2 || state.h2rConfig.line3) {
    const exitHtml = getH2RHTML(true);
    if (!n) doSendHTML(exitHtml, '');
    else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, exitHtml, '');
    setTimeout(() => {
      const blank = '<!DOCTYPE html><html><body style="background:transparent"></body></html>';
      if (!n) doSendHTML(blank, '');
      else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, blank, '');
    }, 450);
  }
  if (n) { h2rLowerLiveMap[n] = false; if (typeof renderH2RLowerOutBtns === 'function') renderH2RLowerOutBtns(); }
  const content = $('#h2rPreviewContent');
  if (content) { content.style.opacity = '0'; setTimeout(() => { if (content) content.style.opacity = '1'; }, 300); }
}

// closeStageDisplay/openStageDisplay — оновлено 27.08.2026: раніше тут був
// window.open()-попап (жив лише в рендерері, без гарантії «поверх усіх
// вікон», зникав за блокуванням спливаючих вікон). Тепер — звичайне
// BrowserWindow через window.electronAPI.openStageWindow(), як і решта виходів.
// CCLI-подібний звіт: реальні дати використання кожної пісні (не «сьогодні»
// для всього), лише пісні (без віршів — CCLI їх не потребує), усі, а не
// топ-10, і саме за обраний період (раніше перемикач Період нічого не робив).
// Що зараз обрано для показу. Використовується прев'ю і «В ефір».
//
// ДВА БАГИ, ЯКІ ТУТ БУЛИ (обидва давали «Контент не обрано»):
// 1) Джерело визначалось за тим, яка ВКЛАДКА зараз відкрита
//    (isActive('bible')). Коли оператор виводив прямо з Біблії — усе
//    працювало, бо вкладка активна. А через прев'ю активна вкладка
//    «Показ», тож жодна умова не спрацьовувала й на екран летіла
//    заглушка. Тепер дивимось на ФАКТИЧНО обраний вміст, а активна
//    вкладка — лише підказка для вибору між піснею й віршем.
// 2) Пісня читалась із state.selectedSong, якої не існує: пісня живе в
//    глобальній selectedSong (index.html). Тобто пісні звідси не
//    бралися взагалі, за жодних умов.
function getCurrentContent() {
  const payload = { html: '', ref: '' };

  // Фактично обране, незалежно від відкритої вкладки
  const song = (typeof selectedSong !== 'undefined' && selectedSong) ? selectedSong : null;
  const songIdx = (typeof selectedVerseIdx !== 'undefined') ? selectedVerseIdx : 0;
  const bibleText = ($('#bibleDisplay')?.textContent || '').trim();
  const bibleRef = ($('#bibleRef')?.textContent || '').trim();
  const hasBible = bibleText && bibleText !== '—' && bibleText.indexOf('Оберіть вірш') !== 0;

  // Оголошення — лише коли ця вкладка справді відкрита: там вміст
  // збирається з полів, які поза вкладкою не мають сенсу.
  if (isActive('announce')) {
    return { type: 'html', payload: { html: getAnnounceHTML({
      title: $('#annTitle')?.value, body: $('#annBody')?.value,
      datetime: $('#annDateTime')?.value, style: $('#annStyle')?.value }), ref: 'Оголошення' } };
  }

  // Якщо обрано і пісню, і вірш — вирішуємо так: спершу активна
  // вкладка, потім те, що виводили останнім (lastLiveSource), і лише
  // потім — що є в наявності.
  let preferSong;
  if (isActive('songs')) preferSong = true;
  else if (isActive('bible')) preferSong = false;
  else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'song') preferSong = true;
  else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible') preferSong = false;
  else preferSong = !!song && !hasBible;

  if (preferSong && song) {
    payload.html = song.verses[songIdx] || '';
    payload.ref = songRefForDisplay(song.title);
  } else if (hasBible) {
    payload.html = bibleText;
    payload.ref = bibleRef;
  } else if (song) {
    payload.html = song.verses[songIdx] || '';
    payload.ref = songRefForDisplay(song.title);
  } else {
    payload.html = 'Контент не обрано';
  }
  return { type: 'text', payload };
}


// ============================================================
// ТИТР ДЛЯ ТРАНСЛЯЦІЇ (нижня третина)
// Слайд на весь екран перекриває камеру. Для трансляції потрібне
// інше: смуга з віршем ВНИЗУ, а камера видно навколо.
// Фон робимо прозорим або хромакейним — OBS вирізає його.
// ============================================================
const LOWER_STYLES = {
  gold:    {name: 'Класика (золото)',   accent: '#e8a33d', panel: 'linear-gradient(180deg, rgba(28,16,8,.90), rgba(14,8,4,.94))'},
  royal:   {name: 'Королівський синій', accent: '#5b8df6', panel: 'linear-gradient(180deg, rgba(8,18,38,.90), rgba(4,10,24,.95))'},
  minimal: {name: 'Мінімал (тонка смуга)', accent: '#ffffff', panel: 'rgba(0,0,0,.62)'},
  glass:   {name: 'Скло (розмиття)',    accent: '#ffffff', panel: 'rgba(255,255,255,.10)'},
  warm:    {name: 'Тепле дерево',       accent: '#d98f4a', panel: 'linear-gradient(180deg, rgba(40,24,12,.92), rgba(20,12,6,.95))'},
  clean:   {name: 'Світла картка',      accent: '#8a6d1f', panel: 'rgba(250,247,240,.94)'}
};
const LOWER_POS = {
  bottom: 'left:6%;right:6%;bottom:7%;',
  top:    'left:6%;right:6%;top:7%;',
  left:   'left:4%;bottom:10%;max-width:44%;',
  right:  'right:4%;bottom:10%;max-width:44%;',
  center: 'left:12%;right:12%;top:50%;transform:translateY(-50%);'
};
const LOWER_ANIM = {
  slideUp: '@keyframes in{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}',
  slideLeft: '@keyframes in{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:translateX(0)}}',
  fade:    '@keyframes in{from{opacity:0}to{opacity:1}}',
  zoom:    '@keyframes in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}',
  none:    '@keyframes in{from{opacity:1}to{opacity:1}}'
};

function getVerseLowerThirdHTML(text, ref) {
  const s = state.graphicsSettings;
  const L = state.lower || {};
  const st = LOWER_STYLES[L.style || 'gold'] || LOWER_STYLES.gold;
  const accent = L.accent || st.accent;
  const light = (L.style === 'clean');
  const txt = light ? '#1a1208' : (s.textColor && hexToRgb(s.textColor) ? s.textColor : '#ffffff');

  const size = Math.max(24, Math.round((s.size || 52) * (L.scale || 0.62)));
  const refSize = Math.max(16, Math.round(size * 0.52));
  const pos = LOWER_POS[L.position || 'bottom'] || LOWER_POS.bottom;
  const anim = LOWER_ANIM[L.animation || 'slideUp'] || LOWER_ANIM.slideUp;
  const chroma = s.lowerChroma || 'transparent';
  const minimal = (L.style === 'minimal');
  const glass = (L.style === 'glass');

  const lines = minimal ? '' : `
    <div class="line top"></div><div class="line bot"></div>`;

  const refTag = ref ? (minimal
    ? `<div class="ref-flat">${esc(ref)}</div>`
    : `<div class="ref">${esc(ref)}</div>`) : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    html,body{margin:0;height:100vh;background:${chroma};overflow:hidden;font-family:${s.fontFamily || 'Georgia, serif'}}
    ${anim}
    .wrap{position:fixed;${pos}animation:in .55s ease both}
    .panel{position:relative;box-sizing:border-box;max-width:100%;background:${st.panel};border-radius:${minimal ? '3px' : '6px'};
           ${glass ? 'backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.22);' : ''}
           ${light ? 'box-shadow:0 14px 44px rgba(0,0,0,.45);' : 'box-shadow:0 18px 60px rgba(0,0,0,.55);'}
           padding:${Math.round(size * (minimal ? 0.55 : 1.15))}px ${Math.round(size * 0.9)}px ${Math.round(size * (minimal ? 0.55 : 0.85))}px;}
    .line{position:absolute;left:0;right:0;height:3px;
          background:linear-gradient(90deg,transparent,${accent} 12%,#fff3c4 50%,${accent} 88%,transparent);
          box-shadow:0 0 18px ${accent},0 0 40px ${accent}55;}
    .line.top{top:0} .line.bot{bottom:0}
    .ref{position:absolute;top:${-Math.round(refSize * 1.15)}px;left:50%;transform:translateX(-50%);
         background:${light ? '#fff' : 'linear-gradient(180deg,#3a2410,#1d1208)'};color:${light ? accent : txt};
         font-size:${refSize}px;font-weight:700;letter-spacing:.5px;white-space:nowrap;
         padding:${Math.round(refSize * 0.32)}px ${Math.round(refSize * 1.4)}px;
         border:2px solid ${accent};border-radius:8px;box-shadow:0 0 22px ${accent}80,inset 0 0 18px rgba(0,0,0,.5);}
    .ref-flat{color:${accent};font-size:${refSize}px;font-weight:700;letter-spacing:2px;
              text-transform:uppercase;margin-bottom:${Math.round(size * 0.18)}px;text-align:center}
    .text{color:${txt};font-size:${size}px;line-height:1.28;text-align:center;
          text-shadow:${light ? 'none' : '0 2px 10px rgba(0,0,0,.9)'};
          /* довгий вірш переносимо, а не обрізаємо */
          overflow-wrap:break-word;word-break:normal;hyphens:auto;max-width:100%;}
  </style></head><body>
    <div class="wrap"><div class="panel">${lines}${refTag}
      <div class="text">${String(text || '').replace(/\n/g, '<br>')}</div>
    </div></div>
  </body></html>`;
}

function getGraphicsHTML(text, ref, bgAlpha) {
  const s = state.graphicsSettings;
  // Титр для трансляції — окремий макет: камера видно, вірш смугою внизу
  if (s.layout === 'lower') return getVerseLowerThirdHTML(text, ref);
  const decorSym = {cross:'✝', ornament:'✦', line:'', none:''}[s.decor] || '';

  // Фон: суцільний колір, градієнт, зображення або відео (кожен із затемненням)
  let bgCss = s.bgColor;
  if (s.bgType === 'gradient') bgCss = s.bgGradient || s.bgColor;
  const bgImageLayer = (s.bgType === 'image' && s.bgImage)
    ? `<div class="bgimg" style="background-image:url('${s.bgImage}')"></div><div class="dim"></div>`
    : '';
  // Відео-фон: власний <video> у самому слайді (це окремий самодостатній HTML-документ,
  // тому не може скористатись фоновим відео звичайного текстового виводу — той живе
  // в persistent-вікні проектора, а цей слайд рендериться в ізольованому iframe).
  const bgVideoSpeed = (s.bgVideo && s.bgVideo.speed) || 1;
  const bgVideoLayer = (s.bgType === 'video' && s.bgVideo && s.bgVideo.src)
    ? `<video class="bgvid" autoplay loop muted playsinline src="${esc(s.bgVideo.src)}"
        onloadedmetadata="this.playbackRate=${bgVideoSpeed}"></video><div class="dim" style="background:rgba(0,0,0,${s.bgVideoDim != null ? s.bgVideoDim : 0.35})"></div>`
    : '';
  if (s.bgType === 'video') bgCss = '#000';   // поки відео вантажиться — чорний, не бузковий фон за замовчуванням

  const bgRef = effectiveBg(s);
  const textColor = textColorFor(bgRef, s.textColor);
  const refColor  = textColorFor(bgRef, s.refColor) === '#000000' && !hexToRgb(s.refColor) ? '#8a6d1f' : (s.refColor || '#c8a84b');
  const shadow = s.shadow ? '0 2px 12px rgba(0,0,0,.85)' : 'none';
  const align = s.align || 'center';
  const fontWeight = s.bold ? '700' : '400';
  const fontStyle = s.italic ? 'italic' : 'normal';
  // Контур тексту через накладені text-shadow в 4 (і по діагоналях) напрямках —
  // працює в будь-якому Chromium без -webkit-text-stroke, який часом зʼїдає засічки шрифту.
  const outlineShadow = s.outline
    ? [1,-1].flatMap(x => [1,-1].map(y => `${x}px ${y}px 0 ${s.outlineColor || '#000'}`)).join(',') +
      (s.shadow ? ', 0 2px 12px rgba(0,0,0,.6)' : '')
    : shadow;
  const decorHTML = decorSym
    ? `<div class="decor" style="top:6%;left:6%">${decorSym}</div><div class="decor" style="bottom:6%;right:6%">${decorSym}</div>`
    : '';

  // Для трансляції фон може бути напівпрозорим — щоб під текстом було видно камеру.
  // Керується повзунком у вкладці «Біблія».
  const bgFinal = (typeof bgAlpha === 'number')
    ? (bgAlpha >= 1 ? bgCss : 'rgba(0,0,0,' + bgAlpha + ')')
    : bgCss;

  // Шаблони макета: та сама сцена (фон, кольори, шрифт) — різна композиція
  // блоків тексту. «verse» — поведінка за замовчуванням (посилання + текст),
  // решта додають заголовок, оформлення цитати або список пунктів.
  const template = s.template || 'verse';
  const titleHTML = template === 'title' && s.extraTitle
    ? `<div class="extraTitle">${esc(s.extraTitle)}</div>` : '';
  let bodyContentHTML;
  if (template === 'quote') {
    bodyContentHTML = `
      <div class="text quoteText">${String(text || '').replace(/\n/g, '<br>')}</div>
      ${ref ? `<div class="ref quoteRef">— ${esc(ref)}</div>` : ''}`;
  } else if (template === 'list') {
    const items = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => `<li>${l}</li>`).join('');
    bodyContentHTML = `
      ${ref ? `<div class="ref">${esc(ref)}</div>` : ''}
      <ul class="list">${items}</ul>`;
  } else {
    // 'verse' (за замовчуванням) і 'title' мають однакову структуру вірш+посилання,
    // «title» лише додає заголовок над нею
    bodyContentHTML = `
      ${titleHTML}
      ${ref ? `<div class="ref">${esc(ref)}</div>` : ''}
      ${s.decor === 'line' ? '<div class="line"></div>' : ''}
      <div class="text">${String(text || '').replace(/\n/g, '<br>')}</div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{margin:0;background:${bgFinal};min-height:100vh;display:flex;align-items:center;justify-content:center;
         font-family:${s.fontFamily};position:relative;overflow:hidden}
    .bgimg{position:fixed;inset:0;background-size:cover;background-position:center;z-index:0;${(typeof bgAlpha === 'number' && bgAlpha < 1) ? 'display:none;' : ''}}
    .bgvid{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;${(typeof bgAlpha === 'number' && bgAlpha < 1) ? 'display:none;' : ''}}
    .dim{position:fixed;inset:0;background:rgba(0,0,0,${s.bgDim});z-index:1}
    .decor{position:absolute;color:${refColor};opacity:.08;pointer-events:none;font-size:${Math.round(s.size * 1.8)}px;z-index:1}
    .wrap{text-align:${align};padding:4vh 5vw;max-width:88%;z-index:2}
    .extraTitle{color:${refColor};font-size:${Math.round(s.refSize * 1.15)}px;font-weight:700;letter-spacing:1px;margin-bottom:14px;text-shadow:${shadow}}
    .ref{color:${refColor};font-size:${s.refSize}px;margin-bottom:12px;text-shadow:${shadow}}
    .line{width:${Math.round(s.size * 1.2)}px;height:3px;background:${refColor};margin-top:12px;margin-bottom:12px;
          margin-left:${align === 'right' ? 'auto' : '0'};margin-right:${align === 'left' ? 'auto' : '0'};
          ${align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}}
    .text{color:${textColor};font-size:${s.size}px;line-height:1.35;font-weight:${fontWeight};font-style:${fontStyle};text-shadow:${outlineShadow}}
    .quoteText{position:relative;font-style:italic}
    .quoteText::before{content:'“'}
    .quoteText::after{content:'”'}
    .quoteRef{margin-top:16px;margin-bottom:0;font-size:${Math.round(s.refSize * 0.85)}px;opacity:.85}
    .list{list-style:none;padding:0;margin:0;text-align:${align === 'center' ? 'left' : align};display:inline-block}
    .list li{color:${textColor};font-size:${Math.round(s.size * 0.72)}px;line-height:1.5;font-weight:${fontWeight};font-style:${fontStyle};
             text-shadow:${outlineShadow};margin-bottom:${Math.round(s.size * 0.28)}px;padding-left:1.3em;position:relative}
    .list li::before{content:'•';position:absolute;left:0;color:${refColor}}
  </style></head><body>${bgImageLayer}${bgVideoLayer}${decorHTML}<div class="wrap">${bodyContentHTML}</div>${AUTOFIT_SCRIPT}</body></html>`;
}

function getH2RHTML(exiting) {
const s = H2R_STYLES[state.h2rConfig.style] || H2R_STYLES.classic;
const accent = state.h2rConfig.accent;
let bg = s.bg || 'rgba(10,10,26,0.92)';
if(bg.includes('var(--accent)')) bg = bg.replace(/var(--accent)/g, accent);
let border = s.border || 'none';
if(border.includes('var(--accent)')) border = border.replace(/var(--accent)/g, accent);
// Кожен вхід має ПАРНИЙ вихід (той самий рух, у зворотному напрямку) —
// раніше зникнення завжди було миттєвим, незалежно від того, як титри
// з'явились, що виглядало різко порівняно з плавним входом.
const animsIn = {slideLeft:'h2rSlideLeftIn', slideRight:'h2rSlideRightIn', slideUp:'h2rSlideUpIn', fade:'h2rFadeIn', pop:'h2rPopIn', none:'none'};
const animsOut = {slideLeft:'h2rSlideLeftOut', slideRight:'h2rSlideRightOut', slideUp:'h2rSlideUpOut', fade:'h2rFadeOut', pop:'h2rFadeOut', none:'none'};
const animName = state.h2rConfig.animation || 'fade';
const anim = (exiting ? animsOut : animsIn)[animName] || (exiting ? 'h2rFadeOut' : 'h2rFadeIn');
const dur = exiting ? 0.4 : Math.min(state.h2rConfig.duration, 5);
const fillMode = exiting ? 'forwards' : 'both';
const sc = state.h2rConfig.scale || 1;   // масштаб розміру титрів (повзунок)

return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{margin:0;background:transparent;width:100vw;height:100vh;overflow:hidden;font-family:${s.fontFamily};display:flex;align-items:flex-end;justify-content:flex-start}.wrap{background:${bg};border:${border};border-radius:${s.borderRadius};padding:${Math.round(14*sc)}px ${Math.round(20*sc)}px;margin:0 0 20px 20px;max-width:90%;animation:${anim} ${dur}s ease ${fillMode};}.line1{color:${state.h2rConfig.textColor};font-size:${Math.round(18*sc)}px;font-weight:700}.line2{color:${accent};font-size:${Math.round(12*sc)}px;margin-top:${Math.round(2*sc)}px}.line3{color:rgba(255,255,255,0.3);font-size:${Math.round(12*sc)}px;margin-top:${Math.round(2*sc)}px}.decor{position:absolute;bottom:-4px;left:0;right:0;height:${Math.max(3,Math.round(3*sc))}px;background:${accent};border-radius:0 0 4px 4px}
@keyframes h2rSlideLeftIn{from{transform:translateX(-60px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes h2rSlideLeftOut{from{transform:translateX(0);opacity:1}to{transform:translateX(-60px);opacity:0}}
@keyframes h2rSlideRightIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes h2rSlideRightOut{from{transform:translateX(0);opacity:1}to{transform:translateX(60px);opacity:0}}
@keyframes h2rSlideUpIn{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes h2rSlideUpOut{from{transform:translateY(0);opacity:1}to{transform:translateY(40px);opacity:0}}
@keyframes h2rFadeIn{from{opacity:0}to{opacity:1}}
@keyframes h2rFadeOut{from{opacity:1}to{opacity:0}}
@keyframes h2rPopIn{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:1}}
</style></head><body><div class="wrap">${state.h2rConfig.line1 ? '<div class="line1">'+esc(state.h2rConfig.line1)+'</div>' : ''}${state.h2rConfig.line2 ? '<div class="line2">'+esc(state.h2rConfig.line2)+'</div>' : ''}${state.h2rConfig.line3 ? '<div class="line3">'+esc(state.h2rConfig.line3)+'</div>' : ''}<div class="decor"></div></div></body></html>`;
}


function getTimerHTML() {
const l1 = $('#timerLine1')?.value || 'ДО ПОЧАТКУ';
const l2 = $('#timerLine2')?.value || 'СЛУЖІННЯ';
const theme = $('#timerTheme')?.value || 'blue';
const rem = state.timerState.remaining;
const setSec = state.timerState.setSeconds;
const tc = {blue:{accent:'#4a8fc8',light:'#70b8f0'}, purple:{accent:'#8a4ac8',light:'#b870f0'}, green:{accent:'#4ac87a',light:'#70f0a8'}, gold:{accent:'#c8a84b',light:'#f0d070'}}[theme] || {accent:'#4a8fc8',light:'#70b8f0'};

return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:linear-gradient(135deg,#0a0a1a,#1a1a3e);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Georgia,serif}.wrap{text-align:center;padding:14px}.line1{color:#fff;font-size:32px;font-weight:700;letter-spacing:2px}.line2{color:${tc.light};font-size:32px;font-weight:700}.timer-wrap{margin:8px auto;background:rgba(0,0,0,0.3);border:2px solid ${tc.accent};border-radius:6px;padding:4px 16px;display:inline-block}.timer-label{color:rgba(255,255,255,0.3);font-size:12px;letter-spacing:2px}.timer{font-size:40px;color:${tc.light};font-family:monospace;font-weight:700}.timer.urgent{color:#f07070}.progress-wrap{width:120px;height:2px;background:rgba(255,255,255,0.08);border-radius:1px;margin:3px auto 0;overflow:hidden}.progress{height:100%;background:${tc.accent};border-radius:1px;transition:width .5s}</style></head><body><div class="wrap">${l1 ? '<div class="line1">'+l1+'</div>' : ''}${l2 ? '<div class="line2">'+l2+'</div>' : ''}<div class="timer-wrap"><div class="timer-label">ЗАЛИШИЛОСЬ</div><div class="timer" id="t">${timerFmt(rem)}</div><div class="progress-wrap"><div class="progress" style="width:${setSec > 0 ? rem/setSec*100 : 100}%"></div></div></div></div><script>var rem=${rem},tot=${setSec};function fmt(s){s=Math.max(0,s);var m=Math.floor(s/60),sc=s%60;return(m<10?"0":"")+m+":"+(sc<10?"0":"")+sc;}setInterval(function(){if(rem>0)rem--;var el=document.getElementById("t");if(el){el.textContent=fmt(rem);el.className="timer"+(rem<=30&&rem>0?" urgent":"");}var p=document.querySelector(".progress");if(p){p.style.width=Math.max(0,rem/tot*100)+"%";}},1000);</script></body></html>`;
}



function loadHotkeys() {
try { const d = loadJSON(STORAGE_KEYS.hotkeys); if(d) state.hotkeys = d; } catch(e) {}
if(!state.hotkeys || !Object.keys(state.hotkeys).length) {
state.hotkeys = {'next-verse':'Space','prev-verse':'ArrowLeft','send':'Enter','clear':'Escape'};
}
// Відкрити/закрити виходи 1-5 (проектор/трансляція/вихід3/вихід4/обидва)
// раніше були захардкоджені на F1-F5 (index.html), не через це меню —
// тепер перенесено сюди, щоб можна було переприв'язати (на macOS ці
// клавіші за замовчуванням займає система). Добавляємо як дефолт лише
// тим, у кого їх ще нема в збереженому профілі — не чіпаємо, якщо
// оператор уже сам щось призначив.
const outputToggleDefaults = {'toggle-projector':'F1','toggle-stream':'F2','toggle-out3':'F3','toggle-out4':'F4','toggle-both':'F5'};
Object.keys(outputToggleDefaults).forEach(a => {
  if (state.hotkeys[a] === undefined) state.hotkeys[a] = outputToggleDefaults[a];
});
renderHotkeys();
}

// ============================================================
// MIDI-ТРИГЕРИ (Web MIDI API — вже є в Chromium/Electron,
// нічого не треба ставити чи компілювати нативно)
// ============================================================
// ============================================================
// OSC-ТРИГЕРИ (UDP, слухаємо адреси на порту 9000,
// прив'язуємо до дій, як MIDI)
// ============================================================
function loadOscMap() {
  if (window.electronAPI && window.electronAPI.oscGetMap) {
    window.electronAPI.oscGetMap().then(map => {
      state.oscMap = map || {};
      if (isActive('hotkeys')) markDirty('hotkeys');
    });
  }
}
function startOscServer() {
  if (!window.electronAPI) return;
  window.electronAPI.startOscServer().then(() => {
    state.oscRunning = true;
    if (isActive('hotkeys')) markDirty('hotkeys');
    notify('🎚️ OSC-сервер запущено на порту 9000');
  }).catch(() => notify('⚠️ Не вдалося запустити OSC-сервер'));
}
function stopOscServer() {
  if (!window.electronAPI) return;
  window.electronAPI.stopOscServer().then(() => {
    state.oscRunning = false;
    if (isActive('hotkeys')) markDirty('hotkeys');
    notify('🎚️ OSC-сервер зупинено');
  });
}
function oscStartLearn(action) {
  if (!window.electronAPI) return;
  state.oscLearn = action;
  window.electronAPI.oscLearn(action);
  markDirty('hotkeys');
  notify('🎚️ Чекаю OSC-адреси для «' + action + '» — надішли повідомлення з контролера…');
}
function oscClear(action) {
  if (!window.electronAPI) return;
  window.electronAPI.oscClear(action).then(() => {
    delete state.oscMap[action];
    markDirty('hotkeys');
  });
}

// Слухач вхідних OSC-дій від main-процесу
if (window.electronAPI && window.electronAPI.onOscAction) {
  window.electronAPI.onOscAction((data) => {
    if (data && data.action && typeof applyStationCommand === 'function') {
      applyStationCommand({ action: data.action, from: data.from });
    }
  });
}
// Слухач успішного навчання адреси
if (window.electronAPI && window.electronAPI.onOscLearned) {
  window.electronAPI.onOscLearned((data) => {
    state.oscLearn = null;
    state.oscMap[data.action] = data.address;
    markDirty('hotkeys');
    notify('🎚️ Прив\'язано: ' + data.address + ' → ' + data.action);
  });
}

// ============================================================
// ЖИВІ СУБТИТРИ (Web Speech API — розпізнування мови
// з комп'ютерного мікрофона в реальному часі, офлайн)
// + автопропозиція вірша + індикатор рівня звуку — усе живе в окремій
// вкладці «🎤 Субтитри» (renderCaptionsTab, extras-3.js), не в «Шари».
// ============================================================
// ---- Автопропозиція вірша під час проповіді (локально, без AI/інтернету) ----
// Той самий fuzzy-пошук, що й у вкладці «Біблія» (fuzzySearchIndexed), просто
// запускається автоматично на щойно розпізнаний фрагмент мови. НІКОЛИ не
// надсилає в зал сама — лише пропонує, оператор підтверджує кліком. Свідомо
// без AI/API — щоб працювало офлайн і безкоштовно (користувач це підтвердив).
function detectVerseInSpeech(chunk) {
  const text = String(chunk || '').trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  // Занадто короткий фрагмент — забагато випадкових збігів, не варто пропонувати
  if (text.length < 15 || wordCount < 4) return;
  if (typeof fuzzySearchIndexed !== 'function' || typeof currentTranslationId === 'undefined' || !currentTranslationId) return;
  let results;
  try { results = fuzzySearchIndexed(text, currentTranslationId, 3); } catch (e) { return; }
  if (!results || !results.length) return;
  const top = results[0];
  // Два різних масштаби score в fuzzySearchIndexed: якщо весь запит знайшовся
  // ЯК ЄДИНИЙ підрядок у вірші — score = 1000-позиція (майже завжди ≥900,
  // дослівна цитата). Якщо ні — це сума за окремими влучними словами
  // (~2-3 бали за слово), перевірено ізольованим тестом на реальній фразі
  // (score ≈13.7 для 5-6 влучних слів) — тож поріг тут має рахуватись від
  // кількості слів, а не бути фіксованим числом.
  const isSubstringMatch = top.score >= 900;
  const wordScoreOk = top.score >= wordCount * 2.2;
  if (!isSubstringMatch && !wordScoreOk) return;
  const parts = top.key.split('.');
  const ref = (typeof getBookName === 'function' ? getBookName(parts[0]) : parts[0]) + ' ' + parts[1] + ':' + parts[2];
  // Та сама пропозиція, що вже висить — не смикаємо інтерфейс повторно
  if (state.captions.suggestion && state.captions.suggestion.key === top.key) return;
  state.captions.suggestion = { key: top.key, ref: ref, text: top.text };
  markDirty('captions');
  notify('🔍 Схоже на цитату: ' + ref);
}

// ---- Індикатор рівня звуку з ВИБРАНОГО пристрою (напр. SQ-6 по USB) ----
// Той самий підхід, що вже є для мультивью ATEM (atem-ui.js): getUserMedia
// з явним deviceId — стандартний веб-API, без нативних модулів. НЕ підключено
// до самого розпізнавання мови (Web Speech API технічно не приймає довільний
// потік — завжди слухає системний мікрофон за замовчуванням, окреме питання).
// Це лише щоб на око бачити: кабель/захоплення від пульта дійсно працює.
let _audioMeterStream = null;
let _audioMeterCtx = null;
let _audioMeterRAF = null;
// ============================================================
// ХМАРНА СИНХРОНІЗАЦІЯ БІБЛІОТЕКИ (папка Dropbox/Google Drive/OneDrive)
// ============================================================
function getCloudSyncFolder() {
  if (!window.electronAPI) return Promise.resolve(null);
  return window.electronAPI.getCloudSyncFolder().then(folder => {
    state.cloudSync.folder = folder;
    return folder;
  });
}
function movePlaylistItem(i, dir) {
const ni = i + dir;
if(i < 0 || i >= state.playlist.length) return;
if(ni < 0 || ni >= state.playlist.length) return;
const t = state.playlist[i];
state.playlist[i] = state.playlist[ni];
state.playlist[ni] = t;
savePlaylistData();
renderPlaylist();
}

// ---- Готові стилі-пресети графіки Біблії (фон/колір/декор одним кліком) -----
const BIBLE_GFX_PRESETS = {
  classic: { label: '📜 Класика',      s: { layout: 'full', bgType: 'gradient', bgGradient: 'linear-gradient(135deg,#0a0a1a,#1a1a3e)', bgColor: '#0a0a1a', textColor: '#ffffff', refColor: '#c8a84b', decor: 'line', shadow: true, outline: false, bold: false, align: 'center' } },
  minimal: { label: '⬛ Мінімал',       s: { layout: 'full', bgType: 'color', bgColor: '#000000', textColor: '#ffffff', refColor: '#9aa0b5', decor: 'none', shadow: true, outline: false, bold: false, align: 'center' } },
  royal:   { label: '✝ Урочистий',     s: { layout: 'full', bgType: 'gradient', bgGradient: 'linear-gradient(135deg,#1a1035,#3a1a5e)', bgColor: '#1a1035', textColor: '#ffffff', refColor: '#e8c86a', decor: 'cross', shadow: true, outline: true, outlineColor: '#000000', bold: true, align: 'center' } },
  dawn:    { label: '🌅 Світанок',      s: { layout: 'full', bgType: 'gradient', bgGradient: 'linear-gradient(135deg,#20160a,#4a2f14)', bgColor: '#20160a', textColor: '#fff6e6', refColor: '#ffd27f', decor: 'ornament', shadow: true, outline: false, bold: false, align: 'center' } },
  ocean:   { label: '🌊 Глибина',       s: { layout: 'full', bgType: 'gradient', bgGradient: 'linear-gradient(135deg,#04121f,#0a2f4a)', bgColor: '#04121f', textColor: '#eaf6ff', refColor: '#7fd0ff', decor: 'line', shadow: true, outline: false, bold: false, align: 'center' } },
  lower:   { label: '📺 Нижня третина', s: { layout: 'lower' } }
};
function applyBibleGfxPreset(key) {
  const p = BIBLE_GFX_PRESETS[key]; if (!p) return;
  Object.assign(state.graphicsSettings, p.s);
  persistGraphicsSettings();
  markDirty('graphics');
  if (typeof redrawGraphicsFrame === 'function') redrawGraphicsFrame();
  notify('🎨 Стиль Біблії: ' + p.label);
}
function renderBibleGfxPresets() {
  const btns = Object.keys(BIBLE_GFX_PRESETS)
    .map(k => `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="applyBibleGfxPreset('${k}')">${BIBLE_GFX_PRESETS[k].label}</button>`)
    .join(' ');
  return `<div class="card" style="border-color:var(--accent)">
    <div class="card-title">🎨 Готові стилі (Біблія)</div>
    <div class="card-sub">Клік — застосовує фон, колір, декор і розмір. Далі можна докрутити нижче.</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${btns}</div>
  </div>`;
}

function renderGraphicsTab() {
  const s = state.graphicsSettings;
  const decorOpts = [['line','Лінія'],['cross','Хрест ✝'],['ornament','Орнамент ✦'],['none','Без декору']]
    .map(([v,l]) => `<option value="${v}"${s.decor===v?' selected':''}>${l}</option>`).join('');
  const bgOpts = [['color','Суцільний колір'],['gradient','Градієнт'],['image','Зображення'],['video','Відео']]
    .map(([v,l]) => `<option value="${v}"${s.bgType===v?' selected':''}>${l}</option>`).join('');
  const grads = [
    ['linear-gradient(135deg,#0a0a1a,#1a1a3e)','Ніч'],
    ['linear-gradient(135deg,#1a0f2e,#4a2c6e)','Фіалка'],
    ['linear-gradient(135deg,#0b2545,#134074)','Море'],
    ['linear-gradient(135deg,#2d1b0e,#5c3a1e)','Тепло'],
    ['linear-gradient(180deg,#000000,#1a1a1a)','Графіт']
  ].map(([g,l]) => `<button class="preset-btn" onclick="setGraphicsGradient('${g}')" style="background:${g};color:#fff">${l}</button>`).join(' ');

  const lower = s.layout === 'lower';
  return `<div class="grid2">
    <div>
      ${renderBibleGfxPresets()}
      <div class="card" style="border-color:var(--accent)">
        <div class="card-title">📐 Макет</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn ${!lower ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setGraphicsLayout('full')">🖼 Слайд на весь екран</button>
          <button class="btn ${lower ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setGraphicsLayout('lower')">🎬 Титр для трансляції</button>
        </div>
        <div class="card-sub" style="margin-top:4px">
          ${lower
            ? 'Вірш смугою <b>внизу</b>, камера видно навколо. Саме це йде в OBS поверх живого відео.'
            : 'Вірш на весь екран із фоном — для проектора в залі.'}
        </div>
        ${lower ? `<div style="margin-top:6px">
          <div style="font-size:12px;color:var(--text2)">Фон сцени (те, що OBS вирізає)</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px">
            <button class="btn ${(s.lowerChroma||'transparent')==='transparent'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('transparent')">Прозорий</button>
            <button class="btn ${s.lowerChroma==='#00ff00'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('#00ff00')">🟩 Зелений</button>
            <button class="btn ${s.lowerChroma==='#ff00ff'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('#ff00ff')">🟪 Маджента</button>
          </div>
          <div class="card-sub">Прозорий — якщо OBS захоплює вікно з альфа-каналом. Не спрацювало — став зелений і додай фільтр «Chroma Key».</div>
        </div>` : ''}
      </div>

      <div class="card">
        <div class="card-title">🧩 Шаблон макета</div>
        <div class="card-sub">Композиція блоків тексту — не лише «вірш + посилання».</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px">
          <button class="btn ${(s.template||'verse')==='verse'?'btn-primary':'btn-ghost'} btn-sm" onclick="setGraphicsTemplate('verse')">📖 Вірш + посилання</button>
          <button class="btn ${s.template==='title'?'btn-primary':'btn-ghost'} btn-sm" onclick="setGraphicsTemplate('title')">🏷 Заголовок + текст</button>
          <button class="btn ${s.template==='quote'?'btn-primary':'btn-ghost'} btn-sm" onclick="setGraphicsTemplate('quote')">❝ Цитата</button>
          <button class="btn ${s.template==='list'?'btn-primary':'btn-ghost'} btn-sm" onclick="setGraphicsTemplate('list')">☰ Список пунктів</button>
        </div>
        ${s.template === 'title' ? `
        <div style="font-size:12px;color:var(--text2);margin-top:8px">Заголовок (напр. тема проповіді)</div>
        <input type="text" id="graphicsExtraTitle" value="${esc(s.extraTitle || '')}" oninput="setGraphicsExtraTitle(this.value)"
               placeholder="Про що сьогодні служіння" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">
        ` : ''}
        ${s.template === 'list' ? '<div class="card-sub" style="margin-top:6px">Кожен рядок тексту — окремий пункт списку.</div>' : ''}
      </div>

      <div class="card">
        <div class="card-title">🎨 Оформлення тексту</div>

        <div style="font-size:12px;color:var(--text2);margin-top:6px">Розмір тексту: <b id="graphicsSizeLabel">${s.size}px</b></div>
        <input type="range" id="graphicsSize" min="24" max="140" value="${s.size}" oninput="updateGraphicsPreview()" style="width:100%">

        <div style="font-size:12px;color:var(--text2)">Розмір посилання: <b id="graphicsRefSizeLabel">${s.refSize}px</b></div>
        <input type="range" id="graphicsRefSize" min="14" max="80" value="${s.refSize}" oninput="updateGraphicsPreview()" style="width:100%">

        <div style="font-size:12px;color:var(--text2);margin-top:8px">Прозорість фону для трансляції: <b id="gfxStreamOpacityLabel">${s.streamOpacity != null ? s.streamOpacity : 62}%</b></div>
        <input type="range" id="graphicsStreamOpacity" min="0" max="100" value="${s.streamOpacity != null ? s.streamOpacity : 62}" style="width:100%"
               oninput="document.getElementById('gfxStreamOpacityLabel').textContent=this.value+'%'"
               onchange="setStreamOpacity(this.value)">
        <div class="card-sub" style="margin-top:2px">Менше — більше видно камеру під текстом (діє на виходах із хромакеєм, напр. трансляція).</div>

        <div style="font-size:12px;color:var(--text2);margin-top:8px">Вирівнювання</div>
        <div style="display:flex;gap:4px">
          <button class="btn ${(s.align||'center')==='left'?'btn-primary':'btn-ghost'} btn-sm" style="flex:1" onclick="setGraphicsAlign('left')">⬅ Ліворуч</button>
          <button class="btn ${(s.align||'center')==='center'?'btn-primary':'btn-ghost'} btn-sm" style="flex:1" onclick="setGraphicsAlign('center')">⬌ По центру</button>
          <button class="btn ${s.align==='right'?'btn-primary':'btn-ghost'} btn-sm" style="flex:1" onclick="setGraphicsAlign('right')">➡ Праворуч</button>
        </div>

        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn ${s.bold?'btn-primary':'btn-ghost'} btn-sm" style="flex:1;font-weight:700" onclick="setGraphicsStyleFlag('bold', ${!s.bold})">Ж Жирний</button>
          <button class="btn ${s.italic?'btn-primary':'btn-ghost'} btn-sm" style="flex:1;font-style:italic" onclick="setGraphicsStyleFlag('italic', ${!s.italic})">К Курсив</button>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;margin-top:8px">
          <input type="checkbox" ${s.outline ? 'checked' : ''} onchange="setGraphicsStyleFlag('outline', this.checked)">
          Обведення тексту (замість тіні) —
          <input type="color" value="${s.outlineColor || '#000000'}" oninput="setGraphicsOutlineColor(this.value)" style="width:26px;height:18px;border:none;background:none;padding:0" ${s.outline ? '' : 'disabled'}>
        </label>

        <div style="font-size:12px;color:var(--text2);margin-top:6px">Шрифт</div>
        <select id="graphicsFont" onchange="updateGraphicsPreview()" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">
          ${fontOptionsHTML(s.fontFamily)}
        </select>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px">
          <div><div style="font-size:12px;color:var(--text2)">Текст</div>
            <input type="color" id="graphicsTextColor" value="${s.textColor}" oninput="updateGraphicsPreview()" style="width:100%;height:26px;border:none;background:none"></div>
          <div><div style="font-size:12px;color:var(--text2)">Посилання</div>
            <input type="color" id="graphicsRefColor" value="${s.refColor}" oninput="updateGraphicsPreview()" style="width:100%;height:26px;border:none;background:none"></div>
          <div><div style="font-size:12px;color:var(--text2)">Фон</div>
            <input type="color" id="graphicsBgColor" value="${s.bgColor}" oninput="updateGraphicsPreview()" style="width:100%;height:26px;border:none;background:none"></div>
        </div>

        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;margin-top:8px">
          <input type="checkbox" ${state.autoContrast !== false ? 'checked' : ''} onchange="setAutoContrast(this.checked)">
          Авто-контраст (чорний текст на світлому фоні)
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;margin-top:4px">
          <input type="checkbox" ${state.autoFit !== false ? 'checked' : ''} onchange="setAutoFit(this.checked)">
          Авто-вміщення (зменшувати шрифт, якщо текст не влазить)
        </label>

        <div style="font-size:12px;color:var(--text2);margin-top:8px">Декор</div>
        <select id="graphicsDecor" onchange="updateGraphicsPreview()" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">${decorOpts}</select>
      </div>

      <div class="card">
        <div class="card-title">🖼 Фон</div>
        <select id="graphicsBgType" onchange="updateGraphicsPreview()" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">${bgOpts}</select>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${grads}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">Своє зображення</div>
        <input type="file" id="graphicsBgInput" accept="image/*,.gif,.svg,.webp,.avif" onchange="loadGraphicsBgImage(this)" style="font-size:12px;width:100%">
        <div style="font-size:12px;color:var(--text2);margin-top:6px">Затемнення фото: <b id="graphicsDimLabel">${Math.round(s.bgDim*100)}%</b></div>
        <input type="range" id="graphicsDim" min="0" max="90" value="${Math.round(s.bgDim*100)}" oninput="updateGraphicsPreview()" style="width:100%">

        <div style="font-size:12px;color:var(--text2);margin-top:10px">Циклічне відео (для повноекранного макета)</div>
        <input type="file" id="graphicsBgVideoInput" accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.wmv,.flv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.m2v,.vob,.divx,.asf,.mxf,.ogv" onchange="loadGraphicsBgVideo(this)" style="font-size:12px;width:100%">
        ${s.bgVideo && s.bgVideo.src ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <span style="font-size:11px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🎬 ${esc(s.bgVideo.name || '')}</span>
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="clearGraphicsBgVideo()">✕ Прибрати</button>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:6px">Затемнення відео: <b id="graphicsVideoDimLabel">${Math.round((s.bgVideoDim != null ? s.bgVideoDim : 0.35)*100)}%</b></div>
        <input type="range" id="graphicsVideoDim" min="0" max="90" value="${Math.round((s.bgVideoDim != null ? s.bgVideoDim : 0.35)*100)}" oninput="updateGraphicsPreview()" style="width:100%">
        <div style="font-size:12px;color:var(--text2);margin-top:6px">Швидкість: <b id="graphicsVideoSpeedLabel">${(s.bgVideo.speed || 1).toFixed(2)}×</b></div>
        <input type="range" id="graphicsVideoSpeed" min="25" max="200" value="${Math.round((s.bgVideo.speed || 1)*100)}"
               oninput="document.getElementById('graphicsVideoSpeedLabel').textContent=(this.value/100).toFixed(2)+'×'"
               onchange="setGraphicsVideoSpeed(this.value/100)" style="width:100%">
        ` : '<div class="card-sub" style="margin-top:4px">Без звуку, циклічно — так само, як фон-відео для звичайного тексту.</div>'}

        <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="graphicsFromTheme()">⤵ Взяти стиль із Теми проектора</button>
      </div>
    </div>

    <div>
      <!-- ПІДНЯТО НА ВЕРХ правої колонки: це найчастіші дії під час служби
           (вивести вірш, перемкнути переклади), тож вони мають бути
           одразу на очах, без прокрутки повз прев'ю й пресети.
           Кілька перекладів + вивід просто тут, щоб не бігати у вкладку
           Біблія під час служби. Це ТА САМА картка (renderMultiTransCard),
           що й там — контейнер інший, дані спільні, тож налаштування не
           можуть розійтись між двома місцями. -->
      <div id="multiTransBoxGfx" style="margin-top:10px"></div>

      <div class="card">
        <div class="card-title">📖 Вивести вірш з цим оформленням</div>
        <div class="card-sub">Ті самі кнопки, що у вкладці Біблія — вірш береться звідти ж. «2 виводи» — це Проектор + Трансляція.</div>
        <div class="flex mt8" style="gap:5px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="sendBibleWithGraphics(1)">▶ Проектор</button>
          <button class="btn btn-ghost btn-sm" onclick="sendBibleWithGraphics(2)">▶ Трансляція</button>
          <button class="btn btn-primary btn-sm" onclick="sendBibleGraphicsMulti([1,2])">2 виводи (Проектор + Трансляція)</button>
          <button class="btn btn-ghost btn-sm" onclick="sendBibleGraphicsMulti([1,2,3,4])">Усі 4</button>
        </div>
        <div class="flex mt8" style="gap:5px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="prevBibleVerse()">◀ Вірш</button>
          <button class="btn btn-ghost btn-sm" onclick="nextBibleVerse()">Вірш ▶</button>
        </div>

      <div class="card">
        <div class="card-title">👁 Як це виглядатиме на екрані</div>
        <div style="position:relative;width:100%;aspect-ratio:16/9;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#000">
          <iframe id="graphicsPreviewFrame" style="position:absolute;top:0;left:0;width:1920px;height:1080px;border:0;transform:scale(0.28);transform-origin:top left;pointer-events:none"></iframe>
        </div>
        <div class="card-sub" style="margin-top:6px">Прев'ю показує точно той HTML, що піде на екран — у справжньому масштабі 1920×1080.</div>
      </div>
      </div>

      <div class="card">
        <div class="card-title">▶ Вивід</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="sendGraphicsToAll()">На всі екрани</button>
        </div>
        <div id="graphicsOutBtns" style="margin-top:6px"></div>
        <div class="card-sub" style="margin-top:6px">Береться поточний куплет або вірш — той самий, що на екрані.</div>
        <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="saveGraphicsPreset()">💾 Зберегти як пресет</button>
      </div>

      <div class="card">
        <div class="card-title">📚 Збережені пресети</div>
        <div class="card-sub">Швидко перемикай готові стилі — наприклад, окремо для недільного ранку й молодіжного служіння.</div>
        <div style="margin-top:6px">${graphicsPresetsList()}</div>
      </div>
    </div>
  </div>`;
}



function setGraphicsTemplate(t) {
  state.graphicsSettings.template = t;
  persistGraphicsSettings();
  markDirty('graphics');
  redrawGraphicsFrame();
  notify('🧩 Шаблон: ' + ({verse:'Вірш + посилання', title:'Заголовок + текст', quote:'Цитата', list:'Список пунктів'}[t] || t));
}
function setGraphicsExtraTitle(v) {
  state.graphicsSettings.extraTitle = v;
  persistGraphicsSettings();
  redrawGraphicsFrame();
}

function setGraphicsAlign(a) {
  state.graphicsSettings.align = a;
  persistGraphicsSettings();
  markDirty('graphics');
  updateGraphicsPreview();
}
function setGraphicsStyleFlag(key, on) {
  state.graphicsSettings[key] = !!on;
  persistGraphicsSettings();
  markDirty('graphics');
  updateGraphicsPreview();
}
function setGraphicsOutlineColor(c) {
  state.graphicsSettings.outlineColor = c;
  persistGraphicsSettings();
  updateGraphicsPreview();
}

function setAutoFit(on) {
  state.autoFit = !!on;
  saveJSON(STORAGE_KEYS.live + '_autofit', { on: state.autoFit });
  if (window.electronAPI && window.electronAPI.setAutoFit) window.electronAPI.setAutoFit(state.autoFit);
  notify(on ? '✓ Авто-вміщення увімкнено' : 'Авто-вміщення вимкнено');
}
function loadAutoFit() {
  const c = loadJSON(STORAGE_KEYS.live + '_autofit');
  state.autoFit = c ? !!c.on : true;
  if (window.electronAPI && window.electronAPI.setAutoFit) window.electronAPI.setAutoFit(state.autoFit);
}

function setAutoContrast(on) {
  state.autoContrast = !!on;
  persistGraphicsSettings();
  updateGraphicsPreview();
  updateLivePanels();
  notify(on ? '✓ Авто-контраст увімкнено' : 'Авто-контраст вимкнено');
}


// Прозорість фону графіки, що йде на ТРАНСЛЯЦІЮ.
// Менше значення — більше видно камеру під текстом.
function setStreamOpacity(v) {
  // Лишено для сумісності — наявні повзунки на вкладках Біблія/Пісні/Графіка
  // й далі керують саме виходом 2 (трансляція) через цю функцію.
  setOutputOpacity(2, v);
  // streamOpacity (застаріле поле) теж оновлюємо — про всяк випадок, якщо
  // щось у коді досі читає його напряму замість outputOpacity[2].
  const n = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  state.graphicsSettings.streamOpacity = n;
}
function setOutputOpacity(n, v) {
  const val = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  state.graphicsSettings.outputOpacity = state.graphicsSettings.outputOpacity || {1:62,2:62,3:62,4:62};
  state.graphicsSettings.outputOpacity[n] = val;
  persistGraphicsSettings();
  // Той самий повзунок видно і в «Біблії», і в «Піснях» — тримаємо синхронними
  // (лише для виходу 2, бо саме там ці старі повзунки й показуються).
  if (n === 2) {
    ['streamOpacityLabel', 'songStreamOpacityLabel', 'gfxStreamOpacityLabel'].forEach(id => {
      const lbl = document.getElementById(id);
      if (lbl) lbl.textContent = val + '%';
    });
    ['streamOpacityRange', 'songStreamOpacityRange', 'graphicsStreamOpacity'].forEach(id => {
      const rng = document.getElementById(id);
      if (rng) rng.value = val;
    });
  }
  // Повзунок конкретного виходу у вкладці «Виходи» (якщо там зараз перебуваємо)
  const routerLbl = document.getElementById('pv2OpacityLbl' + n);
  if (routerLbl) routerLbl.textContent = val + '%';
  // якщо щось уже в ефірі — одразу перемальовуємо
  try {
    if (typeof lastLiveMulti !== 'undefined' && lastLiveMulti && typeof multiReplay === 'function') multiReplay();
    else if (typeof lastLiveGraphics !== 'undefined' && lastLiveGraphics && typeof bibleReplayGraphics === 'function') bibleReplayGraphics();
  } catch (e) {}
}
function streamBgAlpha() {
  // Лишено для сумісності з рештою коду, що ще може викликати без номера
  // виходу — трансляція історично мала номер 2.
  return outputBgAlpha(2);
}
function outputBgAlpha(n) {
  const o = state.graphicsSettings && state.graphicsSettings.outputOpacity;
  const v = (o && typeof o[n] === 'number') ? o[n]
    : (state.graphicsSettings && typeof state.graphicsSettings.streamOpacity === 'number') ? state.graphicsSettings.streamOpacity : 62;
  return Math.max(0, Math.min(100, v)) / 100;
}

function setGraphicsLayout(l) {
  state.graphicsSettings.layout = l;
  persistGraphicsSettings();
  markDirty('graphics');
  updateGraphicsPreview();
  notify(l === 'lower' ? '🎬 Титр для трансляції (камера видно)' : '🖼 Слайд на весь екран');
}
function setLowerChroma(c) {
  state.graphicsSettings.lowerChroma = c;
  persistGraphicsSettings();
  updateGraphicsPreview();
  notify(c === 'transparent' ? 'Фон прозорий (для OBS з альфа-каналом)' : 'Фон хромакею: ' + c);
}

function setGraphicsGradient(g) {
  state.graphicsSettings.bgGradient = g;
  state.graphicsSettings.bgType = 'gradient';
  const sel = $('#graphicsBgType');
  if (sel) sel.value = 'gradient';
  updateGraphicsPreview();
}

function renderH2RPreview() {
const s = H2R_STYLES[state.h2rConfig.style] || H2R_STYLES.classic;
const accent = state.h2rConfig.accent;
const box = $('#h2rPreviewBox');
const l1 = $('#h2rPreviewLine1');
const l2 = $('#h2rPreviewLine2');
const l3 = $('#h2rPreviewLine3');
const decor = $('#h2rPreviewDecor');

if(box) {
box.style.background = s.bg || state.h2rConfig.bgColor;
box.style.border = (s.border || 'none').replace(/var(--accent)/g, accent);
box.style.borderRadius = s.borderRadius || '4px';
}
if(l1) { l1.style.fontSize = '14px'; l1.style.color = state.h2rConfig.textColor; l1.textContent = state.h2rConfig.line1 || 'Текст 1'; }
if(l2) { l2.style.fontSize = '10px'; l2.style.color = accent; l2.textContent = state.h2rConfig.line2 || 'Текст 2'; }
if(l3) { l3.style.fontSize = '7px'; l3.style.color = 'rgba(255,255,255,0.3)'; l3.textContent = state.h2rConfig.line3 || ''; }
if(decor) decor.style.background = accent;
}

function renderH2RTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">📺 Lower Third</div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-bottom:2px"><input type="text" id="h2rLine1" placeholder="Текст 1" value="Олександр" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:12px;outline:none" oninput="updateH2RPreview()"><input type="text" id="h2rLine2" placeholder="Текст 2" value="Проповідник" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:12px;outline:none" oninput="updateH2RPreview()"><input type="text" id="h2rLine3" placeholder="Текст 3" value="Церква Прага" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:12px;outline:none" oninput="updateH2RPreview()"><select id="h2rStyle" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="updateH2RPreview()"><option value="classic">Класичний</option><option value="modern">Сучасний</option><option value="elegant">Елегантний</option><option value="neon">Неоновий</option></select></div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:2px"><input type="color" id="h2rAccent" value="#7c6af7" style="width:100%;height:22px;border:none;border-radius:2px;cursor:pointer;background:none" oninput="updateH2RPreview()"><input type="color" id="h2rTextColor" value="#ffffff" style="width:100%;height:22px;border:none;border-radius:2px;cursor:pointer;background:none" oninput="updateH2RPreview()"><select id="h2rAnimation" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="updateH2RPreview()"><option value="slideLeft">Slide ←</option><option value="slideRight">Slide →</option><option value="slideUp">Slide ↑</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="none">Немає</option></select></div> <div style="margin-bottom:2px"><span style="font-size:11px;color:var(--text2)">Розмір титрів: <b id="h2rScaleLabel">${Math.round((state.h2rConfig.scale||2)*100)}%</b></span><input type="range" id="h2rScale" min="100" max="400" value="${Math.round((state.h2rConfig.scale||2)*100)}" oninput="updateH2RPreview()" style="width:100%"></div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-success btn-sm" onclick="sendH2RLowerThird()">▶</button><button class="btn btn-primary btn-sm" onclick="saveH2RTemplate()">💾</button><button class="btn btn-ghost btn-sm" onclick="clearH2R()">✕ Прибрати</button></div> <div id="h2rLowerOutBtns" style="margin-bottom:2px"></div> <div class="flex"><span style="font-size:11px;color:var(--text2)">Пресети:</span><button class="btn btn-ghost btn-sm" onclick="applyH2RPreset('speaker')" style="font-size:11px;padding:4px 7px">🎤</button><button class="btn btn-ghost btn-sm" onclick="applyH2RPreset('worship')" style="font-size:11px;padding:4px 7px">🙏</button><button class="btn btn-ghost btn-sm" onclick="applyH2RPreset('bible')" style="font-size:11px;padding:4px 7px">📖</button></div> </div></div><div> <div class="card"><div class="card-title">👁 Прев\'ю H2R</div> <div id="h2rPreviewBox" style="aspect-ratio:16/9;background:#0a0a1a;border-radius:3px;border:1px solid var(--border);position:relative;overflow:hidden"> <div id="h2rPreviewContent" style="width:100%;height:100%;display:flex;align-items:center;padding:12px;color:#fff;font-family:Georgia,serif;font-size:12px;line-height:1.3;text-align:center;justify-content:center;flex-direction:column"> <div id="h2rPreviewLine1" style="font-size:16px;font-weight:700;margin-bottom:2px">Олександр</div> <div id="h2rPreviewLine2" style="font-size:12px;color:#c8a84b">Проповідник</div> <div id="h2rPreviewLine3" style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:2px">Церква Прага</div> <div id="h2rPreviewDecor" style="position:absolute;bottom:0;left:0;right:0;height:2px;background:#7c6af7;border-radius:0 0 3px 3px"></div></div></div></div> </div></div>
<div class="card" style="margin-top:8px"><div class="card-title">🎬 Прокрутка подяки (як у кінці фільму)</div>
<div class="card-sub">Кожен рядок — окремий пункт. Перший рядок виділяється кольором акценту (як заголовок). Порожній рядок — проміжок між групами.</div>
<textarea id="creditsLines" rows="5" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px;outline:none;font-family:inherit;margin-top:6px" oninput="state.creditsConfig.lines=this.value">${esc(state.creditsConfig.lines)}</textarea>
<div class="flex" style="margin-top:6px;gap:6px;align-items:center">
<span style="font-size:11px;color:var(--text2)">Тривалість:</span>
<input type="number" id="creditsDuration" min="5" max="300" value="${state.creditsConfig.durationSec}" style="width:56px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:3px;color:var(--text);font-size:12px" onchange="state.creditsConfig.durationSec=parseInt(this.value,10)||30">
<span style="font-size:11px;color:var(--text2)">сек</span>
<button class="btn btn-success btn-sm" onclick="sendCredits()">▶ Показати</button>
</div>
<div id="creditsOutBtns" style="margin-top:6px"></div>
</div>
<div class="card" style="margin-top:8px"><div class="card-title">🎉 Конфеті</div>
<div class="card-sub">Короткий святковий ефект (~6с) — для хрещення, ювілею, особливих моментів. Сам прибирається, нічого чекати не треба.</div>
<div class="flex" style="margin-top:6px;gap:3px">
<button class="btn btn-success btn-sm" onclick="sendConfetti()">▶ Запустити</button>
<div id="confettiOutBtns" style="margin-top:6px;width:100%"></div>
</div></div>
<div class="card" style="margin-top:8px"><div class="card-title">📰 Тікер (біжучий рядок)</div>
<div class="card-sub">Крутиться внизу екрана по колу, доки не зупиниш — для оголошень/цитат, що йдуть постійно, не перериваючи основний контент.</div>
<input id="tickerText" type="text" value="${esc(state.tickerConfig.text)}" placeholder="Текст тікера…" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:12px;outline:none;margin-top:6px" oninput="state.tickerConfig.text=this.value">
<div class="flex" style="margin-top:6px;gap:6px;align-items:center">
<span style="font-size:11px;color:var(--text2)">Швидкість:</span>
<input type="number" min="5" max="60" value="${state.tickerConfig.speedSec}" style="width:50px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:3px;color:var(--text);font-size:12px" onchange="state.tickerConfig.speedSec=parseInt(this.value,10)||18">
<span style="font-size:11px;color:var(--text2)">сек/коло</span>
<button class="btn btn-success btn-sm" onclick="sendTicker()">▶ Запустити</button>
<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="stopTicker()">⏹ Зупинити</button>
</div>
<div id="tickerOutBtns" style="margin-top:6px"></div>
</div>
  <div class="card">
    <div class="card-title">🎨 Готові H2R-шаблони</div>
    <div class="card-sub">Готові оверлеї — заповни поля й виведи. Раніше були в окремій вкладці «H2R Темплейти».</div>
    <div id="h2rTemplatesList2" style="margin-top:6px"></div>
    <div style="margin-top:6px">
      <div style="font-size:12px;color:var(--text2)">Прев'ю шаблону</div>
      <iframe id="h2rPreviewFrame2" style="width:100%;height:170px;border:1px solid var(--border);border-radius:6px;background:#000"></iframe>
    </div>
  </div>
  `;
}

function renderHotkeys() {
$$('.hotkey-input').forEach(inp => {
const a = inp.dataset.action;
if(a && state.hotkeys[a]) inp.value = state.hotkeys[a];
});
// Тримає підказку в send bar (index.html) синхронною зі справжніми
// прив'язками — цю ж функцію викликано і після завантаження (loadHotkeys),
// і після кожної зміни клавіші (captureHotkey/скидання).
if (typeof refreshHotkeyHint === 'function') refreshHotkeyHint();
}

function renderPPTPreview() {
if(!state.songs.length) {
const title = $('#pptPreviewTitle');
const author = $('#pptPreviewAuthor');
const verses = $('#pptPreviewVerses');
if(title) title.textContent = 'Немає';
if(author) author.textContent = '';
if(verses) verses.textContent = '';
return;
}
const s = state.songs[state.pptPreviewIndex] || state.songs[0];
const title = $('#pptPreviewTitle');
const author = $('#pptPreviewAuthor');
const verses = $('#pptPreviewVerses');
if(title) title.textContent = s.title || '';
if(author) author.textContent = s.author || '';
if(verses) verses.textContent = (s.verses && s.verses[0]) ? s.verses[0] : '';
const counter = $('#pptPreviewCounter');
if(counter) counter.textContent = (state.pptPreviewIndex + 1) + '/' + state.songs.length;
}


function loadStageMonitorBinding() {
  const fp = loadJSON(STORAGE_KEYS.stageMonitor);
  if (!fp || !window.electronAPI || !window.electronAPI.bindStageMonitorFingerprint) return;
  state.stageMonitorFingerprint = fp;
  window.electronAPI.bindStageMonitorFingerprint(fp).then(res => {
    if (res && res.id) { state.stageMonitorId = res.id; renderStageMonitorOptions(); }
  }).catch(() => {});
}

// Іконка для типу запису журналу — 'html' охоплює графіку/QR/медіа/таймер/
// H2R/оголошення (усе, що йде через doSendHTML), розрізняються лише назвою.
function renderTopBible(usageOverride) {
const c = $('#statTopBible');
if(!c) return;
const usage = usageOverride || state.statsData.bibleUsage || {};
const sorted = Object.keys(usage).sort((a,b) => usage[b] - usage[a]).slice(0,5);
if(!sorted.length) { c.innerHTML = '<p class="text-muted">Немає</p>'; return; }
let html = '';
sorted.forEach((k, i) => {
html += `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px"><span>${i+1}. ${esc(k)}</span><span style="color:var(--gold)">${usage[k]}</span></div>`;
});
c.innerHTML = html;
}

function renderTopSongs(usageOverride) {
const c = $('#statTopSongs');
if(!c) return;
const usage = usageOverride || state.statsData.songUsage || {};
const sorted = Object.keys(usage).sort((a,b) => usage[b] - usage[a]).slice(0,5);
if(!sorted.length) { c.innerHTML = '<p class="text-muted">Немає</p>'; return; }
let html = '';
sorted.forEach((k, i) => {
html += `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px"><span>${i+1}. ${esc(k)}</span><span style="color:var(--accent)">${usage[k]}</span></div>`;
});
c.innerHTML = html;
}

function saveGraphicsPreset() {
pv2Prompt('Назва пресету:', function(name){
if(!name) return;
const p = loadJSON(STORAGE_KEYS.graphicsPresets) || [];
p.push({name, date: new Date().toISOString().split('T')[0], settings: JSON.parse(JSON.stringify(state.graphicsSettings))});
saveJSON(STORAGE_KEYS.graphicsPresets, p);
markDirty('graphics');
notify('✓ Пресет «' + name + '» збережено');
});
}

// Список збережених пресетів — раніше їх можна було лише зберегти, але не
// побачити чи повернути назад. Індекс у масиві використовуємо як ідентифікатор:
// пресети завжди рендеряться зі свіжого стану сховища, тож індекс стабільний
// у межах одного відображення списку.
function graphicsPresetsList() {
  const p = loadJSON(STORAGE_KEYS.graphicsPresets) || [];
  if (!p.length) return '<div class="card-sub">Немає збережених пресетів.</div>';
  return p.map((item, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</div>
        <div style="font-size:10px;color:var(--text2)">${esc(item.date || '')}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="applyGraphicsPreset(${i})">Застосувати</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteGraphicsPreset(${i})">🗑</button>
    </div>`).join('');
}

function applyGraphicsPreset(i) {
  const p = loadJSON(STORAGE_KEYS.graphicsPresets) || [];
  const item = p[i];
  if (!item) return;
  Object.assign(state.graphicsSettings, JSON.parse(JSON.stringify(item.settings || {})));
  persistGraphicsSettings();
  markDirty('graphics');
  updateGraphicsPreview();
  updateLivePanels();
  notify('🎨 Пресет «' + item.name + '» застосовано');
}

function deleteGraphicsPreset(i) {
  const p = loadJSON(STORAGE_KEYS.graphicsPresets) || [];
  const item = p[i];
  if (!item || !confirm('Видалити пресет «' + item.name + '»?')) return;
  p.splice(i, 1);
  saveJSON(STORAGE_KEYS.graphicsPresets, p);
  markDirty('graphics');
  notify('🗑 Пресет видалено');
}

function saveH2RTemplate() {
pv2Prompt('Назва темплейта:', function(name){
if(!name) return;
const tpl = {id: Date.now(), name, date: new Date().toISOString().split('T')[0], config: JSON.parse(JSON.stringify(state.h2rConfig))};
try {
const tmpl = loadJSON(STORAGE_KEYS.h2rTemplates) || [];
tmpl.push(tpl);
saveJSON(STORAGE_KEYS.h2rTemplates, tmpl);
notify('✅ Шаблон збережено');
} catch(e) { notify('❌ Помилка збереження'); }
});
}

function saveHotkeys() {
saveJSON(STORAGE_KEYS.hotkeys, state.hotkeys);
renderHotkeys();
const status = $('#hotkeyStatus');
if(status) { status.textContent = '✓ Збережено'; setTimeout(() => { status.textContent = ''; }, 1000); }
}


// Поточний текст для графіки: обраний вірш пісні/Біблії, або демо
function pv2GraphicsContent() {
  // 1) Те, що зараз реально в залі (вірш, куплет, оголошення — байдуже)
  if (state.onAir && state.onAir.kind === 'text' && (state.onAir.rawText || state.onAir.html)) {
    const src = state.onAir.rawText != null ? state.onAir.rawText : state.onAir.html;
    const c0 = withSecondLang({ html: esc(stripChords(String(src))).replace(/\n/g, '<br>'), ref: state.onAir.ref || '' });
    return { text: c0.html, ref: c0.ref };
  }
  // 2) Підготовлене в прев'ю
  if (state.preview && state.preview.kind === 'text' && (state.preview.rawText || state.preview.html)) {
    const src = state.preview.rawText != null ? state.preview.rawText : state.preview.html;
    const c1 = withSecondLang({ html: esc(stripChords(String(src))).replace(/\n/g, '<br>'), ref: state.preview.ref || '' });
    return { text: c1.html, ref: c1.ref };
  }
  // 3) Останнє надіслане
  if (pv2LastContent && pv2LastContent.kind === 'text' && pv2LastContent.html) {
    const c = withSecondLang({ html: stripChords(pv2LastContent.html), ref: pv2LastContent.ref || '' });
    return { text: c.html, ref: c.ref };
  }
  // Далі — обраний куплет пісні (незалежно від того, яка вкладка відкрита)
  const s = state.selectedSong;
  if (s && s.verses && s.verses[state.selectedVerseIdx]) {
    return { text: esc(String(s.verses[state.selectedVerseIdx])).replace(/\n/g, '<br>'), ref: songRefForDisplay(s.title) };
  }
  try {
    const cur = getCurrentContent();
    if (cur && cur.payload && cur.payload.html) return { text: cur.payload.html, ref: cur.payload.ref || '' };
  } catch(e) {}
  return { text: '', ref: '' };
}


// Прозорість фону графіки саме для виходу n: якщо на ньому ввімкнено хромакей —
// напівпрозорий фон (щоб було видно камеру), інакше — суцільний. Раніше кнопки
// вкладки «Графіка» цього не робили, тож на трансляцію графіка йшла з непрозорим
// фоном і камери не було видно (той самий недогляд, що й у мультиперекладі).
function gfxAlphaFor(n) {
  return (state.outputChroma && state.outputChroma[n] && state.outputChroma[n] !== 'none' && typeof outputBgAlpha === 'function')
    ? outputBgAlpha(n) : undefined;
}

function sendGraphicsToAll() {
  const c = pv2GraphicsContent();
  doSendHTML(getGraphicsHTML(c.text, c.ref), 'Графіка (всі виходи)');
}

// Які виходи ЗАРАЗ показують графіку — той самий патерн, що вже є в H2R/
// QR/Таймері (qrLiveMap/timerLiveMap): кнопка сама підсвічується 🔴.
var graphicsLiveMap = { 1: false, 2: false, 3: false, 4: false };
function renderGraphicsOutBtns() {
  const el = document.getElementById('graphicsOutBtns');
  if (!el || typeof OUT_NAME === 'undefined') return;
  const outBtns = [1, 2, 3, 4].map(n => {
    const isLive = !!graphicsLiveMap[n];
    return `<button class="btn ${isLive ? 'btn-success' : 'btn-ghost'} btn-sm" onclick="sendGraphicsToOutput(${n})" title="Показати саме на ${esc(OUT_NAME[n] || ('Вихід ' + n))}">${isLive ? '🔴 ' : ''}${esc(OUT_NAME[n] || ('В.' + n))}</button>`;
  }).join('');
  const clearBtns = [1, 2, 3, 4].filter(n => graphicsLiveMap[n]).map(n =>
    `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="clearGraphicsFrom(${n})" title="Прибрати з ${esc(OUT_NAME[n] || ('Вихід ' + n))}">✕ ${esc(OUT_NAME[n] || ('В.' + n))}</button>`
  ).join('');
  el.innerHTML = `<div class="flex" style="gap:4px;flex-wrap:wrap">${outBtns}</div>` +
    (clearBtns ? `<div class="flex mt8" style="gap:4px;flex-wrap:wrap">${clearBtns}</div>` : '');
}
function sendGraphicsToOutput(num) {
  const c = pv2GraphicsContent();
  sendHTMLToOutputN(num, getGraphicsHTML(c.text, c.ref, gfxAlphaFor(num)), 'Графіка');
  graphicsLiveMap[num] = true;
  renderGraphicsOutBtns();
}
function clearGraphicsFrom(n) {
  if (typeof pv2ClearOutput === 'function') pv2ClearOutput(n);
  graphicsLiveMap[n] = false;
  renderGraphicsOutBtns();
}


// Які виходи ЗАРАЗ показують Lower Third — той самий патерн, що вже є в
// H2R-файлах (htmlLiveMap), QR, Таймері, Графіці.
var h2rLowerLiveMap = { 1: false, 2: false, 3: false, 4: false };
function renderH2RLowerOutBtns() {
  const el = document.getElementById('h2rLowerOutBtns');
  if (!el || typeof OUT_NAME === 'undefined') return;
  const outBtns = [1, 2, 3, 4].map(n => {
    const isLive = !!h2rLowerLiveMap[n];
    return `<button class="btn ${isLive ? 'btn-success' : 'btn-ghost'} btn-sm" style="font-size:10px;padding:3px 6px" onclick="sendH2RLowerThird(${n})" title="Показати саме на ${esc(OUT_NAME[n]||('Вихід '+n))}">${isLive ? '🔴 ' : ''}${esc(OUT_NAME[n]||('В.'+n))}</button>`;
  }).join('');
  const clearBtns = [1, 2, 3, 4].filter(n => h2rLowerLiveMap[n]).map(n =>
    `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 6px;color:var(--red)" onclick="clearH2R(${n})" title="Прибрати саме з ${esc(OUT_NAME[n]||('Вихід '+n))}">✕ ${esc(OUT_NAME[n]||('В.'+n))}</button>`
  ).join('');
  el.innerHTML = `<span style="font-size:10px;color:var(--text2);margin-right:3px">На вихід:</span>${outBtns}` +
    (clearBtns ? `<div class="flex mt8" style="gap:3px;flex-wrap:wrap"><span style="font-size:10px;color:var(--text2)">Прибрати з:</span>${clearBtns}</div>` : '');
}

// n=0 (за замовчуванням) — на всі дзеркальні виходи, як і раніше.
// n=1..4 — саме на цей вихід, не займаючи решту (той самий підхід,
// що вже є для графіки/HTML-оверлеїв/QR-екрана).
function sendH2RLowerThird(n) {
  const html = getH2RHTML();
  const label = 'H2R: ' + state.h2rConfig.line1;
  if (!n) doSendHTML(html, label);
  else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, html, label);
  if (n) { h2rLowerLiveMap[n] = true; renderH2RLowerOutBtns(); }
}

// Титри подяки — прокрутка знизу вгору, як у кінці фільму/трансляції.
// Кожен рядок textarea стає окремим пунктом; порожні рядки — невеликий
// проміжок (природний спосіб згрупувати «Звук: Іван» / «Відео: Марія»).
function getCreditsHTML() {
  const c = state.creditsConfig;
  const lines = (c.lines || '').split('\n').map(l => l.trim());
  const items = lines.map(l => l ? '<div class="credit-line">' + esc(l) + '</div>' : '<div class="credit-gap"></div>').join('');
  const dur = Math.max(5, c.durationSec || 30);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:${c.bg || '#0a0a1a'};width:100vw;height:100vh;overflow:hidden;font-family:Georgia,serif}
    .credits-track{position:absolute;left:0;right:0;top:100%;text-align:center;animation:creditsScroll ${dur}s linear forwards}
    .credit-line{color:${c.textColor || '#fff'};font-size:26px;line-height:1.8;padding:2px 20px}
    .credit-line:first-child{color:${c.accent || '#c8a84b'};font-size:32px;font-weight:700;margin-bottom:20px}
    .credit-gap{height:24px}
    @keyframes creditsScroll{from{top:100%}to{top:-100%}}
  </style></head><body><div class="credits-track">${items}</div></body></html>`;
}
// Які виходи ЗАРАЗ показують титри подяки — той самий патерн, що вже є в
// H2R/QR/Таймері/Графіці. На відміну від H2R (де є плавний вихід), тут
// прибираємо одразу через канонічний pv2ClearOutput — прокрутка сама не
// має «стану паузи», зупиняти нема чого, лише прибрати з екрана.
var creditsLiveMap = { 1: false, 2: false, 3: false, 4: false };
function renderCreditsOutBtns() {
  const el = document.getElementById('creditsOutBtns');
  if (!el || typeof OUT_NAME === 'undefined') return;
  const outBtns = [1, 2, 3, 4].map(n => {
    const isLive = !!creditsLiveMap[n];
    return `<button class="btn ${isLive ? 'btn-success' : 'btn-ghost'} btn-sm" style="font-size:10px;padding:3px 6px" onclick="sendCredits(${n})" title="Показати саме на ${esc(OUT_NAME[n]||('Вихід '+n))}">${isLive ? '🔴 ' : ''}${esc(OUT_NAME[n]||('В.'+n))}</button>`;
  }).join('');
  const clearBtns = [1, 2, 3, 4].filter(n => creditsLiveMap[n]).map(n =>
    `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 6px;color:var(--red)" onclick="clearCredits(${n})" title="Прибрати з ${esc(OUT_NAME[n]||('Вихід '+n))}">✕ ${esc(OUT_NAME[n]||('В.'+n))}</button>`
  ).join('');
  el.innerHTML = `<span style="font-size:10px;color:var(--text2);margin-right:3px">На вихід:</span>${outBtns}` +
    (clearBtns ? `<div class="flex mt8" style="gap:3px;flex-wrap:wrap">${clearBtns}</div>` : '');
}
function clearCredits(n) {
  if (typeof pv2ClearOutput === 'function') pv2ClearOutput(n);
  creditsLiveMap[n] = false;
  renderCreditsOutBtns();
}
function sendCredits(n) {
  const html = getCreditsHTML();
  const label = '🎬 Прокрутка подяки';
  if (!n) doSendHTML(html, label);
  else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, html, label);
  if (n) { creditsLiveMap[n] = true; renderCreditsOutBtns(); }
}

// Конфеті — короткий святковий ефект (хрещення, ювілей тощо). За своєю
// природою тимчасовий, тож САМ прибирає себе через кілька секунд (скрипт
// усередині надісланої сторінки, той самий підхід, що й у getTimerHTML) —
// оператору не треба окремо тиснути «прибрати».
function getConfettiHTML() {
  const colors = ['#ff6b6b','#4ecdc4','#ffe66d','#a685e2','#ff9f43','#54a0ff'];
  const count = 70;
  const pieces = Array.from({length: count}, (_, i) => {
    const left = Math.random() * 100;
    const delay = (Math.random() * 1.5).toFixed(2);
    const dur = (3 + Math.random() * 2).toFixed(2);
    const color = colors[i % colors.length];
    const w = Math.round(6 + Math.random() * 6);
    const rot = Math.round(Math.random() * 360);
    return '<div class="confetti-piece" style="left:' + left + '%;background:' + color + ';width:' + w + 'px;height:' + Math.round(w * 0.4) + 'px;animation-delay:' + delay + 's;animation-duration:' + dur + 's;transform:rotate(' + rot + 'deg)"></div>';
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0}body{background:transparent;width:100vw;height:100vh;overflow:hidden;position:relative}
    .confetti-piece{position:absolute;top:-20px;opacity:0.9;animation-name:confettiFall;animation-timing-function:ease-in;animation-fill-mode:forwards}
    @keyframes confettiFall{to{top:110%;transform:rotate(720deg)}}
  </style></head><body>${pieces}
  <script>setTimeout(function(){ try { document.body.innerHTML=''; } catch(e){} }, 6500);</script>
  </body></html>`;
}
// Конфеті — короткий ефект, сам зникає за ~6.5с (скрипт усередині сторінки
// сам чистить body). «Живим» вважаємо лише на цей короткий проміжок — після
// нього мапу знімаємо самі (setTimeout), щоб кнопка не лишалась 🔴 назавжди
// на те, чого вже давно немає на екрані.
var confettiLiveMap = { 1: false, 2: false, 3: false, 4: false };
var confettiLiveTimers = {};
function renderConfettiOutBtns() {
  const el = document.getElementById('confettiOutBtns');
  if (!el || typeof OUT_NAME === 'undefined') return;
  const outBtns = [1, 2, 3, 4].map(n => {
    const isLive = !!confettiLiveMap[n];
    return `<button class="btn ${isLive ? 'btn-success' : 'btn-ghost'} btn-sm" style="font-size:10px;padding:3px 6px" onclick="sendConfetti(${n})" title="Запустити саме на ${esc(OUT_NAME[n]||('Вихід '+n))}">${isLive ? '🔴 ' : ''}${esc(OUT_NAME[n]||('В.'+n))}</button>`;
  }).join('');
  const clearBtns = [1, 2, 3, 4].filter(n => confettiLiveMap[n]).map(n =>
    `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 6px;color:var(--red)" onclick="clearConfetti(${n})" title="Зупинити раніше на ${esc(OUT_NAME[n]||('Вихід '+n))}">✕ ${esc(OUT_NAME[n]||('В.'+n))}</button>`
  ).join('');
  el.innerHTML = `<span style="font-size:10px;color:var(--text2);margin-right:3px">На вихід:</span>${outBtns}` +
    (clearBtns ? `<div class="flex mt8" style="gap:3px;flex-wrap:wrap">${clearBtns}</div>` : '');
}
function clearConfetti(n) {
  if (typeof pv2ClearOutput === 'function') pv2ClearOutput(n);
  if (confettiLiveTimers[n]) { clearTimeout(confettiLiveTimers[n]); delete confettiLiveTimers[n]; }
  confettiLiveMap[n] = false;
  renderConfettiOutBtns();
}
function sendConfetti(n) {
  const html = getConfettiHTML();
  const label = '🎉 Конфеті';
  if (!n) doSendHTML(html, label);
  else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, html, label);
  if (n) {
    confettiLiveMap[n] = true;
    renderConfettiOutBtns();
    if (confettiLiveTimers[n]) clearTimeout(confettiLiveTimers[n]);
    confettiLiveTimers[n] = setTimeout(() => { confettiLiveMap[n] = false; delete confettiLiveTimers[n]; renderConfettiOutBtns(); }, 6500);
  }
}

// Тікер — горизонтальний біжучий рядок унизу екрана, крутиться ПО КОЛУ, доки
// не зупинять вручну (на відміну від титрів подяки й конфеті, які завершуються
// самі). Текст дублюємо двічі підряд і анімуємо зсув на -50% — це стандартний
// прийом для безшовної, непомітної для ока «склейки» циклу.
function getTickerHTML() {
  const c = state.tickerConfig;
  const text = esc(c.text || '');
  const spd = Math.max(5, c.speedSec || 18);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:transparent;width:100vw;height:100vh;overflow:hidden;position:relative;font-family:Georgia,serif}
    .ticker-bar{position:absolute;bottom:0;left:0;right:0;background:${c.bg || '#0a0a1a'};padding:10px 0;white-space:nowrap;overflow:hidden;border-top:2px solid ${c.accent || '#c8a84b'}}
    .ticker-track{display:inline-block;animation:tickerScroll ${spd}s linear infinite}
    .ticker-item{display:inline-block;color:${c.textColor || '#fff'};font-size:22px;padding:0 60px}
    @keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  </style></head><body><div class="ticker-bar"><div class="ticker-track"><span class="ticker-item">${text}</span><span class="ticker-item">${text}</span></div></div></body></html>`;
}
// Які виходи ЗАРАЗ крутять тікер — той самий патерн, що вже є в H2R/QR/
// Таймері/Графіці/Титрах. stopTicker(n) уже й був канонічним «прибрати»
// для цієї фічі (миттєво, без плавного виходу) — лишаємо його як є, просто
// додаємо трекінг і робимо кнопку умовною (лише для активних виходів).
var tickerLiveMap = { 1: false, 2: false, 3: false, 4: false };
function renderTickerOutBtns() {
  const el = document.getElementById('tickerOutBtns');
  if (!el || typeof OUT_NAME === 'undefined') return;
  const outBtns = [1, 2, 3, 4].map(n => {
    const isLive = !!tickerLiveMap[n];
    return `<button class="btn ${isLive ? 'btn-success' : 'btn-ghost'} btn-sm" style="font-size:10px;padding:3px 6px" onclick="sendTicker(${n})" title="Запустити саме на ${esc(OUT_NAME[n]||('Вихід '+n))}">${isLive ? '🔴 ' : ''}${esc(OUT_NAME[n]||('В.'+n))}</button>`;
  }).join('');
  const clearBtns = [1, 2, 3, 4].filter(n => tickerLiveMap[n]).map(n =>
    `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 6px;color:var(--red)" onclick="stopTicker(${n})" title="Зупинити саме на ${esc(OUT_NAME[n]||('Вихід '+n))}">✕ ${esc(OUT_NAME[n]||('В.'+n))}</button>`
  ).join('');
  el.innerHTML = `<span style="font-size:10px;color:var(--text2);margin-right:3px">На вихід:</span>${outBtns}` +
    (clearBtns ? `<div class="flex mt8" style="gap:3px;flex-wrap:wrap">${clearBtns}</div>` : '');
}
function sendTicker(n) {
  const html = getTickerHTML();
  const label = '📰 Тікер: ' + state.tickerConfig.text;
  if (!n) doSendHTML(html, label);
  else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, html, label);
  if (n) { tickerLiveMap[n] = true; renderTickerOutBtns(); }
}
// На відміну від H2R (де є плавний вихід) тікер прибираємо одразу — це
// службовий, фоновий елемент, а не акцентна графіка, різка зміна тут не
// впадає в очі так само помітно.
function stopTicker(n) {
  const blank = '<!DOCTYPE html><html><body style="background:transparent"></body></html>';
  if (!n) doSendHTML(blank, '');
  else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, blank, '');
  if (n) { tickerLiveMap[n] = false; renderTickerOutBtns(); }
}

// ============================================================
// 🚨 АВАРІЙНА ПАНЕЛЬ — об'єднує вже наявні, окремо перевірені дії
// (blackout/freeze/logo) в одному місці, доступному з БУДЬ-ЯКОЇ вкладки.
// Свідомо НЕ будує нову логіку показу/приховування — лише викликає вже
// перевірені toggleBlackout()/toggleFreeze()/showLogo(), щоб не дублювати
// й не ризикувати розсинхронізацією зі станом, яким керують ці функції.
// ============================================================
function toggleEmergencyPanel() {
  var panel = document.getElementById('emergencyPanel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    renderEmergencyPanel();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}
// Пакетування (rafDebounce — наявний ідіом проєкту, як updateLivePanels):
// ця функція викликалась із багатьох місць підряд, і кожен виклик повністю
// перебудовував список. Тепер підряд ідучі виклики склеюються в один
// перемальовок на кадр.
// Обгортка — саме function-декларація з ЛІНИВОЮ ініціалізацією, а не
// `const renderEmergencyPanel = rafDebounce(...)`: const створив би temporal dead zone,
// і будь-який виклик до цього рядка впав би з «Cannot access before
// initialization» — рівно той баг, що вже двічі ловився в цьому проєкті
// (loadDisplayToggles). Function-декларація піднімається (hoisting), тож
// порядок завантаження файлів більше не має значення.
var _renderEmergencyPanelDeb = null;
function renderEmergencyPanel() {
  if (!_renderEmergencyPanelDeb) _renderEmergencyPanelDeb = rafDebounce(_renderEmergencyPanelNow);
  return _renderEmergencyPanelDeb.apply(null, arguments);
}
function _renderEmergencyPanelNow() {
  var panel = document.getElementById('emergencyPanel');
  if (!panel) return;
  var allFrozen = [1, 2, 3, 4].every(function(n) { return state.frozen && state.frozen[n]; });
  var logoShown = [1, 2, 3, 4].some(function(n) { return state.logoSettings && state.logoSettings[n] && state.logoSettings[n].on; });
  panel.innerHTML =
    '<div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:8px">🚨 Аварійна панель</div>' +
    '<button class="btn ' + (state.blackout ? 'btn-danger' : 'btn-ghost') + ' btn-sm" style="width:100%;margin-bottom:4px;text-align:left" onclick="toggleBlackout()">' + (state.blackout ? '▶ Повернути екран' : '⬛ Blackout (чорний екран)') + '</button>' +
    '<button class="btn ' + (allFrozen ? 'btn-danger' : 'btn-ghost') + ' btn-sm" style="width:100%;margin-bottom:4px;text-align:left" onclick="toggleFreeze()">' + (allFrozen ? '▶ Розморозити всі виходи' : '❄️ Заморозити всі виходи') + '</button>' +
    '<button class="btn ' + (logoShown ? 'btn-danger' : 'btn-ghost') + ' btn-sm" style="width:100%;margin-bottom:8px;text-align:left" onclick="' + (logoShown ? 'emergencyHideLogoAll()' : 'emergencyShowLogoAll()') + '">' + (logoShown ? '▶ Прибрати логотип' : '🖼 Показати логотип (усі виходи)') + '</button>' +
    '<input type="text" id="emergencyMsgInput" value="Технічні складнощі — зачекайте, будь ласка" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none;margin-bottom:4px">' +
    '<button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:8px;text-align:left" onclick="sendEmergencyMessage()">📢 Показати повідомлення (усі виходи)</button>' +
    '<button class="btn btn-success btn-sm" style="width:100%" onclick="emergencyRestoreAll()">✅ Відновити все — прибрати всі аварійні стани</button>';
}
function emergencyShowLogoAll() {
  if (!state.logo) { notify('⚠️ Спершу завантаж логотип у вкладці «Виходи»'); return; }
  [1, 2, 3, 4].forEach(function(n) { if (typeof showLogo === 'function') showLogo(n, true); });
  renderEmergencyPanel();
  notify('🖼 Логотип показано на всіх виходах');
}
function emergencyHideLogoAll() {
  [1, 2, 3, 4].forEach(function(n) { if (typeof showLogo === 'function') showLogo(n, false); });
  renderEmergencyPanel();
  notify('▶ Логотип прибрано з усіх виходів');
}
function sendEmergencyMessage() {
  var input = document.getElementById('emergencyMsgInput');
  var text = (input && input.value.trim()) || 'Технічні складнощі — зачекайте, будь ласка';
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '*{margin:0;padding:0;box-sizing:border-box}body{background:#1a0a0a;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif}' +
    '.msg{color:#fff;font-size:36px;text-align:center;padding:0 60px;border-top:3px solid #e05555;border-bottom:3px solid #e05555;padding-top:20px;padding-bottom:20px}' +
    '</style></head><body><div class="msg">' + esc(text) + '</div></body></html>';
  doSendHTML(html, '🚨 ' + text);
  notify('📢 Аварійне повідомлення показано');
}
// Повертає ВСЕ до нормального стану одним кліком — знімає blackout,
// розморожує, прибирає логотип і аварійне повідомлення (порожня сторінка
// на всі виходи, той самий безпечний підхід, що вже використовує тікер).
function emergencyRestoreAll() {
  if (state.blackout && typeof toggleBlackout === 'function') toggleBlackout();
  // НАПРЯМУ розморожуємо всі 4, а не через toggleFreeze() — та функція
  // дивиться «чи заморожені ВСІ» і при ЧАСТКОВІЙ заморозці заморозила б
  // решту замість розморозити геть усе, як тут і треба.
  var anyFrozen = [1, 2, 3, 4].some(function(n) { return state.frozen && state.frozen[n]; });
  if (anyFrozen && window.electronAPI && window.electronAPI.freezeOutput) {
    [1, 2, 3, 4].forEach(function(n) { state.frozen[n] = false; });
    window.electronAPI.freezeOutput(false);
  }
  emergencyHideLogoAll();
  var blank = '<!DOCTYPE html><html><body style="background:transparent"></body></html>';
  doSendHTML(blank, '');
  renderEmergencyPanel();
  notify('✅ Усі аварійні стани знято');
}

// Які виходи ЗАРАЗ показують медіа — той самий патерн, що вже є в H2R/QR/
// Таймері/Графіці/Титрах/Тікері.
function startPlaylistTimer() {
stopPlaylistTimer();
const sec = parseInt($('#playlistTimer')?.value || 10);
state.playlistTimer = setInterval(() => { if(state.playlistRunning) playlistNext(); }, sec * 1000);
const status = $('#playlistStatus');
if(status) status.textContent = '● Таймер: ' + sec + 'с';
}

function stopPlaylistTimer() {
if(state.playlistTimer) { clearInterval(state.playlistTimer); state.playlistTimer = null; }
}

function updateGraphicsPreview() {
  const s = state.graphicsSettings;
  s.refColor   = $('#graphicsRefColor')?.value  || s.refColor;
  s.textColor  = $('#graphicsTextColor')?.value || s.textColor;
  s.bgColor    = $('#graphicsBgColor')?.value   || s.bgColor;
  s.decor      = $('#graphicsDecor')?.value     || s.decor;
  s.fontFamily = $('#graphicsFont')?.value      || s.fontFamily;
  s.bgType     = $('#graphicsBgType')?.value    || s.bgType;
  if ($('#graphicsSize'))    s.size    = parseInt($('#graphicsSize').value, 10)    || s.size;
  if ($('#graphicsRefSize')) s.refSize = parseInt($('#graphicsRefSize').value, 10) || s.refSize;
  if ($('#graphicsDim'))     s.bgDim   = (parseInt($('#graphicsDim').value, 10) || 0) / 100;
  if ($('#graphicsVideoDim')) s.bgVideoDim = (parseInt($('#graphicsVideoDim').value, 10) || 0) / 100;

  const sizeLbl = $('#graphicsSizeLabel');   if (sizeLbl) sizeLbl.textContent = s.size + 'px';
  const refLbl  = $('#graphicsRefSizeLabel'); if (refLbl) refLbl.textContent = s.refSize + 'px';
  const dimLbl  = $('#graphicsDimLabel');    if (dimLbl) dimLbl.textContent = Math.round(s.bgDim * 100) + '%';
  const vdimLbl = $('#graphicsVideoDimLabel'); if (vdimLbl) vdimLbl.textContent = Math.round((s.bgVideoDim != null ? s.bgVideoDim : 0.35) * 100) + '%';

  // Перемальовку iframe і запис у сховище відкладаємо — інакше кожен рух
  // повзунка рендерив би сцену 1920x1080 і зайво грів процесор.
  redrawGraphicsFrame();
  persistGraphicsSettings();
}

// Відновлення налаштувань графіки після перезапуску
function loadGraphicsSettings() {
  const s = loadJSON(STORAGE_KEYS.graphicsPresets + '_current');
  if (!s) return;
  if (typeof s._autoContrast === 'boolean') state.autoContrast = s._autoContrast;
  delete s._autoContrast;
  // Міграція: у старих збережених налаштуваннях було лише ОДНЕ спільне
  // streamOpacity — якщо outputOpacity ще немає, підхоплюємо звідти
  // значення для всіх 4 виходів, щоб кастомна прозорість не загубилась.
  if (typeof s.streamOpacity === 'number' && !s.outputOpacity) {
    s.outputOpacity = {1: s.streamOpacity, 2: s.streamOpacity, 3: s.streamOpacity, 4: s.streamOpacity};
  }
  Object.assign(state.graphicsSettings, s);
}

// Розмір тексту оголошень окремо для проектора/трансляції.
function loadAnnounceSettings() {
  const s = loadJSON(STORAGE_KEYS.announceSettings);
  if (s) {
    [1, 2, 3, 4].forEach(function(n) { if (s[n]) Object.assign(state.announceSettings[n], s[n]); });
  }
  if (typeof syncAnnounceSizeInputs === 'function') syncAnnounceSizeInputs();
}
function saveAnnounceSettings() {
  saveJSON(STORAGE_KEYS.announceSettings, state.announceSettings);
}
function setAnnounceSize(n, field, value) {
  var v = parseInt(value, 10);
  if (!v || v < 10) v = state.announceSettings[n][field];   // биту/порожню зміну ігноруємо, лишаємо як було
  state.announceSettings[n][field] = v;
  saveAnnounceSettings();
}
function syncAnnounceSizeInputs() {
  [1, 2, 3, 4].forEach(function(n) {
    var s = state.announceSettings[n];
    if (!s) return;
    var t = document.getElementById('annSizeTitle' + n);
    var b = document.getElementById('annSizeBody' + n);
    var d = document.getElementById('annSizeDate' + n);
    if (t) t.value = s.titleSize;
    if (b) b.value = s.bodySize;
    if (d) d.value = s.dateSize;
  });
}

const redrawGraphicsFrame = rafDebounce(() => {
  const frame = $('#graphicsPreviewFrame');
  if (!frame) return;
  const c = pv2GraphicsContent();
  frame.srcdoc = getGraphicsHTML(
    c.text || 'Блаженні вбогі духом, бо їхнє Царство Небесне',
    c.ref  || 'Від Матвія 5:3'
  );
});
let _gfxSaveTimer = null;
function persistGraphicsSettings() {
  clearTimeout(_gfxSaveTimer);
  _gfxSaveTimer = setTimeout(() => saveJSON(STORAGE_KEYS.graphicsPresets + '_current',
    Object.assign({}, state.graphicsSettings, { _autoContrast: state.autoContrast })), 400);
}

// Фонове зображення для графіки (як у Темі проектора)

// Відео-фон для повноекранного макета графіки. Беремо ШЛЯХ до файлу (як для
// звичайного тексту), а не base64 — відео легко важить десятки МБ, а base64
// у сховищі обмежене й переповнило б його.
function loadGraphicsBgVideo(input) {
  const f = input.files[0];
  if (!f) return;
  const finish = function() {
    state.graphicsSettings.bgType = 'video';
    persistGraphicsSettings();
    markDirty('graphics');
    redrawGraphicsFrame();
    notify('🎬 Відео-фон графіки: ' + f.name);
  };
  if (f.path && typeof pathToFileUrl === 'function') {
    ensureSupportedMedia(f.path, function(cpath) {
      state.graphicsSettings.bgVideo = { src: pathToFileUrl(cpath), name: f.name, speed: 1 };
      finish();
    });
  } else {
    // Поза Electron шляху немає — лише на цей сеанс, без збереження
    state.graphicsSettings.bgVideo = { src: URL.createObjectURL(f), name: f.name, speed: 1, session: true };
    finish();
  }
  input.value = '';
}
function clearGraphicsBgVideo() {
  state.graphicsSettings.bgVideo = null;
  persistGraphicsSettings();
  markDirty('graphics');
  redrawGraphicsFrame();
  notify('Відео-фон прибрано');
}
function setGraphicsVideoSpeed(v) {
  if (!state.graphicsSettings.bgVideo) return;
  state.graphicsSettings.bgVideo.speed = Math.max(0.25, Math.min(2, parseFloat(v) || 1));
  persistGraphicsSettings();
  redrawGraphicsFrame();
}

function loadGraphicsBgImage(input) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    state.graphicsSettings.bgImage = e.target.result;
    state.graphicsSettings.bgType = 'image';
    const sel = $('#graphicsBgType');
    if (sel) sel.value = 'image';
    updateGraphicsPreview();
    notify('🖼 Фон графіки завантажено');
  };
  r.readAsDataURL(f);
  input.value = '';
}

// Перенести стиль із Теми проектора в Графіку — щоб не налаштовувати двічі
function graphicsFromTheme() {
  try {
    const t = (typeof getThemeSettings === 'function') ? getThemeSettings() : (window.currentTheme || null);
    if (!t) { notify('⚠️ Тему не знайдено'); return; }
    const s = state.graphicsSettings;
    if (t.textColor)  s.textColor  = t.textColor;
    if (t.refColor)   s.refColor   = t.refColor;
    if (t.bgColor)    s.bgColor    = t.bgColor;
    if (t.fontSize)   s.size       = t.fontSize;
    if (t.fontFamily) s.fontFamily = t.fontFamily;
    if (t.bgImage)    { s.bgImage = t.bgImage; s.bgType = 'image'; }
    else if (t.bgGradient) { s.bgGradient = t.bgGradient; s.bgType = 'gradient'; }
    else s.bgType = 'color';
    if (typeof t.bgDim === 'number') s.bgDim = t.bgDim;
    if (typeof t.textShadow === 'boolean') s.shadow = t.textShadow;
    markDirty('graphics');
    notify('✓ Стиль перенесено з Теми проектора');
  } catch(e) { notify('⚠️ Не вдалось прочитати тему'); }
}

// Перемалювати вкладку на місці (після зміни налаштувань ззовні)
function renderTabInto(tabId) {
  const host = $('#tab-content-' + tabId);
  const fn = {graphics: renderGraphicsTab, textcontrol: renderTextControlTab, h2r: renderH2RTab, live: renderLiveTab, router: renderRouterTab, control: renderControlTab, monitors: renderMonitorsTab, monitors2: renderMonitorsTab, stations: renderStationsTab, extras: renderExtrasTab, layers: renderLayersTab, song: renderSongTab, stream: renderStreamTab, qrscreen: renderQrScreenTab, settings: renderSettingsTab, automation: renderAutomationTab, typo: renderTypoTab, service: renderServiceTab}[tabId];
  if (!host || !fn) return;
  // Захист: якщо один рендер кине виняток, НЕ лишаємо вкладку порожньою з
  // «мертвими» полями — тримаємо попередній вміст і пишемо причину в лог.
  try {
    host.innerHTML = fn();
  } catch (e) {
    console.error('renderTabInto(' + tabId + '): помилка рендера, вкладку не перемальовано —', e);
    try { if (typeof logChange === 'function') logChange('⚠️ Помилка рендера вкладки «' + tabId + '»: ' + (e && e.message || e)); } catch (_) {}
    return;
  }
  // Живий перерендер (напр. після зміни налаштування) малює свіжий
  // український HTML — одразу перекладаємо його назад на поточну мову.
  if (typeof uiTranslateNode === 'function') uiTranslateNode(host);
  if (tabId === 'graphics') { updateGraphicsFontList(); updateGraphicsPreview(); if (typeof renderGraphicsOutBtns === 'function') renderGraphicsOutBtns(); }
  // Статуси виходів оновлюємо при відкритті — індикатора в лівій панелі більше немає
  if (tabId === 'router') pv2SyncOutputStates();
  if (tabId === 'captions' && typeof audioMeterRefreshDevices === 'function') audioMeterRefreshDevices();
  if (tabId === 'h2r' && typeof renderH2RTemplates === 'function') { try { renderH2RTemplates(); } catch (e) {} }
  if (tabId === 'h2r' && typeof renderH2RLowerOutBtns === 'function') { try { renderH2RLowerOutBtns(); } catch (e) {} }
  if (tabId === 'h2r' && typeof renderCreditsOutBtns === 'function') { try { renderCreditsOutBtns(); } catch (e) {} }
  if (tabId === 'h2r' && typeof renderConfettiOutBtns === 'function') { try { renderConfettiOutBtns(); } catch (e) {} }
  if (tabId === 'h2r' && typeof renderTickerOutBtns === 'function') { try { renderTickerOutBtns(); } catch (e) {} }
  if (tabId === 'textcontrol') updateTextPreview();
  if (tabId === 'live') updateLivePanels();
  if (tabId === 'stream') updateLowerPreview();
  if (tabId === 'qrscreen') { updateQrPreview(); if (typeof renderQrOutputRow === 'function') renderQrOutputRow(); }
  if (tabId === 'stations') { renderStationClients(); renderRemoteUsersList(); }
  if (tabId === 'settings' && typeof refreshAppVersion === 'function') refreshAppVersion();
  if (tabId === 'atem' && typeof videoCaptureRefreshDevices === 'function') videoCaptureRefreshDevices('h2rMvDeviceSel');
  if (tabId === 'theme' && typeof renderCustomLooksList === 'function') renderCustomLooksList();
  if (tabId === 'service' && typeof svcRenderSongBookFilter === 'function') svcRenderSongBookFilter();
  // План служби тепер вбудований і у вкладку «Пісні» — синхронізуємо обидва
  // місця з ОДНОГО й того самого renderServiceTab(), без дублювання логіки.
  if (tabId === 'service' && typeof renderServicePlanEmbed === 'function') renderServicePlanEmbed();
}

// Список шрифтів: системні + завантажені у вкладці «Шрифти»
function fontOptionsHTML(selected) {
  const base = ['Georgia, serif', 'Arial, sans-serif', 'Times New Roman, serif',
                'Verdana, sans-serif', 'Trebuchet MS, sans-serif', 'Impact, sans-serif'];
  const custom = state.customFonts.map(f => f.name);
  return base.concat(custom).map(f =>
    `<option value="${f}"${f === selected ? ' selected' : ''}>${f.split(',')[0]}</option>`).join('');
}
function updateGraphicsFontList() {
  const sel = $('#graphicsFont');
  if (sel) sel.innerHTML = fontOptionsHTML(state.graphicsSettings.fontFamily);
  const tsel = $('#textFont');
  if (tsel) tsel.innerHTML = fontOptionsHTML((state.textSettings[state.currentTextOutput] || state.textSettings[1]).fontFamily);
}

function updateH2RPreview() {
state.h2rConfig.line1 = $('#h2rLine1')?.value || '';
state.h2rConfig.line2 = $('#h2rLine2')?.value || '';
state.h2rConfig.line3 = $('#h2rLine3')?.value || '';
state.h2rConfig.style = $('#h2rStyle')?.value || 'classic';
state.h2rConfig.accent = $('#h2rAccent')?.value || '#7c6af7';
state.h2rConfig.textColor = $('#h2rTextColor')?.value || '#ffffff';
state.h2rConfig.animation = $('#h2rAnimation')?.value || 'slideLeft';
const scEl = $('#h2rScale'); if (scEl) state.h2rConfig.scale = (parseInt(scEl.value, 10) || 100) / 100;
const scLbl = $('#h2rScaleLabel'); if (scLbl) scLbl.textContent = Math.round((state.h2rConfig.scale || 1) * 100) + '%';
renderH2RPreview();
}

function updatePPTPreview() {
const t = PPT_TEMPLATES[state.pptTemplate] || PPT_TEMPLATES.classic;
const p = $('#pptPreview');
if(!p) return;
p.style.background = t.bg;
const title = $('#pptPreviewTitle');
const verses = $('#pptPreviewVerses');
if(title) { title.style.color = t.titleColor; title.style.fontFamily = t.fontFamily; }
if(verses) { verses.style.color = t.textColor; verses.style.fontFamily = t.fontFamily; }
}


function updateTextStatus() {
for(let i = 1; i <= 4; i++) {
const el = $('#textStatus' + i);
if(el) {
const s = state.textSettings[i] || state.textSettings[1];
el.textContent = (i === 1 ? '📺' : i === 2 ? '🎥' : '🖥') + i + ': ' + (s.size || 58) + 'px';
}
}
}

// ---- Збір статистики: обгортаємо doSend / doSendHTML додатку ----
// (у прототипі статистика тільки відображалась, але не збиралась — виправлено)
function recordStat(kind, name) {
  try {
    const sd = state.statsData;
    sd.totalOutputs = (sd.totalOutputs || 0) + 1;
    const day = new Date().toISOString().split('T')[0];
    sd.dailyActivity = sd.dailyActivity || {};
    sd.dailyActivity[day] = (sd.dailyActivity[day] || 0) + 1;
    if (name) {
      if (kind === 'song') { sd.songUsage = sd.songUsage || {}; sd.songUsage[name] = (sd.songUsage[name] || 0) + 1; }
      if (kind === 'bible') { sd.bibleUsage = sd.bibleUsage || {}; sd.bibleUsage[name] = (sd.bibleUsage[name] || 0) + 1; }
    }
    sd.log = sd.log || [];
    sd.log.push({t: Date.now(), kind: kind, name: name || ''});
    if (sd.log.length > 5000) sd.log = sd.log.slice(-5000);   // ~рік щотижневих служб для великої церкви
    saveStatistics();
    if (isActive('statistics')) updateStatistics();
  } catch(e) {}
}

// Перенесено в кінець файлу (див. коментар біля loadDisplayToggles вище) —
// на цей момент усі top-level const/var extras-1.js уже ініціалізовані,
// тож більше жодної TDZ-залежності підловити не може.
safeInit(loadDisplayToggles, 'loadDisplayToggles');

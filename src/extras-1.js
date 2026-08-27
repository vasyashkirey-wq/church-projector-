
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
// Відкладає важку операцію до наступного кадру, склеюючи серію викликів в один.
function rafDebounce(fn) {
  let pending = false, lastArgs = null;
  return function(...args) {
    lastArgs = args;
    if (pending) return;
    pending = true;
    const run = () => { pending = false; fn.apply(null, lastArgs); };
    (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(run) : setTimeout(run, 16);
  };
}
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
  qrPresets: 'church_qr_presets',
  graphicsPresets: 'church_graphics_presets',
  h2rTemplates: 'church_h2r_templates',
  hotkeyProfiles: 'church_hotkey_profiles',
  plugins: 'church_plugins',
  animations: 'church_animations',
  fonts: 'church_fonts',
  scenePresets: 'church_scene_presets',
  announceSettings: 'church_announce_settings',
  stageMonitor: 'church_stage_monitor'
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
  renderTabInto('router');
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();   // банер показує назву — оновити підпис одразу
}

// Відправити HTML на КОНКРЕТНИЙ вихід (а не на всі)
const _overlayCache = new Map(); // html → Promise<filePath>
// Кешуємо саме ПРОМІС, а не готовий шлях: маршрути шлють однаковий HTML
// на 4 виходи одночасно, і всі 4 виклики стартують до завершення першого запису.
function overlayPath(html) {
  let p = _overlayCache.get(html);
  if (p) return p;
  p = window.electronAPI.writeHtmlOverlay(html);
  if (_overlayCache.size > 40) _overlayCache.clear(); // не тримаємо історію вічно
  _overlayCache.set(html, p);
  p.catch(() => _overlayCache.delete(html));          // невдалий запис не кешуємо
  return p;
}

function sendHTMLToOutputN(n, html, label) {
  if (state.trainingMode) {
    if (label) notify('🎓 Тренування: «' + label + '» → ' + OUT_NAME[n] + ' (не на екрані)');
    return;
  }
  if (!window.electronAPI || !window.electronAPI.sendToOutput) { doSendHTML(html, label); return; }
  overlayPath(html).then(filePath => {
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
  songSize: null,    // зафіксований розмір шрифту пісні (null = авто-підгін); тримається між куплетами і між піснями
  scheduler: { items: [] }, autoBackup: { on: false, everyDays: 7, last: 0 }, songTrash: [], lang: 'ua',
  blackout: false, masterVolume: 1, sermon: { running: false }, bookmarks: [], panelLocked: false,
  // Титр для трансляції
  lower: { style: 'gold', position: 'bottom', animation: 'slideUp', accent: null, scale: 0.62,
           target: 2, autoHide: 0, visible: false },
  captions: { enabled: false, listening: false, text: '', interim: '', targetOutput: 1 },  // живі субтитри (Web Speech API)
  cloudSync: { folder: null, lastSync: null, autoSync: true },  // хмарна синхронізація бібліотеки
  service: { name: '', date: '', items: [], idx: -1, slideIdx: 0, saved: [] },
  bgVideo: null,     // фонове відео
  bgQueue: [], bgQueueInterval: 30, bgQueueIdx: 0, bgQueueRunning: false,  // черга з авто-ротацією
  logo: null,        // логотип церкви
  // Постійний водяний знак (напр. назва церкви/рік) — ОКРЕМИЙ для кожного
  // з 4 виходів (раніше було одне спільне налаштування на всі).
  watermark: {
    1: { text: '', on: false, position: 'top-left', size: 16, color: '#ffffff' },
    2: { text: '', on: false, position: 'top-left', size: 16, color: '#ffffff' },
    3: { text: '', on: false, position: 'top-left', size: 16, color: '#ffffff' },
    4: { text: '', on: false, position: 'top-left', size: 16, color: '#ffffff' }
  },
  _watermarkEditN: 1,   // який вихід зараз редагується в панелі «Шари» (лише UI, не зберігається)
  frozen: false,
  alertCfg: { text: '', position: 'bottom', size: 34, seconds: 12, ticker: false },
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
  // Раніше state.stageWindow тримав window.open()-попап. Тепер Stage Monitor —
  // справжнє Electron BrowserWindow, яким керує головний процес; тут лишається
  // лише прапорець «відкрито/закрито» та прив'язка до монітора.
  stageDisplayOpen: false,
  stageMonitorId: null,
  stageMonitorFingerprint: null,
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
    streamOpacity: 62,      // прозорість фону графіки для трансляції, % (100 = суцільний)
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

function addCurrentToPlaylist() {
const content = getCurrentContent();
if(!content || !content.payload.html) { notify('Немає контенту'); return; }
let type = 'text', ref = content.payload.ref || 'Без назви';
if(isActive('songs')) { type = 'song'; ref = state.selectedSong ? state.selectedSong.title : 'Пісня'; }
else if(isActive('bible')) { type = 'bible'; ref = $('#bibleRef')?.textContent || 'Вірш'; }
else if(isActive('announce')) { type = 'announce'; ref = $('#annTitle')?.value || 'Оголошення'; }
state.playlist.push({id: Date.now() + Math.random() * 1000, type, ref, html: content.payload.html, content});
savePlaylistData();
renderPlaylist();
}


function applyAnimations() {
updateAnimationPreview();
saveJSON(STORAGE_KEYS.animations, state.animSettings);
const speedVal = $('#animSpeedVal');
if(speedVal) speedVal.textContent = state.animSettings.speed + 'ms';
notify('✓ Анімації застосовано');
}

function applyFontSettings() {
const s = $('#fontSongs')?.value || 'Georgia, serif';
const b = $('#fontBible')?.value || 'Georgia, serif';
const h = $('#fontHeaders')?.value || 'Georgia, serif';
saveJSON(STORAGE_KEYS.fonts, {songs: s, bible: b, headers: h});
const preview = $('#fontPreviewText');
if(preview) preview.style.fontFamily = s;
notify('✓ Шрифти застосовано');
}


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

function applyPresetAnim(name) {
const p = {
gentle: {entry:'fade', exit:'fade', speed:600},
fast: {entry:'fade', exit:'fade', speed:200}
}[name];
if(!p) return;
const entry = $('#animEntry');
const exit = $('#animExit');
const speed = $('#animSpeed');
if(entry) entry.value = p.entry;
if(exit) exit.value = p.exit;
if(speed) speed.value = p.speed;
const speedVal = $('#animSpeedVal');
if(speedVal) speedVal.textContent = p.speed + 'ms';
updateAnimationPreview();
applyAnimations();
previewAnimation();
}

function applyTextSettingsToOutput() {
  const target = state.currentTextOutput;
  const c = pv2GraphicsContent();
  if (target === 'all') {
    doSendHTML(buildTextHTML(state.textSettings[1], c), 'Текст (всі виходи)');
  } else {
    const hasChroma = !!(state.outputChroma && state.outputChroma[target] && state.outputChroma[target] !== 'none');
    sendHTMLToOutputN(target, buildTextHTML(state.textSettings[target] || state.textSettings[1], c, hasChroma), 'Текст');
  }
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

function changeTextSize(d) {
const s = state.currentTextOutput === 'all' ? state.textSettings[1] : state.textSettings[state.currentTextOutput] || state.textSettings[1];
const n = Math.max(12, Math.min(150, (s.size || 58) + d));
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].size = n;
} else {
state.textSettings[state.currentTextOutput].size = n;
}
const sizeDisplay = $('#textSizeDisplay');
const sizeSlider = $('#textSizeSlider');
if(sizeDisplay) sizeDisplay.textContent = n;
if(sizeSlider) sizeSlider.value = n;
updateTextStatus();
updateTextPreview();
}

function clearH2R() {
const content = $('#h2rPreviewContent');
if(content) content.style.opacity = '0';
setTimeout(() => { if(content) content.style.opacity = '1'; }, 300);
}

function clearPlaylist() {
if(!confirm('Очистити чергу?')) return;
state.playlist = [];
state.playlistIndex = 0;
state.playlistRunning = false;
stopPlaylistTimer();
savePlaylistData();
renderPlaylist();
const status = $('#playlistStatus');
if(status) status.textContent = '● Зупинено';
}

async function closeStageDisplay() {
if(window.electronAPI && window.electronAPI.closeStageWindow) await window.electronAPI.closeStageWindow();
state.stageDisplayOpen = false;
const status = $('#stageStatus');
if(status) status.textContent = '✕ Stage Display закрито';
}


// CCLI-подібний звіт: реальні дати використання кожної пісні (не «сьогодні»
// для всього), лише пісні (без віршів — CCLI їх не потребує), усі, а не
// топ-10, і саме за обраний період (раніше перемикач Період нічого не робив).
function exportStatisticsExcel() {
  const period = ($('#statPeriod') && $('#statPeriod').value) || 'month';
  const spanMs = period === 'day' ? 24 * 3600 * 1000 : period === 'week' ? 7 * 24 * 3600 * 1000 : period === 'year' ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  const cutoff = Date.now() - spanMs;
  const log = (state.statsData.log || []).filter(e => e.t >= cutoff);

  const songDates = {};
  log.forEach(e => {
    if (e.kind !== 'song' || !e.name) return;
    const day = new Date(e.t).toISOString().split('T')[0];
    (songDates[e.name] = songDates[e.name] || new Set()).add(day);
  });
  const names = Object.keys(songDates).sort();
  const rows = ['Назва пісні,Кількість використань,Дати використання'];
  names.forEach(name => {
    const dates = Array.from(songDates[name]).sort();
    rows.push(`"${name}",${dates.length},"${dates.join('; ')}"`);
  });
  rows.push('');
  rows.push('Період:,' + ({ day: 'День', week: 'Тиждень', month: 'Місяць', year: 'Рік' }[period]));
  rows.push('Усього різних пісень:,' + names.length);
  if (!names.length) { notify('⚠️ За цей період пісень не надсилалось'); return; }
  downloadFile(rows.join('\n'), 'ccli_pisni_' + new Date().toISOString().split('T')[0] + '.csv', 'text/csv');
  notify('📊 Звіт по піснях: ' + names.length);
}

function exportToHTML() {
if(!state.songs.length) { notify('Немає'); return; }
let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Пісні</title><style>body{font-family:Georgia,serif;max-width:600px;margin:16px auto;padding:12px;background:#f5f0e8}.song{margin:8px 0;padding:8px;background:#fff;border-radius:3px}.title{font-size:16px;font-weight:700;color:#2d1b69}.author{color:#888;font-size:12px}.verse{margin:2px 0;padding:2px 6px;background:#faf8f5;border-left:2px solid #c8a84b}</style></head><body><h1>⛪ Пісні</h1>`;
state.songs.forEach(s => {
html += `<div class="song"><div class="title">${esc(s.title)}</div>${s.author ? '<div class="author">'+esc(s.author)+'</div>' : ''}<div class="verse">${esc(s.verses[0] || '').replace(/\n/g,'<br>')}</div></div>`;
});
html += '</body></html>';
downloadFile(html, 'songs_export.html', 'text/html');
}

function exportToPPTX() {
if(!state.songs.length) { notify('Немає пісень'); return; }
const t = PPT_TEMPLATES[state.pptTemplate] || PPT_TEMPLATES.classic;
let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Пісні</title><style>body{margin:0;padding:12px;background:#1a1a1a;font-family:Arial,sans-serif}.slide{width:800px;height:450px;margin:10px auto;padding:24px 40px;background:${t.bg};border-radius:4px;display:flex;flex-direction:column;justify-content:center;page-break-after:always}.title{color:${t.titleColor};font-size:24px;font-weight:700;font-family:${t.fontFamily};text-align:center}.author{color:rgba(255,255,255,0.3);font-size:12px;text-align:center;margin-bottom:6px}.verses{color:${t.textColor};font-size:16px;font-family:${t.fontFamily};line-height:1.5;text-align:center}.footer{color:rgba(255,255,255,0.06);font-size:12px;text-align:center;margin-top:8px}</style></head><body>`;
state.songs.forEach(s => {
html += `<div class="slide"><div class="title">${esc(s.title)}</div>${s.author ? '<div class="author">✍️ '+esc(s.author)+'</div>' : ''}<div class="verses">${esc(s.verses[0] || '').replace(/\n/g,'<br>')}</div><div class="footer">⛪ Церква Прага</div></div>`;
});
html += '</body></html>';
const win = window.open('', '_blank', 'width=900,height=700');
if(!win) { notify('Дозвольте спливаючі вікна'); return; }
win.document.write(html);
win.document.close();
win.focus();
win.print();
const status = $('#pptStatus');
if(status) status.textContent = '✓ PPTX експортовано';
}

function getAnimationCSS(type, dir) {
const t = {
fade: {transform:'translate(0,0) scale(1)', opacity:'0'},
slideLeft: {transform:'translate(-40px,0) scale(1)', opacity:'0'},
zoom: {transform:'translate(0,0) scale(0.5)', opacity:'0'},
none: {transform:'translate(0,0) scale(1)', opacity:'1'}
};
if(dir === 'out' && type !== 'none') {
if(type === 'fade') return {transform:'translate(0,0) scale(1)', opacity:'0'};
if(type === 'slideLeft') return {transform:'translate(40px,0) scale(1)', opacity:'0'};
if(type === 'zoom') return {transform:'translate(0,0) scale(1.5)', opacity:'0'};
}
return t[type] || t.fade;
}

function getCurrentContent() {
const payload = {html: '', ref: ''};
if(isActive('songs') && state.selectedSong) {
payload.html = state.selectedSong.verses[state.selectedVerseIdx] || '';
payload.ref = state.selectedSong.title;
} else if(isActive('bible')) {
payload.html = $('#bibleDisplay')?.textContent || '';
payload.ref = $('#bibleRef')?.textContent || '';
} else if(isActive('announce')) {
return {type: 'html', payload: {html: getAnnounceHTML({title: $('#annTitle')?.value, body: $('#annBody')?.value, datetime: $('#annDateTime')?.value, style: $('#annStyle')?.value}), ref: 'Оголошення'}};
} else {
payload.html = 'Контент не обрано';
}
return {type: 'text', payload};
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

function getH2RHTML() {
const s = H2R_STYLES[state.h2rConfig.style] || H2R_STYLES.classic;
const accent = state.h2rConfig.accent;
let bg = s.bg || 'rgba(10,10,26,0.92)';
if(bg.includes('var(--accent)')) bg = bg.replace(/var(--accent)/g, accent);
let border = s.border || 'none';
if(border.includes('var(--accent)')) border = border.replace(/var(--accent)/g, accent);
const anims = {slideLeft:'h2rSlideLeft', fade:'h2rFade', pop:'h2rPop', none:'none'};
const anim = anims[state.h2rConfig.animation] || 'h2rFade';
const dur = Math.min(state.h2rConfig.duration, 5);
const sc = state.h2rConfig.scale || 1;   // масштаб розміру титрів (повзунок)

return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{margin:0;background:transparent;width:100vw;height:100vh;overflow:hidden;font-family:${s.fontFamily};display:flex;align-items:flex-end;justify-content:flex-start}.wrap{background:${bg};border:${border};border-radius:${s.borderRadius};padding:${Math.round(14*sc)}px ${Math.round(20*sc)}px;margin:0 0 20px 20px;max-width:90%;animation:${anim} ${dur}s ease;}.line1{color:${state.h2rConfig.textColor};font-size:${Math.round(18*sc)}px;font-weight:700}.line2{color:${accent};font-size:${Math.round(12*sc)}px;margin-top:${Math.round(2*sc)}px}.line3{color:rgba(255,255,255,0.3);font-size:${Math.round(12*sc)}px;margin-top:${Math.round(2*sc)}px}.decor{position:absolute;bottom:-4px;left:0;right:0;height:${Math.max(3,Math.round(3*sc))}px;background:${accent};border-radius:0 0 4px 4px}@keyframes h2rSlideLeft{from{transform:translateX(-60px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes h2rFade{from{opacity:0}to{opacity:1}}@keyframes h2rPop{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:1}}</style></head><body><div class="wrap">${state.h2rConfig.line1 ? '<div class="line1">'+esc(state.h2rConfig.line1)+'</div>' : ''}${state.h2rConfig.line2 ? '<div class="line2">'+esc(state.h2rConfig.line2)+'</div>' : ''}${state.h2rConfig.line3 ? '<div class="line3">'+esc(state.h2rConfig.line3)+'</div>' : ''}<div class="decor"></div></div></body></html>`;
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


function loadFonts(input) {
const files = Array.from(input.files);
if(!files.length) return;
files.forEach(f => {
const r = new FileReader();
r.onload = function(e) {
const name = f.name.replace(/.[^.]+$/, '');
const blob = new Blob([e.target.result], {type: f.type});
const url = URL.createObjectURL(blob);
state.customFonts.push({name, url, file: f.name});
const style = document.createElement('style');
style.textContent = '@font-face{font-family:"' + name + '";src:url("' + url + '")}';
document.head.appendChild(style);
renderFontsList();
updateFontSelectors();
updateGraphicsFontList();   // новий шрифт одразу доступний у Графіці й Тексті
notify('🖋️ Шрифт "' + name + '" завантажено');
};
r.readAsArrayBuffer(f);
});
input.value = '';
}


function loadHotkeys() {
try { const d = loadJSON(STORAGE_KEYS.hotkeys); if(d) state.hotkeys = d; } catch(e) {}
if(!state.hotkeys || !Object.keys(state.hotkeys).length) {
state.hotkeys = {'next-verse':'Space','prev-verse':'ArrowLeft','send':'Enter','clear':'Escape'};
}
renderHotkeys();
}

// ============================================================
// MIDI-ТРИГЕРИ (Web MIDI API — вже є в Chromium/Electron,
// нічого не треба ставити чи компілювати нативно)
// ============================================================
const MIDI_ACTIONS = [
  { action: 'next',     label: '▶ Далі' },
  { action: 'prev',     label: '◀ Назад' },
  { action: 'go-live',  label: '📺 В ефір' },
  { action: 'clear',    label: '✕ Очистити' },
  { action: 'blackout', label: '⬛ Чорний екран' },
  { action: 'freeze',   label: '❄️ Заморозка' }
];
function loadMidiMap() {
  try { const d = loadJSON(STORAGE_KEYS.midiMap); if (d) state.midiMap = d; } catch (e) {}
}
function saveMidiMap() { saveJSON(STORAGE_KEYS.midiMap, state.midiMap); }

function initMidi() {
  if (!navigator.requestMIDIAccess) {
    notify('⚠️ Ця збірка Chromium не підтримує Web MIDI');
    return;
  }
  navigator.requestMIDIAccess().then(function (access) {
    state.midiInputs = Array.from(access.inputs.values()).map(i => i.name);
    access.inputs.forEach(function (input) {
      input.onmidimessage = onMidiMessage;
    });
    access.onstatechange = function () {
      state.midiInputs = Array.from(access.inputs.values()).map(i => i.name);
      Array.from(access.inputs.values()).forEach(input => { input.onmidimessage = onMidiMessage; });
      if (isActive('hotkeys')) renderTabInto('hotkeys');
    };
    if (isActive('hotkeys')) renderTabInto('hotkeys');
    notify('🎹 MIDI: знайдено пристроїв — ' + state.midiInputs.length);
  }).catch(function () { notify('⚠️ Немає доступу до MIDI (дозволь у браузері/системі)'); });
}
function onMidiMessage(e) {
  const [status, note, velocity] = e.data;
  const cmd = status & 0xf0;
  if (cmd !== 0x90 || !velocity) return;   // цікавить лише «нота натиснута» (note-on)
  const key = 'note:' + note;
  if (state.midiLearn) {
    state.midiMap[state.midiLearn] = key;
    state.midiLearn = null;
    saveMidiMap();
    renderTabInto('hotkeys');
    notify('🎹 Прив\'язано: нота ' + note);
    return;
  }
  const action = Object.keys(state.midiMap).find(a => state.midiMap[a] === key);
  if (action && typeof applyStationCommand === 'function') applyStationCommand({ action: action, from: 'MIDI' });
}
function midiStartLearn(action) {
  state.midiLearn = action;
  renderTabInto('hotkeys');
  notify('🎹 Натисни клавішу/пад на MIDI-контролері для «' + action + '»…');
}
function midiClear(action) {
  delete state.midiMap[action];
  saveMidiMap();
  renderTabInto('hotkeys');
}

// ============================================================
// OSC-ТРИГЕРИ (UDP, слухаємо адреси на порту 9000,
// прив'язуємо до дій, як MIDI)
// ============================================================
function loadOscMap() {
  if (window.electronAPI && window.electronAPI.oscGetMap) {
    window.electronAPI.oscGetMap().then(map => {
      state.oscMap = map || {};
      if (isActive('hotkeys')) renderTabInto('hotkeys');
    });
  }
}
function startOscServer() {
  if (!window.electronAPI) return;
  window.electronAPI.startOscServer().then(() => {
    state.oscRunning = true;
    if (isActive('hotkeys')) renderTabInto('hotkeys');
    notify('🎚️ OSC-сервер запущено на порту 9000');
  }).catch(() => notify('⚠️ Не вдалося запустити OSC-сервер'));
}
function stopOscServer() {
  if (!window.electronAPI) return;
  window.electronAPI.stopOscServer().then(() => {
    state.oscRunning = false;
    if (isActive('hotkeys')) renderTabInto('hotkeys');
    notify('🎚️ OSC-сервер зупинено');
  });
}
function oscStartLearn(action) {
  if (!window.electronAPI) return;
  state.oscLearn = action;
  window.electronAPI.oscLearn(action);
  renderTabInto('hotkeys');
  notify('🎚️ Чекаю OSC-адреси для «' + action + '» — надішли повідомлення з контролера…');
}
function oscClear(action) {
  if (!window.electronAPI) return;
  window.electronAPI.oscClear(action).then(() => {
    delete state.oscMap[action];
    renderTabInto('hotkeys');
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
    renderTabInto('hotkeys');
    notify('🎚️ Прив\'язано: ' + data.address + ' → ' + data.action);
  });
}

// ============================================================
// ЖИВІ СУБТИТРИ (Web Speech API — розпізнування мови
// з комп'ютерного мікрофона в реальному часі, офлайн)
// ============================================================
let _speechRecognition = null;
function initCaptions() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    notify('⚠️ Web Speech API недоступна в цій версії');
    return;
  }
  _speechRecognition = new SpeechRecognition();
  _speechRecognition.continuous = true;
  _speechRecognition.interimResults = true;
  _speechRecognition.lang = 'uk-UA'; // українська за замовчуванням
  
  _speechRecognition.onstart = () => {
    state.captions.listening = true;
    renderTabInto('layers');
    notify('🎤 Слухаємо мікрофон…');
  };
  _speechRecognition.onend = () => {
    state.captions.listening = false;
    renderTabInto('layers');
  };
  _speechRecognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i].transcript;
      if (event.results[i].isFinal) {
        final += transcript + ' ';
      } else {
        interim += transcript;
      }
    }
    if (final) {
      state.captions.text = (state.captions.text + ' ' + final).trim();
    }
    state.captions.interim = interim;
    // Передаємо текст у вихід
    const outputKind = state.captions.targetOutput || 1;
    if (window.electronAPI && window.electronAPI.sendToOutput) {
      window.electronAPI.sendToOutput(outputKind, 'captions', {
        text: state.captions.text,
        interim: state.captions.interim
      });
    }
  };
  _speechRecognition.onerror = (event) => {
    notify('⚠️ Помилка розпізнавання: ' + event.error);
  };
}
function startCaptions() {
  if (!_speechRecognition) initCaptions();
  if (!_speechRecognition) return;
  state.captions.enabled = true;
  state.captions.text = '';
  _speechRecognition.start();
}
function stopCaptions() {
  if (_speechRecognition) _speechRecognition.stop();
  state.captions.enabled = false;
  state.captions.listening = false;
  renderTabInto('layers');
}
function clearCaptions() {
  state.captions.text = '';
  state.captions.interim = '';
  renderTabInto('layers');
  if (window.electronAPI && window.electronAPI.sendToOutput) {
    window.electronAPI.sendToOutput(state.captions.targetOutput || 1, 'captions', { text: '', interim: '' });
  }
}
function setCaptionLang(lang) {
  if (_speechRecognition) _speechRecognition.lang = lang;
  renderTabInto('layers');
}
function setCaptionOutput(outputNum) {
  state.captions.targetOutput = outputNum || 1;
  renderTabInto('layers');
}

// ============================================================
// ХМАРНА СИНХРОНІЗАЦІЯ БІБЛІОТЕКИ (папка Dropbox/Google Drive/OneDrive)
// ============================================================
function pickCloudSyncFolder() {
  if (!window.electronAPI || !window.electronAPI.pickCloudSyncFolder) return;
  window.electronAPI.pickCloudSyncFolder().then(folder => {
    if (folder) {
      state.cloudSync.folder = folder;
      renderTabInto('settings');
      notify('☁️ Папка синхронізації: ' + folder);
    }
  });
}
function getCloudSyncFolder() {
  if (!window.electronAPI) return Promise.resolve(null);
  return window.electronAPI.getCloudSyncFolder().then(folder => {
    state.cloudSync.folder = folder;
    return folder;
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
  renderTabInto('settings');
}

function loadMediaFiles(input) {
const files = Array.from(input.files);
if(!files.length) return;
const UNSUP = ['mov','mkv','avi','wmv','flv','m4v','mpg','mpeg','3gp','ts','flac','wma','opus','aiff','heic','heif','tif','tiff'];
files.forEach(f => {
const ext = (String(f.name).split('.').pop() || '').toLowerCase();
// Непідтримувані (MOV/MKV/FLAC…) з відомим шляхом — конвертуємо й беремо file://
// (для відео dataURL і так завеликий; шлях економніший).
if (UNSUP.indexOf(ext) >= 0 && f.path && typeof pathToFileUrl === 'function' && typeof ensureSupportedMedia === 'function') {
ensureSupportedMedia(f.path, function(cpath) {
state.mediaFiles.push({name: f.name, type: f.type, data: pathToFileUrl(cpath)});
renderMediaList();
});
return;
}
const r = new FileReader();
r.onload = function(e) {
state.mediaFiles.push({name: f.name, type: f.type, data: e.target.result});
renderMediaList();
};
r.readAsDataURL(f);
});
}


function loadPlaylist() {
try {
const saved = loadJSON(STORAGE_KEYS.playlistSaved) || [];
if(!saved.length) { notify('Немає'); return; }
const names = saved.map((p, i) => (i+1) + '. ' + p.name);
pv2Prompt('Введи номер плейлиста:\n' + names.join('\n'), function(choice){
if(choice) {
const idx = parseInt(choice) - 1;
if(idx >= 0 && idx < saved.length) {
state.playlist = saved[idx].items || [];
state.playlistIndex = 0;
savePlaylistData();
renderPlaylist();
const status = $('#playlistStatus');
if(status) status.textContent = '● Завантажено: ' + saved[idx].name;
}
}
});
} catch(e) {}
}

function loadPlaylistData() {
try { const data = loadJSON(STORAGE_KEYS.playlist); if(Array.isArray(data)) state.playlist = data; } catch(e) { state.playlist = []; }
renderPlaylist();
}

function loadStageNotes() {
const notes = loadJSON(STORAGE_KEYS.stageNotes) || '';
const el = $('#stageNotes');
if(el) el.value = notes;
updateStageDisplay();
}

function loadStatistics() {
try { const d = loadJSON(STORAGE_KEYS.statistics); if(d) state.statsData = d; } catch(e) {}
updateStatistics();
}


function loadYouTube() {
const url = $('#youtubeUrl')?.value?.trim() || '';
if(!url) { notify('Введіть посилання'); return; }
const vid = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[&?]|$)/);
if(!vid) { notify('Невірне посилання'); return; }
const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="https://www.youtube-nocookie.com/embed/${vid[1]}?autoplay=1&playsinline=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="origin"></iframe></body></html>`;
doSendHTML(html, 'YouTube');
const status = $('#youtubeStatus');
if(status) status.textContent = '✓ Відправлено';
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

async function openStageDisplay() {
if(!window.electronAPI || !window.electronAPI.openStageWindow) { notify('Stage Display недоступний'); return; }
if(state.stageDisplayOpen) {
  updateStageDisplay();
  return;
}
await window.electronAPI.openStageWindow();
state.stageDisplayOpen = true;
const status = $('#stageStatus');
if(status) status.textContent = '✓ Stage Display відкрито';
updateStageDisplay();
}


function playMedia(i) {
state.currentMediaIndex = i;
const f = state.mediaFiles[i];
if(!f) return;
const v = $('#videoPlayer');
const a = $('#audioPlayer');
const p = $('#mediaPlaceholder');
if(!v || !a || !p) return;
if(f.type.startsWith('video')) {
v.style.display = 'block';
a.style.display = 'none';
p.style.display = 'none';
v.src = f.data;
v.load();
v.play();
state.mediaPlayer = v;
} else {
a.style.display = 'block';
v.style.display = 'none';
p.style.display = 'none';
a.src = f.data;
a.load();
a.play();
state.mediaPlayer = a;
}
if(state.mediaPlayer) {
state.mediaPlayer.ontimeupdate = function() {
const c = fmtTime(state.mediaPlayer.currentTime);
const t = fmtTime(state.mediaPlayer.duration || 0);
const timeEl = $('#mediaTime');
if(timeEl) timeEl.textContent = c + '/' + t;
};
}
}

function playlistNext() {
if(state.playlistIndex < state.playlist.length - 1) {
state.playlistIndex++;
sendPlaylistItem(state.playlistIndex);
if($('#playlistAutoMode')?.value === 'timer') startPlaylistTimer();
} else {
const status = $('#playlistStatus');
if(status) status.textContent = '● Кінець';
}
}

function playlistPrev() {
if(state.playlistIndex > 0) { state.playlistIndex--; sendPlaylistItem(state.playlistIndex); }
}

function playlistSendCurrent() { if(state.playlist.length && state.playlist[state.playlistIndex]) sendPlaylistItem(state.playlistIndex); }

function pptNextPreview() {
if(state.pptPreviewIndex < state.songs.length - 1) { state.pptPreviewIndex++; renderPPTPreview(); }
}

function pptPrevPreview() {
if(state.pptPreviewIndex > 0) { state.pptPreviewIndex--; renderPPTPreview(); }
}

function previewAnimation() {
const text = $('#animPreviewText');
if(!text) return;
const entry = getAnimationCSS(state.animSettings.entry, 'in');
text.style.transition = 'all ' + state.animSettings.speed + 'ms ease';
text.style.opacity = '0';
text.style.transform = entry.transform;
setTimeout(() => {
text.style.opacity = '1';
text.style.transform = 'translate(0,0) scale(1)';
}, 80);
setTimeout(() => {
const exit = getAnimationCSS(state.animSettings.exit, 'out');
text.style.opacity = '0';
text.style.transform = exit.transform;
}, state.animSettings.speed + 1000);
}


function previewPlaylistItem(i) {
const item = state.playlist[i];
if(!item) return;
const p = $('#playlistPreview');
if(p) { p.textContent = item.ref + ' (' + item.type + ')'; p.style.color = '#fff'; }
}

function removeFont(i) {
state.customFonts.splice(i, 1);
renderFontsList();
updateFontSelectors();
}

function removeMedia(i) {
state.mediaFiles.splice(i, 1);
if(state.currentMediaIndex === i) {
state.currentMediaIndex = -1;
const v = $('#videoPlayer');
const a = $('#audioPlayer');
const p = $('#mediaPlaceholder');
if(v) v.style.display = 'none';
if(a) a.style.display = 'none';
if(p) p.style.display = 'block';
}
renderMediaList();
}


function removePlaylistItem(i) { state.playlist.splice(i, 1); savePlaylistData(); renderPlaylist(); if(state.playlistIndex >= state.playlist.length) state.playlistIndex = Math.max(0, state.playlist.length - 1); }

function renderAnimationsTab() {
return `<div class="card"><div class="card-title">🎨 Анімації</div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:3px"> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Вхід</div><select id="animEntry" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="updateAnimationPreview()"><option value="fade">Fade</option><option value="slideLeft">Slide</option><option value="zoom">Zoom</option><option value="none">Немає</option></select></div> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Вихід</div><select id="animExit" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="updateAnimationPreview()"><option value="fade">Fade</option><option value="slideLeft">Slide</option><option value="zoom">Zoom</option><option value="none">Немає</option></select></div> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Швидкість</div><input type="range" id="animSpeed" min="100" max="2000" value="500" style="width:100%" oninput="document.getElementById('animSpeedVal').textContent=this.value+'ms';updateAnimationPreview()"><div style="font-size:11px;color:var(--text2)"><span id="animSpeedVal">500ms</span></div></div></div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-primary btn-sm" onclick="applyAnimations()">💾</button><button class="btn btn-ghost btn-sm" onclick="resetAnimations()">↺</button><button class="btn btn-ghost btn-sm" onclick="previewAnimation()">▶</button></div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px"><div id="animPreviewBox" style="aspect-ratio:16/9;background:#0a1628;border-radius:2px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);overflow:hidden;position:relative"><div id="animPreviewText" style="color:#fff;font-size:14px;font-family:Georgia,serif;text-shadow:0 2px 6px rgba(0,0,0,0.5);padding:4px;text-align:center;transition:all 0.5s ease">🎨 Анімація</div></div> <div><div style="font-size:11px;color:var(--text2)">Пресети</div><div class="flex"><button class="btn btn-ghost btn-sm" onclick="applyPresetAnim('gentle')" style="font-size:11px;padding:4px 7px">🌊</button><button class="btn btn-ghost btn-sm" onclick="applyPresetAnim('fast')" style="font-size:11px;padding:4px 7px">🚀</button></div></div></div></div>`;
}

function renderFontsList() {
const c = $('#fontsList');
if(!c) return;
if(!state.customFonts.length) { c.innerHTML = '<p class="text-muted">Немає</p>'; return; }
let html = '';
state.customFonts.forEach((f, i) => {
html += `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="font-family:'${f.name}'">${esc(f.name)}</span><button class="btn btn-danger btn-sm" onclick="removeFont(${i})" style="font-size:11px;padding:2px 6px">✕</button></div>`;
});
c.innerHTML = html;
}

function renderFontsTab() {
return `<div class="card"><div class="card-title">🎨 Шрифти</div> <div onclick="document.getElementById('fontInput').click()" style="padding:4px;border:1px dashed var(--border);border-radius:2px;text-align:center;cursor:pointer"><input type="file" id="fontInput" accept=".ttf,.otf,.woff" multiple style="display:none" onchange="loadFonts(this)"><div style="font-size:14px">🖋️</div><div style="font-size:11px;color:var(--text)">Завантажити</div></div> <div id="fontsList" style="max-height:80px;overflow-y:auto;font-size:11px;color:var(--text)"><p class="text-muted">Немає</p></div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-top:3px"><select id="fontSongs" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="applyFontSettings()"><option value="Georgia, serif">Georgia</option></select><select id="fontBible" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="applyFontSettings()"><option value="Georgia, serif">Georgia</option></select><select id="fontHeaders" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="applyFontSettings()"><option value="Georgia, serif">Georgia</option></select></div> <button class="btn btn-primary btn-sm" onclick="applyFontSettings()">✓</button> <div id="fontPreview" style="margin-top:3px;background:var(--bg);border-radius:2px;padding:4px;text-align:center;font-size:12px;color:var(--text)"><div id="fontPreviewText" style="font-family:Georgia,serif">Аа Бб Вв</div></div></div>`;
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
  renderTabInto('graphics');
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
      <div class="card">
        <div class="card-title">👁 Як це виглядатиме на екрані</div>
        <div style="position:relative;width:100%;aspect-ratio:16/9;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#000">
          <iframe id="graphicsPreviewFrame" style="position:absolute;top:0;left:0;width:1920px;height:1080px;border:0;transform:scale(0.28);transform-origin:top left;pointer-events:none"></iframe>
        </div>
        <div class="card-sub" style="margin-top:6px">Прев'ю показує точно той HTML, що піде на екран — у справжньому масштабі 1920×1080.</div>
      </div>

      <div class="card">
        <div class="card-title">▶ Вивід</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="sendGraphicsToAll()">На всі екрани</button>
          <button class="btn btn-ghost btn-sm" onclick="sendGraphicsToOutput(1)">${OUT_NAME[1]}</button>
          <button class="btn btn-ghost btn-sm" onclick="sendGraphicsToOutput(2)">${OUT_NAME[2]}</button>
          <button class="btn btn-ghost btn-sm" onclick="sendGraphicsToOutput(3)">${OUT_NAME[3]}</button>
          <button class="btn btn-ghost btn-sm" onclick="sendGraphicsToOutput(4)">${OUT_NAME[4]}</button>
        </div>
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
  renderTabInto('graphics');
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
  renderTabInto('graphics');
  updateGraphicsPreview();
}
function setGraphicsStyleFlag(key, on) {
  state.graphicsSettings[key] = !!on;
  persistGraphicsSettings();
  renderTabInto('graphics');
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
  renderTabInto('graphics');
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
return `<div class="grid2"><div> <div class="card"><div class="card-title">📺 Lower Third</div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-bottom:2px"><input type="text" id="h2rLine1" placeholder="Текст 1" value="Олександр" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:12px;outline:none" oninput="updateH2RPreview()"><input type="text" id="h2rLine2" placeholder="Текст 2" value="Проповідник" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:12px;outline:none" oninput="updateH2RPreview()"><input type="text" id="h2rLine3" placeholder="Текст 3" value="Церква Прага" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:12px;outline:none" oninput="updateH2RPreview()"><select id="h2rStyle" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="updateH2RPreview()"><option value="classic">Класичний</option><option value="modern">Сучасний</option><option value="elegant">Елегантний</option><option value="neon">Неоновий</option></select></div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:2px"><input type="color" id="h2rAccent" value="#7c6af7" style="width:100%;height:22px;border:none;border-radius:2px;cursor:pointer;background:none" oninput="updateH2RPreview()"><input type="color" id="h2rTextColor" value="#ffffff" style="width:100%;height:22px;border:none;border-radius:2px;cursor:pointer;background:none" oninput="updateH2RPreview()"><select id="h2rAnimation" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="updateH2RPreview()"><option value="slideLeft">Slide</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="none">Немає</option></select></div> <div style="margin-bottom:2px"><span style="font-size:11px;color:var(--text2)">Розмір титрів: <b id="h2rScaleLabel">${Math.round((state.h2rConfig.scale||2)*100)}%</b></span><input type="range" id="h2rScale" min="100" max="400" value="${Math.round((state.h2rConfig.scale||2)*100)}" oninput="updateH2RPreview()" style="width:100%"></div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-success btn-sm" onclick="sendH2RLowerThird()">▶</button><button class="btn btn-primary btn-sm" onclick="saveH2RTemplate()">💾</button><button class="btn btn-ghost btn-sm" onclick="clearH2R()">✕</button></div> <div class="flex"><span style="font-size:11px;color:var(--text2)">Пресети:</span><button class="btn btn-ghost btn-sm" onclick="applyH2RPreset('speaker')" style="font-size:11px;padding:4px 7px">🎤</button><button class="btn btn-ghost btn-sm" onclick="applyH2RPreset('worship')" style="font-size:11px;padding:4px 7px">🙏</button><button class="btn btn-ghost btn-sm" onclick="applyH2RPreset('bible')" style="font-size:11px;padding:4px 7px">📖</button></div> </div></div><div> <div class="card"><div class="card-title">👁 Прев\'ю H2R</div> <div id="h2rPreviewBox" style="aspect-ratio:16/9;background:#0a0a1a;border-radius:3px;border:1px solid var(--border);position:relative;overflow:hidden"> <div id="h2rPreviewContent" style="width:100%;height:100%;display:flex;align-items:center;padding:12px;color:#fff;font-family:Georgia,serif;font-size:12px;line-height:1.3;text-align:center;justify-content:center;flex-direction:column"> <div id="h2rPreviewLine1" style="font-size:16px;font-weight:700;margin-bottom:2px">Олександр</div> <div id="h2rPreviewLine2" style="font-size:12px;color:#c8a84b">Проповідник</div> <div id="h2rPreviewLine3" style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:2px">Церква Прага</div> <div id="h2rPreviewDecor" style="position:absolute;bottom:0;left:0;right:0;height:2px;background:#7c6af7;border-radius:0 0 3px 3px"></div></div></div></div> </div></div>
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
}

function renderMidiCard() {
  const rows = MIDI_ACTIONS.map(a => {
    const bound = state.midiMap[a.action];
    const learning = state.midiLearn === a.action;
    return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">
      <span style="font-size:11px;flex:1">${a.label}</span>
      <button class="btn ${learning ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="midiStartLearn('${a.action}')">
        ${learning ? '⏺ Чекаю ноту…' : (bound ? bound.replace('note:', 'нота ') : 'Призначити')}
      </button>
      ${bound ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="midiClear('${a.action}')">✕</button>` : ''}
    </div>`;
  }).join('');
  const oscRows = MIDI_ACTIONS.map(a => {
    const bound = state.oscMap[a.action];
    const learning = state.oscLearn === a.action;
    return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">
      <span style="font-size:11px;flex:1">${a.label}</span>
      <button class="btn ${learning ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="oscStartLearn('${a.action}')">
        ${learning ? '⏺ Чекаю адресу…' : (bound ? bound : 'Призначити')}
      </button>
      ${bound ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="oscClear('${a.action}')">✕</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="card" style="margin-top:10px">
    <div class="card-title">🎹 MIDI & 🎚️ OSC тригери</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-size:11px;color:var(--text);font-weight:bold;margin-bottom:4px">🎹 MIDI (Web MIDI API)</div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
          Пристрої: ${state.midiInputs.length ? esc(state.midiInputs.join(', ')) : 'не підключено'}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="initMidi()">🔌 Оновити</button>
        <div style="margin-top:8px;max-width:350px">${rows}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text);font-weight:bold;margin-bottom:4px">🎚️ OSC (UDP :9000)</div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
          ${state.oscRunning ? '<span style="color:var(--green)">✓ Слухаємо</span>' : 'зупинено'}
        </div>
        <div style="display:flex;gap:4px;margin-bottom:8px">
          <button class="btn ${state.oscRunning ? 'btn-ghost' : 'btn-primary'} btn-sm" onclick="startOscServer()">▶ Запустити</button>
          <button class="btn btn-ghost btn-sm" onclick="stopOscServer()">⏹ Стоп</button>
        </div>
        <div style="margin-top:8px;max-width:350px">${oscRows}</div>
      </div>
    </div>
  </div>`;
}
function renderHotkeysTab() {
return `<div class="card"><div class="card-title">⌨️ Гарячі клавіші</div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;max-width:350px"><div style="font-size:11px;color:var(--text2);padding:1px">Дія</div><div style="font-size:11px;color:var(--text2);padding:1px">Клавіша</div> <div style="font-size:11px;padding:1px">▶ Куплет</div><div><input type="text" class="hotkey-input" data-action="next-verse" value="Space" readonly style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;cursor:pointer;text-align:center" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">◀ Куплет</div><div><input type="text" class="hotkey-input" data-action="prev-verse" value="ArrowLeft" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">📺 Відправити</div><div><input type="text" class="hotkey-input" data-action="send" value="Enter" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">✕ Очистити</div><div><input type="text" class="hotkey-input" data-action="clear" value="Escape" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">⬛ Чорний екран</div><div><input type="text" class="hotkey-input" data-action="blackout" value="B" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">↶ Скасувати</div><div><input type="text" class="hotkey-input" data-action="undo" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">📢 Нижня третина</div><div><input type="text" class="hotkey-input" data-action="lower" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">❄️ Заморозка</div><div><input type="text" class="hotkey-input" data-action="freeze" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div></div> <div class="flex" style="margin-top:3px"><button class="btn btn-primary btn-sm" onclick="saveHotkeyProfile()">💾</button><button class="btn btn-ghost btn-sm" onclick="resetHotkeys()">↺</button></div> <div id="hotkeyStatus" class="text-muted mt8"></div></div>` + renderMidiCard();
}

function renderMediaList() {
const c = $('#mediaList');
if(!c) return;
if(!state.mediaFiles.length) { c.innerHTML = '<p class="text-muted">Немає</p>'; return; }
let html = '';
state.mediaFiles.forEach((f, i) => {
const icon = f.type.startsWith('video') ? '🎬' : '🎵';
html += `<div style="display:flex;align-items:center;gap:2px;padding:4px 7px;border-bottom:1px solid var(--border);font-size:11px"> <span>${icon}</span><span style="flex:1;cursor:pointer" onclick="playMedia(${i})">${esc(f.name)}</span> <button class="btn btn-success btn-sm" onclick="playMedia(${i})" style="font-size:11px;padding:2px 6px">▶</button> <button class="btn btn-danger btn-sm" onclick="removeMedia(${i})" style="font-size:11px;padding:2px 6px">✕</button> </div>`;
});
c.innerHTML = html;
}

function renderMediaTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">🎬 Завантажити</div> <div onclick="document.getElementById('mediaInput').click()" style="padding:4px;border:1px dashed var(--border);border-radius:2px;text-align:center;cursor:pointer"><input type="file" id="mediaInput" accept="video/*,audio/*,.mp4,.webm,.mov,.mkv,.avi,.wmv,.flv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.m2v,.vob,.divx,.asf,.mxf,.mp3,.wav,.m4a,.aac,.ogg,.flac,.wma,.opus,.aiff,.aif,.amr,.ac3,.m4b" multiple style="display:none" onchange="loadMediaFiles(this)"><div style="font-size:16px">🎬</div><div style="font-size:11px;color:var(--text)">Відео/аудіо</div></div> <div id="mediaList" style="max-height:60px;overflow-y:auto"><p class="text-muted">Немає</p></div></div> <div class="card"><div class="card-title">🎵 YouTube</div> <div class="flex"><input type="text" id="youtubeUrl" placeholder="https://youtube.com/..." style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 3px;color:var(--text);font-size:12px;outline:none"><button class="btn btn-primary btn-sm" onclick="loadYouTube()">▶</button></div> <div id="youtubeStatus" class="text-muted mt8"></div></div> </div><div> <div class="card"><div class="card-title">▶ Програвач</div> <div id="mediaPlayer" style="aspect-ratio:16/9;background:#000;border-radius:2px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border)"><video id="videoPlayer" style="width:100%;height:100%;display:none" controls></video><audio id="audioPlayer" style="width:100%;display:none" controls></audio><div id="mediaPlaceholder" style="color:var(--text2);font-size:12px">Оберіть файл</div></div> <div class="flex" style="margin-top:2px"><button class="btn btn-success btn-sm" onclick="sendMediaToProjector()">📺</button><button class="btn btn-ghost btn-sm" onclick="toggleMediaPlay()">▶⏸</button><button class="btn btn-ghost btn-sm" onclick="stopMedia()">⏹</button><span id="mediaTime" class="text-muted" style="font-size:11px;padding:2px">00:00/00:00</span></div> </div></div>`;
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


function renderPlaylist() {
const c = $('#playlistItems');
if(!c) return;
if(!state.playlist.length) {
c.innerHTML = '<p class="text-muted" style="text-align:center;padding:4px">Черга порожня</p>';
const preview = $('#playlistPreview');
const counter = $('#playlistCounter');
if(preview) preview.textContent = 'Черга порожня';
if(counter) counter.textContent = '0/0';
return;
}
const icons = {song:'🎵', bible:'📖', announce:'📢', text:'📄', html:'💻'};
let html = '<div style="display:flex;flex-direction:column;gap:1px;max-height:100px;overflow-y:auto">';
state.playlist.forEach((item, i) => {
const icon = icons[item.type] || '📄';
const isActive = i === state.playlistIndex;
const bg = isActive ? 'var(--panel)' : 'var(--bg)';
const border = isActive ? '1px solid var(--accent)' : '1px solid var(--border)';
html += `<div style="display:flex;align-items:center;gap:2px;background:${bg};border:${border};border-radius:2px;padding:4px 7px;font-size:11px"> <span>${icon}</span><span style="color:var(--text2);font-size:11px;min-width:12px">${item.type}</span> <span style="flex:1;color:var(--text);cursor:pointer" onclick="previewPlaylistItem(${i})">${esc(item.ref.substring(0,12))}</span> ${isActive ? '<span style="color:var(--green);font-size:11px">●</span>' : ''} <button class="btn btn-ghost btn-sm" onclick="movePlaylistItem(${i},-1)" style="font-size:11px;padding:2px 6px">↑</button> <button class="btn btn-ghost btn-sm" onclick="movePlaylistItem(${i},1)" style="font-size:11px;padding:2px 6px">↓</button> <button class="btn btn-success btn-sm" onclick="sendPlaylistItem(${i})" style="font-size:11px;padding:2px 6px">▶</button> <button class="btn btn-danger btn-sm" onclick="removePlaylistItem(${i})" style="font-size:11px;padding:2px 6px">✕</button> </div>`;
});
html += '</div>';
c.innerHTML = html;
const counter = $('#playlistCounter');
if(counter) counter.textContent = (state.playlistIndex + 1) + '/' + state.playlist.length;
const preview = $('#playlistPreview');
if(preview && state.playlist[state.playlistIndex]) { preview.textContent = state.playlist[state.playlistIndex].ref; preview.style.color = '#fff'; }
}

function renderPlaylistTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">📋 Черга</div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-success btn-sm" onclick="addCurrentToPlaylist()">➕</button><button class="btn btn-primary btn-sm" onclick="runPlaylist()">▶</button><button class="btn btn-danger btn-sm" onclick="clearPlaylist()">✕</button><button class="btn btn-ghost btn-sm" onclick="savePlaylist()">💾</button><button class="btn btn-ghost btn-sm" onclick="loadPlaylist()">📂</button></div> <div id="playlistItems" style="min-height:30px;border:1px dashed var(--border);border-radius:2px;padding:2px"><p class="text-muted" style="text-align:center;padding:4px">Черга порожня</p></div> <div class="flex" style="margin-top:2px"><span style="font-size:11px;color:var(--text2)">Авто:</span><select id="playlistAutoMode" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none"><option value="off">Вимк</option><option value="timer">Таймер</option></select><input type="number" id="playlistTimer" value="10" style="width:24px;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none"><span style="font-size:11px;color:var(--text2)">сек</span><span id="playlistStatus" style="font-size:11px;color:var(--green)">● Стоп</span></div></div> </div><div> <div class="card"><div class="card-title">👁 Прев\'ю</div> <div class="preview-box" style="height:40px"><div class="preview-text" id="playlistPreview" style="color:#444;font-size:11px">Черга порожня</div></div> <div class="flex" style="margin-top:2px"><button class="btn btn-ghost btn-sm" onclick="playlistPrev()">◀</button><button class="btn btn-ghost btn-sm" onclick="playlistNext()">▶</button><button class="btn btn-success btn-sm" onclick="playlistSendCurrent()">📺</button></div> <div class="text-muted mt8" id="playlistCounter">0/0</div></div> </div></div>`;
}

function renderPowerPointTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">📊 Експорт</div> <div class="flex" style="margin-bottom:2px"><span style="font-size:11px;color:var(--text2)">Шаблон:</span><button class="btn btn-ghost btn-sm" onclick="setPPTtemplate('classic')" id="pptTemplateClassic" style="border:1px solid var(--accent)">📜</button><button class="btn btn-ghost btn-sm" onclick="setPPTtemplate('modern')" id="pptTemplateModern">✨</button><button class="btn btn-ghost btn-sm" onclick="setPPTtemplate('dark')" id="pptTemplateDark">🌑</button></div> <div class="flex"><button class="btn btn-primary" onclick="exportToPPTX()">⬇ PPTX</button><button class="btn btn-ghost btn-sm" onclick="exportToHTML()">🌐</button></div> <div id="pptStatus" class="text-muted mt8"></div></div> </div><div> <div class="card"><div class="card-title">👁 Прев\'ю</div> <div id="pptPreview" style="aspect-ratio:16/9;background:linear-gradient(135deg,#0a1628,#1e3a5f);border-radius:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--border);padding:6px;text-align:center"> <div id="pptPreviewTitle" style="color:#f0c040;font-size:12px;font-weight:700">Назва пісні</div> <div id="pptPreviewAuthor" style="color:rgba(255,255,255,0.3);font-size:11px">Автор</div> <div id="pptPreviewVerses" style="color:#fff;font-size:12px;line-height:1.2;margin-top:2px">Текст куплету</div></div> <div class="flex" style="margin-top:2px"><button class="btn btn-ghost btn-sm" onclick="pptPrevPreview()">◀</button><button class="btn btn-ghost btn-sm" onclick="pptNextPreview()">▶</button><span class="text-muted" id="pptPreviewCounter" style="font-size:11px;padding:1px">1/1</span></div></div> </div></div>`;
}

// Прив'язка Stage Monitor до конкретного фізичного монітора — за «відбитком»,
// щоб пережити перезапуск Windows (там id моніторів після ребута інші).
// Той самий підхід, що й у bindOutputToDisplay()/loadOutputBindings() для
// звичайних 4 виходів (extras-3.js), але без OUT_KIND/OUT_NAME — сцена не
// входить у ту систему.
function renderStageMonitorOptions() {
  const sel = $('#stageMonitorSelect');
  if (!sel) return;
  const displays = state.displays || [];
  if (!displays.length) { sel.innerHTML = '<option value="">Монітори не знайдені — відкрий «Прив\'язка екранів»</option>'; return; }
  sel.innerHTML = '<option value="">Авто (перший вільний монітор)</option>' + displays.map(d =>
    `<option value="${d.id}">${d.num}. ${d.width}×${d.height}${d.isPrimary ? ' (основний)' : ''}${d.isOperator ? ' (оператор)' : ''}</option>`
  ).join('');
  if (state.stageMonitorId) sel.value = String(state.stageMonitorId);
}

function setStageMonitor() {
  const sel = $('#stageMonitorSelect');
  if (!sel) return;
  const id = sel.value ? parseInt(sel.value, 10) : null;
  const d = (state.displays || []).find(x => x.id === id);
  state.stageMonitorId = id;
  state.stageMonitorFingerprint = d ? d.fingerprint : null;
  saveJSON(STORAGE_KEYS.stageMonitor, state.stageMonitorFingerprint);
  if (window.electronAPI && window.electronAPI.setStageMonitor) window.electronAPI.setStageMonitor(id);
  notify(id ? '🖥 Монітор сцени встановлено' : 'Монітор сцени: авто');
}

function loadStageMonitorBinding() {
  const fp = loadJSON(STORAGE_KEYS.stageMonitor);
  if (!fp || !window.electronAPI || !window.electronAPI.bindStageMonitorFingerprint) return;
  state.stageMonitorFingerprint = fp;
  window.electronAPI.bindStageMonitorFingerprint(fp).then(res => {
    if (res && res.id) { state.stageMonitorId = res.id; renderStageMonitorOptions(); }
  }).catch(() => {});
}

function renderStageTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">🖥 Stage Display</div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-primary btn-sm" onclick="openStageDisplay()">📺 Відкрити</button><button class="btn btn-ghost btn-sm" onclick="closeStageDisplay()">✕</button><button class="btn btn-ghost btn-sm" onclick="updateStageDisplay()">🔄</button></div> <div id="stageStatus" class="text-muted mt8"></div></div> <div class="card"><div class="card-title">🖥 Монітор сцени</div><div class="card-sub">Окреме вікно (не проектор і не трансляція) — вибери фізичний монітор, на якому воно з'явиться.</div><select id="stageMonitorSelect" onchange="setStageMonitor()" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:3px 4px;color:var(--text);font-size:12px;outline:none;margin-top:4px"><option value="">Авто (перший вільний монітор)</option></select></div> <div class="card"><div class="card-title">📝 Нотатки</div><textarea id="stageNotes" placeholder="Нотатки..." style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:12px;outline:none;min-height:24px;resize:vertical;font-family:inherit"></textarea><div class="flex" style="margin-top:2px"><button class="btn btn-ghost btn-sm" onclick="saveStageNotes()">💾</button><button class="btn btn-ghost btn-sm" onclick="loadStageNotes()">📂</button></div></div> </div><div> <div class="card"><div class="card-title">👁 Прев\'ю</div> <div id="stagePreview" style="aspect-ratio:16/9;background:linear-gradient(135deg,#0a0a1a,#1a1a3e);border-radius:2px;border:1px solid var(--border);padding:6px;display:flex;flex-direction:column;justify-content:space-between;position:relative"> <div style="display:flex;justify-content:space-between"><div style="color:#c8a84b;font-size:12px;font-weight:700">⛪</div><div style="color:rgba(255,255,255,0.15);font-size:12px;font-family:monospace" id="stagePreviewClock">12:00</div></div> <div style="text-align:center;padding:2px 0"><div style="color:rgba(255,255,255,0.15);font-size:11px">Поточний</div><div style="color:#fff;font-size:12px;font-family:Georgia,serif" id="stagePreviewCurrent">Бо так возлюбив Бог...</div></div> <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:2px"><div style="color:rgba(255,255,255,0.15);font-size:11px">▶ Наступний</div><div style="color:rgba(255,255,255,0.3);font-size:12px;font-family:Georgia,serif" id="stagePreviewNext">Великий Бог...</div></div> <div style="position:absolute;bottom:3px;right:6px;color:rgba(255,255,255,0.08);font-size:11px" id="stagePreviewTimer">⏱ 10:00</div></div></div> </div></div>`;
}

function renderStatisticsTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">📊 Статистика</div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:3px"><div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Всього</div><div id="statTotalOutputs" style="font-size:12px;font-weight:700;color:var(--accent)">0</div></div><div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Найчастіше</div><div id="statMostUsed" style="font-size:12px;font-weight:700;color:var(--gold)">—</div></div><div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Активність</div><div id="statActivity" style="font-size:12px;font-weight:700;color:var(--green)">0%</div></div></div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-ghost btn-sm" onclick="updateStatistics()">🔄</button><button class="btn btn-ghost btn-sm" onclick="exportStatisticsExcel()">⬇ Excel</button><select id="statPeriod" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:1px 2px;color:var(--text);font-size:11px;outline:none" onchange="updateStatistics()"><option value="day">День</option><option value="week">Тиждень</option><option value="month">Місяць</option><option value="year">Рік</option></select></div> <div id="statChart" style="background:var(--bg);border-radius:2px;padding:3px;height:35px;display:flex;align-items:flex-end;gap:1px;justify-content:space-between"><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:6px;background:var(--accent);border-radius:1px;opacity:0.3"></div><div style="font-size:11px;color:var(--text2)">Пн</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:12px;background:var(--accent);border-radius:1px;opacity:0.5"></div><div style="font-size:11px;color:var(--text2)">Вт</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:18px;background:var(--accent);border-radius:1px;opacity:0.7"></div><div style="font-size:11px;color:var(--text2)">Ср</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:24px;background:var(--accent);border-radius:1px;opacity:0.9"></div><div style="font-size:11px;color:var(--text2)">Чт</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:30px;background:var(--accent);border-radius:1px;opacity:1"></div><div style="font-size:11px;color:var(--text2)">Пт</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:18px;background:var(--gold);border-radius:1px;opacity:0.7"></div><div style="font-size:11px;color:var(--text2)">Сб</div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px"><div style="width:100%;height:8px;background:var(--gold);border-radius:1px;opacity:0.4"></div><div style="font-size:11px;color:var(--text2)">Нд</div></div></div> </div></div><div> <div class="card"><div class="card-title">🎵 Топ пісень</div><div id="statTopSongs"><p class="text-muted">Немає</p></div></div> <div class="card"><div class="card-title">📖 Топ віршів</div><div id="statTopBible"><p class="text-muted">Немає</p></div></div> </div></div>`;
}


function renderTextControlTab() {
const t = state.textSettings[state.currentTextOutput === 'all' ? 1 : state.currentTextOutput] || state.textSettings[1];
return `<div class=\"card\"><div class=\"card-title\">🔤 Шрифт</div><select id=\"textFont\" onchange=\"setTextFont(this.value)\" style=\"width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none\"></select><div class=\"card-sub\">Свої шрифти додаються у вкладці «Шрифти».</div></div> <div class="card"><div class="card-title">📝 Управління текстом</div> <div class="flex" style="margin-bottom:3px"><span style="font-size:11px;color:var(--text2)">Екран:</span><button class="btn btn-primary btn-sm" id="textOutput1" onclick="setTextOutput(1)" style="font-size:11px;padding:1px 5px;border:1px solid var(--accent)">1</button><button class="btn btn-ghost btn-sm" id="textOutput2" onclick="setTextOutput(2)" style="font-size:11px;padding:1px 5px">2</button><button class="btn btn-ghost btn-sm" id="textOutput3" onclick="setTextOutput(3)" style="font-size:11px;padding:1px 5px">3</button><button class="btn btn-ghost btn-sm" id="textOutput4" onclick="setTextOutput(4)" style="font-size:11px;padding:1px 5px">4</button><button class="btn btn-ghost btn-sm" id="textOutputAll" onclick="setTextOutput('all')" style="font-size:11px;padding:1px 5px">Всі</button></div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:3px"> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Розмір</div><div class="flex" style="justify-content:center"><button class="btn btn-ghost btn-sm" onclick="changeTextSize(-5)">−</button><span id="textSizeDisplay" style="font-size:12px;font-weight:700;min-width:24px;text-align:center;color:var(--accent)">58</span><button class="btn btn-ghost btn-sm" onclick="changeTextSize(5)">+</button></div><input type="range" id="textSizeSlider" min="12" max="150" value="58" style="width:100%;margin-top:1px" oninput="updateTextSize(this.value)"></div> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Позиція</div><div class="flex" style="justify-content:center;gap:1px"><button class="btn btn-ghost btn-sm" onclick="setTextPosition('top-left')" style="font-size:11px;padding:1px 2px">↖</button><button class="btn btn-ghost btn-sm" onclick="setTextPosition('center')" style="font-size:11px;padding:1px 2px;border:1px solid var(--accent)">●</button><button class="btn btn-ghost btn-sm" onclick="setTextPosition('bottom-center')" style="font-size:11px;padding:1px 2px">↓</button></div> <div style="font-size:11px;color:var(--text2)" id="textPositionLabel">Центр</div></div> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Вирівнювання</div><div class="flex" style="justify-content:center"><button class="btn btn-ghost btn-sm" onclick="setTextAlign('left')" style="font-size:11px;padding:1px 2px">⬅</button><button class="btn btn-primary btn-sm" onclick="setTextAlign('center')" style="font-size:11px;padding:1px 2px">↔</button><button class="btn btn-ghost btn-sm" onclick="setTextAlign('right')" style="font-size:11px;padding:1px 2px">➡</button></div> <div style="font-size:11px;color:var(--text2)" id="textAlignLabel">Центр</div></div></div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px;margin-bottom:3px"><div><input type="color" id="textColorPicker" value="#ffffff" style="width:100%;height:16px;border:none;border-radius:2px;cursor:pointer" oninput="updateTextColor(this.value)"></div><div><input type="color" id="textBgColorPicker" value="#000000" style="width:100%;height:16px;border:none;border-radius:2px;cursor:pointer" oninput="updateTextBgColor(this.value)"></div><div class="flex" style="justify-content:center"><button class="btn btn-ghost btn-sm" id="styleBold" onclick="toggleTextStyle('bold')" style="font-size:11px;padding:4px 7px;font-weight:700">B</button><button class="btn btn-ghost btn-sm" id="styleShadow" onclick="toggleTextStyle('shadow')" style="font-size:11px;padding:4px 7px">S</button></div><div><button class="btn btn-primary btn-sm" onclick="applyTextSettingsToOutput()" style="width:100%;font-size:11px;padding:4px 7px">✓</button></div></div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px"><div id="textPreviewBox" style="aspect-ratio:16/9;background:#000;border-radius:2px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);position:relative;overflow:hidden"><div id="textPreviewContent" style="text-align:center;padding:6px;color:#fff;font-family:Georgia,serif;font-size:14px;line-height:1.3;max-width:90%"><div id="textPreviewRef" style="color:#c8a84b;font-size:12px;margin-bottom:2px">Від Матвія 5:3</div><div id="textPreviewBody" style="font-size:14px">Блаженні вбогі духом...</div></div></div> <div><div style="font-size:11px;color:var(--text2);margin-bottom:2px">Статус виходів</div><div id="textStatus1" style="font-size:11px;color:var(--accent)">📺1: 58px</div><div id="textStatus2" style="font-size:11px;color:var(--green)">🎥2: 58px</div><div id="textStatus3" style="font-size:11px;color:var(--gold)">🖥3: 58px</div><div id="textStatus4" style="font-size:11px;color:var(--red)">🖥4: 58px</div></div></div></div>` +
`<div class="card"><div class="card-title">✨ Додатково</div>` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Обведення: <span id="textStrokeVal">${t.strokeWidth||0}</span>px</label>` +
`<input type="range" id="textStroke" min="0" max="6" value="${t.strokeWidth||0}" oninput="document.getElementById('textStrokeVal').textContent=this.value;setTextStroke(this.value)" style="width:100%;margin-bottom:6px">` +
`<div class="flex" style="margin-bottom:10px;gap:8px"><input type="color" id="textStrokeColor" value="${t.strokeColor||'#000000'}" oninput="setTextStrokeColor(this.value)" style="width:40px;height:32px;border:none;border-radius:6px;cursor:pointer;background:none"><span style="font-size:11px;color:var(--text2);align-self:center">Колір обведення</span></div>` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Підкладка: <span id="textScrimVal">${Math.round((t.scrim||0)*100)}</span>%</label>` +
`<input type="range" id="textScrim" min="0" max="90" value="${Math.round((t.scrim||0)*100)}" oninput="document.getElementById('textScrimVal').textContent=this.value;setTextScrim(this.value)" style="width:100%;margin-bottom:10px">` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Безпечна зона: <span id="textSafeAreaVal">${t.safeArea||0}</span>%</label>` +
`<input type="range" id="textSafeArea" min="0" max="10" value="${t.safeArea||0}" oninput="document.getElementById('textSafeAreaVal').textContent=this.value;setTextSafeArea(this.value)" style="width:100%;margin-bottom:10px">` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Міжлітерний: <span id="textLetterSpacingVal">${t.letterSpacing||0}</span>px</label>` +
`<input type="range" id="textLetterSpacing" min="0" max="10" value="${t.letterSpacing||0}" oninput="document.getElementById('textLetterSpacingVal').textContent=this.value;setTextLetterSpacing(this.value)" style="width:100%;margin-bottom:10px">` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Міжрядковий: <span id="textLineHeightVal">${(t.lineHeight||1.4).toFixed(2)}</span></label>` +
`<input type="range" id="textLineHeight" min="100" max="220" value="${Math.round((t.lineHeight||1.4)*100)}" oninput="document.getElementById('textLineHeightVal').textContent=(this.value/100).toFixed(2);setTextLineHeight(this.value)" style="width:100%;margin-bottom:10px">` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Швидкість переходу: <span id="textFadeMsVal">${t.fadeMs||600}</span> мс</label>` +
`<input type="range" id="textFadeMs" min="100" max="1500" step="50" value="${t.fadeMs||600}" oninput="document.getElementById('textFadeMsVal').textContent=this.value;setTextFadeMs(this.value)" style="width:100%">` +
`</div>` +
`<div class="card"><div class="card-title">🖼 Фон (замість суцільного кольору)</div>` +
`<div class="flex" style="gap:4px;margin-bottom:8px">` +
`<button class="btn ${(t.bgType||'color')==='color'?'btn-primary':'btn-ghost'} btn-sm" onclick="setTextBgType('color')">Колір</button>` +
`<button class="btn ${t.bgType==='video'?'btn-primary':'btn-ghost'} btn-sm" onclick="setTextBgType('video')">Відео</button>` +
`<button class="btn ${t.bgType==='image'?'btn-primary':'btn-ghost'} btn-sm" onclick="setTextBgType('image')">Фото</button>` +
`</div>` +
(t.bgType==='video' ? (
  `<input type="file" accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.wmv,.flv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.m2v,.vob,.divx,.asf,.mxf,.ogv" onchange="loadTextBgVideo(this)" style="font-size:11px;width:100%">` +
  (t.bgVideo ? `<div style="font-size:11px;color:var(--green);margin-top:4px">▶ ${esc(t.bgVideo.name||'')}</div><button class="btn btn-ghost btn-sm" style="margin-top:4px;color:var(--red)" onclick="clearTextBgVideo()">✕ Прибрати</button>` : '')
) : t.bgType==='image' ? (
  `<input type="file" accept="image/*" onchange="loadTextBgImage(this)" style="font-size:11px;width:100%">` +
  (t.bgImage ? `<div style="font-size:11px;color:var(--green);margin-top:4px">🖼 Фото завантажено</div><button class="btn btn-ghost btn-sm" style="margin-top:4px;color:var(--red)" onclick="clearTextBgImage()">✕ Прибрати</button>` : '')
) : `<div class="card-sub">Колір фону — той самий пікер, що вище, поруч із кольором тексту.</div>`) +
`</div>`;
}

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

function resetAnimations() {
const entry = $('#animEntry');
const exit = $('#animExit');
const speed = $('#animSpeed');
if(entry) entry.value = 'fade';
if(exit) exit.value = 'fade';
if(speed) speed.value = 500;
const speedVal = $('#animSpeedVal');
if(speedVal) speedVal.textContent = '500ms';
updateAnimationPreview();
applyAnimations();
}

function resetHotkeys() {
if(!confirm('Скинути?')) return;
state.hotkeys = {'next-verse':'Space','prev-verse':'ArrowLeft','send':'Enter','clear':'Escape'};
saveHotkeys();
}


function runPlaylist() {
if(!state.playlist.length) { notify('Черга порожня'); return; }
state.playlistIndex = 0;
sendPlaylistItem(0);
state.playlistRunning = true;
const status = $('#playlistStatus');
if(status) status.textContent = '● Виконується...';
if($('#playlistAutoMode')?.value === 'timer') startPlaylistTimer();
}


function saveGraphicsPreset() {
pv2Prompt('Назва пресету:', function(name){
if(!name) return;
const p = loadJSON(STORAGE_KEYS.graphicsPresets) || [];
p.push({name, date: new Date().toISOString().split('T')[0], settings: JSON.parse(JSON.stringify(state.graphicsSettings))});
saveJSON(STORAGE_KEYS.graphicsPresets, p);
renderTabInto('graphics');
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
  renderTabInto('graphics');
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
  renderTabInto('graphics');
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

function saveHotkeyProfile() {
pv2Prompt('Назва профілю:', function(name){
if(!name) return;
const p = loadJSON(STORAGE_KEYS.hotkeyProfiles) || [];
p.push({name, date: new Date().toISOString().split('T')[0], hotkeys: state.hotkeys});
saveJSON(STORAGE_KEYS.hotkeyProfiles, p);
const status = $('#hotkeyStatus');
if(status) status.textContent = '✓ Профіль збережено';
});
}

function saveHotkeys() {
saveJSON(STORAGE_KEYS.hotkeys, state.hotkeys);
renderHotkeys();
const status = $('#hotkeyStatus');
if(status) { status.textContent = '✓ Збережено'; setTimeout(() => { status.textContent = ''; }, 1000); }
}


function savePlaylist() {
pv2Prompt('Назва:', function(name){
if(!name) return;
const data = {name, date: new Date().toISOString().split('T')[0], items: state.playlist};
try {
const saved = loadJSON(STORAGE_KEYS.playlistSaved) || [];
saved.push(data);
saveJSON(STORAGE_KEYS.playlistSaved, saved);
notify('✓ Плейлист збережено');
} catch(e) {}
});
}

function savePlaylistData() { saveJSON(STORAGE_KEYS.playlist, state.playlist); }

function saveStageNotes() {
const notes = $('#stageNotes')?.value || '';
saveJSON(STORAGE_KEYS.stageNotes, notes);
notify('✓ Нотатки збережено');
updateStageDisplay();
}

function saveStatistics() { saveJSON(STORAGE_KEYS.statistics, state.statsData); }


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
    return { text: esc(String(s.verses[state.selectedVerseIdx])).replace(/\n/g, '<br>'), ref: s.title || '' };
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
  return (state.outputChroma && state.outputChroma[n] && state.outputChroma[n] !== 'none' && typeof streamBgAlpha === 'function')
    ? streamBgAlpha() : undefined;
}

function sendGraphicsToAll() {
  const c = pv2GraphicsContent();
  doSendHTML(getGraphicsHTML(c.text, c.ref), 'Графіка (всі виходи)');
}

function sendGraphicsToOutput(num) {
  const c = pv2GraphicsContent();
  sendHTMLToOutputN(num, getGraphicsHTML(c.text, c.ref, gfxAlphaFor(num)), 'Графіка');
}


function sendH2RLowerThird() {
doSendHTML(getH2RHTML(), 'H2R: ' + state.h2rConfig.line1);
}

function sendMediaToProjector() {
if(state.currentMediaIndex === -1 || !state.mediaFiles[state.currentMediaIndex]) {
notify('Оберіть медіа');
return;
}
const f = state.mediaFiles[state.currentMediaIndex];
let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}video,audio{max-width:100%;max-height:100vh;width:100%}</style></head><body>`;
if(f.type.startsWith('video')) {
html += `<video src="${f.data}" controls autoplay style="width:100%;height:100%;object-fit:contain"></video>`;
} else {
html += `<audio src="${f.data}" controls autoplay style="width:80%"></audio><div style="position:absolute;bottom:30px;color:#fff;font-size:14px">🎵 ${esc(f.name)}</div>`;
}
html += '</body></html>';
doSendHTML(html, 'Медіа: ' + f.name);
}

function sendPlaylistItem(i) {
const item = state.playlist[i];
if(!item) return;
state.playlistIndex = i;
if(item.content) {
if(item.content.type === 'text' || item.content.type === 'song' || item.content.type === 'bible') doSend(item.html || '', item.ref || '');
else doSendHTML(item.html || '', item.ref || '');
} else {
doSend(item.html || '', item.ref || '');
}
renderPlaylist();
const status = $('#playlistStatus');
if(status) status.textContent = '● Відправлено: ' + item.ref;
}

function setPPTtemplate(t) {
state.pptTemplate = t;
$$('[id^="pptTemplate"]').forEach(el => el.style.border = '1px solid transparent');
const btn = $('#pptTemplate' + t.charAt(0).toUpperCase() + t.slice(1));
if(btn) btn.style.border = '1px solid var(--accent)';
updatePPTPreview();
}


function setTextAlign(a) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].align = a;
} else {
state.textSettings[state.currentTextOutput].align = a;
}
const label = $('#textAlignLabel');
if(label) label.textContent = a.toUpperCase();
updateTextPreview();
}

function setTextOutput(num) {
state.currentTextOutput = num;
$$('[id^="textOutput"]').forEach(el => {
el.className = 'btn btn-ghost btn-sm';
if(el.id === 'textOutput' + num) el.className = 'btn btn-primary btn-sm';
if(num === 'all' && el.id === 'textOutputAll') el.className = 'btn btn-primary btn-sm';
});
const s = num === 'all' ? state.textSettings[1] : state.textSettings[num] || state.textSettings[1];
if(s) {
const sizeDisplay = $('#textSizeDisplay');
const sizeSlider = $('#textSizeSlider');
const colorPicker = $('#textColorPicker');
const bgPicker = $('#textBgColorPicker');
if(sizeDisplay) sizeDisplay.textContent = s.size || 58;
if(sizeSlider) sizeSlider.value = s.size || 58;
if(colorPicker) colorPicker.value = s.color || '#ffffff';
if(bgPicker) bgPicker.value = s.bgColor || '#000000';
updateTextStatus();
updateTextPreview();
}
}

function setTextPosition(p) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].position = p;
} else {
state.textSettings[state.currentTextOutput].position = p;
}
const label = $('#textPositionLabel');
if(label) label.textContent = p.replace('-', ' ').toUpperCase();
updateTextPreview();
}


function startHotkeyCapture(inp) {
if(state._hotkeyCapture) { state._hotkeyCapture.style.borderColor = ''; state._hotkeyCapture = null; }
state._hotkeyCapture = inp;
inp.style.borderColor = 'var(--accent)';
inp.value = '...';
const status = $('#hotkeyStatus');
if(status) status.textContent = '⏳ Очікування...';
}

function startPlaylistTimer() {
stopPlaylistTimer();
const sec = parseInt($('#playlistTimer')?.value || 10);
state.playlistTimer = setInterval(() => { if(state.playlistRunning) playlistNext(); }, sec * 1000);
const status = $('#playlistStatus');
if(status) status.textContent = '● Таймер: ' + sec + 'с';
}

function stopMedia() {
if(!state.mediaPlayer) return;
state.mediaPlayer.pause();
state.mediaPlayer.currentTime = 0;
}

function stopPlaylistTimer() {
if(state.playlistTimer) { clearInterval(state.playlistTimer); state.playlistTimer = null; }
}

function toggleMediaPlay() {
if(!state.mediaPlayer) return;
if(state.mediaPlayer.paused) state.mediaPlayer.play();
else state.mediaPlayer.pause();
}

function toggleTextStyle(st) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].styles[st] = !state.textSettings[i].styles[st];
} else {
state.textSettings[state.currentTextOutput].styles[st] = !state.textSettings[state.currentTextOutput].styles[st];
}
const el = $('#style' + st.charAt(0).toUpperCase() + st.slice(1));
if(el) {
const is = state.currentTextOutput === 'all' ? state.textSettings[1].styles[st] : state.textSettings[state.currentTextOutput].styles[st];
el.className = 'btn btn-ghost btn-sm' + (is ? ' active' : '');
}
updateTextPreview();
}

function updateAnimationPreview() {
state.animSettings.entry = $('#animEntry')?.value || 'fade';
state.animSettings.exit = $('#animExit')?.value || 'fade';
state.animSettings.speed = parseInt($('#animSpeed')?.value || 500);
}

function updateFontSelectors() {
['fontSongs','fontBible','fontHeaders'].forEach(id => {
const sel = $(`#${id}`);
if(!sel) return;
const current = sel.value;
while(sel.options.length > 1) sel.remove(1);
state.customFonts.forEach(f => {
const o = document.createElement('option');
o.value = f.name;
o.textContent = f.name;
sel.appendChild(o);
});
if(state.customFonts.some(f => f.name === current)) sel.value = current;
});
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
    renderTabInto('graphics');
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
  renderTabInto('graphics');
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
    renderTabInto('graphics');
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
  if (tabId === 'graphics') { updateGraphicsFontList(); updateGraphicsPreview(); }
  // Статуси виходів оновлюємо при відкритті — індикатора в лівій панелі більше немає
  if (tabId === 'router') pv2SyncOutputStates();
  if (tabId === 'h2r' && typeof renderH2RTemplates === 'function') { try { renderH2RTemplates(); } catch (e) {} }
  if (tabId === 'textcontrol') updateTextPreview();
  if (tabId === 'live') updateLivePanels();
  if (tabId === 'stream') updateLowerPreview();
  if (tabId === 'qrscreen') updateQrPreview();
  if (tabId === 'stations') { renderStationClients(); renderRemoteUsersList(); }
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


function updateStageDisplay() {
  // ПОТОЧНИЙ і НАСТУПНИЙ слайд для сцени.
  // (Раніше читалося state.selectedSong / state.currentBibleBook / getVerse(...) —
  //  усе неправильні посилання; справжні — глобальні selectedSong / currentBibleBook
  //  / getVerseText, тому «наступний» і таймер на сцені не працювали.)
  let cur = '', next = '';
  const songLive = (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'song');
  if (songLive && typeof selectedSong !== 'undefined' && selectedSong) {
    cur = selectedSong.verses[selectedVerseIdx] || '';
    next = selectedSong.verses[selectedVerseIdx + 1] || '';
  } else if (typeof currentBibleBook !== 'undefined' && currentBibleBook && currentBibleChapter && currentBibleVerseNum) {
    const r = (typeof verseRange === 'function') ? verseRange() : { from: currentBibleVerseNum, to: currentBibleVerseNum };
    const rangeFn = (typeof getVerseRangeText === 'function');
    cur = rangeFn ? getVerseRangeText(null, currentBibleBook, currentBibleChapter, r.from, r.to)
                  : (getVerseText(currentBibleBook, currentBibleChapter, currentBibleVerseNum) || '');
    const size = r.to - r.from + 1, nf = r.to + 1;   // наступний блок такого ж розміру
    next = rangeFn ? getVerseRangeText(null, currentBibleBook, currentBibleChapter, nf, nf + size - 1)
                   : (getVerseText(currentBibleBook, currentBibleChapter, nf) || '');
  } else if (typeof selectedSong !== 'undefined' && selectedSong) {
    cur = selectedSong.verses[selectedVerseIdx] || '';
    next = selectedSong.verses[selectedVerseIdx + 1] || '';
  }
  if (!cur) cur = '—';
  if (!next) next = '—';
  const timer = (typeof timerState !== 'undefined' && timerState) ? timerFmt(timerState.remaining) : '--:--';
  const notes = $('#stageNotes')?.value || '';
  if (state.stageDisplayOpen && window.electronAPI && window.electronAPI.updateStageWindow) {
    window.electronAPI.updateStageWindow({ current: cur.substring(0, 200), next: next.substring(0, 200), timer, notes: notes.substring(0, 60) });
  }
  const curEl = $('#stagePreviewCurrent');
  const nextEl = $('#stagePreviewNext');
  const timerEl = $('#stagePreviewTimer');
  const clockEl = $('#stagePreviewClock');
  if (curEl) curEl.textContent = cur.substring(0, 40);
  if (nextEl) nextEl.textContent = next.substring(0, 40);
  if (timerEl) timerEl.textContent = '⏱ ' + timer;
  if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('uk-UA');
}

function updateStatistics() {
const period = ($('#statPeriod') && $('#statPeriod').value) || 'month';
const spanMs = period === 'day' ? 24 * 3600 * 1000 : period === 'week' ? 7 * 24 * 3600 * 1000 : period === 'year' ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
const cutoff = Date.now() - spanMs;
const logInPeriod = (state.statsData.log || []).filter(e => e.t >= cutoff);

const total = logInPeriod.length;
const totalEl = $('#statTotalOutputs');
if(totalEl) totalEl.textContent = total;

let most = '', max = 0;
const songUsageInPeriod = {}, bibleUsageInPeriod = {};
logInPeriod.forEach(e => {
  if (!e.name) return;
  if (e.kind === 'song') songUsageInPeriod[e.name] = (songUsageInPeriod[e.name] || 0) + 1;
  if (e.kind === 'bible') bibleUsageInPeriod[e.name] = (bibleUsageInPeriod[e.name] || 0) + 1;
});
Object.keys(songUsageInPeriod).forEach(k => {
if(songUsageInPeriod[k] > max) { max = songUsageInPeriod[k]; most = k; }
});
Object.keys(bibleUsageInPeriod).forEach(k => {
if(bibleUsageInPeriod[k] > max) { max = bibleUsageInPeriod[k]; most = k; }
});
const mostEl = $('#statMostUsed');
if(mostEl) mostEl.textContent = most || '—';

const days = 30;
let active = 0;
const dayKeys = Object.keys(state.statsData.dailyActivity || {});
for(let i = 0; i < Math.min(dayKeys.length, days); i++) {
if(state.statsData.dailyActivity[dayKeys[i]] > 0) active;
}
const activityEl = $('#statActivity');
if(activityEl) activityEl.textContent = Math.round(active / days * 100) + '%';

renderTopSongs(songUsageInPeriod);
renderTopBible(bibleUsageInPeriod);
}

function updateTextBgColor(c) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].bgColor = c;
} else {
state.textSettings[state.currentTextOutput].bgColor = c;
}
updateTextPreview();
}

function updateTextColor(c) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].color = c;
} else {
state.textSettings[state.currentTextOutput].color = c;
}
updateTextPreview();
}

function updateTextPreview() {
const s = state.currentTextOutput === 'all' ? state.textSettings[1] : state.textSettings[state.currentTextOutput] || state.textSettings[1];
const ref = $('#textPreviewRef');
const body = $('#textPreviewBody');
const cont = $('#textPreviewContent');
if(ref) { ref.style.color = '#c8a84b'; ref.style.fontSize = Math.round((s.size || 58) * 0.6) + 'px'; }
if(body) {
body.style.color = s.color || '#ffffff';
body.style.fontSize = (s.size || 58) + 'px';
body.style.fontWeight = s.styles.bold ? '700' : 'normal';
body.style.textShadow = s.styles.shadow ? '0 2px 10px rgba(0,0,0,0.8)' : 'none';
body.textContent = 'Блаженні вбогі духом...';
}
if(cont) { cont.style.background = s.bgColor || '#000000'; cont.style.borderRadius = '4px'; cont.style.padding = '8px'; }
}

function updateTextSize(v) {
const s = parseInt(v);
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].size = s;
} else {
state.textSettings[state.currentTextOutput].size = s;
}
const sizeDisplay = $('#textSizeDisplay');
if(sizeDisplay) sizeDisplay.textContent = s;
updateTextStatus();
updateTextPreview();
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

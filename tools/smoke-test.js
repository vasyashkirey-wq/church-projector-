#!/usr/bin/env node
/*
  Димова перевірка (smoke test) — запускати ПЕРЕД кожною збіркою:
      node tools/smoke-test.js

  Нічого в застосунку не змінює. Ловить саме ті класи багів, що вже траплялись:
    1. Зламаний синтаксис (будь-який .js і кожен <script> в index.html)
    2. Кнопка/поле викликає функцію, якої НЕ існує (onclick/onchange…)
    3. Функція зі списку ініціалізації відсутня
    4. «Мертва» вкладка в навігації (кнопка без вмісту) або втрачена вкладка
    5. Поломаний імпорт книг Біблії (fmtBookId не мапить назви)
    6. Незбалансовані теги в index.html
    7. Вивід/хромакей: усі шари проектора на місці; текст і графіка взаємо-
       виключні (нема «двох графік»); контраст на хромакеї; «Очистити все»
       прибирає накладки; набір виходів узгоджений main↔рендер; нема подвійної
       відправки на вихід
    8. IPC-парність: кожен invoke у preload має handle у main.js
    9. Дублі функцій верхнього рівня (перетирання)
   10. Electron: немає native prompt()
   11. ATEM: правильний порядок аргументів входів (input, me), стан v3
       (mixEffects), переходи через nextStyle, парність типів команд
   12. PTZ: рушій ptz-command, місток, вкладка, усі протоколи (вкл. «Авто»)
   13. Регресії, що вже колись ламались: single-instance lock, require('app'),
       банер помилок з pointer-events:none, try/catch у renderTabInto,
       liveSongAdvance (аранжування в ефірі)
   14. Пісні: редагування (editSong) + збережений розмір (set-locked-size)

  Код виходу: 0 — усе добре; 1 — є проблеми (зупини збірку й полагодь).
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = {
  index: read('src/index.html'),
  extras: (function(){
    // extras.js розбито на кілька частин extras-N.js — читаємо всі по порядку
    var fs2 = require('fs');
    var parts = fs2.readdirSync(path.join(ROOT, 'src'))
      .filter(function(f){ return /^(extras.*|ptz-ui|atem-ui|slide-ui|song-edit|song-display|bible)\.js$/.test(f); })
      .sort();
    return parts.map(function(f){ return read('src/' + f); }).join('\n');
  })(),
  formats: read('src/formats.js'),
  main: read('main.js'),
  projPreload: read('src/projector-preload.js'),
  projHtml: read('src/projector.html'),
  preload: read('src/preload.js'),
};

let checks = 0, failures = 0;
const ok   = m => { checks++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad  = m => { checks++; failures++; console.log('  \x1b[31m✗\x1b[0m ' + m); };
const info = m => console.log('    ' + m);
const head = t => console.log('\n\x1b[1m' + t + '\x1b[0m');

// ── helpers ────────────────────────────────────────────────────────────────
function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m; while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}
function checkSyntax(label, code) {
  try { new vm.Script(code); ok('синтаксис: ' + label); }
  catch (e) { bad('синтаксис: ' + label + ' → ' + e.message); }
}

// ── 1. SYNTAX ────────────────────────────────────────────────────────────────
head('1. Синтаксис');
checkSyntax('main.js', SRC.main);
checkSyntax('extras.js', SRC.extras);
checkSyntax('formats.js', SRC.formats);
inlineScripts(SRC.index).forEach((c, i) => checkSyntax('index.html <script> #' + (i + 1), c));

// ── collect all defined global names (across the 3 script sources) ──────────
const ALL = SRC.index + '\n' + SRC.extras + '\n' + SRC.formats;
const defined = new Set();
[
  /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/g,
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g,
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*rafDebounce/g,
  /window\.([A-Za-z_$][\w$]*)\s*=/g,
].forEach(rx => { let m; while ((m = rx.exec(ALL)) !== null) defined.add(m[1]); });

const BUILTINS = new Set(['if','for','while','switch','return','function','typeof','new','delete','void',
  'document','window','console','parseInt','parseFloat','Math','JSON','Object','Array','String','Number',
  'Boolean','Date','setTimeout','setInterval','clearTimeout','clearInterval','alert','confirm','prompt',
  'event','this','isNaN','encodeURIComponent','decodeURIComponent','Set','Map','RegExp','Promise',
  'localStorage','getComputedStyle','btoa','atob','requestAnimationFrame','fetch','FileReader','Blob',
  'URL','navigator','location','history','screen','print','open','close','focus','blur',
  // CSS-функції, що трапляються в рядках-аргументах onclick (не JS-виклики):
  'var','calc','rgb','rgba','hsl','hsla','url','gradient','translate','translateX','translateY',
  'scale','rotate','min','max','clamp','linear','radial']);

// ── 2. EVENT HANDLERS reference defined functions ───────────────────────────
head('2. Обробники подій (onclick/onchange…) посилаються на наявні функції');
const referenced = new Map();
const attrRx = /\bon(?:click|change|input|keydown|keyup|blur|focus|submit|mousedown|mouseup|dblclick)\s*=\s*(["'])([\s\S]*?)\1/g;
let mm;
while ((mm = attrRx.exec(ALL)) !== null) {
  const code = mm[2];
  // виклики виду name( , але НЕ .method( і не hyphen-name( (щоб не ловити .includes(), linear-gradient())
  const callRx = /(?<![.\w$-])([A-Za-z_$][\w$]*)\s*\(/g;
  let c; while ((c = callRx.exec(code)) !== null) {
    if (!BUILTINS.has(c[1])) referenced.set(c[1], (referenced.get(c[1]) || 0) + 1);
  }
}
const missingHandlers = [...referenced.keys()].filter(n => !defined.has(n)).sort();
if (!missingHandlers.length) ok(`усі ${referenced.size} функцій-обробників визначені`);
else { bad(`${missingHandlers.length} обробник(ів) без функції:`); missingHandlers.forEach(n => info('• ' + n + '()')); }

// ── 3. INIT-LIST functions exist ────────────────────────────────────────────
head('3. Функції зі списку ініціалізації існують');
// беремо масив, що передається у steps.forEach(fn => …) в pv2Init
function sliceArray(src, anchor) {
  const a = src.indexOf(anchor);
  if (a < 0) return null;
  const open = src.indexOf('[', a);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return null;
}
const stepsBody = sliceArray(SRC.extras, 'const steps = [');
if (stepsBody === null) { bad('не знайдено масив steps у extras.js'); }
else {
  // прибираємо рядкові літерали (напр. () => setPPTtemplate('classic')),
  // щоб аргумент-рядок не сприймався за назву функції
  const cleaned = stepsBody.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
  const names = [...cleaned.matchAll(/([A-Za-z_$][\w$]*)/g)].map(x => x[1])
    .filter(n => !/^\d+$/.test(n));
  const miss = names.filter(n => !defined.has(n));
  if (!miss.length) ok(`усі ${names.length} функцій ініціалізації визначені`);
  else { bad(`${miss.length} відсутні:`); miss.forEach(n => info('• ' + n)); }
}

// ── 4. NAV integrity: every tab button has content, nothing lost ────────────
head('4. Навігація: кожна вкладка має вміст, нічого не втрачено');
function firstArg(list) { return [...list.matchAll(/\['([a-z0-9]+)'\s*,/g)].map(x => x[1]); }
const staticIds = [...SRC.index.matchAll(/id="tab-content-([a-z0-9]+)"/g)].map(x => x[1]);
const tabsBlock = SRC.extras.slice(SRC.extras.indexOf('const TABS = ['),
  SRC.extras.indexOf('];', SRC.extras.indexOf('const TABS = [')));
const dynIds = firstArg(tabsBlock);
const contentIds = new Set([...staticIds, ...dynIds]);
const grpBlock = SRC.extras.slice(SRC.extras.indexOf('const TAB_GROUPS = ['),
  SRC.extras.indexOf('];', SRC.extras.indexOf('const TAB_GROUPS = [')));
const navIds = firstArg(grpBlock);
const dead = navIds.filter(id => !contentIds.has(id));
const dupes = navIds.filter((id, i) => navIds.indexOf(id) !== i);
if (!navIds.length) bad('не знайдено TAB_GROUPS');
else if (dead.length) { bad(`«мертві» кнопки без вмісту: ${dead.join(', ')}`); }
else if (dupes.length) { bad(`дубльовані вкладки в навігації: ${dupes.join(', ')}`); }
else ok(`усі ${navIds.length} вкладок навігації мають вміст, без дублікатів`);

// ── 5. Bible import: fmtBookId maps names to correct canonical ids ──────────
head('5. Імпорт Біблії: назви книг мапляться на правильні id');
try {
  const mb = SRC.index.match(/var BIBLE_BOOKS\s*=\s*(\[[\s\S]*?\n\]);/);
  const BIBLE_BOOKS = eval(mb[1]); // eslint-disable-line no-eval
  const api = new Function('BIBLE_BOOKS', SRC.formats + '\nreturn { fmtBookId: fmtBookId };')(BIBLE_BOOKS);
  const cases = [
    // назва в файлі → очікуваний id (українською/російською/чеською/англійською)
    ['Буття', 'gen'], ['Вихід', 'exo'], ['Псалми', 'psa'], ['Об\u2019явлення', 'rev'],
    ['Бытие', 'gen'], ['К Римлянам', 'rom'], ['Песни Песней', 'sng'], ['Иуда', 'jud'],
    ['Genesis', 'gen'], ['Přísloví', 'pro'], ['Zjevení Janovo', 'rev'], ['Skutky apoštolské', 'act'],
    ['Matthew', 'mat'], ['Revelation', 'rev'],
    ['Товит', 'tob'], ['1 Маккавеїв', '1ma'],   // другоканонічні (Турконяк)
  ];
  let bad5 = 0;
  cases.forEach(([name, want]) => {
    const got = api.fmtBookId(name);
    if (got !== want) { bad5++; info(`✗ «${name}» → ${got || 'null'} (очікували ${want})`); }
  });
  if (!bad5) ok(`усі ${cases.length} тестових назв книг мапляться правильно (ua/ru/cz/en)`);
  else bad(`${bad5} з ${cases.length} назв мапляться НЕправильно`);
} catch (e) {
  bad('не вдалося перевірити fmtBookId: ' + e.message);
}

// ── 6. HTML tag balance ─────────────────────────────────────────────────────
head('6. Баланс тегів у index.html');
['div', 'button', 'select', 'table'].forEach(tag => {
  const o = (SRC.index.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length;
  const c = (SRC.index.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  if (o === c) ok(`<${tag}> збалансовано (${o})`);
  else bad(`<${tag}>: ${o} відкрито / ${c} закрито (різниця ${o - c})`);
});

// Дублікати id="" у РЕАЛЬНОМУ DOM index.html (не всередині <script> — там
// рядки виду '<div id="wrap">' генерують окремі HTML-документи для інших
// iframe/вікон, і однакові id там — це нормально, різні документи).
(function () {
  const domOnly = SRC.index.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  const ids = {};
  let m; const re = /\bid="([^"]+)"/g;
  while ((m = re.exec(domOnly))) ids[m[1]] = (ids[m[1]] || 0) + 1;
  const dups = Object.entries(ids).filter(([, v]) => v > 1);
  if (!dups.length) ok('немає дублікатів id у статичній розмітці index.html (' + Object.keys(ids).length + ' унікальних)');
  else bad('дублікати id у DOM: ' + dups.map(([k, v]) => k + ' x' + v).join(', ') + ' — getElementById поверне лише перший, другий стане недоступним');
})();

// ── Вивід на проектор/трансляцію + хромакей + конфлікти ──────────────────────
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const rest = src.slice(i + 1);
  const j = rest.indexOf('\nfunction ');
  return j < 0 ? rest : rest.slice(0, j);
}
head('Вивід + хромакей + конфлікти');
(function () {
  const ph = SRC.projHtml, pp = SRC.projPreload;
  // A. усі шари виводу присутні (без них show/clear ламається)
  const needLayers = ['content', 'text-wrap', 'text-body', 'frame-wrap', 'frame', 'alert-layer', 'logo-layer', 'proj-bg'];
  const missLayers = needLayers.filter(id => !ph.includes('id="' + id + '"'));
  if (!missLayers.length) ok('проектор: усі ' + needLayers.length + ' шари виводу на місці');
  else bad('проектор: НЕМА шарів: ' + missLayers.join(', '));

  // B. текст і графіка взаємовиключні (інакше «дві графіки одночасно»)
  const showText = fnBody(pp, 'showText');
  const showHTML = fnBody(pp, 'showHTML');
  if (/fadeOutFrame\(\)/.test(showText)) ok('showText ховає шар графіки (нема накладання тексту+графіки)');
  else bad('showText НЕ ховає графіку — текст і графіка можуть накластись');
  if (/text-wrap[\s\S]*?remove\('show'\)|remove\('show'\)[\s\S]*?text-wrap/.test(showHTML) || /getElementById\('text-wrap'\)/.test(showHTML)) ok('showHTML ховає текстовий шар');
  else bad('showHTML НЕ ховає текст — графіка й текст можуть накластись');

  // C. хромакей — контраст тексту перезастосовується на кожному слайді
  if (/function reassertContrast/.test(pp) && /reassertContrast\(\)/.test(showText)) ok('хромакей: контраст тексту перезастосовується (білий+обводка на зеленому)');
  else bad('хромакей: reassertContrast не викликається у showText — текст може бути тьмяним на зеленому');

  // D. «Очистити все» прибирає й накладки (баг «друга графіка не зникає»)
  const clearLive = fnBody(SRC.extras, 'clearLive');
  if (/sendAlert\(null/.test(clearLive) && /showLogo\(null/.test(clearLive)) ok('clearLive прибирає слайд + оголошення + логотип (повний бланк)');
  else bad('clearLive НЕ прибирає накладки — може лишитись «друга графіка»');

  // E. набір виходів однаковий у main.js і рендері (інакше конфлікт маршрутів)
  const kinds = ['projector', 'stream', 'out3', 'out4'];
  const inMain = kinds.every(k => SRC.main.includes("'" + k + "'"));
  const inRender = kinds.every(k => SRC.extras.includes("'" + k + "'"));
  if (inMain && inRender) ok('виходи projector/stream/out3/out4 узгоджені (main ↔ рендер)');
  else bad('набір виходів РОЗІЙШОВСЯ між main.js і рендером — конфлікт маршрутів');

  // F. broadcastDisplay шле лише на дзеркальні виходи (не на власний маршрут → нема подвоєння)
  if (/mirrorKinds\.includes/.test(SRC.main)) ok('broadcastDisplay фільтрує за mirrorKinds (нема подвійної відправки на вихід)');
  else bad('broadcastDisplay НЕ фільтрує mirrorKinds — вихід може отримати контент двічі');
})();

// ── IPC-парність: кожен invoke у preload має handle у main.js ────────────────
head('IPC-парність (preload ↔ main)');
(function () {
  const invokes = new Set(); let m;
  const re = /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g;
  while ((m = re.exec(SRC.preload))) invokes.add(m[1]);
  const handled = new Set();
  const re2 = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g;
  while ((m = re2.exec(SRC.main))) handled.add(m[1]);
  const missing = [...invokes].filter(x => !handled.has(x)).sort();
  if (!missing.length) ok('усі ' + invokes.size + ' IPC-виклики з preload мають обробник у main.js');
  else bad('IPC без обробника в main.js: ' + missing.join(', '));
})();

// ── Немає дублів визначень функцій верхнього рівня ───────────────────────────
head('Дублі функцій');
(function () {
  const all = SRC.index + '\n' + SRC.extras + '\n' + SRC.formats;
  const seen = {}; const dups = []; let m;
  // лише декларації верхнього рівня (з початку рядка) — не чіпаємо локальні/вкладені
  // (з відступом) та ті, що всередині рядків-шаблонів
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  while ((m = re.exec(all))) seen[m[1]] = (seen[m[1]] || 0) + 1;
  Object.keys(seen).forEach(k => { if (seen[k] > 1) dups.push(k + '×' + seen[k]); });
  if (!dups.length) ok('немає дубльованих function-визначень верхнього рівня');
  else bad('ДУБЛІ функцій (останнє перетирає перше): ' + dups.join(', '));
})();

// ── Electron: native prompt() не підтримується — треба pv2Prompt ────────────
head('Electron-сумісність');
(function () {
  const combined = SRC.index + '\n' + SRC.extras;
  const m = combined.match(/(^|[^A-Za-z2.])prompt\s*\(/g);
  if (!m) ok('немає native prompt() (Electron його блокує)');
  else bad('знайдено native prompt() ' + m.length + '× — заміни на pv2Prompt');
})();

// ── ATEM: аргументи входів, стан v3, парність команд ────────────────────────
head('ATEM (регресії)');
(function () {
  const m = SRC.main;
  if (/changePreviewInput\(\s*cmd\.input\b/.test(m) && /changeProgramInput\(\s*cmd\.input\b/.test(m))
    ok('порядок аргументів (input, me) вірний');
  else bad('невірний порядок аргументів changePreview/ProgramInput — має бути cmd.input перший');
  if (/change(?:Preview|Program)Input\(\s*cmd\.me\b/.test(m))
    bad("cmd.me передається ПЕРШИМ у changeInput — переставлені аргументи (регресія бага)");
  else ok('cmd.me не стоїть першим (немає старої регресії)');
  if (/mixEffects/.test(m)) ok('summarizeAtemState читає mixEffects (v3)');
  else bad('немає mixEffects — читання стану застаріле (v2 ME[])');
  if (/setTransitionStyle\(\s*\{\s*nextStyle/.test(m)) ok('перехід задається через nextStyle (v3)');
  else bad('setTransitionStyle не використовує nextStyle — кнопки переходів не діятимуть');
  const types = new Set(); let mm;
  const re = /atemCmd\(\s*\{\s*type\s*:\s*'([^']+)'/g;
  while ((mm = re.exec(SRC.index))) types.add(mm[1]);
  const missing = [...types].filter(t => !new RegExp("case\\s*'" + t + "'").test(m));
  if (!missing.length) ok('усі типи команд з панелі мають обробник у main.js (' + types.size + ')');
  else bad('немає обробника для ATEM-типів: ' + missing.join(', '));
})();

// ── PTZ: рушій, місток, вкладка, протоколи ──────────────────────────────────
head('PTZ (камери)');
(function () {
  if (/ipcMain\.handle\(\s*'ptz-command'/.test(SRC.main)) ok('обробник ptz-command у main.js');
  else bad('немає обробника ptz-command у main.js');
  if (/ptzCommand\s*:/.test(SRC.preload)) ok('місток ptzCommand у preload');
  else bad('немає ptzCommand у preload (панель не докличеться до main)');
  if (/'ptz'\s*,\s*'[^']*Камери/.test(SRC.extras)) ok('вкладку зареєстровано в навігації');
  else bad('вкладку PTZ не зареєстровано в TAB_GROUPS');
  if (/id="tab-content-ptz"/.test(SRC.index)) ok('вміст вкладки tab-content-ptz присутній');
  else bad('немає tab-content-ptz (вкладка буде порожня)');
  if (/name === 'ptz'/.test(SRC.index)) ok('showTab ініціалізує вкладку (ptzInit)');
  else bad('showTab не викликає ptzInit — панель не заповниться');
  const protos = ['auto', 'visca-udp', 'visca-tcp', 'http-cgi', 'onvif'];
  const miss = protos.filter(p => !new RegExp("'" + p + "'").test(SRC.main));
  if (!miss.length) ok('усі протоколи оброблені (' + protos.join(', ') + ')');
  else bad('немає обробки протоколів: ' + miss.join(', '));
})();

// ── Захист від уже виправлених регресій ─────────────────────────────────────
head('Захист від відомих регресій');
(function () {
  const m = SRC.main, ix = SRC.index, ex = SRC.extras;
  if (/requestSingleInstanceLock/.test(m)) ok('single-instance lock на місці (колись зникав при злитті)');
  else bad("ЗНИК single-instance lock — подвійний запуск битиметься за порти");
  if (!/require\('app'\)/.test(m)) ok("немає битого require('app') (колишній OSC-баг)");
  else bad("знайдено require('app') — це НЕ модуль, OSC-мапа зламається");
  if (/pv2ErrBox[\s\S]{0,500}pointer-events:\s*none/.test(ix))
    ok('банер помилки #pv2ErrBox не блокує кліки (pointer-events:none)');
  else bad("банер #pv2ErrBox без pointer-events:none — блокуватиме поля панелі");
  if (/try\s*\{\s*host\.innerHTML\s*=\s*fn\(\)/.test(ex))
    ok('renderTabInto захищено try/catch (помилка рендера не вб\u2019є поля)');
  else bad('renderTabInto без try/catch — помилка рендера лишить вкладку з мертвими полями');
  if (/function liveSongAdvance/.test(ex) && /liveSongAdvance\(/.test(ex))
    ok('liveSongAdvance на місці (аранжування слухається і в ефірі)');
  else bad('немає liveSongAdvance — аранжування знову ігноруватиметься в ефірі');
  if (/liveSongAdvance\(1\)[\s\S]{0,40}nextVerse\(\)/.test(SRC.index) && /songSendFirst\(\)/.test(SRC.index))
    ok('кнопки пісні (Наступний / На проектор) слухають аранжування');
  else bad('кнопки пісні гортають сирі куплети повз аранжування (регресія)');
})();

// ── Гарячі клавіші F1/F2/F5/Esc: справді відкривають/закривають ──────────────
head('Гарячі клавіші F1/F2/F5/Esc');
(function () {
  const ix = SRC.index, pl = SRC.preload;

  // F1/F2 мають бути ТУМБЛЕРАМИ (перевіряють поточний стан projOpen/streamOpen),
  // а не просто "завжди відкрити" — інакше друге натискання нічого не закриє.
  const tProj = fnBody(ix, 'toggleProjector');
  if (/if\s*\(\s*projOpen\s*\)/.test(tProj) && /closeProjector\(\)/.test(tProj) && /openProjector\(\)/.test(tProj))
    ok('F1 (toggleProjector) реально тумблер: перевіряє projOpen, відкриває і закриває');
  else bad('F1 (toggleProjector) не тумблер — може лише відкривати або лише закривати');

  const tStream = fnBody(ix, 'toggleStream');
  if (/if\s*\(\s*streamOpen\s*\)/.test(tStream) && /closeStream\(\)/.test(tStream) && /openStream\(\)/.test(tStream))
    ok('F2 (toggleStream) реально тумблер: перевіряє streamOpen, відкриває і закриває');
  else bad('F2 (toggleStream) не тумблер — може лише відкривати або лише закривати');

  // F5 колись тільки відкривав обидва виходи — повторне натискання нічого не
  // закривало (на відміну від F1/F2). toggleBothOutputs() мав це виправити.
  if (/function toggleBothOutputs/.test(ix) && /function closeBothOutputs/.test(ix))
    ok('F5 має toggleBothOutputs + closeBothOutputs (симетрично з F1/F2)');
  else bad('F5 досі лише ВІДКРИВАЄ (openBothOutputs) — повторне натискання не закриє виходи');
  const swCase = (ix.match(/case 'F5':[\s\S]{0,160}/) || [''])[0];
  if (/toggleBothOutputs\(\)/.test(swCase)) ok('обробник клавіші F5 викликає toggleBothOutputs (не тільки-відкрити)');
  else bad('обробник клавіші F5 усе ще викликає openBothOutputs напряму — регресія');

  // Якщо вікно проектора/трансляції закрили НЕ через F1/F2 (хрестик вікна,
  // Alt+F4), а projOpen/streamOpen лишились true — наступне F1 спробує
  // ЗАКРИТИ вже закрите вікно замість відкрити. main.js мусить повідомити
  // рендер про зовнішнє закриття, інакше тумблер розсинхронізується.
  if (/win\.on\('closed'[\s\S]{0,150}output-closed/.test(SRC.main))
    ok('main.js сповіщає рендер про зовнішнє закриття вікна (output-closed) — тумблер не розсинхронізується');
  else bad('main.js НЕ сповіщає про зовнішнє закриття вікна — після ручного закриття F1/F2 можуть зламатись');
  const onClosedBody = (ix.match(/onOutputClosed\(function[\s\S]{0,220}?\}\);/) || [''])[0];
  if (/projOpen\s*=\s*false/.test(onClosedBody) && /streamOpen\s*=\s*false/.test(onClosedBody))
    ok('рендер скидає projOpen/streamOpen при onOutputClosed для обох виходів');
  else bad('рендер не скидає стан при зовнішньому закритті — F1/F2 покажуть невірний статус');

  // Esc навмисно НЕ закриває вікна — це "очистити екран у залі" (як Clear
  // у ProPresenter), тому перевіряємо саме це, а не toggle-поведінку.
  const escCase = (ix.match(/case 'Escape':[\s\S]{0,160}/) || [''])[0];
  if (/clearProjector\(\)/.test(escCase)) ok('Esc очищає екран (clearProjector) — навмисно НЕ закриває вікна виводу');
  else bad('Esc змінив поведінку — перевір, що саме він тепер робить');
  const clearLiveBody = fnBody(SRC.extras, 'clearLive');
  if (/clearProjector\(\)/.test(clearLiveBody) && /sendAlert\(null/.test(clearLiveBody) && /showLogo\(null/.test(clearLiveBody))
    ok('розширений Esc (clearLive, коли задано в ⌨️ Клавіші) чистить слайд + накладки + логотип')
  else bad('розширений Esc (clearLive) неповний — після Esc можуть лишитись накладки на екрані');

  // Локальні клавіатурні поля (input/textarea/select) не мають ловити F1/F2/F5/Esc —
  // інакше набір тексту в назві пісні випадково закриє проектор.
  if (/tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT'\)\s*return/.test(fnBody(ix, 'initHotkeys')))
    ok('гарячі клавіші ігноруються, поки фокус у полі вводу (F1/F2/F5/Esc не зірвуть набір тексту)');
  else bad('гарячі клавіші можуть спрацювати під час набору тексту в полі — ризик випадково закрити вихід');
})();

// ── Пісні: редагування + збережений розмір ──────────────────────────────────
head('Пісні: редагування + розмір');
(function () {
  const ix = SRC.index, ex = SRC.extras, pl = SRC.preload, mn = SRC.main;
  ['editSong', 'editingSongId'].forEach(s => {
    if (new RegExp(s).test(ix + ex)) ok('редагування: ' + s + ' присутній');
    else bad('редагування: немає ' + s);
  });
  if (/id="saveSongBtn"/.test(ix) && /id="addSongCardTitle"/.test(ix))
    ok('редагування: id кнопки та заголовка на місці');
  else bad('редагування: немає saveSongBtn / addSongCardTitle');
  ['applySongSize', 'songSizeStep', 'loadSongSize'].forEach(s => {
    if (new RegExp('function ' + s).test(ex)) ok('розмір пісні: ' + s + ' визначено');
    else bad('розмір пісні: немає ' + s);
  });
  if (/setLockedSize\s*:/.test(pl) && /'set-locked-size'/.test(mn))
    ok('розмір пісні: IPC set-locked-size парний (preload↔main)');
  else bad('розмір пісні: IPC set-locked-size непарний');
})();

// ── Пакування / Windows ─────────────────────────────────────────────────────
head('Пакування / Windows');
(function () {
  const m = SRC.main;
  // ffmpeg: у пакованій збірці шлях має вести в app.asar.unpacked, інакше
  // бінарник не запуститься (спрацьовує в dev, падає в .exe/.app).
  if (/require\('ffmpeg-static'\)/.test(m)) {
    if (/app\.asar\.unpacked/.test(m)) ok('ffmpeg: шлях перенаправляється в app.asar.unpacked (запуститься в пакованій збірці)');
    else bad('ffmpeg: НЕМАЄ заміни app.asar→app.asar.unpacked — конвертація впаде в зібраному застосунку');
  }
  // asarUnpack має витягувати ffmpeg-static
  let pkg = {};
  try { pkg = JSON.parse(read('package.json')); } catch (e) {}
  const unpack = (pkg.build && pkg.build.asarUnpack) || [];
  if (unpack.some(u => /ffmpeg-static/.test(u))) ok('asarUnpack містить ffmpeg-static');
  else bad('asarUnpack не містить ffmpeg-static — бінарник лишиться замкненим в asar');
  // імена файлів: користувацькі назви мають санітизуватись (Windows забороняє \ / : * ? " < > |)
  if (/replace\(\/\[\^a-zA-Z0-9\._-\]\/g/.test(m)) ok('імена файлів санітизуються (безпечно для Windows)');
  else bad('немає санітизації імен файлів — назва з : * ? зламає запис на Windows');
  // Electron 28 = мінімум Windows 10 (не 7/8)
  if (/"electron":\s*"\^?2[89]/.test(read('package.json')) || (pkg.devDependencies && /\^?2[89]/.test(pkg.devDependencies.electron || '')))
    ok('Electron 28+ (мінімум Windows 10, як і треба)');
  if (/^\d+\.\d+\.\d+$/.test(pkg.version || '')) ok('версія застосунку — коректний semver (' + pkg.version + ')');
  else bad('версія "' + (pkg.version || '') + '" не x.y.z — electron-builder відхилить збірку');
})();

// ── Імпорт файлів ────────────────────────────────────────────────────────────
head('Імпорт файлів');
(function () {
  const m = SRC.main, ix = SRC.index, allsrc = SRC.index + '\n' + SRC.extras;
  if (/CONV_VIDEO[^\n]*'mts'[^\n]*'m2ts'/.test(m)) ok('конвертація відео містить AVCHD (.mts/.m2ts з камер)');
  else bad('CONV_VIDEO не містить .mts/.m2ts');
  if (/CONV_AUDIO[^\n]*'ac3'/.test(m)) ok('конвертація аудіо розширена (.ac3 тощо)');
  else bad('CONV_AUDIO не розширено');
  if (/accept="video\/\*[^"]*\.mkv[^"]*\.mts/.test(allsrc)) ok('accept відео перелічує розширення (.mkv/.mts вибираються на Windows)');
  else bad('accept відео лише video/* → .mkv/.mts не вибрати на Windows');
  if (/function uploadBgImages[\s\S]{0,200}loadImageAsDataURL/.test(ix)) ok('фони конвертують HEIC/TIFF (loadImageAsDataURL)');
  else bad('uploadBgImages не конвертує (raw FileReader) — HEIC-фон не імпортується');
  if (/SUPPORTED_MEDIA[^\n]*'avif'/.test(ix)) ok('avif у нативних форматах');
  else bad('avif не додано в SUPPORTED_MEDIA');
})();

// ── Надійність IPC ───────────────────────────────────────────────────────────
head('Надійність IPC');
(function () {
  const lines = SRC.main.split('\n');
  let inH = false, depth = 0, hasTry = false, name = '', buf = '';
  const risky = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!inH) {
      const mm = l.match(/ipcMain\.(handle|on)\(\s*['"]([^'"]+)['"]/);
      if (mm) { inH = true; name = mm[2]; depth = 0; hasTry = false; buf = ''; }
    }
    if (inH) {
      buf += l + '\n';
      if (/\btry\s*\{/.test(l)) hasTry = true;
      for (const c of l) { if (c === '{') depth++; else if (c === '}') depth--; }
      if (buf.length > 2 && /\}\s*\)\s*;?\s*$/.test(l) && depth <= 0) {
        if (!hasTry && /fs\.|writeFile|readFile|spawn|http\.|net\.|dgram|require\(/.test(buf)) risky.push(name);
        inH = false;
      }
    }
  }
  if (!risky.length) ok('усі IPC-обробники з файловими/мережевими операціями захищені try/catch');
  else bad('IPC-обробники без try/catch (виняток = збій виклику з панелі): ' + risky.join(', '));
})();

// ── Нові функції ─────────────────────────────────────────────────────────────
head('Нові функції');
(function () {
  const ix = SRC.index, pz = SRC.index + '\n' + SRC.extras;
  if (/function duplicateSong/.test(pz) && /duplicateSong\(/.test(pz)) ok('дубль пісні (duplicateSong) + кнопка ⧉');
  else bad('немає duplicateSong');
  if (/function ptzSendTo/.test(pz)) ok('ptzSendTo — пресет конкретній камері (основа сцен)');
  else bad('немає ptzSendTo');
  if (/function playScene/.test(pz) && /function addScene/.test(pz) && /id="scenesList"/.test(pz)) ok('сцени продакшену (камера + ATEM однією кнопкою)');
  else bad('сцени продакшену неповні');
  if (/isActive\('ptz'\)/.test(pz) && /e\.key >= '1' && e\.key <= '9'[\s\S]{0,60}ptzPreset/.test(pz)) ok('гарячі клавіші 1-9 для пресетів камери');
  else bad('немає гарячих клавіш пресетів');
  if (/ipcMain\.handle\(\s*'ptz-discover'/.test(SRC.main) && /function ptzDiscoverCams/.test(pz)) ok('автопошук камер (ONVIF WS-Discovery)');
  else bad('немає автопошуку камер');
  if (/function arrangeChorusEach/.test(SRC.extras) && /arrangeChorusEach\(\)/.test(SRC.extras)) ok('кнопка «Приспів після кожного куплета»');
  else bad('немає авто-аранжування приспіву');
  if (/function autoChorusIdx/.test(SRC.extras) && /function toggleChorusEach/.test(SRC.extras) && /toggleChorusEach\(this\.checked\)/.test(SRC.extras))
    ok('перемикач «приспів після кожного куплета» (з автовизначенням приспіву)');
  else bad('немає перемикача chorusEach / автовизначення приспіву');
  if (/function applyArrangePreset/.test(SRC.extras) && /applyArrangePreset\(this\.value\)/.test(SRC.extras) && /'frame'|'last2'|'end'/.test(SRC.extras))
    ok('готові аранжування (приспів у кінці / рамка / останній куплет двічі / тільки куплети)');
  else bad('немає готових пресетів аранжування');
})();

// ── План служби: осиротілі пункти-пісні (relink) ─────────────────────────────
// Регресія з життя: пісню в бібліотеці видалили/перейменували (або дубль-
// чекер прибрав збіг) — пункт плану служби лишався «висіти» і падав з
// незрозумілою помилкою «Пісню «…» не знайдено» прямо в ефірі.
head('План служби: осиротілі пункти-пісні (relink)');
(function () {
  const ex = SRC.extras;
  const svcBody = fnBody(ex, 'renderServiceTab');

  if (/function svcRelink/.test(ex)) ok('svcRelink визначено (прив\'язка пункту до іншої пісні)');
  else bad('немає svcRelink — нема чим полагодити осиротілий пункт');

  const relink = fnBody(ex, 'svcRelink');
  if (/it\.id\s*=\s*s\.id/.test(relink) && /it\.title\s*=\s*s\.title/.test(relink))
    ok('svcRelink оновлює і id, і title пункту (обидва способи пошуку знову працюють)');
  else bad('svcRelink НЕ оновлює id/title — прив\'язка може не полагодити пошук');
  if (/svcInvalidate\(\)/.test(relink)) ok('svcRelink скидає кеш слайдів (інакше стара помилка лишиться на екрані)');
  else bad('svcRelink не викликає svcInvalidate — кеш слайдів може лишити стару помилку');
  if (/saveService\(\)/.test(relink)) ok('svcRelink зберігає план (прив\'язка переживе перезапуск)');
  else bad('svcRelink не зберігає план — прив\'язка загубиться після перезапуску');

  // Виявлення «осиротілості» має перевіряти І id, І title — лише тоді це
  // справді немає способу знайти пісню (звичайний svcSlidesRaw теж робить
  // подвійний пошук, тож логіка виявлення має бути такою ж суворою).
  if (/const broken[\s\S]{0,200}!state\.songs\.find[\s\S]{0,120}!state\.songs\.find/.test(svcBody))
    ok('виявлення "broken" перевіряє і id, і title (узгоджено з пошуком у svcSlidesRaw)');
  else bad('виявлення "broken" неповне — може або пропустити зламаний пункт, або хибно позначити живий');

  if (/broken[\s\S]{0,40}\?\s*['"]⚠️/.test(svcBody)) ok('зламаний пункт видно одразу в списку (іконка + підпис), а не тільки після натискання ▶');
  else bad('зламаний пункт нічим не відрізняється в списку до натискання ▶ — легко пропустити перед службою');

  if (/svcGoTo\(\$\{i\}\)['"][\s\S]{0,40}broken\s*\?\s*['"]disabled/.test(svcBody))
    ok('кнопка ▶ заблокована для зламаного пункту (не можна випадково вивести помилку в ефір)');
  else bad('кнопка ▶ НЕ блокується для зламаного пункту — оператор може вивести помилку прямо на екран у залі');

  if (/id="svcRelink\$\{i\}"/.test(svcBody) && /onclick="svcRelink\(\$\{i\},\s*\$\('#svcRelink\$\{i\}'\)\.value\)"/.test(svcBody))
    ok('у списку є випадаючий список + кнопка 🔗 для прив\'язки без видалення пункту');
  else bad('немає inline-способу прив\'язати пісню просто в плані — довелось би видаляти й додавати пункт заново');

  // Сам fallback-текст помилки (як бекап для випадків, коли з якоїсь причини
  // пункт не позначили "broken", але svcSlidesRaw усе одно не знайшов пісню)
  // має лишатись — це друга лінія захисту, не замінник relink-панелі.
  if (/⚠️ Пісню.*не знайдено/.test(ex)) ok('текстовий фолбек в svcSlidesRaw лишився (друга лінія захисту)');
  else bad('фолбек-повідомлення svcSlidesRaw зникло — не буде взагалі ніякого сигналу про проблему');
})();


// ── Недавні пісні: суфікс слайда «(2/2)» ────────────────────────────────────
(function () {
  const ix = SRC.index, ex = SRC.extras;
  head('Недавні пісні');
  if (/var clean = String\(title\)\.replace/.test(ix))
    ok('openRecentSong прибирає суфікс слайда «(N/M)» — недавня пісня знаходиться');
  else bad('openRecentSong шукає лише точний збіг — «…(2/2)» не знайдеться');
  if (/recordStat\(isBible \? 'bible' : 'song'[\s\S]{0,140}selectedSong\.title/.test(ex))
    ok('recordStat пише чисту назву пісні (без суфікса слайда)');
  else bad('recordStat пише ref із суфіксом — недавні пісні знову ламатимуться');
})();

// ── Аранжування (повністю) ──────────────────────────────────────────────────
head('Аранжування (повністю)');
(function () {
  const ex = SRC.extras, ix = SRC.index;
  if (/function autoChorusIdx/.test(ex) && /приспів|chorus|refrain/i.test(ex))
    ok('автовизначення приспіву (за міткою або словом «Приспів»)');
  else bad('немає автовизначення приспіву');
  if (/function ensureChorusEach/.test(ex) && /ensureChorusEach\(song\)/.test(ix + ex))
    ok('аранжування застосовується одразу при виборі пісні (selectSong→ensureChorusEach)');
  else bad('аранжування НЕ застосовується при виборі пісні');
  if (/function applyArrangePreset/.test(ex) && /'each'/.test(ex) && /'end'/.test(ex) && /'frame'/.test(ex) && /'last2'/.test(ex) && /'verses'/.test(ex))
    ok('усі 5 пресетів аранжування обробляються (each/end/frame/last2/verses)');
  else bad('не всі пресети аранжування обробляються');
  if (/function arrangeVerseIdxs/.test(ex))
    ok('arrangeVerseIdxs — визначення куплетів (усе, що не приспів)');
  else bad('немає arrangeVerseIdxs');
  if (/chorusEach:\s*\{\}/.test(ex) && /_chorusEach/.test(ex))
    ok('прапорець chorusEach у стані + зберігається');
  else bad('chorusEach не в стані / не зберігається');
  if (/loadJSON\([^;]*_chorusEach/.test(ex))
    ok('chorusEach завантажується при старті (в loadOrders)');
  else bad('chorusEach НЕ завантажується — вибір не переживе перезапуск');
  if (/toggleChorusEach\(this\.checked\); renderSongOrderMini\(\)/.test(ix + ex) && /applyArrangePreset\(this\.value\)[\s\S]{0,80}renderSongOrderMini/.test(ix + ex))
    ok('аранжування доступне прямо у вкладці вибору пісні (mini: галочка + пресети)');
  else bad('у вкладці вибору пісні немає швидкого аранжування');
})();

// ── PTZ протокол (байти) ─────────────────────────────────────────────────────
head('PTZ протокол');
(function () {
  const m = SRC.main;
  if (/function viscaPayload/.test(m) && /0x81,\s*0x01,\s*0x06,\s*0x01/.test(m))
    ok('VISCA pan/tilt-байти правильної структури (81 01 06 01 …)');
  else bad('VISCA move-байти неправильні');
  if (/0x04,\s*0x3F/.test(m))
    ok('VISCA пресети (04 3F recall/set) присутні');
  else bad('немає VISCA-команд пресетів');
  if (/proto === 'auto'/.test(m) && /ptzSendViscaUdp[\s\S]{0,260}ptzSendViscaTcp[\s\S]{0,260}ptzSendHttpCgi/.test(m))
    ok('режим «Авто» шле команду всіма протоколами одночасно');
  else bad('режим «Авто» не розсилає всіма протоколами');
  if (/upleft:\[1,1\]/.test(m) && /ptzMove\('downright'\)/.test(SRC.index)) ok('діагональний рух (8 напрямків хрестовини)');
  else bad('немає діагонального руху');
  if (/case 'iris'/.test(m) && /case 'wb'/.test(m) && /function ptzIris/.test(SRC.extras)) ok('діафрагма + баланс білого + фокус one-push (VISCA)');
  else bad('немає iris/WB/onepush');
  if (/c\.name/.test(SRC.extras) && /ptzSetField\('name'/.test(SRC.index)) ok('власні назви камер (Кафедра/Хор/…)');
  else bad('немає назв камер');
  if (/ipcMain\.handle\(\s*'ptz-snapshot'/.test(m) && /function ptzSnapshot/.test(SRC.extras) && /id="ptzSnapImg"/.test(SRC.index)) ok('живе прев\'ю з камери (знімок JPEG + автооновлення)');
  else bad('немає прев\'ю з камери');
  if (/_atemPgmInput = (raw)?[Ss]tate\.program/.test(SRC.extras) && /c\.atemInput === window\._atemPgmInput/.test(SRC.extras) && /id="ptzAtemInput"/.test(SRC.index)) ok('tally — підсвітка камери, що в ефірі ATEM (🔴)');
  else bad('немає tally');
  if (/function ptzPresetName/.test(SRC.extras) && /presetNames/.test(SRC.extras) && /pv2Prompt/.test(SRC.extras)) ok('назви пресетів камери (Кафедра/Хор замість 1-9, через pv2Prompt)');
  else bad('немає назв пресетів');
  if (/inputs:\s*\(function/.test(m) && /function atemLabel/.test(SRC.extras) && /function atemRenameInput/.test(SRC.extras)) ok('назви входів ATEM (авто з пульта + ручне ✎ перейменування)');
  else bad('немає назв входів ATEM');
})();

// ── ATEM розширені команди ───────────────────────────────────────────────────
head('ATEM розширені');
(function () {
  const m = SRC.main;
  const cmds = ['ftb', 'dsk-toggle', 'dsk-auto', 'usk-toggle', 'trans-rate', 'stream-start', 'stream-stop'];
  const miss = cmds.filter(c => !new RegExp("case '" + c + "'").test(m));
  if (!miss.length) ok('усі розширені ATEM-команди на місці (FTB / ключі / трансляція / швидкість)');
  else bad('немає ATEM-команд: ' + miss.join(', '));
  const A2 = SRC.index + '\n' + SRC.extras;
  if (/case 'usk-type'/.test(m) && /usk-type'[\s\S]{0,40}keyType:1/.test(A2)) ok('хромакей K1/K2 (usk-type + вмик/вимк)');
  else bad('немає керування хромакеєм');
  if (/input:3010/.test(A2) && /input:3020/.test(A2)) ok('медіаплеєри MP1/MP2 (заставки в ефір/PVW)');
  else bad('немає медіаплеєрів');
  if (/atemInputLabels = \[[^\]]*'Вхід 8'/.test(A2) && /atemPgmBtn-/.test(A2)) ok('8 входів ATEM + жива підсвітка PGM/PVW на кнопках');
  else bad('входи ATEM не розширені до 8 / немає підсвітки');
  if (/macros:\s*\(atemState\.macro/.test(m) && /id="atemMacroList"/.test(A2) && /atemMacroList/.test(SRC.extras)) ok('макроси ATEM зі списком за назвою (запуск кліком)');
  else bad('немає списку макросів');
  if (/setFairlightAudioMixerSourceProps|setClassicAudioMixerInputProps/.test(m) && /type:'audio-mute',channel:1/.test(A2)) ok('аудіо MIC1/MIC2 (вимк/увімк/AFV, Fairlight+classic)');
  else bad('немає керування аудіо MIC');
  if (/case 'dsk-tie'/.test(m) && /case 'aux'/.test(m) && /type:'dsk-tie'/.test(A2) && /atemAuxSel/.test(A2)) ok('DSK Tie + AUX-вихід (окремий монітор/фід)');
  else bad('немає DSK Tie / AUX');
  if (/case 'dve-pip'/.test(m) && /function atemPip/.test(A2) && /atemPip\('br'\)/.test(A2)) ok('PiP (картинка-в-картинці) з пресетами кутів');
  else bad('немає PiP/DVE');
})();

// ── Ініціалізація: завантажувачі підключені ─────────────────────────────────
head('Ініціалізація (loaders)');
(function () {
  const ex = SRC.extras;
  // Витягуємо список завантажувачів із pv2Init і перевіряємо, що ключові там є
  const need = ['loadOrders', 'loadSongSize', 'loadProps', 'loadLooks', 'loadPartLabels', 'loadSplitCfg', 'loadRoutes'];
  const miss = need.filter(fn => !new RegExp(fn + '\\b').test(ex) || !new RegExp(fn + '\\s*,|' + fn + '\\s*\\(').test(ex));
  // додатково: кожен має бути ВИКЛИКАНИЙ (в списку pv2Init через кому) — ловить «визначено, але не викликається»
  const notCalled = need.filter(fn => new RegExp('function ' + fn + '\\b').test(ex) && !new RegExp(fn + '\\s*,').test(ex) && !new RegExp(fn + '\\(\\)').test(ex));
  if (!notCalled.length) ok('ключові завантажувачі стану підключені в ініціалізацію (' + need.length + ')');
  else bad('визначені, але НЕ викликаються при старті: ' + notCalled.join(', '));
})();

// ── Біблія: діапазони + другоканонічні ──────────────────────────────────────
head('Біблія (розширення)');
(function () {
  const ix = SRC.index, f = SRC.formats;
  if (/function getVerseRangeText/.test(ix) && /function currentBibleRef/.test(ix))
    ok('кілька віршів у діапазоні (getVerseRangeText + currentBibleRef)');
  else bad('немає підтримки діапазону віршів');
  if (/['"]tob['"]/.test(f) && /['"]2ma['"]/.test(f))
    ok('другоканонічні книги у форматних таблицях (tob…2ma)');
  else bad('другоканонічні книги відсутні у formats.js');
})();

// ── Тема / оформлення ────────────────────────────────────────────────────────
head('Тема / оформлення');
(function () {
  const ix = SRC.index, pl = SRC.preload, m = SRC.main, pp = SRC.projPreload;
  if (/setTheme\s*:/.test(pl) && /ipcMain\.handle\(\s*'set-theme'/.test(m) && /ipcRenderer\.on\('set-theme'[\s\S]{0,80}applyTheme/.test(pp))
    ok('тема доходить до проектора (preload → main → projector applyTheme)');
  else bad('ланцюг застосування теми розірвано');
  if (/function onThemeChange/.test(ix) && /function applyThemeToProjector/.test(ix) && /electronAPI\.setTheme\(theme\)/.test(ix))
    ok('вкладка «Тема»: onThemeChange + «Застосувати до проектора» на місці');
  else bad('вкладка «Тема» неповна');
  if (/function toggleThemeLive/.test(ix) && /function themeLivePush/.test(ix) && /themeLivePush\(\)/.test(ix))
    ok('перемикач «застосовувати одразу» (live-тема)');
  else bad('немає live-перемикача теми');
  if (/body\.modern-ui/.test(ix) && /function toggleModernUI/.test(ix) && /church_modern_ui/.test(ix) && !/modern-ui/.test(SRC.projPreload || ''))
    ok('сучасна тема інтерфейсу (перемикач Класичний/Сучасний; проектор не чіпається)');
  else bad('немає сучасної теми / вона зачіпає проектор');
})();

// ── Ефір: блекаут / заморозка / undo ─────────────────────────────────────────
head('Ефір: блекаут / undo');
(function () {
  const A = SRC.index + '\n' + SRC.extras;
  if (/function toggleBlackout/.test(A)) ok('блекаут (toggleBlackout) — клавіша B');
  else bad('немає блекауту');
  if (/function toggleFreeze/.test(A)) ok('заморозка кадру (toggleFreeze)');
  else bad('немає заморозки');
  if (/function pushUndo/.test(A) && /function undoLast/.test(A) && /_undoStack/.test(A)) ok('скасування (undo, стек кроків)');
  else bad('немає undo');
})();

// ── План служби ──────────────────────────────────────────────────────────────
head('План служби');
(function () {
  const A = SRC.index + '\n' + SRC.extras;
  if (/function svcGoTo/.test(A) && /function svcNext/.test(A) && /function svcAddSong/.test(A)) ok('план служби: перехід + додавання пунктів');
  else bad('план служби неповний');
  if (/function svcRelink/.test(A)) ok('перепривʼязка пункту з видаленою піснею (svcRelink)');
  else bad('немає перепривʼязки');
  if (/function songOrder/.test(A) && /state\.chorusEach\[songKey\(song\)\]/.test(A) && /chorusEach\['ord_'/.test(A))
    ok('план служби враховує аранжування (songOrder застосовує chorusEach; кеш інвалідується)');
  else bad('план служби може ігнорувати аранжування');
  if (/function toggleArrangeGlobal/.test(A) && /state\.arrangeGlobal/.test(A) && /\|\| state\.arrangeGlobal/.test(A) && /church_arrange_global/.test(A))
    ok('глобальне аранжування: увімкнув раз — приспів після кожного для ВСІХ пісень');
  else bad('немає глобального аранжування');
  if (/isActive\('service'\)[\s\S]{0,400}svcGoTo/.test(A)) ok('цифри 1-9 → пункт плану служби');
  else bad('немає хоткеїв плану');
})();

// ── Looks / Stage / Props ────────────────────────────────────────────────────
head('Looks / Stage / Props');
(function () {
  const A = SRC.index + '\n' + SRC.extras;
  if (/function applyLook/.test(A) && /function saveLookAs/.test(A)) ok('Looks — пресети виходів');
  else bad('немає Looks');
  if (/function openStageDisplay/.test(A) && /function updateStageDisplay/.test(A)) ok('монітор оператора (stage: поточний/наступний)');
  else bad('немає stage display');
  if (/function toggleProp/.test(A) && /function savePropFromAlert/.test(A)) ok('Props — збережені накладки');
  else bad('немає Props');
})();

// ── Біблія: багатопереклад + пошук ──────────────────────────────────────────
head('Біблія: багатопереклад');
(function () {
  const A = SRC.index + '\n' + SRC.extras;
  if (/function multiBlocksFor/.test(A) && /function getVerseForTranslation/.test(A)) ok('вивід у 3 переклади одночасно');
  else bad('немає багатоперекладу');
  if (/function searchBibleBook/.test(A) && /function selectQuickRef/.test(A)) ok('пошук по книгах + швидке посилання');
  else bad('немає пошуку книг / швидкого посилання');
})();

// ── Аранжування: іменовані варіанти ─────────────────────────────────────────
head('Аранжування: варіанти');
(function () {
  const A = SRC.index + '\n' + SRC.extras;
  if (/function saveNamedArrangement/.test(A) && /function loadNamedArrangement/.test(A) && /function deleteNamedArrangement/.test(A)) ok('іменовані варіанти (зберегти/застосувати/видалити)');
  else bad('немає іменованих варіантів');
  if (/church_arrangesets/.test(A)) ok('варіанти аранжування зберігаються');
  else bad('варіанти не зберігаються');
  if (/state\._slideSong === (key|_liveKey)[\s\S]{0,40}state\.slideIdx === pos/.test(A))
    ok('підсвітка поточної позиції в чипах (▶ активний слайд)');
  else bad('немає підсвітки поточної позиції');
  if (/function orderDragStart/.test(A) && /function orderDrop/.test(A) && /ondragstart="orderDragStart/.test(A))
    ok('перетягування чипів аранжування мишкою (зміна порядку)');
  else bad('немає drag-and-drop чипів');
  if (/function transposeChord/.test(A) && /function setTranspose/.test(A)) ok('транспонування акордів');
  else bad('немає транспонування');
  if (/var SONG_TAGS/.test(A) && /function setSongTag/.test(A) && /function loadSongTags/.test(A) && /loadSongTags/.test(SRC.extras))
    ok('кольорові мітки пісень (категорії + збереження + init)');
  else bad('немає кольорових міток пісень');
})();

// ── Модульна структура ───────────────────────────────────────────────────────
head('Модульна структура');
(function () {
  const ix = SRC.index;
  const mods = ['ptz-ui', 'atem-ui', 'slide-ui', 'song-edit', 'song-display', 'bible'];
  const missing = mods.filter(m => !new RegExp('<script src="' + m + '\\.js"></script>').test(ix));
  if (!missing.length) ok('усі 6 винесених модулів підключені');
  else bad('не підключені модулі: ' + missing.join(', '));
  if (/searchBible = function/.test(SRC.extras)) ok('bible.js: повна версія searchBible (override) присутня');
  else bad('bible.js: override searchBible загублено');
})();

// ── Виправлення (ввід / тема / відновлення) ─────────────────────────────────
head('Виправлення багів');
(function () {
  const ix = SRC.index, ex = SRC.extras;
  if (/_atemRenderPending/.test(ex) && /activeElement/.test(ex) && /INPUT.*TEXTAREA.*SELECT|TEXTAREA/.test(ex))
    ok('onAtemState throttled + не чіпає DOM під час набору (фікс лагів/фокуса)');
  else bad('onAtemState не захищено — можливі лаги й «викидування» вводу');
  if (/body\.light-theme\s*\{[\s\S]{0,80}--bg/.test(ix) && /body\.light-theme \.badge\.accent/.test(ix) && /body\.light-theme input\[type="range"\]/.test(ix))
    ok('світла тема доведена до куточків (badge/повзунки/скролбар/drop/скло)');
  else bad('світла тема неповна');
  if (/function onThemeChange\(\)\s*\{\s*if \(!theme/.test(ix) && /if \(!document\.getElementById\('themeBgType'\)\) return/.test(ix))
    ok('тема захищена від undefined (немає крашу «Cannot set bgType»)');
  else bad('onThemeChange не захищено від undefined theme');
  if (/if \(!announcements \|\| !announcements\.length\)/.test(ix) && /if \(!userBgs \|\| !userBgs\.length\)/.test(ix))
    ok("порожні оголошення/фони не крашать (.length захищено від undefined)");
  else bad("порожні масиви можуть крашити на .length");
  if (/function readTextCompat/.test(ix) && /windows-1251/.test(ix) && /readTextCompatInto/.test(ix))
    ok("імпорт із резервним кодуванням windows-1251 (мердж доопрацювання)");
  else bad("немає резервного кодування");
  if (/function exportTranslations/.test(ix) && /function importTranslations/.test(ix) && /church_translations_/.test(ix))
    ok("експорт/імпорт перекладів Біблії у файл (не втратити при оновленні)");
  else bad("немає збереження перекладів у файл");
  if (/Наступний пункт/.test(SRC.extras)) ok("велика кнопка «Наступний пункт» плану");
  else bad("немає помітної кнопки наступного пункту");
  if (/case 'chroma-adv'/.test(SRC.main) && /case 'chroma-sample'/.test(SRC.main) && /setUpstreamKeyerAdvancedChromaProperties/.test(SRC.main) && /type:'chroma-sample'/.test(ix))
    ok("тонке налаштування хромакею (поріг/краї/спіл + семпл кольору)");
  else bad("немає тонкого налаштування хромакею");
  if (/allow="autoplay; encrypted-media/.test(SRC.extras) && /autoplayPolicy: 'no-user-gesture-required'/.test(SRC.main))
    ok('YouTube: allow=encrypted-media + autoplayPolicy (фікс помилки 153)');
  else bad('YouTube-embed без allow/autoplay — можлива помилка 153');
  if (/if \(Array\.isArray\(data\)\) data = \{ songs: data \}/.test(ix) && /у файлі не знайдено даних/.test(ix))
    ok('відновлення приймає будь-який наш експорт (бекап / пісні / масив)');
  else bad('відновлення бекапу негнучке — round-trip може не працювати');
  if (/function __applyFields/.test(SRC.formats) && /el\.tagName === 'IMG'/.test(SRC.formats) && /backgroundImage/.test(SRC.formats))
    ok('HTML-графіка: лого/зображення підставляється (img.src або фон), не лише текст');
  else bad('HTML-графіка: лого може не з\'являтись');
  if (/function getAllLocalIPs/.test(SRC.main) && /VirtualBox|vEthernet/.test(SRC.main) && /result\.ips/.test(ix))
    ok('синхронізація: обирає реальний LAN-IP (не віртуальний) + показує всі адреси');
  else bad('синхронізація: може показувати не той IP');
})();

console.log('\n' + '─'.repeat(48));
if (failures === 0) {
  console.log(`\x1b[32m\x1b[1mУСЕ ДОБРЕ\x1b[0m — ${checks} перевірок пройдено. Можна збирати.`);
  process.exit(0);
} else {
  console.log(`\x1b[31m\x1b[1mЗНАЙДЕНО ПРОБЛЕМИ: ${failures}\x1b[0m із ${checks} перевірок. Полагодь перед збіркою.`);
  process.exit(1);
}

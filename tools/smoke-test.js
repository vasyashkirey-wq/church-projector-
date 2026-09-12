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
// Нормалізуємо CRLF → LF: на Windows-раннері git checkout конвертує рядки,
// і будь-який regex у цьому файлі з буквальним \n (без \r?) там мовчки
// переставав збігатись, хоча перевірюваний код був повністю коректний —
// саме це завалило build-win на v2.2.3 (сам код не мав жодної проблеми).
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const SRC = {
  index: read('src/index.html'),
  extras: (function(){
    // Автоматично читає УСІ .js-файли в src/, крім тих, що вже мають власний
    // запис нижче (preload.js, projector-preload.js). Так розбиття коду на
    // нові файли (напр. qr.js, bible-translations.js) НЕ вимагає щоразу
    // правити цей список вручну — новий файл підхоплюється сам.
    var fs2 = require('fs');
    var exclude = new Set(['preload.js', 'projector-preload.js', 'formats.js']);
    var parts = fs2.readdirSync(path.join(ROOT, 'src'))
      .filter(function(f){ return /\.js$/.test(f) && !exclude.has(f); })
      .sort();
    var out = parts.map(function(f){ return read('src/' + f); }).join('\n');

    // src/tabs/**/*.js і src/core/**/*.js — куди від 26.08.2026 поетапно
    // виносяться вкладки/спільні функції з extras-*.js та index.html
    // (див. план модуляризації). Функції звідти мають бути видимі тут
    // так само, як і з самих extras-N.js — інакше перевірки на кшталт
    // "функції зі списку ініціалізації існують" хибно падатимуть на
    // кожному наступному етапі виносу коду.
    function readTreeJs(dir) {
      var abs = path.join(ROOT, dir);
      if (!fs2.existsSync(abs)) return '';
      var chunks = [];
      fs2.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach(function(entry) {
        var rel = dir + '/' + entry.name;
        if (entry.isDirectory()) chunks.push(readTreeJs(rel));
        else if (/\.js$/.test(entry.name)) chunks.push(read(rel));
      });
      return chunks.join('\n');
    }
    out += '\n' + readTreeJs('src/tabs') + '\n' + readTreeJs('src/core');
    return out;
  })(),
  formats: read('src/formats.js'),
  main: read('main.js'),
  // Частини головного процесу, винесені з main.js у окремі модулі
  // (src/main/*.js) — потрібні окремо, щоб перевірка IPC-парності бачила
  // ipcMain.handle(...), зареєстровані НЕ в самому main.js.
  mainModules: (function(){
    var dir = path.join(ROOT, 'src', 'main');
    if (!fs.existsSync(dir)) return '';
    return fs.readdirSync(dir)
      .filter(function(f){ return /\.js$/.test(f); })
      .map(function(f){ return read('src/main/' + f); }).join('\n');
  })(),
  projPreload: read('src/projector-preload.js'),
  projHtml: read('src/projector.html'),
  preload: read('src/preload.js'),
  announce: read('src/announce.js'),
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

// ── Ізоляція ранньої ініціалізації (safeInit) ─────────────────────────────
// РЕГРЕСІЯ, яку це виправляє: index.html — один суцільний <script> з
// послідовними top-level викликами (searchSongs, initHotkeys, ...), а ПІСЛЯ
// них — var ANN_STYLES = {...} та інші глобальні дані. Якщо БУДЬ-ЯКИЙ ранній
// виклик кидає виняток, браузер зупиняє виконання ВСЬОГО скрипта — усе, що
// мало виконатись після (зокрема ANN_STYLES), ніколи не отримує значення.
// Наслідок: непов'язана фіча (Оголошення) падає з "Cannot read properties
// of undefined (reading 'dark')", хоча реальний баг був десь раніше.
head('Ізоляція ранньої ініціалізації (safeInit)');
(function () {
  const ix = SRC.index;
  if (/function safeInit\(fn, label\)/.test(ix)) ok('safeInit() визначено на самому початку скрипта');
  else bad('немає safeInit() — рання помилка й далі рве всю подальшу ініціалізацію (ANN_STYLES тощо)');

  const safeInitBody = fnBody(ix, 'safeInit');
  if (/try \{ fn\(\); \}/.test(safeInitBody) || /try\s*\{\s*fn\(\);\s*\}/.test(ix))
    ok('safeInit огортає виклик у try/catch (одна помилка не рве решту)');
  else bad('safeInit не ловить виняток — захист не працює');

  ['searchSongs', 'initHotkeys', 'loadBibleTranslations'].forEach(name => {
    if (new RegExp('safeInit\\(' + name + ',').test(ix))
      ok(name + ' викликається через safeInit (ізольовано від сусідніх ініціалізаторів)');
    else bad(name + ' викликається напряму — його падіння й далі зупинить усе, що йде після нього (напр. ANN_STYLES)');
  });
  if (/safeInit\(function buildBookAliasList\(\)/.test(ix))
    ok('buildBookAliasList викликається через safeInit (ізольовано від сусідніх ініціалізаторів)');
  else bad('buildBookAliasList викликається напряму — його падіння й далі зупинить усе, що йде після нього (напр. ANN_STYLES)');

  // ANN_STYLES реально падав у продакшені (звіт користувача, "Cannot read
  // properties of undefined (reading 'dark')") навіть ПІСЛЯ того, як усі 5
  // відомих ризикованих викликів загорнули в safeInit — бо сам ANN_STYLES
  // стояв ПІСЛЯ них у файлі, і будь-який ще не знайдений ранній виняток
  // так само лишав його undefined.
  //
  // Тепер ANN_STYLES/ANN_KEY/announcements живуть в announce.js — ОКРЕМОМУ
  // <script>-тегу. Це фактично надійніший захист, ніж просто "стояти рано
  // в тому самому файлі": крах БУДЬ-ДЕ в іншому файлі більше не може
  // завадити announce.js виконатись — кожен <script>-тег є незалежним
  // контекстом виконання, тож перевіряємо саме це.
  const hasAnnScriptTag = /<script src="announce\.js">/.test(ix);
  const annFirstFnIdx = SRC.announce.search(/^function\s/m);
  const idxAnnStylesNew = SRC.announce.indexOf('var ANN_STYLES = {');
  if (hasAnnScriptTag && idxAnnStylesNew > -1 && annFirstFnIdx > -1 && idxAnnStylesNew < annFirstFnIdx)
    ok('ANN_STYLES визначається на самому початку announce.js — окремого <script>-тегу, незалежного від крашів деінде');
  else bad('ANN_STYLES більше не стоїть перед усіма ризикованими викликами — каскадне падіння знову може лишити його undefined');

  // ANN_KEY/announcements — той самий каскад, друга половина: користувач
  // отримав ANN_STYLES-фікс, натиснув "Зберегти" оголошення й отримав НОВИЙ
  // крах, бо announcements (var announcements = []) так само стояв ПІСЛЯ
  // ризикованих викликів — announcements.push(...) у saveAnnounce() падав
  // без жодного захисту, коли announcements лишався undefined.
  const idxAnnKeyNew = SRC.announce.indexOf('var ANN_KEY = ');
  const idxAnnArrNew = SRC.announce.indexOf('var announcements = [];');
  if (hasAnnScriptTag && idxAnnKeyNew > -1 && idxAnnArrNew > -1 && annFirstFnIdx > -1 && idxAnnKeyNew < annFirstFnIdx && idxAnnArrNew < annFirstFnIdx)
    ok('ANN_KEY/announcements визначаються на самому початку announce.js, перед будь-якою функцією');
  else bad('ANN_KEY/announcements більше не стоять перед усіма ризикованими викликами — "Зберегти" оголошення знову може впасти');

  // Решта прямих (не загорнутих у safeInit) top-level викликів, знайдених
  // у тому ж скрипті при повторному аудиті — кожен з них теж міг обірвати
  // все, що йде після нього, якщо електронний preload не дав очікуваний метод.
  // loadAnnouncements тепер в announce.js, initBgLibrary — в background.js
  // (обидва в SRC.extras), refreshDisplays досі в index.html.
  if (/safeInit\(loadAnnouncements,/.test(SRC.extras))
    ok('loadAnnouncements() викликається через safeInit (ізольовано від сусідніх ініціалізаторів)');
  else bad('loadAnnouncements() викликається напряму — його падіння й далі зупинить усе, що йде після нього');
  if (/safeInit\(initBgLibrary,/.test(SRC.extras))
    ok('initBgLibrary() викликається через safeInit (ізольовано від сусідніх ініціалізаторів)');
  else bad('initBgLibrary() викликається напряму — його падіння й далі зупинить усе, що йде після нього');
  if (new RegExp('safeInit\\(refreshDisplays,').test(SRC.extras))
    ok('refreshDisplays() викликається через safeInit (ізольовано від сусідніх ініціалізаторів)');
  else bad('refreshDisplays() викликається напряму — його падіння й далі зупинить усе, що йде після нього');
  // indexOf замість regex із буквальним \n: на Windows-раннері git checkout
  // конвертує LF → CRLF, і regex із голим \n (без \r?) там мовчки не збігався,
  // хоча код був повністю коректний — це й завалило build-win на v2.2.3.
  const idxGetOutputConfigWrap = SRC.extras.indexOf("safeInit(function() {\n  if (window.electronAPI) {\n    window.electronAPI.getOutputConfig");
  if (idxGetOutputConfigWrap > -1)
    ok('getOutputConfig/onDisplaysChanged загорнуто в safeInit');
  else bad('getOutputConfig/onDisplaysChanged викликається напряму поза safeInit');
  const idxGetThemeLabel = SRC.extras.indexOf("'onRemoteCommand/getTheme'");
  const idxOnRemoteCmdCall = idxGetThemeLabel > -1 ? SRC.extras.lastIndexOf('window.electronAPI.onRemoteCommand', idxGetThemeLabel) : -1;
  const idxOnRemoteCmdWrap = SRC.extras.lastIndexOf('safeInit(function() {', idxOnRemoteCmdCall > -1 ? idxOnRemoteCmdCall : 0);
  if (idxOnRemoteCmdCall > -1 && idxOnRemoteCmdWrap > -1 && (idxOnRemoteCmdCall - idxOnRemoteCmdWrap) < 200)
    ok('onRemoteCommand/getTheme загорнуто в safeInit');
  else bad('onRemoteCommand/getTheme викликається напряму поза safeInit');

  // Конкретний незахищений DOM-доступ, знайдений у цьому ревʼю: якщо
  // #bibleTranslationsList відсутній у DOM (напр. вкладка ще не змонтована),
  // .innerHTML на null кидав TypeError і рвав усе, що йде далі в скрипті.
  const renderBody = fnBody(SRC.extras, 'renderBibleTranslationsList');
  if (/if \(!el\) return;/.test(renderBody))
    ok('renderBibleTranslationsList має null-guard на #bibleTranslationsList');
  else bad('РЕГРЕСІЯ: renderBibleTranslationsList знову без null-guard — відсутній елемент знову зупинить увесь подальший скрипт');
})();

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
  const mainAll = SRC.main + '\n' + SRC.mainModules;
  while ((m = re2.exec(mainAll))) handled.add(m[1]);
  const missing = [...invokes].filter(x => !handled.has(x)).sort();
  if (!missing.length) ok('усі ' + invokes.size + ' IPC-виклики з preload мають обробник у main.js (+ src/main/*.js)');
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

// ── Аудит 4.1: навігаційна безпека вікон, що показують контент ───────────
head('Аудит 4.1: output/Stage/identify-вікна не можуть навігувати/відкривати нові вікна');
(function () {
  const m = SRC.main;
  // safeInit(loadDisplayToggles) мусить стояти ПІСЛЯ усіх top-level const/var,
  // від яких залежить тіло функції (loadJSON, STORAGE_KEYS, state) — перший
  // фікс переносив виклик лише за loadJSON і цього виявилось замало (впало
  // вдруге на «Cannot access 'STORAGE_KEYS' before initialization»). Тепер
  // виклик — у САМОМУ КІНЦІ файлу, тож перевіряємо саме це напряму, а не
  // ганяємось за черговою залежністю: він має бути ПІСЛЯ loadJSON, STORAGE_KEYS
  // і var state, і НЕ мати більше нічого істотного після себе в файлі.
  const ex1 = read('src/extras-1.js');
  const iFn = ex1.indexOf('function loadDisplayToggles');
  const iConst = ex1.indexOf('const loadJSON = key =>');
  const iStorageKeys = ex1.indexOf('const STORAGE_KEYS = {');
  const iState = ex1.indexOf('var state = {');
  const iSafe = ex1.lastIndexOf("safeInit(loadDisplayToggles, 'loadDisplayToggles')");
  if ([iFn, iConst, iStorageKeys, iState, iSafe].every(x => x >= 0) &&
      iFn < iConst && iConst < iStorageKeys && iStorageKeys < iState && iState < iSafe &&
      (ex1.length - iSafe) < 250)   // майже останній рядок файлу — не десь посередині
    ok('loadDisplayToggles: safeInit викликається ПІСЛЯ loadJSON, STORAGE_KEYS і var state (без TDZ)');
  else bad('РЕГРЕСІЯ TDZ: safeInit(loadDisplayToggles) знову стоїть до однієї зі своїх залежностей — впаде при старті');
})();

head('Аварійна панель: не потрапляє в containing-block-пастку backdrop-filter/.topbar');
(function () {
  const ix = SRC.index;
  // #emergencyPanel мусить бути ПОЗА .topbar (і взагалі поза .app) — інакше
  // в темі modern-ui, де .topbar має backdrop-filter, position:fixed
  // прив'язується до .topbar (не до екрана), і стек-контекст панелі
  // опиняється замкнений там, малюючись РАНІШЕ за .content — панель
  // технічно відкрита, але фізично намальована ПІД основним контентом.
  const iPanel = ix.indexOf('id="emergencyPanel"');
  const iBtn = ix.indexOf('id="emergencyBtn"');
  if (iBtn >= 0 && iPanel > iBtn && /<\/div>\s*\n<\/div>\s*\n\s*\n<!-- Аварійна панель/.test(ix.slice(iBtn, iPanel + 50)))
    ok('#emergencyPanel винесена за межі .topbar/.app (не потрапляє в пастку backdrop-filter)');
  else bad('РЕГРЕСІЯ: #emergencyPanel знову всередині .topbar — «modern-ui» знову намалює її позаду контенту');
  if (/z-index:2000000000/.test(ix))
    ok('#emergencyPanel: z-index із великим запасом понад усі відомі overlay (100000/99999)');
  else bad('#emergencyPanel: z-index знову замалий — конфлікт із pv2Prompt/банером помилки можливий');
  if (/backdrop-filter:blur\(18px\) saturate\(1\.6\)/.test(ix))
    ok('(довідково) підтверджено: modern-ui .topbar і досі має backdrop-filter — тому винесення панелі досі критичне');
})();

head('Аудит 4.1: output/Stage/identify-вікна не можуть навігувати/відкривати нові вікна');
(function () {
  const m = SRC.main;
  if (/function hardenContentWindow\(win\)/.test(m) &&
      /will-navigate.*=>\s*\{\s*e\.preventDefault\(\);\s*\}\)/.test(m) &&
      /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/.test(m))
    ok('hardenContentWindow(win) визначена: блокує will-navigate і window.open');
  else bad('ЗНИКЛА hardenContentWindow — output-вікна знову можуть навігувати на сторонній URL');
  // Порядок у файлі підтверджує, що виклик стоїть у функції СТВОРЕННЯ
  // output-вікна (до loadFile), а не десь у непов'язаному місці.
  if (/const win = new BrowserWindow\(\{[\s\S]{0,2400}hardenContentWindow\(win\);[\s\S]{0,400}outputWins\[kind\] = win;/.test(m))
    ok('output-вікно (projector/stream/out3/out4) захищене hardenContentWindow');
  else bad('output-вікно НЕ викликає hardenContentWindow — регресія безпеки 4.1');
  if (/hardenContentWindow\(win\);\s*\n\s*stageWin = win;/.test(m))
    ok('Stage-вікно захищене hardenContentWindow');
  else bad('Stage-вікно НЕ викликає hardenContentWindow — регресія безпеки 4.1');
  if (/hardenContentWindow\(w\);\s*\n\s*w\.setAlwaysOnTop\(true, 'screen-saver'\);\s*\n\s*identifyWins\.push/.test(m))
    ok('identify-вікна (номери моніторів) захищені hardenContentWindow');
  else bad('identify-вікна НЕ захищені hardenContentWindow — регресія безпеки 4.1');
  // webviewTag: true прибрано з output-вікна — підтверджений мертвий код
  // (у projector.html немає жодного <webview>, лише звичайний <iframe>)
  if (!/webviewTag:\s*true/.test(m))
    ok('webviewTag:true прибрано з output-вікна (підтверджено невживаним)');
  else bad('webviewTag:true повернувся — або справді знадобився (перевір), або регресія прибирання');
})();

// ── Свіжі фічі: «На вихід / Прибрати з» (Біблія/QR) + маркер кінця пісні ──
head('Нові фічі: адресний вивід/прибирання (Біблія, QR) + *** в кінці пісні');
(function () {
  const ix = SRC.index, ex = SRC.extras;

  // Біблія — картка «Обраний вірш»: один динамічний рядок кнопок (той самий
  // патерн, що вже в H2R-титрах: кнопка сама підсвічується 🔴, коли вірш
  // там в ефірі; «✕ Прибрати» показується лише для активних виходів) —
  // замість двох статичних рядів по 4 кнопки завжди.
  if (/function clearBibleFrom\(n\)/.test(ex))
    ok('clearBibleFrom(n) визначена (bible.js)');
  else bad('ЗНИКЛА clearBibleFrom(n) — кнопки «Прибрати з» у Біблії поламаються');
  if (/id="bibleOutputRow"/.test(ix))
    ok('Біблія: контейнер #bibleOutputRow на місці (динамічний рядок кнопок)');
  else bad('ЗНИК #bibleOutputRow — нема куди рендерити кнопки виходів у Біблії');
  if (/function renderBibleOutputRow\(\)/.test(ex) &&
      /onclick="sendBibleWithGraphics\(' \+ n \+ '\)"/.test(ex) &&
      /onclick="clearBibleFrom\(' \+ n \+ '\)"/.test(ex))
    ok('renderBibleOutputRow(): кнопки На вихід/Прибрати генеруються по всіх n через sendBibleWithGraphics/clearBibleFrom');
  else bad('renderBibleOutputRow зламана або не викликає sendBibleWithGraphics/clearBibleFrom для кожного n');
  if (/function bibleGraphicsTo[\s\S]{0,4200}renderBibleOutputRow\(\);/.test(ex))
    ok('bibleGraphicsTo викликає renderBibleOutputRow() після надсилання — кнопки оновлюються');
  else bad('bibleGraphicsTo НЕ оновлює renderBibleOutputRow — кнопки лишаться застарілими після надсилання');
  if (/pv2ClearOutput\(n\);[\s\S]{0,600}renderBibleOutputRow\(\);/.test(ex))
    ok('clearBibleFrom використовує канонічний pv2ClearOutput(n) (як H2R), не саморобний порожній HTML');
  else bad('clearBibleFrom не використовує pv2ClearOutput — регресія на саморобний блок-HTML');
  if (/function renderMultiTransCard[\s\S]{0,50}\{[\s\S]{0,3200}onclick="clearBibleFrom\(\$\{n\}\)"/.test(ex))
    ok('Біблія: картка «Кілька перекладів» теж має «Прибрати з» на кожен активний вихід');
  else bad('Картка «Кілька перекладів» без «Прибрати з» — лишився старий пробіл');

  // clearBibleFrom має знімати вихід і з lastLiveGraphicsTargets, і з
  // state.multiLive — інакше гортання стрілками поверне вірш назад
  // одразу після того, як його прибрали.
  if (/function clearBibleFrom[\s\S]{0,600}lastLiveGraphicsTargets = lastLiveGraphicsTargets\.filter/.test(ex) &&
      /function clearBibleFrom[\s\S]{0,900}state\.multiLive = state\.multiLive\.filter/.test(ex))
    ok('clearBibleFrom знімає вихід і з lastLiveGraphicsTargets, і з state.multiLive');
  else bad('clearBibleFrom не чистить весь стан гортання — вірш може «повернутись» стрілками');

  // QR-екран: той самий динамічний патерн — контейнер + рендер-функція
  // замість двох статичних рядів по 4 кнопки.
  if (/function sendQrScreenTo\(n\)/.test(ex) && /function clearQrScreenFrom\(n\)/.test(ex))
    ok('sendQrScreenTo(n) / clearQrScreenFrom(n) визначені (extras-3.js)');
  else bad('ЗНИКЛИ sendQrScreenTo/clearQrScreenFrom — вкладка QR-екран без адресних кнопок');
  if (/id="qrOutputRow"/.test(ex))
    ok('QR-екран: контейнер #qrOutputRow на місці (динамічний рядок кнопок)');
  else bad('ЗНИК #qrOutputRow — нема куди рендерити кнопки виходів у QR-екрані');
  if (/var qrLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(ex) && /function renderQrOutputRow\(\)/.test(ex))
    ok('QR-екран: qrLiveMap + renderQrOutputRow() — кнопки самі підсвічуються 🔴, коли QR в ефірі');
  else bad('QR-екран: зникло відстеження живих виходів (qrLiveMap/renderQrOutputRow)');
  if (/qrLiveMap\[n\] = true;\s*\n\s*renderQrOutputRow\(\);/.test(ex) && /pv2ClearOutput\(n\);\s*\n\s*qrLiveMap\[n\] = false;/.test(ex))
    ok('QR-екран: sendQrScreenTo/clearQrScreenFrom оновлюють qrLiveMap і використовують pv2ClearOutput');
  else bad('QR-екран: sendQrScreenTo/clearQrScreenFrom не оновлюють qrLiveMap коректно');
  // Старий хоткей «qr-send» має й далі працювати (sendQrScreen лишилась як обгортка)
  if (/function sendQrScreen\(\) \{ sendQrScreenTo\(qrState\(\)\.target \|\| 1\); \}/.test(ex))
    ok('sendQrScreen() (хоткей «qr-send») делегує в sendQrScreenTo — сумісність збережена');
  else bad('sendQrScreen() більше не делегує в sendQrScreenTo — хоткей «qr-send» зламається');

  // sendMultiToOutput має сам перемкнути маршрут виходу, якщо він ще
  // «Дзеркало» — інакше звичайний broadcast мовчки перезапише переклади
  if (/function sendMultiToOutput[\s\S]{0,1200}outputRoutes\[n\] \|\| 'mirror'\) === 'mirror'[\s\S]{0,120}setOutputRoute\(n, 'text'\)/.test(ex))
    ok('sendMultiToOutput сам вимикає «Дзеркало» на виході — захист від перезапису broadcast’ом');
  else bad('sendMultiToOutput НЕ перемикає маршрут — «Кілька перекладів» знову можна мовчки перезаписати');

  // Пісня: *** у кінці — і без аранжування (sendToProjector), і з ним (songStep)
  if (/selectedVerseIdx === selectedSong\.verses\.length - 1\) text \+= '\\n\\n\*\*\*'/.test(ex))
    ok('Пісня без аранжування: *** додається на останньому куплеті (sendToProjector)');
  else bad('Пісня без аранжування: маркер кінця *** зник із sendToProjector');
  if (/\(i === slides\.length - 1\) \? \(sl\.text \+ '\\n\\n\*\*\*'\) : sl\.text/.test(ex))
    ok('Пісня з аранжуванням: *** додається на останньому слайді (songStep)');
  else bad('Пісня з аранжуванням: маркер кінця *** зник із songStep');
})();

// ── Гарячі клавіші F1/F2/F5/Esc: справді відкривають/закривають ──────────────
head('Гарячі клавіші F1/F2/F5/Esc');
(function () {
  const ix = SRC.index, pl = SRC.preload, ex = SRC.extras;

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
  // F1-F5 (відкрити/закрити виходи) перенесено з захардкодженого switch у
  // index.html в перепризначуване меню «Клавіші» (state.hotkeys, диспетчер
  // у extras-4.js) — на macOS ці клавіші за замовчуванням займає сама
  // система (яскравість/Mission Control/Launchpad), тож оператору треба
  // мати змогу призначити інші.
  const swCase = (ex.match(/case 'toggle-both':[\s\S]{0,160}/) || [''])[0];
  if (/toggleBothOutputs\(\)/.test(swCase)) ok('дія toggle-both викликає toggleBothOutputs (перепризначувана, не захардкоджений F5)');
  else bad('дія toggle-both не викликає toggleBothOutputs — регресія');

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

// ── PDF/слайди в ефірі: гортання не має "витікати" в пісню/вірш ─────────────
// РЕГРЕСІЯ З ЖИТТЯ (звіт користувача): надіслав сторінку PDF в ефір, натиснув
// Пробіл/Стрілку очікуючи погортати PDF — а замість цього в ефір летіла
// пісня чи вірш ПОВЕРХ щойно показаного PDF. Причина: sendImageToProjector
// (спільна точка для PDF-сторінок і власних слайдів) НІКОЛИ не виставляла
// lastLiveSource, тож усі три диспетчери next/prev (гарячі клавіші, пульт/
// OSC, fallback-обробник) бачили стару 'song'/'bible' (або їх відсутність) і
// падали на фолбек nextVerse()/nextBibleVerse().
//
// ДРУГА ХВИЛЯ (знайдено повторним аудитом): перший фікс позначав і PDF-
// сторінку, і РУЧНИЙ слайд з "Редактора слайдів" ОДНАКОВО як 'slide' — тож
// nextSlide()/prevSlide() (які вміють гортати лише PDF) або нічого не робили
// при показі ручного слайда (якщо PDF цього сеансу не відкривали), або
// тихо підміняли його СТАРОЮ сторінкою раніше відкритого PDF. Тепер
// sendImageToProjector приймає sourceTag: 'pdf' від sendSlideToProjector,
// 'slide' (за замовчуванням) від sendCustomSlide/sendSavedSlide — і лише
// 'pdf' гортається клавішами/пультом.
head('PDF/слайди: гортання лишається на PDF, не "перестрибує" на пісню чи ручний слайд');
(function () {
  const ix = SRC.index, ex = SRC.extras;
  const sendImgBody = fnBody(ex, 'sendImageToProjector');
  if (/lastLiveSource\s*=\s*sourceTag\s*\|\|\s*'slide'/.test(sendImgBody))
    ok("sendImageToProjector позначає lastLiveSource=sourceTag (PDF/слайд визнається джерелом в ефірі, з розрізненням)");
  else bad('sendImageToProjector не виставляє lastLiveSource через sourceTag — PDF і ручний слайд знову можуть плутатись');

  const sendSlideBody = fnBody(ex, 'sendSlideToProjector');
  if (/sendImageToProjector\([^)]*'pdf'\)/.test(sendSlideBody))
    ok("sendSlideToProjector передає sourceTag='pdf' (PDF-сторінка відрізняється від ручного слайда)");
  else bad("sendSlideToProjector не передає 'pdf' — знову зіллється з ручними слайдами Редактора слайдів");

  const sendCustomBody = fnBody(ex, 'sendCustomSlide');
  const sendSavedBody = fnBody(ex, 'sendSavedSlide');
  if (!/'pdf'/.test(sendCustomBody) && !/'pdf'/.test(sendSavedBody))
    ok("sendCustomSlide/sendSavedSlide НЕ позначають себе як 'pdf' (ручний слайд не гортається як PDF)");
  else bad('sendCustomSlide/sendSavedSlide помилково позначають себе як PDF — regression Finding 1');

  const nextSlideBody = fnBody(ex, 'nextSlide');
  const prevSlideBody = fnBody(ex, 'prevSlide');
  if (/lastLiveSource === 'pdf'[\s\S]{0,30}sendSlideToProjector\(\)/.test(nextSlideBody) &&
      /lastLiveSource === 'pdf'[\s\S]{0,30}sendSlideToProjector\(\)/.test(prevSlideBody))
    ok('nextSlide/prevSlide оновлюють проектор, поки PDF (не ручний слайд) в ефірі (не лише локальний прев\'ю)');
  else bad('nextSlide/prevSlide не пушать нову сторінку в ефір — зал бачить застарілу сторінку');

  // У кожному з диспетчерів next/prev перевірка lastLiveSource==='pdf'
  // МАЄ стояти РАНІШЕ за фолбек на state.selectedSong/nextVerse — інакше
  // стара вибрана пісня все одно перехопить команду першою.
  function slideBeforeSongFallback(body, fallbackRe) {
    const slideIdx = body.search(/lastLiveSource === 'pdf'/);
    const fallbackIdx = body.search(fallbackRe);
    return slideIdx > -1 && fallbackIdx > -1 && slideIdx < fallbackIdx;
  }
  // initHotkeys оголошує pdfLive = (lastLiveSource === 'pdf') окремою
  // змінною ПЕРЕД switch (як і bibleLive) — у самому тілі case перевірка
  // виглядає як "pdfLive &&", а не буквальне порівняння.
  const hotkeyNext = (ix.match(/case ' ':[\s\S]{0,520}?break;/) || [''])[0];
  const slideVarIdx = hotkeyNext.search(/pdfLive\s*&&/);
  const songFallbackIdx = hotkeyNext.search(/selectedSong\)\s*\{\s*nextVerse/);
  if (/var pdfLive = \(typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf'\)/.test(ix) &&
      slideVarIdx > -1 && songFallbackIdx > -1 && slideVarIdx < songFallbackIdx)
    ok('initHotkeys (fallback-обробник, Пробіл): PDF перевіряється до фолбеку на вибрану пісню');
  else bad('initHotkeys: фолбек на вибрану пісню може перехопити Пробіл раніше за PDF');

  const remoteSwitch = fnBody(ex, 'initRemoteListener');
  if (slideBeforeSongFallback(remoteSwitch, /nextVerse === 'function'\)\s*\{\s*nextVerse/))
    ok('пульт/OSC (initRemoteListener): PDF перевіряється до фолбеку на nextVerse');
  else bad('пульт/OSC: фолбек на nextVerse може перехопити команду раніше за PDF');

  const hotkeyHandlerBody = ex; // глобальний keydown-обробник extras-4.js — шукаємо весь файл
  if (slideBeforeSongFallback(hotkeyHandlerBody, /state\.selectedSong\)\s*\{\s*nextVerse/))
    ok('глобальні гарячі клавіші (extras-4.js): PDF перевіряється до фолбеку на вибрану пісню');
  else bad('глобальні гарячі клавіші: фолбек на вибрану пісню може перехопити команду раніше за PDF');

  // Резервний onRemoteCommand (діє лише якщо основний обробник десь вище не
  // спрацював) — перенесено разом з рештою блоку в theme-remote.js. Шукаємо
  // за унікальною міткою 'onRemoteCommand/getTheme', а не за загальною фразою
  // «Далі — запасний варіант» — вона повторюється і в НЕпов'язаному
  // фолбеку гарячих клавіш плану служби, який лишився в index.html.
  const idxGetThemeLabel2 = SRC.extras.indexOf("'onRemoteCommand/getTheme'");
  const fallbackRemote = idxGetThemeLabel2 > -1 ? SRC.extras.slice(Math.max(0, idxGetThemeLabel2 - 4000), idxGetThemeLabel2) : '';
  if (slideBeforeSongFallback(fallbackRemote, /cmd\.action === 'next-verse'\)\s*\{\s*nextVerse/))
    ok('index.html: резервний onRemoteCommand теж перевіряє PDF до фолбеку на nextVerse');
  else bad('index.html: резервний onRemoteCommand (extras.js не завантажився) не захищений від PDF-регресії');
})();

// ── Кошик пісень: restoreSong не має стирати всю базу ────────────────────────
// РЕГРЕСІЯ (виявлено повторним аудитом, попереджувала будь-які зміни цієї
// сесії): restoreSong() викликав saveSongs() БЕЗ аргументу. saveSongs(songs)
// робить JSON.stringify(songs) → undefined, а bigStoreSet трактує undefined
// як '' — church_songs_db записувався ПОРОЖНІМ рядком. Поточна сесія й далі
// працювала б нормально (currentSongs у пам'яті вже мав відновлену пісню),
// але наступний запуск програми (loadSongs) бачив би порожній рядок,
// вважав би що збереженого нема, і тихо скидав УСЮ базу пісень до кількох
// вбудованих за замовчуванням — щойно оператор відновив пісню з кошика й
// закрив програму без жодної іншої зміни.
head('Кошик пісень: restoreSong зберігає ПОВНИЙ список (не стирає базу)');
(function () {
  const restoreBody = fnBody(SRC.extras, 'restoreSong');
  if (/saveSongs\(currentSongs\)/.test(restoreBody))
    ok('restoreSong викликає saveSongs(currentSongs) — з аргументом, база не затирається');
  else bad('restoreSong викликає saveSongs без аргументу — наступний запуск програми стирає всю базу пісень');
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
  if (/function uploadBgImages[\s\S]{0,200}loadImageAsDataURL/.test(SRC.extras)) ok('фони конвертують HEIC/TIFF (loadImageAsDataURL)');
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

  // Збірники пісень: поле при додаванні/редагуванні + фільтр-select у списку
  // «Всі пісні в базі», що звужує пошук лише до обраного збірника.
  const seBody = pz; // song-edit.js входить у SRC.extras
  if (/id="newSongBook"/.test(ix)) ok('поле «Збірник» у формі додавання пісні');
  else bad('немає поля збірника при додаванні пісні');
  if (/id="songBookFilter"/.test(ix)) ok('фільтр-select збірників у списку «Всі пісні в базі»');
  else bad('немає фільтра збірників у списку пісень');
  if (/function renderSongBookOptions/.test(seBody)) ok('renderSongBookOptions наповнює фільтр + автодоповнення унікальними збірниками');
  else bad('немає renderSongBookOptions');
  const addBody = fnBody(seBody, 'addNewSong');
  if (/songbook\s*:\s*songbook/.test(addBody) || /ex\.songbook\s*=\s*songbook/.test(addBody))
    ok('addNewSong зберігає збірник (і при створенні, і при оновленні)');
  else bad('addNewSong не зберігає поле збірника');
  // Після пакетування (rafDebounce) справжня реалізація живе в
  // _renderAllSongsNow, а renderAllSongs — тонка обгортка. Перевіряємо
  // саме реалізацію, інакше тест дивився б у порожню обгортку.
  const renderAllBody = fnBody(seBody, '_renderAllSongsNow') || fnBody(seBody, 'renderAllSongs');
  if (/s\.songbook \|\| ''\)\.trim\(\) === book/.test(renderAllBody))
    ok('renderAllSongs фільтрує список за обраним збірником (з trim, узгоджено з renderSongBookOptions)');
  else bad('renderAllSongs не фільтрує за збірником, або забув .trim() — можлива розбіжність із випадаючим списком');

  // Легасі-вкладка "Backup" (restoreAllOld_UNUSED) реконструює пісні з нуля
  // при відновленні бекапу — songbook МАЄ бути серед перенесених полів,
  // інакше відновлення бекапу тихо стирає всі призначення збірників.
  const restoreOldBody = fnBody(ix, 'restoreAllOld_UNUSED');
  if (/songbook\s*:\s*s\.songbook/.test(restoreOldBody))
    ok('restoreAllOld_UNUSED переносить songbook при відновленні бекапу');
  else bad('restoreAllOld_UNUSED губить songbook при відновленні — призначення збірників зникнуть');
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
  if (/function getVerseRangeText/.test(SRC.extras) && /function currentBibleRef/.test(SRC.extras))
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
  if (/function onThemeChange/.test(SRC.extras) && /function applyThemeToProjector/.test(SRC.extras) && /electronAPI\.setTheme\(theme\)/.test(SRC.extras))
    ok('вкладка «Тема»: onThemeChange + «Застосувати до проектора» на місці');
  else bad('вкладка «Тема» неповна');
  if (/function toggleThemeLive/.test(SRC.extras) && /function themeLivePush/.test(SRC.extras) && /themeLivePush\(\)/.test(SRC.extras))
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

// ── Захист від відсутньої розмітки (крихкість на завантаженні модуля) ─────────
// Модулі — звичайні <script> у спільній області. Якщо на верхньому рівні звернутись
// до getElementById(...).addEventListener без перевірки на null, а розмітку колись
// приберуть/перейменують — модуль впаде на старті й обірве решту свого коду.
head('Захист від відсутньої розмітки');
(function () {
  const s = SRC.extras;
  // 1) PDF-dropzone у slide-ui.js має бути під null-guard
  const i = s.indexOf("getElementById('pdfDrop')");
  if (i < 0) {
    ok('pdfDrop: блок не знайдено (пропущено — можливо, прибрано навмисно)');
  } else {
    const win = s.slice(i, i + 220);
    if (/if\s*\(\s*drop\s*\)/.test(win)) ok('slide-ui: dropzone #pdfDrop під null-guard (if (drop))');
    else bad('slide-ui: #pdfDrop використовується без перевірки на null — впаде на старті, якщо розмітку прибрати');
  }
  // 2) pdfInput усередині drop-обробника теж має бути під перевіркою
  if (i >= 0) {
    const win2 = s.slice(i, i + 600);
    const usesInput = /getElementById\('pdfInput'\)/.test(win2);
    const guarded = /if\s*\(\s*inp\s*\)/.test(win2) || !/getElementById\('pdfInput'\)\s*\.\s*files/.test(win2);
    if (!usesInput || guarded) ok('slide-ui: доступ до #pdfInput у drop-обробнику захищено');
    else bad('slide-ui: #pdfInput читається без перевірки на null у drop-обробнику');
  }
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
  if (/function onThemeChange\(\)\s*\{\s*if \(!theme/.test(SRC.extras) && /if \(!document\.getElementById\('themeBgType'\)\) return/.test(SRC.extras))
    ok('тема захищена від undefined (немає крашу «Cannot set bgType»)');
  else bad('onThemeChange не захищено від undefined theme');
  if (/if \(!announcements \|\| !announcements\.length\)/.test(SRC.extras) && /if \(!userBgs \|\| !userBgs\.length\)/.test(SRC.extras))
    ok("порожні оголошення/фони не крашать (.length захищено від undefined)");
  else bad("порожні масиви можуть крашити на .length");
  if (/var annEditingId = null;/.test(SRC.extras) && /existing\.title = title;/.test(SRC.extras) && /annEditingId = id;/.test(SRC.extras))
    ok("БАГ (редагування оголошення створює дублікат): saveAnnounce тепер оновлює на місці");
  else bad("редагування оголошення може мовчки створити дублікат замість оновлення");
  if (/const filtered = saved\.filter\(i => song\.verses\[i\] != null\);\s*\n\s*if \(filtered\.length\) return filtered;/.test(SRC.extras) && /delete state\.orders\[key\];/.test(SRC.extras))
    ok("БАГ (відредагована пісня → 0 слайдів): застарілий порядок відкидається, не показує порожньо");
  else bad("БАГ НЕ перенесено: редагування пісні може дати 0 слайдів");
  if (/function ensureChorusEach/.test(SRC.extras) && /if \(Array\.isArray\(state\.orders\[songKey\(song\)\]\) && state\.orders\[songKey\(song\)\]\.length\) return;/.test(SRC.extras))
    ok("БАГ (ручний drag мовчки скидається): ensureChorusEach не чіпає вже збережений порядок");
  else bad("БАГ НЕ перенесено: вибір пісні може стерти ручне перетягування чипів");
  if (/notify\('◀ ' \+ state\.service\.items\[pi\]\.title \+ ' \(без слайдів\)'\)/.test(SRC.extras))
    ok("БАГ (◀ Назад тихо застрягає на пункті без слайдів): svcPrev тепер сповіщає явно");
  else bad("БАГ НЕ перенесено: svcPrev може мовчки застрягати на пункті без слайдів");
  if (/const wasCurrent = \(i === state\.service\.idx\);/.test(SRC.extras) && /if \(wasCurrent\) state\.service\.slideIdx = 0;/.test(SRC.extras))
    ok("БАГ (видалення активного пункту лишає застарілий slideIdx): svcRemove скидає його");
  else bad("БАГ НЕ перенесено: видалення активного пункту може лишити застарілий slideIdx");
  if (/id="songBookFilterMain"/.test(ix) && /var selMain = document\.getElementById\('songBookFilterMain'\);/.test(SRC.extras) && /if \(book\) pool = pool\.filter/.test(ix))
    ok("фільтр збірників біля головного пошуку пісень (вкладка «🎵 Пісні»)");
  else bad("немає фільтра збірників біля головного пошуку пісень");
  if (/songbook: s\.songbook \|\| ''/.test(ix) && /library: 'Церква Прага'/.test(ix))
    ok("БАГ (експорт пісень губить збірники): songbook тепер потрапляє у файл");
  else bad("БАГ НЕ виправлено: експорт пісень все ще губить збірники");
  if (/songbook: s\.songbook \|\| s\.book \|\| s\.collection \|\| ''/.test(SRC.formats))
    ok("БАГ (імпорт JSON губить збірники): fmtParseSongsJSON тепер зберігає songbook");
  else bad("БАГ НЕ виправлено: імпорт JSON все ще губить збірники в парсері");
  if (/existing\.songbook = d\.imported\.songbook \|\| '';/.test(ix) && /songbook: s\.songbook \|\| '', verses: s\.verses \}\);\s*\n\s*added\+\+;/.test(ix))
    ok("БАГ (повторний імпорт губив збірник): нові пісні копіюють songbook, заміна дублікату теж");
  else bad("БАГ НЕ виправлено: songbook може губитись при імпорті нових/дублікатів");
  if (/function _finishSongImport/.test(ix) && /function _applyImportDecisions/.test(ix) && /function _decideAllImportDup/.test(ix) && /overlay\.id = 'importDupOverlay';/.test(ix))
    ok("захист від дублікатів пісень при імпорті: попередження з вибором замінити/пропустити (по одній або всі)");
  else bad("немає інтерактивного попередження про дублікати при імпорті");
  if (/function toggleSongSelect/.test(SRC.extras) && /function toggleSelectAllSongs/.test(SRC.extras) && /function deleteSelectedSongs/.test(SRC.extras) && /id="songBulkDeleteBtn"/.test(ix))
    ok("масове видалення пісень: позначити вручну або всі одразу");
  else bad("немає масового видалення пісень із позначенням вручну/всіх");
  if (/ipcMain\.handle\(\s*'qrcode-generate'/.test(SRC.main) && /require\('qrcode'\)/.test(SRC.main) && /window\.electronAPI\.generateQRCode\(text, sz\)/.test(SRC.extras) && /function _buildQRCanvasViaCDN/.test(SRC.extras))
    ok("QR-коди генеруються офлайн (npm qrcode) з фолбеком на CDN, якщо недоступно");
  else bad("немає офлайн-генерації QR або фолбек на CDN зламано");
  if (/require\('chokidar'\)/.test(SRC.main) && /ipcMain\.handle\(\s*'pick-watch-folder'/.test(SRC.main) && /function _classifySongsForImport/.test(ix) && /function _importParsedSongsFromWatcher/.test(ix) && /id="watchFolderPath"/.test(ix))
    ok("тека спостереження: автовиявлення нових файлів пісень із тим самим захистом від дублікатів");
  else bad("немає теки спостереження або вона не використовує захист від дублікатів");
  if (/function svcRefreshSongPick/.test(SRC.extras) && /function svcRenderSongBookFilter/.test(SRC.extras) && /id="svcSongSearch"/.test(SRC.extras) && /id="svcSongBookFilter"/.test(SRC.extras) && /svcRenderSongBookFilter\(\)/.test(SRC.extras))
    ok("план служіння: пошук пісень + видимі збірники в селекторі додавання");
  else bad("немає пошуку/видимих збірників у плані служіння");
  if (/var htmlForProjector = escHtml\(text\)\.replace\(\/\\n\/g,'<br>'\);/.test(ix))
    ok("БАГ (проектор не екранував текст, на відміну від трансляції): doSend тепер безпечний і послідовний");
  else bad("БАГ НЕ виправлено: doSend може показати необроблений HTML на проекторі");
  if (/function fixBrokenBrTags/.test(ix) && /BR_RE = /.test(ix) && /onclick="fixBrokenBrTags\(\)"/.test(ix))
    ok("🧹 масове виправлення битих <br> у текстах пісень (старі імпорти)");
  else bad("немає утиліти виправлення битих <br> у піснях");
  if (/function getAnnounceHTML\(ann, outputN\)/.test(SRC.extras) && /function sendAnnounceToOutputs/.test(SRC.extras) && /sendHTMLToOutputN\(1, getAnnounceHTML\(ann, 1\)/.test(SRC.extras) && /sendHTMLToOutputN\(2, getAnnounceHTML\(ann, 2\)/.test(SRC.extras) && /function setAnnounceSize/.test(SRC.extras))
    ok("оголошення: окремий розмір тексту для проектора й трансляції");
  else bad("немає окремого розміру тексту оголошень для проектора/трансляції");
  if (/if \(q\.mode === 'photo'\) \{\s*\n\s*\/\/ Режим фото: посилання тут немає взагалі/.test(SRC.extras) && /p\.mode === 'photo' && p\.photo/.test(SRC.extras) && /photoScale: 100,/.test(SRC.extras) && /titleSize: 72,/.test(SRC.extras) && /function setQrSize/.test(SRC.extras))
    ok("QR-екран (справжня вкладка): збереження/відновлення фото-режиму + окремі розміри фото/заголовка/підпису");
  else bad("QR-екран: режим фото не зберігається/не відновлюється, або немає окремих розмірів");
  if (/function sendBibleGraphicsMulti/.test(SRC.extras) && /onclick="sendBibleGraphicsMulti\(\[1,2\]\)"/.test(ix) && /onclick="sendBibleGraphicsMulti\(\[1,2,3,4\]\)"/.test(ix) && !/onclick="sendBibleToProjector\(\)"/.test(ix))
    ok("Біблія: кнопка «На проектор» замінена на «2 виводи» + окрема кнопка «Усі 4 виводи»");
  else bad("Біблія: немає кнопки на 2 виводи або на всі 4 виводи");
  if (/const rows = \[1, 2, 3, 4\]\.map/.test(SRC.extras) && /onclick="sendMultiToOutput\(\$\{n\}\)"/.test(SRC.extras))
    ok("Кілька перекладів: картка тепер на всі 4 виходи (Проектор/Трансляція/Вихід 3/Вихід 4), кожен своєю карткою з власною кнопкою показу");
  else bad("Кілька перекладів: картка досі лише на 2 виходи");
  if (ix.indexOf('id="annPreviewBox"') > 0 && ix.indexOf('id="annPreviewBox"') < ix.indexOf('🔄 Автоматичне слайд-шоу'))
    ok("Оголошення: «Попередній перегляд» стоїть над «Автоматичне слайд-шоу» (права колонка)");
  else bad("Оголошення: попередній перегляд не над слайд-шоу");
  if (/var projReallyOpen = !!\(state && state\.outputStates/.test(ix) && /var streamReallyOpen = !!\(state && state\.outputStates/.test(ix))
    ok("БАГ (трансляція сама перевідкривається після «Закрити»): ensureProjector тепер бачить реальний стан виходів");
  else bad("ensureProjector може тихо перевідкрити закритий вихід (застарілі projOpen/streamOpen)");
  if (/function sendHTMLOverlayTo/.test(SRC.extras) && /function clearHTMLOverlayOutput/.test(SRC.extras) && /var htmlLiveMap = \{ 1: null, 2: null, 3: null, 4: null \};/.test(SRC.extras) && /htmlLiveMap\[n\] > i\) htmlLiveMap\[n\]--;/.test(SRC.extras))
    ok("HTML-графіка: показ на конкретний вихід + позначка «в ефірі» + вимкнення окремого виходу (index-safe)");
  else bad("HTML-графіка: немає показу на конкретний вихід або позначки в ефірі");
  if (/htmlLiveMap\[n\] === i\) \{ window\.electronAPI\.gddCommand\(OUT_KIND\[n\], 'update', data\); sentAny = true; \}/.test(SRC.extras) && /function gddStop\(i\)/.test(SRC.extras) && /if \(htmlLiveMap\[n\] === i\) \{ clearHTMLOverlayOutput\(n\); cleared = true; \}/.test(SRC.extras))
    ok("БАГ (редагування GDD-поля зачіпало ВСІ 4 виходи одразу): gddLiveUpdate/gddStop тепер цілять лише в потрібний вихід");
  else bad("GDD-графіка: редагування/прибирання поля може зачепити чужі виходи");
  if (!/Стабільний розмір шрифту/.test((function(){
        // текст функції renderTypoTab без тіла — перевіряємо саму сирцеву функцію
        var m = SRC.extras.match(/function renderTypoTab\(\) \{[\s\S]*?\n\}\n/);
        return m ? m[0] : '';
      })()) && /id="songFontSizeLabel"/.test(ix) && /function syncSongFontSizeDisplay/.test(SRC.extras))
    ok("Розмір шрифту пісні: картку перенесено з «Оформлення» у вкладку «Пісні»");
  else bad("Картка розміру шрифту не на своєму новому місці (Оформлення/Пісні)");
  if (ix.indexOf('⚡ Швидке посилання') > 0 && ix.indexOf('⚡ Швидке посилання') < ix.indexOf('>Глава і вірш<') && ix.indexOf('>Глава і вірш<') < ix.indexOf('📖 Переклад'))
    ok("Біблія: «Глава і вірш» стоїть одразу під «Швидке посилання»");
  else bad("Біблія: «Глава і вірш» не на новому місці під «Швидке посилання»");
  if (/id="servicePlanEmbed"/.test(ix) && /function renderServicePlanEmbed/.test(SRC.extras) && /host\.innerHTML = renderServiceTab\(\);/.test(SRC.extras) && !/\[id: 'g_service'.*'service', '📅 План служби'/.test(SRC.extras.replace(/\n/g,' ')))
    ok("План служби перенесено з вкладки «Служба» у вкладку «Пісні» (та сама renderServiceTab)");
  else bad("План служби не вбудовано у вкладку «Пісні» або досі є окремою кнопкою в «Служба»");
  if (/function _uniqueDupTitle/.test(ix) && /onclick="_decideImportDup\(' \+ i \+ ', \\'both\\'\)"/.test(ix) && /else if \(action === 'both'\) \{/.test(ix) && /kept\+\+;/.test(ix))
    ok("Захист від дублікатів пісень: додано третій варіант «Зберегти обидва»");
  else bad("Немає варіанту «Зберегти обидва» у діалозі дублікатів пісень");
  if (/titleColor: '#ffffff',/.test(SRC.extras) && /subtitleColor: '#c8a84b',/.test(SRC.extras) && /g\.fillStyle = q\.titleColor \|\| '#ffffff';/.test(SRC.extras) && /oninput="setQr\('titleColor', this\.value\)"/.test(SRC.extras))
    ok("QR-екран: додано вибір кольору тексту (заголовок/підпис)");
  else bad("QR-екран: немає вибору кольору тексту");
  if (/ipcMain\.handle\('show-watermark'/.test(SRC.main) && /showWatermark:/.test(SRC.preload) &&
      /ipcRenderer\.on\('watermark', \(event, cfg\) => \{/.test(SRC.projPreload) &&
      /function setWatermark\(n, key, val\)/.test(SRC.extras) && /function toggleWatermark\(n, on\)/.test(SRC.extras) &&
      /#watermark-layer \{ position:fixed; z-index:8;/.test(SRC.projHtml))
    ok("🏷 Постійний водяний знак: окремий шар, не зникає при зміні контенту, ОКРЕМИЙ для кожного з 4 виходів");
  else bad("Немає постійного водяного знаку, або він не незалежний від контенту / не по виходах");
  if (/if \(exists\) \{\s*\n\s*exists\.content = e\.target\.result;/.test(SRC.extras))
    ok("БАГ (повторне завантаження HTML-файлу з тією самою назвою тихо ігнорувалось): тепер оновлює вміст");
  else bad("Повторне завантаження HTML-файлу з тією самою назвою може досі мовчки нічого не міняти");
  if (!/function renderQRPresets/.test(ix) && !/safeInit\(renderQRPresets/.test(ix))
    ok("БАГ (старт падав: «Ініціалізація renderQRPresets впала» — елемент старої вкладки прибрано): функцію теж прибрано повністю");
  else bad("renderQRPresets досі існує/викликається — падатиме на старті (елемент qrPresetsList прибрано)");
  if (/__call\('update', JSON\.stringify\(__data\)\);/.test(SRC.formats) && /__call\('update', JSON\.stringify\(__data\)\); __applyFields\(__data\)/.test(SRC.formats))
    ok("БАГ (GDD-графіка мовчки не оновлювалась, ні на старті, ні наживо): gddInject тепер передає update() рядок JSON, а не об'єкт");
  else bad("gddInject все ще передає update() об'єкт замість рядка — GDD-графіки можуть мовчки не оновлюватись");
  if (/oninput="debounceSearch\('songListSearch', renderAllSongs\)"/.test(ix))
    ok("Оптимізація: пошук у «Всі пісні в базі» тепер з debounce (не перебудовує ~3300 рядків на кожен символ)");
  else bad("Пошук у списку всіх пісень все ще без debounce — важкий перерендер на кожен символ при 3300+ піснях");
  if (/dataWriteSync: \(key, content\) => \{ ipcRenderer\.send\('data-write-async'/.test(SRC.preload) && /ipcMain\.on\('data-write-async'/.test(SRC.main) && /fs\.writeFile\(dataFile\(key\)/.test(SRC.main) && !/data-write-sync/.test(SRC.main) && !/data-write-sync/.test(SRC.preload))
    ok("Оптимізація (підвисання на Windows): запис великих даних (напр. 3300+ пісень) більше не блокує застосунок синхронно");
  else bad("Запис великих даних досі синхронний (sendSync/writeFileSync) — може підвисати застосунок на великій базі");
  if (/function saveScenePreset/.test(SRC.extras) && /function applyScenePreset/.test(SRC.extras) && /function deleteScenePreset/.test(SRC.extras) && /setOutputRoute\(n, o\.route\);/.test(SRC.extras) && /onclick="for\(let i=1;i<=4;i\+\+\) setOutputRoute\(i,'graphics'\)"/.test(SRC.extras) && /fingerprint: \(state\.outputBind && state\.outputBind\[OUT_KIND\[n\]\]\) \|\| null/.test(SRC.extras) && /bindOutputToDisplay\(n, o\.fingerprint \|\| null\);/.test(SRC.extras))
    ok("🎬 Пресети сцени: одним кліком застосовує режим+хромакей+фон+монітор (за fingerprint, переживає перезавантаження Windows) на всі 4 виходи одразу");
  else bad("Немає пресетів сцени для всіх 4 виходів одразу, або монітор досі прив'язаний через нестабільний displayId");
  if (!/pv2LastContent = \{ kind: 'text', rawText: text, html: String\(text\)/.test(SRC.extras) && /pv2LastContent = \{ kind: 'text', rawText: text, html: hallText\(text\)\.replace/.test(SRC.extras))
    ok("БАГ БЕЗПЕКИ (XSS): текст пісні/вірша тепер екранується (hallText) перед виходом із власним маршрутом — раніше йшов сирий HTML у вікно з contextIsolation:false");
  else bad("XSS: pv2LastContent.html досі отримує НЕекранований String(text) — зловмисний HTML у назві/тексті пісні виконався б як скрипт");
  if (/function onOutputDisplayChange\(n\)/.test(SRC.extras) && /window\.electronAPI\.setOutputDisplay\(OUT_KIND\[n\], id\)/.test(SRC.extras) && /id="pv2DisplaySel\$\{i\}"/.test(SRC.extras))
    ok("Виходи: призначення монітора тепер доступне для всіх 4 виходів (раніше лише для проектора/трансляції)");
  else bad("Призначення монітора досі недоступне для Виходу 3/4");
  if (/"npmRebuild": false/.test(read('package.json')))
    ok("Збірка: npmRebuild=false — не намагається зайво перезібрати вже готовий N-API бінарник ATEM (@julusian/freetype2), що й падало на Windows");
  else bad("npmRebuild не вимкнено — electron-builder може зайво намагатись перезібрати вже робочі нативні модулі й падати на Windows");
  if (/frozen: \{1: false, 2: false, 3: false, 4: false\}/.test(SRC.extras) && /function toggleFreezeOutput\(n\)/.test(SRC.extras) && /const allFrozen = \[1, 2, 3, 4\]\.every\(n => state\.frozen\[n\]\);/.test(SRC.extras) && /onclick="toggleFreezeOutput\(\$\{i\}\)"/.test(SRC.extras))
    ok("❄️ Заморозка тепер окремо для кожного з 4 виходів + глобальна клавіша керує всіма разом (не дублює логіку)");
  else bad("Заморозка досі лише глобальна, не по виходах");
  if (/const kind = state\.alertCfg\.targetOutput \? OUT_KIND\[state\.alertCfg\.targetOutput\] : null;\s*\n\s*if \(typeof isClientStation/.test(SRC.extras))
    ok("Props (постійні накладки) тепер теж поважають обраний вихід оголошень, як і сам sendAlert()");
  else bad("Props досі завжди шле на всі виходи, ігноруючи obраний targetOutput");
  if (/songSize: \{1: null, 2: null, 3: null, 4: null\}/.test(SRC.extras) && /function setOutputSongSize\(n, delta\)/.test(SRC.extras) && /function resetOutputSongSize\(n\)/.test(SRC.extras) && /onclick="setOutputSongSize\(\$\{i\}, -4\)"/.test(SRC.extras) && /if \(!state\.songSize\[n\]\) window\.electronAPI\.setFitGroup\(slides, OUT_KIND\[n\]\);/.test(SRC.extras))
    ok("🔤 Розмір шрифту пісні: тепер повноцінна по-вихідна система (не додатковий шар) — авто-підгін і фіксований розмір окремо для кожного з 4 виходів");
  else bad("Немає точкового перевизначення розміру шрифту по виходах");
  if (/"adm-zip": "\^/.test(read('package.json')) && /ipcMain\.handle\('extract-pptx-notes'/.test(SRC.main) && /notesSlide\(\\d\+\)\\\.xml/.test(SRC.main) && /extractPptxNotes: \(buffer\) => ipcRenderer\.invoke\('extract-pptx-notes', buffer\)/.test(SRC.preload) && /function updateSlideNotesDisplay\(\)/.test(SRC.extras) && /updateSlideNotesDisplay\(\);/.test(SRC.extras))
    ok("📝 PowerPoint: нотатки доповідача видобуваються (adm-zip, чиста JS) і показуються при гортанні слайдів");
  else bad("Немає видобування нотаток доповідача з PowerPoint");
  if (/function atemMultiviewRefreshDevices\(\)/.test(SRC.extras) && /function atemMultiviewStart\(\)/.test(SRC.extras) && /function atemMultiviewStop\(\)/.test(SRC.extras) && /d\.kind === 'videoinput'/.test(SRC.extras) && /'atemMvCard','atemControlCard2'/.test(SRC.extras))
    ok("🖥 ATEM: мультивью через getUserMedia (картка захоплення) — стандартний веб-API, без нативних модулів");
  else bad("Немає підтримки живого відео мультивью в ATEM");
  // Menu має бути в імпорті — але список імпорту з часом росте (додався
  // protocol для схеми app://), тому перевіряємо саме НАЯВНІСТЬ Menu в
  // деструктуризації, а не точний склад усього рядка.
  if (/Menu\.setApplicationMenu\(null\);/.test(SRC.main) && /const \{[^}]*\bMenu\b[^}]*\} = require\('electron'\);/.test(SRC.main))
    ok("БАГ (Windows/Linux): фокус \"вилітав\" із полів вводу при Alt (autoHideMenuBar розкриває приховане меню) — тепер меню прибрано зовсім");
  else bad("Меню не прибрано — Alt на Windows/Linux досі може красти фокус із полів вводу");
  if (/function renameBibleTranslation\(id\)/.test(SRC.extras) && /if \(newLang === null\) return;/.test(SRC.extras) && SRC.extras.includes('renameBibleTranslation(') && SRC.extras.includes('✏️ Перейменувати') && /language: \(bibleTranslations\[id\] && bibleTranslations\[id\]\.language\) \|\| ''/.test(SRC.extras) && /b\.language \? ' <span style="opacity:0\.65/.test(ix))
    ok("Переклади Біблії: можна перейменувати й додати мовну позначку (RU/UA/CZ), показується на екрані мультиперекладу");
  else bad("Немає перейменування перекладів або мовної позначки на екрані мультиперекладу");
  if (/function dblClickSendBoth\(e\)/.test(SRC.extras) && /if \(id === 'bibleDisplay'\)/.test(SRC.extras) && /if \(id === 'songVerses'\)/.test(SRC.extras) && /ondblclick="dblClickSendBoth\(event\)"/.test(ix) && /if \(typeof nextVerse === 'function'\) nextVerse\(\);\s*\n\s*if \(typeof sendToProjector === 'function'\) sendToProjector\(\);/.test(SRC.extras) && /if \(typeof nextBibleVerse === 'function'\) nextBibleVerse\(\);\s*\n\s*if \(typeof sendMultiToBoth === 'function'\) sendMultiToBoth\(\);/.test(SRC.extras))
    ok("🖱 Подвійний клік — для Біблії ПРОСУВАЄ вірш (nextBibleVerse) перед показом, для пісень ПРОСУВАЄ куплет (nextVerse) — жодна гілка не шле повторно той самий текст");
  else bad("Немає обробника подвійного кліку, або хоч одна гілка (Біблія/Пісні) знову лише повторно шле той самий текст замість просування");
  // «Кілька перекладів»: раніше мала ЗАЙВИЙ підсумковий рядок нагорі картки
  // (▶ Показати / На вихід / Усі 4), що дублював кнопки в кожній окремій
  // картці виходу нижче — не той самий мінімалістичний патерн, що в H2R
  // (один пункт = своя кнопка показу + умовна кнопка прибрати, і більше
  // нічого). Прибрано: тепер кожен вихід — це ОДНА картка з 🔴-підсвіченою
  // кнопкою показу і умовною кнопкою прибрати, точнісінько як у H2R.
  if (/\$\{live \? '🔴 ' : ''\}📖 Показати на «\$\{esc\(OUT_NAME\[n\]\)\}»/.test(SRC.extras) &&
      /\$\{live \? `<button class="btn btn-ghost btn-sm btn-block" style="margin-top:3px;color:var\(--red\)" onclick="clearBibleFrom\(\$\{n\}\)"/.test(SRC.extras) &&
      !/onclick="sendMultiToBoth\(\)">▶ Показати<\/button>/.test(SRC.extras) &&
      !/onclick="sendMultiToAll4\(\)"/.test(SRC.extras))
    ok("📖 Кілька перекладів: зайвий підсумковий рядок нагорі прибрано — кожен вихід сам собі 🔴-кнопка показу + умовна «прибрати», як у H2R");
  else bad("Кілька перекладів: досі є зайвий підсумковий рядок (▶ Показати/Усі 4), або пропала 🔴-підсвітка чи «прибрати» на картці виходу");
  if (/function songRefForDisplay\(title\)/.test(SRC.extras) && /function setShowSongTitle\(val\)/.test(SRC.extras) && /function setShowTransName\(val\)/.test(SRC.extras) && /state\.showTransName !== false \?/.test(ix) && (SRC.extras.match(/songRefForDisplay\(/g) || []).length >= 6)
    ok("🏷 Назви на екрані: можна вимкнути назву пісні й назву перекладу окремо (Налаштування) — посилання на вірш лишається завжди");
  else bad("Немає перемикачів показу назви пісні/перекладу, або хелпер songRefForDisplay застосовано не в усіх місцях");
  if (/function renameHTMLOverlay\(i\)/.test(SRC.extras) && /function setHtmlOverlayCategory\(i\)/.test(SRC.extras) && /function duplicateHTMLOverlay\(i\)/.test(SRC.extras) && /id="htmlOverlaySearch"/.test(ix) && /id="htmlOverlayCatFilter"/.test(ix) && /if \(catFilter && overlay\.category !== catFilter\) return;/.test(SRC.extras))
    ok("📋 Список HTML-графіки: перейменування, категорії, пошук/фільтр, дублювання файлів");
  else bad("Немає перейменування/пошуку/категорій/дублювання у списку HTML-графіки");
  if (/f\.options && f\.options\.length/.test(SRC.extras) && /f\.type === 'color'/.test(SRC.extras) && /f\.type === 'number'/.test(SRC.extras) && /min: p\.min !== undefined \? p\.min : \(p\.minimum !== undefined \? p\.minimum : null\),/.test(SRC.formats))
    ok("⚙ GDD-поля: список варіантів (select), палітра кольору, число з межами — раніше збирались у схемі, але ігнорувались панеллю");
  else bad("GDD-поля досі завжди звичайний текстовий рядок, незалежно від типу/варіантів у схемі");
  if (/function togglePinHTMLOverlay\(i\)/.test(SRC.extras) && /function moveHTMLOverlay\(i, direction\)/.test(SRC.extras) && /if \(htmlLiveMap\[n\] === i\) htmlLiveMap\[n\] = j;/.test(SRC.extras) && /var reordering = !q && !catFilter;/.test(SRC.extras))
    ok("📌 HTML-графіка: закріплення нагорі + переміщення ▲▼ в межах групи (коректно оновлює htmlLiveMap при перестановці)");
  else bad("Немає закріплення/переміщення у списку HTML-графіки, або htmlLiveMap не оновлюється при перестановці");
  if (/function gddSavePreset\(i\)/.test(SRC.extras) && /function gddLoadPreset\(i, presetIdx\)/.test(SRC.extras) && /function gddDeletePreset\(i, presetIdx\)/.test(SRC.extras) && /function saveGddPresets\(\)/.test(SRC.extras) && /function loadGddPresets\(\)/.test(SRC.extras) && /if \(ov && ov\.name && byName\[ov\.name\]\) gddPresets\[idx\] = byName\[ov\.name\];/.test(SRC.extras))
    ok("📁 GDD-пресети: кілька іменованих наборів полів на один файл (напр. «Ранок»/«Вечір»), прив'язані до назви файлу, переживають перезавантаження");
  else bad("Немає пресетів значень для GDD-полів, або вони не прив'язані до назви файлу для стійкості");
  if (/function updateNetIndicator\(\)/.test(SRC.extras) && /window\.addEventListener\('online', updateNetIndicator\);/.test(SRC.extras) && /id="netIndicator"/.test(ix) && /if \(!navigator\.onLine\) \{ notify\('🔴 Немає інтернету/.test(SRC.extras))
    ok("🟢 Індикатор інтернету + попереджає перед автооновленням при офлайні");
  else bad("Немає індикатора інтернету, або автооновлення не перевіряє з'єднання заздалегідь");
  if (/required: !!p\.required \|\| requiredList\.indexOf\(key\) > -1/.test(SRC.formats) && /function gddCheckRequired\(i\)/.test(SRC.extras) && /const missing = gddCheckRequired\(i\);/.test(SRC.extras))
    ok("⚠️ Обов'язкові GDD-поля: підсвітка + попередження при показі (не блокує — оператор вирішує сам)");
  else bad("Немає підтримки обов'язкових GDD-полів");
  if (/function gddFilterPresets\(i\)/.test(SRC.extras) && /\(gddPresets\[i\] \|\| \[\]\)\.length > 5/.test(SRC.extras) && /data-preset-name=/.test(SRC.extras))
    ok("🔍 Пошук серед пресетів GDD (з'являється лише коли їх багато, фільтрує напряму через DOM без перебудови панелі)");
  else bad("Немає пошуку серед пресетів GDD");
  if (/function exportHtmlOverlays\(\)/.test(SRC.extras) && /function importHtmlOverlaysFile\(input\)/.test(SRC.extras) && /if \(existing\) \{ Object\.assign\(existing, imported\); updated\+\+; \}/.test(SRC.extras) && /if \(payload\.gddParams && payload\.gddParams\[o\.name\]\) gddParams\[idx\] = payload\.gddParams\[o\.name\];/.test(SRC.extras))
    ok("📤 Експорт/імпорт колекції HTML-графіки — переносить файли+параметри+пресети між машинами, оновлює за назвою (не дублює)");
  else bad("Немає експорту/імпорту колекції HTML-графіки");
  if (/function svcUpdateTimingDisplay\(\)/.test(SRC.extras) && /const plannedMin = sv\.items\.slice\(0, sv\.idx\)\.reduce/.test(SRC.extras) && /function svcResetTiming\(\)/.test(SRC.extras) && /function svcPrint\(\)/.test(SRC.extras) && /if \(!state\.service\.serviceStartedAt\) state\.service\.serviceStartedAt = now;/.test(SRC.extras))
    ok("⏱ План служби: реальний час vs заплановано (тікер, відставання/випередження) + 🖨 друк/експорт плану окремим файлом");
  else bad("Немає відстеження реального часу служби або друку/експорту плану");
  if (/@keyframes bgBreathe/.test(SRC.projHtml) && /bgEl\.classList\.toggle\('bg-animated', !!currentTheme\.bgAnimated\);/.test(SRC.projPreload) && /function onBgAnimatedChange\(\)/.test(SRC.extras) && /bgAnimated: !!activeBg\.animated/.test(SRC.extras))
    ok("🌊 Плавний рух фону (H2R-стиль animated background) — вбудована анімація без відео-файлів");
  else bad("Немає плавного руху фону");
  if (/function getCreditsHTML\(\)/.test(SRC.extras) && /function sendCredits\(n\)/.test(SRC.extras) && /creditsConfig:/.test(SRC.extras) && /@keyframes creditsScroll/.test(SRC.extras))
    ok("🎬 Прокрутка подяки — багаторядкові титри знизу вгору, як у кінці фільму (H2R-стиль credits)");
  else bad("Немає прокрутки подяки (credits)");
  if (/function getConfettiHTML\(\)/.test(SRC.extras) && /function sendConfetti\(n\)/.test(SRC.extras) && /@keyframes confettiFall/.test(SRC.extras) && /function clearH2R\(n\)/.test(SRC.extras) && /const animsOut = \{slideLeft:'h2rSlideLeftOut'/.test(SRC.extras) && /setTimeout\(\(\) => \{\s*\n\s*const blank = /.test(SRC.extras))
    ok("🎉 Конфеті (самоочищується) + H2R: парні анімації входу/виходу, ✕ тепер реально прибирає з живого екрана (раніше лише блимало прев'ю)");
  else bad("Немає конфеті, або H2R «✕» досі не прибирає з живого екрана");
  if (/var videoCaptureStreams = \{\};/.test(SRC.extras) && /function videoCaptureStart\(key, selectId, videoId\)/.test(SRC.extras) && /function atemMultiviewStart\(\) \{ videoCaptureStart\('atem', 'atemMvDeviceSel', 'atemMvVideo'\); \}/.test(SRC.extras) && /id="h2rMvDeviceSel"/.test(ix) && /videoCaptureStart\('h2r', 'h2rMvDeviceSel', 'h2rMvVideo'\)/.test(ix))
    ok("🎨 H2R Graphics: захоплення відео поруч із ATEM-мультивью, той самий узагальнений механізм (не дублює логіку, обидва можуть працювати одночасно)");
  else bad("Немає картки захоплення H2R Graphics, або код захоплення задубльовано замість узагальнення");
  if (/if \(!\/\^wss\?:\\\/\\\/\/i\.test\(url\)\)/.test(SRC.extras) && /url = 'ws:\/\/' \+ url;/.test(SRC.extras) && /можливо, «Server Password» з OBS/.test(SRC.extras))
    ok("🎥 OBS: розпізнає типову плутанину полів (довгий пароль замість короткої адреси) — дає конкретну підказку, сам виправляє забутий ws:// префікс");
  else bad("OBS-підключення досі не перевіряє формат адреси — плутанина полів дає незрозумілу помилку");
  if (/function setHtmlOverlayCategoryInline\(i, value\)/.test(SRC.extras) && /onchange="setHtmlOverlayCategoryInline\(\$\{i\}, this\.value\)"/.test(SRC.extras) && /function bulkSetHtmlOverlayCategory\(\)/.test(SRC.extras) && /function toggleHtmlOverlaySelect\(i\)/.test(SRC.extras) && /function htmlOverlayLabel\(overlay\)/.test(SRC.extras) && /return overlay\.category \? '\[' \+ overlay\.category \+ '\] ' \+ name : name;/.test(SRC.extras))
    ok("🏷 Категорії GDD: поле прямо в панелі полів, масове позначення кількох файлів, категорія в мітці показу");
  else bad("Немає покращень категорій для GDD-шаблонів");
  if (/function getTickerHTML\(\)/.test(SRC.extras) && /function sendTicker\(n\)/.test(SRC.extras) && /function stopTicker\(n\)/.test(SRC.extras) && /@keyframes tickerScroll/.test(SRC.extras) && /<span class="ticker-item">\$\{text\}<\/span><span class="ticker-item">\$\{text\}<\/span>/.test(SRC.extras))
    ok("📰 Тікер: горизонтальний біжучий рядок по колу, текст подвоєно для безшовного циклу");
  else bad("Немає тікера (горизонтального біжучого рядка)");
  if (/if \(!stationPin\) stationPin = String\(crypto\.randomInt\(1000, 10000\)\);/.test(SRC.main) && !/Math\.floor\(1000 \+ Math\.random\(\) \* 9000\)/.test(SRC.main))
    ok("🔐 PIN станції: crypto.randomInt() замість Math.random() (криптографічно стійке джерело)");
  else bad("PIN станції досі генерується через Math.random() — недостатньо стійко");
  if (/function emergencyRestoreAll\(\)/.test(SRC.extras) && /var anyFrozen = \[1, 2, 3, 4\]\.some/.test(SRC.extras) && /function sendEmergencyMessage\(\)/.test(SRC.extras) && /id="emergencyBtn"/.test(ix) && /id="emergencyPanel"/.test(ix))
    ok("🚨 Аварійна панель: blackout/freeze/logo/повідомлення/відновити все в одному місці, доступна з будь-якої вкладки");
  else bad("Немає єдиної аварійної панелі");
  if (/function saveOnAirRecovery\(\)/.test(SRC.extras) && /function clearOnAirRecovery\(\)/.test(SRC.extras) && /function checkCrashRecovery\(\)/.test(SRC.extras) && /if \(ageMin > 180\) \{ clearOnAirRecovery\(\); return; \}/.test(SRC.extras) && /safeInit\(checkCrashRecovery, 'checkCrashRecovery'\);/.test(SRC.extras) && /const _undoStack = \[\];\s*\n\s*function pushUndo\(snapshot\) \{/.test(SRC.extras))
    ok("💾 Crash Recovery: зберігає стан ефіру, пропонує відновити при старті (лише якщо свіжий, до 3 год)");
  else bad("Немає Crash Recovery, або зачепило pushUndo/_undoStack при додаванні");
  if (/function runPreflightCheck\(\)/.test(SRC.extras) && /function renderPreflightResults\(rows\)/.test(SRC.extras) && /level: openOutputs\.length \? 'ok' : 'bad'/.test(SRC.extras) && /id="preflightResults"/.test(SRC.extras))
    ok("🚀 Preflight Check: один погляд на виходи/інтернет/ATEM/OBS/PTZ/медіа/Stage перед службою, нічого не вмикає само");
  else bad("Немає Preflight Check перед службою");
  if (/function svcSaveAsTemplate\(\)/.test(SRC.extras) && /function svcNewFromTemplate\(i\)/.test(SRC.extras) && /isTemplate: !!p\.isTemplate/.test(SRC.extras) && /state\.service\.serviceStartedAt = null;/.test(SRC.extras) && /\(sv\.saved\[b\]\.isTemplate \? 1 : 0\) - \(sv\.saved\[a\]\.isTemplate \? 1 : 0\)/.test(SRC.extras))
    ok("💠 Шаблони служінь: окремо від звичайних планів (нагорі списку), «новий план із шаблону» не чіпає оригінал і скидає час");
  else bad("Немає шаблонів служінь, або вони не відокремлені від звичайних збережених планів");
  if ((SRC.extras.match(/if \(state\.onAir && !_undoing && typeof pushUndo === 'function'\) pushUndo\(state\.onAir\);/g) || []).length === 2)
    ok("↶ Undo розширено на ВСІ зміни ефіру (не лише очищення) — кожен новий показ зберігає попередній стан у стек скасування");
  else bad("Undo досі спрацьовує лише при очищенні екрана, не при зміні контенту");
  if (/function setMediaCategory\(i\)/.test(SRC.extras) && /id="mediaCatFilter"/.test(SRC.extras) && /if \(catFilter && f\.category !== catFilter\) return;/.test(SRC.extras))
    ok("🏷 Категорії медіафайлів: тегування, фільтр за категорією у списку");
  else bad("Немає категорій для медіафайлів");
  if (/function svcGenerateReport\(\)/.test(SRC.extras) && /const nextStarted = sv\.items\[i \+ 1\] && sv\.items\[i \+ 1\]\.startedAt;/.test(SRC.extras) && /if \(!sv\.serviceStartedAt\) \{ notify\('⚠️ Служба ще не починалась/.test(SRC.extras))
    ok("📊 Звіт служби (реальний час): планові vs фактичні хвилини по кожному пункту, після завершення");
  else bad("Немає звіту служби з реальним часом");
  if (/typeof htmlOverlays !== 'undefined' \? htmlOverlays : \[\]\)\.forEach\(function\(o, i\) \{/.test(ix) && /if \(typeof previewHTMLOverlay === 'function'\) previewHTMLOverlay\(idx\);/.test(ix) && /if \(typeof playMedia === 'function'\) playMedia\(idx\);/.test(ix) && (ix.match(/id="globalSearchInput"/g) || []).length === 1)
    ok("🔍 Глобальний пошук розширено на HTML-графіку й медіа (раніше лише пісні/оголошення/Біблія) — жодного дубліката UI");
  else bad("Глобальний пошук досі не бачить HTML-графіку/медіа, або з'явився дублікат UI");
  if (/function saveCurrentAsLook\(\)/.test(SRC.extras) && /function applyCustomLook\(i\)/.test(SRC.extras) && /applyThemeToProjector\(\);/.test(SRC.extras) && /var existingIdx = customLooks\.findIndex/.test(SRC.extras) && /id="customLooksList"/.test(ix))
    ok("🎨 Власні стилі (Looks): зберегти поточний вигляд під назвою, застосувати одним кліком (одразу в ефір, не лише редактор)");
  else bad("Немає власних (кастомних) стилів теми, окремих від готових пресетів");
  if (/ipcMain\.handle\('get-app-version'/.test(SRC.main) && /getAppVersion: \(\) => ipcRenderer\.invoke\('get-app-version'\)/.test(SRC.preload) && /function manualCheckUpdates\(\)/.test(SRC.extras) && /function refreshAppVersion\(\)/.test(SRC.extras) && /onclick="manualCheckUpdates\(\)"/.test(SRC.extras))
    ok("🔄 Оновлення: ручна перевірка + показ поточної версії в «Налаштуваннях» (раніше лише автоматична при старті)");
  else bad("Немає ручної перевірки оновлень або показу версії застосунку");
  if (/\['ptz', '🎥 Камери'\], \['atem', '🎬 ATEM'\]/.test(SRC.extras) && /id: 'g_media', label: '🖼 Медіа'/.test(SRC.extras) && /tabs: \[\s*\n\s*\['songs'.*?\['bible'.*?\['announce'/s.test(SRC.extras))
    ok("Навігація: ATEM+PTZ разом у «Виходи», «Контент» розвантажено на «Контент»+«Медіа» (13→5+8)");
  else bad("Навігація не перегрупована — ATEM окремо від PTZ, або «Контент» досі переповнений");
  if (/logoSettings: \{\s*\n\s*1: \{ on: false, position: 'center-full', size: 160 \}/.test(SRC.extras) && /function setLogoPosition\(n, pos\)/.test(SRC.extras) && /function setLogoSize\(n, size\)/.test(SRC.extras) && /logoLayer\.classList\.contains\('corner'\)/.test(SRC.projPreload) && /const kind = OUTPUT_KINDS\.find\(k => outputWins\[k\]/.test(SRC.main))
    ok("🖼 Логотип: тепер окремо для кожного з 4 виходів, з позицією (весь екран/кут) і розміром — раніше було одне спільне on/off");
  else bad("Логотип досі спільний на всі виходи, без позиції/розміру");
  if (/function buildImageSlideHTML\(dataUrl\)/.test(SRC.extras) && /function sendImageToOutputs\(dataUrl, label, sourceTag, targets\)/.test(SRC.extras) && /function sendSlideToOutputs\(targets\)/.test(SRC.extras) && /onclick="sendSlideToOutputs\(\[1,2\]\)"/.test(ix) && /onclick="sendCustomSlideTo\(\[1,2,3,4\]\)"/.test(ix))
    ok("📽 PDF і Редактор слайдів: тепер можна надіслати на 2 виходи/усі 4, не лише на проектор — той самий шаблон HTML, без дублювання");
  else bad("PDF/Редактор слайдів досі завжди йдуть лише на проектор");
  if (/ipcMain\.handle\('convert-pptx-to-pdf'/.test(SRC.main) && /function findLibreOffice\(\)/.test(SRC.main) && /convertPptxToPdf: \(buffer\) => ipcRenderer\.invoke\('convert-pptx-to-pdf', buffer\)/.test(SRC.preload) && /function loadPowerPoint\(input\)/.test(SRC.extras) && /pdfjsLib\.getDocument\(\{data: res\.data\}\)/.test(SRC.extras))
    ok("📽 PowerPoint: конвертація через локальну LibreOffice → показ через ТОЙ САМИЙ PDF-переглядач (без дублювання показу слайдів)");
  else bad("Немає показу PowerPoint-файлів, або він дублює логіку PDF-переглядача замість перевикористання");
  if (/function outputBgAlpha\(n\)/.test(SRC.extras) && /function setOutputOpacity\(n, v\)/.test(SRC.extras) && /outputOpacity: \{1: 62, 2: 62, 3: 62, 4: 62\}/.test(SRC.extras) && /if \(typeof s\.streamOpacity === 'number' && !s\.outputOpacity\)/.test(SRC.extras) && /oninput="document\.getElementById\('pv2OpacityLbl\$\{i\}'\)/.test(SRC.extras))
    ok("Прозорість хромакею тепер окремо для кожного з 4 виходів (раніше лише для трансляції) + міграція старих значень");
  else bad("Прозорість хромакею досі спільна на всі виходи, або немає міграції старих налаштувань");
  if (/3: \{ titleSize: 64, bodySize: 44, dateSize: 32 \},\s*\n\s*4: \{ titleSize: 64, bodySize: 44, dateSize: 32 \}/.test(SRC.extras) && /sendHTMLToOutputN\(n, getAnnounceHTML\(ann, n\), label\);/.test(SRC.extras) && /id="annSizeTitle3"/.test(ix) && /id="annSizeTitle4"/.test(ix))
    ok("Розмір тексту оголошень тепер окремо для всіх 4 виходів (раніше вихід 3/4 копіював проектор)");
  else bad("Вихід 3/4 досі копіює розмір тексту оголошень з проектора замість власного");
  if (/watermark: \{\s*\n\s*1: \{ text: '', on: false/.test(SRC.extras) && /function setWatermark\(n, key, val\)/.test(SRC.extras) && /function selectWatermarkOutput\(n\)/.test(SRC.extras) && /showWatermark\(state\.watermark\[n\], OUT_KIND\[n\]\)/.test(SRC.extras))
    ok("Водяний знак тепер окремий для кожного з 4 виходів (раніше одне спільне налаштування на всі)");
  else bad("Водяний знак досі спільний на всі виходи, не по кожному окремо");
  // F3/F4 перенесено з захардкодженого switch у index.html в перепризначуване
  // меню «Клавіші» (toggle-out3/toggle-out4, state.hotkeys) — на macOS ці
  // клавіші за замовчуванням займає сама система.
  if (/function toggleOutputN\(n\)/.test(SRC.extras) && /case 'toggle-out3':/.test(ex) && /toggleOutputN\(3\)/.test(ex) && /case 'toggle-out4':/.test(ex) && /toggleOutputN\(4\)/.test(ex))
    ok("Гарячі клавіші: вихід 3/4 відкриваються/закриваються перепризначуваною дією (не захардкоджений F3/F4)");
  else bad("Немає перепризначуваних гарячих клавіш для виходу 3/4");
  if (/function readTextCompat/.test(ix) && /windows-1251/.test(ix) && /readTextCompatInto/.test(ix))
    ok("імпорт із резервним кодуванням windows-1251 (мердж доопрацювання)");
  else bad("немає резервного кодування");
  if (/function exportTranslations/.test(SRC.extras) && /function importTranslations/.test(SRC.extras) && /church_translations_/.test(SRC.extras))
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

head('Модуляризація (крок 2): вкладки Анімації/Шрифти винесені в src/tabs/g_design/');
(function () {
  const fs2 = require('fs');
  const animPath = path.join(ROOT, 'src/tabs/g_design/animations.js');
  const fontsPath = path.join(ROOT, 'src/tabs/g_design/fonts.js');
  if (fs2.existsSync(animPath) && fs2.existsSync(fontsPath))
    ok('src/tabs/g_design/animations.js і fonts.js існують (продовження модуляризації після typo.js)');
  else bad('ЗНИКЛИ tabs/g_design/animations.js або fonts.js — крок 2 розбивки коду втрачено');
  const ANIM_FNS = ['renderAnimationsTab', 'getAnimationCSS', 'applyAnimations', 'applyPresetAnim', 'previewAnimation', 'resetAnimations', 'updateAnimationPreview'];
  const FONTS_FNS = ['renderFontsTab', 'renderFontsList', 'applyFontSettings', 'loadFonts', 'removeFont', 'updateFontSelectors'];
  const ex1 = read('src/extras-1.js');
  // Кожна функція має існувати РІВНО один раз в усьому коді (у своєму
  // новому файлі), а не в extras-1.js — інакше або дублювання (дві копії
  // однієї логіки розходяться з часом), або втрата (лишилась «сирота»
  // без визначення після видалення оригіналу).
  const dup = ANIM_FNS.concat(FONTS_FNS).filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex1));
  if (!dup.length) ok('жодна з 13 винесених функцій не задубльована назад в extras-1.js');
  else bad('Задубльовано назад в extras-1.js: ' + dup.join(', '));
  const animSrc = fs2.existsSync(animPath) ? fs2.readFileSync(animPath, 'utf8') : '';
  const fontsSrc = fs2.existsSync(fontsPath) ? fs2.readFileSync(fontsPath, 'utf8') : '';
  const missAnim = ANIM_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(animSrc));
  const missFonts = FONTS_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(fontsSrc));
  if (!missAnim.length && !missFonts.length) ok('усі 13 функцій справді присутні у своїх нових файлах');
  else bad('Бракує у нових файлах: ' + missAnim.concat(missFonts).join(', '));
  // Порядок <script> — обидва нові файли МУСЯТЬ бути до extras-4.js
  // (pv2Init() звертається до цих функцій одразу при старті, в TABS/steps)
  const ix = SRC.index;
  const iAnim = ix.indexOf('<script src="tabs/g_design/animations.js">');
  const iFonts = ix.indexOf('<script src="tabs/g_design/fonts.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iAnim >= 0 && iFonts >= 0 && iExtras4 >= 0 && iAnim < iExtras4 && iFonts < iExtras4)
    ok('<script> для animations.js і fonts.js стоять ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 3): вкладки Плейлист/PowerPoint винесені в src/tabs/');
(function () {
  const fs2 = require('fs');
  const plPath = path.join(ROOT, 'src/tabs/playlist/playlist.js');
  const pptPath = path.join(ROOT, 'src/tabs/powerpoint/powerpoint.js');
  if (fs2.existsSync(plPath) && fs2.existsSync(pptPath))
    ok('src/tabs/playlist/playlist.js і tabs/powerpoint/powerpoint.js існують (крок 3 модуляризації)');
  else bad('ЗНИКЛИ tabs/playlist/playlist.js або tabs/powerpoint/powerpoint.js — крок 3 розбивки коду втрачено');
  const PL_FNS = ['renderPlaylistTab', 'addCurrentToPlaylist', 'runPlaylist', 'clearPlaylist',
    'savePlaylist', 'loadPlaylist', 'playlistPrev', 'playlistNext', 'playlistSendCurrent',
    'renderPlaylist', 'previewPlaylistItem', 'sendPlaylistItem', 'removePlaylistItem',
    'savePlaylistData', 'loadPlaylistData'];
  const PPT_FNS = ['renderPowerPointTab', 'setPPTtemplate', 'exportToPPTX', 'exportToHTML', 'pptPrevPreview', 'pptNextPreview'];
  const ex1 = read('src/extras-1.js');
  const dup = PL_FNS.concat(PPT_FNS).filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex1));
  if (!dup.length) ok('жодна з 21 винесеної функції (Плейлист/PPT) не задубльована назад в extras-1.js');
  else bad('Задубльовано назад в extras-1.js: ' + dup.join(', '));
  const plSrc = fs2.existsSync(plPath) ? fs2.readFileSync(plPath, 'utf8') : '';
  const pptSrc = fs2.existsSync(pptPath) ? fs2.readFileSync(pptPath, 'utf8') : '';
  const missPl = PL_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(plSrc));
  const missPpt = PPT_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(pptSrc));
  if (!missPl.length && !missPpt.length) ok('усі 21 функцію (Плейлист/PPT) справді присутні у своїх нових файлах');
  else bad('Бракує у нових файлах: ' + missPl.concat(missPpt).join(', '));
  const ix = SRC.index;
  const iPl = ix.indexOf('<script src="tabs/playlist/playlist.js">');
  const iPpt = ix.indexOf('<script src="tabs/powerpoint/powerpoint.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iPl >= 0 && iPpt >= 0 && iExtras4 >= 0 && iPl < iExtras4 && iPpt < iExtras4)
    ok('<script> для playlist.js і powerpoint.js стоять ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 4): вкладки Stage Display/Статистика винесені в src/tabs/');
(function () {
  const fs2 = require('fs');
  const stPath = path.join(ROOT, 'src/tabs/stage_display/stage.js');
  const statsPath = path.join(ROOT, 'src/tabs/statistics/statistics.js');
  if (fs2.existsSync(stPath) && fs2.existsSync(statsPath))
    ok('src/tabs/stage_display/stage.js і tabs/statistics/statistics.js існують (крок 4 модуляризації)');
  else bad('ЗНИКЛИ tabs/stage_display/stage.js або tabs/statistics/statistics.js — крок 4 розбивки коду втрачено');
  const ST_FNS = ['renderStageTab', 'openStageDisplay', 'closeStageDisplay', 'updateStageDisplay',
    'setStageMonitor', 'saveStageNotes', 'loadStageNotes', 'renderStageMonitorOptions'];
  const STATS_FNS = ['renderStatisticsTab', '_journalIcon', 'renderLiveJournal', 'clearLiveJournal',
    'updateStatistics', 'exportStatisticsExcel', 'saveStatistics', 'loadStatistics'];
  const ex1 = read('src/extras-1.js');
  const dup = ST_FNS.concat(STATS_FNS).filter(fn => new RegExp('^(async )?function ' + fn + '\\(', 'm').test(ex1));
  if (!dup.length) ok('жодна з 16 винесених функцій (Stage/Статистика) не задубльована назад в extras-1.js');
  else bad('Задубльовано назад в extras-1.js: ' + dup.join(', '));
  const stSrc = fs2.existsSync(stPath) ? fs2.readFileSync(stPath, 'utf8') : '';
  const statsSrc = fs2.existsSync(statsPath) ? fs2.readFileSync(statsPath, 'utf8') : '';
  const missSt = ST_FNS.filter(fn => !new RegExp('^(async )?function ' + fn + '\\(', 'm').test(stSrc));
  const missStats = STATS_FNS.filter(fn => !new RegExp('^(async )?function ' + fn + '\\(', 'm').test(statsSrc));
  if (!missSt.length && !missStats.length) ok('усі 16 функцій (Stage/Статистика) справді присутні у своїх нових файлах');
  else bad('Бракує у нових файлах: ' + missSt.concat(missStats).join(', '));
  const ix = SRC.index;
  const iSt = ix.indexOf('<script src="tabs/stage_display/stage.js">');
  const iStats = ix.indexOf('<script src="tabs/statistics/statistics.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iSt >= 0 && iStats >= 0 && iExtras4 >= 0 && iSt < iExtras4 && iStats < iExtras4)
    ok('<script> для stage.js і statistics.js стоять ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 5): вкладка Гарячі клавіші винесена в src/tabs/hotkeys/');
(function () {
  const fs2 = require('fs');
  const hkPath = path.join(ROOT, 'src/tabs/hotkeys/hotkeys.js');
  if (fs2.existsSync(hkPath)) ok('src/tabs/hotkeys/hotkeys.js існує (крок 5 модуляризації)');
  else bad('ЗНИК tabs/hotkeys/hotkeys.js — крок 5 розбивки коду втрачено');
  const HK_FNS = ['renderHotkeysTab', 'startHotkeyCapture', 'saveHotkeyProfile', 'resetHotkeys'];
  const ex1 = read('src/extras-1.js');
  const dup = HK_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex1));
  if (!dup.length) ok('жодна з 4 винесених функцій (Гарячі клавіші) не задубльована назад в extras-1.js');
  else bad('Задубльовано назад в extras-1.js: ' + dup.join(', '));
  const hkSrc = fs2.existsSync(hkPath) ? fs2.readFileSync(hkPath, 'utf8') : '';
  const missHk = HK_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(hkSrc));
  if (!missHk.length) ok('усі 4 функції (Гарячі клавіші) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missHk.join(', '));
  // MIDI (renderMidiCard і вся підсистема) далі окремо винесено кроком 8 —
  // див. блок «Модуляризація (крок 8)» нижче; тут лише підтверджуємо, що
  // воно більше НЕ в extras-1.js (переїхало, не задублювалось).
  if (!/^function renderMidiCard\(\)/m.test(ex1)) ok('renderMidiCard більше не в extras-1.js (переїхала в tabs/midi/midi.js кроком 8)');
  else bad('renderMidiCard досі в extras-1.js — мала переїхати кроком 8, регресія');
  const ix = SRC.index;
  const iHk = ix.indexOf('<script src="tabs/hotkeys/hotkeys.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iHk >= 0 && iExtras4 >= 0 && iHk < iExtras4)
    ok('<script> для hotkeys.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Пісні: адресний вивід на кожен вихід (як у Біблії/H2R)');
(function () {
  const sd = read('src/song-display.js');
  const FNS = ['songCurrentPayload', 'sendSongToOutput', 'sendSongToOutputs', 'clearSongFrom', 'renderSongOutputRow'];
  const miss = FNS.filter(f => !new RegExp('function ' + f + '\\(').test(sd));
  if (!miss.length) ok('усі 5 функцій адресного виводу пісні визначені');
  else { bad('бракує: ' + miss.join(', ')); return; }
  if (/var songLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(sd))
    ok('songLiveMap веде стан «в ефірі» по виходах');
  else bad('немає songLiveMap — кнопки не підсвічуватимуться');
  if (/id="songOutputRow"/.test(SRC.index)) ok('контейнер #songOutputRow є у вкладці Пісні');
  else bad('немає контейнера — рядок виводу не зʼявиться');
  // Перевикористання спільного шляху: тоді пісня автоматично отримує
  // захист від «повернення після очищення» (лічильник у sendHTMLToOutputN).
  if (/sendHTMLToOutputN\(n, buildTextHTML\(s, c, hasChroma\), null\)/.test(sd))
    ok('вивід іде через спільні buildTextHTML + sendHTMLToOutputN (той самий вигляд і той самий захист)');
  else bad('пісня шлеться власним шляхом — вигляд розійдеться, захист не працюватиме');
  // Кінець пісні має лишатись позначеним і при адресному виводі
  if (/selectedVerseIdx === selectedSong\.verses\.length - 1\) text \+= '\\n\\n\*\*\*'/.test(sd))
    ok('маркер *** на останньому куплеті працює й для адресного виводу');
  else bad('загублено маркер кінця пісні при адресному виводі');
  // Очищення мусить гасити й індикатор пісні
  if (/'songLiveMap'/.test(SRC.extras) && /'renderSongOutputRow'/.test(SRC.extras))
    ok('songLiveMap і його перемальовка є в централізованому скиданні індикаторів');
  else bad('пісня «висітиме в ефірі» після очищення — songLiveMap не скидається');
})();

head('Очищення скасовує відправки, що вже готуються (спільний захист усіх фіч)');
(function () {
  const ex = SRC.extras;
  // sendHTMLToOutputN асинхронна: спершу готує HTML (overlayPath), потім
  // шле у вікно. Без цього захисту команда «clear» долітала першою, а
  // підготовлений контент — після неї, і повертався на очищений екран.
  // Через цю функцію йдуть УСІ фічі (QR, H2R, медіа, таймер, графіка,
  // вірші), тож захист тут лікує їх усі одразу.
  if (/var _outSendGen = \{ 1: 0, 2: 0, 3: 0, 4: 0 \};/.test(ex))
    ok('є лічильник поколінь відправки на кожен вихід (_outSendGen)');
  else { bad('немає _outSendGen — очищення скасовуватиметься відправкою, що в дорозі'); return; }
  const fn = (ex.match(/function sendHTMLToOutputN\(n, html, label\)[\s\S]*?\n\}/) || [''])[0];
  if (/var myGen = _outSendGen\[n\];/.test(fn) && /if \(myGen !== _outSendGen\[n\]\) return;/.test(fn))
    ok('sendHTMLToOutputN відкидає застарілу відправку (перевірка покоління перед sendToOutput)');
  else bad('sendHTMLToOutputN не перевіряє покоління — контент повертатиметься після очищення');
  // Перевірка МУСИТЬ бути перед самою відправкою у вікно
  if (fn.indexOf('if (myGen !== _outSendGen[n]) return;') < fn.indexOf('electronAPI.sendToOutput(OUT_KIND[n]'))
    ok('перевірка стоїть ПЕРЕД відправкою у вікно');
  else bad('перевірка після відправки — марна');
  // Очищення має підвищувати покоління ПЕРШИМ ділом
  const clr = (ex.match(/function pv2ClearOutput\(n\)[\s\S]*?\n\}/) || [''])[0];
  if (/_outSendGen\[n\] = \(_outSendGen\[n\] \|\| 0\) \+ 1;/.test(clr) &&
      clr.indexOf('_outSendGen') < clr.indexOf("'clear'"))
    ok('очищення скасовує відправки ДО того, як шле команду «clear»');
  else bad('очищення не скасовує відправки в дорозі — контент повернеться');
})();

head('Очищення скидає індикатори «в ефірі» ВСІХ фіч');
(function () {
  const ex = SRC.extras;
  const fn = (ex.match(/function resetOutputIndicators\(n\)[\s\S]*?\n\}/) || [''])[0];
  if (!fn) { bad('немає resetOutputIndicators — фічі «висітимуть в ефірі» після очищення'); return; }
  ok('resetOutputIndicators визначена');
  const MAPS = ['qrLiveMap', 'graphicsLiveMap', 'h2rLowerLiveMap', 'timerLiveMap',
                'mediaLiveMap', 'tickerLiveMap', 'creditsLiveMap', 'confettiLiveMap', 'htmlLiveMap'];
  const miss = MAPS.filter(m => !fn.includes(m));
  if (!miss.length) ok('скидає всі 9 індикаторів (QR/графіка/титри/таймер/медіа/тікер/подяки/конфеті/HTML)');
  else bad('не скидає: ' + miss.join(', '));
  // htmlLiveMap тримає ІНДЕКС, тож порожнє для неї — null, а не false
  if (/h\[n\] = null/.test(fn)) ok('htmlLiveMap скидається в null (вона зберігає індекс, не прапорець)');
  else bad('htmlLiveMap скидається як прапорець — графіка з індексом 0 «залипне»');
  // Підключення до обох шляхів очищення
  if (/window\.electronAPI\.sendToOutput\(OUT_KIND\[n\], 'clear', \{\}\);\s*\n\s*resetOutputIndicators\(n\);/.test(ex))
    ok('pv2ClearOutput (очищення одного виходу) скидає індикатори цього виходу');
  else bad('pv2ClearOutput не скидає індикатори — кнопка фічі світитиметься 🔴 на порожньому екрані');
  if (/resetOutputIndicators === 'function'\) resetOutputIndicators\(\);/.test(ex))
    ok('загальне «Очистити» скидає індикатори всіх виходів');
  else bad('загальне очищення не скидає індикатори — фічі «висітимуть в ефірі»');
})();

head('QR-екран: очищення не скасовується асинхронним домальовуванням');
(function () {
  const fs2 = require('fs');
  const q = read('src/tabs/qrscreen/qrscreen.js');
  // composeQrScreen малює АСИНХРОННО. Без лічильника поколінь callback,
  // що стартував до очищення, домальовувався ПІСЛЯ нього й повертав QR
  // на екран — «виключаю, а воно вмикається».
  if (/var _qrSendGen = \{ 1: 0, 2: 0, 3: 0, 4: 0 \};/.test(q))
    ok('є лічильник поколінь показу (_qrSendGen)');
  else { bad('немає _qrSendGen — очищення QR скасовуватиметься фоновим домальовуванням'); return; }
  if (/const myGen = \+\+_qrSendGen\[n\];/.test(q) && /if \(myGen !== _qrSendGen\[n\]\) return;/.test(q))
    ok('застарілий результат малювання відкидається (перевірка покоління в callback)');
  else bad('callback не перевіряє покоління — QR повертатиметься після очищення');
  // Очищення МУСИТЬ підвищувати лічильник, інакше скасування не працює
  const clr = (q.match(/function clearQrScreenFrom\(n\)[\s\S]*?\n\}/) || [''])[0];
  if (/_qrSendGen\[n\] = \(_qrSendGen\[n\] \|\| 0\) \+ 1;/.test(clr) && clr.indexOf('_qrSendGen') < clr.indexOf('pv2ClearOutput'))
    ok('очищення підвищує лічильник ПЕРШИМ ділом — скасовує показ, що малюється');
  else bad('очищення не скасовує фонового показу — баг повернеться');
})();

head('Кілька перекладів + вивід у вкладці Графіка (дублювання без розсинхрону)');
(function () {
  const ex = SRC.extras;
  if (/id="multiTransBoxGfx"/.test(ex)) ok('контейнер #multiTransBoxGfx є у вкладці Графіка');
  else { bad('немає контейнера у Графіці — картка не зʼявиться'); return; }
  // Обидва контейнери МУСЯТЬ заповнюватись однією функцією. Якщо колись
  // зроблять копію розмітки — два списки перекладів заживуть окремо й
  // розійдуться (той самий клас проблем, що з двома списками виходів).
  const rf = (ex.match(/function refreshMultiTransCard\(\)[\s\S]*?\n\}/) || [''])[0];
  if (/\['multiTransBox', 'multiTransBoxGfx'\]/.test(rf) && /renderMultiTransCard\(\)/.test(rf))
    ok('обидві картки малює ОДНА renderMultiTransCard — дані спільні, розійтись не можуть');
  else bad('картки малюються по-різному — списки перекладів розсинхронізуються');
  // Вкладка будується один раз при старті, тож showTab має заповнити її
  if (/\(name === 'bible' \|\| name === 'graphics'\)[\s\S]{0,80}refreshMultiTransCard/.test(SRC.index))
    ok('showTab заповнює картку і для Графіки — не стартуватиме порожньою');
  else bad('showTab не заповнює картку в Графіці — буде порожня до першої дії');
  // Кнопки виводу
  if (/sendBibleGraphicsMulti\(\[1,2\]\)/.test(ex) && /sendBibleGraphicsMulti\(\[1,2,3,4\]\)/.test(ex))
    ok('кнопки «2 виводи» (Проектор+Трансляція) і «Усі 4» на місці');
  else bad('немає кнопок виводу у вкладці Графіка');
  // Використовуються ті самі функції, що й у Біблії — не копії
  if (/onclick="sendBibleWithGraphics\(1\)"/.test(ex) && /onclick="sendBibleWithGraphics\(2\)"/.test(ex))
    ok('вивід іде через ті самі sendBibleWithGraphics — сторож і звіт працюють і тут');
  else bad('вивід у Графіці йде повз спільні функції — сторож його не побачить');
  // Порядок у правій колонці: найчастіші дії під час служби мають бути
  // НАГОРІ, без прокрутки повз прев’ю й пресети.
  const gfxBody = (function () {
    const i = ex.indexOf('function renderGraphicsTab');
    if (i < 0) return '';
    let j = ex.indexOf('{', i), d = 0, e = -1;
    for (let k = j; k < ex.length; k++) {
      if (ex[k] === '{') d++;
      else if (ex[k] === '}') { d--; if (d === 0) { e = k; break; } }
    }
    return ex.slice(i, e);
  })();
  const pMulti = gfxBody.indexOf('multiTransBoxGfx');
  const pSend = gfxBody.indexOf('Вивести вірш з цим');
  const pPrev = gfxBody.indexOf('Як це виглядатиме');
  if (pMulti > -1 && pSend > pMulti && pPrev > pSend)
    ok('порядок у правій колонці: переклади → вивід → прев’ю (дії нагорі, без прокрутки)');
  else bad('порядок зʼїхав — кнопки виводу знову за прев’ю, доведеться прокручувати під час служби');
})();

head('Прев’ю зі змішаними режимами («2 виводи»: кілька перекладів + вірш)');
(function () {
  const ex = SRC.extras;
  // goLive МУСИТЬ віддати обидва режими. Раніше тут був ланцюг else-if:
  // спрацьовувала лише перша гілка, тож в ефір ішов один екран, а другий
  // лишався порожнім — «через прев’ю на проектор не йде, напряму працює».
  const gl = (ex.match(/function goLive\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!gl) { bad('не знайдено goLive'); return; }
  if (/else if \(c\.kind === 'htmlraw' && c\.gfxTargets/.test(gl))
    bad('goLive знову через else-if — при «2 виводи» один екран лишиться порожнім');
  else if (/var handled = false/.test(gl) && /if \(!handled\)/.test(gl))
    ok('goLive віддає ОБИДВА режими (мульти-переклади + графіка вірша), не один');
  else bad('goLive не обробляє обидва режими');

  // stageContent має зливати два виклики однієї дії, інакше прев’ю
  // збереже лише останній і половина екранів лишиться без вмісту.
  const sc = (ex.match(/function stageContent\(content\)[\s\S]*?\n\}/) || [''])[0];
  if (/mergedMulti && mergedGfx/.test(sc) && /_stagedAt/.test(sc))
    ok('прев’ю зливає multiOutputTarget + gfxTargets у межах однієї дії');
  else bad('прев’ю затирається — при «2 виводи» збережеться лише один режим');
  // Але злиття має бути обмежене в часі, інакше два незалежні покази злипнуться
  if (/Date\.now\(\) - prev\._stagedAt < 500/.test(sc))
    ok('злиття лише в межах ~0.5с — два незалежні покази не злипнуться в один');
  else bad('немає часового обмеження злиття — послідовні покази можуть склеїтись');
})();

head('Прев’ю: getCurrentContent не залежить від відкритої вкладки');
(function () {
  const ex = SRC.extras;
  // Баг 1: вміст визначався за активною вкладкою, тож через прев'ю
  // (де активна вкладка «Показ») на екран летіло «Контент не обрано».
  const body = (ex.match(/function getCurrentContent\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!body) { bad('не знайдено getCurrentContent'); return; }
  if (/isActive\('songs'\) && state\.selectedSong/.test(body))
    bad('getCurrentContent знову залежить від активної вкладки — прев’ю даватиме заглушку');
  else ok('вміст визначається за фактично обраним, не за відкритою вкладкою');
  // Баг 2: пісня читалась зі state.selectedSong, якої не існує —
  // пісня живе в глобальній selectedSong (index.html).
  if (/state\.selectedSong/.test(body))
    bad('getCurrentContent читає state.selectedSong — такої змінної немає, пісні не братимуться');
  else if (/typeof selectedSong !== 'undefined'/.test(body))
    ok('пісня читається з глобальної selectedSong (та, куди її насправді кладе selectSong)');
  else bad('незрозуміло, звідки береться пісня в getCurrentContent');
  if (/lastLiveSource === 'song'/.test(body) && /lastLiveSource === 'bible'/.test(body))
    ok('коли обрано і пісню, і вірш — вирішує остання показана (lastLiveSource)');
  else bad('немає правила вибору між піснею й віршем поза вкладками');
  // Оголошення мають лишитись привʼязаними до своєї вкладки
  if (/isActive\('announce'\)/.test(body))
    ok('оголошення й далі беруться лише з відкритої вкладки (їх вміст поза нею не має сенсу)');
  else bad('загублено гілку оголошень');
})();

head('Пульт з телефону: розширений набір дій + звіт про вивід');
(function () {
  const tr = read('src/theme-remote.js');
  const b = read('src/bible.js');
  // Дії, яких бракувало на телефоні (бекенд їх уже вмів через HTTP-API)
  const ACTS = [
    ["cmd.action === 'blackout'", 'blackout (аварійне гасіння — найважливіше)'],
    ["cmd.action === 'freeze'", 'freeze'],
    ["cmd.action === 'logo'", 'логотип на всі'],
    ["cmd.action === 'restore'", 'відновити все'],
    ["cmd.action === 'plan-next'", 'план: наступний пункт'],
    ["cmd.action === 'plan-prev'", 'план: попередній'],
    ["cmd.action === 'timer-start'", 'таймер: старт'],
    ["cmd.action === 'timer-stop'", 'таймер: стоп'],
    ["cmd.action === 'clear-output'", 'прибрати з конкретного виходу']
  ];
  const miss = ACTS.filter(([code]) => !tr.includes(code)).map(([, n]) => n);
  if (!miss.length) ok('пульт розуміє всі ' + ACTS.length + ' нових дій (blackout/freeze/логотип/план/таймер/вихід)');
  else bad('пульт не розуміє: ' + miss.join(', '));
  // Усі виклики мають бути захищені typeof — пульт не має падати, якщо
  // функції немає (вкладку не відкривали, модуль не завантажився).
  const unguarded = ["toggleBlackout", "toggleFreeze", "svcNext", "svcPrev", "timerStart", "pv2ClearOutput"]
    .filter(fn => new RegExp("cmd\\.action === '[a-z-]+'\\) \\{ " + fn + "\\(").test(tr));
  if (!unguarded.length) ok('усі нові дії викликаються через typeof — пульт не впаде без модуля');
  else bad('дії без захисту typeof (пульт впаде): ' + unguarded.join(', '));

  // Звіт про вивід: без нього «2 виводи» мовчить, і якщо один екран
  // нічого не отримав, оператор дізнається про це вже із залу.
  if (/НЕ надіслано/.test(b) && /parts\.push\(nm\(t\) \+ ': кілька перекладів'\)/.test(b))
    ok('«2 виводи»/«Усі 4» звітують по кожному виходу, включно з «НЕ надіслано»');
  else bad('немає звіту по виходах — мовчазна часткова відправка лишиться непоміченою');
  // Кнопки виводу й «прибрати» — в одному рядку (як у H2R)
  if (/outBtns \+ clearBtns \+ '<\/div>'/.test(b))
    ok('кнопки виходів і «✕ Прибрати» в одному рядку (однаково з H2R-титрами)');
  else bad('«прибрати» знову окремим рядком — розходиться з виглядом H2R');
})();

head('Сторож узгодженості виходів (захист від «на екранах різне»)');
(function () {
  const b = read('src/bible.js');
  if (/function assertOutputConsistency\(justChanged, mode\)/.test(b) && /function outputModeSummary\(\)/.test(b))
    ok('assertOutputConsistency + outputModeSummary визначені');
  else { bad('ЗНИК сторож узгодженості виходів'); return; }
  // Має викликатись на ВСІХ шляхах виводу, інакше захист дірявий
  const paths = [
    ["assertOutputConsistency(target, 'multi')", 'sendBibleWithGraphics (мульти-гілка)'],
    ["assertOutputConsistency(null, multi.length ? 'multi' : 'single')", 'sendBibleGraphicsMulti (найризикованіший)'],
    ["assertOutputConsistency(null, 'single')", 'bibleGraphicsTo (одиночний)']
  ];
  const missing = paths.filter(([code]) => !b.includes(code)).map(([, name]) => name);
  const inE4 = /assertOutputConsistency\(n, 'multi'\)/.test(SRC.extras);
  // goLive — окремий шлях: там за одну дію можуть спрацювати ОБИДВА
  // режими (мульти на один екран, графіка на інший), тож розходження
  // найімовірніше саме тут.
  const inGoLive = /assertOutputConsistency\(null, c\.multiOutputTarget \? 'multi' : 'single'\)/.test(SRC.extras);
  if (!missing.length && inE4 && inGoLive)
    ok('сторож підключений на всіх 5 шляхах виводу (3 у bible.js + sendMultiToOutput + goLive/прев’ю)');
  else bad('сторож не підключений: ' + missing.concat(inE4 ? [] : ['sendMultiToOutput'], inGoLive ? [] : ['goLive (прев’ю)']).join(', '));
  if (/id="bibleOutputRow"/.test(SRC.index) && /конфлікт режимів — виправлено автоматично/.test(b))
    ok('індикатор режимів у панелі — оператор бачить стан екранів до залу');
  else bad('немає видимого індикатора режимів');

  // Зведення має покривати ВСІ джерела виводу, а не лише Біблію —
  // інакше оператор бачить неповну картину по 4 екранах.
  const SRC_MAPS = ['graphicsLiveMap', 'h2rLowerLiveMap', 'timerLiveMap', 'mediaLiveMap',
                    'qrLiveMap', 'tickerLiveMap', 'creditsLiveMap', 'confettiLiveMap', 'htmlLiveMap'];
  const notCovered = SRC_MAPS.filter(m => !b.includes(m));
  if (!notCovered.length) ok('зведення охоплює всі 9 джерел виводу (графіка/титри/таймер/медіа/QR/рядок/подяки/конфеті/HTML)');
  else bad('у зведенні бракує джерел: ' + notCovered.join(', '));
  // htmlLiveMap зберігає ІНДЕКС, а не true/false — читати її як решту було б помилкою
  if (/htmlLiveMap\[n\] != null/.test(b))
    ok('htmlLiveMap читається як індекс (!= null), а не як прапорець — інакше графіка з індексом 0 не рахувалась би');
  else bad('htmlLiveMap читається неправильно — HTML-графіка на виході 0 буде невидима у зведенні');

  // Пісні теж мусять скидати відстеження виходів. Раніше вони скидали
  // лише прапорці, лишаючи самі СПИСКИ — і після Біблії в мульти-режимі
  // індикатор показував «кілька перекладів» на екрані, де вже пісня, а
  // стрілки ◀▶ могли повернути туди вірш.
  if (/function resetOutputTracking\(source\)/.test(b) &&
      /lastLiveGraphicsTargets = \[\];[\s\S]{0,200}state\.multiLive = \[\]/.test(b))
    ok('resetOutputTracking чистить ОБИДВА списки (одиночний + мульти)');
  else bad('немає resetOutputTracking або він чистить лише один список');
  const sd = read('src/song-display.js');
  if (/resetOutputTracking\('song'\)/.test(sd))
    ok('пісні скидають відстеження виходів (індикатор не бреже після зміни Біблія → пісня)');
  else bad('пісні не скидають списки — індикатор і стрілки працюватимуть по застарілому стану');
  // doSend — шлях звичайного тексту на ВСІ виходи (пісня через прев’ю
  // теж іде сюди). Він заміщає вміст екранів, тож теж має скидати.
  if (/if \(!isBible && typeof resetOutputTracking === 'function'\) resetOutputTracking\('song'\)/.test(SRC.extras))
    ok('doSend (пісня на всі виходи, зокрема через прев’ю) скидає відстеження');
  else bad('doSend не скидає відстеження — після пісні індикатор показуватиме старий вірш');
  // clearLive («очистити») має робити те саме — перевіряємо, що не зламали
  if (/lastLiveGraphicsTargets = \[\];[\s\S]{0,200}state\.multiLive = \[\]/.test(SRC.extras))
    ok('«очистити» теж скидає обидва списки');
  else bad('«очистити» лишає списки — наступне гортання поверне вірш на очищений екран');

  // ЖИВА перевірка логіки лагодження
  try {
    const s = b.indexOf('function assertOutputConsistency');
    const e = b.indexOf('function sendBibleWithGraphics');
    const sandbox = {};
    (new Function('state', 'OUT_NAME', 'console', 'exports',
      'var lastLiveGraphicsTargets=[],lastLiveGraphics=false,lastLiveMulti=false;' + b.slice(s, e) +
      'exports.A=assertOutputConsistency; exports.S=outputModeSummary;' +
      'exports.set=function(a,m){lastLiveGraphicsTargets=a;state.multiLive=m;};' +
      'exports.get=function(){return {single:lastLiveGraphicsTargets,multi:state.multiLive};};'
    ))({ multiLive: [] }, { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }, { warn: function () {} }, sandbox);

    sandbox.set([1, 2], [1]);
    const detected = sandbox.A(1, 'multi') === false;
    const g1 = sandbox.get();
    if (detected && g1.single.indexOf(1) < 0 && g1.multi.indexOf(1) >= 0)
      ok('конфлікт (вихід в обох списках) виявлено й полагоджено на користь останньої дії');
    else bad('конфлікт не виявлено або полагоджено неправильно: ' + JSON.stringify(g1));

    // «на всі» (0) має розгорнутись, інакше перетин не видно
    sandbox.set([0], [1]);
    sandbox.A(null, 'multi');
    const g2 = sandbox.get();
    if (g2.single.indexOf(1) < 0 && g2.single.length === 3)
      ok('режим «на всі» коректно розгортається — вихід у мульти з нього виключається');
    else bad('режим «на всі» ламає перевірку: ' + JSON.stringify(g2));

    // Нормальний стан чіпати не можна
    sandbox.set([2], [1]);
    const clean = sandbox.A(null, 'single') === true;
    const g3 = sandbox.get();
    if (clean && g3.single.length === 1 && g3.multi.length === 1)
      ok('нормальний стан сторож не чіпає (немає хибних спрацювань)');
    else bad('сторож псує коректний стан: ' + JSON.stringify(g3));
  } catch (e) {
    bad('жива перевірка сторожа впала: ' + e.message);
  }
})();

head('Вбудовані шаблони графіки (GDD) — файли + підключення');
(function () {
  const fs2 = require('fs');
  const ho = read('src/html-overlay.js');
  const TPL = ['lower-third', 'announcement', 'countdown', 'verse'];
  const missing = TPL.filter(t => !fs2.existsSync(path.join(ROOT, 'src/templates/gdd/' + t + '.html')));
  if (!missing.length) ok('усі 4 файли шаблонів на місці (src/templates/gdd/)');
  else bad('бракує файлів шаблонів: ' + missing.join(', '));
  // Файли самі по собі нічого не дають — перевіряємо, що вони ПІДКЛЮЧЕНІ.
  // Саме тут була помилка: шаблони створили, а в програму не завели.
  if (/var GDD_TEMPLATES = \[/.test(ho) && /function addGddTemplate\(i\)/.test(ho) && /function renderGddTemplatePicker\(\)/.test(ho))
    ok('GDD_TEMPLATES + addGddTemplate + renderGddTemplatePicker визначені');
  else bad('шаблони не підключені в коді — файли лежать мертвим вантажем');
  if (/id="gddTemplateList"/.test(SRC.index)) ok('контейнер #gddTemplateList є у вкладці HTML');
  else bad('немає контейнера — кнопки шаблонів нікуди рендерити');
  // Вкладка html будується ОДИН раз при старті, тож рендер має бути в steps
  if (/renderGddTemplatePicker,/.test(SRC.extras))
    ok('renderGddTemplatePicker є в steps — кнопки зʼявляться одразу, а не після дії');
  else bad('renderGddTemplatePicker не в steps — список шаблонів стартуватиме порожнім');
  // Кожен шаблон має бути валідним GDD, інакше «⚙ Поля» буде порожня
  try {
    const f = read('src/formats.js');
    const sandbox = {};
    (new Function('exports', f.slice(f.indexOf('function gddDetect'), f.indexOf('function gddInject')) +
      '\nexports.schema=gddSchema;'))(sandbox);
    const broken = [];
    TPL.forEach(t => {
      const html = fs2.readFileSync(path.join(ROOT, 'src/templates/gdd/' + t + '.html'), 'utf8');
      const sch = sandbox.schema(html);
      if (!sch.length) { broken.push(t + ' (немає схеми)'); return; }
      // кожне поле має бути або в розмітці (data-gdd), або оброблене в update()
      const unwired = sch.map(x => x.key).filter(k =>
        !new RegExp('data-gdd="' + k + '"').test(html) && !new RegExp('d\\.' + k).test(html));
      if (unwired.length) broken.push(t + ' (поля без привʼязки: ' + unwired.join(',') + ')');
    });
    if (!broken.length) ok('усі 4 шаблони — валідний GDD, кожне поле привʼязане до розмітки або update()');
    else bad('зламані шаблони: ' + broken.join('; '));
  } catch (e) {
    bad('перевірка схем шаблонів впала: ' + e.message);
  }
})();

head('Імпорт перекладів із локалізованими назвами книг (UA_Ogienko/Czech_CEP тощо)');
(function () {
  const f = read('src/formats.js');
  if (/function fmtParseBibleNamedBooks\(text\)/.test(f)) ok('fmtParseBibleNamedBooks визначена');
  else { bad('ЗНИК парсер перекладів із локалізованими назвами книг'); return; }
  // Має бути в обох шляхах диспетчера — і за розширенням, і в переборі
  if (/json: \[fmtParseBibleJSON, fmtParseBibleNamedBooks\]/.test(f))
    ok('зареєстрований для .json ПІСЛЯ внутрішнього формату (той має пріоритет)');
  else bad('не зареєстрований для .json або перехоплює внутрішній формат');
  if (/const all = \[fmtParseBibleJSON, fmtParseBibleNamedBooks,/.test(f))
    ok('є в загальному переборі парсерів');
  else bad('немає в загальному переборі — файл без розширення не розпізнається');

  // ЖИВА перевірка: назви книг МУСЯТЬ перетворюватись на канонічні коди.
  // Це головне: мульти-переклади шукають ту саму книгу за КОДОМ, тож
  // «Вiд Iвана», «Jan» і «От Иоанна» мають дати один і той самий joh —
  // інакше два переклади поруч не зіставляться.
  try {
    const sandbox = {};
    (new Function('exports', f.slice(0, f.indexOf('function fmtParseBibleJSON')) +
      '\nexports.p=fmtParseBibleNamedBooks; exports.id=fmtBookId;'))(sandbox);
    if (sandbox.id('Вiд Iвана') === 'joh' && sandbox.id('Jan') === 'joh')
      ok('назви різними мовами зводяться до одного коду (укр «Вiд Iвана» = чес «Jan» = joh)');
    else bad('назви книг різними мовами дають різні коди — мульти-переклади не зіставляться');

    const sample = JSON.stringify({
      translation: 'Тест', abbreviation: 'TST', language: 'uk',
      books: { 'Вiд Iвана': { '3': { '16': 'Так бо Бог полюбив світ' } },
               'Буття':     { '1': { '1': 'Напочатку' } } }
    });
    const r = sandbox.p(sample);
    if (r && r.books.joh && r.books.joh['3']['16'] === 'Так бо Бог полюбив світ' && r.books.gen)
      ok('розбір: книги розкладено за кодами (joh/gen), текст на місці');
    else bad('розбір дає неправильну структуру: ' + JSON.stringify(r && Object.keys(r.books || {})));
    if (r && Array.isArray(r._unknownBooks)) ok('нерозпізнані книги повертаються списком (не глухо ігноруються)');
    else bad('немає списку нерозпізнаних книг — неповний імпорт пройде непомітно');
    // Внутрішній формат НЕ має перехоплюватись цим парсером
    const inner = JSON.stringify({ name: 'X', books: { joh: { '3': { '16': 'a' } } } });
    const ri = sandbox.p(inner);
    if (!ri || ri.books.joh) ok('внутрішній формат (книги вже за кодами) не ламається цим парсером');
    else bad('парсер псує внутрішній формат');
  } catch (e) {
    bad('жива перевірка імпорту перекладів впала: ' + e.message);
  }
})();

head('Публічний API: читання стану + захист від перебору PIN');
(function () {
  const m = SRC.main;
  // GET /api/state — головна прогалина: без неї Stream Deck/Companion
  // не можуть підсвітити активну кнопку, а автоматизація діє наосліп.
  if (/if \(action === 'state'\)/.test(m) && /state: lastRemoteState/.test(m))
    ok('GET /api/state віддає поточний стан (з того ж lastRemoteState, що й веб-пульт)');
  else bad('немає GET /api/state — зовнішні системи не бачать, що в ефірі');
  if (/if \(action === 'docs'\)/.test(m) && /stateFields/.test(m))
    ok('GET /api/docs — самоопис API (щоб документація не розʼїжджалась із кодом)');
  else bad('немає GET /api/docs');
  // Стан має містити поля для підсвітки кнопок
  const ix = SRC.index;
  if (/blackout: !!\(window\.state && window\.state\.blackout\)/.test(ix) && /outputs: \(function \(\)/.test(ix))
    ok('у стані є blackout і outputs[] (route/frozen/live) — достатньо для підсвітки кнопок');
  else bad('стан не містить blackout/outputs — кнопки не знатимуть, що активне');
  // Rate-limit (пункт аудиту, був відкритий)
  if (/const API_MAX_FAILS = 10/.test(m) && /function apiNoteFail/.test(m) && /function apiClearFails/.test(m))
    ok('rate-limit на невдалі PIN визначено (лічильник по IP)');
  else bad('немає rate-limit — PIN підбирається перебором за хвилини');
  if (/if \(apiIsBlocked\(req\)\)[\s\S]{0,200}429/.test(m))
    ok('заблокований клієнт отримує 429 + Retry-After ДО перевірки PIN');
  else bad('перевірка блокування не підключена на вході в API');
  if (/apiNoteFail\(req\);[\s\S]{0,200}wrong pin/.test(m) && /apiClearFails\(req\);/.test(m))
    ok('невдала спроба рахується, успішна — скидає лічильник (оператор з друкарською помилкою не постраждає)');
  else bad('лічильник спроб не оновлюється правильно');

  // ЖИВА перевірка логіки блокування
  try {
    const s = m.indexOf('const API_FAILS');
    const marker = 'function apiClearFails(req) { API_FAILS.delete(apiClientIp(req)); }';
    const e = m.indexOf(marker) + marker.length;
    if (s < 0 || e <= marker.length) throw new Error('не знайдено блок rate-limit у main.js');
    const sandbox = {};
    (new Function('exports', m.slice(s, e) +
      '\nexports.block=apiIsBlocked; exports.fail=apiNoteFail; exports.clear=apiClearFails;'))(sandbox);
    const req = { socket: { remoteAddress: '1.2.3.4' } };
    let blockedAt = null;
    for (let i = 1; i <= 12; i++) {
      if (!sandbox.block(req)) sandbox.fail(req);
      else if (!blockedAt) blockedAt = i;
    }
    if (blockedAt === 11) ok('блокування спрацьовує рівно після 10 невдалих спроб');
    else bad('блокування спрацювало на спробі ' + blockedAt + ' (очікувалось 11)');
    if (!sandbox.block({ socket: { remoteAddress: '9.9.9.9' } }))
      ok('блокування по IP — сусідній клієнт не постраждав');
    else bad('заблоковано всіх, а не конкретний IP');
    sandbox.clear(req);
    if (!sandbox.block(req)) ok('успішний вхід знімає блокування');
    else bad('лічильник не скидається після успішного входу');
  } catch (e) {
    bad('жива перевірка rate-limit впала: ' + e.message);
  }
})();

head('Порядок завантаження: rafDebounce визначений ДО всіх, хто ним користується');
(function () {
  const fs2 = require('fs');
  // Реальний баг, який це ловить: rafDebounce жив у extras-1.js, а
  // background.js вантажиться раніше й кличе обгорнуту render-функцію
  // вже на старті (initBgLibrary) — застосунок падав з
  // «rafDebounce is not defined». Hoisting тут не допомагає: він діє в
  // межах ОДНОГО файлу, а не між файлами.
  const order = SRC.index.split('\n')
    .filter(l => /^<script src="[^"]+\.js"><\/script>/.test(l))
    .map(l => l.match(/src="([^"]+)"/)[1]);
  const defAt = order.indexOf('core/reactive.js');
  if (defAt < 0) { bad('core/reactive.js не підключений у index.html'); return; }
  const users = order.filter(f => {
    try {
      const s = fs2.readFileSync(path.join(ROOT, 'src', f), 'utf8');
      return /rafDebounce\(/.test(s) && !/function rafDebounce/.test(s);
    } catch (e) { return false; }
  });
  const early = users.filter(u => order.indexOf(u) < defAt);
  if (!early.length) ok('усі ' + users.length + ' користувачів rafDebounce вантажаться ПІСЛЯ core/reactive.js');
  else bad('вантажаться ЗАРАНО (впаде на старті): ' + early.join(', '));
  // Визначення має бути саме в reactive.js і саме в однині
  const inReactive = /function rafDebounce\(fn\)/.test(read('src/core/reactive.js'));
  const inExtras1 = /function rafDebounce\(fn\)/.test(read('src/extras-1.js'));
  if (inReactive && !inExtras1) ok('rafDebounce визначена рівно один раз — у core/reactive.js');
  else bad(inExtras1 ? 'rafDebounce повернулась в extras-1.js — порядок знову зламається' : 'rafDebounce зникла з core/reactive.js');
})();

head('Біблія: мульти-переклади й одиночний вивід не конфліктують за один екран');
(function () {
  const b = read('src/bible.js');
  // Вихід, що переходить у мульти-режим, МУСИТЬ зникнути з
  // lastLiveGraphicsTargets. Інакше він опиняється і там, і в
  // state.multiLive — і стрілки ◀▶ шлють на нього два різні кадри
  // підряд: екран блимає й показує не те, що очікує оператор.
  if (/sendMultiToOutput === 'function'\)[\s\S]{0,700}lastLiveGraphicsTargets = lastLiveGraphicsTargets\.filter[\s\S]{0,200}sendMultiToOutput\(target\)/.test(b))
    ok('перехід виходу в мульти-режим прибирає його з одно-перекладного списку (без подвійного кадру)');
  else bad('вихід може опинитись і в lastLiveGraphicsTargets, і в multiLive — стрілки даватимуть різне на екранах');
  // Дзеркально: bibleGraphicsTo знімає свої цілі з multiLive
  if (/state\.multiLive = state\.multiLive\.filter\(function\(x\) \{\s*return \(targets \|\| \[\]\)\.indexOf\(x\) < 0/.test(b))
    ok('одиночний вивід знімає свої екрани з мульти-режиму (дзеркальний бік тієї ж проблеми)');
  else bad('одиночний вивід не знімає екрани з multiLive — той самий конфлікт у зворотний бік');
  // sendBibleGraphicsMulti має відстежувати ОБИДВІ групи, інакше
  // частина екранів випадає зі стану й застигає на старому вірші.
  const smBody = (b.match(/function sendBibleGraphicsMulti[\s\S]*?\n\}/) || [''])[0];
  if (/multi\.push\(t\)/.test(smBody) && /if \(multi\.length\) lastLiveMulti = true/.test(smBody) && /if \(rest\.length\) bibleGraphicsTo\(rest\)/.test(smBody))
    ok('«2 виводи»/«Усі 4»: відстежуються і мульти-, і одно-перекладні цілі (стрілки оновлять усі екрани)');
  else bad('sendBibleGraphicsMulti губить частину цілей — ті екрани застигнуть при гортанні');
})();

head('Формат SPS (SongPresenter) — імпорт і експорт');
(function () {
  const f = read('src/formats.js');
  if (/function fmtParseSPS\(text\)/.test(f)) ok('fmtParseSPS визначена (імпорт)');
  else bad('ЗНИКЛА fmtParseSPS — імпорт .sps не працюватиме');
  if (/function fmtBuildSPS\(songs, songbookTitle\)/.test(f)) ok('fmtBuildSPS визначена (експорт)');
  else bad('ЗНИКЛА fmtBuildSPS — експорт у .sps не працюватиме');
  if (/sps:\s*\[fmtParseSPS\]/.test(f)) ok('.sps зареєстровано в диспетчері fmtParseSongs (за розширенням)');
  else bad('.sps не в диспетчері — файл не розпізнається за розширенням');
  // Порядок у загальному переборі: SPS має стояти ПЕРЕД CSV/TXT, інакше
  // ті «проковтнуть» SPS-файл і повернуть сміття замість пісень.
  // Беремо саме ПІСЕННИЙ перебір (шукаємо від fmtParseSongs), бо вище у
  // файлі є ще один `const all` — для біблійних парсерів.
  const songsDispatch = f.slice(f.indexOf('function fmtParseSongs'));
  const allLine = (songsDispatch.match(/const all = \[[^\]]+\]/) || [''])[0];
  if (allLine.indexOf('fmtParseSPS') >= 0 &&
      allLine.indexOf('fmtParseSPS') < allLine.indexOf('fmtParseSongsCSV') &&
      allLine.indexOf('fmtParseSPS') < allLine.indexOf('fmtParseSongsTXT'))
    ok('fmtParseSPS стоїть перед CSV/TXT у переборі — вони не «проковтнуть» SPS-файл');
  else bad('порядок парсерів змінено: CSV/TXT можуть перехопити SPS і повернути сміття');
  if (/accept="[^"]*\.sps[^"]*"/.test(SRC.index)) ok('.sps є у списку accept вибору файлів');
  else bad('.sps немає в accept — файл не вибереться у діалозі');

  // ЖИВА перевірка на справжніх даних: розбір + круговий рейс.
  try {
    const i = f.indexOf('function fmtParseSPS');
    const j = f.indexOf('// TXT: перший непорожній');
    const sandbox = {};
    (new Function('exports', f.slice(i, j) + '\nexports.p=fmtParseSPS; exports.b=fmtBuildSPS;'))(sandbox);
    const sample =
      '##12\n##Тестовий збірник\n##(c) 2026\n' +
      '7#$#Назва пісні#$#0#$#соль-мажор#$#Перекладач#$#Автор#$#' +
      'Куплет 1.@%Рядок один,@%Рядок два.@$Приспів:@%Приспів рядок.#$##$#left#$#\n';
    const songs = sandbox.p(sample);
    if (songs && songs.length === 1 && songs[0].title === 'Назва пісні' &&
        songs[0].verses.length === 2 &&
        songs[0].verses[0] === 'Куплет 1.\nРядок один,\nРядок два.' &&
        songs[0].number === '7' && songs[0].key === 'соль-мажор')
      ok('розбір SPS: назва/номер/тональність/куплети — @% і @$ розкодовано правильно');
    else bad('розбір SPS дає неправильний результат: ' + JSON.stringify(songs && songs[0]));
    // Круговий рейс: експорт → імпорт має дати ті самі пісні
    const back = sandbox.p(sandbox.b(songs, 'Тестовий збірник'));
    if (back && back.length === 1 && back[0].title === songs[0].title &&
        back[0].verses.join('|') === songs[0].verses.join('|'))
      ok('круговий рейс SPS: експорт → імпорт повертає ті самі пісні без втрат');
    else bad('круговий рейс SPS втрачає дані');
    // Роздільники не мають потрапити в дані й зламати файл
    const evil = sandbox.b([{ title: 'A#$#B', verses: ['x@$y@%z'], author: '' }], 'T');
    if (sandbox.p(evil).length === 1)
      ok('роздільники (#$#, @$, @%) у самому тексті екрануються — файл не ламається');
    else bad('роздільник усередині даних ламає експортований файл');
  } catch (e) {
    bad('жива перевірка SPS впала: ' + e.message);
  }
})();

head('Живий тест (context-isolation-test.js) — наявність і можливість запуску');
(function () {
  const fs2 = require('fs');
  const tPath = path.join(ROOT, 'context-isolation-test.js');
  if (!fs2.existsSync(tPath)) { bad('ЗНИК context-isolation-test.js — живий регресійний тест втрачено'); return; }
  ok('context-isolation-test.js на місці');
  const t = fs2.readFileSync(tPath, 'utf8');
  let pkg;
  try { pkg = JSON.parse(read('package.json')); } catch (e) { bad('package.json не парситься: ' + e.message); return; }
  // Тест вимагає playwright. Якщо його немає в devDependencies, тест
  // фізично не запуститься після свіжого npm install — і мовчки
  // «зникне» з обігу, хоча файл лежить у репозиторії.
  const dev = pkg.devDependencies || {};
  if (/require\('playwright'\)/.test(t)) {
    if (dev.playwright) ok('playwright є в devDependencies — живий тест можна запустити після npm install');
    else bad('context-isolation-test.js вимагає playwright, але його НЕМАЄ в devDependencies — тест не запуститься');
  }
  if (pkg.scripts && pkg.scripts['test-live']) ok('є npm-скрипт test-live для запуску живого тесту');
  else bad('немає скрипта test-live — живий тест доведеться запускати вручну');
  // Живий тест НЕ має бути в звичайному `npm test`: він потребує
  // справжнього Electron і дисплея, тож у швидкому прогоні падав би.
  if (pkg.scripts && !/context-isolation-test/.test(pkg.scripts.test || ''))
    ok('npm test лишається швидким (без Electron) — живий тест окремою командою');
  else bad('живий тест потрапив у npm test — швидкий прогін вимагатиме Electron і дисплея');
})();

head('Аудит 4.1, крок 2: contextIsolation/webSecurity УВІМКНЕНО на output-вікнах');
(function () {
  const m = SRC.main;
  // Перевіряємо саме блок createOutputWindow (output-вікна), а не інші
  // вікна — у mainWin/Stage ізоляція була увімкнена й раніше.
  const i = m.indexOf('title: OUTPUT_TITLES[kind]');
  // Прибираємо коментарі: у самому блоці є пояснення, де згадуються
  // і contextIsolation:false (як було раніше), і contextIsolation:true
  // (чому безпечно). Без цієї фільтрації тест ловив би текст пояснення
  // замість справжнього налаштування — і не помітив би відкату.
  const block = i >= 0
    ? m.slice(i, i + 2400).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
    : '';
  if (/contextIsolation:\s*true/.test(block)) ok('output-вікна: contextIsolation:true');
  else bad('РЕГРЕСІЯ БЕЗПЕКИ: contextIsolation на output-вікнах знову false');
  if (/webSecurity:\s*true/.test(block)) ok('output-вікна: webSecurity:true');
  else bad('РЕГРЕСІЯ БЕЗПЕКИ: webSecurity на output-вікнах знову false');
  if (/allowRunningInsecureContent:\s*false/.test(block)) ok('output-вікна: allowRunningInsecureContent:false');
  else bad('РЕГРЕСІЯ БЕЗПЕКИ: allowRunningInsecureContent знову true');
  // Передумова, від якої залежить безпечність contextIsolation:true тут:
  // projector.html не має власних <script>, уся логіка в preload, який
  // ділить DOM зі сторінкою. Якщо колись у сторінку додадуть скрипт, що
  // читає window-змінні з preload — воно тихо зламається.
  const ph = read('src/projector.html');
  if (!/<script/i.test(ph))
    ok('projector.html без власних <script> — передумова безпеки contextIsolation:true збережена');
  else bad('у projector.html зʼявився <script> — перевір, чи не читає він window-змінні з preload (isolated world!)');
})();

head('Двигун, фаза 2В: пакетування дрібних render-функцій (rafDebounce)');
(function () {
  const DEB = [
    ['src/html-overlay.js', 'renderHTMLOverlayList'],
    ['src/song-display.js', 'renderSongOrderMini'],
    ['src/song-edit.js', 'renderAllSongs'],
    ['src/tabs/media/media.js', 'renderMediaList'],
    ['src/extras-1.js', 'renderEmergencyPanel'],
    ['src/background.js', 'renderUserBgGrid'],
    ['src/background.js', 'renderBuiltinBgGrid']
  ];
  const missing = [];
  const unsafe = [];
  for (const [rel, fn] of DEB) {
    const src = read(rel);
    // Реалізація винесена в _<fn>Now, а <fn> — тонка обгортка
    if (!new RegExp('function _' + fn + 'Now\\(').test(src)) { missing.push(fn); continue; }
    if (!new RegExp('_' + fn + 'Deb = rafDebounce\\(_' + fn + 'Now\\)').test(src)) { missing.push(fn); continue; }
    // КРИТИЧНО: обгортка МУСИТЬ бути function-декларацією (піднімається),
    // а НЕ `const <fn> = rafDebounce(...)` — const створив би temporal dead
    // zone і виклик до цього рядка впав би. Цей клас бага в проєкті вже
    // ловився двічі (loadDisplayToggles), тож фіксуємо тестом.
    // Ігноруємо коментарі: у самій обгортці є пояснення, чому НЕ можна
    // робити `const <fn> = rafDebounce(...)` — і без цієї фільтрації
    // тест чіплявся б саме за текст того пояснення.
    const code = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    if (new RegExp('const ' + fn + ' = rafDebounce').test(code)) { unsafe.push(fn); continue; }
    if (!new RegExp('function ' + fn + '\\(\\)').test(code)) { unsafe.push(fn); }
  }
  if (!missing.length) ok('усі 7 дрібних render-функцій загорнуто в rafDebounce (склеювання підряд ідучих викликів)');
  else bad('без пакетування або зламано обгортку: ' + missing.join(', '));
  if (!unsafe.length) ok('обгортки — function-декларації з лінивою ініціалізацією (hoisting безпечний, без TDZ)');
  else bad('TDZ-РИЗИК: обгортку зроблено через const — виклик до цього рядка впаде: ' + unsafe.join(', '));

  // updateGraphicsPreview НАВМИСНО не пакетується: воно не лише малює, а
  // й зчитує значення полів у state. Відкладений виклик означав би, що
  // наступне надсилання візьме застарілий стан.
  const ex1 = read('src/extras-1.js');
  if (/function updateGraphicsPreview\(\)/.test(ex1) && !/_updateGraphicsPreviewDeb/.test(ex1))
    ok('updateGraphicsPreview навмисно НЕ пакетується (пише в state — відкладення дало б застарілий стан)');
  else bad('updateGraphicsPreview запаковано — ризик застарілого state при надсиланні');
})();

head('Двигун, фаза 2: реактивний шар (пакетний перерендер замість ручних renderTabInto)');
(function () {
  const fs2 = require('fs');
  const rPath = path.join(ROOT, 'src/core/reactive.js');
  if (!fs2.existsSync(rPath)) { bad('ЗНИК src/core/reactive.js — фаза 2 втрачена'); return; }
  ok('src/core/reactive.js існує');
  const ix = SRC.index;
  // Мусить вантажитись ДО extras-1.js і файлів вкладок, які його кличуть
  const iCore = ix.indexOf('<script src="core/reactive.js">');
  const iEx1 = ix.indexOf('<script src="extras-1.js">');
  if (iCore >= 0 && iEx1 >= 0 && iCore < iEx1)
    ok('<script> core/reactive.js стоїть ДО extras-1.js (markDirty доступний усім, хто його кличе)');
  else bad('core/reactive.js вантажиться запізно — markDirty буде undefined у вкладках');
  // Пілот: text_control переведено на markDirty і НЕ лишилось прямих викликів
  const tc = read('src/tabs/text_control/text_control.js');
  if (/markDirty\('textcontrol'\)/.test(tc) && !/renderTabInto\('textcontrol'\)/.test(tc))
    ok('пілот: text_control повністю на markDirty, прямих renderTabInto не лишилось');
  else bad('пілот text_control або не переведено, або переведено частково (лишились прямі виклики)');
  // Конвертація завершена: у ВСЬОМУ коді не має лишитись жодного прямого
  // виклику renderTabInto (крім самого визначення й тексту в console.error).
  // Інакше частина коду обходила б пакетування — і ми б знову отримали
  // по 3-4 перемальовки на одну дію там, де це пропустили.
  try {
    const glob = ['src/extras-1.js','src/extras-2.js','src/extras-3.js','src/extras-4.js'];
    const tabFiles = fs2.readdirSync(path.join(ROOT, 'src/tabs'))
      .flatMap(d => {
        const dir = path.join(ROOT, 'src/tabs', d);
        return fs2.statSync(dir).isDirectory()
          ? fs2.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => 'src/tabs/' + d + '/' + f)
          : [];
      });
    const leftovers = [];
    for (const rel of glob.concat(tabFiles)) {
      const src = read(rel);
      // Прямий виклик: renderTabInto( з рядком або змінною, але НЕ
      // оголошення функції і НЕ згадка всередині рядка повідомлення.
      const re = /(^|[^\w.])renderTabInto\(\s*['"a-zA-Z_]/g;
      let m;
      while ((m = re.exec(src))) {
        const line = src.slice(0, m.index).split('\n').length;
        const text = src.split('\n')[line - 1] || '';
        if (/function renderTabInto/.test(text)) continue;
        if (/console\.error/.test(text)) continue;
        if (/^\s*\/\//.test(text)) continue;
        leftovers.push(rel + ':' + line);
      }
    }
    if (!leftovers.length) ok('конвертація завершена: жодного прямого renderTabInto у всьому коді (усе через markDirty)');
    else bad('лишились прямі виклики renderTabInto (обходять пакетування): ' + leftovers.slice(0, 5).join(', '));
  } catch (e) {
    bad('перевірка залишків renderTabInto впала: ' + e.message);
  }
  // showTab МУСИТЬ кликати flushTabOnShow, інакше вкладка, змінена поки
  // була схована, покаже застарілий вміст (вміст будується раз при старті).
  if (/flushTabOnShow\(name\)/.test(ix))
    ok('showTab кличе flushTabOnShow — схована вкладка не покаже застаріле при відкритті');
  else bad('showTab НЕ кличе flushTabOnShow — вкладки показуватимуть застарілі дані');

  // ЖИВА поведінкова перевірка — головне, заради чого весь шар:
  // N викликів поспіль мусять дати РІВНО ОДИН реальний рендер.
  try {
    delete require.cache[require.resolve(rPath)];
    const r = require(rPath);
    const renders = [];
    global.isActive = (t) => t === 'vis';
    global.renderTabInto = (t) => renders.push(t);
    for (let i = 0; i < 10; i++) r.markDirty('vis');
    r.flushNow();
    if (renders.length === 1) ok('10 викликів markDirty підряд → РІВНО 1 перемальовка (склеювання працює)');
    else bad('склеювання не працює: ' + renders.length + ' перемальовок замість 1');

    const before = renders.length;
    r.markDirty('hidden-tab');
    r.flushNow();
    if (renders.length === before) ok('невидима вкладка не перемальовується дарма (економія на фонових вкладках)');
    else bad('невидимі вкладки й досі перемальовуються');
    // КРИТИЧНО для цієї архітектури: showTab лише перемикає CSS-клас, а
    // вміст вкладок будується ОДИН раз при старті (TABS.forEach). Тому
    // пропущену «брудну» вкладку ОБОВʼЯЗКОВО треба домалювати при
    // відкритті — інакше вона покаже застарілі дані.
    if (r.pendingHiddenCount() === 1) ok('пропущена вкладка не забута — стоїть у черзі на домальовку');
    else bad('пропущену вкладку забуто — покаже застарілі дані при відкритті');
    global.isActive = (t) => t === 'hidden-tab';
    r.flushTabOnShow('hidden-tab');
    if (renders[renders.length - 1] === 'hidden-tab' && r.pendingHiddenCount() === 0)
      ok('flushTabOnShow домальовує вкладку при відкритті (захист від застарілого вмісту)');
    else bad('flushTabOnShow не домальовує — вкладка покаже застаріле');

    // Рендер, що падає, не має зривати решту черги — інакше одна
    // помилка в одній вкладці зупиняла б оновлення всіх інших.
    let sideEffect = 0;
    global.renderTabInto = (t) => { throw new Error('boom'); };
    r.markDirty('vis');
    r.markDirtyFn('after', () => { sideEffect++; });
    r.flushNow();
    if (sideEffect === 1) ok('падіння одного рендера не зриває решту черги (ізоляція помилок)');
    else bad('падіння рендера зриває всю чергу — одна помилка заморозить весь UI');
    delete global.isActive; delete global.renderTabInto;
  } catch (e) {
    bad('жива перевірка реактивного шару впала: ' + e.message);
  }
})();

head('Двигун, фаза 1Б: перемикач каналу доставки (file:// ↔ app://) з безпечним типовим значенням');
(function () {
  const ex = SRC.extras;
  if (/function overlayChannelIsApp\(\)/.test(ex) && /function setOverlayChannel\(useApp\)/.test(ex) && /function loadOverlayChannel\(\)/.test(ex))
    ok('overlayChannelIsApp/setOverlayChannel/loadOverlayChannel визначені');
  else bad('ЗНИК перемикач каналу доставки — фаза 1Б втрачена');
  // Типове значення МУСИТЬ бути «старий канал»: !! від undefined = false.
  // Якщо тут колись зʼявиться `!== false` чи подібне — типовим стане новий
  // канал, і церква отримає неперевірений шлях доставки без попередження.
  if (/return !!\(state && state\.useAppProtocol\) && !!\(window\.electronAPI && window\.electronAPI\.writeHtmlOverlayApp\)/.test(ex))
    ok('типово — старий file://-канал; новий лише коли І прапорець увімкнено, І API справді є (є фолбек)');
  else bad('логіку вибору каналу змінено — можливе типове вмикання неперевіреного каналу');
  // Усі ТРИ місця доставки мають іти через overlayPath, інакше перемикач
  // діяв би лише частково (частина контенту на одному каналі, частина на іншому).
  const ho = read('src/html-overlay.js'), bg = read('src/background.js');
  if (/overlayPath\(htmlContent\)\.then/.test(ho) && !/electronAPI\.writeHtmlOverlay\(htmlContent\)/.test(ho))
    ok('html-overlay.js (doSendHTML) іде через overlayPath — перемикач діє й тут');
  else bad('doSendHTML обходить overlayPath — перемикач діятиме лише частково');
  if (/overlayPath\(bgHtml\)\.then/.test(bg) && !/electronAPI\.writeHtmlOverlay\(bgHtml\)/.test(bg))
    ok('background.js (фони) іде через overlayPath — перемикач діє й тут');
  else bad('фони обходять overlayPath — перемикач діятиме лише частково');
  // Стан має відновлюватись при старті, інакше перемикач «забувається»
  if (/loadOverlayChannel,/.test(ex)) ok('loadOverlayChannel є в steps — вибір каналу переживає перезапуск');
  else bad('loadOverlayChannel не в steps — перемикач скидатиметься при кожному запуску');
  if (/onchange="setOverlayChannel\(this\.checked\)"/.test(ex))
    ok('перемикач доступний в UI (вкладка Налаштування) — відкат без перезбірки');
  else bad('немає UI-перемикача — відкотитись під час служби буде нічим');
})();

head('Двигун, фаза 1: кастомна привілейована схема app:// (фундамент для contextIsolation/webSecurity)');
(function () {
  const fs2 = require('fs');
  const cpPath = path.join(ROOT, 'src/main/content-protocol.js');
  if (!fs2.existsSync(cpPath)) { bad('ЗНИК src/main/content-protocol.js — фундамент фази 1 втрачено'); return; }
  ok('src/main/content-protocol.js існує');
  const m = SRC.main;

  // registerSchemesAsPrivileged МУСИТЬ бути до app.whenReady() — це
  // жорстка вимога Electron, інакше схема просто не працює.
  const iScheme = m.indexOf('contentProtocol.registerScheme(protocol)');
  // Саме ВИКЛИК app.whenReady().then(, а не згадка в коментарі вище.
  const iReady = m.indexOf('app.whenReady().then(');
  if (iScheme >= 0 && iReady >= 0 && iScheme < iReady)
    ok('registerScheme викликається ДО app.whenReady() (вимога Electron)');
  else bad('registerScheme після app.whenReady() — схема app:// не працюватиме');
  if (/contentProtocol\.registerHandler\(protocol\)/.test(m) && /contentProtocol\.register\(ipcMain\)/.test(m))
    ok('registerHandler + register(ipcMain) викликаються всередині whenReady');
  else bad('Не зареєстровано обробник схеми або IPC — app:// не віддаватиме контент');

  // Сумісність: старий file://-канал МАЄ лишитись недоторканим, інакше
  // цей крок перестає бути безпечним «паралельним» каналом.
  if (/ipcMain\.handle\('write-html-overlay'/.test(m) && /pathToFileURL\(tmpPath\)\.href/.test(m))
    ok('старий канал write-html-overlay (file://) лишився без змін — нічого не зламано');
  else bad('старий file://-канал змінено/видалено — це вже не безпечний паралельний крок');
  if (/writeHtmlOverlayApp:/.test(read('src/preload.js')) && /writeHtmlOverlay:/.test(read('src/preload.js')))
    ok('preload віддає обидва канали (writeHtmlOverlay + writeHtmlOverlayApp)');
  else bad('preload не віддає новий канал writeHtmlOverlayApp');

  // ЖИВА функціональна перевірка модуля (не regex): реально
  // виконуємо обробник і перевіряємо і роботу, і безпеку.
  try {
    delete require.cache[require.resolve(cpPath)];
    const cp = require(cpPath);
    const os2 = require('os');
    process.env.CHURCH_USERDATA = os2.tmpdir();
    let handler = null;
    cp.registerHandler({ handle: (s, fn) => { handler = fn; } });
    const id = cp.putContent('<b>x</b>');
    // Обробник синхронний і повертає Response — читаємо тіло без await,
    // щоб перевірка лишалась у синхронному потоці smoke-test.
    const rOk = handler({ url: 'app://content/' + id });
    const rMissing = handler({ url: 'app://content/zzz' });
    const rPasswd = handler({ url: 'app://file/' + encodeURIComponent('/etc/passwd') });
    const rTraversal = handler({ url: 'app://file/' + encodeURIComponent(os2.tmpdir() + '/../../etc/passwd') });
    if (rOk && (rOk.status === 200 || rOk.status === undefined)) ok('app://content/<id> реально віддає збережений HTML (200)');
    else bad('app://content не віддає контент');
    if (rMissing && rMissing.status === 404) ok('неіснуючий id → 404 (прозорий порожній HTML, не падіння)');
    else bad('неіснуючий id не дає 404');
    if (rPasswd && rPasswd.status === 403 && rTraversal && rTraversal.status === 403)
      ok('БЕЗПЕКА: app://file блокує і читання поза дозволеними теками, і обхід через ../');
    else bad('ДІРА БЕЗПЕКИ: app://file читає файли поза дозволеними теками');
  } catch (e) {
    bad('не вдалось завантажити content-protocol.js: ' + e.message);
  }
})();

head('Модуляризація (крок 24): Пісня — ЛИШЕ render-функція винесена (songStep/orderAdd лишились на місці)');
(function () {
  const fs2 = require('fs');
  const songPath = path.join(ROOT, 'src/tabs/song/song.js');
  if (fs2.existsSync(songPath)) ok('src/tabs/song/song.js існує (крок 24 модуляризації)');
  else bad('ЗНИК tabs/song/song.js — крок 24 розбивки коду втрачено');
  const ex3 = read('src/extras-3.js'), ex2 = read('src/extras-2.js');
  if (!/^function renderSongTab\(/m.test(ex3)) ok('renderSongTab не задубльована назад в extras-3.js');
  else bad('renderSongTab задубльована назад в extras-3.js');
  const songSrc = fs2.existsSync(songPath) ? fs2.readFileSync(songPath, 'utf8') : '';
  if (/^function renderSongTab\(/m.test(songSrc)) ok('renderSongTab присутня у song.js');
  else bad('renderSongTab відсутня у song.js');
  // Спільна логіка (songStep/orderAdd, обидві в extras-2.js) МАЛА
  // лишитись на місці — song.js це НЕ повний перенос фічі, лише render.
  if (/^function songStep\(/m.test(ex2) && /^function orderAdd\(/m.test(ex2))
    ok('спільна логіка (songStep/orderAdd в extras-2.js) навмисно лишилась на місці — song-display.js/гарячі клавіші не зламаються');
  else bad('songStep/orderAdd зникли з extras-2.js — регресія, пісні/гарячі клавіші впадуть');
  const ix = SRC.index;
  const iSong = ix.indexOf('<script src="tabs/song/song.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iSong >= 0 && iExtras4 >= 0 && iSong < iExtras4)
    ok('<script> для song.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 22-23): Router/Live — ЛИШЕ render-функції винесено (спільна логіка лишилась на місці)');
(function () {
  const fs2 = require('fs');
  const routerPath = path.join(ROOT, 'src/tabs/router/router.js');
  const livePath = path.join(ROOT, 'src/tabs/live/live.js');
  if (fs2.existsSync(routerPath)) ok('src/tabs/router/router.js існує (крок 22)');
  else bad('ЗНИК tabs/router/router.js — крок 22 розбивки коду втрачено');
  if (fs2.existsSync(livePath)) ok('src/tabs/live/live.js існує (крок 23)');
  else bad('ЗНИК tabs/live/live.js — крок 23 розбивки коду втрачено');
  const ex4 = read('src/extras-4.js'), ex2 = read('src/extras-2.js');
  if (!/^function renderRouterTab\(/m.test(ex4)) ok('renderRouterTab не задубльована назад в extras-4.js');
  else bad('renderRouterTab задубльована назад в extras-4.js');
  if (!/^function renderLiveTab\(/m.test(ex2)) ok('renderLiveTab не задубльована назад в extras-2.js');
  else bad('renderLiveTab задубльована назад в extras-2.js');
  const routerSrc = fs2.existsSync(routerPath) ? fs2.readFileSync(routerPath, 'utf8') : '';
  const liveSrc = fs2.existsSync(livePath) ? fs2.readFileSync(livePath, 'utf8') : '';
  if (/^function renderRouterTab\(/m.test(routerSrc)) ok('renderRouterTab присутня у router.js');
  else bad('renderRouterTab відсутня у router.js');
  if (/^function renderLiveTab\(/m.test(liveSrc)) ok('renderLiveTab присутня у live.js');
  else bad('renderLiveTab відсутня у live.js');
  // Спільна логіка (pv2ClearOutput, goLive, undoLast тощо) МАЛА лишитись
  // на місці — router.js/live.js це НЕ повний перенос фічі, лише render.
  if (/^function pv2ClearOutput\(/m.test(ex2) && /^function goLive\(/m.test(ex2) && /^function clearLive\(/m.test(ex2) && /^function undoLast\(/m.test(ex2))
    ok('спільна логіка (pv2ClearOutput/goLive/clearLive/undoLast, усі в extras-2.js) навмисно лишилась на місці');
  else bad('спільна логіка Router/Live зникла зі свого файлу — регресія, багато інших вкладок впадуть');
  const ix = SRC.index;
  const iRouter = ix.indexOf('<script src="tabs/router/router.js">');
  const iLive = ix.indexOf('<script src="tabs/live/live.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iRouter >= 0 && iLive >= 0 && iExtras4 >= 0 && iRouter < iExtras4 && iLive < iExtras4)
    ok('<script> для router.js і live.js стоять ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 21): вкладка Налаштування винесена в src/tabs/settings/');
(function () {
  const fs2 = require('fs');
  const setPath = path.join(ROOT, 'src/tabs/settings/settings.js');
  if (fs2.existsSync(setPath)) ok('src/tabs/settings/settings.js існує (крок 21 модуляризації)');
  else bad('ЗНИК tabs/settings/settings.js — крок 21 розбивки коду втрачено');
  const SET1_FNS = ['setShowSongTitle', 'setShowTransName', 'pickCloudSyncFolder', 'syncLibraryToCloud', 'syncLibraryFromCloud', 'setAutoCloudSync'];
  const SET2_FNS = ['manualCheckUpdates', 'runPreflightCheck'];
  const SET4_FNS = ['renderSettingsTab', 'applyProfile', 'deleteProfile', 'backupAll', 'restoreAll', 'saveProfile', 'setUi', 'setAutoLaunch', 'uiBeep', 'setTrainingMode', 'clearChangeLog'];
  const ex1 = read('src/extras-1.js'), ex2 = read('src/extras-2.js'), ex4 = read('src/extras-4.js');
  const dup1 = SET1_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex1));
  const dup2 = SET2_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex2));
  const dup4 = SET4_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex4));
  if (!dup1.length && !dup2.length && !dup4.length) ok('жодна з 19 винесених функцій (Налаштування) не задубльована назад в extras-1/2/4.js');
  else bad('Задубльовано назад: ' + dup1.concat(dup2, dup4).join(', '));
  const setSrc = fs2.existsSync(setPath) ? fs2.readFileSync(setPath, 'utf8') : '';
  const missSet = SET1_FNS.concat(SET2_FNS, SET4_FNS).filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(setSrc));
  if (!missSet.length) ok('усі 19 функцій (Налаштування, з трьох файлів-джерел) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missSet.join(', '));
  const ix = SRC.index;
  const iSet = ix.indexOf('<script src="tabs/settings/settings.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iSet >= 0 && iExtras4 >= 0 && iSet < iExtras4)
    ok('<script> для settings.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — dispatch-таблиця renderTabInto впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 19): вкладка План служби винесена в src/tabs/service_planner/');
(function () {
  const fs2 = require('fs');
  const svcPath = path.join(ROOT, 'src/tabs/service_planner/service_planner.js');
  if (fs2.existsSync(svcPath)) ok('src/tabs/service_planner/service_planner.js існує (крок 19 модуляризації)');
  else bad('ЗНИК tabs/service_planner/service_planner.js — крок 19 розбивки коду втрачено');
  const SVC_FNS = ['renderServiceTab', 'svcNewFromTemplate', 'svcLoad', 'svcDuplicate', 'svcDelete',
    'svcSetColor', 'svcRelink', 'svcSetDuration', 'svcGoTo', 'svcMove', 'svcRemove', 'svcRefreshSongPick',
    'svcAddSong', 'svcAddBible', 'svcAddSimple', 'svcSaveAs', 'svcSaveAsTemplate', 'svcExport', 'svcImport',
    'svcClear', 'svcPrev', 'svcNext', 'svcPrint', 'svcGenerateReport', 'svcResetTiming'];
  const ex3 = read('src/extras-3.js');
  const dup = SVC_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex3));
  if (!dup.length) ok('жодна з 25 винесених функцій (План служби) не задубльована назад в extras-3.js');
  else bad('Задубльовано назад в extras-3.js: ' + dup.join(', '));
  const svcSrc = fs2.existsSync(svcPath) ? fs2.readFileSync(svcPath, 'utf8') : '';
  const missSvc = SVC_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(svcSrc));
  if (!missSvc.length) ok('усі 25 функцій (План служби) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missSvc.join(', '));
  const ix = SRC.index;
  const iSvc = ix.indexOf('<script src="tabs/service_planner/service_planner.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iSvc >= 0 && iExtras4 >= 0 && iSvc < iExtras4)
    ok('<script> для service_planner.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 20): вкладка Шари винесена в src/tabs/layers/');
(function () {
  const fs2 = require('fs');
  const layPath = path.join(ROOT, 'src/tabs/layers/layers.js');
  if (fs2.existsSync(layPath)) ok('src/tabs/layers/layers.js існує (крок 20 модуляризації)');
  else bad('ЗНИК tabs/layers/layers.js — крок 20 розбивки коду втрачено');
  const LAY_FNS = ['renderLayersTab', 'setAlertCfg', 'loadBgVideo', 'clearBgVideo', 'loadBgQueue',
    'removeBgQueueItem', 'setBgQueueInterval', 'bgQueueStart', 'bgQueueStop', 'loadLogo', 'selectLogoOutput',
    'setLogoPosition', 'setLogoSize', 'selectWatermarkOutput', 'setWatermark', 'setWatermarkPosition',
    'toggleWatermark', 'setAlertTargetOutput', 'hideAlert', 'loadBgAudio', 'playBgAudio', 'stopBgAudio', 'setBgVolume'];
  const ex3 = read('src/extras-3.js');
  const dup = LAY_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex3));
  if (!dup.length) ok('жодна з 23 винесених функцій (Шари) не задубльована назад в extras-3.js');
  else bad('Задубльовано назад в extras-3.js: ' + dup.join(', '));
  const laySrc = fs2.existsSync(layPath) ? fs2.readFileSync(layPath, 'utf8') : '';
  const missLay = LAY_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(laySrc));
  if (!missLay.length) ok('усі 23 функції (Шари) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missLay.join(', '));
  // toggleFreeze/showLogo/sendAlert — глибоко спільні (Emergency-панель),
  // МАЛИ лишитись на місці, не переноситись і не задублюватись.
  const ex3check = read('src/extras-3.js');
  if (/^function toggleFreeze\(/m.test(ex3check) && /^function showLogo\(/m.test(ex3check) && /^function sendAlert\(/m.test(ex3check))
    ok('toggleFreeze/showLogo/sendAlert навмисно лишились у extras-3.js (глибоко спільні з Аварійною панеллю)');
  else bad('Одна з toggleFreeze/showLogo/sendAlert зникла з extras-3.js — регресія');
  const ix = SRC.index;
  const iLay = ix.indexOf('<script src="tabs/layers/layers.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iLay >= 0 && iExtras4 >= 0 && iLay < iExtras4)
    ok('<script> для layers.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 17): вкладка Станції винесена в src/tabs/stations/');
(function () {
  const fs2 = require('fs');
  const stPath = path.join(ROOT, 'src/tabs/stations/stations.js');
  if (fs2.existsSync(stPath)) ok('src/tabs/stations/stations.js існує (крок 17 модуляризації)');
  else bad('ЗНИК tabs/stations/stations.js — крок 17 розбивки коду втрачено');
  const ST3_FNS = ['saveStationCfg', 'loadStationCfg', 'startHost', 'stopHost', 'connectStation', 'disconnectStation', 'renderStationClients'];
  const ST4_FNS = ['renderStationsTab', 'setStationMode', 'stationsStartPult', 'stationsStopPult'];
  const ex3 = read('src/extras-3.js'), ex4 = read('src/extras-4.js');
  const dup3 = ST3_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex3));
  const dup4 = ST4_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex4));
  if (!dup3.length && !dup4.length) ok('жодна з 11 винесених функцій (Станції) не задубльована назад в extras-3.js/extras-4.js');
  else bad('Задубльовано назад: ' + dup3.concat(dup4).join(', '));
  const stSrc = fs2.existsSync(stPath) ? fs2.readFileSync(stPath, 'utf8') : '';
  const missSt = ST3_FNS.concat(ST4_FNS).filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(stSrc));
  if (!missSt.length) ok('усі 11 функцій (Станції, з двох файлів-джерел) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missSt.join(', '));
  // isClientStation/stationSend/applyStationCommand — глибоко спільні,
  // МАЛИ лишитись на місці, не переноситись і не задублюватись.
  if (/^function isClientStation\(/m.test(ex3) && /^function stationSend\(/m.test(ex3) && /^function applyStationCommand\(/m.test(ex3))
    ok('isClientStation/stationSend/applyStationCommand навмисно лишились на місці (глибоко спільні з goLive-конвеєром)');
  else bad('Одна з isClientStation/stationSend/applyStationCommand зникла зі свого файлу — регресія');
  const ix = SRC.index;
  const iSt = ix.indexOf('<script src="tabs/stations/stations.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iSt >= 0 && iExtras4 >= 0 && iSt < iExtras4)
    ok('<script> для stations.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 18): вкладка QR-екран винесена в src/tabs/qrscreen/');
(function () {
  const fs2 = require('fs');
  const qrPath = path.join(ROOT, 'src/tabs/qrscreen/qrscreen.js');
  if (fs2.existsSync(qrPath)) ok('src/tabs/qrscreen/qrscreen.js існує (крок 18 модуляризації)');
  else bad('ЗНИК tabs/qrscreen/qrscreen.js — крок 18 розбивки коду втрачено');
  const QR_FNS = ['qrState', 'saveQrScreen', 'setQr', 'setQrSize', 'setQrItem', 'loadQrPhoto',
    'loadQrBanner', 'composeQrScreen', 'updateQrPreview', 'renderQrOutputRow', 'sendQrScreenTo',
    'sendQrScreen', 'clearQrScreenFrom', 'qrScreenLogo', 'qrScreenClearLogo', 'qrScreenLogoSize',
    'qrList', 'qrScreenSave', 'qrScreenLoad', 'qrScreenDelete', 'renderQrScreenTab'];
  const ex3 = read('src/extras-3.js');
  const dup = QR_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex3));
  if (!dup.length) ok('жодна з 20 винесених функцій (QR-екран) не задубльована назад в extras-3.js');
  else bad('Задубльовано назад в extras-3.js: ' + dup.join(', '));
  const qrSrc = fs2.existsSync(qrPath) ? fs2.readFileSync(qrPath, 'utf8') : '';
  const missQr = QR_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(qrSrc));
  if (!missQr.length) ok('усі 20 функцій (QR-екран) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missQr.join(', '));
  if (/var qrLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(qrSrc))
    ok('qrLiveMap переїхав разом із функціями, що його використовують');
  else bad('qrLiveMap загубився при переносі — sendQrScreenTo/clearQrScreenFrom впадуть');
  const ix = SRC.index;
  const iQr = ix.indexOf('<script src="tabs/qrscreen/qrscreen.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iQr >= 0 && iExtras4 >= 0 && iQr < iExtras4)
    ok('<script> для qrscreen.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 15): вкладка Автоматизація винесена в src/tabs/automation/');
(function () {
  const fs2 = require('fs');
  const autoPath = path.join(ROOT, 'src/tabs/automation/automation.js');
  if (fs2.existsSync(autoPath)) ok('src/tabs/automation/automation.js існує (крок 15 модуляризації)');
  else bad('ЗНИК tabs/automation/automation.js — крок 15 розбивки коду втрачено');
  const AUTO_FNS = ['renderAutomationTab', 'setSchedule', 'removeSchedule', 'restoreSong', 'addSchedule', 'setAutoBackup', 'setLang', 'emptyTrash'];
  const ex4 = read('src/extras-4.js');
  const dup = AUTO_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex4));
  if (!dup.length) ok('жодна з 8 винесених функцій (Автоматизація) не задубльована назад в extras-4.js');
  else bad('Задубльовано назад в extras-4.js: ' + dup.join(', '));
  const autoSrc = fs2.existsSync(autoPath) ? fs2.readFileSync(autoPath, 'utf8') : '';
  const missAuto = AUTO_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(autoSrc));
  if (!missAuto.length) ok('усі 8 функцій (Автоматизація) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missAuto.join(', '));
  const ix = SRC.index;
  const iAuto = ix.indexOf('<script src="tabs/automation/automation.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iAuto >= 0 && iExtras4 >= 0 && iAuto < iExtras4)
    ok('<script> для automation.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 16): вкладка Додатково (2/3 мова + OBS) винесена в src/tabs/extras_lang_obs/');
(function () {
  const fs2 = require('fs');
  const exPath = path.join(ROOT, 'src/tabs/extras_lang_obs/extras_lang_obs.js');
  if (fs2.existsSync(exPath)) ok('src/tabs/extras_lang_obs/extras_lang_obs.js існує (крок 16 модуляризації)');
  else bad('ЗНИК tabs/extras_lang_obs/extras_lang_obs.js — крок 16 розбивки коду втрачено');
  const EX2_FNS = ['setSecondLang', 'setThirdLang', 'setSecondLangMode', 'setTranspose', 'setAutoTimer'];
  const EX3_FNS = ['obsConnect', 'obsDisconnect', 'obsSceneIdx', 'obsAct', 'renderExtrasTab'];
  const ex2 = read('src/extras-2.js'), ex3 = read('src/extras-3.js');
  const dup2 = EX2_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex2));
  const dup3 = EX3_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex3));
  if (!dup2.length && !dup3.length) ok('жодна з 10 винесених функцій (Додатково) не задубльована назад в extras-2.js/extras-3.js');
  else bad('Задубльовано назад: ' + dup2.concat(dup3).join(', '));
  const exSrc = fs2.existsSync(exPath) ? fs2.readFileSync(exPath, 'utf8') : '';
  const missEx = EX2_FNS.concat(EX3_FNS).filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(exSrc));
  if (!missEx.length) ok('усі 10 функцій (Додатково, з двох файлів-джерел) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missEx.join(', '));
  const ix = SRC.index;
  const iEx = ix.indexOf('<script src="tabs/extras_lang_obs/extras_lang_obs.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iEx >= 0 && iExtras4 >= 0 && iEx < iExtras4)
    ok('<script> для extras_lang_obs.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 13): вкладка Живі субтитри винесена в src/tabs/captions/');
(function () {
  const fs2 = require('fs');
  const capPath = path.join(ROOT, 'src/tabs/captions/captions.js');
  if (fs2.existsSync(capPath)) ok('src/tabs/captions/captions.js існує (крок 13 модуляризації)');
  else bad('ЗНИК tabs/captions/captions.js — крок 13 розбивки коду втрачено');
  const CAP1_FNS = ['initCaptions', 'startCaptions', 'stopCaptions', 'clearCaptions', 'setCaptionLang',
    'toggleVerseDetect', 'acceptVerseSuggestion', 'dismissVerseSuggestion', 'audioMeterRefreshDevices',
    'audioMeterStart', 'audioMeterStop', 'setCaptionOutput'];
  const ex1 = read('src/extras-1.js'), ex3 = read('src/extras-3.js');
  const dup1 = CAP1_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex1));
  const dupRender = /^function renderCaptionsTab\(/m.test(ex3);
  if (!dup1.length && !dupRender) ok('жодна з 13 винесених частин (Живі субтитри) не задубльована назад в extras-1.js/extras-3.js');
  else bad('Задубльовано назад: ' + dup1.concat(dupRender ? ['renderCaptionsTab'] : []).join(', '));
  const capSrc = fs2.existsSync(capPath) ? fs2.readFileSync(capPath, 'utf8') : '';
  const missCap = CAP1_FNS.concat(['renderCaptionsTab']).filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(capSrc));
  if (!missCap.length) ok('усі 12 функцій + renderCaptionsTab справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missCap.join(', '));
  if (/let _speechRecognition = null;/.test(capSrc)) ok('_speechRecognition переїхав разом із функціями, що його використовують');
  else bad('_speechRecognition загубився при переносі');
  const ix = SRC.index;
  const iCap = ix.indexOf('<script src="tabs/captions/captions.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iCap >= 0 && iExtras4 >= 0 && iCap < iExtras4)
    ok('<script> для captions.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 14): вкладка Керування винесена в src/tabs/control/');
(function () {
  const fs2 = require('fs');
  const ctrlPath = path.join(ROOT, 'src/tabs/control/control.js');
  if (fs2.existsSync(ctrlPath)) ok('src/tabs/control/control.js існує (крок 14 модуляризації)');
  else bad('ЗНИК tabs/control/control.js — крок 14 розбивки коду втрачено');
  const CTRL_FNS = ['renderControlTab', 'showBookmark', 'removeBookmark', 'toggleBlackout', 'addBookmark',
    'setMasterVolume', 'duckAll', 'sermonStop', 'sermonStart', 'lockPanel'];
  const ex4 = read('src/extras-4.js');
  const dup = CTRL_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex4));
  if (!dup.length) ok('жодна з 10 винесених функцій (Керування) не задубльована назад в extras-4.js');
  else bad('Задубльовано назад в extras-4.js: ' + dup.join(', '));
  const ctrlSrc = fs2.existsSync(ctrlPath) ? fs2.readFileSync(ctrlPath, 'utf8') : '';
  const missCtrl = CTRL_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(ctrlSrc));
  if (!missCtrl.length) ok('усі 10 функцій (Керування) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missCtrl.join(', '));
  const ix = SRC.index;
  const iCtrl = ix.indexOf('<script src="tabs/control/control.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iCtrl >= 0 && iExtras4 >= 0 && iCtrl < iExtras4)
    ok('<script> для control.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — TABS-масив у pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 11): вкладка Трансляція винесена в src/tabs/stream/');
(function () {
  const fs2 = require('fs');
  const stPath = path.join(ROOT, 'src/tabs/stream/stream.js');
  if (fs2.existsSync(stPath)) ok('src/tabs/stream/stream.js існує (крок 11 модуляризації)');
  else bad('ЗНИК tabs/stream/stream.js — крок 11 розбивки коду втрачено');
  const ST_FNS = ['renderStreamTab', 'setLower', 'lowerShow', 'lowerHide'];
  const ex3 = read('src/extras-3.js');
  const dup = ST_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex3));
  if (!dup.length) ok('жодна з 4 винесених функцій (Трансляція) не задубльована назад в extras-3.js');
  else bad('Задубльовано назад в extras-3.js: ' + dup.join(', '));
  const stSrc = fs2.existsSync(stPath) ? fs2.readFileSync(stPath, 'utf8') : '';
  const missSt = ST_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(stSrc));
  if (!missSt.length) ok('усі 4 функції (Трансляція) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missSt.join(', '));
  // setLowerChroma — СПІЛЬНА функція (не ексклюзивна для Stream), мала
  // НАВМИСНО лишитись в extras-1.js, а не переїхати сюди чи задублюватись.
  const ex1 = read('src/extras-1.js');
  if (/^function setLowerChroma\(/m.test(ex1) && !/^function setLowerChroma\(/m.test(stSrc))
    ok('setLowerChroma навмисно лишилась у extras-1.js (спільна з іншою карткою, не переносилась)');
  else bad('setLowerChroma або зникла з extras-1.js, або задублювалась у stream.js');
  const ix = SRC.index;
  const iSt = ix.indexOf('<script src="tabs/stream/stream.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iSt >= 0 && iExtras4 >= 0 && iSt < iExtras4)
    ok('<script> для stream.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний');
})();

head('Модуляризація (крок 12): вкладка Мультив\'ю винесена в src/tabs/multiview/');
(function () {
  const fs2 = require('fs');
  const mvPath = path.join(ROOT, 'src/tabs/multiview/multiview.js');
  if (fs2.existsSync(mvPath)) ok('src/tabs/multiview/multiview.js існує (крок 12 модуляризації)');
  else bad('ЗНИК tabs/multiview/multiview.js — крок 12 розбивки коду втрачено');
  const MV_FNS = ['renderMultiviewTab', 'updateMultiviewFrame', 'updateMultiviewFrames'];
  const ex4 = read('src/extras-4.js');
  const dup = MV_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex4));
  if (!dup.length) ok('жодна з 3 винесених функцій (Мультив\'ю) не задубльована назад в extras-4.js');
  else bad('Задубльовано назад в extras-4.js: ' + dup.join(', '));
  const mvSrc = fs2.existsSync(mvPath) ? fs2.readFileSync(mvPath, 'utf8') : '';
  const missMv = MV_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(mvSrc));
  if (!missMv.length) ok('усі 3 функції (Мультив\'ю) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missMv.join(', '));
  if (/let _multiviewUpdateTimer = null;/.test(mvSrc)) ok('_multiviewUpdateTimer переїхав разом із функціями, що його використовують');
  else bad('_multiviewUpdateTimer загубився при переносі');
  const ix = SRC.index;
  const iMv = ix.indexOf('<script src="tabs/multiview/multiview.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iMv >= 0 && iExtras4 >= 0 && iMv < iExtras4)
    ok('<script> для multiview.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — TABS-масив у pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 10): вкладка Монітори винесена в src/tabs/monitors/');
(function () {
  const fs2 = require('fs');
  const mnPath = path.join(ROOT, 'src/tabs/monitors/monitors.js');
  if (fs2.existsSync(mnPath)) ok('src/tabs/monitors/monitors.js існує (крок 10 модуляризації)');
  else bad('ЗНИК tabs/monitors/monitors.js — крок 10 розбивки коду втрачено');
  const MN_FNS = ['renderMonitorsTab', 'bindOutputToDisplay', 'toggleTestPattern', 'setOutputFailover', 'identifyDisplays', 'refreshMonitors'];
  const ex3 = read('src/extras-3.js');
  const dup = MN_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex3));
  if (!dup.length) ok('жодна з 6 винесених функцій (Монітори) не задубльована назад в extras-3.js');
  else bad('Задубльовано назад в extras-3.js: ' + dup.join(', '));
  const mnSrc = fs2.existsSync(mnPath) ? fs2.readFileSync(mnPath, 'utf8') : '';
  const missMn = MN_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(mnSrc));
  if (!missMn.length) ok('усі 6 функцій (Монітори) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missMn.join(', '));
  const ix = SRC.index;
  const iMn = ix.indexOf('<script src="tabs/monitors/monitors.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iMn >= 0 && iExtras4 >= 0 && iMn < iExtras4)
    ok('<script> для monitors.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 9): Управління текстом винесено в src/tabs/text_control/');
(function () {
  const fs2 = require('fs');
  const tcPath = path.join(ROOT, 'src/tabs/text_control/text_control.js');
  if (fs2.existsSync(tcPath)) ok('src/tabs/text_control/text_control.js існує (крок 9 модуляризації)');
  else bad('ЗНИК tabs/text_control/text_control.js — крок 9 розбивки коду втрачено');
  const TC1_FNS = ['renderTextControlTab', 'applyTextSettingsToOutput', 'changeTextSize', 'setTextAlign',
    'setTextOutput', 'setTextPosition', 'toggleTextStyle', 'updateTextBgColor', 'updateTextColor',
    'updateTextSize', 'updateTextPreview'];
  const TC2_FNS = ['setTextFont', '_applyToTextOutputs', 'setTextStroke', 'setTextStrokeColor', 'setTextScrim',
    'setTextSafeArea', 'setTextLetterSpacing', 'setTextLineHeight', 'setTextFadeMs', 'setTextBgType',
    'loadTextBgVideo', 'clearTextBgVideo', 'loadTextBgImage', 'clearTextBgImage'];
  const ex1 = read('src/extras-1.js'), ex2 = read('src/extras-2.js');
  const dup1 = TC1_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex1));
  const dup2 = TC2_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex2));
  if (!dup1.length && !dup2.length) ok('жодна з 25 винесених функцій (Управління текстом) не задубльована назад в extras-1.js/extras-2.js');
  else bad('Задубльовано назад: ' + dup1.concat(dup2).join(', '));
  const tcSrc = fs2.existsSync(tcPath) ? fs2.readFileSync(tcPath, 'utf8') : '';
  const missTc = TC1_FNS.concat(TC2_FNS).filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(tcSrc));
  if (!missTc.length) ok('усі 25 функцій (Управління текстом, з двох файлів-джерел) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missTc.join(', '));
  const ix = SRC.index;
  const iTc = ix.indexOf('<script src="tabs/text_control/text_control.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iTc >= 0 && iExtras4 >= 0 && iTc < iExtras4)
    ok('<script> для text_control.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 8): MIDI-підсистема винесена в src/tabs/midi/midi.js');
(function () {
  const fs2 = require('fs');
  const midiPath = path.join(ROOT, 'src/tabs/midi/midi.js');
  if (fs2.existsSync(midiPath)) ok('src/tabs/midi/midi.js існує (крок 8 модуляризації)');
  else bad('ЗНИК tabs/midi/midi.js — крок 8 розбивки коду втрачено');
  const MIDI_FNS = ['loadMidiMap', 'saveMidiMap', 'initMidi', 'onMidiMessage', 'midiStartLearn', 'midiClear', 'renderMidiCard'];
  const ex1 = read('src/extras-1.js');
  const dup = MIDI_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex1));
  if (!dup.length) ok('жодна з 7 винесених функцій (MIDI) не задубльована назад в extras-1.js');
  else bad('Задубльовано назад в extras-1.js: ' + dup.join(', '));
  const midiSrc = fs2.existsSync(midiPath) ? fs2.readFileSync(midiPath, 'utf8') : '';
  const missMidi = MIDI_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(midiSrc));
  if (!missMidi.length) ok('усі 7 функцій (MIDI) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missMidi.join(', '));
  if (/const MIDI_ACTIONS = \[/.test(midiSrc)) ok('MIDI_ACTIONS переїхав разом із функціями, що його використовують');
  else bad('MIDI_ACTIONS загубився при переносі — renderMidiCard/onMidiMessage впадуть');
  // Хрест-крос: MIDI (renderer-only) і OSC (main-process) — різні речі,
  // не мали злитись в один файл попри те, що обидва тригери «зовнішнім
  // контролером».
  if (!/dgram|ipcMain/.test(midiSrc)) ok('midi.js не містить OSC/main-process коду (dgram/ipcMain) — чисте розділення MIDI vs OSC');
  else bad('midi.js схоже містить OSC-код — межа між MIDI і OSC розмита');
  const ix = SRC.index;
  const iMidi = ix.indexOf('<script src="tabs/midi/midi.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iMidi >= 0 && iExtras4 >= 0 && iMidi < iExtras4)
    ok('<script> для midi.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Модуляризація (крок 7): OSC-підсистема винесена в src/main/osc.js (перший розкол main.js)');
(function () {
  const fs2 = require('fs');
  const oscPath = path.join(ROOT, 'src/main/osc.js');
  if (fs2.existsSync(oscPath)) ok('src/main/osc.js існує (крок 7 — перший модуль головного процесу після app-menu.js/office-extract.js)');
  else bad('ЗНИК src/main/osc.js — крок 7 розбивки коду втрачено');
  const m = SRC.main;
  const OSC_IDENT = ['oscServer', 'oscPort', 'oscMap', 'oscLearn', 'padOscString', 'parseOscAddress', 'startOscServer', 'stopOscServer'];
  const dup = OSC_IDENT.filter(id => new RegExp('\\b(let|const|function) ' + id + '\\b').test(m));
  if (!dup.length) ok('жодна зі старих OSC-змінних/функцій не лишилась в main.js (усі переїхали)');
  else bad('OSC-код і досі частково в main.js: ' + dup.join(', '));
  if (/require\('\.\/src\/main\/osc'\)/.test(m) && /oscModule\.register\(ipcMain, \(\) => mainWin\)/.test(m))
    ok('main.js підключає osc.js через register(ipcMain, () => mainWin) — гетер, не значення (mainWin ще не існує на момент реєстрації)');
  else bad('main.js не підключає osc.js правильно — OSC IPC-хендлери не зареєструються');
  // 5 ipcMain.handle('...osc...') мають БУТИ ВСЕРЕДИНІ osc.js, а не
  // дублюватись/лишатись у main.js
  const oscHandlesInMain = (m.match(/ipcMain\.handle\('(start-osc-server|stop-osc-server|osc-learn|osc-clear|osc-get-map)'/g) || []);
  if (!oscHandlesInMain.length) ok('усі 5 ipcMain.handle для OSC прибрано з main.js (тепер лише в osc.js)');
  else bad('Задубльовані/незняті OSC-хендлери в main.js: ' + oscHandlesInMain.join(', '));
  const oscSrc = fs2.existsSync(oscPath) ? fs2.readFileSync(oscPath, 'utf8') : '';
  const oscHandlesInModule = (oscSrc.match(/ipcMain\.handle\('(start-osc-server|stop-osc-server|osc-learn|osc-clear|osc-get-map)'/g) || []);
  if (oscHandlesInModule.length === 5) ok('усі 5 ipcMain.handle для OSC присутні всередині osc.js');
  else bad('У osc.js бракує IPC-хендлерів OSC (знайдено ' + oscHandlesInModule.length + ' з 5)');
  // Cleanup-виклик при виході більше НЕ читає голу typeof stopOscServer —
  // це задублена локальна ідентифікація зникла разом з переносом.
  if (/oscModule\.stopOscServer\(\)/.test(m) && !/typeof stopOscServer === 'function'\) stopOscServer\(\)/.test(m))
    ok('cleanup при виході викликає oscModule.stopOscServer() (не биту стару typeof-перевірку)');
  else bad('cleanup при виході досі посилається на видалену локальну stopOscServer — застосунок впаде при закритті вікна');
})();

head('Модуляризація (крок 6): вкладка Медіа винесена в src/tabs/media/');
(function () {
  const fs2 = require('fs');
  const mdPath = path.join(ROOT, 'src/tabs/media/media.js');
  if (fs2.existsSync(mdPath)) ok('src/tabs/media/media.js існує (крок 6 модуляризації)');
  else bad('ЗНИК tabs/media/media.js — крок 6 розбивки коду втрачено');
  const MD_FNS = ['renderMediaTab', 'loadMediaFiles', 'renderMediaList', 'playMedia', 'removeMedia',
    'setMediaCategory', 'renderMediaOutBtns', 'clearMediaFrom', 'sendMediaToProjector',
    'stopMedia', 'toggleMediaPlay', 'loadYouTube'];
  const ex1 = read('src/extras-1.js');
  const dup = MD_FNS.filter(fn => new RegExp('^function ' + fn + '\\(', 'm').test(ex1));
  if (!dup.length) ok('жодна з 12 винесених функцій (Медіа) не задубльована назад в extras-1.js');
  else bad('Задубльовано назад в extras-1.js: ' + dup.join(', '));
  const mdSrc = fs2.existsSync(mdPath) ? fs2.readFileSync(mdPath, 'utf8') : '';
  const missMd = MD_FNS.filter(fn => !new RegExp('^function ' + fn + '\\(', 'm').test(mdSrc));
  if (!missMd.length) ok('усі 12 функцій (Медіа) справді присутні у новому файлі');
  else bad('Бракує у новому файлі: ' + missMd.join(', '));
  if (/var mediaLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(mdSrc))
    ok('mediaLiveMap переїхала разом із функціями, що її використовують');
  else bad('mediaLiveMap загубилась при переносі — clearMediaFrom/renderMediaOutBtns впадуть');
  const ix = SRC.index;
  const iMd = ix.indexOf('<script src="tabs/media/media.js">');
  const iExtras4 = ix.indexOf('<script src="extras-4.js">');
  if (iMd >= 0 && iExtras4 >= 0 && iMd < iExtras4)
    ok('<script> для media.js стоїть ДО extras-4.js (порядок завантаження коректний)');
  else bad('Порядок <script> неправильний — pv2Init() впаде на старті (ReferenceError)');
})();

head('Аудит: адресний вивід/прибирання «Все» — Таймер/Графіка/H2R Lower Third/Титри/Конфеті/Тікер/Медіа');
(function () {
  const ex = SRC.extras, tm = read('src/timer.js');
  // Таймер
  if (/var timerLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(tm) && /function clearTimerFrom\(n\)/.test(tm) && /pv2ClearOutput\(n\)/.test(tm))
    ok('Таймер: timerLiveMap + clearTimerFrom(n) через канонічний pv2ClearOutput');
  else bad('Таймер: зникло відстеження живих виходів або clearTimerFrom');
  // Графіка
  if (/var graphicsLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(ex) && /function clearGraphicsFrom\(n\)/.test(ex))
    ok('Графіка: graphicsLiveMap + clearGraphicsFrom(n) — 🔴-підсвітка й «прибрати»');
  else bad('Графіка: зникло відстеження живих виходів або clearGraphicsFrom');
  // H2R Lower Third
  if (/var h2rLowerLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(ex) && /function renderH2RLowerOutBtns\(\)/.test(ex) && /id="h2rLowerOutBtns"/.test(ex))
    ok('H2R Lower Third: h2rLowerLiveMap + renderH2RLowerOutBtns() — «На вихід» тепер теж 🔴-підсвічується');
  else bad('H2R Lower Third: зникло відстеження живих виходів або контейнер #h2rLowerOutBtns');
  // Титри подяки — раніше прибрати їх не можна було взагалі
  if (/var creditsLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(ex) && /function clearCredits\(n\)/.test(ex))
    ok('Титри подяки: creditsLiveMap + clearCredits(n) — раніше прибрати їх не можна було взагалі');
  else bad('Титри подяки: зникло відстеження живих виходів або clearCredits');
  // Конфеті — одноразовий ефект, підсвітка тимчасова (знімається сама через ~6.5с)
  if (/var confettiLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(ex) && /var confettiLiveTimers = \{\};/.test(ex) && /function clearConfetti\(n\)/.test(ex) && /setTimeout\(\(\) => \{ confettiLiveMap\[n\] = false;/.test(ex))
    ok('Конфеті: confettiLiveMap з автозняттям через ~6.5с (одноразовий ефект, не персистентний стан)');
  else bad('Конфеті: зникло тимчасове відстеження живих виходів');
  // Тікер — stopTicker(n) лишився як був (канонічний «прибрати» для цієї фічі), додано трекінг
  if (/var tickerLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(ex) && /function renderTickerOutBtns\(\)/.test(ex))
    ok('Тікер: tickerLiveMap + renderTickerOutBtns() — «Прибрати» тепер лише для активних виходів');
  else bad('Тікер: зникло відстеження живих виходів або renderTickerOutBtns');
  // Медіа-програвач
  if (/var mediaLiveMap = \{ 1: false, 2: false, 3: false, 4: false \};/.test(ex) && /function clearMediaFrom\(n\)/.test(ex))
    ok('Медіа-програвач: mediaLiveMap + clearMediaFrom(n) через канонічний pv2ClearOutput');
  else bad('Медіа-програвач: зникло відстеження живих виходів або clearMediaFrom');
  // h2r/media/qrscreen рендеряться ОДИН РАЗ при старті (окремий механізм,
  // не renderTabInto) — усі 7 нових рендер-функцій мусять бути в steps,
  // інакше кнопки лишаться порожніми до першої дії користувача.
  const stepsBody = (function () {
    const a = ex.indexOf('const steps = [');
    if (a < 0) return '';
    const open = ex.indexOf('[', a);
    let depth = 0;
    for (let i = open; i < ex.length; i++) {
      if (ex[i] === '[') depth++;
      else if (ex[i] === ']') { depth--; if (depth === 0) return ex.slice(open + 1, i); }
    }
    return '';
  })();
  const need = ['renderMediaOutBtns', 'renderGraphicsOutBtns', 'renderH2RLowerOutBtns', 'renderCreditsOutBtns', 'renderConfettiOutBtns', 'renderTickerOutBtns', 'renderQrOutputRow'];
  if (need.every(n => stepsBody.includes(n)))
    ok('steps: усі 7 нових рендер-функцій ініціалізуються при старті (h2r/media/qrscreen будуються лише раз)');
  else bad('steps: бракує однієї з нових рендер-функцій — кнопки на цій вкладці стартують порожніми');
})();

head('Словник перекладу (CZ/EN)');
(function() {
  // Формалізований пошук підрядкових колізій у UI_DICT (tools/check-translation-
  // collisions.js) — окремий крок, не рахунок регексом по SRC.*, бо сам
  // будує повний корпус коду й ключі словника. Додано 2026-08-29 після
  // рев'ю, що знайшло 8 таких багів вручну.
  try {
    const { main } = require('./check-translation-collisions.js');
    if (main() === 0) ok('словник перекладу: підрядкових колізій не знайдено (npm run check-i18n)');
    else bad('словник перекладу: є підозрілі колізії — прогони npm run check-i18n для деталей');
  } catch (e) {
    bad('словник перекладу: перевірка не запустилась → ' + e.message);
  }
})();


console.log('\n' + '─'.repeat(48));
if (failures === 0) {
  console.log(`\x1b[32m\x1b[1mУСЕ ДОБРЕ\x1b[0m — ${checks} перевірок пройдено. Можна збирати.`);
  process.exit(0);
} else {
  console.log(`\x1b[31m\x1b[1mЗНАЙДЕНО ПРОБЛЕМИ: ${failures}\x1b[0m із ${checks} перевірок. Полагодь перед збіркою.`);
  process.exit(1);
}

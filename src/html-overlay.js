// ============================================================
// HTML/GDD-ГРАФІКА
// Винесено з index.html для кращої організації коду.
//
// sendHTMLToProjector()/doSendHTML() — загальні утиліти, якими також
// користуються qr.js, announce.js, timer.js (надсилання довільного HTML
// на вихід) — фізично лежали серед HTML-графіки, тож лишені тут разом.
// ============================================================

var htmlOverlays = [];

// Завантажені HTML-графіки пам'ятаємо між запусками — інакше перед кожним
// служінням довелося б заново вибирати файли з теки overlays.
// ============================================================
// ВБУДОВАНІ ШАБЛОНИ ГРАФІКИ (GDD)
//
// Навіщо: раніше, щоб зробити нову графіку, треба було створити
// HTML-файл десь поза програмою й імпортувати. Це і є той «поріг
// гнучкості», через який доводилось звертатись до сторонніх програм.
// Тепер кілька готових заготовок лежать у самій програмі: обрав —
// заповнив поля — показав.
//
// Кожен шаблон — звичайний GDD-файл (JSON-схема полів + data-gdd у
// розмітці), тобто далі працює тим самим шляхом, що й будь-яка
// імпортована графіка: кнопка «Поля», пресети, вивід на будь-який
// вихід. Нічого спеціального для них у решті коду не потрібно.
//
// Завантажуються з диска через fetch (як BUILTIN_TRANSLATIONS у
// bible-translations.js), а не зашиті в JS — щоб не роздувати скрипти
// й щоб шаблон можна було підправити, не перезбираючи програму.
// ============================================================
var GDD_TEMPLATES = [
  { file: 'templates/gdd/lower-third.html',  name: 'Нижня третина (ім’я + роль)' },
  { file: 'templates/gdd/announcement.html', name: 'Оголошення (заголовок + текст)' },
  { file: 'templates/gdd/countdown.html',    name: 'Зворотний відлік до початку' },
  { file: 'templates/gdd/verse.html',        name: 'Вірш із Біблії' }
];

function renderGddTemplatePicker() {
  var el = document.getElementById('gddTemplateList');
  if (!el) return;
  el.innerHTML = GDD_TEMPLATES.map(function (t, i) {
    return '<button class="btn btn-ghost btn-sm" style="text-align:left" onclick="addGddTemplate(' + i + ')" ' +
           'title="Додати цей шаблон у список графіки">➕ ' + escHtml(t.name) + '</button>';
  }).join('');
}

// Додає шаблон у звичайний список графіки. Далі він нічим не
// відрізняється від імпортованого файлу.
function addGddTemplate(i) {
  var t = GDD_TEMPLATES[i];
  if (!t) return;
  fetch(t.file)
    .then(function (r) { return r.ok ? r.text() : null; })
    .then(function (html) {
      if (!html) { notify('⚠️ Не вдалось прочитати шаблон: ' + t.name); return; }
      // Якщо такий шаблон уже додавали — не плодимо дублі, а робимо
      // копію з номером: оператор може хотіти дві різні нижні третини.
      var base = t.name, nameToUse = base, n = 2;
      while (htmlOverlays.some(function (o) { return (o.displayName || o.name) === nameToUse; })) {
        nameToUse = base + ' ' + n; n++;
      }
      htmlOverlays.push({ name: nameToUse, displayName: nameToUse, content: html });
      saveHTMLOverlays();
      if (typeof loadGddParams === 'function') loadGddParams();
      renderHTMLOverlayList();
      notify('✅ Додано: ' + nameToUse + ' — натисни «⚙ Поля», щоб заповнити');
    })
    .catch(function () { notify('⚠️ Не вдалось прочитати шаблон: ' + t.name); });
}

function saveHTMLOverlays() {
  try {
    if (!safeSet('church_html_overlays', JSON.stringify(htmlOverlays))) return;
  } catch (e) {
    // Сховище переповнене — не критично, просто попереджаємо
    if (typeof notify === 'function') notify('⚠️ Графіки не збереглись між запусками (замало місця)');
  }
}
function loadHTMLOverlays() {
  try {
    var raw = bigStoreGet('church_html_overlays');
    if (!raw) return;
    var arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) {
      htmlOverlays = arr;
      if (typeof loadGddParams === 'function') loadGddParams();
      if (typeof loadGddPresets === 'function') loadGddPresets();
      if (typeof renderHTMLOverlayList === 'function') renderHTMLOverlayList();
    }
  } catch (e) {}
}
// Експорт усієї колекції HTML/GDD-графіки в один файл — щоб перенести
// шаблони на іншу машину чи поділитись з іншою церквою. Пресети/значення
// полів пакуємо за НАЗВОЮ файлу (не за індексом масиву) — той самий підхід,
// що вже надійно працює для saveGddParams/saveGddPresets.
function exportHtmlOverlays() {
  if (!htmlOverlays.length) { notify('⚠️ Немає завантажених файлів для експорту'); return; }
  const paramsByName = {};
  const presetsByName = {};
  htmlOverlays.forEach(function(o, i) {
    if (gddParams[i]) paramsByName[o.name] = gddParams[i];
    if (gddPresets[i] && gddPresets[i].length) presetsByName[o.name] = gddPresets[i];
  });
  const payload = {
    app: 'church-projector-html-graphics',
    version: 1,
    date: new Date().toISOString(),
    overlays: htmlOverlays,
    gddParams: paramsByName,
    gddPresets: presetsByName
  };
  downloadFile(JSON.stringify(payload, null, 2),
    'html-графіка-' + new Date().toISOString().slice(0, 10) + '.json',
    'application/json');
  notify('📤 Експортовано: ' + htmlOverlays.length + ' файлів графіки');
}
// Імпорт — файли з ТАКОЮ Ж НАЗВОЮ, що вже є, ОНОВЛЮЄМО (той самий принцип,
// що й при повторному завантаженні того самого файлу вручну); нові — додаємо.
function importHtmlOverlaysFile(input) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = function(e) {
    let payload;
    try { payload = JSON.parse(e.target.result); } catch (err) { notify('✗ Файл пошкоджено'); return; }
    if (!payload || !Array.isArray(payload.overlays)) { notify('✗ Це не файл колекції HTML-графіки'); return; }
    let added = 0, updated = 0;
    payload.overlays.forEach(function(imported) {
      if (!imported || !imported.name) return;
      const existing = htmlOverlays.find(function(o) { return o.name === imported.name; });
      if (existing) { Object.assign(existing, imported); updated++; }
      else { htmlOverlays.push(imported); added++; }
    });
    htmlOverlays.forEach(function(o, idx) {
      if (payload.gddParams && payload.gddParams[o.name]) gddParams[idx] = payload.gddParams[o.name];
      if (payload.gddPresets && payload.gddPresets[o.name]) gddPresets[idx] = payload.gddPresets[o.name];
    });
    saveHTMLOverlays();
    if (typeof saveGddParams === 'function') saveGddParams();
    if (typeof saveGddPresets === 'function') saveGddPresets();
    renderHTMLOverlayList();
    notify('✅ Додано нових: ' + added + ', оновлено: ' + updated);
    input.value = '';   // щоб можна було повторно обрати той самий файл
  };
  r.readAsText(f);
}

// Відновлюємо графіки при старті (коли сторінка вже готова)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadHTMLOverlays);
else loadHTMLOverlays();

function loadHTMLFiles(input) {
  var files = Array.from(input.files);
  if (!files.length) return;
  var loaded = 0, added = 0, updated = 0;
  files.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      // Файл із такою самою назвою вже є у списку — ОНОВЛЮЄМО його вміст,
      // а не мовчки ігноруємо (як було раніше). Інакше повторне завантаження
      // виправленого файлу нічого не міняло б — «в ефірі» й далі йшла б
      // стара версія, навіть якщо файл на диску вже полагоджено.
      var exists = htmlOverlays.find(function(o){ return o.name === file.name; });
      if (exists) {
        exists.content = e.target.result;
        updated++;
      } else {
        htmlOverlays.push({ name: file.name, content: e.target.result });
        added++;
      }
      loaded++;
      if (loaded === files.length) {
        saveHTMLOverlays();                                    // щоб не вибирати файли щоразу
        if (typeof loadGddParams === 'function') loadGddParams();  // повертаємо поля (зокрема фото)
        if (typeof loadGddPresets === 'function') loadGddPresets();
        renderHTMLOverlayList();
        var parts = [];
        if (added) parts.push('додано: ' + added);
        if (updated) parts.push('оновлено: ' + updated + ' — натисни «▶ Показати» ще раз, щоб застосувати в ефірі');
        notify('💻 ' + (parts.length ? parts.join(', ') : 'Нічого не змінено'));
      }
    };
    reader.readAsText(file);
  });
}

// Пакетування (rafDebounce — наявний ідіом проєкту, як updateLivePanels):
// ця функція викликалась із багатьох місць підряд, і кожен виклик повністю
// перебудовував список. Тепер підряд ідучі виклики склеюються в один
// перемальовок на кадр.
// Обгортка — саме function-декларація з ЛІНИВОЮ ініціалізацією, а не
// `const renderHTMLOverlayList = rafDebounce(...)`: const створив би temporal dead zone,
// і будь-який виклик до цього рядка впав би з «Cannot access before
// initialization» — рівно той баг, що вже двічі ловився в цьому проєкті
// (loadDisplayToggles). Function-декларація піднімається (hoisting), тож
// порядок завантаження файлів більше не має значення.
var _renderHTMLOverlayListDeb = null;
function renderHTMLOverlayList() {
  if (!_renderHTMLOverlayListDeb) _renderHTMLOverlayListDeb = rafDebounce(_renderHTMLOverlayListNow);
  return _renderHTMLOverlayListDeb.apply(null, arguments);
}
function _renderHTMLOverlayListNow() {
  var el = document.getElementById('htmlOverlayList');
  if (!htmlOverlays.length) { el.innerHTML = '<p class="text-muted">Завантажте HTML файли зліва</p>'; return; }

  // Оновлюємо список категорій у фільтрі (не чіпаючи сам пошук/поле вводу —
  // вони живуть ПОЗА цим контейнером, тож перебудова списку нижче їх не зачіпає).
  var catFilterEl = document.getElementById('htmlOverlayCatFilter');
  if (catFilterEl) {
    var cats = Array.from(new Set(htmlOverlays.map(function(o){ return o.category; }).filter(Boolean))).sort();
    var prevCat = catFilterEl.value;
    catFilterEl.innerHTML = '<option value="">Усі категорії</option>' +
      cats.map(function(c){ return '<option value="' + escHtml(c) + '"' + (c === prevCat ? ' selected' : '') + '>' + escHtml(c) + '</option>'; }).join('');
  }
  var searchEl = document.getElementById('htmlOverlaySearch');
  var q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  var catFilter = catFilterEl ? catFilterEl.value : '';
  var reordering = !q && !catFilter;   // кнопки ▲▼ лише на повному, нефільтрованому списку — інакше «сусід» на екрані й «сусід» у масиві не збігаються, плутанина

  // Спершу фільтруємо (за оригінальними індексами — на них посилаються всі
  // onclick у розмітці), тоді сортуємо ЛИШЕ ВІЗУАЛЬНО: закріплені («📌») —
  // нагору, стабільно (відносний порядок серед закріплених і серед
  // незакріплених зберігається). Сам масив htmlOverlays при цьому НЕ
  // міняється — це робота лише moveHTMLOverlay/togglePinHTMLOverlay нижче.
  var indices = [];
  htmlOverlays.forEach(function(overlay, i) {
    var displayName = overlay.displayName || overlay.name;
    if (catFilter && overlay.category !== catFilter) return;
    if (q && displayName.toLowerCase().indexOf(q) === -1 && !(overlay.category || '').toLowerCase().includes(q)) return;
    indices.push(i);
  });
  indices.sort(function(a, b) { return (htmlOverlays[b].pinned ? 1 : 0) - (htmlOverlays[a].pinned ? 1 : 0); });

  el.innerHTML = htmlOverlaySelected.size
    ? '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--panel2);border-radius:5px;margin-bottom:8px;flex-wrap:wrap">' +
      '<span style="font-size:12px">Обрано: <b>' + htmlOverlaySelected.size + '</b></span>' +
      '<button class="btn btn-primary btn-sm" onclick="bulkSetHtmlOverlayCategory()">🏷 Позначити категорією</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="clearHtmlOverlaySelection()">✕ Скасувати вибір</button>' +
      '</div>'
    : '';
  var shown = 0;
  indices.forEach(function(i) {
    var overlay = htmlOverlays[i];
    var displayName = overlay.displayName || overlay.name;
    shown++;
    var div = document.createElement('div');
    div.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--border);';
    var isGdd = (typeof gddDetect === 'function') && gddDetect(overlay.content);
    var hasBg = !!overlay.customBg;
    // На яких виходах САМЕ ЦЯ графіка зараз в ефірі — щоб було видно з
    // першого погляду, а не лише «десь щось показано».
    var liveOutputs = [1, 2, 3, 4].filter(function(n) { return htmlLiveMap[n] === i; });
    var liveLabel = liveOutputs.length
      ? '<span style="font-size:10px;color:var(--red);font-weight:700">🔴 В ЕФІРІ: ' + liveOutputs.map(function(n){ return escHtml(OUT_NAME[n] || ('Вихід ' + n)); }).join(', ') + '</span>'
      : '';
    var outBtns = [1, 2, 3, 4].map(function(n) {
      var isLiveHere = htmlLiveMap[n] === i;
      return '<button class="btn ' + (isLiveHere ? 'btn-success' : 'btn-ghost') + ' btn-sm" style="font-size:10px;padding:3px 6px" ' +
        'onclick="sendHTMLOverlayTo(' + i + ',' + n + ')" title="Показати на ' + escHtml(OUT_NAME[n] || ('Вихід ' + n)) + '">' +
        (isLiveHere ? '🔴 ' : '') + escHtml(OUT_NAME[n] || ('В.' + n)) + '</button>';
    }).join('');
    div.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<input type="checkbox" ' + (htmlOverlaySelected.has(i) ? 'checked' : '') + ' onchange="toggleHtmlOverlaySelect(' + i + ')" title="Обрати для масової дії">' +
      '<span style="font-size:20px">' + (isGdd ? '🎛' : '💻') + '</span>' +
      '<span style="flex:1;min-width:120px;font-size:13px"><b>'+escHtml(displayName)+'</b>' +
        (overlay.category ? ' <span class="badge" style="font-size:10px">' + escHtml(overlay.category) + '</span>' : '') +
        (isGdd ? '<br><span style="font-size:10px;color:var(--accent)">GDD-графіка — має поля для заповнення</span>' : '') +
        (liveLabel ? '<br>' + liveLabel : '') +
      '</span>' +
      (isGdd ? '<button class="btn btn-primary btn-sm" onclick="gddOpenPanel('+i+')">⚙ Поля</button>' : '') +
      '<button class="btn ' + (overlay.pinned ? 'btn-primary' : 'btn-ghost') + ' btn-sm" onclick="togglePinHTMLOverlay('+i+')" title="' + (overlay.pinned ? 'Відкріпити' : 'Закріпити нагорі') + '">📌</button>' +
      (reordering ? (function() {
        var group = indices.filter(function(idx) { return !!htmlOverlays[idx].pinned === !!overlay.pinned; });
        var pos = group.indexOf(i);
        var upDisabled = pos <= 0;
        var downDisabled = pos >= group.length - 1;
        return '<button class="btn btn-ghost btn-sm" onclick="moveHTMLOverlay('+i+',-1)"' + (upDisabled ? ' disabled style="opacity:.3"' : '') + ' title="Вгору">▲</button>' +
               '<button class="btn btn-ghost btn-sm" onclick="moveHTMLOverlay('+i+',1)"' + (downDisabled ? ' disabled style="opacity:.3"' : '') + ' title="Вниз">▼</button>';
      })() : '') +
      '<button class="btn btn-ghost btn-sm" onclick="previewHTMLOverlay('+i+')">👁</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="renameHTMLOverlay('+i+')" title="Перейменувати">✏️</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="setHtmlOverlayCategory('+i+')" title="Категорія">🏷</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="duplicateHTMLOverlay('+i+')" title="Дублювати">⧉</button>' +
      '<button class="btn btn-danger btn-sm" onclick="removeHTMLOverlay('+i+')">✕</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:4px;margin-top:6px;padding-left:28px;flex-wrap:wrap">' + outBtns +
      (liveOutputs.length ? liveOutputs.map(function(n) {
        return '<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 6px;color:var(--red)" onclick="clearHTMLOverlayOutput(' + n + ')" title="Вимкнути на ' + escHtml(OUT_NAME[n] || ('Вихід ' + n)) + '">✕ ' + escHtml(OUT_NAME[n] || ('В.' + n)) + '</button>';
      }).join('') : '') +
      '</div>' +
      // Автовимкнення через N секунд — показав графіку (напр. заставку/QR)
      // і вона сама зникає з екрана, не треба вручну натискати «✕» щоразу.
      '<div style="display:flex;align-items:center;gap:4px;margin-top:6px;padding-left:28px;flex-wrap:wrap">' +
      '<span style="font-size:11px;color:var(--text2)">⏱ Автовимкнення:</span>' +
      '<input type="number" min="0" step="1" value="' + (overlay.autoOffSec || '') + '" placeholder="—" ' +
      'style="width:44px;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:11px" ' +
      'onchange="setHtmlOverlayAutoOff(' + i + ', this.value)">' +
      '<span style="font-size:11px;color:var(--text2)">сек</span>' +
      '<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 6px" onclick="setHtmlOverlayAutoOff(' + i + ',15)">15с</button>' +
      '<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 6px" onclick="setHtmlOverlayAutoOff(' + i + ',20)">20с</button>' +
      '<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 6px" onclick="setHtmlOverlayAutoOff(' + i + ',30)">30с</button>' +
      (overlay.autoOffSec ? '<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 6px;color:var(--red)" onclick="setHtmlOverlayAutoOff(' + i + ',0)">Вимк</button>' : '') +
      '</div>' +
      // Фон із ПК — окремо від GDD-полів, працює для БУДЬ-ЯКОГО файлу
      '<div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-left:28px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 9px" onclick="gddPickCustomBg('+i+')">🖼 Фон із ПК' + (hasBg ? ' (замінити)' : '') + '</button>' +
      (hasBg
        ? '<span style="font-size:11px;color:var(--green)">✓ встановлено, працює офлайн</span>' +
          '<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 8px;color:var(--red)" onclick="gddClearCustomBg('+i+')">✕</button>'
        : '<span style="font-size:11px;color:var(--text2)">Для файлів без власних полів фону — вставляє картинку позаду всього</span>') +
      '</div>' +
      // Розташування + жива мініатюра — та сама формула позиціювання, що й
      // на реальному екрані (_customBgPosStyle), тож мініатюра показує
      // ТОЧНО те, де картинка буде в ефірі, не приблизно.
      (hasBg ? (
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-top:8px;padding-left:28px;flex-wrap:wrap">' +
        '<div style="width:140px;aspect-ratio:16/9;background:#111;position:relative;overflow:hidden;border-radius:4px;border:1px solid var(--border);flex-shrink:0">' +
        '<img src="' + overlay.customBg + '" style="position:absolute;' + _customBgPosStyle(overlay.customBgPos) + '">' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px">' +
        '<span style="font-size:10px;color:var(--text2)">Розташування (прев\'ю зліва показує де саме):</span>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
        [['cover','На весь екран'],['center','По центру'],['top-left','Зверху-зліва'],['top-right','Зверху-справа'],['bottom-left','Знизу-зліва'],['bottom-right','Знизу-справа']].map(function(p) {
          var active = (overlay.customBgPos || 'cover') === p[0];
          return '<button class="btn ' + (active ? 'btn-primary' : 'btn-ghost') + ' btn-sm" style="font-size:10px;padding:3px 7px" onclick="setHtmlOverlayBgPos(' + i + ',\'' + p[0] + '\')">' + p[1] + '</button>';
        }).join('') +
        '</div></div></div>'
      ) : '');
    el.appendChild(div);
  });
  if (!shown) el.innerHTML = '<p class="text-muted">Нічого не знайдено за цим запитом/категорією</p>';
}


// ============================================================
// УНІВЕРСАЛЬНИЙ ФОН ІЗ ПК ДЛЯ БУДЬ-ЯКОГО HTML-ФАЙЛУ
// Кнопка «Файл з комп'ютера» для GDD-полів працює лише в шаблонах,
// спеціально зроблених під цю програму (мають власну функцію update()).
// Звичайний HTML, завантажений звідкись іще, цього не вміє — для нього
// вставляємо фон окремим шаром позаду всього вмісту, через CSS,
// незалежно від того, що вміє сам файл.
// ============================================================
// Автообрізка суцільної рамки по краях — фото/лого, де навколо самого
// малюнка/тексту лишається однотонне поле «нізвідки» (найчастіше біле або
// чорне, але буває будь-яке — тому колір рамки не задаємо наперед, а беремо
// РЕАЛЬНИЙ колір з кутів самого зображення). Шукає межу контенту з кожного
// боку (рядок/стовпець вважається «рамкою», якщо ВСІ його пікселі близькі до
// цього кольору), обрізає лише за краями, всередину не лізе. Повертає canvas
// з обрізаним зображенням, або null — якщо суттєвої рамки нема (щоб не
// псувати звичайні фото без полів).
function autoCropFlatMargins(img) {
  var w = img.width, h = img.height;
  if (!w || !h) return null;
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  var ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  var data;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return null; }

  // Колір рамки беремо з чотирьох кутів — якщо вони збігаються (з невеликим
  // допуском), це і є колір поля, яке треба прибрати. Якщо кути різні —
  // рамки, найімовірніше, нема, обрізати нічого.
  function px(x, y) { var idx = (y * w + x) * 4; return [data[idx], data[idx + 1], data[idx + 2]]; }
  var corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  var TOL = 12; // допуск на JPEG-шум/легкий градієнт
  function close(a, b) { return Math.abs(a[0]-b[0]) <= TOL && Math.abs(a[1]-b[1]) <= TOL && Math.abs(a[2]-b[2]) <= TOL; }
  if (!close(corners[0], corners[1]) || !close(corners[0], corners[2]) || !close(corners[0], corners[3])) return null;
  var ref = corners[0];

  function isFlatRow(y) {
    var rowStart = y * w * 4;
    for (var x = 0; x < w; x++) {
      var idx = rowStart + x * 4;
      if (Math.abs(data[idx]-ref[0]) > TOL || Math.abs(data[idx+1]-ref[1]) > TOL || Math.abs(data[idx+2]-ref[2]) > TOL) return false;
    }
    return true;
  }
  function isFlatCol(x) {
    for (var y = 0; y < h; y++) {
      var idx = (y * w + x) * 4;
      if (Math.abs(data[idx]-ref[0]) > TOL || Math.abs(data[idx+1]-ref[1]) > TOL || Math.abs(data[idx+2]-ref[2]) > TOL) return false;
    }
    return true;
  }

  var top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < bottom && isFlatRow(top)) top++;
  while (bottom > top && isFlatRow(bottom)) bottom--;
  while (left < right && isFlatCol(left)) left++;
  while (right > left && isFlatCol(right)) right--;

  var cropW = right - left + 1, cropH = bottom - top + 1;
  // Захист: нема суттєвої рамки (< 2% з будь-якого боку) — не чіпаємо оригінал.
  if (cropW >= w * 0.98 && cropH >= h * 0.98) return null;
  // Захист: майже все однотонне (лишилось замало) — теж не чіпаємо, щоб не
  // вирізати щось на 2 пікселі замість фото.
  if (cropW < w * 0.05 || cropH < h * 0.05) return null;

  var out = document.createElement('canvas');
  out.width = cropW; out.height = cropH;
  out.getContext('2d').drawImage(cv, left, top, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

function gddPickCustomBg(i) {
  var overlay = htmlOverlays[i];
  if (!overlay) return;
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.onchange = function() {
    var f = inp.files && inp.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var cropped = autoCropFlatMargins(img);
        var srcW = cropped ? cropped.width : img.width;
        var srcH = cropped ? cropped.height : img.height;
        var w = srcW, h = srcH, max = 1920;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        var dataUrl;
        try {
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(cropped || img, 0, 0, w, h);
          dataUrl = cv.toDataURL('image/jpeg', 0.85);
        } catch (err) { dataUrl = e.target.result; }
        overlay.customBg = dataUrl;
        saveHTMLOverlays();
        renderHTMLOverlayList();
        if (typeof notify === 'function') notify('🖼 Фон додано: ' + (overlay.displayName || overlay.name) + (cropped ? ' (однотонні поля обрізано)' : ''));
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(f);
  };
  inp.click();
}
function gddClearCustomBg(i) {
  var overlay = htmlOverlays[i];
  if (!overlay) return;
  delete overlay.customBg;
  delete overlay.customBgPos;
  saveHTMLOverlays();
  renderHTMLOverlayList();
}
// Куди саме поставити фон/лого з ПК — «на весь екран» (як і було завжди),
// або одна з кутових позицій/центр (як лого-водяний знак, не перекриває
// решту контенту). ОДНА формула для реального виводу (position:fixed,
// gddApplyCustomBg) і для маленької мініатюри-прев'ю (position:absolute,
// renderHTMLOverlayList) — щоб прев'ю чесно показувало, де саме буде
// картинка в ефірі, а не приблизно.
function _customBgPosStyle(pos) {
  if (!pos || pos === 'cover') return 'inset:0;width:100%;height:100%;object-fit:cover;';
  var box = 'max-width:32%;max-height:32%;object-fit:contain;';
  switch (pos) {
    case 'top-left': return box + 'top:5%;left:5%;';
    case 'top-right': return box + 'top:5%;right:5%;';
    case 'bottom-left': return box + 'bottom:5%;left:5%;';
    case 'bottom-right': return box + 'bottom:5%;right:5%;';
    case 'center': return box + 'top:50%;left:50%;transform:translate(-50%,-50%);';
    default: return box + 'top:5%;left:5%;';
  }
}
function setHtmlOverlayBgPos(i, pos) {
  var overlay = htmlOverlays[i];
  if (!overlay) return;
  overlay.customBgPos = pos;
  saveHTMLOverlays();
  renderHTMLOverlayList();
}
// Вставляє фон-шар одразу після відкриття <body> — позаду всього вмісту
// (низький z-index), не залежно від внутрішньої структури файлу.
// «На весь екран» (cover, за замовчуванням) лишається як CSS-фон div-а —
// поводиться так само, як і раніше. Кутові позиції/центр — окремий <img>
// з object-fit:contain (не розтягує й не обрізає картинку).
function gddApplyCustomBg(html, dataUrl, pos) {
  var layer;
  if (!pos || pos === 'cover') {
    layer = '<div style="position:fixed;inset:0;z-index:-1;background:#000 url(\'' + dataUrl +
      '\') center/cover no-repeat"></div>';
  } else {
    layer = '<img src="' + dataUrl + '" style="position:fixed;' + _customBgPosStyle(pos) + 'z-index:-1;pointer-events:none">';
  }
  var m = html.match(/<body[^>]*>/i);
  if (m) return html.slice(0, m.index + m[0].length) + layer + html.slice(m.index + m[0].length);
  return layer + html;   // немає тегу <body> — просто додаємо на початок
}

function sendHTMLOverlay(i) {
  sendHTMLOverlayTo(i, 0);   // 0 = дзеркальні виходи (стара поведінка за замовчуванням)
}

// Скільки секунд показувати цю графіку, перш ніж вона сама зникне з екрана
// (0/нема — показується, поки не вимкнуть вручну, як і раніше).
function setHtmlOverlayAutoOff(i, val) {
  var overlay = htmlOverlays[i];
  if (!overlay) return;
  var sec = parseInt(val, 10);
  if (!sec || sec <= 0) delete overlay.autoOffSec;
  else overlay.autoOffSec = sec;
  saveHTMLOverlays();
  renderHTMLOverlayList();
}

// Живий стан: який оверлей (за індексом) зараз показаний на кожному виході.
// { 1: idx|null, 2: idx|null, 3: idx|null, 4: idx|null } — щоб у списку було
// видно "в ефірі" й можна було вимкнути саме той вихід, а не все підряд.
var htmlLiveMap = { 1: null, 2: null, 3: null, 4: null };
// Позначені чекбоксами файли — для масового присвоєння категорії одразу
// кільком (напр. усі заставки однієї серії проповідей). Set, не масив —
// перевірка "чи позначено" й (від)позначення O(1), без пошуку по масиву.
var htmlOverlaySelected = new Set();

// Таймери автовимкнення, по одному на вихід — { 1: timeoutId, ... }. Новий
// показ на тому самому виході скасовує попередній таймер (щоб він не
// вимкнув щось інше, що вже прийшло на зміну).
var htmlAutoOffTimers = {};
function clearHtmlAutoOffTimer(n) {
  if (htmlAutoOffTimers[n]) { clearTimeout(htmlAutoOffTimers[n]); delete htmlAutoOffTimers[n]; }
}
function scheduleHtmlAutoOff(n, i, sec) {
  clearHtmlAutoOffTimer(n);
  htmlAutoOffTimers[n] = setTimeout(function() {
    delete htmlAutoOffTimers[n];
    // Вимикаємо лише якщо на цьому виході й досі ТОЙ САМИЙ оверлей —
    // інакше оператор міг тим часом сам показати щось інше.
    if (htmlLiveMap[n] === i) clearHTMLOverlayOutput(n);
  }, sec * 1000);
}

function buildHTMLOverlayHTML(i) {
  var overlay = htmlOverlays[i];
  if (!overlay) return null;
  var html = overlay.content;
  // GDD-графіка сама себе не показує — вона чекає на update()+play() від движка.
  // Вшиваємо бутстрап із значеннями полів, інакше на екрані буде порожньо.
  if (typeof gddDetect === 'function' && gddDetect(html)) {
    var data = (gddParams[i] && Object.keys(gddParams[i]).length) ? gddParams[i] : gddDefaults(html);
    gddParams[i] = data;
    html = gddInject(html, data);
    gddActiveIndex = i;
  }
  // Свій фон із ПК — працює для БУДЬ-ЯКОГО файлу, GDD чи ні
  if (overlay.customBg) html = gddApplyCustomBg(html, overlay.customBg, overlay.customBgPos);
  return html;
}

// Надіслати конкретний оверлей на КОНКРЕТНИЙ вихід (n=1..4), або 0 = на всі
// дзеркальні виходи (стара поведінка). Раніше була лише одна кнопка «На
// проектор», що завжди йшла на дзеркальні виходи без вибору — не можна було
// показати графіку саме на трансляції чи окремому виході.
// Мітка для показу в ефірі/логах: якщо файл належить до категорії (напр.
// серії проповідей) — додаємо її на початок, щоб було видно з чого саме
// вона, не лише саму назву файлу.
function htmlOverlayLabel(overlay) {
  var name = overlay.displayName || overlay.name;
  return overlay.category ? '[' + overlay.category + '] ' + name : name;
}
function sendHTMLOverlayTo(i, n) {
  var overlay = htmlOverlays[i];
  if (!overlay) return;
  var html = buildHTMLOverlayHTML(i);
  if (html == null) return;
  if (n === 0) {
    sendHTMLToProjector(html, htmlOverlayLabel(overlay));
    [1, 2, 3, 4].forEach(function(k) {
      if (state.outputStates && state.outputStates[k] && state.outputStates[k].open) {
        htmlLiveMap[k] = i;
        if (overlay.autoOffSec) scheduleHtmlAutoOff(k, i, overlay.autoOffSec);
        else clearHtmlAutoOffTimer(k);
      }
    });
  } else {
    if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, html, htmlOverlayLabel(overlay));
    htmlLiveMap[n] = i;
    if (overlay.autoOffSec) scheduleHtmlAutoOff(n, i, overlay.autoOffSec);
    else clearHtmlAutoOffTimer(n);
  }
  renderHTMLOverlayList();
}

// Вимкнути конкретний вихід (прибрати графіку саме звідти, не чіпаючи решту).
function clearHTMLOverlayOutput(n) {
  if (typeof pv2ClearOutput === 'function') pv2ClearOutput(n);
  htmlLiveMap[n] = null;
  clearHtmlAutoOffTimer(n);
  renderHTMLOverlayList();
}

// Прев'ю у вікні теж має стартувати графіку
var gddParams = {};       // збережені значення полів для кожного оверлея
// Пресети — КІЛЬКА іменованих наборів значень для одного й того ж GDD-файлу
// (напр. «Ранок» / «Вечір» для однієї заставки з різним текстом). На
// відміну від gddParams[i] (лише ОДИН, поточний набір, що перезаписується
// при кожному редагуванні полів), пресети зберігаються окремо й НЕ губляться.
// Формат: gddPresets[i] = [{ name: 'Ранок', values: {...} }, ...]
var gddPresets = {};
var gddActiveIndex = null; // яка графіка зараз в ефірі

function previewHTMLOverlay(i) {
  var html = buildHTMLOverlayHTML(i);
  if (html == null) return;
  var win = window.open('', '_blank', 'width=960,height=540');
  win.document.write(html);
  win.document.close();
}

// Перейменування — НЕ чіпає overlay.name (початкову назву файлу, за якою
// повторне завантаження того самого файлу впізнає й ОНОВЛЮЄ запис замість
// дублювання). displayName — окреме, необов'язкове поле лише для показу.
// Закріплення — спливає нагору списку (стабільно, серед інших закріплених
// зберігає свій порядок). Сам масив НЕ переставляється — це лише прапорець,
// сортування відбувається у renderHTMLOverlayList() під час показу.
function togglePinHTMLOverlay(i) {
  var o = htmlOverlays[i];
  if (!o) return;
  o.pinned = !o.pinned;
  saveHTMLOverlays();
  renderHTMLOverlayList();
  notify(o.pinned ? '📌 Закріплено нагорі' : '📌 Відкріплено');
}
// Переміщення на позицію вгору/вниз — ЛИШЕ в межах своєї групи (закріплені
// окремо від незакріплених), щоб порядок на екрані завжди збігався з тим,
// що реально станеться при кліку (кнопки ▲▼ й так ховаються при активному
// пошуку/фільтрі — там «сусід на екрані» й «сусід у масиві» не одне й те саме).
function moveHTMLOverlay(i, direction) {
  var o = htmlOverlays[i];
  if (!o) return;
  var group = [];
  htmlOverlays.forEach(function(x, idx) { if (!!x.pinned === !!o.pinned) group.push(idx); });
  var pos = group.indexOf(i);
  var swapPos = pos + direction;
  if (swapPos < 0 || swapPos >= group.length) return;   // вже на межі групи
  var j = group[swapPos];
  var tmp = htmlOverlays[i];
  htmlOverlays[i] = htmlOverlays[j];
  htmlOverlays[j] = tmp;
  // htmlLiveMap зберігає ІНДЕКСИ (яка графіка зараз в ефірі на якому
  // виході) — після фізичної перестановки елементів масиву ці індекси
  // мають бути перепризначені, інакше «🔴 В ЕФІРІ» показувалось би на
  // неправильному, щойно переставленому елементі.
  [1, 2, 3, 4].forEach(function(n) {
    if (htmlLiveMap[n] === i) htmlLiveMap[n] = j;
    else if (htmlLiveMap[n] === j) htmlLiveMap[n] = i;
  });
  saveHTMLOverlays();
  renderHTMLOverlayList();
}
function renameHTMLOverlay(i) {
  var o = htmlOverlays[i];
  if (!o) return;
  pv2Prompt('Нова назва (лише для показу в списку):', o.displayName || o.name, function(newName) {
    if (newName === null) return;
    if (!newName.trim()) { notify('⚠️ Назва не може бути порожньою'); return; }
    o.displayName = newName.trim();
    saveHTMLOverlays();
    renderHTMLOverlayList();
    notify('✏️ Перейменовано: ' + o.displayName);
  });
}
// Спільна логіка застосування категорії — викликається і з діалогу (список
// файлів), і напряму з поля вводу в панелі GDD-полів (без діалогу, миттєво
// на onchange) — щоб не дублювати збереження/сповіщення в обох місцях.
function applyHtmlOverlayCategory(i, newCat) {
  var o = htmlOverlays[i];
  if (!o) return;
  o.category = (newCat || '').trim();
  saveHTMLOverlays();
  notify(o.category ? '🏷 Категорія: ' + o.category : '🏷 Категорію знято');
}
// Вибір кількох файлів чекбоксами — щоб позначити їх усі ОДНІЄЮ категорією
// за раз (напр. 5 заставок нової серії проповідей), не клікаючи «🏷» на
// кожному окремо.
function toggleHtmlOverlaySelect(i) {
  if (htmlOverlaySelected.has(i)) htmlOverlaySelected.delete(i);
  else htmlOverlaySelected.add(i);
  renderHTMLOverlayList();
}
function clearHtmlOverlaySelection() {
  htmlOverlaySelected.clear();
  renderHTMLOverlayList();
}
function bulkSetHtmlOverlayCategory() {
  if (!htmlOverlaySelected.size) return;
  var n = htmlOverlaySelected.size;
  pv2Prompt('Категорія для ' + n + ' обраних файлів — залиш порожнім, щоб прибрати в усіх:', '', function(newCat) {
    if (newCat === null) return;
    htmlOverlaySelected.forEach(function(i) { applyHtmlOverlayCategory(i, newCat); });
    htmlOverlaySelected.clear();
    renderHTMLOverlayList();
    notify('🏷 Позначено ' + n + ' файлів');
  });
}
function setHtmlOverlayCategory(i) {
  var o = htmlOverlays[i];
  if (!o) return;
  pv2Prompt('Категорія (напр. «Заставки», «QR», «Оголошення») — залиш порожнім, щоб прибрати:', o.category || '', function(newCat) {
    if (newCat === null) return;
    applyHtmlOverlayCategory(i, newCat);
    renderHTMLOverlayList();
  });
}
// Без діалогу — пряме поле в панелі GDD-полів (onchange, не на кожен символ).
function setHtmlOverlayCategoryInline(i, value) {
  applyHtmlOverlayCategory(i, value);
  if (typeof renderHTMLOverlayList === 'function') renderHTMLOverlayList();
}
// Клонує файл (той самий вміст) під новою назвою — щоб зробити варіант
// наявного шаблону, не вивантажуючи файл заново.
function duplicateHTMLOverlay(i) {
  var o = htmlOverlays[i];
  if (!o) return;
  var baseName = (o.displayName || o.name) + ' (копія)';
  var clone = JSON.parse(JSON.stringify(o));
  clone.displayName = baseName;
  htmlOverlays.push(clone);
  saveHTMLOverlays();
  renderHTMLOverlayList();
  notify('⧉ Продубльовано: ' + baseName);
}
function removeHTMLOverlay(i) {
  htmlOverlays.splice(i, 1);
  // Видалення зсуває індекси в масиві — htmlLiveMap зберігає саме індекси,
  // тож без корекції він міг би після видалення вказувати на ІНШИЙ оверлей
  // або лишати «в ефірі» позначку на видаленому. Таймер автовимкнення теж
  // «пам'ятає» старий індекс у своєму замиканні — на виходах, де саме цей
  // оверлей був в ефірі, скасовуємо його разом, інакше через якийсь час
  // він міг би вимкнути вже ІНШИЙ оверлей, що зайняв цей самий індекс.
  [1, 2, 3, 4].forEach(function(n) {
    if (htmlLiveMap[n] === i) { htmlLiveMap[n] = null; clearHtmlAutoOffTimer(n); }
    else if (htmlLiveMap[n] != null && htmlLiveMap[n] > i) htmlLiveMap[n]--;
  });
  saveHTMLOverlays();
  renderHTMLOverlayList();
}

function sendHTMLToProjector(htmlContent, label) {
  ensureProjector(function(){ doSendHTML(htmlContent, label); });
}

function doSendHTML(htmlContent, label) {
  // Записуємо HTML і передаємо URL (а не рядок HTML), щоб iframe міг його
  // завантажити. Канал доставки (file:// чи app://) обирає overlayPath()
  // за перемикачем у налаштуваннях — див. коментар біля overlayPath
  // в extras-1.js. Раніше тут був прямий виклик writeHtmlOverlay, через
  // що перемикач діяв би лише частково.
  overlayPath(htmlContent).then(function(filePath) {
    window.electronAPI.sendToProjector('html', { filePath: filePath });
  });
  onAirText = label || 'HTML';
  document.getElementById('sendPreview').innerHTML = '<b>На екрані:</b> ' + escHtml(label || 'HTML файл');
  document.getElementById('onAirLabel').textContent = '● НА ЕКРАНІ';
  document.getElementById('onAirLabel').style.color = '#3ecf8e';
}

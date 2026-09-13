// ============================================================
// ПЕРЕКЛАДИ БІБЛІЇ
// Винесено з index.html для кращої організації коду.
//
// Код був не суцільним блоком — між шматками стояли непов'язані речі
// (загальні утиліти конвертації медіа, спільне «Нещодавні» для пісень
// і віршів, експорт пісень). Ці частини лишились в index.html; тут —
// лише те, що справді про переклади Біблії.
// ============================================================

var BIBLE_TRANSLATIONS_KEY = 'church_bible_translations';
var bibleTranslations = {}; // { id: {name, books: {bookId: {chapterNum: {verseNum: text}}} } }
var currentTranslationId = ''; // порожньо = переклад не обрано

function loadBibleTranslations() {
  try {
    var raw = bigStoreGet(BIBLE_TRANSLATIONS_KEY);
    if (raw) bibleTranslations = JSON.parse(raw);
  } catch(e) { bibleTranslations = {}; }
  renderBibleTranslationsList();
  refreshTranslationSelector();
  if (typeof loadBuiltinTranslations === 'function') loadBuiltinTranslations();
}

// Вбудовані переклади Біблії (усі Public Domain, взяті з ebible.org) — довантажуються
// один раз при першому запуску з файлів у src/bible-data/, щоб не змушувати
// імпортувати їх вручну щоразу після переустановки. Довантажуються з диска (не
// зашиті прямо в JS), тому не роздувають самі скрипти — кожен файл кілька МБ.
// Не чіпаємо переклад, якщо під тим самим id вже щось є (не мало б статись —
// id зумисно унікальні, але про всяк випадок не перезаписуємо чужі дані).
var BUILTIN_TRANSLATIONS = [
  { id: 'ukr1871_kulish',   file: 'bible-data/ukr1871_kulish.json' },
  { id: 'ces1613_kralicka', file: 'bible-data/ces1613_kralicka.json' },
  { id: 'rus_synodal',      file: 'bible-data/rus_synodal.json' }
];
function loadBuiltinTranslations() {
  var missing = BUILTIN_TRANSLATIONS.filter(function(t) { return !bibleTranslations[t.id]; });
  if (!missing.length) return;
  Promise.all(missing.map(function(t) {
    return fetch(t.file)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { return data ? { id: t.id, data: data } : null; })
      .catch(function() { return null; });
  })).then(function(results) {
    var added = 0;
    results.forEach(function(r) {
      if (r && r.data && !bibleTranslations[r.id]) { bibleTranslations[r.id] = r.data; added++; }
    });
    if (added) {
      safeSet(BIBLE_TRANSLATIONS_KEY, JSON.stringify(bibleTranslations));
      renderBibleTranslationsList();
      refreshTranslationSelector();
      if (typeof notify === 'function') notify('📖 Додано вбудованих перекладів Біблії: ' + added);
    }
  });
}

// Експорт УСІХ імпортованих перекладів у один файл (щоб не втратити при оновленні).
function exportTranslations() {
  var msg = document.getElementById('translBackupMsg');
  try {
    var ids = Object.keys(bibleTranslations || {});
    if (!ids.length) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Немає імпортованих перекладів'; } return; }
    var blob = new Blob([JSON.stringify(bibleTranslations)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'church_translations_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    if (msg) { msg.style.color = 'var(--green)'; msg.textContent = '✓ Збережено ' + ids.length + ' перекладів. Тримай цей файл — після оновлення відновиш ним.'; }
  } catch(e) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = '✗ ' + e.message; } }
}
// Відновлення перекладів із файлу (доливає до наявних).
function importTranslations(input) {
  var file = input.files[0];
  if (!file) return;
  var msg = document.getElementById('translBackupMsg');
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object') throw new Error('невірний формат файлу');
      bibleTranslations = bibleTranslations || {};
      var added = 0;
      Object.keys(data).forEach(function(id) { bibleTranslations[id] = data[id]; added++; });
      safeSet(BIBLE_TRANSLATIONS_KEY, JSON.stringify(bibleTranslations));
      renderBibleTranslationsList();
      refreshTranslationSelector();
      if (msg) { msg.style.color = 'var(--green)'; msg.textContent = '✓ Відновлено ' + added + ' перекладів'; }
    } catch(err) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = '✗ ' + err.message; } }
    input.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

function refreshTranslationSelector() {
  // Якщо переклад ще не обрано, а імпортовані є — беремо перший
  var ids = Object.keys(bibleTranslations);
  if (!currentTranslationId && ids.length) currentTranslationId = ids[0];
  var sels = ['bibleTranslation', 'multiTrans1', 'multiTrans2', 'multiTrans3'];
  sels.forEach(function(selId) {
    var sel = document.getElementById(selId);
    if (!sel) return;
    // Перший пункт — плейсхолдер, решту перезаповнюємо
    while (sel.options.length > 1) sel.remove(1);
    Object.keys(bibleTranslations).forEach(function(id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = bibleTranslations[id].name;
      sel.appendChild(opt);
    });
    if (selId === 'bibleTranslation' && currentTranslationId) sel.value = currentTranslationId;
  });
  initBibleBooks();
}

function onTranslationChange() {
  currentTranslationId = document.getElementById('bibleTranslation').value;
  // Reset book/chapter/verse selectors
  document.getElementById('bibleBook').innerHTML = '<option value="">Книга...</option>';
  document.getElementById('bibleChapter').innerHTML = '<option value="">Глава...</option>';
  document.getElementById('bibleVerse').innerHTML = '<option value="">Вірш...</option>';
  currentBibleBook = null; currentBibleChapter = null; currentBibleVerseNum = null;
  // Перебудовуємо список книг мовою обраного перекладу (через getBookName),
  // а не хардкодом української назви — інакше книги завжди були українською.
  initBibleBooks();
}

// Повертає назву книги з активного перекладу або з BIBLE_BOOKS

function getBookName(bookId, translationId) {
  var tid = translationId || currentTranslationId;
  if (typeof bibleTranslations !== 'undefined' && bibleTranslations && bibleTranslations[tid]) {
    var t = bibleTranslations[tid];
    // 1) Вбудована таблиця за МОВОЮ перекладу — головний варіант, щоб назви книг
    // завжди відповідали мові перекладу. Інакше російський переклад, у файлі
    // якого книги записані англійськими назвами, показував би книги англійською.
    var lang = (typeof detectTranslationLang === 'function') ? detectTranslationLang(t, tid) : null;
    if (lang && typeof BOOK_NAMES_BY_LANG !== 'undefined' &&
        BOOK_NAMES_BY_LANG[lang] && BOOK_NAMES_BY_LANG[lang][bookId]) {
      return BOOK_NAMES_BY_LANG[lang][bookId];
    }
    // 2) Назва з самого файлу — запас, коли для мови немає таблиці (напр. українська)
    if (t.bookNames && t.bookNames[bookId]) {
      var own = t.bookNames[bookId];
      var ukr = (BIBLE_BOOKS.find(function(b){ return b.id === bookId; }) || {}).name;
      if (own !== ukr) return own;
    }
  }
  // 3) українська як запасний варіант
  var book = BIBLE_BOOKS.find(function(b){ return b.id === bookId; });
  return book ? book.name : bookId;
}

function getVerseText(bookId, chapter, verse) {
  if (typeof bibleTranslations === 'undefined' || !bibleTranslations) return null;
  var t = bibleTranslations[currentTranslationId];
  if (!t || !t.books[bookId]) return null;
  // Try both string and number keys
  var ch = t.books[bookId][chapter] || t.books[bookId][String(chapter)];
  if (!ch) return null;
  return ch[verse] || ch[String(verse)] || null;
}

// ---- Кілька віршів (діапазон) --------------------------------------------
var currentBibleVerseTo = null;   // кінець діапазону; null = один вірш

// Номер вірша у верхньому регістрі (¹⁶) — щоб у діапазоні було видно межі віршів.
function supNum(n) {
  var m = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹' };
  return String(n).split('').map(function(d){ return m[d] || d; }).join('');
}

// Поточний діапазон віршів {from, to}. «по вірш» ігнорується, якщо менший за початок.
function verseRange() {
  var from = currentBibleVerseNum;
  var toEl = document.getElementById('bibleVerseTo');
  var toVal = toEl ? parseInt(toEl.value, 10) : NaN;
  var to = (!isNaN(toVal) && toVal >= from) ? toVal : from;
  return { from: from, to: to };
}

// Рядок посилання: «Івана 3:16» або «Івана 3:16-18» для діапазону.
function currentBibleRef() {
  var r = verseRange();
  var base = getBookName(currentBibleBook) + ' ' + currentBibleChapter + ':' + r.from;
  return r.to > r.from ? (base + '-' + r.to) : base;
}

// Об'єднаний текст діапазону віршів для перекладу (transId null = поточний).
// У діапазоні кожен вірш із малим номером; для одного вірша — без номера.
function getVerseRangeText(transId, bookId, chapter, fromV, toV) {
  var parts = [];
  for (var v = fromV; v <= toV && (v - fromV) < 60; v++) {
    var t = transId ? getVerseForTranslation(transId, bookId, chapter, v)
                    : getVerseText(bookId, chapter, v);
    if (t) parts.push((toV > fromV ? (supNum(v) + ' ') : '') + t);
  }
  return parts.join(' ');
}

// Скільки віршів у поточній главі обраного перекладу (0 = невідомо).
function chapterVerseCount() {
  var t = bibleTranslations && bibleTranslations[currentTranslationId];
  var ch = t && t.books[currentBibleBook] &&
    (t.books[currentBibleBook][currentBibleChapter] || t.books[currentBibleBook][String(currentBibleChapter)]);
  return ch ? Object.keys(ch).length : 0;
}

function buildSearchIndex(translationId) {
  var verses = [];

  {
    var t = bibleTranslations[translationId];
    if (!t) return null;
    Object.keys(t.books).forEach(function(bookId) {
      Object.keys(t.books[bookId]).forEach(function(ch) {
        Object.keys(t.books[bookId][ch]).forEach(function(v) {
          verses.push({ key: bookId + '.' + ch + '.' + v, text: t.books[bookId][ch][v] });
        });
      });
    });
  }

  var wordIndex = {};      // word -> array of verse indices
  var wordsByLength = {};  // length -> array of unique words (для швидкого fuzzy-перебору)
  var normTexts = [];

  verses.forEach(function(v, i) {
    var norm = fuzzyNormalize(v.text);
    normTexts.push(norm);
    var words = {};
    norm.split(' ').forEach(function(w) { if (w.length >= 2) words[w] = true; });
    Object.keys(words).forEach(function(w) {
      if (!wordIndex[w]) {
        wordIndex[w] = [];
        var L = w.length;
        if (!wordsByLength[L]) wordsByLength[L] = [];
        wordsByLength[L].push(w);
      }
      wordIndex[w].push(i);
    });
  });

  var index = { verses: verses, normTexts: normTexts, wordIndex: wordIndex, wordsByLength: wordsByLength };
  bibleSearchIndexes[translationId] = index;
  return index;
}

function getSearchIndex(translationId) {
  return bibleSearchIndexes[translationId] || buildSearchIndex(translationId);
}

// Швидкий indexed-пошук — використовує побудований індекс замість
// перебору всіх віршів, тому масштабується на десятки тисяч віршів.
function fuzzySearchIndexed(query, translationId, maxResults) {
  var index = getSearchIndex(translationId);
  if (!index) return [];

  var qNorm = fuzzyNormalize(query);
  var queryWords = qNorm.split(' ').filter(Boolean);
  if (!queryWords.length) return [];

  var candidateIds = {};
  var wordMatchInfo = {}; // verseId -> { queryWord: score }

  queryWords.forEach(function(qw) {
    var matched = {}; // matchedIndexWord -> score
    if (index.wordIndex[qw]) matched[qw] = 3;

    if (qw.length >= 3) {
      var maxDist = qw.length <= 6 ? 1 : 2;
      var qlen = qw.length;
      for (var L = Math.max(2, qlen - maxDist); L <= qlen + maxDist; L++) {
        var bucket = index.wordsByLength[L];
        if (!bucket) continue;
        for (var bi = 0; bi < bucket.length; bi++) {
          var iw = bucket[bi];
          if (iw === qw) continue;
          var dist = levenshtein(qw, iw);
          if (dist <= maxDist) {
            var sc = 2 - dist * 0.3;
            if (!matched[iw] || matched[iw] < sc) matched[iw] = sc;
          }
        }
      }
    }

    Object.keys(matched).forEach(function(mw) {
      var sc = matched[mw];
      var ids = index.wordIndex[mw];
      for (var ii = 0; ii < ids.length; ii++) {
        var vid = ids[ii];
        candidateIds[vid] = true;
        if (!wordMatchInfo[vid]) wordMatchInfo[vid] = {};
        if (!wordMatchInfo[vid][qw] || wordMatchInfo[vid][qw] < sc) wordMatchInfo[vid][qw] = sc;
      }
    });
  });

  var results = [];
  Object.keys(candidateIds).forEach(function(vidStr) {
    var vid = parseInt(vidStr);
    var textNorm = index.normTexts[vid];
    var idx = textNorm.indexOf(qNorm);
    var score;
    if (idx > -1) {
      score = 1000 - idx;
    } else {
      var matches = wordMatchInfo[vid];
      var matchedCount = Object.keys(matches).length;
      if (queryWords.length > 1 && matchedCount < Math.ceil(queryWords.length * 0.6)) return;
      score = 0;
      Object.keys(matches).forEach(function(k) { score += matches[k]; });
    }
    results.push({ key: index.verses[vid].key, text: index.verses[vid].text, score: score });
  });

  results.sort(function(a, b) { return b.score - a.score; });
  return results.slice(0, maxResults || 20);
}

function searchBibleInTranslation(q) {
  // Використовуємо швидкий indexed-пошук замість перебору всіх віршів —
  // критично для великих перекладів (Синодальний = 30000+ віршів)
  return fuzzySearchIndexed(q, currentTranslationId, 20);
}


function renderBibleTranslationsList() {
  var el = document.getElementById('bibleTranslationsList');
  if (!el) return;   // елемента нема в DOM (напр. вкладка ще не змонтована) — тихо виходимо, а не рвемо скрипт
  var keys = Object.keys(bibleTranslations);
  if (!keys.length) { el.innerHTML = '<p class="text-muted">Тільки вбудований УКБ</p>'; return; }
  el.innerHTML = '';
  keys.forEach(function(id) {
    var t = bibleTranslations[id];
    var div = document.createElement('div');
    div.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;';
    div.innerHTML = '<span style="flex:1;font-size:13px"><b>'+escHtml(t.name)+'</b>' +
      (t.language ? ' <span class="badge">'+escHtml(t.language)+'</span>' : '') + '</span>' +
      '<button class="btn btn-ghost btn-sm" onclick="renameBibleTranslation(\''+id+'\')">✏️ Перейменувати</button>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteBibleTranslation(\''+id+'\')">✕ Видалити</button>';
    el.appendChild(div);
  });
}

// Дозволяє змінити назву й мовну позначку вже імпортованого перекладу —
// раніше це фіксувалось назавжди тим, що було в файлі при імпорті (звідси
// могли бути назви різними мовами поруч — напр. "Russian Synodal
// Translation" англійською й "Переклад Турконяка" українською).
function renameBibleTranslation(id) {
  var t = bibleTranslations[id];
  if (!t) return;
  pv2Prompt('Нова назва перекладу:', t.name || '', function(newName) {
    if (newName === null) return;   // скасовано — нічого не міняємо
    if (!newName.trim()) { notify('⚠️ Назва не може бути порожньою'); return; }
    pv2Prompt('Мовна позначка (напр. UA, RU, CZ) — необов\'язково, буде показана поруч із назвою:', t.language || '', function(newLang) {
      if (newLang === null) return;   // скасовано на цьому кроці — не зберігаємо ЖОДНИХ змін
      t.name = newName.trim();
      t.language = newLang.trim();
      safeSet(BIBLE_TRANSLATIONS_KEY, JSON.stringify(bibleTranslations));
      renderBibleTranslationsList();
      if (typeof refreshTranslationSelector === 'function') refreshTranslationSelector();
      notify('✏️ Переклад перейменовано: ' + t.name);
    });
  });
}
function deleteBibleTranslation(id) {
  if (!confirm('Видалити цей переклад?')) return;
  delete bibleTranslations[id];
  delete bibleSearchIndexes[id]; // прибираємо застарілий search-індекс з пам'яті
  safeSet(BIBLE_TRANSLATIONS_KEY, JSON.stringify(bibleTranslations));
  renderBibleTranslationsList();
  refreshTranslationSelector();
  if (currentTranslationId === id) {
    var left = Object.keys(bibleTranslations);
    currentTranslationId = left.length ? left[0] : '';
    var sel = document.getElementById('bibleTranslation');
    if (sel) sel.value = currentTranslationId;
    onTranslationChange();
  }
}

function downloadBibleTemplate() {
  var template = {
    name: "Назва перекладу",
    language: "uk",
    books: [
      {
        id: "joh",
        name: "Іван",
        chapters: [
          {
            chapter: 3,
            verses: [
              { verse: 16, text: "Бо так возлюбив Бог світ..." },
              { verse: 17, text: "Бо не послав Бог Сина..." }
            ]
          }
        ]
      },
      {
        id: "psa",
        name: "Псалми",
        chapters: [
          {
            chapter: 23,
            verses: [
              { verse: 1, text: "Господь — Пастир мій..." }
            ]
          }
        ]
      }
    ]
  };
  downloadJSON(template, 'bible_template.json');
}

function getVerseForTranslation(transId, bookId, chapter, verse) {
  if (!bookId || !chapter || !verse) return null;
  var t = bibleTranslations[transId];
  if (!t || !t.books) return null;
  // Пряме співпадіння ідентифікатора книги
  var books = t.books[bookId] ? t.books : null;
  // Якщо конкретний переклад імпортувався з іншим внутрішнім ідентифікатором
  // книги (напр. інша схема нумерації Zefania), шукаємо той самий bookId
  // через загальний нормалізатор — інакше цей ОДИН переклад мовчки не знаходив
  // би жодного вірша, хоча решта перекладів працюють.
  if (!books && typeof fmtBookId === 'function') {
    var wantedNorm = fmtBookId(bookId) || bookId;
    var foundKey = Object.keys(t.books).find(function(k) { return (fmtBookId(k) || k) === wantedNorm; });
    if (foundKey) bookId = foundKey;
  }
  if (!t.books[bookId]) return null;
  var ch = t.books[bookId][chapter] || t.books[bookId][String(chapter)];
  if (!ch) return null;
  return ch[verse] || ch[String(verse)] || null;
}

function getTranslationName(transId) {
  if (!transId || transId === 'none') return null;
  return bibleTranslations[transId] ? bibleTranslations[transId].name : transId;
}

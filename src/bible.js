// ============================================================
// БІБЛІЯ — показ, навігація, пошук — винесено з index.html у модуль.
// Завантажується ПІСЛЯ song-display.js. Наприкінці: перевизначення
// searchBible (повна версія) + виклик initBibleBooks() (перенесено з INIT).
// ============================================================
// ============================================================
// БІБЛІЯ
// ============================================================
// Книги беруться з активного імпортованого перекладу.
// Без імпортованих перекладів список порожній — з підказкою для користувача.
function initBibleBooks() {
  var sel = document.getElementById('bibleBook');
  if (!sel) return;
  sel.innerHTML = '<option value="">Книга...</option>';
  // Може викликатись до ініціалізації bibleTranslations (var піднімається як undefined)
  if (typeof bibleTranslations === 'undefined' || !bibleTranslations) return;
  var t = bibleTranslations[currentTranslationId];
  if (!t) return;
  Object.keys(t.books).forEach(function(bookId) {
    var opt = document.createElement('option');
    opt.value = bookId;
    opt.textContent = getBookName(bookId);
    sel.appendChild(opt);
  });
}

function updateChapters() {
  var bookId = document.getElementById('bibleBook').value;
  var sel = document.getElementById('bibleChapter');
  sel.innerHTML = '<option value="">Глава...</option>';
  document.getElementById('bibleVerse').innerHTML = '<option value="">Вірш...</option>';
  if (!bookId) return;
  currentBibleBook = bookId;
  var count = 0;

  var t = bibleTranslations[currentTranslationId];
  if (t && t.books[bookId]) {
    count = Object.keys(t.books[bookId]).length;
  }

  for (var i = 1; i <= count; i++) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    sel.appendChild(opt);
  }
}

function updateVerses() {
  var ch = document.getElementById('bibleChapter').value;
  var sel = document.getElementById('bibleVerse');
  var preview = document.getElementById('chapterPreview');
  sel.innerHTML = '<option value="">Вірш...</option>';
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  if (!ch) return;
  currentBibleChapter = parseInt(ch);
  var count = 30;

  var t = bibleTranslations[currentTranslationId];
  if (t && t.books[currentBibleBook] && t.books[currentBibleBook][currentBibleChapter]) {
    count = Object.keys(t.books[currentBibleBook][currentBibleChapter]).length;
  }


  for (var i = 1; i <= count; i++) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    sel.appendChild(opt);
  }

  // Другий селектор «по вірш» — ті самі вірші + «— один» (діапазон вимкнено)
  var selTo = document.getElementById('bibleVerseTo');
  if (selTo) {
    selTo.innerHTML = '<option value="">— один</option>';
    for (var j = 1; j <= count; j++) {
      var o2 = document.createElement('option');
      o2.value = j; o2.textContent = j;
      selTo.appendChild(o2);
    }
  }
  currentBibleVerseTo = null;

  renderChapterPreview();
}

// Показує всі вірші обраної глави одразу, щоб не гортати випадаючий список
// наосліп — перші ~5 видно без прокрутки, решта глави доступна прокруткою.
function renderChapterPreview() {
  var preview = document.getElementById('chapterPreview');
  if (!preview || !currentBibleBook || !currentBibleChapter) return;
  var t = bibleTranslations[currentTranslationId];
  var chapterData = t && t.books[currentBibleBook] && t.books[currentBibleBook][currentBibleChapter];
  if (!chapterData) { preview.style.display = 'none'; preview.innerHTML = ''; return; }

  var nums = Object.keys(chapterData).map(Number).sort(function(a, b) { return a - b; });
  if (!nums.length) { preview.style.display = 'none'; preview.innerHTML = ''; return; }

  var html = '';
  nums.forEach(function(v) {
    html += '<div class="verse-item" style="padding:5px 8px;margin-bottom:3px" onclick="goToVerse(\''
      + currentBibleBook + '\',' + currentBibleChapter + ',' + v + ')">'
      + '<span class="vlabel">' + v + '</span> '
      + '<span class="vtext">' + escHtml(String(chapterData[v]).slice(0, 140)) + '</span>'
      + '</div>';
  });
  preview.innerHTML = html;
  preview.style.display = 'block';
}

function selectBibleVerse() {
  var v = document.getElementById('bibleVerse').value;
  if (!v || !currentBibleBook || !currentBibleChapter) return;
  currentBibleVerseNum = parseInt(v);
  var r = verseRange();
  currentBibleVerseTo = r.to > r.from ? r.to : null;
  var ref = currentBibleRef();
  var text = getVerseRangeText(null, currentBibleBook, currentBibleChapter, r.from, r.to)
             || '(вірш не знайдено у поточному перекладі)';
  showBibleVerse(ref, text);
}

function showBibleVerse(ref, text) {
  document.getElementById('bibleRef').textContent = ref;
  document.getElementById('bibleDisplay').textContent = text;
  document.getElementById('biblePreviewText').style.color = '#fff';
  document.getElementById('biblePreviewText').style.fontSize = '12px';
  document.getElementById('biblePreviewText').textContent = text;
}

// Синхронізує селектори Книга/Глава/Вірш і завантажує текст —
// використовується при кліку з пошуку (по книгах або по тексту) і при ◀▶
function goToVerse(bookId, chapter, verseNum, verseTo) {
  currentBibleBook = bookId;
  currentBibleChapter = chapter;
  currentBibleVerseNum = verseNum;

  // 1. Встановити книгу і перегенерувати глави
  document.getElementById('bibleBook').value = bookId;
  updateChapters();

  // 2. Встановити главу і перегенерувати вірші
  document.getElementById('bibleChapter').value = chapter;
  updateVerses();

  // 3. Встановити вірш
  document.getElementById('bibleVerse').value = verseNum;

  // Діапазон: якщо передано кінцевий вірш — відновлюємо «по вірш» (updateVerses його скинув)
  var hasRange = verseTo && verseTo > verseNum;
  if (hasRange) {
    var toEl = document.getElementById('bibleVerseTo');
    if (toEl) toEl.value = verseTo;
    currentBibleVerseTo = verseTo;
  }

  // 4. Показати текст у прев'ю (враховуючи діапазон)
  var ref = currentBibleRef();
  var text = getVerseRangeText(null, bookId, chapter, verseNum, hasRange ? verseTo : verseNum)
             || '(вірш не знайдено у поточному перекладі)';
  showBibleVerse(ref, text);
  // 5. Якщо Біблія В ЕФІРІ — оновлюємо ВСЕ, що показує вірш: і звичайний вивід
  //    (він потрапляє на всі екрани), і виходи з оформленням. Раніше оновлювалось
  //    лише останнє — тому проектор «застрягав» на старому вірші.
  if (lastLiveSource === 'bible') {
    var did = false;
    // Порядок важливий: спершу загальний вивід (він іде на проектор+трансляцію),
    // потім конкретні екрани перезаписують себе своїм виглядом.
    if (lastLivePlain) { sendToProjectorWin(text, ref); did = true; }
    if (lastLiveGraphics && typeof bibleReplayGraphics === 'function') { bibleReplayGraphics(); did = true; }
    if (lastLiveMulti) {
      var doneMulti = false;
      if (typeof multiReplay === 'function') doneMulti = multiReplay();
      if (!doneMulti && typeof sendMultiTransToProjector === 'function') sendMultiTransToProjector();
      did = true;
    }
    if (!did) sendToProjectorWin(text, ref);
  }
  saveAppState();
}

function searchBible() {
  var q = document.getElementById('bibleSearch').value.trim();
  var list = document.getElementById('bibleResults');
  list.innerHTML = '';
  if (q.length < 3) return;

  if (!currentTranslationId || !bibleTranslations[currentTranslationId]) {
    list.innerHTML = '<div class="result-item text-muted">Спершу імпортуй переклад Біблії у вкладці «Імпорт даних»</div>';
    return;
  }
  var scored = fuzzySearchIndexed(q, currentTranslationId, 20);

  if (!scored.length) {
    list.innerHTML = '<div class="result-item text-muted">Нічого не знайдено</div>';
    return;
  }
  scored.forEach(function(item) {
    var key = item.key;
    var parts = key.split('.');
    var ref = getBookName(parts[0]) + ' ' + parts[1] + ':' + parts[2];
    var text = item.text;
    var div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = '<div class="sub" style="color:var(--gold)">' + ref + '</div>' + escHtml(text.substring(0,80)) + (text.length>80?'…':'');
    div.onclick = function() {
      goToVerse(parts[0], parseInt(parts[1]), parseInt(parts[2]));
    };
    list.appendChild(div);
  });
}


// Вивід вірша Біблії З ГРАФІКОЮ. Визначено тут, поруч із кнопкою, щоб не залежати
// від порядку завантаження extras.js. Бере САМЕ вірш (не обрану пісню).
// target: 0 = всі виходи, 1..4 = конкретний вихід


// «Трансляція завжди з графікою»: вихід 2 отримує оформлений текст автоматично,
// а проектор — звичайний. Тоді для служби достатньо однієї кнопки «На проектор».
function setStreamAlwaysGraphics(on) {
  if (typeof setOutputRoute === 'function') {
    setOutputRoute(2, on ? 'graphics' : 'mirror');
  }
  if (typeof syncStreamGfxToggle === 'function') syncStreamGfxToggle();   // друга вкладка теж бачить зміну
  if (typeof notify === 'function') {
    notify(on ? '🎬 Трансляція: оформлений текст автоматично'
              : 'Трансляція: те саме, що на проекторі');
  }
}
function syncStreamGfxToggle() {
  // Один і той самий глобальний перемикач видно у двох вкладках (Пісні й Біблія) —
  // тримаємо обидва чекбокси в однаковому стані.
  var on = false;
  try { on = !!(state && state.outputRoutes && state.outputRoutes[2] === 'graphics'); } catch (e) {}
  ['bibStreamGfx', 'songStreamGfx'].forEach(function(id) {
    var box = document.getElementById(id);
    if (box) box.checked = on;
  });
}

// Швидкий перемикач вигляду графіки прямо з вкладки «Біблія»
function bibleSetLayout(mode) {
  if (typeof setGraphicsLayout === 'function') setGraphicsLayout(mode);
  else if (typeof state !== 'undefined' && state.graphicsSettings) state.graphicsSettings.layout = mode;
  syncBibleLayoutButtons();
  // якщо вірш уже в ефірі з графікою — одразу перемальовуємо
  if (lastLiveSource === 'bible' && lastLiveGraphics) bibleReplayGraphics();
}
function syncBibleLayoutButtons() {
  var cur = 'full';
  try { cur = (state && state.graphicsSettings && state.graphicsSettings.layout) || 'full'; } catch (e) {}
  var f = document.getElementById('bibLayoutFull');
  var l = document.getElementById('bibLayoutLower');
  if (f) f.className = 'btn btn-sm ' + (cur === 'full' ? 'btn-primary' : 'btn-ghost');
  if (l) l.className = 'btn btn-sm ' + (cur === 'lower' ? 'btn-primary' : 'btn-ghost');
}

function sendBibleWithGraphics(target) {
  // Запам'ятовуємо, де вже показано: щоб гортання оновлювало ВСІ ці екрани,
  // а не лише той, куди натиснули востаннє.
  if (target === 0) {
    lastLiveGraphicsTargets = [0];
  } else {
    if (lastLiveGraphicsTargets.indexOf(0) >= 0) lastLiveGraphicsTargets = [];
    if (lastLiveGraphicsTargets.indexOf(target) < 0) lastLiveGraphicsTargets.push(target);
  }
  lastLiveGraphicsTarget = target;
  bibleGraphicsTo([target]);
}

// Повторний вивід під час гортання — на всі екрани, де вірш уже показано
function bibleReplayGraphics() {
  var list = (lastLiveGraphicsTargets && lastLiveGraphicsTargets.length)
    ? lastLiveGraphicsTargets : [lastLiveGraphicsTarget || 0];
  // true = оновлюємо ЗАЛ напряму. Це повторний вивід того, що вже в ефірі,
  // тому прев'ю тут не потрібне — інакше при гортанні зал завмирав би.
  bibleGraphicsTo(list, true);
}

function bibleGraphicsTo(targets, _fromGoLive) {
  var refEl = document.getElementById('bibleRef');
  var txtEl = document.getElementById('bibleDisplay');
  var ref = refEl ? String(refEl.textContent || '').trim() : '';
  var text = txtEl ? String(txtEl.textContent || '').trim() : '';
  if (!text || text === '—' || text.indexOf('Оберіть вірш') === 0) {
    if (typeof notify === 'function') notify('⚠️ Спершу обери вірш');
    return;
  }
  lastLiveSource = 'bible';
  lastLiveGraphics = true;
  // Знімаємо з мульти-режиму ЛИШЕ ті екрани, куди зараз виводимо графіку.
  // Решта екранів далі показують свої переклади й оновлюються при гортанні.
  try {
    if (state && Array.isArray(state.multiLive)) {
      state.multiLive = state.multiLive.filter(function(x) {
        return (targets || []).indexOf(x) < 0 && (targets || []).indexOf(0) < 0;
      });
      lastLiveMulti = state.multiLive.length > 0;
    }
  } catch (e) {}
  if (typeof exitServicePlan === 'function') exitServicePlan();

  // Якщо оформлення недоступне — виводимо звичайним текстом, а не падаємо
  if (typeof getGraphicsHTML !== 'function') {
    if (typeof notify === 'function') notify('Графіка недоступна — вивів звичайним текстом');
    lastLiveGraphics = false;
    sendToProjectorWin(text, ref);
    return;
  }

  var payload = { html: text.replace(/\n/g, '<br>'), ref: ref };
  if (typeof withSecondLang === 'function') payload = withSecondLang(payload);   // 2-га і 3-тя мова
  // Якщо серед цілей є вихід із хромакеєм — робимо фон напівпрозорим
  // (керується повзунком «Прозорість фону для трансляції»).
  var alpha;
  try {
    var hasChroma = (targets || []).some(function(t) {
      if (t === 0) return false;
      return state && state.outputChroma && state.outputChroma[t] && state.outputChroma[t] !== 'none';
    });
    if (hasChroma && typeof streamBgAlpha === 'function') alpha = streamBgAlpha();
  } catch (e) {}
  var html = getGraphicsHTML(payload.html, payload.ref, alpha);

  // Режим «Спершу прев'ю»: не виводимо одразу в зал, а кладемо у прев'ю.
  // Раніше кнопки «З графікою» обходили цей режим і йшли просто в ефір.
  try {
    if (!_fromGoLive && typeof state !== 'undefined' && state &&
        state.liveMode === 'staged' && !state.goingLive && typeof stageContent === 'function') {
      stageContent({
        kind: 'htmlraw',
        html: html,
        label: (ref || 'Вірш') + ' — з графікою',
        ref: ref,
        gfxTargets: (targets || []).slice()      // запам'ятовуємо, на які екрани
      });
      if (typeof notify === 'function') notify('📋 У прев\'ю — натисни «В ЕФІР»');
      return;
    }
  } catch (e) {}

  var sent = 0;
  (targets || []).forEach(function(t) {
    // Прозорість рахуємо ОКРЕМО для кожного виходу: проектор (без хромакею) —
    // суцільний фон, трансляція (з хромакеєм) — напівпрозорий. Раніше alpha була
    // спільна, тож при виводі на обидва один із екранів отримував чужий фон.
    var aT;
    try {
      if (t > 0 && state && state.outputChroma && state.outputChroma[t] && state.outputChroma[t] !== 'none' && typeof streamBgAlpha === 'function') {
        aT = streamBgAlpha();
      }
    } catch (e) {}
    var ht = getGraphicsHTML(payload.html, payload.ref, aT);
    if (t === 0 && typeof doSendHTML === 'function') { doSendHTML(ht, 'Біблія з графікою'); sent++; }
    else if (t > 0 && typeof sendHTMLToOutputN === 'function') { sendHTMLToOutputN(t, ht, 'Біблія з графікою'); sent++; }
  });
  if (!sent) { sendToProjectorWin(text, ref); return; }

  if (typeof notify === 'function') notify('✝ ' + (ref || 'Вірш') + ' — з графікою');
}

function sendBibleToProjector() {
  var ref = document.getElementById('bibleRef').textContent;
  var text = document.getElementById('bibleDisplay').textContent;
  if (!text || text === 'Оберіть вірш зліва або знайдіть через пошук') return;
  lastLiveSource = 'bible';   // тепер стрілки гортатимуть Біблію, а не пісню
  lastLiveGraphics = false;   // цей вивід — простим текстом
  if (typeof exitServicePlan === 'function') exitServicePlan();   // вийшли з плану служби
  lastLivePlain = true;
  // Звичайний вивід іде на проектор і трансляцію — з мульти-режиму знімаємо саме їх
  try {
    if (state && Array.isArray(state.multiLive)) {
      state.multiLive = state.multiLive.filter(function(x) { return x !== 1 && x !== 2; });
      lastLiveMulti = state.multiLive.length > 0;
    }
  } catch (e) {}
  sendToProjectorWin(text, ref);
}

function prevBibleVerse() {
  if (!currentBibleBook || !currentBibleChapter || !currentBibleVerseNum) return;
  var r = verseRange();
  var size = r.to - r.from + 1;              // розмір блоку (1 = один вірш)
  if (r.from <= 1) return;
  var newFrom = Math.max(1, r.from - size);
  var newTo = size > 1 ? (newFrom + size - 1) : 0;
  goToVerse(currentBibleBook, currentBibleChapter, newFrom, newTo > newFrom ? newTo : undefined);
}

function nextBibleVerse() {
  if (!currentBibleBook || !currentBibleChapter || !currentBibleVerseNum) return;
  var r = verseRange();
  var size = r.to - r.from + 1;
  var count = chapterVerseCount();
  var newFrom = r.from + size;               // наступний блок такого ж розміру
  if (count && newFrom > count) return;      // не виходимо за межі глави
  var newTo = size > 1 ? (count ? Math.min(newFrom + size - 1, count) : newFrom + size - 1) : 0;
  goToVerse(currentBibleBook, currentBibleChapter, newFrom, newTo > newFrom ? newTo : undefined);
}

// searchBible: повна версія (пошук по імпортованому перекладу) — має бути
// ПІСЛЯ оголошення простої версії, тож перевизначаємо в кінці модуля.
searchBible = function() {
  var q = document.getElementById('bibleSearch').value.trim();
  var list = document.getElementById('bibleResults');
  list.innerHTML = '';
  if (q.length < 3) return;
  var found = searchBibleInTranslation(q);
  if (!found.length) {
    list.innerHTML = '<div class="result-item text-muted">Нічого не знайдено</div>';
    return;
  }
  found.slice(0, 20).forEach(function(item) {
    var parts = item.key.split('.');
    var ref = getBookName(parts[0]) + ' ' + parts[1] + ':' + parts[2];
    var div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = '<div class="sub" style="color:var(--gold)">'+ref+'</div>' + escHtml(item.text.substring(0,80)) + (item.text.length>80?'…':'');
    div.onclick = function() {
      goToVerse(parts[0], parseInt(parts[1]), parseInt(parts[2]));
    };
    list.appendChild(div);
  });
};

// Ініціалізація списку книг (перенесено зі стартового INIT index.html):
initBibleBooks();

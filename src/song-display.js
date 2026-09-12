// ============================================================
// ПІСНІ: показ і навігація (selectSong / nextVerse / sendToProjector /
// аранжування-mini) — винесено з index.html. Завантажується ПІСЛЯ
// song-edit.js. Пошук пісень і fuzzy-двигун лишились в index.html.
// ============================================================
// ============================================================
// ВИВІД ПІСНІ НА КОНКРЕТНИЙ ВИХІД
//
// Раніше пісня йшла лише на ВСІ виходи одразу (sendToProjector →
// sendToProjectorWin). Тепер той самий адресний патерн, що вже є в
// Біблії/H2R/Медіа/QR: кнопка на кожен вихід, 🔴 коли там в ефірі, і
// «✕ Прибрати» лише для активних.
//
// Свідомо перевикористовуємо buildTextHTML + sendHTMLToOutputN — ті самі,
// якими користується маршрут «text» у pv2PushToOutput. Тобто пісня на
// виході виглядатиме точно так само, як досі, і автоматично отримує
// захист від «повернення після очищення» (лічильник поколінь у
// sendHTMLToOutputN).
// ============================================================
var songLiveMap = { 1: false, 2: false, 3: false, 4: false };

function songCurrentPayload() {
  if (!selectedSong) return null;
  var text = selectedSong.verses[selectedVerseIdx];
  if (text == null) return null;
  // Кінець пісні — той самий маркер ***, що й у sendToProjector, щоб
  // команда бачила останній слайд незалежно від способу виводу.
  if (selectedVerseIdx === selectedSong.verses.length - 1) text += '\n\n***';
  var w = (typeof withSecondLang === 'function')
    ? withSecondLang({ html: (typeof stripChords === 'function' ? stripChords(String(text)) : String(text)).replace(/\n/g, '<br>'), ref: '' })
    : { html: String(text).replace(/\n/g, '<br>'), ref: '' };
  return { text: w.html, ref: w.ref || '' };
}

function sendSongToOutput(n) {
  if (!selectedSong) { if (typeof notify === 'function') notify('⚠️ Спершу обери пісню'); return; }
  var c = songCurrentPayload();
  if (!c) return;
  try {
    var s = state.textSettings[n] || state.textSettings[1];
    var hasChroma = !!(state.outputChroma && state.outputChroma[n] && state.outputChroma[n] !== 'none');
    sendHTMLToOutputN(n, buildTextHTML(s, c, hasChroma), null);
    songLiveMap[n] = true;
    lastLiveSource = 'song';
    if (typeof pv2SetOutputStatus === 'function') pv2SetOutputStatus(n, '🎵 ' + (selectedSong.title || 'Пісня'));
    renderSongOutputRow();
    if (typeof notify === 'function') notify('🎵 ' + (selectedSong.title || 'Пісня') + ' → ' + OUT_NAME[n]);
  } catch (e) {
    console.warn('sendSongToOutput:', e);
    if (typeof notify === 'function') notify('⚠️ Не вдалось надіслати на ' + OUT_NAME[n]);
  }
}

function sendSongToOutputs(targets) {
  (targets || []).forEach(function (n) { sendSongToOutput(n); });
}

// ============================================================
// ПІСНЯ З ОФОРМЛЕННЯМ («Графіка») — той самий движок getGraphicsHTML,
// яким уже користується Біблія (bibleGraphicsTo в bible.js), а не голий
// themed-текст (buildTextHTML вище). Пісня отримує той самий фон/шаблон/
// анімацію, що оператор уже налаштував у «Оформлення → Графіка» —
// замість того, щоб пісня й вірші виглядали по-різному без причини.
// Свідомо НЕ окремий GDD-шаблон (templates/gdd/verse.html): getGraphicsHTML
// вже вміє layout «lower» (смуга внизу, камера видно) — той самий випадок,
// що для мульти-перекладу довелося будувати окремо, тут уже готовий.
// ============================================================
function songTextForGraphics() {
  if (!selectedSong) return null;
  var text = selectedSong.verses[selectedVerseIdx];
  if (text == null) return null;
  if (selectedVerseIdx === selectedSong.verses.length - 1) text += '\n\n***';
  return (typeof stripChords === 'function') ? stripChords(String(text)) : String(text);
}

function songGraphicsTo(targets, _fromGoLive) {
  if (!selectedSong) { if (typeof notify === 'function') notify('⚠️ Спершу обери пісню'); return; }
  var text = songTextForGraphics();
  if (!text) return;
  var ref = selectedSong.title || '';

  if (typeof getGraphicsHTML !== 'function') {
    if (typeof notify === 'function') notify('Графіка недоступна — вивів звичайним текстом');
    sendToProjectorWin(text, ref);
    return;
  }

  lastLiveSource = 'song';
  lastLiveGraphics = true;
  if (typeof exitServicePlan === 'function') exitServicePlan();

  var html0 = esc(String(text || '')).replace(/\n/g, '<br>');

  // Режим «Спершу прев'ю» — той самий обхід, що й bibleGraphicsTo: кнопка
  // «З графікою» не має проскакувати повз прев'ю, коли решта показу так робить.
  if (!_fromGoLive && typeof state !== 'undefined' && state &&
      state.liveMode === 'staged' && !state.goingLive && typeof stageContent === 'function') {
    stageContent({
      kind: 'htmlraw',
      html: getGraphicsHTML(html0, ref),
      label: (ref || 'Пісня') + ' — з графікою',
      ref: ref,
      gfxTargets: (targets || []).slice()
    });
    if (typeof notify === 'function') notify('📋 У прев\'ю — натисни «В ЕФІР»');
    return;
  }

  var sent = 0;
  (targets || []).forEach(function (t) {
    var aT;
    try {
      if (t > 0 && state && state.outputChroma && state.outputChroma[t] && state.outputChroma[t] !== 'none' && typeof outputBgAlpha === 'function') {
        aT = outputBgAlpha(t);
      }
    } catch (e) {}
    var ht = getGraphicsHTML(html0, ref, aT);
    if (t === 0 && typeof doSendHTML === 'function') { doSendHTML(ht, 'Пісня з графікою'); sent++; }
    else if (t > 0 && typeof sendHTMLToOutputN === 'function') { sendHTMLToOutputN(t, ht, 'Пісня з графікою'); sent++; }
  });
  if (!sent) { sendToProjectorWin(text, ref); return; }
  if (typeof notify === 'function') notify('🎵 ' + (ref || 'Пісня') + ' — з графікою');
}

function clearSongFrom(n) {
  if (typeof pv2ClearOutput === 'function') pv2ClearOutput(n);
  songLiveMap[n] = false;
  renderSongOutputRow();
}

function renderSongOutputRow() {
  var el = document.getElementById('songOutputRow');
  if (!el) return;
  var outBtns = [1, 2, 3, 4].map(function (n) {
    var live = !!songLiveMap[n];
    var nm = (typeof OUT_NAME !== 'undefined' && OUT_NAME[n]) ? OUT_NAME[n] : ('Вихід ' + n);
    return '<button class="btn ' + (live ? 'btn-success' : 'btn-ghost') + ' btn-sm" onclick="sendSongToOutput(' + n + ')">' +
      (live ? '🔴 ' : '') + escHtml(nm) + '</button>';
  }).join('');
  var clearBtns = [1, 2, 3, 4].filter(function (n) { return songLiveMap[n]; }).map(function (n) {
    var nm = (typeof OUT_NAME !== 'undefined' && OUT_NAME[n]) ? OUT_NAME[n] : ('Вихід ' + n);
    return '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="clearSongFrom(' + n + ')">✕ ' + escHtml(nm) + '</button>';
  }).join('');
  // Кнопки виходів і «прибрати» в ОДНОМУ рядку — як у Біблії та H2R.
  el.innerHTML = '<div class="flex" style="gap:5px;flex-wrap:wrap;align-items:center">' + outBtns + clearBtns + '</div>' +
    '<div class="flex mt8" style="gap:5px;flex-wrap:wrap">' +
      '<button class="btn btn-primary btn-sm" onclick="sendToProjector()">🖋 На всі</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="sendSongToOutputs([1,2])">2 виводи</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="sendSongToOutputs([1,2,3,4])">Усі 4 виводи</button>' +
    '</div>' +
    '<div class="flex mt8" style="gap:5px;flex-wrap:wrap">' +
      '<button class="btn btn-success btn-sm" onclick="songGraphicsTo([0])" title="Той самий фон/шаблон, що вже налаштовано в Оформлення → Графіка">🎨 З графікою (на всі)</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="songGraphicsTo([1,2])">🎨 2 виводи</button>' +
    '</div>';
}

function selectSong(song) {
  selectedSong = song;
  selectedVerseIdx = 0;
  // Нова пісня — рядок виводу перемальовуємо (кнопки мають бути активні)
  if (typeof renderSongOutputRow === 'function') renderSongOutputRow();
  // Якщо для пісні ввімкнено «приспів після кожного» — застосувати аранжування одразу
  if (typeof ensureChorusEach === 'function') ensureChorusEach(song);
  document.getElementById('songTitle').textContent = '🎵 ' + song.title;
  var container = document.getElementById('songVerses');
  container.innerHTML = '';
  song.verses.forEach(function(v, i) {
    var div = document.createElement('div');
    div.className = 'verse-item' + (i === 0 ? ' active' : '');
    div.id = 'verse-' + i;
    div.innerHTML = '<div class="vlabel">Куплет ' + (i+1) +
      ' <button class="btn btn-ghost btn-sm" style="padding:0 6px;font-size:11px" onclick="event.stopPropagation(); songListAddPart(' + i + ')" title="Додати в аранжування">➕</button></div>' +
      '<div class="vtext">' + escHtml(v) + '</div>';
    div.onclick = function() { selectVerse(i); };
    container.appendChild(div);
  });
  document.getElementById('verseActions').style.display = 'flex';
  if (typeof renderSongOrderMini === 'function') renderSongOrderMini();
  updatePreview(song.verses[0]);
  saveAppState();
}

// Ярлики до РІДНОЇ системи аранжування (state.orders) — зручний вхід просто зі
// списку пісень. НЕ окреме сховище: пишемо в ту саму state.orders, що й вкладка
// «Пісня», тож стрілки й пульт уже гортають за цим порядком (songStep). Без дублю.
function songListAddPart(i) { if (typeof orderAdd === 'function') orderAdd(i); renderSongOrderMini(); }
function songListRemovePart(pos) { if (typeof orderRemoveAt === 'function') orderRemoveAt(pos); renderSongOrderMini(); }
function songListResetOrder() { if (typeof orderReset === 'function') orderReset(); renderSongOrderMini(); }
// Пакетування (rafDebounce — наявний ідіом проєкту, як updateLivePanels):
// ця функція викликалась із багатьох місць підряд, і кожен виклик повністю
// перебудовував список. Тепер підряд ідучі виклики склеюються в один
// перемальовок на кадр.
// Обгортка — саме function-декларація з ЛІНИВОЮ ініціалізацією, а не
// `const renderSongOrderMini = rafDebounce(...)`: const створив би temporal dead zone,
// і будь-який виклик до цього рядка впав би з «Cannot access before
// initialization» — рівно той баг, що вже двічі ловився в цьому проєкті
// (loadDisplayToggles). Function-декларація піднімається (hoisting), тож
// порядок завантаження файлів більше не має значення.
var _renderSongOrderMiniDeb = null;
function renderSongOrderMini() {
  if (!_renderSongOrderMiniDeb) _renderSongOrderMiniDeb = rafDebounce(_renderSongOrderMiniNow);
  return _renderSongOrderMiniDeb.apply(null, arguments);
}
function _renderSongOrderMiniNow() {
  var el = document.getElementById('songOrderMini');
  if (!el) return;
  if (!selectedSong) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  var key = (typeof songKey === 'function') ? songKey(selectedSong) : ('ord_' + selectedSong.id);
  var order = (state.orders && state.orders[key]) || [];
  var chips;
  if (order.length) {
    chips = order.map(function(vi, pos) {
      var label = 'Куплет ' + (vi + 1), style = 'border:1px solid var(--border);', xcol = 'var(--red)';
      if (typeof partBadge === 'function') { var b = partBadge(selectedSong, vi); label = b.label; style = 'background:' + b.color + ';color:#fff;'; xcol = '#fff'; }
      var active = (state._slideSong === key && state.slideIdx === pos);   // цей слайд зараз в ефірі
      if (active) style += 'box-shadow:0 0 0 2px #22c55e;';
      return '<span style="display:inline-flex;align-items:center;gap:3px;margin:2px;padding:3px 6px;border-radius:5px;font-size:11px;' + style + '">' +
        (active ? '▶ ' : '') + escHtml(label) + '<span onclick="songListRemovePart(' + pos + ')" style="cursor:pointer;color:' + xcol + '">✕</span></span>';
    }).join('');
  } else {
    chips = '<span style="font-size:11px;color:var(--text2)">Порядок не заданий — тисни ➕ біля куплетів (інакше грає підряд)</span>';
  }
  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">' +
    '<b style="font-size:12px">🎼 Аранжування</b>' +
    (order.length ? '<button class="btn btn-ghost btn-sm" onclick="songListResetOrder()">↺ Скинути</button>' : '') +
    '<span style="font-size:10px;color:var(--text2)">спільне з вкладкою «Пісня»</span>' +
    '</div><div>' + chips + '</div>' +
    '<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;cursor:pointer">' +
      '<input type="checkbox" style="width:15px;height:15px;cursor:pointer" ' + (state.chorusEach && state.chorusEach[key] ? 'checked' : '') + ' onchange="toggleChorusEach(this.checked); renderSongOrderMini()">' +
      '<span>🔁 <b>Приспів після кожного куплета</b></span></label>' +
    '<select onchange="applyArrangePreset(this.value); this.value=\'\'; renderSongOrderMini()" style="width:100%;margin-top:5px;background:var(--panel2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-size:11px;cursor:pointer">' +
      '<option value="">📋 Готове аранжування…</option>' +
      '<option value="each">Приспів після кожного куплета</option>' +
      '<option value="end">Приспів лише в кінці</option>' +
      '<option value="frame">Приспів спочатку і в кінці</option>' +
      '<option value="last2">Приспів після кожного + останній куплет двічі</option>' +
      '<option value="verses">Тільки куплети (без приспіву)</option>' +
      '<option value="plain">↺ Усі підряд (скинути порядок)</option>' +
    '</select>';
}

function selectVerse(idx) {
  selectedVerseIdx = idx;
  document.querySelectorAll('.verse-item').forEach(function(el, i) {
    el.className = 'verse-item' + (i === idx ? ' active' : '');
  });
  if (selectedSong) updatePreview(selectedSong.verses[idx]);
  saveAppState();
}


// Скидання пісні: прибирає її з прев'ю і з-під стрілок.
// Потрібне, коли пісню вибрали, а далі ведуть Біблію — щоб стрілки
// випадково не перемкнули зал назад на пісню.
function resetSongSelection() {
  selectedSong = null;
  selectedVerseIdx = 0;
  try {
    if (typeof state !== 'undefined' && state) {
      state.preview = null;
      if (state.service) state.service.idx = -1;      // і з плану теж виходимо
    }
  } catch (e) {}
  if (lastLiveSource === 'song') { lastLiveSource = null; lastLiveGraphics = false; }
  document.querySelectorAll('.verse-item').forEach(function(el) { el.className = 'verse-item'; });
  var prev = document.getElementById('versePreview');
  if (prev) prev.textContent = '';
  if (typeof updateLivePanels === 'function') updateLivePanels();
  if (typeof saveAppState === 'function') saveAppState();
  if (typeof notify === 'function') notify('✕ Прев\'ю скинуто — стрілки більше не гортають пісню');
}

function sendToProjector() {
  if (!selectedSong) return;
  var text = selectedSong.verses[selectedVerseIdx];
  // Кінець пісні (без аранжування): останній куплет — додаємо *** як сигнал
  // команді/оператору, що це останній слайд.
  if (selectedVerseIdx === selectedSong.verses.length - 1) text += '\n\n***';
  // Пісня заміщає Біблію на екранах — тож треба скинути ОБИДВА списки
  // відстеження, а не лише прапорці. Інакше індикатор і стрілки ◀▶
  // далі вважали б, що на якомусь виході живий вірш.
  if (typeof resetOutputTracking === 'function') resetOutputTracking('song');
  else { lastLiveSource = 'song'; lastLiveMulti = false; lastLiveGraphics = false; }
  // «На всі» — пісня тепер на кожному виході, індикатори мають це показати
  try { [1,2,3,4].forEach(function(k){ songLiveMap[k] = true; }); renderSongOutputRow(); } catch (e) {}
  if (typeof exitServicePlan === 'function') exitServicePlan();
  sendToProjectorWin(text, '');
}

function prevVerse() {
  if (!selectedSong || selectedVerseIdx <= 0) return;
  selectVerse(selectedVerseIdx - 1);
}

// «На проектор» з урахуванням аранжування: якщо для пісні заданий порядок
// (або ввімкнене розбиття) — стартуємо з ПЕРШОГО слайда аранжування, а не з
// сирого куплета №1. Інакше — звичайне надсилання.
function songSendFirst() {
  var s = (typeof selectedSong !== 'undefined') ? selectedSong : null;
  var arranged = s && typeof songKey === 'function' &&
    ((state.splitCfg && state.splitCfg.on) || (state.orders && state.orders[songKey(s)]));
  if (arranged && typeof songStep === 'function') { state.slideIdx = -1; songStep(1); }
  else sendToProjector();
}

function nextVerse() {
  if (!selectedSong || selectedVerseIdx >= selectedSong.verses.length - 1) return;
  selectVerse(selectedVerseIdx + 1);
}

function updatePreview(text) {
  document.getElementById('previewText').style.color = '#fff';
  document.getElementById('previewText').innerHTML = escHtml(text).replace(/\n/g,'<br>');
}

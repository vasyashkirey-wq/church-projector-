// ============================================================
// ПІСНІ: показ і навігація (selectSong / nextVerse / sendToProjector /
// аранжування-mini) — винесено з index.html. Завантажується ПІСЛЯ
// song-edit.js. Пошук пісень і fuzzy-двигун лишились в index.html.
// ============================================================
function selectSong(song) {
  selectedSong = song;
  selectedVerseIdx = 0;
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
function renderSongOrderMini() {
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
  lastLiveSource = 'song';
  lastLiveMulti = false;
  lastLiveGraphics = false;
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

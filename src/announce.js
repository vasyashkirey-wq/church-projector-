// ============================================================
// ОГОЛОШЕННЯ
// Винесено з index.html для кращої організації коду.
//
// ANN_STYLES, ANN_KEY і announcements навмисно лишені на самому
// початку файлу — за тією ж логікою, що й раніше в index.html:
// щоб вони гарантовано отримали значення незалежно від того, що
// відбувається в решті коду. Оскільки це тепер ОКРЕМИЙ <script>-тег,
// крах в іншому файлі більше не може завадити цьому блоку виконатись
// (кожен <script>-тег — незалежний контекст виконання).
// ============================================================

var ANN_KEY = 'church_announcements';
var announcements = [];

var ANN_STYLES = {
  dark:   { bg: '#000000', titleColor: '#f0c040', bodyColor: '#ffffff', dateColor: '#8b92a8' },
  blue:   { bg: 'linear-gradient(135deg,#0a1628,#1e3a5f)', titleColor: '#f0c040', bodyColor: '#ffffff', dateColor: '#8b92a8' },
  purple: { bg: 'linear-gradient(135deg,#1a0a2e,#3d1155)', titleColor: '#c8a84b', bodyColor: '#ffffff', dateColor: '#8b92a8' },
  gold:   { bg: 'linear-gradient(135deg,#1a0e00,#3d2a00)', titleColor: '#f0c040', bodyColor: '#fff8e0', dateColor: '#c8a84b' },
  green:  { bg: 'linear-gradient(135deg,#0a2010,#1a4a25)', titleColor: '#3ecf8e', bodyColor: '#ffffff', dateColor: '#8b92a8' }
};

function loadAnnouncements() {
  try { announcements = JSON.parse(bigStoreGet(ANN_KEY) || '[]'); } catch(e) { announcements = []; }
  renderAnnounceList();
}

var annEditingId = null;   // id оголошення, яке зараз редагується (null = створюємо нове)

function saveAnnounce() {
  var title = document.getElementById('annTitle').value.trim();
  var body = document.getElementById('annBody').value.trim();
  if (!title && !body) { return; }
  var existing = (annEditingId != null) ? announcements.find(function(a){ return a.id === annEditingId; }) : null;
  if (existing) {
    // Редагування — оновлюємо на місці, а не створюємо дублікат.
    existing.title = title;
    existing.body = body;
    existing.datetime = document.getElementById('annDateTime').value.trim();
    existing.style = document.getElementById('annStyle').value;
  } else {
    announcements.push({
      id: Date.now(),
      title: title,
      body: body,
      datetime: document.getElementById('annDateTime').value.trim(),
      style: document.getElementById('annStyle').value
    });
  }
  safeSet(ANN_KEY, JSON.stringify(announcements));
  renderAnnounceList();
  clearAnnounceForm();
}

function clearAnnounceForm() {
  annEditingId = null;
  document.getElementById('annTitle').value = '';
  document.getElementById('annBody').value = '';
  document.getElementById('annDateTime').value = '';
  updateAnnPreview();
}

function deleteAnnounce(id) {
  announcements = announcements.filter(function(a){ return a.id !== id; });
  safeSet(ANN_KEY, JSON.stringify(announcements));
  renderAnnounceList();
}

function renderAnnounceList() {
  var el = document.getElementById('announceList');
  if (!announcements || !announcements.length) { el.innerHTML = '<p class="text-muted">Немає збережених оголошень</p>'; return; }
  el.innerHTML = '';
  announcements.forEach(function(a) {
    var s = ANN_STYLES[a.style] || ANN_STYLES.dark;
    var div = document.createElement('div');
    div.style.cssText = 'margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden;';
    div.innerHTML =
      '<div style="background:' + (s.bg.indexOf('gradient')>-1 ? s.bg : s.bg) + ';padding:10px 12px">' +
        (a.title ? '<div style="color:'+s.titleColor+';font-weight:700;font-size:13px;margin-bottom:3px">'+escHtml(a.title)+'</div>' : '') +
        (a.body ? '<div style="color:'+s.bodyColor+';font-size:12px;line-height:1.5">'+escHtml(a.body)+'</div>' : '') +
        (a.datetime ? '<div style="color:'+s.dateColor+';font-size:11px;margin-top:4px">📅 '+escHtml(a.datetime)+'</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;padding:8px 10px;background:var(--panel2)">' +
        '<button class="btn btn-success btn-sm" style="flex:1" onclick="sendSavedAnnounce('+a.id+')">▶ На проектор</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="loadAnnounce('+a.id+')">✏️</button>' +
        '<button class="btn btn-ghost btn-sm" title="Посилання для Stream Deck" onclick="copyAnnounceApiLink('+a.id+')">📋</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteAnnounce('+a.id+')">✕</button>' +
      '</div>';
    el.appendChild(div);
  });
}

function loadAnnounce(id) {
  var a = announcements.find(function(x){ return x.id === id; });
  if (!a) return;
  annEditingId = id;
  document.getElementById('annTitle').value = a.title || '';
  document.getElementById('annBody').value = a.body || '';
  document.getElementById('annDateTime').value = a.datetime || '';
  document.getElementById('annStyle').value = a.style || 'dark';
  updateAnnPreview();
}

function updateAnnPreview() {
  var title = document.getElementById('annTitle').value;
  var body = document.getElementById('annBody').value;
  var dt = document.getElementById('annDateTime').value;
  var style = document.getElementById('annStyle').value;
  var s = ANN_STYLES[style] || ANN_STYLES.dark;

  var box = document.getElementById('annPreviewBox');
  box.style.background = s.bg;
  document.getElementById('annPreviewTitle').style.color = s.titleColor;
  document.getElementById('annPreviewTitle').textContent = title;
  document.getElementById('annPreviewBody').style.color = s.bodyColor;
  document.getElementById('annPreviewBody').textContent = body;
  document.getElementById('annPreviewDate').style.color = s.dateColor;
  document.getElementById('annPreviewDate').textContent = dt ? '📅 ' + dt : '';
}

function getAnnounceHTML(ann, outputN) {
  var s = ANN_STYLES[ann.style] || ANN_STYLES.dark;
  var bgStyle = s.bg.indexOf('gradient') > -1
    ? 'background:' + s.bg
    : 'background:' + s.bg;
  var sizes = (state.announceSettings && state.announceSettings[outputN]) || { titleSize: 64, bodySize: 44, dateSize: 32 };
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{margin:0;' + bgStyle + ';min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;}' +
    '#wrap{text-align:center;padding:80px 120px;max-width:1600px;width:100%;opacity:0;transition:opacity .7s;}' +
    '#wrap.show{opacity:1;}' +
    '.title{font-size:' + sizes.titleSize + 'px;font-weight:700;color:' + s.titleColor + ';margin-bottom:24px;text-shadow:0 2px 16px rgba(0,0,0,.5);line-height:1.2;}' +
    '.body{font-size:' + sizes.bodySize + 'px;color:' + s.bodyColor + ';line-height:1.5;text-shadow:0 2px 12px rgba(0,0,0,.5);}' +
    '.datetime{font-size:' + sizes.dateSize + 'px;color:' + s.dateColor + ';margin-top:28px;}' +
    '.divider{width:200px;height:2px;background:rgba(255,255,255,0.2);margin:24px auto;}' +
    '</style></head><body>' +
    '<div id="wrap">' +
    (ann.title ? '<div class="title">' + escHtml(ann.title) + '</div>' : '') +
    (ann.title && ann.body ? '<div class="divider"></div>' : '') +
    (ann.body ? '<div class="body">' + escHtml(ann.body).replace(/\n/g,'<br>') + '</div>' : '') +
    (ann.datetime ? '<div class="datetime">📅 ' + escHtml(ann.datetime) + '</div>' : '') +
    '</div>' +
    '<script>setTimeout(function(){document.getElementById("wrap").classList.add("show");},100);<\/script>' +
    '</body></html>';
}

function sendAnnounceToOutputs(ann, label) {
  // Кожен вихід отримує ОКРЕМУ версію HTML зі своїм розміром тексту
  // (state.announceSettings[1..4]) — а не спільну копію на всі.
  if (typeof sendHTMLToOutputN === 'function') {
    sendHTMLToOutputN(1, getAnnounceHTML(ann, 1), label);
    sendHTMLToOutputN(2, getAnnounceHTML(ann, 2), label);
    // Вихід 3/4 — якщо відкриті, тепер теж зі своїм власним розміром
    // (раніше отримували скопійований розмір проектора).
    [3, 4].forEach(function(n) {
      if (state.outputStates && state.outputStates[n] && state.outputStates[n].open) {
        sendHTMLToOutputN(n, getAnnounceHTML(ann, n), label);
      }
    });
  } else if (typeof sendHTMLToProjector === 'function') {
    sendHTMLToProjector(getAnnounceHTML(ann, 1), label);   // фолбек на старий спосіб
  }
}

function sendAnnounce() {
  var ann = {
    title: document.getElementById('annTitle').value.trim(),
    body: document.getElementById('annBody').value.trim(),
    datetime: document.getElementById('annDateTime').value.trim(),
    style: document.getElementById('annStyle').value
  };
  if (!ann.title && !ann.body) { alert('Додайте заголовок або текст'); return; }
  sendAnnounceToOutputs(ann, ann.title || 'Оголошення');
}

function sendSavedAnnounce(id) {
  var a = announcements.find(function(x){ return x.id === id; });
  if (!a) return;
  sendAnnounceToOutputs(a, a.title || 'Оголошення');
}

// Автоматичне слайд-шоу оголошень по колу — для екрана у фойє перед службою,
// коли нема кому клацати «На проектор» на кожне оголошення вручну.
var _annSlideshowTimer = null;
var _annSlideshowIdx = 0;
function startAnnounceSlideshow() {
  stopAnnounceSlideshow();
  if (!announcements || !announcements.length) { notify('⚠️ Немає збережених оголошень для слайд-шоу'); return; }
  var secInput = document.getElementById('annSlideshowSec');
  var sec = Math.max(3, parseInt(secInput && secInput.value, 10) || 10);
  _annSlideshowIdx = 0;
  var showNext = function() {
    var a = announcements[_annSlideshowIdx % announcements.length];
    sendSavedAnnounce(a.id);
    var status = document.getElementById('annSlideshowStatus');
    if (status) status.textContent = '▶ Показую ' + (_annSlideshowIdx % announcements.length + 1) + '/' + announcements.length + ': «' + a.title + '»';
    _annSlideshowIdx++;
  };
  showNext();
  _annSlideshowTimer = setInterval(showNext, sec * 1000);
  notify('🔄 Слайд-шоу запущено — кожні ' + sec + ' сек');
}
function stopAnnounceSlideshow() {
  if (_annSlideshowTimer) { clearInterval(_annSlideshowTimer); _annSlideshowTimer = null; }
  var status = document.getElementById('annSlideshowStatus');
  if (status) status.textContent = '';
}

// «id» оголошення — просто мітка часу, ніде на екрані не видно, тож без цієї
// кнопки скласти посилання для Stream Deck можна було б лише через код сторінки.
function copyAnnounceApiLink(id) {
  var base = (state.pult && state.pult.url) ? state.pult.url : 'http://[IP]:3939';
  var pin = (state.pult && state.pult.pin) ? '&pin=' + encodeURIComponent(state.pult.pin) : '';
  var url = base + '/api/announce?id=' + id + pin;
  var done = function() { if (typeof notify === 'function') notify('📋 Скопійовано: ' + url); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(done);
  } else { done(); }
}

// Live preview on input
['annTitle','annBody','annDateTime','annStyle'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', updateAnnPreview);
  if (el) el.addEventListener('change', updateAnnPreview);
});

safeInit(loadAnnouncements, 'loadAnnouncements');

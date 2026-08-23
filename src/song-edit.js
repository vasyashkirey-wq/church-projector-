// ============================================================
// ПІСНІ: додавання / редагування / парсинг / список — винесено
// з index.html у модуль. Завантажується ПІСЛЯ slide-ui.js; глобальні.
// (Показ пісні — selectSong/nextVerse — поки лишається в index.html.)
// ============================================================
// ============================================================
// ДОДАТИ ПІСНЮ
// ============================================================
// Парсить текст пісні з holyChurch або подібних сайтів.
// Розпізнає заголовки секцій: "1 куплет:", "Приспів:", "Бридж:", "Інтро:", "Хор:", "Outro:"
// Якщо заголовків немає — ділить по --- або по порожніх рядках між блоками.
function parseSongVerses(raw) {
  // Нормалізуємо переноси рядків
  var text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Маска заголовків секцій (нечутливо до регістру і пробілів)
  var headerRe = /^(\d+\s*)?(куплет|приспів|бридж|bridge|intro|інтро|outro|хор|chorus|verse|refrain|pre-?chorus|розспів)\s*\d*\s*:?\s*$/i;

  var lines = text.split('\n');
  var sections = [];
  var currentLabel = '';
  var currentLines = [];

  function flushSection() {
    var body = currentLines.join('\n').trim();
    if (body) sections.push({ label: currentLabel, text: body });
    currentLines = [];
  }

  var hasHeaders = lines.some(function(l) { return headerRe.test(l.trim()); });

  if (hasHeaders) {
    // Режим: ділимо по заголовках
    lines.forEach(function(line) {
      var trimmed = line.trim();
      if (headerRe.test(trimmed)) {
        flushSection();
        currentLabel = trimmed.replace(/:$/, '').trim();
      } else {
        currentLines.push(line);
      }
    });
    flushSection();
  } else {
    // Режим fallback: якщо в тексті Є явні роздільники --- (саме їх вставляє
    // editSong() при повторному відкритті пісні на редагування) — ділимо
    // ЛИШЕ по них, ігноруючи порожні рядки всередині секції. Інакше секція
    // з кількома строфами (де є власний порожній рядок посеред тексту) при
    // збереженні тихо розбивалась би на дві — саме тому editSong() більше
    // НЕ використовує подвійний перенос рядка як роздільник між секціями.
    // Коли --- немає взагалі (щойно вставлений/новий текст) — ділимо, як і
    // раніше, по подвійних порожніх рядках.
    var blocks = /\n---\n/.test(text) ? text.split(/\n---\n/) : text.split(/\n{2,}/);
    blocks.forEach(function(b) {
      var body = b.trim();
      if (body) sections.push({ label: '', text: body });
    });
  }

  // Прибираємо секції що є лише заголовком без тексту (Інтро без слів і т.п.)
  return sections.filter(function(s) { return s.text.trim().length > 0; });
}

// Форматує секцію для збереження: "Приспів\nРядок 1\nРядок 2"
function formatSection(sec) {
  if (sec.label) {
    return sec.label + '\n' + sec.text;
  }
  return sec.text;
}

function previewParsedVerses() {
  var raw = document.getElementById('newSongVerses').value.trim();
  var preview = document.getElementById('versesPreview');
  var list = document.getElementById('versesPreviewList');
  if (!raw) { preview.style.display = 'none'; return; }

  var sections = parseSongVerses(raw);
  if (!sections.length) { preview.style.display = 'none'; return; }

  preview.style.display = 'block';
  list.innerHTML = '';
  sections.forEach(function(sec, i) {
    var div = document.createElement('div');
    div.style.cssText = 'background:var(--panel2);border:1px solid var(--border);border-radius:7px;padding:8px 10px;';
    var labelHtml = sec.label
      ? '<div style="font-size:10px;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">' + escHtml(sec.label) + '</div>'
      : '<div style="font-size:10px;color:var(--text2);margin-bottom:4px">Секція ' + (i+1) + '</div>';
    div.innerHTML = labelHtml +
      '<div style="font-size:12px;line-height:1.5;white-space:pre-wrap;color:var(--text)">' + escHtml(sec.text) + '</div>';
    list.appendChild(div);
  });
}

// Редагування наявної пісні у тій самій формі. Зберігаємо ТОЙ САМИЙ id,
// тож аранжування (state.orders) і мітки частин (state.partLabels) не злітають.
var editingSongId = null;
function editSong(id) {
  var s = currentSongs.find(function(x){ return x.id === id; });
  if (!s) return;
  editingSongId = id;
  document.getElementById('newSongTitle').value = s.title || '';
  document.getElementById('newSongAuthor').value = s.author || '';
  var bookFld = document.getElementById('newSongBook');
  if (bookFld) bookFld.value = s.songbook || '';
  // verses[] → сирий текст. Для пісень БЕЗ заголовків секцій з'єднуємо через
  // явний роздільник "---", а не подвійний порожній рядок: інакше секція,
  // де оператор сам залишив порожній рядок між строфами, після повторного
  // збереження тихо розпадалась би на дві (parseSongVerses бачив би обидва
  // порожні рядки — свій і роздільник — однаково). Для пісень ІЗ заголовками
  // (кожна секція вже починається з "Приспів"/"1 куплет" і т.п.) роздільник
  // між ними не важливий — парсер ділить по самих заголовках.
  var vs = s.verses || [];
  var hdrRe = /^(\d+\s*)?(куплет|приспів|бридж|bridge|intro|інтро|outro|хор|chorus|verse|refrain|pre-?chorus|розспів)\s*\d*\s*:?\s*$/i;
  var looksHeadered = vs.some(function(v) { return hdrRe.test(String(v).split('\n')[0].trim()); });
  document.getElementById('newSongVerses').value = vs.join(looksHeadered ? '\n\n' : '\n---\n');
  previewParsedVerses();
  var btn = document.getElementById('saveSongBtn');
  if (btn) btn.textContent = '💾 Оновити пісню';
  var ttl = document.getElementById('addSongCardTitle');
  if (ttl) ttl.textContent = '✏️ Редагування: ' + (s.title || '');
  var fld = document.getElementById('newSongTitle');
  if (fld && fld.scrollIntoView) fld.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (fld) fld.focus();
  if (typeof notify === 'function') notify('✏️ Редагування пісні — зміни текст і натисни «Оновити»');
}

function addNewSong() {
  var title = document.getElementById('newSongTitle').value.trim();
  var author = document.getElementById('newSongAuthor').value.trim();
  var bookFld = document.getElementById('newSongBook');
  var songbook = bookFld ? bookFld.value.trim() : '';
  var raw = document.getElementById('newSongVerses').value.trim();
  if (!title) { showMsg('Введіть назву пісні', 'var(--red)'); return; }
  if (!raw) { showMsg('Введіть текст пісні', 'var(--red)'); return; }

  var sections = parseSongVerses(raw);
  if (!sections.length) { showMsg('Не вдалося розпарсити текст', 'var(--red)'); return; }

  var verses = sections.map(formatSection);
  if (editingSongId != null) {
    var ex = currentSongs.find(function(x){ return x.id === editingSongId; });
    if (ex) {
      // Оновлюємо на місці — той самий id, тож аранжування й мітки частин лишаються
      ex.title = title; ex.author = author; ex.songbook = songbook; ex.verses = verses;
      saveSongs(currentSongs);
      showMsg('✓ Пісню «' + title + '» оновлено (' + verses.length + ' секцій)', 'var(--green)');
      clearNewSong();
      renderAllSongs();
      return;
    }
  }
  var newId = Date.now();
  var song = { id: newId, title: title, author: author, songbook: songbook, verses: verses };
  currentSongs.push(song);
  saveSongs(currentSongs);
  showMsg('✓ Пісню "' + title + '" збережено (' + verses.length + ' секцій)', 'var(--green)');
  clearNewSong();
  renderAllSongs();
}

function clearNewSong() {
  document.getElementById('newSongTitle').value = '';
  document.getElementById('newSongAuthor').value = '';
  var bookFld = document.getElementById('newSongBook');
  if (bookFld) bookFld.value = '';
  document.getElementById('newSongVerses').value = '';
  document.getElementById('versesPreview').style.display = 'none';
  document.getElementById('versesPreviewList').innerHTML = '';
  editingSongId = null;
  var btn = document.getElementById('saveSongBtn');
  if (btn) btn.textContent = '💾 Зберегти пісню';
  var ttl = document.getElementById('addSongCardTitle');
  if (ttl) ttl.textContent = '➕ Додати нову пісню';
}

function deleteSong(id) {
  if (!confirm('Видалити цю пісню? (можна відновити з кошика)')) return;
  var toDel = currentSongs.filter(function(s){ return s.id === id; })[0];
  if (toDel && typeof trashSong === 'function') trashSong(toDel);   // у кошик перед видаленням
  currentSongs = currentSongs.filter(function(s){ return s.id !== id; });
  saveSongs(currentSongs);
  renderAllSongs();
}

function duplicateSong(id) {
  var s = currentSongs.find(function(x){ return x.id === id; });
  if (!s) return;
  // Копія з новим id — аранжування/мітки оригіналу не чіпаються (у копії свої)
  var copy = { id: Date.now(), title: (s.title || 'Пісня') + ' (копія)', author: s.author || '', songbook: s.songbook || '', verses: (s.verses || []).slice() };
  currentSongs.push(copy);
  saveSongs(currentSongs);
  renderAllSongs();
  if (typeof notify === 'function') notify('⧉ Створено копію: ' + copy.title);
}

// Кольорові мітки-категорії пісень (щоб швидко орієнтуватись у списку).
var SONG_TAGS = [
  { key: '',          label: '— мітка —',      color: '' },
  { key: 'praise',    label: '🔴 Прославлення', color: '#ef4444' },
  { key: 'worship',   label: '🔵 Поклоніння',   color: '#3b82f6' },
  { key: 'communion', label: '🟣 Причастя',     color: '#a855f7' },
  { key: 'call',      label: '🟢 Заклик',       color: '#22c55e' },
  { key: 'special',   label: '🟡 Особливе',     color: '#eab308' }
];
function songTagColor(id) {
  var k = state.songTags && state.songTags[id];
  if (!k) return '';
  var t = SONG_TAGS.filter(function(x){ return x.key === k; })[0];
  return t ? t.color : '';
}
function loadSongTags() { var d = loadJSON('church_song_tags'); state.songTags = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; }
function saveSongTags() { saveJSON('church_song_tags', state.songTags); }
function setSongTag(id, key) {
  state.songTags = state.songTags || {};
  if (key) state.songTags[id] = key; else delete state.songTags[id];
  saveSongTags();
  renderAllSongs();
}

// Наповнює фільтр-список збірників (select #songBookFilter) і datalist
// автодоповнення (#songBookList) усіма унікальними збірниками, що вже є в
// базі — щоб не набирати ту саму назву заново для кожної пісні. Зберігає
// поточний вибір фільтра при перемальовці (інакше він скидався б на «Усі
// збірники» щоразу після додавання/редагування пісні).
function renderSongBookOptions() {
  var books = [];
  currentSongs.forEach(function(s) {
    var b = (s.songbook || '').trim();
    if (b && books.indexOf(b) === -1) books.push(b);
  });
  books.sort(function(a, b) { return a.localeCompare(b, 'uk'); });

  var sel = document.getElementById('songBookFilter');
  if (sel) {
    var prev = sel.value;
    sel.innerHTML = '<option value="">📚 Усі збірники</option>' +
      books.map(function(b) { return '<option value="' + escHtml(b) + '">' + escHtml(b) + '</option>'; }).join('');
    if (books.indexOf(prev) !== -1) sel.value = prev;
  }

  var dl = document.getElementById('songBookList');
  if (dl) dl.innerHTML = books.map(function(b) { return '<option value="' + escHtml(b) + '">'; }).join('');
}

function renderAllSongs() {
  renderSongBookOptions();
  var container = document.getElementById('allSongsList');
  container.innerHTML = '';
  var qEl = document.getElementById('songListSearch');
  var q = qEl ? qEl.value.toLowerCase().trim() : '';
  var bookEl = document.getElementById('songBookFilter');
  var book = bookEl ? bookEl.value : '';
  var list = currentSongs;
  // .trim() — узгоджено з renderSongBookOptions(), яка будує список
  // варіантів фільтра з обрізаними назвами: без цього пісня з випадковим
  // пробілом у songbook (напр. ручна правка JSON) відповідала б опції у
  // списку, але ніколи не проходила б цей фільтр.
  if (book) list = list.filter(function(s) { return (s.songbook || '').trim() === book; });
  if (q) list = list.filter(function(s){ return ((s.title || '') + ' ' + (s.author || '') + ' ' + (s.songbook || '')).toLowerCase().indexOf(q) !== -1; });
  if (!list.length) {
    var emptyMsg = (q || book) ? 'Нічого не знайдено' + (book ? ' у збірнику «' + escHtml(book) + '»' : '') + (q ? ' за «' + escHtml(q) + '»' : '') : 'Ще немає пісень';
    container.innerHTML = '<p style="color:var(--text2);font-size:12px;padding:8px 0">' + emptyMsg + '</p>';
    return;
  }
  list.forEach(function(s) {
    var div = document.createElement('div');
    div.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;';
    var tc = songTagColor(s.id);
    var dot = '<span style="width:10px;height:10px;border-radius:50%;flex:0 0 auto;background:' + (tc || 'transparent') + ';border:1px solid ' + (tc || 'var(--border)') + '"></span>';
    var cur = (state.songTags && state.songTags[s.id]) || '';
    var tagSel = '<select onchange="setSongTag(' + s.id + ', this.value)" title="Категорія пісні" style="font-size:11px;background:var(--panel2);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:2px 4px;max-width:74px">' +
      SONG_TAGS.map(function(t){ return '<option value="' + t.key + '"' + (cur === t.key ? ' selected' : '') + '>' + t.label + '</option>'; }).join('') + '</select>';
    div.innerHTML = dot + '<span style="flex:1;font-size:13px"><b>' + escHtml(s.title) + '</b>' +
      (s.author ? ' <span style="color:var(--text2);font-size:11px">— ' + escHtml(s.author) + '</span>' : '') +
      (s.songbook ? ' <span style="color:var(--accent);font-size:11px">📚 ' + escHtml(s.songbook) + '</span>' : '') +
      '<br><span style="color:var(--text2);font-size:11px">' + s.verses.length + ' куплет(ів)</span></span>' +
      tagSel +
      '<button class="btn btn-ghost btn-sm" onclick="selectSong(currentSongs.find(function(x){return x.id==='+s.id+'}));showTab(\'songs\')">Обрати</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="editSong('+s.id+')" title="Редагувати текст пісні">✏️</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="duplicateSong('+s.id+')" title="Зробити копію пісні">⧉</button>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteSong('+s.id+')">✕</button>';
    container.appendChild(div);
  });
}

function showMsg(msg, color) {
  var el = document.getElementById('addSongMsg');
  el.style.color = color;
  el.textContent = msg;
  setTimeout(function(){ el.textContent = ''; }, 4000);
}

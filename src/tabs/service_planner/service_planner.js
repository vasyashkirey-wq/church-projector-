// ============================================================
// ВКЛАДКА «📅 План служби» (service) — планування служби: пункти
// (пісня/вірш/просто текст), шаблони, тривалість/таймінг, друк, звіт,
// експорт/імпорт, навігація по пунктах у прямому ефірі.
//
// Винесено з src/extras-3.js — продовження модуляризації (typo.js →
// ... → stations.js/qrscreen.js → ця). Мусить завантажуватись ДО
// extras-4.js — renderServiceTab викликається з dispatch-таблиці
// renderTabInto (extras-1.js) і з масиву TABS у pv2Init().
// ============================================================

function renderServiceTab() {
  const sv = state.service;
  const songsSorted = state.songs.slice().sort((a, b) => (a.title || '').localeCompare(b.title || '', 'uk'));
  const songOpts = songsSorted.map(s => `<option value="${s.id}">${esc(s.title + (s.songbook ? '  —  📚 ' + s.songbook : ''))}</option>`).join('');
  // Шаблони — нагору списку (стабільно, як і закріплення в HTML-графіці),
  // щоб не губились серед десятків минулих служб із конкретними датами.
  const savedOrder = (sv.saved || []).map((p, pi) => pi)
    .sort((a, b) => ((sv.saved[b].isTemplate ? 1 : 0) - (sv.saved[a].isTemplate ? 1 : 0)));
  const savedList = savedOrder.map(pi => {
    const p = sv.saved[pi];
    return `<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--border)">
       <span style="flex:1;font-size:11px">${p.isTemplate ? '<span class="badge" style="margin-right:4px">💠 Шаблон</span>' : ''}${esc(p.name)} <span style="color:var(--text2)">(${p.items.length})</span></span>
       ${p.isTemplate ? `<button class="btn btn-ghost btn-sm" title="Новий план на цей тиждень із цього шаблону" onclick="svcNewFromTemplate(${pi})">💠</button>` : `<button class="btn btn-ghost btn-sm" onclick="svcLoad(${pi})">📂</button>`}
       <button class="btn btn-ghost btn-sm" title="Копіювати під новою назвою" onclick="svcDuplicate(${pi})">📄</button>
       <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="svcDelete(${pi})">✕</button>
     </div>`;
  }).join('') || '<div style="font-size:11px;color:var(--text2)">Збережених планів немає</div>';

  const items = sv.items.map((it, i) => {
    const active = i === sv.idx;
    const slides = svcSlides(it);
    // Осиротілий пункт-пісня: id і title з бібліотеки нічого не знаходять
    // (пісню видалили/перейменували, або дубль-чекер прибрав збіг).
    const broken = it.kind === 'song' &&
      !state.songs.find(x => String(x.id) === String(it.id)) &&
      !state.songs.find(x => x.title === it.title);
    const borderColor = broken ? 'var(--red)' : (it.color || (active ? 'var(--accent)' : 'transparent'));
    const swatches = SVC_COLORS.map(c =>
      `<span onclick="svcSetColor(${i},'${c}')" title="Мітка"
             style="width:11px;height:11px;border-radius:50%;background:${c};cursor:pointer;
                    display:inline-block;box-shadow:${it.color === c ? '0 0 0 2px var(--text)' : 'none'}"></span>`
    ).join('');
    const relinkBar = broken ? `<div style="display:flex;gap:4px;margin-top:4px;align-items:center">
        <span style="font-size:11px;color:var(--red);white-space:nowrap">⚠️ пісню не знайдено —</span>
        <select id="svcRelink${i}" style="flex:1;min-width:0;background:var(--bg);border:1px solid var(--red);border-radius:3px;padding:2px;color:var(--text);font-size:11px" onclick="event.stopPropagation()">${songOpts}</select>
        <button class="btn btn-primary btn-sm" onclick="svcRelink(${i}, $('#svcRelink${i}').value)">🔗</button>
      </div>` : '';
    return `<div style="display:flex;align-items:center;gap:5px;padding:6px;border-bottom:1px solid var(--border);
                        background:${active ? 'var(--panel2)' : 'transparent'};border-left:3px solid ${borderColor}">
      <span style="font-size:15px">${broken ? '⚠️' : (SVC_ICONS[it.kind] || '•')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:${broken ? 'var(--red)' : 'var(--text)'};overflow:hidden;text-overflow:ellipsis">${esc(it.title)}</div>
        <div style="font-size:12px;color:var(--text2)">${broken ? 'пісню видалено або перейменовано в бібліотеці' : (slides.length ? slides.length + ' слайд(ів)' : 'без слайдів')}${active && !broken ? ' • зараз ' + (sv.slideIdx + 1) + '/' + slides.length : ''}</div>
        <div style="display:flex;gap:3px;margin-top:3px">${swatches}</div>
        ${relinkBar}
      </div>
      <input type="number" min="0" max="180" value="${it.duration || ''}" placeholder="хв" title="Орієнтовний час, хв"
             style="width:38px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:2px;color:var(--text);font-size:11px;text-align:center"
             onchange="svcSetDuration(${i}, this.value)">
      <button class="btn btn-success btn-sm" onclick="svcGoTo(${i})" ${broken ? 'disabled title="Спершу прив\'яжи пісню"' : ''}>▶</button>
      <button class="btn btn-ghost btn-sm" onclick="svcMove(${i},-1)">↑</button>
      <button class="btn btn-ghost btn-sm" onclick="svcMove(${i},1)">↓</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="svcRemove(${i})">✕</button>
    </div>`;
  }).join('') || '<div style="padding:10px;font-size:11px;color:var(--text2)">План порожній — додай пісні й вірші зліва</div>';
  // Орієнтовний загальний час служби — сума того, що оператор проставив по пунктах
  // (пункти без вказаного часу просто не рахуються, а не змушують ставити 0 всюди).
  const totalMin = sv.items.reduce((sum, it) => sum + (it.duration || 0), 0);
  const totalLabel = totalMin > 0
    ? `<div style="font-size:12px;color:var(--text2);margin-bottom:4px">⏱ Орієнтовний час служби: <b style="color:var(--text)">${Math.floor(totalMin / 60) ? Math.floor(totalMin / 60) + ' год ' : ''}${totalMin % 60} хв</b></div>`
    : '';

  return `
  <div class="grid2">
    <div>
      <div class="card">
        <div class="card-title">➕ Додати до плану</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">Пісня (весь текст, з порядком частин)</div>
        <input id="svcSongSearch" type="text" placeholder="🔍 Знайти пісню за назвою…" oninput="svcRefreshSongPick()"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none;margin-bottom:4px">
        <select id="svcSongBookFilter" onchange="svcRefreshSongPick()"
                style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none;margin-bottom:4px">
          <option value="">📚 Усі збірники</option>
        </select>
        <div style="display:flex;gap:4px">
          <select id="svcSongPick" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">${songOpts}</select>
          <button class="btn btn-primary btn-sm" onclick="svcAddSong($('#svcSongPick').value)">➕</button>
        </div>

        <div style="font-size:12px;color:var(--text2);margin-top:8px">Біблія (діапазон — кожен вірш окремим слайдом)</div>
        <div style="display:flex;gap:4px">
          <input id="svcBibleRef" type="text" placeholder="Ів 3:16-18"
                 style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none"
                 onkeydown="if(event.key==='Enter')svcAddBible()">
          <button class="btn btn-primary btn-sm" onclick="svcAddBible()">➕</button>
        </div>

        <div style="font-size:12px;color:var(--text2);margin-top:8px">Пункти без слайдів (для порядку служби)</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          <button class="preset-btn" onclick="svcAddSimple('prayer','Молитва')">🙏 Молитва</button>
          <button class="preset-btn" onclick="svcAddSimple('sermon','Проповідь')">📣 Проповідь</button>
          <button class="preset-btn" onclick="svcAddSimple('offering','Пожертви')">💝 Пожертви</button>
          <button class="preset-btn" onclick="svcAddSimple('announce','Оголошення')">📢 Оголошення</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">💾 Збережені плани</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
          <button class="btn btn-primary btn-sm" onclick="svcSaveAs()">💾 Зберегти як…</button>
          <button class="btn btn-ghost btn-sm" onclick="svcSaveAsTemplate()" title="Для повторного використання щотижня">💠 Зберегти як шаблон</button>
          <button class="btn btn-ghost btn-sm" onclick="svcExport()">⬇ Експорт</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('svcImportInput').click()">📥 Імпорт</button>
          <input type="file" id="svcImportInput" accept=".json" style="display:none" onchange="svcImport(this)">
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="svcClear()">🗑 Очистити</button>
        </div>
        ${savedList}
      </div>
    </div>

    <div>
      <div class="card" style="border-color:var(--accent)">
        <div class="card-title">📅 План${sv.name ? ' — ' + esc(sv.name) : ''} (${sv.items.length})</div>
        <div class="card-sub">Тисни ▶ на пункті — і далі просто «Наступний». Після останнього слайда пісні план сам переходить до наступного пункту.</div>
        <div style="display:flex;gap:6px;margin:10px 0;align-items:stretch">
          <button class="btn btn-ghost" style="font-size:15px;padding:14px 16px" onclick="svcPrev()">◀</button>
          <button class="btn btn-primary" style="flex:1;font-size:17px;font-weight:700;padding:14px" onclick="svcNext()">Наступний пункт ▶</button>
        </div>
        <div style="text-align:center;font-size:12px;color:var(--text2);margin:-4px 0 8px">${sv.idx >= 0 && sv.items[sv.idx] ? ('Зараз: <b style=\"color:var(--accent)\">' + esc(sv.items[sv.idx].title || '') + '</b> · пункт ' + (sv.idx + 1) + '/' + sv.items.length) : 'Обери пункт, щоб почати'}</div>
        ${totalLabel}
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <button class="btn btn-ghost btn-sm" onclick="svcPrint()">🖨 Друк / експорт плану</button>
          ${sv.serviceStartedAt ? `<button class="btn btn-ghost btn-sm" onclick="svcGenerateReport()">📊 Звіт (реальний час)</button>` : ''}
          ${sv.serviceStartedAt ? `<button class="btn btn-ghost btn-sm" onclick="svcResetTiming()">↺ Скинути відлік часу</button>` : ''}
        </div>
        <div id="svcTimingBox" style="display:${sv.serviceStartedAt ? 'block' : 'none'}"></div>
        <div style="max-height:420px;overflow-y:auto;border:1px solid var(--border);border-radius:5px">${items}</div>
      </div>
    </div>
  </div>`;
}

function svcNewFromTemplate(i) {
  const p = (state.service.saved || [])[i];
  if (!p) return;
  pv2Prompt('Назва нового плану на основі шаблону «' + p.name + '»:', new Date().toLocaleDateString('uk-UA') + ' — ' + p.name, function(name) {
    if (!name) return;
    state.service.items = JSON.parse(JSON.stringify(p.items));
    state.service.name = name;
    state.service.idx = -1;
    state.service.serviceStartedAt = null;
    state.service.items.forEach(it => { delete it.startedAt; });
    saveService(); markDirty('service');
    notify('💠 Новий план «' + name + '» створено із шаблону «' + p.name + '»');
  });
}

function svcLoad(i) {
  const p = (state.service.saved || [])[i];
  if (!p) return;
  state.service.items = JSON.parse(JSON.stringify(p.items));
  state.service.name = p.name;
  state.service.idx = -1;
  saveService(); markDirty('service');
  notify('📂 План «' + p.name + '» завантажено');
}

function svcDuplicate(i) {
  const p = (state.service.saved || [])[i];
  if (!p) return;
  pv2Prompt('Назва копії:', 'Копія — ' + p.name, function(name) {
    if (!name) return;
    const copy = { name: name, date: new Date().toISOString().slice(0, 10), items: JSON.parse(JSON.stringify(p.items)), isTemplate: !!p.isTemplate };
    state.service.saved = (state.service.saved || []).filter(x => x.name !== name);
    state.service.saved.push(copy);
    saveService(); markDirty('service');
    notify((p.isTemplate ? '📄 Копія шаблону' : '📄 Копія') + ' «' + name + '» створена');
  });
}

function svcDelete(i) {
  const p = (state.service.saved || [])[i];
  if (!p || !confirm('Видалити план «' + p.name + '»?')) return;
  state.service.saved.splice(i, 1);
  saveService(); markDirty('service');
}

function svcSetColor(i, color) {
  const items = state.service.items;
  if (!items[i]) return;
  items[i].color = (items[i].color === color) ? null : color; // повторний клік знімає мітку
  saveService(); markDirty('service');
}

function svcRelink(i, songId) {
  const items = state.service.items;
  const it = items[i];
  if (!it) return;
  const s = state.songs.find(x => String(x.id) === String(songId));
  if (!s) { notify('⚠️ Пісню не знайдено'); return; }
  it.id = s.id; it.title = s.title;
  svcInvalidate();
  saveService(); markDirty('service');
  notify('🔗 Прив\'язано: ' + s.title);
}

function svcSetDuration(i, min) {
  const items = state.service.items;
  if (!items[i]) return;
  const m = parseInt(min, 10);
  items[i].duration = (isFinite(m) && m > 0) ? m : 0;
  saveService();
}

function svcGoTo(i) {
  const items = state.service.items;
  if (i < 0 || i >= items.length) return;
  state.service.idx = i;
  state.service.slideIdx = 0;
  // Фіксуємо реальний час переходу — щоб потім порівняти із запланованим
  // (сума duration по пунктах) і показати, чи йде служба за розкладом.
  // serviceStartedAt ставимо лише РАЗ (перший перехід після скидання/
  // завантаження плану) — це «нуль» відліку всієї служби.
  const now = Date.now();
  items[i].startedAt = now;
  if (!state.service.serviceStartedAt) state.service.serviceStartedAt = now;
  saveService();
  // Цифровий бюлетень (/bulletin) і покращений пульт з телефону читають
  // план служби через цей самий broadcast — раніше він ішов лише з тіка
  // таймера (timer.js), тож без запущеного відліку план у бюлетені завжди
  // лишався застарілим. Тепер оновлюється щоразу, як реально гортаємо план.
  if (typeof broadcastRemoteState === 'function') broadcastRemoteState();
  const slides = svcSlides(items[i]);
  if (!slides.length) {
    markDirty('service');
    notify('▶ ' + items[i].title + ' (без слайдів)');
    return;
  }
  svcShowSlide(0);
}

function svcMove(i, delta) {
  const it = state.service.items;
  const j = i + delta;
  if (j < 0 || j >= it.length) return;
  [it[i], it[j]] = [it[j], it[i]];
  // Пункти помінялись місцями в масиві — якщо серед них був поточний
  // (виділений) пункт, покажчик має піти за ним, інакше "поточним" тихо
  // стає той пункт, що просто зайняв стару позицію.
  if (state.service.idx === i) state.service.idx = j;
  else if (state.service.idx === j) state.service.idx = i;
  saveService(); markDirty('service');
}

function svcRemove(i) {
  // Якщо видаляємо САМ активний пункт — на його місці тепер інший, тож
  // слайд скидаємо на початок (старий slideIdx міг бути за межами нового).
  const wasCurrent = (i === state.service.idx);
  state.service.items.splice(i, 1);
  // Видалення пункту ПЕРЕД поточним зсуває масив на 1 — покажчик має зсунутись
  // теж, інакше він тихо "перестрибує" й показує сусідній пункт як поточний.
  if (i < state.service.idx) state.service.idx--;
  if (wasCurrent) state.service.slideIdx = 0;
  if (state.service.idx >= state.service.items.length) state.service.idx = state.service.items.length - 1;
  saveService(); markDirty('service');
}

function svcRefreshSongPick() {
  var sel = document.getElementById('svcSongPick');
  if (!sel) return;
  var qEl = document.getElementById('svcSongSearch');
  var q = qEl ? qEl.value.toLowerCase().trim() : '';
  var bookEl = document.getElementById('svcSongBookFilter');
  var book = bookEl ? bookEl.value : '';
  var list = state.songs.slice().sort(function(a, b) { return (a.title || '').localeCompare(b.title || '', 'uk'); });
  if (book) list = list.filter(function(s) { return (s.songbook || '').trim() === book; });
  if (q) list = list.filter(function(s) { return (s.title || '').toLowerCase().indexOf(q) !== -1; });
  sel.innerHTML = list.length
    ? list.map(function(s) { return '<option value="' + s.id + '">' + esc(s.title + (s.songbook ? '  —  📚 ' + s.songbook : '')) + '</option>'; }).join('')
    : '<option value="">— нічого не знайдено —</option>';
}

function svcAddSong(songId) {
  const s = state.songs.find(x => String(x.id) === String(songId));
  if (!s) { notify('⚠️ Пісню не знайдено'); return; }
  state.service.items.push({ kind: 'song', id: s.id, title: s.title, note: '' });
  saveService(); markDirty('service');
  notify('➕ ' + s.title);
}

function svcAddBible() {
  const ref = ($('#svcBibleRef') && $('#svcBibleRef').value.trim()) || '';
  if (!ref) { notify('⚠️ Введи посилання, напр. Ів 3:16-18'); return; }
  state.service.items.push({ kind: 'bible', ref: ref, title: ref, note: '' });
  saveService(); markDirty('service');
}

function svcAddSimple(kind, title) {
  state.service.items.push({ kind: kind, title: title, note: '' });
  saveService(); markDirty('service');
}

function svcSaveAs() {
  pv2Prompt('Назва плану:', state.service.name || ('Служіння ' + new Date().toLocaleDateString('uk-UA')), function(name){
  if (!name) return;
  state.service.name = name;
  const copy = { name: name, date: new Date().toISOString().slice(0, 10), items: JSON.parse(JSON.stringify(state.service.items)), isTemplate: false };
  state.service.saved = (state.service.saved || []).filter(p => p.name !== name);
  state.service.saved.push(copy);
  saveService(); markDirty('service');
  notify('💾 План «' + name + '» збережено');
  });
}

function svcSaveAsTemplate() {
  pv2Prompt('Назва шаблону (для повторного використання щотижня):', state.service.name || 'Недільна служба (шаблон)', function(name){
  if (!name) return;
  const copy = { name: name, date: new Date().toISOString().slice(0, 10), items: JSON.parse(JSON.stringify(state.service.items)), isTemplate: true };
  state.service.saved = (state.service.saved || []).filter(p => p.name !== name);
  state.service.saved.push(copy);
  saveService(); markDirty('service');
  notify('💠 Шаблон «' + name + '» збережено');
  });
}

function svcExport() {
  downloadFile(JSON.stringify({ name: state.service.name, items: state.service.items }, null, 2),
    (state.service.name || 'план') + '.json', 'application/json');
}

function svcImport(input) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!Array.isArray(d.items)) throw new Error('Немає списку пунктів');
      state.service.items = d.items;
      state.service.name = d.name || '';
      state.service.idx = -1;
      saveService(); markDirty('service');
      notify('📥 План імпортовано: ' + d.items.length + ' пунктів');
    } catch (err) { notify('✗ ' + err.message); }
  };
  r.readAsText(f);
  input.value = '';
}

function svcClear() {
  if (!confirm('Очистити поточний план?')) return;
  state.service.items = [];
  state.service.idx = -1;
  saveService(); markDirty('service');
}

function svcPrev() {
  if (state.service.slideIdx > 0) {
    svcShowSlide(state.service.slideIdx - 1);
  } else if (state.service.idx > 0) {
    const pi = state.service.idx - 1;
    state.service.idx = pi;
    const slides = svcSlides(state.service.items[pi]);
    if (!slides.length) {
      // Пункт без слайдів (молитва/проповідь/пожертви) — показуємо перехід
      // ЯВНО (як і svcGoTo при русі вперед), інакше оператор тисне ◀ і не
      // бачить жодної реакції — здається, що кнопка «не працює».
      state.service.slideIdx = 0;
      saveService();
      markDirty('service');
      notify('◀ ' + state.service.items[pi].title + ' (без слайдів)');
      return;
    }
    svcShowSlide(slides.length - 1);
  }
}

function svcNext() {
  const item = state.service.items[state.service.idx];
  if (!item) { svcGoTo(0); return; }
  const slides = svcSlides(item);
  if (state.service.slideIdx + 1 < slides.length) {
    svcShowSlide(state.service.slideIdx + 1);
  } else if (state.service.idx + 1 < state.service.items.length) {
    svcGoTo(state.service.idx + 1);
    notify('▶ Далі: ' + state.service.items[state.service.idx].title);
  } else {
    notify('Кінець плану');
  }
}

function svcPrint() {
  const sv = state.service;
  if (!sv.items.length) { notify('⚠️ План порожній — нічого друкувати'); return; }
  const rows = sv.items.map((it, i) =>
    '<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd;color:#888">' + (i + 1) + '</td>' +
    '<td style="padding:6px 10px;border-bottom:1px solid #ddd">' + (SVC_ICONS[it.kind] || '•') + ' ' + esc(it.title || '') + '</td>' +
    '<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right;color:#888">' + (it.duration ? it.duration + ' хв' : '—') + '</td></tr>'
  ).join('');
  const totalMin = sv.items.reduce((sum, it) => sum + (it.duration || 0), 0);
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(sv.name || 'План служби') + '</title>' +
    '<style>body{font-family:Georgia,serif;max-width:700px;margin:30px auto;padding:0 20px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}</style></head><body>' +
    '<h1>' + esc(sv.name || 'План служби') + '</h1>' +
    (sv.date ? '<div style="color:#888">' + esc(sv.date) + '</div>' : '') +
    (totalMin ? '<div style="margin-top:8px">Орієнтовний час: <b>' + totalMin + ' хв</b></div>' : '') +
    '<table>' + rows + '</table>' +
    '<div style="margin-top:24px;font-size:11px;color:#aaa">Створено в «Церква Проектор» · ' + new Date().toLocaleDateString('uk-UA') + '</div>' +
    '</body></html>';
  downloadFile(html, 'план-служби-' + new Date().toISOString().slice(0, 10) + '.html', 'text/html');
  notify('🖨 Файл плану збережено — відкрий і друкуй із браузера');
}

function svcGenerateReport() {
  const sv = state.service;
  if (!sv.items.length) { notify('⚠️ План порожній — немає що звітувати'); return; }
  if (!sv.serviceStartedAt) { notify('⚠️ Служба ще не починалась — немає реальних даних для звіту'); return; }
  const rows = sv.items.map((it, i) => {
    const nextStarted = sv.items[i + 1] && sv.items[i + 1].startedAt;
    let actualLabel = '—';
    if (it.startedAt) {
      const endTime = nextStarted || Date.now();
      actualLabel = Math.round((endTime - it.startedAt) / 60000) + ' хв';
    }
    return '<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd;color:#888">' + (i + 1) + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid #ddd">' + (SVC_ICONS[it.kind] || '•') + ' ' + esc(it.title || '') + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right;color:#888">' + (it.duration ? it.duration + ' хв' : '—') + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right;font-weight:700">' + actualLabel + '</td></tr>';
  }).join('');
  const totalPlanned = sv.items.reduce((sum, it) => sum + (it.duration || 0), 0);
  const totalActualMin = Math.round((Date.now() - sv.serviceStartedAt) / 60000);
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Звіт — ' + esc(sv.name || 'Служба') + '</title>' +
    '<style>body{font-family:Georgia,serif;max-width:750px;margin:30px auto;padding:0 20px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th{text-align:left;padding:6px 10px;border-bottom:2px solid #333;font-size:12px;color:#666}</style></head><body>' +
    '<h1>📊 Звіт служби — ' + esc(sv.name || '') + '</h1>' +
    (sv.date ? '<div style="color:#888">' + esc(sv.date) + '</div>' : '') +
    '<div style="margin-top:8px">Заплановано: <b>' + totalPlanned + ' хв</b> · Реально тривало: <b>' + totalActualMin + ' хв</b></div>' +
    '<table><tr><th>#</th><th>Пункт</th><th style="text-align:right">Заплановано</th><th style="text-align:right">Реально</th></tr>' + rows + '</table>' +
    '<div style="margin-top:24px;font-size:11px;color:#aaa">Створено в «Церква Проектор» · ' + new Date().toLocaleDateString('uk-UA') + '</div>' +
    '</body></html>';
  downloadFile(html, 'звіт-служби-' + new Date().toISOString().slice(0, 10) + '.html', 'text/html');
  notify('📊 Звіт служби збережено');
}

function svcResetTiming() {
  if (!confirm('Скинути відлік реального часу служби? Заплановані хвилини по пунктах НЕ зміняться — лише почнеться новий відлік із наступного переходу.')) return;
  state.service.serviceStartedAt = null;
  state.service.items.forEach(it => { delete it.startedAt; });
  saveService();
  markDirty('service');
  notify('↺ Відлік часу скинуто');
}

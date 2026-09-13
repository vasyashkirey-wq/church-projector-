// ============================================================
// ВКЛАДКА «⚙️ Автоматизація» (automation) — розклад автоматичних дій,
// автобекап, мова інтерфейсу, кошик (відновити пісню/спорожнити).
//
// Винесено з src/extras-4.js — продовження модуляризації (typo.js →
// ... → captions.js/control.js → ця). Мусить завантажуватись ДО
// extras-4.js — renderAutomationTab викликається з dispatch-таблиці
// renderTabInto (extras-1.js).
// ============================================================

function renderAutomationTab() {
  const days = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
  const profiles = (state.profiles && state.profiles.list) || [];
  const sched = (state.scheduler && state.scheduler.items) || [];
  const ab = state.autoBackup || {};
  const trash = state.songTrash || [];

  const schedRows = sched.map((it, i) => {
    const profOpts = ['<option value="">— профіль —</option>'].concat(
      profiles.map(p => `<option value="${esc(p.name)}" ${it.profile === p.name ? 'selected' : ''}>${esc(p.name)}</option>`)).join('');
    const dayOpts = days.map((d, di) => `<option value="${di}" ${it.weekday === di ? 'selected' : ''}>${d}</option>`).join('');
    return `<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
      <input type="checkbox" ${it.on ? 'checked' : ''} onchange="setSchedule(${i},'on',this.checked)">
      <select onchange="setSchedule(${i},'weekday',parseInt(this.value,10))" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px">${dayOpts}</select>
      <input type="time" value="${it.time}" onchange="setSchedule(${i},'time',this.value)" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px">
      <select onchange="setSchedule(${i},'profile',this.value)" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px">${profOpts}</select>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="removeSchedule(${i})">✕</button>
    </div>`;
  }).join('') || '<div style="font-size:11px;color:var(--text2)">Розкладів немає</div>';

  const trashRows = trash.map((tr, i) =>
    `<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--border)">
       <span style="flex:1;font-size:11px">${esc(tr.song.title || 'Без назви')}</span>
       <button class="btn btn-success btn-sm" onclick="restoreSong(${i})">↩ Відновити</button>
     </div>`).join('') || '<div style="font-size:11px;color:var(--text2)">Кошик порожній</div>';

  return `
  <div class="card" style="border-color:var(--accent)">
    <div class="card-title">📅 Автозапуск профілю за розкладом</div>
    <div class="card-sub">Напр.: щонеділі о 9:30 — профіль «Ранкова». Профілі створюються у вкладці «Налаштування».</div>
    <div style="margin-top:8px">${schedRows}</div>
    <button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="addSchedule()">➕ Додати розклад</button>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">💾 Автобекап за розкладом</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" ${ab.on ? 'checked' : ''} onchange="setAutoBackup('on',this.checked)">
        Автоматично зберігати копію
      </label>
      <div style="font-size:12px;color:var(--text2);margin-top:6px">Кожні <b>${ab.everyDays || 7}</b> днів</div>
      <input type="range" min="1" max="30" value="${ab.everyDays || 7}" onchange="setAutoBackup('everyDays',parseInt(this.value,10))" style="width:100%">
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:4px" onclick="window.electronAPI&&window.electronAPI.openBackupFolder&&window.electronAPI.openBackupFolder()">📂 Відкрити теку бекапів</button>
      ${ab.last ? `<div style="font-size:12px;color:var(--text2);margin-top:4px">Останній: ${new Date(ab.last).toLocaleDateString('uk-UA')}</div>` : ''}
    </div>

    <div class="card">
      <div class="card-title">🌐 Мова панелі</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn ${(state.lang||'ua')==='ua'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLang('ua')">Українська</button>
        <button class="btn ${(state.lang||'ua')==='cz'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLang('cz')">Čeština</button>
        <button class="btn ${(state.lang||'ua')==='en'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLang('en')">English</button>
      </div>
      <div class="card-sub" style="margin-top:4px">Перекладає меню нагорі (назви розділів і вкладок) — одразу, без перезапуску. Вміст усередині вкладок поки лишається українською. Вивід у зал — окремо, не залежить від цього.</div>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">🗑 Кошик пісень (${trash.length})</div>
      <div class="card-sub">Видалені пісні зберігаються тут — можна відновити.</div>
      <div style="max-height:180px;overflow-y:auto;margin-top:6px">${trashRows}</div>
      ${trash.length ? '<button class="btn btn-ghost btn-sm btn-block" style="margin-top:4px;color:var(--red)" onclick="emptyTrash()">Очистити кошик</button>' : ''}
    </div>

    <div class="card">
      <div class="card-title">🔌 Stream Deck / Companion</div>
      <div class="card-sub">Увімкни «Пульт» у вкладці «Станції» — і HTTP-команди стануть доступні:</div>
      <div style="font-family:monospace;font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;margin-top:6px;color:var(--text2)">
        http://[IP]:3939/api/next<br>
        http://[IP]:3939/api/blackout<br>
        http://[IP]:3939/api/go-live<br>
        <span style="color:var(--text2)">…prev, clear, undo, lower, freeze</span>
      </div>
      <div class="card-sub" style="margin-top:6px"><b>Конкретна кнопка на конкретну дію</b> — не «далі», а саме ЦЯ закладка/пункт/оголошення:</div>
      <div style="font-family:monospace;font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;margin-top:4px;color:var(--text2)">
        …/api/bookmark?idx=0 <span style="opacity:.7">— перша закладка (номер із вкладки «Ефір»)</span><br>
        …/api/plan-item?idx=2 <span style="opacity:.7">— третій пункт плану служби</span><br>
        …/api/announce?id=169... <span style="opacity:.7">— конкретне оголошення (натисни 📋 біля нього у вкладці «Оголошення», щоб скопіювати готове посилання)</span>
      </div>
      <div class="card-sub" style="margin-top:4px">У Bitfocus Companion додай Generic HTTP і встав ці адреси на кнопки.</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">📋 Лог помилок</div>
    <div class="card-sub">Якщо щось піде не так на церковному ПК — тут технічні деталі для діагностики.</div>
    <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="window.electronAPI&&window.electronAPI.openLogFolder&&window.electronAPI.openLogFolder()">📂 Відкрити лог</button>
      <button class="btn btn-ghost btn-sm" onclick="if(window.electronAPI&&window.electronAPI.clearLog){window.electronAPI.clearLog();notify('Лог очищено')}">Очистити лог</button>
    </div>
  </div>`;
}

function setSchedule(i, key, val) {
  if (!state.scheduler.items[i]) return;
  state.scheduler.items[i][key] = val;
  saveScheduler();
  if (key !== 'time' && key !== 'weekday') markDirty('automation');
}

function removeSchedule(i) { state.scheduler.items.splice(i, 1); saveScheduler(); markDirty('automation'); }

function restoreSong(i) {
  const t = (state.songTrash || [])[i];
  if (!t) return;
  if (typeof currentSongs !== 'undefined' && Array.isArray(currentSongs)) {
    currentSongs.push(t.song);
    // БУВ виклик saveSongs() без аргументу: saveSongs(songs) робить
    // JSON.stringify(songs), а bigStoreSet трактує undefined як '' —
    // церковна база пісень (church_songs_db) записувалась ПОРОЖНЬОЮ.
    // Сама сесія працювала б далі нормально (currentSongs у пам'яті вже
    // мав пісню), але наступний запуск програми (loadSongs) бачив би
    // порожній рядок, вважав би, що збереженого нема, і тихо скидав усю
    // базу до кількох вбудованих пісень за замовчуванням — щойно
    // оператор відновив пісню з кошика й закрив програму без жодної
    // іншої зміни.
    if (typeof saveSongs === 'function') saveSongs(currentSongs);
    if (typeof renderAllSongs === 'function') renderAllSongs();
  }
  state.songTrash.splice(i, 1);
  saveJSON('church_song_trash', state.songTrash);
  markDirty('automation');
  notify('↩ Пісню «' + (t.song.title || '') + '» відновлено');
}

function addSchedule() {
  state.scheduler.items.push({ weekday: 0, time: '09:30', profile: '', on: true });
  saveScheduler(); markDirty('automation');
}

function setAutoBackup(key, val) {
  state.autoBackup[key] = val;
  saveJSON('church_autobackup', state.autoBackup);
  markDirty('automation');
  if (key === 'on' && val) maybeAutoBackup(true);
}

function setLang(code) {
  state.lang = code;
  saveJSON('church_lang', { code: code });
  notify('🌐 ' + (I18N[code] ? I18N[code].name : code));
  // Одразу перемальовуємо меню й поточну вкладку — без перезапуску програми.
  if (typeof refreshNavLabels === 'function') refreshNavLabels();
  // Перекладає вміст УСІХ уже відмальованих вкладок (не лише поточної) —
  // частина вкладок відмальовується один раз при старті (pv2Init), а не
  // щоразу заново, тож без цього вони лишились би українською до наступного
  // відкриття.
  if (typeof uiTranslateAll === 'function') uiTranslateAll();
  markDirty('automation');
}

function emptyTrash() {
  if (!confirm('Очистити кошик остаточно?')) return;
  state.songTrash = [];
  saveJSON('church_song_trash', state.songTrash);
  markDirty('automation');
}

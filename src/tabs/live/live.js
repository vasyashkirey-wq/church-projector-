// ============================================================
// ВКЛАДКА «📺 Показ/Live» (live) — ЛИШЕ розмітка (render-функція).
//
// ⚠️ НАВМИСНО винесено ОКРЕМО від типового підходу цієї модуляризації:
// уся логіка, яку викликає ця вкладка (goLive, clearLive, undoLast,
// previewStep, setLiveMode і решта) НЕ переносилась сюди — вони ядро
// конвеєра показу, використовуються з гарячих клавіш, Біблії, пісень,
// Служби, станцій-клієнтів тощо. Лишається в extras-2.js.
//
// Продовження модуляризації (typo.js → ... → router.js → ця). Мусить
// завантажуватись ДО extras-4.js — renderLiveTab викликається з
// dispatch-таблиці renderTabInto (extras-1.js).
// ============================================================

function renderLiveTab() {
  const staged = state.liveMode === 'staged';
  const d = state.displayCfg;
  const themeOpts = state.themes.length
    ? state.themes.map(t => `<option value="${t.id}"${t.id === state.activeThemeId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')
    : '<option value="">— тем ще немає —</option>';
  const alignOpts = [['bottom-right','Внизу справа'],['bottom-left','Внизу зліва'],['bottom-center','Внизу по центру'],['top-right','Вгорі справа'],['top-left','Вгорі зліва']]
    .map(([v,l]) => `<option value="${v}"${d.ctrlAlign===v?' selected':''}>${l}</option>`).join('');

  return `
  <div class="card" style="border-color:${staged ? 'var(--accent)' : 'var(--border)'}">
    <b style="font-size:12px">Режим ефіру:</b>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn ${staged ? 'btn-primary' : 'btn-ghost'}" style="flex:1;padding:12px;font-size:14px;font-weight:600" onclick="setLiveMode('staged')">🎬 Спершу прев'ю</button>
      <button class="btn ${!staged ? 'btn-primary' : 'btn-ghost'}" style="flex:1;padding:12px;font-size:14px;font-weight:600" onclick="setLiveMode('direct')">⚡ Одразу на екран</button>
    </div>
    <div class="card-sub" style="margin-top:4px">
      ${staged
        ? 'Кнопки «Надіслати» з вкладок Пісні / Біблія / Оголошення кладуть слайд у <b>прев\'ю</b>. У зал він піде лише після «В ЕФІР».'
        : 'Кожна відправка одразу йде в зал (стара поведінка).'}
    </div>
  </div>

  <div class="grid2">
    <div>
      <div class="card" style="border-color:var(--red)">
        <div class="card-title"><span id="liveDot" style="color:var(--text2)">●</span> В ЕФІРІ — це бачить зал</div>
        <div style="position:relative;width:100%;aspect-ratio:16/9;border:2px solid var(--red);border-radius:6px;overflow:hidden;background:#000">
          <iframe id="liveOnAirFrame" style="position:absolute;top:0;left:0;width:1920px;height:1080px;border:0;transform:scale(0.26);transform-origin:top left;pointer-events:none"></iframe>
        </div>
        <div id="liveOnAirLabel" style="font-size:11px;color:var(--text2);margin-top:4px">— порожньо —</div>
        <div style="display:flex;gap:4px;margin-top:6px">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="clearLive()" title="Очистити геть усе — слайд, оголошення/Prop і логотип">🚫 Все</button>
          <button class="btn btn-ghost btn-sm" id="undoBtn" style="flex:1" onclick="undoLast()">↶ Скасувати</button>
        </div>
        <div class="flex" style="gap:6px;margin-top:6px">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="clearSlideOnly()" title="Прибрати лише слайд/графіку, накладки лишити">Слайд</button>
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="clearPropsLayer()" title="Прибрати оголошення / Prop">Оголош.</button>
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="clearLogoLayer()" title="Прибрати логотип">Логотип</button>
        </div>
      </div>
    </div>

    <div>
      <div class="card" style="border-color:var(--accent)">
        <div class="card-title">📋 ПРЕВ'Ю — готується</div>
        <div style="position:relative;width:100%;aspect-ratio:16/9;border:2px dashed var(--accent);border-radius:6px;overflow:hidden;background:#000">
          <iframe id="livePreviewFrame" style="position:absolute;top:0;left:0;width:1920px;height:1080px;border:0;transform:scale(0.26);transform-origin:top left;pointer-events:none"></iframe>
        </div>
        <div id="livePreviewLabel" style="font-size:11px;color:var(--text2);margin-top:4px">— порожньо —</div>
        <div style="display:flex;gap:4px;margin-top:6px">
          <button class="btn btn-ghost btn-sm" onclick="previewStep(-1)">◀ Куплет</button>
          <button class="btn btn-ghost btn-sm" onclick="previewStep(1)">Куплет ▶</button>
        </div>
        <button class="btn btn-success btn-block" style="margin-top:6px;font-weight:700;font-size:14px;padding:10px" onclick="goLive()">🔴 В ЕФІР →</button>
      </div>
    </div>
  </div>

  <div class="card" style="border-color:var(--accent)">
    <div class="card-title">🔳 Виходи — що на кожному екрані</div>
    <div id="liveMultiview" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px">— завантаження —</div>
    <div class="card-sub" style="margin-top:5px">Кожна плитка = один вихід: тип (Текст / Графіка / Біблія / Таймер / Наступний / Порожньо) і маршрут. «Дзеркало» = те саме, що в ефірі.</div>
  </div>

  <div class="grid2">
    <div>
      <div class="card">
        <div class="card-title">🎨 Теми служіння</div>
        <select id="themeSelect" onchange="applyNamedTheme(this.value)" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">${themeOpts}</select>
        <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="saveThemeAs()">➕ Нова тема</button>
          <button class="btn btn-ghost btn-sm" onclick="updateNamedTheme()">💾 Оновити</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteNamedTheme()">🗑 Видалити</button>
        </div>
        <div class="card-sub" style="margin-top:4px">Тема запам'ятовує стиль проектора, графіки й тексту всіх 4 виходів — перемикається одним кліком перед служінням.</div>
      </div>
      <div class="card">
        <div class="card-title">⚡ Профілі служіння</div>
        <select id="serviceProfileSelect" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none">
          ${(state.serviceProfiles || []).length
            ? state.serviceProfiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
            : '<option value="">— профілів ще немає —</option>'}
        </select>
        <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
          <button class="btn btn-success btn-sm" style="flex:1" onclick="var v=document.getElementById('serviceProfileSelect').value; if(v) applyServiceProfile(v)">⚡ Застосувати</button>
          <button class="btn btn-primary btn-sm" onclick="saveServiceProfile()">➕ Зберегти поточне</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="var v=document.getElementById('serviceProfileSelect').value; if(v) deleteServiceProfile(v)">🗑</button>
        </div>
        <div class="card-sub" style="margin-top:4px">Маршрути всіх 4 виходів + прив'язана тема — на відміну від «Теми служіння» (лише вигляд), тут ще й що куди виводиться.</div>
      </div>
    </div>

    <div>
      <div class="card">
        <div class="card-title">🖥 Вивід</div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
          <input type="checkbox" ${d.alwaysOnTop ? 'checked' : ''} onchange="setDisplayCfg('alwaysOnTop', this.checked)">
          Поверх усіх вікон
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;margin-top:4px">
          <input type="checkbox" ${d.singleScreen ? 'checked' : ''} onchange="setDisplayCfg('singleScreen', this.checked)">
          Режим одного монітора (кнопки просто на екрані виводу)
        </label>
        <div style="font-size:12px;color:var(--text2);margin-top:6px">Розмір кнопок: <b id="ctrlSizeLabel">${d.ctrlSize}px</b></div>
        <input type="range" min="24" max="90" value="${d.ctrlSize}" oninput="setDisplayCfg('ctrlSize', parseInt(this.value,10))" style="width:100%">
        <div style="font-size:12px;color:var(--text2)">Прозорість: <b id="ctrlOpacityLabel">${Math.round(d.ctrlOpacity*100)}%</b></div>
        <input type="range" min="10" max="100" value="${Math.round(d.ctrlOpacity*100)}" oninput="setDisplayCfg('ctrlOpacity', parseInt(this.value,10)/100)" style="width:100%">
        <div style="font-size:12px;color:var(--text2);margin-top:4px">Розташування кнопок</div>
        <select onchange="setDisplayCfg('ctrlAlign', this.value)" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px;color:var(--text);font-size:11px">${alignOpts}</select>
      </div>
    </div>
  </div>`;
}

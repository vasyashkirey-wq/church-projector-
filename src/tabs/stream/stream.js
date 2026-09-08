// ============================================================
// ВКЛАДКА «🎥 Трансляція» (stream) — «нижня третина» (lower third) для
// трансляційного виходу: текст/показати/сховати/хромакей-фон.
//
// Винесено з src/extras-3.js — продовження модуляризації (typo.js →
// ... → monitors.js → ця). setLowerChroma НАВМИСНО лишилась у
// extras-1.js — вона спільна з іншою карткою (не ексклюзивна для цієї
// вкладки), тож переносити її сюди означало б дублювання залежності.
// Мусить завантажуватись ДО extras-4.js — renderStreamTab викликається
// з дispatch-таблиці renderTabInto (extras-1.js).
// ============================================================

function renderStreamTab() {
  const L = state.lower;
  const styles = Object.keys(LOWER_STYLES).map(k => {
    const st = LOWER_STYLES[k];
    const on = L.style === k;
    return `<button class="btn ${on ? 'btn-primary' : 'btn-ghost'} btn-sm"
              onclick="setLower('style','${k}')"
              style="display:flex;align-items:center;gap:5px">
              <span style="width:10px;height:10px;border-radius:2px;background:${st.accent};display:inline-block"></span>
              ${st.name}</button>`;
  }).join(' ');

  const posBtn = (p, l) => `<button class="btn ${L.position === p ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setLower('position','${p}')">${l}</button>`;
  const animBtn = (a, l) => `<button class="btn ${L.animation === a ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setLower('animation','${a}')">${l}</button>`;
  const outBtn = n => `<button class="btn ${L.target === n ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setLower('target',${n})">${OUT_NAME[n]}</button>`;
  const c = pv2GraphicsContent();

  return `
  <div class="card" style="border-color:${L.visible ? 'var(--red)' : 'var(--accent)'}">
    <div class="card-title">${L.visible ? '<span style="color:var(--red)">● В ЕФІРІ</span>' : '○ Титр прихований'}</div>
    <div class="card-sub">Зараз у титрі: <b>${c.ref ? esc(c.ref) : '—'}</b> ${c.text ? '— ' + esc(String(c.text).replace(/<[^>]+>/g,' ').slice(0, 60)) + '…' : '(нічого не надіслано)'}</div>
    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-success" style="flex:1;font-weight:700" onclick="lowerShow()">🎬 ПОКАЗАТИ ТИТР</button>
      <button class="btn btn-ghost" style="flex:1" onclick="lowerHide()">✕ Прибрати</button>
    </div>
    <div class="card-sub" style="margin-top:4px">Гаряча клавіша: признач «Титр» у вкладці «Клавіші», щоб показувати одним натисканням.</div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">🎨 Стиль титру</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${styles}</div>

      <div style="font-size:12px;color:var(--text2);margin-top:10px">Розташування</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${posBtn('bottom','Внизу')} ${posBtn('top','Вгорі')} ${posBtn('left','Зліва')} ${posBtn('right','Справа')} ${posBtn('center','По центру')}
      </div>

      <div style="font-size:12px;color:var(--text2);margin-top:10px">Поява</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${animBtn('slideUp','Знизу вгору')} ${animBtn('slideLeft','Збоку')} ${animBtn('fade','Проявлення')} ${animBtn('zoom','Наближення')} ${animBtn('none','Без анімації')}
      </div>

      <div style="font-size:12px;color:var(--text2);margin-top:10px">Колір акценту</div>
      <input type="color" value="${L.accent || LOWER_STYLES[L.style].accent}" oninput="setLower('accent', this.value)"
             style="width:50px;height:26px;border:none;background:none">
      <button class="btn btn-ghost btn-sm" onclick="setLower('accent', null)">Стандартний</button>
    </div>

    <div class="card">
      <div class="card-title">⚙️ Керування</div>

      <div style="font-size:12px;color:var(--text2)">На який вихід</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${outBtn(1)} ${outBtn(2)} ${outBtn(3)} ${outBtn(4)}</div>

      <div style="font-size:12px;color:var(--text2);margin-top:10px">Розмір тексту: <b>${Math.round((L.scale || 0.62) * 100)}%</b></div>
      <input type="range" min="35" max="110" value="${Math.round((L.scale || 0.62) * 100)}"
             oninput="setLower('scale', parseInt(this.value,10)/100)" style="width:100%">

      <div style="font-size:12px;color:var(--text2)">Прибирати автоматично: <b>${L.autoHide ? L.autoHide + ' с' : 'ні (тримати)'}</b></div>
      <input type="range" min="0" max="60" step="5" value="${L.autoHide}"
             oninput="setLower('autoHide', parseInt(this.value,10))" style="width:100%">

      <div style="font-size:12px;color:var(--text2);margin-top:8px">Фон сцени (що вирізає OBS)</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn ${(state.graphicsSettings.lowerChroma||'transparent')==='transparent'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('transparent')">Прозорий</button>
        <button class="btn ${state.graphicsSettings.lowerChroma==='#00ff00'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('#00ff00')">🟩 Зелений</button>
        <button class="btn ${state.graphicsSettings.lowerChroma==='#ff00ff'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLowerChroma('#ff00ff')">🟪 Маджента</button>
      </div>
      <div class="card-sub" style="margin-top:4px">Прозорий — якщо OBS бачить альфа-канал. Ні — став зелений і додай фільтр «Chroma Key».</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">👁 Як це виглядатиме поверх камери</div>
    <div style="position:relative;width:100%;aspect-ratio:16/9;border:1px solid var(--border);border-radius:6px;overflow:hidden;
                background:linear-gradient(135deg,#2a1f14,#0d1b2e 60%,#1a1a2e)">
      <iframe id="lowerPreviewFrame" style="position:absolute;top:0;left:0;width:1920px;height:1080px;border:0;
              transform:scale(0.28);transform-origin:top left;pointer-events:none;background:transparent"></iframe>
    </div>
  </div>`;
}

function setLower(key, val) {
  state.lower[key] = val;
  saveLower();
  markDirty('stream');
  if (state.lower.visible) lowerShow();   // якщо титр в ефірі — оновлюємо наживо
}

function lowerShow() {
  const n = state.lower.target || 2;
  const c = pv2GraphicsContent();
  if (!c.text) { notify('⚠️ Спершу надішли вірш або куплет'); return; }

  const prevLayout = state.graphicsSettings.layout;
  state.graphicsSettings.layout = 'lower';           // тимчасово — щоб не чіпати налаштування залу
  const html = getGraphicsHTML(c.text, c.ref);
  state.graphicsSettings.layout = prevLayout;

  if (isClientStation()) { stationSend('send-html', { html: html, label: 'Титр' }); }
  else sendHTMLToOutputN(n, html, null);

  state.lower.visible = true;
  markDirty('stream');
  notify('🎬 Титр в ефірі → ' + OUT_NAME[n]);

  clearTimeout(_lowerHideTimer);
  if (state.lower.autoHide > 0) {
    _lowerHideTimer = setTimeout(() => lowerHide(), state.lower.autoHide * 1000);
  }
}

function lowerHide() {
  clearTimeout(_lowerHideTimer);
  const n = state.lower.target || 2;
  if (isClientStation()) stationSend('clear', {});
  else pv2ClearOutput(n);
  state.lower.visible = false;
  markDirty('stream');
  notify('Титр прибрано');
}

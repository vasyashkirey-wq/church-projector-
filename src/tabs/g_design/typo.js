// ============================================================
// ВКЛАДКА «🔠 Текст» (typo) — читабельність тексту на проекторі:
// міжрядковий/міжлітерний інтервал, ВЕЛИКІ ЛІТЕРИ, швидкість переходу,
// контур/підкладка під текстом поверх відео, безпечні поля.
//
// Винесено з src/extras-3.js як пілотний етап модуляризації (План:
// розділення на файли-за-вкладкою, без зміни поведінки). Мусить
// завантажуватись ДО extras-4.js — pv2Init() звертається до
// renderTypoTab і applyTypo одразу при старті застосунку (масиви TABS
// і steps в extras-4.js).
// ============================================================

const TYPO_DEFAULTS = {
  lineHeight: 1.45, letterSpacing: 0, uppercase: false,
  strokeWidth: 0, strokeColor: '#000000',
  scrim: 0, scrimBlur: 0, safeArea: 0, fadeMs: 600
};

function typoGet() {
  return Object.assign({}, TYPO_DEFAULTS, loadJSON(STORAGE_KEYS.live + '_typo') || {});
}
function setTypo(key, val) {
  const t = typoGet();
  t[key] = val;
  saveJSON(STORAGE_KEYS.live + '_typo', t);
  applyTypo();
  const labels = {
    lineHeight: ['#typoLhLabel', v => v],
    letterSpacing: ['#typoLsLabel', v => v + 'px'],
    strokeWidth: ['#typoStrokeLabel', v => v ? v + 'px' : 'вимк'],
    scrim: ['#typoScrimLabel', v => Math.round(v * 100) + '%'],
    safeArea: ['#typoSafeLabel', v => v + '%'],
    fadeMs: ['#typoFadeLabel', v => (v / 1000).toFixed(2) + ' с']
  };
  const L = labels[key];
  if (L && $(L[0])) $(L[0]).textContent = L[1](val);
  if (['uppercase','scrimBlur'].includes(key)) markDirty('typo');
}
// Типографіка живе в темі проектора — шлемо її туди
function applyTypo() {
  const t = typoGet();
  if (typeof theme !== 'undefined' && theme) Object.assign(theme, t);
  if (window.electronAPI && window.electronAPI.setTheme) {
    window.electronAPI.setTheme(typeof theme !== 'undefined' ? theme : t);
  }
  updateLivePanels();
}

function renderTypoTab() {
  const t = typoGet();
  return `
  <div class="grid2">
    <div class="card">
      <div class="card-title">🔠 Читабельність</div>

      <div style="font-size:12px;color:var(--text2)">Міжрядковий інтервал: <b id="typoLhLabel">${t.lineHeight}</b></div>
      <input type="range" min="10" max="22" value="${Math.round(t.lineHeight*10)}"
             oninput="setTypo('lineHeight', parseInt(this.value,10)/10)" style="width:100%">

      <div style="font-size:12px;color:var(--text2)">Міжлітерний інтервал: <b id="typoLsLabel">${t.letterSpacing}px</b></div>
      <input type="range" min="-2" max="8" value="${t.letterSpacing}"
             oninput="setTypo('letterSpacing', parseInt(this.value,10))" style="width:100%">

      <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;margin-top:6px">
        <input type="checkbox" ${t.uppercase ? 'checked' : ''} onchange="setTypo('uppercase', this.checked)">
        ВЕЛИКИМИ ЛІТЕРАМИ
      </label>

      <div style="font-size:12px;color:var(--text2);margin-top:8px">Швидкість переходу: <b id="typoFadeLabel">${(t.fadeMs/1000).toFixed(2)} с</b></div>
      <input type="range" min="150" max="1500" step="50" value="${t.fadeMs}"
             oninput="setTypo('fadeMs', parseInt(this.value,10))" style="width:100%">
    </div>

    <div class="card">
      <div class="card-title">🎬 Текст поверх відео</div>
      <div class="card-sub">На строкатому відео-фоні самої тіні мало. Контур і підкладка рятують.</div>

      <div style="font-size:12px;color:var(--text2);margin-top:6px">Контур літер: <b id="typoStrokeLabel">${t.strokeWidth ? t.strokeWidth + 'px' : 'вимк'}</b></div>
      <input type="range" min="0" max="6" value="${t.strokeWidth}"
             oninput="setTypo('strokeWidth', parseInt(this.value,10))" style="width:100%">
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
        <span style="font-size:12px;color:var(--text2)">Колір контуру</span>
        <input type="color" value="${t.strokeColor}" oninput="setTypo('strokeColor', this.value)"
               style="width:40px;height:24px;border:none;background:none">
      </div>

      <div style="font-size:12px;color:var(--text2);margin-top:8px">Підкладка під текстом: <b id="typoScrimLabel">${Math.round(t.scrim*100)}%</b></div>
      <input type="range" min="0" max="90" value="${Math.round(t.scrim*100)}"
             oninput="setTypo('scrim', parseInt(this.value,10)/100)" style="width:100%">
      ${t.scrim > 0 ? `<label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
        <input type="checkbox" ${t.scrimBlur ? 'checked' : ''} onchange="setTypo('scrimBlur', this.checked ? 12 : 0)">
        Розмити фон під текстом
      </label>` : ''}

      <div style="font-size:12px;color:var(--text2);margin-top:8px">Безпечні поля (обрізка країв ТВ): <b id="typoSafeLabel">${t.safeArea}%</b></div>
      <input type="range" min="0" max="10" value="${t.safeArea}"
             oninput="setTypo('safeArea', parseInt(this.value,10))" style="width:100%">
    </div>
  </div>`;
}

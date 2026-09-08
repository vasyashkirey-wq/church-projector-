// ============================================================
// ВКЛАДКА «🎵 Пісня» (song) — ЛИШЕ розмітка (render-функція).
//
// ⚠️ НАВМИСНО винесено ОКРЕМО від типового підходу цієї модуляризації
// (той самий підхід, що вже застосований для router.js/live.js): уся
// логіка, яку викликає ця вкладка (songStep, orderAdd, orderRemoveAt,
// toggleChorusEach, applyArrangePreset, orderReset, setSplit,
// songSizeStep, songSizeReset, setPartLabel, toggleArrangeGlobal і
// решта) НЕ переносилась сюди — songStep і кілька інших використовуються
// й з src/song-display.js, і з гарячих клавіш (extras-4.js), не лише з
// цієї вкладки. Лишається в extras-2.js/extras-3.js.
//
// Продовження модуляризації (typo.js → ... → router.js/live.js → ця).
// Мусить завантажуватись ДО extras-4.js — renderSongTab викликається з
// dispatch-таблиці renderTabInto (extras-1.js) і з масиву TABS у
// pv2Init().
// ============================================================

function renderSongTab() {
  const s = state.selectedSong;
  if (!s || !s.verses) {
    return '<div class="card"><div class="card-title">🎵 Пісня</div><div class="card-sub">Обери пісню у вкладці «Пісні».</div></div>';
  }
  const order = songOrder(s);
  const slides = songSlides(s);
  const sc = state.splitCfg;

  const _liveKey = (typeof songKey === 'function') ? songKey(s) : '';
  const orderChips = order.map((idx, pos) => {
    const b = partBadge(s, idx);
    const active = (state._slideSong === _liveKey && state.slideIdx === pos);
    // Останній пункт аранжування — незалежно від того, куплет це чи приспів —
    // позначаємо зірочками, щоб оператор одразу бачив «далі пісня закінчиться»,
    // а не гортав наосліп і не наштовхнувся на кінець посеред слова.
    const isLast = pos === order.length - 1;
    const ring = active ? 'box-shadow:0 0 0 2px #22c55e;' : '';
    return `<span draggable="true" ondragstart="orderDragStart(event,${pos})" ondragover="orderDragOver(event)" ondrop="orderDrop(event,${pos})" title="Перетягни, щоб змінити порядок${isLast ? ' — ★ останній пункт, далі кінець пісні' : ''}" style="display:inline-flex;align-items:center;gap:3px;background:${b.color};color:#fff;
                  border-radius:5px;padding:3px 6px;font-size:11px;margin:2px;cursor:grab;${ring}">
       ${active ? '▶ ' : ''}${esc(b.label)}${isLast ? ' ★' : ''}
       <button onclick="orderRemoveAt(${pos})" style="background:none;border:none;color:#fff;cursor:pointer;font-size:12px;padding:0 2px">✕</button>
     </span>`;
  }).join('');

  const addBtns = s.verses.map((v, i) => {
    const b = partBadge(s, i);
    return `<button class="preset-btn" style="border-left:3px solid ${b.color}" onclick="orderAdd(${i})">+ ${esc(b.label)}</button>`;
  }).join(' ');

  const partOpts = (cur) => Object.keys(PART_TYPES).map(k =>
    `<option value="${k}"${k === cur ? ' selected' : ''}>${PART_TYPES[k].label}</option>`).join('');
  const partsEditor = s.verses.map((v, i) => {
    const b = partBadge(s, i);
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
       <span style="width:13px;height:13px;border-radius:3px;background:${b.color};flex:none"></span>
       <span style="width:18px;font-size:11px;color:var(--text2)">${i + 1}</span>
       <select onchange="setPartLabel(${i}, this.value)" style="font-size:11px">${partOpts(partKeyOf(s, i))}</select>
       <span style="flex:1;font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(String(v).split('\n')[0].slice(0, 30))}</span>
     </div>`;
  }).join('');

  const slideList = slides.map((sl, i) =>
    `<div style="padding:4px 6px;border-bottom:1px solid var(--border);font-size:11px;cursor:pointer;
                 background:${i === state.slideIdx ? 'var(--panel2)' : 'transparent'}"
          onclick="state.slideIdx=${i - 1}; songStep(1)">
       <b style="color:var(--accent)">${sl.verseIdx + 1}${sl.parts > 1 ? '.' + sl.part : ''}</b>
       <span style="color:var(--text2)">${esc(String(sl.text).split('\n')[0].slice(0, 40))}…</span>
       ${sl.parts > 1 ? `<span style="color:var(--gold);font-size:12px"> (слайд ${sl.part} з ${sl.parts})</span>` : ''}
     </div>`).join('');

  return `
  <div class="grid2">
    <div class="card">
      <div class="card-title">🎵 Порядок частин — «${esc(s.title)}»</div>
      <div class="card-sub">Домовились співати приспів двічі? Склади порядок один раз — далі просто гортаєш. Чипи можна <b>перетягувати мишкою</b>, щоб змінити порядок. Або увімкни перемикач нижче — приспів сам стане після кожного куплета.</div>
      <div style="margin-top:6px;min-height:30px">${orderChips || '<span style="font-size:11px;color:var(--text2)">Порожньо</span>'}</div>
      <div style="margin-top:6px;display:flex;gap:3px;flex-wrap:wrap">${addBtns}</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;background:linear-gradient(135deg,rgba(124,92,255,.14),rgba(79,155,255,.08));border:1px solid var(--accent);border-radius:7px;font-size:13px;cursor:pointer">
        <input type="checkbox" style="width:16px;height:16px;cursor:pointer" ${state.arrangeGlobal ? 'checked' : ''} onchange="toggleArrangeGlobal(this.checked)">
        <span>🌍 <b>Приспів після кожного — ДЛЯ ВСІХ пісень</b> (увімкни раз — діє скрізь)</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;background:var(--panel2);border:1px solid var(--border);border-radius:7px;font-size:13px;cursor:pointer">
        <input type="checkbox" style="width:16px;height:16px;cursor:pointer" ${state.chorusEach[songKey(s)] ? 'checked' : ''} onchange="toggleChorusEach(this.checked)">
        <span>🔁 <b>Приспів після кожного куплета</b> — увімкни, і порядок збудується сам</span>
      </label>
      <select onchange="applyArrangePreset(this.value); this.value=''" style="width:100%;margin-top:6px;background:var(--panel2);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text);font-size:12px;cursor:pointer">
        <option value="">📋 Інші готові варіанти…</option>
        <option value="end">Приспів лише в кінці</option>
        <option value="frame">Приспів спочатку і в кінці</option>
        <option value="last2">Приспів після кожного + останній куплет двічі</option>
        <option value="verses">Тільки куплети (без приспіву)</option>
        <option value="plain">↺ Усі підряд (скинути порядок)</option>
      </select>
      <details style="margin-top:8px">
        <summary style="font-size:11px;cursor:pointer;color:var(--text2)">🏷 Мітки частин (Куплет / Приспів / Міст…)</summary>
        <div style="margin-top:6px">${partsEditor}</div>
      </details>
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="orderReset()">↺ Скинути (усі підряд)</button>
      ${renderArrangeSets(s)}
    </div>

    <div class="card">
      <div class="card-title">✂️ Розбиття довгих куплетів</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
        <input type="checkbox" ${sc.on ? 'checked' : ''} onchange="setSplit('on', this.checked)">
        Розбивати довгий текст на кілька слайдів
      </label>
      <div style="font-size:12px;color:var(--text2);margin-top:6px">Максимум рядків на слайд: <b>${sc.maxLines}</b></div>
      <input type="range" min="2" max="8" value="${sc.maxLines}" onchange="setSplit('maxLines', parseInt(this.value,10))" style="width:100%">
      <div style="font-size:12px;color:var(--text2)">Максимум символів: <b>${sc.maxChars}</b></div>
      <input type="range" min="80" max="400" step="20" value="${sc.maxChars}" onchange="setSplit('maxChars', parseInt(this.value,10))" style="width:100%">
      <div class="card-sub" style="margin-top:4px">Дрібний шрифт у великому залі не читається — краще два слайди.</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">📃 Слайди пісні (${slides.length})</div>
    <div style="display:flex;gap:4px;margin-bottom:6px;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="songStep(-1)">◀ Назад</button>
      <button class="btn btn-primary btn-sm" onclick="songStep(1)">Далі ▶</button>
      <button class="btn btn-ghost btn-sm" onclick="state.slideIdx=-1; songStep(1)">⏮ Спочатку</button>
      <span style="flex:1"></span>
      <span style="font-size:10px;color:var(--text2)">Розмір:</span>
      <button class="btn btn-ghost btn-sm" onclick="songSizeStep(-4)" title="Менший шрифт пісні">A−</button>
      <span style="font-size:11px;font-weight:700;min-width:38px;text-align:center;color:var(--accent)">${state.songSize ? state.songSize + 'px' : 'авто'}</span>
      <button class="btn btn-ghost btn-sm" onclick="songSizeStep(4)" title="Більший шрифт пісні">A+</button>
      ${state.songSize ? '<button class="btn btn-ghost btn-sm" onclick="songSizeReset()" title="Повернути авто-підгін">↺</button>' : ''}
    </div>
    <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:5px">${slideList}</div>
  </div>`;
}

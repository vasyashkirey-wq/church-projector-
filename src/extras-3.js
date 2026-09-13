// ============================================================
// СТАНЦІЇ: 2 ПК + планшети/телефони
// Хост тримає вікна виводу. Клієнт — повноцінна панель, але свої
// відправки він НЕ виводить локально, а надсилає хосту.
// ============================================================
const STATION_PORT = 4242;
let stationWs = null;

function isClientStation() { return state.station.mode === 'client' && state.station.connected; }

// ---- ХОСТ ----
// Команда з іншої станції — виконуємо як свою
function applyStationCommand(cmd) {
  if (!cmd || !cmd.action) return;
  const p = cmd.payload || {};
  const from = cmd.from || 'станція';
  switch (cmd.action) {
    case 'send-text': setGoingLive(true); try { doSend(p.text, p.ref); } finally { setGoingLive(false); } break;
    case 'send-html': setGoingLive(true); try { doSendHTML(p.html, p.label); } finally { setGoingLive(false); } break;
    case 'stage':     stageContent(p.content); break;
    case 'go-live':   goLive(); break;
    case 'clear':     clearLive(); break;
    case 'blackout':  toggleBlackout(); break;
    case 'next':      previewStep(1);  if (state.liveMode !== 'staged') goLive(); break;
    case 'prev':      previewStep(-1); if (state.liveMode !== 'staged') goLive(); break;
    // Конкретна закладка/пункт плану/оголошення — для Stream Deck, де кожна
    // кнопка має викликати ЗАЗДАЛЕГІДЬ ЗАДАНУ дію, а не просто «далі/назад».
    case 'bookmark':  if (typeof showBookmark === 'function') showBookmark(parseInt(p.idx, 10) || 0); break;
    case 'plan-item': if (typeof svcGoTo === 'function') svcGoTo(parseInt(p.idx, 10) || 0); break;
    case 'announce':  if (typeof sendSavedAnnounce === 'function') sendSavedAnnounce(parseInt(p.id, 10)); break;
    case 'gdd':       if (window.electronAPI.gddCommand) window.electronAPI.gddCommand(null, p.action, p.data); break;
    case 'alert':     if (window.electronAPI.sendAlert) window.electronAPI.sendAlert(p.cfg || null, p.kind || null); break;
    case 'freeze':    if (typeof toggleFreeze === 'function') toggleFreeze(); break;
    default: return;
  }
  notify('📡 ' + from + ': ' + cmd.action);
  hostBroadcastState();
}

// Хост розсилає свій стан станціям і пультам
const hostBroadcastState = rafDebounce(function() {
  if (state.station.mode !== 'host' || !window.electronAPI || !window.electronAPI.stationBroadcast) return;
  window.electronAPI.stationBroadcast({
    type: 'state',
    data: {
      onAir: state.onAir ? { label: state.onAir.label, ref: state.onAir.ref, html: state.onAir.html } : null,
      preview: state.preview ? { label: state.preview.label, ref: state.preview.ref } : null,
      liveMode: state.liveMode,
      song: state.selectedSong ? state.selectedSong.title : null,
      verseIdx: state.selectedVerseIdx
    }
  });
});

// ---- КЛІЄНТ ----
let _stationRetry = 0, _stationRetryTimer = null;
// Клієнт шле команду хосту замість локального виводу
function stationSend(action, payload) {
  if (!stationWs || stationWs.readyState !== 1) { notify('⚠️ Немає зв\'язку з хостом'); return false; }
  stationWs.send(JSON.stringify({ type: 'cmd', action: action, payload: payload || {} }));
  return true;
}

// ---- Пульти на телефонах ----
// ВАДА, яку це виправляє: після появи режиму «спершу прев'ю» команди з пульта
// потрапляли в прев'ю, і на екрані в залі нічого не змінювалось. Помічник тисне —
// нічого не відбувається. Тепер пульт завжди діє на ЕФІР.
function initRemoteListener() {
  if (!window.electronAPI || !window.electronAPI.onRemoteCommand) return;
  window.electronAPI.onRemoteCommand(cmd => {
    if (!cmd || !cmd.action) return;
    // Клієнтська станція не має власного виводу — пересилаємо хосту
    if (isClientStation()) { stationSend(cmd.action, cmd.payload || {}); return; }

    const staged = state.liveMode === 'staged';
    switch (cmd.action) {
      case 'next-verse': case 'next':
        // PDF/слайд в ефірі МАЄ мати пріоритет над фолбеком на selectedSong
        // нижче — інакше стара вибрана пісня перехоплює команду з пульта, і
        // замість наступної сторінки PDF в ефір летить пісня поверх нього.
        if (state.service.idx >= 0) { svcNext(); if (staged) goLive(); }   // служба за планом
        else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf' && typeof nextSlide === 'function') { nextSlide(); }
        else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible' && typeof nextBibleVerse === 'function') { nextBibleVerse(); }  // Біблія в ефірі → наступний вірш Біблії
        else if (state.selectedSong && (state.splitCfg.on || state.orders[songKey(state.selectedSong)])) { songStep(1); if (staged) goLive(); }
        else if (staged) { previewStep(1); goLive(); }
        else if (typeof nextVerse === 'function') { nextVerse(); if (typeof sendToProjector === 'function') sendToProjector(); }
        break;
      case 'prev-verse': case 'prev':
        if (state.service.idx >= 0) { svcPrev(); if (staged) goLive(); }
        else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf' && typeof prevSlide === 'function') { prevSlide(); }
        else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible' && typeof prevBibleVerse === 'function') { prevBibleVerse(); }
        else if (state.selectedSong && (state.splitCfg.on || state.orders[songKey(state.selectedSong)])) { songStep(-1); if (staged) goLive(); }
        else if (staged) { previewStep(-1); goLive(); }
        else if (typeof prevVerse === 'function') { prevVerse(); if (typeof sendToProjector === 'function') sendToProjector(); }
        break;
      case 'go-live':
        goLive();
        break;
      case 'undo':
        undoLast();
        break;
      case 'lower':
        lowerToggle();
        break;
      case 'clear':
        clearLive();
        break;
      // 'blackout' і 'freeze' були у білому списку HTTP API (main.js), але тут
      // не оброблялись — Stream Deck отримував «успіх», а на екрані нічого
      // не змінювалось.
      case 'blackout':
        toggleBlackout();
        break;
      case 'freeze':
        if (typeof toggleFreeze === 'function') toggleFreeze();
        break;
      case 'select-verse':
        if (staged && cmd.idx !== undefined && state.selectedSong) {
          const v = state.selectedSong.verses[cmd.idx];
          if (v != null) {
            stageContent({ kind:'text', rawText:v, html:hallText(v).replace(/\n/g,'<br>'),
                           ref:songRefForDisplay(state.selectedSong.title), label:(state.selectedSong.title||'')+' — куплет '+(cmd.idx+1), verseIdx:cmd.idx });
            goLive();
          }
        }
        break;
      // Конкретна закладка/пункт плану/оголошення — для Stream Deck, де кожна
      // кнопка має викликати ЗАЗДАЛЕГІДЬ ЗАДАНУ дію, а не просто «далі/назад».
      // /api/bookmark?idx=0  /api/plan-item?idx=2  /api/announce?id=169...
      case 'bookmark':
        if (typeof showBookmark === 'function') showBookmark(parseInt((cmd.payload && cmd.payload.idx) || 0, 10));
        break;
      case 'plan-item':
        if (typeof svcGoTo === 'function') svcGoTo(parseInt((cmd.payload && cmd.payload.idx) || 0, 10));
        break;
      case 'announce':
        if (typeof sendSavedAnnounce === 'function' && cmd.payload && cmd.payload.id) sendSavedAnnounce(parseInt(cmd.payload.id, 10));
        break;
      default: return; // решту (bible, projector) обробляє сам додаток
    }
    hostBroadcastState();
  });
}


// ---- Вкладка «Мова / Музиканти / OBS» ----
// ---- OBS ----
function obsScene(name) { obsAct('scene', name); }
// За індексом — щоб апостроф у назві сцени не розривав onclick
function initObsListener() {
  const saved = loadJSON(STORAGE_KEYS.live + '_obs');
  state.obs = Object.assign({ connected: false, scenes: [], current: '' }, saved || {});
  if (window.electronAPI && window.electronAPI.onObsState) {
    window.electronAPI.onObsState(s => {
      state.obs = Object.assign({}, state.obs, s);
      if (isActive('extras')) markDirty('extras');
    });
  }
}


// ============================================================
// ШАРИ ЕКРАНА (керування з панелі)
// ============================================================
function loadLayers() {
  const c = loadJSON(STORAGE_KEYS.live + '_layers');
  if (!c) return;
  state.logo = c.logo || null;
  if (c.logoSettings) {
    // "on" свідомо НЕ відновлюємо при старті (як і раніше — логотип-заставку
    // ніколи не показувало автоматично після перезапуску, лише пам'ятало
    // саму картинку). Позицію/розмір — відновлюємо, щоб не губились налаштування.
    [1, 2, 3, 4].forEach(function(n) {
      if (c.logoSettings[n]) {
        state.logoSettings[n].position = c.logoSettings[n].position || state.logoSettings[n].position;
        state.logoSettings[n].size = c.logoSettings[n].size || state.logoSettings[n].size;
      }
    });
  }
  state.bgVideo = c.bgVideo || null;
  state.bgQueue = c.bgQueue || [];
  state.bgQueueInterval = c.bgQueueInterval || 30;
  state.bgQueueIdx = c.bgQueueIdx || 0;
  if (c.watermark) {
    // Міграція зі старого формату (один спільний об'єкт, не мапа по виходах):
    // якщо в збереженому є "text"/"on" напряму (не 1/2/3/4-ключі) — це старий
    // запис, застосовуємо його як стартове значення для виходу 1 (проектор),
    // а решта лишаються вимкненими за замовчуванням.
    if (typeof c.watermark.text === 'string' && !c.watermark[1]) {
      Object.assign(state.watermark[1], c.watermark);
    } else {
      [1, 2, 3, 4].forEach(function(n) { if (c.watermark[n]) Object.assign(state.watermark[n], c.watermark[n]); });
    }
  }
  if (state.bgAudio && c.volume != null) state.bgAudio.volume = c.volume;
  // Відновлюємо фон і логотип на вже відкритих виходах
  if (state.bgVideo && window.electronAPI && window.electronAPI.setBgVideo) {
    window.electronAPI.setBgVideo({ src: state.bgVideo.src, loop: true, speed: state.bgVideo.speed || 1 });
  }
  // Водяний знак теж має пережити перезапуск і одразу з'явитись на КОЖНОМУ
  // виході, де був увімкнений, — незалежно один від одного.
  [1, 2, 3, 4].forEach(function(n) {
    if (state.watermark[n].on && window.electronAPI && window.electronAPI.showWatermark) {
      window.electronAPI.showWatermark(state.watermark[n], OUT_KIND[n]);
    }
  });
}
function saveLayers() {
  // Сесійні blob-посилання після перезапуску мертві — не зберігаємо їх
  const v = (state.bgVideo && !state.bgVideo.session) ? state.bgVideo : null;
  saveJSON(STORAGE_KEYS.live + '_layers', {
    logo: state.logo,          // логотип — картинка, невелика, можна тримати як dataURL
    logoSettings: state.logoSettings,
    bgVideo: v,                // лише шлях до файлу
    bgQueue: (state.bgQueue || []).filter(x => !x.session),
    bgQueueInterval: state.bgQueueInterval || 30,
    bgQueueIdx: state.bgQueueIdx || 0,
    watermark: state.watermark,
    volume: state.bgAudio ? state.bgAudio.volume : 0.5
  });
}

// ---- Відео-фон під текстом ----
function applyBgVideo(kind) {
  if (!window.electronAPI || !window.electronAPI.setBgVideo) return;
  const v = state.bgVideo;
  window.electronAPI.setBgVideo(v ? { src: v.src, loop: true, speed: v.speed || 1 } : null, kind || null);
}
// ---- Черга відео-фонів з авто-перемиканням по таймеру ----
// (кілька роликів по черзі — напр. фон до служби, що сам змінюється)
let _bgQueueTimer = null;
function bgQueueAdvance() {
  const q = state.bgQueue || [];
  if (!q.length) return;
  state.bgQueueIdx = ((state.bgQueueIdx || 0) + 1) % q.length;
  state.bgVideo = Object.assign({ speed: 1 }, q[state.bgQueueIdx]);
  saveLayers();
  applyBgVideo();
  markDirty('layers');
}
// ---- Логотип / заморозка ----
// Показ логотипа — ОКРЕМИЙ для кожного з 4 виходів. position визначає режим:
// 'center-full' — на весь екран (як заставка паузи, перекриває контент,
// автоматично ховається при новому слайді); кутова позиція — маленький
// значок, як водяний знак, лишається поверх контенту завжди.
function showLogo(n, on) {
  if (!window.electronAPI || !window.electronAPI.showLogo) return;
  if (on && !state.logo) { notify('⚠️ Спершу завантаж логотип'); return; }
  const s = state.logoSettings[n];
  window.electronAPI.showLogo(on ? { dataUrl: state.logo, position: s.position, size: s.size } : null, OUT_KIND[n]);
  s.on = !!on;
  markDirty('layers');
  notify(on ? '🖼 ' + OUT_NAME[n] + ': логотип на екрані' : '🖼 ' + OUT_NAME[n] + ': логотип прибрано');
}
// Постійний водяний знак — на відміну від логотипа, не ховається при зміні
// контенту (пісня/вірш/оголошення тощо), лишається поверх усього завжди,
// поки не вимкнеш. ОКРЕМИЙ для кожного з 4 виходів — можна, наприклад, мати
// водяний знак на трансляції й не мати на проекторі, або зовсім різний текст.
// НЕ перебудовуємо тут всю панель (renderTabInto) — інакше текстове поле
// втрачало б фокус прямо під час набору тексту (як і з повзунками раніше).
// Для кнопок позиції — тут перебудова панелі безпечна (це клік, не набір
// тексту), і потрібна, щоб підсвітити нову активну кнопку.
// Перемикає, налаштування ЯКОГО виходу зараз показано в панелі.
// Глобальна заморозка — гаряча клавіша й швидка кнопка в «Шарах» керують
// усіма 4 виходами одразу. Якщо ХОЧ ОДИН зараз заморожений — розморожуємо
// всі; інакше заморожуємо всі. Той самий стан (state.frozen), що й
// toggleFreezeOutput(n) нижче — не дублюємо логіку, лише різний обсяг дії.
function toggleFreeze() {
  if (!window.electronAPI || !window.electronAPI.freezeOutput) return;
  // Якщо ВСІ 4 вже заморожені — розморожуємо всі. Інакше (частково або
  // ніхто не заморожений) — заморожуємо всі. Так натискання завжди дає
  // передбачуваний результат «усе заморожено», а не залежить від того,
  // хтось міг заморозити один вихід окремо раніше через toggleFreezeOutput.
  const allFrozen = [1, 2, 3, 4].every(n => state.frozen[n]);
  const next = !allFrozen;
  [1, 2, 3, 4].forEach(n => { state.frozen[n] = next; });
  window.electronAPI.freezeOutput(next);   // без kind — на всі 4 одразу
  markDirty('layers');
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();   // банер видно з будь-якої вкладки
  notify(next ? '❄️ Кадр заморожено на всіх виходах — зал бачить застиглу картинку' : '▶ Розморожено всі виходи');
}
// Заморозка ОДНОГО конкретного виходу — напр. заморозити картинку для
// співаків (Вихід 3), лишивши трансляцію живою.
function toggleFreezeOutput(n) {
  if (!window.electronAPI || !window.electronAPI.freezeOutput) return;
  const next = !state.frozen[n];
  state.frozen[n] = next;
  window.electronAPI.freezeOutput(next, OUT_KIND[n]);
  markDirty('router');
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();
  notify(next ? '❄️ ' + OUT_NAME[n] + ': заморожено' : '▶ ' + OUT_NAME[n] + ': розморожено');
}

// ---- Оголошення ПОВЕРХ слайда ----
function sendAlert() {
  const cfg = {
    text: ($('#alertText') && $('#alertText').value.trim()) || '',
    position: state.alertCfg.position,
    size: state.alertCfg.size,
    seconds: state.alertCfg.seconds,
    ticker: state.alertCfg.ticker,
    color: '#c8a84b'
  };
  if (!cfg.text) { notify('⚠️ Введи текст оголошення'); return; }
  state.alertCfg.text = cfg.text;
  const kind = state.alertCfg.targetOutput ? OUT_KIND[state.alertCfg.targetOutput] : null;
  if (isClientStation()) { stationSend('alert', { cfg: cfg, kind: kind }); notify('📡 Оголошення через хост'); return; }
  if (window.electronAPI && window.electronAPI.sendAlert) window.electronAPI.sendAlert(cfg, kind);
  notify('📢 Оголошення поверх слайда' + (kind ? ' → ' + esc(OUT_NAME[state.alertCfg.targetOutput]) : '') + ' (пісня триває)');
}
// На який вихід слати оголошення/біжучий рядок: null = на всі одразу (як було раніше).
// ---- Props: збережені ПОСТІЙНІ накладки (текст поверх слайда, до вимкнення) ----
function loadProps() {
  const d = loadJSON('church_props');
  state.props = Array.isArray(d) ? d : [];
  state.activePropName = null;
}
function saveProps() { saveJSON('church_props', state.props); }

function savePropFromAlert() {
  const text = ($('#alertText') && $('#alertText').value.trim()) || state.alertCfg.text || '';
  if (!text) { notify('⚠️ Спершу введи текст у «Оголошення ПОВЕРХ слайда» вище'); return; }
  pv2Prompt('Назва props (напр. «Прямий ефір», «Вимкніть телефони»):', function(name){
    if (!name || !name.trim()) return;
    name = name.trim();
    state.props = (state.props || []).filter(p => p.name !== name);
    state.props.push({ name: name, text: text, position: state.alertCfg.position, size: state.alertCfg.size, ticker: state.alertCfg.ticker });
    saveProps();
    markDirty('layers');
    notify('📌 Props «' + name + '» збережено');
  });
}

function toggleProp(i) {
  const p = state.props[i];
  if (!p) return;
  if (state.propHideTimer) { clearTimeout(state.propHideTimer); state.propHideTimer = null; }
  if (state.activePropName === p.name) {           // вимикаємо
    hideAlert();
    state.activePropName = null;
  } else {                                          // показуємо ПОСТІЙНО (seconds:0)
    const cfg = { text: p.text, position: p.position || 'bottom', size: p.size || 34, seconds: 0, ticker: !!p.ticker, color: '#c8a84b' };
    const kind = state.alertCfg.targetOutput ? OUT_KIND[state.alertCfg.targetOutput] : null;
    if (typeof isClientStation === 'function' && isClientStation()) { stationSend('alert', { cfg: cfg, kind: kind }); }
    else if (window.electronAPI && window.electronAPI.sendAlert) { window.electronAPI.sendAlert(cfg, kind); }
    state.activePropName = p.name;
    notify('📌 «' + p.name + '» — на екрані' + (p.autoHide > 0 ? ' (сховається за ' + p.autoHide + ' хв)' : ''));
    if (p.autoHide > 0) {
      state.propHideTimer = setTimeout(function() {
        if (state.activePropName === p.name) {
          hideAlert(); state.activePropName = null; state.propHideTimer = null;
          try { markDirty('layers'); } catch (e) {}
          notify('⏱ «' + p.name + '» приховано автоматично');
        }
      }, p.autoHide * 60000);
    }
  }
  markDirty('layers');
}

function setPropAutoHide(i) {
  const p = state.props[i]; if (!p) return;
  pv2Prompt('Авто-приховати «' + p.name + '» через скільки хвилин? (0 = не ховати)', String(p.autoHide || 0), function(v) {
    if (v === null) return;
    p.autoHide = Math.max(0, parseInt(v, 10) || 0);
    saveProps();
    markDirty('layers');
    notify(p.autoHide > 0 ? '⏱ «' + p.name + '» ховатиметься за ' + p.autoHide + ' хв' : '⏱ Авто-приховування вимкнено');
  });
}

function deleteProp(i) {
  const p = state.props[i];
  if (!p || !confirm('Видалити props «' + p.name + '»?')) return;
  if (state.activePropName === p.name) { hideAlert(); state.activePropName = null; }
  state.props.splice(i, 1);
  saveProps();
  markDirty('layers');
}

// ---- Шаблони повідомлень із токенами ({дата},{час},{ім'я}…) ---------------
function loadMsgTemplates() { const d = loadJSON('church_msgtemplates'); state.msgTemplates = Array.isArray(d) ? d : []; }
function saveMsgTemplates() { saveJSON('church_msgtemplates', state.msgTemplates); }
function addMsgTemplate() {
  pv2Prompt("Назва шаблону (напр. «День народження»):", "", function(name) {
    if (name === null || !name.trim()) return;
    name = name.trim();
    pv2Prompt("Текст. Токени: {дата} і {час} — автоматично, інші (напр. {імʼя}) спитає при використанні:", "", function(text) {
      if (text === null || !text.trim()) return;
      state.msgTemplates.push({ name: name, text: text.trim() });
      saveMsgTemplates();
      markDirty('layers');
      notify("✍️ Шаблон «" + name + "» збережено");
    });
  });
}
function deleteMsgTemplate(i) {
  if (!state.msgTemplates[i]) return;
  if (!confirm("Видалити шаблон «" + state.msgTemplates[i].name + "»?")) return;
  state.msgTemplates.splice(i, 1);
  saveMsgTemplates();
  markDirty('layers');
}
function useMsgTemplate(i) {
  const t = state.msgTemplates[i]; if (!t) return;
  const now = new Date();
  let text = t.text
    .replace(/{дата}/gi, now.toLocaleDateString("uk-UA"))
    .replace(/{час}/gi, now.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }));
  const toks = [], seen = {};
  (text.match(/{([^}]+)}/g) || []).forEach(function(tok) { if (!seen[tok]) { seen[tok] = 1; toks.push(tok); } });
  const apply = function() {
    const el = document.getElementById("alertText");
    if (el) el.value = text;
    if (state.alertCfg) state.alertCfg.text = text;
    notify("✍️ Текст готовий — натисни «Показати» в «Оголошення ПОВЕРХ слайда»");
  };
  const ask = function(idx) {
    if (idx >= toks.length) { apply(); return; }
    const tok = toks[idx];
    pv2Prompt(tok.slice(1, -1) + ":", "", function(val) {
      text = text.split(tok).join(val == null ? "" : val);
      ask(idx + 1);
    });
  };
  ask(0);
}

function renderMsgTemplatesCard() {
  const list = state.msgTemplates || [];
  const items = list.length
    ? list.map((t, i) => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <button class="btn btn-ghost btn-sm" style="flex:1;text-align:left" onclick="useMsgTemplate(${i})" title="${esc(t.text)}">✍️ ${esc(t.name)}</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteMsgTemplate(${i})">✕</button></div>`).join('')
    : '<div class="card-sub">Немає шаблонів. Створи типові оголошення з підстановками.</div>';
  return `<div class="card">
    <div class="card-title">✍️ Шаблони повідомлень</div>
    <div class="card-sub">Готові оголошення з токенами: {дата}, {час} — автоматично; інші (напр. {ім'я}) спитає. Заповнене йде в поле «Оголошення» вище — там тиснеш «Показати».</div>
    <div style="margin-top:6px">${items}</div>
    <button class="btn btn-primary btn-sm btn-block" style="margin-top:6px" onclick="addMsgTemplate()">➕ Новий шаблон</button>
  </div>`;
}

function renderPropsCard() {
  const props = state.props || [];
  const items = props.length
    ? props.map((p, i) => {
        const on = state.activePropName === p.name;
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <button class="btn ${on ? 'btn-success' : 'btn-ghost'} btn-sm" style="flex:1;text-align:left" onclick="toggleProp(${i})">${on ? '● ' : '○ '}${esc(p.name)}</button>
          <button class="btn btn-ghost btn-sm" onclick="setPropAutoHide(${i})" title="Авто-приховати через N хв">⏱${p.autoHide > 0 ? p.autoHide + 'хв' : ''}</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteProp(${i})" title="Видалити">✕</button>
        </div>`;
      }).join('')
    : '<div class="card-sub">Немає збережених. Введи текст у «Оголошення ПОВЕРХ слайда» вище і натисни «➕ Зберегти як props».</div>';
  return `<div class="card" style="border-color:var(--accent)">
    <div class="card-title">📌 Props — постійні накладки</div>
    <div class="card-sub">Збережені повідомлення, що висять поверх будь-якого контенту, поки не вимкнеш (напр. «🔴 ПРЯМИЙ ЕФІР»). Клік — увімкнути/вимкнути.</div>
    <div style="margin-top:6px">${items}</div>
    <button class="btn btn-primary btn-sm btn-block" style="margin-top:6px" onclick="savePropFromAlert()">➕ Зберегти поточне оголошення як props</button>
  </div>`;
}

// ---- Аудіо-бін: короткі звуки по кліку (амінь, аплодисменти, дзвіночок…) ---
let _soundBinPlaying = [];
function loadSoundBin() { const d = loadJSON('church_soundbin'); state.soundBin = Array.isArray(d) ? d : []; }
function saveSoundBin() { saveJSON('church_soundbin', (state.soundBin || []).filter(s => !s.session)); }
function loadSoundToBin(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  state.soundBin = state.soundBin || [];
  let pending = files.length;
  files.forEach(function(f) {
    const add = function(src, session) {
      state.soundBin.push({ name: f.name.replace(/\.[^.]+$/, ''), src: src, session: !!session });
      if (--pending === 0) { saveSoundBin(); markDirty('layers'); notify('🔊 Додано звуків: ' + files.length); }
    };
    if (f.path && typeof pathToFileUrl === 'function') {
      ensureSupportedMedia(f.path, function(cpath) { add(pathToFileUrl(cpath), false); });
    } else {
      add(URL.createObjectURL(f), true);
    }
  });
  input.value = '';
}
function playSound(i) {
  const s = state.soundBin[i]; if (!s) return;
  try {
    const a = new Audio(s.src);
    a.play().catch(() => notify('⚠️ Не вдалось відтворити'));
    _soundBinPlaying.push(a);
    a.onended = function() { _soundBinPlaying = _soundBinPlaying.filter(x => x !== a); };
  } catch (e) { notify('⚠️ Помилка звуку'); }
}
function stopAllSounds() {
  _soundBinPlaying.forEach(a => { try { a.pause(); } catch (e) {} });
  _soundBinPlaying = [];
  notify('⏹ Звуки зупинено');
}
function removeSound(i) {
  if (!state.soundBin[i]) return;
  state.soundBin.splice(i, 1);
  saveSoundBin();
  markDirty('layers');
}
function renderSoundBinCard() {
  const bin = state.soundBin || [];
  const btns = bin.length
    ? bin.map((s, i) => `<div style="display:flex;gap:3px;margin:2px 0">
        <button class="btn btn-ghost btn-sm" style="flex:1;text-align:left" onclick="playSound(${i})">🔊 ${esc(s.name)}</button>
        <button class="btn btn-ghost btn-sm" onclick="removeSound(${i})" title="Прибрати">✕</button></div>`).join('')
    : '<div class="card-sub">Порожньо — додай короткі звуки (амінь, аплодисменти, дзвіночок…).</div>';
  return `<div class="card">
    <div class="card-title">🔊 Звукові кнопки</div>
    <div class="card-sub">Короткі звуки по кліку (можуть накладатись). Довгу фонову музику став у картці вище.</div>
    <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" multiple onchange="loadSoundToBin(this)" style="font-size:11px;width:100%;margin-top:6px">
    <div style="margin-top:6px">${btns}</div>
    ${bin.length ? '<button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="stopAllSounds()">⏹ Зупинити всі</button>' : ''}
  </div>`;
}

// ---- Фонова музика з плавним затуханням ----
let _bgAudioEl = null;
function fadeAudio(to, ms, cb) {
  if (!_bgAudioEl) return;
  const from = _bgAudioEl.volume;
  const start = Date.now();
  clearInterval(_bgAudioEl._fade);
  _bgAudioEl._fade = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / ms);
    _bgAudioEl.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t >= 1) { clearInterval(_bgAudioEl._fade); if (cb) cb(); }
  }, 40);
}
// ---- Мітки частин пісні (Куплет/Приспів/Міст…) з кольором -----------------
const PART_TYPES = {
  verse:     { label: 'Куплет',       color: '#6b7280' },
  chorus:    { label: 'Приспів',      color: '#16a34a' },
  prechorus: { label: 'Передприспів', color: '#0d9488' },
  bridge:    { label: 'Міст',         color: '#7c3aed' },
  intro:     { label: 'Вступ',        color: '#475569' },
  ending:    { label: 'Кінцівка',     color: '#d4a017' },
  tag:       { label: 'Тег',          color: '#ea580c' }
};
function loadPartLabels() { const d = loadJSON('church_partlabels'); state.partLabels = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; }
function savePartLabels() { saveJSON('church_partlabels', state.partLabels); }
function partKeyOf(song, idx) {
  const m = state.partLabels && state.partLabels[songKey(song)];
  return (m && m[idx]) || 'verse';
}
function setPartLabel(idx, type) {
  if (!state.selectedSong) return;
  const k = songKey(state.selectedSong);
  state.partLabels = state.partLabels || {};
  state.partLabels[k] = state.partLabels[k] || {};
  if (type === 'verse') delete state.partLabels[k][idx]; else state.partLabels[k][idx] = type;
  if (!Object.keys(state.partLabels[k]).length) delete state.partLabels[k];
  savePartLabels();
  markDirty('song');
}
function partBadge(song, idx) {
  const key = partKeyOf(song, idx);
  const t = PART_TYPES[key] || PART_TYPES.verse;
  return { key: key, label: t.label + ' ' + (idx + 1), color: t.color };
}

// ---- Кілька збережених аранжувань на пісню (Недільний/Акустика/…) ---------
function loadArrangeSets() { const d = loadJSON('church_arrangesets'); state.arrangeSets = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; }
function saveArrangeSets() { saveJSON('church_arrangesets', state.arrangeSets); }
function saveNamedArrangement() {
  const s = state.selectedSong; if (!s) return;
  pv2Prompt('Назва аранжування (напр. «Недільний», «Акустика», «Скорочений»):', '', function(name) {
    if (name === null) return;
    const nm = name.trim(); if (!nm) return;
    const k = songKey(s);
    state.arrangeSets = state.arrangeSets || {};
    state.arrangeSets[k] = state.arrangeSets[k] || {};
    state.arrangeSets[k][nm] = songOrder(s).slice();
    saveArrangeSets();
    markDirty('song');
    notify('💾 Аранжування «' + nm + '» збережено');
  });
}
function loadNamedArrangement(name) {
  const s = state.selectedSong; if (!s) return;
  const set = state.arrangeSets && state.arrangeSets[songKey(s)];
  if (!set || !set[name]) return;
  setSongOrder(s, set[name].slice());   // робить активним + re-render + notify
}
function deleteNamedArrangement(name) {
  const s = state.selectedSong; if (!s) return;
  const k = songKey(s);
  if (!state.arrangeSets || !state.arrangeSets[k]) return;
  if (!confirm('Видалити аранжування «' + name + '»?')) return;
  delete state.arrangeSets[k][name];
  if (!Object.keys(state.arrangeSets[k]).length) delete state.arrangeSets[k];
  saveArrangeSets();
  markDirty('song');
}
function renderArrangeSets(s) {
  const set = (state.arrangeSets && state.arrangeSets[songKey(s)]) || {};
  const names = Object.keys(set);
  const esc1 = (x) => String(x).replace(/'/g, "\\'");
  const chips = names.length
    ? names.map(nm => `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px;padding:3px 7px;border:1px solid var(--accent);border-radius:6px;font-size:11px">
        <b onclick="loadNamedArrangement('${esc1(nm)}')" style="cursor:pointer">${esc(nm)}</b>
        <span onclick="deleteNamedArrangement('${esc1(nm)}')" style="cursor:pointer;color:var(--red)">✕</span></span>`).join('')
    : '<span style="font-size:11px;color:var(--text2)">Немає збережених варіантів</span>';
  return `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
    <div style="font-size:11px;color:var(--text2);margin-bottom:4px">📚 Кілька аранжувань — клік завантажує:</div>
    <div>${chips}</div>
    <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="saveNamedArrangement()">💾 Зберегти поточний порядок як…</button>
  </div>`;
}

// ---- Вкладка «Пісня»: порядок частин + розбиття ----
// TYPO_DEFAULTS / typoGet / setTypo / applyTypo / renderTypoTab — винесено
// в src/tabs/g_design/typo.js (пілот модуляризації).

// Фіксуємо розмір шрифту під найдовший слайд пісні — щоб текст не «стрибав».
// set-fit-group на боці виводу ЗАВЖДИ перераховує розмір наново — тож
// надсилаємо це ЛИШЕ на виходи, що зараз на авто-підгоні (songSize[n]===null);
// виходи з явно зафіксованим розміром (A−/A+ у «Виходах») не чіпаємо —
// інакше їхній ручний вибір злітав би щоразу зі зміною пісні/куплета.
function lockSizeForSong() {
  if (!window.electronAPI || !window.electronAPI.setFitGroup) return;
  const s = state.selectedSong;
  const slides = s ? songSlides(s).map(sl => hallText(sl.text).replace(/\n/g, '<br>')) : [];
  [1, 2, 3, 4].forEach(function(n) {
    if (!state.songSize[n]) window.electronAPI.setFitGroup(slides, OUT_KIND[n]);
  });
}

// Розмір шрифту ПІСНІ, який тримається між куплетами і між піснями — ОКРЕМО
// для кожного виходу. songSize[n]=null → авто-підгін під найдовший слайд
// САМЕ для цього виходу. Інакше — точний зафіксований розмір.
function applySongSize() {
  if (!window.electronAPI) return;
  [1, 2, 3, 4].forEach(function(n) {
    if (state.songSize[n] && window.electronAPI.setLockedSize) {
      window.electronAPI.setLockedSize(state.songSize[n], OUT_KIND[n]);
    }
  });
  if ([1, 2, 3, 4].some(function(n) { return !state.songSize[n]; })) lockSizeForSong();
}
function saveSongSize() { saveJSON(STORAGE_KEYS.live + '_songsize', { sizes: state.songSize }); }
function loadSongSize() {
  const c = loadJSON(STORAGE_KEYS.live + '_songsize');
  if (!c) return;
  if (c.sizes) {
    [1, 2, 3, 4].forEach(function(n) { if (c.sizes[n] !== undefined) state.songSize[n] = c.sizes[n]; });
  } else if (typeof c.size === 'number') {
    // Міграція зі старого формату (одне спільне число на всі виходи) —
    // застосовуємо його як стартове значення для КОЖНОГО з 4.
    [1, 2, 3, 4].forEach(function(n) { state.songSize[n] = c.size; });
  }
}
// Глобальний крок — керує УСІМА 4 виходами разом (кнопки A−/A+ у вкладці
// «Пісні»). Точково по одному виходу — setOutputSongSize нижче.
function songSizeStep(delta) {
  const base = state.songSize[1] || 58;
  const next = Math.max(20, Math.min(300, base + delta));
  [1, 2, 3, 4].forEach(function(n) { state.songSize[n] = next; });
  saveSongSize();
  applySongSize();
  if (state.selectedSong) songStep(0);           // перемалювати поточний слайд новим розміром
  ['song','typo'].forEach(t => markDirty(t));
  syncSongFontSizeDisplay();
  notify('🔤 Розмір тексту: ' + next + 'px на всіх виходах (тримається і для наступних)');
}
function songSizeReset() {
  [1, 2, 3, 4].forEach(function(n) { state.songSize[n] = null; });
  saveSongSize();
  applySongSize();
  if (state.selectedSong) songStep(0);
  ['song','typo'].forEach(t => markDirty(t));
  syncSongFontSizeDisplay();
  notify('↺ Розмір тексту: авто-підгін на всіх виходах');
}
// Оновлює підпис "58px"/"авто" в картці розміру шрифту (статична вкладка
// «Пісні») — показує значення виходу 1 як орієнтир спільного розміру.
// Картку не перебудовуємо повністю, лише текст числа.
function syncSongFontSizeDisplay() {
  var el = document.getElementById('songFontSizeLabel');
  if (el) el.textContent = state.songSize[1] ? state.songSize[1] + 'px' : 'авто';
}
// Точково для ОДНОГО виходу (напр. Вихід 3 для співаків) — та сама модель
// songSize, просто змінюємо лише один ключ, не всі 4.
function setOutputSongSize(n, delta) {
  if (!window.electronAPI || !window.electronAPI.setLockedSize) return;
  var base = state.songSize[n] || 58;
  var next = Math.max(20, Math.min(300, base + delta));
  state.songSize[n] = next;
  saveSongSize();
  window.electronAPI.setLockedSize(next, OUT_KIND[n]);
  markDirty('router');
  notify('🔤 ' + OUT_NAME[n] + ': розмір ' + next + 'px (лише цей вихід)');
}
// Повертає ОДИН вихід на авто-підгін, не чіпаючи решту.
function resetOutputSongSize(n) {
  if (!window.electronAPI) return;
  state.songSize[n] = null;
  saveSongSize();
  if (window.electronAPI.setLockedSize) window.electronAPI.setLockedSize(null, OUT_KIND[n]);
  lockSizeForSong();   // перерахувати авто-підгін саме для цього виходу
  markDirty('router');
  notify('↺ ' + OUT_NAME[n] + ': повернуто до авто-підгону');
}


// ============================================================
// ПЛАН СЛУЖІННЯ (переписано)
// Було: план зберігав лише НАЗВУ пісні і показував перший куплет —
// провести по ньому службу було неможливо. Тепер елемент плану
// розкривається у всі свої слайди, гортається, і після останнього
// автоматично переходить до наступного пункту.
// ============================================================

function saveService() { saveJSON(STORAGE_KEYS.live + '_service', state.service); }
function loadService() {
  const s = loadJSON(STORAGE_KEYS.live + '_service');
  if (s) state.service = Object.assign({ name: '', date: '', items: [], idx: -1, slideIdx: 0, saved: [], serviceStartedAt: null }, s);
}

// ---- Наповнення плану ----
// Пункт плану «осиротів»: пісню видалили/перейменували в бібліотеці, і за id,
// і за title нічого не знайшлось. Дає прив'язати пункт до іншої пісні заново,
// не видаляючи його з плану (зберігає позицію, колір, тривалість).
// Кольорові мітки пунктів плану — просто візуальне групування
// (прославлення / проповідь / технічна пауза тощо), на показ не впливає.
const SVC_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
// parseQuickRef у додатку розуміє лише один вірш («Ів 3:16»).
// Для плану потрібні діапазони — «Ів 3:16-18», «Пс 23» (уся глава).
function svcParseRange(ref) {
  const raw = String(ref || '').trim();
  // Хвіст: -18 або –18 (тире або довге тире)
  const m = raw.match(/^(.*?)[\s]*[-–—][\s]*(\d+)\s*$/);
  const head = m ? m[1] : raw;
  const explicitTo = m ? parseInt(m[2], 10) : null;

  const parsed = (typeof parseQuickRef === 'function') ? parseQuickRef(head) : null;
  if (!parsed || !parsed.length) return null;
  const p = parsed[0];
  if (!p.bookId) return null;

  const chapter = p.chapter || 1;
  // Вірш не вказано → уся глава
  if (!p.verse) {
    let last = 1;
    for (let v = 1; v <= 200; v++) { if (getVerse(p.bookId, chapter, v)) last = v; else if (v > last + 3) break; }
    return { bookId: p.bookId, chapter: chapter, from: 1, to: last };
  }
  return {
    bookId: p.bookId, chapter: chapter,
    from: p.verse,
    to: explicitTo && explicitTo >= p.verse ? explicitTo : p.verse
  };
}

// ---- Розкриття елемента у слайди ----
const _svcCache = new Map();
function svcSlidesCacheKey(item) {
  // currentTranslationId МАЄ бути в ключі: інакше перегляд пункту-вірша,
  // перемикання перекладу Біблії й повернення до того ж пункту показує
  // застарілий (закешований на старому перекладі) текст.
  return JSON.stringify([item.kind, item.id, item.ref, item.title,
                         state.splitCfg.on, state.splitCfg.maxLines, state.splitCfg.maxChars,
                         item.id != null ? state.orders['ord_' + item.id] : null,
                         item.id != null && state.chorusEach ? !!state.chorusEach['ord_' + item.id] : null,
                         !!state.arrangeGlobal,
                         typeof currentTranslationId !== 'undefined' ? currentTranslationId : null]);
}
function svcInvalidate() { _svcCache.clear(); }

function svcSlides(item) {
  if (!item) return [];
  const ck = svcSlidesCacheKey(item);
  const hit = _svcCache.get(ck);
  if (hit) return hit;
  const res = svcSlidesRaw(item);
  if (_svcCache.size > 60) _svcCache.clear();
  _svcCache.set(ck, res);
  return res;
}

function svcSlidesRaw(item) {
  if (!item) return [];
  if (item.kind === 'song') {
    const s = state.songs.find(x => String(x.id) === String(item.id)) ||
              state.songs.find(x => x.title === item.title);
    if (!s) return [{ text: '⚠️ Пісню «' + item.title + '» не знайдено', ref: '' }];
    // Використовуємо порядок частин і розбиття довгих куплетів
    const slides = songSlides(s).map(sl => {
      const baseRef = songRefForDisplay(s.title);
      const partSuffix = sl.parts > 1 ? '(' + sl.part + '/' + sl.parts + ')' : '';
      return { text: sl.text, ref: [baseRef, partSuffix].filter(Boolean).join(' ') };
    });
    return slides.length ? slides : [{ text: '', ref: songRefForDisplay(s.title) }];
  }
  if (item.kind === 'bible') {
    const r = svcParseRange(item.ref);
    if (!r) return [{ text: '⚠️ Не розпізнано: ' + item.ref, ref: '' }];

    const out = [];
    for (let v = r.from; v <= r.to; v++) {
      const txt = getVerse(r.bookId, r.chapter, v);
      if (txt) {
        const name = (typeof getBookName === 'function' ? getBookName(r.bookId) : r.bookId);
        out.push({ text: txt, ref: name + ' ' + r.chapter + ':' + v });
      }
    }
    return out.length ? out : [{ text: '⚠️ Вірші не знайдені — переклад Біблії імпортовано?', ref: item.ref }];
  }
  // Порожні пункти (молитва, проповідь, пожертви) — без слайдів, лише позначка в плані
  return [];
}

// ---- Проведення служби ----

// Ручний вивід означає, що оператор більше не веде службу за планом.
// Без цього стрілки продовжували гортати ПЛАН (а наступний пункт міг бути піснею),
// хоча в залі вже стояв вибраний вручну вірш — саме через це «злітало».
function exitServicePlan() {
  try {
    if (state.service && state.service.idx >= 0) {
      state.service.idx = -1;
      if (typeof renderTabInto === 'function') markDirty('service');
    }
  } catch (e) {}
}

// Гарячі клавіші плану служби: цифри 1-9 → перейти до пункту N
// (лише коли відкрита вкладка «План служби» і фокус не в полі вводу).
document.addEventListener('keydown', function(e) {
  if (typeof isActive !== 'function' || !isActive('service')) return;
  var tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key >= '1' && e.key <= '9') {
    var idx = parseInt(e.key, 10) - 1;
    if (state.service && state.service.items && idx < state.service.items.length) { e.preventDefault(); svcGoTo(idx); }
  }
});

// Заплановано (сума duration по пунктах ДО поточного — тобто скільки мало
// пройти часу до моменту, як дійшли до нього) vs реально минуло від першого
// переходу по плану. Оновлюється тут одразу при рендері й далі тікером
// (svcTimingTick, кожні 15с) — БЕЗ повного перемальовування вкладки.
function svcUpdateTimingDisplay() {
  const box = document.getElementById('svcTimingBox');
  if (!box) return;
  const sv = state.service;
  if (!sv.serviceStartedAt || sv.idx < 0) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const plannedMin = sv.items.slice(0, sv.idx).reduce((sum, it) => sum + (it.duration || 0), 0);
  const actualMin = (Date.now() - sv.serviceStartedAt) / 60000;
  const diff = actualMin - plannedMin;
  const diffAbs = Math.round(Math.abs(diff));
  const onTrack = diffAbs < 1;
  const diffLabel = onTrack ? 'за розкладом' : (diff > 0 ? '+' + diffAbs + ' хв (відстаємо)' : '−' + diffAbs + ' хв (випереджаємо)');
  const color = onTrack ? 'var(--text2)' : (diff > 0 ? 'var(--red)' : 'var(--green)');
  box.style.display = 'block';
  box.innerHTML = '<div style="font-size:12px;margin-bottom:6px;padding:6px 8px;background:var(--panel2);border-radius:5px">' +
    '⏱ Заплановано на цей момент: <b>' + Math.round(plannedMin) + ' хв</b> · Реально минуло: <b>' + Math.round(actualMin) + ' хв</b> · ' +
    '<b style="color:' + color + '">' + diffLabel + '</b></div>';
}
let _svcTimingTicker = null;
function svcStartTimingTicker() {
  if (_svcTimingTicker) return;
  _svcTimingTicker = setInterval(svcUpdateTimingDisplay, 15000);
}
safeInit(svcStartTimingTicker, 'svcStartTimingTicker');
// Скидає лише РЕАЛЬНИЙ відлік (напр. перед повторним використанням того
// самого плану наступного тижня) — заплановані хвилини по пунктах лишаються.
// Друк/експорт плану — окремим файлом .html, який відкривається в будь-
// якому браузері й друкується чи зберігається як PDF стандартними засобами
// ОС/браузера — без потреби окремо чіпати Electron-API друку.
// Звіт ПІСЛЯ служби — на відміну від svcPrint() (план НАПЕРЕД, лише
// заплановані хвилини), тут реальний час на кожен пункт: різниця між
// startedAt цього пункту й startedAt наступного (для останнього — між його
// startedAt і зараз). Ті самі дані, що вже рахує жива панель відхилення —
// просто зведені в один звіт після завершення, а не наживо.
function svcShowSlide(si) {
  const item = state.service.items[state.service.idx];
  if (!item) return;
  const slides = svcSlides(item);
  if (!slides.length) return;
  si = Math.max(0, Math.min(slides.length - 1, si));
  state.service.slideIdx = si;
  saveService();

  const sl = slides[si];
  stageContent({
    kind: 'text', rawText: sl.text, html: hallText(sl.text).replace(/\n/g, '<br>'),
    ref: sl.ref || '', label: item.title + ' — ' + (si + 1) + '/' + slides.length,
    verseIdx: si
  });
  if (state.liveMode !== 'staged') goLive();
  markDirty('service');
}

// Далі: наступний слайд, а в кінці елемента — автоматично наступний пункт плану
// ---- Збереження планів (напр. «Неділя 20.07») ----
// Шаблон — та сама структура збереження, що й звичайний план, але з міткою
// isTemplate:true. Якщо служби повторюються щотижня зі схожою структурою
// (той самий порядок пісень/оголошень/проповіді) — зберігаєш ОДИН РАЗ як
// шаблон, і щотижня береш «💠 Новий план із шаблону», не будуючи з нуля.
// Приймаємо індекс, а не назву: апостроф в українській назві («П'ятниця»)
// розривав JS-рядок в onclick і кнопка переставала працювати.
// Копіювати збережений план під новою назвою — щоб узяти «як минулого тижня»
// й підправити, не чіпаючи оригінал. Зберігає статус шаблону: копія шаблону —
// теж шаблон, копія звичайного плану — теж звичайний план.
// На відміну від svcDuplicate (клонує ЯК Є, включно зі статусом шаблону),
// ця функція саме для щотижневого використання: бере ШАБЛОН і робить
// НОВИЙ ЗВИЧАЙНИЙ план (isTemplate:false) з датою на СЬОГОДНІ — сам шаблон
// лишається недоторканим у списку для наступного разу.
const SVC_ICONS = { song: '🎵', bible: '📖', announce: '📢', prayer: '🙏', sermon: '📣', offering: '💝', timer: '⏱', media: '🎬' };

// Оцінка часу на пункт — просто число хвилин, яке оператор вписує сам.
// Заповнює вбудовану копію плану служби у вкладці «Пісні» (id="servicePlanEmbed")
// — тим самим renderServiceTab(), щоб не дублювати логіку й не розходитись
// зі старою поведінкою. Викликається центрально з markDirty('service'),
// тож усі десятки svc*-функцій, що вже й так оновлюють план, автоматично
// оновлюють і цю копію теж, без правок у кожній із них окремо.
function renderServicePlanEmbed() {
  var host = document.getElementById('servicePlanEmbed');
  if (!host) return;
  try { host.innerHTML = renderServiceTab(); } catch (e) { console.error('renderServicePlanEmbed', e); }
  if (typeof svcUpdateTimingDisplay === 'function') svcUpdateTimingDisplay();
}

// Живий пошук/фільтр для селектора «➕ Додати до плану»: набираєш назву або
// обираєш збірник — список одразу звужується, без перезбирання всієї вкладки.
// Заповнює фільтр збірників для селектора плану служіння — той самий
// перелік, що й в інших місцях пошуку пісень.
function svcRenderSongBookFilter() {
  var sel = document.getElementById('svcSongBookFilter');
  if (!sel) return;
  var prev = sel.value;
  var books = Array.from(new Set(state.songs.map(function(s) { return (s.songbook || '').trim(); }).filter(Boolean))).sort(function(a, b) { return a.localeCompare(b, 'uk'); });
  sel.innerHTML = '<option value="">📚 Усі збірники</option>' +
    books.map(function(b) { return '<option value="' + escHtml(b) + '">' + escHtml(b) + '</option>'; }).join('');
  if (books.indexOf(prev) !== -1) sel.value = prev;
}


// ============================================================
// МОНІТОРИ (вдосконалено)
// ============================================================
// Прив'язка виходу до монітора за «відбитком» — переживає перезавантаження
// Резервне дублювання: якщо закріплений за виходом монітор зникає посеред
// служби, автоматично перекинути вміст на інший, живий вихід — щоб зал не
// лишався без картинки, поки хтось не помітить і не виправить вручну.
function loadOutputFailover() {
  const f = loadJSON(STORAGE_KEYS.live + '_failover');
  if (f) state.outputFailover = f;
}
function loadOutputBindings() {
  const b = loadJSON(STORAGE_KEYS.live + '_bind');
  if (!b) return;
  state.outputBind = b;
  if (window.electronAPI && window.electronAPI.restoreOutputBindings) {
    // Після перезавантаження Windows видає моніторам НОВІ id — відновлюємо за відбитком
    window.electronAPI.restoreOutputBindings(b).then(res => {
      const n = Object.keys(res || {}).length;
      if (n) notify('🔗 Відновлено прив\'язок моніторів: ' + n);
      refreshMonitors();
      if (typeof syncMonitorMissingBanner === 'function') syncMonitorMissingBanner();
    }).catch(() => {});
  }
}

// ============================================================
// КЕРУВАННЯ ТИТРОМ ДЛЯ ТРАНСЛЯЦІЇ
// ============================================================
let _lowerHideTimer = null;

function saveLower() { saveJSON(STORAGE_KEYS.live + '_lower', state.lower); }
function loadLower() {
  const c = loadJSON(STORAGE_KEYS.live + '_lower');
  if (c) Object.assign(state.lower, c, { visible: false });
}
// Показати титр із поточним віршем/куплетом
function lowerToggle() { state.lower.visible ? lowerHide() : lowerShow(); }

// Прев'ю титру
function updateLowerPreview() {
  const f = $('#lowerPreviewFrame');
  if (!f) return;
  const c = pv2GraphicsContent();
  const prev = state.graphicsSettings.layout;
  const prevChroma = state.graphicsSettings.lowerChroma;
  state.graphicsSettings.layout = 'lower';
  state.graphicsSettings.lowerChroma = 'transparent';   // у прев'ю показуємо як поверх камери
  f.srcdoc = getGraphicsHTML(c.text || 'Блаженні вбогі духом, бо їхнє Царство Небесне.', c.ref || 'Від Матвія 5:3');
  state.graphicsSettings.layout = prev;
  state.graphicsSettings.lowerChroma = prevChroma;
}

// ---- Вкладка «Шари» ----
// ============================================================
// СУБТИТРИ + АВТОПРОПОЗИЦІЯ ВІРША (окрема вкладка, раніше — картка у
// «Шари»). Живі субтитри (Web Speech API), автопропозиція вірша під час
// проповіді (локальний fuzzy-пошук) та індикатор рівня звуку з пульта —
// усе, що стосується мовлення в реальному часі, зібрано в одному місці.
// ============================================================
// ============================================================
// ЕКРАН З QR + ФОТО (4 режими)
//  logo   — QR із логотипом церкви в центрі
//  banner — фото/банер на весь екран, QR у кутку
//  simple — просто QR із підписом
//  multi  — кілька QR поряд (пожертви + сайт + Instagram)
// Використовує наявний buildQRCanvas() з qr.js.
// ============================================================
// Легша версія для повзунків розміру: НЕ перебудовує всю панель (renderTabInto)
// на кожен рух повзунка — інакше DOM-елемент повзунка знищувався б і
// перестворювався прямо під час перетягування, ламаючи взаємодію мишею.
// Оновлює лише прев'ю й підпис числа поруч із повзунком.
// Головне: збираємо весь екран (1920x1080) на одному canvas
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// n=1..4 — саме на цей вихід, не займаючи решту (той самий підхід, що вже
// є для графіки/HTML-оверлеїв/H2R). Запам'ятовує n як q.target — це те,
// що й далі використовує хоткей «qr-send» (sendQrScreen() нижче).
// Які виходи ЗАРАЗ показують QR-екран — щоб кнопки самі підсвічувались 🔴
// (той самий патерн, що вже є в H2R-титрах: htmlLiveMap). Один об'єкт на
// всі 4 виходи достатньо: на відміну від H2R тут немає списку файлів —
// QR-екран лише один, тож просто true/false на кожен вихід.
// Сумісність зі старим хоткеєм «qr-send» — той, що обраний останнім кліком
// «На вихід» (q.target), або вихід 1, якщо ще не обирали жодного.
// pv2ClearOutput(n) — той самий канонічний шлях очищення виходу, що вже
// використовує H2R (clearHTMLOverlayOutput): правильно згасає
// (showClear() у projector-preload.js), а не просто замінює на порожню
// сторінку без переходу, як робив попередній варіант цієї функції.
// ---- Логотип у центр QR (перенесено зі старої вкладки, дані ті самі) ----
// ---- Збережені QR (той самий список, що й у старій вкладці) ----

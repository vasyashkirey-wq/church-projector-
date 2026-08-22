// ============================================================
// РОУТЕР ВИХОДІВ — різний контент на різні екрани
// ============================================================
const ROUTE_LABELS = {
  mirror:   'Дзеркало (те саме, що на всіх)',
  next:     'Наступний куплет (для співаків)',
  graphics: 'Графіка (оформлений текст)',
  h2r:      'H2R-титри (нижня третина)',
  text:     'Текст із власними налаштуваннями',
  timer:    'Таймер / зворотний відлік',
  lang2:    'Друга мова (напр. чеська)',
  chords:   'Акорди для музикантів',
  blank:    'Порожньо (чорний екран)',
  freeze:   'Заморозити (не оновлювати)'
};

function saveRoutes() {
  saveJSON(STORAGE_KEYS.routes, state.outputRoutes);
  pv2SyncMirrorKinds();
}
// Повідомляємо main, які виходи лишаються «дзеркалом» — решті не шлеться броадкаст
function pv2SyncMirrorKinds() {
  if (!window.electronAPI || !window.electronAPI.setMirrorKinds) return;
  const kinds = [];
  for (let i = 1; i <= 4; i++) {
    if ((state.outputRoutes[i] || 'mirror') !== 'mirror') continue;      // має власний маршрут
    if (state.sendTarget !== 'all' && state.sendTarget !== i) continue;  // не є ціллю відправки
    kinds.push(OUT_KIND[i]);
  }
  window.electronAPI.setMirrorKinds(kinds);
}

// Вибір, на який екран піде наступна відправка ('all' або 1..4).
// Екрани поза ціллю просто зберігають те, що на них зараз.

// Автосинхронізація: усі відкриті екрани отримують те саме (кожен у своєму стилі)
// і оновлюються разом. Головна причина «оновилось лише на трансляції».
function syncAllOutputs() {
  setSendTarget('all');
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();
  pv2SyncOutputStates();
  // одразу підтягуємо всі екрани під поточний вміст
  for (let i = 1; i <= 4; i++) {
    if (state.outputStates[i] && state.outputStates[i].open) pv2ForceRefresh(i);
  }
  renderTabInto('router');
  notify('🔗 Усі екрани синхронізовано');
}

function setSendTarget(t) {
  state.sendTarget = t;
  pv2SyncMirrorKinds();
  $$('[id^="pv2Target"]').forEach(b => { b.className = 'btn btn-ghost btn-sm'; });
  const btn = $('#pv2Target' + t);
  if (btn) btn.className = 'btn btn-primary btn-sm';
  const badge = $('#pv2TargetBadge');
  if (badge) badge.textContent = t === 'all' ? 'усі екрани' : OUT_NAME[t];
  notify(t === 'all' ? '🎯 Відправка → усі екрани' : '🎯 Відправка → лише ' + OUT_NAME[t]);
  if (typeof renderTabInto === 'function' && $('#tab-content-router')) renderTabInto('router');
  if (typeof syncSendTargetBanner === 'function') syncSendTargetBanner();   // банер видно з будь-якої вкладки
}
// Чи отримує вихід n поточну відправку
function pv2IsTargeted(n) {
  return state.sendTarget === 'all' || state.sendTarget === n;
}
function loadRoutes() {
  const r = loadJSON(STORAGE_KEYS.routes);
  if (r) for (let i = 1; i <= 4; i++) if (r[i]) state.outputRoutes[i] = r[i];
  pv2SyncMirrorKinds();
}

// Відновлюємо кольори фону виходів після перезапуску та шлемо їх у main
function loadOutputBg() {
  const b = loadJSON(STORAGE_KEYS.bg);
  if (!b) return;
  for (let i = 1; i <= 4; i++) {
    if (!b[i]) continue;
    state.outputBg[i] = b[i];
    const input = $('#pv2BgCode' + i);
    if (input) input.value = b[i];
    const sw = $('#pv2BgSwatchR' + i);
    if (sw) sw.style.background = b[i];
    if (window.electronAPI && window.electronAPI.setOutputBg) {
      window.electronAPI.setOutputBg(OUT_KIND[i], b[i]);
    }
  }
}
function setOutputRoute(n, route) {
  const prevRoute = state.outputRoutes[n];
  state.outputRoutes[n] = route;
  saveRoutes();
  if (typeof logChange === 'function' && prevRoute !== route) {
    logChange('Маршрут ' + (OUT_NAME[n] || n), (ROUTE_LABELS[prevRoute] || prevRoute || '—') + ' → ' + (ROUTE_LABELS[route] || route));
  }
  const badge = $('#pv2RouteBadge' + n);
  if (badge) badge.textContent = ROUTE_LABELS[route] || route;
  notify('🔀 ' + OUT_NAME[n] + ' → ' + (ROUTE_LABELS[route] || route));
  // одразу оновлюємо цей вихід поточним контентом (навіть якщо він поза ціллю)
  const t = state.sendTarget;
  state.sendTarget = 'all';
  pv2PushToOutput(n, pv2LastContent);
  state.sendTarget = t;
  pv2SyncMirrorKinds();
}

function pv2SendTextToOutputN(n, html, ref) {
  if (!window.electronAPI || !window.electronAPI.sendToOutput) return;
  window.electronAPI.sendToOutput(OUT_KIND[n], 'text', { html: html, ref: ref || '' });
}
function pv2ClearOutput(n) {
  if (!window.electronAPI || !window.electronAPI.sendToOutput) return;
  window.electronAPI.sendToOutput(OUT_KIND[n], 'clear', {});
  notify('🚫 ' + OUT_NAME[n] + ' очищено');
}

// Останній надісланий контент — щоб знати, що показувати при зміні маршруту
let pv2LastContent = null; // {kind:'text'|'html', html, ref, label}

// Текст наступного куплета (для екрана співаків)
function pv2NextVerseText() {
  const s = state.selectedSong;
  if (!s || !s.verses) return null;
  const i = state.selectedVerseIdx + 1;
  if (i >= s.verses.length) return { html: '— кінець пісні —', ref: s.title || '' };
  return { html: String(s.verses[i]).replace(/\n/g, '<br>'), ref: 'Далі: куплет ' + (i + 1) };
}

// Єдиний генератор текстового HTML — використовується і маршрутом 'text', і кнопкою «Застосувати».
// Раніше було два майже однакові шматки, які розповзалися при правках.
function buildTextHTML(s, c, hasChroma) {
  const align = s.position === 'top' ? 'flex-start' : s.position === 'bottom' ? 'flex-end' : 'center';
  const shadow = s.styles.shadow ? '0 2px 12px rgba(0,0,0,.85)' : 'none';
  const textColor = textColorFor(s.bgColor, s.color); // чорний на світлому фоні, білий на темному
  // Обведення — 4-напрямковий text-shadow, а не -webkit-text-stroke: той «з'їдає»
  // засічки в шрифтах на кшталт Georgia (той самий підхід, що й у Графіці).
  // На виході з увімкненим хромакеєм застосовуємо той самий автоматичний
  // мінімум контрасту, що вже є в головній Темі — інакше текст був би
  // «голим» білим на живій камері, поки не налаштуєш вручну.
  const sw = hasChroma ? Math.max(s.strokeWidth || 0, 2) : (s.strokeWidth || 0);
  const scrimV = hasChroma ? Math.max(s.scrim || 0, 0.25) : (s.scrim || 0);
  const outlineShadow = sw
    ? [1, -1].flatMap(x => [1, -1].map(y => `${x * sw}px ${y * sw}px 0 ${s.strokeColor || '#000'}`)).join(',') +
      (s.styles.shadow ? ', 0 2px 12px rgba(0,0,0,.6)' : '')
    : shadow;
  const bgType = s.bgType || 'color';
  const bgVideoLayer = (bgType === 'video' && s.bgVideo && s.bgVideo.src)
    ? `<video class="bgvid" autoplay loop muted playsinline src="${esc(s.bgVideo.src)}"></video>` : '';
  const bgImageLayer = (bgType === 'image' && s.bgImage)
    ? `<div class="bgimg" style="background-image:url('${s.bgImage}')"></div>` : '';
  const bgCss = bgType === 'color' ? s.bgColor : '#000';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{margin:0;background:${bgCss};min-height:100vh;display:flex;align-items:${align};
         justify-content:center;font-family:${s.fontFamily || 'Georgia, serif'};position:relative;overflow:hidden}
    .bgvid,.bgimg{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background-size:cover;background-position:center;z-index:0}
    .wrap{text-align:${s.align};padding:5vh 5vw;max-width:90%;z-index:2;position:relative;
          margin:${s.safeArea || 0}%;
          background:${scrimV ? `rgba(0,0,0,${scrimV})` : 'transparent'};border-radius:${scrimV ? '18px' : '0'};
          transition:opacity ${((s.fadeMs || 600) / 1000)}s ease}
    .ref{color:#c8a84b;font-size:${Math.round(s.size * 0.5)}px;margin-bottom:10px}
    .line{width:40px;height:2px;background:#c8a84b;margin:10px auto}
    .text{color:${textColor};font-size:${s.size}px;font-weight:${s.styles.bold ? '700' : 'normal'};
          font-style:${s.styles.italic ? 'italic' : 'normal'};text-shadow:${outlineShadow};line-height:${s.lineHeight || 1.4};
          letter-spacing:${s.letterSpacing || 0}px}
  </style></head><body>${bgVideoLayer}${bgImageLayer}<div class="wrap">
    ${c.ref ? `<div class="ref">${esc(c.ref)}</div><div class="line"></div>` : ''}
    <div class="text">${String(c.text || '').replace(/\n/g, '<br>')}</div>
  </div>${AUTOFIT_SCRIPT}</body></html>`;
}

// Шрифт для конкретного виходу
function setTextFont(f) {
  const t = state.currentTextOutput;
  if (t === 'all') { for (let i = 1; i <= 4; i++) state.textSettings[i].fontFamily = f; }
  else state.textSettings[t].fontFamily = f;
  updateTextPreview();
}

// «Додатково»: обведення/підкладка/безпечна зона/інтервали/швидкість переходу —
// ті самі поля, що вже є в головній Темі, тепер і тут, окремо на кожен вихід.
function _applyToTextOutputs(field, val) {
  const t = state.currentTextOutput;
  if (t === 'all') { for (let i = 1; i <= 4; i++) state.textSettings[i][field] = val; }
  else state.textSettings[t][field] = val;
  updateTextPreview();
}
function setTextStroke(v) { _applyToTextOutputs('strokeWidth', parseInt(v, 10) || 0); }
function setTextStrokeColor(v) { _applyToTextOutputs('strokeColor', v); }
function setTextScrim(v) { _applyToTextOutputs('scrim', (parseInt(v, 10) || 0) / 100); }
function setTextSafeArea(v) { _applyToTextOutputs('safeArea', parseInt(v, 10) || 0); }
function setTextLetterSpacing(v) { _applyToTextOutputs('letterSpacing', parseInt(v, 10) || 0); }
function setTextLineHeight(v) { _applyToTextOutputs('lineHeight', (parseInt(v, 10) || 140) / 100); }
function setTextFadeMs(v) { _applyToTextOutputs('fadeMs', parseInt(v, 10) || 600); }
function setTextBgType(type) { _applyToTextOutputs('bgType', type); renderTabInto('textcontrol'); }

// Фон-відео/фото для конкретного виходу — той самий підхід, що в Графіці:
// шлях до файлу для відео (завелике для сховища як base64), стиснене base64 для фото.
function loadTextBgVideo(input) {
  const f = input.files[0];
  if (!f) return;
  if (f.path && typeof pathToFileUrl === 'function') {
    // непідтримувані формати (MOV/MKV…) спершу в MP4
    ensureSupportedMedia(f.path, function(cpath) {
      _applyToTextOutputs('bgVideo', { src: pathToFileUrl(cpath), name: f.name });
      renderTabInto('textcontrol');
    });
  } else {
    _applyToTextOutputs('bgVideo', { src: URL.createObjectURL(f), name: f.name });
    renderTabInto('textcontrol');
  }
}
function clearTextBgVideo() { _applyToTextOutputs('bgVideo', null); renderTabInto('textcontrol'); }
function loadTextBgImage(input) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height; const max = 1920;
      if (w > max) { h = Math.round(h * max / w); w = max; }
      let dataUrl;
      try {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        dataUrl = cv.toDataURL('image/jpeg', 0.85);
      } catch (err) { dataUrl = e.target.result; }
      _applyToTextOutputs('bgImage', dataUrl);
      renderTabInto('textcontrol');
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(f);
}
function clearTextBgImage() { _applyToTextOutputs('bgImage', null); renderTabInto('textcontrol'); }

// Подати контент на ОДИН вихід згідно з його маршрутом
// Що зараз показує конкретний вихід — окремо від глобального «На екрані».
// Для маршрутів, відмінних від «дзеркало», рахуємо тут-таки в момент відправки.
function pv2SetOutputStatus(n, label) {
  state.outputLive = state.outputLive || {};
  state.outputLive[n] = label;
  const el = $('#pv2Live' + n);
  if (el) el.textContent = label;
}

function pv2PushToOutput(n, content) {
  if (!state.outputStates[n] || !state.outputStates[n].open) return;
  if (!pv2IsTargeted(n)) return; // екран не є ціллю — лишаємо як є
  const route = state.outputRoutes[n] || 'mirror';
  if (route !== 'mirror') pv2SetOutputStatus(n, ROUTE_LABELS[route] || route);   // базове — уточнимо нижче, де є деталі
  if (route === 'freeze') { pv2SetOutputStatus(n, '❄️ Заморожено'); return; }
  if (route === 'blank')  { pv2SetOutputStatus(n, '⬛ Порожньо'); pv2ClearOutput(n); return; }

  if (route === 'next') {
    const nv = pv2NextVerseText();
    if (nv) { pv2SendTextToOutputN(n, nv.html, nv.ref); pv2SetOutputStatus(n, '⏭ ' + (nv.ref || 'Наступний куплет')); }
    return;
  }
  if (route === 'graphics') {
    // Беремо САМЕ той вміст, який зараз надсилається (аргумент content).
    // Раніше тут читався state.onAir, який оновлюється ПІЗНІШЕ — через це
    // трансляція показувала попередній вірш, поки проектор уже новий.
    let c;
    if (content && (content.rawText != null || content.html)) {
      const src = content.rawText != null ? content.rawText : content.html;
      c = withSecondLang({ html: esc(stripChords(String(src))).replace(/\n/g, '<br>'), ref: content.ref || '' });
      c = { text: c.html, ref: c.ref };
    } else {
      c = pv2GraphicsContent();
    }
    const alpha = (state.outputChroma && state.outputChroma[n] && state.outputChroma[n] !== 'none')
      ? streamBgAlpha() : undefined;
    sendHTMLToOutputN(n, getGraphicsHTML(c.text, c.ref, alpha), null);
    pv2SetOutputStatus(n, '🎨 ' + (c.ref || 'Графіка'));
    return;
  }
  // Той самий вірш іншою мовою — на окремий екран (укр у залі, чеська в трансляції)
  if (route === 'lang2') {
    const t2 = secondLangText();
    const s2 = state.textSettings[n] || state.textSettings[1];
    const hasChroma2 = !!(state.outputChroma && state.outputChroma[n] && state.outputChroma[n] !== 'none');
    sendHTMLToOutputN(n, buildTextHTML(s2, { text: t2 || '—', ref: pv2LastContent ? pv2LastContent.ref : '' }, hasChroma2), null);
    return;
  }
  // Екран для музикантів: текст з акордами, транспонований
  if (route === 'chords') {
    const s = state.selectedSong;
    const idx = (state.preview && typeof state.preview.verseIdx === 'number') ? state.preview.verseIdx : state.selectedVerseIdx;
    const raw = chordsForStage(s, idx);
    const st = state.textSettings[n] || state.textSettings[1];
    const hasChromaChords = !!(state.outputChroma && state.outputChroma[n] && state.outputChroma[n] !== 'none');
    sendHTMLToOutputN(n, buildTextHTML(st, {
      text: String(raw).replace(/\[([^\]]+)\]/g, '<b style="color:#f0c040">[$1]</b>'),
      ref: (s ? s.title : '') + (state.transpose ? '  (' + (state.transpose > 0 ? '+' : '') + state.transpose + ')' : '')
    }, hasChromaChords), null);
    return;
  }
  if (route === 'h2r')   { sendHTMLToOutputN(n, getH2RHTML(), null); return; }
  if (route === 'timer') { sendHTMLToOutputN(n, getTimerHTML(), null); return; }
  if (route === 'text') {
    const s = state.textSettings[n] || state.textSettings[1];
    // Так само беремо поточний вміст, а не те, що вже в ефірі
    let c;
    if (content && (content.rawText != null || content.html)) {
      const src = content.rawText != null ? content.rawText : content.html;
      const w = withSecondLang({ html: stripChords(String(src).replace(/\n/g, '<br>')), ref: content.ref || '' });
      c = { text: w.html, ref: w.ref };
    } else {
      c = pv2GraphicsContent();
    }
    const hasChromaText = !!(state.outputChroma && state.outputChroma[n] && state.outputChroma[n] !== 'none');
    sendHTMLToOutputN(n, buildTextHTML(s, c, hasChromaText), null);
    pv2SetOutputStatus(n, '📝 ' + (c.ref || 'Текст'));
    return;
  }
  // mirror — повторюємо останній надісланий контент
  if (!content) return;
  if (content.kind === 'html' && content.filePath) {
    window.electronAPI.sendToOutput(OUT_KIND[n], 'html', { filePath: content.filePath });
  } else if (content.kind === 'htmlraw' && content.html) {
    sendHTMLToOutputN(n, content.html, null);
  } else if (content.kind === 'text') {
    pv2SendTextToOutputN(n, content.html, content.ref);
  }
}

// Примусово оновити один вихід, ігноруючи поточну ціль відправки
function pv2ForceRefresh(n) {
  const t = state.sendTarget;
  state.sendTarget = 'all';
  pv2PushToOutput(n, pv2LastContent);
  state.sendTarget = t;
}

// Чи всі виходи в режимі «дзеркало» (тоді працює звичайний швидкий broadcast)
function pv2AllMirror() {
  if (state.sendTarget !== 'all') return false; // адресна відправка — потрібна маршрутизація
  for (let i = 1; i <= 4; i++) if ((state.outputRoutes[i] || 'mirror') !== 'mirror') return false;
  return true;
}

// Розвести контент по всіх виходах згідно з маршрутами

// ---- Перехоплення відправки додатку: статистика + маршрутизація ----
(function hookOutputs(){
  if (typeof doSend === 'function' && !doSend._pv2) {
    const orig = doSend;
    window.doSend = function(text, ref) {
      const isBible = ref && /\d+:\d+/.test(ref);
      // Для Біблії пишемо посилання на вірш; для пісні — ЧИСТУ назву пісні
      // (а не ref, який містить суфікс слайда «(2/2)» і ламав «недавні пісні»).
      recordStat(isBible ? 'bible' : 'song',
        isBible ? ref
                : ((typeof selectedSong !== 'undefined' && selectedSong) ? selectedSong.title : (ref || '')));
      if (pv2AllMirror()) { orig(text, ref); return; }   // всі однакові — стара швидка гілка
      orig(text, ref);            // оновлює прев'ю + шле лише на «дзеркальні» виходи
      // виходи з власним маршрутом отримують свій контент
      pv2LastContent = { kind: 'text', html: String(text).replace(/\n/g, '<br>'), ref: ref || '' };
      for (let i = 1; i <= 4; i++) {
        if ((state.outputRoutes[i] || 'mirror') !== 'mirror') pv2PushToOutput(i, pv2LastContent);
      }
    };
    window.doSend._pv2 = true;
  }
  if (typeof doSendHTML === 'function' && !doSendHTML._pv2) {
    const origH = doSendHTML;
    window.doSendHTML = function(html, label) {
      recordStat('html', label);
      origH(html, label);
      if (pv2AllMirror()) return;
      pv2LastContent = { kind: 'htmlraw', html: html, label: label };
      for (let i = 1; i <= 4; i++) {
        if ((state.outputRoutes[i] || 'mirror') !== 'mirror') pv2PushToOutput(i, pv2LastContent);
      }
    };
    window.doSendHTML._pv2 = true;
  }
})();


// ============================================================
// ЕФІР: PREVIEW → LIVE
// У SoftProjector контент спершу готують у Prepare, і лише потім
// натискають Go Live. Ми робимо так само, але прев'ю показує
// точний вигляд слайда, а не лише текст.
// ============================================================
function saveLiveConfig() {
  saveJSON(STORAGE_KEYS.live, { liveMode: state.liveMode, displayCfg: state.displayCfg });
}
function loadLiveConfig() {
  const c = loadJSON(STORAGE_KEYS.live);
  if (!c) return;
  if (c.liveMode) state.liveMode = c.liveMode;
  if (c.displayCfg) Object.assign(state.displayCfg, c.displayCfg);
}

function setLiveMode(mode) {
  state.liveMode = mode;
  saveLiveConfig();
  renderTabInto('live');
  notify(mode === 'staged' ? '🎬 Режим ефіру: спершу прев\'ю' : '⚡ Режим ефіру: одразу на екран');
}


let _goingLiveWatchdog = null;
function setGoingLive(on) {
  state.goingLive = !!on;
  clearTimeout(_goingLiveWatchdog);
  if (on) {
    _goingLiveWatchdog = setTimeout(function() {
      if (state.goingLive) {
        state.goingLive = false;
        console.warn('goingLive застряг у true — скинуто автоматично (сторожовий таймер)');
        if (typeof notify === 'function') notify('⚠️ Виявлено й виправлено збій режиму «Спершу прев\'ю»');
      }
    }, 2000);
  }
}

// Покласти контент у прев'ю (не в ефір)
function stageContent(content) {
  state.preview = content;
  updateLivePanels();
}

// Відправити прев'ю в ефір
// 🔴 Оновлює індикатор «В ЕФІРІ» у верхній панелі. Читає поточний стан ефіру,
// тож викликається і за подіями (goLive/clearLive), і коротким таймером —
// щоб індикатор ніколи не відставав від реального стану екранів.
function refreshLiveIndicator() {
  var el = document.getElementById('liveIndicator');
  if (!el) return;
  var oa = (typeof state !== 'undefined') ? state.onAir : null;
  var multi = (typeof state !== 'undefined' && state.multiLive && state.multiLive.length) ? state.multiLive.slice() : [];
  var isLive = !!(oa || multi.length);

  if (!isLive) {
    el.className = 'live-ind clear';
    el.innerHTML = '<span class="live-dot"></span><span class="live-lbl">Екран чистий</span>';
    return;
  }
  var icon, what;
  if (multi.length) {
    icon = '📖';
    var names = multi.map(function(n) { return (typeof OUT_NAME !== 'undefined' && OUT_NAME[n]) ? OUT_NAME[n] : ('Вихід ' + n); });
    what = 'Кілька перекладів → ' + names.join(', ');
  } else {
    var src = (typeof lastLiveSource !== 'undefined') ? lastLiveSource : null;
    icon = (oa.kind === 'htmlraw') ? '🖼' : (src === 'song' ? '🎵' : (src === 'bible' ? '📖' : (src === 'slide' ? '📄' : '📺')));
    var body = oa.rawText || oa.ref || String(oa.html || '').replace(/<[^>]*>/g, ' ');
    var snippet = String(body).replace(/\s+/g, ' ').trim();
    var label = oa.label || '';
    what = (label && snippet && snippet !== label) ? (label + ' — ' + snippet) : (label || snippet);
    what = what.replace(/\s+/g, ' ').trim();
    if (what.length > 50) what = what.slice(0, 50) + '…';
    if (!what) what = 'Вивід';
  }
  var esc = (typeof escHtml === 'function') ? escHtml : function(s) { return s; };
  el.className = 'live-ind on';
  el.innerHTML = '<span class="live-dot"></span><span class="live-lbl">В ЕФІРІ</span>' +
    '<span class="live-what">' + icon + ' ' + esc(what) + '</span>';
}

function goLive() {
  if (!state.preview) { notify('⚠️ Прев\'ю порожнє'); return; }
  const c = state.preview;
  if (isClientStation()) {
    if (c.kind === 'htmlraw') stationSend('send-html', { html: c.html, label: c.label });
    else stationSend('send-text', { text: c.rawText != null ? c.rawText : c.html, ref: c.ref });
    state.onAir = c;
    updateLivePanels();
    notify('📡 В ефір через хост');
    return;
  }
  setGoingLive(true);
  try {
    if (c.kind === 'htmlraw' && c.multiOutputTarget && typeof sendMultiToOutput === 'function') {
      // Кілька перекладів на конкретний вихід: перебудовуємо для АКТУАЛЬНОГО
      // стану вибору перекладів (могли змінитись, поки слайд лежав у прев'ю).
      // multiOutputTarget може бути числом (один вихід) або масивом [1,2] (обидва).
      const targets = Array.isArray(c.multiOutputTarget) ? c.multiOutputTarget : [c.multiOutputTarget];
      targets.forEach(n => sendMultiToOutput(n, true));
    }
    else if (c.kind === 'htmlraw' && c.gfxTargets && c.gfxTargets.length && typeof bibleGraphicsTo === 'function') {
      // Графіка вірша: віддаємо на ТІ САМІ екрани, які були обрані у прев'ю
      bibleGraphicsTo(c.gfxTargets, true);
    }
    else if (c.kind === 'htmlraw') doSendHTML(c.html, c.label);
    else doSend(c.rawText != null ? c.rawText : c.html, c.ref);
  } finally {
    setGoingLive(false);
  }
  pushUndo(state.onAir || { empty: true });   // щоб можна було повернутись
  state.onAir = c;
  updateLivePanels();
  hostBroadcastState();
  notify('🔴 В ЕФІРІ: ' + (c.label || c.ref || 'слайд'));
}

// Очистити ефір (усі виходи, навіть із власним маршрутом)
function clearLive() {
  if (state.ui && state.ui.confirmDanger !== false && state.onAir && !_undoing) {
    if (!confirm('Очистити екран у залі?')) return;
  }
  if (isClientStation()) { stationSend('clear', {}); state.onAir = null; updateLivePanels(); return; }
  if (state.onAir && !_undoing) pushUndo(state.onAir);  // очищення теж можна скасувати
  if (window.electronAPI && window.electronAPI.clearProjector) window.electronAPI.clearProjector();
  // Повний бланк — прибираємо й ПОСТІЙНІ накладки (оголошення/Prop + логотип),
  // інакше вони лишаються поверх екрана («друга графіка», що не зникає).
  if (window.electronAPI && window.electronAPI.sendAlert) window.electronAPI.sendAlert(null, null);
  if (window.electronAPI && window.electronAPI.showLogo) window.electronAPI.showLogo(null);
  state.activePropName = null;
  state.logoOn = false;
  // Скидаємо той самий "що зараз в ефірі" стан, що й clearProjector() —
  // інакше наступне гортання (next-verse/prev-verse) думає, що вірш
  // усе ще в ефірі, і тихо повертає його назад на щойно очищений екран.
  lastLiveSource = null;
  lastLiveGraphics = false;
  lastLiveGraphicsTargets = [];
  lastLivePlain = false;
  lastLiveMulti = false;
  try { state.multiLive = []; } catch (e) {}
  try { if (typeof renderTabInto === 'function') renderTabInto('layers'); } catch (e) {}
  state.onAir = null;
  updateLivePanels();
  hostBroadcastState();
  notify('🚫 Екран очищено (все)');
}

// ---- Окремі кнопки очищення (як «Clear» у ProPresenter) -------------------
function clearSlideOnly() {
  if (isClientStation()) { stationSend('clear', {}); state.onAir = null; updateLivePanels(); return; }
  if (state.onAir && !_undoing) pushUndo(state.onAir);
  if (window.electronAPI && window.electronAPI.clearProjector) window.electronAPI.clearProjector();
  state.onAir = null;
  updateLivePanels();
  hostBroadcastState();
  notify('🚫 Слайд прибрано (накладки лишились)');
}
function clearPropsLayer() {
  if (window.electronAPI && window.electronAPI.sendAlert) window.electronAPI.sendAlert(null, null);
  else if (isClientStation()) stationSend('alert', { cfg: null });
  state.activePropName = null;
  try { if (typeof renderTabInto === 'function') renderTabInto('layers'); } catch (e) {}
  notify('🚫 Оголошення / Prop прибрано');
}
function clearLogoLayer() {
  if (window.electronAPI && window.electronAPI.showLogo) window.electronAPI.showLogo(null);
  state.logoOn = false;
  try { if (typeof renderTabInto === 'function') renderTabInto('layers'); } catch (e) {}
  notify('🚫 Логотип прибрано');
}

// Гортання куплетів У ПРЕВ'Ю, не чіпаючи зал
function previewStep(delta) {
  const s = state.selectedSong;
  if (!s || !s.verses) { notify('⚠️ Пісню не обрано'); return; }
  let i = (state.preview && typeof state.preview.verseIdx === 'number')
    ? state.preview.verseIdx
    : state.selectedVerseIdx;
  i = Math.max(0, Math.min(s.verses.length - 1, i + delta));
  stageContent({
    kind: 'text',
    rawText: s.verses[i],
    html: hallText(s.verses[i]).replace(/\n/g, '<br>'),   // те саме, що піде в зал
    ref: s.title || '',
    label: (s.title || '') + ' — куплет ' + (i + 1),
    verseIdx: i
  });
}

// Прев'ю показує реальний слайд — той самий HTML, що піде на екран
function slideHTMLFor(content) {
  const blank = '<!DOCTYPE html><html><body style="margin:0;background:#000"></body></html>';
  if (!content) return blank;
  if (content.kind === 'htmlraw') return content.html;
  // Прев'ю має точно збігатись із залом: без акордів, із другою мовою
  content = Object.assign({}, content, {
    html: hallText(content.rawText != null ? content.rawText : (content.html || '')).replace(/\n/g, '<br>')
  });

  // Текст у залі малює projector-preload за ТЕМОЮ, а не рушієм графіки.
  // Тому прев'ю відтворюємо саме темою — інакше оператор бачив би не те, що зал.
  const t = (typeof theme !== 'undefined' && theme) ? theme : {};
  const bgColor  = t.bgColor  || '#000000';
  const bgType   = t.bgType   || 'color';
  const dim      = typeof t.bgDim === 'number' ? t.bgDim : 0;
  const blur     = t.bgBlur   || 0;
  const fontSize = t.fontSize || 58;
  const font     = t.fontFamily || 'Georgia, serif';
  // Авто-контраст, як у залі: на світлому фоні — темний текст, інакше прев'ю
  // виглядало б порожнім (білий текст на білому фоні).
  const bgForContrast = (bgType === 'gradient' && t.bgGradient)
    ? ((String(t.bgGradient).match(/#[0-9a-fA-F]{3,6}/) || [])[0] || bgColor)
    : (bgType === 'image' ? '#000000' : bgColor);
  const color    = (typeof textColorFor === 'function')
    ? textColorFor(bgForContrast, t.textColor)
    : (t.textColor || '#ffffff');
  const refColor = (typeof textColorFor === 'function')
    ? textColorFor(bgForContrast, t.refColor || '#c8a84b')
    : (t.refColor || '#c8a84b');
  const align    = t.textAlign || 'center';
  const pos      = t.textPosition || 'center';
  const shadow   = (t.textShadow === false) ? 'none' : '0 2px 12px rgba(0,0,0,.85)';
  const pad      = t.padding || 80;

  let bgLayer = `background:${bgColor}`;
  if (bgType === 'gradient' && t.bgGradient) bgLayer = `background:${t.bgGradient}`;
  if (bgType === 'image' && t.bgImage) bgLayer = `background:url('${t.bgImage}') center/cover no-repeat`;

  const vAlign = pos === 'top' ? 'flex-start' : pos === 'bottom' ? 'flex-end' : 'center';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{margin:0;background:#000;height:100vh;overflow:hidden;position:relative;font-family:${font}}
    .bg{position:fixed;inset:0;${bgLayer};filter:blur(${blur}px);z-index:0}
    .dim{position:fixed;inset:0;background:rgba(0,0,0,${dim});z-index:1}
    .wrap{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;
          align-items:center;justify-content:${vAlign};padding:${pad}px;box-sizing:border-box}
    .txt{color:${color};font-size:${fontSize}px;text-align:${align};line-height:1.4;text-shadow:${shadow}}
    .ref{color:${refColor};font-size:${Math.round(fontSize*0.55)}px;text-align:${align};margin-top:18px;text-shadow:${shadow}}
  </style></head><body>
    <div class="bg"></div><div class="dim"></div>
    <div class="wrap"><div class="txt">${content.html || ''}</div>
    ${content.ref ? `<div class="ref">${esc(content.ref)}</div>` : ''}</div>
  </body></html>`;
}

const updateLivePanels = rafDebounce(function() {
  _updateLivePanels();
  if (typeof refreshLiveIndicator === 'function') refreshLiveIndicator();
  if (typeof updateStageDisplay === 'function') updateStageDisplay();   // сцена бачить поточний+наступний наживо
  if (typeof renderRecent === 'function') renderRecent();               // оновлюємо «Нещодавні» після відправки
  if (typeof updateMultiviewFrames === 'function') updateMultiviewFrames();  // оновлюємо мультивʼю
  if (typeof refreshLiveMultiview === 'function') refreshLiveMultiview();     // плитки виходів у «Ефір»
});

// 4 плитки виходів для вкладки «Ефір»: показують, ЩО йде на КОЖЕН вихід
// (тип: Текст/Графіка/Біблія/Таймер/Наступний/Порожньо) і його маршрут.
// Джерело правди — state.outputLive[n] (пооб'єктний живий підпис) + state.outputRoutes[n].
function refreshLiveMultiview() {
  const el = document.getElementById('liveMultiview');
  if (!el) return;
  const names = { 1: 'Проектор', 2: 'Трансляція', 3: 'Вихід 3', 4: 'Вихід 4' };
  const onAir = state.onAir || {};
  const bibleLive = (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible');
  const mainType = bibleLive ? '📖 Біблія' : (onAir.html ? '🎨 Графіка' : ((onAir.label || onAir.ref) ? '📝 Текст' : '⬛ Порожньо'));
  const mainText = onAir.ref || onAir.label || '';
  el.innerHTML = [1, 2, 3, 4].map(function(n) {
    const route = (state.outputRoutes && state.outputRoutes[n]) || 'mirror';
    const rl = (typeof ROUTE_LABELS !== 'undefined' && ROUTE_LABELS[route]) || route;
    const liveLbl = state.outputLive && state.outputLive[n];
    let type, text;
    if (route === 'mirror' || !liveLbl) { type = mainType; text = mainText; }   // дзеркалить головне
    else { type = liveLbl; text = ''; }                                          // власний маршрут
    const isEmpty = (type === '⬛ Порожньо');
    const mirror = (route === 'mirror');
    return `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#0e1018;display:flex;flex-direction:column;min-height:70px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;padding:4px 7px;background:var(--panel2);border-bottom:1px solid var(--border)">
        <span style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap">${names[n]}</span>
        <span style="font-size:9px;padding:1px 6px;border-radius:8px;background:${mirror ? 'var(--border)' : 'var(--accent)'};color:${mirror ? 'var(--text2)' : '#1a1208'};white-space:nowrap">${esc(rl)}</span>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:6px 8px;gap:2px">
        <div style="font-size:12px;color:${isEmpty ? 'var(--text2)' : 'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(type)}</div>
        ${text ? `<div style="font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(String(text).slice(0, 40))}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}
function _updateLivePanels() {
  const airFrame = $('#liveOnAirFrame');
  const prevFrame = $('#livePreviewFrame');
  if (airFrame)  airFrame.srcdoc  = slideHTMLFor(state.onAir);
  if (prevFrame) prevFrame.srcdoc = slideHTMLFor(state.preview);

  const airLbl = $('#liveOnAirLabel');
  if (airLbl) airLbl.textContent = state.onAir ? (state.onAir.label || state.onAir.ref || 'слайд') : '— порожньо —';
  const prevLbl = $('#livePreviewLabel');
  if (prevLbl) prevLbl.textContent = state.preview ? (state.preview.label || state.preview.ref || 'слайд') : '— порожньо —';

  const dot = $('#liveDot');
  if (dot) dot.style.color = state.onAir ? 'var(--red)' : 'var(--text2)';
}

// ---- Перехоплення відправки: у режимі staged все спершу йде в прев'ю ----
(function hookLive(){
  // Кнопка «🚫 Очистити екран» у шапці додатку теж має скидати панель ефіру,
  // інакше в «В ЕФІРІ» лишався б слайд, якого в залі вже немає.
  if (typeof clearProjector === 'function' && !clearProjector._pv2) {
    const origClear = window.clearProjector;
    window.clearProjector = function() {
      origClear();
      state.onAir = null;
      updateLivePanels();
    };
    window.clearProjector._pv2 = true;
  }
  if (typeof doSend === 'function' && !doSend._pv2live) {
    const inner = window.doSend;
    window.doSend = function(text, ref) {
      // Друга панель не має власних проекторів — шлемо хосту
      if (isClientStation() && !state.goingLive) {
        stationSend('send-text', { text: text, ref: ref });
        notify('📡 Надіслано на хост');
        return;
      }
      if (state.liveMode === 'staged' && !state.goingLive) {
        stageContent({
          kind: 'text',
          rawText: text,
          html: hallText(text).replace(/\n/g, '<br>'),   // те саме, що піде в зал
          ref: ref || '',
          label: ref || (state.selectedSong ? state.selectedSong.title : 'Текст'),
          verseIdx: state.selectedVerseIdx
        });
        notify('📋 У прев\'ю — натисни «В ЕФІР»');
        return;
      }
      if (!state.trainingMode) inner(hallText(text), ref);   // зал бачить без акордів, із другою мовою
      else notify('🎓 Тренування — нічого не пішло на екран');
      state.onAir = { kind: 'text', rawText: text, html: hallText(text).replace(/\n/g, '<br>'), ref: ref || '', label: ref || 'Текст' };
      // Запам'ятовуємо ЗАВЖДИ — інакше графіка й маршрути показували б куплет пісні,
      // хоча в залі вже вірш із Біблії чи оголошення.
      pv2LastContent = { kind: 'text', rawText: text, html: String(text).replace(/\n/g, '<br>'), ref: ref || '' };
      updateLivePanels();
      hostBroadcastState();   // інакше друга панель і пульти не бачать, що в залі
    };
    window.doSend._pv2 = true;
    window.doSend._pv2live = true;
  }
  if (typeof doSendHTML === 'function' && !doSendHTML._pv2live) {
    const innerH = window.doSendHTML;
    window.doSendHTML = function(html, label) {
      if (isClientStation() && !state.goingLive) {
        stationSend('send-html', { html: html, label: label });
        notify('📡 Надіслано на хост');
        return;
      }
      if (state.liveMode === 'staged' && !state.goingLive) {
        stageContent({ kind: 'htmlraw', html: html, label: label || 'HTML' });
        notify('📋 У прев\'ю — натисни «В ЕФІР»');
        return;
      }
      if (!state.trainingMode) innerH(html, label);
      else notify('🎓 Тренування — нічого не пішло на екран');
      state.onAir = { kind: 'htmlraw', html: html, label: label || 'HTML' };
      pv2LastContent = { kind: 'htmlraw', html: html, label: label || 'HTML' };
      updateLivePanels();
      hostBroadcastState();
    };
    window.doSendHTML._pv2 = true;
    window.doSendHTML._pv2live = true;
  }
})();


// ============================================================
// АВТОСТАРТ ЗВОРОТНОГО ВІДЛІКУ
// Таймер сам вмикається за N хвилин до служби — без оператора.
// ============================================================
let _autoTimerTick = null;

function saveAutoTimer() { saveJSON(STORAGE_KEYS.live + '_autotimer', state.autoTimer); }
function loadAutoTimer() {
  const c = loadJSON(STORAGE_KEYS.live + '_autotimer');
  if (c) Object.assign(state.autoTimer, c);
  startAutoTimerWatcher();
}
function setAutoTimer(key, val) {
  state.autoTimer[key] = val;
  saveAutoTimer();
  startAutoTimerWatcher();
  renderTabInto('live');
}

function startAutoTimerWatcher() {
  clearInterval(_autoTimerTick);
  if (!state.autoTimer.on) return;
  // Перевіряємо раз на 30 с — цього досить і не грузить процесор.
  // schedulerTick + maybeAutoBackup НЕ дублюємо тут: їх уже робить постійний
  // _automationTick, інакше при ввімкненому таймері служби вони бігли б двічі.
  _autoTimerTick = setInterval(() => { checkAutoTimer(); }, 30000);
  checkAutoTimer();
}

// Планувальник профілів працює завжди (не лише коли ввімкнено таймер служби)
let _automationTick = null;
function startAutomationWatcher() {
  clearInterval(_automationTick);
  _automationTick = setInterval(() => { schedulerTick(); maybeAutoBackup(); }, 30000);
}
let _autoTimerFiredFor = null;
function checkAutoTimer() {
  const a = state.autoTimer;
  if (!a.on) return;
  const now = new Date();
  if (now.getDay() !== Number(a.weekday)) return;

  const [hh, mm] = String(a.time).split(':').map(Number);
  const service = new Date(now);
  service.setHours(hh || 0, mm || 0, 0, 0);

  const minsLeft = (service - now) / 60000;
  const key = now.toDateString() + a.time;
  if (minsLeft <= a.minsBefore && minsLeft > 0 && _autoTimerFiredFor !== key) {
    _autoTimerFiredFor = key;
    uiBeep();
    if (typeof timerSetTime === 'function') timerSetTime(Math.round(minsLeft * 60));
    sendHTMLToOutputN(1, getTimerHTML(), 'Відлік до служби');
    notify('⏱ Автостарт: до служби ' + Math.round(minsLeft) + ' хв');
  }
}


// ============================================================
// РОЗБИТТЯ ДОВГИХ КУПЛЕТІВ НА СЛАЙДИ
// Зменшення шрифту рятує не завжди: дрібний текст у великому залі
// однаково не читається. Краще розбити на 2-3 слайди по рядках.
// ============================================================
function splitLongText(text, maxLines, maxChars) {
  maxLines = maxLines || state.splitCfg.maxLines;
  maxChars = maxChars || state.splitCfg.maxChars;
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [text];

  const total = lines.join(' ').length;
  if (lines.length <= maxLines && total <= maxChars) return [text];

  // Скільки слайдів потрібно — і ділимо рядки якнайрівніше
  const parts = Math.max(2, Math.ceil(Math.max(lines.length / maxLines, total / maxChars)));
  const per = Math.ceil(lines.length / parts);
  const out = [];
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per).join('\n'));
  return out.filter(Boolean);
}

// Плоский список слайдів пісні з урахуванням розбиття та порядку частин
function songSlides(song) {
  if (!song || !song.verses) return [];
  const order = songOrder(song);
  const slides = [];
  order.forEach(idx => {
    const v = song.verses[idx];
    if (v == null) return;
    if (!state.splitCfg.on) { slides.push({ text: v, verseIdx: idx, part: 1, parts: 1 }); return; }
    const chunks = splitLongText(v);
    chunks.forEach((c, i) => slides.push({ text: c, verseIdx: idx, part: i + 1, parts: chunks.length }));
  });
  return slides;
}
function setSplit(key, val) {
  svcInvalidate();
  state.splitCfg[key] = val;
  saveJSON(STORAGE_KEYS.live + '_split', state.splitCfg);
  renderTabInto('song');
  notify(key === 'on' ? (val ? '✓ Розбиття увімкнено' : 'Розбиття вимкнено') : '✓ Збережено');
}
function loadSplitCfg() {
  const c = loadJSON(STORAGE_KEYS.live + '_split');
  if (c) Object.assign(state.splitCfg, c);
}

// ============================================================
// ПОРЯДОК ЧАСТИН ПІСНІ (V1 → П → V2 → П → бридж → П)
// ============================================================
function songKey(song) { return 'ord_' + (song && song.id != null ? song.id : (song && song.title) || '?'); }

// Порядок = масив індексів куплетів. Без налаштування — просто підряд.
function songOrder(song) {
  const saved = state.orders[songKey(song)];
  if (Array.isArray(saved) && saved.length) return saved.filter(i => song.verses[i] != null);
  // Приспів після кожного куплета — якщо ввімкнено для ЦІЄЇ пісні АБО глобально
  // (для всіх пісень). Будуємо порядок на льоту, щоб працювало скрізь.
  if (((state.chorusEach && state.chorusEach[songKey(song)]) || state.arrangeGlobal) && typeof autoChorusIdx === 'function') {
    const c = autoChorusIdx(song);
    if (c !== -1) {
      const order = [];
      for (let i = 0; i < song.verses.length; i++) {
        if (i === c) continue;
        if (typeof partKeyOf === 'function' && partKeyOf(song, i) === 'chorus') continue;
        order.push(i); order.push(c);
      }
      if (order.length) return order;
    }
  }
  return song.verses.map((_, i) => i);
}
function setSongOrder(song, arr) {
  svcInvalidate();
  state.orders[songKey(song)] = arr;
  saveJSON(STORAGE_KEYS.live + '_orders', state.orders);
  renderTabInto('song');
  notify('✓ Порядок збережено: ' + arr.map(i => i + 1).join(' → '));
}
function orderAdd(i) {
  const s = state.selectedSong;
  if (!s) return;
  const cur = songOrder(s).slice();
  cur.push(i);
  setSongOrder(s, cur);
}
function orderRemoveAt(pos) {
  const s = state.selectedSong;
  if (!s) return;
  const cur = songOrder(s).slice();
  cur.splice(pos, 1);
  setSongOrder(s, cur.length ? cur : s.verses.map((_, i) => i));
}

// Перетягування чипів аранжування мишкою (зміна порядку).
var _orderDragPos = -1;
function orderDragStart(e, pos) { _orderDragPos = pos; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(pos)); } catch (x) {} } }
function orderDragOver(e) { if (e.preventDefault) e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }
function orderDrop(e, pos) {
  if (e.preventDefault) e.preventDefault();
  const s = state.selectedSong;
  const from = _orderDragPos; _orderDragPos = -1;
  if (!s || from < 0 || from === pos) return;
  const order = songOrder(s).slice();
  if (from >= order.length || pos > order.length) return;
  const moved = order.splice(from, 1)[0];
  order.splice(pos, 0, moved);
  setSongOrder(s, order);
}
function orderReset() {
  svcInvalidate();
  const s = state.selectedSong;
  if (!s) return;
  delete state.orders[songKey(s)];
  saveJSON(STORAGE_KEYS.live + '_orders', state.orders);
  renderTabInto('song');
  notify('↺ Порядок скинуто');
}
// Автоматично: приспів після КОЖНОГО куплета (Куплет→Приспів→Куплет→Приспів…).
// Дивиться на мітки частин: бере всі «Куплет» і вставляє після кожного «Приспів».
// Автовизначення приспіву: спершу за міткою, інакше за словом «Приспів» на
// початку тексту секції (щоб не треба було нічого позначати вручну).
function autoChorusIdx(song) {
  if (!song || !song.verses) return -1;
  for (let i = 0; i < song.verses.length; i++) {
    if (typeof partKeyOf === 'function' && partKeyOf(song, i) === 'chorus') return i;
  }
  for (let i = 0; i < song.verses.length; i++) {
    const first = String(song.verses[i] || '').split('\n')[0].trim().toLowerCase();
    if (/^(приспів|приспiв|chorus|refrain|прыспеў)/.test(first)) return i;
  }
  return -1;
}

// Будує порядок Куплет→Приспів→Куплет→Приспів… (усе, що не приспів — куплет).
function applyChorusEach(song) {
  const c = autoChorusIdx(song);
  if (c === -1) { notify('У пісні не видно приспіву — познач його в «🏷 Мітки частин» або почни рядок словом «Приспів»'); return false; }
  const order = [];
  for (let i = 0; i < song.verses.length; i++) {
    if (i === c) continue;                                            // сам приспів окремо
    if (typeof partKeyOf === 'function' && partKeyOf(song, i) === 'chorus') continue; // інші приспіви теж
    order.push(i); order.push(c);
  }
  if (!order.length) { notify('Не знайдено куплетів'); return false; }
  setSongOrder(song, order);
  return true;
}

// Перемикач біля пісні: увімкнув — сам збудує порядок, вимкнув — прибере.
// Глобальне аранжування: «приспів після кожного куплета» для ВСІХ пісень одразу.
function loadArrangeGlobal() {
  try { state.arrangeGlobal = localStorage.getItem('church_arrange_global') === '1'; } catch (e) { state.arrangeGlobal = false; }
}
function toggleArrangeGlobal(on) {
  state.arrangeGlobal = !!on;
  try { localStorage.setItem('church_arrange_global', on ? '1' : '0'); } catch (e) {}
  if (typeof svcInvalidate === 'function') svcInvalidate();   // план служби перебудує слайди
  if (typeof renderTabInto === 'function' && typeof isActive === 'function' && isActive('song')) renderTabInto('song');
  if (typeof renderSongOrderMini === 'function') renderSongOrderMini();
  if (typeof notify === 'function') notify(on ? '🔁 Приспів після кожного — для ВСІХ пісень' : 'Глобальне аранжування вимкнено');
}

function toggleChorusEach(on) {
  const s = state.selectedSong;
  if (!s) return;
  const key = songKey(s);
  state.chorusEach[key] = !!on;
  saveChorusEach();
  if (on) {
    if (!applyChorusEach(s)) { state.chorusEach[key] = false; saveChorusEach(); renderTabInto('song'); }
  } else {
    orderReset();
  }
}
function saveChorusEach() { saveJSON(STORAGE_KEYS.live + '_chorusEach', state.chorusEach); }

// Тихо (без повідомлень) застосувати «приспів після кожного», якщо для пісні
// ввімкнено прапорець — викликається при виборі пісні, щоб аранжування вже
// працювало одразу, без повторного вмикання галочки.
function ensureChorusEach(song) {
  if (!song || !song.verses || !state.chorusEach || !state.chorusEach[songKey(song)]) return;
  const c = autoChorusIdx(song);
  if (c === -1) return;
  const vs = arrangeVerseIdxs(song, c);
  if (!vs.length) return;
  const order = [];
  vs.forEach(v => { order.push(v); order.push(c); });
  state.orders[songKey(song)] = order;
  saveJSON(STORAGE_KEYS.live + '_orders', state.orders);
}

// Індекси куплетів (усе, що не приспів) для пісні.
function arrangeVerseIdxs(song, chorusIdx) {
  const vs = [];
  for (let i = 0; i < song.verses.length; i++) {
    if (i === chorusIdx) continue;
    if (typeof partKeyOf === 'function' && partKeyOf(song, i) === 'chorus') continue;
    vs.push(i);
  }
  return vs;
}

// Готові шаблони аранжування (приспів шукається сам).
function applyArrangePreset(preset) {
  const s = state.selectedSong;
  if (!s || !preset) { return; }
  const key = songKey(s);
  if (preset === 'plain') { state.chorusEach[key] = false; saveChorusEach(); orderReset(); return; }
  const c = autoChorusIdx(s);
  const needsChorus = (preset !== 'verses');
  if (needsChorus && c === -1) { notify('У пісні не видно приспіву — познач його в «🏷 Мітки частин» або почни рядок словом «Приспів»'); return; }
  const vs = arrangeVerseIdxs(s, c);
  if (!vs.length) { notify('Не знайдено куплетів'); return; }
  let order = [];
  if (preset === 'each')       { vs.forEach(v => { order.push(v); order.push(c); }); }
  else if (preset === 'end')   { order = vs.slice(); order.push(c); }
  else if (preset === 'frame') { order = [c].concat(vs); order.push(c); }
  else if (preset === 'last2') { vs.forEach(v => { order.push(v); order.push(c); }); order.push(vs[vs.length - 1]); }
  else if (preset === 'verses'){ order = vs.slice(); }
  else { return; }
  state.chorusEach[key] = (preset === 'each');   // галочка синхронна лише для «після кожного»
  saveChorusEach();
  setSongOrder(s, order);
}

// Стара кнопка/сумісність — тепер теж через автовизначення.
function arrangeChorusEach() {
  const s = state.selectedSong;
  if (!s) { notify('Спершу обери пісню'); return; }
  applyChorusEach(s);
}

function loadOrders() {
  const o = loadJSON(STORAGE_KEYS.live + '_orders');
  if (o) state.orders = o;
  const ce = loadJSON(STORAGE_KEYS.live + '_chorusEach');
  if (ce) state.chorusEach = ce;
}

// Гортання слайдами пісні (з урахуванням розбиття й порядку)
function songStep(delta) {
  const s = state.selectedSong;
  if (!s) { notify('⚠️ Пісню не обрано'); return; }
  const slides = songSlides(s);
  if (!slides.length) return;

  // Пісня змінилась — починаємо з першого слайда і одразу фіксуємо розмір шрифту
  // під найдовший куплет, щоб текст не «стрибав» між слайдами.
  const key = songKey(s);
  if (state._slideSong !== key) {
    state._slideSong = key;
    state.slideIdx = -1;
    applySongSize();
  }

  let i = (typeof state.slideIdx === 'number') ? state.slideIdx : 0;
  i = Math.max(0, Math.min(slides.length - 1, i + delta));
  state.slideIdx = i;
  const sl = slides[i];
  const label = s.title + ' — куплет ' + (sl.verseIdx + 1) + (sl.parts > 1 ? ' (' + sl.part + '/' + sl.parts + ')' : '');
  stageContent({
    kind: 'text', rawText: sl.text, html: hallText(sl.text).replace(/\n/g, '<br>'),
    ref: s.title || '', label: label, verseIdx: sl.verseIdx
  });
  if (state.liveMode !== 'staged') goLive();
  if (typeof renderSongOrderMini === 'function') renderSongOrderMini();   // оновити підсвітку поточної позиції
}

// Гортання пісні В ЕФІРІ з урахуванням аранжування (state.orders) і розбиття.
// Повертає true, якщо порядок/розбиття задані й слайд уже показано через songStep
// (songStep сам робить goLive у не-staged, або лишає в прев'ю у staged).
// false — коли аранжування немає: тоді викликач гортає куплети підряд, як раніше.
function liveSongAdvance(delta) {
  const s = state.selectedSong;
  if (s && (state.splitCfg.on || (state.orders && state.orders[songKey(s)]))) {
    songStep(delta);
    return true;
  }
  return false;
}

// ============================================================
// ДРУГА МОВА (укр + чеська)
// Той самий вірш другою мовою: або окремим блоком під основним,
// або на окремий вихід (напр. трансляція чеською).
// ============================================================
function bibleTranslationsList() {
  if (typeof bibleTranslations === 'undefined' || !bibleTranslations) return [];
  return Object.keys(bibleTranslations).map(id => ({ id: id, name: bibleTranslations[id].name }));
}

// Текст поточного вірша в іншому перекладі
function langTextFor(id) {
  if (!id || typeof bibleTranslations === 'undefined' || !bibleTranslations[id]) return null;
  const b = state.currentBibleBook, c = state.currentBibleChapter, v = state.currentBibleVerseNum;
  if (!b || !c || !v) return null;
  const t = bibleTranslations[id];
  const txt = t.books && t.books[b] && t.books[b][c] && t.books[b][c][v];
  return txt || null;
}
function secondLangText() { return langTextFor(state.secondLang); }
function thirdLangText()  { return langTextFor(state.thirdLang); }

// Усі додаткові мови, які треба показати під основним текстом
function extraLangTexts() {
  const out = [];
  const t2 = secondLangText();
  if (t2) out.push(t2);
  const t3 = thirdLangText();
  if (t3 && t3 !== t2) out.push(t3);
  return out;
}

function setSecondLang(id) {
  state.secondLang = id || null;
  saveJSON(STORAGE_KEYS.station + '_lang', { id: state.secondLang, mode: state.secondLangMode });
  notify(id ? '🌐 Друга мова увімкнена' : 'Другу мову вимкнено');
  updateLivePanels();
}
function setThirdLang(id) {
  state.thirdLang = id || null;
  saveJSON(STORAGE_KEYS.station + '_lang3', { id: state.thirdLang });
  notify(id ? '🌐 Третя мова увімкнена' : 'Третю мову вимкнено');
  updateLivePanels();
  renderTabInto('extras');
}
function setSecondLangMode(mode) {
  state.secondLangMode = mode; // 'under' = під основним текстом | 'output' = на окремий вихід
  saveJSON(STORAGE_KEYS.station + '_lang', { id: state.secondLang, mode: mode });
  renderTabInto('extras');   // вкладка з цим перемикачем називається 'extras' (як і в setThirdLang нижче)
}
function loadSecondLang() {
  const c = loadJSON(STORAGE_KEYS.station + '_lang');
  if (c) {
    state.secondLang = c.id || null;
    state.secondLangMode = c.mode || 'under';
  }
  const c3 = loadJSON(STORAGE_KEYS.station + '_lang3');
  if (c3) state.thirdLang = c3.id || null;
}

// Вбудовуємо другу мову в контент, який іде на екран
function withSecondLang(content) {
  if (state.secondLangMode !== 'under') return content;
  const extras = extraLangTexts();
  if (!extras.length) return content;
  const c = Object.assign({}, content);
  // Кожна наступна мова трохи менша й блідіша — щоб основна лишалась головною
  const sizes = ['0.72em', '0.62em'];
  const ops   = ['.78', '.65'];
  c.html = (c.html || '') + extras.map((t, i) =>
    '<div style="margin-top:0.5em;opacity:' + (ops[i] || '.6') +
    ';font-size:' + (sizes[i] || '0.6em') + ';font-style:italic">' + esc(t) + '</div>').join('');
  return c;
}

// ============================================================
// АКОРДИ ДЛЯ МУЗИКАНТІВ + ТРАНСПОНУВАННЯ
// ============================================================
const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

function transposeChord(chord, semitones) {
  const m = chord.match(/^([A-H][#b]?)(.*)$/);
  if (!m) return chord;
  let root = m[1].replace('H', 'B');           // німецька нотація
  const rest = m[2];
  let i = NOTES_SHARP.indexOf(root);
  if (i === -1) i = NOTES_FLAT.indexOf(root);
  if (i === -1) return chord;
  const useFlat = /b/.test(root);
  const ni = (((i + semitones) % 12) + 12) % 12;
  return (useFlat ? NOTES_FLAT : NOTES_SHARP)[ni] + rest;
}
// Транспонує весь текст із акордами у [квадратних дужках]
function transposeText(text, semitones) {
  if (!semitones) return text;
  return String(text).replace(/\[([^\]]+)\]/g, (full, ch) => '[' + transposeChord(ch, semitones) + ']');
}
function setTranspose(n) {
  state.transpose = Math.max(-11, Math.min(11, n));
  const lbl = $('#transposeLabel');
  if (lbl) lbl.textContent = (state.transpose > 0 ? '+' : '') + state.transpose;
  updateStageDisplay();
  notify('🎸 Транспонування: ' + (state.transpose > 0 ? '+' : '') + state.transpose);
}
// Чи має пісня акорди
function songHasChords(song) {
  return !!(song && song.verses && song.verses.some(v => /\[[A-H][#b]?[^\]]{0,6}\]/.test(v)));
}
// Текст для музикантів: акорди збережені, транспоновані
function chordsForStage(song, idx) {
  if (!song || !song.verses) return '';
  const raw = song.verses[idx] || '';
  return transposeText(raw, state.transpose || 0);
}
// Текст для залу: акорди прибрані (їх не мають бачити люди)

// Шлях до локального файлу → коректний file:// URL на Windows і на Mac.
// Windows: C:\Users\...\file.mp4  → file:///C:/Users/.../file.mp4
//   (літеру диска НЕ кодуємо, інакше «C:» стає «C%3A» і файл не відкриється)
// Mac/Linux: /Users/.../file.mp4    → file:///Users/.../file.mp4
function pathToFileUrl(p) {
  let s = String(p || '').replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(s)) s = '/' + s;              // Windows-диск
  const parts = s.split('/').map(seg =>
    /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)
  );
  return 'file://' + parts.join('/');
}

function stripChords(text) {
  return String(text).replace(/\[[^\]]*\]/g, '');
}


// Текст, який реально бачить зал: акорди прибрані, друга мова додана.
// Раніше ці дві функції працювали лише в маршрутах, а головний вихід
// (проектор) отримував сирий рядок — з [Am] і без чеської.
function hallText(text) {
  // esc(): текст завжди екрануємо перед показом у зал — інакше "<"/">" з
  // імпортованих пісень/віршів чи довільний скрипт із мережевої команди
  // (station sync) виконався б як HTML у вікні проектора (contextIsolation
  // там вимкнено навмисно для webview/iframe-графіки).
  let t = esc(stripChords(String(text == null ? '' : text)));
  if (state.secondLangMode === 'under') {
    // Ті самі мови, що й у виводі з графікою (друга + третя) — щоб зал бачив
    // однаково незалежно від того, як надіслано текст.
    const extras = (typeof extraLangTexts === 'function') ? extraLangTexts() : [];
    const sizes = ['0.72em', '0.62em'];
    const ops   = ['.78', '.65'];
    extras.forEach((x, i) => {
      t += '<div style="margin-top:0.5em;opacity:' + (ops[i] || '.6') +
           ';font-size:' + (sizes[i] || '0.6em') + ';font-style:italic">' + esc(x) + '</div>';
    });
  }
  return t;
}

// ============================================================
// СКАСУВАННЯ ОСТАННЬОЇ ДІЇ
// Випадково очистив екран посеред пісні — повертаєш одним кліком.
// ============================================================
const _undoStack = [];
function pushUndo(snapshot) {
  _undoStack.push(snapshot);
  if (_undoStack.length > 20) _undoStack.shift();
  const btn = $('#undoBtn');
  if (btn) btn.disabled = false;
}
let _undoing = false;
function undoLast() {
  const prev = _undoStack.pop();
  if (!prev) { notify('Нічого скасовувати'); return; }

  // Друга панель не має власних проекторів — скасування теж іде через хост
  if (isClientStation()) {
    if (prev.empty) stationSend('clear', {});
    else if (prev.kind === 'htmlraw') stationSend('send-html', { html: prev.html, label: prev.label });
    else stationSend('send-text', { text: prev.rawText != null ? prev.rawText : prev.html, ref: prev.ref });
    state.onAir = prev.empty ? null : prev;
    updateLivePanels();
    notify('↶ Повернуто (через хост)');
    return;
  }

  _undoing = true;   // щоб clearLive не поклав слайд назад у стек (нескінченний пінг-понг)
  try {
    if (prev.empty) { clearLive(); notify('↶ Повернуто: порожній екран'); return; }
    state.goingLive = true;
    try {
      if (prev.kind === 'htmlraw') doSendHTML(prev.html, prev.label);
      else doSend(prev.rawText != null ? prev.rawText : prev.html, prev.ref);
    } finally { state.goingLive = false; }
    state.onAir = prev;
    updateLivePanels();
    hostBroadcastState();
    notify('↶ Повернуто: ' + (prev.label || prev.ref || 'слайд'));
  } finally { _undoing = false; }
}

// ============================================================
// ІМЕНОВАНІ ТЕМИ (як «Add New Theme» у SoftProjector,
// але тема охоплює і проектор, і графіку, і текст усіх 4 виходів)
// ============================================================
function currentThemeSnapshot() {
  return {
    graphics: JSON.parse(JSON.stringify(state.graphicsSettings)),
    text: JSON.parse(JSON.stringify(state.textSettings)),
    projector: (typeof theme !== 'undefined') ? JSON.parse(JSON.stringify(theme)) : null
  };
}
function saveThemeAs() {
  pv2Prompt('Назва теми:', 'Тема ' + (state.themes.length + 1), function(name){
  if (!name) return;
  const t = { id: 'th_' + Date.now(), name: name, data: currentThemeSnapshot() };
  state.themes.push(t);
  state.activeThemeId = t.id;
  saveJSON(STORAGE_KEYS.themes, state.themes);
  renderTabInto('live');
  notify('✓ Тему «' + name + '» збережено');
  });
}
function applyNamedTheme(id) {
  const t = state.themes.find(x => x.id === id);
  if (!t) return;
  state.activeThemeId = id;
  if (typeof logChange === 'function') logChange('Тема служіння', 'застосовано «' + t.name + '»');
  Object.assign(state.graphicsSettings, t.data.graphics || {});
  if (t.data.text) Object.assign(state.textSettings, JSON.parse(JSON.stringify(t.data.text)));
  if (t.data.projector && typeof theme !== 'undefined') {
    Object.assign(theme, t.data.projector);
    if (typeof syncThemeUI === 'function') syncThemeUI();
    if (window.electronAPI && window.electronAPI.setTheme) window.electronAPI.setTheme(theme);
  }
  saveJSON(STORAGE_KEYS.themes, state.themes);
  updateGraphicsPreview();
  updateLivePanels();
  notify('🎨 Тема «' + t.name + '» застосована');
}
function updateNamedTheme() {
  const t = state.themes.find(x => x.id === state.activeThemeId);
  if (!t) { saveThemeAs(); return; }
  t.data = currentThemeSnapshot();
  saveJSON(STORAGE_KEYS.themes, state.themes);
  notify('💾 Тему «' + t.name + '» оновлено');
}
function deleteNamedTheme() {
  const t = state.themes.find(x => x.id === state.activeThemeId);
  if (!t || !confirm('Видалити тему «' + t.name + '»?')) return;
  state.themes = state.themes.filter(x => x.id !== t.id);
  state.activeThemeId = state.themes.length ? state.themes[0].id : null;
  saveJSON(STORAGE_KEYS.themes, state.themes);
  renderTabInto('live');
  notify('🗑 Тему видалено');
}
function loadNamedThemes() {
  const t = loadJSON(STORAGE_KEYS.themes);
  if (Array.isArray(t)) state.themes = t;
}

// ============================================================
// НАЛАШТУВАННЯ ВИВОДУ (поверх усіх вікон / один монітор)
// ============================================================
function applyDisplayCfg() {
  const d = state.displayCfg;
  if (!window.electronAPI) return;
  if (window.electronAPI.setAlwaysOnTop) window.electronAPI.setAlwaysOnTop(d.alwaysOnTop);
  if (window.electronAPI.setSingleScreen) {
    window.electronAPI.setSingleScreen(d.singleScreen,
      { size: d.ctrlSize, align: d.ctrlAlign, opacity: d.ctrlOpacity });
  }
  saveLiveConfig();
}
function setDisplayCfg(key, val) {
  state.displayCfg[key] = val;
  applyDisplayCfg();
  const lbl = $('#ctrlSizeLabel');
  if (lbl) lbl.textContent = state.displayCfg.ctrlSize + 'px';
  const olbl = $('#ctrlOpacityLabel');
  if (olbl) olbl.textContent = Math.round(state.displayCfg.ctrlOpacity * 100) + '%';
}

// Кнопки на самому екрані виводу (режим одного монітора) керують ефіром
function initUpdateListener() {
  if (window.electronAPI && window.electronAPI.onUpdateStatus) {
    window.electronAPI.onUpdateStatus(d => {
      if (d.state === 'available') notify('⬇️ Нова версія ' + d.version + ' завантажується...');
      else if (d.state === 'ready') {
        if (confirm('Оновлення ' + d.version + ' готове. Встановити зараз (програма перезапуститься)?')) {
          window.electronAPI.installUpdate();
        }
      }
    });
  }
}

function initDisplaysListener() {
  if (window.electronAPI && window.electronAPI.onDisplaysChanged) {
    window.electronAPI.onDisplaysChanged(list => {
      state.displays = list || [];
      if (isActive('monitors2')) renderTabInto('monitors2');
      if (typeof syncMonitorMissingBanner === 'function') syncMonitorMissingBanner();
      notify('🖥 Склад моніторів змінився');
    });
  }
}

function initLogoListener() {
  if (window.electronAPI && window.electronAPI.onLogoAutoHidden) {
    window.electronAPI.onLogoAutoHidden(() => {
      state.logoOn = false;
      if (isActive('layers')) renderTabInto('layers');
      notify('🖼 Логотип прибрано — пішов новий слайд');
    });
  }
}

function initDisplayControlListener() {
  if (!window.electronAPI || !window.electronAPI.onDisplayControl) return;
  window.electronAPI.onDisplayControl(action => {
    if (action === 'next')  { previewStep(1); goLive(); }
    if (action === 'prev')  { previewStep(-1); goLive(); }
    if (action === 'clear') clearLive();
    if (action === 'close') { for (let i = 1; i <= 4; i++) pv2CloseOutput(i); }
  });
}


// ---- Вкладка «Ефір» — головний екран оператора ----
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


// ---- Хромакей для будь-якого з 4 виходів ----
function saveChroma() { saveJSON(STORAGE_KEYS.chroma, state.outputChroma); }
function loadOutputChroma() {
  const c = loadJSON(STORAGE_KEYS.chroma);
  if (!c) return;
  for (let i = 1; i <= 4; i++) {
    if (!c[i]) continue;
    state.outputChroma[i] = c[i];
    if (window.electronAPI && window.electronAPI.setOutputChroma) {
      window.electronAPI.setOutputChroma(OUT_KIND[i], c[i]);
    }
  }
}
function pv2SetChroma(n, color) {
  let c = (color || 'none').trim();
  if (c !== 'none') {
    if (!/^#/.test(c)) c = '#' + c;
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) {
      notify('⚠️ Невірний код кольору. Приклад: #00ff00');
      return;
    }
  }
  const prevChroma = state.outputChroma[n];
  state.outputChroma[n] = c;
  if (typeof logChange === 'function' && prevChroma !== c) {
    logChange('Хромакей ' + (OUT_NAME[n] || n), (prevChroma || 'none') + ' → ' + c);
  }
  saveChroma();
  if (window.electronAPI && window.electronAPI.setOutputChroma) {
    window.electronAPI.setOutputChroma(OUT_KIND[n], c);
  }
  const input = $('#pv2Chroma' + n);
  if (input) input.value = c === 'none' ? '' : c;
  const sw = $('#pv2ChromaSw' + n);
  if (sw) sw.style.background = c === 'none' ? 'transparent' : c;
  // Стара вкладка «Монітори» теж має побачити зміну — інакше два місця розійдуться
  if (n === 2 && typeof outputConfig !== 'undefined') {
    outputConfig.streamChroma = c;
    document.querySelectorAll('.chroma-swatch').forEach(s => {
      s.classList.toggle('sel', s.getAttribute('data-color') === c);
    });
  }
  notify('🟩 Хромакей ' + OUT_NAME[n] + ': ' + (c === 'none' ? 'вимкнено' : c));
}
function pv2ApplyChromaInput(n) {
  const input = $('#pv2Chroma' + n);
  pv2SetChroma(n, input && input.value ? input.value : 'none');
}


// ============================================================
// ПАНЕЛЬ ПОЛІВ GDD-ГРАФІКИ
// Значення можна міняти НАЖИВО — графіка отримує update() через
// postMessage і не перезавантажується, тож таймер не збивається.
// ============================================================
function gddOpenPanel(i) {
  const overlay = (typeof htmlOverlays !== 'undefined') ? htmlOverlays[i] : null;
  if (!overlay) return;
  const fields = gddSchema(overlay.content);
  if (!fields.length) { notify('⚠️ У цій графіці немає полів'); return; }

  const saved = (typeof gddParams !== 'undefined' && gddParams[i]) ? gddParams[i] : gddDefaults(overlay.content);
  if (typeof gddParams !== 'undefined') gddParams[i] = saved;

  // Групуємо поля за префіксом (_line1_size → група "line1"), щоб 57 полів не були суцільною стіною
  const groups = {};
  fields.forEach(f => {
    const base = f.key.replace(/^_/, '').split('_')[0] || 'інше';
    (groups[base] = groups[base] || []).push(f);
  });

  const rows = Object.keys(groups).map(g => {
    const inputs = groups[g].map(f => {
      const val = saved[f.key] !== undefined ? saved[f.key] : f.def;
      const isLong = /multi-line/.test(f.type);
      // Поля-зображення (фон, фото, лого) можна заповнити файлом з комп'ютера —
      // фото вшивається в графіку і працює БЕЗ інтернету.
      // Ширший список синонімів — сторонні шаблони HTML-графіки можуть називати
      // поле зображення як завгодно (cover/banner/avatar/зображення/картинка тощо),
      // тому кнопка «Файл з комп'ютера» раніше з'являлась не для всіх таких полів.
      const isImage = /(bg|background|image|img|photo|foto|logo|picture|pic|poster|cover|banner|avatar|icon|thumb|badge|back|фон|фото|логотип|зображен|картинк|банер|обкладинк|аватар|значок|іконк|світлин|малюнок|постер|мініатюр)/i.test(f.key + ' ' + f.label);
      const embedded = /^data:image/.test(String(val));
      // Вшите фото не показуємо повним текстом — інакше поле забите base64
      const shown = embedded ? '' : val;
      const ph = embedded ? '📷 фото вшито — обери інший файл, щоб замінити' : (isImage ? 'посилання на зображення або файл нижче' : '');
      const ctl = isLong
        ? `<textarea data-gdd="${f.key}" rows="2" oninput="gddFieldChange(${i}, this)"
             style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:11px;outline:none">${esc(shown)}</textarea>`
        : `<input type="text" data-gdd="${f.key}" value="${esc(shown)}" placeholder="${esc(ph)}" oninput="gddFieldChange(${i}, this)"
             style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:11px;outline:none">`;
      const fileBtn = isImage
        ? `<div style="display:flex;gap:5px;align-items:center;margin-top:4px">
             <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 9px" onclick="gddPickImage(${i}, '${esc(f.key)}')">📁 Файл з комп'ютера</button>
             ${embedded ? `<span style="font-size:11px;color:var(--green)">✓ вшито, працює офлайн</span>
               <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 8px;color:var(--red)" onclick="gddClearImage(${i}, '${esc(f.key)}')">✕</button>` : ''}
           </div>`
        : '';
      return `<div style="margin-bottom:6px"><div style="font-size:12px;color:var(--text2)">${esc(f.label)}</div>${ctl}${fileBtn}</div>`;
    }).join('');
    return `<details style="margin-bottom:4px;border:1px solid var(--border);border-radius:5px;padding:6px">
      <summary style="cursor:pointer;font-size:11px;color:var(--text)"><b>${esc(g)}</b> <span style="color:var(--text2)">(${groups[g].length})</span></summary>
      <div style="margin-top:6px">${inputs}</div>
    </details>`;
  }).join('');

  const host = $('#tab-content-htmlgfx');
  let panel = $('#gddPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'gddPanel';
    panel.className = 'pv2';
    if (host) host.appendChild(panel);
  }
  // Зовнішні ресурси не завантажаться на комп'ютері без інтернету
  const ext = (overlay.content.match(/https?:\/\/[^"'\s)]+/g) || [])
    .filter(u => !/w3\.org|schema\.json/.test(u))
    .map(u => u.split('/')[2]);
  const uniqExt = Array.from(new Set(ext));
  const offlineWarn = uniqExt.length
    ? `<div style="background:#3b2a0a;border:1px solid #7a5a12;border-radius:5px;padding:6px;margin-top:6px;font-size:12px;color:#f0c040">
         ⚠ Графіка тягне ресурси з інтернету (${uniqExt.map(esc).join(', ')}). Без мережі шрифт або зображення можуть не завантажитись —
         перевір заздалегідь на тому ПК, що стоїть у залі.
       </div>` : '';

  panel.innerHTML = `<div class="card" style="border-color:var(--accent);margin-top:10px">
    <div class="card-title">🎛 Поля графіки «${esc(overlay.name)}»</div>
    ${offlineWarn}
    <div class="card-sub">Зміни застосовуються <b>наживо</b> — графіка не перезавантажується, таймер не збивається.</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin:8px 0">
      <button class="btn btn-success btn-sm" onclick="gddPlay(${i})">▶ Показати</button>
      <button class="btn btn-primary btn-sm" onclick="gddLiveUpdate(${i})">🔄 Оновити наживо</button>
      <button class="btn btn-ghost btn-sm" onclick="gddStop()">⏹ Прибрати</button>
      <button class="btn btn-ghost btn-sm" onclick="gddResetFields(${i})">↺ Скинути поля</button>
    </div>
    <div style="max-height:340px;overflow-y:auto">${rows}</div>
  </div>`;
  notify('🎛 Поля відкрито — ' + fields.length + ' шт.');
}


// Локальне фото у поле графіки (фон/лого) — вшивається як base64, працює офлайн
function gddPickImage(i, key) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = e => {
      // Стискаємо фото під екран (1920px, JPEG) — щоб графіка не важчала
      // й фото вміщалось у сховище та переживало перезапуск.
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const max = 1920;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        let dataUrl;
        try {
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          dataUrl = cv.toDataURL('image/jpeg', 0.82);
        } catch (err) {
          dataUrl = e.target.result;   // якщо стиснення не вийшло — беремо як є
        }
        if (typeof gddParams !== 'undefined') {
          gddParams[i] = gddParams[i] || {};
          gddParams[i][key] = dataUrl;
        }
        saveGddParams();
        gddLiveUpdate(i);
        gddOpenPanel(i);   // перебудовуємо панель, щоб показати «фото вшито»
        notify('🖼 Фото вшито у «' + key + '» (' + Math.round(dataUrl.length / 1024) + ' КБ) — працює без інтернету');
      };
      img.onerror = () => notify('❌ Це не схоже на зображення');
      img.src = e.target.result;
    };
    r.onerror = () => notify('❌ Не вдалось прочитати файл');
    r.readAsDataURL(f);
  };
  inp.click();
}

// Значення полів графіки (разом із вшитими фото) зберігаємо між запусками
function saveGddParams() {
  try {
    const out = {};
    Object.keys(gddParams || {}).forEach(idx => {
      const ov = (typeof htmlOverlays !== 'undefined') ? htmlOverlays[idx] : null;
      if (ov && ov.name) out[ov.name] = gddParams[idx];
    });
    if (typeof bigStoreSet === 'function') bigStoreSet('church_gdd_params', JSON.stringify(out));
    else localStorage.setItem('church_gdd_params', JSON.stringify(out));
  } catch (e) {
    notify('⚠️ Фото не збереглось між запусками (замало місця) — але зараз працює');
  }
}
function loadGddParams() {
  try {
    const raw = (typeof bigStoreGet === 'function') ? bigStoreGet('church_gdd_params') : localStorage.getItem('church_gdd_params');
    if (!raw) return;
    const byName = JSON.parse(raw);
    (typeof htmlOverlays !== 'undefined' ? htmlOverlays : []).forEach((ov, idx) => {
      if (ov && ov.name && byName[ov.name]) gddParams[idx] = byName[ov.name];
    });
  } catch (e) {}
}
function gddClearImage(i, key) {
  if (typeof gddParams === 'undefined' || !gddParams[i]) return;
  gddParams[i][key] = '';
  saveGddParams();
  gddLiveUpdate(i);
  gddOpenPanel(i);
  notify('Фото прибрано');
}

function gddFieldChange(i, el) {
  const key = el.getAttribute('data-gdd');
  if (typeof gddParams === 'undefined') return;
  gddParams[i] = gddParams[i] || {};
  gddParams[i][key] = el.value;
  saveGddParams();
  gddLiveUpdateDebounced(i);
}

// Наживо: шлемо update() у графіку, що вже на екрані
function gddLiveUpdate(i) {
  if (!window.electronAPI || !window.electronAPI.gddCommand) return;
  const data = (typeof gddParams !== 'undefined' && gddParams[i]) ? gddParams[i] : {};
  window.electronAPI.gddCommand(null, 'update', data);
  notify('🔄 Графіку оновлено');
}
const gddLiveUpdateDebounced = (function() {
  let t = null;
  return function(i) { clearTimeout(t); t = setTimeout(() => gddLiveUpdate(i), 250); };
})();

function gddPlay(i) {
  if (typeof sendHTMLOverlay === 'function') sendHTMLOverlay(i); // вшиває бутстрап і шле на вихід
}
function gddStop() {
  if (window.electronAPI && window.electronAPI.gddCommand) window.electronAPI.gddCommand(null, 'stop', {});
  notify('⏹ Графіку прибрано');
}
function gddResetFields(i) {
  const overlay = (typeof htmlOverlays !== 'undefined') ? htmlOverlays[i] : null;
  if (!overlay || typeof gddParams === 'undefined') return;
  gddParams[i] = gddDefaults(overlay.content);
  gddOpenPanel(i);
  gddLiveUpdate(i);
}



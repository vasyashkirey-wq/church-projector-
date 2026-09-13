// ============================================================
// ВКЛАДКА «📝 Управління текстом» (textcontrol) — окремі налаштування
// шрифту/розміру/позиції/вирівнювання/кольору/обведення/фону (колір,
// відео чи фото) для кожного з 4 виходів окремо (або одразу для всіх
// через «Всі»).
//
// Зібрано з ДВОХ файлів: більшість — з src/extras-1.js (сама вкладка +
// базові сеттери), а _applyToTextOutputs і все, що через неї йде
// (обведення/підкладка/безпечна зона/інтервали/швидкість переходу/фон-
// відео/фон-фото) — з src/extras-2.js. Об'єднано тут, бо це одна вкладка,
// а не через межу файлів, де вони історично жили.
//
// Продовження модуляризації (typo.js → animations.js/fonts.js →
// playlist.js/powerpoint.js → stage.js/statistics.js → hotkeys.js →
// media.js → src/main/osc.js → midi.js → ця). Мусить завантажуватись ДО
// extras-4.js — pv2Init() звертається до updateTextPreview одразу при
// старті застосунку (масив steps).
// ============================================================

function renderTextControlTab() {
const t = state.textSettings[state.currentTextOutput === 'all' ? 1 : state.currentTextOutput] || state.textSettings[1];
return `<div class=\"card\"><div class=\"card-title\">🔤 Шрифт</div><select id=\"textFont\" onchange=\"setTextFont(this.value)\" style=\"width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;outline:none\"></select><div class=\"card-sub\">Свої шрифти додаються у вкладці «Шрифти».</div></div> <div class="card"><div class="card-title">📝 Управління текстом</div> <div class="flex" style="margin-bottom:3px"><span style="font-size:11px;color:var(--text2)">Екран:</span><button class="btn btn-primary btn-sm" id="textOutput1" onclick="setTextOutput(1)" style="font-size:11px;padding:1px 5px;border:1px solid var(--accent)">1</button><button class="btn btn-ghost btn-sm" id="textOutput2" onclick="setTextOutput(2)" style="font-size:11px;padding:1px 5px">2</button><button class="btn btn-ghost btn-sm" id="textOutput3" onclick="setTextOutput(3)" style="font-size:11px;padding:1px 5px">3</button><button class="btn btn-ghost btn-sm" id="textOutput4" onclick="setTextOutput(4)" style="font-size:11px;padding:1px 5px">4</button><button class="btn btn-ghost btn-sm" id="textOutputAll" onclick="setTextOutput('all')" style="font-size:11px;padding:1px 5px">Всі</button></div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:3px"> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Розмір</div><div class="flex" style="justify-content:center"><button class="btn btn-ghost btn-sm" onclick="changeTextSize(-5)">−</button><span id="textSizeDisplay" style="font-size:12px;font-weight:700;min-width:24px;text-align:center;color:var(--accent)">58</span><button class="btn btn-ghost btn-sm" onclick="changeTextSize(5)">+</button></div><input type="range" id="textSizeSlider" min="12" max="150" value="58" style="width:100%;margin-top:1px" oninput="updateTextSize(this.value)"></div> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Позиція</div><div class="flex" style="justify-content:center;gap:1px"><button class="btn btn-ghost btn-sm" onclick="setTextPosition('top-left')" style="font-size:11px;padding:1px 2px">↖</button><button class="btn btn-ghost btn-sm" onclick="setTextPosition('center')" style="font-size:11px;padding:1px 2px;border:1px solid var(--accent)">●</button><button class="btn btn-ghost btn-sm" onclick="setTextPosition('bottom-center')" style="font-size:11px;padding:1px 2px">↓</button></div> <div style="font-size:11px;color:var(--text2)" id="textPositionLabel">Центр</div></div> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Вирівнювання</div><div class="flex" style="justify-content:center"><button class="btn btn-ghost btn-sm" onclick="setTextAlign('left')" style="font-size:11px;padding:1px 2px">⬅</button><button class="btn btn-primary btn-sm" onclick="setTextAlign('center')" style="font-size:11px;padding:1px 2px">↔</button><button class="btn btn-ghost btn-sm" onclick="setTextAlign('right')" style="font-size:11px;padding:1px 2px">➡</button></div> <div style="font-size:11px;color:var(--text2)" id="textAlignLabel">Центр</div></div></div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px;margin-bottom:3px"><div><input type="color" id="textColorPicker" value="#ffffff" style="width:100%;height:16px;border:none;border-radius:2px;cursor:pointer" oninput="updateTextColor(this.value)"></div><div><input type="color" id="textBgColorPicker" value="#000000" style="width:100%;height:16px;border:none;border-radius:2px;cursor:pointer" oninput="updateTextBgColor(this.value)"></div><div class="flex" style="justify-content:center"><button class="btn btn-ghost btn-sm" id="styleBold" onclick="toggleTextStyle('bold')" style="font-size:11px;padding:4px 7px;font-weight:700">B</button><button class="btn btn-ghost btn-sm" id="styleShadow" onclick="toggleTextStyle('shadow')" style="font-size:11px;padding:4px 7px">S</button></div><div><button class="btn btn-primary btn-sm" onclick="applyTextSettingsToOutput()" style="width:100%;font-size:11px;padding:4px 7px">✓</button></div></div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px"><div id="textPreviewBox" style="aspect-ratio:16/9;background:#000;border-radius:2px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);position:relative;overflow:hidden"><div id="textPreviewContent" style="text-align:center;padding:6px;color:#fff;font-family:Georgia,serif;font-size:14px;line-height:1.3;max-width:90%"><div id="textPreviewRef" style="color:#c8a84b;font-size:12px;margin-bottom:2px">Від Матвія 5:3</div><div id="textPreviewBody" style="font-size:14px">Блаженні вбогі духом...</div></div></div> <div><div style="font-size:11px;color:var(--text2);margin-bottom:2px">Статус виходів</div><div id="textStatus1" style="font-size:11px;color:var(--accent)">📺1: 58px</div><div id="textStatus2" style="font-size:11px;color:var(--green)">🎥2: 58px</div><div id="textStatus3" style="font-size:11px;color:var(--gold)">🖥3: 58px</div><div id="textStatus4" style="font-size:11px;color:var(--red)">🖥4: 58px</div></div></div></div>` +
`<div class="card"><div class="card-title">✨ Додатково</div>` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Обведення: <span id="textStrokeVal">${t.strokeWidth||0}</span>px</label>` +
`<input type="range" id="textStroke" min="0" max="6" value="${t.strokeWidth||0}" oninput="document.getElementById('textStrokeVal').textContent=this.value;setTextStroke(this.value)" style="width:100%;margin-bottom:6px">` +
`<div class="flex" style="margin-bottom:10px;gap:8px"><input type="color" id="textStrokeColor" value="${t.strokeColor||'#000000'}" oninput="setTextStrokeColor(this.value)" style="width:40px;height:32px;border:none;border-radius:6px;cursor:pointer;background:none"><span style="font-size:11px;color:var(--text2);align-self:center">Колір обведення</span></div>` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Підкладка: <span id="textScrimVal">${Math.round((t.scrim||0)*100)}</span>%</label>` +
`<input type="range" id="textScrim" min="0" max="90" value="${Math.round((t.scrim||0)*100)}" oninput="document.getElementById('textScrimVal').textContent=this.value;setTextScrim(this.value)" style="width:100%;margin-bottom:10px">` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Безпечна зона: <span id="textSafeAreaVal">${t.safeArea||0}</span>%</label>` +
`<input type="range" id="textSafeArea" min="0" max="10" value="${t.safeArea||0}" oninput="document.getElementById('textSafeAreaVal').textContent=this.value;setTextSafeArea(this.value)" style="width:100%;margin-bottom:10px">` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Міжлітерний: <span id="textLetterSpacingVal">${t.letterSpacing||0}</span>px</label>` +
`<input type="range" id="textLetterSpacing" min="0" max="10" value="${t.letterSpacing||0}" oninput="document.getElementById('textLetterSpacingVal').textContent=this.value;setTextLetterSpacing(this.value)" style="width:100%;margin-bottom:10px">` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Міжрядковий: <span id="textLineHeightVal">${(t.lineHeight||1.4).toFixed(2)}</span></label>` +
`<input type="range" id="textLineHeight" min="100" max="220" value="${Math.round((t.lineHeight||1.4)*100)}" oninput="document.getElementById('textLineHeightVal').textContent=(this.value/100).toFixed(2);setTextLineHeight(this.value)" style="width:100%;margin-bottom:10px">` +
`<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Швидкість переходу: <span id="textFadeMsVal">${t.fadeMs||600}</span> мс</label>` +
`<input type="range" id="textFadeMs" min="100" max="1500" step="50" value="${t.fadeMs||600}" oninput="document.getElementById('textFadeMsVal').textContent=this.value;setTextFadeMs(this.value)" style="width:100%">` +
`</div>` +
`<div class="card"><div class="card-title">🖼 Фон (замість суцільного кольору)</div>` +
`<div class="flex" style="gap:4px;margin-bottom:8px">` +
`<button class="btn ${(t.bgType||'color')==='color'?'btn-primary':'btn-ghost'} btn-sm" onclick="setTextBgType('color')">Колір</button>` +
`<button class="btn ${t.bgType==='video'?'btn-primary':'btn-ghost'} btn-sm" onclick="setTextBgType('video')">Відео</button>` +
`<button class="btn ${t.bgType==='image'?'btn-primary':'btn-ghost'} btn-sm" onclick="setTextBgType('image')">Фото</button>` +
`</div>` +
(t.bgType==='video' ? (
  `<input type="file" accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.wmv,.flv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.m2v,.vob,.divx,.asf,.mxf,.ogv" onchange="loadTextBgVideo(this)" style="font-size:11px;width:100%">` +
  (t.bgVideo ? `<div style="font-size:11px;color:var(--green);margin-top:4px">▶ ${esc(t.bgVideo.name||'')}</div><button class="btn btn-ghost btn-sm" style="margin-top:4px;color:var(--red)" onclick="clearTextBgVideo()">✕ Прибрати</button>` : '')
) : t.bgType==='image' ? (
  `<input type="file" accept="image/*" onchange="loadTextBgImage(this)" style="font-size:11px;width:100%">` +
  (t.bgImage ? `<div style="font-size:11px;color:var(--green);margin-top:4px">🖼 Фото завантажено</div><button class="btn btn-ghost btn-sm" style="margin-top:4px;color:var(--red)" onclick="clearTextBgImage()">✕ Прибрати</button>` : '')
) : `<div class="card-sub">Колір фону — той самий пікер, що вище, поруч із кольором тексту.</div>`) +
`</div>`;
}

function applyTextSettingsToOutput() {
  const target = state.currentTextOutput;
  const c = pv2GraphicsContent();
  if (target === 'all') {
    doSendHTML(buildTextHTML(state.textSettings[1], c), 'Текст (всі виходи)');
  } else {
    const hasChroma = !!(state.outputChroma && state.outputChroma[target] && state.outputChroma[target] !== 'none');
    sendHTMLToOutputN(target, buildTextHTML(state.textSettings[target] || state.textSettings[1], c, hasChroma), 'Текст');
  }
}

function changeTextSize(d) {
const s = state.currentTextOutput === 'all' ? state.textSettings[1] : state.textSettings[state.currentTextOutput] || state.textSettings[1];
const n = Math.max(12, Math.min(150, (s.size || 58) + d));
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].size = n;
} else {
state.textSettings[state.currentTextOutput].size = n;
}
const sizeDisplay = $('#textSizeDisplay');
const sizeSlider = $('#textSizeSlider');
if(sizeDisplay) sizeDisplay.textContent = n;
if(sizeSlider) sizeSlider.value = n;
updateTextStatus();
updateTextPreview();
}

function setTextAlign(a) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].align = a;
} else {
state.textSettings[state.currentTextOutput].align = a;
}
const label = $('#textAlignLabel');
if(label) label.textContent = a.toUpperCase();
updateTextPreview();
}

function setTextOutput(num) {
state.currentTextOutput = num;
$$('[id^="textOutput"]').forEach(el => {
el.className = 'btn btn-ghost btn-sm';
if(el.id === 'textOutput' + num) el.className = 'btn btn-primary btn-sm';
if(num === 'all' && el.id === 'textOutputAll') el.className = 'btn btn-primary btn-sm';
});
const s = num === 'all' ? state.textSettings[1] : state.textSettings[num] || state.textSettings[1];
if(s) {
const sizeDisplay = $('#textSizeDisplay');
const sizeSlider = $('#textSizeSlider');
const colorPicker = $('#textColorPicker');
const bgPicker = $('#textBgColorPicker');
if(sizeDisplay) sizeDisplay.textContent = s.size || 58;
if(sizeSlider) sizeSlider.value = s.size || 58;
if(colorPicker) colorPicker.value = s.color || '#ffffff';
if(bgPicker) bgPicker.value = s.bgColor || '#000000';
updateTextStatus();
updateTextPreview();
}
}

function setTextPosition(p) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].position = p;
} else {
state.textSettings[state.currentTextOutput].position = p;
}
const label = $('#textPositionLabel');
if(label) label.textContent = p.replace('-', ' ').toUpperCase();
updateTextPreview();
}

function toggleTextStyle(st) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].styles[st] = !state.textSettings[i].styles[st];
} else {
state.textSettings[state.currentTextOutput].styles[st] = !state.textSettings[state.currentTextOutput].styles[st];
}
const el = $('#style' + st.charAt(0).toUpperCase() + st.slice(1));
if(el) {
const is = state.currentTextOutput === 'all' ? state.textSettings[1].styles[st] : state.textSettings[state.currentTextOutput].styles[st];
el.className = 'btn btn-ghost btn-sm' + (is ? ' active' : '');
}
updateTextPreview();
}

function updateTextBgColor(c) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].bgColor = c;
} else {
state.textSettings[state.currentTextOutput].bgColor = c;
}
updateTextPreview();
}

function updateTextColor(c) {
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].color = c;
} else {
state.textSettings[state.currentTextOutput].color = c;
}
updateTextPreview();
}

function updateTextSize(v) {
const s = parseInt(v);
if(state.currentTextOutput === 'all') {
for(let i = 1; i <= 4; i++) state.textSettings[i].size = s;
} else {
state.textSettings[state.currentTextOutput].size = s;
}
const sizeDisplay = $('#textSizeDisplay');
if(sizeDisplay) sizeDisplay.textContent = s;
updateTextStatus();
updateTextPreview();
}

function updateTextPreview() {
const s = state.currentTextOutput === 'all' ? state.textSettings[1] : state.textSettings[state.currentTextOutput] || state.textSettings[1];
const ref = $('#textPreviewRef');
const body = $('#textPreviewBody');
const cont = $('#textPreviewContent');
if(ref) { ref.style.color = '#c8a84b'; ref.style.fontSize = Math.round((s.size || 58) * 0.6) + 'px'; }
if(body) {
body.style.color = s.color || '#ffffff';
body.style.fontSize = (s.size || 58) + 'px';
body.style.fontWeight = s.styles.bold ? '700' : 'normal';
body.style.textShadow = s.styles.shadow ? '0 2px 10px rgba(0,0,0,0.8)' : 'none';
body.textContent = 'Блаженні вбогі духом...';
}
if(cont) { cont.style.background = s.bgColor || '#000000'; cont.style.borderRadius = '4px'; cont.style.padding = '8px'; }
}

function setTextFont(f) {
  const t = state.currentTextOutput;
  if (t === 'all') { for (let i = 1; i <= 4; i++) state.textSettings[i].fontFamily = f; }
  else state.textSettings[t].fontFamily = f;
  updateTextPreview();
}

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

// Пілотне застосування реактивного шару (src/core/reactive.js):
// markDirty замість прямого renderTabInto. Різниця видима саме тут —
// loadTextBgImage/loadTextBgVideo викликають рендер із кількох гілок
// (успіх, помилка, скидання), а користувач часто змінює кілька
// налаштувань підряд; раніше це давало 3-4 повні перемальовки вкладки
// одна за одною, тепер — одну наприкінці тика.
function setTextBgType(type) { _applyToTextOutputs('bgType', type); markDirty('textcontrol'); }

function loadTextBgVideo(input) {
  const f = input.files[0];
  if (!f) return;
  if (f.path && typeof pathToFileUrl === 'function') {
    // непідтримувані формати (MOV/MKV…) спершу в MP4
    ensureSupportedMedia(f.path, function(cpath) {
      _applyToTextOutputs('bgVideo', { src: pathToFileUrl(cpath), name: f.name });
      markDirty('textcontrol');
    });
  } else {
    _applyToTextOutputs('bgVideo', { src: URL.createObjectURL(f), name: f.name });
    markDirty('textcontrol');
  }
}

function clearTextBgVideo() { _applyToTextOutputs('bgVideo', null); markDirty('textcontrol'); }

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
      markDirty('textcontrol');
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(f);
}

function clearTextBgImage() { _applyToTextOutputs('bgImage', null); markDirty('textcontrol'); }

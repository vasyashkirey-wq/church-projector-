// ============================================================
// ТЕМА ОФОРМЛЕННЯ ТА ВІДДАЛЕНЕ КЕРУВАННЯ
// Винесено з index.html для кращої організації коду.
// ============================================================

var theme = {
  bgColor: '#000000', bgType: 'color',
  bgGradient: 'linear-gradient(135deg, #0d0d2b, #2d1b69)',
  bgImage: null, textColor: '#ffffff', refColor: '#c8a84b',
  fontSize: 58, fontFamily: 'Georgia, serif',
  textAlign: 'center', textPosition: 'center',
  textShadow: true, padding: 80,
  strokeWidth: 0, strokeColor: '#000000',
  scrim: 0, safeArea: 0, letterSpacing: 0,
  lineHeight: 1.45, fadeMs: 600, uppercase: false
};

var THEME_PRESETS = {
  dark:     { bgType:'color', bgColor:'#000000', textColor:'#ffffff', refColor:'#c8a84b', fontFamily:'Georgia, serif' },
  blue:     { bgType:'gradient', bgGradient:'linear-gradient(135deg,#0a1628,#1e3a5f)', textColor:'#ffffff', refColor:'#c8a84b' },
  purple:   { bgType:'gradient', bgGradient:'linear-gradient(135deg,#1a0a2e,#3d1155)', textColor:'#ffffff', refColor:'#c8a84b' },
  green:    { bgType:'gradient', bgGradient:'linear-gradient(135deg,#0a2010,#1a4a25)', textColor:'#ffffff', refColor:'#3ecf8e' },
  warm:     { bgType:'gradient', bgGradient:'linear-gradient(135deg,#1a0a00,#3d2200)', textColor:'#f0c040', refColor:'#ffffff' },
  minimal:  { bgType:'color', bgColor:'#111111', textColor:'#ffffff', refColor:'#888888', fontFamily:'Arial, sans-serif', textShadow:false },
  worship:    { bgType:'gradient', bgGradient:'linear-gradient(135deg,#0a1030,#241a4d)', textColor:'#eef0ff', refColor:'#9db4ff', fontFamily:'Georgia, serif', textShadow:true },
  joy:        { bgType:'gradient', bgGradient:'linear-gradient(135deg,#2a1a00,#5a3600)', textColor:'#fff3d6', refColor:'#ffd166', fontFamily:'Georgia, serif', textShadow:true },
  repentance: { bgType:'color', bgColor:'#0a0a0a', textColor:'#e8e8e8', refColor:'#8a8a8a', fontFamily:'Georgia, serif', textShadow:true },
  festive:    { bgType:'gradient', bgGradient:'linear-gradient(135deg,#2a0808,#5a1212)', textColor:'#fff0e0', refColor:'#ffcf6a', fontFamily:'Georgia, serif', textShadow:true }
};

function applyPreset(name) {
  var preset = THEME_PRESETS[name];
  if (!preset) return;
  theme = Object.assign({}, theme, preset);
  syncThemeUI();
  updateThemePreview();
}

// Власні («кастомні») набори вигляду — на відміну від THEME_PRESETS вище
// (готові, вшиті в код, незмінні), ці зберігає й називає сам оператор —
// напр. «Різдво», «Молодіжне служіння» — і, на відміну від вибору готового
// пресету (лише оновлює редактор, чекає окремого «Застосувати»), застосування
// свого стилю ОДРАЗУ штовхає в ефір — це швидкий перемикач «на весь вигляд
// одразу», а не крок редагування.
var customLooks = (function() { try { return JSON.parse(localStorage.getItem('church_custom_looks')) || []; } catch (e) { return []; } })();
function saveCustomLooksToStorage() {
  try { localStorage.setItem('church_custom_looks', JSON.stringify(customLooks)); } catch (e) {}
}
function saveCurrentAsLook() {
  if (typeof pv2Prompt !== 'function') return;
  pv2Prompt('Назва власного стилю (напр. «Різдво», «Молодіжне служіння»):', '', function(name) {
    if (!name) return;
    var snapshot = Object.assign({}, theme);
    var existingIdx = customLooks.findIndex(function(l) { return l.name === name; });
    if (existingIdx > -1) customLooks[existingIdx] = { name: name, theme: snapshot };
    else customLooks.push({ name: name, theme: snapshot });
    saveCustomLooksToStorage();
    if (typeof renderCustomLooksList === 'function') renderCustomLooksList();
    if (typeof notify === 'function') notify('💾 Стиль «' + name + '» збережено');
  });
}
function applyCustomLook(i) {
  var look = customLooks[i];
  if (!look) return;
  theme = Object.assign({}, theme, look.theme);
  syncThemeUI();
  updateThemePreview();
  applyThemeToProjector();
  if (typeof notify === 'function') notify('🎨 Стиль «' + look.name + '» застосовано');
}
function deleteCustomLook(i) {
  var look = customLooks[i];
  if (!look) return;
  customLooks.splice(i, 1);
  saveCustomLooksToStorage();
  if (typeof renderCustomLooksList === 'function') renderCustomLooksList();
  if (typeof notify === 'function') notify('🗑 Стиль «' + look.name + '» видалено');
}
function renderCustomLooksList() {
  var box = document.getElementById('customLooksList');
  if (!box) return;
  if (!customLooks.length) { box.innerHTML = '<div style="font-size:11px;color:var(--text2)">Власних стилів ще немає</div>'; return; }
  box.innerHTML = customLooks.map(function(look, i) {
    return '<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--border)">' +
      '<span style="flex:1;font-size:12px">' + esc(look.name) + '</span>' +
      '<button class="btn btn-success btn-sm" onclick="applyCustomLook(' + i + ')">🎨 Застосувати</button>' +
      '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteCustomLook(' + i + ')">✕</button>' +
      '</div>';
  }).join('');
}

function setThemeColor(key, val) {
  if (!val || !/^#[0-9a-fA-F]{3,6}$/.test(val)) return;
  theme[key] = val;
  if (key === 'bgColor') {
    document.getElementById('themeBgColor').value = val;
    document.getElementById('hexBgColor').value = val;
  }
  if (key === 'textColor') {
    document.getElementById('themeTextColor').value = val;
    document.getElementById('hexTextColor').value = val;
  }
  if (key === 'refColor') {
    document.getElementById('themeRefColor').value = val;
    document.getElementById('hexRefColor').value = val;
  }
  updateThemePreview();
}

function setThemeVal(key, val) {
  theme[key] = val;
  updateThemePreview();
}

function setGradient(grad) {
  theme.bgGradient = grad;
  theme.bgType = 'gradient';
  document.getElementById('themeBgType').value = 'gradient';
  onBgTypeChange();
  updateThemePreview();
}

function loadThemeBgImage(input) {
  var file = input.files[0];
  if (!file) return;
  loadImageAsDataURL(file, function(dataUrl) {
    if (!theme || typeof theme !== 'object') theme = {};
    theme.bgImage = dataUrl;
    theme.bgType = 'image';
    updateThemePreview();
  });
}

function clearThemeBgImage() {
  theme.bgImage = null;
  document.getElementById('themeBgImageInput').value = '';
  updateThemePreview();
}

function onBgTypeChange() {
  var t = document.getElementById('themeBgType').value;
  document.getElementById('bgColorWrap').style.display = t === 'color' ? 'block' : 'none';
  document.getElementById('bgGradientWrap').style.display = t === 'gradient' ? 'block' : 'none';
  document.getElementById('bgImageWrap').style.display = t === 'image' ? 'block' : 'none';
}

function onThemeChange() {
  if (!theme || typeof theme !== 'object') theme = {};   // захист: theme завжди об'єкт
  if (!document.getElementById('themeBgType')) return;    // елементів ще немає — виходимо
  theme.bgType = document.getElementById('themeBgType').value;
  theme.bgColor = document.getElementById('themeBgColor').value;
  theme.textColor = document.getElementById('themeTextColor').value;
  theme.refColor = document.getElementById('themeRefColor').value;
  theme.fontSize = parseInt(document.getElementById('themeFontSize').value);
  theme.fontFamily = document.getElementById('themeFontFamily').value;
  theme.textShadow = document.getElementById('themeTextShadow').checked;
  theme.padding = parseInt(document.getElementById('themePadding').value);
  // Додаткові налаштування — раніше підтримувались кодом виводу, але ніде
  // не було полів, щоб їх змінити.
  if (document.getElementById('themeStroke')) {
    theme.strokeWidth = parseInt(document.getElementById('themeStroke').value) || 0;
    theme.strokeColor = document.getElementById('themeStrokeColor').value;
    theme.scrim = (parseInt(document.getElementById('themeScrim').value) || 0) / 100;
    theme.safeArea = parseInt(document.getElementById('themeSafeArea').value) || 0;
    theme.letterSpacing = parseInt(document.getElementById('themeLetterSpacing').value) || 0;
    theme.lineHeight = (parseInt(document.getElementById('themeLineHeight').value) || 145) / 100;
    theme.fadeMs = parseInt(document.getElementById('themeFadeMs').value) || 600;
    theme.uppercase = document.getElementById('themeUppercase').checked;
  }
  onBgTypeChange();
  updateThemePreview();
}

function syncThemeUI() {
  document.getElementById('themeBgType').value = theme.bgType || 'color';
  document.getElementById('themeBgColor').value = theme.bgColor || '#000000';
  document.getElementById('themeTextColor').value = theme.textColor || '#ffffff';
  document.getElementById('themeRefColor').value = theme.refColor || '#c8a84b';
  document.getElementById('themeFontSize').value = theme.fontSize || 58;
  document.getElementById('fontSizeVal').textContent = theme.fontSize || 58;
  document.getElementById('themeFontFamily').value = theme.fontFamily || 'Georgia, serif';
  document.getElementById('themeTextShadow').checked = theme.textShadow !== false;
  document.getElementById('themePadding').value = theme.padding || 80;
  document.getElementById('paddingVal').textContent = theme.padding || 80;
  if (document.getElementById('themeStroke')) {
    document.getElementById('themeStroke').value = theme.strokeWidth || 0;
    document.getElementById('themeStrokeVal').textContent = theme.strokeWidth || 0;
    document.getElementById('themeStrokeColor').value = theme.strokeColor || '#000000';
    document.getElementById('themeScrim').value = Math.round((theme.scrim || 0) * 100);
    document.getElementById('themeScrimVal').textContent = Math.round((theme.scrim || 0) * 100);
    document.getElementById('themeSafeArea').value = theme.safeArea || 0;
    document.getElementById('themeSafeAreaVal').textContent = theme.safeArea || 0;
    document.getElementById('themeLetterSpacing').value = theme.letterSpacing || 0;
    document.getElementById('themeLetterSpacingVal').textContent = theme.letterSpacing || 0;
    document.getElementById('themeLineHeight').value = Math.round((theme.lineHeight || 1.45) * 100);
    document.getElementById('themeLineHeightVal').textContent = (theme.lineHeight || 1.45).toFixed(2);
    document.getElementById('themeFadeMs').value = theme.fadeMs || 600;
    document.getElementById('themeFadeMsVal').textContent = theme.fadeMs || 600;
    document.getElementById('themeUppercase').checked = !!theme.uppercase;
  }
  var _lc = document.getElementById('themeLiveChk');
  if (_lc) _lc.checked = themeLive;
  onBgTypeChange();
}

function updateThemePreview() {
  var preview = document.getElementById('themePreview');
  var previewText = document.getElementById('themePreviewText');
  var previewRef = document.getElementById('themePreviewRef');

  if (theme.bgType === 'gradient') {
    preview.style.background = theme.bgGradient;
  } else if (theme.bgType === 'image' && theme.bgImage) {
    preview.style.background = 'url(' + theme.bgImage + ') center/cover';
  } else {
    preview.style.background = theme.bgColor;
  }

  previewText.style.color = theme.textColor;
  previewText.style.fontSize = Math.round(theme.fontSize * 0.3) + 'px';
  previewText.style.fontFamily = theme.fontFamily;
  previewText.style.textAlign = theme.textAlign;
  previewText.style.textShadow = theme.textShadow ? '0 1px 4px rgba(0,0,0,.9)' : 'none';
  previewRef.style.color = theme.refColor;

  if (theme.textPosition === 'top') {
    preview.style.alignItems = 'flex-start';
    previewText.style.paddingTop = '10px';
  } else if (theme.textPosition === 'bottom') {
    preview.style.alignItems = 'flex-end';
    previewText.style.paddingBottom = '10px';
  } else {
    preview.style.alignItems = 'center';
    previewText.style.paddingTop = '';
    previewText.style.paddingBottom = '';
  }
  themeLivePush();   // якщо ввімкнено live — одразу на проектор
}

var themeLive = false;
(function(){ try { themeLive = localStorage.getItem('church_theme_live') === '1'; } catch (e) {} })();
var _themeLiveTimer = null;
// Живе застосування теми: якщо ввімкнено — шле тему на проектор із невеликою
// затримкою (щоб перетягування повзунка не спамило IPC).
function themeLivePush() {
  if (!themeLive || !window.electronAPI) return;
  clearTimeout(_themeLiveTimer);
  _themeLiveTimer = setTimeout(function(){ window.electronAPI.setTheme(theme); }, 120);
}
function toggleThemeLive(on) {
  themeLive = !!on;
  try { localStorage.setItem('church_theme_live', themeLive ? '1' : '0'); } catch (e) {}
  if (themeLive) applyThemeToProjector();   // застосувати поточну тему одразу
}

function applyThemeToProjector() {
  if (window.electronAPI) {
    window.electronAPI.setTheme(theme);
    document.getElementById('onAirLabel').textContent = '✓ Тему застосовано';
    setTimeout(function() { document.getElementById('onAirLabel').textContent = ''; }, 2000);
  }
}

// ============================================================
// REMOTE CONTROL
// ============================================================
var remoteRunning = false;

function startRemoteServer() {
  if (!window.electronAPI) return;
  var pin = (document.getElementById('remotePin') || {}).value || '';
  window.electronAPI.startRemote(pin, state.remoteUsers || []).then(function(result) {
    remoteRunning = true;
    var url = 'http://' + result.ip + ':' + result.port;
    document.getElementById('remoteStartBtn').style.display = 'none';
    document.getElementById('remoteStopBtn').style.display = 'block';
    document.getElementById('remoteInfoCard').style.display = 'block';
    document.getElementById('remoteURL').textContent = url;
    // Generate QR for remote URL
    generateRemoteQR(url);
  });
}

function stopRemoteServer() {
  if (!window.electronAPI) return;
  window.electronAPI.stopRemote().then(function() {
    remoteRunning = false;
    document.getElementById('remoteStartBtn').style.display = 'block';
    document.getElementById('remoteStopBtn').style.display = 'none';
    document.getElementById('remoteInfoCard').style.display = 'none';
  });
}

function generateRemoteQR(url) {
  var container = document.getElementById('remoteQR');
  container.innerHTML = '';
  loadQRLib(function() {
    new QRCode(container, {
      text: url, width: 160, height: 160,
      colorDark: '#000000', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  });
}

// Handle remote commands from phone
safeInit(function() {
if (window.electronAPI) {
  window.electronAPI.onRemoteCommand(function(cmd) {
    // extras.js реєструє СВІЙ обробник тих самих команд пульта (initRemoteListener) —
    // і він враховує план служби, живу Біблію, розділені пісні тощо, а цей —
    // ні. Обидва спрацьовували б на кожну команду, і цей міг би надіслати
    // пісню замість вірша, перекриваючи те, що щойно правильно надіслав інший.
    // Дії, які extras.js уже обробляє повністю, тут пропускаємо.
    var extrasHandlesRemote = (typeof state !== 'undefined' && state && typeof state.liveMode !== 'undefined');
    var overlapping = ['next-verse', 'prev-verse', 'clear', 'select-verse'];
    if (extrasHandlesRemote && overlapping.indexOf(cmd.action) >= 0) return;

    // Далі — запасний варіант (той самий порядок дій, що й раніше),
    // на випадок якщо extras.js не завантажився. PDF в ефірі перевіряємо
    // першим — так само, як у основному обробнику (extras-3.js), інакше
    // ця запасна гілка так само надішле пісню/вірш поверх PDF.
    if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf' && cmd.action === 'next-verse' && typeof nextSlide === 'function') { nextSlide(); }
    else if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf' && cmd.action === 'prev-verse' && typeof prevSlide === 'function') { prevSlide(); }
    else if (cmd.action === 'next-verse') { nextVerse(); if (selectedSong) sendToProjector(); }
    else if (cmd.action === 'prev-verse') { prevVerse(); if (selectedSong) sendToProjector(); }
    else if (cmd.action === 'next-bible') nextBibleVerse();
    else if (cmd.action === 'prev-bible') prevBibleVerse();
    else if (cmd.action === 'clear') clearProjector();
    else if (cmd.action === 'open-projector') toggleProjector();
    else if (cmd.action === 'select-verse' && cmd.idx !== undefined) {
      selectVerse(cmd.idx);
      sendToProjector();
    }
    // ── Розширення пульта ──────────────────────────────────────────
    // Ці дії вже підтримував HTTP-API, але на телефоні кнопок не було.
    // Найважливіша — blackout: аварійне гасіння екрана має бути під
    // рукою в того, хто стоїть у залі, а не лише за ноутбуком.
    // Усі виклики через typeof: пульт не має падати, якщо якоїсь
    // функції немає (напр. вкладку ще не відкривали).
    else if (cmd.action === 'blackout') { if (typeof toggleBlackout === 'function') toggleBlackout(); }
    else if (cmd.action === 'freeze') { if (typeof toggleFreeze === 'function') toggleFreeze(); }
    else if (cmd.action === 'logo') { if (typeof emergencyShowLogoAll === 'function') emergencyShowLogoAll(); }
    else if (cmd.action === 'restore') { if (typeof emergencyRestoreAll === 'function') emergencyRestoreAll(); }
    // План служби — щоб вести службу з телефона, не лише гортати вірші
    else if (cmd.action === 'plan-next') { if (typeof svcNext === 'function') svcNext(); }
    else if (cmd.action === 'plan-prev') { if (typeof svcPrev === 'function') svcPrev(); }
    else if (cmd.action === 'plan-item' && cmd.idx !== undefined) { if (typeof svcGoTo === 'function') svcGoTo(parseInt(cmd.idx, 10)); }
    // Таймер проповіді
    else if (cmd.action === 'timer-start') { if (typeof timerStart === 'function') timerStart(); }
    else if (cmd.action === 'timer-stop') { if (typeof timerStop === 'function') timerStop(); }
    else if (cmd.action === 'timer-reset') { if (typeof timerReset === 'function') timerReset(); }
    // Прибрати з конкретного виходу (1..4) — коли треба зняти графіку
    // лише з трансляції, а на проекторі лишити
    else if (cmd.action === 'clear-output' && cmd.n !== undefined) {
      var _n = parseInt(cmd.n, 10);
      if (_n >= 1 && _n <= 4 && typeof pv2ClearOutput === 'function') pv2ClearOutput(_n);
    }
  });

  // Load saved theme
  window.electronAPI.getTheme().then(function(t) {
    if (t && typeof t === 'object') { theme = Object.assign({}, theme, t); syncThemeUI(); updateThemePreview(); }
  });
}
}, 'onRemoteCommand/getTheme');

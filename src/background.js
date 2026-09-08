// ============================================================
// ФОНИ (BACKGROUND LIBRARY)
// Винесено з index.html для кращої організації коду.
// ============================================================

var BG_KEY = 'church_backgrounds';
var activeBg = { dataUrl: null, dim: 0.5, blur: 0, animated: false };
var userBgs = [];

var BUILTIN_BGS = [
  { id:'none', label:'Без фону', gradient:'none' },
  { id:'b1', label:'Зоряне небо', gradient:'radial-gradient(ellipse at 20% 50%,#1a1a4e 0%,#0d0d1a 60%,#000 100%)' },
  { id:'b2', label:'Захід сонця', gradient:'linear-gradient(180deg,#1a0533 0%,#6b1a3a 40%,#c45c2a 70%,#e8921a 100%)' },
  { id:'b3', label:'Ліс', gradient:'linear-gradient(180deg,#0a1a0a 0%,#0d3010 40%,#1a5520 80%,#0a2a0a 100%)' },
  { id:'b4', label:'Океан', gradient:'linear-gradient(180deg,#001428 0%,#002855 30%,#004080 60%,#002040 100%)' },
  { id:'b5', label:'Гори', gradient:'linear-gradient(180deg,#1a1a2e 0%,#16213e 30%,#0f3460 60%,#533483 100%)' },
  { id:'b6', label:'Золото', gradient:'linear-gradient(135deg,#1a0e00 0%,#3d2200 40%,#6b3d00 70%,#1a0e00 100%)' }
];

function loadUserBgs() {
  try { userBgs = JSON.parse(bigStoreGet(BG_KEY) || '[]'); } catch(e) { userBgs = []; }
}

function saveUserBgs() {
  safeSet(BG_KEY, JSON.stringify(userBgs));
}

function uploadBgImages(input) {
  var files = Array.from(input.files);
  if (!files.length) return;
  var loaded = 0;
  files.forEach(function(file) {
    loadImageAsDataURL(file, function(dataUrl) {
      userBgs.push({ id: 'u' + Date.now() + Math.random(), label: file.name.replace(/\.[^.]+$/, ''), dataUrl: dataUrl });
      loaded++;
      if (loaded === files.length) { saveUserBgs(); renderUserBgGrid(); }
    });
  });
  input.value = '';
}

// Пакетування (rafDebounce — наявний ідіом проєкту, як updateLivePanels):
// ця функція викликалась із багатьох місць підряд, і кожен виклик повністю
// перебудовував список. Тепер підряд ідучі виклики склеюються в один
// перемальовок на кадр.
// Обгортка — саме function-декларація з ЛІНИВОЮ ініціалізацією, а не
// `const renderBuiltinBgGrid = rafDebounce(...)`: const створив би temporal dead zone,
// і будь-який виклик до цього рядка впав би з «Cannot access before
// initialization» — рівно той баг, що вже двічі ловився в цьому проєкті
// (loadDisplayToggles). Function-декларація піднімається (hoisting), тож
// порядок завантаження файлів більше не має значення.
var _renderBuiltinBgGridDeb = null;
function renderBuiltinBgGrid() {
  if (!_renderBuiltinBgGridDeb) _renderBuiltinBgGridDeb = rafDebounce(_renderBuiltinBgGridNow);
  return _renderBuiltinBgGridDeb.apply(null, arguments);
}
function _renderBuiltinBgGridNow() {
  var grid = document.getElementById('builtinBgGrid');
  grid.innerHTML = '';
  BUILTIN_BGS.forEach(function(bg) {
    var div = document.createElement('div');
    if (bg.id === 'none') {
      div.className = 'bg-none' + (activeBg.dataUrl === null ? ' active' : '');
      div.innerHTML = '✕ Без фону';
      div.onclick = function() { clearActiveBg(); };
    } else {
      div.className = 'bg-thumb';
      div.style.background = bg.gradient;
      div.innerHTML = '<div class="bg-label">' + bg.label + '</div>';
      div.onclick = function() { selectBuiltinBg(bg); };
    }
    grid.appendChild(div);
  });
}

// Пакетування (rafDebounce — наявний ідіом проєкту, як updateLivePanels):
// ця функція викликалась із багатьох місць підряд, і кожен виклик повністю
// перебудовував список. Тепер підряд ідучі виклики склеюються в один
// перемальовок на кадр.
// Обгортка — саме function-декларація з ЛІНИВОЮ ініціалізацією, а не
// `const renderUserBgGrid = rafDebounce(...)`: const створив би temporal dead zone,
// і будь-який виклик до цього рядка впав би з «Cannot access before
// initialization» — рівно той баг, що вже двічі ловився в цьому проєкті
// (loadDisplayToggles). Function-декларація піднімається (hoisting), тож
// порядок завантаження файлів більше не має значення.
var _renderUserBgGridDeb = null;
function renderUserBgGrid() {
  if (!_renderUserBgGridDeb) _renderUserBgGridDeb = rafDebounce(_renderUserBgGridNow);
  return _renderUserBgGridDeb.apply(null, arguments);
}
function _renderUserBgGridNow() {
  var grid = document.getElementById('userBgGrid');
  if (!userBgs || !userBgs.length) { grid.innerHTML = '<p class="text-muted">Завантажте фото зверху</p>'; return; }
  grid.innerHTML = '';
  userBgs.forEach(function(bg) {
    var div = document.createElement('div');
    div.className = 'bg-thumb' + (activeBg.dataUrl === bg.dataUrl ? ' active' : '');
    div.innerHTML = '<img src="' + bg.dataUrl + '" alt="' + bg.label + '">' +
      '<div class="bg-label">' + bg.label + '</div>' +
      '<button class="bg-del" onclick="event.stopPropagation();deleteUserBg(\'' + bg.id + '\')">✕</button>';
    div.onclick = function() { selectUserBg(bg); };
    grid.appendChild(div);
  });
}

function selectBuiltinBg(bg) {
  activeBg.dataUrl = null;
  activeBg.gradient = bg.gradient;
  activeBg.type = 'gradient';
  updateBgPreview();
  applyBgToProjector();
  renderBuiltinBgGrid();
  renderUserBgGrid();
}

function selectUserBg(bg) {
  activeBg.dataUrl = bg.dataUrl;
  activeBg.type = 'image';
  activeBg.gradient = null;
  updateBgPreview();
  applyBgToProjector();
  renderBuiltinBgGrid();
  renderUserBgGrid();
}

function deleteUserBg(id) {
  userBgs = userBgs.filter(function(b){ return b.id !== id; });
  saveUserBgs();
  renderUserBgGrid();
}

function clearActiveBg() {
  activeBg = { dataUrl: null, gradient: null, type: 'none', dim: activeBg.dim, blur: activeBg.blur };
  updateBgPreview();
  applyBgToProjector();
  renderBuiltinBgGrid();
  renderUserBgGrid();
}

function onBgDimChange() {
  var val = document.getElementById('bgDimSlider').value;
  document.getElementById('bgDimVal').textContent = val;
  activeBg.dim = val / 100;
  updateBgPreview();
  applyBgToProjector();
}

function onBgBlurChange() {
  var val = document.getElementById('bgBlurSlider').value;
  document.getElementById('bgBlurVal').textContent = val;
  activeBg.blur = parseInt(val);
  updateBgPreview();
  applyBgToProjector();
}
function onBgAnimatedChange() {
  activeBg.animated = !!document.getElementById('bgAnimatedToggle').checked;
  applyBgToProjector();
}

function updateBgPreview() {
  var imgDiv = document.getElementById('bgPreviewImg');
  var dimDiv = document.getElementById('bgPreviewDim');
  var box = document.getElementById('bgPreviewBox');
  if (activeBg.type === 'image' && activeBg.dataUrl) {
    imgDiv.style.backgroundImage = 'url(' + activeBg.dataUrl + ')';
    imgDiv.style.backgroundSize = 'cover';
    imgDiv.style.backgroundPosition = 'center';
    imgDiv.style.filter = activeBg.blur ? 'blur(' + activeBg.blur + 'px)' : '';
    box.style.background = '';
  } else if (activeBg.type === 'gradient' && activeBg.gradient) {
    imgDiv.style.backgroundImage = '';
    imgDiv.style.filter = '';
    box.style.background = activeBg.gradient;
  } else {
    imgDiv.style.backgroundImage = '';
    imgDiv.style.filter = '';
    box.style.background = '#000';
  }
  dimDiv.style.background = 'rgba(0,0,0,' + (activeBg.dim || 0) + ')';
}

function getBgCSS() {
  if (activeBg.type === 'image' && activeBg.dataUrl) {
    return 'background:url(\'' + activeBg.dataUrl + '\') center/cover no-repeat;';
  } else if (activeBg.type === 'gradient' && activeBg.gradient) {
    return 'background:' + activeBg.gradient + ';';
  }
  return 'background:#000;';
}

function applyBgToProjector() {
  if (window.electronAPI) {
    window.electronAPI.setTheme({
      bgType: activeBg.type || 'color',
      bgImage: activeBg.type === 'image' ? activeBg.dataUrl : null,
      bgGradient: activeBg.type === 'gradient' ? activeBg.gradient : null,
      bgColor: '#000000',
      bgDim: activeBg.dim || 0,
      bgBlur: activeBg.blur || 0,
      bgAnimated: !!activeBg.animated
    });
  }
}

function initBgLibrary() {
  loadUserBgs();
  renderBuiltinBgGrid();
  renderUserBgGrid();
}

// Override sendToProjectorWin to include background
var _origDoSend = doSend;
doSend = function(text, ref) {
  var applyTo = document.getElementById('bgApplyTo') ? document.getElementById('bgApplyTo').value : 'all';
  // Тип поточного контенту: вірш Біблії чи інше (пісня/текст).
  // Раніше умова була (all || songs) БЕЗ огляду на тип — тож вірш Біблії
  // теж отримував «пісенний» фон, а «Тільки Біблії» не працювало зовсім,
  // і фон із «Фони» перекривав чорний фон із «Теми».
  var contentKind = (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'bible') ? 'bible' : 'songs';
  var bgApplies = activeBg.type && activeBg.type !== 'none' && (applyTo === 'all' || applyTo === contentKind);
  if (bgApplies) {
    var bgHtml = getTextWithBgHTML(text, ref);
    if (window.electronAPI) {
      // Канал доставки (file:// чи app://) обирає overlayPath() за
      // перемикачем у налаштуваннях — див. коментар біля overlayPath
      // в extras-1.js. Раніше тут був прямий виклик writeHtmlOverlay,
      // через що фони лишились би на старому каналі при перемиканні.
      overlayPath(bgHtml).then(function(filePath) {
        window.electronAPI.sendToProjector('html', { filePath: filePath });
        updateLivePreview(bgHtml);
      });
      onAirText = text;
      document.getElementById('sendPreview').innerHTML = '<b>На екрані:</b> ' + escHtml(text).replace(/\n/g,' / ');
      document.getElementById('onAirLabel').textContent = '● НА ЕКРАНІ';
      document.getElementById('onAirLabel').style.color = '#3ecf8e';
      return;
    }
  }
  _origDoSend(text, ref);
};

function getTextWithBgHTML(text, ref) {
  var bgCss = getBgCSS();
  var blurStyle = activeBg.blur ? 'filter:blur('+activeBg.blur+'px);' : '';
  var dim = activeBg.dim || 0;
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{margin:0;height:100vh;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;}' +
    '.bg{position:absolute;inset:0;'+bgCss+blurStyle+'}' +
    '.dim{position:absolute;inset:0;background:rgba(0,0,0,'+dim+')}' +
    '.wrap{position:relative;z-index:1;text-align:center;padding:80px 100px;width:100%;opacity:0;transition:opacity .6s;}' +
    '.wrap.show{opacity:1;}' +
    '.ref{color:'+( theme.refColor||'#c8a84b')+';font-size:24px;font-family:Georgia,serif;margin-bottom:18px;letter-spacing:1px;}' +
    '.txt{color:'+(theme.textColor||'#fff')+';font-size:'+(theme.fontSize||58)+'px;line-height:1.45;font-family:'+(theme.fontFamily||'Georgia,serif')+';text-shadow:0 2px 16px rgba(0,0,0,.9);}' +
    '</style></head><body>' +
    '<div class="bg"></div><div class="dim"></div>' +
    '<div class="wrap" id="w"><div class="ref">'+escHtml(ref||'')+'</div><div class="txt">'+text.replace(/\n/g,'<br>')+'</div></div>' +
    '<script>setTimeout(function(){document.getElementById("w").classList.add("show");},100);<\/script>' +
    '</body></html>';
}

safeInit(initBgLibrary, 'initBgLibrary');

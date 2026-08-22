const { ipcRenderer } = require('electron');

// Посилання (ref) ніде вище по ланцюгу не екранується — тут це остання точка
// перед innerHTML, тож екрануємо саме тут, щоб назва пісні/вірша з "<"/">"
// (наприклад, з імпортованого файлу) не виконалась як HTML у зала.
function escRef(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let currentTheme = {
  bgColor: '#000000',
  bgType: 'color',
  bgGradient: null,
  bgImage: null,
  bgDim: 0,
  bgBlur: 0,
  textColor: '#ffffff',
  refColor: '#c8a84b',
  fontSize: 58,
  fontFamily: 'Georgia, serif',
  textAlign: 'center',
  textPosition: 'center',
  textShadow: true,
  padding: 80
};

// Кастомний колір фону цього виходу (задається кодом із панелі). null = фон теми
let customBg = null;

function applyTheme(theme) {
  currentTheme = { ...currentTheme, ...theme };
  const body = document.body;
  const tw = document.getElementById('text-wrap');
  const textBody = document.getElementById('text-body');
  const textRef = document.getElementById('text-ref');

  let bgEl = document.getElementById('proj-bg');
  let dimEl = document.getElementById('proj-dim');

  if (!bgEl) {
    bgEl = document.createElement('div');
    bgEl.id = 'proj-bg';
    bgEl.style.cssText = 'position:fixed;inset:0;z-index:0;background-size:cover;background-position:center;transition:background .5s;';
    document.body.insertBefore(bgEl, document.body.firstChild);
  }
  if (!dimEl) {
    dimEl = document.createElement('div');
    dimEl.id = 'proj-dim';
    dimEl.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;transition:background .3s;';
    document.body.insertBefore(dimEl, document.body.children[1] || null);
  }

  const content = document.getElementById('content');
  if (content) content.style.position = 'relative';
  if (content) content.style.zIndex = '3';

  if (currentTheme.bgType === 'image' && currentTheme.bgImage) {
    bgEl.style.background = `url('${currentTheme.bgImage}') center/cover no-repeat`;
    bgEl.style.filter = currentTheme.bgBlur ? `blur(${currentTheme.bgBlur}px)` : '';
    body.style.background = '#000';
  } else if (currentTheme.bgType === 'gradient' && currentTheme.bgGradient) {
    bgEl.style.background = currentTheme.bgGradient;
    bgEl.style.filter = '';
    body.style.background = '#000';
  } else {
    bgEl.style.background = customBg || currentTheme.bgColor || '#000000';
    bgEl.style.filter = '';
    body.style.background = '#000';
  }

  const dim = parseFloat(currentTheme.bgDim) || 0;
  dimEl.style.background = dim > 0 ? `rgba(0,0,0,${dim})` : 'none';

  // ---- Типографіка: читабельність у великому залі ----
  const tp = currentTheme;
  if (textBody) {
    textBody.style.color = tp.textColor || '#ffffff';
    textBody.style.lineHeight = tp.lineHeight || 1.45;
    textBody.style.letterSpacing = (tp.letterSpacing || 0) + 'px';
    textBody.style.textTransform = tp.uppercase ? 'uppercase' : 'none';
    // Балансуємо рядки — щоб останній рядок не лишався з одного слова
    textBody.style.textWrap = 'balance';
    textBody.style.hyphens = 'none';
    textBody.style.overflowWrap = 'break-word';

    // Обведення: над відео-фоном тіні не вистачає — контур робить текст читабельним завжди
    // На виході з увімкненим хромакеєм (трансляція) чистий білий текст без нічого
    // виглядає плоским на живій камері — тож там застосовуємо розумний мінімум
    // контрасту автоматично, якщо оператор сам нічого не налаштував. На проекторі
    // (без хромакею) нічого не змінюється — там усе як і було.
    const onChroma = !!(chromaColor && chromaColor !== 'none');
    const sw = onChroma ? Math.max(tp.strokeWidth || 0, 2) : (tp.strokeWidth || 0);
    textBody.style.webkitTextStroke = sw ? (sw + 'px ' + (tp.strokeColor || '#000')) : '';
    textBody.style.paintOrder = 'stroke fill';
    textBody.style.fontSize = (currentTheme.fontSize || 58) + 'px';
    textBody.style.fontFamily = tp.fontFamily || 'Georgia, serif';

    // Підкладка під текстом: рятує на строкатому відео-фоні
    const wrap = document.getElementById('text-wrap');
    if (wrap) {
      const sc = onChroma ? Math.max(tp.scrim || 0, 0.25) : (tp.scrim || 0);   // 0..1
      wrap.style.background = sc > 0 ? `rgba(0,0,0,${sc})` : 'transparent';
      wrap.style.backdropFilter = (sc > 0 && tp.scrimBlur) ? `blur(${tp.scrimBlur}px)` : '';
      wrap.style.borderRadius = sc > 0 ? '18px' : '0';
      // Безпечна зона: старі телевізори й проектори зрізають краї
      const safe = tp.safeArea || 0;
      wrap.style.margin = safe + '%';
      wrap.style.width = 'auto';
      wrap.style.transition = 'opacity ' + ((tp.fadeMs || 600) / 1000) + 's ease';
    }
    // Тема щойно скинула розмір шрифту на базовий — перераховуємо вміщення,
    // інакше довгий текст, який уже вмістили, знову вилізе за екран.
    setTimeout(fitTextToScreen, 0);
    textBody.style.textAlign = currentTheme.textAlign || 'center';
    textBody.style.textShadow = currentTheme.textShadow !== false
      ? '0 2px 16px rgba(0,0,0,.9), 0 0 40px rgba(255,255,255,.1)'
      : 'none';
  }
  if (textRef) {
    textRef.style.color = currentTheme.refColor || '#c8a84b';
    textRef.style.textAlign = currentTheme.textAlign || 'center';
  }
  if (tw) {
    tw.style.padding = (currentTheme.padding || 80) + 'px';
    const contentEl = document.getElementById('content');
    if (contentEl) {
      if (currentTheme.textPosition === 'top') {
        contentEl.style.alignItems = 'flex-start';
        tw.style.paddingTop = ((currentTheme.padding || 80) + 40) + 'px';
      } else if (currentTheme.textPosition === 'bottom') {
        contentEl.style.alignItems = 'flex-end';
        tw.style.paddingBottom = ((currentTheme.padding || 80) + 40) + 'px';
      } else {
        contentEl.style.alignItems = 'center';
        tw.style.paddingTop = '';
        tw.style.paddingBottom = '';
      }
    }
  }
}


// ============================================================
// АВТО-ВМІЩЕННЯ ТЕКСТУ
// Довгий куплет або довгий вірш (напр. Пс 118) вилазив за межі екрана
// і оператор помічав це вже в залі. Тепер шрифт сам зменшується,
// доки текст не вміститься — але не нижче розумної межі.
// ============================================================
let autoFitEnabled = true;

function fitTextToScreen() {
  if (!autoFitEnabled) return;
  const wrap = document.getElementById('text-wrap');
  const body = document.getElementById('text-body');
  const refEl = document.getElementById('text-ref');
  if (!wrap || !body) return;

  const baseSize = (currentTheme && currentTheme.fontSize) || 58;
  const minSize = Math.max(20, Math.round(baseSize * 0.4)); // не дрібніше 40% від заданого
  const pad = (currentTheme && currentTheme.padding) || 80;
  // applyTheme() додає +40px до top/bottom padding при позиції "зверху"/"знизу" —
  // враховуємо це тут, інакше вважали б, що влазить, а насправді текст зрізало б.
  const posExtra = (currentTheme && (currentTheme.textPosition === 'top' || currentTheme.textPosition === 'bottom')) ? 40 : 0;
  // applyTheme() також ставить wrap.style.margin = safeArea% — за специфікацією CSS
  // відсоткові margin (з усіх чотирьох боків, включно з top/bottom) рахуються від
  // ШИРИНИ контейнера. Раніше це не враховувалось і безпечна зона "з'їдала" простір,
  // який fitTextToScreen вважав доступним.
  const safePct = (currentTheme && currentTheme.safeArea) || 0;
  const safePx = window.innerWidth * (safePct / 100);

  // Доступна висота: екран мінус відступи, додатковий відступ позиції, безпечна зона і рядок посилання
  const avail = window.innerHeight - pad * 2 - posExtra - safePx * 2 - (refEl ? refEl.offsetHeight + 20 : 0);
  const availW = window.innerWidth - pad * 2 - safePx * 2;

  let size = baseSize;
  body.style.fontSize = size + 'px';

  // Зменшуємо, доки не влізе (крок 2px — швидко і без мерехтіння)
  let guard = 0;
  while ((body.scrollHeight > avail || body.scrollWidth > availW) && size > minSize && guard < 60) {
    size -= 2;
    body.style.fontSize = size + 'px';
    guard++;
  }

  // Якщо навіть на мінімумі не влазить — вмикаємо прокрутку-обрізання з підказкою в консоль
  if (body.scrollHeight > avail) {
    console.warn('Текст не вміщається навіть на мінімальному розмірі — варто розбити на два слайди');
  }
  lastFitSize = size;
}
let lastFitSize = null;

// Перераховуємо при зміні розміру вікна (перетягнули на інший монітор)
window.addEventListener('resize', () => { setTimeout(fitTextToScreen, 50); });

ipcRenderer.on('set-autofit', (event, on) => {
  autoFitEnabled = !!on;
  if (!on) lockedSize = null;
  fitTextToScreen();
});

// Плавно гасить шар графіки (#frame-wrap), тоді ховає його. Захищено від
// гонок: якщо почався новий showHTML, його clearTimeout(fw._hideT) скасує це.
function fadeOutFrame() {
  const fw = document.getElementById('frame-wrap');
  if (!fw) return;
  if (fw.style.display === 'none') return;
  const fade = Math.min((currentTheme.fadeMs || 600), 500);
  fw.style.transition = 'opacity ' + (fade / 1000) + 's ease';
  fw.style.opacity = '0';
  clearTimeout(fw._hideT);
  fw._hideT = setTimeout(() => {
    fw.style.display = 'none';
    const frame = document.getElementById('frame');
    if (frame) frame.src = 'about:blank';
  }, fade);
}

// Гарантує читабельність тексту на виході з ХРОМАКЕЄМ (трансляція): примусово
// білий + чорна обводка + жорстка тінь + темна підкладка — незалежно від того,
// коли застосувалася тема. На звичайному виході (без хромакею) не втручається.
function reassertContrast() {
  const onChroma = !!(chromaColor && chromaColor !== 'none');
  if (!onChroma) return;
  const tp = currentTheme || {};
  const body = document.getElementById('text-body');
  const wrap = document.getElementById('text-wrap');
  if (body) {
    body.style.color = '#ffffff';                         // на хромакеї — завжди чистий білий
    const sw = Math.max(tp.strokeWidth || 0, 3);
    body.style.webkitTextStroke = sw + 'px ' + (tp.strokeColor || '#000');
    body.style.paintOrder = 'stroke fill';
    // жорсткий чорний контур тінню — на випадок, якщо обводка рендериться слабко
    body.style.textShadow = '0 0 4px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 3px 12px rgba(0,0,0,.95)';
  }
  if (wrap) {
    const sc = Math.max(tp.scrim || 0, 0.35);
    wrap.style.background = 'rgba(0,0,0,' + sc + ')';
    wrap.style.borderRadius = '18px';
  }
}

function showText(html, ref) {
  fadeOutFrame();                     // плавно гасимо графіку, якщо була

  const tw = document.getElementById('text-wrap');
  if (!tw) return;
  clearTimeout(tw._hideT);
  tw.style.display = 'block';

  if (!html) {                       // порожньо — просто згасаємо
    tw.classList.remove('show');
    return;
  }

  const body = document.getElementById('text-body');
  const refEl = document.getElementById('text-ref');

  // Перехід «крос-фейд»: гасимо, міняємо контент, проявляємо.
  // Раніше між слайдами був провал у чорноту на 150 мс — виглядало як блимання.
  const fade = (currentTheme.fadeMs || 600);
  tw.classList.remove('show');

  setTimeout(() => {
    body.innerHTML = html;
    refEl.innerHTML = escRef(ref);
    // Розмір: або зафіксований на всю пісню, або підбирається під цей слайд
    body.style.fontSize = (lockedSize || currentTheme.fontSize || 58) + 'px';
    if (!lockedSize) fitTextToScreen();
    requestAnimationFrame(() => { tw.classList.add('show'); reassertChroma(); reassertContrast(); });
  }, Math.min(fade * 0.45, 220));
}

// ============================================================
// ФІКСОВАНИЙ РОЗМІР НА ВСЮ ПІСНЮ
// Авто-вміщення підбирало розмір для кожного слайда окремо — і текст
// «стрибав» між куплетами (58px → 42px → 58px). Тепер рахуємо розмір,
// який влазить у НАЙДОВШИЙ слайд, і тримаємо його для всієї пісні.
// ============================================================
let lockedSize = null;

ipcRenderer.on('set-fit-group', (event, slides) => {
  lockedSize = null;
  if (!slides || !slides.length || !autoFitEnabled) return;

  const body = document.getElementById('text-body');
  const refEl = document.getElementById('text-ref');
  if (!body) return;

  const savedHTML = body.innerHTML;
  const base = currentTheme.fontSize || 58;
  let minSize = base;

  slides.forEach(s => {
    body.innerHTML = s;
    body.style.fontSize = base + 'px';
    fitTextToScreen();
    const got = parseFloat(body.style.fontSize) || base;
    if (got < minSize) minSize = got;
  });

  body.innerHTML = savedHTML;
  lockedSize = minSize;
  body.style.fontSize = lockedSize + 'px';
  console.log('Розмір зафіксовано на всю пісню:', lockedSize + 'px');
});

// Точний фіксований розмір, заданий вручну оператором (кнопки A− / A+).
// На відміну від set-fit-group (авто-підбір під найдовший слайд), тут
// розмір задається напряму й тримається, доки не скинуть (size=null → авто).
ipcRenderer.on('set-locked-size', (event, size) => {
  lockedSize = (typeof size === 'number' && size > 0) ? size : null;
  const body = document.getElementById('text-body');
  if (body) {
    if (lockedSize) body.style.fontSize = lockedSize + 'px';
    else fitTextToScreen();
  }
});


function showHTML(filePath) {
  // Ховаємо текстовий шар (він згасне сам через .show)
  const tw = document.getElementById('text-wrap');
  clearTimeout(tw._hideT);
  tw.classList.remove('show');
  const fade = Math.min((currentTheme.fadeMs || 600), 500);
  tw._hideT = setTimeout(() => { tw.style.display = 'none'; }, fade);

  const fw = document.getElementById('frame-wrap');
  clearTimeout(fw._hideT);
  fw.style.transition = 'opacity ' + (fade / 1000) + 's ease';
  fw.style.display = 'block';
  fw.style.opacity = '0';

  const frame = document.getElementById('frame');
  // Проявляємо графіку, коли iframe завантажився (щоб не блимнути напівготовим);
  // фолбек-таймер на випадок, якщо onload не спрацює.
  frame.onload = () => { requestAnimationFrame(() => { fw.style.opacity = '1'; }); reassertChroma(); };
  setTimeout(() => { fw.style.opacity = '1'; }, fade + 60);
  frame.src = filePath;
  reassertChroma();
}

function showClear() {
  const fade = Math.min((currentTheme.fadeMs || 600), 500);
  const tw = document.getElementById('text-wrap');
  if (tw) {
    tw.classList.remove('show');           // згасає (opacity → 0)
    clearTimeout(tw._hideT);
    tw._hideT = setTimeout(() => { tw.style.display = 'none'; }, fade);
  }
  fadeOutFrame();                          // графіка згасає й ховається
}

let chromaColor = 'none';

// ============================================================
// ХРОМАКЕЙ САМ СЕБЕ ТРИМАЄ
// Будь-яка дія з фоном (тема, колір, відео, логотип, новий слайд) могла
// перекрити зелений шар — і трансляція втрачала хромакей посеред служби.
// Тепер після кожної такої дії стан хромакею відновлюється.
// ============================================================
function reassertChroma() {
  if (!chromaColor || chromaColor === 'none') return;
  const chromaEl = document.getElementById('proj-chroma');
  if (!chromaEl) { applyChroma(chromaColor); return; }
  chromaEl.style.background = chromaColor;
  chromaEl.style.zIndex = '0';
  chromaEl.style.display = 'block';
  chromaEl.style.opacity = '1';
  const bgEl = document.getElementById('proj-bg');
  const dimEl = document.getElementById('proj-dim');
  const vid = document.getElementById('bg-video');
  if (bgEl) bgEl.style.display = 'none';
  if (dimEl) dimEl.style.display = 'none';
  if (vid) { vid.style.display = 'none'; try { vid.pause(); } catch (e) {} }
}

function applyChroma(color) {
  chromaColor = color;
  // Тема надсилається РАНІШЕ за хромакей при відкритті вікна — тож без цього
  // виклику перший показаний текст не отримав би автоматичний контраст.
  if (typeof applyTheme === 'function' && typeof currentTheme !== 'undefined') applyTheme(currentTheme);
  if (typeof reassertContrast === 'function') reassertContrast();
  let chromaEl = document.getElementById('proj-chroma');
  if (!chromaEl) {
    chromaEl = document.createElement('div');
    chromaEl.id = 'proj-chroma';
    chromaEl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
    document.body.insertBefore(chromaEl, document.body.firstChild);
  }
  if (color && color !== 'none') {
    chromaEl.style.background = color;
    chromaEl.style.zIndex = '0';
    const bgEl = document.getElementById('proj-bg');
    const dimEl = document.getElementById('proj-dim');
    const vid = document.getElementById('bg-video');
    if (bgEl) bgEl.style.display = 'none';
    if (dimEl) dimEl.style.display = 'none';
    // Відео-фон теж ховаємо: він на тому ж шарі й перекрив би зелений колір,
    // а трансляція отримала б відео замість чистого хромакею.
    if (vid) vid.style.display = 'none';
  } else {
    chromaEl.style.background = 'transparent';
    chromaEl.style.zIndex = '-1';
    const bgEl = document.getElementById('proj-bg');
    const dimEl = document.getElementById('proj-dim');
    const vid = document.getElementById('bg-video');
    if (bgEl) bgEl.style.display = '';
    if (dimEl) dimEl.style.display = '';
    // Повертаємо відео-фон, якщо він був заданий
    if (vid && vid.src) { vid.style.display = 'block'; vid.play().catch(() => {}); if (bgEl) bgEl.style.opacity = '0'; }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme);
  ipcRenderer.on('set-theme', (event, theme) => { applyTheme(theme); reassertChroma(); });
  
// ============================================================
// Екранні кнопки керування (режим одного монітора).
// У SoftProjector це Display Control buttons із налаштуванням
// розміру, вирівнювання та прозорості — робимо так само.
// ============================================================

function applyControls(cfg) {
  let bar = document.getElementById('proj-controls');
  if (!cfg) { if (bar) bar.remove(); return; }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'proj-controls';
    const btns = [
      ['◀', 'prev',  'Попередній'],
      ['▶', 'next',  'Наступний'],
      ['⬛', 'clear', 'Очистити'],
      ['✕', 'close', 'Закрити вивід']
    ];
    btns.forEach(([label, action, title]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.dataset.action = action;
      b.style.cssText = 'background:rgba(20,22,34,.9);color:#fff;border:1px solid rgba(255,255,255,.25);' +
                        'border-radius:8px;cursor:pointer;font-family:sans-serif;line-height:1;';
      b.onmouseenter = () => { bar.style.opacity = '1'; };
      b.onmouseleave = () => { bar.style.opacity = bar.dataset.op; };
      b.onclick = () => ipcRenderer.send('display-control', action);
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }

  const size = cfg.size || 42;
  const op = String(typeof cfg.opacity === 'number' ? cfg.opacity : 0.5);
  bar.dataset.op = op;

  const pos = {
    'bottom-right': 'bottom:24px;right:24px;',
    'bottom-left':  'bottom:24px;left:24px;',
    'bottom-center':'bottom:24px;left:50%;transform:translateX(-50%);',
    'top-right':    'top:24px;right:24px;',
    'top-left':     'top:24px;left:24px;'
  }[cfg.align || 'bottom-right'];

  bar.style.cssText = 'position:fixed;z-index:9999;display:flex;gap:8px;opacity:' + op +
                      ';transition:opacity .2s;' + pos;
  Array.from(bar.children).forEach(b => {
    b.style.width = size + 'px';
    b.style.height = size + 'px';
    b.style.fontSize = Math.round(size * 0.42) + 'px';
  });
}

ipcRenderer.on('set-controls', (event, cfg) => applyControls(cfg));

// GDD-графіка живе в iframe. Origin у file:// непрозорий, тож напряму
// викликати її функції не можна — спілкуємось через postMessage.
ipcRenderer.on('gdd', (event, { action, data }) => {
  const frame = document.getElementById('frame');
  if (!frame || !frame.contentWindow) return;
  try {
    frame.contentWindow.postMessage({ __gdd: action, data: data || {} }, '*');
  } catch (e) {
    console.warn('GDD postMessage не пройшов', e);
  }
});


// ============================================================
// ШАРИ ЕКРАНА: відео-фон, логотип, заморозка, оголошення поверх
// ============================================================

// --- Відео-фон під текстом (зациклене) ---

// ============================================================
// ТЕСТОВА СІТКА — навести проектор, перевірити краї та фокус
// ============================================================

// ---- Blackout: миттєвий чорний екран поверх усього ----
ipcRenderer.on('blackout', (event, on) => {
  let el = document.getElementById('blackout-layer');
  if (on) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'blackout-layer';
      el.style.cssText = 'position:fixed;inset:0;z-index:9990;background:#000';
      document.body.appendChild(el);
    }
    el.style.display = 'block';
  } else if (el) { el.style.display = 'none'; }
});

// ---- Центральна гучність відео-фону ----
ipcRenderer.on('master-volume', (event, v) => {
  const vid = document.getElementById('bg-video');
  if (vid) vid.volume = Math.max(0, Math.min(1, v));   // (відео-фон зазвичай muted, але лишаємо керування)
});

// ---- Позначка «це вихід-сцена» — керує тим, чи взагалі показувати таймер нижче ----
ipcRenderer.on('stage-flag', (event, isStage) => {
  window.__isStageDisplay = !!isStage;
  if (!isStage) {
    const el = document.getElementById('stage-timer');
    if (el) el.remove();   // зняли позначку — прибираємо накладку одразу, не чекаючи наступного тіку таймера
  }
});

// ---- Таймер проповіді (лише на екрані сцени) ----
ipcRenderer.on('stage-timer', (event, data) => {
  let el = document.getElementById('stage-timer');
  if (!data) { if (el) el.remove(); return; }
  // Показуємо тільки якщо це екран сцени (позначка ставиться при відкритті stage display)
  if (!window.__isStageDisplay) return;
  if (!el) {
    el = document.createElement('div');
    el.id = 'stage-timer';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:4%;z-index:9995;text-align:center;' +
      'font-family:monospace;font-weight:700;pointer-events:none';
    document.body.appendChild(el);
  }
  const mmss = s => { s = Math.max(0, s); const m = Math.floor(s/60), x = s%60; return m + ':' + (x<10?'0':'') + x; };
  const color = data.warn === 'over' ? '#ff5252' : (data.warn === 'soon' ? '#ffd23f' : '#7CFC9A');
  el.innerHTML = '<span style="font-size:6vh;color:' + color + '">' +
    (data.left >= 0 ? mmss(data.left) : '+' + mmss(-data.left)) + '</span>' +
    '<div style="font-size:2.2vh;color:#8b92a8">минуло ' + mmss(data.elapsed) + '</div>';
});

ipcRenderer.on('test-pattern', (event, on) => {
  let el = document.getElementById('test-pattern');
  if (!on) { if (el) el.remove(); return; }
  if (el) return;

  el = document.createElement('div');
  el.id = 'test-pattern';
  el.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#111;color:#fff;' +
    'font-family:monospace;pointer-events:none';
  el.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none">
      <defs>
        <pattern id="g" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M80 0 L0 0 0 80" fill="none" stroke="#3a3f55" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="1920" height="1080" fill="url(#g)"/>
      <!-- Рамка країв: якщо її не видно повністю — проектор зрізає краї -->
      <rect x="4" y="4" width="1912" height="1072" fill="none" stroke="#f0c040" stroke-width="6"/>
      <rect x="96" y="54" width="1728" height="972" fill="none" stroke="#3ecf8e" stroke-width="3" stroke-dasharray="12 8"/>
      <!-- Центр -->
      <line x1="960" y1="0" x2="960" y2="1080" stroke="#7c6af7" stroke-width="2"/>
      <line x1="0" y1="540" x2="1920" y2="540" stroke="#7c6af7" stroke-width="2"/>
      <circle cx="960" cy="540" r="120" fill="none" stroke="#7c6af7" stroke-width="3"/>
      <!-- Кути -->
      <circle cx="96" cy="54" r="10" fill="#3ecf8e"/><circle cx="1824" cy="54" r="10" fill="#3ecf8e"/>
      <circle cx="96" cy="1026" r="10" fill="#3ecf8e"/><circle cx="1824" cy="1026" r="10" fill="#3ecf8e"/>
    </svg>
    <div style="position:absolute;top:6%;left:0;right:0;text-align:center;font-size:3vh;color:#f0c040">
      ЖОВТА рамка = край екрана
    </div>
    <div style="position:absolute;bottom:6%;left:0;right:0;text-align:center;font-size:2.4vh;color:#3ecf8e">
      ЗЕЛЕНИЙ пунктир = безпечна зона для тексту
    </div>
    <div style="position:absolute;top:44%;left:0;right:0;text-align:center;font-size:5vh;font-weight:700">
      ${window.innerWidth} × ${window.innerHeight}
    </div>`;
  document.body.appendChild(el);
});

ipcRenderer.on('set-bg-video', (event, cfg) => {
  const v = document.getElementById('bg-video');
  const bg = document.getElementById('proj-bg');
  if (!v) return;

  if (!cfg || !cfg.src) {
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.style.display = 'none';
    if (bg) bg.style.opacity = '1';
    return;
  }
  v.src = cfg.src;
  v.loop = cfg.loop !== false;
  v.muted = true;              // фон завжди без звуку — інакше перекриє спів
  v.playbackRate = cfg.speed || 1;
  v.style.display = 'block';
  // Фон теми ховаємо, щоб не перекривав відео (затемнення лишається)
  if (bg) bg.style.opacity = '0';
  v.play().catch(() => {});
  reassertChroma();          // якщо ввімкнено хромакей — відео не має його перекривати
});

// --- Екран логотипа (пауза, перерва) ---
ipcRenderer.on('show-logo', (event, dataUrl) => {
  setTimeout(reassertChroma, 0);
  const layer = document.getElementById('logo-layer');
  const img = document.getElementById('logo-img');
  if (!layer) return;
  if (!dataUrl) { layer.style.display = 'none'; return; }
  if (img) img.src = dataUrl;
  layer.style.display = 'flex';
});

// --- Заморозити кадр: знімаємо поточний вигляд і показуємо як картинку ---
let isFrozen = false;
ipcRenderer.on('freeze', (event, on) => {
  // Заморозка = ігноруємо нові оновлення. Раніше ми малювали текст у canvas,
  // і якщо на екрані була HTML-графіка чи QR — зал бачив порожній чорний прямокутник.
  isFrozen = !!on;
});



// --- Оголошення ПОВЕРХ слайда: пісня триває, повідомлення виїжджає ---
let alertTimer = null;
ipcRenderer.on('alert', (event, cfg) => {
  const layer = document.getElementById('alert-layer');
  const txt = document.getElementById('alert-text');
  if (!layer || !txt) return;

  clearTimeout(alertTimer);
  if (!cfg || !cfg.text) {
    layer.classList.remove('show');
    setTimeout(() => { layer.style.display = 'none'; }, 500);
    return;
  }

  txt.textContent = cfg.text;
  layer.className = '';                       // скидаємо попередні класи
  if (cfg.position === 'top') layer.classList.add('top');
  if (cfg.ticker) layer.classList.add('ticker');
  if (cfg.color) layer.style.borderColor = cfg.color;
  layer.style.fontSize = (cfg.size || 34) + 'px';
  layer.style.display = 'block';

  // Даємо браузеру кадр, щоб анімація виїзду спрацювала
  requestAnimationFrame(() => layer.classList.add('show'));

  if (cfg.seconds) {
    alertTimer = setTimeout(() => {
      layer.classList.remove('show');
      setTimeout(() => { layer.style.display = 'none'; }, 500);
    }, cfg.seconds * 1000);
  }
});

ipcRenderer.on('set-bg', (event, color) => {
  const __reassert = true;
  customBg = color || null;
  const bgEl = document.getElementById('proj-bg');
  if (customBg) {
    if (bgEl) bgEl.style.background = customBg;
    document.body.style.background = customBg;
  } else {
    // повертаємо фон теми
    applyTheme(currentTheme);
    document.body.style.background = '#000';
  }
  reassertChroma();          // хромакей має лишитись
});

ipcRenderer.on('set-chroma', (event, color) => applyChroma(color));
  ipcRenderer.on('display', (event, data) => {
    if (isFrozen) return;   // кадр заморожено — оновлення не приймаємо

    // Логотип перекриває контент. Якщо оператор надіслав слайд, а логотип
    // лишився б на екрані — зал не побачив би нічого. Прибираємо автоматично.
    const logoLayer = document.getElementById('logo-layer');
    if (logoLayer && logoLayer.style.display === 'flex' && data && data.type !== 'clear') {
      logoLayer.style.display = 'none';
      ipcRenderer.send('logo-auto-hidden');
    }
    if (data.type === 'text') showText(data.payload.html, data.payload.ref);
    else if (data.type === 'html') showHTML(data.payload.filePath);
    else if (data.type === 'clear') showClear();
  });
});

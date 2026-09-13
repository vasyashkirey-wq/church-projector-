const { app, BrowserWindow, screen, ipcMain, Menu, protocol } = require('electron');

// Кастомна привілейована схема app:// для контенту output-вікон —
// фундамент для вмикання contextIsolation/webSecurity на них (аудит 4.1).
// registerSchemesAsPrivileged МУСИТЬ виконатись до app.whenReady(), тому
// саме тут, на самому верху файлу. Сам обробник схеми реєструється
// пізніше, вже всередині whenReady (див. contentProtocol.registerHandler).
const contentProtocol = require('./src/main/content-protocol');
contentProtocol.registerScheme(protocol);
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const os = require('os');
const { pathToFileURL } = require('url');
const fs = require('fs');

let mainWin = null;
// Вікна виходів: 4 незалежні монітори
// projector = Вихід 1, stream = Вихід 2 (з хромакеєм), out3, out4 — додаткові
const outputWins = { projector: null, stream: null, out3: null, out4: null };
const OUTPUT_KINDS = ['projector', 'stream', 'out3', 'out4'];
const OUTPUT_TITLES = { projector: 'Проектор (Вихід 1)', stream: 'Трансляція (Вихід 2)', out3: 'Вихід 3', out4: 'Вихід 4' };
let pendingDisplay = null;
let wsServer = null;
let httpServer = null;
// Справжнє завершення застосунку (Cmd+Q/Alt+F4 на всій програмі, а не на
// одному вихідному вікні) — 'close' на output-вікнах у цей момент теж
// спрацював би (Electron закриває решту вікон при виході), і без цього
// прапорця діалог «закрити вихід з ефіром?» блокував би завершення роботи.
let appIsQuitting = false;

// Останній 'display'-контент, реально надісланий на кожен вихід (адресно чи
// через дзеркало) — потрібно для двох речей: (1) при перевідкритті виходу
// (закрився й відкрився знову) одразу повернути те, що там було, а не чорний
// екран; (2) при закритті вікна вирішити, чи це «щось в ефірі» (варто
// перепитати оператора) чи порожньо/blackout (закриваємо мовчки). Не
// персистентне — скидається з перезапуском програми, як і сам ефір.
const lastContentByKind = { projector: null, stream: null, out3: null, out4: null };

// ============================================================
// БЕЗПЕКА ВІКОН, ЩО ПОКАЗУЮТЬ КОНТЕНТ (output/Stage/identify)
// Аудит (розділ 4.1): output-вікно показує імпортований/згенерований
// HTML (H2R, GDD-графіка, слайди, медіа) і НІКОЛИ не повинно саме
// переходити на стороннє посилання чи відкривати нове вікно — усе
// оновлення контенту йде через IPC ('display'/showHTML тощо), а не
// через navigation. Раніше цих обробників не було взагалі — будь-який
// імпортований HTML (напр. злочинний <a href> чи window.open усередині
// GDD-графіки чи HTML-оверлею) міг би перевести output-екран на
// довільний сайт просто посеред служби, і ніхто б цього не помітив,
// доки не глянув на сам проектор.
// ОНОВЛЕННЯ (аудит 4.1, крок 2 — ЗАКРИТО): contextIsolation:true /
// webSecurity:true / allowRunningInsecureContent:false тепер увімкнено
// на output-вікнах (див. createOutputWindow нижче й детальний коментар
// там). Причина, через яку вони колись стояли false (opaque origin
// file://-документів), закрита кастомною схемою app:// (див.
// src/main/content-protocol.js); живе тестування (H2R, GDD, фони,
// слайди) підтвердило канал без жодної console-помилки.
function hardenContentWindow(win) {
  win.webContents.on('will-navigate', (e) => { e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

let currentTheme = {
  bgColor: '#000000',
  bgType: 'color',
  bgGradient: 'linear-gradient(135deg, #0d0d2b, #2d1b69)',
  bgImage: null,
  bgAnimated: false,   // «дихання» фону (H2R-стиль animated background)
  textColor: '#ffffff',
  refColor: '#c8a84b',
  fontSize: 58,
  fontFamily: 'Georgia, serif',
  textAlign: 'center',
  textPosition: 'center',
  textShadow: true,
  padding: 80
};

// ============================================================
// MAIN WINDOW
// ============================================================
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Церква Прага — Панель керування',
    // На Windows тримаємо смугу меню прихованою (з'являється по Alt), щоб
    // не міняти звичний вигляд. На macOS цей параметр ігнорується — там меню
    // завжди у верхній системній смузі.
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src/preload.js')
    }
  });
  mainWin.loadFile(path.join(__dirname, 'src/index.html'));
  mainWin.on('closed', () => {
    // Закриваємо УСІ вікна виводу (не лише projector/stream) — інакше out3/out4
    // лишались відкритими без панелі керування, і другий запуск програми
    // («вже запущено — фокусуємо») не міг створити нове головне вікно.
    OUTPUT_KINDS.forEach(k => {
      if (outputWins[k] && !outputWins[k].isDestroyed()) { outputWins[k].__intentionalClose = true; outputWins[k].close(); }
    });
    if (stageWin && !stageWin.isDestroyed()) stageWin.close();
    stopRemoteServer();
    mainWin = null;
  });
}

// ============================================================
// OUTPUT WINDOW (generic — used for both projector and stream)
// ============================================================
let outputConfig = {
  projectorDisplayId: null, // null = авто-вибір
  streamDisplayId: null,
  out3DisplayId: null,
  out4DisplayId: null,
  streamChroma: 'none', // залишено для сумісності зі старим API
  // Хромакей окремо для кожного виходу: 'none' | будь-який hex
  chroma: { projector: 'none', stream: 'none', out3: 'none', out4: 'none' },
  alwaysOnTop: true,        // вікна виводу поверх усіх програм (як у SoftProjector)
  singleScreenMode: false,  // один монітор: вивід з'являється лише на «В ЕФІР»
  controls: { size: 42, align: 'bottom-right', opacity: 0.5 }, // екранні кнопки в режимі одного монітора
  // Виходи, які отримують спільний броадкаст (режим «дзеркало»).
  // Виходи з власним маршрутом сюди не входять — їм контент шлеться адресно.
  mirrorKinds: ['projector', 'stream', 'out3', 'out4'],
  // Фон кожного виходу за кодом кольору (hex). null = фон теми
  bg: { projector: null, stream: null, out3: null, out4: null },
  // Плавний рух фону — окремий прапорець на вихід, НЕ змінює формат bg
  // (лишається простим рядком кольору/градієнта) — щоб нічого іншого, що
  // читає outputConfig.bg, не довелось переробляти.
  bgAnimated: { projector: false, stream: false, out3: false, out4: false }
};

function pickDisplay(excludeIds, preferredId) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  // Явно обраний дисплей — це свідомий вибір оператора (напр. навмисно
  // посадити 2 виходи на один монітор в парі), тож завжди повертаємо його,
  // НАВІТЬ якщо інший вихід уже там є. Розкладку (fullscreen чи спільна
  // сітка) вирішує createOutputWindow нижче — рахуючи, скільки виходів
  // реально розділяють цей САМЕ дисплей, а не глобальну кількість.
  if (preferredId) {
    const exact = displays.find(d => d.id === preferredId);
    if (exact) return exact;
  }
  const candidate = displays.find(d => d.id !== primary.id && !excludeIds.includes(d.id));
  if (candidate) return candidate;
  // Один монітор (або ввімкнено режим одного монітора) — виводимо на головний,
  // інакше вікно відкрилося б віконним 1280x720 замість повноекранного.
  if (outputConfig.singleScreenMode || displays.length === 1) return primary;
  return null;
}

// Який вихід (якщо є) зараз позначений «екраном сцени» — таймер проповіді
// накладається лише на нього поверх того, що вихід і так показує.
let stageOutputKind = null;

function createOutputWindow(kind, callback) {
  if (!OUTPUT_KINDS.includes(kind)) kind = 'projector';
  const isProjector = kind === 'projector';
  let winRef = outputWins[kind];

  if (winRef && !winRef.isDestroyed()) {
    if (callback) callback();
    return;
  }

  // Дисплеї, вже зайняті іншими відкритими виходами
  const usedDisplayIds = [];
  const displayIdByKind = {};   // для розрахунку "хто ще на цьому ж дисплеї" нижче
  OUTPUT_KINDS.forEach(k => {
    if (k === kind) return;
    const w = outputWins[k];
    if (w && !w.isDestroyed()) {
      const d = screen.getDisplayMatching(w.getBounds());
      usedDisplayIds.push(d.id);
      displayIdByKind[k] = d.id;
    }
  });

  const preferredId = outputConfig[kind + 'DisplayId'];
  const target = pickDisplay(usedDisplayIds, preferredId);

  // Скільки виходів РЕАЛЬНО ділять САМЕ цей дисплей — навмисно (оператор сам
  // прив'язав 2+ виходи до одного монітора в «Прив'язці екранів», щоб вони
  // працювали в парі) або випадково (вільних моніторів забракло).
  //
  // Якщо ЦЕЙ вихід має явну прив'язку (preferredId) — рахуємо пару за
  // НАЛАШТУВАННЯМ (хто ЩЕ явно прив'язаний до того самого дисплея), а не
  // лише за тим, що вже відкрито. Інакше перший з пари, відкритий раніше
  // другого, іще «не знав» би про партнера й хибно йшов повноекранно, а
  // при відкритті другого перевідкривати перший (і зривати з нього фокус)
  // ми не хочемо. Якщо прив'язки нема (авто) — це випадкова тіснота, і тут
  // рахуємо за тим, що РЕАЛЬНО відкрито зараз (динамічно, бо заздалегідь
  // невідомо, скільки виходів у підсумку осядуть на цьому дисплеї).
  const sharingKinds = !target
    ? [kind]
    : preferredId
      ? OUTPUT_KINDS.filter(k => k === kind || outputConfig[k + 'DisplayId'] === preferredId)
      : OUTPUT_KINDS.filter(k => k === kind || displayIdByKind[k] === target.id);
  const shareCount = sharingKinds.length;

  // РАНІШЕ (баг): тісні вікна каскадом зсувались лише на 340px при ширині
  // 960px — перекривали одне одного майже на 2/3, текст на задньому вікні
  // ховався за переднім. Тепер — сітка без перекриття: 2 виходи на одному
  // моніторі → половинки поряд, 3-4 → сітка 2×2. Слот у сітці — за позицією
  // в OUTPUT_KINDS СЕРЕД ТИХ, ХТО ДІЛИТЬ ЦЕЙ ДИСПЛЕЙ (не глобально), тож
  // розташування стабільне між перезапусками незалежно від порядку відкриття.
  const sharedArea = (target ? target.bounds : screen.getPrimaryDisplay().bounds);
  const gridGap = 12;
  const slot = sharingKinds.indexOf(kind);
  let bounds;
  if (!target || shareCount <= 1) {
    bounds = target ? target.bounds : { x: 80, y: 80, width: 960, height: 540 };
  } else if (shareCount === 2) {
    const cellW = Math.floor((sharedArea.width - gridGap * 3) / 2);
    bounds = {
      x: sharedArea.x + gridGap + slot * (cellW + gridGap),
      y: sharedArea.y + gridGap,
      width: cellW,
      height: sharedArea.height - gridGap * 2
    };
  } else {
    const col = slot % 2, row = Math.floor(slot / 2);
    const cellW = Math.floor((sharedArea.width - gridGap * 3) / 2);
    const cellH = Math.floor((sharedArea.height - gridGap * 3) / 2);
    bounds = {
      x: sharedArea.x + gridGap + col * (cellW + gridGap),
      y: sharedArea.y + gridGap + row * (cellH + gridGap),
      width: cellW,
      height: cellH
    };
  }
  const crowded = shareCount > 1;   // нижче вирішує fullscreen чи ні (той самий прапорець, що й раніше)

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    backgroundColor: '#000000',
    title: OUTPUT_TITLES[kind],
    webPreferences: {
      nodeIntegration: false,
      // АУДИТ 4.1, КРОК 2 — ЗАХИСТ УВІМКНЕНО.
      // Раніше тут стояло contextIsolation:false + webSecurity:false +
      // allowRunningInsecureContent:true. Причина була в file://: Chromium
      // вважає кожен file://-документ окремим «непрозорим» походженням.
      // Кастомна схема app:// (src/main/content-protocol.js) прибрала цю
      // причину, після чого захист перевірено наживо (реальний Electron +
      // Playwright, окреме вікно проектора) на всіх 4 типах контенту:
      // H2R-титри, GDD-графіка, фони, слайди — 9/9 кроків, 0 помилок,
      // підтверджено через webContents.getLastWebPreferences().
      //
      // Чому contextIsolation:true тут безпечний: projector.html не має
      // ЖОДНОГО власного <script> — уся логіка живе в
      // projector-preload.js, який працює з DOM напряму (ізольований світ
      // ділить DOM зі сторінкою) і читає власну ж window.__isStageDisplay
      // у тому самому світі. Тобто нічого не залежить від спільного
      // window між сторінкою й preload.
      contextIsolation: true,
      // webviewTag прибрано: у projector.html/projector-preload.js немає
      // жодного <webview> — весь HTML-контент (GDD/оверлеї/слайди) іде
      // через звичайний <iframe id="frame">, тож цей прапорець лише
      // вмикав НЕВИКОРИСТОВУВАНУ й ризиковану можливість без користі.
      webSecurity: true,
      allowRunningInsecureContent: false,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'src/projector-preload.js')
    }
  });

  hardenContentWindow(win);

  // Реєструємо вікно ОДРАЗУ, а не лише після завантаження сторінки — інакше
  // швидкий повторний виклик для того самого виходу (напр. подвійний клік
  // «Відкрити», поки перше вікно ще довантажується) не бачив би, що воно вже
  // створюється, і відкрив би друге, «осиротивши» перше.
  outputWins[kind] = win;

  win.loadFile(path.join(__dirname, 'src/projector.html'));

  if (outputConfig.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');

  win.webContents.once('did-finish-load', () => {
    if (target && !crowded) win.setFullScreen(true);
    else if (crowded && mainWin && !mainWin.isDestroyed()) {
      // Навмисна пара (оператор сам прив'язав обидва виходи до цього дисплея
      // в «Прив'язці екранів») — не попередження, а нейтральне повідомлення.
      // Випадкова тіснота (просто забракло вільних моніторів) — попередження.
      const intentional = !!preferredId && target && preferredId === target.id;
      mainWin.webContents.send('output-warning', {
        kind: kind,
        intentional: intentional,
        message: intentional
          ? `${shareCount} виходи навмисно ділять один монітор — розкладені без перекриття.`
          : 'Кілька виводів на одному моніторі — не вистачає вільних екранів, розкладені без перекриття, але не на весь екран.'
      });
    }
    // Режим одного монітора: показуємо екранні кнопки керування прямо на виводі
    if (outputConfig.singleScreenMode && kind === 'projector') {
      win.webContents.send('set-controls', outputConfig.controls);
    }
    win.webContents.send('set-theme', currentTheme);
    // Хромакей застосовується тільки до вікна трансляції
    const ck = outputConfig.chroma[kind];
    if (ck && ck !== 'none') win.webContents.send('set-chroma', ck);
    // Відновлюємо збережений колір фону цього виходу
    if (outputConfig.bg[kind]) {
      win.webContents.send('set-bg', outputConfig.bg[kind], outputConfig.bgAnimated[kind]);
    }
    // Таймер проповіді показується накладкою лише на вихід, позначений сценою —
    // прапорець живе в самому вікні (window.__isStageDisplay) і скидається щоразу,
    // як вікно перевідкривається, тож ставимо його заново тут.
    if (stageOutputKind === kind) win.webContents.send('stage-flag', true);
    outputWins[kind] = win;
    if (callback) callback();
    if (pendingDisplay) {
      setTimeout(() => {
        // Обидва виходи (проектор і трансляція) реєструють свій власний
        // 'did-finish-load' і плюють на СПІЛЬНУ pendingDisplay: якщо вони
        // завантажились близько в часі, обидва таймаути спрацьовують, і
        // перший з них уже занулив pendingDisplay до того, як другий встиг
        // прочитати — другий тоді розсилав усім вікнам display=null одразу
        // після першого реального показу. Перевіряємо ще раз тут.
        if (!pendingDisplay) return;
        broadcastDisplay(pendingDisplay);
        pendingDisplay = null;
      }, 200);
    } else if (lastContentByKind[kind]) {
      // ВІДНОВЛЕННЯ ПРИ ПЕРЕВІДКРИТТІ: вихід закрився (монітор відвалився,
      // випадковий Cmd+W/Alt+F4, чи оператор сам закрив і передумав) і
      // відкрився знову — раніше показував чорний екран, доки не надішлеш
      // щось нове. lastContentByKind живе, поки живий процес (не per-вікно),
      // тож тут завжди останнє, що реально бачив ЦЕЙ вихід — і 'clear'/
      // blackout сюди теж потрапляють, тож порожній вихід так порожнім і
      // лишиться. pendingDisplay (гілка вище) — свіжіший за визначенням,
      // тож коли обидва є, він у пріоритеті.
      setTimeout(() => { if (!win.isDestroyed()) win.webContents.send('display', lastContentByKind[kind]); }, 250);
    }
  });

  // ПОПЕРЕДЖЕННЯ ПРИ НЕОЧІКУВАНОМУ ЗАКРИТТІ (Cmd+W/Alt+F4 з фокусом саме на
  // цьому вікні — вихідні вікна безрамкові, тож звичайного хрестика на них
  // нема, але клавіатурне закриття лишається можливим). Явне закриття з
  // самої програми ставить win.__intentionalClose = true заздалегідь (див.
  // обробник IPC «close-output» нижче) і питання пропускає. Питаємо лише якщо
  // на виході зараз реально щось в ефірі (не 'clear'/blackout) — порожній
  // вихід можна закривати мовчки.
  win.on('close', (e) => {
    if (win.__intentionalClose || appIsQuitting) return;
    const last = lastContentByKind[kind];
    const isLive = !!(last && last.type && last.type !== 'clear');
    if (!isLive) return;
    e.preventDefault();
    try {
      const { dialog } = require('electron');
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['Закрити вихід', 'Скасувати'],
        defaultId: 1,
        cancelId: 1,
        title: 'Закрити вихід?',
        message: `На «${OUTPUT_TITLES[kind]}» зараз щось в ефірі. Закрити вікно?`
      });
      if (choice === 0) { win.__intentionalClose = true; win.close(); }
    } catch (err) {
      // Діалог не вдалось показати — не блокуємо оператора назавжди,
      // закриваємо як звичайно.
      win.__intentionalClose = true;
      win.close();
    }
  });

  win.on('closed', () => {
    outputWins[kind] = null;
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('output-closed', kind);
    }
  });
}

function displayFingerprint(d) {
  // Windows видає моніторам нові id після перезавантаження, тож прив'язка «вихід → id»
  // після ребуту могла поїхати не на той екран. «Відбиток» переживає перезапуск.
  return [d.bounds.width, d.bounds.height, d.bounds.x, d.bounds.y, d.scaleFactor, d.rotation || 0].join('x');
}

function getDisplaysList() {
  const primary = screen.getPrimaryDisplay();
  const operator = mainWin && !mainWin.isDestroyed()
    ? screen.getDisplayMatching(mainWin.getBounds()) : primary;

  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    num: i + 1,
    isPrimary: d.id === primary.id,
    isOperator: d.id === operator.id,
    width: d.bounds.width,
    height: d.bounds.height,
    x: d.bounds.x,
    y: d.bounds.y,
    workWidth: d.workArea.width,
    workHeight: d.workArea.height,
    scaleFactor: d.scaleFactor,
    rotation: d.rotation || 0,
    // корисне для діагностики: реальна роздільність із урахуванням масштабу
    realWidth: Math.round(d.bounds.width * d.scaleFactor),
    realHeight: Math.round(d.bounds.height * d.scaleFactor),
    fingerprint: displayFingerprint(d),
    assigned: OUTPUT_KINDS.filter(k => outputConfig[k + 'DisplayId'] === d.id),
    open: OUTPUT_KINDS.filter(k => {
      const w = outputWins[k];
      if (!w || w.isDestroyed()) return false;
      return screen.getDisplayMatching(w.getBounds()).id === d.id;
    })
  }));
}

// Пошук монітора за «відбитком» (після перезапуску id інші)
function findDisplayByFingerprint(fp) {
  return screen.getAllDisplays().find(d => displayFingerprint(d) === fp) || null;
}

// Шле на ВСІ відкриті виходи, ігноруючи маршрути (для очищення екранів)
function broadcastAllOutputs(data) {
  OUTPUT_KINDS.forEach(k => {
    lastContentByKind[k] = data;
    const w = outputWins[k];
    if (w && !w.isDestroyed() && !w.webContents.isLoading()) w.webContents.send('display', data);
  });
}

function broadcastDisplay(data) {
  OUTPUT_KINDS.forEach(k => {
    if (!outputConfig.mirrorKinds.includes(k)) return; // має власний маршрут
    lastContentByKind[k] = data;
    const w = outputWins[k];
    if (w && !w.isDestroyed() && !w.webContents.isLoading()) w.webContents.send('display', data);
  });
}

function broadcastTheme(theme) {
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.webContents.send('set-theme', theme);
  });
}

// ============================================================
// STAGE MONITOR — окреме вікно для сцени (поточний/наступний слайд,
// таймер проповіді, нотатки). Раніше це був window.open()-попап (жив лише
// в рендерері, без гарантії «поверх усіх вікон», зникав за блокуванням
// спливаючих вікон). Тепер — звичайне BrowserWindow, як і інші виходи,
// але НЕ частина OUTPUT_KINDS/OUTPUT_TITLES: сцені не потрібні хромакей,
// прозорість, водяний знак чи маршрутизація — лише простий вибір монітора.
// Не плутати з set-stage-output/stageOutputKind вище — та функція лише
// накладає таймер поверх ОДНОГО з 4 звичайних виходів.
// ============================================================
let stageWin = null;
let stageDisplayId = null;
let stageFingerprint = null;

function createStageWindow(callback) {
  if (stageWin && !stageWin.isDestroyed()) { if (callback) callback(); return; }

  // Не сідати на той самий монітор, що вже зайнятий проектором/трансляцією/іншими виходами
  const usedDisplayIds = [];
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) usedDisplayIds.push(screen.getDisplayMatching(w.getBounds()).id);
  });
  const target = pickDisplay(usedDisplayIds, stageDisplayId);
  const bounds = target ? target.bounds : { x: 120, y: 120, width: 960, height: 540 };

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    backgroundColor: '#0a0a1a',
    title: 'Stage Display',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src/stage-preload.js')
    }
  });
  hardenContentWindow(win);
  stageWin = win;
  win.loadFile(path.join(__dirname, 'src/stage.html'));
  win.setAlwaysOnTop(true, 'screen-saver');

  win.webContents.once('did-finish-load', () => {
    if (target) win.setFullScreen(true);
    stageWin = win;
    if (callback) callback();
  });

  win.on('closed', () => {
    stageWin = null;
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('stage-window-closed');
  });
}

function closeStageWindow() {
  if (stageWin && !stageWin.isDestroyed()) stageWin.close();
  stageWin = null;
}


// ============================================================
// PPTX / DOCX — витяг тексту (винесено в src/main/office-extract.js,
// самодостатній модуль без залежності від стану головного процесу)
// ============================================================
require('./src/main/office-extract').register(ipcMain);

// ============================================================
// КОНВЕРТАЦІЯ МЕДІА (FFmpeg + heic-convert)
// Непідтримувані Chromium формати (MOV/MKV/AVI, HEIC, FLAC…) конвертуються
// в MP4/JPG/MP3 і кешуються за хешем файлу. Залежності вимагаються ЛІНИВО:
// без `npm install` додаток працює як раніше, лише конвертація повертає
// зрозумілу помилку замість падіння.
// ============================================================
const MEDIA_CACHE = path.join(app.getPath('userData'), 'media-cache');
function ensureCacheDir() { try { fs.mkdirSync(MEDIA_CACHE, { recursive: true }); } catch (e) {} }
function mediaHash(p) {
  try {
    const st = fs.statSync(p);
    return crypto.createHash('md5').update(p + '|' + st.size + '|' + st.mtimeMs).digest('hex').slice(0, 16);
  } catch (e) { return crypto.createHash('md5').update(String(p)).digest('hex').slice(0, 16); }
}
const CONV_VIDEO = ['mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg', '3gp', 'ts', 'mts', 'm2ts', 'm2v', 'vob', 'divx', 'asf', 'mxf'];
const CONV_AUDIO = ['flac', 'wma', 'aac', 'opus', 'aiff', 'aif', 'amr', 'ac3', 'm4b'];
const CONV_HEIC  = ['heic', 'heif'];
const CONV_IMAGE = ['tif', 'tiff', 'jp2', 'tga', 'pcx'];

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const proc = spawn(ffmpegPath, args);
    let err = '';
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-400))));
  });
}

ipcMain.handle('convert-media', async (event, { filePath }) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Файл не знайдено' };
    const ext = (path.extname(filePath).slice(1) || '').toLowerCase();
    ensureCacheDir();
    const h = mediaHash(filePath);

    // HEIC/HEIF → JPEG (чистий JS, без бінарника)
    if (CONV_HEIC.includes(ext)) {
      const out = path.join(MEDIA_CACHE, h + '.jpg');
      if (fs.existsSync(out)) return { ok: true, path: out, converted: true };
      let heicConvert;
      try { heicConvert = require('heic-convert'); }
      catch (e) { return { ok: false, error: 'Немає heic-convert — виконай `npm install`' }; }
      const outBuf = await heicConvert({ buffer: fs.readFileSync(filePath), format: 'JPEG', quality: 0.92 });
      fs.writeFileSync(out, Buffer.from(outBuf));
      return { ok: true, path: out, converted: true };
    }

    // Відео / аудіо / TIFF → через ffmpeg
    let ffmpegPath;
    try { ffmpegPath = require('ffmpeg-static'); }
    catch (e) { return { ok: false, error: 'Немає ffmpeg-static — виконай `npm install`' }; }
    // У ЗАПАКОВАНОМУ застосунку require повертає шлях УСЕРЕДИНІ app.asar, звідки
    // бінарник запустити НЕМОЖЛИВО (ні на Windows, ні на Mac). asarUnpack витягує
    // його поруч у app.asar.unpacked — туди й перенаправляємо (обидва роздільники).
    if (ffmpegPath) ffmpegPath = ffmpegPath.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) return { ok: false, error: 'FFmpeg-бінарник недоступний (npm install / asarUnpack)' };

    if (CONV_VIDEO.includes(ext)) {
      const out = path.join(MEDIA_CACHE, h + '.mp4');
      if (fs.existsSync(out)) return { ok: true, path: out, converted: true };
      await runFfmpeg(ffmpegPath, ['-y', '-i', filePath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
      return { ok: true, path: out, converted: true };
    }
    if (CONV_AUDIO.includes(ext)) {
      const out = path.join(MEDIA_CACHE, h + '.mp3');
      if (fs.existsSync(out)) return { ok: true, path: out, converted: true };
      await runFfmpeg(ffmpegPath, ['-y', '-i', filePath, '-c:a', 'libmp3lame', '-b:a', '256k', out]);
      return { ok: true, path: out, converted: true };
    }
    if (CONV_IMAGE.includes(ext)) {
      const out = path.join(MEDIA_CACHE, h + '.png');
      if (fs.existsSync(out)) return { ok: true, path: out, converted: true };
      await runFfmpeg(ffmpegPath, ['-y', '-i', filePath, out]);
      return { ok: true, path: out, converted: true };
    }

    // формат уже підтримуваний — конвертація не потрібна
    return { ok: true, path: filePath, converted: false };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// ============================================================
// QR-КОД (npm qrcode) — генерується в головному процесі й повертається
// як data URI. Чистий JS, без компіляції, тож завжди доступний. На відміну
// від попереднього способу (браузерна qrcodejs з CDN), працює ПОВНІСТЮ
// офлайн одразу з першого запуску — не треба жодного разу мати інтернет,
// щоб закешувати скрипт.
// ============================================================
ipcMain.handle('qrcode-generate', async (event, { text, size }) => {
  try {
    if (!text) return { ok: false, error: 'Порожній текст' };
    let QRCodeLib;
    try { QRCodeLib = require('qrcode'); }
    catch (e) { return { ok: false, error: 'Немає qrcode — виконай `npm install`' }; }
    const dataUrl = await QRCodeLib.toDataURL(text, {
      width: size || 300,
      margin: 1,
      errorCorrectionLevel: 'H',   // висока корекція — витримує логотип по центру
      color: { dark: '#000000', light: '#ffffff' }
    });
    return { ok: true, dataUrl };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// Читає файл із диска й повертає data URI (для картинок, які треба покласти на
// canvas: file:// «отруює» canvas, а data URI — ні). Використовується після
// конвертації HEIC → JPG для логотипа й картинок слайдів.
ipcMain.handle('read-file-datauri', async (event, { filePath }) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Файл не знайдено' };
    const ext = (path.extname(filePath).slice(1) || '').toLowerCase();
    const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' })[ext] || 'application/octet-stream';
    const b64 = fs.readFileSync(filePath).toString('base64');
    return { ok: true, dataUri: 'data:' + mime + ';base64,' + b64 };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});


// ============================================================
// OBS STUDIO (obs-websocket v5)
// Перемикання сцен, старт/стоп трансляції та запису — без alt-tab.
// Реалізовано напряму через ws, щоб не тягнути ще одну залежність.
// ============================================================
let obsWs = null;
let obsReqId = 0;
const obsPending = new Map();
let obsScenes = [];
let obsCurrentScene = '';

function obsNotify(payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('obs-state', payload);
}

function obsRequest(type, data) {
  return new Promise((resolve, reject) => {
    if (!obsWs || obsWs.readyState !== WebSocket.OPEN) return reject(new Error('OBS не підключено'));
    const id = String(++obsReqId);
    obsPending.set(id, { resolve, reject });
    obsWs.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
    setTimeout(() => {
      if (obsPending.has(id)) { obsPending.delete(id); reject(new Error('OBS не відповів')); }
    }, 5000);
  });
}

ipcMain.handle('obs-connect', (event, { url, password }) => {
  return new Promise((resolve) => {
    try {
      if (obsWs) { try { obsWs.close(); } catch (e) {} }
      obsWs = new WebSocket(url || 'ws://127.0.0.1:4455');
    } catch (e) {
      resolve({ ok: false, error: 'Невірна адреса' });
      return;
    }

    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };

    obsWs.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }

      // Hello → Identify (з автентифікацією, якщо OBS її вимагає)
      if (msg.op === 0) {
        const d = { rpcVersion: 1, eventSubscriptions: 33 };
        const auth = msg.d && msg.d.authentication;
        if (auth) {
          const secret = crypto.createHash('sha256')
            .update((password || '') + auth.salt).digest('base64');
          d.authentication = crypto.createHash('sha256')
            .update(secret + auth.challenge).digest('base64');
        }
        obsWs.send(JSON.stringify({ op: 1, d: d }));
        return;
      }

      // Identified → готово
      if (msg.op === 2) {
        try {
          const list = await obsRequest('GetSceneList');
          obsScenes = (list.scenes || []).map(s => s.sceneName).reverse();
          obsCurrentScene = list.currentProgramSceneName || '';
          obsNotify({ connected: true, scenes: obsScenes, current: obsCurrentScene });
          done({ ok: true, scenes: obsScenes, current: obsCurrentScene });
        } catch (e) {
          done({ ok: true, scenes: [], current: '' });
        }
        return;
      }

      // Відповідь на запит
      if (msg.op === 7) {
        const p = obsPending.get(msg.d.requestId);
        if (!p) return;
        obsPending.delete(msg.d.requestId);
        if (msg.d.requestStatus && msg.d.requestStatus.result) p.resolve(msg.d.responseData || {});
        else p.reject(new Error((msg.d.requestStatus && msg.d.requestStatus.comment) || 'OBS помилка'));
        return;
      }

      // Події (зміна сцени, старт/стоп запису)
      if (msg.op === 5) {
        const t = msg.d.eventType;
        if (t === 'CurrentProgramSceneChanged') {
          obsCurrentScene = msg.d.eventData.sceneName;
          obsNotify({ connected: true, current: obsCurrentScene, scenes: obsScenes });
        } else if (t === 'RecordStateChanged' || t === 'StreamStateChanged') {
          obsNotify({ connected: true, current: obsCurrentScene, scenes: obsScenes,
                      recording: t === 'RecordStateChanged' ? msg.d.eventData.outputActive : undefined,
                      streaming: t === 'StreamStateChanged' ? msg.d.eventData.outputActive : undefined });
        }
      }
    });

    obsWs.on('error', () => { obsNotify({ connected: false }); done({ ok: false, error: 'Не вдалось підключитись до OBS' }); });
    obsWs.on('close', () => { obsNotify({ connected: false }); done({ ok: false, error: 'OBS відключено' }); });
  });
});

ipcMain.handle('obs-disconnect', () => {
  if (obsWs) { try { obsWs.close(); } catch (e) {} obsWs = null; }
  obsNotify({ connected: false });
  return 'ok';
});

ipcMain.handle('obs-action', async (event, { action, value }) => {
  try {
    if (action === 'scene')            await obsRequest('SetCurrentProgramScene', { sceneName: value });
    else if (action === 'stream-start') await obsRequest('StartStream');
    else if (action === 'stream-stop')  await obsRequest('StopStream');
    else if (action === 'record-start') await obsRequest('StartRecord');
    else if (action === 'record-stop')  await obsRequest('StopRecord');
    else if (action === 'scenes') {
      const list = await obsRequest('GetSceneList');
      obsScenes = (list.scenes || []).map(s => s.sceneName).reverse();
      obsCurrentScene = list.currentProgramSceneName || '';
      return { ok: true, scenes: obsScenes, current: obsCurrentScene };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});


// ============================================================
// МОНІТОРИ: ідентифікація, тестова сітка, реакція на зміни
// ============================================================

// «Показати номери» — на кожному екрані спалахує великий номер.
// Без цього оператор не знає, який фізичний екран є «Монітор 2».
let identifyWins = [];
ipcMain.handle('blackout', (event, on) => {
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.webContents.send('blackout', !!on);
  });
  return 'ok';
});
ipcMain.handle('set-master-volume', (event, v) => {
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.webContents.send('master-volume', v);
  });
  return 'ok';
});
ipcMain.handle('send-stage-timer', (event, data) => {
  // Таймер проповіді — лише на екран сцени (stage display), не в зал
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.webContents.send('stage-timer', data);
  });
  return 'ok';
});
// Позначити (чи зняти позначку) конкретний вихід «екраном сцени» — таймер
// проповіді тоді накладається саме на нього. Лише один вихід буває сценою
// одночасно, тож знімаємо прапорець зі старого перед тим, як ставити новий.
ipcMain.handle('set-stage-output', (event, kind) => {
  if (stageOutputKind && stageOutputKind !== kind) {
    const prev = outputWins[stageOutputKind];
    if (prev && !prev.isDestroyed()) prev.webContents.send('stage-flag', false);
  }
  stageOutputKind = kind || null;
  if (stageOutputKind) {
    const w = outputWins[stageOutputKind];
    if (w && !w.isDestroyed()) w.webContents.send('stage-flag', true);
  }
  return { ok: true, stageOutputKind };
});

// ---- Stage Monitor (окреме вікно, не плутати з set-stage-output вище) ----
ipcMain.handle('open-stage-window', () => { createStageWindow(); return { ok: true }; });
ipcMain.handle('close-stage-window', () => { closeStageWindow(); return { ok: true }; });
ipcMain.handle('stage-window-status', () => ({ open: !!(stageWin && !stageWin.isDestroyed()) }));
ipcMain.handle('stage-content-update', (event, data) => {
  if (stageWin && !stageWin.isDestroyed()) stageWin.webContents.send('stage-content', data);
  return 'ok';
});
ipcMain.handle('set-stage-monitor', (event, displayId) => {
  stageDisplayId = displayId || null;
  if (stageWin && !stageWin.isDestroyed() && stageDisplayId) {
    const d = screen.getAllDisplays().find(x => x.id === stageDisplayId);
    if (d) {
      stageWin.setFullScreen(false);
      stageWin.setBounds(d.bounds);
      stageWin.setFullScreen(true);
    }
  }
  return { ok: true };
});
ipcMain.handle('bind-stage-monitor-fingerprint', (event, fingerprint) => {
  stageFingerprint = fingerprint || null;
  const d = fingerprint ? findDisplayByFingerprint(fingerprint) : null;
  if (d) stageDisplayId = d.id;
  return { id: d ? d.id : null };
});

ipcMain.handle('set-auto-launch', (event, on) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!on });
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('identify-displays', (event, seconds) => {
  identifyWins.forEach(w => { try { w.close(); } catch (e) {} });
  identifyWins = [];

  const primary = screen.getPrimaryDisplay();
  const operator = mainWin && !mainWin.isDestroyed()
    ? screen.getDisplayMatching(mainWin.getBounds()) : primary;

  screen.getAllDisplays().forEach((d, i) => {
    const w = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      frame: false, transparent: false, alwaysOnTop: true, skipTaskbar: true,
      focusable: false, resizable: false, backgroundColor: '#101018',
      webPreferences: { contextIsolation: true }
    });
    const isOp = d.id === operator.id;
    const label = isOp ? 'ЦЕ ЕКРАН ОПЕРАТОРА' : (d.bounds.width + '×' + d.bounds.height);
    const color = isOp ? '#f56565' : '#7c6af7';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
           background:#101018;color:#fff;font-family:Segoe UI,Arial,sans-serif}
      .n{font-size:22vh;font-weight:800;color:${color};line-height:1}
      .s{font-size:3.2vh;color:#8b92a8;margin-top:2vh;letter-spacing:2px}
      .b{margin-top:3vh;font-size:2.6vh;color:${color};border:2px solid ${color};border-radius:10px;padding:8px 20px}
    </style></head><body>
      <div class="n">${i + 1}</div>
      <div class="s">${label}</div>
      <div class="b">${d.scaleFactor !== 1 ? 'масштаб ' + Math.round(d.scaleFactor * 100) + '%' : 'масштаб 100%'}</div>
    </body></html>`;
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    hardenContentWindow(w);
    w.setAlwaysOnTop(true, 'screen-saver');
    identifyWins.push(w);
  });

  setTimeout(() => {
    identifyWins.forEach(w => { try { if (!w.isDestroyed()) w.close(); } catch (e) {} });
    identifyWins = [];
  }, (seconds || 4) * 1000);

  return 'ok';
});

// Тестова сітка — навести проектор, перевірити краї та фокус
ipcMain.handle('test-pattern', (event, { kind, on }) => {
  const targets = kind && OUTPUT_KINDS.includes(kind) ? [kind] : OUTPUT_KINDS;
  targets.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.webContents.send('test-pattern', !!on);
  });
  return 'ok';
});

// Прив'язка виходу до монітора за «відбитком» — переживає перезавантаження
ipcMain.handle('bind-output-fingerprint', (event, { kind, fingerprint }) => {
  if (!OUTPUT_KINDS.includes(kind)) return null;
  outputConfig[kind + 'Fingerprint'] = fingerprint || null;
  const d = fingerprint ? findDisplayByFingerprint(fingerprint) : null;
  if (d) outputConfig[kind + 'DisplayId'] = d.id;
  return { id: d ? d.id : null };
});

// Відновлення прив'язок після перезапуску (id інші, відбитки ті самі)
ipcMain.handle('restore-output-bindings', (event, map) => {
  const res = {};
  OUTPUT_KINDS.forEach(k => {
    const fp = map && map[k];
    if (!fp) return;
    outputConfig[k + 'Fingerprint'] = fp;
    const d = findDisplayByFingerprint(fp);
    if (d) { outputConfig[k + 'DisplayId'] = d.id; res[k] = d.id; }
  });
  return res;
});


// ============================================================
// ЛОГ ПОМИЛОК для діагностики на церковному ПК
// ============================================================
const logPath = path.join(app.getPath('userData'), 'church-errors.log');
function logError(where, err) {
  try {
    const line = '[' + new Date().toISOString() + '] ' + where + ': ' +
      (err && err.stack ? err.stack : String(err)) + '\n';
    fs.appendFileSync(logPath, line);
  } catch (e) {}
}
process.on('uncaughtException', (err) => logError('uncaughtException', err));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

ipcMain.handle('log-error', (event, { where, message }) => { logError(where || 'renderer', message); return 'ok'; });
ipcMain.handle('get-log-path', () => logPath);
ipcMain.handle('read-log', () => {
  try { return fs.readFileSync(logPath, 'utf8').split('\n').slice(-200).join('\n'); }
  catch (e) { return ''; }
});
ipcMain.handle('clear-log', () => { try { fs.writeFileSync(logPath, ''); } catch (e) {} return 'ok'; });
ipcMain.handle('open-log-folder', () => { try { require('electron').shell.showItemInFolder(logPath); } catch (e) {} return 'ok'; });


// ---- Автоматичний бекап за розкладом ----

// ============================================================
// КЕШ ЗОВНІШНІХ БІБЛІОТЕК
// QR-генератор і PDF беруться з інтернету. Раз завантаживши, зберігаємо
// копію на диск — далі програма працює без мережі (важливо для залу).
// ============================================================
const assetDir = path.join(app.getPath('userData'), 'assets');
function assetFile(name) {
  return path.join(assetDir, String(name).replace(/[^a-zA-Z0-9._-]/g, '_'));
}
ipcMain.handle('cache-asset', (event, { name, content }) => {
  try {
    if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(assetFile(name), String(content || ''), 'utf8');
    return { ok: true };
  } catch (e) { logError('cache-asset', e); return { ok: false }; }
});
ipcMain.handle('read-cached-asset', (event, name) => {
  try {
    const f = assetFile(name);
    if (!fs.existsSync(f)) return null;
    const txt = fs.readFileSync(f, 'utf8');
    return txt && txt.length > 100 ? txt : null;   // порожній/битий кеш ігноруємо
  } catch (e) { return null; }
});


// ============================================================
// ВЕЛИКІ ДАНІ — У ФАЙЛАХ, А НЕ В БРАУЗЕРНОМУ СХОВИЩІ
// Переклади Біблії, фони, шрифти, вшиті фото легко перевищують ліміт ~5 МБ.
// Тут вони зберігаються файлами в теці програми — обмеження зникає.
// Читання синхронне, щоб не переписувати весь наявний код.
// ============================================================
const dataDir = path.join(app.getPath('userData'), 'data');
function dataFile(key) {
  return path.join(dataDir, String(key).replace(/[^a-zA-Z0-9._-]/g, '_') + '.json');
}
ipcMain.on('data-read-sync', (event, key) => {
  try {
    const f = dataFile(key);
    event.returnValue = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  } catch (e) { event.returnValue = null; }
});
// ФІКС: раніше запис/видалення були fs.writeFileSync/unlinkSync на каналі
// sendSync — це БЛОКУВАЛО весь застосунок (рендерер чекає, а сам головний
// процес теж синхронно пише на диск, тож і вивід на проектор/трансляцію
// теж завмирав на цей час). З базою 3300+ пісень кожне збереження — це
// кілька мегабайт, тож підвисання були відчутні, особливо на Windows.
// Тепер пишемо асинхронно (fs.writeFile) на окремому "async"-каналі, куди
// рендерер лише «стукає» (send, не sendSync) — не чекаючи відповіді.
ipcMain.on('data-write-async', (event, { key, content }) => {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    pendingDataWrites++;
    fs.writeFile(dataFile(key), String(content == null ? '' : content), 'utf8', (err) => {
      pendingDataWrites--;
      if (err) logError('data-write-async', err);
      maybeFinishQuit();
    });
  } catch (e) { logError('data-write-async', e); }
});
ipcMain.on('data-delete-async', (event, key) => {
  try {
    const f = dataFile(key);
    pendingDataWrites++;
    fs.unlink(f, (err) => {
      pendingDataWrites--;
      if (err && err.code !== 'ENOENT') logError('data-delete-async', err);
      maybeFinishQuit();
    });
  } catch (e) { logError('data-delete-async', e); }
});
ipcMain.handle('open-data-folder', () => {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    require('electron').shell.openPath(dataDir);
  } catch (e) {}
  return 'ok';
});

ipcMain.handle('write-auto-backup', (event, jsonStr) => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'auto-backup-' + new Date().toISOString().slice(0, 10) + '.json');
    fs.writeFileSync(file, jsonStr);
    // тримаємо останні 10 автобекапів
    const all = fs.readdirSync(dir).filter(f => f.indexOf('auto-backup-') === 0).sort();
    while (all.length > 10) { try { fs.unlinkSync(path.join(dir, all.shift())); } catch (e) {} }
    return { ok: true, file: file };
  } catch (e) { logError('auto-backup', e); return { ok: false, error: String(e) }; }
});
ipcMain.handle('open-backup-folder', () => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    require('electron').shell.openPath(dir);
  } catch (e) {}
  return 'ok';
});

// ---- Синхронізація з хмарною папкою (Dropbox/Drive/OneDrive) ----
const syncCfgFile = path.join(app.getPath('userData'), 'cloud-sync.json');
let cloudSyncFolder = '';
function loadCloudSyncFolder() {
  try {
    if (fs.existsSync(syncCfgFile)) {
      const cfg = JSON.parse(fs.readFileSync(syncCfgFile, 'utf8'));
      cloudSyncFolder = cfg.folder || '';
    }
  } catch (e) {}
}
function saveCloudSyncFolder(folder) {
  cloudSyncFolder = folder;
  try {
    fs.writeFileSync(syncCfgFile, JSON.stringify({ folder: folder }), 'utf8');
  } catch (e) {}
}
ipcMain.handle('pick-cloud-sync-folder', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWin, {
      properties: ['openDirectory'],
      title: 'Вибрати папку синхронізації (Dropbox/Google Drive/OneDrive)'
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folder = result.filePaths[0];
    saveCloudSyncFolder(folder);
    return folder;
  } catch (e) { return null; }
});
ipcMain.handle('get-cloud-sync-folder', () => cloudSyncFolder);
ipcMain.handle('sync-to-cloud', (event, libraryJson) => {
  if (!cloudSyncFolder) return { status: 'no-folder' };
  try {
    const file = path.join(cloudSyncFolder, 'church-library.json');
    fs.writeFileSync(file, JSON.stringify(libraryJson), 'utf8');
    return { status: 'ok', path: file };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
});
ipcMain.handle('sync-from-cloud', () => {
  if (!cloudSyncFolder) return { status: 'no-folder' };
  try {
    const file = path.join(cloudSyncFolder, 'church-library.json');
    if (!fs.existsSync(file)) return { status: 'not-found' };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { status: 'ok', data: data };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
});

// ============================================================
// СПОСТЕРЕЖЕННЯ ЗА ТЕКОЮ (chokidar) — автоматично помічає нові файли
// пісень/медіа, скинуті туди (напр. з флешки чи спільної теки), і
// повідомляє оператора, щоб він переглянув і імпортував — БЕЗ сліпого
// автододавання (щоб не зловити недописаний файл і не створити дублікат
// в обхід діалогу підтвердження). Лінива залежність: без `npm install`
// спостереження просто не стартує, решта застосунку працює як завжди.
// ============================================================
const watchCfgFile = path.join(app.getPath('userData'), 'watch-folder.json');
let watchFolderPath = '';
let watchFolderInstance = null;
const WATCH_SONG_EXTS = ['json', 'xml', 'sng', 'cho', 'chordpro', 'crd', 'pro', 'pro4', 'pro5', 'pro6', 'csv', 'tsv', 'txt'];

function loadWatchFolder() {
  try {
    if (fs.existsSync(watchCfgFile)) {
      const cfg = JSON.parse(fs.readFileSync(watchCfgFile, 'utf8'));
      watchFolderPath = cfg.folder || '';
    }
  } catch (e) {}
}
function saveWatchFolderPath(folder) {
  watchFolderPath = folder;
  try { fs.writeFileSync(watchCfgFile, JSON.stringify({ folder: folder }), 'utf8'); } catch (e) {}
}
function readTextWithFallback(filePath) {
  const buf = fs.readFileSync(filePath);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { try { return new TextDecoder('windows-1251').decode(buf); } catch (e2) { return buf.toString('utf8'); } }
}
function stopWatchingFolder() {
  if (watchFolderInstance) { try { watchFolderInstance.close(); } catch (e) {} watchFolderInstance = null; }
}
function startWatchingFolder(folder) {
  stopWatchingFolder();
  if (!folder) return;
  let chokidar;
  try { chokidar = require('chokidar'); }
  catch (e) { logError('watchFolder', new Error('Немає chokidar — виконай `npm install`')); return; }
  try {
    watchFolderInstance = chokidar.watch(folder, {
      ignoreInitial: true,   // не сповіщати про файли, що вже лежали в теці на момент старту
      depth: 0,               // лише файли верхнього рівня теки, без підтек
      awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 }   // чекаємо, поки файл ДОПИШЕТЬСЯ (флешка/копіювання)
    });
    let batch = [];
    let batchTimer = null;
    function flushBatch() {
      if (!batch.length || !mainWin || mainWin.isDestroyed()) { batch = []; return; }
      mainWin.webContents.send('watch-folder-new-files', batch);
      batch = [];
    }
    watchFolderInstance.on('add', (filePath) => {
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const name = path.basename(filePath);
      if (WATCH_SONG_EXTS.includes(ext)) {
        let text = '';
        try { text = readTextWithFallback(filePath); } catch (e) { return; }
        batch.push({ name: name, path: filePath, text: text, kind: 'song' });
      } else {
        batch.push({ name: name, path: filePath, kind: 'other' });
      }
      clearTimeout(batchTimer);
      batchTimer = setTimeout(flushBatch, 800);   // групуємо, якщо кілька файлів скинули одночасно
    });
    watchFolderInstance.on('error', (err) => {
      logError('watchFolder', err);
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('watch-folder-error', { message: err.message });
    });
  } catch (e) { logError('watchFolder-start', e); }
}

ipcMain.handle('pick-watch-folder', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWin, {
      properties: ['openDirectory'],
      title: 'Обрати теку для автоматичного виявлення нових пісень/медіа'
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folder = result.filePaths[0];
    saveWatchFolderPath(folder);
    startWatchingFolder(folder);
    return folder;
  } catch (e) { return null; }
});
ipcMain.handle('get-watch-folder', () => watchFolderPath);
ipcMain.handle('stop-watch-folder', () => {
  stopWatchingFolder();
  saveWatchFolderPath('');
  return 'ok';
});

// ============================================================
// IPC HANDLERS
// ============================================================
ipcMain.handle('open-projector', () => {
  return new Promise((resolve) => createOutputWindow('projector', () => resolve('opened')));
});
ipcMain.handle('close-projector', () => {
  if (outputWins.projector && !outputWins.projector.isDestroyed()) { outputWins.projector.__intentionalClose = true; outputWins.projector.close(); }
  return 'closed';
});
ipcMain.handle('projector-status', () => {
  return outputWins.projector && !outputWins.projector.isDestroyed() ? 'open' : 'closed';
});

ipcMain.handle('open-stream', () => {
  return new Promise((resolve) => createOutputWindow('stream', () => resolve('opened')));
});
ipcMain.handle('close-stream', () => {
  if (outputWins.stream && !outputWins.stream.isDestroyed()) { outputWins.stream.__intentionalClose = true; outputWins.stream.close(); }
  return 'closed';
});
ipcMain.handle('stream-status', () => {
  return outputWins.stream && !outputWins.stream.isDestroyed() ? 'open' : 'closed';
});

// Відкрити обидва одночасно
ipcMain.handle('open-both-outputs', () => {
  return new Promise((resolve) => {
    let done = 0;
    const check = () => { done++; if (done === 2) resolve('opened'); };
    createOutputWindow('projector', check);
    createOutputWindow('stream', check);
  });
});

ipcMain.handle('send-to-projector', (event, { type, payload }) => {
  const data = { type, payload };
  const projReady = outputWins.projector && !outputWins.projector.isDestroyed();
  const streamReady = outputWins.stream && !outputWins.stream.isDestroyed();

  if (!projReady && !streamReady) {
    // Жодного вікна нема — відкриваємо обидва і чекаємо
    pendingDisplay = data;
    createOutputWindow('projector');
    createOutputWindow('stream');
  } else {
    broadcastDisplay(data);
  }
  broadcastToRemote({ action: 'display', data });
  return 'sent';
});

ipcMain.handle('clear-projector', () => {
  broadcastAllOutputs({ type: 'clear' }); // очищаємо всі 4, навіть із власним маршрутом
  broadcastToRemote({ action: 'display', data: { type: 'clear' } });
  return 'cleared';
});

// DISPLAYS CONFIG
ipcMain.handle('get-displays', () => getDisplaysList());

ipcMain.handle('set-output-display', (event, { kind, displayId }) => {
  if (!OUTPUT_KINDS.includes(kind)) return outputConfig;

  // displayId === null означає «None» — вихід вимкнено, вікно закриваємо
  if (displayId === null || displayId === undefined) {
    outputConfig[kind + 'DisplayId'] = null;
    // Скидаємо й «відбиток» — інакше після перезапуску restoreOutputBindings
    // (див. IPC bind-output-fingerprint/restore-output-bindings) тихо поверне
    // стару прив'язку з вкладки «Прив'язка екранів», і вибір «Авто»/None
    // зроблений тут не переживе перезапуск.
    outputConfig[kind + 'Fingerprint'] = null;
    const w = outputWins[kind];
    if (w && !w.isDestroyed()) { w.__intentionalClose = true; w.close(); }
    return outputConfig;
  }

  // Монітор оператора не можна віддавати під вивід — інакше зал побачить панель керування.
  // SoftProjector про це лише попереджає в довідці; ми блокуємо програмно.
  const operatorDisplay = mainWin && !mainWin.isDestroyed()
    ? screen.getDisplayMatching(mainWin.getBounds())
    : screen.getPrimaryDisplay();
  const all = screen.getAllDisplays();
  if (displayId === operatorDisplay.id && all.length > 1 && !outputConfig.singleScreenMode) {
    return { error: 'operator-display', message: 'Це монітор оператора — на нього не можна виводити' };
  }

  outputConfig[kind + 'DisplayId'] = displayId;
  // Дві вкладки керують одним і тим самим outputConfig[kind+'DisplayId']:
  // цей обробник (випадаючий список монітора у «Виходи») і bind-output-fingerprint
  // (кнопки-«галочки» у «Прив'язка екранів»). Без синхронізації нижче вибір
  // тут пережив би тільки поточний сеанс — при наступному запуску
  // restoreOutputBindings підняв би СТАРИЙ відбиток із «Прив'язки екранів»
  // і тихо повернув би вихід не туди, куди його щойно поставили тут.
  const targetDisplay = all.find(d => d.id === displayId);
  outputConfig[kind + 'Fingerprint'] = targetDisplay ? displayFingerprint(targetDisplay) : null;

  // Якщо вікно вже відкрите — одразу переносимо його на новий монітор
  const w = outputWins[kind];
  const target = all.find(d => d.id === displayId);
  if (w && !w.isDestroyed() && target) {
    w.setFullScreen(false);
    w.setBounds(target.bounds);
    setTimeout(() => { if (!w.isDestroyed()) w.setFullScreen(true); }, 120);
  }
  return outputConfig;
});

// Вікна виводу поверх усіх програм
ipcMain.handle('set-always-on-top', (event, on) => {
  outputConfig.alwaysOnTop = !!on;
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.setAlwaysOnTop(!!on, 'screen-saver');
  });
  return outputConfig.alwaysOnTop;
});

// Режим одного монітора: вивід відкривається лише «в ефір», з екранними кнопками
ipcMain.handle('set-single-screen', (event, { on, controls }) => {
  outputConfig.singleScreenMode = !!on;
  if (controls) outputConfig.controls = Object.assign(outputConfig.controls, controls);
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) {
      w.webContents.send('set-controls', outputConfig.singleScreenMode ? outputConfig.controls : null);
    }
  });
  return { singleScreenMode: outputConfig.singleScreenMode, controls: outputConfig.controls };
});

// Кнопки на екрані виводу шлють команди назад у панель керування
ipcMain.on('logo-auto-hidden', (event) => {
  // Визначаємо, З ЯКОГО САМЕ виходу прийшла подія — порівнюємо webContents
  // відправника з мапою відкритих вікон (кожен вихід автоматично ховає
  // логотип НЕЗАЛЕЖНО, тож рендереру треба знати саме котрий).
  const kind = OUTPUT_KINDS.find(k => outputWins[k] && !outputWins[k].isDestroyed() && outputWins[k].webContents === event.sender) || null;
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('logo-auto-hidden', kind);
});

ipcMain.on('display-control', (event, action) => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('display-control', action);
});

// Команди GDD-графіці (update/play/stop) — без перезавантаження оверлея,
// тож таймери й анімації всередині графіки не збиваються.
ipcMain.handle('gdd-command', (event, { kind, action, data }) => {
  const targets = kind && OUTPUT_KINDS.includes(kind) ? [kind] : OUTPUT_KINDS;
  targets.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.webContents.send('gdd', { action, data });
  });
  return 'sent';
});

ipcMain.handle('set-autofit', (event, on) => {
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.webContents.send('set-autofit', !!on);
  });
  return !!on;
});

// ---- Шари екрана: відео-фон, логотип, заморозка, оголошення поверх ----
function sendToOutputs(channel, payload, kind) {
  const targets = kind && OUTPUT_KINDS.includes(kind) ? [kind] : OUTPUT_KINDS;
  targets.forEach(k => {
    const w = outputWins[k];
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  });
}

ipcMain.handle('set-fit-group', (event, { slides, kind }) => { sendToOutputs('set-fit-group', slides, kind); return 'ok'; });
ipcMain.handle('set-locked-size', (event, { size, kind }) => { sendToOutputs('set-locked-size', size, kind); return 'ok'; });
ipcMain.handle('set-bg-video', (event, { cfg, kind }) => { sendToOutputs('set-bg-video', cfg, kind); return 'ok'; });
ipcMain.handle('show-logo',    (event, { dataUrl, kind }) => { sendToOutputs('show-logo', dataUrl, kind); return 'ok'; });
// Постійний водяний знак — окремий, незалежний шар: на відміну від логотипа
// його НЕ торкається логіка автоприбирання при новому контенті (проектор-preload
// має для нього окремий, ніколи не чіпаний слухач), тож він лишається поверх
// усього, поки оператор не вимкне явно.
ipcMain.handle('show-watermark', (event, { cfg, kind }) => { sendToOutputs('watermark', cfg, kind); return 'ok'; });
ipcMain.handle('freeze-output',(event, { on, kind }) => { sendToOutputs('freeze', !!on, kind); return 'ok'; });
ipcMain.handle('send-alert',   (event, { cfg, kind }) => { sendToOutputs('alert', cfg, kind); return 'ok'; });

ipcMain.handle('get-output-config', () => outputConfig);

// Які виходи працюють у режимі «дзеркало» (решта отримує власний контент)
ipcMain.handle('set-mirror-kinds', (event, kinds) => {
  outputConfig.mirrorKinds = Array.isArray(kinds) ? kinds.filter(k => OUTPUT_KINDS.includes(k)) : OUTPUT_KINDS.slice();
  return outputConfig.mirrorKinds;
});

// ============================================================
// 4 ВИХОДИ: відкриття/закриття/статус/адресна відправка
// ============================================================
ipcMain.handle('open-output', (event, kind) => {
  return new Promise((resolve) => createOutputWindow(kind, () => resolve('opened')));
});

ipcMain.handle('close-output', (event, kind) => {
  const w = outputWins[kind];
  // Явне закриття з самої програми (кнопка «Закрити»/«Закрити всі виходи») —
  // не питаємо підтвердження, навіть якщо там зараз щось в ефірі. Питання
  // «закрити вихід з ефіром?» (див. createOutputWindow) — лише для
  // НЕОЧІКУВАНОГО закриття вікна напряму (Cmd+W/Alt+F4), не для цього шляху.
  if (w) w.__intentionalClose = true;
  if (w && !w.isDestroyed()) w.close();
  return 'closed';
});

ipcMain.handle('output-status', (event, kind) => {
  const w = outputWins[kind];
  return w && !w.isDestroyed() ? 'open' : 'closed';
});

ipcMain.handle('outputs-status', () => {
  const res = {};
  OUTPUT_KINDS.forEach(k => {
    const w = outputWins[k];
    res[k] = w && !w.isDestroyed() ? 'open' : 'closed';
  });
  return res;
});

// Відправка контенту НА КОНКРЕТНИЙ вихід (а не на всі)
ipcMain.handle('send-to-output', (event, { kind, type, payload }) => {
  const w = outputWins[kind];
  const data = { type, payload };
  lastContentByKind[kind] = data;
  if (w && !w.isDestroyed() && !w.webContents.isLoading()) {
    w.webContents.send('display', data);
    return 'sent';
  }
  // Вікно закрите — відкриваємо і шлемо після завантаження
  createOutputWindow(kind, () => {
    const w2 = outputWins[kind];
    if (w2 && !w2.isDestroyed()) {
      setTimeout(() => w2.webContents.send('display', data), 200);
    }
  });
  return 'opening';
});

// Фон виходу за кодом кольору: '#00ff00', '#1a1a2e' тощо; null/'' = фон теми
ipcMain.handle('set-output-bg', (event, { kind, color, animated }) => {
  if (!OUTPUT_KINDS.includes(kind)) return outputConfig.bg;
  outputConfig.bg[kind] = color || null;
  outputConfig.bgAnimated[kind] = !!animated;
  const w = outputWins[kind];
  if (w && !w.isDestroyed()) w.webContents.send('set-bg', outputConfig.bg[kind], outputConfig.bgAnimated[kind]);
  return outputConfig.bg;
});

// CHROMA KEY — для будь-якого з 4 виходів
ipcMain.handle('set-output-chroma', (event, { kind, color }) => {
  if (!OUTPUT_KINDS.includes(kind)) return outputConfig.chroma;
  outputConfig.chroma[kind] = color || 'none';
  if (kind === 'stream') outputConfig.streamChroma = outputConfig.chroma.stream; // сумісність
  const w = outputWins[kind];
  if (w && !w.isDestroyed()) w.webContents.send('set-chroma', outputConfig.chroma[kind]);
  return outputConfig.chroma;
});

// Старий виклик — лишаємо, щоб не ламати наявний UI трансляції
ipcMain.handle('set-stream-chroma', (event, color) => {
  outputConfig.chroma.stream = color || 'none';
  outputConfig.streamChroma = outputConfig.chroma.stream;
  const w = outputWins.stream;
  if (w && !w.isDestroyed()) w.webContents.send('set-chroma', outputConfig.chroma.stream);
  return outputConfig.streamChroma;
});

// screen listeners moved inside app.whenReady (see below)

// BROADCAST STATE (для remote телефону)
let lastRemoteState = {};
ipcMain.handle('broadcast-state', (event, state) => {
  lastRemoteState = state;
  broadcastToRemote({ action: 'state', data: state });
  return 'ok';
});

// ============================================================
// СТАНЦІЇ: ХОСТ + КЛІЄНТИ
// Хост — ПК біля проектора, лише він керує вікнами виводу.
// Клієнти (другий ПК, планшети) шлють йому команди і отримують стан.
// Стара «синхронізація» була неробоча: сервер нічого не розсилав,
// а клієнт виводив контент на власний проектор замість хостового.
// ============================================================
let syncServer = null;
let syncWss = null;
const syncPort = 4242;
let stationPin = '';          // порожньо = без пароля
let stationClients = [];      // [{ws, name, role, id}]

// ---- OSC-тригери (винесено в src/main/osc.js) ----
const oscModule = require('./src/main/osc');
oscModule.register(ipcMain, () => mainWin);
let stationSeq = 0;

function stationList() {
  return stationClients.map(c => ({ id: c.id, name: c.name, role: c.role }));
}
function notifyHostOfClients() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('station-clients', stationList());
  }
}
function broadcastToStations(msg, exceptWs) {
  if (!syncWss) return;
  const str = JSON.stringify(msg);
  syncWss.clients.forEach(c => {
    if (c !== exceptWs && c.readyState === WebSocket.OPEN) c.send(str);
  });
}

ipcMain.handle('start-sync-server', (event, opts) => {
  // Сервер уже працює — не міняємо PIN під ногами у вже підключених станцій,
  // просто повертаємо поточний стан (якщо явно не попросили новий PIN).
  if (syncServer) {
    if (opts && opts.pin) stationPin = opts.pin;
    return { port: syncPort, ip: getLocalIP(), ips: getAllLocalIPs().map(c => c.address), pin: stationPin };
  }
  stationPin = (opts && opts.pin) || '';
  // Без явно заданого PIN не лишаємо сервер відкритим для будь-кого в мережі —
  // генеруємо власний PIN і показуємо його оператору. crypto.randomInt() —
  // криптографічно стійке джерело випадковості (на відміну від Math.random(),
  // який не призначений для нічого, де передбачуваність має значення).
  if (!stationPin) stationPin = String(crypto.randomInt(1000, 10000));

  const http = require('http');
  syncServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Church Projector — станція-хост активна');
  });
  syncWss = new WebSocket.Server({ server: syncServer });

  syncWss.on('connection', (ws) => {
    ws._authed = !stationPin;   // без пароля — одразу авторизований
    ws._id = ++stationSeq;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }

      // Авторизація
      if (msg.type === 'hello') {
        if (stationPin && msg.pin !== stationPin) {
          ws.send(JSON.stringify({ type: 'denied', reason: 'Невірний пароль' }));
          setTimeout(() => ws.close(), 200);
          return;
        }
        ws._authed = true;
        ws._name = msg.name || ('Станція ' + ws._id);
        ws._role = msg.role || 'panel';
        stationClients = stationClients.filter(c => c.ws !== ws);
        stationClients.push({ ws: ws, id: ws._id, name: ws._name, role: ws._role });
        ws.send(JSON.stringify({ type: 'welcome', id: ws._id }));
        if (lastRemoteState) ws.send(JSON.stringify({ type: 'state', data: lastRemoteState }));
        notifyHostOfClients();
        return;
      }
      if (!ws._authed) return;

      // Команда від клієнта → виконує ХОСТ (у нього вікна виводу).
      // Allow-list дій, синхронний зі switch у applyStationCommand (extras-3.js) —
      // сервер не має пересилати те, що там і так впаде в default:return, і не
      // пересилає надто великий/дивний payload (захист від засмічення хоста).
      if (msg.type === 'cmd') {
        const allowedActions = ['send-text', 'send-html', 'stage', 'go-live', 'clear',
          'blackout', 'next', 'prev', 'bookmark', 'plan-item', 'announce', 'gdd', 'alert', 'freeze'];
        const payloadOk = msg.payload == null || (typeof msg.payload === 'object' && !Array.isArray(msg.payload));
        if (typeof msg.action === 'string' && allowedActions.indexOf(msg.action) >= 0 &&
            payloadOk && raw.length < 5 * 1024 * 1024) {
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('station-command', {
              action: msg.action, payload: msg.payload,
              from: ws._name || ('Станція ' + ws._id)
            });
          }
        }
      }
    });

    ws.on('close', () => {
      stationClients = stationClients.filter(c => c.ws !== ws);
      notifyHostOfClients();
    });
  });

  // Без цього обробника зайнятий порт (EADDRINUSE) валить головний процес Electron
  syncServer.on('error', (err) => {
    console.error('Сервер станцій не стартував:', err.code);
    try { if (syncWss) syncWss.close(); } catch (e) {}
    syncServer = null; syncWss = null;
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('station-error', {
        code: err.code,
        message: err.code === 'EADDRINUSE'
          ? 'Порт ' + syncPort + ' зайнятий — можливо, програма вже запущена'
          : 'Не вдалось запустити сервер: ' + err.code
      });
    }
  });

  syncServer.listen(syncPort);
  return { port: syncPort, ip: getLocalIP(), ips: getAllLocalIPs().map(c => c.address), pin: stationPin };
});

ipcMain.handle('stop-sync-server', () => {
  if (syncWss) { syncWss.close(); syncWss = null; }
  if (syncServer) { syncServer.close(); syncServer = null; }
  stationClients = [];
  notifyHostOfClients();
  return 'stopped';
});

ipcMain.handle('station-clients', () => stationList());

// ---- OSC-тригери (IPC хендлери вже зареєстровані через oscModule.register() вище) ----

// Хост розсилає свій стан усім станціям і пультам
ipcMain.handle('station-broadcast', (event, msg) => {
  broadcastToStations(msg);
  broadcastToRemote({ action: 'state', data: msg && msg.data });
  return 'ok';
});

// THEME
ipcMain.handle('set-theme', (event, theme) => {
  currentTheme = { ...currentTheme, ...theme };
  broadcastTheme(currentTheme);
  broadcastToRemote({ action: 'theme', data: currentTheme });
  return 'ok';
});
ipcMain.handle('get-theme', () => currentTheme);

// REMOTE SERVER
ipcMain.handle('start-remote', (event, pin, users) => startRemoteServer(pin, users));
// Змінити права користувачів МОЖНА В БУДЬ-ЯКИЙ МОМЕНТ, поки сервер вже працює —
// не треба перезапускати пульт, щоб додати людину чи забрати в когось право.
ipcMain.handle('set-remote-users', (event, users) => {
  remoteUsers = Array.isArray(users) ? users : [];
  return true;
});
ipcMain.handle('stop-remote', () => stopRemoteServer());
ipcMain.handle('get-local-ip', () => getLocalIP());

// ============================================================
// REMOTE CONTROL (HTTP + WebSocket)
// ============================================================
function getAllLocalIPs() {
  const ifaces = os.networkInterfaces();
  const skip = /(VirtualBox|VMware|vEthernet|Hyper-V|Loopback|WSL|Docker|VPN|TAP|Tailscale|ZeroTier|utun|llw|awdl|bridge)/i;
  const out = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      out.push({ name, address: iface.address, virtual: skip.test(name) });
    }
  }
  return out;
}
function getLocalIP() {
  const cands = getAllLocalIPs();
  const isLan = a => /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(a);
  const real = cands.filter(c => !c.virtual);
  const pick = real.find(c => isLan(c.address)) || real[0] || cands.find(c => isLan(c.address)) || cands[0];
  return pick ? pick.address : '127.0.0.1';
}

function broadcastToRemote(msg) {
  if (!wsServer) return;
  const str = JSON.stringify(msg);
  wsServer.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client._authed) client.send(str);
  });
}

let remotePin = '';   // пароль пульта — повний контроль ('' = без пароля)
let remoteUsers = [];   // [{id, name, pin, actions:[...]}] — іменовані користувачі зі своїм набором дозволів,
                         // що можна редагувати будь-коли, не перевидаючи пароль

// Дії, доступні через HTTP API (Stream Deck / Companion). Ті самі, що й у пульта.
const HTTP_API_ACTIONS = ['next', 'prev', 'next-verse', 'prev-verse', 'go-live',
  'clear', 'blackout', 'undo', 'lower', 'freeze', 'bookmark', 'plan-item', 'announce'];

// ── Захист від перебору PIN (аудит: rate-limit) ─────────────────────
// Лічильник невдалих спроб по IP. Свідомо в памʼяті, без бази: сервер
// живе рівно стільки, скільки відкрита програма, а перезапуск програми
// під час служби — і так подія, після якої лічильник не шкода втратити.
const API_FAILS = new Map();          // ip -> { n, until }
const API_MAX_FAILS = 10;             // стільки поспіль дозволено
const API_BLOCK_MS = 5 * 60 * 1000;   // потім пауза 5 хв

function apiClientIp(req) {
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}
// true = зараз заблоковано
function apiIsBlocked(req) {
  const r = API_FAILS.get(apiClientIp(req));
  if (!r || !r.until) return false;
  if (Date.now() > r.until) { API_FAILS.delete(apiClientIp(req)); return false; }
  return true;
}
function apiNoteFail(req) {
  const ip = apiClientIp(req);
  const r = API_FAILS.get(ip) || { n: 0, until: 0 };
  r.n++;
  if (r.n >= API_MAX_FAILS) { r.until = Date.now() + API_BLOCK_MS; r.n = 0; }
  API_FAILS.set(ip, r);
}
function apiClearFails(req) { API_FAILS.delete(apiClientIp(req)); }

// За яким паролем визначаємо, хто саме звертається, і що йому дозволено.
// Повертає null (немає доступу), {role:'admin'} (усе дозволено), або
// {role:'user', name, actions} (лише те, що для НЬОГО обрано в списку користувачів).
function findRemoteAccess(pin) {
  if (!remotePin && !remoteUsers.length) return { role: 'admin' };
  if (remotePin && pin === remotePin) return { role: 'admin' };
  const u = remoteUsers.find(x => x.pin && x.pin === pin);
  if (u) return { role: 'user', name: u.name, actions: Array.isArray(u.actions) ? u.actions : [] };
  return null;
}
function actionAllowed(access, action) {
  if (!access) return false;
  if (access.role === 'admin') return true;
  return access.actions.indexOf(action) >= 0;
}

function startRemoteServer(pin, users) {
  // Сервер уже працює — не змінюємо PIN/список користувачів під ногами у вже
  // підключених клієнтів. Раніше будь-який виклик 'start-remote' (навіть
  // службовий, що просто хотів дізнатись статус) беззастережно перезаписував
  // remotePin — і виклик БЕЗ явного pin скидав його на '', що per findRemoteAccess
  // відкриває пульт керування будь-кому в мережі без пароля просто посеред служіння.
  // Дзеркалить той самий захист, що вже є у 'start-sync-server'.
  if (httpServer) {
    if (pin) remotePin = pin;
    return { port: 3939, ip: getLocalIP(), pin: remotePin };
  }
  remotePin = pin || '';
  if (Array.isArray(users)) remoteUsers = users;

  httpServer = http.createServer((req, res) => {
    // ---- Цифровий бюлетень служби — БЕЗ PIN, тільки перегляд ----
    // На відміну від пульта (керування) і /api/ (теж керування) — цей
    // маршрут навмисно без пароля: план служби показуємо будь-кому в
    // церковному Wi-Fi, хто відкрив посилання чи відсканував QR. Керувати
    // звідси нічим не можна — жодних дій, лише GET читання поточного плану.
    if (req.url === '/bulletin' || req.url === '/bulletin/') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getBulletinHTML());
      return;
    }
    if (req.url === '/bulletin-data') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      const plan = (lastRemoteState && lastRemoteState.plan) || { name: '', items: [], idx: -1 };
      res.end(JSON.stringify(plan));
      return;
    }
    // ---- HTTP API для Stream Deck / Bitfocus Companion ----
    // GET /api/<action>?pin=XXXX  → виконує ту саму команду, що й пульт.
    // Приклади: /api/next  /api/prev  /api/blackout  /api/clear  /api/go-live
    if (req.url && req.url.indexOf('/api/') === 0) {
      const u = new URL(req.url, 'http://localhost');
      const action = u.pathname.replace('/api/', '').trim();
      const pin = u.searchParams.get('pin') || '';
      res.setHeader('Access-Control-Allow-Origin', '*');
      // Заблокований за перебір PIN — не витрачаємо час на перевірку й
      // не даємо підказок; 429 з Retry-After, як прийнято.
      if (apiIsBlocked(req)) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '300' });
        res.end(JSON.stringify({ ok: false, error: 'too many attempts, try later' }));
        return;
      }
      const access = findRemoteAccess(pin);
      if (!access) {
        // RATE-LIMIT (аудит: підбір PIN). PIN короткий, тож без обмеження
        // його перебирають за хвилини. Рахуємо невдалі спроби по IP:
        // після 10 поспіль — блок на 5 хвилин. Успішний вхід лічильник
        // скидає, тож оператор, що просто помилився, не постраждає.
        apiNoteFail(req);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'wrong pin' }));
        return;
      }
      apiClearFails(req);
      if (!action) {
        // список дій — щоб у Companion було видно, що доступно
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, actions: access.role === 'admin' ? HTTP_API_ACTIONS : access.actions, role: access.role, user: access.name }));
        return;
      }
      // GET /api/state — ЧИТАННЯ стану (що зараз в ефірі, слайд, таймер,
      // план служби, blackout, стан кожного виходу).
      // Раніше API вмів лише командувати: зовнішня система (Stream Deck,
      // Companion, автоматизація) не могла дізнатись, що відбувається, —
      // тож не могла ані підсвітити активну кнопку, ані ухвалити рішення.
      // Дані беремо з того самого lastRemoteState, який уже наповнює
      // рендерер для веб-пульта, тож нової труби не потрібно.
      if (action === 'state') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, state: lastRemoteState || {}, ts: Date.now() }));
        return;
      }
      // GET /api/docs — самоопис: перелік дій і полів стану. Щоб не
      // тримати документацію окремо від коду (вона там завжди застаріває).
      if (action === 'docs') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          auth: 'GET ?pin=XXXX (усі запити)',
          endpoints: {
            'GET /api/': 'список доступних дій для цього PIN',
            'GET /api/state': 'поточний стан: onAir, song, bibleRef, timer, plan, blackout, outputs[]',
            'GET /api/docs': 'цей опис',
            'GET /api/<action>': 'виконати дію; додаткові параметри — у query'
          },
          actions: HTTP_API_ACTIONS,
          stateFields: ['onAir', 'song', 'bibleVerse', 'bibleRef', 'nextBibleVerse',
                        'timer{remaining,running,paused,fmt}', 'plan{name,date,items,idx}',
                        'blackout', 'outputs[{n,name,route,frozen,live}]'],
          websocket: 'ws://<host>:<port> — шле {action:"state",data:{...}} при кожній зміні'
        }));
        return;
      }
      if (HTTP_API_ACTIONS.indexOf(action) < 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unknown action', actions: HTTP_API_ACTIONS }));
        return;
      }
      if (!actionAllowed(access, action)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'forbidden for this user', allowed: access.role === 'admin' ? HTTP_API_ACTIONS : access.actions }));
        return;
      }
      const payload = {};
      u.searchParams.forEach((v, k) => { if (k !== 'pin') payload[k] = v; });
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('remote-command', { action: action, payload: payload, via: 'http' });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, action: action }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getRemoteHTML(!!remotePin));
  });
  wsServer = new WebSocket.Server({ server: httpServer });

  wsServer.on('connection', (ws) => {
    ws._authed = !remotePin && !remoteUsers.length;
    ws._access = ws._authed ? { role: 'admin' } : null;

    // Тема потрібна пульту для прев'ю; надсилаємо лише авторизованим
    if (ws._authed) ws.send(JSON.stringify({ action: 'theme', data: currentTheme }));
    else ws.send(JSON.stringify({ action: 'auth-required' }));

    ws.on('message', (msg) => {
      let data;
      try { data = JSON.parse(msg); } catch (e) { return; }

      // Авторизація пульта: без неї команди ігноруються.
      // Раніше будь-хто з церковного Wi-Fi міг гортати куплети посеред проповіді.
      if (data.action === 'auth') {
        const access = findRemoteAccess(data.pin || '');
        if (!access) {
          ws.send(JSON.stringify({ action: 'auth-failed' }));
          return;
        }
        ws._authed = true;
        ws._access = access;
        ws.send(JSON.stringify({ action: 'auth-ok', role: access.role, user: access.name }));
        ws.send(JSON.stringify({ action: 'theme', data: currentTheme }));
        if (lastRemoteState) ws.send(JSON.stringify({ action: 'state', data: lastRemoteState }));
        return;
      }
      if (!ws._authed) return;
      // Кожен користувач бачить лише те, що для НЬОГО дозволено в списку —
      // блекаут/очистити ефір/скасувати тощо лишаються лише тим, кому дали.
      if (!actionAllowed(ws._access, data.action)) {
        ws.send(JSON.stringify({ action: 'forbidden', original: data.action }));
        return;
      }

      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('remote-command', data);
    });
  });
  httpServer.on('error', (err) => {
    console.error('Сервер пульта не стартував:', err.code);
    try { if (wsServer) wsServer.close(); } catch (e) {}
    httpServer = null; wsServer = null;
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('station-error', {
        code: err.code,
        message: err.code === 'EADDRINUSE'
          ? 'Порт 3939 зайнятий — пульт уже запущено?'
          : 'Пульт не стартував: ' + err.code
      });
    }
  });

  httpServer.listen(3939);
  return { port: 3939, ip: getLocalIP() };
}

function stopRemoteServer() {
  if (wsServer) { wsServer.close(); wsServer = null; }
  if (httpServer) { httpServer.close(); httpServer = null; }
  return 'stopped';
}

// Цифровий бюлетень служби — просто читає ту саму розмітку плану, що вже
// бачить оператор, і показує гостю без жодних кнопок керування. Оновлюється
// поллінгом /bulletin-data кожні кілька секунд — без WebSocket/PIN, щоб
// лишалось справді «лише перегляд» (не можна випадково щось натиснути).
function getBulletinHTML() {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>План служби</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; padding:16px; background:#0d0d1a; color:#eee; font-family:-apple-system,Segoe UI,Arial,sans-serif; min-height:100vh; }
  h1 { font-size:20px; margin:0 0 4px; color:#f0c040; }
  .date { font-size:13px; color:#999; margin-bottom:18px; }
  .item { padding:12px 14px; margin-bottom:6px; border-radius:8px; background:#1a1a2e; font-size:16px; border-left:3px solid transparent; }
  .item.active { background:#2a2a4e; border-left-color:#7c6af7; font-weight:700; color:#fff; }
  .item .n { color:#666; margin-right:8px; font-size:13px; }
  .empty { color:#888; text-align:center; padding:40px 0; }
</style>
</head>
<body>
  <h1 id="planName">План служби</h1>
  <div class="date" id="planDate"></div>
  <div id="items"><div class="empty">Завантаження…</div></div>
<script>
function render(plan) {
  document.getElementById('planName').textContent = plan.name || 'План служби';
  // plan.date у застосунку поки нема звідки взяти — нема поля вводу дати
  // для плану служби, тож завжди приходить порожнім. Показуємо сьогоднішню
  // дату (на боці телефону) замість вічно порожнього рядка. Знайдено рев'ю коду.
  document.getElementById('planDate').textContent = plan.date || new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  var el = document.getElementById('items');
  if (!plan.items || !plan.items.length) { el.innerHTML = '<div class="empty">План ще не складено</div>'; return; }
  el.innerHTML = plan.items.map(function(title, i) {
    var active = i === plan.idx;
    return '<div class="item' + (active ? ' active' : '') + '"><span class="n">' + (i + 1) + '.</span>' + (active ? '▶ ' : '') + title.replace(/</g,'&lt;') + '</div>';
  }).join('');
}
function poll() {
  fetch('/bulletin-data').then(function(r) { return r.json(); }).then(render).catch(function() {});
}
poll();
setInterval(poll, 4000);
</script>
</body>
</html>`;
}

function getRemoteHTML(needPin) {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Пульт керування</title>
<style>
:root{--bg:#0f1117;--panel:#181c27;--panel2:#1e2335;--accent:#7c6af7;--green:#3ecf8e;--red:#f56565;--text:#e8eaf0;--text2:#8b92a8;--border:#2a2f45;--gold:#f0c040;}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',Arial,sans-serif;min-height:100vh;padding:10px;max-width:480px;margin:0 auto;}
h1{font-size:15px;color:var(--accent);padding:8px 0 10px;text-align:center;}
.status{text-align:center;font-size:11px;color:var(--text2);margin-bottom:10px;}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--red);margin-right:4px;}
.dot.on{background:var(--green);box-shadow:0 0 5px var(--green);}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;}
.card-title{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text2);margin-bottom:8px;}
.btn{width:100%;padding:12px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;margin-bottom:6px;transition:transform .1s;}
.btn-primary{background:var(--accent);color:#fff;}
.btn-success{background:var(--green);color:#000;}
.btn-ghost{background:var(--panel2);color:var(--text);border:1px solid var(--border);}
.btn:active{transform:scale(.96);}
.row{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.on-air-box{background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;min-height:44px;margin-bottom:8px;}
.on-air-label{font-size:10px;color:var(--green);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;}
.on-air-text{font-size:14px;color:var(--text);line-height:1.4;}
.next-box{background:rgba(124,106,247,0.07);border:1px solid rgba(124,106,247,0.25);border-radius:8px;padding:8px 12px;margin-bottom:8px;}
.next-label{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;}
.next-text{font-size:12px;color:var(--text2);line-height:1.4;}
.verse-list{max-height:180px;overflow-y:auto;}
.verse-item{padding:8px 10px;background:var(--panel2);border:1px solid var(--border);border-radius:7px;margin-bottom:5px;cursor:pointer;font-size:12px;line-height:1.4;}
.verse-item.active{border-color:var(--accent);background:rgba(124,106,247,0.1);}
.timer-display{text-align:center;font-size:48px;font-family:monospace;font-weight:700;color:var(--accent);letter-spacing:3px;padding:8px 0 4px;}
.timer-display.urgent{color:var(--red);}
.timer-bar{height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:8px;}
.timer-fill{height:100%;background:var(--accent);border-radius:2px;transition:width .5s;}
.bible-ref{color:var(--gold);font-size:11px;font-weight:600;margin-bottom:4px;}
.bible-text{font-size:13px;line-height:1.5;}
.bible-next{font-size:11px;color:var(--text2);margin-top:6px;padding-top:6px;border-top:1px solid var(--border);line-height:1.4;}
.btn-clear{position:fixed;bottom:0;left:0;right:0;background:var(--red);color:#fff;border:none;padding:16px;font-size:16px;font-weight:700;cursor:pointer;}
.safe-bottom{height:60px;}
</style>
</head>
<body>
<h1>⛪ Пульт керування</h1>
<div class="status"><span class="dot" id="dot"></span><span id="statusTxt">Підключення...</span></div>

<div class="card">
  <div class="card-title">📺 Зараз на екрані</div>
  <div class="on-air-box">
    <div class="on-air-label">● НА ЕКРАНІ</div>
    <div class="on-air-text" id="onAirText">Нічого не виводиться</div>
  </div>
  <div class="next-box" id="nextBox" style="display:none">
    <div class="next-label">▶ Наступний</div>
    <div class="next-text" id="nextText"></div>
  </div>
</div>

<div class="card" id="songCard" style="display:none">
  <div class="card-title">🎵 <span id="songName"></span></div>
  <div class="verse-list" id="verseList"></div>
  <div class="row" style="margin-top:8px">
    <button class="btn btn-ghost" onclick="send({action:'prev-verse'})">◀ Назад</button>
    <button class="btn btn-ghost" onclick="send({action:'next-verse'})">Вперед ▶</button>
  </div>
  <button class="btn btn-success" style="margin-top:6px" onclick="send({action:'send-current'})">📺 Надіслати</button>
</div>

<div class="card" id="bibleCard" style="display:none">
  <div class="card-title">📖 Біблія</div>
  <div class="bible-ref" id="bibleRef"></div>
  <div class="bible-text" id="bibleText"></div>
  <div class="bible-next" id="bibleNext" style="display:none"></div>
  <div class="row" style="margin-top:8px">
    <button class="btn btn-ghost" onclick="send({action:'prev-bible'})">◀ Вірш</button>
    <button class="btn btn-ghost" onclick="send({action:'next-bible'})">Вірш ▶</button>
  </div>
</div>

<div class="card" id="timerCard" style="display:none">
  <div class="card-title">⏱ Таймер</div>
  <div class="timer-display" id="timerDisp">--:--</div>
  <div class="timer-bar"><div class="timer-fill" id="timerFill" style="width:100%"></div></div>
</div>

<div class="card">
  <div class="card-title">⚡ Дії</div>
  <div class="row">
    <button class="btn btn-primary" onclick="send({action:'open-projector'})">📺 Проектор</button>
    <button class="btn btn-primary" onclick="send({action:'open-stream'})">🎥 Трансляція</button>
  </div>
</div>

<div class="safe-bottom"></div>
<button class="btn-clear" onclick="send({action:'clear'})">✕ ОЧИСТИТИ ЕКРАН</button>
<div style="display:flex;gap:8px;margin-top:8px">
  <button onclick="send({action:'go-live'})" style="flex:1;background:var(--green);color:#08130d;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700">🔴 В ЕФІР</button>
  <button onclick="send({action:'undo'})" style="flex:1;background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:14px;font-size:15px">↶ Скасувати</button>
</div>

<div id="authOverlay" style="display:none;position:fixed;inset:0;background:#0f1117;z-index:9999;
     flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:10px">
  <div style="font-size:15px;color:var(--accent);font-weight:700">🔒 Потрібен пароль</div>
  <div id="authErr" style="font-size:12px;color:var(--red);min-height:16px"></div>
  <input id="authPin" type="text" inputmode="numeric" placeholder="Пароль"
         style="width:100%;max-width:220px;background:var(--panel2);border:1px solid var(--border);
                border-radius:8px;padding:12px;color:var(--text);font-size:18px;text-align:center;outline:none">
  <button onclick="sendAuth()" style="width:100%;max-width:220px;background:var(--accent);color:#fff;
          border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700">Увійти</button>
</div>

<script>
var ws, reconnTimer, timerTotal = 0;
var savedPin = localStorage.getItem('church_remote_pin') || '';

function showAuth(err) {
  var o = document.getElementById('authOverlay');
  o.style.display = 'flex';
  document.getElementById('authErr').textContent = err || '';
  document.getElementById('authPin').value = '';
  document.getElementById('authPin').focus();
}
function hideAuth() { document.getElementById('authOverlay').style.display = 'none'; }
function sendAuth() {
  var pin = document.getElementById('authPin').value.trim();
  savedPin = pin;
  send({ action: 'auth', pin: pin });
}

function connect() {
  ws = new WebSocket('ws://' + location.host);
  ws.onopen = function() {
    document.getElementById('dot').className = 'dot on';
    document.getElementById('statusTxt').textContent = 'Підключено';
    clearTimeout(reconnTimer);
    if (savedPin) send({ action: 'auth', pin: savedPin });  // тихий вхід із збереженим паролем
  };
  ws.onclose = function() {
    document.getElementById('dot').className = 'dot';
    document.getElementById('statusTxt').textContent = 'Відключено...';
    reconnTimer = setTimeout(connect, 2000);
  };
  ws.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.action === 'auth-required') { if (!savedPin) showAuth(); }
      else if (msg.action === 'auth-failed') { localStorage.removeItem('church_remote_pin'); savedPin = ''; showAuth('Невірний пароль'); }
      else if (msg.action === 'auth-ok') { localStorage.setItem('church_remote_pin', savedPin); hideAuth(); }
      else if (msg.action === 'state') updateState(msg.data);
      else if (msg.action === 'display') updateOnAir(msg.data);
    } catch(er) {}
  };
}
function send(d) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(d)); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function updateOnAir(data) {
  var el = document.getElementById('onAirText');
  var nb = document.getElementById('nextBox');
  if (!data || data.type === 'clear') { el.textContent = 'Нічого не виводиться'; nb.style.display = 'none'; }
  else if (data.type === 'text') {
    // <br> — єдиний тег, який тут очікується (перетворюємо на " / "); усе інше
    // прибираємо, а не довіряємо innerHTML довільному вмісту з мережі.
    el.innerHTML = (data.payload.html||'').replace(/<br\s*\/?>/gi,' / ').replace(/<[^>]+>/g,'');
    nb.style.display = 'none';
  }
  else if (data.type === 'html') { el.textContent = 'HTML / QR / Слайд'; nb.style.display = 'none'; }
}
function updateState(state) {
  var songCard = document.getElementById('songCard');
  if (state.song) {
    songCard.style.display = 'block';
    document.getElementById('songName').textContent = state.song.title;
    var list = document.getElementById('verseList');
    list.innerHTML = '';
    var idx = state.song.currentIdx || 0;
    state.song.verses.forEach(function(v, i) {
      var div = document.createElement('div');
      div.className = 'verse-item' + (i === idx ? ' active' : '');
      div.textContent = v.substring(0,70) + (v.length>70?'\u2026':'');
      div.onclick = (function(ii){ return function(){ send({action:'select-verse',idx:ii}); }; })(i);
      list.appendChild(div);
    });
    var curr = state.song.verses[idx] || '';
    document.getElementById('onAirText').textContent = curr.substring(0,80);
    var nb = document.getElementById('nextBox');
    if (state.song.nextVerse) {
      nb.style.display = 'block';
      document.getElementById('nextText').textContent = state.song.nextVerse.substring(0,80);
    } else { nb.style.display = 'none'; }
  } else { songCard.style.display = 'none'; }
  var bibleCard = document.getElementById('bibleCard');
  if (state.bibleVerse) {
    bibleCard.style.display = 'block';
    document.getElementById('bibleRef').textContent = state.bibleRef || '';
    document.getElementById('bibleText').textContent = state.bibleVerse;
    var bn = document.getElementById('bibleNext');
    if (state.nextBibleVerse) { bn.style.display='block'; bn.textContent='\u25b6 '+state.nextBibleVerse; }
    else { bn.style.display='none'; }
  } else { bibleCard.style.display = 'none'; }
  var timerCard = document.getElementById('timerCard');
  if (state.timer && state.timer.fmt) {
    timerCard.style.display = 'block';
    var td = document.getElementById('timerDisp');
    td.textContent = state.timer.fmt;
    td.className = 'timer-display' + (state.timer.remaining <= 30 ? ' urgent' : '');
    if (!timerTotal && state.timer.remaining > 0) timerTotal = state.timer.remaining;
    var pct = timerTotal > 0 ? Math.max(0, state.timer.remaining / timerTotal * 100) : 100;
    document.getElementById('timerFill').style.width = pct + '%';
  } else { timerCard.style.display = 'none'; }
}
connect();
</script>
</body>
</html>`;
}


// ============================================================
// HTML OVERLAY FILE HANDLER
// ============================================================
const overlayFiles = [];

ipcMain.handle('write-html-overlay', (event, htmlContent) => {
  // Записуємо HTML у тимчасовий файл, повертаємо file:// шлях
  const tmpPath = path.join(os.tmpdir(), 'church_overlay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.html');
  fs.writeFileSync(tmpPath, htmlContent, 'utf8');

  // ВАЖЛИВО: раніше тут видалявся попередній файл. Але один і той самий оверлей
  // може бути показаний одразу на кількох виходах (маршрути), і renderer кешує шляхи —
  // видалення «попереднього» лишало екран порожнім. Тримаємо вікно з останніх 12 файлів.
  overlayFiles.push(tmpPath);
  while (overlayFiles.length > 12) {
    const old = overlayFiles.shift();
    try { fs.unlinkSync(old); } catch (e) {}
  }
  // pathToFileURL робить валідний URL на всіх ОС: на Mac шлях містить пробіли
  // (/var/folders/…), а на Windows — backslash; ручне 'file://'+шлях ламалось і
  // давало чорний екран. Тепер кодування коректне скрізь.
  return pathToFileURL(tmpPath).href;
});

// ============================================================
// 📽 POWERPOINT (.pptx/.ppt) → PDF, через локально встановлену LibreOffice.
// Результат (PDF) далі йде через уже готовий, перевірений PDF-переглядач
// (той самий, що й для звичайних PDF-файлів) — не будуємо окремий показ
// слайдів PowerPoint з нуля.
//
// НЕ вбудовуємо LibreOffice в застосунок (є варіант через WASM-бібліотеку,
// але це +250МБ до інсталятора) — натомість викликаємо вже встановлену на
// машині користувача LibreOffice як зовнішню програму. Якщо її немає —
// повертаємо зрозумілу помилку з поясненням, що встановити.
// ============================================================
function findLibreOffice() {
  const candidates = process.platform === 'win32' ? [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
  ] : process.platform === 'darwin' ? [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'
  ] : [
    '/usr/bin/soffice', '/usr/bin/libreoffice', '/snap/bin/libreoffice'
  ];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return null;   // не знайдено за типовими шляхами — спробуємо PATH нижче
}

ipcMain.handle('convert-pptx-to-pdf', async (event, buffer) => {
  const { spawn } = require('child_process');
  const soffice = findLibreOffice() || (process.platform === 'win32' ? 'soffice.exe' : 'soffice');
  const tmpDir = path.join(os.tmpdir(), 'church_pptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    const pptxPath = path.join(tmpDir, 'input.pptx');
    fs.writeFileSync(pptxPath, Buffer.from(buffer));

    await new Promise((resolve, reject) => {
      const proc = spawn(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, pptxPath]);
      let err = '';
      proc.stderr.on('data', d => { err += d.toString(); });
      proc.on('error', e => reject(new Error('LibreOffice не знайдено. Встанови безкоштовну LibreOffice (libreoffice.org) — без неї показ PowerPoint-файлів недоступний. ' + e.message)));
      const timeout = setTimeout(() => { proc.kill(); reject(new Error('Конвертація триває занадто довго (можливо, файл пошкоджений)')); }, 60000);
      proc.on('close', code => {
        clearTimeout(timeout);
        code === 0 ? resolve() : reject(new Error('LibreOffice завершилась з помилкою: ' + err.slice(-300)));
      });
    });

    const pdfPath = path.join(tmpDir, 'input.pdf');
    if (!fs.existsSync(pdfPath)) throw new Error('Конвертація не створила PDF-файл');
    const pdfBuffer = fs.readFileSync(pdfPath);
    return { ok: true, data: pdfBuffer };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});

// Нотатки доповідача з PowerPoint (.pptx — це ZIP-архів з XML усередині).
// adm-zip — чистий JS, без нативної компіляції (перевірено окремо, на
// відміну від колишньої спроби з grandiose). Зіставляємо нотатки зі
// слайдами за НОМЕРОМ У НАЗВІ ФАЙЛУ (slideN.xml ↔ notesSlideN.xml) —
// це покриває типовий випадок; якщо слайди сильно перевпорядковані вручну,
// зіставлення може «поплисти», але для звичайної презентації працює вірно.
ipcMain.handle('extract-pptx-notes', async (event, buffer) => {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(Buffer.from(buffer));
    const notes = {};
    zip.getEntries().forEach(entry => {
      const m = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/.exec(entry.entryName);
      if (!m) return;
      const slideNum = parseInt(m[1], 10);
      const xml = zip.readAsText(entry);
      // Прибираємо XML-теги, лишаємо лише текст усередині <a:t>...</a:t>
      const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(x => x[1]);
      const text = texts.join('\n').trim();
      if (text) notes[slideNum] = text;
    });
    return { ok: true, notes: notes };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ============================================================
// 🎬 ATEM INTEGRATION
// ============================================================
let Atem = null;
let atemInstance = null;
let atemConnected = false;
let atemState = {};

function getAtemClass() {
  if (Atem) return Atem;
  try {
    const mod = require('atem-connection');
    Atem = mod.Atem || mod.default?.Atem || mod;
    return Atem;
  } catch(e) {
    console.error('atem-connection not installed:', e.message);
    return null;
  }
}

ipcMain.handle('atem-connect', async (event, ip) => {
  try {
    const AtemClass = getAtemClass();
    if (!AtemClass) return { ok: false, error: 'atem-connection не встановлено. Запустіть npm install.' };
    if (atemInstance) {
      try { await atemInstance.disconnect(); } catch(e) {}
      atemInstance = null;
    }
    atemInstance = new AtemClass();
    return await new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: 'Час підключення вийшов' });
      }, 8000);
      atemInstance.on('connected', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        atemConnected = true;
        atemState = atemInstance.state || {};
        if (mainWin && !mainWin.isDestroyed())
          mainWin.webContents.send('atem-status', { connected: true, state: summarizeAtemState() });
        resolve({ ok: true });
      });
      atemInstance.on('disconnected', () => {
        atemConnected = false;
        if (mainWin && !mainWin.isDestroyed())
          mainWin.webContents.send('atem-status', { connected: false });
        // Якщо це прийшло ДО першого 'connected' (пристрій одразу відмовив —
        // неправильна IP, з'єднання відхилено) — проміс інакше висів би усі
        // 8с до таймауту й показував загальне «Час підключення вийшов»
        // замість миттєвої точної помилки. Пізніший 'disconnected' (уже
        // ПІСЛЯ успішного підключення, пристрій пропав) сюди не потрапляє —
        // `settled` уже true, і цей блок нічого не робить.
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ ok: false, error: 'ATEM відхилив з’єднання' });
      });
      atemInstance.on('stateChanged', (state, paths) => {
        atemState = state;
        if (mainWin && !mainWin.isDestroyed())
          mainWin.webContents.send('atem-state', summarizeAtemState());
      });
      atemInstance.connect(ip);
    });
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('atem-disconnect', async () => {
  if (atemInstance) { try { await atemInstance.disconnect(); } catch(e) {} atemInstance = null; }
  atemConnected = false;
  return 'disconnected';
});

ipcMain.handle('atem-command', async (event, cmd) => {
  if (!atemInstance || !atemConnected) return { ok: false, error: 'ATEM не підключено' };
  try {
    switch(cmd.type) {
      case 'cut':
        await atemInstance.cut(cmd.me || 0);
        break;
      case 'auto':
        await atemInstance.autoTransition(cmd.me || 0);
        break;
      case 'preview':
        await atemInstance.changePreviewInput(cmd.input, cmd.me || 0);
        break;
      case 'program':
        await atemInstance.changeProgramInput(cmd.input, cmd.me || 0);
        break;
      case 'transition-type':
        // 0=Mix,1=Dip,2=Wipe,3=DVE,4=Stinger. У atem-connection v3 змінюваний
        // параметр — nextStyle (стиль НАСТУПНОГО переходу); 'style' лише для читання.
        await atemInstance.setTransitionStyle({ nextStyle: cmd.style }, cmd.me || 0);
        break;
      case 'record-start':
        if (atemInstance.startRecording) await atemInstance.startRecording();
        break;
      case 'record-stop':
        if (atemInstance.stopRecording) await atemInstance.stopRecording();
        break;
      case 'macro-run':
        if (atemInstance.macroRun) await atemInstance.macroRun(cmd.index);
        break;
      case 'audio-mute': {
        // ATEM Mini Extreme = Fairlight; старі = classic. Пробуємо доступний API.
        // mixOption: 0=Off(mute), 1=On, 2=AFV. channel — id входу (напр. 1/2 для MIC).
        const opt = cmd.mute ? 0 : (cmd.afv ? 2 : 1);
        try {
          if (atemInstance.setFairlightAudioMixerSourceProps)
            await atemInstance.setFairlightAudioMixerSourceProps(cmd.channel, -65280, { mixOption: opt });
          else if (atemInstance.setClassicAudioMixerInputProps)
            await atemInstance.setClassicAudioMixerInputProps({ mixOption: opt }, cmd.channel);
          else if (atemInstance.setAudioMixerInput)
            await atemInstance.setAudioMixerInput({ mixOption: opt }, cmd.channel);
        } catch (e) { return { ok: false, error: 'Аудіо: ' + e.message }; }
        break;
      }
      case 'ftb':
        // Плавно у чорноту / назад (сама команда — перемикач на боці ATEM)
        await atemInstance.fadeToBlack(cmd.me || 0);
        break;
      case 'trans-rate':
        // Тривалість AUTO-переходу (кадрів) для Mix-переходу
        if (atemInstance.setMixTransitionSettings)
          await atemInstance.setMixTransitionSettings({ rate: cmd.rate }, cmd.me || 0);
        break;
      case 'dsk-toggle': {
        // Downstream keyer (накладка над усім ефіром — логотип каналу). Читаємо
        // поточний стан з ATEM і перемикаємо, щоб одна кнопка вмикала/вимикала.
        const dsk = cmd.dsk || 0;
        const dstate = atemState.video && atemState.video.downstreamKeyers && atemState.video.downstreamKeyers[dsk];
        const on = !!(dstate && dstate.onAir);
        await atemInstance.setDownstreamKeyOnAir(!on, dsk);
        break;
      }
      case 'dsk-auto':
        // Плавно ввімкнути/вимкнути DSK
        await atemInstance.autoDownstreamKey(cmd.dsk || 0);
        break;
      case 'dsk-tie': {
        // Tie: DSK бере участь у наступному переході (AUTO/CUT), а не окремо
        const dsk = cmd.dsk || 0;
        const ds = atemState.video && atemState.video.downstreamKeyers && atemState.video.downstreamKeyers[dsk];
        const tie = !!(ds && (ds.properties ? ds.properties.tie : ds.tie));
        if (atemInstance.setDownstreamKeyTie) await atemInstance.setDownstreamKeyTie(!tie, dsk);
        break;
      }
      case 'aux':
        // Маршрут джерела на AUX-вихід (окремий монітор/фід)
        if (atemInstance.setAuxSource) await atemInstance.setAuxSource(cmd.input, cmd.aux || 0);
        break;
      case 'dve-pip': {
        // Картинка-в-картинці через DVE-кеєр: тип DVE + розмір/позиція вікна.
        const me = cmd.me || 0, keyer = cmd.keyer || 0;
        if (atemInstance.setUpstreamKeyerType) await atemInstance.setUpstreamKeyerType({ mixEffectKeyType: 3 }, me, keyer);
        if (atemInstance.setUpstreamKeyerDVESettings && cmd.dve)
          await atemInstance.setUpstreamKeyerDVESettings(cmd.dve, me, keyer);
        break;
      }
      case 'usk-toggle': {
        // Upstream keyer (накладка на ME: логотип/титри/хромакей/PIP)
        const me = cmd.me || 0, keyer = cmd.keyer || 0;
        const meState = atemState.video && atemState.video.mixEffects && atemState.video.mixEffects[me];
        const uk = meState && meState.upstreamKeyers && meState.upstreamKeyers[keyer];
        const on = !!(uk && uk.onAir);
        await atemInstance.setUpstreamKeyerOnAir(!on, me, keyer);
        break;
      }
      case 'usk-type': {
        // Тип апстрім-кеєра: 0=Luma, 1=Chroma (хромакей), 2=Pattern, 3=DVE
        const me = cmd.me || 0, keyer = cmd.keyer || 0;
        if (atemInstance.setUpstreamKeyerType)
          await atemInstance.setUpstreamKeyerType({ mixEffectKeyType: cmd.keyType }, me, keyer);
        break;
      }
      case 'chroma-adv': {
        // Тонке налаштування хромакею (поріг/краї/спіл). Спершу пробуємо advanced
        // (ATEM Mini Extreme), інакше — базовий хромакей на старіших ATEM.
        const me = cmd.me || 0, keyer = cmd.keyer || 0;
        try {
          if (atemInstance.setUpstreamKeyerAdvancedChromaProperties) {
            const p = {};
            if (cmd.foregroundLevel != null) p.foregroundLevel = cmd.foregroundLevel;
            if (cmd.backgroundLevel != null) p.backgroundLevel = cmd.backgroundLevel;
            if (cmd.keyEdge != null) p.keyEdge = cmd.keyEdge;
            if (cmd.spillSuppress != null) p.spillSuppress = cmd.spillSuppress;
            if (cmd.flareSuppress != null) p.flareSuppress = cmd.flareSuppress;
            await atemInstance.setUpstreamKeyerAdvancedChromaProperties(p, me, keyer);
          } else if (atemInstance.setUpstreamKeyerChromaSettings) {
            const p = {};
            if (cmd.foregroundLevel != null) p.gain = Math.round(cmd.foregroundLevel * 100);
            if (cmd.keyEdge != null) p.lift = Math.round(cmd.keyEdge * 100);
            await atemInstance.setUpstreamKeyerChromaSettings(p, me, keyer);
          } else { return { ok: false, error: 'Ця версія ATEM не підтримує тонке налаштування хромакею' }; }
        } catch (e) { return { ok: false, error: 'Хромакей: ' + e.message }; }
        break;
      }
      case 'chroma-sample': {
        // Взяти колір (зелений) із точки кадру. За замовчуванням — центр.
        const me = cmd.me || 0, keyer = cmd.keyer || 0;
        try {
          if (atemInstance.setUpstreamKeyerAdvancedChromaSampleSettings) {
            await atemInstance.setUpstreamKeyerAdvancedChromaSampleSettings(
              { enableCursor: true, cursorX: (cmd.x != null ? cmd.x : 0), cursorY: (cmd.y != null ? cmd.y : 0), cursorSize: (cmd.size != null ? cmd.size : 0.5) }, me, keyer);
            // деякі версії бібліотеки мають окрему дію «взяти семпл»
            if (atemInstance.performUpstreamKeyerAdvancedChromaSample)
              await atemInstance.performUpstreamKeyerAdvancedChromaSample(me, keyer);
          } else { return { ok: false, error: 'Ця версія ATEM не підтримує семпл кольору з додатка' }; }
        } catch (e) { return { ok: false, error: 'Семпл: ' + e.message }; }
        break;
      }
      case 'stream-start':
        // Пряма трансляція (лише ATEM Mini Pro/ISO)
        if (atemInstance.startStreaming) await atemInstance.startStreaming();
        break;
      case 'stream-stop':
        if (atemInstance.stopStreaming) await atemInstance.stopStreaming();
        break;
    }
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

function summarizeAtemState() {
  if (!atemState) return {};
  try {
    // v3: state.video.mixEffects[0]; v2: state.video.ME[0] — беремо перший, що є.
    const v = atemState.video || {};
    const me = (v.mixEffects && v.mixEffects[0]) || (v.ME && v.ME[0]) || {};
    const dsks = (v.downstreamKeyers || []).map(d => ({ onAir: !!(d && d.onAir), inTransition: !!(d && d.inTransition) }));
    const usks = (me.upstreamKeyers || []).map(k => !!(k && k.onAir));
    return {
      program: me.programInput,
      preview: me.previewInput,
      transition: (me.transitionProperties && me.transitionProperties.style) != null
        ? me.transitionProperties.style : me.transitionStyle,
      inTransition: (me.transitionPosition && me.transitionPosition.inTransition) != null
        ? me.transitionPosition.inTransition : me.inTransition,
      recording: atemState.recording?.status?.state === 2,
      streaming: !!(atemState.streaming && atemState.streaming.status && atemState.streaming.status.state === 2),
      ftb: !!(me.fadeToBlack && (me.fadeToBlack.isFullyBlack || me.fadeToBlack.inTransition)),
      dsks: dsks,
      usks: usks,
      macros: (atemState.macro && atemState.macro.macroProperties || [])
        .map((mp, i) => ({ index: i, name: (mp && mp.name) || ('Макрос ' + (i + 1)), used: !!(mp && mp.isUsed) }))
        .filter(mp => mp.used),
      inputs: (function(){
        // Назви входів, які задані на самому ATEM (KAZATEL/PREHLED/SDI1…)
        const out = {};
        const inp = atemState.inputs || {};
        for (let n = 1; n <= 8; n++) {
          const p = inp[n] && (inp[n].properties || inp[n]);
          const nm = p && (p.longName || p.shortName);
          if (nm) out[n] = String(nm);
        }
        return out;
      })(),
    };
  } catch(e) { return {}; }
}


// ============================================================
// 🎥 PTZ — КЕРУВАННЯ КАМЕРАМИ (універсально: VISCA-over-IP / VISCA-TCP / HTTP-CGI / ONVIF)
// Не заміняє джойстик FEELWORLD — це паралельний «пульт» до тих самих камер.
// ============================================================
let _ptzUdp = null;
let _ptzSeq = 0;
const _onvifCams = {};   // кеш ONVIF-підключень за ip

function ptzUdpSocket() {
  if (_ptzUdp) return _ptzUdp;
  const dgram = require('dgram');
  _ptzUdp = dgram.createSocket('udp4');
  _ptzUdp.on('error', (e) => console.error('PTZ UDP error:', e.message));
  return _ptzUdp;
}

// Готуємо байти команди VISCA. Повертає Buffer payload (без IP-заголовка).
function viscaPayload(action, p) {
  const sp = Math.max(1, Math.min(0x18, p.panSpeed || 0x10));
  const st = Math.max(1, Math.min(0x14, p.tiltSpeed || 0x10));
  const zs = Math.max(0, Math.min(7, (p.zoomSpeed != null ? p.zoomSpeed : 4)));
  const n  = (p.n || 0) & 0xFF;
  const DIRS = { up:[3,1], down:[3,2], left:[1,3], right:[2,3],
                 upleft:[1,1], upright:[2,1], downleft:[1,2], downright:[2,2], stop:[3,3] };
  let b = null;
  switch (action) {
    case 'move': { const d = DIRS[p.dir] || DIRS.stop; b = [0x81,0x01,0x06,0x01, sp, st, d[0], d[1], 0xFF]; break; }
    case 'stop': b = [0x81,0x01,0x06,0x01, sp, st, 0x03, 0x03, 0xFF]; break;
    case 'zoom':
      b = [0x81,0x01,0x04,0x07, p.dir === 'in' ? (0x20 + zs) : p.dir === 'out' ? (0x30 + zs) : 0x00, 0xFF];
      break;
    case 'focus':
      if (p.dir === 'auto') { b = [0x81,0x01,0x04,0x38,0x02,0xFF]; break; }
      if (p.dir === 'onepush') { b = [0x81,0x01,0x04,0x18,0x01,0xFF]; break; }   // навести різкість раз
      b = [0x81,0x01,0x04,0x08, p.dir === 'far' ? 0x02 : p.dir === 'near' ? 0x03 : 0x00, 0xFF];
      break;
    case 'iris':
      // Діафрагма: up=відкрити (світліше), down=закрити (темніше), reset=авто
      b = [0x81,0x01,0x04,0x0B, p.dir === 'up' ? 0x02 : p.dir === 'down' ? 0x03 : 0x00, 0xFF];
      break;
    case 'wb':
      // Баланс білого: auto / indoor / outdoor / onepush(+trigger)
      if (p.mode === 'trigger') { b = [0x81,0x01,0x04,0x10,0x05,0xFF]; break; }
      b = [0x81,0x01,0x04,0x35, ({ auto:0x00, indoor:0x01, outdoor:0x02, onepush:0x03 })[p.mode] || 0x00, 0xFF];
      break;
    case 'preset-recall': b = [0x81,0x01,0x04,0x3F,0x02, n, 0xFF]; break;
    case 'preset-set':    b = [0x81,0x01,0x04,0x3F,0x01, n, 0xFF]; break;
    case 'home':          b = [0x81,0x01,0x06,0x04,0xFF]; break;
  }
  return b ? Buffer.from(b) : null;
}

// PTZOptics/Sony HTTP-CGI: http://ip/cgi-bin/ptzctrl.cgi?ptzcmd&<cmd>&<a>&<b>
function httpCgiUrl(ip, port, action, p) {
  const ps = Math.max(1, Math.min(24, p.panSpeed || 12));
  const ts = Math.max(1, Math.min(20, p.tiltSpeed || 12));
  const zs = Math.max(1, Math.min(7, (p.zoomSpeed != null ? p.zoomSpeed : 4)));
  const D = { up:'up', down:'down', left:'left', right:'right',
              upleft:'leftup', upright:'rightup', downleft:'leftdown', downright:'rightdown' };
  let q = null;
  switch (action) {
    case 'move': q = 'ptzcmd&' + (D[p.dir] || 'ptzstop') + '&' + ps + '&' + ts; break;
    case 'stop': q = 'ptzcmd&ptzstop&' + ps + '&' + ts; break;
    case 'zoom': q = 'ptzcmd&' + (p.dir === 'in' ? 'zoomin' : p.dir === 'out' ? 'zoomout' : 'zoomstop') + '&' + zs; break;
    case 'focus': q = 'ptzcmd&' + (p.dir === 'near' ? 'focusin' : p.dir === 'far' ? 'focusout' : p.dir === 'auto' ? 'focus&auto' : 'focusstop') + '&' + zs; break;
    case 'preset-recall': q = 'ptzcmd&poscall&' + (p.n || 0); break;
    case 'preset-set':    q = 'ptzcmd&posset&' + (p.n || 0); break;
    case 'home': q = 'ptzcmd&home'; break;
  }
  if (!q) return null;
  return 'http://' + ip + (port ? ':' + port : '') + '/cgi-bin/ptzctrl.cgi?' + q;
}

async function ptzOnvif(cfg, action, p) {
  let mod;
  try { mod = require('onvif'); }
  catch (e) { return { ok: false, error: 'ONVIF-бібліотека не встановлена — запустіть npm install (onvif).' }; }
  const Cam = mod.Cam || (mod.default && mod.default.Cam);
  const key = cfg.ip + ':' + (cfg.port || 80);
  const getCam = () => new Promise((res, rej) => {
    if (_onvifCams[key]) return res(_onvifCams[key]);
    const cam = new Cam({ hostname: cfg.ip, username: cfg.user || '', password: cfg.pass || '', port: cfg.port || 80 },
      (err) => { if (err) rej(err); else { _onvifCams[key] = cam; res(cam); } });
  });
  const cam = await getCam();
  // Якщо команда падає (камера перезавантажилась, Wi-Fi відпав тощо) —
  // викидаємо мертве з'єднання з кешу. Раніше воно лишалось там назавжди,
  // і всі наступні PTZ-команди для цієї камери мовчки продовжували битись
  // у той самий непрацюючий об'єкт аж до перезапуску всієї програми.
  const call = (m, arg) => new Promise((res, rej) => cam[m](arg, (e, r) => {
    if (e) { delete _onvifCams[key]; rej(e); } else res(r);
  }));
  const norm = (v) => Math.max(-1, Math.min(1, v));
  const sp = norm((p.panSpeed || 12) / 24);
  switch (action) {
    case 'move': {
      const V = { up:[0,1], down:[0,-1], left:[-1,0], right:[1,0], upleft:[-1,1], upright:[1,1], downleft:[-1,-1], downright:[1,-1] }[p.dir] || [0,0];
      return call('continuousMove', { x: V[0]*sp, y: V[1]*sp, zoom: 0 }).then(() => ({ ok:true }));
    }
    case 'stop': return call('stop', { panTilt: true, zoom: true }).then(() => ({ ok:true }));
    case 'zoom': return call('continuousMove', { x:0, y:0, zoom: p.dir==='in'?sp:p.dir==='out'?-sp:0 }).then(() => ({ ok:true }));
    case 'preset-recall': return call('gotoPreset', { preset: String(p.n || 0) }).then(() => ({ ok:true }));
    case 'preset-set':    return call('setPreset',  { presetName: 'preset' + (p.n || 0) }).then(() => ({ ok:true }));
    case 'home': return call('gotoHomePosition', {}).then(() => ({ ok:true }));
    case 'focus': return { ok: true }; // фокус через ONVIF imaging — поза цим спрощеним обробником
  }
  return { ok: true };
}

// Окремі «відправники»: кожен шле команду своїм протоколом і НІКОЛИ не кидає
// виняток — щоб у режимі «Авто» невдача одного не заважала іншим.
async function ptzSendViscaUdp(cfg, payload, port) {
  if (!payload) return;
  _ptzSeq = (_ptzSeq + 1) >>> 0;
  const header = Buffer.alloc(8);
  header.writeUInt16BE(0x0100, 0);
  header.writeUInt16BE(payload.length, 2);
  header.writeUInt32BE(_ptzSeq, 4);
  const packet = Buffer.concat([header, payload]);
  const sock = ptzUdpSocket();
  await new Promise((res) => { try { sock.send(packet, port || 52381, cfg.ip, () => res()); } catch (e) { res(); } });
}
async function ptzSendViscaTcp(cfg, payload, port) {
  if (!payload) return;
  const net = require('net');
  await new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    try {
      const sock = net.connect(port || 5678, cfg.ip, () => { try { sock.write(payload); } catch (e) {} setTimeout(() => { try { sock.end(); } catch (e) {} fin(); }, 60); });
      sock.on('error', fin);
      sock.setTimeout(1200, () => { try { sock.destroy(); } catch (e) {} fin(); });
    } catch (e) { fin(); }
  });
}
async function ptzSendHttpCgi(cfg, action, p, port) {
  const url = httpCgiUrl(cfg.ip, port, action, p);
  if (!url) return;
  await new Promise((res) => { try { const r = http.get(url, (rsp) => { rsp.resume(); res(); }); r.on('error', () => res()); r.setTimeout(1200, () => { r.destroy(); res(); }); } catch (e) { res(); } });
}

ipcMain.handle('ptz-command', async (event, cfg) => {
  try {
    if (!cfg.ip) return { ok: false, error: 'Не вказано IP камери' };
    const proto = cfg.protocol || 'visca-udp';
    const p = cfg;  // містить action, dir, n, panSpeed, tiltSpeed, zoomSpeed
    const payload = viscaPayload(cfg.action, p);

    if (proto === 'auto') {
      // Шлемо команду ВСІМА швидкими діалектами на стандартних портах одночасно.
      // Камера виконає той, який розуміє; інші — безпечні пакети, які вона ігнорує.
      // Конфлікту немає: команда одна й та сама (напр. «вгору»), тож дубль нешкідливий.
      // ONVIF сюди не входить (потребує логіна/стану — засмічував би помилками).
      await Promise.all([
        ptzSendViscaUdp(cfg, payload, 52381).catch(() => {}),
        ptzSendViscaTcp(cfg, payload, 5678).catch(() => {}),
        ptzSendHttpCgi(cfg, cfg.action, p, 80).catch(() => {}),
      ]);
      return { ok: true };
    }
    if (proto === 'http-cgi') {
      if (!httpCgiUrl(cfg.ip, cfg.port, cfg.action, p)) return { ok: false, error: 'Невідома команда' };
      await ptzSendHttpCgi(cfg, cfg.action, p, cfg.port || 80);
      return { ok: true };
    }
    if (proto === 'onvif') {
      return await ptzOnvif(cfg, cfg.action, p);
    }
    if (proto === 'visca-tcp') {
      if (!payload) return { ok: false, error: 'Невідома команда' };
      await ptzSendViscaTcp(cfg, payload, cfg.port || 5678);
      return { ok: true };
    }
    // visca-udp (за замовчуванням)
    if (!payload) return { ok: false, error: 'Невідома команда' };
    await ptzSendViscaUdp(cfg, payload, cfg.port || 52381);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 🔍 Автопошук ONVIF-камер у мережі (WS-Discovery: UDP-multicast probe на
// 239.255.255.250:3702; камери відповідають своїми адресами XAddrs).
// 🖼 Знімок (JPEG) з камери — пробує типові snapshot-шляхи різних камер.
ipcMain.handle('ptz-snapshot', async (event, cfg) => {
  try {
    if (!cfg || !cfg.ip) return { ok: false, error: 'немає IP' };
    const http = require('http');
    const paths = cfg.path ? [cfg.path] : [
      '/snapshot.jpg', '/cgi-bin/snapshot.cgi', '/onvif-http/snapshot',
      '/ISAPI/Streaming/channels/101/picture', '/cgi-bin/currentpic.cgi',
      '/image/jpeg.cgi', '/jpg/image.jpg', '/tmpfs/auto.jpg', '/img/snapshot.cgi'
    ];
    const auth = cfg.user ? (encodeURIComponent(cfg.user) + ':' + encodeURIComponent(cfg.pass || '') + '@') : '';
    for (const pth of paths) {
      const url = 'http://' + auth + cfg.ip + pth;
      const buf = await new Promise((resolve) => {
        let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
        try {
          const req = http.get(url, { timeout: 2500 }, (res) => {
            if (res.statusCode !== 200 || !/image/i.test(res.headers['content-type'] || '')) { res.resume(); return fin(null); }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => fin(Buffer.concat(chunks)));
          });
          req.on('error', () => fin(null));
          req.on('timeout', () => { try { req.destroy(); } catch (e) {} fin(null); });
        } catch (e) { fin(null); }
      });
      if (buf && buf.length > 500) return { ok: true, dataUrl: 'data:image/jpeg;base64,' + buf.toString('base64'), path: pth };
    }
    return { ok: false, error: 'знімок недоступний (модель/шлях/автентифікація)' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('ptz-ping', async (event, cfg) => {
  try {
    if (!cfg || !cfg.ip) return { online: false };
    const net = require('net');
    return await new Promise((resolve) => {
      let done = false;
      const fin = (ok) => { if (!done) { done = true; resolve({ online: ok }); } };
      let sock;
      try {
        sock = net.connect(cfg.port || 80, cfg.ip, () => { try { sock.destroy(); } catch (e) {} fin(true); });
        sock.on('error', () => fin(false));
        sock.setTimeout(1500, () => { try { sock.destroy(); } catch (e) {} fin(false); });
      } catch (e) { fin(false); }
    });
  } catch (e) { return { online: false, error: e.message }; }
});

ipcMain.handle('ptz-discover', async () => {
  try {
    const dgram = require('dgram');
    let uuid; try { uuid = require('crypto').randomUUID(); } catch (e) { uuid = 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
    const probe = '<?xml version="1.0" encoding="utf-8"?>' +
      '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">' +
      '<e:Header><w:MessageID>urn:uuid:' + uuid + '</w:MessageID>' +
      '<w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>' +
      '<w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>' +
      '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>';
    return await new Promise((resolve) => {
      const found = {};
      let done = false;
      const finish = (sock) => { if (done) return; done = true; try { sock.close(); } catch (e) {} resolve({ ok: true, cameras: Object.values(found) }); };
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', () => finish(sock));
      sock.on('message', (msg) => {
        const s = msg.toString();
        const m = s.match(/<[^>]*XAddrs[^>]*>([\s\S]*?)<\/[^>]*XAddrs[^>]*>/i);
        if (!m) return;
        m[1].trim().split(/\s+/).forEach((u) => {
          const hm = u.match(/https?:\/\/([^\/:]+)/i);
          if (hm && !found[hm[1]]) found[hm[1]] = { ip: hm[1], xaddr: u };
        });
      });
      sock.bind(() => {
        try { sock.setBroadcast(true); } catch (e) {}
        const buf = Buffer.from(probe);
        const send = () => { try { sock.send(buf, 0, buf.length, 3702, '239.255.255.250'); } catch (e) {} };
        send();
        setTimeout(send, 500);   // повторний probe для надійності
      });
      setTimeout(() => finish(sock), 3500);   // збираємо відповіді ~3.5с
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ============================================================
// APP INIT
// ============================================================
// Тимчасові HTML-оверлеї накопичувались у temp і ніколи не видалялись
// Лічильник незавершених асинхронних записів на диск (data-write-async /
// data-delete-async). Потрібен, щоб застосунок НЕ закрився раніше, ніж
// запис справді дійде до диска — інакше зміни, зроблені прямо перед
// закриттям (напр. імпорт перекладів і одразу вихід), могли б загубитись.
let pendingDataWrites = 0;
let quitPending = false;
function maybeFinishQuit() {
  if (quitPending && pendingDataWrites === 0) {
    quitPending = false;
    app.quit();
  }
}

app.on('before-quit', (event) => {
  appIsQuitting = true;
  if (pendingDataWrites > 0 && !quitPending) {
    // Даємо записам шанс дописатись — але не тримаємо застосунок відкритим
    // вічно, якщо диск раптом "завис" (запобіжний тайм-аут).
    event.preventDefault();
    quitPending = true;
    setTimeout(() => { if (quitPending) { quitPending = false; app.quit(); } }, 3000);
    return;
  }
  // Прибираємо всі тимчасові оверлеї, які створили за сеанс
  overlayFiles.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  overlayFiles.length = 0;
  try {
    // і хвости з попередніх запусків (якщо програму закрили аварійно)
    fs.readdirSync(os.tmpdir())
      .filter(f => /^church_overlay_/.test(f))
      .forEach(f => { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch (e) {} });
  } catch (e) {}
});


// ============================================================
// АВТООНОВЛЕННЯ (electron-updater)
// Працює у зібраному застосунку з налаштованим publish. Якщо не налаштовано —
// тихо пропускаємо, щоб не заважати роботі.
// ============================================================
let autoUpdater = null;
function initAutoUpdate() {
  // Не турбуємо updater у режимі розробки й поки не налаштовано publish (плейсхолдер).
  if (!app.isPackaged) return;
  try {
    // Якщо ім'я GitHub ще не вписане — не перевіряємо (інакше 404 у лозі).
    let pub = null;
    try { pub = require('./package.json').build.publish[0]; } catch (e) {}
    if (pub && pub.owner === 'YOUR_GITHUB_USERNAME') {
      logError('autoUpdate', 'publish.owner не налаштовано — автооновлення вимкнено');
      return;
    }
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-available', (info) => {
      if (mainWin && !mainWin.isDestroyed())
        mainWin.webContents.send('update-status', { state: 'available', version: info.version });
    });
    autoUpdater.on('update-downloaded', (info) => {
      if (mainWin && !mainWin.isDestroyed())
        mainWin.webContents.send('update-status', { state: 'ready', version: info.version });
    });
    autoUpdater.on('error', (err) => logError('autoUpdater', err));
    // перевіряємо через 5 с після старту, щоб не гальмувати запуск
    setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch (e) { logError('checkForUpdates', e); } }, 5000);
  } catch (e) { logError('initAutoUpdate', e); }
}
ipcMain.handle('check-updates', () => { try { if (autoUpdater) autoUpdater.checkForUpdates(); } catch (e) {} return 'ok'; });
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('install-update', () => { try { if (autoUpdater) autoUpdater.quitAndInstall(); } catch (e) {} return 'ok'; });

// ---- Меню застосунку (винесено в src/main/app-menu.js) ------------------
const { applyAppMenu } = require('./src/main/app-menu');

// ============================================================
// ОДИН ЕКЗЕМПЛЯР
// На Windows користувач часто двічі клікає по ярлику. Без цього замка
// стартував би другий процес Electron: він відкривав би друге вікно й
// намагався зайняти вже зайняті порти (пульт 3939, OSC 9000) — плутанина.
// Тепер другий запуск просто піднімає вже відкрите вікно.
// ============================================================
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore();
      if (!mainWin.isVisible()) mainWin.show();
      mainWin.focus();
    } else {
      // mainWin може бути null тут не лише одразу після старту, а й якщо
      // головне вікно закрилось (напр. через помилку) поки вихідне вікно
      // (out3/out4 тощо) якимось чином лишилось живим — раніше другий запуск
      // просто нічого не робив, і користувач лишався без панелі керування.
      createMainWindow();
    }
  });
}

app.whenReady().then(() => {
  // Обробник схеми app:// — тепер, коли app готовий. Разом із
  // registerScheme() на початку файлу це дає безпечний канал доставки
  // HTML в output-вікна (паралельно до наявного file://, нічого не
  // ламаючи). CHURCH_USERDATA — щоб модуль знав дозволену теку даних,
  // не тягнучи electron-залежність усередину себе.
  process.env.CHURCH_USERDATA = app.getPath('userData');
  contentProtocol.registerHandler(protocol);
  contentProtocol.register(ipcMain);

  // ФІКС (Windows 11: курсор «вилітає» з полів вводу під час набору, напр.
  // у вкладці «Оголошення»). Причина — autoHideMenuBar:true ХОВАЄ системне
  // меню, але Alt і далі його РОЗКРИВАЄ (стандартна Electron-поведінка на
  // Windows; macOS такої концепції не має, тому там цього не видно). Якщо
  // під час набору випадково зачепити Alt (є в деяких розкладках клавіатури
  // для окремих символів) — меню зринає й краде фокус із поля. У застосунку
  // немає жодних власних пунктів меню — тож просто прибираємо його зовсім:
  // без меню Alt більше нічого не «розкриває» і фокус не втрачається.
  Menu.setApplicationMenu(null);
  try {
    app.setAboutPanelOptions({
      applicationName: 'Церква Проектор',
      applicationVersion: app.getVersion(),
      copyright: 'Церква ЄХБ м. Прага'
    });
  } catch (e) {}
  // Дозволяємо Web MIDI без діалогу (для MIDI-тригерів на панелі керування)
  try {
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
      if (permission === 'midi' || permission === 'midiSysex') return callback(true);
      callback(true); // решта дозволів і так була відкрита для цього офлайн-застосунку
    });
  } catch (e) {}
  applyAppMenu();
  initAutoUpdate();
  createMainWindow();
  loadCloudSyncFolder();  // завантажуємо налаштування папки синхронізації
  loadWatchFolder();
  if (watchFolderPath) startWatchingFolder(watchFolderPath);   // відновлюємо спостереження після перезапуску
  // screen можна використовувати тільки після ready
  // Проектор змінив роздільність (типово: прокинувся і перемкнувся 1024x768 → 1920x1080),
  // повернувся або змінив масштаб — вікно виводу треба підігнати заново.
  screen.on('display-metrics-changed', (event, display) => {
    OUTPUT_KINDS.forEach(k => {
      const w = outputWins[k];
      if (!w || w.isDestroyed()) return;
      const d = screen.getDisplayMatching(w.getBounds());
      if (d.id !== display.id) return;
      w.setFullScreen(false);
      w.setBounds(display.bounds);
      setTimeout(() => { if (!w.isDestroyed()) w.setFullScreen(true); }, 150);
    });
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('displays-changed', getDisplaysList());
  });

  screen.on('display-added', (event, display) => {
    // Монітор під'єднали назад (висмикнули HDMI під час служби) —
    // повертаємо на нього вихід, якщо він був туди призначений.
    OUTPUT_KINDS.forEach(k => {
      const fp = outputConfig[k + 'Fingerprint'];
      if (fp && displayFingerprint(display) === fp) {
        outputConfig[k + 'DisplayId'] = display.id;
        const w = outputWins[k];
        if (w && !w.isDestroyed()) {
          w.setFullScreen(false);
          w.setBounds(display.bounds);
          setTimeout(() => { if (!w.isDestroyed()) w.setFullScreen(true); }, 200);
        } else {
          createOutputWindow(k);   // вікно зникло разом із монітором — відкриваємо знову
        }
      }
    });
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('displays-changed', getDisplaysList());
  });
  screen.on('display-removed', () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('displays-changed', getDisplaysList());
  });
  app.on('activate', () => { if (!mainWin) createMainWindow(); });
});

app.on('window-all-closed', () => {
  stopRemoteServer();
  // Раніше станційний WebSocket (4242) і OSC-сервер (UDP) не закривались тут
  // явно — на macOS, де вікна можуть закритись без повного quit (activate
  // повертає застосунок), вони лишались слухати мовчки й далі.
  if (syncWss) { try { syncWss.close(); } catch (e) {} syncWss = null; }
  if (syncServer) { try { syncServer.close(); } catch (e) {} syncServer = null; }
  if (typeof oscModule !== 'undefined' && oscModule && typeof oscModule.stopOscServer === 'function') oscModule.stopOscServer();
  if (process.platform !== 'darwin') app.quit();
});

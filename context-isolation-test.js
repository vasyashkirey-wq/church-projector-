// Живий тест перемикача каналу доставки (app:// vs file://) на реальних
// output-вікнах: H2R, GDD-графіка, фони, слайди. Запускає справжній Electron
// (через Playwright), клікає в реальному UI, і перевіряє САМЕ вікно проектора
// (не лише панель керування) — що iframe у ньому дійсно вантажить контент,
// без console-помилок і без падіння на opaque-origin.
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOTS_DIR = path.join(__dirname, 'ci-shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const results = [];
function log(msg) { console.log(msg); }
function record(step, ok, note) { results.push({ step, ok, note }); log((ok ? '✓' : '✗') + ' ' + step + (note ? ' — ' + note : '')); }

async function safeShot(win, filePath) {
  try { await win.screenshot({ path: filePath, timeout: 3000 }); return true; }
  catch (e) { return false; }
}

// Знаходить BrowserWindow виводу за URL сторінки (projector.html не має
// <title>, тому BrowserWindow title ("Проектор (Вихід 1)") НЕ дорівнює
// document.title, який Playwright читає в page.title() — тут завжди
// порожній рядок; єдиний надійний спосіб відрізнити вікно виводу від
// головного вікна панелі — URL завантаженого файлу).
async function findOutputWindow(app, urlSubstr, tries) {
  tries = tries || 20;
  for (let i = 0; i < tries; i++) {
    const windows = app.windows();
    for (const w of windows) {
      try {
        const u = w.url();
        if (u && u.includes(urlSubstr)) return w;
      } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

(async () => {
  const electronPath = require('electron');
  const app = await electron.launch({
    executablePath: electronPath,
    args: [path.join(__dirname), '--no-sandbox', '--disable-gpu'],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  });

  const consoleErrors = [];
  app.on('window', (win) => {
    win.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push('[' + (win.url() || '?') + '] ' + msg.text()); });
    win.on('pageerror', (err) => consoleErrors.push('[pageerror ' + (win.url() || '?') + '] ' + String(err)));
  });

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000);
  record('Старт застосунку', true, await win.title());

  // ---- 1) Увімкнути перемикач каналу доставки (Налаштування) ----
  await win.click('.grp-btn:has-text("Налаштування")', { timeout: 5000, force: true });
  await win.waitForTimeout(300);
  // Підвкладка з перемикачем може називатись по-різному — шукаємо checkbox напряму через onchange-атрибут
  const subTabs = await win.$$eval('.sub-btn', els => els.map(e => e.textContent.trim()));
  log('Підвкладки Налаштувань: ' + subTabs.join(' | '));
  let toggleFound = false;
  for (const t of subTabs) {
    await win.click('.sub-btn:has-text("' + t.replace(/"/g, '\\"') + '")', { timeout: 5000, force: true }).catch(() => {});
    await win.waitForTimeout(250);
    const cb = await win.$('input[onchange^="setOverlayChannel"]');
    if (cb) { toggleFound = true; break; }
  }
  record('Знайдено перемикач каналу доставки (app://)', toggleFound);

  if (toggleFound) {
    const wasChecked = await win.$eval('input[onchange^="setOverlayChannel"]', el => el.checked);
    if (!wasChecked) {
      await win.click('input[onchange^="setOverlayChannel"]', { timeout: 5000, force: true });
      await win.waitForTimeout(200);
    }
    const nowChecked = await win.$eval('input[onchange^="setOverlayChannel"]', el => el.checked);
    record('Перемикач увімкнено (app://)', nowChecked === true);
  }

  // Перевіряємо через саму сторінку, що useAppProtocol дійсно true і writeHtmlOverlayApp доступний
  const channelState = await win.evaluate(() => ({
    useAppProtocol: !!(window.state && window.state.useAppProtocol),
    hasWriteApp: !!(window.electronAPI && window.electronAPI.writeHtmlOverlayApp)
  }));
  record('state.useAppProtocol === true після перемикання', channelState.useAppProtocol, JSON.stringify(channelState));

  // За замовчуванням state.liveMode === 'staged': doSend()/doSendHTML() лише
  // кладуть контент у прев'ю й чекають на "В ЕФІР" (state.goingLive), нічого
  // не надсилаючи на вихід одразу. Це не помилка — робочий режим репетиції —
  // але для цього тесту (перевіряємо САМ ПОКАЗ на проекторі) перемикаємось
  // на 'direct', як оператор ставить перед реальним служінням.
  await win.evaluate(() => { window.state.liveMode = 'direct'; });

  // ---- Допоміжне: відкрити вихід "Проектор" (як реальна кнопка "Відкрити") ----
  await win.evaluate(() => window.electronAPI.openOutput('projector')).catch(() => {});
  await win.waitForTimeout(800);

  let projWin = await findOutputWindow(app, 'projector.html', 15);
  record('Вікно проектора відкрито', !!projWin);

  // ---- 2) H2R титри — реальна кнопка з вкладки H2R (група "Медіа") ----
  await win.click('.grp-btn:has-text("Медіа")', { timeout: 5000, force: true }).catch(() => {});
  await win.waitForTimeout(200);
  let h2rOk = false, h2rNote = '';
  try {
    await win.click('.sub-btn:has-text("H2R")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    const preClickState = await win.evaluate(() => ({
      h2rConfig: window.state && window.state.h2rConfig,
      hasFn: typeof window.sendH2RLowerThird === 'function'
    }));
    // Викликаємо напряму (а не через клік UI) — так само надійно перевіряє
    // саму функцію показу, без залежності від того, чи саме цей "▶" видимий
    // зараз на екрані серед кількох однакових кнопок у різних вкладках.
    await win.evaluate(() => window.sendH2RLowerThird());
    await win.waitForTimeout(1500);
    if (!projWin) projWin = await findOutputWindow(app, 'projector.html', 10);
    if (projWin) {
      const frameSrc = await projWin.$eval('#frame', el => el.src).catch(() => null);
      h2rOk = !!frameSrc && frameSrc.startsWith('app://');
      h2rNote = 'frame.src=' + frameSrc + ' preClick=' + JSON.stringify(preClickState);
      await safeShot(projWin, path.join(SHOTS_DIR, '01-h2r-projector.png'));
    } else {
      h2rNote = 'вікно проектора не знайдено; preClick=' + JSON.stringify(preClickState);
    }
  } catch (e) { h2rNote = e.message.split('\n')[0]; }
  record('H2R титри → app:// на проекторі', h2rOk, h2rNote);

  // ---- 3) GDD-графіка — вкладка "HTML" (htmlOverlays); якщо список порожній,
  // перевіряємо канал напряму через writeHtmlOverlayApp з тестовим GDD-подібним HTML.
  let gddOk = false, gddNote = '';
  try {
    const gddResult = await win.evaluate(async () => {
      const html = '<!DOCTYPE html><html><body style="margin:0;background:#111;color:#fff;font-family:sans-serif">' +
        '<div id="gdd-marker">GDD TEST OK</div></body></html>';
      const url = await window.electronAPI.writeHtmlOverlayApp(html);
      window.electronAPI.sendToProjector('html', { filePath: url });
      return url;
    });
    await win.waitForTimeout(600);
    gddNote = 'url=' + gddResult;
    if (projWin) {
      const frameSrc = await projWin.$eval('#frame', el => el.src).catch(() => null);
      gddOk = !!frameSrc && frameSrc.startsWith('app://') && frameSrc === gddResult;
      gddNote += ' frame.src=' + frameSrc;
      await safeShot(projWin, path.join(SHOTS_DIR, '02-gdd-projector.png'));
    }
  } catch (e) { gddNote = e.message.split('\n')[0]; }
  record('GDD-подібна графіка (app://, у пам\'яті) → проектор', gddOk, gddNote);

  // ---- 4) Фон (background.js) — надсилаємо теми/фон через реальний applyBgToProjector() ----
  // Спершу прибираємо графіку з попереднього кроку (showClear) — інакше вона,
  // а не фон, займає весь екран поверх, і скріншот нічого не покаже про фон.
  await win.evaluate(() => window.electronAPI.sendToProjector('clear', {})).catch(() => {});
  await win.waitForTimeout(700);
  let bgOk = false, bgNote = '';
  try {
    const bgResult = await win.evaluate(async () => {
      if (typeof window.activeBg === 'undefined') return 'activeBg not found';
      window.activeBg = { type: 'gradient', gradient: 'linear-gradient(135deg, #112244, #663399)' };
      if (typeof window.applyBgToProjector !== 'function') return 'applyBgToProjector not found';
      window.applyBgToProjector();
      return 'applyBgToProjector() called';
    });
    bgNote = bgResult;
    await win.waitForTimeout(500);
    if (projWin) {
      const bgStyle = await projWin.$eval('#proj-bg', el => el.style.background).catch(() => null);
      bgOk = /called/.test(bgResult) && !!bgStyle && bgStyle.includes('gradient');
      bgNote += '; #proj-bg background=' + bgStyle;
      await safeShot(projWin, path.join(SHOTS_DIR, '03-bg-projector.png'));
    }
  } catch (e) { bgNote = e.message.split('\n')[0]; }
  record('Фон (тема, IPC set-theme) → проектор', bgOk, bgNote);

  // ---- 5) Слайд (PDF/зображення) — імітуємо через sendImageToProjector, як
  // реально робить sendSlideToProjector() з PDF-сторінкою: canvas.toDataURL().
  // Малюємо видиму картинку (а не 1×1 піксель) — щоб скріншот справді
  // показував слайд, як і реальна PDF-сторінка.
  let slideOk = false, slideNote = '';
  try {
    const tinyPng = await win.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 960; c.height = 540;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 960, 540);
      g.addColorStop(0, '#1b3a6b'); g.addColorStop(1, '#0d1b33');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
      ctx.fillStyle = '#f0c040';
      ctx.font = 'bold 64px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('ТЕСТОВИЙ СЛАЙД', 480, 280);
      return c.toDataURL('image/jpeg', 0.9);
    });
    const slideResult = await win.evaluate(async (dataUrl) => {
      if (typeof window.sendImageToProjector === 'function') {
        window.sendImageToProjector(dataUrl, 'Тестовий слайд', 'pdf');
        return 'sendImageToProjector() called';
      }
      return 'sendImageToProjector not found';
    }, tinyPng);
    slideNote = slideResult;
    await win.waitForTimeout(600);
    if (projWin) {
      const frameSrc = await projWin.$eval('#frame', el => el.src).catch(() => null);
      slideOk = /called/.test(slideResult) && !!frameSrc && frameSrc.startsWith('app://');
      slideNote += ' frame.src=' + frameSrc;
      await safeShot(projWin, path.join(SHOTS_DIR, '04-slide-projector.png'));
    }
  } catch (e) { slideNote = e.message.split('\n')[0]; }
  record('Слайд (PDF-подібний, dataURL у HTML) → app:// на проекторі', slideOk, slideNote);

  // ---- Підсумок ----
  log('\n========== ПІДСУМОК ==========');
  let pass = 0;
  for (const r of results) { if (r.ok) pass++; }
  log(pass + '/' + results.length + ' кроків пройшло');
  log('Console-помилок за сесію: ' + consoleErrors.length);
  consoleErrors.forEach(e => log('  [console] ' + e));

  fs.writeFileSync(path.join(__dirname, 'context-isolation-test-results.json'),
    JSON.stringify({ results, consoleErrors }, null, 2));

  await app.close();
  process.exit(results.every(r => r.ok) && consoleErrors.length === 0 ? 0 : 1);
})().catch(e => {
  console.error('ФАТАЛЬНА ПОМИЛКА ТЕСТУ:', e);
  process.exit(1);
});

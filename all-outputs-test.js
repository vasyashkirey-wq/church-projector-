// Живий тест УСІХ 4 виходів (не лише проектора): H2R, пісня (адресно),
// пісня з графікою, мульти-переклад — на КОЖЕН вихід окремо, з реальним
// Electron і читанням вмісту напряму з iframe (Playwright CDP).
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const SHOTS_DIR = path.join(__dirname, 'ci-shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
async function safeShot(w, f) { try { await w.screenshot({ path: f, timeout: 3000 }); } catch (e) {} }

const results = [];
function record(step, ok, note) { results.push({ step, ok, note }); console.log((ok ? '✓' : '✗') + ' ' + step + (note ? ' — ' + note : '')); }

const OUT_KIND = { 1: 'projector', 2: 'stream', 3: 'out3', 4: 'out4' };
const OUT_LABEL = { 1: 'Проектор', 2: 'Трансляція', 3: 'Вихід 3', 4: 'Вихід 4' };

async function findAllOutputWindows(app, tries) {
  tries = tries || 20;
  for (let i = 0; i < tries; i++) {
    const wins = app.windows().filter(w => (w.url() || '').includes('projector.html'));
    if (wins.length >= 4) return wins;
    await new Promise(r => setTimeout(r, 300));
  }
  return app.windows().filter(w => (w.url() || '').includes('projector.html'));
}

async function bodyTextOf(win) {
  for (const fr of win.frames()) {
    if (fr.url() && !fr.url().includes('projector.html')) {
      return await fr.evaluate(() => document.body.innerText.trim()).catch(() => '');
    }
  }
  return '';
}

(async () => {
  const electronPath = require('electron');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'church-projector-test-'));
  const app = await electron.launch({ executablePath: electronPath, args: [path.join(__dirname), '--no-sandbox', '--disable-gpu', '--user-data-dir=' + userDataDir] });
  const consoleErrors = [];
  app.on('window', (w) => {
    w.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push('[' + w.url() + '] ' + msg.text()); });
    w.on('pageerror', (err) => consoleErrors.push('[pageerror ' + w.url() + '] ' + String(err)));
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000);
  await win.evaluate(() => { window.state.liveMode = 'direct'; window.state.useAppProtocol = true; });

  // Відкриваємо ВСІ 4 виходи одночасно — сценарій "усі одразу", не лише проектор.
  await win.evaluate(async () => {
    for (const kind of ['projector', 'stream', 'out3', 'out4']) {
      await window.electronAPI.openOutput(kind);
    }
  });
  await win.waitForTimeout(1200);

  // Мапуємо BrowserWindow -> номер виходу через bounds (кожен вихід має
  // унікальну позицію/розмір за сіткою в createOutputWindow), бо
  // page.title() завжди порожній (projector.html без <title>), а власний
  // BrowserWindow title тут через Playwright недоступний напряму.
  const rawWins = app.windows().filter(w => (w.url() || '').includes('projector.html'));
  record('Відкрито 4 output-вікна', rawWins.length === 4, 'знайдено ' + rawWins.length);

  // Питаємо в САМОГО застосунку (через IPC-статус), яке вікно яким kind є —
  // електронAPI.getOutputStatus чи подібне; якщо немає — підемо по чергово:
  // відкриваємо/перевіряємо один вихід за раз, закриваючи попередні —
  // так є 100% певність, яке вікно яке.
  async function testOneOutputAlone(n) {
    // Закриваємо всі, лишаємо тільки n — саме сценарій "лише на проектор",
    // але узагальнений на кожен вихід по черзі.
    await win.evaluate(async (kind) => {
      for (const k of ['projector', 'stream', 'out3', 'out4']) {
        if (k !== kind) await window.electronAPI.closeOutput(k).catch(() => {});
      }
    }, OUT_KIND[n]);
    await win.waitForTimeout(400);
    await win.evaluate((kind) => window.electronAPI.openOutput(kind), OUT_KIND[n]);
    await win.waitForTimeout(800);
    const wins = app.windows().filter(w => (w.url() || '').includes('projector.html'));
    if (wins.length !== 1) return { win: null, note: 'очікував рівно 1 вікно, знайшов ' + wins.length };
    return { win: wins[0], note: '' };
  }

  for (let n = 1; n <= 4; n++) {
    const { win: outWin, note: setupNote } = await testOneOutputAlone(n);
    if (!outWin) { record(OUT_LABEL[n] + ' сам-один: підготовка вікна', false, setupNote); continue; }
    record(OUT_LABEL[n] + ' сам-один: вікно відкрито', true);

    // H2R на цей конкретний вихід
    let h2rOk = false, h2rNote = '';
    try {
      await win.click('.grp-btn:has-text("Медіа")', { timeout: 5000, force: true }).catch(() => {});
      await win.waitForTimeout(150);
      await win.click('.sub-btn:has-text("H2R")', { timeout: 5000, force: true }).catch(() => {});
      await win.waitForTimeout(200);
      await win.evaluate((n) => window.sendH2RLowerThird(n), n);
      await win.waitForTimeout(700);
      const t = await bodyTextOf(outWin);
      h2rOk = t.includes('Олександр');
      h2rNote = 'text="' + t.replace(/\n/g, ' | ') + '"';
    } catch (e) { h2rNote = e.message.split('\n')[0]; }
    record('  H2R -> ' + OUT_LABEL[n], h2rOk, h2rNote);

    // Пісня (адресно)
    let songOk = false, songNote = '';
    try {
      await win.click('.grp-btn:has-text("Контент")', { timeout: 5000, force: true }).catch(() => {});
      await win.waitForTimeout(150);
      await win.click('.sub-btn:has-text("Пісні")', { timeout: 5000, force: true }).catch(() => {});
      await win.waitForTimeout(200);
      const searchBox = await win.$('#songSearch');
      if (searchBox) {
        await searchBox.fill('Бо так');
        await win.waitForTimeout(500);
        const firstResult = win.locator('#songResults .result-item').first();
        if (await firstResult.count() > 0) await firstResult.click({ timeout: 5000, force: true });
      }
      await win.waitForTimeout(300);
      await win.evaluate((n) => window.sendSongToOutput(n), n);
      await win.waitForTimeout(700);
      const t = await bodyTextOf(outWin);
      songOk = t.includes('возлюбив');
      songNote = 'text="' + t.replace(/\n/g, ' | ') + '"';
    } catch (e) { songNote = e.message.split('\n')[0]; }
    record('  Пісня (адресно) -> ' + OUT_LABEL[n], songOk, songNote);

    // Пісня з графікою (targets=[n])
    let songGfxOk = false, songGfxNote = '';
    try {
      await win.evaluate((n) => window.songGraphicsTo([n], true), n);
      await win.waitForTimeout(700);
      const t = await bodyTextOf(outWin);
      songGfxOk = t.includes('возлюбив');
      songGfxNote = 'text="' + t.replace(/\n/g, ' | ') + '"';
    } catch (e) { songGfxNote = e.message.split('\n')[0]; }
    record('  Пісня з графікою -> ' + OUT_LABEL[n], songGfxOk, songGfxNote);

    // Мульти-переклад на цей вихід
    let mtOk = false, mtNote = '';
    try {
      await win.evaluate(async () => {
        if (typeof window.loadBibleTranslations === 'function') { try { await window.loadBibleTranslations(); } catch (e) {} }
        window.goToVerse('joh', 3, 16);
      });
      await win.waitForTimeout(200);
      await win.evaluate((n) => {
        const ids = ['ukr1871_kulish', 'ces1613_kralicka'].filter(id => window.bibleTranslations && window.bibleTranslations[id]);
        window.state.multiTrans[n] = ids;
      }, n);
      await win.evaluate((n) => window.sendMultiToOutput(n, true), n);
      await win.waitForTimeout(700);
      const t = await bodyTextOf(outWin);
      mtOk = t.length > 0 && (t.includes('полюбив') || t.includes('miloval'));
      mtNote = 'text="' + t.slice(0, 100).replace(/\n/g, ' | ') + '"';
    } catch (e) { mtNote = e.message.split('\n')[0]; }
    record('  Мульти-переклад -> ' + OUT_LABEL[n], mtOk, mtNote);

    await safeShot(outWin, path.join(SHOTS_DIR, '12-solo-output' + n + '.png'));
  }

  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ', e));
  console.log('\n' + results.filter(r => r.ok).length + '/' + results.length + ' пройшло');
  const allOk = results.every(r => r.ok) && consoleErrors.length === 0;
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

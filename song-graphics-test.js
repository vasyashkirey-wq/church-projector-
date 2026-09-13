// Живий тест «Пісня з графікою» (songGraphicsTo) — реальний Electron,
// реальний пошук пісні, перевірка через сам движок getGraphicsHTML.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const SHOTS_DIR = path.join(__dirname, 'ci-shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
async function safeShot(w, f) { try { await w.screenshot({ path: f, timeout: 3000 }); } catch (e) {} }

const results = [];
function record(step, ok, note) { results.push({ step, ok, note }); console.log((ok?'✓':'✗')+' '+step+(note?' — '+note:'')); }

async function findOutputWindow(app, urlSubstr, tries) {
  tries = tries || 20;
  for (let i = 0; i < tries; i++) {
    for (const w of app.windows()) { if ((w.url() || '').includes(urlSubstr)) return w; }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
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
  await win.evaluate(() => window.electronAPI.openOutput('projector'));
  await win.waitForTimeout(800);
  const projWin = await findOutputWindow(app, 'projector.html', 15);
  record('Вікно проектора відкрито', !!projWin);

  // Реальний пошук і вибір пісні
  await win.click('.grp-btn:has-text("Контент")', { timeout: 5000, force: true });
  await win.waitForTimeout(200);
  await win.click('.sub-btn:has-text("Пісні")', { timeout: 5000, force: true });
  await win.waitForTimeout(300);
  const searchBox = await win.$('#songSearch');
  let songTitle = null;
  if (searchBox) {
    await searchBox.fill('Бо так');
    await win.waitForTimeout(500);
    const firstResult = win.locator('#songResults .result-item').first();
    if (await firstResult.count() > 0) {
      await firstResult.click({ timeout: 5000, force: true });
      await win.waitForTimeout(300);
      songTitle = await win.evaluate(() => window.selectedSong && window.selectedSong.title);
    }
  }
  record('Пісню обрано через реальний пошук', !!songTitle, 'title=' + songTitle);

  // Реальна кнопка "🎨 З графікою (на всі)"
  let gfxOk = false, gfxNote = '';
  try {
    await win.click('button:has-text("З графікою (на всі)")', { timeout: 5000, force: true });
    await win.waitForTimeout(800);
    if (projWin) {
      let bodyText = '', frameSrc = null;
      for (const fr of projWin.frames()) {
        if (fr.url() && !fr.url().includes('projector.html')) {
          bodyText = await fr.evaluate(() => document.body.innerText.trim()).catch(() => '');
          frameSrc = fr.url();
          break;
        }
      }
      gfxOk = bodyText.length > 0 && !!songTitle && bodyText.includes(songTitle);
      gfxNote = 'frameSrc=' + frameSrc + ' bodyTextSample="' + bodyText.slice(0, 80).replace(/\n/g, ' | ') + '"';
      await safeShot(projWin, path.join(SHOTS_DIR, '09-song-graphics.png'));
    }
  } catch (e) { gfxNote = e.message.split('\n')[0]; }
  record('Пісня з графікою (реальна кнопка) на проекторі, назва пісні видно', gfxOk, gfxNote);

  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ', e));
  const allOk = results.every(r => r.ok) && consoleErrors.length === 0;
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

// Перевірка: розмір шрифту пісні тепер можна збільшувати A+ аж до 300px
// (раніше стеля була 140px). Реальний Electron, реальний computed style.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function findOutputWindow(app, urlSubstr, tries) {
  tries = tries || 20;
  for (let i = 0; i < tries; i++) {
    for (const w of app.windows()) { if ((w.url() || '').includes(urlSubstr)) return w; }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}
async function fontSizeOf(win) { return await win.$eval('#text-body', el => parseFloat(getComputedStyle(el).fontSize)).catch(() => null); }

const results = [];
function record(step, ok, note) { results.push({ step, ok, note }); console.log((ok ? '✓' : '✗') + ' ' + step + (note ? ' — ' + note : '')); }

(async () => {
  const electronPath = require('electron');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'church-projector-test-'));
  const app = await electron.launch({ executablePath: electronPath, args: [path.join(__dirname), '--no-sandbox', '--disable-gpu', '--user-data-dir=' + userDataDir] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000);
  await win.evaluate(() => { window.state.liveMode = 'direct'; });
  await win.evaluate(() => window.electronAPI.openOutput('projector'));
  await win.waitForTimeout(800);
  const proj = await findOutputWindow(app, 'projector.html', 15);

  await win.evaluate(() => {
    const song = { id: 1, title: 'Тест', verses: ['Слава'] };
    window.selectSong(song);
  });
  await win.evaluate(() => window.songStep(0));
  await win.waitForTimeout(500);

  // Тиснемо A+ (крок +4) достатньо разів, щоб дійти від 58 до 300+
  // (58 + 4*61 = 302, клемп до 300).
  for (let i = 0; i < 65; i++) await win.evaluate(() => window.songSizeStep(4));
  await win.waitForTimeout(600);

  const stateSize = await win.evaluate(() => window.state.songSize[1]);
  const rendered = await fontSizeOf(proj);
  record('state.songSize[1] дійшов до стелі 300px (не зупинився на 140)', stateSize === 300, 'stateSize=' + stateSize);
  record('Реально відображений шрифт на проекторі = 300px', rendered === 300, 'rendered=' + rendered + 'px');

  // Перевірка точкового виходу (setOutputSongSize) теж має нову стелю
  for (let i = 0; i < 65; i++) await win.evaluate(() => window.setOutputSongSize(2, 4));
  const out2 = await win.evaluate(() => window.state.songSize[2]);
  record('Точковий розмір для Виходу 2 (setOutputSongSize) теж дійшов до 300px', out2 === 300, 'out2=' + out2);

  const allOk = results.every(r => r.ok);
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

// Живе відтворення бага: пісня на вихід з увімкненим хромакеєм малювала
// СУЦІЛЬНИЙ непрозорий фон (перекриваючи шар хромакею) замість
// напівпрозорого. Перевіряємо РЕАЛЬНИЙ рендер: колір #proj-chroma під
// низом і фактичний background у документі #frame, що йде поверх нього.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const SHOTS_DIR = path.join(__dirname, 'ci-shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
async function safeShot(w, f) { try { await w.screenshot({ path: f, timeout: 3000 }); } catch (e) {} }

const results = [];
function record(step, ok, note) { results.push({ step, ok, note }); console.log((ok ? '✓' : '✗') + ' ' + step + (note ? ' — ' + note : '')); }

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
  await win.evaluate(() => { window.state.liveMode = 'direct'; });

  // Відкриваємо Трансляцію (Вихід 2) — саме той вихід, де реально
  // налаштовують хромакей для OBS.
  await win.evaluate(() => window.electronAPI.openOutput('stream'));
  await win.waitForTimeout(800);
  const streamWin = await findOutputWindow(app, 'projector.html', 15);
  record('Вікно трансляції відкрито', !!streamWin);

  // Реально вмикаємо хромакей на Вихід 2 (зелений) — так само, як зробив
  // би оператор у вкладці "Виходи"/"Трансляція".
  const chromaSet = await win.evaluate(() => {
    window.state.outputChroma = window.state.outputChroma || {};
    window.state.outputChroma[2] = '#00ff00';
    if (typeof window.pv2SetChroma === 'function') window.pv2SetChroma(2, '#00ff00');
    else if (window.electronAPI && window.electronAPI.setChroma) window.electronAPI.setChroma('stream', '#00ff00');
    return window.state.outputChroma[2];
  });
  await win.waitForTimeout(500);
  record('Хромакей увімкнено на Трансляції', chromaSet === '#00ff00', 'chroma=' + chromaSet);

  // Перевіряємо шар #proj-chroma на самому виході — має бути зелений
  const chromaLayerBg = await streamWin.$eval('#proj-chroma', el => getComputedStyle(el).backgroundColor).catch(() => null);
  record('#proj-chroma дійсно зелений на екрані виходу', chromaLayerBg === 'rgb(0, 255, 0)', 'bg=' + chromaLayerBg);

  // Реальний пошук і адресна відправка пісні на Вихід 2 (sendSongToOutput)
  await win.click('.grp-btn:has-text("Контент")', { timeout: 5000, force: true }).catch(() => {});
  await win.waitForTimeout(200);
  await win.click('.sub-btn:has-text("Пісні")', { timeout: 5000, force: true }).catch(() => {});
  await win.waitForTimeout(300);
  const searchBox = await win.$('#songSearch');
  if (searchBox) {
    await searchBox.fill('Бо так');
    await win.waitForTimeout(500);
    const firstResult = win.locator('#songResults .result-item').first();
    if (await firstResult.count() > 0) await firstResult.click({ timeout: 5000, force: true });
  }
  await win.waitForTimeout(300);
  await win.evaluate(() => window.sendSongToOutput(2));
  await win.waitForTimeout(800);

  // Перевіряємо: (а) frame.src завантажений, (б) фон САМОГО frame-документа
  // напівпрозорий (rgba з alpha<1), а НЕ суцільний чорний/темний.
  let frameBg = null, frameSrc = null, bodyText = '';
  for (const fr of streamWin.frames()) {
    if (fr.url() && !fr.url().includes('projector.html')) {
      frameSrc = fr.url();
      frameBg = await fr.evaluate(() => getComputedStyle(document.body).backgroundColor).catch(() => null);
      bodyText = await fr.evaluate(() => document.body.innerText.trim()).catch(() => '');
      break;
    }
  }
  console.log('frame.src =', frameSrc, ' body background =', frameBg);
  // rgba(0,0,0,X) з X<1 (звично 0.62) — напівпрозорий, ПРАВИЛЬНО.
  // rgb(...)/rgba(...,1) чи solid колір — суцільний, БАГ.
  const alphaMatch = frameBg && frameBg.match(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/);
  const isSemiTransparent = !!(alphaMatch && parseFloat(alphaMatch[1]) < 1 && parseFloat(alphaMatch[1]) > 0);
  record('Фон пісні на хромакей-виході НАПІВПРОЗОРИЙ (не суцільний)', isSemiTransparent,
    'background-color=' + frameBg + ' text="' + bodyText.replace(/\n/g, ' | ') + '"');

  await safeShot(streamWin, path.join(SHOTS_DIR, '14-song-on-chroma.png'));

  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ', e));
  const allOk = results.every(r => r.ok) && consoleErrors.length === 0;
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

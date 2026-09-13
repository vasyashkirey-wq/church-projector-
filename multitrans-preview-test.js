// Живий тест: (1) прев'ю картки «Кілька перекладів» (iframe.srcdoc, без
// показу на реальний вихід), (2) режим "Поряд" для рівно 2 перекладів.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const SHOTS_DIR = path.join(__dirname, 'ci-shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const results = [];
function record(step, ok, note) { results.push({ step, ok, note }); console.log((ok?'✓':'✗')+' '+step+(note?' — '+note:'')); }

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

  // Відкриваємо Біблію, вибираємо вірш напряму (надійніше за клік по підказці)
  await win.click('.grp-btn:has-text("Контент")', { timeout: 5000, force: true });
  await win.waitForTimeout(200);
  await win.click('.sub-btn:has-text("Біблія")', { timeout: 5000, force: true });
  await win.waitForTimeout(400);
  await win.evaluate(async () => {
    if (typeof window.loadBibleTranslations === 'function') { try { await window.loadBibleTranslations(); } catch (e) {} }
    window.goToVerse('joh', 3, 16);
  });
  await win.waitForTimeout(400);

  // ---- 1) Прев'ю з'являється БЕЗ жодного відкритого output-вікна ----
  const previewCheck1 = await win.evaluate(() => {
    const ids = ['ukr1871_kulish', 'ces1613_kralicka'].filter(id => window.bibleTranslations && window.bibleTranslations[id]);
    window.state.multiTrans[1] = ids;
    if (typeof window.refreshMultiTransCard === 'function') window.refreshMultiTransCard();
    return { ids };
  });
  await win.waitForTimeout(500);
  const previewSrcdoc1 = await win.evaluate(() => {
    const f = document.querySelector('iframe.multiTransPreviewFrame[data-n="1"]');
    return f ? (f.srcdoc || '').length : -1;
  });
  record('Прев\'ю оновилось (srcdoc непорожній) без показу на вихід', previewSrcdoc1 > 100,
    'ids=' + JSON.stringify(previewCheck1.ids) + ' srcdocLen=' + previewSrcdoc1);

  // Скріншот самої панелі керування (містить прев'ю-iframe у DOM)
  const previewBox = await win.$('#multiTransBox');
  if (previewBox) await previewBox.screenshot({ path: path.join(SHOTS_DIR, '10-multitrans-preview-panel.png') }).catch(() => {});

  // ---- 2) Режим "Поряд" (sideBySide) для 2 перекладів — читаємо CSS напряму з preview-фрейма ----
  await win.evaluate(() => { window.setMultiTransStyle(1, 'sideBySide', true); });
  await win.waitForTimeout(500);
  const sideBySideCheck = await win.evaluate(() => {
    const f = document.querySelector('iframe.multiTransPreviewFrame[data-n="1"]');
    if (!f) return null;
    // srcdoc саме по собі не рендериться в DOM батьківської сторінки як
    // доступний document (contentDocument для srcdoc-фрейма ДОСТУПНИЙ,
    // бо про-походження те саме, on same-origin as parent для about:srcdoc).
    try {
      const d = f.contentDocument;
      if (!d) return { ok: false, err: 'contentDocument null' };
      const blocks = d.getElementById('blocks');
      const cols = d.querySelectorAll('.mtcol');
      return {
        ok: true,
        blocksDisplay: blocks ? getComputedStyle(blocks).display : null,
        colCount: cols.length
      };
    } catch (e) { return { ok: false, err: e.message }; }
  });
  const sideBySideOk = !!(sideBySideCheck && sideBySideCheck.ok && sideBySideCheck.blocksDisplay === 'flex' && sideBySideCheck.colCount === 2);
  record('Режим "Поряд": #blocks display:flex, 2 колонки (.mtcol)', sideBySideOk, JSON.stringify(sideBySideCheck));

  if (previewBox) await previewBox.screenshot({ path: path.join(SHOTS_DIR, '11-multitrans-sidebyside-panel.png') }).catch(() => {});

  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ', e));
  const allOk = results.every(r => r.ok) && consoleErrors.length === 0;
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

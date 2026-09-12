// Живий тест band-режиму («Смуга внизу») для мульти-перекладу: реальний
// Electron, реальна вкладка Біблія, 3 вбудовані переклади одночасно.
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
  // Ізольований профіль на кожен запуск — інакше localStorage/кеш
  // накопичуються в спільному userData між прогонами тестів і з часом
  // ламають щось непов'язане (app://-схему, GPU-кеш) непередбачувано.
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

  // На чистому профілі useAppProtocol типово false (file://) — рахуючи, що
  // канал app:// уже перевірено окремо (context-isolation-test.js), тут
  // явно вмикаємо його, щоб band-режим тестувався на тому самому каналі,
  // яким реально користується захищене output-вікно.
  await win.evaluate(() => { window.state.liveMode = 'direct'; window.state.useAppProtocol = true; });
  await win.evaluate(() => window.electronAPI.openOutput('projector'));
  await win.waitForTimeout(800);
  const projWin = await findOutputWindow(app, 'projector.html', 15);
  record('Вікно проектора відкрито', !!projWin);

  // Відкриваємо Біблію й ставимо реальний вірш. Клік по підказці пошуку
  // (як реальний оператор) виявився крихким на чистому профілі (Bible-JSON
  // ще довантажується, підказка не встигає з'явитись) — напряму той самий
  // goToVerse(), яким користується сам пошук, надійніший і не менш "реальний"
  // (не мокає жодної функції показу/відправки, лише вибір вірша).
  await win.click('.grp-btn:has-text("Контент")', { timeout: 5000, force: true });
  await win.waitForTimeout(200);
  await win.click('.sub-btn:has-text("Біблія")', { timeout: 5000, force: true });
  await win.waitForTimeout(400);
  const verseSet = await win.evaluate(async () => {
    if (typeof window.loadBibleTranslations === 'function') { try { await window.loadBibleTranslations(); } catch (e) {} }
    if (typeof window.goToVerse !== 'function') return { ok: false, err: 'goToVerse не знайдено' };
    window.goToVerse('joh', 3, 16);
    return { ok: true, book: window.currentBibleBook, ch: window.currentBibleChapter, v: window.currentBibleVerseNum };
  });
  record('Вірш обрано напряму через goToVerse("joh",3,16)', verseSet.ok, JSON.stringify(verseSet));
  await win.waitForTimeout(300);

  // 3 вбудовані переклади одночасно на Вихід 1, і саме БЕЗ band — базовий стан
  const setupResult = await win.evaluate(() => {
    const ids = ['ukr1871_kulish', 'ces1613_kralicka', 'rus_synodal'].filter(id => window.bibleTranslations && window.bibleTranslations[id]);
    if (ids.length < 3) return { ok: false, err: 'не всі 3 переклади завантажені: ' + ids.join(',') };
    window.state.multiTrans[1] = ids;
    if (typeof window.saveMultiTrans === 'function') window.saveMultiTrans();
    return { ok: true, ids };
  });
  record('3 вбудовані переклади обрано для Виходу 1', setupResult.ok, JSON.stringify(setupResult));

  // ---- Крок 1: БЕЗ band (типовий вигляд, на весь екран) ----
  let fullOk = false, fullNote = '';
  try {
    await win.evaluate(() => { window.setMultiTransStyle(1, 'band', false); });
    await win.waitForTimeout(300);
    await win.evaluate(() => window.sendMultiToOutput(1, true));
    await win.waitForTimeout(700);
    if (projWin) {
      let cssPosition = null, bodyText = '';
      // Контент-фрейм — будь-який дочірній фрейм, що НЕ сама projector.html
      // (не прив'язуємось до конкретної схеми app:///file://, аби тест не
      // залежав від того, який канал доставки зараз увімкнено).
      for (const fr of projWin.frames()) {
        if (fr.url() && !fr.url().includes('projector.html')) {
          cssPosition = await fr.evaluate(() => getComputedStyle(document.getElementById('wrap')).position).catch(() => null);
          bodyText = await fr.evaluate(() => document.body.innerText.trim()).catch(() => '');
          break;
        }
      }
      fullOk = cssPosition === 'static' && bodyText.length > 0;
      fullNote = 'position=' + cssPosition + ' textLen=' + bodyText.length;
      await safeShot(projWin, path.join(SHOTS_DIR, '07-multitrans-full.png'));
    }
  } catch (e) { fullNote = e.message.split('\n')[0]; }
  record('Мульти-переклад БЕЗ band (на весь екран, типовий вигляд)', fullOk, fullNote);

  // ---- Крок 2: З band ("Смуга внизу") ----
  let bandOk = false, bandNote = '';
  try {
    await win.evaluate(() => { window.setMultiTransStyle(1, 'band', true); });
    await win.waitForTimeout(300);
    await win.evaluate(() => window.sendMultiToOutput(1, true));
    await win.waitForTimeout(700);
    if (projWin) {
      let cssPosition = null, cssBottom = null, bodyText = '';
      for (const fr of projWin.frames()) {
        if (fr.url() && !fr.url().includes('projector.html')) {
          cssPosition = await fr.evaluate(() => getComputedStyle(document.getElementById('wrap')).position).catch(() => null);
          cssBottom = await fr.evaluate(() => getComputedStyle(document.getElementById('wrap')).bottom).catch(() => null);
          bodyText = await fr.evaluate(() => document.body.innerText.trim()).catch(() => '');
          break;
        }
      }
      bandOk = cssPosition === 'absolute' && cssBottom === '0px' && bodyText.length > 0;
      bandNote = 'position=' + cssPosition + ' bottom=' + cssBottom + ' textLen=' + bodyText.length;
      await safeShot(projWin, path.join(SHOTS_DIR, '08-multitrans-band.png'));
    }
  } catch (e) { bandNote = e.message.split('\n')[0]; }
  record('Мульти-переклад З band ("Смуга внизу", 3 переклади)', bandOk, bandNote);

  // Перевіряємо, що стан персистентний (checkbox відображав би checked)
  const persisted = await win.evaluate(() => !!(window.mtStyle && window.mtStyle(1).band));
  record('state.multiTransStyle[1].band === true (персистентність)', persisted === true);

  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ', e));
  const allOk = results.every(r => r.ok) && consoleErrors.length === 0;
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

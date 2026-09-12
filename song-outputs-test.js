// Живий тест нових фіч з архіву "song-outputs": (1) вбудовані GDD-шаблони
// (fetch реального файлу з src/templates/gdd/), (2) адресний вивід пісні
// на конкретний вихід (sendSongToOutput).
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

  await win.evaluate(() => { window.state.useAppProtocol = true; window.state.liveMode = 'direct'; });
  await win.evaluate(() => window.electronAPI.openOutput('projector'));
  await win.evaluate(() => window.electronAPI.openOutput('stream'));
  await win.waitForTimeout(800);
  const projWin = await findOutputWindow(app, 'projector.html', 15);
  record('Вікно проектора відкрито', !!projWin);

  // ---- 1) Вбудований GDD-шаблон: реальний addGddTemplate(0) → fetch файлу з диска ----
  let gddOk = false, gddNote = '';
  try {
    const r = await win.evaluate(async () => {
      const t = window.GDD_TEMPLATES && window.GDD_TEMPLATES[0];
      if (!t) return { ok: false, err: 'GDD_TEMPLATES[0] не знайдено' };
      const resp = await fetch(t.file);
      if (!resp.ok) return { ok: false, err: 'fetch ' + t.file + ' -> ' + resp.status };
      const html = await resp.text();
      if (typeof window.sendHTMLToProjector !== 'function') return { ok: false, err: 'sendHTMLToProjector не знайдено' };
      window.sendHTMLToProjector(html, t.name);
      return { ok: true, name: t.name, len: html.length };
    });
    gddNote = JSON.stringify(r);
    await win.waitForTimeout(700);
    if (projWin && r.ok) {
      const frameSrc = await projWin.$eval('#frame', el => el.src).catch(() => null);
      // Кроскросдоменний DOM-доступ зі сторінки (contentDocument) заблоковано
      // самим webSecurity:true, що ми ввімкнули, — це ОЧІКУВАНО й правильно.
      // Playwright читає вміст iframe напряму через CDP, а не через JS
      // сторінки, тож підтверджуємо РЕАЛЬНИЙ рендер шаблону саме так.
      let nameText = null;
      for (const fr of projWin.frames()) {
        if (fr.url() && fr.url().startsWith('app://')) {
          nameText = await fr.evaluate(() => {
            const el = document.querySelector('[data-gdd="name"]');
            return el ? el.textContent : null;
          }).catch(() => null);
          break;
        }
      }
      gddOk = !!frameSrc && frameSrc.startsWith('app://') && nameText === 'Олександр';
      gddNote += ' frame.src=' + frameSrc + ' name-field(via CDP)=' + nameText;
      await safeShot(projWin, path.join(SHOTS_DIR, '05-gdd-template-projector.png'));
    }
  } catch (e) { gddNote = e.message.split('\n')[0]; }
  record('Вбудований GDD-шаблон (lower-third.html з диска) → app:// на проекторі', gddOk, gddNote);

  // ---- 2) Адресний вивід пісні на конкретний вихід (sendSongToOutput) ----
  let songOk = false, songNote = '';
  try {
    await win.click('.grp-btn:has-text("Контент")', { timeout: 5000, force: true });
    await win.waitForTimeout(200);
    await win.click('.sub-btn:has-text("Пісні")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    const searchBox = await win.$('#songSearch');
    if (searchBox) {
      await searchBox.fill('Бо так');
      await win.waitForTimeout(500);
      const firstResult = win.locator('#songResults .result-item').first();
      if (await firstResult.count() > 0) {
        await firstResult.click({ timeout: 5000, force: true });
        await win.waitForTimeout(300);
        const r = await win.evaluate(() => {
          if (typeof window.sendSongToOutput !== 'function') return { ok: false, err: 'sendSongToOutput не знайдено' };
          window.sendSongToOutput(2);   // саме вихід 2 ("Трансляція"), НЕ "на всі"
          return { ok: true, live: window.songLiveMap };
        });
        songNote = JSON.stringify(r);
        await win.waitForTimeout(700);
        // sendSongToOutput() іде тим самим 'html'-шляхом (overlayPath → app://),
        // що й GDD/H2R — тобто в #frame (iframe), НЕ в #text-body. Playwright
        // (на відміну від скрипта самої сторінки) бачить вміст iframe напряму
        // через CDP, байдуже до cross-origin — читаємо РЕАЛЬНИЙ текст пісні
        // всередині app://-фрейма, а не лише його URL.
        const windows = app.windows().filter(w => (w.url() || '').includes('projector.html'));
        const perWindow = [];
        for (const w of windows) {
          const frameSrc = await w.$eval('#frame', el => el.src).catch(() => null);
          let bodyText = '';
          for (const fr of w.frames()) {
            if (fr.url() && fr.url().startsWith('app://')) {
              bodyText = await fr.evaluate(() => document.body ? document.body.innerText.trim() : '').catch(() => '');
              break;
            }
          }
          perWindow.push({ frameSrc, bodyText });
        }
        // Крок 1 (GDD-шаблон) пішов на ВСІ дзеркальні виходи, тож обидва вікна
        // вже мали непорожній текст ("Олександр" з lower-third.html) до цього
        // кроку. Пісня на вихід 2 має його ЗАМІНИТИ саме там — перевіряємо,
        // що рівно одне вікно більше НЕ містить "Олександр" (замінено), а
        // інше й далі показує старий GDD-шаблон (адресність не займає решту).
        const replaced = perWindow.filter(p => p.bodyText && !p.bodyText.includes('Олександр'));
        const stillGdd = perWindow.filter(p => p.bodyText && p.bodyText.includes('Олександр'));
        songOk = !!(r.ok && r.live && r.live[2] === true && replaced.length === 1 && stillGdd.length === 1);
        songNote += ' perWindow=' + JSON.stringify(perWindow);
        for (let i = 0; i < windows.length; i++) await safeShot(windows[i], path.join(SHOTS_DIR, '06-song-output-win' + i + '.png'));
      } else {
        songNote = 'пошук не дав результатів для "Бо так"';
      }
    } else {
      songNote = '#songSearch не знайдено';
    }
  } catch (e) { songNote = e.message.split('\n')[0]; }
  record('Пісня → адресно на Вихід 2 (sendSongToOutput)', songOk, songNote);

  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ', e));
  const allOk = results.every(r => r.ok) && consoleErrors.length === 0;
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

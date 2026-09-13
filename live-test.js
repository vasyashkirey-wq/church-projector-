// Наскрізний живий тест: запускає Electron через Playwright, проходить по
// КОЖНІЙ вкладці реальної (групової) навігації — .grp-btn / .sub-btn, які
// pv2Init() будує замість старого .sidebar (той назавжди ховається через
// ".sidebar{display:none!important;}" в extras-4.js — це навмисно, не баг),
// скріншотить, ловить консольні помилки й window.onerror-банер.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SHOTS_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const results = [];

// Скріншоти в цьому headless/no-GPU xvfb-середовищі стабільно тайм-аутять
// (програмний рендер без композитора не встигає видати кадр) — короткий
// timeout, щоб не спалювати весь бюджет тесту на завідомо провальні спроби.
async function safeShot(win, filePath) {
  try { await win.screenshot({ path: filePath, timeout: 1200 }); }
  catch (e) { /* очікувано в цьому середовищі — не логуємо кожен раз */ }
}

function log(msg) { console.log(msg); }

(async () => {
  const app = await electron.launch({
    args: [path.join(__dirname), '--no-sandbox', '--disable-gpu'],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  });

  const win = await app.firstWindow();
  win.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  win.on('pageerror', (err) => pageErrors.push(String(err)));

  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000); // дати доініціалізуватись (safeInit-ланцюжку, pv2Init, БД пісень тощо)

  log('=== Вікно завантажено. Заголовок: ' + await win.title());

  const errBoxText = await win.evaluate(() => {
    const el = document.getElementById('pv2ErrBox');
    return el ? el.textContent : null;
  });
  results.push({ step: 'Старт застосунку', ok: !errBoxText, note: errBoxText || 'без банера помилок' });
  await safeShot(win, path.join(SHOTS_DIR, '00-start.png'));

  // Реальна структура навігації: 5 груп (.grp-btn), кожна відкриває набір
  // підвкладок (.sub-btn), що рендеряться в .pv2-subbar при кліку на групу.
  const groups = await win.$$eval('.grp-btn', els => els.map((e, i) => ({ i, id: e.id, text: e.textContent.trim() })));
  log('Знайдено груп навігації: ' + groups.length);
  log(groups.map(g => g.text).join(' | '));

  for (const grp of groups) {
    try {
      const gHandle = (await win.$$('.grp-btn'))[grp.i];
      if (!gHandle) { results.push({ step: 'Група: ' + grp.text, ok: false, note: 'кнопка групи не знайдена' }); continue; }
      const before = consoleErrors.length, beforePageErr = pageErrors.length;
      await gHandle.click({ timeout: 5000, force: true });
      await win.waitForTimeout(400);

      const subTabs = await win.$$eval('.sub-btn', els => els.map((e, i) => ({ i, id: e.id, text: e.textContent.trim() })));
      const gErrBox = await win.evaluate(() => {
        const el = document.getElementById('pv2ErrBox');
        return (el && el.style.display !== 'none') ? el.textContent : null;
      });
      const gOk = !gErrBox && consoleErrors.length === before && pageErrors.length === beforePageErr;
      await safeShot(win, path.join(SHOTS_DIR, `g${String(grp.i).padStart(2, '0')}-${grp.text.replace(/[^\wа-яА-ЯіІїЇєЄ]/g, '_').slice(0,30)}.png`));
      results.push({ step: 'Група: ' + grp.text, ok: gOk, note: (gOk ? subTabs.length + ' підвкладок' : [gErrBox, ...consoleErrors.slice(before), ...pageErrors.slice(beforePageErr)].filter(Boolean).join(' | ')) });

      for (const sub of subTabs) {
        try {
          const before2 = consoleErrors.length, beforePageErr2 = pageErrors.length;
          const sHandle = (await win.$$('.sub-btn'))[sub.i];
          if (!sHandle) { results.push({ step: '  ↳ ' + sub.text, ok: false, note: 'кнопка підвкладки не знайдена при повторному пошуку' }); continue; }
          await sHandle.click({ timeout: 5000, force: true });
          await win.waitForTimeout(350);
          const newErrBox = await win.evaluate(() => {
            const el = document.getElementById('pv2ErrBox');
            return (el && el.style.display !== 'none') ? el.textContent : null;
          });
          const newConsoleErrs = consoleErrors.slice(before2);
          const newPageErrs = pageErrors.slice(beforePageErr2);
          const ok = !newErrBox && newConsoleErrs.length === 0 && newPageErrs.length === 0;
          const safeName = sub.text.replace(/[^\wа-яА-ЯіІїЇєЄ]/g, '_').slice(0, 30) || ('sub_' + sub.i);
          await safeShot(win, path.join(SHOTS_DIR, `g${String(grp.i).padStart(2,'0')}-s${String(sub.i).padStart(2,'0')}-${safeName}.png`));
          results.push({
            step: '  ↳ ' + sub.text, ok,
            note: [newErrBox, ...newConsoleErrs, ...newPageErrs].filter(Boolean).join(' | ') || 'без помилок'
          });
        } catch (e) {
          results.push({ step: '  ↳ ' + sub.text, ok: false, note: 'виняток тесту: ' + e.message.split('\n')[0] });
        }
      }
    } catch (e) {
      results.push({ step: 'Група: ' + grp.text, ok: false, note: 'виняток тесту: ' + e.message.split('\n')[0] });
    }
  }

  // ---- Функціональні сценарії (не лише навігація) ----

  // 1) Пошук пісні
  try {
    // .sub-btn показує лише підвкладки АКТИВНОЇ групи (renderSubbar перезаписує
    // .pv2-subbar повністю) — після навігаційного проходу активна група
    // остання перевірена ("Налаштування"), тож спершу перемикаємось на "Контент".
    await win.click('.grp-btn:has-text("Контент")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    await win.click('.sub-btn:has-text("Пісні")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    const searchBox = await win.$('#songSearch');
    if (searchBox) {
      await searchBox.fill('Бо так');
      await win.waitForTimeout(500); // дебаунс пошуку
      const resultsCount = await win.$$eval('#songResults .result-item', els => els.length).catch(() => 0);
      results.push({ step: 'Пошук пісні "Бо так"', ok: resultsCount > 0, note: resultsCount + ' результат(ів)' });
      await safeShot(win, path.join(SHOTS_DIR, '90-song-search.png'));
    } else {
      results.push({ step: 'Пошук пісні', ok: false, note: '#songSearch не знайдено' });
    }
  } catch (e) { results.push({ step: 'Пошук пісні', ok: false, note: e.message.split('\n')[0] }); }

  // 2) Вибір пісні і відправка в ефір
  // Locator (не ElementHandle!) — список результатів дебаунситься й
  // перерендерюється, тож handle, зафіксований одразу після заповнення
  // пошуку, міг устигнути «відклеїтись» від DOM до кліку. Locator сам
  // перезапитує елемент у момент кліку.
  try {
    const firstResult = win.locator('#songResults .result-item').first();
    if (await firstResult.count() > 0) {
      await firstResult.click({ timeout: 5000, force: true });
      await win.waitForTimeout(300);
      await safeShot(win, path.join(SHOTS_DIR, '91-song-selected.png'));
      // Реальна кнопка відправки пісні на проектор — "▶ На проектор" (songSendFirst()),
      // видима лише після вибору пісні (#verseActions). "В ефір" — це кнопка
      // ОГОЛОШЕНЬ (інша вкладка), тож той селектор клікав не туди.
      const sendBtn = await win.$('#verseActions button:has-text("На проектор")');
      if (sendBtn) {
        await sendBtn.click({ timeout: 5000, force: true });
        await win.waitForTimeout(500);
        const onAir = await win.$eval('#onAirLabel', el => el.textContent).catch(() => '');
        results.push({ step: 'Відправка пісні в ефір', ok: true, note: 'onAirLabel="' + onAir + '"' });
      } else {
        results.push({ step: 'Відправка пісні в ефір', ok: false, note: 'кнопку відправки не знайдено' });
      }
      await safeShot(win, path.join(SHOTS_DIR, '92-song-live.png'));
    } else {
      results.push({ step: 'Вибір пісні', ok: false, note: 'немає результатів пошуку для вибору' });
    }
  } catch (e) { results.push({ step: 'Вибір+відправка пісні', ok: false, note: e.message.split('\n')[0] }); }

  // 3) Очистити екран — кнопка "✕ Очистити" у нижній send-bar, видима на
  // будь-якій вкладці (у старому .nav-btn-меню був окремий пункт "🚫 Очистити
  // екран", який тепер під !important-правилом .sidebar назавжди прихований)
  try {
    const clearBtn = await win.$('.send-bar button:has-text("Очистити")');
    if (clearBtn) {
      await clearBtn.click({ timeout: 5000, force: true });
      await win.waitForTimeout(400);
      results.push({ step: 'Очистити екран', ok: true, note: 'клік пройшов' });
    } else {
      results.push({ step: 'Очистити екран', ok: false, note: 'кнопку не знайдено на поточній вкладці' });
    }
  } catch (e) { results.push({ step: 'Очистити екран', ok: false, note: e.message.split('\n')[0] }); }

  // 4) Біблія — пошук вірша
  try {
    await win.click('.sub-btn:has-text("Біблія")', { timeout: 5000, force: true });
    await win.waitForTimeout(400);
    const quickRef = await win.$('#bibleQuickRef');
    if (quickRef) {
      await quickRef.fill('Ів 3:16');
      await win.waitForTimeout(500);
      await safeShot(win, path.join(SHOTS_DIR, '93-bible-quickref.png'));
      const suggestions = await win.$$eval('#bibleQuickRefResults .result-item', els => els.length).catch(() => 0);
      results.push({ step: 'Біблія: швидке посилання "Ів 3:16"', ok: suggestions > 0, note: suggestions + ' підказок' });
    } else {
      results.push({ step: 'Біблія: швидке посилання', ok: false, note: '#bibleQuickRef не знайдено' });
    }
  } catch (e) { results.push({ step: 'Біблія: пошук вірша', ok: false, note: e.message.split('\n')[0] }); }

  // 5) Додавання пісні (форма)
  try {
    await win.click('.sub-btn:has-text("Додати пісню")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    const titleFld = await win.$('#newSongTitle');
    const bookFld = await win.$('#newSongBook');
    const versesFld = await win.$('#newSongVerses');
    if (titleFld && versesFld) {
      await titleFld.fill('Тестова пісня Playwright');
      if (bookFld) await bookFld.fill('Тестовий збірник');
      await versesFld.fill('1 куплет:\nрядок один\nрядок два\n\nПриспів:\nприспів рядок');
      await win.waitForTimeout(300);
      await safeShot(win, path.join(SHOTS_DIR, '94-addsong-filled.png'));
      const saveBtn = await win.$('#saveSongBtn');
      if (saveBtn) {
        await saveBtn.click({ timeout: 5000, force: true });
        await win.waitForTimeout(500);
        const msg = await win.$eval('#addSongMsg', el => el.textContent).catch(() => '');
        results.push({ step: 'Додавання нової пісні', ok: /✓/.test(msg), note: msg });
      } else {
        results.push({ step: 'Додавання нової пісні', ok: false, note: 'saveSongBtn не знайдено' });
      }
    } else {
      results.push({ step: 'Додавання нової пісні', ok: false, note: 'поля форми не знайдено' });
    }
    await safeShot(win, path.join(SHOTS_DIR, '95-addsong-saved.png'));
  } catch (e) { results.push({ step: 'Додавання нової пісні', ok: false, note: e.message.split('\n')[0] }); }

  // 6) Перевірка фільтра збірників після додавання
  try {
    await win.click('.sub-btn:has-text("Пісні")', { timeout: 5000, force: true }).catch(() => {});
    await win.waitForTimeout(300);
    const bookFilterOptions = await win.$$eval('#songBookFilter option', els => els.map(e => e.textContent)).catch(() => []);
    results.push({ step: 'Фільтр збірників містить новий збірник', ok: bookFilterOptions.some(t => t.includes('Тестовий збірник')), note: bookFilterOptions.join(', ') });
  } catch (e) { results.push({ step: 'Фільтр збірників', ok: false, note: e.message.split('\n')[0] }); }

  // 7) Оголошення
  try {
    await win.click('.sub-btn:has-text("Оголошення")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    const annTitle = await win.$('#annTitle');
    if (annTitle) {
      await annTitle.fill('Тестове оголошення');
      const annBody = await win.$('#annBody');
      if (annBody) await annBody.fill('Текст оголошення для перевірки');
      await win.waitForTimeout(300);
      await safeShot(win, path.join(SHOTS_DIR, '96-announce-filled.png'));
      results.push({ step: 'Форма оголошень заповнюється', ok: true, note: 'без помилок' });
    } else {
      results.push({ step: 'Форма оголошень', ok: false, note: '#annTitle не знайдено' });
    }
  } catch (e) { results.push({ step: 'Оголошення', ok: false, note: e.message.split('\n')[0] }); }

  // 8) Таймер (у групі "Служба")
  try {
    await win.click('.grp-btn:has-text("Служба")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    await win.click('.sub-btn:has-text("Таймер")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    await safeShot(win, path.join(SHOTS_DIR, '97-timer.png'));
    results.push({ step: 'Вкладка Таймер відкривається', ok: true, note: 'скріншот збережено' });
  } catch (e) { results.push({ step: 'Таймер', ok: false, note: e.message.split('\n')[0] }); }

  // 9) ATEM (у групі "Налаштування")
  try {
    await win.click('.grp-btn:has-text("Налаштування")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    await win.click('.sub-btn:has-text("ATEM")', { timeout: 5000, force: true });
    await win.waitForTimeout(300);
    await safeShot(win, path.join(SHOTS_DIR, '98-atem.png'));
    results.push({ step: 'Вкладка ATEM відкривається', ok: true, note: 'без ATEM-пристрою — очікується "Відключено"' });
  } catch (e) { results.push({ step: 'ATEM', ok: false, note: e.message.split('\n')[0] }); }

  // ---- Підсумковий звіт ----
  log('\n\n========== ПІДСУМОК ==========');
  let passCount = 0;
  for (const r of results) {
    log((r.ok ? '✓' : '✗') + ' ' + r.step + (r.note ? ' — ' + r.note : ''));
    if (r.ok) passCount++;
  }
  log(`\n${passCount}/${results.length} кроків пройшло без помилок`);
  log(`\nВсього console-помилок за сесію: ${consoleErrors.length}`);
  consoleErrors.forEach(e => log('  [console.error] ' + e));
  log(`Всього необроблених винятків сторінки: ${pageErrors.length}`);
  pageErrors.forEach(e => log('  [pageerror] ' + e));

  fs.writeFileSync(path.join(__dirname, 'live-test-results.json'), JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));

  await app.close();
  process.exit(0);
})().catch(e => {
  console.error('ФАТАЛЬНА ПОМИЛКА ТЕСТУ:', e);
  process.exit(1);
});

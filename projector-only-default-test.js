// Відтворення скарги "нічого не з'являється на екрані, якщо відкритий
// лише Проектор" — цього разу З ТИПОВИМИ налаштуваннями (нічого не
// вмикаємо/вимикаємо вручну): useAppProtocol=false (типово), liveMode
// типовий (staged чи direct — як є за замовчуванням у щойно
// встановленій програмі), відкриваємо ЛИШЕ Проектор.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function bodyTextOf(win) {
  // Текст (пісня/вірш) рендериться напряму в #text-body самої
  // projector.html — НЕ в iframe (той — лише для HTML/GDD-графіки).
  const textBody = await win.$eval('#text-body', el => el.textContent.trim()).catch(() => '');
  if (textBody) return textBody;
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
  const win = await app.firstWindow();
  win.on('console', m => { console.log('[console:' + m.type() + ']', m.text()); });
  win.on('pageerror', e => console.log('[pageerror]', String(e)));
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000);

  const defaults = await win.evaluate(() => ({
    liveMode: window.state.liveMode,
    useAppProtocol: !!window.state.useAppProtocol,
    goingLive: !!window.state.goingLive
  }));
  console.log('Типові налаштування щойно запущеної програми:', JSON.stringify(defaults));

  // Відкриваємо ЛИШЕ Проектор — так, як реально зробив би оператор
  // (кнопка "Відкрити" саме для проектора, не F5/"Обидва виходи").
  await win.click('.grp-btn:has-text("Виходи")', { timeout: 5000, force: true }).catch(() => {});
  await win.waitForTimeout(300);
  await win.evaluate(() => window.electronAPI.openOutput('projector'));
  await win.waitForTimeout(1000);
  let projWin = null;
  for (let i = 0; i < 15; i++) { for (const w of app.windows()) { if ((w.url() || '').includes('projector.html')) { projWin = w; break; } } if (projWin) break; await new Promise(r => setTimeout(r, 300)); }
  console.log('Вікно проектора відкрито:', !!projWin);

  // Реальний пошук пісні й реальна кнопка "На проектор"/аналог — так,
  // як зробив би оператор, НІЧОГО вручну не перемикаючи в налаштуваннях.
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

  const sendBtn = await win.$('#verseActions button:has-text("На проектор")');
  console.log('Кнопка "На проектор" знайдена:', !!sendBtn);
  if (sendBtn) await sendBtn.click({ timeout: 5000, force: true });
  await win.waitForTimeout(800);

  const textAfterFirstClick = projWin ? await bodyTextOf(projWin) : '(вікна немає)';
  console.log('ПІСЛЯ 1 кліку "На проектор" — проектор показує:', JSON.stringify(textAfterFirstClick.slice(0, 100)));
  console.log('НІЧОГО НЕ З\'ЯВИЛОСЬ:', !textAfterFirstClick || textAfterFirstClick.length < 3);

  // Якщо staged — перевіряємо, чи НОВА кнопка "В ЕФІР" у ПОСТІЙНІЙ панелі
  // (видима з БУДЬ-ЯКОЇ вкладки, не лише з окремої "Ефір") виправляє це.
  if (defaults.liveMode === 'staged') {
    const sendPreviewText = await win.evaluate(() => document.getElementById('sendPreview')?.innerHTML || '');
    console.log('#sendPreview показує:', JSON.stringify(sendPreviewText));
    const goLiveBtn = await win.$('#sendBarGoLive');
    console.log('Кнопка #sendBarGoLive (постійна панель) знайдена й видима:', !!goLiveBtn && await goLiveBtn.isVisible());
    if (goLiveBtn) {
      await goLiveBtn.click({ timeout: 5000, force: true });
      await win.waitForTimeout(800);
      const textAfterGoLive = projWin ? await bodyTextOf(projWin) : '(вікна немає)';
      console.log('ПІСЛЯ кліку "В ЕФІР" (з вкладки Пісні, не перемикаючись) — проектор показує:', JSON.stringify(textAfterGoLive.slice(0, 100)));
      console.log('ВИПРАВЛЕНО (тепер щось з\'явилось):', textAfterGoLive.includes('возлюбив') || textAfterGoLive.length > 3);
    }
  }

  await app.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

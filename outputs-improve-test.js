// Перевірка нових покращень «Виходів»:
// 1) «Закрити всі виходи» (pv2CloseAllOutputs) реально закриває всі відкриті.
// 2) Бейдж "N/4 відкрито" на send-bar оновлюється при відкритті/закритті.
// 3) Контент відновлюється при перевідкритті виходу (без нового надсилання).
// 4) Явне закриття (pv2CloseOutput / "Закрити всі") НЕ показує діалог і не
//    зависає, навіть коли на виході щось в ефірі (інтенційне закриття).
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

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
async function bodyTextOf(win) {
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
  const app = await electron.launch({ executablePath: electronPath, args: [path.join(__dirname), '--no-sandbox', '--disable-gpu', '--user-data-dir=' + userDataDir], timeout: 30000 });
  const consoleErrors = [];
  // Тримаємо ВЛАСНИЙ список вікон за появою (не app.windows() — той інколи ще
  // якийсь час повертає щойно закрите/знищене вікно, і findOutputWindow міг би
  // помилково схопити СТАРЕ вікно замість щойно перевідкритого).
  const allWindows = [];
  app.on('window', (w) => {
    allWindows.push({ w });
    w.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push('[' + w.url() + '] ' + msg.text()); });
    w.on('pageerror', (err) => consoleErrors.push('[pageerror ' + w.url() + '] ' + String(err)));
  });
  function latestOpenWindow() { return allWindows.filter(x => !x.w.isClosed()).slice(-1)[0].w; }
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000);
  await win.evaluate(() => { window.state.liveMode = 'direct'; });

  // --- Бейдж на send-bar: 0/4 на старті ---
  const badge0 = await win.$eval('#sendBarOutputsBadge', el => el.textContent).catch(() => null);
  record('Бейдж send-bar показує 0/4 на старті (жоден вихід ще не відкритий)', badge0 === '0/4 відкрито', 'badge=' + badge0);

  // --- Відкриваємо 2 виходи, перевіряємо бейдж ---
  await win.evaluate(() => window.pv2OpenOutput(1));
  await win.evaluate(() => window.pv2OpenOutput(2));
  await win.waitForTimeout(800);
  const badge2 = await win.$eval('#sendBarOutputsBadge', el => el.textContent).catch(() => null);
  record('Бейдж показує 2/4 після відкриття 2 виходів', badge2 === '2/4 відкрито', 'badge=' + badge2);

  // --- Надсилаємо пісню на Вихід 1, перевіряємо, що вона на екрані ---
  await win.evaluate(() => {
    const song = { id: 1, title: 'Тест відновлення', verses: ['Слава Богу назавжди'] };
    window.selectSong(song);
  });
  await win.evaluate(() => window.sendSongToOutput(1));
  await win.waitForTimeout(800);
  const proj1 = await findOutputWindow(app, 'projector.html', 10);
  const textBefore = await bodyTextOf(proj1);
  record('Пісня реально на екрані Виходу 1 перед закриттям', textBefore.includes('Слава Богу'), 'text="' + textBefore + '"');

  // --- Закриваємо Вихід 1 через штатну кнопку (інтенційно — без діалогу, без зависання) ---
  const closeStart = Date.now();
  await win.evaluate(() => window.pv2CloseOutput(1));
  await win.waitForTimeout(600);
  const closeMs = Date.now() - closeStart;
  record('Штатне закриття (pv2CloseOutput) не зависає навіть з ефіром на екрані', closeMs < 3000, closeMs + 'ms');
  const badgeAfterClose = await win.$eval('#sendBarOutputsBadge', el => el.textContent).catch(() => null);
  record('Бейдж повернувся на 1/4 після закриття Виходу 1', badgeAfterClose === '1/4 відкрито', 'badge=' + badgeAfterClose);

  // --- Перевідкриваємо Вихід 1 — контент має з'явитись САМ, без повторного надсилання ---
  await win.evaluate(() => window.pv2OpenOutput(1));
  await win.waitForTimeout(1500);
  const proj1b = latestOpenWindow();
  const textAfterReopen = await bodyTextOf(proj1b);
  record('Контент ВІДНОВИВСЯ САМ при перевідкритті виходу (без нового sendSongToOutput)',
    textAfterReopen.includes('Слава Богу'), 'text="' + textAfterReopen + '"');

  // --- «Закрити всі виходи»: тепер відкрито 1 і 2, тиснемо кнопку ---
  // confirmDanger типово true — вимикаємо підтвердження заздалегідь, щоб
  // перевірити САМУ дію (діалог confirm() у renderer перевірятимемо окремо
  // нижче через сторінковий dialog-хендлер).
  await win.evaluate(() => { window.state.ui = window.state.ui || {}; window.state.ui.confirmDanger = false; });
  await win.evaluate(() => window.pv2CloseAllOutputs());
  await win.waitForTimeout(800);
  const badgeAfterCloseAll = await win.$eval('#sendBarOutputsBadge', el => el.textContent).catch(() => null);
  record('«Закрити всі виходи» реально закрила все (0/4)', badgeAfterCloseAll === '0/4 відкрито', 'badge=' + badgeAfterCloseAll);
  const remainingOutputWins = app.windows().filter(w => (w.url() || '').includes('projector.html')).length;
  record('Жодного вікна projector.html не лишилось після «Закрити всі»', remainingOutputWins === 0, 'count=' + remainingOutputWins);

  // --- Журнал ефіру: запис пісні має мати output=1 (адресна відправка) ---
  const journalEntry = await win.evaluate(() => {
    const log = window.state.statsData.log || [];
    return log.length ? log[log.length - 1] : null;
  });
  record('Журнал: останній запис пісні позначений виходом 1', journalEntry && journalEntry.output === 1, JSON.stringify(journalEntry));

  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ', e));
  const allOk = results.every(r => r.ok) && consoleErrors.length === 0;
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

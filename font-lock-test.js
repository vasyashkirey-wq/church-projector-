// Перевірка "Стабільний розмір шрифту" (📏 Зафіксувати розмір під поточну
// пісню + A-/A+/↺ Авто). Ціль: реально переконатись, що:
//  1) при виборі пісні розмір АВТОМАТИЧНО фіксується під найдовший куплет
//     (не «стрибає» між довгим і коротким слайдом);
//  2) кнопка "📏 Зафіксувати" робить те саме вручну;
//  3) A+/A- задає точний розмір і він ТРИМАЄТЬСЯ при переході на іншу пісню;
//  4) "↺ Авто" повертає підбір розміру під кожен слайд окремо (розмір знову
//     стрибає між довгим/коротким куплетом).
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

async function fontSizeOf(win) {
  return await win.$eval('#text-body', el => parseFloat(getComputedStyle(el).fontSize)).catch(() => null);
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

  await win.evaluate(() => window.electronAPI.openOutput('projector'));
  await win.waitForTimeout(800);
  const proj = await findOutputWindow(app, 'projector.html', 15);
  record('Вікно проектора відкрито', !!proj);

  // Штучна пісня зі СВІДОМО різною довжиною куплетів: перший куплет —
  // ДУЖЕ довгий (20 рядків, аби на базовому розмірі шрифту він точно НЕ
  // вміщався і auto-fit змушений був сильно зменшити шрифт), другий —
  // одне коротке слово (на базовому розмірі точно вміщається). Без
  // розбиття (splitCfg.on=false), щоб songSlides() не різала довгий
  // куплет на частини — інакше тест не перевіряв би саме "стрибання"
  // розміру між куплетами.
  const longVerse = Array.from({length: 20}, (_, i) => 'Довгий рядок тексту куплету номер ' + (i + 1) + ' для перевірки авто-підгону розміру шрифту, який має бути широким').join('\n');
  const shortVerse = 'Приспів';
  await win.evaluate(({ longVerse, shortVerse }) => {
    window.state.splitCfg.on = false;
    const song = { id: 999001, title: 'ТЕСТ Стабільний розмір', verses: [longVerse, shortVerse] };
    window.selectSong(song);
  }, { longVerse, shortVerse });
  await win.waitForTimeout(300);

  // --- Крок 1: перший показ пісні (АВТОМАТИЧНЕ фіксування при зміні пісні) ---
  await win.evaluate(() => window.songStep(0)); // слайд 0 (довгий куплет)
  await win.waitForTimeout(600);
  const sizeLongAuto = await fontSizeOf(proj);
  await win.evaluate(() => window.songStep(1)); // слайд 1 (короткий приспів)
  await win.waitForTimeout(600);
  const sizeShortAuto = await fontSizeOf(proj);
  console.log('АВТО-фіксація: розмір на довгому =', sizeLongAuto, ' на короткому =', sizeShortAuto);
  record('Авто-фіксація при зміні пісні тримає ОДНАКОВИЙ розмір на довгому й короткому куплеті',
    sizeLongAuto != null && sizeShortAuto != null && sizeLongAuto === sizeShortAuto,
    'long=' + sizeLongAuto + 'px short=' + sizeShortAuto + 'px');
  await safeShot(proj, path.join(SHOTS_DIR, '15-font-lock-auto-short.png'));

  // --- Крок 2: ручна кнопка "📏 Зафіксувати розмір під поточну пісню" ---
  // Спершу скидаємо (щоб перевірити саме дію кнопки, а не залишок кроку 1)
  await win.evaluate(() => { window.state.songSize[1] = null; window.state.songSize[2] = null; window.state.songSize[3] = null; window.state.songSize[4] = null; });
  await win.evaluate(() => window.songStep(0));
  await win.waitForTimeout(400);
  await win.evaluate(() => window.lockSizeForSong());
  await win.waitForTimeout(400);
  const sizeAfterManualLock = await fontSizeOf(proj);
  await win.evaluate(() => window.songStep(1));
  await win.waitForTimeout(400);
  const sizeShortAfterManualLock = await fontSizeOf(proj);
  record('Кнопка "📏 Зафіксувати" тримає розмір і на короткому слайді після неї',
    sizeAfterManualLock != null && sizeAfterManualLock === sizeShortAfterManualLock,
    'lock=' + sizeAfterManualLock + 'px short-after=' + sizeShortAfterManualLock + 'px');

  // --- Крок 3: A+/A- задає точний розмір і тримається на ІНШІЙ пісні ---
  await win.evaluate(() => window.songSizeStep(20)); // явно збільшуємо
  await win.waitForTimeout(400);
  const manualSize = await fontSizeOf(proj);
  const expected = await win.evaluate(() => window.state.songSize[1]);
  record('A+ виставляє точний заданий розмір на проекторі', manualSize === expected, 'expected=' + expected + 'px got=' + manualSize + 'px');

  // Інша пісня — розмір має ЗАЛИШИТИСЬ (не скинутись на авто)
  await win.evaluate(() => {
    const song2 = { id: 999002, title: 'ТЕСТ Друга пісня', verses: ['Інший текст іншої пісні'] };
    window.selectSong(song2);
  });
  await win.evaluate(() => window.songStep(0));
  await win.waitForTimeout(400);
  const sizeOnNextSong = await fontSizeOf(proj);
  record('Заданий A+/A- розмір переходить на НАСТУПНУ пісню (не скидається)', sizeOnNextSong === expected, 'expected=' + expected + 'px got=' + sizeOnNextSong + 'px');

  // --- Крок 4а: "↺ Авто" повертає з РУЧНОГО розміру на авто-фіксацію
  // ПІД ПІСНЮ (не під слайд! так і задокументовано в самій картці:
  // «"↺ Авто" повертає підбір під кожну пісню») — тобто розмір і після
  // цього має триматись ОДНАКОВИМ на довгому й короткому слайді.
  await win.evaluate(({ longVerse, shortVerse }) => {
    const song3 = { id: 999003, title: 'ТЕСТ Скидання', verses: [longVerse, shortVerse] };
    window.selectSong(song3);
  }, { longVerse, shortVerse });
  await win.evaluate(() => window.songSizeReset());
  await win.waitForTimeout(400);
  const sizeLongAfterAuto = await fontSizeOf(proj);
  await win.evaluate(() => window.songStep(1));
  await win.waitForTimeout(400);
  const sizeShortAfterAuto = await fontSizeOf(proj);
  console.log('Після "↺ Авто" (підбір під пісню): довгий =', sizeLongAfterAuto, ' короткий =', sizeShortAfterAuto);
  record('"↺ Авто" тримає ОДНАКОВИЙ розмір на довгому й короткому слайді (авто-фіксація під пісню, а не ручний розмір)',
    sizeLongAfterAuto != null && sizeShortAfterAuto != null && sizeLongAfterAuto === sizeShortAfterAuto,
    'long=' + sizeLongAfterAuto + 'px short=' + sizeShortAfterAuto + 'px');

  // --- Крок 4б: окрема кнопка "↺ Скинути (розмір під кожен слайд)" —
  // справжній розрив фіксації: короткий слайд після неї має бути БІЛЬШИМ
  // за довгий (кожен слайд підганяється сам по собі).
  await win.evaluate(() => window.songStep(0)); // повертаємось на довгий слайд
  await win.waitForTimeout(400);
  await win.evaluate(() => window.electronAPI.setFitGroup([], null));
  await win.waitForTimeout(400);
  const sizeLongAfterReset = await fontSizeOf(proj);
  await win.evaluate(() => window.songStep(1));
  await win.waitForTimeout(400);
  const sizeShortAfterReset = await fontSizeOf(proj);
  console.log('Після "↺ Скинути (під кожен слайд)": довгий =', sizeLongAfterReset, ' короткий =', sizeShortAfterReset);
  record('"↺ Скинути (розмір під кожен слайд)" знову підбирає розмір ОКРЕМО під кожен слайд (короткий > довгого)',
    sizeLongAfterReset != null && sizeShortAfterReset != null && sizeShortAfterReset > sizeLongAfterReset,
    'long=' + sizeLongAfterReset + 'px short=' + sizeShortAfterReset + 'px');
  await safeShot(proj, path.join(SHOTS_DIR, '16-font-reset-short.png'));

  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ', e));
  const allOk = results.every(r => r.ok) && consoleErrors.length === 0;
  console.log('\n' + (allOk ? 'УСІ ПЕРЕВІРКИ ПРОЙШЛИ' : 'Є ПРОВАЛИ'));
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

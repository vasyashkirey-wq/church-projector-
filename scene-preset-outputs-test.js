// Перевірка: сцена-пресет тепер пам'ятає, які виходи мали бути відкриті,
// і при застосуванні (1) сама відкриває ті, що потрібні, (2) пропонує
// закрити зайві, якщо вони зараз відкриті.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const results = [];
function record(step, ok, note) { results.push({ step, ok, note }); console.log((ok ? '✓' : '✗') + ' ' + step + (note ? ' — ' + note : '')); }

(async () => {
  const electronPath = require('electron');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'church-projector-test-'));
  const app = await electron.launch({ executablePath: electronPath, args: [path.join(__dirname), '--no-sandbox', '--disable-gpu', '--user-data-dir=' + userDataDir] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000);

  // Сцена «Репетиція»: відкриваємо лише Вихід 1, зберігаємо сцену.
  await win.evaluate(() => window.pv2OpenOutput(1));
  await win.waitForTimeout(500);
  // Мокаємо pv2Prompt (він асинхронний/UI-діалоговий) — прямо викликаємо callback з ім'ям.
  const sceneId = await win.evaluate(() => {
    return new Promise((resolve) => {
      window.pv2Prompt = function(msg, def, cb) { cb('Репетиція'); };
      window.saveScenePreset();
      setTimeout(() => resolve(window.state.scenePresets[window.state.scenePresets.length - 1].id), 100);
    });
  });
  record('Сцену «Репетиція» збережено з openOutputs=[1]', !!sceneId);
  const savedOpenOutputs = await win.evaluate((id) => window.state.scenePresets.find(p => p.id === id).openOutputs, sceneId);
  record('Сцена справді запам\'ятала лише Вихід 1 як відкритий', JSON.stringify(savedOpenOutputs) === '[1]', JSON.stringify(savedOpenOutputs));

  // Тепер відкриваємо ЩЕ Вихід 2 і 3 (типу оператор далі працював) і застосовуємо сцену «Репетиція» —
  // вона мала б (а) не займатись Виходом 1 (вже відкритий), (б) запропонувати закрити 2 і 3.
  await win.evaluate(() => window.pv2OpenOutput(2));
  await win.evaluate(() => window.pv2OpenOutput(3));
  await win.waitForTimeout(500);

  // Перехоплюємо window.confirm — маємо побачити питання про закриття 2 і 3, відповідаємо "так".
  let confirmMsg = null;
  await win.evaluate(() => {
    window._origConfirm = window.confirm;
    window.confirm = function(msg) { window._lastConfirmMsg = msg; return true; };
  });
  await win.evaluate((id) => window.applyScenePreset(id), sceneId);
  await win.waitForTimeout(800);
  confirmMsg = await win.evaluate(() => window._lastConfirmMsg);
  console.log('confirm message:', confirmMsg);
  record('Застосування сцени спитало про закриття зайвих виходів (2, 3)',
    !!confirmMsg && confirmMsg.includes('Трансляція') && confirmMsg.includes('Вихід 3'), confirmMsg);

  const finalOpen = await win.evaluate(() => [1,2,3,4].filter(n => window.state.outputStates[n] && window.state.outputStates[n].open));
  record('Після підтвердження лишився відкритим ЛИШЕ Вихід 1', JSON.stringify(finalOpen) === '[1]', JSON.stringify(finalOpen));

  const allOk = results.every(r => r.ok);
  await app.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

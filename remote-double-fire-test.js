// Живий тест фіксу подвійного спрацювання пульта на blackout/freeze/plan-item:
// theme-remote.js і extras-3.js обидва слухають той самий IPC-канал
// 'remote-command'. До фіксу overlapping-список не містив ці 3 дії, тож
// toggleBlackout()/toggleFreeze() викликались ДВІЧІ за одну команду й
// скасовували самі себе. Тест шле РЕАЛЬНУ HTTP-команду (як Stream Deck) і
// перевіряє, що стан toggled РІВНО ОДИН раз.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve({status:res.statusCode, body:b})); }).on('error', reject);
  });
}

const results = [];
function record(step, ok, note) { results.push({ step, ok, note }); console.log((ok?'✓':'✗')+' '+step+(note?' — '+note:'')); }

(async () => {
  const electronPath = require('electron');
  // Ізольований профіль на кожен запуск — інакше localStorage/кеш
  // накопичуються в спільному userData між прогонами тестів і з часом
  // ламають щось непов'язане (app://-схему, GPU-кеш) непередбачувано.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'church-projector-test-'));
  const app = await electron.launch({ executablePath: electronPath, args: [path.join(__dirname), '--no-sandbox', '--disable-gpu', '--user-data-dir=' + userDataDir] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000);

  await win.evaluate(() => window.electronAPI.startRemote('9999', []));
  await win.waitForTimeout(300);

  // --- Blackout: один HTTP-виклик має ввімкнути (true), не лишити false ---
  const before = await win.evaluate(() => !!state.blackout);
  await get('http://127.0.0.1:3939/api/blackout?pin=9999');
  await win.waitForTimeout(400);
  const after = await win.evaluate(() => !!state.blackout);
  record('Blackout: 1 HTTP-команда → стан toggled РІВНО один раз (false→true)', before === false && after === true,
    'before=' + before + ' after=' + after);

  // Повертаємо назад, перевіряємо і в цей бік
  await get('http://127.0.0.1:3939/api/blackout?pin=9999');
  await win.waitForTimeout(400);
  const after2 = await win.evaluate(() => !!state.blackout);
  record('Blackout: другий виклик повертає назад (true→false)', after2 === false, 'after2=' + after2);

  // --- Freeze: аналогічно, через state.frozen[1..4] ---
  const frozenBefore = await win.evaluate(() => [1,2,3,4].every(n => state.frozen[n]));
  await get('http://127.0.0.1:3939/api/freeze?pin=9999');
  await win.waitForTimeout(400);
  const frozenAfter = await win.evaluate(() => [1,2,3,4].every(n => state.frozen[n]));
  record('Freeze: 1 HTTP-команда → усі 4 виходи заморожені (не скасувалось)', frozenBefore === false && frozenAfter === true,
    'before=' + frozenBefore + ' after=' + frozenAfter);

  console.log('\n' + results.filter(r=>r.ok).length + '/' + results.length + ' пройшло');
  await app.close();
  process.exit(results.every(r=>r.ok) ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

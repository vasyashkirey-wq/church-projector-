// Живий тест rate-limit на /api/ (захист від перебору PIN): реальний
// Electron, реальний HTTP-запит на http://127.0.0.1:3939/api/... — не
// виклик функції напряму, а справжній мережевий запит, як зробив би
// зловмисник чи Stream Deck.
const { _electron: electron } = require('playwright');
const path = require('path');
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

const results = [];
function record(step, ok, note) { results.push({ step, ok, note }); console.log((ok ? '✓' : '✗') + ' ' + step + (note ? ' — ' + note : '')); }

(async () => {
  const electronPath = require('electron');
  const app = await electron.launch({ executablePath: electronPath, args: [path.join(__dirname), '--no-sandbox', '--disable-gpu'] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2000);

  const info = await win.evaluate(() => window.electronAPI.startRemote('1234', []));
  record('HTTP-сервер запущено', !!(info && info.port === 3939), JSON.stringify(info));
  await win.waitForTimeout(300);

  // 1) Правильний PIN працює
  const okReq = await get('http://127.0.0.1:3939/api/?pin=1234');
  record('Правильний PIN → 200', okReq.status === 200, 'status=' + okReq.status);

  // 2) 10 підряд невдалих спроб → потім блок 429
  let lastFailStatus = null;
  for (let i = 0; i < 10; i++) {
    const r = await get('http://127.0.0.1:3939/api/?pin=0000');
    lastFailStatus = r.status;
  }
  record('10 невдалих PIN підряд повертають 401', lastFailStatus === 401, 'останній status=' + lastFailStatus);

  const blockedReq = await get('http://127.0.0.1:3939/api/?pin=0000');
  record('11-та спроба (той самий IP) → 429 (заблоковано)', blockedReq.status === 429,
    'status=' + blockedReq.status + ' retry-after=' + blockedReq.headers['retry-after']);

  // 3) Заблоковано навіть із ПРАВИЛЬНИМ PIN — блок по IP, не по PIN
  const blockedEvenCorrect = await get('http://127.0.0.1:3939/api/?pin=1234');
  record('Заблокований IP не проходить навіть із правильним PIN', blockedEvenCorrect.status === 429,
    'status=' + blockedEvenCorrect.status);

  // 4) /api/state і /api/docs (нові ендпоїнти) — з правильним PIN мають вже пройти,
  // якщо не блок; перевіряємо просто що вони існують і повертають JSON, окремим
  // процесом (новий 'start-remote' не скине лічильник) — тому лише перевіряємо
  // формат відповіді на явно заблокованому і чекаємо саме 429, не 400/404.
  const docsBlocked = await get('http://127.0.0.1:3939/api/docs?pin=1234');
  record('/api/docs теж підпадає під блок IP (не обхід через новий шлях)', docsBlocked.status === 429,
    'status=' + docsBlocked.status);

  console.log('\n' + results.filter(r => r.ok).length + '/' + results.length + ' пройшло');
  await app.close();
  process.exit(results.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

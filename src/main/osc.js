// ============================================================
// OSC-тригери (UDP-сервер на порту 9000) — альтернатива MIDI: зовнішній
// контролер/додаток шле OSC-повідомлення на адресу (напр. /1/push1),
// застосунок зіставляє адресу з дією (так само, як MIDI зіставляє ноту)
// і шле 'osc-action' у рендерер.
//
// Винесено з main.js (продовження модуляризації, за зразком
// src/main/app-menu.js і src/main/office-extract.js). На відміну від
// office-extract.js, тут ОДНА залежність від стану головного процесу —
// активне вікно (mainWin), яке передається через getMainWin() (гетер,
// а не значення!) — register() викликається один раз при старті,
// задовго до того, як mainWin взагалі створюється, тож саме значення
// на той момент було б null; гетер читає актуальне вікно щоразу, коли
// реально приходить OSC-повідомлення чи виклик з рендерера.
// ============================================================
const path = require('path');
const { app } = require('electron');

let oscServer = null;
const oscPort = 9000;
let oscMap = {}; // { 'action': '/osc/address' }
let oscLearn = null;

function padOscString(s) {
  const len = Math.ceil((s.length + 1) / 4) * 4;
  const buf = Buffer.alloc(len);
  buf.write(s, 'utf8');
  return buf;
}
// Простий парсер OSC-пакетів: витягує адресу
// OSC формат: нульо-терміноване рядок адреси, вирівняне до 4 байт, потім теги & дані (ми їх ігноруємо)
function parseOscAddress(data) {
  if (data.length < 4) return null;
  let nullIdx = data.indexOf(0);
  if (nullIdx < 1 || nullIdx > data.length - 5) return null;
  const addr = data.slice(0, nullIdx).toString('utf8');
  if (addr[0] !== '/') return null;
  return addr;
}

function startOscServer(mainWin) {
  if (oscServer) return;
  const dgram = require('dgram');
  oscServer = dgram.createSocket('udp4');
  oscServer.on('message', (msg) => {
    const addr = parseOscAddress(msg);
    if (!addr) return;
    // Якщо учимо адресу
    if (oscLearn) {
      oscMap[oscLearn] = addr;
      // Записуємо на диск одразу — інакше вивчена прив'язка жила лише в пам'яті,
      // а 'start-osc-server' (напр. при наступному запуску сервера чи програми)
      // безумовно перечитує osc-map.json і тихо стирала б щойно вивчене.
      try {
        const fs = require('fs');
        const cfgPath = path.join(app.getPath('userData'), 'osc-map.json');
        fs.writeFileSync(cfgPath, JSON.stringify(oscMap), 'utf8');
      } catch (e) {}
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('osc-learned', { action: oscLearn, address: addr });
      }
      oscLearn = null;
      return;
    }
    // Шукаємо дію по адресі і виконуємо
    const action = Object.keys(oscMap).find(a => oscMap[a] === addr);
    if (action && mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('osc-action', { action: action, from: 'OSC' });
    }
  });
  oscServer.on('error', (err) => {
    console.log('OSC error:', err);
  });
  oscServer.bind(oscPort, '0.0.0.0');
}
function stopOscServer() {
  if (oscServer) {
    oscServer.close();
    oscServer = null;
  }
}

function register(ipcMain, getMainWin) {
  ipcMain.handle('start-osc-server', (event, opts) => {
    const mainWin = getMainWin();
    if (mainWin && !mainWin.isDestroyed()) {
      try {
        const fs = require('fs');
        const cfgPath = path.join(app.getPath('userData'), 'osc-map.json');
        if (fs.existsSync(cfgPath)) {
          oscMap = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        }
      } catch (e) {}
      startOscServer(mainWin);
      return { port: oscPort, status: 'listening' };
    }
  });
  ipcMain.handle('stop-osc-server', () => {
    stopOscServer();
    return 'stopped';
  });
  ipcMain.handle('osc-learn', (event, action) => {
    oscLearn = action;
    return 'learning ' + action;
  });
  ipcMain.handle('osc-clear', (event, action) => {
    delete oscMap[action];
    try {
      const fs = require('fs');
      const cfgPath = path.join(app.getPath('userData'), 'osc-map.json');
      fs.writeFileSync(cfgPath, JSON.stringify(oscMap), 'utf8');
    } catch (e) {}
    return 'cleared';
  });
  ipcMain.handle('osc-get-map', () => oscMap);
}

module.exports = { register, startOscServer, stopOscServer, parseOscAddress, padOscString };

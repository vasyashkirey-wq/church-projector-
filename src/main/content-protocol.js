// ============================================================
// КАСТОМНА ПРИВІЛЕЙОВАНА СХЕМА app:// ДЛЯ КОНТЕНТУ OUTPUT-ВІКОН
//
// НАВІЩО (аудит, розділ 4.1 — «безпека output-вікон»):
// output-вікна досі створюються з webSecurity:false +
// allowRunningInsecureContent:true + contextIsolation:false. Причина
// історична: увесь показуваний контент (HTML-оверлеї, GDD-графіка,
// H2R-титри, фони, сторінки PDF/PPTX) вантажиться в <iframe> через
// file://, а Chromium вважає КОЖЕН file://-документ окремим,
// «непрозорим» походженням (opaque origin). Через це file://-сторінка
// не може читати сусідні file://-ресурси (зображення/шрифти/скрипти,
// на які вона посилається), і єдиним швидким виходом свого часу було
// просто вимкнути webSecurity.
//
// ЩО РОБИТЬ ЦЕЙ МОДУЛЬ:
// реєструє власну схему app://content/<id>, яка (на відміну від
// file://) має НОРМАЛЬНЕ, спільне походження — отже ресурси одного
// оверлея бачать одне одного без вимкненої безпеки. Це прибирає саму
// ПРИЧИНУ, через яку webSecurity:false колись знадобився.
//
// ВАЖЛИВО — ЦЕЙ КРОК НІЧОГО НЕ ВМИКАЄ І НЕ ВИМИКАЄ САМ ПО СОБІ.
// Він лише додає паралельний, безпечніший канал доставки контенту.
// Перемикання самих output-вікон на contextIsolation:true/
// webSecurity:true — окремий, наступний крок, який робиться ПІСЛЯ
// того, як цей канал перевірено в бою на всіх типах контенту
// (H2R, GDD, фони, PDF-слайди, PPTX). Ламати живу систему, якою
// церква користується щонеділі, одним великим стрибком — не варіант.
//
// СУМІСНІСТЬ: write-html-overlay і далі повертає file://-URL, як
// раніше. Новий канал доступний окремо (write-html-overlay-app), тож
// стара й нова доставка можуть співіснувати, доки не завершиться
// перевірка. Жоден наявний виклик не змінює поведінки.
// ============================================================
const path = require('path');
const fs = require('fs');
const os = require('os');

// Вміст тримаємо В ПАМʼЯТІ, а не в тимчасових файлах: тимчасові файли
// були другою причиною file://-прив'язки, і за ними доводилось стежити
// (ротація останніх 12 у write-html-overlay, прибирання при старті).
// Тут же — просто Map, яка чиститься тим самим правилом «останні N».
const contentStore = new Map();   // id -> { html, ts }
const MAX_ITEMS = 24;             // вдвічі більше за старий ліміт у 12 файлів
let seq = 0;

function putContent(html) {
  const id = 'c' + (++seq) + '-' + Date.now().toString(36);
  contentStore.set(id, { html: html, ts: Date.now() });
  // Ротація: тримаємо лише останні MAX_ITEMS. Один і той самий оверлей
  // може бути показаний одразу на кількох виходах, тому запас потрібен —
  // це та сама причина, через яку в старому write-html-overlay тримали
  // вікно з 12 файлів, а не видаляли попередній одразу.
  while (contentStore.size > MAX_ITEMS) {
    const oldestKey = contentStore.keys().next().value;
    contentStore.delete(oldestKey);
  }
  return id;
}

function getContent(id) {
  const item = contentStore.get(id);
  return item ? item.html : null;
}

// Викликати ДО app.whenReady() — вимога Electron для
// registerSchemesAsPrivileged.
function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'app',
    privileges: {
      standard: true,        // нормальне походження (не opaque, як file://)
      secure: true,          // вважається безпечним контекстом
      supportFetchAPI: true, // fetch() усередині оверлея працює
      corsEnabled: true,
      stream: true           // потрібне для media (відео-фони)
    }
  }]);
}

// Викликати ПІСЛЯ app.whenReady().
function registerHandler(protocol) {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    // app://content/<id>  → HTML з памʼяті
    if (url.hostname === 'content') {
      const id = url.pathname.replace(/^\//, '');
      const html = getContent(id);
      if (html == null) {
        return new Response('<!DOCTYPE html><html><body style="background:transparent"></body></html>',
          { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    // app://file/<абсолютний-шлях> → локальний файл (медіа/шрифти/PDF,
    // на які посилається оверлей). Свідомо обмежено: лише тимчасова тека
    // застосунку й тека даних користувача — щоб оверлей не міг прочитати
    // будь-що з диска.
    if (url.hostname === 'file') {
      const raw = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const resolved = path.resolve(raw);
      const allowedRoots = [os.tmpdir(), process.env.CHURCH_USERDATA || ''].filter(Boolean).map(p => path.resolve(p));
      const ok = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep));
      if (!ok || !fs.existsSync(resolved)) return new Response('', { status: 403 });
      return new Response(fs.readFileSync(resolved));
    }
    return new Response('', { status: 400 });
  });
}

function register(ipcMain) {
  // Паралельний до write-html-overlay канал. Повертає app://-URL.
  // Наявний write-html-overlay НЕ чіпаємо — він і далі віддає file://,
  // тож жоден поточний виклик не змінює поведінки.
  ipcMain.handle('write-html-overlay-app', (event, htmlContent) => {
    const id = putContent(htmlContent);
    return 'app://content/' + id;
  });
}

module.exports = { registerScheme, registerHandler, register, putContent, getContent };

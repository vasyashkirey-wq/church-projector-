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
// СТАТУС: аудит 4.1 ЗАКРИТО. Цей модуль створювався як фундамент, і
// після живої перевірки (реальний Electron + Playwright, окреме вікно
// проектора, 4 типи контенту, 9/9 кроків, 0 console-помилок) захист на
// output-вікнах УВІМКНЕНО: contextIsolation:true, webSecurity:true,
// allowRunningInsecureContent:false (див. main.js, createOutputWindow).
//
// ВАЖЛИВО ПРО СУСІДНІ ФАЙЛИ: app://content/<id> віддає лише сам HTML із
// памʼяті. Відносне посилання всередині нього (напр. <img src="pic.png">)
// зарезолвиться в app://content/pic.png і поверне 404 — сусідні файли
// цією схемою НЕ обслуговуються. Для цього застосунку це не проблема:
// жоден тип контенту на них не покладається — HTML-оверлеї/GDD
// імпортуються як ТЕКСТ одного файлу (readAsText у html-overlay.js),
// PDF/PPTX малюються в canvas і вставляються як dataURL, фони — CSS або
// dataURL. Якщо колись зʼявиться справжній багатофайловий пакет, схему
// треба буде розширити (напр. app://pkg/<id>/<файл>), а не покладатись
// на нинішню поведінку.
//
// СУМІСНІСТЬ: write-html-overlay і далі повертає file://-URL, як
// раніше. Новий канал доступний окремо (write-html-overlay-app), а
// перемикач у Налаштуваннях дає миттєвий відкат без перезбірки.
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

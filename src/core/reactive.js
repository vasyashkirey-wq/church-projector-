// ============================================================
// РЕАКТИВНИЙ ШАР (Варіант 2, крок 1) — ПАКЕТНИЙ ПЕРЕРЕНДЕР
//
// ПРОБЛЕМА, ЯКУ ЦЕ ВИРІШУЄ:
// зараз по всьому коду ~187 ручних викликів renderTabInto()/render*()
// одразу після ~210 змін state. Звідси цілий КЛАС багів, які ми вже
// ловили в цьому проєкті:
//   • забули викликати рендер → кнопка не оновилась (renderBibleOutputRow,
//     refreshMultiTransCard — обидва довелось дописувати вручну);
//   • викликали ЗАЙВЕ → вкладка перемальовується 3-4 рази поспіль на одну
//     дію користувача (кожен рендер це host.innerHTML = fn(), тобто повне
//     перестворення DOM + повторний переклад через uiTranslateNode).
//
// ЩО РОБИТЬ ЦЕЙ МОДУЛЬ:
// markDirty('tabId') позначає вкладку «брудною», а фактичний перерендер
// відбувається ОДИН раз наприкінці поточного тика (microtask). Тобто
// десять markDirty() підряд = один реальний перемальовок.
//
// ЧОГО ЦЕЙ МОДУЛЬ НЕ РОБИТЬ (навмисно):
// не замінює розмітку, не вводить віртуальний DOM, не чіпає жоден
// наявний виклик renderTabInto. Це ДОДАТКОВИЙ, паралельний шлях —
// точно як app://-канал у фазі 1. Наявний код працює як працював;
// нове використовує markDirty. Переводити виклики можна поступово,
// вкладка за вкладкою, як робилась модуляризація.
//
// ЧОМУ НЕ ПОВНОЦІННІ SIGNALS/PROXY НА state:
// обгортання state у Proxy перехопило б усі 210 присвоєнь автоматично —
// але й зламало б усе, що покладається на пряме читання/серіалізацію
// state (saveJSON, station-sync, broadcastRemoteState), а це ядро
// системи. Пакетний markDirty дає 80% користі за 5% ризику.
// ============================================================

// ============================================================
// rafDebounce — відкладає важку операцію до наступного кадру, склеюючи
// серію викликів в один.
//
// ЖИВЕ САМЕ ТУТ (а не в extras-1.js, де було раніше), бо цей файл
// підключається ПЕРШИМ серед логіки. Файли background.js,
// html-overlay.js, song-display.js, song-edit.js, tabs/media/media.js
// підключені ДО extras-1.js, а їхні render-функції обгорнуті в
// rafDebounce і викликаються вже під час старту (напр. initBgLibrary).
// Поки визначення лежало в extras-1.js, застосунок падав на старті з
// «rafDebounce is not defined» — hoisting не рятує, бо він діє в межах
// одного файлу, а не між файлами.
// ============================================================
function rafDebounce(fn) {
  let pending = false, lastArgs = null;
  return function(...args) {
    lastArgs = args;
    if (pending) return;
    pending = true;
    const run = () => { pending = false; fn.apply(null, lastArgs); };
    (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(run) : setTimeout(run, 16);
  };
}

// Вкладки, які чекають на перемальовку в цьому тику
const _dirtyTabs = new Set();
// Вкладки, які стали «брудними», поки були НЕВИДИМІ. Їх не малюємо
// одразу (це марна робота), але й НЕ забуваємо — інакше вони показали б
// застарілий вміст при відкритті.
//
// Це принципово для ЦІЄЇ архітектури: showTab() лише перемикає CSS-клас
// .active, а вміст вкладок будується ОДИН раз при старті (TABS.forEach
// у pv2Init). Тобто відкриття вкладки саме по собі нічого не
// перемальовує — тому «пропустити невидиму» без запамʼятовування
// означало б показати застарілі дані.
const _dirtyHidden = new Set();
// Довільні callback-и (для дрібних фрагментів, не цілих вкладок)
const _dirtyFns = new Map();   // key -> fn
let _flushScheduled = false;
let _flushDepth = 0;           // захист від рекурсії (рендер, що сам кличе markDirty)

function _flush() {
  _flushScheduled = false;
  if (_flushDepth > 0) return;   // вже всередині flush — не вкладаємось
  _flushDepth++;
  try {
    // Копіюємо й одразу чистимо: якщо під час рендера хтось знову
    // покличе markDirty (легально — напр. рендер підвантажив дані),
    // це потрапить у НАСТУПНИЙ тик, а не зациклить поточний.
    const tabs = Array.from(_dirtyTabs);
    _dirtyTabs.clear();
    const fns = Array.from(_dirtyFns.values());
    _dirtyFns.clear();

    for (const tabId of tabs) {
      try {
        // Невидиму вкладку не малюємо зараз (економія), але запамʼятовуємо —
        // намалюємо при її відкритті через flushTabOnShow().
        if (typeof isActive === 'function' && !isActive(tabId)) { _dirtyHidden.add(tabId); continue; }
        if (typeof renderTabInto === 'function') renderTabInto(tabId);
      } catch (e) {
        console.error('reactive: перемальовка вкладки «' + tabId + '» впала —', e);
      }
    }
    for (const fn of fns) {
      try { fn(); } catch (e) { console.error('reactive: callback впав —', e); }
    }
  } finally {
    _flushDepth--;
  }
}

// Викликається з showTab() у момент відкриття вкладки: якщо поки вона
// була схована, її дані змінились — домальовуємо саме тут, один раз.
function flushTabOnShow(tabId) {
  if (!tabId || !_dirtyHidden.has(tabId)) return;
  _dirtyHidden.delete(tabId);
  try {
    if (typeof renderTabInto === 'function') renderTabInto(tabId);
  } catch (e) {
    console.error('reactive: відкладена перемальовка «' + tabId + '» впала —', e);
  }
}

function _schedule() {
  if (_flushScheduled) return;
  _flushScheduled = true;
  // microtask: спрацює після поточного синхронного коду, але ДО
  // перемальовки браузером — тобто користувач не побачить проміжного
  // стану, і водночас усі зміни одного оброблювача склеяться в одну.
  Promise.resolve().then(_flush);
}

// Позначити вкладку такою, що потребує перемальовки.
// Багато викликів поспіль = один реальний рендер.
function markDirty(tabId) {
  if (!tabId) return;
  _dirtyTabs.add(tabId);
  _schedule();
}

// Те саме для довільного фрагмента (не цілої вкладки). key потрібен,
// щоб повторні виклики з тим самим ключем склеювались в один.
function markDirtyFn(key, fn) {
  if (!key || typeof fn !== 'function') return;
  _dirtyFns.set(key, fn);
  _schedule();
}

// Для тестів і діагностики: виконати все негайно, не чекаючи тика.
function flushNow() {
  _flushScheduled = false;
  _flush();
}

// Скільки зараз у черзі (діагностика/тести)
function pendingCount() {
  return _dirtyTabs.size + _dirtyFns.size;
}

// Скільки схованих вкладок чекають на перемальовку при відкритті
function pendingHiddenCount() {
  return _dirtyHidden.size;
}

if (typeof window !== 'undefined') {
  window.markDirty = markDirty;
  window.markDirtyFn = markDirtyFn;
  window.flushNow = flushNow;
  window.flushTabOnShow = flushTabOnShow;
  window.reactivePending = pendingCount;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { markDirty, markDirtyFn, flushNow, flushTabOnShow, pendingCount, pendingHiddenCount };
}

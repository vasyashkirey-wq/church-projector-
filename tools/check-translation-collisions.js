#!/usr/bin/env node
// ============================================================
// Самоперевірка словника перекладу (src/ui-translations.js)
// ============================================================
// Формалізація ручного пошуку, зробленого 2026-08-29 під час рев'ю багів
// (знайшов і виправив 8 реальних колізій: "Маршрут"/"нота"/"⬇ Експорт"/
// "🔗 Підключити"/"Макрос"/"Назва"/"Слайд"/"хв"/"🖼 Фон"/"Фон").
//
// Проблема, яку ловить цей скрипт: uiTranslateText() робить ПІДРЯДКОВУ
// заміну (.split(key).join(translation)), а не заміну лише повних слів.
// Якщо ключ словника — коротке слово, що є ПОЧАТКОМ/ЧАСТИНОЮ довшого
// реального слова інтерфейсу (напр. ключ "Слайд" всередині "Слайди"),
// переклад ламає це слово навпіл ("Slideи" замість "Slajdy").
//
// Що робить скрипт:
//   1. Бере всі ключі з UI_DICT.
//   2. Шукає кожен ключ у всьому реальному коді програми (src/**).
//   3. Якщо символ ОДРАЗУ перед чи після знайденого збігу — кирилична
//      літера, це підозра: ключ, схоже, «влазить» у довше слово.
//
// Це НЕ 100% автоматичний вирок — частина спрацювань виявляються
// хибними (збіг лише всередині `//` коментаря, який на екран не йде, або
// безпечний, бо в словнику вже є довший ключ, що повністю покриває це
// саме місце і йде першим при сортуванні "найдовший спочатку"). Скрипт
// СТРИМУЄ прості випадки коментарів (прибирає рядки, що починаються з
// `//`, перед пошуком), але фінальну класифікацію решти спрацювань варто
// перевірити вручну через grep — так само, як зроблено того ж дня.
//
// Запуск: npm run check-i18n   (або node tools/check-translation-collisions.js)
// Викликається також автоматично в кінці tools/smoke-test.js.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const DICT_FILE = path.join(SRC_DIR, 'ui-translations.js');

function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (f === 'node_modules' || f === '.git') continue;
      walk(p, out);
    } else if (/\.(js|html)$/.test(f)) {
      out.push(p);
    }
  }
}

// Прибираємо рядки, що ЦІЛКОМ є коментарем (`//`, після trim) — це
// прибирає найбільший клас хибних спрацювань (пояснювальні коментарі в
// коді, які на екран ніколи не потрапляють).
function stripFullLineComments(text) {
  return text
    .split('\n')
    .map(line => (line.trim().startsWith('//') ? '' : line))
    .join('\n');
}

function loadCorpus() {
  const files = [];
  walk(SRC_DIR, files);
  return files
    .filter(f => f !== DICT_FILE) // власні коментарі словника не рахуємо
    .map(f => stripFullLineComments(fs.readFileSync(f, 'utf8')))
    .join('\n');
}

function extractDictKeys() {
  const src = fs.readFileSync(DICT_FILE, 'utf8');
  const m = src.match(/var UI_DICT = \{([\s\S]*?)\n\};/);
  if (!m) throw new Error('Не вдалось знайти UI_DICT у ' + DICT_FILE);
  const keyRe = /^\s*"((?:[^"\\]|\\.)+)":\s*\{/gm;
  const keys = [];
  let mm;
  while ((mm = keyRe.exec(m[1]))) keys.push(mm[1]);
  return keys;
}

function isCyr(ch) {
  return !!ch && /[Ѐ-ӿ]/.test(ch);
}

// Ключі, вручну перевірені 2026-08-29 як БЕЗПЕЧНІ, попри спрацювання —
// у словнику вже є ДОВШИЙ ключ, що повністю покриває кожне реальне
// місце вживання і йде першим (сортування "найдовший спочатку"), тож
// короткий ключ ніколи не встигає зіпсувати текст. Без цього списку
// скрипт кричав би про них щоразу — тут лише вже РОЗІБРАНІ випадки.
const KNOWN_SAFE = {
  'Вірш': 'покрито "⚠️ Вірші не знайдені — переклад Біблії імпортовано?"',
  'Текст': 'єдине спрацювання — у трейлінг-коментарі (не рендериться)',
  'Шрифт': 'покрито "✓ Шрифти застосовано"',
  'В ефір': 'покрито довшим ключем "В ефірі:" (з двокрапкою) — сортування "найдовший спочатку" застосовує його першим',
};

function main() {
  const corpus = loadCorpus();
  const keys = extractDictKeys();
  const flagged = [];

  for (const key of keys) {
    if (key.length < 2) continue;
    if (KNOWN_SAFE[key]) continue;
    // Якщо ключ САМ починається/закінчується пробілом — це вже свідомий
    // обмежувач слова з боку автора ключа: перевіряти сусідній символ З
    // ТОГО Ж БОКУ не має сенсу (звісно, там є якесь інше слово — це просто
    // продовження речення, не колізія). Без цього скрипт хибно кричав би
    // на кожен такий (навмисно безпечний) ключ. Знайдено 2026-08-29 при
    // додаванні партки 12.
    const startsWithSpace = key[0] === ' ';
    const endsWithSpace = key[key.length - 1] === ' ';
    let idx = 0;
    while (true) {
      idx = corpus.indexOf(key, idx);
      if (idx === -1) break;
      const before = startsWithSpace ? null : corpus[idx - 1];
      const after = endsWithSpace ? null : corpus[idx + key.length];
      if (isCyr(before) || isCyr(after)) {
        flagged.push({
          key,
          context: corpus.slice(Math.max(0, idx - 25), idx + key.length + 25).replace(/\n/g, ' '),
        });
        break; // одного прикладу на ключ досить для ручної перевірки
      }
      idx += key.length;
    }
  }

  console.log('Перевірка словника перекладу: ' + keys.length + ' ключів, корпус ' + corpus.length + ' символів.');
  console.log('(' + Object.keys(KNOWN_SAFE).length + ' відомо-безпечних ключів пропущено — вже розібрані вручну.)');

  if (!flagged.length) {
    console.log('✓ Підозрілих підрядкових колізій не знайдено.');
    return 0;
  }

  console.log('');
  console.log('⚠️ Знайдено ' + flagged.length + ' підозрілих ключів (можуть бути хибними — перевір вручну):');
  flagged.forEach(f => {
    console.log('  "' + f.key + '"  →  ...' + f.context + '...');
  });
  console.log('');
  console.log('Це не завжди реальний баг: перевір grep-ом, чи збіг лише в `//`-коментарі');
  console.log('(тоді безпечно) чи є довший ключ, що вже повністю покриває цей текст.');
  return 1;
}

if (require.main === module) {
  process.exit(main());
}
module.exports = { main };

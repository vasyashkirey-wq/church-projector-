// ============================================================
// ФОРМАТИ — універсальний імпорт (formats.js)
// Біблія: JSON, Zefania XML, OSIS XML, USFM/SFM, TXT, CSV
// Пісні:  JSON, TXT, OpenLP XML, ChordPro, CSV, ProPresenter
// Офіс:   PPTX, DOCX (текст слайдів/абзаців → слайди)
// Підключається в index.html ПЕРЕД extras.js.
// ============================================================

// ---- Канонічний порядок 66 книг (збігається з BIBLE_BOOKS) ----
const FMT_ORDER = ['gen','exo','lev','num','deu','jos','jdg','rut','1sa','2sa','1ki','2ki','1ch','2ch',
  'ezr','neh','est','job','psa','pro','ecc','sng','isa','jer','lam','eze','dan','hos','joe','amo','oba',
  'jon','mic','nah','hab','zep','hag','zec','mal','mat','mar','luk','joh','act','rom','1co','2co','gal',
  'eph','php','col','1th','2th','1ti','2ti','tit','phm','heb','jas','1pe','2pe','1jo','2jo','3jo','jud','rev',
  'tob','jdt','wis','sir','bar','1ma','2ma','3ma','2es','3es'];

// USFM-коди та OSIS-ідентифікатори в тому ж порядку
const FMT_USFM = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH',
  'EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA',
  'JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL',
  'EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV',
  'TOB','JDT','WIS','SIR','BAR','1MA','2MA','3MA','1ES','2ES'];

const FMT_OSIS = ['Gen','Exod','Lev','Num','Deut','Josh','Judg','Ruth','1Sam','2Sam','1Kgs','2Kgs','1Chr','2Chr',
  'Ezra','Neh','Esth','Job','Ps','Prov','Eccl','Song','Isa','Jer','Lam','Ezek','Dan','Hos','Joel','Amos','Obad',
  'Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal','Matt','Mark','Luke','John','Acts','Rom','1Cor','2Cor','Gal',
  'Eph','Phil','Col','1Thess','2Thess','1Tim','2Tim','Titus','Phlm','Heb','Jas','1Pet','2Pet','1John','2John','3John','Jude','Rev',
  'Tob','Jdt','Wis','Sir','Bar','1Macc','2Macc','3Macc','1Esd','2Esd'];

// Українські та російські назви/скорочення, які реально трапляються у файлах
const FMT_UA_ALIASES = {
  gen:['буття','бут','битие'], exo:['вихід','вих','исход','виход'], lev:['левит','лев','левіт'], num:['числа','чис'],
  deu:['повторення закону','повт','второзаконие','второзаконня'], jos:['ісус навин','нав','иисус навин'],
  jdg:['суддів','суд','судьи','книга суддів','судді'], rut:['рут','рути','руфь'],
  '1sa':['1 самуїла','1 сам','1 царств','1 самуїлова','1 самуїл'], '2sa':['2 самуїла','2 сам','2 царств','2 самуїлова','2 самуїл'],
  '1ki':['1 царів','1 цар','3 царств'], '2ki':['2 царів','2 цар','4 царств'],
  '1ch':['1 хроніки','1 хр','1 паралипоменон','1 хронік','1 параліпоменон'], '2ch':['2 хроніки','2 хр','2 паралипоменон','2 хронік','2 параліпоменон'],
  ezr:['ездра','езд'], neh:['неемія','неємія','неем'], est:['естер','ест','есфирь'],
  job:['йов','иов'], psa:['псалми','псалом','псалтир','пс','псалтирь','псальми'],
  pro:['приповісті','приказки','притчі','притчи','прип','приповідки'], ecc:['еклезіаст','екл','екклесиаст','екклезіяст','екклезіаст'],
  sng:['пісня пісень','пісн','песнь песней','пісня над піснями'], isa:['ісая','іс','исаия','ісаія'], jer:['єремія','єр','иеремия','еремія'],
  lam:['плач єремії','плач','голосіння'], eze:['єзекіїль','єз','иезекииль','езекіїль','езекиїл'], dan:['даниїл','дан'],
  hos:['осія','ос'], joe:['йоїл','йоил','иоиль','йоіл'], amo:['амос','ам'], oba:['овадія','авдій','авдия','овдій'],
  jon:['йона','иона'], mic:['міхей','михей','мих'], nah:['наум'], hab:['авакум','аввакум'],
  zep:['софонія','соф'], hag:['огій','аггей','анґей'], zec:['захарія','зах'], mal:['малахія','мал','малахії'],
  mat:['матвій','від матвія','матвія','мт','матфея','евангелие от матфея'],
  mar:['марко','від марка','марка','мр','марка'], luk:['лука','від луки','луки','лк'],
  joh:['іван','йоан','від івана','івана','ін','иоанна','иоанн'],
  act:['дії','діяння','дії апостолів','деяния'], rom:['римлян','рим'],
  '1co':['1 коринтян','1 кор','1 до коринтян'], '2co':['2 коринтян','2 кор','2 до коринтян'],
  gal:['галатів','гал'], eph:['ефесян','еф'], php:['филип\'ян','филипян','флп','филиппийцам'],
  col:['колосян','кол','до колоссян','колоссян'], '1th':['1 солунян','1 сол','1 фессалоникийцам','1 до солунян'], '2th':['2 солунян','2 сол','2 до солунян'],
  '1ti':['1 тимофія','1 тим','1 тимофію'], '2ti':['2 тимофія','2 тим','2 тимофію'], tit:['тита','тит'],
  phm:['филимона','флм'], heb:['євреям','євр','евреям','до євреїв','євреїв'], jas:['якова','як','иакова'],
  '1pe':['1 петра','1 пет'], '2pe':['2 петра','2 пет'],
  '1jo':['1 івана','1 ів','1 иоанна'], '2jo':['2 івана','2 ів'], '3jo':['3 івана','3 ів'],
  jud:['юди','иуды','юда'], rev:['об\'явлення','одкровення','об\'явлення івана','откровение','об’явлення'],
  // Другоканонічні книги (переклад Турконяка)
  tob:['товит','товита','tobit'], jdt:['юдит','юдита','иудифь','judith'],
  wis:['премудрість','премудрости','премудрість соломона','премудрость соломона','wisdom','wisdom of solomon','прем'],
  sir:['сирах','сираха','книга сираха','иисуса сына сирахова','sirach','ecclesiasticus','екклезіастик'],
  bar:['варух','варуха','baruch'],
  '1ma':['1 маккавеїв','1 маккавейська','1 маккавейская','1 мак','1 macc','1 maccabees'],
  '2ma':['2 маккавеїв','2 маккавейська','2 маккавейская','2 мак','2 macc','2 maccabees'],
  '3ma':['3 маккавеїв','3 маккавейська','3 маккавейская','3 мак','3 macc','3 maccabees'],
  '2es':['2 ездра','2 ездры','2 езд','1 esdras','2 esdras'],
  '3es':['3 ездра','3 ездры','3 езд','2 esdras','3 esdras','4 ezra']
};

// Нормалізація назви книги: без крапок, апострофів, зайвих пробілів
function fmtNorm(s) {
  return String(s || '').toLowerCase()
    .replace(/[.\u2019'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Єдина таблиця: будь-яка назва/код → внутрішній id книги

// Назви книг англійською, російською та поширені скорочення.
// Без них імпорт JSON/CSV із такими назвами падав із «Не вдалось розпізнати формат».
const FMT_MORE_ALIASES = {
  'gen': ['Genesis', 'Бытие', 'Gn', 'Быт', 'Genesis'],
  'exo': ['Exodus', 'Исход', 'Ex', 'Исх', 'Exodus'],
  'lev': ['Leviticus', 'Левит', 'Lv', 'Лев', 'Leviticus'],
  'num': ['Numbers', 'Числа', 'Nm', 'Чис', 'Numeri'],
  'deu': ['Deuteronomy', 'Второзаконие', 'Dt', 'Втор', 'Deuteronomium'],
  'jos': ['Joshua', 'Иисус Навин', 'Js', 'Нав', 'Jozue'],
  'jdg': ['Judges', 'Книга Судей', 'Jg', 'Суд', 'Soudců'],
  'rut': ['Ruth', 'Руфь', 'Rt', 'Руф', 'Rút'],
  '1sa': ['1 Samuel', '1 Царств', '1Sm', '1Цар', '1 Samuelova'],
  '2sa': ['2 Samuel', '2 Царств', '2Sm', '2Цар', '2 Samuelova'],
  '1ki': ['1 Kings', '3 Царств', '1Kg', '3Цар', '1 Královská'],
  '2ki': ['2 Kings', '4 Царств', '2Kg', '4Цар', '2 Královská'],
  '1ch': ['1 Chronicles', '1 Паралипоменон', '1Ch', '1Пар', '1 Paralipomenon'],
  '2ch': ['2 Chronicles', '2 Паралипоменон', '2Ch', '2Пар', '2 Paralipomenon'],
  'ezr': ['Ezra', 'Ездра', 'Ezr', 'Езд', 'Ezdráš'],
  'neh': ['Nehemiah', 'Неемия', 'Ne', 'Неем', 'Nehemiáš', 'Nehemjáš'],
  'est': ['Esther', 'Есфирь', 'Es', 'Есф', 'Ester'],
  'job': ['Job', 'Иов', 'Jb', 'Иов', 'Jób'],
  'psa': ['Psalms', 'Псалтирь', 'Ps', 'Psalm', 'Пс', 'Псалом', 'Žalmy'],
  'pro': ['Proverbs', 'Притчи', 'Pr', 'Притч', 'Přísloví'],
  'ecc': ['Ecclesiastes', 'Екклесиаст', 'Ec', 'Еккл', 'Kazatel'],
  'sng': ['Song of Solomon', 'Песнь Песней', 'Песни Песней', 'Song', 'Song of Songs', 'SS', 'Песн', 'Píseň písní'],
  'isa': ['Isaiah', 'Исаия', 'Is', 'Ис', 'Izajáš'],
  'jer': ['Jeremiah', 'Иеремия', 'Jr', 'Иер', 'Jeremjáš'],
  'lam': ['Lamentations', 'Плач Иеремии', 'Lm', 'Плач', 'Pláč'],
  'eze': ['Ezekiel', 'Иезекииль', 'Ezk', 'Ez', 'Иез', 'Ezechiel'],
  'dan': ['Daniel', 'Даниил', 'Dn', 'Дан', 'Daniel'],
  'hos': ['Hosea', 'Осия', 'Ho', 'Ос', 'Ozeáš'],
  'joe': ['Joel', 'Иоиль', 'Jl', 'Иоил', 'Jóel'],
  'amo': ['Amos', 'Амос', 'Am', 'Ам', 'Ámos'],
  'oba': ['Obadiah', 'Авдий', 'Ob', 'Авд', 'Abdiáš', 'Abdijáš'],
  'jon': ['Jonah', 'Иона', 'Jon', 'Ион', 'Jonáš'],
  'mic': ['Micah', 'Михей', 'Mi', 'Мих', 'Micheáš'],
  'nah': ['Nahum', 'Наум', 'Na', 'Наум', 'Nahum'],
  'hab': ['Habakkuk', 'Аввакум', 'Hab', 'Авв', 'Abakuk'],
  'zep': ['Zephaniah', 'Софония', 'Zp', 'Соф', 'Sofonjáš'],
  'hag': ['Haggai', 'Аггей', 'Hg', 'Агг', 'Ageus'],
  'zec': ['Zechariah', 'Захария', 'Zc', 'Зах', 'Zacharjáš'],
  'mal': ['Malachi', 'Малахия', 'Ml', 'Мал', 'Malachiáš'],
  'mat': ['Matthew', 'От Матфея', 'Mt', 'Matt', 'Матфея', 'Мф', 'Matouš'],
  'mar': ['Mark', 'От Марка', 'Mk', 'Mrk', 'Марка', 'Мк', 'Marek'],
  'luk': ['Luke', 'От Луки', 'Lk', 'Луки', 'Лк', 'Lukáš'],
  'joh': ['John', 'От Иоанна', 'Jn', 'Иоанна', 'Ин', 'Jan'],
  'act': ['Acts', 'Деяния', 'Ac', 'Деян', 'Skutky', 'Skutky apoštolské'],
  'rom': ['Romans', 'Римлянам', 'Rm', 'Рим', 'Římanům'],
  '1co': ['1 Corinthians', '1 Коринфянам', '1Cor', '1Кор', '1 Korintským'],
  '2co': ['2 Corinthians', '2 Коринфянам', '2Cor', '2Кор', '2 Korintským'],
  'gal': ['Galatians', 'Галатам', 'Gl', 'Гал', 'Galatským'],
  'eph': ['Ephesians', 'Ефесянам', 'Ep', 'Еф', 'Efezským'],
  'php': ['Philippians', 'Филиппийцам', 'Phil', 'Флп', 'Filipským'],
  'col': ['Colossians', 'Колоссянам', 'Cl', 'Кол', 'Koloským'],
  '1th': ['1 Thessalonians', '1 Фессалоникийцам', '1Th', '1Фес', '1 Tesalonickým'],
  '2th': ['2 Thessalonians', '2 Фессалоникийцам', '2Th', '2Фес', '2 Tesalonickým'],
  '1ti': ['1 Timothy', '1 Тимофею', '1Tm', '1Тим', '1 Timoteovi'],
  '2ti': ['2 Timothy', '2 Тимофею', '2Tm', '2Тим', '2 Timoteovi'],
  'tit': ['Titus', 'Титу', 'Tt', 'Тит', 'Titovi'],
  'phm': ['Philemon', 'Филимону', 'Phm', 'Флм', 'Filemonovi'],
  'heb': ['Hebrews', 'Евреям', 'Hb', 'Евр', 'Židům'],
  'jas': ['James', 'Иакова', 'Jm', 'Иак', 'Jakubův'],
  '1pe': ['1 Peter', '1 Петра', '1Pt', '1Пет', '1 Petrův'],
  '2pe': ['2 Peter', '2 Петра', '2Pt', '2Пет', '2 Petrův'],
  '1jo': ['1 John', '1 Иоанна', '1Jn', '1Ин', '1 Janův'],
  '2jo': ['2 John', '2 Иоанна', '2Jn', '2Ин', '2 Janův'],
  '3jo': ['3 John', '3 Иоанна', '3Jn', '3Ин', '3 Janův'],
  'jud': ['Jude', 'Иуды', 'Иуда', 'Jd', 'Иуд', 'Juda', 'Judův'],
  'rev': ['Revelation', 'Откровение', 'Rv', 'Откр', 'Апокалипсис', 'Zjevení', 'Zjevení Janovo'],
};

const FMT_BOOK_MAP = (function() {
  const map = {};
  FMT_ORDER.forEach((id, i) => {
    map[id] = id;
    map[fmtNorm(FMT_USFM[i])] = id;
    map[fmtNorm(FMT_OSIS[i])] = id;
    map[String(i + 1)] = id;                       // Zefania bnumber 1..66
    (FMT_UA_ALIASES[id] || []).forEach(a => { map[fmtNorm(a)] = id; });
    (FMT_MORE_ALIASES[id] || []).forEach(a => { map[fmtNorm(a)] = id; });
  });
  // Українські назви з самого додатку (BIBLE_BOOKS), якщо він уже завантажений
  if (typeof BIBLE_BOOKS !== 'undefined') {
    BIBLE_BOOKS.forEach(b => { map[fmtNorm(b.name)] = b.id; });
  }
  return map;
})();

// Розпізнати книгу за назвою, кодом чи номером. null, якщо не вдалось
// Старі оцифровані українські тексти часто мають латинську "i"/"I" замість
// кириличної "і"/"І" (виглядають однаково, для комп'ютера — різні символи) —
// напр. "Вiд Матвiя" замість "Від Матвія". Через це ціла книга (а в деяких
// файлах — чверть усіх книг) не розпізнавалась попри правильну назву.
function fmtLatinToCyrillic(s) {
  return String(s)
    .replace(/i/g, 'і').replace(/I/g, 'І')
    .replace(/a/g, 'а').replace(/A/g, 'А')
    .replace(/e/g, 'е').replace(/E/g, 'Е')
    .replace(/o/g, 'о').replace(/O/g, 'О')
    .replace(/c/g, 'с').replace(/C/g, 'С')
    .replace(/p/g, 'р').replace(/P/g, 'Р')
    .replace(/x/g, 'х').replace(/X/g, 'Х');
}

// Деякі чеські файли мають пошкоджене кодування САМЕ в назвах книг
// (CP1250, прочитане як Latin-1): ř→ø, ů→ù, ň→ò, č→è. Текст віршів при цьому
// цілий. Відновлюємо назву, щоб книга розпізналась (напр. «Pøísloví»→«Přísloví»).
function fmtFixCzMojibake(s) {
  return String(s)
    .replace(/\u00f8/g, 'ř').replace(/\u00d8/g, 'Ř')
    .replace(/\u00f9/g, 'ů').replace(/\u00d9/g, 'Ů')
    .replace(/\u00f2/g, 'ň').replace(/\u00d2/g, 'Ň')
    .replace(/\u00e8/g, 'č').replace(/\u00c8/g, 'Č');
}

// «1 Коринтян», «1-е Коринтян», «1-ше Коринтян» — той самий номер книги,
// різні позначення порядкового числівника. Зводимо до простого "1 ...".
function fmtStripOrdinal(s) {
  return s.replace(/^(\d)-[а-яіїєґ]+\s+/i, '$1 ');
}
// "Від Матвія" / "До галатів" / "Євангеліє від Луки" — прибираємо префікс,
// яким би не був: "від"/"от" перед Євангеліями, "до" перед посланнями.
function fmtStripPrefix(s) {
  return s.replace(/^(святе\s+)?(євангелі[яє]\s+)?(послання\s+)?(від|от|до|к)\s+/, '');
}

function fmtBookId(raw) {
  if (raw == null) return null;
  const variants = [String(raw), fmtLatinToCyrillic(String(raw)), fmtFixCzMojibake(String(raw))];   // з латиницею, кирилицею й відновленим чеським кодуванням
  for (const v of variants) {
    let n = fmtNorm(v);
    n = fmtStripOrdinal(n);
    if (FMT_BOOK_MAP[n]) return FMT_BOOK_MAP[n];
    const stripped = fmtStripPrefix(n);
    if (FMT_BOOK_MAP[stripped]) return FMT_BOOK_MAP[stripped];
  }
  // OSIS-ідентифікатор виду "Gen.1.1" — беремо частину до крапки
  const head = fmtNorm(String(raw).split('.')[0]);
  if (FMT_BOOK_MAP[head]) return FMT_BOOK_MAP[head];
  return null;
}

function fmtBookName(id) {
  if (typeof BIBLE_BOOKS !== 'undefined') {
    const b = BIBLE_BOOKS.find(x => x.id === id);
    if (b) return b.name;
  }
  return id;
}

// Прибрати XML-теги і розкодувати сутності (для текстів віршів)
function fmtStripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Додати вірш у структуру books = { bookId: { chapter: { verse: text } } }
function fmtAddVerse(books, bookId, ch, v, text) {
  if (!bookId || !ch || !v || !text) return 0;
  if (!books[bookId]) books[bookId] = {};
  if (!books[bookId][ch]) books[bookId][ch] = {};
  books[bookId][ch][v] = text;
  return 1;
}

// ============================================================
// ПАРСЕРИ БІБЛІЇ
// Кожен повертає { books, count } або null, якщо формат не той
// ============================================================

// Zefania XML: <BIBLEBOOK bnumber="1" bname="Буття"><CHAPTER cnumber="1"><VERS vnumber="1">…
function fmtParseZefania(text) {
  if (!/<BIBLEBOOK/i.test(text)) return null;
  const books = {};
  const names = {};
  let count = 0;
  const bookRe = /<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi;
  let bm;
  while ((bm = bookRe.exec(text))) {
    const attrs = bm[1];
    const num = (attrs.match(/bnumber\s*=\s*"([^"]+)"/i) || [])[1];
    const bname = (attrs.match(/bname\s*=\s*"([^"]+)"/i) || [])[1];
    const bookId = fmtBookId(bname) || fmtBookId(num);
    if (!bookId) continue;
    if (bname) names[bookId] = bname;          // назва мовою самого перекладу
    const chRe = /<CHAPTER\b[^>]*cnumber\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/CHAPTER>/gi;
    let cm;
    while ((cm = chRe.exec(bm[2]))) {
      const ch = parseInt(cm[1], 10);
      const vRe = /<VERS\b[^>]*vnumber\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/VERS>/gi;
      let vm;
      while ((vm = vRe.exec(cm[2]))) {
        count += fmtAddVerse(books, bookId, ch, parseInt(vm[1], 10), fmtStripTags(vm[2]));
      }
    }
  }
  return count ? { books, count, names } : null;
}

// OSIS XML: <verse osisID="Gen.1.1">текст</verse>  (або self-closing з sID/eID)
function fmtParseOSIS(text) {
  if (!/osisID/i.test(text)) return null;
  const books = {};
  let count = 0;

  // Варіант А: парний тег із текстом усередині
  const pairRe = /<verse\b[^>]*osisID\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/verse>/gi;
  let m;
  while ((m = pairRe.exec(text))) {
    const parts = m[1].split('.');
    const bookId = fmtBookId(parts[0]);
    count += fmtAddVerse(books, bookId, parseInt(parts[1], 10), parseInt(parts[2], 10), fmtStripTags(m[2]));
  }
  if (count) return { books, count };

  // Варіант Б: маркери sID/eID — текст лежить між ними
  const milestoneRe = /<verse\b[^>]*osisID\s*=\s*"([^"]+)"[^>]*sID[^>]*\/>([\s\S]*?)<verse\b[^>]*eID/gi;
  while ((m = milestoneRe.exec(text))) {
    const parts = m[1].split('.');
    const bookId = fmtBookId(parts[0]);
    count += fmtAddVerse(books, bookId, parseInt(parts[1], 10), parseInt(parts[2], 10), fmtStripTags(m[2]));
  }
  return count ? { books, count } : null;
}

// USFM / SFM: \id GEN … \c 1 … \v 1 текст
// Прибирає виноски/перехресні посилання повністю, символьні маркери лишає текст,
// збирає весь текст вірша (навіть через кілька рядків), розуміє діапазони \v 1-2.
function usfmCleanVerse(s) {
  s = String(s == null ? '' : s);
  // виноски \f..\f*, перехресні \x..\x*, кінцеві виноски \fe..\fe* — з усім вмістом
  s = s.replace(/\\(f|fe|x)\b[\s\S]*?\\\1\*/g, ' ');
  // USFM3-атрибути перед закриваючим маркером: \w слово|strong="H1"\w* → лишаємо «слово»
  s = s.replace(/\|[^\\]*?(?=\\[+a-z0-9]+\*)/gi, '');
  // закриваючі символьні маркери \add* \w* \nd* …
  s = s.replace(/\\[+]?[a-z0-9]+\*/gi, ' ');
  // відкриваючі та одиночні маркери \add \w \p \q1 \wj \m …
  s = s.replace(/\\[+]?[a-z0-9]+\b/gi, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function fmtParseUSFM(text) {
  if (!/\\(id|c|v)\s/.test(text)) return null;
  const books = {};
  const names = {};
  let count = 0;

  // Файл може містити одну або кілька книг — ділимо за \id
  text.split(/(?=\\id\s)/).forEach(chunk => {
    const idM = chunk.match(/\\id\s+(\S+)/);
    if (!idM) return;
    const bookId = fmtBookId(idM[1]);
    if (!bookId) return;
    // назва книги мовою перекладу: \toc1 / \h / \toc2
    const hM = chunk.match(/\\(?:toc1|h|toc2)\s+(.+)/);
    if (hM && !names[bookId]) names[bookId] = hM[1].trim();

    // ділимо на глави за \c, глави — на вірші за \v
    chunk.split(/(?=\\c\s)/).forEach(cc => {
      const cM = cc.match(/\\c\s+(\d+)/);
      if (!cM) return;
      const ch = parseInt(cM[1], 10);

      cc.split(/(?=\\v\s)/).forEach(vp => {
        const vM = vp.match(/^\s*\\v\s+(\d+(?:-\d+)?)\s*([\s\S]*)$/);
        if (!vM) return;
        const txt = usfmCleanVerse(vM[2]);
        if (!txt) return;
        // діапазон \v 1-2 → присвоюємо кожному вірша в діапазоні той самий текст
        const rng = vM[1].split('-').map(Number);
        const from = rng[0], to = rng[1] || rng[0];
        for (let v = from; v <= to && (v - from) < 20; v++) {
          count += fmtAddVerse(books, bookId, ch, v, txt);
        }
      });
    });
  });
  return count ? { books, count, names } : null;
}

// TXT: "Буття 1:1 На початку…"  або  "Gen 1:1 …"  або  "1:1 …" (книга з попереднього заголовка)
function fmtParseBibleTXT(text) {
  const books = {};
  let count = 0;
  let lastBook = null;

  text.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;

    // Рядок-заголовок книги: сама назва без цифр у кінці
    const asBook = fmtBookId(line);
    if (asBook && !/\d+\s*[:.]\s*\d+/.test(line)) { lastBook = asBook; return; }

    // "Книга 3:16 текст" — назва може бути з цифрою спереду (1 Коринтян)
    let m = line.match(/^(.+?)\s+(\d+)\s*[:.]\s*(\d+)\s+(.+)$/);
    if (m) {
      const bookId = fmtBookId(m[1]) || lastBook;
      if (bookId) {
        if (fmtBookId(m[1])) lastBook = bookId;
        count += fmtAddVerse(books, bookId, parseInt(m[2], 10), parseInt(m[3], 10), m[4].trim());
        return;
      }
    }
    // "3:16 текст" — книга береться з останнього заголовка
    m = line.match(/^(\d+)\s*[:.]\s*(\d+)\s+(.+)$/);
    if (m && lastBook) {
      count += fmtAddVerse(books, lastBook, parseInt(m[1], 10), parseInt(m[2], 10), m[3].trim());
    }
  });
  return count ? { books, count } : null;
}

// CSV: book,chapter,verse,text (з заголовком або без; кома, крапка з комою або таб)
function fmtParseBibleCSV(text) {
  const rows = fmtParseCSV(text);
  if (!rows.length) return null;
  const books = {};
  let count = 0;

  rows.forEach((cols, i) => {
    if (cols.length < 4) return;
    if (i === 0 && !/^\d+$/.test(String(cols[1]).trim()) && isNaN(parseInt(cols[1], 10))) return; // заголовок
    const bookId = fmtBookId(cols[0]);
    count += fmtAddVerse(books, bookId, parseInt(cols[1], 10), parseInt(cols[2], 10), String(cols[3]).trim());
  });
  return count ? { books, count } : null;
}

// JSON: підтримуємо кілька поширених схем
function fmtParseBibleJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return null; }
  const books = {};
  const names = {};
  let count = 0;
  let name = data.name || data.translation || '';

  // A: { name, books: [{id, chapters:[{chapter, verses:[{verse,text}]}]}] }
  if (Array.isArray(data.books)) {
    data.books.forEach(b => {
      const bookId = fmtBookId(b.id || b.name || b.abbrev);
      if (bookId && b.name) names[bookId] = String(b.name);   // назва мовою перекладу
      (b.chapters || []).forEach((c, ci) => {
        const ch = c.chapter || ci + 1;
        const verses = c.verses || c;
        if (Array.isArray(verses)) {
          verses.forEach((v, vi) => {
            const num = v.verse || vi + 1;
            const txt = typeof v === 'string' ? v : v.text;
            count += fmtAddVerse(books, bookId, ch, num, txt);
          });
        }
      });
    });
  }
  // B: { "gen": { "1": { "1": "текст" } } } — плоский словник
  if (!count) {
    Object.keys(data).forEach(k => {
      const bookId = fmtBookId(k);
      if (!bookId || typeof data[k] !== 'object') return;
      Object.keys(data[k]).forEach(ch => {
        const chObj = data[k][ch];
        if (typeof chObj !== 'object') return;
        Object.keys(chObj).forEach(v => {
          count += fmtAddVerse(books, bookId, parseInt(ch, 10), parseInt(v, 10), chObj[v]);
        });
      });
    });
  }
  // C: [{book, chapter, verse, text}, …]
  if (!count && Array.isArray(data)) {
    data.forEach(r => {
      const bookId = fmtBookId(r.book || r.book_name || r.b);
      count += fmtAddVerse(books, bookId, parseInt(r.chapter || r.c, 10), parseInt(r.verse || r.v, 10), r.text || r.t);
    });
  }
  // D: { verses: [{book_name, chapter, verse, text}] } — дуже поширений формат
  if (!count && Array.isArray(data.verses)) {
    data.verses.forEach(r => {
      const bookId = fmtBookId(r.book_name || r.book || r.bookName || r.b || r.book_id);
      count += fmtAddVerse(books, bookId,
        parseInt(r.chapter || r.chapterNumber || r.c, 10),
        parseInt(r.verse || r.verseNumber || r.v, 10),
        r.text || r.t || r.content);
    });
  }

  // E: { books: { "gen": {...} } } — books як обʼєкт, а не масив
  if (!count && data.books && !Array.isArray(data.books) && typeof data.books === 'object') {
    Object.keys(data.books).forEach(k => {
      const bookId = fmtBookId(k);
      const bk = data.books[k];
      if (!bookId || !bk || typeof bk !== 'object') return;
      const chapters = Array.isArray(bk) ? bk : (Array.isArray(bk.chapters) ? bk.chapters : bk);
      if (Array.isArray(chapters)) {
        chapters.forEach((c, ci) => {
          const vs = Array.isArray(c) ? c : (c.verses || []);
          (vs || []).forEach((v, vi) => {
            count += fmtAddVerse(books, bookId, (c && c.chapter) || ci + 1,
              (v && v.verse) || vi + 1, typeof v === 'string' ? v : (v.text || v.t));
          });
        });
      } else {
        Object.keys(chapters).forEach(ch => {
          const chObj = chapters[ch];
          if (typeof chObj !== 'object') return;
          Object.keys(chObj).forEach(v => {
            count += fmtAddVerse(books, bookId, parseInt(ch, 10), parseInt(v, 10),
              typeof chObj[v] === 'string' ? chObj[v] : (chObj[v] && chObj[v].text));
          });
        });
      }
    });
  }

  // F: [ {name, chapters:[[ "вірш1", "вірш2" ]]} ] — масив книг у корені
  if (!count && Array.isArray(data)) {
    data.forEach(b => {
      if (!b || typeof b !== 'object') return;
      const bookId = fmtBookId(b.id || b.name || b.abbrev || b.book);
      if (!bookId) return;
      if (b.name) names[bookId] = String(b.name);
      const chapters = b.chapters || b.chapter || [];
      (Array.isArray(chapters) ? chapters : []).forEach((c, ci) => {
        const vs = Array.isArray(c) ? c : (c.verses || []);
        (vs || []).forEach((v, vi) => {
          count += fmtAddVerse(books, bookId, (c && c.chapter) || ci + 1,
            (v && v.verse) || vi + 1, typeof v === 'string' ? v : (v.text || v.t));
        });
      });
    });
  }

  // G: глибокий пошук — якщо структура нестандартна, шукаємо будь-який масив
  //    записів із книгою/главою/віршем/текстом на будь-якій глибині
  if (!count) {
    const tryRows = (arr) => {
      let n = 0;
      arr.forEach(r => {
        if (!r || typeof r !== 'object') return;
        const bookId = fmtBookId(r.book_name || r.book || r.bookName || r.b || r.book_id || r.id);
        const ch = parseInt(r.chapter || r.chapterNumber || r.c, 10);
        const vr = parseInt(r.verse || r.verseNumber || r.v, 10);
        const tx = r.text || r.t || r.content;
        if (bookId && ch && vr && tx) n += fmtAddVerse(books, bookId, ch, vr, tx);
      });
      return n;
    };
    const seen = new Set();
    const walk = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 4 || count) return;
      if (seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        if (node.length && typeof node[0] === 'object') count += tryRows(node);
        if (!count) node.slice(0, 50).forEach(x => walk(x, depth + 1));
      } else {
        Object.keys(node).forEach(k => walk(node[k], depth + 1));
      }
    };
    walk(data, 0);
  }

  return count ? { books, count, names, name } : null;
}

// Головний вхід: пробуємо парсери за розширенням, потім усі підряд
function fmtParseBible(text, filename) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
  const ext = String(filename || '').toLowerCase().split('.').pop();

  const byExt = {
    json: [fmtParseBibleJSON],
    xml:  [fmtParseZefania, fmtParseOSIS],
    xmm:  [fmtParseZefania],
    osis: [fmtParseOSIS],
    usfm: [fmtParseUSFM],
    sfm:  [fmtParseUSFM],
    txt:  [fmtParseBibleTXT, fmtParseUSFM],
    csv:  [fmtParseBibleCSV],
    tsv:  [fmtParseBibleCSV]
  }[ext] || [];

  const all = [fmtParseBibleJSON, fmtParseZefania, fmtParseOSIS, fmtParseUSFM, fmtParseBibleCSV, fmtParseBibleTXT];
  for (const parser of byExt.concat(all)) {
    let res = null;
    try { res = parser(text); } catch (e) { res = null; }
    if (res && res.count) {
      // Назви книг беремо з самого файлу (мовою перекладу), якщо вони там є.
      // Якщо немає — підставляємо українські як запасний варіант.
      const bookNames = {};
      const fromFile = res.names || {};
      Object.keys(res.books).forEach(id => { bookNames[id] = fromFile[id] || fmtBookName(id); });
      return { books: res.books, bookNames: bookNames, count: res.count, name: res.name || '' };
    }
  }
  return null;
}

// ============================================================
// CSV: мінімальний парсер із підтримкою лапок і різних роздільників
// ============================================================
function fmtParseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  let delim = ',';
  if ((firstLine.match(/\t/g) || []).length >= 1) delim = '\t';
  else if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) delim = ';';

  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

// ============================================================
// ПАРСЕРИ ПІСЕНЬ → [{title, author, verses:[…]}]
// ============================================================

// OpenLP / OpenSong XML
function fmtParseSongsXML(text) {
  const songs = [];

  // OpenLP: <song><title>…</title><lyrics><verse …><![CDATA[текст]]></verse></lyrics></song>
  const songRe = /<song\b[\s\S]*?<\/song>/gi;
  let sm;
  while ((sm = songRe.exec(text))) {
    const block = sm[0];
    const title = fmtStripTags((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const author = fmtStripTags((block.match(/<author[^>]*>([\s\S]*?)<\/author>/i) || [])[1] || '');
    const verses = [];
    const vRe = /<verse\b[^>]*>([\s\S]*?)<\/verse>/gi;
    let vm;
    while ((vm = vRe.exec(block))) {
      const raw = vm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      const txt = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
      if (txt) verses.push(txt);
    }
    if (title && verses.length) songs.push({ title, author, verses });
  }
  if (songs.length) return songs;

  // OpenSong: <song><title>…</title><lyrics>[V1]\nрядок…</lyrics></song>
  const title = fmtStripTags((text.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const lyrics = (text.match(/<lyrics>([\s\S]*?)<\/lyrics>/i) || [])[1];
  if (title && lyrics) {
    const verses = lyrics
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .split(/\[[^\]]+\]/)                       // мітки куплетів [V1], [C]
      .map(v => v.split(/\r?\n/).map(l => l.replace(/^[.\s]*\d?\s?/, '').trimEnd()).join('\n').trim())
      .filter(Boolean);
    if (verses.length) return [{ title, author: '', verses }];
  }
  return null;
}

// ChordPro: {title: …} + рядки з акордами у [квадратних дужках]
function fmtParseChordPro(text) {
  if (!/\{(title|t):/i.test(text) && !/\[[A-H][#b]?m?\d?\]/.test(text)) return null;
  const title = (text.match(/\{(?:title|t)\s*:\s*([^}]+)\}/i) || [])[1] || 'Без назви';
  const author = (text.match(/\{(?:artist|subtitle|st)\s*:\s*([^}]+)\}/i) || [])[1] || '';
  const body = text
    .replace(/\{[^}]*\}/g, '')      // директиви
    .replace(/\[[^\]]*\]/g, '')     // акорди
    .replace(/^#.*$/gm, '');        // коментарі
  const verses = body.split(/\r?\n\s*\r?\n/).map(v => v.trim()).filter(Boolean);
  return verses.length ? [{ title: title.trim(), author: author.trim(), verses }] : null;
}

// ProPresenter (.pro/.pro5/.pro6): текст слайдів лежить у base64 RTF
function fmtParseProPresenter(text) {
  if (!/RVPresentationDocument|RVTextElement|RVDisplaySlide/i.test(text)) return null;
  const title = (text.match(/CCLISongTitle\s*=\s*"([^"]*)"/i) || [])[1] || '';
  const verses = [];
  const b64Re = /(?:RTFData|NSString)\s*=\s*"([A-Za-z0-9+/=]{40,})"/g;
  let m;
  while ((m = b64Re.exec(text))) {
    let decoded = '';
    try { decoded = atob(m[1]); } catch (e) { continue; }
    if (!/\\rtf|\\fonttbl|\\pard/i.test(decoded)) continue;
    // Грубе, але робоче витягування тексту з RTF
    const txt = decoded
      .replace(/\{\\\*[^}]*\}/g, '')
      .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|generator)[\s\S]*?\}\s*(?=\\|\{|$)/gi, '')
      .replace(/\\f\d+\s*[^\\;{}]*;/g, '')
      .replace(/\\'([0-9a-f]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u(-?\d+)\??/g, (x, d) => String.fromCharCode(((+d) + 65536) % 65536))
      .replace(/\\par[d]?\b/g, '\n')
      .replace(/\\[a-z]+-?\d*\s?/gi, '')
      .replace(/[{}]/g, '')
      .trim();
    if (txt) verses.push(txt);
  }
  return verses.length ? [{ title: title || 'ProPresenter', author: '', verses }] : null;
}

// CSV: title,author,verses (куплети через | або подвійний перенос)
function fmtParseSongsCSV(text) {
  const rows = fmtParseCSV(text);
  if (rows.length < 1) return null;
  const songs = [];
  let start = 0;
  const head = rows[0].map(c => fmtNorm(c));
  if (head.includes('title') || head.includes('назва')) start = 1;

  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 2) continue;
    const title = String(r[0]).trim();
    const rest = r.slice(1);
    // якщо другий стовпець схожий на автора (короткий, без переносів) — беремо його
    let author = '', versesRaw;
    if (rest.length >= 2 && rest[0].length < 60 && !/[|\n]/.test(rest[0])) {
      author = String(rest[0]).trim();
      versesRaw = rest.slice(1).join('|');
    } else {
      versesRaw = rest.join('|');
    }
    const verses = versesRaw.split(/\||\r?\n\s*\r?\n/).map(v => v.trim()).filter(Boolean);
    if (title && verses.length) songs.push({ title, author, verses });
  }
  return songs.length ? songs : null;
}

// TXT: перший непорожній рядок — назва, далі куплети через порожній рядок.
// Кілька пісень в одному файлі можна розділити рядком з "---".
function fmtParseSongsTXT(text) {
  const chunks = text.split(/^\s*-{3,}\s*$/m).map(c => c.trim()).filter(Boolean);
  const songs = [];

  chunks.forEach(chunk => {
    const blocks = chunk.split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(Boolean);
    if (!blocks.length) return;

    const firstLines = blocks[0].split(/\r?\n/);
    let title = firstLines[0].trim();
    let author = '';
    const authorM = title.match(/^(.*?)\s*[—–-]\s*(.+)$/);
    if (authorM && firstLines.length === 1 && authorM[2].length < 40) {
      title = authorM[1].trim();
      author = authorM[2].trim();
    }

    let verses;
    if (firstLines.length > 1) {
      // назва в тому ж блоці, що й перший куплет
      verses = [firstLines.slice(1).join('\n').trim()].concat(blocks.slice(1));
    } else {
      verses = blocks.slice(1);
    }
    verses = verses.map(function(block) {
      const lines = block.split(/\r?\n/);
      const labelOnly = /^\s*(куплет|приспів|приспiв|verse|chorus|bridge|refrain)\s*\d*\s*:?\s*$/i;
      // Рядок-мітка знімається тільки якщо під ним є текст; інакше блок лишається як є
      if (lines.length > 1 && labelOnly.test(lines[0])) return lines.slice(1).join('\n').trim();
      return block.trim();
    }).filter(Boolean);
    if (title && verses.length) songs.push({ title, author, verses });
  });
  return songs.length ? songs : null;
}

function fmtParseSongsJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return null; }
  const arr = Array.isArray(data) ? data : data.songs;
  if (!Array.isArray(arr)) return null;
  const songs = arr.map(s => ({
    title: s.title || s.name || '',
    author: s.author || '',
    verses: Array.isArray(s.verses) ? s.verses : String(s.verses || '').split(/\r?\n\s*\r?\n/)
  })).filter(s => s.title && s.verses.length);
  return songs.length ? songs : null;
}

function fmtParseSongs(text, filename) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const ext = String(filename || '').toLowerCase().split('.').pop();

  const byExt = {
    json: [fmtParseSongsJSON],
    xml:  [fmtParseSongsXML],
    sng:  [fmtParseSongsXML],
    cho:  [fmtParseChordPro], chordpro: [fmtParseChordPro], crd: [fmtParseChordPro], pro: [fmtParseProPresenter],
    pro4: [fmtParseProPresenter], pro5: [fmtParseProPresenter], pro6: [fmtParseProPresenter],
    csv:  [fmtParseSongsCSV], tsv: [fmtParseSongsCSV],
    txt:  [fmtParseSongsTXT]
  }[ext] || [];

  const all = [fmtParseSongsJSON, fmtParseSongsXML, fmtParseProPresenter, fmtParseChordPro, fmtParseSongsCSV, fmtParseSongsTXT];
  for (const parser of byExt.concat(all)) {
    let res = null;
    try { res = parser(text); } catch (e) { res = null; }
    if (res && res.length) return res;
  }
  return null;
}

// ============================================================
// GDD-ГРАФІКА (SuperFly.tv / H2R Graphics / CasparCG)
// Такий HTML НЕ показує себе сам: він чекає, поки движок викличе
// update({поля}) і play(). Тому, відкритий просто як сторінка,
// він виглядає порожнім. Тут ми: 1) читаємо схему полів,
// 2) вшиваємо бутстрап, який стартує графіку,
// 3) даємо каналу postMessage керувати нею наживо.
// ============================================================

// Чи це GDD-графіка
function gddDetect(html) {
  return /type\s*=\s*["']application\/json\+gdd["']/i.test(html) ||
         (/function\s+update\s*\(/.test(html) && /function\s+play\s*\(/.test(html));
}

// Схема полів: [{key, label, default, type}]
function gddSchema(html) {
  const m = html.match(/<script[^>]*application\/json\+gdd[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  let schema;
  try { schema = JSON.parse(m[1]); } catch (e) { return []; }
  const props = (schema && schema.properties) || {};
  return Object.keys(props).map(key => {
    const p = props[key] || {};
    return {
      key: key,
      label: p.label || key.replace(/^_/, ''),
      def: p.default !== undefined ? String(p.default) : '',
      type: p.gddType || p.type || 'single-line',
      options: Array.isArray(p.enum) ? p.enum : null
    };
  });
}

// Значення за замовчуванням із схеми
function gddDefaults(html) {
  const data = {};
  gddSchema(html).forEach(f => { data[f.key] = f.def; });
  return data;
}

// Вшиваємо бутстрап: графіка стартує сама і слухає команди ззовні
function gddInject(html, data) {
  const payload = JSON.stringify(data || {});
  const boot = `
<script>
/* Додано автоматично: GDD-графіка чекає на update()+play() від движка.
   Без цього блоку файл відкривається порожнім. */
(function(){
  var __data = ${payload};
  function __call(fn, arg) {
    try {
      var f = window[fn];
      if (typeof f === 'function') { arg === undefined ? f() : f(arg); return true; }
    } catch(e) { console.error('GDD ' + fn + ':', e); }
    return false;
  }
  function __applyFields(data) {
    try {
      Object.keys(data || {}).forEach(function(k) {
        var val = data[k];
        var els = document.querySelectorAll('[data-gdd="' + k + '"]');
        Array.prototype.forEach.call(els, function(el) {
          var looksImg = typeof val === 'string' && (val.indexOf('data:image') === 0 || /^https?:\\/\\//.test(val) || /\\.(png|jpe?g|gif|webp|svg)$/i.test(val));
          if (el.tagName === 'IMG') { if (val) { el.src = val; el.style.display = ''; } }
          else if (looksImg) { el.style.backgroundImage = 'url("' + val + '")'; el.style.backgroundSize = el.style.backgroundSize || 'contain'; el.style.backgroundRepeat = 'no-repeat'; el.style.backgroundPosition = el.style.backgroundPosition || 'center'; }
          else { el.textContent = (val == null ? '' : val); }
        });
      });
    } catch(e) { console.error('GDD applyFields:', e); }
  }
  function __boot() {
    // update() за конвенцією GDD (як у Propovidnik.html) очікує ГОТОВИЙ
    // РЯДОК JSON (сам робить JSON.parse) — якщо передати сюди об'єкт
    // напряму, JSON.parse("[object Object]") впаде і update() мовчки
    // нічого не зробить, навіть на першому показі графіки.
    __call('update', JSON.stringify(__data));
    __applyFields(__data);
    __call('play');
  }
  if (document.readyState === 'complete') setTimeout(__boot, 0);
  else window.addEventListener('load', __boot);

  /* Живе керування ззовні — без перезавантаження, щоб таймер не збивався */
  window.addEventListener('message', function(e) {
    var m = e && e.data;
    if (!m || !m.__gdd) return;
    if (m.__gdd === 'update') { __data = m.data || {}; __call('update', JSON.stringify(__data)); __applyFields(__data); }
    else if (m.__gdd === 'play') __call('play');
    else if (m.__gdd === 'stop') { if (!__call('stop')) __call('play'); } /* деякі графіки ховаються повторним play() */
  });
})();
<\/script>`;

  // Вставляємо перед закриттям body (або в кінець, якщо тега немає)
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i === -1 ? html + boot : html.slice(0, i) + boot + html.slice(i);
}

// ============================================================
// PPTX / DOCX — витяг тексту без сторонніх бібліотек.
// Обидва формати — це ZIP з XML усередині. Читаємо central directory,
// розпаковуємо потрібні записи через zlib.inflateRaw.
//
// Винесено з main.js: не має жодної залежності від спільного стану
// головного процесу (вікна, сервери тощо) — лише fs/zlib, тож безпечно
// живе окремим модулем. Виклич register(ipcMain) один раз із main.js.
// ============================================================
const zlib = require('zlib');
const fs = require('fs');

function zipEntries(buf) {
  const entries = {};
  // End of central directory: сигнатура 0x06054b50 з кінця файлу
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Це не ZIP-архів (пошкоджений файл?)');

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // зміщення central directory

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method   = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen  = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen   = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name     = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // Локальний заголовок: довжини name/extra тут можуть відрізнятись
    const lNameLen  = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);

    entries[name] = () => {
      if (method === 0) return raw;                 // без стиснення
      if (method === 8) return zlib.inflateRawSync(raw); // deflate
      throw new Error('Непідтримане стиснення в ZIP: ' + method);
    };
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return entries;
}

function xmlText(xml, tag) {
  const out = [];
  const re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'g');
  let m;
  while ((m = re.exec(xml))) {
    const t = m[1]
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (x, d) => String.fromCharCode(+d))
      .replace(/&amp;/g, '&');
    out.push(t);
  }
  return out;
}

// Повертає масив «слайдів»: [{title, lines:[…]}]
function parseOffice(filePath, ext) {
  const buf = fs.readFileSync(filePath);
  const entries = zipEntries(buf);

  if (ext === 'pptx' || ext === 'potx') {
    const names = Object.keys(entries)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)/)[1], 10);
        const nb = parseInt(b.match(/slide(\d+)/)[1], 10);
        return na - nb;
      });
    const slides = names.map((n, i) => {
      const xml = entries[n]().toString('utf8');
      // <a:p> — абзац, <a:t> — текстовий run усередині нього
      const paras = xml.split(/<a:p>/).slice(1).map(p => xmlText(p, 'a:t').join('').trim()).filter(Boolean);
      return { title: paras[0] || ('Слайд ' + (i + 1)), lines: paras };
    });
    return { ok: true, kind: 'pptx', slides: slides.filter(s => s.lines.length) };
  }

  if (ext === 'docx' || ext === 'dotx') {
    const key = entries['word/document.xml'] ? 'word/document.xml' : null;
    if (!key) throw new Error('У DOCX не знайдено word/document.xml');
    const xml = entries[key]().toString('utf8');
    const paras = xml.split(/<w:p[ >]/).slice(1)
      .map(p => xmlText(p, 'w:t').join('').trim())
      .filter(Boolean);
    // Порожній рядок у Word = межа блоку; групуємо абзаци в «слайди» по 1 абзацу
    return { ok: true, kind: 'docx', slides: paras.map((p, i) => ({ title: 'Абзац ' + (i + 1), lines: [p] })) };
  }

  throw new Error('Непідтримане розширення: ' + ext);
}

function register(ipcMain) {
  ipcMain.handle('parse-office', (event, { filePath, ext }) => {
    try {
      return parseOffice(filePath, ext);
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
}

module.exports = { register, zipEntries, xmlText, parseOffice };

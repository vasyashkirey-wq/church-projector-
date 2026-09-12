// ============================================================
// ВКЛАДКА «📲 QR-екран» (qrscreen) — генератор QR-кодів (посилання чи
// готове фото), банер/лого поверх, збережені пресети, адресний вивід на
// кожен вихід з 🔴-підсвіткою активного й «Прибрати» (той самий патерн,
// що в H2R/Таймері/Графіці/Медіа — див. аудит «адресний вивід/прибирання»).
//
// Винесено з src/extras-3.js — продовження модуляризації (typo.js →
// ... → automation.js/extras_lang_obs.js → stations.js → ця). Мусить
// завантажуватись ДО extras-4.js — pv2Init() звертається до
// renderQrOutputRow одразу при старті застосунку (масив steps), а
// renderQrScreenTab — з dispatch-таблиці renderTabInto (extras-1.js).
// ============================================================

var qrLiveMap = { 1: false, 2: false, 3: false, 4: false };
// Лічильник показів на кожен вихід — щоб відкидати результати
// асинхронного малювання, які застаріли (див. sendQrScreenTo).
var _qrSendGen = { 1: 0, 2: 0, 3: 0, 4: 0 };

function qrState() {
  if (!state.qrScreen) {
    const defaults = {
      mode: 'logo',
      photo: null,            // готове фото QR (показуємо як є, без генерації)
      photoFit: 'contain',    // contain = увесь QR видно | cover = на весь екран
      photoScale: 100,        // % розміру фото в режимі "contain" — керування розміром картинки
      title: 'Підтримати служіння',
      subtitle: 'Скануй камерою телефона',
      titleSize: 72,          // px — розмір заголовка окремо від тексту нижче
      subtitleSize: 32,       // px — розмір підпису
      titleColor: '#ffffff',
      subtitleColor: '#c8a84b',
      single: { text: '', label: 'Пожертви' },
      banner: null,                 // dataURL фото
      bannerCorner: 'br',           // кут QR: br/bl/tr/tl
      items: [                      // для multi
        { text: '', label: 'Пожертви' },
        { text: '', label: 'Наш сайт' },
        { text: '', label: 'Instagram' }
      ],
      target: 1
    };
    // Мердж (не заміна) — щоб у вже збережених станів (без нових полів
    // titleSize/subtitleSize/photoScale) ці поля отримали значення за
    // замовчуванням, а не лишились undefined.
    const saved = loadJSON(STORAGE_KEYS.live + '_qrscreen');
    state.qrScreen = saved ? Object.assign({}, defaults, saved) : defaults;
  }
  return state.qrScreen;
}

function saveQrScreen() { saveJSON(STORAGE_KEYS.live + '_qrscreen', state.qrScreen); }

function setQr(key, val) {
  const q = qrState();
  q[key] = val;
  saveQrScreen();
  markDirty('qrscreen');
  updateQrPreview();
}

function setQrSize(key, val, labelId) {
  const q = qrState();
  q[key] = val;
  saveQrScreen();
  updateQrPreview();
  const lbl = document.getElementById(labelId);
  if (lbl) lbl.textContent = val;
}

function setQrItem(i, key, val) {
  const q = qrState();
  q.items[i][key] = val;
  saveQrScreen();
  updateQrPreview();
}

function loadQrPhoto(input) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) { notify('⚠️ Фото завелике — до 3 МБ'); input.value=''; return; }
  const r = new FileReader();
  r.onload = e => { qrState().photo = e.target.result; saveQrScreen(); markDirty('qrscreen'); markDirtyFn('qrPreview', updateQrPreview); notify('📷 Фото QR завантажено'); };
  r.readAsDataURL(f);
  input.value = '';
}

function loadQrBanner(input) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) { notify('⚠️ Фото завелике — до 3 МБ'); input.value=''; return; }
  const r = new FileReader();
  r.onload = e => { qrState().banner = e.target.result; saveQrScreen(); markDirty('qrscreen'); markDirtyFn('qrPreview', updateQrPreview); notify('🖼 Фото додано'); };
  r.readAsDataURL(f);
  input.value = '';
}

function composeQrScreen(cb) {
  const q = qrState();
  if (q.mode !== 'photo' && typeof buildQRCanvas !== 'function') {
    notify('⚠️ Генератор QR ще не завантажився. Потрібен інтернет при першому запуску.');
    return;
  }
  const W = 1920, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');

  function bg(done) {
    if (q.mode === 'banner' && q.banner) {
      const img = new Image();
      img.onload = () => {
        // Фото на весь екран (cover)
        const r = Math.max(W / img.width, H / img.height);
        const w = img.width * r, h = img.height * r;
        g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 0, W, H);
        done();
      };
      img.onerror = () => { g.fillStyle = '#0a0a1a'; g.fillRect(0,0,W,H); done(); };
      img.src = q.banner;
    } else {
      // Темний градієнт
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#0a0a1a'); grad.addColorStop(1, '#161a2e');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      done();
    }
  }

  // Режим готового фото QR — просто малюємо картинку, нічого не генеруємо
  if (q.mode === 'photo') {
    if (!q.photo) { cb(canvas); return; }
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0a0a1a'); grad.addColorStop(1, '#161a2e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const img = new Image();
    img.onload = () => {
      const scale = (q.photoScale || 100) / 100;
      if (q.photoFit === 'cover') {
        const r = Math.max(W / img.width, H / img.height) * scale;
        const w = img.width * r, h = img.height * r;
        g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      } else {
        // contain — увесь QR видно, з полями (щоб код точно зчитувався)
        const r = Math.min((W * 0.7) / img.width, (H * 0.8) / img.height) * scale;
        const w = img.width * r, h = img.height * r;
        // біла підкладка під QR — камери читають надійніше
        const pad = 40;
        g.fillStyle = '#fff';
        roundRect(g, (W - w) / 2 - pad, (H - h) / 2 - pad + 30, w + pad*2, h + pad*2, 20); g.fill();
        g.drawImage(img, (W - w) / 2, (H - h) / 2 + 30, w, h);
      }
      // Заголовок зверху — розмір і колір окремо для заголовка й підпису
      if (q.title) { g.textAlign = 'center'; g.fillStyle = q.titleColor || '#ffffff'; g.font = '700 ' + (q.titleSize || 72) + 'px Georgia, serif'; g.fillText(q.title, W/2, 110); }
      if (q.subtitle) { g.fillStyle = q.subtitleColor || '#c8a84b'; g.font = (q.subtitleSize || 32) + 'px Georgia, serif'; g.fillText(q.subtitle, W/2, 165); }
      cb(canvas);
    };
    img.onerror = () => cb(canvas);
    img.src = q.photo;
    return;
  }

  function drawTitle() {
    if (q.mode === 'banner') return;
    g.textAlign = 'center'; g.fillStyle = q.titleColor || '#ffffff';
    g.font = '700 76px Georgia, serif';
    if (q.title) g.fillText(q.title, W / 2, 150);
    g.fillStyle = q.subtitleColor || '#c8a84b'; g.font = '34px Georgia, serif';
    if (q.subtitle) g.fillText(q.subtitle, W / 2, 210);
  }

  // Малює один QR (dataURL) із рамкою і підписом у точці x,y (центр QR)
  function placeQR(dataUrl, cx, cy, size, label, labelColor, done) {
    const img = new Image();
    img.onload = () => {
      const pad = 22;
      g.fillStyle = '#ffffff';
      roundRect(g, cx - size/2 - pad, cy - size/2 - pad, size + pad*2, size + pad*2, 18); g.fill();
      g.drawImage(img, cx - size/2, cy - size/2, size, size);
      if (label) {
        g.textAlign = 'center';
        g.fillStyle = labelColor || '#ffffff';
        g.font = '700 40px Georgia, serif';
        g.fillText(label, cx, cy + size/2 + pad + 52);
      }
      done();
    };
    img.onerror = done;
    img.src = dataUrl;
  }

  bg(() => {
    drawTitle();
    if (q.mode === 'multi') {
      const items = q.items.filter(it => it.text.trim());
      if (!items.length) { cb(canvas); return; }
      const n = items.length;
      const size = n >= 3 ? 360 : 440;
      const gap = (W - n * size) / (n + 1);
      let done = 0;
      items.forEach((it, i) => {
        const cx = gap * (i + 1) + size * i + size / 2;
        buildQRCanvas(it.text, size, built => {
          if (built) placeQR(built.toDataURL('image/png'), cx, H / 2 + 20, size, it.label, '#c8a84b', () => { if (++done === n) cb(canvas); });
          else if (++done === n) cb(canvas);
        });
      });
    } else if (q.mode === 'banner') {
      const it = q.single;
      if (!it.text.trim()) { cb(canvas); return; }
      const size = 300;
      buildQRCanvas(it.text, size, built => {
        if (!built) { cb(canvas); return; }
        const m = 70;
        const pos = { br:[W-size/2-m, H-size/2-m], bl:[size/2+m, H-size/2-m],
                      tr:[W-size/2-m, size/2+m], tl:[size/2+m, size/2+m] }[q.bannerCorner || 'br'];
        placeQR(built.toDataURL('image/png'), pos[0], pos[1], size, it.label, '#ffffff', () => cb(canvas));
      });
    } else {
      // logo / simple — великий QR по центру (логотип у центрі бере з вкладки QR, якщо заданий)
      const it = q.single;
      if (!it.text.trim()) { cb(canvas); return; }
      const size = 560;
      buildQRCanvas(it.text, size, built => {
        if (!built) { cb(canvas); return; }
        placeQR(built.toDataURL('image/png'), W / 2, H / 2 + 60, size, it.label, '#c8a84b', () => cb(canvas));
      });
    }
  });
}

function updateQrPreview() {
  const cv = $('#qrScreenPreview');
  if (!cv) return;
  composeQrScreen(full => {
    const g = cv.getContext('2d');
    cv.width = 480; cv.height = 270;
    g.fillStyle = '#000'; g.fillRect(0, 0, 480, 270);
    g.drawImage(full, 0, 0, 480, 270);
  });
}

function renderQrOutputRow() {
  const el = document.getElementById('qrOutputRow');
  if (!el) return;
  const outBtns = [1, 2, 3, 4].map(n => {
    const isLive = !!qrLiveMap[n];
    return `<button class="btn ${isLive ? 'btn-success' : 'btn-ghost'} btn-sm" onclick="sendQrScreenTo(${n})" title="Показати на ${esc(OUT_NAME[n] || ('Вихід ' + n))}">${isLive ? '🔴 ' : ''}${esc(OUT_NAME[n] || ('В.' + n))}</button>`;
  }).join('');
  const clearBtns = [1, 2, 3, 4].filter(n => qrLiveMap[n]).map(n =>
    `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="clearQrScreenFrom(${n})" title="Прибрати з ${esc(OUT_NAME[n] || ('Вихід ' + n))}">✕ ${esc(OUT_NAME[n] || ('В.' + n))}</button>`
  ).join('');
  el.innerHTML = `<div class="flex" style="gap:4px;flex-wrap:wrap">${outBtns}</div>` +
    (clearBtns ? `<div class="flex mt8" style="gap:4px;flex-wrap:wrap">${clearBtns}</div>` : '');
}

function sendQrScreenTo(n) {
  const q = qrState();
  // Готове фото QR генератора не потребує; для решти режимів — потрібен
  if (q.mode !== 'photo' && typeof buildQRCanvas !== 'function') {
    notify('⚠️ Генератор QR недоступний (потрібен інтернет при першому запуску)');
    return;
  }
  const hasContent = q.mode === 'photo' ? !!q.photo
                   : q.mode === 'multi' ? q.items.some(i => i.text.trim())
                   : q.single.text.trim();
  if (!hasContent) { notify(q.mode === 'photo' ? '⚠️ Спершу завантаж фото QR' : '⚠️ Введи хоча б одне посилання'); return; }
  q.target = n;
  saveQrScreen();
  // ГОНКА: composeQrScreen малює картинку АСИНХРОННО (чекає на
  // завантаження зображень/QR). Якщо за цей час оператор натисне
  // «✕ Прибрати», очищення виконається одразу, а цей callback
  // спрацює ПІСЛЯ нього й поверне QR назад — саме звідси «виключаю,
  // а воно вмикається».
  // Тому запамʼятовуємо номер спроби: якщо поки малювалось був
  // ще один показ АБО очищення цього виходу — результат застарілий
  // і його треба відкинути.
  const myGen = ++_qrSendGen[n];
  composeQrScreen(full => {
    if (myGen !== _qrSendGen[n]) return;   // застарілий результат — мовчки викидаємо
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
      'html,body{margin:0;height:100vh;background:#000;overflow:hidden}' +
      'img{width:100vw;height:100vh;object-fit:contain}</style></head><body>' +
      '<img src="' + full.toDataURL('image/png') + '"></body></html>';
    sendHTMLToOutputN(n, html, 'QR-екран');
    qrLiveMap[n] = true;
    renderQrOutputRow();
    notify('📲 QR-екран → ' + OUT_NAME[n]);
  });
}

function sendQrScreen() { sendQrScreenTo(qrState().target || 1); }

function clearQrScreenFrom(n) {
  // Підвищуємо лічильник ПЕРШИМ ділом: цим ми скасовуємо будь-який
  // показ, що зараз малюється у фоні, — інакше він домалюється й
  // поверне QR на щойно очищений вихід.
  _qrSendGen[n] = (_qrSendGen[n] || 0) + 1;
  if (typeof pv2ClearOutput === 'function') pv2ClearOutput(n);
  qrLiveMap[n] = false;
  renderQrOutputRow();
}

function qrScreenLogo(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    qrLogo = e.target.result;                     // цей же логотип використовує buildQRCanvas
    if (typeof generateQR === 'function') { try { generateQR(); } catch (err) {} }
    markDirty('qrscreen');
    updateQrPreview();
    notify('🖼 Логотип додано в центр QR');
  };
  r.onerror = () => notify('❌ Не вдалось прочитати файл');
  r.readAsDataURL(f);
  input.value = '';
}

function qrScreenClearLogo() {
  qrLogo = null;
  if (typeof generateQR === 'function') { try { generateQR(); } catch (err) {} }
  markDirty('qrscreen');
  updateQrPreview();
  notify('Логотип прибрано');
}

function qrScreenLogoSize(v) {
  qrLogoScale = Math.max(0.10, Math.min(0.28, v / 100));
  if (typeof generateQR === 'function') { try { generateQR(); } catch (err) {} }
  updateQrPreview();
}

function qrList() {
  try {
    const raw = (typeof bigStoreGet === 'function') ? bigStoreGet(QR_KEY) : localStorage.getItem(QR_KEY);
    return JSON.parse(raw || '[]');
  } catch (e) { return []; }
}

function qrScreenSave() {
  const q = qrState();
  if (q.mode === 'photo') {
    // Режим фото: посилання тут немає взагалі — джерело правди це саме
    // завантажене фото. Раніше ця гілка була відсутня, тому збереження
    // завжди вимагало «посилання», якого в цьому режимі просто нема.
    if (!q.photo) { notify('⚠️ Спершу завантаж фото QR'); return; }
    const label = q.title || 'QR-фото';
    const list = qrList();
    list.push({
      mode: 'photo', label: label,
      photo: q.photo, photoFit: q.photoFit, photoScale: q.photoScale,
      title: q.title, subtitle: q.subtitle,
      titleSize: q.titleSize, subtitleSize: q.subtitleSize,
      target: q.target
    });
    if (typeof safeSet === 'function') safeSet(QR_KEY, JSON.stringify(list));
    else localStorage.setItem(QR_KEY, JSON.stringify(list));
    markDirty('qrscreen');
    notify('⭐ Збережено з фото: ' + label);
    return;
  }
  const text = q.mode === 'multi'
    ? ((q.items || []).find(i => i.text && i.text.trim()) || {}).text
    : (q.single || {}).text;
  if (!text || !text.trim()) { notify('⚠️ Спершу введи посилання'); return; }
  const label = (q.single && q.single.label) || q.title || text.slice(0, 30);
  const list = qrList();
  list.push({ mode: q.mode, text: text.trim(), label: label });
  if (typeof safeSet === 'function') safeSet(QR_KEY, JSON.stringify(list));
  else localStorage.setItem(QR_KEY, JSON.stringify(list));
  markDirty('qrscreen');
  notify('⭐ Збережено: ' + label);
}

function qrScreenLoad(i) {
  const p = qrList()[i];
  if (!p) return;
  const q = qrState();
  if (p.mode === 'photo' && p.photo) {
    // Відновлюємо ТОЧНО те, що було збережено — фото, підписи й розміри —
    // а не лише текст (раніше тут насильно перемикало на режим 'simple',
    // тому збережене фото ніколи не показувалось знову).
    q.mode = 'photo';
    q.photo = p.photo;
    q.photoFit = p.photoFit || 'contain';
    q.photoScale = p.photoScale || 100;
    q.title = p.title || '';
    q.subtitle = p.subtitle || '';
    q.titleSize = p.titleSize || 72;
    q.subtitleSize = p.subtitleSize || 32;
    if (p.target) q.target = p.target;
  } else {
    if (q.mode === 'multi' || q.mode === 'photo') q.mode = 'simple';
    q.single = { text: p.text, label: p.label || '' };
  }
  saveQrScreen();
  markDirty('qrscreen');
  updateQrPreview();
  notify('▶ ' + (p.label || (p.text || '').slice(0, 24)));
}

function qrScreenDelete(i) {
  const list = qrList();
  if (!list[i]) return;
  list.splice(i, 1);
  if (typeof safeSet === 'function') safeSet(QR_KEY, JSON.stringify(list));
  else localStorage.setItem(QR_KEY, JSON.stringify(list));
  markDirty('qrscreen');
}

function renderQrScreenTab() {
  const q = qrState();
  const modeBtn = (m, l) => `<button class="btn ${q.mode === m ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setQr('mode','${m}')">${l}</button>`;
  const cornerBtn = (c, l) => `<button class="btn ${q.bannerCorner === c ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setQr('bannerCorner','${c}')">${l}</button>`;

  let editor = '';
  if (q.mode === 'multi') {
    editor = q.items.map((it, i) => `
      <div style="display:flex;gap:4px;margin-bottom:4px">
        <input type="text" value="${esc(it.label)}" placeholder="Підпис" oninput="setQrItem(${i},'label',this.value)"
               style="width:110px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">
        <input type="text" value="${esc(it.text)}" placeholder="Посилання / реквізити" oninput="setQrItem(${i},'text',this.value)"
               style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px">
      </div>`).join('');
  } else {
    editor = `
      <div style="font-size:12px;color:var(--text2)">Посилання / реквізити</div>
      <input type="text" value="${esc(q.single.text)}" placeholder="https://... або номер картки" oninput="q=qrState();q.single.text=this.value;saveQrScreen();updateQrPreview()"
             style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px;margin-bottom:6px">
      <div style="font-size:12px;color:var(--text2)">Підпис під QR</div>
      <input type="text" value="${esc(q.single.label)}" oninput="q=qrState();q.single.label=this.value;saveQrScreen();updateQrPreview()"
             style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">`;
  }

  return `
  <div class="grid2">
    <div class="card">
      <div class="card-title">📲 Що показати</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${modeBtn('photo','📷 Моє фото QR')}
        ${modeBtn('logo','QR із логотипом')}
        ${modeBtn('banner','Фото + QR у кутку')}
        ${modeBtn('simple','Простий QR')}
        ${modeBtn('multi','Кілька QR')}
      </div>

      ${q.mode === 'photo' ? `
        <div style="font-size:12px;color:var(--text2);margin-top:10px">Фото готового QR (до 3 МБ)</div>
        <input type="file" accept="image/*" onchange="loadQrPhoto(this)" style="font-size:11px;width:100%">
        ${q.photo ? '<div style="font-size:11px;color:var(--green);margin-top:4px">✓ фото завантажено</div>' : '<div style="font-size:11px;color:var(--text2);margin-top:4px">Завантаж скріншот або фото QR — програма покаже його як є, нічого не змінюючи.</div>'}
        <div style="font-size:12px;color:var(--text2);margin-top:8px">Розмір на екрані</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn ${(q.photoFit||'contain')==='contain'?'btn-primary':'btn-ghost'} btn-sm" onclick="setQr('photoFit','contain')">QR повністю видно</button>
          <button class="btn ${q.photoFit==='cover'?'btn-primary':'btn-ghost'} btn-sm" onclick="setQr('photoFit','cover')">На весь екран</button>
        </div>
        <div class="card-sub" style="margin-top:4px">«QR повністю видно» — з білими полями, камери читають надійніше. «На весь екран» — якщо фото вже оформлене.</div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">Заголовок (необов'язково)</div>
        <input type="text" value="${esc(q.title)}" oninput="setQr('title',this.value)"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">
        <input type="text" value="${esc(q.subtitle)}" oninput="setQr('subtitle',this.value)" placeholder="Підзаголовок"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px;margin-top:4px">

        <div style="font-size:12px;color:var(--text2);margin-top:10px;font-weight:600">Розмір</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">Розмір фото/QR: <span id="qrPhotoScaleLbl">${q.photoScale || 100}</span>%</div>
        <input type="range" min="50" max="150" value="${q.photoScale || 100}" oninput="setQrSize('photoScale',parseInt(this.value,10),'qrPhotoScaleLbl')" style="width:100%">
        <div style="font-size:11px;color:var(--text2);margin-top:4px">Розмір заголовка: <span id="qrTitleSizeLbl">${q.titleSize || 72}</span>px</div>
        <input type="range" min="20" max="140" value="${q.titleSize || 72}" oninput="setQrSize('titleSize',parseInt(this.value,10),'qrTitleSizeLbl')" style="width:100%">
        <div style="font-size:11px;color:var(--text2);margin-top:4px">Розмір підпису: <span id="qrSubtitleSizeLbl">${q.subtitleSize || 32}</span>px</div>
        <input type="range" min="12" max="80" value="${q.subtitleSize || 32}" oninput="setQrSize('subtitleSize',parseInt(this.value,10),'qrSubtitleSizeLbl')" style="width:100%">

        <div style="font-size:12px;color:var(--text2);margin-top:10px;font-weight:600">Колір тексту</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <span style="font-size:11px;color:var(--text2);width:70px">Заголовок</span>
          <input type="color" value="${q.titleColor || '#ffffff'}" oninput="setQr('titleColor', this.value)" style="width:36px;height:26px;border:none;background:none;cursor:pointer">
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <span style="font-size:11px;color:var(--text2);width:70px">Підпис</span>
          <input type="color" value="${q.subtitleColor || '#c8a84b'}" oninput="setQr('subtitleColor', this.value)" style="width:36px;height:26px;border:none;background:none;cursor:pointer">
        </div>
      ` : q.mode !== 'banner' ? `
        <div style="font-size:12px;color:var(--text2);margin-top:10px;font-weight:600">Заголовок екрана</div>
        <input type="text" value="${esc(q.title)}" oninput="setQr('title',this.value)"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">
        <div style="font-size:12px;color:var(--text2);margin-top:4px">Підзаголовок</div>
        <input type="text" value="${esc(q.subtitle)}" oninput="setQr('subtitle',this.value)"
               style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px;color:var(--text);font-size:12px">
      ` : `
        <div style="font-size:12px;color:var(--text2);margin-top:10px">Фото / банер (до 3 МБ)</div>
        <input type="file" accept="image/*" onchange="loadQrBanner(this)" style="font-size:11px;width:100%">
        ${q.banner ? '<div style="font-size:11px;color:var(--green);margin-top:4px">✓ фото додано</div>' : ''}
        <div style="font-size:12px;color:var(--text2);margin-top:6px">Кут для QR</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${cornerBtn('br','↘ Правий низ')}${cornerBtn('bl','↙ Лівий низ')}${cornerBtn('tr','↗ Правий верх')}${cornerBtn('tl','↖ Лівий верх')}</div>
      `}

      ${q.mode === 'photo' ? '' : `<div style="margin-top:10px">${editor}</div>`}

      ${q.mode === 'logo' ? `
      <div style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:6px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Логотип у центрі QR</div>
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
          <input type="file" id="qrScreenLogoInput" accept="image/*" style="display:none" onchange="qrScreenLogo(this)">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qrScreenLogoInput').click()">📁 Вибрати файл</button>
          ${(typeof qrLogo !== 'undefined' && qrLogo) ? `<span style="font-size:11px;color:var(--green)">✓ логотип є</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="qrScreenClearLogo()">✕</button>` : '<span style="font-size:11px;color:var(--text2)">не обрано</span>'}
        </div>
        ${(typeof qrLogo !== 'undefined' && qrLogo) ? `<div style="margin-top:6px">
          <div style="font-size:11px;color:var(--text2)">Розмір логотипа: ${Math.round((typeof qrLogoScale !== 'undefined' ? qrLogoScale : 0.22) * 100)}%</div>
          <input type="range" min="10" max="28" value="${Math.round((typeof qrLogoScale !== 'undefined' ? qrLogoScale : 0.22) * 100)}"
                 style="width:100%" onchange="qrScreenLogoSize(this.value)">
        </div>` : ''}
      </div>` : ''}

      <div id="qrOutputRow" style="margin-top:10px"></div>

      <div style="display:flex;gap:5px;margin-top:10px">
        <button class="btn btn-ghost" style="flex:1" onclick="qrScreenSave()">⭐ Зберегти</button>
      </div>
      ${(function(){
        const list = qrList();
        if (!list.length) return '<div style="font-size:11px;color:var(--text2);margin-top:8px">Збережених QR ще немає — заповни поля вище й тисни «⭐ Зберегти».</div>';
        return `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px">⭐ Збережені QR</div>
          ${list.map((p, i) => `<div style="display:flex;align-items:center;gap:5px;padding:4px 0;border-bottom:1px solid var(--border)">
              <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <b>${esc(p.label || (p.text || '').slice(0, 28) || 'QR')}</b>
                ${p.mode === 'photo' ? '<span style="color:var(--text2);font-size:11px"> 📷 фото</span>' : `<span style="color:var(--text2);font-size:11px"> ${esc((p.text || '').slice(0, 34))}</span>`}
              </span>
              <button class="btn btn-ghost btn-sm" onclick="qrScreenLoad(${i})">▶</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="qrScreenDelete(${i})">✕</button>
            </div>`).join('')}
        </div>`;
      })()}
    </div>

    <div class="card">
      <div class="card-title">👁 Як це виглядатиме</div>
      <canvas id="qrScreenPreview" width="480" height="270"
              style="width:100%;border:1px solid var(--border);border-radius:6px;background:#000"></canvas>
      <div class="card-sub" style="margin-top:6px">Прев'ю оновлюється, щойно вводиш посилання.</div>
    </div>
  </div>`;
}

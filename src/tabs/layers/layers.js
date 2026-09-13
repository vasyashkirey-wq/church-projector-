// ============================================================
// ВКЛАДКА «🎨 Шари» (layers) — фонове відео/черга фонів, лого (позиція/
// розмір/вихід), водяний знак, тривожне повідомлення (alert), фонова
// музика.
//
// toggleFreeze()/showLogo()/sendAlert() НАВМИСНО лишились у extras-3.js —
// вони глибоко вплетені в Аварійну панель (toggleEmergencyPanel/
// emergencyShowLogoAll тощо, оголошені в extras-1.js), використовуються
// з багатьох місць поза цією вкладкою.
//
// Винесено з src/extras-3.js — продовження модуляризації (typo.js →
// ... → service_planner.js → ця). Мусить завантажуватись ДО
// extras-4.js — renderLayersTab викликається з dispatch-таблиці
// renderTabInto (extras-1.js).
// ============================================================

function renderLayersTab() {
  const a = state.alertCfg;
  const posBtn = (p, l) => `<button class="btn ${a.position === p ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setAlertCfg('position','${p}')">${l}</button>`;
  return `
  <div class="grid2">
    <div class="card">
      <div class="card-title">🎬 Відео-фон під текстом</div>
      <div class="card-sub">Зациклене відео (хвилі, світло) — текст пісні лягає поверх. Звук завжди вимкнено.</div>
      <input type="file" accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.wmv,.flv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.m2v,.vob,.divx,.asf,.mxf,.ogv" onchange="loadBgVideo(this)" style="font-size:11px;width:100%;margin-top:6px">
      ${state.bgVideo ? `<div style="font-size:11px;color:var(--green);margin-top:4px">▶ ${esc(state.bgVideo.name)}</div>
        <button class="btn btn-ghost btn-sm btn-block" style="margin-top:4px;color:var(--red)" onclick="clearBgVideo()">✕ Прибрати відео-фон</button>` : ''}

      <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:8px">
        <div style="font-size:12px;color:var(--text2)">🔁 Черга з авто-ротацією (кілька роликів по черзі)</div>
        <input type="file" accept="video/*,.mp4,.webm,.mov" multiple onchange="loadBgQueue(this)" style="font-size:11px;width:100%;margin-top:4px">
        ${(state.bgQueue || []).map((q, i) => `
          <div style="display:flex;align-items:center;gap:4px;padding:2px 0;font-size:11px;color:${i === (state.bgQueueIdx||0) && state.bgQueueRunning ? 'var(--green)' : 'var(--text2)'}">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${i === (state.bgQueueIdx||0) && state.bgQueueRunning ? '▶ ' : ''}${esc(q.name)}</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="removeBgQueueItem(${i})">✕</button>
          </div>`).join('')}
        <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          <span style="font-size:11px;color:var(--text2)">Інтервал:</span>
          <input type="number" min="5" max="600" value="${state.bgQueueInterval || 30}" onchange="setBgQueueInterval(this.value)"
                 style="width:50px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:2px;color:var(--text);font-size:11px;text-align:center">
          <span style="font-size:11px;color:var(--text2)">с</span>
        </div>
        <div style="display:flex;gap:4px;margin-top:6px">
          <button class="btn ${state.bgQueueRunning ? 'btn-ghost' : 'btn-primary'} btn-sm" style="flex:1" onclick="bgQueueStart()">▶ Пуск ротації</button>
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="bgQueueStop()">⏹ Стоп</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">❄️ Заморозка (усі виходи)</div>
      <button class="btn ${[1,2,3,4].every(n => state.frozen[n]) ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleFreeze()">❄️ ${[1,2,3,4].every(n => state.frozen[n]) ? 'Розморозити всі' : 'Заморозити кадр (усі)'}</button>
      <div class="card-sub" style="margin-top:4px">Застигла картинка на всіх 4 виходах одразу, поки готуєш наступне. Точково по одному виходу — у вкладці «Виходи».</div>
    </div>

    <div class="card">
      <div class="card-title">🖼 Логотип</div>
      <input type="file" accept="image/*,.heic,.heif,.tif,.tiff,.avif,.jp2,.tga,.pcx" onchange="loadLogo(this)" style="font-size:11px;width:100%">
      <div class="card-sub" style="margin-top:4px">«На весь екран» — як заставка паузи (ховає контент, автоматично прибирається щойно піде новий слайд). Кутова позиція — маленький значок, як водяний знак, не заважає контенту. ОКРЕМО для кожного виходу.</div>
      <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
        ${[1, 2, 3, 4].map(n => `<button class="btn ${state._logoEditN === n ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="selectLogoOutput(${n})">
          ${state.logoSettings[n].on ? '🔴 ' : ''}${esc(OUT_NAME[n])}
        </button>`).join('')}
      </div>
      ${(function() {
        const n = state._logoEditN || 1;
        const s = state.logoSettings[n];
        return `
      <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
        <button class="btn ${s.position==='center-full'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLogoPosition(${n}, 'center-full')">На весь екран</button>
        <button class="btn ${s.position==='top-left'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLogoPosition(${n}, 'top-left')">Зверху-зліва</button>
        <button class="btn ${s.position==='top-right'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLogoPosition(${n}, 'top-right')">Зверху-справа</button>
        <button class="btn ${s.position==='bottom-left'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLogoPosition(${n}, 'bottom-left')">Знизу-зліва</button>
        <button class="btn ${s.position==='bottom-right'?'btn-primary':'btn-ghost'} btn-sm" onclick="setLogoPosition(${n}, 'bottom-right')">Знизу-справа</button>
      </div>
      ${s.position !== 'center-full' ? `
      <div style="margin-top:6px">
        <div style="font-size:11px;color:var(--text2)">Розмір: <b id="logoSizeLbl">${s.size}</b>px</div>
        <input type="range" min="40" max="400" value="${s.size}" oninput="document.getElementById('logoSizeLbl').textContent=this.value" onchange="setLogoSize(${n}, parseInt(this.value,10))" style="width:100%">
      </div>` : ''}
      <button class="btn ${s.on ? 'btn-primary' : 'btn-success'} btn-block" style="margin-top:8px" onclick="showLogo(${n}, ${s.on ? 'false' : 'true'})">
        🖼 ${esc(OUT_NAME[n])}: ${s.on ? 'Прибрати логотип' : 'Показати логотип'}
      </button>`;
      })()}
    </div>
  </div>

  <div class="card" style="border-color:var(--accent)">
    <div class="card-title">🏷 Постійний водяний знак</div>
    <div class="card-sub">На відміну від логотипа — НЕ ховається, коли показуєш пісню/вірш/оголошення. Лишається на екрані завжди, поки не вимкнеш. ОКРЕМИЙ для кожного виходу — можна мати різний текст чи взагалі вимкнути лише на одному.</div>
    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      ${[1, 2, 3, 4].map(n => `<button class="btn ${state._watermarkEditN === n ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="selectWatermarkOutput(${n})">
        ${state.watermark[n].on ? '🔴 ' : ''}${esc(OUT_NAME[n])}
      </button>`).join('')}
    </div>
    ${(function() {
      const n = state._watermarkEditN || 1;
      const wm = state.watermark[n];
      return `
    <input id="watermarkText" type="text" placeholder="Наприклад: 2017 СЛАВЯНСЬКА ЦЕРКОВЬ ТРОЇЦІ" value="${esc(wm.text || '')}"
           oninput="setWatermark(${n}, 'text', this.value)"
           style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:7px;color:var(--text);font-size:12px;outline:none;margin-top:10px">
    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      <button class="btn ${wm.position==='top-left'?'btn-primary':'btn-ghost'} btn-sm" onclick="setWatermarkPosition(${n}, 'top-left')">Зверху-зліва</button>
      <button class="btn ${wm.position==='top-right'?'btn-primary':'btn-ghost'} btn-sm" onclick="setWatermarkPosition(${n}, 'top-right')">Зверху-справа</button>
      <button class="btn ${wm.position==='bottom-left'?'btn-primary':'btn-ghost'} btn-sm" onclick="setWatermarkPosition(${n}, 'bottom-left')">Знизу-зліва</button>
      <button class="btn ${wm.position==='bottom-right'?'btn-primary':'btn-ghost'} btn-sm" onclick="setWatermarkPosition(${n}, 'bottom-right')">Знизу-справа</button>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <div style="flex:1">
        <div style="font-size:11px;color:var(--text2)">Розмір: <b id="watermarkSizeLbl">${wm.size || 16}</b>px</div>
        <input type="range" min="10" max="48" value="${wm.size || 16}" oninput="document.getElementById('watermarkSizeLbl').textContent=this.value; setWatermark(${n}, 'size', parseInt(this.value,10))" style="width:100%">
      </div>
      <input type="color" value="${wm.color || '#ffffff'}" oninput="setWatermark(${n}, 'color', this.value)" style="width:36px;height:26px;border:none;background:none;cursor:pointer">
    </div>
    <button class="btn ${wm.on ? 'btn-primary' : 'btn-success'} btn-block" style="margin-top:8px" onclick="toggleWatermark(${n}, ${wm.on ? 'false' : 'true'})">
      🏷 ${esc(OUT_NAME[n])}: ${wm.on ? 'Вимкнути водяний знак' : 'Увімкнути водяний знак'}
    </button>`;
    })()}
  </div>

  <div class="card" style="border-color:var(--gold)">
    <div class="card-title">📢 Оголошення ПОВЕРХ слайда</div>
    <div class="card-sub">Пісня триває — повідомлення виїжджає знизу. Напр.: «Мама Софійки, підійдіть до дитячої кімнати».</div>
    <input id="alertText" type="text" placeholder="Текст оголошення" value="${esc(a.text || '')}"
           style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:7px;color:var(--text);font-size:12px;outline:none;margin-top:6px">
    <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;align-items:center">
      ${posBtn('bottom','Знизу')} ${posBtn('top','Зверху')}
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;margin-left:6px">
        <input type="checkbox" ${a.ticker ? 'checked' : ''} onchange="setAlertCfg('ticker', this.checked)"> Біжучий рядок
      </label>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-top:6px">Розмір: <b id="alertSizeLabel">${a.size}px</b></div>
    <input type="range" min="20" max="70" value="${a.size}" oninput="setAlertCfg('size', parseInt(this.value,10))" style="width:100%">
    <div style="font-size:12px;color:var(--text2)">Показувати: <b id="alertSecLabel">${a.seconds ? a.seconds + ' с' : 'поки не прибрати'}</b></div>
    <input type="range" min="0" max="60" value="${a.seconds}" oninput="setAlertCfg('seconds', parseInt(this.value,10))" style="width:100%">
    <div style="font-size:12px;color:var(--text2);margin-top:6px">На який вихід:</div>
    <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
      <button class="btn ${!a.targetOutput ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setAlertTargetOutput(null)">Усі виходи</button>
      ${[1, 2, 3, 4].map(n => `<button class="btn ${a.targetOutput === n ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setAlertTargetOutput(${n})">${esc(OUT_NAME[n])}</button>`).join('')}
    </div>
    <div style="display:flex;gap:4px;margin-top:6px">
      <button class="btn btn-primary btn-sm" onclick="sendAlert()">📢 Показати поверх</button>
      <button class="btn btn-ghost btn-sm" onclick="hideAlert()">Прибрати</button>
    </div>
  </div>

  ${renderPropsCard()}
  ${renderMsgTemplatesCard()}

  <div class="card">
    <div class="card-title">🎵 Фонова музика</div>
    <div class="card-sub">Плавний вхід (2 с) і затухання (2,5 с) — перед служінням, під час пожертв.</div>
    <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" onchange="loadBgAudio(this)" style="font-size:11px;width:100%;margin-top:6px">
    ${state.bgAudio.name ? `<div style="font-size:11px;color:var(--text2);margin-top:4px">${esc(state.bgAudio.name)}</div>` : ''}
    <div style="display:flex;gap:4px;margin-top:6px">
      <button class="btn btn-success btn-sm" onclick="playBgAudio()">▶ Пуск (плавно)</button>
      <button class="btn btn-ghost btn-sm" onclick="stopBgAudio()">⏹ Стоп (затухання)</button>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-top:6px">Гучність: <b id="bgVolLabel">${Math.round(state.bgAudio.volume*100)}%</b></div>
    <input type="range" min="0" max="100" value="${Math.round(state.bgAudio.volume*100)}" oninput="setBgVolume(parseInt(this.value,10))" style="width:100%">
  </div>

  ${renderSoundBinCard()}
  `;
}

function setAlertCfg(key, val) {
  state.alertCfg[key] = val;
  const lbl = $('#alertSizeLabel');
  if (lbl) lbl.textContent = state.alertCfg.size + 'px';
  const slbl = $('#alertSecLabel');
  if (slbl) slbl.textContent = state.alertCfg.seconds ? state.alertCfg.seconds + ' с' : 'поки не прибрати';
}

function loadBgVideo(input) {
  const f = input.files[0];
  if (!f) return;

  // Беремо ШЛЯХ до файлу, а не base64: відео на 50 МБ у dataURL — це ~67 МБ,
  // що миттєво переповнює localStorage (ліміт ~5 МБ) і з'їдає пам'ять.
  if (f.path) {
    // Непідтримувані формати (MOV/MKV…) спершу конвертуємо у MP4, тоді вантажимо
    ensureSupportedMedia(f.path, function(cpath) {
      const fileUrl = pathToFileUrl(cpath);
      state.bgVideo = { src: fileUrl, name: f.name, speed: 1 };
      saveLayers();
      applyBgVideo();
      markDirty('layers');
      notify('🎬 Відео-фон: ' + f.name);
    });
  } else {
    // Поза Electron шляху немає — вантажимо в пам'ять лише на сеанс, без збереження
    state.bgVideo = { src: URL.createObjectURL(f), name: f.name, speed: 1, session: true };
    applyBgVideo();
    markDirty('layers');
    notify('🎬 Відео-фон (лише на цей сеанс): ' + f.name);
  }
  input.value = '';
}

function clearBgVideo() {
  state.bgVideo = null;
  saveLayers();
  applyBgVideo();
  markDirty('layers');
  notify('Відео-фон вимкнено');
}

function loadBgQueue(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  state.bgQueue = state.bgQueue || [];
  state.bgQueue.push(...files.filter(f => f.path).map(f => ({ src: pathToFileUrl(f.path), name: f.name })));
  state.bgQueueIdx = state.bgQueueIdx || 0;
  saveLayers();
  markDirty('layers');
  notify('🎬 Додано в чергу: ' + files.length);
  input.value = '';
}

function removeBgQueueItem(i) {
  if (!state.bgQueue) return;
  state.bgQueue.splice(i, 1);
  saveLayers();
  markDirty('layers');
}

function setBgQueueInterval(sec) {
  state.bgQueueInterval = Math.max(5, parseInt(sec, 10) || 30);
  saveLayers();
  if (_bgQueueTimer) { bgQueueStop(); bgQueueStart(); } // перезапустити з новим інтервалом
}

function bgQueueStart() {
  const q = state.bgQueue || [];
  if (!q.length) { notify('⚠️ Спочатку додай ролики в чергу'); return; }
  state.bgQueueIdx = 0;
  state.bgVideo = Object.assign({ speed: 1 }, q[0]);
  applyBgVideo();
  state.bgQueueRunning = true;
  _bgQueueTimer = setInterval(bgQueueAdvance, (state.bgQueueInterval || 30) * 1000);
  saveLayers();
  markDirty('layers');
  notify('🔁 Ротація фонів увімкнена (кожні ' + (state.bgQueueInterval || 30) + ' с)');
}

function bgQueueStop() {
  if (_bgQueueTimer) { clearInterval(_bgQueueTimer); _bgQueueTimer = null; }
  state.bgQueueRunning = false;
  saveLayers();
  markDirty('layers');
  notify('Ротацію фонів зупинено');
}

function loadLogo(input) {
  const f = input.files[0];
  if (!f) return;
  const ext = (String(f.name).split('.').pop() || '').toLowerCase();
  const isHeic = ['heic', 'heif', 'tif', 'tiff'].indexOf(ext) >= 0;
  // Перевірку 2МБ пропускаємо для HEIC/TIFF — вони сконвертуються у менший JPG
  if (!isHeic && f.size > 2 * 1024 * 1024) {
    notify('⚠️ Логотип завеликий (' + Math.round(f.size / 1048576) + ' МБ). Стисни до 2 МБ — інакше переповниться сховище.');
    input.value = '';
    return;
  }
  loadImageAsDataURL(f, function(dataURL) {
    state.logo = dataURL;
    saveLayers();
    markDirty('layers');
    notify('🖼 Логотип збережено');
  });
  input.value = '';
}

function selectLogoOutput(n) {
  state._logoEditN = n;
  markDirty('layers');
}

function setLogoPosition(n, pos) {
  state.logoSettings[n].position = pos;
  saveLayers();
  if (state.logoSettings[n].on) showLogo(n, true);   // вже показаний — перемальовуємо з новою позицією
  markDirty('layers');
}

function setLogoSize(n, size) {
  state.logoSettings[n].size = size;
  saveLayers();
  if (state.logoSettings[n].on) showLogo(n, true);
}

function selectWatermarkOutput(n) {
  state._watermarkEditN = n;
  markDirty('layers');
}

function setWatermark(n, key, val) {
  state.watermark[n][key] = val;
  saveLayers();
  if (state.watermark[n].on && window.electronAPI && window.electronAPI.showWatermark) {
    window.electronAPI.showWatermark(state.watermark[n], OUT_KIND[n]);
  }
}

function setWatermarkPosition(n, pos) {
  setWatermark(n, 'position', pos);
  markDirty('layers');
}

function toggleWatermark(n, on) {
  if (on && !(state.watermark[n].text || '').trim()) { notify('⚠️ Спершу введи текст водяного знаку'); return; }
  state.watermark[n].on = !!on;
  saveLayers();
  if (window.electronAPI && window.electronAPI.showWatermark) {
    window.electronAPI.showWatermark(on ? state.watermark[n] : { on: false }, OUT_KIND[n]);
  }
  markDirty('layers');
  notify(on ? '🏷 ' + OUT_NAME[n] + ': водяний знак увімкнено' : '🏷 ' + OUT_NAME[n] + ': водяний знак вимкнено');
}

function setAlertTargetOutput(n) {
  state.alertCfg.targetOutput = n;
  markDirty('layers');
}

function hideAlert() {
  const kind = state.alertCfg.targetOutput ? OUT_KIND[state.alertCfg.targetOutput] : null;
  if (isClientStation()) { stationSend('alert', { cfg: null, kind: kind }); return; }
  if (window.electronAPI && window.electronAPI.sendAlert) window.electronAPI.sendAlert(null, kind);
  notify('Оголошення прибрано');
}

function loadBgAudio(input) {
  const f = input.files[0];
  if (!f) return;
  if (_bgAudioEl) {
    _bgAudioEl.pause();
    clearInterval(_bgAudioEl._fade);
    // Звільняємо попередній blob — інакше кожен новий файл лишав копію в пам'яті
    if (_bgAudioEl._url) URL.revokeObjectURL(_bgAudioEl._url);
  }
  const url = URL.createObjectURL(f);
  _bgAudioEl = new Audio(url);
  _bgAudioEl._url = url;
  _bgAudioEl.loop = true;
  _bgAudioEl.volume = 0;
  state.bgAudio.name = f.name;
  markDirty('layers');
  notify('🎵 ' + f.name);
  input.value = '';
}

function playBgAudio() {
  if (!_bgAudioEl) { notify('⚠️ Спершу обери файл'); return; }
  _bgAudioEl.play().catch(() => notify('⚠️ Не вдалось відтворити'));
  fadeAudio(state.bgAudio.volume, 2000);   // плавний вхід за 2 с
  state.bgAudio.playing = true;
  markDirty('layers');
  notify('🎵 Фонова музика (плавно)');
}

function stopBgAudio() {
  if (!_bgAudioEl) return;
  fadeAudio(0, 2500, () => { _bgAudioEl.pause(); });   // плавне затухання
  state.bgAudio.playing = false;
  markDirty('layers');
  notify('🎵 Затухання...');
}

function setBgVolume(v) {
  state.bgAudio.volume = v / 100;
  if (_bgAudioEl && state.bgAudio.playing) _bgAudioEl.volume = state.bgAudio.volume;
  saveLayers();
  const lbl = $('#bgVolLabel');
  if (lbl) lbl.textContent = v + '%';
}

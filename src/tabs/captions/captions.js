// ============================================================
// ВКЛАДКА «💬 Живі субтитри» (captions) — розпізнавання мовлення (Web
// Speech API), автовизначення посилань на вірші в тексті з підказкою
// прийняти/відхилити, індикатор рівня мікрофона.
//
// Зібрано з ДВОХ файлів: логіка (initCaptions і решта) — з
// src/extras-1.js, сама вкладка (renderCaptionsTab) — з src/extras-3.js.
// Об'єднано тут, бо це одна вкладка, а не через межу файлів, де вони
// історично жили (той самий підхід, що вже був для text_control.js).
//
// Продовження модуляризації (typo.js → ... → stream.js/multiview.js →
// ця). Мусить завантажуватись ДО extras-4.js — renderCaptionsTab
// викликається з dispatch-таблиці renderTabInto (extras-1.js).
// ============================================================

let _speechRecognition = null;

function initCaptions() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    notify('⚠️ Web Speech API недоступна в цій версії');
    return;
  }
  _speechRecognition = new SpeechRecognition();
  _speechRecognition.continuous = true;
  _speechRecognition.interimResults = true;
  _speechRecognition.lang = 'uk-UA'; // українська за замовчуванням

  _speechRecognition.onstart = () => {
    state.captions.listening = true;
    markDirty('captions');
    notify('🎤 Слухаємо мікрофон…');
  };
  _speechRecognition.onend = () => {
    state.captions.listening = false;
    markDirty('captions');
  };
  _speechRecognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i].transcript;
      if (event.results[i].isFinal) {
        final += transcript + ' ';
      } else {
        interim += transcript;
      }
    }
    if (final) {
      state.captions.text = (state.captions.text + ' ' + final).trim();
      if (state.captions.verseDetect) detectVerseInSpeech(final);
    }
    state.captions.interim = interim;
    // Передаємо текст у вихід
    const outputKind = state.captions.targetOutput || 1;
    if (window.electronAPI && window.electronAPI.sendToOutput) {
      window.electronAPI.sendToOutput(outputKind, 'captions', {
        text: state.captions.text,
        interim: state.captions.interim
      });
    }
  };
  _speechRecognition.onerror = (event) => {
    notify('⚠️ Помилка розпізнавання: ' + event.error);
  };
}

function startCaptions() {
  if (!_speechRecognition) initCaptions();
  if (!_speechRecognition) return;
  state.captions.enabled = true;
  state.captions.text = '';
  _speechRecognition.start();
}

function stopCaptions() {
  if (_speechRecognition) _speechRecognition.stop();
  state.captions.enabled = false;
  state.captions.listening = false;
  markDirty('captions');
}

function clearCaptions() {
  state.captions.text = '';
  state.captions.interim = '';
  markDirty('captions');
  if (window.electronAPI && window.electronAPI.sendToOutput) {
    window.electronAPI.sendToOutput(state.captions.targetOutput || 1, 'captions', { text: '', interim: '' });
  }
}

function setCaptionLang(lang) {
  if (_speechRecognition) _speechRecognition.lang = lang;
  markDirty('captions');
}

function toggleVerseDetect() {
  state.captions.verseDetect = !state.captions.verseDetect;
  if (!state.captions.verseDetect) state.captions.suggestion = null;
  markDirty('captions');
  notify(state.captions.verseDetect ? '🔍 Автопропозиція вірша увімкнена' : 'Автопропозиція вірша вимкнена');
}

function acceptVerseSuggestion() {
  const s = state.captions.suggestion;
  if (!s) return;
  const parts = s.key.split('.');
  // goToVerse() лише ЗАВАНТАЖУЄ вірш у вкладку «Біблія» (книга/глава/вірш +
  // прев'ю) — сам по собі в зал НІЧОГО не виводить. Реальний показ і, що
  // важливо, увімкнення стрілок ◀▶ саме для гортання Біблії (а не пісні,
  // яка могла бути в ефірі до цього) робить sendBibleToProjector() — вона
  // ставить lastLiveSource='bible', той самий прапорець, який перевіряють
  // стрілки. Без цього виклику клавіші й далі гортали б стару пісню.
  if (typeof goToVerse === 'function') goToVerse(parts[0], parseInt(parts[1], 10), parseInt(parts[2], 10));
  if (typeof sendBibleToProjector === 'function') sendBibleToProjector();
  state.captions.suggestion = null;
  markDirty('captions');
}

function dismissVerseSuggestion() {
  state.captions.suggestion = null;
  markDirty('captions');
}

function audioMeterRefreshDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  navigator.mediaDevices.enumerateDevices().then(function(devices) {
    const sel = document.getElementById('audioMeterDeviceSel');
    if (!sel) return;
    const prevValue = sel.value;
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    sel.innerHTML = '<option value="">— обери мікрофон/вхід —</option>' +
      audioInputs.map((d, i) => {
        // Назву (label) браузер показує лише ПІСЛЯ наданого дозволу на мікрофон —
        // до того буде просто "Вхід 1" тощо (той самий нюанс, що й у камер).
        const name = d.label || ('Вхід ' + (i + 1));
        return `<option value="${d.deviceId}">${esc(name)}</option>`;
      }).join('');
    if (prevValue && audioInputs.some(d => d.deviceId === prevValue)) sel.value = prevValue;
  }).catch(e => console.warn('enumerateDevices не вдався:', e));
}

function audioMeterStart() {
  const sel = document.getElementById('audioMeterDeviceSel');
  if (!sel || !sel.value) { notify('⚠️ Спершу обери пристрій'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { notify('⚠️ Захоплення звуку недоступне в цій збірці'); return; }
  audioMeterStop();   // якщо вже щось підключено — коректно відключаємо перед новим стартом
  navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: sel.value } }, video: false }).then(stream => {
    _audioMeterStream = stream;
    _audioMeterCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = _audioMeterCtx.createMediaStreamSource(stream);
    const analyser = _audioMeterCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    (function tick() {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
      const pct = Math.min(100, Math.round((peak / 128) * 100 * 1.6)); // трохи підсилюємо для наочності
      // Шукаємо #audioMeterBar щоразу наново (не один раз на старті) — вкладку
      // «Субтитри» перемальовує renderTabInto (напр. при появі пропозиції вірша),
      // старий вузол стає відірваним від DOM і індикатор завмирав би назавжди.
      // Знайдено рев'ю коду.
      const bar = document.getElementById('audioMeterBar');
      if (bar) { bar.style.width = pct + '%'; bar.style.background = pct > 85 ? 'var(--red)' : (pct > 5 ? 'var(--green)' : 'var(--border)'); }
      _audioMeterRAF = requestAnimationFrame(tick);
    })();
    audioMeterRefreshDevices();   // після дозволу з'являються справжні назви пристроїв
    notify('🎚️ Слухаю: ' + (sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : 'пристрій'));
  }).catch(e => notify('⚠️ Не вдалось підключитись: ' + e.message));
}

function audioMeterStop() {
  if (_audioMeterRAF) { cancelAnimationFrame(_audioMeterRAF); _audioMeterRAF = null; }
  if (_audioMeterStream) { _audioMeterStream.getTracks().forEach(t => t.stop()); _audioMeterStream = null; }
  if (_audioMeterCtx) { _audioMeterCtx.close(); _audioMeterCtx = null; }
  const bar = document.getElementById('audioMeterBar');
  if (bar) { bar.style.width = '0%'; bar.style.background = 'var(--border)'; }
}

function setCaptionOutput(outputNum) {
  state.captions.targetOutput = outputNum || 1;
  markDirty('captions');
}

function renderCaptionsTab() {
  return `
  <div class="card" style="border-color:var(--blue)">
    <div class="card-title">🎤 Живі субтитри (Web Speech API)</div>
    <div class="card-sub">Розпізнавання мови з мікрофона комп'ютера → субтитри в реальному часі у вибраному виході.</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
      Статус: ${state.captions.listening ? '<span style="color:var(--green)">🎤 Слухаємо</span>' : 'готово'}
    </div>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <button class="btn ${state.captions.enabled ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="startCaptions()">▶ Пуск</button>
      <button class="btn btn-ghost btn-sm" onclick="stopCaptions()">⏹ Стоп</button>
      <button class="btn btn-ghost btn-sm" onclick="clearCaptions()">✕ Очистити текст</button>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Мова:</div>
    <select onchange="setCaptionLang(this.value)" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;margin-bottom:6px;outline:none">
      <option value="uk-UA">🇺🇦 Українська</option>
      <option value="ru-RU">🇷🇺 Російська</option>
      <option value="en-US">🇬🇧 Англійська</option>
    </select>
    <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Показувати в виході:</div>
    <div style="display:flex;gap:4px">
      <button class="btn ${state.captions.targetOutput === 1 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setCaptionOutput(1)">1</button>
      <button class="btn ${state.captions.targetOutput === 2 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setCaptionOutput(2)">2</button>
      <button class="btn ${state.captions.targetOutput === 3 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setCaptionOutput(3)">3</button>
      <button class="btn ${state.captions.targetOutput === 4 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setCaptionOutput(4)">4</button>
    </div>
    ${state.captions.text || state.captions.interim ? `
      <div style="margin-top:8px;padding:8px;background:var(--panel2);border-radius:4px;border-left:3px solid var(--blue)">
        <div style="font-size:11px;color:var(--text)">${esc(state.captions.text)}<span style="color:var(--text2);font-style:italic">${state.captions.interim ? ' ' + esc(state.captions.interim) : ''}</span></div>
      </div>
    ` : ''}
  </div>

  <div class="card" style="border-color:var(--gold)">
    <div class="card-title">🔍 Автопропозиція вірша</div>
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
      <input type="checkbox" ${state.captions.verseDetect ? 'checked' : ''} onchange="toggleVerseDetect()">
      🔍 Пропонувати вірш автоматично, коли почує цитату
    </label>
    <div class="card-sub" style="margin-top:4px">Локально, без AI й без інтернету — той самий пошук, що й у вкладці «Біблія», по вже імпортованому перекладу. Лише ПРОПОНУЄ (нижче), в зал сам нічого не надсилає — підтверджуєш кліком.</div>
    ${state.captions.suggestion ? `
      <div style="margin-top:8px;padding:8px;background:var(--panel2);border-radius:6px;border-left:3px solid var(--gold)">
        <div style="font-size:12px;color:var(--gold);font-weight:700">📖 ${esc(state.captions.suggestion.ref)}</div>
        <div style="font-size:11px;color:var(--text2);margin:4px 0">${esc(String(state.captions.suggestion.text).slice(0,120))}${state.captions.suggestion.text.length>120?'…':''}</div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-success btn-sm" onclick="acceptVerseSuggestion()">▶ Показати</button>
          <button class="btn btn-ghost btn-sm" onclick="dismissVerseSuggestion()">✕ Пропустити</button>
        </div>
      </div>
    ` : ''}
    <div class="card-sub" style="margin-top:8px">🎙 <b>Звук з пульта (SQ-6/ATEM) замість мікрофона комп'ютера:</b> Web Speech API завжди слухає мікрофон за замовчуванням у самій системі (Windows/macOS) — вибрати конкретний пристрій лише для цієї функції браузер не дозволяє. Постав пульт/картку захоплення мікрофоном/входом за замовчуванням у системних налаштуваннях звуку — тоді розпізнавання само почне слухати саме її.</div>
  </div>

  <div class="card">
    <div class="card-title">🎚️ Індикатор рівня звуку</div>
    <div class="card-sub">Перевірити, що кабель/захоплення від пульта дійсно ловить сигнал (не пов'язано з розпізнаванням вище, лише перевірка):</div>
    <select id="audioMeterDeviceSel" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px;color:var(--text);font-size:11px;margin:6px 0;outline:none">
      <option value="">— обери мікрофон/вхід —</option>
    </select>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <button class="btn btn-success btn-sm" onclick="audioMeterStart()">▶ Слухати</button>
      <button class="btn btn-ghost btn-sm" onclick="audioMeterStop()">⏹ Стоп</button>
      <button class="btn btn-ghost btn-sm" onclick="audioMeterRefreshDevices()">↻ Оновити список</button>
    </div>
    <div style="width:100%;height:10px;background:var(--panel2);border-radius:5px;overflow:hidden">
      <div id="audioMeterBar" style="width:0%;height:100%;background:var(--border);transition:width .08s linear"></div>
    </div>
  </div>`;
}

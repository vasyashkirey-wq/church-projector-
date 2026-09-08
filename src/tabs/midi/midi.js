// ============================================================
// MIDI-тригери (Web MIDI API) — призначення нот MIDI-контролера на дії
// (наступний/попередній куплет, в ефір, очистити, blackout, заморозка),
// картка налаштування живе в самій вкладці «Гарячі клавіші» (renderMidiCard
// викликається звідти — src/tabs/hotkeys/hotkeys.js).
//
// OSC-тригери (аналогічна фіча, але через UDP, з боку головного процесу)
// винесені окремо в src/main/osc.js — цей файл лише MIDI, рендерер-only,
// без жодної залежності від main.js.
//
// Винесено з src/extras-1.js — продовження модуляризації (typo.js →
// animations.js/fonts.js → playlist.js/powerpoint.js → stage.js/
// statistics.js → hotkeys.js → media.js → src/main/osc.js → ця). Мусить
// завантажуватись ДО extras-4.js — pv2Init() звертається до
// loadMidiMap/initMidi одразу при старті застосунку (масив steps).
// ============================================================

const MIDI_ACTIONS = [
  { action: 'next',     label: '▶ Далі' },
  { action: 'prev',     label: '◀ Назад' },
  { action: 'go-live',  label: '📺 В ефір' },
  { action: 'clear',    label: '✕ Очистити' },
  { action: 'blackout', label: '⬛ Чорний екран' },
  { action: 'freeze',   label: '❄️ Заморозка' }
];

function loadMidiMap() {
  try { const d = loadJSON(STORAGE_KEYS.midiMap); if (d) state.midiMap = d; } catch (e) {}
}

function saveMidiMap() { saveJSON(STORAGE_KEYS.midiMap, state.midiMap); }

function initMidi() {
  if (!navigator.requestMIDIAccess) {
    notify('⚠️ Ця збірка Chromium не підтримує Web MIDI');
    return;
  }
  navigator.requestMIDIAccess().then(function (access) {
    state.midiInputs = Array.from(access.inputs.values()).map(i => i.name);
    access.inputs.forEach(function (input) {
      input.onmidimessage = onMidiMessage;
    });
    access.onstatechange = function () {
      state.midiInputs = Array.from(access.inputs.values()).map(i => i.name);
      Array.from(access.inputs.values()).forEach(input => { input.onmidimessage = onMidiMessage; });
      if (isActive('hotkeys')) markDirty('hotkeys');
    };
    if (isActive('hotkeys')) markDirty('hotkeys');
    notify('🎹 MIDI: знайдено пристроїв — ' + state.midiInputs.length);
  }).catch(function () { notify('⚠️ Немає доступу до MIDI (дозволь у браузері/системі)'); });
}

function onMidiMessage(e) {
  const [status, note, velocity] = e.data;
  const cmd = status & 0xf0;
  if (cmd !== 0x90 || !velocity) return;   // цікавить лише «нота натиснута» (note-on)
  const key = 'note:' + note;
  if (state.midiLearn) {
    state.midiMap[state.midiLearn] = key;
    state.midiLearn = null;
    saveMidiMap();
    markDirty('hotkeys');
    notify('🎹 Прив\'язано: нота ' + note);
    return;
  }
  const action = Object.keys(state.midiMap).find(a => state.midiMap[a] === key);
  if (action && typeof applyStationCommand === 'function') applyStationCommand({ action: action, from: 'MIDI' });
}

function midiStartLearn(action) {
  state.midiLearn = action;
  markDirty('hotkeys');
  notify('🎹 Натисни клавішу/пад на MIDI-контролері для «' + action + '»…');
}

function midiClear(action) {
  delete state.midiMap[action];
  saveMidiMap();
  markDirty('hotkeys');
}

function renderMidiCard() {
  const rows = MIDI_ACTIONS.map(a => {
    const bound = state.midiMap[a.action];
    const learning = state.midiLearn === a.action;
    return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">
      <span style="font-size:11px;flex:1">${a.label}</span>
      <button class="btn ${learning ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="midiStartLearn('${a.action}')">
        ${learning ? '⏺ Чекаю ноту…' : (bound ? bound.replace('note:', 'нота ') : 'Призначити')}
      </button>
      ${bound ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="midiClear('${a.action}')">✕</button>` : ''}
    </div>`;
  }).join('');
  const oscRows = MIDI_ACTIONS.map(a => {
    const bound = state.oscMap[a.action];
    const learning = state.oscLearn === a.action;
    return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">
      <span style="font-size:11px;flex:1">${a.label}</span>
      <button class="btn ${learning ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="oscStartLearn('${a.action}')">
        ${learning ? '⏺ Чекаю адресу…' : (bound ? bound : 'Призначити')}
      </button>
      ${bound ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="oscClear('${a.action}')">✕</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="card" style="margin-top:10px">
    <div class="card-title">🎹 MIDI & 🎚️ OSC тригери</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-size:11px;color:var(--text);font-weight:bold;margin-bottom:4px">🎹 MIDI (Web MIDI API)</div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
          Пристрої: ${state.midiInputs.length ? esc(state.midiInputs.join(', ')) : 'не підключено'}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="initMidi()">🔌 Оновити</button>
        <div style="margin-top:8px;max-width:350px">${rows}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text);font-weight:bold;margin-bottom:4px">🎚️ OSC (UDP :9000)</div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
          ${state.oscRunning ? '<span style="color:var(--green)">✓ Слухаємо</span>' : 'зупинено'}
        </div>
        <div style="display:flex;gap:4px;margin-bottom:8px">
          <button class="btn ${state.oscRunning ? 'btn-ghost' : 'btn-primary'} btn-sm" onclick="startOscServer()">▶ Запустити</button>
          <button class="btn btn-ghost btn-sm" onclick="stopOscServer()">⏹ Стоп</button>
        </div>
        <div style="margin-top:8px;max-width:350px">${oscRows}</div>
      </div>
    </div>
  </div>`;
}

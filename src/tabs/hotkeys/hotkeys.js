// ============================================================
// ВКЛАДКА «⌨️ Гарячі клавіші» (hotkeys) — призначення клавіш на дії
// (наступний/попередній куплет, відправити, очистити, blackout, перемикання
// виходів тощо), збереження/скидання профілю прив'язок.
//
// MIDI/OSC-тригери (renderMidiCard і вся підсистема) НАВМИСНО лишились у
// extras-1.js — це окрема, більша підсистема (Web MIDI API + UDP OSC-сервер
// у головному процесі), і виносити її разом із простою конфігурацією клавіш
// сюди означало б роздути цей крок далеко за межі «одна вкладка = один
// файл». Кандидат на власний майбутній модуль tabs/midi_osc/.
//
// Сам диспетчер клавіш (initHotkeys — слухач keydown, що читає збережені
// прив'язки й виконує дії) лишився в index.html: він не є частиною UI цієї
// вкладки, а є ядром рантайму, з яким цей крок модуляризації не працює.
//
// Винесено з src/extras-1.js — продовження модуляризації (typo.js →
// animations.js/fonts.js → playlist.js/powerpoint.js → stage.js/
// statistics.js → ця). Мусить завантажуватись ДО extras-4.js —
// pv2Init() звертається до renderHotkeysTab одразу при старті застосунку
// (масив TABS).
// ============================================================

function renderHotkeysTab() {
return `<div class="card"><div class="card-title">⌨️ Гарячі клавіші</div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;max-width:350px"><div style="font-size:11px;color:var(--text2);padding:1px">Дія</div><div style="font-size:11px;color:var(--text2);padding:1px">Клавіша</div> <div style="font-size:11px;padding:1px">▶ Куплет</div><div><input type="text" class="hotkey-input" data-action="next-verse" value="Space" readonly style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;cursor:pointer;text-align:center" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">◀ Куплет</div><div><input type="text" class="hotkey-input" data-action="prev-verse" value="ArrowLeft" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">📺 Відправити</div><div><input type="text" class="hotkey-input" data-action="send" value="Enter" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">✕ Очистити</div><div><input type="text" class="hotkey-input" data-action="clear" value="Escape" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">⬛ Чорний екран</div><div><input type="text" class="hotkey-input" data-action="blackout" value="B" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">↶ Скасувати</div><div><input type="text" class="hotkey-input" data-action="undo" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">📢 Нижня третина</div><div><input type="text" class="hotkey-input" data-action="lower" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">❄️ Заморозка</div><div><input type="text" class="hotkey-input" data-action="freeze" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">📺 Відкрити/закрити проектор</div><div><input type="text" class="hotkey-input" data-action="toggle-projector" value="F1" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">🎥 Відкрити/закрити трансляцію</div><div><input type="text" class="hotkey-input" data-action="toggle-stream" value="F2" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">🖥 Відкрити/закрити вихід 3</div><div><input type="text" class="hotkey-input" data-action="toggle-out3" value="F3" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">🖥 Відкрити/закрити вихід 4</div><div><input type="text" class="hotkey-input" data-action="toggle-out4" value="F4" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">⚡ Відкрити/закрити обидва (1+2)</div><div><input type="text" class="hotkey-input" data-action="toggle-both" value="F5" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">📲 QR → надіслати</div><div><input type="text" class="hotkey-input" data-action="qr-send" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">🎬 Медіа → надіслати</div><div><input type="text" class="hotkey-input" data-action="media-send" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div> <div style="font-size:11px;padding:1px">📽 Презентація → надіслати</div><div><input type="text" class="hotkey-input" data-action="present-send" value="" readonly style="font-size:11px" onclick="startHotkeyCapture(this)"></div></div> <div class="card-sub" style="margin-top:4px">QR іде на вихід, обраний ТАМ у власній вкладці «QR-екран». Медіа й Презентація — на вихід із «🎯 Куди надсилати» (вкладка «Виходи»); «усі» = на всі дзеркальні екрани, як і плюс-кнопки в самих вкладках.</div><div class="card-sub" style="margin-top:4px;color:var(--gold)">⚠️ На macOS F1-F5 за замовчуванням займає сама система (яскравість/Mission Control/Launchpad) — застосунок їх часто взагалі не бачить. Якщо клавіша «не спрацьовує» — клікни на неї тут і признач іншу (напр. цифру чи букву).</div> <div class="flex" style="margin-top:3px"><button class="btn btn-primary btn-sm" onclick="saveHotkeyProfile()">💾</button><button class="btn btn-ghost btn-sm" onclick="resetHotkeys()">↺</button></div> <div id="hotkeyStatus" class="text-muted mt8"></div></div>` + renderMidiCard();
}

function startHotkeyCapture(inp) {
if(state._hotkeyCapture) { state._hotkeyCapture.style.borderColor = ''; state._hotkeyCapture = null; }
state._hotkeyCapture = inp;
inp.style.borderColor = 'var(--accent)';
inp.value = '...';
const status = $('#hotkeyStatus');
if(status) status.textContent = '⏳ Очікування...';
}

function saveHotkeyProfile() {
pv2Prompt('Назва профілю:', function(name){
if(!name) return;
const p = loadJSON(STORAGE_KEYS.hotkeyProfiles) || [];
p.push({name, date: new Date().toISOString().split('T')[0], hotkeys: state.hotkeys});
saveJSON(STORAGE_KEYS.hotkeyProfiles, p);
const status = $('#hotkeyStatus');
if(status) status.textContent = '✓ Профіль збережено';
});
}

function resetHotkeys() {
if(!confirm('Скинути?')) return;
// Повний набір усіх дій, що є в таблиці гарячих клавіш (renderHotkeysTab) —
// раніше тут стояли лише перші 4, і скидання мовчки стирало
// toggle-projector/stream/out3/out4/both (F1-F5, вихід на екран) та
// blackout/undo/lower/freeze/qr-send/media-send/present-send, якщо
// оператор хотів скинути лише навігацію по куплетах. Знайдено рев'ю коду.
state.hotkeys = {
  'next-verse':'Space','prev-verse':'ArrowLeft','send':'Enter','clear':'Escape',
  'blackout':'B','undo':'','lower':'','freeze':'',
  'toggle-projector':'F1','toggle-stream':'F2','toggle-out3':'F3','toggle-out4':'F4','toggle-both':'F5',
  'qr-send':'','media-send':'','present-send':''
};
saveHotkeys();
}

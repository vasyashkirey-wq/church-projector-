// ============================================================
// ВКЛАДКА «📋 Плейлист» (playlist) — черга контенту з автопрогоном за
// таймером: додати поточне, керувати чергою (наступний/попередній/показати),
// зберегти/завантажити чергу як файл.
//
// Винесено з src/extras-1.js — продовження модуляризації, розпочатої з
// tabs/g_design/typo.js (План: розділення на файли-за-вкладкою, без зміни
// поведінки). Мусить завантажуватись ДО extras-4.js — pv2Init() звертається
// до renderPlaylist/savePlaylistData/loadPlaylistData одразу при старті
// застосунку (масиви TABS і steps).
// ============================================================

function renderPlaylistTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">📋 Черга</div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-success btn-sm" onclick="addCurrentToPlaylist()">➕</button><button class="btn btn-primary btn-sm" onclick="runPlaylist()">▶</button><button class="btn btn-danger btn-sm" onclick="clearPlaylist()">✕</button><button class="btn btn-ghost btn-sm" onclick="savePlaylist()">💾</button><button class="btn btn-ghost btn-sm" onclick="loadPlaylist()">📂</button></div> <div id="playlistItems" style="min-height:30px;border:1px dashed var(--border);border-radius:2px;padding:2px"><p class="text-muted" style="text-align:center;padding:4px">Черга порожня</p></div> <div class="flex" style="margin-top:2px"><span style="font-size:11px;color:var(--text2)">Авто:</span><select id="playlistAutoMode" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none"><option value="off">Вимк</option><option value="timer">Таймер</option></select><input type="number" id="playlistTimer" value="10" style="width:24px;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none"><span style="font-size:11px;color:var(--text2)">сек</span><span id="playlistStatus" style="font-size:11px;color:var(--green)">● Стоп</span></div></div> </div><div> <div class="card"><div class="card-title">👁 Прев\'ю</div> <div class="preview-box" style="height:40px"><div class="preview-text" id="playlistPreview" style="color:#444;font-size:11px">Черга порожня</div></div> <div class="flex" style="margin-top:2px"><button class="btn btn-ghost btn-sm" onclick="playlistPrev()">◀</button><button class="btn btn-ghost btn-sm" onclick="playlistNext()">▶</button><button class="btn btn-success btn-sm" onclick="playlistSendCurrent()">📺</button></div> <div class="text-muted mt8" id="playlistCounter">0/0</div></div> </div></div>`;
}

function addCurrentToPlaylist() {
const content = getCurrentContent();
if(!content || !content.payload.html) { notify('Немає контенту'); return; }
let type = 'text', ref = content.payload.ref || 'Без назви';
if(isActive('songs')) { type = 'song'; ref = state.selectedSong ? state.selectedSong.title : 'Пісня'; }
else if(isActive('bible')) { type = 'bible'; ref = $('#bibleRef')?.textContent || 'Вірш'; }
else if(isActive('announce')) { type = 'announce'; ref = $('#annTitle')?.value || 'Оголошення'; }
state.playlist.push({id: Date.now() + Math.random() * 1000, type, ref, html: content.payload.html, content});
savePlaylistData();
renderPlaylist();
}

function runPlaylist() {
if(!state.playlist.length) { notify('Черга порожня'); return; }
state.playlistIndex = 0;
sendPlaylistItem(0);
state.playlistRunning = true;
const status = $('#playlistStatus');
if(status) status.textContent = '● Виконується...';
if($('#playlistAutoMode')?.value === 'timer') startPlaylistTimer();
}

function clearPlaylist() {
if(!confirm('Очистити чергу?')) return;
state.playlist = [];
state.playlistIndex = 0;
state.playlistRunning = false;
stopPlaylistTimer();
savePlaylistData();
renderPlaylist();
const status = $('#playlistStatus');
if(status) status.textContent = '● Зупинено';
}

function savePlaylist() {
pv2Prompt('Назва:', function(name){
if(!name) return;
const data = {name, date: new Date().toISOString().split('T')[0], items: state.playlist};
try {
const saved = loadJSON(STORAGE_KEYS.playlistSaved) || [];
saved.push(data);
saveJSON(STORAGE_KEYS.playlistSaved, saved);
notify('✓ Плейлист збережено');
} catch(e) {}
});
}

function loadPlaylist() {
try {
const saved = loadJSON(STORAGE_KEYS.playlistSaved) || [];
if(!saved.length) { notify('Немає'); return; }
const names = saved.map((p, i) => (i+1) + '. ' + p.name);
pv2Prompt('Введи номер плейлиста:\n' + names.join('\n'), function(choice){
if(choice) {
const idx = parseInt(choice) - 1;
if(idx >= 0 && idx < saved.length) {
state.playlist = saved[idx].items || [];
state.playlistIndex = 0;
savePlaylistData();
renderPlaylist();
const status = $('#playlistStatus');
if(status) status.textContent = '● Завантажено: ' + saved[idx].name;
}
}
});
} catch(e) {}
}

function playlistPrev() {
if(state.playlistIndex > 0) { state.playlistIndex--; sendPlaylistItem(state.playlistIndex); }
}

function playlistNext() {
if(state.playlistIndex < state.playlist.length - 1) {
state.playlistIndex++;
sendPlaylistItem(state.playlistIndex);
if($('#playlistAutoMode')?.value === 'timer') startPlaylistTimer();
} else {
const status = $('#playlistStatus');
if(status) status.textContent = '● Кінець';
}
}

function playlistSendCurrent() { if(state.playlist.length && state.playlist[state.playlistIndex]) sendPlaylistItem(state.playlistIndex); }

function renderPlaylist() {
const c = $('#playlistItems');
if(!c) return;
if(!state.playlist.length) {
c.innerHTML = '<p class="text-muted" style="text-align:center;padding:4px">Черга порожня</p>';
const preview = $('#playlistPreview');
const counter = $('#playlistCounter');
if(preview) preview.textContent = 'Черга порожня';
if(counter) counter.textContent = '0/0';
return;
}
const icons = {song:'🎵', bible:'📖', announce:'📢', text:'📄', html:'💻'};
let html = '<div style="display:flex;flex-direction:column;gap:1px;max-height:100px;overflow-y:auto">';
state.playlist.forEach((item, i) => {
const icon = icons[item.type] || '📄';
const isActive = i === state.playlistIndex;
const bg = isActive ? 'var(--panel)' : 'var(--bg)';
const border = isActive ? '1px solid var(--accent)' : '1px solid var(--border)';
html += `<div style="display:flex;align-items:center;gap:2px;background:${bg};border:${border};border-radius:2px;padding:4px 7px;font-size:11px"> <span>${icon}</span><span style="color:var(--text2);font-size:11px;min-width:12px">${item.type}</span> <span style="flex:1;color:var(--text);cursor:pointer" onclick="previewPlaylistItem(${i})">${esc(item.ref.substring(0,12))}</span> ${isActive ? '<span style="color:var(--green);font-size:11px">●</span>' : ''} <button class="btn btn-ghost btn-sm" onclick="movePlaylistItem(${i},-1)" style="font-size:11px;padding:2px 6px">↑</button> <button class="btn btn-ghost btn-sm" onclick="movePlaylistItem(${i},1)" style="font-size:11px;padding:2px 6px">↓</button> <button class="btn btn-success btn-sm" onclick="sendPlaylistItem(${i})" style="font-size:11px;padding:2px 6px">▶</button> <button class="btn btn-danger btn-sm" onclick="removePlaylistItem(${i})" style="font-size:11px;padding:2px 6px">✕</button> </div>`;
});
html += '</div>';
c.innerHTML = html;
const counter = $('#playlistCounter');
if(counter) counter.textContent = (state.playlistIndex + 1) + '/' + state.playlist.length;
const preview = $('#playlistPreview');
if(preview && state.playlist[state.playlistIndex]) { preview.textContent = state.playlist[state.playlistIndex].ref; preview.style.color = '#fff'; }
}

function previewPlaylistItem(i) {
const item = state.playlist[i];
if(!item) return;
const p = $('#playlistPreview');
if(p) { p.textContent = item.ref + ' (' + item.type + ')'; p.style.color = '#fff'; }
}

function sendPlaylistItem(i) {
const item = state.playlist[i];
if(!item) return;
state.playlistIndex = i;
if(item.content) {
if(item.content.type === 'text' || item.content.type === 'song' || item.content.type === 'bible') doSend(item.html || '', item.ref || '');
else doSendHTML(item.html || '', item.ref || '');
} else {
doSend(item.html || '', item.ref || '');
}
renderPlaylist();
const status = $('#playlistStatus');
if(status) status.textContent = '● Відправлено: ' + item.ref;
}

function removePlaylistItem(i) { state.playlist.splice(i, 1); savePlaylistData(); renderPlaylist(); if(state.playlistIndex >= state.playlist.length) state.playlistIndex = Math.max(0, state.playlist.length - 1); }

function savePlaylistData() { saveJSON(STORAGE_KEYS.playlist, state.playlist); }

function loadPlaylistData() {
try { const data = loadJSON(STORAGE_KEYS.playlist); if(Array.isArray(data)) state.playlist = data; } catch(e) { state.playlist = []; }
renderPlaylist();
}

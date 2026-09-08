// ============================================================
// ВКЛАДКА «🎬 Медіа» (media) — завантаження відео/аудіо файлів, YouTube,
// вбудований програвач, вивід на конкретний вихід із 🔴-підсвіткою
// активного й «Прибрати» (той самий патерн, що в H2R/QR/Таймері/Графіці/
// Титрах/Тікері — див. аудит «адресний вивід/прибирання»).
//
// Винесено з src/extras-1.js — продовження модуляризації (typo.js →
// animations.js/fonts.js → playlist.js/powerpoint.js → stage.js/
// statistics.js → hotkeys.js → ця). Мусить завантажуватись ДО extras-4.js —
// pv2Init() звертається до renderMediaOutBtns одразу при старті застосунку
// (масив steps), а renderMediaTab/renderMediaList — з масиву TABS.
// ============================================================

var mediaLiveMap = { 1: false, 2: false, 3: false, 4: false };

function renderMediaTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">🎬 Завантажити</div> <div onclick="document.getElementById('mediaInput').click()" style="padding:4px;border:1px dashed var(--border);border-radius:2px;text-align:center;cursor:pointer"><input type="file" id="mediaInput" accept="video/*,audio/*,.mp4,.webm,.mov,.mkv,.avi,.wmv,.flv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.m2v,.vob,.divx,.asf,.mxf,.mp3,.wav,.m4a,.aac,.ogg,.flac,.wma,.opus,.aiff,.aif,.amr,.ac3,.m4b" multiple style="display:none" onchange="loadMediaFiles(this)"><div style="font-size:16px">🎬</div><div style="font-size:11px;color:var(--text)">Відео/аудіо</div></div> <select id="mediaCatFilter" onchange="renderMediaList()" style="width:100%;margin-top:4px;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 4px;color:var(--text);font-size:11px"><option value="">Усі категорії</option></select> <div id="mediaList" style="max-height:110px;overflow-y:auto"><p class="text-muted">Немає</p></div></div> <div class="card"><div class="card-title">🎵 YouTube</div> <div class="flex"><input type="text" id="youtubeUrl" placeholder="https://youtube.com/..." style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:2px 3px;color:var(--text);font-size:12px;outline:none"><button class="btn btn-primary btn-sm" onclick="loadYouTube()">▶</button></div> <div id="youtubeStatus" class="text-muted mt8"></div></div> </div><div> <div class="card"><div class="card-title">▶ Програвач</div> <div id="mediaPlayer" style="aspect-ratio:16/9;background:#000;border-radius:2px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border)"><video id="videoPlayer" style="width:100%;height:100%;display:none" controls></video><audio id="audioPlayer" style="width:100%;display:none" controls></audio><div id="mediaPlaceholder" style="color:var(--text2);font-size:12px">Оберіть файл</div></div> <div class="flex" style="margin-top:2px"><button class="btn btn-success btn-sm" onclick="sendMediaToProjector()">📺</button><button class="btn btn-ghost btn-sm" onclick="toggleMediaPlay()">▶⏸</button><button class="btn btn-ghost btn-sm" onclick="stopMedia()">⏹</button><span id="mediaTime" class="text-muted" style="font-size:11px;padding:2px">00:00/00:00</span></div> <div class="flex" style="margin-top:4px;gap:3px"><div id="mediaOutBtns"></div></div> </div></div>`;
}

function loadMediaFiles(input) {
const files = Array.from(input.files);
if(!files.length) return;
const UNSUP = ['mov','mkv','avi','wmv','flv','m4v','mpg','mpeg','3gp','ts','flac','wma','opus','aiff','heic','heif','tif','tiff'];
files.forEach(f => {
const ext = (String(f.name).split('.').pop() || '').toLowerCase();
// Непідтримувані (MOV/MKV/FLAC…) з відомим шляхом — конвертуємо й беремо file://
// (для відео dataURL і так завеликий; шлях економніший).
if (UNSUP.indexOf(ext) >= 0 && f.path && typeof pathToFileUrl === 'function' && typeof ensureSupportedMedia === 'function') {
ensureSupportedMedia(f.path, function(cpath) {
state.mediaFiles.push({name: f.name, type: f.type, data: pathToFileUrl(cpath)});
renderMediaList();
});
return;
}
const r = new FileReader();
r.onload = function(e) {
state.mediaFiles.push({name: f.name, type: f.type, data: e.target.result});
renderMediaList();
};
r.readAsDataURL(f);
});
}

// Пакетування (rafDebounce — наявний ідіом проєкту, як updateLivePanels):
// ця функція викликалась із багатьох місць підряд, і кожен виклик повністю
// перебудовував список. Тепер підряд ідучі виклики склеюються в один
// перемальовок на кадр.
// Обгортка — саме function-декларація з ЛІНИВОЮ ініціалізацією, а не
// `const renderMediaList = rafDebounce(...)`: const створив би temporal dead zone,
// і будь-який виклик до цього рядка впав би з «Cannot access before
// initialization» — рівно той баг, що вже двічі ловився в цьому проєкті
// (loadDisplayToggles). Function-декларація піднімається (hoisting), тож
// порядок завантаження файлів більше не має значення.
var _renderMediaListDeb = null;
function renderMediaList() {
  if (!_renderMediaListDeb) _renderMediaListDeb = rafDebounce(_renderMediaListNow);
  return _renderMediaListDeb.apply(null, arguments);
}
function _renderMediaListNow() {
const c = $('#mediaList');
if(!c) return;
if(!state.mediaFiles.length) { c.innerHTML = '<p class="text-muted">Немає</p>'; return; }
// Фільтр за категорією (напр. «Вступні ролики», «Фонові відео») — той самий
// підхід, що вже перевірений для HTML-графіки.
const catFilterEl = $('#mediaCatFilter');
if (catFilterEl) {
  const cats = Array.from(new Set(state.mediaFiles.map(f => f.category).filter(Boolean))).sort();
  const prevCat = catFilterEl.value;
  catFilterEl.innerHTML = '<option value="">Усі категорії</option>' + cats.map(cat => `<option value="${esc(cat)}"${cat === prevCat ? ' selected' : ''}>${esc(cat)}</option>`).join('');
}
const catFilter = catFilterEl ? catFilterEl.value : '';
let html = '';
let shown = 0;
state.mediaFiles.forEach((f, i) => {
if (catFilter && f.category !== catFilter) return;
shown++;
const icon = f.type.startsWith('video') ? '🎬' : '🎵';
html += `<div style="display:flex;align-items:center;gap:2px;padding:4px 7px;border-bottom:1px solid var(--border);font-size:11px"> <span>${icon}</span><span style="flex:1;cursor:pointer" onclick="playMedia(${i})">${esc(f.name)}${f.category ? ' <span class="badge" style="font-size:9px">' + esc(f.category) + '</span>' : ''}</span> <button class="btn btn-success btn-sm" onclick="playMedia(${i})" style="font-size:11px;padding:2px 6px">▶</button> <button class="btn btn-ghost btn-sm" onclick="setMediaCategory(${i})" style="font-size:11px;padding:2px 6px" title="Категорія">🏷</button> <button class="btn btn-danger btn-sm" onclick="removeMedia(${i})" style="font-size:11px;padding:2px 6px">✕</button> </div>`;
});
c.innerHTML = html || '<p class="text-muted">Нічого не знайдено за цією категорією</p>';
}

function playMedia(i) {
state.currentMediaIndex = i;
const f = state.mediaFiles[i];
if(!f) return;
const v = $('#videoPlayer');
const a = $('#audioPlayer');
const p = $('#mediaPlaceholder');
if(!v || !a || !p) return;
if(f.type.startsWith('video')) {
v.style.display = 'block';
a.style.display = 'none';
p.style.display = 'none';
v.src = f.data;
v.load();
v.play();
state.mediaPlayer = v;
} else {
a.style.display = 'block';
v.style.display = 'none';
p.style.display = 'none';
a.src = f.data;
a.load();
a.play();
state.mediaPlayer = a;
}
if(state.mediaPlayer) {
state.mediaPlayer.ontimeupdate = function() {
const c = fmtTime(state.mediaPlayer.currentTime);
const t = fmtTime(state.mediaPlayer.duration || 0);
const timeEl = $('#mediaTime');
if(timeEl) timeEl.textContent = c + '/' + t;
};
}
}

function removeMedia(i) {
state.mediaFiles.splice(i, 1);
if(state.currentMediaIndex === i) {
state.currentMediaIndex = -1;
const v = $('#videoPlayer');
const a = $('#audioPlayer');
const p = $('#mediaPlaceholder');
if(v) v.style.display = 'none';
if(a) a.style.display = 'none';
if(p) p.style.display = 'block';
}
renderMediaList();
}

function setMediaCategory(i) {
  const f = state.mediaFiles[i];
  if (!f) return;
  pv2Prompt('Категорія (напр. «Заставки», «Фонові відео») — залиш порожнім, щоб прибрати:', f.category || '', function(newCat) {
    if (newCat === null) return;
    f.category = newCat.trim();
    if (typeof saveMediaFiles === 'function') saveMediaFiles();
    renderMediaList();
    notify(f.category ? '🏷 Категорія: ' + f.category : '🏷 Категорію знято');
  });
}

function renderMediaOutBtns() {
  const el = document.getElementById('mediaOutBtns');
  if (!el || typeof OUT_NAME === 'undefined') return;
  const outBtns = [1, 2, 3, 4].map(n => {
    const isLive = !!mediaLiveMap[n];
    return `<button class="btn ${isLive ? 'btn-success' : 'btn-ghost'} btn-sm" style="font-size:10px;padding:3px 6px" onclick="sendMediaToProjector(${n})" title="Показати саме на ${esc(OUT_NAME[n]||('Вихід '+n))}">${isLive ? '🔴 ' : ''}${esc(OUT_NAME[n]||('В.'+n))}</button>`;
  }).join('');
  const clearBtns = [1, 2, 3, 4].filter(n => mediaLiveMap[n]).map(n =>
    `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 6px;color:var(--red)" onclick="clearMediaFrom(${n})" title="Прибрати з ${esc(OUT_NAME[n]||('Вихід '+n))}">✕ ${esc(OUT_NAME[n]||('В.'+n))}</button>`
  ).join('');
  el.innerHTML = `<span style="font-size:10px;color:var(--text2);margin-right:3px">На вихід:</span>${outBtns}` +
    (clearBtns ? `<div class="flex mt8" style="gap:3px;flex-wrap:wrap">${clearBtns}</div>` : '');
}

function clearMediaFrom(n) {
  if (typeof pv2ClearOutput === 'function') pv2ClearOutput(n);
  mediaLiveMap[n] = false;
  renderMediaOutBtns();
}

function sendMediaToProjector(n) {
if(state.currentMediaIndex === -1 || !state.mediaFiles[state.currentMediaIndex]) {
notify('Оберіть медіа');
return;
}
const f = state.mediaFiles[state.currentMediaIndex];
let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}video,audio{max-width:100%;max-height:100vh;width:100%}</style></head><body>`;
if(f.type.startsWith('video')) {
html += `<video src="${f.data}" controls autoplay style="width:100%;height:100%;object-fit:contain"></video>`;
} else {
html += `<audio src="${f.data}" controls autoplay style="width:80%"></audio><div style="position:absolute;bottom:30px;color:#fff;font-size:14px">🎵 ${esc(f.name)}</div>`;
}
html += '</body></html>';
const mediaLabel = 'Медіа: ' + f.name;
if (!n) doSendHTML(html, mediaLabel);
else if (typeof sendHTMLToOutputN === 'function') sendHTMLToOutputN(n, html, mediaLabel);
if (n) { mediaLiveMap[n] = true; renderMediaOutBtns(); }
}

function stopMedia() {
if(!state.mediaPlayer) return;
state.mediaPlayer.pause();
state.mediaPlayer.currentTime = 0;
}

function toggleMediaPlay() {
if(!state.mediaPlayer) return;
if(state.mediaPlayer.paused) state.mediaPlayer.play();
else state.mediaPlayer.pause();
}

function loadYouTube() {
const url = $('#youtubeUrl')?.value?.trim() || '';
if(!url) { notify('Введіть посилання'); return; }
const vid = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[&?]|$)/);
if(!vid) { notify('Невірне посилання'); return; }
const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="https://www.youtube-nocookie.com/embed/${vid[1]}?autoplay=1&playsinline=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="origin"></iframe></body></html>`;
doSendHTML(html, 'YouTube');
const status = $('#youtubeStatus');
if(status) status.textContent = '✓ Відправлено';
}

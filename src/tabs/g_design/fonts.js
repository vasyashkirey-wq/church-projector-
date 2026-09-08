// ============================================================
// ВКЛАДКА «🎨 Шрифти» (fonts) — завантаження власних шрифтів (.ttf/.otf/
// .woff) і вибір окремого шрифту для пісень/Біблії/заголовків.
//
// Винесено з src/extras-1.js — продовження модуляризації, розпочатої з
// tabs/g_design/typo.js (План: розділення на файли-за-вкладкою, без зміни
// поведінки). Мусить завантажуватись ДО extras-4.js — pv2Init() звертається
// до renderFontsTab/renderFontsList одразу при старті застосунку (масиви
// TABS і steps).
// ============================================================

function renderFontsList() {
const c = $('#fontsList');
if(!c) return;
if(!state.customFonts.length) { c.innerHTML = '<p class="text-muted">Немає</p>'; return; }
let html = '';
state.customFonts.forEach((f, i) => {
html += `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="font-family:'${f.name}'">${esc(f.name)}</span><button class="btn btn-danger btn-sm" onclick="removeFont(${i})" style="font-size:11px;padding:2px 6px">✕</button></div>`;
});
c.innerHTML = html;
}

function renderFontsTab() {
return `<div class="card"><div class="card-title">🎨 Шрифти</div> <div onclick="document.getElementById('fontInput').click()" style="padding:4px;border:1px dashed var(--border);border-radius:2px;text-align:center;cursor:pointer"><input type="file" id="fontInput" accept=".ttf,.otf,.woff" multiple style="display:none" onchange="loadFonts(this)"><div style="font-size:14px">🖋️</div><div style="font-size:11px;color:var(--text)">Завантажити</div></div> <div id="fontsList" style="max-height:80px;overflow-y:auto;font-size:11px;color:var(--text)"><p class="text-muted">Немає</p></div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-top:3px"><select id="fontSongs" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="applyFontSettings()"><option value="Georgia, serif">Georgia</option></select><select id="fontBible" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="applyFontSettings()"><option value="Georgia, serif">Georgia</option></select><select id="fontHeaders" style="background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="applyFontSettings()"><option value="Georgia, serif">Georgia</option></select></div> <button class="btn btn-primary btn-sm" onclick="applyFontSettings()">✓</button> <div id="fontPreview" style="margin-top:3px;background:var(--bg);border-radius:2px;padding:4px;text-align:center;font-size:12px;color:var(--text)"><div id="fontPreviewText" style="font-family:Georgia,serif">Аа Бб Вв</div></div></div>`;
}

function applyFontSettings() {
const s = $('#fontSongs')?.value || 'Georgia, serif';
const b = $('#fontBible')?.value || 'Georgia, serif';
const h = $('#fontHeaders')?.value || 'Georgia, serif';
saveJSON(STORAGE_KEYS.fonts, {songs: s, bible: b, headers: h});
const preview = $('#fontPreviewText');
if(preview) preview.style.fontFamily = s;
notify('✓ Шрифти застосовано');
}

function loadFonts(input) {
const files = Array.from(input.files);
if(!files.length) return;
files.forEach(f => {
const r = new FileReader();
r.onload = function(e) {
const name = f.name.replace(/.[^.]+$/, '');
const blob = new Blob([e.target.result], {type: f.type});
const url = URL.createObjectURL(blob);
state.customFonts.push({name, url, file: f.name});
const style = document.createElement('style');
style.textContent = '@font-face{font-family:"' + name + '";src:url("' + url + '")}';
document.head.appendChild(style);
renderFontsList();
updateFontSelectors();
updateGraphicsFontList();   // новий шрифт одразу доступний у Графіці й Тексті
notify('🖋️ Шрифт "' + name + '" завантажено');
};
r.readAsArrayBuffer(f);
});
input.value = '';
}

function removeFont(i) {
state.customFonts.splice(i, 1);
renderFontsList();
updateFontSelectors();
}

function updateFontSelectors() {
['fontSongs','fontBible','fontHeaders'].forEach(id => {
const sel = $(`#${id}`);
if(!sel) return;
const current = sel.value;
while(sel.options.length > 1) sel.remove(1);
state.customFonts.forEach(f => {
const o = document.createElement('option');
o.value = f.name;
o.textContent = f.name;
sel.appendChild(o);
});
if(state.customFonts.some(f => f.name === current)) sel.value = current;
});
}

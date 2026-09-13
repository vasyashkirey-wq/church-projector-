// ============================================================
// ВКЛАДКА «🖨 Слайди/PPT» (powerpoint) — експорт пісень у PowerPoint (PPTX)
// чи HTML-слайди з вибором шаблону оформлення, з живим прев'ю.
//
// Винесено з src/extras-1.js — продовження модуляризації, розпочатої з
// tabs/g_design/typo.js (План: розділення на файли-за-вкладкою, без зміни
// поведінки). Мусить завантажуватись ДО extras-4.js — pv2Init() звертається
// до setPPTtemplate('classic') одразу при старті застосунку (масив steps).
// ============================================================

function renderPowerPointTab() {
return `<div class="grid2"><div> <div class="card"><div class="card-title">📊 Експорт</div> <div class="flex" style="margin-bottom:2px"><span style="font-size:11px;color:var(--text2)">Шаблон:</span><button class="btn btn-ghost btn-sm" onclick="setPPTtemplate('classic')" id="pptTemplateClassic" style="border:1px solid var(--accent)">📜</button><button class="btn btn-ghost btn-sm" onclick="setPPTtemplate('modern')" id="pptTemplateModern">✨</button><button class="btn btn-ghost btn-sm" onclick="setPPTtemplate('dark')" id="pptTemplateDark">🌑</button></div> <div class="flex"><button class="btn btn-primary" onclick="exportToPPTX()">⬇ PPTX</button><button class="btn btn-ghost btn-sm" onclick="exportToHTML()">🌐</button></div> <div id="pptStatus" class="text-muted mt8"></div></div> </div><div> <div class="card"><div class="card-title">👁 Прев\'ю</div> <div id="pptPreview" style="aspect-ratio:16/9;background:linear-gradient(135deg,#0a1628,#1e3a5f);border-radius:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--border);padding:6px;text-align:center"> <div id="pptPreviewTitle" style="color:#f0c040;font-size:12px;font-weight:700">Назва пісні</div> <div id="pptPreviewAuthor" style="color:rgba(255,255,255,0.3);font-size:11px">Автор</div> <div id="pptPreviewVerses" style="color:#fff;font-size:12px;line-height:1.2;margin-top:2px">Текст куплету</div></div> <div class="flex" style="margin-top:2px"><button class="btn btn-ghost btn-sm" onclick="pptPrevPreview()">◀</button><button class="btn btn-ghost btn-sm" onclick="pptNextPreview()">▶</button><span class="text-muted" id="pptPreviewCounter" style="font-size:11px;padding:1px">1/1</span></div></div> </div></div>`;
}

function setPPTtemplate(t) {
state.pptTemplate = t;
$$('[id^="pptTemplate"]').forEach(el => el.style.border = '1px solid transparent');
const btn = $('#pptTemplate' + t.charAt(0).toUpperCase() + t.slice(1));
if(btn) btn.style.border = '1px solid var(--accent)';
updatePPTPreview();
}

function exportToPPTX() {
if(!state.songs.length) { notify('Немає пісень'); return; }
const t = PPT_TEMPLATES[state.pptTemplate] || PPT_TEMPLATES.classic;
let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Пісні</title><style>body{margin:0;padding:12px;background:#1a1a1a;font-family:Arial,sans-serif}.slide{width:800px;height:450px;margin:10px auto;padding:24px 40px;background:${t.bg};border-radius:4px;display:flex;flex-direction:column;justify-content:center;page-break-after:always}.title{color:${t.titleColor};font-size:24px;font-weight:700;font-family:${t.fontFamily};text-align:center}.author{color:rgba(255,255,255,0.3);font-size:12px;text-align:center;margin-bottom:6px}.verses{color:${t.textColor};font-size:16px;font-family:${t.fontFamily};line-height:1.5;text-align:center}.footer{color:rgba(255,255,255,0.06);font-size:12px;text-align:center;margin-top:8px}</style></head><body>`;
state.songs.forEach(s => {
html += `<div class="slide"><div class="title">${esc(s.title)}</div>${s.author ? '<div class="author">✍️ '+esc(s.author)+'</div>' : ''}<div class="verses">${esc(s.verses[0] || '').replace(/\n/g,'<br>')}</div><div class="footer">⛪ Церква Прага</div></div>`;
});
html += '</body></html>';
const win = window.open('', '_blank', 'width=900,height=700');
if(!win) { notify('Дозвольте спливаючі вікна'); return; }
win.document.write(html);
win.document.close();
win.focus();
win.print();
const status = $('#pptStatus');
if(status) status.textContent = '✓ PPTX експортовано';
}

function exportToHTML() {
if(!state.songs.length) { notify('Немає'); return; }
let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Пісні</title><style>body{font-family:Georgia,serif;max-width:600px;margin:16px auto;padding:12px;background:#f5f0e8}.song{margin:8px 0;padding:8px;background:#fff;border-radius:3px}.title{font-size:16px;font-weight:700;color:#2d1b69}.author{color:#888;font-size:12px}.verse{margin:2px 0;padding:2px 6px;background:#faf8f5;border-left:2px solid #c8a84b}</style></head><body><h1>⛪ Пісні</h1>`;
state.songs.forEach(s => {
html += `<div class="song"><div class="title">${esc(s.title)}</div>${s.author ? '<div class="author">'+esc(s.author)+'</div>' : ''}<div class="verse">${esc(s.verses[0] || '').replace(/\n/g,'<br>')}</div></div>`;
});
html += '</body></html>';
downloadFile(html, 'songs_export.html', 'text/html');
}

function pptPrevPreview() {
if(state.pptPreviewIndex > 0) { state.pptPreviewIndex--; renderPPTPreview(); }
}

function pptNextPreview() {
if(state.pptPreviewIndex < state.songs.length - 1) { state.pptPreviewIndex++; renderPPTPreview(); }
}

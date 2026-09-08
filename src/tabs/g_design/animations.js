// ============================================================
// ВКЛАДКА «🎨 Анімації» (animations) — вхід/вихід контенту на екрані:
// тип переходу (fade/slide/zoom), швидкість, живе прев'ю, готові пресети
// (плавно/швидко).
//
// Винесено з src/extras-1.js — продовження модуляризації, розпочатої з
// tabs/g_design/typo.js (План: розділення на файли-за-вкладкою, без зміни
// поведінки). Мусить завантажуватись ДО extras-4.js — pv2Init() звертається
// до renderAnimationsTab одразу при старті застосунку (масив TABS).
// ============================================================

function renderAnimationsTab() {
return `<div class="card"><div class="card-title">🎨 Анімації</div> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:3px"> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Вхід</div><select id="animEntry" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="updateAnimationPreview()"><option value="fade">Fade</option><option value="slideLeft">Slide</option><option value="zoom">Zoom</option><option value="none">Немає</option></select></div> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Вихід</div><select id="animExit" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:2px;padding:4px 7px;color:var(--text);font-size:11px;outline:none" onchange="updateAnimationPreview()"><option value="fade">Fade</option><option value="slideLeft">Slide</option><option value="zoom">Zoom</option><option value="none">Немає</option></select></div> <div style="background:var(--bg);border-radius:2px;padding:2px;text-align:center"><div style="font-size:11px;color:var(--text2)">Швидкість</div><input type="range" id="animSpeed" min="100" max="2000" value="500" style="width:100%" oninput="document.getElementById('animSpeedVal').textContent=this.value+'ms';updateAnimationPreview()"><div style="font-size:11px;color:var(--text2)"><span id="animSpeedVal">500ms</span></div></div></div> <div class="flex" style="margin-bottom:2px"><button class="btn btn-primary btn-sm" onclick="applyAnimations()">💾</button><button class="btn btn-ghost btn-sm" onclick="resetAnimations()">↺</button><button class="btn btn-ghost btn-sm" onclick="previewAnimation()">▶</button></div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px"><div id="animPreviewBox" style="aspect-ratio:16/9;background:#0a1628;border-radius:2px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);overflow:hidden;position:relative"><div id="animPreviewText" style="color:#fff;font-size:14px;font-family:Georgia,serif;text-shadow:0 2px 6px rgba(0,0,0,0.5);padding:4px;text-align:center;transition:all 0.5s ease">🎨 Анімація</div></div> <div><div style="font-size:11px;color:var(--text2)">Пресети</div><div class="flex"><button class="btn btn-ghost btn-sm" onclick="applyPresetAnim('gentle')" style="font-size:11px;padding:4px 7px">🌊</button><button class="btn btn-ghost btn-sm" onclick="applyPresetAnim('fast')" style="font-size:11px;padding:4px 7px">🚀</button></div></div></div></div>`;
}

function getAnimationCSS(type, dir) {
const t = {
fade: {transform:'translate(0,0) scale(1)', opacity:'0'},
slideLeft: {transform:'translate(-40px,0) scale(1)', opacity:'0'},
zoom: {transform:'translate(0,0) scale(0.5)', opacity:'0'},
none: {transform:'translate(0,0) scale(1)', opacity:'1'}
};
if(dir === 'out' && type !== 'none') {
if(type === 'fade') return {transform:'translate(0,0) scale(1)', opacity:'0'};
if(type === 'slideLeft') return {transform:'translate(40px,0) scale(1)', opacity:'0'};
if(type === 'zoom') return {transform:'translate(0,0) scale(1.5)', opacity:'0'};
}
return t[type] || t.fade;
}

function applyAnimations() {
updateAnimationPreview();
saveJSON(STORAGE_KEYS.animations, state.animSettings);
const speedVal = $('#animSpeedVal');
if(speedVal) speedVal.textContent = state.animSettings.speed + 'ms';
notify('✓ Анімації застосовано');
}

function applyPresetAnim(name) {
const p = {
gentle: {entry:'fade', exit:'fade', speed:600},
fast: {entry:'fade', exit:'fade', speed:200}
}[name];
if(!p) return;
const entry = $('#animEntry');
const exit = $('#animExit');
const speed = $('#animSpeed');
if(entry) entry.value = p.entry;
if(exit) exit.value = p.exit;
if(speed) speed.value = p.speed;
const speedVal = $('#animSpeedVal');
if(speedVal) speedVal.textContent = p.speed + 'ms';
updateAnimationPreview();
applyAnimations();
previewAnimation();
}

function previewAnimation() {
const text = $('#animPreviewText');
if(!text) return;
const entry = getAnimationCSS(state.animSettings.entry, 'in');
text.style.transition = 'all ' + state.animSettings.speed + 'ms ease';
text.style.opacity = '0';
text.style.transform = entry.transform;
setTimeout(() => {
text.style.opacity = '1';
text.style.transform = 'translate(0,0) scale(1)';
}, 80);
setTimeout(() => {
const exit = getAnimationCSS(state.animSettings.exit, 'out');
text.style.opacity = '0';
text.style.transform = exit.transform;
}, state.animSettings.speed + 1000);
}

function resetAnimations() {
const entry = $('#animEntry');
const exit = $('#animExit');
const speed = $('#animSpeed');
if(entry) entry.value = 'fade';
if(exit) exit.value = 'fade';
if(speed) speed.value = 500;
const speedVal = $('#animSpeedVal');
if(speedVal) speedVal.textContent = '500ms';
updateAnimationPreview();
applyAnimations();
}

function updateAnimationPreview() {
state.animSettings.entry = $('#animEntry')?.value || 'fade';
state.animSettings.exit = $('#animExit')?.value || 'fade';
state.animSettings.speed = parseInt($('#animSpeed')?.value || 500);
}

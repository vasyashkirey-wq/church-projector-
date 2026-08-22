// ============================================================
// PTZ / камери + продакшн-сцени — винесено з index.html (модуль).
// Завантажується ПІСЛЯ extras-*.js; усі функції глобальні (як і раніше).
// ============================================================
// ===== 🎥 PTZ — КЕРУВАННЯ КАМЕРАМИ =====
var ptzCams = (function(){ try { var c = JSON.parse(localStorage.getItem('church_ptz_cams')); if (c && c.length === 4) return c; } catch(e){} return [0,1,2,3].map(function(){ return { ip:'', protocol:'auto', port:0, user:'', pass:'' }; }); })();
var ptzActive = 0;
var ptzSpeed = 12;
function ptzSavePtzCams(){ try { localStorage.setItem('church_ptz_cams', JSON.stringify(ptzCams)); } catch(e){} }
function ptzCfg(){ return ptzCams[ptzActive]; }
function ptzDefaultPort(proto){ return proto === 'auto' ? 0 : proto === 'visca-tcp' ? 5678 : proto === 'onvif' ? 80 : proto === 'http-cgi' ? 80 : 52381; }
// Зміна протоколу МАЄ скидати порт на дефолтний для нового протоколу —
// інакше стара камера (напр. 52381 від VISCA-UDP) лишається в полі port
// і команди на новому протоколі (напр. HTTP-CGI, порт 80) тихо йдуть в нікуди.
function ptzSetField(f, v){ ptzCfg()[f] = v; if (f === 'protocol') ptzCfg().port = ptzDefaultPort(v); ptzSavePtzCams(); }
function ptzRenderTabs(){
  var t = document.getElementById('ptzCamTabs'); if (!t) return;
  t.innerHTML = ptzCams.map(function(c,i){
    var live = (c.atemInput && window._atemPgmInput && c.atemInput === window._atemPgmInput);
    var tally = live ? ' <span style="color:#f56565">🔴</span>' : '';
    var lstyle = live ? 'box-shadow:0 0 0 2px #f56565;' : '';
    return '<button class="btn btn-sm ' + (i===ptzActive?'btn-primary':'btn-ghost') + '" style="' + lstyle + '" onclick="ptzSelectCam(' + i + ')">📷 ' + (c.name ? c.name : (i+1)) + tally + (c.ip ? '' : ' ⚠') + '</button>';
  }).join('');
}
function ptzSyncProtoUI(){
  var c = ptzCfg(), isOnvif = c.protocol === 'onvif', isAuto = c.protocol === 'auto';
  var al = document.getElementById('ptzAuthLabel'), ar = document.getElementById('ptzAuthRow');
  if (al) al.style.display = isOnvif ? 'block' : 'none';
  if (ar) ar.style.display = isOnvif ? 'flex' : 'none';
  var pf = document.getElementById('ptzPort');
  if (pf) { pf.disabled = isAuto; pf.placeholder = isAuto ? 'авто (стандартні порти)' : String(ptzDefaultPort(c.protocol)); }
  var h = document.getElementById('ptzProtoHint');
  if (h) h.textContent = isAuto ? 'Шле команду відразу всіма швидкими протоколами (VISCA-UDP + VISCA-TCP + HTTP-CGI) на стандартних портах — камера послухає той, який розуміє, решта безпечно ігнорується. Не треба знати протокол і порт. Якщо камера суто ONVIF — обери ONVIF окремо.'
    : c.protocol === 'visca-udp' ? 'Порт зазвичай 52381. Підходить більшості PTZ-камер.'
    : c.protocol === 'visca-tcp' ? 'Порт зазвичай 5678. Сирий VISCA через TCP.'
    : c.protocol === 'http-cgi' ? 'Керування через http://IP/cgi-bin/ptzctrl.cgi (PTZOptics-сумісні камери).'
    : 'ONVIF — потрібні логін/пароль камери. На робочій машині має бути npm install (пакет onvif).';
}
function ptzSelectCam(i){
  ptzActive = i; var c = ptzCfg(); var g = function(id){ return document.getElementById(id); };
  if (g('ptzName')) g('ptzName').value = c.name || '';
  if (g('ptzAtemInput')) g('ptzAtemInput').value = c.atemInput || '';
  if (g('ptzIp')) g('ptzIp').value = c.ip || '';
  if (g('ptzProto')) g('ptzProto').value = c.protocol || 'visca-udp';
  if (g('ptzPort')) g('ptzPort').value = (c.protocol === 'auto') ? '' : (c.port || ptzDefaultPort(c.protocol));
  if (g('ptzUser')) g('ptzUser').value = c.user || '';
  if (g('ptzPass')) g('ptzPass').value = c.pass || '';
  ptzRenderTabs(); ptzSyncProtoUI();
}
function ptzInit(){
  ptzRenderTabs();
  var pr = document.getElementById('ptzPresets');
  if (pr){ var cc = ptzCfg(); var pn = cc.presetNames || {}; var h = ''; for (var n=1;n<=9;n++){ var lbl = pn[n] ? pn[n] : n; h += '<div style="display:flex;gap:4px"><button class="btn btn-ghost btn-sm" style="flex:1" onclick="ptzPreset(' + n + ')">⭐ ' + lbl + '</button><button class="btn btn-ghost btn-sm" onclick="ptzPresetName(' + n + ')" title="Назвати пресет ' + n + '">✎</button><button class="btn btn-ghost btn-sm" onclick="ptzPresetSave(' + n + ')" title="Зберегти поточну позицію в пресет ' + n + '">💾</button></div>'; } pr.innerHTML = h; }
  ptzSelectCam(ptzActive);
  if (typeof renderScenes === 'function') renderScenes();
}
function ptzSendTo(camIndex, action, params){
  var c = ptzCams[camIndex];
  if (!c || !c.ip) { if (typeof notify === 'function') notify('⚠ Камера ' + (camIndex + 1) + ': не вказано IP'); return; }
  if (!window.electronAPI || !window.electronAPI.ptzCommand) return;
  var msg = Object.assign({ ip:c.ip, protocol:c.protocol||'auto', port:c.port||ptzDefaultPort(c.protocol), user:c.user, pass:c.pass, panSpeed:ptzSpeed, tiltSpeed:ptzSpeed, zoomSpeed:Math.max(1,Math.round(ptzSpeed/3.5)), action:action }, params||{});
  window.electronAPI.ptzCommand(msg).then(function(r){ if (r && !r.ok && typeof notify === 'function') notify('PTZ: ' + (r.error || 'не вдалося')); });
}
function ptzSend(action, params){
  var c = ptzCfg();
  if (!c.ip){ if (typeof notify === 'function') notify('⚠ Спершу вкажи IP камери'); return; }
  ptzSendTo(ptzActive, action, params);
}
function ptzMove(d){ ptzSend('move', { dir:d }); }
function ptzIris(d){ ptzSend('iris', { dir:d }); }
function ptzWB(mode){ ptzSend('wb', { mode:mode }); }
var _ptzSnapTimer = null;
function ptzSnapshot(){
  var box = document.getElementById('ptzSnapImg'), st = document.getElementById('ptzSnapStatus');
  var c = ptzCfg();
  if (!c.ip){ if (st) st.textContent = 'Спершу вкажи IP камери'; return; }
  if (!window.electronAPI || !window.electronAPI.ptzSnapshot){ if (st) st.textContent = 'Прев\'ю недоступне'; return; }
  if (st) st.textContent = '⏳ Отримую знімок…';
  window.electronAPI.ptzSnapshot({ ip:c.ip, user:c.user, pass:c.pass }).then(function(r){
    if (r && r.ok && box){ box.src = r.dataUrl; box.style.display = 'block'; if (st) st.textContent = ''; }
    else { if (box) box.style.display = 'none'; if (st) st.textContent = (r && r.error) || 'Не вдалося отримати знімок'; }
  }).catch(function(){ if (st) st.textContent = 'Помилка знімка'; });
}
function ptzSnapAuto(on){
  clearInterval(_ptzSnapTimer);
  if (on){ ptzSnapshot(); _ptzSnapTimer = setInterval(ptzSnapshot, 3000); }
}
function ptzStop(){ ptzSend('stop'); }
function ptzZoom(d){ ptzSend('zoom', { dir:d }); }
function ptzFocus(d){ ptzSend('focus', { dir:d }); }
function ptzPreset(n){ ptzSend('preset-recall', { n:n }); }
function ptzPresetName(n){
  var c = ptzCfg();
  var cur = (c.presetNames && c.presetNames[n]) || '';
  if (typeof pv2Prompt !== 'function') return;
  pv2Prompt('Назва пресета ' + n + ' (напр. Кафедра / Хор / Загальний):', cur, function(val){
    if (val === null || val === undefined) return;
    c.presetNames = c.presetNames || {};
    if (String(val).trim()) c.presetNames[n] = String(val).trim(); else delete c.presetNames[n];
    if (typeof ptzSavePtzCams === 'function') ptzSavePtzCams();
    if (typeof ptzRenderTabs === 'function') ptzRenderTabs();
  });
}
function ptzPresetSave(n){ if (typeof notify === 'function') notify('💾 Позицію збережено в пресет ' + n); ptzSend('preset-set', { n:n }); }
function ptzHome(){ ptzSend('home'); }

function ptzDiscoverCams(){
  var box = document.getElementById('ptzDiscoverList');
  if (!window.electronAPI || !window.electronAPI.ptzDiscover) { if (box) box.innerHTML = '<span style="font-size:11px;color:var(--text2)">Пошук недоступний у цій версії</span>'; return; }
  if (box) box.innerHTML = '<span style="font-size:11px;color:var(--text2)">⏳ Шукаю камери в мережі… (~3 с)</span>';
  window.electronAPI.ptzDiscover().then(function(r){
    if (!box) return;
    if (!r || !r.ok) { box.innerHTML = '<span style="font-size:11px;color:#f56565">Помилка: ' + ((r && r.error) || '') + '</span>'; return; }
    if (!r.cameras || !r.cameras.length) { box.innerHTML = '<span style="font-size:11px;color:var(--text2)">Камер не знайдено. Перевір, що камера й ПК в одній мережі (шукаються ONVIF-камери, що відповідають на WS-Discovery).</span>'; return; }
    box.innerHTML = '<div style="font-size:11px;color:var(--text2);margin-bottom:4px">Знайдено ' + r.cameras.length + ' — клікни, щоб підставити IP активній камері:</div>' +
      r.cameras.map(function(c){ return '<button class="btn btn-ghost btn-sm" style="margin:2px 4px 2px 0" onclick="ptzUseFound(\'' + c.ip + '\')">📷 ' + c.ip + '</button>'; }).join('');
  }).catch(function(){ if (box) box.innerHTML = '<span style="font-size:11px;color:#f56565">Помилка пошуку</span>'; });
}
function ptzUseFound(ip){
  ptzSetField('ip', ip);
  ptzSelectCam(ptzActive);
  if (typeof notify === 'function') notify('📷 IP ' + ip + ' → Камера ' + (ptzActive + 1));
}
function ptzCheckLinks(){
  var box = document.getElementById('ptzLinkStatus');
  if (!box) return;
  if (!window.electronAPI || !window.electronAPI.ptzPing) { box.textContent = 'Перевірка недоступна у цій версії'; return; }
  box.innerHTML = '⏳ Перевіряю звʼязок…';
  var checks = ptzCams.map(function(c, i){
    if (!c.ip) return Promise.resolve('📷 Камера ' + (i + 1) + ': — (немає IP)');
    var port = (c.protocol === 'visca-tcp') ? (c.port || 5678) : 80;   // веб-порт камери для перевірки
    return window.electronAPI.ptzPing({ ip: c.ip, port: port })
      .then(function(r){ return '📷 Камера ' + (i + 1) + ' (' + c.ip + '): ' + (r && r.online ? '🟢 онлайн' : '🔴 офлайн'); })
      .catch(function(){ return '📷 Камера ' + (i + 1) + ' (' + c.ip + '): 🔴 офлайн'; });
  });
  Promise.all(checks).then(function(res){ if (box) box.innerHTML = res.join('<br>'); });
}

// Гарячі клавіші: цифри 1-9 викликають пресет активної камери — але лише коли
// відкрита вкладка «Камери» і фокус не в полі вводу (щоб не заважати набору IP).
document.addEventListener('keydown', function(e) {
  if (typeof isActive !== 'function' || !isActive('ptz')) return;
  var tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key >= '1' && e.key <= '9') { e.preventDefault(); ptzPreset(parseInt(e.key, 10)); }
});

// 🎬 Сцени продакшену — камера (пресет) + ATEM (вхід) однією кнопкою
var prodScenes = (function(){ try { var c = JSON.parse(localStorage.getItem('church_prod_scenes')); if (Array.isArray(c)) return c; } catch(e){} return []; })();
function saveScenes(){ try { localStorage.setItem('church_prod_scenes', JSON.stringify(prodScenes)); } catch(e){} }
function sceneEsc(t){ return (typeof esc === 'function') ? esc(t) : String(t).replace(/[<>&]/g, function(c){ return { '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]; }); }
function renderScenes(){
  var el = document.getElementById('scenesList'); if (!el) return;
  if (!prodScenes.length) { el.innerHTML = '<p class="text-muted" style="font-size:12px">Ще немає сцен — додай першу вгорі.</p>'; return; }
  el.innerHTML = prodScenes.map(function(s, i){
    var d = [];
    if (s.cam != null && s.preset != null) d.push('Кам' + (s.cam + 1) + '·пресет' + s.preset);
    if (s.atem != null) d.push('ATEM вхід' + s.atem);
    return '<div style="display:flex;gap:4px"><button class="btn btn-primary btn-sm" style="flex:1;text-align:left;line-height:1.3" onclick="playScene(' + i + ')">🎬 ' + sceneEsc(s.name) + '<br><span style="font-size:10px;opacity:.75">' + d.join(' + ') + '</span></button><button class="btn btn-ghost btn-sm" onclick="delScene(' + i + ')" title="Видалити сцену">✕</button></div>';
  }).join('');
}
function addScene(){
  var g = function(id){ return document.getElementById(id); };
  var name = (g('sceneName').value || '').trim();
  var cam = g('sceneCam').value, preset = g('scenePreset').value, atem = g('sceneAtem').value;
  if (!name) { if (typeof notify === 'function') notify('⚠ Вкажи назву сцени'); return; }
  if (cam === '' && atem === '') { if (typeof notify === 'function') notify('⚠ Обери камеру+пресет або вхід ATEM'); return; }
  prodScenes.push({ name: name, cam: cam === '' ? null : parseInt(cam, 10), preset: preset === '' ? null : parseInt(preset, 10), atem: atem === '' ? null : parseInt(atem, 10) });
  saveScenes(); renderScenes();
  g('sceneName').value = '';
  if (typeof notify === 'function') notify('🎬 Сцену «' + name + '» додано');
}
function delScene(i){ prodScenes.splice(i, 1); saveScenes(); renderScenes(); }
function playScene(i){
  var s = prodScenes[i]; if (!s) return;
  if (s.cam != null && s.preset != null && typeof ptzSendTo === 'function') ptzSendTo(s.cam, 'preset-recall', { n: s.preset });
  if (s.atem != null && window.electronAPI && window.electronAPI.atemCommand) {
    // Чекаємо підтвердження зміни preview, а не фіксований таймер — інакше на
    // повільному лінку 'auto' може спрацювати до фактичної зміни preview
    // і в ефір піде попереднє джерело замість обраного сценою.
    atemCmd({ type: 'preview', input: s.atem }).then(function(result) {
      if (result && result.ok === false) return;
      atemCmd({ type: 'auto' });   // плавний перехід у ефір
    });
  }
  if (typeof notify === 'function') notify('🎬 ' + s.name);
}

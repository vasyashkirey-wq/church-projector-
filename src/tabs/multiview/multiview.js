// ============================================================
// ВКЛАДКА «🔳 Мультив'ю» (multiview) — 4 живі мініатюри всіх виходів
// одночасно (проектор/трансляція/вихід3/вихід4), оновлюються в реальному
// часі за поточним контентом в ефірі (state.onAir).
//
// Винесено з src/extras-4.js — продовження модуляризації (typo.js →
// ... → monitors.js → stream.js → ця). Мусить завантажуватись ДО
// extras-4.js — renderMultiviewTab викликається з масиву TABS у
// pv2Init(), а updateMultiviewFrames — з extras-2.js (кожен вихід
// оновлюється, коли щось нове виходить в ефір).
// ============================================================

let _multiviewUpdateTimer = null;

function renderMultiviewTab() {
  const outputs = [
    { num: 1, kind: 'projector', label: 'Проектор (Вихід 1)', bg: '#1a1a2e' },
    { num: 2, kind: 'stream', label: 'Трансляція (Вихід 2)', bg: '#0d1b2e' },
    { num: 3, kind: 'out3', label: 'Вихід 3', bg: '#1a2e2e' },
    { num: 4, kind: 'out4', label: 'Вихід 4', bg: '#2e1a1a' }
  ];

  const cards = outputs.map(o => {
    const win = state.outputStatus && state.outputStatus[o.kind];
    const status = win ? (win.content ? '✓ ' + win.content.slice(0, 30) : '⚫ Чорний екран') : '❌ Не відкрито';
    const color = !win ? 'var(--red)' : (win.content ? 'var(--green)' : 'var(--orange)');
    return `
      <div style="display:flex;flex-direction:column;height:100%;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:${o.bg}">
        <div style="padding:6px;border-bottom:1px solid var(--border);background:var(--panel2)">
          <div style="font-size:12px;color:var(--text);font-weight:bold">${o.label}</div>
          <div style="font-size:10px;color:${color};margin-top:2px">${status}</div>
        </div>
        <div style="flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center">
          <iframe id="mv-frame-${o.num}" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;background:${o.bg}" 
                  onload="updateMultiviewFrame(${o.num})"></iframe>
          <div style="position:absolute;z-index:1;text-align:center;opacity:0.7">
            <div style="font-size:48px">🎬</div>
            <div style="font-size:11px;color:var(--text2)">завантаження…</div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;height:calc(100vh - 140px);padding:8px">
    ${cards}
  </div>
  
  <div style="position:fixed;bottom:12px;right:12px;font-size:11px;color:var(--text2)">
    Оновлюється в реальному часі • F5 для повного оновлення
  </div>`;
}

function updateMultiviewFrame(num) {
  const kinds = ['projector', 'stream', 'out3', 'out4'];
  const kind = kinds[num - 1];
  const f = document.getElementById('mv-frame-' + num);
  if (!f) return;
  
  // Генеруємо простий HTML для кожного виходу — показуємо тільки то, що зараз у ефірі
  const c = state.onAir || {};
  const content = c.label || '';
  const ref = c.ref || '';
  const html = c.html || '';
  
  const previewHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin:0; padding:20px; background:#111; color:#fff; font-family:Arial,sans-serif; overflow:hidden; }
    .preview { text-align:center; font-size:20px; }
    .label { color:#aaa; margin:10px 0; }
    .ref { color:#888; font-size:14px; }
  </style>
</head>
<body>
  <div class="preview">
    <div style="font-size:24px;margin:20px 0">${content ? esc(content) : '(порожньо)'}</div>
    ${ref ? '<div class="ref">' + esc(ref) + '</div>' : ''}
    ${html ? '<div style="margin-top:20px;border:1px solid #333;padding:10px;border-radius:4px;background:#1a1a1a">' + html.slice(0, 200) + '…</div>' : ''}
  </div>
</body>
</html>`;
  f.srcdoc = previewHtml;
}

function updateMultiviewFrames() {
  // Оновлюємо всі 4 фрейми в режимі реального часу
  for (let i = 1; i <= 4; i++) {
    if (typeof updateMultiviewFrame === 'function') updateMultiviewFrame(i);
  }
}

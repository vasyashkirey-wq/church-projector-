// ============================================================
// ВКЛАДКА «🖥 Монітори» (monitors) — прив'язка виходів до фізичних
// моніторів, тестова таблиця (test pattern), автоматичний перехід на
// резервний монітор (failover), підпис номерів моніторів на екрані.
//
// Винесено з src/extras-3.js — продовження модуляризації (typo.js →
// animations.js/fonts.js → playlist.js/powerpoint.js → stage.js/
// statistics.js → hotkeys.js → media.js → src/main/osc.js → midi.js →
// text_control.js → ця). Мусить завантажуватись ДО extras-4.js —
// pv2Init() звертається до refreshMonitors одразу при старті застосунку
// (масив steps).
// ============================================================

function renderMonitorsTab() {
  const ds = state.displays || [];
  const bind = state.outputBind || {};

  const cards = ds.map(d => {
    const boundTo = [1,2,3,4].filter(n => bind[OUT_KIND[n]] === d.fingerprint);
    const openHere = (d.open || []).map(k => Object.keys(OUT_KIND).find(n => OUT_KIND[n] === k));
    const badge = d.isOperator
      ? '<span style="background:var(--red);color:#fff;font-size:12px;padding:2px 6px;border-radius:4px">ЕКРАН ОПЕРАТОРА</span>'
      : (d.isPrimary ? '<span style="background:var(--panel2);color:var(--text2);font-size:12px;padding:2px 6px;border-radius:4px">головний</span>' : '');

    const bindBtns = d.isOperator ? '<span style="font-size:12px;color:var(--text2)">Вивід на цей екран заблоковано</span>'
      : [1,2,3,4].map(n =>
        `<button class="btn ${boundTo.includes(n) ? 'btn-primary' : 'btn-ghost'} btn-sm"
                 onclick="bindOutputToDisplay(${n}, ${boundTo.includes(n) ? 'null' : `'${d.fingerprint}'`})">${OUT_NAME[n]}</button>`).join(' ');

    // Тестова сітка саме на ЦЬОМУ моніторі — раніше можна було перевірити лише
    // всі виходи одразу; тепер окремо для кожного закріпленого сюди виходу.
    const testBtns = !d.isOperator && boundTo.length
      ? '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">' +
        '<span style="font-size:12px;color:var(--text2);min-width:70px">Сітка тут:</span>' +
        boundTo.map(n => `<button class="btn ${(state.testPattern && state.testPattern[n]) ? 'btn-primary' : 'btn-ghost'} btn-sm"
                   onclick="toggleTestPattern(${n})">🎯 ${OUT_NAME[n]}</button>`).join(' ') +
        '</div>'
      : '';

    // Резервне дублювання: якщо саме цей монітор зникне, куди перекинути вміст.
    const failoverBtns = !d.isOperator && boundTo.length
      ? '<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
        boundTo.map(n => {
          const cur = (state.outputFailover && state.outputFailover[n]) || '';
          const opts = [1,2,3,4].filter(k => k !== n).map(k =>
            `<option value="${k}" ${cur == k ? 'selected' : ''}>${OUT_NAME[k]}</option>`).join('');
          return `<span style="font-size:12px;color:var(--text2)">🛟 Резерв для ${OUT_NAME[n]}:</span>
                  <select onchange="setOutputFailover(${n}, this.value)" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:2px;color:var(--text);font-size:11px">
                    <option value="">Немає</option>${opts}
                  </select>`;
        }).join(' ') +
        '</div>'
      : '';

    return `<div class="card" style="margin-bottom:8px;border-color:${d.isOperator ? 'var(--red)' : (boundTo.length ? 'var(--accent)' : 'var(--border)')}">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:22px;font-weight:800;color:var(--accent)">${d.num}</span>
        <div style="flex:1;min-width:120px">
          <div style="font-size:12px;color:var(--text)">${d.width} × ${d.height}${d.scaleFactor !== 1 ? ' <span style="color:var(--gold)">(масштаб ' + Math.round(d.scaleFactor*100) + '%, реально ' + d.realWidth + '×' + d.realHeight + ')</span>' : ''}</div>
          <div style="font-size:12px;color:var(--text2)">позиція ${d.x},${d.y}${d.rotation ? ' • поворот ' + d.rotation + '°' : ''}${openHere.length ? ' • <span style="color:var(--green)">вікно виводу тут</span>' : ''}</div>
        </div>
        ${badge}
      </div>
      <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
        <span style="font-size:12px;color:var(--text2);min-width:70px">Закріпити:</span>
        ${bindBtns}
      </div>
      ${boundTo.length > 1 ? `<div style="margin-top:4px;font-size:11px;color:var(--accent)">🔗 У парі на цьому моніторі: ${boundTo.map(n => OUT_NAME[n]).join(' + ')} — навмисно, розкладені поруч без перекриття (кожен зі своїми налаштуваннями).</div>` : ''}
      ${testBtns}
      ${failoverBtns}
    </div>`;
  }).join('') || '<div class="card"><div class="card-sub">Монітори не знайдені — натисни «Оновити».</div></div>';

  const tp = state.testPattern || {};
  return `
  <div class="card">
    <div class="card-title">🖥 Монітори (${ds.length})</div>
    <div class="card-sub">Закріплення тримається за «відбитком» монітора, а не за його ID — тож переживає перезавантаження Windows, де ID змінюються.</div>
    <div class="card-sub" style="margin-top:4px">За замовчуванням виходи автоматично розходяться по РІЗНИХ моніторах. Щоб навмисно посадити 2+ виходи на ОДИН монітор (працювати в парі) — закріпи їх обидва за тим самим монітором нижче: кожна кнопка з назвою виходу вмикається/вимикається окремо, як галочка. У парі вони розкладуться поруч без перекриття, кожен зі своїми налаштуваннями (текст/хромакей/фон).</div>
    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="identifyDisplays()">🔢 Показати номери на екранах</button>
      <button class="btn ${tp.all ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleTestPattern(null)">🎯 Тестова сітка</button>
      <button class="btn btn-ghost btn-sm" onclick="refreshMonitors()">↻ Оновити</button>
    </div>
    <div class="card-sub" style="margin-top:6px">
      Сітка показує <b style="color:#f0c040">жовту рамку</b> — край екрана (якщо її не видно, проектор зрізає краї)
      і <b style="color:#3ecf8e">зелений пунктир</b> — безпечну зону для тексту.
    </div>
  </div>
  ${cards}`;
}

function bindOutputToDisplay(n, fingerprint) {
  if (!window.electronAPI || !window.electronAPI.bindOutputFingerprint) return;
  state.outputBind = state.outputBind || {};
  state.outputBind[OUT_KIND[n]] = fingerprint || null;
  saveJSON(STORAGE_KEYS.live + '_bind', state.outputBind);
  if (typeof logChange === 'function') {
    logChange('Прив\'язка ' + (OUT_NAME[n] || n), fingerprint ? 'закріплено за монітором' : 'прив\'язку знято');
  }
  window.electronAPI.bindOutputFingerprint(OUT_KIND[n], fingerprint).then(() => {
    refreshMonitors();
    // Дзеркально до onOutputDisplayChange() у extras-4.js: цей екран змінює
    // outputConfig у головному процесі, але локальна копія outputConfig у
    // рендерері (з якої вкладка «Виходи» малює свій випадаючий список
    // монітора) інакше лишалась би застарілою, поки не перезапустити програму.
    if (window.electronAPI.getOutputConfig) {
      window.electronAPI.getOutputConfig().then(cfg => {
        if (cfg) { outputConfig = cfg; }
        if (typeof isActive === 'function' && isActive('router')) markDirty('router');
      });
    }
    notify(fingerprint ? '🔗 ' + OUT_NAME[n] + ' закріплено за монітором' : 'Прив\'язку знято');
  });
}

function toggleTestPattern(n) {
  state.testPattern = state.testPattern || {};
  const kind = n ? OUT_KIND[n] : null;
  const key = n || 'all';
  state.testPattern[key] = !state.testPattern[key];
  if (window.electronAPI && window.electronAPI.testPattern) {
    window.electronAPI.testPattern(kind, state.testPattern[key]);
  }
  markDirty('monitors');
  notify(state.testPattern[key] ? '🎯 Тестова сітка увімкнена' : 'Сітку прибрано');
}

function setOutputFailover(n, backupN) {
  state.outputFailover = state.outputFailover || {};
  state.outputFailover[n] = backupN ? parseInt(backupN, 10) : null;
  saveJSON(STORAGE_KEYS.live + '_failover', state.outputFailover);
  markDirty('monitors2');
  notify(backupN ? '🛟 ' + OUT_NAME[n] + ' → резерв: ' + OUT_NAME[backupN] : 'Резерв знято для ' + OUT_NAME[n]);
}

function identifyDisplays() {
  if (window.electronAPI && window.electronAPI.identifyDisplays) {
    window.electronAPI.identifyDisplays(4);
    notify('🔢 Номери показані на всіх екранах (4 с)');
  }
}

function refreshMonitors() {
  if (!window.electronAPI || !window.electronAPI.getDisplays) return;
  window.electronAPI.getDisplays().then(list => {
    state.displays = list || [];
    // Вкладка зареєстрована під id 'monitors2' (пункт меню «Прив'язка екранів»).
    // 'monitors' — стара назва, яку renderTabInto ще розуміє, але isActive('monitors')
    // ніколи не був істинним після перейменування — оновлені дані мовчки НЕ
    // перемальовувались, поки не вийти з вкладки й не зайти знову.
    if (isActive('monitors2')) markDirty('monitors2');
    if (typeof syncMonitorMissingBanner === 'function') syncMonitorMissingBanner();
  }).catch(() => {});
}

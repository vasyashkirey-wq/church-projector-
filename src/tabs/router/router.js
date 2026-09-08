// ============================================================
// ВКЛАДКА «🔌 Виходи/Router» (router) — ЛИШЕ розмітка (render-функція).
//
// ⚠️ НАВМИСНО винесено ОКРЕМО від типового підходу цієї модуляризації:
// уся логіка, яку викликає ця вкладка (pv2ClearOutput, pv2OpenOutput,
// pv2CloseOutput, setOutputRoute, pv2SetChroma, syncAllOutputs і решта —
// 20+ функцій) НЕ переносилась сюди, бо вони глибоко спільні — ними
// користуються практично всі вже винесені вкладки (Біблія, Медіа,
// Таймер, Графіка, QR тощо). Перенесення логіки сюди означало б або
// дублювання, або змушувало б усі ті вкладки залежати від router.js.
// pv2ClearOutput лишається в extras-2.js, решта — в extras-4.js.
//
// Продовження модуляризації (typo.js → ... → settings.js → ця). Мусить
// завантажуватись ДО extras-4.js — renderRouterTab викликається з
// dispatch-таблиці renderTabInto (extras-1.js) і з масиву TABS у
// pv2Init(), а логіка (лишена в extras-4.js) вантажиться пізніше — це
// нормально, кросс-файлові виклики резолвляться в момент виконання, не
// завантаження.
// ============================================================

function renderRouterTab() {
  let rows = '';
  for (let i = 1; i <= 4; i++) {
    const route = state.outputRoutes[i] || 'mirror';
    const opts = Object.keys(ROUTE_LABELS).map(k =>
      `<option value="${k}"${k === route ? ' selected' : ''}>${ROUTE_LABELS[k]}</option>`).join('');
    const liveNow = (route === 'mirror')
      ? (state.onAir ? (state.onAir.label || state.onAir.ref || 'Щось в ефірі') : '⬛ Порожньо')
      : (state.outputLive && state.outputLive[i]) || ROUTE_LABELS[route] || '—';
    rows += `<div class="card" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span id="pv2Dot${i}" style="color:var(--text2)">●</span>
        <input id="pv2Name${i}" value="${esc(OUT_NAME[i])}" maxlength="24"
               onkeydown="if(event.key==='Enter'){setOutputName(${i},this.value);this.blur();}"
               onblur="setOutputName(${i},this.value)"
               style="font-size:13px;font-weight:700;background:transparent;border:1px solid transparent;border-radius:4px;padding:2px 4px;color:var(--text);width:130px;outline:none"
               onfocus="this.style.borderColor='var(--border)'" title="Клікни, щоб перейменувати">
        <button class="btn btn-success btn-sm" onclick="pv2OpenOutput(${i})">Відкрити</button>
        <button class="btn btn-ghost btn-sm" onclick="pv2CloseOutput(${i})">Закрити</button>
        <button class="btn btn-ghost btn-sm" onclick="pv2ClearOutput(${i})">🚫 Очистити</button>
        <button class="btn btn-primary btn-sm" onclick="pv2ForceRefresh(${i})">▶ Оновити зараз</button>
      </div>
      <div style="font-size:11px;color:var(--text2);margin:-4px 0 6px 2px">Зараз: <span id="pv2Live${i}">${esc(liveNow)}</span></div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text2);min-width:56px">Показує:</span>
        <select onchange="setOutputRoute(${i}, this.value)"
                style="flex:1;min-width:200px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:11px;outline:none">${opts}</select>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">Хромакей:</span>
        <span id="pv2ChromaSw${i}" style="width:16px;height:16px;border-radius:3px;border:1px solid var(--border);display:inline-block;background:${state.outputChroma[i] === 'none' ? 'transparent' : state.outputChroma[i]}"></span>
        <input id="pv2Chroma${i}" type="text" placeholder="вимкнено" maxlength="7" value="${state.outputChroma[i] === 'none' ? '' : state.outputChroma[i]}"
               style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text);font-size:11px;font-family:monospace;outline:none"
               onkeydown="if(event.key==='Enter')pv2ApplyChromaInput(${i})">
        <button class="btn btn-primary btn-sm" onclick="pv2ApplyChromaInput(${i})">Застосувати</button>
        <button class="preset-btn" onclick="pv2SetChroma(${i},'#00ff00')">🟩 Зелений</button>
        <button class="preset-btn" onclick="pv2SetChroma(${i},'#0000ff')">🟦 Синій</button>
        <button class="preset-btn" onclick="pv2SetChroma(${i},'#ff00ff')">🟪 Мадж.</button>
        <button class="preset-btn" style="color:var(--red)" onclick="pv2SetChroma(${i},'none')">Вимкнути</button>
      </div>
      ${state.outputChroma[i] && state.outputChroma[i] !== 'none' ? `
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">Прозорість:</span>
        <span style="font-size:11px;color:var(--text2)" id="pv2OpacityLbl${i}">${(state.graphicsSettings && state.graphicsSettings.outputOpacity && state.graphicsSettings.outputOpacity[i]) || 62}%</span>
        <input type="range" min="0" max="100" value="${(state.graphicsSettings && state.graphicsSettings.outputOpacity && state.graphicsSettings.outputOpacity[i]) || 62}"
               oninput="document.getElementById('pv2OpacityLbl${i}').textContent=this.value+'%'"
               onchange="setOutputOpacity(${i}, this.value)" style="flex:1;min-width:120px">
      </div>` : ''}
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">🖥 Монітор:</span>
        <select id="pv2DisplaySel${i}" onchange="onOutputDisplayChange(${i})"
                style="flex:1;min-width:180px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:11px;outline:none">
          <option value="">Авто (перший вільний)</option>
          ${(typeof displaysList !== 'undefined' ? displaysList : []).map(d =>
            `<option value="${d.id}"${String((typeof outputConfig !== 'undefined' ? outputConfig : {})[OUT_KIND[i] + 'DisplayId']) === String(d.id) ? ' selected' : ''}>${d.isPrimary ? '💻 Основний' : '🖥 Монітор'} — ${d.width}×${d.height}</option>`).join('')}
        </select>
      </div>
      <div style="margin-top:6px">
        <button class="btn ${state.frozen[i] ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleFreezeOutput(${i})">❄️ ${state.frozen[i] ? 'Розморозити' : 'Заморозити'}</button>
      </div>
      <div style="display:flex;align-items:center;gap:4px;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">🔤 Розмір:</span>
        <button class="btn btn-ghost btn-sm" onclick="setOutputSongSize(${i}, -4)" title="Менший шрифт лише для цього виходу">A−</button>
        <span style="font-size:11px;font-weight:700;min-width:44px;text-align:center;color:${state.songSize[i] ? 'var(--accent)' : 'var(--text2)'}">${state.songSize[i] ? state.songSize[i] + 'px' : 'авто'}</span>
        <button class="btn btn-ghost btn-sm" onclick="setOutputSongSize(${i}, 4)" title="Більший шрифт лише для цього виходу">A+</button>
        ${state.songSize[i] ? `<button class="btn btn-ghost btn-sm" onclick="resetOutputSongSize(${i})" title="Повернути авто-підгін">↺</button>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">🏠 Профіль:</span>
        <select id="pv2RoomSel${i}" style="flex:1;min-width:140px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:11px;outline:none">
          <option value="">— обрати —</option>
          ${(state.roomProfiles || []).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="var v=document.getElementById('pv2RoomSel${i}').value; if(v) applyRoomProfile(${i}, v)">Застосувати</button>
        <button class="btn btn-ghost btn-sm" onclick="saveRoomProfile(${i})">💾 Зберегти поточний</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="var v=document.getElementById('pv2RoomSel${i}').value; if(v) deleteRoomProfile(v)">🗑</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <button class="btn ${state.stageOutputNum === i ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setStageOutputNum(${i})">
          🎤 ${state.stageOutputNum === i ? 'Це екран сцени — таймер тут' : 'Позначити екраном сцени'}
        </button>
        <span style="font-size:11px;color:var(--text2)">Таймер проповіді накладається поверх того, що вихід і так показує.</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:12px;color:var(--text2);min-width:56px">Фон (код):</span>
        <span id="pv2BgSwatchR${i}" style="width:16px;height:16px;border-radius:3px;border:1px solid var(--border);display:inline-block;background:#000"></span>
        <input id="pv2BgCode${i}" type="text" placeholder="#00ff00" maxlength="7"
               style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text);font-size:11px;font-family:monospace;outline:none"
               onkeydown="if(event.key==='Enter')pv2ApplyOutputBg(${i})">
        <button class="btn btn-primary btn-sm" onclick="pv2ApplyOutputBg(${i})">Застосувати</button>
        <button class="preset-btn" onclick="pv2SetBgCode(${i},'#000000')">Чорний</button>
        <button class="preset-btn" onclick="pv2SetBgCode(${i},'#00ff00')">Хромакей</button>
        <button class="preset-btn" onclick="pv2SetBgCode(${i},'#0000ff')">Синій</button>
        <button class="preset-btn" style="color:var(--red)" onclick="pv2SetBgCode(${i},'')">Скинути</button>
      </div>
    </div>`;
  }
  const targets = ['all', 1, 2, 3, 4].map(t => {
    const active = state.sendTarget === t;
    const label = t === 'all' ? 'Усі' : OUT_NAME[t];
    return `
<button id="pv2Target${t}" class="btn ${active ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setSendTarget(${t === 'all' ? "'all'" : t})">${label}</button>`;
  }).join(' ');

  return `<div class="card-title">🔀 Чотири виходи — різний контент на кожен екран</div>
    ${renderLooksCard()}
    <div class="card" style="margin-bottom:10px">
      <div class="card-title">🎬 Пресети сцени</div>
      <div class="card-sub">Один клік — і режим показу, хромакей та фон застосовуються одразу на всі 4 виходи. Зручно перемикатись між типами зібрань (напр. «Служба з графікою» ↔ «Репетиція»).</div>
      ${(state.scenePresets || []).length
        ? '<div style="margin-top:6px">' + state.scenePresets.map(p =>
            `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
              <span style="flex:1;font-size:13px">${esc(p.name)}</span>
              <button class="btn btn-primary btn-sm" onclick="applyScenePreset('${p.id}')">▶ Застосувати</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteScenePreset('${p.id}')">✕</button>
            </div>`).join('') + '</div>'
        : '<div style="font-size:11px;color:var(--text2);margin-top:6px">Збережених сцен ще немає — нижче зафіксуй поточне налаштування всіх 4 виходів як сцену.</div>'}
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:8px" onclick="saveScenePreset()">💾 Зберегти поточну сцену (усі 4 виходи)</button>
    </div>
    <div class="card" style="margin-bottom:10px;border-color:var(--accent)">
      <div class="card-title">🎯 Куди надсилати: <span id="pv2TargetBadge" style="color:var(--accent)">${state.sendTarget === 'all' ? 'усі екрани' : OUT_NAME[state.sendTarget]}</span></div>
      <div class="card-sub">Обери один екран — і кнопки «Надіслати» з вкладок Пісні / Біблія / Оголошення підуть <b>лише туди</b>. Інші екрани залишать те, що на них зараз. Повернись на «Усі», щоб знову вести всі разом.</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${targets}</div>
    </div>
    <div class="card-sub" style="margin-bottom:10px">Приклад: <b>Проектор</b> — дзеркало для залу, <b>Трансляція</b> — графіка з хромакеєм <code>#00ff00</code>, <b>Вихід 3</b> — наступний куплет для співаків, <b>Вихід 4</b> — таймер для проповідника.</div>
    ${rows}
    <div class="card" style="${state.sendTarget === 'all' ? '' : 'border-color:var(--red)'}">
      <div class="card-title">🔗 Синхронізація екранів</div>
      ${state.sendTarget === 'all'
        ? '<div style="font-size:12px;color:var(--green)">✓ Увімкнена — усе, що надсилаєш, іде на <b>всі відкриті екрани</b>, і гортання оновлює їх разом.</div>'
        : '<div style="font-size:12px;color:var(--red)"><b>⚠️ Вимкнена!</b> Зараз надсилання йде лише на <b>' + esc(OUT_NAME[state.sendTarget] || '') + '</b> — інші екрани не оновлюються.</div>'}
      <button class="btn ${state.sendTarget === 'all' ? 'btn-ghost' : 'btn-primary'} btn-sm btn-block" style="margin-top:6px"
              onclick="syncAllOutputs()">🔗 Синхронізувати всі екрани</button>
    </div>

    <div class="card"><div class="card-title">Швидкі дії</div>
      <button class="btn btn-primary btn-sm" onclick="pv2OpenOutput(1);pv2OpenOutput(2)">⚡ Відкрити проектор + трансляцію</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) setOutputRoute(i,'mirror')">Усі → дзеркало</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) setOutputRoute(i,'graphics')">Усі → графіка</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) pv2ClearOutput(i)">🚫 Очистити всі</button>
      <button class="btn btn-ghost btn-sm" onclick="pv2SyncOutputStates()">↻ Оновити статуси</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) pv2SetChroma(i,'#00ff00')">🟩 Хромакей на всі</button>
      <button class="btn btn-ghost btn-sm" onclick="for(let i=1;i<=4;i++) pv2SetChroma(i,'none')">Вимкнути хромакей скрізь</button>
    </div>`;
}

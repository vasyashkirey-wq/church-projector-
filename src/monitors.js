// ============================================================
// МОНІТОРИ / ДИСПЛЕЇ
// Винесено з index.html для кращої організації коду.
// ============================================================

var displaysList = [];
var outputConfig = { projectorDisplayId: null, streamDisplayId: null, streamChroma: 'none' };

function refreshDisplays() {
  if (!window.electronAPI) return;
  window.electronAPI.getDisplays().then(function(list) {
    displaysList = Array.isArray(list) ? list : [];   // захист від несподіваної відповіді
    renderMonitorLayout();
    populateDisplaySelects();
  });
}

function renderMonitorLayout() {
  var box = document.getElementById('monitorLayout');
  if (!box || !displaysList.length) {
    if (box) box.innerHTML = '<p class="text-muted" style="padding:20px;text-align:center">Монітори не знайдено</p>';
    return;
  }

  // Обчислюємо межі всієї композиції моніторів щоб масштабувати у вікно перегляду
  var minX = Math.min.apply(null, displaysList.map(function(d){ return d.x; }));
  var minY = Math.min.apply(null, displaysList.map(function(d){ return d.y; }));
  var maxX = Math.max.apply(null, displaysList.map(function(d){ return d.x + d.width; }));
  var maxY = Math.max.apply(null, displaysList.map(function(d){ return d.y + d.height; }));
  var totalW = maxX - minX;
  var totalH = maxY - minY;

  var boxW = box.clientWidth || 600;
  var boxH = 220;
  var scale = Math.min((boxW - 40) / totalW, (boxH - 40) / totalH);

  box.innerHTML = '';
  box.style.height = boxH + 'px';

  var oc = (typeof outputConfig !== 'undefined' && outputConfig) ? outputConfig : {};
  displaysList.forEach(function(d) {
    var w = d.width * scale;
    var h = d.height * scale;
    var x = (d.x - minX) * scale + 20;
    var y = (d.y - minY) * scale + 20;

    var div = document.createElement('div');
    var cls = 'monitor-box';
    if (d.id === oc.projectorDisplayId) cls += ' is-projector';
    if (d.id === oc.streamDisplayId) cls += ' is-stream';
    div.className = cls;
    div.style.cssText = 'left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px;';

    var roleLabel = '';
    if (d.id === oc.projectorDisplayId) roleLabel = '📺 Проектор';
    else if (d.id === oc.streamDisplayId) roleLabel = '🎥 Трансляція';
    else if (d.isPrimary) roleLabel = '💻 Основний (панель)';
    else roleLabel = 'Вільний';

    div.innerHTML = '<div class="m-label">' + roleLabel + '</div>' +
      '<div class="m-size">' + d.width + '×' + d.height + '</div>';
    box.appendChild(div);
  });
}

function populateDisplaySelects() {
  var projSel = document.getElementById('projectorDisplaySelect');
  var streamSel = document.getElementById('streamDisplaySelect');
  if (!projSel || !streamSel) return;

  [projSel, streamSel].forEach(function(sel) {
    while (sel.options.length > 1) sel.remove(1);
  });

  displaysList.forEach(function(d) {
    var label = (d.isPrimary ? '💻 Основний — ' : '🖥 Монітор — ') + d.width + '×' + d.height;
    var opt1 = document.createElement('option');
    opt1.value = d.id; opt1.textContent = label;
    projSel.appendChild(opt1);

    var opt2 = document.createElement('option');
    opt2.value = d.id; opt2.textContent = label;
    streamSel.appendChild(opt2);
  });

  projSel.value = outputConfig.projectorDisplayId || '';
  streamSel.value = outputConfig.streamDisplayId || '';
}

function onProjectorDisplayChange() {
  if (!window.electronAPI) return;
  var val = document.getElementById('projectorDisplaySelect').value;
  var id = val ? parseInt(val) : null;
  window.electronAPI.setOutputDisplay('projector', id).then(function(cfg) {
    if (cfg && cfg.error) { alert(cfg.message || 'Не можна вивести на цей монітор'); renderMonitorLayout(); return; }
    outputConfig = cfg;
    renderMonitorLayout();
  });
}

function onStreamDisplayChange() {
  if (!window.electronAPI) return;
  var val = document.getElementById('streamDisplaySelect').value;
  var id = val ? parseInt(val) : null;
  window.electronAPI.setOutputDisplay('stream', id).then(function(cfg) {
    if (cfg && cfg.error) { alert(cfg.message || 'Не можна вивести на цей монітор'); renderMonitorLayout(); return; }
    outputConfig = cfg;
    renderMonitorLayout();
  });
}


// Хромакей можна вмикати з ДВОХ місць: старі кружечки у «Монітори» (лише для
// трансляції) і нові поля у «Виходи» (на будь-який з 4 виходів). Обидва
// застосовують ефект коректно, але кожен веде СВІЙ облік стану в панелі —
// без синхронізації друга вкладка показувала б «вимкнено», хоча насправді
// увімкнено, і напівпрозорий фон графіки (для камери) не спрацював би.
function syncChromaEverywhere(kind, color) {
  var n = (kind === 'stream') ? 2 : (kind === 'projector') ? 1 : (kind === 'out3') ? 3 : (kind === 'out4') ? 4 : null;
  if (n && typeof state !== 'undefined' && state && state.outputChroma) {
    state.outputChroma[n] = color;
    if (typeof saveChroma === 'function') saveChroma();
    var input = document.getElementById('pv2Chroma' + n);
    var sw = document.getElementById('pv2ChromaSw' + n);
    if (input) input.value = color === 'none' ? '' : color;
    if (sw) sw.style.background = color === 'none' ? 'transparent' : color;
  }
  if (kind === 'stream') {
    outputConfig.streamChroma = color;
    document.querySelectorAll('.chroma-swatch').forEach(function(s) {
      s.classList.toggle('sel', s.getAttribute('data-color') === color);
    });
    var statusEl = document.getElementById('chromaStatus');
    if (statusEl) {
      statusEl.textContent = color === 'none' ? 'Хромакей вимкнено — фон чорний / тема'
        : (color === '#00ff00' ? '✓ Зелений хромакей увімкнено для трансляції'
        : (color === '#0000ff' ? '✓ Синій хромакей увімкнено для трансляції'
        : '✓ Хромакей увімкнено: ' + color));
    }
  }
}

function setStreamChroma(color) {
  if (!window.electronAPI) return;
  window.electronAPI.setStreamChroma(color).then(function(applied) {
    syncChromaEverywhere('stream', applied);
  });
}

safeInit(function() {
  if (window.electronAPI) {
    window.electronAPI.getOutputConfig().then(function(cfg) {
      outputConfig = cfg;
      document.querySelectorAll('.chroma-swatch').forEach(function(s) {
        s.classList.toggle('sel', s.getAttribute('data-color') === (cfg.streamChroma || 'none'));
      });
      // Підтягуємо справжні значення хромакею з головного процесу в облік «Виходів» —
      // інакше після старту програми стан там завжди був би «вимкнено» незалежно
      // від того, що реально стоїть на екранах.
      if (cfg.chroma && typeof state !== 'undefined' && state && state.outputChroma) {
        var map = { projector: 1, stream: 2, out3: 3, out4: 4 };
        Object.keys(map).forEach(function(kind) {
          if (cfg.chroma[kind]) state.outputChroma[map[kind]] = cfg.chroma[kind];
        });
      }
      populateDisplaySelects();
      renderMonitorLayout();
    });
    window.electronAPI.onDisplaysChanged(function(list) {
      displaysList = list;
      renderMonitorLayout();
      populateDisplaySelects();
    });
  }
}, 'getOutputConfig/onDisplaysChanged');

safeInit(refreshDisplays, 'refreshDisplays');

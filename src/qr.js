// ============================================================
// QR-КОД
// Винесено з index.html для кращої організації коду (розбиття
// на логічні файли за функціями: пісні, Біблія, QR тощо).
// ============================================================

var QR_KEY = 'church_qr_presets';
var qrImageSizePx = 500;   // розмір QR-картинки на проекторі, px
var qrTextSizePx = 28;     // розмір підпису під QR, px
var qrManualPhotoDataUrl = null;   // готове фото QR, завантажене вручну (замість генерації з тексту)
var qrPresets = [];
var QR_LOADED = false;
function loadQRLib(cb) {
  if (QR_LOADED) { cb(); return; }
  loadCachedScript('qrcode.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    function() { QR_LOADED = true; cb(); },
    '⚠️ QR-генератор ще не завантажено. Підключи інтернет один раз — далі працюватиме без мережі. Зараз скористайся режимом «📷 Моє фото QR».');
}

function setQRImageSizePx(v) {
  var n = parseInt(v, 10);
  if (!n || n < 50) n = qrImageSizePx;   // биту/порожню зміну ігноруємо
  qrImageSizePx = n;
  var el = document.getElementById('qrImageSizePx');
  if (el) el.value = n;
  generateQR();
}
function setQRTextSizePx(v) {
  var n = parseInt(v, 10);
  if (!n || n < 5) n = qrTextSizePx;
  qrTextSizePx = n;
  var el = document.getElementById('qrTextSizePx');
  if (el) el.value = n;
  var lbl = document.getElementById('qrPreviewLabel');
  if (lbl) lbl.style.fontSize = Math.max(10, Math.round(n * 0.4)) + 'px';   // прев'ю дрібніше за реальний вихід
}
function loadQRManualPhoto(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    qrManualPhotoDataUrl = e.target.result;
    var clearBtn = document.getElementById('qrPhotoClear');
    if (clearBtn) clearBtn.style.display = '';
    generateQR();
  };
  reader.onerror = function() { notify('❌ Не вдалось прочитати фото'); };
  reader.readAsDataURL(file);
}
function clearQRManualPhoto() {
  qrManualPhotoDataUrl = null;
  var input = document.getElementById('qrPhotoInput');
  if (input) input.value = '';
  var clearBtn = document.getElementById('qrPhotoClear');
  if (clearBtn) clearBtn.style.display = 'none';
  generateQR();
}


// ============================================================
// QR із логотипом. Рівень корекції H витримує ~30% перекриття,
// тож логотип до 22% ширини безпечний — код лишається читабельним.
// ============================================================
var qrLogo = null;          // dataURL логотипа
var qrLogoScale = 0.22;     // частка ширини QR
var qrLogoRound = true;     // кругла підкладка

function loadQRLogo(input) {
  var f = input.files[0];
  if (!f) return;
  var r = new FileReader();
  r.onload = function(e) {
    qrLogo = e.target.result;
    generateQR();
    var btn = document.getElementById('qrLogoClear');
    if (btn) btn.style.display = 'inline-block';
  };
  r.readAsDataURL(f);
  input.value = '';
}
function clearQRLogo() {
  qrLogo = null;
  generateQR();
  var btn = document.getElementById('qrLogoClear');
  if (btn) btn.style.display = 'none';
}
function setQRLogoScale(v) {
  qrLogoScale = Math.max(0.10, Math.min(0.28, v / 100));
  var lbl = document.getElementById('qrLogoScaleLabel');
  if (lbl) lbl.textContent = Math.round(qrLogoScale * 100) + '%';
  generateQR();
}

// Малює логотип у центрі QR на canvas і повертає Promise з готовим canvas
function drawQRLogo(canvas, cb) {
  if (!qrLogo) { cb(canvas); return; }
  var ctx = canvas.getContext('2d');
  var sz = canvas.width;
  var logoSz = Math.round(sz * qrLogoScale);
  var pad = Math.round(logoSz * 0.12);
  var x = Math.round((sz - logoSz) / 2);
  var y = Math.round((sz - logoSz) / 2);

  var img = new Image();
  img.onload = function() {
    ctx.save();
    // Біла підкладка — щоб логотип не зливався з модулями коду
    ctx.fillStyle = '#ffffff';
    if (qrLogoRound) {
      ctx.beginPath();
      ctx.arc(sz / 2, sz / 2, logoSz / 2 + pad, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sz / 2, sz / 2, logoSz / 2, 0, Math.PI * 2);
      ctx.clip();
    } else {
      ctx.fillRect(x - pad, y - pad, logoSz + pad * 2, logoSz + pad * 2);
    }
    ctx.drawImage(img, x, y, logoSz, logoSz);
    ctx.restore();
    cb(canvas);
  };
  img.onerror = function() { cb(canvas); };
  img.src = qrLogo;
}

// Єдиний генератор QR у canvas (використовується і прев'ю, і виводом)
function buildQRCanvas(text, sz, cb) {
  // Спершу пробуємо офлайн-генерацію (npm qrcode, у головному процесі) —
  // працює з першого запуску, без жодної залежності від інтернету/CDN.
  if (window.electronAPI && window.electronAPI.generateQRCode) {
    window.electronAPI.generateQRCode(text, sz).then(function(res) {
      if (res && res.ok && res.dataUrl) {
        var canvas = document.createElement('canvas');
        canvas.width = sz; canvas.height = sz;
        var ctx = canvas.getContext('2d');
        var img = new Image();
        img.onload = function() { ctx.drawImage(img, 0, 0, sz, sz); drawQRLogo(canvas, cb); };
        img.onerror = function() { _buildQRCanvasViaCDN(text, sz, cb); };   // на випадок биту dataUrl
        img.src = res.dataUrl;
      } else {
        _buildQRCanvasViaCDN(text, sz, cb);   // офлайн-шлях недоступний — старий CDN-фолбек
      }
    }).catch(function() { _buildQRCanvasViaCDN(text, sz, cb); });
    return;
  }
  _buildQRCanvasViaCDN(text, sz, cb);
}

// Старий спосіб (CDN-кешована qrcodejs) — лишається як резерв, якщо офлайн-шлях
// раптом недоступний (напр. дуже стара збірка preload.js без нового IPC-каналу).
function _buildQRCanvasViaCDN(text, sz, cb) {
  loadQRLib(function() {
    var tmp = document.createElement('div');
    tmp.style.display = 'none';
    document.body.appendChild(tmp);
    try {
      new QRCode(tmp, {
        text: text, width: sz, height: sz,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (e) {
      document.body.removeChild(tmp);
      cb(null);
      return;
    }
    setTimeout(function() {
      var src = tmp.querySelector('img') || tmp.querySelector('canvas');
      if (!src) { document.body.removeChild(tmp); cb(null); return; }

      var canvas = document.createElement('canvas');
      canvas.width = sz; canvas.height = sz;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sz, sz);

      function finish() {
        document.body.removeChild(tmp);
        drawQRLogo(canvas, cb);
      }
      if (src.tagName === 'CANVAS') { ctx.drawImage(src, 0, 0, sz, sz); finish(); }
      else {
        var i = new Image();
        i.onload = function() { ctx.drawImage(i, 0, 0, sz, sz); finish(); };
        i.onerror = finish;
        i.src = src.src;
      }
    }, 150);
  });
}

function generateQR() {
  var text = document.getElementById('qrInput').value.trim();
  var label = document.getElementById('qrLabel').value.trim();
  document.getElementById('qrPreviewLabel').textContent = label;
  var canvas = document.getElementById('qrPreviewCanvas');
  var sz = 220;   // прев'ю завжди компактне — реальний розмір застосовується лише при відправці
  canvas.width = sz; canvas.height = sz;
  var c2d = canvas.getContext('2d');
  c2d.clearRect(0, 0, sz, sz);

  if (qrManualPhotoDataUrl) {
    var img = new Image();
    img.onload = function() { c2d.drawImage(img, 0, 0, sz, sz); };
    img.src = qrManualPhotoDataUrl;
    return;
  }
  if (!text) return;

  buildQRCanvas(text, sz, function(built) {
    if (!built) return;
    c2d.drawImage(built, 0, 0, sz, sz);
  });
}

function sendQRToProjector() {
  var text = document.getElementById('qrInput').value.trim();
  var label = document.getElementById('qrLabel').value.trim();
  var sz = qrImageSizePx;

  if (qrManualPhotoDataUrl) {
    // Готове фото — виводимо AS-IS, лише масштабуємо canvas до потрібного розміру.
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = sz; canvas.height = sz;
      canvas.getContext('2d').drawImage(img, 0, 0, sz, sz);
      var html = getQRProjectorHTML(canvas.toDataURL('image/png'), label, sz, qrTextSizePx);
      sendHTMLToProjector(html, 'QR (фото): ' + (label || 'без підпису'));
    };
    img.onerror = function() { alert('Не вдалось прочитати збережене фото QR'); };
    img.src = qrManualPhotoDataUrl;
    return;
  }

  if (!text) { alert('Введіть URL або текст'); return; }
  buildQRCanvas(text, sz, function(built) {
    if (!built) { alert('Не вдалось згенерувати QR'); return; }
    var html = getQRProjectorHTML(built.toDataURL('image/png'), label, sz, qrTextSizePx);
    sendHTMLToProjector(html, 'QR: ' + text.substring(0, 40));
  });
}

function getQRProjectorHTML(imgSrc, label, sz, textSz) {
  var ts = textSz || 28;
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{margin:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;}' +
    'img{border:12px solid #fff;border-radius:8px;box-shadow:0 0 40px rgba(255,255,255,0.15);}' +
    'p{color:#fff;font-size:'+ts+'px;font-family:Georgia,serif;margin-top:24px;text-align:center;}' +
    '</style></head><body>' +
    '<img src="'+imgSrc+'" width="'+sz+'" height="'+sz+'">' +
    (label ? '<p>'+escHtml(label)+'</p>' : '') +
    '</body></html>';
}

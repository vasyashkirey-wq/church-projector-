// ============================================================
// СЛАЙД-БІЛДЕР + PDF-презентації — винесено з index.html у модуль.
// Завантажується ПІСЛЯ atem-ui.js; функції глобальні; містить свою
// ініціалізацію (loadCustomSlides/renderCustomSlides/renderSlideCanvas)
// та drag&drop для PDF.
// ============================================================
// ============================================================
// PDF PRESENTATION
// ============================================================
var pdfDoc = null;
var pdfPageNum = 1;
var pdfPageCount = 0;
var pdfRendering = false;
var PDFJS_LOADED = false;

function loadPDFJS(cb) {
  if (PDFJS_LOADED) { cb(); return; }
  loadCachedScript('pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    function() {
      // Воркер теж кешуємо — інакше без мережі PDF усе одно не відкриється
      var setWorker = function(src) {
        try { pdfjsLib.GlobalWorkerOptions.workerSrc = src; } catch (e) {}
        PDFJS_LOADED = true;
        cb();
      };
      if (window.electronAPI && window.electronAPI.readCachedAsset) {
        window.electronAPI.readCachedAsset('pdf.worker.min.js').then(function(code) {
          if (code) {
            var blob = new Blob([code], { type: 'application/javascript' });
            setWorker(URL.createObjectURL(blob));
          } else {
            setWorker('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
            fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js')
              .then(function(r){ return r.text(); })
              .then(function(t){ window.electronAPI.cacheAsset('pdf.worker.min.js', t); })
              .catch(function(){});
          }
        }).catch(function() {
          setWorker('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
        });
      } else {
        setWorker('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
      }
    },
    '⚠️ PDF ще не завантажено. Підключи інтернет один раз — далі працюватиме без мережі.');
}

function loadPDF(input) {
  var file = input.files[0];
  if (!file) return;
  var info = document.getElementById('pdfInfo');
  info.style.display = 'block';
  info.textContent = 'Завантаження PDF...';
  loadPDFJS(function() {
    var reader = new FileReader();
    reader.onload = function(e) {
      pdfjsLib.getDocument({data: e.target.result}).promise.then(function(pdf) {
        pdfDoc = pdf;
        pdfPageCount = pdf.numPages;
        pdfPageNum = 1;
        info.textContent = 'Завантажено: ' + file.name + ' (' + pdfPageCount + ' сторінок)';
        renderPDFThumbs();
        renderPDFPage(1, document.getElementById('pdfPreviewCanvas'));
      }).catch(function(err) {
        info.textContent = 'Помилка: ' + err.message;
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

function renderPDFPage(num, canvas, cb) {
  if (!pdfDoc) return;
  pdfDoc.getPage(num).then(function(page) {
    var vp = page.getViewport({scale: 1.5});
    canvas.width = vp.width;
    canvas.height = vp.height;
    page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise.then(function() {
      if (cb) cb();
    });
  });
}

function renderPDFThumbs() {
  var container = document.getElementById('pdfSlidesList');
  container.innerHTML = '';
  for (var i = 1; i <= pdfPageCount; i++) {
    (function(pageN) {
      var wrap = document.createElement('div');
      wrap.className = 'slide-thumb' + (pageN === pdfPageNum ? ' active' : '');
      wrap.id = 'pdfthumb-' + pageN;
      var canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;';
      var num = document.createElement('div');
      num.className = 'slide-num';
      num.textContent = pageN;
      wrap.appendChild(canvas);
      wrap.appendChild(num);
      wrap.onclick = function() { selectPDFPage(pageN); };
      container.appendChild(wrap);
      // render small thumb
      pdfDoc.getPage(pageN).then(function(page) {
        var vp = page.getViewport({scale: 0.3});
        canvas.width = vp.width;
        canvas.height = vp.height;
        page.render({canvasContext: canvas.getContext('2d'), viewport: vp});
      });
    })(i);
  }
  updateSlideCounter();
}

function selectPDFPage(num) {
  pdfPageNum = num;
  document.querySelectorAll('[id^="pdfthumb-"]').forEach(function(el) {
    el.className = 'slide-thumb' + (el.id === 'pdfthumb-' + num ? ' active' : '');
  });
  renderPDFPage(num, document.getElementById('pdfPreviewCanvas'));
  updateSlideCounter();
}

function prevSlide() {
  if (pdfPageNum <= 1) return;
  selectPDFPage(pdfPageNum - 1);
  // PDF зараз в ефірі (востаннє відправлена сторінка — саме PDF, а не
  // ручний слайд з "Редактора слайдів" — див. 'pdf' vs 'slide' нижче) —
  // гортання має одразу оновити те, що бачить зал, а не лише прев'ю.
  if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf') sendSlideToProjector();
}

function nextSlide() {
  if (pdfPageNum >= pdfPageCount) return;
  selectPDFPage(pdfPageNum + 1);
  if (typeof lastLiveSource !== 'undefined' && lastLiveSource === 'pdf') sendSlideToProjector();
}

function updateSlideCounter() {
  document.getElementById('slideCounter').textContent = pdfPageCount ? (pdfPageNum + ' / ' + pdfPageCount) : '—';
}

function sendSlideToProjector() {
  if (!pdfDoc) return;
  var offCanvas = document.createElement('canvas');
  renderPDFPage(pdfPageNum, offCanvas, function() {
    var dataUrl = offCanvas.toDataURL('image/jpeg', 0.9);
    sendImageToProjector(dataUrl, 'PDF стор. ' + pdfPageNum, 'pdf');
  });
}

// sourceTag розрізняє ДВІ різні речі, що йдуть через цю саму функцію:
// PDF-сторінку ('pdf', гортається nextSlide/prevSlide) і ручний слайд з
// "Редактора слайдів" ('slide' — за замовчуванням, у нього НЕМАЄ поняття
// "наступний"). Раніше обидва позначались однаково як 'slide', тож
// Пробіл/Стрілка під час показу РУЧНОГО слайда або нічого не робили
// (якщо PDF цього сеансу взагалі не відкривали), або — гірше — тихо
// підміняли слайд на СТАРУ сторінку раніше відкритого PDF.
function sendImageToProjector(dataUrl, label, sourceTag) {
  lastLiveSource = sourceTag || 'slide';
  lastLiveGraphics = false;
  lastLivePlain = false;
  lastLiveMulti = false;
  try { if (typeof state !== 'undefined' && state) state.multiLive = []; } catch (e) {}
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;}' +
    'img{max-width:100%;max-height:100vh;object-fit:contain;}' +
    '</style></head><body><img src="' + dataUrl + '"></body></html>';
  sendHTMLToProjector(html, label);
}

// ============================================================
// SLIDE BUILDER
// ============================================================
var SLIDES_KEY = 'church_custom_slides';
var slideTextColor = '#ffffff';
var slidePosition = 'center';   // верх / центр / низ — вертикальне розташування тексту
var slideImageData = null;
// Окремий стиль для заголовка й тексту + зсув блоку (проміжний «редактор»)
var slideHeadFont = 'Georgia', slideHeadSize = 52, slideHeadColor = '#ffffff';
var slideBodyFont = 'Georgia', slideBodySize = 36, slideBodyColor = '#ffffff';
var slideOffX = 0, slideOffY = 0;
function slideFontStack(f){ return ({ Georgia:'Georgia, serif', Arial:'Arial, sans-serif', Impact:'Impact, sans-serif', Verdana:'Verdana, sans-serif', Times:'"Times New Roman", serif', Courier:'"Courier New", monospace' })[f] || 'Georgia, serif'; }
var customSlides = [];

function loadCustomSlides() {
  try {
    var raw = bigStoreGet(SLIDES_KEY);
    if (raw) customSlides = JSON.parse(raw);
  } catch(e) { customSlides = []; }
}

function saveCustomSlidesDB() {
  safeSet(SLIDES_KEY, JSON.stringify(customSlides));
}

function setTextColor(el) {
  document.querySelectorAll('.color-swatch').forEach(function(s){ s.classList.remove('sel'); });
  el.classList.add('sel');
  slideTextColor = el.getAttribute('data-color');
  slideHeadColor = slideBodyColor = slideTextColor;   // швидкий колір = обидва блоки
  var hp = document.getElementById('slideHeadColor'), bp = document.getElementById('slideBodyColor');
  if (hp) hp.value = slideTextColor; if (bp) bp.value = slideTextColor;
  renderSlideCanvas();
}

function setSlidePos(v) {
  slidePosition = v;
  renderSlideCanvas();
}

function loadSlideImage(input) {
  var file = input.files[0];
  if (!file) return;
  loadImageAsDataURL(file, function(dataURL) {
    slideImageData = dataURL;
    renderSlideCanvas();
  });
}

function clearSlideImage() {
  slideImageData = null;
  document.getElementById('slideImageInput').value = '';
  renderSlideCanvas();
}

function renderSlideCanvas() {
  var canvas = document.getElementById('slideCanvas');
  var ctx = canvas.getContext('2d');
  var W = 960, H = 540;
  canvas.width = W; canvas.height = H;

  var bg = document.getElementById('slideBg').value;
  var heading = document.getElementById('slideHeading').value;
  var body = document.getElementById('slideBody').value;

  // Background
  if (slideImageData && bg === 'image') {
    var img = new Image();
    img.onload = function() {
      ctx.drawImage(img, 0, 0, W, H);
      // darken overlay
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      drawSlideText(ctx, W, H, heading, body);
    };
    img.src = slideImageData;
    return;
  } else {
    var grad;
    if (bg === 'blue') {
      grad = ctx.createLinearGradient(0,0,W,H);
      grad.addColorStop(0,'#0a1628'); grad.addColorStop(1,'#1e3a5f');
    } else if (bg === 'purple') {
      grad = ctx.createLinearGradient(0,0,W,H);
      grad.addColorStop(0,'#1a0a2e'); grad.addColorStop(1,'#3d1155');
    } else if (bg === 'red') {
      grad = ctx.createLinearGradient(0,0,W,H);
      grad.addColorStop(0,'#200a0a'); grad.addColorStop(1,'#4a1515');
    } else if (bg === 'green') {
      grad = ctx.createLinearGradient(0,0,W,H);
      grad.addColorStop(0,'#0a2010'); grad.addColorStop(1,'#1a4a25');
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0,0,W,H);
      drawSlideText(ctx, W, H, heading, body);
      return;
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);
  }
  drawSlideText(ctx, W, H, heading, body);
}

function drawSlideText(ctx, W, H, heading, body) {
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 12;

  var hasHeading = heading && heading.trim();
  var hasBody = body && body.trim();

  // Вертикальне розташування блоку тексту: верх / центр / низ + ручний зсув
  var yStart;
  if (slidePosition === 'top') {
    yStart = H * 0.16;
  } else if (slidePosition === 'bottom') {
    yStart = H * 0.60;
  } else { // center
    yStart = (hasHeading && hasBody) ? H * 0.35 : H / 2;
  }
  yStart += slideOffY;
  var cx = W / 2 + slideOffX;

  if (hasHeading) {
    ctx.fillStyle = slideHeadColor;
    ctx.font = 'bold ' + slideHeadSize + 'px ' + slideFontStack(slideHeadFont);
    ctx.shadowBlur = 12;
    wrapCanvasText(ctx, heading, cx, yStart, W - 120, slideHeadSize + 12);
    yStart += slideHeadSize + 28;
  }

  if (hasBody) {
    ctx.fillStyle = slideBodyColor;
    ctx.font = slideBodySize + 'px ' + slideFontStack(slideBodyFont);
    ctx.shadowBlur = 8;
    var lines = String(body).replace(/\r/g, '').split('\n');
    lines.forEach(function(line) {
      wrapCanvasText(ctx, line, cx, yStart, W - 140, slideBodySize + 10);
      yStart += slideBodySize + 14;
    });
  }

  if (!hasHeading && !hasBody) {
    ctx.font = '28px Georgia, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('Порожній слайд', W/2, H/2);
  }
  ctx.shadowBlur = 0;
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  var words = text.split(' ');
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var testLine = line + words[i] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[i] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, y);
}

function saveCustomSlide() {
  var heading = document.getElementById('slideHeading').value.trim();
  var body = document.getElementById('slideBody').value.trim();
  if (!heading && !body) { alert('Додайте заголовок або текст'); return; }
  var canvas = document.getElementById('slideCanvas');
  var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  var slide = {
    id: Date.now(),
    heading: heading,
    body: body,
    bg: document.getElementById('slideBg').value,
    color: slideTextColor,
    thumb: dataUrl
  };
  customSlides.push(slide);
  saveCustomSlidesDB();
  renderCustomSlides();
  showMsg('✓ Слайд збережено', 'var(--green)');
}

function sendCustomSlide() {
  var canvas = document.getElementById('slideCanvas');
  var dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  var heading = document.getElementById('slideHeading').value.trim();
  sendImageToProjector(dataUrl, heading || 'Слайд');
}

function sendSavedSlide(slide) {
  sendImageToProjector(slide.thumb, slide.heading || 'Слайд');
}

function deleteSavedSlide(id) {
  customSlides = customSlides.filter(function(s){ return s.id !== id; });
  saveCustomSlidesDB();
  renderCustomSlides();
}

function renderCustomSlides() {
  var container = document.getElementById('customSlidesList');
  container.innerHTML = '';
  if (!customSlides.length) {
    container.innerHTML = '<p class="text-muted">Немає збережених слайдів</p>';
    return;
  }
  customSlides.forEach(function(slide) {
    var wrap = document.createElement('div');
    wrap.className = 'slide-thumb';
    wrap.style.position = 'relative';
    var img = document.createElement('img');
    img.src = slide.thumb;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;';
    var num = document.createElement('div');
    num.className = 'slide-num';
    num.style.cssText = 'bottom:20px;right:4px;';
    num.innerHTML = '<span onclick="sendSavedSlide(customSlides.find(function(x){return x.id==='+slide.id+'}))">▶</span> ' +
      '<span onclick="deleteSavedSlide('+slide.id+')" style="color:#f56565">✕</span>';
    wrap.appendChild(img);
    wrap.appendChild(num);
    wrap.onclick = function(e) {
      if (e.target.tagName !== 'SPAN') sendSavedSlide(slide);
    };
    container.appendChild(wrap);
  });
}

// ============================================================
// INIT EXTENDED
// ============================================================
loadCustomSlides();
renderCustomSlides();
renderSlideCanvas();

// Drag & drop for PDF
// Захист: якщо розмітку #pdfDrop колись приберуть/перейменують, модуль не має
// падати на завантаженні (це обірвало б решту slide-ui.js). Тому — null-guard.
var drop = document.getElementById('pdfDrop');
if (drop) {
  drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.style.borderColor='var(--accent)'; });
  drop.addEventListener('dragleave', function(){ drop.style.borderColor=''; });
  drop.addEventListener('drop', function(e){
    e.preventDefault();
    drop.style.borderColor='';
    var file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      var dt = new DataTransfer();
      dt.items.add(file);
      var inp = document.getElementById('pdfInput');
      if (inp) { inp.files = dt.files; loadPDF(inp); }
    }
  });
}

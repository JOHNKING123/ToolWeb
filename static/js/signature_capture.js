/* 手写签名数字化仪（signature_capture）- 纯前端本地去底
 * 三路输入（摄像头拍摄 getUserMedia / 上传照片 File API / 手写签名板 canvas）
 * → 去底 pipeline：灰度 → Otsu 自动阈值（可手动微调）→ 亮色背景转透明
 * → 中值滤波去噪 → 连通边界框自动裁剪 → 透明 PNG 下载 / 复制，全程浏览器本地零上传。
 * 纯函数双模式导出：rgbToGray / otsuThreshold / computeAlpha / detectBBox / cropToBBox。
 * 失败约定：非法参数抛 Error，err.field 为 "image" / "hist" / "threshold" / "bbox" / "padding"，不静默钳制。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */

  /* 带字段名的失败。 */
  function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    throw e;
  }

  function isPosInt(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v > 0;
  }

  function isByte(v) {
    return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 255;
  }

  /* 图像对象校验：{data, width, height}，data 为 RGBA 字节数组（类数组），长度须为 width*height*4。 */
  function assertImage(img, what) {
    what = what || 'image';
    if (img == null || typeof img !== 'object' || Array.isArray(img)) {
      fail(what, '图像必须是对象（含 data / width / height）');
    }
    if (!isPosInt(img.width) || !isPosInt(img.height)) {
      fail(what, 'width / height 必须为正整数');
    }
    var d = img.data;
    if (d == null || typeof d.length !== 'number') {
      fail(what, 'data 必须是像素数组（类数组）');
    }
    if (d.length !== img.width * img.height * 4) {
      fail(what, 'data 长度须为 width*height*4（实得 ' + d.length + '，期望 ' + (img.width * img.height * 4) + '）');
    }
  }

  function assertThreshold(threshold) {
    if (typeof threshold !== 'number' || !isFinite(threshold) ||
        Math.floor(threshold) !== threshold || threshold < 0 || threshold > 255) {
      fail('threshold', '阈值必须是 0-255 的整数');
    }
  }

  /* ---------- 纯函数 ---------- */

  /* RGBA → 灰度（luminosity，四舍五入取整）。返回每像素 1 字节的灰度数组，不修改输入。 */
  function rgbToGray(image) {
    assertImage(image, 'image');
    var d = image.data, n = image.width * image.height;
    var out = new Array(n), i, o, r, g, b, a;
    for (i = 0; i < n; i++) {
      o = i * 4;
      r = d[o]; g = d[o + 1]; b = d[o + 2]; a = d[o + 3];
      if (!isByte(r) || !isByte(g) || !isByte(b) || !isByte(a)) {
        fail('image', '像素通道值须为 0-255 的有限数（像素 ' + i + ' 非法）');
      }
      out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return out;
  }

  /* Otsu 自动阈值：hist 为 256 bin 灰度直方图（非负有限数），返回 0-255 整数阈值。
   * 取类间方差最大者；并列取首个（最小阈值），确定性。 */
  function otsuThreshold(hist) {
    if (hist == null || typeof hist.length !== 'number' || hist.length !== 256) {
      fail('hist', '直方图必须是 256 个灰度 bin 的数组（类数组）');
    }
    var total = 0, i, v;
    for (i = 0; i < 256; i++) {
      v = hist[i];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        fail('hist', '直方图 bin 必须为非负有限数（bin ' + i + ' 非法）');
      }
      total += v;
    }
    if (total === 0) {
      fail('hist', '直方图总像素数为 0，无法计算阈值');
    }
    var sum = 0;
    for (i = 0; i < 256; i++) { sum += i * hist[i]; }
    var w0 = 0, sum0 = 0, best = -1, thr = 0;
    for (i = 0; i < 256; i++) {
      w0 += hist[i];
      if (w0 === 0) { continue; }
      var w1 = total - w0;
      if (w1 === 0) { break; }
      sum0 += i * hist[i];
      var mu0 = sum0 / w0, mu1 = (sum - sum0) / w1, d = mu0 - mu1;
      var between = w0 * w1 * d * d;
      if (between > best) { best = between; thr = i; }
    }
    return thr;
  }

  /* 内部：给定灰度数组做亮色背景转透明（computeAlpha 的去噪复用版）。 */
  function computeAlphaFromGray(data, gray, w, h, threshold) {
    assertThreshold(threshold);
    var n = w * h, out = new Array(n * 4), i, o;
    for (i = 0; i < n; i++) {
      o = i * 4;
      out[o] = data[o]; out[o + 1] = data[o + 1]; out[o + 2] = data[o + 2];
      out[o + 3] = gray[i] <= threshold ? 255 : 0;
    }
    return { data: out, width: w, height: h };
  }

  /* 亮色背景转透明：灰度 > threshold 的像素 alpha=0，其余保留 RGB 且 alpha=255。
   * 返回新图像对象 {data, width, height}，不修改输入。 */
  function computeAlpha(image, threshold) {
    assertImage(image, 'image');
    assertThreshold(threshold);
    var w = image.width, h = image.height;
    return computeAlphaFromGray(image.data, rgbToGray(image), w, h, threshold);
  }

  /* 连通边界框：扫描 alpha > 0 的像素，返回 {x, y, w, h}；无不透明像素返回 null。 */
  function detectBBox(image) {
    assertImage(image, 'image');
    var d = image.data, w = image.width, h = image.height;
    var minX = w, minY = h, maxX = -1, maxY = -1, x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = (y * w + x) * 4;
        if (d[i + 3] > 0) {
          if (x < minX) { minX = x; }
          if (x > maxX) { maxX = x; }
          if (y < minY) { minY = y; }
          if (y > maxY) { maxY = y; }
        }
      }
    }
    if (maxX < 0) { return null; }
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  /* 按边界框裁剪：padding 向外扩展（钳制到图像边界），返回新图像对象 {data, width, height}。 */
  function cropToBBox(image, bbox, padding) {
    assertImage(image, 'image');
    if (bbox == null || typeof bbox !== 'object' || Array.isArray(bbox)) {
      fail('bbox', 'bbox 必须是对象（含 x / y / w / h）；detectBBox 无内容时返回 null，请先判空');
    }
    var bx = bbox.x, by = bbox.y, bw = bbox.w, bh = bbox.h;
    var okXY = function (v) {
      return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0;
    };
    if (!okXY(bx) || !okXY(by) || !isPosInt(bw) || !isPosInt(bh) ||
        bx + bw > image.width || by + bh > image.height) {
      fail('bbox', 'bbox 非法：x/y 须为非负整数，w/h 须为正整数，且不得超出图像边界');
    }
    if (typeof padding !== 'number' || !isFinite(padding) ||
        Math.floor(padding) !== padding || padding < 0) {
      fail('padding', 'padding 必须为非负整数');
    }
    var x0 = Math.max(0, bx - padding), y0 = Math.max(0, by - padding);
    var x1 = Math.min(image.width, bx + bw + padding);
    var y1 = Math.min(image.height, by + bh + padding);
    var cw = x1 - x0, ch = y1 - y0, src = image.data;
    var out = new Array(cw * ch * 4), x, y, si, di;
    for (y = 0; y < ch; y++) {
      for (x = 0; x < cw; x++) {
        si = ((y0 + y) * image.width + (x0 + x)) * 4;
        di = (y * cw + x) * 4;
        out[di] = src[si]; out[di + 1] = src[si + 1];
        out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
      }
    }
    return { data: out, width: cw, height: ch };
  }

  /* ---------- 内部：浏览器 pipeline 复用 ---------- */

  /* 灰度数组 → 256 bin 直方图。 */
  function buildHistogram(gray) {
    var hist = new Array(256), i;
    for (i = 0; i < 256; i++) { hist[i] = 0; }
    for (i = 0; i < gray.length; i++) { hist[gray[i]]++; }
    return hist;
  }

  /* 3x3 中值滤波（灰度去噪），边缘钳制采样，确定性。 */
  function medianGray3x3(gray, w, h) {
    var out = new Array(w * h), x, y, dx, dy, k, win = new Array(9);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        k = 0;
        for (dy = -1; dy <= 1; dy++) {
          var yy = y + dy;
          if (yy < 0) { yy = 0; }
          if (yy >= h) { yy = h - 1; }
          for (dx = -1; dx <= 1; dx++) {
            var xx = x + dx;
            if (xx < 0) { xx = 0; }
            if (xx >= w) { xx = w - 1; }
            win[k++] = gray[yy * w + xx];
          }
        }
        for (var a = 1; a < 9; a++) {
          var t = win[a], b = a - 1;
          while (b >= 0 && win[b] > t) { win[b + 1] = win[b]; b--; }
          win[b + 1] = t;
        }
        out[y * w + x] = win[4];
      }
    }
    return out;
  }

  /* alpha 掩膜 3x3 膨胀（加粗笔画）：新覆盖像素取其邻域不透明像素的 RGB，确定性。 */
  function dilateAlpha(img) {
    var w = img.width, h = img.height, src = img.data;
    var out = new Array(src.length), x, y, dx, dy;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var hit = -1;
        for (dy = -1; dy <= 1 && hit < 0; dy++) {
          var yy = y + dy;
          if (yy < 0 || yy >= h) { continue; }
          for (dx = -1; dx <= 1; dx++) {
            var xx = x + dx;
            if (xx < 0 || xx >= w) { continue; }
            var si = (yy * w + xx) * 4;
            if (src[si + 3] > 0) { hit = si; break; }
          }
        }
        var i = (y * w + x) * 4;
        if (hit >= 0) {
          out[i] = src[hit]; out[i + 1] = src[hit + 1];
          out[i + 2] = src[hit + 2]; out[i + 3] = 255;
        } else {
          out[i] = src[i]; out[i + 1] = src[i + 1];
          out[i + 2] = src[i + 2]; out[i + 3] = 0;
        }
      }
    }
    return { data: out, width: w, height: h };
  }

  /* ---------- 导出：node 下导出纯函数并提前返回，浏览器里继续走 DOM ---------- */

  var API = {
    rgbToGray: rgbToGray,
    otsuThreshold: otsuThreshold,
    computeAlpha: computeAlpha,
    detectBBox: detectBBox,
    cropToBBox: cropToBBox
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }
  if (typeof window !== 'undefined') {
    window.SignatureCapture = API;
  }

  /* ---------------- 浏览器 DOM 逻辑（零网络） ---------------- */

  function $(id) { return document.getElementById(id); }

  var padEl = $('sig-pad');
  if (!padEl) {
    return; /* 非本工具页 */
  }

  var srcCanvas = $('sig-src');
  var origCanvas = $('sig-orig');
  var resultCanvas = $('sig-result');
  var hasSource = false;
  var lastThr = null;
  var stream = null;

  /* ---------- 提示 ---------- */
  function toast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 2000);
  }

  /* ---------- 页签 ---------- */
  var TAB_IDS = ['cam', 'upload', 'pad'];
  function selectTab(name) {
    TAB_IDS.forEach(function (t) {
      var btn = $('sig-tab-' + t), panel = $('sig-panel-' + t);
      var on = t === name;
      if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-selected', on ? 'true' : 'false'); }
      if (panel) { panel.style.display = on ? 'block' : 'none'; }
    });
    if (name !== 'cam') { stopCam(); }
  }
  TAB_IDS.forEach(function (t) {
    $('sig-tab-' + t).addEventListener('click', function () { selectTab(t); });
  });

  /* ---------- 摄像头 ---------- */
  function camSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  function camErrorText(err) {
    var n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') {
      return '摄像头权限被拒绝：请点击地址栏左侧的锁形图标，把「摄像头」设为「允许」后重试。';
    }
    if (n === 'NotFoundError' || n === 'OverconstrainedError') {
      return '未检测到可用摄像头：请确认设备已连接摄像头，或改用「上传照片」「手写签名板」。';
    }
    if (n === 'NotReadableError' || n === 'AbortError') {
      return '摄像头正被其他应用占用：请关闭占用摄像头的程序后重试。';
    }
    return '摄像头启动失败（' + (n || '未知错误') + '）：可改用「上传照片」或「手写签名板」。';
  }
  function refreshCamUI() {
    var ok = camSupported();
    var openBtn = $('sig-cam-open');
    openBtn.disabled = !ok;
    $('sig-cam-degrade').style.display = ok ? 'none' : 'block';
    if (!ok) {
      openBtn.title = '当前环境不支持摄像头拍摄';
    }
  }
  function stopCam() {
    if (stream) {
      stream.getTracks().forEach(function (tr) { tr.stop(); });
      stream = null;
    }
    var v = $('sig-video');
    if (v) { v.srcObject = null; }
    $('sig-cam-live').style.display = 'none';
    $('sig-cam-open').style.display = '';
  }
  $('sig-cam-open').addEventListener('click', function () {
    if (!camSupported()) { return; }
    if (window.isSecureContext === false) {
      $('sig-cam-error').textContent = '当前为非安全上下文：摄像头 API 需要 HTTPS（http://localhost 调试可例外），请改用 HTTPS 访问或使用「上传照片」。';
      $('sig-cam-error').style.display = 'block';
      return;
    }
    $('sig-cam-error').style.display = 'none';
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(function (s) {
      stream = s;
      var v = $('sig-video');
      v.srcObject = s;
      v.play();
      $('sig-cam-live').style.display = 'block';
      $('sig-cam-open').style.display = 'none';
    }, function (err) {
      $('sig-cam-error').textContent = camErrorText(err);
      $('sig-cam-error').style.display = 'block';
    });
  });
  $('sig-cam-close').addEventListener('click', stopCam);
  $('sig-cam-shot').addEventListener('click', function () {
    var v = $('sig-video');
    if (!v.videoWidth) { toast('摄像头画面尚未就绪，请稍候'); return; }
    srcCanvas.width = v.videoWidth;
    srcCanvas.height = v.videoHeight;
    srcCanvas.getContext('2d').drawImage(v, 0, 0);
    stopCam();
    hasSource = true;
    selectTab('cam');
    runPipeline();
    toast('已拍摄，去底完成');
  });
  refreshCamUI();

  /* ---------- 上传 ---------- */
  function loadImageFile(file) {
    if (!file) { return; }
    if (file.type.indexOf('image/') !== 0) {
      toast('请选择图片文件（PNG / JPG 等）');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast('图片超过 20MB，请换一张小图');
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var scale = Math.min(1, 2400 / Math.max(img.width, img.height));
      srcCanvas.width = Math.max(1, Math.round(img.width * scale));
      srcCanvas.height = Math.max(1, Math.round(img.height * scale));
      srcCanvas.getContext('2d').drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);
      hasSource = true;
      runPipeline();
      toast('已载入图片，去底完成');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast('图片读取失败，请换一张图片');
    };
    img.src = url;
  }
  $('sig-file').addEventListener('change', function (e) {
    loadImageFile(e.target.files && e.target.files[0]);
    e.target.value = '';
  });
  var drop = $('sig-drop');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('drag');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    loadImageFile(f);
  });
  drop.addEventListener('click', function () { $('sig-file').click(); });

  /* ---------- 手写签名板 ---------- */
  var padCtx = padEl.getContext('2d');
  function padReset() {
    padCtx.fillStyle = '#ffffff';
    padCtx.fillRect(0, 0, padEl.width, padEl.height);
  }
  padReset();
  var drawing = false, lastX = 0, lastY = 0;
  function padPos(e) {
    var r = padEl.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * padEl.width / r.width,
      y: (e.clientY - r.top) * padEl.height / r.height
    };
  }
  padEl.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    drawing = true;
    try { padEl.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    var p = padPos(e);
    lastX = p.x; lastY = p.y;
    padCtx.fillStyle = '#111827';
    padCtx.beginPath();
    padCtx.arc(p.x, p.y, penWidth() / 2, 0, Math.PI * 2);
    padCtx.fill();
  });
  padEl.addEventListener('pointermove', function (e) {
    if (!drawing) { return; }
    var p = padPos(e);
    padCtx.strokeStyle = '#111827';
    padCtx.lineWidth = penWidth();
    padCtx.lineCap = 'round';
    padCtx.lineJoin = 'round';
    padCtx.beginPath();
    padCtx.moveTo(lastX, lastY);
    padCtx.lineTo(p.x, p.y);
    padCtx.stroke();
    lastX = p.x; lastY = p.y;
  });
  function endStroke() { drawing = false; }
  padEl.addEventListener('pointerup', endStroke);
  padEl.addEventListener('pointercancel', endStroke);
  function penWidth() {
    return parseInt($('sig-pen-width').value, 10) || 5;
  }
  $('sig-pen-width').addEventListener('input', function () {
    $('sig-pen-width-val').textContent = $('sig-pen-width').value + 'px';
  });
  $('sig-pad-clear').addEventListener('click', padReset);
  $('sig-pad-use').addEventListener('click', function () {
    srcCanvas.width = padEl.width;
    srcCanvas.height = padEl.height;
    srcCanvas.getContext('2d').drawImage(padEl, 0, 0);
    hasSource = true;
    runPipeline();
    toast('已采用手写签名，去底完成');
  });

  /* ---------- 参数 ---------- */
  function currentOpts() {
    return {
      auto: $('sig-thr-mode-auto').checked,
      threshold: parseInt($('sig-thr').value, 10) || 0,
      padding: parseInt($('sig-padsize').value, 10) || 0,
      denoise: $('sig-denoise').checked,
      bold: $('sig-bold').checked,
      scale: $('sig-scale').value,
      bg: $('sig-bg').value
    };
  }
  $('sig-thr').addEventListener('input', function () {
    $('sig-thr-val').textContent = $('sig-thr').value;
    $('sig-thr-mode-manual').checked = true;
    if (hasSource) { runPipeline(); }
  });
  $('sig-padsize').addEventListener('input', function () {
    $('sig-padsize-val').textContent = $('sig-padsize').value + 'px';
    if (hasSource) { runPipeline(); }
  });
  ['sig-thr-mode-auto', 'sig-thr-mode-manual', 'sig-denoise', 'sig-bold', 'sig-scale', 'sig-bg'].forEach(function (id) {
    $(id).addEventListener('change', function () { if (hasSource) { runPipeline(); } });
  });
  $('sig-process').addEventListener('click', runPipeline);

  /* ---------- 去底 pipeline ---------- */
  function putImageDataTo(canvas, img) {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var id = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    c.getContext('2d').putImageData(id, 0, 0);
    return c;
  }
  function runPipeline() {
    if (!hasSource) { toast('请先拍摄 / 上传 / 绘制签名'); return; }
    var w = srcCanvas.width, h = srcCanvas.height;
    var sctx = srcCanvas.getContext('2d');
    var raw;
    try {
      raw = sctx.getImageData(0, 0, w, h);
    } catch (e) {
      toast('画布读取失败，请重试');
      return;
    }
    var gray = rgbToGray({ data: raw.data, width: w, height: h });
    var opts = currentOpts();
    if (opts.denoise) { gray = medianGray3x3(gray, w, h); }
    var thr = opts.auto ? otsuThreshold(buildHistogram(gray)) : opts.threshold;
    lastThr = thr;
    var alphaImg = computeAlphaFromGray(raw.data, gray, w, h, thr);
    if (opts.bold) { alphaImg = dilateAlpha(alphaImg); }
    var bbox = detectBBox(alphaImg);
    if (!bbox) {
      $('sig-empty').style.display = 'block';
      $('sig-result-wrap').style.display = 'none';
      drawOrig();
      $('sig-thr-readout').textContent = '本次阈值：' + thr + '（未检测到签名笔迹，请调低阈值或换深色笔重拍）';
      return;
    }
    $('sig-empty').style.display = 'none';
    $('sig-result-wrap').style.display = 'block';
    var cropped = cropToBBox(alphaImg, bbox, opts.padding);
    var factor = 1;
    if (opts.scale === '0.75') { factor = 0.75; }
    else if (opts.scale === '0.5') { factor = 0.5; }
    else if (opts.scale === '0.25') { factor = 0.25; }
    var outW = Math.max(1, Math.round(cropped.width * factor));
    var outH = Math.max(1, Math.round(cropped.height * factor));
    var tmp = putImageDataTo(resultCanvas, cropped);
    resultCanvas.width = outW;
    resultCanvas.height = outH;
    var octx = resultCanvas.getContext('2d');
    if (opts.bg === 'white') {
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, outW, outH);
    }
    octx.drawImage(tmp, 0, 0, outW, outH);
    drawOrig();
    $('sig-thr-readout').textContent = '本次阈值：' + thr + '（' + (opts.auto ? 'Otsu 自动' : '手动') + '）｜检出区域 ' +
      bbox.w + '×' + bbox.h + 'px，输出 ' + outW + '×' + outH + 'px';
    $('sig-download').disabled = false;
    $('sig-copy').disabled = false;
  }
  function drawOrig() {
    origCanvas.width = srcCanvas.width;
    origCanvas.height = srcCanvas.height;
    origCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
  }

  /* ---------- 导出 ---------- */
  $('sig-download').addEventListener('click', function () {
    if (!hasSource) { toast('请先拍摄 / 上传 / 绘制签名'); return; }
    resultCanvas.toBlob(function (blob) {
      if (!blob) { toast('PNG 生成失败，请重试'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'signature.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      toast('签名 PNG 已开始下载');
    }, 'image/png');
  });
  $('sig-copy').addEventListener('click', function () {
    if (!hasSource) { toast('请先拍摄 / 上传 / 绘制签名'); return; }
    if (!navigator.clipboard || !window.ClipboardItem) {
      toast('当前浏览器不支持直接复制 PNG，请使用「下载 PNG」');
      return;
    }
    resultCanvas.toBlob(function (blob) {
      if (!blob) { toast('PNG 生成失败，请重试'); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
        toast('签名 PNG 已复制到剪贴板');
      }, function () {
        toast('复制失败：请确认已授予剪贴板权限，或改用「下载 PNG」');
      });
    }, 'image/png');
  });

  selectTab('upload');
})();

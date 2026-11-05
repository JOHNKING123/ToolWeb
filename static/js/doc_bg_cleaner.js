/* 文档扫描去底纹（doc_bg_cleaner）- 纯前端手机拍文档增白
 * 输入：JPG/PNG/WebP（FileReader 本地，零上传；类型/大小双重校验，20MB 上限）
 * pipeline：灰度 → Otsu 自动阈值（可手动滑杆微调）→ 背景漂白（强度滑杆）
 * → 中值滤波去噪 → 处理前后对比预览（拖动滑杆）＋墨覆盖率对比（打印费墨参考）
 * → PNG 一键导出（文件名回退 doc-cleaned）／pdf-lib 本地 vendor 组装 PDF。
 * 纯函数双模式导出：rgbToGray / buildGrayHistogram / otsuThreshold / whitenPixel /
 * applyWhitening / estimateInkCoverage / sanitizeFileName，挂 window.DocBgCleaner。
 * 失败约定：非法参数抛 Error，err.field 定位字段名（'r'/'g'/'b'/'grayData'/'hist'/
 * 'threshold'/'strength'/'options'/'width'/'height'），不静默钳制。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何网络请求（PDF 组装走模板内本地 vendor 的 pdf-lib.min.js）。 */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */

  /* 带字段名的失败。 */
  function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    throw e;
  }

  function isFiniteNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function isByte(v) {
    return isFiniteNum(v) && v >= 0 && v <= 255;
  }

  function isPosInt(v) {
    return isFiniteNum(v) && Math.floor(v) === v && v > 0;
  }

  function assertThreshold(threshold) {
    if (!isFiniteNum(threshold) || Math.floor(threshold) !== threshold ||
        threshold < 0 || threshold > 255) {
      fail('threshold', '阈值必须是 0-255 的整数');
    }
  }

  function assertStrength(strength) {
    if (!isFiniteNum(strength) || strength < 0 || strength > 1) {
      fail('strength', '漂白强度必须是 0-1 之间的有限数');
    }
  }

  /* ---------- 纯函数 ---------- */

  /* 单像素 RGB → 灰度（luminosity，四舍五入取整 0-255）。 */
  function rgbToGray(r, g, b) {
    if (!isByte(r)) { fail('r', 'r 必须是 0-255 的有限数'); }
    if (!isByte(g)) { fail('g', 'g 必须是 0-255 的有限数'); }
    if (!isByte(b)) { fail('b', 'b 必须是 0-255 的有限数'); }
    return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  /* RGBA 字节数组 → 每像素 1 字节的灰度数组（不修改输入）。 */
  function rgbaToGray(rgba) {
    if (rgba == null || typeof rgba.length !== 'number') {
      fail('grayData', '灰度源数据必须是像素数组（类数组）');
    }
    if (rgba.length % 4 !== 0) {
      fail('grayData', 'RGBA 数据长度必须是 4 的倍数');
    }
    var n = rgba.length / 4;
    var out = new Array(n), i, o;
    for (i = 0; i < n; i++) {
      o = i * 4;
      out[i] = rgbToGray(rgba[o], rgba[o + 1], rgba[o + 2]);
    }
    return out;
  }

  /* 灰度数组 → 256 桶直方图（number[256]，非整数灰度四舍五入入桶）。 */
  function buildGrayHistogram(grayData) {
    if (grayData == null || typeof grayData.length !== 'number' || grayData.length === 0) {
      fail('grayData', '灰度数据必须是非空数组（类数组）');
    }
    var hist = new Array(256), i, v, bin;
    for (i = 0; i < 256; i++) { hist[i] = 0; }
    for (i = 0; i < grayData.length; i++) {
      v = grayData[i];
      if (!isByte(v)) {
        fail('grayData', '灰度值必须为 0-255 的有限数（下标 ' + i + ' 非法）');
      }
      bin = Math.round(v);
      if (bin < 0) { bin = 0; } else if (bin > 255) { bin = 255; }
      hist[bin]++;
    }
    return hist;
  }

  /* Otsu 自动阈值：256 桶直方图 → 0-255 整数阈值。
   * 类间方差最大者；并列取首个（最小阈值），确定性（与 signature_capture 管线一致）。 */
  function otsuThreshold(hist) {
    if (hist == null || typeof hist.length !== 'number' || hist.length !== 256) {
      fail('hist', '直方图必须是 256 个灰度 bin 的数组（类数组）');
    }
    var total = 0, i, v;
    for (i = 0; i < 256; i++) {
      v = hist[i];
      if (!isFiniteNum(v) || v < 0) {
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

  /* 单像素漂白：灰度 > threshold 视为背景，向白映射；≤ threshold 视为文字，保持。
   * strength=0 不漂白，strength=1 背景全白。 */
  function whitenPixel(gray, threshold, strength) {
    if (!isByte(gray)) { fail('gray', '灰度必须是 0-255 的有限数'); }
    assertThreshold(threshold);
    assertStrength(strength);
    var g = Math.round(gray);
    if (g <= threshold) { return g; }
    return Math.round(g + (255 - g) * strength);
  }

  /* 3x3 中值滤波去噪（边界取邻域内可用像素），返回新数组，不修改输入。 */
  function medianFilter3x3(gray, width, height) {
    var out = new Array(width * height), x, y, nx, ny, i;
    var win = new Array(9);
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        var c = 0;
        for (ny = y - 1; ny <= y + 1; ny++) {
          if (ny < 0 || ny >= height) { continue; }
          for (nx = x - 1; nx <= x + 1; nx++) {
            if (nx < 0 || nx >= width) { continue; }
            win[c++] = gray[ny * width + nx];
          }
        }
        /* 插入排序取中值（c ≤ 9）。 */
        for (i = 1; i < c; i++) {
          var t = win[i], j = i - 1;
          while (j >= 0 && win[j] > t) { win[j + 1] = win[j]; j--; }
          win[j + 1] = t;
        }
        out[y * width + x] = win[(c - 1) >> 1];
      }
    }
    return out;
  }

  /* 校验灰度数组尺寸。 */
  function assertGraySized(grayData, width, height) {
    if (!isPosInt(width)) { fail('width', 'width 必须为正整数'); }
    if (!isPosInt(height)) { fail('height', 'height 必须为正整数'); }
    if (grayData == null || typeof grayData.length !== 'number') {
      fail('grayData', '灰度数据必须是非空数组（类数组）');
    }
    if (grayData.length !== width * height) {
      fail('grayData', '灰度数组长度须为 width*height（实得 ' + grayData.length +
        '，期望 ' + (width * height) + '）');
    }
    var i, v;
    for (i = 0; i < grayData.length; i++) {
      v = grayData[i];
      if (!isByte(v)) {
        fail('grayData', '灰度值必须为 0-255 的有限数（下标 ' + i + ' 非法）');
      }
    }
  }

  /* 选项校验：options = {threshold: 'auto' | 0-255整数, strength: 0-1}。
   * 内容非法统一报 field='options'（契约规定），不透传 threshold/strength 字段名。 */
  function assertOptions(options) {
    if (options == null || typeof options !== 'object' || Array.isArray(options)) {
      fail('options', 'options 必须是对象（{threshold, strength}）');
    }
    var t = options.threshold;
    var okT = (t === 'auto') ||
      (isFiniteNum(t) && Math.floor(t) === t && t >= 0 && t <= 255);
    if (!okT) {
      fail('options', 'options.threshold 必须是 \'auto\' 或 0-255 的整数');
    }
    var s = options.strength;
    if (!isFiniteNum(s) || s < 0 || s > 1) {
      fail('options', 'options.strength 必须是 0-1 之间的有限数');
    }
  }

  /* 整图漂白：grayData(每像素1字节) → whitenPixel 逐像素 → 中值滤波去噪。
   * options.threshold='auto' 时用 Otsu 自动阈值。返回 Uint8ClampedArray。 */
  function applyWhitening(grayData, width, height, options) {
    assertGraySized(grayData, width, height);
    assertOptions(options);
    var threshold = options.threshold === 'auto'
      ? otsuThreshold(buildGrayHistogram(grayData))
      : options.threshold;
    var strength = options.strength;
    var n = width * height, i;
    var white = new Array(n);
    for (i = 0; i < n; i++) {
      white[i] = whitenPixel(grayData[i], threshold, strength);
    }
    var denoised = medianFilter3x3(white, width, height);
    var out = new Uint8ClampedArray(n);
    for (i = 0; i < n; i++) { out[i] = denoised[i]; }
    return out;
  }

  /* 墨覆盖率：灰度 ≤ threshold 的像素占比（0–1），打印费墨参考。 */
  function estimateInkCoverage(grayData, threshold) {
    if (grayData == null || typeof grayData.length !== 'number' || grayData.length === 0) {
      fail('grayData', '灰度数据必须是非空数组（类数组）');
    }
    assertThreshold(threshold);
    var i, v, ink = 0;
    for (i = 0; i < grayData.length; i++) {
      v = grayData[i];
      if (!isByte(v)) {
        fail('grayData', '灰度值必须为 0-255 的有限数（下标 ' + i + ' 非法）');
      }
      if (Math.round(v) <= threshold) { ink++; }
    }
    return ink / grayData.length;
  }

  /* 文件名清洗（家族惯例）：非法字符剔除、首尾点/空格裁掉、空格转连字符、
   * 最长 60 字符；空文本回退 'doc-cleaned'。 */
  function sanitizeFileName(text) {
    var s = (text == null) ? '' : String(text);
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
    s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
    if (s.length > 60) { s = s.slice(0, 60).replace(/-+$/, ''); }
    if (s.length === 0) { return 'doc-cleaned'; }
    return s;
  }

  var API = {
    rgbToGray: rgbToGray,
    rgbaToGray: rgbaToGray,
    buildGrayHistogram: buildGrayHistogram,
    otsuThreshold: otsuThreshold,
    whitenPixel: whitenPixel,
    applyWhitening: applyWhitening,
    estimateInkCoverage: estimateInkCoverage,
    sanitizeFileName: sanitizeFileName,
    MAX_FILE_SIZE: 20 * 1024 * 1024
  };

  if (typeof window !== 'undefined') {
    window.DocBgCleaner = API;
  }

  /* ============ 浏览器端：DOM 交互（node 测试不执行） ============ */
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = API;
    }
    return;
  }

  function $(id) { return document.getElementById(id); }

  var MAX_DIM = 1920; /* 处理图长边上限：超大图片按比例降采样，保证处理速度 */

  var state = {
    img: null,          /* HTMLImageElement */
    baseName: 'doc-cleaned',
    w: 0, h: 0,
    gray: null,         /* 灰度数组（处理分辨率） */
    out: null,          /* 处理后灰度 Uint8ClampedArray */
    threshold: 0,
    inkBefore: 0, inkAfter: 0,
    timer: null
  };

  function toast(msg) {
    var el = $('dbc-toast');
    if (!el) { return; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function setError(msg) {
    var el = $('dbc-error');
    if (!el) { return; }
    el.style.display = msg ? 'block' : 'none';
    el.textContent = msg || '';
  }

  function isSupported(file) {
    return /^image\/(png|jpe?g|webp)$/i.test(file.type || '');
  }

  function handleFile(file) {
    setError('');
    if (!file) { return; }
    if (!isSupported(file)) {
      setError('仅支持 JPG / PNG / WebP 图片，当前文件类型为「' + (file.type || '未知') + '」');
      return;
    }
    if (file.size > API.MAX_FILE_SIZE) {
      setError('图片超过 20MB 上限（当前 ' + (file.size / 1048576).toFixed(1) + 'MB），请先压缩后再处理');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () { loadImage(reader.result, file.name || ''); };
    reader.onerror = function () { setError('文件读取失败，请重试'); };
    reader.readAsDataURL(file);
  }

  function loadImage(dataURL, name) {
    var im = new Image();
    im.onload = function () {
      /* 长边超限降采样（内存与速度保护），页面明示。 */
      var scale = 1;
      var longEdge = Math.max(im.naturalWidth, im.naturalHeight);
      if (longEdge > MAX_DIM) {
        scale = MAX_DIM / longEdge;
      }
      state.w = Math.max(1, Math.round(im.naturalWidth * scale));
      state.h = Math.max(1, Math.round(im.naturalHeight * scale));
      state.img = im;
      var base = (name || '').replace(/\.[^.]+$/, '');
      state.baseName = sanitizeFileName(base); /* 空回退 'doc-cleaned' */
      var note = $('dbc-scale-note');
      if (note) {
        note.style.display = scale < 1 ? 'block' : 'none';
        if (scale < 1) {
          note.textContent = '提示：原图 ' + im.naturalWidth + '×' + im.naturalHeight +
            ' 已按比例降采样到 ' + state.w + '×' + state.h + '（长边上限 1920，保证处理速度）';
        }
      }
      $('dbc-filename').textContent = '当前图片：' + (name || '未命名');
      extractGray();
      scheduleProcess();
      toast('图片已载入（仅本地处理，不上传）');
    };
    im.onerror = function () { setError('图片解码失败，请换一张试试'); };
    im.src = dataURL;
  }

  function extractGray() {
    var off = document.createElement('canvas');
    off.width = state.w; off.height = state.h;
    var ctx = off.getContext('2d');
    ctx.drawImage(state.img, 0, 0, state.w, state.h);
    var idata = ctx.getImageData(0, 0, state.w, state.h);
    state.gray = rgbaToGray(idata.data);
    state.threshold = otsuThreshold(buildGrayHistogram(state.gray));
    state.inkBefore = estimateInkCoverage(state.gray, state.threshold);
  }

  function currentOptions() {
    var manual = $('dbc-manual').checked;
    var thr = manual ? parseInt($('dbc-thr').value, 10) : 'auto';
    var strength = parseInt($('dbc-strength').value, 10) / 100;
    return { threshold: thr, strength: strength, denoise: $('dbc-denoise').checked };
  }

  function scheduleProcess() {
    clearTimeout(state.timer);
    state.timer = setTimeout(process, 120);
  }

  function process() {
    if (!state.gray) { return; }
    var opt = currentOptions();
    var threshold = opt.threshold === 'auto' ? state.threshold : opt.threshold;
    var opts = { threshold: threshold, strength: opt.strength };
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var white = new Array(state.w * state.h), i;
    for (i = 0; i < white.length; i++) {
      white[i] = whitenPixel(state.gray[i], threshold, opt.strength);
    }
    state.out = opt.denoise
      ? (function () {
          var d = medianFilter3x3(white, state.w, state.h);
          var u = new Uint8ClampedArray(d.length);
          for (var k = 0; k < d.length; k++) { u[k] = d[k]; }
          return u;
        })()
      : (function () {
          var u = new Uint8ClampedArray(white.length);
          for (var k = 0; k < white.length; k++) { u[k] = white[k]; }
          return u;
        })();
    state.inkAfter = estimateInkCoverage(state.out, threshold);
    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    renderCompare(threshold);
    updateReadout(threshold, Math.round(t1 - t0));
  }

  function renderCompare(threshold) {
    var before = $('dbc-before'), after = $('dbc-after');
    before.width = state.w; before.height = state.h;
    after.width = state.w; after.height = state.h;
    var bctx = before.getContext('2d');
    bctx.drawImage(state.img, 0, 0, state.w, state.h);
    var idata = bctx.createImageData(state.w, state.h);
    var d = idata.data, i, o, v;
    for (i = 0; i < state.out.length; i++) {
      o = i * 4; v = state.out[i];
      d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
    }
    after.getContext('2d').putImageData(idata, 0, 0);
    $('dbc-compare').style.display = 'block';
    $('dbc-export-row').style.display = 'flex';
    applyClip();
  }

  function applyClip() {
    var pos = parseInt($('dbc-pos').value, 10);
    $('dbc-after-wrap').style.width = (100 - pos) + '%';
    $('dbc-divider').style.left = pos + '%';
    $('dbc-pos-label').textContent = pos + '%';
  }

  function updateReadout(threshold, ms) {
    var auto = $('dbc-manual').checked ? '' : '（Otsu 自动）';
    $('dbc-thr-val').textContent = threshold + auto;
    $('dbc-strength-val').textContent = $('dbc-strength').value + '%';
    $('dbc-readout').innerHTML =
      '阈值 ' + threshold + auto + ' · 漂白强度 ' + $('dbc-strength').value + '% · 处理耗时约 ' + ms + 'ms<br>' +
      '墨覆盖率：处理前 <b>' + (state.inkBefore * 100).toFixed(1) + '%</b>' +
      ' → 处理后 <b>' + (state.inkAfter * 100).toFixed(1) + '%</b>' +
      '（深色像素占比，打印费墨参考）';
  }

  function exportPNG() {
    if (!state.out) { toast('请先载入图片'); return; }
    $('dbc-after').toBlob(function (blob) {
      if (!blob) { toast('PNG 生成失败，请重试'); return; }
      downloadBlob(blob, state.baseName + '.png', 'PNG 已开始下载');
    }, 'image/png');
  }

  function exportPDF() {
    if (!state.out) { toast('请先载入图片'); return; }
    if (!window.PDFLib) {
      toast('PDF 组件未就绪，请刷新页面重试');
      return;
    }
    $('dbc-after').toBlob(function (blob) {
      if (!blob) { toast('PNG 生成失败，请重试'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var pngBytes = new Uint8Array(fr.result);
          window.PDFLib.PDFDocument.create().then(function (pdf) {
            return pdf.embedPng(pngBytes).then(function (img) {
              var page = pdf.addPage([img.width, img.height]);
              page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
              return pdf.save();
            });
          }).then(function (bytes) {
            downloadBlob(new Blob([bytes], { type: 'application/pdf' }),
              state.baseName + '.pdf', 'PDF 已开始下载');
          }).catch(function () { toast('PDF 合成失败，请重试'); });
        } catch (e) { toast('PDF 合成失败，请重试'); }
      };
      fr.readAsArrayBuffer(blob);
    }, 'image/png');
  }

  function downloadBlob(blob, filename, okMsg) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 800);
    toast(okMsg);
  }

  function init() {
    var drop = $('dbc-drop'), picker = $('dbc-file');
    drop.addEventListener('click', function () { picker.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); }
    });
    picker.addEventListener('change', function () {
      if (picker.files && picker.files[0]) { handleFile(picker.files[0]); }
      picker.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { handleFile(f); }
    });

    /* 阈值模式切换：自动 Otsu / 手动滑杆。 */
    var manual = $('dbc-manual'), auto = $('dbc-auto'), thr = $('dbc-thr');
    function syncThrUI() {
      thr.disabled = !manual.checked;
      $('dbc-thr-row').classList.toggle('disabled', !manual.checked);
      $('dbc-thr-val').textContent = manual.checked ? thr.value : '（自动）';
      scheduleProcess();
    }
    auto.addEventListener('change', syncThrUI);
    manual.addEventListener('change', syncThrUI);
    thr.addEventListener('input', scheduleProcess);
    $('dbc-strength').addEventListener('input', scheduleProcess);
    $('dbc-denoise').addEventListener('change', scheduleProcess);
    $('dbc-pos').addEventListener('input', applyClip);

    $('dbc-export-png').addEventListener('click', exportPNG);
    $('dbc-export-pdf').addEventListener('click', exportPDF);

    syncThrUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})();

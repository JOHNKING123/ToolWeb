/* 图片取色器与主色提取 - 纯前端零上传
 * 颜色格式互转 / 像素读取 / 固定步长抽样 / 中位切分量化 / 导出，均为确定性纯函数。
 * 失败约定：除 validateImageMeta 返回 {ok, reason} 外，非法输入一律返回 null（不静默钳制、不编造）。
 * 双模式导出：浏览器用 window.ImageColorPicker，node 用 module.exports。 */
(function () {
'use strict';

var MAX_SIZE = 20 * 1024 * 1024;
var ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
function validRgb(r, g, b) { return isInt(r) && isInt(g) && isInt(b) && r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255; }

function rgbToHex(r, g, b) {
  if (!validRgb(r, g, b)) return null;
  function p(n) { var s = n.toString(16); return s.length === 1 ? '0' + s : s; }
  return '#' + p(r) + p(g) + p(b);
}
function hexToRgb(hex) {
  if (hex === null || hex === undefined) return null;
  var h = String(hex).trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHsl(r, g, b) {
  if (!validRgb(r, g, b)) return null;
  var rr = r / 255, gg = g / 255, bb = b / 255;
  var max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return { h: Math.round(((h % 360) + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function rgbToCmyk(r, g, b) {
  if (!validRgb(r, g, b)) return null;
  if (r === 0 && g === 0 && b === 0) return { c: 0, m: 0, y: 0, k: 100 };
  var k = 1 - Math.max(r, g, b) / 255;
  return {
    c: Math.round(((1 - r / 255 - k) / (1 - k)) * 100),
    m: Math.round(((1 - g / 255 - k) / (1 - k)) * 100),
    y: Math.round(((1 - b / 255 - k) / (1 - k)) * 100),
    k: Math.round(k * 100)
  };
}
function formatColor(color) {
  if (!color || !validRgb(color.r, color.g, color.b)) return null;
  var hex = rgbToHex(color.r, color.g, color.b);
  var hsl = rgbToHsl(color.r, color.g, color.b);
  var cmyk = rgbToCmyk(color.r, color.g, color.b);
  return {
    hex: hex,
    rgb: 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')',
    hsl: 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)',
    cmyk: 'cmyk(' + cmyk.c + '%, ' + cmyk.m + '%, ' + cmyk.y + '%, ' + cmyk.k + '%)'
  };
}
function pickPixel(data, width, height, x, y) {
  if (!data || !isInt(width) || !isInt(height) || width <= 0 || height <= 0) return null;
  if (data.length !== width * height * 4) return null;
  if (!isInt(x) || !isInt(y) || x < 0 || y < 0 || x >= width || y >= height) return null;
  var i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}
function samplePixels(data, maxSamples) {
  if (maxSamples === undefined) maxSamples = 10000;
  if (!data || data.length === 0 || data.length % 4 !== 0) return null;
  if (!isInt(maxSamples) || maxSamples < 100) return null;
  var total = data.length / 4;
  var step = Math.ceil(total / maxSamples);
  var out = [];
  for (var i = 0; i < total; i += step) {
    out.push({ r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] });
  }
  return out;
}
function quantizeColors(rgbArray, count) {
  if (!Array.isArray(rgbArray) || rgbArray.length === 0) return null;
  if (!isInt(count) || count < 1 || count > 10) return null;
  var total = rgbArray.length;
  var boxes = [{ pixels: rgbArray.slice(), order: 0 }];
  var nextOrder = 1;
  function rangeOf(box, ch) {
    var mn = 255, mx = 0, k;
    for (k = 0; k < box.pixels.length; k++) { var v = box.pixels[k][ch]; if (v < mn) mn = v; if (v > mx) mx = v; }
    return mx - mn;
  }
  while (boxes.length < count) {
    var best = -1, bestCount = -1, bestOrder = Infinity, chs = ['r', 'g', 'b'], bestCh = 'r';
    var j;
    for (j = 0; j < boxes.length; j++) {
      var box = boxes[j];
      if (box.pixels.length < 2) continue;
      var ch = 'r', rg = rangeOf(box, 'r');
      if (rangeOf(box, 'g') > rg) { ch = 'g'; rg = rangeOf(box, 'g'); }
      if (rangeOf(box, 'b') > rg) { ch = 'b'; rg = rangeOf(box, 'b'); }
      if (rg === 0) continue;
      if (box.pixels.length > bestCount || (box.pixels.length === bestCount && box.order < bestOrder)) {
        best = j; bestCount = box.pixels.length; bestOrder = box.order; bestCh = ch;
      }
    }
    if (best < 0) break;
    var target = boxes[best];
    var sorted = target.pixels.slice().sort(function (a, b) { return a[bestCh] - b[bestCh]; });
    var mid = Math.floor(sorted.length / 2);
    boxes.splice(best, 1,
      { pixels: sorted.slice(0, mid), order: target.order },
      { pixels: sorted.slice(mid), order: nextOrder++ });
  }
  boxes.sort(function (a, b) { return (b.pixels.length - a.pixels.length) || (a.order - b.order); });
  return boxes.map(function (box) {
    var sr = 0, sg = 0, sb = 0, k;
    for (k = 0; k < box.pixels.length; k++) { sr += box.pixels[k].r; sg += box.pixels[k].g; sb += box.pixels[k].b; }
    var n = box.pixels.length;
    var r = Math.round(sr / n), g = Math.round(sg / n), b = Math.round(sb / n);
    return { hex: rgbToHex(r, g, b), rgb: { r: r, g: g, b: b }, count: n, percent: Math.round((n / total) * 1000) / 10 };
  });
}
function normHex(c) {
  if (typeof c === 'string') { var rgb = hexToRgb(c); return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : null; }
  if (c && validRgb(c.r, c.g, c.b)) return rgbToHex(c.r, c.g, c.b);
  if (c && typeof c.hex === 'string') { var r2 = hexToRgb(c.hex); return r2 ? rgbToHex(r2.r, r2.g, r2.b) : null; }
  return null;
}
function buildCssVariables(colors, prefix) {
  if (!Array.isArray(colors) || colors.length === 0) return null;
  if (prefix === undefined) prefix = 'color';
  if (typeof prefix !== 'string' || !/^[a-z0-9-]+$/.test(prefix)) return null;
  var lines = [];
  for (var i = 0; i < colors.length; i++) {
    var hex = normHex(colors[i]);
    if (!hex) return null;
    lines.push('--' + prefix + '-' + (i + 1) + ': ' + hex + ';');
  }
  return lines.join('\n');
}
function buildHexList(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return null;
  var lines = [];
  for (var i = 0; i < colors.length; i++) {
    var hex = normHex(colors[i]);
    if (!hex) return null;
    lines.push(hex);
  }
  return lines.join('\n');
}
function suggestExportName(kind) {
  if (kind === 'css') return 'palette.css';
  if (kind === 'hex') return 'palette.txt';
  return null;
}
function validateImageMeta(type, sizeBytes) {
  if (ALLOWED_TYPES.indexOf(type) < 0) return { ok: false, reason: '不支持的文件类型：仅支持 PNG、JPEG、WebP、GIF、BMP 图片。' };
  if (!isInt(sizeBytes) || sizeBytes <= 0) return { ok: false, reason: '文件大小无效。' };
  if (sizeBytes > MAX_SIZE) return { ok: false, reason: '文件超过 20MB 上限，请换一张更小的图片。' };
  return { ok: true, reason: '' };
}

var API = {
  rgbToHex: rgbToHex, hexToRgb: hexToRgb, rgbToHsl: rgbToHsl, rgbToCmyk: rgbToCmyk,
  formatColor: formatColor, pickPixel: pickPixel, samplePixels: samplePixels,
  quantizeColors: quantizeColors, buildCssVariables: buildCssVariables,
  buildHexList: buildHexList, suggestExportName: suggestExportName,
  validateImageMeta: validateImageMeta, MAX_SIZE: MAX_SIZE, ALLOWED_TYPES: ALLOWED_TYPES
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else if (typeof window !== 'undefined') window.ImageColorPicker = API;

/* ---------- 浏览器 DOM ---------- */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var drop = $('icp-drop'), fileInput = $('icp-file'), err = $('icp-error'),
        canvas = $('icp-canvas'), ctx = canvas.getContext('2d'),
        mag = $('icp-mag'), magCtx = mag.getContext('2d'),
        wrap = $('icp-canvas-wrap');
    var off = document.createElement('canvas'), offCtx = off.getContext('2d');
    var hasImage = false, naturalW = 0, naturalH = 0, displayW = 0, displayH = 0;
    var history = [], palette = [];

    function showErr(msg) { err.textContent = msg; err.style.display = msg ? 'block' : 'none'; }
    function copyText(text, statusEl) {
      function done(ok) { if (statusEl) statusEl.textContent = ok ? '已复制到剪贴板' : '复制失败，请手动选取复制'; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
        ta.select(); try { done(document.execCommand('copy')); } catch (e) { done(false); }
        document.body.removeChild(ta);
      }
    }
    function drawToCanvases(img, w, h) {
      naturalW = w; naturalH = h;
      var scale = Math.min(1, 900 / w);
      displayW = Math.max(1, Math.round(w * scale)); displayH = Math.max(1, Math.round(h * scale));
      canvas.width = displayW; canvas.height = displayH;
      ctx.imageSmoothingEnabled = true; ctx.drawImage(img, 0, 0, displayW, displayH);
      off.width = w; off.height = h; offCtx.drawImage(img, 0, 0, w, h);
      hasImage = true; wrap.style.display = 'block';
      $('icp-meta').textContent = '原图 ' + w + '×' + h + '，显示 ' + displayW + '×' + displayH + '（缩放 ' + (Math.round(scale * 1000) / 10) + '%）';
    }
    function loadFile(file) {
      var v = validateImageMeta(file.type, file.size);
      if (!v.ok) { showErr(v.reason); return; }
      showErr('');
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { drawToCanvases(img, img.naturalWidth, img.naturalHeight); };
        img.onerror = function () { showErr('图片解码失败，请换一张 PNG、JPEG、WebP、GIF 或 BMP 图片。'); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
    function renderPicked(px, x, y) {
      var f = formatColor(px);
      $('icp-swatch').style.background = f.hex;
      $('icp-hex').textContent = f.hex;
      $('icp-rgb').textContent = f.rgb;
      $('icp-hsl').textContent = f.hsl;
      $('icp-cmyk').textContent = f.cmyk;
      $('icp-coord').textContent = '坐标 (' + x + ', ' + y + ') · 原图 ' + naturalW + '×' + naturalH;
      if (px.a !== undefined && px.a < 255) {
        $('icp-alpha').textContent = '透明像素：alpha=' + px.a + '，透明像素的 RGB 仅为底色混合参考。';
      } else { $('icp-alpha').textContent = '不透明像素（alpha=255）。'; }
      var key = f.hex + '@' + x + ',' + y;
      if (history.length === 0 || history[0].key !== key) {
        history.unshift({ key: key, hex: f.hex, rgb: f.rgb, x: x, y: y });
        history = history.slice(0, 8);
        renderHistory();
      }
    }
    function renderHistory() {
      var box = $('icp-history'); box.innerHTML = '';
      if (!history.length) { box.textContent = '暂无取色记录，点击图片取色后会显示在这里。'; return; }
      history.forEach(function (h) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'icp-hist';
        var sw = document.createElement('span'); sw.className = 'icp-hist-sw'; sw.style.background = h.hex;
        var tx = document.createElement('span'); tx.textContent = h.hex + ' (' + h.x + ', ' + h.y + ')';
        b.appendChild(sw); b.appendChild(tx);
        b.addEventListener('click', function () {
          var rgb = hexToRgb(h.hex);
          if (rgb) renderPicked({ r: rgb.r, g: rgb.g, b: rgb.b, a: 255 }, h.x, h.y);
        });
        box.appendChild(b);
      });
    }
    function canvasPos(e) {
      var r = canvas.getBoundingClientRect();
      var dx = Math.floor((e.clientX - r.left) * canvas.width / r.width);
      var dy = Math.floor((e.clientY - r.top) * canvas.height / r.height);
      return { dx: dx, dy: dy };
    }
    function origPos(dx, dy) {
      return { x: Math.floor(dx * naturalW / displayW), y: Math.floor(dy * naturalH / displayH) };
    }
    canvas.addEventListener('mousemove', function (e) {
      if (!hasImage) return;
      var p = canvasPos(e), o = origPos(p.dx, p.dy);
      mag.style.display = 'block';
      magCtx.imageSmoothingEnabled = false;
      var half = 20;
      magCtx.clearRect(0, 0, 160, 160);
      magCtx.drawImage(off, Math.max(0, o.x - half), Math.max(0, o.y - half), 40, 40, 0, 0, 160, 160);
      magCtx.strokeStyle = '#ef4444'; magCtx.lineWidth = 2;
      magCtx.beginPath(); magCtx.moveTo(80, 0); magCtx.lineTo(80, 160); magCtx.moveTo(0, 80); magCtx.lineTo(160, 80); magCtx.stroke();
      magCtx.strokeStyle = '#fff'; magCtx.lineWidth = 1;
      magCtx.strokeRect(0.5, 0.5, 159, 159);
      var r = wrap.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      var left = e.clientX - r.left + 16, top = e.clientY - r.top + 16;
      if (left + 170 > r.width) left = e.clientX - r.left - 186;
      if (top + 170 > r.height) top = e.clientY - r.top - 186;
      mag.style.left = left + 'px'; mag.style.top = top + 'px';
      void cr;
    });
    canvas.addEventListener('mouseleave', function () { mag.style.display = 'none'; });
    canvas.addEventListener('click', function (e) {
      if (!hasImage) return;
      var p = canvasPos(e), o = origPos(p.dx, p.dy);
      var data = offCtx.getImageData(0, 0, naturalW, naturalH).data;
      var px = pickPixel(data, naturalW, naturalH, o.x, o.y);
      if (px) renderPicked(px, o.x, o.y); else showErr('取色失败：坐标超出图片范围。');
    });
    function renderPalette() {
      var box = $('icp-palette'); box.innerHTML = '';
      if (!palette.length) { box.textContent = '尚未提取，点击「提取主色」生成色板。'; return; }
      palette.forEach(function (c) {
        var d = document.createElement('button'); d.type = 'button'; d.className = 'icp-pal';
        var sw = document.createElement('span'); sw.className = 'icp-pal-sw'; sw.style.background = c.hex;
        var tx = document.createElement('span'); tx.textContent = c.hex + ' · ' + c.percent.toFixed(1) + '%';
        d.appendChild(sw); d.appendChild(tx);
        d.addEventListener('click', function () { copyText(c.hex, $('icp-status')); });
        box.appendChild(d);
      });
    }
    function download(name, text) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    $('icp-extract').addEventListener('click', function () {
      if (!hasImage) { showErr('请先上传图片或载入示例图，再提取主色。'); return; }
      var count = parseInt($('icp-count').value, 10);
      var data = offCtx.getImageData(0, 0, naturalW, naturalH).data;
      var sampled = samplePixels(data, 10000);
      var result = sampled ? quantizeColors(sampled, count) : null;
      if (!result) { showErr('主色提取失败，请重试。'); return; }
      palette = result; renderPalette(); showErr('');
      $('icp-status').textContent = '已提取 ' + result.length + ' 个主色（按占比降序）。';
    });
    $('icp-count').addEventListener('input', function () { $('icp-count-val').textContent = $('icp-count').value; });
    $('icp-copy-hex').addEventListener('click', function () {
      var t = buildHexList(palette);
      if (!t) { showErr('暂无色板，请先提取主色。'); return; }
      copyText(t, $('icp-status'));
    });
    $('icp-copy-css').addEventListener('click', function () {
      var t = buildCssVariables(palette);
      if (!t) { showErr('暂无色板，请先提取主色。'); return; }
      copyText(t, $('icp-status'));
    });
    $('icp-dl-css').addEventListener('click', function () {
      var t = buildCssVariables(palette); if (!t) { showErr('暂无色板，请先提取主色。'); return; }
      download(suggestExportName('css'), t);
    });
    $('icp-dl-hex').addEventListener('click', function () {
      var t = buildHexList(palette); if (!t) { showErr('暂无色板，请先提取主色。'); return; }
      download(suggestExportName('hex'), t);
    });
    $('icp-sample').addEventListener('click', function () {
      showErr('');
      var s = document.createElement('canvas'); s.width = 400; s.height = 400;
      var c = s.getContext('2d');
      c.fillStyle = '#ff0000'; c.fillRect(0, 0, 200, 200);
      c.fillStyle = '#00ff00'; c.fillRect(200, 0, 200, 200);
      c.fillStyle = '#0000ff'; c.fillRect(0, 200, 200, 200);
      c.fillStyle = '#ffff00'; c.fillRect(200, 200, 200, 200);
      drawToCanvases(s, 400, 400);
      $('icp-status').textContent = '已载入 4 色示例图（红／绿／蓝／黄），点击图片可取色，或点「提取主色」。';
    });
    drop.addEventListener('click', function () { fileInput.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    renderHistory(); renderPalette();
  });
}
})();

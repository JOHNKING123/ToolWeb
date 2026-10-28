/* SVG 换色器 - 纯前端零上传
 * 颜色解析 / 归一化 / 上下文限定提取与替换 / HSL 色调偏移 / 字符串级消毒，均为确定性纯函数。
 * 失败约定（纯函数层）：非法输入一律抛 Error，err.field 给出字段名，不静默钳制、不静默取整；
 * 唯 validateSvgInput 返回 {ok, reason}，以便界面直接展示中文原因。
 * 上下文限定：只扫描行内 fill/stroke/stop-color/flood-color/lighting-color 属性值与内联 style
 * 属性中的同名声明；注释、<style> 块、<script> 块、CDATA、文本内容、id 与 data-* 属性一律不动。
 * 双模式导出：浏览器用 window.SvgRecolor，node 用 module.exports。 */
(function () {
'use strict';

var MAX_CHARS = 2 * 1024 * 1024;
var TARGET_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'];
var NAMED_COLORS = {
  black: [0, 0, 0], silver: [192, 192, 192], gray: [128, 128, 128], white: [255, 255, 255],
  maroon: [128, 0, 0], red: [255, 0, 0], purple: [128, 0, 128], fuchsia: [255, 0, 255],
  green: [0, 128, 0], lime: [0, 255, 0], olive: [128, 128, 0], yellow: [255, 255, 0],
  navy: [0, 0, 128], blue: [0, 0, 255], teal: [0, 128, 128], aqua: [0, 255, 255]
};

function fail(field, msg) { var e = new Error(msg); e.field = field; throw e; }
function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function pad2(n) { var s = n.toString(16); return s.length === 1 ? '0' + s : s; }

/* 解析颜色值：#rgb / #rrggbb / #rrggbbaa / rgb() / rgba() / 16 基础色 / transparent。
 * 返回 {r, g, b, a}（a 0–1，省略时为 1）。其它值一律抛 Error（field 'color'）。 */
function parseColor(value) {
  if (typeof value !== 'string') fail('color', '颜色值须为字符串');
  var v = value.trim();
  if (!v) fail('color', '颜色值为空');
  var lower = v.toLowerCase();
  if (lower === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (hasOwn(NAMED_COLORS, lower)) {
    var nc = NAMED_COLORS[lower];
    return { r: nc[0], g: nc[1], b: nc[2], a: 1 };
  }
  var hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (hex) {
    var h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    var a = 1;
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
    return { r: r, g: g, b: b, a: a };
  }
  var fn = /^rgba?\(([^)]*)\)$/i.exec(v);
  if (fn) {
    var parts = fn[1].split(',').map(function (p) { return p.trim(); });
    var isRgba = lower.indexOf('rgba(') === 0;
    if ((!isRgba && parts.length !== 3) || (isRgba && parts.length !== 4)) {
      fail('color', 'rgb/rgba 分量个数不对：' + v);
    }
    var rgb = [];
    for (var i = 0; i < 3; i++) {
      if (!/^-?\d+$/.test(parts[i])) fail('color', 'rgb 分量须为整数：' + v);
      var n = parseInt(parts[i], 10);
      if (n < 0 || n > 255) fail('color', 'rgb 分量越界 0–255：' + v);
      rgb.push(n);
    }
    var alpha = 1;
    if (isRgba) {
      if (!/^-?(\d+\.?\d*|\.\d+)$/.test(parts[3])) fail('color', 'alpha 须为数字：' + v);
      alpha = parseFloat(parts[3]);
      if (alpha < 0 || alpha > 1) fail('color', 'alpha 越界 0–1：' + v);
    }
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
  }
  fail('color', '不支持的颜色值：' + v);
}

/* 归一化：不透明 → 小写 #rrggbb；带透明 → 小写 #rrggbbaa（a×255 四舍五入取整）。 */
function toCanonical(color) {
  if (!color || typeof color !== 'object') fail('color', '颜色对象无效');
  if (!isInt(color.r) || !isInt(color.g) || !isInt(color.b) ||
      color.r < 0 || color.r > 255 || color.g < 0 || color.g > 255 || color.b < 0 || color.b > 255) {
    fail('color', 'RGB 分量须为 0–255 整数');
  }
  var a = color.a === undefined ? 1 : color.a;
  if (!isNum(a) || a < 0 || a > 1) fail('color', 'alpha 须为 0–1 数字');
  var base = '#' + pad2(color.r) + pad2(color.g) + pad2(color.b);
  if (a === 1) return base;
  return base + pad2(Math.round(a * 255));
}

function rgbToHsl(r, g, b) {
  if (!isInt(r) || !isInt(g) || !isInt(b) || r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
    fail('color', 'RGB 分量须为 0–255 整数');
  }
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
  var hr = Math.round(((h % 360) + 360) % 360) % 360;
  return { h: hr, s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h, s, l) {
  if (!isNum(h) || !isNum(s) || !isNum(l) || h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) {
    fail('color', 'HSL 须满足 h 0–360、s/l 0–100');
  }
  var hh = ((h % 360) + 360) % 360 / 360, ss = s / 100, ll = l / 100;
  var c = (1 - Math.abs(2 * ll - 1)) * ss;
  var x = c * (1 - Math.abs(((hh * 6) % 2) - 1));
  var m = ll - c / 2;
  var seg = Math.floor(hh * 6) % 6;
  var rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  function ch(v) { var n = Math.round((v + m) * 255); return n < 0 ? 0 : (n > 255 ? 255 : n); }
  return { r: ch(rgb[0]), g: ch(rgb[1]), b: ch(rgb[2]) };
}

/* 色相偏移：degrees 整数 −180–180；饱和度／明度／透明度不变；灰色（s=0）偏移后色值不变。 */
function shiftHue(color, degrees) {
  if (!isInt(degrees) || degrees < -180 || degrees > 180) fail('degrees', '色调偏移须为 −180–180 整数');
  var parsed;
  if (typeof color === 'string') parsed = parseColor(color);
  else if (color && typeof color === 'object') {
    parsed = { r: color.r, g: color.g, b: color.b, a: color.a === undefined ? 1 : color.a };
    toCanonical(parsed);
  } else fail('color', '颜色值无效');
  var hsl = rgbToHsl(parsed.r, parsed.g, parsed.b);
  if (hsl.s === 0) return toCanonical(parsed);
  var h2 = ((hsl.h + degrees) % 360 + 360) % 360;
  var rgb = hslToRgb(h2, hsl.s, hsl.l);
  return toCanonical({ r: rgb.r, g: rgb.g, b: rgb.b, a: parsed.a });
}

/* 剥离不计入提取的区域：注释、<style> 块、<script> 块、CDATA。 */
function stripNonCounted(svg) {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
}

var ATTR_RE_SRC = '(^|[\\s\\/])(' + TARGET_ATTRS.join('|') + ')(\\s*=\\s*)("[^"]*"|\'[^\']*\')';
var STYLE_ATTR_RE_SRC = '(^|[\\s\\/])(style)(\\s*=\\s*)("[^"]*"|\'[^\']*\')';
var DECL_RE_SRC = '(' + TARGET_ATTRS.join('|') + ')(\\s*:\\s*)([^;]+)';

/* 提取颜色：返回 {palette: [{color, count}], skipped}；palette 按 count 降序，并列按首次出现顺序。 */
function extractColors(svg) {
  if (typeof svg !== 'string' || svg.trim() === '') fail('svg', 'SVG 代码为空');
  var work = stripNonCounted(svg);
  var counts = {}, firstIdx = {}, order = 0, skipped = 0;
  function tally(raw) {
    var canon;
    try { canon = toCanonical(parseColor(raw)); } catch (e) { skipped++; return; }
    if (!hasOwn(counts, canon)) { counts[canon] = 0; firstIdx[canon] = order++; }
    counts[canon]++;
  }
  var tags = work.match(/<[^>]+>/g) || [];
  tags.forEach(function (tag) {
    var attrRe = new RegExp(ATTR_RE_SRC, 'g'), m;
    while ((m = attrRe.exec(tag)) !== null) {
      var quoted = m[4];
      tally(quoted.slice(1, -1));
    }
    var styleRe = new RegExp(STYLE_ATTR_RE_SRC, 'g'), sm;
    while ((sm = styleRe.exec(tag)) !== null) {
      var inner = sm[4].slice(1, -1);
      var declRe = new RegExp(DECL_RE_SRC, 'g'), dm;
      while ((dm = declRe.exec(inner)) !== null) {
        var raw = dm[3].trim().replace(/\s*!important\s*$/i, '').trim();
        tally(raw);
      }
    }
  });
  var palette = Object.keys(counts).map(function (c) {
    return { color: c, count: counts[c], _i: firstIdx[c] };
  });
  palette.sort(function (a, b) { return b.count - a.count || a._i - b._i; });
  palette = palette.map(function (p) { return { color: p.color, count: p.count }; });
  return { palette: palette, skipped: skipped };
}

/* 上下文内替换：仅行内属性值与内联 style 声明；id／文本／注释／<style> 块／url 引用原样保留。
 * mapping 键与值均经 parseColor＋toCanonical 校验归一化；返回 {svg, replaced}。 */
function replaceColors(svg, mapping) {
  if (typeof svg !== 'string' || svg.trim() === '') fail('svg', 'SVG 代码为空');
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) fail('mapping', 'mapping 须为原色→新色的对象');
  var norm = {};
  Object.keys(mapping).forEach(function (k) {
    var nk, nv;
    try { nk = toCanonical(parseColor(k)); } catch (e) { fail('mapping', 'mapping 键非法：' + k); }
    var v = mapping[k];
    try { nv = typeof v === 'string' ? toCanonical(parseColor(v)) : toCanonical(v); }
    catch (e) { fail('mapping', 'mapping 值非法：' + v); }
    norm[nk] = nv;
  });
  var protectedParts = [];
  function protect(m) { protectedParts.push(m); return '\u0001SVGRECOLOR-' + (protectedParts.length - 1) + '\u0001'; }
  var work = svg
    .replace(/<!--[\s\S]*?-->/g, protect)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, protect)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, protect)
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, protect);
  var replaced = 0;
  work = work.replace(/<[^>]+>/g, function (tag) {
    tag = tag.replace(new RegExp(ATTR_RE_SRC, 'g'), function (m, pre, name, eq, quoted) {
      var val = quoted.slice(1, -1), canon;
      try { canon = toCanonical(parseColor(val)); } catch (e) { return m; }
      if (!hasOwn(norm, canon)) return m;
      replaced++;
      var q = quoted.charAt(0);
      return pre + name + eq + q + norm[canon] + q;
    });
    tag = tag.replace(new RegExp(STYLE_ATTR_RE_SRC, 'g'), function (m, pre, name, eq, quoted) {
      var inner = quoted.slice(1, -1), q = quoted.charAt(0);
      var newInner = inner.replace(new RegExp(DECL_RE_SRC, 'g'), function (dm, dname, colon, dval) {
        var raw = dval.trim();
        var imp = '';
        var impMatch = /\s*!important\s*$/i.exec(raw);
        if (impMatch) { imp = ' !important'; raw = raw.slice(0, raw.length - impMatch[0].length).trim(); }
        var canon;
        try { canon = toCanonical(parseColor(raw)); } catch (e) { return dm; }
        if (!hasOwn(norm, canon)) return dm;
        replaced++;
        return dname + colon + norm[canon] + imp;
      });
      return pre + name + eq + q + newInner + q;
    });
    return tag;
  });
  work = work.replace(/\u0001SVGRECOLOR-(\d+)\u0001/g, function (m, i) { return protectedParts[+i]; });
  return { svg: work, replaced: replaced };
}

/* 全局色调偏移：先提取、逐色 shiftHue、一次替换。返回 {svg, mapping, replaced}。 */
function applyHueShift(svg, degrees) {
  if (!isInt(degrees) || degrees < -180 || degrees > 180) fail('degrees', '色调偏移须为 −180–180 整数');
  var ext = extractColors(svg);
  var mapping = {};
  ext.palette.forEach(function (p) { mapping[p.color] = shiftHue(p.color, degrees); });
  var res = replaceColors(svg, mapping);
  return { svg: res.svg, mapping: mapping, replaced: res.replaced };
}

/* 字符串级消毒：删 <script> 块、删 on* 事件属性、javascript: 链接改写为 #。 */
function sanitizeSvg(svg) {
  if (typeof svg !== 'string' || svg.trim() === '') fail('svg', 'SVG 代码为空');
  var out = svg
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '');
  out = out.replace(/<[^>]+>/g, function (tag) {
    tag = tag.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    tag = tag.replace(/(\s+)(href|xlink:href)(\s*=\s*)("[^"]*"|'[^']*')/gi, function (m, pre, name, eq, quoted) {
      var val = quoted.slice(1, -1);
      if (/^\s*javascript:/i.test(val)) { var q = quoted.charAt(0); return pre + name + eq + q + '#' + q; }
      return m;
    });
    return tag;
  });
  return out;
}

/* 输入校验：非空字符串、含 <svg 标签、长度 ≤ 2MB（字符数）。返回 {ok, reason}。 */
function validateSvgInput(svg) {
  if (typeof svg !== 'string') return { ok: false, reason: '请输入 SVG 代码（字符串）。' };
  if (svg.trim() === '') return { ok: false, reason: 'SVG 代码为空，请粘贴或上传 SVG。' };
  if (svg.length > MAX_CHARS) return { ok: false, reason: 'SVG 超过 2MB 上限，请精简后重试。' };
  if (!/<svg[\s>]/.test(svg)) return { ok: false, reason: '未找到 <svg 标签，请确认输入为 SVG 代码。' };
  return { ok: true, reason: '' };
}

function suggestExportName() { return 'recolored.svg'; }

var API = {
  parseColor: parseColor, toCanonical: toCanonical, extractColors: extractColors,
  replaceColors: replaceColors, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb,
  shiftHue: shiftHue, applyHueShift: applyHueShift, sanitizeSvg: sanitizeSvg,
  validateSvgInput: validateSvgInput, suggestExportName: suggestExportName,
  MAX_CHARS: MAX_CHARS
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else if (typeof window !== 'undefined') window.SvgRecolor = API;

/* ---------- 浏览器 DOM ---------- */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var input = $('svgr-input'), drop = $('svgr-drop'), fileInput = $('svgr-file'),
        err = $('svgr-error'), paletteBox = $('svgr-palette'), report = $('svgr-report'),
        hue = $('svgr-hue'), hueVal = $('svgr-hue-val'),
        origPrev = $('svgr-orig'), newPrev = $('svgr-new'),
        statusEl = $('svgr-status');
    if (!input) return;
    var sanitizedOriginal = '', currentSvg = '';

    function showErr(msg) { err.textContent = msg; err.style.display = msg ? 'block' : 'none'; }
    function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

    function renderPreviews() {
      if (!sanitizedOriginal) {
        origPrev.innerHTML = '<div class="svgr-empty">尚未载入有效 SVG：请粘贴代码、上传文件或载入示例。</div>';
        newPrev.innerHTML = '<div class="svgr-empty">换色后预览将在此显示。</div>';
        return;
      }
      origPrev.innerHTML = sanitizedOriginal;
      newPrev.innerHTML = currentSvg;
    }

    function renderPalette() {
      paletteBox.innerHTML = '';
      if (!sanitizedOriginal) {
        paletteBox.innerHTML = '<p class="svgr-tip">尚未提取：请先粘贴或上传 SVG，再点「提取颜色」。</p>';
        report.textContent = '';
        return;
      }
      var ext;
      try { ext = extractColors(currentSvg); } catch (e) { showErr(e.message); return; }
      report.textContent = '共提取 ' + ext.palette.length + ' 种颜色，跳过 ' + ext.skipped +
        ' 处（currentColor／url(#渐变)／none／inherit／未知命名色不在提取范围，见下方真限制说明）。';
      if (ext.palette.length === 0) {
        paletteBox.innerHTML = '<p class="svgr-tip">未提取到可替换颜色：行内颜色可能全部为 currentColor／url 引用／none，或只存在于 &lt;style&gt; 块与外部 CSS 中（均不在本工具范围）。</p>';
        return;
      }
      ext.palette.forEach(function (p) {
        var row = document.createElement('div');
        row.className = 'svgr-row';
        var sw = document.createElement('span');
        sw.className = 'svgr-sw'; sw.style.background = p.color; sw.title = p.color;
        var meta = document.createElement('span');
        meta.className = 'svgr-meta'; meta.textContent = p.color + ' × ' + p.count;
        var picker = document.createElement('input');
        picker.type = 'color'; picker.value = p.color.length === 7 ? p.color : '#ffffff';
        picker.title = '替换色取色器（带透明的颜色请用右侧 HEX 输入）';
        var hexInput = document.createElement('input');
        hexInput.type = 'text'; hexInput.className = 'svgr-hex'; hexInput.value = p.color;
        hexInput.setAttribute('aria-label', '替换为 ' + p.color + ' 的新颜色 HEX');
        var applyBtn = document.createElement('button');
        applyBtn.type = 'button'; applyBtn.className = 'svgr-btn'; applyBtn.textContent = '替换此色';
        var rowErr = document.createElement('span');
        rowErr.className = 'svgr-row-err';
        function doReplace(newVal) {
          var canon;
          try { canon = toCanonical(parseColor(newVal)); } catch (e) { rowErr.textContent = '替换色非法：' + e.message; return; }
          if (canon === p.color) { rowErr.textContent = '与原色相同，未改动。'; return; }
          var mapping = {}; mapping[p.color] = canon;
          try {
            var res = replaceColors(currentSvg, mapping);
            currentSvg = res.svg; rowErr.textContent = '已替换 ' + res.replaced + ' 处。';
            setStatus('已替换 ' + p.color + ' → ' + canon + '，共 ' + res.replaced + ' 处。');
            renderPalette(); renderPreviews();
          } catch (e) { rowErr.textContent = e.message; }
        }
        applyBtn.addEventListener('click', function () { doReplace(hexInput.value); });
        hexInput.addEventListener('change', function () { doReplace(hexInput.value); });
        picker.addEventListener('input', function () { hexInput.value = picker.value; });
        row.appendChild(sw); row.appendChild(meta); row.appendChild(picker);
        row.appendChild(hexInput); row.appendChild(applyBtn); row.appendChild(rowErr);
        paletteBox.appendChild(row);
      });
    }

    function loadSvg(text, sourceLabel) {
      showErr('');
      var v = validateSvgInput(text);
      if (!v.ok) { showErr(v.reason); return; }
      try { sanitizedOriginal = sanitizeSvg(text); } catch (e) { showErr(e.message); return; }
      currentSvg = sanitizedOriginal;
      input.value = text;
      renderPalette(); renderPreviews();
      setStatus(sourceLabel + '已载入并消毒（已剥离 script／on*／javascript: 链接），色板按出现次数降序排列。');
    }

    $('svgr-extract').addEventListener('click', function () { loadSvg(input.value, '粘贴的 SVG '); });
    $('svgr-restore').addEventListener('click', function () {
      if (!sanitizedOriginal) { showErr('尚未载入有效 SVG，无法恢复。'); return; }
      currentSvg = sanitizedOriginal; showErr('');
      renderPalette(); renderPreviews(); setStatus('已恢复原图（消毒后的原稿）。');
    });
    $('svgr-apply-hue').addEventListener('click', function () {
      if (!sanitizedOriginal) { showErr('尚未载入有效 SVG，请先粘贴、上传或载入示例。'); return; }
      var deg = parseInt(hue.value, 10);
      try {
        var res = applyHueShift(currentSvg, deg);
        currentSvg = res.svg; showErr('');
        renderPalette(); renderPreviews();
        setStatus('色调偏移 ' + (deg >= 0 ? '+' : '') + deg + '° 已应用，共替换 ' + res.replaced + ' 处；色板已同步刷新为新色值。');
      } catch (e) { showErr(e.message); }
    });
    $('svgr-copy').addEventListener('click', function () {
      if (!currentSvg) { showErr('暂无换色后代码，请先载入 SVG。'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentSvg).then(function () { setStatus('已复制换色后代码。'); },
          function () { setStatus('复制失败，请手动选取复制。'); });
      } else {
        var ta = document.createElement('textarea'); ta.value = currentSvg; document.body.appendChild(ta);
        ta.select(); try { setStatus(document.execCommand('copy') ? '已复制换色后代码。' : '复制失败，请手动选取复制。'); } catch (e) { setStatus('复制失败，请手动选取复制。'); }
        document.body.removeChild(ta);
      }
    });
    $('svgr-download').addEventListener('click', function () {
      if (!currentSvg) { showErr('暂无换色后代码，请先载入 SVG。'); return; }
      var blob = new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = suggestExportName();
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      setStatus('已下载 ' + suggestExportName() + '。');
    });
    $('svgr-sample').addEventListener('click', function () {
      var sample = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">\n' +
        '  <!-- 注释里的 #ff0000 不计入提取 -->\n' +
        '  <style>.unused{fill:#00ff00}</style>\n' +
        '  <circle cx="60" cy="80" r="50" fill="#ff0000"/>\n' +
        '  <rect x="130" y="30" width="80" height="100" fill="#00ff00" stroke="#0000ff" stroke-width="4"/>\n' +
        '  <text x="60" y="150" font-size="12" fill="#0000ff">#ff0000 文本不计入</text>\n' +
        '</svg>';
      loadSvg(sample, '示例 SVG ');
    });
    hue.addEventListener('input', function () { hueVal.textContent = hue.value + '°'; });
    drop.addEventListener('click', function () { fileInput.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
    function loadFile(file) {
      showErr('');
      if (file.size > MAX_CHARS) { showErr('文件超过 2MB 上限，请换一个更小的 SVG。'); return; }
      var reader = new FileReader();
      reader.onload = function () { loadSvg(String(reader.result), '上传的 SVG '); };
      reader.onerror = function () { showErr('读取文件失败，请重试。'); };
      reader.readAsText(file);
    }
    renderPreviews();
  });
}
})();

/* 配色方案生成器 - 纯前端 HSL 色轮和谐方案引擎
 * 零第三方依赖，不向服务器发任何请求，所有计算在浏览器本地完成。
 * 纯逻辑部分（换算 / 方案 / 对比度 / 导出格式）经由 module.exports 暴露，
 * 供 node 单元测试 require；浏览器里则走 DOM 渲染与复制。 */
(function () {
'use strict';

/* ---------- 基础换算 ---------- */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function wrapHue(h) { return ((h % 360) + 360) % 360; }

function parseHex(s) {
  if (s === null || s === undefined) return null;
  var h = String(s).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(function (c) { return c + c; }).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function isValidHex(s) { return parseHex(s) !== null; }
function rgbToHex(r, g, b) {
  function p(n) { var s = clamp(Math.round(n), 0, 255).toString(16); return s.length === 1 ? '0' + s : s; }
  return ('#' + p(r) + p(g) + p(b)).toUpperCase();
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(wrapHue(h)), Math.round(s * 100), Math.round(l * 100)];
}
function hslToRgb(h, s, l) {
  h = wrapHue(h); s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = l - c / 2, r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function hslToHex(h, s, l) { var rgb = hslToRgb(h, s, l); return rgbToHex(rgb[0], rgb[1], rgb[2]); }
function hexToHsl(hex) { var rgb = parseHex(hex); return rgb ? rgbToHsl(rgb[0], rgb[1], rgb[2]) : null; }

/* ---------- 6 种和谐方案 ---------- */
/* offsets 为相对基色的色相偏移（度）；mono 为单色方案，用明度阶梯代替色相偏移。 */
var SCHEMES = [
  { id: 'complementary', name: '互补', desc: '基色 + 对面 180° 的互补色，对比最强，适合主色 + 强调色。', offsets: [0, 180],
    roles: ['基色', '互补色 +180°'] },
  { id: 'analogous', name: '类比', desc: '基色左右各 30° 的邻近色，柔和统一，适合大面积背景渐变。', offsets: [-30, 0, 30],
    roles: ['类比色 −30°', '基色', '类比色 +30°'] },
  { id: 'triadic', name: '三角色', desc: '色轮上互隔 120° 的三色，活泼均衡，适合多彩界面。', offsets: [0, 120, 240],
    roles: ['基色', '三角色 +120°', '三角色 +240°'] },
  { id: 'split', name: '分裂互补', desc: '互补色两侧各 30° 的两色，对比柔和，容错率高。', offsets: [0, 150, 210],
    roles: ['基色', '分裂互补 +150°', '分裂互补 +210°'] },
  { id: 'square', name: '四方形', desc: '色轮上互隔 90° 的四色，丰富但需定一个主色压阵。', offsets: [0, 90, 180, 270],
    roles: ['基色', '四方形 +90°', '四方形 +180°', '四方形 +270°'] },
  { id: 'mono', name: '单色', desc: '同色相、同饱和度，仅明度阶梯变化，稳妥不出错。', offsets: null,
    roles: ['明度 12%', '明度 28%', '明度 44%', '明度 60%', '明度 76%', '明度 90%'] }
];
var MONO_LIGHTNESS = [12, 28, 44, 60, 76, 90];

function schemeColors(schemeId, baseHex) {
  var hsl = hexToHsl(baseHex);
  if (!hsl) return null;
  var h = hsl[0], s = hsl[1], l = hsl[2];
  var scheme = null;
  SCHEMES.forEach(function (sc) { if (sc.id === schemeId) scheme = sc; });
  if (!scheme) return null;
  if (schemeId === 'mono') {
    return MONO_LIGHTNESS.map(function (ll, i) {
      return { hex: hslToHex(h, s, ll), hue: h, saturation: s, lightness: ll, role: scheme.roles[i] };
    });
  }
  return scheme.offsets.map(function (off, i) {
    var hh = wrapHue(h + off);
    return { hex: hslToHex(hh, s, l), hue: hh, saturation: s, lightness: l, role: scheme.roles[i], offset: off };
  });
}
function allSchemes(baseHex) {
  var out = {};
  SCHEMES.forEach(function (sc) { out[sc.id] = schemeColors(sc.id, baseHex); });
  return out;
}

/* ---------- WCAG 对比度 ---------- */
function luminance(r, g, b) {
  function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatioHex(hexA, hexB) {
  var a = parseHex(hexA), b = parseHex(hexB);
  if (!a || !b) return null;
  var la = luminance(a[0], a[1], a[2]), lb = luminance(b[0], b[1], b[2]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function contrastAgainst(hex) {
  return { white: contrastRatioHex(hex, '#FFFFFF'), black: contrastRatioHex(hex, '#000000') };
}
function aaLabel(ratio) {
  if (ratio === null) return '—';
  if (ratio >= 7) return 'AAA ✓';
  if (ratio >= 4.5) return 'AA ✓';
  if (ratio >= 3) return '仅大文本 AA';
  return '不达标 ✗';
}
function aaPass(ratio) { return ratio !== null && ratio >= 4.5; }

/* ---------- 导出格式 ---------- */
function hexList(colors) { return colors.map(function (c) { return c.hex; }).join(', '); }
function cssVariables(colors, prefix) {
  prefix = prefix || 'palette';
  var lines = [':root {'];
  colors.forEach(function (c, i) { lines.push('  --' + prefix + '-' + (i + 1) + ': ' + c.hex + ';'); });
  lines.push('}');
  return lines.join('\n');
}
function randomBaseHex() {
  return rgbToHex(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
}

/* ---------- 浏览器 UI ---------- */
if (typeof document !== 'undefined') {
  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'cp-toast'; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 1800);
  }
  function copyText(t, okMsg) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(
        function () { toast(okMsg || '已复制'); },
        function () { fallbackCopy(t, okMsg); });
    } else { fallbackCopy(t, okMsg); }
  }
  function fallbackCopy(t, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(okMsg || '已复制'); }
    catch (e) { toast('复制失败：当前浏览器不支持一键复制，请手动复制'); }
    document.body.removeChild(ta);
  }
  function swatchHTML(c) {
    var ct = contrastAgainst(c.hex);
    return '<div class="cp-swatch" data-hex="' + c.hex + '" title="点击复制 ' + c.hex + '">' +
      '<div class="cp-block" style="background:' + c.hex + '"></div>' +
      '<div class="cp-sw-hex">' + c.hex + '</div>' +
      '<div class="cp-role">' + c.role + '</div>' +
      '<div class="cp-ct">白底 ' + ct.white.toFixed(2) + ':1 ' + aaLabel(ct.white) + '<br>' +
      '黑底 ' + ct.black.toFixed(2) + ':1 ' + aaLabel(ct.black) + '</div>' +
      '</div>';
  }
  function render(baseHex) {
    var hsl = hexToHsl(baseHex);
    if (!hsl) return;
    $('cp-base-preview').style.background = baseHex;
    $('cp-base-hsl').textContent = 'HSL ' + hsl[0] + '°, ' + hsl[1] + '%, ' + hsl[2] + '%';
    var wrap = $('cp-schemes');
    var html = '';
    SCHEMES.forEach(function (sc) {
      var colors = schemeColors(sc.id, baseHex);
      html += '<section class="cp-panel" id="cp-scheme-' + sc.id + '">' +
        '<h3>' + sc.name + '配色 <span class="cp-hint">' + sc.desc + '</span></h3>' +
        '<div class="cp-grid">' + colors.map(swatchHTML).join('') + '</div>' +
        '<div class="cp-actions">' +
        '<button class="cp-btn" data-copy="list" data-scheme="' + sc.id + '">复制 HEX 列表</button>' +
        '<button class="cp-btn" data-copy="css" data-scheme="' + sc.id + '">复制 CSS 变量</button>' +
        '</div></section>';
    });
    wrap.innerHTML = html;
    var swatches = wrap.querySelectorAll('.cp-swatch');
    swatches.forEach(function (el) {
      el.addEventListener('click', function () { copyText(el.getAttribute('data-hex'), '已复制 ' + el.getAttribute('data-hex')); });
    });
    var btns = wrap.querySelectorAll('[data-copy]');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var colors = schemeColors(btn.getAttribute('data-scheme'), baseHex);
        if (btn.getAttribute('data-copy') === 'list') copyText(hexList(colors), '已复制整方案 HEX 列表');
        else copyText(cssVariables(colors), '已复制整方案 CSS 变量');
      });
    });
  }
  function setBase(hex, src) {
    hex = rgbToHex.apply(null, parseHex(hex));
    if (src !== 'picker') $('cp-picker').value = hex;
    if (src !== 'hex') $('cp-hex').value = hex;
    render(hex);
  }
  document.addEventListener('DOMContentLoaded', function () {
    $('cp-picker').addEventListener('input', function () { setBase($('cp-picker').value, 'picker'); });
    $('cp-hex').addEventListener('input', function () {
      if (isValidHex($('cp-hex').value)) setBase($('cp-hex').value, 'hex');
    });
    $('cp-random').addEventListener('click', function () { setBase(randomBaseHex(), 'all'); });
    setBase('#2563EB', 'all');
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clamp: clamp, wrapHue: wrapHue, parseHex: parseHex, isValidHex: isValidHex,
    rgbToHex: rgbToHex, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb, hslToHex: hslToHex,
    hexToHsl: hexToHsl, SCHEMES: SCHEMES, MONO_LIGHTNESS: MONO_LIGHTNESS,
    schemeColors: schemeColors, allSchemes: allSchemes,
    luminance: luminance, contrastRatioHex: contrastRatioHex,
    contrastAgainst: contrastAgainst, aaLabel: aaLabel, aaPass: aaPass,
    hexList: hexList, cssVariables: cssVariables, randomBaseHex: randomBaseHex
  };
}
})();

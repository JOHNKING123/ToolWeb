/* CSS 毛玻璃生成器（css_glass_generator）- 纯前端本地计算
 * 颜色解析、rgba 合成、面板校验、backdrop-filter / 完整 CSS / HTML 片段
 * 生成、三预设配置、导出命名，全部为确定性纯函数。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、
 * 不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM 并挂 window。
 * 零网络请求：本文件不发起任何 fetch / XHR。
 * 口径：只做 backdrop-filter 毛玻璃面板声明，不做 filter（滤镜生成器
 * 已交付）、不做液态玻璃折射／位移贴图、不做图片处理。 */
(function () {
'use strict';

/* 带字段名的失败。 */
function fail(field, message) {
  var e = new Error(message);
  e.field = field;
  throw e;
}

/* 数值：有限且最多 2 位小数。 */
function is2dp(v) {
  return typeof v === 'number' && isFinite(v) &&
    Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
}
function checkNum(v, field, label, min, max) {
  if (typeof v !== 'number' || !isFinite(v)) {
    fail(field, label + '不是有效数字');
  }
  if (!is2dp(v)) {
    fail(field, label + '最多保留 2 位小数');
  }
  if (v < min || v > max) {
    fail(field, label + '超出范围 ' + min + '–' + max);
  }
  return v;
}

/* 2 位小数去尾零：0.50 -> "0.5"，0 -> "0"，-0 归零。 */
function fmtNum(v) {
  var r = Math.round(Number(v) * 100) / 100;
  if (r === 0) r = 0;
  return String(r);
}

/* 颜色：仅接受 #RGB / #RRGGBB，统一输出小写 #RRGGBB。
 * 颜色名、rgb()、空串、非字符串一律失败；不静默补全。 */
function parseHexColor(s) {
  if (typeof s !== 'string') fail('color', '颜色须为 #RGB 或 #RRGGBB 形式的字符串');
  var t = s.replace(/^\s+|\s+$/g, '');
  var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(t);
  if (!m) fail('color', '颜色只接受 #RGB 或 #RRGGBB，例如 #FFF 或 #ffffff');
  var h = m[1].toLowerCase();
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) +
      h.charAt(2) + h.charAt(2);
  }
  return '#' + h;
}

/* rgba 合成：hex 经 parseHexColor 校验；alpha 0–1、最多 2 位小数；
 * alpha 去尾零规范化，alpha 为 1 时仍输出 rgba 串。 */
function hexToRgba(hex, alpha) {
  var c = parseHexColor(hex);
  checkNum(alpha, 'alpha', '不透明度', 0, 1);
  var r = parseInt(c.slice(1, 3), 16);
  var g = parseInt(c.slice(3, 5), 16);
  var b = parseInt(c.slice(5, 7), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + fmtNum(alpha) + ')';
}

/* 面板校验：返回规范化后的新对象（不改原对象；颜色统一小写）。
 * blur 0–40px、saturate 0–200%、填充／边框色 + alpha 0–1、
 * radius 0–40px、阴影模糊 0–60px + alpha 0–1；数值最多 2 位小数。 */
function validatePanel(p) {
  if (!p || typeof p !== 'object') fail('panel', '面板参数须为对象');
  return {
    blur: checkNum(p.blur, 'blur', '模糊', 0, 40),
    saturate: checkNum(p.saturate, 'saturate', '饱和度', 0, 200),
    fillColor: parseHexColor(p.fillColor),
    fillAlpha: checkNum(p.fillAlpha, 'fillAlpha', '填充不透明度', 0, 1),
    borderColor: parseHexColor(p.borderColor),
    borderAlpha: checkNum(p.borderAlpha, 'borderAlpha', '边框不透明度', 0, 1),
    radius: checkNum(p.radius, 'radius', '圆角', 0, 40),
    shadowBlur: checkNum(p.shadowBlur, 'shadowBlur', '阴影模糊', 0, 60),
    shadowAlpha: checkNum(p.shadowAlpha, 'shadowAlpha', '阴影不透明度', 0, 1)
  };
}

/* backdrop-filter 值：blur 与 saturate 两项恒输出，不省略
 *（blur 0 且 saturate 100 时仍为有效声明）。 */
function buildBackdropFilter(panel) {
  var v = validatePanel(panel);
  return 'blur(' + fmtNum(v.blur) + 'px) saturate(' + fmtNum(v.saturate) + '%)';
}

/* 完整 CSS：.glass 八行块（选择器行＋六行声明＋闭合行），含
 * -webkit-backdrop-filter / backdrop-filter / background / border /
 * border-radius / box-shadow。阴影固定 0 8px 偏移，模糊与不透明度
 * 取面板参数；边框固定 1px 实线。 */
function buildCssSnippet(panel) {
  var v = validatePanel(panel);
  var value = buildBackdropFilter(v);
  var fill = hexToRgba(v.fillColor, v.fillAlpha);
  var border = hexToRgba(v.borderColor, v.borderAlpha);
  return '.glass {\n' +
    '  -webkit-backdrop-filter: ' + value + ';\n' +
    '  backdrop-filter: ' + value + ';\n' +
    '  background: ' + fill + ';\n' +
    '  border: 1px solid ' + border + ';\n' +
    '  border-radius: ' + fmtNum(v.radius) + 'px;\n' +
    '  box-shadow: 0 8px ' + fmtNum(v.shadowBlur) + 'px rgba(0, 0, 0, ' +
    fmtNum(v.shadowAlpha) + ');\n' +
    '}';
}

/* 四种内置预览背景（均为页面内置 CSS，无外链图片）。 */
var BACKGROUNDS = {
  gradient: { label: '彩色渐变',
    css: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)' },
  dark: { label: '深色',
    css: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' },
  light: { label: '浅色',
    css: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' },
  photo: { label: '彩色图案',
    css: 'url("data:image/svg+xml,' +
      '%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'480\' height=\'300\' viewBox=\'0 0 480 300\'%3E' +
      '%3Crect width=\'480\' height=\'300\' fill=\'%23bae6fd\'/%3E' +
      '%3Ccircle cx=\'380\' cy=\'70\' r=\'42\' fill=\'%23fbbf24\'/%3E' +
      '%3Cpolygon points=\'0,220 120,110 240,220\' fill=\'%23166534\'/%3E' +
      '%3Cpolygon points=\'140,220 280,90 420,220\' fill=\'%2315803d\'/%3E' +
      '%3Crect y=\'220\' width=\'480\' height=\'80\' fill=\'%230ea5e9\'/%3E' +
      '%3C/svg%3E") center / cover' }
};
var BACKGROUND_ORDER = ['gradient', 'dark', 'light', 'photo'];

function checkBackground(bg) {
  if (!Object.prototype.hasOwnProperty.call(BACKGROUNDS, bg)) {
    fail('background', '未知预览背景：' + bg);
  }
  return bg;
}

/* HTML 片段：<style> 内嵌完整 CSS＋预览背景样式＋ <div class="glass">
 * 面板元素（示例标题与一段示例文字）；无 <script>。 */
function buildHtmlSnippet(panel, background) {
  var v = validatePanel(panel);
  checkBackground(background);
  var css = buildCssSnippet(v);
  var bgCss = BACKGROUNDS[background].css;
  return '<style>\n' + css + '\n' +
    '.glass-bg {\n  background: ' + bgCss + ';\n' +
    '  padding: 48px 24px;\n}\n</style>\n' +
    '<div class="glass-bg">\n' +
    '  <div class="glass">\n' +
    '    <h2>毛玻璃面板</h2>\n' +
    '    <p>这是一段示例文字：面板背后内容被模糊，面板本身保持半透明。</p>\n' +
    '  </div>\n' +
    '</div>';
}

/* 三预设：返回 { name, panel, background } 的全新副本。 */
var PRESETS = {
  card: { label: '卡片', background: 'gradient',
    panel: { blur: 12, saturate: 150, fillColor: '#ffffff', fillAlpha: 0.25,
      borderColor: '#ffffff', borderAlpha: 0.4, radius: 16,
      shadowBlur: 32, shadowAlpha: 0.15 } },
  navbar: { label: '导航栏', background: 'photo',
    panel: { blur: 20, saturate: 180, fillColor: '#ffffff', fillAlpha: 0.6,
      borderColor: '#ffffff', borderAlpha: 0.5, radius: 0,
      shadowBlur: 16, shadowAlpha: 0.1 } },
  login: { label: '登录框', background: 'dark',
    panel: { blur: 10, saturate: 130, fillColor: '#ffffff', fillAlpha: 0.2,
      borderColor: '#ffffff', borderAlpha: 0.3, radius: 20,
      shadowBlur: 40, shadowAlpha: 0.2 } }
};
var PRESET_ORDER = ['card', 'navbar', 'login'];

function generatePreset(name) {
  var p = PRESETS[name];
  if (!p) fail('preset', '未知预设：' + name);
  var panel = validatePanel(p.panel);
  return { name: name, panel: panel, background: p.background };
}

/* 导出文件名：css -> glass.css，html -> glass-demo.html；其它失败。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'glass.css';
  if (kind === 'html') return 'glass-demo.html';
  fail('kind', '未知导出类型：' + kind);
}

var API = {
  parseHexColor: parseHexColor, hexToRgba: hexToRgba,
  validatePanel: validatePanel, buildBackdropFilter: buildBackdropFilter,
  buildCssSnippet: buildCssSnippet, buildHtmlSnippet: buildHtmlSnippet,
  generatePreset: generatePreset, suggestExportName: suggestExportName,
  fmtNum: fmtNum, BACKGROUNDS: BACKGROUNDS,
  BACKGROUND_ORDER: BACKGROUND_ORDER, PRESET_ORDER: PRESET_ORDER
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.CssGlassGenerator = API;

/* ---------------- 浏览器 DOM 逻辑 ---------------- */
function $(id) { return document.getElementById(id); }

var state = (function () {
  var preset = generatePreset('card');
  return { panel: preset.panel, background: preset.background };
})();

/* 编辑行定义：key、中文名、单位、范围、步进、字段类型。 */
var ROWS = [
  { key: 'blur', label: '模糊 blur', unit: 'px', min: 0, max: 40, step: 1, kind: 'num' },
  { key: 'saturate', label: '饱和度 saturate', unit: '%', min: 0, max: 200, step: 1, kind: 'num' },
  { key: 'fillColor', label: '填充色', unit: '', min: 0, max: 0, step: 1, kind: 'color' },
  { key: 'fillAlpha', label: '填充不透明度（即填充 rgba 的 alpha）', unit: '', min: 0, max: 1, step: 0.01, kind: 'num' },
  { key: 'borderColor', label: '边框色', unit: '', min: 0, max: 0, step: 1, kind: 'color' },
  { key: 'borderAlpha', label: '边框不透明度（即边框 rgba 的 alpha）', unit: '', min: 0, max: 1, step: 0.01, kind: 'num' },
  { key: 'radius', label: '圆角 radius', unit: 'px', min: 0, max: 40, step: 1, kind: 'num' },
  { key: 'shadowBlur', label: '阴影模糊（阴影固定 0 8px 偏移）', unit: 'px', min: 0, max: 60, step: 1, kind: 'num' },
  { key: 'shadowAlpha', label: '阴影不透明度（即阴影 rgba 的 alpha）', unit: '', min: 0, max: 1, step: 0.01, kind: 'num' }
];

function showMsg(text) {
  var el = $('gg-msg');
  if (el) el.textContent = text || '';
}
function toast(text) {
  var el = $('gg-toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
}
function setExportEnabled(on) {
  ['gg-copy-value', 'gg-copy-css', 'gg-download-css', 'gg-download-html']
    .forEach(function (id) { var b = $(id); if (b) b.disabled = !on; });
}
function copyText(text, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      toast(okMsg);
    }, function () { toast('复制失败，请手动选中代码区内容复制'); });
    return;
  }
  toast('复制失败，请手动选中代码区内容复制');
}
function download(filename, text) {
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  toast('已下载 ' + filename);
}

/* 刷新代码区与预览；非法时红字提示并禁用导出，预览保留上次可用样式。
 * 预览只用校验后的样式值（经 validatePanel／hexToRgba 产出），不直接
 * 注入用户原值。 */
function refresh() {
  try {
    var v = validatePanel(state.panel);
    var value = buildBackdropFilter(v);
    var css = buildCssSnippet(v);
    var vEl = $('gg-code-value');
    var cEl = $('gg-code-css');
    if (vEl) vEl.textContent = 'backdrop-filter: ' + value + ';';
    if (cEl) cEl.textContent = css;
    var stage = $('gg-preview-stage');
    if (stage) stage.style.background = BACKGROUNDS[state.background].css;
    var panel = $('gg-preview-panel');
    if (panel) {
      panel.style.webkitBackdropFilter = value;
      panel.style.backdropFilter = value;
      panel.style.background = hexToRgba(v.fillColor, v.fillAlpha);
      panel.style.border = '1px solid ' + hexToRgba(v.borderColor, v.borderAlpha);
      panel.style.borderRadius = fmtNum(v.radius) + 'px';
      panel.style.boxShadow = '0 8px ' + fmtNum(v.shadowBlur) + 'px rgba(0, 0, 0, ' +
        fmtNum(v.shadowAlpha) + ')';
    }
    var bgLabel = $('gg-bg-label');
    if (bgLabel) bgLabel.textContent = '当前预览背景：' +
      BACKGROUNDS[state.background].label + '（只改背景，不改面板参数）';
    showMsg('');
    setExportEnabled(true);
  } catch (e) {
    showMsg(e.message);
    setExportEnabled(false);
  }
}

function rowHtml(row) {
  var val = state.panel[row.key];
  if (row.kind === 'color') {
    return '<div class="gg-row-wrap"><div class="gg-row-label"><b>' + row.label +
      '</b></div><div class="gg-row">' +
      '<input type="color" data-role="gg-color" data-key="' + row.key +
      '" value="' + val + '">' +
      '<input type="text" data-role="gg-hex" data-key="' + row.key +
      '" value="' + val + '" placeholder="#RRGGBB">' +
      '<span class="gg-hint">只接受 #RGB / #RRGGBB</span></div></div>';
  }
  return '<div class="gg-row-wrap"><div class="gg-row-label"><b>' + row.label +
    '</b><span class="gg-hint">范围 ' + row.min + '–' + row.max + row.unit +
    '</span></div><div class="gg-row">' +
    '<input type="range" data-role="gg-range" data-key="' + row.key +
    '" min="' + row.min + '" max="' + row.max + '" step="' + row.step +
    '" value="' + val + '">' +
    '<input type="number" data-role="gg-num" data-key="' + row.key +
    '" min="' + row.min + '" max="' + row.max + '" step="0.01" value="' + val + '">' +
    '<span>' + row.unit + '</span></div></div>';
}

function renderEditor() {
  var wrap = $('gg-editor');
  if (!wrap) return;
  wrap.innerHTML = ROWS.map(rowHtml).join('');
  bindEditorEvents();
  refresh();
}

function setField(key, value) {
  try {
    var cand = {};
    Object.keys(state.panel).forEach(function (k) { cand[k] = state.panel[k]; });
    cand[key] = value;
    state.panel = validatePanel(cand);
    refresh();
    /* 仅同步本行控件，不整体重绘，避免滑杆拖动丢焦点。 */
    var num = document.querySelector('[data-role="gg-num"][data-key="' + key + '"]');
    if (num) num.value = value;
    var range = document.querySelector('[data-role="gg-range"][data-key="' + key + '"]');
    if (range) range.value = value;
    var hex = document.querySelector('[data-role="gg-hex"][data-key="' + key + '"]');
    if (hex) hex.value = state.panel[key];
    var color = document.querySelector('[data-role="gg-color"][data-key="' + key + '"]');
    if (color) color.value = state.panel[key];
  } catch (e) {
    renderEditor();
    showMsg(e.message);
  }
}

function bindEditorEvents() {
  var wrap = $('gg-editor');
  if (!wrap) return;
  wrap.querySelectorAll('[data-role="gg-range"]').forEach(function (el) {
    el.addEventListener('input', function () {
      var num = wrap.querySelector('[data-role="gg-num"][data-key="' + el.dataset.key + '"]');
      if (num) num.value = el.value;
      setField(el.dataset.key, Number(el.value));
    });
  });
  wrap.querySelectorAll('[data-role="gg-num"]').forEach(function (el) {
    el.addEventListener('change', function () {
      var v = el.value === '' ? NaN : Number(el.value);
      setField(el.dataset.key, v);
    });
  });
  wrap.querySelectorAll('[data-role="gg-color"]').forEach(function (el) {
    el.addEventListener('input', function () {
      setField(el.dataset.key, el.value);
    });
  });
  wrap.querySelectorAll('[data-role="gg-hex"]').forEach(function (el) {
    el.addEventListener('change', function () {
      setField(el.dataset.key, el.value);
    });
  });
}

function applyPreset(name) {
  try {
    var preset = generatePreset(name);
    state.panel = preset.panel;
    state.background = preset.background;
    syncBgButtons();
  } catch (e) { showMsg(e.message); return; }
  renderEditor();
  toast('已载入预设：' + PRESETS[name].label);
}

function syncBgButtons() {
  document.querySelectorAll('[data-bg]').forEach(function (el) {
    el.disabled = (el.dataset.bg === state.background);
  });
}

function bindPageEvents() {
  document.querySelectorAll('[data-preset]').forEach(function (el) {
    el.addEventListener('click', function () { applyPreset(el.dataset.preset); });
  });
  document.querySelectorAll('[data-bg]').forEach(function (el) {
    el.addEventListener('click', function () {
      /* 背景切换只改背景，不改面板参数。 */
      try { checkBackground(el.dataset.bg); } catch (e) { showMsg(e.message); return; }
      state.background = el.dataset.bg;
      syncBgButtons();
      refresh();
    });
  });
  var cv = $('gg-copy-value');
  if (cv) cv.addEventListener('click', function () {
    try { copyText('backdrop-filter: ' + buildBackdropFilter(state.panel) + ';', '已复制 backdrop-filter'); }
    catch (e) { showMsg(e.message); }
  });
  var cc = $('gg-copy-css');
  if (cc) cc.addEventListener('click', function () {
    try { copyText(buildCssSnippet(state.panel), '已复制完整 CSS'); }
    catch (e) { showMsg(e.message); }
  });
  var dc = $('gg-download-css');
  if (dc) dc.addEventListener('click', function () {
    try { download(suggestExportName('css'), buildCssSnippet(state.panel) + '\n'); }
    catch (e) { showMsg(e.message); }
  });
  var dh = $('gg-download-html');
  if (dh) dh.addEventListener('click', function () {
    try {
      download(suggestExportName('html'),
        '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>毛玻璃面板演示</title>\n</head>\n<body>\n' +
        buildHtmlSnippet(state.panel, state.background) + '\n</body>\n</html>\n');
    } catch (e) { showMsg(e.message); }
  });
  var le = $('gg-load-example');
  if (le) le.addEventListener('click', function () {
    applyPreset('card');
    toast('已载入示例：卡片预设');
  });
}

function init() {
  syncBgButtons();
  bindPageEvents();
  renderEditor();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();

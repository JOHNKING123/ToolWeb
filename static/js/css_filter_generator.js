/* CSS 滤镜生成器（css_filter_generator）- 纯前端本地计算
 * 九函数定义与校验、默认值省略、顺序合成、五预设配置、
 * filter / 完整 CSS / HTML 片段生成，全部为确定性纯函数。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、
 * 不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM 并挂 window。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
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

/* 2 位小数去尾零：110.50 -> "110.5"，0 -> "0"，-0 归零。 */
function fmtNum(v) {
  var r = Math.round(Number(v) * 100) / 100;
  if (r === 0) r = 0;
  return String(r);
}

/* 九函数定义：典范顺序即默认顺序；不含 drop-shadow()。 */
var FILTER_DEFS = {
  'blur': { label: '模糊 blur', unit: 'px', min: 0, max: 20, def: 0 },
  'brightness': { label: '亮度 brightness', unit: '%', min: 0, max: 200, def: 100 },
  'contrast': { label: '对比度 contrast', unit: '%', min: 0, max: 200, def: 100 },
  'grayscale': { label: '灰度 grayscale', unit: '%', min: 0, max: 100, def: 0 },
  'hue-rotate': { label: '色相旋转 hue-rotate', unit: 'deg', min: -360, max: 360, def: 0 },
  'invert': { label: '反色 invert', unit: '%', min: 0, max: 100, def: 0 },
  'opacity': { label: '不透明度 opacity', unit: '%', min: 0, max: 100, def: 100 },
  'saturate': { label: '饱和度 saturate', unit: '%', min: 0, max: 200, def: 100 },
  'sepia': { label: '褐色 sepia', unit: '%', min: 0, max: 100, def: 0 }
};
var FN_ORDER = ['blur', 'brightness', 'contrast', 'grayscale',
  'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia'];

function defOf(fn) {
  var d = FILTER_DEFS[fn];
  if (!d) fail('fn', '未知滤镜函数：' + fn);
  return d;
}

/* 单项校验：返回规范化后的新对象（不改原对象）。
 * fn 仅接受九函数名；enabled 须为布尔值；value 按函数范围、最多 2 位小数。 */
function validateFilterItem(item) {
  if (!item || typeof item !== 'object') fail('item', '滤镜项须为对象');
  var d = defOf(item.fn);
  if (typeof item.enabled !== 'boolean') fail('enabled', '启用状态须为布尔值');
  var value = checkNum(item.value, 'value', d.label + '数值', d.min, d.max);
  return { fn: item.fn, enabled: item.enabled, value: value };
}

/* 默认值判定：value 经范围校验后与该函数默认值相等返回 true，否则 false。 */
function isDefaultValue(fn, value) {
  var d = defOf(fn);
  checkNum(value, 'value', d.label + '数值', d.min, d.max);
  return value === d.def;
}

/* 校验整组：返回规范化后的新数组（不改原数组）。 */
function checkItems(items) {
  if (!Array.isArray(items)) fail('items', '滤镜项须为数组');
  return items.map(validateFilterItem);
}

/* 上移／下移：direction 仅接受 up（向首方向）／down（向末方向）。
 * 返回新数组（不改原数组，只改顺序不改数值与启用状态）；端点失败。 */
function moveFilterItem(items, index, direction) {
  var norm = checkItems(items);
  if (direction !== 'up' && direction !== 'down') {
    fail('direction', '移动方向只认 up（向首方向）或 down（向末方向）：' + direction);
  }
  if (typeof index !== 'number' || index % 1 !== 0 ||
      index < 0 || index >= norm.length) {
    fail('index', '滤镜下标越界：' + index);
  }
  var target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= norm.length) {
    fail('index', '滤镜已在端点，无法再向' +
      (direction === 'up' ? '首位' : '末位') + '移动');
  }
  var out = norm.slice();
  var tmp = out[index];
  out[index] = out[target];
  out[target] = tmp;
  return out;
}

/* 启用切换：返回新数组（不改原数组，只改该项 enabled）。 */
function setFilterEnabled(items, index, enabled) {
  var norm = checkItems(items);
  if (typeof index !== 'number' || index % 1 !== 0 ||
      index < 0 || index >= norm.length) {
    fail('index', '滤镜下标越界：' + index);
  }
  if (typeof enabled !== 'boolean') fail('enabled', '启用状态须为布尔值');
  var out = norm.slice();
  out[index] = { fn: norm[index].fn, enabled: enabled, value: norm[index].value };
  return out;
}

/* filter 值：取 enabled 且非默认值的项，按当前数组顺序输出
 * "<fn>(<数值><单位>)"，多项以单个空格连接；无有效项返回 "none"；
 * 空数组返回失败。 */
function buildFilterCss(items) {
  if (!Array.isArray(items)) fail('items', '滤镜项须为数组');
  if (items.length === 0) fail('items', '滤镜项不能为空');
  var norm = checkItems(items);
  var parts = [];
  norm.forEach(function (it) {
    var d = FILTER_DEFS[it.fn];
    if (it.enabled && it.value !== d.def) {
      parts.push(it.fn + '(' + fmtNum(it.value) + d.unit + ')');
    }
  });
  if (parts.length === 0) return 'none';
  return parts.join(' ');
}

/* 完整 CSS：.filtered 四行块，含 -webkit-filter 与 filter 两行。 */
function buildCssSnippet(items) {
  var value = buildFilterCss(items);
  return '.filtered {\n  -webkit-filter: ' + value + ';\n  filter: ' + value + ';\n}';
}

/* 内置 SVG 示例图（页面预览与 HTML 片段共用同一景：山水日出）。 */
var DEMO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" role="img" aria-label="示例图：山水日出">' +
  '<rect width="480" height="300" fill="#bae6fd"/>' +
  '<circle cx="380" cy="70" r="42" fill="#fbbf24"/>' +
  '<circle cx="380" cy="70" r="62" fill="#fde68a" opacity="0.45"/>' +
  '<polygon points="0,220 120,110 240,220" fill="#166534"/>' +
  '<polygon points="140,220 280,90 420,220" fill="#15803d"/>' +
  '<polygon points="120,110 150,140 90,140" fill="#ffffff"/>' +
  '<polygon points="280,90 310,125 250,125" fill="#ffffff"/>' +
  '<rect y="220" width="480" height="80" fill="#0ea5e9"/>' +
  '<ellipse cx="240" cy="245" rx="180" ry="12" fill="#ffffff" opacity="0.5"/>' +
  '<text x="24" y="40" font-family="sans-serif" font-size="22" fill="#0f172a">山水日出 · 滤镜预览</text>' +
  '</svg>';

/* HTML 片段：<style> 内嵌生成的完整 CSS + class filtered 的演示元素；无 <script>。 */
function buildHtmlSnippet(items) {
  var css = buildCssSnippet(items);
  return '<style>\n' + css + '\n</style>\n' +
    '<div class="filtered">' + DEMO_SVG + '</div>';
}

var PRESET_ORDER = ['vintage', 'warm', 'cool', 'black-white', 'vivid'];
var PRESETS = {
  'vintage': { label: '复古', values: { brightness: 110, contrast: 90, saturate: 80, sepia: 60 } },
  'warm': { label: '暖调', values: { brightness: 105, 'hue-rotate': -10, saturate: 130, sepia: 30 } },
  'cool': { label: '冷调', values: { brightness: 105, contrast: 105, 'hue-rotate': 15, saturate: 110 } },
  'black-white': { label: '黑白', values: { contrast: 110, grayscale: 100 } },
  'vivid': { label: '鲜艳', values: { brightness: 105, contrast: 115, saturate: 160 } }
};

/* 预设：返回 { name, items } 的全新副本；items 按典范顺序、仅含有效项、
 * 每项 enabled 为 true；未知预设失败。 */
function generatePreset(name) {
  var p = PRESETS[name];
  if (!p) fail('preset', '未知预设：' + name);
  var items = [];
  FN_ORDER.forEach(function (fn) {
    if (Object.prototype.hasOwnProperty.call(p.values, fn)) {
      items.push(validateFilterItem({ fn: fn, enabled: true, value: p.values[fn] }));
    }
  });
  return { name: name, items: items };
}

/* 默认全量九项（典范顺序、默认值、全部启用）：仅供页面初始状态使用。 */
function defaultItems() {
  return FN_ORDER.map(function (fn) {
    return { fn: fn, enabled: true, value: FILTER_DEFS[fn].def };
  });
}

/* 预设展开为全量九项：预设内函数启用并取预设值，其余函数取默认值并禁用。 */
function presetToFullItems(name) {
  var preset = generatePreset(name);
  var byFn = {};
  preset.items.forEach(function (it) { byFn[it.fn] = it.value; });
  return FN_ORDER.map(function (fn) {
    if (Object.prototype.hasOwnProperty.call(byFn, fn)) {
      return { fn: fn, enabled: true, value: byFn[fn] };
    }
    return { fn: fn, enabled: false, value: FILTER_DEFS[fn].def };
  });
}

/* 导出文件名：css -> filter.css，html -> filter-demo.html；其它失败。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'filter.css';
  if (kind === 'html') return 'filter-demo.html';
  fail('kind', '未知导出类型：' + kind);
}

var API = {
  validateFilterItem: validateFilterItem, isDefaultValue: isDefaultValue,
  moveFilterItem: moveFilterItem, setFilterEnabled: setFilterEnabled,
  buildFilterCss: buildFilterCss, buildCssSnippet: buildCssSnippet,
  buildHtmlSnippet: buildHtmlSnippet, generatePreset: generatePreset,
  suggestExportName: suggestExportName, defaultItems: defaultItems,
  presetToFullItems: presetToFullItems, fmtNum: fmtNum,
  FILTER_DEFS: FILTER_DEFS, FN_ORDER: FN_ORDER, PRESET_ORDER: PRESET_ORDER,
  DEMO_SVG: DEMO_SVG
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.CssFilterGenerator = API;

/* ---------------- 浏览器 DOM 逻辑 ---------------- */
function $(id) { return document.getElementById(id); }

var state = { items: presetToFullItems('vintage'), showOriginal: false };

function showMsg(text) {
  var el = $('cf-msg');
  if (el) el.textContent = text || '';
}
function toast(text) {
  var el = $('cf-toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
}
function setExportEnabled(on) {
  ['cf-copy-filter', 'cf-copy-css', 'cf-download-css', 'cf-download-html']
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

/* 刷新代码区与预览；非法时红字提示并禁用导出，预览保留上次可用样式。 */
function refresh() {
  try {
    var value = buildFilterCss(state.items);
    var css = buildCssSnippet(state.items);
    var vEl = $('cf-code-value');
    var cEl = $('cf-code-css');
    if (vEl) vEl.textContent = 'filter: ' + value + ';';
    if (cEl) cEl.textContent = css;
    var prev = $('cf-preview-svg');
    if (prev) {
      var applied = state.showOriginal ? 'none' : value;
      prev.style.webkitFilter = applied;
      prev.style.filter = applied;
    }
    var mode = $('cf-mode-label');
    if (mode) mode.textContent = state.showOriginal ?
      '当前显示：原图（参数未改动，点「效果」回到滤镜）' :
      '当前显示：效果（filter: ' + value + '）';
    showMsg('');
    setExportEnabled(true);
  } catch (e) {
    showMsg(e.message);
    setExportEnabled(false);
  }
}

function fnRowHtml(it, idx) {
  var d = FILTER_DEFS[it.fn];
  var isDef = it.value === d.def;
  var dis = it.enabled ? '' : ' disabled';
  return '<div class="cf-fn" data-idx="' + idx + '">' +
    '<div class="cf-fn-head"><label><input type="checkbox" data-role="fn-toggle" data-idx="' + idx + '"' +
    (it.enabled ? ' checked' : '') + '> <b>' + d.label + '</b></label>' +
    '<span class="cf-fn-meta">范围 ' + d.min + '–' + d.max + d.unit +
    ' · 默认 ' + d.def + d.unit +
    (isDef ? ' · <span class="cf-def-tag">默认不输出</span>' : '') +
    (it.enabled ? '' : ' · 已禁用') + '</span>' +
    '<span class="cf-fn-actions">' +
    '<button class="cf-btn cf-btn-small" type="button" data-role="fn-up" data-idx="' + idx + '"' +
    (idx === 0 ? ' disabled' : '') + '>↑ 上移</button>' +
    '<button class="cf-btn cf-btn-small" type="button" data-role="fn-down" data-idx="' + idx + '"' +
    (idx === state.items.length - 1 ? ' disabled' : '') + '>↓ 下移</button>' +
    '</span></div>' +
    '<div class="cf-row"><input type="range" data-role="fn-range" data-idx="' + idx +
    '" min="' + d.min + '" max="' + d.max + '" step="1" value="' + it.value + '"' + dis + '>' +
    '<input type="number" data-role="fn-num" data-idx="' + idx +
    '" min="' + d.min + '" max="' + d.max + '" step="0.01" value="' + it.value + '"' + dis + '>' +
    '<span>' + d.unit + '</span></div></div>';
}

function renderFns() {
  var wrap = $('cf-fns');
  if (!wrap) return;
  wrap.innerHTML = state.items.map(fnRowHtml).join('');
  bindFnEvents();
  refresh();
}

function setValue(idx, value) {
  try {
    var next = state.items.slice();
    var cand = { fn: state.items[idx].fn,
      enabled: state.items[idx].enabled, value: value };
    next[idx] = validateFilterItem(cand);
    state.items = next;
    refresh();
    /* 仅同步本行数字框，不整体重绘，避免滑杆拖动丢焦点。 */
    var num = document.querySelector('[data-role="fn-num"][data-idx="' + idx + '"]');
    if (num) num.value = value;
    var range = document.querySelector('[data-role="fn-range"][data-idx="' + idx + '"]');
    if (range) range.value = value;
    var defTag = document.querySelector('.cf-fn[data-idx="' + idx + '"] .cf-fn-meta');
    if (defTag) {
      var d = FILTER_DEFS[state.items[idx].fn];
      defTag.innerHTML = '范围 ' + d.min + '–' + d.max + d.unit +
        ' · 默认 ' + d.def + d.unit +
        (value === d.def ? ' · <span class="cf-def-tag">默认不输出</span>' : '') +
        (state.items[idx].enabled ? '' : ' · 已禁用');
    }
  } catch (e) {
    renderFns();
    showMsg(e.message);
  }
}

function bindFnEvents() {
  var wrap = $('cf-fns');
  if (!wrap) return;
  wrap.querySelectorAll('[data-role="fn-toggle"]').forEach(function (el) {
    el.addEventListener('change', function () {
      var err = null;
      try {
        state.items = setFilterEnabled(state.items,
          Number(el.dataset.idx), el.checked);
      } catch (e) { err = e; }
      renderFns();
      if (err) showMsg(err.message);
    });
  });
  wrap.querySelectorAll('[data-role="fn-range"]').forEach(function (el) {
    el.addEventListener('input', function () {
      var num = wrap.querySelector('[data-role="fn-num"][data-idx="' + el.dataset.idx + '"]');
      if (num) num.value = el.value;
      setValue(Number(el.dataset.idx), Number(el.value));
    });
  });
  wrap.querySelectorAll('[data-role="fn-num"]').forEach(function (el) {
    el.addEventListener('change', function () {
      var v = el.value === '' ? NaN : Number(el.value);
      setValue(Number(el.dataset.idx), v);
    });
  });
  wrap.querySelectorAll('[data-role="fn-up"]').forEach(function (el) {
    el.addEventListener('click', function () {
      try {
        state.items = moveFilterItem(state.items, Number(el.dataset.idx), 'up');
      } catch (e) { showMsg(e.message); return; }
      renderFns();
    });
  });
  wrap.querySelectorAll('[data-role="fn-down"]').forEach(function (el) {
    el.addEventListener('click', function () {
      try {
        state.items = moveFilterItem(state.items, Number(el.dataset.idx), 'down');
      } catch (e) { showMsg(e.message); return; }
      renderFns();
    });
  });
}

function bindPageEvents() {
  document.querySelectorAll('[data-preset]').forEach(function (el) {
    el.addEventListener('click', function () {
      try {
        state.items = presetToFullItems(el.dataset.preset);
        state.showOriginal = false;
        syncModeButtons();
      } catch (e) { showMsg(e.message); return; }
      renderFns();
      toast('已载入预设：' + el.textContent.trim());
    });
  });
  var orig = $('cf-show-original');
  var eff = $('cf-show-effect');
  if (orig) orig.addEventListener('click', function () {
    state.showOriginal = true; syncModeButtons(); refresh();
  });
  if (eff) eff.addEventListener('click', function () {
    state.showOriginal = false; syncModeButtons(); refresh();
  });
  var cf = $('cf-copy-filter');
  if (cf) cf.addEventListener('click', function () {
    try { copyText('filter: ' + buildFilterCss(state.items) + ';', '已复制 filter'); }
    catch (e) { showMsg(e.message); }
  });
  var cc = $('cf-copy-css');
  if (cc) cc.addEventListener('click', function () {
    try { copyText(buildCssSnippet(state.items), '已复制完整 CSS'); }
    catch (e) { showMsg(e.message); }
  });
  var dc = $('cf-download-css');
  if (dc) dc.addEventListener('click', function () {
    try { download(suggestExportName('css'), buildCssSnippet(state.items) + '\n'); }
    catch (e) { showMsg(e.message); }
  });
  var dh = $('cf-download-html');
  if (dh) dh.addEventListener('click', function () {
    try {
      download(suggestExportName('html'),
        '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>filter 演示</title>\n</head>\n<body>\n' +
        buildHtmlSnippet(state.items) + '\n</body>\n</html>\n');
    } catch (e) { showMsg(e.message); }
  });
  var le = $('cf-load-example');
  if (le) le.addEventListener('click', function () {
    state.items = presetToFullItems('vintage');
    state.showOriginal = false;
    syncModeButtons();
    renderFns();
    toast('已载入示例：复古预设');
  });
}

function syncModeButtons() {
  var orig = $('cf-show-original');
  var eff = $('cf-show-effect');
  if (orig) orig.disabled = state.showOriginal;
  if (eff) eff.disabled = !state.showOriginal;
}

function init() {
  var stage = $('cf-preview-stage');
  if (stage) stage.innerHTML = '<div id="cf-preview-svg">' + DEMO_SVG + '</div>';
  syncModeButtons();
  bindPageEvents();
  renderFns();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();

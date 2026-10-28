/* CSS 文字阴影生成器（css_text_shadow_generator）- 纯前端本地计算
 * 颜色解析、图层校验与排序、rgba 合成、五预设配置、
 * text-shadow / 完整 CSS / HTML 片段生成，全部为确定性纯函数。
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

/* 2 位小数去尾零：33.50 -> "33.5"，0 -> "0"，-0 归零。 */
function fmtNum(v) {
  var r = Math.round(Number(v) * 100) / 100;
  if (r === 0) r = 0;
  return String(r);
}

var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/* 十六进制颜色：只认 #RGB / #RRGGBB，大小写不限，统一输出小写 #RRGGBB。
 * 颜色名、rgb()、空串、5 位等其它写法一律失败。 */
function parseHexColor(s) {
  if (typeof s !== 'string') fail('color', '颜色须为字符串');
  var t = s.trim();
  if (!COLOR_RE.test(t)) fail('color', '颜色只认 #RGB 或 #RRGGBB 十六进制：' + s);
  var hex = t.slice(1).toLowerCase();
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return '#' + hex;
}

/* hex + 不透明度合成颜色：opacity 为 1 返回小写 #RRGGBB 本身，
 * 小于 1 返回 rgba(r, g, b, opacity)，opacity 去尾零规范化。 */
function hexToRgba(hex, opacity) {
  var norm = parseHexColor(hex);
  checkNum(opacity, 'opacity', '不透明度', 0, 1);
  if (opacity === 1) return norm;
  var r = parseInt(norm.slice(1, 3), 16);
  var g = parseInt(norm.slice(3, 5), 16);
  var b = parseInt(norm.slice(5, 7), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + fmtNum(opacity) + ')';
}

/* 单层校验：返回规范化后的新对象（不改原对象）。
 * offsetX/offsetY -100–100px，blur 0–100px，opacity 0–1，各最多 2 位小数。 */
function validateLayer(layer) {
  if (!layer || typeof layer !== 'object') fail('layer', '图层须为对象');
  return {
    offsetX: checkNum(layer.offsetX, 'offsetX', '水平偏移', -100, 100),
    offsetY: checkNum(layer.offsetY, 'offsetY', '垂直偏移', -100, 100),
    blur: checkNum(layer.blur, 'blur', '模糊', 0, 100),
    color: parseHexColor(layer.color),
    opacity: checkNum(layer.opacity, 'opacity', '不透明度', 0, 1)
  };
}

/* 图层集合：均返回新数组，不改原数组。 */
function checkLayers(layers) {
  if (!Array.isArray(layers)) fail('layers', '图层须为数组');
  if (layers.length < 1 || layers.length > 10) {
    fail('layers', '图层数须为 1–10 层');
  }
  return layers.map(validateLayer);
}

function addLayer(layers, layer) {
  if (!Array.isArray(layers)) fail('layers', '图层须为数组');
  var norm = validateLayer(layer);
  if (layers.length >= 10) fail('layers', '图层已达 10 层上限，不能再加');
  var out = layers.slice();
  out.push(norm);
  return out;
}

function removeLayer(layers, index) {
  if (!Array.isArray(layers)) fail('layers', '图层须为数组');
  if (typeof index !== 'number' || index % 1 !== 0 ||
      index < 0 || index >= layers.length) {
    fail('index', '图层下标越界：' + index);
  }
  if (layers.length - 1 < 1) fail('layers', '图层不能少于 1 层');
  var out = layers.slice();
  out.splice(index, 1);
  return out;
}

function moveLayer(layers, index, direction) {
  if (!Array.isArray(layers)) fail('layers', '图层须为数组');
  if (direction !== 'up' && direction !== 'down') {
    fail('direction', '移动方向只认 up（向首层）或 down（向末层）：' + direction);
  }
  if (typeof index !== 'number' || index % 1 !== 0 ||
      index < 0 || index >= layers.length) {
    fail('index', '图层下标越界：' + index);
  }
  var target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= layers.length) {
    fail('index', '图层已在端点，无法再向' + (direction === 'up' ? '首层' : '末层') + '移动');
  }
  var out = layers.slice();
  var tmp = out[index];
  out[index] = out[target];
  out[target] = tmp;
  return out;
}

/* text-shadow 值：每层 "<x>px <y>px <blur>px <颜色>"，多层以 ", " 连接。 */
function buildTextShadowCss(layers) {
  var norm = checkLayers(layers);
  return norm.map(function (l) {
    return fmtNum(l.offsetX) + 'px ' + fmtNum(l.offsetY) + 'px ' +
      fmtNum(l.blur) + 'px ' + hexToRgba(l.color, l.opacity);
  }).join(', ');
}

/* 完整 CSS：.text-shadow 三行块。 */
function buildCssSnippet(layers) {
  return '.text-shadow {\n  text-shadow: ' + buildTextShadowCss(layers) + ';\n}';
}

/* 预览校验：文字非空、长度 1–50；字号 16–200px 整数；两颜色只认十六进制。 */
function validatePreview(opts) {
  if (!opts || typeof opts !== 'object') fail('preview', '预览配置须为对象');
  if (typeof opts.text !== 'string' || opts.text.trim().length === 0) {
    fail('text', '预览文字不能为空');
  }
  if (opts.text.trim().length > 50) fail('text', '预览文字最多 50 字');
  if (typeof opts.fontSize !== 'number' || opts.fontSize % 1 !== 0 ||
      opts.fontSize < 16 || opts.fontSize > 200) {
    fail('fontSize', '字号须为 16–200px 整数');
  }
  var textColor, backgroundColor;
  try {
    textColor = parseHexColor(opts.textColor);
  } catch (e) {
    fail('textColor', '文字颜色只认 #RGB 或 #RRGGBB 十六进制');
  }
  try {
    backgroundColor = parseHexColor(opts.backgroundColor);
  } catch (e) {
    fail('backgroundColor', '背景颜色只认 #RGB 或 #RRGGBB 十六进制');
  }
  return {
    text: opts.text.trim(),
    fontSize: opts.fontSize,
    textColor: textColor,
    backgroundColor: backgroundColor
  };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* HTML 片段：<style> 内嵌完整 CSS + 预览元素，无 <script>。 */
function buildHtmlSnippet(layers, preview) {
  var p = validatePreview(preview);
  var value = buildTextShadowCss(layers);
  var css = '.text-shadow {\n  text-shadow: ' + value + ';\n' +
    '  font-size: ' + p.fontSize + 'px;\n' +
    '  color: ' + p.textColor + ';\n' +
    '  background-color: ' + p.backgroundColor + ';\n' +
    '  padding: 2rem 1rem;\n  text-align: center;\n}';
  return '<style>\n' + css + '\n</style>\n' +
    '<div class="text-shadow">' + escapeHtml(p.text) + '</div>';
}

var PRESET_ORDER = ['neon', 'three-d', 'retro', 'emboss', 'long-shadow'];

var PRESETS = {
  'neon': {
    layers: [
      { offsetX: 0, offsetY: 0, blur: 5, color: '#ffffff', opacity: 1 },
      { offsetX: 0, offsetY: 0, blur: 10, color: '#00e5ff', opacity: 0.9 },
      { offsetX: 0, offsetY: 0, blur: 20, color: '#00e5ff', opacity: 0.8 },
      { offsetX: 0, offsetY: 0, blur: 40, color: '#00e5ff', opacity: 0.7 },
      { offsetX: 0, offsetY: 0, blur: 80, color: '#00e5ff', opacity: 0.6 }
    ],
    preview: { textColor: '#ffffff', backgroundColor: '#111827' }
  },
  'three-d': {
    layers: [
      { offsetX: 1, offsetY: 1, blur: 0, color: '#999999', opacity: 1 },
      { offsetX: 2, offsetY: 2, blur: 0, color: '#888888', opacity: 1 },
      { offsetX: 3, offsetY: 3, blur: 0, color: '#777777', opacity: 1 },
      { offsetX: 4, offsetY: 4, blur: 0, color: '#666666', opacity: 1 },
      { offsetX: 5, offsetY: 5, blur: 0, color: '#555555', opacity: 1 },
      { offsetX: 6, offsetY: 6, blur: 0, color: '#444444', opacity: 1 }
    ],
    preview: { textColor: '#ffffff', backgroundColor: '#1f2937' }
  },
  'retro': {
    layers: [
      { offsetX: 3, offsetY: 3, blur: 0, color: '#ff9f43', opacity: 1 },
      { offsetX: 6, offsetY: 6, blur: 0, color: '#ee5253', opacity: 1 }
    ],
    preview: { textColor: '#2d3436', backgroundColor: '#f8efba' }
  },
  'emboss': {
    layers: [
      { offsetX: 1, offsetY: 1, blur: 0, color: '#ffffff', opacity: 0.9 },
      { offsetX: -1, offsetY: -1, blur: 0, color: '#000000', opacity: 0.4 }
    ],
    preview: { textColor: '#6b7280', backgroundColor: '#d1d5db' }
  },
  'long-shadow': {
    layers: [
      { offsetX: 1, offsetY: 1, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 2, offsetY: 2, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 3, offsetY: 3, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 4, offsetY: 4, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 5, offsetY: 5, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 6, offsetY: 6, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 7, offsetY: 7, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 8, offsetY: 8, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 9, offsetY: 9, blur: 0, color: '#2d3436', opacity: 1 },
      { offsetX: 10, offsetY: 10, blur: 0, color: '#2d3436', opacity: 1 }
    ],
    preview: { textColor: '#0984e3', backgroundColor: '#dfe6e9' }
  }
};

/* 预设：返回 { name, layers, preview } 的全新副本；未知预设失败。
 * 预览文字默认「文字阴影」，字号默认 72px。 */
function generatePreset(name) {
  var p = PRESETS[name];
  if (!p) fail('preset', '未知预设：' + name);
  return {
    name: name,
    layers: p.layers.map(validateLayer),
    preview: validatePreview({
      text: '文字阴影', fontSize: 72,
      textColor: p.preview.textColor, backgroundColor: p.preview.backgroundColor
    })
  };
}

/* 导出文件名：css -> text-shadow.css，html -> text-shadow-demo.html。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'text-shadow.css';
  if (kind === 'html') return 'text-shadow-demo.html';
  fail('kind', '未知导出类型：' + kind);
}

var API = {
  parseHexColor: parseHexColor, hexToRgba: hexToRgba,
  validateLayer: validateLayer, addLayer: addLayer,
  removeLayer: removeLayer, moveLayer: moveLayer,
  buildTextShadowCss: buildTextShadowCss, buildCssSnippet: buildCssSnippet,
  validatePreview: validatePreview, buildHtmlSnippet: buildHtmlSnippet,
  generatePreset: generatePreset, suggestExportName: suggestExportName,
  fmtNum: fmtNum, PRESET_ORDER: PRESET_ORDER
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.CssTextShadowGenerator = API;

/* ---------------- 浏览器 DOM 逻辑 ---------------- */
function $(id) { return document.getElementById(id); }

var preset0 = generatePreset('neon');
var state = { layers: preset0.layers, preview: preset0.preview };

function showMsg(text) {
  var el = $('ts-msg');
  if (el) el.textContent = text || '';
}
function toast(text) {
  var el = $('ts-toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
}
function setExportEnabled(on) {
  ['ts-copy-value', 'ts-copy-css', 'ts-download-css', 'ts-download-html']
    .forEach(function (id) { var b = $(id); if (b) b.disabled = !on; });
}

/* 刷新代码区与预览；非法时红字提示并禁用导出，预览保留上次可用样式。 */
function refresh() {
  try {
    var value = buildTextShadowCss(state.layers);
    var css = buildCssSnippet(state.layers);
    var p = validatePreview(state.preview);
    var vEl = $('ts-code-value');
    var cEl = $('ts-code-css');
    if (vEl) vEl.textContent = 'text-shadow: ' + value + ';';
    if (cEl) cEl.textContent = css;
    var prev = $('ts-preview-el');
    if (prev) {
      prev.textContent = p.text;
      prev.style.fontSize = p.fontSize + 'px';
      prev.style.color = p.textColor;
      prev.style.backgroundColor = p.backgroundColor;
      prev.style.textShadow = value;
    }
    var count = $('ts-layer-count');
    if (count) count.textContent = state.layers.length + ' / 10 层';
    showMsg('');
    setExportEnabled(true);
  } catch (e) {
    showMsg(e.message);
    setExportEnabled(false);
  }
}

var LAYER_FIELDS = [
  { key: 'offsetX', label: '水平偏移 X', min: -100, max: 100, step: 1, unit: 'px' },
  { key: 'offsetY', label: '垂直偏移 Y', min: -100, max: 100, step: 1, unit: 'px' },
  { key: 'blur', label: '模糊', min: 0, max: 100, step: 1, unit: 'px' },
  { key: 'opacity', label: '不透明度', min: 0, max: 1, step: 0.01, unit: '' }
];

function layerCardHtml(l, idx) {
  var html = '<div class="ts-layer" data-idx="' + idx + '">' +
    '<div class="ts-layer-head"><b>图层 ' + (idx + 1) +
    (idx === 0 ? ' · 最上层' : '') + '</b>' +
    '<span class="ts-layer-actions">' +
    '<button class="ts-btn ts-btn-small" type="button" data-role="layer-up" data-idx="' + idx + '"' +
    (idx === 0 ? ' disabled' : '') + '>↑ 上移</button>' +
    '<button class="ts-btn ts-btn-small" type="button" data-role="layer-down" data-idx="' + idx + '"' +
    (idx === state.layers.length - 1 ? ' disabled' : '') + '>↓ 下移</button>' +
    '<button class="ts-btn ts-btn-small" type="button" data-role="layer-del" data-idx="' + idx + '">删除</button>' +
    '</span></div>';
  LAYER_FIELDS.forEach(function (fd) {
    html += '<div class="ts-row"><label>' + fd.label + '</label>' +
      '<input type="range" data-role="field-range" data-idx="' + idx +
      '" data-key="' + fd.key + '" min="' + fd.min + '" max="' + fd.max +
      '" step="' + fd.step + '" value="' + l[fd.key] + '">' +
      '<input type="number" data-role="field-num" data-idx="' + idx +
      '" data-key="' + fd.key + '" min="' + fd.min + '" max="' + fd.max +
      '" step="' + fd.step + '" value="' + l[fd.key] + '">' +
      '<span>' + fd.unit + '</span></div>';
  });
  html += '<div class="ts-row"><label>颜色</label>' +
    '<input type="color" data-role="layer-color" data-idx="' + idx +
    '" value="' + l.color + '">' +
    '<input type="text" data-role="layer-color-text" data-idx="' + idx +
    '" value="' + l.color + '" placeholder="#RGB 或 #RRGGBB"></div></div>';
  return html;
}

function renderLayers() {
  var wrap = $('ts-layers');
  if (!wrap) return;
  wrap.innerHTML = state.layers.map(layerCardHtml).join('');
  var addBtn = $('ts-add-layer');
  if (addBtn) addBtn.disabled = state.layers.length >= 10;
  var limit = $('ts-limit-hint');
  if (limit) {
    limit.textContent = state.layers.length >= 10 ?
      '已达 10 层上限：不能再加图层，请先删除或合并已有图层。' : '';
  }
  bindLayerEvents();
  refresh();
}

function setField(idx, key, value, rerender) {
  try {
    var next = state.layers.slice();
    var cand = {};
    cand.offsetX = state.layers[idx].offsetX;
    cand.offsetY = state.layers[idx].offsetY;
    cand.blur = state.layers[idx].blur;
    cand.color = state.layers[idx].color;
    cand.opacity = state.layers[idx].opacity;
    cand[key] = value;
    next[idx] = validateLayer(cand);
    state.layers = next;
    refresh();
    if (rerender) renderLayers();
  } catch (e) {
    showMsg(e.message);
    if (rerender) renderLayers();
  }
}

function bindLayerEvents() {
  var wrap = $('ts-layers');
  if (!wrap) return;
  wrap.querySelectorAll('[data-role="field-range"]').forEach(function (el) {
    el.addEventListener('input', function () {
      var num = wrap.querySelector('[data-role="field-num"][data-idx="' + el.dataset.idx +
        '"][data-key="' + el.dataset.key + '"]');
      if (num) num.value = el.value;
      setField(Number(el.dataset.idx), el.dataset.key, Number(el.value), false);
    });
    el.addEventListener('change', function () { renderLayers(); });
  });
  wrap.querySelectorAll('[data-role="field-num"]').forEach(function (el) {
    el.addEventListener('change', function () {
      setField(Number(el.dataset.idx), el.dataset.key, Number(el.value), true);
    });
  });
  wrap.querySelectorAll('[data-role="layer-color"]').forEach(function (el) {
    el.addEventListener('input', function () {
      var txt = wrap.querySelector('[data-role="layer-color-text"][data-idx="' + el.dataset.idx + '"]');
      if (txt) txt.value = el.value;
      setField(Number(el.dataset.idx), 'color', el.value, false);
    });
  });
  wrap.querySelectorAll('[data-role="layer-color-text"]').forEach(function (el) {
    el.addEventListener('change', function () {
      setField(Number(el.dataset.idx), 'color', el.value.trim(), true);
    });
  });
  wrap.querySelectorAll('[data-role="layer-up"]').forEach(function (el) {
    el.addEventListener('click', function () {
      try {
        state.layers = moveLayer(state.layers, Number(el.dataset.idx), 'up');
        renderLayers();
      } catch (e) { showMsg(e.message); }
    });
  });
  wrap.querySelectorAll('[data-role="layer-down"]').forEach(function (el) {
    el.addEventListener('click', function () {
      try {
        state.layers = moveLayer(state.layers, Number(el.dataset.idx), 'down');
        renderLayers();
      } catch (e) { showMsg(e.message); }
    });
  });
  wrap.querySelectorAll('[data-role="layer-del"]').forEach(function (el) {
    el.addEventListener('click', function () {
      try {
        state.layers = removeLayer(state.layers, Number(el.dataset.idx));
        renderLayers();
      } catch (e) { showMsg(e.message); }
    });
  });
}

function loadPreset(name) {
  try {
    var p = generatePreset(name);
    state.layers = p.layers;
    state.preview = p.preview;
    syncPreviewInputs();
    renderLayers();
  } catch (e) { showMsg(e.message); }
}

function syncPreviewInputs() {
  var p = state.preview;
  var t = $('ts-preview-text'); if (t) t.value = p.text;
  var fs = $('ts-font-size'); if (fs) fs.value = p.fontSize;
  var fsr = $('ts-font-size-range'); if (fsr) fsr.value = p.fontSize;
  var tc = $('ts-text-color'); if (tc) tc.value = p.textColor;
  var tct = $('ts-text-color-text'); if (tct) tct.value = p.textColor;
  var bc = $('ts-bg-color'); if (bc) bc.value = p.backgroundColor;
  var bct = $('ts-bg-color-text'); if (bct) bct.value = p.backgroundColor;
}

function setPreview(patch, rerender) {
  try {
    var cand = {
      text: state.preview.text, fontSize: state.preview.fontSize,
      textColor: state.preview.textColor, backgroundColor: state.preview.backgroundColor
    };
    Object.keys(patch).forEach(function (k) { cand[k] = patch[k]; });
    state.preview = validatePreview(cand);
    refresh();
    if (rerender) syncPreviewInputs();
  } catch (e) {
    showMsg(e.message);
    if (rerender) syncPreviewInputs();
  }
}

function copyText(text, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      toast(okMsg);
    }, function () { toast('复制失败，请手动选中代码区内容复制'); });
  } else {
    toast('浏览器不支持一键复制，请手动选中代码区内容复制');
  }
}

function download(filename, content) {
  var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('已下载 ' + filename);
}

document.querySelectorAll('[data-preset]').forEach(function (btn) {
  btn.addEventListener('click', function () { loadPreset(btn.dataset.preset); });
});
var addBtn = $('ts-add-layer');
if (addBtn) addBtn.addEventListener('click', function () {
  try {
    state.layers = addLayer(state.layers,
      { offsetX: 0, offsetY: 0, blur: 0, color: '#000000', opacity: 1 });
    renderLayers();
  } catch (e) { showMsg(e.message); }
});

var pText = $('ts-preview-text');
if (pText) pText.addEventListener('change', function () {
  setPreview({ text: pText.value }, true);
});
var fsRange = $('ts-font-size-range');
if (fsRange) {
  fsRange.addEventListener('input', function () {
    var num = $('ts-font-size');
    if (num) num.value = fsRange.value;
    setPreview({ fontSize: Number(fsRange.value) }, false);
  });
  fsRange.addEventListener('change', function () { syncPreviewInputs(); });
}
var fsNum = $('ts-font-size');
if (fsNum) fsNum.addEventListener('change', function () {
  setPreview({ fontSize: Number(fsNum.value) }, true);
});
var tcPicker = $('ts-text-color');
if (tcPicker) tcPicker.addEventListener('input', function () {
  var t = $('ts-text-color-text'); if (t) t.value = tcPicker.value;
  setPreview({ textColor: tcPicker.value }, false);
});
var tcText = $('ts-text-color-text');
if (tcText) tcText.addEventListener('change', function () {
  setPreview({ textColor: tcText.value.trim() }, true);
});
var bcPicker = $('ts-bg-color');
if (bcPicker) bcPicker.addEventListener('input', function () {
  var t = $('ts-bg-color-text'); if (t) t.value = bcPicker.value;
  setPreview({ backgroundColor: bcPicker.value }, false);
});
var bcText = $('ts-bg-color-text');
if (bcText) bcText.addEventListener('change', function () {
  setPreview({ backgroundColor: bcText.value.trim() }, true);
});

var cValue = $('ts-copy-value');
if (cValue) cValue.addEventListener('click', function () {
  try { copyText('text-shadow: ' + buildTextShadowCss(state.layers) + ';', 'text-shadow 已复制'); }
  catch (e) { showMsg(e.message); }
});
var cCss = $('ts-copy-css');
if (cCss) cCss.addEventListener('click', function () {
  try { copyText(buildCssSnippet(state.layers), '完整 CSS 已复制'); }
  catch (e) { showMsg(e.message); }
});
var dCss = $('ts-download-css');
if (dCss) dCss.addEventListener('click', function () {
  try { download(suggestExportName('css'), buildCssSnippet(state.layers) + '\n'); }
  catch (e) { showMsg(e.message); }
});
var dHtml = $('ts-download-html');
if (dHtml) dHtml.addEventListener('click', function () {
  try {
    download(suggestExportName('html'),
      '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n' +
      '<title>文字阴影演示</title>\n</head>\n<body>\n' +
      buildHtmlSnippet(state.layers, state.preview) + '\n</body>\n</html>\n');
  } catch (e) { showMsg(e.message); }
});
var example = $('ts-load-example');
if (example) example.addEventListener('click', function () { loadPreset('neon'); });

renderLayers();

})();

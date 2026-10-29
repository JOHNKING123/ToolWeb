/* CSS 滚动条样式生成器（css_scrollbar_generator）- 纯前端本地计算
 * 颜色解析、滚动条校验、WebKit 与 Firefox 双轨 CSS 合成、完整 CSS /
 * HTML 片段生成、六预设配置、导出命名，全部为确定性纯函数。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、
 * 不静默取整、不静默截断。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM 并挂 window。
 * 零网络请求：本文件不发起任何 fetch / XHR。
 * 口径：只做滚动条样式声明，不做 JS 模拟滚动条、不做滚动进度条、
 * 不做渐变滑块（轨道／滑块均为纯色）。 */
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

/* 滚动条校验：颜色失败时 err.field 指回具体字段名（trackColor /
 * thumbColor / thumbHoverColor），数值失败指回 width / trackRadius /
 * thumbRadius；缺失字段同样失败（undefined 不是有效数字／颜色）。
 * 返回规范化后的新对象（不改原对象；颜色统一小写）。 */
function parseColorField(value, field, label) {
  try {
    return parseHexColor(value);
  } catch (e) {
    fail(field, label + '：' + e.message);
  }
}
function validateScrollbar(cfg) {
  if (!cfg || typeof cfg !== 'object') fail('scrollbar', '滚动条参数须为对象');
  return {
    width: checkNum(cfg.width, 'width', '宽度', 2, 32),
    trackColor: parseColorField(cfg.trackColor, 'trackColor', '轨道色'),
    trackRadius: checkNum(cfg.trackRadius, 'trackRadius', '轨道圆角', 0, 32),
    thumbColor: parseColorField(cfg.thumbColor, 'thumbColor', '滑块色'),
    thumbRadius: checkNum(cfg.thumbRadius, 'thumbRadius', '滑块圆角', 0, 32),
    thumbHoverColor: parseColorField(cfg.thumbHoverColor, 'thumbHoverColor', '悬停色')
  };
}

/* WebKit 4 行：选择器固定 .scroll-area，width 与 height 同值，
 * hover 行只含背景色。 */
function buildWebkitCss(cfg) {
  var v = validateScrollbar(cfg);
  var w = fmtNum(v.width) + 'px';
  return '.scroll-area::-webkit-scrollbar { width: ' + w + '; height: ' + w + '; }\n' +
    '.scroll-area::-webkit-scrollbar-track { background: ' + v.trackColor +
    '; border-radius: ' + fmtNum(v.trackRadius) + 'px; }\n' +
    '.scroll-area::-webkit-scrollbar-thumb { background: ' + v.thumbColor +
    '; border-radius: ' + fmtNum(v.thumbRadius) + 'px; }\n' +
    '.scroll-area::-webkit-scrollbar-thumb:hover { background: ' +
    v.thumbHoverColor + '; }';
}

/* Firefox 4 行：width ≤ 8 → thin，否则 auto；scrollbar-color 为
 * thumb＋track；绝不输出 border-radius（Firefox 不支持圆角）。 */
function buildFirefoxCss(cfg) {
  var v = validateScrollbar(cfg);
  var mode = v.width <= 8 ? 'thin' : 'auto';
  return '.scroll-area {\n' +
    '  scrollbar-width: ' + mode + ';\n' +
    '  scrollbar-color: ' + v.thumbColor + ' ' + v.trackColor + ';\n' +
    '}';
}

/* 完整 CSS：WebKit 4 行＋空行＋Firefox 4 行，共 9 行。 */
function buildCssSnippet(cfg) {
  var v = validateScrollbar(cfg);
  return buildWebkitCss(v) + '\n\n' + buildFirefoxCss(v);
}

/* 内置中文示例文字：多段，足以在 240px 面板里纵向滚动。 */
var SAMPLE_PARAGRAPHS = [
  '滚动条是界面里最容易被忽视的细节：默认的浅灰色细条放在深色界面上会格外扎眼，放在浅色界面上又常常和内容混在一起。',
  '手写跨浏览器滚动条样式要同时写对两套声明：WebKit 系的一串伪元素，以及 Firefox 的两条标准属性，漏掉 hover 态是最常见的疏忽。',
  '先用预设找一个顺眼的起点：浅色适合大多数浅色页面，深色适合深色模式，细条适合紧凑布局，圆润适合圆角卡片风格。',
  '再微调宽度与颜色：宽度决定滑块的粗细与手感，轨道色决定它与背景的对比，滑块色决定它在页面里的存在感。',
  '圆角只在 WebKit 系浏览器里生效：轨道圆角与滑块圆角可以做出药丸形的滑块，但 Firefox 会直接忽略圆角，只认宽度档位与颜色。',
  '悬停色是给鼠标用户的反馈：把鼠标移到滑块上，颜色变深一点，用户就知道这条东西可以拖动，而不是页面上的一道装饰线。',
  '宽度小于等于 8px 时 Firefox 输出 thin，大于 8px 输出 auto：这是宽度到 scrollbar-width 档位的映射，不是像素宽度本身。',
  '复制完整 CSS 后，把 .scroll-area 换成你自己的容器类名，两套声明一起粘贴，就能在 Chrome、Edge、Safari 与 Firefox 里得到一致的滚动条。'
];

/* HTML 片段：<style> 内嵌完整 CSS＋预览区样式（.scroll-area 高 240px、
 * overflow-y auto、内置边框）＋<div class="scroll-area"> 内含多段内置
 * 中文示例文字；无 <script>。 */
function buildHtmlSnippet(cfg) {
  var v = validateScrollbar(cfg);
  var css = buildCssSnippet(v);
  var body = SAMPLE_PARAGRAPHS.map(function (p) {
    return '    <p>' + p + '</p>';
  }).join('\n');
  return '<style>\n' + css + '\n' +
    '.scroll-area {\n' +
    '  height: 240px;\n' +
    '  overflow-y: auto;\n' +
    '  border: 1px solid #d1d5db;\n' +
    '  padding: 16px;\n' +
    '}\n</style>\n' +
    '<div class="scroll-area">\n' + body + '\n</div>';
}

/* 六预设：返回 { name, cfg } 的全新副本。 */
var PRESETS = {
  light: { label: '浅色',
    cfg: { width: 12, trackColor: '#f1f1f1', trackRadius: 6,
      thumbColor: '#c1c1c1', thumbRadius: 6, thumbHoverColor: '#a8a8a8' } },
  dark: { label: '深色',
    cfg: { width: 12, trackColor: '#1e1e1e', trackRadius: 6,
      thumbColor: '#4d4d4d', thumbRadius: 6, thumbHoverColor: '#6e6e6e' } },
  thin: { label: '细条',
    cfg: { width: 6, trackColor: '#f5f5f5', trackRadius: 3,
      thumbColor: '#bdbdbd', thumbRadius: 3, thumbHoverColor: '#9e9e9e' } },
  rounded: { label: '圆润',
    cfg: { width: 16, trackColor: '#e8e8e8', trackRadius: 8,
      thumbColor: '#888888', thumbRadius: 8, thumbHoverColor: '#666666' } },
  blue: { label: '蓝色',
    cfg: { width: 10, trackColor: '#e3f2fd', trackRadius: 5,
      thumbColor: '#64b5f6', thumbRadius: 5, thumbHoverColor: '#42a5f5' } },
  contrast: { label: '高对比',
    cfg: { width: 14, trackColor: '#ffffff', trackRadius: 0,
      thumbColor: '#000000', thumbRadius: 0, thumbHoverColor: '#333333' } }
};
var PRESET_ORDER = ['light', 'dark', 'thin', 'rounded', 'blue', 'contrast'];

function generatePreset(name) {
  var p = PRESETS[name];
  if (!p) fail('preset', '未知预设：' + name);
  return { name: name, cfg: validateScrollbar(p.cfg) };
}

/* 导出文件名：css -> scrollbar.css，html -> scrollbar-demo.html；其它失败。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'scrollbar.css';
  if (kind === 'html') return 'scrollbar-demo.html';
  fail('kind', '未知导出类型：' + kind);
}

var API = {
  parseHexColor: parseHexColor, validateScrollbar: validateScrollbar,
  buildWebkitCss: buildWebkitCss, buildFirefoxCss: buildFirefoxCss,
  buildCssSnippet: buildCssSnippet, buildHtmlSnippet: buildHtmlSnippet,
  generatePreset: generatePreset, suggestExportName: suggestExportName,
  fmtNum: fmtNum, PRESETS: PRESETS, PRESET_ORDER: PRESET_ORDER,
  SAMPLE_PARAGRAPHS: SAMPLE_PARAGRAPHS
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
  return;
}
if (typeof window !== 'undefined') window.CssScrollbarGenerator = API;

/* ---------------- 浏览器 DOM 逻辑 ---------------- */
function $(id) { return document.getElementById(id); }

var state = (function () {
  return { cfg: generatePreset('light').cfg };
})();

/* 编辑行定义：key、中文名、单位、范围、步进、字段类型。 */
var ROWS = [
  { key: 'width', label: '宽度', unit: 'px', min: 2, max: 32, step: 1, kind: 'num' },
  { key: 'trackColor', label: '轨道色', unit: '', min: 0, max: 0, step: 1, kind: 'color' },
  { key: 'trackRadius', label: '轨道圆角', unit: 'px', min: 0, max: 32, step: 1, kind: 'num' },
  { key: 'thumbColor', label: '滑块色', unit: '', min: 0, max: 0, step: 1, kind: 'color' },
  { key: 'thumbRadius', label: '滑块圆角', unit: 'px', min: 0, max: 32, step: 1, kind: 'num' },
  { key: 'thumbHoverColor', label: '悬停色（鼠标移到滑块上时的颜色）', unit: '', min: 0, max: 0, step: 1, kind: 'color' }
];

function showMsg(text) {
  var el = $('sb-msg');
  if (el) el.textContent = text || '';
}
function toast(text) {
  var el = $('sb-toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
}
function setExportEnabled(on) {
  ['sb-copy-webkit', 'sb-copy-css', 'sb-download-css', 'sb-download-html']
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
 * 预览 <style> 内只注入 buildCssSnippet 产出的校验后 CSS，杜绝注入。 */
function refresh() {
  try {
    var v = validateScrollbar(state.cfg);
    var webkit = $('sb-code-webkit');
    var firefox = $('sb-code-firefox');
    if (webkit) webkit.textContent = buildWebkitCss(v);
    if (firefox) firefox.textContent = buildFirefoxCss(v);
    var styleEl = $('sb-preview-style');
    if (styleEl) styleEl.textContent = buildCssSnippet(v);
    showMsg('');
    setExportEnabled(true);
  } catch (e) {
    showMsg(e.message);
    setExportEnabled(false);
  }
}

function rowHtml(row) {
  var val = state.cfg[row.key];
  if (row.kind === 'color') {
    return '<div class="sb-row-wrap"><div class="sb-row-label"><b>' + row.label +
      '</b></div><div class="sb-row">' +
      '<input type="color" data-role="sb-color" data-key="' + row.key +
      '" value="' + val + '">' +
      '<input type="text" data-role="sb-hex" data-key="' + row.key +
      '" value="' + val + '" placeholder="#RRGGBB">' +
      '<span class="sb-hint">只接受 #RGB / #RRGGBB</span></div></div>';
  }
  return '<div class="sb-row-wrap"><div class="sb-row-label"><b>' + row.label +
    '</b><span class="sb-hint">范围 ' + row.min + '–' + row.max + row.unit +
    '，最多 2 位小数</span></div><div class="sb-row">' +
    '<input type="range" data-role="sb-range" data-key="' + row.key +
    '" min="' + row.min + '" max="' + row.max + '" step="' + row.step +
    '" value="' + val + '">' +
    '<input type="number" data-role="sb-num" data-key="' + row.key +
    '" min="' + row.min + '" max="' + row.max + '" step="0.01" value="' + val + '">' +
    '<span>' + row.unit + '</span></div></div>';
}

function renderEditor() {
  var wrap = $('sb-editor');
  if (!wrap) return;
  wrap.innerHTML = ROWS.map(rowHtml).join('');
  bindEditorEvents();
  refresh();
}

function setField(key, value) {
  try {
    var cand = {};
    Object.keys(state.cfg).forEach(function (k) { cand[k] = state.cfg[k]; });
    cand[key] = value;
    state.cfg = validateScrollbar(cand);
    refresh();
    var num = document.querySelector('[data-role="sb-num"][data-key="' + key + '"]');
    if (num) num.value = value;
    var range = document.querySelector('[data-role="sb-range"][data-key="' + key + '"]');
    if (range) range.value = value;
    var hex = document.querySelector('[data-role="sb-hex"][data-key="' + key + '"]');
    if (hex) hex.value = state.cfg[key];
    var color = document.querySelector('[data-role="sb-color"][data-key="' + key + '"]');
    if (color) color.value = state.cfg[key];
  } catch (e) {
    renderEditor();
    showMsg(e.message);
  }
}

function bindEditorEvents() {
  var wrap = $('sb-editor');
  if (!wrap) return;
  wrap.querySelectorAll('[data-role="sb-range"]').forEach(function (el) {
    el.addEventListener('input', function () {
      var num = wrap.querySelector('[data-role="sb-num"][data-key="' + el.dataset.key + '"]');
      if (num) num.value = el.value;
      setField(el.dataset.key, Number(el.value));
    });
  });
  wrap.querySelectorAll('[data-role="sb-num"]').forEach(function (el) {
    el.addEventListener('change', function () {
      var v = el.value === '' ? NaN : Number(el.value);
      setField(el.dataset.key, v);
    });
  });
  wrap.querySelectorAll('[data-role="sb-color"]').forEach(function (el) {
    el.addEventListener('input', function () {
      setField(el.dataset.key, el.value);
    });
  });
  wrap.querySelectorAll('[data-role="sb-hex"]').forEach(function (el) {
    el.addEventListener('change', function () {
      setField(el.dataset.key, el.value);
    });
  });
}

function applyPreset(name) {
  try {
    state.cfg = generatePreset(name).cfg;
  } catch (e) { showMsg(e.message); return; }
  renderEditor();
  toast('已载入预设：' + PRESETS[name].label);
}

function bindPageEvents() {
  document.querySelectorAll('[data-preset]').forEach(function (el) {
    el.addEventListener('click', function () { applyPreset(el.dataset.preset); });
  });
  var cw = $('sb-copy-webkit');
  if (cw) cw.addEventListener('click', function () {
    try { copyText(buildWebkitCss(state.cfg), '已复制 WebKit 代码'); }
    catch (e) { showMsg(e.message); }
  });
  var cc = $('sb-copy-css');
  if (cc) cc.addEventListener('click', function () {
    try { copyText(buildCssSnippet(state.cfg), '已复制完整 CSS'); }
    catch (e) { showMsg(e.message); }
  });
  var dc = $('sb-download-css');
  if (dc) dc.addEventListener('click', function () {
    try { download(suggestExportName('css'), buildCssSnippet(state.cfg) + '\n'); }
    catch (e) { showMsg(e.message); }
  });
  var dh = $('sb-download-html');
  if (dh) dh.addEventListener('click', function () {
    try {
      download(suggestExportName('html'),
        '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>滚动条样式演示</title>\n</head>\n<body>\n' +
        buildHtmlSnippet(state.cfg) + '\n</body>\n</html>\n');
    } catch (e) { showMsg(e.message); }
  });
  var le = $('sb-load-example');
  if (le) le.addEventListener('click', function () {
    applyPreset('light');
    toast('已载入示例：浅色预设');
  });
}

function init() {
  bindPageEvents();
  renderEditor();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();

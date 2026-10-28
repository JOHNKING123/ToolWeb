/* CSS Flexbox 可视化生成器（css_flexbox_generator）- 纯前端本地计算
 * 只做单维 flex 布局，不做 Grid、不做多断点批量导出；条目上限 12；
 * gap 只用 px、basis 只认 auto / px / %；不直接生成 Tailwind 类。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、不静默取整。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* 抛错：err.field 给出字段名。 */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

function checkEnum(v, allowed, field) {
  if (typeof v !== 'string' || allowed.indexOf(v) < 0) fail(field, '非法枚举值：' + v);
  return v;
}

function checkInt(v, field, min, max) {
  if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v) fail(field, '须为整数');
  if (v < min || v > max) fail(field, '整数超出范围（' + min + '–' + max + '）');
  return v;
}

var DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse'];
var WRAPS = ['nowrap', 'wrap', 'wrap-reverse'];
var JUSTIFIES = ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'];
var ALIGN_ITEMS = ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'];
var ALIGN_CONTENTS = ['stretch', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around'];
var ALIGN_SELFS = ['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline'];

/* 校验容器配置，返回规范化副本。 */
function checkContainer(c) {
  if (!c || typeof c !== 'object') fail('container', '容器配置非法');
  return {
    flexDirection: checkEnum(c.flexDirection, DIRECTIONS, 'flexDirection'),
    flexWrap: checkEnum(c.flexWrap, WRAPS, 'flexWrap'),
    justifyContent: checkEnum(c.justifyContent, JUSTIFIES, 'justifyContent'),
    alignItems: checkEnum(c.alignItems, ALIGN_ITEMS, 'alignItems'),
    alignContent: checkEnum(c.alignContent, ALIGN_CONTENTS, 'alignContent'),
    gap: checkInt(c.gap, 'gap', 0, 64)
  };
}

/* basis 解析：'auto' / '0' / '<数值>px'（0–1000）/ '<数值>%'（0–100），最多 2 位小数。
 * 返回规范化输出串（去尾零）；非法单位（如 em）与越界均抛错。 */
function parseBasis(basis) {
  if (typeof basis !== 'string') fail('basis', 'basis 须为字符串');
  var t = basis.trim();
  if (t === 'auto') return 'auto';
  if (t === '0') return '0';
  var m = /^(\d+(\.\d{1,2})?)(px|%)$/.exec(t);
  if (!m) fail('basis', 'basis 只认 auto / 0 / 数值px / 数值%，如 200px、30%');
  var v = parseFloat(m[1]);
  var unit = m[3];
  if (unit === 'px' && v > 1000) fail('basis', 'basis px 数值超出范围（0–1000）');
  if (unit === '%' && v > 100) fail('basis', 'basis % 数值超出范围（0–100）');
  var s = String(Math.round(v * 100) / 100);
  return s + unit;
}

/* 校验单条目配置，返回规范化副本。 */
function checkItem(item) {
  if (!item || typeof item !== 'object') fail('item', '条目配置非法');
  return {
    grow: checkInt(item.grow, 'grow', 0, 10),
    shrink: checkInt(item.shrink, 'shrink', 0, 10),
    basis: parseBasis(item.basis),
    order: checkInt(item.order, 'order', -10, 10),
    alignSelf: checkEnum(item.alignSelf, ALIGN_SELFS, 'alignSelf')
  };
}

/* 校验条目数组：1–12 项。 */
function checkItems(items) {
  if (!Array.isArray(items)) fail('items', '条目须为数组');
  if (items.length < 1 || items.length > 12) fail('items', '条目数须为 1–12');
  return items.map(checkItem);
}

function defaultItem() {
  return { grow: 0, shrink: 1, basis: 'auto', order: 0, alignSelf: 'auto' };
}

function defaultContainer() {
  return { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'stretch', alignContent: 'stretch', gap: 16 };
}

/* buildContainerCss(c)：输出 .flex-container 声明块，首行为 display: flex; */
function buildContainerCss(c) {
  var v = checkContainer(c);
  return '.flex-container {\n' +
    '  display: flex;\n' +
    '  flex-direction: ' + v.flexDirection + ';\n' +
    '  flex-wrap: ' + v.flexWrap + ';\n' +
    '  justify-content: ' + v.justifyContent + ';\n' +
    '  align-items: ' + v.alignItems + ';\n' +
    '  align-content: ' + v.alignContent + ';\n' +
    '  gap: ' + v.gap + 'px;\n' +
    '}';
}

/* 条目声明体（不含选择器行），供 buildItemCss / buildFlexCss 共用。 */
function itemBody(item) {
  var v = checkItem(item);
  return '  flex: ' + v.grow + ' ' + v.shrink + ' ' + v.basis + ';\n' +
    '  order: ' + v.order + ';\n' +
    '  align-self: ' + v.alignSelf + ';\n';
}

/* buildItemCss(item)：输出单条目声明块（选择器 .flex-item）。 */
function buildItemCss(item) {
  return '.flex-item {\n' + itemBody(item) + '}';
}

/* buildFlexCss(container, items)：容器块＋.flex-item-1…N 各条目块，类名连续。 */
function buildFlexCss(container, items) {
  var list = checkItems(items);
  var blocks = [buildContainerCss(container)];
  for (var i = 0; i < list.length; i++) {
    blocks.push('.flex-item-' + (i + 1) + ' {\n' + itemBody(list[i]) + '}');
  }
  return blocks.join('\n\n');
}

/* buildHtmlSnippet(container, items)：<style> 内嵌完整 CSS＋容器 div 内 N 个条目 div。 */
function buildHtmlSnippet(container, items) {
  var css = buildFlexCss(container, items);
  var list = checkItems(items);
  var divs = [];
  for (var i = 0; i < list.length; i++) {
    divs.push('  <div class="flex-item flex-item-' + (i + 1) + '">' + (i + 1) + '</div>');
  }
  return '<style>\n' + css + '\n</style>\n' +
    '<div class="flex-container">\n' + divs.join('\n') + '\n</div>';
}

var PRESETS = {
  'navbar': {
    container: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', alignItems: 'center', alignContent: 'stretch', gap: 16 },
    items: [
      { grow: 0, shrink: 0, basis: '100px', order: 0, alignSelf: 'auto' },
      { grow: 1, shrink: 1, basis: 'auto', order: 0, alignSelf: 'auto' },
      { grow: 0, shrink: 0, basis: '100px', order: 0, alignSelf: 'auto' }
    ]
  },
  'center': {
    container: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', alignItems: 'center', alignContent: 'center', gap: 0 },
    items: [defaultItem()]
  },
  'cards-wrap': {
    container: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'stretch', alignContent: 'stretch', gap: 16 },
    items: [
      { grow: 1, shrink: 1, basis: '30%', order: 0, alignSelf: 'auto' },
      { grow: 1, shrink: 1, basis: '30%', order: 0, alignSelf: 'auto' },
      { grow: 1, shrink: 1, basis: '30%', order: 0, alignSelf: 'auto' },
      { grow: 1, shrink: 1, basis: '30%', order: 0, alignSelf: 'auto' },
      { grow: 1, shrink: 1, basis: '30%', order: 0, alignSelf: 'auto' },
      { grow: 1, shrink: 1, basis: '30%', order: 0, alignSelf: 'auto' }
    ]
  },
  'sidebar': {
    container: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'stretch', alignContent: 'stretch', gap: 0 },
    items: [
      { grow: 0, shrink: 0, basis: '200px', order: 0, alignSelf: 'auto' },
      { grow: 1, shrink: 1, basis: 'auto', order: 0, alignSelf: 'auto' }
    ]
  }
};

/* generatePreset(name)：返回 { container, items } 深拷贝；未知 name 抛错。 */
function generatePreset(name) {
  if (!PRESETS.hasOwnProperty(name)) fail('preset', '未知预设：' + name);
  return JSON.parse(JSON.stringify(PRESETS[name]));
}

/* suggestExportName(kind)：css → flexbox.css，html → flexbox-demo.html。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'flexbox.css';
  if (kind === 'html') return 'flexbox-demo.html';
  fail('kind', '未知导出类型：' + kind);
}

var api = {
  buildContainerCss: buildContainerCss,
  buildItemCss: buildItemCss,
  buildFlexCss: buildFlexCss,
  buildHtmlSnippet: buildHtmlSnippet,
  generatePreset: generatePreset,
  suggestExportName: suggestExportName,
  parseBasis: parseBasis,
  defaultItem: defaultItem,
  defaultContainer: defaultContainer
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.FlexboxGenerator = api;
}

/* ---------- 浏览器 DOM 逻辑（node 下 document 不存在时跳过） ---------- */
if (typeof document === 'undefined') return;

function $(id) { return document.getElementById(id); }

var state = {
  container: defaultContainer(),
  items: [defaultItem(), defaultItem(), defaultItem()],
  selected: 0
};

var COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316', '#14b8a6', '#8b5cf6'];

function showError(msg) {
  var el = $('cfb-error');
  if (el) el.textContent = msg || '';
}

function toast(msg) {
  var el = $('cfb-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 2200);
}

function copyText(text, okMsg) {
  function fallback() {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast(okMsg);
    } catch (e) { showError('复制失败，请手动选中代码区内容复制'); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
  } else { fallback(); }
}

function downloadFile(name, text, type) {
  var blob = new Blob([text], { type: type });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('已下载 ' + name);
}

function syncItemSelector() {
  var sel = $('cfb-item-select');
  if (!sel) return;
  sel.innerHTML = '';
  state.items.forEach(function (_, i) {
    var opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = '条目 ' + (i + 1);
    sel.appendChild(opt);
  });
  sel.value = String(state.selected);
  var count = $('cfb-item-count');
  if (count) count.value = String(state.items.length);
}

function syncControls() {
  var c = state.container;
  var set = function (id, v) { var el = $(id); if (el) el.value = v; };
  set('cfb-direction', c.flexDirection);
  set('cfb-wrap', c.flexWrap);
  set('cfb-justify', c.justifyContent);
  set('cfb-align-items', c.alignItems);
  set('cfb-align-content', c.alignContent);
  set('cfb-gap', String(c.gap));
  set('cfb-gap-num', String(c.gap));
  var item = state.items[state.selected] || defaultItem();
  set('cfb-grow', String(item.grow));
  set('cfb-grow-num', String(item.grow));
  set('cfb-shrink', String(item.shrink));
  set('cfb-shrink-num', String(item.shrink));
  set('cfb-basis', item.basis);
  set('cfb-order', String(item.order));
  set('cfb-align-self', item.alignSelf);
  var axis = $('cfb-axis-hint');
  if (axis) {
    axis.textContent = (c.flexDirection === 'row' || c.flexDirection === 'row-reverse')
      ? '当前主轴为水平方向（justify-content 管水平、align-items 管垂直）'
      : '当前主轴为垂直方向（justify-content 管垂直、align-items 管水平）';
  }
  syncItemSelector();
}

function render() {
  try {
    var css = buildFlexCss(state.container, state.items);
    var html = buildHtmlSnippet(state.container, state.items);
    showError('');
    var cssEl = $('cfb-code-css');
    if (cssEl) cssEl.textContent = css;
    var htmlEl = $('cfb-code-html');
    if (htmlEl) htmlEl.textContent = html;
    var preview = $('cfb-preview');
    if (preview) {
      var c = state.container;
      preview.style.display = 'flex';
      preview.style.flexDirection = c.flexDirection;
      preview.style.flexWrap = c.flexWrap;
      preview.style.justifyContent = c.justifyContent;
      preview.style.alignItems = c.alignItems;
      preview.style.alignContent = c.alignContent;
      preview.style.gap = c.gap + 'px';
      preview.innerHTML = '';
      state.items.forEach(function (item, i) {
        var d = document.createElement('div');
        d.className = 'cfb-item' + (i === state.selected ? ' selected' : '');
        d.textContent = String(i + 1);
        d.style.background = COLORS[i % COLORS.length];
        d.style.flex = item.grow + ' ' + item.shrink + ' ' + item.basis;
        d.style.order = String(item.order);
        d.style.alignSelf = item.alignSelf;
        d.title = '点击选中条目 ' + (i + 1) + ' 进行编辑';
        d.addEventListener('click', function () {
          state.selected = i;
          syncControls();
          render();
        });
        preview.appendChild(d);
      });
    }
  } catch (e) {
    showError(e.message || '参数非法');
  }
}

function applyPreset(name) {
  try {
    var p = generatePreset(name);
    state.container = p.container;
    state.items = p.items;
    state.selected = 0;
    showError('');
    syncControls();
    render();
    toast('已载入预设');
  } catch (e) { showError(e.message); }
}

function resizeItems(n) {
  try {
    if (typeof n !== 'number' || Math.floor(n) !== n || n < 1 || n > 12) fail('items', '条目数须为 1–12 的整数');
    while (state.items.length < n) state.items.push(defaultItem());
    while (state.items.length > n) state.items.pop();
    if (state.selected >= n) state.selected = n - 1;
    syncControls();
    render();
  } catch (e) { showError(e.message); }
}

document.addEventListener('DOMContentLoaded', function () {
  var bindSelect = function (id, fn) {
    var el = $(id);
    if (el) el.addEventListener('change', function () { fn(el.value); });
  };
  var bindRangeNum = function (rangeId, numId, fn) {
    var r = $(rangeId), n = $(numId);
    if (r) r.addEventListener('input', function () { if (n) n.value = r.value; fn(parseInt(r.value, 10)); });
    if (n) n.addEventListener('change', function () { var v = parseInt(n.value, 10); if (isNaN(v)) { showError('请输入整数'); syncControls(); return; } if (r) r.value = String(v); fn(v); });
  };
  bindSelect('cfb-direction', function (v) { state.container.flexDirection = v; syncControls(); render(); });
  bindSelect('cfb-wrap', function (v) { state.container.flexWrap = v; render(); });
  bindSelect('cfb-justify', function (v) { state.container.justifyContent = v; render(); });
  bindSelect('cfb-align-items', function (v) { state.container.alignItems = v; render(); });
  bindSelect('cfb-align-content', function (v) { state.container.alignContent = v; render(); });
  bindRangeNum('cfb-gap', 'cfb-gap-num', function (v) { state.container.gap = v; render(); });
  bindSelect('cfb-item-select', function (v) { state.selected = parseInt(v, 10); syncControls(); render(); });
  var countEl = $('cfb-item-count');
  if (countEl) countEl.addEventListener('change', function () { resizeItems(parseInt(countEl.value, 10)); });
  bindRangeNum('cfb-grow', 'cfb-grow-num', function (v) { state.items[state.selected].grow = v; render(); });
  bindRangeNum('cfb-shrink', 'cfb-shrink-num', function (v) { state.items[state.selected].shrink = v; render(); });
  var basisEl = $('cfb-basis');
  if (basisEl) basisEl.addEventListener('change', function () {
    try {
      var norm = parseBasis(basisEl.value);
      state.items[state.selected].basis = norm;
      basisEl.value = norm;
      showError('');
      render();
    } catch (e) { showError(e.message + '（basis 只认 auto / px / %，如 auto、200px、30%）'); syncControls(); }
  });
  var orderEl = $('cfb-order');
  if (orderEl) orderEl.addEventListener('change', function () {
    var v = parseInt(orderEl.value, 10);
    if (isNaN(v)) { showError('order 须为整数（−10–10）'); syncControls(); return; }
    state.items[state.selected].order = v;
    render();
  });
  bindSelect('cfb-align-self', function (v) { state.items[state.selected].alignSelf = v; render(); });
  ['navbar', 'center', 'cards-wrap', 'sidebar'].forEach(function (name) {
    var b = $('cfb-preset-' + name);
    if (b) b.addEventListener('click', function () { applyPreset(name); });
  });
  var copyCss = $('cfb-copy-css');
  if (copyCss) copyCss.addEventListener('click', function () { copyText($('cfb-code-css').textContent, '已复制 CSS'); });
  var copyHtml = $('cfb-copy-html');
  if (copyHtml) copyHtml.addEventListener('click', function () { copyText($('cfb-code-html').textContent, '已复制 HTML'); });
  var dlCss = $('cfb-download-css');
  if (dlCss) dlCss.addEventListener('click', function () { downloadFile(suggestExportName('css'), $('cfb-code-css').textContent, 'text/css;charset=utf-8'); });
  var dlHtml = $('cfb-download-html');
  if (dlHtml) dlHtml.addEventListener('click', function () { downloadFile(suggestExportName('html'), $('cfb-code-html').textContent, 'text/html;charset=utf-8'); });
  var example = $('cfb-load-example');
  if (example) example.addEventListener('click', function () { applyPreset('cards-wrap'); toast('已载入示例：cards-wrap 预设'); });
  var reset = $('cfb-reset');
  if (reset) reset.addEventListener('click', function () {
    state.container = defaultContainer();
    state.items = [defaultItem(), defaultItem(), defaultItem()];
    state.selected = 0;
    syncControls();
    render();
    toast('已重置为默认参数');
  });
  syncControls();
  render();
});
})();

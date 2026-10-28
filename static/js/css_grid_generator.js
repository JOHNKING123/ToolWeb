/* CSS Grid 可视化生成器（css_grid_generator）- 纯前端本地计算
 * 只做单层显式网格，不做嵌套子网格 / subgrid，不做多断点批量导出；
 * 列数 / 行数各上限 12；轨道只认 fr / px / % / auto / minmax(...)；
 * 区域名须字母开头 + 字母数字下划线连字符，且每个区域须为完整矩形。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制、不静默取整。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
'use strict';

/* 抛错：err.field 给出字段名。 */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

function checkInt(v, field, min, max) {
  if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v) fail(field, '须为整数');
  if (v < min || v > max) fail(field, '整数超出范围（' + min + '–' + max + '）');
  return v;
}

function fmtNum(v) {
  return String(Math.round(v * 100) / 100);
}

/* 单轨道原子（不含 minmax）：auto / <数值>fr（>0–12）/ <数值>px（0–1000）/
 * <数值>%（0–100）；数值最多 2 位小数，输出去尾零规范化串。 */
function parseTrackAtom(t) {
  if (t === 'auto') return 'auto';
  var m = /^(\d+(\.\d{1,2})?)(fr|px|%)$/.exec(t);
  if (!m) fail('track', '轨道尺寸只认 fr / px / % / auto / minmax，如 1fr、200px、30%、auto、minmax(200px, 1fr)');
  var v = parseFloat(m[1]);
  var unit = m[3];
  if (unit === 'fr' && (v <= 0 || v > 12)) fail('track', 'fr 数值超出范围（大于 0 且不超过 12）');
  if (unit === 'px' && (v < 0 || v > 1000)) fail('track', 'px 数值超出范围（0–1000）');
  if (unit === '%' && (v < 0 || v > 100)) fail('track', '% 数值超出范围（0–100）');
  return fmtNum(v) + unit;
}

/* parseTrackSize(s)：单轨道解析，含 minmax(a, b)，a / b 各为 auto / px / % / fr
 * 且在各自范围，不嵌套 minmax；非法单位（如 em）、越界、空串均抛错。 */
function parseTrackSize(s) {
  if (typeof s !== 'string') fail('track', '轨道尺寸须为字符串');
  var t = s.trim();
  if (t === '') fail('track', '轨道尺寸不能为空');
  if (t === 'auto') return 'auto';
  var mm = /^minmax\((.*)\)$/.exec(t);
  if (mm) {
    var inner = mm[1];
    if (inner.indexOf('minmax') >= 0) fail('track', 'minmax 不可嵌套');
    var parts = inner.split(',');
    if (parts.length !== 2) fail('track', 'minmax 须为 minmax(a, b) 形式');
    var a = parseTrackAtom(parts[0].trim());
    var b = parseTrackAtom(parts[1].trim());
    return 'minmax(' + a + ', ' + b + ')';
  }
  if (t.indexOf('(') >= 0 || t.indexOf(')') >= 0) fail('track', '轨道尺寸格式非法');
  return parseTrackAtom(t);
}

/* parseTrackList(text)：minmax 括号内空格不切分，其余按空白切分；
 * 每项经 parseTrackSize 校验；空串、任一轨道非法均抛错。 */
function parseTrackList(text) {
  if (typeof text !== 'string') fail('tracks', '轨道列表须为字符串');
  var t = text.trim();
  if (t === '') fail('tracks', '轨道列表不能为空');
  var tokens = [];
  var cur = '';
  var depth = 0;
  for (var i = 0; i < t.length; i++) {
    var ch = t[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) fail('tracks', '轨道列表括号不匹配');
    if (/\s/.test(ch) && depth === 0) {
      if (cur !== '') { tokens.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (depth !== 0) fail('tracks', '轨道列表括号不匹配');
  if (cur !== '') tokens.push(cur);
  if (tokens.length === 0) fail('tracks', '轨道列表不能为空');
  return tokens.map(function (tok) { return parseTrackSize(tok); });
}

/* createEmptyAreas(cols, rows)：返回 rows×cols 全 '.' 数组。 */
function createEmptyAreas(cols, rows) {
  checkInt(cols, 'columns', 1, 12);
  checkInt(rows, 'rows', 1, 12);
  var out = [];
  for (var r = 0; r < rows; r++) {
    var row = [];
    for (var c = 0; c < cols; c++) row.push('.');
    out.push(row);
  }
  return out;
}

function checkAreasShape(areas) {
  if (!Array.isArray(areas) || areas.length === 0) fail('areas', '区域数组非法');
  var cols = null;
  for (var r = 0; r < areas.length; r++) {
    if (!Array.isArray(areas[r])) fail('areas', '区域数组每行须为数组');
    if (cols === null) cols = areas[r].length;
    if (areas[r].length !== cols) fail('areas', '区域数组每行列数须一致');
  }
  if (cols === 0) fail('areas', '区域数组列数非法');
  return { rows: areas.length, cols: cols };
}

function cloneAreas(areas) {
  return areas.map(function (row) { return row.slice(); });
}

var NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/* 区域名首次出现顺序（行优先）。 */
function areaNames(areas) {
  var names = [];
  var seen = {};
  areas.forEach(function (row) {
    row.forEach(function (cell) {
      if (cell !== '.' && !seen[cell]) { seen[cell] = true; names.push(cell); }
    });
  });
  return names;
}

/* 区域最小外接矩形；未找到返回 null。 */
function areaBounds(areas, name) {
  var r1 = null, c1 = null, r2 = null, c2 = null;
  areas.forEach(function (row, r) {
    row.forEach(function (cell, c) {
      if (cell === name) {
        if (r1 === null || r < r1) r1 = r;
        if (c1 === null || c < c1) c1 = c;
        if (r2 === null || r > r2) r2 = r;
        if (c2 === null || c > c2) c2 = c;
      }
    });
  });
  if (r1 === null) return null;
  return { r1: r1, c1: c1, r2: r2, c2: c2 };
}

/* setArea(areas, name, r1, c1, r2, c2)：返回新数组（不改原数组）；
 * 下标 0 起、r1≤r2、c1≤c2 且在界内；矩形内已有其它区域名时失败；
 * 同名或 '.' 可覆盖。 */
function setArea(areas, name, r1, c1, r2, c2) {
  var shape = checkAreasShape(areas);
  if (typeof name !== 'string' || !NAME_RE.test(name)) fail('name', '区域名须字母开头＋字母数字下划线连字符');
  [r1, c1, r2, c2].forEach(function (v) {
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v) fail('areas', '区域行列下标须为整数');
  });
  if (r1 > r2 || c1 > c2) fail('areas', '区域起止下标倒置');
  if (r1 < 0 || c1 < 0 || r2 >= shape.rows || c2 >= shape.cols) fail('areas', '区域下标超出网格范围');
  for (var r = r1; r <= r2; r++) {
    for (var c = c1; c <= c2; c++) {
      var cell = areas[r][c];
      if (cell !== '.' && cell !== name) fail('areas', '矩形内已有其它区域「' + cell + '」，不可覆盖');
    }
  }
  var out = cloneAreas(areas);
  for (var rr = r1; rr <= r2; rr++) {
    for (var cc = c1; cc <= c2; cc++) out[rr][cc] = name;
  }
  return out;
}

/* clearArea(areas, name)：返回新数组，该名全部单元格置 '.'；未知名失败。 */
function clearArea(areas, name) {
  checkAreasShape(areas);
  if (areaBounds(areas, name) === null) fail('areas', '未找到区域「' + name + '」');
  var out = cloneAreas(areas);
  out.forEach(function (row) {
    for (var c = 0; c < row.length; c++) {
      if (row[c] === name) row[c] = '.';
    }
  });
  return out;
}

/* validateAreas(areas, cols, rows)：尺寸须为 rows×cols；每个命名区域的
 * 单元格须恰好填满其最小外接矩形，否则失败（err.field='areas'，消息含区域名）。 */
function validateAreas(areas, cols, rows) {
  checkInt(cols, 'columns', 1, 12);
  checkInt(rows, 'rows', 1, 12);
  if (!Array.isArray(areas) || areas.length !== rows) fail('areas', '区域行数与行数不一致');
  areas.forEach(function (row) {
    if (!Array.isArray(row) || row.length !== cols) fail('areas', '区域列数与列数不一致');
  });
  var names = areaNames(areas);
  names.forEach(function (name) {
    if (!NAME_RE.test(name)) fail('name', '区域名「' + name + '」非法：须字母开头＋字母数字下划线连字符');
    var b = areaBounds(areas, name);
    for (var r = b.r1; r <= b.r2; r++) {
      for (var c = b.c1; c <= b.c2; c++) {
        if (areas[r][c] !== name) fail('areas', '区域「' + name + '」不是完整矩形');
      }
    }
  });
  return true;
}

/* resizeAreas(areas, cols, rows)：按新尺寸裁剪 / 补 '.'；裁剪后非矩形
 * 区域不自动修复，交 validateAreas 在导出时判失败。 */
function resizeAreas(areas, cols, rows) {
  checkAreasShape(areas);
  checkInt(cols, 'columns', 1, 12);
  checkInt(rows, 'rows', 1, 12);
  var out = [];
  for (var r = 0; r < rows; r++) {
    var row = [];
    for (var c = 0; c < cols; c++) {
      row.push((r < areas.length && c < areas[r].length) ? areas[r][c] : '.');
    }
    out.push(row);
  }
  return out;
}

/* 校验网格配置，返回规范化副本。 */
function checkGrid(grid) {
  if (!grid || typeof grid !== 'object') fail('grid', '网格配置非法');
  if (!Array.isArray(grid.columns) || grid.columns.length < 1 || grid.columns.length > 12) fail('columns', '列数须为 1–12');
  if (!Array.isArray(grid.rows) || grid.rows.length < 1 || grid.rows.length > 12) fail('rows', '行数须为 1–12');
  var columns = grid.columns.map(function (t) { return parseTrackSize(t); });
  var rows = grid.rows.map(function (t) { return parseTrackSize(t); });
  var columnGap = checkInt(grid.columnGap, 'columnGap', 0, 64);
  var rowGap = checkInt(grid.rowGap, 'rowGap', 0, 64);
  var areas = grid.areas;
  var hasAreas = Array.isArray(areas) && areas.length > 0 && areaNames(areas).length > 0;
  if (hasAreas) validateAreas(areas, columns.length, rows.length);
  return { columns: columns, rows: rows, columnGap: columnGap, rowGap: rowGap, areas: areas, hasAreas: hasAreas };
}

/* buildContainerCss(grid)：输出 .grid-container 声明块，首行 display: grid; */
function buildContainerCss(grid) {
  var v = checkGrid(grid);
  var lines = [];
  lines.push('.grid-container {');
  lines.push('  display: grid;');
  lines.push('  grid-template-columns: ' + v.columns.join(' ') + ';');
  lines.push('  grid-template-rows: ' + v.rows.join(' ') + ';');
  lines.push('  column-gap: ' + v.columnGap + 'px;');
  lines.push('  row-gap: ' + v.rowGap + 'px;');
  if (v.hasAreas) {
    var areaLines = v.areas.map(function (row) { return '    "' + row.join(' ') + '"'; });
    lines.push('  grid-template-areas:');
    lines.push(areaLines.join('\n').replace(/\n/g, '\n') + ';');
  }
  lines.push('}');
  return lines.join('\n');
}

/* buildAreasCss(areas)：按首次出现顺序输出 .grid-area-<name> 类块；
 * 无命名区域返回空串。 */
function buildAreasCss(areas) {
  if (!Array.isArray(areas) || areas.length === 0) return '';
  var shape = checkAreasShape(areas);
  validateAreas(areas, shape.cols, shape.rows);
  var names = areaNames(areas);
  return names.map(function (name) {
    return '.grid-area-' + name + ' {\n  grid-area: ' + name + ';\n}';
  }).join('\n\n');
}

/* buildGridCss(grid)：容器块＋各区域块。 */
function buildGridCss(grid) {
  var container = buildContainerCss(grid);
  var areasCss = '';
  if (grid && Array.isArray(grid.areas) && grid.areas.length > 0) areasCss = buildAreasCss(grid.areas);
  return areasCss ? container + '\n\n' + areasCss : container;
}

/* buildHtmlSnippet(grid)：<style> 内嵌完整 CSS＋容器 div 内每个命名区域一个 div；
 * 无命名区域时容器内放 1 个占位 div。 */
function buildHtmlSnippet(grid) {
  var css = buildGridCss(grid);
  var names = (grid && Array.isArray(grid.areas)) ? areaNames(grid.areas) : [];
  var divs;
  if (names.length === 0) {
    divs = ['  <div class="grid-placeholder">占位单元格</div>'];
  } else {
    divs = names.map(function (name) {
      return '  <div class="grid-area grid-area-' + name + '">' + name + '</div>';
    });
  }
  return '<style>\n' + css + '\n</style>\n' +
    '<div class="grid-container">\n' + divs.join('\n') + '\n</div>';
}

var PRESETS = {
  'holy-grail': {
    columns: ['200px', '1fr', '200px'],
    rows: ['60px', '1fr', '60px'],
    columnGap: 16,
    rowGap: 16,
    areas: [
      ['header', 'header', 'header'],
      ['sidebar', 'main', 'aside'],
      ['footer', 'footer', 'footer']
    ]
  },
  'dashboard': {
    columns: ['220px', '1fr', '1fr'],
    rows: ['60px', '1fr', '1fr'],
    columnGap: 16,
    rowGap: 16,
    areas: [
      ['header', 'header', 'header'],
      ['sidebar', 'chart1', 'chart2'],
      ['sidebar', 'table', 'table']
    ]
  },
  'three-column': {
    columns: ['1fr', '1fr', '1fr'],
    rows: ['1fr'],
    columnGap: 16,
    rowGap: 16,
    areas: [['left', 'center', 'right']]
  }
};

/* generatePreset(name)：返回 { columns, rows, columnGap, rowGap, areas } 深拷贝；未知 name 抛错。 */
function generatePreset(name) {
  if (!PRESETS.hasOwnProperty(name)) fail('preset', '未知预设：' + name);
  return JSON.parse(JSON.stringify(PRESETS[name]));
}

/* suggestExportName(kind)：css → grid.css，html → grid-demo.html。 */
function suggestExportName(kind) {
  if (kind === 'css') return 'grid.css';
  if (kind === 'html') return 'grid-demo.html';
  fail('kind', '未知导出类型：' + kind);
}

var api = {
  parseTrackSize: parseTrackSize,
  parseTrackList: parseTrackList,
  createEmptyAreas: createEmptyAreas,
  setArea: setArea,
  clearArea: clearArea,
  validateAreas: validateAreas,
  resizeAreas: resizeAreas,
  areaNames: areaNames,
  areaBounds: areaBounds,
  buildContainerCss: buildContainerCss,
  buildAreasCss: buildAreasCss,
  buildGridCss: buildGridCss,
  buildHtmlSnippet: buildHtmlSnippet,
  generatePreset: generatePreset,
  suggestExportName: suggestExportName
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.GridGenerator = api;
}

/* ---------- 浏览器 DOM 逻辑（node 下 document 不存在时跳过） ---------- */
if (typeof document === 'undefined') return;

function $(id) { return document.getElementById(id); }

var state = {
  colTracks: ['1fr', '1fr', '1fr'],
  rowTracks: ['1fr', '1fr', '1fr'],
  columnGap: 16,
  rowGap: 16,
  areas: null, /* 由 init 设为 createEmptyAreas */
  selected: null, /* 选中的区域名 */
  pending: null /* 拖拽圈选的矩形 {r1,c1,r2,c2} */
};
state.areas = createEmptyAreas(3, 3);

var COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316', '#14b8a6', '#8b5cf6'];
function colorFor(name) {
  var names = areaNames(state.areas);
  var idx = names.indexOf(name);
  if (idx < 0) idx = 0;
  return COLORS[idx % COLORS.length];
}

function gridFromState() {
  return {
    columns: state.colTracks.slice(),
    rows: state.rowTracks.slice(),
    columnGap: state.columnGap,
    rowGap: state.rowGap,
    areas: state.areas
  };
}

function showError(msg) {
  var el = $('cgd-error');
  if (el) el.textContent = msg || '';
}

function toast(msg) {
  var el = $('cgd-toast');
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

function setExportEnabled(enabled) {
  ['cgd-copy-css', 'cgd-copy-html', 'cgd-download-css', 'cgd-download-html'].forEach(function (id) {
    var el = $(id);
    if (el) el.disabled = !enabled;
  });
}

function syncCounts() {
  var cols = $('cgd-cols');
  if (cols) cols.value = String(state.colTracks.length);
  var rows = $('cgd-rows');
  if (rows) rows.value = String(state.rowTracks.length);
  var cg = $('cgd-col-gap');
  if (cg) cg.value = String(state.columnGap);
  var cgNum = $('cgd-col-gap-num');
  if (cgNum) cgNum.value = String(state.columnGap);
  var rg = $('cgd-row-gap');
  if (rg) rg.value = String(state.rowGap);
  var rgNum = $('cgd-row-gap-num');
  if (rgNum) rgNum.value = String(state.rowGap);
}

/* 轨道输入组：每轨道一个文本框，改动即校验规范化并同步画布与代码。 */
function paintTracks() {
  function build(containerId, tracks, isCol) {
    var wrap = $(containerId);
    if (!wrap) return;
    wrap.innerHTML = '';
    tracks.forEach(function (track, i) {
      var label = document.createElement('label');
      label.textContent = (isCol ? '列' : '行') + (i + 1);
      var input = document.createElement('input');
      input.type = 'text';
      input.value = track;
      input.setAttribute('aria-label', (isCol ? '列' : '行') + (i + 1) + '轨道尺寸');
      input.addEventListener('change', function () {
        try {
          var norm = parseTrackSize(input.value);
          if (isCol) state.colTracks[i] = norm; else state.rowTracks[i] = norm;
          input.value = norm;
          showError('');
          renderAll();
        } catch (e) {
          showError(e.message + '（轨道只认 fr／px／%／auto／minmax）');
          input.value = isCol ? state.colTracks[i] : state.rowTracks[i];
        }
      });
      wrap.appendChild(label);
      wrap.appendChild(input);
    });
  }
  build('cgd-col-tracks', state.colTracks, true);
  build('cgd-row-tracks', state.rowTracks, false);
}

var drag = null;

function paintCanvas() {
  var canvas = $('cgd-canvas');
  if (!canvas) return;
  var cols = state.colTracks.length;
  var rows = state.rowTracks.length;
  var grid = gridFromState();
  var validCols = grid.columns;
  var validRows = grid.rows;
  canvas.style.display = 'grid';
  canvas.style.gridTemplateColumns = validCols.join(' ');
  canvas.style.gridTemplateRows = validRows.join(' ');
  canvas.style.columnGap = '4px';
  canvas.style.rowGap = '4px';
  canvas.innerHTML = '';
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      (function (rr, cc) {
        var cell = document.createElement('div');
        var name = state.areas[rr][cc];
        cell.className = 'cgd-cell' + (name !== '.' ? ' named' : '');
        if (state.pending && rr >= state.pending.r1 && rr <= state.pending.r2 && cc >= state.pending.c1 && cc <= state.pending.c2) {
          cell.className += ' pending';
        }
        if (name !== '.' && name === state.selected) cell.className += ' selected';
        cell.textContent = name === '.' ? (rr + 1) + '行' + (cc + 1) + '列' : name;
        if (name !== '.') cell.style.background = colorFor(name);
        cell.title = name === '.' ? '拖拽圈选后命名生成区域' : '点击选中区域「' + name + '」';
        cell.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          drag = { r1: rr, c1: cc, r2: rr, c2: cc };
          state.pending = { r1: rr, c1: cc, r2: rr, c2: cc };
          paintCanvas();
        });
        cell.addEventListener('mouseenter', function () {
          if (!drag) return;
          drag.r2 = rr;
          drag.c2 = cc;
          state.pending = {
            r1: Math.min(drag.r1, drag.r2), c1: Math.min(drag.c1, drag.c2),
            r2: Math.max(drag.r1, drag.r2), c2: Math.max(drag.c1, drag.c2)
          };
          paintCanvas();
          syncRectInfo();
        });
        cell.addEventListener('mouseup', function () {
          if (!drag) return;
          var wasSingle = drag.r1 === rr && drag.c1 === cc;
          var clickedName = state.areas[rr][cc];
          drag = null;
          if (wasSingle && clickedName !== '.') {
            state.selected = clickedName;
            state.pending = null;
          } else if (state.pending) {
            /* 保留圈选，等待命名框输入区域名后生成 */
          }
          syncRectInfo();
          paintCanvas();
          paintSidebar();
        });
        canvas.appendChild(cell);
      })(r, c);
    }
  }
}

function syncRectInfo() {
  var info = $('cgd-rect-info');
  if (!info) return;
  if (state.pending) {
    var p = state.pending;
    info.textContent = '已圈选：行 ' + (p.r1 + 1) + '–' + (p.r2 + 1) + '（跨 ' + (p.r2 - p.r1 + 1) + ' 行）× 列 ' + (p.c1 + 1) + '–' + (p.c2 + 1) + '（跨 ' + (p.c2 - p.c1 + 1) + ' 列），在下方输入区域名后点「生成区域」。';
  } else if (state.selected) {
    info.textContent = '已选中区域「' + state.selected + '」，可在区域侧栏改名或清除。';
  } else {
    info.textContent = '在画布上拖拽圈选矩形，再输入区域名生成区域；点击已命名单元格可选中该区域。';
  }
}

function paintSidebar() {
  var list = $('cgd-area-list');
  if (!list) return;
  list.innerHTML = '';
  var names = areaNames(state.areas);
  if (names.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'cgd-hint';
    empty.textContent = '暂无命名区域：拖拽圈选后命名即可生成。';
    list.appendChild(empty);
    return;
  }
  names.forEach(function (name) {
    var b = areaBounds(state.areas, name);
    var item = document.createElement('div');
    item.className = 'cgd-area-item' + (name === state.selected ? ' selected' : '');
    var title = document.createElement('div');
    title.className = 'cgd-area-title';
    var dot = document.createElement('span');
    dot.className = 'cgd-dot';
    dot.style.background = colorFor(name);
    title.appendChild(dot);
    var nameEl = document.createElement('strong');
    nameEl.textContent = name;
    title.appendChild(nameEl);
    var span = document.createElement('span');
    span.className = 'cgd-hint';
    span.textContent = '行 ' + (b.r1 + 1) + '–' + (b.r2 + 1) + '（跨 ' + (b.r2 - b.r1 + 1) + ' 行）· 列 ' + (b.c1 + 1) + '–' + (b.c2 + 1) + '（跨 ' + (b.c2 - b.c1 + 1) + ' 列）';
    title.appendChild(span);
    item.appendChild(title);
    var row = document.createElement('div');
    row.className = 'cgd-row';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = name;
    input.setAttribute('aria-label', '区域「' + name + '」改名');
    var renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'cgd-btn';
    renameBtn.textContent = '改名';
    renameBtn.addEventListener('click', function () {
      var newName = input.value.trim();
      try {
        var cleared = clearArea(state.areas, name);
        var next = setArea(cleared, newName, b.r1, b.c1, b.r2, b.c2);
        state.areas = next;
        if (state.selected === name) state.selected = newName;
        showError('');
        renderAll();
        toast('已改名为「' + newName + '」');
      } catch (e) { showError(e.message); }
    });
    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'cgd-btn';
    clearBtn.textContent = '清除';
    clearBtn.addEventListener('click', function () {
      try {
        state.areas = clearArea(state.areas, name);
        if (state.selected === name) state.selected = null;
        showError('');
        renderAll();
        toast('已清除区域「' + name + '」');
      } catch (e) { showError(e.message); }
    });
    var selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'cgd-btn';
    selectBtn.textContent = '选中';
    selectBtn.addEventListener('click', function () {
      state.selected = name;
      syncRectInfo();
      paintCanvas();
      paintSidebar();
    });
    row.appendChild(input);
    row.appendChild(renameBtn);
    row.appendChild(clearBtn);
    row.appendChild(selectBtn);
    item.appendChild(row);
    list.appendChild(item);
  });
}

/* 预览：命名区域按起止跨度合并为彩色块，留空单元格显示虚线占位。 */
function paintPreview() {
  var preview = $('cgd-preview');
  if (!preview) return;
  preview.innerHTML = '';
  var grid = gridFromState();
  preview.style.display = 'grid';
  preview.style.gridTemplateColumns = grid.columns.join(' ');
  preview.style.gridTemplateRows = grid.rows.join(' ');
  preview.style.columnGap = grid.columnGap + 'px';
  preview.style.rowGap = grid.rowGap + 'px';
  var names = areaNames(state.areas);
  names.forEach(function (name) {
    var b = areaBounds(state.areas, name);
    var d = document.createElement('div');
    d.className = 'cgd-preview-area';
    d.textContent = name;
    d.style.background = colorFor(name);
    d.style.gridRow = (b.r1 + 1) + ' / ' + (b.r2 + 2);
    d.style.gridColumn = (b.c1 + 1) + ' / ' + (b.c2 + 2);
    preview.appendChild(d);
  });
  for (var r = 0; r < state.areas.length; r++) {
    for (var c = 0; c < state.areas[r].length; c++) {
      if (state.areas[r][c] === '.') {
        var ph = document.createElement('div');
        ph.className = 'cgd-preview-empty';
        ph.style.gridRow = (r + 1) + ' / ' + (r + 2);
        ph.style.gridColumn = (c + 1) + ' / ' + (c + 2);
        preview.appendChild(ph);
      }
    }
  }
}

function renderAll() {
  try {
    var grid = gridFromState();
    var css = buildGridCss(grid);
    var html = buildHtmlSnippet(grid);
    showError('');
    setExportEnabled(true);
    var cssEl = $('cgd-code-css');
    if (cssEl) cssEl.textContent = css;
    var htmlEl = $('cgd-code-html');
    if (htmlEl) htmlEl.textContent = html;
    paintPreview();
  } catch (e) {
    showError(e.message);
    setExportEnabled(false);
    var cssEl2 = $('cgd-code-css');
    if (cssEl2) cssEl2.textContent = '（参数无效，修复后生成代码）';
    var htmlEl2 = $('cgd-code-html');
    if (htmlEl2) htmlEl2.textContent = '（参数无效，修复后生成代码）';
    var preview = $('cgd-preview');
    if (preview) {
      preview.innerHTML = '';
      var hint = document.createElement('p');
      hint.className = 'cgd-hint';
      hint.textContent = '区域无效，修复后恢复预览。';
      preview.appendChild(hint);
    }
  }
  paintCanvas();
  paintSidebar();
  syncRectInfo();
}

function applyPreset(name) {
  try {
    var p = generatePreset(name);
    state.colTracks = p.columns.slice();
    state.rowTracks = p.rows.slice();
    state.columnGap = p.columnGap;
    state.rowGap = p.rowGap;
    state.areas = p.areas.map(function (row) { return row.slice(); });
    state.selected = null;
    state.pending = null;
    showError('');
    syncCounts();
    paintTracks();
    renderAll();
    toast('已载入预设');
  } catch (e) { showError(e.message); }
}

function resizeGrid(newCols, newRows) {
  try {
    checkInt(newCols, 'columns', 1, 12);
    checkInt(newRows, 'rows', 1, 12);
    while (state.colTracks.length < newCols) state.colTracks.push('1fr');
    while (state.colTracks.length > newCols) state.colTracks.pop();
    while (state.rowTracks.length < newRows) state.rowTracks.push('1fr');
    while (state.rowTracks.length > newRows) state.rowTracks.pop();
    state.areas = resizeAreas(state.areas, newCols, newRows);
    if (state.selected && areaBounds(state.areas, state.selected) === null) state.selected = null;
    state.pending = null;
    showError('');
    syncCounts();
    paintTracks();
    renderAll();
  } catch (e) {
    showError(e.message);
    syncCounts();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  var bindRangeNum = function (rangeId, numId, fn) {
    var r = $(rangeId), n = $(numId);
    if (r) r.addEventListener('input', function () { if (n) n.value = r.value; fn(parseInt(r.value, 10)); });
    if (n) n.addEventListener('change', function () {
      var v = parseInt(n.value, 10);
      if (isNaN(v)) { showError('间距须为整数（0–64）'); syncCounts(); return; }
      if (r) r.value = String(v);
      fn(v);
    });
  };
  var colsEl = $('cgd-cols');
  if (colsEl) colsEl.addEventListener('change', function () {
    var v = parseInt(colsEl.value, 10);
    if (isNaN(v)) { showError('列数须为 1–12 的整数'); syncCounts(); return; }
    resizeGrid(v, state.rowTracks.length);
  });
  var rowsEl = $('cgd-rows');
  if (rowsEl) rowsEl.addEventListener('change', function () {
    var v = parseInt(rowsEl.value, 10);
    if (isNaN(v)) { showError('行数须为 1–12 的整数'); syncCounts(); return; }
    resizeGrid(state.colTracks.length, v);
  });
  bindRangeNum('cgd-col-gap', 'cgd-col-gap-num', function (v) { state.columnGap = v; renderAll(); });
  bindRangeNum('cgd-row-gap', 'cgd-row-gap-num', function (v) { state.rowGap = v; renderAll(); });
  document.addEventListener('mouseup', function () { drag = null; });
  var createBtn = $('cgd-create-area');
  if (createBtn) createBtn.addEventListener('click', function () {
    var nameInput = $('cgd-area-name');
    var name = nameInput ? nameInput.value.trim() : '';
    if (!state.pending) { showError('请先在画布上拖拽圈选一个矩形'); return; }
    try {
      var p = state.pending;
      state.areas = setArea(state.areas, name, p.r1, p.c1, p.r2, p.c2);
      state.selected = name;
      state.pending = null;
      if (nameInput) nameInput.value = '';
      showError('');
      renderAll();
      toast('已生成区域「' + name + '」');
    } catch (e) { showError(e.message); }
  });
  ['holy-grail', 'dashboard', 'three-column'].forEach(function (name) {
    var b = $('cgd-preset-' + name);
    if (b) b.addEventListener('click', function () { applyPreset(name); });
  });
  var copyCss = $('cgd-copy-css');
  if (copyCss) copyCss.addEventListener('click', function () { copyText($('cgd-code-css').textContent, '已复制 CSS'); });
  var copyHtml = $('cgd-copy-html');
  if (copyHtml) copyHtml.addEventListener('click', function () { copyText($('cgd-code-html').textContent, '已复制 HTML'); });
  var dlCss = $('cgd-download-css');
  if (dlCss) dlCss.addEventListener('click', function () { downloadFile(suggestExportName('css'), $('cgd-code-css').textContent, 'text/css;charset=utf-8'); });
  var dlHtml = $('cgd-download-html');
  if (dlHtml) dlHtml.addEventListener('click', function () { downloadFile(suggestExportName('html'), $('cgd-code-html').textContent, 'text/html;charset=utf-8'); });
  var example = $('cgd-load-example');
  if (example) example.addEventListener('click', function () { applyPreset('holy-grail'); toast('已载入示例：holy-grail 预设'); });
  var reset = $('cgd-reset');
  if (reset) reset.addEventListener('click', function () {
    state.colTracks = ['1fr', '1fr', '1fr'];
    state.rowTracks = ['1fr', '1fr', '1fr'];
    state.columnGap = 16;
    state.rowGap = 16;
    state.areas = createEmptyAreas(3, 3);
    state.selected = null;
    state.pending = null;
    showError('');
    syncCounts();
    paintTracks();
    renderAll();
    toast('已重置为默认参数');
  });
  syncCounts();
  paintTracks();
  renderAll();
});
})();

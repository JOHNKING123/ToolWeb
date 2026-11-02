/* JSON 转 Excel - 粘贴 JSON 文本 / 上传 .json 文件 → 点路径展平 → 表格预览 → 导出 .xlsx，纯前端本地处理
 *
 * 流程：大文本框粘贴 JSON 文本 或 上传 .json 文件（FileReader 本地读，≤20MB）
 * → JSON.parse（失败给出「第 X 行第 Y 列」定位 + 出错行上下文）
 * → 展平引擎（嵌套对象/数组展开为点路径列名，如 user.address.city、tags.0；
 *   各行列取并集，缺失单元格置 null）
 * → 列管理（多选/全选、重命名、上移下移排序）
 * → HTML 表格预览（分页 100 行/页、行数统计）
 * → 导出 .xlsx（本地 vendor SheetJS 0.18.5，单 sheet「Sheet1」，列宽自动调整；
 *   文件名 json_to_excel_YYYYMMDD_HHmmss.xlsx；零外部请求）
 * 全程不上传服务器，无新增后端接口。
 */

/*<J2X-PURE-BEGIN>*/
/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

function errWithField(message, field) {
  var e = new Error(message);
  e.field = field;
  return e;
}

/* 点路径展平：嵌套对象/数组展开为点路径列名。
 * flattenValue({a:1,b:{c:2},tags:['x','y']}) → {'a':1,'b.c':2,'tags.0':'x','tags.1':'y'}
 * 原始类型 value 直接返回 {[prefix]: value}；undefined/函数 抛 Error（err.field='value'）。 */
function flattenValue(value, prefix) {
  prefix = prefix == null ? '' : String(prefix);
  if (value === undefined || typeof value === 'function') {
    throw errWithField('flattenValue: value 为 undefined/函数，无法展平', 'value');
  }
  if (value === null || typeof value !== 'object') {
    var leaf = {};
    leaf[prefix] = value;
    return leaf;
  }
  var out = {};
  function put(sub) {
    for (var k in sub) {
      if (Object.prototype.hasOwnProperty.call(sub, k)) out[k] = sub[k];
    }
  }
  var i, keys;
  if (Array.isArray(value)) {
    for (i = 0; i < value.length; i++) {
      put(flattenValue(value[i], prefix ? prefix + '.' + i : String(i)));
    }
    return out;
  }
  keys = Object.keys(value);
  for (i = 0; i < keys.length; i++) {
    put(flattenValue(value[keys[i]], prefix ? prefix + '.' + keys[i] : keys[i]));
  }
  return out;
}

/* 列名并集（首次出现顺序，确定性）。
 * extractColumns([{a:1},{b:2,a:3}]) → ['a','b']
 * rows 非数组抛 Error（err.field='rows'）；元素非对象抛 Error（err.field='rows[i]'）。 */
function extractColumns(rows) {
  if (!Array.isArray(rows)) {
    throw errWithField('extractColumns: rows 必须为数组', 'rows');
  }
  var cols = [], seen = {}, i, k, r;
  for (i = 0; i < rows.length; i++) {
    r = rows[i];
    if (r === null || typeof r !== 'object' || typeof r === 'function') {
      throw errWithField('extractColumns: rows[' + i + '] 必须为对象', 'rows[' + i + ']');
    }
    for (k in r) {
      if (Object.prototype.hasOwnProperty.call(r, k) && !seen[k]) {
        seen[k] = true;
        cols.push(k);
      }
    }
  }
  return cols;
}

/* JSON → {columns, rows}：数组逐元素展平，对象包成单行；缺失单元格置 null。
 * jsonToSheet([{a:1},{a:2,b:3}]) → columns=['a','b'], rows=[[1,null],[2,3]]
 * data 非数组/对象（原始类型）抛 Error（err.field='data'）。 */
function jsonToSheet(data) {
  if (data === null || data === undefined || typeof data === 'function' || typeof data !== 'object') {
    throw errWithField('jsonToSheet: 仅支持数组/对象结构 JSON', 'data');
  }
  var list = Array.isArray(data) ? data : [data];
  var flat = list.map(function (v) { return flattenValue(v, ''); });
  var columns = extractColumns(flat);
  var rows = flat.map(function (r) {
    return columns.map(function (c) {
      return Object.prototype.hasOwnProperty.call(r, c) ? r[c] : null;
    });
  });
  return { columns: columns, rows: rows };
}

/* 下载文件名：json_to_excel_YYYYMMDD_HHmmss.xlsx。
 * buildExcelFileName(new Date(2026,10,2,19,30,0)) → 'json_to_excel_20261102_193000.xlsx'
 * now 非 Date 抛 Error（err.field='now'）。 */
function buildExcelFileName(now) {
  if (!(now instanceof Date)) {
    throw errWithField('buildExcelFileName: now 必须为 Date', 'now');
  }
  function p(x) { return (x < 10 ? '0' : '') + x; }
  return 'json_to_excel_' + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate()) +
    '_' + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds()) + '.xlsx';
}

/* JSON 解析报错定位：从 V8 错误信息里的 "position N" 换算出行/列。
 * 无 position 信息时 line/col 置 -1。 */
function locateJsonError(text, err) {
  var msg = String((err && err.message) || err || '');
  var m = /position (\d+)/.exec(msg);
  if (!m) return { line: -1, col: -1, pos: -1, message: msg };
  var pos = parseInt(m[1], 10);
  var line = 1, col = 1, i;
  for (i = 0; i < pos && i < text.length; i++) {
    if (text.charAt(i) === '\n') { line++; col = 1; }
    else col++;
  }
  return { line: line, col: col, pos: pos, message: msg };
}

/* 出错行上下文：取报错行前后各 1 行，标注行号 */
function errorLineContext(text, line) {
  if (line < 1) return '';
  var lines = String(text).split(/\r\n|\r|\n/);
  var out = [], i;
  for (i = Math.max(1, line - 1); i <= Math.min(lines.length, line + 1); i++) {
    out.push((i === line ? '>> ' : '   ') + '第' + i + '行: ' + lines[i - 1]);
  }
  return out.join('\n');
}

/* 展示文本宽度估算（CJK 算 2），用于自动列宽 */
function textWidth(s) {
  var w = 0, str = String(s);
  for (var i = 0; i < str.length; i++) w += (str.charCodeAt(i) > 255 ? 2 : 1);
  return w;
}

/* 单元格类型判定：返回 {v: 值, t: 'n'|'s'|'b', d: 展示文本} */
function cellOf(v) {
  if (v === null || v === undefined) return { v: '', t: 's', d: '' };
  if (typeof v === 'number') {
    if (!isFinite(v)) return { v: String(v), t: 's', d: String(v) };
    return { v: v, t: 'n', d: String(v) };
  }
  if (typeof v === 'boolean') return { v: v, t: 'b', d: v ? 'true' : 'false' };
  var s = String(v);
  return { v: s, t: 's', d: s };
}

/* 用 SheetJS 生成工作簿：单 sheet「Sheet1」，自动列宽。
 * sheet: {columns, rows}（rows 为二维数组，缺失置 null）；
 * displayNames: 导出列头（列重命名后），缺省用 columns。
 * 注：SheetJS 0.18.5 社区版写入器不支持单元格样式，故不设置样式；数值/布尔/文本类型正确。 */
function buildWorkbook(XLSX, sheet, displayNames) {
  if (!sheet || !Array.isArray(sheet.columns) || !Array.isArray(sheet.rows)) {
    throw errWithField('buildWorkbook: sheet 必须为 {columns, rows}', 'sheet');
  }
  var columns = sheet.columns;
  var names = (displayNames && displayNames.length === columns.length) ? displayNames : columns;
  var allRows = [names.map(cellOf)].concat(sheet.rows.map(function (r) { return r.map(cellOf); }));
  var aoa = allRows.map(function (r) { return r.map(function (c) { return c.v; }); });
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  var range = XLSX.utils.decode_range(ws['!ref']);
  var R, C;
  for (R = 0; R <= range.e.r; R++) {
    for (C = 0; C <= range.e.c; C++) {
      var addr = XLSX.utils.encode_cell({ r: R, c: C });
      var cell = ws[addr];
      if (!cell) continue;
      cell.t = allRows[R][C].t;
    }
  }
  var widths = [];
  for (C = 0; C <= range.e.c; C++) {
    var w = 8;
    for (R = 0; R <= range.e.r; R++) {
      w = Math.max(w, textWidth(allRows[R][C] ? allRows[R][C].d : '') + 2);
    }
    widths.push({ wch: Math.min(w, 60) });
  }
  ws['!cols'] = widths;
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return wb;
}

/*<J2X-PURE-END>*/

/* window.JsonToExcel 与 module.exports 同步导出 */
var JsonToExcelApi = {
  flattenValue: flattenValue,
  extractColumns: extractColumns,
  jsonToSheet: jsonToSheet,
  buildExcelFileName: buildExcelFileName,
  locateJsonError: locateJsonError,
  errorLineContext: errorLineContext,
  cellOf: cellOf,
  buildWorkbook: buildWorkbook
};
if (typeof window !== 'undefined') window.JsonToExcel = JsonToExcelApi;
if (typeof module !== 'undefined' && module.exports) module.exports = JsonToExcelApi;

/* ---------------- DOM 胶水（浏览器 only） ---------------- */
(function () {
  if (typeof document === 'undefined') return;
  'use strict';

  var MAX_TEXT_BYTES = 20 * 1024 * 1024; /* 真限制④：输入文本 20MB 上限 */
  var MAX_ROWS = 50000;                  /* 真限制④：数据行 5 万行上限 */
  var PAGE_SIZE = 100;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function cellText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  var input = $('j2x-input'), fileInput = $('j2x-file'), upload = $('j2x-upload'),
      status = $('j2x-status'), errBox = $('j2x-error'),
      resultBox = $('j2x-result'), summary = $('j2x-summary'),
      colPanel = $('j2x-cols'), previewBox = $('j2x-preview'), pager = $('j2x-pager'),
      btnParse = $('j2x-parse'), btnSample = $('j2x-sample'), btnClear = $('j2x-clear'),
      btnExport = $('j2x-export'), charCount = $('j2x-count');

  var sheet = null;      /* {columns, rows} */
  var colState = [];     /* [{key, name, selected}] */
  var page = 1;

  function toast(msg, ok) {
    status.textContent = msg;
    status.style.color = ok === false ? '#b91c1c' : '#059669';
  }
  function fail(msg) {
    errBox.style.display = 'block';
    errBox.textContent = msg;
  }
  function clearErr() { errBox.style.display = 'none'; errBox.textContent = ''; }
  function updateCount() { charCount.textContent = (input.value || '').length; }

  function selectedCols() {
    return colState.filter(function (c) { return c.selected; });
  }

  function doParse() {
    clearErr();
    var text = input.value || '';
    if (!text.trim()) {
      fail('请先粘贴 JSON 文本或上传 .json 文件，再点「解析并预览」。');
      return;
    }
    if (new Blob([text]).size > MAX_TEXT_BYTES) {
      fail('输入文本超过 20MB 上限（真限制④），请拆分成小块后分别转换。');
      return;
    }
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      var loc = locateJsonError(text, e);
      var msg = 'JSON 解析失败';
      if (loc.line > 0) {
        msg += '：第 ' + loc.line + ' 行第 ' + loc.col + ' 列附近有误。' + '\n' + errorLineContext(text, loc.line);
      } else {
        msg += '：' + loc.message;
      }
      fail(msg);
      resultBox.style.display = 'none';
      btnExport.disabled = true;
      return;
    }
    var s;
    try {
      s = jsonToSheet(data);
    } catch (e) {
      /* 真限制①：仅数组/对象结构 */
      fail('JSON 结构不受支持：' + (e && e.message ? e.message : e) + '（仅支持数组/对象结构 JSON，纯字符串/数字等原始类型无法转成表格）');
      resultBox.style.display = 'none';
      btnExport.disabled = true;
      return;
    }
    if (!s.columns.length) {
      fail('解析成功，但没有可展平的列（JSON 为空数组或空对象）。请检查输入。');
      resultBox.style.display = 'none';
      btnExport.disabled = true;
      return;
    }
    if (s.rows.length > MAX_ROWS) {
      fail('数据行 ' + s.rows.length + ' 行超过 5 万行上限（真限制④），请拆分后重试。');
      resultBox.style.display = 'none';
      btnExport.disabled = true;
      return;
    }
    sheet = s;
    colState = s.columns.map(function (c) { return { key: c, name: c, selected: true }; });
    page = 1;
    renderCols();
    renderPreview();
    resultBox.style.display = 'block';
    btnExport.disabled = false;
    toast('解析成功：' + s.rows.length + ' 行 × ' + s.columns.length + ' 列，请核对预览后导出。', true);
  }

  /* ---------- 列管理：多选/全选、重命名、上移下移 ---------- */
  function renderCols() {
    var html = '<div class="j2x-colbar">' +
      '<button class="btn btn-secondary j2x-mini" id="j2x-selall">全选</button>' +
      '<button class="btn btn-secondary j2x-mini" id="j2x-selnone">全不选</button>' +
      '<button class="btn btn-secondary j2x-mini" id="j2x-resetname">恢复默认列名</button>' +
      '<span class="j2x-colhint">勾选要导出的列；列名可改（仅改导出表头）；↑↓ 调整列顺序</span></div>' +
      '<div class="j2x-collist">';
    colState.forEach(function (c, i) {
      html += '<div class="j2x-colitem">' +
        '<label class="j2x-colcheck"><input type="checkbox" data-i="' + i + '" class="j2x-colsel"' + (c.selected ? ' checked' : '') + '> <span class="j2x-colkey" title="' + esc(c.key) + '">' + esc(c.key) + '</span></label>' +
        '<input type="text" class="j2x-colrename" data-i="' + i + '" value="' + esc(c.name) + '" aria-label="重命名列 ' + esc(c.key) + '">' +
        '<button class="btn btn-secondary j2x-mini j2x-move" data-i="' + i + '" data-d="-1" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
        '<button class="btn btn-secondary j2x-mini j2x-move" data-i="' + i + '" data-d="1" ' + (i === colState.length - 1 ? 'disabled' : '') + '>↓</button>' +
        '</div>';
    });
    html += '</div>';
    colPanel.innerHTML = html;

    $('j2x-selall').addEventListener('click', function () { setAll(true); });
    $('j2x-selnone').addEventListener('click', function () { setAll(false); });
    $('j2x-resetname').addEventListener('click', function () {
      colState.forEach(function (c) { c.name = c.key; });
      renderCols(); renderPreview();
    });
    var sels = colPanel.querySelectorAll('.j2x-colsel');
    sels.forEach(function (cb) {
      cb.addEventListener('change', function () {
        colState[parseInt(cb.getAttribute('data-i'), 10)].selected = cb.checked;
        renderPreview();
      });
    });
    var renames = colPanel.querySelectorAll('.j2x-colrename');
    renames.forEach(function (inp) {
      inp.addEventListener('input', function () {
        colState[parseInt(inp.getAttribute('data-i'), 10)].name = inp.value;
        renderPreview();
      });
    });
    var moves = colPanel.querySelectorAll('.j2x-move');
    moves.forEach(function (b) {
      b.addEventListener('click', function () {
        var i = parseInt(b.getAttribute('data-i'), 10);
        var d = parseInt(b.getAttribute('data-d'), 10);
        var j = i + d;
        if (j < 0 || j >= colState.length) return;
        var t = colState[i]; colState[i] = colState[j]; colState[j] = t;
        renderCols(); renderPreview();
      });
    });
  }
  function setAll(v) {
    colState.forEach(function (c) { c.selected = v; });
    renderCols(); renderPreview();
  }

  /* ---------- 预览：分页表格 ---------- */
  function renderPreview() {
    var sel = selectedCols();
    summary.innerHTML = '共 <b>' + sheet.rows.length + '</b> 行 × <b>' + sheet.columns.length + '</b> 列' +
      '（已选 <b>' + sel.length + '</b> 列导出）· 缺失单元格留空';
    if (!sel.length) {
      previewBox.innerHTML = '<div class="j2x-empty">未勾选任何列，请至少勾选一列再预览/导出。</div>';
      pager.innerHTML = '';
      btnExport.disabled = true;
      return;
    }
    btnExport.disabled = false;
    var selIdx = sel.map(function (c) { return sheet.columns.indexOf(c.key); });
    var totalPages = Math.max(1, Math.ceil(sheet.rows.length / PAGE_SIZE));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * PAGE_SIZE;
    var slice = sheet.rows.slice(start, start + PAGE_SIZE);

    var html = '<div class="j2x-table-wrap"><table class="j2x-table"><thead><tr>';
    sel.forEach(function (c) { html += '<th>' + esc(c.name) + '</th>'; });
    html += '</tr></thead><tbody>';
    slice.forEach(function (r) {
      html += '<tr>' + selIdx.map(function (ci) {
        var v = r[ci];
        return '<td class="' + (typeof v === 'number' ? 'num' : '') + '">' + esc(cellText(v)) + '</td>';
      }).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    previewBox.innerHTML = html;

    pager.innerHTML = '<button class="btn btn-secondary j2x-mini" id="j2x-prev"' + (page <= 1 ? ' disabled' : '') + '>← 上一页</button>' +
      '<span class="j2x-pageinfo">第 ' + page + ' / ' + totalPages + ' 页（每页 ' + PAGE_SIZE + ' 行）</span>' +
      '<button class="btn btn-secondary j2x-mini" id="j2x-next"' + (page >= totalPages ? ' disabled' : '') + '>下一页 →</button>';
    var bp = $('j2x-prev'), bn = $('j2x-next');
    if (bp) bp.addEventListener('click', function () { if (page > 1) { page--; renderPreview(); } });
    if (bn) bn.addEventListener('click', function () { if (page < totalPages) { page++; renderPreview(); } });
  }

  /* ---------- 导出 .xlsx ---------- */
  function doExport() {
    if (!sheet) return;
    var sel = selectedCols();
    if (!sel.length) { fail('未勾选任何列，请至少勾选一列再导出。'); return; }
    clearErr();
    var X = window.XLSX;
    if (!X) {
      fail('本地 xlsx 库加载失败，请刷新页面后重试。数据未离开浏览器。');
      return;
    }
    try {
      var selIdx = sel.map(function (c) { return sheet.columns.indexOf(c.key); });
      var names = sel.map(function (c) { return c.name || c.key; });
      var mapped = sheet.rows.map(function (r) { return selIdx.map(function (ci) { return r[ci]; }); });
      var wb = buildWorkbook(X, { columns: sel.map(function (c) { return c.key; }), rows: mapped }, names);
      var fname = buildExcelFileName(new Date());
      X.writeFile(wb, fname);
      toast('已导出 ' + sel.length + ' 列 × ' + sheet.rows.length + ' 行到 ' + fname, true);
    } catch (e) {
      fail('生成 .xlsx 失败：' + (e && e.message ? e.message : e));
    }
  }

  /* ---------- 上传 .json：FileReader 本地读，不上传 ---------- */
  function readFile(f) {
    if (!f) return;
    if (!/\.json$/i.test(f.name) && !/json/.test(f.type || '')) {
      fail('请上传 .json 文件（当前：' + f.name + '）。');
      return;
    }
    if (f.size > MAX_TEXT_BYTES) { fail('文件超过 20MB 上限（真限制④），请拆小后重试。'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      input.value = rd.result;
      updateCount();
      toast('已读入「' + f.name + '」，点「解析并预览」开始转换。', true);
      clearErr();
    };
    rd.onerror = function () { fail('读取文件失败，请重试。'); };
    rd.readAsText(f, 'utf-8');
  }

  btnParse.addEventListener('click', doParse);
  btnSample.addEventListener('click', function () {
    input.value = SAMPLE;
    updateCount(); clearErr();
    toast('已填入示例 JSON，点「解析并预览」看效果。', true);
  });
  btnClear.addEventListener('click', function () {
    input.value = ''; sheet = null; colState = []; page = 1; updateCount();
    resultBox.style.display = 'none'; btnExport.disabled = true; clearErr(); toast('', true);
  });
  btnExport.addEventListener('click', doExport);
  input.addEventListener('input', updateCount);
  upload.addEventListener('click', function () { fileInput.click(); });
  upload.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', function () { readFile(fileInput.files[0]); fileInput.value = ''; });
  ['dragover', 'dragenter'].forEach(function (ev) {
    upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.remove('dragover'); });
  });
  upload.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    readFile(f);
  });
  updateCount();

  /* 示例 JSON：覆盖嵌套对象/数组点路径展平、缺失列留空 */
  var SAMPLE = [
    '[',
    '  {"name": "张三", "age": 28, "user": {"address": {"city": "深圳"}}, "tags": ["后端", "Go"]},',
    '  {"name": "李四", "age": 35, "user": {"address": {"city": "广州"}}, "tags": ["前端"]},',
    '  {"name": "王五", "user": {}, "tags": []},',
    '  {"name": "赵六", "age": 41, "vip": true, "user": {"address": {"city": "北京", "zip": "100000"}}}',
    ']'
  ].join('\n');
})();

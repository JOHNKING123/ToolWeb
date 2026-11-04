/* CSV 编辑器（csv_editor）- 纯前端零上传 CSV 在线编辑器
* 文件拖拽／选择打开（FileReader 本机读，不上传）＋空表格新建
* → 分隔符自动检测（逗号／分号／制表符三选）＋手动三选切换
* → RFC4180 常用子集解析（双引号包裹、双引号转义、字段内换行、CRLF、UTF-8 BOM）
* → 表格渲染（首行作表头，表头可编辑；上限 2000 行，超限截断＋提示）
* → 单元格双击原地编辑（Enter 确认／Esc 取消）→ 增删行／列（行尾／列尾追加＋选中行／列删除）
* → 导出 CSV 下载（当前分隔符；文件名可自定义，非法字符自动清理，默认 原文件名-edited）。
* 真限制：① 解析为 RFC4180 常用子集，极端不规范 CSV（如未闭合引号）可能解析偏差；
* ② 表格上限 2000 行，超限自动截断并提示（浏览器单页渲染性能边界）；
* ③ 所有编辑均在本地完成，文件内容不上传任何服务器。
* 零网络请求：本文件不发起任何请求；渲染一律用 textContent，
* 输入里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。
* 纯函数契约：挂 window.CSVEditor，module.exports 同步导出；
* 非法参数抛 Error，err.field 给出字段名，不静默钳制。 */
(function () {
'use strict';

function csvErr(message, field) {
var e = new Error(message);
e.field = field;
return e;
}

function isInt(x) {
return typeof x === 'number' && isFinite(x) && Math.floor(x) === x;
}

function isValidDelimiter(d) {
return d === ',' || d === ';' || d === '\t';
}

function isGrid(grid) {
if (!Array.isArray(grid)) return false;
for (var i = 0; i < grid.length; i++) {
if (!Array.isArray(grid[i])) return false;
}
return true;
}

function assertGrid(grid, fnName) {
if (!isGrid(grid)) throw csvErr(fnName + ': grid 必须为字符串二维数组', 'grid');
}

function maxCols(grid) {
var m = 0;
for (var i = 0; i < grid.length; i++) {
if (grid[i].length > m) m = grid[i].length;
}
return m;
}

function cloneGrid(grid) {
return grid.map(function (row) { return row.slice(); });
}

/* 分隔符自动检测：首行内三候选中出现次数最多者（引号内出现的不计）；
* 空文本回退 ','；text 非字符串抛错 err.field='text'。 */
function detectDelimiter(text) {
if (typeof text !== 'string') throw csvErr('detectDelimiter: text 必须为字符串', 'text');
var firstLine = (text.split(/\r\n|\n|\r/)[0] || '');
var counts = { ',': 0, ';': 0, '\t': 0 };
var inQuotes = false;
var i, c;
for (i = 0; i < firstLine.length; i++) {
c = firstLine.charAt(i);
if (c === '"') {
if (inQuotes && firstLine.charAt(i + 1) === '"') { i++; continue; }
inQuotes = !inQuotes;
continue;
}
if (!inQuotes && (c === ',' || c === ';' || c === '\t')) counts[c]++;
}
var order = [',', ';', '\t'];
var best = order[0];
var bestN = counts[best];
for (i = 1; i < order.length; i++) {
if (counts[order[i]] > bestN) { best = order[i]; bestN = counts[order[i]]; }
}
return best;
}

/* 手写 CSV 解析（RFC4180 常用子集）：双引号包裹、""转义、字段内换行、
* CRLF、UTF-8 BOM 剥离；尾部空行不计入。返回 string[][]。 */
function parseCSV(text, delimiter) {
if (typeof text !== 'string') throw csvErr('parseCSV: text 必须为字符串', 'text');
if (!isValidDelimiter(delimiter)) throw csvErr('parseCSV: delimiter 必须为逗号／分号／制表符之一', 'delimiter');
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
var rows = [];
var row = [];
var field = '';
var inQuotes = false;
var i, c, n;
for (i = 0; i < text.length; i++) {
c = text.charAt(i);
if (inQuotes) {
if (c === '"') {
n = text.charAt(i + 1);
if (n === '"') { field += '"'; i++; }
else { inQuotes = false; }
} else {
field += c;
}
} else if (c === '"') {
inQuotes = true;
} else if (c === delimiter) {
row.push(field); field = '';
} else if (c === '\r') {
/* CRLF 的 \r 忽略，换行以 \n 计 */
} else if (c === '\n') {
row.push(field); field = '';
rows.push(row); row = [];
} else {
field += c;
}
}
if (inQuotes || field !== '' || row.length > 0) {
row.push(field);
rows.push(row);
}
/* 尾部因末尾换行产生的单空字段行不计入 */
while (rows.length > 0) {
var last = rows[rows.length - 1];
if (last.length === 1 && last[0] === '') rows.pop();
else break;
}
return rows;
}

/* 序列化：含分隔符／双引号／换行（\n 或 \r）的字段加双引号包裹，
* 内部双引号翻倍转义；行间以 \n 连接。 */
function stringifyCSV(grid, delimiter) {
assertGrid(grid, 'stringifyCSV');
if (!isValidDelimiter(delimiter)) throw csvErr('stringifyCSV: delimiter 必须为逗号／分号／制表符之一', 'delimiter');
return grid.map(function (row) {
return row.map(function (cell) {
var s = (cell == null) ? '' : String(cell);
if (s.indexOf(delimiter) !== -1 || s.indexOf('"') !== -1 ||
s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
return '"' + s.replace(/"/g, '""') + '"';
}
return s;
}).join(delimiter);
}).join('\n');
}

/* 不可变更新单元格：返回新 grid，原 grid 不变；
* value 非字符串时 String(value) 归一化；下标越界或非整数抛错 err.field='cell'。 */
function setCell(grid, r, c, value) {
assertGrid(grid, 'setCell');
if (!isInt(r) || !isInt(c) || r < 0 || c < 0 || r >= grid.length || c >= grid[r].length) {
throw csvErr('setCell: 行列下标越界或非整数', 'cell');
}
var next = cloneGrid(grid);
next[r][c] = String(value);
return next;
}

/* 插入行：新行按当前最宽列数补空；index 缺省为末尾追加；
* index 非法抛错 err.field='index'。 */
function insertRow(grid, index) {
assertGrid(grid, 'insertRow');
var cols = maxCols(grid);
var idx = (index === undefined) ? grid.length : index;
if (!isInt(idx) || idx < 0 || idx > grid.length) throw csvErr('insertRow: index 必须为 0 到行数之间的整数', 'index');
var newRow = [];
for (var i = 0; i < cols; i++) newRow.push('');
var next = cloneGrid(grid);
next.splice(idx, 0, newRow);
return next;
}

/* 删除行：grid 为空抛错 err.field='grid'；index 非法抛错 err.field='index'。 */
function deleteRow(grid, index) {
assertGrid(grid, 'deleteRow');
if (grid.length === 0) throw csvErr('deleteRow: 表格为空，无行可删', 'grid');
if (!isInt(index) || index < 0 || index >= grid.length) throw csvErr('deleteRow: index 必须为 0 到行数-1 之间的整数', 'index');
var next = cloneGrid(grid);
next.splice(index, 1);
return next;
}

/* 插入列：index 缺省为末尾追加；index 非法抛错 err.field='index'。 */
function insertCol(grid, index) {
assertGrid(grid, 'insertCol');
var cols = maxCols(grid);
var idx = (index === undefined) ? cols : index;
if (!isInt(idx) || idx < 0 || idx > cols) throw csvErr('insertCol: index 必须为 0 到列数之间的整数', 'index');
return grid.map(function (row) {
var nr = row.slice();
nr.splice(Math.min(idx, nr.length), 0, '');
return nr;
});
}

/* 删除列：删至 0 列时保留 1 空列不抛错；
* 表格无列抛错 err.field='grid'；index 非法抛错 err.field='index'。 */
function deleteCol(grid, index) {
assertGrid(grid, 'deleteCol');
var cols = maxCols(grid);
if (cols === 0) throw csvErr('deleteCol: 表格为空，无列可删', 'grid');
if (!isInt(index) || index < 0 || index >= cols) throw csvErr('deleteCol: index 必须为 0 到列数-1 之间的整数', 'index');
if (cols === 1) {
return grid.map(function () { return ['']; });
}
return grid.map(function (row) {
var nr = row.slice();
if (index < nr.length) nr.splice(index, 1);
return nr;
});
}

/* 截断：返回 { grid, truncated }；超限保留头部 maxRows 行；
* maxRows 非正整数抛错 err.field='maxRows'。 */
function truncateGrid(grid, maxRows) {
assertGrid(grid, 'truncateGrid');
if (!isInt(maxRows) || maxRows <= 0) throw csvErr('truncateGrid: maxRows 必须为正整数', 'maxRows');
if (grid.length > maxRows) return { grid: grid.slice(0, maxRows), truncated: true };
return { grid: grid.slice(), truncated: false };
}

/* 文件名清理（沿用家族惯例）：去非法字符、首尾空白与点、
* 空白转连字符、最长 60；空文本回退 'csv-editor'。 */
function sanitizeFileName(text) {
var s = (text == null) ? '' : String(text);
s = s.replace(/[\\/:*?"<>\u0000-\u001f]/g, '');
s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
if (s.length === 0) return 'csv-editor';
return s;
}

var api = {
detectDelimiter: detectDelimiter,
parseCSV: parseCSV,
stringifyCSV: stringifyCSV,
setCell: setCell,
insertRow: insertRow,
deleteRow: deleteRow,
insertCol: insertCol,
deleteCol: deleteCol,
truncateGrid: truncateGrid,
sanitizeFileName: sanitizeFileName
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CSVEditor = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
var MAX_ROWS = 2000;
function $(id) { return document.getElementById(id); }

var state = {
grid: [],
rawText: '',
delim: ',',
truncated: false,
dirty: false,
selRow: -1,
selCol: -1
};

var dropEl, fileEl, tableWrapEl, warnEl, statsEl, fileNameEl;
var delimRadios = [];

function showWarn(msg) {
if (!warnEl) return;
if (msg) { warnEl.textContent = msg; warnEl.style.display = 'block'; }
else { warnEl.textContent = ''; warnEl.style.display = 'none'; }
}

function colName(i) {
var s = '';
i = i + 1;
while (i > 0) {
var m = (i - 1) % 26;
s = String.fromCharCode(65 + m) + s;
i = Math.floor((i - 1) / 26);
}
return s;
}

function delimLabel(d) {
if (d === ',') return '逗号(,)';
if (d === ';') return '分号(;)';
return '制表符(Tab)';
}

function syncDelimRadios() {
for (var i = 0; i < delimRadios.length; i++) {
var v = delimRadios[i].value;
delimRadios[i].checked = (v === 'tab' ? '\t' : v) === state.delim;
}
}

function applyParse() {
var rows = api.parseCSV(state.rawText, state.delim);
var t = api.truncateGrid(rows, MAX_ROWS);
state.grid = t.grid;
state.truncated = t.truncated;
state.dirty = false;
state.selRow = -1;
state.selCol = -1;
showWarn(t.truncated ?
'行数超过 ' + MAX_ROWS + '，已自动截断保留前 ' + MAX_ROWS + ' 行（浏览器单页渲染性能边界）。如需处理完整文件，请先在本地拆分。' : '');
renderTable();
}

function loadText(text, baseName) {
state.rawText = text;
state.delim = api.detectDelimiter(text);
syncDelimRadios();
applyParse();
if (baseName) {
var name = CSVEditor.sanitizeFileName(baseName + '-edited');
state.fileName = name;
if (fileNameEl) fileNameEl.value = name;
}
var autoEl = $('ce-delim-auto');
if (autoEl) autoEl.textContent = '（已自动检测为' + delimLabel(state.delim) + '）';
}

function loadFile(file) {
if (!file) return;
var reader = new FileReader();
reader.onload = function () {
var base = String(file.name || 'csv').replace(/\.[^.]*$/, '');
if (!base) base = 'csv';
loadText(String(reader.result || ''), base);
};
reader.onerror = function () {
showWarn('文件读取失败，请重试或换一个文件。');
};
reader.readAsText(file);
}

function startEdit(td, r, c) {
if (td.querySelector('input')) return;
var input = document.createElement('input');
input.type = 'text';
input.className = 'ce-edit';
input.value = state.grid[r][c];
input.setAttribute('aria-label', '编辑单元格');
td.textContent = '';
td.appendChild(input);
input.focus();
input.select();
var done = false;
function finish(commit) {
if (done) return;
done = true;
if (commit) {
state.grid = api.setCell(state.grid, r, c, input.value);
state.dirty = true;
}
renderTable();
}
input.addEventListener('keydown', function (ev) {
if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
});
input.addEventListener('blur', function () { finish(true); });
}

function renderTable() {
if (!tableWrapEl) return;
tableWrapEl.textContent = '';
if (state.grid.length === 0) {
var empty = document.createElement('p');
empty.className = 'ce-empty';
empty.textContent = '暂无表格：拖拽 CSV 文件到上方区域、点「选择文件」，或新建一个空表格开始编辑。';
tableWrapEl.appendChild(empty);
updateStats();
return;
}
var cols = 0;
for (var i = 0; i < state.grid.length; i++) {
if (state.grid[i].length > cols) cols = state.grid[i].length;
}
var table = document.createElement('table');
table.className = 'ce-table';
var thead = document.createElement('thead');
/* 列字母选择行：点击选中整列 */
var selRow = document.createElement('tr');
var corner0 = document.createElement('th');
corner0.className = 'ce-corner';
corner0.textContent = '列';
selRow.appendChild(corner0);
for (var c = 0; c < cols; c++) {
(function (cc) {
var th = document.createElement('th');
th.className = 'ce-colsel' + (state.selCol === cc ? ' ce-selected' : '');
var btn = document.createElement('button');
btn.type = 'button';
btn.className = 'ce-colbtn';
btn.textContent = colName(cc);
btn.title = '选中第 ' + (cc + 1) + ' 列';
btn.addEventListener('click', function () {
state.selCol = (state.selCol === cc) ? -1 : cc;
renderTable();
});
th.appendChild(btn);
selRow.appendChild(th);
})(c);
}
thead.appendChild(selRow);
/* 表头行（grid[0]）：双击可编辑 */
var hr = document.createElement('tr');
var corner1 = document.createElement('th');
corner1.className = 'ce-corner';
corner1.textContent = '行';
hr.appendChild(corner1);
for (var hc = 0; hc < cols; hc++) {
(function (rr, ccc) {
var th = document.createElement('th');
th.className = 'ce-th';
th.textContent = state.grid[rr][ccc] || '';
th.title = '双击编辑表头';
th.addEventListener('dblclick', function () { startEdit(th, rr, ccc); });
hr.appendChild(th);
})(0, hc);
}
thead.appendChild(hr);
table.appendChild(thead);
var tbody = document.createElement('tbody');
for (var r = 1; r < state.grid.length; r++) {
(function (rr) {
var tr = document.createElement('tr');
var num = document.createElement('th');
num.className = 'ce-rownum' + (state.selRow === rr ? ' ce-selected' : '');
var nbtn = document.createElement('button');
nbtn.type = 'button';
nbtn.className = 'ce-rowbtn';
nbtn.textContent = String(rr + 1);
nbtn.title = '选中第 ' + (rr + 1) + ' 行';
nbtn.addEventListener('click', function () {
state.selRow = (state.selRow === rr) ? -1 : rr;
renderTable();
});
num.appendChild(nbtn);
tr.appendChild(num);
for (var cc = 0; cc < cols; cc++) {
(function (ccc) {
var td = document.createElement('td');
td.textContent = state.grid[rr][ccc] || '';
td.title = '双击编辑';
td.addEventListener('dblclick', function () { startEdit(td, rr, ccc); });
tr.appendChild(td);
})(cc);
}
tbody.appendChild(tr);
})(r);
}
table.appendChild(tbody);
var scroller = document.createElement('div');
scroller.className = 'ce-scroll';
scroller.appendChild(table);
tableWrapEl.appendChild(scroller);
updateStats();
updateRowColButtons();
}

function updateStats() {
if (!statsEl) return;
var cols = 0;
for (var i = 0; i < state.grid.length; i++) {
if (state.grid[i].length > cols) cols = state.grid[i].length;
}
var t = '共 ' + state.grid.length + ' 行 × ' + cols + ' 列';
if (state.truncated) t += '（已截断前 ' + MAX_ROWS + ' 行）';
if (state.dirty) t += ' · 有未导出的修改';
statsEl.textContent = t;
}

function updateRowColButtons() {
var delRowBtn = $('ce-del-row');
var delColBtn = $('ce-del-col');
if (delRowBtn) delRowBtn.disabled = state.selRow < 1;
if (delColBtn) delColBtn.disabled = state.selCol < 0;
}

function doExport() {
if (state.grid.length === 0) { showWarn('表格为空，无法导出。'); return; }
var csv = api.stringifyCSV(state.grid, state.delim);
var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = CSVEditor.sanitizeFileName(fileNameEl ? fileNameEl.value : '') + '.csv';
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 200);
state.dirty = false;
updateStats();
}

function bindPage() {
dropEl = $('ce-drop');
fileEl = $('ce-file');
tableWrapEl = $('ce-table-wrap');
warnEl = $('ce-warn');
statsEl = $('ce-stats');
fileNameEl = $('ce-filename');
delimRadios = [];
var inputs = document.querySelectorAll('input[name="ce-delim"]');
for (var i = 0; i < inputs.length; i++) delimRadios.push(inputs[i]);
if (dropEl) {
dropEl.addEventListener('click', function () { if (fileEl) fileEl.click(); });
dropEl.addEventListener('dragover', function (ev) {
ev.preventDefault();
dropEl.classList.add('ce-dragover');
});
dropEl.addEventListener('dragleave', function () { dropEl.classList.remove('ce-dragover'); });
dropEl.addEventListener('drop', function (ev) {
ev.preventDefault();
dropEl.classList.remove('ce-dragover');
var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
if (f) loadFile(f);
});
}
if (fileEl) fileEl.addEventListener('change', function () {
var f = fileEl.files && fileEl.files[0];
if (f) loadFile(f);
fileEl.value = '';
});
for (i = 0; i < delimRadios.length; i++) {
delimRadios[i].addEventListener('change', function () {
var v = this.value;
var d = (v === 'tab') ? '\t' : v;
if (d === state.delim) return;
if (state.dirty && state.rawText !== '' &&
!window.confirm('切换分隔符将从原文重新解析，未导出的编辑会丢失，继续吗？')) {
syncDelimRadios();
return;
}
state.delim = d;
applyParse();
});
}
var newBtn = $('ce-new');
if (newBtn) newBtn.addEventListener('click', function () {
var rowsEl = $('ce-new-rows');
var colsEl = $('ce-new-cols');
var rn = rowsEl ? parseInt(rowsEl.value, 10) : 5;
var cn = colsEl ? parseInt(colsEl.value, 10) : 4;
if (!rn || rn < 1) rn = 5;
if (!cn || cn < 1) cn = 4;
if (rn > MAX_ROWS) rn = MAX_ROWS;
if (cn > 52) cn = 52;
var grid = [];
for (var r = 0; r < rn; r++) {
var row = [];
for (var c = 0; c < cn; c++) row.push('');
grid.push(row);
}
state.rawText = '';
state.grid = grid;
state.truncated = false;
state.dirty = false;
state.selRow = -1;
state.selCol = -1;
showWarn('');
renderTable();
if (fileNameEl) fileNameEl.value = 'csv-editor';
});
var addRowBtn = $('ce-add-row');
if (addRowBtn) addRowBtn.addEventListener('click', function () {
state.grid = api.insertRow(state.grid);
state.dirty = true;
renderTable();
});
var addColBtn = $('ce-add-col');
if (addColBtn) addColBtn.addEventListener('click', function () {
state.grid = api.insertCol(state.grid);
state.dirty = true;
renderTable();
});
var delRowBtn = $('ce-del-row');
if (delRowBtn) delRowBtn.addEventListener('click', function () {
if (state.selRow < 1) return;
if (!window.confirm('删除第 ' + (state.selRow + 1) + ' 行？此操作不可撤销。')) return;
state.grid = api.deleteRow(state.grid, state.selRow);
state.selRow = -1;
state.dirty = true;
renderTable();
});
var delColBtn = $('ce-del-col');
if (delColBtn) delColBtn.addEventListener('click', function () {
if (state.selCol < 0) return;
if (!window.confirm('删除第 ' + (state.selCol + 1) + ' 列（' + colName(state.selCol) + '列）？此操作不可撤销。')) return;
state.grid = api.deleteCol(state.grid, state.selCol);
state.selCol = -1;
state.dirty = true;
renderTable();
});
var exportBtn = $('ce-export');
if (exportBtn) exportBtn.addEventListener('click', doExport);
renderTable();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
else bindPage();
}
})();

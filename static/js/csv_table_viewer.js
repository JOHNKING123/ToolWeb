/* CSV 表格查看器（csv_table_viewer）- 纯前端零上传 CSV 查看／排序／筛选／分页
* 粘贴 CSV 或本地 .csv 读取（FileReader 本机读，不上传）→ 手写 CSV 解析
* （引号包字段、转义双引号、字段内换行、CRLF、UTF-8 BOM、短行补空）
* → 表头三态排序（数字按数值、文本按字符串、空值恒置末尾）
* → 全局搜索＋每列筛选叠加 → 分页渲染（50／100／200 行可选）。
* 真限制：只查看／排序／筛选，不编辑、不转换、不保存、不导出；
* 分隔符仅支持逗号／分号／制表符三选；超大文件只做前端分页渲染，
* 建议先在本地拆分；不做日期、金额语义校验与合计。
* 零网络请求：本文件不发起任何请求；渲染一律用 textContent，
* 输入里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。 */
(function () {
'use strict';

function escapeHtml(s) {
return String(s == null ? '' : s)
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&#39;');
}

/* 手写 CSV 解析：返回 { rows, unclosedQuote }。
* rows 为字符串二维数组；解析结束仍在引号内即 unclosedQuote = true，
* 此时仍按已读内容尽力返回行，不丢数据，由调用方中文告警。 */
function parseCSV(text, delim) {
if (text == null) text = '';
text = String(text);
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
var rows = [];
var row = [];
var field = '';
var inQuotes = false;
var i;
for (i = 0; i < text.length; i++) {
var c = text.charAt(i);
if (inQuotes) {
if (c === '"') {
if (text.charAt(i + 1) === '"') { field += '"'; i++; }
else inQuotes = false;
} else {
field += c;
}
} else {
if (c === '"') {
if (field === '') inQuotes = true;
else field += c;
} else if (c === delim) {
row.push(field); field = '';
} else if (c === '\r') {
/* CRLF 的 \r 在此丢弃，换行由随后的 \n 触发；孤 \r 同样作行分隔。 */
if (text.charAt(i + 1) === '\n') { /* 等 \n 处理 */ }
else { row.push(field); field = ''; rows.push(row); row = []; }
} else if (c === '\n') {
row.push(field); field = ''; rows.push(row); row = [];
} else {
field += c;
}
}
}
var unclosedQuote = inQuotes;
if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
/* 空尾行：末尾连续的空行（单空字段行）不计入行数。 */
while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
rows.pop();
}
return { rows: rows, unclosedQuote: unclosedQuote };
}

/* 行列归一：headerOn 时首行作表头，否则自动生成「列1、列2…」；
* 短行按最宽行补空串；空输入返回空表头与空体。 */
function normalizeRows(rows, headerOn) {
rows = rows || [];
var width = 0;
var r;
for (r = 0; r < rows.length; r++) {
if (rows[r].length > width) width = rows[r].length;
}
function pad(row) {
var out = row.slice();
while (out.length < width) out.push('');
return out;
}
if (rows.length === 0) return { headers: [], body: [] };
if (headerOn) {
var headers = pad(rows[0]);
var body = [];
for (r = 1; r < rows.length; r++) body.push(pad(rows[r]));
return { headers: headers, body: body };
}
var autoHeaders = [];
var c;
for (c = 0; c < width; c++) autoHeaders.push('列' + (c + 1));
var autoBody = [];
for (r = 0; r < rows.length; r++) autoBody.push(pad(rows[r]));
return { headers: autoHeaders, body: autoBody };
}

/* 是否可按数值比较：非空值全部能解析为有限数字（前后空白不计）。 */
function isNumericColumn(body, colIdx) {
var seen = false;
var i;
for (i = 0; i < body.length; i++) {
var v = (body[i][colIdx] || '').trim();
if (v === '') continue;
if (!isFinite(Number(v))) return false;
seen = true;
}
return seen;
}

/* 排序：dir 为 'asc' | 'desc' | null；null 返回原序副本。
* 空值（空串或全空白）恒置末尾，与升降序无关；数字列按数值排，
* 文本列按字符串排（简单码点比较，保证 node 与浏览器结果一致）。 */
function sortRows(body, colIdx, dir) {
if (!dir) return (body || []).slice();
var numeric = isNumericColumn(body, colIdx);
function cmp(a, b) {
var va = (a[colIdx] || '');
var vb = (b[colIdx] || '');
var ea = va.trim() === '';
var eb = vb.trim() === '';
if (ea && eb) return 0;
if (ea) return 1;
if (eb) return -1;
var res;
if (numeric) {
res = Number(va.trim()) - Number(vb.trim());
} else if (va < vb) {
res = -1;
} else if (va > vb) {
res = 1;
} else {
res = 0;
}
return dir === 'desc' ? -res : res;
}
return (body || []).slice().sort(cmp);
}

/* 筛选：全局搜索命中任意列即保留；每列筛选为文本包含匹配；
* 两者叠加生效（AND）；匹配不区分大小写；空条件不过滤。 */
function filterRows(body, query, colFilters) {
var q = (query || '').trim().toLowerCase();
var filters = colFilters || [];
function cellMatch(cell, needle) {
return String(cell == null ? '' : cell).toLowerCase().indexOf(needle) !== -1;
}
return (body || []).filter(function (row) {
var i;
if (q) {
var hit = false;
for (i = 0; i < row.length; i++) {
if (cellMatch(row[i], q)) { hit = true; break; }
}
if (!hit) return false;
}
for (i = 0; i < filters.length; i++) {
var f = (filters[i] || '').trim().toLowerCase();
if (f && !cellMatch(row[i], f)) return false;
}
return true;
});
}

/* 分页：page 从 1 起；pageSize 非法时回落 50；页码钳制到合法范围；
* 返回 { pageRows, totalPages, page }，不一次性渲染全部行由调用方保证。 */
function paginate(rows, page, pageSize) {
var size = parseInt(pageSize, 10);
if (!size || size <= 0) size = 50;
var totalPages = Math.max(1, Math.ceil((rows || []).length / size));
var p = parseInt(page, 10);
if (!p || p < 1) p = 1;
if (p > totalPages) p = totalPages;
var start = (p - 1) * size;
return { pageRows: (rows || []).slice(start, start + size), totalPages: totalPages, page: p };
}

/* 下一排序态：null → asc → desc → null（三态循环）。 */
function nextSortDir(dir) {
if (!dir) return 'asc';
if (dir === 'asc') return 'desc';
return null;
}

var SAMPLE_EMPLOYEES = '姓名,部门,入职年份,月薪\n' +
'张伟,研发,2019,18500\n' +
'李娜,产品,2021,16200\n' +
'王强,研发,2018,21000\n' +
'赵敏,运营,2022,12800\n' +
'刘洋,研发,2020,\n' +
'"陈,晨",市场,2021,14300\n' +
'周杰,产品,2019,17500';
var SAMPLE_ORDERS = '订单号,客户,商品,数量,单价,下单日期\n' +
'OD1001,张伟,"无线鼠标,静音款",2,89,2026-10-20\n' +
'OD1002,李娜,机械键盘,1,459,2026-10-21\n' +
'OD1003,王强,"显示器 27""寸",1,1299,2026-10-22\n' +
'OD1004,赵敏,鼠标垫,3,45,2026-10-23\n' +
'OD1005,刘洋,耳机,1,,\n' +
'OD1006,"陈,晨",键盘托,2,129,2026-10-24';

var api = {
escapeHtml: escapeHtml,
parseCSV: parseCSV,
normalizeRows: normalizeRows,
isNumericColumn: isNumericColumn,
sortRows: sortRows,
filterRows: filterRows,
paginate: paginate,
nextSortDir: nextSortDir,
SAMPLE_EMPLOYEES: SAMPLE_EMPLOYEES,
SAMPLE_ORDERS: SAMPLE_ORDERS
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CsvTableViewer = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
function $(id) { return document.getElementById(id); }

var state = {
headers: [], body: [], totalRows: 0,
sortCol: -1, sortDir: null, page: 1
};

function currentDelim() {
var els = document.querySelectorAll('input[name="ctv-delim"]');
var i;
for (i = 0; i < els.length; i++) {
if (els[i].checked) return els[i].value === 'tab' ? '\t' : els[i].value;
}
return ',';
}

function readInput() {
var text = $('ctv-input') ? $('ctv-input').value : '';
var parsed = parseCSV(text, currentDelim());
var headerOn = !$('ctv-no-header') || !$('ctv-no-header').checked;
var norm = normalizeRows(parsed.rows, headerOn);
state.headers = norm.headers;
state.body = norm.body;
state.totalRows = norm.body.length;
var warnEl = $('ctv-warn');
if (warnEl) {
if (parsed.unclosedQuote) {
warnEl.style.display = 'block';
warnEl.textContent = '解析告警：输入中存在未闭合的引号，已按已读内容尽力渲染，下表可能不完整，请检查引号是否成对。';
} else {
warnEl.style.display = 'none';
warnEl.textContent = '';
}
}
}

function getColFilters() {
var inputs = document.querySelectorAll('.ctv-col-filter');
var out = [];
var i;
for (i = 0; i < inputs.length; i++) out.push(inputs[i].value || '');
return out;
}

function renderAll() {
var prevFilters = getColFilters();
var activeCol = null;
var selStart = null;
var selEnd = null;
if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('ctv-col-filter')) {
activeCol = document.activeElement.getAttribute('data-col');
selStart = document.activeElement.selectionStart;
selEnd = document.activeElement.selectionEnd;
}
readInput();
var query = $('ctv-search') ? $('ctv-search').value : '';
var filtered = filterRows(state.body, query, getColFilters());
var sorted = state.sortCol >= 0 ? sortRows(filtered, state.sortCol, state.sortDir) : filtered;
var sizeEl = $('ctv-page-size');
var pageSize = sizeEl ? sizeEl.value : '50';
var pg = paginate(sorted, state.page, pageSize);
state.page = pg.page;
var statsEl = $('ctv-stats');
if (statsEl) {
statsEl.textContent = '共 ' + state.totalRows + ' 行，筛选后 ' + filtered.length + ' 行，第 ' + pg.page + ' / ' + pg.totalPages + ' 页';
}
var pageInfo = $('ctv-page-info');
if (pageInfo) pageInfo.textContent = '第 ' + pg.page + ' / ' + pg.totalPages + ' 页';
var jumpEl = $('ctv-page-jump');
if (jumpEl) jumpEl.value = pg.page;
var prevBtn = $('ctv-prev');
var nextBtn = $('ctv-next');
if (prevBtn) prevBtn.disabled = pg.page <= 1;
if (nextBtn) nextBtn.disabled = pg.page >= pg.totalPages;
var tableWrap = $('ctv-table-wrap');
if (!tableWrap) return;
if (state.headers.length === 0) {
tableWrap.textContent = '暂无表格：请先粘贴 CSV 或载入示例。';
return;
}
tableWrap.textContent = '';
var table = document.createElement('table');
table.className = 'ctv-table';
var thead = document.createElement('thead');
var headRow = document.createElement('tr');
state.headers.forEach(function (h, idx) {
var th = document.createElement('th');
th.className = 'ctv-th';
th.title = '点击排序：升序 → 降序 → 取消';
var label = document.createElement('span');
label.textContent = h;
th.appendChild(label);
if (state.sortCol === idx && state.sortDir) {
var arrow = document.createElement('span');
arrow.textContent = state.sortDir === 'asc' ? ' ▲' : ' ▼';
th.appendChild(arrow);
}
th.addEventListener('click', function () {
if (state.sortCol === idx) {
state.sortDir = nextSortDir(state.sortDir);
if (!state.sortDir) state.sortCol = -1;
} else {
state.sortCol = idx;
state.sortDir = 'asc';
}
state.page = 1;
renderAll();
});
headRow.appendChild(th);
});
thead.appendChild(headRow);
var filterRow = document.createElement('tr');
state.headers.forEach(function (h, idx) {
var th = document.createElement('th');
th.className = 'ctv-filter-th';
var input = document.createElement('input');
input.type = 'text';
input.className = 'ctv-col-filter';
input.setAttribute('data-col', String(idx));
input.placeholder = '筛选' + h;
input.setAttribute('aria-label', '筛选列' + h);
var keep = prevFilters[idx];
if (keep) input.value = keep;
input.addEventListener('input', function () { state.page = 1; renderAll(); });
input.addEventListener('click', function (e) { e.stopPropagation(); });
th.appendChild(input);
filterRow.appendChild(th);
});
thead.appendChild(filterRow);
table.appendChild(thead);
var tbody = document.createElement('tbody');
pg.pageRows.forEach(function (row) {
var tr = document.createElement('tr');
row.forEach(function (cell) {
var td = document.createElement('td');
td.textContent = cell;
tr.appendChild(td);
});
tbody.appendChild(tr);
});
table.appendChild(tbody);
tableWrap.appendChild(table);
if (pg.pageRows.length === 0) {
var empty = document.createElement('p');
empty.className = 'ctv-empty';
empty.textContent = state.totalRows === 0 ? '暂无数据：请粘贴 CSV 或载入示例。' : '筛选后无匹配行：请放宽搜索或列筛选条件。';
tableWrap.appendChild(empty);
}
/* 焦点恢复：列筛选输入触发的重建会销毁旧 input，须把焦点与光标
* 交还同列新 input，否则每敲一字就丢焦点、无法连续输入。 */
if (activeCol !== null) {
var restored = tableWrap.querySelector('.ctv-col-filter[data-col="' + activeCol + '"]');
if (restored) {
restored.focus();
if (selStart !== null) {
try { restored.setSelectionRange(selStart, selEnd); } catch (e) { /* 旧浏览器忽略光标恢复 */ }
}
}
}
}

function bindPage() {
var inputEl = $('ctv-input');
if (inputEl) inputEl.addEventListener('input', function () { state.page = 1; renderAll(); });
var dels = document.querySelectorAll('input[name="ctv-delim"]');
for (var d = 0; d < dels.length; d++) {
dels[d].addEventListener('change', function () { state.page = 1; renderAll(); });
}
var headerEl = $('ctv-no-header');
if (headerEl) headerEl.addEventListener('change', function () { state.page = 1; renderAll(); });
var searchEl = $('ctv-search');
if (searchEl) searchEl.addEventListener('input', function () { state.page = 1; renderAll(); });
var sizeEl = $('ctv-page-size');
if (sizeEl) sizeEl.addEventListener('change', function () { state.page = 1; renderAll(); });
var fileEl = $('ctv-file');
if (fileEl) fileEl.addEventListener('change', function () {
var f = fileEl.files && fileEl.files[0];
if (!f) return;
var reader = new FileReader();
reader.onload = function () {
if (inputEl) inputEl.value = reader.result || '';
state.page = 1;
renderAll();
};
reader.readAsText(f);
});
function clearColFilters() {
var inputs = document.querySelectorAll('.ctv-col-filter');
for (var i = 0; i < inputs.length; i++) inputs[i].value = '';
}
function loadSample(text) {
if (inputEl) inputEl.value = text;
state.sortCol = -1; state.sortDir = null; state.page = 1;
if (searchEl) searchEl.value = '';
clearColFilters();
renderAll();
}
var s1 = $('ctv-sample-employees');
if (s1) s1.addEventListener('click', function () { loadSample(SAMPLE_EMPLOYEES); });
var s2 = $('ctv-sample-orders');
if (s2) s2.addEventListener('click', function () { loadSample(SAMPLE_ORDERS); });
var clearBtn = $('ctv-clear');
if (clearBtn) clearBtn.addEventListener('click', function () {
if (inputEl) inputEl.value = '';
state.sortCol = -1; state.sortDir = null; state.page = 1;
if (searchEl) searchEl.value = '';
clearColFilters();
renderAll();
});
var resetBtn = $('ctv-reset');
if (resetBtn) resetBtn.addEventListener('click', function () {
state.sortCol = -1; state.sortDir = null; state.page = 1;
if (searchEl) searchEl.value = '';
var inputs = document.querySelectorAll('.ctv-col-filter');
for (var i = 0; i < inputs.length; i++) inputs[i].value = '';
renderAll();
});
var prevBtn = $('ctv-prev');
if (prevBtn) prevBtn.addEventListener('click', function () { state.page = Math.max(1, state.page - 1); renderAll(); });
var nextBtn = $('ctv-next');
if (nextBtn) nextBtn.addEventListener('click', function () { state.page = state.page + 1; renderAll(); });
var goBtn = $('ctv-page-go');
if (goBtn) goBtn.addEventListener('click', function () {
var jumpEl = $('ctv-page-jump');
var p = jumpEl ? parseInt(jumpEl.value, 10) : NaN;
if (p && p >= 1) { state.page = p; renderAll(); }
});
renderAll();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
else bindPage();
}
})();

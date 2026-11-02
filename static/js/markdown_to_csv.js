/* Markdown 表格转 CSV（markdown_to_csv）- 纯前端零上传 GFM 表格→CSV 导出
* 粘贴 Markdown 文本或本地 .md 读取（FileReader 本机读，不上传）
* → 手写 GFM 表格解析（转义管道 \|、分隔对齐行 :---／---:／:---:）
* → HTML 表格实时预览（按列对齐渲染）→ 一键导出 .csv
* （UTF-8 with BOM，Excel 打开中文不乱码）。
* 真限制：只解析标准 GFM 表格，合并单元格不支持（页面明示）；
* 一次解析取首个表格；CSV 为 UTF-8 with BOM；纯本地零上传。
* 零网络请求：本文件不发起任何请求；渲染一律用 textContent，
* 输入里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。 */
(function () {
'use strict';

/* 参数错误构造：err.field 为字段名，调用方按字段名定位问题，不静默钳制。 */
function paramError(field, message) {
var e = new Error(message);
e.field = field;
return e;
}

/* 拆分表格行：按未转义的竖线切分，\| 还原为字面竖线；
* 首尾管道产生的空单元去掉；每格 trim。 */
function splitRow(line) {
var s = String(line);
var cells = [];
var cur = '';
var i, c;
for (i = 0; i < s.length; i++) {
c = s.charAt(i);
if (c === '\\' && s.charAt(i + 1) === '|') { cur += '|'; i++; }
else if (c === '|') { cells.push(cur); cur = ''; }
else { cur += c; }
}
cells.push(cur);
var leftTrimmed = s.replace(/^\s*/, '');
var rightTrimmed = s.replace(/\s*$/, '');
if (cells.length > 0 && leftTrimmed.charAt(0) === '|') cells.shift();
if (cells.length > 0 && rightTrimmed.charAt(rightTrimmed.length - 1) === '|') cells.pop();
var out = [];
for (i = 0; i < cells.length; i++) out.push(cells[i].trim());
return out;
}

/* 识别 GFM 分隔对齐行：每格须形如 :---／---:／:---:／---（冒号可选、至少一横线）。
* 返回每列 'left' | 'center' | 'right' 数组；不是对齐行返回 null。
* line 非字符串抛 Error，err.field = 'line'。 */
function detectAlignmentRow(line) {
if (typeof line !== 'string') throw paramError('line', 'detectAlignmentRow: line 必须为字符串');
var cells = splitRow(line);
if (cells.length === 0) return null;
var out = [];
var i, t;
for (i = 0; i < cells.length; i++) {
t = cells[i];
if (!/^:?-+:?$/.test(t)) return null;
if (t.charAt(0) === ':' && t.charAt(t.length - 1) === ':') out.push('center');
else if (t.charAt(t.length - 1) === ':') out.push('right');
else out.push('left');
}
return out;
}

/* 解析 Markdown 文本中的首个 GFM 表格：
* 表头行（含竖线）＋紧随的分隔对齐行＋连续的数据行（含竖线即收，遇无竖线行止）。
* 返回 { headers, rows, alignments }；列数按三者最宽者对齐补空。
* text 非字符串抛 Error，err.field = 'text'；找不到表格抛 Error，err.field = 'table'。 */
function parseMarkdownTable(text) {
if (typeof text !== 'string') throw paramError('text', 'parseMarkdownTable: text 必须为字符串');
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
var lines = text.split(/\r\n|\r|\n/);
var headerIdx = -1;
var aligns = null;
var i;
for (i = 0; i + 1 < lines.length; i++) {
if (lines[i].indexOf('|') === -1) continue;
var a = detectAlignmentRow(lines[i + 1]);
if (a !== null) { headerIdx = i; aligns = a; break; }
}
if (headerIdx === -1) throw paramError('table', 'parseMarkdownTable: 未检测到 Markdown 表格（需要表头行＋分隔对齐行）');
var headers = splitRow(lines[headerIdx]);
var width = Math.max(headers.length, aligns.length);
function pad(arr, fill) {
var out = arr.slice();
while (out.length < width) out.push(fill);
return out.slice(0, width);
}
headers = pad(headers, '');
aligns = pad(aligns, 'left');
var rows = [];
for (i = headerIdx + 2; i < lines.length; i++) {
if (lines[i].indexOf('|') === -1) break;
rows.push(pad(splitRow(lines[i]), ''));
}
return { headers: headers, rows: rows, alignments: aligns };
}

/* CSV 字段转义（RFC4180 口径）：含逗号／双引号／换回车时整体加双引号，
* 内部双引号双写；其余原样返回。
* field 非字符串抛 Error，err.field = 'field'。 */
function escapeCsvField(field) {
if (typeof field !== 'string') throw paramError('field', 'escapeCsvField: field 必须为字符串');
if (/[",\r\n]/.test(field)) return '"' + field.replace(/"/g, '""') + '"';
return field;
}

/* 由解析结果生成 CSV 文本：表头＋数据行，逗号分隔，LF 换行（BOM 由调用方加）。 */
function buildCsvText(parsed) {
parsed = parsed || { headers: [], rows: [] };
var lines = [];
function joinRow(cells) {
var out = [];
var i;
for (i = 0; i < cells.length; i++) out.push(escapeCsvField(cells[i]));
return out.join(',');
}
if (parsed.headers && parsed.headers.length > 0) lines.push(joinRow(parsed.headers));
var r;
for (r = 0; r < (parsed.rows || []).length; r++) lines.push(joinRow(parsed.rows[r]));
return lines.join('\n');
}

/* 导出文件名：markdown_table_YYYYMMDD_HHmmss.csv（本地时间，零填充）。 */
function buildMarkdownCsvFileName(d) {
var t = d instanceof Date ? d : new Date();
function p(n) { return (n < 10 ? '0' : '') + n; }
return 'markdown_table_' + t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) +
'_' + p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds()) + '.csv';
}

var SAMPLE_BASIC = '| 姓名 | 部门 | 月薪 |\n' +
'| :--- | :--- | ---: |\n' +
'| 张伟 | 研发 | 18500 |\n' +
'| 李娜 | 产品 | 16200 |\n' +
'| 王强 | 研发 | 21000 |';
var SAMPLE_ESCAPE = '| 商品 | 规格\\|备注 | 单价 |\n' +
'| :--- | :---: | ---: |\n' +
'| 无线鼠标 | 静音款\\|2.4G | 89 |\n' +
'| 机械键盘 | 青轴\\|RGB | 459 |\n' +
'| "特价"显示器 | 27寸\\|IPS | 1299 |';

var api = {
parseMarkdownTable: parseMarkdownTable,
detectAlignmentRow: detectAlignmentRow,
escapeCsvField: escapeCsvField,
buildCsvText: buildCsvText,
buildMarkdownCsvFileName: buildMarkdownCsvFileName,
SAMPLE_BASIC: SAMPLE_BASIC,
SAMPLE_ESCAPE: SAMPLE_ESCAPE
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MarkdownToCsv = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
function $(id) { return document.getElementById(id); }

function renderAll() {
var text = $('mtc-input') ? $('mtc-input').value : '';
var warnEl = $('mtc-warn');
var prevWrap = $('mtc-preview-wrap');
var statsEl = $('mtc-stats');
var copyBtn = $('mtc-copy');
var dlBtn = $('mtc-download');
var parsed = null;
var errMsg = '';
try {
parsed = parseMarkdownTable(text);
} catch (e) {
errMsg = e && e.message ? e.message : '解析失败';
}
if (warnEl) {
if (parsed === null) {
warnEl.style.display = 'block';
warnEl.textContent = '未检测到 Markdown 表格：' + errMsg + '。请确认输入包含「表头行＋分隔对齐行」（如 | :--- | ---: |），合并单元格的表格暂不支持。';
} else {
warnEl.style.display = 'none';
warnEl.textContent = '';
}
}
if (prevWrap) {
prevWrap.textContent = '';
if (parsed !== null && parsed.headers.length > 0) {
var table = document.createElement('table');
table.className = 'mtc-table';
var thead = document.createElement('thead');
var trh = document.createElement('tr');
var i, c;
for (i = 0; i < parsed.headers.length; i++) {
var th = document.createElement('th');
th.textContent = parsed.headers[i];
th.style.textAlign = parsed.alignments[i] === 'center' ? 'center' : (parsed.alignments[i] === 'right' ? 'right' : 'left');
trh.appendChild(th);
}
thead.appendChild(trh);
table.appendChild(thead);
var tbody = document.createElement('tbody');
var r;
for (r = 0; r < parsed.rows.length; r++) {
var tr = document.createElement('tr');
for (c = 0; c < parsed.headers.length; c++) {
var td = document.createElement('td');
td.textContent = parsed.rows[r][c];
td.style.textAlign = parsed.alignments[c] === 'center' ? 'center' : (parsed.alignments[c] === 'right' ? 'right' : 'left');
tr.appendChild(td);
}
tbody.appendChild(tr);
}
table.appendChild(tbody);
prevWrap.appendChild(table);
} else {
prevWrap.textContent = '暂无表格：请先粘贴 Markdown 表格或载入示例。';
}
}
if (statsEl) {
statsEl.textContent = parsed === null
? '暂无表格：请先粘贴 Markdown 表格或载入示例。'
: '共 ' + parsed.headers.length + ' 列、' + parsed.rows.length + ' 行数据（不含表头）。';
}
if (copyBtn) copyBtn.disabled = parsed === null;
if (dlBtn) dlBtn.disabled = parsed === null;
}

function currentCsvText() {
var text = $('mtc-input') ? $('mtc-input').value : '';
try {
return buildCsvText(parseMarkdownTable(text));
} catch (e) {
return '';
}
}

function setInput(text) {
var input = $('mtc-input');
if (input) input.value = text;
renderAll();
}

function copyCsv() {
var hintEl = $('mtc-copy-hint');
var csv = currentCsvText();
if (csv === '') return;
function ok() {
if (hintEl) hintEl.textContent = '已复制到剪贴板。';
}
function fail() {
if (hintEl) hintEl.textContent = '复制失败：请先下载 CSV，再从文件复制。';
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(csv).then(ok, fail);
} else {
fail();
}
}

function downloadCsv() {
var csv = currentCsvText();
if (csv === '') return;
/* UTF-8 with BOM：Excel 打开中文不乱码。 */
var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = buildMarkdownCsvFileName();
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

document.addEventListener('DOMContentLoaded', function () {
var input = $('mtc-input');
if (input) input.addEventListener('input', renderAll);
var fileEl = $('mtc-file');
if (fileEl) {
fileEl.addEventListener('change', function () {
var f = fileEl.files && fileEl.files[0];
if (!f) return;
var reader = new FileReader();
reader.onload = function () { setInput(String(reader.result || '')); };
reader.readAsText(f);
});
}
var s1 = $('mtc-sample-basic');
if (s1) s1.addEventListener('click', function () { setInput(SAMPLE_BASIC); });
var s2 = $('mtc-sample-escape');
if (s2) s2.addEventListener('click', function () { setInput(SAMPLE_ESCAPE); });
var clearBtn = $('mtc-clear');
if (clearBtn) clearBtn.addEventListener('click', function () { setInput(''); });
var copyBtn = $('mtc-copy');
if (copyBtn) copyBtn.addEventListener('click', copyCsv);
var dlBtn = $('mtc-download');
if (dlBtn) dlBtn.addEventListener('click', downloadCsv);
renderAll();
});
}
})();

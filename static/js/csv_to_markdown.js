/* CSV→Markdown 表格生成器（csv_to_markdown）- 纯前端零上传 CSV→GFM 表格文本生成
* 粘贴 CSV 或本地 .csv 读取（FileReader 本机读，不上传）→ 手写 CSV 解析
* （引号包字段、转义双引号、字段内换行、CRLF、UTF-8 BOM、短行补空）
* → 标准 GFM 表格：表头行＋对齐行＋数据行，每列可单独选左／居中／右对齐
* （默认左对齐），一键全部对齐；单元格内竖线转义为 \|、换行展平为空格
* 并提示展平处数；空表头用「列 N」占位；一键复制、一键下载 table.md。
* 真限制：只做表格文本生成，不回写 CSV，不转 JSON／Excel；
* 合并／多行单元格只做展平提示；分隔符仅支持逗号／分号／制表符三选；
* 不做日期、金额语义校验与合计。
* 零网络请求：本文件不发起任何请求；渲染一律用 textContent，
* 输入里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。 */
(function () {
'use strict';

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
* 短行按最宽行补空串；空表头单元格（空串或全空白）用「列 N」占位；
* 空输入返回空表头与空体。 */
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
var rawHeaders = pad(rows[0]);
var headers = [];
var c;
for (c = 0; c < rawHeaders.length; c++) {
headers.push(rawHeaders[c].trim() === '' ? '列' + (c + 1) : rawHeaders[c]);
}
var body = [];
for (r = 1; r < rows.length; r++) body.push(pad(rows[r]));
return { headers: headers, body: body };
}
var autoHeaders = [];
var c2;
for (c2 = 0; c2 < width; c2++) autoHeaders.push('列' + (c2 + 1));
var autoBody = [];
for (r = 0; r < rows.length; r++) autoBody.push(pad(rows[r]));
return { headers: autoHeaders, body: autoBody };
}

/* 单元格转义：返回 { text, flattened }。
* 单元格内换行（CRLF／LF／孤 CR 各计 1 处）展平为空格；竖线转义为 \|；
* 首尾空格按原样保留，不破坏列结构。 */
function escapeCell(cell) {
var s = String(cell == null ? '' : cell);
var flattened = 0;
s = s.replace(/\r\n|\r|\n/g, function () { flattened++; return ' '; });
s = s.replace(/\|/g, '\\|');
return { text: s, flattened: flattened };
}

/* 对齐行单元格：left → :---，center → :---:，right → ---:；非法值回落左对齐。 */
function alignCell(align) {
if (align === 'center') return ':---:';
if (align === 'right') return '---:';
return ':---';
}

/* 生成 GFM 表格：返回 { markdown, flattened }。
* aligns 为每列 'left' | 'center' | 'right'，缺失或非法按左对齐；
* headers 为空时返回空串（空输入不输出误导性表格）；
* flattened 为全部单元格展平处数之和。 */
function generateMarkdown(headers, body, aligns) {
headers = headers || [];
body = body || [];
if (headers.length === 0) return { markdown: '', flattened: 0 };
var flattened = 0;
function esc(cell) {
var e = escapeCell(cell);
flattened += e.flattened;
return e.text;
}
var headerCells = [];
var sepCells = [];
var i;
for (i = 0; i < headers.length; i++) {
headerCells.push(esc(headers[i]));
sepCells.push(alignCell(aligns && aligns[i]));
}
var lines = [];
lines.push('| ' + headerCells.join(' | ') + ' |');
lines.push('| ' + sepCells.join(' | ') + ' |');
var r, c;
for (r = 0; r < body.length; r++) {
var cells = [];
for (c = 0; c < headers.length; c++) {
cells.push(esc(body[r][c] == null ? '' : body[r][c]));
}
lines.push('| ' + cells.join(' | ') + ' |');
}
return { markdown: lines.join('\n'), flattened: flattened };
}

/* 一站式：解析 → 归一 → 生成。返回 { markdown, flattened, unclosedQuote, headers, body }。 */
function buildMarkdown(text, delim, headerOn, aligns) {
var parsed = parseCSV(text, delim);
var norm = normalizeRows(parsed.rows, headerOn);
var gen = generateMarkdown(norm.headers, norm.body, aligns);
return {
markdown: gen.markdown,
flattened: gen.flattened,
unclosedQuote: parsed.unclosedQuote,
headers: norm.headers,
body: norm.body
};
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
parseCSV: parseCSV,
normalizeRows: normalizeRows,
escapeCell: escapeCell,
alignCell: alignCell,
generateMarkdown: generateMarkdown,
buildMarkdown: buildMarkdown,
SAMPLE_EMPLOYEES: SAMPLE_EMPLOYEES,
SAMPLE_ORDERS: SAMPLE_ORDERS
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CsvToMarkdown = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
function $(id) { return document.getElementById(id); }

var aligns = [];

function currentDelim() {
var els = document.querySelectorAll('input[name="ctm-delim"]');
var i;
for (i = 0; i < els.length; i++) {
if (els[i].checked) return els[i].value === 'tab' ? '\t' : els[i].value;
}
return ',';
}

function headerOn() {
return !$('ctm-no-header') || !$('ctm-no-header').checked;
}

/* 对齐选择区：列数变化时重建，每列保留旧对齐（新列默认左对齐）。 */
function renderAlignControls(headers) {
var wrap = $('ctm-align-wrap');
if (!wrap) return;
var prev = aligns.slice();
aligns = [];
var i;
for (i = 0; i < headers.length; i++) {
aligns.push(prev[i] === 'center' || prev[i] === 'right' ? prev[i] : 'left');
}
wrap.textContent = '';
if (headers.length === 0) {
wrap.textContent = '暂无列：请先粘贴 CSV 或载入示例。';
return;
}
for (i = 0; i < headers.length; i++) {
(function (idx) {
var label = document.createElement('label');
label.className = 'ctm-align-label';
label.textContent = headers[idx] + '：';
var sel = document.createElement('select');
sel.className = 'ctm-select';
sel.setAttribute('data-col', String(idx));
var opts = [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']];
var j;
for (j = 0; j < opts.length; j++) {
var o = document.createElement('option');
o.value = opts[j][0];
o.textContent = opts[j][1];
if (opts[j][0] === aligns[idx]) o.selected = true;
sel.appendChild(o);
}
sel.addEventListener('change', function () {
aligns[idx] = sel.value;
renderAll();
});
label.appendChild(sel);
wrap.appendChild(label);
})(i);
}
}

function renderAll() {
var text = $('ctm-input') ? $('ctm-input').value : '';
var parsed = parseCSV(text, currentDelim());
var norm = normalizeRows(parsed.rows, headerOn());
renderAlignControls(norm.headers);
var gen = generateMarkdown(norm.headers, norm.body, aligns);
var outEl = $('ctm-output');
var statsEl = $('ctm-stats');
var warnEl = $('ctm-warn');
var flatEl = $('ctm-flat');
if (warnEl) {
if (parsed.unclosedQuote) {
warnEl.style.display = 'block';
warnEl.textContent = '解析告警：输入中存在未闭合的引号，已按已读内容尽力生成，下表可能不完整，请检查引号是否成对，不要直接照搬。';
} else {
warnEl.style.display = 'none';
warnEl.textContent = '';
}
}
if (outEl) outEl.value = gen.markdown;
if (statsEl) {
if (norm.headers.length === 0) {
statsEl.textContent = '暂无表格：请先粘贴 CSV 或载入示例。';
} else {
statsEl.textContent = '共 ' + norm.headers.length + ' 列、' + norm.body.length + ' 行数据（不含表头）。';
}
}
if (flatEl) {
flatEl.textContent = gen.flattened > 0
? '提示：已把 ' + gen.flattened + ' 处单元格内换行展平为空格（多行单元格不保留多行结构）。'
: '单元格内无换行需要展平。';
}
var copyBtn = $('ctm-copy');
var dlBtn = $('ctm-download');
if (copyBtn) copyBtn.disabled = gen.markdown === '';
if (dlBtn) dlBtn.disabled = gen.markdown === '';
}

function setInput(text) {
var input = $('ctm-input');
if (input) input.value = text;
renderAll();
}

function copyOutput() {
var outEl = $('ctm-output');
var hintEl = $('ctm-copy-hint');
if (!outEl || outEl.value === '') return;
function ok() {
if (hintEl) hintEl.textContent = '已复制到剪贴板。';
}
function fail() {
if (hintEl) hintEl.textContent = '复制失败：请手动全选输出框内容复制（点击输出框，按 Ctrl+A 全选，再按 Ctrl+C 复制）。';
if (outEl) { outEl.focus(); outEl.select(); }
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(outEl.value).then(ok, fail);
} else {
outEl.focus();
outEl.select();
try {
if (document.execCommand('copy')) ok();
else fail();
} catch (e) { fail(); }
}
}

function downloadOutput() {
var outEl = $('ctm-output');
if (!outEl || outEl.value === '') return;
var blob = new Blob([outEl.value], { type: 'text/markdown;charset=utf-8' });
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'table.md';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

document.addEventListener('DOMContentLoaded', function () {
var input = $('ctm-input');
if (input) input.addEventListener('input', renderAll);
var delims = document.querySelectorAll('input[name="ctm-delim"]');
var d;
for (d = 0; d < delims.length; d++) {
delims[d].addEventListener('change', renderAll);
}
var noHeader = $('ctm-no-header');
if (noHeader) noHeader.addEventListener('change', renderAll);
var fileEl = $('ctm-file');
if (fileEl) {
fileEl.addEventListener('change', function () {
var f = fileEl.files && fileEl.files[0];
if (!f) return;
var reader = new FileReader();
reader.onload = function () { setInput(String(reader.result || '')); };
reader.readAsText(f);
});
}
var empBtn = $('ctm-sample-employees');
if (empBtn) empBtn.addEventListener('click', function () { setInput(SAMPLE_EMPLOYEES); });
var ordBtn = $('ctm-sample-orders');
if (ordBtn) ordBtn.addEventListener('click', function () { setInput(SAMPLE_ORDERS); });
var clearBtn = $('ctm-clear');
if (clearBtn) clearBtn.addEventListener('click', function () { setInput(''); });
var copyBtn = $('ctm-copy');
if (copyBtn) copyBtn.addEventListener('click', copyOutput);
var dlBtn = $('ctm-download');
if (dlBtn) dlBtn.addEventListener('click', downloadOutput);
var allBtns = document.querySelectorAll('[data-ctm-all-align]');
var a;
for (a = 0; a < allBtns.length; a++) {
allBtns[a].addEventListener('click', function (ev) {
var target = ev.currentTarget.getAttribute('data-ctm-all-align');
var i;
for (i = 0; i < aligns.length; i++) aligns[i] = target;
renderAll();
});
}
renderAll();
});
}
})();

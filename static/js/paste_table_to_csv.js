/* 网页表格粘贴转 CSV - 粘贴制表符/逗号分隔的原始 TSV 文本 → 列数校验 → RFC4180 转义 → 表格预览 → 一键复制/CSV 下载
 * 零后端、零 fetch/XHR、零 CDN。分隔符由调用方传入（UI 提供 制表符/逗号/分号/竖线 四档）。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * parseTsv(text, delimiter)
 * -> 二维字符串数组（按 \r\n|\r|\n 分行、按 delimiter 分列；末尾空行丢弃；
 * text 非字符串或空串 → err.field='text'；delimiter 非空字符串 → err.field='delimiter'）
 * checkColumnConsistency(rows)
 * -> {consistent, expectedCols, badRows}（expectedCols 取首行列数；badRows 为列数不符的行下标数组；
 * rows 非数组或空数组、某行非数组 → err.field='rows'；不一致时不截断不补齐，只报告）
 * escapeCsvField(field)
 * -> RFC4180 转义后的字段（字段含 " , \r \n 之一时整体加双引号、内部 " → ""；
 * field 非字符串 → err.field='field'）
 * rowsToCsv(rows)
 * -> CSV 文本（行间 \r\n，字段经 escapeCsvField；rows 非法 → err.field='rows'）
 * buildCsvDownloadName(now)
 * -> 'table_YYYYMMDD_HHmmss.csv'（now 缺省为 new Date()；非法 → err.field='now'）
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

function err(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function pad2(n) {
return (n < 10 ? '0' : '') + n;
}

/* 原始文本 → 二维数组；text 为空串直接拒绝（无数据可转），不返回 [[]] 误导 */
function parseTsv(text, delimiter) {
if (typeof text !== 'string') { throw err('text', 'parseTsv: text 必须为字符串');}
if (text.length === 0) { throw err('text', 'parseTsv: text 为空串，无内容可解析');}
if (typeof delimiter !== 'string' || delimiter.length === 0) {
throw err('delimiter', 'parseTsv: delimiter 必须为非空字符串（如 "\\t"、","）');
}
var lines = text.split(/\r\n|\r|\n/);
/* 丢弃末尾空行（Excel/网页复制常带结尾换行），中间空行保留为 [""] 数据行 */
while (lines.length > 0 && lines[lines.length - 1] === '') { lines.pop();}
var rows = [];
for (var i = 0; i < lines.length; i++) {
rows.push(lines[i].split(delimiter));
}
if (rows.length === 0) { throw err('text', 'parseTsv: 去除空行后无数据行');}
return rows;
}

/* 列数一致性校验：expectedCols 取首行列数；不一致只报告 badRows，绝不截断/补齐 */
function checkColumnConsistency(rows) {
if (!Array.isArray(rows) || rows.length === 0) {
throw err('rows', 'checkColumnConsistency: rows 必须为非空数组');
}
for (var i = 0; i < rows.length; i++) {
if (!Array.isArray(rows[i])) { throw err('rows', 'checkColumnConsistency: 第 ' + i + ' 行不是数组');}
}
var expectedCols = rows[0].length;
var badRows = [];
for (var j = 1; j < rows.length; j++) {
if (rows[j].length !== expectedCols) { badRows.push(j);}
}
return {consistent: badRows.length === 0, expectedCols: expectedCols, badRows: badRows};
}

/* RFC4180 字段转义：含双引号/逗号/回车/换行 → 整体加引号，内部双引号翻倍 */
function escapeCsvField(field) {
if (typeof field !== 'string') { throw err('field', 'escapeCsvField: field 必须为字符串');}
if (/[",\r\n]/.test(field)) {
return '"' + field.replace(/"/g, '""') + '"';
}
return field;
}

/* 二维数组 → CSV 文本（行间 \r\n）；结构非法直接抛，不静默跳过坏行 */
function rowsToCsv(rows) {
if (!Array.isArray(rows)) { throw err('rows', 'rowsToCsv: rows 必须为数组');}
var out = [];
for (var i = 0; i < rows.length; i++) {
if (!Array.isArray(rows[i])) { throw err('rows', 'rowsToCsv: 第 ' + i + ' 行不是数组');}
var cells = [];
for (var j = 0; j < rows[i].length; j++) {
cells.push(escapeCsvField(rows[i][j])); /* 非字符串字段 err.field='field' 透传 */
}
out.push(cells.join(','));
}
return out.join('\r\n');
}

/* CSV 下载文件名：table_YYYYMMDD_HHmmss.csv（本地时间） */
function buildCsvDownloadName(now) {
var d = (now === undefined || now === null) ? new Date() : now;
if (!(d instanceof Date) || isNaN(d.getTime())) {
throw err('now', 'buildCsvDownloadName: now 必须为有效 Date（可缺省为当前时间）');
}
return 'table_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
'_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + '.csv';
}

/* node 单元测试导出 */
if (typeof module !== 'undefined' && module.exports) {
module.exports = {
parseTsv: parseTsv,
checkColumnConsistency: checkColumnConsistency,
escapeCsvField: escapeCsvField,
rowsToCsv: rowsToCsv,
buildCsvDownloadName: buildCsvDownloadName
};
}

/* ============ 浏览器 UI（DOM 存在时才挂载） ============ */
if (typeof document !== 'undefined') {

function $(id) { return document.getElementById(id);}

function toast(msg, ok) {
var t = $('ptc-toast');
if (!t) { return;}
t.textContent = msg;
t.className = 'ptc-toast show ' + (ok === false ? 'fail' : 'ok');
clearTimeout(toast._timer);
toast._timer = setTimeout(function () { t.className = 'ptc-toast';}, 2400);
}

/* 复制：Clipboard API 优先，降级 execCommand */
function copyText(text, cb) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { cb(true);}, function () { cb(false);});
} else {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
var ok = false;
try { ok = document.execCommand('copy');} catch (e) { ok = false;}
document.body.removeChild(ta);
cb(ok);
}
}

/* 下载：Blob + UTF-8 BOM，Excel/WPS 双击中文不乱码 */
function downloadCsv(csvText, fileName) {
var blob = new Blob(['\uFEFF' + csvText], {type: 'text/csv;charset=utf-8'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = fileName;
document.body.appendChild(a);
a.click();
setTimeout(function () {
URL.revokeObjectURL(a.href);
document.body.removeChild(a);
}, 500);
}

function delimValue() {
var v = $('ptc-delim').value;
if (v === 'tab') { return '\t';}
if (v === 'comma') { return ',';}
if (v === 'semicolon') { return ';';}
if (v === 'pipe') { return '|';}
return '\t';
}

function showErr(msg) {
var box = $('ptc-err');
if (msg) { box.style.display = 'block'; box.textContent = msg;}
else { box.style.display = 'none'; box.textContent = '';}
}

function showWarn(check) {
var box = $('ptc-warn');
if (!check || check.consistent) { box.style.display = 'none'; box.innerHTML = ''; return;}
box.style.display = 'flex';
box.innerHTML = '';
var icon = document.createElement('i');
icon.className = 'material-icons';
icon.textContent = 'warning';
box.appendChild(icon);
var div = document.createElement('div');
var badList = check.badRows.map(function (i) { return '第 ' + (i + 1) + ' 行（' + currentRows[i].length + ' 列）';}).join('、');
div.innerHTML = '<b>列数不一致，已拒绝生成 CSV（不静默截断）：</b>首行 ' + check.expectedCols +
' 列，以下行列数不符——' + badList + '。请回源头补齐／删减后再试。';
box.appendChild(div);
}

function renderTable(rows) {
var wrap = $('ptc-preview');
wrap.innerHTML = '';
var table = document.createElement('table');
table.className = 'ptc-table';
rows.forEach(function (row, ri) {
var tr = document.createElement('tr');
row.forEach(function (cell, ci) {
var el = document.createElement(ri === 0 ? 'th' : 'td');
el.textContent = cell;
if (ci === 0 && ri === 0) { el.setAttribute('scope', 'col');}
tr.appendChild(el);
});
table.appendChild(tr);
});
wrap.appendChild(table);
}

var currentRows = null;
var currentCsv = '';

/* 主刷新：读输入 → parseTsv → 列数校验 → 预览/CSV（不一致则拒绝生成） */
function refresh() {
var text = $('ptc-input').value;
currentRows = null;
currentCsv = '';
showWarn(null);
$('ptc-preview').innerHTML = '<div class="ptc-empty">粘贴内容后自动解析预览</div>';
$('ptc-csv').value = '';
$('ptc-copy').disabled = true;
$('ptc-download').disabled = true;
$('ptc-count').textContent = '共 0 行 0 列';
if (!text) { showErr(''); return;}
var rows;
try {
rows = parseTsv(text, delimValue());
} catch (e) {
showErr('解析失败：' + (e && e.message ? e.message : '输入有误'));
return;
}
showErr('');
var check;
try {
check = checkColumnConsistency(rows);
} catch (e) {
showErr('校验失败：' + (e && e.message ? e.message : '输入有误'));
return;
}
currentRows = rows;
$('ptc-count').textContent = '共 ' + rows.length + ' 行 ' + check.expectedCols + ' 列';
renderTable(rows);
if (!check.consistent) {
showWarn(check);
return; /* 列数不一致：拒绝生成 CSV，不静默截断 */
}
try {
currentCsv = rowsToCsv(rows);
} catch (e) {
showErr('CSV 生成失败：' + (e && e.message ? e.message : '输入有误'));
return;
}
$('ptc-csv').value = currentCsv;
$('ptc-copy').disabled = false;
$('ptc-download').disabled = false;
}

document.addEventListener('DOMContentLoaded', function () {
$('ptc-input').addEventListener('input', refresh);
$('ptc-delim').addEventListener('change', refresh);

$('ptc-parse').addEventListener('click', function () { refresh(); toast('已重新解析', true);});

$('ptc-sample').addEventListener('click', function () {
$('ptc-delim').value = 'tab';
$('ptc-input').value = '姓名\t年龄\t城市\n张三\t28\t深圳\n李四\t35\t广州\n王五\t22\t北京';
refresh();
toast('已填入示例（制表符分隔）', true);
});

$('ptc-clear').addEventListener('click', function () {
$('ptc-input').value = '';
refresh();
});

/* 一键复制 CSV */
$('ptc-copy').addEventListener('click', function () {
if (!currentCsv) { return;}
copyText(currentCsv, function (ok) {
toast(ok ? '✅ CSV 已复制到剪贴板' : '❌ 复制失败，请手动选择复制', ok);
});
});

/* 下载 CSV（UTF-8 BOM） */
$('ptc-download').addEventListener('click', function () {
if (!currentCsv) { return;}
var name;
try { name = buildCsvDownloadName();}
catch (e) { name = 'table.csv';}
downloadCsv(currentCsv, name);
toast('✅ 已开始下载 ' + name, true);
});

refresh();
});

} /* typeof document !== 'undefined' */
})();

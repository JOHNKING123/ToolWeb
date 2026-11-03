/* 工时十进制转换 - 纯前端：时分秒↔十进制小时双向互转＋批量行转换求和（timesheet 口径）＋一键复制结果
 *
 * 功能：
 * ① 时分秒 → 十进制小时：灵活输入（2:45、1:30:30、2小时45分、2h45m、90分钟），
 *    四舍五入保留 2 位小数；
 * ② 十进制小时 → "X小时Y分" 文案；
 * ③ 批量行转换：每行一个时长逐行转换并求和（timesheet 口径），单行失败记 error 不中断；
 * ④ 一键复制结果。全部浏览器本地计算，不上传。
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * parseToHours(text) -> number（十进制小时，四舍五入保留 2 位小数）
 *   去除首尾空白后全文匹配，支持三种写法：
 *   ① "H:MM" / "H:MM:SS"（如 2:45、1:30:30）：H 为非负整数，MM/SS 须为 00~59；
 *   ② "X小时Y分Z秒"（如 2小时45分、2小时45分30秒、90分钟、165分、30秒）：
 *      小时/分/秒各段可省、至少一项，可带小数（如 2.5小时）；
 *   ③ "XhYmZs"（如 2h45m、1h30m、90m、45s，大小写不限）：
 *      h/m/s 各段可省、至少一项，可带小数；
 *   text 非字符串、空串、无匹配（如 "abc"、纯数字 "2.5"、分钟≥60 的 "2:75"）、
 *   均抛 Error，err.field='text'；
 *   结果 = Math.round(小时数 * 100) / 100。
 * formatHours(decimal) -> "X小时Y分" 文案
 *   总分钟 = Math.round(decimal * 60)，小时 = ⌊总分钟/60⌋，分钟 = 总分钟 % 60；
 *   如 formatHours(2.75) → "2小时45分"，formatHours(4.25) → "4小时15分"；
 *   decimal 非有限数字、NaN、Infinity、为负，均抛 Error，err.field='decimal'。
 * batchConvert(text) -> {rows, total}
 *   按换行切分，每行 trim 后空行跳过；rows 为 [{input, hours} | {input, error}]，
 *   单行 parseToHours 失败记 error 不中断（timesheet 粘贴口径）；
 *   total = 成功行 hours 之和，四舍五入保留 2 位；
 *   text 非字符串、或无可解析行，均抛 Error，err.field='text'。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.TimeDecimal。
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

var RE_HMS = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/;
var RE_CN = /^(?:(\d+(?:\.\d+)?)\s*小时)?(?:(\d+(?:\.\d+)?)\s*分钟?)?(?:(\d+(?:\.\d+)?)\s*秒钟?)?$/;
var RE_EN = /^(?:(\d+(?:\.\d+)?)\s*h)?(?:(\d+(?:\.\d+)?)\s*m)?(?:(\d+(?:\.\d+)?)\s*s)?$/i;

var HINT = '支持 2:45、1:30:30、2小时45分、2h45m、90分钟';

function mkErr(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function round2(x) {
return Math.round(x * 100) / 100;
}

function toHours(h, m, s) {
var hh = h === undefined ? 0 : parseFloat(h);
var mm = m === undefined ? 0 : parseFloat(m);
var ss = s === undefined ? 0 : parseFloat(s);
return hh + mm / 60 + ss / 3600;
}

/* 时分秒灵活输入 → 十进制小时（保留 2 位小数） */
function parseToHours(text) {
if (typeof text !== 'string') {
throw mkErr('text', 'text 必须是字符串');
}
var t = text.trim();
if (!t) {
throw mkErr('text', 'text 不能为空');
}
var m = RE_HMS.exec(t);
var hours;
if (m) {
hours = toHours(m[1], m[2], m[3]);
} else if ((m = RE_CN.exec(t)) && (m[1] !== undefined || m[2] !== undefined || m[3] !== undefined)) {
hours = toHours(m[1], m[2], m[3]);
} else if ((m = RE_EN.exec(t)) && (m[1] !== undefined || m[2] !== undefined || m[3] !== undefined)) {
hours = toHours(m[1], m[2], m[3]);
} else {
throw mkErr('text', '无法解析的时长：' + t + '（' + HINT + '）');
}
return round2(hours);
}

/* 十进制小时 → "X小时Y分" 文案 */
function formatHours(decimal) {
if (typeof decimal !== 'number' || !isFinite(decimal) || decimal < 0) {
throw mkErr('decimal', 'decimal 必须是非负有限数字');
}
var totalMin = Math.round(decimal * 60);
var h = Math.floor(totalMin / 60);
var mm = totalMin % 60;
return h + '小时' + mm + '分';
}

/* 批量行转换 → {rows, total}（单行失败记 error 不中断） */
function batchConvert(text) {
if (typeof text !== 'string') {
throw mkErr('text', 'text 必须是字符串');
}
var lines = text.split(/\r?\n/);
var rows = [];
for (var i = 0; i < lines.length; i++) {
var line = lines[i].trim();
if (!line) {
continue;
}
try {
rows.push({ input: line, hours: parseToHours(line) });
} catch (e) {
rows.push({ input: line, error: e.message });
}
}
if (rows.length === 0) {
throw mkErr('text', '没有可解析的时长行（' + HINT + '）');
}
var total = 0;
for (var j = 0; j < rows.length; j++) {
if (typeof rows[j].hours === 'number') {
total += rows[j].hours;
}
}
return { rows: rows, total: round2(total) };
}

var TimeDecimal = {
parseToHours: parseToHours,
formatHours: formatHours,
batchConvert: batchConvert
};

/* ---------------- 浏览器 UI ---------------- */

var SINGLE_CHIPS = ['2:45', '1:30:30', '2小时45分', '2h45m', '90分钟'];
var DEC_CHIPS = ['2.75', '4.25', '1.5'];
var BATCH_SAMPLE = '2:45\n1:30:30\n2小时45分\n2h45m\n90分钟';

function $(id) { return document.getElementById(id); }

function toast(msg) {
var t = $('td-toast');
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._timer);
t._timer = setTimeout(function () { t.style.display = 'none'; }, 2200);
}

function copyText(text, okMsg) {
function done() { toast(okMsg || '已复制到剪贴板'); }
function fallback() {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done(); }
catch (e) { toast('复制失败，请手动复制'); }
document.body.removeChild(ta);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fallback);
} else {
fallback();
}
}

/* ① 单行：时分秒 → 十进制小时 */
function doToDecimal() {
var raw = $('td-in').value;
var out = $('td-dec-result');
try {
var h = parseToHours(raw);
out.style.display = 'block';
out.innerHTML = '<span class="td-big">' + h + '</span><span class="td-unit"> 小时</span>' +
'<div class="td-note">「' + raw.trim() + '」＝ ' + h + ' 小时（保留 2 位小数，四舍五入）</div>';
out._copy = '「' + raw.trim() + '」＝ ' + h + ' 小时（工时十进制转换，保留2位小数）';
} catch (e) {
out.style.display = 'block';
out.innerHTML = '<div class="td-err">输入有误：' + e.message + '</div>';
out._copy = null;
}
}

function copyDecimal() {
var c = $('td-dec-result')._copy;
if (!c) {
toast('请先转换出有效结果');
return;
}
copyText(c, '转换结果已复制');
}

/* ② 反向：十进制小时 → X小时Y分 */
function doToWords() {
var raw = $('td-dec-in').value.trim();
var out = $('td-words-result');
var d = parseFloat(raw);
if (raw === '' || isNaN(d)) {
out.style.display = 'block';
out.innerHTML = '<div class="td-err">请输入有效的十进制小时数（如 2.75）</div>';
out._copy = null;
return;
}
try {
var w = formatHours(d);
out.style.display = 'block';
out.innerHTML = '<span class="td-big">' + w + '</span>' +
'<div class="td-note">' + d + ' 小时 ＝ ' + w + '</div>';
out._copy = d + ' 小时 ＝ ' + w + '（工时十进制转换）';
} catch (e) {
out.style.display = 'block';
out.innerHTML = '<div class="td-err">输入有误：' + e.message + '</div>';
out._copy = null;
}
}

function copyWords() {
var c = $('td-words-result')._copy;
if (!c) {
toast('请先转换出有效结果');
return;
}
copyText(c, '转换结果已复制');
}

/* ③ 批量行转换（timesheet 口径） */
function escapeHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function doBatch() {
var raw = $('td-batch').value;
var box = $('td-batch-result');
var tbody = $('td-rows');
var r;
try {
r = batchConvert(raw);
} catch (e) {
box.style.display = 'block';
tbody.innerHTML = '';
$('td-total').textContent = '—';
box._copy = null;
toast('批量转换失败：' + e.message);
return;
}
var html = '';
var okCount = 0;
for (var i = 0; i < r.rows.length; i++) {
var row = r.rows[i];
if (typeof row.hours === 'number') {
okCount++;
html += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(row.input) + '</td>' +
'<td class="td-num">' + row.hours + '</td><td class="td-ok">✓</td></tr>';
} else {
html += '<tr class="td-bad"><td>' + (i + 1) + '</td><td>' + escapeHtml(row.input) + '</td>' +
'<td class="td-num">—</td><td class="td-errcell" title="' + escapeHtml(row.error) + '">✗ 格式不对</td></tr>';
}
}
tbody.innerHTML = html;
$('td-total').textContent = r.total + ' 小时';
box.style.display = 'block';

var parts = [];
for (var j = 0; j < r.rows.length; j++) {
var rw = r.rows[j];
parts.push(rw.input + ' → ' + (typeof rw.hours === 'number' ? rw.hours + ' 小时' : '解析失败'));
}
box._copy = '工时批量转换（' + okCount + '/' + r.rows.length + ' 行成功）：\n' +
parts.join('\n') + '\n合计：' + r.total + ' 小时';
toast('批量转换完成：' + okCount + '/' + r.rows.length + ' 行成功');
}

function copyBatch() {
var c = $('td-batch-result')._copy;
if (!c) {
toast('请先点「批量转换并求和」');
return;
}
copyText(c, '批量结果已复制');
}

function init() {
function addChips(boxId, inputId, chips) {
var box = $(boxId);
chips.forEach(function (c) {
var b = document.createElement('button');
b.type = 'button';
b.className = 'btn btn-secondary td-chip';
b.textContent = c;
b.addEventListener('click', function () { $(inputId).value = c; });
box.appendChild(b);
});
}
addChips('td-chips', 'td-in', SINGLE_CHIPS);
addChips('td-dec-chips', 'td-dec-in', DEC_CHIPS);

$('td-to-dec').addEventListener('click', doToDecimal);
$('td-copy-dec').addEventListener('click', copyDecimal);
$('td-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { doToDecimal(); } });

$('td-to-words').addEventListener('click', doToWords);
$('td-copy-words').addEventListener('click', copyWords);
$('td-dec-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { doToWords(); } });

$('td-batch-run').addEventListener('click', doBatch);
$('td-batch-copy').addEventListener('click', copyBatch);
$('td-batch-sample').addEventListener('click', function () {
$('td-batch').value = BATCH_SAMPLE;
doBatch();
toast('已填入示例并转换');
});
$('td-batch-clear').addEventListener('click', function () {
$('td-batch').value = '';
$('td-batch-result').style.display = 'none';
$('td-batch-result')._copy = null;
});
}

if (typeof window !== 'undefined') {
window.TimeDecimal = TimeDecimal;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module !== 'undefined' && module.exports) {
module.exports = TimeDecimal;
}

})();

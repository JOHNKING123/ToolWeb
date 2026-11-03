/* 百分比/成绩计算器 - 纯前端三模式工具：
* ① 百分比↔小数双向互转（含分数 a/b→百分比）
* ② 涨跌幅（原值→现值求涨跌幅＋增减绝对值；原值＋百分比求目标值）
* ③ 成绩百分比（得分/总分→百分制＋A-F 等级映射，段位阈值可调）
* 示例一键填充＋一键复制结果＋localStorage 本地保存，全部浏览器本地计算，不上传。
*
* 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* percentToDecimal(pct)
* -> number（百分比→小数：pct/100）。
* pct 非有限数字抛 Error，err.field='pct'。
* decimalToPercent(dec)
* -> number（小数→百分比：dec*100，数学精确值，页面展示时修约）。
* dec 非有限数字抛 Error，err.field='dec'。
* fractionToPercent(a, b)
* -> number（分数 a/b→百分比：a/b*100）。
* a 非有限数字抛 Error，err.field='a'；b 非有限数字抛 Error，err.field='b'；
* b===0 抛 Error，err.field='b'。
* changeRate(oldVal, newVal)
* -> {rate, diff}；rate 为涨跌幅百分比数（(newVal-oldVal)/oldVal*100），
* diff 为增减绝对值（newVal-oldVal）。通用数学定义：涨跌幅口径因场景而异，
* 本工具按此定义计算，仅供参考（页面真限制已明示）。
* oldVal 非有限数字抛 Error，err.field='oldVal'；oldVal<=0（零基数/负基数）
* 抛 Error，err.field='oldVal'；newVal 非有限数字抛 Error，err.field='newVal'。
* applyRate(base, pct)
* -> number（base*(1+pct/100)：原值＋百分比求目标值，如折后价/目标价口径）。
* base 非有限数字抛 Error，err.field='base'；pct 非有限数字抛 Error，
* err.field='pct'。
* DEFAULT_BANDS —— 默认等级段位（页面阈值输入复用）：
* [[90,'A'],[80,'B'],[70,'C'],[60,'D'],[0,'F']]（各校段位不同，须按官方核对）。
* gradeFor(percent, bands)
* -> string（A/B/C/D/F 等级串）。percent 非 0~100 有限数字抛 Error，
* err.field='percent'；bands 须为 [[阈值数字, 等级串], ...] 数组（默认
* DEFAULT_BANDS），非法抛 Error，err.field='bands'；按数组顺序取第一个
* percent>=阈值 的等级。
* marksToPercent(score, total, bands)
* -> {percent, grade}；percent 为得分/总分→百分制（score/total*100，数学精确值），
* grade 为按 bands 映射的等级（默认 DEFAULT_BANDS）。
* score 非有限数字抛 Error，err.field='score'；score<0 或 score>total
* 抛 Error，err.field='score'；total 非有限数字或 total<=0 抛 Error，
* err.field='total'；bands 非法沿用 gradeFor 约定（err.field='bands'）。
*
* 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.PercentageCalc。
* Node 自测：module.exports 暴露纯函数与常量。
*/
(function () {
'use strict';

/* ---------------- 常量 ---------------- */

/* 默认等级段位：[阈值(含), 等级]，按顺序首个 percent>=阈值 命中 */
var DEFAULT_BANDS = [
[90, 'A'],
[80, 'B'],
[70, 'C'],
[60, 'D'],
[0, 'F']
];

/* ---------------- 基础工具 ---------------- */

function mkErr(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function isNum(v) {
return typeof v === 'number' && isFinite(v);
}

function checkNum(v, field, label) {
if (!isNum(v)) {
throw mkErr(field, label + ' 必须为有限数字');
}
return v;
}

/* ---------------- 纯函数 ---------------- */

/* 百分比→小数：50 → 0.5 */
function percentToDecimal(pct) {
checkNum(pct, 'pct', 'pct（百分比）');
return pct / 100;
}

/* 小数→百分比：0.5 → 50（数学精确值；展示修约由页面负责） */
function decimalToPercent(dec) {
checkNum(dec, 'dec', 'dec（小数）');
return dec * 100;
}

/* 分数 a/b→百分比：1/2 → 50 */
function fractionToPercent(a, b) {
checkNum(a, 'a', 'a（分子）');
checkNum(b, 'b', 'b（分母）');
if (b === 0) {
throw mkErr('b', 'b（分母）不能为 0');
}
return a / b * 100;
}

/* 涨跌幅：原值→现值求涨跌幅 rate（百分比数）＋增减绝对值 diff */
function changeRate(oldVal, newVal) {
checkNum(oldVal, 'oldVal', 'oldVal（原值）');
checkNum(newVal, 'newVal', 'newVal（现值）');
if (oldVal <= 0) {
throw mkErr('oldVal', 'oldVal（原值）必须为正数：零基数无定义，负基数符号易混淆（通用数学定义口径，仅供参考）');
}
var diff = newVal - oldVal;
return { rate: diff / oldVal * 100, diff: diff };
}

/* 原值＋百分比求目标值：base*(1+pct/100)，如 100＋20% → 120 */
function applyRate(base, pct) {
checkNum(base, 'base', 'base（原值）');
checkNum(pct, 'pct', 'pct（百分比）');
return base * (1 + pct / 100);
}

/* 等级段位校验与映射 */
function checkBands(bands) {
if (bands === undefined || bands === null) {
return DEFAULT_BANDS;
}
if (!Array.isArray(bands) || bands.length === 0) {
throw mkErr('bands', 'bands 必须为 [[阈值数字, 等级串], ...] 非空数组');
}
for (var i = 0; i < bands.length; i++) {
var row = bands[i];
if (!Array.isArray(row) || row.length < 2 ||
!isNum(row[0]) || typeof row[1] !== 'string' || row[1] === '') {
throw mkErr('bands', 'bands 第 ' + (i + 1) + ' 段须为 [阈值数字, 等级串] 形式');
}
}
return bands;
}

/* 百分制分数→等级（默认 A:90+/B:80+/C:70+/D:60+/F:<60；各校段位不同须按官方核对） */
function gradeFor(percent, bands) {
checkNum(percent, 'percent', 'percent（百分制分数）');
if (percent < 0 || percent > 100) {
throw mkErr('percent', 'percent（百分制分数）须在 0~100 范围内');
}
var list = checkBands(bands);
for (var i = 0; i < list.length; i++) {
if (percent >= list[i][0]) {
return list[i][1];
}
}
return list[list.length - 1][1];
}

/* 得分/总分→百分制百分比＋等级映射 */
function marksToPercent(score, total, bands) {
checkNum(score, 'score', 'score（得分）');
checkNum(total, 'total', 'total（总分）');
if (total <= 0) {
throw mkErr('total', 'total（总分）必须为正数');
}
if (score < 0) {
throw mkErr('score', 'score（得分）不能为负数');
}
if (score > total) {
throw mkErr('score', 'score（得分）不能大于 total（总分）');
}
var percent = score / total * 100;
return { percent: percent, grade: gradeFor(percent, bands) };
}

var PercentageCalc = {
DEFAULT_BANDS: DEFAULT_BANDS,
percentToDecimal: percentToDecimal,
decimalToPercent: decimalToPercent,
fractionToPercent: fractionToPercent,
changeRate: changeRate,
applyRate: applyRate,
gradeFor: gradeFor,
marksToPercent: marksToPercent
};

/* ---------------- 浏览器 UI ---------------- */

var LS_KEY = 'percentage_calc_v1';

function $(id) { return document.getElementById(id); }

function toast(msg) {
var t = $('pc-toast');
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._timer);
t._timer = setTimeout(function () { t.style.display = 'none'; }, 2200);
}

function escapeHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 输入框数字解析：空串→NaN（交给纯函数报非法），其余按 parseFloat */
function parseInput(el) {
var raw = el.value.trim();
if (raw === '') { return NaN; }
return parseFloat(raw);
}

function fmt2(x) {
return (Math.round(x * 100) / 100).toString();
}

function showErr(id, msg) {
var box = $(id);
if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
box.style.display = 'block';
box.textContent = '输入有误：' + msg;
}

/* ---------- 模式一：百分比↔小数双向互转 ---------- */

function renderMode1(from) {
var pctEl = $('pc-pct'), decEl = $('pc-dec');
var fa = $('pc-frac-a'), fb = $('pc-frac-b');
showErr('pc-err1', '');
try {
if (from === 'pct') {
var d = PercentageCalc.percentToDecimal(parseInput(pctEl));
if (document.activeElement !== decEl) { decEl.value = d; }
} else if (from === 'dec') {
var p = PercentageCalc.decimalToPercent(parseInput(decEl));
if (document.activeElement !== pctEl) { pctEl.value = p; }
}
} catch (e) {
showErr('pc-err1', e.message);
}
try {
var r = PercentageCalc.fractionToPercent(parseInput(fa), parseInput(fb));
$('pc-frac-result').textContent = fmt2(r) + '%';
} catch (e) {
$('pc-frac-result').textContent = isNaN(parseInput(fa)) && isNaN(parseInput(fb)) ? '—' : '输入有误';
if (from === 'frac') { showErr('pc-err1', e.message); }
}
saveLocal();
}

/* ---------- 模式二：涨跌幅 ---------- */

function renderMode2() {
showErr('pc-err2', '');
try {
var cr = PercentageCalc.changeRate(parseInput($('pc-cr-old')), parseInput($('pc-cr-new')));
var sign = cr.rate > 0 ? '＋' : (cr.rate < 0 ? '－' : '');
var cls = cr.rate > 0 ? 'pc-up' : (cr.rate < 0 ? 'pc-down' : '');
$('pc-cr-result').innerHTML = '涨跌幅 <b class="' + cls + '">' + sign + fmt2(Math.abs(cr.rate)) + '%</b>' +
'　增减绝对值 <b class="' + cls + '">' + (cr.diff > 0 ? '＋' : '') + fmt2(cr.diff) + '</b>';
} catch (e) {
var empty = $('pc-cr-old').value.trim() === '' && $('pc-cr-new').value.trim() === '';
$('pc-cr-result').textContent = empty ? '—' : '输入有误';
if (!empty) { showErr('pc-err2', e.message); }
}
try {
var t = PercentageCalc.applyRate(parseInput($('pc-ar-base')), parseInput($('pc-ar-pct')));
$('pc-ar-result').innerHTML = '目标值 <b>' + fmt2(t) + '</b>';
} catch (e) {
var empty2 = $('pc-ar-base').value.trim() === '' && $('pc-ar-pct').value.trim() === '';
$('pc-ar-result').textContent = empty2 ? '—' : '输入有误';
if (!empty2) { showErr('pc-err2', e.message); }
}
saveLocal();
}

/* ---------- 模式三：成绩百分比 ---------- */

function currentBands() {
var a = parseInput($('pc-band-a')), b = parseInput($('pc-band-b')),
c = parseInput($('pc-band-c')), d = parseInput($('pc-band-d'));
if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d)) { return null; }
return [[a, 'A'], [b, 'B'], [c, 'C'], [d, 'D'], [0, 'F']];
}

function renderMode3() {
showErr('pc-err3', '');
var bands = currentBands();
try {
if (!bands) { throw new Error('等级段位阈值须全部为数字'); }
var r = PercentageCalc.marksToPercent(parseInput($('pc-mk-score')), parseInput($('pc-mk-total')), bands);
$('pc-mk-result').innerHTML =
'<div class="pc-big"><span id="pc-mk-value">' + fmt2(r.percent) + '</span><small> 分（百分制）</small></div>' +
'<div class="pc-kpis"><span>等级：<b class="pc-grade">' + escapeHtml(r.grade) + '</b></span></div>';
$('pc-goto-gpa').style.display = '';
$('pc-mk-result')._last = { r: r };
} catch (e) {
var empty = $('pc-mk-score').value.trim() === '' && $('pc-mk-total').value.trim() === '' && bands;
if (empty) {
$('pc-mk-result').innerHTML = '';
$('pc-goto-gpa').style.display = 'none';
} else {
$('pc-mk-result').innerHTML = '';
$('pc-goto-gpa').style.display = 'none';
showErr('pc-err3', e.message);
}
$('pc-mk-result')._last = null;
}
saveLocal();
}

function renderAll(from) {
renderMode1(from);
renderMode2();
renderMode3();
}

/* ---------- 示例 / 复制 / 本地保存 ---------- */

function fillSample() {
$('pc-pct').value = '75'; $('pc-dec').value = '';
$('pc-frac-a').value = '2'; $('pc-frac-b').value = '3';
$('pc-cr-old').value = '120'; $('pc-cr-new').value = '150';
$('pc-ar-base').value = '120'; $('pc-ar-pct').value = '25';
$('pc-mk-score').value = '86'; $('pc-mk-total').value = '100';
$('pc-band-a').value = '90'; $('pc-band-b').value = '80';
$('pc-band-c').value = '70'; $('pc-band-d').value = '60';
renderAll('pct');
toast('已填入示例并计算');
}

function clearAll() {
['pc-pct', 'pc-dec', 'pc-frac-a', 'pc-frac-b', 'pc-cr-old', 'pc-cr-new',
'pc-ar-base', 'pc-ar-pct', 'pc-mk-score', 'pc-mk-total'].forEach(function (id) { $(id).value = ''; });
$('pc-band-a').value = '90'; $('pc-band-b').value = '80';
$('pc-band-c').value = '70'; $('pc-band-d').value = '60';
try { localStorage.removeItem(LS_KEY); } catch (e) {}
renderAll('pct');
}

function buildCopyText() {
var lines = [];
function line(label, value) { if (value) { lines.push(label + '：' + value); } }
var p1 = $('pc-pct').value.trim(), d1 = $('pc-dec').value.trim();
if (p1 !== '' || d1 !== '') { line('百分比↔小数', p1 + '% ↔ ' + d1); }
if ($('pc-frac-a').value.trim() !== '' && $('pc-frac-b').value.trim() !== '') {
line('分数转百分比', $('pc-frac-a').value.trim() + '/' + $('pc-frac-b').value.trim() +
' = ' + $('pc-frac-result').textContent);
}
if ($('pc-cr-old').value.trim() !== '' && $('pc-cr-new').value.trim() !== '') {
line('涨跌幅', $('pc-cr-old').value.trim() + ' → ' + $('pc-cr-new').value.trim() +
'，' + $('pc-cr-result').textContent.replace(/<[^>]+>/g, ''));
}
if ($('pc-ar-base').value.trim() !== '' && $('pc-ar-pct').value.trim() !== '') {
line('原值＋百分比', $('pc-ar-base').value.trim() + ' ＋ ' + $('pc-ar-pct').value.trim() + '% → ' +
$('pc-ar-result').textContent.replace(/<[^>]+>/g, ''));
}
var last = $('pc-mk-result')._last;
if (last) {
line('成绩百分比', $('pc-mk-score').value.trim() + '/' + $('pc-mk-total').value.trim() +
' = ' + fmt2(last.r.percent) + ' 分，等级 ' + last.r.grade);
}
if (!lines.length) { return ''; }
return lines.join('\n') +
'\n（涨跌幅/折扣口径因场景而异，本工具按通用数学定义计算；等级段位各校不同须按官方核对；结果仅供参考）';
}

function copyResult() {
var text = buildCopyText();
if (!text) { toast('暂无可复制的结果（请先输入有效数据）'); return; }
function done() { toast('结果已复制到剪贴板'); }
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

var SAVE_IDS = ['pc-pct', 'pc-dec', 'pc-frac-a', 'pc-frac-b', 'pc-cr-old', 'pc-cr-new',
'pc-ar-base', 'pc-ar-pct', 'pc-mk-score', 'pc-mk-total',
'pc-band-a', 'pc-band-b', 'pc-band-c', 'pc-band-d'];

function saveLocal() {
try {
var data = {};
SAVE_IDS.forEach(function (id) { data[id] = $(id).value; });
localStorage.setItem(LS_KEY, JSON.stringify(data));
} catch (e) { /* 本地保存失败不打扰主流程 */ }
}

function loadLocal() {
try {
var raw = localStorage.getItem(LS_KEY);
if (!raw) { return false; }
var data = JSON.parse(raw);
if (!data) { return false; }
var any = false;
SAVE_IDS.forEach(function (id) {
if (typeof data[id] === 'string' && data[id] !== '') { $(id).value = data[id]; any = true; }
});
return any;
} catch (e) { return false; }
}

function init() {
loadLocal();
[['pc-pct', 'pct'], ['pc-dec', 'dec'], ['pc-frac-a', 'frac'], ['pc-frac-b', 'frac']]
.forEach(function (pair) {
$(pair[0]).addEventListener('input', function () { renderMode1(pair[1]); });
});
['pc-cr-old', 'pc-cr-new', 'pc-ar-base', 'pc-ar-pct'].forEach(function (id) {
$(id).addEventListener('input', renderMode2);
});
['pc-mk-score', 'pc-mk-total', 'pc-band-a', 'pc-band-b', 'pc-band-c', 'pc-band-d']
.forEach(function (id) {
$(id).addEventListener('input', renderMode3);
});
$('pc-sample').addEventListener('click', fillSample);
$('pc-clear').addEventListener('click', clearAll);
$('pc-copy').addEventListener('click', copyResult);
renderAll('pct');
}

if (typeof window !== 'undefined') {
window.PercentageCalc = PercentageCalc;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module !== 'undefined' && module.exports) {
module.exports = PercentageCalc;
}

})();

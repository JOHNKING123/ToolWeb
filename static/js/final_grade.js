/* 期末成绩目标计算器 - 纯前端：单科目平时分/权重＋期中（可选）/权重＋期末权重＋目标总评，反推期末所需分数
*
* 功能：
* 输入平时分、期中分数（可选）、各部分权重与目标总评 → 反推期末考试至少需要考多少分
* （保留 1 位小数），状态三态：reached（目标已稳）/ possible（有可能达标）/ impossible（无法达标）；
* 预设权重方案一键填入；一键复制结果。全部浏览器本地计算，不上传。
*
* 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* requiredOnFinal(usual, mid, weights, target)
* -> {needed, locked, status}；needed 为反推出的期末所需分数（保留 1 位小数，
* 下限钳制为 0）；locked 为已锁定分数（平时×权重＋期中×权重，保留 1 位小数）；
* status 三态：
* reached —— needed ≤ 60（百分制及格线）：期末只需考到及格线以下即可达标，
* 目标基本稳了（含 needed ≤ 0 的已提前达标情形）；
* possible —— 60 < needed ≤ 100：期末认真考 needed 分可达标；
* impossible —— needed > 100：即使满分也无法达标。
* usual 非 0~100 数字抛 Error，err.field='usual'；
* mid 为 null/undefined 表示无期中，此时要求 weights.mid===0，否则抛 Error，
* err.field='weights'；mid 为数字时须在 0~100 内，否则 err.field='mid'；
* weights 非 {usual,mid,final} 对象、各权重非 0~1 数字、权重和≠1（含浮点容差 1e-9）、
* weights.final===0，均抛 Error，err.field='weights'；
* target 非 0~100 数字抛 Error，err.field='target'。
* formatNeeded(needed, status)
* -> 状态文案字符串（分数一律保留 1 位小数 needed.toFixed(1)）；
* 'reached'   → needed===0 时 '已提前达标，期末任意分数都达标'，
*               否则 '期末至少需要考 X 分，目标基本稳了'；
* 'possible'  → '期末至少需要考 X 分'；
* 'impossible'→ '即使期末考满分 100 分也无法达到目标'；
* status 非 'reached'/'possible'/'impossible' 抛 Error，err.field='status'；
* needed 非有限非负数字抛 Error，err.field='needed'。
*
* 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.FinalGrade。
* Node 自测：module.exports 暴露纯函数。
*/
(function () {
'use strict';

var PASS_LINE = 60; /* 百分制及格线：needed ≤ 该线即判 reached（目标基本稳了） */
var W_SUM_EPS = 1e-9; /* 权重和浮点容差 */

function mkErr(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function isNum(v) {
return typeof v === 'number' && isFinite(v);
}

function round1(x) {
return Math.round(x * 10) / 10;
}

/* 0~100 分数校验（usual/mid/target 共用） */
function checkScore(v, field) {
if (!isNum(v) || v < 0 || v > 100) {
throw mkErr(field, field + ' 必须是 0~100 的数字');
}
return v;
}

function checkWeights(w) {
if (!w || typeof w!== 'object' || Array.isArray(w)) {
throw mkErr('weights', 'weights 必须是 {usual,mid,final} 对象');
}
var keys = ['usual', 'mid', 'final'];
for (var i = 0; i < keys.length; i++) {
var k = keys[i];
if (!isNum(w[k]) || w[k] < 0 || w[k] > 1) {
throw mkErr('weights', 'weights.' + k + ' 必须是 0~1 的数字');
}
}
if (w.final === 0) {
throw mkErr('weights', 'weights.final 不能为 0（期末权重为 0 时无法反推）');
}
var sum = w.usual + w.mid + w.final;
if (Math.abs(sum - 1) > W_SUM_EPS) {
throw mkErr('weights', '权重之和必须为 1（实得 ' + sum + '）');
}
return w;
}

/* 反推期末所需分数 */
function requiredOnFinal(usual, mid, weights, target) {
checkWeights(weights);
checkScore(usual, 'usual');
var midVal;
if (mid === null || mid === undefined) {
if (weights.mid!== 0) {
throw mkErr('weights', 'mid 为空（无期中）时 weights.mid 必须为 0');
}
midVal = 0;
} else {
midVal = checkScore(mid, 'mid');
}
checkScore(target, 'target');

var lockedRaw = usual * weights.usual + midVal * weights.mid;
var needed = Math.max(0, round1((target - lockedRaw) / weights.final));

var status;
if (needed > 100) {
status = 'impossible';
} else if (needed <= PASS_LINE) {
status = 'reached';
} else {
status = 'possible';
}
return { needed: needed, locked: round1(lockedRaw), status: status};
}

/* 状态文案 */
function formatNeeded(needed, status) {
if (status!== 'reached' && status!== 'possible' && status!== 'impossible') {
throw mkErr('status', "status 非法：只允许 'reached' / 'possible' / 'impossible'");
}
if (!isNum(needed) || needed < 0) {
throw mkErr('needed', 'needed 必须是非负数字');
}
var n = needed.toFixed(1);
if (status === 'reached') {
return needed === 0
? '已提前达标，期末任意分数都达标'
: '期末至少需要考 ' + n + ' 分，目标基本稳了';
}
if (status === 'possible') {
return '期末至少需要考 ' + n + ' 分';
}
return '即使期末考满分 100 分也无法达到目标';
}

var FinalGrade = {
PASS_LINE: PASS_LINE,
requiredOnFinal: requiredOnFinal,
formatNeeded: formatNeeded
};

/* ---------------- 浏览器 UI ---------------- */

var PRESETS = [
{ name: '常见 3-3-4', wu: 30, wm: 30, wf: 40, noMid: false},
{ name: '无期中 4-0-6', wu: 40, wm: 0, wf: 60, noMid: true},
{ name: '2-3-5', wu: 20, wm: 30, wf: 50, noMid: false},
{ name: '无期中 5-0-5', wu: 50, wm: 0, wf: 50, noMid: true},
{ name: '期末决胜 3-0-7', wu: 30, wm: 0, wf: 70, noMid: true}
];

var STATUS_LABEL = {
reached: '目标已稳',
possible: '有可能达标',
impossible: '无法达标'
};

var STATUS_CLASS = {
reached: 'fg-badge-reached',
possible: 'fg-badge-possible',
impossible: 'fg-badge-impossible'
};

function $(id) { return document.getElementById(id);}

function toast(msg) {
var t = $('fg-toast');
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._timer);
t._timer = setTimeout(function () { t.style.display = 'none';}, 2200);
}

function numOf(id, fallback) {
var v = parseFloat($(id).value);
return isNaN(v)? fallback: v;
}

function refreshWeightSum() {
var s = numOf('fg-w-usual', 0) + numOf('fg-w-mid', 0) + numOf('fg-w-final', 0);
var el = $('fg-weightsum');
var okSum = Math.abs(s - 100) < 1e-9;
el.textContent = '权重合计：' + (Math.round(s * 100) / 100) + '%（须为 100%）';
el.style.color = okSum? '#16a34a': '#dc2626';
el.style.fontWeight = okSum? '400': '700';
return okSum;
}

function applyNoMid() {
var noMid = $('fg-no-mid').checked;
$('fg-mid').disabled = noMid;
$('fg-w-mid').disabled = noMid;
if (noMid) {
$('fg-mid').value = '';
$('fg-w-mid').value = '0';
}
refreshWeightSum();
}

function fillPreset(p) {
$('fg-w-usual').value = p.wu;
$('fg-w-mid').value = p.wm;
$('fg-w-final').value = p.wf;
$('fg-no-mid').checked = p.noMid;
applyNoMid();
toast('已填入预设：' + p.name);
}

function doCalc() {
var usual = numOf('fg-usual', NaN);
var noMid = $('fg-no-mid').checked;
var mid = noMid? null: numOf('fg-mid', NaN);
var weights = {
usual: numOf('fg-w-usual', NaN) / 100,
mid: numOf('fg-w-mid', NaN) / 100,
final: numOf('fg-w-final', NaN) / 100
};
var target = numOf('fg-target', NaN);

if (!refreshWeightSum()) {
toast('权重合计须为 100%，请调整后再计算');
return;
}
var r;
try {
r = requiredOnFinal(usual, mid, weights, target);
} catch (e) {
toast('输入有误：' + e.message);
return;
}

$('fg-result').style.display = 'block';
$('fg-needed').textContent = r.needed;
var badge = $('fg-status');
badge.textContent = STATUS_LABEL[r.status];
badge.className = 'fg-badge ' + STATUS_CLASS[r.status];
$('fg-copy-text').textContent = formatNeeded(r.needed, r.status);
$('fg-locked').textContent = '已锁定分数（平时＋期中折算）：' + r.locked + ' 分；' +
(r.status === 'reached' && r.needed === 0
? '目标已提前锁定，期末考 0 分也达标。'
: r.status === 'reached'
? '期末考到 ' + r.needed + ' 分（≤' + PASS_LINE + ' 分及格线）即达标，基本稳了。'
: r.status === 'possible'
? '期末需考 ' + r.needed + ' 分（60 分以上），还需认真备考。'
: '所需 ' + r.needed + ' 分已超满分 100，即使满分也够不着，建议调低目标。');
$('fg-result')._last = {
usual: usual, mid: mid, weights: weights, target: target, r: r
};
}

function buildCopyText() {
var last = $('fg-result')._last;
if (!last) { return '';}
var midPart = last.mid === null
? '无期中'
: '期中 ' + last.mid + ' 分（权重 ' + Math.round(last.weights.mid * 100) + '%）';
return '平时 ' + last.usual + ' 分（权重 ' +
Math.round(last.weights.usual * 100) + '%）＋' + midPart + '＋期末权重 ' +
Math.round(last.weights.final * 100) + '%，目标总评 ' + last.target + ' 分 → ' +
formatNeeded(last.r.needed, last.r.status) +
'（已锁定 ' + last.r.locked + ' 分）。各校权重口径不同，结果仅供参考。';
}

function copyResult() {
var text = buildCopyText();
if (!text) {
toast('请先点「开始计算」');
return;
}
function done() { toast('结果已复制到剪贴板');}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done();}
catch (e) { toast('复制失败，请手动复制');}
document.body.removeChild(ta);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fallback);
} else {
fallback();
}
}

function fillSample() {
$('fg-usual').value = '85';
$('fg-mid').value = '70';
$('fg-no-mid').checked = false;
$('fg-w-usual').value = '30';
$('fg-w-mid').value = '30';
$('fg-w-final').value = '40';
$('fg-target').value = '80';
applyNoMid();
doCalc();
toast('已填入示例并计算');
}

function clearAll() {
['fg-usual', 'fg-mid', 'fg-w-usual', 'fg-w-mid', 'fg-w-final', 'fg-target'].forEach(function (id) {
$(id).value = '';
});
$('fg-no-mid').checked = false;
applyNoMid();
$('fg-result').style.display = 'none';
$('fg-result')._last = null;
}

function init() {
var box = $('fg-presets');
PRESETS.forEach(function (p) {
var b = document.createElement('button');
b.type = 'button';
b.className = 'btn btn-secondary fg-preset';
b.textContent = p.name;
b.addEventListener('click', function () { fillPreset(p);});
box.appendChild(b);
});

['fg-w-usual', 'fg-w-mid', 'fg-w-final'].forEach(function (id) {
$(id).addEventListener('input', refreshWeightSum);
});
$('fg-no-mid').addEventListener('change', applyNoMid);
$('fg-calc').addEventListener('click', doCalc);
$('fg-copy').addEventListener('click', copyResult);
$('fg-sample').addEventListener('click', fillSample);
$('fg-clear').addEventListener('click', clearAll);

applyNoMid();
}

if (typeof window!== 'undefined') {
window.FinalGrade = FinalGrade;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = FinalGrade;
}

})();

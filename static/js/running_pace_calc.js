/* 跑步配速计算器 - 纯前端工具：
* ① 配速/距离/时间三互算（距离+时间→配速、配速+距离→时间、配速+时间→距离）
* ② min/km ↔ min/mi 配速换算（1 mi = 1.609344 km 精确值）＋ km/h 速度联动
* ③ 5K/10K/半马/全马快捷填充
* ④ Riegel 公式 T2 = T1 × (D2/D1)^1.06 成绩预测（页面明示 ±5~10% 误差）
* ⑤ 逐公里分段表 ＋ 完赛目标（目标时间→所需配速）表
* ⑥ 示例一键填充 ＋ 一键复制 ＋ localStorage 本地保存
* ⑦ 纯前端零上传
*
* 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* paceFromTime(timeSec, distKm) -> 每公里配速秒数（s/km）。
* timeSec、distKm 须为有限正数，否则 err.field='timeSec'/'distKm'。
* timeFromPace(paceSecPerKm, distKm) -> 总秒数。
* paceSecPerKm、distKm 须为有限正数，否则 err.field='paceSecPerKm'/'distKm'。
* distFromPaceTime(timeSec, paceSecPerKm) -> 公里数。
* timeSec、paceSecPerKm 须为有限正数，否则 err.field='timeSec'/'paceSecPerKm'。
* convertPace(paceSec, from, to) -> 换算到目标单位后的每单位配速秒数。
* paceSec 须为有限正数（err.field='paceSec'）；
* from/to ∈ {'km','mi'}（err.field='from'/'to'）；
* 1 mi = 1.609344 km（国际英里精确定义），每英里配速秒数 = 每公里配速秒数 × 1.609344。
* paceToKmh(paceSecPerKm) -> 速度 km/h（= 3600 / 配速）。
* paceSecPerKm 须为有限正数（err.field='paceSecPerKm'）。
* formatPace(secPerUnit) -> "M:SS"（秒四舍五入，60 秒进位）。
* 须为有限非负数，否则 err.field='sec'。
* formatTime(sec) -> "H:MM:SS"。
* 须为有限非负数，否则 err.field='sec'。
* riegelPredict(timeSec1, distKm1, distKm2) -> 预测总秒数 = timeSec1 × (distKm2/distKm1)^1.06。
* 三者须为有限正数，否则 err.field='timeSec1'/'distKm1'/'distKm2'。
* 注意：Riegel 为经验公式，真实成绩通常有 ±5~10% 偏差（训练水平/赛道/天气均影响）。
* splitTable(distKm, paceSecPerKm) -> [{km, segKm, splitSec, elapsedSec},...]。
* 行数 = ceil(distKm)，末行 segKm 为剩余小数公里；
* splitSec 为该公里分段秒数，elapsedSec 为累计秒数。
* distKm、paceSecPerKm 须为有限正数，否则 err.field='distKm'/'paceSecPerKm'。
*
* 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.RunningPaceCalc。
* Node 自测：module.exports 暴露纯函数。
*/
(function () {
'use strict';

/* ---------------- 常量 ---------------- */

var KM_PER_MI = 1.609344; // 1 mi = 1.609344 km（国际英里精确定义）
var RIEGEL_EXPONENT = 1.06; // Riegel 公式指数
var STORE_KEY = 'running_pace_calc_v1';
var QUICK_DISTS = [
{ label: '5K', km: 5},
{ label: '10K', km: 10},
{ label: '半程马拉松', km: 21.0975},
{ label: '全程马拉松', km: 42.195}
];

/* ---------------- 基础工具 ---------------- */

function mkErr(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function checkPosNum(v, field) {
if (typeof v!== 'number' ||!isFinite(v)) {
throw mkErr(field, field + ' 必须为有限数字');
}
if (v <= 0) {
throw mkErr(field, field + ' 必须为正数，实得 ' + v);
}
return v;
}

function checkNonNegNum(v, field) {
if (typeof v!== 'number' ||!isFinite(v)) {
throw mkErr(field, field + ' 必须为有限数字');
}
if (v < 0) {
throw mkErr(field, field + ' 不能为负数，实得 ' + v);
}
return v;
}

function checkPaceUnit(u, field) {
if (u!== 'km' && u!== 'mi') {
throw mkErr(field, field + " 必须为 'km'（公里）或 'mi'（英里）");
}
return u;
}

function pad2(n) { return (n < 10? '0': '') + n;}

/* ---------------- 纯函数：三互算 ---------------- */

function paceFromTime(timeSec, distKm) {
checkPosNum(timeSec, 'timeSec');
checkPosNum(distKm, 'distKm');
return timeSec / distKm;
}

function timeFromPace(paceSecPerKm, distKm) {
checkPosNum(paceSecPerKm, 'paceSecPerKm');
checkPosNum(distKm, 'distKm');
return paceSecPerKm * distKm;
}

function distFromPaceTime(timeSec, paceSecPerKm) {
checkPosNum(timeSec, 'timeSec');
checkPosNum(paceSecPerKm, 'paceSecPerKm');
return timeSec / paceSecPerKm;
}

/* ---------------- 纯函数：单位换算 ---------------- */

function convertPace(paceSec, from, to) {
checkPosNum(paceSec, 'paceSec');
checkPaceUnit(from, 'from');
checkPaceUnit(to, 'to');
if (from === to) { return paceSec;}
// 配速是“每单位距离秒数”：距离单位变大 1.609344 倍，每单位秒数同比例变大
return from === 'km'? paceSec * KM_PER_MI: paceSec / KM_PER_MI;
}

function paceToKmh(paceSecPerKm) {
checkPosNum(paceSecPerKm, 'paceSecPerKm');
return 3600 / paceSecPerKm;
}

/* ---------------- 纯函数：格式化 ---------------- */

function formatPace(secPerUnit) {
checkNonNegNum(secPerUnit, 'sec');
var total = Math.round(secPerUnit);
var m = Math.floor(total / 60);
var s = total % 60;
return m + ':' + pad2(s);
}

function formatTime(sec) {
checkNonNegNum(sec, 'sec');
var total = Math.round(sec);
var h = Math.floor(total / 3600);
var m = Math.floor((total % 3600) / 60);
var s = total % 60;
return h + ':' + pad2(m) + ':' + pad2(s);
}

/* ---------------- 纯函数：Riegel 预测 ---------------- */

function riegelPredict(timeSec1, distKm1, distKm2) {
checkPosNum(timeSec1, 'timeSec1');
checkPosNum(distKm1, 'distKm1');
checkPosNum(distKm2, 'distKm2');
return timeSec1 * Math.pow(distKm2 / distKm1, RIEGEL_EXPONENT);
}

/* ---------------- 纯函数：分段表 ---------------- */

function splitTable(distKm, paceSecPerKm) {
checkPosNum(distKm, 'distKm');
checkPosNum(paceSecPerKm, 'paceSecPerKm');
var rows = [];
var n = Math.ceil(distKm);
for (var i = 1; i <= n; i++) {
var done = Math.min(i, distKm);
var segKm = done - (i - 1);
rows.push({
km: i,
segKm: segKm,
splitSec: segKm * paceSecPerKm,
elapsedSec: done * paceSecPerKm
});
}
return rows;
}

/* ---------------- 对外挂载 ---------------- */

var RunningPaceCalc = {
KM_PER_MI: KM_PER_MI,
RIEGEL_EXPONENT: RIEGEL_EXPONENT,
QUICK_DISTS: QUICK_DISTS,
STORE_KEY: STORE_KEY,
paceFromTime: paceFromTime,
timeFromPace: timeFromPace,
distFromPaceTime: distFromPaceTime,
convertPace: convertPace,
paceToKmh: paceToKmh,
formatPace: formatPace,
formatTime: formatTime,
riegelPredict: riegelPredict,
splitTable: splitTable
};

/* ---------------- 浏览器 UI ---------------- */

function $(id) { return document.getElementById(id);}

function toast(msg) {
var t = $('rpc-toast');
if (!t) { return;}
t.textContent = msg;
t.style.display = 'block';
setTimeout(function () { t.style.display = 'none';}, 2200);
}

/* 解析配速输入：支持 "5:30" 或 "5.5"（分钟） -> 秒 */
function parsePaceInput(str) {
if (str === null || str === undefined) {
throw mkErr('pace', '配速不能为空');
}
var s = String(str).trim();
if (s === '') { throw mkErr('pace', '配速不能为空');}
var m = s.match(/^(\d+(?:\.\d+)?):([0-5]?\d(?:\.\d+)?)$/);
if (m) {
return parseFloat(m[1]) * 60 + parseFloat(m[2]);
}
var f = parseFloat(s);
if (isNaN(f) || f <= 0) {
throw mkErr('pace', '配速格式不正确，请输入如 5:30 或 5.5（分钟）');
}
return f * 60;
}

/* 读取时间输入（时/分/秒） -> 总秒数 */
function readTimeInputs(prefix) {
var h = parseFloat($(prefix + '-h').value) || 0;
var m = parseFloat($(prefix + '-m').value) || 0;
var s = parseFloat($(prefix + '-s').value) || 0;
if (h < 0 || m < 0 || s < 0 || m >= 60 || s >= 60) {
throw mkErr('time', '时间输入不合法（分/秒须 < 60，不能为负）');
}
var total = h * 3600 + m * 60 + s;
if (total <= 0) { throw mkErr('time', '时间必须大于 0');}
return total;
}

function readDist() {
var d = parseFloat($('rpc-dist').value);
if (isNaN(d) || d <= 0) { throw mkErr('dist', '距离必须为大于 0 的数字（公里）');}
return d;
}

function currentMode() {
var r = document.querySelector('input[name="rpc-mode"]:checked');
return r? r.value: 'pace';
}

function showError(msg) {
var e = $('rpc-error');
e.textContent = msg;
e.style.display = msg? 'block': 'none';
}

function render() {
showError('');
try {
var mode = currentMode();
var paceUnit = document.querySelector('input[name="rpc-punit"]:checked').value;
var distKm = readDist();
var paceSecPerKm, timeSec, distOut;

if (mode === 'pace') {
timeSec = readTimeInputs('rpc-time');
paceSecPerKm = paceFromTime(timeSec, distKm);
} else if (mode === 'time') {
paceSecPerKm = paceUnit === 'km'
? parsePaceInput($('rpc-pace').value)
: convertPace(parsePaceInput($('rpc-pace').value), 'mi', 'km');
timeSec = timeFromPace(paceSecPerKm, distKm);
} else {
timeSec = readTimeInputs('rpc-time');
paceSecPerKm = paceUnit === 'km'
? parsePaceInput($('rpc-pace').value)
: convertPace(parsePaceInput($('rpc-pace').value), 'mi', 'km');
distOut = distFromPaceTime(timeSec, paceSecPerKm);
$('rpc-out-dist').textContent = distOut.toFixed(2);
}

$('rpc-out-pace-km').textContent = formatPace(paceSecPerKm);
$('rpc-out-pace-mi').textContent = formatPace(convertPace(paceSecPerKm, 'km', 'mi'));
$('rpc-out-kmh').textContent = paceToKmh(paceSecPerKm).toFixed(2);
$('rpc-out-time').textContent = formatTime(timeSec);
$('rpc-result').style.display = 'block';
renderSplits(distKm, paceSecPerKm);
renderRiegel();
saveLocal();
} catch (e) {
$('rpc-result').style.display = 'none';
showError('⚠️ ' + e.message);
}
}

/* 分段表渲染 */
function renderSplits(distKm, paceSecPerKm) {
var rows = splitTable(distKm, paceSecPerKm);
var html = '<table class="rpc-table"><thead><tr><th>公里</th><th>本公里</th><th>累计用时</th></tr></thead><tbody>';
rows.forEach(function (r) {
html += '<tr><td>' + r.km + (r.segKm < 1? '（+' + r.segKm.toFixed(3) + ' km）': '') + '</td>' +
'<td>' + formatPace(r.splitSec) + '</td>' +
'<td>' + formatTime(r.elapsedSec) + '</td></tr>';
});
html += '</tbody></table>';
$('rpc-splits').innerHTML = html;
$('rpc-split-title').textContent = '逐公里分段表（' + distKm + ' km，共 ' + rows.length + ' 行）';
}

/* 完赛目标表：目标时间 -> 所需配速 */
function renderGoal() {
showError('');
try {
var distKm = readDist();
var timeSec = readTimeInputs('rpc-goal');
var pace = paceFromTime(timeSec, distKm);
$('rpc-goal-out').innerHTML = '目标 <b>' + formatTime(timeSec) + '</b> 完赛 <b>' + distKm +
' km</b>，所需平均配速：<b>' + formatPace(pace) + ' /km</b>（' +
formatPace(convertPace(pace, 'km', 'mi')) + ' /mi，' +
paceToKmh(pace).toFixed(2) + ' km/h）';
$('rpc-goal-out').style.display = 'block';
} catch (e) {
$('rpc-goal-out').style.display = 'none';
showError('⚠️ ' + e.message);
}
}

/* Riegel 预测渲染 */
function renderRiegel() {
var box = $('rpc-riegel');
try {
var t1 = readTimeInputs('rpc-r1');
var d1 = parseFloat($('rpc-rd1').value);
if (isNaN(d1) || d1 <= 0) { throw mkErr('rd1', '近期成绩距离必须为大于 0 的数字（公里）');}
var html = '<table class="rpc-table"><thead><tr><th>目标距离</th><th>预测成绩</th><th>预测配速</th></tr></thead><tbody>';
QUICK_DISTS.forEach(function (q) {
var t2 = riegelPredict(t1, d1, q.km);
var p2 = t2 / q.km;
html += '<tr><td>' + q.label + '（' + q.km + ' km）</td><td><b>' + formatTime(t2) + '</b></td>' +
'<td>' + formatPace(p2) + ' /km</td></tr>';
});
html += '</tbody></table>';
html += '<div class="rpc-info">Riegel 为经验公式，真实成绩受训练水平、赛道起伏、天气、补给影响，通常有 <b>±5~10%</b> 偏差，仅供参考。</div>';
box.innerHTML = html;
} catch (e) {
box.innerHTML = '<div class="rpc-info">请先填写「近期成绩」的时间与距离，即可预测各距离成绩。</div>';
}
}

/* 示例 / 快捷填充 / 复制 / 清空 */
var SAMPLES = [
{ label: '示例① 10K 50:00', dist: 10, h: 0, m: 50, s: 0, pace: ''},
{ label: '示例② 全马 3:30 配速', dist: 42.195, h: 3, m: 30, s: 0, pace: ''},
{ label: '示例③ 配速 5:30 跑 1 小时', dist: '', h: 1, m: 0, s: 0, pace: '5:30'}
];

function fillSample(i) {
var sm = SAMPLES[i];
if (sm.dist!== '') { $('rpc-dist').value = sm.dist;}
$('rpc-time-h').value = sm.h; $('rpc-time-m').value = sm.m; $('rpc-time-s').value = sm.s;
$('rpc-pace').value = sm.pace;
render();
toast('已填充' + sm.label);
}

function quickDist(km) {
$('rpc-dist').value = km;
render();
toast('距离已设为 ' + km + ' km');
}

function copyResult() {
var mode = currentMode();
var distKm = $('rpc-dist').value || '?';
var txt = '距离 ' + distKm + ' km；配速 ' +
$('rpc-out-pace-km').textContent + ' /km（' +
$('rpc-out-pace-mi').textContent + ' /mi，' +
$('rpc-out-kmh').textContent + ' km/h）；用时 ' +
$('rpc-out-time').textContent;
if (mode === 'dist') { txt += '；折算距离 ' + $('rpc-out-dist').textContent + ' km';}
copyText(txt);
toast('结果已复制到剪贴板');
}

function copyText(txt) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(txt).catch(function () { fallbackCopy(txt);});
} else {
fallbackCopy(txt);
}
}

function fallbackCopy(txt) {
var ta = document.createElement('textarea');
ta.value = txt;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy');} catch (e) { /* 忽略 */}
document.body.removeChild(ta);
}

function clearAll() {
['rpc-dist', 'rpc-time-h', 'rpc-time-m', 'rpc-time-s', 'rpc-pace',
'rpc-goal-h', 'rpc-goal-m', 'rpc-goal-s', 'rpc-r1-h', 'rpc-r1-m', 'rpc-r1-s', 'rpc-rd1'
].forEach(function (id) { $(id).value = '';});
try { localStorage.removeItem(STORE_KEY);} catch (e) { /* 忽略 */}
render();
}

/* localStorage */
function saveLocal() {
try {
var data = {
mode: currentMode(),
dist: $('rpc-dist').value,
th: $('rpc-time-h').value, tm: $('rpc-time-m').value, ts: $('rpc-time-s').value,
pace: $('rpc-pace').value,
punit: document.querySelector('input[name="rpc-punit"]:checked').value,
gh: $('rpc-goal-h').value, gm: $('rpc-goal-m').value, gs: $('rpc-goal-s').value,
r1h: $('rpc-r1-h').value, r1m: $('rpc-r1-m').value, r1s: $('rpc-r1-s').value,
rd1: $('rpc-rd1').value
};
localStorage.setItem(STORE_KEY, JSON.stringify(data));
} catch (e) { /* 忽略 */}
}

function loadLocal() {
try {
var raw = localStorage.getItem(STORE_KEY);
if (!raw) { return;}
var d = JSON.parse(raw);
var modeRadio = document.querySelector('input[name="rpc-mode"][value="' + d.mode + '"]');
if (modeRadio) { modeRadio.checked = true;}
$('rpc-dist').value = d.dist || '';
$('rpc-time-h').value = d.th || ''; $('rpc-time-m').value = d.tm || ''; $('rpc-time-s').value = d.ts || '';
$('rpc-pace').value = d.pace || '';
var pu = document.querySelector('input[name="rpc-punit"][value="' + d.punit + '"]');
if (pu) { pu.checked = true;}
$('rpc-goal-h').value = d.gh || ''; $('rpc-goal-m').value = d.gm || ''; $('rpc-goal-s').value = d.gs || '';
$('rpc-r1-h').value = d.r1h || ''; $('rpc-r1-m').value = d.r1m || ''; $('rpc-r1-s').value = d.r1s || '';
$('rpc-rd1').value = d.rd1 || '';
syncModeUI();
} catch (e) { /* 忽略 */}
}

/* 模式切换：不同模式高亮不同的输入组 */
function syncModeUI() {
var mode = currentMode();
['pace', 'time', 'dist'].forEach(function (m) {
var el = $('rpc-g-' + m);
if (el) { el.classList.toggle('rpc-active', m === mode);}
});
var distOutRow = $('rpc-row-dist');
if (distOutRow) { distOutRow.style.display = mode === 'dist'? '': 'none';}
}

function init() {
if (!$('running-app')) { return;}
loadLocal();
syncModeUI();
document.querySelectorAll('input[name="rpc-mode"]').forEach(function (r) {
r.addEventListener('change', function () { syncModeUI(); render();});
});
document.querySelectorAll('input[name="rpc-punit"]').forEach(function (r) {
r.addEventListener('change', render);
});
['rpc-dist', 'rpc-time-h', 'rpc-time-m', 'rpc-time-s', 'rpc-pace'].forEach(function (id) {
$(id).addEventListener('input', render);
});
['rpc-goal-h', 'rpc-goal-m', 'rpc-goal-s'].forEach(function (id) {
$(id).addEventListener('input', renderGoal);
});
['rpc-r1-h', 'rpc-r1-m', 'rpc-r1-s', 'rpc-rd1'].forEach(function (id) {
$(id).addEventListener('input', renderRiegel);
});
QUICK_DISTS.forEach(function (q) {
var btn = document.createElement('button');
btn.className = 'btn btn-secondary';
btn.type = 'button';
btn.textContent = q.label + ' ' + q.km + 'km';
btn.addEventListener('click', function () { quickDist(q.km);});
$('rpc-quicks').appendChild(btn);
});
SAMPLES.forEach(function (s, i) {
var btn = document.createElement('button');
btn.className = 'btn btn-secondary';
btn.type = 'button';
btn.textContent = s.label;
btn.addEventListener('click', function () { fillSample(i);});
$('rpc-samples').appendChild(btn);
});
$('rpc-goal-btn').addEventListener('click', renderGoal);
$('rpc-copy').addEventListener('click', copyResult);
$('rpc-clear').addEventListener('click', clearAll);
render();
}

if (typeof window!== 'undefined') {
window.RunningPaceCalc = RunningPaceCalc;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = RunningPaceCalc;
}

})();

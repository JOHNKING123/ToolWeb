/* 心率区间计算器 - 纯前端工具：
 * ① 输入：年龄（必填）、静息心率（必填，晨起静坐 5 分钟测量）、实测最大心率（可选）
 * ② 最大心率公式三选一：Tanaka（208−0.7×年龄）/ Fox（220−年龄）/ 实测值
 * ③ 计算口径二选一：Max%（区间＝最大心率×强度%）/ Karvonen 心率储备法
 * ④ 输出：五区间 bpm 上下限（Z1 恢复 50–60% / Z2 有氧基础 60–70% / Z3 有氧耐力 70–80%
 *    / Z4 乳酸阈值 80–90% / Z5 最大摄氧 90–100%）＋各区间训练说明
 * ⑤ 示例一键填充＋一键复制结果＋localStorage 本地保存，纯前端零上传
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * maxHeartRate(age, method)
 * -> number（最大心率估算，整数 bpm）。method='tanaka'：208−0.7×age；
 * method='fox'：220−age。
 * age 非有限数字、或不在 1~120 范围内，抛 Error，err.field='age'；
 * method 非 'tanaka'/'fox'，抛 Error，err.field='method'。
 * maxPctZones(maxHR)
 * -> 五区间数组（Max% 口径：区间＝maxHR×强度%）。每项 {zone, code, name, lowPct,
 * highPct, low, high}，bpm 取整；相邻区间边界连续（low[n]===high[n-1]，个别
 * 修约差允许 ±1）。
 * maxHR 非有限数字或 <=0，抛 Error，err.field='maxHR'。
 * karvonenZones(maxHR, restHR)
 * -> 五区间数组（Karvonen 心率储备法：目标＝(maxHR−restHR)×强度%＋restHR），
 * 项结构同 maxPctZones。
 * maxHR 非法沿用 maxPctZones 约定（err.field='maxHR'）；restHR 非有限数字或
 * <=0 抛 Error，err.field='restHR'；restHR>=maxHR 抛 Error，err.field='restHR'。
 * zoneDescriptions()
 * -> 五区间训练说明数组（纯静态数据，返回深拷贝防篡改），每项 {zone, code,
 * name, range, purpose, feeling, training}。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.HeartRateZones。
 * Node 自测：module.exports 暴露纯函数与常量。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */

/* 五区间定义：[编号, 代码, 中文名, 强度下限%, 强度上限%] */
var ZONE_DEFS = [
[1, 'Z1', '恢复区', 50, 60],
[2, 'Z2', '有氧基础区', 60, 70],
[3, 'Z3', '有氧耐力区', 70, 80],
[4, 'Z4', '乳酸阈值区', 80, 90],
[5, 'Z5', '最大摄氧区', 90, 100]
];

/* 五区间训练说明（静态数据） */
var ZONE_DESCRIPTIONS = [
{ zone: 1, code: 'Z1', name: '恢复区', range: '50–60%', purpose: '主动恢复',
  feeling: '非常轻松，可以完整交谈、唱歌',
  training: '轻松慢跑、散步、骑行恢复；促进血液循环、加速身体恢复，适合休息日或高强度训练后' },
{ zone: 2, code: 'Z2', name: '有氧基础区', range: '60–70%', purpose: '有氧地基',
  feeling: '轻松，可以完整对话，呼吸平稳',
  training: '长距离慢跑/骑行；脂肪供能占比最高的区间，打磨有氧耐力基础，跑者训练量大头在此' },
{ zone: 3, code: 'Z3', name: '有氧耐力区', range: '70–80%', purpose: '有氧耐力',
  feeling: '稍累，说话只能成短句，呼吸加深',
  training: '节奏跑、马拉松配速跑；提升心肺功能与乳酸清除能力，比赛配速多落于此' },
{ zone: 4, code: 'Z4', name: '乳酸阈值区', range: '80–90%', purpose: '阈值提升',
  feeling: '吃力，只能说零星词语，呼吸急促',
  training: '阈值间歇、Tempo 跑；推高乳酸阈值，延长可维持的高强度时间，每周至多 1–2 次' },
{ zone: 5, code: 'Z5', name: '最大摄氧区', range: '90–100%', purpose: '最大强度',
  feeling: '全力，无法说话，数分钟即力竭',
  training: '短间歇、冲刺跑；提升最大摄氧量与无氧能力，须充分热身，新手慎入' }
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

/* 最大心率估算：Tanaka 208−0.7×age / Fox 220−age（整数 bpm 输出） */
function maxHeartRate(age, method) {
checkNum(age, 'age', 'age（年龄）');
if (age < 1 || age > 120) {
throw mkErr('age', 'age（年龄）须在 1~120 岁之间');
}
if (method === 'tanaka') {
return Math.round(208 - 0.7 * age);
}
if (method === 'fox') {
return Math.round(220 - age);
}
throw mkErr('method', "method（公式）须为 'tanaka' 或 'fox'");
}

/* 五区间数组构造：boundFn(pct)->bpm */
function buildZones(boundFn) {
return ZONE_DEFS.map(function (z) {
return {
zone: z[0],
code: z[1],
name: z[2],
lowPct: z[3],
highPct: z[4],
low: Math.round(boundFn(z[3])),
high: Math.round(boundFn(z[4]))
};
});
}

/* Max% 口径：区间上下限＝maxHR×强度% */
function maxPctZones(maxHR) {
checkNum(maxHR, 'maxHR', 'maxHR（最大心率）');
if (maxHR <= 0) {
throw mkErr('maxHR', 'maxHR（最大心率）必须为正数');
}
return buildZones(function (pct) { return maxHR * pct / 100; });
}

/* Karvonen 心率储备法：目标＝(maxHR−restHR)×强度%＋restHR */
function karvonenZones(maxHR, restHR) {
checkNum(maxHR, 'maxHR', 'maxHR（最大心率）');
if (maxHR <= 0) {
throw mkErr('maxHR', 'maxHR（最大心率）必须为正数');
}
checkNum(restHR, 'restHR', 'restHR（静息心率）');
if (restHR <= 0) {
throw mkErr('restHR', 'restHR（静息心率）必须为正数');
}
if (restHR >= maxHR) {
throw mkErr('restHR', 'restHR（静息心率）须小于 maxHR（最大心率）');
}
var reserve = maxHR - restHR;
return buildZones(function (pct) { return reserve * pct / 100 + restHR; });
}

/* 五区间训练说明（深拷贝，防外部篡改静态数据） */
function zoneDescriptions() {
return ZONE_DESCRIPTIONS.map(function (d) {
return {
zone: d.zone, code: d.code, name: d.name, range: d.range,
purpose: d.purpose, feeling: d.feeling, training: d.training
};
});
}

var HeartRateZones = {
ZONE_DEFS: ZONE_DEFS.map(function (z) { return z.slice(); }),
maxHeartRate: maxHeartRate,
maxPctZones: maxPctZones,
karvonenZones: karvonenZones,
zoneDescriptions: zoneDescriptions
};

/* ---------------- 浏览器 UI ---------------- */

var LS_KEY = 'heart_rate_zones_v1';

/* 区间条配色：Z1→Z5 由蓝渐变为红 */
var ZONE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'];

var FORMULA_LABEL = {
tanaka: 'Tanaka 公式（208−0.7×年龄）',
fox: 'Fox 公式（220−年龄）',
measured: '实测值'
};
var METHOD_LABEL = { maxpct: 'Max%（最大心率百分比）', karvonen: 'Karvonen 心率储备法' };

function $(id) { return document.getElementById(id); }

function toast(msg) {
var t = $('hrz-toast');
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

function checkedVal(name) {
var els = document.querySelectorAll('input[name="' + name + '"]:checked');
return els.length ? els[0].value : null;
}

function showErr(msg) {
var box = $('hrz-err');
if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
box.style.display = 'block';
box.textContent = '输入有误：' + msg;
}

/* 由当前输入算出有效最大心率（公式→估算；实测→直接取输入值并校验） */
function resolveMaxHR(formula, age, measured) {
if (formula === 'measured') {
if (!isFinite(measured)) {
throw mkErr('measured', '选择「实测值」时须填写实测最大心率');
}
if (measured <= 0) {
throw mkErr('measured', '实测最大心率必须为正数');
}
return Math.round(measured);
}
return HeartRateZones.maxHeartRate(age, formula);
}

function render() {
showErr('');
var formula = checkedVal('hrz-formula');
var method = checkedVal('hrz-method');
var age = parseInput($('hrz-age'));
var restHR = parseInput($('hrz-rest'));
var measured = parseInput($('hrz-measured'));
/* 实测输入框仅在公式=实测值时启用 */
$('hrz-measured').disabled = (formula !== 'measured');
try {
var maxHR = resolveMaxHR(formula, age, measured);
var zones = (method === 'karvonen')
? HeartRateZones.karvonenZones(maxHR, restHR)
: HeartRateZones.maxPctZones(maxHR);
var descs = HeartRateZones.zoneDescriptions();
var srcNote = formula === 'measured'
? '实测最大心率 ' + maxHR + ' bpm'
: FORMULA_LABEL[formula] + '估算 ' + maxHR + ' bpm';
$('hrz-maxhr').innerHTML = '<b>' + maxHR + '</b> <small>bpm（' + escapeHtml(srcNote) + '）</small>';
var html = '';
zones.forEach(function (z, i) {
var d = descs[i];
html += '<div class="hrz-zone">' +
'<div class="hrz-zone-head"><span class="hrz-badge" style="background:' + ZONE_COLORS[i] + '">' + z.code + '</span>' +
'<b>' + escapeHtml(z.name) + '</b>' +
'<span class="hrz-range">' + z.lowPct + '–' + z.highPct + '%</span></div>' +
'<div class="hrz-bpm"><b>' + z.low + ' – ' + z.high + '</b> <small>bpm</small></div>' +
'<div class="hrz-bar"><i style="width:' + z.highPct + '%;background:' + ZONE_COLORS[i] + '"></i></div>' +
'<div class="hrz-desc"><b>训练要点：</b>' + escapeHtml(d.training) + '<br>' +
'<b>体感：</b>' + escapeHtml(d.feeling) + '</div>' +
'</div>';
});
$('hrz-zones').innerHTML = html;
$('hrz-result').style.display = '';
$('hrz-method-note').textContent = '口径：' + METHOD_LABEL[method] +
(method === 'karvonen' ? '（目标＝(最大心率−静息心率)×强度%＋静息心率）' : '（区间＝最大心率×强度%）');
$('hrz-result')._last = { maxHR: maxHR, formula: formula, method: method,
age: age, restHR: restHR, zones: zones };
} catch (e) {
$('hrz-result').style.display = 'none';
$('hrz-result')._last = null;
var empty = $('hrz-age').value.trim() === '' && $('hrz-rest').value.trim() === '' &&
(formula !== 'measured' || $('hrz-measured').value.trim() === '');
if (!empty) { showErr(e.message); }
}
saveLocal();
}

/* ---------- 示例 / 复制 / 本地保存 ---------- */

function fillSample() {
$('hrz-age').value = '30';
$('hrz-rest').value = '60';
$('hrz-measured').value = '';
document.querySelector('input[name="hrz-formula"][value="tanaka"]').checked = true;
document.querySelector('input[name="hrz-method"][value="karvonen"]').checked = true;
render();
toast('已填入示例并计算（30 岁 / 静息 60 / Tanaka / Karvonen）');
}

function clearAll() {
$('hrz-age').value = '';
$('hrz-rest').value = '';
$('hrz-measured').value = '';
document.querySelector('input[name="hrz-formula"][value="tanaka"]').checked = true;
document.querySelector('input[name="hrz-method"][value="maxpct"]').checked = true;
try { localStorage.removeItem(LS_KEY); } catch (e) {}
render();
}

function buildCopyText() {
var last = $('hrz-result')._last;
if (!last) { return ''; }
var lines = [];
lines.push('心率区间计算结果');
lines.push('年龄：' + last.age + ' 岁；静息心率：' + last.restHR + ' bpm');
lines.push('最大心率：' + last.maxHR + ' bpm（' + FORMULA_LABEL[last.formula] + '）');
lines.push('计算口径：' + METHOD_LABEL[last.method]);
last.zones.forEach(function (z) {
lines.push(z.code + ' ' + z.name + '（' + z.lowPct + '–' + z.highPct + '%）：' + z.low + '–' + z.high + ' bpm');
});
lines.push('（年龄公式为群体统计估计，个体可差 ±10~15 bpm；本工具非医疗建议，出现胸痛/头晕/呼吸困难须立即停止运动并就医；结果仅供参考）');
return lines.join('\n');
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

var SAVE_IDS = ['hrz-age', 'hrz-rest', 'hrz-measured'];

function saveLocal() {
try {
var data = {};
SAVE_IDS.forEach(function (id) { data[id] = $(id).value; });
data.formula = checkedVal('hrz-formula');
data.method = checkedVal('hrz-method');
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
['formula', 'method'].forEach(function (k) {
var el = document.querySelector('input[name="hrz-' + k + '"][value="' + data[k] + '"]');
if (el) { el.checked = true; }
});
return any;
} catch (e) { return false; }
}

function init() {
loadLocal();
['hrz-age', 'hrz-rest', 'hrz-measured'].forEach(function (id) {
$(id).addEventListener('input', render);
});
var radios = document.querySelectorAll('input[name="hrz-formula"], input[name="hrz-method"]');
for (var i = 0; i < radios.length; i++) {
radios[i].addEventListener('change', render);
}
$('hrz-sample').addEventListener('click', fillSample);
$('hrz-clear').addEventListener('click', clearAll);
$('hrz-copy').addEventListener('click', copyResult);
render();
}

if (typeof window !== 'undefined') {
window.HeartRateZones = HeartRateZones;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module !== 'undefined' && module.exports) {
module.exports = HeartRateZones;
}

})();

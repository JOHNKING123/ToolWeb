/* BMI 体质指数计算器 - 纯前端工具：
 * ① 输入：身高（cm，必填）/ 体重（kg，必填）
 * ② 计算：BMI＝体重(kg) ÷ 身高(m)²，保留 1 位小数
 * ③ 分级：WHO 标准（偏瘦<18.5 / 正常18.5–24.9 / 超重25–29.9 / 肥胖≥30）
 * ④ 分级色条可视化＋各分级健康提示文案
 * ⑤ 示例一键填充＋一键复制结果＋localStorage 本地保存，纯前端零上传
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * calcBMI(heightCm, weightKg)
 * -> number（BMI 值，保留 1 位小数）。heightCm 非有限数字或 <=0 抛 Error，
 * err.field='heightCm'；weightKg 非有限数字或 <=0 抛 Error，err.field='weightKg'。
 * classifyBMI(bmi)
 * -> {label, level}。label 为中文分级（偏瘦/正常/超重/肥胖），level 为英文代码
 * （underweight/normal/overweight/obese）。bmi 非有限数字或 <=0 抛 Error，
 * err.field='bmi'。分级阈值：<18.5 偏瘦，18.5–24.9 正常，25–29.9 超重，≥30 肥胖。
 * zoneBreakpoints()
 * -> [18.5, 25, 30]（WHO 分级阈值点，每次返回新数组防外部篡改）。
 * zoneAdvices()
 * -> 四分级健康提示数组（纯静态数据，返回深拷贝防篡改），每项 {level, label,
 * range, color, advice}。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.BmiCalc。
 * Node 自测：module.exports 暴露纯函数与常量。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */

/* WHO 分级阈值点 */
var BREAKPOINTS = [18.5, 25, 30];

/* 四分级定义：[level 代码, 中文标签, 区间文字, 配色, 健康提示] */
var ZONE_ADVICES = [
{ level: 'underweight', label: '偏瘦', range: '< 18.5', color: '#3b82f6',
  advice: '体重偏轻，可能存在营养摄入不足或消化吸收问题。建议规律三餐、保证优质蛋白与主食摄入，适当力量训练增加肌肉量；若长期偏瘦或伴随不适，建议咨询医生或营养师。' },
{ level: 'normal', label: '正常', range: '18.5 – 24.9', color: '#22c55e',
  advice: '体重在健康区间内，继续保持！建议维持均衡饮食与每周至少 150 分钟中等强度运动，定期（如每月）复测体重，把 BMI 稳在区间内。' },
{ level: 'overweight', label: '超重', range: '25 – 29.9', color: '#f59e0b',
  advice: '体重超出健康区间，代谢综合征风险开始上升。建议减少精制糖与油炸食品、控制晚餐份量，每天快走或慢跑 30 分钟以上，目标每月减重 1–2 公斤；不必节食，慢减更稳。' },
{ level: 'obese', label: '肥胖', range: '≥ 30', color: '#ef4444',
  advice: '体重明显超标，心血管疾病、糖尿病等风险显著升高。建议尽快制定科学的减重计划（饮食＋运动双管齐下），有基础疾病或长期减重无效者，务必咨询医生后再行动，切勿自行极端节食。' }
];

/* ---------------- 基础工具 ---------------- */

function mkErr(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function checkPositiveNum(v, field, label) {
if (typeof v !== 'number' || !isFinite(v)) {
throw mkErr(field, label + ' 必须为有限数字');
}
if (v <= 0) {
throw mkErr(field, label + ' 必须为正数');
}
return v;
}

/* ---------------- 纯函数 ---------------- */

/* BMI＝体重(kg) ÷ 身高(m)²，保留 1 位小数 */
function calcBMI(heightCm, weightKg) {
checkPositiveNum(heightCm, 'heightCm', 'heightCm（身高）');
checkPositiveNum(weightKg, 'weightKg', 'weightKg（体重）');
var m = heightCm / 100;
var bmi = weightKg / (m * m);
return Math.round(bmi * 10) / 10;
}

/* WHO 分级：<18.5 偏瘦 / 18.5–24.9 正常 / 25–29.9 超重 / ≥30 肥胖 */
function classifyBMI(bmi) {
checkPositiveNum(bmi, 'bmi', 'bmi');
var bp = BREAKPOINTS;
if (bmi < bp[0]) { return { label: '偏瘦', level: 'underweight' }; }
if (bmi < bp[1]) { return { label: '正常', level: 'normal' }; }
if (bmi < bp[2]) { return { label: '超重', level: 'overweight' }; }
return { label: '肥胖', level: 'obese' };
}

/* WHO 分级阈值点（每次返回新数组，防外部篡改） */
function zoneBreakpoints() {
return BREAKPOINTS.slice();
}

/* 四分级健康提示（深拷贝，防外部篡改静态数据） */
function zoneAdvices() {
return ZONE_ADVICES.map(function (z) {
return {
level: z.level, label: z.label, range: z.range, color: z.color, advice: z.advice
};
});
}

var BmiCalc = {
calcBMI: calcBMI,
classifyBMI: classifyBMI,
zoneBreakpoints: zoneBreakpoints,
zoneAdvices: zoneAdvices
};

/* ---------------- 浏览器 UI ---------------- */

var LS_KEY = 'bmi_calc_v1';

/* 色条刻度：BMI 15~35 区间映射（阈值 18.5/25/30 落在条上） */
var BAR_MIN = 15, BAR_MAX = 35;

function $(id) { return document.getElementById(id); }

function toast(msg) {
var t = $('bmi-toast');
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

function showErr(msg) {
var box = $('bmi-err');
if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
box.style.display = 'block';
box.textContent = '输入有误：' + msg;
}

/* 取分级详情（label/level → ZONE_ADVICES 项） */
function zoneOf(classified) {
var advs = BmiCalc.zoneAdvices();
for (var i = 0; i < advs.length; i++) {
if (advs[i].level === classified.level) { return advs[i]; }
}
return advs[1];
}

function markerPct(bmi) {
var v = Math.max(BAR_MIN, Math.min(BAR_MAX, bmi));
return ((v - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100;
}

function render() {
showErr('');
var heightCm = parseInput($('bmi-height'));
var weightKg = parseInput($('bmi-weight'));
try {
var bmi = BmiCalc.calcBMI(heightCm, weightKg);
var classified = BmiCalc.classifyBMI(bmi);
var zone = zoneOf(classified);
var bps = BmiCalc.zoneBreakpoints();
var pct = markerPct(bmi);

var barHtml = '<div class="bmi-bar">';
barHtml += '<div class="bmi-seg" style="left:0%;width:' + markerPct(bps[0]) + '%;background:#3b82f6"></div>';
barHtml += '<div class="bmi-seg" style="left:' + markerPct(bps[0]) + '%;width:' + (markerPct(bps[1]) - markerPct(bps[0])) + '%;background:#22c55e"></div>';
barHtml += '<div class="bmi-seg" style="left:' + markerPct(bps[1]) + '%;width:' + (markerPct(bps[2]) - markerPct(bps[1])) + '%;background:#f59e0b"></div>';
barHtml += '<div class="bmi-seg" style="left:' + markerPct(bps[2]) + '%;width:' + (100 - markerPct(bps[2])) + '%;background:#ef4444"></div>';
barHtml += '<div class="bmi-marker" style="left:' + pct + '%"></div>';
barHtml += '<span class="bmi-tick" style="left:' + markerPct(bps[0]) + '%">18.5</span>';
barHtml += '<span class="bmi-tick" style="left:' + markerPct(bps[1]) + '%">25</span>';
barHtml += '<span class="bmi-tick" style="left:' + markerPct(bps[2]) + '%">30</span>';
barHtml += '</div>';

$('bmi-value').innerHTML = '<b>' + bmi.toFixed(1) + '</b> <small>BMI</small>';
$('bmi-class').innerHTML = '<span class="bmi-badge" style="background:' + zone.color + '">' + escapeHtml(zone.label) + '</span>' +
'<span class="bmi-class-range">WHO 标准区间：' + escapeHtml(zone.range) + '</span>';
$('bmi-barwrap').innerHTML = barHtml;
$('bmi-advice').textContent = zone.advice;
$('bmi-result').style.display = '';
$('bmi-result')._last = { heightCm: heightCm, weightKg: weightKg, bmi: bmi, zone: zone };
} catch (e) {
$('bmi-result').style.display = 'none';
$('bmi-result')._last = null;
var empty = $('bmi-height').value.trim() === '' && $('bmi-weight').value.trim() === '';
if (!empty) { showErr(e.message); }
}
saveLocal();
}

/* ---------- 示例 / 复制 / 本地保存 ---------- */

function fillSample() {
$('bmi-height').value = '170';
$('bmi-weight').value = '65';
render();
toast('已填入示例并计算（身高 170cm / 体重 65kg）');
}

function clearAll() {
$('bmi-height').value = '';
$('bmi-weight').value = '';
try { localStorage.removeItem(LS_KEY); } catch (e) {}
render();
}

function buildCopyText() {
var last = $('bmi-result')._last;
if (!last) { return ''; }
return [
'BMI 体质指数计算结果',
'身高：' + last.heightCm + ' cm；体重：' + last.weightKg + ' kg',
'BMI：' + last.bmi.toFixed(1) + '（WHO 分级：' + last.zone.label + '，区间 ' + last.zone.range + '）',
'健康提示：' + last.zone.advice,
'（BMI 为筛查工具非诊断；孕妇/运动员/肌肉量大者/老人不适用；亚洲人群可参考更严格标准；结果仅供参考）'
].join('\n');
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

var SAVE_IDS = ['bmi-height', 'bmi-weight'];

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
SAVE_IDS.forEach(function (id) {
$(id).addEventListener('input', render);
});
$('bmi-sample').addEventListener('click', fillSample);
$('bmi-clear').addEventListener('click', clearAll);
$('bmi-copy').addEventListener('click', copyResult);
render();
}

if (typeof window !== 'undefined') {
window.BmiCalc = BmiCalc;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module !== 'undefined' && module.exports) {
module.exports = BmiCalc;
}

})();

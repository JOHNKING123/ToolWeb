/* BMR/TDEE 能量消耗计算器 - 纯前端工具：
 * ① 输入：性别（男/女，必填）/ 年龄（必填）/ 身高（cm，必填）/ 体重（kg，必填）
 * ② 计算：BMR 用 Mifflin-St Jeor 公式（男：10×体重＋6.25×身高−5×年龄＋5；
 *    女：10×体重＋6.25×身高−5×年龄−161），kcal/天，整数修约
 * ③ TDEE＝BMR × 活动系数（五档：久坐1.2／轻度1.375／中度1.55／重度1.725／极重1.9）
 * ④ 输出：BMR 数值＋TDEE 数值＋减脂（TDEE−500，1200 保底）／维持（TDEE）／
 *    增肌（TDEE＋300）三档热量建议
 * ⑤ 示例一键填充＋一键复制结果＋localStorage 本地保存，纯前端零上传
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * calcBMR(sex, age, heightCm, weightKg)
 * -> number（BMR，kcal/天，整数修约）。sex 必须为 'male'（男）或 'female'（女），
 * 否则抛 Error，err.field='sex'；age 非有限数字或 <=0 抛 Error，err.field='age'；
 * heightCm 非有限数字或 <=0 抛 Error，err.field='heightCm'；weightKg 非有限数字或
 * <=0 抛 Error，err.field='weightKg'。
 * activityFactors()
 * -> [{key, label, factor}] 五档活动系数（久坐 1.2／轻度活动 1.375／中度活动 1.55／
 * 重度活动 1.725／极重活动 1.9），每次返回新数组防外部篡改。
 * calcTDEE(bmr, factor)
 * -> number（TDEE，kcal/天，整数修约）。bmr 非有限数字或 <=0 抛 Error，
 * err.field='bmr'；factor 非有限数字或 <=0 抛 Error，err.field='factor'。
 * planTargets(tdee)
 * -> {cut, maintain, bulk}。cut=max(tdee−500, 1200)（减脂保底 1200 kcal）；
 * maintain=tdee；bulk=tdee＋300。tdee 非有限数字或 <=0 抛 Error，err.field='tdee'。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.BmrTdeeCalc。
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */

/* 减脂保底：每日热量不低于 1200 kcal */
var CUT_FLOOR = 1200;

/* 五档活动系数：[key 代码, 中文标签, 系数值, 档位说明] */
var FACTORS = [
{ key: 'sedentary', label: '久坐',   factor: 1.2,
  desc: '几乎不运动：办公室久坐、日常基本不走动' },
{ key: 'light',     label: '轻度活动', factor: 1.375,
  desc: '每周轻度运动 1–3 天（散步、轻松骑行等）' },
{ key: 'moderate',  label: '中度活动', factor: 1.55,
  desc: '每周中等强度运动 3–5 天（慢跑、健身操等）' },
{ key: 'heavy',     label: '重度活动', factor: 1.725,
  desc: '每周高强度运动 6–7 天，或体力劳动者' },
{ key: 'extreme',   label: '极重活动', factor: 1.9,
  desc: '每天高强度训练／重体力劳动＋规律训练' }
];

/* 三档热量目标说明文案 */
var PLAN_ADVICES = {
cut: '每日热量目标＝TDEE−500，理论每周减脂约 0.5 公斤。建议从减少高油高糖食物入手、保证蛋白质摄入，配合每周 3–5 次有氧运动；减脂≠节食，体重掉得慢才是稳的。',
maintain: '每日热量目标＝TDEE。饮食与运动保持现状即可维持体重；体重上下波动 1–2 公斤属正常范围，长期看趋势而非单日数字。',
bulk: '每日热量目标＝TDEE＋300，配合规律力量训练才能把多吃的热量变成肌肉而不是脂肪。建议优先补充优质蛋白（鸡蛋、牛奶、瘦肉、豆制品），每周至少 3 次抗阻训练。'
};

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

/* Mifflin-St Jeor：男 10×体重＋6.25×身高−5×年龄＋5；女同式但 −161 */
function calcBMR(sex, age, heightCm, weightKg) {
if (sex !== 'male' && sex !== 'female') {
throw mkErr('sex', 'sex 必须为 male（男）或 female（女）');
}
checkPositiveNum(age, 'age', 'age（年龄）');
checkPositiveNum(heightCm, 'heightCm', 'heightCm（身高）');
checkPositiveNum(weightKg, 'weightKg', 'weightKg（体重）');
var base = 10 * weightKg + 6.25 * heightCm - 5 * age;
var bmr = sex === 'male' ? base + 5 : base - 161;
return Math.round(bmr);
}

/* 五档活动系数（每次返回新数组，防外部篡改静态数据） */
function activityFactors() {
return FACTORS.map(function (f) {
return { key: f.key, label: f.label, factor: f.factor, desc: f.desc };
});
}

/* TDEE＝BMR × 活动系数，kcal/天，整数修约 */
function calcTDEE(bmr, factor) {
checkPositiveNum(bmr, 'bmr', 'bmr');
checkPositiveNum(factor, 'factor', 'factor（活动系数）');
return Math.round(bmr * factor);
}

/* 三档热量目标：减脂＝TDEE−500（1200 保底）／维持＝TDEE／增肌＝TDEE＋300 */
function planTargets(tdee) {
checkPositiveNum(tdee, 'tdee', 'tdee');
return {
cut: Math.max(tdee - 500, CUT_FLOOR),
maintain: tdee,
bulk: tdee + 300
};
}

var BmrTdeeCalc = {
calcBMR: calcBMR,
activityFactors: activityFactors,
calcTDEE: calcTDEE,
planTargets: planTargets
};

/* ---------------- 浏览器 UI ---------------- */

var LS_KEY = 'bmr_tdee_calc_v1';

function $(id) { return document.getElementById(id); }

function toast(msg) {
var t = $('bmr-toast');
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

/* 性别单选解析：未选→null（交给纯函数报非法） */
function parseSex() {
var els = document.getElementsByName('bmr-sex');
for (var i = 0; i < els.length; i++) {
if (els[i].checked) { return els[i].value; }
}
return null;
}

function showErr(msg) {
var box = $('bmr-err');
if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
box.style.display = 'block';
box.textContent = '输入有误：' + msg;
}

function factorOf(key) {
var fs = BmrTdeeCalc.activityFactors();
for (var i = 0; i < fs.length; i++) {
if (fs[i].key === key) { return fs[i]; }
}
return fs[2];
}

function render() {
showErr('');
var sex = parseSex();
var age = parseInput($('bmr-age'));
var heightCm = parseInput($('bmr-height'));
var weightKg = parseInput($('bmr-weight'));
var factorItem = factorOf($('bmr-activity').value);
try {
var bmr = BmrTdeeCalc.calcBMR(sex, age, heightCm, weightKg);
var tdee = BmrTdeeCalc.calcTDEE(bmr, factorItem.factor);
var plans = BmrTdeeCalc.planTargets(tdee);
var cutCapped = (tdee - 500) < CUT_FLOOR;

var plansHtml = ''
+ '<div class="bmr-plan" style="border-color:#3b82f6">'
+ '<div class="bmr-plan-title" style="color:#3b82f6">减脂</div>'
+ '<div class="bmr-plan-num">' + plans.cut + ' <small>kcal/天</small></div>'
+ '<div class="bmr-plan-desc">' + escapeHtml(PLAN_ADVICES.cut) + '</div>'
+ (cutCapped
? '<div class="bmr-plan-warn">⚠️ 已触及 <b>1200 kcal 保底线</b>：你的 TDEE 较低，再压低热量可能影响基础代谢与健康，请勿自行低于此值减脂，必要时咨询医生或营养师。</div>'
: '')
+ '</div>'
+ '<div class="bmr-plan" style="border-color:#22c55e">'
+ '<div class="bmr-plan-title" style="color:#22c55e">维持</div>'
+ '<div class="bmr-plan-num">' + plans.maintain + ' <small>kcal/天</small></div>'
+ '<div class="bmr-plan-desc">' + escapeHtml(PLAN_ADVICES.maintain) + '</div>'
+ '</div>'
+ '<div class="bmr-plan" style="border-color:#f59e0b">'
+ '<div class="bmr-plan-title" style="color:#f59e0b">增肌</div>'
+ '<div class="bmr-plan-num">' + plans.bulk + ' <small>kcal/天</small></div>'
+ '<div class="bmr-plan-desc">' + escapeHtml(PLAN_ADVICES.bulk) + '</div>'
+ '</div>';

$('bmr-value').innerHTML = '<b>' + bmr + '</b> <small>kcal/天</small>';
$('bmr-tdee').innerHTML = '<b>' + tdee + '</b> <small>kcal/天</small>';
$('bmr-factor-label').textContent = '活动系数：' + factorItem.label + ' ×' + factorItem.factor;
$('bmr-plans').innerHTML = plansHtml;
$('bmr-result').style.display = '';
$('bmr-result')._last = {
sex: sex, age: age, heightCm: heightCm, weightKg: weightKg,
factorLabel: factorItem.label, factor: factorItem.factor,
bmr: bmr, tdee: tdee, plans: plans, cutCapped: cutCapped
};
} catch (e) {
$('bmr-result').style.display = 'none';
$('bmr-result')._last = null;
var empty = sex === null && $('bmr-age').value.trim() === '' &&
$('bmr-height').value.trim() === '' && $('bmr-weight').value.trim() === '';
if (!empty) { showErr(e.message); }
}
saveLocal();
}

/* ---------- 示例 / 复制 / 本地保存 ---------- */

function fillSample() {
document.getElementById('bmr-sex-m').checked = true;
$('bmr-age').value = '30';
$('bmr-height').value = '175';
$('bmr-weight').value = '70';
$('bmr-activity').value = 'moderate';
render();
toast('已填入示例并计算（男 30 岁 / 175cm / 70kg / 中度活动）');
}

function clearAll() {
document.getElementById('bmr-sex-m').checked = false;
document.getElementById('bmr-sex-f').checked = false;
$('bmr-age').value = '';
$('bmr-height').value = '';
$('bmr-weight').value = '';
$('bmr-activity').value = 'moderate';
try { localStorage.removeItem(LS_KEY); } catch (e) {}
render();
}

function sexLabel(sex) { return sex === 'male' ? '男' : '女'; }

function buildCopyText() {
var last = $('bmr-result')._last;
if (!last) { return ''; }
var lines = [
'BMR/TDEE 能量消耗计算结果',
'输入：' + sexLabel(last.sex) + '，' + last.age + ' 岁，身高 ' + last.heightCm +
' cm，体重 ' + last.weightKg + ' kg，活动：' + last.factorLabel + '（×' + last.factor + '）',
'BMR（基础代谢率）：' + last.bmr + ' kcal/天',
'TDEE（每日总能量消耗）：' + last.tdee + ' kcal/天',
'减脂目标：' + last.plans.cut + ' kcal/天（TDEE−500' + (last.cutCapped ? '，已触及 1200 保底线' : '') + '）',
'维持目标：' + last.plans.maintain + ' kcal/天（＝TDEE）',
'增肌目标：' + last.plans.bulk + ' kcal/天（TDEE＋300）',
'（Mifflin-St Jeor 为群体估计公式非医疗建议；活动系数为自报主观估计；孕妇/哺乳期/疾病人群/运动员不适用；结果仅供参考）'
];
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

var SAVE_IDS = ['bmr-age', 'bmr-height', 'bmr-weight', 'bmr-activity'];

function saveLocal() {
try {
var data = {};
SAVE_IDS.forEach(function (id) { data[id] = $(id).value; });
var sex = parseSex();
data['bmr-sex'] = sex === null ? '' : sex;
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
if (data['bmr-sex'] === 'male' || data['bmr-sex'] === 'female') {
var els = document.getElementsByName('bmr-sex');
for (var i = 0; i < els.length; i++) {
if (els[i].value === data['bmr-sex']) { els[i].checked = true; any = true; }
}
}
return any;
} catch (e) { return false; }
}

function init() {
/* 活动系数下拉框由纯函数数据驱动，保证 UI 与契约一致 */
var sel = $('bmr-activity');
BmrTdeeCalc.activityFactors().forEach(function (f) {
var opt = document.createElement('option');
opt.value = f.key;
opt.textContent = f.label + ' ×' + f.factor + '（' + f.desc + '）';
sel.appendChild(opt);
});
sel.value = 'moderate';

loadLocal();

var sexEls = document.getElementsByName('bmr-sex');
for (var i = 0; i < sexEls.length; i++) {
sexEls[i].addEventListener('change', render);
}
SAVE_IDS.forEach(function (id) {
$(id).addEventListener('input', render);
});
sel.addEventListener('change', render);
$('bmr-sample').addEventListener('click', fillSample);
$('bmr-clear').addEventListener('click', clearAll);
$('bmr-copy').addEventListener('click', copyResult);
render();
}

if (typeof window !== 'undefined') {
window.BmrTdeeCalc = BmrTdeeCalc;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module !== 'undefined' && module.exports) {
module.exports = BmrTdeeCalc;
}

})();

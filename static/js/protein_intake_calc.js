/* 蛋白质摄入量计算器 - 纯前端工具：
* ① 体重（kg）＋目标三档（维持／减脂护肌／增肌）→每日蛋白质克数区间
*    （维持 1.2–1.6、增肌 1.6–2.2、减脂护肌 2.0–2.4 g/kg，区间两端整数修约）
* ② 蛋白质热量 = 克数 × 4 kcal/g（区间）
* ③ 按 3–5 餐分配（每餐区间保留 1 位小数）
* ④ 常见食物蛋白质速查表（静态数组 ≥10 项）
* ⑤ 示例一键填充 ＋ 一键复制 ＋ localStorage 本地保存
* ⑥ 纯前端零上传
*
* 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* proteinRange(weightKg, goal) -> {minG, maxG, minKcal, maxKcal}。
* weightKg 须为有限正数，否则 err.field='weightKg'；
* goal ∈ {'maintain','bulk','cut'}（维持/增肌/减脂护肌），否则 err.field='goal'；
* minG/maxG 为区间两端整数修约（Math.round），minKcal/maxKcal = minG/maxG × 4。
* perMealRange(totalMin, totalMax, meals) -> {minG, maxG}。
* totalMin/totalMax 须为有限非负数且 totalMin <= totalMax，否则 err.field='totalMin'/'totalMax'；
* meals 须为 3、4、5 的整数，否则 err.field='meals'；
* 按区间均分，保留 1 位小数。
* foodList() -> 静态数组 [{name, unit, gramsPerUnit}]，≥10 条。
*
* 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.ProteinIntakeCalc。
* Node 自测：module.exports 暴露纯函数。
*/
(function () {
'use strict';

/* ---------------- 常量 ---------------- */

var KCAL_PER_G = 4; // 蛋白质热量换算：1 g 蛋白质 ≈ 4 kcal
var STORE_KEY = 'protein_intake_calc_v1';
var GOALS = {
maintain: {label: '维持', minF: 1.2, maxF: 1.6},
bulk: {label: '增肌', minF: 1.6, maxF: 2.2},
cut: {label: '减脂护肌', minF: 2.0, maxF: 2.4}
};
var MEALS_MIN = 3, MEALS_MAX = 5;
var SAMPLES = [
{label: '示例① 75kg 增肌', weight: 75, goal: 'bulk', meals: 4},
{label: '示例② 70kg 减脂护肌', weight: 70, goal: 'cut', meals: 4},
{label: '示例③ 70kg 维持', weight: 70, goal: 'maintain', meals: 3}
];
var FOODS = [
{name: '鸡蛋', unit: '1 个（约 50g）', gramsPerUnit: 6.5},
{name: '牛奶', unit: '250 ml', gramsPerUnit: 8.5},
{name: '鸡胸肉（去皮）', unit: '100 g', gramsPerUnit: 31},
{name: '瘦牛肉', unit: '100 g', gramsPerUnit: 26},
{name: '三文鱼', unit: '100 g', gramsPerUnit: 25},
{name: '虾仁', unit: '100 g', gramsPerUnit: 24},
{name: '金枪鱼罐头（水浸）', unit: '100 g', gramsPerUnit: 26},
{name: '豆腐（北豆腐）', unit: '100 g', gramsPerUnit: 8},
{name: '希腊酸奶（无糖）', unit: '100 g', gramsPerUnit: 10},
{name: '乳清蛋白粉', unit: '1 勺（约 30g）', gramsPerUnit: 24},
{name: '花生', unit: '100 g', gramsPerUnit: 26},
{name: '鹰嘴豆（煮熟）', unit: '100 g', gramsPerUnit: 9}
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

/* ---------------- 纯函数：蛋白质区间 ---------------- */

function proteinRange(weightKg, goal) {
checkPosNum(weightKg, 'weightKg');
var g = GOALS[goal];
if (!g) {
throw mkErr('goal', "goal 必须为 'maintain'/'bulk'/'cut' 之一，实得 " + goal);
}
var minG = Math.round(weightKg * g.minF);
var maxG = Math.round(weightKg * g.maxF);
return {
minG: minG,
maxG: maxG,
minKcal: minG * KCAL_PER_G,
maxKcal: maxG * KCAL_PER_G
};
}

function perMealRange(totalMin, totalMax, meals) {
checkNonNegNum(totalMin, 'totalMin');
checkNonNegNum(totalMax, 'totalMax');
if (totalMin > totalMax) {
throw mkErr('totalMin', 'totalMin 不能大于 totalMax，实得 ' + totalMin + ' > ' + totalMax);
}
if (typeof meals!== 'number' ||!isFinite(meals) || meals % 1!== 0 ||
meals < MEALS_MIN || meals > MEALS_MAX) {
throw mkErr('meals', 'meals 必须为 ' + MEALS_MIN + '–' + MEALS_MAX + ' 的整数，实得 ' + meals);
}
function r1(x) { return Math.round(x * 10) / 10; }
return {
minG: r1(totalMin / meals),
maxG: r1(totalMax / meals)
};
}

function foodList() {
return FOODS.map(function (f) {
return {name: f.name, unit: f.unit, gramsPerUnit: f.gramsPerUnit};
});
}

var ProteinIntakeCalc = {
GOALS: GOALS,
KCAL_PER_G: KCAL_PER_G,
MEALS_MIN: MEALS_MIN,
MEALS_MAX: MEALS_MAX,
SAMPLES: SAMPLES,
proteinRange: proteinRange,
perMealRange: perMealRange,
foodList: foodList
};

/* ---------------- 浏览器 UI（仅 window 环境） ---------------- */

function $(id) { return document.getElementById(id); }

function toast(msg) {
var t = $('pic-toast');
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._h);
t._h = setTimeout(function () { t.style.display = 'none'; }, 2200);
}

function readInputs() {
var wEl = $('pic-weight');
var weight = wEl.value.trim() === '' ? NaN : Number(wEl.value);
var goalEl = document.querySelector('input[name="pic-goal"]:checked');
var goal = goalEl ? goalEl.value : null;
var mealsEl = document.querySelector('input[name="pic-meals"]:checked');
var meals = mealsEl ? Number(mealsEl.value) : NaN;
return {weight: weight, goal: goal, meals: meals};
}

function saveState(inp) {
try {
localStorage.setItem(STORE_KEY, JSON.stringify(inp));
} catch (e) {}
}

function loadState() {
try {
var raw = localStorage.getItem(STORE_KEY);
return raw ? JSON.parse(raw) : null;
} catch (e) { return null; }
}

function renderFoods() {
var tb = $('pic-foods-body');
var html = '';
foodList().forEach(function (f) {
html += '<tr><td>' + f.name + '</td><td>' + f.unit + '</td><td>约 ' + f.gramsPerUnit + ' g</td></tr>';
});
tb.innerHTML = html;
}

function copyText() {
var r = $('pic-result-line');
var txt = r.getAttribute('data-copy') || r.textContent;
function done() { toast('已复制到剪贴板'); }
function fallback() {
var ta = document.createElement('textarea');
ta.value = txt;
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done(); }
catch (e) { toast('复制失败，请手动选中复制'); }
document.body.removeChild(ta);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(txt).then(done, fallback);
} else {
fallback();
}
}

function render() {
var errBox = $('pic-error');
var outBox = $('pic-result');
errBox.style.display = 'none';
errBox.textContent = '';
var inp = readInputs();
if (isNaN(inp.weight) || inp.weight === null || $('pic-weight').value.trim() === '') {
outBox.style.display = 'none';
return;
}
try {
var r = proteinRange(inp.weight, inp.goal);
var m = perMealRange(r.minG, r.maxG, inp.meals);
} catch (e) {
outBox.style.display = 'none';
errBox.textContent = '输入有误：' + e.message;
errBox.style.display = 'block';
return;
}
saveState(inp);
var gLabel = GOALS[inp.goal].label;
var mealLine = '分 ' + inp.meals + ' 餐 → 每餐约 ' + m.minG + '–' + m.maxG + ' g';
var line = '体重 ' + inp.weight + ' kg · 目标' + gLabel +
'：每日蛋白质 ' + r.minG + '–' + r.maxG + ' g（蛋白质热量约 ' +
r.minKcal + '–' + r.maxKcal + ' kcal），' + mealLine;
var rl = $('pic-result-line');
rl.innerHTML = '<span class="pic-result-num">' + r.minG + '–' + r.maxG + '</span>' +
'<span class="pic-result-unit">g / 天（' + gLabel + '）</span>' +
'<div class="pic-subline">蛋白质热量：约 ' + r.minKcal + '–' + r.maxKcal + ' kcal（按 4 kcal/g）</div>' +
'<div class="pic-subline">' + mealLine + '（参照：每餐 25–40 g 较易吸收利用）</div>';
rl.setAttribute('data-copy', '蛋白质摄入量计算器：' + line);
outBox.style.display = 'block';
}

function fillSample(i) {
var s = SAMPLES[i];
$('pic-weight').value = s.weight;
document.querySelectorAll('input[name="pic-goal"]').forEach(function (el) {
el.checked = el.value === s.goal;
});
document.querySelectorAll('input[name="pic-meals"]').forEach(function (el) {
el.checked = Number(el.value) === s.meals;
});
render();
toast('已填充' + s.label);
}

function clearAll() {
$('pic-weight').value = '';
document.querySelector('input[name="pic-goal"][value="maintain"]').checked = true;
document.querySelector('input[name="pic-meals"][value="4"]').checked = true;
try { localStorage.removeItem(STORE_KEY); } catch (e) {}
$('pic-result').style.display = 'none';
$('pic-error').style.display = 'none';
toast('已清空');
}

function init() {
if (!$('pic-weight')) return;
var st = loadState();
if (st) {
if (st.weight) $('pic-weight').value = st.weight;
if (st.goal) {
var g = document.querySelector('input[name="pic-goal"][value="' + st.goal + '"]');
if (g) g.checked = true;
}
if (st.meals) {
var mm = document.querySelector('input[name="pic-meals"][value="' + st.meals + '"]');
if (mm) mm.checked = true;
}
}
renderFoods();
$('pic-weight').addEventListener('input', render);
document.querySelectorAll('input[name="pic-goal"]').forEach(function (el) {
el.addEventListener('change', render);
});
document.querySelectorAll('input[name="pic-meals"]').forEach(function (el) {
el.addEventListener('change', render);
});
SAMPLES.forEach(function (s, i) {
var btn = document.createElement('button');
btn.className = 'btn btn-secondary';
btn.type = 'button';
btn.textContent = s.label;
btn.addEventListener('click', function () { fillSample(i); });
$('pic-samples').appendChild(btn);
});
$('pic-copy').addEventListener('click', copyText);
$('pic-clear').addEventListener('click', clearAll);
render();
}

if (typeof window!== 'undefined') {
window.ProteinIntakeCalc = ProteinIntakeCalc;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = ProteinIntakeCalc;
}

})();

/* 工资个税计算器 - 纯前端本地计算工具
*
* 计算规则（按 2019 年个税法及现行细则实现）：
* 1. 工资薪金累计预扣预缴（国家税务总局公告 2018 年第 61 号）：
* 某月累计预扣预缴应纳税所得额 = 累计收入 - 累计减除费用(5000×月数) - 累计专项扣除(三险一金个人部分)
* - 累计专项附加扣除(不含大病医疗) - 累计依法确定的其他扣除
* 当月预扣税额 = 累计应纳税所得额 × 预扣率 - 速算扣除数 - 累计已预扣税额
* 预扣率表（累计）：≤36000:3%/0；36000~144000:10%/2520；144000~300000:20%/16920；
* 300000~420000:25%/31920；420000~660000:30%/52920；660000~960000:35%/85920；>960000:45%/181920
* 2. 七项专项附加扣除（月度口径）：子女教育 2000/孩·月；3 岁以下婴幼儿照护 2000/孩·月；
* 继续教育学历(学位) 400/月，技能/专业技术人员职业资格当年 3600(建议按 300/月均摊录入)；
* 住房贷款利息(首套) 1000/月；住房租金 1500/1100/800 三档；赡养老人独生子女 3000/月(非独生子女分摊)；
* 大病医疗仅在年度汇算清缴时扣除(个人负担超 15000 元部分，上限 80000/年)，预扣预缴阶段不扣除。
* 同一纳税年度内，住房贷款利息与住房租金只能选择其一扣除。
* 3. 年终奖（全年一次性奖金，财税〔2023〕30 号延续单独计税至 2027 年底）：
* 单独计税：奖金 ÷ 12 找月度税率表档位，应纳税额 = 奖金 × 税率 - 速算扣除数；
* 月度表：≤3000:3%/0；3000~12000:10%/210；12000~25000:20%/1410；25000~35000:25%/2660；
* 35000~55000:30%/4410；55000~80000:35%/7160；>80000:45%/15160
* 并入综合所得：奖金计入年度应纳税所得额，按综合所得年度税率表计税。
* 4. 年度汇算：应纳税额按全年应纳税所得额 × 年度税率表(与预扣率表同档) - 速算扣除数；
* 多退少补 = 年度预扣合计 - 汇算应纳税额(推荐方案)。
* 简化假设：全年 12 个月工资、社保公积金与专项附加扣除金额相同；年终奖在对比卡中单独处理，
* 月度预扣明细按工资薪金部分展示(实务中年终奖发放当月并入当月累计)。
* 金额统一按元计算，展示保留两位小数。纯逻辑函数无 DOM，可在 Node 下单测（module.exports 导出）。
* 全程不上传服务器，无新增后端接口。
*/
(function () {
'use strict';

/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

function round2(n) {
return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* 综合所得累计预扣率表 / 年度税率表 */
var WITHHOLD_BRACKETS = [
{ limit: 36000, rate: 0.03, quick: 0},
{ limit: 144000, rate: 0.10, quick: 2520},
{ limit: 300000, rate: 0.20, quick: 16920},
{ limit: 420000, rate: 0.25, quick: 31920},
{ limit: 660000, rate: 0.30, quick: 52920},
{ limit: 960000, rate: 0.35, quick: 85920},
{ limit: Infinity, rate: 0.45, quick: 181920}
];

/* 年终奖单独计税月度税率表（按 奖金/12 找档） */
var BONUS_BRACKETS = [
{ limit: 3000, rate: 0.03, quick: 0},
{ limit: 12000, rate: 0.10, quick: 210},
{ limit: 25000, rate: 0.20, quick: 1410},
{ limit: 35000, rate: 0.25, quick: 2660},
{ limit: 55000, rate: 0.30, quick: 4410},
{ limit: 80000, rate: 0.35, quick: 7160},
{ limit: Infinity, rate: 0.45, quick: 15160}
];

/* 按税率表计算应纳税额：taxable 为应纳税所得额（元） */
function taxByBrackets(taxable, brackets) {
if (!(taxable > 0)) { return 0;}
for (var i = 0; i < brackets.length; i++) {
if (taxable <= brackets[i].limit) {
return round2(taxable * brackets[i].rate - brackets[i].quick);
}
}
return 0;
}

/* 查累计预扣适用档位的预扣率（展示用） */
function bracketRate(taxable, brackets) {
if (!(taxable > 0)) { return 0;}
for (var i = 0; i < brackets.length; i++) {
if (taxable <= brackets[i].limit) { return brackets[i].rate;}
}
return 0;
}

/* 年终奖单独计税：bonus 为年终奖（元），返回应纳税额 */
function bonusSeparateTax(bonus) {
if (!(bonus > 0)) { return 0;}
var perMonth = bonus / 12;
for (var i = 0; i < BONUS_BRACKETS.length; i++) {
if (perMonth <= BONUS_BRACKETS[i].limit) {
return round2(bonus * BONUS_BRACKETS[i].rate - BONUS_BRACKETS[i].quick);
}
}
return 0;
}

/* 大病医疗汇算可扣除额：annual 为年度个人负担金额（元） */
function medicalDeductible(annual) {
if (!(annual > 15000)) { return 0;}
return Math.min(80000, round2(annual - 15000));
}

/* 月度累计预扣明细
* monthlySalary: 税前月薪（元）；socialMonthly: 社保公积金个人缴纳（元/月）；
* specialMonthly: 专项附加扣除合计（元/月，不含大病医疗）
* 返回 { months:[{m, cumTaxable, rate, monthTax, monthNet}], totalWithheld, totalNet, annualTaxableBase}
* annualTaxableBase: 年度应纳税所得额基数（不含大病医疗、不含年终奖，供汇算用）
*/
function calcMonthlyWithhold(monthlySalary, socialMonthly, specialMonthly) {
var months = [];
var prevCumTax = 0;
var totalWithheld = 0;
var totalNet = 0;
var annualTaxableBase = 0;
for (var m = 1; m <= 12; m++) {
var cumTaxable = monthlySalary * m - 5000 * m - socialMonthly * m - specialMonthly * m;
if (cumTaxable < 0) { cumTaxable = 0;}
cumTaxable = round2(cumTaxable);
var cumTax = taxByBrackets(cumTaxable, WITHHOLD_BRACKETS);
var monthTax = round2(cumTax - prevCumTax);
if (monthTax < 0) { monthTax = 0;}
prevCumTax = cumTax;
var monthNet = round2(monthlySalary - socialMonthly - monthTax);
months.push({
m: m,
cumTaxable: cumTaxable,
rate: bracketRate(cumTaxable, WITHHOLD_BRACKETS),
monthTax: monthTax,
monthNet: monthNet
});
totalWithheld = round2(totalWithheld + monthTax);
totalNet = round2(totalNet + monthNet);
if (m === 12) { annualTaxableBase = cumTaxable;}
}
return {
months: months,
totalWithheld: totalWithheld,
totalNet: totalNet,
avgNet: round2(totalNet / 12),
annualTaxableBase: annualTaxableBase
};
}

/* 年度汇算 + 年终奖双方案对比
* annualTaxableBase: 年度应纳税所得额基数（不含大病医疗、不含年终奖）
* medicalAnnual: 大病医疗年度个人负担金额（元）
* bonus: 年终奖（元）
* totalWithheld: 年度预扣合计（元）
* 返回 { medicalDed, taxableA, planA, planB, recommend('separate'|'merged'), saveAmount, settleTax, refundOrOwe}
* taxableA: 汇算应纳税所得额（扣大病医疗后，不含年终奖）
* planA: 年终奖单独计税方案年度总税额；planB: 并入综合所得方案年度总税额
* recommend: 更划算的方案；saveAmount: 较另一方案少缴税额
* settleTax: 推荐方案汇算应纳税额；refundOrOwe: 预扣合计 - 汇算应纳税额（正数为可退税，负数为需补税）
*/
function calcAnnualCompare(annualTaxableBase, medicalAnnual, bonus, totalWithheld) {
var medicalDed = medicalDeductible(medicalAnnual);
var taxableA = annualTaxableBase - medicalDed;
if (taxableA < 0) { taxableA = 0;}
taxableA = round2(taxableA);
var salaryTax = taxByBrackets(taxableA, WITHHOLD_BRACKETS);
var planA = round2(salaryTax + bonusSeparateTax(bonus));
var planB = taxByBrackets(round2(taxableA + bonus), WITHHOLD_BRACKETS);
var recommend = planA <= planB? 'separate': 'merged';
var settleTax = recommend === 'separate'? planA: planB;
var saveAmount = round2(Math.abs(planA - planB));
var refundOrOwe = round2(totalWithheld - settleTax);
return {
medicalDed: medicalDed,
taxableA: taxableA,
planA: planA,
planB: planB,
recommend: recommend,
saveAmount: saveAmount,
settleTax: settleTax,
refundOrOwe: refundOrOwe
};
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = {
round2: round2,
WITHHOLD_BRACKETS: WITHHOLD_BRACKETS,
BONUS_BRACKETS: BONUS_BRACKETS,
taxByBrackets: taxByBrackets,
bracketRate: bracketRate,
bonusSeparateTax: bonusSeparateTax,
medicalDeductible: medicalDeductible,
calcMonthlyWithhold: calcMonthlyWithhold,
calcAnnualCompare: calcAnnualCompare
};
}

/* ---------------- DOM 交互（Node 单测环境下提前返回） ---------------- */

if (typeof document === 'undefined') { return; }

function $(id) { return document.getElementById(id);}

function num(id) {
var v = parseFloat(String($('st-' + id).value).replace(/,/g, ''));
return isNaN(v)? 0: v;
}

function checked(id) { return $('st-' + id).checked;}

function fmt(n) {
return (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function fmtInt(n) {
return Math.round(n).toLocaleString('zh-CN');
}

function showError(msg) {
var el = $('st-error');
if (!msg) { el.style.display = 'none'; el.textContent = ''; return;}
el.style.display = 'block';
el.textContent = msg;
}

/* 专项附加扣除项配置：{key, inputId, calc} */
function collectSpecialDeductions() {
var items = [];
var total = 0;
if (checked('d-children')) {
var c = Math.max(0, Math.floor(num('d-children-count')));
var amt = c * 2000;
total += amt;
items.push({ name: '子女教育', detail: c + ' 个子女 × 2000 元/月', amount: amt});
}
if (checked('d-infant')) {
var n = Math.max(0, Math.floor(num('d-infant-count')));
var amt2 = n * 2000;
total += amt2;
items.push({ name: '3 岁以下婴幼儿照护', detail: n + ' 个子女 × 2000 元/月', amount: amt2});
}
if (checked('d-edu')) {
var amt3 = Math.max(0, num('d-edu-amt'));
total += amt3;
items.push({ name: '继续教育', detail: '每月 ' + fmt(amt3) + ' 元', amount: amt3});
}
if (checked('d-loan')) {
total += 1000;
items.push({ name: '住房贷款利息', detail: '首套住房贷款，1000 元/月', amount: 1000});
}
if (checked('d-rent')) {
var amt5 = Math.max(0, num('d-rent-amt'));
total += amt5;
items.push({ name: '住房租金', detail: '每月 ' + fmt(amt5) + ' 元', amount: amt5});
}
if (checked('d-elder')) {
var amt6 = Math.max(0, num('d-elder-amt'));
total += amt6;
items.push({ name: '赡养老人', detail: '每月 ' + fmt(amt6) + ' 元', amount: amt6});
}
return { items: items, total: round2(total)};
}

function run() {
showError(null);
var salary = num('salary');
var salaryRaw = String($('st-salary').value).trim();
if (salaryRaw === '' || isNaN(parseFloat(salaryRaw))) { showError('请填写税前月薪。'); return;}
if (salary < 0) { showError('税前月薪不能为负数。'); return;}
var social = num('social');
if (social < 0) { showError('社保公积金个人缴纳金额不能为负数。'); return;}
var bonus = num('bonus');
if (bonus < 0) { showError('年终奖不能为负数。'); return;}
var medicalAnnual = checked('d-medical')? Math.max(0, num('d-medical-amt')): 0;

/* 住房贷款利息与住房租金不可兼得 */
if (checked('d-loan') && checked('d-rent')) {
showError('同一纳税年度内，住房贷款利息与住房租金只能选择其一扣除，请取消其中一项后再计算。');
return;
}

var ded = collectSpecialDeductions();
var monthly = calcMonthlyWithhold(salary, social, ded.total);
var annual = calcAnnualCompare(monthly.annualTaxableBase, medicalAnnual, bonus, monthly.totalWithheld);

/* KPI */
var annualIncome = round2(salary * 12 + bonus);
var effectiveRate = annualIncome > 0? (annual.settleTax / annualIncome * 100): 0;
var kpis = [
{ k: '首月税后工资（元）', v: fmt(monthly.months[0].monthNet), total: true},
{ k: '月均税后工资（元）', v: fmt(monthly.avgNet)},
{ k: '年度预扣个税合计（元）', v: fmt(monthly.totalWithheld)},
{ k: '有效税率（推荐方案）', v: effectiveRate.toFixed(2) + '%'}
];
$('st-kpis').innerHTML = kpis.map(function (x) {
return '<div class="st-kpi' + (x.total? ' total': '') + '"><div class="v">' + x.v + '</div><div class="k">' + x.k + '</div></div>';
}).join('');

/* 专项附加扣除明细 */
var dedHtml = ded.items.length
? ded.items.map(function (x) {
return '<tr><td>' + x.name + '</td><td>' + x.detail + '</td><td class="num">' + fmt(x.amount) + '</td></tr>';
}).join('') + '<tr class="total"><td colspan="2">专项附加扣除合计（元/月）</td><td class="num">' + fmt(ded.total) + '</td></tr>'
: '<tr><td colspan="3" style="color:#9ca3af;">未选择专项附加扣除</td></tr>';
$('st-ded-rows').innerHTML = dedHtml;

/* 月度预扣明细 */
$('st-rows').innerHTML = monthly.months.map(function (x) {
return '<tr><td class="num">' + x.m + '</td><td class="num">' + fmt(x.cumTaxable) + '</td><td class="num">' +
(x.cumTaxable > 0? (x.rate * 100).toFixed(0) + '%': '—') + '</td><td class="num">' + fmt(x.monthTax) +
'</td><td class="num">' + fmt(x.monthNet) + '</td></tr>';
}).join('');

/* 年终奖对比 */
var recText = annual.recommend === 'separate'? '单独计税更划算': '并入综合所得更划算';
var recClass = annual.recommend === 'separate'? 'separate': 'merged';
var cmpHtml = ''
+ '<div class="st-plan"><div class="st-plan-title">方案一：年终奖单独计税</div>'
+ '<div class="st-plan-tax">' + fmt(annual.planA) + ' <span>元 / 年</span></div>'
+ '<div class="st-plan-desc">工资薪金汇算税 ' + fmt(taxByBrackets(annual.taxableA, WITHHOLD_BRACKETS)) + ' 元 + 年终奖单独计税 ' + fmt(bonusSeparateTax(bonus)) + ' 元</div></div>'
+ '<div class="st-plan"><div class="st-plan-title">方案二：年终奖并入综合所得</div>'
+ '<div class="st-plan-tax">' + fmt(annual.planB) + ' <span>元 / 年</span></div>'
+ '<div class="st-plan-desc">年度应纳税所得额 ' + fmt(round2(annual.taxableA + bonus)) + ' 元，按综合所得年度税率表计税</div></div>'
+ '<div class="st-recommend ' + recClass + '"><i class="material-icons">thumb_up</i><div><b>' + recText + '</b>'
+ (annual.saveAmount > 0? '，可少缴税 <b>' + fmt(annual.saveAmount) + '</b> 元。': '，两种方案税额相同。')
+ '</div></div>';
if (annual.medicalDed > 0) {
cmpHtml += '<div class="st-note"><i class="material-icons">healing</i><div>大病医疗专项附加扣除 ' + fmt(annual.medicalDed) + ' 元已在年度汇算中扣除（预扣预缴阶段不扣除），汇算清缴时可申请退税。</div></div>';
}
var ro = annual.refundOrOwe;
var settleHtml = ro > 0
? '按推荐方案汇算，您全年多预缴了 <b>' + fmt(ro) + '</b> 元，次年汇算清缴时可申请退税。'
: (ro < 0
? '按推荐方案汇算，您全年少预缴了 <b>' + fmt(-ro) + '</b> 元，次年汇算清缴时需补税。'
: '按推荐方案汇算，预扣税额与应纳税额一致，无需退补税。');
cmpHtml += '<div class="st-note"><i class="material-icons">receipt_long</i><div>' + settleHtml + '</div></div>';
$('st-compare').innerHTML = cmpHtml;

/* 复制文本缓存 */
var lines = [];
lines.push('（本地计算，仅供参考）');
lines.push('税前月薪：' + fmt(salary) + ' 元；社保公积金(个人/月)：' + fmt(social) + ' 元；年终奖：' + fmt(bonus) + ' 元');
lines.push('专项附加扣除(元/月)：' + (ded.items.length? ded.items.map(function (x) { return x.name + fmt(x.amount);}).join('、'): '无') + '，合计 ' + fmt(ded.total));
if (medicalAnnual > 0) { lines.push('大病医疗(年度个人负担)：' + fmt(medicalAnnual) + ' 元，汇算可扣 ' + fmt(annual.medicalDed) + ' 元');}
lines.push('首月税后工资：' + fmt(monthly.months[0].monthNet) + ' 元；月均税后工资：' + fmt(monthly.avgNet) + ' 元');
lines.push('年度预扣个税合计：' + fmt(monthly.totalWithheld) + ' 元');
lines.push('年终奖单独计税方案年度总税额：' + fmt(annual.planA) + ' 元；并入综合所得方案：' + fmt(annual.planB) + ' 元');
lines.push('推荐：' + recText + (annual.saveAmount > 0? '，少缴 ' + fmt(annual.saveAmount) + ' 元': ''));
lines.push('有效税率：' + effectiveRate.toFixed(2) + '%');
lines.push('免责声明：按 2019 年个税法及现行细则实现，仅供参考，不构成税务建议；具体以税务机关口径为准。');
window.__stCopyText = lines.join('\n');

$('st-result').style.display = 'block';
$('st-copy').disabled = false;
$('st-result').scrollIntoView({ behavior: 'smooth', block: 'start'});
}

function copyResult() {
var t = window.__stCopyText || '';
if (!t) { return;}
function done(ok) {
var btn = $('st-copy');
var old = btn.innerHTML;
btn.innerHTML = '<i class="material-icons">check</i> ' + (ok? '已复制': '复制失败');
setTimeout(function () { btn.innerHTML = old;}, 1600);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(t).then(function () { done(true);}, function () { done(false);});
} else {
var ta = document.createElement('textarea');
ta.value = t;
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done(true);} catch (e) { done(false);}
document.body.removeChild(ta);
}
}

function resetAll() {
['salary', 'social', 'bonus'].forEach(function (id) { $('st-' + id).value = '';});
['d-children', 'd-infant', 'd-edu', 'd-loan', 'd-rent', 'd-elder', 'd-medical'].forEach(function (id) {
$('st-' + id).checked = false;
});
$('st-d-children-count').value = '';
$('st-d-infant-count').value = '';
$('st-d-edu-amt').value = '';
$('st-d-rent-amt').value = '1500';
$('st-d-elder-amt').value = '';
$('st-d-medical-amt').value = '';
syncDedInputs();
showError(null);
$('st-result').style.display = 'none';
$('st-copy').disabled = true;
window.__stCopyText = '';
}

/* 勾选框联动：未勾选时禁用对应输入 */
var DED_INPUTS = [
['d-children', ['st-d-children-count']],
['d-infant', ['st-d-infant-count']],
['d-edu', ['st-d-edu-amt']],
['d-rent', ['st-d-rent-amt']],
['d-elder', ['st-d-elder-amt']],
['d-medical', ['st-d-medical-amt']]
];

function syncDedInputs() {
DED_INPUTS.forEach(function (pair) {
var on = $('st-' + pair[0]).checked;
pair[1].forEach(function (iid) { $(iid).disabled =!on;});
});
}

document.addEventListener('DOMContentLoaded', function () {
$('st-run').addEventListener('click', run);
$('st-copy').addEventListener('click', copyResult);
$('st-reset').addEventListener('click', resetAll);
DED_INPUTS.forEach(function (pair) {
$('st-' + pair[0]).addEventListener('change', syncDedInputs);
});
syncDedInputs();
});

})();

/* 房贷计算器 - 纯前端本地计算工具
*
* 还款方式：
* 等额本息：每月月供相同，月供 = P*r*(1+r)^n / ((1+r)^n-1)，r 为月利率，n 为期数
* 等额本金：每月归还本金相同（P/n），第 i 期月供 = P/n + (P - P/n*(i-1))*r，逐月递减
* 金额统一按元计算，展示时保留两位小数；末期自动吸收四舍五入尾差，保证剩余本金归零。
* 输出：首月/月均月供、总利息、还款总额、两种方式总利息对比、逐期还款明细表（期数/月供/本金/利息/剩余本金）、一键复制结果。
* 全程不上传服务器，无新增后端接口。
* 纯逻辑函数无 DOM，可在 Node 下单测（module.exports 导出）。
*/
(function () {
'use strict';

/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

function round2(n) {
return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* 每期明细项：{no, payment, principal, interest, remaining}（金额均为元） */

/* 等额本息：principalYuan 为贷款总额（元），annualRate 为年利率（%），years 为贷款年限（年）
* 返回 {method:'installment', monthly(每月月供，末期可能微差), totalInterest, totalPaid, schedule} */
function calcEqualInstallment(principalYuan, annualRate, years) {
var r = annualRate / 100 / 12;
var n = Math.round(years * 12);
var monthly = round2(principalYuan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
var schedule = [];
var remaining = principalYuan;
for (var i = 1; i <= n; i++) {
var interest = round2(remaining * r);
var principal, payment;
if (i === n) {
principal = round2(remaining);
payment = round2(principal + interest);
} else {
payment = monthly;
principal = round2(payment - interest);
}
remaining = round2(remaining - principal);
if (Math.abs(remaining) < 0.005) { remaining = 0;}
schedule.push({ no: i, payment: payment, principal: principal, interest: interest, remaining: remaining});
}
var totalPaid = round2(schedule.reduce(function (s, x) { return s + x.payment;}, 0));
return {
method: 'installment',
monthly: monthly,
totalInterest: round2(totalPaid - principalYuan),
totalPaid: totalPaid,
schedule: schedule
};
}

/* 等额本金：返回 {method:'principal', firstMonthly, lastMonthly, avgMonthly, totalInterest, totalPaid, schedule} */
function calcEqualPrincipal(principalYuan, annualRate, years) {
var r = annualRate / 100 / 12;
var n = Math.round(years * 12);
var monthlyPrincipal = principalYuan / n;
var schedule = [];
var remaining = principalYuan;
for (var i = 1; i <= n; i++) {
var interest = round2(remaining * r);
var principal = (i === n)? round2(remaining): round2(monthlyPrincipal);
var payment = round2(principal + interest);
remaining = round2(remaining - principal);
if (Math.abs(remaining) < 0.005) { remaining = 0;}
schedule.push({ no: i, payment: payment, principal: principal, interest: interest, remaining: remaining});
}
var totalPaid = round2(schedule.reduce(function (s, x) { return s + x.payment;}, 0));
return {
method: 'principal',
firstMonthly: schedule[0].payment,
lastMonthly: schedule[schedule.length - 1].payment,
avgMonthly: round2(totalPaid / n),
totalInterest: round2(totalPaid - principalYuan),
totalPaid: totalPaid,
schedule: schedule
};
}

/* 主计算：method 取 'installment' | 'principal'
* 返回 {selected, installment, principal, diffInterest, cheaper} */
function calcMortgage(principalYuan, annualRate, years, method) {
var installment = calcEqualInstallment(principalYuan, annualRate, years);
var principal = calcEqualPrincipal(principalYuan, annualRate, years);
var diff = round2(Math.abs(installment.totalInterest - principal.totalInterest));
return {
selected: method === 'principal'? principal: installment,
installment: installment,
principal: principal,
diffInterest: diff,
cheaper: installment.totalInterest <= principal.totalInterest? 'installment': 'principal'
};
}

/* ---------------- DOM 交互 ---------------- */
if (typeof document === 'undefined') {
if (typeof module!== 'undefined' && module.exports) {
module.exports = {
calcMortgage: calcMortgage,
calcEqualInstallment: calcEqualInstallment,
calcEqualPrincipal: calcEqualPrincipal
};
}
return;
}

var $ = function (id) { return document.getElementById(id);};

function fmtMoney(n) {
return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function fmtWan(n) {
var w = n / 10000;
return w.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' 万元';
}

function showError(msg) {
var el = $('mg-error');
el.textContent = msg;
el.style.display = 'block';
}

function clearError() {
var el = $('mg-error');
el.textContent = '';
el.style.display = 'none';
}

var lastResult = null; // {inputs, calc}
var lastText = ''; // 复制用的文本

var METHOD_LABEL = { installment: '等额本息', principal: '等额本金'};

function validate() {
clearError();
var loanWan = parseFloat(String($('mg-loan').value).trim());
var years = parseFloat(String($('mg-years').value).trim());
var rate = parseFloat(String($('mg-rate').value).trim());
var method = $('mg-method').value;

if (isNaN(loanWan) ||!isFinite(loanWan)) { showError('请输入贷款总额（数字，例如 200）。'); return null;}
if (loanWan <= 0) { showError('贷款总额须大于 0。'); return null;}
if (loanWan > 100000) { showError('贷款总额过大（上限 10 亿元），请检查输入。'); return null;}
if (isNaN(years) ||!isFinite(years)) { showError('请输入贷款年限（数字，例如 30）。'); return null;}
if (years < 1 || years > 30) { showError('贷款年限须在 1～30 年之间。'); return null;}
if (isNaN(rate) ||!isFinite(rate)) { showError('请输入年利率（数字，例如 3.55）。'); return null;}
if (rate <= 0) { showError('年利率须大于 0。'); return null;}
if (rate > 20) { showError('年利率超过 20%，请检查输入。'); return null;}
if (!METHOD_LABEL[method]) { showError('请选择还款方式。'); return null;}

return { principalYuan: round2(loanWan * 10000), loanWan: loanWan, years: years, rate: rate, method: method};
}

function renderKPIs(calc) {
var s = calc.selected;
var items = [];
if (s.method === 'installment') {
items.push({ k: '每月月供', v: fmtWan(s.monthly)});
} else {
items.push({ k: '首月月供', v: fmtWan(s.firstMonthly)});
items.push({ k: '末月月供', v: fmtWan(s.lastMonthly)});
items.push({ k: '月均月供', v: fmtWan(s.avgMonthly)});
}
items.push({ k: '总利息', v: fmtWan(s.totalInterest)});
items.push({ k: '还款总额', v: fmtWan(s.totalPaid), total: true});
items.push({
k: '两种方式利息差',
v: fmtWan(calc.diffInterest),
note: (calc.cheaper === 'principal'? '等额本金少付': '等额本息少付') + fmtWan(calc.diffInterest) + '利息'
});
$('mg-kpis').innerHTML = items.map(function (it) {
return '<div class="mg-kpi' + (it.total? ' total': '') + '"><div class="v">' + it.v + '</div><div class="k">' + it.k + '</div></div>';
}).join('');
}

function renderCompare(calc) {
var a = calc.installment, b = calc.principal;
var row = function (name, firstMonthly, totalInterest, totalPaid, highlight) {
return '<tr' + (highlight? ' class="total"': '') + '><td>' + name + '</td><td class="num">' +
fmtMoney(firstMonthly) + '</td><td class="num">' + fmtMoney(totalInterest) + '</td><td class="num">' +
fmtMoney(totalPaid) + '</td></tr>';
};
var html = row('等额本息', a.monthly, a.totalInterest, a.totalPaid, calc.cheaper === 'installment');
html += row('等额本金', b.firstMonthly, b.totalInterest, b.totalPaid, calc.cheaper === 'principal');
var diffLine = '利息差：' + fmtMoney(calc.diffInterest) + ' 元（' +
(calc.cheaper === 'principal'? '等额本金': '等额本息') + '总利息更低）';
$('mg-compare-rows').innerHTML = html;
$('mg-compare-note').textContent = diffLine;
}

function renderSchedule(calc) {
var s = calc.selected;
var html = s.schedule.map(function (x) {
return '<tr><td class="num">' + x.no + '</td><td class="num">' + fmtMoney(x.payment) + '</td><td class="num">' +
fmtMoney(x.principal) + '</td><td class="num">' + fmtMoney(x.interest) + '</td><td class="num">' +
fmtMoney(x.remaining) + '</td></tr>';
}).join('');
$('mg-schedule-rows').innerHTML = html;
$('mg-schedule-title').textContent = '还款明细表（' + METHOD_LABEL[s.method] + '，共 ' + s.schedule.length + ' 期）';
}

function buildCopyText(inputs, calc) {
var s = calc.selected;
var lines = [
'结果',
'贷款总额：' + inputs.loanWan + ' 万元（' + fmtMoney(inputs.principalYuan) + ' 元）',
'贷款年限：' + inputs.years + ' 年（' + Math.round(inputs.years * 12) + ' 期）',
'年利率：' + inputs.rate + '%',
'还款方式：' + METHOD_LABEL[s.method]
];
if (s.method === 'installment') {
lines.push('每月月供：' + fmtMoney(s.monthly) + ' 元');
} else {
lines.push('首月月供：' + fmtMoney(s.firstMonthly) + ' 元');
lines.push('末月月供：' + fmtMoney(s.lastMonthly) + ' 元');
lines.push('月均月供：' + fmtMoney(s.avgMonthly) + ' 元');
}
lines.push('总利息：' + fmtMoney(s.totalInterest) + ' 元（' + fmtWan(s.totalInterest) + '）');
lines.push('还款总额：' + fmtMoney(s.totalPaid) + ' 元（' + fmtWan(s.totalPaid) + '）');
lines.push('── 两种方式对比 ──');
lines.push('等额本息总利息：' + fmtMoney(calc.installment.totalInterest) + ' 元');
lines.push('等额本金总利息：' + fmtMoney(calc.principal.totalInterest) + ' 元');
lines.push('利息差：' + fmtMoney(calc.diffInterest) + ' 元（' +
(calc.cheaper === 'principal'? '等额本金': '等额本息') + '总利息更低）');
lines.push('⚠ 所有计算在浏览器本地完成；结果仅供参考，实际月供以银行合同为准。');
return lines.join('\n');
}

function runCalc() {
var inputs = validate();
if (!inputs) { return;}
var calc = calcMortgage(inputs.principalYuan, inputs.rate, inputs.years, inputs.method);
renderKPIs(calc);
renderCompare(calc);
renderSchedule(calc);
lastResult = { inputs: inputs, calc: calc};
lastText = buildCopyText(inputs, calc);
$('mg-result').style.display = 'block';
$('mg-copy').disabled = false;
$('mg-copy').innerHTML = '<i class="material-icons">content_copy</i> 复制结果';
}

function copyResult() {
if (!lastText) { return;}
var done = function () {
$('mg-copy').innerHTML = '<i class="material-icons">check</i> 已复制';
};
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(lastText).then(done, function () { fallbackCopy(done);});
} else {
fallbackCopy(done);
}
}

function fallbackCopy(done) {
var ta = document.createElement('textarea');
ta.value = lastText;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy');} catch (e) {}
document.body.removeChild(ta);
done();
}

function resetForm() {
$('mg-loan').value = '';
$('mg-years').value = '';
$('mg-rate').value = '';
$('mg-method').value = 'installment';
clearError();
$('mg-result').style.display = 'none';
$('mg-copy').disabled = true;
$('mg-copy').innerHTML = '<i class="material-icons">content_copy</i> 复制结果';
lastResult = null;
lastText = '';
}

document.addEventListener('DOMContentLoaded', function () {
$('mg-run').addEventListener('click', runCalc);
$('mg-copy').addEventListener('click', copyResult);
$('mg-reset').addEventListener('click', resetForm);
['mg-loan', 'mg-years', 'mg-rate'].forEach(function (id) {
var el = $(id);
el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { runCalc();}});
el.addEventListener('input', clearError);
});
$('mg-method').addEventListener('change', function () {
// 切换还款方式后，若已有计算结果则直接刷新
if (lastResult) {
var inputs = lastResult.inputs;
var calc = calcMortgage(inputs.principalYuan, inputs.rate, inputs.years, $('mg-method').value);
inputs.method = $('mg-method').value;
lastResult = { inputs: inputs, calc: calc};
lastText = buildCopyText(inputs, calc);
renderKPIs(calc);
renderCompare(calc);
renderSchedule(calc);
}
});
});
})();

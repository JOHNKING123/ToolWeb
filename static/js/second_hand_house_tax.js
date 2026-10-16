/* 二手房税费计算器 - 纯前端本地计算工具
*
* 规则：
* 契税（买方）：首套 ≤140㎡ 1% / >140㎡ 1.5%；
* 二套 ≤140㎡ 1% / >140㎡ 2%；
* 三套及以上 3%
* 个人所得税（卖方）：满五唯一免征，否则按成交价 1%
* 增值税（卖方）：满二免征（满五唯一自然满足满二），不满二按 5.6%
* 输出：契税 / 个税 / 增值税明细 + 税费总计 + 税负占比 + 一键复制结果。
* 全程不上传服务器，无新增后端接口。
* 纯逻辑函数无 DOM，可在 Node 下单测（module.exports 导出）。
*/
(function () {
'use strict';

/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

function round2(n) {
return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* 契税税率：count 取 'first' | 'second' | 'third'；140㎡ 为分界（含 140 按 ≤140 档） */
function deedTaxRate(count, area) {
var big = area > 140;
if (count === 'first') { return big? 0.015: 0.01;}
if (count === 'second') { return big? 0.02: 0.01;}
return 0.03; // 三套及以上
}

function deedTaxRuleText(count, area) {
var big = area > 140;
var names = { first: '首套', second: '二套', third: '三套及以上'};
var c = names[count] || '首套';
return c + (count === 'third'? '统一按 3%': (' ' + (big? '>140㎡': '≤140㎡') + ' 按 ' + (deedTaxRate(count, area) * 100) + '%'));
}

/* hold 取 'five_only' | 'two_notonly' | 'under_two' */
function incomeTaxRate(hold) { return hold === 'five_only'? 0: 0.01;}
function vatRate(hold) { return hold === 'under_two'? 0.056: 0;}

/* 主计算：priceYuan 为成交价（元），area 为建筑面积（㎡）
* 返回 {deedTax,deedRate,deedRule, incomeTax,incomeRate,incomeRule, vat,vatRate,vatRule, total, ratio} */
function calcTax(priceYuan, area, count, hold) {
var deedRate = deedTaxRate(count, area);
var deedTax = round2(priceYuan * deedRate);

var itRate = incomeTaxRate(hold);
var incomeTax = round2(priceYuan * itRate);

var vRate = vatRate(hold);
var vat = round2(priceYuan * vRate);

var total = round2(deedTax + incomeTax + vat);
var ratio = priceYuan > 0? round2((total / priceYuan) * 100): 0;

return {
deedTax: deedTax,
deedRate: deedRate,
deedRule: deedTaxRuleText(count, area),
incomeTax: incomeTax,
incomeRate: itRate,
incomeRule: hold === 'five_only'? '满五唯一免征': '按成交价 1%',
vat: vat,
vatRate: vRate,
vatRule: hold === 'under_two'? '不满二按 5.6%': '满二免征',
total: total,
ratio: ratio
};
}

/* ---------------- DOM 交互 ---------------- */
if (typeof document === 'undefined') {
if (typeof module!== 'undefined' && module.exports) {
module.exports = { calcTax: calcTax, deedTaxRate: deedTaxRate, incomeTaxRate: incomeTaxRate, vatRate: vatRate};
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
var el = $('tx-error');
el.textContent = msg;
el.style.display = 'block';
}

function clearError() {
var el = $('tx-error');
el.textContent = '';
el.style.display = 'none';
}

var lastResult = null; // {inputs, calc}
var lastText = ''; // 复制用的文本

var COUNT_LABEL = { first: '首套', second: '二套', third: '三套及以上'};
var HOLD_LABEL = { five_only: '满五唯一', two_notonly: '满二非唯一', under_two: '不满二'};

function validate() {
clearError();
var priceWan = parseFloat(String($('tx-price').value).trim());
var area = parseFloat(String($('tx-area').value).trim());
var count = $('tx-count').value;
var hold = $('tx-hold').value;

if (isNaN(priceWan) ||!isFinite(priceWan)) { showError('请输入成交价（数字，例如 320）。'); return null;}
if (priceWan <= 0) { showError('成交价须大于 0。'); return null;}
if (priceWan > 100000) { showError('成交价过大（上限 10 亿万元），请检查输入。'); return null;}
if (isNaN(area) ||!isFinite(area)) { showError('请输入建筑面积（数字，例如 120）。'); return null;}
if (area <= 0) { showError('建筑面积须大于 0。'); return null;}
if (area > 100000) { showError('建筑面积过大，请检查输入。'); return null;}
if (!COUNT_LABEL[count]) { showError('请选择购房套数。'); return null;}
if (!HOLD_LABEL[hold]) { showError('请选择持有情况。'); return null;}

return { priceYuan: round2(priceWan * 10000), priceWan: priceWan, area: area, count: count, hold: hold};
}

function renderKPIs(calc) {
var items = [
{ k: '契税', v: fmtWan(calc.deedTax)},
{ k: '个人所得税', v: fmtWan(calc.incomeTax)},
{ k: '增值税', v: fmtWan(calc.vat)},
{ k: '税负占比', v: calc.ratio + '%'},
{ k: '税费总计', v: fmtWan(calc.total), total: true}
];
$('tx-kpis').innerHTML = items.map(function (it) {
return '<div class="tx-kpi' + (it.total? ' total': '') + '"><div class="v">' + it.v + '</div><div class="k">' + it.k + '</div></div>';
}).join('');
}

function renderRows(inputs, calc) {
var priceStr = fmtMoney(inputs.priceYuan) + ' 元';
var row = function (name, base, rule, amount) {
return '<tr><td>' + name + '</td><td>' + base + '</td><td>' + rule + '</td><td class="num">' + fmtMoney(amount) + '</td></tr>';
};
var html = '';
html += row('契税（买方缴纳）', priceStr, calc.deedRule, calc.deedTax);
html += row('个人所得税（卖方缴纳）', priceStr, calc.incomeRule, calc.incomeTax);
html += row('增值税（卖方缴纳）', priceStr, calc.vatRule, calc.vat);
html += '<tr class="total"><td>税费总计</td><td colspan="2">税负占比 ' + calc.ratio + '%</td><td class="num">' + fmtMoney(calc.total) + '</td></tr>';
$('tx-rows').innerHTML = html;
}

function buildCopyText(inputs, calc) {
return '\n' +
'成交价：' + inputs.priceWan + ' 万元（' + fmtMoney(inputs.priceYuan) + ' 元）\n' +
'建筑面积：' + inputs.area + ' ㎡\n' +
'购房套数：' + COUNT_LABEL[inputs.count] + '\n' +
'持有情况：' + HOLD_LABEL[inputs.hold] + '\n' +
'契税：' + fmtMoney(calc.deedTax) + ' 元（' + calc.deedRule + '）\n' +
'个人所得税：' + fmtMoney(calc.incomeTax) + ' 元（' + calc.incomeRule + '）\n' +
'增值税：' + fmtMoney(calc.vat) + ' 元（' + calc.vatRule + '）\n' +
'税费总计：' + fmtMoney(calc.total) + ' 元（' + fmtWan(calc.total) + '）\n' +
'税负占比：' + calc.ratio + '%\n' +
'⚠ 本地计算、结果仅供参考，以税务机关核定为准。';
}

function runCalc() {
var inputs = validate();
if (!inputs) { return;}
var calc = calcTax(inputs.priceYuan, inputs.area, inputs.count, inputs.hold);
renderKPIs(calc);
renderRows(inputs, calc);
lastResult = { inputs: inputs, calc: calc};
lastText = buildCopyText(inputs, calc);
$('tx-result').style.display = 'block';
$('tx-copy').disabled = false;
$('tx-copy').innerHTML = '<i class="material-icons">content_copy</i> 复制结果';
}

function copyResult() {
if (!lastText) { return;}
var done = function () {
$('tx-copy').innerHTML = '<i class="material-icons">check</i> 已复制';
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
$('tx-price').value = '';
$('tx-area').value = '';
$('tx-count').value = 'first';
$('tx-hold').value = 'five_only';
clearError();
$('tx-result').style.display = 'none';
$('tx-copy').disabled = true;
$('tx-copy').innerHTML = '<i class="material-icons">content_copy</i> 复制结果';
lastResult = null;
lastText = '';
}

document.addEventListener('DOMContentLoaded', function () {
$('tx-run').addEventListener('click', runCalc);
$('tx-copy').addEventListener('click', copyResult);
$('tx-reset').addEventListener('click', resetForm);
[$('tx-price'), $('tx-area')].forEach(function (el) {
el.addEventListener('keydown', function (e) {
if (e.key === 'Enter') { runCalc();}
});
el.addEventListener('input', clearError);
});
});
})();

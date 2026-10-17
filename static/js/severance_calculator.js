/* 经济补偿金/赔偿金计算器（N/N+1/2N）- 纯前端本地计算工具
*
* 计算规则（按《劳动合同法》实现）：
* 1. 工龄折算 N（第 47 条）：按劳动者在本单位工作的年限，每满一年支付一个月工资；
* 六个月以上不满一年的，按一年计算；不满六个月的，支付半个月工资的经济补偿。
* 精确到日：剩余天数达到“周年日往后推 6 个日历月”→ 按 1 年；
* 剩余天数 >0 但不足 6 个月 → 按 0.5 年；恰为整年 → 年数。
* 2. 月工资 = 劳动合同解除或终止前十二个月的平均工资（含奖金、津贴、补贴、加班费等全部应得工资）。
* 3. 三档金额：经济补偿金 = N × 基数；代通知金 = 1 × 月均工资（仅第 40 条情形；按正常月工资计）；
* 违法解除赔偿金 = 2N × 基数。2N 情形不再叠加代通知金。
* 4. 封顶（第 47 条）：劳动者月工资高于本地区上年度职工月平均工资三倍的，
* 按本地区上年度职工月平均工资的三倍数额支付，向其支付经济补偿的年限最高不超过十二年。
* 封顶仅在月工资 > 社平×3 时触发；代通知金按正常月工资计，不适用封顶。
* 金额统一按元计算，展示保留两位小数。纯逻辑函数无 DOM，可在 Node 下单测（module.exports 导出）。
* 全程不上传服务器，无新增后端接口。
*/
(function () {
'use strict';

/* ---------------- 纯逻辑函数（无 DOM，可在 Node 下单测） ---------------- */

function round2(n) {
return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* yyyy-mm-dd → Date（本地午夜），非法返回 null */
function parseDate(str) {
if (!str || typeof str!== 'string') { return null;}
var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str.trim());
if (!m) { return null;}
var d = new Date(+m[1], +m[2] - 1, +m[3]);
if (d.getFullYear()!== +m[1] || d.getMonth()!== +m[2] - 1 || d.getDate()!== +m[3]) { return null;}
return d;
}

/* 解除情形元数据：适用类型 none(无补偿) / N / N+1 / 2N，及法条 */
var SCENARIOS = {
mutual: {
label: '协商一致解除（单位提出）',
desc: '用人单位提出，与劳动者协商一致解除劳动合同。注意：劳动者本人提出协商一致解除的，依法无经济补偿。',
law: '《劳动合同法》第 36 条、第 46 条第 2 款、第 47 条',
kind: 'N'
},
layoff: {
label: '裁员 / 客观情况重大变化',
desc: '用人单位经济性裁员，或劳动合同订立时所依据的客观情况发生重大变化致使合同无法履行。',
law: '《劳动合同法》第 41 条（经济性裁员）、第 40 条第 3 款（客观情况重大变化）、第 46 条第 4 款、第 47 条',
kind: 'N'
},
illegal: {
label: '单位违法解除（赔偿金 2N）',
desc: '用人单位违反法律规定解除或终止劳动合同。劳动者可要求继续履行合同，或要求用人单位支付赔偿金。',
law: '《劳动合同法》第 48 条、第 87 条、第 47 条',
kind: '2N'
},
expire: {
label: '合同到期，单位不续签',
desc: '劳动合同期满，用人单位不同意续订（除用人单位维持或提高约定条件续订、劳动者不同意续订的情形外）。',
law: '《劳动合同法》第 44 条第 1 款、第 46 条第 5 款、第 47 条',
kind: 'N'
},
resign: {
label: '员工主动辞职 / 过失性解除',
desc: '劳动者主动辞职，或用人单位依据第 39 条（严重违反规章制度等）过失性解除，依法无经济补偿。',
law: '《劳动合同法》第 39 条、第 46 条（列举的应当支付经济补偿情形不含本项）',
kind: 'none'
},
article40: {
label: '第 40 条无过失性解除（N+1）',
desc: '医疗期满不能从事原工作也不能从事另行安排的工作、不能胜任工作、客观情况重大变化；需提前 30 日书面通知或额外支付 1 个月工资（代通知金）。',
law: '《劳动合同法》第 40 条、第 46 条第 3 款、第 47 条',
kind: 'N+1'
}
};

/* 工龄折算 N（第 47 条）。返回 {ok, n, fullYears, remMonths, remDays, rule, breakdown, error} */
function calcTenure(startStr, endStr) {
var s = parseDate(startStr), e = parseDate(endStr);
if (!s ||!e) { return { ok: false, error: '请填写有效的入职日期与离职/解除日期。'};}
if (e < s) { return { ok: false, error: '离职/解除日期不能早于入职日期，请检查后重新填写。'};}
var years = e.getFullYear() - s.getFullYear();
var anniv = new Date(s.getFullYear(), s.getMonth(), s.getDate());
anniv.setFullYear(s.getFullYear() + years);
if (anniv > e) {
years--;
anniv = new Date(s.getFullYear(), s.getMonth(), s.getDate());
anniv.setFullYear(s.getFullYear() + years);
}
var remDays = Math.round((e - anniv) / 86400000);
/* 满 6 个月的判定：周年日往后推 6 个日历月 */
var six = new Date(anniv.getFullYear(), anniv.getMonth(), anniv.getDate());
six.setMonth(six.getMonth() + 6);
var n, rule;
if (remDays === 0) {
n = years;
rule = '恰为整年，按实际年数计算（第 47 条：每满一年支付一个月工资）';
} else if (e >= six) {
n = years + 1;
rule = '剩余部分已满 6 个月（六个月以上不满一年），按一年计算（第 47 条）';
} else {
n = years + 0.5;
rule = '剩余部分不满 6 个月，按半个月工资计算（第 47 条）';
}
/* 展示用：X 年 X 个月 X 天 */
var months = e.getMonth() - anniv.getMonth();
var afterMonths = new Date(anniv.getFullYear(), anniv.getMonth(), anniv.getDate());
if (e.getDate() < anniv.getDate()) { months--;}
if (months < 0) { months += 12;}
afterMonths.setMonth(afterMonths.getMonth() + months);
var days = Math.round((e - afterMonths) / 86400000);
var breakdown = years + ' 年 ' + months + ' 个月 ' + days + ' 天';
return { ok: true, n: n, fullYears: years, remMonths: months, remDays: days, rule: rule, breakdown: breakdown};
}

/* 封顶规则引擎（第 47 条）。返回 {capped, triple, baseCapped, nCapped, yearCapped, note} */
function applyCap(wage, avgWage, n) {
if (!(avgWage > 0)) {
return { capped: false, checked: false, note: '未填写当地上年度职工月平均工资，未做三倍封顶校验。'};
}
var triple = round2(avgWage * 3);
if (wage > triple) {
return {
capped: true,
checked: true,
triple: triple,
baseCapped: triple,
nCapped: Math.min(n, 12),
yearCapped: n > 12,
note: '月工资高于当地社平工资三倍，按社平工资三倍数额支付；支付经济补偿的年限最高不超过十二年（第 47 条）。'
};
}
return { capped: false, checked: true, triple: triple, note: '月工资未超过当地社平工资三倍，不触发封顶。'};
}

/* 主计算。opts: {start, end, wage, avgWage, scenario} */
function calcSeverance(opts) {
if (!SCENARIOS[opts.scenario]) { return { ok: false, error: '请选择解除情形。'};}
var tenure = calcTenure(opts.start, opts.end);
if (!tenure.ok) { return tenure;}
if (!(opts.wage > 0)) { return { ok: false, error: '请填写前 12 个月平均工资（须大于 0 元）。'};}
var avgWage = opts.avgWage;
if (avgWage === '' || avgWage === null || avgWage === undefined) { avgWage = 0; }
avgWage = +avgWage;
if (isNaN(avgWage) || avgWage < 0) { return { ok: false, error: '当地上年度职工月平均工资须为非负数；留空则不做封顶校验。'};}
var cap = applyCap(opts.wage, avgWage, tenure.n);
var base = cap.capped? cap.baseCapped: opts.wage; /* 经济补偿/赔偿金基数 */
var nUsed = cap.capped? cap.nCapped: tenure.n; /* 封顶后年限 */
var nPay = round2(base * nUsed); /* 经济补偿金 N */
var noticePay = round2(opts.wage * 1); /* 代通知金：按正常月工资计，不封顶 */
var comp2n = round2(base * nUsed * 2); /* 违法解除赔偿金 2N */
var sc = SCENARIOS[opts.scenario];
return {
ok: true,
scenario: opts.scenario,
scMeta: sc,
tenure: tenure,
cap: cap,
wage: opts.wage,
base: base,
nUsed: nUsed,
nPay: nPay,
noticePay: noticePay,
comp2n: comp2n
};
}

/* 金额展示：整数不带小数 */
function fmt(n) {
var r = round2(n);
return r.toLocaleString('zh-CN', { minimumFractionDigits: (r % 1 === 0? 0: 2), maximumFractionDigits: 2});
}

/* 复制文本：三档金额 + 工龄折算 + 封顶 + 法条 + 免责 */
function buildCopyText(r, start, end) {
var L = [];
L.push('经济补偿金/赔偿金计算结果');
L.push('入职日期：' + start + '　离职/解除日期：' + end);
L.push('解除情形：' + r.scMeta.label);
L.push('前 12 个月平均工资（含奖金/津贴/加班费等）：' + fmt(r.wage) + ' 元');
L.push('工龄折算：在职 ' + r.tenure.breakdown + ' → N = ' + r.tenure.n + ' 个月工资');
L.push('　折算依据：' + r.tenure.rule);
L.push('');
if (r.scenario === 'resign') {
L.push('★ 本情形依法无经济补偿/赔偿金/代通知金。');
L.push('　说明：' + r.scMeta.desc);
} else {
L.push('① 经济补偿金（N）= ' + r.tenure.n + ' 个月 × 基数 ' + fmt(r.base) + ' 元 = ' + fmt(r.nPay) + ' 元');
L.push('　' + (r.scenario === 'illegal'? '（本情形请直接看③赔偿金 2N，不叠加适用）': '法条：' + r.scMeta.law));
if (r.scenario === 'article40') {
L.push('② 代通知金（+1）= 1 个月 × 月均工资 ' + fmt(r.wage) + ' 元 = ' + fmt(r.noticePay) + ' 元（仅第 40 条情形适用：未提前 30 日书面通知时额外支付）');
L.push('★ 本情形合计应得（N+1）：' + fmt(r.nPay) + ' + ' + fmt(r.noticePay) + ' = ' + fmt(round2(r.nPay + r.noticePay)) + ' 元');
} else {
L.push('② 代通知金（+1）：不适用（仅《劳动合同法》第 40 条无过失性解除情形可用）');
}
L.push('③ 违法解除赔偿金（2N）= 2 × ' + fmt(r.nPay) + ' = ' + fmt(r.comp2n) + ' 元');
L.push('　（赔偿金 2N 不再叠加代通知金；法条：《劳动合同法》第 48 条、第 87 条、第 47 条）');
}
if (r.cap.capped) {
L.push('');
L.push('封顶说明：' + r.cap.note);
L.push('封顶前基数：' + fmt(r.wage) + ' 元 → 封顶后基数：' + fmt(r.cap.baseCapped) + ' 元（社平×3 = ' + fmt(r.cap.triple) + ' 元）');
if (r.cap.yearCapped) { L.push('年限封顶：工龄折算 N = ' + r.tenure.n + ' → 按 12 年封顶计算');}
}
L.push('');
L.push('法条依据：' + r.scMeta.law);
L.push('免责声明：计算结果仅供参考，不构成法律意见；月工资口径、工龄起算、封顶适用等具体以劳动仲裁/法院认定为准。');
L.push('—— 由经济补偿金/赔偿金计算器（纯前端本地计算，数据不出浏览器）生成');
return L.join('\n');
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = {
round2: round2,
parseDate: parseDate,
SCENARIOS: SCENARIOS,
calcTenure: calcTenure,
applyCap: applyCap,
calcSeverance: calcSeverance,
fmt: fmt
};
}

/* ---------------- DOM 交互 ---------------- */

/* Node 单测环境无 document，直接结束 IIFE */
if (typeof document === 'undefined') { return; }

function $(id) { return document.getElementById(id);}

function showError(msg) {
var el = $('sev-error');
el.textContent = msg;
el.style.display = 'block';
el.scrollIntoView({ behavior: 'smooth', block: 'nearest'});
}

function clearError() {
$('sev-error').style.display = 'none';
}

function getScenario() {
var radios = document.getElementsByName('sev-sc');
for (var i = 0; i < radios.length; i++) {
if (radios[i].checked) { return radios[i].value;}
}
return '';
}

function cardHtml(kind, r) {
var sc = r.scenario, meta = r.scMeta;
if (kind === 'N') {
if (sc === 'resign') {
return '<div class="sev-card sev-card-na"><div class="sev-card-k">① 经济补偿金 N</div>' +
'<div class="sev-card-v">无</div><div class="sev-card-note">' + meta.desc + '</div></div>';
}
var hot = (sc === 'mutual' || sc === 'layoff' || sc === 'expire' || sc === 'article40');
var badge = hot? '<span class="sev-badge-hot">最可能适用</span>': '';
var ref = (sc === 'illegal')? '<div class="sev-card-note">参考值：违法解除请直接看③赔偿金 2N</div>': '';
return '<div class="sev-card' + (hot? ' sev-card-hot': '') + '"><div class="sev-card-k">① 经济补偿金 N ' + badge + '</div>' +
'<div class="sev-card-v">' + fmt(r.nPay) + ' <span>元</span></div>' +
'<div class="sev-card-note">N = ' + r.tenure.n + ' 个月 × 基数 ' + fmt(r.base) + ' 元' + (r.cap.capped? '（封顶后基数）': '') + '</div>' + ref + '</div>';
}
if (kind === 'notice') {
if (sc === 'article40') {
return '<div class="sev-card sev-card-hot"><div class="sev-card-k">② 代通知金 +1 <span class="sev-badge-hot">最可能适用</span></div>' +
'<div class="sev-card-v">' + fmt(r.noticePay) + ' <span>元</span></div>' +
'<div class="sev-card-note">1 个月 × 月均工资 ' + fmt(r.wage) + ' 元（按正常月工资计，不封顶）<br>适用条件：未提前 30 日书面通知时额外支付（第 40 条）</div></div>';
}
var reason = (sc === 'resign')? '本情形依法无补偿': '仅第 40 条无过失性解除情形可用';
return '<div class="sev-card sev-card-na"><div class="sev-card-k">② 代通知金 +1</div>' +
'<div class="sev-card-v">不适用</div><div class="sev-card-note">' + reason + '</div></div>';
}
if (kind === '2N') {
if (sc === 'resign') {
return '<div class="sev-card sev-card-na"><div class="sev-card-k">③ 违法解除赔偿金 2N</div>' +
'<div class="sev-card-v">无</div><div class="sev-card-note">本情形依法无补偿</div></div>';
}
var hot2 = (sc === 'illegal');
return '<div class="sev-card' + (hot2? ' sev-card-hot': '') + '"><div class="sev-card-k">③ 违法解除赔偿金 2N' + (hot2? ' <span class="sev-badge-hot">最可能适用</span>': '') + '</div>' +
'<div class="sev-card-v">' + fmt(r.comp2n) + ' <span>元</span></div>' +
'<div class="sev-card-note">2 × 经济补偿金 ' + fmt(r.nPay) + ' 元<br>' + (hot2? '赔偿金 2N 不再叠加代通知金（第 87 条）': '参考值：仅单位违法解除时适用') + '</div></div>';
}
return '';
}

function renderResult(r) {
var box = $('sev-result');
box.style.display = 'block';
/* 工龄折算 */
$('sev-tenure').innerHTML =
'<div class="sev-tenure-n">N = <b>' + r.tenure.n + '</b> 个月工资</div>' +
'<div class="sev-tenure-d">在职时长：' + r.tenure.breakdown + '（' + document._sevStart + ' → ' + document._sevEnd + '）<br>' + r.tenure.rule + '</div>';
/* 三档卡片 */
$('sev-cards').innerHTML = cardHtml('N', r) + cardHtml('notice', r) + cardHtml('2N', r);
/* 封顶 */
var capBox = $('sev-cap');
if (r.cap.capped) {
capBox.style.display = 'block';
capBox.className = 'sev-cap';
capBox.innerHTML = '<div class="sev-cap-title"><i class="material-icons">warning</i> 已触发三倍社平 / 12 年封顶（第 47 条）</div>' +
'<div class="sev-cap-body">基数：' + fmt(r.wage) + ' 元 → <b>' + fmt(r.cap.baseCapped) + ' 元</b>（当地社平×3 = ' + fmt(r.cap.triple) + ' 元）' +
(r.cap.yearCapped? '<br>年限：N = ' + r.tenure.n + ' → 按 <b>12 年</b>封顶计算': '<br>年限：N = ' + r.tenure.n + '（未达 12 年上限）') + '</div>';
} else {
capBox.style.display = 'block';
capBox.className = 'sev-cap sev-cap-ok';
capBox.innerHTML = '<div class="sev-cap-body">' + r.cap.note + '</div>';
}
/* 法条 */
$('sev-law').innerHTML = '<b>解除情形：</b>' + r.scMeta.label + '<br><b>法条依据：</b>' + r.scMeta.law + '<br><b>情形说明：</b>' + r.scMeta.desc;
$('sev-copy').disabled = false;
box.scrollIntoView({ behavior: 'smooth', block: 'start'});
}

function run() {
clearError();
var start = $('sev-start').value, end = $('sev-end').value;
var wage = parseFloat($('sev-wage').value);
var avgRaw = $('sev-avg').value.trim();
var avgWage = avgRaw === ''? 0: parseFloat(avgRaw);
var scenario = getScenario();
if (!start ||!end) { showError('请填写入职日期与离职/解除日期。'); return;}
if (!(wage > 0)) { showError('请填写前 12 个月平均工资（须大于 0 元）。'); return;}
if (!scenario) { showError('请选择一种解除情形。'); return;}
var r = calcSeverance({ start: start, end: end, wage: wage, avgWage: avgWage, scenario: scenario});
if (!r.ok) { showError(r.error); return;}
document._sevStart = start;
document._sevEnd = end;
document._sevResult = r;
renderResult(r);
}

function fillSample() {
clearError();
$('sev-start').value = '2023-03-01';
$('sev-end').value = '2026-10-17';
$('sev-wage').value = '12000';
$('sev-avg').value = '';
var radios = document.getElementsByName('sev-sc');
for (var i = 0; i < radios.length; i++) {
radios[i].checked = (radios[i].value === 'mutual');
radios[i].closest('.sev-sc-card').classList.toggle('active', radios[i].value === 'mutual');
}
run();
}

function resetAll() {
clearError();
$('sev-start').value = '';
$('sev-end').value = '';
$('sev-wage').value = '';
$('sev-avg').value = '';
var radios = document.getElementsByName('sev-sc');
for (var i = 0; i < radios.length; i++) {
radios[i].checked = false;
radios[i].closest('.sev-sc-card').classList.remove('active');
}
$('sev-result').style.display = 'none';
var cb = $('sev-cap');
cb.className = 'sev-cap';
cb.innerHTML = '';
$('sev-copy').disabled = true;
document._sevResult = null;
}

function copyText(text, okMsg) {
function done() {
var tip = $('sev-copytip');
tip.textContent = okMsg || '已复制到剪贴板。';
tip.style.display = 'block';
setTimeout(function () { tip.style.display = 'none';}, 2000);
}
function fallbackCopy(t) {
var ta = document.createElement('textarea');
ta.value = t;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy');} catch (e) {}
document.body.removeChild(ta);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done();});
} else {
fallbackCopy(text); done();
}
}

function copyResult() {
if (!document._sevResult) { return;}
copyText(buildCopyText(document._sevResult, document._sevStart, document._sevEnd), '结果已复制：含三档金额、工龄折算、封顶说明、法条与免责声明。');
}

document.addEventListener('DOMContentLoaded', function () {
var end = $('sev-end');
if (!end.value) {
var t = new Date();
end.value = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
$('sev-run').addEventListener('click', run);
$('sev-sample').addEventListener('click', fillSample);
$('sev-reset').addEventListener('click', resetAll);
$('sev-copy').addEventListener('click', copyResult);
/* 解除情形卡片选中态 */
var cards = document.querySelectorAll('.sev-sc-card');
cards.forEach(function (card) {
card.addEventListener('click', function () {
var radio = card.querySelector('input[type=radio]');
radio.checked = true;
cards.forEach(function (c) { c.classList.remove('active');});
card.classList.add('active');
});
});
});

})();

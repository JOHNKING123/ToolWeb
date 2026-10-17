/* AA制费用分摊计算器：纯前端本地计算 + localStorage 持久化 */
(function () {
'use strict';

/*PURE-START*/
// ---- 纯算法部分（金额一律以"分"为整数运算，无浮点误差） ----

// 单笔支出在参与人之间分摊：parts=[id]，shares=null 表示均摊，否则 {id:份额}
function splitExpenseCents(amountCents, parts, shares) {
var owed = {};
parts.forEach(function (id) { owed[id] = 0;});
if (parts.length === 0 || amountCents <= 0) return owed;
var base, rem, i, alloc, total;
if (!shares) {
base = Math.floor(amountCents / parts.length);
rem = amountCents - base * parts.length;
for (i = 0; i < parts.length; i++) owed[parts[i]] = base + (rem-- > 0? 1: 0);
return owed;
}
total = parts.reduce(function (s, id) { return s + Math.max(0, shares[id] || 0);}, 0);
if (total <= 0) { // 份额全 0 则退化为均摊
base = Math.floor(amountCents / parts.length);
rem = amountCents - base * parts.length;
for (i = 0; i < parts.length; i++) owed[parts[i]] = base + (rem-- > 0? 1: 0);
return owed;
}
alloc = parts.map(function (id) {
var sh = Math.max(0, shares[id] || 0);
var raw = amountCents * sh / total;
var fl = Math.floor(raw);
return { id: id, fl: fl, frac: raw - fl};
});
rem = amountCents - alloc.reduce(function (s, a) { return s + a.fl;}, 0);
alloc.sort(function (a, b) { return b.frac - a.frac;}); // 最大余数法补零头
alloc.forEach(function (a) { owed[a.id] = a.fl + (rem-- > 0? 1: 0);});
return owed;
}

// 全局服务费按权重（各人应分摊金额）比例分摊
function splitProportionalCents(amountCents, weights) {
var ids = Object.keys(weights);
var owed = {};
ids.forEach(function (id) { owed[id] = 0;});
var total = ids.reduce(function (s, id) { return s + Math.max(0, weights[id] || 0);}, 0);
if (ids.length === 0 || amountCents <= 0 || total <= 0) return owed;
var alloc = ids.map(function (id) {
var w = Math.max(0, weights[id] || 0);
var raw = amountCents * w / total;
var fl = Math.floor(raw);
return { id: id, fl: fl, frac: raw - fl};
});
var rem = amountCents - alloc.reduce(function (s, a) { return s + a.fl;}, 0);
alloc.sort(function (a, b) { return b.frac - a.frac;});
alloc.forEach(function (a) { owed[a.id] = a.fl + (rem-- > 0? 1: 0);});
return owed;
}

// 净余额：net = 实付 - 应分摊 - 服务费分摊
function calcBalances(people, expenses, serviceFeeCents, feePayerId) {
var owed = {}, paid = {}, feeShare = {};
people.forEach(function (p) { owed[p.id] = 0; paid[p.id] = 0; feeShare[p.id] = 0;});
function valid(id) { return people.some(function (x) { return x.id === id;});}
expenses.forEach(function (e) {
var parts = (e.participants || []).filter(valid);
var amt = Math.max(0, Math.round(e.amountCents || 0));
var per = splitExpenseCents(amt, parts, e.mode === 'itemized'? e.shares: null);
parts.forEach(function (id) { owed[id] += per[id];});
if (valid(e.payerId)) paid[e.payerId] += amt;
});
if (serviceFeeCents > 0) {
var fs = splitProportionalCents(serviceFeeCents, owed);
Object.keys(fs).forEach(function (id) { feeShare[id] = fs[id];});
// 服务费视为由垫付人先行垫付，保证全员净额总和为 0、内部转账可完全结清
var fp = (feePayerId && valid(feePayerId)) ? feePayerId : (people[0] && people[0].id);
if (fp) paid[fp] += serviceFeeCents;
}
var net = {};
people.forEach(function (p) { net[p.id] = paid[p.id] - owed[p.id] - feeShare[p.id];});
return { owed: owed, paid: paid, feeShare: feeShare, net: net};
}

// 标准贪心最少转账结算：每次取欠款最多者 -> 应收最多者，转两者较小值
function minimalSettlement(net) {
var cred = [], debt = [];
Object.keys(net).forEach(function (id) {
if (net[id] > 0) cred.push({ id: id, amt: net[id]});
else if (net[id] < 0) debt.push({ id: id, amt: -net[id]});
});
cred.sort(function (a, b) { return b.amt - a.amt;});
debt.sort(function (a, b) { return b.amt - a.amt;});
var ts = [], i = 0, j = 0;
while (i < cred.length && j < debt.length) {
var c = cred[i], d = debt[j];
var t = Math.min(c.amt, d.amt);
ts.push({ from: d.id, to: c.id, amt: t});
c.amt -= t; d.amt -= t;
if (c.amt === 0) i++;
if (d.amt === 0) j++;
}
return ts;
}

function fmtYuan(cents) { return '¥' + (cents / 100).toFixed(2);}
/*PURE-END*/

// ---- 状态与持久化 ----
var LS_KEY = 'aa_bill_splitter_v1';
var state = { people: [], expenses: [], serviceFeeCents: 0, feePayerId: '', seq: 1};

function nid(prefix) { return prefix + (state.seq++) + '_' + Date.now().toString(36);}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state));} catch (e) {}}
function load() {
try {
var raw = localStorage.getItem(LS_KEY);
if (!raw) return;
var s = JSON.parse(raw);
if (s && Array.isArray(s.people) && Array.isArray(s.expenses)) {
state = { people: s.people, expenses: s.expenses, serviceFeeCents: s.serviceFeeCents || 0, feePayerId: s.feePayerId || '', seq: s.seq || 1};
}
} catch (e) {}
}
function nameOf(id) {
var p = state.people.filter(function (x) { return x.id === id;})[0];
return p? p.name: '（已删除）';
}
function esc(s) {
return String(s == null? '': s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function toast(msg) {
var el = document.getElementById('aa-toast');
el.textContent = msg;
el.classList.add('show');
clearTimeout(el._t);
el._t = setTimeout(function () { el.classList.remove('show');}, 2200);
}
function showError(msg) {
var el = document.getElementById('aa-error');
if (!msg) { el.style.display = 'none'; el.textContent = ''; return;}
el.style.display = 'block';
el.textContent = msg;
clearTimeout(el._t);
el._t = setTimeout(function () { el.style.display = 'none';}, 4000);
}

// ---- 参与人 ----
function renderPeople() {
var wrap = document.getElementById('aa-people');
document.getElementById('aa-people-count').textContent = state.people.length;
if (state.people.length === 0) {
wrap.innerHTML = '<div class="aa-empty" style="padding:.4rem 0">还没有参与人，先添加或载入示例数据</div>';
} else {
wrap.innerHTML = state.people.map(function (p) {
return '<span class="aa-chip">' + esc(p.name) +
'<button type="button" data-del-person="' + p.id + '" title="删除">×</button></span>';
}).join('');
}
// 同步付款人下拉
var sel = document.getElementById('aa-exp-payer');
var cur = sel.value;
sel.innerHTML = state.people.map(function (p) {
return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
}).join('');
if (state.people.some(function (p) { return p.id === cur;})) sel.value = cur;
// 同步服务费垫付人下拉
var fsel = document.getElementById('aa-fee-payer');
var fcur = state.feePayerId || (state.people[0] && state.people[0].id) || '';
fsel.innerHTML = state.people.map(function (p) {
return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
}).join('');
if (state.people.some(function (p) { return p.id === fcur;})) fsel.value = fcur;
if (!state.feePayerId && fsel.value) state.feePayerId = fsel.value;
// 同步参与人勾选
renderParts();
}
function addPerson(name) {
name = (name || '').trim();
if (!name) { showError('请输入参与人名字'); return false;}
if (state.people.some(function (p) { return p.name === name;})) { showError('已存在同名参与人'); return false;}
state.people.push({ id: nid('p'), name: name});
save(); renderPeople(); renderAll();
return true;
}
function delPerson(id) {
state.people = state.people.filter(function (p) { return p.id!== id;});
if (state.feePayerId === id) state.feePayerId = '';
state.expenses.forEach(function (e) {
e.participants = (e.participants || []).filter(function (pid) { return pid!== id;});
if (e.shares) delete e.shares[id];
if (e.payerId === id) e.payerId = state.people.length? state.people[0].id: '';
});
// 没有参与人的支出直接移除
state.expenses = state.expenses.filter(function (e) { return (e.participants || []).length > 0;});
save(); renderPeople(); renderExpenses(); renderAll();
}

// ---- 支出录入表单 ----
var formParts = []; // 当前表单勾选的参与人 id
function renderParts() {
formParts = formParts.filter(function (id) { return state.people.some(function (p) { return p.id === id;});});
if (formParts.length === 0 && state.people.length) formParts = state.people.map(function (p) { return p.id;});
var wrap = document.getElementById('aa-exp-parts');
wrap.innerHTML = state.people.map(function (p) {
var on = formParts.indexOf(p.id) >= 0;
return '<label class="aa-check' + (on? ' on': '') + '"><input type="checkbox" data-part="' + p.id + '"' +
(on? ' checked': '') + '> ' + esc(p.name) + '</label>';
}).join('') || '<div class="aa-empty" style="padding:.2rem 0">先添加参与人</div>';
renderShares();
}
function curMode() {
var r = document.querySelector('input[name="aa-mode"]:checked');
return r? r.value: 'equal';
}
function renderShares() {
var box = document.getElementById('aa-exp-shares');
if (curMode()!== 'itemized') { box.style.display = 'none'; box.innerHTML = ''; return;}
box.style.display = 'flex';
box.innerHTML = formParts.map(function (id) {
return '<label class="aa-check">' + esc(nameOf(id)) +
' <input class="aa-share-inp" type="number" min="0" step="0.5" value="1" data-share="' + id + '"></label>';
}).join('');
}
function addExpense() {
showError('');
var title = document.getElementById('aa-exp-title').value.trim();
var payerId = document.getElementById('aa-exp-payer').value;
var amountYuan = parseFloat(document.getElementById('aa-exp-amount').value);
if (state.people.length < 1) { showError('请先添加参与人'); return;}
if (!payerId) { showError('请选择付款人'); return;}
if (!(amountYuan > 0)) { showError('请输入有效的支出金额（大于 0）'); return;}
if (formParts.length === 0) { showError('请至少勾选一位参与分摊人'); return;}
var mode = curMode(), shares = null;
if (mode === 'itemized') {
shares = {};
document.querySelectorAll('#aa-exp-shares [data-share]').forEach(function (inp) {
var v = parseFloat(inp.value);
shares[inp.getAttribute('data-share')] = (v > 0? v: 0);
});
var total = Object.keys(shares).reduce(function (s, k) { return s + shares[k];}, 0);
if (total <= 0) { showError('按份分摊时份额总和须大于 0'); return;}
}
state.expenses.push({
id: nid('e'),
title: title || '未命名支出',
payerId: payerId,
amountCents: Math.round(amountYuan * 100),
participants: formParts.slice(),
mode: mode,
shares: shares
});
document.getElementById('aa-exp-title').value = '';
document.getElementById('aa-exp-amount').value = '';
save(); renderExpenses(); renderAll();
toast('已添加支出');
}
function delExpense(id) {
state.expenses = state.expenses.filter(function (e) { return e.id!== id;});
save(); renderExpenses(); renderAll();
}
function renderExpenses() {
var wrap = document.getElementById('aa-expenses');
document.getElementById('aa-exp-count').textContent = state.expenses.length;
if (!state.expenses.length) {
wrap.innerHTML = '<div class="aa-empty">还没有支出，点击上方「添加这笔支出」开始记账</div>';
return;
}
wrap.innerHTML = state.expenses.map(function (e, idx) {
var modeTxt = e.mode === 'itemized'
? '按份分摊（' + e.participants.map(function (id) {
return esc(nameOf(id)) + '×' + (e.shares && e.shares[id]!= null? e.shares[id]: 1);
}).join('、') + '）'
: '均摊';
return '<div class="aa-exp"><div class="aa-exp-head">' +
'<span class="aa-exp-title">' + (idx + 1) + '. ' + esc(e.title) + '</span>' +
'<button type="button" class="aa-del" data-del-exp="' + e.id + '">删除</button></div>' +
'<div class="aa-exp-meta"><b>' + esc(nameOf(e.payerId)) + '</b> 付款 <b>' + fmtYuan(e.amountCents) + '</b><br>' +
modeTxt + ' · 参与人：' + e.participants.map(function (id) { return esc(nameOf(id));}).join('、') +
'</div></div>';
}).join('');
}

// ---- 结算渲染 ----
function renderAll() {
var res = calcBalances(state.people, state.expenses, state.serviceFeeCents, state.feePayerId);
var totalPaid = state.expenses.reduce(function (s, e) { return s + Math.max(0, Math.round(e.amountCents || 0));}, 0);
var totalAll = totalPaid + state.serviceFeeCents;
var transfers = minimalSettlement(res.net);
var name = nameOf;

// KPI
document.getElementById('aa-kpis').innerHTML =
kpi(fmtYuan(totalAll), '总支出' + (state.serviceFeeCents > 0? '（含服务费' + fmtYuan(state.serviceFeeCents) + '）': '')) +
kpi(state.expenses.length + ' 笔', '支出笔数') +
kpi(transfers.length + ' 笔', '需转账笔数');
function kpi(v, k) {
return '<div class="aa-kpi"><div class="v">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>';
}

// 净额一览（红绿）
var netBox = document.getElementById('aa-net');
if (!state.people.length) {
netBox.innerHTML = '<div class="aa-empty">暂无数据</div>';
} else {
netBox.innerHTML = state.people.map(function (p) {
var n = res.net[p.id] || 0;
var cls = n > 0? 'pos': (n < 0? 'neg': 'zero');
var txt = n > 0? '应收 ' + fmtYuan(n): (n < 0? '应付 ' + fmtYuan(-n): '已扯平');
return '<div class="aa-net-item ' + cls + '"><div class="n">' + esc(p.name) + '</div><div class="a">' + txt + '</div></div>';
}).join('');
}

// 转账方案
var tBox = document.getElementById('aa-transfers');
document.getElementById('aa-transfer-count').textContent = transfers.length? '（共 ' + transfers.length + ' 笔）': '';
if (!transfers.length) {
tBox.innerHTML = '<div class="aa-empty">' + (state.people.length? '无需转账，大家已扯平 🎉': '暂无数据') + '</div>';
} else {
tBox.innerHTML = transfers.map(function (t, i) {
return '<div class="aa-transfer"><span class="idx">' + (i + 1) + '</span>' +
'<span>' + esc(name(t.from)) + ' <i class="material-icons" style="vertical-align:-4px;font-size:1.1rem">arrow_forward</i> ' + esc(name(t.to)) + '</span>' +
'<span class="amt">' + fmtYuan(t.amt) + '</span></div>';
}).join('');
}

// 支出明细回看
var dBox = document.getElementById('aa-detail');
if (!state.expenses.length) {
dBox.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af">暂无支出</td></tr>';
} else {
dBox.innerHTML = state.expenses.map(function (e) {
return '<tr><td>' + esc(e.title) + '</td><td>' + esc(name(e.payerId)) + '</td>' +
'<td class="num">' + fmtYuan(e.amountCents) + '</td>' +
'<td>' + (e.mode === 'itemized'? '按份': '均摊') + '</td>' +
'<td>' + e.participants.map(function (id) { return esc(name(id));}).join('、') + '</td></tr>';
}).join('');
}
}

// ---- 复制结算文本 ----
function buildCopyText() {
var res = calcBalances(state.people, state.expenses, state.serviceFeeCents, state.feePayerId);
var transfers = minimalSettlement(res.net);
var totalPaid = state.expenses.reduce(function (s, e) { return s + Math.max(0, Math.round(e.amountCents || 0));}, 0);
var lines = [];
lines.push('');
lines.push('参与人：' + state.people.map(function (p) { return p.name;}).join('、'));
lines.push('支出 ' + state.expenses.length + ' 笔，合计 ' + fmtYuan(totalPaid + state.serviceFeeCents) +
(state.serviceFeeCents > 0? '（含服务费 ' + fmtYuan(state.serviceFeeCents) + '）': ''));
lines.push('净额：' + state.people.map(function (p) {
var n = res.net[p.id] || 0;
return p.name + (n > 0? ' 应收 ' + fmtYuan(n): (n < 0? ' 应付 ' + fmtYuan(-n): ' 已扯平'));
}).join('；'));
if (transfers.length) {
lines.push('转账方案（' + transfers.length + ' 笔）：');
transfers.forEach(function (t, i) {
lines.push((i + 1) + '. ' + nameOf(t.from) + ' → ' + nameOf(t.to) + '：' + fmtYuan(t.amt));
});
} else {
lines.push('无需转账，大家已扯平 🎉');
}
return lines.join('\n');
}
function copyResult() {
if (!state.people.length ||!state.expenses.length) { showError('还没有可复制的结算数据'); return;}
var txt = buildCopyText();
function done() { toast('结算文本已复制，去群里粘贴吧');}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done);});
} else fallbackCopy(txt, done);
}
function fallbackCopy(txt, done) {
var ta = document.createElement('textarea');
ta.value = txt;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done();} catch (e) { showError('复制失败，请手动长按选择复制');}
document.body.removeChild(ta);
}

// ---- 示例数据 ----
function loadSample() {
var A = nid('p'), B = nid('p'), C = nid('p'), D = nid('p');
state.people = [
{ id: A, name: '小明'}, { id: B, name: '小红'},
{ id: C, name: '小刚'}, { id: D, name: '小丽'}
];
var sh = {};
sh[B] = 1; sh[C] = 1; sh[D] = 2;
state.expenses = [
{ id: nid('e'), title: '火锅聚餐', payerId: A, amountCents: 48000, participants: [A, B, C, D], mode: 'equal', shares: null},
{ id: nid('e'), title: '奶茶', payerId: B, amountCents: 9600, participants: [B, C, D], mode: 'itemized', shares: sh}
];
state.serviceFeeCents = 2000;
state.feePayerId = A;
document.getElementById('aa-fee').value = '20';
save(); renderPeople(); renderExpenses(); renderAll();
toast('已载入示例数据');
}
function clearAll() {
if (!state.people.length &&!state.expenses.length) return;
if (!confirm('确定清空所有参与人、支出与服务费吗？')) return;
state = { people: [], expenses: [], serviceFeeCents: 0, feePayerId: '', seq: state.seq};
formParts = [];
document.getElementById('aa-fee').value = '';
save(); renderPeople(); renderExpenses(); renderAll();
toast('已清空');
}

// ---- 事件绑定 ----
function bind() {
document.getElementById('aa-add-person').addEventListener('click', function () {
if (addPerson(document.getElementById('aa-new-name').value)) {
document.getElementById('aa-new-name').value = '';
document.getElementById('aa-new-name').focus();
}
});
document.getElementById('aa-new-name').addEventListener('keydown', function (ev) {
if (ev.key === 'Enter') {
ev.preventDefault();
if (addPerson(ev.target.value)) ev.target.value = '';
}
});
document.getElementById('aa-people').addEventListener('click', function (ev) {
var b = ev.target.closest('[data-del-person]');
if (b) delPerson(b.getAttribute('data-del-person'));
});
document.getElementById('aa-expenses').addEventListener('click', function (ev) {
var b = ev.target.closest('[data-del-exp]');
if (b) delExpense(b.getAttribute('data-del-exp'));
});
document.getElementById('aa-exp-parts').addEventListener('change', function (ev) {
var c = ev.target.closest('[data-part]');
if (!c) return;
var id = c.getAttribute('data-part');
if (c.checked && formParts.indexOf(id) < 0) formParts.push(id);
if (!c.checked) formParts = formParts.filter(function (x) { return x!== id;});
renderParts();
});
document.querySelectorAll('input[name="aa-mode"]').forEach(function (r) {
r.addEventListener('change', function () {
document.querySelectorAll('.aa-radio').forEach(function (el) {
el.classList.toggle('on', el.querySelector('input').checked);
});
renderShares();
});
});
document.getElementById('aa-add-expense').addEventListener('click', addExpense);
document.getElementById('aa-fee').addEventListener('input', function (ev) {
var v = parseFloat(ev.target.value);
state.serviceFeeCents = v > 0? Math.round(v * 100): 0;
save(); renderAll();
});
document.getElementById('aa-fee-payer').addEventListener('change', function (ev) {
state.feePayerId = ev.target.value;
save(); renderAll();
});
document.getElementById('aa-sample').addEventListener('click', loadSample);
document.getElementById('aa-clear-all').addEventListener('click', clearAll);
document.getElementById('aa-copy').addEventListener('click', copyResult);
}

// ---- 初始化 ----
load();
if (state.serviceFeeCents > 0) {
document.getElementById('aa-fee').value = (state.serviceFeeCents / 100).toFixed(2).replace(/\.?0+$/, '');
}
bind();
renderPeople();
renderExpenses();
renderAll();
})();

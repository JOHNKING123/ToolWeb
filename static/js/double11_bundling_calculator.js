/* 双十一凑单计算器 - 纯前端本地计算工具
*
* 算法说明：
* 1. 金额统一转“分”(整数)计算，避免浮点误差；展示保留两位小数。
* 2. 最优凑单 = 子集和问题：0-1 背包稀疏 DP，找满足某档位满减门槛(threshold)
* 且总金额 sum >= threshold 中 sum 最小（溢出 overflow = sum - threshold 最小）的商品子集。
* 溢出相同时优先件数更少（reach 记录最小件数，搜 best 时 (sum, count) 字典序比较）。
* 3. 多档位：每档独立求最优解；推荐档 = 立减金额最大者，并列时取实付最低者。
* 4. 未达档位：购物车总额 T < threshold，missing = threshold - T；
* 候补单品 = 价格 >= missing 的单品中按 (price - missing) 最小排序取前三。
* 5. 纯逻辑函数无 DOM，可在 Node 下单测（module.exports 导出）。全程不上传服务器，无新增后端接口。
*/
(function () {
'use strict';

/* ---------------- 纯逻辑函数（无 DOM） ---------------- */

function round2(n) {
return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* 元 -> 分（整数），非法/非正返回 NaN */
function toCents(price) {
var n = Number(price);
if (!isFinite(n) || n <= 0) { return NaN;}
return Math.round(n * 100);
}

/* 分 -> “xx.xx”元字符串 */
function fmtCents(cents) {
return (cents / 100).toFixed(2);
}

/* 子集和 DP：cents 为各商品价格(分)数组，threshold 为档位门槛(分)。
* 返回 {sum, overflow, indices, count}，无满足子集时返回 null。 */
function subsetMinOverflow(cents, threshold) {
if (!cents.length ||!(threshold > 0)) { return null;}
var reach = new Map(); /* sum -> {prev, idx, count} */
reach.set(0, { prev: -1, idx: -1, count: 0});
for (var i = 0; i < cents.length; i++) {
var v = cents[i];
if (!(v > 0)) { continue;}
var adds = [];
reach.forEach(function (st, s) {
adds.push({ from: s, to: s + v, idx: i, count: st.count + 1});
});
for (var k = 0; k < adds.length; k++) {
var a = adds[k];
var old = reach.get(a.to);
if (old === undefined || a.count < old.count) {
reach.set(a.to, { prev: a.from, idx: a.idx, count: a.count});
}
}
}
var best = -1, bestCount = 0;
reach.forEach(function (st, s) {
if (s >= threshold) {
if (best < 0 || s < best || (s === best && st.count < bestCount)) {
best = s;
bestCount = st.count;
}
}
});
if (best < 0) { return null;}
var indices = [];
var s2 = best;
while (s2 > 0) {
var step = reach.get(s2);
indices.push(step.idx);
s2 = step.prev;
}
indices.reverse();
return { sum: best, overflow: best - threshold, indices: indices, count: bestCount};
}

/* 多档位规划：items=[{name, cents}], tiers=[{full, minus}（分）]
* 返回 {plans, recommendIdx}；plans[i] = {tier, reachable, picked, total, overflow, pay} */
function planTiers(items, tiers) {
var cents = items.map(function (it) { return it.cents;});
var plans = tiers.map(function (t) {
var r = subsetMinOverflow(cents, t.full);
if (!r) {
return { tier: t, reachable: false, picked: [], total: 0, overflow: 0, pay: 0, missing: 0};
}
var picked = r.indices.map(function (i) { return items[i];});
return {
tier: t,
reachable: true,
picked: picked,
total: r.sum,
overflow: r.overflow,
pay: r.sum - t.minus,
missing: 0
};
});
var recommendIdx = -1;
plans.forEach(function (p, i) {
if (!p.reachable) { return;}
if (recommendIdx < 0) { recommendIdx = i; return;}
var cur = plans[recommendIdx];
if (p.tier.minus > cur.tier.minus ||
(p.tier.minus === cur.tier.minus && p.pay < cur.pay)) {
recommendIdx = i;
}
});
return { plans: plans, recommendIdx: recommendIdx};
}

/* 候补单品建议：candidates=[{name, cents}]，missing 为还差金额(分)
* 返回按 (cents - missing) 升序的前 3 个 {name, cents, extra} */
function candidateSuggestions(candidates, missing) {
if (!(missing > 0) ||!candidates.length) { return [];}
return candidates
.filter(function (c) { return c.cents >= missing;})
.map(function (c) { return { name: c.name, cents: c.cents, extra: c.cents - missing};})
.sort(function (a, b) { return (a.extra - b.extra) || (a.cents - b.cents);})
.slice(0, 3);
}

/* 批量解析 “名称 价格” 多行文本；返回 {items:[{name, cents}], skipped} */
function parseBulk(text) {
var items = [];
var skipped = 0;
if (!text) { return { items: items, skipped: skipped};}
var lines = String(text).split(/\r?\n/);
for (var i = 0; i < lines.length; i++) {
var line = lines[i].trim();
if (!line) { continue;}
var parts = line.split(/[\s,，、;；\t]+/).filter(function (x) { return x.length > 0;});
if (parts.length < 2) { skipped++; continue;}
var priceTok = parts[parts.length - 1];
var cents = toCents(priceTok);
if (isNaN(cents)) { skipped++; continue;}
var name = parts.slice(0, parts.length - 1).join(' ');
if (!name) { name = '商品' + (items.length + 1);}
items.push({ name: name, cents: cents});
}
return { items: items, skipped: skipped};
}

/* 校验档位：返回 {tiers:[{full, minus}], errors:[...]}（分） */
function validateTiers(rawTiers) {
var tiers = [];
var errors = [];
rawTiers.forEach(function (t, i) {
var n = i + 1;
var full = toCents(t.full);
var minus = Number(t.minus);
if (isNaN(full)) { errors.push('第' + n + '档「满」金额无效'); return;}
if (!isFinite(minus) || minus <= 0) { errors.push('第' + n + '档「减」金额须大于 0'); return;}
var minusC = Math.round(minus * 100);
if (minusC >= full) { errors.push('第' + n + '档「减」金额须小于「满」金额'); return;}
tiers.push({ full: full, minus: minusC});
});
tiers.sort(function (a, b) { return a.full - b.full;});
return { tiers: tiers, errors: errors};
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = {
round2: round2,
toCents: toCents,
fmtCents: fmtCents,
subsetMinOverflow: subsetMinOverflow,
planTiers: planTiers,
candidateSuggestions: candidateSuggestions,
parseBulk: parseBulk,
validateTiers: validateTiers
};
}

if (typeof document === 'undefined') { return; }

/* ---------------- DOM 交互 ---------------- */

function $(id) { return document.getElementById(id);}

function esc(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var itemSeq = 0;

function addItemRow(name, price) {
itemSeq++;
var tbody = $('d11-items');
var tr = document.createElement('tr');
tr.innerHTML =
'<td><input type="text" class="d11-inp" data-k="name" placeholder="商品名称" value="' + esc(name || '') + '"></td>' +
'<td><input type="number" class="d11-inp" data-k="price" placeholder="例如：129.00" min="0" step="0.01" inputmode="decimal" value="' + esc(price || '') + '"></td>' +
'<td class="num"><button type="button" class="d11-del" title="删除该行">✕</button></td>';
tbody.appendChild(tr);
tr.querySelector('.d11-del').addEventListener('click', function () {
tr.remove();
updateItemCount();
});
updateItemCount();
}

function updateItemCount() {
var n = $('d11-items').rows.length;
$('d11-item-count').textContent = n;
}

var tierSeq = 0;

function addTierRow(full, minus) {
tierSeq++;
var tbody = $('d11-tiers');
var tr = document.createElement('tr');
tr.innerHTML =
'<td><span class="d11-tier-label">满</span><input type="number" class="d11-inp d11-num" data-k="full" placeholder="300" min="0" step="0.01" inputmode="decimal" value="' + esc(full || '') + '"></td>' +
'<td><span class="d11-tier-label">减</span><input type="number" class="d11-inp d11-num" data-k="minus" placeholder="50" min="0" step="0.01" inputmode="decimal" value="' + esc(minus || '') + '"></td>' +
'<td class="num"><button type="button" class="d11-del" title="删除该档">✕</button></td>';
tbody.appendChild(tr);
tr.querySelector('.d11-del').addEventListener('click', function () { tr.remove();});
}

function readItems() {
var items = [];
var skipped = 0;
var rows = $('d11-items').rows;
for (var i = 0; i < rows.length; i++) {
var name = rows[i].querySelector('[data-k="name"]').value.trim();
var price = rows[i].querySelector('[data-k="price"]').value.trim();
if (!name &&!price) { continue;}
var cents = toCents(price);
if (isNaN(cents)) { skipped++; continue;}
items.push({ name: name || ('商品' + (i + 1)), cents: cents});
}
return { items: items, skipped: skipped};
}

function readTiers() {
var raw = [];
var rows = $('d11-tiers').rows;
for (var i = 0; i < rows.length; i++) {
raw.push({
full: rows[i].querySelector('[data-k="full"]').value.trim(),
minus: rows[i].querySelector('[data-k="minus"]').value.trim()
});
}
return validateTiers(raw);
}

function showError(msg) {
var el = $('d11-error');
if (!msg) { el.style.display = 'none'; el.textContent = ''; return;}
el.style.display = 'block';
el.textContent = msg;
}

function tierLabel(t) {
return '满 ' + fmtCents(t.full) + ' 减 ' + fmtCents(t.minus);
}

function run() {
showError(null);
var rd = readItems();
var rt = readTiers();
if (rt.errors.length) { showError(rt.errors.join('；')); return;}
if (!rt.tiers.length) { showError('请至少配置一个满减档位。'); return;}
if (!rd.items.length) {
showError(rd.skipped > 0? '商品清单为空（' + rd.skipped + ' 行价格无效已跳过）。': '请先添加商品（至少 1 件）。');
return;
}
var candidates = parseBulk($('d11-candidates').value);
var cartTotal = rd.items.reduce(function (a, it) { return a + it.cents;}, 0);
var res = planTiers(rd.items, rt.tiers);

/* KPI */
var maxFull = -1, maxMinus = 0, minPay = 0, reachCount = 0;
res.plans.forEach(function (p) {
if (p.reachable) {
reachCount++;
if (p.tier.minus > maxMinus) { maxMinus = p.tier.minus; maxFull = p.tier.full;}
if (minPay === 0 || p.pay < minPay) { minPay = p.pay;}
}
});
var kpis = [
{ k: '购物车总额', v: '¥' + fmtCents(cartTotal)},
{ k: '可达档位数', v: reachCount + ' / ' + res.plans.length}
];
if (res.recommendIdx >= 0) {
var rec = res.plans[res.recommendIdx];
kpis.push({ k: '推荐档位', v: tierLabel(rec.tier)});
kpis.push({ k: '最大立减', v: '¥' + fmtCents(rec.tier.minus)});
kpis.push({ k: '预计最低实付', v: '¥' + fmtCents(rec.pay)});
} else {
kpis.push({ k: '推荐档位', v: '暂无可达档位'});
kpis.push({ k: '最大立减', v: '¥0.00'});
}
$('d11-kpis').innerHTML = kpis.map(function (x, i) {
return '<div class="d11-kpi' + (i === 0? ' total': '') + '"><div class="v">' + esc(x.v) + '</div><div class="k">' + esc(x.k) + '</div></div>';
}).join('');

/* 各档位卡片 */
var html = '';
res.plans.forEach(function (p, i) {
var badge, body;
if (p.reachable) {
badge = i === res.recommendIdx
? '<span class="d11-badge rec">★ 省钱最多·推荐</span>'
: '<span class="d11-badge ok">可达标</span>';
var rows = p.picked.map(function (it, j) {
return '<tr><td style="width:2rem;"><input type="checkbox" checked disabled></td>' +
'<td>' + esc(it.name) + '</td><td class="num">¥' + fmtCents(it.cents) + '</td></tr>';
}).join('');
body =
'<div class="d11-plan-meta">' +
'<span>凑单总金额 <b>¥' + fmtCents(p.total) + '</b></span>' +
'<span>溢出 <b>¥' + fmtCents(p.overflow) + '</b>（超出门槛部分）</span>' +
'<span>立减 <b class="d11-save">¥' + fmtCents(p.tier.minus) + '</b></span>' +
'<span>实付 <b class="d11-pay">¥' + fmtCents(p.pay) + '</b></span>' +
'</div>' +
'<div class="d11-table-wrap"><table class="d11-table"><thead><tr><th></th><th>推荐凑单商品</th><th style="text-align:right;">价格</th></tr></thead><tbody>' +
rows +
'</tbody></table></div>' +
'<div class="d11-note"><i class="material-icons">lightbulb</i><div>以上为「溢出金额最小」的最优组合（' + p.picked.length + ' 件）；' +
(p.overflow === 0? '恰好凑满门槛，零溢出。': '超出门槛 ¥' + fmtCents(p.overflow) + '，已是全部组合中的最小溢出。') +
'下单时请按此清单选购。</div></div>';
} else {
var missing = p.tier.full - cartTotal;
badge = '<span class="d11-badge miss">未达标</span>';
var sug = candidateSuggestions(candidates.items, missing);
var sugHtml = '';
if (candidates.items.length) {
if (sug.length) {
sugHtml = '<div class="d11-note"><i class="material-icons">add_shopping_cart</i><div><b>候补单品建议：</b>加购以下任一件即可达标——' +
sug.map(function (s) {
return esc(s.name) + '（¥' + fmtCents(s.cents) + '，加购后实付约 ¥' + fmtCents(cartTotal + s.cents - p.tier.minus) + '）';
}).join('；') + '。</div></div>';
} else {
sugHtml = '<div class="d11-note"><i class="material-icons">info</i><div>候补单品中没有价格 ≥ ¥' + fmtCents(missing) + ' 的单品，可再补充几件高价候选。</div></div>';
}
}
body =
'<div class="d11-missing"><i class="material-icons">trending_up</i><div>当前购物车总额 ¥' + fmtCents(cartTotal) + '，<b>还差 ¥' + fmtCents(missing) + '</b> 可享' + esc(tierLabel(p.tier)) + '。</div></div>' +
sugHtml;
}
html += '<div class="d11-plan' + (i === res.recommendIdx? ' rec': '') + '">' +
'<div class="d11-plan-head"><span class="d11-plan-title">' + esc(tierLabel(p.tier)) + '</span>' + badge + '</div>' +
body + '</div>';
});
$('d11-plans').innerHTML = html;

/* 候补解析提示 */
var candNote = '';
if (candidates.skipped > 0) { candNote = '候补单品中有 ' + candidates.skipped + ' 行价格无效已跳过。';}
$('d11-cand-note').textContent = candNote;

if (rd.skipped > 0) {
showError('注意：商品清单中有 ' + rd.skipped + ' 行价格无效已跳过，结果基于有效商品计算。');
}

$('d11-result').style.display = 'block';
$('d11-copy').disabled = false;
$('d11-result').scrollIntoView({ behavior: 'smooth', block: 'start'});
}

function copyResult() {
var cartTotal = $('d11-kpis').innerText;
var text = '\n' + cartTotal.replace(/\n/g, ' ') + '\n\n';
var plans = document.querySelectorAll('#d11-plans.d11-plan');
plans.forEach(function (pl) {
var title = pl.querySelector('.d11-plan-title').textContent;
var badge = pl.querySelector('.d11-badge').textContent;
text += '■ ' + title + '（' + badge + '）\n';
var meta = pl.querySelector('.d11-plan-meta');
if (meta) {
text += meta.innerText.replace(/\n/g, '；') + '\n';
var rows = pl.querySelectorAll('.d11-table tbody tr');
rows.forEach(function (r, i) {
var tds = r.querySelectorAll('td');
text += (i + 1) + '. ' + tds[1].textContent + ' ' + tds[2].textContent + '\n';
});
} else {
var miss = pl.querySelector('.d11-missing');
if (miss) { text += miss.innerText.replace(/\n/g, ' ') + '\n';}
var note = pl.querySelector('.d11-note');
if (note) { text += note.innerText.replace(/\n/g, ' ') + '\n';}
}
text += '\n';
});
text += '满减规则以各平台/店铺实际页面为准；本工具纯前端本地计算。';
var done = function () { $('d11-copy').innerHTML = '<i class="material-icons">check</i> 已复制'; setTimeout(function () { $('d11-copy').innerHTML = '<i class="material-icons">content_copy</i> 复制结果';}, 1500);};
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done();});
} else { fallbackCopy(text); done();}
}

function fallbackCopy(text) {
var ta = document.createElement('textarea');
ta.value = text;
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy');} catch (e) {}
document.body.removeChild(ta);
}

function resetAll() {
$('d11-items').innerHTML = '';
$('d11-tiers').innerHTML = '';
$('d11-bulk').value = '';
$('d11-candidates').value = '';
$('d11-result').style.display = 'none';
$('d11-copy').disabled = true;
$('d11-cand-note').textContent = '';
showError(null);
for (var i = 0; i < 3; i++) { addItemRow('', '');}
addTierRow('300', '50');
addTierRow('500', '80');
updateItemCount();
}

document.addEventListener('DOMContentLoaded', function () {
$('d11-add-item').addEventListener('click', function () { addItemRow('', '');});
$('d11-add-tier').addEventListener('click', function () { addTierRow('', '');});
$('d11-import').addEventListener('click', function () {
var r = parseBulk($('d11-bulk').value);
if (!r.items.length) {
showError(r.skipped > 0? '未解析到有效商品（' + r.skipped + ' 行格式无效）。每行格式：名称 价格，例如「蓝牙耳机 129.9」。': '请先在批量导入框粘贴商品，每行格式：名称 价格。');
return;
}
r.items.forEach(function (it) { addItemRow(it.name, (it.cents / 100).toFixed(2));});
$('d11-bulk').value = '';
showError(r.skipped > 0? '已导入 ' + r.items.length + ' 件，' + r.skipped + ' 行格式无效已跳过。': null);
});
$('d11-clear-items').addEventListener('click', function () {
$('d11-items').innerHTML = '';
updateItemCount();
});
$('d11-run').addEventListener('click', run);
$('d11-copy').addEventListener('click', copyResult);
$('d11-reset').addEventListener('click', resetAll);
resetAll();
});

})();

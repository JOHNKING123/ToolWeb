/* 双11到手价计算器（优惠叠加模拟）- 纯前端本地计算工具
*
* 叠加顺序（固定）：
*   商品活动价 -商品直降-> 直降后价(国补基数) -店铺券-> -品类券->
*   -跨店满减(档位)-> -会员折扣-> -红包-> -以旧换新折价-> -国补-> 预计到手价
* 国补 = 直降后价 x 15%，品类封顶：家电 1500 / 数码 500 / 手机 500 且单价(直降后)须 ≤6000（红线）
* 金额统一转"分"(整数)计算，避免浮点误差；展示保留两位小数。
* 纯逻辑函数无 DOM，可在 Node 下单测（module.exports 导出）。全程不上传服务器，无新增后端接口。
*/
(function () {
'use strict';

/* ---------------- 纯逻辑函数（无 DOM） ---------------- */

/* 元 -> 分（整数），非法/负数返回 NaN */
function toCents(price) {
var n = Number(price);
if (!isFinite(n) || n < 0) { return NaN; }
return Math.round(n * 100);
}

/* 分 -> "xx.xx" 元字符串 */
function fmtCents(cents) {
return (cents / 100).toFixed(2);
}

/* 国补品类配置：rate 补贴率，cap 封顶（分），phoneRedline 手机单价红线（分） */
var GUOBU_CATS = {
home:    { name: '家电', rate: 15, cap: 150000, redline: 0 },
digital: { name: '数码', rate: 15, cap: 50000,  redline: 0 },
phone:   { name: '手机', rate: 15, cap: 50000,  redline: 600000 }
};

/* input 字段（全部为分，整数；可选字段为 0 表示不使用）：
*   price      商品活动价（分）
*   directCut  商品直降立减（分）
*   shopCoupon 店铺券（分）
*   catCoupon  品类券（分）
*   tier       { threshold, off } 跨店满减档位（分），threshold/off 为 0 表示不使用
*   tierStack  true=每满减可叠加，false=单次
*   member     'none' | 'plus95'（京东PLUS 95折） | 'vip95'（88VIP 95折）
*   redpacket  红包（分）
*   tradein    以旧换新折价（分）
*   guobuOn    是否使用国补
*   guobuCat   'home' | 'digital' | 'phone'
* 返回 { steps:[{name, cut(分), remain(分), note}], base(分), final(分), saved(分), notes:[] }
* steps 每一行都是"扣减层"（含首行基准价），cut>0 的层计入叠加顺序明细。
*/
function calcFinalPrice(input) {
var notes = [];
var steps = [];
function num(v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.floor(v) : 0; }

var price = num(input.price);
var directCut = num(input.directCut);
var shopCoupon = num(input.shopCoupon);
var catCoupon = num(input.catCoupon);
var tier = input.tier || {};
var threshold = num(tier.threshold), off = num(tier.off);
var stack = !!input.tierStack;
var member = input.member || 'none';
var redpacket = num(input.redpacket);
var tradein = num(input.tradein);
var guobuOn = !!input.guobuOn;
var guobuCat = GUOBU_CATS[input.guobuCat] ? input.guobuCat : 'home';

if (!(price > 0)) { return { error: '请输入商品活动价（须大于 0）' }; }
if (directCut > price) { directCut = price; notes.push('直降金额已按活动价封顶。'); }

var remain = price;
steps.push({ name: '商品活动价', cut: 0, remain: remain });

if (directCut > 0) {
remain -= directCut;
steps.push({ name: '商品直降', cut: directCut, remain: remain });
}

/* 国补基数 = 直降后价（实战案例：6099 x 15% ≈ 914.85） */
var guobuBase = remain;

function applyCoupon(name, amount) {
if (amount <= 0) { return; }
var cut = Math.min(amount, remain);
remain -= cut;
steps.push({ name: name, cut: cut, remain: remain });
if (amount > cut) { notes.push(name + '面额大于当前剩余价，已按剩余价全额抵扣。'); }
}

applyCoupon('店铺券', shopCoupon);
applyCoupon('品类券', catCoupon);

if (threshold > 0 && off > 0) {
var cut = 0, note = '';
if (stack) {
var n = Math.floor(remain / threshold);
cut = n * off;
if (n <= 0) { note = '当前 ' + fmtCents(remain) + ' 元未达到满 ' + fmtCents(threshold) + ' 元，还差 ' + fmtCents(threshold - remain) + ' 元，跨店满减未触发'; }
} else {
if (remain >= threshold) { cut = off; }
else { note = '当前 ' + fmtCents(remain) + ' 元未达到满 ' + fmtCents(threshold) + ' 元档位，还差 ' + fmtCents(threshold - remain) + ' 元，跨店满减未触发'; }
}
if (cut > remain) { cut = remain; }
remain -= cut;
steps.push({ name: '跨店满减', cut: cut, remain: remain, note: note });
if (note) { notes.push(note); }
} else if (input.tierGiven) {
notes.push('跨店满减档位填写不完整（须同时填写"满"和"减"），已跳过该层。');
}

if (member === 'plus95' || member === 'vip95') {
var label = member === 'plus95' ? '京东PLUS 95折' : '88VIP 95折';
var mcut = Math.round(remain * 5 / 100);
remain -= mcut;
steps.push({ name: '会员折扣（' + label + '）', cut: mcut, remain: remain });
}

applyCoupon('红包', redpacket);
applyCoupon('以旧换新折价', tradein);

if (tradein > 0) {
notes.push('以旧换新提醒：折价直接从实付中扣除；部分平台的国补资格校验以"券后价"为基数，若平台把以旧换新计入优惠，基数会进一步缩小、国补相应变小，以实际下单页为准。');
}

var guobuCut = 0;
if (guobuOn) {
var cat = GUOBU_CATS[guobuCat];
if (cat.redline > 0 && guobuBase > cat.redline) {
notes.push('手机国补红线：直降后价 ' + fmtCents(guobuBase) + ' 元超过 6000 元红线，不符合国补条件，国补按 0 计算。');
} else {
var raw = Math.round(guobuBase * cat.rate / 100);
guobuCut = Math.min(raw, cat.cap);
remain -= guobuCut;
if (raw > cat.cap) { notes.push('国补已按' + cat.name + '类封顶 ' + fmtCents(cat.cap) + ' 元计算。'); }
}
steps.push({ name: '国补（' + cat.name + ' ' + cat.rate + '%）', cut: guobuCut, remain: remain, base: guobuBase });
} 

var final = remain;
var saved = price - final;

if (guobuOn) {
notes.push('国补下单建议：国补按订单/单品核算，多件商品尽量"分单下单"，避免某件超红线拖累整单。');
notes.push('退货提醒：国补订单退货可能占用/作废当年国补名额，下单前请确认。');
}

return {
steps: steps,
base: guobuBase,
final: final,
saved: saved,
notes: notes
};
}

if (typeof module !== 'undefined' && module.exports) {
module.exports = { toCents: toCents, fmtCents: fmtCents, calcFinalPrice: calcFinalPrice, GUOBU_CATS: GUOBU_CATS };
return;
}

/* ---------------- DOM 交互 ---------------- */

var $ = function (id) { return document.getElementById(id); };

/* 平台预设：京东 / 淘宝 */
var PLATFORMS = {
jd: {
name: '京东',
tier: { threshold: 300, off: 50, stack: true },
memberLabel: 'plus95',
memberOptions: [
{ value: 'none', label: '无' },
{ value: 'plus95', label: '京东PLUS 95折' }
]
},
tb: {
name: '淘宝',
tier: { threshold: 300, off: 50, stack: true },
memberLabel: 'vip95',
memberOptions: [
{ value: 'none', label: '无' },
{ value: 'vip95', label: '88VIP 95折' }
]
}
};

function applyPlatform(key, keepValues) {
var p = PLATFORMS[key] || PLATFORMS.jd;
if (!keepValues) {
$('d11f-tier-th').value = p.tier.threshold;
$('d11f-tier-off').value = p.tier.off;
$('d11f-tier-stack').checked = p.tier.stack;
}
var sel = $('d11f-member');
sel.innerHTML = '';
p.memberOptions.forEach(function (o) {
var opt = document.createElement('option');
opt.value = o.value;
opt.textContent = o.label;
sel.appendChild(opt);
});
$('d11f-platform-name').textContent = p.name;
}

function showError(msg) {
var el = $('d11f-error');
el.style.display = msg ? 'block' : 'none';
el.textContent = msg || '';
}

/* 冰箱 6599 → 4135 实战案例 */
function fillExample() {
applyPlatform('jd', true);
$('d11f-platform-jd').checked = true;
$('d11f-price').value = '6599';
$('d11f-direct').value = '500';
$('d11f-shop').value = '300';
$('d11f-cat').value = '299';
$('d11f-tier-th').value = '';
$('d11f-tier-off').value = '';
$('d11f-tier-stack').checked = false;
$('d11f-member').value = 'none';
$('d11f-redpacket').value = '50';
$('d11f-tradein').value = '400';
$('d11f-guobu').checked = true;
$('d11f-guobu-cat').value = 'home';
showError('');
run();
}

function readCents(id) {
var v = $('d11f-' + id).value;
if (v === '' || v === null || typeof v === 'undefined') { return 0; }
var c = toCents(v);
return isNaN(c) ? NaN : c;
}

function run() {
showError('');
var price = readCents('price');
if (isNaN(price) || price <= 0) {
showError('请先填写"商品活动价"（须为大于 0 的数字）。');
$('d11f-result').style.display = 'none';
$('d11f-copy').disabled = true;
return;
}
var parts = ['direct', 'shop', 'cat', 'tier-th', 'tier-off', 'redpacket', 'tradein'];
for (var i = 0; i < parts.length; i++) {
if (isNaN(readCents(parts[i]))) {
showError('"' + parts[i] + '" 输入的不是有效金额，请检查。');
$('d11f-result').style.display = 'none';
$('d11f-copy').disabled = true;
return;
}
}
var th = readCents('tier-th'), off = readCents('tier-off');
var input = {
price: price,
directCut: readCents('direct'),
shopCoupon: readCents('shop'),
catCoupon: readCents('cat'),
tier: { threshold: th, off: off },
tierGiven: ($('d11f-tier-th').value !== '' || $('d11f-tier-off').value !== ''),
tierStack: $('d11f-tier-stack').checked,
member: $('d11f-member').value,
redpacket: readCents('redpacket'),
tradein: readCents('tradein'),
guobuOn: $('d11f-guobu').checked,
guobuCat: $('d11f-guobu-cat').value
};
var r = calcFinalPrice(input);
if (r.error) {
showError(r.error);
$('d11f-result').style.display = 'none';
$('d11f-copy').disabled = true;
return;
}
render(r, input);
window.__d11fLast = r;
}

function esc(s) {
return String(s).replace(/[&<>"']/g, function (c) {
return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
});
}

function render(r, input) {
$('d11f-final').textContent = '¥' + fmtCents(r.final);
$('d11f-saved').textContent = '¥' + fmtCents(r.saved);
$('d11f-base').textContent = '¥' + fmtCents(r.base);
var rows = r.steps.map(function (s, idx) {
var cutHtml = (idx === 0 || s.cut === 0) ? '<span style="color:#9ca3af">—</span>' : '<b style="color:#059669">−' + fmtCents(s.cut) + '</b>';
var noteHtml = s.note ? '<div class="d11f-step-note">' + esc(s.note) + '</div>' : '';
return '<tr><td>' + (idx + 1) + '. ' + esc(s.name) + noteHtml + '</td>' +
'<td class="num">' + cutHtml + '</td>' +
'<td class="num"><b>' + fmtCents(s.remain) + '</b></td></tr>';
}).join('');
$('d11f-steps').innerHTML = rows;
var notesHtml = '';
if (r.notes.length) {
notesHtml = '<div class="d11f-notes"><div class="d11f-notes-title"><i class="material-icons">lightbulb</i> 规则提示</div><ul>' +
r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>';
}
$('d11f-notes').innerHTML = notesHtml;
$('d11f-result').style.display = 'block';
$('d11f-copy').disabled = false;
}

function copyResult() {
var r = window.__d11fLast;
if (!r) { return; }
var lines = ['双11到手价测算', '预计到手价：¥' + fmtCents(r.final), '共节省：¥' + fmtCents(r.saved), ''];
r.steps.forEach(function (s, idx) {
var line = (idx + 1) + '. ' + s.name + '：';
line += idx === 0 ? '¥' + fmtCents(s.remain) : ('−¥' + fmtCents(s.cut) + ' → ¥' + fmtCents(s.remain));
lines.push(line);
});
if (r.notes.length) { lines.push('', '规则提示：'); r.notes.forEach(function (n) { lines.push('· ' + n); }); }
var text = lines.join('\n');
var done = function () { $('d11f-copy').innerHTML = '<i class="material-icons">check</i> 已复制'; setTimeout(function () { $('d11f-copy').innerHTML = '<i class="material-icons">content_copy</i> 复制结果'; }, 1500); };
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
} else { fallbackCopy(text, done); }
}

function fallbackCopy(text, done) {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done(); } catch (e) { showError('复制失败，请手动截图保存。'); }
document.body.removeChild(ta);
}

function resetAll() {
['price', 'direct', 'shop', 'cat', 'tier-th', 'tier-off', 'redpacket', 'tradein'].forEach(function (id) { $('d11f-' + id).value = ''; });
$('d11f-tier-stack').checked = false;
$('d11f-member').value = 'none';
$('d11f-guobu').checked = false;
$('d11f-guobu-cat').value = 'home';
showError('');
$('d11f-result').style.display = 'none';
$('d11f-copy').disabled = true;
}

document.addEventListener('DOMContentLoaded', function () {
applyPlatform('jd', false);
$('d11f-platform-jd').addEventListener('change', function () { applyPlatform('jd', true); });
$('d11f-platform-tb').addEventListener('change', function () { applyPlatform('tb', true); });
$('d11f-run').addEventListener('click', run);
$('d11f-example').addEventListener('click', fillExample);
$('d11f-copy').addEventListener('click', copyResult);
$('d11f-reset').addEventListener('click', resetAll);
});

})();

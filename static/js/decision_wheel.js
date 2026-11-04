/* 幸运决策转盘（decision_wheel）- 纯前端零上传转盘抽奖
* 候选项逐行输入（2–50 个，可选权重「名称:权重」）
* → canvas 彩色转盘绘制（DPR 高清，扇区＋标签）
* → 缓动旋转动画（3／5／8 秒可选，easingOutCubic，顶部指针命中）
* → 结果高亮面板＋命中扇区闪烁
* → 可复抽（移除已中项）→ 结果记录 localStorage 持久化＋清空
* 真限制：① 结果来自浏览器伪随机数（Math.random／crypto 回退），每次不可复现，
*   无法验证公平性，不适合需公证的抽奖；② 抽奖记录存本机 localStorage，
*   浏览器存储配额约 5MB，清除浏览器数据会丢失；③ 旋转动画流畅度受设备帧率影响，
*   不同浏览器／设备观感略有差异；④ 所有数据不出浏览器，不上传任何服务器。
* 零网络请求：本文件不发起任何请求；渲染一律用 textContent，
* 输入里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行；
* canvas 渲染只做浏览器端，测试只覆盖纯函数。
* 纯函数契约：挂 window.DecisionWheel，module.exports 同步导出；
* 非法参数抛 Error，err.field 给出字段名，不静默钳制。 */
(function () {
'use strict';

var TAU = Math.PI * 2;
var HALF_PI = Math.PI / 2;
var POINTER_ANGLE = -HALF_PI; /* 指针固定在顶部（canvas 角度 -90°） */

function dwErr(message, field) {
var e = new Error(message);
e.field = field;
return e;
}

function isPosInt(x) {
return typeof x === 'number' && isFinite(x) && Math.floor(x) === x && x >= 1;
}

/* 解析逐行输入：每行「名称」或「名称:权重」（也认全角冒号）；空行跳过；
* 权重缺省 1，必须是有限正数。返回 [{name, weight}, ...]。 */
function parseItems(text) {
if (typeof text !== 'string') throw dwErr('text 须为字符串', 'text');
var lines = text.replace(/\r\n?/g, '\n').split('\n');
var items = [];
for (var i = 0; i < lines.length; i++) {
var line = lines[i].trim();
if (!line) continue;
var sep = Math.max(line.lastIndexOf(':'), line.lastIndexOf('：'));
var name, weight;
if (sep === -1) {
name = line;
weight = 1;
} else {
name = line.slice(0, sep).trim();
var ws = line.slice(sep + 1).trim();
if (!name) throw dwErr('第 ' + (i + 1) + ' 行：名称为空', 'items');
weight = Number(ws);
if (ws === '' || !isFinite(weight) || weight <= 0) throw dwErr('第 ' + (i + 1) + ' 行：权重非法「' + ws + '」（须为正数）', 'weight');
}
items.push({ name: name, weight: weight });
}
if (items.length === 0) throw dwErr('没有可用候选项（空行已跳过）', 'items');
return items;
}

/* 权重归一化：返回 [{name, weight, prob}, ...]，prob 精确 = weight/总和 */
function normalizeWeights(items) {
if (!Array.isArray(items) || items.length === 0) throw dwErr('items 须为非空数组', 'items');
var total = 0;
for (var i = 0; i < items.length; i++) {
var w = items[i] ? items[i].weight : undefined;
if (typeof w !== 'number' || !isFinite(w) || w <= 0) throw dwErr('第 ' + (i + 1) + ' 项：权重非法（须为有限正数）', 'weight');
total += w;
}
return items.map(function (it) {
return { name: it.name, weight: it.weight, prob: it.weight / total };
});
}

/* 加权抽取：weights 为正数数组，rand ∈ [0,1)；返回命中下标。
* 规则：首个满足 rand < 累计权重占比 的下标；边界 rand=0 → 0。 */
function pickIndex(weights, rand) {
if (!Array.isArray(weights) || weights.length === 0) throw dwErr('weights 须为非空数组', 'weights');
var total = 0;
for (var i = 0; i < weights.length; i++) {
var w = weights[i];
if (typeof w !== 'number' || !isFinite(w) || w <= 0) throw dwErr('第 ' + (i + 1) + ' 个权重非法（须为有限正数）', 'weights');
total += w;
}
if (typeof rand !== 'number' || isNaN(rand) || rand < 0 || rand >= 1) throw dwErr('rand 须为 [0,1) 区间数字', 'rand');
var acc = 0;
for (i = 0; i < weights.length; i++) {
acc += weights[i] / total;
if (rand < acc) return i;
}
return weights.length - 1;
}

/* 扇区几何：n 个扇区均匀分布，扇区 0 从顶部（-π/2）开始顺时针；
* 返回 {start, mid, end}（弧度）。 */
function sectorGeometry(index, n) {
if (!isPosInt(n)) throw dwErr('n 须为正整数', 'n');
if (typeof index !== 'number' || Math.floor(index) !== index || index < 0 || index >= n) throw dwErr('index 越界：须为 [0,' + n + ') 整数', 'index');
var step = TAU / n;
var start = POINTER_ANGLE + index * step;
return { start: start, mid: start + step / 2, end: start + step };
}

/* 缓动：easeOutCubic，t ∈ [0,1] */
function easingOutCubic(t) {
if (typeof t !== 'number' || isNaN(t) || t < 0 || t > 1) throw dwErr('t 须为 [0,1] 区间数字', 't');
return 1 - Math.pow(1 - t, 3);
}

/* 目标转角：转盘从 0 转到该角度时，index 扇区中心正对顶部指针；
* 再加 extraTurns（缺省 5）整圈制造旋转观感。返回 ≥0 的弧度。 */
function finalAngle(index, n, extraTurns) {
if (extraTurns === undefined) extraTurns = 5;
if (typeof extraTurns !== 'number' || Math.floor(extraTurns) !== extraTurns || extraTurns < 0) throw dwErr('extraTurns 须为非负整数', 'extraTurns');
var g = sectorGeometry(index, n);
var delta = ((POINTER_ANGLE - g.mid) % TAU + TAU) % TAU;
return delta + extraTurns * TAU;
}

/* 结果记录：新记录插到最前，超 maxLen（缺省 50）截断最旧的；返回新数组 */
function recordResult(history, entry, maxLen) {
if (!Array.isArray(history)) throw dwErr('history 须为数组', 'history');
if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name) throw dwErr('entry 须为含非空 name 的对象', 'entry');
if (maxLen === undefined) maxLen = 50;
if (!isPosInt(maxLen)) throw dwErr('maxLen 须为正整数', 'maxLen');
var out = [{ name: entry.name, time: entry.time || '' }].concat(history);
return out.slice(0, maxLen);
}

/* 文件名清理：去非法字符，空白转连字符，最长 60；空回退 'decision-wheel' */
function sanitizeFileName(text) {
var s = (text == null) ? '' : String(text);
s = s.replace(/[\\/:*?"<>\u0000-\u001f]/g, '');
s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
if (s.length === 0) return 'decision-wheel';
return s;
}

var api = {
parseItems: parseItems,
normalizeWeights: normalizeWeights,
pickIndex: pickIndex,
sectorGeometry: sectorGeometry,
easingOutCubic: easingOutCubic,
finalAngle: finalAngle,
recordResult: recordResult,
sanitizeFileName: sanitizeFileName
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.DecisionWheel = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
var DW_MIN = 2, DW_MAX = 50, DW_TURNS = 5, DW_HIST_KEY = 'decision_wheel_history_v1', DW_HIST_MAX = 50;

function $(id) { return document.getElementById(id); }

var state = {
items: [],
rotation: 0,
spinning: false,
winner: -1,
rafId: 0,
flashTimer: 0
};

function showMsg(msg) {
var el = $('dw-msg');
if (!el) return;
if (msg) { el.textContent = msg; el.style.display = 'block'; }
else { el.textContent = ''; el.style.display = 'none'; }
}

function fmtTime(d) {
function p(x) { return (x < 10 ? '0' : '') + x; }
return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ---------- canvas 绘制（DPR 高清） ---------- */
function sectorColor(i, n) {
return 'hsl(' + Math.round(i * 360 / n) + ',72%,58%)';
}

function drawWheel(highlight) {
var cv = $('dw-canvas');
if (!cv) return;
var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
var cssSize = cv.clientWidth || 320;
if (cv.width !== Math.round(cssSize * dpr)) {
cv.width = Math.round(cssSize * dpr);
cv.height = Math.round(cssSize * dpr);
}
var ctx = cv.getContext('2d');
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
var W = cssSize, cx = W / 2, cy = W / 2, R = W / 2 - 14;
ctx.clearRect(0, 0, W, W);

var items = state.items;
var n = items.length;
if (n === 0) {
ctx.fillStyle = '#f3f4f6';
ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
ctx.fillStyle = '#9ca3af';
ctx.font = '15px system-ui,sans-serif';
ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
ctx.fillText('先在左侧输入候选项', cx, cy);
return;
}

ctx.save();
ctx.translate(cx, cy);
ctx.rotate(state.rotation);
for (var i = 0; i < n; i++) {
var g = api.sectorGeometry(i, n);
ctx.beginPath();
ctx.moveTo(0, 0);
ctx.arc(0, 0, R, g.start, g.end);
ctx.closePath();
ctx.fillStyle = (highlight === i) ? '#fbbf24' : sectorColor(i, n);
ctx.fill();
ctx.strokeStyle = 'rgba(255,255,255,.85)';
ctx.lineWidth = 1.5;
ctx.stroke();
/* 标签：沿半径方向 */
ctx.save();
ctx.rotate(g.mid);
ctx.textAlign = 'right';
ctx.textBaseline = 'middle';
var fs = n <= 8 ? 15 : (n <= 16 ? 12.5 : (n <= 30 ? 10.5 : 9));
ctx.font = '600 ' + fs + 'px system-ui,sans-serif';
var label = items[i].name.length > 10 ? items[i].name.slice(0, 10) + '…' : items[i].name;
ctx.fillStyle = 'rgba(17,24,39,.92)';
ctx.fillText(label, R - 12, 0);
ctx.restore();
}
/* 中心轴 */
ctx.beginPath(); ctx.arc(0, 0, Math.max(20, R * 0.09), 0, TAU);
ctx.fillStyle = '#1f2937'; ctx.fill();
ctx.beginPath(); ctx.arc(0, 0, Math.max(9, R * 0.04), 0, TAU);
ctx.fillStyle = '#f9fafb'; ctx.fill();
ctx.restore();

/* 指针（固定顶部，不随转盘转） */
ctx.fillStyle = '#dc2626';
ctx.beginPath();
ctx.moveTo(cx - 11, 2); ctx.lineTo(cx + 11, 2); ctx.lineTo(cx, 24);
ctx.closePath(); ctx.fill();
ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1.5; ctx.stroke();

/* 外圈 */
ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3; ctx.stroke();
}

function stopFlash() {
if (state.flashTimer) { clearInterval(state.flashTimer); state.flashTimer = 0; }
}

function flashWinner(idx) {
stopFlash();
var on = true, ticks = 0;
drawWheel(idx);
state.flashTimer = setInterval(function () {
ticks++;
on = !on;
drawWheel(on ? idx : -1);
if (ticks >= 7) { stopFlash(); drawWheel(idx); }
}, 260);
}

/* ---------- 候选项 chips ---------- */
function renderChips() {
var box = $('dw-chips');
if (!box) return;
box.textContent = '';
if (state.items.length === 0) {
box.textContent = '暂无候选项';
box.style.color = '#9ca3af';
return;
}
box.style.color = '';
state.items.forEach(function (it, i) {
var s = document.createElement('span');
s.className = 'dw-chip';
s.style.borderLeftColor = sectorColor(i, state.items.length);
var t = document.createTextNode(it.name + (it.weight !== 1 ? ' ×' + it.weight : ''));
s.appendChild(t);
box.appendChild(s);
});
var c = $('dw-count');
if (c) c.textContent = '共 ' + state.items.length + ' 个候选项（' + DW_MIN + '–' + DW_MAX + '）';
}

/* ---------- 解析 ---------- */
function doParse(showOk) {
showMsg('');
var ta = $('dw-items');
try {
var items = api.parseItems(ta.value);
if (items.length < DW_MIN) { showMsg('候选项至少 ' + DW_MIN + ' 个，当前 ' + items.length + ' 个'); return false; }
if (items.length > DW_MAX) { showMsg('候选项最多 ' + DW_MAX + ' 个，当前 ' + items.length + ' 个（多出的不会静默丢弃，请删减后再抽）'); return false; }
state.items = items;
state.winner = -1;
stopFlash();
drawWheel(-1);
renderChips();
hideResult();
if (showOk) showMsg('');
return true;
} catch (e) {
showMsg('输入有误：' + e.message);
return false;
}
}

/* ---------- 抽奖 ---------- */
function rand01() {
try {
if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
var a = new Uint32Array(1);
window.crypto.getRandomValues(a);
return a[0] / 4294967296;
}
} catch (e) {}
return Math.random();
}

function setSpinning(v) {
state.spinning = v;
var b = $('dw-spin');
if (b) b.disabled = v;
}

function spin() {
if (state.spinning) return;
if (!doParse(false)) return;
stopFlash();
var items = state.items;
var n = items.length;
var weights = items.map(function (it) { return it.weight; });
var idx = api.pickIndex(weights, rand01());
var durSel = $('dw-duration');
var durSec = durSel ? Number(durSel.value) : 5;
if (!(durSec === 3 || durSec === 5 || durSec === 8)) durSec = 5;
var base = api.finalAngle(idx, n, 0);
var rel = ((base - state.rotation) % TAU + TAU) % TAU;
var target = state.rotation + rel + DW_TURNS * TAU;
var start = state.rotation;
var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
setSpinning(true);
hideResult();
function frame(now) {
var el = now - t0;
var p = el / (durSec * 1000);
if (p >= 1) p = 1;
var e = api.easingOutCubic(p);
state.rotation = start + (target - start) * e;
drawWheel(-1);
if (p < 1) {
state.rafId = requestAnimationFrame(frame);
} else {
state.rotation = target;
setSpinning(false);
onLanded(idx);
}
}
state.rafId = requestAnimationFrame(frame);
}

function onLanded(idx) {
state.winner = idx;
var item = state.items[idx];
flashWinner(idx);
var box = $('dw-result');
if (box) {
box.style.display = 'block';
var nameEl = $('dw-result-name');
if (nameEl) nameEl.textContent = item.name;
var metaEl = $('dw-result-meta');
if (metaEl) metaEl.textContent = '第 ' + (idx + 1) + ' 扇区' + (item.weight !== 1 ? ' · 权重 ' + item.weight : '') + ' · ' + fmtTime(new Date());
}
/* 写历史 */
try {
var raw = null;
try { raw = window.localStorage.getItem(DW_HIST_KEY); } catch (e) {}
var hist = raw ? JSON.parse(raw) : [];
hist = api.recordResult(hist, { name: item.name, time: fmtTime(new Date()) }, DW_HIST_MAX);
try { window.localStorage.setItem(DW_HIST_KEY, JSON.stringify(hist)); } catch (e) {}
renderHistory();
} catch (e) {}
if (box && box.scrollIntoView) { try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }
}

function hideResult() {
var box = $('dw-result');
if (box) box.style.display = 'none';
}

/* 复抽：移除已中项 */
function removeWinnerAndRespins() {
if (state.winner < 0 || state.winner >= state.items.length) return;
var removed = state.items[state.winner].name;
state.items.splice(state.winner, 1);
state.winner = -1;
var ta = $('dw-items');
if (ta) ta.value = state.items.map(function (it) { return it.weight !== 1 ? it.name + ':' + it.weight : it.name; }).join('\n');
if (state.items.length < DW_MIN) {
showMsg('已移除「' + removed + '」，剩余不足 ' + DW_MIN + ' 个，请补充候选项后再抽');
drawWheel(-1);
renderChips();
hideResult();
return;
}
renderChips();
drawWheel(-1);
hideResult();
spin();
}

/* ---------- 历史 ---------- */
function renderHistory() {
var box = $('dw-history');
if (!box) return;
box.textContent = '';
var hist = [];
try {
var raw = window.localStorage.getItem(DW_HIST_KEY);
if (raw) hist = JSON.parse(raw);
} catch (e) { hist = []; }
if (!Array.isArray(hist) || hist.length === 0) {
box.textContent = '暂无抽奖记录';
box.style.color = '#9ca3af';
return;
}
box.style.color = '';
hist.forEach(function (h) {
var row = document.createElement('div');
row.className = 'dw-hist-row';
var r = document.createElement('span'); r.className = 'r';
r.appendChild(document.createTextNode(h.name || ''));
var t = document.createElement('span'); t.className = 't';
t.appendChild(document.createTextNode(h.time || ''));
row.appendChild(r); row.appendChild(t);
box.appendChild(row);
});
}

function clearHistory() {
if (!window.confirm('清空全部抽奖记录？此操作不可撤销。')) return;
try { window.localStorage.removeItem(DW_HIST_KEY); } catch (e) {}
renderHistory();
}

/* ---------- 绑定 ---------- */
function bindPage() {
var ta = $('dw-items');
if (ta && !ta.value) {
ta.value = '火锅\n烧烤:2\n日料\n奶茶:3\n螺蛳粉\n炸鸡';
}
var b;
b = $('dw-parse'); if (b) b.addEventListener('click', function () { doParse(true); });
b = $('dw-sample'); if (b) b.addEventListener('click', function () {
if (ta) ta.value = '看电影\n逛公园:2\n在家躺平\n吃大餐:3\n去海边\n桌游';
doParse(true);
});
b = $('dw-clear-items'); if (b) b.addEventListener('click', function () {
if (ta) ta.value = '';
state.items = []; state.winner = -1;
stopFlash(); drawWheel(-1); renderChips(); hideResult(); showMsg('');
});
b = $('dw-spin'); if (b) b.addEventListener('click', spin);
b = $('dw-again'); if (b) b.addEventListener('click', spin);
b = $('dw-remove-respin'); if (b) b.addEventListener('click', removeWinnerAndRespins);
b = $('dw-clear-history'); if (b) b.addEventListener('click', clearHistory);
if (ta) ta.addEventListener('input', function () { doParse(false); });
window.addEventListener('resize', function () { drawWheel(state.winner >= 0 ? state.winner : -1); });
doParse(false);
renderHistory();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
else bindPage();
}
})();

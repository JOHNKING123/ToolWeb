/* 反应速度测试（reaction_test）- 纯前端零上传反应时间测试
* 点开始 → 随机等待 2–5 秒 → 红变绿 → 点按／空格 → performance.now() 毫秒计时
* 轮次 3／5／10 可选（默认 5）；绿灯前点按判抢跑犯规，本轮作废重测
* 多轮平均＋最佳＋分档（<200ms S 职业级／200–249 A 优秀／250–299 B 良好／
* 300–399 C 一般／≥400 D 多练练）；最佳成绩与最近 10 次历史只存本机 localStorage
* 真限制：① 毫秒数是近似值：performance.now() 计时受浏览器定时器精度与显示器
*   刷新率（一般 60Hz 约 16.7ms 一帧）影响，同一成绩换设备测会有数毫秒波动；
*   ② 抢跑作废：绿灯亮起前点按判犯规，本轮成绩作废、需重测该轮；③ 触屏、鼠标、
*   键盘的输入延迟不同，跨设备成绩不可直接比较；④ 最佳成绩与历史只存本机
*   localStorage，清除浏览器数据会丢失，换设备不同步。
* 零网络请求：本文件不发起任何请求；渲染一律用 textContent，
* 输入里的 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。
* 纯函数契约：挂 window.ReactionTest，module.exports 同步导出；
* 非法参数抛 Error，err.field 给出字段名，不静默钳制。 */
(function () {
'use strict';

var RT_ROUNDS_ALLOWED = [3, 5, 10];
var RT_PHASES = ['idle', 'waiting', 'ready', 'done'];

function rtErr(message, field) {
var e = new Error(message);
e.field = field;
return e;
}

function isFiniteNum(x) {
return typeof x === 'number' && isFinite(x);
}

/* 反应耗时：clickMs - startMs（毫秒，performance.now() 口径）。
* 锚点 (1000,1248)→248；clickMs 早于 startMs 抛错（负耗时不可能）。 */
function computeReactionMs(startMs, clickMs) {
if (!isFiniteNum(startMs)) throw rtErr('startMs 须为有限数字', 'startMs');
if (!isFiniteNum(clickMs)) throw rtErr('clickMs 须为有限数字', 'clickMs');
if (clickMs < startMs) throw rtErr('clickMs 不可早于 startMs（负耗时）', 'clickMs');
return clickMs - startMs;
}

/* 抢跑判定：点按时刻早于绿灯时刻即抢跑。锚点 (900,1000)→true。 */
function isFalseStart(clickMs, greenMs) {
if (!isFiniteNum(clickMs)) throw rtErr('clickMs 须为有限数字', 'clickMs');
if (!isFiniteNum(greenMs)) throw rtErr('greenMs 须为有限数字', 'greenMs');
return clickMs < greenMs;
}

function validateMsList(reactions, field) {
if (!Array.isArray(reactions) || reactions.length === 0) throw rtErr('reactions 须为非空数组', field || 'reactions');
for (var i = 0; i < reactions.length; i++) {
var v = reactions[i];
if (!isFiniteNum(v) || v < 0) throw rtErr('第 ' + (i + 1) + ' 个成绩非法（须为 ≥0 的有限数字）', field || 'reactions');
}
return reactions;
}

/* 多轮平均：算术平均。锚点 [200,250,300]→250。 */
function averageReactions(reactions) {
validateMsList(reactions, 'reactions');
var sum = 0;
for (var i = 0; i < reactions.length; i++) sum += reactions[i];
return sum / reactions.length;
}

/* 最佳成绩：最小值。 */
function bestReaction(reactions) {
validateMsList(reactions, 'reactions');
var best = reactions[0];
for (var i = 1; i < reactions.length; i++) {
if (reactions[i] < best) best = reactions[i];
}
return best;
}

/* 分档：<200 S 职业级／200–249 A 优秀／250–299 B 良好／300–399 C 一般／≥400 D 多练练。
* 边界 199→S、200→A、249→A、250→B、299→B、300→C、399→C、400→D。 */
function gradeReaction(ms) {
if (!isFiniteNum(ms) || ms < 0) throw rtErr('ms 须为 ≥0 的有限数字', 'ms');
if (ms < 200) return { grade: 'S', label: '职业级' };
if (ms < 250) return { grade: 'A', label: '优秀' };
if (ms < 300) return { grade: 'B', label: '良好' };
if (ms < 400) return { grade: 'C', label: '一般' };
return { grade: 'D', label: '多练练' };
}

/* 配置校验：config 缺省 → {rounds: 5}；rounds 只认 3／5／10，其余抛错。 */
function validateReactionConfig(config) {
if (config === undefined || config === null) return { rounds: 5 };
if (typeof config !== 'object' || Array.isArray(config)) throw rtErr('config 须为对象', 'config');
var rounds = config.rounds;
if (rounds === undefined) return { rounds: 5 };
if (RT_ROUNDS_ALLOWED.indexOf(rounds) === -1) throw rtErr('rounds 只支持 3／5／10', 'rounds');
return { rounds: rounds };
}

/* 状态机校验：phase ∈ idle/waiting/ready/done；rounds ∈ 3/5/10；
* current 为 [0, rounds] 整数；results 为有效毫秒数组且长度 ≤ rounds。
* 返回归一化副本，不修改入参。 */
function validateReactionState(state) {
if (!state || typeof state !== 'object' || Array.isArray(state)) throw rtErr('state 须为对象', 'state');
if (RT_PHASES.indexOf(state.phase) === -1) throw rtErr('phase 须为 idle/waiting/ready/done 之一', 'phase');
var rounds = state.rounds;
if (RT_ROUNDS_ALLOWED.indexOf(rounds) === -1) throw rtErr('rounds 只支持 3／5／10', 'rounds');
var current = state.current;
if (typeof current !== 'number' || Math.floor(current) !== current || current < 0 || current > rounds) throw rtErr('current 须为 [0, rounds] 整数', 'current');
var results = state.results;
if (!Array.isArray(results)) throw rtErr('results 须为数组', 'results');
if (results.length > rounds) throw rtErr('results 长度不可超过 rounds', 'results');
for (var i = 0; i < results.length; i++) {
if (!isFiniteNum(results[i]) || results[i] < 0) throw rtErr('第 ' + (i + 1) + ' 个成绩非法（须为 ≥0 的有限数字）', 'results');
}
return { phase: state.phase, rounds: rounds, current: current, results: results.slice() };
}

/* 毫秒格式化：<1000 → "248 ms"；≥1000 → 秒（最多两位小数，去尾零）："1.25 s"。 */
function formatReactionMs(ms) {
if (!isFiniteNum(ms) || ms < 0) throw rtErr('ms 须为 ≥0 的有限数字', 'ms');
if (ms < 1000) return Math.round(ms) + ' ms';
var s = Math.round(ms / 10) / 100;
return s + ' s';
}

var api = {
computeReactionMs: computeReactionMs,
isFalseStart: isFalseStart,
averageReactions: averageReactions,
bestReaction: bestReaction,
gradeReaction: gradeReaction,
validateReactionConfig: validateReactionConfig,
validateReactionState: validateReactionState,
formatReactionMs: formatReactionMs
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.ReactionTest = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
var RT_WAIT_MIN = 2000, RT_WAIT_MAX = 5000;
var RT_BEST_KEY = 'reaction_test_best_v1', RT_HIST_KEY = 'reaction_test_history_v1', RT_HIST_MAX = 10;

function $(id) { return document.getElementById(id); }

function loadBest() {
try {
var raw = window.localStorage.getItem(RT_BEST_KEY);
if (raw === null) return null;
var v = Number(raw);
return (isFinite(v) && v >= 0) ? v : null;
} catch (e) { return null; }
}

function loadHistory() {
try {
var raw = window.localStorage.getItem(RT_HIST_KEY);
if (!raw) return [];
var h = JSON.parse(raw);
return Array.isArray(h) ? h : [];
} catch (e) { return []; }
}

var state = {
phase: 'idle',
rounds: 5,
current: 0,
results: [],
greenAt: 0,
timer: 0,
best: loadBest()
};

function fmtTime(d) {
function p(x) { return (x < 10 ? '0' : '') + x; }
return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function showMsg(msg) {
var el = $('rt-msg');
if (!el) return;
if (msg) { el.textContent = msg; el.style.display = 'block'; }
else { el.textContent = ''; el.style.display = 'none'; }
}

function setArea(mode, main, sub) {
var area = $('rt-area');
if (!area) return;
area.className = 'rt-area rt-' + mode;
var m = $('rt-area-text');
if (m) m.textContent = main;
var s = $('rt-area-sub');
if (s) s.textContent = sub || '';
area.setAttribute('aria-label', main + (sub ? '，' + sub : ''));
}

function renderStats() {
var cur = $('rt-round-label');
if (cur) cur.textContent = state.results.length > 0 || state.phase === 'done'
? '第 ' + state.results.length + ' / ' + state.rounds + ' 轮'
: '第 1 / ' + state.rounds + ' 轮';
var last = $('rt-last');
if (last) last.textContent = state.results.length ? api.formatReactionMs(state.results[state.results.length - 1]) : '—';
var lg = $('rt-last-grade');
if (lg) {
if (state.results.length) {
var g = api.gradeReaction(state.results[state.results.length - 1]);
lg.textContent = g.grade + ' · ' + g.label;
} else lg.textContent = '—';
}
var avg = $('rt-avg');
if (avg) avg.textContent = state.results.length ? api.formatReactionMs(api.averageReactions(state.results)) : '—';
var best = $('rt-best');
if (best) best.textContent = (state.best === null) ? '—' : api.formatReactionMs(state.best);
var bg = $('rt-best-grade');
if (bg) bg.textContent = (state.best === null) ? '—' : (function () { var g = api.gradeReaction(state.best); return g.grade + ' · ' + g.label; })();
var start = $('rt-start');
if (start) {
start.textContent = state.phase === 'done' ? '再测一次' : (state.results.length ? '开始第 ' + (state.results.length + 1) + ' 轮' : '开始测试');
}
var rb = document.querySelectorAll('[data-rounds]');
for (var i = 0; i < rb.length; i++) {
var on = Number(rb[i].getAttribute('data-rounds')) === state.rounds;
rb[i].classList.toggle('rt-active', on);
rb[i].setAttribute('aria-pressed', on ? 'true' : 'false');
}
}

function renderHistory() {
var box = $('rt-history');
if (!box) return;
box.textContent = '';
var hist = loadHistory();
if (hist.length === 0) {
box.textContent = '暂无历史成绩';
box.style.color = '#9ca3af';
return;
}
box.style.color = '';
hist.forEach(function (h) {
var row = document.createElement('div');
row.className = 'rt-hist-row';
var r = document.createElement('span'); r.className = 'r';
var g = api.gradeReaction(h.ms);
r.appendChild(document.createTextNode(api.formatReactionMs(h.ms) + ' · ' + g.grade + ' ' + g.label + (h.isBest ? ' ★新纪录' : '')));
var t = document.createElement('span'); t.className = 't';
t.appendChild(document.createTextNode(h.time || ''));
row.appendChild(r); row.appendChild(t);
box.appendChild(row);
});
}

function saveRound(ms) {
var isBest = (state.best === null || ms < state.best);
if (isBest) {
state.best = ms;
try { window.localStorage.setItem(RT_BEST_KEY, String(ms)); } catch (e) {}
}
try {
var hist = loadHistory();
hist.unshift({ ms: Math.round(ms), grade: api.gradeReaction(ms).grade, time: fmtTime(new Date()), isBest: isBest });
hist = hist.slice(0, RT_HIST_MAX);
window.localStorage.setItem(RT_HIST_KEY, JSON.stringify(hist));
} catch (e) {}
renderHistory();
return isBest;
}

function clearTimer() {
if (state.timer) { clearTimeout(state.timer); state.timer = 0; }
}

function startWaiting() {
clearTimer();
state.phase = 'waiting';
state.greenAt = 0;
showMsg('');
setArea('waiting', '等绿灯…', '红灯时别点，变绿立刻点按（或按空格）');
var delay = RT_WAIT_MIN + Math.random() * (RT_WAIT_MAX - RT_WAIT_MIN);
state.timer = setTimeout(function () {
state.timer = 0;
state.phase = 'ready';
state.greenAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
setArea('ready', '点！', '越快越好，点按或按空格');
}, delay);
renderStats();
}

function onTap() {
var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
if (state.phase === 'waiting') {
/* 抢跑：本轮作废，回 idle 重测，轮次不推进 */
clearTimer();
state.phase = 'idle';
setArea('idle', '点我开始', '抢跑犯规！绿灯前点了，本轮作废——点「开始」重测本轮');
showMsg('抢跑犯规：绿灯亮起前点按，本轮成绩作废，请点「开始」重测本轮。');
renderStats();
return;
}
if (state.phase === 'ready') {
var ms;
try {
ms = api.computeReactionMs(state.greenAt, now);
} catch (e) {
showMsg('计时异常：' + e.message);
state.phase = 'idle';
setArea('idle', '点我开始', '点「开始」重新测试');
renderStats();
return;
}
state.results.push(ms);
var isBest = saveRound(ms);
var g = api.gradeReaction(ms);
if (state.results.length >= state.rounds) {
state.phase = 'done';
var avg = api.averageReactions(state.results);
var best = api.bestReaction(state.results);
var bg = api.gradeReaction(best);
setArea('done', api.formatReactionMs(ms), '本轮 ' + g.grade + ' · ' + g.label + (isBest ? ' ★新纪录！' : '') + '｜平均 ' + api.formatReactionMs(avg) + '，最佳 ' + api.formatReactionMs(best) + '（' + bg.grade + ' ' + bg.label + '）');
showMsg('测试完成：共 ' + state.rounds + ' 轮，平均 ' + api.formatReactionMs(avg) + '，最佳 ' + api.formatReactionMs(best) + '（' + bg.grade + ' · ' + bg.label + '）。');
} else {
state.phase = 'idle';
setArea('idle', api.formatReactionMs(ms), '本轮 ' + g.grade + ' · ' + g.label + (isBest ? ' ★新纪录！' : '') + '，点「开始」继续第 ' + (state.results.length + 1) + ' 轮');
showMsg('');
}
renderStats();
return;
}
if (state.phase === 'idle') {
startWaiting();
return;
}
if (state.phase === 'done') {
state.results = [];
state.current = 0;
startWaiting();
return;
}
}

function setRounds(n) {
var cfg;
try { cfg = api.validateReactionConfig({ rounds: n }); } catch (e) { return; }
if (state.phase === 'waiting' || state.phase === 'ready') return;
state.rounds = cfg.rounds;
if (state.results.length > state.rounds) state.results = state.results.slice(0, state.rounds);
if (state.phase === 'done' && state.results.length < state.rounds) state.phase = 'idle';
renderStats();
}

function clearHistory() {
if (!window.confirm('清空全部历史成绩与最佳成绩？此操作不可撤销。')) return;
try {
window.localStorage.removeItem(RT_HIST_KEY);
window.localStorage.removeItem(RT_BEST_KEY);
} catch (e) {}
state.best = null;
renderHistory();
renderStats();
}

function bindPage() {
var b;
b = $('rt-start'); if (b) b.addEventListener('click', function () {
if (state.phase === 'waiting' || state.phase === 'ready') return;
if (state.phase === 'done') { state.results = []; state.current = 0; }
startWaiting();
});
var area = $('rt-area');
if (area) area.addEventListener('click', onTap);
var rb = document.querySelectorAll('[data-rounds]');
for (var i = 0; i < rb.length; i++) {
rb[i].addEventListener('click', function () {
setRounds(Number(this.getAttribute('data-rounds')));
});
}
b = $('rt-clear-history'); if (b) b.addEventListener('click', clearHistory);
document.addEventListener('keydown', function (e) {
if (e.code === 'Space' || e.key === ' ') {
if (state.phase === 'waiting' || state.phase === 'ready') {
e.preventDefault();
onTap();
}
}
});
setArea('idle', '点我开始', '点开始后等红灯变绿，变绿立刻点按（或按空格）');
renderStats();
renderHistory();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
else bindPage();
}
})();

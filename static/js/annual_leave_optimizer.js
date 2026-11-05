/* 年假拼假优化器：2027 年 7 个法定假期拼假方案榜。
* 数据口径：国办发明电〔2026〕10号（2027 年放假安排），星期已用 date -d 逐日验真。
* 算法：对每个假期枚举包含整个法定假期的连续窗口，窗口内每个非假日/非周末
* 的日子（普通工作日与调休上班日）都须用年假覆盖；取连休天数最大、请假天数
* 最少、开始日期最早的窗口。调休上班日是工作日：不请假就打断连休，请假则
* 计入请假天数（例如国庆请 2 休 10 含 10 月 9 日调休上班日）。
* 导出：window.AnnualLeaveOptimizer（浏览器）与 module.exports（node 测试，同步导出）。
*/
(function (global) {
'use strict';

function fail(field, message) {
var e = new Error(message);
e.field = field;
return e;
}

function clone(v) { return JSON.parse(JSON.stringify(v));}

var DAY = 24 * 60 * 60 * 1000;

/* 日期用 UTC 毫秒，避免本地时区把午夜推到前一天。 */
function parseDate(s) {
if (typeof s!== 'string') return NaN;
var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
if (!m) return NaN;
var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
var d = new Date(t);
if (d.getUTCFullYear()!== +m[1] || d.getUTCMonth()!== +m[2] - 1 || d.getUTCDate()!== +m[3]) return NaN;
return t;
}

function fmtDate(t) {
var d = new Date(t);
function p(n) { return (n < 10? '0': '') + n;}
return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

function fmtShort(t) {
var d = new Date(t);
return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日';
}

function fmtRange(start, end) {
var a = new Date(parseDate(start)), b = new Date(parseDate(end));
return a.getUTCFullYear() + '年' + (a.getUTCMonth() + 1) + '月' + a.getUTCDate() + '日–' +
(b.getUTCMonth() + 1) + '月' + b.getUTCDate() + '日';
}

function weekday(t) { return new Date(t).getUTCDay();} /* 0=周日 */
function isWeekend(t) { var w = weekday(t); return w === 0 || w === 6;}

/* ---------------- 2027 年法定假期表（国办发明电〔2026〕10号） ----------------
* workdays：调休上班日（须上班的工作日，含落在周末的）。
* 元旦 1/1–1/3（3天，无调休）；春节 2/5–2/13（9天，1/31、2/14 上班）；
* 清明 4/3–4/5（3天，无调休）；劳动节 5/1–5/5（5天，5/8 上班）；
* 端午 6/9（1天，无调休）；中秋 9/15（1天，无调休）；
* 国庆 10/1–10/7（7天，9/26、10/9 上班）。 */
var HOLIDAYS = [
{ id: 'new-year', name: '元旦', start: '2027-01-01', end: '2027-01-03', workdays: [],
note: '无调休'},
{ id: 'spring-festival', name: '春节', start: '2027-02-05', end: '2027-02-13', workdays: ['2027-01-31', '2027-02-14'],
note: '调休：1月31日（周日）、2月14日（周日）上班'},
{ id: 'qingming', name: '清明节', start: '2027-04-03', end: '2027-04-05', workdays: [],
note: '无调休'},
{ id: 'labour-day', name: '劳动节', start: '2027-05-01', end: '2027-05-05', workdays: ['2027-05-08'],
note: '调休：5月8日（周六）上班'},
{ id: 'dragon-boat', name: '端午节', start: '2027-06-09', end: '2027-06-09', workdays: [],
note: '无调休'},
{ id: 'mid-autumn', name: '中秋节', start: '2027-09-15', end: '2027-09-15', workdays: [],
note: '无调休'},
{ id: 'national-day', name: '国庆节', start: '2027-10-01', end: '2027-10-07', workdays: ['2027-09-26', '2027-10-09'],
note: '调休：9月26日（周日）、10月9日（周六）上班'}
];

function listHolidays() { return clone(HOLIDAYS);}

function getHolidayById(id) {
if (typeof id!== 'string' ||!id) throw fail('id', '假期 id 必须是非空字符串');
for (var i = 0; i < HOLIDAYS.length; i++) {
if (HOLIDAYS[i].id === id) return clone(HOLIDAYS[i]);
}
throw fail('id', '不存在的假期 id：' + id);
}

/* normalizeLeaveDays(n) -> 0–30 的整数年假天数；缺省（undefined/null）为 5。
* 非整数、非数字、越界都抛错，err.field='leaveDays'，不静默钳制。 */
function normalizeLeaveDays(n) {
if (n === undefined || n === null) return 5;
if (typeof n!== 'number' ||!isFinite(n) || Math.floor(n)!== n) {
throw fail('leaveDays', '年假天数必须是整数');
}
if (n < 0 || n > 30) throw fail('leaveDays', '年假天数必须在 0–30 之间');
return n;
}

/* resolveHoliday(holiday)：id 字符串查表；对象须含合法 start/end（workdays 缺省 []）。
* 非法抛错，err.field='holiday'。 */
function resolveHoliday(holiday) {
if (typeof holiday === 'string') return getHolidayById(holiday);
if (holiday && typeof holiday === 'object' &&!Array.isArray(holiday)) {
var hs = parseDate(holiday.start), he = parseDate(holiday.end);
if (isNaN(hs) || isNaN(he) || he < hs) throw fail('holiday', '假期必须包含合法的起止日期');
var wd = holiday.workdays === undefined? []: holiday.workdays;
if (!Array.isArray(wd)) throw fail('holiday', '调休上班日必须是日期数组');
for (var i = 0; i < wd.length; i++) {
if (isNaN(parseDate(wd[i]))) throw fail('holiday', '调休上班日包含非法日期：' + wd[i]);
}
return {
id: typeof holiday.id === 'string' && holiday.id? holiday.id: 'custom',
name: typeof holiday.name === 'string' && holiday.name? holiday.name: '自定义假期',
start: fmtDate(hs), end: fmtDate(he), workdays: clone(wd),
note: typeof holiday.note === 'string'? holiday.note: ''
};
}
throw fail('holiday', '假期参数须为假期 id 或假期对象');
}

function countKinds(days, kind) {
var c = 0;
for (var i = 0; i < days.length; i++) if (days[i].kind === kind) c++;
return c;
}

/* computePlan(holiday, leaveDays) -> 最优拼假方案。
* 枚举所有包含整个法定假期的连续窗口：窗口内法定假日与周末免费，其余日子
* （普通工作日、调休上班日）各耗 1 天年假；取连休天数最大、请假天数最少、
* 开始日期最早者。leaveDays 缺省 5。
* 返回：{ holidayId, holidayName, holidayStart, holidayEnd, holidayDays,
* start, end, totalDays, leaveUsed, leaveDates, days, blockers}。
* days 每项 { date, kind, workday, weekday}，kind 为 holiday/weekend/leave；
* workday=true 表示该日是调休上班日（请假覆盖）；blockers 为窗口外 ±7 天内
* 未请假的调休上班日（打断连休者）。 */
function computePlan(holiday, leaveDays) {
var h = resolveHoliday(holiday);
var n = normalizeLeaveDays(leaveDays);
var hs = parseDate(h.start), he = parseDate(h.end);
var workSet = {};
h.workdays.forEach(function (d) { workSet[d] = true;});

var best = null;
var RANGE = 50 * DAY;
for (var s = hs - RANGE; s <= hs; s += DAY) {
for (var e = he; e <= he + RANGE; e += DAY) {
var leave = 0;
for (var d = s; d <= e; d += DAY) {
var ds = fmtDate(d);
if (d >= hs && d <= he) continue;
if (isWeekend(d) &&!workSet[ds]) continue;
leave++;
if (leave > n) break;
}
if (leave > n) continue;
var total = Math.round((e - s) / DAY) + 1;
if (!best || total > best.totalDays ||
(total === best.totalDays && leave < best.leaveUsed) ||
(total === best.totalDays && leave === best.leaveUsed && s < best._s)) {
best = { _s: s, _e: e, totalDays: total, leaveUsed: leave};
}
}
}

var days = [];
var leaveDates = [];
for (var t = best._s; t <= best._e; t += DAY) {
var ds2 = fmtDate(t);
var kind, workday =!!workSet[ds2];
if (t >= hs && t <= he) kind = 'holiday';
else if (!workday && isWeekend(t)) kind = 'weekend';
else kind = 'leave';
if (kind === 'leave') leaveDates.push(ds2);
days.push({ date: ds2, kind: kind, workday: workday, weekday: weekday(t)});
}

var blockers = [];
h.workdays.forEach(function (d) {
var wd = parseDate(d);
if ((wd < best._s || wd > best._e) && wd >= best._s - 7 * DAY && wd <= best._e + 7 * DAY) {
blockers.push(d);
}
});
blockers.sort();

return {
holidayId: h.id,
holidayName: h.name,
holidayStart: h.start,
holidayEnd: h.end,
holidayDays: Math.round((he - hs) / DAY) + 1,
start: fmtDate(best._s),
end: fmtDate(best._e),
totalDays: best.totalDays,
leaveUsed: best.leaveUsed,
leaveDates: leaveDates,
days: days,
blockers: blockers
};
}

/* rankPlans(leaveDays, limit) -> 7 个假期的方案榜，按连休天数降序、
* 请假天数升序、假期开始日期升序；limit 缺省 7（须为 1–7 的整数）。 */
function rankPlans(leaveDays, limit) {
var n = normalizeLeaveDays(leaveDays);
var lim = 7;
if (limit!== undefined && limit!== null) {
if (typeof limit!== 'number' ||!isFinite(limit) || Math.floor(limit)!== limit) {
throw fail('limit', '榜单条数必须是整数');
}
if (limit < 1 || limit > 7) throw fail('limit', '榜单条数必须在 1–7 之间');
lim = limit;
}
var plans = HOLIDAYS.map(function (h) { return computePlan(h, n);});
plans.sort(function (a, b) {
if (b.totalDays!== a.totalDays) return b.totalDays - a.totalDays;
if (a.leaveUsed!== b.leaveUsed) return a.leaveUsed - b.leaveUsed;
if (a.holidayStart!== b.holidayStart) return a.holidayStart < b.holidayStart? -1: 1;
return 0;
});
plans = plans.slice(0, lim);
plans.forEach(function (p, i) { p.rank = i + 1;});
return plans;
}

/* bestPlanForLeave(leaveDays) -> 榜首方案（连休最长者）。 */
function bestPlanForLeave(leaveDays) {
return rankPlans(leaveDays, 7)[0];
}

/* formatPlanText(plan) -> 可复制的方案文本。plan 须为 computePlan/rankPlans
* 返回的方案对象；非法抛错，err.field='plan'。 */
function formatPlanText(plan) {
if (!plan || typeof plan!== 'object' ||
typeof plan.holidayName!== 'string' || typeof plan.start!== 'string' ||
typeof plan.end!== 'string' || typeof plan.totalDays!== 'number' ||
typeof plan.leaveUsed!== 'number' ||!Array.isArray(plan.leaveDates) ||
!Array.isArray(plan.days)) {
throw fail('plan', '方案对象不完整');
}
var lines = [];
lines.push('请' + plan.leaveUsed + '天休' + plan.totalDays + '天：' +
plan.start + '至' + plan.end + '（共' + plan.totalDays + '天）');
lines.push('请假日期：' + (plan.leaveDates.length?
plan.leaveDates.map(function (d) { return fmtShort(parseDate(d));}).join('、'): '无'));
lines.push('其中法定假' + countKinds(plan.days, 'holiday') + '天 · 周末' +
countKinds(plan.days, 'weekend') + '天 · 请假' + plan.leaveUsed + '天');
if (plan.blockers && plan.blockers.length) {
lines.push('注：调休上班日' +
plan.blockers.map(function (d) { return fmtShort(parseDate(d));}).join('、') +
'未请假，不计入连休。');
}
return lines.join('\n');
}

/* buildCalendarDays(plan) -> 迷你日历渲染用的日期列表：方案窗口前后各扩 2 天，
* 让紧邻的调休上班日（打断连休者）也能在日历上看到。
* 每项 { date, kind, workday, weekday, inPlan}，kind 为
* holiday（法定假）/ weekend（周末）/ leave（请假日）/ work（调休上班日）/
* plain（窗口外普通工作日，仅作上下文）。 */
function buildCalendarDays(plan) {
if (!plan || typeof plan!== 'object' ||!Array.isArray(plan.days) ||
typeof plan.start!== 'string' || typeof plan.end!== 'string') {
throw fail('plan', '方案对象不完整');
}
var h = getHolidayById(plan.holidayId);
var hs = parseDate(h.start), he = parseDate(h.end);
var workSet = {};
h.workdays.forEach(function (d) { workSet[d] = true;});
var s = parseDate(plan.start) - 2 * DAY;
var e = parseDate(plan.end) + 2 * DAY;
var inPlan = {};
plan.days.forEach(function (d) { inPlan[d.date] = d;});
var out = [];
for (var t = s; t <= e; t += DAY) {
var ds = fmtDate(t);
if (inPlan[ds]) {
out.push({ date: ds, kind: inPlan[ds].kind, workday: inPlan[ds].workday,
weekday: weekday(t), inPlan: true});
} else if (workSet[ds]) {
out.push({ date: ds, kind: 'work', workday: true, weekday: weekday(t), inPlan: false});
} else if (t >= hs && t <= he) {
out.push({ date: ds, kind: 'holiday', workday: false, weekday: weekday(t), inPlan: false});
} else if (isWeekend(t)) {
out.push({ date: ds, kind: 'weekend', workday: false, weekday: weekday(t), inPlan: false});
} else {
out.push({ date: ds, kind: 'plain', workday: false, weekday: weekday(t), inPlan: false});
}
}
return out;
}

/* ---------------- 纯函数 HTML（浏览器渲染复用，node 测试可断言） ---------------- */
function escHtml(s) {
return String(s == null? '': s).replace(/[&<>"']/g, function (c) {
return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
});
}

var KIND_LABEL = { holiday: '法定假', weekend: '周末', leave: '请假', work: '调休上班', plain: '工作日'};

function buildCalendarHTML(plan) {
var days = buildCalendarDays(plan);
var cells = [];
var firstPad = (days[0].weekday + 6) % 7; /* 周一对齐 */
for (var i = 0; i < firstPad; i++) cells.push('<span class="alo-cal-pad"></span>');
days.forEach(function (d) {
var label = KIND_LABEL[d.kind];
if (d.kind === 'leave' && d.workday) label = '请假·调休';
cells.push('<span class="alo-cal-cell alo-k-' + d.kind + (d.inPlan? '': ' alo-out') +
'" title="' + escHtml(d.date + ' ' + label) + '">' +
'<b>' + d.date.slice(5) + '</b><i>' + escHtml(label) + '</i></span>');
});
return '<div class="alo-cal" role="img" aria-label="方案迷你日历：' +
escHtml(plan.start + '至' + plan.end) + '">' +
'<span class="alo-cal-head">一</span><span class="alo-cal-head">二</span>' +
'<span class="alo-cal-head">三</span><span class="alo-cal-head">四</span>' +
'<span class="alo-cal-head">五</span><span class="alo-cal-head">六</span>' +
'<span class="alo-cal-head">日</span>' + cells.join('') + '</div>';
}

function buildRankItemHTML(plan, isActive) {
return '<div class="alo-rank-item' + (isActive? ' alo-active': '') + '" data-id="' +
escHtml(plan.holidayId) + '" role="button" tabindex="0" aria-label="查看' +
escHtml(plan.holidayName) + '拼假方案">' +
'<span class="alo-rank-no">' + plan.rank + '</span>' +
'<span class="alo-rank-main"><b>' + escHtml(plan.holidayName) + '</b>' +
'<span class="alo-rank-sub">' + escHtml(fmtRange(plan.holidayStart, plan.holidayEnd)) +
' · 法定假' + plan.holidayDays + '天</span></span>' +
'<span class="alo-rank-best">请' + plan.leaveUsed + '休' + plan.totalDays + '</span>' +
'<span class="alo-rank-dates">' + escHtml(plan.start.slice(5).replace('-', '/')) + '–' +
escHtml(plan.end.slice(5).replace('-', '/')) + '</span></div>';
}

var api = {
listHolidays: listHolidays,
getHolidayById: getHolidayById,
normalizeLeaveDays: normalizeLeaveDays,
computePlan: computePlan,
rankPlans: rankPlans,
bestPlanForLeave: bestPlanForLeave,
formatPlanText: formatPlanText,
buildCalendarDays: buildCalendarDays,
buildCalendarHTML: buildCalendarHTML,
buildRankItemHTML: buildRankItemHTML
};

if (typeof module!== 'undefined' && module.exports) module.exports = api;
global.AnnualLeaveOptimizer = api;

/* ---------- 浏览器端 UI：仅在有 DOM 时绑定 ---------- */
if (typeof document!== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
var $ = function (id) { return document.getElementById(id);};
var state = { leaveDays: 5, selectedId: null};
var listEl = $('alo-list'), detailEl = $('alo-detail'),
errEl = $('alo-error'), inputEl = $('alo-leave-input');

function render() {
var plans;
try {
plans = rankPlans(state.leaveDays);
if (errEl) errEl.style.display = 'none';
} catch (e) {
if (errEl) { errEl.textContent = e.message || '年假天数无效'; errEl.style.display = 'block';}
return;
}
if (!state.selectedId ||!plans.some(function (p) { return p.holidayId === state.selectedId;})) {
state.selectedId = plans[0].holidayId;
}
if (listEl) {
listEl.innerHTML = plans.map(function (p) {
return buildRankItemHTML(p, p.holidayId === state.selectedId);
}).join('');
var items = listEl.querySelectorAll('.alo-rank-item');
for (var i = 0; i < items.length; i++) {
(function (el) {
var pick = function () { state.selectedId = el.getAttribute('data-id'); render();};
el.addEventListener('click', pick);
el.addEventListener('keydown', function (ev) {
if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick();}
});
})(items[i]);
}
}
var plan = null;
for (var j = 0; j < plans.length; j++) {
if (plans[j].holidayId === state.selectedId) { plan = plans[j]; break;}
}
if (plan && detailEl) {
var blockersHtml = plan.blockers.length?
'<p class="alo-note">⚠️ 调休上班日 ' +
plan.blockers.map(function (d) { return escHtml(fmtShort(parseDate(d)));}).join('、') +
' 未请假，不计入连休；如需连上它们，需另请 ' + plan.blockers.length + ' 天假。</p>': '';
detailEl.innerHTML =
'<h3>' + escHtml(plan.holidayName) + ' · 请' + plan.leaveUsed + '天休' + plan.totalDays + '天</h3>' +
'<p class="alo-plan-range">' + escHtml(plan.start) + ' 至 ' + escHtml(plan.end) +
'（共 ' + plan.totalDays + ' 天）</p>' +
'<p class="alo-plan-meta">请假 ' + plan.leaveUsed + ' 天：' +
(plan.leaveDates.length? escHtml(plan.leaveDates.join('、')): '无需请假') +
'；其中法定假 ' + countKinds(plan.days, 'holiday') + ' 天、周末 ' +
countKinds(plan.days, 'weekend') + ' 天。</p>' +
'<div class="alo-legend"><span class="alo-lg alo-k-holiday">法定假</span>' +
'<span class="alo-lg alo-k-weekend">周末</span>' +
'<span class="alo-lg alo-k-leave">请假日</span>' +
'<span class="alo-lg alo-k-work">调休上班日</span></div>' +
buildCalendarHTML(plan) + blockersHtml +
'<pre class="alo-text" id="alo-plan-text">' + escHtml(formatPlanText(plan)) + '</pre>' +
'<div class="alo-actions"><button class="btn btn-primary" id="alo-copy" type="button">复制方案文本</button>' +
'<span class="alo-copy-tip" id="alo-copy-tip"></span></div>';
var copyBtn = $('alo-copy');
if (copyBtn) {
copyBtn.addEventListener('click', function () {
var text = $('alo-plan-text')? $('alo-plan-text').textContent: '';
var tip = $('alo-copy-tip');
var done = function (ok) {
if (tip) {
tip.textContent = ok? '已复制，可直接粘贴到请假条或备忘里。': '复制失败，请手动选择方案文本复制。';
tip.style.display = 'block';
}
};
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { done(true);}, function () { done(false);});
} else {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { done(document.execCommand('copy'));} catch (e) { done(false);}
document.body.removeChild(ta);
}
});
}
}
}

function applyInput() {
var raw = inputEl? inputEl.value: '';
var v = raw === ''? NaN: Number(raw);
if (raw!== '' && isFinite(v) && Math.floor(v) === v && v >= 0 && v <= 30) {
state.leaveDays = v;
render();
} else if (raw === '') {
state.leaveDays = 5;
render();
} else {
if (errEl) { errEl.textContent = '年假天数须为 0–30 的整数'; errEl.style.display = 'block';}
}
}

if (inputEl) inputEl.addEventListener('change', applyInput);
var quicks = document.querySelectorAll('[data-alo-days]');
for (var k = 0; k < quicks.length; k++) {
quicks[k].addEventListener('click', function () {
var v = Number(this.getAttribute('data-alo-days'));
if (inputEl) inputEl.value = String(v);
state.leaveDays = v;
render();
});
}
render();
});
}
})(typeof window!== 'undefined'? window: this);

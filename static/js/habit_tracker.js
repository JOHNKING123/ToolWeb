/* 习惯追踪器 - 习惯管理 + 日历热力图打卡 + 连续 streak 统计（纯前端）
 *
 * 功能：
 *   习惯管理（创建/编辑/删除，名称 + 周期目标如"每天"/"每周≥5次"，多习惯切换）
 *   → 日历热力图（月视图，点击格子勾选/取消打卡）
 *   → 连续 streak 统计 + 完成率/周报（当前连续天数/最长连续/本周完成率/累计打卡天数）
 *   → localStorage 本地持久化（无账号无登录，离线可用）
 *   → 导入/导出 JSON 备份迁移（habits_YYYYMMDD_HHmmss.json）。
 *   纯本地处理，数据不出浏览器；脚本内零 fetch/XHR/WebSocket。
 *
 * 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制；
 *   日期键 'YYYY-MM-DD'；checkins 结构 {dateKey:true}）：
 *   toggleCheckIn(checkins, dateKey)
 *       -> 切换打卡后的新对象（不可变返回，不改原 checkins）；
 *         未打卡 -> 设为 true，已打卡 -> 删除该键；
 *         checkins 非对象抛 Error，err.field='checkins'；
 *         dateKey 非法抛 Error，err.field='dateKey'。
 *   computeStreak(checkins, today)
 *       -> 连续自然日天数：从 today 往前数；当天未打卡从昨天起算；
 *         断档即停，空对象 -> 0；
 *         today 非法抛 Error，err.field='today'；
 *         checkins 非对象抛 Error，err.field='checkins'。
 *   buildWeekMatrix(checkins, startKey)
 *       -> 连续 7 天 [{key, checked}]，从 startKey 起（含当天）；
 *         startKey 非法抛 Error，err.field='dateKey'。
 *   computeStats(checkins, fromKey, toKey)
 *       -> {total, days, rate}：区间内打卡天数/区间总天数/完成率（保留 3 位小数）；
 *         fromKey 晚于 toKey 抛 Error，err.field='range'；
 *         日期非法抛 Error，err.field='dateKey'。
 *   parseImport(text)
 *       -> JSON.parse 后校验 {habits:[{name,target,checkins}]}，返回归一化
 *         {habits:[{name,target,checkins}]}（target 缺省补 '每天'；
 *          checkins 只保留合法日期键且置 true）；
 *         JSON 非法/非字符串抛 Error，err.field='text'；
 *         结构非法抛 Error，err.field='data'。
 *   buildExportFileName(date)
 *       -> 'habits_YYYYMMDD_HHmmss.json'；
 *         date 非有效 Date 对象抛 Error，err.field='now'。
 *   computeLongestStreak(checkins)（附加）
 *       -> 历史最长连续自然日打卡天数；
 *         checkins 非对象抛 Error，err.field='checkins'。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

function isObj(v) {
    return v !== null && typeof v === 'object' && !Object.prototype.toString.call(v).match(/Array/);
}

function pad2(n) {
    return (n < 10 ? '0' : '') + n;
}

var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/* 解析 'YYYY-MM-DD'：合法返回 {y,mo,d}，非法返回 null（mo 为 1-12） */
function parseDateKey(key) {
    var m = DATE_RE.exec(String(key == null ? '' : key));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return { y: y, mo: mo, d: d };
}

function dateKeyOf(y, mo, d) {
    return y + '-' + pad2(mo) + '-' + pad2(d);
}

/* 本地自然日加减 n 天，返回日期键 */
function addDays(parts, n) {
    var dt = new Date(parts.y, parts.mo - 1, parts.d + n);
    return dateKeyOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function assertCheckins(checkins) {
    if (!isObj(checkins)) throw err('checkins', 'checkins 必须为 {dateKey:true} 对象');
}

function assertDateKey(key) {
    if (!parseDateKey(key)) throw err('dateKey', '日期键必须为 YYYY-MM-DD 合法日期');
}

/* 不可变切换打卡：有 -> 删，无 -> 设 true */
function toggleCheckIn(checkins, dateKey) {
    assertCheckins(checkins);
    assertDateKey(dateKey);
    var out = {};
    for (var k in checkins) {
        if (Object.prototype.hasOwnProperty.call(checkins, k)) out[k] = true;
    }
    if (out[dateKey]) { delete out[dateKey]; } else { out[dateKey] = true; }
    return out;
}

/* 连续自然日 streak：从 today 往前数，当天未打卡从昨天起算，断档即停 */
function computeStreak(checkins, today) {
    assertCheckins(checkins);
    var t = parseDateKey(today);
    if (!t) throw err('today', 'today 必须为 YYYY-MM-DD 合法日期');
    var cur = dateKeyOf(t.y, t.mo, t.d);
    if (!checkins[cur]) cur = addDays(t, -1);
    var n = 0;
    while (checkins[cur]) {
        n++;
        cur = addDays(parseDateKey(cur), -1);
    }
    return n;
}

/* 连续 7 天矩阵：[{key, checked}] */
function buildWeekMatrix(checkins, startKey) {
    assertCheckins(checkins);
    var s = parseDateKey(startKey);
    if (!s) throw err('dateKey', 'startKey 必须为 YYYY-MM-DD 合法日期');
    var out = [];
    for (var i = 0; i < 7; i++) {
        var key = addDays(s, i);
        out.push({ key: key, checked: !!checkins[key] });
    }
    return out;
}

/* 区间统计：{total 打卡天数, days 区间总天数, rate 完成率（3 位小数）} */
function computeStats(checkins, fromKey, toKey) {
    assertCheckins(checkins);
    var f = parseDateKey(fromKey), t = parseDateKey(toKey);
    if (!f || !t) throw err('dateKey', 'fromKey/toKey 必须为 YYYY-MM-DD 合法日期');
    var fn = f.y * 10000 + f.mo * 100 + f.d;
    var tn = t.y * 10000 + t.mo * 100 + t.d;
    if (fn > tn) throw err('range', '起始日期不得晚于结束日期');
    var days = 0, total = 0, cur = fromKey;
    for (;;) {
        days++;
        if (checkins[cur]) total++;
        if (cur === toKey) break;
        cur = addDays(parseDateKey(cur), 1);
    }
    return { total: total, days: days, rate: Math.round(total / days * 1000) / 1000 };
}

/* 导入归一化：校验 {habits:[{name,target,checkins}]}，target 缺省补 '每天' */
function parseImport(text) {
    if (typeof text !== 'string') throw err('text', 'text 必须为字符串');
    var data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw err('text', '非法 JSON 文本');
    }
    if (!isObj(data) || !Object.prototype.toString.call(data.habits).match(/Array/)) {
        throw err('data', '须为 {habits:[{name,target,checkins}]} 结构');
    }
    var habits = data.habits.map(function (h, i) {
        if (!isObj(h) || typeof h.name !== 'string' || !h.name.trim()) {
            throw err('data', 'habits[' + i + '].name 非法（须为非空字符串）');
        }
        var target = (typeof h.target === 'string' && h.target.trim()) ? h.target.trim() : '每天';
        var checkins = {};
        if (h.checkins !== undefined) {
            if (!isObj(h.checkins)) throw err('data', 'habits[' + i + '].checkins 非法（须为对象）');
            for (var k in h.checkins) {
                if (Object.prototype.hasOwnProperty.call(h.checkins, k) &&
                        parseDateKey(k) && h.checkins[k]) {
                    checkins[k] = true;
                }
            }
        }
        return { name: h.name.trim(), target: target, checkins: checkins };
    });
    return { habits: habits };
}

/* 导出文件名：'habits_YYYYMMDD_HHmmss.json' */
function buildExportFileName(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        throw err('now', '参数必须为有效 Date 对象');
    }
    return 'habits_' + date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
        '_' + pad2(date.getHours()) + pad2(date.getMinutes()) + pad2(date.getSeconds()) + '.json';
}

/* 历史最长连续自然日 */
function computeLongestStreak(checkins) {
    assertCheckins(checkins);
    var keys = Object.keys(checkins).filter(function (k) {
        return parseDateKey(k) && checkins[k];
    }).sort();
    var best = 0, cur = 0, prev = null;
    keys.forEach(function (k) {
        if (prev !== null && addDays(parseDateKey(prev), 1) === k) { cur++; }
        else { cur = 1; }
        if (cur > best) best = cur;
        prev = k;
    });
    return best;
}

var API = {
    toggleCheckIn: toggleCheckIn,
    computeStreak: computeStreak,
    buildWeekMatrix: buildWeekMatrix,
    computeStats: computeStats,
    parseImport: parseImport,
    buildExportFileName: buildExportFileName,
    computeLongestStreak: computeLongestStreak
};

/* ================= 浏览器 UI ================= */

var LS_KEY = 'habit_tracker_v1';

var state = {
    habits: [],      // [{id, name, target, checkins}]
    activeId: null,
    viewY: null,     // 日历视图年月
    viewM: null
};

function $(id) { return document.getElementById(id); }

function localTodayKey() {
    var d = new Date();
    return dateKeyOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/* 本周一日期键（周一起算） */
function mondayKey(key) {
    var p = parseDateKey(key);
    var dt = new Date(p.y, p.mo - 1, p.d);
    var dow = dt.getDay(); // 0=周日
    var back = dow === 0 ? 6 : dow - 1;
    return addDays(p, -back);
}

function newId() {
    return 'h' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function loadStore() {
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return { habits: [], activeId: null };
        var data = API.parseImport(raw);
        return {
            habits: data.habits.map(function (h) {
                return { id: newId(), name: h.name, target: h.target, checkins: h.checkins };
            }),
            activeId: null
        };
    } catch (e) {
        return { habits: [], activeId: null };
    }
}

function saveStore() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            habits: state.habits.map(function (h) {
                return { name: h.name, target: h.target, checkins: h.checkins };
            })
        }));
    } catch (e) { /* 配额不足等：静默，页面仍可用 */ }
}

function activeHabit() {
    for (var i = 0; i < state.habits.length; i++) {
        if (state.habits[i].id === state.activeId) return state.habits[i];
    }
    return null;
}

function toast(msg) {
    var el = $('ht-toast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, 2200);
}

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 每周目标解析："每周≥5次"/"每周5次" -> 5，"每天" -> 7，其他 -> null */
function weeklyGoal(target) {
    var m = /每周\s*≥?\s*(\d+)\s*次?/.exec(String(target || ''));
    if (m) return +m[1];
    if (String(target || '').trim() === '每天') return 7;
    return null;
}

/* ---------- 渲染 ---------- */

function renderHabits() {
    var box = $('ht-habit-list');
    if (state.habits.length === 0) {
        box.innerHTML = '<div class="ht-empty">还没有习惯。上面输入名称与周期目标，点「添加习惯」开始。</div>';
        return;
    }
    var html = state.habits.map(function (h) {
        var total = Object.keys(h.checkins).filter(function (k) { return h.checkins[k]; }).length;
        var cls = h.id === state.activeId ? 'ht-habit active' : 'ht-habit';
        return '<div class="' + cls + '" data-id="' + esc(h.id) + '">' +
            '<div class="ht-habit-main" data-act="select" title="切换到此习惯">' +
            '<div class="ht-habit-name">' + esc(h.name) + '</div>' +
            '<div class="ht-habit-meta">' + esc(h.target) + ' · 累计打卡 ' + total + ' 天</div>' +
            '</div>' +
            '<div class="ht-habit-ops">' +
            '<button class="ht-mini-btn" data-act="edit">编辑</button>' +
            '<button class="ht-mini-btn danger" data-act="del">删除</button>' +
            '</div></div>';
    }).join('');
    box.innerHTML = html;
    var nodes = box.querySelectorAll('.ht-habit');
    for (var i = 0; i < nodes.length; i++) {
        (function (node) {
            node.addEventListener('click', function (ev) {
                var act = ev.target.getAttribute('data-act');
                var id = node.getAttribute('data-id');
                if (act === 'edit') { editHabit(id); }
                else if (act === 'del') { delHabit(id); }
                else { state.activeId = id; renderAll(); }
            });
        })(nodes[i]);
    }
}

function renderCalendar() {
    var y = state.viewY, m = state.viewM;
    $('ht-cal-title').textContent = y + ' 年 ' + m + ' 月';
    var habit = activeHabit();
    var checkins = habit ? habit.checkins : {};
    var first = new Date(y, m - 1, 1);
    var lead = (first.getDay() + 6) % 7; // 周一=0
    var dim = new Date(y, m, 0).getDate();
    var todayKey = localTodayKey();
    var html = ['一', '二', '三', '四', '五', '六', '日'].map(function (w) {
        return '<div class="ht-cal-wd">' + w + '</div>';
    }).join('');
    for (var b = 0; b < lead; b++) html += '<div class="ht-cal-blank"></div>';
    for (var d = 1; d <= dim; d++) {
        var key = dateKeyOf(y, m, d);
        var cls = 'ht-cal-day' + (checkins[key] ? ' checked' : '') + (key === todayKey ? ' today' : '');
        html += '<div class="' + cls + '" data-key="' + key + '" title="' + key + '（点击打卡/取消）">' +
            '<span class="ht-cal-num">' + d + '</span>' +
            (checkins[key] ? '<span class="ht-cal-dot">✓</span>' : '') + '</div>';
    }
    $('ht-cal-grid').innerHTML = html;
    var nodes = $('ht-cal-grid').querySelectorAll('.ht-cal-day');
    for (var i = 0; i < nodes.length; i++) {
        (function (node) {
            node.addEventListener('click', function () {
                var h = activeHabit();
                if (!h) { toast('先添加一个习惯再打卡'); return; }
                h.checkins = API.toggleCheckIn(h.checkins, node.getAttribute('data-key'));
                saveStore();
                renderAll();
            });
        })(nodes[i]);
    }
}

function renderStats() {
    var habit = activeHabit();
    var box = $('ht-stats'), weekBox = $('ht-week');
    if (!habit) {
        box.innerHTML = '<div class="ht-empty">添加习惯后，这里会显示连续打卡天数、最长连续、本周完成率与累计打卡。</div>';
        weekBox.innerHTML = '';
        return;
    }
    var today = localTodayKey();
    var streak = API.computeStreak(habit.checkins, today);
    var longest = API.computeLongestStreak(habit.checkins);
    var mk = mondayKey(today);
    var sk = addDays(parseDateKey(mk), 6);
    var ws = API.computeStats(habit.checkins, mk, sk);
    var total = Object.keys(habit.checkins).filter(function (k) { return habit.checkins[k]; }).length;
    var goal = weeklyGoal(habit.target);
    var goalHtml = goal === null ? '' :
        '<div class="ht-stat"><div class="ht-stat-num">' + ws.total + '<span class="ht-stat-sub">/' + goal + '</span></div>' +
        '<div class="ht-stat-label">本周目标（' + esc(habit.target) + '）</div></div>';
    box.innerHTML =
        '<div class="ht-stat"><div class="ht-stat-num ht-c-streak">' + streak + '</div><div class="ht-stat-label">当前连续天数</div></div>' +
        '<div class="ht-stat"><div class="ht-stat-num">' + longest + '</div><div class="ht-stat-label">最长连续天数</div></div>' +
        '<div class="ht-stat"><div class="ht-stat-num ht-c-rate">' + (ws.rate * 100).toFixed(1) + '<span class="ht-stat-sub">%</span></div><div class="ht-stat-label">本周完成率（' + ws.total + '/' + ws.days + '）</div></div>' +
        '<div class="ht-stat"><div class="ht-stat-num">' + total + '</div><div class="ht-stat-label">累计打卡天数</div></div>' +
        goalHtml;
    var matrix = API.buildWeekMatrix(habit.checkins, mk);
    var names = ['一', '二', '三', '四', '五', '六', '日'];
    weekBox.innerHTML = '<div class="ht-week-title">本周（' + mk + ' ~ ' + sk + '）</div>' +
        '<div class="ht-week-row">' + matrix.map(function (cell, i) {
            var cls = 'ht-week-cell' + (cell.checked ? ' checked' : '') + (cell.key === today ? ' today' : '');
            return '<div class="' + cls + '" title="' + cell.key + '"><div class="ht-week-wd">' + names[i] +
                '</div><div class="ht-week-d">' + cell.key.slice(8) + '</div>' +
                '<div class="ht-week-m">' + (cell.checked ? '✓' : '·') + '</div></div>';
        }).join('') + '</div>' +
        '<div class="ht-info">连续天数按连续自然日口径：当天未打卡则从昨天起算，断档一天即重置。</div>';
}

function renderAll() {
    renderHabits();
    renderCalendar();
    renderStats();
}

/* ---------- 操作 ---------- */

function addHabit() {
    var name = $('ht-new-name').value.trim();
    var target = $('ht-new-target').value.trim() || '每天';
    if (!name) { toast('请先输入习惯名称'); $('ht-new-name').focus(); return; }
    var h = { id: newId(), name: name, target: target, checkins: {} };
    state.habits.push(h);
    state.activeId = h.id;
    $('ht-new-name').value = '';
    saveStore();
    renderAll();
    toast('已添加习惯「' + name + '」');
}

function editHabit(id) {
    for (var i = 0; i < state.habits.length; i++) {
        if (state.habits[i].id === id) {
            var h = state.habits[i];
            var name = prompt('习惯名称：', h.name);
            if (name === null) return;
            name = name.trim();
            if (!name) { toast('名称不能为空'); return; }
            var target = prompt('周期目标（如：每天 / 每周≥5次）：', h.target);
            if (target === null) return;
            target = target.trim() || '每天';
            h.name = name;
            h.target = target;
            saveStore();
            renderAll();
            toast('已更新习惯');
            return;
        }
    }
}

function delHabit(id) {
    for (var i = 0; i < state.habits.length; i++) {
        if (state.habits[i].id === id) {
            if (!confirm('确定删除习惯「' + state.habits[i].name + '」吗？它的全部打卡记录也会被删掉。')) return;
            state.habits.splice(i, 1);
            if (state.activeId === id) state.activeId = state.habits.length ? state.habits[0].id : null;
            saveStore();
            renderAll();
            toast('已删除');
            return;
        }
    }
}

function exportJSON() {
    if (state.habits.length === 0) { toast('没有可导出的数据'); return; }
    var payload = JSON.stringify({
        habits: state.habits.map(function (h) {
            return { name: h.name, target: h.target, checkins: h.checkins };
        })
    });
    var fname;
    try { fname = API.buildExportFileName(new Date()); }
    catch (e) { fname = 'habits_backup.json'; }
    var blob = new Blob([payload], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
    }, 500);
    toast('已导出 ' + fname);
}

function importFile(file) {
    var rd = new FileReader();
    rd.onload = function () {
        var data;
        try {
            data = API.parseImport(rd.result);
        } catch (e) {
            toast('导入失败：' + e.message + '（字段 ' + (e.field || '?') + '）');
            return;
        }
        if (data.habits.length === 0) { toast('文件里没有可导入的习惯'); return; }
        if (!confirm('将导入 ' + data.habits.length + ' 个习惯（追加到现有列表），继续吗？')) return;
        data.habits.forEach(function (h) {
            state.habits.push({ id: newId(), name: h.name, target: h.target, checkins: h.checkins });
        });
        if (!state.activeId) state.activeId = state.habits[0].id;
        saveStore();
        renderAll();
        toast('已导入 ' + data.habits.length + ' 个习惯');
    };
    rd.onerror = function () { toast('读取文件失败'); };
    rd.readAsText(file, 'utf-8');
}

function shiftMonth(delta) {
    var d = new Date(state.viewY, state.viewM - 1 + delta, 1);
    state.viewY = d.getFullYear();
    state.viewM = d.getMonth() + 1;
    renderCalendar();
}

function bindUI() {
    $('ht-add-habit').addEventListener('click', addHabit);
    $('ht-new-name').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') addHabit();
    });
    $('ht-cal-prev').addEventListener('click', function () { shiftMonth(-1); });
    $('ht-cal-next').addEventListener('click', function () { shiftMonth(1); });
    $('ht-cal-today').addEventListener('click', function () {
        var t = new Date();
        state.viewY = t.getFullYear();
        state.viewM = t.getMonth() + 1;
        renderCalendar();
    });
    $('ht-export').addEventListener('click', exportJSON);
    $('ht-import-file').addEventListener('change', function (ev) {
        if (ev.target.files && ev.target.files[0]) importFile(ev.target.files[0]);
        ev.target.value = '';
    });
    $('ht-sample').addEventListener('click', function () {
        if (!confirm('载入 3 个示例习惯（含部分打卡记录）吗？')) return;
        var demo = API.parseImport(JSON.stringify({
            habits: [
                { name: '早起', target: '每天', checkins: {} },
                { name: '跑步', target: '每周≥3次', checkins: {} },
                { name: '阅读30分钟', target: '每周≥5次', checkins: {} }
            ]
        }));
        demo.habits.forEach(function (h) {
            state.habits.push({ id: newId(), name: h.name, target: h.target, checkins: h.checkins });
        });
        if (!state.activeId) state.activeId = state.habits[0].id;
        saveStore();
        renderAll();
        toast('已载入示例习惯');
    });
}

function init() {
    var st = loadStore();
    state.habits = st.habits;
    state.activeId = st.activeId || (st.habits.length ? st.habits[0].id : null);
    var now = new Date();
    state.viewY = now.getFullYear();
    state.viewM = now.getMonth() + 1;
    bindUI();
    renderAll();
}

if (typeof window !== 'undefined') {
    window.HabitTracker = API;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else { init(); }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

})();

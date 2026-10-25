/* Cron 表达式生成器（cron_generator）- 纯前端零上传
 * 标准 Unix 五段式（分 时 日 月 周），不承诺 Quartz 方言。
 * 字段模式：每单位（星号）/ 步长（星号/N）/ 指定值多选（逗号列表）/ 范围（起-止）。
 * 日与周同时受限按 crontab 并集（OR）口径推算与描述。
 * 周日 0 与 7 等价，生成统一输出 0。
 * 本文件不发起任何 fetch / XHR，不加载任何 CDN 资源。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 *   node tests/cron_generator.test.js
 */
(function () {
'use strict';

/* ---------- 字段取值范围（分 时 日 月 周） ---------- */
var FIELDS = [
    { key: 'minute', label: '分钟', min: 0, max: 59 },
    { key: 'hour',   label: '小时', min: 0, max: 23 },
    { key: 'dom',    label: '日',   min: 1, max: 31 },
    { key: 'month',  label: '月',   min: 1, max: 12 },
    { key: 'dow',    label: '周',   min: 0, max: 7 }
];
var FIELD_MAP = {};
FIELDS.forEach(function (f) { FIELD_MAP[f.key] = f; });

var WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/* 周日归一：7 即 0 */
function normDow(v) { return v === 7 ? 0 : v; }
function normValue(key, v) { return key === 'dow' ? normDow(v) : v; }

function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }

/* ---------- 默认状态（锁定默认：每分钟 * * * * *） ---------- */
function defaultState() {
    var s = {};
    FIELDS.forEach(function (f) {
        s[f.key] = { mode: 'every', step: 1, values: [], from: f.min, to: f.max };
    });
    return s;
}

/* 深拷贝一段状态（预设载入后仍可再改，互不串改） */
function cloneState(s) {
    var out = {};
    FIELDS.forEach(function (f) {
        var v = s[f.key] || {};
        out[f.key] = {
            mode: v.mode || 'every',
            step: v.step,
            values: (v.values || []).slice(),
            from: v.from, to: v.to
        };
    });
    return out;
}

/* 字段状态快捷构造（供预设与测试使用） */
function fieldState(mode, opts) {
    opts = opts || {};
    return {
        mode: mode,
        step: opts.step !== undefined ? opts.step : 1,
        values: (opts.values || []).slice(),
        from: opts.from, to: opts.to
    };
}

/* ---------- 预设（载入后控件、表达式、描述、预览四者同步，可再改） ---------- */
var CG_PRESETS = {
    every_minute:   { label: '每分钟',       expr: '* * * * *' },
    every_5_min:    { label: '每 5 分钟',    expr: '*/5 * * * *' },
    hourly:         { label: '每小时整点',   expr: '0 * * * *' },
    daily_0930:     { label: '每天 09:30',   expr: '30 9 * * *' },
    weekly_mon_0930:{ label: '每周一 09:30', expr: '30 9 * * 1' },
    monthly_1_0930: { label: '每月 1 号 09:30', expr: '30 9 1 * *' },
    weekday_0900:   { label: '工作日 09:00', expr: '0 9 * * 1-5' }
};

/* 把五段表达式解析成字段状态（仅供预设载入；解析器互链走 /tools/cron-parser） */
function stateFromExpr(expr) {
    var parts = String(expr).trim().split(/\s+/);
    var s = defaultState();
    if (parts.length !== 5) return s;
    FIELDS.forEach(function (f, i) {
        var p = parts[i];
        var st = s[f.key];
        if (p === '*') { st.mode = 'every'; return; }
        if (p.indexOf('*/') === 0) {
            st.mode = 'step'; st.step = parseInt(p.slice(2), 10); return;
        }
        if (p.indexOf('-') !== -1 && p.indexOf(',') === -1) {
            var r = p.split('-');
            st.mode = 'range';
            st.from = normValue(f.key, parseInt(r[0], 10));
            st.to = normValue(f.key, parseInt(r[1], 10));
            return;
        }
        st.mode = 'list';
        st.values = p.split(',').map(function (x) { return normValue(f.key, parseInt(x, 10)); });
    });
    return s;
}

function applyPreset(name) {
    var p = CG_PRESETS[name];
    if (!p) return defaultState();
    return stateFromExpr(p.expr);
}

/* ---------- 字段校验与拼接 ---------- */
function validateField(key, st) {
    var f = FIELD_MAP[key];
    if (!st) return '缺少' + f.label + '字段状态';
    if (st.mode === 'every') return null;
    if (st.mode === 'step') {
        if (!isInt(st.step)) return f.label + '步长必须是整数';
        if (st.step === 0) return f.label + '步长不能为 0';
        if (st.step < 0) return f.label + '步长不能为负数';
        return null;
    }
    if (st.mode === 'list') {
        if (!st.values || st.values.length === 0) return f.label + '请至少选择一个值';
        for (var i = 0; i < st.values.length; i++) {
            var v = normValue(key, st.values[i]);
            if (!isInt(v)) return f.label + '指定值必须是整数';
            if (key === 'dow') { if (v < 0 || v > 6) return f.label + '指定值超出范围（0–7，周日 0 与 7 等价）'; }
            else if (v < f.min || v > f.max) return f.label + '指定值 ' + v + ' 超出范围（' + f.min + '–' + f.max + '）';
        }
        return null;
    }
    if (st.mode === 'range') {
        if (!isInt(st.from) || !isInt(st.to)) return f.label + '范围起止必须是整数';
        var lo = normValue(key, st.from), hi = normValue(key, st.to);
        if (key === 'dow') {
            if (lo < 0 || lo > 6 || hi < 0 || hi > 6) return f.label + '范围超出（0–7，周日 0 与 7 等价）';
        } else if (lo < f.min || lo > f.max || hi < f.min || hi > f.max) {
            return f.label + '范围超出（' + f.min + '–' + f.max + '）';
        }
        if (lo > hi) return f.label + '范围起始值不能大于结束值';
        return null;
    }
    return f.label + '未知模式';
}

function buildField(key, st) {
    var err = validateField(key, st);
    if (err) return { expr: null, error: err };
    if (st.mode === 'every') return { expr: '*', error: null };
    if (st.mode === 'step') return { expr: '*/' + st.step, error: null };
    if (st.mode === 'list') {
        var vals = [];
        st.values.forEach(function (v) {
            v = normValue(key, v);
            if (vals.indexOf(v) === -1) vals.push(v);
        });
        vals.sort(function (a, b) { return a - b; });
        return { expr: vals.join(','), error: null };
    }
    var lo = normValue(key, st.from), hi = normValue(key, st.to);
    if (lo === hi) return { expr: String(lo), error: null };
    return { expr: lo + '-' + hi, error: null };
}

/* 整条表达式：任一字段非法则不输出误导性表达式 */
function buildExpression(state) {
    var parts = [], errors = [];
    FIELDS.forEach(function (f) {
        var r = buildField(f.key, state[f.key]);
        if (r.error) errors.push(r.error); else parts.push(r.expr);
    });
    if (errors.length) return { expr: null, errors: errors };
    return { expr: parts.join(' '), errors: [] };
}

/* ---------- 字段取值集合（供推算用；* 展开为全量） ---------- */
function fieldValues(key, st) {
    var f = FIELD_MAP[key], out = [], i;
    if (!st || st.mode === 'every') {
        for (i = f.min; i <= f.max; i++) out.push(normValue(key, i));
        if (key === 'dow') out = [0, 1, 2, 3, 4, 5, 6];
        return out;
    }
    if (st.mode === 'step') {
        for (i = f.min; i <= f.max; i++) {
            if ((i - f.min) % st.step === 0) out.push(normValue(key, i));
        }
        if (key === 'dow') {
            var seen = {};
            out = out.filter(function (v) { if (seen[v]) return false; seen[v] = true; return true; });
        }
        return out;
    }
    if (st.mode === 'list') {
        st.values.forEach(function (v) {
            v = normValue(key, v);
            if (out.indexOf(v) === -1) out.push(v);
        });
        return out.sort(function (a, b) { return a - b; });
    }
    for (i = normValue(key, st.from); i <= normValue(key, st.to); i++) out.push(i);
    return out;
}
function isRestricted(st) { return !!st && st.mode !== 'every'; }

/* ---------- 中文说人话描述 ---------- */
function pad2(n) { return (n < 10 ? '0' : '') + n; }

function describeField(key, st) {
    if (!st || st.mode === 'every') return null;
    if (st.mode === 'step') {
        var unit = { minute: '分钟', hour: '小时', dom: '天', month: '个月', dow: '周' }[key];
        return '每 ' + st.step + ' ' + unit;
    }
    if (st.mode === 'list') {
        var vals = fieldValues(key, st);
        if (key === 'dow') return '每周' + vals.map(function (v) { return WEEK_NAMES[v].slice(1); }).join('、');
        if (key === 'dom') return '每月 ' + vals.join('、') + ' 号';
        if (key === 'month') return '每年 ' + vals.join('、') + ' 月';
        if (key === 'minute') return '第 ' + vals.join('、') + ' 分钟';
        if (key === 'hour') return vals.map(function (v) { return pad2(v) + ' 点'; }).join('、');
    }
    if (st.mode === 'range') {
        var lo = normValue(key, st.from), hi = normValue(key, st.to);
        if (key === 'dow') return '每周' + WEEK_NAMES[lo].slice(1) + '至' + WEEK_NAMES[hi];
        if (key === 'dom') return '每月 ' + lo + '–' + hi + ' 号';
        if (key === 'month') return '每年 ' + lo + '–' + hi + ' 月';
        if (key === 'minute') return '第 ' + lo + '–' + hi + ' 分钟';
        if (key === 'hour') return pad2(lo) + '–' + pad2(hi) + ' 点';
    }
    return null;
}

function describe(state) {
    var built = buildExpression(state);
    if (built.errors.length) return null;
    var m = state.minute, h = state.hour, dom = state.dom, mo = state.month, dow = state.dow;
    var allEvery = FIELDS.every(function (f) { return !isRestricted(state[f.key]); });
    if (allEvery) return '每分钟执行';

    /* 时间部分 */
    var timeStr;
    if (m.mode === 'step' && !isRestricted(h)) {
        timeStr = '每 ' + m.step + ' 分钟';
    } else if (m.mode === 'every' && h.mode === 'every') {
        timeStr = '每分钟';
    } else if (m.mode !== 'every' && m.mode !== 'step' && h.mode !== 'every' && h.mode !== 'step'
        && fieldValues('minute', m).length === 1 && fieldValues('hour', h).length === 1) {
        timeStr = pad2(fieldValues('hour', h)[0]) + ':' + pad2(fieldValues('minute', m)[0]);
    } else if (m.mode === 'step' && isRestricted(h)) {
        timeStr = describeField('hour', h) + '每 ' + m.step + ' 分钟';
    } else {
        var tp = [];
        if (isRestricted(h)) tp.push(describeField('hour', h));
        if (isRestricted(m)) tp.push(describeField('minute', m));
        if (!tp.length) tp.push('每分钟');
        timeStr = tp.join('的');
    }

    /* 日期部分：日与周同时受限 = 并集（OR），绝不写成交集 */
    var dateParts = [];
    if (isRestricted(mo)) dateParts.push(describeField('month', mo));
    var domR = isRestricted(dom), dowR = isRestricted(dow);
    if (domR && dowR) {
        dateParts.push(describeField('dom', dom) + '和' + describeField('dow', dow));
    } else if (domR) {
        dateParts.push(describeField('dom', dom));
    } else if (dowR) {
        dateParts.push(describeField('dow', dow));
    }
    var orNote = (domR && dowR) ? '（任一满足即执行）' : '';
    if (!dateParts.length) {
        /* 只有时间受限：默认每天 */
        return '每天 ' + timeStr + '执行';
    }
    return dateParts.join('') + ' ' + timeStr + '执行' + orNote;
}

/* ---------- 下次执行时间推算（浏览器本地时区，OR 口径） ---------- */
function daysInMonth(year, month) { /* month 1-12 */
    return new Date(year, month, 0).getDate();
}

/* 仅日受限时：该日月组合在闰年/平年是否都不可能出现 */
function domNeverPossible(state) {
    var domVals = fieldValues('dom', state.dom);
    var moVals = fieldValues('month', state.month);
    for (var mi = 0; mi < moVals.length; mi++) {
        var mo = moVals[mi];
        /* 闰年 2 月 29 天、平年 28 天，其余月份固定 */
        var maxDay = (mo === 2) ? 29 : daysInMonth(2025, mo);
        for (var di = 0; di < domVals.length; di++) {
            if (domVals[di] <= maxDay) return false;
        }
    }
    return true;
}

function matchesDate(state, d) {
    var moVals = fieldValues('month', state.month);
    if (moVals.indexOf(d.getMonth() + 1) === -1) return false;
    if (fieldValues('hour', state.hour).indexOf(d.getHours()) === -1) return false;
    if (fieldValues('minute', state.minute).indexOf(d.getMinutes()) === -1) return false;
    var domR = isRestricted(state.dom), dowR = isRestricted(state.dow);
    var domOk = fieldValues('dom', state.dom).indexOf(d.getDate()) !== -1;
    var dowOk = fieldValues('dow', state.dow).indexOf(d.getDay()) !== -1;
    if (domR && dowR) return domOk || dowOk; /* crontab 并集 */
    if (domR) return domOk;
    if (dowR) return dowOk;
    return true;
}

function nextRuns(state, fromDate, count) {
    count = count || 5;
    var built = buildExpression(state);
    if (built.errors.length) return { runs: [], never: false, errors: built.errors };
    /* 日受限且周不受限时先做不存在组合判定，避免空转 5 年 */
    if (isRestricted(state.dom) && !isRestricted(state.dow) && domNeverPossible(state)) {
        return { runs: [], never: true, errors: [] };
    }
    var runs = [];
    var cursor = new Date(fromDate.getTime());
    cursor.setSeconds(0, 0);
    cursor = new Date(cursor.getTime() + 60000); /* 严格晚于当前时间 */
    var limit = new Date(fromDate.getTime() + 366 * 5 * 24 * 3600 * 1000 + 86400000);
    while (runs.length < count && cursor <= limit) {
        if (matchesDate(state, cursor)) runs.push(new Date(cursor.getTime()));
        cursor = new Date(cursor.getTime() + 60000);
    }
    if (!runs.length) return { runs: [], never: true, errors: [] };
    return { runs: runs, never: false, errors: [] };
}

function formatRun(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
        pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' ' + WEEK_NAMES[d.getDay()];
}

/* ---------- 浏览器 DOM 绑定 ---------- */
function bindPage() {
    if (typeof document === 'undefined') return;
    var $ = function (id) { return document.getElementById(id); };
    var state = defaultState();
    var toastTimer = null;
    function toast(msg) {
        var t = $('cg-toast'); if (!t) return;
        t.textContent = msg; t.className = 'show';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.className = ''; }, 2600);
    }
    /* 渲染 chips 与范围控件 */
    FIELDS.forEach(function (f) {
        var chips = $('cg-chips-' + f.key);
        if (!chips) return;
        var vals = [];
        if (f.key === 'dow') vals = [1, 2, 3, 4, 5, 6, 0];
        else for (var v = f.min; v <= f.max; v++) vals.push(v);
        vals.forEach(function (v) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'cg-chip'; b.dataset.value = v;
            b.textContent = f.key === 'dow' ? WEEK_NAMES[v] : String(v);
            b.addEventListener('click', function () {
                var st = state[f.key];
                var idx = st.values.indexOf(v);
                if (idx === -1) st.values.push(v); else st.values.splice(idx, 1);
                if (st.mode !== 'list') {
                    st.mode = 'list';
                    var r = document.querySelector('input[name="cg-mode-' + f.key + '"][value="list"]');
                    if (r) r.checked = true;
                }
                syncControls(); render();
            });
            chips.appendChild(b);
        });
    });
    function readControls() {
        FIELDS.forEach(function (f) {
            var modeEl = document.querySelector('input[name="cg-mode-' + f.key + '"]:checked');
            if (modeEl) state[f.key].mode = modeEl.value;
            var stepEl = $('cg-step-' + f.key);
            if (stepEl && stepEl.value !== '') state[f.key].step = parseInt(stepEl.value, 10);
            var fromEl = $('cg-from-' + f.key), toEl = $('cg-to-' + f.key);
            if (fromEl && fromEl.value !== '') state[f.key].from = parseInt(fromEl.value, 10);
            if (toEl && toEl.value !== '') state[f.key].to = parseInt(toEl.value, 10);
        });
    }
    function syncControls() {
        FIELDS.forEach(function (f) {
            var st = state[f.key];
            var r = document.querySelector('input[name="cg-mode-' + f.key + '"][value="' + st.mode + '"]');
            if (r) r.checked = true;
            var stepEl = $('cg-step-' + f.key); if (stepEl) stepEl.value = st.step;
            var fromEl = $('cg-from-' + f.key); if (fromEl) fromEl.value = st.from;
            var toEl = $('cg-to-' + f.key); if (toEl) toEl.value = st.to;
            var chips = $('cg-chips-' + f.key);
            if (chips) Array.prototype.forEach.call(chips.children, function (c) {
                var v = parseInt(c.dataset.value, 10);
                c.classList.toggle('on', st.values.indexOf(v) !== -1 ||
                    (f.key === 'dow' && v === 0 && st.values.indexOf(7) !== -1));
            });
        });
    }
    function render() {
        readControls();
        var built = buildExpression(state);
        var exprEl = $('cg-expr'), descEl = $('cg-desc'), errEl = $('cg-errors'), nextEl = $('cg-next');
        if (built.errors.length) {
            if (exprEl) exprEl.textContent = '—';
            if (descEl) descEl.textContent = '—';
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = built.errors.join('；'); }
            if (nextEl) nextEl.innerHTML = '<li>请先修正上方错误。</li>';
            return;
        }
        if (errEl) errEl.style.display = 'none';
        if (exprEl) exprEl.textContent = built.expr;
        if (descEl) descEl.textContent = describe(state) || '—';
        var res = nextRuns(state, new Date(), 5);
        if (nextEl) {
            if (res.never) {
                nextEl.innerHTML = '<li class="cg-never">该组合在任何年份都不会执行（例如不存在的日期，如 2 月 30 日），请调整日或月。</li>';
            } else {
                nextEl.innerHTML = res.runs.map(function (d) { return '<li>' + formatRun(d) + '</li>'; }).join('');
            }
        }
    }
    document.querySelectorAll('input[name^="cg-mode-"], input[id^="cg-step-"], input[id^="cg-from-"], input[id^="cg-to-"]')
        .forEach(function (el) { el.addEventListener('change', render); el.addEventListener('input', render); });
    document.querySelectorAll('[data-cg-preset]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            state = applyPreset(btn.dataset.cgPreset);
            syncControls(); render();
            toast('已载入预设：' + btn.textContent.trim() + '，可继续修改');
        });
    });
    var resetBtn = $('cg-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
        state = defaultState(); syncControls(); render(); toast('已重置为默认状态（每分钟）');
    });
    var copyBtn = $('cg-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
        var built = buildExpression(state);
        if (!built.expr) { toast('当前表达式有误，无法复制'); return; }
        var done = function () { toast('已复制：' + built.expr); };
        var fallback = function () {
            var ta = document.createElement('textarea');
            ta.value = built.expr; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); }
            catch (e) { toast('复制失败：请手动选中上方表达式，按 Ctrl+C 复制'); }
            document.body.removeChild(ta);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(built.expr).then(done).catch(fallback);
        } else fallback();
    });
    syncControls(); render();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
    else bindPage();
}

var api = {
    FIELDS: FIELDS, WEEK_NAMES: WEEK_NAMES, CG_PRESETS: CG_PRESETS,
    normDow: normDow, defaultState: defaultState, cloneState: cloneState,
    fieldState: fieldState, applyPreset: applyPreset, stateFromExpr: stateFromExpr,
    validateField: validateField, buildField: buildField, buildExpression: buildExpression,
    fieldValues: fieldValues, isRestricted: isRestricted,
    describe: describe, describeField: describeField,
    nextRuns: nextRuns, formatRun: formatRun, matchesDate: matchesDate,
    domNeverPossible: domNeverPossible
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CronGenerator = api;
})();

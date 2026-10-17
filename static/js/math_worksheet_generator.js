/* 算术题生成器：纯前端随机出题引擎 + A4 练习纸渲染 + 打印控制 */
(function () {
'use strict';

function $(id) { return document.getElementById(id); }
function ri(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

var PRESETS = {
    g1:       { name: '一年级 · 20以内加减', type: 'addsub',   min: 0,  max: 20,  carry: true, borrow: true },
    g2:       { name: '二年级 · 100以内加减', type: 'addsub',   min: 0,  max: 100, carry: true, borrow: true },
    muldiv:   { name: '表内乘除',             type: 'muldiv' },
    mixed:    { name: '混合四则',             type: 'mixed',    min: 1,  max: 50 },
    deshi:    { name: '脱式计算',             type: 'deshi',    min: 1,  max: 100 },
    vertical: { name: '竖式计算',             type: 'vertical', min: 10, max: 99,  carry: true, borrow: true }
};
var TITLES = { addsub: '口算天天练', muldiv: '口算天天练', mixed: '混合运算练习', deshi: '脱式计算练习', vertical: '竖式计算练习' };

var state = { preset: 'g2', count: 100, questions: [], dupNote: '' };

/* ---------- 读取参数 ---------- */
function readOpts() {
    var p = PRESETS[state.preset];
    var o = { type: p.type, presetName: p.name };
    var mn = parseInt($('mwg-min').value, 10), mx = parseInt($('mwg-max').value, 10);
    if (isNaN(mn)) mn = p.min !== undefined ? p.min : 0;
    if (isNaN(mx)) mx = p.max !== undefined ? p.max : 100;
    if (mn > mx) { var t = mn; mn = mx; mx = t; }
    mn = Math.max(0, mn); mx = Math.min(9999, Math.max(1, mx));
    o.min = mn; o.max = mx;
    o.carry = $('mwg-carry').checked;
    o.borrow = $('mwg-borrow').checked;
    o.bracket = $('mwg-bracket').checked;
    o.mulmix = $('mwg-mulmix').checked;
    o.incMul = $('mwg-inc-mul').checked;
    o.incDiv = $('mwg-inc-div').checked;
    return o;
}

/* ---------- 出题器 ---------- */
function calc2(a, op, b) {
    if (op === '+') return a + b;
    if (op === '-') return a - b;
    if (op === '×') return a * b;
    if (op === '÷') return b === 0 ? null : a / b;
    return null;
}
function sym(op) { return op; }

/* 加减法口算 */
function makeAddSub(o) {
    var a = ri(o.min, o.max), b = ri(o.min, o.max);
    var op = Math.random() < 0.5 ? '+' : '-';
    var v;
    if (op === '+') {
        v = a + b;
        if (v > o.max) return null;
        if (!o.carry && (a % 10 + b % 10) >= 10) return null; // 不进位
    } else {
        if (a < b) { var t = a; a = b; b = t; }
        v = a - b;
        if (!o.borrow && (a % 10 < b % 10)) return null; // 不退位
    }
    var e = a + ' ' + op + ' ' + b;
    return { text: e + ' =', answer: String(v), key: e, kind: 'line', op: op };
}

/* 表内乘除：除法保证整商 */
function makeMulDiv(o) {
    var ops = [];
    if (o.incMul) ops.push('×');
    if (o.incDiv) ops.push('÷');
    if (!ops.length) ops.push('×');
    var op = pick(ops);
    var a, b, v, e;
    if (op === '×') {
        a = ri(1, 9); b = ri(1, 9); v = a * b;
        e = a + ' × ' + b;
    } else {
        b = ri(1, 9); v = ri(1, 9); a = b * v; // 被除数=除数×商，整商
        e = a + ' ÷ ' + b;
    }
    return { text: e + ' =', answer: String(v), key: e, kind: 'line', op: op };
}

/* 混合四则：a op1 b op2 c，按标准优先级求值 */
function evalMixed(a, op1, b, op2, c) {
    if (op2 === '×') { var r = calc2(b, '×', c); return r === null ? null : calc2(a, op1, r); }
    if (op1 === '×') { var l = calc2(a, '×', b); return l === null ? null : calc2(l, op2, c); }
    var m = calc2(a, op1, b);
    if (m === null || m < 0) return null; // 混合四则不允许负的中间值（与脱式计算一致）
    return calc2(m, op2, c);
}
function makeMixed(o) {
    var ops = ['+', '-'];
    if (o.mulmix) ops.push('×');
    var a = ri(o.min, o.max), b = ri(o.min, o.max), c = ri(1, Math.min(9, o.max));
    var op1 = pick(ops), op2 = pick(ops);
    var e, v;
    if (o.bracket && Math.random() < 0.55) {
        if (Math.random() < 0.5) { // (a op1 b) op2 c
            var inner = calc2(a, op1, b);
            if (inner === null || inner < 0 || inner > 999) return null;
            v = calc2(inner, op2, c);
            e = '(' + a + ' ' + sym(op1) + ' ' + b + ') ' + sym(op2) + ' ' + c;
        } else { // a op1 (b op2 c)
            var inner2 = calc2(b, op2, c);
            if (inner2 === null || inner2 < 0 || inner2 > 999) return null;
            v = calc2(a, op1, inner2);
            e = a + ' ' + sym(op1) + ' (' + b + ' ' + sym(op2) + ' ' + c + ')';
        }
    } else {
        v = evalMixed(a, op1, b, op2, c);
        e = a + ' ' + sym(op1) + ' ' + b + ' ' + sym(op2) + ' ' + c;
    }
    if (v === null || v < 0 || v > 999 || v % 1 !== 0) return null;
    return { text: e + ' =', answer: String(v), key: e, kind: 'line', op: 'mix' };
}

/* 脱式计算：3~4 个数，支持括号与乘除；除法在 pair 层面改写保证整商 */
function makeDeshi(o) {
    var ops = ['+', '-'];
    if (o.mulmix) { ops.push('×'); ops.push('÷'); }
    var n = ri(3, 4);
    var vals = [], opList = [], k;
    for (var i = 0; i < n; i++) vals.push(ri(o.min, o.max));
    for (var j = 0; j < n - 1; j++) opList.push(pick(ops));
    // 除法整商：把 "a ÷ b" 改写为 "(d*q) ÷ d"
    for (k = 0; k < opList.length; k++) {
        if (opList[k] === '÷') {
            var d = ri(2, 9), q = ri(1, 9);
            vals[k] = d * q;
            vals[k + 1] = d;
        }
    }
    var tokens = [String(vals[0])];
    for (k = 0; k < opList.length; k++) { tokens.push(sym(opList[k])); tokens.push(String(vals[k + 1])); }
    var evalVals = vals.slice(), evalOps = opList.slice();
    if (o.bracket && Math.random() < 0.5) {
        if (Math.random() < 0.5) { // 给前两个数加括号
            var iv = calc2(evalVals[0], evalOps[0], evalVals[1]);
            if (iv === null || iv < 0 || iv % 1 !== 0) return null;
            tokens.splice(0, 3, '(' + tokens[0] + ' ' + tokens[1] + ' ' + tokens[2] + ')');
            evalVals = [iv].concat(evalVals.slice(2));
            evalOps = evalOps.slice(1);
        } else { // 给后两个数加括号
            var L = tokens.length;
            var jv = calc2(evalVals[n - 2], evalOps[n - 2], evalVals[n - 1]);
            if (jv === null || jv < 0 || jv % 1 !== 0) return null;
            tokens.splice(L - 3, 3, '(' + tokens[L - 3] + ' ' + tokens[L - 2] + ' ' + tokens[L - 1] + ')');
            evalVals = evalVals.slice(0, n - 2).concat([jv]);
            evalOps = evalOps.slice(0, n - 2);
        }
    }
    var expr = tokens.join(' ');
    var v = evalTokens(evalVals, evalOps);
    if (v === null || v < 0 || v > 99999 || v % 1 !== 0) return null;
    return { text: expr + ' =', answer: String(v), key: expr, kind: 'deshi', op: 'deshi' };
}
/* 按先乘除后加减求值（无括号 token 版） */
function evalTokens(vals, ops) {
    var v = vals.slice(), o = ops.slice();
    var i = 0;
    while (i < o.length) {
        if (o[i] === '×' || o[i] === '÷') {
            var r = calc2(v[i], o[i], v[i + 1]);
            if (r === null || r % 1 !== 0 || r < 0) return null;
            v.splice(i, 2, r); o.splice(i, 1);
        } else i++;
    }
    var acc = v[0];
    for (var j = 0; j < o.length; j++) {
        acc = calc2(acc, o[j], v[j + 1]);
        if (acc === null || acc < 0) return null;
    }
    return acc;
}

/* 竖式计算：加减乘，数位对齐 */
function makeVertical(o) {
    var op = pick(['+', '-', '×']);
    var a, b, v;
    if (op === '×') {
        a = ri(Math.max(10, o.min), Math.max(99, o.max)); b = ri(2, 9);
        v = a * b;
    } else {
        a = ri(o.min, o.max); b = ri(o.min, o.max);
        if (op === '+') {
            v = a + b;
            if (v > o.max * 2) return null;
            if (!o.carry && (a % 10 + b % 10) >= 10) return null;
        } else {
            if (a < b) { var t = a; a = b; b = t; }
            v = a - b;
            if (!o.borrow && (a % 10 < b % 10)) return null;
        }
    }
    var s1 = String(a), s2 = String(b);
    var w = Math.max(s1.length, s2.length) + 1; // 左侧留一列写运算符号
    function cells(str, sign) {
        var arr = [], i;
        for (i = 0; i < w; i++) arr.push('');
        var ch = str.split('');
        for (i = 0; i < ch.length; i++) arr[w - 1 - i] = ch[ch.length - 1 - i];
        if (sign) arr[0] = sign;
        return arr;
    }
    var sign = op === '+' ? '+' : (op === '-' ? '−' : '×');
    var e = a + ' ' + op + ' ' + b;
    return { text: e + ' =', answer: String(v), key: e, kind: 'vert', op: op,
             vrows: [cells(s1, ''), cells(s2, sign)] };
}

var MAKERS = { addsub: makeAddSub, muldiv: makeMulDiv, mixed: makeMixed, deshi: makeDeshi, vertical: makeVertical };

/* 去重生成 */
function generate(o, count) {
    var make = MAKERS[o.type];
    var out = [], seen = {}, guard = 0, maxGuard = count * 60;
    while (out.length < count && guard < maxGuard) {
        guard++;
        var q = make(o);
        if (!q) continue;
        if (seen[q.key]) continue;
        seen[q.key] = 1;
        out.push(q);
    }
    var dup = 0;
    guard = 0;
    while (out.length < count && guard < count * 20) { // 题库耗尽时允许重复补足
        guard++;
        var q2 = make(o);
        if (!q2) continue;
        out.push(q2); dup++;
    }
    return { list: out, dup: dup };
}

/* ---------- 渲染 ---------- */
function renderQuestion(q, idx) {
    var n = idx + 1;
    if (q.kind === 'vert') {
        var rows = q.vrows.map(function (r) {
            return '<div class="mwg-vr">' + r.map(function (c) {
                return '<span class="mwg-vc">' + esc(c) + '</span>';
            }).join('') + '</div>';
        }).join('');
        var w = q.vrows[0].length;
        var blank = '<div class="mwg-vr mwg-vblank">';
        for (var i = 0; i < w; i++) blank += '<span class="mwg-vc"></span>';
        blank += '</div>';
        return '<div class="mwg-v"><span class="mwg-vnum">' + n + '.</span>' +
               '<div class="mwg-vg">' + rows + '<div class="mwg-vline"></div>' + blank + '</div></div>';
    }
    return '<div class="mwg-q"><span class="mwg-qnum">' + n + '.</span>' +
           '<span class="mwg-qexpr">' + esc(q.text) + '</span></div>';
}
function renderAnswer(q, idx) {
    var n = idx + 1;
    if (q.kind === 'vert') {
        return '<div class="mwg-q"><span class="mwg-qnum">' + n + '.</span>' +
               '<span class="mwg-qexpr">' + esc(q.text.replace(' =', '')) + ' = ' + esc(q.answer) + '</span></div>';
    }
    return '<div class="mwg-q"><span class="mwg-qnum">' + n + '.</span>' +
           '<span class="mwg-qexpr">' + esc(q.text) + ' ' + esc(q.answer) + '</span></div>';
}

function doGenerate() {
    var o = readOpts();
    var btn = $('mwg-generate');
    btn.disabled = true;
    $('mwg-status').textContent = '出题中…';
    setTimeout(function () {
        var r = generate(o, state.count);
        state.questions = r.list;
        state.type = o.type;
        state.presetName = o.presetName;
        state.count = r.list.length;
        var dupNote = r.dup > 0 ? '（题库组合有限，含 ' + r.dup + ' 道重复题）' : '';
        state.dupNote = dupNote;
        // 练习纸
        $('mwg-empty').style.display = 'none';
        $('mwg-paper').style.display = '';
        $('mwg-answer-paper').style.display = '';
        $('mwg-title').textContent = TITLES[o.type] || '口算天天练';
        var d = new Date();
        var dateStr = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
        $('mwg-paper-sub').textContent = o.presetName + ' · 共 ' + r.list.length + ' 题' + dupNote + ' · ' + dateStr;
        var qs = $('mwg-questions');
        qs.className = 'mwg-qs' + (o.type === 'deshi' ? ' cols2' : '');
        qs.innerHTML = r.list.map(renderQuestion).join('');
        // 答案页
        $('mwg-answer-sub').textContent = o.presetName + ' · 共 ' + r.list.length + ' 题 · 供家长批改使用，请勿提前给孩子看';
        var an = $('mwg-answers');
        an.className = 'mwg-qs' + (o.type === 'deshi' ? ' cols2' : '');
        an.innerHTML = r.list.map(renderAnswer).join('');
        // 统计
        var tally = {};
        r.list.forEach(function (q) { tally[q.op] = (tally[q.op] || 0) + 1; });
        var parts = [];
        Object.keys(tally).forEach(function (k) { parts.push(k + ' ' + tally[k] + ' 题'); });
        $('mwg-status').textContent = '已生成 ' + r.list.length + ' 题：' + parts.join(' / ') + dupNote;
        ['mwg-regen', 'mwg-copy', 'mwg-print'].forEach(function (id) { $(id).disabled = false; });
        btn.disabled = false;
    }, 30);
}

/* ---------- 复制 ---------- */
function copyText() {
    if (!state.questions.length) return;
    var d = new Date();
    var lines = ['小学数学练习题 · ' + state.presetName + '（共 ' + state.questions.length + ' 题 · ' +
                 d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '）', ''];
    state.questions.forEach(function (q, i) {
        lines.push((i + 1) + '. ' + q.text);
    });
    var txt = lines.join('\n');
    function done(ok) {
        $('mwg-status').textContent = ok ? '题目文本已复制，可粘贴到微信/备忘录（' + state.questions.length + ' 题）'
                                         : '复制失败，请手动选择练习纸文字复制';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); });
    } else {
        var ta = document.createElement('textarea');
        ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { done(document.execCommand('copy')); } catch (e) { done(false); }
        document.body.removeChild(ta);
    }
}

/* ---------- 打印模式 ---------- */
function setMode(mode) {
    document.body.classList.remove('mwg-mode-both', 'mwg-mode-practice', 'mwg-mode-answer');
    document.body.classList.add('mwg-mode-' + mode);
    var modes = $('mwg-modes').querySelectorAll('.mwg-mode');
    modes.forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-mode') === mode); });
}

/* ---------- 预设/选项联动 ---------- */
function selectPreset(key) {
    state.preset = key;
    var p = PRESETS[key];
    var els = $('mwg-presets').querySelectorAll('.mwg-preset');
    els.forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-preset') === key); });
    if (p.type === 'muldiv') {
        $('mwg-row-range').style.display = 'none';
        $('mwg-row-muldivnote').style.display = '';
    } else {
        $('mwg-row-range').style.display = '';
        $('mwg-row-muldivnote').style.display = 'none';
        if (p.min !== undefined) { $('mwg-min').value = p.min; $('mwg-max').value = p.max; }
    }
    var showCarry = (p.type === 'addsub' || p.type === 'vertical');
    $('mwg-row-carry').style.display = showCarry ? '' : 'none';
    if (showCarry) { $('mwg-carry').checked = !!p.carry; $('mwg-borrow').checked = !!p.borrow; }
    var showBracket = (p.type === 'mixed' || p.type === 'deshi');
    $('mwg-row-bracket').style.display = showBracket ? '' : 'none';
    $('mwg-row-mdop').style.display = (p.type === 'muldiv') ? '' : 'none';
    // 脱式默认不含乘除，混合默认含乘
    if (p.type === 'deshi') { $('mwg-bracket').checked = false; $('mwg-mulmix').checked = false; }
    if (p.type === 'mixed') { $('mwg-mulmix').checked = true; }
    $('mwg-check-mulmix').style.display = (p.type === 'mixed' || p.type === 'deshi') ? '' : 'none';
}
function selectCount(n) {
    state.count = n;
    var els = $('mwg-counts').querySelectorAll('.mwg-count');
    els.forEach(function (el) { el.classList.toggle('on', parseInt(el.getAttribute('data-count'), 10) === n); });
}
function bindChips(containerId, attr, fn) {
    var box = $(containerId);
    box.addEventListener('click', function (e) {
        var t = e.target.closest('[' + attr + ']');
        if (t) fn(t.getAttribute(attr));
    });
    box.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            var t = e.target.closest('[' + attr + ']');
            if (t) { e.preventDefault(); fn(t.getAttribute(attr)); }
        }
    });
}

/* ---------- 初始化 ---------- */
function sampleFill() {
    selectPreset('g2');
    selectCount(100);
    setMode('both');
    doGenerate();
}

document.addEventListener('DOMContentLoaded', function () {
    bindChips('mwg-presets', 'data-preset', selectPreset);
    bindChips('mwg-counts', 'data-count', function (v) { selectCount(parseInt(v, 10)); });
    bindChips('mwg-modes', 'data-mode', setMode);
    selectPreset('g2');
    selectCount(100);
    setMode('both');
    $('mwg-generate').addEventListener('click', doGenerate);
    $('mwg-regen').addEventListener('click', doGenerate);
    $('mwg-sample').addEventListener('click', sampleFill);
    $('mwg-copy').addEventListener('click', copyText);
    $('mwg-print').addEventListener('click', function () { window.print(); });
});

})();

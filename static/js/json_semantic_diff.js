/* JSON 语义化对比器 — 纯前端递归结构 diff 引擎（零依赖、零后端、零上传） */
(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };
var taA = $('jsd-a'), taB = $('jsd-b');
var errA = $('jsd-err-a'), errB = $('jsd-err-b');
var statusBox = $('jsd-status'), diffList = $('jsd-difflist');
var diffCount = $('jsd-diffcount'), paneA = $('jsd-pane-a'), paneB = $('jsd-pane-b');
var resultWrap = $('jsd-result');
var onlyDiff = false, lastDiffs = [];

/* ---------- 类型与 JSONPath ---------- */
function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v; // object | string | number | boolean
}
function isIdKey(k) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k); }
function joinPath(path, key) {
    return isIdKey(key) ? path + '.' + key : path + '[' + JSON.stringify(key) + ']';
}
var TYPE_ZH = { 'null': 'null', 'boolean': '布尔', 'number': '数字', 'string': '字符串', 'array': '数组', 'object': '对象' };

/* ---------- 中文语法错误（含行列） ---------- */
function errPos(text, pos) {
    var upto = text.slice(0, Math.max(0, Math.min(pos, text.length)));
    var lines = upto.split('\n');
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}
function zhError(msg) {
    if (/Unexpected end of JSON input/.test(msg)) return 'JSON 不完整：内容意外结束，可能是少了右括号/右引号，或引号没有闭合';
    if (/Unexpected token/.test(msg)) return 'JSON 语法错误：此处不应该出现该符号，请检查逗号、引号、括号是否配对';
    if (/Unexpected non-whitespace/.test(msg)) return 'JSON 语法错误：值后面有多余的字符（一个 JSON 文本只能有一个顶层值）';
    if (/Bad control character/.test(msg)) return 'JSON 语法错误：字符串中出现了未转义的控制字符（如换行需写成 \\n）';
    if (/is not valid JSON/.test(msg)) return 'JSON 语法错误：此处出现了非法符号，请检查逗号、引号、括号';
    return 'JSON 解析失败：' + msg;
}
function parseJSON(text, sideName) {
    if (!text.trim()) return { ok: false, empty: true };
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (e) {
        var msg = (e && e.message) || String(e);
        var m = /at position (\d+)/.exec(msg) || /position (\d+)/i.exec(msg);
        var line = 1, col = 1;
        if (m) { var p = errPos(text, parseInt(m[1], 10)); line = p.line; col = p.col; }
        return { ok: false, error: sideName + '侧 JSON 语法错误（第 ' + line + ' 行，第 ' + col + ' 列）：' + zhError(msg) };
    }
}

/* ---------- 递归结构 diff ---------- */
function diffValues(a, b, path, out) {
    var ta = typeOf(a), tb = typeOf(b);
    if (ta !== tb) { out.push({ path: path, kind: 'type', a: a, b: b }); return; }
    if (ta === 'object') {
        var keys = {};
        Object.keys(a).forEach(function (k) { keys[k] = 1; });
        Object.keys(b).forEach(function (k) { keys[k] = 1; });
        Object.keys(keys).forEach(function (k) {
            var p = joinPath(path, k);
            var ha = Object.prototype.hasOwnProperty.call(a, k);
            var hb = Object.prototype.hasOwnProperty.call(b, k);
            if (!ha) out.push({ path: p, kind: 'added', b: b[k] });
            else if (!hb) out.push({ path: p, kind: 'removed', a: a[k] });
            else diffValues(a[k], b[k], p, out);
        });
        return;
    }
    if (ta === 'array') {
        var n = Math.max(a.length, b.length);
        for (var i = 0; i < n; i++) {
            var p = path + '[' + i + ']';
            if (i >= a.length) out.push({ path: p, kind: 'added', b: b[i] });
            else if (i >= b.length) out.push({ path: p, kind: 'removed', a: a[i] });
            else diffValues(a[i], b[i], p, out);
        }
        return;
    }
    if (a !== b) out.push({ path: path, kind: 'modified', a: a, b: b });
}

/* ---------- pretty 渲染（逐行带 JSONPath） ---------- */
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function ind(n) { return new Array(n * 2 + 1).join(' '); }
function buildLines(v, path, lines, depth) {
    var t = typeOf(v), pad = ind(depth);
    if (t === 'object') {
        var keys = Object.keys(v);
        if (!keys.length) { lines.push({ path: path, text: pad + '{}' }); return; }
        lines.push({ path: path, text: pad + '{' });
        keys.forEach(function (k, i) {
            var p = joinPath(path, k), vv = v[k], tv = typeOf(vv);
            var comma = i < keys.length - 1 ? ',' : '';
            var kp = ind(depth + 1) + esc(JSON.stringify(k)) + ': ';
            if (tv === 'object' || tv === 'array') {
                lines.push({ path: p, text: kp + (tv === 'object' ? '{' : '[') });
                buildChildren(vv, p, lines, depth + 1);
                lines.push({ path: p, text: ind(depth + 1) + (tv === 'object' ? '}' : ']') + comma });
            } else {
                lines.push({ path: p, text: kp + esc(JSON.stringify(vv)) + comma });
            }
        });
        lines.push({ path: path, text: pad + '}' });
    } else if (t === 'array') {
        if (!v.length) { lines.push({ path: path, text: pad + '[]' }); return; }
        lines.push({ path: path, text: pad + '[' });
        v.forEach(function (vv, i) {
            var p = path + '[' + i + ']', tv = typeOf(vv);
            var comma = i < v.length - 1 ? ',' : '';
            if (tv === 'object' || tv === 'array') {
                lines.push({ path: p, text: ind(depth + 1) + (tv === 'object' ? '{' : '[') });
                buildChildren(vv, p, lines, depth + 1);
                lines.push({ path: p, text: ind(depth + 1) + (tv === 'object' ? '}' : ']') + comma });
            } else {
                lines.push({ path: p, text: ind(depth + 1) + esc(JSON.stringify(vv)) + comma });
            }
        });
        lines.push({ path: path, text: pad + ']' });
    } else {
        lines.push({ path: path, text: pad + esc(JSON.stringify(v)) });
    }
}
function buildChildren(v, path, lines, depth) {
    var t = typeOf(v), pad = ind(depth);
    if (t === 'object') {
        var keys = Object.keys(v);
        keys.forEach(function (k, i) {
            var p = joinPath(path, k), vv = v[k], tv = typeOf(vv);
            var comma = i < keys.length - 1 ? ',' : '';
            var kp = pad + esc(JSON.stringify(k)) + ': ';
            if (tv === 'object' || tv === 'array') {
                lines.push({ path: p, text: kp + (tv === 'object' ? '{' : '[') });
                buildChildren(vv, p, lines, depth + 1);
                lines.push({ path: p, text: pad + (tv === 'object' ? '}' : ']') + comma });
            } else {
                lines.push({ path: p, text: kp + esc(JSON.stringify(vv)) + comma });
            }
        });
    } else {
        v.forEach(function (vv, i) {
            var p = path + '[' + i + ']', tv = typeOf(vv);
            var comma = i < v.length - 1 ? ',' : '';
            if (tv === 'object' || tv === 'array') {
                lines.push({ path: p, text: pad + (tv === 'object' ? '{' : '[') });
                buildChildren(vv, p, lines, depth + 1);
                lines.push({ path: p, text: pad + (tv === 'object' ? '}' : ']') + comma });
            } else {
                lines.push({ path: p, text: pad + esc(JSON.stringify(vv)) + comma });
            }
        });
    }
}

/* ---------- 差异分类应用到行 ---------- */
function isPrefix(path, diffPath) {
    return diffPath !== path && (diffPath.indexOf(path + '.') === 0 || diffPath.indexOf(path + '[') === 0);
}
function lineClass(path, diffMap, diffPaths) {
    var exact = diffMap[path];
    if (exact) return 'd-' + exact;
    for (var i = 0; i < diffPaths.length; i++) {
        if (isPrefix(path, diffPaths[i])) return 'd-' + diffMap[diffPaths[i]];
        if (isPrefix(diffPaths[i], path)) return 'd-ancestor';
    }
    return '';
}
function renderPane(container, value, diffMap, diffPaths, side) {
    var lines = [];
    buildLines(value, '$', lines, 0);
    var html = lines.map(function (ln, idx) {
        var cls = lineClass(ln.path, diffMap, diffPaths);
        return '<div class="jsd-line' + (cls ? ' ' + cls : '') + '" data-path="' + esc(ln.path) +
            '" data-side="' + side + '"><span class="jsd-ln">' + (idx + 1) + '</span><span class="jsd-lt">' +
            ln.text + '</span></div>';
    }).join('');
    container.innerHTML = html;
}

/* ---------- 值摘要 ---------- */
function valSummary(v) {
    var t = typeOf(v);
    if (t === 'object') return '对象（' + Object.keys(v).length + ' 个键）';
    if (t === 'array') return '数组（' + v.length + ' 项）';
    if (t === 'string') {
        var s = JSON.stringify(v);
        return s.length > 120 ? s.slice(0, 120) + '…' : s;
    }
    return JSON.stringify(v);
}
var KIND_ZH = { added: '新增', removed: '删除', modified: '修改', type: '类型变化' };

function diffDetail(d) {
    if (d.kind === 'added') return '<span class="jsd-na">—</span> → <code>' + esc(valSummary(d.b)) + '</code>';
    if (d.kind === 'removed') return '<code>' + esc(valSummary(d.a)) + '</code> → <span class="jsd-na">—</span>';
    if (d.kind === 'modified') return '<code>' + esc(valSummary(d.a)) + '</code> → <code>' + esc(valSummary(d.b)) + '</code>';
    return '<code>' + esc(valSummary(d.a)) + '</code>（' + TYPE_ZH[typeOf(d.a)] + '） → <code>' +
        esc(valSummary(d.b)) + '</code>（' + TYPE_ZH[typeOf(d.b)] + '）';
}

/* ---------- 主流程 ---------- */
function setErr(ta, box, res) {
    if (res.ok || res.empty) {
        ta.classList.remove('jsd-syntax-err');
        box.style.display = 'none'; box.textContent = '';
    } else {
        ta.classList.add('jsd-syntax-err');
        box.style.display = 'block'; box.textContent = res.error;
    }
}
function compare() {
    var ra = parseJSON(taA.value, '左'), rb = parseJSON(taB.value, '右');
    setErr(taA, errA, ra); setErr(taB, errB, rb);
    if (ra.empty && rb.empty) {
        statusBox.className = 'jsd-status jsd-idle';
        statusBox.textContent = '在左右两栏粘贴 JSON 后自动开始对比（键顺序、缩进、空白差异会被自动忽略）';
        resultWrap.style.display = 'none';
        return;
    }
    if (!ra.ok || !rb.ok) {
        statusBox.className = 'jsd-status jsd-syntax';
        statusBox.textContent = '⚠️ 有一侧 JSON 存在语法错误，修正后会自动重新对比';
        resultWrap.style.display = 'none';
        return;
    }
    var diffs = [];
    diffValues(ra.value, rb.value, '$', diffs);
    lastDiffs = diffs;
    var counts = { added: 0, removed: 0, modified: 0, type: 0 };
    diffs.forEach(function (d) { counts[d.kind]++; });

    if (!diffs.length) {
        statusBox.className = 'jsd-status jsd-ok';
        statusBox.innerHTML = '✅ <b>两份 JSON 在语义上完全一致</b> —— 键顺序、缩进、换行等文本差异已被自动忽略';
    } else {
        statusBox.className = 'jsd-status jsd-diff';
        statusBox.innerHTML = '共 <b>' + diffs.length + '</b> 处差异：' +
            '<span class="jsd-dot d-added"></span>新增 ' + counts.added +
            '　<span class="jsd-dot d-removed"></span>删除 ' + counts.removed +
            '　<span class="jsd-dot d-modified"></span>修改 ' + counts.modified +
            '　<span class="jsd-dot d-type"></span>类型变化 ' + counts.type;
    }
    diffCount.textContent = diffs.length;
    renderDiffList(diffs);

    var diffMap = {}, paths = [];
    diffs.forEach(function (d) { diffMap[d.path] = d.kind; paths.push(d.path); });
    renderPane(paneA, ra.value, diffMap, paths, 'left');
    renderPane(paneB, rb.value, diffMap, paths, 'right');
    resultWrap.style.display = '';
    applyOnlyDiff();
}
function renderDiffList(diffs) {
    if (!diffs.length) { diffList.innerHTML = '<div class="jsd-none">无差异 —— 两份 JSON 语义完全相同 🎉</div>'; return; }
    diffList.innerHTML = diffs.map(function (d, i) {
        return '<button type="button" class="jsd-item d-' + d.kind + '" data-path="' + esc(d.path) + '">' +
            '<span class="jsd-no">' + (i + 1) + '</span>' +
            '<span class="jsd-body"><span class="jsd-path">' + esc(d.path) + '</span>' +
            '<span class="jsd-desc"><span class="jsd-kind">' + KIND_ZH[d.kind] + '</span>' + diffDetail(d) + '</span></span></button>';
    }).join('');
    var items = diffList.querySelectorAll('.jsd-item');
    Array.prototype.forEach.call(items, function (btn) {
        btn.addEventListener('click', function () { jumpTo(btn.getAttribute('data-path')); });
    });
}
function jumpTo(path) {
    ['jsd-pane-a', 'jsd-pane-b'].forEach(function (pid) {
        var pane = $(pid);
        var el = pane.querySelector('.jsd-line[data-path="' + path.replace(/"/g, '\\"') + '"]');
        if (el) {
            pane.scrollTop = Math.max(0, el.offsetTop - pane.clientHeight / 2);
            el.classList.add('jsd-flash');
            setTimeout(function () { el.classList.remove('jsd-flash'); }, 1400);
        }
    });
}
function applyOnlyDiff() {
    resultWrap.classList.toggle('jsd-only-diff', onlyDiff);
    $('jsd-filter').textContent = onlyDiff ? '👁️ 显示全部' : '🔍 仅看差异';
    $('jsd-filter').classList.toggle('jsd-on', onlyDiff);
}

/* ---------- 示例 ---------- */
var SAMPLE_A = '{\n  "code": 200,\n  "message": "ok",\n  "data": {\n    "user": {\n      "id": 1024,\n      "name": "张三",\n      "email": "zhangsan@example.com",\n      "tags": ["vip", "new"],\n      "profile": { "age": 28, "city": "深圳" }\n    },\n    "items": [\n      { "sku": "A001", "price": 199.9, "stock": 30 },\n      { "sku": "A002", "price": "99.9", "stock": 0 }\n    ],\n    "total": 2\n  }\n}';
var SAMPLE_B = '{\n    "message": "ok",\n    "code": 200,\n    "data": {\n        "items": [\n            { "price": 199.9, "sku": "A001", "stock": 25 },\n            { "sku": "A002", "price": 99.9, "stock": 0, "discount": true },\n            { "sku": "A003", "price": 49, "stock": 100 }\n        ],\n        "user": {\n            "tags": ["vip", "new", "beta"],\n            "name": "张三",\n            "id": 1024,\n            "profile": { "city": "深圳", "age": 29 }\n        },\n        "page": 1\n    }\n}';

/* ---------- 事件 ---------- */
var timer = null;
function schedule() {
    clearTimeout(timer);
    timer = setTimeout(compare, 500);
}
taA.addEventListener('input', schedule);
taB.addEventListener('input', schedule);
taA.addEventListener('keydown', function (e) { if (e.ctrlKey && e.key === 'Enter') compare(); });
taB.addEventListener('keydown', function (e) { if (e.ctrlKey && e.key === 'Enter') compare(); });
$('jsd-compare').addEventListener('click', compare);
$('jsd-sample').addEventListener('click', function () {
    taA.value = SAMPLE_A; taB.value = SAMPLE_B; compare();
    window.scrollTo({ top: $('jsd-status').offsetTop - 80, behavior: 'smooth' });
});
$('jsd-clear').addEventListener('click', function () {
    taA.value = ''; taB.value = ''; lastDiffs = [];
    setErr(taA, errA, { ok: true }); setErr(taB, errB, { ok: true });
    compare();
});
$('jsd-filter').addEventListener('click', function () { onlyDiff = !onlyDiff; applyOnlyDiff(); });

compare();
})();

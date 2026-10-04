/* JSON 转 TypeScript / Go 结构体 - 纯前端递归类型推断
 * 本地处理，不上传服务器。 */
(function () {
'use strict';

function $(id) { return document.getElementById(id); }

function toast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 1800);
}

/* ---------- 命名 ---------- */
function pascalCase(str) {
    if (!str) return 'Field';
    var s = String(str).replace(/[^a-zA-Z0-9]+/g, ' ');
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    s = s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    var parts = s.split(/\s+/).filter(Boolean);
    var out = parts.map(function (p) {
        return p.charAt(0).toUpperCase() + p.slice(1);
    }).join('');
    if (!out) out = 'Field';
    if (/^[0-9]/.test(out)) out = 'N' + out;
    return out;
}
function sanitizeRootName(name) {
    var s = pascalCase((name || '').trim() || 'Root');
    return s || 'Root';
}

/* ---------- 类型推断 ---------- */
// Type node:
// {kind:'string'|'int'|'float'|'bool'|'null'|'unknown'}
// {kind:'object', fields:[{key, type, optional}]}
// {kind:'array', elem:type}
// {kind:'union', members:[type]}

function infer(value) {
    if (value === null) return { kind: 'null' };
    if (Array.isArray(value)) {
        if (value.length === 0) return { kind: 'array', elem: { kind: 'unknown' } };
        var merged = infer(value[0]);
        for (var i = 1; i < value.length; i++) merged = mergeTypes(merged, infer(value[i]));
        return { kind: 'array', elem: merged };
    }
    switch (typeof value) {
        case 'string': return { kind: 'string' };
        case 'boolean': return { kind: 'bool' };
        case 'number': return { kind: Number.isInteger(value) ? 'int' : 'float' };
        case 'object': {
            var fields = Object.keys(value).map(function (k) {
                return { key: k, type: infer(value[k]), optional: false };
            });
            return { kind: 'object', fields: fields };
        }
        default: return { kind: 'unknown' };
    }
}

function typeSignature(t) {
    if (!t) return 'unknown';
    if (t.kind === 'object') {
        return 'object{' + t.fields.map(function (f) {
            return f.key + (f.optional ? '?' : '') + ':' + typeSignature(f.type);
        }).join(',') + '}';
    }
    if (t.kind === 'array') return 'array<' + typeSignature(t.elem) + '>';
    if (t.kind === 'union') return 'union<' + t.members.map(typeSignature).join('|') + '>';
    return t.kind;
}

function cloneType(t) {
    if (t.kind === 'object') {
        return { kind: 'object', fields: t.fields.map(function (f) {
            return { key: f.key, type: cloneType(f.type), optional: f.optional };
        }) };
    }
    if (t.kind === 'array') return { kind: 'array', elem: cloneType(t.elem) };
    if (t.kind === 'union') return { kind: 'union', members: t.members.map(cloneType) };
    return { kind: t.kind };
}

function makeUnion(members) {
    var flat = [];
    members.forEach(function (m) {
        if (m.kind === 'union') flat.push.apply(flat, m.members);
        else flat.push(m);
    });
    // merge int+float into float
    var hasInt = flat.some(function (m) { return m.kind === 'int'; });
    var hasFloat = flat.some(function (m) { return m.kind === 'float'; });
    if (hasInt && hasFloat) {
        flat = flat.filter(function (m) { return m.kind !== 'int'; });
    }
    // dedup by signature
    var seen = {}, uniq = [];
    flat.forEach(function (m) {
        var sig = typeSignature(m);
        if (!seen[sig]) { seen[sig] = true; uniq.push(m); }
    });
    if (uniq.length === 1) return uniq[0];
    return { kind: 'union', members: uniq };
}

function mergeTypes(a, b) {
    if (typeSignature(a) === typeSignature(b)) return a;
    if (a.kind === 'unknown') return b;
    if (b.kind === 'unknown') return a;
    // int + float => float
    if ((a.kind === 'int' && b.kind === 'float') || (a.kind === 'float' && b.kind === 'int')) {
        return { kind: 'float' };
    }
    if (a.kind === 'object' && b.kind === 'object') {
        var fields = [], map = {};
        a.fields.forEach(function (f) {
            var nf = { key: f.key, type: cloneType(f.type), optional: f.optional };
            fields.push(nf); map[f.key] = nf;
        });
        b.fields.forEach(function (f) {
            if (map[f.key]) {
                map[f.key].type = mergeTypes(map[f.key].type, f.type);
            } else {
                var nf2 = { key: f.key, type: cloneType(f.type), optional: true };
                fields.push(nf2); map[f.key] = nf2;
            }
        });
        // fields present in a but not b => optional
        var bKeys = {};
        b.fields.forEach(function (f) { bKeys[f.key] = true; });
        fields.forEach(function (f) { if (!bKeys[f.key] && a.fields.some(function (x) { return x.key === f.key; })) f.optional = true; });
        return { kind: 'object', fields: fields };
    }
    if (a.kind === 'array' && b.kind === 'array') {
        return { kind: 'array', elem: mergeTypes(a.elem, b.elem) };
    }
    // union members: try to merge object/array members together
    var members = [];
    var push = function (t) { members.push(t); };
    (a.kind === 'union' ? a.members : [a]).forEach(push);
    (b.kind === 'union' ? b.members : [b]).forEach(function (t) {
        // merge into existing object / array member if possible
        for (var i = 0; i < members.length; i++) {
            if ((members[i].kind === 'object' && t.kind === 'object') ||
                (members[i].kind === 'array' && t.kind === 'array')) {
                members[i] = mergeTypes(members[i], t);
                return;
            }
            if ((members[i].kind === 'int' && t.kind === 'float') || (members[i].kind === 'float' && t.kind === 'int')) {
                members[i] = { kind: 'float' };
                return;
            }
        }
        members.push(t);
    });
    return makeUnion(members);
}

/* ---------- 收集对象定义（命名） ---------- */
function collectDefs(rootType, rootName) {
    var defs = [];          // [{name, node}]
    var nameByNode = new Map();
    var nameBySig = {};     // signature -> name (shape reuse)
    var usedNames = {};

    function uniqueName(base) {
        if (!usedNames[base]) { usedNames[base] = true; return base; }
        var i = 2;
        while (usedNames[base + i]) i++;
        usedNames[base + i] = true;
        return base + i;
    }

    function visit(type, suggested) {
        if (!type) return;
        if (type.kind === 'object') {
            if (nameByNode.has(type)) return;
            var name = uniqueName(suggested);
            nameByNode.set(type, name);
            defs.push({ name: name, node: type });
            type.fields.forEach(function (f) {
                visit(f.type, name + pascalCase(f.key));
            });
            return;
        }
        if (type.kind === 'array') {
            visit(type.elem, suggested + 'Item');
            return;
        }
        if (type.kind === 'union') {
            type.members.forEach(function (m) { visit(m, suggested); });
            return;
        }
    }

    visit(rootType, rootName);
    return { defs: defs, nameByNode: nameByNode };
}

/* ---------- 渲染 ---------- */
function renderTS(type, ctx) {
    switch (type.kind) {
        case 'string': return 'string';
        case 'int': case 'float': return 'number';
        case 'bool': return 'boolean';
        case 'null': return 'null';
        case 'unknown': return 'unknown';
        case 'object': return ctx.nameByNode.get(type) || 'Record<string, unknown>';
        case 'array': {
            var inner = renderTS(type.elem, ctx);
            return (type.elem.kind === 'union' ? '(' + inner + ')' : inner) + '[]';
        }
        case 'union': return type.members.map(function (m) { return renderTS(m, ctx); }).join(' | ');
        default: return 'unknown';
    }
}
function renderGo(type, ctx) {
    switch (type.kind) {
        case 'string': return 'string';
        case 'int': return 'int64';
        case 'float': return 'float64';
        case 'bool': return 'bool';
        case 'null': return 'interface{}';
        case 'unknown': return 'interface{}';
        case 'object': return ctx.nameByNode.get(type) || 'interface{}';
        case 'array': {
            if (type.elem.kind === 'union') return '[]interface{}';
            return '[]' + renderGo(type.elem, ctx);
        }
        case 'union': return 'interface{}';
        default: return 'interface{}';
    }
}

function isValidIdent(key) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key); }

function generateTS(rootType, rootName) {
    var ctx = collectDefs(rootType, rootName);
    var lines = [];
    if (rootType.kind === 'object') {
        ctx.defs.forEach(function (d) {
            lines.push('export interface ' + d.name + ' {');
            d.node.fields.forEach(function (f) {
                var key = isValidIdent(f.key) ? f.key : JSON.stringify(f.key);
                lines.push('  ' + key + (f.optional ? '?' : '') + ': ' + renderTS(f.type, ctx) + ';');
            });
            lines.push('}');
            lines.push('');
        });
    } else if (ctx.defs.length) {
        // root is array / union containing objects: emit object defs, then alias
        ctx.defs.forEach(function (d) {
            lines.push('export interface ' + d.name + ' {');
            d.node.fields.forEach(function (f) {
                var key = isValidIdent(f.key) ? f.key : JSON.stringify(f.key);
                lines.push('  ' + key + (f.optional ? '?' : '') + ': ' + renderTS(f.type, ctx) + ';');
            });
            lines.push('}');
            lines.push('');
        });
        lines.push('export type ' + rootName + ' = ' + renderTS(rootType, ctx) + ';');
    } else {
        lines.push('export type ' + rootName + ' = ' + renderTS(rootType, ctx) + ';');
    }
    return lines.join('\n').replace(/\n+$/, '') + '\n';
}

function generateGo(rootType, rootName) {
    var ctx = collectDefs(rootType, rootName);
    var lines = [];
    if (rootType.kind === 'object' || ctx.defs.length) {
        ctx.defs.forEach(function (d) {
            lines.push('type ' + d.name + ' struct {');
            var usedFieldNames = {};
            d.node.fields.forEach(function (f) {
                var base = pascalCase(f.key), fname = base, fi = 2;
                while (usedFieldNames[fname]) { fname = base + fi; fi++; }
                usedFieldNames[fname] = true;
                var tag = f.optional ? '`json:"' + f.key + ',omitempty"`' : '`json:"' + f.key + '"`';
                lines.push('\t' + fname + ' ' + renderGo(f.type, ctx) + ' ' + tag);
            });
            lines.push('}');
            lines.push('');
        });
        if (rootType.kind !== 'object') {
            lines.push('type ' + rootName + ' ' + renderGo(rootType, ctx));
        }
    } else {
        lines.push('type ' + rootName + ' ' + renderGo(rootType, ctx));
    }
    return lines.join('\n').replace(/\n+$/, '') + '\n';
}

/* ---------- 页面逻辑 ---------- */
var SAMPLE = {
    id: 1,
    name: '张三',
    active: true,
    score: 98.5,
    email: null,
    address: { city: '深圳', zip: '518000', street: '科技园南路' },
    tags: ['开发者', '开源'],
    orders: [
        { orderId: 'A001', amount: 199.9, paid: true },
        { orderId: 'A002', amount: 59 }
    ],
    mixed: [1, 'two', true],
    emptyList: [],
    matrix: [[1, 2], [3]]
};

var currentTab = 'ts';
var outputs = { ts: '', go: '' };
var debounceTimer = null;

function showError(msg) {
    var e = $('jtt-error');
    if (msg) { e.textContent = 'JSON 解析失败：' + msg; e.style.display = 'block'; }
    else { e.textContent = ''; e.style.display = 'none'; }
}
function setActiveTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.jtt-tab').forEach(function (b) {
        var active = b.getAttribute('data-tab') === tab;
        b.classList.toggle('active', active);
    });
    renderOutput();
}
function renderOutput() {
    $('jtt-output').textContent = outputs[currentTab] || '';
}
function generate() {
    var text = $('jtt-input').value;
    var rootName = sanitizeRootName($('jtt-root').value);
    if (!text.trim()) { outputs = { ts: '', go: '' }; showError(''); renderOutput(); return; }
    var data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        showError(e.message);
        return; // 不崩溃、不清屏：保留上一次输出
    }
    showError('');
    try {
        var rootType = infer(data);
        outputs.ts = generateTS(rootType, rootName);
        outputs.go = generateGo(rootType, rootName);
    } catch (e2) {
        showError(e2.message);
        return;
    }
    renderOutput();
}
function scheduleGenerate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generate, 300);
}

document.addEventListener('DOMContentLoaded', function () {
    $('jtt-input').addEventListener('input', scheduleGenerate);
    $('jtt-root').addEventListener('input', scheduleGenerate);
    document.querySelectorAll('.jtt-tab').forEach(function (b) {
        b.addEventListener('click', function () { setActiveTab(b.getAttribute('data-tab')); });
    });
    $('jtt-sample').addEventListener('click', function () {
        $('jtt-input').value = JSON.stringify(SAMPLE, null, 2);
        generate();
        toast('示例已载入');
    });
    $('jtt-format').addEventListener('click', function () {
        var text = $('jtt-input').value;
        if (!text.trim()) { toast('请先输入 JSON'); return; }
        try {
            $('jtt-input').value = JSON.stringify(JSON.parse(text), null, 2);
            showError('');
            generate();
        } catch (e) { showError(e.message); }
    });
    $('jtt-clear').addEventListener('click', function () {
        $('jtt-input').value = '';
        outputs = { ts: '', go: '' };
        showError('');
        renderOutput();
    });
    $('jtt-copy').addEventListener('click', function () {
        var v = outputs[currentTab];
        if (!v) { toast('没有可复制的内容'); return; }
        function done() { toast('已复制当前结果'); }
        function fail() { toast('复制失败，请手动复制'); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(v).then(done, fail);
        } else {
            var ta = document.createElement('textarea');
            ta.value = v; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { fail(); }
            document.body.removeChild(ta);
        }
    });
    $('jtt-download').addEventListener('click', function () {
        var v = outputs[currentTab];
        if (!v) { toast('没有可下载的内容'); return; }
        var rootName = sanitizeRootName($('jtt-root').value);
        var ext = currentTab === 'ts' ? 'ts' : 'go';
        var blob = new Blob([v], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = rootName.toLowerCase() + '.' + ext;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
    });
    generate();
});
})();

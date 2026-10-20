/* 正则表达式解释器 - 纯前端（零后端、零上传）
 *
 * 纯逻辑层（RE-CORE）：正则词法解析器、逐段中文解释、修饰符说明、引擎交叉校验 —— 无 DOM，可在 Node 下单测。
 * DOM 层：输入即时解析、错误定位、结构树可视化、Web Worker 安全匹配测试（3 秒熔断）。
 * 全部计算都在浏览器本地完成，正则与测试文本不上传服务器。
 */
(function () {
'use strict';

/* ================= 纯逻辑层 RE-CORE ================= */

/* 节点类型：
 * literal 字面字符 / dot 通配符 / anchor 锚点 / boundary 单词边界 /
 * escape-class 预定义字符类(\d\s\w) / escape 转义序列 / unicode-prop Unicode属性(\p{}) /
 * class 字符集[...] / group 分组 / quantified 量词包装 / backref 反向引用 /
 * named-backref 命名反向引用
 */

/* ---------- 词法解析器 ---------- */

function parseError(st, msg, pos) {
    st.errors.push({ message: msg, pos: (pos === undefined ? st.i : pos) });
}

function tokenize(pattern) {
    var st = { s: String(pattern), i: 0, errors: [], groupCount: 0 };
    var branches = parseAlternatives(st, 0);
    return { branches: branches, errors: st.errors, groupCount: st.groupCount };
}

function parseAlternatives(st, depth) {
    var branches = [];
    for (;;) {
        branches.push(parseSequence(st, depth));
        if (st.s[st.i] === '|') { st.i++; continue; }
        if (depth === 0 && st.s[st.i] === ')') {
            parseError(st, '多余的右括号「)」，没有与之匹配的左括号', st.i);
            st.i++;
            continue;
        }
        break;
    }
    return branches;
}

function parseSequence(st, depth) {
    var nodes = [];
    var s = st.s;
    while (st.i < s.length) {
        var ch = s[st.i];
        if (ch === ')' || ch === '|') break;
        var start = st.i;
        if (ch === '(') { nodes.push(parseGroup(st, depth)); }
        else if (ch === '[') { nodes.push(parseClass(st)); }
        else if (ch === '\\') { nodes.push(parseEscape(st, false)); }
        else if (ch === '^') { st.i++; nodes.push({ t: 'anchor', kind: 'start', raw: '^', start: start, end: st.i }); }
        else if (ch === '$') { st.i++; nodes.push({ t: 'anchor', kind: 'end', raw: '$', start: start, end: st.i }); }
        else if (ch === '.') { st.i++; nodes.push({ t: 'dot', raw: '.', start: start, end: st.i }); }
        else if (ch === '*' || ch === '+' || ch === '?') {
            var q = parseSimpleQuant(st, nodes, ch, start);
            if (q) nodes.push(q);
        }
        else if (ch === '{') {
            var bq = parseBraceQuant(st, nodes, start);
            if (bq) nodes.push(bq);
            else { st.i++; nodes.push({ t: 'literal', ch: '{', raw: '{', start: start, end: st.i }); }
        }
        else { st.i++; nodes.push({ t: 'literal', ch: ch, raw: ch, start: start, end: st.i }); }
    }
    return nodes;
}

/* * + ? 量词；若紧跟在已有的量词包装后且为 ?，则转为懒惰修饰 */
function parseSimpleQuant(st, nodes, ch, start) {
    if (nodes.length === 0) {
        parseError(st, '量词「' + ch + '」前面没有可量化的元素', start);
        st.i++;
        return { t: 'literal', ch: ch, raw: ch, start: start, end: st.i };
    }
    var prev = nodes[nodes.length - 1];
    if (prev.t === 'quantified' && !prev.lazy && ch === '?') {
        prev.lazy = true;
        prev.raw += '?';
        prev.end = st.i + 1;
        st.i++;
        return null;
    }
    st.i++;
    var lazy = false;
    if (st.s[st.i] === '?') { lazy = true; st.i++; }
    var atom = nodes.pop();
    var mm = ch === '*' ? [0, Infinity] : (ch === '+' ? [1, Infinity] : [0, 1]);
    return { t: 'quantified', atom: atom, min: mm[0], max: mm[1], lazy: lazy,
        raw: st.s.slice(atom.start, st.i), start: atom.start, end: st.i };
}

/* {n} {n,} {n,m} 量词；非法形式按字面量处理（与 JS 非 u 模式行为一致） */
function parseBraceQuant(st, nodes, start) {
    var m = /^\{(\d+)(?:,(\d*))?\}/.exec(st.s.slice(st.i));
    if (!m) return null;
    if (nodes.length === 0) {
        parseError(st, '量词「' + m[0] + '」前面没有可量化的元素', start);
        return null;
    }
    var n = parseInt(m[1], 10);
    var hasMax = m[0].indexOf(',') !== -1;
    var max = hasMax ? (m[2] === '' ? Infinity : parseInt(m[2], 10)) : n;
    if (hasMax && m[2] !== '' && n > max) return null; /* {2,1} 按字面量，引擎(u 模式)会报错 */
    st.i += m[0].length;
    var lazy = false;
    if (st.s[st.i] === '?') { lazy = true; st.i++; }
    var atom = nodes.pop();
    return { t: 'quantified', atom: atom, min: n, max: max, lazy: lazy,
        raw: st.s.slice(atom.start, st.i), start: atom.start, end: st.i };
}

function readName(st) {
    var m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(st.s.slice(st.i));
    if (!m) return null;
    st.i += m[0].length;
    if (st.s[st.i] !== '>') return null;
    st.i++;
    return m[0];
}

function parseGroup(st, depth) {
    var start = st.i; /* 位于 ( */
    st.i++;
    var kind = 'capturing', name = null, flags = null, pyStyle = false;
    if (st.s[st.i] === '?') {
        st.i++;
        var c = st.s[st.i];
        if (c === ':') { kind = 'non-capturing'; st.i++; }
        else if (c === '=') { kind = 'lookahead'; st.i++; }
        else if (c === '!') { kind = 'lookahead-neg'; st.i++; }
        else if (c === '<') {
            st.i++;
            var c2 = st.s[st.i];
            if (c2 === '=') { kind = 'lookbehind'; st.i++; }
            else if (c2 === '!') { kind = 'lookbehind-neg'; st.i++; }
            else {
                name = readName(st);
                if (name === null) {
                    parseError(st, '命名分组缺少合法名称，应为 (?<name>...) 形式', st.i);
                    kind = 'capturing';
                } else { kind = 'named'; }
            }
        }
        else if (c === 'P' && st.s[st.i + 1] === '<') {
            st.i += 2;
            name = readName(st);
            kind = 'named'; pyStyle = true;
            if (name === null) parseError(st, '命名分组缺少合法名称', st.i);
        }
        else if (c && /[a-z]/i.test(c)) {
            var fl = '';
            while (/[gimsuvy]/i.test(st.s[st.i] || '')) { fl += st.s[st.i]; st.i++; }
            if (fl === '') {
                parseError(st, '无法识别的分组语法「(?' + c + '」', start);
            } else if (st.s[st.i] === ')') {
                kind = 'flags-only'; flags = fl; st.i++;
                return { t: 'group', kind: kind, name: null, index: null, flags: flags,
                    branches: [[]], raw: st.s.slice(start, st.i), start: start, end: st.i };
            } else if (st.s[st.i] === ':') {
                kind = 'flags-group'; flags = fl; st.i++;
            } else {
                parseError(st, '内联修饰符后应为 ) 或 : ，如 (?i) 或 (?i:...)', st.i);
            }
        }
        else {
            parseError(st, '无法识别的分组语法「(?' + (c || '') + '」', start);
        }
    }
    var idx = null;
    if (kind === 'capturing' || kind === 'named') { st.groupCount++; idx = st.groupCount; }
    var branches = parseAlternatives(st, depth + 1);
    if (st.s[st.i] === ')') { st.i++; }
    else { parseError(st, '括号未闭合：第 ' + (start + 1) + ' 列的「(」缺少对应的「)」', start); }
    return { t: 'group', kind: kind, name: name, index: idx, flags: flags, py: pyStyle,
        branches: branches, raw: st.s.slice(start, st.i), start: start, end: st.i };
}

function parseClass(st) {
    var start = st.i; /* 位于 [ */
    st.i++;
    var neg = false;
    if (st.s[st.i] === '^') { neg = true; st.i++; }
    var singles = [], ranges = [], classes = [], posix = [];
    var first = true;
    for (;;) {
        if (st.i >= st.s.length) { parseError(st, '字符集「[」未闭合：第 ' + (start + 1) + ' 列缺少对应的「]」', start); break; }
        var ch = st.s[st.i];
        if (ch === ']' && !first) { st.i++; break; }
        first = false;
        var atomCh = null;
        if (ch === '\\') {
            var e = parseEscape(st, true);
            if (e.t === 'escape-class' || e.t === 'unicode-prop') { classes.push(e.raw); continue; }
            atomCh = (e.ch !== undefined ? e.ch : e.raw.charAt(e.raw.length - 1));
        } else if (ch === '[' && st.s.substr(st.i, 2) === '[:') {
            var pm = /^\[:([A-Za-z]+):\]/.exec(st.s.slice(st.i));
            if (pm) { posix.push(pm[1]); st.i += pm[0].length; continue; }
            atomCh = '['; st.i++;
        } else { atomCh = ch; st.i++; }
        /* 范围 a-z */
        if (st.s[st.i] === '-' && st.s[st.i + 1] !== ']' && st.s[st.i + 1] !== undefined) {
            st.i++;
            var endCh;
            if (st.s[st.i] === '\\') {
                var e2 = parseEscape(st, true);
                endCh = (e2.ch !== undefined ? e2.ch : e2.raw.charAt(e2.raw.length - 1));
            } else { endCh = st.s[st.i]; st.i++; }
            ranges.push([atomCh, endCh]);
        } else {
            singles.push(atomCh);
        }
    }
    return { t: 'class', raw: st.s.slice(start, st.i), neg: neg, singles: singles,
        ranges: ranges, classes: classes, posix: posix, start: start, end: st.i };
}

function parseEscape(st, inClass) {
    var start = st.i; /* 位于 \ */
    st.i++;
    var s = st.s;
    if (st.i >= s.length) {
        parseError(st, '末尾的反斜杠「\\」后面缺少转义字符', start);
        return { t: 'literal', ch: '\\', raw: '\\', start: start, end: st.i };
    }
    var c = s[st.i];
    var simple = { n: '\n', t: '\t', r: '\r', v: '\v', f: '\f' };
    if (c === 'd' || c === 'D' || c === 's' || c === 'S' || c === 'w' || c === 'W') {
        st.i++;
        return { t: 'escape-class', code: c, raw: s.slice(start, st.i), start: start, end: st.i };
    }
    if (!inClass && (c === 'b' || c === 'B')) {
        st.i++;
        return { t: 'boundary', kind: c === 'b' ? 'word' : 'nonword', raw: s.slice(start, st.i), start: start, end: st.i };
    }
    if (c === 'p' || c === 'P') {
        var pm = /^[pP]\{([^}]*)\}/.exec(s.slice(st.i));
        if (pm) {
            st.i += pm[0].length;
            return { t: 'unicode-prop', neg: c === 'P', name: pm[1], raw: s.slice(start, st.i), start: start, end: st.i };
        }
        st.i++;
        return { t: 'literal', ch: 'p', raw: '\\p', start: start, end: st.i, escaped: true,
            note: '未加 u 修饰符时 \\p{...} 无效，此处按字面字符 p 处理' };
    }
    if (c === 'k') {
        var km = /^k<([^<>]*)>/.exec(s.slice(st.i));
        if (km && km[1].length > 0) {
            st.i += km[0].length;
            return { t: 'named-backref', name: km[1], raw: s.slice(start, st.i), start: start, end: st.i };
        }
        parseError(st, '命名反向引用格式错误，应为 \\k<name> 形式', start);
        st.i++;
        return { t: 'literal', ch: 'k', raw: '\\k', start: start, end: st.i };
    }
    if (c === 'c') {
        var cc = s[st.i + 1];
        if (cc && /[A-Za-z]/.test(cc)) {
            st.i += 2;
            return { t: 'escape', code: 'c', raw: s.slice(start, st.i),
                ch: String.fromCharCode(cc.toUpperCase().charCodeAt(0) % 32), start: start, end: st.i };
        }
        st.i++;
        return { t: 'literal', ch: 'c', raw: '\\c', start: start, end: st.i };
    }
    if (c === 'x') {
        var xm = /^x([0-9A-Fa-f]{2})/.exec(s.slice(st.i));
        if (xm) {
            st.i += xm[0].length;
            return { t: 'escape', code: 'x', raw: s.slice(start, st.i),
                ch: String.fromCharCode(parseInt(xm[1], 16)), start: start, end: st.i };
        }
        parseError(st, '\\x 后面需要 2 位十六进制数（如 \\x41 表示 A）', start);
        st.i++;
        return { t: 'literal', ch: 'x', raw: '\\x', start: start, end: st.i };
    }
    if (c === 'u') {
        var um = /^u\{([0-9A-Fa-f]+)\}/.exec(s.slice(st.i));
        if (um) {
            st.i += um[0].length;
            return { t: 'escape', code: 'u', raw: s.slice(start, st.i),
                ch: String.fromCodePoint(parseInt(um[1], 16)), start: start, end: st.i };
        }
        var um2 = /^u([0-9A-Fa-f]{4})/.exec(s.slice(st.i));
        if (um2) {
            st.i += um2[0].length;
            return { t: 'escape', code: 'u', raw: s.slice(start, st.i),
                ch: String.fromCharCode(parseInt(um2[1], 16)), start: start, end: st.i };
        }
        parseError(st, '\\u 后面需要 4 位十六进制（如 \\u4e2d）或 \\u{...} 形式', start);
        st.i++;
        return { t: 'literal', ch: 'u', raw: '\\u', start: start, end: st.i };
    }
    if (simple[c] !== undefined) {
        st.i++;
        return { t: 'escape', code: c, raw: s.slice(start, st.i), ch: simple[c], start: start, end: st.i };
    }
    if (c === 'b' && inClass) {
        st.i++;
        return { t: 'escape', code: 'b', raw: '\\b', ch: '\b', start: start, end: st.i };
    }
    if (c === '0') {
        var om = /^0[0-7]{1,2}/.exec(s.slice(st.i));
        if (om && om[0].length > 1) {
            st.i += om[0].length;
            return { t: 'escape', code: 'oct', raw: s.slice(start, st.i),
                ch: String.fromCharCode(parseInt(om[0], 8)), start: start, end: st.i };
        }
        st.i++;
        return { t: 'escape', code: '0', raw: '\\0', ch: '\0', start: start, end: st.i };
    }
    if (c >= '1' && c <= '7') {
        var dm = /^[1-9][0-9]*/.exec(s.slice(st.i));
        st.i += dm[0].length;
        return { t: 'backref', n: parseInt(dm[0], 10), raw: s.slice(start, st.i), start: start, end: st.i };
    }
    /* 其余：转义的字面字符（如 \. \* \\ \/） */
    st.i++;
    return { t: 'literal', ch: c, raw: s.slice(start, st.i), start: start, end: st.i, escaped: true };
}

/* ---------- 中文解释 ---------- */

var ESCAPE_CLASS_DESC = {
    d: '预定义字符类 \\d：匹配任意数字字符（0-9）',
    D: '预定义字符类 \\D：匹配任意非数字字符（[^0-9]）',
    s: '预定义字符类 \\s：匹配任意空白字符（空格、制表符、换行符等）',
    S: '预定义字符类 \\S：匹配任意非空白字符',
    w: '预定义字符类 \\w：匹配单词字符（字母、数字、下划线，即 [A-Za-z0-9_]）',
    W: '预定义字符类 \\W：匹配非单词字符（[^A-Za-z0-9_]）'
};

var ESCAPE_DESC = {
    n: '转义序列 \\n：匹配换行符（LF）',
    t: '转义序列 \\t：匹配制表符（Tab）',
    r: '转义序列 \\r：匹配回车符（CR）',
    v: '转义序列 \\v：匹配垂直制表符',
    f: '转义序列 \\f：匹配换页符',
    '0': '转义序列 \\0：匹配空字符（NUL，编码 0）',
    b: '转义序列 \\b（在字符集内）：匹配退格符；注意在字符集外 \\b 表示单词边界',
    c: '控制字符转义 \\cX：匹配 ASCII 控制字符（如 \\cA 为编码 1 的字符）',
    x: '十六进制转义 \\xHH：按两位十六进制匹配单个字符（如 \\x41 即 A）',
    u: 'Unicode 转义 \\uHHHH 或 \\u{H…}：按码点匹配单个字符（如 \\u4e2d 即「中」）',
    oct: '八进制转义：按八进制编码匹配单个字符'
};

var GROUP_KIND_DESC = {
    'capturing': '捕获分组',
    'non-capturing': '非捕获分组 (?:…)',
    'named': '命名捕获分组 (?<name>…)',
    'lookahead': '零宽正向先行断言 (?=…)',
    'lookahead-neg': '零宽负向先行断言 (?!…)',
    'lookbehind': '零宽正向后行断言 (?<=…)',
    'lookbehind-neg': '零宽负向后行断言 (?<!…)',
    'flags-only': '内联修饰符 (?flags)',
    'flags-group': '内联修饰符分组 (?flags:…)'
};

function quantDesc(q) {
    var atomText = shortRaw(q.atom);
    var times;
    if (q.min === 0 && q.max === Infinity) times = '重复 0 次或多次';
    else if (q.min === 1 && q.max === Infinity) times = '重复 1 次或多次（至少 1 次）';
    else if (q.min === 0 && q.max === 1) times = '重复 0 次或 1 次（可有可无）';
    else if (q.max === Infinity) times = '重复至少 ' + q.min + ' 次';
    else if (q.min === q.max) times = '重复恰好 ' + q.min + ' 次';
    else times = '重复 ' + q.min + ' 到 ' + q.max + ' 次';
    var strat = q.lazy ? '懒惰模式（优先少匹配，能少则少）' : '贪婪模式（优先多匹配，能多则多）';
    return '量词作用于「' + atomText + '」：' + times + '；' + strat;
}

function shortRaw(node) {
    if (!node || !node.raw) return '';
    return node.raw.length > 24 ? node.raw.slice(0, 24) + '…' : node.raw;
}

function explainClass(n) {
    var parts = [];
    if (n.neg) parts.push('否定字符集 [^…]：匹配「不在」其中任一字符的单个字符');
    else parts.push('字符集 […]：匹配其中「任意一个」字符');
    var inner = [];
    n.ranges.forEach(function (r) { inner.push(r[0] + '-' + r[1] + '（' + r[0] + ' 到 ' + r[1] + ' 的范围）'); });
    if (n.singles.length) inner.push('单个字符：' + n.singles.map(function (c) { return '「' + c + '」'; }).join('、'));
    if (n.classes.length) inner.push('预定义类：' + n.classes.join('、'));
    if (n.posix.length) inner.push('POSIX 类：' + n.posix.map(function (p) { return '[:' + p + ':]'; }).join('、'));
    if (inner.length) parts.push('包含：' + inner.join('；'));
    return parts.join('。');
}

function explainNode(n) {
    switch (n.t) {
        case 'literal':
            if (n.escaped) return '转义字面字符 ' + n.raw + '：匹配字符「' + n.ch + '」本身（反斜杠取消其特殊含义）';
            return '字面字符：匹配字符「' + n.ch + '」本身';
        case 'dot':
            return '通配符 .：匹配除换行符外的任意单个字符（加 s 修饰符后也可匹配换行符）';
        case 'anchor':
            return n.kind === 'start'
                ? '起始锚点 ^：零宽断言，要求当前位置是字符串开头（加 m 修饰符后也可匹配行首）'
                : '结束锚点 $：零宽断言，要求当前位置是字符串结尾（加 m 修饰符后也可匹配行尾）';
        case 'boundary':
            return n.kind === 'word'
                ? '单词边界 \\b：零宽断言，匹配「单词字符 \\w」与「非单词字符」之间的位置（或字符串边界）'
                : '非单词边界 \\B：零宽断言，要求当前位置「不是」单词边界';
        case 'escape-class':
            return ESCAPE_CLASS_DESC[n.code] || ('预定义字符类 \\' + n.code);
        case 'escape':
            var d = ESCAPE_DESC[n.code] || ('转义序列 ' + n.raw);
            return d + (n.ch !== undefined && n.ch.length === 1 && /[\u4e00-\u9fa5]/.test(n.ch) ? '，即「' + n.ch + '」' : '');
        case 'unicode-prop':
            return 'Unicode 属性转义 \\' + (n.neg ? 'P' : 'p') + '{' + n.name + '}：匹配' +
                (n.neg ? '「不」属于' : '属于') + ' Unicode 属性「' + n.name + '」的字符（需加 u 修饰符，如 \\p{L} 匹配任意字母）';
        case 'class':
            return explainClass(n);
        case 'group': {
            var gd = GROUP_KIND_DESC[n.kind] || '分组';
            var extra = '';
            if (n.kind === 'capturing') extra = '（第 ' + n.index + ' 组）：匹配到的内容会被记住，可用 \\' + n.index + ' 反向引用';
            else if (n.kind === 'named') extra = '（第 ' + n.index + ' 组，名「' + n.name + '」）：匹配内容存入 groups.' + n.name + '，可用 \\k<' + n.name + '> 反向引用' + (n.py ? '；注意 (?P<name>…) 是 Python 写法，JS 引擎不支持' : '');
            else if (n.kind === 'lookahead') extra = '：要求当前位置「右侧」紧跟括号内模式才算匹配，断言本身不消耗字符';
            else if (n.kind === 'lookahead-neg') extra = '：要求当前位置「右侧」「不能」出现括号内模式，断言本身不消耗字符';
            else if (n.kind === 'lookbehind') extra = '：要求当前位置「左侧」紧邻括号内模式才算匹配，断言本身不消耗字符';
            else if (n.kind === 'lookbehind-neg') extra = '：要求当前位置「左侧」「不能」出现括号内模式，断言本身不消耗字符';
            else if (n.kind === 'non-capturing') extra = '：只起分组作用，不编号、不捕获';
            else if (n.kind === 'flags-only') extra = '：从此处开始对后续模式启用修饰符 ' + n.flags + '（注意：JavaScript 引擎不支持内联修饰符语法，此处按 Python/Java 等语言语义解释）';
            else if (n.kind === 'flags-group') extra = '：仅对括号内模式启用修饰符 ' + n.flags + '（注意：JavaScript 引擎不支持内联修饰符语法，此处按 Python/Java 等语言语义解释）';
            return gd + extra;
        }
        case 'quantified':
            return quantDesc(n);
        case 'backref':
            return '反向引用 \\' + n.n + '：再次匹配「第 ' + n.n + ' 捕获组」之前捕获到的文本（要求文本完全相同，而非重新匹配模式）';
        case 'named-backref':
            return '命名反向引用 \\k<' + n.name + '>：再次匹配命名分组「' + n.name + '」之前捕获到的文本';
        default:
            return '未知元素 ' + (n.raw || '');
    }
}

/* 把解析结果展平为逐段解释列表（含缩进层级） */
function explainPattern(pattern) {
    var tk = tokenize(pattern);
    var units = [];
    flattenBranches(tk.branches, 0, units);
    return { units: units, errors: tk.errors, groupCount: tk.groupCount };
}

function flattenBranches(branches, depth, out) {
    var self = this;
    branches.forEach(function (br, bi) {
        if (branches.length > 1) {
            out.push({ kind: 'branch', raw: '分支 ' + (bi + 1), depth: depth,
                text: '分支选择（共 ' + branches.length + ' 个分支）：正则引擎按从左到右依次尝试，任一分支匹配成功即整体通过' });
        }
        br.forEach(function (n) { flattenNode(n, depth + (branches.length > 1 ? 1 : 0), out); });
    });
}

function flattenNode(n, depth, out) {
    out.push({ kind: 'node', node: n, raw: n.raw, depth: depth, type: n.t, text: explainNode(n) });
    if (n.t === 'group' && n.kind !== 'flags-only') flattenBranches(n.branches, depth + 1, out);
    if (n.t === 'quantified') {
        /* 量词包装的原子也单独解释一行，便于理解作用对象 */
        out.push({ kind: 'atom', node: n.atom, raw: n.atom.raw, depth: depth + 1, type: n.atom.t,
            text: '↳ 量词的作用对象：' + explainNode(n.atom) });
    }
}

/* ---------- 修饰符 ---------- */

var FLAG_DESC = {
    g: ['全局匹配', '找出文本中所有匹配，而非找到第一个就停止'],
    i: ['忽略大小写', '字母大小写视为相同（如 a 可匹配 A）'],
    m: ['多行模式', '^ 与 $ 改为匹配每一行的开头与结尾'],
    s: ['点号通配换行', '. 也可匹配换行符（dotAll）'],
    u: ['Unicode 模式', '按 Unicode 码点处理，启用 \\p{…}、\\u{…} 等语法，语法检查更严格'],
    v: ['Unicode 集合模式', 'u 的超集，字符集内支持 && 交集、-- 差集等集合运算'],
    y: ['粘性匹配', '匹配必须从 lastIndex 指定的位置紧邻开始']
};

function describeFlags(flags) {
    var out = [];
    String(flags || '').split('').forEach(function (f) {
        if (FLAG_DESC[f]) out.push({ flag: f, name: FLAG_DESC[f][0], desc: FLAG_DESC[f][1] });
        else out.push({ flag: f, name: '未知修饰符', desc: 'JS 引擎不支持该修饰符，会报语法错误' });
    });
    return out;
}

/* ---------- 引擎交叉校验 ---------- */

function engineCheck(pattern, flags) {
    try {
        new RegExp(pattern, flags || '');
        return null;
    } catch (e) {
        return String((e && e.message) || e);
    }
}

var RE_CORE = {
    tokenize: tokenize,
    explainPattern: explainPattern,
    explainNode: explainNode,
    describeFlags: describeFlags,
    engineCheck: engineCheck
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RE_CORE;
}

/* ================= DOM 层（仅浏览器） ================= */

if (typeof document !== 'undefined' && !(typeof module !== 'undefined' && module.exports)) {

var WORKER_URL = '/tools/static/js/regex_explainer_worker.js';
var TIMEOUT_MS = 3000;

function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

var TYPE_BADGE = {
    'literal': '字面', 'dot': '通配', 'anchor': '锚点', 'boundary': '边界',
    'escape-class': '预定义类', 'escape': '转义', 'unicode-prop': 'Unicode属性',
    'class': '字符集', 'group': '分组', 'quantified': '量词',
    'backref': '反向引用', 'named-backref': '命名引用',
    'branch': '分支', 'atom': '作用对象'
};

var $ = function (id) { return document.getElementById(id); };
var debounceTimer = null;

function currentFlags() {
    var f = '';
    document.querySelectorAll('input[name="re-flag"]:checked').forEach(function (el) { f += el.value; });
    return f;
}

/* ---------- 主渲染 ---------- */

function renderAll() {
    var pattern = $('re-pattern').value;
    var flags = currentFlags();
    var errBox = $('re-error'), listBox = $('re-explain'), treeBox = $('re-tree'),
        stripBox = $('re-strip'), flagsBox = $('re-flags-desc');

    /* 修饰符说明 */
    var fd = RE_CORE.describeFlags(flags);
    flagsBox.innerHTML = fd.length
        ? fd.map(function (x) {
            return '<span class="re-flag-chip" title="' + escHtml(x.desc) + '"><b>' + escHtml(x.flag) + '</b> ' + escHtml(x.name) + '</span>';
        }).join('')
        : '<span class="re-muted">未选择修饰符（默认：找到第一个匹配即停，区分大小写）</span>';

    if (pattern === '') {
        errBox.style.display = 'none';
        listBox.innerHTML = '<div class="re-empty">在上方输入正则表达式，这里会逐段给出中文解释。</div>';
        treeBox.innerHTML = '<div class="re-empty">结构树将显示在这里。</div>';
        stripBox.innerHTML = '';
        return;
    }

    var res = RE_CORE.explainPattern(pattern);
    var engineErr = RE_CORE.engineCheck(pattern, flags);

    /* 错误区（含定位） */
    var errs = res.errors.slice();
    if (engineErr) errs.push({ message: 'JS 引擎校验：' + engineErr, pos: null });
    if (errs.length) {
        errBox.style.display = 'block';
        errBox.innerHTML = errs.map(function (e) {
            var loc = (e.pos !== null && e.pos !== undefined)
                ? errorCaret(pattern, e.pos) : '';
            return '<div class="re-err-item"><i class="material-icons">error_outline</i><div>' +
                '<div>' + escHtml(e.message) + '</div>' + loc + '</div></div>';
        }).join('');
    } else {
        errBox.style.display = 'none';
    }

    /* 逐段解释 */
    if (res.units.length === 0) {
        listBox.innerHTML = '<div class="re-empty">空正则：匹配空字符串。</div>';
    } else {
        listBox.innerHTML = res.units.map(function (u, i) {
            var badge = u.kind === 'branch' ? '分支'
                : (u.kind === 'atom' ? '作用对象' : (TYPE_BADGE[u.type] || u.type));
            return '<div class="re-unit" style="margin-left:' + (u.depth * 1.4) + 'rem">' +
                '<span class="re-unit-no">' + (i + 1) + '</span>' +
                '<span class="re-unit-badge">' + escHtml(badge) + '</span>' +
                '<code class="re-unit-raw">' + escHtml(u.raw) + '</code>' +
                '<div class="re-unit-text">' + escHtml(u.text) + '</div></div>';
        }).join('');
    }

    /* token 条带 */
    stripBox.innerHTML = res.units.filter(function (u) { return u.kind === 'node' && u.depth <= 1; })
        .map(function (u) {
            return '<span class="re-chip" title="' + escHtml(u.text) + '">' + escHtml(u.raw) + '</span>';
        }).join('');

    /* 结构树 */
    treeBox.innerHTML = buildTreeHTML(tokenizeTop(res));
}

function errorCaret(pattern, pos) {
    var p = Math.max(0, Math.min(pos, pattern.length));
    var before = escHtml(pattern.slice(0, p));
    var after = escHtml(pattern.slice(p));
    return '<div class="re-caret"><code>' + before + '<span class="re-caret-pos">' +
        (after ? '' : '␣') + '</span>' + after + '</code>' +
        '<div class="re-caret-line">' + escHtml(pattern.slice(0, p).replace(/[^\n]/g, ' ')) +
        '<span class="re-caret-arrow">▲ 第 ' + (p + 1) + ' 列</span></div></div>';
}

function tokenizeTop(res) {
    /* 供结构树使用：从 units 还原层级较为复杂，直接重新 tokenize */
    return RE_CORE.tokenize($('re-pattern').value);
}

function buildTreeHTML(tk) {
    if (tk.errors.length) return '<div class="re-empty">存在语法错误，修正后可查看结构树。</div>';
    var html = '<ul class="re-tree-root">' + tk.branches.map(function (br, bi) {
        var label = tk.branches.length > 1 ? '<span class="re-tree-branch">分支 ' + (bi + 1) + '</span>' : '';
        return '<li>' + label + '<ul>' + br.map(treeNodeHTML).join('') + '</ul></li>';
    }).join('') + '</ul>';
    return html;
}

function treeNodeHTML(n) {
    var badge = TYPE_BADGE[n.t] || n.t;
    var label = '<span class="re-tree-badge">' + escHtml(badge) + '</span> ' +
        '<code>' + escHtml(n.raw) + '</code>' +
        '<span class="re-tree-desc">' + escHtml(shortText(RE_CORE.explainNode(n))) + '</span>';
    var children = '';
    if (n.t === 'group' && n.kind !== 'flags-only') {
        children = '<ul>' + n.branches.map(function (br, bi) {
            var bl = n.branches.length > 1 ? '<li><span class="re-tree-branch">分支 ' + (bi + 1) + '</span><ul>' +
                br.map(treeNodeHTML).join('') + '</ul></li>' : br.map(treeNodeHTML).join('');
            return bl;
        }).join('') + '</ul>';
    } else if (n.t === 'quantified') {
        children = '<ul><li>' + treeNodeHTML(n.atom) + '</li></ul>';
    }
    return '<li class="re-tree-node">' + label + children + '</li>';
}

function shortText(t) {
    return t.length > 60 ? t.slice(0, 60) + '…' : t;
}

/* ---------- 安全测试（Web Worker + 3 秒熔断） ---------- */

var activeWorker = null, timeoutTimer = null;

function stopTest(silent) {
    if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    if (activeWorker) { try { activeWorker.terminate(); } catch (e) {} activeWorker = null; }
    if (!silent) setTestBusy(false);
}

function setTestBusy(busy) {
    var btn = $('re-run-test');
    btn.disabled = busy;
    btn.innerHTML = busy
        ? '<i class="material-icons">hourglass_top</i> 匹配中…（3 秒熔断保护）'
        : '<i class="material-icons">play_arrow</i> 在 Worker 中安全测试';
}

function runTest() {
    var pattern = $('re-pattern').value;
    var flags = currentFlags();
    var text = $('re-test-text').value;
    var box = $('re-test-result');
    stopTest(true);

    if (pattern === '') { box.innerHTML = '<div class="re-empty">请先输入正则表达式。</div>'; return; }
    var engineErr = RE_CORE.engineCheck(pattern, flags);
    if (engineErr) {
        box.innerHTML = '<div class="re-test-err"><i class="material-icons">error_outline</i> 正则语法错误，无法测试：' +
            escHtml(engineErr) + '</div>';
        return;
    }
    setTestBusy(true);
    box.innerHTML = '<div class="re-testing"><i class="material-icons">hourglass_top</i> 正在 Worker 线程中匹配，主线程保持响应…</div>';

    var done = false;
    function finish(html) {
        if (done) return;
        done = true;
        stopTest();
        box.innerHTML = html;
    }

    try {
        activeWorker = new Worker(WORKER_URL);
    } catch (e) {
        finish('<div class="re-test-err">Worker 启动失败（' + escHtml(String(e && e.message || e)) +
            '），请检查浏览器是否允许 Worker。</div>');
        return;
    }
    timeoutTimer = setTimeout(function () {
        finish('<div class="re-test-timeout"><i class="material-icons">timer_off</i>' +
            '<div><b>匹配超时，已熔断（超过 3 秒）</b><br>该正则疑似存在「灾难性回溯」（ReDoS）风险，' +
            'Worker 已被终止，主线程未受影响。建议：避免嵌套量词如 <code>(a+)+</code>，' +
            '用量词限定范围或改写为更具体的模式。</div></div>');
    }, TIMEOUT_MS);

    activeWorker.onmessage = function (ev) {
        var d = ev.data || {};
        if (!d.ok) {
            finish('<div class="re-test-err"><i class="material-icons">error_outline</i> 匹配出错：' +
                escHtml(d.error || '未知错误') + '</div>');
            return;
        }
        finish(renderMatches(d, text));
    };
    activeWorker.onerror = function (ev) {
        finish('<div class="re-test-err">Worker 异常：' + escHtml(ev.message || '未知错误') + '</div>');
    };
    activeWorker.postMessage({ pattern: pattern, flags: flags, text: text });
}

function renderMatches(d, text) {
    var ms = d.matches || [];
    var html = '<div class="re-test-meta">共 <b>' + ms.length + '</b> 处匹配' +
        (d.truncated ? '（已截断，仅显示前 300 处）' : '') +
        '，Worker 内耗时 ' + d.elapsedMs + ' ms</div>';
    if (ms.length === 0) {
        return html + '<div class="re-empty">文本中没有匹配。</div>';
    }
    html += '<div class="re-highlight">' + highlightMatches(text, ms) + '</div>';
    html += '<div class="re-match-list">' + ms.slice(0, 50).map(function (m, i) {
        var g = (m.groups || []).map(function (gg, gi) {
            return gg === undefined ? '<span class="re-g">组' + (gi + 1) + ': 未参与</span>'
                : '<span class="re-g">组' + (gi + 1) + ': <code>' + escHtml(String(gg)) + '</code></span>';
        }).join(' ');
        var named = '';
        if (m.named) {
            named = Object.keys(m.named).map(function (k) {
                return '<span class="re-g">「' + escHtml(k) + '」: <code>' + escHtml(String(m.named[k])) + '</code></span>';
            }).join(' ');
        }
        return '<div class="re-match-item"><span class="re-match-no">#' + (i + 1) + '</span>' +
            '<code class="re-match-full">' + escHtml(m.full) + '</code>' +
            '<span class="re-match-pos">位置 ' + m.index + '</span><div class="re-match-groups">' + g + ' ' + named + '</div></div>';
    }).join('') + (ms.length > 50 ? '<div class="re-muted">…仅列出前 50 处</div>' : '') + '</div>';
    return html;
}

function highlightMatches(text, ms) {
    var out = '', last = 0;
    ms.forEach(function (m) {
        var s = m.index, e = s + m.full.length;
        if (s < last) return; /* 重叠匹配跳过，保证高亮不乱序 */
        out += escHtml(text.slice(last, s)) + '<mark>' + escHtml(text.slice(s, e) || '␣') + '</mark>';
        last = e;
    });
    out += escHtml(text.slice(last));
    return out;
}

/* ---------- 预设示例 ---------- */

var PRESETS = [
    { name: '邮箱（分组/字符类/量词）', pattern: '^[\\w.-]+@[\\w-]+(\\.[\\w-]+)+$', text: '联系我：test.user@example.com，或 admin@foo.co.uk' },
    { name: '日期（量词/锚点）', pattern: '^\\d{4}-\\d{2}-\\d{2}$', text: '2026-10-20' },
    { name: '正向后行断言', pattern: '(?<=@)[\\w.-]+', text: '请发到 support@example.com 谢谢' },
    { name: '正向先行断言', pattern: '\\b\\w+(?=@)', text: 'user1@gmail.com, user2@qq.com' },
    { name: '分支与可选', pattern: '(https?|ftp)://[^\\s/]+(\\:\\d+)?', text: '访问 https://example.com:8080 或 ftp://files.test.org 获取' },
    { name: '修饰符 g/i（全局+忽略大小写）', pattern: '\\b[A-Z]+@[A-Z]+\\b', flags: 'gi', text: 'Mail me at Test@Example.COM or ADMIN@foo.org' },
    { name: '命名分组与反向引用', pattern: '(?<year>\\d{4})-(?<month>\\d{2})-\\k<month>', text: '日期 2026-10-10 与 2026-10-20' },
    { name: 'ReDoS 演示（3秒熔断）', pattern: '^(a+)+$', text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab' }
];

function renderPresets() {
    $('re-presets').innerHTML = PRESETS.map(function (p, i) {
        return '<button class="re-preset" data-i="' + i + '">' + escHtml(p.name) +
            '<code>' + escHtml(p.pattern.length > 30 ? p.pattern.slice(0, 30) + '…' : p.pattern) + '</code></button>';
    }).join('');
    document.querySelectorAll('.re-preset').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var p = PRESETS[+btn.getAttribute('data-i')];
            $('re-pattern').value = p.pattern;
            document.querySelectorAll('input[name="re-flag"]').forEach(function (el) {
                el.checked = (p.flags || '').indexOf(el.value) !== -1;
            });
            $('re-test-text').value = p.text;
            scheduleRender();
            runTest();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

/* ---------- 初始化 ---------- */

function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderAll, 150);
}

function init() {
    renderPresets();
    $('re-pattern').addEventListener('input', scheduleRender);
    document.querySelectorAll('input[name="re-flag"]').forEach(function (el) {
        el.addEventListener('change', renderAll);
    });
    $('re-test-text').addEventListener('input', function () { /* 不自动重跑，等用户点击 */ });
    $('re-run-test').addEventListener('click', runTest);
    $('re-clear').addEventListener('click', function () {
        $('re-pattern').value = '';
        $('re-test-text').value = '';
        $('re-test-result').innerHTML = '<div class="re-empty">点击「在 Worker 中安全测试」查看匹配结果。</div>';
        renderAll();
    });
    /* 默认示例 */
    $('re-pattern').value = '^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})$';
    $('re-test-text').value = '今天是 2026-10-20，明天是 2026-10-21';
    renderAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

}
})();

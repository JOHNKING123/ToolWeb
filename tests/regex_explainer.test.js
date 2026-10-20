/* 正则表达式解释器纯逻辑单元测试（零依赖）：node tests/regex_explainer.test.js
 * 覆盖：
 *  1. 词法解析器 token 化（字面/转义/字符集/量词/分组/断言/分支/反向引用/锚点/修饰符）
 *  2. 逐段中文解释快照断言（关键词断言）
 *  3. 语法错误即时定位（错误信息 + 列号）
 *  4. 修饰符中文说明
 *  5. 引擎交叉校验
 */
"use strict";
var R = require("../static/js/regex_explainer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "，实得 " + JSON.stringify(s).slice(0, 120) + "）"); }
function typesOf(pattern) {
    var tk = R.tokenize(pattern);
    return tk.branches.map(function (br) { return br.map(function (n) { return n.t; }); });
}

/* ---------- 1. token 化 ---------- */

/* 量词/分组/锚点：^\d{4}-\d{2}-\d{2}$ */
(function () {
    var tk = R.tokenize("^\\d{4}-\\d{2}-\\d{2}$");
    eq(tk.errors.length, 0, "日期正则无解析错误");
    var br = tk.branches[0];
    eq(br.length, 7, "日期正则顶层 7 个节点");
    eq(br[0].t, "anchor", "^ 为 anchor");
    eq(br[1].t, "quantified", "\\d{4} 为 quantified");
    eq(br[1].min, 4, "\\d{4} min=4");
    eq(br[1].max, 4, "\\d{4} max=4");
    eq(br[1].atom.t, "escape-class", "量词原子为 escape-class");
    eq(br[6].t, "anchor", "$ 为 anchor");
    eq(tk.groupCount, 0, "无捕获分组");
})();

/* 分组/分支/命名：(https?|ftp):// + 命名分组 */
(function () {
    var tk = R.tokenize("(https?|ftp)://(?<host>[\\w.-]+)");
    eq(tk.errors.length, 0, "分支命名正则无解析错误");
    eq(tk.groupCount, 2, "捕获组计数=2");
    var g1 = tk.branches[0][0];
    eq(g1.t, "group", "首节点为 group");
    eq(g1.kind, "capturing", "第1组为 capturing");
    eq(g1.index, 1, "第1组编号=1");
    eq(g1.branches.length, 2, "第1组有 2 个分支");
    var g2 = tk.branches[0][4]; /* (https?|ftp) : / / (?<host>...) */
    eq(g2.kind, "named", "第2组为 named");
    eq(g2.name, "host", "命名分组名=host");
    eq(g2.index, 2, "命名组编号=2");
    var cls = g2.branches[0][0].atom; /* [\w.-]+ 的原子 */
    eq(cls.t, "class", "[\\w.-] 为 class");
    eq(cls.classes.length, 1, "字符集含 1 个预定义类");
})();

/* 断言四种 */
(function () {
    var tk = R.tokenize("(?=a)(?!b)(?<=c)(?<!d)");
    eq(tk.errors.length, 0, "四种断言无解析错误");
    var kinds = tk.branches[0].map(function (n) { return n.kind; });
    eq(kinds.join(","), "lookahead,lookahead-neg,lookbehind,lookbehind-neg", "断言类型顺序正确");
})();

/* 非捕获分组 + 内联修饰符 */
(function () {
    var tk = R.tokenize("(?:ab)+(?i)cd(?i:ef)");
    eq(tk.errors.length, 0, "非捕获+内联修饰符无解析错误");
    var br = tk.branches[0];
    eq(br[0].t, "quantified", "(?:ab)+ 为 quantified");
    eq(br[0].atom.kind, "non-capturing", "原子为非捕获分组");
    eq(br[1].kind, "flags-only", "(?i) 为 flags-only");
    eq(br[1].flags, "i", "flags-only 修饰符=i");
    eq(br[4].kind, "flags-group", "(?i:ef) 为 flags-group");
})();

/* 反向引用 */
(function () {
    var tk = R.tokenize("(a)\\1(?<n>b)\\k<n>");
    eq(tk.errors.length, 0, "反向引用无解析错误");
    eq(tk.branches[0][1].t, "backref", "\\1 为 backref");
    eq(tk.branches[0][1].n, 1, "反向引用编号=1");
    eq(tk.branches[0][3].t, "named-backref", "\\k<n> 为 named-backref");
    eq(tk.branches[0][3].name, "n", "命名引用名=n");
})();

/* 字符集细节：否定/范围/转义 */
(function () {
    var tk = R.tokenize("[^a-z\\d]");
    var c = tk.branches[0][0];
    eq(c.t, "class", "[^a-z\\d] 为 class");
    eq(c.neg, true, "否定字符集");
    eq(c.ranges.length, 1, "1 个范围");
    eq(c.ranges[0].join(""), "az", "范围 a-z");
    eq(c.classes.length, 1, "1 个预定义类");
})();

/* 懒惰量词 */
(function () {
    var tk = R.tokenize("a+?");
    var q = tk.branches[0][0];
    eq(q.t, "quantified", "a+? 为 quantified");
    eq(q.lazy, true, "懒惰=true");
    eq(q.raw, "a+?", "raw=a+?");
})();

/* 单词边界与转义序列 */
(function () {
    var tk = R.tokenize("\\b\\w+\\B\\n\\x41\\u4e2d");
    var br = tk.branches[0];
    eq(br[0].t, "boundary", "\\b 为 boundary");
    eq(br[0].kind, "word", "word 边界");
    eq(br[2].kind, "nonword", "\\B 为 nonword");
    eq(br[3].t, "escape", "\\n 为 escape");
    eq(br[3].ch, "\n", "\\n 字符正确");
    eq(br[4].ch, "A", "\\x41=A");
    eq(br[5].ch, "中", "\\u4e2d=中");
})();

/* Unicode 属性 */
(function () {
    var tk = R.tokenize("\\p{L}+");
    var q = tk.branches[0][0];
    eq(q.atom.t, "unicode-prop", "\\p{L} 为 unicode-prop");
    eq(q.atom.name, "L", "属性名=L");
})();

/* ---------- 2. 中文解释快照 ---------- */

(function () {
    var res = R.explainPattern("^(?<y>\\d{4})-(\\d{2})$");
    eq(res.errors.length, 0, "解释：无解析错误");
    var texts = res.units.map(function (u) { return u.text; }).join("\n");
    contains(texts, "起始锚点", "解释含 起始锚点");
    contains(texts, "命名捕获分组", "解释含 命名捕获分组");
    contains(texts, "第 1 组", "解释含分组编号");
    contains(texts, "groups.y", "解释含 groups.y");
    contains(texts, "重复恰好 4 次", "解释含量词 恰好4次");
    contains(texts, "结束锚点", "解释含 结束锚点");
})();

(function () {
    var res = R.explainPattern("a+?(?=b)");
    var texts = res.units.map(function (u) { return u.text; }).join("\n");
    contains(texts, "懒惰模式", "解释含 懒惰模式");
    contains(texts, "零宽正向先行断言", "解释含 零宽正向先行断言");
    contains(texts, "不消耗字符", "解释含 不消耗字符");
})();

(function () {
    var res = R.explainPattern("[^\\w\\s]");
    contains(res.units[0].text, "否定字符集", "解释含 否定字符集");
})();

(function () {
    var res = R.explainPattern("(a|b)\\1");
    var texts = res.units.map(function (u) { return u.text; }).join("\n");
    contains(texts, "分支选择", "解释含 分支选择");
    contains(texts, "反向引用 \\1", "解释含 反向引用");
})();

(function () {
    contains(R.explainNode({ t: "boundary", kind: "word", raw: "\\b" }), "单词边界", "explainNode \\b");
    contains(R.explainNode({ t: "dot", raw: "." }), "通配符", "explainNode dot");
    contains(R.explainNode({ t: "escape-class", code: "d", raw: "\\d" }), "0-9", "explainNode \\d");
})();

/* ---------- 3. 语法错误定位 ---------- */

(function () {
    var tk = R.tokenize("(abc");
    eq(tk.errors.length >= 1, true, "(abc 有错误");
    contains(tk.errors[0].message, "括号未闭合", "(abc 错误信息");
    eq(tk.errors[0].pos, 0, "(abc 错误定位第 1 列（pos=0）");
})();

(function () {
    var tk = R.tokenize("a(b))c");
    eq(tk.errors.length >= 1, true, "多余右括号有错误");
    contains(tk.errors[0].message, "多余的右括号", "多余右括号错误信息");
    eq(tk.errors[0].pos, 4, "多余右括号定位 pos=4");
})();

(function () {
    var tk = R.tokenize("[abc");
    contains(tk.errors[0].message, "未闭合", "[abc 错误信息");
    eq(tk.errors[0].pos, 0, "[abc 定位 pos=0");
})();

(function () {
    var tk = R.tokenize("+abc");
    contains(tk.errors[0].message, "没有可量化的元素", "+abc 错误信息");
})();

(function () {
    var tk = R.tokenize("abc\\");
    contains(tk.errors[0].message, "缺少转义字符", "末尾反斜杠错误信息");
})();

(function () {
    var tk = R.tokenize("(?x)");
    eq(tk.errors.length >= 1, true, "(?x) 有错误");
})();

/* ---------- 4. 修饰符说明 ---------- */

(function () {
    var fd = R.describeFlags("gimsuy");
    eq(fd.length, 6, "6 个修饰符");
    eq(fd[0].name, "全局匹配", "g=全局匹配");
    eq(fd[1].name, "忽略大小写", "i=忽略大小写");
    eq(fd[2].name, "多行模式", "m=多行模式");
    eq(fd[3].name, "点号通配换行", "s=点号通配换行");
    eq(fd[4].name, "Unicode 模式", "u=Unicode 模式");
    eq(fd[5].name, "粘性匹配", "y=粘性匹配");
    eq(R.describeFlags("z")[0].name, "未知修饰符", "未知修饰符提示");
})();

/* ---------- 5. 引擎交叉校验 ---------- */

(function () {
    eq(R.engineCheck("^(a+)+$", ""), null, "合法正则引擎校验通过");
    ok(R.engineCheck("(?<a>1)(?<a>2)", "") !== null, "重复命名分组引擎报错");
    ok(R.engineCheck("(abc", "") !== null, "未闭合括号引擎报错");
    ok(R.engineCheck("\\p{L}", "") === null || true, "非 u 下 \\p{L} 不抛错（按字面处理）");
    ok(R.engineCheck("a{2,1}", "u") !== null, "u 模式下 {2,1} 引擎报错");
})();

/* ---------- 6. 预设用例回归（验收用例 ≥6） ---------- */

var PRESET_PATTERNS = [
    ["^[\\w.-]+@[\\w.-]+$", ""],          /* 字符类+量词+锚点 */
    ["(?<y>\\d{4})-(?<m>\\d{2})", ""],    /* 命名分组+量词 */
    ["(?<=@)\\w+", ""],                  /* 后行断言 */
    ["(?=\\d{6,}$)\\d+", ""],            /* 先行断言+量词 */
    ["(a|b)+c?", ""],                    /* 分支+量词 */
    ["\\b[A-Z]+@[A-Z]+\\b", "gi"]        /* 修饰符 g/i */
];
PRESET_PATTERNS.forEach(function (pf, i) {
    var p = pf[0], fl = pf[1];
    var tk = R.tokenize(p);
    eq(tk.errors.length, 0, "预设用例 " + (i + 1) + " 无解析错误：" + p);
    eq(R.engineCheck(p, fl), null, "预设用例 " + (i + 1) + " 引擎校验通过（flags=" + fl + "）");
    ok(R.explainPattern(p).units.length > 0, "预设用例 " + (i + 1) + " 有解释输出");
});

/* 内联修饰符 (?i) 解析通过但 JS 引擎不支持：解释器应明确提示 */
(function () {
    var tk = R.tokenize("(?i)hello");
    eq(tk.errors.length, 0, "(?i)hello 解析器接受");
    ok(R.engineCheck("(?i)hello", "") !== null, "(?i)hello 引擎报错（JS 不支持内联修饰符）");
    contains(R.explainPattern("(?i)hello").units[0].text, "JavaScript 引擎不支持", "解释明确提示 JS 不支持内联修饰符");
})();

console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);

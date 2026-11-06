/* JSON 结构图可视化（JSON Crack 模式）纯函数单元测试（零依赖）：node tests/json_graph_viewer.test.js
 * 覆盖：parseJsonInput（非法／空／超长抛错 err.field='input'、100000 字符边界）、
 * buildGraph（锚点 {"a":{"b":[1,2]},"c":null}→6 节点／5 边、根 id '$'、type 六态、
 * edges=nodes−1、按层截断 >3000、非法值／循环引用 err.field='value'）、
 * layoutGraph（同深度同 x、父 y 为子 y 均值、同列无重叠、折叠隐藏子树、空图 0×0、
 * 非法 graph err.field='graph'）、formatJsonPath（锚点 $.store.book[0].title、
 * 特殊 key $['my-key']、非法段 err.field='segments'）、searchNodes（key／值子串、
 * 大小写不敏感、err.field='graph'／'query'）、countStats（锚点 6／3／2／1／3）、
 * 5 组预设示例（每组精确统计值）、categories.go 注册（Path 总数 320→321、
 * Icon bubble_chart 全库唯一、紧邻 json_parser）、模板（SEO 关键词、真限制五条、
 * 控件、互链、零外部资源静态检查）、浏览器绑定源码级检查
 * （window.JsonGraphViewer、折叠／平移／缩放／搜索定位／复制路径／SVG/PNG 导出）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/json_graph_viewer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
    try { fn(); ok(false, name + "（应抛错却未抛）"); }
    catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "json_graph_viewer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "json_graph_viewer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var ANCHOR = { a: { b: [1, 2] }, c: null };
var ANCHOR_JSON = '{"a":{"b":[1,2]},"c":null}';

/* ---------- 1. parseJsonInput ---------- */
eqj(M.parseJsonInput(ANCHOR_JSON), ANCHOR, "parseJsonInput：锚点 JSON 解析");
eq(M.parseJsonInput('null'), null, "parseJsonInput：null");
eq(M.parseJsonInput('42'), 42, "parseJsonInput：数字 42");
eq(M.parseJsonInput('"x"'), 'x', "parseJsonInput：字符串");
eqj(M.parseJsonInput('[]'), [], "parseJsonInput：空数组");
eqj(M.parseJsonInput('{}'), {}, "parseJsonInput：空对象");
throws(function () { M.parseJsonInput(''); }, 'input', "抛错：parseJsonInput('') field=input");
throws(function () { M.parseJsonInput('   \n  '); }, 'input', "抛错：parseJsonInput(纯空白) field=input");
throws(function () { M.parseJsonInput('{"a":}'); }, 'input', "抛错：parseJsonInput 非法 JSON field=input");
throws(function () { M.parseJsonInput('{a:1}'); }, 'input', "抛错：parseJsonInput 裸键 field=input");
throws(function () { M.parseJsonInput('{"a":1,}'); }, 'input', "抛错：parseJsonInput 尾逗号 field=input");
throws(function () { M.parseJsonInput(123); }, 'input', "抛错：parseJsonInput(123) field=input");
throws(function () { M.parseJsonInput(null); }, 'input', "抛错：parseJsonInput(null) field=input");
throws(function () { M.parseJsonInput({}); }, 'input', "抛错：parseJsonInput({}) field=input");
throws(function () { M.parseJsonInput('x'.repeat(100001)); }, 'input', "抛错：parseJsonInput 超长 100001 field=input");
has((function () { try { M.parseJsonInput('x'.repeat(100001)); } catch (e) { return e.message; } return ''; })(),
    '100000', "parseJsonInput：超长提示含 100000");
has((function () { try { M.parseJsonInput('{"a":}'); } catch (e) { return e.message; } return ''; })(),
    'JSON 解析失败', "parseJsonInput：非法 JSON 提示含 JSON 解析失败");
eq(M.parseJsonInput('"' + 'a'.repeat(99998) + '"').length, 99998, "parseJsonInput 锚点：100000 字符整合法");
eq(M.MAX_INPUT, 100000, "parseJsonInput：MAX_INPUT=100000");

/* ---------- 2. buildGraph：锚点 ---------- */
(function () {
    var g = M.buildGraph(ANCHOR);
    eq(g.nodes.length, 6, "buildGraph 锚点：6 节点");
    eq(g.edges.length, 5, "buildGraph 锚点：5 边（edges=nodes−1）");
    eq(g.truncated, false, "buildGraph 锚点：不截断");
    eq(g.nodes[0].id, '$', "buildGraph：根 id '$'");
    eqj(g.nodes[0].path, [], "buildGraph：根 path []");
    eq(g.nodes[0].type, 'object', "buildGraph：根 type object");
    eq(g.nodes[0].parentId, null, "buildGraph：根 parentId null");
    eqj(g.nodes.map(function (n) { return n.id; }),
        ['$', '$.a', '$.c', '$.a.b', '$.a.b[0]', '$.a.b[1]'], "buildGraph：节点 id 为 JSON Path（BFS 顺序）");
    eqj(g.nodes.map(function (n) { return n.type; }),
        ['object', 'object', 'null', 'array', 'number', 'number'], "buildGraph：type 六态锚点");
    eqj(g.nodes[0].children, ['$.a', '$.c'], "buildGraph：根 children");
    eqj(g.nodes[1].children, ['$.a.b'], "buildGraph：$.a children");
    eqj(g.nodes[3].children, ['$.a.b[0]', '$.a.b[1]'], "buildGraph：$.a.b children");
    eq(g.nodes[2].value, null, "buildGraph：叶子 null 保留原始 value");
    eq(g.nodes[4].value, 1, "buildGraph：叶子 1 保留原始 value");
    eq(g.nodes[5].value, 2, "buildGraph：叶子 2 保留原始 value");
    eqj(g.nodes[4].path, ['a', 'b', 0], "buildGraph：叶子 path 段 ['a','b',0]");
    eq(g.nodes[4].depth, 3, "buildGraph：叶子深度 3");
    eqj(g.edges, [
        { from: '$', to: '$.a' }, { from: '$', to: '$.c' },
        { from: '$.a', to: '$.a.b' }, { from: '$.a.b', to: '$.a.b[0]' }, { from: '$.a.b', to: '$.a.b[1]' }
    ], "buildGraph：edges 精确值");
    eq(g.nodes[0].collapsed, false, "buildGraph：节点默认不折叠");
    eq(g.nodes[0].truncated, false, "buildGraph：节点默认不截断");
})();

/* ---------- 3. buildGraph：单值／空容器／截断 ---------- */
(function () {
    var s = M.buildGraph(42);
    eq(s.nodes.length, 1, "buildGraph：单值 42→1 节点");
    eq(s.edges.length, 0, "buildGraph：单值 0 边");
    eq(s.nodes[0].type, 'number', "buildGraph：单值 type number");
    eq(s.nodes[0].value, 42, "buildGraph：单值保留 value");
    var e = M.buildGraph({ emptyObj: {}, emptyArr: [] });
    eq(e.nodes.length, 3, "buildGraph：空容器→3 节点");
    eq(e.nodes[1].type, 'object', "buildGraph：空对象 type object");
    eqj(e.nodes[1].children, [], "buildGraph：空对象无子节点");
    var wide = {};
    for (var i = 0; i < 10; i++) wide['k' + i] = { x: 1, y: 2, z: 3 };
    var t = M.buildGraph(wide, { maxNodes: 5 });
    eq(t.nodes.length, 1, "buildGraph 截断：maxNodes 5 宽对象只剩根");
    eq(t.edges.length, 0, "buildGraph 截断：edges=nodes−1=0");
    eq(t.truncated, true, "buildGraph 截断：truncated=true");
    eq(t.truncatedDepth, 0, "buildGraph 截断：截断在第 0 层");
    eq(t.truncatedCount, 10, "buildGraph 截断：截断 10 个子节点");
    eq(t.nodes[0].truncated, true, "buildGraph 截断：根打 truncated 标记");
    eq(t.nodes[0].truncatedCount, 10, "buildGraph 截断：根 truncatedCount=10");
    var mid = { a: { x: 1, y: 2 }, b: { x: 1, y: 2 }, c: { x: 1, y: 2 } };
    var m = M.buildGraph(mid, { maxNodes: 8 });
    eq(m.nodes.length, 4, "buildGraph 截断：中层截断剩 4 节点");
    eq(m.truncated, true, "buildGraph 截断：中层 truncated=true");
    eq(m.truncatedDepth, 1, "buildGraph 截断：截断在第 1 层");
    eq(m.truncatedCount, 6, "buildGraph 截断：截断 6 个子节点");
    eq(M.MAX_NODES, 3000, "buildGraph：MAX_NODES=3000");
})();

/* ---------- 4. buildGraph：非法值抛错 ---------- */
throws(function () { M.buildGraph(undefined); }, 'value', "抛错：buildGraph(undefined) field=value");
throws(function () { M.buildGraph(function () {}); }, 'value', "抛错：buildGraph(函数) field=value");
(function () {
    var cyc = { a: 1 };
    cyc.self = cyc;
    throws(function () { M.buildGraph(cyc); }, 'value', "抛错：buildGraph 循环引用 field=value");
    var arr = [1];
    arr.push(arr);
    throws(function () { M.buildGraph(arr); }, 'value', "抛错：buildGraph 数组循环引用 field=value");
    var o = { f: function () {} };
    throws(function () { M.buildGraph(o); }, 'value', "抛错：buildGraph 嵌套函数 field=value");
})();

/* ---------- 5. layoutGraph：锚点 ---------- */
(function () {
    var L = M.layoutGraph(M.buildGraph(ANCHOR));
    eq(L.nodes.length, 6, "layoutGraph 锚点：6 节点");
    eq(L.width, 1040, "layoutGraph 锚点：宽 1040（4 列×260）");
    eq(L.height, 192, "layoutGraph 锚点：高 192（3 叶子×64）");
    eq(L.hiddenCount, 0, "layoutGraph 锚点：隐藏 0 节点");
    var byId = {};
    L.nodes.forEach(function (n) { byId[n.id] = n; });
    eq(byId['$'].x, 0, "layoutGraph：根 x=0");
    eq(byId['$.a'].x, 260, "layoutGraph：深度 1 x=260");
    eq(byId['$.a.b'].x, 520, "layoutGraph：深度 2 x=520");
    eq(byId['$.a.b[0]'].x, 780, "layoutGraph：深度 3 x=780");
    eq(byId['$.a.b[0]'].y, 0, "layoutGraph：首叶子 y=0");
    eq(byId['$.a.b[1]'].y, 64, "layoutGraph：次叶子 y=64");
    eq(byId['$.c'].y, 128, "layoutGraph：第三叶子 y=128");
    eq(byId['$.a.b'].y, 32, "layoutGraph：父 y 为子 y 均值（0+64）/2=32");
    eq(byId['$.a'].y, 32, "layoutGraph：单子父 y 等于子 y");
    eq(byId['$'].y, 80, "layoutGraph：根 y 为子 y 均值（32+128）/2=80");
    eq(M.COL_WIDTH, 260, "layoutGraph：COL_WIDTH=260");
    eq(M.ROW_HEIGHT, 64, "layoutGraph：ROW_HEIGHT=64");
    /* 同列无重叠：同 x 的节点 y 间距 ≥ ROW_HEIGHT */
    var cols = {};
    L.nodes.forEach(function (n) {
        (cols[n.x] = cols[n.x] || []).push(n.y);
    });
    Object.keys(cols).forEach(function (x) {
        var ys = cols[x].sort(function (a, b) { return a - b; });
        for (var i = 1; i < ys.length; i++) {
            ok(ys[i] - ys[i - 1] >= 64, "layoutGraph：同列无重叠 x=" + x + " 间距 " + (ys[i] - ys[i - 1]));
        }
    });
    /* 深嵌套长链：同 y=0、x 按深度递增 */
    var deep = M.layoutGraph(M.buildGraph({ a: { b: { c: { d: { e: 1 } } } } }));
    eqj(deep.nodes.map(function (n) { return n.x; }), [0, 260, 520, 780, 1040, 1300], "layoutGraph：长链 x 按深度递增");
    ok(deep.nodes.every(function (n) { return n.y === 0; }), "layoutGraph：长链 y 全为 0");
    /* 单节点 */
    var one = M.layoutGraph(M.buildGraph(42));
    eq(one.nodes.length, 1, "layoutGraph：单节点 1 个");
    eq(one.width, 260, "layoutGraph：单节点宽 260");
    eq(one.height, 64, "layoutGraph：单节点高 64");
    eq(one.nodes[0].x, 0, "layoutGraph：单节点 x=0");
    eq(one.nodes[0].y, 0, "layoutGraph：单节点 y=0");
    /* 空图 */
    var empty = M.layoutGraph({ nodes: [], edges: [] });
    eq(empty.width, 0, "layoutGraph：空图宽 0");
    eq(empty.height, 0, "layoutGraph：空图高 0");
    eqj(empty.nodes, [], "layoutGraph：空图节点 []");
    /* 折叠：子树不参与布局 */
    var g2 = M.buildGraph(ANCHOR);
    g2.nodes[1].collapsed = true;
    var folded = M.layoutGraph(g2);
    eq(folded.nodes.length, 3, "layoutGraph：折叠后仅 3 可见节点");
    eq(folded.hiddenCount, 3, "layoutGraph：折叠隐藏 3 节点");
    eq(folded.width, 520, "layoutGraph：折叠后宽 520");
    eq(folded.height, 128, "layoutGraph：折叠后高 128");
})();
throws(function () { M.layoutGraph(null); }, 'graph', "抛错：layoutGraph(null) field=graph");
throws(function () { M.layoutGraph({}); }, 'graph', "抛错：layoutGraph({}) field=graph");
throws(function () { M.layoutGraph({ nodes: [{ id: 'x', parentId: 'y' }], edges: [] }); }, 'graph', "抛错：layoutGraph 无根节点 field=graph");

/* ---------- 6. formatJsonPath ---------- */
eq(M.formatJsonPath([]), '$', "formatJsonPath：[] → '$'");
eq(M.formatJsonPath(['store', 'book', 0, 'title']), '$.store.book[0].title', "formatJsonPath 锚点：['store','book',0,'title']");
eq(M.formatJsonPath(['my-key']), "$['my-key']", "formatJsonPath 锚点：特殊 key 用 $['my-key']");
eq(M.formatJsonPath(['a', 'b c']), "$.a['b c']", "formatJsonPath：含空格 key 用括号形式");
eq(M.formatJsonPath(['a', '0abc']), "$.a['0abc']", "formatJsonPath：数字开头 key 用括号形式");
eq(M.formatJsonPath(['a', '']), "$.a['']", "formatJsonPath：空 key 用括号形式");
eq(M.formatJsonPath(['a', 'b', 12]), '$.a.b[12]', "formatJsonPath：多段下标");
eq(M.formatJsonPath(["a'b"]), "$['a\\'b']", "formatJsonPath：单引号转义");
eq(M.formatJsonPath(['a\\b']), "$['a\\\\b']", "formatJsonPath：反斜杠转义");
eq(M.formatJsonPath(['_x', '$y', 'a1']), '$._x.$y.a1', "formatJsonPath：合法标识符用点记法");
throws(function () { M.formatJsonPath('$.a'); }, 'segments', "抛错：formatJsonPath('$.a') field=segments");
throws(function () { M.formatJsonPath(null); }, 'segments', "抛错：formatJsonPath(null) field=segments");
throws(function () { M.formatJsonPath(['a', true]); }, 'segments', "抛错：formatJsonPath 布尔段 field=segments");
throws(function () { M.formatJsonPath(['a', -1]); }, 'segments', "抛错：formatJsonPath 负下标 field=segments");
throws(function () { M.formatJsonPath(['a', 1.5]); }, 'segments', "抛错：formatJsonPath 非整数下标 field=segments");

/* ---------- 7. searchNodes ---------- */
(function () {
    var g = M.buildGraph(ANCHOR);
    eqj(M.searchNodes(g, 'b'), ['$.a.b'], "searchNodes：按 key 命中 $.a.b");
    eqj(M.searchNodes(g, 'B'), ['$.a.b'], "searchNodes：大小写不敏感");
    eqj(M.searchNodes(g, '1'), ['$.a.b[0]', '$.a.b[1]'], "searchNodes：值 1 与 key 1 各命中一个");
    eqj(M.searchNodes(g, 'null'), ['$.c'], "searchNodes：null 叶子按值命中");
    eqj(M.searchNodes(g, 'a'), ['$.a'], "searchNodes：按 key 命中 $.a（子节点 key 为 b/0/1 不含 a）");
    eqj(M.searchNodes(g, '2'), ['$.a.b[1]'], "searchNodes：按值 2 命中 $.a.b[1]");
    eqj(M.searchNodes(g, 'zzz'), [], "searchNodes：无命中返回 []");
    var g2 = M.buildGraph(M.parseJsonInput(M.samples[2].json));
    ok(M.searchNodes(g2, 'title').length === 2, "searchNodes：商店示例 title 命中 2 个");
    ok(M.searchNodes(g2, 'Sayings').length === 1, "searchNodes：值子串 Sayings 命中 1 个");
    eq(M.searchNodes(g2, 'Sayings')[0], '$.store.book[0].title', "searchNodes：值命中节点 id 精确");
})();
throws(function () { M.searchNodes(null, 'a'); }, 'graph', "抛错：searchNodes(null) field=graph");
throws(function () { M.searchNodes({}, 'a'); }, 'graph', "抛错：searchNodes({}) field=graph");
throws(function () { M.searchNodes(M.buildGraph(ANCHOR), ''); }, 'query', "抛错：searchNodes 空 query field=query");
throws(function () { M.searchNodes(M.buildGraph(ANCHOR), '   '); }, 'query', "抛错：searchNodes 纯空白 query field=query");
throws(function () { M.searchNodes(M.buildGraph(ANCHOR), 123); }, 'query', "抛错：searchNodes(123) field=query");

/* ---------- 8. countStats ---------- */
eqj(M.countStats(ANCHOR), { totalNodes: 6, maxDepth: 3, objects: 2, arrays: 1, leaves: 3 },
    "countStats 锚点：{\"a\":{\"b\":[1,2]},\"c\":null}→6/3/2/1/3");
eqj(M.countStats(42), { totalNodes: 1, maxDepth: 0, objects: 0, arrays: 0, leaves: 1 }, "countStats：单值 42");
eqj(M.countStats('hi'), { totalNodes: 1, maxDepth: 0, objects: 0, arrays: 0, leaves: 1 }, "countStats：单字符串");
eqj(M.countStats(null), { totalNodes: 1, maxDepth: 0, objects: 0, arrays: 0, leaves: 1 }, "countStats：null");
eqj(M.countStats([]), { totalNodes: 1, maxDepth: 0, objects: 0, arrays: 1, leaves: 0 }, "countStats：空数组");
eqj(M.countStats({}), { totalNodes: 1, maxDepth: 0, objects: 1, arrays: 0, leaves: 0 }, "countStats：空对象");
eqj(M.countStats([1, [2, [3]]]), { totalNodes: 6, maxDepth: 3, objects: 0, arrays: 3, leaves: 3 }, "countStats：三层嵌套数组");
throws(function () { M.countStats(undefined); }, 'value', "抛错：countStats(undefined) field=value");
throws(function () { M.countStats(function () {}); }, 'value', "抛错：countStats(函数) field=value");

/* ---------- 9. 预设示例：5 组 ---------- */
(function () {
    var expect = [
        { totalNodes: 30, maxDepth: 5, objects: 8, arrays: 2, leaves: 20 },
        { totalNodes: 16, maxDepth: 2, objects: 4, arrays: 1, leaves: 11 },
        { totalNodes: 16, maxDepth: 4, objects: 5, arrays: 1, leaves: 10 },
        { totalNodes: 8, maxDepth: 7, objects: 7, arrays: 0, leaves: 1 },
        { totalNodes: 11, maxDepth: 2, objects: 3, arrays: 3, leaves: 5 }
    ];
    eq(M.samples.length, 5, "预设：5 组示例 JSON");
    M.samples.forEach(function (s, i) {
        var v = M.parseJsonInput(s.json);
        var g = M.buildGraph(v);
        eqj(M.countStats(v), expect[i], "预设 " + i + "（" + s.name + "）统计精确值");
        eq(g.edges.length, g.nodes.length - 1, "预设 " + i + "（" + s.name + "）edges=nodes−1");
        eq(g.truncated, false, "预设 " + i + "（" + s.name + "）不截断");
        var L = M.layoutGraph(g);
        eq(L.nodes.length, g.nodes.length, "预设 " + i + "（" + s.name + "）布局节点数一致");
        /* 同列无重叠（预设全量复核） */
        var cols = {};
        L.nodes.forEach(function (n) { (cols[n.x] = cols[n.x] || []).push(n.y); });
        Object.keys(cols).forEach(function (x) {
            var ys = cols[x].sort(function (a, b) { return a - b; });
            for (var j = 1; j < ys.length; j++) {
                ok(ys[j] - ys[j - 1] >= 64, "预设 " + i + " 同列无重叠 x=" + x);
            }
        });
        ok(s.json.length <= 100000, "预设 " + i + "（" + s.name + "）长度合规");
    });
    var g2 = M.buildGraph(M.parseJsonInput(M.samples[2].json));
    ok(g2.nodes.some(function (n) { return n.id === '$.store.book[0].title'; }),
        "预设商店：含节点 $.store.book[0].title");
    var g4 = M.buildGraph(M.parseJsonInput(M.samples[4].json));
    ok(g4.nodes.some(function (n) { return n.id === "$['my-key']"; }),
        "预设边界：含特殊 key 节点 $['my-key']");
})();

/* ---------- 10. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 321, "注册 Path 总数 320→321");
has(GO_SRC, "\"json_graph_viewer\"", "注册：ID json_graph_viewer");
has(GO_SRC, "\"/tools/json-graph-viewer\"", "注册：Path /tools/json-graph-viewer");
has(GO_SRC, "\"bubble_chart\"", "注册：Icon bubble_chart");
eq((GO_SRC.match(/Icon:\s*"bubble_chart"/g) || []).length, 1, "Icon bubble_chart 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"json_graph_viewer\"") - 60,
    GO_SRC.indexOf("\"json_graph_viewer\"") + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"格式化工具"/.test(entryBlock), "注册：类目 格式化工具");
has(entryBlock, "JSON 结构图可视化", "注册：名称 JSON 结构图可视化");
ok(GO_SRC.indexOf("\"json_graph_viewer\"") > GO_SRC.indexOf("\"/tools/json-parser\"") &&
    GO_SRC.indexOf("\"json_graph_viewer\"") < GO_SRC.indexOf("\"json_string_escaper\""),
    "注册：紧邻 json_parser（在其后、json_string_escaper 之前）");

/* ---------- 11. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "{{define \"json_graph_viewer\"}}", "模板：define json_graph_viewer");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/json-graph-viewer", "模板 canonical 含新 Path");
has(TPL_SRC, "JSON 结构图可视化", "模板：标题含工具名");
has(TPL_SRC, "JSON 可视化", "模板：SEO 关键词 JSON 可视化");
has(TPL_SRC, "JSON 结构图", "模板：SEO 关键词 JSON 结构图");
has(TPL_SRC, "JSON 转关系图", "模板：SEO 关键词 JSON 转关系图");
has(TPL_SRC, "JSON 节点图", "模板：SEO 关键词 JSON 节点图");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "只做结构图可视化", "模板：真限制 1 只做结构图可视化");
has(TPL_SRC, "超大 JSON 会截断", "模板：真限制 2 超大 JSON 截断");
has(TPL_SRC, "循环引用不支持", "模板：真限制 3 循环引用不支持");
has(TPL_SRC, "分层树形布局，非力导向图", "模板：真限制 4 分层树形非力导向");
has(TPL_SRC, "本地零上传", "模板：真限制 5 本地零上传");
has(TPL_SRC, "id=\"jg-input\"", "模板：输入框 jg-input");
has(TPL_SRC, "id=\"jg-render-btn\"", "模板：生成按钮");
has(TPL_SRC, "id=\"jg-presets\"", "模板：预设示例容器");
has(TPL_SRC, "id=\"jg-stats\"", "模板：统计面板容器");
has(TPL_SRC, "id=\"jg-graph-wrap\"", "模板：结构图容器");
has(TPL_SRC, "id=\"jg-search\"", "模板：搜索框");
has(TPL_SRC, "id=\"jg-search-btn\"", "模板：搜索定位按钮");
has(TPL_SRC, "id=\"jg-locate-next\"", "模板：下一个命中按钮");
has(TPL_SRC, "id=\"jg-zoom-in\"", "模板：放大按钮");
has(TPL_SRC, "id=\"jg-zoom-out\"", "模板：缩小按钮");
has(TPL_SRC, "id=\"jg-zoom-reset\"", "模板：重置视图按钮");
has(TPL_SRC, "id=\"jg-zoom-label\"", "模板：缩放比例标签");
has(TPL_SRC, "id=\"jg-selected\"", "模板：选中节点面板");
has(TPL_SRC, "id=\"jg-copy-path\"", "模板：复制 JSON Path 按钮");
has(TPL_SRC, "id=\"jg-copy-value\"", "模板：复制节点值按钮");
has(TPL_SRC, "id=\"jg-svgdl\"", "模板：SVG 下载按钮");
has(TPL_SRC, "id=\"jg-png\"", "模板：PNG 导出按钮");
has(TPL_SRC, "id=\"jg-legend\"", "模板：节点类型图例");
has(TPL_SRC, "id=\"jg-err\"", "模板：错误提示容器");
has(TPL_SRC, "/tools/static/js/json_graph_viewer.js", "模板：引用本地 JS");
has(TPL_SRC, "/tools/json-parser", "模板：互链 json_parser");
has(TPL_SRC, "/tools/jsonpath-tester", "模板：互链 jsonpath_tester");
has(TPL_SRC, "不做格式化／校验", "模板：互链分工说明含不做格式化／校验");
has(TPL_SRC, "不做 JSONPath 查询", "模板：互链分工说明含不做 JSONPath 查询");
has(TPL_SRC, "对象 object", "模板：图例含对象");
has(TPL_SRC, "数组 array", "模板：图例含数组");
has(TPL_SRC, "0.2–3x", "模板：缩放范围 0.2–3x");
has(TPL_SRC, "100000", "模板：输入上限 100000 字符");
has(TPL_SRC, "3000", "模板：截断阈值 3000 节点");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "unpkg", "模板零 CDN：无 unpkg");
notHas(TPL_SRC, "jsdelivr", "模板零 CDN：无 jsdelivr");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/json-graph-viewer") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 12. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.JsonGraphViewer", "导出：挂 window.JsonGraphViewer");
has(JS_SRC, "parseJsonInput", "绑定：输入校验函数");
has(JS_SRC, "buildGraph", "绑定：建图函数");
has(JS_SRC, "layoutGraph", "绑定：分层布局函数");
has(JS_SRC, "formatJsonPath", "绑定：路径格式化函数");
has(JS_SRC, "searchNodes", "绑定：搜索函数");
has(JS_SRC, "countStats", "绑定：统计函数");
has(JS_SRC, "SAMPLES", "绑定：预设示例数组");
ok((JS_SRC.match(/name: '[^']+'/g) || []).length >= 5, "绑定：至少 5 组预设示例");
has(JS_SRC, "renderAll", "绑定：渲染入口");
has(JS_SRC, "jg-graph-wrap", "绑定：结构图容器 id");
has(JS_SRC, "jg-stats", "绑定：统计面板容器 id");
has(JS_SRC, "jg-selected", "绑定：选中节点面板 id");
has(JS_SRC, "navigator.clipboard", "绑定：复制用 clipboard");
has(JS_SRC, "toBlob", "绑定：PNG 导出用 canvas toBlob");
has(JS_SRC, "data-collapse", "绑定：节点折叠标记");
has(JS_SRC, "MIN_SCALE", "绑定：缩放下限常量");
has(JS_SRC, "MAX_SCALE", "绑定：缩放上限常量");
has(JS_SRC, "MAX_NODES", "绑定：节点上限常量");
has(JS_SRC, "贝塞尔", "绑定：贝塞尔连线注释");
notHas(JS_SRC, "cdnjs", "绑定：无 CDN 引用");
notHas(JS_SRC, "fetch(", "绑定：不发起后端请求");
notHas(JS_SRC, "XMLHttpRequest", "绑定：不使用 XHR");
notHas(JS_SRC, "d3.", "绑定：不引入 d3");

console.log("json_graph_viewer: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);

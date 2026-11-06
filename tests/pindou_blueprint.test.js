/* 图片转拼豆施工图生成器纯逻辑单元测试（零依赖）：node tests/pindou_blueprint.test.js
 * 覆盖：
 *  1. validatePindouConfig 契约（gridSize[8,64]／paletteSize[2,64]／beadSizeMm∈{2.6,5}，
 *     err.field 逐字：config/gridSize/paletteSize/beadSizeMm）
 *  2. hexToRgb 契约（逐字；非法 hex err.field='hex'）
 *  3. quantizeToPalette 契约（最近色确定性；并列取序号小者；paletteSize 取色上限与尾部合并；
 *     非法 palette/paletteSize/pixels err.field 逐字）
 *  4. countBeads 契约（计数逐字；降序+符号序确定性；越界 err.field='indices'）
 *  5. buildPindouFileName 契约（固定时间逐字；规格正则；now 非法 err.field='now'）
 *  6. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 263→264
 *  7. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket/EventSource；模板无外部 script CDN）
 *  8. 模板：SEO 面板、真限制四条、与 pixel_art_converter 双向互链「像素一条龙」、
 *     表单字段边界（grid 8~64 默认 29／palette 2~64 默认 24／豆子规格 5 与 2.6）
 */
"use strict";
var T = require("../static/js/pindou_blueprint.js");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
    try { fn(); }
    catch (e) {
        ok(e instanceof Error && e.field === field, name + "（err.field=" + field + "）");
        return;
    }
    ok(false, name + "（期望抛出 Error）");
}

/* ================= 1. validatePindouConfig ================= */
(function () {
    deepEq(T.validatePindouConfig({ gridSize: 29, paletteSize: 24, beadSizeMm: 5 }),
        { gridSize: 29, paletteSize: 24, beadSizeMm: 5 }, "合法配置逐字通过（29/24/5）");
    deepEq(T.validatePindouConfig({ gridSize: 8, paletteSize: 2, beadSizeMm: 2.6 }),
        { gridSize: 8, paletteSize: 2, beadSizeMm: 2.6 }, "下界逐字通过（8/2/2.6）");
    deepEq(T.validatePindouConfig({ gridSize: 64, paletteSize: 64, beadSizeMm: 5 }),
        { gridSize: 64, paletteSize: 64, beadSizeMm: 5 }, "上界逐字通过（64/64/5）");
    throwsField(function () { T.validatePindouConfig(null); }, "config", "config=null 抛 Error（err.field=config）");
    throwsField(function () { T.validatePindouConfig([1]); }, "config", "config 为数组抛 Error（err.field=config）");
    throwsField(function () { T.validatePindouConfig("x"); }, "config", "config 非对象抛 Error（err.field=config）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 7, paletteSize: 24, beadSizeMm: 5 }); }, "gridSize", "规格向量：gridSize=7 抛 Error（err.field=gridSize）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 65, paletteSize: 24, beadSizeMm: 5 }); }, "gridSize", "gridSize=65 抛 Error（err.field=gridSize）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 29.5, paletteSize: 24, beadSizeMm: 5 }); }, "gridSize", "gridSize 非整数抛 Error（err.field=gridSize）");
    throwsField(function () { T.validatePindouConfig({ gridSize: "29", paletteSize: 24, beadSizeMm: 5 }); }, "gridSize", "gridSize 非数字抛 Error（err.field=gridSize）");
    throwsField(function () { T.validatePindouConfig({ paletteSize: 24, beadSizeMm: 5 }); }, "gridSize", "gridSize 缺失抛 Error（err.field=gridSize）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 29, paletteSize: 1, beadSizeMm: 5 }); }, "paletteSize", "规格向量：paletteSize=1 抛 Error（err.field=paletteSize）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 29, paletteSize: 65, beadSizeMm: 5 }); }, "paletteSize", "paletteSize=65 抛 Error（err.field=paletteSize）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 29, paletteSize: 24.5, beadSizeMm: 5 }); }, "paletteSize", "paletteSize 非整数抛 Error（err.field=paletteSize）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 29, paletteSize: NaN, beadSizeMm: 5 }); }, "paletteSize", "paletteSize=NaN 抛 Error（err.field=paletteSize）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 29, paletteSize: 24, beadSizeMm: 3 }); }, "beadSizeMm", "规格向量：beadSizeMm=3 抛 Error（err.field=beadSizeMm）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 29, paletteSize: 24, beadSizeMm: "5" }); }, "beadSizeMm", "beadSizeMm 字符串抛 Error（err.field=beadSizeMm）");
    throwsField(function () { T.validatePindouConfig({ gridSize: 29, paletteSize: 24 }); }, "beadSizeMm", "beadSizeMm 缺失抛 Error（err.field=beadSizeMm）");
})();

/* ================= 2. hexToRgb ================= */
(function () {
    deepEq(T.hexToRgb("#E60012"), { r: 230, g: 0, b: 18 }, "hex 解析逐字（#E60012）");
    deepEq(T.hexToRgb("#ffffff"), { r: 255, g: 255, b: 255 }, "hex 解析逐字（#ffffff）");
    deepEq(T.hexToRgb("1C1C1C"), { r: 28, g: 28, b: 28 }, "无 # 前缀可解析");
    throwsField(function () { T.hexToRgb("#fff"); }, "hex", "3 位 hex 抛 Error（err.field=hex）");
    throwsField(function () { T.hexToRgb("notacolor"); }, "hex", "非法字符串抛 Error（err.field=hex）");
    throwsField(function () { T.hexToRgb(123); }, "hex", "非字符串抛 Error（err.field=hex）");
})();

/* ================= 3. quantizeToPalette ================= */
var MINI = [["A", "红", "#ff0000"], ["B", "绿", "#00ff00"], ["C", "蓝", "#0000ff"]];
function rgba(r, g, b) { return [r, g, b, 255]; }
function pxGrid(list, w, h) {
    var out = [];
    for (var i = 0; i < list.length; i++) { out = out.concat(rgba(list[i][0], list[i][1], list[i][2])); }
    return out;
}
(function () {
    /* 2×2：纯红、纯绿、纯蓝、近红(250,10,10) */
    var px = pxGrid([[255, 0, 0], [0, 255, 0], [0, 0, 255], [250, 10, 10]], 2, 2);
    var q = T.quantizeToPalette(px, 2, 2, MINI, 3);
    deepEq(q.indices, [0, 1, 2, 0], "最近色确定性：近红归红（indices 逐字）");
    eq(q.colors.length, 3, "paletteSize=3 全保留");
    deepEq([q.colors[0].code, q.colors[1].code, q.colors[2].code], ["A", "B", "C"], "颜色按豆数降序+序号升序（A:2 B:1 C:1）");
    eq(q.colors[0].symbol, "A", "首色符号为 A");
    eq(q.colors[1].symbol, "B", "次色符号为 B");

    /* 取色上限：paletteSize=2，尾部蓝合并到最近保留色（红，与蓝距离 130050 < 绿） */
    var q2 = T.quantizeToPalette(px, 2, 2, MINI, 2);
    eq(q2.colors.length, 2, "paletteSize=2 只保留 2 色");
    deepEq(q2.indices, [0, 1, 0, 0], "尾部蓝合并到最近保留色红（indices 逐字）");
    deepEq([q2.colors[0].code, q2.colors[1].code], ["A", "B"], "保留色为频次最高的红、绿");

    /* 并列距离取序号小者：(255,0,255) 到红与蓝距离相等 → 红（序号 0） */
    var pxTie = pxGrid([[255, 0, 255]], 1, 1);
    var q3 = T.quantizeToPalette(pxTie, 1, 1, MINI, 3);
    eq(q3.indices[0], 0, "并列距离取序号更小者（红）");
    eq(q3.colors.length, 1, "单像素只产出 1 色");

    /* 确定性：两次调用结果逐字一致 */
    var qa = T.quantizeToPalette(px, 2, 2, MINI, 3);
    var qb = T.quantizeToPalette(px, 2, 2, MINI, 3);
    deepEq(qa, qb, "确定性：两次量化结果逐字一致");

    /* 内置色板规模 */
    eq(T.PINDOU_PALETTE.length, 60, "内置拼豆色板 60 色");
    eq(T.PINDOU_SYMBOLS.length, 64, "施工图符号 64 个");
    ok(T.PINDOU_SYMBOLS.indexOf("A") !== -1 && T.PINDOU_SYMBOLS.indexOf("9") !== -1, "符号含字母与数字");

    throwsField(function () { T.quantizeToPalette(px, 2, 2, [], 3); }, "palette", "空色板抛 Error（err.field=palette）");
    throwsField(function () { T.quantizeToPalette(px, 2, 2, MINI, 0); }, "paletteSize", "paletteSize=0 抛 Error（err.field=paletteSize）");
    throwsField(function () { T.quantizeToPalette(px, 2, 2, MINI, 4); }, "paletteSize", "paletteSize 超色板长度抛 Error（err.field=paletteSize）");
    throwsField(function () { T.quantizeToPalette([1, 2, 3], 2, 2, MINI, 3); }, "pixels", "像素数据不足抛 Error（err.field=pixels）");
})();

/* ================= 4. countBeads ================= */
(function () {
    var colors = [
        { code: "A", name: "红", hex: "#ff0000", symbol: "A" },
        { code: "B", name: "绿", hex: "#00ff00", symbol: "B" },
        { code: "C", name: "蓝", hex: "#0000ff", symbol: "C" }
    ];
    var rows = T.countBeads([0, 0, 1, 0, 2, 1], colors);
    deepEq(rows.map(function (r) { return r.count; }), [3, 2, 1], "计数逐字（3/2/1）");
    deepEq(rows.map(function (r) { return r.code; }), ["A", "B", "C"], "按豆数降序逐字");
    deepEq(rows[0], { code: "A", name: "红", hex: "#ff0000", symbol: "A", count: 3 }, "首行逐字");

    /* 并列 count：符号序升序（确定性） */
    var rows2 = T.countBeads([2, 0], colors);
    deepEq(rows2.map(function (r) { return r.code; }), ["A", "C", "B"], "count 并列时按符号序（A 在 C 前，0 颗的 B 殿后）");
    eq(rows2[0].count, 1, "并列 count 均为 1");

    throwsField(function () { T.countBeads(null, colors); }, "indices", "indices 非法抛 Error（err.field=indices）");
    throwsField(function () { T.countBeads([0, 5], colors); }, "indices", "indices 越界抛 Error（err.field=indices）");
    throwsField(function () { T.countBeads([0], []); }, "colors", "空 colors 抛 Error（err.field=colors）");
})();

/* ================= 5. buildPindouFileName ================= */
(function () {
    eq(T.buildPindouFileName(new Date(2026, 10, 2, 1, 2, 3)), "pindou_blueprint_20261102_010203.png", "规格向量：固定时间逐字");
    var nm = T.buildPindouFileName();
    ok(/^pindou_blueprint_\d{8}_\d{6}\.png$/.test(nm), "默认时间为现在（规格正则 " + nm + "）");
    ok(/^pindou_blueprint_\d{8}_\d{6}\.png$/.test(T.buildPindouFileName(null)), "now=null 视为现在");
    throwsField(function () { T.buildPindouFileName("2026"); }, "now", "now 非 Date 抛 Error（err.field=now）");
    throwsField(function () { T.buildPindouFileName(new Date("invalid")); }, "now", "now 非法日期抛 Error（err.field=now）");
})();

/* ================= 6. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    contains(GO_SRC, 'ID:          "pindou_blueprint"', "注册 ID 为 pindou_blueprint");
    contains(GO_SRC, 'Path:        "/tools/pindou-blueprint"', "注册 Path 为 /tools/pindou-blueprint");
    contains(GO_SRC, 'Icon:        "grain"', "注册 Icon 为 grain");
    var m = /ID:\s*"pindou_blueprint"[\s\S]{0,2000}?Category:\s*"([^"]+)"/.exec(GO_SRC);
    eq(m ? m[1] : "", "图片处理", "注册 Category 为 图片处理");
    ok(/ID:\s*"pindou_blueprint"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    contains(GO_SRC, 'Name:        "图片转拼豆施工图生成器"', "注册 Name");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 318, "注册 Path 总数 309→310");
})();

/* ================= 7. 零网络请求静态检查 ================= */
(function () {
    var JS = fs.readFileSync(path.join(ROOT, "static", "js", "pindou_blueprint.js"), "utf8");
    notContains(JS, "fetch(", "JS 无 fetch");
    notContains(JS, "XMLHttpRequest", "JS 无 XHR");
    notContains(JS, "WebSocket", "JS 无 WebSocket");
    notContains(JS, "EventSource", "JS 无 EventSource");
    var HTML = fs.readFileSync(path.join(ROOT, "templates", "pindou_blueprint.html"), "utf8");
    notContains(HTML, "https://cdn", "模板无 CDN 引用");
    notContains(HTML, "http://cdn", "模板无 CDN 引用（http）");
})();

/* ================= 8. 模板：SEO 面板／真限制四条／双向互链／表单边界 ================= */
(function () {
    var HTML = fs.readFileSync(path.join(ROOT, "templates", "pindou_blueprint.html"), "utf8");
    contains(HTML, "<title>图片转拼豆施工图生成器", "SEO：title 含工具名");
    contains(HTML, 'name="description"', "SEO：meta description");
    contains(HTML, 'name="keywords"', "SEO：meta keywords");
    contains(HTML, 'rel="canonical" href="https://www.johnkingzcq123.xyz/tools/pindou-blueprint"', "SEO：canonical");
    contains(HTML, '"@type":"SoftwareApplication"', "SEO：JSON-LD SoftwareApplication");
    contains(HTML, "屏幕色 ≠ 实物豆色", "真限制①：屏幕色与实物豆色差");
    contains(HTML, "色号为本工具内部编号，非官方全库", "真限制②：色号体系非官方全库");
    contains(HTML, "浏览器内存限制", "真限制③：浏览器内存限制");
    contains(HTML, "纯本地零上传", "真限制④：纯本地零上传");
    contains(HTML, "像素一条龙", "本页含「像素一条龙」");
    contains(HTML, 'href="/tools/pixel-art-converter"', "本页互链到 pixel-art-converter");
    var PX = fs.readFileSync(path.join(ROOT, "templates", "pixel_art_converter.html"), "utf8");
    contains(PX, 'href="/tools/pindou-blueprint"', "pixel_art_converter 回链到本工具（双向互链）");
    contains(PX, "像素一条龙", "pixel_art_converter 含「像素一条龙」");
    contains(HTML, 'id="pd-grid" min="8" max="64"', "格数滑杆边界 8~64");
    contains(HTML, 'value="29"', "格数默认 29（贴合标准板）");
    contains(HTML, 'id="pd-palette" min="2" max="64"', "色数滑杆边界 2~64");
    contains(HTML, 'value="24"', "色数默认 24");
    contains(HTML, 'value="5" checked', "豆子规格默认 5mm");
    contains(HTML, 'value="2.6"', "豆子规格可选 2.6mm");
    contains(HTML, "29×29", "页面明示 29×29 标准板");
})();

console.log("\n通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail ? 1 : 0);

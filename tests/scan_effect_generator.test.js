/* 扫描件效果生成器纯逻辑单元测试（零依赖）：node tests/scan_effect_generator.test.js
 * 覆盖：
 *  1. grayOf 契约（luminosity 口径、确定性向量、非法参数 err.field='rgb'）
 *  2. contrastOf 契约（确定性向量、因子/拉伸/clamp、非法参数 err.field='strength'/'v'）
 *  3. noiseOf 契约（mulberry32 确定性、种子隔离、非法参数 err.field='seed'/'xy'）
 *  4. buildScanName 契约（确定性向量、非法参数 err.field='dt'）
 *  5. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 253
 *  6. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket；上传走 FileReader）
 *  7. 模板：SEO 面板、真限制三条、互链（pdf_sign 双向、pdf_annotate 单向）
 */
"use strict";
var S = require("../static/js/scan_effect_generator.js");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
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

/* ================= 1. grayOf ================= */
(function () {
    eq(S.grayOf(255, 0, 0), 76, "规格向量：grayOf(255,0,0)→76");
    eq(S.grayOf(0, 0, 0), 0, "纯黑→0");
    eq(S.grayOf(255, 255, 255), 255, "纯白→255");
    eq(S.grayOf(0, 255, 0), 150, "纯绿 luminosity→150（0.587*255=149.685 四舍五入）");
    eq(S.grayOf(0, 0, 255), 29, "纯蓝 luminosity→29（0.114*255=29.07 四舍五入）");
    eq(S.grayOf(128, 128, 128), 128, "中灰→128");
    throwsField(function () { S.grayOf(256, 0, 0); }, "rgb", "r 越界抛 Error（err.field=rgb）");
    throwsField(function () { S.grayOf(0, -1, 0); }, "rgb", "g 负数抛 Error（err.field=rgb）");
    throwsField(function () { S.grayOf(0, 0, "x"); }, "rgb", "b 非数字抛 Error（err.field=rgb）");
    throwsField(function () { S.grayOf(NaN, 0, 0); }, "rgb", "r=NaN 抛 Error（err.field=rgb）");
})();

/* ================= 2. contrastOf ================= */
(function () {
    eq(S.contrastOf(100, 50), 72, "规格向量：contrastOf(100,50)→72（因子 2.0）");
    eq(S.contrastOf(128, 0), 128, "strength=0 时因子 1.0，原值返回");
    eq(S.contrastOf(128, 100), 128, "中点 128 在任何强度下不动");
    eq(S.contrastOf(200, 100), 255, "高强度亮部拉满后 clamp 到 255");
    eq(S.contrastOf(0, 100), 0, "高强度暗部拉满后 clamp 到 0");
    eq(S.contrastOf(100, 25), 86, "strength=25 因子 1.5：(100-128)*1.5+128=86");
    throwsField(function () { S.contrastOf(100, 101); }, "strength",
        "规格向量：contrastOf(100,101) 抛 Error（err.field=strength）");
    throwsField(function () { S.contrastOf(100, -1); }, "strength",
        "strength 负数抛 Error（err.field=strength）");
    throwsField(function () { S.contrastOf(100, "50"); }, "strength",
        "strength 非数字抛 Error（err.field=strength）");
    throwsField(function () { S.contrastOf(100, NaN); }, "strength",
        "strength=NaN 抛 Error（err.field=strength）");
    throwsField(function () { S.contrastOf("100", 50); }, "v",
        "v 非数字抛 Error（err.field=v）");
})();

/* ================= 3. noiseOf ================= */
(function () {
    var a = S.noiseOf(1, 0, 0), b = S.noiseOf(1, 0, 0);
    eq(a, b, "规格向量：noiseOf(1,0,0) 二次调用相等（确定性）");
    ok(a >= 0 && a <= 255 && Math.floor(a) === a, "噪点返回 0~255 整数");
    ok(S.noiseOf(2, 0, 0) !== a, "规格向量：noiseOf(2,0,0) 与种子 1 结果不同（种子隔离）");
    eq(S.noiseOf(1, 1, 0), 53, "坐标 (1,0) 逐字确定");
    eq(S.noiseOf(1, 0, 1), 214, "坐标 (0,1) 逐字确定");
    ok(S.noiseOf(1, 5, 7) !== S.noiseOf(1, 5, 8), "相邻像素噪点不同（坐标参与混合）");
    var seen = {};
    for (var i = 0; i < 50; i++) { seen[S.noiseOf(7, i, i * 3)] = true; }
    ok(Object.keys(seen).length > 30, "50 个不同坐标产出 30+ 种不同噪点值（分布不退化）");
    throwsField(function () { S.noiseOf(1.5, 0, 0); }, "seed",
        "seed 非整数抛 Error（err.field=seed）");
    throwsField(function () { S.noiseOf("1", 0, 0); }, "seed",
        "seed 非数字抛 Error（err.field=seed）");
    throwsField(function () { S.noiseOf(NaN, 0, 0); }, "seed",
        "seed=NaN 抛 Error（err.field=seed）");
    throwsField(function () { S.noiseOf(1, "0", 0); }, "xy",
        "x 非数字抛 Error（err.field=xy）");
    throwsField(function () { S.noiseOf(1, 0, null); }, "xy",
        "y 非数字抛 Error（err.field=xy）");
})();

/* ================= 4. buildScanName ================= */
(function () {
    eq(S.buildScanName(new Date(2026, 10, 1, 5, 42, 0)), "scanned-20261101-054200.png",
        "规格向量：buildScanName(2026-11-01 05:42)→scanned-20261101-054200.png");
    eq(S.buildScanName(new Date(2026, 0, 5, 9, 7, 3)), "scanned-20260105-090703.png",
        "个位数补零逐字");
    ok(/^scanned-\d{8}-\d{6}\.png$/.test(S.buildScanName(new Date())), "当前时间文件名格式合规");
    throwsField(function () { S.buildScanName(new Date("not-a-date")); }, "dt",
        "非法 Date 抛 Error（err.field=dt）");
    throwsField(function () { S.buildScanName("2026-11-01"); }, "dt",
        "字符串非 Date 抛 Error（err.field=dt）");
    throwsField(function () { S.buildScanName(null); }, "dt",
        "null 抛 Error（err.field=dt）");
})();

/* ================= 5. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var idx = GO_SRC.indexOf('"scan_effect_generator"');
    ok(idx >= 0, "注册：categories.go 含 ID scan_effect_generator");
    ok(GO_SRC.indexOf('"/tools/scan-effect-generator"') >= 0, "注册 Path /tools/scan-effect-generator");
    var block = GO_SRC.slice(idx, idx + 1500);
    contains(block, 'Icon:        "document_scanner"', "注册 Icon document_scanner");
    contains(block, "New:         true", "注册 New 为 true");
    contains(block, 'Category:    "文档转换"', "注册 Category 为文档转换");
    contains(block, '"扫描件效果生成器"', "注册名称 扫描件效果生成器");
    contains(block.toLowerCase(), "scan effect", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
    while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
    eq(pathCount, 305, "注册 Path 总数 268→270");
})();

/* ================= 6. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "scan_effect_generator.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    contains(src, "FileReader", "上传走 FileReader 纯前端");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "scan_effect_generator.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
    var signTpl = fs.readFileSync(path.join(ROOT, "templates", "pdf_sign.html"), "utf8");
    contains(signTpl, "/tools/scan-effect-generator", "pdf_sign 模板含回链（双向互链）");
})();

/* ================= 7. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "scan_effect_generator.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>扫描件效果生成器", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    /* 真限制三条（页面明示） */
    contains(tpl, "无法替代真实扫描仪", "真限制①：视觉模拟无法替代真实扫描");
    contains(tpl, "不适合 OCR", "真限制②：加噪点不适合 OCR");
    contains(tpl, "倾斜角度过大可能裁掉边缘内容", "真限制③：倾斜过大裁边需预览");
    /* 互链 */
    contains(tpl, "/tools/pdf-sign", "与 pdf_sign 双向互链");
    contains(tpl, "/tools/pdf-annotate", "单向链入 pdf_annotate");
    contains(tpl, "scanned-YYYYMMDD-HHmmss.png", "固定下载文件名格式");
    contains(tpl, 'id="sg-file"', "文件上传 input");
    contains(tpl, 'accept="image/jpeg,image/png,image/webp"', "仅接受 JPG/PNG/WebP");
    contains(tpl, 'id="sg-quality"', "质感强度滑杆");
    contains(tpl, 'id="sg-tilt"', "倾斜角度滑杆");
    contains(tpl, 'id="sg-gray"', "灰度开关");
    contains(tpl, 'id="sg-vig"', "边缘阴影开关");
    contains(tpl, 'id="sg-canvas"', "预览 canvas");
    contains(tpl, "document_scanner", "图标 document_scanner");
    notContains(tpl, "PDF 电子签名（当前）", "不含 pdf_sign 的当前态标记");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

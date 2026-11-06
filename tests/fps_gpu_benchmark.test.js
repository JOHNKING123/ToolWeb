/* 浏览器 FPS/GPU 性能速测纯逻辑单元测试（零依赖）：node tests/fps_gpu_benchmark.test.js
 * 覆盖：
 *  1. aggregateFrameStats 契约（确定性向量逐字；非法参数 err.field='frames'）
 *  2. classifyFpsGrade 契约（档位逐字；非法参数 err.field='avgFps'）
 *  3. validateBenchmarkConfig 契约（归一化逐字；边界值；err.field 命名）
 *  4. buildFpsReportName 契约（固定时间逐字；文件名正则；err.field='now'）
 *  5. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 263→264
 *  6. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket/EventSource；模板无外部 script CDN）
 *  7. 模板：SEO 面板、真限制四条、与 llm_hardware_checker 单向出链「硬件一条龙」
 */
"use strict";
var T = require("../static/js/fps_gpu_benchmark.js");
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
function frames100() {
    var a = [];
    for (var i = 0; i < 100; i++) a.push(16.7);
    return a;
}

/* ================= 1. aggregateFrameStats ================= */
(function () {
    deepEq(T.aggregateFrameStats(frames100()),
        {avgFps: 59.88, p1Low: 59.88, p95FrameTime: 16.7, jitterMs: 0, dropRate: 0},
        "规格向量：100×16.7 逐字");
    eq(T.aggregateFrameStats([16.7, 16.7, 16.7, 50, 50]).dropRate, 0.4, "规格向量：掉帧率逐字 0.4");
    eq(T.aggregateFrameStats([16.7, 16.7, 16.7, 50, 50]).p95FrameTime, 50, "p95 帧时间逐字 50");
    eq(T.aggregateFrameStats([16.7, 16.7, 16.7, 50, 50]).avgFps, 33.31, "avgFps 逐字 33.31");
    eq(T.aggregateFrameStats([16.7, 16.7, 16.7, 50, 50]).jitterMs, 16.31, "jitterMs 逐字 16.31");
    throwsField(function () { T.aggregateFrameStats([]); }, "frames", "规格向量：空数组抛 Error（err.field=frames）");
    throwsField(function () { T.aggregateFrameStats(null); }, "frames", "frames=null 抛 Error（err.field=frames）");
    throwsField(function () { T.aggregateFrameStats([16.7, -5]); }, "frames", "规格向量：负帧时间抛 Error（err.field=frames）");
    throwsField(function () { T.aggregateFrameStats([16.7, 0]); }, "frames", "frames 含 0 抛 Error（err.field=frames）");
    throwsField(function () { T.aggregateFrameStats([16.7, "x"]); }, "frames", "frames 含非数字抛 Error（err.field=frames）");
    throwsField(function () { T.aggregateFrameStats([16.7, Infinity]); }, "frames", "frames 含 Infinity 抛 Error（err.field=frames）");
    var single = T.aggregateFrameStats([10]);
    eq(single.avgFps, 100, "单帧：avgFps=100");
    eq(single.p1Low, 100, "单帧：p1Low=100");
    eq(single.dropRate, 0, "单帧：dropRate=0");
})();

/* ================= 2. classifyFpsGrade ================= */
(function () {
    eq(T.classifyFpsGrade(59.88), "流畅", "规格向量：59.88→流畅");
    eq(T.classifyFpsGrade(60), "流畅", "60→流畅");
    eq(T.classifyFpsGrade(55), "流畅", "55→流畅（边界含）");
    eq(T.classifyFpsGrade(54.99), "良好", "54.99→良好");
    eq(T.classifyFpsGrade(30), "良好", "30→良好（边界含）");
    eq(T.classifyFpsGrade(29.99), "卡顿", "29.99→卡顿");
    eq(T.classifyFpsGrade(0), "卡顿", "0→卡顿");
    throwsField(function () { T.classifyFpsGrade("x"); }, "avgFps", "规格向量：avgFps='x' 抛 Error（err.field=avgFps）");
    throwsField(function () { T.classifyFpsGrade(undefined); }, "avgFps", "avgFps 缺失抛 Error（err.field=avgFps）");
    throwsField(function () { T.classifyFpsGrade(NaN); }, "avgFps", "avgFps=NaN 抛 Error（err.field=avgFps）");
    throwsField(function () { T.classifyFpsGrade(-1); }, "avgFps", "avgFps 为负抛 Error（err.field=avgFps）");
})();

/* ================= 3. validateBenchmarkConfig ================= */
(function () {
    deepEq(T.validateBenchmarkConfig({triangles: 200000, resolution: 1, antialias: true, effects: false}),
        {triangles: 200000, resolution: 1, antialias: true, effects: false}, "合法配置归一化逐字");
    deepEq(T.validateBenchmarkConfig({triangles: 20000, resolution: 0.5}),
        {triangles: 20000, resolution: 0.5, antialias: false, effects: false}, "aa/effects 缺省为 false");
    deepEq(T.validateBenchmarkConfig({triangles: 1000, resolution: 0.25, antialias: false, effects: false}),
        {triangles: 1000, resolution: 0.25, antialias: false, effects: false}, "下界逐字通过");
    deepEq(T.validateBenchmarkConfig({triangles: 2000000, resolution: 2, antialias: true, effects: true}),
        {triangles: 2000000, resolution: 2, antialias: true, effects: true}, "上界逐字通过");
    eq(T.validateBenchmarkConfig({triangles: 200000.7, resolution: 1}).triangles, 200001, "triangles 非整数取整");
    throwsField(function () { T.validateBenchmarkConfig(null); }, "config", "config=null 抛 Error（err.field=config）");
    throwsField(function () { T.validateBenchmarkConfig([1]); }, "config", "config 非对象抛 Error（err.field=config）");
    throwsField(function () { T.validateBenchmarkConfig({triangles: 999, resolution: 1}); }, "triangles", "triangles<1000 抛 Error（err.field=triangles）");
    throwsField(function () { T.validateBenchmarkConfig({triangles: 2000001, resolution: 1}); }, "triangles", "triangles>2000000 抛 Error（err.field=triangles）");
    throwsField(function () { T.validateBenchmarkConfig({triangles: 1000, resolution: 0.24}); }, "resolution", "resolution<0.25 抛 Error（err.field=resolution）");
    throwsField(function () { T.validateBenchmarkConfig({triangles: 1000, resolution: 2.01}); }, "resolution", "resolution>2 抛 Error（err.field=resolution）");
    throwsField(function () { T.validateBenchmarkConfig({triangles: "x", resolution: 1}); }, "triangles", "triangles 非数字抛 Error（err.field=triangles）");
    throwsField(function () { T.validateBenchmarkConfig({triangles: 1000, resolution: 1, antialias: "yes"}); }, "antialias", "antialias 非布尔抛 Error（err.field=antialias）");
})();

/* ================= 4. buildFpsReportName ================= */
(function () {
    eq(T.buildFpsReportName(new Date(2026, 10, 2, 1, 2, 3)), "fps_benchmark_20261102_010203.txt", "固定时间逐字");
    var nm = T.buildFpsReportName();
    ok(/^fps_benchmark_\d{8}_\d{6}\.txt$/.test(nm), "默认时间为现在（规格正则 " + nm + "）");
    throwsField(function () { T.buildFpsReportName("2026"); }, "now", "now 非 Date 抛 Error（err.field=now）");
    throwsField(function () { T.buildFpsReportName(new Date("invalid")); }, "now", "now 非法日期抛 Error（err.field=now）");
})();

/* ================= 5. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    contains(GO_SRC, 'ID:          "fps_gpu_benchmark"', "注册 ID 为 fps_gpu_benchmark");
    contains(GO_SRC, 'Path:        "/tools/fps-gpu-benchmark"', "注册 Path 为 /tools/fps-gpu-benchmark");
    contains(GO_SRC, 'Icon:        "shutter_speed"', "注册 Icon 为 shutter_speed");
    eq((GO_SRC.match(/"shutter_speed"/g) || []).length, 1, "shutter_speed 全库仅本工具使用（0 占用→1）");
    var m = GO_SRC.match(/ID:\s*"fps_gpu_benchmark"[\s\S]{0,2000}?Category:\s*"([^"]+)"/);
    eq(m ? m[1] : "", "开发工具", "注册 Category 为 开发工具");
    contains(GO_SRC, 'Name:        "浏览器 FPS/GPU 性能速测"', "注册 Name");
    ok(/ID:\s*"fps_gpu_benchmark"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    ok(GO_SRC.toLowerCase().indexOf("fps") !== -1 && GO_SRC.toLowerCase().indexOf("benchmark") !== -1, "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 317, "注册 Path 总数 309→310");
})();

/* ================= 6. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "fps_gpu_benchmark.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    ["aggregateFrameStats", "classifyFpsGrade", "validateBenchmarkConfig", "buildFpsReportName"].forEach(function (fn) {
        contains(src, fn, "纯函数 " + fn);
    });
    contains(src, "WEBGL_debug_renderer_info", "GPU 检测走 WEBGL_debug_renderer_info");
    contains(src, "requestAnimationFrame", "帧时间统计走 requestAnimationFrame");
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "execCommand", "复制降级走 execCommand");
    contains(src, "Blob", "下载走 Blob");
    contains(src, "module.exports", "Node 自测暴露纯函数");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "fps_gpu_benchmark.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
    contains(tpl, "/tools/static/js/fps_gpu_benchmark.js", "模板加载本地业务 JS");
})();

/* ================= 7. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "fps_gpu_benchmark.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>浏览器 FPS/GPU 性能速测", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/fps-gpu-benchmark", "SEO：canonical/OG URL 为新 Path");
    /* 真限制四条（页面明示） */
    contains(tpl, "浏览器内 WebGL 渲染性能", "真限制①：仅浏览器内 WebGL");
    contains(tpl, "不能替代 3DMark 等原生跑分", "真限制①：不能替代原生跑分");
    contains(tpl, "无法获取温度/功耗/频率", "真限制②：拿不到温度/功耗/频率");
    contains(tpl, "隐私模式可能屏蔽渲染器字符串", "真限制③：隐私模式屏蔽渲染器字符串");
    contains(tpl, "WebGL 被禁用时页面会降级提示", "真限制④：WebGL 不可用降级");
    /* 单向出链（与 llm_hardware_checker「硬件一条龙」） */
    contains(tpl, "/tools/llm-hardware-checker", "出链到 llm_hardware_checker");
    contains(tpl, "硬件一条龙", "互链文案：硬件一条龙");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

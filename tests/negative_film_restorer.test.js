/* 负片图像还原纯逻辑单元测试（零依赖）：node tests/negative_film_restorer.test.js
 * 覆盖：
 *  1. invertOf 契约（确定性向量 10,20,30→245,235,225；边界；非法参数 err.field='v'）
 *  2. channelStretch 契约（0~100 百分位拉伸逐字向量；钳制；零宽度防除零；err.field='v'/'lo'/'hi'）
 *  3. invertAndStretch 契约（组合向量；err.field 透传）
 *  4. buildFileName 契约（negative-YYYYMMDD-HHmmss.png 日期向量；err.field='date'）
 *  5. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 259
 *  6. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket；FileReader+canvas 纯本地）
 *  7. 模板：SEO 面板、真限制三条、与 img_compress/img_resize/img_convert 双向互链
 */
"use strict";
var T = require("../static/js/negative_film_restorer.js");
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

/* ================= 1. invertOf ================= */
(function () {
    eq(T.invertOf(10), 245, "规格向量：invertOf(10)→245");
    eq(T.invertOf(20), 235, "规格向量：invertOf(20)→235");
    eq(T.invertOf(30), 225, "规格向量：invertOf(30)→225");
    eq(T.invertOf(0), 255, "边界：invertOf(0)→255");
    eq(T.invertOf(255), 0, "边界：invertOf(255)→0");
    eq(T.invertOf(128), 127, "中点：invertOf(128)→127");
    throwsField(function () { T.invertOf("10"); }, "v", "规格向量：invertOf('10') 抛 Error（err.field=v）");
    throwsField(function () { T.invertOf(256); }, "v", "越界 256 抛 Error（err.field=v）");
    throwsField(function () { T.invertOf(-1); }, "v", "负数抛 Error（err.field=v）");
    throwsField(function () { T.invertOf(1.5); }, "v", "非整数抛 Error（err.field=v）");
    throwsField(function () { T.invertOf(NaN); }, "v", "NaN 抛 Error（err.field=v）");
    throwsField(function () { T.invertOf(Infinity); }, "v", "Infinity 抛 Error（err.field=v）");
    throwsField(function () { T.invertOf(null); }, "v", "null 抛 Error（err.field=v）");
    throwsField(function () { T.invertOf(undefined); }, "v", "undefined 抛 Error（err.field=v）");
})();

/* ================= 2. channelStretch ================= */
(function () {
    /* 规格向量：0~100 百分位拉伸逐字 */
    eq(T.channelStretch(0, 0, 100), 0, "规格向量：channelStretch(0,0,100)→0");
    eq(T.channelStretch(25, 0, 100), 64, "规格向量：channelStretch(25,0,100)→64");
    eq(T.channelStretch(50, 0, 100), 128, "规格向量：channelStretch(50,0,100)→128");
    eq(T.channelStretch(100, 0, 100), 255, "规格向量：channelStretch(100,0,100)→255");
    eq(T.channelStretch(245, 0, 255), 245, "全区间恒等：channelStretch(245,0,255)→245");
    eq(T.channelStretch(200, 0, 100), 255, "越上界钳制：channelStretch(200,0,100)→255");
    eq(T.channelStretch(245, 245, 245), 255, "零宽度防除零：channelStretch(245,245,245)→255");
    eq(T.channelStretch(244, 245, 245), 0, "零宽度防除零：channelStretch(244,245,245)→0");
    eq(T.channelStretch(10, 10, 20), 0, "下界→0：channelStretch(10,10,20)→0");
    eq(T.channelStretch(20, 10, 20), 255, "上界→255：channelStretch(20,10,20)→255");
    eq(T.channelStretch(15, 10, 20), 128, "中点→128：channelStretch(15,10,20)→128");
    throwsField(function () { T.channelStretch(50, 100, 50); }, "lo", "规格向量：lo>hi 抛 Error（err.field=lo）");
    throwsField(function () { T.channelStretch("50", 0, 100); }, "v", "v 非数字抛 Error（err.field=v）");
    throwsField(function () { T.channelStretch(256, 0, 100); }, "v", "v 越界抛 Error（err.field=v）");
    throwsField(function () { T.channelStretch(50, "a", 100); }, "lo", "lo 非法抛 Error（err.field=lo）");
    throwsField(function () { T.channelStretch(50, 0, "b"); }, "hi", "hi 非法抛 Error（err.field=hi）");
    throwsField(function () { T.channelStretch(50, 0, 256); }, "hi", "hi 越界抛 Error（err.field=hi）");
    throwsField(function () { T.channelStretch(50, -1, 100); }, "lo", "lo 为负抛 Error（err.field=lo）");
})();

/* ================= 3. invertAndStretch ================= */
(function () {
    eq(T.invertAndStretch(10, 0, 255), 245, "规格向量：invertAndStretch(10,0,255)→245（反转245＋全区间拉伸恒等）");
    eq(T.invertAndStretch(10, 0, 100), 255, "规格向量：invertAndStretch(10,0,100)→255（反转245 越界钳制）");
    eq(T.invertAndStretch(245, 0, 255), 10, "规格向量：invertAndStretch(245,0,255)→10");
    eq(T.invertAndStretch(0, 0, 255), 255, "invertAndStretch(0,0,255)→255");
    eq(T.invertAndStretch(255, 0, 255), 0, "invertAndStretch(255,0,255)→0");
    throwsField(function () { T.invertAndStretch("x", 0, 100); }, "v", "v 非法透传 err.field=v");
    throwsField(function () { T.invertAndStretch(10, 100, 50); }, "lo", "lo>hi 透传 err.field=lo");
    throwsField(function () { T.invertAndStretch(10, 0, 300); }, "hi", "hi 越界透传 err.field=hi");
})();

/* ================= 4. buildFileName ================= */
(function () {
    eq(T.buildFileName(new Date(2026, 10, 1, 9, 45, 0)), "negative-20261101-094500.png",
        "规格向量：buildFileName(2026-11-01 09:45)→'negative-20261101-094500.png'");
    eq(T.buildFileName(new Date(2026, 0, 5, 3, 4, 7)), "negative-20260105-030407.png", "单数位补零");
    eq(T.buildFileName(new Date(2026, 11, 31, 23, 59, 59)), "negative-20261231-235959.png", "年末跨年");
    throwsField(function () { T.buildFileName("2026-11-01"); }, "date", "规格向量：buildFileName('2026-11-01') 抛 Error（err.field=date）");
    throwsField(function () { T.buildFileName(new Date(NaN)); }, "date", "无效 Date 抛 Error（err.field=date）");
    throwsField(function () { T.buildFileName(null); }, "date", "null date 抛 Error（err.field=date）");
    throwsField(function () { T.buildFileName(undefined); }, "date", "缺 date 抛 Error（err.field=date）");
    throwsField(function () { T.buildFileName(1234567890); }, "date", "时间戳数字抛 Error（err.field=date）");
})();

/* ================= 5. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var blockRe = /ID:\s*"negative_film_restorer"[\s\S]*?Category:\s*"([^"]+)"/;
    var m = blockRe.exec(GO_SRC);
    ok(m !== null, "categories.go 含 negative_film_restorer 注册块");
    contains(GO_SRC, 'Path:        "/tools/negative-film-restorer"', "注册 Path 为 /tools/negative-film-restorer");
    contains(GO_SRC, 'Icon:        "invert_colors"', "注册 Icon 为 invert_colors");
    eq((GO_SRC.match(/"invert_colors"/g) || []).length, 1, "invert_colors 全库仅本工具使用（0 占用→1）");
    eq(m ? m[1] : "", "图片处理", "注册 Category 为 图片处理");
    contains(GO_SRC, 'Name:        "负片图像还原"', "注册 Name 为 负片图像还原");
    ok(/ID:\s*"negative_film_restorer"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    contains(GO_SRC.toLowerCase(), "negative film restorer", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 323, "注册 Path 总数 309→310");
})();

/* ================= 6. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "negative_film_restorer.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    contains(src, "FileReader", "上传走 FileReader 本地读取");
    contains(src, "getImageData", "像素处理走 canvas getImageData");
    contains(src, "invertOf", "渲染走纯函数 invertOf");
    contains(src, "channelStretch", "渲染走纯函数 channelStretch");
    contains(src, "invertAndStretch", "渲染走纯函数 invertAndStretch");
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "execCommand", "复制降级走 execCommand");
    contains(src, "MAX_PIXELS", ">20MP 降级导出逻辑");
    contains(src, "module.exports", "Node 自测暴露纯函数");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "negative_film_restorer.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
})();

/* ================= 7. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "negative_film_restorer.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>负片图像还原", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/negative-film-restorer", "SEO：canonical/OG URL 为新 Path");
    contains(tpl, "invert_colors", "标题图标 invert_colors");
    /* 真限制三条（页面明示） */
    contains(tpl, "启发式算法", "真限制①：启发式算法");
    contains(tpl, "非扫描仪级", "真限制①：非扫描仪级");
    contains(tpl, "纯本地不上传", "真限制②：纯本地不上传");
    contains(tpl, "20MP", "真限制③：>20MP 大图降级导出");
    contains(tpl, "降采样", "真限制③：降采样明示");
    /* 互链（与 img_compress / img_resize / img_convert 双向） */
    contains(tpl, "/tools/img-compress", "与 img_compress 互链");
    contains(tpl, "/tools/img-resize", "与 img_resize 互链");
    contains(tpl, "/tools/img-convert", "与 img_convert 互链");
    contains(tpl, "图片处理一条龙", "互链文案：一条龙");
    contains(tpl, "负片图像还原（当前）", "相关工具含当前态标记");
    /* 输入输出控件 */
    contains(tpl, 'id="nfr-file"', "文件选择框");
    contains(tpl, 'accept="image/jpeg,image/png,image/webp"', "仅接受 JPG/PNG/WebP");
    contains(tpl, 'name="nfr-mode"', "三种模式单选");
    contains(tpl, 'value="invert"', "模式：全色反转");
    contains(tpl, 'value="color"', "模式：彩色负片去橙色底");
    contains(tpl, 'value="bw"', "模式：黑白负片");
    contains(tpl, 'id="nfr-canvas-orig"', "原图 canvas");
    contains(tpl, 'id="nfr-canvas-restored"', "还原图 canvas");
    contains(tpl, 'id="nfr-download"', "下载按钮");
    contains(tpl, 'id="nfr-copy-url"', "复制 Data URL 按钮");
    contains(tpl, "negative-YYYYMMDD-HHmmss.png", "文件名格式说明");
    /* 回链（双向互链另一半） */
    var cTpl = fs.readFileSync(path.join(ROOT, "templates", "img_compress.html"), "utf8");
    contains(cTpl, "/tools/negative-film-restorer", "img_compress 模板含回链（双向互链）");
    var rTpl = fs.readFileSync(path.join(ROOT, "templates", "img_resize.html"), "utf8");
    contains(rTpl, "/tools/negative-film-restorer", "img_resize 模板含回链（双向互链）");
    var vTpl = fs.readFileSync(path.join(ROOT, "templates", "img_convert.html"), "utf8");
    contains(vTpl, "/tools/negative-film-restorer", "img_convert 模板含回链（双向互链）");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

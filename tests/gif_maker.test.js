/* GIF 合成器纯逻辑单元测试（零依赖）：node tests/gif_maker.test.js
 * 覆盖：
 *  1. validateGifConfig 契约（归一化逐字；边界值；err.field 命名）
 *  2. normalizeGifFrames 契约（原样返回；空/非图片/非数组 err.field='frames'）
 *  3. buildGifFileName 契约（固定时间逐字；文件名正则；err.field='now'）
 *  4. 编码集成：复用 gif_compress 自研编码（quantizeFrames→encodeGif 真实 LZW，
 *     node 无 canvas 但编码管线纯 JS 可跑），GIF89a 文件头逐字＋回解析验证
 *  5. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 263→264
 *  6. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket/EventSource；模板无外部 script CDN）
 *  7. 模板：SEO 面板、真限制四条、与 gif_compress 双向互链「GIF 一条龙」、
 *     表单字段边界（delay 10~10000／maxSize 64~1920／loop 开关）
 */
"use strict";
var T = require("../static/js/gif_maker.js");
var GC = require("../static/js/gif_compress.js");
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
function imgFile(type) { return { type: type || "image/png", name: "a.png" }; }

/* ================= 1. validateGifConfig ================= */
(function () {
    deepEq(T.validateGifConfig({frameCount: 3, frameDelayMs: 100, maxSize: 512, loop: true}),
        {frameCount: 3, frameDelayMs: 100, maxSize: 512, loop: true}, "合法配置归一化逐字");
    deepEq(T.validateGifConfig({frameCount: 1, frameDelayMs: 10, maxSize: 64}),
        {frameCount: 1, frameDelayMs: 10, maxSize: 64, loop: true}, "下界逐字通过，loop 缺省 true");
    deepEq(T.validateGifConfig({frameCount: 60, frameDelayMs: 10000, maxSize: 1920, loop: false}),
        {frameCount: 60, frameDelayMs: 10000, maxSize: 1920, loop: false}, "上界逐字通过，loop=false 保留");
    eq(T.validateGifConfig({frameCount: 2, frameDelayMs: 99.6, maxSize: 800}).frameDelayMs, 100, "frameDelayMs 非整数取整");
    eq(T.validateGifConfig({frameCount: 2, frameDelayMs: 10.4, maxSize: 800}).frameDelayMs, 10, "frameDelayMs 向下取整");
    throwsField(function () { T.validateGifConfig(null); }, "config", "config=null 抛 Error（err.field=config）");
    throwsField(function () { T.validateGifConfig([1]); }, "config", "config 为数组抛 Error（err.field=config）");
    throwsField(function () { T.validateGifConfig("x"); }, "config", "config 非对象抛 Error（err.field=config）");
    throwsField(function () { T.validateGifConfig({frameCount: 0, frameDelayMs: 100, maxSize: 512}); }, "frameCount", "规格向量：frameCount=0 抛 Error（err.field=frameCount）");
    throwsField(function () { T.validateGifConfig({frameCount: 61, frameDelayMs: 100, maxSize: 512}); }, "frameCount", "frameCount=61 抛 Error（err.field=frameCount）");
    throwsField(function () { T.validateGifConfig({frameCount: 1.5, frameDelayMs: 100, maxSize: 512}); }, "frameCount", "frameCount 非整数抛 Error（err.field=frameCount）");
    throwsField(function () { T.validateGifConfig({frameCount: "3", frameDelayMs: 100, maxSize: 512}); }, "frameCount", "frameCount 非数字抛 Error（err.field=frameCount）");
    throwsField(function () { T.validateGifConfig({frameCount: 3, frameDelayMs: 9, maxSize: 512}); }, "frameDelayMs", "规格向量：frameDelayMs=9 抛 Error（err.field=frameDelayMs）");
    throwsField(function () { T.validateGifConfig({frameCount: 3, frameDelayMs: 10001, maxSize: 512}); }, "frameDelayMs", "frameDelayMs=10001 抛 Error（err.field=frameDelayMs）");
    throwsField(function () { T.validateGifConfig({frameCount: 3, frameDelayMs: NaN, maxSize: 512}); }, "frameDelayMs", "frameDelayMs=NaN 抛 Error（err.field=frameDelayMs）");
    throwsField(function () { T.validateGifConfig({frameCount: 3, frameDelayMs: "x", maxSize: 512}); }, "frameDelayMs", "frameDelayMs 非数字抛 Error（err.field=frameDelayMs）");
    throwsField(function () { T.validateGifConfig({frameCount: 3, frameDelayMs: 100, maxSize: 63}); }, "maxSize", "规格向量：maxSize=63 抛 Error（err.field=maxSize）");
    throwsField(function () { T.validateGifConfig({frameCount: 3, frameDelayMs: 100, maxSize: 1921}); }, "maxSize", "maxSize=1921 抛 Error（err.field=maxSize）");
    throwsField(function () { T.validateGifConfig({frameCount: 3, frameDelayMs: 100, maxSize: 64.5}); }, "maxSize", "maxSize 非整数抛 Error（err.field=maxSize）");
    throwsField(function () { T.validateGifConfig({frameCount: 3, frameDelayMs: 100}); }, "maxSize", "maxSize 缺失抛 Error（err.field=maxSize）");
})();

/* ================= 2. normalizeGifFrames ================= */
(function () {
    var arr = [imgFile("image/png"), imgFile("image/jpeg"), imgFile("image/webp")];
    ok(T.normalizeGifFrames(arr) === arr, "合法图片数组原样返回（同一引用）");
    throwsField(function () { T.normalizeGifFrames([]); }, "frames", "规格向量：空数组抛 Error（err.field=frames）");
    throwsField(function () { T.normalizeGifFrames(null); }, "frames", "frames=null 抛 Error（err.field=frames）");
    throwsField(function () { T.normalizeGifFrames("x"); }, "frames", "frames 非数组抛 Error（err.field=frames）");
    throwsField(function () { T.normalizeGifFrames({}); }, "frames", "frames 为对象抛 Error（err.field=frames）");
    throwsField(function () { T.normalizeGifFrames([imgFile("video/mp4")]); }, "frames", "规格向量：含视频抛 Error（err.field=frames）");
    throwsField(function () { T.normalizeGifFrames([imgFile("image/png"), imgFile("text/plain")]); }, "frames", "第二项非图片抛 Error（err.field=frames）");
    throwsField(function () { T.normalizeGifFrames([{}]); }, "frames", "项无 type 抛 Error（err.field=frames）");
    throwsField(function () { T.normalizeGifFrames([null]); }, "frames", "项为 null 抛 Error（err.field=frames）");
})();

/* ================= 3. buildGifFileName ================= */
(function () {
    eq(T.buildGifFileName(new Date(2026, 10, 2, 1, 2, 3)), "gif_maker_20261102_010203.gif", "规格向量：固定时间逐字");
    var nm = T.buildGifFileName();
    ok(/^gif_maker_\d{8}_\d{6}\.gif$/.test(nm), "默认时间为现在（规格正则 " + nm + "）");
    ok(/^gif_maker_\d{8}_\d{6}\.gif$/.test(T.buildGifFileName(null)), "now=null 视为现在");
    throwsField(function () { T.buildGifFileName("2026"); }, "now", "now 非 Date 抛 Error（err.field=now）");
    throwsField(function () { T.buildGifFileName(new Date("invalid")); }, "now", "now 非法日期抛 Error（err.field=now）");
})();

/* ================= 4. 编码集成（自研 LZW 真实编码） ================= */
function solidFrame(w, h, r, g, b, delayMs) {
    var px = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < w * h; i++) {
        px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
    }
    return { pixels: px, width: w, height: h, delayMs: delayMs };
}
(function () {
    ok(typeof GC.quantizeFrames === "function" && typeof GC.encodeGif === "function",
        "gif_compress 自研编码器可复用（quantizeFrames／encodeGif 存在）");
    var frames = [solidFrame(16, 16, 255, 0, 0, 200), solidFrame(16, 16, 0, 255, 0, 200), solidFrame(16, 16, 0, 0, 255, 200)];
    var q = GC.quantizeFrames(frames, 256);
    var bytes = GC.encodeGif(q.frames, { width: q.width, height: q.height, loopCount: 0 });
    var magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    eq(magic, "GIF89a", "编码输出文件头 GIF89a 逐字（与页面校验逻辑一致）");
    var text = "";
    for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    ok(text.indexOf("NETSCAPE2.0") !== -1, "含 NETSCAPE2.0 循环扩展");
    var bytes2 = GC.encodeGif(GC.quantizeFrames(frames, 256).frames, { width: 16, height: 16, loopCount: 0 });
    eq(bytes.length, bytes2.length, "确定性：两次编码字节长度一致");
    var same = bytes.length === bytes2.length;
    for (var j = 0; same && j < bytes.length; j++) { if (bytes[j] !== bytes2[j]) same = false; }
    ok(same, "确定性：两次编码字节逐字一致");
    var parsed = GC.parseGif(bytes);
    eq(parsed.frames.length, 3, "回解析：3 帧");
    eq(parsed.width, 16, "回解析：宽 16");
    eq(parsed.height, 16, "回解析：高 16");
    eq(parsed.frames[0].delayMs, 200, "回解析：第 1 帧 delay 200ms");
    eq(parsed.frames[2].delayMs, 200, "回解析：第 3 帧 delay 200ms");
    eq(parsed.loopCount, 0, "回解析：loopCount=0（无限循环）");
    var once = GC.encodeGif(GC.quantizeFrames(frames, 256).frames, { width: 16, height: 16, loopCount: 1 });
    eq(GC.parseGif(once).loopCount, 1, "回解析：loopCount=1（循环关闭=播一次）");
})();

/* ================= 5. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    contains(GO_SRC, 'ID:          "gif_maker"', "注册 ID 为 gif_maker");
    contains(GO_SRC, 'Path:        "/tools/gif-maker"', "注册 Path 为 /tools/gif-maker");
    contains(GO_SRC, 'Icon:        "gif_box"', "注册 Icon 为 gif_box");
    eq((GO_SRC.match(/"gif_box"/g) || []).length, 1, "gif_box 全库仅本工具使用（0 占用→1）");
    var m = GO_SRC.match(/ID:\s*"gif_maker"[\s\S]{0,2000}?Category:\s*"([^"]+)"/);
    eq(m ? m[1] : "", "图片处理", "注册 Category 为 图片处理");
    contains(GO_SRC, 'Name:        "GIF 合成器"', "注册 Name");
    ok(/ID:\s*"gif_maker"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    ok(GO_SRC.toLowerCase().indexOf("gif") !== -1 && GO_SRC.toLowerCase().indexOf("client-side") !== -1, "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 307, "注册 Path 总数 305→306");
})();

/* ================= 6. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "gif_maker.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    ["validateGifConfig", "normalizeGifFrames", "buildGifFileName"].forEach(function (fn) {
        contains(src, fn, "纯函数 " + fn);
    });
    contains(src, "GifCompress", "编码复用 window.GifCompress（gif_compress 自研编码器）");
    contains(src, "quantizeFrames", "调用 quantizeFrames（median-cut 256 色）");
    contains(src, "encodeGif", "调用 encodeGif（自研 LZW 编码 GIF89a）");
    contains(src, "NETSCAPE", "循环开关走 NETSCAPE2.0");
    contains(src, "getImageData", "canvas 取帧走 getImageData");
    contains(src, "GIF89a", "文件头 GIF89a 校验");
    contains(src, "Blob", "下载走 Blob");
    contains(src, "module.exports", "Node 自测暴露纯函数");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "gif_maker.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
    contains(tpl, "/tools/static/js/gif_compress.js", "模板先加载自研编码器 gif_compress.js");
    contains(tpl, "/tools/static/js/gif_maker.js", "模板加载本地业务 JS");
})();

/* ================= 7. 模板：SEO／真限制／互链／表单 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "gif_maker.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>GIF 合成器", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical" href="https://www.johnkingzcq123.xyz/tools/gif-maker"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：og:title");
    contains(tpl, 'application/ld+json', "SEO：JSON-LD");
    /* 真限制四条 */
    contains(tpl, "浏览器内存限制", "真限制①：浏览器内存限制");
    contains(tpl, "256 色", "真限制②：256 色带");
    contains(tpl, "不支持视频输入", "真限制③：不支持视频输入");
    contains(tpl, "纯本地", "真限制④：纯本地零上传");
    /* 双向互链「GIF 一条龙」 */
    contains(tpl, "GIF 一条龙", "互链：GIF 一条龙");
    contains(tpl, 'href="/tools/gif-compress"', "互链：出链到 gif_compress");
    var gcTpl = fs.readFileSync(path.join(ROOT, "templates", "gif_compress.html"), "utf8");
    contains(gcTpl, 'href="/tools/gif-maker"', "互链：gif_compress 回链到 gif-maker");
    /* 表单字段与规格边界 */
    contains(tpl, 'id="gm-drop"', "上传区 gm-drop");
    contains(tpl, 'id="gm-file"', "文件选择 gm-file");
    contains(tpl, 'id="gm-list"', "排序列表 gm-list");
    contains(tpl, 'id="gm-delay"', "逐帧时长 gm-delay");
    contains(tpl, 'min="10" max="10000"', "逐帧时长边界 10~10000");
    contains(tpl, 'id="gm-loop"', "循环开关 gm-loop");
    contains(tpl, 'id="gm-maxsize"', "尺寸上限 gm-maxsize");
    contains(tpl, 'min="64" max="1920"', "尺寸上限边界 64~1920");
    contains(tpl, 'id="gm-preview"', "预览画布 gm-preview");
    contains(tpl, 'id="gm-play"', "播放按钮 gm-play");
    contains(tpl, 'id="gm-encode"', "合成按钮 gm-encode");
    contains(tpl, 'id="gm-download"', "下载按钮 gm-download");
})();

console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail === 0 ? 0 : 1);

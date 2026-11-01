/* 占位图生成器纯逻辑单元测试（零依赖）：node tests/placeholder_image_generator.test.js
 * 覆盖：
 *  1. parseSize 契约（取整、范围 1~4096、确定性向量、非法参数 err.field='width'/'height'）
 *  2. normalizeHex 契约（#rgb/#rrggbb → #rrggbb 小写、确定性向量、非法参数 err.field=传入名）
 *  3. displayTextOf 契约（空→'宽×高'、去首尾空格、非法参数 err.field='text'）
 *  4. buildPlaceholderName 契约（确定性向量、非法尺寸 err.field='width'/'height'）
 *  5. baseFontSize 口径（clamp(floor(min(w,h)/6),12,200)）
 *  6. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 253
 *  7. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket；canvas 字体走系统字体栈）
 *  8. 模板：SEO 面板、真限制三条、与 skeleton_screen_generator 双向互链
 */
"use strict";
var P = require("../static/js/placeholder_image_generator.js");
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

/* ================= 1. parseSize ================= */
(function () {
    deepEq(P.parseSize(800, 600), { w: 800, h: 600 }, "规格向量：parseSize(800,600)→{w:800,h:600}");
    deepEq(P.parseSize(800.7, 600), { w: 800, h: 600 }, "规格向量：parseSize(800.7,600) 取整→{w:800,h:600}");
    deepEq(P.parseSize(1, 1), { w: 1, h: 1 }, "下界 1 合法");
    deepEq(P.parseSize(4096, 4096), { w: 4096, h: 4096 }, "上界 4096 合法");
    deepEq(P.parseSize(4096.9, 4096.9), { w: 4096, h: 4096 }, "4096.9 取整后仍在界内");
    throwsField(function () { P.parseSize(0, 600); }, "width",
        "规格向量：parseSize(0,600) 抛 Error（err.field=width）");
    throwsField(function () { P.parseSize(800, 5000); }, "height",
        "规格向量：parseSize(800,5000) 抛 Error（err.field=height）");
    throwsField(function () { P.parseSize(-5, 600); }, "width", "负数宽抛 Error（err.field=width）");
    throwsField(function () { P.parseSize(800, 4097); }, "height", "4097 高抛 Error（err.field=height）");
    throwsField(function () { P.parseSize("abc", 600); }, "width", "非数字字符串宽抛 Error（err.field=width）");
    throwsField(function () { P.parseSize(800, NaN); }, "height", "NaN 高抛 Error（err.field=height）");
    throwsField(function () { P.parseSize(null, 600); }, "width", "null 宽抛 Error（err.field=width）");
    throwsField(function () { P.parseSize(800, undefined); }, "height", "undefined 高抛 Error（err.field=height）");
    throwsField(function () { P.parseSize(Infinity, 600); }, "width", "Infinity 宽抛 Error（err.field=width）");
    throwsField(function () { P.parseSize("", 600); }, "width", "空字符串宽抛 Error（err.field=width）");
})();

/* ================= 2. normalizeHex ================= */
(function () {
    eq(P.normalizeHex("#CCC", "bgColor"), "#cccccc", "规格向量：normalizeHex('#CCC','bgColor')→'#cccccc'");
    eq(P.normalizeHex("#a1B2c3", "textColor"), "#a1b2c3", "规格向量：normalizeHex('#a1B2c3','textColor')→'#a1b2c3'");
    eq(P.normalizeHex("#ffffff", "bgColor"), "#ffffff", "六位小写原样返回");
    eq(P.normalizeHex("#ABCDEF", "fg"), "#abcdef", "六位大写转小写");
    eq(P.normalizeHex("#123", "fg"), "#112233", "三位展开");
    eq(P.normalizeHex("  #AbC  ", "fg"), "#aabbcc", "首尾空格容忍并转小写");
    throwsField(function () { P.normalizeHex("red", "bgColor"); }, "bgColor",
        "规格向量：normalizeHex('red','bgColor') 抛 Error（err.field=bgColor）");
    throwsField(function () { P.normalizeHex("#12", "textColor"); }, "textColor",
        "两位非法（err.field=textColor）");
    throwsField(function () { P.normalizeHex("#gggggg", "bgColor"); }, "bgColor",
        "非十六进制字符非法（err.field=bgColor）");
    throwsField(function () { P.normalizeHex("#12345", "bgColor"); }, "bgColor",
        "五位非法（err.field=bgColor）");
    throwsField(function () { P.normalizeHex("cccccc", "bgColor"); }, "bgColor",
        "缺 # 非法（err.field=bgColor）");
    throwsField(function () { P.normalizeHex(123, "bgColor"); }, "bgColor",
        "非字符串非法（err.field=bgColor）");
    throwsField(function () { P.normalizeHex(null, "textColor"); }, "textColor",
        "null 非法（err.field=textColor）");
})();

/* ================= 3. displayTextOf ================= */
(function () {
    eq(P.displayTextOf("", 800, 600), "800×600", "规格向量：displayTextOf('',800,600)→'800×600'");
    eq(P.displayTextOf("  Hello  ", 800, 600), "Hello", "规格向量：去首尾空格返回原样");
    eq(P.displayTextOf("   ", 300, 200), "300×200", "全空格视为空→'300×200'");
    eq(P.displayTextOf("首页 Banner", 1024, 768), "首页 Banner", "中文原样返回");
    eq(P.displayTextOf("  800×600  ", 1, 1), "800×600", "与默认文本相同但用户显式输入→原样");
    throwsField(function () { P.displayTextOf(123, 800, 600); }, "text",
        "规格向量：displayTextOf(123,…) 抛 Error（err.field=text）");
    throwsField(function () { P.displayTextOf(null, 800, 600); }, "text",
        "null 抛 Error（err.field=text）");
    throwsField(function () { P.displayTextOf(undefined, 800, 600); }, "text",
        "undefined 抛 Error（err.field=text）");
})();

/* ================= 4. buildPlaceholderName ================= */
(function () {
    eq(P.buildPlaceholderName(800, 600), "placeholder-800x600.png",
        "规格向量：buildPlaceholderName(800,600)→'placeholder-800x600.png'");
    eq(P.buildPlaceholderName(1, 1), "placeholder-1x1.png", "最小尺寸文件名");
    eq(P.buildPlaceholderName(4096, 4096), "placeholder-4096x4096.png", "最大尺寸文件名");
    eq(P.buildPlaceholderName(1920.9, 1080.2), "placeholder-1920x1080.png", "取整后拼文件名");
    throwsField(function () { P.buildPlaceholderName(0, 600); }, "width",
        "宽非法→err.field=width（走 parseSize）");
    throwsField(function () { P.buildPlaceholderName(800, 99999); }, "height",
        "高非法→err.field=height（走 parseSize）");
})();

/* ================= 5. baseFontSize ================= */
(function () {
    eq(P.baseFontSize(800, 600), 100, "800×600 → floor(600/6)=100");
    eq(P.baseFontSize(100, 100), 16, "100×100 → floor(100/6)=16");
    eq(P.baseFontSize(60, 40), 12, "60×40 → floor(40/6)=6，clamp 到 12");
    eq(P.baseFontSize(1, 1), 12, "1×1 → clamp 下界 12");
    eq(P.baseFontSize(4096, 4096), 200, "4096×4096 → floor(4096/6)=682，clamp 到 200");
    eq(P.baseFontSize(1200, 1300), 200, "1200×1300 → floor(1200/6)=200，正好上界");
    eq(P.baseFontSize(2000, 500), 83, "2000×500 → floor(500/6)=83（取 min 边）");
})();

/* ================= 6. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var idx = GO_SRC.indexOf('"placeholder_image_generator"');
    ok(idx >= 0, "注册：categories.go 含 ID placeholder_image_generator");
    ok(GO_SRC.indexOf('"/tools/placeholder-image-generator"') >= 0, "注册 Path /tools/placeholder-image-generator");
    var block = GO_SRC.slice(idx, idx + 1500);
    contains(block, 'Icon:        "image_aspect_ratio"', "注册 Icon image_aspect_ratio");
    contains(block, "New:         true", "注册 New 为 true");
    contains(block, 'Category:    "开发工具"', "注册 Category 为开发工具");
    contains(block, '"占位图生成器"', "注册名称 占位图生成器");
    contains(block.toLowerCase(), "placeholder image generator", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
    while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
    eq(pathCount, 260, "注册 Path 总数 259→260");
})();

/* ================= 7. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "placeholder_image_generator.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    contains(src, "measureText", "超宽文字用 measureText 缩小");
    contains(src, "execCommand", "复制降级走 textarea+execCommand");
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "Microsoft YaHei", "canvas 字体走系统字体栈（含微软雅黑）");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "placeholder_image_generator.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
})();

/* ================= 8. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "placeholder_image_generator.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>占位图生成器", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/placeholder-image-generator", "SEO：canonical/OG URL 为新 Path");
    /* 真限制三条（页面明示） */
    contains(tpl, "无真实图片语义", "真限制①：静态占位图无真实图片语义");
    contains(tpl, "不可替代真实图片", "真限制①：不可替代真实图片");
    contains(tpl, "超大尺寸文件可能较大", "真限制②：超大尺寸文件提醒");
    contains(tpl, "依赖系统字体", "真限制③：中文字体依赖系统字体");
    /* 互链（与 skeleton_screen_generator 双向） */
    contains(tpl, "/tools/skeleton-screen-generator", "与 skeleton_screen_generator 双向互链");
    contains(tpl, "骨架屏 → 占位图一条龙", "互链文案：骨架屏→占位图一条龙");
    contains(tpl, "占位图生成器（当前）", "相关工具含当前态标记");
    /* 输入输出控件 */
    contains(tpl, 'id="ph-width"', "宽度输入框");
    contains(tpl, 'id="ph-height"', "高度输入框");
    contains(tpl, 'id="ph-text"', "显示文字输入框");
    contains(tpl, 'id="ph-bg"', "底色选择器");
    contains(tpl, 'id="ph-fg"', "文字色选择器");
    contains(tpl, 'id="ph-canvas"', "预览 canvas");
    contains(tpl, 'id="ph-download"', "下载按钮");
    contains(tpl, 'id="ph-copy-url"', "复制 Data URL 按钮");
    contains(tpl, 'id="ph-copy-md"', "复制 Markdown 引用按钮");
    contains(tpl, "placeholder-800x600.png", "默认文件名示例");
    contains(tpl, "image_aspect_ratio", "图标 image_aspect_ratio");
    /* skeleton 侧回链（双向互链另一半） */
    var skTpl = fs.readFileSync(path.join(ROOT, "templates", "skeleton_screen_generator.html"), "utf8");
    contains(skTpl, "/tools/placeholder-image-generator", "skeleton 模板含回链（双向互链）");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

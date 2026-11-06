/* 文字转图片卡片纯逻辑单元测试（零依赖）：node tests/text_to_card.test.js
 * 覆盖：
 *  1. wrapLines 契约（\n 分段、按字数切行、确定性向量、非法参数 err.field='text'/'maxChars'）
 *  2. pickTemplate 契约（4 套模板、每套 ≥3 配色、非法参数 err.field='template'）
 *  3. cardSizeOf 契约（1:1/4:5、非法参数 err.field='ratio'）
 *  4. buildCardName 契约（card-YYYYMMDD-HHmmss.png、非法参数 err.field='date'）
 *  5. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 254
 *  6. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket；canvas 字体走系统字体栈）
 *  7. 模板：SEO 面板、真限制三条、与 social_title_generator/hashtag_generator 双向互链
 */
"use strict";
var T = require("../static/js/text_to_card.js");
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

/* ================= 1. wrapLines ================= */
(function () {
    deepEq(T.wrapLines("你好世界", 2), ["你好", "世界"], "规格向量：wrapLines('你好世界',2)→['你好','世界']");
    deepEq(T.wrapLines("a\nb", 8), ["a", "b"], "规格向量：wrapLines('a\\nb',8)→['a','b']");
    deepEq(T.wrapLines("abcdef", 8), ["abcdef"], "短于 maxChars 不切分");
    deepEq(T.wrapLines("abcdefgh", 4), ["abcd", "efgh"], "整除切分");
    deepEq(T.wrapLines("abcdefg", 4), ["abcd", "efg"], "非整除末段保留余下");
    deepEq(T.wrapLines("", 8), [""], "空字符串→单空行");
    deepEq(T.wrapLines("a\n\nb", 8), ["a", "", "b"], "空行保留");
    deepEq(T.wrapLines("一二三四\n五六", 2), ["一二", "三四", "五六"], "多段中文逐段切分");
    throwsField(function () { T.wrapLines(123, 8); }, "text", "规格向量：wrapLines(123,8) 抛 Error（err.field=text）");
    throwsField(function () { T.wrapLines(null, 8); }, "text", "null 文本抛 Error（err.field=text）");
    throwsField(function () { T.wrapLines(undefined, 8); }, "text", "undefined 文本抛 Error（err.field=text）");
    throwsField(function () { T.wrapLines("ab", 0); }, "maxChars", "规格向量：wrapLines('ab',0) 抛 Error（err.field=maxChars）");
    throwsField(function () { T.wrapLines("ab", -3); }, "maxChars", "负数 maxChars 抛 Error（err.field=maxChars）");
    throwsField(function () { T.wrapLines("ab", 2.5); }, "maxChars", "非整数 maxChars 抛 Error（err.field=maxChars）");
    throwsField(function () { T.wrapLines("ab", NaN); }, "maxChars", "NaN maxChars 抛 Error（err.field=maxChars）");
    throwsField(function () { T.wrapLines("ab", "8"); }, "maxChars", "字符串 maxChars 抛 Error（err.field=maxChars）");
    throwsField(function () { T.wrapLines("ab"); }, "maxChars", "缺 maxChars 抛 Error（err.field=maxChars）");
})();

/* ================= 2. pickTemplate ================= */
(function () {
    var t = T.pickTemplate("minimal");
    eq(t.id, "minimal", "规格向量：pickTemplate('minimal')→含 id:'minimal'");
    ok(T.TEMPLATE_ORDER.length >= 4, "模板 ≥4 套（实得 " + T.TEMPLATE_ORDER.length + "）");
    T.TEMPLATE_ORDER.forEach(function (k) {
        var tpl = T.pickTemplate(k);
        eq(tpl.id, k, "模板 " + k + " 的 id 与 key 一致");
        ok(tpl.palettes && tpl.palettes.length >= 3, "模板 " + k + " 配色 ≥3（实得 " + tpl.palettes.length + "）");
    });
    throwsField(function () { T.pickTemplate("nope"); }, "template", "规格向量：pickTemplate('nope') 抛 Error（err.field=template）");
    throwsField(function () { T.pickTemplate(""); }, "template", "空 key 抛 Error（err.field=template）");
    throwsField(function () { T.pickTemplate(null); }, "template", "null key 抛 Error（err.field=template）");
    throwsField(function () { T.pickTemplate("Minimal"); }, "template", "大小写敏感：'Minimal' 抛 Error（err.field=template）");
})();

/* ================= 3. cardSizeOf ================= */
(function () {
    deepEq(T.cardSizeOf("1:1"), { w: 1080, h: 1080 }, "规格向量：cardSizeOf('1:1')→{1080,1080}");
    deepEq(T.cardSizeOf("4:5"), { w: 1080, h: 1350 }, "规格向量：cardSizeOf('4:5')→{1080,1350}");
    throwsField(function () { T.cardSizeOf("16:9"); }, "ratio", "规格向量：cardSizeOf('16:9') 抛 Error（err.field=ratio）");
    throwsField(function () { T.cardSizeOf(""); }, "ratio", "空 ratio 抛 Error（err.field=ratio）");
    throwsField(function () { T.cardSizeOf(null); }, "ratio", "null ratio 抛 Error（err.field=ratio）");
    throwsField(function () { T.cardSizeOf(11); }, "ratio", "数字 ratio 抛 Error（err.field=ratio）");
})();

/* ================= 4. buildCardName ================= */
(function () {
    eq(T.buildCardName(new Date(2026, 10, 1, 9, 45, 0)), "card-20261101-094500.png",
        "规格向量：buildCardName(2026-11-01 09:45)→'card-20261101-094500.png'");
    eq(T.buildCardName(new Date(2026, 0, 5, 3, 4, 7)), "card-20260105-030407.png", "单数位补零");
    eq(T.buildCardName(new Date(2026, 11, 31, 23, 59, 59)), "card-20261231-235959.png", "年末跨年");
    throwsField(function () { T.buildCardName("2026-11-01"); }, "date", "字符串 date 抛 Error（err.field=date）");
    throwsField(function () { T.buildCardName(new Date(NaN)); }, "date", "无效 Date 抛 Error（err.field=date）");
    throwsField(function () { T.buildCardName(null); }, "date", "null date 抛 Error（err.field=date）");
    throwsField(function () { T.buildCardName(undefined); }, "date", "缺 date 抛 Error（err.field=date）");
})();

/* ================= 5. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var blockRe = /ID:\s*"text_to_card"[\s\S]*?Category:\s*"([^"]+)"/;
    var m = blockRe.exec(GO_SRC);
    ok(m !== null, "categories.go 含 text_to_card 注册块");
    contains(GO_SRC, 'Path:        "/tools/text-to-card"', "注册 Path 为 /tools/text-to-card");
    contains(GO_SRC, 'Icon:        "style"', "注册 Icon 为 style");
    eq(m ? m[1] : "", "营销工具", "注册 Category 为 营销工具");
    contains(GO_SRC, 'Name:        "文字转图片卡片"', "注册 Name 为 文字转图片卡片");
    ok(/ID:\s*"text_to_card"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    contains(GO_SRC.toLowerCase(), "text to image card", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 315, "注册 Path 总数 309→310");
})();

/* ================= 6. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "text_to_card.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    contains(src, "measureText", "超宽文字用 measureText 缩小");
    contains(src, "wrapLines", "分行走纯函数 wrapLines");
    contains(src, "execCommand", "复制降级走 textarea+execCommand");
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "Microsoft YaHei", "canvas 字体走系统字体栈（含微软雅黑）");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "text_to_card.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
})();

/* ================= 7. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "text_to_card.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>文字转图片卡片", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/text-to-card", "SEO：canonical/OG URL 为新 Path");
    /* 真限制三条（页面明示） */
    contains(tpl, "无复杂排版引擎", "真限制①：无复杂排版引擎");
    contains(tpl, "纯文字排版", "真限制①：纯文字排版");
    contains(tpl, "依赖系统字体", "真限制②：中文字体依赖系统字体");
    contains(tpl, "不利于 SEO", "真限制③：图片内文字不利于 SEO");
    contains(tpl, "无障碍", "真限制③：图片内文字不利于无障碍");
    /* 互链（与 social_title_generator / hashtag_generator 双向） */
    contains(tpl, "/tools/social-title-generator", "与 social_title_generator 互链");
    contains(tpl, "/tools/hashtag-generator", "与 hashtag_generator 互链");
    contains(tpl, "关键词→标题＋简介＋标签→分享卡片", "互链文案：一条龙");
    contains(tpl, "文字转图片卡片（当前）", "相关工具含当前态标记");
    /* 输入输出控件 */
    contains(tpl, 'id="tc-text"', "主文本输入框");
    contains(tpl, 'id="tc-author"', "署名/出处输入框");
    contains(tpl, 'id="tc-template"', "模板选择器");
    contains(tpl, 'id="tc-palette"', "配色选择器");
    contains(tpl, 'name="tc-size"', "字号三档");
    contains(tpl, 'name="tc-align"', "对齐三选");
    contains(tpl, 'name="tc-ratio"', "尺寸档选择");
    contains(tpl, 'id="tc-canvas"', "预览 canvas");
    contains(tpl, 'id="tc-download"', "下载按钮");
    contains(tpl, 'id="tc-copy-url"', "复制 Data URL 按钮");
    contains(tpl, "card-YYYYMMDD-HHmmss.png", "文件名格式说明");
    /* 回链（双向互链另一半） */
    var stgTpl = fs.readFileSync(path.join(ROOT, "templates", "social_title_generator.html"), "utf8");
    contains(stgTpl, "/tools/text-to-card", "social_title_generator 模板含回链（双向互链）");
    var hgTpl = fs.readFileSync(path.join(ROOT, "templates", "hashtag_generator.html"), "utf8");
    contains(hgTpl, "/tools/text-to-card", "hashtag_generator 模板含回链（双向互链）");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

/* WhatsApp 链接生成器纯逻辑单元测试（零依赖）：node tests/whatsapp_link_generator.test.js
 * 覆盖：
 *  1. normalizePhone 契约（确定性向量逐字；首+/空格/连字符/括号剔除；非法参数 err.field='phone'）
 *  2. buildWaLink 契约（确定性向量逐字；空消息不带 text；err.field='countryCode'/'phone'/'message'）
 *  3. 二维码引擎（vendored qrcode-generator 1.4.4 Node 可加载；矩阵定位符；中文消息链接可编码）
 *  4. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 259
 *  5. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket/EventSource；二维码走本地 vendor）
 *  6. 模板：SEO 面板、真限制三条、与 qrcode 双向互链「沟通一条龙」
 */
"use strict";
var T = require("../static/js/whatsapp_link_generator.js");
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

/* ================= 1. normalizePhone ================= */
(function () {
    eq(T.normalizePhone("+86 138-0000 0000"), "8613800000000",
        "规格向量：normalizePhone('+86 138-0000 0000')→'8613800000000'");
    eq(T.normalizePhone("13800000000"), "13800000000", "纯数字原样返回");
    eq(T.normalizePhone("(138) 0000-0000"), "13800000000", "圆括号/空格/连字符剔除");
    eq(T.normalizePhone("  138 0000 0000  "), "13800000000", "首尾空格剔除");
    eq(T.normalizePhone("+1-415-555-2671"), "14155552671", "美国号 normalize");
    throwsField(function () { T.normalizePhone("abc"); }, "phone",
        "规格向量：normalizePhone('abc') 抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone("138a0000"); }, "phone", "含字母抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone("+  -  () "); }, "phone", "剔除后为空抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone(""); }, "phone", "空字符串抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone("   "); }, "phone", "纯空格抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone("138.0000.0000"); }, "phone", "含点号抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone(13800000000); }, "phone", "数字类型抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone(null); }, "phone", "null 抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone(undefined); }, "phone", "undefined 抛 Error（err.field=phone）");
    throwsField(function () { T.normalizePhone(["13800000000"]); }, "phone", "数组抛 Error（err.field=phone）");
})();

/* ================= 2. buildWaLink ================= */
(function () {
    eq(T.buildWaLink("86", "138-0000 0000", "你好"),
        "https://wa.me/8613800000000?text=%E4%BD%A0%E5%A5%BD",
        "规格向量：buildWaLink('86','138-0000 0000','你好')→逐字命中");
    eq(T.buildWaLink("86", "13800000000", ""),
        "https://wa.me/8613800000000",
        "规格向量：buildWaLink('86','13800000000','')→不带 text 参数");
    eq(T.buildWaLink("1", "(415) 555-2671", "hi"),
        "https://wa.me/14155552671?text=hi",
        "美国号：圆括号/空格/连字符剔除＋国家码前缀拼接");
    eq(T.buildWaLink("852", "6123 4567", ""),
        "https://wa.me/85261234567",
        "香港号：无 text 参数");
    eq(T.buildWaLink("86", "13800000000", "hello world"),
        "https://wa.me/8613800000000?text=hello%20world",
        "空格按 encodeURIComponent 编为 %20");
    eq(T.buildWaLink("86", "+86 138-0000 0000", "你好"),
        "https://wa.me/8613800000000?text=%E4%BD%A0%E5%A5%BD",
        "修复向量：手机号自带 +86 时国家码不重复拼入（国际写法去重）");
    eq(T.buildWaLink("86", "008613800000000", ""),
        "https://wa.me/8613800000000",
        "修复向量：0086 国际冠码写法去重");
    eq(T.buildWaLink("1", "+1 (415) 555-2671", "hi"),
        "https://wa.me/14155552671?text=hi",
        "修复向量：美国号 +1 去重");
    eq(T.dedupeCountryCode("86", "13800000000"), "13800000000",
        "本地直拨号（无国际前缀）不受去重影响");
    eq(T.dedupeCountryCode("86", "+86 13800000000"), "13800000000",
        "dedupeCountryCode：+86 前缀剥除一次");
    eq(T.dedupeCountryCode("86", "8613800000000"), "8613800000000",
        "无国际前缀标记时不误伤（无法判定是否为本地号，保持原样）");
    throwsField(function () { T.buildWaLink("xx", "13800000000", "hi"); }, "countryCode",
        "规格向量：buildWaLink('xx',...) 抛 Error（err.field=countryCode）");
    throwsField(function () { T.buildWaLink("", "13800000000", "hi"); }, "countryCode",
        "空国家码抛 Error（err.field=countryCode）");
    throwsField(function () { T.buildWaLink("8a", "13800000000", "hi"); }, "countryCode",
        "国家码含字母抛 Error（err.field=countryCode）");
    throwsField(function () { T.buildWaLink(86, "13800000000", "hi"); }, "countryCode",
        "国家码为数字类型抛 Error（err.field=countryCode）");
    throwsField(function () { T.buildWaLink("+86", "13800000000", "hi"); }, "countryCode",
        "国家码带 + 抛 Error（err.field=countryCode）");
    throwsField(function () { T.buildWaLink("86", "138-abc-0000", "hi"); }, "phone",
        "非法手机号透传 err.field=phone");
    throwsField(function () { T.buildWaLink("86", "", "hi"); }, "phone",
        "空手机号透传 err.field=phone");
    throwsField(function () { T.buildWaLink("86", "13800000000", 123); }, "message",
        "规格向量：buildWaLink('86','13800000000',123) 抛 Error（err.field=message）");
    throwsField(function () { T.buildWaLink("86", "13800000000", null); }, "message",
        "message 为 null 抛 Error（err.field=message）");
    throwsField(function () { T.buildWaLink("86", "13800000000", undefined); }, "message",
        "message 为 undefined 抛 Error（err.field=message）");
    throwsField(function () { T.buildWaLink("86", "13800000000"); }, "message",
        "message 缺省抛 Error（err.field=message）");
})();

/* ================= 3. 二维码引擎 ================= */
(function () {
    ok(typeof T.getQrEngine() === "function", "二维码引擎（vendored）在 Node 可加载");
    var link = T.buildWaLink("86", "13800000000", "你好");
    var m = T.makeWaQrMatrix(link, "M");
    ok(m.count >= 21, "wa.me 链接生成有效二维码矩阵");
    ok(m.isDark(0, 0) && !m.isDark(1, 1) && m.isDark(3, 3), "定位符基本形态（外框深/内圈浅/中心深）");
    var m2 = T.makeWaQrMatrix(link, "M");
    ok(m2.count === m.count, "同一链接两次生成矩阵一致");
    /* 回归：二维码引擎对中文载荷必须用 UTF-8 编码（非 Latin-1 截断） */
    ok(T.getQrEngine().stringToBytes === T.getQrEngine().stringToBytesFuncs["UTF-8"],
        "二维码引擎对中文载荷使用 UTF-8 编码（非 Latin-1 截断）");
})();

/* ================= 4. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var blockRe = /ID:\s*"whatsapp_link_generator"[\s\S]*?Category:\s*"([^"]+)"/;
    var m = blockRe.exec(GO_SRC);
    ok(m !== null, "categories.go 含 whatsapp_link_generator 注册块");
    contains(GO_SRC, 'Path:        "/tools/whatsapp-link-generator"', "注册 Path 为 /tools/whatsapp-link-generator");
    contains(GO_SRC, 'Icon:        "sms"', "注册 Icon 为 sms");
    eq((GO_SRC.match(/"sms"/g) || []).length, 1, "sms 全库仅本工具使用（0 占用→1）");
    eq(m ? m[1] : "", "营销工具", "注册 Category 为 营销工具");
    contains(GO_SRC, 'Name:        "WhatsApp 链接生成器"', "注册 Name 为 WhatsApp 链接生成器");
    ok(/ID:\s*"whatsapp_link_generator"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    contains(GO_SRC.toLowerCase(), "whatsapp link generator", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 260, "注册 Path 总数 259→260");
})();

/* ================= 5. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "whatsapp_link_generator.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    contains(src, "vendor/qrcode-generator-1.4.4.min.js", "二维码走本地 vendored 引擎");
    contains(src, "normalizePhone", "normalize 走纯函数 normalizePhone");
    contains(src, "buildWaLink", "链接拼装走纯函数 buildWaLink");
    contains(src, "encodeURIComponent", "预填消息走 encodeURIComponent");
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "execCommand", "复制降级走 execCommand");
    contains(src, "module.exports", "Node 自测暴露纯函数");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "whatsapp_link_generator.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
    contains(tpl, "/tools/static/js/vendor/qrcode-generator-1.4.4.min.js", "模板引用本地 vendor 二维码库");
})();

/* ================= 6. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "whatsapp_link_generator.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>WhatsApp 链接生成器", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/whatsapp-link-generator", "SEO：canonical/OG URL 为新 Path");
    contains(tpl, "sms", "标题图标 sms");
    /* 真限制三条（页面明示） */
    contains(tpl, "仅生成 wa.me 标准格式链接", "真限制①：仅生成标准格式");
    contains(tpl, "不校验该号码是否已注册 WhatsApp", "真限制①：不校验注册态");
    contains(tpl, "encodeURIComponent", "真限制②：encodeURIComponent 编码");
    contains(tpl, "100% 浏览器本地处理不上传", "真限制③：纯本地零上传");
    contains(tpl, "零外部请求", "真限制③：零外部请求");
    /* 互链（与 qrcode 双向） */
    contains(tpl, "/tools/qrcode", "与 qrcode 互链");
    contains(tpl, "沟通一条龙", "互链文案：一条龙");
    contains(tpl, "WhatsApp 链接生成器（当前）", "相关工具含当前态标记");
    /* 输入输出控件 */
    contains(tpl, 'id="wlg-country"', "国家码下拉");
    contains(tpl, 'id="wlg-country-custom"', "自定义国家码输入");
    contains(tpl, 'id="wlg-phone"', "手机号输入");
    contains(tpl, 'id="wlg-message"', "预填消息 textarea");
    contains(tpl, 'id="wlg-msg-count"', "字符计数＋编码长度提示");
    contains(tpl, 'id="wlg-link"', "链接实时预览只读框");
    contains(tpl, 'id="wlg-copy"', "一键复制按钮");
    contains(tpl, 'id="wlg-qr"', "二维码 canvas 容器");
    contains(tpl, 'id="wlg-open"', "在 WhatsApp 打开按钮");
    contains(tpl, 'id="wlg-sample"', "填入示例按钮");
    /* 回链（双向互链另一半） */
    var qTpl = fs.readFileSync(path.join(ROOT, "templates", "qrcode.html"), "utf8");
    contains(qTpl, "/tools/whatsapp-link-generator", "qrcode 模板含回链（双向互链）");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

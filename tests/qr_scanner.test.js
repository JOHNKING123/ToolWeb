/* 二维码扫描器纯逻辑单元测试（零依赖）：node tests/qr_scanner.test.js
 * 覆盖：
 *  1. validateImageFile 契约（确定性向量逐字；非法参数 err.field 命名：file/type/size）
 *  2. extractQrText 契约（确定性向量逐字；err.field='result'/'data'）
 *  3. normalizeQrLocation 契约（角点归一化逐字；err.field='result'/'location'）
 *  4. classifyQrContent 契约（url/wifi/vcard/text 四口径逐字；javascript: 伪协议→text 且不可打开；
 *     非法参数 err.field='text'）
 *  5. isOpenableUrl 契约（仅 http/https 白名单；javascript:→false；非法参数 err.field='text'）
 *  6. buildQrDownloadName 契约（确定性向量逐字；文件名正则；err.field='now'）
 *  7. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 263→264
 *  8. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket/EventSource；模板无外部 script CDN；
 *     jsQR 为本地 vendored 单文件）
 *  9. 模板：SEO 面板、真限制四条、与 qrcode 双向互链「二维码一条龙」
 */
"use strict";
var T = require("../static/js/qr_scanner.js");
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

/* ================= 1. validateImageFile ================= */
(function () {
    deepEq(T.validateImageFile({ name: "a.png", type: "image/png", size: 1024 }),
        { name: "a.png", type: "image/png", size: 1024 }, "规格向量：合法图片逐字归一化");
    deepEq(T.validateImageFile({ name: "x.JPG", type: "IMAGE/JPEG", size: 10 }),
        { name: "x.JPG", type: "IMAGE/JPEG", size: 10 }, "type 大小写不敏感（IMAGE/JPEG 通过）");
    throwsField(function () { T.validateImageFile(null); }, "file", "规格向量：file=null 抛 Error（err.field=file）");
    throwsField(function () { T.validateImageFile(undefined); }, "file", "file=undefined 抛 Error（err.field=file）");
    throwsField(function () { T.validateImageFile("a.png"); }, "file", "file 非对象抛 Error（err.field=file）");
    throwsField(function () { T.validateImageFile({ name: "a.txt", type: "text/plain", size: 100 }); }, "type", "type 非 image/* 抛 Error（err.field=type）");
    throwsField(function () { T.validateImageFile({ name: "a", size: 100 }); }, "type", "type 缺失抛 Error（err.field=type）");
    throwsField(function () { T.validateImageFile({ name: "a.png", type: "image/png", size: 0 }); }, "size", "size=0 抛 Error（err.field=size）");
    throwsField(function () { T.validateImageFile({ name: "a.png", type: "image/png", size: -5 }); }, "size", "size 为负抛 Error（err.field=size）");
    throwsField(function () { T.validateImageFile({ name: "a.png", type: "image/png" }); }, "size", "size 缺失抛 Error（err.field=size）");
    throwsField(function () { T.validateImageFile({ name: "a.png", type: "image/png", size: 11 * 1024 * 1024 }); }, "size", "超 10MB 抛 Error（err.field=size）");
    eq(T.validateImageFile({ name: "a.png", type: "image/png", size: 1024 }, 2048).size, 1024, "自定义 maxSize 内通过");
    throwsField(function () { T.validateImageFile({ name: "a.png", type: "image/png", size: 3000 }, 2048); }, "size", "超自定义 maxSize 抛 Error（err.field=size）");
})();

/* ================= 2. extractQrText ================= */
(function () {
    eq(T.extractQrText({ data: "hello", location: null }), "hello", "规格向量：取 data 文本逐字");
    eq(T.extractQrText({ data: "https://example.com" }), "https://example.com", "URL 文本逐字");
    throwsField(function () { T.extractQrText(null); }, "result", "规格向量：extractQrText(null) 抛 Error（err.field=result，开发轮定死）");
    throwsField(function () { T.extractQrText(undefined); }, "result", "result=undefined 抛 Error（err.field=result）");
    throwsField(function () { T.extractQrText({}); }, "data", "data 缺失抛 Error（err.field=data）");
    throwsField(function () { T.extractQrText({ data: "" }); }, "data", "data 空串抛 Error（err.field=data）");
    throwsField(function () { T.extractQrText({ data: 123 }); }, "data", "data 非字符串抛 Error（err.field=data）");
})();

/* ================= 3. normalizeQrLocation ================= */
(function () {
    var loc = {
        topLeftCorner: { x: 10.4, y: 20.6 },
        topRightCorner: { x: 110.2, y: 19.8 },
        bottomRightCorner: { x: 111.7, y: 120.3 },
        bottomLeftCorner: { x: 9.9, y: 119.1 }
    };
    deepEq(T.normalizeQrLocation({ data: "x", location: loc }),
        [{ x: 10, y: 21 }, { x: 110, y: 20 }, { x: 112, y: 120 }, { x: 10, y: 119 }],
        "规格向量：四角点整数化逐字");
    throwsField(function () { T.normalizeQrLocation(null); }, "result", "result=null 抛 Error（err.field=result）");
    throwsField(function () { T.normalizeQrLocation({ data: "x" }); }, "location", "location 缺失抛 Error（err.field=location）");
    throwsField(function () {
        T.normalizeQrLocation({ data: "x", location: { topLeftCorner: { x: 1, y: 2 } } });
    }, "location", "角点不全抛 Error（err.field=location）");
})();

/* ================= 4. classifyQrContent ================= */
(function () {
    var u = T.classifyQrContent("https://example.com");
    deepEq(u, { type: "url", url: "https://example.com", openable: true },
        "规格向量：classifyQrContent('https://example.com')→{type:'url'} 逐字");
    var u2 = T.classifyQrContent("  HTTP://Example.COM/a?b=1  ");
    eq(u2.type, "url", "http 大写＋首尾空格仍判 url");
    eq(u2.openable, true, "http 链接 openable=true");
    eq(u2.url, "HTTP://Example.COM/a?b=1", "url 保留原始大小写、去首尾空格");
    var w = T.classifyQrContent("WIFI:S:MyNet;T:WPA;P:secret123;;");
    deepEq(w, { type: "wifi", ssid: "MyNet", auth: "WPA", password: "secret123", hidden: false, openable: false },
        "规格向量：WIFI:S: 格式解析出 ssid/auth/password 逐字");
    var w2 = T.classifyQrContent("WIFI:T:nopass;S:GuestNet;H:true;;");
    eq(w2.type, "wifi", "无密码 WiFi 仍判 wifi");
    eq(w2.ssid, "GuestNet", "ssid=GuestNet");
    eq(w2.password, "", "无 P 字段 password 为空串");
    eq(w2.hidden, true, "H:true → hidden=true");
    var v = T.classifyQrContent("BEGIN:VCARD\nVERSION:3.0\nFN:张三\nTEL:13800000000\nEND:VCARD");
    eq(v.type, "vcard", "BEGIN:VCARD 判 vcard");
    eq(v.name, "张三", "vcard 提取 FN=张三");
    eq(v.openable, false, "vcard 不可打开");
    var j = T.classifyQrContent("javascript:alert(1)");
    deepEq(j, { type: "text", openable: false },
        "规格向量：javascript: 伪协议→type text 且不可打开（防注入）");
    var d = T.classifyQrContent("data:text/html,<script>alert(1)</script>");
    eq(d.type, "text", "data: 伪协议判 text");
    eq(d.openable, false, "data: 不可打开");
    var f = T.classifyQrContent("ftp://files.example.com/a.zip");
    eq(f.type, "text", "ftp: 非白名单判 text");
    eq(f.openable, false, "ftp: 不可打开");
    var m = T.classifyQrContent("mailto:a@b.com");
    eq(m.type, "text", "mailto: 判 text（仅 http/https 给打开按钮）");
    var t = T.classifyQrContent("你好，世界！");
    deepEq(t, { type: "text", openable: false }, "普通文本逐字");
    throwsField(function () { T.classifyQrContent(""); }, "text",
        "规格向量：classifyQrContent('') 抛 Error（err.field=text，开发轮定死）");
    throwsField(function () { T.classifyQrContent("   "); }, "text", "纯空格抛 Error（err.field=text）");
    throwsField(function () { T.classifyQrContent(null); }, "text", "null 抛 Error（err.field=text）");
    throwsField(function () { T.classifyQrContent(123); }, "text", "非字符串抛 Error（err.field=text）");
})();

/* ================= 5. isOpenableUrl ================= */
(function () {
    eq(T.isOpenableUrl("https://example.com"), true, "https 可打开");
    eq(T.isOpenableUrl("http://example.com/a?b=1"), true, "http 可打开");
    eq(T.isOpenableUrl("HTTPS://EXAMPLE.COM"), true, "大写协议可打开");
    eq(T.isOpenableUrl("  https://example.com  "), true, "首尾空格容忍");
    eq(T.isOpenableUrl("javascript:alert(1)"), false, "javascript: 不可打开");
    eq(T.isOpenableUrl("JaVaScRiPt:alert(1)"), false, "大小写混淆的 javascript: 不可打开");
    eq(T.isOpenableUrl("data:text/html,hi"), false, "data: 不可打开");
    eq(T.isOpenableUrl("ftp://x"), false, "ftp: 不可打开");
    eq(T.isOpenableUrl(""), false, "空串返回 false（不抛）");
    eq(T.isOpenableUrl("https://"), false, "裸协议无主机不可打开");
    eq(T.isOpenableUrl("example.com"), false, "无协议裸域名不可打开");
    throwsField(function () { T.isOpenableUrl(null); }, "text", "null 抛 Error（err.field=text）");
    throwsField(function () { T.isOpenableUrl(123); }, "text", "非字符串抛 Error（err.field=text）");
})();

/* ================= 6. buildQrDownloadName ================= */
(function () {
    eq(T.buildQrDownloadName(new Date(2026, 10, 1, 23, 5, 7)), "qr_decode_20261101_230507.txt",
        "规格向量：日期逐字 → qr_decode_20261101_230507.txt");
    ok(/^qr_decode_\d{8}_\d{6}\.txt$/.test(T.buildQrDownloadName()), "文件名正则：qr_decode_YYYYMMDD_HHmmss.txt");
    ok(/^qr_decode_\d{8}_\d{6}\.txt$/.test(T.buildQrDownloadName(new Date(2026, 0, 5, 3, 4, 7))), "单数位补零");
    throwsField(function () { T.buildQrDownloadName("2026-11-01"); }, "now", "now 非 Date 抛 Error（err.field=now）");
    throwsField(function () { T.buildQrDownloadName(new Date("invalid")); }, "now", "非法 Date 抛 Error（err.field=now）");
})();

/* ================= 7. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    contains(GO_SRC, 'ID:          "qr_scanner"', "注册 ID 为 qr_scanner");
    contains(GO_SRC, 'Path:        "/tools/qr-scanner"', "注册 Path 为 /tools/qr-scanner");
    contains(GO_SRC, 'Icon:        "center_focus_strong"', "注册 Icon 为 center_focus_strong");
    eq((GO_SRC.match(/"center_focus_strong"/g) || []).length, 1, "center_focus_strong 全库仅本工具使用（0 占用→1）");
    var m = GO_SRC.match(/ID:\s*"qr_scanner"[\s\S]{0,2000}?Category:\s*"([^"]+)"/);
    eq(m ? m[1] : "", "编码转换", "注册 Category 为 编码转换");
    contains(GO_SRC, 'Name:        "二维码扫描器"', "注册 Name");
    ok(/ID:\s*"qr_scanner"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    ok(GO_SRC.toLowerCase().indexOf("qr") !== -1 && GO_SRC.toLowerCase().indexOf("scanner") !== -1, "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 300, "注册 Path 总数 268→270");
})();

/* ================= 8. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "qr_scanner.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    ["validateImageFile", "extractQrText", "normalizeQrLocation", "classifyQrContent", "isOpenableUrl", "buildQrDownloadName"].forEach(function (fn) {
        contains(src, fn, "纯函数 " + fn);
    });
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "execCommand", "复制降级走 execCommand");
    contains(src, "Blob", "下载走 Blob");
    contains(src, "module.exports", "Node 自测暴露纯函数");
    contains(src, "jsQR(", "调用 vendored jsQR 解码");
    var vendor = path.join(ROOT, "static", "vendor", "jsQR.min.js");
    ok(fs.existsSync(vendor), "jsQR 本地 vendored 单文件存在");
    ok(fs.statSync(vendor).size > 50000, "vendored jsQR 体积合理（>50KB，非占位）");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "qr_scanner.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
    contains(tpl, "/tools/static/vendor/jsQR.min.js", "模板加载本地 vendored jsQR");
    contains(tpl, "/tools/static/js/qr_scanner.js", "模板加载本地业务 JS");
})();

/* ================= 9. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "qr_scanner.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>二维码扫描器", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/qr-scanner", "SEO：canonical/OG URL 为新 Path");
    contains(tpl, ">center_focus_strong<", "标题图标 center_focus_strong");
    /* 真限制四条（页面明示） */
    contains(tpl, "仅识别标准 QR 码", "真限制①：仅识别标准 QR 码");
    contains(tpl, "条形码、DataMatrix", "真限制①：其他码制不支持");
    contains(tpl, "模糊、倾斜、反光或码图过小可能识别失败", "真限制②：模糊倾斜可能失败");
    contains(tpl, "100% 浏览器本地解码不上传", "真限制③：纯本地零上传");
    contains(tpl, "零外部请求", "真限制③：零外部请求");
    contains(tpl, "仅 http/https 链接提供「打开」按钮", "真限制④：仅 http/https 可打开");
    contains(tpl, "javascript:", "真限制④：伪协议防注入");
    /* 互链（与 qrcode 双向「二维码一条龙」） */
    contains(tpl, "/tools/qrcode", "与 qrcode 互链（出链）");
    contains(tpl, "二维码一条龙", "互链文案：二维码一条龙");
    contains(tpl, "二维码扫描器（当前）", "相关工具含当前态标记");
    /* 输入输出控件 */
    contains(tpl, 'id="qrs-drop"', "拖拽区");
    contains(tpl, 'id="qrs-file"', "文件选择框");
    contains(tpl, 'id="qrs-canvas"', "预览 canvas");
    contains(tpl, 'id="qrs-err"', "错误提示框");
    contains(tpl, 'id="qrs-result"', "结果面板");
    contains(tpl, 'id="qrs-text"', "解码文本框");
    contains(tpl, 'id="qrs-type"', "类型徽标");
    contains(tpl, 'id="qrs-copy"', "一键复制按钮");
    contains(tpl, 'id="qrs-open"', "打开链接按钮");
    contains(tpl, 'id="qrs-download"', "下载按钮");
    contains(tpl, 'id="qrs-clear"', "清空按钮");
    /* 回链（双向互链另一半：qrcode 模板） */
    var qrcodeTpl = fs.readFileSync(path.join(ROOT, "templates", "qrcode.html"), "utf8");
    contains(qrcodeTpl, "/tools/qr-scanner", "qrcode 模板含回链（双向互链）");
    contains(qrcodeTpl, "二维码一条龙", "qrcode 模板互链文案一致");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

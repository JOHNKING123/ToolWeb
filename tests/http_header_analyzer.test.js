/* HTTP 响应头分析器（http_header_analyzer）纯逻辑单元测试（零依赖）：
 * node tests/http_header_analyzer.test.js
 * 覆盖：规格示例向量闭环、头名归一化、折行合并、重复头保留、无冒号行定位、
 * 空值标注、分类、六项安全头 Present/Missing 判定、报告文本一致性、
 * categories.go 注册（241→242 Path）与零网络请求静态检查、模板真限制与互链。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var H = require("../static/js/http_header_analyzer.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "http_header_analyzer.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "http_header_analyzer.html"), "utf8");
var GO = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }

/* ---------- 1. 规格示例向量闭环 ---------- */
var SAMPLE = H.SAMPLE;
var parsed = H.parseHeaders(SAMPLE);
ok(!!parsed.statusLine, "示例：识别出状态行");
eq(parsed.statusLine.protocol, "HTTP/1.1", "示例：状态行协议 HTTP/1.1");
eq(parsed.statusLine.code, 200, "示例：状态行状态码 200");
eq(parsed.statusLine.nameCn, "成功", "示例：状态行中文名称 成功");
eq(parsed.headers.length, 6, "示例：解析出 6 个头");
eq(parsed.errors.length, 0, "示例：无解析错误");
var cookies = parsed.headers.filter(function (h) { return h.name === "Set-Cookie"; });
eq(cookies.length, 2, "示例：2 个 Set-Cookie 分别列出");
eq(cookies[0].value, "a=1; Path=/", "示例：第一条 Set-Cookie 值");
eq(cookies[1].value, "b=2; Path=/", "示例：第二条 Set-Cookie 值");
var sec = H.checkSecurityHeaders(parsed);
eq(sec.presentCount, 2, "示例：安全头 Present 2 项");
eq(sec.missingCount, 4, "示例：安全头 Missing 4 项");
eq(sec.results.length, 6, "示例：安全头判定表共 6 项");
var secMap = {};
sec.results.forEach(function (r) { secMap[r.name] = r.state; });
eq(secMap["Strict-Transport-Security"], "Present", "示例：HSTS Present");
eq(secMap["X-Content-Type-Options"], "Present", "示例：X-Content-Type-Options Present");
eq(secMap["Content-Security-Policy"], "Missing", "示例：CSP Missing");
eq(secMap["X-Frame-Options"], "Missing", "示例：X-Frame-Options Missing");
eq(secMap["Referrer-Policy"], "Missing", "示例：Referrer-Policy Missing");
eq(secMap["Permissions-Policy"], "Missing", "示例：Permissions-Policy Missing");
var report = H.buildReport(parsed);
has(report, "缺失 4 项", "示例：报告汇总「缺失 4 项」");
has(report, "HTTP/1.1 200", "报告：含状态行");
has(report, "Set-Cookie: a=1; Path=/", "报告：含第一条 Set-Cookie");
has(report, "Set-Cookie: b=2; Path=/", "报告：含第二条 Set-Cookie");

/* ---------- 2. 头名归一化 ---------- */
eq(H.normalizeHeaderName("content-type"), "Content-Type", "归一化：content-type → Content-Type");
eq(H.normalizeHeaderName("CACHE-CONTROL"), "Cache-Control", "归一化：全大写 → 规范大小写");
eq(H.normalizeHeaderName("x-frame-options"), "X-Frame-Options", "归一化：x-frame-options → X-Frame-Options");
eq(H.normalizeHeaderName("etag"), "ETag", "归一化：etag → ETag");
eq(H.normalizeHeaderName("www-authenticate"), "WWW-Authenticate", "归一化：www-authenticate → WWW-Authenticate");
var lower = H.parseHeaders("content-type: text/html\ncache-control: no-cache");
eq(lower.headers[0].name, "Content-Type", "解析：小写头名归一化");
eq(lower.headers[1].name, "Cache-Control", "解析：小写缓存头归一化");

/* ---------- 3. 折行合并 ---------- */
var folded = H.parseHeaders("X-Custom-Note: first part\n  second part\n\tthird part\nContent-Type: text/html");
eq(folded.headers.length, 2, "折行：并入后仍为 2 个头");
eq(folded.headers[0].value, "first part second part third part", "折行：空格与制表符续行以单空格连接");
eq(folded.errors.length, 0, "折行：无错误");

/* ---------- 4. 重复头保留 ---------- */
var dup = H.parseHeaders("Set-Cookie: a=1\nSet-Cookie: b=2\nSet-Cookie: c=3");
eq(dup.headers.length, 3, "重复头：3 个 Set-Cookie 全部保留不合并");

/* ---------- 5. 无冒号行定位 ---------- */
var bad = H.parseHeaders("Content-Type: text/html\nthis line has no colon\nCache-Control: no-cache");
eq(bad.errors.length, 1, "无冒号行：恰好 1 条错误");
eq(bad.errors[0].line, 2, "无冒号行：指明第 2 行");
has(bad.errors[0].message, "第 2 行", "无冒号行：错误信息含行号");
eq(bad.headers.length, 2, "无冒号行：其余合法头仍解析");

/* ---------- 6. 空值标注与空行忽略 ---------- */
var emptyVal = H.parseHeaders("\n\nX-Empty:\nContent-Type: text/html\n\n");
eq(emptyVal.headers.length, 2, "空值：空行忽略后 2 个头");
eq(emptyVal.headers[0].empty, true, "空值：值为空的头 empty 为 true");
eq(emptyVal.headers[0].value, "", "空值：值为空字符串");
has(H.buildReport(emptyVal), "值为空", "空值：报告中标注「值为空」");
var emptyInput = H.parseHeaders("");
eq(emptyInput.headers.length, 0, "空输入：0 个头");
eq(emptyInput.errors.length, 0, "空输入：无解析错误");

/* ---------- 7. 分类与释义 ---------- */
eq(H.headerCategory("cache-control"), "缓存", "分类：Cache-Control → 缓存");
eq(H.headerCategory("content-type"), "内容", "分类：Content-Type → 内容");
eq(H.headerCategory("strict-transport-security"), "安全", "分类：HSTS → 安全");
eq(H.headerCategory("server"), "其他", "分类：Server → 其他");
has(H.headerMeaning("content-type"), "媒体类型", "释义：Content-Type 有中文释义");
has(H.headerMeaning("x-my-custom-thing"), "非标准", "释义：自定义 X- 头只原样列出、不给标准释义");
ok(H.statusName(404) === "未找到", "状态码中文名：404 未找到");
ok(H.statusName(999) === "未知状态码", "状态码中文名：未知码兜底");

/* ---------- 8. 安全头判定（全 Present / 全 Missing） ---------- */
var allPresent = H.parseHeaders(
    "Strict-Transport-Security: max-age=31536000\n" +
    "Content-Security-Policy: default-src 'self'\n" +
    "X-Content-Type-Options: nosniff\n" +
    "X-Frame-Options: DENY\n" +
    "Referrer-Policy: no-referrer\n" +
    "Permissions-Policy: camera=()");
var secAll = H.checkSecurityHeaders(allPresent);
eq(secAll.missingCount, 0, "安全头：六项齐全时缺失 0 项");
eq(secAll.presentCount, 6, "安全头：六项齐全时 Present 6 项");
var noneSec = H.checkSecurityHeaders(H.parseHeaders("Content-Type: text/html"));
eq(noneSec.missingCount, 6, "安全头：全无时缺失 6 项");
has(H.buildReport(noneSec ? H.parseHeaders("Content-Type: text/html") : null), "缺失 6 项", "报告：全缺失时汇总「缺失 6 项」");

/* ---------- 9. 报告与解析结果一致 ---------- */
var repParsed = H.parseHeaders(SAMPLE);
var rep = H.buildReport(repParsed);
repParsed.headers.forEach(function (h) {
    has(rep, h.name + ": " + h.value, "报告一致：含头 " + h.name);
});
has(rep, "Strict-Transport-Security：Present", "报告一致：含 HSTS Present 判定");
has(rep, "Content-Security-Policy：Missing", "报告一致：含 CSP Missing 判定");

/* ---------- 10. 注册（categories.go） ---------- */
has(GO, '"http_header_analyzer"', "注册：categories.go 含 ID http_header_analyzer");
has(GO, '"/tools/http-header-analyzer"', "注册：categories.go 含 Path /tools/http-header-analyzer");
has(GO, "HTTP 响应头分析器", "注册：categories.go 含名称 HTTP 响应头分析器");
var pathMatches = GO.match(/"\/tools\/[^"]+"/g) || [];
var uniquePaths = {};
pathMatches.forEach(function (p) { uniquePaths[p] = true; });
eq(Object.keys(uniquePaths).length, 242, "注册：去重 Path 总数 241→242（实得 " + Object.keys(uniquePaths).length + "）");

/* ---------- 11. 零网络静态检查 ---------- */
notHas(SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL, "fetch(", "零网络：模板无 fetch 调用");
notHas(TPL, "XMLHttpRequest", "零网络：模板无 XHR");
var extScripts = (TPL.match(/<script[^>]+src="https?:\/\/[^"]+"/g) || []).length;
eq(extScripts, 0, "零外部脚本：模板无 https 外部 script");

/* ---------- 12. 模板：真限制文案与互链 ---------- */
has(TPL, "只解析用户粘贴的文本、不主动抓取任何 URL", "真限制：模板含不抓取 URL 文案");
has(TPL, "不做安全评分、不承诺合规结论", "真限制：模板含不评分文案");
has(TPL, "释义仅供参考、规范语义以 RFC/MDN 为准", "真限制：模板含释义声明文案");
has(TPL, "https://www.johnkingzcq123.xyz/tools/http-header-analyzer", "SEO：模板含 canonical 链接");
has(TPL, "/tools/http-status-reference", "互链：模板含 HTTP 状态码速查");
has(TPL, "hha-input", "模板：含输入框");
has(TPL, "hha-copy", "模板：含复制按钮");
notHas(TPL, "json-string-escaper", "互链：不含未交付 JSON 字符串转义器");
notHas(TPL, "wordcloud", "互链：不含未交付词云生成器");
notHas(TPL, "totp-generator", "互链：不含未交付 TOTP（已交付工具亦不硬凑）");

console.log("http_header_analyzer: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);

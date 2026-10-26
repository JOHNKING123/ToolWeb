/* HTTP 响应头分析器（http_header_analyzer）纯前端核心逻辑
* 纯函数经 module.exports 暴露，node tests/http_header_analyzer.test.js 自测；
* 浏览器端：window.HttpHeaderAnalyzer 全局 + DOM 装配（本文件末尾）。
*
* 解析规则（规格见 BACKLOG 2026-10-27 PM 排期条目）：
* - 首个非空行若匹配状态行（HTTP/x.y NNN [原因短语]）则单独识别，不当作头；
* - 头名大小写不敏感，统一归一化为规范大小写（如 content-type → Content-Type）；
* - 以空格/制表符开头的行是折行续行，并入上一头的值（以单个空格连接）；
* - 重复头（如多个 Set-Cookie）分别列出，不合并、不丢弃；
* - 无冒号的行报错并指明行号（1 起计，含空行与状态行在内的原始行号）；
* - 值为空的头照常列出，展示与报告中标注「值为空」；
* - 空行自动忽略；空输入时调用方提示「请粘贴响应头文本」。
* 安全头判定：六项固定表（HSTS/CSP/X-Content-Type-Options/X-Frame-Options/
* Referrer-Policy/Permissions-Policy），Present/Missing 二态，不打分、不承诺合规。
* 零 fetch/XHR：纯本地解析，不发起任何网络请求。
*/
(function () {
"use strict";

/* ================= 0. 状态码中文名称（与站内 HTTP 状态码速查同口径） ================= */

var STATUS_NAMES = {
100: "继续", 101: "切换协议", 102: "处理中", 103: "早期提示",
200: "成功", 201: "已创建", 202: "已受理", 203: "非权威信息",
204: "无内容", 205: "重置内容", 206: "部分内容", 207: "多状态", 208: "已报告",
226: "IM 已使用",
300: "多项选择", 301: "永久重定向", 302: "临时重定向", 303: "查看其他位置",
304: "未修改", 305: "使用代理", 307: "临时重定向", 308: "永久重定向",
400: "错误请求", 401: "未授权", 402: "需要付款", 403: "禁止访问",
404: "未找到", 405: "方法不允许", 406: "不可接受", 407: "需要代理授权",
408: "请求超时", 409: "冲突", 410: "已删除", 411: "需要内容长度",
412: "前提条件失败", 413: "请求体过大", 414: "URI 过长",
415: "不支持的媒体类型", 416: "范围请求不满足", 417: "期望失败",
418: "我是一个茶壶", 421: "请求被定向到错误服务器", 422: "无法处理的实体",
423: "已锁定", 424: "依赖失败", 425: "太早", 426: "需要升级",
428: "要求先决条件", 429: "请求过多", 431: "请求头过大", 451: "因法律原因不可用",
500: "服务器内部错误", 501: "未实现", 502: "网关错误", 503: "服务不可用",
504: "网关超时", 505: "HTTP 版本不受支持", 507: "存储空间不足",
511: "需要网络认证"
};

function statusName(code) {
return STATUS_NAMES[code] || "未知状态码";
}

/* ================= 1. 头名归一化 ================= */

/* 已知特殊大小写；其余按「-」分段、每段首字母大写其余小写；
* 段为 www 时写 WWW，段为 x 时保持 X（如 X-Frame-Options）。 */
var SPECIAL_SEGMENTS = { "www": "WWW", "x": "X", "etag": "ETag", "dnt": "DNT", "te": "TE"};

function normalizeHeaderName(raw) {
var name = (raw || "").replace(/^\s+|\s+$/g, "");
if (!name) return name;
var lower = name.toLowerCase();
if (lower === "etag") return "ETag";
var parts = lower.split("-");
var out = [];
for (var i = 0; i < parts.length; i++) {
var seg = parts[i];
if (SPECIAL_SEGMENTS[seg]) { out.push(SPECIAL_SEGMENTS[seg]); continue;}
out.push(seg.charAt(0).toUpperCase() + seg.slice(1));
}
return out.join("-");
}

/* ================= 2. 中文释义与分类 ================= */

/* 释义为自有改写、仅供参考，规范语义以 RFC/MDN 为准。
* 键为小写头名；未命中且以 x- 开头的头视为非标准/自定义头，只原样列出。 */
var HEADER_MEANINGS = {
"content-type": "响应体内容的媒体类型与字符集，告诉浏览器按什么格式解析（如 text/html、application/json）。",
"content-length": "响应体的字节长度；缺失时多用分块传输编码。",
"content-encoding": "响应体使用的压缩编码，如 gzip、br；浏览器按此解压后再渲染。",
"content-language": "响应体内容的自然语言，如 zh-CN。",
"content-disposition": "建议浏览器把响应当作下载附件还是直接展示，常带文件名。",
"content-range": "分片响应对应的字节区间，配合 206 部分内容使用。",
"cache-control": "缓存策略，如 max-age（可缓存秒数）、no-cache、no-store，决定浏览器与中间缓存能否复用。",
"expires": "响应过期时间点，过期后缓存需重新验证；现代用法多被 Cache-Control 替代。",
"etag": "资源的版本标识，浏览器下次请求可用 If-None-Match 做条件验证，命中则返回 304。",
"last-modified": "资源最后修改时间，配合 If-Modified-Since 做条件请求。",
"age": "响应在共享缓存中已停留的秒数。",
"vary": "声明缓存键还取决于哪些请求头（如 Accept-Encoding），避免把一种变体错发给另一类客户端。",
"pragma": "旧版 HTTP/1.0 的缓存指令，现代场景基本只剩 no-cache 兼容写法。",
"date": "响应生成的日期时间（GMT）。",
"server": "服务端软件标识；暴露详细版本号可能泄露指纹信息，生产环境建议精简。",
"set-cookie": "要求浏览器保存一条 Cookie；多个 Set-Cookie 各自独立，分别列出。",
"location": "重定向目标地址，配合 3xx 状态码使用。",
"allow": "该资源支持的 HTTP 方法列表，配合 405 使用。",
"accept-ranges": "服务端是否支持按字节范围请求（bytes 表示支持断点续传）。",
"transfer-encoding": "传输编码方式，如 chunked（分块传输，响应体分多块发送）。",
"connection": "连接管理指令，如 keep-alive（复用连接）或 close（响应后关闭）。",
"keep-alive": "长连接参数，如 timeout（空闲超时秒数）与 max（最多复用请求数）。",
"strict-transport-security": "安全头：要求浏览器今后只用 HTTPS 访问本站，防降级与中间人劫持；max-age 为强制时长。",
"content-security-policy": "安全头：声明页面可加载哪些来源的脚本、样式、图片等资源，防 XSS 与数据注入。",
"x-content-type-options": "安全头：nosniff 表示禁止浏览器嗅探内容类型，避免把非脚本资源当脚本执行。",
"x-frame-options": "安全头：控制页面能否被嵌进 iframe（DENY/SAMEORIGIN），防点击劫持。",
"referrer-policy": "安全头：控制浏览器跳转到外站时 Referer 头带多少信息，如 no-referrer、same-origin。",
"permissions-policy": "安全头：声明页面可用哪些浏览器能力（如摄像头、地理位置），未列出的默认禁用。",
"cross-origin-embedder-policy": "安全头：要求页面只加载同源或带 CORS 标记的跨源资源，配合跨源隔离使用。",
"cross-origin-opener-policy": "安全头：隔离顶层浏览上下文，防止跨源页面通过 window.opener 互相影响。",
"cross-origin-resource-policy": "安全头：限制哪些源可以读取该响应，防跨源数据泄露。",
"www-authenticate": "认证头：配合 401，告诉客户端该用什么认证方式与保护域。",
"retry-after": "限流/维护头：告诉客户端隔多少秒（或到哪个时间点）后再重试。",
"x-powered-by": "服务端技术栈标识；生产环境建议删除，避免暴露实现细节。",
"x-request-id": "请求追踪标识，便于把一次请求的日志串联起来排查。",
"access-control-allow-origin": "跨源头：声明哪些源可以用脚本跨源读取该响应（CORS 核心头）。",
"access-control-allow-methods": "跨源头：预检通过的 HTTP 方法列表。",
"access-control-allow-headers": "跨源头：预检通过的请求头列表。",
"access-control-max-age": "跨源头：预检结果可缓存的秒数。",
"access-control-allow-credentials": "跨源头：是否允许跨源请求携带 Cookie 等凭证。",
"access-control-expose-headers": "跨源头：脚本可读取的响应头白名单（默认只能读少数安全头）。",
"link": "资源关系头，常用于预加载、分页（rel=next/prev）或 Webmention 等链接提示。",
"refresh": "非标准但常见的定时刷新/跳转指令，如 5; url=... 表示 5 秒后跳转。",
"alt-svc": "声明同一服务的备用协议端点，如 HTTP/3（QUIC）地址。",
"nel": "网络错误日志上报策略（Network Error Logging），配合 Report-To 使用。",
"report-to": "上报端点分组，供 CSP、NEL 等机制把违规与错误报告发往指定地址。"
};

var CACHE_HEADERS = ["cache-control", "expires", "etag", "last-modified", "age", "vary", "pragma"];
var CONTENT_HEADERS = ["content-type", "content-length", "content-encoding", "content-language",
"content-disposition", "content-range", "transfer-encoding", "accept-ranges"];
var SECURITY_HEADERS = ["strict-transport-security", "content-security-policy", "x-content-type-options",
"x-frame-options", "referrer-policy", "permissions-policy",
"cross-origin-embedder-policy", "cross-origin-opener-policy", "cross-origin-resource-policy",
"www-authenticate", "set-cookie"];

function headerCategory(lowerName) {
if (SECURITY_HEADERS.indexOf(lowerName)!== -1) return "安全";
if (CACHE_HEADERS.indexOf(lowerName)!== -1) return "缓存";
if (CONTENT_HEADERS.indexOf(lowerName)!== -1) return "内容";
return "其他";
}

function headerMeaning(lowerName, normalizedName) {
if (HEADER_MEANINGS[lowerName]) return HEADER_MEANINGS[lowerName];
if (lowerName.indexOf("x-") === 0) {
return "非标准/自定义头，原样列出，不提供标准释义。";
}
return "未收录中文释义（非标准头或较少见头），原样列出；规范语义以 RFC/MDN 为准。";
}

/* 六项安全头判定表（固定顺序展示）。 */
var SECURITY_CHECK_HEADERS = [
{ key: "strict-transport-security", name: "Strict-Transport-Security", short: "HSTS",
missingNote: "未在粘贴文本中出现：未声明 HSTS，浏览器不会强制后续请求走 HTTPS。"},
{ key: "content-security-policy", name: "Content-Security-Policy", short: "CSP",
missingNote: "未在粘贴文本中出现：未声明 CSP，页面资源来源无白名单约束。"},
{ key: "x-content-type-options", name: "X-Content-Type-Options", short: "nosniff",
missingNote: "未在粘贴文本中出现：未声明 nosniff，浏览器可能嗅探内容类型。"},
{ key: "x-frame-options", name: "X-Frame-Options", short: "防嵌套",
missingNote: "未在粘贴文本中出现：未声明嵌套策略，页面可被任意站点嵌进 iframe。"},
{ key: "referrer-policy", name: "Referrer-Policy", short: "Referrer 策略",
missingNote: "未在粘贴文本中出现：未声明 Referrer 策略，外跳时 Referer 默认发送。"},
{ key: "permissions-policy", name: "Permissions-Policy", short: "权限策略",
missingNote: "未在粘贴文本中出现：未声明权限策略，浏览器能力默认按浏览器缺省处理。"}
];

/* ================= 3. 解析 ================= */

var STATUS_LINE_RE = /^HTTP\/(\d+(?:\.\d+)?)\s+(\d{3})(?:\s+(.*))?$/i;

function parseHeaders(text) {
var raw = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
var lines = raw.split("\n");
var statusLine = null;
var headers = [];
var errors = [];
var seenStatus = false;
for (var i = 0; i < lines.length; i++) {
var lineNo = i + 1;
var line = lines[i];
if (line.replace(/^\s+|\s+$/g, "") === "") continue;
/* 首个非空行若为状态行，单独识别。 */
if (!seenStatus && headers.length === 0 && errors.length === 0) {
var m = line.match(STATUS_LINE_RE);
if (m) {
var code = parseInt(m[2], 10);
statusLine = {
protocol: "HTTP/" + m[1],
code: code,
reason: (m[3] || "").replace(/^\s+|\s+$/g, ""),
nameCn: statusName(code)
};
seenStatus = true;
continue;
}
seenStatus = true;
}
/* 折行续行：以空格或制表符开头，并入上一头。 */
if (line.charAt(0) === " " || line.charAt(0) === "\t") {
if (headers.length === 0) {
errors.push({ line: lineNo, message: "第 " + lineNo + " 行是折行续行，但前面没有可并入的头"});
} else {
var prev = headers[headers.length - 1];
var cont = line.replace(/^\s+|\s+$/g, "");
prev.value = prev.value === ""? cont: prev.value + " " + cont;
}
continue;
}
var colon = line.indexOf(":");
if (colon < 0) {
errors.push({ line: lineNo, message: "第 " + lineNo + " 行缺少冒号，无法解析为「头名: 值」"});
continue;
}
var rawName = line.slice(0, colon).replace(/^\s+|\s+$/g, "");
var value = line.slice(colon + 1).replace(/^\s+|\s+$/g, "");
if (rawName === "") {
errors.push({ line: lineNo, message: "第 " + lineNo + " 行头名为空，无法解析"});
continue;
}
var normalized = normalizeHeaderName(rawName);
var lower = normalized.toLowerCase();
headers.push({
name: normalized,
rawName: rawName,
value: value,
category: headerCategory(lower),
meaning: headerMeaning(lower, normalized),
empty: value === ""
});
}
return { statusLine: statusLine, headers: headers, errors: errors};
}

/* ================= 4. 安全头判定与报告 ================= */

function checkSecurityHeaders(parsed) {
var present = {};
parsed.headers.forEach(function (h) {
var lower = h.name.toLowerCase();
if (!present[lower]) present[lower] = h;
});
var results = SECURITY_CHECK_HEADERS.map(function (item) {
var hit = present[item.key];
if (hit) {
return { key: item.key, name: item.name, short: item.short,
state: "Present", value: hit.value, note: "已出现，值见上。"};
}
return { key: item.key, name: item.name, short: item.short,
state: "Missing", value: "", note: item.missingNote};
});
var missing = results.filter(function (r) { return r.state === "Missing";}).length;
return { results: results, presentCount: results.length - missing, missingCount: missing};
}

function buildReport(parsed) {
var sec = checkSecurityHeaders(parsed);
var out = [];
out.push("HTTP 响应头解析报告");
if (parsed.statusLine) {
var s = parsed.statusLine;
out.push("状态行：" + s.protocol + " " + s.code +
(s.reason? " " + s.reason: "") + "（" + s.nameCn + "）");
} else {
out.push("状态行：（未粘贴状态行）");
}
out.push("共解析 " + parsed.headers.length + " 个头：");
parsed.headers.forEach(function (h) {
var val = h.empty? "（值为空）": h.value;
out.push(h.name + ": " + val + " —— " + h.meaning + "");
});
out.push("安全头判定（六项）：");
sec.results.forEach(function (r) {
if (r.state === "Present") {
out.push(r.name + "：Present（" + r.value + "）");
} else {
out.push(r.name + "：Missing（" + r.note + "）");
}
});
out.push("汇总：缺失 " + sec.missingCount + " 项。");
out.push("说明：只解析粘贴文本，不主动抓取任何 URL；不做安全评分、不承诺合规结论；释义仅供参考、规范语义以 RFC/MDN 为准。");
return out.join("\n");
}

var SAMPLE = "HTTP/1.1 200 OK\n" +
"Content-Type: text/html; charset=utf-8\n" +
"Cache-Control: max-age=3600\n" +
"Strict-Transport-Security: max-age=31536000; includeSubDomains\n" +
"X-Content-Type-Options: nosniff\n" +
"Set-Cookie: a=1; Path=/\n" +
"Set-Cookie: b=2; Path=/";

var api = {
STATUS_NAMES: STATUS_NAMES,
SECURITY_CHECK_HEADERS: SECURITY_CHECK_HEADERS,
SAMPLE: SAMPLE,
statusName: statusName,
normalizeHeaderName: normalizeHeaderName,
headerCategory: headerCategory,
headerMeaning: headerMeaning,
parseHeaders: parseHeaders,
checkSecurityHeaders: checkSecurityHeaders,
buildReport: buildReport
};

if (typeof module!== "undefined" && module.exports) {
module.exports = api;
}
if (typeof window!== "undefined") {
window.HttpHeaderAnalyzer = api;
}

/* ================= 5. 浏览器 DOM 装配 ================= */

if (typeof document!== "undefined") {
(function () {
function $(id) { return document.getElementById(id);}
function esc(s) {
return String(s == null? "": s)
.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function render() {
var input = $("hha-input");
var statusBox = $("hha-status");
var tableBox = $("hha-table");
var secBox = $("hha-security");
var msgBox = $("hha-msg");
if (!input) return;
var text = input.value;
if (text.replace(/^\s+|\s+$/g, "") === "") {
if (msgBox) { msgBox.textContent = "请粘贴响应头文本"; msgBox.className = "hha-msg";}
if (statusBox) statusBox.innerHTML = "<span class=\"hha-muted\">粘贴含状态行的整段响应头后，这里会展示协议版本与状态码。</span>";
if (tableBox) tableBox.innerHTML = "<span class=\"hha-muted\">暂无解析结果。</span>";
if (secBox) secBox.innerHTML = "<span class=\"hha-muted\">暂无安全头判定。</span>";
return;
}
var parsed = parseHeaders(text);
var sec = checkSecurityHeaders(parsed);
var msgs = [];
parsed.errors.forEach(function (e) { msgs.push(e.message);});
if (msgBox) {
if (msgs.length) {
msgBox.textContent = msgs.join("；");
msgBox.className = "hha-msg hha-msg-error";
} else {
msgBox.textContent = "解析完成：共 " + parsed.headers.length + " 个头，安全头缺失 " + sec.missingCount + " 项。";
msgBox.className = "hha-msg hha-msg-ok";
}
}
if (statusBox) {
if (parsed.statusLine) {
var s = parsed.statusLine;
statusBox.innerHTML = "<span class=\"hha-status-code\">" + esc(s.protocol) + " " + esc(String(s.code)) + "</span>" +
(s.reason? " <span>" + esc(s.reason) + "</span>": "") +
" <span class=\"hha-status-name\">" + esc(s.nameCn) + "</span>" +
" <span class=\"hha-muted\">（要查单个状态码含义，去 <a href=\"/tools/http-status-reference\">HTTP 状态码速查</a>）</span>";
} else {
statusBox.innerHTML = "<span class=\"hha-muted\">未检测到状态行（首行不是 HTTP/x.y NNN 格式），仅解析响应头。</span>";
}
}
if (tableBox) {
if (!parsed.headers.length) {
tableBox.innerHTML = "<span class=\"hha-muted\">没有解析出任何头。</span>";
} else {
var rows = ["<table class=\"hha-table\"><thead><tr><th>头名</th><th>值</th><th>中文释义</th><th>分类</th></tr></thead><tbody>"];
parsed.headers.forEach(function (h) {
rows.push("<tr><td class=\"hha-mono\">" + esc(h.name) + "</td><td class=\"hha-mono\">" +
(h.empty? "<span class=\"hha-empty\">值为空</span>": esc(h.value)) + "</td><td>" +
esc(h.meaning) + "</td><td>" + esc(h.category) + "</td></tr>");
});
rows.push("</tbody></table>");
tableBox.innerHTML = rows.join("");
}
}
if (secBox) {
var secs = ["<table class=\"hha-table\"><thead><tr><th>安全头</th><th>判定</th><th>值 / 说明</th></tr></thead><tbody>"];
sec.results.forEach(function (r) {
secs.push("<tr><td class=\"hha-mono\">" + esc(r.name) + "</td><td><span class=\"hha-badge " +
(r.state === "Present"? "hha-badge-ok": "hha-badge-miss") + "\">" + r.state + "</span></td><td>" +
(r.state === "Present"? esc(r.value): esc(r.note)) + "</td></tr>");
});
secs.push("</tbody></table><p class=\"hha-summary\">汇总：缺失 " + sec.missingCount + " 项。</p>");
secBox.innerHTML = secs.join("");
}
}
function copyReport() {
var input = $("hha-input");
if (!input || input.value.replace(/^\s+|\s+$/g, "") === "") {
var m0 = $("hha-msg");
if (m0) { m0.textContent = "请先粘贴响应头文本，再复制解析报告"; m0.className = "hha-msg";}
return;
}
var report = buildReport(parseHeaders(input.value));
function fallback() {
var ta = document.createElement("textarea");
ta.value = report;
ta.style.position = "fixed";
ta.style.opacity = "0";
document.body.appendChild(ta);
ta.select();
var ok = false;
try { ok = document.execCommand("copy");} catch (e) { ok = false;}
document.body.removeChild(ta);
var m = $("hha-msg");
if (m) {
if (ok) { m.textContent = "已复制解析报告"; m.className = "hha-msg hha-msg-ok";}
else { m.textContent = "复制失败：浏览器未授权剪贴板，请手动全选复制解析报告"; m.className = "hha-msg hha-msg-error";}
}
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(report).then(function () {
var m = $("hha-msg");
if (m) { m.textContent = "已复制解析报告"; m.className = "hha-msg hha-msg-ok";}
}, fallback);
} else {
fallback();
}
}
function init() {
var input = $("hha-input");
if (!input) return;
input.addEventListener("input", render);
var sample = $("hha-sample");
if (sample) sample.addEventListener("click", function () { input.value = SAMPLE; render();});
var clear = $("hha-clear");
if (clear) clear.addEventListener("click", function () { input.value = ""; render(); input.focus();});
var copy = $("hha-copy");
if (copy) copy.addEventListener("click", copyReport);
render();
}
if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", init);
} else {
init();
}
})();
}

})();

/* User-Agent 解析器纯逻辑单元测试（零依赖）：node tests/user_agent_parser.test.js
 * 覆盖：6 条验收向量、检测顺序（Edge/Opera 在 Chrome 前、机器人优先）、
 * iOS 引擎一律 WebKit、Windows NT 映射、Linux 不编造发行版、
 * 设备判定、机器人与命令行工具、无意义输入与空输入容错、预设、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/user_agent_parser.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "user_agent_parser.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "user_agent_parser.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
var FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
var GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
var EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86";
var CRIOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1";

/* ---------- 1. 六条验收向量 ---------- */
var r = M.parseUserAgent(CHROME_WIN);
eq(r.browser, "Chrome", "验收1：Chrome/Windows 浏览器");
eq(r.browserMajor, "131", "验收1：Chrome 主版本 131");
eq(r.os, "Windows", "验收1：操作系统 Windows");
eq(r.osVersion, "10 / 11", "验收1：Win NT 10.0 标 Windows 10 / 11");
eq(r.device, "桌面", "验收1：设备 桌面");
eq(r.engine, "Blink", "验收1：引擎 Blink");

r = M.parseUserAgent(SAFARI_IPHONE);
eq(r.browser, "Safari", "验收2：Safari iPhone 浏览器");
eq(r.browserVersion, "17.2", "验收2：Safari 版本取 Version/ 17.2");
eq(r.os, "iOS", "验收2：操作系统 iOS");
eq(r.osVersion, "17.2", "验收2：iOS 版本 17.2");
eq(r.device, "手机", "验收2：设备 手机");
eq(r.engine, "WebKit", "验收2：引擎 WebKit");

r = M.parseUserAgent(FIREFOX_LINUX);
eq(r.browser, "Firefox", "验收3：Firefox/Linux 浏览器");
eq(r.browserMajor, "133", "验收3：Firefox 主版本 133");
eq(r.os, "Linux", "验收3：Linux 无发行版 token 时只写 Linux");
eq(r.device, "桌面", "验收3：设备 桌面");
eq(r.engine, "Gecko", "验收3：引擎 Gecko");

r = M.parseUserAgent(GOOGLEBOT);
eq(r.browser, "Googlebot", "验收4：Googlebot 具名机器人");
eq(r.device, "机器人·爬虫", "验收4：设备 机器人·爬虫");

r = M.parseUserAgent(EDGE_WIN);
eq(r.browser, "Edge", "验收5：Edg 在 Chrome 前，判 Edge 而非 Chrome");
eq(r.browserMajor, "131", "验收5：Edge 主版本 131");

r = M.parseUserAgent(CRIOS);
eq(r.browser, "Chrome", "验收6：CriOS 判 Chrome");
eq(r.engine, "WebKit", "验收6：iOS Chrome 引擎一律 WebKit");

/* ---------- 2. 检测顺序 ---------- */
r = M.parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/117.0.0.0");
eq(r.browser, "Opera", "顺序：OPR 在 Chrome 前，判 Opera");
r = M.parseUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/131.0.6778.87 Mobile Safari/537.36");
eq(r.browser, "Samsung Internet", "顺序：三星浏览器在 Chrome 前");
r = M.parseUserAgent("Mozilla/5.0 (compatible; SomeBot/1.0; +http://example.com/bot) AppleWebKit/537.36 Chrome/131.0.0.0");
eq(r.device, "机器人·爬虫", "顺序：机器人优先于浏览器判定");
r = M.parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15");
eq(r.browser, "Firefox", "顺序：FxiOS 判 Firefox");
eq(r.engine, "WebKit", "顺序：iOS Firefox 引擎一律 WebKit");
r = M.parseUserAgent("Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)");
eq(r.browser, "Internet Explorer", "IE：MSIE 判 IE");
eq(r.engine, "Trident", "IE：引擎 Trident");
r = M.parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko");
eq(r.browser, "Internet Explorer", "IE：Trident + rv:11 判 IE");
eq(r.browserVersion, "11.0", "IE：Trident rv: 版本 11.0");

/* ---------- 3. 系统映射与设备判定 ---------- */
r = M.parseUserAgent("Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36");
eq(r.osVersion, "7", "系统：NT 6.1 → Windows 7");
r = M.parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15");
eq(r.os, "macOS", "系统：macOS");
eq(r.osVersion, "14.2", "系统：macOS 下划线转点 14.2");
r = M.parseUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.87 Mobile Safari/537.36");
eq(r.os, "Android", "系统：Android 在 Linux 前");
eq(r.device, "手机", "设备：Android + Mobile 为手机");
r = M.parseUserAgent("Mozilla/5.0 (Linux; Android 14; SM-X916B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.87 Safari/537.36");
eq(r.device, "平板", "设备：Android 无 Mobile 为平板");
r = M.parseUserAgent("Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1");
eq(r.device, "平板", "设备：iPad 为平板");
r = M.parseUserAgent("Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0");
eq(r.os, "Ubuntu", "系统：字面有 Ubuntu token 时才认发行版");
r = M.parseUserAgent("curl/8.5.0");
eq(r.browser, "curl", "命令行：curl 具名");
eq(r.device, "未知", "命令行：curl 无从属设备，不猜设备");

/* ---------- 4. 容错：无意义输入与空输入 ---------- */
r = M.parseUserAgent("hello world this is not a user agent");
eq(r.browser, "未知", "容错：无意义输入浏览器未知");
eq(r.os, "未知", "容错：无意义输入系统未知");
eq(r.device, "未知", "容错：无意义输入设备未知");
eq(r.engine, "未知", "容错：无意义输入引擎未知");
ok(M.parseUserAgent("") === null, "容错：空输入为空态 null");
ok(M.parseUserAgent("   ") === null, "容错：空白输入为空态 null");
ok(M.parseUserAgent(null) === null, "容错：null 输入为空态 null");

/* ---------- 5. 预设、复制格式、注册与零网络静态检查 ---------- */
ok(M.PRESETS.length >= 6, "预设：6 组以上（实得 " + M.PRESETS.length + " 组）");
ok(M.PRESETS.every(function (p) { return M.parseUserAgent(p.ua) !== null; }), "预设：全部可载入解析");
var labels = M.PRESETS.map(function (p) { return p.label; }).join("|");
ok(labels.indexOf("Googlebot") >= 0 && labels.indexOf("curl") >= 0, "预设：含 Googlebot 与 curl");
var fmt = M.formatResult(M.parseUserAgent(CHROME_WIN));
ok(fmt.indexOf("Chrome") >= 0 && fmt.indexOf("Blink") >= 0 && fmt.indexOf(CHROME_WIN) >= 0, "复制：结果文本含浏览器/引擎/原始 UA");
ok(GO_SRC.indexOf('"user_agent_parser"') >= 0, "注册：categories.go 含 ID user_agent_parser");
ok(GO_SRC.indexOf('"/tools/user-agent-parser"') >= 0, "注册：categories.go 含 Path /tools/user-agent-parser");
ok(GO_SRC.indexOf('"devices"') >= 0, "注册：Icon devices");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 176, "注册：Path 总数 175→176");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/user-agent-parser") >= 0, "SEO：canonical 正确");
ok(TPL_SRC.indexOf("UA 可伪造") >= 0, "真限制：UA 可伪造可见");
ok(TPL_SRC.indexOf("Win10 / 11 无法区分") >= 0, "真限制：Win10/11 无法区分可见");
ok(TPL_SRC.indexOf("iOS 引擎一律 WebKit") >= 0, "真限制：iOS 引擎一律 WebKit 可见");
ok(TPL_SRC.indexOf("不做指纹识别") >= 0, "真限制：不做指纹识别可见");
ok(TPL_SRC.indexOf("data-uap-preset") >= 0, "模板：预设按钮存在");
ok(!/fetch\s*\(|XMLHttpRequest/.test(JS_SRC), "零网络：JS 无 fetch/XHR");
ok(!/https?:\/\/(fonts|cdn|unpkg|cdnjs)/.test(TPL_SRC), "零 CDN：模板无外部 CDN");
ok(TPL_SRC.indexOf("/tools/static/js/user_agent_parser.js") >= 0, "模板：引用本地 JS");

console.log("user_agent_parser: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);

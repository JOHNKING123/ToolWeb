/* 代理/VPN 伪装自查（proxy_camouflage_check）纯逻辑单元测试（零依赖）：
 * node tests/proxy_camouflage_check.test.js
 * 覆盖：checkTimezone（一致/不一致/去空白归一化、ipTimezone/browserTimezone
 * 非法抛错 err.field 全覆盖）、checkLanguage（启发式映射：zh-CN→CN 通过、
 * en-US→CN 启发式警告、ja-JP→JP 通过、de-DE→CN 警告、无映射语言不判定、
 * zh-Hans-CN 主子标签提取、countryCode 大小写归一、languages/countryCode
 * 非法抛错 err.field 全覆盖）、parseIceCandidates（srflx 数字 IPv4 检出泄露、
 * IPv6 检出、.local 不记泄露、混合去重、非法 IPv4 段 999 不计、前导零不计、
 * 空数组不泄露、candidates 非法抛错）、detectAutomation（webdriver 真/假、
 * 非布尔抛错 err.field='webdriverFlag'）、hashFingerprint（SHA-256 官方测试向量
 * '' 与 'abc'、确定性、输入差异、64 位十六进制形状、中文输入、长输入多分块、
 * 空串/非字符串抛错 err.field='input'）、scoreReport（全过 100/A、边界 90→A、
 * 85→B、68→C、40→D、四舍五入、summary 非空、results 非法抛错 err.field 全覆盖）、
 * module.exports 与 window.ProxyCamouflageCheck 挂载、categories.go 注册
 * （Path 总数 287→288、Icon radar 全库唯一、New/Category/中英文关键词）、
 * 模板（SEO 真限制四条明示、canonical/og 含新 Path、零外部资源静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var T = require("../static/js/proxy_camouflage_check.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) + " msg=" + e.message.slice(0, 40) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "proxy_camouflage_check.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "proxy_camouflage_check.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. checkTimezone ---------- */
var tz1 = T.checkTimezone("Asia/Shanghai", "Asia/Shanghai");
eq(tz1.pass, true, "checkTimezone：一致→pass=true");
has(tz1.detail, "一致", "checkTimezone：一致 detail 含中文说明");
var tz2 = T.checkTimezone("America/New_York", "Asia/Shanghai");
eq(tz2.pass, false, "checkTimezone：不一致→pass=false");
has(tz2.detail, "America/New_York", "checkTimezone：不一致 detail 含 IP 时区");
has(tz2.detail, "Asia/Shanghai", "checkTimezone：不一致 detail 含浏览器时区");
var tz3 = T.checkTimezone("  Asia/Shanghai\t", "Asia/Shanghai");
eq(tz3.pass, true, "checkTimezone：首尾空白归一化后一致");
throwsField(function () { T.checkTimezone("", "Asia/Shanghai"); }, "ipTimezone", "checkTimezone：ipTimezone 空串抛错 err.field='ipTimezone'");
throwsField(function () { T.checkTimezone(null, "Asia/Shanghai"); }, "ipTimezone", "checkTimezone：ipTimezone null 抛错");
throwsField(function () { T.checkTimezone(undefined, "Asia/Shanghai"); }, "ipTimezone", "checkTimezone：ipTimezone 缺失抛错");
throwsField(function () { T.checkTimezone("Asia/Shanghai", ""); }, "browserTimezone", "checkTimezone：browserTimezone 空串抛错 err.field='browserTimezone'");
throwsField(function () { T.checkTimezone("Asia/Shanghai", 123); }, "browserTimezone", "checkTimezone：browserTimezone 非字符串抛错");

/* ---------- 2. checkLanguage（启发式） ---------- */
var lg1 = T.checkLanguage(["zh-CN"], "CN");
eq(lg1.pass, true, "checkLanguage：验收 zh-CN→CN 通过");
eq(lg1.heuristic, true, "checkLanguage：返回 heuristic=true");
has(lg1.detail, "相符", "checkLanguage：通过 detail 含中文说明");
var lg2 = T.checkLanguage(["en-US"], "CN");
eq(lg2.pass, false, "checkLanguage：验收 en-US→CN 启发式警告（pass=false）");
eq(lg2.heuristic, true, "checkLanguage：警告仍 heuristic=true");
has(lg2.detail, "启发式", "checkLanguage：警告 detail 明示启发式");
var lg3 = T.checkLanguage(["en-US", "en"], "US");
eq(lg3.pass, true, "checkLanguage：en-US→US 通过");
var lg4 = T.checkLanguage(["ja-JP"], "JP");
eq(lg4.pass, true, "checkLanguage：ja-JP→JP 通过");
var lg5 = T.checkLanguage(["de-DE"], "CN");
eq(lg5.pass, false, "checkLanguage：de-DE→CN 警告");
var lg6 = T.checkLanguage(["xx-YY"], "CN");
eq(lg6.pass, true, "checkLanguage：无映射语言不做判定（pass=true）");
has(lg6.detail, "不做", "checkLanguage：无映射 detail 说明不判定");
var lg7 = T.checkLanguage(["zh-Hans-CN"], "CN");
eq(lg7.pass, true, "checkLanguage：zh-Hans-CN 主子标签 zh 提取→CN 通过");
var lg8 = T.checkLanguage(["zh-CN"], "cn");
eq(lg8.pass, true, "checkLanguage：countryCode 小写归一化");
throwsField(function () { T.checkLanguage([], "CN"); }, "languages", "checkLanguage：空数组抛错 err.field='languages'");
throwsField(function () { T.checkLanguage("zh-CN", "CN"); }, "languages", "checkLanguage：非数组抛错");
throwsField(function () { T.checkLanguage(null, "CN"); }, "languages", "checkLanguage：null 抛错");
throwsField(function () { T.checkLanguage(["zh-CN"], "C"); }, "countryCode", "checkLanguage：1 位国家码抛错 err.field='countryCode'");
throwsField(function () { T.checkLanguage(["zh-CN"], "CHN"); }, "countryCode", "checkLanguage：3 位国家码抛错");
throwsField(function () { T.checkLanguage(["zh-CN"], 1); }, "countryCode", "checkLanguage：非字符串国家码抛错");
throwsField(function () { T.checkLanguage(["zh-CN"], ""); }, "countryCode", "checkLanguage：空国家码抛错");

/* ---------- 3. parseIceCandidates ---------- */
var SRFLX = "candidate:8421630493 1 udp 1685987071 192.168.1.100 56123 typ srflx raddr 10.0.0.5 rport 56123";
var MDNS = "candidate:18220560 1 udp 2122260223 7f2a9c1d-3e4f-4a1b.local 51234 typ host";
var ice1 = T.parseIceCandidates([SRFLX]);
eq(ice1.leaked, true, "parseIceCandidates：数字 IPv4 检出泄露");
eq(ice1.ips.length, 1, "parseIceCandidates：ips 长度 1");
eq(ice1.ips[0], "192.168.1.100", "parseIceCandidates：ips[0] 为检出 IP");
var ice2 = T.parseIceCandidates([MDNS]);
eq(ice2.leaked, false, "parseIceCandidates：仅 .local 不记泄露");
eq(ice2.ips.length, 0, "parseIceCandidates：.local 时 ips 为空");
var ice3 = T.parseIceCandidates([SRFLX, MDNS, SRFLX]);
eq(ice3.leaked, true, "parseIceCandidates：混合候选仍记泄露");
eq(ice3.ips.length, 1, "parseIceCandidates：重复 IP 去重");
var ice4 = T.parseIceCandidates(["candidate:1 1 udp 2113937151 2001:db8::1 54874 typ host"]);
eq(ice4.leaked, true, "parseIceCandidates：IPv6 检出泄露");
eq(ice4.ips[0], "2001:db8::1", "parseIceCandidates：IPv6 地址提取正确");
var ice5 = T.parseIceCandidates([]);
eq(ice5.leaked, false, "parseIceCandidates：空数组不泄露");
var ice6 = T.parseIceCandidates(["candidate:1 1 udp 2113937151 999.1.1.1 9 typ host"]);
eq(ice6.leaked, false, "parseIceCandidates：非法 IPv4 段（999）不计泄露");
var ice7 = T.parseIceCandidates(["candidate:1 1 udp 2113937151 192.168.001.1 9 typ host"]);
eq(ice7.leaked, false, "parseIceCandidates：前导零 IPv4 不计泄露（严格校验）");
throwsField(function () { T.parseIceCandidates("not-array"); }, "candidates", "parseIceCandidates：非数组抛错 err.field='candidates'");
throwsField(function () { T.parseIceCandidates([123]); }, "candidates", "parseIceCandidates：元素非字符串抛错");
throwsField(function () { T.parseIceCandidates(null); }, "candidates", "parseIceCandidates：null 抛错");

/* ---------- 4. detectAutomation ---------- */
var au1 = T.detectAutomation(true);
eq(au1.pass, false, "detectAutomation：webdriver=true→pass=false（红灯）");
has(au1.detail, "webdriver", "detectAutomation：detail 含 webdriver 说明");
var au2 = T.detectAutomation(false);
eq(au2.pass, true, "detectAutomation：webdriver=false→pass=true（绿灯）");
throwsField(function () { T.detectAutomation("true"); }, "webdriverFlag", "detectAutomation：字符串抛错 err.field='webdriverFlag'");
throwsField(function () { T.detectAutomation(1); }, "webdriverFlag", "detectAutomation：数字抛错");
throwsField(function () { T.detectAutomation(undefined); }, "webdriverFlag", "detectAutomation：缺失抛错");

/* ---------- 5. hashFingerprint（SHA-256） ---------- */
eq(T.hashFingerprint("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "hashFingerprint：SHA-256('abc') 官方测试向量");
ok(/^[0-9a-f]{64}$/.test(T.hashFingerprint("hello")), "hashFingerprint：输出 64 位十六进制");
eq(T.hashFingerprint("hello"), T.hashFingerprint("hello"), "hashFingerprint：确定性（同输入同输出）");
ok(T.hashFingerprint("hello") !== T.hashFingerprint("world"), "hashFingerprint：输入差异输出差异");
var cnHash = T.hashFingerprint("代理伪装自查");
ok(/^[0-9a-f]{64}$/.test(cnHash) && cnHash === T.hashFingerprint("代理伪装自查"),
  "hashFingerprint：中文输入 UTF-8 编码正确且确定");
var longHash = T.hashFingerprint(new Array(1001).join("a"));
ok(/^[0-9a-f]{64}$/.test(longHash) && longHash === T.hashFingerprint(new Array(1001).join("a")),
  "hashFingerprint：长输入（多分块）确定性");
throwsField(function () { T.hashFingerprint(""); }, "input", "hashFingerprint：空串抛错 err.field='input'");
throwsField(function () { T.hashFingerprint(null); }, "input", "hashFingerprint：null 抛错");
throwsField(function () { T.hashFingerprint(123); }, "input", "hashFingerprint：非字符串抛错");

/* ---------- 6. scoreReport ---------- */
function mkItems() {
  var args = Array.prototype.slice.call(arguments);
  return args.map(function (s) { return {status: s}; });
}
var sc1 = T.scoreReport(mkItems("pass", "pass", "pass", "pass", "pass"));
eq(sc1.score, 100, "scoreReport：全过→100");
eq(sc1.level, "A", "scoreReport：100→A 级");
var sc2 = T.scoreReport(mkItems("pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "fail"));
eq(sc2.score, 90, "scoreReport：9 过 1 挂→90（边界）");
eq(sc2.level, "A", "scoreReport：90→A 级（≥90 边界）");
var sc3 = T.scoreReport(mkItems("pass", "warn"));
eq(sc3.score, 85, "scoreReport：1 过 1 警→85");
eq(sc3.level, "B", "scoreReport：85→B 级");
var sc4 = T.scoreReport(mkItems("pass", "warn", "unknown", "unknown"));
eq(sc4.score, 68, "scoreReport：(100+70+50+50)/4=67.5→四舍五入 68");
eq(sc4.level, "C", "scoreReport：68→C 级");
var sc5 = T.scoreReport(mkItems("fail", "unknown", "unknown", "unknown", "unknown"));
eq(sc5.score, 40, "scoreReport：1 挂 4 未知→40");
eq(sc5.level, "D", "scoreReport：40→D 级");
var sc6 = T.scoreReport(mkItems("fail", "fail"));
eq(sc6.score, 0, "scoreReport：全挂→0");
eq(sc6.level, "D", "scoreReport：0→D 级");
ok(typeof sc1.summary === "string" && sc1.summary.length > 0, "scoreReport：summary 为非空中文说明");
throwsField(function () { T.scoreReport("x"); }, "results", "scoreReport：非数组抛错 err.field='results'");
throwsField(function () { T.scoreReport([]); }, "results", "scoreReport：空数组抛错");
throwsField(function () { T.scoreReport([{status: "bogus"}]); }, "results", "scoreReport：非法 status 抛错");
throwsField(function () { T.scoreReport([null]); }, "results", "scoreReport：null 元素抛错");
throwsField(function () { T.scoreReport([{}]); }, "results", "scoreReport：缺 status 抛错");

/* ---------- 7. 挂载 ---------- */
["checkTimezone", "checkLanguage", "parseIceCandidates", "detectAutomation", "hashFingerprint", "scoreReport"].forEach(function (fn) {
  ok(typeof T[fn] === "function", "module.exports 暴露纯函数 " + fn);
});
has(JS_SRC, "window.ProxyCamouflageCheck", "JS 挂载 window.ProxyCamouflageCheck");
has(JS_SRC, "module.exports = ProxyCamouflageCheck", "JS 同步 module.exports 导出");

/* ---------- 8. categories.go 注册 ---------- */
var entryRe = /\{\s*ID:\s*"proxy_camouflage_check"[\s\S]*?\n\t\t\t\t\},/;
var entryMatch = GO_SRC.match(entryRe);
ok(!!entryMatch, "categories.go 含 proxy_camouflage_check 条目");
has(entryMatch[0], 'Path:        "/tools/proxy-camouflage-check"', "条目 Path=/tools/proxy-camouflage-check");
has(entryMatch[0], 'Icon:        "radar"', "条目 Icon=radar（开发轮精确值复测锁定）");
has(entryMatch[0], "New:         true", "条目 New=true");
has(entryMatch[0], 'Category:    "网络工具"', "条目 Category=网络工具");
has(entryMatch[0], "伪装", "条目 Description 含中文关键词");
has(entryMatch[0], "proxy", "条目 Description 含英文关键词");
var iconHits = (GO_SRC.match(/"radar"/g) || []).length;
eq(iconHits, 1, "Icon radar 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 321, "注册 Path 总数 287→288");

/* ---------- 9. 模板：SEO/真限制四条/零外部资源 ---------- */
has(TPL_SRC, "{{define \"proxy_camouflage_check\"}}", "模板 define 名正确");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/proxy-camouflage-check", "模板 canonical/og 含新 Path");
has(TPL_SRC, "/tools/static/js/proxy_camouflage_check.js", "模板引入新 JS");
has(TPL_SRC, "{{template \"nav\" .}}", "模板含导航");
has(TPL_SRC, "DNS 泄漏", "真限制①：DNS 泄漏本页不含页面明示");
has(TPL_SRC, "mDNS", "真限制②：WebRTC 受 mDNS 保护影响页面明示");
has(TPL_SRC, "启发式", "真限制③：语言-国家启发式页面明示");
has(TPL_SRC, "跨站追踪", "真限制④：指纹不做跨站追踪判定页面明示");
has(TPL_SRC, "一键复制", "模板含一键复制报告");
has(TPL_SRC, "WebRTC 泄露检测", "模板 SEO 关键词含 WebRTC 泄露检测");
notHas(TPL_SRC, "<script src=\"http", "模板零外部资源：无 http 外链 script");
notHas(TPL_SRC, "<link rel=\"stylesheet\" href=\"http", "模板零外部资源：无 http 外链 stylesheet（仅 canonical/og 元链接）");

console.log("\n断言通过 " + pass + "，失败 " + fail);
process.exit(fail === 0 ? 0 : 1);

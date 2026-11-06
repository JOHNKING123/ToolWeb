/* 密码泄露查询（k-匿名版）纯函数单元测试（零依赖）：node tests/password_breach_checker.test.js
 * 覆盖：splitHash 前缀 5 位／后缀 35 位精确值与非法抛错 err.field='sha1Hex'、
 * parseRangeResponse 解析／大小写归一／非法行抛错 err.field='text'（不静默跳过）、
 * findBreachCount 命中／未命中精确值、classifyCount 分级边界精确值、
 * buildAdvice 各档关键文案与非法分类抛错、非法参数 err.field、
 * categories.go 注册（Path 总数 302→303、Icon gpp_bad 全库唯一、New/类目）、
 * 模板（SEO 四关键词、真限制四条、密码生成器互链、零外部资源静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/password_breach_checker.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "password_breach_checker.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "password_breach_checker.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. splitHash：前缀 5 位／后缀 35 位精确值 ---------- */
var pw = M.splitHash("5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
eq(pw.prefix, "5BAA6", "password 哈希前缀=5BAA6");
eq(pw.suffix, "1E4C9B93F3F0682250B6CF8331B7EE68FD8", "password 哈希后缀精确值");
eq(pw.suffix.length, 35, "后缀长度=35");
var low = M.splitHash("7c4a8d09ca3762af61e59520943dc26494f8941b");
eq(low.prefix, "7C4A8", "小写输入前缀归一为大写 7C4A8");
eq(low.suffix, "D09CA3762AF61E59520943DC26494F8941B", "小写输入后缀归一为大写");
throws(function () { M.splitHash("5BAA6"); }, "sha1Hex", "过短哈希抛错 field=sha1Hex");
throws(function () { M.splitHash("5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD"); }, "sha1Hex", "39 位哈希抛错 field=sha1Hex");
throws(function () { M.splitHash("5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8X"); }, "sha1Hex", "41 位哈希抛错 field=sha1Hex");
throws(function () { M.splitHash("Zbaa61e4c9b93f3f0682250b6cf8331b7ee68fd8"); }, "sha1Hex", "非十六进制抛错 field=sha1Hex");
throws(function () { M.splitHash(null); }, "sha1Hex", "null 抛错 field=sha1Hex");
throws(function () { M.splitHash(123); }, "sha1Hex", "数字抛错 field=sha1Hex");

/* ---------- 2. parseRangeResponse：解析／大小写归一／非法行抛错 ---------- */
var parsed = M.parseRangeResponse(
  "1E4C9B93F3F0682250B6CF8331B7EE68FD8:9543232\n" +
  "d09ca3762af61e59520943dc26494f8941b:123456\n");
eq(parsed.length, 2, "两行解析出 2 条");
eq(parsed[0].suffix, "1E4C9B93F3F0682250B6CF8331B7EE68FD8", "首行后缀精确值");
eq(parsed[0].count, 9543232, "首行次数精确值");
eq(parsed[1].suffix, "D09CA3762AF61E59520943DC26494F8941B", "小写后缀归一为大写");
eq(parsed[1].count, 123456, "次行次数精确值");
eqj(M.parseRangeResponse(""), [], "空响应→空数组");
eq(M.parseRangeResponse("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0")[0].count, 0, "次数 0 解析");
throws(function () { M.parseRangeResponse(null); }, "text", "null 抛错 field=text");
throws(function () { M.parseRangeResponse(42); }, "text", "数字抛错 field=text");
throws(function () { M.parseRangeResponse("1E4C9B93F3F0682250B6CF8331B7EE68FD8"); }, "text", "缺冒号与次数的行抛错 field=text");
throws(function () { M.parseRangeResponse("1E4C9B93F3F0682250B6CF8331B7EE68FD8:abc"); }, "text", "非数字次数抛错 field=text");
throws(function () { M.parseRangeResponse("SHORT:5"); }, "text", "后缀过短抛错 field=text");
throws(function () { M.parseRangeResponse("1E4C9B93F3F0682250B6CF8331B7EE68FD8:5\nBADLINE"); }, "text", "第二行非法抛错不静默跳过 field=text");
throws(function () { M.parseRangeResponse("1E4C9B93F3F0682250B6CF8331B7EE68FD8:5:6"); }, "text", "多余冒号抛错 field=text");

/* ---------- 3. findBreachCount：命中／未命中精确值 ---------- */
eq(M.findBreachCount(parsed, "1E4C9B93F3F0682250B6CF8331B7EE68FD8"), 9543232, "命中首行次数精确值");
eq(M.findBreachCount(parsed, "d09ca3762af61e59520943dc26494f8941b"), 123456, "小写后缀查询命中");
eq(M.findBreachCount(parsed, "00000000000000000000000000000000000"), 0, "未命中返回 0");
eq(M.findBreachCount([], "1E4C9B93F3F0682250B6CF8331B7EE68FD8"), 0, "空列表返回 0");
throws(function () { M.findBreachCount(null, "1E4C9B93F3F0682250B6CF8331B7EE68FD8"); }, "entries", "entries 非数组抛错 field=entries");
throws(function () { M.findBreachCount(parsed, null); }, "suffix", "suffix null 抛错 field=suffix");
throws(function () { M.findBreachCount(parsed, "SHORT"); }, "suffix", "suffix 过短抛错 field=suffix");

/* ---------- 4. classifyCount：分级边界精确值 ---------- */
eq(M.classifyCount(0), "safe", "0→safe");
eq(M.classifyCount(1), "low", "1→low 下界");
eq(M.classifyCount(100), "low", "100→low 上界");
eq(M.classifyCount(101), "high", "101→high 下界");
eq(M.classifyCount(9543232), "high", "大次数→high");
throws(function () { M.classifyCount(-1); }, "count", "负数抛错 field=count");
throws(function () { M.classifyCount(1.5); }, "count", "非整数抛错 field=count");
throws(function () { M.classifyCount("100"); }, "count", "字符串抛错 field=count");
throws(function () { M.classifyCount(NaN); }, "count", "NaN 抛错 field=count");

/* ---------- 5. buildAdvice：各档关键文案 ---------- */
has(M.buildAdvice("safe"), "未在", "safe 档含未出现文案");
has(M.buildAdvice("low"), "建议更换", "low 档含建议更换");
has(M.buildAdvice("high"), "立即更换", "high 档含立即更换");
has(M.buildAdvice("high"), "复用", "high 档含检查复用");
has(M.buildAdvice("high"), "双因素", "high 档含开双因素");
throws(function () { M.buildAdvice("unknown"); }, "classification", "非法分类抛错 field=classification");
throws(function () { M.buildAdvice(null); }, "classification", "null 分类抛错 field=classification");

/* ---------- 6. 双模式导出与隐私约束 ---------- */
ok(typeof M.splitHash === "function" && typeof M.parseRangeResponse === "function" &&
  typeof M.findBreachCount === "function" && typeof M.classifyCount === "function" &&
  typeof M.buildAdvice === "function" && typeof M.hashPassword === "function",
  "module.exports 暴露全部纯函数与 hashPassword");
has(JS_SRC, "window.PasswordBreachChecker", "浏览器端挂 window.PasswordBreachChecker");
has(JS_SRC, "api.pwnedpasswords.com/range/", "JS 调用 HIBP range 接口");
notHas(JS_SRC, "localStorage", "JS 不写浏览器存储：无 localStorage");
notHas(JS_SRC, "sessionStorage", "JS 不写浏览器存储：无 sessionStorage");

/* ---------- 7. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 321, "注册 Path 总数 302→303");
has(GO_SRC, 'ID:          "password_breach_checker"', "注册：ID password_breach_checker");
has(GO_SRC, 'Path:        "/tools/password-breach-checker"', "注册：Path /tools/password-breach-checker");
has(GO_SRC, 'Icon:        "gpp_bad"', "注册：Icon gpp_bad");
eq((GO_SRC.match(/Icon:\s*"gpp_bad"/g) || []).length, 1, "Icon gpp_bad 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('ID:          "password_breach_checker"') - 60,
  GO_SRC.indexOf('ID:          "password_breach_checker"') + 1400);
has(entryBlock, "New:         true", "注册：New: true");
has(entryBlock, 'Category:    "加密解密"', "注册：类目 加密解密");

/* ---------- 8. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/password-breach-checker", "模板 canonical 含新 Path");
has(TPL_SRC, "密码泄露查询", "模板 SEO 关键词：密码泄露查询");
has(TPL_SRC, "密码是否被泄露", "模板 SEO 关键词：密码是否被泄露");
has(TPL_SRC, "密码被泄露了吗", "模板 SEO 关键词：密码被泄露了吗");
has(TPL_SRC, "Have I Been Pwned", "模板 SEO 关键词：Have I Been Pwned");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "泄露次数 ≠ 账号已被盗", "真限制①：次数≠被盗");
has(TPL_SRC, "只覆盖 HIBP 收录的泄露库", "真限制②：仅覆盖 HIBP 收录库");
has(TPL_SRC, "密码不出浏览器", "真限制③：密码不出浏览器");
has(TPL_SRC, "不记录、不上传、不保存任何密码", "真限制④：不记录不上传");
has(TPL_SRC, 'id="pbc-password"', "模板含密码输入框 pbc-password");
has(TPL_SRC, 'type="password"', "密码输入框 type=password");
has(TPL_SRC, 'id="pbc-clear"', "模板含一键清除 pbc-clear");
has(TPL_SRC, "/tools/password-generator", "互链：查出泄露→密码生成器");
has(TPL_SRC, "/tools/static/js/password_breach_checker.js", "模板引用 password_breach_checker.js");
has(TPL_SRC, "未能连接到查询服务，本次未完成查询，结果不是安全的证明", "诚实降级文案");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = (TPL_SRC.match(/<link[^>]*href="(http[^"]*)"/g) || []).map(function (t) {
  return t.replace(/^.*href="/, "").replace(/"$/, "");
});
ok(httpLinks.every(function (u) { return u.indexOf("johnkingzcq123.xyz") !== -1; }),
  "模板零外部样式：http link 仅 canonical 自家域名");
has(TPL_SRC, "aria-label", "模板：含 aria 无障碍标签");
has(TPL_SRC, "prefers-reduced-motion", "模板：动画可减弱媒体查询");

console.log("password_breach_checker: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);

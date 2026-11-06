/* 密码强度检测纯函数单元测试（零依赖）：node tests/password_strength_checker.test.js
 * 覆盖：detectCharset 各字符类组合精确值（小写 26／大写 26／数字 10／符号 33）、
 * calcEntropyBits 精确值（长度×log2(字符集大小)，保留 2 位小数）、
 * isCommonPassword 命中／未命中精确值（大小写不敏感）、
 * detectWeakPatterns 各模式精确值（repeat／sequence／keyboard／only-digits／only-letters）、
 * estimateCrackSeconds／formatDuration 精确值（离线 10^10 次／秒假设）、
 * classifyStrength 五级边界精确值（0–19／20–39／40–59／60–79／80–100）、
 * scorePassword 组合分／等级精确值（弱模式扣分＋常见密码封顶 10 分）、
 * buildSuggestions 逐项建议、非法参数抛错 err.field、
 * categories.go 注册（Path 总数 303→304、Icon gauge 全库唯一、New/类目）、
 * 模板（SEO 四关键词、真限制四条、密码输入框隐私属性、弱密码互链生成器与泄露查询、零外部资源静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/password_strength_checker.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function approx(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望约 " + b + "±" + tol + "，实得 " + a + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "password_strength_checker.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "password_strength_checker.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. detectCharset：各字符类组合精确值 ---------- */
eqj(M.detectCharset("abc"), { size: 26, classes: ["lower"] }, "仅小写：size=26");
eqj(M.detectCharset("ABC"), { size: 26, classes: ["upper"] }, "仅大写：size=26");
eqj(M.detectCharset("123"), { size: 10, classes: ["digit"] }, "仅数字：size=10");
eqj(M.detectCharset("!@#"), { size: 33, classes: ["symbol"] }, "仅符号：size=33");
eqj(M.detectCharset("aA1!"), { size: 95, classes: ["lower", "upper", "digit", "symbol"] }, "四类齐全：size=95");
eqj(M.detectCharset("a1"), { size: 36, classes: ["lower", "digit"] }, "小写+数字：size=36");
eqj(M.detectCharset("aB"), { size: 52, classes: ["lower", "upper"] }, "大小写：size=52");
eqj(M.detectCharset(""), { size: 0, classes: [] }, "空串：size=0");
eqj(M.detectCharset(" "), { size: 33, classes: ["symbol"] }, "空格归入符号类：size=33");
throws(function () { M.detectCharset(null); }, "password", "null 抛错 field=password");
throws(function () { M.detectCharset(123); }, "password", "数字抛错 field=password");
throws(function () { M.detectCharset(undefined); }, "password", "undefined 抛错 field=password");

/* ---------- 2. calcEntropyBits：长度×log2(字符集大小)，2 位小数 ---------- */
eq(M.calcEntropyBits("a"), 4.7, "a：1×log2(26)=4.7");
eq(M.calcEntropyBits("aaaa"), 18.8, "aaaa：4×log2(26)=18.8");
eq(M.calcEntropyBits("password"), 37.6, "password：8×log2(26)=37.6");
eq(M.calcEntropyBits("123456"), 19.93, "123456：6×log2(10)=19.93");
eq(M.calcEntropyBits("Ab1!"), 26.28, "Ab1!：4×log2(95)=26.28");
eq(M.calcEntropyBits(" "), 5.04, "空格：1×log2(33)=5.04");
eq(M.calcEntropyBits("aB3$xY9!qW2#eR7&"), 105.12, "16 位四类混合：16×log2(95)=105.12");
eq(M.calcEntropyBits("Abc12345"), 47.63, "Abc12345：8×log2(62)=47.63");
eq(M.calcEntropyBits("Tr0ub4dor&3"), 72.27, "Tr0ub4dor&3：11×log2(95)=72.27");
eq(M.calcEntropyBits(""), 0, "空串熵值=0");
throws(function () { M.calcEntropyBits(null); }, "password", "null 抛错 field=password");
throws(function () { M.calcEntropyBits(42); }, "password", "数字抛错 field=password");

/* ---------- 3. isCommonPassword：大小写不敏感命中／未命中 ---------- */
eq(M.isCommonPassword("password"), true, "password 命中");
eq(M.isCommonPassword("PASSWORD"), true, "PASSWORD 大写命中");
eq(M.isCommonPassword("Password"), true, "Password 首字母大写命中");
eq(M.isCommonPassword("123456"), true, "123456 命中");
eq(M.isCommonPassword("qwerty"), true, "qwerty 命中");
eq(M.isCommonPassword("QWERTY"), true, "QWERTY 大写命中");
eq(M.isCommonPassword("admin"), true, "admin 命中");
eq(M.isCommonPassword("letmein"), true, "letmein 命中");
eq(M.isCommonPassword("iloveyou"), true, "iloveyou 命中");
eq(M.isCommonPassword("1q2w3e4r"), true, "1q2w3e4r 命中");
eq(M.isCommonPassword("123456789"), true, "123456789 命中");
eq(M.isCommonPassword("111111"), true, "111111 命中");
eq(M.isCommonPassword("abc123"), true, "abc123 命中");
eq(M.isCommonPassword("password1"), true, "password1 命中");
eq(M.isCommonPassword("passw0rd!"), false, "passw0rd! 未命中（带符号变体）");
eq(M.isCommonPassword("Tr0ub4dor&3"), false, "Tr0ub4dor&3 未命中");
eq(M.isCommonPassword("correct horse battery staple"), false, "长口令未命中");
eq(M.isCommonPassword(""), false, "空串未命中");
throws(function () { M.isCommonPassword(null); }, "password", "null 抛错 field=password");
throws(function () { M.isCommonPassword(123); }, "password", "数字抛错 field=password");

/* ---------- 4. detectWeakPatterns：各模式精确值（固定顺序） ---------- */
eqj(M.detectWeakPatterns("abc"), ["sequence", "only-letters"], "abc：sequence+only-letters");
eqj(M.detectWeakPatterns("123"), ["sequence", "keyboard", "only-digits"], "123：sequence+keyboard+only-digits");
eqj(M.detectWeakPatterns("cba"), ["sequence", "only-letters"], "cba：递减 sequence");
eqj(M.detectWeakPatterns("321"), ["sequence", "keyboard", "only-digits"], "321：递减 sequence+keyboard");
eqj(M.detectWeakPatterns("zyx"), ["sequence", "only-letters"], "zyx：递减 sequence");
eqj(M.detectWeakPatterns("987"), ["sequence", "keyboard", "only-digits"], "987：递减 sequence+keyboard");
eqj(M.detectWeakPatterns("aaa"), ["repeat", "only-letters"], "aaa：repeat+only-letters");
eqj(M.detectWeakPatterns("111"), ["repeat", "only-digits"], "111：repeat+only-digits");
eqj(M.detectWeakPatterns("qwerty"), ["keyboard", "only-letters"], "qwerty：keyboard+only-letters");
eqj(M.detectWeakPatterns("asdf"), ["keyboard", "only-letters"], "asdf：keyboard+only-letters");
eqj(M.detectWeakPatterns("1qaz"), ["keyboard"], "1qaz：keyboard 列序列");
eqj(M.detectWeakPatterns("123456"), ["sequence", "keyboard", "only-digits"], "123456：三模式");
eqj(M.detectWeakPatterns("abcdef"), ["sequence", "keyboard", "only-letters"], "abcdef：sequence+keyboard（cde 为键盘列）");
eqj(M.detectWeakPatterns("aB3$xY"), [], "aB3$xY：无弱模式");
eqj(M.detectWeakPatterns("abab"), ["repeat", "only-letters"], "abab：整串重复 repeat");
eqj(M.detectWeakPatterns("abcabc"), ["repeat", "sequence", "only-letters"], "abcabc：repeat+sequence");
eqj(M.detectWeakPatterns(""), [], "空串：无模式");
eqj(M.detectWeakPatterns("a"), [], "单字符：无模式");
eqj(M.detectWeakPatterns("12"), ["only-digits"], "12：only-digits");
eqj(M.detectWeakPatterns("112233"), ["only-digits"], "112233：仅 only-digits（无三连）");
eqj(M.detectWeakPatterns("aaabbb"), ["repeat", "only-letters"], "aaabbb：repeat+only-letters");
eqj(M.detectWeakPatterns("password"), ["only-letters"], "password：仅 only-letters");
eqj(M.detectWeakPatterns("Tr0ub4dor&3"), [], "Tr0ub4dor&3：无弱模式");
throws(function () { M.detectWeakPatterns(null); }, "password", "null 抛错 field=password");
throws(function () { M.detectWeakPatterns(123); }, "password", "数字抛错 field=password");

/* ---------- 5. estimateCrackSeconds：2^bits ÷ 1e10 ---------- */
eq(M.estimateCrackSeconds(0), 1e-10, "0 bits→1e-10 秒");
approx(M.estimateCrackSeconds(10), 1.024e-7, 1e-12, "10 bits→1.024e-7 秒");
approx(M.estimateCrackSeconds(40), 109.9511627776, 1e-6, "40 bits→约 109.95 秒");
approx(M.estimateCrackSeconds(60), 115292150.4606847, 0.01, "60 bits→约 1.15 亿秒");
approx(M.estimateCrackSeconds(80), 120892581961462.92, 1, "80 bits→约 1.2e14 秒");
throws(function () { M.estimateCrackSeconds(-1); }, "bits", "负数抛错 field=bits");
throws(function () { M.estimateCrackSeconds(NaN); }, "bits", "NaN 抛错 field=bits");
throws(function () { M.estimateCrackSeconds("40"); }, "bits", "字符串抛错 field=bits");
throws(function () { M.estimateCrackSeconds(null); }, "bits", "null 抛错 field=bits");

/* ---------- 6. formatDuration：中文可读时长 ---------- */
eq(M.formatDuration(0), "不到 1 秒", "0 秒→不到 1 秒");
eq(M.formatDuration(0.5), "不到 1 秒", "0.5 秒→不到 1 秒");
eq(M.formatDuration(1), "约 1 秒", "1 秒");
eq(M.formatDuration(45), "约 45 秒", "45 秒");
eq(M.formatDuration(59), "约 59 秒", "59 秒");
eq(M.formatDuration(60), "约 1 分钟", "60 秒→1 分钟");
eq(M.formatDuration(90), "约 2 分钟", "90 秒→2 分钟（四舍五入）");
eq(M.formatDuration(3600), "约 1 小时", "3600 秒→1 小时");
eq(M.formatDuration(5400), "约 2 小时", "5400 秒→2 小时");
eq(M.formatDuration(3599), "约 1 小时", "3599 秒→1 小时（不写 60 分钟）");
eq(M.formatDuration(86400), "约 1 天", "86400 秒→1 天");
eq(M.formatDuration(172800), "约 2 天", "172800 秒→2 天");
eq(M.formatDuration(31557600), "约 1 年", "31557600 秒→1 年");
eq(M.formatDuration(31557600 * 1.5), "约 1.5 年", "1.5 年保留 1 位小数");
eq(M.formatDuration(315576000), "约 10 年", "10 年");
eq(M.formatDuration(31557600 * 150), "约 150 年", "150 年");
eq(M.formatDuration(31557600 * 25000), "约 2.5 万年", "25000 年→2.5 万年");
eq(M.formatDuration(31557600 * 2e8), "约 2 亿年", "2 亿年");
eq(M.formatDuration(Infinity), "超过 1 亿年", "Infinity→超过 1 亿年");
throws(function () { M.formatDuration(-1); }, "seconds", "负数抛错 field=seconds");
throws(function () { M.formatDuration(NaN); }, "seconds", "NaN 抛错 field=seconds");
throws(function () { M.formatDuration("60"); }, "seconds", "字符串抛错 field=seconds");
throws(function () { M.formatDuration(null); }, "seconds", "null 抛错 field=seconds");

/* ---------- 7. classifyStrength：五级边界精确值 ---------- */
eq(M.classifyStrength(0), "very-weak", "0→very-weak");
eq(M.classifyStrength(19), "very-weak", "19→very-weak 上界");
eq(M.classifyStrength(20), "weak", "20→weak 下界");
eq(M.classifyStrength(39), "weak", "39→weak 上界");
eq(M.classifyStrength(40), "medium", "40→medium 下界");
eq(M.classifyStrength(59), "medium", "59→medium 上界");
eq(M.classifyStrength(60), "strong", "60→strong 下界");
eq(M.classifyStrength(79), "strong", "79→strong 上界");
eq(M.classifyStrength(80), "very-strong", "80→very-strong 下界");
eq(M.classifyStrength(100), "very-strong", "100→very-strong");
throws(function () { M.classifyStrength(-1); }, "score", "负数抛错 field=score");
throws(function () { M.classifyStrength(101); }, "score", "101 抛错 field=score");
throws(function () { M.classifyStrength(NaN); }, "score", "NaN 抛错 field=score");
throws(function () { M.classifyStrength("50"); }, "score", "字符串抛错 field=score");
throws(function () { M.classifyStrength(null); }, "score", "null 抛错 field=score");

/* ---------- 8. scorePassword：组合分／等级精确值 ---------- */
function checkById(r, id) {
  for (var i = 0; i < r.checks.length; i++) if (r.checks[i].id === id) return r.checks[i];
  return null;
}
var rPw = M.scorePassword("password");
eq(rPw.score, 10, "password：常见密码封顶 10 分");
eq(rPw.level, "very-weak", "password：极弱");
eq(rPw.bits, 37.6, "password：bits=37.6");
approx(rPw.crackSeconds, 20.83, 0.01, "password：破解秒数约 20.83");
eq(checkById(rPw, "length-8").passed, true, "password：长度≥8 通过");
eq(checkById(rPw, "length-12").passed, false, "password：长度≥12 未通过");
eq(checkById(rPw, "lower").passed, true, "password：含小写通过");
eq(checkById(rPw, "upper").passed, false, "password：缺大写");
eq(checkById(rPw, "digit").passed, false, "password：缺数字");
eq(checkById(rPw, "symbol").passed, false, "password：缺符号");
eq(checkById(rPw, "not-common").passed, false, "password：常见密码未通过");
eq(checkById(rPw, "no-patterns").passed, false, "password：有弱模式未通过");
has(rPw.suggestions.join("；"), "常见密码", "password 建议含常见密码警告");
has(rPw.suggestions.join("；"), "不要只用字母", "password 建议含不要只用字母");
var r123 = M.scorePassword("123456");
eq(r123.score, 0, "123456：扣分后触底 0 分");
eq(r123.level, "very-weak", "123456：极弱");
eq(r123.bits, 19.93, "123456：bits=19.93");
var rAbc = M.scorePassword("Abc12345");
eq(rAbc.score, 28, "Abc12345：47.63-10-10=28 分");
eq(rAbc.level, "weak", "Abc12345：弱");
eq(rAbc.bits, 47.63, "Abc12345：bits=47.63");
var rTr = M.scorePassword("Tr0ub4dor&3");
eq(rTr.score, 72, "Tr0ub4dor&3：72 分无扣分");
eq(rTr.level, "strong", "Tr0ub4dor&3：强");
eq(rTr.bits, 72.27, "Tr0ub4dor&3：bits=72.27");
var rMix = M.scorePassword("aB3$xY9!qW2#eR7&");
eq(rMix.score, 100, "16 位混合随机：满分 100");
eq(rMix.level, "very-strong", "16 位混合随机：极强");
eq(rMix.bits, 105.12, "16 位混合随机：bits=105.12");
eq(checkById(rMix, "no-patterns").passed, true, "16 位混合随机：无弱模式通过");
var rQw = M.scorePassword("qwerty");
eq(rQw.score, 8, "qwerty：28.2-20=8 分");
eq(rQw.level, "very-weak", "qwerty：极弱");
var rEmpty = M.scorePassword("");
eq(rEmpty.score, 0, "空串：0 分");
eq(rEmpty.level, "very-weak", "空串：极弱");
eq(rEmpty.bits, 0, "空串：bits=0");
eq(rEmpty.crackSeconds, 1e-10, "空串：破解秒数 1e-10");
throws(function () { M.scorePassword(null); }, "password", "null 抛错 field=password");
throws(function () { M.scorePassword(123); }, "password", "数字抛错 field=password");

/* ---------- 9. buildSuggestions：逐项建议 ---------- */
function allPassChecks() {
  return [
    { id: "length-8", label: "长度至少 8 位", passed: true },
    { id: "length-12", label: "长度至少 12 位", passed: true },
    { id: "lower", label: "包含小写字母", passed: true },
    { id: "upper", label: "包含大写字母", passed: true },
    { id: "digit", label: "包含数字", passed: true },
    { id: "symbol", label: "包含符号", passed: true },
    { id: "not-common", label: "不是常见密码", passed: true },
    { id: "no-patterns", label: "无弱模式", passed: true }
  ];
}
eqj(M.buildSuggestions(allPassChecks(), [], false),
  ["已通过全部检查：仍请勿在多个网站复用同一密码，并开启双因素认证"],
  "全部通过：仅一条防复用提醒");
var suggCommon = M.buildSuggestions(allPassChecks(), [], true);
has(suggCommon.join("；"), "常见密码", "isCommon=true：建议含常见密码");
var missChecks = allPassChecks().map(function (c) {
  return { id: c.id, label: c.label, passed: (c.id === "length-8" || c.id === "lower") };
});
var suggMiss = M.buildSuggestions(missChecks, ["repeat", "sequence", "keyboard", "only-digits", "only-letters"], false);
has(suggMiss.join("；"), "12 位以上", "长度 8–11 位：建议加到 12 位以上");
has(suggMiss.join("；"), "大写字母", "缺大写：建议加大小写");
has(suggMiss.join("；"), "数字", "缺数字：建议加数字");
has(suggMiss.join("；"), "符号", "缺符号：建议加符号");
has(suggMiss.join("；"), "连续重复", "repeat：建议避免重复字符");
has(suggMiss.join("；"), "递增或递减", "sequence：建议避免连续字符");
has(suggMiss.join("；"), "键盘", "keyboard：建议避免键盘序列");
has(suggMiss.join("；"), "不要只用数字", "only-digits：建议混合字符");
has(suggMiss.join("；"), "不要只用字母", "only-letters：建议加入数字与符号");
var shortChecks = allPassChecks().map(function (c) {
  return { id: c.id, label: c.label, passed: false };
});
has(M.buildSuggestions(shortChecks, [], false).join("；"), "至少 8 位", "长度<8：建议至少 8 位");
throws(function () { M.buildSuggestions(null, [], false); }, "checks", "checks 非数组抛错 field=checks");
throws(function () { M.buildSuggestions([], "x", false); }, "patterns", "patterns 非数组抛错 field=patterns");
throws(function () { M.buildSuggestions([], [], "yes"); }, "isCommon", "isCommon 非布尔抛错 field=isCommon");

/* ---------- 10. 双模式导出与隐私约束 ---------- */
ok(typeof M.detectCharset === "function" && typeof M.calcEntropyBits === "function" &&
  typeof M.isCommonPassword === "function" && typeof M.detectWeakPatterns === "function" &&
  typeof M.estimateCrackSeconds === "function" && typeof M.formatDuration === "function" &&
  typeof M.classifyStrength === "function" && typeof M.scorePassword === "function" &&
  typeof M.buildSuggestions === "function",
  "module.exports 暴露全部纯函数");
has(JS_SRC, "window.PasswordStrengthChecker", "浏览器端挂 window.PasswordStrengthChecker");
notHas(JS_SRC, "localStorage", "JS 不写浏览器存储：无 localStorage");
notHas(JS_SRC, "sessionStorage", "JS 不写浏览器存储：无 sessionStorage");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");
notHas(JS_SRC, "复制密码", "JS 不提供复制密码按钮");
has(JS_SRC, "10^10", "JS 明示离线破解假设 10^10 次/秒");

/* ---------- 11. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 313, "注册 Path 总数 303→304");
has(GO_SRC, 'ID:          "password_strength_checker"', "注册：ID password_strength_checker");
has(GO_SRC, 'Path:        "/tools/password-strength-checker"', "注册：Path /tools/password-strength-checker");
has(GO_SRC, 'Icon:        "gauge"', "注册：Icon gauge");
eq((GO_SRC.match(/Icon:\s*"gauge"/g) || []).length, 1, "Icon gauge 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('ID:          "password_strength_checker"') - 60,
  GO_SRC.indexOf('ID:          "password_strength_checker"') + 1400);
has(entryBlock, "New:         true", "注册：New: true");
has(entryBlock, 'Category:    "加密解密"', "注册：类目 加密解密");

/* ---------- 12. 模板：SEO/真限制/隐私属性/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/password-strength-checker", "模板 canonical 含新 Path");
has(TPL_SRC, "密码强度检测", "模板 SEO 关键词：密码强度检测");
has(TPL_SRC, "密码强度测试", "模板 SEO 关键词：密码强度测试");
has(TPL_SRC, "密码安全吗", "模板 SEO 关键词：密码安全吗");
has(TPL_SRC, "密码熵值计算", "模板 SEO 关键词：密码熵值计算");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "基于假设的估算", "真限制①：熵值/破解时间基于假设的估算");
has(TPL_SRC, "强度高 ≠ 未泄露", "真限制②：强度高≠未泄露");
has(TPL_SRC, "强度高 ≠ 绝对安全", "真限制③：强度高≠绝对安全");
has(TPL_SRC, "不记录、不上传、不保存密码", "真限制④：不记录不上传不保存");
has(TPL_SRC, 'id="psc-password"', "模板含密码输入框 psc-password");
has(TPL_SRC, 'type="password"', "密码输入框 type=password");
has(TPL_SRC, 'autocomplete="off"', "密码输入框 autocomplete=off");
has(TPL_SRC, 'id="psc-clear"', "模板含一键清除 psc-clear");
notHas(TPL_SRC, "复制密码", "模板不提供复制密码按钮");
has(TPL_SRC, "/tools/password-generator", "互链：弱密码→密码生成器");
has(TPL_SRC, "/tools/password-breach-checker", "互链：弱密码→密码泄露查询");
has(TPL_SRC, "/tools/static/js/password_strength_checker.js", "模板引用 password_strength_checker.js");
has(TPL_SRC, "生成器强度条只对刚生成的密码", "模板：与生成器强度条口径差异说明");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = (TPL_SRC.match(/<link[^>]*href="(http[^"]*)"/g) || []).map(function (t) {
  return t.replace(/^.*href="/, "").replace(/"$/, "");
});
ok(httpLinks.every(function (u) { return u.indexOf("johnkingzcq123.xyz") !== -1; }),
  "模板零外部样式：http link 仅 canonical 自家域名");
has(TPL_SRC, "aria-label", "模板：含 aria 无障碍标签");
has(TPL_SRC, "prefers-reduced-motion", "模板：动画可减弱媒体查询");

console.log("password_strength_checker: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);

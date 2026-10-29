/* 示例生成正则表达式（grex 式）纯逻辑单元测试（零依赖）：node tests/regex_generator.test.js
 * 覆盖：7 组确定性生成向量（逐字命中）、失败向量（err.field=examples）、
 * 字符类/转义/归一化工具函数向量、不变式（new RegExp 匹配全部示例）、
 * 选项（锚定/数字合并/忽略大小写）、注册与零网络请求静态检查。
 *
 * 说明：规格书日期向量写作 ["2024-01-01","2024-12-31"]→^2024-[01][12]-[03][01]$，
 * 但按“全同列→字面”的字面规则，12-31 的末列恒为 '1'，连贯输出应为
 * ^2024-[01][12]-[03]1$（本文件已断言）；[03][01] 仅当第二条为 2024-12-30 时
 * 成立，判定规格书该处为笔误，本测试按 12-30 断言期望串。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/regex_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function throwsField(fn, field, name) {
  try { fn(); ok(false, name + "（未抛错）"); }
  catch (e) { ok(e instanceof Error && e.field === field, name + "（field=" + (e && e.field) + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "regex_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "regex_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var D = {}; // 默认选项：锚定开、数字合并关、大小写敏感

/* ---------- 1. 确定性生成向量（逐字命中） ---------- */
eq(M.generateRegex(["abc", "abd"], D), "^ab[cd]$", "向量 abc/abd");
eq(M.generateRegex(["file1.txt", "file2.txt"], D), "^file[12]\\.txt$", "向量 file1/file2");
eq(M.generateRegex(["file1.txt", "file2.txt"], { digitMerge: true }), "^file\\d\\.txt$", "向量 digitMerge 开");
eq(M.generateRegex(["img001.png", "img002.png", "img010.png"], D), "^img0[0-1][0-2]\\.png$", "向量 img001/002/010");
eq(M.generateRegex(["cat", "dog"], D), "^(cat|dog)$", "向量 cat/dog（无固定列→交替）");
eq(M.generateRegex(["cat", "cats"], D), "^(cat|cats)$", "向量 cat/cats（长度不一→交替）");
eq(M.generateRegex(["2024-01-01", "2024-12-30"], D), "^2024-[01][12]-[03][01]$", "向量日期 01-01/12-30");
eq(M.generateRegex(["2024-01-01", "2024-12-31"], D), "^2024-[01][12]-[03]1$", "12-31 末列恒为 1→字面（规格笔误对照）");
eq(M.generateRegex(["axc", "bxc"], D), "^[ab]xc$", "有固定列→逐列扫描");
eq(M.generateRegex(["a111", "a222"], D), "^a[12]{3}$", "相邻相同 token 合并量词");
eq(M.generateRegex(["abc", "abd"], { anchor: false }), "ab[cd]", "关锚定无 ^$");
eq(M.flagsFor({ ignoreCase: true }), "i", "flagsFor ignoreCase→i");
eq(M.flagsFor(D), "", "flagsFor 默认→空");

/* ---------- 2. 失败向量 ---------- */
throwsField(function () { M.generateRegex(["a"], D); }, "examples", "单条示例抛错");
throwsField(function () { M.generateRegex("", D); }, "examples", "空字符串抛错");
throwsField(function () { M.generateRegex([], D); }, "examples", "空数组抛错");
throwsField(function () { M.generateRegex("  \n \n", D); }, "examples", "全空白行抛错");
throwsField(function () { M.generateRegex(["a", "a", " "], D); }, "examples", "去重后不足 2 条抛错");
throwsField(function () { M.generateRegex(null, D); }, "examples", "null 抛错");

/* ---------- 3. 工具函数向量 ---------- */
eq(M.charClassFromSet(["c", "d"]), "[cd]", "charClass [c,d]");
eq(M.charClassFromSet(["0", "1", "2"]), "[0-9]", "charClass [0,1,2]");
eq(M.charClassFromSet(["a", "c", "b"]), "[a-c]", "charClass [a,c,b] 排序后区间");
eq(M.charClassFromSet(["0", "0", "1"]), "[0-1]", "charClass 列 (0,0,1) 连续计入重复");
eq(M.charClassFromSet(["0", "1"]), "[01]", "charClass 列 (0,1) 长度 2 并列");
eq(M.charClassFromSet(["a", "b"]), "[ab]", "charClass 字母长度 2 并列");
eq(M.escapeRegExpChar("."), "\\.", "escape '.'");
eq(M.escapeRegExpChar("a"), "a", "escape 普通字符");
eq(M.escapeRegExpChar("("), "\\(", "escape '('");
deepEq(M.normalizeExamples("a\n\nb\na\n"), ["a", "b"], "normalize 去空行去重");
deepEq(M.normalizeExamples(["x", "x", "y"]), ["x", "y"], "normalize 数组输入去重");
ok(Array.isArray(M.generateExample()) && M.generateExample().length >= 3, "generateExample 返回≥3 条");
deepEq(M.generateExample(), ["user_001", "user_002", "user_010"], "generateExample 固定示例");

/* ---------- 4. 不变式：new RegExp(生成结果) 匹配全部输入示例 ---------- */
function invariant(examples, options, name) {
  var p = M.generateRegex(examples, options || D);
  var re = new RegExp(p, M.flagsFor(options || D));
  var bad = examples.filter(function (s) { return !re.test(s); });
  ok(bad.length === 0, name + " 不变式 (" + p + ")");
}
invariant(["abc", "abd"], D, "不变式 abc/abd");
invariant(["file1.txt", "file2.txt"], D, "不变式 file");
invariant(["file1.txt", "file2.txt"], { digitMerge: true }, "不变式 digitMerge");
invariant(["img001.png", "img002.png", "img010.png"], D, "不变式 img");
invariant(["cat", "dog"], D, "不变式 cat/dog");
invariant(["cat", "cats"], D, "不变式 cat/cats");
invariant(["2024-01-01", "2024-12-30"], D, "不变式日期");
invariant(M.generateExample(), D, "不变式 generateExample()");
invariant(["Abc", "aBC"], { ignoreCase: true }, "不变式 ignoreCase 带 i");
invariant(["ab", "abc", "abd", "b"], D, "不变式混合长度交替");
invariant(["a.c", "abc", "a-c"], D, "不变式特殊字符转义");

/* ---------- 5. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"regex_generator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/regex-generator"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"regex_generator"');
ok(GO_SRC.slice(idx, idx + 1200).indexOf('Category:    "开发工具"') >= 0, "注册 Category 为开发工具");
ok(GO_SRC.slice(idx, idx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(idx, idx + 1200).indexOf('Icon:        "functions"') >= 0, "注册 Icon 为 functions");
var pathCount = 0, m, re2 = /"\/tools\/[^"]+"/g, seen = {};
while ((m = re2.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 225, "注册 Path 总数 224→225");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/<script[^>]+src="https?:\/\//.test(TPL_SRC), "模板无外部脚本引用（零 CDN）");
ok(!/rel="stylesheet"[^>]+href="https?:\/\//.test(TPL_SRC), "模板无外部样式引用（零 CDN）");
ok(TPL_SRC.indexOf('{{define "regex_generator"}}') >= 0, "模板 define 名与路由 regex-generator 对应");
ok(TPL_SRC.indexOf("生成的正则只保证匹配全部示例，不保证是最简或语义最优") >= 0, "模板含真限制：只保证匹配不保证最优");
ok(TPL_SRC.indexOf("不做捕获组命名") >= 0, "模板含真限制：不做捕获组命名");
ok(TPL_SRC.indexOf("不做多行语义分组") >= 0, "模板含真限制：不做多行语义分组");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "模板含真限制：不收集、不上传");
ok(TPL_SRC.indexOf("/tools/regex-tester") >= 0, "互链正则测试器");
ok(TPL_SRC.indexOf("/tools/regex-explainer") >= 0, "互链正则解释器");
var hrefs = {}, hm, hre = /href="\/tools\/([a-z0-9-]+)"/g, badLinks = [];
while ((hm = hre.exec(TPL_SRC)) !== null) {
  if (hm[1] === "static") continue;
  if (hm[1] !== "regex-tester" && hm[1] !== "regex-explainer") badLinks.push(hm[1]);
  hrefs[hm[1]] = true;
}
eq(badLinks.length, 0, "互链仅含正则测试器与正则解释器" + (badLinks.length ? "（多余：" + badLinks.join(",") + "）" : ""));
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/regex-generator") >= 0, "模板含 canonical/OG 链接");

console.log("regex_generator: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

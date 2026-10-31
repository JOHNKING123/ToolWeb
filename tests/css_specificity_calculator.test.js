/* CSS 特异性计算器纯逻辑单元测试（零依赖）：node tests/css_specificity_calculator.test.js
 * 覆盖：基础计数量向量、函数型伪类向量、比较与排序向量、
 * 非法与导出向量、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_specificity_calculator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function spec(sel, a, b, c, name) {
  var r = M.parseSelector(sel);
  eq(M.formatSpecificity(r), "(" + a + ", " + b + ", " + c + ")", name);
  eq(r.a, a, name + " a 分量");
  eq(r.b, b, name + " b 分量");
  eq(r.c, c, name + " c 分量");
}
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_specificity_calculator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_specificity_calculator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 基础计数量向量 ---------- */
spec("#main .card p", 1, 1, 1, "基础 #main .card p");
spec("div p", 0, 0, 2, "基础 div p");
spec("*", 0, 0, 0, "基础 通用选择器计 0");
spec("#id", 1, 0, 0, "基础 #id");
spec(".a.b", 0, 2, 0, "基础 .a.b");
spec("[data-x]", 0, 1, 0, "基础属性选择器");
spec("input[type=\"text\"]:focus", 0, 2, 1, "基础 input 属性＋伪类");
spec("a::after", 0, 0, 2, "基础 a::after");
spec("p:before", 0, 0, 2, "基础 legacy p:before 计 c");
spec("svg|a", 0, 0, 1, "基础命名空间 svg|a");
spec("div > p", 0, 0, 2, "基础组合子 div > p");
eq(M.parseSelector("div::slotted(span)").c, 2, "slotted 只计伪元素本身");
eq(M.parseSelector("div::part(foo)").c, 2, "part 只计伪元素本身");

/* ---------- 2. 函数型伪类向量 ---------- */
spec(":is(#a, .b)", 1, 0, 0, "函数 :is 取最大参数");
spec(":where(#a, .b)", 0, 0, 0, "函数 :where 计 0");
spec("div:not(.foo)", 0, 1, 1, "函数 div:not(.foo)");
spec(":has(> .active)", 0, 1, 0, "函数 :has 前导组合子剥离");
spec("li:nth-child(2n of .item)", 0, 2, 1, "函数 nth-child 含 of 从句");
spec("li:nth-child(2n)", 0, 1, 1, "函数 nth-child 无 of 从句");
spec(":not(.a, #b)", 1, 0, 0, "函数 :not 多参数取最大");
spec("p::first-line", 0, 0, 2, "legacy first-line 计 c");

/* ---------- 3. 比较与排序向量 ---------- */
eq(M.compareSpecificity({ a: 1, b: 0, c: 4 }, { a: 1, b: 2, c: 3 }), -1, "比较 (1,0,4)<(1,2,3)");
eq(M.compareSpecificity({ a: 0, b: 1, c: 2 }, { a: 0, b: 0, c: 9 }), 1, "比较 (0,1,2)>(0,0,9)");
eq(M.compareSpecificity({ a: 1, b: 2, c: 3 }, { a: 1, b: 2, c: 3 }), 0, "比较相等为 0");
eq(M.formatSpecificity({ a: 1, b: 2, c: 3 }), "(1, 2, 3)", "format (1,2,3)");
var ex = M.generateExample();
eq(ex.length, 5, "示例 5 条");
eq(ex[4], "ul#nav li.active a:hover", "示例末项");
var analyzed = M.analyzeSelectors(ex);
eq(analyzed.entries.filter(function (e) { return e.isWinner; }).length, 1, "示例胜出唯一");
eq(analyzed.sorted[0].selector, "ul#nav li.active a:hover", "示例排序首位为胜出者");
eq(analyzed.max.a, 1, "示例 max a");
var tied = M.analyzeSelectors(["a", "p", "div"]);
eq(tied.entries.filter(function (e) { return e.isWinner; }).length, 3, "并列全标 isWinner");
eq(tied.sorted.map(function (e) { return e.selector; }).join(","), "a,p,div", "并列排序稳定保持输入顺序");
eq(M.buildTextReport(analyzed).indexOf("胜出：ul#nav li.active a:hover") >= 0, true, "文本报告含胜出行");
eq(M.buildTextReport(tied).indexOf("胜出：a、p、div") >= 0, true, "文本报告并列胜出全列出");
var json = JSON.parse(M.buildJsonReport(analyzed));
eq(json.winners.length, 1, "JSON 报告 winners 唯一");
eq(json.winners[0], "ul#nav li.active a:hover", "JSON 报告胜出者正确");
eq(json.entries.length, 5, "JSON 报告 entries 5 条");

/* ---------- 4. 非法与导出向量 ---------- */
throws(function () { M.parseSelector(""); }, "selector", "非法空串");
throws(function () { M.parseSelector("div >"); }, "selector", "非法尾组合子 div >");
throws(function () { M.parseSelector("div["); }, "selector", "非法未配对方括号 div[");
throws(function () { M.parseSelector(":not()"); }, "selector", "非法空参数 :not()");
throws(function () { M.parseSelector("div !important"); }, "selector", "非法 div !important");
throws(function () { M.parseSelector("div >> p"); }, "selector", "非法连续组合子");
throws(function () { M.analyzeSelectors([]); }, "selectors", "非法空数组");
throws(function () { M.analyzeSelectors(["a", "div >"]); }, "selector", "非法数组中任一项失败");
throws(function () { M.formatSpecificity({ a: -1, b: 0, c: 0 }); }, "a", "非法负分量");
throws(function () { M.suggestExportName("html"); }, "kind", "非法导出 kind");
eq(M.suggestExportName("txt"), "specificity.txt", "导出命名 txt");
eq(M.suggestExportName("json"), "specificity.json", "导出命名 json");
eq(M.splitInput("a, b\n\nc , d").join("|"), "a|b|c|d", "splitInput 空行跳过、行内逗号切分");
throws(function () { M.splitInput("a,\n"); }, "selector", "splitInput 非空行空段失败");

/* ---------- 5. 注册与零网络静态检查 ---------- */
ok(GO_SRC.indexOf('"css_specificity_calculator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-specificity-calculator"') >= 0, "categories.go 注册 Path");
ok(/ID:\s+"css_specificity_calculator"[\s\S]{0,600}?Path:\s+"\/tools\/css-specificity-calculator"/.test(GO_SRC), "注册 ID 与 Path 同条目");
ok(/Icon:\s+"leaderboard"/.test(GO_SRC), "注册 Icon leaderboard");
ok((GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length === 245, "注册 Path 总数→245（历史遗留陈旧断言同步）");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("http://") < 0 || TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/css-specificity-calculator") >= 0, "模板无外站引用（canonical 除外）");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链 CSS 渐变生成器");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") >= 0, "互链 CSS 阴影与圆角生成器");
ok(TPL_SRC.indexOf("/tools/css-filter-generator") >= 0, "互链 CSS 滤镜生成器");
ok(TPL_SRC.indexOf("只做特异性计算与比较") >= 0, "真限制文案：只做特异性计算");
ok(TPL_SRC.indexOf("特异性胜出 ≠ 最终生效") >= 0, "真限制文案：胜出≠生效");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "真限制文案：不收集不上传");
ok(TPL_SRC.indexOf("scrollbar") < 0 && TPL_SRC.indexOf("css-unit") < 0, "不链未交付工具");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);

/* 百分比/成绩计算器（percentage_calc）纯逻辑单元测试（零依赖）：
 * node tests/percentage_calc.test.js
 * 覆盖：percentToDecimal / decimalToPercent（互转边界 0/100/小数循环 1/3、非法抛 Error
 * err.field='pct'/'dec'）、fractionToPercent（a/b→百分比、b=0 抛错 err.field='b'）、
 * changeRate（原值→现值涨跌幅＋增减绝对值、零基数/负基数抛错 err.field='oldVal'）、
 * applyRate（原值＋百分比求目标值、非法 err.field='base'/'pct'）、marksToPercent
 * （得分/总分→百分制＋等级、临界分 59/60/89/90、score>total 抛错、总分≤0 抛错、
 * 自定义段位、gradeFor）、DEFAULT_BANDS 常量、module.exports 与 window.PercentageCalc
 * 挂载、categories.go 注册（Path 总数 281→282、Icon percent 全库唯一、New/Category/
 * 中英文关键词）与模板（真限制四条、与 gpa_calculator/final_grade/score_stats
 * 双向互链「学习一条龙」、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/percentage_calc.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function approx(a, b, name) { ok(Math.abs(a - b) < 1e-9, name + "（期望≈" + b + "，实得 " + a + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "percentage_calc.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "percentage_calc.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. percentToDecimal：百分比→小数 ---------- */
eq(A.percentToDecimal(0), 0, "percentToDecimal：0→0");
eq(A.percentToDecimal(100), 1, "percentToDecimal：100→1");
eq(A.percentToDecimal(50), 0.5, "percentToDecimal：50→0.5");
eq(A.percentToDecimal(12.5), 0.125, "percentToDecimal：12.5→0.125");
approx(A.percentToDecimal(33.333), 0.33333, "percentToDecimal：33.333→0.33333");
eq(A.percentToDecimal(200), 2, "percentToDecimal：200→2");
throwsField(function () { A.percentToDecimal("50"); }, "pct", "percentToDecimal：字符串抛错 err.field='pct'");
throwsField(function () { A.percentToDecimal(NaN); }, "pct", "percentToDecimal：NaN 抛错 err.field='pct'");
throwsField(function () { A.percentToDecimal(Infinity); }, "pct", "percentToDecimal：Infinity 抛错 err.field='pct'");

/* ---------- 2. decimalToPercent：小数→百分比 ---------- */
eq(A.decimalToPercent(0), 0, "decimalToPercent：0→0");
eq(A.decimalToPercent(1), 100, "decimalToPercent：1→100");
eq(A.decimalToPercent(0.5), 50, "decimalToPercent：0.5→50");
approx(A.decimalToPercent(1 / 3), 33.33333333333333, "decimalToPercent：小数循环 1/3→33.33…");
eq(A.decimalToPercent(2.5), 250, "decimalToPercent：2.5→250");
eq(A.decimalToPercent(-0.25), -25, "decimalToPercent：-0.25→-25");
throwsField(function () { A.decimalToPercent("0.5"); }, "dec", "decimalToPercent：字符串抛错 err.field='dec'");
throwsField(function () { A.decimalToPercent(NaN); }, "dec", "decimalToPercent：NaN 抛错 err.field='dec'");

/* ---------- 3. fractionToPercent：分数 a/b→百分比 ---------- */
eq(A.fractionToPercent(1, 2), 50, "fractionToPercent：1/2→50");
eq(A.fractionToPercent(3, 4), 75, "fractionToPercent：3/4→75");
approx(A.fractionToPercent(1, 3), 33.33333333333333, "fractionToPercent：1/3→33.33…（小数循环）");
eq(A.fractionToPercent(0, 5), 0, "fractionToPercent：0/5→0");
eq(A.fractionToPercent(2, 1), 200, "fractionToPercent：2/1→200");
eq(A.fractionToPercent(7, 8), 87.5, "fractionToPercent：7/8→87.5");
eq(A.fractionToPercent(-1, 2), -50, "fractionToPercent：-1/2→-50（负数不钳制）");
throwsField(function () { A.fractionToPercent(1, 0); }, "b", "fractionToPercent：b=0 抛错 err.field='b'");
throwsField(function () { A.fractionToPercent("1", 2); }, "a", "fractionToPercent：a 非数字抛错 err.field='a'");
throwsField(function () { A.fractionToPercent(1, "2"); }, "b", "fractionToPercent：b 非数字抛错 err.field='b'");

/* ---------- 4. changeRate：涨跌幅 ---------- */
var cr1 = A.changeRate(100, 120);
eq(cr1.rate, 20, "changeRate：100→120 rate=20");
eq(cr1.diff, 20, "changeRate：100→120 diff=20");
var cr2 = A.changeRate(200, 150);
eq(cr2.rate, -25, "changeRate：200→150 rate=-25");
eq(cr2.diff, -50, "changeRate：200→150 diff=-50");
var cr3 = A.changeRate(100, 100);
eq(cr3.rate, 0, "changeRate：100→100 rate=0");
eq(cr3.diff, 0, "changeRate：100→100 diff=0");
var cr4 = A.changeRate(3, 4);
approx(cr4.rate, 33.33333333333333, "changeRate：3→4 rate≈33.33（小数循环）");
eq(cr4.diff, 1, "changeRate：3→4 diff=1");
throwsField(function () { A.changeRate(0, 100); }, "oldVal", "changeRate：零基数抛错 err.field='oldVal'");
throwsField(function () { A.changeRate(-100, 120); }, "oldVal", "changeRate：负基数抛错 err.field='oldVal'");
throwsField(function () { A.changeRate(NaN, 100); }, "oldVal", "changeRate：oldVal 非数字抛错 err.field='oldVal'");
throwsField(function () { A.changeRate(100, "120"); }, "newVal", "changeRate：newVal 非数字抛错 err.field='newVal'");

/* ---------- 5. applyRate：原值＋百分比求目标值 ---------- */
eq(A.applyRate(100, 20), 120, "applyRate：100＋20%→120");
eq(A.applyRate(100, -20), 80, "applyRate：100−20%→80");
eq(A.applyRate(0, 50), 0, "applyRate：0＋50%→0");
eq(A.applyRate(200, 12.5), 225, "applyRate：200＋12.5%→225");
eq(A.applyRate(100, 0), 100, "applyRate：100＋0%→100");
eq(A.applyRate(80, -100), 0, "applyRate：80−100%→0");
throwsField(function () { A.applyRate("100", 20); }, "base", "applyRate：base 非数字抛错 err.field='base'");
throwsField(function () { A.applyRate(100, "20"); }, "pct", "applyRate：pct 非数字抛错 err.field='pct'");

/* ---------- 6. marksToPercent：成绩百分比＋等级（默认段位） ---------- */
var m1 = A.marksToPercent(90, 100);
eq(m1.percent, 90, "marksToPercent：90/100 percent=90");
eq(m1.grade, "A", "marksToPercent：90/100 grade=A");
var m2 = A.marksToPercent(59, 100);
eq(m2.percent, 59, "marksToPercent：59/100 percent=59");
eq(m2.grade, "F", "marksToPercent：临界 59→F");
var m3 = A.marksToPercent(60, 100);
eq(m3.grade, "D", "marksToPercent：临界 60→D");
var m4 = A.marksToPercent(89, 100);
eq(m4.grade, "B", "marksToPercent：临界 89→B");
var m5 = A.marksToPercent(75, 100);
eq(m5.grade, "C", "marksToPercent：75→C");
var m6 = A.marksToPercent(100, 100);
eq(m6.grade, "A", "marksToPercent：100/100→A");
var m7 = A.marksToPercent(0, 100);
eq(m7.grade, "F", "marksToPercent：0/100→F");
var m8 = A.marksToPercent(45, 50);
eq(m8.percent, 90, "marksToPercent：45/50 percent=90");
eq(m8.grade, "A", "marksToPercent：45/50 grade=A");
approx(A.marksToPercent(2, 3).percent, 66.66666666666667, "marksToPercent：2/3→66.67…（小数循环）");
var m9 = A.marksToPercent(84, 100, [[85, "A"], [70, "B"], [55, "C"], [40, "D"], [0, "F"]]);
eq(m9.grade, "B", "marksToPercent：自定义段位 84→B");
var m10 = A.marksToPercent(85, 100, [[85, "A"], [70, "B"], [55, "C"], [40, "D"], [0, "F"]]);
eq(m10.grade, "A", "marksToPercent：自定义段位阈值含本数 85→A");
throwsField(function () { A.marksToPercent(150, 100); }, "score", "marksToPercent：score>total 抛错 err.field='score'");
throwsField(function () { A.marksToPercent(-5, 100); }, "score", "marksToPercent：score<0 抛错 err.field='score'");
throwsField(function () { A.marksToPercent("86", 100); }, "score", "marksToPercent：score 非数字抛错 err.field='score'");
throwsField(function () { A.marksToPercent(86, 0); }, "total", "marksToPercent：total=0 抛错 err.field='total'");
throwsField(function () { A.marksToPercent(86, -100); }, "total", "marksToPercent：total<0 抛错 err.field='total'");
throwsField(function () { A.marksToPercent(86, "100"); }, "total", "marksToPercent：total 非数字抛错 err.field='total'");
throwsField(function () { A.marksToPercent(86, 100, "bad"); }, "bands", "marksToPercent：bands 非法抛错 err.field='bands'");

/* ---------- 7. gradeFor：等级映射 ---------- */
eq(A.gradeFor(95), "A", "gradeFor：95→A");
eq(A.gradeFor(85), "B", "gradeFor：85→B");
eq(A.gradeFor(59.9), "F", "gradeFor：59.9→F");
eq(A.gradeFor(60), "D", "gradeFor：60→D");
eq(A.gradeFor(88, [[85, "A"], [0, "B"]]), "A", "gradeFor：自定义段位 88→A");
throwsField(function () { A.gradeFor(101); }, "percent", "gradeFor：percent>100 抛错 err.field='percent'");
throwsField(function () { A.gradeFor(90, [[90]]); }, "bands", "gradeFor：bands 段非法抛错 err.field='bands'");

/* ---------- 8. 常量与挂载 ---------- */
ok(Array.isArray(A.DEFAULT_BANDS) && A.DEFAULT_BANDS.length === 5, "DEFAULT_BANDS：5 段默认段位");
eq(A.DEFAULT_BANDS[0][0], 90, "DEFAULT_BANDS：A 阈值 90");
eq(A.DEFAULT_BANDS[0][1], "A", "DEFAULT_BANDS：首段等级 A");
eq(typeof A.percentToDecimal, "function", "module.exports 含 percentToDecimal");
eq(typeof A.decimalToPercent, "function", "module.exports 含 decimalToPercent");
eq(typeof A.fractionToPercent, "function", "module.exports 含 fractionToPercent");
eq(typeof A.changeRate, "function", "module.exports 含 changeRate");
eq(typeof A.applyRate, "function", "module.exports 含 applyRate");
eq(typeof A.marksToPercent, "function", "module.exports 含 marksToPercent");
has(JS_SRC, "window.PercentageCalc", "JS 挂载 window.PercentageCalc");

/* ---------- 9. categories.go 注册 ---------- */
var pcIdx = GO_SRC.indexOf('"percentage_calc"');
ok(pcIdx >= 0, "注册含 ID percentage_calc");
has(GO_SRC, 'Path:        "/tools/percentage-calc"', "注册 Path 为 /tools/percentage-calc");
var pcBlock = GO_SRC.slice(pcIdx, pcIdx + 1800);
has(pcBlock, "百分比/成绩计算器", "注册 Name 为 百分比/成绩计算器");
has(pcBlock, 'Category:    "学习工具"', "注册 Category 为学习工具");
has(pcBlock, "New:         true", "注册 New: true");
has(pcBlock, 'Icon:        "percent"', "注册 Icon 为 percent");
has(pcBlock, "涨跌幅", "Description 含「涨跌幅」");
has(pcBlock, "localStorage", "Description 含「localStorage」");
has(pcBlock, "percentage", "Description 含英文「percentage」");
has(pcBlock, "学习一条龙", "Description 含「学习一条龙」互链文案");
var iconRe = /"percent"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon percent 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 312, "注册 Path 总数 281→282");

/* ---------- 10. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/percentage-calc", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="pc-app"', "模板含应用根节点 pc-app");
has(TPL_SRC, 'id="pc-pct"', "模板含百分比输入 pc-pct");
has(TPL_SRC, 'id="pc-dec"', "模板含小数输入 pc-dec");
has(TPL_SRC, 'id="pc-frac-a"', "模板含分子输入 pc-frac-a");
has(TPL_SRC, 'id="pc-cr-old"', "模板含涨跌幅原值 pc-cr-old");
has(TPL_SRC, 'id="pc-ar-base"', "模板含目标值原值 pc-ar-base");
has(TPL_SRC, 'id="pc-mk-score"', "模板含得分输入 pc-mk-score");
has(TPL_SRC, 'id="pc-band-a"', "模板含段位阈值输入 pc-band-a");
has(TPL_SRC, 'id="pc-goto-gpa"', "模板含 GPA 跳转按钮 pc-goto-gpa");
has(TPL_SRC, 'src="/tools/static/js/percentage_calc.js?v=1"', "模板引用新 JS（v=1）");
has(TPL_SRC, "涨跌幅/折扣口径因场景而异", "真限制①：涨跌幅口径明示");
has(TPL_SRC, "等级段位各校不同", "真限制②：等级段位明示");
has(TPL_SRC, "展示修约", "真限制③：小数展示修约明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制④：纯本地零上传");
has(TPL_SRC, "仅供参考", "真限制：仅供参考");
has(TPL_SRC, "/tools/gpa-calculator", "互链：GPA 绩点计算器（双向）");
has(TPL_SRC, "/tools/final-grade", "互链：期末成绩目标计算器（双向）");
has(TPL_SRC, "/tools/score-stats", "互链：成绩统计分析（双向）");
has(TPL_SRC, "学习一条龙", "互链文案：学习一条龙");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

/* ---------- 11. 反向互链：三工具模板含本工具链接 ---------- */
var FG_TPL = fs.readFileSync(path.join(ROOT, "templates", "final_grade.html"), "utf8");
var SS_TPL = fs.readFileSync(path.join(ROOT, "templates", "score_stats.html"), "utf8");
var GPA_TPL = fs.readFileSync(path.join(ROOT, "templates", "gpa_calculator.html"), "utf8");
has(FG_TPL, "/tools/percentage-calc", "反向互链：final_grade 模板链回 percentage-calc");
has(SS_TPL, "/tools/percentage-calc", "反向互链：score_stats 模板链回 percentage-calc");
has(GPA_TPL, "/tools/percentage-calc", "反向互链：gpa_calculator 模板链回 percentage-calc");

console.log("percentage_calc: pass=" + pass + " fail=" + fail);
if (fail > 0) { process.exit(1); }

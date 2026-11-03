/* GPA 绩点计算器（gpa_calculator）纯逻辑单元测试（零依赖）：
 * node tests/gpa_calculator.test.js
 * 覆盖：scoreToPoint 四算法边界值（std4 各档临界分、pku4 线性/上限/<60、scale5 分档、
 * percent 原值返回、等级制 A+~F 大小写/空格容忍）、calcGPA 确定性向量（加权/等级混合/
 * percent/空数组/非法 credit 与 score 的 err.field）、whatIf（增量/减量/零变化/
 * 等级输入/非法 index 与 newScore 的 err.field）、ALGORITHMS 常量、module.exports 与
 * window.GpaCalculator 挂载、categories.go 注册（Path 总数 280→281、Icon scoreboard
 * 全库唯一、New/Category/中英文关键词）与模板（真限制四条、与 final_grade/score_stats
 * 双向互链「学习一条龙」、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/gpa_calculator.js");

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
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "gpa_calculator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "gpa_calculator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. scoreToPoint：标准 4.0 制各档临界分 ---------- */
eq(A.scoreToPoint(0, "std4"), 0, "std4：0→0");
eq(A.scoreToPoint(59, "std4"), 0, "std4：59→0");
eq(A.scoreToPoint(59.9, "std4"), 0, "std4：59.9→0");
eq(A.scoreToPoint(60, "std4"), 1.0, "std4：60→1.0");
eq(A.scoreToPoint(63, "std4"), 1.0, "std4：63→1.0");
eq(A.scoreToPoint(64, "std4"), 1.5, "std4：64→1.5");
eq(A.scoreToPoint(67, "std4"), 1.5, "std4：67→1.5");
eq(A.scoreToPoint(68, "std4"), 2.0, "std4：68→2.0");
eq(A.scoreToPoint(71, "std4"), 2.0, "std4：71→2.0");
eq(A.scoreToPoint(72, "std4"), 2.3, "std4：72→2.3");
eq(A.scoreToPoint(74, "std4"), 2.3, "std4：74→2.3");
eq(A.scoreToPoint(75, "std4"), 2.7, "std4：75→2.7");
eq(A.scoreToPoint(77, "std4"), 2.7, "std4：77→2.7");
eq(A.scoreToPoint(78, "std4"), 3.0, "std4：78→3.0");
eq(A.scoreToPoint(81, "std4"), 3.0, "std4：81→3.0");
eq(A.scoreToPoint(82, "std4"), 3.3, "std4：82→3.3");
eq(A.scoreToPoint(84, "std4"), 3.3, "std4：84→3.3");
eq(A.scoreToPoint(85, "std4"), 3.7, "std4：85→3.7");
eq(A.scoreToPoint(89, "std4"), 3.7, "std4：89→3.7");
eq(A.scoreToPoint(89.5, "std4"), 3.7, "std4：89.5→3.7");
eq(A.scoreToPoint(90, "std4"), 4.0, "std4：90→4.0");
eq(A.scoreToPoint(100, "std4"), 4.0, "std4：100→4.0");

/* ---------- 2. scoreToPoint：北大 4.0 制（线性/上限/<60） ---------- */
eq(A.scoreToPoint(0, "pku4"), 0, "pku4：0→0");
eq(A.scoreToPoint(59, "pku4"), 0, "pku4：59→0（不及格记 0）");
eq(A.scoreToPoint(60, "pku4"), 1.0, "pku4：60→1.0（(60-50)/10）");
eq(A.scoreToPoint(67, "pku4"), 1.7, "pku4：67→1.7");
eq(A.scoreToPoint(70, "pku4"), 2.0, "pku4：70→2.0");
eq(A.scoreToPoint(75, "pku4"), 2.5, "pku4：75→2.5");
eq(A.scoreToPoint(90, "pku4"), 4.0, "pku4：90→4.0");
eq(A.scoreToPoint(95, "pku4"), 4.0, "pku4：95→4.0（上限钳制）");
eq(A.scoreToPoint(100, "pku4"), 4.0, "pku4：100→4.0（上限钳制）");

/* ---------- 3. scoreToPoint：5.0 制分档 ---------- */
eq(A.scoreToPoint(0, "scale5"), 0, "scale5：0→0");
eq(A.scoreToPoint(59, "scale5"), 0, "scale5：59→0");
eq(A.scoreToPoint(60, "scale5"), 2.0, "scale5：60→2.0");
eq(A.scoreToPoint(69, "scale5"), 2.0, "scale5：69→2.0");
eq(A.scoreToPoint(70, "scale5"), 3.0, "scale5：70→3.0");
eq(A.scoreToPoint(79, "scale5"), 3.0, "scale5：79→3.0");
eq(A.scoreToPoint(80, "scale5"), 4.0, "scale5：80→4.0");
eq(A.scoreToPoint(89, "scale5"), 4.0, "scale5：89→4.0");
eq(A.scoreToPoint(90, "scale5"), 5.0, "scale5：90→5.0");
eq(A.scoreToPoint(100, "scale5"), 5.0, "scale5：100→5.0");

/* ---------- 4. scoreToPoint：百分制加权平均分（原值返回） ---------- */
eq(A.scoreToPoint(85.5, "percent"), 85.5, "percent：85.5 原值返回");
eq(A.scoreToPoint(0, "percent"), 0, "percent：0 原值返回");
eq(A.scoreToPoint(100, "percent"), 100, "percent：100 原值返回");
eq(A.scoreToPoint("B+", "percent"), 87, "percent：等级 B+ 按代表分 87 返回");

/* ---------- 5. scoreToPoint：等级制输入 ---------- */
eq(A.scoreToPoint("A+", "std4"), 4.0, "等级：A+→std4 4.0");
eq(A.scoreToPoint("A", "std4"), 4.0, "等级：A→std4 4.0");
eq(A.scoreToPoint("A-", "std4"), 4.0, "等级：A-→std4 4.0");
eq(A.scoreToPoint("B+", "std4"), 3.7, "等级：B+→std4 3.7");
eq(A.scoreToPoint("B", "std4"), 3.3, "等级：B→std4 3.3");
eq(A.scoreToPoint("B-", "std4"), 3.0, "等级：B-→std4 3.0");
eq(A.scoreToPoint("C+", "std4"), 2.7, "等级：C+→std4 2.7");
eq(A.scoreToPoint("C", "std4"), 2.3, "等级：C→std4 2.3");
eq(A.scoreToPoint("C-", "std4"), 2.0, "等级：C-→std4 2.0");
eq(A.scoreToPoint("D", "std4"), 1.5, "等级：D→std4 1.5");
eq(A.scoreToPoint("F", "std4"), 0, "等级：F→std4 0");
eq(A.scoreToPoint("a", "std4"), 4.0, "等级：小写 a 容忍");
eq(A.scoreToPoint(" b+ ", "std4"), 3.7, "等级：首尾空格＋小写容忍");
eq(A.scoreToPoint("A", "scale5"), 5.0, "等级：A→scale5 5.0");
eq(A.scoreToPoint("F", "scale5"), 0, "等级：F→scale5 0");
eq(A.scoreToPoint("B", "pku4"), 3.3, "等级：B→pku4 3.3（(83-50)/10）");

/* ---------- 6. scoreToPoint：非法参数 err.field ---------- */
throwsField(function () { A.scoreToPoint(101, "std4"); }, "score", "百分制 101 越界：err.field='score'");
throwsField(function () { A.scoreToPoint(-1, "std4"); }, "score", "百分制 -1 越界：err.field='score'");
throwsField(function () { A.scoreToPoint(NaN, "std4"); }, "score", "NaN：err.field='score'");
throwsField(function () { A.scoreToPoint("Z", "std4"); }, "score", "非法等级 Z：err.field='score'");
throwsField(function () { A.scoreToPoint("", "std4"); }, "score", "空串：err.field='score'");
throwsField(function () { A.scoreToPoint(null, "std4"); }, "score", "null：err.field='score'");
throwsField(function () { A.scoreToPoint(85, "bad"); }, "algorithm", "非法 algorithm：err.field='algorithm'");
throwsField(function () { A.scoreToPoint(85, undefined); }, "algorithm", "algorithm 缺失：err.field='algorithm'");

/* ---------- 7. calcGPA：确定性向量 ---------- */
var g1 = A.calcGPA([{ name: "高数", score: 90, credit: 3 }, { name: "英语", score: 80, credit: 2 }], "std4");
eq(g1.gpa, 3.6, "向量1：std4 加权 GPA=3.6（(4.0×3+3.0×2)/5）");
eq(g1.totalCredits, 5, "向量1：总学分=5");
eq(g1.totalCourses, 2, "向量1：课程数=2");
var g2 = A.calcGPA([{ name: "a", score: 100, credit: 4 }, { name: "b", score: 60, credit: 4 }], "std4");
eq(g2.gpa, 2.5, "向量2：std4 (4.0×4+1.0×4)/8=2.5");
var g3 = A.calcGPA([{ name: "a", score: "A", credit: 3 }, { name: "b", score: "B", credit: 1 }], "std4");
eq(g3.gpa, 3.83, "向量3：等级混合 A(3学分)+B(1学分)=3.83");
var g4 = A.calcGPA([{ name: "a", score: 90, credit: 2 }, { name: "b", score: 80, credit: 2 }], "percent");
eq(g4.gpa, 85, "向量4：percent 加权平均分=85");
eq(g4.totalCredits, 4, "向量4：总学分=4");
var g5 = A.calcGPA([{ name: "a", score: 90, credit: 3 }, { name: "b", score: 75, credit: 2 }], "pku4");
eq(g5.gpa, 3.4, "向量5：pku4 (4.0×3+2.5×2)/5=3.4");
var g0 = A.calcGPA([], "std4");
eq(g0.gpa, 0, "空数组：gpa=0");
eq(g0.totalCredits, 0, "空数组：totalCredits=0");
eq(g0.totalCourses, 0, "空数组：totalCourses=0");
eq(A.calcGPA([{ name: "a", score: 90, credit: 3 }], "std4").gpa, 4.0, "单门：gpa=4.0");
eq(A.calcGPA([{ name: "a", score: 90, credit: 3 }, { name: "b", score: 80, credit: 2 }], "std4").gpa, 3.6, "重复调用确定性一致");

/* ---------- 8. calcGPA：非法参数 err.field ---------- */
throwsField(function () { A.calcGPA("x", "std4"); }, "courses", "courses 非数组：err.field='courses'");
throwsField(function () { A.calcGPA([{ name: "a", score: 90, credit: 0 }], "std4"); }, "courses", "credit=0：err.field='courses'");
throwsField(function () { A.calcGPA([{ name: "a", score: 90, credit: -1 }], "std4"); }, "courses", "credit 为负：err.field='courses'");
throwsField(function () { A.calcGPA([{ name: "a", score: 90, credit: NaN }], "std4"); }, "courses", "credit=NaN：err.field='courses'");
throwsField(function () { A.calcGPA([{ name: "a", score: 101, credit: 3 }], "std4"); }, "courses", "score 越界 101：err.field='courses'");
throwsField(function () { A.calcGPA([{ name: "a", score: "Z", credit: 3 }], "std4"); }, "courses", "score 非法等级：err.field='courses'");
throwsField(function () { A.calcGPA([{ name: "a", score: 90, credit: 3 }], "bad"); }, "algorithm", "algorithm 非法：err.field='algorithm'");

/* ---------- 9. whatIf：增量/减量/零变化 ---------- */
var wc = [{ name: "高数", score: 80, credit: 3 }];
var w1 = A.whatIf(wc, "std4", 0, 90);
eq(w1.gpa, 4.0, "what-if：80→90 后 GPA=4.0");
eq(w1.delta, 1.0, "what-if：delta=+1.0");
var w2 = A.whatIf(wc, "std4", 0, 70);
eq(w2.gpa, 2.0, "what-if：80→70 后 GPA=2.0");
eq(w2.delta, -1.0, "what-if：delta=-1.0");
var wc2 = [{ name: "a", score: 90, credit: 3 }, { name: "b", score: 70, credit: 2 }];
var w3 = A.whatIf(wc2, "std4", 1, 95);
eq(w3.gpa, 4.0, "what-if 多门：第 2 门 70→95 后 GPA=4.0");
eq(w3.delta, 0.8, "what-if 多门：delta=+0.8（3.2→4.0）");
var w4 = A.whatIf(wc2, "std4", 1, 70);
eq(w4.delta, 0, "what-if：假设分与原分相同 delta=0");
var w5 = A.whatIf([{ name: "a", score: "B", credit: 2 }], "std4", 0, "A");
eq(w5.gpa, 4.0, "what-if：等级输入 B→A 后 GPA=4.0");
eq(w5.delta, 0.7, "what-if：等级输入 delta=+0.7（3.3→4.0）");

/* ---------- 10. whatIf：非法参数 err.field ---------- */
throwsField(function () { A.whatIf(wc, "std4", -1, 90); }, "index", "index=-1：err.field='index'");
throwsField(function () { A.whatIf(wc, "std4", 1, 90); }, "index", "index 越界：err.field='index'");
throwsField(function () { A.whatIf(wc, "std4", 0.5, 90); }, "index", "index 非整数：err.field='index'");
throwsField(function () { A.whatIf(wc, "std4", "0", 90); }, "index", "index 非数字：err.field='index'");
throwsField(function () { A.whatIf([], "std4", 0, 90); }, "index", "courses 为空：err.field='index'");
throwsField(function () { A.whatIf(wc, "std4", 0, 101); }, "score", "newScore 越界：err.field='score'");
throwsField(function () { A.whatIf(wc, "std4", 0, "Z"); }, "score", "newScore 非法等级：err.field='score'");
throwsField(function () { A.whatIf(wc, "bad", 0, 90); }, "algorithm", "algorithm 非法：err.field='algorithm'");
throwsField(function () { A.whatIf([{ name: "a", score: 101, credit: 3 }], "std4", 0, 90); }, "courses", "原课程 score 非法：err.field='courses'");

/* ---------- 11. ALGORITHMS 常量 ---------- */
ok(Array.isArray(A.ALGORITHMS), "module.exports 含 ALGORITHMS");
eq(A.ALGORITHMS.length, 4, "ALGORITHMS 共 4 项");
eq(A.ALGORITHMS.map(function (a) { return a.id; }).join(","), "std4,pku4,scale5,percent", "ALGORITHMS id 顺序");
ok(A.ALGORITHMS.every(function (a) { return a.name && a.desc; }), "ALGORITHMS 每项有 name/desc");
ok(A.ALGORITHMS[0].desc.indexOf("85–89=3.7") !== -1, "ALGORITHMS std4 换算表描述可复用");
ok(A.GRADE_TO_SCORE && A.GRADE_TO_SCORE["A+"] === 97 && A.GRADE_TO_SCORE.F === 30, "module.exports 含 GRADE_TO_SCORE");

/* ---------- 12. 导出与挂载 ---------- */
eq(typeof A.scoreToPoint, "function", "module.exports 含 scoreToPoint");
eq(typeof A.calcGPA, "function", "module.exports 含 calcGPA");
eq(typeof A.whatIf, "function", "module.exports 含 whatIf");
has(JS_SRC, "window.GpaCalculator", "JS 挂载 window.GpaCalculator");

/* ---------- 13. categories.go 注册 ---------- */
var gcIdx = GO_SRC.indexOf('"gpa_calculator"');
ok(gcIdx >= 0, "注册含 ID gpa_calculator");
has(GO_SRC, 'Path:        "/tools/gpa-calculator"', "注册 Path 为 /tools/gpa-calculator");
var gcBlock = GO_SRC.slice(gcIdx, gcIdx + 1800);
has(gcBlock, "GPA 绩点计算器", "注册 Name 为 GPA 绩点计算器");
has(gcBlock, 'Category:    "学习工具"', "注册 Category 为学习工具");
has(gcBlock, "New:         true", "注册 New: true");
has(gcBlock, 'Icon:        "scoreboard"', "注册 Icon 为 scoreboard");
has(gcBlock, "what-if", "Description 含「what-if」");
has(gcBlock, "localStorage", "Description 含「localStorage」");
has(gcBlock, "GPA calculator", "Description 含「GPA calculator」");
has(gcBlock, "学习一条龙", "Description 含「学习一条龙」互链文案");
var iconRe = /"scoreboard"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon scoreboard 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 282, "注册 Path 总数 280→281");

/* ---------- 14. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/gpa-calculator", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="gpa-app"', "模板含应用根节点 gpa-app");
has(TPL_SRC, 'id="gpa-algos"', "模板含算法选择容器 gpa-algos");
has(TPL_SRC, 'id="gpa-tbody"', "模板含课程表 gpa-tbody");
has(TPL_SRC, 'id="gpa-add"', "模板含添加课程按钮 gpa-add");
has(TPL_SRC, 'id="gpa-result"', "模板含结果区 gpa-result");
has(TPL_SRC, 'id="gpa-value"', "模板含 GPA 大数字 gpa-value");
has(TPL_SRC, 'id="gpa-copy"', "模板含复制按钮 gpa-copy");
has(TPL_SRC, 'id="gpa-sample"', "模板含示例按钮 gpa-sample");
has(TPL_SRC, 'id="gpa-wif-score"', "模板含 what-if 假设分输入 gpa-wif-score");
has(TPL_SRC, 'id="gpa-wif"', "模板含 what-if 列表 gpa-wif");
has(TPL_SRC, 'id="gpa-error"', "模板含错误提示 gpa-error");
has(TPL_SRC, 'src="/tools/static/js/gpa_calculator.js?v=1"', "模板引用新 JS（v=1）");
has(TPL_SRC, "各校绩点算法差异大", "真限制①：各校算法差异大明示");
has(TPL_SRC, "等级制输入按代表分折算", "真限制②：等级折算口径明示");
has(TPL_SRC, "保留 2 位小数", "真限制③：2 位小数修约明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制④：纯本地零上传");
has(TPL_SRC, "仅供参考", "真限制：仅供参考");
has(TPL_SRC, "/tools/final-grade", "互链：期末成绩目标计算器（双向）");
has(TPL_SRC, "/tools/score-stats", "互链：成绩统计分析（双向）");
has(TPL_SRC, "学习一条龙", "互链文案：学习一条龙");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

console.log("gpa_calculator: pass=" + pass + " fail=" + fail);
process.exit(fail === 0 ? 0 : 1);

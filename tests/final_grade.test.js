/* 期末成绩目标计算器（final_grade）纯逻辑单元测试（零依赖）：
 * node tests/final_grade.test.js
 * 覆盖：规格确定性向量逐字命中（requiredOnFinal 四向量 needed/locked/status、
 * formatNeeded 两向量文案、非法参数抛 Error 的 err.field）、
 * categories.go 注册（Path 总数 277→279、Icon grade 全库唯一、
 * New/Category/中英文关键词）与模板（真限制四条、
 * 与闪卡/学习笔记/成绩统计互链「学习一条龙」、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/final_grade.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "final_grade.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "final_grade.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var W = { usual: 0.3, mid: 0.3, final: 0.4 };

/* ---------- 1. requiredOnFinal：规格确定性向量（逐字） ---------- */
var r1 = A.requiredOnFinal(85, 70, W, 80);
eq(r1.needed, 83.8, "向量1：needed=83.8（(80-46.5)/0.4=83.75→保留1位）");
eq(r1.status, "possible", "向量1：status='possible'");
eq(A.requiredOnFinal(95, 95, W, 80).status, "reached", "向量2：status='reached'（57.5≤60及格线）");
var r3 = A.requiredOnFinal(85, 70, W, 95);
eq(r3.needed, 121.3, "向量3：needed=121.3（(95-46.5)/0.4=121.25→保留1位）");
eq(r3.status, "impossible", "向量3：status='impossible'");
var r4 = A.requiredOnFinal(85, null, { usual: 0.4, mid: 0, final: 0.6 }, 85);
eq(r4.needed, 85, "向量4（mid=null）：needed=85");
eq(r4.status, "possible", "向量4（mid=null）：status='possible'");
eq(r1.locked, 46.5, "locked：向量1已锁定分数=46.5");
eq(r4.locked, 34, "locked：向量4已锁定分数=34");
var r0 = A.requiredOnFinal(95, 95, W, 50);
eq(r0.needed, 0, "已提前达标：needed钳制为0");
eq(r0.status, "reached", "已提前达标：status='reached'");
eq(A.requiredOnFinal(85, 70, W, 80).needed, 83.8, "重复调用确定性一致");

/* ---------- 2. requiredOnFinal：非法参数 err.field ---------- */
throwsField(function () { A.requiredOnFinal(85, 70, { usual: 0.3, mid: 0.3, final: 0.3 }, 80); }, "weights", "权重和≠1（0.9）：err.field='weights'");
throwsField(function () { A.requiredOnFinal(85, 70, { usual: 0.4, mid: 0.4, final: 0.4 }, 80); }, "weights", "权重和≠1（1.2）：err.field='weights'");
throwsField(function () { A.requiredOnFinal(85, 70, { usual: 0.5, mid: 0.5, final: 0 }, 80); }, "weights", "weights.final===0：err.field='weights'");
throwsField(function () { A.requiredOnFinal(85, 70, { usual: -0.1, mid: 0.5, final: 0.6 }, 80); }, "weights", "权重为负：err.field='weights'");
throwsField(function () { A.requiredOnFinal(85, 70, "0.3/0.3/0.4", 80); }, "weights", "weights非对象：err.field='weights'");
throwsField(function () { A.requiredOnFinal(85, 70, null, 80); }, "weights", "weights为null：err.field='weights'");
throwsField(function () { A.requiredOnFinal(85, null, { usual: 0.4, mid: 0.1, final: 0.5 }, 85); }, "weights", "mid=null但weights.mid≠0：err.field='weights'");
throwsField(function () { A.requiredOnFinal(101, 70, W, 80); }, "usual", "usual=101：err.field='usual'");
throwsField(function () { A.requiredOnFinal(-1, 70, W, 80); }, "usual", "usual=-1：err.field='usual'");
throwsField(function () { A.requiredOnFinal("85", 70, W, 80); }, "usual", "usual为字符串：err.field='usual'");
throwsField(function () { A.requiredOnFinal(NaN, 70, W, 80); }, "usual", "usual=NaN：err.field='usual'");
throwsField(function () { A.requiredOnFinal(85, 101, W, 80); }, "mid", "mid=101：err.field='mid'");
throwsField(function () { A.requiredOnFinal(85, "70", W, 80); }, "mid", "mid为字符串：err.field='mid'");
throwsField(function () { A.requiredOnFinal(85, 70, W, "80"); }, "target", "target='80'：err.field='target'");
throwsField(function () { A.requiredOnFinal(85, 70, W, 101); }, "target", "target=101：err.field='target'");
throwsField(function () { A.requiredOnFinal(85, 70, W, NaN); }, "target", "target=NaN：err.field='target'");

/* ---------- 3. formatNeeded：规格确定性向量（逐字） ---------- */
eq(A.formatNeeded(83.8, "possible"), "期末至少需要考 83.8 分", "formatNeeded(83.8,'possible')逐字");
eq(A.formatNeeded(0, "reached"), "已提前达标，期末任意分数都达标", "formatNeeded(0,'reached')逐字");
throwsField(function () { A.formatNeeded(0, "x"); }, "status", "formatNeeded(0,'x')：err.field='status'");
throwsField(function () { A.formatNeeded(83.8, "READY"); }, "status", "非法status大小写：err.field='status'");
throwsField(function () { A.formatNeeded("83.8", "possible"); }, "needed", "needed为字符串：err.field='needed'");
throwsField(function () { A.formatNeeded(-1, "possible"); }, "needed", "needed为负：err.field='needed'");
throwsField(function () { A.formatNeeded(NaN, "possible"); }, "needed", "needed=NaN：err.field='needed'");
eq(A.formatNeeded(85, "possible"), "期末至少需要考 85.0 分", "formatNeeded(85,'possible')：toFixed(1)保留1位小数");
eq(A.formatNeeded(121.3, "impossible"), "即使期末考满分 100 分也无法达到目标", "formatNeeded(121.3,'impossible')逐字");
has(A.formatNeeded(57.5, "reached"), "57.5", "reached非零文案含分数");

/* ---------- 4. window.FinalGrade / module.exports 同步导出 ---------- */
eq(typeof A.requiredOnFinal, "function", "module.exports 含 requiredOnFinal");
eq(typeof A.formatNeeded, "function", "module.exports 含 formatNeeded");
has(JS_SRC, "window.FinalGrade", "JS 挂载 window.FinalGrade");
eq(A.PASS_LINE, 60, "及格线常数 PASS_LINE=60");

/* ---------- 5. categories.go 注册 ---------- */
var fgIdx = GO_SRC.indexOf('"final_grade"');
ok(fgIdx >= 0, "注册含 ID final_grade");
has(GO_SRC, 'Path:        "/tools/final-grade"', "注册 Path 为 /tools/final-grade");
var fgBlock = GO_SRC.slice(fgIdx, fgIdx + 1600);
has(fgBlock, "期末成绩目标计算器", "注册 Name 为期末成绩目标计算器");
has(fgBlock, 'Category:    "学习工具"', "注册 Category 为学习工具");
has(fgBlock, "New:         true", "注册 New: true");
has(fgBlock, "期末", "Description 含「期末」");
has(fgBlock, "目标总评", "Description 含「目标总评」");
has(fgBlock, "绩点", "Description 含「绩点」");
has(fgBlock, "final grade", "Description 含「final grade」");
var iconRe = /"grade"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon grade 全库唯一（精确值复测锁定）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 281, "注册 Path 总数 277→278");

/* ---------- 6. 模板：SEO/真限制/互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/final-grade", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="fg-app"', "模板含应用根节点 fg-app");
has(TPL_SRC, 'id="fg-usual"', "模板含平时分输入 fg-usual");
has(TPL_SRC, 'id="fg-no-mid"', "模板含无期中复选框 fg-no-mid");
has(TPL_SRC, 'id="fg-calc"', "模板含计算按钮 fg-calc");
has(TPL_SRC, 'id="fg-copy"', "模板含复制按钮 fg-copy");
has(TPL_SRC, 'id="fg-presets"', "模板含预设方案容器 fg-presets");
has(TPL_SRC, "各校权重口径不同", "真限制①：各校权重口径不同明示");
has(TPL_SRC, "绩点", "真限制②：绩点换算各校不同明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制③：纯本地零上传");
has(TPL_SRC, "仅供参考", "真限制④：仅供参考");
has(TPL_SRC, "/tools/flashcard-maker", "互链：闪卡卡片生成器");
has(TPL_SRC, "/tools/study-notes", "互链：学习笔记整理器");
has(TPL_SRC, "/tools/score-stats", "互链：成绩统计分析");
has(TPL_SRC, "学习一条龙", "互链文案：学习一条龙");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

console.log("final_grade: pass=" + pass + " fail=" + fail);
process.exit(fail === 0 ? 0 : 1);

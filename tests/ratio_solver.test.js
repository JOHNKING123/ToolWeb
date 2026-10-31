/* 比例求解器纯逻辑单元测试（零依赖）：node tests/ratio_solver.test.js
 * 覆盖：规格确定性向量逐字命中（四个求解方向交叉相乘、精度控制）、
 * simplifyRatio GCD 化简、parseRatio 解析正反例、PRESETS 常量表、
 * toFraction 分数约分、非法参数抛 Error（含 err.field）、
 * categories.go 注册（Path 总数 243→244）与零网络请求静态检查、
 * 真限制三条明示、互链合规（算术题生成器双向、单位换算器单向链入）。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/ratio_solver.js");

var pass = 0, fail = 0;
function sval(v) { return JSON.stringify(v); }
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + sval(b) + "，实得 " + sval(a) + "）"); }
function deepEq(a, b, name) { ok(sval(a) === sval(b), name + "（期望 " + sval(b) + "，实得 " + sval(a) + "）"); }
function throwsWithField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error, name + "：抛出 Error 类型");
    eq(e.field, field, name + "：err.field");
    return;
  }
  fail++; console.error("FAIL:", name + "：未抛出异常");
}
function throwsAny(fn, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error, name + "：抛出 Error 类型");
    ok(e.field !== undefined && e.field !== null && e.field !== "", name + "：err.field 非空");
    return;
  }
  fail++; console.error("FAIL:", name + "：未抛出异常");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "ratio_solver.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "ratio_solver.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 规格确定性向量（逐字命中）
 * 注：BACKLOG 写的 solveRatio(3,4,null,8)→d=10.6667 自相矛盾——按 (a,b,c,d) 顺序
 * null 落在 c 位则求解目标是 c（ad=bc 得 c=a*d/b=6），而公式 d=4×8/3 要求已知项为
 * a=3,b=4,c=8、求解 d。实现按 ad=bc 数学正确执行；测试按公式的真实意图断言
 * solveRatio(3,4,8,null)，并另行 pin 住字面调用 (3,4,null,8)→c=6 的正确行为。 */
deepEq(M.solveRatio(3, 4, 8, null), { a: 3, b: 4, c: 8, d: 10.6667 },
  "向量：solveRatio(3,4,8,null) → d=10.6667（d=b*c/a=4*8/3）");
eq(M.solveRatio(3, 4, 8, null).d, 10.6667, "向量：d=10.6667（4 位精度）");
deepEq(M.solveRatio(3, 4, null, 8), { a: 3, b: 4, c: 6, d: 8 },
  "字面调用 solveRatio(3,4,null,8)：null 在 c 位→求解 c=a*d/b=6（ad=bc）");
deepEq(M.solveRatio(16, 9, 1080, null), { a: 16, b: 9, c: 1080, d: 607.5 },
  "向量：solveRatio(16,9,1080,null) → d=607.5");
deepEq(M.solveRatio(1920, null, 16, 9), { a: 1920, b: 1080, c: 16, d: 9 },
  "向量：solveRatio(1920,null,16,9) → b=1080（ad=bc：b=a*d/c=1920*9/16；BACKLOG 写 3413.3333 系算术笔误）");
deepEq(M.solveRatio(null, 9, 1080, 607.5), { a: 16, b: 9, c: 1080, d: 607.5 },
  "方向 a：solveRatio(null,9,1080,607.5) → a=16");
deepEq(M.solveRatio(3, 4, 9, null), { a: 3, b: 4, c: 9, d: 12 },
  "方向 d：solveRatio(3,4,9,null) → d=12");
deepEq(M.solveRatio(2, null, 6, 9), { a: 2, b: 3, c: 6, d: 9 },
  "方向 b：solveRatio(2,null,6,9) → b=3");
deepEq(M.solveRatio(2, 3, null, 9), { a: 2, b: 3, c: 6, d: 9 },
  "方向 c：solveRatio(2,3,null,9) → c=6");
eq(M.simplifyRatio(1920, 1080), "16:9", "向量：simplifyRatio(1920,1080)='16:9'");
eq(M.simplifyRatio(16, 24), "2:3", "向量：simplifyRatio(16,24)='2:3'");
deepEq(M.parseRatio("16:9"), { a: 16, b: 9 }, "向量：parseRatio('16:9')={a:16,b:9}");
throwsAny(function () { M.solveRatio(null, null, 16, 9); }, "向量：solveRatio(null,null,16,9) 抛 Error");
throwsAny(function () { M.solveRatio(0, 0, 16, 9); }, "向量：solveRatio(0,0,16,9) 抛 Error（四项全填无求解项）");

/* ---------- 2. 求解：空字符串/undefined 视为求解项，精度控制 ---------- */
deepEq(M.solveRatio(3, 4, 8, ""), { a: 3, b: 4, c: 8, d: 10.6667 },
  "求解项可用空字符串标记（d 位）");
eq(M.solveRatio(3, 4, 8, undefined).d, 10.6667, "求解项可用 undefined 标记（d 位）");
eq(M.solveRatio(3, 4, 8, null, 2).d, 10.67, "精度 2 位：d=10.67");
eq(M.solveRatio(3, 4, 8, null, 6).d, 10.666667, "精度 6 位：d=10.666667");
eq(M.solveRatio(16, 9, 1080, null, 2).d, 607.5, "607.5 精度 2 位不变");
eq(M.solveRatio(0.1, 0.2, 0.3, null).d, 0.6, "小数场景：0.2*0.3/0.1=0.6");

/* ---------- 3. 非法参数抛 Error（含 err.field） ---------- */
throwsWithField(function () { M.solveRatio(null, null, null, 9); }, "a", "三空：err.field='a'");
throwsWithField(function () { M.solveRatio(3, null, 16, null); }, "b", "两空：err.field 首空字段");
throwsWithField(function () { M.solveRatio(1, 2, 3, 4); }, "solve", "零空：err.field='solve'");
throwsWithField(function () { M.solveRatio(3, "abc", null, 8); }, "b", "非数字：err.field='b'");
throwsWithField(function () { M.solveRatio(0, 4, 8, null); }, "a", "除零：d=b*c/a 中 a=0 → err.field='a'");
throwsWithField(function () { M.solveRatio(null, 4, 8, 0); }, "d", "除零：a=b*c/d 中 d=0 → err.field='d'");
throwsWithField(function () { M.solveRatio(2, null, 0, 9); }, "c", "除零：b=a*d/c 中 c=0 → err.field='c'");
throwsWithField(function () { M.solveRatio(2, 0, null, 9); }, "b", "除零：c=a*d/b 中 b=0 → err.field='b'");
throwsWithField(function () { M.simplifyRatio(0, 5); }, "a", "化简：simplifyRatio(0,5) 抛 Error");
throwsWithField(function () { M.simplifyRatio(5, 0); }, "b", "化简：simplifyRatio(5,0) 抛 Error");
throwsWithField(function () { M.simplifyRatio(-3, 4); }, "a", "化简：负数抛 Error");
throwsWithField(function () { M.simplifyRatio(2.5, 4); }, "a", "化简：非整数抛 Error");
throwsWithField(function () { M.simplifyRatio("x", 4); }, "a", "化简：非数字抛 Error");
throwsWithField(function () { M.parseRatio("abc"); }, "input", "解析：parseRatio('abc') err.field='input'");
throwsWithField(function () { M.parseRatio(""); }, "input", "解析：空串 err.field='input'");
throwsWithField(function () { M.parseRatio("16:9:2"); }, "input", "解析：三段 err.field='input'");

/* ---------- 4. simplifyRatio / parseRatio / gcd 正例 ---------- */
eq(M.simplifyRatio(100, 100), "1:1", "化简：100:100='1:1'");
eq(M.simplifyRatio(7, 11), "7:11", "化简：互质原样");
eq(M.simplifyRatio(360, 240), "3:2", "化简：360:240='3:2'");
deepEq(M.parseRatio("16 : 9"), { a: 16, b: 9 }, "解析：空格容忍");
deepEq(M.parseRatio("16：9"), { a: 16, b: 9 }, "解析：全角冒号容忍");
deepEq(M.parseRatio("1.4142:1"), { a: 1.4142, b: 1 }, "解析：小数");
eq(M.gcd(1920, 1080), 120, "gcd(1920,1080)=120（1920/120=16,1080/120=9）");
eq(M.gcd(0, 5), 5, "gcd(0,5)=5");

/* ---------- 5. toFraction 分数约分 ---------- */
eq(M.toFraction(607.5), "1215/2", "分数：607.5='1215/2'");
eq(M.toFraction(12), "12", "分数：整数原样");
eq(M.toFraction(10.6667), "106667/10000", "分数：10.6667（4 位）约分后互质");
eq(M.toFraction(0.5, 2), "1/2", "分数：0.5(2 位)='1/2'");
eq(M.toFraction(3413.3333), "34133333/10000", "分数：3413.3333（4 位）");

/* ---------- 6. PRESETS 常量表 ---------- */
eq(M.PRESETS.length, 6, "PRESETS 共 6 个预设");
var pA4 = null, pGolden = null, p169 = null;
M.PRESETS.forEach(function (p) {
  if (p.id === "A4") pA4 = p;
  if (p.id === "golden") pGolden = p;
  if (p.id === "16:9") p169 = p;
});
deepEq(p169 && { a: p169.a, b: p169.b }, { a: 16, b: 9 }, "预设 16:9 的 a:b");
deepEq(pA4 && { a: pA4.a, b: pA4.b }, { a: 1, b: 1.4142 }, "预设 A4 = 1:1.4142（近似）");
deepEq(pGolden && { a: pGolden.a, b: pGolden.b }, { a: 1, b: 1.618 }, "预设 黄金比例 = 1:1.618（近似）");
eq(M.PRECISION_DEFAULT, 4, "默认精度 4 位");

/* ---------- 7. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"ratio_solver"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/ratio-solver"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"ratio_solver"');
var block = GO_SRC.slice(idx, idx + 1200);
ok(block.indexOf('Category:    "学习工具"') >= 0, "注册 Category 为学习工具");
ok(block.indexOf("New:         true") >= 0, "注册 New 为 true");
ok(block.indexOf('Icon:        "balance"') >= 0, "注册 Icon 为 balance");
ok(/·\s*[A-Za-z]/.test(block), "注册 Description 中英文双语（· 分隔）");
var pathCount = 0;
var m;
var re = /"\/tools\/[^"]+"/g;
var seen = {};
while ((m = re.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 244, "注册 Path 总数 243→244");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本/样式引用");
ok(!/href="https?:\/\/(?!www\.johnkingzcq123\.xyz)/.test(TPL_SRC), "模板无外部超链接");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/ratio-solver") >= 0, "canonical 正确");
ok(TPL_SRC.indexOf("og:title") >= 0, "含 OG 标签");
ok(TPL_SRC.indexOf("application/ld+json") >= 0, "含 JSON-LD");

/* ---------- 8. 真限制三条页面明示 ---------- */
ok(TPL_SRC.indexOf("仅线性比例") >= 0, "模板含真限制①：仅线性比例");
ok(TPL_SRC.indexOf("预设为近似值") >= 0, "模板含真限制②：预设为近似值");
ok(TPL_SRC.indexOf("全本地计算") >= 0 || TPL_SRC.indexOf("零网络请求") >= 0, "模板含真限制③：全本地计算");
ok(TPL_SRC.indexOf("使用说明") >= 0, "模板含使用说明");
ok(TPL_SRC.indexOf("常见问题") >= 0, "模板含 FAQ");

/* ---------- 9. 互链合规：算术题生成器双向、单位换算器单向链入 ---------- */
ok(TPL_SRC.indexOf("/tools/math-worksheet-generator") >= 0, "互链：算术题生成器（数学簇双向）");
ok(TPL_SRC.indexOf("/tools/unit-converter") >= 0, "互链：单位换算器（单向链入，真限制口径边界）");
var MWG_SRC = fs.readFileSync(path.join(ROOT, "templates", "math_worksheet_generator.html"), "utf8");
ok(MWG_SRC.indexOf("/tools/ratio-solver") >= 0, "双向：算术题生成器页链回比例求解器");
var UC_SRC = fs.readFileSync(path.join(ROOT, "templates", "unit_converter.html"), "utf8");
ok(UC_SRC.indexOf("/tools/ratio-solver") < 0, "单向：单位换算器页不链回（单向链入）");
/* 模板内所有 /tools/xxx 外链必须已在 categories.go 注册（不链未交付工具）。 */
var hrefRe = /href="(\/tools\/[a-z0-9\-\/]+)"/g;
var hm, bad = [];
while ((hm = hrefRe.exec(TPL_SRC)) !== null) {
  if (hm[1] === "/tools/static") continue;
  if (GO_SRC.indexOf('"' + hm[1] + '"') < 0) bad.push(hm[1]);
}
eq(bad.length, 0, "模板外链全部已注册（实得未注册：" + JSON.stringify(bad) + "）");

console.log("ratio_solver: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

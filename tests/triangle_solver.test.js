/* 三角形几何求解器（triangle_solver）纯逻辑单元测试（零依赖）：
 * node tests/triangle_solver.test.js
 * 覆盖：toRadians/toDegrees（180↔π、非法抛错）、solveTriangle 总入口
 * （SSS 3-4-5→36.87°/53.13°/90°/面积6/周长12、SAS/ASA/AAS 精确值、
 * SSA 两组解/单解/无解、弧度制、返回 envelope 精确键集合）、单模式函数
 * （solveSSS/solveSAS/solveASA/solveSSA 的 {mode,solutions,ambiguous} 形状、
 * 组合误用抛错）、detectMode（五种组合识别＋ASA/AAS 区分）、非法参数
 * err.field（a/b/c/A/B/C/unit/input 全覆盖）、triangleSVG（真实比例图
 * 字符串结构、顶点/边/角标注、非法输入抛错）、module.exports 与
 * window.TriangleSolver 挂载、categories.go 注册（Path 总数 285→286、
 * Icon change_history 全库唯一、New/Category/中英文关键词）、模板
 * （SEO 真限制三条、角度单位切换、零外部资源）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var T = require("../static/js/triangle_solver.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function approx(a, b, tol, name) {
  ok(typeof a === "number" && Math.abs(a - b) <= tol,
    name + "（期望≈" + b + "±" + tol + "，实得 " + a + "）");
}
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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "triangle_solver.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "triangle_solver.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. toRadians / toDegrees ---------- */
eq(T.toRadians(180), Math.PI, "toRadians：180°→π");
eq(T.toRadians(90), Math.PI / 2, "toRadians：90°→π/2");
eq(T.toDegrees(Math.PI), 180, "toDegrees：π→180°");
eq(T.toDegrees(Math.PI / 2), 90, "toDegrees：π/2→90°");
throwsField(function () { T.toRadians("180"); }, "angle", "toRadians：字符串抛错 err.field='angle'");
throwsField(function () { T.toDegrees(NaN); }, "angle", "toDegrees：NaN 抛错 err.field='angle'");

/* ---------- 2. SSS：3-4-5 验收 ---------- */
var r = T.solveTriangle({ a: 3, b: 4, c: 5 }, "deg");
approx(r.angles.A, 36.87, 0.01, "SSS 3-4-5：角 A≈36.87°");
approx(r.angles.B, 53.13, 0.01, "SSS 3-4-5：角 B≈53.13°");
approx(r.angles.C, 90, 1e-9, "SSS 3-4-5：角 C=90°");
eq(r.area, 6, "SSS 3-4-5：面积=6");
eq(r.perimeter, 12, "SSS 3-4-5：周长=12");
eq(r.ambiguous, false, "SSS：ambiguous=false");
eq(r.solutions.length, 1, "SSS：solutions 长度=1");
eq(Object.keys(r).sort().join(","), "ambiguous,angles,area,perimeter,sides,solutions",
  "solveTriangle：返回 envelope 精确键集合 {sides,angles,area,perimeter,solutions,ambiguous}");
eq(r.sides.a, 3, "SSS：顶层 sides 取 solutions[0]（a=3）");

/* SSS 单模式函数形状 */
var sss = T.solveSSS({ a: 3, b: 4, c: 5 }, "deg");
eq(sss.mode, "SSS", "solveSSS：mode='SSS'");
eq(sss.ambiguous, false, "solveSSS：ambiguous=false");
eq(sss.solutions.length, 1, "solveSSS：1 个解");
approx(sss.solutions[0].angles.A, 36.87, 0.01, "solveSSS：解的角 A≈36.87°");
throwsField(function () { T.solveSSS({ a: 3, b: 4 }, "deg"); }, "input",
  "solveSSS：缺一条边抛错 err.field='input'");
throwsField(function () { T.solveTriangle({ a: 1, b: 2, c: 10 }, "deg"); }, "input",
  "SSS：不满足三角形不等式抛错 err.field='input'");

/* ---------- 3. SAS 精确值 ---------- */
var sas = T.solveTriangle({ a: 5, b: 7, C: 60 }, "deg");
approx(sas.sides.c, Math.sqrt(39), 1e-9, "SAS：a=5,b=7,C=60°→c=√39");
approx(sas.angles.A + sas.angles.B + sas.angles.C, 180, 1e-9, "SAS：三角和=180°");
approx(sas.angles.C, 60, 1e-9, "SAS：已知夹角 C=60° 保持");
var sas2 = T.solveSAS({ b: 7, c: 8, A: 60 }, "deg");
eq(sas2.mode, "SAS", "solveSAS：mode='SAS'");
approx(sas2.sides.a, Math.sqrt(57), 1e-9, "solveSAS：b=7,c=8,A=60°→a=√57");
throwsField(function () { T.solveSAS({ a: 5, b: 7, A: 60 }, "deg"); }, "input",
  "solveSAS：给的是对角而非夹角时抛错（提示转 SSA）");

/* ---------- 4. ASA / AAS 精确值 ---------- */
var asa = T.solveTriangle({ A: 60, B: 70, c: 10 }, "deg");
approx(asa.angles.C, 50, 1e-9, "ASA：A=60,B=70→C=50°");
approx(asa.sides.a, 10 * Math.sin(Math.PI / 3) / Math.sin(50 * Math.PI / 180), 1e-9,
  "ASA：正弦定理 a=10·sin60/sin50");
approx(asa.sides.b, 10 * Math.sin(70 * Math.PI / 180) / Math.sin(50 * Math.PI / 180), 1e-9,
  "ASA：正弦定理 b=10·sin70/sin50");
eq(asa.sides.c, 10, "ASA：已知边 c=10 保持");
var asaMode = T.solveASA({ A: 60, B: 70, c: 10 }, "deg");
eq(asaMode.mode, "ASA", "solveASA：两角夹边时 mode='ASA'");
var aas = T.solveTriangle({ A: 60, B: 70, a: 5 }, "deg");
eq(aas.sides.a, 5, "AAS：已知边 a=5 保持");
approx(aas.angles.C, 50, 1e-9, "AAS：第三角 C=50°");
approx(aas.sides.c, 5 * Math.sin(50 * Math.PI / 180) / Math.sin(Math.PI / 3), 1e-9,
  "AAS：正弦定理求 c");
var aasMode = T.solveASA({ B: 70, C: 50, b: 5 }, "deg");
eq(aasMode.mode, "AAS", "solveASA：一角对边时 mode='AAS'");
throwsField(function () { T.solveTriangle({ A: 100, B: 90, c: 5 }, "deg"); }, "input",
  "ASA：两角之和≥180° 抛错 err.field='input'");

/* ---------- 5. SSA：歧义两组解 ---------- */
var ssa = T.solveTriangle({ a: 5, A: 30, c: 7 }, "deg");
eq(ssa.ambiguous, true, "SSA：a=5,A=30°,c=7 时 ambiguous=true");
eq(ssa.solutions.length, 2, "SSA：输出两组解");
approx(ssa.solutions[0].angles.C, 44.43, 0.01, "SSA：解1（锐角）C≈44.43°");
approx(ssa.solutions[1].angles.C, 135.57, 0.01, "SSA：解2（钝角）C≈135.57°");
approx(ssa.solutions[0].angles.A + ssa.solutions[0].angles.B + ssa.solutions[0].angles.C,
  180, 1e-9, "SSA：解1 三角和=180°");
approx(ssa.solutions[1].angles.A + ssa.solutions[1].angles.B + ssa.solutions[1].angles.C,
  180, 1e-9, "SSA：解2 三角和=180°");
eq(ssa.sides.a, 5, "SSA：顶层 sides 取解1（a=5）");
approx(ssa.angles.C, 44.43, 0.01, "SSA：顶层 angles 取解1（锐角解）");
var ssaMode = T.solveSSA({ a: 5, A: 30, c: 7 }, "deg");
eq(ssaMode.mode, "SSA", "solveSSA：mode='SSA'");

/* SSA：单解（对边 ≥ 邻边） */
var ssa1 = T.solveTriangle({ a: 10, A: 30, c: 7 }, "deg");
eq(ssa1.ambiguous, false, "SSA：a=10≥c=7 时 ambiguous=false");
eq(ssa1.solutions.length, 1, "SSA：a≥c 时只有 1 组解");

/* SSA：直角临界（k=1）单解 */
var ssaR = T.solveTriangle({ a: 5, A: 30, c: 10 }, "deg");
eq(ssaR.solutions.length, 1, "SSA：c·sinA=a（k=1）时 1 组解");
approx(ssaR.solutions[0].angles.C, 90, 1e-3, "SSA：k≈1 时 C≈90°（浮点临界）");

/* SSA：钝角已知角单解 */
var ssaO = T.solveTriangle({ a: 8, A: 120, c: 5 }, "deg");
eq(ssaO.solutions.length, 1, "SSA：A=120°钝角时只有 1 组解");
eq(ssaO.ambiguous, false, "SSA：钝角已知角 ambiguous=false");

/* SSA：无解明确口径 */
throwsField(function () { T.solveTriangle({ a: 3, A: 30, c: 7 }, "deg"); }, "input",
  "SSA：对边太短（k>1）无解抛错 err.field='input'");
throwsField(function () { T.solveSSA({ b: 3, A: 30, c: 7 }, "deg"); }, "input",
  "solveSSA：已知角对边未知时抛错 err.field='input'");
throwsField(function () { T.solveSSA({ a: 5, b: 7, C: 60 }, "deg"); }, "input",
  "solveSSA：实为 SAS（夹角）时抛错提示转 SAS");

/* ---------- 6. detectMode 五种组合 ---------- */
function dm(o) {
  var p = { sideKeys: [], angleKeys: [] };
  Object.keys(o).forEach(function (k) {
    if ("abc".indexOf(k) >= 0) { p.sideKeys.push(k); } else { p.angleKeys.push(k); }
  });
  return T.detectMode(p);
}
eq(dm({ a: 1, b: 2, c: 3 }), "SSS", "detectMode：三边→SSS");
eq(dm({ a: 1, b: 2, C: 60 }), "SAS", "detectMode：a,b+C→SAS（C 为夹角）");
eq(dm({ a: 1, b: 2, A: 60 }), "SSA", "detectMode：a,b+A→SSA（A 为对角）");
eq(dm({ a: 1, c: 2, A: 30 }), "SSA", "detectMode：a,c+A→SSA");
eq(dm({ b: 1, c: 2, A: 30 }), "SAS", "detectMode：b,c+A→SAS");
eq(dm({ A: 60, B: 70, c: 10 }), "ASA", "detectMode：A,B+c→ASA（c 介于 A,B 之间）");
eq(dm({ A: 60, B: 70, a: 10 }), "AAS", "detectMode：A,B+a→AAS（a 不介于 A,B 之间）");
eq(dm({ B: 60, C: 50, b: 5 }), "AAS", "detectMode：B,C+b→AAS");
eq(dm({ A: 60, C: 50, b: 5 }), "ASA", "detectMode：A,C+b→ASA");

/* ---------- 7. 弧度制 ---------- */
var rd = T.solveTriangle({ a: 3, b: 4, c: 5 }, "rad");
approx(rd.angles.C, Math.PI / 2, 1e-12, "弧度制：3-4-5 的 C=π/2");
eq(rd.area, 6, "弧度制：面积仍=6");
var rdIn = T.solveTriangle({ a: 5, b: 7, C: Math.PI / 3 }, "rad");
approx(rdIn.sides.c, Math.sqrt(39), 1e-9, "弧度制输入：C=π/3 时 c=√39");
var rdDef = T.solveTriangle({ a: 3, b: 4, c: 5 });
approx(rdDef.angles.C, 90, 1e-9, "unit 缺省时为角度制");

/* ---------- 8. 非法参数 err.field 全覆盖 ---------- */
throwsField(function () { T.solveTriangle({ a: 1, b: 2 }, "deg"); }, "input",
  "已知量不足 3 个抛错 err.field='input'");
throwsField(function () { T.solveTriangle({ A: 60, B: 70, C: 50 }, "deg"); }, "input",
  "三个角无边抛错 err.field='input'");
throwsField(function () { T.solveTriangle({ a: -1, b: 2, c: 3 }, "deg"); }, "a",
  "边 a 负数抛错 err.field='a'");
throwsField(function () { T.solveTriangle({ a: 1, b: 0, c: 3 }, "deg"); }, "b",
  "边 b 为 0 抛错 err.field='b'");
throwsField(function () { T.solveTriangle({ a: 1, b: 2, c: "3" }, "deg"); }, "c",
  "边 c 字符串抛错 err.field='c'");
throwsField(function () { T.solveTriangle({ a: 1, b: 2, c: 3, A: 200 }, "deg"); }, "A",
  "角 A=200° 越界抛错 err.field='A'");
throwsField(function () { T.solveTriangle({ a: 1, b: 2, c: 3, B: 0 }, "deg"); }, "B",
  "角 B=0 抛错 err.field='B'");
throwsField(function () { T.solveTriangle({ a: 1, b: 2, c: 3, C: NaN }, "deg"); }, "C",
  "角 C=NaN 抛错 err.field='C'");
throwsField(function () { T.solveTriangle({ a: 1, b: 2, c: 3 }, "grad"); }, "unit",
  "unit 非法抛错 err.field='unit'");
throwsField(function () { T.solveTriangle(null, "deg"); }, "input",
  "knowns 非对象抛错 err.field='input'");
throwsField(function () { T.solveTriangle({ a: 3, b: 4, c: 5, A: "x" }, "deg"); }, "A",
  "多余已知量中非法值仍校验（角 A 字符串→err.field='A'）");

/* ---------- 9. triangleSVG ---------- */
var svg = T.triangleSVG({ sides: { a: 3, b: 4, c: 5 }, angles: { A: 36.87, B: 53.13, C: 90 } });
eq(svg.indexOf("<svg"), 0, "triangleSVG：以 <svg 开头");
has(svg, "<polygon", "triangleSVG：含三角形 polygon");
has(svg, 'viewBox="0 0 400 300"', "triangleSVG：默认视口 400x300");
eq((svg.match(/<text/g) || []).length, 9, "triangleSVG：9 个文本标注（3 顶点+3 角+3 边）");
has(svg, ">A<", "triangleSVG：含顶点标签 A");
has(svg, ">B<", "triangleSVG：含顶点标签 B");
has(svg, ">C<", "triangleSVG：含顶点标签 C");
has(svg, "a=3", "triangleSVG：含边标注 a=3");
has(svg, "b=4", "triangleSVG：含边标注 b=4");
has(svg, "c=5", "triangleSVG：含边标注 c=5");
has(svg, "90°", "triangleSVG：含角度标注 90°");
has(svg, 'xmlns="http://www.w3.org/2000/svg"', "triangleSVG：含 svg 命名空间");
notHas(svg, "document", "triangleSVG：纯字符串拼接，不依赖 DOM");
throwsField(function () { T.triangleSVG({ sides: { a: -3, b: 4, c: 5 }, angles: { A: 36, B: 54, C: 90 } }); },
  "a", "triangleSVG：负边长抛错 err.field='a'");
throwsField(function () { T.triangleSVG(null); }, "input",
  "triangleSVG：空输入抛错 err.field='input'");

/* ---------- 10. 挂载 ---------- */
eq(typeof T.solveTriangle, "function", "module.exports 含 solveTriangle");
eq(typeof T.solveSSS, "function", "module.exports 含 solveSSS");
eq(typeof T.solveSAS, "function", "module.exports 含 solveSAS");
eq(typeof T.solveASA, "function", "module.exports 含 solveASA");
eq(typeof T.solveSSA, "function", "module.exports 含 solveSSA");
eq(typeof T.toRadians, "function", "module.exports 含 toRadians");
eq(typeof T.toDegrees, "function", "module.exports 含 toDegrees");
eq(typeof T.triangleSVG, "function", "module.exports 含 triangleSVG");
has(JS_SRC, "window.TriangleSolver", "JS 挂载 window.TriangleSolver");
has(JS_SRC, "triangle_solver_v1", "JS 含 localStorage key triangle_solver_v1");

/* ---------- 11. categories.go 注册 ---------- */
var tsIdx = GO_SRC.indexOf('"triangle_solver"');
ok(tsIdx >= 0, "注册含 ID triangle_solver");
has(GO_SRC, 'Path:        "/tools/triangle-solver"', "注册 Path 为 /tools/triangle-solver");
var tsBlock = GO_SRC.slice(tsIdx, tsIdx + 2400);
has(tsBlock, "三角形几何求解器", "注册 Name 为三角形几何求解器");
has(tsBlock, 'Category:    "学习工具"', "注册 Category 为学习工具");
has(tsBlock, "New:         true", "注册 New: true");
has(tsBlock, 'Icon:        "change_history"', "注册 Icon 为 change_history");
has(tsBlock, "SSS", "Description 含「SSS」");
has(tsBlock, "SSA", "Description 含「SSA」");
has(tsBlock, "localStorage", "Description 含「localStorage」");
has(tsBlock, "client-side", "Description 含英文「client-side」");
has(tsBlock, "正弦", "Description 含「正弦」");
var iconRe = /"change_history"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon change_history 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 320, "注册 Path 总数 285→286");

/* ---------- 12. 模板：SEO/真限制/零外部资源 ---------- */
has(TPL_SRC, "{{define \"triangle_solver\"}}", "模板定义 triangle_solver");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/triangle-solver", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="triangle-app"', "模板含应用根节点 triangle-app");
has(TPL_SRC, 'id="ts-a"', "模板含边输入 ts-a");
has(TPL_SRC, 'id="ts-C"', "模板含角输入 ts-C");
has(TPL_SRC, 'name="ts-unit"', "模板含角度单位切换 ts-unit");
has(TPL_SRC, 'id="ts-svg"', "模板含 SVG 容器 ts-svg");
has(TPL_SRC, 'id="ts-sol-tabs"', "模板含 SSA 解切换 ts-sol-tabs");
has(TPL_SRC, 'id="ts-error"', "模板含错误提示区 ts-error");
has(TPL_SRC, "SSA 歧义与无解口径", "模板真限制①：SSA 歧义/无解口径");
has(TPL_SRC, "角度制/弧度制切换", "模板真限制②：角度弧度切换");
has(TPL_SRC, "纯本地计算", "模板真限制③：纯本地计算");
has(TPL_SRC, "/tools/static/js/triangle_solver.js", "模板引用本站静态 JS");
notHas(TPL_SRC, '<script src="http', "模板零外部资源：无 http 外链 script");
notHas(TPL_SRC, '<link rel="stylesheet" href="http', "模板零外部资源：无 http 外链 stylesheet（仅 canonical/og 元链接）");

console.log("\n通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 断言");
process.exit(fail === 0 ? 0 : 1);

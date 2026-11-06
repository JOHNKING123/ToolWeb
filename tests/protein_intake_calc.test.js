/* 蛋白质摄入量计算器（protein_intake_calc）纯逻辑单元测试（零依赖）：
 * node tests/protein_intake_calc.test.js
 * 覆盖：proteinRange 三档精确值（75kg 增肌→120–165g/480–660kcal、
 * 70kg 减脂护肌→140–168g/560–672kcal、70kg 维持→84–112g/336–448kcal、
 * 区间整数修约、kcal=克数×4）、perMealRange（3/4/5 餐均分、保留 1 位小数、
 * 餐数 2/6/小数/字符串抛错 err.field='meals'）、非法参数 err.field 全覆盖
 * （weightKg/goal/totalMin）、foodList（≥10 条、含鸡蛋/鸡胸肉、结构、返回副本）、
 * module.exports 与 window.ProteinIntakeCalc 挂载、categories.go 注册
 * （Path 总数 289→290、Icon egg 全库唯一、New/生活工具/中英文关键词）、
 * 模板（SEO 四关键词、两条真限制、零外部资源）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var T = require("../static/js/protein_intake_calc.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "protein_intake_calc.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "protein_intake_calc.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. proteinRange 三档验收精确值 ---------- */
var r1 = T.proteinRange(75, "bulk");
eq(r1.minG, 120, "75kg 增肌→minG=120");
eq(r1.maxG, 165, "75kg 增肌→maxG=165");
eq(r1.minKcal, 480, "75kg 增肌→minKcal=480");
eq(r1.maxKcal, 660, "75kg 增肌→maxKcal=660");
var r2 = T.proteinRange(70, "cut");
eq(r2.minG, 140, "70kg 减脂护肌→minG=140");
eq(r2.maxG, 168, "70kg 减脂护肌→maxG=168");
eq(r2.minKcal, 560, "70kg 减脂护肌→minKcal=560");
eq(r2.maxKcal, 672, "70kg 减脂护肌→maxKcal=672");
var r3 = T.proteinRange(70, "maintain");
eq(r3.minG, 84, "70kg 维持→minG=84");
eq(r3.maxG, 112, "70kg 维持→maxG=112");
eq(r3.minKcal, 336, "70kg 维持→minKcal=336");
eq(r3.maxKcal, 448, "70kg 维持→maxKcal=448");
eq(r1.minKcal, r1.minG * 4, "热量=克数×4（min 端）");
eq(r1.maxKcal, r1.maxG * 4, "热量=克数×4（max 端）");
eq(r2.minKcal, r2.minG * 4, "减脂档热量=克数×4（min 端）");
eq(r2.maxKcal, r2.maxG * 4, "减脂档热量=克数×4（max 端）");

/* ---------- 2. 整数修约与返回结构 ---------- */
var r4 = T.proteinRange(63.7, "maintain");
eq(r4.minG, 76, "63.7kg 维持→76.44 修约为 76");
eq(r4.maxG, 102, "63.7kg 维持→101.92 修约为 102");
var keys = Object.keys(T.proteinRange(80, "bulk")).sort();
eq(JSON.stringify(keys), JSON.stringify(["maxG", "maxKcal", "minG", "minKcal"]), "proteinRange 返回四键结构");
eq(T.proteinRange(60, "cut").minG, 120, "60kg 减脂→120g（2.0×60）");
eq(T.proteinRange(60, "cut").maxG, 144, "60kg 减脂→144g（2.4×60）");

/* ---------- 3. perMealRange 分餐 ---------- */
var m1 = T.perMealRange(120, 165, 3);
eq(m1.minG, 40, "120–165g 分 3 餐→min 40");
eq(m1.maxG, 55, "120–165g 分 3 餐→max 55");
var m2 = T.perMealRange(120, 165, 4);
eq(m2.minG, 30, "120–165g 分 4 餐→min 30");
eq(m2.maxG, 41.3, "120–165g 分 4 餐→max 41.3（1 位小数）");
var m3 = T.perMealRange(140, 168, 5);
eq(m3.minG, 28, "140–168g 分 5 餐→min 28");
eq(m3.maxG, 33.6, "140–168g 分 5 餐→max 33.6");
var m4 = T.perMealRange(100, 101, 3);
eq(m4.minG, 33.3, "100–101g 分 3 餐→33.3（四舍五入 1 位）");
eq(m4.maxG, 33.7, "100–101g 分 3 餐→33.7（四舍五入 1 位）");
var mk = Object.keys(T.perMealRange(120, 165, 4)).sort();
eq(JSON.stringify(mk), JSON.stringify(["maxG", "minG"]), "perMealRange 返回两键结构");

/* ---------- 4. 非法参数 err.field 全覆盖 ---------- */
throwsField(function () { T.proteinRange(0, "bulk"); }, "weightKg", "体重 0 抛错 field=weightKg");
throwsField(function () { T.proteinRange(-5, "maintain"); }, "weightKg", "体重负数抛错 field=weightKg");
throwsField(function () { T.proteinRange(NaN, "bulk"); }, "weightKg", "体重 NaN 抛错 field=weightKg");
throwsField(function () { T.proteinRange(Infinity, "bulk"); }, "weightKg", "体重 Infinity 抛错 field=weightKg");
throwsField(function () { T.proteinRange("75", "bulk"); }, "weightKg", "体重字符串抛错 field=weightKg");
throwsField(function () { T.proteinRange(75, "xyz"); }, "goal", "goal 非法抛错 field=goal");
throwsField(function () { T.proteinRange(75, null); }, "goal", "goal null 抛错 field=goal");
throwsField(function () { T.proteinRange(75, ""); }, "goal", "goal 空串抛错 field=goal");
throwsField(function () { T.perMealRange(120, 165, 2); }, "meals", "餐数 2 抛错 field=meals");
throwsField(function () { T.perMealRange(120, 165, 6); }, "meals", "餐数 6 抛错 field=meals");
throwsField(function () { T.perMealRange(120, 165, 3.5); }, "meals", "餐数小数抛错 field=meals");
throwsField(function () { T.perMealRange(120, 165, "4"); }, "meals", "餐数字符串抛错 field=meals");
throwsField(function () { T.perMealRange(-1, 165, 4); }, "totalMin", "totalMin 负数抛错 field=totalMin");
throwsField(function () { T.perMealRange(200, 165, 4); }, "totalMin", "totalMin>totalMax 抛错 field=totalMin");

/* ---------- 5. foodList ---------- */
var foods = T.foodList();
ok(foods.length >= 10, "foodList 条数 ≥10（实得 " + foods.length + "）");
var names = foods.map(function (f) { return f.name; });
ok(names.some(function (n) { return n.indexOf("鸡蛋") !== -1; }), "foodList 含鸡蛋");
ok(names.some(function (n) { return n.indexOf("鸡胸肉") !== -1; }), "foodList 含鸡胸肉");
ok(foods.every(function (f) {
  return typeof f.name === "string" && typeof f.unit === "string" &&
    typeof f.gramsPerUnit === "number" && f.gramsPerUnit > 0;
}), "foodList 每条含 name/unit/gramsPerUnit 且克数为正数");
var before = T.foodList().length;
foods.push({name: "x", unit: "y", gramsPerUnit: 1});
eq(T.foodList().length, before, "foodList 返回副本：外部修改不污染静态数组");

/* ---------- 6. 常量与导出 ---------- */
eq(T.KCAL_PER_G, 4, "KCAL_PER_G=4");
eq(T.GOALS.maintain.minF, 1.2, "维持系数下限 1.2");
eq(T.GOALS.maintain.maxF, 1.6, "维持系数上限 1.6");
eq(T.GOALS.bulk.minF, 1.6, "增肌系数下限 1.6");
eq(T.GOALS.bulk.maxF, 2.2, "增肌系数上限 2.2");
eq(T.GOALS.cut.minF, 2.0, "减脂护肌系数下限 2.0");
eq(T.GOALS.cut.maxF, 2.4, "减脂护肌系数上限 2.4");
eq(T.MEALS_MIN, 3, "MEALS_MIN=3");
eq(T.MEALS_MAX, 5, "MEALS_MAX=5");
eq(T.SAMPLES.length, 3, "示例 3 组");
eq(typeof T.proteinRange, "function", "导出 proteinRange");
eq(typeof T.perMealRange, "function", "导出 perMealRange");
eq(typeof T.foodList, "function", "导出 foodList");
has(JS_SRC, "window.ProteinIntakeCalc", "JS 挂载 window.ProteinIntakeCalc");
has(JS_SRC, "module.exports", "JS 含 module.exports");
has(JS_SRC, "protein_intake_calc_v1", "JS 含 localStorage key protein_intake_calc_v1");

/* ---------- 7. categories.go 注册 ---------- */
var picIdx = GO_SRC.indexOf('"protein_intake_calc"');
ok(picIdx >= 0, "注册含 ID protein_intake_calc");
has(GO_SRC, 'Path:        "/tools/protein-intake-calc"', "注册 Path 为 /tools/protein-intake-calc");
var picBlock = GO_SRC.slice(picIdx, picIdx + 2600);
has(picBlock, "蛋白质摄入量计算器", "注册 Name 为蛋白质摄入量计算器");
has(picBlock, 'Category:    "生活工具"', "注册 Category 为生活工具");
has(picBlock, "New:         true", "注册 New: true");
has(picBlock, 'Icon:        "egg"', "注册 Icon 为 egg");
has(picBlock, "localStorage", "Description 含「localStorage」");
has(picBlock, "client-side", "Description 含英文「client-side」");
has(picBlock, "2.0–2.4", "Description 含减脂系数 2.0–2.4");
var iconRe = /"egg"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon egg 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 312, "注册 Path 总数 289→290");

/* ---------- 8. 模板：SEO/真限制两条/零外部资源 ---------- */
has(TPL_SRC, '{{define "protein_intake_calc"}}', "模板定义 protein_intake_calc");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/protein-intake-calc", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="pic-app"', "模板含应用根节点 pic-app");
has(TPL_SRC, 'id="pic-weight"', "模板含体重输入 pic-weight");
has(TPL_SRC, 'name="pic-goal"', "模板含目标三档 pic-goal");
has(TPL_SRC, 'name="pic-meals"', "模板含餐数选择 pic-meals");
has(TPL_SRC, 'id="pic-result"', "模板含结果区 pic-result");
has(TPL_SRC, 'id="pic-result-line"', "模板含结果行 pic-result-line");
has(TPL_SRC, 'id="pic-error"', "模板含错误提示区 pic-error");
has(TPL_SRC, 'id="pic-foods-body"', "模板含食物表区 pic-foods-body");
has(TPL_SRC, 'id="pic-samples"', "模板含示例区 pic-samples");
has(TPL_SRC, 'id="pic-copy"', "模板含复制按钮 pic-copy");
has(TPL_SRC, 'id="pic-clear"', "模板含清空按钮 pic-clear");
has(TPL_SRC, 'id="pic-toast"', "模板含 toast 提示 pic-toast");
has(TPL_SRC, "蛋白质摄入量计算器", "模板 SEO：含「蛋白质摄入量计算器」");
has(TPL_SRC, "每日蛋白质", "模板 SEO：含「每日蛋白质」");
has(TPL_SRC, "增肌蛋白质", "模板 SEO：含「增肌蛋白质」");
has(TPL_SRC, "减脂蛋白质", "模板 SEO：含「减脂蛋白质」");
has(TPL_SRC, "肾病", "模板真限制①：肾病/慢性病患者须遵医嘱");
has(TPL_SRC, "遵医嘱", "模板真限制①：明示遵医嘱");
has(TPL_SRC, "通用建议", "模板真限制②：区间为通用建议");
has(TPL_SRC, "BMR/TDEE", "模板含 BMR/TDEE 工具文字引导");
has(TPL_SRC, "/tools/static/js/protein_intake_calc.js", "模板引用本站静态 JS");
notHas(TPL_SRC, '<script src="http', "模板零外部资源：无 http 外链 script");
notHas(TPL_SRC, '<link rel="stylesheet" href="http', "模板零外部资源：无 http 外链 stylesheet（仅 canonical/og 元链接）");

console.log("\n通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 断言");
process.exit(fail === 0 ? 0 : 1);

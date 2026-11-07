/* BMR/TDEE 能量消耗计算器（bmr_tdee_calc）纯逻辑单元测试（零依赖）：
 * node tests/bmr_tdee_calc.test.js
 * 覆盖：calcBMR（男30岁/175cm/70kg→1649、女30岁/165cm/55kg→1270、整数修约、
 * 性别/年龄/身高/体重非法 err.field 全覆盖）、activityFactors（五档值
 * 1.2/1.375/1.55/1.725/1.9、标签/key、新数组防篡改）、calcTDEE（1649×1.55→2556、
 * 非法 err.field='bmr'/'factor'）、planTargets（减脂=max(tdee−500,1200) 保底、
 * 维持=tdee、增肌=tdee＋300、非法 err.field='tdee'）、module.exports 与
 * window.BmrTdeeCalc 挂载、categories.go 注册（Path 总数 284→285、Icon
 * local_fire_department 全库唯一、New/Category/中英文关键词）、模板（真限制四条、
 * 健康小闭环三向互链、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/bmr_tdee_calc.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "bmr_tdee_calc.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "bmr_tdee_calc.html"), "utf8");
var BMI_TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "bmi_calc.html"), "utf8");
var HRZ_TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "heart_rate_zones.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. calcBMR：Mifflin-St Jeor ---------- */
eq(A.calcBMR("male", 30, 175, 70), 1649, "calcBMR：验收 男30岁/175cm/70kg→1649");
eq(A.calcBMR("female", 30, 165, 55), 1270, "calcBMR：验收 女30岁/165cm/55kg→1270");
eq(A.calcBMR("male", 25, 180, 75), 1755, "calcBMR：男25岁/180cm/75kg→1755");
eq(A.calcBMR("female", 25, 160, 50), 1214, "calcBMR：女25岁/160cm/50kg→1214");
eq(A.calcBMR("female", 40, 158, 60), 1227, "calcBMR：女40岁/158cm/60kg→1227（小数修约）");
eq(A.calcBMR("male", 20, 182, 68), 1723, "calcBMR：男20岁/182cm/68kg→1723");
ok(typeof A.calcBMR("male", 30, 175, 70) === "number", "calcBMR：返回 number");
throwsField(function () { A.calcBMR("男", 30, 175, 70); }, "sex", "calcBMR：性别中文抛错 err.field='sex'");
throwsField(function () { A.calcBMR("", 30, 175, 70); }, "sex", "calcBMR：性别空串抛错 err.field='sex'");
throwsField(function () { A.calcBMR(null, 30, 175, 70); }, "sex", "calcBMR：性别 null 抛错 err.field='sex'");
throwsField(function () { A.calcBMR(undefined, 30, 175, 70); }, "sex", "calcBMR：性别缺失抛错 err.field='sex'");
throwsField(function () { A.calcBMR("m", 30, 175, 70); }, "sex", "calcBMR：性别'm'抛错 err.field='sex'");
throwsField(function () { A.calcBMR("male", "30", 175, 70); }, "age", "calcBMR：年龄字符串抛错 err.field='age'");
throwsField(function () { A.calcBMR("male", NaN, 175, 70); }, "age", "calcBMR：年龄 NaN 抛错 err.field='age'");
throwsField(function () { A.calcBMR("male", Infinity, 175, 70); }, "age", "calcBMR：年龄 Infinity 抛错 err.field='age'");
throwsField(function () { A.calcBMR("male", 0, 175, 70); }, "age", "calcBMR：年龄 0 抛错 err.field='age'");
throwsField(function () { A.calcBMR("male", -5, 175, 70); }, "age", "calcBMR：年龄负数抛错 err.field='age'");
throwsField(function () { A.calcBMR("male", undefined, 175, 70); }, "age", "calcBMR：年龄缺失抛错 err.field='age'");
throwsField(function () { A.calcBMR("male", 30, "175", 70); }, "heightCm", "calcBMR：身高字符串抛错 err.field='heightCm'");
throwsField(function () { A.calcBMR("male", 30, NaN, 70); }, "heightCm", "calcBMR：身高 NaN 抛错 err.field='heightCm'");
throwsField(function () { A.calcBMR("male", 30, Infinity, 70); }, "heightCm", "calcBMR：身高 Infinity 抛错 err.field='heightCm'");
throwsField(function () { A.calcBMR("male", 30, 0, 70); }, "heightCm", "calcBMR：身高 0 抛错 err.field='heightCm'");
throwsField(function () { A.calcBMR("male", 30, -175, 70); }, "heightCm", "calcBMR：身高负数抛错 err.field='heightCm'");
throwsField(function () { A.calcBMR("male", 30, undefined, 70); }, "heightCm", "calcBMR：身高缺失抛错 err.field='heightCm'");
throwsField(function () { A.calcBMR("male", 30, 175, "70"); }, "weightKg", "calcBMR：体重字符串抛错 err.field='weightKg'");
throwsField(function () { A.calcBMR("male", 30, 175, NaN); }, "weightKg", "calcBMR：体重 NaN 抛错 err.field='weightKg'");
throwsField(function () { A.calcBMR("male", 30, 175, Infinity); }, "weightKg", "calcBMR：体重 Infinity 抛错 err.field='weightKg'");
throwsField(function () { A.calcBMR("male", 30, 175, 0); }, "weightKg", "calcBMR：体重 0 抛错 err.field='weightKg'");
throwsField(function () { A.calcBMR("male", 30, 175, -70); }, "weightKg", "calcBMR：体重负数抛错 err.field='weightKg'");
throwsField(function () { A.calcBMR("male", 30, 175); }, "weightKg", "calcBMR：体重缺失抛错 err.field='weightKg'");

/* ---------- 2. activityFactors：五档活动系数 ---------- */
var fs5 = A.activityFactors();
eq(fs5.length, 5, "activityFactors：返回 5 档");
eq(fs5[0].factor, 1.2, "activityFactors：久坐=1.2");
eq(fs5[1].factor, 1.375, "activityFactors：轻度活动=1.375");
eq(fs5[2].factor, 1.55, "activityFactors：中度活动=1.55");
eq(fs5[3].factor, 1.725, "activityFactors：重度活动=1.725");
eq(fs5[4].factor, 1.9, "activityFactors：极重活动=1.9");
eq(fs5[0].label, "久坐", "activityFactors：第一档 label=久坐");
eq(fs5[1].label, "轻度活动", "activityFactors：第二档 label=轻度活动");
eq(fs5[2].label, "中度活动", "activityFactors：第三档 label=中度活动");
eq(fs5[3].label, "重度活动", "activityFactors：第四档 label=重度活动");
eq(fs5[4].label, "极重活动", "activityFactors：第五档 label=极重活动");
eq(fs5[0].key, "sedentary", "activityFactors：第一档 key=sedentary");
eq(fs5[1].key, "light", "activityFactors：第二档 key=light");
eq(fs5[2].key, "moderate", "activityFactors：第三档 key=moderate");
eq(fs5[3].key, "heavy", "activityFactors：第四档 key=heavy");
eq(fs5[4].key, "extreme", "activityFactors：第五档 key=extreme");
ok(fs5.every(function (f) { return typeof f.desc === "string" && f.desc.length > 0; }),
  "activityFactors：每档有档位说明 desc");
fs5[0].factor = 99;
eq(A.activityFactors()[0].factor, 1.2, "activityFactors：每次返回新数组，外部篡改不污染");

/* ---------- 3. calcTDEE：BMR × 活动系数 ---------- */
eq(A.calcTDEE(1649, 1.55), 2556, "calcTDEE：验收 1649×1.55→2556");
eq(A.calcTDEE(1000, 1.2), 1200, "calcTDEE：1000×1.2→1200");
eq(A.calcTDEE(2000, 1.9), 3800, "calcTDEE：2000×1.9→3800");
eq(A.calcTDEE(1649, 1.375), 2267, "calcTDEE：1649×1.375→2267（修约）");
ok(typeof A.calcTDEE(1649, 1.55) === "number", "calcTDEE：返回 number");
throwsField(function () { A.calcTDEE("1649", 1.55); }, "bmr", "calcTDEE：bmr 字符串抛错 err.field='bmr'");
throwsField(function () { A.calcTDEE(NaN, 1.55); }, "bmr", "calcTDEE：bmr NaN 抛错 err.field='bmr'");
throwsField(function () { A.calcTDEE(0, 1.55); }, "bmr", "calcTDEE：bmr=0 抛错 err.field='bmr'");
throwsField(function () { A.calcTDEE(-100, 1.55); }, "bmr", "calcTDEE：bmr 负数抛错 err.field='bmr'");
throwsField(function () { A.calcTDEE(undefined, 1.55); }, "bmr", "calcTDEE：bmr 缺失抛错 err.field='bmr'");
throwsField(function () { A.calcTDEE(1649, "1.55"); }, "factor", "calcTDEE：factor 字符串抛错 err.field='factor'");
throwsField(function () { A.calcTDEE(1649, NaN); }, "factor", "calcTDEE：factor NaN 抛错 err.field='factor'");
throwsField(function () { A.calcTDEE(1649, 0); }, "factor", "calcTDEE：factor=0 抛错 err.field='factor'");
throwsField(function () { A.calcTDEE(1649, -1.2); }, "factor", "calcTDEE：factor 负数抛错 err.field='factor'");
throwsField(function () { A.calcTDEE(1649); }, "factor", "calcTDEE：factor 缺失抛错 err.field='factor'");

/* ---------- 4. planTargets：减脂/维持/增肌 ---------- */
var p1 = A.planTargets(2556);
eq(p1.cut, 2056, "planTargets：2556→cut=2056");
eq(p1.maintain, 2556, "planTargets：2556→maintain=2556");
eq(p1.bulk, 2856, "planTargets：2556→bulk=2856");
var p2 = A.planTargets(1500);
eq(p2.cut, 1200, "planTargets：验收 1500→cut 保底 1200");
eq(p2.maintain, 1500, "planTargets：1500→maintain=1500");
eq(p2.bulk, 1800, "planTargets：1500→bulk=1800");
eq(A.planTargets(1700).cut, 1200, "planTargets：1700→cut=1200（恰达保底线）");
eq(A.planTargets(1701).cut, 1201, "planTargets：1701→cut=1201（保底线上方）");
eq(A.planTargets(3000).cut, 2500, "planTargets：3000→cut=2500");
eq(A.planTargets(3000).bulk, 3300, "planTargets：3000→bulk=3300");
throwsField(function () { A.planTargets("2556"); }, "tdee", "planTargets：tdee 字符串抛错 err.field='tdee'");
throwsField(function () { A.planTargets(NaN); }, "tdee", "planTargets：tdee NaN 抛错 err.field='tdee'");
throwsField(function () { A.planTargets(0); }, "tdee", "planTargets：tdee=0 抛错 err.field='tdee'");
throwsField(function () { A.planTargets(-100); }, "tdee", "planTargets：tdee 负数抛错 err.field='tdee'");
throwsField(function () { A.planTargets(undefined); }, "tdee", "planTargets：tdee 缺失抛错 err.field='tdee'");

/* ---------- 5. 常量与挂载 ---------- */
eq(typeof A.calcBMR, "function", "module.exports 含 calcBMR");
eq(typeof A.activityFactors, "function", "module.exports 含 activityFactors");
eq(typeof A.calcTDEE, "function", "module.exports 含 calcTDEE");
eq(typeof A.planTargets, "function", "module.exports 含 planTargets");
has(JS_SRC, "window.BmrTdeeCalc", "JS 挂载 window.BmrTdeeCalc");
has(JS_SRC, "bmr_tdee_calc_v1", "JS 含 localStorage key bmr_tdee_calc_v1");

/* ---------- 6. categories.go 注册 ---------- */
var bmrIdx = GO_SRC.indexOf('"bmr_tdee_calc"');
ok(bmrIdx >= 0, "注册含 ID bmr_tdee_calc");
has(GO_SRC, 'Path:        "/tools/bmr-tdee-calc"', "注册 Path 为 /tools/bmr-tdee-calc");
var bmrBlock = GO_SRC.slice(bmrIdx, bmrIdx + 2400);
has(bmrBlock, "BMR/TDEE 能量消耗计算器", "注册 Name 为 BMR/TDEE 能量消耗计算器");
has(bmrBlock, 'Category:    "生活工具"', "注册 Category 为生活工具");
has(bmrBlock, "New:         true", "注册 New: true");
has(bmrBlock, 'Icon:        "local_fire_department"', "注册 Icon 为 local_fire_department");
has(bmrBlock, "Mifflin-St Jeor", "Description 含「Mifflin-St Jeor」");
has(bmrBlock, "TDEE", "Description 含「TDEE」");
has(bmrBlock, "localStorage", "Description 含「localStorage」");
has(bmrBlock, "BMR", "Description 含「BMR」");
has(bmrBlock, "client-side", "Description 含英文「client-side」");
var iconRe = /"local_fire_department"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon local_fire_department 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 328, "注册 Path 总数 284→285");

/* ---------- 7. 模板：SEO/真限制/三向互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/bmr-tdee-calc", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="bmr-app"', "模板含应用根节点 bmr-app");
has(TPL_SRC, 'id="bmr-sex-m"', "模板含性别男单选 bmr-sex-m");
has(TPL_SRC, 'id="bmr-sex-f"', "模板含性别女单选 bmr-sex-f");
has(TPL_SRC, 'id="bmr-age"', "模板含年龄输入 bmr-age");
has(TPL_SRC, 'id="bmr-height"', "模板含身高输入 bmr-height");
has(TPL_SRC, 'id="bmr-weight"', "模板含体重输入 bmr-weight");
has(TPL_SRC, 'id="bmr-activity"', "模板含活动系数下拉 bmr-activity");
has(TPL_SRC, 'id="bmr-result"', "模板含结果区 bmr-result");
has(TPL_SRC, 'id="bmr-value"', "模板含 BMR 数值展示 bmr-value");
has(TPL_SRC, 'id="bmr-tdee"', "模板含 TDEE 数值展示 bmr-tdee");
has(TPL_SRC, 'id="bmr-plans"', "模板含三档建议区 bmr-plans");
has(TPL_SRC, 'id="bmr-sample"', "模板含示例按钮 bmr-sample");
has(TPL_SRC, 'id="bmr-copy"', "模板含复制按钮 bmr-copy");
has(TPL_SRC, 'id="bmr-clear"', "模板含清空按钮 bmr-clear");
has(TPL_SRC, 'id="bmr-err"', "模板含错误区 bmr-err");
has(TPL_SRC, 'id="bmr-toast"', "模板含提示区 bmr-toast");
has(TPL_SRC, 'src="/tools/static/js/bmr_tdee_calc.js?v=1"', "模板引用新 JS（v=1）");
has(TPL_SRC, "BMR", "模板含 BMR 关键词");
has(TPL_SRC, "TDEE", "模板含 TDEE 关键词");
has(TPL_SRC, "基础代谢率", "模板含基础代谢率关键词");
has(TPL_SRC, "Mifflin-St Jeor", "模板含公式名");
has(TPL_SRC, "减脂", "模板含减脂档");
has(TPL_SRC, "增肌", "模板含增肌档");
has(TPL_SRC, "1200", "真限制③关联：减脂 1200 保底明示");
has(TPL_SRC, "群体估计", "真限制①：群体估计非医疗建议明示");
has(TPL_SRC, "自报主观", "真限制②：活动系数自报主观明示");
has(TPL_SRC, "孕妇", "真限制③：孕妇不适用明示");
has(TPL_SRC, "哺乳", "真限制③：哺乳期不适用明示");
has(TPL_SRC, "运动员", "真限制③：运动员不适用明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制④：纯本地零上传");
has(TPL_SRC, "仅供参考", "真限制：仅供参考");
has(TPL_SRC, "健康小闭环", "模板含健康小闭环标签");
has(TPL_SRC, 'href="/tools/bmi-calc"', "模板互链：含 /tools/bmi-calc 链接");
has(TPL_SRC, 'href="/tools/heart-rate-zones"', "模板互链：含 /tools/heart-rate-zones 链接");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

/* ---------- 8. 三向互链：bmi_calc / heart_rate_zones 反向链接 ---------- */
has(BMI_TPL_SRC, 'href="/tools/bmr-tdee-calc"', "三向互链：bmi_calc.html 含 /tools/bmr-tdee-calc 链接");
has(BMI_TPL_SRC, "健康小闭环", "三向互链：bmi_calc.html 含健康小闭环标签");
has(HRZ_TPL_SRC, 'href="/tools/bmr-tdee-calc"', "三向互链：heart_rate_zones.html 含 /tools/bmr-tdee-calc 链接");
has(HRZ_TPL_SRC, "健康小闭环", "三向互链：heart_rate_zones.html 含健康小闭环标签");

console.log("bmr_tdee_calc: pass=" + pass + " fail=" + fail);
if (fail > 0) { process.exit(1); }

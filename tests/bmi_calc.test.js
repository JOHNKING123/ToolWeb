/* BMI 体质指数计算器（bmi_calc）纯逻辑单元测试（零依赖）：
 * node tests/bmi_calc.test.js
 * 覆盖：calcBMI（70kg/175cm→22.9、1 位小数修约、身高/体重非法 err.field='heightCm'/
 * 'weightKg'）、classifyBMI（{label,level}、边界 18.5/24.9/25/29.9/30 四阈值临界、
 * 非法 err.field='bmi'）、zoneBreakpoints（[18.5,25,30]、新数组防篡改）、
 * zoneAdvices（四分级健康提示、深拷贝防篡改）、module.exports 与 window.BmiCalc
 * 挂载、categories.go 注册（Path 总数 283→284、Icon monitor_weight 全库唯一、
 * New/Category/中英文关键词）、模板（真限制三条、双向互链、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/bmi_calc.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "bmi_calc.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "bmi_calc.html"), "utf8");
var HRZ_TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "heart_rate_zones.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. calcBMI：身高体重→BMI（保留 1 位小数） ---------- */
eq(A.calcBMI(175, 70), 22.9, "calcBMI：验收 70kg/175cm→22.9");
eq(A.calcBMI(170, 65), 22.5, "calcBMI：65kg/170cm→22.5");
eq(A.calcBMI(180, 80), 24.7, "calcBMI：80kg/180cm→24.7");
eq(A.calcBMI(160, 50), 19.5, "calcBMI：50kg/160cm→19.5");
eq(A.calcBMI(150, 40), 17.8, "calcBMI：40kg/150cm→17.8");
eq(A.calcBMI(170, 60), 20.8, "calcBMI：60kg/170cm→20.8（1 位小数修约）");
eq(A.calcBMI(175.5, 70.5), 22.9, "calcBMI：小数身高体重 70.5/175.5→22.9");
ok(typeof A.calcBMI(175, 70) === "number", "calcBMI：返回 number");
throwsField(function () { A.calcBMI("175", 70); }, "heightCm", "calcBMI：身高字符串抛错 err.field='heightCm'");
throwsField(function () { A.calcBMI(NaN, 70); }, "heightCm", "calcBMI：身高 NaN 抛错 err.field='heightCm'");
throwsField(function () { A.calcBMI(Infinity, 70); }, "heightCm", "calcBMI：身高 Infinity 抛错 err.field='heightCm'");
throwsField(function () { A.calcBMI(0, 70); }, "heightCm", "calcBMI：身高 0 抛错 err.field='heightCm'");
throwsField(function () { A.calcBMI(-170, 70); }, "heightCm", "calcBMI：身高负数抛错 err.field='heightCm'");
throwsField(function () { A.calcBMI(undefined, 70); }, "heightCm", "calcBMI：身高缺失抛错 err.field='heightCm'");
throwsField(function () { A.calcBMI(175, "70"); }, "weightKg", "calcBMI：体重字符串抛错 err.field='weightKg'");
throwsField(function () { A.calcBMI(175, NaN); }, "weightKg", "calcBMI：体重 NaN 抛错 err.field='weightKg'");
throwsField(function () { A.calcBMI(175, Infinity); }, "weightKg", "calcBMI：体重 Infinity 抛错 err.field='weightKg'");
throwsField(function () { A.calcBMI(175, 0); }, "weightKg", "calcBMI：体重 0 抛错 err.field='weightKg'");
throwsField(function () { A.calcBMI(175, -70); }, "weightKg", "calcBMI：体重负数抛错 err.field='weightKg'");
throwsField(function () { A.calcBMI(175); }, "weightKg", "calcBMI：体重缺失抛错 err.field='weightKg'");

/* ---------- 2. classifyBMI：WHO 四分级 ---------- */
var c1 = A.classifyBMI(17.8);
eq(c1.label, "偏瘦", "classifyBMI：17.8→label=偏瘦");
eq(c1.level, "underweight", "classifyBMI：17.8→level=underweight");
var c2 = A.classifyBMI(18.4);
eq(c2.label, "偏瘦", "classifyBMI：18.4→偏瘦（临界下）");
eq(c2.level, "underweight", "classifyBMI：18.4→underweight");
var c3 = A.classifyBMI(18.5);
eq(c3.label, "正常", "classifyBMI：验收边界 18.5→正常");
eq(c3.level, "normal", "classifyBMI：18.5→level=normal");
var c4 = A.classifyBMI(22.9);
eq(c4.label, "正常", "classifyBMI：验收 22.9→正常");
eq(c4.level, "normal", "classifyBMI：22.9→level=normal");
var c5 = A.classifyBMI(24.9);
eq(c5.label, "正常", "classifyBMI：验收边界 24.9→正常");
eq(c5.level, "normal", "classifyBMI：24.9→level=normal");
eq(A.classifyBMI(24.95).label, "正常", "classifyBMI：24.95→正常（<25）");
var c6 = A.classifyBMI(25);
eq(c6.label, "超重", "classifyBMI：验收边界 25→超重");
eq(c6.level, "overweight", "classifyBMI：25→level=overweight");
var c7 = A.classifyBMI(29.9);
eq(c7.label, "超重", "classifyBMI：验收边界 29.9→超重");
eq(c7.level, "overweight", "classifyBMI：29.9→level=overweight");
var c8 = A.classifyBMI(30);
eq(c8.label, "肥胖", "classifyBMI：验收边界 30→肥胖");
eq(c8.level, "obese", "classifyBMI：30→level=obese");
var c9 = A.classifyBMI(38.2);
eq(c9.label, "肥胖", "classifyBMI：38.2→肥胖");
eq(c9.level, "obese", "classifyBMI：38.2→level=obese");
ok(typeof c4.label === "string" && typeof c4.level === "string", "classifyBMI：返回 {label,level} 结构");
throwsField(function () { A.classifyBMI("22.9"); }, "bmi", "classifyBMI：bmi 字符串抛错 err.field='bmi'");
throwsField(function () { A.classifyBMI(NaN); }, "bmi", "classifyBMI：bmi NaN 抛错 err.field='bmi'");
throwsField(function () { A.classifyBMI(Infinity); }, "bmi", "classifyBMI：bmi Infinity 抛错 err.field='bmi'");
throwsField(function () { A.classifyBMI(0); }, "bmi", "classifyBMI：bmi=0 抛错 err.field='bmi'");
throwsField(function () { A.classifyBMI(-22.9); }, "bmi", "classifyBMI：bmi 负数抛错 err.field='bmi'");
throwsField(function () { A.classifyBMI(undefined); }, "bmi", "classifyBMI：bmi 缺失抛错 err.field='bmi'");

/* ---------- 3. zoneBreakpoints：WHO 阈值点 ---------- */
var bps = A.zoneBreakpoints();
eq(bps.length, 3, "zoneBreakpoints：返回 3 个阈值点");
eq(bps[0], 18.5, "zoneBreakpoints：阈值一=18.5");
eq(bps[1], 25, "zoneBreakpoints：阈值二=25");
eq(bps[2], 30, "zoneBreakpoints：阈值三=30");
bps[0] = 99;
eq(A.zoneBreakpoints()[0], 18.5, "zoneBreakpoints：每次返回新数组，外部篡改不污染");

/* ---------- 4. zoneAdvices：四分级健康提示 ---------- */
var advs = A.zoneAdvices();
eq(advs.length, 4, "zoneAdvices：返回 4 条提示");
eq(advs[0].level, "underweight", "zoneAdvices：首条 level=underweight");
eq(advs[0].label, "偏瘦", "zoneAdvices：首条 label=偏瘦");
eq(advs[1].level, "normal", "zoneAdvices：第二条 level=normal");
eq(advs[1].label, "正常", "zoneAdvices：第二条 label=正常");
eq(advs[2].level, "overweight", "zoneAdvices：第三条 level=overweight");
eq(advs[2].label, "超重", "zoneAdvices：第三条 label=超重");
eq(advs[3].level, "obese", "zoneAdvices：末条 level=obese");
eq(advs[3].label, "肥胖", "zoneAdvices：末条 label=肥胖");
eq(advs[0].range, "< 18.5", "zoneAdvices：偏瘦 range=< 18.5");
eq(advs[1].range, "18.5 – 24.9", "zoneAdvices：正常 range=18.5 – 24.9");
eq(advs[2].range, "25 – 29.9", "zoneAdvices：超重 range=25 – 29.9");
eq(advs[3].range, "≥ 30", "zoneAdvices：肥胖 range=≥ 30");
advs.forEach(function (a, idx) {
  ok(typeof a.advice === "string" && a.advice.length > 10, "zoneAdvices：第" + (idx + 1) + "条有健康提示文案");
  ok(/^#[0-9a-f]{6}$/.test(a.color), "zoneAdvices：第" + (idx + 1) + "条有合法配色");
});
advs[0].advice = "被篡改";
eq(A.zoneAdvices()[0].advice === "被篡改", false, "zoneAdvices：返回深拷贝，外部篡改不污染静态数据");

/* ---------- 5. 常量与挂载 ---------- */
eq(typeof A.calcBMI, "function", "module.exports 含 calcBMI");
eq(typeof A.classifyBMI, "function", "module.exports 含 classifyBMI");
eq(typeof A.zoneBreakpoints, "function", "module.exports 含 zoneBreakpoints");
eq(typeof A.zoneAdvices, "function", "module.exports 含 zoneAdvices");
has(JS_SRC, "window.BmiCalc", "JS 挂载 window.BmiCalc");
has(JS_SRC, "bmi_calc_v1", "JS 含 localStorage key bmi_calc_v1");

/* ---------- 6. categories.go 注册 ---------- */
var bmiIdx = GO_SRC.indexOf('"bmi_calc"');
ok(bmiIdx >= 0, "注册含 ID bmi_calc");
has(GO_SRC, 'Path:        "/tools/bmi-calc"', "注册 Path 为 /tools/bmi-calc");
var bmiBlock = GO_SRC.slice(bmiIdx, bmiIdx + 2200);
has(bmiBlock, "BMI 体质指数计算器", "注册 Name 为 BMI 体质指数计算器");
has(bmiBlock, 'Category:    "生活工具"', "注册 Category 为生活工具");
has(bmiBlock, "New:         true", "注册 New: true");
has(bmiBlock, 'Icon:        "monitor_weight"', "注册 Icon 为 monitor_weight");
has(bmiBlock, "WHO", "Description 含「WHO」");
has(bmiBlock, "18.5", "Description 含「18.5」");
has(bmiBlock, "localStorage", "Description 含「localStorage」");
has(bmiBlock, "BMI", "Description 含「BMI」");
has(bmiBlock, "client-side", "Description 含英文「client-side」");
var iconRe = /"monitor_weight"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon monitor_weight 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 295, "注册 Path 总数 283→284");

/* ---------- 7. 模板：SEO/真限制/双向互链/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/bmi-calc", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="bmi-app"', "模板含应用根节点 bmi-app");
has(TPL_SRC, 'id="bmi-height"', "模板含身高输入 bmi-height");
has(TPL_SRC, 'id="bmi-weight"', "模板含体重输入 bmi-weight");
has(TPL_SRC, 'id="bmi-result"', "模板含结果区 bmi-result");
has(TPL_SRC, 'id="bmi-value"', "模板含 BMI 数值展示 bmi-value");
has(TPL_SRC, 'id="bmi-class"', "模板含分级徽章 bmi-class");
has(TPL_SRC, 'id="bmi-barwrap"', "模板含分级色条 bmi-barwrap");
has(TPL_SRC, 'id="bmi-advice"', "模板含健康提示 bmi-advice");
has(TPL_SRC, 'id="bmi-sample"', "模板含示例按钮 bmi-sample");
has(TPL_SRC, 'id="bmi-copy"', "模板含复制按钮 bmi-copy");
has(TPL_SRC, 'id="bmi-clear"', "模板含清空按钮 bmi-clear");
has(TPL_SRC, 'id="bmi-err"', "模板含错误区 bmi-err");
has(TPL_SRC, 'src="/tools/static/js/bmi_calc.js?v=1"', "模板引用新 JS（v=1）");
has(TPL_SRC, "BMI", "模板含 BMI 关键词");
has(TPL_SRC, "体质指数", "模板含体质指数关键词");
has(TPL_SRC, "WHO", "模板含 WHO 标准说明");
has(TPL_SRC, "偏瘦", "模板含分级 偏瘦");
has(TPL_SRC, "超重", "模板含分级 超重");
has(TPL_SRC, "肥胖", "模板含分级 肥胖");
has(TPL_SRC, "孕妇", "真限制①：孕妇不适用明示");
has(TPL_SRC, "运动员", "真限制①：运动员不适用明示");
has(TPL_SRC, "肌肉量大者", "真限制①：肌肉量大者不适用明示");
has(TPL_SRC, "老人", "真限制①：老人不适用明示");
has(TPL_SRC, "筛查工具", "真限制①：BMI 为筛查工具非诊断明示");
has(TPL_SRC, "亚洲", "真限制②：亚洲参考提示明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制③：纯本地零上传");
has(TPL_SRC, "仅供参考", "真限制：仅供参考");
has(TPL_SRC, "健康小闭环", "模板含健康小闭环标签");
has(TPL_SRC, 'href="/tools/heart-rate-zones"', "模板互链：含 /tools/heart-rate-zones 链接");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

/* ---------- 8. 双向互链：心率区间计算器模板回链 ---------- */
has(HRZ_TPL_SRC, 'href="/tools/bmi-calc"', "双向互链：heart_rate_zones.html 含 /tools/bmi-calc 链接");
has(HRZ_TPL_SRC, "健康小闭环", "双向互链：heart_rate_zones.html 含健康小闭环标签");

console.log("bmi_calc: pass=" + pass + " fail=" + fail);
if (fail > 0) { process.exit(1); }

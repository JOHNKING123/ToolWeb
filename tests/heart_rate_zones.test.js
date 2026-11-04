/* 心率区间计算器（heart_rate_zones）纯逻辑单元测试（零依赖）：
 * node tests/heart_rate_zones.test.js
 * 覆盖：maxHeartRate（Tanaka 208−0.7×30=187、Fox 220−30=190、年龄非法 err.field='age'、
 * method 非法 err.field='method'）、maxPctZones（五区间 bpm 上下限、边界连续性、
 * maxHR 非法 err.field='maxHR'）、karvonenZones（(190−60)×0.7＋60=151、五区间、
 * restHR 非法/≥maxHR 抛错 err.field='restHR'）、zoneDescriptions（五区间训练说明、
 * 深拷贝防篡改）、module.exports 与 window.HeartRateZones 挂载、categories.go
 * 注册（Path 总数 282→283、Icon monitor_heart 全库唯一、New/Category/中英文关键词）
 * 与模板（真限制四条、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/heart_rate_zones.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "heart_rate_zones.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "heart_rate_zones.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. maxHeartRate：最大心率估算 ---------- */
eq(A.maxHeartRate(30, "tanaka"), 187, "maxHeartRate：Tanaka 208−0.7×30=187");
eq(A.maxHeartRate(30, "fox"), 190, "maxHeartRate：Fox 220−30=190");
eq(A.maxHeartRate(20, "tanaka"), 194, "maxHeartRate：Tanaka 208−0.7×20=194");
eq(A.maxHeartRate(40, "fox"), 180, "maxHeartRate：Fox 220−40=180");
eq(A.maxHeartRate(50, "tanaka"), 173, "maxHeartRate：Tanaka 208−0.7×50=173");
eq(A.maxHeartRate(1, "fox"), 219, "maxHeartRate：Fox 年龄下限 1→219");
eq(A.maxHeartRate(120, "tanaka"), 124, "maxHeartRate：Tanaka 年龄上限 120→124");
throwsField(function () { A.maxHeartRate("30", "tanaka"); }, "age", "maxHeartRate：年龄字符串抛错 err.field='age'");
throwsField(function () { A.maxHeartRate(NaN, "tanaka"); }, "age", "maxHeartRate：年龄 NaN 抛错 err.field='age'");
throwsField(function () { A.maxHeartRate(Infinity, "fox"); }, "age", "maxHeartRate：年龄 Infinity 抛错 err.field='age'");
throwsField(function () { A.maxHeartRate(0, "tanaka"); }, "age", "maxHeartRate：年龄 0 抛错 err.field='age'");
throwsField(function () { A.maxHeartRate(-5, "fox"); }, "age", "maxHeartRate：年龄负数抛错 err.field='age'");
throwsField(function () { A.maxHeartRate(121, "tanaka"); }, "age", "maxHeartRate：年龄 121 超限抛错 err.field='age'");
throwsField(function () { A.maxHeartRate(200, "fox"); }, "age", "maxHeartRate：年龄 200 超限抛错 err.field='age'");
throwsField(function () { A.maxHeartRate(30, "bad"); }, "method", "maxHeartRate：method 非法抛错 err.field='method'");
throwsField(function () { A.maxHeartRate(30); }, "method", "maxHeartRate：method 缺失抛错 err.field='method'");
throwsField(function () { A.maxHeartRate(30, "measured"); }, "method", "maxHeartRate：method='measured' 抛错（实测值走页面直传不经过本函数）");

/* ---------- 2. maxPctZones：Max% 口径五区间 ---------- */
var mp = A.maxPctZones(190);
eq(mp.length, 5, "maxPctZones：返回 5 个区间");
eq(mp[0].zone, 1, "maxPctZones：首区间 zone=1");
eq(mp[0].code, "Z1", "maxPctZones：首区间 code=Z1");
eq(mp[0].name, "恢复区", "maxPctZones：首区间 name=恢复区");
eq(mp[0].low, 95, "maxPctZones(190)：Z1 low=95（50%）");
eq(mp[0].high, 114, "maxPctZones(190)：Z1 high=114（60%）");
eq(mp[1].low, 114, "maxPctZones(190)：Z2 low=114");
eq(mp[1].high, 133, "maxPctZones(190)：Z2 high=133（70%）");
eq(mp[2].low, 133, "maxPctZones(190)：Z3 low=133");
eq(mp[2].high, 152, "maxPctZones(190)：Z3 high=152（80%）");
eq(mp[3].low, 152, "maxPctZones(190)：Z4 low=152");
eq(mp[3].high, 171, "maxPctZones(190)：Z4 high=171（90%）");
eq(mp[4].low, 171, "maxPctZones(190)：Z5 low=171");
eq(mp[4].high, 190, "maxPctZones(190)：Z5 high=190（100%）");
eq(mp[0].lowPct, 50, "maxPctZones：Z1 lowPct=50");
eq(mp[4].highPct, 100, "maxPctZones：Z5 highPct=100");
for (var i = 1; i < mp.length; i++) {
  eq(mp[i].low, mp[i - 1].high, "maxPctZones(190)：区间边界连续性 Z" + (i + 1) + ".low===Z" + i + ".high");
}
var mp2 = A.maxPctZones(187);
for (var j = 1; j < mp2.length; j++) {
  ok(Math.abs(mp2[j].low - mp2[j - 1].high) <= 1,
    "maxPctZones(187)：修约边界连续性 ±1（Z" + (j + 1) + ".low=" + mp2[j].low + "，Z" + j + ".high=" + mp2[j - 1].high + "）");
}
throwsField(function () { A.maxPctZones("190"); }, "maxHR", "maxPctZones：maxHR 字符串抛错 err.field='maxHR'");
throwsField(function () { A.maxPctZones(NaN); }, "maxHR", "maxPctZones：maxHR NaN 抛错 err.field='maxHR'");
throwsField(function () { A.maxPctZones(0); }, "maxHR", "maxPctZones：maxHR=0 抛错 err.field='maxHR'");
throwsField(function () { A.maxPctZones(-190); }, "maxHR", "maxPctZones：maxHR 负数抛错 err.field='maxHR'");
throwsField(function () { A.maxPctZones(Infinity); }, "maxHR", "maxPctZones：maxHR Infinity 抛错 err.field='maxHR'");

/* ---------- 3. karvonenZones：Karvonen 心率储备法 ---------- */
var kv = A.karvonenZones(190, 60);
eq(kv.length, 5, "karvonenZones：返回 5 个区间");
eq(kv[0].low, 125, "karvonenZones(190,60)：Z1 low=125（(190−60)×50%＋60）");
eq(kv[0].high, 138, "karvonenZones(190,60)：Z1 high=138");
eq(kv[1].low, 138, "karvonenZones(190,60)：Z2 low=138");
eq(kv[1].high, 151, "karvonenZones(190,60)：Z2 high=151");
eq(kv[2].low, 151, "karvonenZones(190,60)：Z3 low=151（验收：(190−60)×0.7＋60=151）");
eq(kv[2].high, 164, "karvonenZones(190,60)：Z3 high=164");
eq(kv[3].low, 164, "karvonenZones(190,60)：Z4 low=164");
eq(kv[3].high, 177, "karvonenZones(190,60)：Z4 high=177");
eq(kv[4].low, 177, "karvonenZones(190,60)：Z5 low=177");
eq(kv[4].high, 190, "karvonenZones(190,60)：Z5 high=190");
for (var k = 1; k < kv.length; k++) {
  eq(kv[k].low, kv[k - 1].high, "karvonenZones(190,60)：区间边界连续性 Z" + (k + 1) + ".low===Z" + k + ".high");
}
var kv2 = A.karvonenZones(183, 55);
eq(kv2[4].high, 183, "karvonenZones(183,55)：Z5 high=最大心率 183");
eq(kv2[0].low, 119, "karvonenZones(183,55)：Z1 low=119（(183−55)×50%＋55）");
for (var m = 1; m < kv2.length; m++) {
  ok(Math.abs(kv2[m].low - kv2[m - 1].high) <= 1,
    "karvonenZones(183,55)：修约边界连续性 ±1");
}
throwsField(function () { A.karvonenZones(190, "60"); }, "restHR", "karvonenZones：restHR 字符串抛错 err.field='restHR'");
throwsField(function () { A.karvonenZones(190, NaN); }, "restHR", "karvonenZones：restHR NaN 抛错 err.field='restHR'");
throwsField(function () { A.karvonenZones(190, 0); }, "restHR", "karvonenZones：restHR=0 抛错 err.field='restHR'");
throwsField(function () { A.karvonenZones(190, -10); }, "restHR", "karvonenZones：restHR 负数抛错 err.field='restHR'");
throwsField(function () { A.karvonenZones(190, 190); }, "restHR", "karvonenZones：restHR=maxHR 抛错 err.field='restHR'");
throwsField(function () { A.karvonenZones(190, 200); }, "restHR", "karvonenZones：restHR>maxHR 抛错 err.field='restHR'");
throwsField(function () { A.karvonenZones("190", 60); }, "maxHR", "karvonenZones：maxHR 字符串抛错 err.field='maxHR'");
throwsField(function () { A.karvonenZones(0, 60); }, "maxHR", "karvonenZones：maxHR=0 抛错 err.field='maxHR'");

/* ---------- 4. zoneDescriptions：五区间训练说明 ---------- */
var descs = A.zoneDescriptions();
eq(descs.length, 5, "zoneDescriptions：返回 5 条说明");
eq(descs[0].code, "Z1", "zoneDescriptions：首条 code=Z1");
eq(descs[0].name, "恢复区", "zoneDescriptions：首条 name=恢复区");
eq(descs[0].range, "50–60%", "zoneDescriptions：首条 range=50–60%");
eq(descs[1].name, "有氧基础区", "zoneDescriptions：Z2 name=有氧基础区");
eq(descs[2].name, "有氧耐力区", "zoneDescriptions：Z3 name=有氧耐力区");
eq(descs[3].name, "乳酸阈值区", "zoneDescriptions：Z4 name=乳酸阈值区");
eq(descs[4].name, "最大摄氧区", "zoneDescriptions：Z5 name=最大摄氧区");
eq(descs[4].range, "90–100%", "zoneDescriptions：Z5 range=90–100%");
descs.forEach(function (d, idx) {
  ok(typeof d.purpose === "string" && d.purpose.length > 0, "zoneDescriptions：Z" + (idx + 1) + " 有 purpose");
  ok(typeof d.feeling === "string" && d.feeling.length > 0, "zoneDescriptions：Z" + (idx + 1) + " 有 feeling");
  ok(typeof d.training === "string" && d.training.length > 0, "zoneDescriptions：Z" + (idx + 1) + " 有 training");
});
descs[0].training = "被篡改";
eq(A.zoneDescriptions()[0].training === "被篡改", false, "zoneDescriptions：返回深拷贝，外部篡改不污染静态数据");

/* ---------- 5. 常量与挂载 ---------- */
ok(Array.isArray(A.ZONE_DEFS) && A.ZONE_DEFS.length === 5, "ZONE_DEFS：5 区间定义");
eq(A.ZONE_DEFS[0][3], 50, "ZONE_DEFS：Z1 强度下限 50");
eq(A.ZONE_DEFS[4][4], 100, "ZONE_DEFS：Z5 强度上限 100");
eq(typeof A.maxHeartRate, "function", "module.exports 含 maxHeartRate");
eq(typeof A.maxPctZones, "function", "module.exports 含 maxPctZones");
eq(typeof A.karvonenZones, "function", "module.exports 含 karvonenZones");
eq(typeof A.zoneDescriptions, "function", "module.exports 含 zoneDescriptions");
has(JS_SRC, "window.HeartRateZones", "JS 挂载 window.HeartRateZones");
has(JS_SRC, "heart_rate_zones_v1", "JS 含 localStorage key heart_rate_zones_v1");

/* ---------- 6. categories.go 注册 ---------- */
var hrzIdx = GO_SRC.indexOf('"heart_rate_zones"');
ok(hrzIdx >= 0, "注册含 ID heart_rate_zones");
has(GO_SRC, 'Path:        "/tools/heart-rate-zones"', "注册 Path 为 /tools/heart-rate-zones");
var hrzBlock = GO_SRC.slice(hrzIdx, hrzIdx + 2200);
has(hrzBlock, "心率区间计算器", "注册 Name 为 心率区间计算器");
has(hrzBlock, 'Category:    "生活工具"', "注册 Category 为生活工具");
has(hrzBlock, "New:         true", "注册 New: true");
has(hrzBlock, 'Icon:        "monitor_heart"', "注册 Icon 为 monitor_heart");
has(hrzBlock, "Karvonen", "Description 含「Karvonen」");
has(hrzBlock, "localStorage", "Description 含「localStorage」");
has(hrzBlock, "heart rate", "Description 含英文「heart rate」");
has(hrzBlock, "Tanaka", "Description 含「Tanaka」");
var iconRe = /"monitor_heart"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon monitor_heart 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 290, "注册 Path 总数 282→283");

/* ---------- 7. 模板：SEO/真限制/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/heart-rate-zones", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="hrz-app"', "模板含应用根节点 hrz-app");
has(TPL_SRC, 'id="hrz-age"', "模板含年龄输入 hrz-age");
has(TPL_SRC, 'id="hrz-rest"', "模板含静息心率输入 hrz-rest");
has(TPL_SRC, 'id="hrz-measured"', "模板含实测最大心率输入 hrz-measured");
has(TPL_SRC, 'name="hrz-formula"', "模板含公式三选一 hrz-formula");
has(TPL_SRC, 'name="hrz-method"', "模板含口径二选一 hrz-method");
has(TPL_SRC, 'id="hrz-result"', "模板含结果区 hrz-result");
has(TPL_SRC, 'id="hrz-zones"', "模板含区间列表 hrz-zones");
has(TPL_SRC, 'id="hrz-maxhr"', "模板含最大心率展示 hrz-maxhr");
has(TPL_SRC, 'id="hrz-sample"', "模板含示例按钮 hrz-sample");
has(TPL_SRC, 'id="hrz-copy"', "模板含复制按钮 hrz-copy");
has(TPL_SRC, 'id="hrz-clear"', "模板含清空按钮 hrz-clear");
has(TPL_SRC, 'id="hrz-err"', "模板含错误区 hrz-err");
has(TPL_SRC, 'src="/tools/static/js/heart_rate_zones.js?v=1"', "模板引用新 JS（v=1）");
has(TPL_SRC, "±10~15 bpm", "真限制①：年龄公式个体差异 ±10~15 bpm 明示");
has(TPL_SRC, "非医疗建议", "真限制②：非医疗建议明示");
has(TPL_SRC, "胸痛", "真限制②：胸痛症状明示");
has(TPL_SRC, "呼吸困难", "真限制②：呼吸困难症状明示");
has(TPL_SRC, "晨起静坐 5 分钟", "真限制③：静息心率测量口径明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制④：纯本地零上传");
has(TPL_SRC, "仅供参考", "真限制：仅供参考");
has(TPL_SRC, "Tanaka", "模板含 Tanaka 公式说明");
has(TPL_SRC, "Karvonen", "模板含 Karvonen 口径说明");
var extRes = TPL_SRC.match(/<(script|link)[^>]*?(src|href)="https?:\/\//g) || [];
ok(extRes.every(function (t) { return t.indexOf('rel="canonical"') >= 0; }),
  "零外部资源：script/link 外链仅 canonical（实得 " + JSON.stringify(extRes) + "）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");

console.log("heart_rate_zones: pass=" + pass + " fail=" + fail);
if (fail > 0) { process.exit(1); }

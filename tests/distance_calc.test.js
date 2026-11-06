/* 两地距离计算器（distance_calc）纯逻辑单元测试（零依赖）：
 * node tests/distance_calc.test.js
 * 覆盖：haversine（北京→纽约≈10991km、伦敦→巴黎≈344km、同点=0、
 * 对跖点=πR、R=6371.0088、边界值不抛）、经纬度越界抛错
 * （lat1/lon1/lat2/lon2 全覆盖）、convertKm（km/mi/nmi 2位小数、
 * 换算因子精确值 0.621371/0.539957 大数验证、非法抛错 err.field）、
 * cityList（≥30城市、含北京/纽约/伦敦、字段形状、坐标范围、重名唯一、
 * 返回副本）、refText（跑道圈数/赤道百分比断言、非法抛错）、
 * module.exports 与 window.DistanceCalc 挂载、categories.go 注册
 * （Path 总数 286→287、Icon place 全库唯一、New/Category/中英文关键词）、
 * 模板（SEO 三条真限制、大圆/球体近似/纯本地不上传明示、零外部资源）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var T = require("../static/js/distance_calc.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "distance_calc.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "distance_calc.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. haversine 精确值 ---------- */
eq(T.R_KM, 6371.0088, "R_KM 导出值=6371.0088");
approx(T.haversine(39.9042, 116.4074, 40.7128, -74.0060), 10991, 30, "北京→纽约≈10991km±30");
approx(T.haversine(51.5074, -0.1278, 48.8566, 2.3522), 344, 2, "伦敦→巴黎≈344km±2");
eq(T.haversine(0, 0, 0, 0), 0, "同点距离=0");
approx(T.haversine(0, 0, 0, 180), Math.PI * 6371.0088, 1e-6, "对跖点距离=πR");
approx(T.haversine(-90, 0, 90, 0), Math.PI * 6371.0088, 1e-6, "南极→北极=πR（纬度边界不抛）");
approx(T.haversine(0, -180, 0, 180), 0, 1e-6, "经度 ±180 边界等价点距离≈0");
approx(T.haversine(51.5074, -0.1278, 51.5074, -0.1278), 0, 1e-9, "同一坐标距离=0");

/* ---------- 2. 经纬度越界抛错 err.field 全覆盖 ---------- */
throwsField(function () { T.haversine(91, 0, 0, 0); }, "lat1", "lat1=91 越界抛错 err.field='lat1'");
throwsField(function () { T.haversine(-91, 0, 0, 0); }, "lat1", "lat1=-91 越界抛错 err.field='lat1'");
throwsField(function () { T.haversine(NaN, 0, 0, 0); }, "lat1", "lat1=NaN 抛错 err.field='lat1'");
throwsField(function () { T.haversine("39.9", 0, 0, 0); }, "lat1", "lat1 字符串抛错 err.field='lat1'");
throwsField(function () { T.haversine(undefined, 0, 0, 0); }, "lat1", "lat1 缺失抛错 err.field='lat1'");
throwsField(function () { T.haversine(0, 181, 0, 0); }, "lon1", "lon1=181 越界抛错 err.field='lon1'");
throwsField(function () { T.haversine(0, -181, 0, 0); }, "lon1", "lon1=-181 越界抛错 err.field='lon1'");
throwsField(function () { T.haversine(0, 0, 90.1, 0); }, "lat2", "lat2=90.1 越界抛错 err.field='lat2'");
throwsField(function () { T.haversine(0, 0, -90.5, 0); }, "lat2", "lat2=-90.5 越界抛错 err.field='lat2'");
throwsField(function () { T.haversine(0, 0, Infinity, 0); }, "lat2", "lat2=Infinity 抛错 err.field='lat2'");
throwsField(function () { T.haversine(0, 0, 0, 200); }, "lon2", "lon2=200 越界抛错 err.field='lon2'");
throwsField(function () { T.haversine(0, 0, 0, null); }, "lon2", "lon2=null 抛错 err.field='lon2'");

/* ---------- 3. convertKm：2 位小数＋换算因子精确值 ---------- */
eq(T.convertKm(1, "km"), 1, "convertKm：1km→1（km 单位不变）");
eq(T.convertKm(1, "mi"), 0.62, "convertKm：1km→0.62mi（2位小数）");
eq(T.convertKm(1, "nmi"), 0.54, "convertKm：1km→0.54nmi（2位小数）");
eq(Math.round(T.convertKm(1e6, "mi")), 621371, "convertKm：换算因子精确值 0.621371（大数验证）");
eq(Math.round(T.convertKm(1e6, "nmi")), 539957, "convertKm：换算因子精确值 0.539957（大数验证）");
eq(T.convertKm(2.555, "km"), 2.56, "convertKm：2.555→2.56（四舍五入）");
eq(T.convertKm(0, "mi"), 0, "convertKm：0 距离→0");
eq(T.unitLabel("km"), "km（公里）", "unitLabel：km");
eq(T.unitLabel("mi"), "mi（英里）", "unitLabel：mi");
eq(T.unitLabel("nmi"), "nmi（海里）", "unitLabel：nmi");
throwsField(function () { T.convertKm(1, "m"); }, "unit", "convertKm：unit='m' 非法抛错 err.field='unit'");
throwsField(function () { T.convertKm(1, "KM"); }, "unit", "convertKm：unit 大小写敏感抛错 err.field='unit'");
throwsField(function () { T.convertKm(-1, "km"); }, "km", "convertKm：负距离抛错 err.field='km'");
throwsField(function () { T.convertKm(NaN, "km"); }, "km", "convertKm：NaN 抛错 err.field='km'");
throwsField(function () { T.convertKm("1", "km"); }, "km", "convertKm：字符串抛错 err.field='km'");

/* ---------- 4. cityList：≥30 城市 ---------- */
var cities = T.cityList();
ok(cities.length >= 30, "cityList：城市数≥30，实得 " + cities.length);
function findCity(nm) { return cities.filter(function (c) { return c.name === nm; })[0]; }
ok(!!findCity("北京"), "cityList：含北京");
ok(!!findCity("纽约"), "cityList：含纽约");
ok(!!findCity("伦敦"), "cityList：含伦敦");
eq(findCity("北京").lat, 39.9042, "cityList：北京纬度=39.9042");
eq(findCity("北京").lon, 116.4074, "cityList：北京经度=116.4074");
eq(findCity("纽约").country, "美国", "cityList：纽约 country=美国");
eq(Object.keys(cities[0]).sort().join(","), "country,lat,lon,name", "cityList：条目精确键集合 {name,country,lat,lon}");
var badRange = cities.filter(function (c) {
  return typeof c.lat !== "number" || typeof c.lon !== "number" ||
         c.lat < -90 || c.lat > 90 || c.lon < -180 || c.lon > 180;
});
eq(badRange.length, 0, "cityList：全部城市经纬度在合法范围");
var nameSeen = {}, dup = 0;
cities.forEach(function (c) { if (nameSeen[c.name]) { dup++; } nameSeen[c.name] = true; });
eq(dup, 0, "cityList：城市名无重复");
var c2 = T.cityList();
c2[0].name = "被篡改";
eq(T.cityList()[0].name, "北京", "cityList：返回副本，外部修改不污染内部表");

/* ---------- 5. refText：等效参照文案 ---------- */
var r1 = T.refText(0.4);
has(r1, "1.0 圈", "refText：0.4km→1.0 圈跑道");
has(r1, "跑道", "refText：含「跑道」");
has(r1, "赤道", "refText：含「赤道」");
var r2 = T.refText(10991);
has(r2, "27477.5 圈", "refText：10991km→27477.5 圈跑道");
has(r2, "27.46%", "refText：10991km→赤道占比 27.46%");
eq(T.refText(0), "≈0.0 圈标准田径跑道（400 米） · 约占赤道周长（约 40030 km）的 0.00%", "refText：0km 边界文案精确");
throwsField(function () { T.refText(-1); }, "km", "refText：负数抛错 err.field='km'");
throwsField(function () { T.refText(NaN); }, "km", "refText：NaN 抛错 err.field='km'");
throwsField(function () { T.refText("10"); }, "km", "refText：字符串抛错 err.field='km'");

/* ---------- 6. 挂载 ---------- */
eq(typeof T.haversine, "function", "module.exports 含 haversine");
eq(typeof T.convertKm, "function", "module.exports 含 convertKm");
eq(typeof T.cityList, "function", "module.exports 含 cityList");
eq(typeof T.refText, "function", "module.exports 含 refText");
has(JS_SRC, "window.DistanceCalc", "JS 挂载 window.DistanceCalc");
has(JS_SRC, "distance_calc_v1", "JS 含 localStorage key distance_calc_v1");
has(JS_SRC, "6371.0088", "JS 含 R=6371.0088 常量");

/* ---------- 7. categories.go 注册 ---------- */
var dcIdx = GO_SRC.indexOf('"distance_calc"');
ok(dcIdx >= 0, "注册含 ID distance_calc");
has(GO_SRC, 'Path:        "/tools/distance-calc"', "注册 Path 为 /tools/distance-calc");
var dcBlock = GO_SRC.slice(dcIdx, dcIdx + 2400);
has(dcBlock, "两地距离计算器", "注册 Name 为两地距离计算器");
has(dcBlock, 'Category:    "学习工具"', "注册 Category 为学习工具");
has(dcBlock, "New:         true", "注册 New: true");
has(dcBlock, 'Icon:        "place"', "注册 Icon 为 place");
has(dcBlock, "Haversine", "Description 含「Haversine」");
has(dcBlock, "速查表", "Description 含「速查表」");
has(dcBlock, "localStorage", "Description 含「localStorage」");
has(dcBlock, "client-side", "Description 含英文「client-side」");
var iconRe = /"place"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon place 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 312, "注册 Path 总数 286→287");

/* ---------- 8. 模板：SEO/真限制三条/零外部资源 ---------- */
has(TPL_SRC, '{{define "distance_calc"}}', "模板定义 distance_calc");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/distance-calc", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="distance-app"', "模板含应用根节点 distance-app");
has(TPL_SRC, 'id="dc-lat-a"', "模板含纬度输入 dc-lat-a");
has(TPL_SRC, 'id="dc-lon-b"', "模板含经度输入 dc-lon-b");
has(TPL_SRC, 'id="dc-city-a"', "模板含城市速查 dc-city-a");
has(TPL_SRC, 'name="dc-unit"', "模板含单位切换 dc-unit");
has(TPL_SRC, 'id="dc-result"', "模板含结果区 dc-result");
has(TPL_SRC, 'id="dc-error"', "模板含错误提示区 dc-error");
has(TPL_SRC, "大圆直线距离", "模板真限制①：大圆直线非实际路线距离");
has(TPL_SRC, "球体近似", "模板真限制②：球体近似");
has(TPL_SRC, "±0.5%", "模板真限制②：误差 ±0.5%");
has(TPL_SRC, "纯本地不上传", "模板真限制③：纯本地不上传");
has(TPL_SRC, "/tools/static/js/distance_calc.js", "模板引用本站静态 JS");
notHas(TPL_SRC, '<script src="http', "模板零外部资源：无 http 外链 script");
notHas(TPL_SRC, '<link rel="stylesheet" href="http', "模板零外部资源：无 http 外链 stylesheet（仅 canonical/og 元链接）");

console.log("\n通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 断言");
process.exit(fail === 0 ? 0 : 1);

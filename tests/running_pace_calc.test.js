/* 跑步配速计算器（running_pace_calc）纯逻辑单元测试（零依赖）：
 * node tests/running_pace_calc.test.js
 * 覆盖：paceFromTime（10km@50:00→300s/km→"5:00"）、timeFromPace、
 * distFromPaceTime 三互算闭环、convertPace（km/mi 双向、1 mi=1.609344 精确值、
 * 同单位恒等）、paceToKmh（5:00/km→12.00）、formatPace（M:SS、四舍五入进位）、
 * formatTime（H:MM:SS）、riegelPredict（10K 50:00→全马≈13800.6s=3:50:01，
 * 指数 1.06 精确值）、splitTable（42.195km→43 行、末行 0.195km、累计=总用时）、
 * 非法参数抛错 err.field 全覆盖、module.exports 与 window.RunningPaceCalc 挂载、
 * categories.go 注册（Path 总数 288→289、Icon directions_run 全库唯一、
 * New/Category/中英文关键词）、模板（SEO 四关键词、三条真限制、零外部资源）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var T = require("../static/js/running_pace_calc.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "running_pace_calc.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "running_pace_calc.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 三互算：已知验收值 ---------- */
eq(T.paceFromTime(3000, 10), 300, "10km@50:00→配速 300 s/km");
eq(T.formatPace(T.paceFromTime(3000, 10)), "5:00", "10km@50:00→配速 5:00/km");
eq(T.timeFromPace(300, 42.195), 12658.5, "配速 5:00/km 跑全马→12658.5s");
approx(T.distFromPaceTime(12658.5, 300), 42.195, 1e-9, "12658.5s@5:00/km→42.195km");
approx(T.distFromPaceTime(T.timeFromPace(300, 42.195), 300), 42.195, 1e-9, "三互算闭环：时间→距离还原");
approx(T.paceFromTime(T.timeFromPace(280, 5), 5), 280, 1e-9, "三互算闭环：配速→时间→配速还原");

/* ---------- 2. 配速换算 km/mi（1 mi=1.609344 km） ---------- */
eq(T.KM_PER_MI, 1.609344, "KM_PER_MI 导出值=1.609344");
approx(T.convertPace(300, "km", "mi"), 482.8032, 0.01, "5:00/km→482.8032s/mi（≈8:02.8）");
approx(T.convertPace(482.8032, "mi", "km"), 300, 0.01, "482.8032s/mi→300s/km 逆换算");
eq(T.convertPace(300, "km", "km"), 300, "同单位 km→km 恒等");
eq(T.convertPace(300, "mi", "mi"), 300, "同单位 mi→mi 恒等");
approx(T.convertPace(300, "km", "mi") / 300, 1.609344, 1e-9, "换算比精确 =1.609344");

/* ---------- 3. km/h 联动 ---------- */
approx(T.paceToKmh(300), 12, 1e-9, "5:00/km→12.00 km/h");
approx(T.paceToKmh(240), 15, 1e-9, "4:00/km→15 km/h");
approx(T.paceToKmh(360), 10, 1e-9, "6:00/km→10 km/h");

/* ---------- 4. 格式化 ---------- */
eq(T.formatPace(300), "5:00", "formatPace(300)='5:00'");
eq(T.formatPace(482.8032), "8:03", "formatPace(482.8032)='8:03'（四舍五入）");
eq(T.formatPace(59.5), "1:00", "formatPace(59.5)='1:00'（60 秒进位）");
eq(T.formatPace(0), "0:00", "formatPace(0)='0:00'");
eq(T.formatPace(3599.4), "59:59", "formatPace(3599.4)='59:59'");
eq(T.formatTime(3000), "0:50:00", "formatTime(3000)='0:50:00'");
eq(T.formatTime(3661), "1:01:01", "formatTime(3661)='1:01:01'");
eq(T.formatTime(0), "0:00:00", "formatTime(0)='0:00:00'");

/* ---------- 5. Riegel 预测（指数 1.06 精确值） ---------- */
eq(T.RIEGEL_EXPONENT, 1.06, "RIEGEL_EXPONENT 导出值=1.06");
approx(T.riegelPredict(3000, 10, 42.195), 13800.6, 1, "Riegel 10K 50:00→全马≈13800.6s（3:50:01）");
eq(T.formatTime(T.riegelPredict(3000, 10, 42.195)), "3:50:01", "Riegel 预测格式化=3:50:01");
approx(T.riegelPredict(1500, 5, 10), 1500 * Math.pow(2, 1.06), 1e-9, "Riegel 5K→10K 符合公式 T1×(D2/D1)^1.06");
approx(T.riegelPredict(3000, 10, 10), 3000, 1e-9, "Riegel 同距离预测=原成绩");
ok(T.riegelPredict(3000, 10, 42.195) > 3000 * 4.2195, "Riegel 长距离配速下降：预测 > 等速外推");

/* ---------- 6. 分段表 ---------- */
var rows = T.splitTable(42.195, 300);
eq(rows.length, 43, "42.195km 分段表=43 行");
eq(rows[0].km, 1, "首行 km=1");
eq(rows[0].splitSec, 300, "首行分段 300s");
eq(rows[0].elapsedSec, 300, "首行累计 300s");
eq(rows[42].km, 43, "末行 km=43");
approx(rows[42].segKm, 0.195, 1e-9, "末行 segKm=0.195");
approx(rows[42].splitSec, 0.195 * 300, 1e-9, "末行分段=0.195×配速");
approx(rows[42].elapsedSec, 42.195 * 300, 1e-9, "末行累计=总用时 12658.5s");
var rows10 = T.splitTable(10, 300);
eq(rows10.length, 10, "10km 分段表=10 行（整公里无多余行）");
eq(rows10[9].segKm, 1, "整公里末行 segKm=1");
var rowsFrac = T.splitTable(0.5, 300);
eq(rowsFrac.length, 1, "0.5km 分段表=1 行");
approx(rowsFrac[0].segKm, 0.5, 1e-9, "0.5km 行 segKm=0.5");

/* ---------- 7. 非法参数抛错 err.field 全覆盖 ---------- */
throwsField(function () { T.paceFromTime(0, 10); }, "timeSec", "paceFromTime：timeSec=0 抛错");
throwsField(function () { T.paceFromTime(-5, 10); }, "timeSec", "paceFromTime：timeSec 负数抛错");
throwsField(function () { T.paceFromTime(NaN, 10); }, "timeSec", "paceFromTime：timeSec=NaN 抛错");
throwsField(function () { T.paceFromTime("3000", 10); }, "timeSec", "paceFromTime：timeSec 字符串抛错");
throwsField(function () { T.paceFromTime(3000, 0); }, "distKm", "paceFromTime：distKm=0 抛错");
throwsField(function () { T.paceFromTime(3000, -10); }, "distKm", "paceFromTime：distKm 负数抛错");
throwsField(function () { T.paceFromTime(3000, Infinity); }, "distKm", "paceFromTime：distKm=Infinity 抛错");
throwsField(function () { T.timeFromPace(0, 10); }, "paceSecPerKm", "timeFromPace：paceSecPerKm=0 抛错");
throwsField(function () { T.timeFromPace("300", 10); }, "paceSecPerKm", "timeFromPace：paceSecPerKm 字符串抛错");
throwsField(function () { T.timeFromPace(300, 0); }, "distKm", "timeFromPace：distKm=0 抛错");
throwsField(function () { T.distFromPaceTime(0, 300); }, "timeSec", "distFromPaceTime：timeSec=0 抛错");
throwsField(function () { T.distFromPaceTime(3000, 0); }, "paceSecPerKm", "distFromPaceTime：paceSecPerKm=0 抛错");
throwsField(function () { T.convertPace(0, "km", "mi"); }, "paceSec", "convertPace：paceSec=0 抛错");
throwsField(function () { T.convertPace(NaN, "km", "mi"); }, "paceSec", "convertPace：paceSec=NaN 抛错");
throwsField(function () { T.convertPace(300, "m", "mi"); }, "from", "convertPace：from 非法抛错");
throwsField(function () { T.convertPace(300, "km", "yard"); }, "to", "convertPace：to 非法抛错");
throwsField(function () { T.paceToKmh(0); }, "paceSecPerKm", "paceToKmh：0 抛错");
throwsField(function () { T.paceToKmh(-60); }, "paceSecPerKm", "paceToKmh：负数抛错");
throwsField(function () { T.formatPace(-1); }, "sec", "formatPace：负数抛错");
throwsField(function () { T.formatPace(NaN); }, "sec", "formatPace：NaN 抛错");
throwsField(function () { T.formatPace("5:00"); }, "sec", "formatPace：字符串抛错");
throwsField(function () { T.formatTime(-1); }, "sec", "formatTime：负数抛错");
throwsField(function () { T.formatTime(undefined); }, "sec", "formatTime：undefined 抛错");
throwsField(function () { T.riegelPredict(0, 10, 42.195); }, "timeSec1", "riegelPredict：timeSec1=0 抛错");
throwsField(function () { T.riegelPredict(3000, 0, 42.195); }, "distKm1", "riegelPredict：distKm1=0 抛错");
throwsField(function () { T.riegelPredict(3000, 10, -5); }, "distKm2", "riegelPredict：distKm2 负数抛错");
throwsField(function () { T.riegelPredict(3000, "10", 42.195); }, "distKm1", "riegelPredict：distKm1 字符串抛错");
throwsField(function () { T.splitTable(0, 300); }, "distKm", "splitTable：distKm=0 抛错");
throwsField(function () { T.splitTable(42.195, 0); }, "paceSecPerKm", "splitTable：paceSecPerKm=0 抛错");
throwsField(function () { T.splitTable(NaN, 300); }, "distKm", "splitTable：distKm=NaN 抛错");

/* ---------- 8. 挂载 ---------- */
eq(typeof T.paceFromTime, "function", "module.exports 含 paceFromTime");
eq(typeof T.timeFromPace, "function", "module.exports 含 timeFromPace");
eq(typeof T.convertPace, "function", "module.exports 含 convertPace");
eq(typeof T.paceToKmh, "function", "module.exports 含 paceToKmh");
eq(typeof T.formatPace, "function", "module.exports 含 formatPace");
eq(typeof T.riegelPredict, "function", "module.exports 含 riegelPredict");
eq(typeof T.splitTable, "function", "module.exports 含 splitTable");
has(JS_SRC, "window.RunningPaceCalc", "JS 挂载 window.RunningPaceCalc");
has(JS_SRC, "running_pace_calc_v1", "JS 含 localStorage key running_pace_calc_v1");
has(JS_SRC, "1.609344", "JS 含 1 mi=1.609344 精确值");
has(JS_SRC, "1.06", "JS 含 Riegel 指数 1.06");
eq(T.QUICK_DISTS.length, 4, "快捷距离 4 项（5K/10K/半马/全马）");
eq(T.QUICK_DISTS[3].km, 42.195, "快捷距离全马=42.195");
eq(T.QUICK_DISTS[2].km, 21.0975, "快捷距离半马=21.0975");

/* ---------- 9. categories.go 注册 ---------- */
var rpcIdx = GO_SRC.indexOf('"running_pace_calc"');
ok(rpcIdx >= 0, "注册含 ID running_pace_calc");
has(GO_SRC, 'Path:        "/tools/running-pace-calc"', "注册 Path 为 /tools/running-pace-calc");
var rpcBlock = GO_SRC.slice(rpcIdx, rpcIdx + 2600);
has(rpcBlock, "跑步配速计算器", "注册 Name 为跑步配速计算器");
has(rpcBlock, 'Category:    "生活工具"', "注册 Category 为生活工具");
has(rpcBlock, "New:         true", "注册 New: true");
has(rpcBlock, 'Icon:        "directions_run"', "注册 Icon 为 directions_run");
has(rpcBlock, "Riegel", "Description 含「Riegel」");
has(rpcBlock, "分段表", "Description 含「分段表」");
has(rpcBlock, "localStorage", "Description 含「localStorage」");
has(rpcBlock, "client-side", "Description 含英文「client-side」");
var iconRe = /"directions_run"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon directions_run 精确值复测锁定：全库唯一 1 处");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
eq(pathCount, 319, "注册 Path 总数 288→289");

/* ---------- 10. 模板：SEO/真限制三条/零外部资源 ---------- */
has(TPL_SRC, '{{define "running_pace_calc"}}', "模板定义 running_pace_calc");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/running-pace-calc", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="running-app"', "模板含应用根节点 running-app");
has(TPL_SRC, 'id="rpc-dist"', "模板含距离输入 rpc-dist");
has(TPL_SRC, 'id="rpc-time-h"', "模板含时间输入 rpc-time-h");
has(TPL_SRC, 'id="rpc-pace"', "模板含配速输入 rpc-pace");
has(TPL_SRC, 'name="rpc-mode"', "模板含三互算模式切换 rpc-mode");
has(TPL_SRC, 'id="rpc-quicks"', "模板含快捷填充区 rpc-quicks");
has(TPL_SRC, 'id="rpc-result"', "模板含结果区 rpc-result");
has(TPL_SRC, 'id="rpc-error"', "模板含错误提示区 rpc-error");
has(TPL_SRC, 'id="rpc-splits"', "模板含分段表区 rpc-splits");
has(TPL_SRC, 'id="rpc-goal-btn"', "模板含完赛目标按钮 rpc-goal-btn");
has(TPL_SRC, 'id="rpc-riegel"', "模板含 Riegel 预测区 rpc-riegel");
has(TPL_SRC, 'id="rpc-samples"', "模板含示例区 rpc-samples");
has(TPL_SRC, 'id="rpc-copy"', "模板含复制按钮 rpc-copy");
has(TPL_SRC, 'id="rpc-clear"', "模板含清空按钮 rpc-clear");
has(TPL_SRC, 'id="rpc-toast"', "模板含 toast 提示 rpc-toast");
has(TPL_SRC, "跑步配速计算器", "模板 SEO：含「跑步配速计算器」");
has(TPL_SRC, "马拉松配速表", "模板 SEO：含「马拉松配速表」");
has(TPL_SRC, "配速换算", "模板 SEO：含「配速换算」");
has(TPL_SRC, "完赛时间预测", "模板 SEO：含「完赛时间预测」");
has(TPL_SRC, "Riegel", "模板真限制①：Riegel 经验公式");
has(TPL_SRC, "±5~10%", "模板真限制①：明示 ±5~10% 误差");
has(TPL_SRC, "匀速换算", "模板真限制②：匀速换算 vs 变速跑");
has(TPL_SRC, "纯本地不上传", "模板真限制③：纯本地不上传");
has(TPL_SRC, "/tools/static/js/running_pace_calc.js", "模板引用本站静态 JS");
notHas(TPL_SRC, '<script src="http', "模板零外部资源：无 http 外链 script");
notHas(TPL_SRC, '<link rel="stylesheet" href="http', "模板零外部资源：无 http 外链 stylesheet（仅 canonical/og 元链接）");

console.log("\n通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 断言");
process.exit(fail === 0 ? 0 : 1);

/* 习惯追踪器（habit_tracker）纯逻辑单元测试（零依赖）：
 * node tests/habit_tracker.test.js
 * 覆盖：规格确定性向量逐值命中（toggleCheckIn 不可变切换向量、
 * computeStreak 连续自然日向量、buildWeekMatrix 连续7天向量、
 * computeStats {total,days,rate} 向量、parseImport 归一化向量、
 * buildExportFileName 文件名向量）、非法参数抛 Error 的 err.field 逐字向量、
 * categories.go 注册（ID/Path/Icon/Category/New/Description 关键词，Path 总数 274→275，
 * Icon event_available 全库唯一）、模板真限制三条/双向互链「自律学习一条龙」/
 * 零网络请求静态检查、SEO 关键词（习惯打卡/习惯追踪/自律/habit tracker）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/habit_tracker.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqObj(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "habit_tracker.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "habit_tracker.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. toggleCheckIn 确定性向量 ---------- */
eqObj(A.toggleCheckIn({}, "2026-11-03"), { "2026-11-03": true },
  "toggle向量1：{} + 2026-11-03 → {'2026-11-03':true}");
eqObj(A.toggleCheckIn({ "2026-11-03": true }, "2026-11-03"), {},
  "toggle向量2：{'2026-11-03':true} + 2026-11-03 → {}");
var t0 = { "2026-11-02": true };
var t1 = A.toggleCheckIn(t0, "2026-11-03");
eqObj(t1, { "2026-11-02": true, "2026-11-03": true }, "toggle向量3：新增日期键并保留原有");
ok(t1 !== t0, "toggle 返回新对象（不可变）");
eqObj(t0, { "2026-11-02": true }, "toggle 不修改原对象");
throwsField(function () { A.toggleCheckIn("nope", "2026-11-03"); }, "checkins", "toggleCheckIn 非对象抛 Error err.field='checkins'");
throwsField(function () { A.toggleCheckIn({}, "20261103"); }, "dateKey", "toggleCheckIn 非法 dateKey 抛 Error err.field='dateKey'");
throwsField(function () { A.toggleCheckIn({}, "2026-13-40"); }, "dateKey", "toggleCheckIn 不存在的日期抛 Error err.field='dateKey'");
throwsField(function () { A.toggleCheckIn(null, "2026-11-03"); }, "checkins", "toggleCheckIn null 抛 Error err.field='checkins'");

/* ---------- 2. computeStreak 确定性向量 ---------- */
eq(A.computeStreak({ "2026-11-01": true, "2026-11-02": true, "2026-11-03": true }, "2026-11-03"), 3,
  "streak向量1：连续3天 → 3");
eq(A.computeStreak({ "2026-11-01": true, "2026-11-02": true }, "2026-11-03"), 2,
  "streak向量2：今天未打卡 → 2（从昨天起算）");
eq(A.computeStreak({ "2026-11-01": true, "2026-11-03": true }, "2026-11-03"), 1,
  "streak向量3：断档 → 1");
eq(A.computeStreak({}, "2026-11-03"), 0, "streak向量4：空 → 0");
throwsField(function () { A.computeStreak({}, "bad-date"); }, "today", "computeStreak 非法 today 抛 Error err.field='today'");
throwsField(function () { A.computeStreak({}, "2026-11-3"); }, "today", "computeStreak 非零填充日期抛 Error err.field='today'");
eq(A.computeLongestStreak({ "2026-11-01": true, "2026-11-02": true, "2026-11-03": true, "2026-11-05": true }), 3,
  "最长连续向量：3+1 → 3");
eq(A.computeLongestStreak({}), 0, "最长连续向量：空 → 0");

/* ---------- 3. buildWeekMatrix 确定性向量 ---------- */
var wm = A.buildWeekMatrix({ "2026-11-02": true }, "2026-11-02");
eq(wm.length, 7, "week矩阵：长度 7");
eqObj(wm[0], { key: "2026-11-02", checked: true }, "week向量1：[0]={key:'2026-11-02',checked:true}");
eqObj(wm[6], { key: "2026-11-08", checked: false }, "week向量2：[6]={key:'2026-11-08',checked:false}");
eqObj(wm[3], { key: "2026-11-05", checked: false }, "week向量3：[3]={key:'2026-11-05',checked:false}");
throwsField(function () { A.buildWeekMatrix({}, "bad"); }, "dateKey", "buildWeekMatrix 非法 startKey 抛 Error err.field='dateKey'");
throwsField(function () { A.buildWeekMatrix(null, "2026-11-02"); }, "checkins", "buildWeekMatrix 非对象抛 Error err.field='checkins'");

/* ---------- 4. computeStats 确定性向量 ---------- */
eqObj(A.computeStats({ "2026-11-01": true, "2026-11-03": true }, "2026-11-01", "2026-11-07"),
  { total: 2, days: 7, rate: 0.286 },
  "stats向量：{total:2,days:7,rate:0.286}（2/7 四舍五入 3 位）");
eqObj(A.computeStats({}, "2026-11-01", "2026-11-01"), { total: 0, days: 1, rate: 0 },
  "stats向量：单日区间 → {total:0,days:1,rate:0}");
throwsField(function () { A.computeStats({}, "2026-11-07", "2026-11-01"); }, "range", "computeStats 区间反序抛 Error err.field='range'");
throwsField(function () { A.computeStats({}, "2026-11-01", "bad"); }, "dateKey", "computeStats 非法日期抛 Error err.field='dateKey'");

/* ---------- 5. parseImport 确定性向量 ---------- */
var pi = A.parseImport('{"habits":[{"name":"早起","checkins":{"2026-11-03":true}}]}');
eq(pi.habits.length, 1, "import向量1：habits 长度 1");
eq(pi.habits[0].name, "早起", "import向量1：name='早起'");
eq(pi.habits[0].target, "每天", "import向量1：缺 target 补 '每天'");
eqObj(pi.habits[0].checkins, { "2026-11-03": true }, "import向量1：checkins 保留");
var pi2 = A.parseImport('{"habits":[{"name":"跑步","target":"每周≥3次","checkins":{"bad-key":1,"2026-11-03":1}}]}');
eq(pi2.habits[0].target, "每周≥3次", "import向量2：target 保留原值");
eqObj(pi2.habits[0].checkins, { "2026-11-03": true }, "import向量2：非法日期键被过滤、值归一化为 true");
throwsField(function () { A.parseImport("not json"); }, "text", "parseImport 非法 JSON 抛 Error err.field='text'");
throwsField(function () { A.parseImport(123); }, "text", "parseImport 非字符串抛 Error err.field='text'");
throwsField(function () { A.parseImport('{"habits":{}}'); }, "data", "parseImport habits 非数组抛 Error err.field='data'");
throwsField(function () { A.parseImport('{"nope":[]}'); }, "data", "parseImport 缺 habits 抛 Error err.field='data'");
throwsField(function () { A.parseImport('{"habits":[{"name":""}]}'); }, "data", "parseImport 空名称抛 Error err.field='data'");

/* ---------- 6. buildExportFileName 确定性向量 ---------- */
eq(A.buildExportFileName(new Date(2026, 10, 3, 5, 0, 0)), "habits_20261103_050000.json",
  "文件名向量：new Date(2026,10,3,5,0,0) → 'habits_20261103_050000.json'");
throwsField(function () { A.buildExportFileName("x"); }, "now", "buildExportFileName 非 Date 抛 Error err.field='now'");
throwsField(function () { A.buildExportFileName(new Date(NaN)); }, "now", "buildExportFileName 无效 Date 抛 Error err.field='now'");

/* ---------- 7. categories.go 注册 ---------- */
var htIdx = GO_SRC.indexOf('"habit_tracker"');
ok(htIdx >= 0, "注册 ID habit_tracker");
ok(GO_SRC.indexOf('"/tools/habit-tracker"') >= 0, "注册 Path /tools/habit-tracker");
ok(GO_SRC.slice(htIdx, htIdx + 1200).indexOf('Icon:        "event_available"') >= 0, "注册 Icon event_available");
ok(GO_SRC.slice(htIdx, htIdx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(htIdx, htIdx + 1200).indexOf('Category:    "学习工具"') >= 0, "注册 Category 为学习工具");
ok(GO_SRC.slice(htIdx, htIdx + 1200).indexOf("习惯打卡") >= 0, "Description 含关键词 习惯打卡");
ok(GO_SRC.slice(htIdx, htIdx + 1200).indexOf("习惯追踪") >= 0, "Description 含关键词 习惯追踪");
ok(GO_SRC.slice(htIdx, htIdx + 1200).indexOf("自律") >= 0, "Description 含关键词 自律");
ok(GO_SRC.slice(htIdx, htIdx + 1200).indexOf("habit tracker") >= 0, "Description 含关键词 habit tracker");
var evMatches = GO_SRC.match(/Icon:\s+"event_available"/g) || [];
eq(evMatches.length, 1, "Icon event_available 全库唯一（精确值复测锁定）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 316, "注册 Path 总数 274→275");

/* ---------- 8. 模板：真限制/互链/零网络/SEO ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/habit-tracker", "模板 canonical 含新 Path");
has(TPL_SRC, "跨设备不同步", "真限制①：localStorage 跨设备不同步");
has(TPL_SRC, "导出 JSON 备份", "真限制①：须导出 JSON 备份");
has(TPL_SRC, "连续自然日", "真限制②：streak 按连续自然日口径");
has(TPL_SRC, "断档", "真限制②：断档重置明示");
has(TPL_SRC, "Network 面板自证", "真限制③：纯本地零上传 Network 面板自证");
has(TPL_SRC, "/tools/flashcard-maker", "互链：闪卡卡片生成器（自律学习一条龙）");
has(TPL_SRC, "/tools/countdown-timer", "互链：在线倒计时/番茄钟（自律学习一条龙）");
has(TPL_SRC, "自律学习一条龙", "互链口号：自律学习一条龙");
has(TPL_SRC, "/tools/typing-practice", "互链：打字练习（自律学习一条龙）");
has(TPL_SRC, "习惯打卡", "模板含 SEO 关键词 习惯打卡");
has(TPL_SRC, "习惯追踪", "模板含 SEO 关键词 习惯追踪");
has(TPL_SRC, "自律", "模板含 SEO 关键词 自律");
has(TPL_SRC, "habit tracker", "模板含 SEO 关键词 habit tracker");
has(TPL_SRC, "ht-cal-grid", "模板含日历网格 ht-cal-grid");
has(TPL_SRC, "ht-stats", "模板含统计区 ht-stats");
has(TPL_SRC, "ht-habit-list", "模板含习惯列表 ht-habit-list");
has(TPL_SRC, "ht-import-file", "模板含导入文件域 ht-import-file");
has(JS_SRC, "window.HabitTracker", "JS 暴露 window.HabitTracker");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");
var FM_SRC = fs.readFileSync(path.join(ROOT, "templates", "flashcard_maker.html"), "utf8");
var CT_SRC = fs.readFileSync(path.join(ROOT, "templates", "countdown_timer.html"), "utf8");
has(FM_SRC, "/tools/habit-tracker", "双向互链：闪卡页链回习惯追踪器");
has(FM_SRC, "自律学习一条龙", "双向互链：闪卡页含口号 自律学习一条龙");
has(CT_SRC, "/tools/habit-tracker", "双向互链：倒计时页链回习惯追踪器");
has(CT_SRC, "自律学习一条龙", "双向互链：倒计时页含口号 自律学习一条龙");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);

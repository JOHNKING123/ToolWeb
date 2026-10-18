/* 时区转换器纯逻辑单元测试（零依赖）：node tests/timezone_converter.test.js
 * 覆盖评审已验证的断言：城市库/搜索、DST 春秋切换边界、isDST 南北半球、
 * 45 分钟偏移、meetingNow 修复的往返一致性。
 */
"use strict";
var t = require("../static/js/timezone_converter.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + b + "，实得 " + a + ")"); }

/* 城市库与搜索 */
eq(t.CITIES.length, 76, "城市库 76 个");
eq(t.DEFAULTS.length, 5, "默认预置 5 城");
t.DEFAULTS.forEach(function (id) { ok(!!t.CITY[id], "DEFAULTS 有效: " + id); });
eq(t.searchCities("北京")[0].iana, "Asia/Shanghai", "搜索「北京」首位");
eq(t.searchCities("上海")[0].iana, "Asia/Shanghai", "搜索「上海」首位");
eq(t.searchCities("london")[0].iana, "Europe/London", "搜索「london」首位");
eq(t.searchCities("")[0], undefined, "空查询返回空");

/* DST 切换边界（美东 2026-03-08 02:00→03:00 春季跳变） */
var NY = "America/New_York";
eq(t.zonedToUTC(2026, 3, 8, 1, 30, NY), Date.UTC(2026, 2, 8, 6, 30), "美东跳变前 01:30 → 06:30Z");
eq(t.zonedToUTC(2026, 3, 8, 3, 30, NY), Date.UTC(2026, 2, 8, 7, 30), "美东跳变后 03:30 → 07:30Z（恰好 60 分钟）");
eq(t.zonedToUTC(2026, 3, 8, 2, 30, NY), Date.UTC(2026, 2, 8, 6, 30), "缺失的 02:30 落到 06:30Z");
/* 秋季重复 01:30（2026-11-01）取第一次出现 EDT → 05:30Z */
eq(t.zonedToUTC(2026, 11, 1, 1, 30, NY), Date.UTC(2026, 10, 1, 5, 30), "秋季重复 01:30 取第一次出现 → 05:30Z");
eq(t.offsetMinutes(new Date(Date.UTC(2026, 5, 15, 12)), NY), -240, "美东夏季偏移 -240");
eq(t.offsetMinutes(new Date(Date.UTC(2026, 0, 15, 12)), NY), -300, "美东冬季偏移 -300");

/* isDST：北半球冬季/夏季、南半球夏季、无夏令时 */
ok(!t.isDST(new Date(Date.UTC(2026, 0, 15, 12)), NY), "美东 1 月非夏令时");
ok(t.isDST(new Date(Date.UTC(2026, 6, 15, 12)), NY), "美东 7 月夏令时");
ok(t.isDST(new Date(Date.UTC(2026, 0, 15, 12)), "Australia/Sydney"), "悉尼 1 月夏令时（南半球）");
ok(!t.isDST(new Date(Date.UTC(2026, 6, 15, 12)), "Asia/Shanghai"), "上海 7 月无夏令时");
ok(!t.isDST(new Date(Date.UTC(2026, 0, 15, 12)), "Asia/Shanghai"), "上海 1 月无夏令时");
ok(!t.hasDST("Asia/Shanghai"), "hasDST(上海)=false");
ok(t.hasDST("America/New_York"), "hasDST(纽约)=true");

/* 45 分钟偏移 + 格式化 */
eq(t.offsetMinutes(new Date(Date.UTC(2026, 5, 1, 12)), "Asia/Kathmandu"), 345, "加德满都 +345 分钟");
eq(t.fmtOffset(345), "UTC+5:45", "fmtOffset(345)");
eq(t.fmtOffset(-300), "UTC-5", "fmtOffset(-300)");
eq(t.fmtDiffFromBeijing(0, 480), "慢8小时", "伦敦 vs 北京");
eq(t.fmtDiffFromBeijing(480, 480), "与北京时间相同", "北京 vs 北京");
eq(t.fmtDiffFromBeijing(345, 480), "慢2小时15分", "加德满都 vs 北京");

/* meetingNow 修复往返一致性：parts(now, base) → zonedToUTC 解析回同一瞬间（误差<60s） */
["Asia/Shanghai", "America/New_York", "Europe/London", "Australia/Sydney", "Asia/Kathmandu"].forEach(function (tz) {
    var now = new Date();
    var p = t.parts(now, tz);
    var back = t.zonedToUTC(p.y, p.mo, p.d, p.h, p.mi, tz);
    ok(Math.abs(back - now.getTime()) < 60000, "往返一致 " + tz);
});
/* pad2 */
eq(t.searchCities("new york")[0].iana, "America/New_York", "别名搜索 new york");

console.log("\n通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail ? 1 : 0);

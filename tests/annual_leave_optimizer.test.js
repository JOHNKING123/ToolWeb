/* 年假拼假优化器纯函数单元测试（零依赖）：node tests/annual_leave_optimizer.test.js
* 覆盖：listHolidays 7 条日期精确值（国办发明电〔2026〕10号）与深拷贝隔离、
* getHolidayById 命中与未命中抛错 err.field='id'、normalizeLeaveDays 缺省 5 与
* 边界/抛错、computePlan 锚点精确值（端午请 2 休 5／中秋请 2 休 5／春节请 4 休 13／
* 国庆请 1 休 8 与请 2 休 10／元旦请 4 休 9）与调休上班日打断验证、rankPlans
* 排序精确值、bestPlanForLeave、formatPlanText 关键片段、buildCalendarDays
* 四色 kind 与调休标注、buildRankItemHTML/buildCalendarHTML 片段与转义、
* 非法参数抛错 err.field、双模式导出与零外部接口、categories.go 注册
* （Path 总数 305→306、Icon beach_access 全库唯一、New/生活工具类目）、
* 模板（SEO 五关键词、真限制四条、输入/快捷按钮/榜单/详情控件、2027 假期一览、
* 零外部资源静态检查）。
*/
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/annual_leave_optimizer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++;}
else { fail++; console.error("FAIL:", name);}
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");}
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name);}
function has(s, sub, name) { ok(s.indexOf(sub)!== -1, name + "（缺 " + sub + "）");}
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）");}
function throws(fn, field, name) {
try { fn(); ok(false, name + "（应抛错却未抛）");}
catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）");}
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "annual_leave_optimizer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "annual_leave_optimizer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. listHolidays：7 条日期精确值 ---------- */
var all = M.listHolidays();
eq(all.length, 7, "假期共 7 条");
eqj(all.map(function (h) { return h.id;}),
["new-year", "spring-festival", "qingming", "labour-day", "dragon-boat", "mid-autumn", "national-day"],
"假期 id 顺序精确值");
eqj(all.map(function (h) { return h.name;}),
["元旦", "春节", "清明节", "劳动节", "端午节", "中秋节", "国庆节"], "假期名称精确值");
var expectDates = {
"new-year": ["2027-01-01", "2027-01-03"],
"spring-festival": ["2027-02-05", "2027-02-13"],
"qingming": ["2027-04-03", "2027-04-05"],
"labour-day": ["2027-05-01", "2027-05-05"],
"dragon-boat": ["2027-06-09", "2027-06-09"],
"mid-autumn": ["2027-09-15", "2027-09-15"],
"national-day": ["2027-10-01", "2027-10-07"]
};
var expectWorkdays = {
"new-year": [], "spring-festival": ["2027-01-31", "2027-02-14"], "qingming": [],
"labour-day": ["2027-05-08"], "dragon-boat": [], "mid-autumn": [],
"national-day": ["2027-09-26", "2027-10-09"]
};
all.forEach(function (h) {
eqj([h.start, h.end], expectDates[h.id], "假期 " + h.id + "：起止日期精确值");
eqj(h.workdays, expectWorkdays[h.id], "假期 " + h.id + "：调休上班日精确值");
ok(typeof h.note === "string" && h.note.length > 0, "假期 " + h.id + "：备注非空");
});
var mutated = M.listHolidays();
mutated[0].name = "被改掉";
mutated[0].workdays.push("2027-01-31");
eq(M.listHolidays()[0].name, "元旦", "listHolidays 深拷贝：改返回结果不污染内置表");
eq(M.listHolidays()[0].workdays.length, 0, "listHolidays 深拷贝：调休数组隔离");

/* ---------- 2. getHolidayById：命中与未命中 ---------- */
eq(M.getHolidayById("spring-festival").name, "春节", "命中 spring-festival：名称");
eq(M.getHolidayById("spring-festival").start, "2027-02-05", "命中 spring-festival：开始日期");
eq(M.getHolidayById("national-day").end, "2027-10-07", "命中 national-day：结束日期");
eq(M.getHolidayById("dragon-boat").start, "2027-06-09", "命中 dragon-boat：单日假期起止相同");
eqj(M.getHolidayById("labour-day").workdays, ["2027-05-08"], "命中 labour-day：调休上班日");
throws(function () { M.getHolidayById("no-such-id");}, "id", "不存在的 id 抛错 field=id");
throws(function () { M.getHolidayById("");}, "id", "空串 id 抛错 field=id");
throws(function () { M.getHolidayById(null);}, "id", "null id 抛错 field=id");
throws(function () { M.getHolidayById(123);}, "id", "数字 id 抛错 field=id");
throws(function () { M.getHolidayById(undefined);}, "id", "undefined id 抛错 field=id");

/* ---------- 3. normalizeLeaveDays：缺省与边界 ---------- */
eq(M.normalizeLeaveDays(undefined), 5, "缺省 undefined：5 天");
eq(M.normalizeLeaveDays(null), 5, "缺省 null：5 天");
eq(M.normalizeLeaveDays(), 5, "无参调用：5 天");
eq(M.normalizeLeaveDays(0), 0, "边界 0 天");
eq(M.normalizeLeaveDays(30), 30, "边界 30 天");
eq(M.normalizeLeaveDays(15), 15, "常规 15 天");
throws(function () { M.normalizeLeaveDays(31);}, "leaveDays", "31 天越界抛错 field=leaveDays");
throws(function () { M.normalizeLeaveDays(-1);}, "leaveDays", "-1 天越界抛错 field=leaveDays");
throws(function () { M.normalizeLeaveDays(2.5);}, "leaveDays", "非整数抛错 field=leaveDays");
throws(function () { M.normalizeLeaveDays(NaN);}, "leaveDays", "NaN 抛错 field=leaveDays");
throws(function () { M.normalizeLeaveDays("5");}, "leaveDays", "字符串 5 抛错 field=leaveDays");
throws(function () { M.normalizeLeaveDays(true);}, "leaveDays", "布尔值抛错 field=leaveDays");
throws(function () { M.normalizeLeaveDays(Infinity);}, "leaveDays", "Infinity 抛错 field=leaveDays");

/* ---------- 4. computePlan：算法锚点精确值 ---------- */
var duanwu = M.computePlan("dragon-boat", 2);
eq(duanwu.start, "2027-06-05", "端午请 2：开始 6月5日（周六）");
eq(duanwu.end, "2027-06-09", "端午请 2：结束 6月9日");
eq(duanwu.totalDays, 5, "端午请 2 休 5");
eq(duanwu.leaveUsed, 2, "端午请 2：实耗 2 天假");
eqj(duanwu.leaveDates, ["2027-06-07", "2027-06-08"], "端午请 2：请假日期精确值");

var zhongqiu = M.computePlan("mid-autumn", 2);
eq(zhongqiu.start, "2027-09-11", "中秋请 2：开始 9月11日（周六）");
eq(zhongqiu.end, "2027-09-15", "中秋请 2：结束 9月15日");
eq(zhongqiu.totalDays, 5, "中秋请 2 休 5");
eq(zhongqiu.leaveUsed, 2, "中秋请 2：实耗 2 天假");
eqj(zhongqiu.leaveDates, ["2027-09-13", "2027-09-14"], "中秋请 2：请假日期精确值");

var chunjie = M.computePlan("spring-festival", 4);
eq(chunjie.start, "2027-02-01", "春节请 4：节前开始 2月1日");
eq(chunjie.end, "2027-02-13", "春节请 4：结束 2月13日");
eq(chunjie.totalDays, 13, "春节节前请 4 休 13");
eq(chunjie.leaveUsed, 4, "春节请 4：实耗 4 天假");
eqj(chunjie.leaveDates, ["2027-02-01", "2027-02-02", "2027-02-03", "2027-02-04"], "春节请 4：请假日期精确值");
eqj(chunjie.blockers, ["2027-01-31", "2027-02-14"], "春节请 4：调休上班日 1/31 与 2/14 打断连休");
eq(chunjie.holidayDays, 9, "春节：法定假 9 天");

var guoqing1 = M.computePlan("national-day", 1);
eq(guoqing1.start, "2027-09-30", "国庆请 1：开始 9月30日");
eq(guoqing1.end, "2027-10-07", "国庆请 1：结束 10月7日");
eq(guoqing1.totalDays, 8, "国庆请 1 休 8");
eq(guoqing1.leaveUsed, 1, "国庆请 1：实耗 1 天假");
eqj(guoqing1.leaveDates, ["2027-09-30"], "国庆请 1：请假日期精确值");

var guoqing2 = M.computePlan("national-day", 2);
eq(guoqing2.start, "2027-10-01", "国庆请 2：开始 10月1日");
eq(guoqing2.end, "2027-10-10", "国庆请 2：结束 10月10日（周日）");
eq(guoqing2.totalDays, 10, "国庆请 2 休 10");
eq(guoqing2.leaveUsed, 2, "国庆请 2：实耗 2 天假");
eqj(guoqing2.leaveDates, ["2027-10-08", "2027-10-09"], "国庆请 2：请假含 10月9日调休上班日");
eqj(guoqing2.blockers, ["2027-09-26"], "国庆请 2：9月26日调休上班日仍打断节前");

var yuandan = M.computePlan("new-year", 4);
eq(yuandan.start, "2026-12-26", "元旦请 4：跨年开始 2026年12月26日（周六）");
eq(yuandan.end, "2027-01-03", "元旦请 4：结束 1月3日");
eq(yuandan.totalDays, 9, "元旦请 4 休 9");
eq(yuandan.leaveUsed, 4, "元旦请 4：实耗 4 天假");
eqj(yuandan.leaveDates, ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"], "元旦请 4：请假日期精确值");

/* ---------- 5. computePlan：调休打断与 0 天假 ---------- */
var chunjie0 = M.computePlan("spring-festival", 0);
eq(chunjie0.totalDays, 9, "春节 0 天假：仅法定假 9 天");
eq(chunjie0.leaveUsed, 0, "春节 0 天假：不耗假");
eqj(chunjie0.leaveDates, [], "春节 0 天假：无请假日期");
eqj(chunjie0.blockers, ["2027-01-31", "2027-02-14"], "春节 0 天假：两端调休上班日均打断");
var guoqing0 = M.computePlan("national-day", 0);
eq(guoqing0.totalDays, 7, "国庆 0 天假：仅法定假 7 天");
eqj(guoqing0.blockers, ["2027-09-26", "2027-10-09"], "国庆 0 天假：两端调休上班日均打断");
var duanwu0 = M.computePlan("dragon-boat", 0);
eq(duanwu0.totalDays, 1, "端午 0 天假：仅法定假 1 天");
eqj(duanwu0.blockers, [], "端午无调休：blockers 为空");
var laodong2 = M.computePlan("labour-day", 2);
eq(laodong2.totalDays, 7, "劳动节请 2 休 7");
eq(laodong2.start, "2027-04-29", "劳动节请 2：开始 4月29日");
eqj(laodong2.blockers, ["2027-05-08"], "劳动节请 2：5月8日调休上班日打断节后");
var chunjie5 = M.computePlan("spring-festival", 5);
eq(chunjie5.totalDays, 15, "春节请 5 休 15（连上 1月31日调休）");
eqj(chunjie5.leaveDates, ["2027-01-31", "2027-02-01", "2027-02-02", "2027-02-03", "2027-02-04"], "春节请 5：请假含 1月31日调休上班日");
eqj(chunjie5.blockers, ["2027-02-14"], "春节请 5：仅剩 2月14日打断");
eq(M.computePlan("spring-festival").totalDays, 15, "computePlan 缺省年假 5 天：春节休 15 天");
eq(M.computePlan(M.getHolidayById("qingming"), 2).totalDays, 5, "computePlan 接受假期对象：清明请 2 休 5");
throws(function () { M.computePlan("no-such-id", 5);}, "id", "computePlan 未知假期 id 抛错 field=id");
throws(function () { M.computePlan(null, 5);}, "holiday", "computePlan null 假期抛错 field=holiday");
throws(function () { M.computePlan("spring-festival", 31);}, "leaveDays", "computePlan 年假 31 抛错 field=leaveDays");
throws(function () { M.computePlan({ start: "2027-13-01", end: "2027-13-02"}, 5);}, "holiday", "computePlan 非法起止日期抛错 field=holiday");

/* ---------- 6. rankPlans：排序精确值 ---------- */
var rank5 = M.rankPlans(5);
eq(rank5.length, 7, "榜单 5 天假：7 条");
eqj(rank5.map(function (p) { return p.holidayId;}),
["spring-festival", "national-day", "labour-day", "new-year", "qingming", "dragon-boat", "mid-autumn"],
"榜单 5 天假：排序精确值");
eqj(rank5.map(function (p) { return p.totalDays;}), [15, 13, 12, 10, 10, 10, 10], "榜单 5 天假：连休天数精确值");
eqj(rank5.map(function (p) { return p.rank;}), [1, 2, 3, 4, 5, 6, 7], "榜单 rank 字段 1–7");
var rank2 = M.rankPlans(2);
eqj(rank2.map(function (p) { return p.holidayId;}),
["spring-festival", "national-day", "labour-day", "new-year", "qingming", "dragon-boat", "mid-autumn"],
"榜单 2 天假：排序精确值");
eqj(rank2.map(function (p) { return p.totalDays;}), [11, 10, 7, 5, 5, 5, 5], "榜单 2 天假：连休天数精确值");
var rank0 = M.rankPlans(0);
eq(rank0[0].holidayId, "spring-festival", "榜单 0 天假：榜首仍是春节");
eq(rank0[0].totalDays, 9, "榜单 0 天假：榜首 9 天");
eq(M.rankPlans(5, 3).length, 3, "rankPlans limit=3：返回 3 条");
eq(M.rankPlans(5, 3)[0].holidayId, "spring-festival", "rankPlans limit=3：榜首仍是春节");
eq(M.rankPlans(5, 1)[0].totalDays, 15, "rankPlans limit=1：仅榜首 15 天");
throws(function () { M.rankPlans(5, 0);}, "limit", "limit=0 抛错 field=limit");
throws(function () { M.rankPlans(5, 8);}, "limit", "limit=8 抛错 field=limit");
throws(function () { M.rankPlans(5, 1.5);}, "limit", "limit 非整数抛错 field=limit");
throws(function () { M.rankPlans(5, "3");}, "limit", "limit 字符串抛错 field=limit");
throws(function () { M.rankPlans("x");}, "leaveDays", "rankPlans 非法年假抛错 field=leaveDays");

/* ---------- 7. bestPlanForLeave ---------- */
eq(M.bestPlanForLeave(5).holidayId, "spring-festival", "bestPlan 5 天假：春节");
eq(M.bestPlanForLeave(5).totalDays, 15, "bestPlan 5 天假：休 15 天");
eq(M.bestPlanForLeave(2).holidayId, "spring-festival", "bestPlan 2 天假：春节");
eq(M.bestPlanForLeave(2).totalDays, 11, "bestPlan 2 天假：休 11 天");
eq(M.bestPlanForLeave(0).totalDays, 9, "bestPlan 0 天假：休 9 天");
eq(M.bestPlanForLeave().totalDays, 15, "bestPlan 缺省 5 天假：休 15 天");

/* ---------- 8. formatPlanText：关键片段 ---------- */
var txtCJ = M.formatPlanText(chunjie);
has(txtCJ, "", "方案文本：含");
has(txtCJ, "请4天休13天", "方案文本：请4休13");
has(txtCJ, "2027-02-01至2027-02-13", "方案文本：起止日期");
has(txtCJ, "共13天", "方案文本：共13天");
has(txtCJ, "请假日期：2月1日、2月2日、2月3日、2月4日", "方案文本：请假日期中文");
has(txtCJ, "法定假9天", "方案文本：法定假9天");
has(txtCJ, "调休上班日1月31日、2月14日未请假，不计入连休", "方案文本：调休打断说明");
var txtGQ = M.formatPlanText(guoqing2);
has(txtGQ, "请2天休10天", "方案文本国庆：请2休10");
has(txtGQ, "请假日期：10月8日、10月9日", "方案文本国庆：请假含调休日");
has(txtGQ, "调休上班日9月26日未请假", "方案文本国庆：9月26日打断说明");
var txtDW0 = M.formatPlanText(duanwu0);
has(txtDW0, "请0天休1天", "方案文本端午 0 假：请0休1");
has(txtDW0, "请假日期：无", "方案文本端午 0 假：无请假日期");
ok(txtDW0.indexOf("调休上班日") === -1, "方案文本端午 0 假：无调休说明");
throws(function () { M.formatPlanText(null);}, "plan", "formatPlanText null 抛错 field=plan");
throws(function () { M.formatPlanText({ holidayName: "春节"});}, "plan", "formatPlanText 不完整方案抛错 field=plan");

/* ---------- 9. buildCalendarDays：四色 kind 与调休标注 ---------- */
function findDay(days, date) {
for (var i = 0; i < days.length; i++) if (days[i].date === date) return days[i];
return null;
}
var calCJ = M.buildCalendarDays(chunjie);
eq(findDay(calCJ, "2027-01-31").kind, "work", "春节日历：1月31日为调休上班日");
eq(findDay(calCJ, "2027-01-31").inPlan, false, "春节日历：1月31日在方案窗口外");
eq(findDay(calCJ, "2027-02-01").kind, "leave", "春节日历：2月1日为请假日");
eq(findDay(calCJ, "2027-02-01").inPlan, true, "春节日历：2月1日在方案窗口内");
eq(findDay(calCJ, "2027-02-05").kind, "holiday", "春节日历：2月5日为法定假");
eq(findDay(calCJ, "2027-02-13").kind, "holiday", "春节日历：2月13日为法定假");
eq(findDay(calCJ, "2027-02-14").kind, "work", "春节日历：2月14日为调休上班日");
var calGQ = M.buildCalendarDays(guoqing2);
var d1009 = findDay(calGQ, "2027-10-09");
eq(d1009.kind, "leave", "国庆日历：10月9日调休上班日请假后 kind 为请假日");
eq(d1009.workday, true, "国庆日历：10月9日 workday 标记为真");
eq(findDay(calGQ, "2027-10-10").kind, "weekend", "国庆日历：10月10日周日为周末");
eq(findDay(calGQ, "2027-10-01").kind, "holiday", "国庆日历：10月1日为法定假");
eq(findDay(calGQ, "2027-10-12").kind, "plain", "国庆日历：窗口外普通工作日 kind 为 plain");
var calDW = M.buildCalendarDays(duanwu);
eq(findDay(calDW, "2027-06-05").kind, "weekend", "端午日历：6月5日周六为周末");
eq(findDay(calDW, "2027-06-09").kind, "holiday", "端午日历：6月9日为法定假");
eq(findDay(calDW, "2027-06-07").kind, "leave", "端午日历：6月7日为请假日");
throws(function () { M.buildCalendarDays(null);}, "plan", "buildCalendarDays null 抛错 field=plan");

/* ---------- 10. 纯函数 HTML：片段与转义 ---------- */
var itemHtml = M.buildRankItemHTML(rank5[0], true);
has(itemHtml, 'data-id="spring-festival"', "榜单卡片 HTML：含 data-id");
has(itemHtml, "春节", "榜单卡片 HTML：含假期名");
has(itemHtml, "请5休15", "榜单卡片 HTML：含请5休15");
has(itemHtml, "alo-active", "榜单卡片 HTML：激活含 alo-active");
ok(M.buildRankItemHTML(rank5[1], false).indexOf("alo-active") === -1, "榜单卡片 HTML：非激活不含 alo-active");
var calHtml = M.buildCalendarHTML(chunjie);
has(calHtml, "alo-k-holiday", "日历 HTML：含法定假色块");
has(calHtml, "alo-k-leave", "日历 HTML：含请假日色块");
has(calHtml, "alo-k-work", "日历 HTML：含调休上班日色块");
has(calHtml, "2027-01-31", "日历 HTML：含调休上班日 1月31日");
var evilItem = M.buildRankItemHTML({ holidayId: "x", holidayName: "<b>&\"'", holidayStart: "2027-01-01", holidayEnd: "2027-01-03", holidayDays: 3, leaveUsed: 1, totalDays: 4, start: "2027-01-01", end: "2027-01-04", rank: 1}, false);
notHas(evilItem, "<b>&\"'", "榜单卡片 HTML：假期名转义，不含裸注入串");
has(evilItem, "&lt;b&gt;&amp;&quot;&#39;", "榜单卡片 HTML：假期名完整转义为实体");

/* ---------- 11. 双模式导出与零外部接口 ---------- */
ok(typeof M.listHolidays === "function" && typeof M.getHolidayById === "function" &&
typeof M.normalizeLeaveDays === "function" && typeof M.computePlan === "function" &&
typeof M.rankPlans === "function" && typeof M.bestPlanForLeave === "function" &&
typeof M.formatPlanText === "function" && typeof M.buildCalendarDays === "function",
"同步导出：8 个纯函数齐全");
has(JS_SRC, "window.AnnualLeaveOptimizer", "浏览器导出：window.AnnualLeaveOptimizer");
has(JS_SRC, "module.exports = api", "node 导出：module.exports 同步导出");
notHas(JS_SRC, "fetch(", "JS 零外部接口：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "JS 零外部接口：无 XMLHttpRequest");
notHas(JS_SRC, "localStorage", "JS 零存储：不写 localStorage");

/* ---------- 12. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^\"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i;}).length;
eq(pathCount, 313, "注册 Path 总数 309→310");
has(GO_SRC, '"annual_leave_optimizer"', "注册：ID annual_leave_optimizer");
has(GO_SRC, '"/tools/annual-leave-optimizer"', "注册：Path /tools/annual-leave-optimizer");
has(GO_SRC, '"beach_access"', "注册：Icon beach_access");
eq((GO_SRC.match(/Icon:\s*"beach_access"/g) || []).length, 1, "Icon beach_access 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf('"annual_leave_optimizer"') - 60,
GO_SRC.indexOf('"annual_leave_optimizer"') + 1400);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"生活工具"/.test(entryBlock), "注册：类目 生活工具");
has(entryBlock, "年假拼假优化器", "注册：名称 年假拼假优化器");
has(entryBlock, "国办发明电", "注册：描述含数据来源");

/* ---------- 13. 模板：SEO/真限制/控件/假期一览/零外部资源 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/annual-leave-optimizer", "模板 canonical 含新 Path");
has(TPL_SRC, "年假拼假优化器", "模板：标题含工具名");
has(TPL_SRC, "年假拼假", "模板 SEO：关键词 年假拼假");
has(TPL_SRC, "拼假优化器", "模板 SEO：关键词 拼假优化器");
has(TPL_SRC, "请假攻略", "模板 SEO：关键词 请假攻略");
has(TPL_SRC, "2027放假安排", "模板 SEO：关键词 2027放假安排");
has(TPL_SRC, "调休日历", "模板 SEO：关键词 调休日历");
has(TPL_SRC, "真限制", "模板：真限制章节");
has(TPL_SRC, "仅适用 2027 年", "真限制①：仅适用 2027 年");
has(TPL_SRC, "调休上班日不计入连休", "真限制②：调休上班日不计入连休");
has(TPL_SRC, "须以单位制度与审批为准", "真限制③：须以单位制度与审批为准");
has(TPL_SRC, "本页零上传", "真限制④：本页零上传");
has(TPL_SRC, 'id="alo-leave-input"', "模板控件：年假天数输入框");
has(TPL_SRC, 'value="5"', "模板控件：年假天数默认 5");
has(TPL_SRC, 'data-alo-days="5"', "模板控件：法定 5 天快捷按钮");
has(TPL_SRC, 'data-alo-days="10"', "模板控件：法定 10 天快捷按钮");
has(TPL_SRC, 'data-alo-days="15"', "模板控件：法定 15 天快捷按钮");
has(TPL_SRC, 'id="alo-list"', "模板控件：方案榜容器");
has(TPL_SRC, 'id="alo-detail"', "模板控件：方案详情容器");
has(TPL_SRC, "国办发明电〔2026〕10号", "模板：数据来源 国办发明电〔2026〕10号");
has(TPL_SRC, "2月5日–2月13日", "假期一览：春节日期");
has(TPL_SRC, "1月31日（周日）、2月14日（周日）", "假期一览：春节调休上班日");
has(TPL_SRC, "9月26日（周日）、10月9日（周六）", "假期一览：国庆调休上班日");
has(TPL_SRC, "端午请 2 休 5", "模板：经典拼法 端午请 2 休 5");
has(TPL_SRC, "春节节前请 4 休 13", "模板：经典拼法 春节请 4 休 13");
has(TPL_SRC, "国庆请 1 休 8 或请 2 休 10", "模板：经典拼法 国庆请 1 休 8 / 请 2 休 10");
has(TPL_SRC, "/tools/time-decimal", "互链：拼假小贴士→工时十进制转换");
has(TPL_SRC, "/tools/static/js/annual_leave_optimizer.js?v=1", "模板：引用本站 JS");
has(JS_SRC, "复制方案文本", "JS 渲染：复制方案文本按钮文案");
has(JS_SRC, 'id="alo-copy"', "JS 渲染：复制按钮 id alo-copy");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/annual-leave-optimizer") !== -1, "模板 http link：仅自家 canonical");

console.log("annual_leave_optimizer: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);

/* Cron 表达式生成器纯逻辑单元测试（零依赖）：node tests/cron_generator.test.js
 * 覆盖：四种字段模式、非法输入、中文描述、OR 口径下次推算、
 * 边界日期（永不执行／闰年）、预设载入、重置、注册与零网络静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/cron_generator.js");
var GO_SRC = fs.readFileSync(path.join(__dirname, "../tools/categories.go"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(__dirname, "../templates/cron_generator.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(__dirname, "../static/js/cron_generator.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function st(expr) { return M.stateFromExpr(expr); }

/* ---------- 1. 默认状态：每分钟 ---------- */
eq(M.buildExpression(M.defaultState()).expr, "* * * * *", "默认：每分钟表达式");
eq(M.describe(M.defaultState()), "每分钟执行", "默认：描述为每分钟执行");
eq(M.buildExpression(M.defaultState()).errors.length, 0, "默认：无错误");

/* ---------- 2. 四种字段模式拼接 ---------- */
eq(M.buildExpression(st("*/15 * * * *")).expr, "*/15 * * * *", "模式：步长 */15");
eq(M.buildExpression(st("30 9 * * 1")).expr, "30 9 * * 1", "模式：指定值 每周一 09:30");
eq(M.buildExpression(st("0 9 1 * *")).expr, "0 9 1 * *", "模式：指定值 每月 1 号 09:30");
eq(M.buildExpression(st("0 9 * * 1-5")).expr, "0 9 * * 1-5", "模式：范围 工作日 09:00");
eq(M.buildExpression(st("0,30 * * * *")).expr, "0,30 * * * *", "模式：列表 0,30 分");
var s = M.defaultState();
s.minute = M.fieldState("step", { step: 15 });
eq(M.buildExpression(s).expr, "*/15 * * * *", "模式：手写步长状态拼 */15");
s = M.defaultState();
s.minute = M.fieldState("range", { from: 10, to: 20 });
eq(M.buildExpression(s).expr, "10-20 * * * *", "模式：手写范围状态拼 10-20");

/* ---------- 3. 非法输入报错且不输出错误表达式 ---------- */
s = M.defaultState(); s.minute = M.fieldState("list", { values: [60] });
var bad = M.buildExpression(s);
eq(bad.expr, null, "非法：分钟 60 不输出表达式");
ok(bad.errors.length > 0, "非法：分钟 60 有报错");
s = M.defaultState(); s.hour = M.fieldState("range", { from: 10, to: 5 });
bad = M.buildExpression(s);
eq(bad.expr, null, "非法：起＞止不输出表达式");
ok(bad.errors.join("").indexOf("不能大于") !== -1, "非法：起＞止报错含原因");
s = M.defaultState(); s.minute = M.fieldState("step", { step: 0 });
bad = M.buildExpression(s);
eq(bad.expr, null, "非法：步长 0 不输出表达式");
ok(bad.errors.join("").indexOf("不能为 0") !== -1, "非法：步长 0 报错含原因");
s = M.defaultState(); s.dom = M.fieldState("list", { values: [] });
eq(M.buildExpression(s).expr, null, "非法：指定值为空不输出表达式");

/* ---------- 4. 中文描述 ---------- */
ok(M.describe(st("30 9 * * 1")).indexOf("每周一 09:30") !== -1, "描述：30 9 * * 1 含每周一 09:30");
ok(M.describe(st("*/15 * * * *")).indexOf("每 15 分钟") !== -1, "描述：*/15 含每 15 分钟");
ok(M.describe(st("30 9 1 * *")).indexOf("每月 1 号 09:30") !== -1, "描述：每月 1 号 09:30");
ok(M.describe(st("0 9 * * 1-5")).indexOf("每周一至周五 09:00") !== -1, "描述：工作日 09:00");
var orDesc = M.describe(st("30 9 1 * 1"));
ok(orDesc.indexOf("每月 1 号和每周一") !== -1, "描述 OR：日与周同时受限写成和关系");
ok(orDesc.indexOf("任一满足即执行") !== -1, "描述 OR：含任一满足即执行，不写成交集");
ok(orDesc.indexOf("且") === -1 || orDesc.indexOf("每月 1 号且周一") === -1, "描述 OR：不写成每月 1 号且周一的交集语义");

/* ---------- 5. 下次执行时间：步进、在当前时间之后 ---------- */
var now = new Date(2026, 9, 26, 10, 7, 0); /* 2026-10-26 周一 10:07 本地时间 */
var runs = M.nextRuns(st("*/15 * * * *"), now, 5).runs;
eq(runs.length, 5, "预览：*/15 给出 5 次");
eq(runs[0].getMinutes(), 15, "预览：*/15 首次为 15 分");
eq(runs[1].getMinutes(), 30, "预览：*/15 第二次为 30 分");
ok(runs.every(function (d) { return d > now; }), "预览：5 次均在当前时间之后");
ok(runs[4].getTime() - runs[0].getTime() === 60 * 60000, "预览：*/15 首末间隔 60 分钟");

/* ---------- 6. OR 口径推算 ---------- */
/* 2026-10-26 是周一但不是 1 号：OR 口径下当天 09:30 就应执行（周一满足） */
var orRuns = M.nextRuns(st("30 9 1 * 1"), new Date(2026, 9, 26, 8, 0, 0), 1).runs;
eq(orRuns.length, 1, "推算 OR：给出下次");
eq(orRuns[0].getDate(), 26, "推算 OR：周一满足即执行，不等到 1 号");
eq(orRuns[0].getHours(), 9, "推算 OR：时间为 09 点");
/* 交集口径下 2026-11-02（周一）不会执行；OR 口径下会执行 */
var orRuns2 = M.nextRuns(st("30 9 1 * 1"), new Date(2026, 10, 2, 8, 0, 0), 1).runs;
eq(orRuns2[0].getDate(), 2, "推算 OR：11 月 2 日周一满足即执行");

/* ---------- 7. 边界日期 ---------- */
var never = M.nextRuns(st("0 0 30 2 *"), new Date(2026, 9, 26, 0, 0, 0), 5);
eq(never.never, true, "边界：2 月 30 日明确提示永不执行");
eq(never.runs.length, 0, "边界：2 月 30 日无下次时间");
var neverApr = M.nextRuns(st("0 0 31 4 *"), new Date(2026, 9, 26, 0, 0, 0), 5);
eq(neverApr.never, true, "边界：4 月 31 日明确提示永不执行");
/* 周日 0 与 7 生成一致（统一输出 0） */
eq(M.buildExpression(st("0 9 * * 7")).expr, "0 9 * * 0", "边界：周日 7 归一输出 0");
eq(M.buildExpression(st("0 9 * * 0")).expr, "0 9 * * 7".replace("7", "0"), "边界：周日 0 与 7 生成一致");
eq(M.buildExpression(st("0 9 * * 0")).expr, M.buildExpression(st("0 9 * * 7")).expr, "边界：周日 0/7 表达式相等");
/* 闰年 2 月 29 日可推算 */
var leap = M.nextRuns(st("0 0 29 2 *"), new Date(2027, 2, 1, 0, 0, 0), 1).runs;
eq(leap.length, 1, "边界：闰年 2 月 29 日可推算");
eq(leap[0].getFullYear(), 2028, "边界：闰年下次为 2028 年");
eq(leap[0].getMonth() + 1, 2, "边界：闰年下次为 2 月");
eq(leap[0].getDate(), 29, "边界：闰年下次为 29 日");

/* ---------- 8. 预设载入与重置 ---------- */
["every_minute", "every_5_min", "hourly", "daily_0930", "weekly_mon_0930", "monthly_1_0930", "weekday_0900"].forEach(function (name) {
    ok(!!M.CG_PRESETS[name], "预设存在: " + name);
    var ps = M.applyPreset(name);
    var built = M.buildExpression(ps);
    eq(built.expr, M.CG_PRESETS[name].expr, "预设表达式同步: " + name);
    ok(!!M.describe(ps), "预设描述同步: " + name);
    ok(M.nextRuns(ps, new Date(2026, 9, 26, 8, 0, 0), 1).runs.length === 1, "预设预览同步: " + name);
});
var wk = M.applyPreset("weekday_0900");
eq(M.buildExpression(wk).expr, "0 9 * * 1-5", "预设：工作日 09:00 表达式");
wk.minute = M.fieldState("list", { values: [30] });
eq(M.buildExpression(wk).expr, "30 9 * * 1-5", "预设：载入后可再改控件");
eq(M.buildExpression(M.applyPreset("no_such_preset")).expr, "* * * * *", "预设：未知预设回默认");
eq(M.buildExpression(M.defaultState()).expr, "* * * * *", "重置：回到锁定默认每分钟");

/* ---------- 9. 注册与零网络静态检查 ---------- */
ok(GO_SRC.indexOf('"cron_generator"') !== -1, "注册：categories.go 含 ID cron_generator");
ok(GO_SRC.indexOf('"/tools/cron-generator"') !== -1, "注册：categories.go 含 Path /tools/cron-generator");
ok(GO_SRC.indexOf('"alarm"') !== -1, "注册：Icon alarm");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 178, "注册：Path 总数 177→178");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/cron-generator") !== -1, "SEO：canonical 正确");
ok(TPL_SRC.indexOf("/tools/cron-parser") !== -1, "互链：含 Cron 表达式解析");
ok(TPL_SRC.indexOf("不支持") !== -1 && TPL_SRC.indexOf("L") !== -1, "真限制：不支持 Quartz L/W/# 可见");
ok(TPL_SRC.indexOf("并集") !== -1, "真限制：日与周取并集可见");
ok(TPL_SRC.indexOf("周日 0 与 7 等价") !== -1, "真限制：周日等价可见");
ok(TPL_SRC.indexOf("永不执行") !== -1, "真限制：不存在日期告警可见");
ok(TPL_SRC.indexOf('data-cg-preset="every_5_min"') !== -1, "模板：每 5 分钟预设按钮存在");
ok(TPL_SRC.indexOf('data-cg-preset="weekday_0900"') !== -1, "模板：工作日预设按钮存在");
ok(TPL_SRC.indexOf("/tools/static/js/cron_generator.js") !== -1, "模板：引用本地 JS");
ok(!/fetch\s*\(|XMLHttpRequest/.test(JS_SRC), "零网络：JS 无 fetch/XHR");
ok(!/https?:\/\/(fonts|cdn|unpkg|cdnjs)/.test(TPL_SRC), "零 CDN：模板无外部 CDN");
ok(TPL_SRC.indexOf("复制失败") !== -1, "复制：失败降级提示文案存在");

console.log("cron_generator: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);

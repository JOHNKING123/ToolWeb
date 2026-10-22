/* 在线倒计时/番茄钟纯逻辑单元测试（零依赖）：node tests/countdown_timer.test.js
 * 覆盖：时间格式化（mm:ss/小时位/百分秒）、倒计时输入解析、Date.now 锚点计算、
 * 番茄轮转状态机、阶段标签与时长、闹钟下次触发、圈速最快/最慢、预设序列化/
 * 反序列化/上限、标题栏文案、音效序列、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var ct = require("../static/js/countdown_timer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 时间格式化 ---------- */
eq(ct.fmtHMS(0), "00:00", "fmtHMS 0 秒");
eq(ct.fmtHMS(5), "00:05", "fmtHMS 5 秒");
eq(ct.fmtHMS(65), "01:05", "fmtHMS 65 秒");
eq(ct.fmtHMS(600), "10:00", "fmtHMS 10 分钟");
eq(ct.fmtHMS(3599), "59:59", "fmtHMS 59:59 不进小时位");
eq(ct.fmtHMS(3600), "1:00:00", "fmtHMS 整小时");
eq(ct.fmtHMS(3661), "1:01:01", "fmtHMS 1:01:01");
eq(ct.fmtHMS(-10), "00:00", "fmtHMS 负数钳 0");
eq(ct.fmtStopwatch(0), "00:00.00", "秒表 0");
eq(ct.fmtStopwatch(303270), "05:03.27", "秒表 5 分 03 秒 270 毫秒");
eq(ct.fmtStopwatch(59999), "00:59.99", "秒表 59.99 秒");

/* ---------- 倒计时输入解析 ---------- */
eq(ct.parseCountdownInput(0, 5, 0), 300, "5 分钟 → 300 秒");
eq(ct.parseCountdownInput(1, 0, 30), 3630, "1 时 30 秒");
eq(ct.parseCountdownInput(0, 0, 5), 5, "5 秒");
eq(ct.parseCountdownInput(null, undefined, ""), 0, "空输入 → 0");
eq(ct.parseCountdownInput(0, 99, 0), 3540, "分钟超 59 钳制");

/* ---------- Date.now 锚点计算 ---------- */
(function () {
    var anchor = 1000000;
    eq(ct.countdownRemainingMs(anchor, 999000), 1000, "锚点-1 秒 → 剩余 1000ms");
    eq(ct.countdownRemainingMs(anchor, anchor), 0, "锚点时刻 → 0");
    eq(ct.countdownRemainingMs(anchor, anchor + 5000), 0, "过锚点钳 0 不为负");
})();

/* ---------- 番茄轮转状态机 ---------- */
(function () {
    var r1 = ct.pomoNext("focus", 0, 4);
    eq(r1.mode, "short", "第 1 轮专注完成 → 短休息");
    eq(r1.cyclesCompleted, 1, "轮数 0→1");
    var r4 = ct.pomoNext("focus", 3, 4);
    eq(r4.mode, "long", "第 4 轮专注完成 → 长休息");
    eq(r4.cyclesCompleted, 4, "轮数 3→4");
    var rs = ct.pomoNext("short", 2, 4);
    eq(rs.mode, "focus", "短休息完成 → 专注");
    eq(rs.cyclesCompleted, 2, "休息不改变轮数");
    var rl = ct.pomoNext("long", 4, 4);
    eq(rl.mode, "focus", "长休息完成 → 专注");
    var r2 = ct.pomoNext("focus", 1, 2);
    eq(r2.mode, "long", "两轮制：第 2 轮后长休息");
    eq(ct.pomoPhaseLabel("focus"), "专注", "阶段标签 专注");
    eq(ct.pomoPhaseLabel("short"), "短休息", "阶段标签 短休息");
    eq(ct.pomoPhaseLabel("long"), "长休息", "阶段标签 长休息");
    eq(ct.pomoModeDurationSec("focus", 25, 5, 15), 1500, "专注 25 分钟 → 1500 秒");
    eq(ct.pomoModeDurationSec("short", 25, 5, 15), 300, "短休息 5 分钟 → 300 秒");
    eq(ct.pomoModeDurationSec("long", 25, 5, 15), 900, "长休息 15 分钟 → 900 秒");
    eq(ct.pomoModeDurationSec("focus", 50, 10, 30), 3000, "自定义专注 50 分钟");
})();

/* ---------- 闹钟下次触发 ---------- */
(function () {
    /* 固定 now：2026-10-23（周五）10:00:00 本地 */
    var now = new Date(2026, 9, 23, 10, 0, 0, 0).getTime();
    var t1 = ct.alarmNextTs(10, 2, "daily", now);
    var d1 = new Date(t1);
    eq(d1.getHours(), 10, "daily：今天 10:02 未到 → 今天");
    eq(d1.getMinutes(), 2, "daily：分钟 02");
    var t2 = ct.alarmNextTs(9, 58, "daily", now);
    var d2 = new Date(t2);
    eq(d2.getDate(), 24, "daily：今天 09:58 已过 → 明天");
    var t3 = ct.alarmNextTs(10, 2, "once", now);
    eq(new Date(t3).getDate(), 23, "once：今天未到 → 今天");
    var t4 = ct.alarmNextTs(10, 2, "weekdays", now);
    var d4 = new Date(t4);
    eq(d4.getDay() >= 1 && d4.getDay() <= 5, true, "weekdays：触发日为工作日");
    ok(t1 !== null && t2 !== null && t3 !== null && t4 !== null, "四种重复均返回有效时间戳");
    /* 周六 10:00，weekdays 设 09:00（已过）→ 下一个周一 */
    var sat = new Date(2026, 9, 24, 10, 0, 0, 0).getTime();
    var tw = ct.alarmNextTs(9, 0, "weekdays", sat);
    eq(new Date(tw).getDay(), 1, "weekdays：周六已过 → 下周一");
})();

/* ---------- 圈速最快/最慢 ---------- */
(function () {
    var st = ct.lapStats([1000, 2000, 1500]);
    eq(st.fastestIdx, 0, "最快圈下标 0");
    eq(st.slowestIdx, 1, "最慢圈下标 1");
    var st1 = ct.lapStats([1000]);
    eq(st1.fastestIdx, -1, "不足 2 圈不标色");
    var stEq = ct.lapStats([1000, 1000]);
    eq(stEq.slowestIdx, -1, "全相等 → 不标最慢");
})();

/* ---------- 预设：保存/上限/删除/序列化 ---------- */
(function () {
    var list = [];
    for (var i = 1; i <= 5; i++) {
        var r = ct.savePreset(list, { name: "预设" + i, type: "countdown", params: { m: i } });
        ok(r.ok, "保存第 " + i + " 组倒计时预设");
        list = r.list;
    }
    eq(ct.presetsByType(list, "countdown").length, 5, "倒计时预设 5 组");
    var over = ct.savePreset(list, { name: "第6组", type: "countdown", params: {} });
    eq(over.ok, false, "第 6 组倒计时预设被拒绝");
    var pomoOk = ct.savePreset(list, { name: "番茄1", type: "pomodoro", params: { focus: 50 } });
    ok(pomoOk.ok, "番茄钟预设独立计数不受倒计时上限影响");
    list = pomoOk.list;
    /* 同名覆盖 */
    var dup = ct.savePreset(list, { name: "预设1", type: "countdown", params: { m: 99 } });
    ok(dup.ok, "同名覆盖允许（不占新名额）");
    list = dup.list;
    eq(ct.presetsByType(list, "countdown").length, 5, "同名覆盖后仍 5 组");
    var target = ct.presetsByType(list, "countdown").filter(function (p) { return p.name === "预设1"; })[0];
    eq(target.params.m, 99, "同名覆盖更新参数");
    /* 删除 */
    list = ct.deletePreset(list, target.id);
    eq(ct.presetsByType(list, "countdown").length, 4, "删除后 4 组");
    /* 序列化往返 */
    var raw = ct.serializePresets(list);
    var back = ct.parsePresets(raw);
    eq(back.length, list.length, "序列化往返数量一致");
    eq(back[0].name, list[0].name, "序列化往返名称一致");
    eq(ct.parsePresets("not json").length, 0, "非法 JSON → 空数组");
    eq(ct.parsePresets('[{"name":123}]').length, 0, "脏数据被过滤");
})();

/* ---------- 标题栏文案 ---------- */
(function () {
    eq(ct.titleFor("倒计时", "04:59"), "⏱ 倒计时 04:59 | 程序员工具箱", "标题栏文案格式");
    var bl = ct.blinkTitles("倒计时", "00:00");
    eq(bl.length, 2, "闪烁两帧");
    ok(bl[1].indexOf("时间到") !== -1, "第二帧含「时间到」");
})();

/* ---------- 音效序列 ---------- */
(function () {
    ["beep", "bell", "chime"].forEach(function (k) {
        var p = ct.beepPattern(k);
        ok(Array.isArray(p) && p.length >= 2, k + " 音效序列非空");
        p.forEach(function (n) { ok(n.freq > 0 && n.dur > 0, k + " 音符频率/时长有效"); });
    });
    ok(ct.beepPattern("unknown").length >= 2, "未知类型回退默认蜂鸣");
})();

/* ---------- 当日键 ---------- */
eq(ct.todayKey(new Date(2026, 9, 23, 3, 41)), "2026-10-23", "当日键格式");

/* ---------- 源码零 fetch/XHR ---------- */
var src = fs.readFileSync(path.join(__dirname, "..", "static", "js", "countdown_timer.js"), "utf8");
ok(!/fetch\s*\(/.test(src), "源码无 fetch(");
ok(!/XMLHttpRequest/.test(src), "源码无 XMLHttpRequest");
ok(!/navigator\.sendBeacon/.test(src), "源码无 sendBeacon");
ok(!/\$\.ajax/.test(src), "源码无 $.ajax");
ok(!/WebSocket/.test(src), "源码无 WebSocket");
ok(/module\.exports/.test(src), "源码暴露 module.exports 供测试");

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail ? 1 : 0);

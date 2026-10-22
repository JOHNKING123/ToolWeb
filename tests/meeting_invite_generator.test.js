/* 会议邀请 (.ics) 生成器纯逻辑单元测试（零依赖）：node tests/meeting_invite_generator.test.js
 * 覆盖：RFC 5545 文本转义（\ ; , 换行）、75 字节折行（含 UTF-8 多字节不截断）、
 * 邮箱校验/参会人解析、日期时间格式、全天事件 DATE、VALARM TRIGGER 映射、
 * 表单校验（标题必填/结束不晚于开始/邮箱非法）、文件名过滤、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var mi = require("../static/js/meeting_invite_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(hay, needle, name) { ok(hay.indexOf(needle) !== -1, name + "（期望包含 " + JSON.stringify(needle) + "）"); }

/* ---------- 文本转义 ---------- */
eq(mi.escapeText("a;b"), "a\\;b", "分号转义");
eq(mi.escapeText("a,b"), "a\\,b", "逗号转义");
eq(mi.escapeText("a\\b"), "a\\\\b", "反斜杠转义");
eq(mi.escapeText("a\nb"), "a\\nb", "LF 换行转义");
eq(mi.escapeText("a\r\nb"), "a\\nb", "CRLF 换行转义为单个 \\n");
eq(mi.escapeText("a\rb"), "a\\nb", "CR 换行转义");
eq(mi.escapeText("周会；讨论"), "周会；讨论", "中文全角分号不转义（仅 ASCII 标点）");
eq(mi.escapeText(null), "", "null → 空串");
eq(mi.escapeText("标题；地点,备注\n第二行\\尾"), "标题；地点\\,备注\\n第二行\\\\尾",
    "复合转义一次成型（全角不动、ASCII 转义）");

/* ---------- UTF-8 字节数 ---------- */
eq(mi.utf8Bytes("abc"), 3, "ASCII 3 字节");
eq(mi.utf8Bytes("周会"), 6, "两个中文字符 6 字节");
eq(mi.utf8Bytes("📅"), 4, "emoji 代理对 4 字节");

/* ---------- 75 字节折行 ---------- */
(function () {
    var line75 = new Array(76).join("a"); /* 75 个 a */
    eq(mi.foldLine(line75), line75, "75 字节整行不折行");
    var line76 = new Array(77).join("a"); /* 76 个 a */
    var folded = mi.foldLine(line76);
    eq(folded, new Array(76).join("a") + "\r\n " + "a", "76 字节 → 75 + 折行 + 1");
    ok(folded.split("\r\n").length === 2, "76 字节折成 2 段");
    /* 每段字节数校验：首段 ≤75，续段内容 ≤74 */
    var segs = folded.split("\r\n");
    ok(mi.utf8Bytes(segs[0]) <= 75, "首段 ≤75 字节");
    ok(segs[1][0] === " " && mi.utf8Bytes(segs[1].slice(1)) <= 74, "续段以空格开头且内容 ≤74 字节");
    /* 长行多段折行 */
    var long200 = new Array(201).join("b");
    ok(mi.foldLine(long200).split("\r\n").length === 3, "200 字节折成 3 段");
    /* 中文不截断：38 个中文字符 = 114 字节 → 25+13 */
    var cn38 = new Array(39).join("中");
    var foldedCn = mi.foldLine(cn38);
    var cnSegs = foldedCn.split("\r\n");
    eq(cnSegs[0].length, 25, "中文首段 25 个字符（75 字节）");
    eq(cnSegs[1].slice(1).length, 13, "中文续段 13 个字符");
    ok(mi.utf8Bytes(cnSegs[0]) === 75, "中文首段恰好 75 字节（无字符被截断）");
})();

/* ---------- 邮箱校验 / 参会人解析 ---------- */
ok(mi.validateEmail("zhangsan@example.com"), "正常邮箱通过");
ok(mi.validateEmail("a.b+tag@sub.example.co"), "带点/加号/子域邮箱通过");
ok(!mi.validateEmail("not-an-email"), "无 @ 失败");
ok(!mi.validateEmail("a@b"), "无顶级域失败");
ok(!mi.validateEmail("a b@c.com"), "含空格失败");
ok(!mi.validateEmail(""), "空串失败");
(function () {
    var p = mi.parseAttendees("a@example.com, b@example.com;c@example.com\nd@example.com");
    eq(p.valid.length, 4, "逗号/分号/换行混合切分出 4 个");
    eq(p.invalid.length, 0, "全合法 → invalid 为空");
    var p2 = mi.parseAttendees("a@example.com, A@example.com, bad-email, ,");
    eq(p2.valid.length, 1, "重复邮箱去重（大小写不敏感）");
    eq(p2.invalid.length, 1, "非法邮箱进入 invalid");
    eq(p2.invalid[0], "bad-email", "invalid 保留原文本");
})();

/* ---------- 日期时间格式 ---------- */
eq(mi.localToIcsDateTime("2026-10-24", "14:00"), "20261024T140000", "本地日期时间 → ICS 基本格式");
eq(mi.localToIcsDate("2026-10-24"), "20261024", "本地日期 → ICS DATE 格式");
eq(mi.addDays("2026-10-24", 1), "2026-10-25", "日期 +1 天");
eq(mi.addDays("2026-10-31", 1), "2026-11-01", "跨月 +1 天");
eq(mi.addDays("2026-12-31", 1), "2027-01-01", "跨年 +1 天");
eq(mi.formatDtStamp(new Date(Date.UTC(2026, 9, 23, 17, 59, 27))),
    "20261023T175927Z", "DTSTAMP UTC 格式");
(function () {
    var uid = mi.generateUid();
    ok(/^[0-9a-f]{32}@it-tool\.eu\.cc$/.test(uid), "UID 32 位十六进制 + 域名后缀");
    ok(mi.generateUid() !== uid, "两次 UID 不同（随机）");
})();

/* ---------- 文件名过滤 ---------- */
eq(mi.sanitizeFilename("产品周会", "2026-10-24"), "产品周会_20261024.ics", "标题+日期文件名");
eq(mi.sanitizeFilename('a/b\\c:d*e?f"g<h>i|j', "2026-10-24"), "abcdefghij_20261024.ics",
    "非法文件名字符全部过滤");
eq(mi.sanitizeFilename("   ", "2026-10-24"), "meeting_20261024.ics", "空标题回退 meeting");
ok(mi.sanitizeFilename(new Array(100).join("x"), "2026-10-24").indexOf(".ics") !== -1 &&
    mi.sanitizeFilename(new Array(100).join("x"), "2026-10-24").length <= 60 + 1 + 8 + 4,
    "超长标题截断至 60 字符");

/* ---------- 提醒 TRIGGER 映射 ---------- */
eq(mi.triggerForReminder("5m"), "-PT5M", "5 分钟 → -PT5M");
eq(mi.triggerForReminder("15m"), "-PT15M", "15 分钟 → -PT15M");
eq(mi.triggerForReminder("30m"), "-PT30M", "30 分钟 → -PT30M");
eq(mi.triggerForReminder("1h"), "-PT1H", "1 小时 → -PT1H");
eq(mi.triggerForReminder("1d"), "-P1D", "1 天 → -P1D");
eq(mi.triggerForReminder("nope"), null, "未知提醒 id → null");
eq(mi.REMINDERS.length, 5, "共 5 档提醒");

/* ---------- 示例输入端到端（验收标准 2） ---------- */
var sampleOpts = {
    title: "产品周会",
    allDay: false,
    startDate: "2026-10-24", startTime: "14:00",
    endDate: "2026-10-24", endTime: "15:00",
    tz: "Asia/Shanghai",
    location: "3 楼会议室 A",
    attendees: ["zhangsan@example.com", "lisi@example.com"],
    description: "本周迭代复盘\n下周排期",
    reminders: ["15m"],
    uid: "fixeduid1234567890abcdef12345678@it-tool.eu.cc",
    dtstamp: "20261023T015927Z"
};
var ics = mi.buildIcs(sampleOpts);
ok(ics.indexOf("BEGIN:VCALENDAR") === 0, "以 BEGIN:VCALENDAR 开头");
ok(ics.slice(-"END:VCALENDAR\r\n".length) === "END:VCALENDAR\r\n",
    "以 END:VCALENDAR 结尾");
contains(ics, "VERSION:2.0", "含 VERSION:2.0");
contains(ics, "PRODID:", "含 PRODID");
contains(ics, "DTSTART;TZID=Asia/Shanghai:20261024T140000", "DTSTART 带 TZID 时区");
contains(ics, "DTEND;TZID=Asia/Shanghai:20261024T150000", "DTEND 带 TZID 时区");
contains(ics, "SUMMARY:" + mi.escapeText("产品周会"), "SUMMARY 含转义后标题");
contains(ics, "LOCATION:3 楼会议室 A", "LOCATION 含地点");
ok((ics.match(/ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:/g) || []).length === 2,
    "2 个参会人 → 2 行 ATTENDEE");
contains(ics, "mailto:zhangsan@example.com", "ATTENDEE 含参会人邮箱 1");
contains(ics, "mailto:lisi@example.com", "ATTENDEE 含参会人邮箱 2");
contains(ics, "BEGIN:VALARM", "含 VALARM 块");
contains(ics, "TRIGGER:-PT15M", "VALARM TRIGGER:-PT15M");
contains(ics, "ACTION:DISPLAY", "VALARM ACTION:DISPLAY");
contains(ics, "END:VALARM", "VALARM 闭合");
contains(ics, "DESCRIPTION:" + mi.escapeText("本周迭代复盘\n下周排期"),
    "DESCRIPTION 换行转义为 \\n");
contains(ics, "DTSTAMP:20261023T015927Z", "DTSTAMP 注入值生效");
contains(ics, "UID:fixeduid1234567890abcdef12345678@it-tool.eu.cc", "UID 注入值生效");
/* 全输出每行 ≤75 字节（折行正确性） */
(function () {
    var lines = ics.replace(/\r\n /g, "").split("\r\n");
    ok(lines.every(function (l) { return mi.utf8Bytes(l) <= 75 || l === ""; }),
        "所有内容行 ≤75 字节");
    ok(ics.indexOf("\n") === -1 || ics.split("\n").every(function (l) {
        return l === "" || l[l.length - 1] === "\r";
    }), "行分隔符统一为 CRLF");
})();

/* ---------- 全天事件 ---------- */
var allday = mi.buildIcs({
    title: "国庆假期", allDay: true,
    startDate: "2026-10-01", endDate: "2026-10-01",
    tz: "Asia/Shanghai", attendees: [], reminders: [],
    uid: "u@it-tool.eu.cc", dtstamp: "20261023T015927Z"
});
contains(allday, "DTSTART;VALUE=DATE:20261001", "全天事件 DTSTART;VALUE=DATE");
contains(allday, "DTEND;VALUE=DATE:20261002", "全天事件 DTEND 为次日（排他）");
ok(allday.indexOf("TZID") === -1, "全天事件不带 TZID");
ok(allday.indexOf("ATTENDEE") === -1, "无参会人 → 无 ATTENDEE");
ok(allday.indexOf("VALARM") === -1, "无提醒 → 无 VALARM");

/* ---------- 逗号分号转义进 SUMMARY ---------- */
var esc = mi.buildIcs({
    title: "评审会；A,B 项", allDay: false,
    startDate: "2026-10-24", startTime: "14:00", endDate: "2026-10-24", endTime: "15:00",
    tz: "Asia/Shanghai", attendees: [], reminders: [],
    uid: "u@it-tool.eu.cc", dtstamp: "20261023T015927Z"
});
contains(esc, "SUMMARY:" + mi.escapeText("评审会；A,B 项"), "SUMMARY 中 ; , 正确转义");

/* ---------- 表单校验 ---------- */
function baseValid() {
    return { title: "周会", allDay: false, startDate: "2026-10-24", startTime: "14:00",
        endDate: "2026-10-24", endTime: "15:00", attendeesText: "a@example.com" };
}
eq(Object.keys(mi.validateForm(baseValid())).length, 0, "合法表单 → 无错误");
ok(!!mi.validateForm(Object.assign(baseValid(), { title: "  " })).title,
    "空标题 → title 报错");
ok(!!mi.validateForm(Object.assign(baseValid(), { endTime: "14:00" })).endTime,
    "结束等于开始 → 报错");
ok(!!mi.validateForm(Object.assign(baseValid(), { endTime: "13:00" })).endTime,
    "结束早于开始 → 报错");
ok(!!mi.validateForm(Object.assign(baseValid(),
    { attendeesText: "a@example.com, bad-email" })).attendees,
    "邮箱非法 → attendees 报错并指出坏邮箱");
ok(mi.validateForm(Object.assign(baseValid(),
    { attendeesText: "a@example.com, bad-email" })).attendees.indexOf("bad-email") !== -1,
    "报错信息包含非法邮箱原文");
(function () {
    var e = mi.validateForm({ title: "假期", allDay: true, startDate: "2026-10-02",
        endDate: "2026-10-01", attendeesText: "" });
    ok(!!e.endDate, "全天事件结束日期早于开始日期 → 报错");
    var e2 = mi.validateForm({ title: "假期", allDay: true, startDate: "2026-10-01",
        endDate: "2026-10-01", attendeesText: "" });
    eq(Object.keys(e2).length, 0, "全天事件起止同日 → 通过");
})();

/* ---------- 源码零 fetch/XHR ---------- */
var src = fs.readFileSync(path.join(__dirname, "..", "static", "js", "meeting_invite_generator.js"), "utf8");
ok(!/fetch\s*\(/.test(src), "源码无 fetch(");
ok(!/XMLHttpRequest/.test(src), "源码无 XMLHttpRequest");
ok(!/navigator\.sendBeacon/.test(src), "源码无 sendBeacon");
ok(!/\$\.ajax/.test(src), "源码无 $.ajax");

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail ? 1 : 0);

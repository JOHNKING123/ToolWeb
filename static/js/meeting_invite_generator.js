/* 会议邀请 (.ics) 生成器 - 纯前端：表单 → RFC 5545 VCALENDAR/VEVENT → .ics 下载/复制
 * 零后端、零 fetch/XHR、零上传。核心规则：
 *   文本转义（\ ; , 换行 → \\ \; \, \n）、单行 75 字节折行（CRLF + 空格，不截断 UTF-8 多字节字符）、
 *   TZID 时区日期时间、VALARM 提醒（TRIGGER）、ATTENDEE 参会人、全天事件 VALUE=DATE。
 * Node 自测：require 本文件即可拿到纯函数。
 */
(function () {
'use strict';

/* ============ 配置 ============ */
var TIMEZONES = [
    { id: "Asia/Shanghai", label: "Asia/Shanghai（北京/上海/深圳）", def: true },
    { id: "Asia/Hong_Kong", label: "Asia/Hong_Kong（香港）" },
    { id: "Asia/Taipei", label: "Asia/Taipei（台北）" },
    { id: "Asia/Tokyo", label: "Asia/Tokyo（东京）" },
    { id: "Asia/Seoul", label: "Asia/Seoul（首尔）" },
    { id: "Asia/Singapore", label: "Asia/Singapore（新加坡）" },
    { id: "Europe/London", label: "Europe/London（伦敦）" },
    { id: "Europe/Berlin", label: "Europe/Berlin（柏林）" },
    { id: "Europe/Paris", label: "Europe/Paris（巴黎）" },
    { id: "America/New_York", label: "America/New_York（纽约）" },
    { id: "America/Chicago", label: "America/Chicago（芝加哥）" },
    { id: "America/Denver", label: "America/Denver（丹佛）" },
    { id: "America/Los_Angeles", label: "America/Los_Angeles（洛杉矶）" },
    { id: "Australia/Sydney", label: "Australia/Sydney（悉尼）" },
    { id: "UTC", label: "UTC（协调世界时）" }
];

var REMINDERS = [
    { id: "5m",  label: "开始前 5 分钟",  trigger: "-PT5M" },
    { id: "15m", label: "开始前 15 分钟", trigger: "-PT15M" },
    { id: "30m", label: "开始前 30 分钟", trigger: "-PT30M" },
    { id: "1h",  label: "开始前 1 小时",  trigger: "-PT1H" },
    { id: "1d",  label: "开始前 1 天",    trigger: "-P1D" }
];

/* ============ RFC 5545 文本处理（纯函数，可单测） ============ */

/* TEXT 类型转义：先反斜杠、后换行、再 ; 与 ,（RFC 5545 §3.3.11） */
function escapeText(s) {
    return String(s == null ? "" : s)
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
}

/* UTF-8 字节数（不依赖 TextEncoder，ES5 兼容） */
function utf8Bytes(s) {
    var bytes = 0, i, c;
    for (i = 0; i < s.length; i++) {
        c = s.charCodeAt(i);
        if (c < 0x80) {
            bytes += 1;
        } else if (c < 0x800) {
            bytes += 2;
        } else if (c >= 0xD800 && c <= 0xDBFF) {
            bytes += 4; i++; /* 代理对，按一个字符计 */
        } else {
            bytes += 3;
        }
    }
    return bytes;
}

/* 长内容行折行：每段 ≤75 字节（RFC 5545 §3.1），续行 CRLF + 1 空格，
 * 按字符边界切分，不截断 UTF-8 多字节字符；续行段内容 ≤74 字节。 */
function foldLine(line) {
    var out = "", cur = "", curBytes = 0, first = true;
    var i, code, ch, cb;
    for (i = 0; i < line.length; i++) {
        code = line.charCodeAt(i);
        if (code >= 0xD800 && code <= 0xDBFF && i + 1 < line.length) {
            ch = line.substr(i, 2); i++;
            cb = 4;
        } else {
            ch = line[i];
            cb = code < 0x80 ? 1 : (code < 0x800 ? 2 : 3);
        }
        var limit = first ? 75 : 74;
        if (curBytes + cb > limit && curBytes > 0) {
            out += cur + "\r\n ";
            first = false;
            cur = ""; curBytes = 0;
        }
        cur += ch; curBytes += cb;
    }
    out += cur;
    return out;
}

/* 邮箱格式校验（表单级，非 RFC 全集） */
function validateEmail(email) {
    return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(email).trim());
}

/* 参会人输入解析：按逗号/分号/换行切分，返回 {valid:[], invalid:[]} */
function parseAttendees(text) {
    var valid = [], invalid = [], seen = {};
    String(text == null ? "" : text).split(/[,;\r\n]+/).forEach(function (raw) {
        var e = raw.trim();
        if (!e) { return; }
        if (seen[e.toLowerCase()]) { return; } /* 去重 */
        seen[e.toLowerCase()] = true;
        if (validateEmail(e)) { valid.push(e); }
        else { invalid.push(e); }
    });
    return { valid: valid, invalid: invalid };
}

/* 本地日期+时间 → ICS 日期时间基本格式 "20261024T140000" */
function localToIcsDateTime(date, time) {
    return String(date).replace(/-/g, "") + "T" + String(time).replace(/:/g, "") + "00";
}

/* 本地日期 → ICS DATE 基本格式 "20261024" */
function localToIcsDate(date) {
    return String(date).replace(/-/g, "");
}

/* 日期 +n 天（YYYY-MM-DD 输入输出，全天事件 DTEND 用：DTEND 为排他性日期） */
function addDays(dateStr, n) {
    var parts = String(dateStr).split("-");
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    d.setDate(d.getDate() + n);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
}

/* UID 生成：随机十六进制 + @ 域名（opts.uid 可注入，测试用） */
function generateUid() {
    var hex = "", i;
    for (i = 0; i < 32; i++) {
        hex += "0123456789abcdef"[Math.floor(Math.random() * 16)];
    }
    return hex + "@it-tool.eu.cc";
}

/* DTSTAMP：UTC "20261023T175927Z"（opts.dtstamp 可注入，测试用） */
function formatDtStamp(d) {
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" +
        p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + "Z";
}

/* 下载文件名：标题 + 日期，过滤非法字符与首尾空白 */
function sanitizeFilename(title, date) {
    var t = String(title == null ? "" : title)
        .replace(/[\\/:*?"<>|\r\n\t]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!t) { t = "meeting"; }
    if (t.length > 60) { t = t.slice(0, 60); }
    var d = String(date == null ? "" : date).replace(/-/g, "");
    return t + "_" + d + ".ics";
}

/* 提醒 id → TRIGGER 字符串；未知 id 忽略 */
function triggerForReminder(id) {
    for (var i = 0; i < REMINDERS.length; i++) {
        if (REMINDERS[i].id === id) { return REMINDERS[i].trigger; }
    }
    return null;
}

/* ============ ICS 组装（纯函数，可单测） ============ */
/* opts: {title, allDay, startDate, startTime, endDate, endTime, tz, location,
 *        attendees:[email...], description, reminders:[id...], uid, dtstamp}
 * 返回完整 .ics 文本（CRLF 行分隔，尾部单 CRLF）。 */
function buildIcs(opts) {
    var lines = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//IT ToolBox//Meeting Invite Generator//CN");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH");
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + (opts.uid || generateUid()));
    lines.push("DTSTAMP:" + (opts.dtstamp || formatDtStamp(new Date())));
    lines.push("SEQUENCE:0");
    lines.push("STATUS:CONFIRMED");
    if (opts.allDay) {
        lines.push("DTSTART;VALUE=DATE:" + localToIcsDate(opts.startDate));
        lines.push("DTEND;VALUE=DATE:" + localToIcsDate(addDays(opts.endDate, 1)));
    } else {
        lines.push("DTSTART;TZID=" + opts.tz + ":" + localToIcsDateTime(opts.startDate, opts.startTime));
        lines.push("DTEND;TZID=" + opts.tz + ":" + localToIcsDateTime(opts.endDate, opts.endTime));
    }
    lines.push("SUMMARY:" + escapeText(opts.title));
    if (opts.location && String(opts.location).trim()) {
        lines.push("LOCATION:" + escapeText(opts.location));
    }
    if (opts.description && String(opts.description).trim()) {
        lines.push("DESCRIPTION:" + escapeText(opts.description));
    }
    (opts.attendees || []).forEach(function (email) {
        lines.push("ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:" + email);
    });
    (opts.reminders || []).forEach(function (rid) {
        var trigger = triggerForReminder(rid);
        if (!trigger) { return; }
        lines.push("BEGIN:VALARM");
        lines.push("TRIGGER:" + trigger);
        lines.push("ACTION:DISPLAY");
        lines.push("DESCRIPTION:" + escapeText("会议提醒：" + opts.title));
        lines.push("END:VALARM");
    });
    lines.push("END:VEVENT");
    lines.push("END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
}

/* ============ 表单校验（纯函数，可单测） ============ */
/* data: {title, allDay, startDate, startTime, endDate, endTime, attendeesText}
 * 返回 errors 对象：key 为字段名，value 为中文错误信息；空对象表示通过。 */
function validateForm(data) {
    var errors = {};
    if (!String(data.title == null ? "" : data.title).trim()) {
        errors.title = "请填写会议标题";
    }
    if (!data.startDate) { errors.startDate = "请选择开始日期"; }
    if (!data.endDate) { errors.endDate = "请选择结束日期"; }
    if (!data.allDay) {
        if (!data.startTime) { errors.startTime = "请选择开始时间"; }
        if (!data.endTime) { errors.endTime = "请选择结束时间"; }
    }
    if (data.startDate && data.endDate) {
        if (data.allDay) {
            if (data.endDate < data.startDate) {
                errors.endDate = "全天事件的结束日期不能早于开始日期";
            }
        } else if (data.startTime && data.endTime) {
            var s = data.startDate + "T" + data.startTime;
            var e = data.endDate + "T" + data.endTime;
            if (e <= s) {
                errors.endTime = "结束时间必须晚于开始时间";
            }
        }
    }
    var parsed = parseAttendees(data.attendeesText);
    if (parsed.invalid.length > 0) {
        errors.attendees = "邮箱格式不正确：" + parsed.invalid.slice(0, 3).join("、") +
            (parsed.invalid.length > 3 ? "（等 " + parsed.invalid.length + " 个）" : "");
    }
    return errors;
}

/* Node 导出纯函数 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        TIMEZONES: TIMEZONES,
        REMINDERS: REMINDERS,
        escapeText: escapeText,
        utf8Bytes: utf8Bytes,
        foldLine: foldLine,
        validateEmail: validateEmail,
        parseAttendees: parseAttendees,
        localToIcsDateTime: localToIcsDateTime,
        localToIcsDate: localToIcsDate,
        addDays: addDays,
        generateUid: generateUid,
        formatDtStamp: formatDtStamp,
        sanitizeFilename: sanitizeFilename,
        triggerForReminder: triggerForReminder,
        buildIcs: buildIcs,
        validateForm: validateForm
    };
}

/* ============ 浏览器交互 ============ */
if (typeof document !== "undefined") {
(function () {

function $(id) { return document.getElementById(id); }

var toastTimer = null;
function toast(msg, ok) {
    var el = $("mi-toast");
    el.textContent = msg;
    el.className = "mi-toast show " + (ok === false ? "fail" : ok === true ? "ok" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "mi-toast"; }, 3200);
}

/* 复制文本：优先 navigator.clipboard，降级 textarea+execCommand */
function copyText(text, cb) {
    function done(ok) { if (cb) { cb(ok); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
            fallbackCopy(text, done);
        });
        return;
    }
    fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
    try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        done(!!ok);
    } catch (e) { done(false); }
}

/* Blob 下载 */
function downloadBlob(filename, blob) {
    var url = (window.URL || window.webkitURL).createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        (window.URL || window.webkitURL).revokeObjectURL(url);
    }, 1500);
}

/* 收集表单 */
function collectForm() {
    var reminders = [];
    REMINDERS.forEach(function (r) {
        var box = $("mi-rem-" + r.id);
        if (box && box.checked) { reminders.push(r.id); }
    });
    return {
        title: $("mi-title").value,
        allDay: $("mi-allday").checked,
        startDate: $("mi-start-date").value,
        startTime: $("mi-start-time").value,
        endDate: $("mi-end-date").value,
        endTime: $("mi-end-time").value,
        tz: $("mi-tz").value,
        location: $("mi-location").value,
        attendeesText: $("mi-attendees").value,
        description: $("mi-desc").value,
        reminders: reminders
    };
}

var ERR_IDS = {
    title: "mi-err-title", startDate: "mi-err-start-date", startTime: "mi-err-start-time",
    endDate: "mi-err-end-date", endTime: "mi-err-end-time", attendees: "mi-err-attendees"
};

function showErrors(errors) {
    Object.keys(ERR_IDS).forEach(function (k) {
        $(ERR_IDS[k]).textContent = errors[k] || "";
    });
    return Object.keys(errors).length === 0;
}

var lastIcs = "";
var lastFilename = "";

function refresh() {
    var data = collectForm();
    /* 全天开关：隐藏/禁用时间输入 */
    var times = document.querySelectorAll(".mi-time-row");
    for (var i = 0; i < times.length; i++) {
        times[i].style.display = data.allDay ? "none" : "";
    }
    var errors = validateForm(data);
    var okForm = showErrors(errors);
    var parsed = parseAttendees(data.attendeesText);
    var opts = {
        title: data.title.trim(),
        allDay: data.allDay,
        startDate: data.startDate,
        startTime: data.startTime,
        endDate: data.endDate,
        endTime: data.endTime,
        tz: data.tz,
        location: data.location,
        attendees: parsed.valid,
        description: data.description,
        reminders: data.reminders
    };
    if (okForm) {
        lastIcs = buildIcs(opts);
        lastFilename = sanitizeFilename(data.title.trim(), data.startDate);
    } else {
        lastIcs = "";
        lastFilename = "";
    }
    $("mi-preview").value = lastIcs;
    $("mi-download").disabled = !okForm;
    $("mi-copy").disabled = !okForm;
}

document.addEventListener("DOMContentLoaded", function () {
    var wrap = document.querySelector(".mi-wrap");
    if (!wrap) { return; }

    /* 时区下拉 */
    var tzSel = $("mi-tz");
    var thtml = "";
    TIMEZONES.forEach(function (tz) {
        thtml += '<option value="' + tz.id + '"' + (tz.def ? " selected" : "") + '>' + tz.label + "</option>";
    });
    tzSel.innerHTML = thtml;

    /* 提醒多选 */
    var rhtml = "";
    REMINDERS.forEach(function (r) {
        rhtml += '<label class="mi-check"><input type="checkbox" id="mi-rem-' + r.id + '"' +
            (r.id === "15m" ? " checked" : "") + '> ' + r.label + "</label>";
    });
    $("mi-reminders").innerHTML = rhtml;

    /* 今日日期预填 */
    var today = new Date();
    var tstr = today.getFullYear() + "-" +
        (today.getMonth() + 1 < 10 ? "0" : "") + (today.getMonth() + 1) + "-" +
        (today.getDate() < 10 ? "0" : "") + today.getDate();
    if (!$("mi-start-date").value) { $("mi-start-date").value = tstr; }
    if (!$("mi-end-date").value) { $("mi-end-date").value = tstr; }

    /* 事件：输入即实时生成+校验 */
    wrap.addEventListener("input", refresh);
    wrap.addEventListener("change", refresh);
    $("mi-sample").addEventListener("click", function () {
        $("mi-title").value = "产品周会";
        $("mi-allday").checked = false;
        $("mi-start-date").value = "2026-10-24";
        $("mi-start-time").value = "14:00";
        $("mi-end-date").value = "2026-10-24";
        $("mi-end-time").value = "15:00";
        $("mi-tz").value = "Asia/Shanghai";
        $("mi-location").value = "3 楼会议室 A";
        $("mi-attendees").value = "zhangsan@example.com\nlisi@example.com";
        $("mi-desc").value = "本周迭代复盘，下周排期。";
        REMINDERS.forEach(function (r) {
            $("mi-rem-" + r.id).checked = (r.id === "15m");
        });
        refresh();
        toast("✅ 已填入示例", true);
    });

    $("mi-download").addEventListener("click", function () {
        if (!lastIcs) { return; }
        downloadBlob(lastFilename,
            new Blob(["\ufeff" + lastIcs], { type: "text/calendar;charset=utf-8" }));
        toast("✅ " + lastFilename + " 已开始下载", true);
    });

    $("mi-copy").addEventListener("click", function () {
        if (!lastIcs) { return; }
        copyText(lastIcs, function (ok) {
            toast(ok ? "✅ .ics 文本已复制" : "❌ 复制失败，请手动选择复制", ok);
        });
    });

    refresh();
});

})();

} /* typeof document !== "undefined" */
})();

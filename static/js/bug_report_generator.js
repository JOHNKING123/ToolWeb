/* Bug 报告生成器（bug_report_generator）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/bug_report_generator.test.js 自测；
 * 浏览器端：window.BugReportGenerator 全局 + DOM 装配（本文件末尾）。
 *
 * 生成规则（确定性字符串拼接）：
 * - 标题行 `# [Bug] {标题}`，标题先去行首行尾空白；
 * - 环境三项各一行 `- 操作系统：{值}`／`- 浏览器／客户端：{值}`／`- 应用版本：{值}`，
 *   空项渲染为 `未填写`；
 * - 复现步骤按行切分、每行去行首行尾空白、空行丢弃、剩余行按 1. 2. 3. 顺序编号；
 * - 预期结果／实际结果空值渲染为 `未填写`；严重度为所选档位单行；
 * - 补充信息空值渲染为 `无`；节与节之间空一行；全文不含行首／行尾空格；
 * - 用户填写内容原样进入文本（不改写、不翻译、不做 Markdown 转义），
 *   浏览器展示用 textContent 插值，杜绝注入。
 *
 * 真限制：只生成报告文本、不提交到任何 issue 系统、不做缺陷跟踪、
 * 不验证缺陷真实性、Markdown 仅为通用模板口径。
 * 零网络请求：纯本地处理，不发起任何网络请求。
 */
(function () {
"use strict";

var SEVERITIES = ["致命", "严重", "一般", "轻微"];
var DEFAULT_SEVERITY = "一般";

var SAMPLE = {
    title: "登录页密码错误时错误提示不消失",
    os: "Windows 11",
    browser: "Chrome 130",
    version: "v2.4.1",
    steps: "打开登录页\n输入错误密码点登录\n\n点击登录按钮\n查看错误提示",
    expected: "显示一次错误提示，修正输入后提示消失",
    actual: "提示一直残留，遮挡登录按钮",
    severity: "一般",
    extra: "仅在 Chrome 复现，Edge 未复现"
};

/* 去行首行尾空白；非字符串视为 ""。 */
function trimValue(v) {
    return typeof v === "string" ? v.replace(/^\s+|\s+$/g, "") : "";
}

/* 严重度归一化：非法档位回落默认档位。 */
function normalizeSeverity(v) {
    return SEVERITIES.indexOf(v) !== -1 ? v : DEFAULT_SEVERITY;
}

/* 复现步骤：按行切分、每行去空白、空行丢弃。 */
function parseSteps(text) {
    if (typeof text !== "string") return [];
    var out = [];
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var line = trimValue(lines[i]);
        if (line !== "") out.push(line);
    }
    return out;
}

/* 构建报告文本（不做有效性校验；空标题时标题行不带尾随空格）。 */
function buildBugReport(fields) {
    fields = fields || {};
    var title = trimValue(fields.title);
    var steps = parseSteps(fields.steps);
    var numbered = [];
    for (var i = 0; i < steps.length; i++) {
        numbered.push((i + 1) + ". " + steps[i]);
    }
    function envLine(label, v) {
        var val = trimValue(v);
        return "- " + label + "：" + (val === "" ? "未填写" : val);
    }
    function orMissing(v) {
        var val = trimValue(v);
        return val === "" ? "未填写" : val;
    }
    var extra = trimValue(fields.extra);
    var sections = [];
    sections.push(title === "" ? "# [Bug]" : "# [Bug] " + title);
    sections.push("## 环境\n" + envLine("操作系统", fields.os) + "\n" +
        envLine("浏览器／客户端", fields.browser) + "\n" +
        envLine("应用版本", fields.version));
    sections.push("## 复现步骤\n" + numbered.join("\n"));
    sections.push("## 预期结果\n" + orMissing(fields.expected));
    sections.push("## 实际结果\n" + orMissing(fields.actual));
    sections.push("## 严重度\n" + normalizeSeverity(fields.severity));
    sections.push("## 补充信息\n" + (extra === "" ? "无" : extra));
    return sections.join("\n\n");
}

/* 有效性校验：空标题 -> 请填写缺陷标题；标题非空但步骤为空 -> 请填写至少一步复现步骤。 */
function validateBugReport(fields) {
    fields = fields || {};
    if (trimValue(fields.title) === "") {
        return { ok: false, error: "请填写缺陷标题", output: "" };
    }
    if (parseSteps(fields.steps).length === 0) {
        return { ok: false, error: "请填写至少一步复现步骤", output: "" };
    }
    return { ok: true, error: "", output: buildBugReport(fields) };
}

var api = {
    SEVERITIES: SEVERITIES,
    DEFAULT_SEVERITY: DEFAULT_SEVERITY,
    SAMPLE: SAMPLE,
    trimValue: trimValue,
    normalizeSeverity: normalizeSeverity,
    parseSteps: parseSteps,
    buildBugReport: buildBugReport,
    validateBugReport: validateBugReport
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
}
if (typeof window !== "undefined") {
    window.BugReportGenerator = api;
}

/* ================= 浏览器 DOM 装配（仅浏览器分支执行） ================= */
if (typeof document !== "undefined" && typeof window !== "undefined") {
    function $(id) { return document.getElementById(id); }
    var lastOutput = "";

    function readFields() {
        var severity = DEFAULT_SEVERITY;
        var radios = document.querySelectorAll('input[name="br-severity"]');
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) severity = radios[i].value;
        }
        return {
            title: $("br-title") ? $("br-title").value : "",
            os: $("br-os") ? $("br-os").value : "",
            browser: $("br-browser") ? $("br-browser").value : "",
            version: $("br-version") ? $("br-version").value : "",
            steps: $("br-steps") ? $("br-steps").value : "",
            expected: $("br-expected") ? $("br-expected").value : "",
            actual: $("br-actual") ? $("br-actual").value : "",
            severity: severity,
            extra: $("br-extra") ? $("br-extra").value : ""
        };
    }

    function render() {
        var result = $("br-result"), msg = $("br-msg");
        if (!result) return;
        var res = validateBugReport(readFields());
        if (!res.ok) {
            result.textContent = "";
            lastOutput = "";
            if (msg) { msg.textContent = res.error; msg.className = "br-msg br-msg-error"; }
            return;
        }
        result.textContent = res.output;
        lastOutput = res.output;
        if (msg) { msg.textContent = "已生成缺陷报告，可复制或下载 bug-report.md"; msg.className = "br-msg br-msg-ok"; }
    }

    function copyResult() {
        var msg = $("br-msg");
        if (!lastOutput) {
            var err = validateBugReport(readFields()).error;
            if (msg) {
                msg.textContent = err || "没有可复制的结果：请先填写缺陷标题与复现步骤";
                msg.className = "br-msg br-msg-error";
            }
            return;
        }
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = lastOutput;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            if (msg) {
                if (ok) { msg.textContent = "已复制缺陷报告"; msg.className = "br-msg br-msg-ok"; }
                else { msg.textContent = "复制失败：浏览器未授权剪贴板，请手动全选结果区复制"; msg.className = "br-msg br-msg-error"; }
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lastOutput).then(function () {
                if (msg) { msg.textContent = "已复制缺陷报告"; msg.className = "br-msg br-msg-ok"; }
            }, fallback);
        } else {
            fallback();
        }
    }

    function downloadResult() {
        var msg = $("br-msg");
        if (!lastOutput) {
            var err = validateBugReport(readFields()).error;
            if (msg) {
                msg.textContent = err || "没有可下载的结果：请先填写缺陷标题与复现步骤";
                msg.className = "br-msg br-msg-error";
            }
            return;
        }
        try {
            var blob = new Blob([lastOutput], { type: "text/markdown;charset=utf-8" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "bug-report.md";
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            if (msg) { msg.textContent = "已下载 bug-report.md"; msg.className = "br-msg br-msg-ok"; }
        } catch (e) {
            if (msg) { msg.textContent = "下载失败：浏览器不支持文件导出，请换浏览器重试"; msg.className = "br-msg br-msg-error"; }
        }
    }

    function writeFields(f) {
        if ($("br-title")) $("br-title").value = f.title;
        if ($("br-os")) $("br-os").value = f.os;
        if ($("br-browser")) $("br-browser").value = f.browser;
        if ($("br-version")) $("br-version").value = f.version;
        if ($("br-steps")) $("br-steps").value = f.steps;
        if ($("br-expected")) $("br-expected").value = f.expected;
        if ($("br-actual")) $("br-actual").value = f.actual;
        if ($("br-extra")) $("br-extra").value = f.extra;
        var radios = document.querySelectorAll('input[name="br-severity"]');
        for (var i = 0; i < radios.length; i++) {
            radios[i].checked = (radios[i].value === f.severity);
        }
    }

    function bind(id, evt, fn) {
        var el = $(id);
        if (el) el.addEventListener(evt, fn);
    }
    var fieldIds = ["br-title", "br-os", "br-browser", "br-version", "br-steps", "br-expected", "br-actual", "br-extra"];
    for (var k = 0; k < fieldIds.length; k++) bind(fieldIds[k], "input", render);
    var sevRadios = document.querySelectorAll('input[name="br-severity"]');
    for (var r = 0; r < sevRadios.length; r++) sevRadios[r].addEventListener("change", render);
    bind("br-copy", "click", copyResult);
    bind("br-download", "click", downloadResult);
    bind("br-sample", "click", function () { writeFields(SAMPLE); render(); });
    bind("br-clear", "click", function () {
        writeFields({ title: "", os: "", browser: "", version: "", steps: "", expected: "", actual: "", severity: DEFAULT_SEVERITY, extra: "" });
        render();
    });
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render);
    } else {
        render();
    }
}
})();

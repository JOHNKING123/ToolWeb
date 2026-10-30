/* 结构化提示词构建器（prompt_builder）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/prompt_builder.test.js 自测；
 * 浏览器端：window.PromptBuilder 全局 + DOM 装配（本文件末尾）。
 *
 * 口径（规格见 2026-10-31 前端开发轮任务单）：
 * - 七节表单：角色 / 任务 / 上下文 / 约束（增删行） / 输出格式 / 示例（增删行） / 待处理输入；
 * - escapeXml(value)：& < > " ' 转义为 XML 实体；
 * - buildSystemPrompt(data)：data = {role, task, context, constraints:[], format, examples:[], input}
 *   → XML 结构化系统提示词；空节（trim 后为空）自动省略；全空 → "<system-prompt>\n</system-prompt>"；
 * - buildDownloadName(date?)：→ "system-prompt-YYYYMMDD-HHmm.xml"；
 * - PRESETS：3 组一键预设（code-review / en-translate / xiaohongshu）；
 * - 错误约定：非法参数抛 Error，err.field 为字段名（顶层坏 → "data"/"value"/"date"，
 *   某节坏 → 该节名 role/task/context/constraints/format/examples/input）。
 * 零 fetch/XHR：纯本地生成，不发起任何网络请求。
 */
(function () {
"use strict";

/* ================= 1. 错误与类型 ================= */

function promptError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v) &&
        Object.prototype.toString.call(v) === "[object Object]";
}

function trimStr(v) {
    return String(v).replace(/^\s+|\s+$/g, "");
}

/* ================= 2. 纯函数 ================= */

/* XML 转义：& < > " ' → 实体 */
function escapeXml(value) {
    if (typeof value !== "string") {
        throw promptError("value", "escapeXml 参数必须是字符串");
    }
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function strSection(data, name) {
    var v = data[name];
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") {
        throw promptError(name, "字段 " + name + " 必须是字符串");
    }
    return trimStr(v);
}

function listSection(data, name) {
    var v = data[name];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
        throw promptError(name, "字段 " + name + " 必须是字符串数组");
    }
    var out = [];
    for (var i = 0; i < v.length; i++) {
        if (typeof v[i] !== "string") {
            throw promptError(name, "字段 " + name + " 的第 " + (i + 1) + " 项必须是字符串");
        }
        var t = trimStr(v[i]);
        if (t) out.push(t);
    }
    return out;
}

/* data → XML 结构化系统提示词；空节自动省略 */
function buildSystemPrompt(data) {
    if (!isPlainObject(data)) {
        throw promptError("data", "data 必须是对象：{role/task/context/constraints/format/examples/input}");
    }
    var role = strSection(data, "role");
    var task = strSection(data, "task");
    var context = strSection(data, "context");
    var constraints = listSection(data, "constraints");
    var format = strSection(data, "format");
    var examples = listSection(data, "examples");
    var input = strSection(data, "input");

    var lines = ["<system-prompt>"];
    if (role) lines.push("  <role>" + escapeXml(role) + "</role>");
    if (task) lines.push("  <task>" + escapeXml(task) + "</task>");
    if (context) lines.push("  <context>" + escapeXml(context) + "</context>");
    if (constraints.length > 0) {
        lines.push("  <constraints>");
        constraints.forEach(function (c) {
            lines.push("    <constraint>" + escapeXml(c) + "</constraint>");
        });
        lines.push("  </constraints>");
    }
    if (format) lines.push("  <output-format>" + escapeXml(format) + "</output-format>");
    if (examples.length > 0) {
        lines.push("  <examples>");
        examples.forEach(function (e, i) {
            lines.push("    <example n=\"" + (i + 1) + "\">" + escapeXml(e) + "</example>");
        });
        lines.push("  </examples>");
    }
    if (input) lines.push("  <input>" + escapeXml(input) + "</input>");
    lines.push("</system-prompt>");
    return lines.join("\n");
}

function pad2(n) {
    return (n < 10 ? "0" : "") + n;
}

/* 下载文件名：system-prompt-YYYYMMDD-HHmm.xml（date 可选，默认当前时间） */
function buildDownloadName(date) {
    var d = (date === undefined || date === null) ? new Date() : date;
    if (!(d instanceof Date) || isNaN(d.getTime())) {
        throw promptError("date", "date 必须是合法的 Date 对象");
    }
    return "system-prompt-" +
        d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "-" +
        pad2(d.getHours()) + pad2(d.getMinutes()) + ".xml";
}

/* ================= 3. 三组一键预设 ================= */

var PRESETS = [
    {
        id: "code-review",
        label: "代码评审",
        desc: "四维度代码评审：正确性/可读性/性能/安全性，标注严重程度",
        data: {
            role: "你是一名资深代码评审专家，拥有 10 年后端开发与架构评审经验，熟悉 Go、Python、Java 常见陷阱与最佳实践",
            task: "评审我给出的代码，从正确性、可读性、性能、安全性四个维度逐项指出问题，并给出可直接落地的修改建议",
            context: "",
            constraints: [
                "只评审代码本身，不评价作者",
                "每条问题标注严重程度：致命 / 重要 / 建议",
                "用中文回答，先给总体评价再逐条展开",
                "没有发现问题时明确说明，不要硬挑毛病"
            ],
            format: "Markdown：先一段总体评价，再逐条按「严重程度｜位置｜问题｜修改建议」列出，最后给出关键代码的修改后片段",
            examples: [],
            input: ""
        }
    },
    {
        id: "en-translate",
        label: "英文翻译",
        desc: "中文译英文：本地化表达，术语与代码标识符不动",
        data: {
            role: "你是一名资深中英翻译，擅长技术文档与商务文案的本地化表达，译文自然地道、符合英语母语者阅读习惯",
            task: "把我给出的中文翻译成英文",
            context: "",
            constraints: [
                "保持原文语气与专业术语一致",
                "专有名词、代码标识符、URL、数字不翻译，原样保留",
                "只输出译文，不加解释、不加寒暄"
            ],
            format: "纯文本译文，段落与原文一一对应",
            examples: [],
            input: ""
        }
    },
    {
        id: "xiaohongshu",
        label: "小红书文案",
        desc: "种草文案：20 字内标题＋口语化正文＋话题标签",
        data: {
            role: "你是一名小红书爆款文案策划，熟悉平台调性与流量机制，擅长写出有真实体验感的种草文案",
            task: "根据我给出的产品或主题，写一篇小红书种草文案",
            context: "",
            constraints: [
                "标题不超过 20 字，带 1-2 个 emoji，要有点击欲",
                "正文 300-500 字，口语化、有真实体验感，分段加小标题",
                "结尾加 3-5 个相关话题标签",
                "不出现「最」「第一」「国家级」等广告法敏感词"
            ],
            format: "三段式：标题一行 → 正文（分段小标题）→ 话题标签一行",
            examples: [],
            input: ""
        }
    }
];

var api = {
    escapeXml: escapeXml,
    buildSystemPrompt: buildSystemPrompt,
    buildDownloadName: buildDownloadName,
    PRESETS: PRESETS
};

if (typeof module!== "undefined" && module.exports) {
module.exports = api;
}
if (typeof window!== "undefined") {
window.PromptBuilder = api;
}

/* ================= 4. 浏览器 DOM 装配 ================= */

function $(id) { return document.getElementById(id); }

/* state 与 buildSystemPrompt(data) 的 data 同构，可直接编辑 */
var state = {
    role: "",
    task: "",
    context: "",
    constraints: [""],
    format: "",
    examples: [""],
    input: ""
};

function setMsg(text, isError) {
    var m = $("pb-msg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "pb-msg" + (isError ? " pb-msg-error" : "");
}

function filledSections() {
    var n = 0;
    if (trimStr(state.role)) n++;
    if (trimStr(state.task)) n++;
    if (trimStr(state.context)) n++;
    if (state.constraints.some(function (c) { return trimStr(c); })) n++;
    if (trimStr(state.format)) n++;
    if (state.examples.some(function (e) { return trimStr(e); })) n++;
    if (trimStr(state.input)) n++;
    return n;
}

/* state → 可直接传给 buildSystemPrompt 的 data（原样透传，空值由纯函数省略） */
function currentData() {
    return {
        role: state.role,
        task: state.task,
        context: state.context,
        constraints: state.constraints.slice(),
        format: state.format,
        examples: state.examples.slice(),
        input: state.input
    };
}

function render() {
    var n = filledSections();
    var out = $("pb-output");
    if (!out) return;
    if (n === 0) {
        out.textContent = "（请在上方表单填写至少一节，XML 系统提示词将在这里实时生成；留空的节会自动省略）";
        setMsg("七节表单：角色 / 任务 / 上下文 / 约束 / 输出格式 / 示例 / 待处理输入，填多少生成多少。");
        return;
    }
    try {
        out.textContent = buildSystemPrompt(currentData());
        setMsg("已生成 " + n + " / 7 节。空节已自动省略，可一键复制或下载 .xml。");
    } catch (e) {
        setMsg("生成失败：" + e.message, true);
    }
}

function syncStaticInputs() {
    var map = { "pb-role": "role", "pb-task": "task", "pb-context": "context", "pb-format": "format", "pb-input": "input" };
    Object.keys(map).forEach(function (id) {
        var el = $(id);
        if (el) el.value = state[map[id]];
    });
}

function renderRows() {
    var cHost = $("pb-constraints");
    if (cHost) {
        cHost.innerHTML = "";
        state.constraints.forEach(function (c, i) {
            var row = document.createElement("div");
            row.className = "pb-row";
            var inp = document.createElement("input");
            inp.type = "text";
            inp.placeholder = "如：用中文回答；输出不超过 500 字";
            inp.value = c;
            inp.setAttribute("aria-label", "约束条件第 " + (i + 1) + " 条");
            inp.addEventListener("input", function () { state.constraints[i] = inp.value; render(); });
            var rm = document.createElement("button");
            rm.type = "button";
            rm.className = "pb-rm";
            rm.title = "删除该约束";
            rm.textContent = "✕";
            rm.addEventListener("click", function () {
                state.constraints.splice(i, 1);
                if (state.constraints.length === 0) state.constraints.push("");
                renderRows(); render();
            });
            row.appendChild(inp);
            row.appendChild(rm);
            cHost.appendChild(row);
        });
    }
    var eHost = $("pb-examples");
    if (eHost) {
        eHost.innerHTML = "";
        state.examples.forEach(function (e, i) {
            var row = document.createElement("div");
            row.className = "pb-row";
            var ta = document.createElement("textarea");
            ta.rows = 2;
            ta.placeholder = "写一条示例，如：输入：… / 输出：…（Few-Shot 示例）";
            ta.value = e;
            ta.setAttribute("aria-label", "示例第 " + (i + 1) + " 条");
            ta.addEventListener("input", function () { state.examples[i] = ta.value; render(); });
            var rm = document.createElement("button");
            rm.type = "button";
            rm.className = "pb-rm";
            rm.title = "删除该示例";
            rm.textContent = "✕";
            rm.addEventListener("click", function () {
                state.examples.splice(i, 1);
                if (state.examples.length === 0) state.examples.push("");
                renderRows(); render();
            });
            row.appendChild(ta);
            row.appendChild(rm);
            eHost.appendChild(row);
        });
    }
}

function applyPreset(p) {
    state.role = p.data.role || "";
    state.task = p.data.task || "";
    state.context = p.data.context || "";
    state.constraints = (p.data.constraints && p.data.constraints.length > 0) ? p.data.constraints.slice() : [""];
    state.format = p.data.format || "";
    state.examples = (p.data.examples && p.data.examples.length > 0) ? p.data.examples.slice() : [""];
    state.input = p.data.input || "";
    syncStaticInputs();
    renderRows();
    render();
    setMsg("已应用预设「" + p.label + "」：可继续修改，实时重新生成。");
}

function clearAll() {
    state.role = ""; state.task = ""; state.context = "";
    state.constraints = [""]; state.format = ""; state.examples = [""]; state.input = "";
    syncStaticInputs();
    renderRows();
    render();
    setMsg("已清空表单。");
}

function buildPresetRow() {
    var host = $("pb-presets");
    if (!host) return;
    PRESETS.forEach(function (p) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "pb-btn";
        b.title = p.desc;
        b.textContent = p.label;
        b.addEventListener("click", function () { applyPreset(p); });
        host.appendChild(b);
    });
    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "pb-btn";
    clear.textContent = "清空表单";
    clear.addEventListener("click", clearAll);
    host.appendChild(clear);
}

function copyText(text, doneMsg) {
    function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var okc = false;
        try { okc = document.execCommand("copy"); } catch (e) { okc = false; }
        document.body.removeChild(ta);
        setMsg(okc ? doneMsg : "复制失败：请手动选中输出框复制。", !okc);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
            function () { setMsg(doneMsg); },
            function () { fallback(); }
        );
    } else {
        fallback();
    }
}

function init() {
    if (typeof document === "undefined") return;
    if (!$("pb-role") || !$("pb-output")) return; /* 非本工具页 */
    var map = { "pb-role": "role", "pb-task": "task", "pb-context": "context", "pb-format": "format", "pb-input": "input" };
    Object.keys(map).forEach(function (id) {
        var el = $(id);
        var key = map[id];
        el.addEventListener("input", function () { state[key] = el.value; render(); });
    });
    var ac = $("pb-add-constraint");
    if (ac) ac.addEventListener("click", function () { state.constraints.push(""); renderRows(); render(); });
    var ae = $("pb-add-example");
    if (ae) ae.addEventListener("click", function () { state.examples.push(""); renderRows(); render(); });
    buildPresetRow();
    renderRows();
    var cp = $("pb-copy");
    if (cp) cp.addEventListener("click", function () {
        var t = $("pb-output").textContent;
        if (!t || t.charAt(0) === "（") { setMsg("暂无可复制的内容：请先填写至少一节。", true); return; }
        copyText(t, "XML 系统提示词已复制。");
    });
    var dl = $("pb-download");
    if (dl) dl.addEventListener("click", function () {
        var t = $("pb-output").textContent;
        if (!t || t.charAt(0) === "（") { setMsg("暂无可下载的内容：请先填写至少一节。", true); return; }
        var blob = new Blob([t], { type: "application/xml;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = buildDownloadName(new Date());
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        setMsg("已开始下载 " + a.download + "。");
    });
    render();
}

if (typeof document!== "undefined") {
if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", init);
} else {
init();
}
}

})();

/* CSP 安全头生成器（csp_builder）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/csp_builder.test.js 自测；
 * 浏览器端：window.CspBuilder 全局 + DOM 装配（本文件末尾）。
 *
 * 口径（规格见 2026-10-30 前端开发轮任务单）：
 * - 指令表 DIRECTIVES：16 条常用 CSP 指令（中文标签＋快捷关键字）；
 * - buildCspValue(directives)：{指令名: [源...]} → "default-src 'self'; script-src ..."，
 *   空源数组的指令被忽略；{} / 全空 → ""；
 * - buildCspHeader(directives, {reportOnly}) → {name, value}，
 *   reportOnly=true 时头名为 Content-Security-Policy-Report-Only；
 * - buildMetaTag(value)：<meta http-equiv="Content-Security-Policy" content="...">，
 *   双引号转义为 &quot;（单引号不动）；
 * - parseSourceList(text)：按空白/逗号切分、去空；
 * - 错误约定：非法参数抛 Error，err.field 为字段名（顶层参数坏 → "directives"/"value"/"text"/"options"，
 *   某指令的源列表坏 → 该指令名）。
 * 零 fetch/XHR：纯本地生成，不发起任何网络请求。
 */
(function () {
"use strict";

/* ================= 1. 指令表与三组预设 ================= */

/* keywords 顺序即界面展示与预设解析顺序 */
var DIRECTIVES = [
    { name: "default-src",     cn: "默认源（兜底）",          keywords: ["'self'", "'none'"] },
    { name: "script-src",      cn: "脚本",                    keywords: ["'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'", "'wasm-unsafe-eval'"] },
    { name: "style-src",       cn: "样式",                    keywords: ["'self'", "'none'", "'unsafe-inline'"] },
    { name: "img-src",         cn: "图片",                    keywords: ["'self'", "'none'", "data:", "blob:", "https:"] },
    { name: "connect-src",     cn: "网络请求（fetch/XHR/WS）", keywords: ["'self'", "'none'"] },
    { name: "font-src",        cn: "字体",                    keywords: ["'self'", "'none'", "data:", "https:"] },
    { name: "media-src",       cn: "音频视频",                keywords: ["'self'", "'none'"] },
    { name: "object-src",      cn: "插件（object/embed）",    keywords: ["'self'", "'none'"] },
    { name: "frame-src",       cn: "内嵌 frame",              keywords: ["'self'", "'none'"] },
    { name: "child-src",       cn: "worker/frame（旧口径）",  keywords: ["'self'", "'none'"] },
    { name: "worker-src",      cn: "Worker",                  keywords: ["'self'", "'none'"] },
    { name: "manifest-src",    cn: "Web App Manifest",        keywords: ["'self'", "'none'"] },
    { name: "form-action",     cn: "表单提交目标",            keywords: ["'self'", "'none'"] },
    { name: "frame-ancestors", cn: "允许嵌入本页的父级",      keywords: ["'self'", "'none'"] },
    { name: "base-uri",        cn: "<base> 标签限制",         keywords: ["'self'", "'none'"] },
    { name: "navigate-to",     cn: "导航跳转目标",            keywords: ["'self'", "'none'"] }
];

var PRESETS = [
    {
        id: "strict",
        label: "严格默认",
        desc: "默认同源、插件禁用、表单与嵌入同源",
        reportOnly: false,
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'"],
            "object-src": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
            "frame-ancestors": ["'self'"]
        }
    },
    {
        id: "cdn",
        label: "CDN 博客/文档站",
        desc: "jsDelivr CDN ＋ data:/https: 图片字体",
        reportOnly: false,
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "https://cdn.jsdelivr.net"],
            "style-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "https:"],
            "font-src": ["'self'", "data:", "https:"],
            "connect-src": ["'self'"],
            "frame-ancestors": ["'none'"]
        }
    },
    {
        id: "report",
        label: "报告调试",
        desc: "Report-Only 测试模式 ＋ report-uri 上报",
        reportOnly: true,
        directives: {
            "default-src": ["'self'"],
            "report-uri": ["/csp-violation-report-endpoint"]
        }
    }
];

/* ================= 2. 纯函数 ================= */

function cspError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v) &&
        Object.prototype.toString.call(v) === "[object Object]";
}

/* directives: {指令名: [源, ...]} → "default-src 'self'; script-src 'self' https://cdn.example.com" */
function buildCspValue(directives) {
    if (!isPlainObject(directives)) {
        throw cspError("directives", "directives 必须是一个对象：{指令名: [源, ...]}");
    }
    var parts = [];
    var names = Object.keys(directives);
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var srcs = directives[name];
        if (!Array.isArray(srcs)) {
            throw cspError(name, "指令 " + name + " 的源必须是数组");
        }
        var clean = [];
        for (var j = 0; j < srcs.length; j++) {
            var s = srcs[j];
            if (typeof s !== "string") {
                throw cspError(name, "指令 " + name + " 的源必须是非空字符串");
            }
            var t = s.replace(/^\s+|\s+$/g, "");
            if (!t) {
                throw cspError(name, "指令 " + name + " 的源必须是非空字符串");
            }
            clean.push(t);
        }
        if (clean.length === 0) continue; /* 空源数组的指令被忽略 */
        parts.push(name + " " + clean.join(" "));
    }
    return parts.join("; ");
}

/* → {name: "Content-Security-Policy" | "Content-Security-Policy-Report-Only", value} */
function buildCspHeader(directives, options) {
    if (options !== undefined && options !== null && !isPlainObject(options)) {
        throw cspError("options", "options 必须是对象：{reportOnly?: boolean}");
    }
    var value = buildCspValue(directives); /* 校验 directives，错误 field 透出 */
    var reportOnly = !!(options && options.reportOnly);
    return {
        name: reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
        value: value
    };
}

/* → <meta http-equiv="Content-Security-Policy" content="...">（双引号转义为 &quot;） */
function buildMetaTag(value) {
    if (typeof value !== "string") {
        throw cspError("value", "value 必须是字符串");
    }
    return '<meta http-equiv="Content-Security-Policy" content="' +
        value.replace(/"/g, "&quot;") + '">';
}

/* 按空白/逗号切分源列表并去空；"" → [] */
function parseSourceList(text) {
    if (typeof text !== "string") {
        throw cspError("text", "text 必须是字符串");
    }
    return text.split(/[\s,]+/).filter(function (t) { return t.length > 0; });
}

var api = {
    DIRECTIVES: DIRECTIVES,
    PRESETS: PRESETS,
    buildCspValue: buildCspValue,
    buildCspHeader: buildCspHeader,
    buildMetaTag: buildMetaTag,
    parseSourceList: parseSourceList
};

if (typeof module!== "undefined" && module.exports) {
module.exports = api;
}
if (typeof window!== "undefined") {
window.CspBuilder = api;
}

/* ================= 3. 浏览器 DOM 装配 ================= */

function $(id) { return document.getElementById(id); }

/* 指令名 → {row, check, custom, kwWrap}；关键字选中态单独记 */
var rowRefs = {};
var kwActive = {};

function buildDirectiveRows() {
    var host = $("csb-dirs");
    if (!host) return;
    DIRECTIVES.forEach(function (d) {
        kwActive[d.name] = {};
        var row = document.createElement("div");
        row.className = "csb-dir";
        row.setAttribute("data-name", d.name);

        var head = document.createElement("label");
        head.className = "csb-dir-head";
        var check = document.createElement("input");
        check.type = "checkbox";
        check.className = "csb-dir-check";
        check.addEventListener("change", render);
        var code = document.createElement("code");
        code.className = "csb-dir-name";
        code.textContent = d.name;
        var cn = document.createElement("span");
        cn.className = "csb-dir-cn";
        cn.textContent = d.cn;
        head.appendChild(check);
        head.appendChild(code);
        head.appendChild(cn);

        var kwWrap = document.createElement("div");
        kwWrap.className = "csb-kws";
        d.keywords.forEach(function (k) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "csb-kw";
            b.textContent = k;
            b.setAttribute("data-kw", k);
            b.addEventListener("click", function () {
                if (kwActive[d.name][k]) {
                    delete kwActive[d.name][k];
                    b.classList.remove("active");
                } else {
                    kwActive[d.name][k] = true;
                    b.classList.add("active");
                    if (!check.checked) { check.checked = true; }
                }
                render();
            });
            kwWrap.appendChild(b);
        });

        var custom = document.createElement("input");
        custom.type = "text";
        custom.className = "csb-custom";
        custom.placeholder = "自定义源（空格/逗号/换行分隔），如 https://cdn.example.com";
        custom.addEventListener("input", render);

        row.appendChild(head);
        row.appendChild(kwWrap);
        row.appendChild(custom);
        host.appendChild(row);
        rowRefs[d.name] = { row: row, check: check, custom: custom, kwWrap: kwWrap };
    });
}

/* 从界面收集 directives 对象：指令表顺序 → report-uri → report-to */
function collectDirectives() {
    var dirs = {};
    DIRECTIVES.forEach(function (d) {
        var ref = rowRefs[d.name];
        if (!ref || !ref.check.checked) return;
        var srcs = [];
        d.keywords.forEach(function (k) {
            if (kwActive[d.name][k]) srcs.push(k);
        });
        parseSourceList(ref.custom.value).forEach(function (s) {
            if (srcs.indexOf(s) === -1) srcs.push(s);
        });
        dirs[d.name] = srcs;
    });
    var ru = $("csb-report-uri");
    if (ru && ru.value.replace(/^\s+|\s+$/g, "")) {
        dirs["report-uri"] = parseSourceList(ru.value);
    }
    var rt = $("csb-report-to");
    if (rt && rt.value.replace(/^\s+|\s+$/g, "")) {
        dirs["report-to"] = parseSourceList(rt.value);
    }
    return dirs;
}

function setMsg(text, isError) {
    var m = $("csb-msg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "csb-msg" + (isError ? " csb-msg-error" : "");
}

function render() {
    var dirs;
    try {
        dirs = collectDirectives();
    } catch (e) {
        setMsg("解析失败：" + e.message, true);
        return;
    }
    var reportOnly = $("csb-report-only") && $("csb-report-only").checked;
    var header = buildCspHeader(dirs, { reportOnly: reportOnly });
    var value = header.value;
    var headerEl = $("csb-header-out");
    var metaEl = $("csb-meta-out");
    if (headerEl) headerEl.textContent = value ? header.name + ": " + value : "（尚未勾选任何指令）";
    if (metaEl) metaEl.textContent = value ? buildMetaTag(value) : "（尚未勾选任何指令）";
    var names = Object.keys(dirs);
    var empty = names.filter(function (n) { return dirs[n].length === 0 && n !== "report-uri" && n !== "report-to"; });
    if (empty.length > 0) {
        setMsg("提示：已勾选但未填写任何源的指令（" + empty.join("、") + "）会被忽略。");
    } else if (value) {
        setMsg("已生成 " + names.length + " 条指令" + (reportOnly ? "（Report-Only 测试模式：只上报、不拦截）" : "") + "。");
    } else {
        setMsg("勾选左侧指令、点关键字或填写自定义源，即可实时生成。");
    }
}

function clearAll() {
    DIRECTIVES.forEach(function (d) {
        var ref = rowRefs[d.name];
        if (!ref) return;
        ref.check.checked = false;
        ref.custom.value = "";
        kwActive[d.name] = {};
        var btns = ref.kwWrap.querySelectorAll(".csb-kw");
        for (var i = 0; i < btns.length; i++) btns[i].classList.remove("active");
    });
    if ($("csb-report-uri")) $("csb-report-uri").value = "";
    if ($("csb-report-to")) $("csb-report-to").value = "";
    if ($("csb-report-only")) $("csb-report-only").checked = false;
}

function applyPreset(p) {
    clearAll();
    Object.keys(p.directives).forEach(function (name) {
        var srcs = p.directives[name];
        if (name === "report-uri") {
            if ($("csb-report-uri")) $("csb-report-uri").value = srcs.join(" ");
            return;
        }
        if (name === "report-to") {
            if ($("csb-report-to")) $("csb-report-to").value = srcs.join(" ");
            return;
        }
        var ref = rowRefs[name];
        if (!ref) return;
        ref.check.checked = true;
        var def = null;
        for (var i = 0; i < DIRECTIVES.length; i++) {
            if (DIRECTIVES[i].name === name) { def = DIRECTIVES[i]; break; }
        }
        var customs = [];
        srcs.forEach(function (s) {
            if (def && def.keywords.indexOf(s) !== -1) {
                kwActive[name][s] = true;
            } else {
                customs.push(s);
            }
        });
        ref.custom.value = customs.join(" ");
        var btns = ref.kwWrap.querySelectorAll(".csb-kw");
        for (var j = 0; j < btns.length; j++) {
            if (kwActive[name][btns[j].getAttribute("data-kw")]) btns[j].classList.add("active");
        }
    });
    if ($("csb-report-only")) $("csb-report-only").checked = !!p.reportOnly;
    render();
    setMsg("已应用预设「" + p.label + "」。");
}

function buildPresetRow() {
    var host = $("csb-presets");
    if (!host) return;
    PRESETS.forEach(function (p) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "csb-btn";
        b.title = p.desc;
        b.textContent = p.label;
        b.addEventListener("click", function () { applyPreset(p); });
        host.appendChild(b);
    });
    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "csb-btn";
    clear.textContent = "全部清空";
    clear.addEventListener("click", function () { clearAll(); render(); setMsg("已清空。"); });
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
    buildDirectiveRows();
    buildPresetRow();
    var ro = $("csb-report-only");
    if (ro) ro.addEventListener("change", render);
    var ru = $("csb-report-uri");
    if (ru) ru.addEventListener("input", render);
    var rt = $("csb-report-to");
    if (rt) rt.addEventListener("input", render);
    var ch = $("csb-copy-header");
    if (ch) ch.addEventListener("click", function () {
        var t = $("csb-header-out").textContent;
        if (!t || t.charAt(0) === "（") { setMsg("暂无可复制的内容。", true); return; }
        copyText(t, "响应头已复制。");
    });
    var cm = $("csb-copy-meta");
    if (cm) cm.addEventListener("click", function () {
        var t = $("csb-meta-out").textContent;
        if (!t || t.charAt(0) === "（") { setMsg("暂无可复制的内容。", true); return; }
        copyText(t, "<meta> 片段已复制。");
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

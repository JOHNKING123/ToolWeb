/* 文本定宽换行器（text_fixed_width_wrapper）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/text_fixed_width_wrapper.test.js 自测；
 * 浏览器端：window.TextFixedWidthWrapper 全局 + DOM 装配（本文件末尾）。
 *
 * 列宽口径（按码点计，for...of 遍历，不按 UTF-16 码元计）：
 * - 半角字符计 1；全角／CJK 字符计 2，范围：
 *   U+1100–U+115F、U+2E80–U+9FFF、U+AC00–U+D7A3、U+F900–U+FAFF、
 *   U+FE30–U+FE4F、U+FF00–U+FF60、U+FFE0–U+FFE6；
 * - 其余码点（含表情符号等）计 1。
 *
 * 换行规则（逐原行独立处理，绝不跨原行合并）：
 * - 预处理：原行制表符转空格、行首行尾空白去掉、行内连续空白合并为单个空格；
 * - 空格优先：按单个空格切词贪心装行，当前行放不下时先输出当前行再起新行；
 *   单个词列宽大于列宽时按列宽单位硬切该词，余部继续参与贪心装行；
 * - 强制硬断：不看空格、纯按码点累积列宽切分，落在行首或行尾的空格直接丢弃；
 * - 两模式共同保证：输出任一行列宽均不超过设定列宽、无行首／行尾空格；
 *   空行只来自原文空行（保留开关开时原样保留，关时丢弃）。
 *
 * 真限制：只做按列宽机械换行，不做语义断句与中文分词优化；
 * 列宽口径为机械规则，不保证所有终端／字体等宽渲染一致；
 * 不合并、不改写原文内容。零 fetch／XHR：纯本地处理，不发起任何网络请求。
 */
(function () {
"use strict";

var SAMPLE = "在终端里排版一段长文本时，手动断行很容易对不齐：半角字符占一列、全角字符占两列，算错一格整段就歪了。This tool wraps your text by display width, so a verylongwordlikethisonewillbesplitautomatically and short words stay together on the same line.\n第二段同样会被独立处理，绝不会和上一段拼在一起：把这段话贴进等宽编辑器或代码注释里，每行的列宽都不超过你设定的上限。";

/* 码点是否为全角／CJK（计 2 列）。 */
function isWide(code) {
    return (code >= 0x1100 && code <= 0x115F) ||
        (code >= 0x2E80 && code <= 0x9FFF) ||
        (code >= 0xAC00 && code <= 0xD7A3) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0xFE30 && code <= 0xFE4F) ||
        (code >= 0xFF00 && code <= 0xFF60) ||
        (code >= 0xFFE0 && code <= 0xFFE6);
}

/* 单个码点（字符串，可能是代理对）的列宽。 */
function charWidth(ch) {
    return isWide(ch.codePointAt(0)) ? 2 : 1;
}

/* 字符串列宽：按码点累加。 */
function colWidth(str) {
    var w = 0;
    for (var ch of str) w += charWidth(ch);
    return w;
}

/* 钳制整数到 [min, max]；返回 {value, clamped}。非数值视为 min。 */
function clampInt(raw, min, max) {
    var n = parseInt(raw, 10);
    if (isNaN(n)) return { value: min, clamped: true };
    if (n < min) return { value: min, clamped: true };
    if (n > max) return { value: max, clamped: true };
    return { value: n, clamped: false };
}

/* 按列宽硬切一个词：返回每段列宽均不超过 width 的片段数组。
 * 切分点按码点累积列宽，单个码点最宽 2 列、列宽下限 10，故每段必非空。 */
function hardSplitWord(word, width) {
    var parts = [];
    var cur = "";
    var curW = 0;
    for (var ch of word) {
        var w = charWidth(ch);
        if (cur !== "" && curW + w > width) {
            parts.push(cur);
            cur = "";
            curW = 0;
        }
        cur += ch;
        curW += w;
    }
    if (cur !== "") parts.push(cur);
    return parts;
}

/* 原行预处理：制表符转空格、去行首行尾空白、行内连续空白合并为单个空格。 */
function normalizeLine(line) {
    return line.replace(/\t/g, " ").replace(/^ +| +$/g, "").replace(/ +/g, " ");
}

/* 单行空格优先换行：返回输出行数组（不含空行）。 */
function wrapLineSpaceFirst(line, width) {
    var out = [];
    var words = line === "" ? [] : line.split(" ");
    var cur = "";
    var curW = 0;
    function flush() {
        if (cur !== "") { out.push(cur); cur = ""; curW = 0; }
    }
    for (var i = 0; i < words.length; i++) {
        var word = words[i];
        var wordW = colWidth(word);
        if (wordW > width) {
            flush();
            var parts = hardSplitWord(word, width);
            for (var p = 0; p < parts.length - 1; p++) out.push(parts[p]);
            cur = parts[parts.length - 1];
            curW = colWidth(cur);
        } else if (cur === "") {
            cur = word;
            curW = wordW;
        } else if (curW + 1 + wordW <= width) {
            cur += " " + word;
            curW += 1 + wordW;
        } else {
            flush();
            cur = word;
            curW = wordW;
        }
    }
    flush();
    return out;
}

/* 单行强制硬断换行：返回输出行数组（不含空行，行首／行尾空格丢弃）。 */
function wrapLineHard(line, width) {
    var out = [];
    var cur = "";
    var curW = 0;
    for (var ch of line) {
        if (ch === " " && cur === "") continue;
        var w = charWidth(ch);
        if (cur !== "" && curW + w > width) {
            out.push(cur);
            cur = "";
            curW = 0;
            if (ch === " ") continue;
        }
        cur += ch;
        curW += w;
    }
    if (cur !== "") out.push(cur);
    return out;
}

/* 全文换行主入口（供 DOM 与测试共用）。
 * opts: {width（默认 40）, mode: "space" | "hard"（默认 space）, keepBlank（默认 true）}。
 * 空输入 -> ok:false + 「请粘贴或输入文本」；
 * 否则 ok:true + lines/output/inputChars/lineCount/maxWidth/width(clamp 结果)。 */
function processInput(text, opts) {
    opts = opts || {};
    if (!text || text.trim().length === 0) {
        return { ok: false, error: "请粘贴或输入文本", lines: [], output: "" };
    }
    var widthRes = clampInt(opts.width === undefined ? 40 : opts.width, 10, 200);
    var width = widthRes.value;
    var mode = opts.mode === "hard" ? "hard" : "space";
    var keepBlank = opts.keepBlank !== false;
    var lines = [];
    var rawLines = text.split(/\r?\n/);
    for (var i = 0; i < rawLines.length; i++) {
        var norm = normalizeLine(rawLines[i]);
        if (norm === "") {
            if (keepBlank) lines.push("");
            continue;
        }
        var wrapped = mode === "hard"
            ? wrapLineHard(norm, width)
            : wrapLineSpaceFirst(norm, width);
        for (var j = 0; j < wrapped.length; j++) lines.push(wrapped[j]);
    }
    var maxWidth = 0;
    for (var k = 0; k < lines.length; k++) {
        var lw = colWidth(lines[k]);
        if (lw > maxWidth) maxWidth = lw;
    }
    var inputChars = 0;
    for (var _ch of text) inputChars++;
    return {
        ok: true, error: "", lines: lines, output: lines.join("\n"),
        inputChars: inputChars, lineCount: lines.length, maxWidth: maxWidth,
        width: widthRes
    };
}

var api = {
    SAMPLE: SAMPLE,
    isWide: isWide,
    charWidth: charWidth,
    colWidth: colWidth,
    clampInt: clampInt,
    hardSplitWord: hardSplitWord,
    normalizeLine: normalizeLine,
    wrapLineSpaceFirst: wrapLineSpaceFirst,
    wrapLineHard: wrapLineHard,
    processInput: processInput
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
}
if (typeof window !== "undefined") {
    window.TextFixedWidthWrapper = api;
}

/* ================= 浏览器 DOM 装配（仅浏览器分支执行） ================= */
if (typeof document !== "undefined" && typeof window !== "undefined") {
    function $(id) { return document.getElementById(id); }
    var timer = null;
    var lastOutput = "";

    function readControls() {
        var widthRaw = $("fw-width") ? $("fw-width").value : 40;
        var widthRes = clampInt(widthRaw, 10, 200);
        if ($("fw-width") && String(widthRes.value) !== String(widthRaw)) $("fw-width").value = widthRes.value;
        var mode = "space";
        var radios = document.querySelectorAll('input[name="fw-mode"]');
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) mode = radios[i].value;
        }
        return {
            width: widthRes,
            mode: mode,
            keepBlank: $("fw-keep-blank") ? $("fw-keep-blank").checked : true
        };
    }

    function render() {
        var input = $("fw-input"), result = $("fw-result");
        var msg = $("fw-msg"), stats = $("fw-stats"), clampEl = $("fw-clamp");
        if (!input || !result) return;
        var ctl = readControls();
        if (clampEl) {
            clampEl.textContent = ctl.width.clamped
                ? "列宽超出范围，已钳制到 10–200 内（当前 " + ctl.width.value + "）"
                : "";
        }
        var res = processInput(input.value, {
            width: ctl.width.value, mode: ctl.mode, keepBlank: ctl.keepBlank
        });
        if (!res.ok) {
            result.textContent = "";
            lastOutput = "";
            if (msg) { msg.textContent = res.error; msg.className = "fw-msg fw-msg-error"; }
            if (stats) stats.textContent = "";
            return;
        }
        result.textContent = res.output;
        lastOutput = res.output;
        if (msg) { msg.textContent = "已按列宽 " + ctl.width.value + " 换行"; msg.className = "fw-msg fw-msg-ok"; }
        if (stats) {
            stats.textContent = "输入 " + res.inputChars + " 字 → 输出 " + res.lineCount +
                " 行，最长行 " + res.maxWidth + " 列";
        }
    }

    function scheduleRender() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(render, 300);
    }

    function copyResult() {
        var msg = $("fw-msg");
        if (!lastOutput) {
            if (msg) { msg.textContent = "没有可复制的结果：请先输入文本"; msg.className = "fw-msg fw-msg-error"; }
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
                if (ok) { msg.textContent = "已复制换行结果"; msg.className = "fw-msg fw-msg-ok"; }
                else { msg.textContent = "复制失败：浏览器未授权剪贴板，请手动全选结果区复制"; msg.className = "fw-msg fw-msg-error"; }
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lastOutput).then(function () {
                if (msg) { msg.textContent = "已复制换行结果"; msg.className = "fw-msg fw-msg-ok"; }
            }, fallback);
        } else {
            fallback();
        }
    }

    function downloadResult() {
        var msg = $("fw-msg");
        if (!lastOutput) {
            if (msg) { msg.textContent = "没有可下载的结果：请先输入文本"; msg.className = "fw-msg fw-msg-error"; }
            return;
        }
        try {
            var blob = new Blob([lastOutput], { type: "text/plain;charset=utf-8" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "wrapped.txt";
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            if (msg) { msg.textContent = "已下载 wrapped.txt"; msg.className = "fw-msg fw-msg-ok"; }
        } catch (e) {
            if (msg) { msg.textContent = "下载失败：浏览器不支持文件导出，请换浏览器重试"; msg.className = "fw-msg fw-msg-error"; }
        }
    }

    function bind(id, evt, fn) {
        var el = $(id);
        if (el) el.addEventListener(evt, fn);
    }
    bind("fw-input", "input", scheduleRender);
    bind("fw-width", "input", scheduleRender);
    bind("fw-width", "change", render);
    var modeRadios = document.querySelectorAll('input[name="fw-mode"]');
    for (var r = 0; r < modeRadios.length; r++) modeRadios[r].addEventListener("change", render);
    bind("fw-keep-blank", "change", render);
    bind("fw-copy", "click", copyResult);
    bind("fw-download", "click", downloadResult);
    bind("fw-sample", "click", function () {
        var input = $("fw-input");
        if (input) input.value = SAMPLE;
        render();
    });
    bind("fw-clear", "click", function () {
        var input = $("fw-input");
        if (input) input.value = "";
        render();
    });
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render);
    } else {
        render();
    }
}
})();

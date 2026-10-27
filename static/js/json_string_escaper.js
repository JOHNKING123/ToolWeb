/* JSON 字符串转义器（json_string_escaper）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/json_string_escaper.test.js 自测；
 * 浏览器端：window.JsonStringEscaper 全局 + DOM 装配（本文件末尾）。
 *
 * 转义口径默认与 JSON.stringify 一致：
 * " → \"、\ → \\、换行 → \n、回车 → \r、制表符 → \t、
 * 退格（U+0008）→ \b、换页（U+000C）→ \f、其余控制字符（U+0000–U+001F）→ \u00XX；
 * 中文等非 ASCII 默认原样保留，斜杠 / 默认原样保留。
 * 两个显式开关仅转义方向生效：转义非 ASCII 为 \uXXXX（按 UTF-16 码元逐个转义，
 * 代理对即拆成两个 \uXXXX）、转义斜杠为 \/。
 *
 * 反转义只认 JSON 字符串转义序列（\"、\\、\/、\n、\r、\t、\b、\f、\uXXXX，
 * 含代理对组合还原）；实现语义等价于对输入加双引号后 JSON.parse，
 * 但报错一律中文、不透传引擎原文。非法情形一律抛中文 Error，
 * 调用方须清空结果区、不输出半截结果：
 * 行尾孤立反斜杠、未转义的裸双引号、非法转义字母、截断的 \uXXXX、
 * \u 后非十六进制字符、输入中未转义的控制字符。
 * 零 fetch/XHR：纯本地字符串处理，不发起任何网络请求。
 */
(function () {
"use strict";

var SAMPLE = "他说：\"你好\"\n路径：C:\\temp\\test.txt\t完成";
var SAMPLE_ESCAPED = "他说：\\\"你好\\\"\\n路径：C:\\\\temp\\\\test.txt\\t完成";

function hex4(code) {
    var s = code.toString(16);
    while (s.length < 4) s = "0" + s;
    return s;
}

function escapeJsonString(text, opts) {
    opts = opts || {};
    var escapeNonAscii = !!opts.escapeNonAscii;
    var escapeSlash = !!opts.escapeSlash;
    var out = [];
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        var code = text.charCodeAt(i);
        if (ch === '"') out.push('\\"');
        else if (ch === "\\") out.push("\\\\");
        else if (ch === "\n") out.push("\\n");
        else if (ch === "\r") out.push("\\r");
        else if (ch === "\t") out.push("\\t");
        else if (code === 0x08) out.push("\\b");
        else if (code === 0x0C) out.push("\\f");
        else if (code < 0x20) out.push("\\u" + hex4(code));
        else if (ch === "/" && escapeSlash) out.push("\\/");
        else if (escapeNonAscii && code > 0x7F) out.push("\\u" + hex4(code));
        else out.push(ch);
    }
    return out.join("");
}

function unescapeJsonString(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        var code = text.charCodeAt(i);
        if (ch === '"') {
            throw new Error("反转义失败：第 " + (i + 1) + " 个字符是未转义的双引号，请将其写成 \\\" 后再试");
        }
        if (code < 0x20) {
            throw new Error("反转义失败：第 " + (i + 1) + " 个字符是未转义的控制字符，JSON 字符串里控制字符须写成转义序列（如换行写成 \\n）");
        }
        if (ch !== "\\") { out.push(ch); continue; }
        if (i + 1 >= text.length) {
            throw new Error("反转义失败：输入以反斜杠结尾，行尾反斜杠没有后续字符可转义，请补全转义序列或删除该反斜杠");
        }
        var next = text.charAt(i + 1);
        if (next === '"') { out.push('"'); i++; }
        else if (next === "\\") { out.push("\\"); i++; }
        else if (next === "/") { out.push("/"); i++; }
        else if (next === "n") { out.push("\n"); i++; }
        else if (next === "r") { out.push("\r"); i++; }
        else if (next === "t") { out.push("\t"); i++; }
        else if (next === "b") { out.push("\b"); i++; }
        else if (next === "f") { out.push("\f"); i++; }
        else if (next === "u") {
            var hex = text.substr(i + 2, 4);
            if (hex.length < 4) {
                throw new Error("反转义失败：第 " + (i + 1) + " 个字符起的 \\u 转义不完整，\\u 后须跟 4 位十六进制数字");
            }
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                throw new Error("反转义失败：第 " + (i + 1) + " 个字符起的 \\u 转义含非十六进制字符，\\u 后须跟 4 位十六进制数字");
            }
            out.push(String.fromCharCode(parseInt(hex, 16)));
            i += 5;
        } else {
            throw new Error("反转义失败：第 " + (i + 2) + " 个字符是非法转义字母 \\" + next + "，JSON 字符串只认 \\\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX");
        }
    }
    return out.join("");
}

/* direction: "escape" | "unescape"。空输入返回 ok:false + 中文提示；
 * 反转义非法返回 ok:false + 中文报错，value 恒为空串（不输出半截结果）。 */
function processText(text, direction, opts) {
    if (text.length === 0) {
        return { ok: false, value: "", error: "请粘贴或输入文本" };
    }
    if (direction === "unescape") {
        try {
            return { ok: true, value: unescapeJsonString(text), error: "" };
        } catch (e) {
            return { ok: false, value: "", error: e.message };
        }
    }
    return { ok: true, value: escapeJsonString(text, opts), error: "" };
}

var api = {
    SAMPLE: SAMPLE,
    SAMPLE_ESCAPED: SAMPLE_ESCAPED,
    escapeJsonString: escapeJsonString,
    unescapeJsonString: unescapeJsonString,
    processText: processText
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
}
if (typeof window !== "undefined") {
    window.JsonStringEscaper = api;
}

/* ================= 浏览器 DOM 装配（仅浏览器分支执行） ================= */
if (typeof document !== "undefined" && typeof window !== "undefined") {
    function $(id) { return document.getElementById(id); }
    function render() {
        var input = $("jse-input");
        var result = $("jse-result");
        var msg = $("jse-msg");
        var counts = $("jse-counts");
        if (!input || !result) return;
        var direction = "escape";
        var radios = document.querySelectorAll('input[name="jse-direction"]');
        for (var r = 0; r < radios.length; r++) {
            if (radios[r].checked) direction = radios[r].value;
        }
        var opts = {
            escapeNonAscii: !!($("jse-nonascii") && $("jse-nonascii").checked),
            escapeSlash: !!($("jse-slash") && $("jse-slash").checked)
        };
        var nonascii = $("jse-nonascii");
        var slash = $("jse-slash");
        var disabled = direction === "unescape";
        if (nonascii) nonascii.disabled = disabled;
        if (slash) slash.disabled = disabled;
        var hint = $("jse-switch-hint");
        if (hint) hint.textContent = disabled
            ? "两个开关仅转义方向生效：反转义时 \\uXXXX 与 \\/ 两种写法均可还原，无须开开关。"
            : "两个开关仅转义方向生效：默认均关闭（中文与斜杠原样保留）。";
        var res = processText(input.value, direction, opts);
        result.value = res.value;
        if (msg) {
            if (res.ok) {
                msg.textContent = direction === "escape" ? "转义完成，可一键复制结果。" : "反转义完成，可一键复制结果。";
                msg.className = "jse-msg jse-msg-ok";
            } else {
                msg.textContent = res.error;
                msg.className = "jse-msg jse-msg-error";
            }
        }
        if (counts) {
            counts.textContent = res.ok
                ? "输入 " + input.value.length + " 字 → 输出 " + res.value.length + " 字"
                : "输入 " + input.value.length + " 字 → 输出 0 字";
        }
    }
    function copyResult() {
        var result = $("jse-result");
        var msg = $("jse-msg");
        if (!result || result.value === "") {
            if (msg) {
                msg.textContent = "没有可复制的结果：请先输入文本并得到转义／反转义结果";
                msg.className = "jse-msg jse-msg-error";
            }
            return;
        }
        var text = result.value;
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            if (msg) {
                if (ok) { msg.textContent = "已复制结果"; msg.className = "jse-msg jse-msg-ok"; }
                else { msg.textContent = "复制失败：浏览器未授权剪贴板，请手动全选结果区复制"; msg.className = "jse-msg jse-msg-error"; }
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                if (msg) { msg.textContent = "已复制结果"; msg.className = "jse-msg jse-msg-ok"; }
            }, fallback);
        } else {
            fallback();
        }
    }
    function init() {
        var input = $("jse-input");
        if (!input) return;
        input.addEventListener("input", render);
        var radios = document.querySelectorAll('input[name="jse-direction"]');
        for (var i = 0; i < radios.length; i++) radios[i].addEventListener("change", render);
        ["jse-nonascii", "jse-slash"].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener("change", render);
        });
        var sample = $("jse-sample");
        if (sample) sample.addEventListener("click", function () {
            var direction = "escape";
            var rs = document.querySelectorAll('input[name="jse-direction"]');
            for (var k = 0; k < rs.length; k++) if (rs[k].checked) direction = rs[k].value;
            input.value = direction === "unescape" ? SAMPLE_ESCAPED : SAMPLE;
            render();
        });
        var clear = $("jse-clear");
        if (clear) clear.addEventListener("click", function () { input.value = ""; render(); input.focus(); });
        var copy = $("jse-copy");
        if (copy) copy.addEventListener("click", copyResult);
        render();
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}

})();

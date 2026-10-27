/* JSON 字符串转义器（json_string_escaper）纯逻辑单元测试（零依赖）：
 * node tests/json_string_escaper.test.js
 * 覆盖：转义表全项、反转义全项、规格示例双向往返、双开关开／关组合、
 * 非法输入中文报错且无半截输出、空输入、注册（193→194 Path）与零网络请求静态检查、
 * 模板真限制文案与互链（仅 JSON 解析器，不含未交付工具）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var J = require("../static/js/json_string_escaper.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "json_string_escaper.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "json_string_escaper.html"), "utf8");
var GO = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throwsCn(fn, name) {
    try { fn(); ok(false, name + "（应抛中文错误却未抛）"); }
    catch (e) { ok(/[\u4e00-\u9fff]/.test(e.message), name + "（错误信息应为中文，实得 " + e.message + "）"); }
}

/* ---------- 1. 转义向量（JSON.stringify 口径） ---------- */
eq(J.escapeJsonString('a"b'), 'a\\"b', "转义：双引号");
eq(J.escapeJsonString("a\nb"), "a\\nb", "转义：真实换行 → \\n");
eq(J.escapeJsonString("a\tb"), "a\\tb", "转义：制表符 → \\t");
eq(J.escapeJsonString("a\rb"), "a\\rb", "转义：回车 → \\r");
eq(J.escapeJsonString("a\bb"), "a\\bb", "转义：退格 → \\b");
eq(J.escapeJsonString("a\fb"), "a\\fb", "转义：换页 → \\f");
eq(J.escapeJsonString("C:\\temp"), "C:\\\\temp", "转义：反斜杠加倍 C:\\temp");
eq(J.escapeJsonString("a\u0001b"), "a\\u0001b", "转义：其余控制字符 → \\u00XX");
eq(J.escapeJsonString("a\u000bb"), "a\\u000bb", "转义：垂直制表符 → \\u000b");
eq(J.escapeJsonString("你好"), "你好", "转义：中文默认原样保留");
eq(J.escapeJsonString("a/b"), "a/b", "转义：斜杠默认原样保留");
eq(J.escapeJsonString(""), "", "转义：空串 → 空串");
eq(J.escapeJsonString("plain"), "plain", "转义：纯文本原样");
/* 与 JSON.stringify 逐项等价（单字符串内容层，不含外层引号） */
["a\"b", "x\ny\tz", "C:\\a\\b", "你好", "a/b", "\u0001\u001f"].forEach(function (s) {
    var mine = J.escapeJsonString(s);
    var ref = JSON.stringify(s).slice(1, -1);
    eq(mine, ref, "转义与 JSON.stringify 一致：" + JSON.stringify(s));
});

/* ---------- 2. 规格示例 ---------- */
eq(J.SAMPLE, "他说：\"你好\"\n路径：C:\\temp\\test.txt\t完成", "示例：原文含中文引号、真实换行、反斜杠路径、制表符");
eq(J.escapeJsonString(J.SAMPLE), J.SAMPLE_ESCAPED, "示例：转义结果与内置转义示例一致");
has(J.SAMPLE_ESCAPED, "\\\"", "示例：转义后引号已转义");
has(J.SAMPLE_ESCAPED, "\\n", "示例：转义后换行已转义");
has(J.SAMPLE_ESCAPED, "\\\\temp", "示例：转义后反斜杠已加倍");
has(J.SAMPLE_ESCAPED, "\\t", "示例：转义后制表符已转义");
has(J.SAMPLE_ESCAPED, "你好", "示例：转义后中文原样保留");

/* ---------- 3. 反转义与往返 ---------- */
eq(J.unescapeJsonString('a\\"b\\nc'), 'a"b\nc', "反转义：\\\" 与 \\n 还原");
eq(J.unescapeJsonString("a\\/b"), "a/b", "反转义：\\/ 还原为斜杠");
eq(J.unescapeJsonString("a\\tb\\rb\\bc\\f"), "a\tb\rb\bc\f", "反转义：\\t \\r \\b \\f 还原");
eq(J.unescapeJsonString("a\\u4f60b"), "a你b", "反转义：\\uXXXX 还原中文");
eq(J.unescapeJsonString("a\\\\b"), "a\\b", "反转义：\\\\ 还原为单反斜杠");
eq(J.unescapeJsonString(J.SAMPLE_ESCAPED), J.SAMPLE, "往返：规格示例转义结果反转义后与原文逐字一致");
eq(J.unescapeJsonString(J.escapeJsonString(J.SAMPLE)), J.SAMPLE, "往返：原文 → 转义 → 反转义逐字一致");
eq(J.escapeJsonString(J.unescapeJsonString(J.SAMPLE_ESCAPED)), J.SAMPLE_ESCAPED, "往返：转义结果 → 反转义 → 再转义逐字一致");

/* ---------- 4. 双开关开／关组合 ---------- */
eq(J.escapeJsonString("你好", { escapeNonAscii: true }), "\\u4f60\\u597d", "开关：非 ASCII 开时你好 → \\u4f60\\u597d");
eq(J.escapeJsonString("你好", { escapeNonAscii: false }), "你好", "开关：非 ASCII 关时中文原样保留");
eq(J.escapeJsonString("你好", {}), "你好", "开关：默认（均关）中文原样保留");
eq(J.escapeJsonString("/", { escapeSlash: true }), "\\/", "开关：斜杠开时 / → \\/");
eq(J.escapeJsonString("/", { escapeSlash: false }), "/", "开关：斜杠关时原样保留");
eq(J.escapeJsonString("a/b你好", { escapeNonAscii: true, escapeSlash: true }), "a\\/b\\u4f60\\u597d", "开关：双开组合");
eq(J.unescapeJsonString("\\u4f60\\u597d"), "你好", "开关：反转义 \\u 写法可还原（无须开开关）");
eq(J.unescapeJsonString("a\\/b"), "a/b", "开关：反转义 \\/ 写法可还原（无须开开关）");
eq(J.unescapeJsonString(J.escapeJsonString("a/b你好\nx", { escapeNonAscii: true, escapeSlash: true })), "a/b你好\nx", "往返：双开关开组合往返一致");
eq(J.unescapeJsonString(J.escapeJsonString("a/b你好\nx", { escapeNonAscii: false, escapeSlash: false })), "a/b你好\nx", "往返：双开关关组合往返一致");
eq(J.processText("你好", "unescape", { escapeNonAscii: true }).value, "你好", "开关：反转义方向忽略开关（原文无转义序列时原样）");

/* ---------- 5. 非法输入：中文报错且无半截输出 ---------- */
throwsCn(function () { J.unescapeJsonString("abc\\"); }, "非法：行尾孤立反斜杠抛中文错");
throwsCn(function () { J.unescapeJsonString('a"b'); }, "非法：裸双引号抛中文错");
throwsCn(function () { J.unescapeJsonString("a\\qb"); }, "非法：非法转义字母 \\q 抛中文错");
throwsCn(function () { J.unescapeJsonString("a\\u12"); }, "非法：截断的 \\uXXXX 抛中文错");
throwsCn(function () { J.unescapeJsonString("a\\u12xz"); }, "非法：\\u 后非十六进制字符抛中文错");
throwsCn(function () { J.unescapeJsonString("a\nb"); }, "非法：未转义的真实换行抛中文错");
var bad = J.processText("ok\\", "unescape", {});
eq(bad.ok, false, "非法：processText 标记失败");
eq(bad.value, "", "非法：processText 结果为空串、无半截输出");
has(bad.error, "反斜杠", "非法：processText 错误信息中文说明反斜杠问题");
var badQuote = J.processText('a"b', "unescape", {});
eq(badQuote.value, "", "非法：裸双引号 processText 无半截输出");

/* ---------- 6. 空输入与 processText ---------- */
var empty = J.processText("", "escape", {});
eq(empty.ok, false, "空输入：processText 标记失败");
eq(empty.value, "", "空输入：结果为空串");
eq(empty.error, "请粘贴或输入文本", "空输入：中文提示「请粘贴或输入文本」");
eq(J.processText("a\nb", "escape", {}).value, "a\\nb", "processText：转义方向正常输出");
eq(J.processText("a\\nb", "unescape", {}).value, "a\nb", "processText：反转义方向正常输出");

/* ---------- 7. 注册（193→194 Path） ---------- */
has(GO, '"json_string_escaper"', "注册：categories.go 含 ID json_string_escaper");
has(GO, '"/tools/json-string-escaper"', "注册：categories.go 含 Path /tools/json-string-escaper");
has(GO, "JSON 字符串转义器", "注册：categories.go 含名称 JSON 字符串转义器");
var pathMatches = GO.match(/"\/tools\/[^"]+"/g) || [];
var uniquePaths = {};
pathMatches.forEach(function (p) { uniquePaths[p] = true; });
eq(Object.keys(uniquePaths).length, 194, "注册：去重 Path 总数 193→194（实得 " + Object.keys(uniquePaths).length + "）");

/* ---------- 8. 零网络静态检查 ---------- */
notHas(SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL, "fetch(", "零网络：模板无 fetch 调用");
notHas(TPL, "XMLHttpRequest", "零网络：模板无 XHR");
var extScripts = (TPL.match(/<script[^>]+src="https?:\/\/[^"]+"/g) || []).length;
eq(extScripts, 0, "零外部脚本：模板无 https 外部 script");

/* ---------- 9. 模板：真限制文案、互链与控件 ---------- */
has(TPL, "只做字符串层面的转义与反转义、不做整份 JSON 格式化与校验", "真限制：模板含只做字符串层转义文案");
has(TPL, "默认与 JSON.stringify 一致", "真限制：模板含默认口径文案");
has(TPL, "中文与斜杠默认不转义", "真限制：模板含中文与斜杠默认不转义文案");
has(TPL, "https://www.johnkingzcq123.xyz/tools/json-string-escaper", "SEO：模板含 canonical 链接");
has(TPL, "/tools/json-parser", "互链：模板含 JSON 解析器");
has(TPL, "jse-input", "模板：含原文本输入框");
has(TPL, "jse-result", "模板：含结果区");
has(TPL, "jse-copy", "模板：含复制按钮");
has(TPL, "jse-sample", "模板：含载入示例按钮");
has(TPL, "jse-clear", "模板：含清空按钮");
has(SRC, "复制失败", "JS：复制失败有降级提示文案");
notHas(TPL, "wordcloud", "互链：不含未交付词云生成器");
notHas(TPL, "text-fixed-width", "互链：不含未交付文本定宽换行器");

console.log("json_string_escaper: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
